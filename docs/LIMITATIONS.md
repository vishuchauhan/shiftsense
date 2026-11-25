# Known limitations

- **Prototype, not validated enterprise software.** Deployment-quality build, no independent security or reliability audit.
- **Identity:** anonymous Firebase Auth for the demo. Site tokens are self-asserted. Production needs organisation membership, verified sites and reviewer roles.
- **Pseudonymized, not anonymous:** fingerprints carry a stable site token.
- **Server-side validation:** rules check field names, types and schema version; full vocabulary validation runs on the client.
- **Contribution scores:** computed on each client from immutable records, not by a server-authoritative ledger (that would require Cloud Functions on a paid plan).
- **Card review:** any signed-in demo user can change review status.
- **On-device performance:** on CPU-only hardware, extraction takes roughly 10–20 s per note. Speed is not the claimed benefit.
- **Verifier is conservative:** some correctly confirmed causes are reset to "unknown" when the note lacks an explicit confirmation phrase.
- **Economics and game theory:** scenario tools built on stated assumptions, not forecasts or measured savings.
- **Android:** not included in this submission.
- **Raw-note audit:** counts calls made in the current browser; it does not observe other clients.
