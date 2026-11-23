// All Firebase AI Logic calls live here. Every call is timed and its inference source logged.
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, Schema } from "firebase/ai";
import { app } from "./firebase.js";
import { VOCAB as ALLOWED } from "./privacy.js";

const ai = getAI(app, { backend: new GoogleAIBackend() });

// ---------- Schema for on-device extraction ----------
const incidentSchema = Schema.object({
  properties: {
    equipment_type: Schema.enumString({ enum: ALLOWED.equipment_type }),
    symptoms: Schema.array({ items: Schema.enumString({ enum: ALLOWED.symptoms }) }),
    trigger: Schema.enumString({ enum: ALLOWED.trigger }),
    cause_category: Schema.enumString({ enum: ALLOWED.cause_category }),
    status: Schema.enumString({ enum: ALLOWED.status }),
    downtime_minutes: Schema.integer(),
    safety_flag: Schema.boolean(),
  },
});

const EXTRACT_SYSTEM = `You classify messy factory shift notes into fixed categories.
Rules:
- Only use facts stated in the note. Never invent a diagnosis.
- cause_category is "unknown" unless the note says the cause was confirmed.
- downtime_minutes is 0 if not stated.
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

// CLOUD model: only ever receives fingerprints (allowlisted enums). Used from Day 3.
export const cloudModel = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD });

// SHAREABLE model: non-sensitive tasks, falls back to cloud on unsupported devices.
export const shareableModel = getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE });

// ---------- Telemetry ----------
export const telemetry = [];
async function timed(task, model, prompt) {
  const t0 = performance.now();
  const result = await model.generateContent(prompt);
  const ms = Math.round(performance.now() - t0);
  const entry = { task, source: result.response.inferenceSource ?? "unknown", ms, at: Date.now() };
  telemetry.push(entry);
  window.dispatchEvent(new CustomEvent("ss-telemetry", { detail: entry }));
  return result.response.text();
}

// ---------- Public API ----------
/** Must be called from a user click (Chrome requires user activation for the download). */
export function prepareDeviceModel(onProgress) {
  return privateModel.initializeDeviceModel((p) => onProgress?.(Math.round(p * 100)));
}

export async function extractIncident(note) {
  const text = await timed("extract_incident", privateModel, `Shift note:\n${note}`);
  return JSON.parse(text);
}
