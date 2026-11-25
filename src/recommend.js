// State-aware, evidence-constrained recommendations.
// Code ranks approved historical evidence. Gemini Nano may only EXPLAIN a selected item
// (see ai.js explainEvidence); it cannot invent interventions, change the incident status
// or add causal claims. When evidence is thin, the engine abstains.
import { similarity } from "./matching.js";

export const CARD_MATCH_THRESHOLD = 0.6;

// ---------- text matching ----------
const STOP = new Set(("check checks inspect verify test examine look looked found make sure after before during with from that this they them their there have were was when then into onto over under than also again still only very more most some such the and for are but not all any can its lost min mins minute minutes hour hours shift problem issue issues "
  + "conveyor press hydraulic machine robot welding molder injection line paint compressor cnc stopped started").split(" "));
export const stem = (w) => w.replace(/s$/, "").replace(/(ing|ed|e)$/, "").replace(/(.)\1$/, "$1");
/** stem → original word */
export const wordMap = (t, min = 4) =>
  new Map((String(t).toLowerCase().match(new RegExp(`[a-z]{${min},}`, "g")) || []).filter((w) => !STOP.has(w)).map((w) => [stem(w), w]));

/** Note words that appear in `text`, ignoring words that describe the whole pattern. */
export function overlap(note, text, patternWords = new Map()) {
  const n = wordMap(note);
  return [...wordMap(text).keys()].filter((k) => n.has(k) && !patternWords.has(k)).map((k) => n.get(k));
}

/** Things the note says were already tried ("checked the filter", "replaced the belt"). */
export function alreadyTried(note) {
  const t = String(note).toLowerCase();
  const out = new Set();
  const re = /(checked|inspected|replaced|tried|cleaned|tightened|tensioned|reset|swapped|adjusted)\s+(?:the\s+|a\s+|an\s+)?([a-z]+)(?:\s+([a-z]+))?/g;
  let m;
  while ((m = re.exec(t))) {
    for (const w of [m[2], m[3]]) if (w && w.length >= 4 && !STOP.has(w)) out.add(stem(w));
  }
  return out;
}

const label = (s) => String(s).replace(/_/g, " ");

// ---------- card matching ----------
export function matchCard(fingerprint, cards) {
  const scored = cards
    .filter((c) => c.verification?.status === "verified" && c.signature)
    .map((c) => ({ card: c, ...similarity(fingerprint, c.signature) }))
    .sort((a, b) => b.score - a.score);
  const top = scored[0];
  return top && top.score >= CARD_MATCH_THRESHOLD ? top : null;
}

// ---------- evidence ranking ----------
/**
 * Rank the card's checks and verified fixes against the note. Stable IDs: `<cardId>:check-<n>`, `<cardId>:fix-<category>`.
 * Score = 0.5·note overlap + 0.3·support from verified fixes + 0.2·card order. Items the note says were already tried are moved down.
 */
export function rankEvidence(note, card) {
  const patternWords = wordMap(card.title || "", 3);
  const tried = alreadyTried(note);
  const fixes = Object.entries(card.stats?.verified_fixes || {}).sort((a, b) => b[1] - a[1]);
  const maxFix = Math.max(1, ...fixes.map(([, n]) => n));
  const checks = (card.suggested_first_checks || []).slice(0, 5);

  const items = [];
  checks.forEach((text, i) => {
    const hits = overlap(note, text, patternWords);
    // A check is supported by a verified fix if they share a word (e.g. "belt" in both).
    const support = fixes.filter(([f]) => overlap(label(f), text).length || [...wordMap(label(f)).keys()].some((k) => wordMap(text).has(k)));
    const supportScore = support.length ? support[0][1] / maxFix : 0;
    const triedHit = [...wordMap(text).keys()].some((k) => tried.has(k));
    const score = 0.5 * Math.min(1, hits.length / 2) + 0.3 * supportScore + 0.2 * (1 - i / Math.max(1, checks.length));
    items.push({
      id: `${card.id}:check-${i + 1}`,
      kind: "check",
      text,
      score: triedHit ? score * 0.4 : score,
      reasons: [
        ...(hits.length ? [`your note mentions ${hits.join(", ")}`] : []),
        ...(support.length ? [`matches the verified fix "${label(support[0][0])}" (${support[0][1]}×)`] : []),
        ...(triedHit ? ["your note says something similar was already tried"] : []),
        `card check #${i + 1}`,
      ],
      already_tried: triedHit,
    });
  });
  fixes.forEach(([f, n]) => {
    const hits = overlap(note, label(f), patternWords);
    const triedHit = [...wordMap(label(f)).keys()].some((k) => tried.has(k));
    const score = 0.6 * (n / maxFix) * 0.8 + 0.4 * Math.min(1, hits.length);
    items.push({
      id: `${card.id}:fix-${f}`,
      kind: "verified_fix",
      text: `${label(f)} fixed this pattern in ${n} verified incident${n > 1 ? "s" : ""}`,
      score: triedHit ? score * 0.4 : score,
      reasons: [
        `operator-verified at ${n} incident${n > 1 ? "s" : ""}`,
        ...(hits.length ? [`your note mentions ${hits.join(", ")}`] : []),
        ...(triedHit ? ["your note says something similar was already tried"] : []),
      ],
      already_tried: triedHit,
    });
  });
  return items
    .sort((a, b) => b.score - a.score)
    .map((it) => ({ ...it, score: Math.round(it.score * 100) / 100, note_specific: it.reasons.some((r) => r.startsWith("your note mentions")) }));
}

// ---------- state-aware insight ----------
const MIN_EVIDENCE_SCORE = 0.25;

/**
 * Build the insight for an incident. Mode depends on the VERIFIED incident (after code checks),
 * never on model output:
 *   safety      → approved procedures + qualified review only, no repair steps, no AI advice
 *   resolved    → summarise the fix, compare with verified history, suggest documentation
 *   monitoring  → what to observe and record
 *   unresolved  → ranked evidence + investigation questions, or abstain
 */
export function buildInsight(incident, fingerprint, cards) {
  const match = matchCard(fingerprint, cards);
  const card = match?.card || null;
  const base = { card, similarity: match?.score ?? null, parts: match?.parts ?? null };

  if (incident.safety_status === "flagged") {
    return {
      ...base,
      mode: "safety",
      headline: "Safety-related incident",
      guidance: [
        "Follow your plant's approved safety procedure and lockout/tagout before anyone approaches the equipment.",
        "Escalate to a qualified supervisor or safety officer.",
        "ShiftSense does not suggest repair steps for safety incidents.",
      ],
      evidence: [],
      allowAI: false,
    };
  }

  if (incident.status === "resolved") {
    const mine = incident.resolution_category;
    const n = card && mine && mine !== "none" ? (card.stats?.verified_fixes || {})[mine] || 0 : 0;
    return {
      ...base,
      mode: "resolved",
      headline: mine && mine !== "none" ? `Reported fix: ${label(mine)}` : "Resolved, but the note does not say what fixed it",
      fixComparison: !card || !mine || mine === "none" ? null : n > 0 ? { kind: "matches", count: n, fix: mine } : { kind: "new", fix: mine },
      guidance: [
        mine && mine !== "none" ? "Tick the fix confirmation only if the equipment has run normally since the fix." : "Add what was done to fix it, so other plants can learn from it.",
        "Record the part or setting changed and who carried out the work.",
        "Re-check after the next changeover or startup and log whether it recurred.",
      ],
      evidence: [],
      allowAI: false,
    };
  }

  if (incident.status === "monitoring") {
    return {
      ...base,
      mode: "monitoring",
      headline: "Under observation",
      guidance: [
        "Log each recurrence with time, trigger and duration for the next few shifts.",
        "Note anything that changed just before it happened (changeover, load, maintenance).",
        "Keep the cause as unknown until it is confirmed.",
      ],
      questions: card?.open_questions || [],
      evidence: card ? rankEvidence(incident.note || "", card).slice(0, 3) : [],
      allowAI: false,
    };
  }

  // unresolved
  if (!card) {
    return { ...base, mode: "unresolved", abstain: "No known pattern matches this incident yet. Sharing it helps the network learn.", evidence: [], questions: [], allowAI: false };
  }
  const evidence = rankEvidence(incident.note || "", card);
  const top = evidence[0];
  const weak = card.evidence?.level === "weak";
  if (!top || top.score < MIN_EVIDENCE_SCORE || weak) {
    return {
      ...base,
      mode: "unresolved",
      abstain: weak ? "Evidence for this pattern is weak. Investigate with the questions below instead of acting on a recommendation." : "Not enough evidence to rank a first step.",
      evidence,
      questions: card.open_questions || [],
      allowAI: false,
    };
  }
  return { ...base, mode: "unresolved", headline: card.title, evidence, questions: card.open_questions || [], allowAI: true };
}

// ---------- validating the on-device explanation ----------
const CAUSAL = /\b(root cause (is|was)|is caused by|was caused by|caused the|because of a|due to a|definitely|certainly|guarantee)/i;

/** Reject explanations that cite an unknown item or make causal claims the evidence does not support. */
export function validateExplanation(out, allowedIds) {
  if (!out || !allowedIds.includes(out.rec_id)) return { ok: false, reason: "the model referred to an item that does not exist" };
  if (CAUSAL.test(out.explanation || "")) return { ok: false, reason: "the explanation stated a cause the evidence does not support" };
  if (!out.explanation || out.explanation.length > 400) return { ok: false, reason: "empty or overlong explanation" };
  return { ok: true };
}
