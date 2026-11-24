// Find recurring failure patterns with plain math (average-linkage clustering on the
// similarity score). The cloud model never decides which incidents belong together;
// it only explains clusters that code has already found.
import { similarity } from "./matching.js";

export const CLUSTER_THRESHOLD = 0.65;
export const MIN_CLUSTER_SIZE = 3;

export function clusterFingerprints(items, { threshold = CLUSTER_THRESHOLD, minSize = MIN_CLUSTER_SIZE } = {}) {
  let clusters = items.map((it) => [it]);
  const sim = new Map();
  const key = (a, b) => (a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);
  const s = (a, b) => {
    const k = key(a, b);
    if (!sim.has(k)) sim.set(k, similarity(a, b).score);
    return sim.get(k);
  };
  const avgLink = (A, B) => {
    let t = 0;
    for (const a of A) for (const b of B) t += s(a, b);
    return t / (A.length * B.length);
  };

  // Merge the closest pair until no pair is above the threshold.
  while (true) {
    let best = { score: -1, i: -1, j: -1 };
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const sc = avgLink(clusters[i], clusters[j]);
        if (sc > best.score) best = { score: sc, i, j };
      }
    }
    if (best.score < threshold) break;
    clusters[best.i] = clusters[best.i].concat(clusters[best.j]);
    clusters.splice(best.j, 1);
  }

  return clusters
    .filter((c) => c.length >= minSize)
    .sort((a, b) => b.length - a.length)
    .map(describeCluster);
}

const mode = (arr) => {
  const c = {};
  for (const x of arr) c[x] = (c[x] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0];
};
const count = (arr) => arr.reduce((c, x) => ((c[x] = (c[x] || 0) + 1), c), {});

const BUCKET_MIDPOINT_MIN = { none: 0, under_15m: 8, "15_60m": 38, "1_4h": 150, over_4h: 300 };

/** Every number on a knowledge card is computed here, by code, never by the model. */
export function describeCluster(members) {
  const symptomCounts = count(members.flatMap((m) => m.symptoms));
  const resolved = members.filter((m) => m.status === "resolved");
  return {
    evidence_ids: members.map((m) => m.id).sort(),
    stats: {
      incidents: members.length,
      sites: new Set(members.map((m) => m.site_token)).size,
      resolved: resolved.length,
      open: members.length - resolved.length,
      safety_flags: members.filter((m) => m.safety_flag).length,
      est_downtime_min: members.reduce((t, m) => t + (BUCKET_MIDPOINT_MIN[m.downtime_bucket] ?? 0), 0),
      confirmed_causes: count(resolved.map((m) => m.cause_category).filter((c) => c !== "unknown")),
      symptom_counts: symptomCounts,
      triggers: count(members.map((m) => m.trigger)),
    },
    // Signature used later for offline matching of new incidents against this card.
    signature: {
      equipment_type: mode(members.map((m) => m.equipment_type)),
      process: mode(members.map((m) => m.process)),
      trigger: mode(members.map((m) => m.trigger)),
      symptoms: Object.entries(symptomCounts)
        .filter(([, n]) => n / members.length >= 0.5)
        .map(([s]) => s)
        .sort(),
    },
    members,
  };
}
