// Reusable UI components: status badges, KPI tiles, panels, empty states, toasts, dialogs, drawer, tables.
import { esc } from "./dom.js";
import { icon } from "./icons.js";

export const badge = (text, tone = "neutral", ic = "") => `<span class="badge ${tone}">${ic ? icon(ic) : ""}${esc(text)}</span>`;

export const kpi = (label, value, sub = "", tone = "") =>
  `<div class="kpi ${tone}"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ""}</div>`;

export const panel = (title, body, { sub = "", actions = "", id = "", cls = "" } = {}) =>
  `<section class="panel ${cls}"${id ? ` id="${id}"` : ""}><header class="panel-h"><div><h2>${esc(title)}</h2>${sub ? `<p class="panel-sub">${sub}</p>` : ""}</div>${actions ? `<div class="panel-actions">${actions}</div>` : ""}</header><div class="panel-b">${body}</div></section>`;

export const emptyState = (title, text = "", action = "") =>
  `<div class="empty">${icon("info")}<div><strong>${esc(title)}</strong>${text ? `<p>${text}</p>` : ""}${action}</div></div>`;

export const callout = (tone, html, ic = "info") => `<div class="callout ${tone}">${icon(ic)}<div>${html}</div></div>`;

export const pageHead = (title, sub, actions = "") =>
  `<div class="page-h"><div><h1>${esc(title)}</h1><p>${sub}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</div>`;

export const btn = (label, { action = "", tone = "", ic = "", id = "", disabled = false, attrs = "" } = {}) =>
  `<button class="btn ${tone}"${action ? ` data-action="${action}"` : ""}${id ? ` id="${id}"` : ""}${disabled ? " disabled" : ""} ${attrs}>${ic ? icon(ic) : ""}<span>${esc(label)}</span></button>`;

export const notTested = (what = "Not tested yet") => `<span class="nt">${icon("info")}${esc(what)}</span>`;

// ---------- toasts ----------
export function toast(message, tone = "neutral", ms = 4200) {
  const host = document.getElementById("toasts");
  if (!host) return;
  const el = document.createElement("div");
  el.className = `toast ${tone}`;
  el.setAttribute("role", tone === "red" ? "alert" : "status");
  el.innerHTML = `${icon(tone === "red" ? "alert" : tone === "green" ? "check" : "info")}<span>${esc(message)}</span>`;
  host.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ---------- confirmation dialog ----------
export function confirmDialog(title, text, { confirm = "Confirm", danger = false } = {}) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "dialog";
    d.innerHTML = `<form method="dialog"><h3>${esc(title)}</h3><p>${text}</p><div class="dialog-actions">
      <button class="btn" value="cancel">Cancel</button><button class="btn ${danger ? "danger" : "primary"}" value="ok">${esc(confirm)}</button></div></form>`;
    document.body.appendChild(d);
    d.addEventListener("close", () => { resolve(d.returnValue === "ok"); d.remove(); });
    d.showModal();
  });
}

// ---------- side drawer ----------
export function openDrawer(title, html) {
  let d = document.getElementById("drawer");
  if (!d) {
    d = document.createElement("aside");
    d.id = "drawer";
    d.className = "drawer";
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-modal", "false");
    document.body.appendChild(d);
    d.addEventListener("click", (e) => e.target.closest("[data-close-drawer]") && closeDrawer());
    document.addEventListener("keydown", (e) => e.key === "Escape" && closeDrawer());
  }
  d.innerHTML = `<header><h3>${esc(title)}</h3><button class="icon-btn" data-close-drawer aria-label="Close panel">${icon("x")}</button></header><div class="drawer-b">${html}</div>`;
  d.classList.add("open");
  d.querySelector("[data-close-drawer]").focus();
}
export const closeDrawer = () => document.getElementById("drawer")?.classList.remove("open");

// ---------- sortable table ----------
/**
 * columns: [{key, label, render?(row), sort?(row) , align?}]
 * Sorting state lives on the caller; clicking a header dispatches data-sort="key".
 */
export function table(columns, rows, { sortKey = "", sortDir = "desc", rowAttr = () => "", empty = "No rows" } = {}) {
  if (!rows.length) return emptyState(empty);
  const head = columns.map((c) => {
    const active = c.key === sortKey;
    return `<th class="${c.align || ""}" ${c.sortable === false ? "" : `data-sort="${c.key}" tabindex="0" aria-sort="${active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}"`}>${esc(c.label)}${active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}</th>`;
  });
  const body = rows.map((r) => `<tr ${rowAttr(r)}>${columns.map((c) => `<td class="${c.align || ""}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join("")}</tr>`);
  return `<div class="table-wrap"><table class="tbl"><thead><tr>${head.join("")}</tr></thead><tbody>${body.join("")}</tbody></table></div>`;
}

export function sortRows(rows, columns, key, dir) {
  const col = columns.find((c) => c.key === key);
  if (!col) return rows;
  const val = col.sort || ((r) => r[key]);
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""));
    return dir === "asc" ? c : -c;
  });
}

export const progress = (value, max = 1, tone = "") => `<div class="bar ${tone}" role="progressbar" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}"><i style="width:${Math.max(0, Math.min(100, (value / max) * 100))}%"></i></div>`;
