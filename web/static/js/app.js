// Entry point: navigation, view lifecycle, language toggle, account preferences
// and the streak chip.

import { auth } from "./auth.js";
import { renderDashboard, computeStats } from "./dashboard.js";
import { renderMath, teardownMath } from "./math.js";
import { renderMemory, teardownMemory } from "./memory.js";
import { renderReaction, teardownReaction } from "./reaction.js";
import { renderVisual, teardownVisual } from "./visual.js";
import { $, $$ } from "./ui.js";
import { initI18n, toggleLang, getLang, t, applyStatic } from "./i18n.js";
import { initPrefs, loadAccountPrefs } from "./prefs.js";
import { initTheme, setTheme, cycleTheme, currentMode } from "./theme.js";
import { isOfflineApp } from "./platform.js";

const views = {
  dashboard: $("#view-dashboard"),
  math: $("#view-math"),
  memory: $("#view-memory"),
  reaction: $("#view-reaction"),
  visual: $("#view-visual"),
};
const renderers = {
  dashboard: renderDashboard,
  math: renderMath,
  memory: renderMemory,
  reaction: renderReaction,
  visual: renderVisual,
};
const teardowns = {
  math: teardownMath,
  memory: teardownMemory,
  reaction: teardownReaction,
  visual: teardownVisual,
};

let current = null;

function updateStreak() {
  $("#streak-value").textContent = computeStats().streak;
}

function updateChrome() {
  $("#lang-button").textContent = getLang().toUpperCase();
  const authButton = $("#auth-button");
  authButton.textContent = t(authButton.dataset.i18n || "header.signIn");
  updateThemeUI();
  updateMenu();
}

function updateThemeUI() {
  const mode = currentMode();
  const icons = { light: "☀", dark: "☾", system: "◐" };
  const themeButton = $("#theme-button");
  themeButton.textContent = icons[mode];
  themeButton.title = t(`theme.${mode}`);
  themeButton.setAttribute("aria-label", t("theme.cycle"));
  $$("#menu-theme button").forEach((b) => b.classList.toggle("active", b.dataset.themeMode === mode));
}

function updateMenu() {
  $("#menu-language").textContent = `${t("menu.language")}: ${getLang().toUpperCase()}`;
  $("#menu-auth").textContent = auth.isAuthenticated() ? t("header.signOut") : t("header.signIn");
}

function show(view) {
  if (!views[view]) view = "dashboard";
  if (current && teardowns[current]) teardowns[current]();
  current = view;

  Object.entries(views).forEach(([key, node]) => node.classList.toggle("hidden", key !== view));
  $$("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  renderers[view](views[view]);
  if (location.hash !== `#${view}`) history.replaceState(null, "", `#${view}`);
}

$$("#nav button").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));
window.addEventListener("hashchange", () => show(location.hash.slice(1) || "dashboard"));

$("#lang-button").addEventListener("click", () => toggleLang());

$("#theme-button").addEventListener("click", () => {
  cycleTheme();
  updateThemeUI();
});
$$("#menu-theme button").forEach((b) =>
  b.addEventListener("click", () => {
    setTheme(b.dataset.themeMode);
    updateThemeUI();
  }),
);
document.addEventListener("theme:changed", updateThemeUI);

$("#menu-button").addEventListener("click", () => {
  updateMenu();
  $("#menu-dialog").showModal();
});
$("#menu-close").addEventListener("click", () => $("#menu-dialog").close());
$("#menu-language").addEventListener("click", () => {
  toggleLang();
  updateMenu();
});
$("#menu-auth").addEventListener("click", () => {
  $("#menu-dialog").close();
  auth.toggle();
});

// Re-render the dashboard/streak whenever a session is recorded or auth changes.
document.addEventListener("trainer:updated", () => {
  updateStreak();
  if (current === "dashboard") renderDashboard(views.dashboard);
});
auth.onChange((isAuthenticated) => {
  updateStreak();
  updateMenu();
  if (current === "dashboard") renderDashboard(views.dashboard);
  if (isAuthenticated) loadAccountPrefs();
});
document.addEventListener("i18n:changed", () => {
  updateChrome();
  if (current) {
    if (teardowns[current]) teardowns[current]();
    renderers[current](views[current]);
  }
});

initI18n();
initTheme();
initPrefs();
if (isOfflineApp()) {
  // The offline app is guest-only: no account, sync or server preferences.
  $("#auth-button").style.display = "none";
  $("#menu-auth").style.display = "none";
}
auth.init().finally(() => {
  updateChrome();
  updateStreak();
  applyStatic();
  show(location.hash.slice(1) || "dashboard");
  if (auth.isAuthenticated()) loadAccountPrefs();
});
