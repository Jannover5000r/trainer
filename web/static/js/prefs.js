// Account preferences. Local settings are always the source of truth for the
// current device; when signed in they are also mirrored to the user's account
// (difficulty choices, language, ...) so they follow the user across devices.

import { api } from "./api.js";
import { store } from "./store.js";
import { auth } from "./auth.js";
import { getLang, setLang } from "./i18n.js";

let timer = null;

export function initPrefs() {
  document.addEventListener("trainer:settings", schedule);
}

// loadAccountPrefs merges the account preferences into the local settings after
// sign-in (account values win) and pushes the merged result back.
export async function loadAccountPrefs() {
  if (!auth.isAuthenticated()) return;

  let serverPrefs = {};
  try {
    serverPrefs = (await api.preferences()) || {};
  } catch {
    return;
  }

  const merged = { ...store.settings(), ...serverPrefs };
  store.saveSettings(merged);
  if (merged.lang && merged.lang !== getLang()) {
    setLang(merged.lang);
  }
  flush(merged);
}

function schedule() {
  if (!auth.isAuthenticated()) return;
  clearTimeout(timer);
  timer = setTimeout(() => flush(store.settings()), 800);
}

function flush(prefs) {
  if (!auth.isAuthenticated()) return;
  api.putPreferences(prefs).catch(() => {});
}
