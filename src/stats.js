// Small, exact statistics helpers used across the app and the evaluation suite.

/** Median; for an even-sized sample this is the mean of the two middle values. */
export function median(values) {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/** Percentile with linear interpolation between closest ranks (p in 0..100). */
export function percentile(values, p) {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  if (a.length === 1) return a[0];
  const rank = (p / 100) * (a.length - 1);
  const lo = Math.floor(rank), hi = Math.ceil(rank);
  return a[lo] + (a[hi] - a[lo]) * (rank - lo);
}

export const mean = (values) => {
  const a = values.filter(Number.isFinite);
  return a.length ? a.reduce((t, x) => t + x, 0) / a.length : null;
};

/** Gini coefficient of non-negative values (0 = perfectly equal, 1 = maximally unequal). */
export function gini(values) {
  const a = values.map((v) => Math.max(0, v)).sort((x, y) => x - y);
  const n = a.length;
  const total = a.reduce((t, x) => t + x, 0);
  if (!n || total === 0) return 0;
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (i + 1) * a[i];
  return (2 * cum) / (n * total) - (n + 1) / n;
}

/** Seeded pseudo-random generator (mulberry32) for reproducible simulations. */
export function rng(seed = 1) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const round = (x, d = 0) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
