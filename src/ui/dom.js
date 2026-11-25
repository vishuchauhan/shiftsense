// Tiny rendering helpers. Every value from data or the network goes through esc().
export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const nice = (s) => esc(String(s ?? "").replace(/_/g, " "));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const money = (n) => (n == null || !Number.isFinite(n) ? "—" : "$" + Math.round(n).toLocaleString("en-US"));
export const moneyK = (n) => {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  return (n < 0 ? "−" : "") + "$" + (a >= 1e6 ? (a / 1e6).toFixed(1) + "M" : a >= 1e3 ? Math.round(a / 1e3) + "k" : Math.round(a));
};
export const num = (n, d = 0) => (n == null || !Number.isFinite(n) ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }));
export const pct = (x, d = 0) => (x == null || !Number.isFinite(x) ? "—" : (x * 100).toFixed(d) + "%");
export const secs = (ms) => (ms == null ? "—" : (ms / 1000).toFixed(1) + " s");
export const ago = (t) => {
  if (!t) return "—";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
export const tsMs = (ts) => (ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : typeof ts === "number" ? ts : null);
/** Keep keyboard focus and scroll when re-rendering a container. */
export function render(el, html) {
  const active = document.activeElement;
  const id = active && el.contains(active) ? active.id : null;
  let sel = null;
  try { sel = id && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null; } catch { sel = null; }
  const y = window.scrollY;
  el.innerHTML = html;
  if (id) {
    const n = document.getElementById(id);
    n?.focus({ preventScroll: true });
    if (sel && n?.setSelectionRange) try { n.setSelectionRange(sel[0], sel[1]); } catch { /* not a text input */ }
  }
  window.scrollTo(0, y);
}
