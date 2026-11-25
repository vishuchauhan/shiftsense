# Architecture

## Data flow

```
Operator note (private, localStorage)
  │  Gemini Nano · ONLY_ON_DEVICE · responseConstraint schema           src/ai.js
  ▼
Raw model output
  │  verifyIncident(): cause needs a confirmation phrase, fix needs     src/privacy.js
  │  "resolved" + a fix verb, safety from explicit words (3 states),
  │  downtime from the number written in the note
  ▼
Verified incident ──► human review/edit (Operator Studio)
  │  buildFingerprint() + validateFingerprint(): allowlisted enums only
  ▼
Fingerprint (pseudonymized) ──► human approval ──► Firestore (offline-queued, immutable)
  │
  │  clusterFingerprints(): average-linkage on feature similarity (no AI)   src/clustering.js
  ▼
Failure families ──► cloudPayload() (allowlisted keys)                  src/payload.js
  │  Cloud Gemini · ONLY_IN_CLOUD · responseSchema                       src/knowledge.js
  ▼
Knowledge card ──► L1 checkCitations · L2 checkEvidenceConsistency       src/citations.js
  │               L3 human review status
  ▼
Firestore (cards) ──► offline copy on every device
  │  matchCard() + rankEvidence() (code)                                 src/recommend.js
  │  explainEvidence() · ONLY_ON_DEVICE · enum-constrained ID, validated
  ▼
State-aware insight for the operator (safety / resolved / monitoring / unresolved)
```

## Modules

| Module | Purpose |
|---|---|
| `routing.js` | Single routing policy table; `isPrivacyViolation()` for the audit |
| `ai.js` | All Firebase AI Logic models and telemetry (source, data kind, latency, success, online) |
| `privacy.js` | Vocabulary, verifier, fingerprint builder and validator, content keys |
| `matching.js`, `clustering.js` | Feature similarity and average-linkage clustering |
| `citations.js` | L1 reference integrity and L2 claim/evidence consistency |
| `recommend.js` | State-aware insight, evidence ranking with stable IDs, explanation validator |
| `economics.js` | Band ranges, Pareto, sensitivity, allocation, value of knowledge |
| `contribution.js` | Contribution score K and ledger |
| `gametheory.js` | Payoff matrix analysis and repeated-game simulation |
| `bench.js`, `evaluation-tests.js` | Live benchmark harness and deterministic regression suite |
| `state.js` | One set of Firestore listeners; all views derive from it |
| `views/*`, `ui/*` | Eight workspaces, components, SVG charts, icons |

## Technology choices

- **No framework migration.** The app stays vanilla ES modules + Vite. A React/TypeScript rewrite would have risked the working Firebase integrations for little user-visible gain within the deadline. The UI is built from a small component library (`src/ui`).
- **No chart dependency.** Charts are small SVG functions, so they work offline and add no bundle weight.
- **Offline-first.** Firestore persistent cache handles offline reads and queued writes. A versioned service worker caches the app shell. Chrome keeps the downloaded Gemini Nano model.
- **Idempotent writes.** Document IDs are generated on the client before writing, and rules forbid updates, so reconnecting cannot create duplicates of the same write.
