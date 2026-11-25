import { watchFingerprints } from "./store.js";
import { isValidShared } from "./privacy.js";
import { clusterFingerprints } from "./clustering.js";
import { generateCard, saveCard, watchCards, cloudPayload, cardId } from "./knowledge.js";
import { seedDemoNetwork, DEMO_SITES } from "./seed.js";
import { loadTelemetry } from "./ai.js";
import { economics } from "./economics.js";


// ---- Show any error on screen (debug aid) ----
const showErr = (msg) => { const el = document.getElementById("status") || document.getElementById("badge"); if (el) el.textContent = "❌ " + msg; console.error(msg); };
addEventListener("error", (e) => showErr(e.message));
addEventListener("unhandledrejection", (e) => showErr(e.reason?.message || String(e.reason)));

const $ = (id) => document.getElementById(id);
let pool = [];
let clusters = [];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nice = (s) => esc(String(s).replace(/_/g, " "));
const trig = (t) => (String(t).startsWith("after_") ? nice(t) : ["unknown", "none_observed"].includes(t) ? "no clear trigger" : "after " + nice(t));
const idLabel = (id) => (/^FP-\d+$/.test(id) ? id : "LIVE-" + String(id).slice(0, 4));
const fixesText = (s) => {
  const e = Object.entries(s.verified_fixes || {}).sort((a, b) => b[1] - a[1]);
  const txt = e.map(([f, n]) => `${nice(f)} (${n})`).join(", ") || "no verified fix yet";
  return txt + (s.unverified_fixes ? ` <span class="muted">· ${s.unverified_fixes} unverified</span>` : "");
};
const evidenceText = (e) => e
  ? `<span class="ev ${e.level}">${e.level}</span> ${e.top_cause_count} of ${e.incidents} incidents have a confirmed ${nice(e.top_cause)} cause · ${e.verified_fixes} verified fixes`
  : "n/a";
const siteName = (t) => DEMO_SITES[t] ?? `Site ${String(t).slice(5, 9)}`;

// ---- Network pill ----
function renderNet() {
  $("net").textContent = navigator.onLine ? "online" : "offline";
  $("net").className = "pill " + (navigator.onLine ? "on" : "off");
}
addEventListener("online", renderNet);
addEventListener("offline", renderNet);
renderNet();

// ---- Inference log ----
addEventListener("ss-telemetry", ({ detail: e }) => {
  const onDevice = String(e.source).toUpperCase() === "ON_DEVICE";
  const li = document.createElement("li");
  li.textContent = `${onDevice ? "⚡ ON-DEVICE" : "☁️ CLOUD"} · ${e.task} · ${e.ms} ms`;
  $("log").prepend(li);
});

// ---- Live pool ----
watchFingerprints((items, { fromCache }) => {
  pool = items.filter(isValidShared);
  const sites = new Set(pool.map((i) => i.site_token)).size;
  $("poolInfo").textContent = `${pool.length} shared incidents · ${sites} sites${fromCache ? " · cached" : ""}`;
});

// ---- Seed ----
$("seed").onclick = async () => {
  $("seed").disabled = true;
  $("status").textContent = "connecting to network… (if this stays here, another ShiftSense tab is holding the database)";
  try {
    const r = await seedDemoNetwork((n, total) => ($("status").textContent = `loading demo network ${n}/${total}…`));
    $("status").textContent = `✅ demo network loaded (${r.written} new, ${r.skipped} already there)`;
  } catch (e) {
    $("status").textContent = "❌ " + e.message;
  } finally {
    $("seed").disabled = false;
  }
};

// ---- Step 1: clustering in code ----
$("analyse").onclick = () => {
  const t0 = performance.now();
  clusters = clusterFingerprints(pool);
  const ms = Math.round(performance.now() - t0);
  $("status").textContent = `Found ${clusters.length} recurring patterns in ${pool.length} incidents · ${ms} ms · no AI, no cloud call`;
  $("cards").disabled = clusters.length === 0;
  renderClusters();
};

function renderClusters() {
  $("clustersCard").classList.remove("hidden");
  $("clusters").innerHTML = clusters
    .map((c, i) => {
      const s = c.stats, g = c.signature;
      return `<div class="cluster">
        <div class="cluster-head">
          <b>Pattern ${i + 1}: ${nice(g.equipment_type)} · ${g.symptoms.map(nice).join(" + ")} · ${trig(g.trigger)}</b>
          <span class="muted small">${s.incidents} incidents · ${s.sites} plants · ${s.open} open · ~${s.est_downtime_min} min downtime</span>
        </div>
        <div class="chips">${c.evidence_ids.map((id) => `<span class="chip ${/^FP-/.test(id) ? "" : "live"}" title="${esc(id)}">${esc(idLabel(id))}</span>`).join("")}</div>
        <details><summary class="muted small">Exactly what will be sent to the cloud for this pattern</summary>
          <pre>${esc(JSON.stringify(cloudPayload(c), null, 2))}</pre></details>
      </div>`;
    })
    .join("");
}

// ---- Step 2: cloud knowledge cards ----
$("cards").onclick = async () => {
  $("cards").disabled = true;
  let ok = 0, rejected = 0, failed = 0;
  for (let i = 0; i < clusters.length; i++) {
    $("status").textContent = `☁️ writing card ${i + 1}/${clusters.length} in the cloud…`;
    try {
      const card = await generateCard(clusters[i]);
      await saveCard(clusters[i], card);
      card.verification.status === "verified" ? ok++ : rejected++;
    } catch (e) {
      failed++;
      console.warn(cardId(clusters[i]), e);
    }
  }
  $("status").textContent = `✅ ${ok} cards verified · ${rejected} rejected for invalid citations · ${failed} failed`;
  $("cards").disabled = false;
};

let latestCards = [];
watchCards((cards) => {
  latestCards = cards;
  renderEconomics();
  if (!cards.length) return;
  $("cardsList").innerHTML = cards
    .sort((a, b) => b.stats.incidents - a.stats.incidents)
    .map((k) => {
      const v = k.verification, s = k.stats;
      const causes = Object.entries(s.confirmed_causes || {}).map(([c, n]) => `${nice(c)} (${n})`).join(", ") || "none confirmed yet";
      return `<article class="kcard ${v.status}">
        <div class="kcard-head">
          <span class="kid">${esc(k.id)}</span>
          <h3>${esc(k.title)}</h3>
          <span class="pill ${v.status === "verified" ? "on" : "off"}">${v.status === "verified" ? "✓ citations verified" : "✗ rejected"} · ${v.valid}/${v.cited}</span>
        </div>
        <div class="kstats">
          <div><b>${s.incidents}</b><span>incidents</span></div>
          <div><b>${s.sites}</b><span>plants</span></div>
          <div><b>${s.open}</b><span>still open</span></div>
          <div><b>~${s.est_downtime_min}</b><span>min downtime</span></div>
        </div>
        <p>${esc(k.pattern_summary)}</p>
        <p class="small"><b>Confirmed causes (from data):</b> ${causes}</p>
        <p class="small"><b>What fixed it (operator-verified):</b> ${fixesText(s)}</p>
        <p class="small"><b>Evidence strength (computed):</b> ${evidenceText(k.evidence)}</p>
        <p class="small"><b>Likely mechanism:</b> ${esc(k.likely_mechanism)} <span class="tag">AI hypothesis · not confirmed by evidence</span></p>
        <div class="two">
          <div><b class="small">Check first (AI suggestion · qualified personnel, lockout/tagout)</b><ol>${(k.suggested_first_checks || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>
          <div><b class="small">Open questions</b><ul>${(k.open_questions || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
        </div>
        <div class="chips"><span class="muted small">Evidence:</span>${(k.cited_ids || []).map((id) => `<span class="chip ok" title="${esc(id)}">${esc(idLabel(id))}</span>`).join("")}
          ${(v.invalid_refs || []).map((id) => `<span class="chip bad" title="not in this pattern">${esc(id)} ✗</span>`).join("")}</div>
      </article>`;
    })
    .join("");
});

// ---- Economics ----
const money = (n) => "$" + Math.round(n).toLocaleString();
function renderEconomics() {
  const verified = latestCards.filter((k) => k.verification?.status === "verified");
  if (!verified.length) return;
  const rows = economics(verified, { costPerMin: Number($("costMin").value) || 0, reductionPct: Number($("reduction").value) || 0 });
  $("economics").innerHTML = `<table class="tbl"><thead><tr>
      <th>#</th><th>Pattern</th><th>Incidents</th><th>Open</th><th>Est. downtime</th><th>Repeat-failure cost</th><th>Avoidable if fixed</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(r.title)}</b><div class="muted small">${esc(r.id)}</div></td>
      <td>${r.incidents}</td><td>${r.open}</td><td>${r.downtimeMin.toLocaleString()} min</td>
      <td>${money(r.cost)}</td><td><b>${money(r.avoidable)}</b></td></tr>`).join("")}
    <tr class="total"><td></td><td>Total across patterns</td><td>${rows.reduce((t, r) => t + r.incidents, 0)}</td><td>${rows.reduce((t, r) => t + r.open, 0)}</td>
      <td>${rows.reduce((t, r) => t + r.downtimeMin, 0).toLocaleString()} min</td><td>${money(rows.reduce((t, r) => t + r.cost, 0))}</td>
      <td><b>${money(rows.reduce((t, r) => t + r.avoidable, 0))}</b></td></tr></tbody></table>`;
}
$("costMin").oninput = renderEconomics;
$("reduction").oninput = renderEconomics;

// ---- Hybrid audit ----
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
function renderAudit() {
  const t = loadTelemetry();
  const local = t.filter((e) => e.source === "ON_DEVICE");
  const cloud = t.filter((e) => e.source !== "ON_DEVICE");
  const rawToCloud = cloud.filter((e) => e.input === "raw_note").length;
  const byTask = {};
  for (const e of t) {
    const k = `${e.task}|${e.source}|${e.input || "?"}`;
    (byTask[k] ||= []).push(e.ms);
  }
  $("audit").innerHTML = `
    <div class="kstats">
      <div><b>${local.length}</b><span>on-device calls</span></div>
      <div><b>${cloud.length}</b><span>cloud calls</span></div>
      <div><b>${t.length ? Math.round((100 * local.length) / t.length) : 0}%</b><span>handled on-device</span></div>
      <div class="${rawToCloud ? "bad" : "good"}"><b>${rawToCloud}</b><span>raw notes sent to cloud</span></div>
    </div>
    <table class="tbl"><thead><tr><th>Task</th><th>Where it ran</th><th>Data it carried</th><th>Calls</th><th>Median latency</th></tr></thead><tbody>
    ${Object.entries(byTask).map(([k, ms]) => { const [task, src, input] = k.split("|");
      return `<tr><td>${esc(task)}</td><td>${src === "ON_DEVICE" ? "⚡ on-device" : "☁️ cloud"}</td>
      <td>${input === "raw_note" ? "🔒 private note" : "🌐 fingerprints only"}</td><td>${ms.length}</td><td>${(median(ms) / 1000).toFixed(1)} s</td></tr>`; }).join("")}
    </tbody></table>`;
}
renderAudit();
addEventListener("ss-telemetry", renderAudit);
addEventListener("storage", (e) => e.key === "ss_telemetry" && renderAudit());
