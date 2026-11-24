import { prepareDeviceModel, extractIncident } from "./ai.js";
import { verifyIncident, buildFingerprint, getSiteToken, isValidShared } from "./privacy.js";
import { savePrivateIncident, shareFingerprint, watchFingerprints } from "./store.js";
import { topMatches } from "./matching.js";


// ---- Show any error on screen (debug aid) ----
const showErr = (msg) => { const el = document.getElementById("status") || document.getElementById("badge"); if (el) el.textContent = "❌ " + msg; console.error(msg); };
addEventListener("error", (e) => showErr(e.message));
addEventListener("unhandledrejection", (e) => showErr(e.reason?.message || String(e.reason)));

const $ = (id) => document.getElementById(id);
let current = null;
let pool = [];
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
    $("progress").textContent = "✅ on-device model ready";
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
    renderMatches();
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
        <div class="score">${Math.round(score * 100)}%</div>
        <div>
          <div><b>${item.equipment_type.replace(/_/g, " ")}</b> · ${item.symptoms.join(", ")} · ${String(item.trigger).startsWith("after_") ? item.trigger.replace(/_/g, " ") : "after " + item.trigger.replace(/_/g, " ")}</div>
          <div class="muted small">${where} · status ${item.status} · cause ${item.cause_category} · downtime ${item.downtime_bucket}${item.pending ? " · ⏳ not synced yet" : ""}</div>
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
