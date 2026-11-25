// Knowledge Library: evidence-backed cards. Numbers by code, text by cloud Gemini, three levels of checking.
import { state, subscribe, clusters, siteLabel, isSynthetic } from "../state.js";
import { generateCard, saveCard, setCardReview, cardId } from "../knowledge.js";
import { checkEvidenceConsistency } from "../citations.js";
import { esc, nice, ago, tsMs, render } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { panel, pageHead, btn, badge, emptyState, callout, openDrawer, toast, confirmDialog, kpi } from "../ui/components.js";
import { shortId } from "./network.js";

const F = { q: "", equipment: "", level: "", review: "", open: null };
let busy = "";

export default {
  mount(el) {
    const draw = () => render(el, view());
    draw();
    const unsub = subscribe(draw);
    const onClick = async (e) => {
      const ref = e.target.closest("[data-ref]");
      if (ref) return showRef(ref.dataset.ref);
      const t = e.target.closest("[data-toggle]");
      if (t) { F.open = F.open === t.dataset.toggle ? null : t.dataset.toggle; return draw(); }
      const a = e.target.closest("[data-action]");
      if (!a) return;
      if (a.dataset.action === "generate") return generateAll(draw);
      if (a.dataset.action === "regen") return generateOne(a.dataset.id, draw);
      if (a.dataset.action === "review") return review(a.dataset.id, a.dataset.status);
    };
    const onInput = (e) => { if (e.target.dataset.f) { F[e.target.dataset.f] = e.target.value; draw(); } };
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    return () => { unsub(); el.removeEventListener("click", onClick); el.removeEventListener("input", onInput); };
  },
};

async function generateAll(draw) {
  const cl = clusters();
  if (!cl.length) return toast("No recurring families found yet. Load data in Network Intelligence.", "amber");
  if (!state.online) return toast("Writing cards needs the cloud. You are offline; existing cards remain available.", "amber");
  let ok = 0, rej = 0, fail = 0;
  for (let i = 0; i < cl.length; i++) {
    busy = `Writing card ${i + 1} of ${cl.length} in the cloud…`;
    draw();
    try {
      const card = await generateCard(cl[i]);
      await saveCard(cl[i], card);
      card.verification.status === "verified" ? ok++ : rej++;
    } catch (err) { fail++; console.warn(err); }
  }
  busy = "";
  toast(`${ok} cards verified · ${rej} rejected for invalid citations · ${fail} failed`, fail || rej ? "amber" : "green", 6000);
  draw();
}

async function generateOne(id, draw) {
  const c = clusters().find((x) => cardId(x) === id);
  if (!c) return toast("This family is no longer found in the current data.", "amber");
  busy = `Regenerating ${id}…`;
  draw();
  try { await saveCard(c, await generateCard(c)); toast(`${id} regenerated as a new version. Review status reset to generated.`, "green"); }
  catch (err) { toast(err.message, "red"); }
  busy = "";
  draw();
}

async function review(id, status) {
  const text = status === "approved"
    ? "Approving records that a qualified person has reviewed this card for use in your plant. It does not replace your approved maintenance procedures."
    : status === "reviewed" ? "Mark this card as reviewed by a qualified person?" : "Return this card to 'generated' (unreviewed)?";
  if (!(await confirmDialog(status === "approved" ? "Approve knowledge card" : "Change review status", text, { confirm: status === "approved" ? "Approve" : "Confirm" }))) return;
  try { await setCardReview(id, status); toast(`Card marked ${status}`, "green"); } catch (err) { toast(err.message, "red"); }
}

function showRef(id) {
  const r = state.pool.find((p) => p.id === id);
  if (!r) return openDrawer(id, callout("amber", "This record is not in the current network data.", "alert"));
  const { pending, owner, created_at, ...fp } = r;
  openDrawer(`Evidence ${shortId(id)}`, `<div class="row">${isSynthetic(r) ? badge("synthetic", "amber") : badge("live", "blue")}${badge(siteLabel(r.site_token))}</div>
    <dl class="kv">${Object.entries(fp).filter(([k]) => k !== "id").map(([k, v]) => `<dt>${nice(k)}</dt><dd>${esc(Array.isArray(v) ? v.join(", ").replace(/_/g, " ") : String(v).replace(/_/g, " "))}</dd>`).join("")}</dl>`);
}

function view() {
  const cards = state.cards;
  const head = pageHead("Knowledge Library", "Cards written by cloud Gemini from privacy-filtered fingerprints only. Every number is computed by code; every citation is checked; nothing is an approved procedure until a person approves it.",
    btn(busy || "Write cards for all families (cloud)", { action: "generate", tone: "primary", ic: "cloud", disabled: !!busy }));
  if (!state.cardsLoaded) return head + `<div class="skeleton"></div>`;
  const levels = { verified: cards.filter((c) => c.verification?.status === "verified").length };
  const byId = new Map(state.pool.map((p) => [p.id, p]));
  const enriched = cards.map((c) => {
    const members = (c.all_evidence_ids || []).map((id) => byId.get(id)).filter(Boolean);
    return { ...c, consistency: checkEvidenceConsistency(c, members) };
  });
  const list = enriched.filter((c) =>
    (!F.q || JSON.stringify([c.title, c.pattern_summary, c.id]).toLowerCase().includes(F.q.toLowerCase())) &&
    (!F.equipment || c.signature?.equipment_type === F.equipment) && (!F.level || c.evidence?.level === F.level) && (!F.review || (c.review_status || "generated") === F.review))
    .sort((a, b) => (b.stats?.incidents || 0) - (a.stats?.incidents || 0));

  return `${head}
  ${busy ? callout("blue", esc(busy), "cloud") : ""}
  <div class="grid g4">
    ${kpi("Knowledge cards", cards.length, state.cardsFromCache ? "offline copy available" : "live")}
    ${kpi("Citations verified (L1)", `${levels.verified}/${cards.length}`, "every cited ID exists in the pattern", "green")}
    ${kpi("Evidence-consistent (L2)", `${enriched.filter((c) => c.consistency.status === "consistent").length}/${cards.length}`, "claims and cited incidents checked by code", "blue")}
    ${kpi("Approved (L3)", `${cards.filter((c) => c.review_status === "approved").length}/${cards.length}`, "human review only")}
  </div>
  ${panel("Cards", `
    <div class="toolbar">
      <input type="search" id="k-q" data-f="q" placeholder="Search cards" value="${esc(F.q)}" aria-label="Search cards" />
      <select id="k-eq" data-f="equipment" aria-label="Equipment"><option value="">Equipment: all</option>${[...new Set(cards.map((c) => c.signature?.equipment_type).filter(Boolean))].map((v) => `<option value="${v}"${F.equipment === v ? " selected" : ""}>${nice(v)}</option>`).join("")}</select>
      <select id="k-lv" data-f="level" aria-label="Evidence strength"><option value="">Evidence: all</option>${["strong", "moderate", "weak"].map((v) => `<option${F.level === v ? " selected" : ""}>${v}</option>`).join("")}</select>
      <select id="k-rv" data-f="review" aria-label="Review status"><option value="">Review: all</option>${["generated", "reviewed", "approved"].map((v) => `<option${F.review === v ? " selected" : ""}>${v}</option>`).join("")}</select>
      <span class="muted small">${list.length} of ${cards.length}</span>
    </div>
    ${cards.length ? (list.length ? `<div class="stack">${list.map(cardView).join("")}</div>` : emptyState("No cards match these filters")) : emptyState("No knowledge cards yet", "Load the demo network, then write cards for all families. Writing cards needs a connection; reading them works offline.")}`, { cls: "mt2" })}`;
}

function cardView(k) {
  const v = k.verification || {}, s = k.stats || {}, e = k.evidence || {}, c = k.consistency;
  const open = F.open === k.id;
  const review = k.review_status || "generated";
  const fixes = Object.entries(s.verified_fixes || {}).sort((a, b) => b[1] - a[1]);
  const causes = Object.entries(s.confirmed_causes || {});
  return `<article class="panel">
    <header class="panel-h" style="cursor:pointer" data-toggle="${esc(k.id)}" tabindex="0" aria-expanded="${open}">
      <div><div class="row"><span class="mono muted small">${esc(k.id)} · v${k.version || 1}</span>
        ${badge(e.level ? `evidence ${e.level}` : "evidence n/a", e.level === "strong" ? "green" : e.level === "moderate" ? "amber" : "red")}
        ${badge(v.status === "verified" ? `L1 citations ${v.valid}/${v.cited}` : "L1 rejected", v.status === "verified" ? "green" : "red", v.status === "verified" ? "check" : "x")}
        ${badge(c.status === "consistent" ? "L2 consistent" : `L2 flagged (${c.unsupported_claims.length + c.inconsistent_ids.length})`, c.status === "consistent" ? "green" : "amber")}
        ${badge(`L3 ${review}`, review === "approved" ? "green" : review === "reviewed" ? "blue" : "neutral")}
        ${badge("AI-generated", "navy")}
        ${state.cardsFromCache ? badge("available offline", "neutral") : ""}</div>
        <h2 style="font-size:16px;margin-top:6px">${esc(k.title)}</h2>
        <p class="muted small">${s.incidents} incidents · ${s.sites} sites · ${s.open} open · updated ${ago(tsMs(k.updated_at))}</p></div>
      <span class="muted">${open ? "▲" : "▼"}</span>
    </header>
    <div class="panel-b">
      <p>${esc(k.pattern_summary)}</p>
      ${open ? `<div class="grid g2 mt">
        <div class="stack">
          <div><b class="small">Historical evidence (computed from data)</b>
            <dl class="kv mt"><dt>Confirmed causes</dt><dd>${causes.length ? causes.map(([x, n]) => `${nice(x)} (${n})`).join(", ") : "none confirmed"}</dd>
            <dt>Verified fixes</dt><dd>${fixes.length ? fixes.map(([x, n]) => `${nice(x)} (${n})`).join(", ") : "none"}${s.unverified_fixes ? ` <span class="muted">· ${s.unverified_fixes} unverified</span>` : ""}</dd>
            <dt>Outcomes</dt><dd>${s.resolved} resolved · ${s.open} open/monitoring</dd>
            <dt>Evidence strength</dt><dd>${e.top_cause_count} of ${e.incidents} have a confirmed ${nice(e.top_cause)} cause · ${e.verified_fixes} verified fixes</dd></dl></div>
          <div><b class="small">AI hypothesis</b> ${badge("not confirmed by evidence", "amber")}<p class="mt">${esc(k.likely_mechanism)}</p></div>
        </div>
        <div class="stack">
          <div><b class="small">Suggested first checks</b> <span class="muted small">(AI suggestion · qualified personnel · lockout/tagout)</span><ol class="small">${(k.suggested_first_checks || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>
          <div><b class="small">Open questions</b><ul class="small">${(k.open_questions || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
        </div>
      </div>
      <div class="mt"><b class="small">Evidence references</b> <span class="muted small">(click to inspect)</span>
        <div class="chips mt">${(k.cited_ids || []).map((id) => `<button class="ref ${/^FP-/.test(id) ? "" : "live"}" data-ref="${esc(id)}" title="${esc(id)}">${esc(shortId(id))}</button>`).join("")}${(v.invalid_refs || []).map((id) => `<span class="ref bad" title="Not in this pattern: rejected">${esc(id)}</span>`).join("")}</div></div>
      ${c.status === "flagged" ? callout("amber", `<b>Level 2 check flagged this card</b><ul>${c.unsupported_claims.map((u) => `<li>Summary mentions ${esc(u.kind)} “${nice(u.value)}”, which is not in the verified data</li>`).join("")}${c.inconsistent_ids.map((id) => `<li>Cited incident ${esc(shortId(id))} does not show the pattern's equipment and symptoms</li>`).join("")}</ul>`, "alert") : callout("green", `Level 2: ${c.incidents_consistent}/${c.incidents_checked} cited incidents show the pattern; ${c.claims.length} cause/fix claim(s) in the summary are backed by data.`, "check")}
      <div class="row mt">
        ${review !== "reviewed" ? btn("Mark reviewed", { action: "review", tone: "sm", attrs: `data-id="${esc(k.id)}" data-status="reviewed"` }) : ""}
        ${review !== "approved" ? btn("Approve", { action: "review", tone: "sm success", attrs: `data-id="${esc(k.id)}" data-status="approved"` }) : ""}
        ${review !== "generated" ? btn("Reset to generated", { action: "review", tone: "sm", attrs: `data-id="${esc(k.id)}" data-status="generated"` }) : ""}
        <span class="spacer"></span>
        ${btn("Regenerate (new version)", { action: "regen", tone: "sm", ic: "cloud", attrs: `data-id="${esc(k.id)}"`, disabled: !!busy || !state.online })}
      </div>` : `<button class="btn sm mt" data-toggle="${esc(k.id)}">Show evidence, hypothesis and checks</button>`}
    </div></article>`;
}
