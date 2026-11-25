// All Firebase AI Logic calls live here. Every call is timed and its inference source logged.
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, Schema } from "firebase/ai";
import { app } from "./firebase.js";
import { VOCAB as ALLOWED } from "./privacy.js";

export const ai = getAI(app, { backend: new GoogleAIBackend() });

// ---------- Schema for on-device extraction ----------
const incidentSchema = Schema.object({
  properties: {
    equipment_type: Schema.enumString({ enum: ALLOWED.equipment_type }),
    symptoms: Schema.array({ items: Schema.enumString({ enum: ALLOWED.symptoms }) }),
    trigger: Schema.enumString({ enum: ALLOWED.trigger }),
    cause_category: Schema.enumString({ enum: ALLOWED.cause_category }),
    status: Schema.enumString({ enum: ALLOWED.status }),
    resolution_category: Schema.enumString({ enum: ALLOWED.resolution_category }),
    downtime_minutes: Schema.integer(),
    safety_flag: Schema.boolean(),
  },
});

const EXTRACT_SYSTEM = `You classify messy factory shift notes into fixed categories.
Rules:
- Only use facts stated in the note. Never invent a diagnosis.
- cause_category is "unknown" unless the note says the cause was confirmed.
- downtime_minutes is 0 if not stated.
- resolution_category is "none" unless the note says the problem was fixed AND what was done to fix it.
- safety_flag is true ONLY if the note explicitly mentions injury, near-miss, fire, smoke,
  electrical shock, guard removed, or danger to people. Equipment problems alone are NOT safety issues.
Example: "Conveyor jammed at start of shift, cleared in 10 min, cause unknown" →
equipment_type conveyor, symptoms [jam], trigger startup, cause_category unknown, status resolved,
downtime_minutes 10, safety_flag false.`;

// PRIVATE model: raw notes never leave the device. No cloud fallback.
const privateModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
  onDeviceParams: {
    createOptions: {
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
      initialPrompts: [{ role: "system", content: [{ type: "text", value: EXTRACT_SYSTEM }] }],
    },
    promptOptions: { responseConstraint: incidentSchema },
  },
});

// SHAREABLE model: non-sensitive inputs only (fingerprints, card text). Falls back to the
// cloud on devices without Gemini Nano, e.g. the Pixel 10a.
export const shareableModel = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,
  inCloudParams: { model: "gemini-3.5-flash-lite" },
});

// ADVICE model: combines a shared knowledge card with the operator's PRIVATE note,
// so it is on-device only. No cloud fallback.
const ADVICE_SYSTEM = `You help a factory operator act on a known failure pattern.
You get the operator's own note and a numbered list of checks from a knowledge card.
Choose which numbered check to do FIRST. Skip checks the note says were already done.
Prefer the check that matches what the operator observed (for example a loose belt points to the belt check).
reason: one short sentence that refers to the note. record_next_time: one short thing to write down next time.`;
const adviceSchema = Schema.object({
  properties: {
    first_check: Schema.enumString({ enum: ["1", "2", "3"] }),
    reason: Schema.string(),
    record_next_time: Schema.string(),
  },
});
const adviceModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
  onDeviceParams: {
    createOptions: {
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
      initialPrompts: [{ role: "system", content: [{ type: "text", value: ADVICE_SYSTEM }] }],
    },
    promptOptions: { responseConstraint: adviceSchema },
  },
});

// ---------- Telemetry (kept in this browser for the hybrid audit) ----------
// input: what kind of data the call carried: "raw_note" (private), "fingerprints" (shareable)
const TELEMETRY_KEY = "ss_telemetry";
export function loadTelemetry() {
  try { return JSON.parse(localStorage.getItem(TELEMETRY_KEY)) || []; } catch { return []; }
}
export async function timed(task, model, prompt, input = "fingerprints") {
  const t0 = performance.now();
  const result = await model.generateContent(prompt);
  const ms = Math.round(performance.now() - t0);
  const source = String(result.response.inferenceSource ?? "unknown").toUpperCase();
  const entry = { task, source, input, ms, at: Date.now() };
  const all = loadTelemetry();
  all.push(entry);
  localStorage.setItem(TELEMETRY_KEY, JSON.stringify(all.slice(-500)));
  window.dispatchEvent(new CustomEvent("ss-telemetry", { detail: entry }));
  return result.response.text();
}

// ---------- Public API ----------
/** Must be called from a user click (Chrome requires user activation for the download). */
export function prepareDeviceModel(onProgress) {
  return privateModel.initializeDeviceModel((p) => onProgress?.(Math.round(p * 100)));
}

/** Run one tiny private extraction so the first real note is not the slow, cold one. */
export async function warmUp() {
  const t0 = performance.now();
  await privateModel.generateContent("Shift note:\nConveyor jammed at startup, cleared in 5 min.");
  return Math.round(performance.now() - t0);
}

export async function extractIncident(note) {
  const text = await timed("extract_incident", privateModel, `Shift note:\n${note}`, "raw_note");
  return JSON.parse(text);
}

/** On-device only: combines the PRIVATE note with a shared card. Returns a check number from the card. */
export async function tailorAdvice(note, card) {
  const checks = (card.suggested_first_checks || []).slice(0, 3);
  const list = checks.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const text = await timed("tailor_advice", adviceModel, `OPERATOR NOTE:\n${note}\n\nCHECKS:\n${list}`, "raw_note");
  const out = JSON.parse(text);
  const idx = Number(out.first_check) - 1;
  if (!(idx >= 0 && idx < checks.length)) throw new Error("advice pointed at a check that does not exist");
  return { index: idx, check: checks[idx], reason: out.reason, record: out.record_next_time };
}
