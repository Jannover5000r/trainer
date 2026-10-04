// Account preferences: mirror local settings to the signed-in user's account.

import { api } from "./api.js";
import { store } from "./store.js";
import { auth } from "./auth.js";
import { getLang, setLang } from "./i18n.js";

let timer = null;

export function initPrefs() {
  document.addEventListener("trainer:settings", schedule);
}

// Merges account preferences into local settings after sign-in (account wins).
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
