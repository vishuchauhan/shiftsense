// Privacy Center: what stays local, what is shared, what left the device, and the evidence for each claim.
import { state, subscribe, telemetry, pendingMine, privateCount } from "../state.js";
import { POLICY, isPrivacyViolation } from "../routing.js";
import { loadOutbound } from "../knowledge.js";
import { clearPrivateIncidents, clearDraft, loadBlocked, clearBlocked } from "../store.js";
import { clearTelemetry } from "../ai.js";
import { runSuite } from "../evaluation-tests.js";
import { esc, nice, ago, secs, render } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { panel, pageHead, btn, badge, callout, kpi, toast, confirmDialog, table, emptyState } from "../ui/components.js";

let suite = null;

export default {
  mount(el) {
    const draw = () => render(el, view());
    if (!suite) suite = runSuite().filter((r) => ["Sensitive-field leakage", "Prompt injection", "Schema validation", "Safety handling"].includes(r.group));
    draw();
    const unsub = subscribe(draw);
    const onClick = async (e) => {
      const a = e.target.closest("[data-action]")?.dataset.action;
      if (!a) return;
      const actions = {
        "clear-private": ["Delete private notes", "Deletes every raw note stored on this device. Shared fingerprints are not affected. This cannot be undone.", () => { clearPrivateIncidents(); clearDraft(); }],
        "clear-telemetry": ["Clear inference history", "Deletes the local log of AI calls used for the hybrid audit.", () => clearTelemetry()],
        "clear-outbound": ["Clear outbound log", "Deletes the local copy of cloud request payloads.", () => localStorage.removeItem("ss_outbound")],
        "clear-blocked": ["Clear blocked-event log", "Deletes the local log of rejected and blocked events.", () => clearBlocked()],
        "clear-cache": ["Reset offline cache", "Deletes Firestore's offline copy and the offline app cache on this device, then reloads. Unsynced fingerprints will be lost.", clearCaches],
      };
      const [title, text, fn] = actions[a] || [];
      if (!fn) return;
      if (await confirmDialog(title, text, { confirm: "Delete", danger: true })) { await fn(); toast(`${title}: done`, "green"); draw(); }
    };
    el.addEventListener("click", onClick);
    return () => { unsub(); el.removeEventListener("click", onClick); };
  },
};

async function clearCaches() {
  try {
    const dbs = (await indexedDB.databases?.()) || [];
    for (const d of dbs) if (d.name && /firestore|firebase/i.test(d.name)) indexedDB.deleteDatabase(d.name);
    for (const k of await caches.keys()) await caches.delete(k);
  } finally {
    setTimeout(() => location.reload(), 300);
  }
}

const ARCH = `<svg class="arch" viewBox="0 0 900 250" role="img" aria-label="Architecture: private data stays on the device, only fingerprints go to the cloud">
  <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="var(--muted)"/></marker></defs>
  <rect x="8" y="8" width="520" height="234" rx="10" fill="none" stroke="var(--green)" stroke-dasharray="5 4"/><text x="20" y="28" style="font-weight:700;fill:var(--green)">THIS DEVICE (Chrome)</text>
  <rect x="570" y="8" width="322" height="234" rx="10" fill="none" stroke="var(--brand)" stroke-dasharray="5 4"/><text x="582" y="28" style="font-weight:700;fill:var(--brand)">CLOUD (Firebase)</text>
  <rect class="box" x="22" y="46" width="108" height="50" rx="6"/><text x="76" y="68" text-anchor="middle">Raw shift note</text><text x="76" y="84" text-anchor="middle" class="t-small">private</text>
  <rect class="dev" x="152" y="46" width="118" height="50" rx="6"/><text x="211" y="68" text-anchor="middle">Gemini Nano</text><text x="211" y="84" text-anchor="middle" class="t-small">ONLY_ON_DEVICE</text>
  <rect class="code" x="292" y="46" width="108" height="50" rx="6"/><text x="346" y="68" text-anchor="middle">Code checks</text><text x="346" y="84" text-anchor="middle" class="t-small">verify · allowlist</text>
  <rect class="box" x="422" y="46" width="94" height="50" rx="6"/><text x="469" y="64" text-anchor="middle">Fingerprint</text><text x="469" y="80" text-anchor="middle" class="t-small">+ human approval</text>
  <rect class="cloud" x="600" y="46" width="120" height="50" rx="6"/><text x="660" y="68" text-anchor="middle">Firestore</text><text x="660" y="84" text-anchor="middle" class="t-small">fingerprints only</text>
  <rect class="code" x="600" y="118" width="120" height="44" rx="6"/><text x="660" y="138" text-anchor="middle">Clustering (code)</text><text x="660" y="152" text-anchor="middle" class="t-small">no AI</text>
  <rect class="cloud" x="750" y="118" width="130" height="44" rx="6"/><text x="815" y="138" text-anchor="middle">Cloud Gemini</text><text x="815" y="152" text-anchor="middle" class="t-small">ONLY_IN_CLOUD</text>
  <rect class="cloud" x="750" y="186" width="130" height="44" rx="6"/><text x="815" y="206" text-anchor="middle">Knowledge cards</text><text x="815" y="220" text-anchor="middle" class="t-small">citations checked</text>
  <rect class="dev" x="292" y="176" width="224" height="50" rx="6"/><text x="404" y="198" text-anchor="middle">Offline cards + on-device matching</text><text x="404" y="214" text-anchor="middle" class="t-small">private note meets shared knowledge here</text>
  <path class="arrow" d="M130 71h20"/><path class="arrow" d="M270 71h20"/><path class="arrow" d="M400 71h20"/><path class="arrow" d="M516 71h82"/>
  <path class="arrow" d="M660 96v20"/><path class="arrow" d="M720 140h28"/><path class="arrow" d="M815 162v22"/><path class="arrow" d="M750 208H518"/>
  <text x="557" y="64" text-anchor="middle" class="t-small">sync</text></svg>`;

function view() {
  const tel = telemetry();
  const violations = tel.filter(isPrivacyViolation);
  const out = loadOutbound();
  const blocked = loadBlocked();
  const rejectedCards = state.cards.filter((c) => c.verification?.status === "rejected");
  const suitePass = suite.filter((r) => r.pass).length;
  const fpFields = ["schema_version", "equipment_type", "process", "symptoms", "trigger", "cause_category", "status", "downtime_bucket", "resolution_category", "resolution_verified", "safety_flag", "site_token"];

  return `${pageHead("Privacy Center", "Where every piece of data lives and goes, with the measurements and tests behind each claim. Shared data is privacy-filtered and pseudonymized; it is not anonymous.")}
  <div class="grid g4">
    ${kpi("Raw notes sent to cloud", violations.length, `from ${tel.length} recorded AI calls in this browser`, violations.length ? "red" : "green")}
    ${kpi("Privacy tests", `${suitePass}/${suite.length}`, "deterministic, run on page load", suitePass === suite.length ? "green" : "red")}
    ${kpi("Private notes on device", privateCount(), "never synced")}
    ${kpi("App Check", state.appCheck === "ok" ? "Active" : state.appCheck === "error" ? "No token" : "Checking", "requests attested before reaching AI Logic", state.appCheck === "ok" ? "green" : state.appCheck === "error" ? "red" : "")}
  </div>
  ${panel("Architecture", ARCH, { sub: "Private notes stay inside the green boundary. Only allowlisted fingerprints cross into the cloud.", cls: "mt2" })}
  <div class="grid g2 mt2">
    ${panel("Model routing policy", table([
      { key: "task", label: "Task", render: (r) => `<code>${esc(r.task)}</code>` },
      { key: "mode", label: "Mode", render: (r) => badge(r.mode, r.mode === "ONLY_ON_DEVICE" ? "green" : r.mode === "ONLY_IN_CLOUD" ? "blue" : "amber") },
      { key: "input", label: "Data", render: (r) => (r.input === "raw_note" ? badge("private note", "red", "lock") : r.input === "synthetic_note" ? badge("fictional note", "neutral") : badge("fingerprints", "blue", "globe")) },
      { key: "why", label: "Why", render: (r) => `<span class="small">${esc(r.why)}</span>` },
    ], Object.entries(POLICY).map(([task, p]) => ({ task, ...p }))) + `<p class="muted small mt">Read directly from <code>src/routing.js</code>, the table every model is built from. Private tasks have no cloud fallback: if Gemini Nano is unavailable, the note waits or is filled in manually.</p>`, { sub: "Local-only enforcement for private data" })}
    ${panel("Data inventory", `<div class="grid g2">
      <div><h4 class="small">${icon("lock")} Private · this device only</h4><ul class="small">
        <li>Raw shift notes, machine IDs, names, exact downtime (localStorage · ${privateCount()} notes)</li>
        <li>Draft note (localStorage)</li><li>Cost assumptions (localStorage)</li>
        <li>AI call log: task, source, latency, data kind; never note text (localStorage · ${tel.length} entries)</li>
        <li>Offline copy of shared data (IndexedDB)</li></ul></div>
      <div><h4 class="small">${icon("globe")} Shared · Firestore (pseudonymized)</h4><ul class="small">
        <li>Fingerprints: ${fpFields.map((f) => `<code>${f}</code>`).join(" ")}</li>
        <li>Reuse events: card ID, site token, synthetic flag</li>
        <li>Knowledge cards: AI text, code-computed stats, review status</li></ul>
        <p class="muted small">The site token links incidents from the same site. Combined with outside knowledge it could help identify a site, so it is pseudonymous, not anonymous.</p></div></div>`)}
  </div>
  <div class="grid g2 mt2">
    ${panel("Outbound payload inspector", out.length ? `<div class="list">${out.slice().reverse().slice(0, 8).map((o, i) => `<details class="list-item inspector" ${i === 0 ? "open" : ""}><summary><b>${esc(o.task)}</b> · ${o.payload?.incidents?.length ?? 0} fingerprints · ${ago(o.at)}</summary><pre class="json">${esc(JSON.stringify(o.payload, null, 2))}</pre></details>`).join("")}</div>` : emptyState("No cloud requests recorded yet", "Write knowledge cards in the Knowledge Library; each request payload appears here exactly as sent."), { sub: "Exact JSON of each cloud request from this browser" })}
    ${panel("Inference source history", tel.length ? table([
      { key: "at", label: "When", render: (e) => ago(e.at) },
      { key: "task", label: "Task", render: (e) => `<code>${esc(e.task)}</code>` },
      { key: "source", label: "Ran", render: (e) => (e.source === "ON_DEVICE" ? badge("on-device", "green", "zap") : e.source === "FAILED" ? badge("failed", "red") : badge("cloud", "blue", "cloud")) },
      { key: "input", label: "Data", render: (e) => esc(nice(e.input)) },
      { key: "ms", label: "Time", align: "r", render: (e) => secs(e.ms) },
      { key: "online", label: "Network", render: (e) => (e.online === false ? badge("offline", "amber") : "online") },
      { key: "v", label: "Check", render: (e) => (isPrivacyViolation(e) ? badge("VIOLATION", "red") : badge("ok", "green")) },
    ], tel.slice().reverse().slice(0, 25)) : emptyState("No AI calls recorded yet"), { sub: "Source as reported by the SDK (inferenceSource), last 25 calls" })}
  </div>
  <div class="grid g2 mt2">
    ${panel("Blocked or rejected", (blocked.length || rejectedCards.length) ? `<div class="list">${rejectedCards.map((c) => `<div class="list-item">${badge("card rejected", "red")}<div class="grow">${esc(c.id)}: invalid citations ${esc((c.verification.invalid_refs || []).join(", "))}</div></div>`).join("")}${blocked.slice().reverse().slice(0, 12).map((b) => `<div class="list-item">${badge(b.kind.replace(/_/g, " "), "amber")}<div class="grow small">${esc(b.detail)}</div><span class="muted small">${ago(b.at)}</span></div>`).join("")}</div>` : emptyState("Nothing blocked yet", "Rejected fingerprints, invalid citations and withheld AI explanations appear here."), { sub: "Privacy gate, citation checks and explanation validator", actions: btn("Clear", { action: "clear-blocked", tone: "sm" }) })}
    ${panel("Privacy test results", `<div class="list">${suite.map((r) => `<div class="list-item">${r.pass ? badge("pass", "green", "check") : badge("fail", "red", "x")}<div class="grow"><b class="small">${esc(r.group)}</b> · ${esc(r.name)}${r.detail ? `<div class="muted small">${esc(r.detail)}</div>` : ""}</div></div>`).join("")}</div><p class="muted small mt">Full suite and live benchmarks are in the Evaluation Lab.</p>`)}
  </div>
  <div class="grid g2 mt2">
    ${panel("Synchronization", `<dl class="kv"><dt>Connection</dt><dd>${state.online ? "online" : "offline"}</dd><dt>Shared data</dt><dd>${state.poolFromCache ? "cached copy (may be stale)" : "live"}</dd><dt>Queued fingerprints</dt><dd>${pendingMine()}</dd><dt>Duplicate protection</dt><dd>client-generated document IDs; rules forbid updates</dd></dl>`)}
    ${panel("Data controls", `<div class="stack">
      <div class="row">${btn("Delete private notes", { action: "clear-private", tone: "danger", ic: "trash" })}${btn("Clear inference history", { action: "clear-telemetry", tone: "", ic: "trash" })}${btn("Clear outbound log", { action: "clear-outbound", ic: "trash" })}</div>
      <div class="row">${btn("Reset offline cache and reload", { action: "clear-cache", tone: "danger", ic: "trash" })}</div>
      <p class="muted small">Shared fingerprints cannot be edited or deleted from the app: rules make them immutable. A production deployment would add an administrator deletion process.</p></div>`)}
  </div>
  ${panel("Known limitations", `<ul class="small">
    <li>Fingerprints are privacy-filtered and pseudonymized, not anonymous. A site token links a site's incidents; rare equipment or patterns could still be recognisable.</li>
    <li>Anonymous Firebase sign-in is for this demo. A real multi-company network needs organisation accounts, verified site membership and role-based access.</li>
    <li>Any signed-in demo user can edit knowledge-card review status. Production would restrict this to authorised reviewers.</li>
    <li>"Raw notes sent to cloud" counts calls made in this browser. It is a measurement on this device, not a guarantee about other clients.</li>
    <li>Firestore rules check field names and the schema version; value-level validation runs in the client. A trusted server-side check (Cloud Functions) is recommended for production.</li>
    <li>The App Check debug token is only for local development and is never committed.</li></ul>`, { cls: "mt2" })}`;
}
