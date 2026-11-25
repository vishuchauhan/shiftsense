// Model routing policy: the single source of truth for where each AI task may run.
// ai.js and knowledge.js build their models from this table, and the Privacy Center and
// Evaluation Lab read it, so the documented policy and the running code cannot drift apart.
export const POLICY = {
  extract_incident: { mode: "ONLY_ON_DEVICE", input: "raw_note", why: "Raw notes contain names, machine IDs and production details." },
  explain_evidence: { mode: "ONLY_ON_DEVICE", input: "raw_note", why: "Combines the private note with shared knowledge." },
  knowledge_card: { mode: "ONLY_IN_CLOUD", input: "fingerprints", why: "Cross-plant reasoning over many approved fingerprints." },
  benchmark_cloud_extract: { mode: "ONLY_IN_CLOUD", input: "synthetic_note", why: "Benchmark only: fictional notes with no real data." },
  shareable_summary: { mode: "PREFER_ON_DEVICE", input: "fingerprints", why: "Non-sensitive input, so cloud fallback is allowed." },
};

/** Input kinds that must never be processed in the cloud. */
export const PRIVATE_INPUTS = new Set(["raw_note"]);

/** True if a telemetry entry represents private data processed in the cloud (must always be zero). */
export const isPrivacyViolation = (e) => PRIVATE_INPUTS.has(e.input) && String(e.source).toUpperCase() !== "ON_DEVICE";
