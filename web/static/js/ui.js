// Small DOM + formatting helpers shared by the views.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Escape text inserted into an innerHTML template. */
export function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function toast(message, kind = "") {
  const host = $("#toasts");
  const node = document.createElement("div");
  node.className = `toast ${kind}`;
  node.textContent = message;
  host.append(node);
  setTimeout(() => {
    node.style.opacity = "0";
    setTimeout(() => node.remove(), 250);
  }, 3200);
}

export function fmtPct(value) {
  if (!Number.isFinite(value)) return "–";
  return `${Math.round(value * 100)}%`;
}

export function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "–";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** Local (not UTC) date key YYYY-MM-DD. */
export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Human day label for the last 7 days, e.g. "Mo". */
export function weekdayLabel(ts) {
  return new Date(ts).toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "");
}
