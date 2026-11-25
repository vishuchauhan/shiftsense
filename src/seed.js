// Loads the fictional demo network (45 incidents, 3 plants) into Firestore.
// Ground-truth family labels stay local for benchmarking and are never uploaded.
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth, authReady } from "./firebase.js";
import { validateFingerprint } from "./privacy.js";
import DEMO from "../data/demo-network.json";

export const DEMO_SITES = DEMO.sites;
export const DEMO_TRUTH = Object.fromEntries(DEMO.incidents.map((r) => [r.id, r.family]));

export async function seedDemoNetwork(onProgress) {
  await authReady;
  let written = 0, skipped = 0;
  for (const row of DEMO.incidents) {
    const { id, family, ...fp } = row;
    validateFingerprint(fp);
    try {
      await setDoc(doc(db, "fingerprints", id), {
        ...fp,
        owner: auth.currentUser.uid,
        created_at: serverTimestamp(),
      });
      written++;
    } catch {
      skipped++; // already exists (rules forbid overwrites)
    }
    onProgress?.(written + skipped, DEMO.incidents.length);
  }
  return { written, skipped };
}

/**
 * Synthetic reuse events for the demo: each verified card is marked as reused by the demo plants
 * that did NOT contribute most of its incidents. Every event is stored with synthetic: true.
 */
export async function seedDemoReuse(cards, recordReuse) {
  const sites = Object.keys(DEMO.sites);
  let n = 0;
  for (const card of cards) {
    const ids = new Set(card.all_evidence_ids || []);
    const counts = {};
    DEMO.incidents.filter((r) => ids.has(r.id)).forEach((r) => (counts[r.site_token] = (counts[r.site_token] || 0) + 1));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    for (const s of sites.filter((x) => x !== top)) {
      try {
        const { write } = await recordReuse(card.id, s, { synthetic: true });
        await write;
        n++;
      } catch { /* already recorded */ }
    }
  }
  return n;
}
