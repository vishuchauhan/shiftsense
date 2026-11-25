// Evaluation Lab: deterministic regression suite + live, measured model benchmarks. Untested = shown as untested.
import { state, subscribe, telemetry } from "../state.js";
import { runSuite } from "../evaluation-tests.js";
import { NOTES, runBenchmark, loadResults, clearResults, verifierOnLabels } from "../bench.js";
import { extractIncident, extractSyntheticInCloud } from "../ai.js";
import { median, percentile, mean } from "../stats.js";
import { esc, pct, secs, ago, num, render } from "../ui/dom.js";
import { panel, pageHead, btn, badge, callout, kpi, notTested, toast, confirmDialog, table } from "../ui/components.js";
import { hbar } from "../ui/charts.js";

let suite = null;
let running = "";
let progress = "";

export default {
  mount(el) {
    const draw = () => render(el, view());
    if (!suite) suite = runSuite();
    draw();
    const unsub = subscribe(() => { if (!running) draw(); });
    const onClick = async (e) => {
      const a = e.target.closest("[data-action]")?.dataset.action;
      if (!a || running) return;
      if (a === "rerun") { suite = runSuite(); toast("Regression suite re-run", "green"); return draw(); }
      if (a === "clear") { if (await confirmDialog("Clear benchmark results", "Deletes stored benchmark measurements from this browser.", { confirm: "Clear", danger: true })) { clearResults(); draw(); } return; }
      const split = el.querySelector("#split")?.value || "heldout";
      if (a === "bench-local") {
        if (state.model.status !== "ready") return toast("Prepare the on-device model in Operator Studio first.", "amber");
        return run("on_device", extractIncident, split, draw);
      }
      if (a === "bench-cloud") {
        if (!state.online) return toast("The cloud benchmark needs a connection.", "amber");
        const ok = await confirmDialog("Run cloud benchmark", "Sends the fictional benchmark notes (no real data) to cloud Gemini through Firebase AI Logic, using ONLY_IN_CLOUD. Logged as 'synthetic_note', never as a private note.", { confirm: "Run" });
        if (ok) return run("cloud", extractSyntheticInCloud, split, draw);
      }
    };
    el.addEventListener("click", onClick);
    return () => { unsub(); el.removeEventListener("click", onClick); };
  },
};

async function run(name, fn, split, draw) {
  running = name;
  try {
    await runBenchmark(name, fn, { split, onProgress: (i, n, id) => { progress = `${i}/${n}${id ? " · " + id : ""}`; draw(); } });
    toast(`${name === "cloud" ? "Cloud" : "On-device"} benchmark finished`, "green");
  } catch (err) { toast(err.message, "red"); }
  running = ""; progress = "";
  draw();
}

function view() {
  const res = loadResults();
  const L = res.on_device, C = res.cloud;
  const pass = suite.filter((r) => r.pass).length;
  const groups = [...new Set(suite.map((r) => r.group))];
  const vol = verifierOnLabels();
  const volBroken = vol.filter((r) => r.accuracy < 1);
  const tel = telemetry();
  const extract = tel.filter((e) => e.task === "extract_incident" && e.ok !== false);
  const setup = tel.filter((e) => e.kind === "setup");
  const offline = tel.filter((e) => e.task === "extract_incident" && e.online === false);

  const metric = (label, l, c, fmt = (x) => x, better = "") => `<tr><td>${esc(label)}</td><td class="r">${l == null ? notTested() : fmt(l)}</td><td class="r">${c == null ? notTested() : fmt(c)}</td>${better ? `<td class="small muted">${esc(better)}</td>` : "<td></td>"}</tr>`;

  return `${pageHead("Evaluation Lab", "Reproducible checks of everything around the models, and live measurements of the models themselves. Results are measured in this browser; anything not run yet is marked as not tested.", btn("Re-run regression suite", { action: "rerun", ic: "play" }))}
  <div class="grid g4">
    ${kpi("Regression suite", `${pass}/${suite.length}`, "deterministic tests passing", pass === suite.length ? "green" : "red")}
    ${kpi("On-device benchmark", L ? pct(L.checkedAccuracy) : "—", L ? `field accuracy · n=${L.completed} · ${ago(L.at)}` : "not run yet", L ? "green" : "")}
    ${kpi("Cloud benchmark", C ? pct(C.checkedAccuracy) : "—", C ? `field accuracy · n=${C.completed} · ${ago(C.at)}` : "not run yet", C ? "blue" : "")}
    ${kpi("Secrets leaked (benchmarks)", L || C ? num((L?.secretsLeaked || 0) + (C?.secretsLeaked || 0)) : "—", L || C ? `of ${(L?.secretsPlanted || 0) + (C?.secretsPlanted || 0)} planted` : "not run yet", L || C ? ((L?.secretsLeaked || 0) + (C?.secretsLeaked || 0) ? "red" : "green") : "")}
  </div>

  ${panel("Live model benchmark: local vs cloud on the same task", `
    <div class="toolbar"><label class="field" style="flex-direction:row;align-items:center;gap:8px">Notes<select id="split"><option value="heldout">Held-out set (${NOTES.filter((n) => n.split === "heldout").length})</option><option value="dev">Development set (${NOTES.filter((n) => n.split === "dev").length})</option><option value="all">All (${NOTES.length})</option></select></label>
      ${btn(running === "on_device" ? `Running on-device ${progress}` : "Run on-device benchmark", { action: "bench-local", tone: "primary", ic: "zap", disabled: !!running })}
      ${btn(running === "cloud" ? `Running cloud ${progress}` : "Run cloud benchmark", { action: "bench-cloud", ic: "cloud", disabled: !!running })}
      ${btn("Clear results", { action: "clear", tone: "sm" })}</div>
    ${callout("neutral", "Fictional, labelled notes with planted names, machine IDs, volumes, prompt injections, safety events, unsuccessful fixes and similar-symptom/different-cause cases. The held-out set was written separately and never used to tune prompts or rules. On a CPU-only laptop the on-device run takes several minutes.", "info")}
    <div class="table-wrap mt"><table class="tbl"><thead><tr><th>Metric</th><th class="r">On-device (Gemini Nano)</th><th class="r">Cloud (Gemini)</th><th>Note</th></tr></thead><tbody>
      ${metric("Notes completed", L && `${L.completed}/${L.n}`, C && `${C.completed}/${C.n}`)}
      ${metric("Field accuracy, raw model output", L?.rawAccuracy, C?.rawAccuracy, pct)}
      ${metric("Field accuracy, after code checks", L?.checkedAccuracy, C?.checkedAccuracy, pct, "what is actually shared")}
      ${metric("Unsupported causes in raw output", L && `${L.rawHallucinatedCause}/${L.completed}`, C && `${C.rawHallucinatedCause}/${C.completed}`)}
      ${metric("Unsupported causes after code checks", L && `${L.checkedHallucinatedCause}/${L.completed}`, C && `${C.checkedHallucinatedCause}/${C.completed}`)}
      ${metric("Unsupported fixes raw → checked", L && `${L.rawHallucinatedFix} → ${L.checkedHallucinatedFix}`, C && `${C.rawHallucinatedFix} → ${C.checkedHallucinatedFix}`)}
      ${metric("Safety status correct", L && `${L.safetyCorrect}/${L.completed}`, C && `${C.safetyCorrect}/${C.completed}`, (x) => x, "flagged / explicitly none / not stated")}
      ${metric("Planted secrets in fingerprints", L && `${L.secretsLeaked}/${L.secretsPlanted}`, C && `${C.secretsLeaked}/${C.secretsPlanted}`)}
      ${metric("Median latency", L?.medianMs, C?.medianMs, secs)}
      ${metric("P95 latency", L?.p95Ms, C?.p95Ms, secs)}
      ${metric("First call in run", L?.firstMs, C?.firstMs, secs, "warm-up is excluded; see below")}
      ${metric("Offline completion", L && (L.offlineAttempts ? `${L.offlineCompleted}/${L.offlineAttempts}` : null), C && (C.offlineAttempts ? `${C.offlineCompleted}/${C.offlineAttempts}` : null), (x) => x, "run with the network off to measure")}
    </tbody></table></div>
    ${L || C ? `<div class="grid g2 mt">${[L, C].filter(Boolean).map((r) => `<div><b class="small">${r.name === "cloud" ? "Cloud" : "On-device"}: accuracy by field (after code checks)</b>${hbar(Object.entries(r.fieldAccuracy).map(([k, v]) => ({ label: k.replace(/_/g, " "), value: Math.round((v || 0) * 100), color: r.name === "cloud" ? "var(--c1)" : "var(--c2)" })), { format: (v) => v + "%", labelW: 140, width: 440 })}</div>`).join("")}</div>` : ""}
    <p class="muted small mt">Labels are a single annotator's judgement; some categories (for example cause) are genuinely ambiguous. Sample sizes are small; treat differences of one or two notes as noise.</p>`, { cls: "mt2", sub: "Same notes, same schema, same code checks; only the model location differs" })}

  <div class="grid g2 mt2">
    ${panel("Latency in normal use (this browser)", `<dl class="kv">
      <dt>On-device extractions</dt><dd>${extract.length ? `${extract.length} · median ${secs(median(extract.map((e) => e.ms)))} · P95 ${secs(percentile(extract.map((e) => e.ms), 95))}` : notTested("No extractions yet")}</dd>
      <dt>Model preparation (setup)</dt><dd>${setup.filter((e) => e.task === "model_prepare").length ? secs(median(setup.filter((e) => e.task === "model_prepare").map((e) => e.ms))) : notTested()}</dd>
      <dt>Warm-up (setup, excluded above)</dt><dd>${setup.filter((e) => e.task === "model_warm_up").length ? secs(median(setup.filter((e) => e.task === "model_warm_up").map((e) => e.ms))) : notTested()}</dd>
      <dt>Offline extractions</dt><dd>${offline.length ? `${offline.filter((e) => e.ok !== false).length}/${offline.length} completed with the network off` : notTested("No offline extractions recorded")}</dd>
      <dt>Cloud fallback (unsupported device)</dt><dd>${notTested("Not applicable: Android is out of scope and this Chrome device supports Gemini Nano")}</dd></dl>
      <p class="muted small mt">On this laptop the model runs on the CPU, so on-device is slower than the cloud. Its value here is privacy, offline operation and no per-call cost, not speed.</p>`)}
    ${panel("Code checks on perfect answers", `<p class="small">If the model returned exactly the labelled answer, how often would the code checks change a correct field?</p>
      <div class="kpi-value mt">${vol.length - volBroken.length}/${vol.length}</div><div class="muted small">notes left fully correct</div>
      ${volBroken.length ? callout("amber", `<b>Known trade-off:</b> the rules are conservative. In ${volBroken.length} note(s) a correct cause was reset to “unknown” because the note did not use a confirmation phrase:<ul>${volBroken.map((r) => `<li>${esc(r.id)}: ${esc(r.corrections.map((c) => `${c.field} ${c.from} → ${c.to}`).join("; "))}</li>`).join("")}</ul>Under-claiming a cause is preferred to inventing one. These cases are in the held-out set, so the rules were not tuned to them.`, "info") : callout("green", "No correct field was changed.", "check")}`)}
  </div>

  ${panel("Deterministic regression suite", groups.map((g) => {
    const rs = suite.filter((r) => r.group === g);
    return `<div class="mt"><div class="row"><b>${esc(g)}</b>${badge(`${rs.filter((r) => r.pass).length}/${rs.length}`, rs.every((r) => r.pass) ? "green" : "red")}</div>
      <div class="list mt">${rs.map((r) => `<div class="list-item">${r.pass ? badge("pass", "green", "check") : badge("fail", "red", "x")}<div class="grow small">${esc(r.name)}${r.detail ? `<div class="muted">${esc(r.detail)}</div>` : ""}</div></div>`).join("")}</div></div>`;
  }).join("") + `<p class="muted small mt">The same suite runs in Node with <code>npm test</code> and in CI.</p>`, { cls: "mt2", sub: "Schema, leakage, hallucination, injection, similarity, clustering, citations, claims, duplicates, statistics, economics, game theory" })}

  ${L || C ? panel("Per-note results", table([
    { key: "id", label: "Note" }, { key: "tags", label: "Type", render: (r) => esc(r.tags.join(", ")) },
    { key: "m", label: "Model", render: (r) => esc(r.model) },
    { key: "acc", label: "Accuracy raw → checked", align: "r", render: (r) => (r.ok ? `${pct(r.raw.accuracy)} → <b>${pct(r.checked.accuracy)}</b>` : badge("failed", "red")) },
    { key: "s", label: "Safety", render: (r) => (r.ok ? (r.safetyOk ? "✓" : "✗") : "") },
    { key: "l", label: "Leaked", render: (r) => (r.ok ? (r.leaked.length ? badge(r.leaked.join(", "), "red") : "none") : esc(r.error || "")) },
    { key: "ms", label: "Time", align: "r", render: (r) => secs(r.ms) },
  ], [...(L?.rows || []).map((r) => ({ ...r, model: "on-device" })), ...(C?.rows || []).map((r) => ({ ...r, model: "cloud" }))]), { cls: "mt2" }) : ""}`;
}
