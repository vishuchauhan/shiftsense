import { prepareDeviceModel, extractIncident, warmUp, tailorAdvice } from "./ai.js";
import { verifyIncident, buildFingerprint, getSiteToken, isValidShared } from "./privacy.js";
import { savePrivateIncident, shareFingerprint, watchFingerprints } from "./store.js";
import { topMatches, similarity } from "./matching.js";
import { watchCards } from "./knowledge.js";


// ---- Show any error on screen (debug aid) ----
const showErr = (msg) => { const el = document.getElementById("status") || document.getElementById("badge"); if (el) el.textContent = "❌ " + msg; console.error(msg); };
addEventListener("error", (e) => showErr(e.message));
addEventListener("unhandledrejection", (e) => showErr(e.reason?.message || String(e.reason)));

const $ = (id) => document.getElementById(id);
let current = null;
let pool = [];
let cards = [];
let bestCard = null;
const mySite = getSiteToken();

// ---- Offline app shell ----
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("SW:", e.message));
}

// ---- Network pill ----
function renderNet() {
  $("net").textContent = navigator.onLine ? "online" : "offline";
  $("net").className = "pill " + (navigator.onLine ? "on" : "off");
}
addEventListener("online", renderNet);
addEventListener("offline", renderNet);
renderNet();

// ---- Shared fingerprint pool (live, cached offline) ----
watchFingerprints((items, { fromCache }) => {
  pool = items.filter(isValidShared); // never trust network data blindly
  const sites = new Set(items.map((i) => i.site_token)).size;
  $("poolInfo").textContent = `${items.length} shared incidents · ${sites} site${sites === 1 ? "" : "s"}${fromCache ? " · cached" : ""}`;
  if (current) renderMatches();
});

// ---- Knowledge cards (from the cloud, cached on this device for offline use) ----
watchCards((list, { fromCache }) => {
  cards = list.filter((c) => c.verification?.status === "verified" && c.signature);
  $("cardInfo").textContent = `${cards.length} knowledge card${cards.length === 1 ? "" : "s"}${fromCache ? " (offline copy)" : ""}`;
  if (current) renderKnownPattern();
});

// ---- Inference log + badge ----
addEventListener("ss-telemetry", ({ detail: e }) => {
  const onDevice = String(e.source).toUpperCase() === "ON_DEVICE";
  const icon = onDevice ? "⚡" : "☁️";
  const label = onDevice ? "ON-DEVICE" : "CLOUD";
  const li = document.createElement("li");
  li.textContent = `${icon} ${e.task} · ${label} · ${e.ms} ms`;
  $("log").prepend(li);
  $("badge").innerHTML = `<span class="pill ${onDevice ? "on" : "cloud"}">${icon} ${label} · ${e.ms} ms${onDevice ? " · $0 cloud cost" : ""}</span>`;
});

// ---- Step 1: model download (needs user click) ----
$("prepare").onclick = async () => {
  $("prepare").disabled = true;
  $("progress").textContent = "starting…";
  try {
    await prepareDeviceModel((p) => ($("progress").textContent = `downloading ${p}%`));
    $("progress").textContent = "warming up the on-device model…";
    const ms = await warmUp().catch(() => null);
    $("progress").textContent = `✅ on-device model ready${ms ? ` (warm-up ${Math.round(ms / 1000)} s)` : ""}`;
    $("extract").disabled = false;
  } catch (err) {
    $("progress").textContent = "❌ " + err.message + " (notes will wait; they are never sent to the cloud)";
    $("prepare").disabled = false;
  }
};

// ---- Step 2: extraction → verification → fingerprint ----
$("extract").onclick = async () => {
  $("extract").disabled = true;
  $("badge").textContent = "processing on-device…";
  try {
    const note = $("note").value;
    const raw = await extractIncident(note);
    const { incident, corrections } = verifyIncident(raw, note);
    const fp = buildFingerprint(incident, mySite);
    current = {
      private: { machine: $("machine").value, shift: $("shift").value, note, ...incident },
      fingerprint: fp,
    };
    savePrivateIncident({ ...current.private, at: Date.now() });
    $("private").textContent = JSON.stringify(current.private, null, 2);
    $("fingerprint").textContent = JSON.stringify(fp, null, 2);
    renderCorrections(corrections);
    $("result").classList.remove("hidden");
    $("shareStatus").textContent = "";
    $("approve").disabled = false;
    const hasFix = incident.resolution_category && incident.resolution_category !== "none";
    $("fixRow").classList.toggle("hidden", !hasFix);
    $("fixVerified").checked = false;
    $("fixLabel").textContent = hasFix ? incident.resolution_category.replace(/_/g, " ") : "";
    renderMatches();
    renderKnownPattern();
  } catch (err) {
    $("badge").textContent = "❌ " + err.message;
  } finally {
    $("extract").disabled = false;
  }
};

function renderCorrections(list) {
  const box = $("corrections");
  if (!list.length) {
    box.className = "verify ok";
    box.textContent = "✔ Code check passed: AI output matches the note.";
    return;
  }
  box.className = "verify fixed";
  box.innerHTML =
    `<strong>🛡 Code check corrected ${list.length} field${list.length > 1 ? "s" : ""}</strong>` +
    "<ul>" +
    list.map((c) => `<li><code>${c.field}</code>: ${fmt(c.from)} → <b>${fmt(c.to)}</b> <span class="muted">(${c.why})</span></li>`).join("") +
    "</ul>";
}
const fmt = (v) => (Array.isArray(v) ? `[${v.join(", ")}]` : String(v));

// ---- Step 4: offline similarity matching ----
function renderMatches() {
  if (!current) return;
  const matches = topMatches(current.fingerprint, pool, { k: 5, excludeId: current.sharedId });
  $("matchesCard").classList.remove("hidden");
  if (!matches.length) {
    $("matches").innerHTML = `<p class="muted">No similar incidents shared yet (${pool.length} in network).</p>`;
    return;
  }
  $("matches").innerHTML = matches
    .map(({ item, score, parts }) => {
      const where = item.site_token === mySite ? "this plant" : "another plant";
      return `<div class="match">
        <div class="score" title="feature similarity, not proof of the same root cause">${Math.round(score * 100)}%</div>
        <div>
          <div><b>${item.equipment_type.replace(/_/g, " ")}</b> · ${item.symptoms.join(", ")} · ${String(item.trigger).startsWith("after_") ? item.trigger.replace(/_/g, " ") : "after " + item.trigger.replace(/_/g, " ")}</div>
          <div class="muted small">${where} · status ${item.status} · cause ${item.cause_category}${item.resolution_category && item.resolution_category !== "none" ? ` · fixed by ${item.resolution_category.replace(/_/g, " ")}${item.resolution_verified ? " ✓" : " (unverified)"}` : ""} · downtime ${item.downtime_bucket}${item.pending ? " · ⏳ not synced yet" : ""}</div>
          <div class="muted small">equipment ${parts.equipment ? "✓" : "✗"} · symptoms ${Math.round(parts.symptoms * 100)}% · trigger ${parts.trigger ? "✓" : "✗"} · process ${parts.process ? "✓" : "✗"}</div>
        </div>
      </div>`;
    })
    .join("");
}

// ---- Step 3: approve + share ----
$("approve").onclick = async () => {
  if (!current) return;
  try {
    const verified = $("fixVerified").checked;
    current.fingerprint = buildFingerprint({ ...current.private }, mySite, { resolutionVerified: verified });
    $("fingerprint").textContent = JSON.stringify(current.fingerprint, null, 2);
    const { id, pending, write } = await shareFingerprint(current.fingerprint);
    current.sharedId = id; // don't match an incident against itself
    $("approve").disabled = true;
    $("shareStatus").textContent = pending ? "⏳ queued offline, will sync on reconnect" : "syncing…";
    write.then(() => ($("shareStatus").textContent = "✅ synced to network"))
         .catch((e) => ($("shareStatus").textContent = "❌ " + e.message));
  } catch (err) {
    $("shareStatus").textContent = "❌ blocked: " + err.message;
  }
};

// ---- Step 5: known pattern from the network (offline, no AI to match) ----
const CARD_THRESHOLD = 0.6;
function renderKnownPattern() {
  if (!current) return;
  const scored = cards
    .map((c) => ({ card: c, ...similarity(current.fingerprint, { ...c.signature }) }))
    .sort((a, b) => b.score - a.score);
  const top = scored[0];
  const box = $("knownCard");
  box.classList.remove("hidden");
  $("advice").textContent = "";
  if (!top || top.score < CARD_THRESHOLD) {
    bestCard = null;
    $("known").innerHTML = `<p class="muted">No known pattern matches this incident yet. Sharing it helps the network learn.</p>`;
    $("tailor").classList.add("hidden");
    return;
  }
  bestCard = top.card;
  const k = top.card, s = k.stats;
  const causes = Object.entries(s.confirmed_causes || {}).map(([c, n]) => `${c.replace(/_/g, " ")} (${n})`).join(", ") || "none confirmed yet";
  $("known").innerHTML = `
    <div class="known-head"><span class="score" title="feature similarity">${Math.round(top.score * 100)}%</span>
      <div><b>${esc(k.title)}</b><div class="muted small">${esc(k.id)} · seen ${s.incidents}× across ${s.sites} plants · ${s.open} still open</div></div></div>
    <p class="small"><b>Confirmed causes elsewhere:</b> ${esc(causes)}</p>
    <p class="small"><b>What fixed it elsewhere (verified):</b> ${esc(Object.entries(s.verified_fixes || {}).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f.replace(/_/g, " ")} (${n})`).join(", ") || "no verified fix yet")}</p>
    ${fixComparison(k)}
    <b class="small">Check first <span class="muted">(AI suggestion · qualified personnel, lockout/tagout)</span></b>
    <ol>${(k.suggested_first_checks || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ol>`;
  // Advice is for open problems. A resolved incident gets a fix comparison instead.
  $("tailor").classList.toggle("hidden", current.private.status === "resolved");
}

function fixComparison(k) {
  const mine = current.private.resolution_category;
  if (current.private.status !== "resolved" || !mine || mine === "none") return "";
  const n = (k.stats.verified_fixes || {})[mine] || 0;
  const label = mine.replace(/_/g, " ");
  return n > 0
    ? `<p class="verify ok">✅ Your fix (<b>${esc(label)}</b>) matches the verified fix in ${n} other incident${n > 1 ? "s" : ""} of this pattern.</p>`
    : `<p class="verify fixed">🆕 Your fix (<b>${esc(label)}</b>) is new for this pattern. Sharing it adds a lesson other plants do not have yet.</p>`;
}

// ---- Code check on the on-device advice: which card check does the note actually point to? ----
const STOP = new Set(("check checks inspect verify test examine look looked found make sure after before during with from that this they them their there have were was when then into onto over under than also again still only very more most some such the and for are but not all any can its it's lost min mins minute minutes hour hours shift problem issue issues "
  + "conveyor press hydraulic machine robot welding molder injection line paint compressor cnc").split(" "));
const stem = (w) => w.replace(/s$/, "").replace(/(ing|ed|e)$/, "").replace(/(.)\1$/, "$1");
// stem → original word, so the UI can show "bearing" rather than "bear"
const wordMap = (t, min = 4) => new Map((String(t).toLowerCase().match(new RegExp(`[a-z]{${min},}`, "g")) || []).filter((w) => !STOP.has(w)).map((w) => [stem(w), w]));
/** Which note words appear in each check, ignoring words that describe the whole pattern (card title). */
function noteOverlap(note, checks, title = "") {
  const n = wordMap(note);
  const common = wordMap(title, 3);
  return checks.map((c) => [...wordMap(c).keys()].filter((k) => n.has(k) && !common.has(k)).map((k) => n.get(k)));
}
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

$("tailor").onclick = async () => {
  if (!current || !bestCard) return;
  $("tailor").disabled = true;
  $("advice").textContent = "thinking on-device… (your note stays on this device)";
  try {
    const a = await tailorAdvice(current.private.note, bestCard);
    const checks = (bestCard.suggested_first_checks || []).slice(0, 3);
    const hits = noteOverlap(current.private.note, checks, bestCard.title);
    const best = hits.reduce((b, h, i) => (h.length > hits[b].length ? i : b), 0);
    let codeNote = "";
    if (hits[best].length > hits[a.index].length) {
      codeNote = `<br><span class="verify fixed small">🛡 Code check: the model picked check ${a.index + 1}, but your note mentions <b>${esc(hits[best].join(", "))}</b>, which points to check ${best + 1}. Switched.</span>`;
      a.index = best;
      a.check = checks[best];
      a.reason = "";
    }
    $("advice").innerHTML = `💡 <b>Do check ${a.index + 1} first:</b> ${esc(a.check)}${a.reason ? `<br><span class="muted">${esc(a.reason)}</span>` : ""}${codeNote}<br><span class="small">📝 Record next time: ${esc(a.record)}</span>`;
  } catch (e) {
    $("advice").textContent = "❌ " + e.message;
  } finally {
    $("tailor").disabled = false;
  }
};
