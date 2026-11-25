# Synthetic datasets

All data is fictional. No real plant, person or machine is represented.

## `data/demo-network.json` (45 fingerprints, 3 plants)
- Four planted failure families: hydraulic press pressure loss after changeovers (12), conveyor jams at startup (10), welding-robot sensor faults after maintenance (9), injection-molder overheating under load (8).
- Six noise incidents (compressor, CNC, paint line, an unrelated conveyor case).
- Resolutions: resolved incidents in a family carry a fix category; about 85% are operator-verified.
- Ground-truth `family` labels stay local. They are used only by the evaluation suite and are never uploaded.
- Plants: North, South, West (synthetic site tokens).

## `data/bench-notes.json` (20 labelled notes)
- **dev** (8): used while writing prompts and rules.
- **held-out** (12): written separately and never used for tuning.
- Contents: planted confidential strings (names, machine IDs, sites, volumes, an email), prompt injections, safety events (fire, burn), explicit "no injuries", monitoring cases, unsuccessful fixes, contradictory evidence, similar symptoms with different causes, resolved notes with and without a stated fix.
- Labels: equipment, symptoms, trigger, cause, status, fix category, downtime minutes, safety status (`flagged` / `explicitly_none` / `not_stated`), and the secret strings that must never appear in a fingerprint.
- Labels reflect one annotator's judgement; cause categories in particular can be ambiguous.
