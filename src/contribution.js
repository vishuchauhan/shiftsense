// Knowledge contribution scoring and ledger.
//
//   K = 100 × (wQ·Q + wN·N + wV·V + wR·R)     default weights 0.30 / 0.25 / 0.30 / 0.15
//
// Q  evidence quality: share of informative fields filled in (cause, trigger, symptoms, downtime, fix)
// N  novelty: 1 − highest feature similarity to any EARLIER shared incident
// V  verified outcome: 1.0 fix verified AND corroborated by the same fix at another site
//                      0.6 fix verified by the contributing site only (self-verification is capped)
//                      0.3 resolved without a verified fix · 0.2 cause known but unresolved · 0 otherwise
// R  confirmed reuse: distinct OTHER sites that recorded using a knowledge card citing this incident, capped at 3
//
// Scores are recomputed from the immutable shared records every time; no client ever submits a credit value.
// Duplicates (same content from the same site, shared within 10 minutes of each other) earn nothing.
// Genuine recurrences are not duplicates: they still count, but earn little novelty.
// Seeded demo records are exempt: their timestamps are load times, not incident times. Weights are adjustable assumptions, not validated coefficients.
import { similarity } from "./matching.js";
import { contentKey } from "./privacy.js";

export const DEFAULT_WEIGHTS = { Q: 0.3, N: 0.25, V: 0.3, R: 0.15 };
const REUSE_CAP = 3;

const DUP_WINDOW_S = 600;
const tsOf = (x) => {
  const t = x.created_at?.seconds ?? (x.created_at?.toMillis ? x.created_at.toMillis() / 1000 : undefined);
  return Number.isFinite(t) ? t : null;
};
const order = (x) => tsOf(x) ?? Number(String(x.id).replace(/\D/g, "")) ?? 0;

export function quality(fp) {
  const parts = [
    fp.cause_category && fp.cause_category !== "unknown",
    fp.trigger && !["unknown", "none_observed"].includes(fp.trigger),
    (fp.symptoms || []).length > 0 && !(fp.symptoms.length === 1 && fp.symptoms[0] === "other"),
    fp.downtime_bucket && fp.downtime_bucket !== "none",
    fp.status === "resolved" ? fp.resolution_category && fp.resolution_category !== "none" : true,
  ];
  return parts.filter(Boolean).length / parts.length;
}

export function scoreRecords(pool, cards = [], reuseEvents = [], weights = DEFAULT_WEIGHTS, { exemptFromDuplicates = () => false } = {}) {
  const sorted = [...pool].sort((a, b) => order(a) - order(b) || String(a.id).localeCompare(String(b.id)));
  const seen = new Map(); // contentKey → first id
  const earlier = [];
  // Verified fixes per (equipment, fix) → set of sites, for corroboration.
  const fixSites = new Map();
  for (const r of pool) {
    if (r.resolution_verified && r.resolution_category !== "none") {
      const k = `${r.equipment_type}|${r.resolution_category}`;
      (fixSites.get(k) || fixSites.set(k, new Set()).get(k)).add(r.site_token);
    }
  }
  // Reuse: card id → set of sites that reused it (event site must differ from the record's site).
  const cardReuse = new Map();
  for (const e of reuseEvents) (cardReuse.get(e.card_id) || cardReuse.set(e.card_id, []).get(e.card_id)).push(e);
  const cardsByRecord = new Map();
  for (const c of cards) for (const id of c.all_evidence_ids || c.cited_ids || []) (cardsByRecord.get(id) || cardsByRecord.set(id, []).get(id)).push(c.id);

  const rows = [];
  for (const r of sorted) {
    const key = contentKey(r);
    const prev = seen.get(key);
    const t = tsOf(r);
    if (prev && !exemptFromDuplicates(r) && t != null && prev.t != null && Math.abs(t - prev.t) < DUP_WINDOW_S) {
      rows.push({ id: r.id, site: r.site_token, duplicateOf: prev.id, K: 0, Q: 0, N: 0, V: 0, R: 0, reasons: [`duplicate of ${prev.id} (same content, same site, within 10 minutes): no credit`] });
      continue;
    }
    seen.set(key, { id: r.id, t });
    const Q = quality(r);
    const maxSim = earlier.reduce((mx, e) => Math.max(mx, similarity(r, e).score), 0);
    const N = earlier.length ? 1 - maxSim : 1;
    earlier.push(r);
    let V = 0, vReason = "no outcome recorded";
    if (r.resolution_verified && r.resolution_category !== "none") {
      const sites = fixSites.get(`${r.equipment_type}|${r.resolution_category}`) || new Set();
      const corroborated = [...sites].some((s) => s !== r.site_token);
      V = corroborated ? 1 : 0.6;
      vReason = corroborated ? "verified fix, also verified at another site" : "verified fix, only self-verified (capped at 0.6)";
    } else if (r.status === "resolved") { V = 0.3; vReason = "resolved, fix not verified"; }
    else if (r.cause_category && r.cause_category !== "unknown") { V = 0.2; vReason = "cause confirmed, still open"; }
    const reusingSites = new Set();
    let syntheticReuse = 0;
    for (const cid of cardsByRecord.get(r.id) || []) {
      for (const e of cardReuse.get(cid) || []) {
        if (e.site_token !== r.site_token) {
          reusingSites.add(e.site_token);
          if (e.synthetic) syntheticReuse++;
        }
      }
    }
    const R = Math.min(REUSE_CAP, reusingSites.size) / REUSE_CAP;
    const K = 100 * (weights.Q * Q + weights.N * N + weights.V * V + weights.R * R);
    rows.push({
      id: r.id, site: r.site_token, K, Q, N, V, R, reusingSites: reusingSites.size, syntheticReuse,
      reasons: [
        `quality ${Math.round(Q * 100)}% of informative fields filled`,
        earlier.length > 1 ? `novelty ${Math.round(N * 100)}% (closest earlier incident ${Math.round(maxSim * 100)}% similar)` : "first incident of its kind",
        vReason,
        reusingSites.size ? `reused by ${reusingSites.size} other site${reusingSites.size > 1 ? "s" : ""}${syntheticReuse ? " (includes synthetic demo events)" : ""}` : "no reuse by other sites yet",
      ],
    });
  }
  return rows;
}

export const REWARD_TIERS = [
  { min: 0, name: "Participant", unlocks: "All safety knowledge and knowledge cards (always available, regardless of score)" },
  { min: 300, name: "Contributor", unlocks: "Cross-site benchmark report for your equipment types" },
  { min: 800, name: "Core contributor", unlocks: "Early access to new pattern analyses and research summaries" },
];

/** Aggregate per site. */
export function ledger(rows, pool) {
  const sites = new Map();
  for (const r of rows) {
    const s = sites.get(r.site) || { site: r.site, incidents: 0, verified: 0, novel: 0, duplicates: 0, reuse: 0, total: 0, scores: [] };
    if (r.duplicateOf) s.duplicates++;
    else {
      s.incidents++;
      if (r.V >= 0.6) s.verified++;
      if (r.N >= 0.5) s.novel++;
      s.reuse = Math.max(s.reuse, r.reusingSites || 0);
      s.total += r.K;
      s.scores.push(r.K);
    }
    sites.set(r.site, s);
  }
  return [...sites.values()]
    .map((s) => ({ ...s, avg: s.scores.length ? s.total / s.scores.length : 0, tier: [...REWARD_TIERS].reverse().find((t) => s.total >= t.min) }))
    .sort((a, b) => b.total - a.total);
}
