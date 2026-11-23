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
