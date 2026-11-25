// Three levels of checking for cloud-written knowledge cards.
//   Level 1  reference integrity: does every cited incident ID exist in the pattern?
//   Level 2  evidence consistency: does each cited incident actually show the pattern's equipment and symptoms,
//            and are causes/fixes named in the card summary present in the data?
//   Level 3  engineering review: a qualified person marks the card reviewed/approved (stored on the card).
// Levels 1 and 2 are deterministic code. Level 3 is a human decision and is never automated.

/** Level 1: reference integrity. */
export function checkCitations(citedIds, allowedIds) {
  const allowed = new Set(allowedIds);
  const cited = [...new Set(citedIds || [])];
  const valid = cited.filter((id) => allowed.has(id));
  const invalid = cited.filter((id) => !allowed.has(id));
  return {
    cited: cited.length,
    valid: valid.length,
    invalid_refs: invalid,
    status: invalid.length === 0 && valid.length > 0 ? "verified" : "rejected",
    validIds: valid,
  };
}

// Words in card text that name a cause or fix category.
const CAUSE_WORDS = {
  hydraulic: ["hydraulic"],
  mechanical: ["mechanical"],
  electrical: ["electrical"],
  tooling: ["tooling"],
  material: ["material defect", "material quality"],
  process_setting: ["process setting", "process parameter", "parameter"],
};
const FIX_WORDS = {
  coupling_reseated: ["coupling"],
  seal_replaced: ["seal"],
  fluid_topped_up_or_changed: ["fluid"],
  filter_replaced: ["filter"],
  belt_adjusted_or_replaced: ["belt"],
  bearing_replaced: ["bearing"],
  sensor_recalibrated: ["recalibrat", "calibration"],
  wiring_or_connector_repaired: ["wiring", "connector"],
  parameter_adjusted: ["parameter", "process setting"],
  cooling_restored: ["cooling"],
  jam_cleared: ["clearing jam", "jam cleared", "clearing the jam", "clearing jams"],
};

const mentions = (text, dict) =>
  Object.entries(dict).filter(([, words]) => words.some((w) => text.includes(w))).map(([k]) => k);

/**
 * Level 2: evidence consistency.
 * members: the fingerprints of the pattern (from the shared network).
 */
export function checkEvidenceConsistency(card, members) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const sig = card.signature || {};
  const cited = (card.cited_ids || []).map((id) => byId.get(id)).filter(Boolean);
  const perIncident = cited.map((m) => {
    const equipmentOk = m.equipment_type === sig.equipment_type;
    const symptomOk = (sig.symptoms || []).some((s) => (m.symptoms || []).includes(s));
    return { id: m.id, consistent: equipmentOk && symptomOk, equipmentOk, symptomOk };
  });

  // Claims in the summary must be backed by data; the mechanism is a labelled hypothesis.
  const summary = String(card.pattern_summary || "").toLowerCase();
  const causesInData = new Set(Object.keys(card.stats?.confirmed_causes || {}));
  const fixesInData = new Set(Object.keys(card.stats?.verified_fixes || {}));
  const claims = [
    ...mentions(summary, CAUSE_WORDS).map((c) => ({ kind: "cause", value: c, supported: causesInData.has(c) })),
    ...mentions(summary, FIX_WORDS).map((f) => ({ kind: "fix", value: f, supported: fixesInData.has(f) })),
  ];
  const unsupported = claims.filter((c) => !c.supported);
  const inconsistent = perIncident.filter((p) => !p.consistent);
  return {
    incidents_checked: perIncident.length,
    incidents_consistent: perIncident.length - inconsistent.length,
    inconsistent_ids: inconsistent.map((p) => p.id),
    claims,
    unsupported_claims: unsupported,
    status: inconsistent.length === 0 && unsupported.length === 0 ? "consistent" : "flagged",
  };
}
