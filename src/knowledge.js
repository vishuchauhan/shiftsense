// Cloud knowledge cards. Cloud Gemini only ever sees fingerprints (allowlisted enums + IDs).
// Code decides which incidents belong together and computes every number; the model explains.
// Any evidence ID the model cites that is not in the cluster is rejected.
import { getGenerativeModel, InferenceMode, Schema } from "firebase/ai";
import { doc, setDoc, collection, onSnapshot, serverTimestamp } from "firebase/firestore";
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
    confidence: Schema.enumString({ enum: ["low", "medium", "high"] }),
  },
});

// Cross-plant reasoning needs the cloud; input is fingerprints only, so no fallback is needed.
const cardModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_IN_CLOUD,
  inCloudParams: {
    model: "gemini-3.5-flash-lite",
    generationConfig: { responseMimeType: "application/json", responseSchema: cardSchema, temperature: 0.2 },
  },
});

/** Exactly what is sent to the cloud for one cluster. Shown in the UI as privacy proof. */
export function cloudPayload(cluster) {
  return {
    stats: cluster.stats,
    signature: cluster.signature,
    incidents: cluster.members.map((m) => ({
      id: m.id,
      site: m.site_token,
      symptoms: m.symptoms,
      trigger: m.trigger,
      status: m.status,
      confirmed_cause: m.cause_category,
      downtime: m.downtime_bucket,
      safety_flag: m.safety_flag,
    })),
  };
}

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
- confidence: high only if most incidents have the same confirmed cause.
- Keep title under 8 words and pattern_summary under 40 words.

DATA:
${JSON.stringify(cloudPayload(cluster))}`;
}

/** Ask the cloud for a card, then verify every citation against the cluster. */
export async function generateCard(cluster) {
  const text = await timed("knowledge_card", cardModel, buildPrompt(cluster));
  const card = JSON.parse(text);
  const allowed = new Set(cluster.evidence_ids);
  const cited = [...new Set(card.evidence_ids || [])];
  const valid = cited.filter((id) => allowed.has(id));
  const invalid = cited.filter((id) => !allowed.has(id));
  const verification = {
    cited: cited.length,
    valid: valid.length,
    invalid_refs: invalid,
    status: invalid.length === 0 && valid.length > 0 ? "verified" : "rejected",
  };
  return { ...card, evidence_ids: valid, verification };
}

export function cardId(cluster) {
  const s = cluster.signature;
  return `KC-${s.equipment_type}-${s.trigger}`.replace(/_/g, "-");
}

/** Store the card. Numbers come from code (cluster.stats), text from the model. */
export async function saveCard(cluster, card) {
  await authReady.catch(() => {});
  const id = cardId(cluster);
  await setDoc(doc(db, "knowledge_cards", id), {
    id,
    title: card.title,
    pattern_summary: card.pattern_summary,
    likely_mechanism: card.likely_mechanism,
    suggested_first_checks: card.suggested_first_checks,
    open_questions: card.open_questions,
    confidence: card.confidence,
    cited_ids: card.evidence_ids,
    all_evidence_ids: cluster.evidence_ids,
    verification: card.verification,
    stats: cluster.stats,
    signature: cluster.signature,
    updated_at: serverTimestamp(),
  });
  return id;
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
