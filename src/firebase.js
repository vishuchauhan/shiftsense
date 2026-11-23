// Firebase setup: App, App Check, Auth, Firestore (offline-first).
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

// Firebase web config (safe to be public; App Check + Firestore rules protect the project).
const firebaseConfig = {
  apiKey: "AIzaSyDTZ8f3RSAR4yipTR8YrEV9aFlgrDRFRog",
  authDomain: "shiftsense-dcffd.firebaseapp.com",
  projectId: "shiftsense-dcffd",
  storageBucket: "shiftsense-dcffd.firebasestorage.app",
  messagingSenderId: "417270151899",
  appId: "1:417270151899:web:fc27c06b73da511f316afe",
};

// Fraud Defense (reCAPTCHA Enterprise) site key — public.
const RECAPTCHA_ENTERPRISE_SITE_KEY = "6LfETC8uAAAAADXAWAB4pfbijjRj7wJkjEOY-rEa";

// In local dev, App Check prints a debug token in the console.
// Register it in Firebase console → App Check → Apps → ⋮ → Manage debug tokens.
if (location.hostname === "localhost") {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

export const app = initializeApp(firebaseConfig);

initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
});

export const auth = getAuth(app);
export const authReady = signInAnonymously(auth);

// Persistent cache: writes made offline are queued and synced automatically on reconnect.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});