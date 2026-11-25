// Command Center: an executive overview computed entirely from live application state.
import { state, subscribe, families, clusters, pendingMine, telemetry, isSynthetic } from "../state.js";
import { familyEconomics, loadSettings, pareto } from "../economics.js";
import { isPrivacyViolation } from "../routing.js";
import { median } from "../stats.js";
import { esc, nice, moneyK, num, pct, secs, ago, tsMs, render } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { kpi, panel, pageHead, badge, emptyState, callout } from "../ui/components.js";
import { hbar, stacked, ranges } from "../ui/charts.js";

export default {
  mount(el) {
    const draw = () => render(el, view());
    draw();
    return subscribe(draw);
  },
};

function view() {
  const pool = state.pool;
  if (!state.poolLoaded) return pageHead("Command Center", "Loading the shared network…") + `<div class="grid g4">${'<div class="kpi"><div class="skeleton"></div><div class="skeleton mt"></div></div>'.repeat(4)}</div>`;
  const fams = families();
  const econ = familyEconomics(fams, loadSettings());
  const sites = new Set(pool.map((p) => p.site_token));
  const open = pool.filter((p) => p.status !== "resolved").length;
  const resolved = pool.length - open;
  const resolvedWithFix = pool.filter((p) => p.status === "resolved" && p.resolution_category && p.resolution_category !== "none");
  const verified = resolvedWithFix.filter((p) => p.resolution_verified).length;
  const inFamilies = new Set(clusters().flatMap((c) => c.evidence_ids)).size;
  const exposure = econ.reduce((t, r) => ({ low: t.low + r.cost.low, mid: t.mid + r.cost.mid, high: t.high + r.cost.high }), { low: 0, mid: 0, high: 0 });
  const tel = telemetry().filter((e) => e.kind !== "setup" && e.kind !== "benchmark");
  const local = tel.filter((e) => e.source === "ON_DEVICE" && e.ok !== false);
  const cloud = tel.filter((e) => e.source !== "ON_DEVICE" && e.source !== "FAILED");
  const violations = tel.filter(isPrivacyViolation).length;
  const synthetic = pool.filter(isSynthetic).length;

  if (!pool.length) {
    return pageHead("Command Center", "Operational overview of the industrial knowledge network.") +
      emptyState("The shared network is empty", "Load the synthetic demo network in Network Intelligence, or share an incident from Operator Studio.", `<a class="btn primary" href="#/network">${icon("network")}Open Network Intelligence</a>`);
  }

  const byEquip = Object.entries(pool.reduce((m, p) => ((m[p.equipment_type] = (m[p.equipment_type] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
  const top = pareto(econ).slice(0, 4);
  const recent = [
    ...pool.filter((p) => tsMs(p.created_at)).map((p) => ({ t: tsMs(p.created_at), text: `Fingerprint shared · ${p.equipment_type.replace(/_/g, " ")} · ${p.status}`, ic: "globe" })),
    ...state.cards.filter((c) => tsMs(c.updated_at)).map((c) => ({ t: tsMs(c.updated_at), text: `Knowledge card ${c.id} v${c.version || 1} · ${c.review_status || "generated"}`, ic: "knowledge" })),
    ...telemetry().map((e) => ({ t: e.at, text: `${e.source === "ON_DEVICE" ? "On-device" : e.source === "FAILED" ? "Failed" : "Cloud"} · ${e.task.replace(/_/g, " ")} · ${secs(e.ms)}`, ic: e.source === "ON_DEVICE" ? "zap" : "cloud" })),
  ].sort((a, b) => b.t - a.t).slice(0, 8);

  return `
  ${pageHead("Command Center", `Overview of ${num(pool.length)} approved incidents across ${sites.size} sites. ${synthetic ? `${synthetic} records are synthetic demo data.` : ""}`)}
  <div class="grid g6">
    ${kpi("Shared incidents", num(pool.length), `${synthetic} synthetic · ${pool.length - synthetic} live`)}
    ${kpi("Participating sites", num(sites.size), "pseudonymous site tokens")}
    ${kpi("Open incidents", num(open), `${num(resolved)} resolved`, open ? "amber" : "")}
    ${kpi("Verified fix coverage", resolvedWithFix.length ? pct(verified / resolvedWithFix.length) : "—", `${verified} of ${resolvedWithFix.length} recorded fixes verified`, "green")}
    ${kpi("Recurring failure families", num(clusters().length), `${inFamilies} incidents in a family`)}
    ${kpi("Raw notes sent to cloud", num(violations), "measured from SDK calls", violations ? "red" : "green")}
  </div>
  <div class="grid g3 mt2">
    ${panel("Highest-priority failure families", fams.length ? `<div class="list">${top.map((r, i) => `<div class="list-item"><span class="badge ${i === 0 ? "navy" : ""}">#${i + 1}</span><div class="grow"><b>${esc(r.title)}</b><div class="muted small">${r.incidents} incidents · ${r.open} open · ${moneyK(r.cost.low)}–${moneyK(r.cost.high)} est. cost · ${pct(r.share)} of total</div></div></div>`).join("")}</div><a class="btn sm mt" href="#/economics">Open Economic Intelligence</a>` : emptyState("No verified knowledge cards yet", "Write cards in the Knowledge Library to rank families."), { sub: "Ranked by midpoint downtime cost (local cost assumptions)" })}
    ${panel("Estimated downtime burden", fams.length ? `<div class="kpi-value">${moneyK(exposure.mid)}</div><div class="muted small">range ${moneyK(exposure.low)} – ${moneyK(exposure.high)} · scenario estimate from downtime bands</div><div class="mt">${ranges(econ.map((r) => ({ label: r.title, low: r.cost.low, mid: r.cost.mid, high: r.cost.high })), { format: moneyK, width: 420 })}</div>` : emptyState("No cost data yet"), { sub: "Low · midpoint · high, from fingerprint downtime bands" })}
    ${panel("Hybrid inference activity", `<div class="grid g2"><div>${kpi("On-device calls", num(local.length), `median ${secs(median(local.map((e) => e.ms)))}`, "green")}</div><div>${kpi("Cloud calls", num(cloud.length), `median ${secs(median(cloud.map((e) => e.ms)))}`, "blue")}</div></div>
      <p class="muted small mt">${tel.length ? `${pct(local.length / Math.max(1, local.length + cloud.length))} of AI calls handled on-device in this browser. Setup and benchmark calls are excluded.` : "No AI calls recorded in this browser yet."}</p>`, { sub: "From real SDK responses (inferenceSource)" })}
  </div>
  <div class="grid g3 mt2">
    ${panel("Incidents by equipment", hbar(byEquip.map(([k, v]) => ({ label: k.replace(/_/g, " "), value: v })), { width: 420, labelW: 140 }))}
    ${panel("Open vs resolved by family", fams.length ? stacked(fams.map((f) => ({ label: f.title, parts: [{ value: f.members.filter((m) => m.status !== "resolved").length, color: "var(--amber)", name: "Open" }, { value: f.members.filter((m) => m.status === "resolved").length, color: "var(--green)", name: "Resolved" }] })), { width: 420, labelW: 150, legend: [{ name: "Open / monitoring", color: "var(--amber)" }, { name: "Resolved", color: "var(--green)" }] }) : emptyState("No families yet"))}
    ${panel("Network health", `<dl class="kv">
        <dt>Connection</dt><dd>${state.online ? badge("Online", "green", "online") : badge("Offline", "red", "offline")}</dd>
        <dt>Shared data</dt><dd>${state.poolFromCache ? badge("Cached copy", "amber") : badge("Live", "green")}</dd>
        <dt>Queued from this device</dt><dd>${pendingMine()}</dd>
        <dt>Knowledge cards</dt><dd>${state.cards.length} (${state.cards.filter((c) => c.review_status === "approved").length} approved)</dd>
        <dt>App Check</dt><dd>${state.appCheck === "ok" ? badge("Token obtained", "green") : state.appCheck === "error" ? badge("No token", "red") : badge("Checking", "neutral")}</dd>
        <dt>On-device model</dt><dd>${esc(state.model.status.replace(/_/g, " "))}</dd></dl>`)}
  </div>
  ${panel("Recent intelligence activity", recent.length ? `<div class="list">${recent.map((r) => `<div class="list-item">${icon(r.ic)}<div class="grow">${esc(r.text)}</div><span class="muted small">${ago(r.t)}</span></div>`).join("")}</div>` : emptyState("No activity yet"), { cls: "mt2" })}`;
}
