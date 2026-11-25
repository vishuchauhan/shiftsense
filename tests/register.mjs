import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);
// Minimal browser globals used by pure modules.
globalThis.localStorage ??= { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
