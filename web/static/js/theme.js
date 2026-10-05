// Theme handling: light / dark / system. The mode is persisted with the other
// settings (localStorage, and mirrored to the account via prefs.js). "system"
// follows prefers-color-scheme live; <html data-theme> always carries the
// resolved theme so style.css only needs two palettes.

import { store } from "./store.js";

const MODES = ["light", "dark", "system"];
const media = window.matchMedia("(prefers-color-scheme: dark)");

function resolve(mode) {
  return mode === "system" ? (media.matches ? "dark" : "light") : mode;
}

function updateMeta(resolved) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (bg) meta.content = bg;
}

export function currentMode() {
  const saved = store.settings().theme;
  return MODES.includes(saved) ? saved : "dark";
}

export function resolvedTheme() {
  return resolve(currentMode());
}

export function applyTheme() {
  const mode = currentMode();
  const resolved = resolve(mode);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  updateMeta(resolved);
  document.dispatchEvent(new CustomEvent("theme:changed", { detail: { mode, resolved } }));
}

export function setTheme(mode) {
  if (!MODES.includes(mode)) return;
  if (mode !== currentMode()) store.saveSettings({ theme: mode });
  applyTheme();
}

export function cycleTheme() {
  const order = ["light", "dark", "system"];
  setTheme(order[(order.indexOf(currentMode()) + 1) % order.length]);
}

export function initTheme() {
  applyTheme();
  media.addEventListener("change", () => {
    if (currentMode() === "system") applyTheme();
  });
}
