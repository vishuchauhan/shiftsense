// Knowledge-sharing as a game. Everything here is computed from the parameters; no conclusion is hard-coded.
//
// One-shot, two plants, actions C (contribute) / D (withhold). Payoff to a plant:
//   both contribute (C,C):  V − c − r + s + b + k
//   I contribute, other withholds (C,D):  −c − r + s
//   I withhold, other contributes (D,C):  V + f
//   both withhold (D,D):  0
// V  value of the knowledge I receive          c  cost of preparing a contribution
// r  perceived confidentiality risk            s  contribution incentive (ShiftSense credits / analytics)
// b  network participation benefit            k  reciprocal cooperation value (only when both share)
// f  extra benefit from free-riding
// These are modelling assumptions for exploration, not measured values.
import { rng, gini, mean } from "./stats.js";

export const DEFAULT_PARAMS = { V: 10, c: 3, r: 4, s: 0, b: 1, k: 1, f: 1 };

export function payoffMatrix(p) {
  const CC = p.V - p.c - p.r + p.s + p.b + p.k;
  const CD = -p.c - p.r + p.s;
  const DC = p.V + p.f;
  const DD = 0;
  // matrix[myAction][theirAction] = [mine, theirs]
  return { C: { C: [CC, CC], D: [CD, DC] }, D: { C: [DC, CD], D: [DD, DD] } };
}

const A = ["C", "D"];

/** Best responses, dominant strategies, pure and mixed Nash equilibria, and the game's type. */
export function analyze(m) {
  const u = (a, b) => m[a][b][0]; // row player's payoff (symmetric game)
  const bestResponse = {};
  for (const other of A) {
    const best = Math.max(u("C", other), u("D", other));
    bestResponse[other] = A.filter((a) => u(a, other) === best);
  }
  const dominant = (() => {
    const cStrict = u("C", "C") > u("D", "C") && u("C", "D") > u("D", "D");
    const dStrict = u("D", "C") > u("C", "C") && u("D", "D") > u("C", "D");
    if (cStrict) return { action: "C", kind: "strictly dominant" };
    if (dStrict) return { action: "D", kind: "strictly dominant" };
    const cWeak = u("C", "C") >= u("D", "C") && u("C", "D") >= u("D", "D");
    const dWeak = u("D", "C") >= u("C", "C") && u("D", "D") >= u("C", "D");
    if (cWeak && !dWeak) return { action: "C", kind: "weakly dominant" };
    if (dWeak && !cWeak) return { action: "D", kind: "weakly dominant" };
    return null;
  })();
  const pure = [];
  for (const a of A) for (const b of A) {
    if (bestResponse[b].includes(a) && bestResponse[a].includes(b)) pure.push(a + b);
  }
  // Symmetric mixed equilibrium: probability q of C that makes the other plant indifferent.
  const denom = u("C", "C") - u("C", "D") - u("D", "C") + u("D", "D");
  let mixed = null;
  if (denom !== 0) {
    const q = (u("D", "D") - u("C", "D")) / denom;
    if (q > 0 && q < 1) mixed = { pC: q, payoff: q * u("C", "C") + (1 - q) * u("C", "D") };
  }
  const R = u("C", "C"), S = u("C", "D"), T = u("D", "C"), P = u("D", "D");
  let type = "Other";
  if (T > R && R > P && P > S) type = "Prisoner's Dilemma";
  else if (R > T && T >= P && P > S) type = "Stag Hunt (coordination)";
  else if (T > R && R > S && S > P) type = "Chicken / Snowdrift";
  else if (R >= T && S >= P) type = "Harmony (sharing pays)";
  else if (P >= R && P >= T) type = "Deadlock (withholding pays)";
  const welfare = { CC: 2 * R, CD: S + T, DD: 2 * P };
  const efficient = Object.entries(welfare).sort((a, b) => b[1] - a[1])[0][0];
  return { R, S, T, P, bestResponse, dominant, pure, mixed, type, welfare, efficient };
}

// ---------- repeated game ----------
export const STRATEGIES = {
  always_c: "Always contribute",
  always_d: "Always withhold",
  tft: "Tit-for-tat",
  conditional: "Conditional cooperator",
  incentive: "Incentive-responsive",
};

/**
 * Multi-plant repeated game.
 * Per round, with k of the other m = N−1 plants contributing (share = k/m):
 *   contribute: V·share − c − r + s + (b + k)·share
 *   withhold:   V·share + f·share
 * With two plants this is exactly the matrix above.
 *
 * Strategies (decided from the previous round):
 *   tft          contribute in round 1, then contribute iff at least half of the others contributed
 *                (with 2 plants this mirrors the other plant exactly)
 *   conditional  contribute in round 1, then contribute iff the share of others contributing ≥ θ
 *   incentive    contribute iff contributing pays at least as much as withholding given last round's share
 * noise ε: each decision flips with probability ε (seeded, reproducible).
 */
export function simulate({ plants = 6, rounds = 30, strategies, params = DEFAULT_PARAMS, delta = 0.95, noise = 0.03, theta = 0.6, decay = 0.05, seed = 42 } = {}) {
  const N = plants;
  const strat = strategies?.length === N ? strategies : Array.from({ length: N }, (_, i) => Object.keys(STRATEGIES)[i % 5]);
  const rand = rng(seed);
  const m = Math.max(1, N - 1);
  let prev = null;
  const cum = Array(N).fill(0);
  const disc = Array(N).fill(0);
  const contributions = Array(N).fill(0);
  const freeRides = Array(N).fill(0);
  let stock = 0;
  const series = { coop: [], welfare: [], stock: [] };

  for (let t = 0; t < rounds; t++) {
    const acts = strat.map((s, i) => {
      let c;
      if (t === 0) c = s !== "always_d" && (s !== "incentive" || gain(params, 1) >= 0);
      else {
        const share = (prev.filter((x, j) => j !== i && x).length) / m;
        if (s === "always_c") c = true;
        else if (s === "always_d") c = false;
        else if (s === "tft") c = share >= 0.5;
        else if (s === "conditional") c = share >= theta;
        else if (s === "incentive") c = gain(params, share) >= 0;
      }
      if (rand() < noise) c = !c;
      return c;
    });
    let welfare = 0;
    acts.forEach((c, i) => {
      const share = acts.filter((x, j) => j !== i && x).length / m;
      const u = params.V * share + (c ? -params.c - params.r + params.s + (params.b + params.k) * share : params.f * share);
      cum[i] += u;
      disc[i] += Math.pow(delta, t) * u;
      welfare += u;
      if (c) contributions[i]++;
      else if (share > 0) freeRides[i]++;
    });
    const nC = acts.filter(Boolean).length;
    stock = stock * (1 - decay) + nC;
    series.coop.push(nC / N);
    series.welfare.push(welfare);
    series.stock.push(stock);
    prev = acts;
  }

  const byStrategy = {};
  strat.forEach((s, i) => (byStrategy[s] ||= []).push(cum[i]));
  return {
    series,
    plants: strat.map((s, i) => ({ id: i + 1, strategy: s, cumulative: cum[i], discounted: disc[i], contributions: contributions[i], freeRides: freeRides[i] })),
    byStrategy: Object.fromEntries(Object.entries(byStrategy).map(([s, v]) => [s, mean(v)])),
    totals: {
      cooperationRate: mean(series.coop),
      collectiveUtility: cum.reduce((t, x) => t + x, 0),
      discountedWelfare: disc.reduce((t, x) => t + x, 0),
      finalStock: stock,
      utilityGini: gini(cum.map((x) => x - Math.min(0, ...cum))),
      contributionGini: gini(contributions),
      freeRideRate: freeRides.reduce((t, x) => t + x, 0) / (N * rounds),
    },
  };
}

/** Payoff gain from contributing vs withholding, given the share of others contributing. */
function gain(p, share) {
  return -p.c - p.r + p.s + (p.b + p.k) * share - p.f * share;
}

/**
 * Compare baseline (no incentive, raw-sharing privacy risk) with the ShiftSense mechanism
 * (contribution incentive s, and privacy risk reduced by the deterministic fingerprint filter).
 * The size of the risk reduction is a scenario assumption, not a measured guarantee.
 */
export function compareMechanisms(opts, { incentive = 5, privacyReduction = 0.6 } = {}) {
  const base = { ...opts.params, s: 0 };
  const mech = { ...opts.params, s: incentive, r: opts.params.r * (1 - privacyReduction) };
  return {
    baseline: { params: base, matrix: analyze(payoffMatrix(base)), sim: simulate({ ...opts, params: base }) },
    shiftsense: { params: mech, matrix: analyze(payoffMatrix(mech)), sim: simulate({ ...opts, params: mech }) },
  };
}
