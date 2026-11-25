// Privacy boundary + deterministic verification.
// Principle: the AI proposes, plain code verifies. Nothing free-text ever reaches a fingerprint.
import VOCAB from "../shared/vocabulary.json";

export { VOCAB };
export const SCHEMA_VERSION = VOCAB.schema_version;
const ENUM_KEYS = ["equipment_type", "process", "symptoms", "trigger", "cause_category", "status", "downtime_bucket", "resolution_category"];

const pick = (value, list) =>
  list.includes(value) ? value : list.includes("other") ? "other" : "unknown";

const hasAny = (text, words) => words.some((w) => text.includes(w));

/** Pull a downtime figure straight from the note, if one is written there. */
export function parseDowntime(note) {
  const t = note.toLowerCase();
  const h = t.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  const m = t.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/);
  let total = null;
  if (h) total = Math.round(parseFloat(h[1]) * 60);
  if (m) total = (total ?? 0) + parseInt(m[1], 10);
  return total;
}

/**
 * Check the on-device model's output against the raw note with fixed rules.
 * Returns the corrected incident plus a list of corrections to show the operator.
 */
export function verifyIncident(raw, note) {
  const text = note.toLowerCase();
  const inc = { ...raw };
  const corrections = [];
  const fix = (field, to, why) => {
    if (JSON.stringify(inc[field]) !== JSON.stringify(to)) {
      corrections.push({ field, from: inc[field], to, why });
      inc[field] = to;
    }
  };

  if (inc.resolution_category == null) inc.resolution_category = "none";
  // Enums: anything outside the vocabulary becomes other/unknown.
  for (const key of ["equipment_type", "trigger", "cause_category", "status", "resolution_category"]) {
    fix(key, pick(inc[key], VOCAB[key]), "value not in vocabulary");
  }
  const cleanSymptoms = [...new Set((inc.symptoms || []).map((s) => pick(s, VOCAB.symptoms)))].sort();
  const before = [...(inc.symptoms || [])].sort();
  if (JSON.stringify(before) === JSON.stringify(cleanSymptoms)) inc.symptoms = cleanSymptoms; // order only
  else fix("symptoms", cleanSymptoms, "symptom not in vocabulary");

  // Cause: only allowed if the note says the cause was actually found.
  if (inc.cause_category !== "unknown" && !hasAny(text, VOCAB.cause_confirmation_keywords)) {
    fix("cause_category", "unknown", "note does not say a cause was confirmed");
  }

  // Resolution: only if the problem is resolved AND the note says what was done.
  if (inc.resolution_category !== "none") {
    if (inc.status !== "resolved") fix("resolution_category", "none", "a fix only counts once the problem is resolved");
    else if (!hasAny(text, VOCAB.fix_keywords)) fix("resolution_category", "none", "note does not say what fixed it");
  }

  // Safety: decided by explicit keywords in the note, not by the model.
  fix("safety_flag", hasAny(text, VOCAB.safety_keywords), "safety is set only by explicit safety words in the note");

  // Downtime: if the note states a number, the number wins.
  const stated = parseDowntime(note);
  if (stated !== null) fix("downtime_minutes", stated, "downtime taken from the number written in the note");
  else if (!Number.isFinite(inc.downtime_minutes) || inc.downtime_minutes < 0) fix("downtime_minutes", 0, "no downtime stated");

  return { incident: inc, corrections };
}

export function downtimeBucket(minutes) {
  const m = Number(minutes) || 0;
  if (m <= 0) return "none";
  if (m < 15) return "under_15m";
  if (m <= 60) return "15_60m";
  if (m <= 240) return "1_4h";
  return "over_4h";
}

/** Build the shareable fingerprint. Only allowlisted values can make it through. */
export function buildFingerprint(incident, siteToken, { resolutionVerified = false } = {}) {
  const equipment = pick(incident.equipment_type, VOCAB.equipment_type);
  const fp = {
    schema_version: SCHEMA_VERSION,
    equipment_type: equipment,
    process: VOCAB.equipment_process[equipment] ?? "other",
    symptoms: [...new Set((incident.symptoms || []).map((s) => pick(s, VOCAB.symptoms)))].sort(),
    trigger: pick(incident.trigger, VOCAB.trigger),
    cause_category: pick(incident.cause_category, VOCAB.cause_category),
    status: pick(incident.status, VOCAB.status),
    downtime_bucket: downtimeBucket(incident.downtime_minutes),
    resolution_category: pick(incident.resolution_category ?? "none", VOCAB.resolution_category),
    resolution_verified: false,
    safety_flag: incident.safety_flag === true,
    site_token: siteToken,
  };
  // An operator can only vouch for a fix that exists.
  fp.resolution_verified = resolutionVerified === true && fp.resolution_category !== "none";
  validateFingerprint(fp);
  return fp;
}

/** Hard gate before anything leaves the device. Throws on any unexpected field or value. */
export function validateFingerprint(fp) {
  const allowedKeys = ["schema_version", ...ENUM_KEYS, "resolution_verified", "safety_flag", "site_token"];
  for (const key of Object.keys(fp)) {
    if (!allowedKeys.includes(key)) throw new Error(`Blocked field: ${key}`);
  }
  if (fp.schema_version !== SCHEMA_VERSION) throw new Error("Wrong schema_version");
  for (const key of ENUM_KEYS) {
    const values = Array.isArray(fp[key]) ? fp[key] : [fp[key]];
    for (const v of values) {
      if (!VOCAB[key].includes(v)) throw new Error(`Blocked value in ${key}: ${v}`);
    }
  }
  if (typeof fp.safety_flag !== "boolean") throw new Error("safety_flag must be boolean");
  if (typeof fp.resolution_verified !== "boolean") throw new Error("resolution_verified must be boolean");
  if (fp.resolution_verified && fp.resolution_category === "none") throw new Error("cannot verify a missing fix");
  if (!/^site_[a-z0-9]{8}$/.test(fp.site_token)) throw new Error("Bad site_token");
  return true;
}

export function getSiteToken() {
  let t = localStorage.getItem("ss_site_token");
  if (!t) {
    t = "site_" + Math.random().toString(36).slice(2, 10).padEnd(8, "0");
    localStorage.setItem("ss_site_token", t);
  }
  return t;
}

/** Accept a fingerprint read back from the network only if every value is in the vocabulary. */
export function isValidShared(item) {
  try {
    const { id, pending, owner, created_at, ...fp } = item;
    return validateFingerprint(fp);
  } catch {
    return false;
  }
}
