// Downtime economics. Deterministic arithmetic only: no AI, no invented probabilities.
// All plant-specific costs stay in this browser (localStorage) and are never synced.
//
// Downtime comes from fingerprint downtime bands, so every figure is a RANGE:
//   band          low   mid   high
//   none            0     0      0
//   under_15m       1     8     14
//   15_60m         15    38     60
//   1_4h           61   150    240
//   over_4h       241   300    cap   ← open-ended: the upper bound is an explicit, editable assumption
// These are scenario estimates, not forecasts or measured savings.

export const DEFAULT_SETTINGS = {
  costPerMin: { hydraulic_press: 150, cnc_machine: 120, conveyor: 60, compressor: 80, welding_robot: 140, injection_molder: 110, paint_line: 100, other: 100 },
  overFourHourCap: 480,
  reductionPct: 50,
  interventionCost: {}, // family id → $ (optional)
  hoursPerFix: {}, // family id → engineering hours (optional, default 16)
  budgetHours: 40,
  investigationMinAvoided: 60, // assumed minutes saved each time existing knowledge is reused
};

const KEY = "ss_econ_settings";
export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return s ? { ...DEFAULT_SETTINGS, ...s, costPerMin: { ...DEFAULT_SETTINGS.costPerMin, ...(s.costPerMin || {}) } } : structuredClone(DEFAULT_SETTINGS);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}
export function saveSettings(s) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function bandMinutes(bucket, cap = DEFAULT_SETTINGS.overFourHourCap) {
  const B = { none: [0, 0, 0], under_15m: [1, 8, 14], "15_60m": [15, 38, 60], "1_4h": [61, 150, 240], over_4h: [241, 300, Math.max(241, cap)] };
  const [low, mid, high] = B[bucket] || [0, 0, 0];
  return { low, mid, high };
}

/**
 * Per failure family: downtime and cost ranges from the actual member fingerprints.
 * families: [{ id, title, equipment_type, members: [fingerprint] }]
 */
export function familyEconomics(families, settings = DEFAULT_SETTINGS) {
  return families.map((f) => {
    const rate = settings.costPerMin[f.equipment_type] ?? settings.costPerMin.other ?? 100;
    const mins = { low: 0, mid: 0, high: 0 };
    let openEnded = 0;
    for (const m of f.members) {
      const b = bandMinutes(m.downtime_bucket, settings.overFourHourCap);
      mins.low += b.low; mins.mid += b.mid; mins.high += b.high;
      if (m.downtime_bucket === "over_4h") openEnded++;
    }
    const cost = { low: mins.low * rate, mid: mins.mid * rate, high: mins.high * rate };
    const r = (settings.reductionPct ?? 50) / 100;
    const avoided = { low: cost.low * r, mid: cost.mid * r, high: cost.high * r };
    const ic = Number(settings.interventionCost?.[f.id]);
    const hasIC = Number.isFinite(ic) && ic > 0;
    return {
      id: f.id,
      title: f.title,
      equipment_type: f.equipment_type,
      incidents: f.members.length,
      open: f.members.filter((m) => m.status !== "resolved").length,
      ratePerMin: rate,
      minutes: mins,
      openEnded,
      cost,
      avoided,
      interventionCost: hasIC ? ic : null,
      netBenefit: hasIC ? { low: avoided.low - ic, mid: avoided.mid - ic, high: avoided.high - ic } : null,
      hours: Number(settings.hoursPerFix?.[f.id]) > 0 ? Number(settings.hoursPerFix[f.id]) : 16,
    };
  });
}

/** Pareto: families sorted by midpoint cost with cumulative share. */
export function pareto(rows) {
  const sorted = [...rows].sort((a, b) => b.cost.mid - a.cost.mid);
  const total = sorted.reduce((t, r) => t + r.cost.mid, 0) || 1;
  let cum = 0;
  return sorted.map((r) => {
    cum += r.cost.mid;
    return { ...r, share: r.cost.mid / total, cumShare: cum / total };
  });
}

/**
 * Sensitivity: re-rank families under several cost/band scenarios and report which stay high priority.
 * A family is "robust" if it is in the top-K in every scenario.
 */
export function sensitivity(families, settings = DEFAULT_SETTINGS, { topK = 2 } = {}) {
  const scenarios = [
    { id: "low-0.5", label: "Low downtime, costs ×0.5", band: "low", mult: 0.5 },
    { id: "low-1", label: "Low downtime, base costs", band: "low", mult: 1 },
    { id: "mid-0.5", label: "Midpoint, costs ×0.5", band: "mid", mult: 0.5 },
    { id: "mid-1", label: "Midpoint, base costs", band: "mid", mult: 1 },
    { id: "mid-1.5", label: "Midpoint, costs ×1.5", band: "mid", mult: 1.5 },
    { id: "high-1", label: "High downtime, base costs", band: "high", mult: 1 },
    { id: "high-1.5", label: "High downtime, costs ×1.5", band: "high", mult: 1.5 },
    { id: "flat", label: "Same cost for every machine", band: "mid", flat: true },
  ];
  const rows = familyEconomics(families, settings);
  const avgRate = rows.length ? rows.reduce((t, r) => t + r.ratePerMin, 0) / rows.length : 0;
  const ranks = {};
  for (const s of scenarios) {
    const values = rows.map((r) => ({ id: r.id, v: s.flat ? r.minutes.mid * avgRate : r.cost[s.band] * s.mult }));
    values.sort((a, b) => b.v - a.v).forEach((x, i) => ((ranks[x.id] ||= {})[s.id] = i + 1));
  }
  const summary = rows.map((r) => {
    const rs = Object.values(ranks[r.id] || {});
    return {
      id: r.id,
      title: r.title,
      ranks: ranks[r.id],
      bestRank: Math.min(...rs),
      worstRank: Math.max(...rs),
      timesTop1: rs.filter((x) => x === 1).length,
      robust: rs.every((x) => x <= topK),
    };
  });
  return { scenarios, summary: summary.sort((a, b) => a.worstRank - b.worstRank || a.bestRank - b.bestRank) };
}

/**
 * Resource allocation scenario: with a budget of engineering hours, pick families by benefit per hour (greedy).
 * Benefit = net benefit midpoint if an intervention cost is given, otherwise avoided-loss midpoint.
 */
export function allocate(rows, budgetHours) {
  const ranked = rows
    .map((r) => {
      const benefit = r.netBenefit ? r.netBenefit.mid : r.avoided.mid;
      return { ...r, benefit, perHour: benefit / Math.max(1, r.hours) };
    })
    .sort((a, b) => b.perHour - a.perHour);
  let left = budgetHours;
  const chosen = [];
  for (const r of ranked) {
    if (r.benefit > 0 && r.hours <= left) {
      chosen.push(r.id);
      left -= r.hours;
    }
  }
  return {
    ranked: ranked.map((r) => ({ ...r, selected: chosen.includes(r.id) })),
    hoursUsed: budgetHours - left,
    benefit: ranked.filter((r) => chosen.includes(r.id)).reduce((t, r) => t + r.benefit, 0),
  };
}

/**
 * Value of knowledge reuse. MEASURED: number of recorded reuse events. ASSUMED: minutes saved per reuse and cost per minute.
 */
export function knowledgeValue(reuseEvents, settings = DEFAULT_SETTINGS, { includeSynthetic = true } = {}) {
  const events = reuseEvents.filter((e) => includeSynthetic || !e.synthetic);
  const rates = Object.values(settings.costPerMin);
  const avgRate = rates.reduce((t, x) => t + x, 0) / Math.max(1, rates.length);
  return {
    measuredEvents: events.length,
    syntheticEvents: events.filter((e) => e.synthetic).length,
    assumedMinutesPerReuse: settings.investigationMinAvoided,
    assumedRatePerMin: avgRate,
    hypotheticalValue: events.length * settings.investigationMinAvoided * avgRate,
  };
}
