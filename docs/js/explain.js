// "Why this ETA": renders TreeSHAP attributions of the median model as minutes added or removed.
import { h, clear, mins } from "./ui.js?v=202611101408";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function fmtFeature(f, v) {
  if (v === null || Number.isNaN(v)) return f === "hist_chg" ? "no history (unseen train)" : "missing";
  switch (f) {
    case "cur_delay": case "slack_rem": case "sched_rem": return mins(v);
    case "resched": return v > 0 ? mins(v) : "none";
    case "dchg1": case "dchg3": case "hist_chg": return mins(v, true);
    case "n_rem": return `${v} stop${v === 1 ? "" : "s"}`;
    case "dist_rem": return `${Math.round(v)} km`;
    case "single_frac": return `${Math.round(v * 100)}%`;
    case "cong_rem": return v.toFixed(2);
    case "hour": { const m = Math.round(v * 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }
    case "dow": return DOW[v] ?? v;
    case "month": return MONTHS[v - 1] ?? v;
    case "fog_season": case "festival": return v ? "yes" : "no";
    case "visibility": return `${v.toFixed(v < 1 ? 2 : 1)} km`;
    case "rain": return `${Math.round(v)} mm`;
    case "train_type": return ["express", "superfast", "special"][v] ?? v;
    default: return String(v);
  }
}

export function renderWhy(el, M, row, top = 6) {
  clear(el);
  const nF = M.features.length;
  const phi = row.shap;
  const items = M.features.map((f, i) => ({ f, label: M.labels[f], v: phi[i], x: row.x[i] }))
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const shown = items.slice(0, top);
  const rest = items.slice(top).reduce((a, b) => a + b.v, 0);
  const maxAbs = Math.max(4, ...shown.map(i => Math.abs(i.v)), Math.abs(rest));
  const list = h("div", { class: "why-list" });
  const bar = v => {
    const w = Math.abs(v) / maxAbs * 50;
    return h("div", { class: "bar" }, h("span", { style: `left:${v >= 0 ? 50 : 50 - w}%;width:${w}%;background:${v >= 0 ? "var(--stop)" : "var(--go)"}` }));
  };
  list.append(h("div", { class: "why-row small" }, h("span", {}, "Typical correction for any train"), h("span"), h("span", { class: "v" }, mins(phi[nF], true))));
  for (const it of shown) {
    list.append(h("div", { class: "why-row" },
      h("span", {}, it.label, h("span", { class: "faint" }, `  ${fmtFeature(it.f, it.x)}`)),
      bar(it.v), h("span", { class: "v" }, mins(it.v, true))));
  }
  list.append(h("div", { class: "why-row small" }, h("span", {}, `${items.length - top} other signals`), bar(rest), h("span", { class: "v" }, mins(rest, true))));
  const total = phi.reduce((a, b) => a + b, 0);
  el.append(list, h("div", { class: "why-total" },
    h("span", {}, "Correction to today’s estimate"), h("b", { style: "color:var(--board)" }, mins(total, true))));
  el.append(h("p", { class: "small", style: "margin-top:8px" },
    "Red adds minutes, green removes them. Computed with TreeSHAP on the median model, live in your browser."));
}
