# ShiftSense

**One plant's failure becomes every plant's lesson, and no plant has to share its raw notes.**

ShiftSense is a privacy-first industrial intelligence network built on **Firebase AI Logic hybrid inference**. Operators write messy shift notes. **Gemini Nano structures them on the device**, and plain code checks what the model produced. Only a **privacy-filtered, pseudonymized failure fingerprint** can be shared, and only after a person approves it. Code finds recurring failure families across plants. **Cloud Gemini** then turns them into knowledge cards whose citations are checked, and the cards come back to devices for **offline** use.

> Private observations become shared industrial knowledge, and shared knowledge becomes locally actionable intelligence.

Built for #BuildHybridAI · Platform: **Web (Chrome)** · Apache 2.0

## How it works

| Layer | Technology | Responsibility |
|---|---|---|
| Perception | Gemini Nano, `ONLY_ON_DEVICE` | Understands messy notes. Raw text never leaves the device. |
| Verification | Deterministic code | Corrects unsupported causes, fixes and safety claims; enforces the fingerprint allowlist |
| Discovery | Math (similarity + clustering) | Finds similar incidents and recurring families. No AI, runs offline. |
| Reasoning | Cloud Gemini, `ONLY_IN_CLOUD` | Writes knowledge cards from fingerprints only. Every citation is checked. |
| Personalisation | Gemini Nano, `ONLY_ON_DEVICE` | Explains a code-ranked evidence item against the private note. Output is validated. |

The routing policy lives in [`src/routing.js`](src/routing.js). Every model is built from it, and the Privacy Center displays it.

### Firebase AI Logic usage

| Task | Mode | Data | Code |
|---|---|---|---|
| `extract_incident` | `ONLY_ON_DEVICE` + `responseConstraint` schema | private note | `src/ai.js` |
| `explain_evidence` | `ONLY_ON_DEVICE` + enum-constrained ID | private note | `src/ai.js` |
| `knowledge_card` | `ONLY_IN_CLOUD` + `responseSchema` | fingerprints | `src/knowledge.js` |
| `benchmark_cloud_extract` | `ONLY_IN_CLOUD` | fictional notes only | `src/ai.js` |
| `shareable_summary` | `PREFER_ON_DEVICE` | fingerprints | `src/ai.js` |

Every call records `response.inferenceSource`, its latency and the kind of data it carried. The audit counts "raw notes sent to cloud" from these records rather than asserting it.

Other Firebase products: **Firestore** (offline persistence, immutable fingerprints, reuse events, knowledge cards), **Authentication** (anonymous, demo only), **App Check** (reCAPTCHA Enterprise / Fraud Defense; debug token on localhost), **Hosting**.

## Workspaces

1. **Command Center**: KPIs, priorities, exposure range, hybrid activity and network health, all from live state.
2. **Operator Studio**: capture with draft autosave, on-device structuring, code-check corrections, editable fields, a private-vs-shareable comparison, fix verification, approval, offline queue, and state-aware insight (safety, resolved, monitoring, unresolved). Manual capture is available when the model is not.
3. **Network Intelligence**: filterable incident explorer, code-found families, a cross-site recurrence matrix, and drill-down with feature-similarity breakdowns.
4. **Knowledge Library**: cards with L1 citation integrity, L2 claim/evidence consistency and L3 human review (generated → reviewed → approved), versioning, and clickable evidence.
5. **Economic Intelligence**: low/mid/high exposure from downtime bands (the open-ended band uses an explicit cap), equipment-specific costs, Pareto, frequency vs cost, sensitivity across 8 scenarios, intervention net benefit, allocation under an hours budget, and the value of knowledge reuse (measured events vs assumptions).
6. **Cooperative Intelligence**: contribution score `K = 100·(0.30Q + 0.25N + 0.30V + 0.15R)` with reasons, a site ledger, an interactive payoff matrix (best responses, dominant strategies, pure and mixed Nash equilibria, game type), and a seeded repeated-game simulator comparing baseline with the ShiftSense mechanism.
7. **Privacy Center**: architecture, routing policy, data inventory, outbound payload inspector, inference history, blocked events, privacy tests, data controls and limitations.
8. **Evaluation Lab**: a 36-test deterministic suite and a live on-device vs cloud benchmark on labelled fictional notes (dev and held-out), measuring accuracy, hallucination, leakage, safety and latency. Anything not run shows as "not tested".

## Run locally

Requires Node 20+ and desktop Chrome with built-in AI. On CPU-only machines that means 16 GB RAM, 4+ cores and 22 GB free disk.

```bash
npm install
cp .env.example .env.local     # optional: fixed App Check debug token for localhost
npm run dev                    # http://localhost:5173
npm test                       # deterministic suite (36 tests)
npm run build && npm run preview   # test the production build
```

Firebase setup (one time):
1. Create a Firebase project and a web app. Put the config in `src/firebase.js`.
2. **AI Logic** → Gemini Developer API.
3. **App Check** → register the web app with Fraud Defense (reCAPTCHA Enterprise). Add your localhost debug token under *Manage debug tokens*.
4. **Authentication** → enable Anonymous.
5. **Firestore** → create a database and publish `firestore.rules`.
6. In the app: **Network Intelligence → Load demo network**, then **Knowledge Library → Write cards**, then **Operator Studio → Prepare model**.

Deploy: `npm run deploy` (needs `firebase-tools` and `firebase login`). Add your hosting domains to the reCAPTCHA key.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Privacy threat model](docs/PRIVACY_THREAT_MODEL.md)
- [Synthetic datasets](docs/DATASETS.md)
- [Benchmark methodology](docs/BENCHMARK.md)
- [Known limitations](docs/LIMITATIONS.md)
- [Demo walkthrough](docs/DEMO.md)

## Honest scope

This is a deployment-quality prototype, not independently validated enterprise software. The demo plants are synthetic. Anonymous sign-in is not a production identity model. Fingerprints are pseudonymized, not anonymous. Android is out of scope for this submission.

## License

Apache 2.0, see [LICENSE](LICENSE).
