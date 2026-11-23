# ShiftSense

**One plant's failure becomes every plant's lesson, and no plant has to share its raw notes.**

ShiftSense is an offline-first hybrid AI app for manufacturing. Operators log messy shift notes on the floor. **Gemini Nano structures them on the device**, and the raw notes never leave it. Deterministic code turns each incident into an allowlisted **failure fingerprint**. Once approved, fingerprints sync through Firestore, and **cloud Gemini finds recurring failure patterns across plants**. The resulting knowledge cards come back to devices for offline matching.

Built for #BuildHybridAI with **Firebase AI Logic hybrid inference** (Web/Chrome + Android).

## How Firebase AI Logic is used

| Task | Mode | File |
|---|---|---|
| Extract raw note → structured incident | `ONLY_ON_DEVICE` + `responseConstraint` schema | `src/ai.js` |
| Cross-plant pattern discovery (fingerprints only) | `ONLY_IN_CLOUD` | `src/ai.js` |
| Non-sensitive summaries | `PREFER_ON_DEVICE` (cloud fallback) | `src/ai.js` |

Every call logs `response.inferenceSource` (`ON_DEVICE` / `IN_CLOUD`) and latency in the UI.

## Run locally (Day 1 setup)

1. **Firebase project:** In the [console](https://console.firebase.google.com), create a project and add a **Web app**. Paste the config into `src/firebase.js`.
2. **AI Logic:** Console → *AI Logic* → *Get started* → choose the **Gemini Developer API**.
3. **App Check:** Console → *App Check* → register the web app with **reCAPTCHA Enterprise** and paste the site key into `src/firebase.js`. Then enforce App Check for *Firebase AI Logic*.
4. **Auth:** Console → *Authentication* → enable **Anonymous** sign-in.
5. **Firestore:** Create a database and paste `firestore.rules` into *Rules*.
6. Install and run:
   ```bash
   npm install
   npm run dev
   ```
7. Open `http://localhost:5173` in **Chrome desktop**. Open DevTools → Console and copy the **App Check debug token**, then register it in Console → App Check → Apps → ⋮ → *Manage debug tokens*. Reload.
8. Click **Prepare model** (downloads Gemini Nano once), then **Structure on-device**.
9. Offline test: DevTools → Network → *Offline*. Structure a note and approve it: it shows *queued*. Go back online: it shows *synced*.

> Open the app online once first so anonymous sign-in completes.

## Hardware

- **Chrome:** desktop Chrome with 16 GB RAM + 4 CPU cores (or a GPU with more than 4 GB VRAM), and 22 GB of free disk.
- **Android:** a Gemini Nano 4 device (for example, Pixel 10/11, Galaxy S25/S26). On unsupported devices, private notes wait in a queue and are never sent to the cloud.

## License

Apache 2.0
