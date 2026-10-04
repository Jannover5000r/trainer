// Reaction time test. Wait for the pad to turn green, then click as fast as
// possible. Runs several rounds and reports the average and fastest time.

import { api } from "./api.js";
import { auth } from "./auth.js";
import { store } from "./store.js";
import { $, esc, fmtDuration } from "./ui.js";
import { t } from "./i18n.js";

const ROUND_OPTIONS = [3, 5, 10];
const MIN_DELAY = 1200;
const MAX_DELAY = 3500;

let state = null;
let token = 0;

function isCurrent(myToken) {
  return Boolean(state && state.token === myToken);
}

export function teardownReaction() {
  token++;
  if (state?.timeout) clearTimeout(state.timeout);
  state = null;
}

export function renderReaction(container) {
  teardownReaction();
  const rounds = store.settings().reactionRounds || 5;

  container.innerHTML = `
    <h1>${esc(t("reaction.title"))}</h1>
    <div class="card" id="reaction-config">
      <p class="muted small">${esc(t("reaction.intro"))}</p>
      <div class="controls">
        <div class="field"><span>${esc(t("reaction.rounds"))}</span>
          <div class="segmented" id="reaction-rounds">
            ${ROUND_OPTIONS.map((n) => `<button data-rounds="${n}" class="${n === rounds ? "active" : ""}">${n}</button>`).join("")}
          </div>
        </div>
      </div>
      <div class="control-actions"><button class="btn btn-primary" id="reaction-start">${esc(t("reaction.start"))}</button></div>
      <p class="muted small" style="margin-top:.8rem">${esc(t("reaction.hint"))}</p>
    </div>
    <div id="reaction-session"></div>
  `;

  container.querySelectorAll("#reaction-rounds button").forEach((b) =>
    b.addEventListener("click", () => {
      container.querySelectorAll("#reaction-rounds button").forEach((x) => x.classList.toggle("active", x === b));
    }),
  );

  $("#reaction-start").addEventListener("click", () => {
    const n = Number(container.querySelector("#reaction-rounds .active").dataset.rounds);
    store.saveSettings({ reactionRounds: n });
    startSession(container, n);
  });
}

function startSession(container, rounds) {
  const myToken = ++token;
  container.querySelector("#reaction-config")?.classList.add("hidden");
  container.querySelector("#reaction-session").innerHTML = `
    <div class="card">
      <div class="session-head">
        <span class="pill" id="reaction-progress"></span>
        <button class="btn btn-ghost" id="reaction-cancel">${esc(t("reaction.cancel"))}</button>
      </div>
      <div class="reaction-pad" id="reaction-pad">${esc(t("reaction.tapPad"))}</div>
      <div class="feedback" id="reaction-feedback"></div>
    </div>
  `;

  state = { token: myToken, rounds, completed: 0, results: [], awaiting: false, pending: false, signalAt: 0, timeout: null };

  $("#reaction-pad").addEventListener("click", () => onPadClick(container));
  $("#reaction-cancel").addEventListener("click", () => cancelSession(container));

  updateProgress();
  window.scrollTo({ top: 0, behavior: "smooth" });
  startRound(container);
}

function updateProgress() {
  if (!state) return;
  $("#reaction-progress").textContent = t("reaction.round", {
    i: Math.min(state.completed + 1, state.rounds),
    n: state.rounds,
  });
}

function startRound(container) {
  if (!state) return;
  const pad = $("#reaction-pad");
  state.awaiting = false;
  state.pending = true;
  pad.className = "reaction-pad";
  pad.textContent = t("reaction.wait");

  const delay = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
  state.timeout = setTimeout(() => {
    if (!isCurrent(state?.token)) return;
    state.awaiting = true;
    pad.className = "reaction-pad go";
    pad.textContent = t("reaction.go");
    state.signalAt = performance.now();
  }, delay);
}

function onPadClick(container) {
  if (!state) return;
  const myToken = state.token;
  const pad = $("#reaction-pad");
  const feedback = $("#reaction-feedback");

  if (state.awaiting) {
    const rt = Math.round(performance.now() - state.signalAt);
    state.results.push(rt);
    state.completed++;
    state.awaiting = false;
    state.pending = false;
    pad.className = "reaction-pad done";
    pad.textContent = `${rt} ms`;
    feedback.textContent = "";

    if (state.completed >= state.rounds) {
      finish(container, myToken);
      return;
    }
    updateProgress();
    state.timeout = setTimeout(() => {
      if (isCurrent(myToken)) startRound(container);
    }, 700);
    return;
  }

  // Clicked before the signal: repeat this round.
  if (state.pending) {
    if (state.timeout) clearTimeout(state.timeout);
    state.pending = false;
    pad.className = "reaction-pad soon";
    pad.textContent = t("reaction.tooSoon");
    feedback.textContent = t("reaction.tooSoonHint");
    state.timeout = setTimeout(() => {
      if (!isCurrent(myToken)) return;
      feedback.textContent = "";
      startRound(container);
    }, 900);
  }
}

async function finish(container, myToken) {
  if (!isCurrent(myToken)) return;
  if (state.timeout) clearTimeout(state.timeout);
  state.pending = false;

  const results = state.results;
  const rounds = state.rounds;
  const best = Math.min(...results);
  const avg = Math.round(results.reduce((a, b) => a + b, 0) / results.length);

  const entry = { avg_ms: avg, best_ms: best, trials: results.length };
  if (auth.isAuthenticated()) {
    try {
      await api.logReaction(entry);
    } catch {
      /* the local history below still records the session */
    }
  } else {
    store.addReactionStat(entry);
  }
  if (!isCurrent(myToken)) return;

  store.addHistory({ kind: "reaction", avgMs: avg, bestMs: best, trials: results.length });
  document.dispatchEvent(new CustomEvent("trainer:updated"));

  container.querySelector("#reaction-session").innerHTML = `
    <div class="card">
      <h2>${esc(t("math.result"))}</h2>
      <div class="stat-grid">
        <div class="stat"><div class="value">${fmtDuration(avg)}</div><div class="label">${esc(t("reaction.average"))}</div></div>
        <div class="stat"><div class="value">${fmtDuration(best)}</div><div class="label">${esc(t("reaction.best"))}</div></div>
        <div class="stat"><div class="value">${results.length}</div><div class="label">${esc(t("reaction.rounds"))}</div></div>
      </div>
      ${!auth.isAuthenticated() ? `<p class="muted small">${esc(t("guest.note"))}</p>` : ""}
      <div class="control-actions">
        <button class="btn btn-primary" id="reaction-again">${esc(t("action.newRound"))}</button>
        <button class="btn btn-ghost" id="reaction-settings">${esc(t("action.settings"))}</button>
      </div>
    </div>
  `;
  $("#reaction-again").addEventListener("click", () => startSession(container, rounds));
  $("#reaction-settings").addEventListener("click", () => renderReaction(container));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelSession(container) {
  teardownReaction();
  renderReaction(container);
}
