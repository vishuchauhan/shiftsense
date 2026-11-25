// Operator Studio: capture → on-device structuring → code checks → human review → share → state-aware insight.
import { state, subscribe, update, families, siteLabel } from "../state.js";
import { prepareDeviceModel, warmUp, extractIncident, explainEvidence, deviceAvailability } from "../ai.js";
import { verifyIncident, buildFingerprint, VOCAB } from "../privacy.js";
import { savePrivateIncident, loadPrivateIncidents, shareFingerprint, loadDraft, saveDraft, clearDraft, recordReuse, logBlocked } from "../store.js";
import { topMatches } from "../matching.js";
import { buildInsight, validateExplanation } from "../recommend.js";
import { esc, nice, secs, ago, render } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { badge, panel, callout, pageHead, btn, toast, emptyState } from "../ui/components.js";

// Survives navigation between workspaces.
const S = {
  phase: "capture", // capture | processing | review | shared
  note: "", machine: "P-104", shift: "Night",
  raw: null, incident: null, aiIncident: null, corrections: [], edited: new Set(), manual: false,
  fingerprint: null, sharedId: null, shareStatus: "", verified: false,
  explanation: null, explainState: "", error: "",
};
const d = loadDraft();
if (d) Object.assign(S, { note: d.note || "", machine: d.machine || S.machine, shift: d.shift || S.shift });
if (!S.note) S.note = "Press started vibrating after die change. Pressure dropped twice around 2 AM. Raj checked the filter but didn't find anything. Lost 42 minutes of production. Problem still not resolved.";

const ENUM_FIELDS = [
  ["equipment_type", "Equipment"], ["trigger", "Trigger"], ["status", "Status"],
  ["cause_category", "Confirmed cause"], ["resolution_category", "What fixed it"],
];

export default {
  mount(el) {
    const draw = () => render(el, view());
    draw();
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    el.addEventListener("change", onChange);
    const unsub = subscribe(() => refreshDynamic(el));
    deviceAvailability().then((a) => { state.model.availability = a; refreshDynamic(el); });
    return () => { unsub(); el.removeEventListener("click", onClick); el.removeEventListener("input", onInput); el.removeEventListener("change", onChange); };

    function onInput(e) {
      if (e.target.id === "note") { S.note = e.target.value; saveDraft({ note: S.note, machine: S.machine, shift: S.shift }); }
      if (e.target.id === "machine") { S.machine = e.target.value; saveDraft({ note: S.note, machine: S.machine, shift: S.shift }); }
    }
    function onChange(e) {
      if (e.target.id === "shift") { S.shift = e.target.value; saveDraft({ note: S.note, machine: S.machine, shift: S.shift }); }
      if (e.target.dataset.field) editField(e.target.dataset.field, e.target);
      if (e.target.id === "verifyFix") { S.verified = e.target.checked; rebuild(); draw(); }
    }
    async function onClick(e) {
      const a = e.target.closest("[data-action]")?.dataset.action;
      if (!a) return;
      if (a === "prepare") return prepare();
      if (a === "extract") return extract();
      if (a === "manual") { startManual(); return draw(); }
      if (a === "save-draft") { saveDraft({ note: S.note, machine: S.machine, shift: S.shift }); return toast("Draft saved on this device", "green"); }
      if (a === "clear") { Object.assign(S, { phase: "capture", note: "", raw: null, incident: null, fingerprint: null, sharedId: null, shareStatus: "", explanation: null, corrections: [], edited: new Set(), manual: false, verified: false, error: "" }); clearDraft(); return draw(); }
      if (a === "share") return share();
      if (a === "explain") return explain();
      if (a === "reuse") return reuse(e.target.closest("[data-card]").dataset.card);
    }

    async function prepare() {
      update({ model: { ...state.model, status: "downloading", progress: 0 } });
      try {
        const ms = await prepareDeviceModel((p) => update({ model: { ...state.model, status: "downloading", progress: p } }));
        update({ model: { ...state.model, status: "warming", prepareMs: ms } });
        const w = await warmUp().catch(() => null);
        update({ model: { ...state.model, status: "ready", warmMs: w } });
        toast("Gemini Nano is ready on this device", "green");
      } catch (err) {
        update({ model: { ...state.model, status: "unavailable", error: err.message } });
        toast("On-device model unavailable. Use manual capture; notes are never sent to the cloud.", "red", 7000);
      }
      draw();
    }

    async function extract() {
      if (!S.note.trim()) return toast("Write a note first", "amber");
      const note = S.note; // snapshot: the operator can keep typing
      Object.assign(S, { phase: "processing", error: "", explanation: null, sharedId: null, shareStatus: "", manual: false });
      draw();
      try {
        const raw = await extractIncident(note);
        const { incident, corrections } = verifyIncident(raw, note);
        Object.assign(S, { raw, aiIncident: { ...incident }, incident: { ...incident, note }, corrections, edited: new Set(), verified: false, phase: "review", processedNote: note });
        rebuild();
        savePrivateIncident({ machine: S.machine, shift: S.shift, note, ...incident, at: Date.now(), shared: false });
      } catch (err) {
        Object.assign(S, { phase: "capture", error: err.message });
        toast("On-device processing failed. Your note stays on this device. Try again or fill in manually.", "red", 7000);
      }
      draw();
    }

    function startManual() {
      const blank = { equipment_type: "other", symptoms: [], trigger: "unknown", cause_category: "unknown", status: "unresolved", resolution_category: "none", downtime_minutes: 0, safety_flag: false };
      const { incident } = verifyIncident(blank, S.note || "");
      Object.assign(S, { phase: "review", manual: true, raw: null, aiIncident: null, incident: { ...incident, note: S.note }, corrections: [], edited: new Set(), verified: false, processedNote: S.note });
      rebuild();
    }

    function editField(field, input) {
      let v = input.value;
      if (field === "downtime_minutes") v = Math.max(0, parseInt(v, 10) || 0);
      if (field === "symptoms") v = [...input.selectedOptions].map((o) => o.value);
      S.incident[field] = v;
      if (field === "status" && v !== "resolved") S.incident.resolution_category = "none";
      S.edited.add(field);
      rebuild();
      draw();
    }

    function rebuild() {
      try {
        S.fingerprint = buildFingerprint(S.incident, state.site, { resolutionVerified: S.verified });
        S.error = "";
      } catch (err) {
        S.fingerprint = null;
        S.error = err.message;
        logBlocked("fingerprint_rejected", err.message);
      }
    }

    async function share() {
      if (!S.fingerprint) return;
      try {
        const { id, pending, write } = await shareFingerprint(S.fingerprint);
        S.sharedId = id;
        S.phase = "shared";
        S.shareStatus = pending ? "queued" : "syncing";
        const all = loadPrivateIncidents();
        if (all[0]) { all[0].shared = id; localStorage.setItem("ss_private_incidents", JSON.stringify(all)); }
        draw();
        write.then(() => { S.shareStatus = "synced"; toast("Fingerprint synced to the network", "green"); draw(); })
          .catch((err) => { S.shareStatus = "failed"; toast("Sync rejected: " + err.message, "red"); draw(); });
      } catch (err) {
        logBlocked("share_blocked", err.message);
        toast("Blocked by the privacy gate: " + err.message, "red");
      }
    }

    async function explain() {
      const ins = currentInsight();
      if (!ins?.allowAI || !ins.evidence.length) return;
      const top = ins.evidence[0];
      const items = ins.evidence.slice(0, 4);
      S.explainState = "running";
      draw();
      try {
        const out = await explainEvidence(S.processedNote || S.note, top, items);
        const v = validateExplanation(out, [top.id]);
        S.explanation = v.ok ? { ok: true, text: out.explanation, id: top.id } : { ok: false, reason: v.reason };
        if (!v.ok) logBlocked("explanation_rejected", v.reason);
      } catch (err) {
        S.explanation = { ok: false, reason: err.message };
      }
      S.explainState = "";
      draw();
    }

    async function reuse(cardId) {
      try {
        const { write } = await recordReuse(cardId, state.site);
        toast("Reuse recorded for this site", "green");
        write.catch(() => toast("This site already recorded reuse of this card", "amber"));
      } catch (err) {
        toast(err.message, "red");
      }
    }
  },
};

function currentInsight() {
  if (!S.incident || !S.fingerprint) return null;
  return buildInsight({ ...S.incident, note: S.processedNote || S.note }, S.fingerprint, state.cards);
}

function refreshDynamic(el) {
  const m = el.querySelector("#modelBox");
  if (m) m.innerHTML = modelBox();
  const ins = el.querySelector("#insight");
  if (ins && S.fingerprint) ins.innerHTML = insightBody();
  const q = el.querySelector("#queue");
  if (q) q.innerHTML = queueBody();
}

// ---------------------------------------------------------------------------------------------
function view() {
  const steps = ["Capture", "Structure on-device", "Review & verify", "Share fingerprint", "Insight"];
  const idx = { capture: 0, processing: 1, review: 2, shared: 4 }[S.phase];
  return `
  ${pageHead("Operator Studio", "Record what happened on the floor. Gemini Nano structures it on this device; only a privacy-filtered fingerprint can be shared, after you approve it.")}
  <div class="steps" aria-label="Progress">${steps.map((s, i) => `<span class="${i < idx ? "done" : i === idx ? "now" : ""}">${i < idx ? icon("check") : ""}${s}</span>`).join("")}</div>
  <div class="grid g2">
    <div class="stack">
      ${panel("Shift note", captureBody(), { sub: "Stays on this device. Autosaved as a local draft.", actions: btn("Save draft", { action: "save-draft", tone: "sm" }) + btn("New note", { action: "clear", tone: "sm" }) })}
      ${panel("On-device model", `<div id="modelBox">${modelBox()}</div>`, { sub: "Gemini Nano via Firebase AI Logic · ONLY_ON_DEVICE for notes" })}
      ${panel("Offline queue and local history", `<div id="queue">${queueBody()}</div>`)}
    </div>
    <div class="stack">
      ${S.phase === "capture" ? panel("Structured incident", emptyState("Nothing structured yet", "Write the note, then structure it on-device. If the model is unavailable, fill in the fields manually.")) : ""}
      ${S.phase === "processing" ? panel("Structuring on this device…", `<div class="stack"><div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:90%"></div><div class="skeleton" style="width:55%"></div><p class="muted small">Gemini Nano is reading the note locally. You can keep typing; the note being processed was captured when you pressed the button.</p></div>`) : ""}
      ${S.phase === "review" || S.phase === "shared" ? reviewPanels() : ""}
    </div>
  </div>`;
}

function captureBody() {
  const shifts = ["Night", "Day", "Evening"];
  return `<div class="stack">
    <div class="grid g2">
      <label class="field">Machine (private)<input id="machine" value="${esc(S.machine)}" autocomplete="off" /></label>
      <label class="field">Shift<select id="shift">${shifts.map((s) => `<option${s === S.shift ? " selected" : ""}>${s}</option>`).join("")}</select></label>
    </div>
    <label class="field">What happened?<textarea id="note" class="big-input" rows="6" placeholder="e.g. Conveyor jammed at startup, belt looked loose, 20 min lost">${esc(S.note)}</textarea></label>
    ${S.error && S.phase === "capture" ? callout("red", esc(S.error), "alert") : ""}
    <div class="row">
      ${btn(S.phase === "processing" ? "Structuring…" : "Structure on-device", { action: "extract", tone: "primary lg", ic: "zap", disabled: state.model.status !== "ready" || S.phase === "processing" })}
      ${btn("Fill in manually", { action: "manual", tone: "lg", ic: "operator" })}
    </div>
    ${state.model.status !== "ready" ? `<p class="muted small">Prepare the on-device model first, or fill in the fields manually. Private notes never fall back to the cloud.</p>` : ""}
  </div>`;
}

function modelBox() {
  const m = state.model;
  const tone = m.status === "ready" ? "green" : m.status === "unavailable" ? "red" : "amber";
  const label = { ready: "Ready", downloading: `Downloading ${m.progress}%`, warming: "Warming up", unavailable: "Unavailable", not_prepared: "Not prepared" }[m.status] || m.status;
  return `<div class="row">${badge(label, m.status === "not_prepared" ? "neutral" : tone, "cpu")}
      <span class="muted small">Chrome reports: ${esc(m.availability)}</span><span class="spacer"></span>
      ${m.status === "ready" ? "" : btn(m.status === "downloading" || m.status === "warming" ? "Preparing…" : "Prepare model", { action: "prepare", tone: "primary", disabled: m.status === "downloading" || m.status === "warming" })}</div>
    <dl class="kv mt"><dt>Model preparation</dt><dd>${secs(m.prepareMs)}</dd><dt>Warm-up (setup, not counted as inference)</dt><dd>${secs(m.warmMs)}</dd></dl>
    ${m.status === "unavailable" ? callout("red", `${esc(m.error || "The on-device model could not be prepared.")} Use <b>Fill in manually</b>. Private tasks never fall back to the cloud.`, "alert") : ""}`;
}

function queueBody() {
  const mine = state.pool.filter((p) => p.site_token === state.site);
  const pend = mine.filter((p) => p.pending);
  const local = loadPrivateIncidents().slice(0, 5);
  return `<div class="row">${badge(`${pend.length} queued`, pend.length ? "amber" : "neutral", "sync")}${badge(`${mine.length} shared from this device`, "blue")}${badge(`${loadPrivateIncidents().length} private notes on this device`, "neutral", "lock")}</div>
    <div class="list mt">${local.length ? local.map((r) => `<div class="list-item"><span class="dot ${r.shared ? "green" : ""}"></span><div class="grow"><div>${esc(r.note).slice(0, 90)}${r.note?.length > 90 ? "…" : ""}</div><div class="muted small">${esc(r.machine)} · ${esc(r.shift)} · ${ago(r.at)} · ${r.shared ? "fingerprint shared" : "private only"}</div></div></div>`).join("") : `<p class="muted small">No local history yet.</p>`}</div>`;
}

function reviewPanels() {
  const inc = S.incident;
  const fixPresent = inc.status === "resolved" && inc.resolution_category && inc.resolution_category !== "none";
  const codeCheck = S.manual
    ? callout("blue", "Manual capture: no AI was used. Fill in what the note supports.", "operator")
    : S.corrections.length
      ? callout("amber", `<b>Code check corrected ${S.corrections.length} field${S.corrections.length > 1 ? "s" : ""}</b><ul>${S.corrections.map((c) => `<li><code>${esc(c.field)}</code>: ${esc(fmt(c.from))} → <b>${esc(fmt(c.to))}</b> <span class="muted">(${esc(c.why)})</span></li>`).join("")}</ul>`, "privacy")
      : callout("green", "Code check passed: the AI output is consistent with the note.", "check");
  const safety = { flagged: badge("Safety: flagged", "red", "alert"), explicitly_none: badge("Safety: none stated in note", "green"), not_stated: badge("Safety: not stated", "amber") }[inc.safety_status] || "";
  const shared = S.phase === "shared";
  return `
  ${panel("Review the structured incident", `
    ${codeCheck}
    <div class="row mt">${safety}${S.edited.size ? badge(`${S.edited.size} field(s) edited by you`, "amber", "operator") : ""}</div>
    <div class="fieldgrid mt">
      ${ENUM_FIELDS.map(([f, label]) => `<label class="field ${S.edited.has(f) ? "edited" : ""}">${label}<select data-field="${f}" ${shared ? "disabled" : ""}>${VOCAB[f].map((v) => `<option value="${v}"${v === inc[f] ? " selected" : ""}>${nice(v)}</option>`).join("")}</select></label>`).join("")}
      <label class="field ${S.edited.has("downtime_minutes") ? "edited" : ""}">Downtime (minutes)<input type="number" min="0" data-field="downtime_minutes" value="${Number(inc.downtime_minutes) || 0}" ${shared ? "disabled" : ""}/></label>
      <label class="field ${S.edited.has("symptoms") ? "edited" : ""}" style="grid-column:1/-1">Symptoms <span class="muted">(Ctrl/⌘-click to select several)</span><select multiple size="4" data-field="symptoms" ${shared ? "disabled" : ""}>${VOCAB.symptoms.map((v) => `<option value="${v}"${(inc.symptoms || []).includes(v) ? " selected" : ""}>${nice(v)}</option>`).join("")}</select></label>
    </div>`, { sub: "Fields come from Gemini Nano, checked by code. You are the final authority: edit anything that is wrong." })}

  ${panel("What stays vs. what can leave", `
    <div class="compare">
      <div><h4>${icon("lock")}Private · stays on this device</h4><dl class="kv"><dt>Machine</dt><dd>${esc(S.machine)}</dd><dt>Shift</dt><dd>${esc(S.shift)}</dd><dt>Note</dt><dd>${esc(S.processedNote || S.note)}</dd><dt>Exact downtime</dt><dd>${Number(inc.downtime_minutes) || 0} min</dd><dt>Safety status</dt><dd>${nice(inc.safety_status)}</dd></dl></div>
      <div><h4>${icon("globe")}Shareable fingerprint · pseudonymized</h4>${S.fingerprint ? `<dl class="kv">${["equipment_type", "process", "symptoms", "trigger", "cause_category", "status", "resolution_category", "downtime_bucket", "safety_flag", "site_token"].map((k) => `<dt>${nice(k)}</dt><dd>${esc(Array.isArray(S.fingerprint[k]) ? S.fingerprint[k].map((x) => x.replace(/_/g, " ")).join(", ") || "—" : String(S.fingerprint[k]).replace(/_/g, " "))}</dd>`).join("")}</dl>` : callout("red", "Blocked by the privacy gate: " + esc(S.error), "alert")}</div>
    </div>
    <p class="muted small mt">Only fixed categories can leave. The site token is a pseudonym, not anonymity: it links incidents from the same site.</p>
    <details class="inspector"><summary>Technical inspector (raw JSON)</summary><pre class="json">${esc(JSON.stringify({ model_output: S.raw, after_code_checks: S.aiIncident, fingerprint: S.fingerprint }, null, 2))}</pre></details>
    ${fixPresent ? `<label class="check"><input type="checkbox" id="verifyFix" ${S.verified ? "checked" : ""} ${shared ? "disabled" : ""}/> <span>I confirm the fix (<b>${nice(inc.resolution_category)}</b>) worked. Other plants will see it as operator-verified.</span></label>` : ""}
    <div class="row mt">
      ${btn(shared ? "Shared" : "Approve and share fingerprint", { action: "share", tone: "primary", ic: "check", disabled: !S.fingerprint || shared })}
      ${S.shareStatus ? badge({ queued: "Queued offline · syncs on reconnect", syncing: "Syncing…", synced: "Synced to network", failed: "Rejected by server" }[S.shareStatus], { queued: "amber", syncing: "blue", synced: "green", failed: "red" }[S.shareStatus], "sync") : ""}
    </div>`, { sub: "Human approval is required before anything is shared." })}

  ${panel("Insight for this incident", `<div id="insight">${insightBody()}</div>`, { sub: "State-aware. Evidence is ranked by code; Gemini Nano may only explain a selected item, on-device." })}`;
}

function insightBody() {
  const ins = currentInsight();
  if (!ins) return emptyState("No insight yet");
  const parts = [];
  const matches = topMatches(S.fingerprint, state.pool, { k: 4, excludeId: S.sharedId });

  if (ins.mode === "safety") {
    parts.push(callout("red", `<b>${esc(ins.headline)}</b><ul>${ins.guidance.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>`, "alert"));
  } else if (ins.mode === "resolved") {
    const fc = ins.fixComparison;
    parts.push(callout("green", `<b>${esc(ins.headline)}</b>${fc ? `<div class="mt">${fc.kind === "matches" ? `Matches the operator-verified fix in <b>${fc.count}</b> other incident${fc.count > 1 ? "s" : ""} of “${esc(ins.card.title)}”.` : `New for “${esc(ins.card?.title || "this pattern")}”. Sharing it adds a lesson other plants do not have yet.`}</div>` : ""}`, "check"));
    parts.push(`<b class="small">Follow-up documentation</b><ul class="small">${ins.guidance.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>`);
  } else if (ins.mode === "monitoring") {
    parts.push(callout("amber", `<b>${esc(ins.headline)}</b><ul>${ins.guidance.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>`, "info"));
  }

  if (ins.card && ins.mode !== "safety") {
    const k = ins.card;
    parts.push(`<div class="list-item"><span class="score" title="Feature similarity, not the probability of the same root cause">${Math.round(ins.similarity * 100)}%</span><div class="grow"><b>${esc(k.title)}</b>
      <div class="muted small">${esc(k.id)} · feature similarity · seen ${k.stats?.incidents}× across ${k.stats?.sites} plants · ${badge(k.review_status || "generated", k.review_status === "approved" ? "green" : k.review_status === "reviewed" ? "blue" : "amber")} ${state.cardsFromCache ? badge("offline copy", "neutral") : ""}</div></div>
      <button class="btn sm" data-action="reuse" data-card="${esc(k.id)}">${icon("check")}This helped</button></div>`);
  }

  if (ins.mode === "unresolved" || ins.mode === "monitoring") {
    if (ins.abstain) parts.push(callout("amber", esc(ins.abstain), "info"));
    if (ins.evidence?.length) {
      parts.push(`<b class="small">Ranked evidence <span class="muted">(historical data, ranked by code · qualified personnel, lockout/tagout)</span></b>
      <div class="list">${ins.evidence.slice(0, 4).map((e, i) => `<div class="list-item"><span class="badge ${i === 0 ? "blue" : ""}">${e.score.toFixed(2)}</span><div class="grow"><div>${e.kind === "verified_fix" ? badge("verified fix", "green") + " " : ""}${esc(e.text)}</div><div class="muted small">${esc(e.reasons.join(" · "))}</div><div class="muted small mono">${esc(e.id)}</div></div></div>`).join("")}</div>`);
    }
    if (ins.allowAI) {
      const ex = S.explanation;
      parts.push(`<div class="row">${btn(S.explainState ? "Explaining on-device…" : "Explain the top item (on-device, private)", { action: "explain", ic: "zap", disabled: !!S.explainState || state.model.status !== "ready" })}</div>
        ${ex ? (ex.ok ? callout("blue", `<b>Why this item</b> <span class="muted small">(AI explanation of historical evidence, not a diagnosis)</span><div>${esc(ex.text)}</div>`, "zap") : callout("amber", `Explanation withheld: ${esc(ex.reason)}. The ranked evidence above still stands.`, "privacy")) : ""}`);
    }
    if (ins.questions?.length) parts.push(`<b class="small">Investigation questions</b><ul class="small">${ins.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>`);
  }

  if (matches.length && ins.mode !== "safety") {
    parts.push(`<b class="small">Similar incidents in the network <span class="muted">(feature similarity, not proof of the same cause)</span></b>
    <div class="list">${matches.map((m) => `<div class="list-item"><span class="score">${Math.round(m.score * 100)}%</span><div class="grow"><div>${nice(m.item.equipment_type)} · ${m.item.symptoms.map((s) => s.replace(/_/g, " ")).join(", ")} · ${nice(m.item.trigger)}</div>
      <div class="muted small">${esc(siteLabel(m.item.site_token))} · ${nice(m.item.status)}${m.item.resolution_category && m.item.resolution_category !== "none" ? ` · fixed by ${nice(m.item.resolution_category)}${m.item.resolution_verified ? " ✓" : " (unverified)"}` : ""}</div></div></div>`).join("")}</div>`);
  }
  return `<div class="stack">${parts.join("")}</div>`;
}

const fmt = (v) => (Array.isArray(v) ? `[${v.join(", ")}]` : String(v));
