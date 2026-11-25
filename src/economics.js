// Downtime economics. Deterministic arithmetic only: no AI, no invented probabilities.
// cost = estimated downtime minutes × cost per minute
// avoidable = cost × hypothetical reduction %  (a scenario, not a prediction)
export function economics(cards, { costPerMin = 150, reductionPct = 50 } = {}) {
  return cards
    .map((k) => {
      const downtimeMin = k.stats?.est_downtime_min ?? 0;
      const cost = downtimeMin * costPerMin;
      return {
        id: k.id,
        title: k.title,
        incidents: k.stats?.incidents ?? 0,
        open: k.stats?.open ?? 0,
        downtimeMin,
        cost,
        avoidable: cost * (reductionPct / 100),
      };
    })
    .sort((a, b) => b.cost - a.cost);
}
