// Live benchmark harness. Runs the REAL models on fictional, labelled notes (data/bench-notes.json)
// and stores measured results locally. Nothing here is estimated: if a benchmark has not been run,
// the Evaluation Lab shows "not tested".
import BENCH from "../data/bench-notes.json";
import { verifyIncident, buildFingerprint } from "./privacy.js";
import { median, percentile, mean } from "./stats.js";

export const NOTES = BENCH.notes;
const KEY = "ss_bench_results";
export const loadResults = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const saveResults = (r) => localStorage.setItem(KEY, JSON.stringify(r));
export const clearResults = () => localStorage.removeItem(KEY);

const FIELDS = ["equipment_type", "trigger", "cause_category", "status", "resolution_category"];
const jaccard = (a = [], b = []) => {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 1;
  let i = 0;
  for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i);
};

/** Score one extraction against its label. Pure; used by both the browser and the Node tests. */
export function scoreExtraction(label, out) {
  const fields = {};
  for (const f of FIELDS) fields[f] = out?.[f] === label[f] ? 1 : 0;
  fields.symptoms = jaccard(label.symptoms, out?.symptoms);
  fields.downtime = Math.abs((Number(out?.downtime_minutes) || 0) - label.downtime_minutes) <= Math.max(2, label.downtime_minutes * 0.1) ? 1 : 0;
  const accuracy = mean(Object.values(fields));
  return {
    fields,
    accuracy,
    hallucinatedCause: label.cause_category === "unknown" && out?.cause_category && out.cause_category !== "unknown",
    hallucinatedFix: label.resolution_category === "none" && out?.resolution_category && out.resolution_category !== "none",
  };
}

/** Code checks applied to a "perfect" model answer: measures whether the rules ever break correct output. */
export function verifierOnLabels() {
  return NOTES.map((n) => {
    const raw = { ...n.label, safety_flag: n.label.safety_status === "flagged" };
    const { incident, corrections } = verifyIncident(raw, n.note);
    const s = scoreExtraction(n.label, incident);
    return { id: n.id, accuracy: s.accuracy, safetyOk: incident.safety_status === n.label.safety_status, corrections };
  });
}

/**
 * Run a model over the notes.
 * extract: async (note) => raw model output    (ai.extractIncident or ai.extractSyntheticInCloud)
 */
export async function runBenchmark(name, extract, { split = "heldout", onProgress } = {}) {
  const notes = NOTES.filter((n) => split === "all" || n.split === split);
  const rows = [];
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    onProgress?.(i, notes.length, n.id);
    const t0 = performance.now();
    try {
      const raw = await extract(n.note);
      const ms = Math.round(performance.now() - t0);
      const { incident } = verifyIncident(raw, n.note);
      const fp = buildFingerprint(incident, "site_benchmrk");
      const json = JSON.stringify(fp);
      rows.push({
        id: n.id, tags: n.tags, ms, ok: true, online: navigator.onLine,
        raw: scoreExtraction(n.label, raw),
        checked: scoreExtraction(n.label, incident),
        safetyOk: incident.safety_status === n.label.safety_status,
        leaked: n.secrets.filter((s) => json.includes(s)),
      });
    } catch (e) {
      rows.push({ id: n.id, tags: n.tags, ms: Math.round(performance.now() - t0), ok: false, online: navigator.onLine, error: String(e.message || e).slice(0, 160) });
    }
  }
  onProgress?.(notes.length, notes.length, "");
  const ok = rows.filter((r) => r.ok);
  const lat = ok.map((r) => r.ms);
  const summary = {
    name, split, at: Date.now(), n: notes.length, completed: ok.length,
    offlineAttempts: rows.filter((r) => !r.online).length,
    offlineCompleted: ok.filter((r) => !r.online).length,
    rawAccuracy: mean(ok.map((r) => r.raw.accuracy)),
    checkedAccuracy: mean(ok.map((r) => r.checked.accuracy)),
    rawHallucinatedCause: ok.filter((r) => r.raw.hallucinatedCause).length,
    checkedHallucinatedCause: ok.filter((r) => r.checked.hallucinatedCause).length,
    rawHallucinatedFix: ok.filter((r) => r.raw.hallucinatedFix).length,
    checkedHallucinatedFix: ok.filter((r) => r.checked.hallucinatedFix).length,
    safetyCorrect: ok.filter((r) => r.safetyOk).length,
    secretsPlanted: notes.reduce((t, n) => t + n.secrets.length, 0),
    secretsLeaked: ok.reduce((t, r) => t + r.leaked.length, 0),
    fieldAccuracy: Object.fromEntries(["equipment_type", "symptoms", "trigger", "cause_category", "status", "resolution_category", "downtime"].map((f) => [f, mean(ok.map((r) => r.checked.fields[f]))])),
    medianMs: median(lat),
    p95Ms: percentile(lat, 95),
    firstMs: ok[0]?.ms ?? null,
    rows,
  };
  const all = loadResults();
  all[name] = summary;
  saveResults(all);
  return summary;
}
