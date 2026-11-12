// Small DOM, SVG, formatting and animation helpers shared by every view.

// Version stamp for cache-busting (tools/stamp.py rewrites it).
export const VER = "202611121112";

export const SVGNS = "http://www.w3.org/2000/svg";

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

export function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid) el.append(kid);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function linear(d0, d1, r0, r1) {
  const f = v => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
  f.invert = y => d0 + ((y - r0) / (r1 - r0 || 1)) * (d1 - d0);
  return f;
}

export function niceTicks(min, max, n = 5) {
  const span = max - min || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(st => st >= step0);
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

// Clock formatting. Times are absolute minutes since START (1 Nov 2025, 00:00).
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const START_MS = Date.parse("2025-11-01T00:00:00Z");

export function hhmm(absMin) {
  const m = ((Math.round(absMin) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
export function dayLabel(absMin) {
  const d = new Date(START_MS + Math.floor(absMin / 1440) * 86400000);
  return `${DAYS[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function mins(v, signed = false) {
  const r = Math.round(v);
  const a = Math.abs(r);
  const txt = a >= 60 ? `${Math.floor(a / 60)} h ${String(a % 60).padStart(2, "0")} min` : `${a} min`;
  if (!signed) return r < 0 ? `${txt} early` : txt;
  return r === 0 ? "±0 min" : `${r > 0 ? "+" : "−"}${txt}`;
}
export function delayClass(d) { return d >= 60 ? "vlate" : d >= 15 ? "late" : "ok"; }
export function delayColor(d) { return d >= 60 ? "var(--stop)" : d >= 15 ? "var(--warn)" : "var(--go)"; }

// Animate numbers or attributes with requestAnimationFrame.
const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export function tween(from, to, ms, step, done) {
  if (reduce || ms <= 0) { step(to); done && done(); return () => {}; }
  const t0 = performance.now();
  let raf;
  const ease = t => 1 - Math.pow(1 - t, 3);
  const tick = now => {
    const p = Math.max(0, Math.min(1, (now - t0) / ms));
    step(from + (to - from) * ease(p));
    if (p < 1) raf = requestAnimationFrame(tick); else done && done();
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
export function countUp(el, to, fmt = v => Math.round(v), ms = 1100) {
  tween(0, to, ms, v => { el.textContent = fmt(v); });
}

// One shared tooltip element.
let tipEl;
export function tip(html, ev) {
  if (!tipEl) { tipEl = h("div", { class: "tip", role: "tooltip" }); document.body.append(tipEl); }
  if (!html) { tipEl.classList.remove("on"); return; }
  tipEl.innerHTML = html;
  const x = Math.min(ev.clientX + 14, window.innerWidth - 300);
  const y = Math.min(ev.clientY + 14, window.innerHeight - 120);
  tipEl.style.left = `${x}px`; tipEl.style.top = `${y}px`;
  tipEl.classList.add("on");
}

// Draw a path progressively (used once per chart on first reveal).
export function drawIn(path, ms = 1200, delay = 0) {
  if (reduce) return;
  const len = path.getTotalLength();
  path.style.strokeDasharray = `${len}`;
  path.style.strokeDashoffset = `${len}`;
  path.getBoundingClientRect();
  path.style.transition = `stroke-dashoffset ${ms}ms cubic-bezier(.3,.7,.2,1) ${delay}ms`;
  requestAnimationFrame(() => { path.style.strokeDashoffset = "0"; });
  setTimeout(() => { path.style.strokeDasharray = ""; path.style.transition = ""; }, ms + delay + 50);
}

// Tween numeric SVG attributes from their current values to new ones.
export function animAttr(el, attrs, ms = 550) {
  const from = {};
  for (const k of Object.keys(attrs)) from[k] = parseFloat(el.getAttribute(k));
  if (el._anim) el._anim();
  el._anim = tween(0, 1, ms, p => {
    for (const [k, v] of Object.entries(attrs)) {
      const a = Number.isFinite(from[k]) ? from[k] : v;
      el.setAttribute(k, (a + (v - a) * p).toFixed(2));
    }
  });
}

// Paint the filled part of a range slider (WebKit has no native progress fill).
export function fill(r) {
  const min = +r.min || 0, max = +r.max || 100;
  r.style.setProperty("--p", `${((+r.value - min) / (max - min)) * 100}%`);
}
document.addEventListener("input", e => { if (e.target.matches && e.target.matches("input[type=range]")) fill(e.target); });
