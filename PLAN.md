# ShiftSense — 7-Day Build Plan (#BuildHybridAI)

**Deadline:** Mon Nov 30, 2026, 2:00 PM PT / 4:00 PM CT. Target: submit by 12:00 PM CT.

**One-liner:** One plant's failure becomes every plant's lesson, and no plant has to share its raw notes.

## The core loop (the whole product; build this first)

```
Operator note (raw, private)
   │  ON-DEVICE ONLY (Gemini Nano, ONLY_ON_DEVICE)
   ▼
Structured incident (stays on device)
   │  DETERMINISTIC CODE (no AI): allowlisted enums only
   ▼
Failure fingerprint ──► operator approves ──► Firestore (works offline, syncs later)
   │
   │  CLOUD ONLY (Gemini, ONLY_IN_CLOUD): across plants
   ▼
Knowledge cards (recurring patterns + what fixed them)
   │  synced back + cached on device
   ▼
New incident offline ──► on-device match against cached cards ──► "3 similar cases; check X first"
```

## Inference routing (show this table in the README + video)

| Task | Where | Mode | Why |
|---|---|---|---|
| Extract raw operator note | Device | `ONLY_ON_DEVICE` | Raw notes have names, machine IDs, volumes. Never sent to the cloud. |
| Build fingerprint | Plain code | none | Privacy by construction: only allowlisted enum values can leave. |
| Match new incident to cached cards | Device | `ONLY_ON_DEVICE` | Works offline on the floor. |
| Find patterns across plants | Cloud | `ONLY_IN_CLOUD` | Needs many records + stronger reasoning. Input is fingerprints only. |
| Summarize approved records for managers | Either | `PREFER_ON_DEVICE` | Non-sensitive, so cloud fallback is allowed (shown on unsupported devices). |
| Downtime cost exposure | Plain code | none | Money math should never come from an LLM. |

If a device can't run the local model, raw notes **wait in a queue or get filled in manually**. They're never quietly sent to the cloud.

## Scope

**Must have (core):** the loop above, a routing badge on every AI call (on-device / cloud, latency), offline demo, Chrome web app + Android app sharing one Firebase backend.

**Should have:** manager dashboard (pattern clusters, knowledge cards), downtime cost calculator `E(L) = P(recurrence) × downtime_min × $/min`, mini-benchmark.

**Cut:** contribution credits / game theory, IoT, predictive ML, audio input, cross-company sharing (that's the vision slide only; the demo is **one manufacturer, 3 plants**).

## Day by day

| Day | Date | Goal | Done when |
|---|---|---|---|
| 1 | Mon 23 | Setup | Firebase project, web app registered, AI Logic enabled, App Check debug token works, on-device extraction returns JSON in Chrome |
| 2 | Tue 24 | Operator flow (web) | Note → extraction → fingerprint → approve → Firestore; works with Wi-Fi off and syncs on reconnect |
| 3 | Wed 25 | Collective intelligence | 45 seed fingerprints across 3 plants; cloud groups them into knowledge cards stored in Firestore |
| 4 | Thu 26 | Close the loop | Cards cached locally; new offline incident matched on-device; manager dashboard v1 |
| 5 | Fri 27 | Android | Kotlin app on Pixel 11: capture → on-device extract → fingerprint → sync. Pixel 10a shows queue/fallback behaviour |
| 6 | Sat 28 | Polish + proof | Cost calculator, benchmark (leakage, cloud calls saved, latency), UI polish, hosted on Firebase Hosting |
| 7 | Sun 29 | Ship | README, Apache 2.0 license, repo public, 3-min video recorded + on YouTube, Devpost draft |
| Buffer | Mon 30 | Submit | Submit by noon CT |

## Mini-benchmark (Day 6)

45 synthetic incidents across 3 plants, with planted sensitive fields (names, machine IDs, volumes) and 4 known recurring failure families.

Measure:
1. **Sensitive-field leakage** in synced data (target: 0, guaranteed by the allowlist)
2. **Extraction accuracy** on-device vs. cloud (field match vs. hand labels)
3. **Cloud calls**: hybrid vs. cloud-only for the same workload
4. **Latency**: median on-device vs. cloud
5. **Pattern recovery**: did the cloud find the 4 planted families?

## Demo video (3:00)

| Time | Shot |
|---|---|
| 0:00–0:20 | Problem: three plants paying to discover the same fix |
| 0:20–0:55 | Pixel 11, airplane mode: messy note → on-device extraction (badge shows ON_DEVICE, latency) |
| 0:55–1:15 | Fingerprint screen: what stays vs. what leaves. Approve. Queued offline |
| 1:15–1:45 | Reconnect → sync → Chrome dashboard: cloud finds the recurring pattern across plants |
| 1:45–2:15 | Second plant, offline: new note matched to the cached knowledge card |
| 2:15–2:35 | Pixel 10a: private task refuses to fall back; non-sensitive summary falls back to cloud |
| 2:35–2:50 | Benchmark slide + cost exposure |
| 2:50–3:00 | Vision: the same idea across companies. Close |

## Submission checklist

- [ ] Public GitHub repo, Apache 2.0 license visible in About
- [ ] Firebase AI Logic imported **and called** in code (`src/ai.js`, Android `AiRepository.kt`)
- [ ] App Check configured; debug-token instructions in README
- [ ] Hosted web URL (Firebase Hosting)
- [ ] YouTube video ≤ 3:00, public, English
- [ ] Devpost text: how Firebase AI Logic is used, features, value proposition
- [ ] Platforms selected: Web + Android
