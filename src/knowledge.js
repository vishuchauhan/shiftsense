// Cloud knowledge cards. Cloud Gemini only ever sees fingerprints (allowlisted enums + IDs).
// Code decides which incidents belong together and computes every number; the model explains.
// Any evidence ID the model cites that is not in the cluster is rejected.
import { getGenerativeModel, InferenceMode, Schema } from "firebase/ai";
import { doc, setDoc, getDoc, updateDoc, collection, onSnapshot, serverTimestamp } from "firebase/firestore";
import { checkCitations } from "./citations.js";
import { POLICY } from "./routing.js";
import { logBlocked } from "./store.js";
import { ai, timed } from "./ai.js";
import { db, authReady } from "./firebase.js";

const cardSchema = Schema.object({
  properties: {
    title: Schema.string(),
    pattern_summary: Schema.string(),
    likely_mechanism: Schema.string(),
    suggested_first_checks: Schema.array({ items: Schema.string() }),
    open_questions: Schema.array({ items: Schema.string() }),
    evidence_ids: Schema.array({ items: Schema.string() }),
  },
});

// Cross-plant reasoning needs the cloud; input is fingerprints only, so no fallback is needed.
const cardModel = getGenerativeModel(ai, {
  mode: InferenceMode[POLICY.knowledge_card.mode],
  inCloudParams: {
    model: "gemini-3.5-flash-lite",
    generationConfig: { responseMimeType: "application/json", responseSchema: cardSchema, temperature: 0.2 },
  },
});

export { cloudPayload } from "./payload.js";
import { cloudPayload } from "./payload.js";

function buildPrompt(cluster) {
  return `You are a reliability engineer reviewing a recurring failure pattern found across several manufacturing plants.
The incidents below were grouped by a similarity algorithm. They are anonymised fingerprints: no plant names, people or machine IDs.

Write one knowledge card for maintenance teams.
Rules:
- Cite ONLY incident IDs that appear in the data, in evidence_ids. Cite the incidents that best support the pattern.
- A cause is confirmed only where confirmed_cause is not "unknown". Do not present a hypothesis as a confirmed root cause.
- likely_mechanism is a hypothesis. Say so if causes are mostly unconfirmed.
- suggested_first_checks: 3 short, practical checks a technician can do first.
- open_questions: 2 questions an engineer should answer to confirm the root cause.
- Fixes: only fixes with fix_verified true are proven. Mention the most common verified fix in pattern_summary if there is one.
- suggested_first_checks should start with the check related to the most common verified fix, if any.
- Keep title under 8 words and pattern_summary under 40 words.

DATA:
${JSON.stringify(cloudPayload(cluster))}`;
}

/** Every cloud request payload is logged locally so the Privacy Center can show exactly what left the device. */
const OUTBOUND_KEY = "ss_outbound";
export function loadOutbound() {
  try { return JSON.parse(localStorage.getItem(OUTBOUND_KEY)) || []; } catch { return []; }
}
function logOutbound(task, payload) {
  const all = loadOutbound();
  all.push({ task, at: Date.now(), payload });
  localStorage.setItem(OUTBOUND_KEY, JSON.stringify(all.slice(-20)));
}

/** Ask the cloud for a card, then verify every citation against the pattern (Level 1). */
export async function generateCard(cluster) {
  logOutbound("knowledge_card", cloudPayload(cluster));
  const text = await timed("knowledge_card", cardModel, buildPrompt(cluster));
  const card = JSON.parse(text);
  const check = checkCitations(card.evidence_ids, cluster.evidence_ids);
  if (check.status !== "verified") logBlocked("card_citations_rejected", `${cardId(cluster)}: invalid ${check.invalid_refs.join(", ") || "no citations"}`);
  const { validIds, ...verification } = check;
  return { ...card, evidence_ids: validIds, verification };
}

export function cardId(cluster) {
  const s = cluster.signature;
  return `KC-${s.equipment_type}-${s.trigger}`.replace(/_/g, "-");
}

/** Store the card. Numbers come from code (cluster.stats), text from the model. Each regeneration bumps the version. */
export async function saveCard(cluster, card) {
  await authReady.catch(() => {});
  const id = cardId(cluster);
  const ref = doc(db, "knowledge_cards", id);
  let version = 1;
  try {
    const prev = await getDoc(ref);
    if (prev.exists()) version = (prev.data().version || 1) + 1;
  } catch { /* offline: start at 1 */ }
  await setDoc(ref, {
    id,
    version,
    title: card.title,
    pattern_summary: card.pattern_summary,
    likely_mechanism: card.likely_mechanism,
    suggested_first_checks: card.suggested_first_checks,
    open_questions: card.open_questions,
    cited_ids: card.evidence_ids,
    all_evidence_ids: cluster.evidence_ids,
    verification: card.verification,
    stats: cluster.stats,
    evidence: cluster.evidence,
    signature: cluster.signature,
    review_status: "generated", // generated → reviewed → approved (human decisions only)
    review_note: "",
    generated_by: "cloud_gemini",
    updated_at: serverTimestamp(),
  });
  return id;
}

/** Level 3: a person records review. Generated text is never treated as an approved procedure automatically. */
export async function setCardReview(id, status, note = "") {
  if (!["generated", "reviewed", "approved"].includes(status)) throw new Error("bad review status");
  await updateDoc(doc(db, "knowledge_cards", id), { review_status: status, review_note: String(note).slice(0, 300), reviewed_at: serverTimestamp() });
}

export function watchCards(callback) {
  let unsub = () => {};
  authReady.catch(() => {}).finally(() => {
    unsub = onSnapshot(
      collection(db, "knowledge_cards"),
      (snap) => callback(snap.docs.map((d) => d.data()), { fromCache: snap.metadata.fromCache }),
      (err) => console.warn("cards watch:", err.message)
    );
  });
  return () => unsub();
}
