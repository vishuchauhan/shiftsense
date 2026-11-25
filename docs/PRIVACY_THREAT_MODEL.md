# Privacy threat model

## Assets
Raw shift notes (names, machine IDs, production volumes, exact downtime), plant identity, cost assumptions.

## Trust boundaries
1. **Device ↔ cloud.** Only fingerprints, reuse events and knowledge cards cross.
2. **Model ↔ code.** Model output is untrusted until code verifies it.
3. **Network ↔ UI.** Shared records and generated text are untrusted. Values are validated against the vocabulary (`isValidShared`) and HTML-escaped.

## Threats and controls

| Threat | Control | Evidence |
|---|---|---|
| Raw note sent to the cloud | Private tasks are `ONLY_ON_DEVICE` with no fallback; the policy table is the single source | Suite: routing test; audit counts violations from real calls |
| Model copies names or IDs into fields | Fingerprints contain only allowlisted enum values; validator rejects unknown fields and values | Suite: 7 planted secrets, 0 in fingerprint; benchmark leakage metric |
| Prompt injection in a note | Note treated as data in prompts; output constrained to enums; routing is static code | Suite: injection test |
| Invented root cause or fix | Verifier resets unconfirmed causes and fixes | Suite + benchmark "unsupported causes" raw vs checked |
| Fabricated citations in cards | L1 citation check against the pattern's IDs | Suite; Knowledge Library L1 badges |
| Unsupported claims in card text | L2 checks causes and fixes named in the summary against data | Suite; L2 badges |
| AI advice for safety incidents | Safety mode: no evidence ranking, no AI | Suite |
| Record tampering | Fingerprints and reuse events are create-only and owner-bound; field allowlist in rules | `firestore.rules` |
| Duplicate credit | Reuse ID is `card__site` and create-only; content-key duplicate window | Suite |
| Cost data leakage | Economics settings stay in localStorage only | Code review |
| Abuse of AI Logic quota | App Check (Fraud Defense); debug tokens only on localhost, never committed | `.gitignore`, `.env.example` |

## Residual risks
- Pseudonymity, not anonymity: the site token links a site's incidents; rare equipment could be recognisable.
- Anonymous auth: site tokens are self-asserted, so one actor could pose as several sites.
- Value-level validation runs on the client; rules check field names, types and schema version. Production should add a trusted Cloud Function check.
- Any signed-in demo user can change card review status.
