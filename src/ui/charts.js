// Lightweight SVG charts (no dependency, works offline). Inputs are always real application data.
import { esc } from "./dom.js";

export const PALETTE = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];
const fmtDefault = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : Math.round(v * 100) / 100);

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
const ticks = (max, n = 4) => Array.from({ length: n + 1 }, (_, i) => (max / n) * i);

/** Horizontal bars. items: [{label, value, color?, note?}] */
export function hbar(items, { format = fmtDefault, width = 560, rowH = 30, labelW = 190, title = "" } = {}) {
  if (!items.length) return empty();
  const max = niceMax(Math.max(...items.map((i) => i.value)));
  const h = items.length * rowH + 24;
  const plotW = width - labelW - 70;
  const rows = items.map((it, i) => {
    const y = i * rowH + 6;
    const w = Math.max(1, (it.value / max) * plotW);
    return `<g><text x="${labelW - 8}" y="${y + rowH / 2}" text-anchor="end" class="ch-label">${esc(trim(it.label, fit(labelW)))}</text>
      <rect x="${labelW}" y="${y + 5}" width="${w}" height="${rowH - 12}" rx="2" fill="${it.color || PALETTE[0]}"><title>${esc(it.label)}: ${esc(format(it.value))}</title></rect>
      <text x="${labelW + w + 6}" y="${y + rowH / 2}" class="ch-val">${esc(format(it.value))}${it.note ? ` <tspan class="ch-note">${esc(it.note)}</tspan>` : ""}</text></g>`;
  });
  return svg(width, h, rows.join(""), title);
}

/** Stacked horizontal bars. items: [{label, parts:[{value, color, name}]}] */
export function stacked(items, { width = 560, rowH = 28, labelW = 190, legend = [] } = {}) {
  if (!items.length) return empty();
  const max = Math.max(1, ...items.map((i) => i.parts.reduce((t, p) => t + p.value, 0)));
  const plotW = width - labelW - 40;
  const rows = items.map((it, i) => {
    const y = i * rowH + 6;
    let x = labelW;
    const segs = it.parts.map((p) => {
      const w = (p.value / max) * plotW;
      const s = w > 0 ? `<rect x="${x}" y="${y + 5}" width="${w}" height="${rowH - 12}" fill="${p.color}"><title>${esc(p.name)}: ${p.value}</title></rect>` : "";
      x += w;
      return s;
    });
    const total = it.parts.reduce((t, p) => t + p.value, 0);
    return `<text x="${labelW - 8}" y="${y + rowH / 2}" text-anchor="end" class="ch-label">${esc(trim(it.label, fit(labelW)))}</text>${segs.join("")}<text x="${x + 6}" y="${y + rowH / 2}" class="ch-val">${total}</text>`;
  });
  return svg(width, items.length * rowH + 16, rows.join("")) + legendHtml(legend);
}

/** Line chart. series: [{name, values:[], color}] */
export function line(series, { width = 560, height = 220, yFormat = fmtDefault, xLabel = "", yLabel = "", yMax = null, yMin = 0 } = {}) {
  const n = Math.max(0, ...series.map((s) => s.values.length));
  if (!n) return empty();
  const all = series.flatMap((s) => s.values);
  const max = yMax ?? niceMax(Math.max(...all, 0));
  const min = Math.min(yMin, ...all);
  const L = 48, R = 12, T = 12, B = 30;
  const pw = width - L - R, ph = height - T - B;
  const X = (i) => L + (n === 1 ? pw / 2 : (i / (n - 1)) * pw);
  const Y = (v) => T + ph - ((v - min) / (max - min || 1)) * ph;
  const grid = ticks(max - min).map((v0) => {
    const v = v0 + min;
    return `<line x1="${L}" x2="${width - R}" y1="${Y(v)}" y2="${Y(v)}" class="ch-grid"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" class="ch-axis">${esc(yFormat(v))}</text>`;
  });
  const paths = series.map((s, si) => {
    const d = s.values.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
    return `<path d="${d}" fill="none" stroke="${s.color || PALETTE[si]}" stroke-width="2"${s.dashed ? ' stroke-dasharray="5 4"' : ""}><title>${esc(s.name)}</title></path>`;
  });
  const xl = `<text x="${L}" y="${height - 8}" class="ch-axis">1</text><text x="${width - R}" y="${height - 8}" text-anchor="end" class="ch-axis">${n}</text>` +
    (xLabel ? `<text x="${L + pw / 2}" y="${height - 8}" text-anchor="middle" class="ch-axis">${esc(xLabel)}</text>` : "");
  return svg(width, height, grid.join("") + paths.join("") + xl, yLabel) + legendHtml(series.map((s, i) => ({ name: s.name, color: s.color || PALETTE[i], dashed: s.dashed })));
}

/** Scatter. points: [{x, y, label, color, r}] */
export function scatter(points, { width = 560, height = 260, xLabel = "", yLabel = "", xFormat = fmtDefault, yFormat = fmtDefault } = {}) {
  if (!points.length) return empty();
  const L = 56, R = 16, T = 14, B = 40;
  const pw = width - L - R, ph = height - T - B;
  const xMax = niceMax(Math.max(...points.map((p) => p.x)) * 1.1);
  const yMax = niceMax(Math.max(...points.map((p) => p.y)) * 1.1);
  const X = (v) => L + (v / xMax) * pw;
  const Y = (v) => T + ph - (v / yMax) * ph;
  const grid = ticks(yMax).map((v) => `<line x1="${L}" x2="${width - R}" y1="${Y(v)}" y2="${Y(v)}" class="ch-grid"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" class="ch-axis">${esc(yFormat(v))}</text>`);
  const xt = ticks(xMax).map((v) => `<text x="${X(v)}" y="${T + ph + 16}" text-anchor="middle" class="ch-axis">${esc(xFormat(v))}</text>`);
  const dots = points.map((p, i) => `<g><circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${p.r || 7}" fill="${p.color || PALETTE[i % PALETTE.length]}" fill-opacity=".85"><title>${esc(p.label)}: ${esc(xFormat(p.x))}, ${esc(yFormat(p.y))}</title></circle>
    <text x="${X(p.x) + 10}" y="${Y(p.y) + 4}" class="ch-label">${esc(trim(p.label, 22))}</text></g>`);
  const labels = `<text x="${L + pw / 2}" y="${height - 4}" text-anchor="middle" class="ch-axis">${esc(xLabel)}</text>
    <text x="12" y="${T + ph / 2}" transform="rotate(-90 12 ${T + ph / 2})" text-anchor="middle" class="ch-axis">${esc(yLabel)}</text>`;
  return svg(width, height, grid.join("") + xt.join("") + dots.join("") + labels);
}

/** Pareto: bars (value) + cumulative share line. items: [{label, value, cumShare}] */
export function pareto(items, { width = 560, height = 240, format = fmtDefault } = {}) {
  if (!items.length) return empty();
  const L = 56, R = 40, T = 12, B = 54;
  const pw = width - L - R, ph = height - T - B;
  const max = niceMax(Math.max(...items.map((i) => i.value)));
  const bw = pw / items.length;
  const Y = (v) => T + ph - (v / max) * ph;
  const Yp = (s) => T + ph - s * ph;
  const grid = ticks(max).map((v) => `<line x1="${L}" x2="${width - R}" y1="${Y(v)}" y2="${Y(v)}" class="ch-grid"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" class="ch-axis">${esc(format(v))}</text>`);
  const bars = items.map((it, i) => `<rect x="${L + i * bw + bw * 0.15}" y="${Y(it.value)}" width="${bw * 0.7}" height="${T + ph - Y(it.value)}" fill="var(--c1)"><title>${esc(it.label)}: ${esc(format(it.value))}</title></rect>
    <text x="${L + i * bw + bw / 2}" y="${T + ph + 14}" text-anchor="middle" class="ch-label">${esc(trim(it.label, 14))}</text>`);
  const d = items.map((it, i) => `${i ? "L" : "M"}${L + i * bw + bw / 2},${Yp(it.cumShare)}`).join("");
  const pts = items.map((it, i) => `<circle cx="${L + i * bw + bw / 2}" cy="${Yp(it.cumShare)}" r="3.5" fill="var(--amber)"/><text x="${L + i * bw + bw / 2}" y="${Yp(it.cumShare) - 8}" text-anchor="middle" class="ch-val">${Math.round(it.cumShare * 100)}%</text>`);
  const right = [0, 0.5, 1].map((s) => `<text x="${width - R + 6}" y="${Yp(s) + 4}" class="ch-axis">${s * 100}%</text>`);
  const eighty = `<line x1="${L}" x2="${width - R}" y1="${Yp(0.8)}" y2="${Yp(0.8)}" class="ch-ref"/>`;
  return svg(width, height, grid.join("") + bars.join("") + eighty + `<path d="${d}" fill="none" stroke="var(--amber)" stroke-width="2"/>` + pts.join("") + right.join("")) +
    legendHtml([{ name: "Midpoint cost", color: "var(--c1)" }, { name: "Cumulative share (80% line dashed)", color: "var(--amber)" }]);
}

/** Low–mid–high range bars. items: [{label, low, mid, high}] */
export function ranges(items, { width = 560, rowH = 32, labelW = 190, format = fmtDefault } = {}) {
  if (!items.length) return empty();
  const max = niceMax(Math.max(...items.map((i) => i.high)));
  const plotW = width - labelW - 80;
  const X = (v) => labelW + (v / max) * plotW;
  const rows = items.map((it, i) => {
    const y = i * rowH + 8;
    return `<text x="${labelW - 8}" y="${y + rowH / 2}" text-anchor="end" class="ch-label">${esc(trim(it.label, fit(labelW)))}</text>
      <rect x="${X(it.low)}" y="${y + 9}" width="${Math.max(2, X(it.high) - X(it.low))}" height="${rowH - 18}" rx="3" fill="var(--c1)" fill-opacity=".25"><title>low ${esc(format(it.low))} – high ${esc(format(it.high))}</title></rect>
      <line x1="${X(it.mid)}" x2="${X(it.mid)}" y1="${y + 5}" y2="${y + rowH - 5}" stroke="var(--c1)" stroke-width="3"/>
      <text x="${X(it.high) + 6}" y="${y + rowH / 2}" class="ch-val">${esc(format(it.mid))}</text>`;
  });
  return svg(width, items.length * rowH + 16, rows.join("")) + legendHtml([{ name: "Low–high range", color: "var(--c1)", soft: true }, { name: "Midpoint", color: "var(--c1)" }]);
}

function svg(w, h, body, title = "") {
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMinYMin meet" role="img"${title ? ` aria-label="${esc(title)}"` : ""}>${body}</svg>`;
}
function legendHtml(items) {
  if (!items.length) return "";
  return `<div class="legend">${items.map((l) => `<span><i style="background:${l.color};${l.soft ? "opacity:.3" : ""}${l.dashed ? ";background:repeating-linear-gradient(90deg," + l.color + " 0 4px,transparent 4px 7px)" : ""}"></i>${esc(l.name)}</span>`).join("")}</div>`;
}
const empty = () => `<div class="chart-empty">No data yet</div>`;
const fit = (labelW) => Math.max(8, Math.floor((labelW - 12) / 6.2));
const trim = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));
