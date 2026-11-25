// Network Intelligence: every approved fingerprint, the failure families code found, and drill-downs.
import { state, subscribe, clusters, siteLabel, isSynthetic } from "../state.js";
import { seedDemoNetwork } from "../seed.js";
import { similarity, topMatches } from "../matching.js";
import { esc, nice, num, render, $ } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { panel, pageHead, btn, badge, table, sortRows, openDrawer, toast, emptyState, kpi, callout } from "../ui/components.js";
import { stacked } from "../ui/charts.js";

const F = { q: "", equipment: "", status: "", site: "", family: "", source: "", sortKey: "id", sortDir: "asc", limit: 25 };

export default {
  mount(el) {
    const draw = () => render(el, view());
    draw();
    const unsub = subscribe(draw);
    const onClick = async (e) => {
      const th = e.target.closest("th[data-sort]");
      if (th) { F.sortDir = F.sortKey === th.dataset.sort && F.sortDir === "asc" ? "desc" : "asc"; F.sortKey = th.dataset.sort; return draw(); }
      const ff = e.target.closest("[data-family-filter]");
      if (ff) { F.family = ff.dataset.familyFilter; draw(); return document.querySelector(".toolbar")?.scrollIntoView({ behavior: "smooth" }); }
      const row = e.target.closest("[data-open]");
      if (row) return drill(row.dataset.open);
      const a = e.target.closest("[data-action]")?.dataset.action;
      if (a === "seed") {
        e.target.closest("button").disabled = true;
        toast("Loading the synthetic demo network…");
        try {
          const r = await seedDemoNetwork();
          toast(`Demo network loaded: ${r.written} new, ${r.skipped} already present`, "green");
        } catch (err) { toast(err.message, "red"); }
      }
      if (a === "more") { F.limit = 9999; return draw(); }
      if (a === "reset-filters") { Object.assign(F, { q: "", equipment: "", status: "", site: "", family: "", source: "" }); draw(); }
    };
    const onInput = (e) => { if (e.target.dataset.f) { F[e.target.dataset.f] = e.target.value; draw(); } };
    const onKey = (e) => { if (e.key === "Enter" && e.target.matches("th[data-sort], tr[data-open]")) e.target.click(); };
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    el.addEventListener("keydown", onKey);
    return () => { unsub(); el.removeEventListener("click", onClick); el.removeEventListener("input", onInput); el.removeEventListener("keydown", onKey); };
  },
};

function familyOf() {
  const m = new Map();
  clusters().forEach((c, i) => c.evidence_ids.forEach((id) => m.set(id, i + 1)));
  return m;
}

const COLS = (fam) => [
  { key: "id", label: "ID", render: (r) => `<span class="mono">${esc(shortId(r.id))}</span>` },
  { key: "equipment_type", label: "Equipment", render: (r) => nice(r.equipment_type) },
  { key: "symptoms", label: "Symptoms", render: (r) => esc(r.symptoms.map((s) => s.replace(/_/g, " ")).join(", ")), sort: (r) => r.symptoms.join() },
  { key: "trigger", label: "Trigger", render: (r) => nice(r.trigger) },
  { key: "status", label: "Status", render: (r) => badge(r.status, r.status === "resolved" ? "green" : "amber") },
  { key: "cause_category", label: "Cause", render: (r) => nice(r.cause_category) },
  { key: "resolution_category", label: "Fix", render: (r) => (r.resolution_category && r.resolution_category !== "none" ? `${nice(r.resolution_category)}${r.resolution_verified ? " ✓" : ""}` : `<span class="muted">—</span>`) },
  { key: "downtime_bucket", label: "Downtime", render: (r) => nice(r.downtime_bucket) },
  { key: "site", label: "Site", render: (r) => esc(siteLabel(r.site_token)), sort: (r) => siteLabel(r.site_token) },
  { key: "family", label: "Family", render: (r) => (fam.get(r.id) ? badge(`#${fam.get(r.id)}`, "blue") : `<span class="muted">—</span>`), sort: (r) => fam.get(r.id) || 99 },
];

function view() {
  const pool = state.pool;
  const cl = clusters();
  const fam = familyOf();
  const head = pageHead("Network Intelligence", "Every approved, privacy-filtered fingerprint in the network, and the recurring failure families that plain code finds in them.", btn("Load demo network (45 synthetic incidents)", { action: "seed", ic: "database" }));
  if (!state.poolLoaded) return head + `<div class="skeleton"></div>`;
  if (!pool.length) return head + emptyState("No shared incidents yet", "Load the synthetic demo network above, or share an incident from Operator Studio.");

  const sites = [...new Set(pool.map((p) => p.site_token))];
  const rows = pool.filter((r) =>
    (!F.q || JSON.stringify([r.id, r.equipment_type, r.symptoms, r.trigger, r.status, r.cause_category, r.resolution_category]).toLowerCase().includes(F.q.toLowerCase())) &&
    (!F.equipment || r.equipment_type === F.equipment) && (!F.status || r.status === F.status) && (!F.site || r.site_token === F.site) &&
    (!F.family || String(fam.get(r.id) || "none") === F.family) && (!F.source || (F.source === "synthetic" ? isSynthetic(r) : !isSynthetic(r))));
  const cols = COLS(fam);
  const sorted = sortRows(rows, cols, F.sortKey, F.sortDir);
  const opt = (k, values, label, fmt = (v) => v.replace(/_/g, " ")) => `<select id="f-${k}" data-f="${k}" aria-label="${label}"><option value="">${label}: all</option>${values.map((v) => `<option value="${esc(v)}"${F[k] === v ? " selected" : ""}>${esc(fmt(v))}</option>`).join("")}</select>`;

  // family × site recurrence matrix
  const matrix = cl.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Family</th>${sites.map((s) => `<th class="c">${esc(siteLabel(s))}</th>`).join("")}<th class="c">Sites</th></tr></thead><tbody>
    ${cl.map((c, i) => `<tr><td><b>#${i + 1}</b> ${nice(c.signature.equipment_type)} · ${nice(c.signature.trigger)}</td>${sites.map((s) => { const n = c.members.filter((m) => m.site_token === s).length; return `<td class="c">${n ? `<b>${n}</b>` : `<span class="muted">·</span>`}</td>`; }).join("")}<td class="c">${c.stats.sites}</td></tr>`).join("")}</tbody></table></div>` : emptyState("No recurring families yet");

  return `${head}
  <div class="grid g4">
    ${kpi("Approved incidents", num(pool.length), `${pool.filter(isSynthetic).length} synthetic`)}
    ${kpi("Failure families (code)", num(cl.length), "average-linkage clustering, threshold 0.65")}
    ${kpi("Incidents in a family", num(fam.size), `${pool.length - fam.size} unclustered`)}
    ${kpi("Cross-site families", num(cl.filter((c) => c.stats.sites > 1).length), "seen at more than one site", "blue")}
  </div>
  <div class="grid g2 mt2">
    ${panel("Recurring failure families", cl.length ? `<div class="list">${cl.map((c, i) => `<div class="list-item"><span class="badge blue">#${i + 1}</span><div class="grow"><b>${nice(c.signature.equipment_type)} · ${c.signature.symptoms.map((s) => s.replace(/_/g, " ")).join(" + ")} · ${nice(c.signature.trigger)}</b>
      <div class="muted small">${c.stats.incidents} incidents · ${c.stats.sites} sites · ${c.stats.open} open · evidence ${c.evidence.level}</div></div><button class="btn sm" data-family-filter="${i + 1}">Show incidents</button></div>`).join("")}</div>` : emptyState("No families found"), { sub: "Found by plain math (no AI). Cards for these families are written in the Knowledge Library." })}
    ${panel("Open and resolved by family", cl.length ? stacked(cl.map((c, i) => ({ label: `#${i + 1} ${c.signature.equipment_type.replace(/_/g, " ")}`, parts: [{ value: c.stats.open, color: "var(--amber)", name: "Open" }, { value: c.stats.resolved, color: "var(--green)", name: "Resolved" }] })), { width: 480, labelW: 150, legend: [{ name: "Open / monitoring", color: "var(--amber)" }, { name: "Resolved", color: "var(--green)" }] }) : emptyState("No families"))}
  </div>
  ${panel("Cross-site recurrence", matrix, { sub: "Incidents per family and site. Synthetic plants are labelled.", cls: "mt2" })}
  ${panel("Incident explorer", `
    <div class="toolbar">
      <input type="search" id="f-q" data-f="q" placeholder="Search incidents" value="${esc(F.q)}" aria-label="Search incidents" />
      ${opt("equipment", [...new Set(pool.map((p) => p.equipment_type))].sort(), "Equipment")}
      ${opt("status", ["unresolved", "monitoring", "resolved"], "Status")}
      ${opt("site", sites, "Site", siteLabel)}
      ${opt("family", [...cl.map((_, i) => String(i + 1)), "none"], "Family", (v) => (v === "none" ? "unclustered" : "#" + v))}
      ${opt("source", ["synthetic", "live"], "Source")}
      <button class="btn sm" data-action="reset-filters">Reset</button>
      <span class="muted small">${rows.length} of ${pool.length}</span>
    </div>
    ${table(cols, sorted.slice(0, F.limit), { sortKey: F.sortKey, sortDir: F.sortDir, rowAttr: (r) => `data-open="${esc(r.id)}" tabindex="0"`, empty: "No incidents match these filters" })}
    ${sorted.length > F.limit ? `<div class="row mt">${btn(`Show all ${sorted.length}`, { action: "more", tone: "sm" })}</div>` : ""}`, { sub: "Click a row to inspect the fingerprint, its family and its nearest neighbours.", cls: "mt2" })}`;
}

function drill(id) {
  const r = state.pool.find((p) => p.id === id);
  if (!r) return;
  const cl = clusters();
  const ci = cl.findIndex((c) => c.evidence_ids.includes(id));
  const c = cl[ci];
  const sim = c ? similarity(r, c.signature) : null;
  const near = topMatches(r, state.pool, { k: 5, threshold: 0, excludeId: id });
  const { id: _, pending, owner, created_at, ...fp } = r;
  openDrawer(`Fingerprint ${shortId(id)}`, `
    <div class="row">${isSynthetic(r) ? badge("synthetic demo record", "amber") : badge("live record", "blue")}${pending ? badge("not synced yet", "amber") : ""}${badge(siteLabel(r.site_token), "neutral")}</div>
    <dl class="kv">${Object.entries(fp).map(([k, v]) => `<dt>${nice(k)}</dt><dd>${esc(Array.isArray(v) ? v.join(", ").replace(/_/g, " ") : String(v).replace(/_/g, " "))}</dd>`).join("")}</dl>
    ${c ? `<div><b>Family #${ci + 1}</b> <span class="muted small">(${c.stats.incidents} incidents, ${c.stats.sites} sites)</span>
      <div class="muted small">Feature similarity to the family signature: <b>${Math.round(sim.score * 100)}%</b></div>
      ${breakdown(sim.parts)}</div>` : callout("neutral", "Not part of a recurring family.", "info")}
    <div><b>Nearest incidents</b><div class="list mt">${near.map((m) => `<div class="list-item"><span class="score">${Math.round(m.score * 100)}%</span><div class="grow"><span class="mono small">${esc(shortId(m.item.id))}</span> · ${nice(m.item.equipment_type)} · ${esc(m.item.symptoms.join(", ").replace(/_/g, " "))}<div class="muted small">${esc(siteLabel(m.item.site_token))}</div>${breakdown(m.parts)}</div></div>`).join("")}</div></div>
    <p class="muted small">Feature similarity = 0.35·equipment + 0.30·symptom overlap (Jaccard) + 0.20·trigger + 0.15·process. It is not the probability of the same root cause.</p>`);
}

const breakdown = (p) => `<div class="muted small">equipment ${p.equipment ? "✓" : "✗"} · symptoms ${Math.round(p.symptoms * 100)}% · trigger ${p.trigger ? "✓" : "✗"} · process ${p.process ? "✓" : "✗"}</div>`;
export const shortId = (id) => (/^FP-\d+$/.test(id) ? id : "LIVE-" + String(id).slice(0, 5));
