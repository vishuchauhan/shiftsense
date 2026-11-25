// Cooperative Intelligence: the free-rider problem in knowledge sharing, and how ShiftSense's mechanism changes it.
import { state, subscribe, siteLabel, isSynthetic } from "../state.js";
import { scoreRecords, ledger, DEFAULT_WEIGHTS, REWARD_TIERS } from "../contribution.js";
import { payoffMatrix, analyze, simulate, compareMechanisms, STRATEGIES, DEFAULT_PARAMS } from "../gametheory.js";
import { seedDemoReuse } from "../seed.js";
import { recordReuse } from "../store.js";
import { esc, num, pct, render } from "../ui/dom.js";
import { panel, pageHead, btn, badge, emptyState, callout, kpi, toast, table, sortRows } from "../ui/components.js";
import { line, hbar } from "../ui/charts.js";

const W = { ...DEFAULT_WEIGHTS };
const P = { ...DEFAULT_PARAMS };
const G = { plants: 6, rounds: 40, delta: 0.95, noise: 0.03, theta: 0.6, seed: 42, incentive: 5, privacyReduction: 0.6, mix: { always_c: 1, always_d: 1, tft: 2, conditional: 1, incentive: 1 } };
let recSort = { key: "K", dir: "desc" };
let showAll = false;

const PARAM_INFO = {
  V: ["Value of shared knowledge", 0, 20, 0.5], c: ["Contribution cost", 0, 10, 0.5], r: ["Perceived confidentiality risk", 0, 10, 0.5],
  s: ["Contribution incentive", 0, 10, 0.5], b: ["Network participation benefit", 0, 10, 0.5], k: ["Reciprocal cooperation value", 0, 10, 0.5], f: ["Free-riding benefit", -5, 10, 0.5],
};

export default {
  mount(el) {
    const draw = () => render(el, view());
    draw();
    const unsub = subscribe(() => { if (!el.querySelector("input:focus")) draw(); });
    // While a slider is dragged only its read-out changes; everything is recomputed when it is released.
    const apply = (t) => {
      if (t.dataset.w) W[t.dataset.w] = Number(t.value);
      else if (t.dataset.p) P[t.dataset.p] = Number(t.value);
      else if (t.dataset.g) G[t.dataset.g] = Number(t.value);
      else if (t.dataset.mix) G.mix[t.dataset.mix] = Math.max(0, Math.round(Number(t.value)));
      else return false;
      return true;
    };
    const onInput = (e) => {
      if (e.target.type === "range" && apply(e.target)) {
        const out = e.target.parentElement.querySelector("output");
        if (out) out.textContent = e.target.value;
      }
    };
    const onChange = (e) => { if (apply(e.target)) draw(); };
    const onClick = async (e) => {
      const th = e.target.closest("th[data-sort]");
      if (th) { recSort = { key: th.dataset.sort, dir: recSort.key === th.dataset.sort && recSort.dir === "desc" ? "asc" : "desc" }; return draw(); }
      const a = e.target.closest("[data-action]")?.dataset.action;
      if (a === "seed-reuse") {
        const verified = state.cards.filter((c) => c.verification?.status === "verified");
        if (!verified.length) return toast("Write knowledge cards first (Knowledge Library).", "amber");
        const n = await seedDemoReuse(verified, recordReuse);
        toast(`${n} synthetic reuse events recorded (labelled synthetic)`, "green");
      }
      if (a === "reset-game") { Object.assign(P, DEFAULT_PARAMS); draw(); }
      if (a === "toggle-all") { showAll = !showAll; draw(); }
    };
    el.addEventListener("input", onInput);
    el.addEventListener("change", onChange);
    el.addEventListener("click", onClick);
    return () => { unsub(); el.removeEventListener("input", onInput); el.removeEventListener("change", onChange); el.removeEventListener("click", onClick); };
  },
};

const slider = (attr, key, val, [label, min, max, step]) =>
  `<label class="field">${esc(label)}<div class="slider"><input type="range" id="${attr}-${key}" data-${attr}="${key}" min="${min}" max="${max}" step="${step}" value="${val}" aria-label="${esc(label)}"/><output>${val}</output></div></label>`;

function view() {
  return `${pageHead("Cooperative Intelligence", "Every plant benefits from shared knowledge, but contributing has costs: effort, confidentiality risk, competitive concerns. This workspace measures contributions and models the incentives, with every number computed from the data and parameters shown.")}
  ${contributionSection()}
  ${dilemmaSection()}
  ${repeatedSection()}
  ${assumptions()}`;
}

// ---------------- A + B: contribution scoring and ledger ----------------
function contributionSection() {
  if (!state.pool.length) return panel("Knowledge contribution ledger", emptyState("No shared incidents yet", "Load the demo network in Network Intelligence."));
  const sumW = W.Q + W.N + W.V + W.R || 1;
  const w = { Q: W.Q / sumW, N: W.N / sumW, V: W.V / sumW, R: W.R / sumW };
  const rows = scoreRecords(state.pool, state.cards, state.reuse, w, { exemptFromDuplicates: isSynthetic });
  const led = ledger(rows, state.pool);
  const dups = rows.filter((r) => r.duplicateOf).length;
  const scored = rows.filter((r) => !r.duplicateOf);
  const cols = [
    { key: "id", label: "Incident", render: (r) => `<span class="mono">${esc(/^FP-/.test(r.id) ? r.id : "LIVE-" + r.id.slice(0, 5))}</span>` },
    { key: "site", label: "Site", render: (r) => esc(siteLabel(r.site)) },
    { key: "K", label: "K", align: "r", render: (r) => `<b>${num(r.K)}</b>` },
    { key: "Q", label: "Q", align: "r", render: (r) => pct(r.Q) },
    { key: "N", label: "N", align: "r", render: (r) => pct(r.N) },
    { key: "V", label: "V", align: "r", render: (r) => pct(r.V) },
    { key: "R", label: "R", align: "r", render: (r) => pct(r.R) },
    { key: "reasons", label: "Why", sortable: false, render: (r) => `<span class="small muted">${esc(r.reasons.join(" · "))}</span>` },
  ];
  const syntheticReuse = state.reuse.filter((e) => e.synthetic).length;
  return `<div class="grid g4">
      ${kpi("Scored contributions", num(scored.length), `${dups} duplicate${dups === 1 ? "" : "s"} rejected`)}
      ${kpi("Verified outcomes", num(scored.filter((r) => r.V >= 0.6).length), `${scored.filter((r) => r.V === 1).length} corroborated at another site`, "green")}
      ${kpi("Novel contributions", num(scored.filter((r) => r.N >= 0.5).length), "novelty ≥ 50%")}
      ${kpi("Reuse events", num(state.reuse.length), syntheticReuse ? `${syntheticReuse} synthetic demo events` : "recorded by operators", "blue")}
    </div>
    <div class="grid g2 mt2">
      ${panel("Contribution score", `<div class="formula">K = 100 × (${w.Q.toFixed(2)}·Q + ${w.N.toFixed(2)}·N + ${w.V.toFixed(2)}·V + ${w.R.toFixed(2)}·R)</div>
        <div class="grid g2 mt">${["Q", "N", "V", "R"].map((k) => slider("w", k, W[k], [{ Q: "Q · evidence quality", N: "N · novelty", V: "V · verified outcome", R: "R · reuse by other sites" }[k], 0, 1, 0.05])).join("")}</div>
        <details class="inspector mt"><summary>How each component is computed</summary><ul class="small">
          <li><b>Q</b>: share of informative fields filled in (confirmed cause, trigger, symptoms, downtime, fix when resolved).</li>
          <li><b>N</b>: 1 − highest feature similarity to any earlier shared incident.</li>
          <li><b>V</b>: 1.0 if a verified fix is corroborated by the same fix verified at another site; 0.6 if only self-verified (self-confirmation is capped); 0.3 resolved without a verified fix; 0.2 cause confirmed but still open.</li>
          <li><b>R</b>: number of other sites that recorded reuse of a card citing this incident, capped at 3. Events from the contributor's own site do not count.</li>
          <li>Duplicates (same content, same site, within 10 minutes) earn nothing. Scores are recomputed from immutable shared records; no client submits credit values.</li>
          <li>Weights are adjustable assumptions, not validated coefficients. They are normalised to sum to 1.</li></ul></details>`, { sub: "Transparent and deterministic" })}
      ${panel("Site ledger", `${table([
        { key: "site", label: "Site", render: (s) => esc(siteLabel(s.site)) },
        { key: "incidents", label: "Incidents", align: "r" }, { key: "verified", label: "Verified", align: "r" }, { key: "novel", label: "Novel", align: "r" },
        { key: "reuse", label: "Reused by", align: "r", render: (s) => `${s.reuse} site${s.reuse === 1 ? "" : "s"}` }, { key: "duplicates", label: "Dupes", align: "r" },
        { key: "total", label: "Score", align: "r", render: (s) => `<b>${num(s.total)}</b>` },
        { key: "tier", label: "Tier", render: (s) => badge(s.tier.name, s.tier.min >= 800 ? "green" : s.tier.min >= 300 ? "blue" : "neutral") },
      ], led)}
        <p class="muted small mt">Tiers unlock non-critical analytics only: ${REWARD_TIERS.map((t) => `<b>${esc(t.name)}</b> (${t.min}+): ${esc(t.unlocks)}`).join("; ")}. Safety knowledge is never gated.</p>
        <div class="row mt">${btn("Record synthetic demo reuse events", { action: "seed-reuse", tone: "sm" })}<span class="muted small">Labelled synthetic; real events come from operators pressing “This helped”.</span></div>`, { sub: "Aggregated from scored contributions" })}
    </div>
    ${panel("Contribution ledger by incident", table(cols, sortRows(rows, cols, recSort.key, recSort.dir).slice(0, showAll ? 9999 : 12), { sortKey: recSort.key, sortDir: recSort.dir }) + (rows.length > 12 ? `<div class="row mt">${btn(showAll ? "Show top 12" : `Show all ${rows.length}`, { action: "toggle-all", tone: "sm" })}</div>` : ""), { sub: "Every score with the reasons it earned it", cls: "mt2" })}`;
}

// ---------------- C: one-shot dilemma ----------------
function dilemmaSection() {
  const m = payoffMatrix(P);
  const a = analyze(m);
  const cell = (r, c) => {
    const [x, y] = m[r][c];
    const ne = a.pure.includes(r + c);
    const brR = a.bestResponse[c].includes(r), brC = a.bestResponse[r].includes(c);
    return `<td class="${ne ? "ne" : ""}"><b class="${brR ? "br" : ""}">${fmt(x)}</b> , <b class="${brC ? "br" : ""}">${fmt(y)}</b>${ne ? `<div class="small" style="color:var(--green)">Nash equilibrium</div>` : ""}</td>`;
  };
  return panel("The sharing dilemma (one round, two plants)", `
    <div class="grid g2">
      <div>
        <p>A plant chooses to <b>contribute</b> knowledge or <b>withhold</b> it. If withholding pays more whatever the other plant does, every plant withholds and the network learns nothing, even though both would be better off sharing. That is the free-rider problem.</p>
        <div class="grid g2 mt">${Object.entries(PARAM_INFO).map(([k, info]) => slider("p", k, P[k], info)).join("")}</div>
        <div class="row mt">${btn("Reset parameters", { action: "reset-game", tone: "sm" })}</div>
      </div>
      <div>
        <table class="matrix" aria-label="Payoff matrix"><thead><tr><th>Plant A ↓ / Plant B →</th><th>B contributes</th><th>B withholds</th></tr></thead>
          <tbody><tr><th>A contributes</th>${cell("C", "C")}${cell("C", "D")}</tr><tr><th>A withholds</th>${cell("D", "C")}${cell("D", "D")}</tr></tbody></table>
        <p class="muted small mt">Payoffs (A, B). Blue = best response. Green = Nash equilibrium.</p>
        <dl class="kv mt">
          <dt>Game type</dt><dd>${badge(a.type, a.type.startsWith("Prisoner") || a.type.startsWith("Deadlock") ? "red" : a.type.startsWith("Harmony") ? "green" : "amber")}</dd>
          <dt>Dominant strategy</dt><dd>${a.dominant ? `${a.dominant.action === "C" ? "Contribute" : "Withhold"} (${a.dominant.kind})` : "None: the best choice depends on the other plant"}</dd>
          <dt>Pure equilibria</dt><dd>${a.pure.length ? a.pure.map((x) => ({ CC: "both contribute", CD: "A contributes, B withholds", DC: "A withholds, B contributes", DD: "both withhold" }[x])).join("; ") : "none"}</dd>
          <dt>Mixed equilibrium</dt><dd>${a.mixed ? `each contributes with probability ${pct(a.mixed.pC)}` : "none"}</dd>
          <dt>Most efficient outcome</dt><dd>${{ CC: "both contribute", CD: "one contributes", DD: "both withhold" }[a.efficient]} (total ${fmt(a.welfare[a.efficient])})</dd>
        </dl>
        ${a.pure.includes("CC") ? "" : a.efficient === "CC" ? callout("amber", "Both plants would be better off sharing, but no plant has a reason to share on its own. Raise the incentive or lower the confidentiality risk to see when this changes.", "alert") : ""}
      </div>
    </div>
    <details class="inspector mt"><summary>The payoff formulas</summary><div class="formula">
      both contribute: V − c − r + s + b + k = ${fmt(a.R)}<br>contribute alone: −c − r + s = ${fmt(a.S)}<br>free-ride: V + f = ${fmt(a.T)}<br>both withhold: 0</div></details>`, { cls: "mt2", sub: "Computed from the parameters; no conclusion is hard-coded" });
}

// ---------------- D–F: repeated game ----------------
function repeatedSection() {
  const strategies = Object.entries(G.mix).flatMap(([s, n]) => Array(n).fill(s));
  if (strategies.length < 2) return panel("Repeated game", callout("amber", "Add at least two plants to the strategy mix.", "alert"), { cls: "mt2" });
  const opts = { plants: strategies.length, rounds: G.rounds, strategies, params: P, delta: G.delta, noise: G.noise, theta: G.theta, seed: G.seed };
  const cmp = compareMechanisms(opts, { incentive: G.incentive, privacyReduction: G.privacyReduction });
  const b = cmp.baseline.sim, s = cmp.shiftsense.sim;
  // Privacy-risk sensitivity: cooperation as the fingerprint filter reduces perceived risk.
  const sweep = [0, 0.2, 0.4, 0.6, 0.8, 1].map((pr) => compareMechanisms(opts, { incentive: G.incentive, privacyReduction: pr }).shiftsense.sim.totals.cooperationRate);
  const stratNames = [...new Set(strategies)];
  return panel("Repeated game: baseline vs ShiftSense mechanism", `
    <div class="grid g3">
      <div class="stack">
        <b class="small">Strategy mix (${strategies.length} plants)</b>
        ${Object.keys(STRATEGIES).map((k) => `<label class="field">${esc(STRATEGIES[k])}<input type="number" min="0" max="10" data-mix="${k}" value="${G.mix[k]}"/></label>`).join("")}
      </div>
      <div class="stack">
        <b class="small">Simulation settings</b>
        ${slider("g", "rounds", G.rounds, ["Rounds", 5, 100, 1])}
        ${slider("g", "delta", G.delta, ["Discount factor δ", 0.5, 1, 0.01])}
        ${slider("g", "noise", G.noise, ["Decision noise ε", 0, 0.2, 0.01])}
        ${slider("g", "theta", G.theta, ["Conditional cooperator threshold θ", 0, 1, 0.05])}
        <label class="field">Random seed<input type="number" data-g="seed" value="${G.seed}"/></label>
      </div>
      <div class="stack">
        <b class="small">ShiftSense mechanism</b>
        ${slider("g", "incentive", G.incentive, ["Contribution incentive s", 0, 10, 0.5])}
        ${slider("g", "privacyReduction", G.privacyReduction, ["Assumed risk reduction from fingerprint filter", 0, 1, 0.05])}
        ${callout("neutral", "Baseline: no incentive, full confidentiality risk. ShiftSense: incentive s and risk × (1 − reduction). The reduction is a scenario assumption, not a measured guarantee.", "info")}
      </div>
    </div>
    <div class="grid g4 mt2">
      ${kpi("Cooperation rate", `${pct(b.totals.cooperationRate)} → ${pct(s.totals.cooperationRate)}`, "baseline → ShiftSense", s.totals.cooperationRate > b.totals.cooperationRate ? "green" : "")}
      ${kpi("Discounted network welfare", `${num(b.totals.discountedWelfare)} → ${num(s.totals.discountedWelfare)}`, "includes incentive value")}
      ${kpi("Free-riding rate", `${pct(b.totals.freeRideRate)} → ${pct(s.totals.freeRideRate)}`, "withholding while others share")}
      ${kpi("Utility inequality (Gini)", `${b.totals.utilityGini.toFixed(2)} → ${s.totals.utilityGini.toFixed(2)}`, `contribution Gini ${b.totals.contributionGini.toFixed(2)} → ${s.totals.contributionGini.toFixed(2)}`)}
    </div>
    <div class="grid g2 mt2">
      <div><b class="small">Cooperation rate over time</b>${line([{ name: "Baseline", values: b.series.coop, color: "var(--muted)", dashed: true }, { name: "ShiftSense mechanism", values: s.series.coop, color: "var(--c1)" }], { yMax: 1, yFormat: (v) => Math.round(v * 100) + "%", xLabel: "round" })}</div>
      <div><b class="small">Knowledge stock (contributions with 5% decay per round)</b>${line([{ name: "Baseline", values: b.series.stock, color: "var(--muted)", dashed: true }, { name: "ShiftSense mechanism", values: s.series.stock, color: "var(--c2)" }], { xLabel: "round" })}</div>
      <div><b class="small">Collective utility per round</b>${line([{ name: "Baseline", values: b.series.welfare, color: "var(--muted)", dashed: true }, { name: "ShiftSense mechanism", values: s.series.welfare, color: "var(--c4)" }], { xLabel: "round" })}</div>
      <div><b class="small">Average cumulative utility by strategy (ShiftSense)</b>${hbar(stratNames.map((k, i) => ({ label: STRATEGIES[k], value: Math.max(0, s.byStrategy[k]), note: `baseline ${num(b.byStrategy[k])}`, color: `var(--c${(i % 6) + 1})` })), { labelW: 170 })}</div>
      <div><b class="small">Distribution of benefits by plant (ShiftSense)</b>${hbar(s.plants.map((p) => ({ label: `Plant ${p.id} · ${STRATEGIES[p.strategy]}`, value: Math.max(0, p.cumulative), note: `${p.contributions} contributions` })), { labelW: 210 })}</div>
      <div><b class="small">Privacy-risk sensitivity</b>${line([{ name: "Cooperation rate with the mechanism", values: sweep, color: "var(--c5)" }], { yMax: 1, yFormat: (v) => Math.round(v * 100) + "%", xLabel: "assumed risk reduction 0% → 100%" })}</div>
    </div>`, { cls: "mt2", sub: "Seeded and reproducible. Every chart is recomputed from the settings above." });
}

function assumptions() {
  return panel("Model assumptions and limitations", `<ul class="small">
    <li>Payoffs are stylised utility units for exploration, not money. Parameters are assumptions you can change, not estimates from data.</li>
    <li>In the multi-plant game each plant's benefit grows with the share of other plants contributing. Tit-for-tat contributes when at least half of the others contributed last round (with two plants it mirrors the other plant exactly); conditional cooperators use threshold θ; incentive-responsive plants contribute when contributing paid at least as much as withholding last round.</li>
    <li>Welfare under the mechanism includes the value of the incentive itself; who funds that incentive is outside the model.</li>
    <li>The reduction in confidentiality risk from deterministic fingerprints is a scenario assumption. ShiftSense reduces what is shared, but cannot quantify how plants perceive the remaining risk.</li>
    <li>Contribution scores rely on site tokens, which are self-asserted under anonymous demo sign-in. A production network needs verified organisation membership to prevent one company posing as several sites.</li>
    <li>No tokens, cryptocurrency or tradable credits are involved. Rewards only unlock non-critical analytics, and safety knowledge is always available to everyone.</li></ul>`, { cls: "mt2" });
}

const fmt = (x) => (Math.round(x * 10) / 10).toString();
