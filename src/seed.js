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
