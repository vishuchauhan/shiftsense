# Benchmark methodology

## Deterministic suite (`npm test`, Evaluation Lab)
36 tests over the code around the models: schema validation, leakage, routing policy, hallucination correction, safety states, prompt injection, similarity precision/recall on the demo network (990 pairs), cluster recovery, citation integrity, claim consistency, duplicates, statistics (even-sample median, interpolated P95), economics invariants, and game theory. The same file runs in Node and in the browser.

## Live model benchmark (Evaluation Lab)
- The same notes, schema and code checks are used for both runs. Only the model location differs: Gemini Nano (`ONLY_ON_DEVICE`) vs cloud Gemini (`ONLY_IN_CLOUD`, fictional notes only, logged as `synthetic_note`).
- Per note it records: field accuracy (exact match per enum field, Jaccard for symptoms, ±10% for downtime) before and after code checks; unsupported causes and fixes; safety-status correctness; planted secrets found in the fingerprint; latency.
- Aggregates: median and P95 latency (warm-up excluded and reported separately), completion rate, and offline completion when run with the network off.
- Results are stored locally with a timestamp and sample size. Nothing is shown until measured.

## Verifier conservatism
The Evaluation Lab also feeds the *labelled* answers through the code checks. In the held-out set, two correct causes are reset to "unknown" because the note lacks a confirmation phrase. This is a deliberate trade-off (under-claim rather than invent). The rules were not tuned to these held-out cases.

## Limitations
- Small sample (12 held-out notes); differences of one or two notes are noise.
- Single annotator; synthetic notes are cleaner than real shift logs.
- Latency depends on hardware. On a CPU-only laptop, on-device inference is slower than the cloud.
- Cloud-fallback behaviour on unsupported devices is not tested (Android is out of scope).

## Reproduce
```bash
npm test
npm run dev   # then Evaluation Lab → Run on-device benchmark / Run cloud benchmark
```
