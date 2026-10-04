// Minimal i18n: a flat key -> string table for German and English. The active
// language is persisted in the local settings (and, when signed in, on the
// account) and defaults to the browser language. `applyStatic` translates
// elements carrying data-i18n attributes.

import { store } from "./store.js";

const DICT = {
  de: {
    "app.title": "Trainer — Eignungstest-Vorbereitung",
    "nav.dashboard": "Dashboard",
    "nav.math": "Kopfrechnen",
    "nav.memory": "Merkfähigkeit",
    "nav.reaction": "Reaktion",
    "nav.visual": "Bildgedächtnis",
    "header.signIn": "Anmelden",
    "header.signOut": "Abmelden",
    "header.language": "Sprache wechseln",
    "menu.title": "Einstellungen",
    "menu.language": "Sprache",
    "menu.close": "Schließen",
    "keypad.enter": "OK",

    "auth.loginTitle": "Anmelden",
    "auth.registerTitle": "Registrieren",
    "auth.recoverTitle": "Passwort zurücksetzen",
    "auth.tabLogin": "Login",
    "auth.tabRegister": "Registrieren",
    "auth.username": "Benutzername",
    "auth.password": "Passwort (mind. 8 Zeichen)",
    "auth.newPassword": "Neues Passwort (mind. 8 Zeichen)",
    "auth.recoveryCodeInput": "Wiederherstellungscode",
    "auth.cancel": "Abbrechen",
    "auth.submitLogin": "Anmelden",
    "auth.submitRegister": "Konto erstellen",
    "auth.submitRecover": "Passwort zurücksetzen",
    "auth.recoverLink": "Passwort vergessen?",
    "auth.backToLogin": "Zurück zur Anmeldung",
    "auth.recoveryIntro":
      "Bewahre diesen Wiederherstellungscode gut auf. Er ist der einzige Weg, dein Passwort zurückzusetzen, und wird nur jetzt angezeigt.",
    "auth.recoveryCopy": "Kopieren",
    "auth.recoveryCopied": "Wiederherstellungscode kopiert",
    "auth.recoveryNew": "Dein Wiederherstellungscode:",
    "auth.continue": "Weiter",
    "signedOut": "Abgemeldet",
    "sync.done": "{n} lokale Ergebnisse synchronisiert",
    "sync.failed": "Sync fehlgeschlagen: {msg}",

    "dashboard.title": "Dashboard",
    "dashboard.subtitle": "Dein Fortschritt auf diesem Gerät",
    "dashboard.pending": "· {n} Ergebnis(se) warten auf Sync",
    "dashboard.streak": "Tage in Folge",
    "dashboard.todayTasks": "Aufgaben heute",
    "dashboard.avgReaction": "Ø Reaktionszeit",
    "dashboard.todayAccuracy": "Trefferquote heute",
    "dashboard.chart": "Genauigkeit · letzte 7 Tage",
    "dashboard.recent": "Letzte Einheiten",
    "dashboard.empty": "Noch keine Einheiten. Starte mit Kopfrechnen oder Merkfähigkeit.",
    "kind.math": "Kopfrechnen",
    "kind.memory": "Merkfähigkeit",
    "kind.reaction": "Reaktion",
    "kind.visual": "Bildgedächtnis",

    "math.title": "Kopfrechnen",
    "label.category": "Kategorie",
    "label.difficulty": "Schwierigkeit",
    "label.mode": "Modus",
    "label.tasks": "Aufgaben",
    "math.cat.mental": "Grundrechenarten",
    "math.cat.units": "Einheiten",
    "math.cat.formulas": "Formeln",
    "diff.easy": "Leicht",
    "diff.medium": "Mittel",
    "diff.hard": "Schwer",
    "math.mode.timed": "20 in 2 Min",
    "math.mode.free": "Freies Üben",
    "math.start": "Training starten",
    "math.enterHint": "Enter = bestätigen & nächste Aufgabe. Das Numpad funktioniert ebenfalls.",
    "math.divisionHint":
      "Bei Geteilt-Aufgaben mit Rest gib Quotient und Rest an, z. B. 5r3. Geht die Division auf, genügt der Quotient.",
    "math.hideHint": "Nicht mehr anzeigen",
    "math.loading": "Aufgaben werden geladen…",
    "math.answerIn": "Antwort in {unit}",
    "math.correct": "Richtig!",
    "math.wrong": "Falsch — richtig: {answer}",
    "math.saved": "Gespeichert",
    "math.cancel": "Abbrechen",
    "math.result": "Ergebnis",
    "math.noneAnswered": "Du hast keine Aufgabe beantwortet.",
    "label.correct": "Richtig",
    "label.accuracy": "Trefferquote",
    "label.perTask": "Ø pro Aufgabe",
    "guest.note": "Auf diesem Gerät gespeichert – melde dich an, um zu synchronisieren.",
    "action.newRound": "Neue Runde",
    "action.settings": "Einstellungen",
    "action.back": "Zurück",
    "action.next": "Weiter",
    "action.retry": "Erneut versuchen",

    "memory.title": "Merkfähigkeit",
    "memory.profileCount": "Anzahl Steckbriefe",
    "memory.delay": "Einprägezeit",
    "duration.30": "30 s",
    "duration.60": "1 Min",
    "duration.180": "3 Min",
    "memory.start": "Training starten",
    "memory.hint":
      "Phase 1: einprägen. Ist die Zeit abgelaufen, geht es automatisch zu den Fragen – weiterlernen ist nicht möglich.",
    "memory.loading": "Steckbriefe werden erstellt…",
    "memory.phase1": "Phase 1 · Einprägen",
    "memory.cancel": "Abbrechen",
    "profile.age": "Alter",
    "profile.profession": "Beruf",
    "profile.diagnosis": "Diagnose",
    "profile.medication": "Medikation",
    "profile.blood": "Blutgruppe",
    "profile.symptom": "Symptom",
    "memory.loadingQuestions": "Fragen werden geladen…",
    "memory.question": "Frage {i} / {n}",
    "memory.evaluating": "Auswertung…",
    "memory.memorizeTime": "Einprägezeit",
    "memory.notReady": "Noch nicht bereit. Bitte warte einen Moment.",
    "memory.questionFallback": "Frage",
    "memory.profiles": "Steckbriefe",

    "reaction.title": "Reaktionstest",
    "reaction.intro": "Warte, bis das Feld grün wird, und klicke dann so schnell wie möglich.",
    "reaction.rounds": "Durchgänge",
    "reaction.start": "Test starten",
    "reaction.cancel": "Abbrechen",
    "reaction.wait": "Warten…",
    "reaction.go": "JETZT!",
    "reaction.tooSoon": "Zu früh!",
    "reaction.round": "Durchgang {i} / {n}",
    "reaction.hint": "Klicke erst, wenn das Feld grün ist.",
    "reaction.best": "Schnellste",
    "reaction.average": "Durchschnitt",
    "reaction.tapPad": "Hier klicken",
    "reaction.tooSoonHint": "Du hast zu früh geklickt. Dieser Durchgang wird wiederholt.",
    "reaction.detail": "Ø {avg} · Best {best}",

    "visual.title": "Bildgedächtnis",
    "visual.intro": "Präge dir die farbigen Felder ein.",
    "visual.studyHint": "Jedes Bild wird nur kurz gezeigt – präge es dir innerhalb der Zeit ein.",
    "visual.failHint": "Ein falscher Klick beendet das Bild sofort.",
    "visual.study": "Einprägen",
    "visual.recall": "Wähle die Felder, die farbig waren.",
    "visual.check": "Auswerten",
    "visual.errors": "Fehler",
    "visual.selected": "Ausgewählt",
    "visual.grid": "Raster",
    "visual.studyTime": "Einprägezeit",
    "visual.rounds": "Bilder",
    "visual.progress": "Bild {i} / {n}",
    "visual.summary": "Ergebnis",
    "visual.avgStudy": "Ø Einprägezeit",
    "visual.answerTime": "Ø Antwortzeit",
    "visual.cleared": "Geschafft!",
    "visual.failed": "Falsch!",
    "visual.start": "Training starten",
    "visual.cancel": "Abbrechen",

    "weekday.mon": "Mo",
    "weekday.tue": "Di",
    "weekday.wed": "Mi",
    "weekday.thu": "Do",
    "weekday.fri": "Fr",
    "weekday.sat": "Sa",
    "weekday.sun": "So",
  },
  en: {
    "app.title": "Trainer — Aptitude test prep",
    "nav.dashboard": "Dashboard",
    "nav.math": "Arithmetic",
    "nav.memory": "Memory",
    "nav.reaction": "Reaction",
    "nav.visual": "Visual memory",
    "header.signIn": "Sign in",
    "header.signOut": "Sign out",
    "header.language": "Switch language",
    "menu.title": "Settings",
    "menu.language": "Language",
    "menu.close": "Close",
    "keypad.enter": "OK",

    "auth.loginTitle": "Sign in",
    "auth.registerTitle": "Create account",
    "auth.recoverTitle": "Reset password",
    "auth.tabLogin": "Sign in",
    "auth.tabRegister": "Register",
    "auth.username": "Username",
    "auth.password": "Password (at least 8 characters)",
    "auth.newPassword": "New password (at least 8 characters)",
    "auth.recoveryCodeInput": "Recovery code",
    "auth.cancel": "Cancel",
    "auth.submitLogin": "Sign in",
    "auth.submitRegister": "Create account",
    "auth.submitRecover": "Reset password",
    "auth.recoverLink": "Forgot your password?",
    "auth.backToLogin": "Back to sign in",
    "auth.recoveryIntro":
      "Store this recovery code somewhere safe. It is the only way to reset your password, and it is shown only once.",
    "auth.recoveryCopy": "Copy",
    "auth.recoveryCopied": "Recovery code copied",
    "auth.recoveryNew": "Your recovery code:",
    "auth.continue": "Continue",
    "signedOut": "Signed out",
    "sync.done": "{n} local results synced",
    "sync.failed": "Sync failed: {msg}",

    "dashboard.title": "Dashboard",
    "dashboard.subtitle": "Your progress on this device",
    "dashboard.pending": "· {n} result(s) waiting to sync",
    "dashboard.streak": "Day streak",
    "dashboard.todayTasks": "Tasks today",
    "dashboard.avgReaction": "Avg. reaction time",
    "dashboard.todayAccuracy": "Accuracy today",
    "dashboard.chart": "Accuracy · last 7 days",
    "dashboard.recent": "Recent sessions",
    "dashboard.empty": "No sessions yet. Start with arithmetic or memory.",
    "kind.math": "Arithmetic",
    "kind.memory": "Memory",
    "kind.reaction": "Reaction",
    "kind.visual": "Visual memory",

    "math.title": "Mental arithmetic",
    "label.category": "Category",
    "label.difficulty": "Difficulty",
    "label.mode": "Mode",
    "label.tasks": "Tasks",
    "math.cat.mental": "Arithmetic",
    "math.cat.units": "Units",
    "math.cat.formulas": "Formulas",
    "diff.easy": "Easy",
    "diff.medium": "Medium",
    "diff.hard": "Hard",
    "math.mode.timed": "20 in 2 min",
    "math.mode.free": "Free practice",
    "math.start": "Start training",
    "math.enterHint": "Press Enter to confirm and advance. The numpad works too.",
    "math.divisionHint":
      "For division with a remainder, enter quotient and remainder, e.g. 5r3. If it divides evenly, the quotient alone is enough.",
    "math.hideHint": "Don't show again",
    "math.loading": "Loading tasks…",
    "math.answerIn": "Answer in {unit}",
    "math.correct": "Correct!",
    "math.wrong": "Wrong — correct: {answer}",
    "math.saved": "Saved",
    "math.cancel": "Cancel",
    "math.result": "Result",
    "math.noneAnswered": "You didn't answer any task.",
    "label.correct": "Correct",
    "label.accuracy": "Accuracy",
    "label.perTask": "Avg. per task",
    "guest.note": "Saved on this device. Sign in to sync.",
    "action.newRound": "Play again",
    "action.settings": "Settings",
    "action.back": "Back",
    "action.next": "Next",
    "action.retry": "Try again",

    "memory.title": "Memory",
    "memory.profileCount": "Number of patient profiles",
    "memory.delay": "Study time",
    "duration.30": "30 s",
    "duration.60": "1 min",
    "duration.180": "3 min",
    "memory.start": "Start training",
    "memory.hint":
      "Phase 1: memorize. When the time is up it switches to the questions automatically — you can't keep studying.",
    "memory.loading": "Creating profiles…",
    "memory.phase1": "Phase 1 · Memorize",
    "memory.cancel": "Cancel",
    "profile.age": "Age",
    "profile.profession": "Profession",
    "profile.diagnosis": "Diagnosis",
    "profile.medication": "Medication",
    "profile.blood": "Blood group",
    "profile.symptom": "Symptom",
    "memory.loadingQuestions": "Loading questions…",
    "memory.question": "Question {i} of {n}",
    "memory.evaluating": "Checking…",
    "memory.memorizeTime": "Study time",
    "memory.notReady": "Not ready yet — please wait a moment.",
    "memory.questionFallback": "Question",
    "memory.profiles": "Patient profiles",

    "reaction.title": "Reaction test",
    "reaction.intro": "Wait for the pad to turn green, then click as fast as you can.",
    "reaction.rounds": "Rounds",
    "reaction.start": "Start test",
    "reaction.cancel": "Cancel",
    "reaction.wait": "Wait…",
    "reaction.go": "GO!",
    "reaction.tooSoon": "Too soon!",
    "reaction.round": "Round {i} of {n}",
    "reaction.hint": "Only click once the pad turns green.",
    "reaction.best": "Fastest",
    "reaction.average": "Average",
    "reaction.tapPad": "Click here",
    "reaction.tooSoonHint": "You clicked too early. This round is repeated.",
    "reaction.detail": "avg {avg} · best {best}",

    "visual.title": "Visual memory",
    "visual.intro": "Memorize the colored tiles.",
    "visual.studyHint": "Each image is shown only briefly — memorize it within the time.",
    "visual.failHint": "A wrong click ends the image immediately.",
    "visual.study": "Memorize",
    "visual.recall": "Select the tiles that were colored.",
    "visual.check": "Check",
    "visual.errors": "Mistakes",
    "visual.selected": "Selected",
    "visual.grid": "Grid",
    "visual.studyTime": "Study time",
    "visual.rounds": "Images",
    "visual.progress": "Image {i} of {n}",
    "visual.summary": "Result",
    "visual.avgStudy": "Avg. study time",
    "visual.answerTime": "Avg. response time",
    "visual.cleared": "Cleared!",
    "visual.failed": "Wrong!",
    "visual.start": "Start training",
    "visual.cancel": "Cancel",

    "weekday.mon": "Mon",
    "weekday.tue": "Tue",
    "weekday.wed": "Wed",
    "weekday.thu": "Thu",
    "weekday.fri": "Fri",
    "weekday.sat": "Sat",
    "weekday.sun": "Sun",
  },
};

const SUPPORTED = ["de", "en"];
let lang = "de";

function detect() {
  const nav = (navigator.language || "de").toLowerCase();
  return nav.startsWith("de") ? "de" : "en";
}

export function initI18n() {
  const saved = store.settings().lang;
  lang = SUPPORTED.includes(saved) ? saved : detect();
  document.documentElement.lang = lang;
  applyStatic();
  document.title = t("app.title");
  return lang;
}

export function getLang() {
  return lang;
}

export function setLang(next) {
  if (!SUPPORTED.includes(next) || next === lang) return;
  lang = next;
  store.saveSettings({ lang: next });
  document.documentElement.lang = next;
  applyStatic();
  document.title = t("app.title");
  document.dispatchEvent(new CustomEvent("i18n:changed"));
}

export function toggleLang() {
  setLang(lang === "de" ? "en" : "de");
}

export function t(key, vars) {
  const table = DICT[lang] || DICT.de;
  let value = table[key] ?? DICT.de[key] ?? key;
  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
  }
  return value;
}

export function applyStatic(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
}
