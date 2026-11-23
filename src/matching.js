// Transparent similarity between fingerprints. Plain math: runs offline, instantly, no AI.
// S = 0.35·Equipment + 0.30·Jaccard(symptoms) + 0.20·Trigger + 0.15·Process
export const WEIGHTS = { equipment: 0.35, symptoms: 0.30, trigger: 0.20, process: 0.15 };
export const MATCH_THRESHOLD = 0.6;

export function jaccard(a = [], b = []) {
  const A = new Set(a), B = new Set(b);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function similarity(a, b) {
  const parts = {
    equipment: a.equipment_type === b.equipment_type ? 1 : 0,
    symptoms: jaccard(a.symptoms, b.symptoms),
    trigger: a.trigger === b.trigger && a.trigger !== "unknown" ? 1 : 0,
    process: a.process === b.process ? 1 : 0,
  };
  const score = Object.entries(WEIGHTS).reduce((s, [k, w]) => s + w * parts[k], 0);
  return { score: Math.round(score * 1000) / 1000, parts };
}

/** Top-k most similar fingerprints from the pool (each pool item: { id, ...fingerprint }). */
export function topMatches(fp, pool, { k = 3, threshold = MATCH_THRESHOLD, excludeId } = {}) {
  return pool
    .filter((p) => p.id !== excludeId)
    .map((p) => ({ item: p, ...similarity(fp, p) }))
    .filter((m) => m.score >= threshold)
    .sort((x, y) => y.score - x.score)
    .slice(0, k);
}
