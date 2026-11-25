// Application shell: sidebar, top bar, hash router, global status chips.
import "./style.css";
import { state, start, subscribe, pendingMine } from "./state.js";
import { icon, BRAND } from "./ui/icons.js";
import { esc } from "./ui/dom.js";
import { toast } from "./ui/components.js";
import command from "./views/command.js";
import operator from "./views/operator.js";
import network from "./views/network.js";
import knowledge from "./views/knowledge.js";
import economics from "./views/economics.js";
import cooperative from "./views/cooperative.js";
import privacy from "./views/privacy.js";
import evaluation from "./views/evaluation.js";

const ROUTES = [
  { id: "command", label: "Command Center", icon: "command", group: "Operate", view: command },
  { id: "operator", label: "Operator Studio", icon: "operator", group: "Operate", view: operator },
  { id: "network", label: "Network Intelligence", icon: "network", group: "Analyse", view: network },
  { id: "knowledge", label: "Knowledge Library", icon: "knowledge", group: "Analyse", view: knowledge },
  { id: "economics", label: "Economic Intelligence", icon: "economics", group: "Decide", view: economics },
  { id: "cooperative", label: "Cooperative Intelligence", icon: "cooperative", group: "Decide", view: cooperative },
  { id: "privacy", label: "Privacy Center", icon: "privacy", group: "Govern", view: privacy },
  { id: "evaluation", label: "Evaluation Lab", icon: "evaluation", group: "Govern", view: evaluation },
];

// ---------- errors never fail silently ----------
addEventListener("error", (e) => toast(e.message || "Unexpected error", "red"));
addEventListener("unhandledrejection", (e) => toast(e.reason?.message || String(e.reason), "red"));

// ---------- offline app shell ----------
if ("serviceWorker" in navigator && !globalThis.__SS_FIXTURE__) {
  navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("SW:", e.message));
}

// ---------- theme ----------
const savedTheme = localStorage.getItem("ss_theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

function shell() {
  const groups = [...new Set(ROUTES.map((r) => r.group))];
  document.getElementById("app").innerHTML = `
    <a class="skip" href="#content">Skip to content</a>
    <div class="shell ${localStorage.getItem("ss_nav") === "collapsed" ? "collapsed" : ""}" id="shell">
      <aside class="side" aria-label="Main navigation">
        <div class="brand">${BRAND}<div>ShiftSense<small>Industrial intelligence network</small></div></div>
        <nav class="nav">
          ${groups.map((g) => `<div class="nav-group">${g}</div>${ROUTES.filter((r) => r.group === g).map((r) => `<a href="#/${r.id}" data-route="${r.id}" title="${r.label}">${icon(r.icon)}<span>${r.label}</span></a>`).join("")}`).join("")}
        </nav>
        <div class="side-foot"><button class="side-btn" id="collapse" aria-label="Collapse navigation">${icon("collapse")}<span class="label">Collapse</span></button></div>
      </aside>
      <div class="main">
        <header class="top">
          <button class="icon-btn menu-btn" id="menu" aria-label="Open navigation">${icon("menu")}</button>
          <div class="crumbs" id="crumbs"></div>
          <div class="top-right">
            <span class="chip hide-sm" title="Workspace">${icon("layers")}Demo network</span>
            <span class="chip hide-sm" id="siteChip" title="This device's pseudonymous site token">${icon("database")}${esc(state.site)}</span>
            <span class="chip" id="netChip"></span>
            <span class="chip hide-sm" id="modelChip"></span>
            <span class="chip hide-sm" id="syncChip"></span>
            <button class="icon-btn" id="theme" aria-label="Toggle dark mode">${icon(document.documentElement.dataset.theme === "dark" ? "sun" : "moon")}</button>
            <button class="icon-btn" id="session" aria-label="Session" title="Anonymous demo session">${icon("user")}</button>
          </div>
        </header>
        <div class="demo-bar" role="note">${icon("info")}Demo mode: plants named North, South and West are synthetic. Anonymous sign-in is for demonstration only, not a production identity model.</div>
        <main class="content" id="content" tabindex="-1"></main>
      </div>
    </div>
    <div id="toasts" aria-live="polite"></div>`;

  document.getElementById("collapse").onclick = () => {
    const s = document.getElementById("shell");
    s.classList.toggle("collapsed");
    localStorage.setItem("ss_nav", s.classList.contains("collapsed") ? "collapsed" : "open");
  };
  document.getElementById("menu").onclick = () => document.getElementById("shell").classList.toggle("nav-open");
  document.getElementById("theme").onclick = (e) => {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("ss_theme", dark ? "dark" : "light");
    e.currentTarget.innerHTML = icon(dark ? "sun" : "moon");
  };
  document.getElementById("session").onclick = () =>
    toast(`Anonymous demo session${state.uid ? " " + state.uid.slice(0, 6) + "…" : ""} · site ${state.site}. Reset local data in the Privacy Center.`);
}

function renderChips() {
  const net = document.getElementById("netChip");
  net.className = `chip ${state.online ? "green" : "red"}`;
  net.innerHTML = `${icon(state.online ? "online" : "offline")}${state.online ? "Online" : "Offline"}`;
  const m = state.model;
  const mc = document.getElementById("modelChip");
  const label = { ready: "Gemini Nano ready", downloading: `Model ${m.progress}%`, warming: "Warming up", unavailable: "Model unavailable", not_prepared: "Model not prepared" }[m.status] || m.status;
  mc.className = `chip hide-sm ${m.status === "ready" ? "green" : m.status === "unavailable" ? "red" : m.status === "not_prepared" ? "" : "amber"}`;
  mc.innerHTML = `${icon("cpu")}${label}`;
  const pend = pendingMine();
  const sc = document.getElementById("syncChip");
  sc.className = `chip hide-sm ${pend ? "amber" : state.poolFromCache ? "" : "green"}`;
  sc.innerHTML = `${icon("sync")}${pend ? `${pend} queued` : state.poolFromCache ? "Cached copy" : "Synced"}`;
}

let current = null;
function route() {
  const id = (location.hash.replace(/^#\//, "").split("?")[0]) || "command";
  const r = ROUTES.find((x) => x.id === id) || ROUTES[0];
  current?.cleanup?.();
  document.querySelectorAll(".nav a").forEach((a) => (a.dataset.route === r.id ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  document.getElementById("crumbs").innerHTML = `<span>ShiftSense</span><span>/</span><span>${r.group}</span><span>/</span><b>${r.label}</b>`;
  document.getElementById("shell").classList.remove("nav-open");
  const el = document.getElementById("content");
  el.innerHTML = "";
  const cleanup = r.view.mount(el) || null;
  current = { id: r.id, cleanup };
  document.title = `${r.label} · ShiftSense`;
  el.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

shell();
start();
subscribe(renderChips);
renderChips();
addEventListener("hashchange", route);
route();
