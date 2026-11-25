// Economic Intelligence: downtime exposure ranges, Pareto, sensitivity, scenarios. Plain arithmetic, local assumptions.
import { state, subscribe, families, clusters } from "../state.js";
import { familyEconomics, pareto, sensitivity, allocate, knowledgeValue, loadSettings, saveSettings, DEFAULT_SETTINGS } from "../economics.js";
import { cardId } from "../knowledge.js";
import { esc, nice, money, moneyK, num, pct, render } from "../ui/dom.js";
import { panel, pageHead, btn, badge, emptyState, callout, kpi } from "../ui/components.js";
import { pareto as paretoChart, scatter, ranges } from "../ui/charts.js";

let settings = loadSettings();

/** Use verified cards when they exist; otherwise the code-found families. */
function getFamilies() {
  const f = families();
  if (f.length) return f;
  return clusters().map((c) => ({ id: cardId(c), title: `${c.signature.equipment_type.replace(/_/g, " ")} · ${c.signature.trigger.replace(/_/g, " ")}`, equipment_type: c.signature.equipment_type, members: c.members }));
}

export default {
  mount(el) {
    const draw = () => render(el, view());
    draw();
    const unsub = subscribe(draw);
    const onChange = (e) => {
      const t = e.target;
      const v = Number(t.value);
      if (t.dataset.rate) settings.costPerMin[t.dataset.rate] = Math.max(0, v);
      else if (t.dataset.ic) settings.interventionCost[t.dataset.ic] = t.value === "" ? undefined : Math.max(0, v);
      else if (t.dataset.hours) settings.hoursPerFix[t.dataset.hours] = Math.max(1, v);
      else if (t.dataset.s) settings[t.dataset.s] = Math.max(0, v);
      else return;
      saveSettings(settings);
      draw();
    };
    const onClick = (e) => {
      if (e.target.closest("[data-action=reset]")) { settings = structuredClone(DEFAULT_SETTINGS); saveSettings(settings); draw(); }
    };
    el.addEventListener("change", onChange);
    el.addEventListener("click", onClick);
    return () => { unsub(); el.removeEventListener("change", onChange); el.removeEventListener("click", onClick); };
  },
};

function view() {
  const head = pageHead("Economic Intelligence", "Which failure families cost the most, how sure we can be, and where limited engineering time pays back. All figures are scenario estimates from downtime bands and your local cost assumptions.", btn("Reset assumptions", { action: "reset", tone: "sm" }));
  const fams = getFamilies();
  if (!fams.length) return head + emptyState("No failure families yet", "Load the demo network in Network Intelligence to see economics.");
  const rows = familyEconomics(fams, settings);
  const p = pareto(rows);
  const sens = sensitivity(fams, settings);
  const alloc = allocate(rows, settings.budgetHours);
  const kv = knowledgeValue(state.reuse, settings);
  const total = rows.reduce((t, r) => ({ low: t.low + r.cost.low, mid: t.mid + r.cost.mid, high: t.high + r.cost.high }), { low: 0, mid: 0, high: 0 });
  const byFreq = [...rows].sort((a, b) => b.incidents - a.incidents)[0];
  const byCost = p[0];
  const equipments = [...new Set(rows.map((r) => r.equipment_type))];
  const openEnded = rows.reduce((t, r) => t + r.openEnded, 0);

  return `${head}
  ${callout("blue", `Costs and assumptions are stored only in this browser and are never shared with the network. Downtime ranges use band limits (e.g. 15–60 min → 15 / 38 / 60); the open-ended “over 4 h” band uses your explicit cap of <b>${settings.overFourHourCap} min</b>${openEnded ? ` (${openEnded} incident${openEnded > 1 ? "s" : ""} affected)` : ""}.`, "lock")}
  <div class="grid g4 mt2">
    ${kpi("Historical downtime burden", moneyK(total.mid), `range ${moneyK(total.low)} – ${moneyK(total.high)}`)}
    ${kpi("Families analysed", rows.length, `${rows.reduce((t, r) => t + r.incidents, 0)} incidents`)}
    ${kpi("Most frequent", esc(byFreq.title), `${byFreq.incidents} incidents`)}
    ${kpi("Highest cost", esc(byCost.title), `${pct(byCost.share)} of burden`, byFreq.id !== byCost.id ? "amber" : "")}
  </div>
  ${byFreq.id !== byCost.id ? callout("amber", `<b>Frequency and cost disagree.</b> “${esc(byFreq.title)}” happens most often, but “${esc(byCost.title)}” costs the most. Prioritising by incident count alone would start with the wrong problem.`, "alert") : ""}

  <div class="grid g2 mt2">
    ${panel("Cost assumptions", `
      <div class="grid g2">${equipments.map((e) => `<label class="field">${nice(e)} ($ per downtime minute)<input type="number" min="0" step="10" data-rate="${e}" value="${settings.costPerMin[e] ?? 100}"/></label>`).join("")}</div>
      <div class="grid g2 mt">
        <label class="field">Hypothetical reduction if fixed (%)<input type="number" min="0" max="100" data-s="reductionPct" value="${settings.reductionPct}"/></label>
        <label class="field">Cap for the open-ended “over 4 h” band (min)<input type="number" min="241" data-s="overFourHourCap" value="${settings.overFourHourCap}"/></label>
        <label class="field">Engineering budget for the scenario (hours)<input type="number" min="0" data-s="budgetHours" value="${settings.budgetHours}"/></label>
        <label class="field">Assumed investigation minutes saved per reuse<input type="number" min="0" data-s="investigationMinAvoided" value="${settings.investigationMinAvoided}"/></label>
      </div>`, { sub: "Equipment-specific rates. Edit to match your plant." })}
    ${panel("Pareto of downtime cost", paretoChart(p.map((r) => ({ label: r.title, value: r.cost.mid, cumShare: r.cumShare })), { format: moneyK }), { sub: "Midpoint cost per family and cumulative share" })}
  </div>

  <div class="grid g2 mt2">
    ${panel("Exposure ranges", ranges(rows.map((r) => ({ label: r.title, low: r.cost.low, mid: r.cost.mid, high: r.cost.high })), { format: moneyK }), { sub: "Low · midpoint · high downtime cost per family" })}
    ${panel("Frequency vs economic impact", scatter(rows.map((r) => ({ x: r.incidents, y: r.cost.mid, label: r.title, r: 6 + r.open })), { xLabel: "Incidents", yLabel: "Midpoint cost", yFormat: moneyK }), { sub: "Bubble size grows with open incidents" })}
  </div>

  ${panel("Family economics and intervention scenarios", `
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Family</th><th class="r">Incidents</th><th class="r">Open</th><th class="r">Downtime (min) low · mid · high</th><th class="r">Cost range</th><th class="r">Avoidable (${settings.reductionPct}%)</th><th class="r">Intervention cost ($)</th><th class="r">Expected net benefit</th><th class="r">Hours</th></tr></thead><tbody>
    ${p.map((r) => `<tr><td><b>${esc(r.title)}</b><div class="muted small">${esc(r.id)} · ${money(r.ratePerMin)}/min</div></td><td class="r">${r.incidents}</td><td class="r">${r.open}</td>
      <td class="r">${num(r.minutes.low)} · <b>${num(r.minutes.mid)}</b> · ${num(r.minutes.high)}</td><td class="r">${moneyK(r.cost.low)} – ${moneyK(r.cost.high)}</td>
      <td class="r">${moneyK(r.avoided.mid)}<div class="muted small">${moneyK(r.avoided.low)}–${moneyK(r.avoided.high)}</div></td>
      <td class="r"><input type="number" min="0" step="1000" style="width:110px" data-ic="${esc(r.id)}" value="${r.interventionCost ?? ""}" placeholder="optional" aria-label="Intervention cost for ${esc(r.title)}"/></td>
      <td class="r">${r.netBenefit ? `<b style="color:var(--${r.netBenefit.mid >= 0 ? "green" : "red"})">${moneyK(r.netBenefit.mid)}</b><div class="muted small">${moneyK(r.netBenefit.low)}–${moneyK(r.netBenefit.high)}</div>` : `<span class="muted small">enter a cost</span>`}</td>
      <td class="r"><input type="number" min="1" style="width:64px" data-hours="${esc(r.id)}" value="${r.hours}" aria-label="Engineering hours for ${esc(r.title)}"/></td></tr>`).join("")}
    </tbody></table></div>
    <p class="muted small mt">Expected net benefit = hypothetical avoided loss − intervention cost. These are scenarios built from your assumptions, not forecasts.</p>`, { cls: "mt2" })}

  <div class="grid g2 mt2">
    ${panel("Sensitivity: does the priority hold?", `
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Family</th>${sens.scenarios.map((s) => `<th class="c" title="${esc(s.label)}">${esc(s.id)}</th>`).join("")}<th class="c">Robust top-2</th></tr></thead><tbody>
      ${sens.summary.map((s) => `<tr><td>${esc(s.title)}</td>${sens.scenarios.map((sc) => `<td class="c">${s.ranks[sc.id] === 1 ? "<b>1</b>" : s.ranks[sc.id]}</td>`).join("")}<td class="c">${s.robust ? badge("yes", "green") : badge("no", "neutral")}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="muted small mt">Rank of each family under ${sens.scenarios.length} scenarios: ${sens.scenarios.map((s) => `<b>${esc(s.id)}</b> ${esc(s.label)}`).join("; ")}.</p>`, { sub: "Families that stay in the top two across low/high downtime and cost assumptions" })}
    ${panel("Maintenance resource allocation", `
      <p class="small">With <b>${settings.budgetHours} engineering hours</b>, pick families by benefit per hour:</p>
      <div class="list mt">${alloc.ranked.map((r) => `<div class="list-item"><span class="dot ${r.selected ? "green" : ""}"></span><div class="grow"><b>${esc(r.title)}</b><div class="muted small">${r.hours} h · ${moneyK(r.benefit)} ${r.netBenefit ? "net benefit" : "avoidable"} · ${moneyK(r.perHour)}/h</div></div>${r.selected ? badge("selected", "green") : badge("not funded", "neutral")}</div>`).join("")}</div>
      <p class="mt small">Scenario value of the selected set: <b>${moneyK(alloc.benefit)}</b> using ${alloc.hoursUsed} of ${settings.budgetHours} hours.</p>`, { sub: "Greedy selection by value per engineering hour (scenario)" })}
  </div>

  ${panel("Value of reusing knowledge", `
    <div class="grid g4">
      ${kpi("Measured reuse events", kv.measuredEvents, kv.syntheticEvents ? `${kv.syntheticEvents} are synthetic demo events` : "recorded by operators")}
      ${kpi("Assumed minutes saved / reuse", kv.assumedMinutesPerReuse, "assumption, editable above")}
      ${kpi("Average cost per minute", money(kv.assumedRatePerMin), "from your equipment rates")}
      ${kpi("Hypothetical value", moneyK(kv.hypotheticalValue), "not realised savings", "blue")}
    </div>
    <p class="muted small mt">Measured: how many times operators recorded that an existing card helped. Assumed: how much investigation time each reuse saved. Realised savings are not claimed without measured outcomes.</p>`, { cls: "mt2" })}`;
}
