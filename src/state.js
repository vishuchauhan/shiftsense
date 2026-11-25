// Central application state. One set of Firestore listeners for the whole app; workspaces subscribe.
// Everything shown in the UI is derived from this state: there is no hard-coded analytical data.
import { watchFingerprints, watchReuse, loadPrivateIncidents } from "./store.js";
import { watchCards } from "./knowledge.js";
import { isValidShared, getSiteToken } from "./privacy.js";
import { clusterFingerprints } from "./clustering.js";
import { loadTelemetry } from "./ai.js";
import { appCheckStatus, auth } from "./firebase.js";
import { DEMO_SITES, DEMO_TRUTH } from "./seed.js";

export const state = {
  site: getSiteToken(),
  online: navigator.onLine,
  pool: [],
  poolFromCache: true,
  poolLoaded: false,
  cards: [],
  cardsFromCache: true,
  cardsLoaded: false,
  reuse: [],
  model: { status: "not_prepared", progress: 0, prepareMs: null, warmMs: null, availability: "unknown" },
  appCheck: "unknown",
  fixture: false,
};

const subs = new Set();
let queued = false;
export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
export function update(patch = {}) {
  Object.assign(state, patch);
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    for (const fn of subs) {
      try { fn(state); } catch (e) { console.error(e); }
    }
  });
}

// ---------- derived data (memoised) ----------
let clusterMemo = { key: "", value: [] };
export function clusters() {
  const key = state.pool.map((p) => p.id).join(",");
  if (key !== clusterMemo.key) clusterMemo = { key, value: clusterFingerprints(state.pool) };
  return clusterMemo.value;
}

/** Verified knowledge cards with their member fingerprints resolved from the pool. */
export function families() {
  const byId = new Map(state.pool.map((p) => [p.id, p]));
  return state.cards
    .filter((c) => c.verification?.status === "verified")
    .map((c) => ({
      id: c.id,
      title: c.title,
      equipment_type: c.signature?.equipment_type || "other",
      card: c,
      members: (c.all_evidence_ids || c.cited_ids || []).map((id) => byId.get(id)).filter(Boolean),
    }));
}

export const isSynthetic = (rec) => !!DEMO_SITES[rec?.site_token] || /^FP-\d+$/.test(rec?.id || "");
export const siteLabel = (t) => (t === state.site ? "This device" : DEMO_SITES[t] ? `${DEMO_SITES[t]} (synthetic)` : `Site ${String(t).slice(5, 9)}`);
export const truthFamily = (id) => DEMO_TRUTH[id] || null;
export const pendingMine = () => state.pool.filter((p) => p.pending && p.site_token === state.site).length;
export const privateCount = () => loadPrivateIncidents().length;
export const telemetry = () => loadTelemetry();

// ---------- boot ----------
export function start() {
  addEventListener("online", () => update({ online: true }));
  addEventListener("offline", () => update({ online: false }));
  addEventListener("ss-telemetry", () => update());

  const fx = globalThis.__SS_FIXTURE__;
  if (fx) {
    // Test harness only: inject state without touching Firestore.
    update({ fixture: true, pool: fx.pool || [], cards: fx.cards || [], reuse: fx.reuse || [], poolLoaded: true, cardsLoaded: true, poolFromCache: false, cardsFromCache: false });
    return;
  }

  watchFingerprints((items, { fromCache }) => update({ pool: items.filter(isValidShared), poolFromCache: fromCache, poolLoaded: true }));
  watchCards((cards, { fromCache }) => update({ cards, cardsFromCache: fromCache, cardsLoaded: true }));
  watchReuse((reuse) => update({ reuse }));
  const checkAppCheck = () => appCheckStatus().then((s) => update({ appCheck: s }));
  setTimeout(checkAppCheck, 1500);
  setInterval(checkAppCheck, 5 * 60 * 1000);
  auth.onAuthStateChanged?.((u) => update({ uid: u?.uid || null }));
}
