// Private incidents: local only (localStorage). Fingerprints: Firestore (offline-queued, offline-readable).
import { collection, doc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db, auth, authReady } from "./firebase.js";
import { validateFingerprint } from "./privacy.js";

const LOCAL_KEY = "ss_private_incidents";

export function savePrivateIncident(record) {
  const all = loadPrivateIncidents();
  all.unshift(record);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
}

export function loadPrivateIncidents() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || []; } catch { return []; }
}

/** Writes an approved fingerprint. Works offline: Firestore queues it and syncs later. */
export async function shareFingerprint(fp) {
  validateFingerprint(fp); // second gate, right before network
  await authReady.catch(() => {});
  const ref = doc(collection(db, "fingerprints")); // ID is known immediately, even offline
  const write = setDoc(ref, {
    ...fp,
    owner: auth.currentUser?.uid ?? null,
    created_at: serverTimestamp(),
  });
  return { id: ref.id, pending: !navigator.onLine, write };
}

/**
 * Live view of all shared fingerprints. Firestore's persistent cache means this
 * keeps working offline with the last synced data.
 */
export function watchFingerprints(callback) {
  let unsub = () => {};
  authReady.catch(() => {}).finally(() => {
    unsub = onSnapshot(
      collection(db, "fingerprints"),
      { includeMetadataChanges: true },
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, pending: d.metadata.hasPendingWrites, ...d.data() }));
        callback(items, { fromCache: snap.metadata.fromCache });
      },
      (err) => console.warn("fingerprint watch:", err.message)
    );
  });
  return () => unsub();
}

export function clearPrivateIncidents() {
  localStorage.removeItem(LOCAL_KEY);
}

// ---------- Drafts (local only) ----------
const DRAFT_KEY = "ss_draft";
export const loadDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || null; } catch { return null; } };
export const saveDraft = (d) => localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, at: Date.now() }));
export const clearDraft = () => localStorage.removeItem(DRAFT_KEY);

// ---------- Knowledge reuse events ----------
// One event per (card, site): the document ID is `${cardId}__${site}` and rules forbid updates,
// so a site cannot record the same reuse twice.
export async function recordReuse(cardId, siteToken, { synthetic = false } = {}) {
  await authReady.catch(() => {});
  const id = `${cardId}__${siteToken}`;
  const write = setDoc(doc(db, "reuse_events", id), {
    card_id: cardId,
    site_token: siteToken,
    synthetic,
    owner: auth.currentUser?.uid ?? null,
    created_at: serverTimestamp(),
  });
  return { id, write };
}

export function watchReuse(callback) {
  let unsub = () => {};
  authReady.catch(() => {}).finally(() => {
    unsub = onSnapshot(
      collection(db, "reuse_events"),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.warn("reuse watch:", err.message)
    );
  });
  return () => unsub();
}

// ---------- Blocked / rejected events (local audit log) ----------
const BLOCK_KEY = "ss_blocked";
export const loadBlocked = () => { try { return JSON.parse(localStorage.getItem(BLOCK_KEY)) || []; } catch { return []; } };
export function logBlocked(kind, detail) {
  const all = loadBlocked();
  all.push({ kind, detail: String(detail).slice(0, 240), at: Date.now() });
  localStorage.setItem(BLOCK_KEY, JSON.stringify(all.slice(-100)));
}
export const clearBlocked = () => localStorage.removeItem(BLOCK_KEY);
