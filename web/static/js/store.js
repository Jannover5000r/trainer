// Local-first persistence. Guest results accumulate in a backlog that is
// uploaded once via POST /api/sync after login. A separate history log powers
// the dashboard regardless of auth state, so it is never cleared automatically.

const KEY_BACKLOG = "trainer.backlog.v1";
const KEY_HISTORY = "trainer.history.v1";
const KEY_SETTINGS = "trainer.settings.v1";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / private mode: degrade to in-memory behaviour */
  }
}

export const store = {
  // --- pending guest results (exact shape of POST /api/sync) ---
  backlog() {
    const b = read(KEY_BACKLOG, {});
    return { math: b.math || [], memory: b.memory || [], reaction: b.reaction || [] };
  },
  addMathStat(stat) {
    const b = this.backlog();
    b.math.push(stat);
    write(KEY_BACKLOG, b);
  },
  addMemoryStat(stat) {
    const b = this.backlog();
    b.memory.push(stat);
    write(KEY_BACKLOG, b);
  },
  addReactionStat(stat) {
    const b = this.backlog();
    b.reaction.push(stat);
    write(KEY_BACKLOG, b);
  },
  hasBacklog() {
    const b = this.backlog();
    return b.math.length > 0 || b.memory.length > 0 || b.reaction.length > 0;
  },
  clearBacklog() {
    write(KEY_BACKLOG, { math: [], memory: [], reaction: [] });
  },

  // --- local history for the dashboard: one entry per finished session ---
  history() {
    return read(KEY_HISTORY, []);
  },
  addHistory(entry) {
    const h = this.history();
    h.push({ ts: Date.now(), ...entry });
    // Keep the log bounded on constrained devices.
    if (h.length > 500) h.splice(0, h.length - 500);
    write(KEY_HISTORY, h);
  },

  settings() {
    return read(KEY_SETTINGS, {});
  },
  saveSettings(patch) {
    write(KEY_SETTINGS, { ...this.settings(), ...patch });
    // Let listeners (e.g. the account-preferences sync) react to changes.
    document.dispatchEvent(new CustomEvent("trainer:settings"));
  },
};
