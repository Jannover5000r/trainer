// Visual / photographic memory. A short sequence of grids is shown; each grid
// has some colored tiles, is displayed for a few seconds, then the colors are
// hidden and the user selects the tiles they remember. A wrong pick ends the
// image immediately. Grid size grows with difficulty; the number of images and
// the study time are configurable.

import { api } from "./api.js";
import { auth } from "./auth.js";
import { store } from "./store.js";
import { $, esc, fmtDuration, onTap } from "./ui.js";
import { t } from "./i18n.js";
import { renderSymbols, teardownSymbols } from "./symbols.js";

// `base` is the average number of colored tiles; the actual count jitters
// around it so it is not a fixed number.
const LEVELS = {
  easy: { size: 4, base: 3 },
  medium: { size: 6, base: 6 },
  hard: { size: 8, base: 10 },
};
const DIFFICULTIES = ["easy", "medium", "hard"];
const ROUND_OPTIONS = [10, 20, 30];
const STUDY_MIN = 0.1;
const STUDY_MAX = 5;
const STUDY_STEP = 0.1;

let state = null;
let token = 0;

function isCurrent(myToken) {
  return Boolean(state && state.token === myToken);
}

export function teardownVisual() {
  token++;
  if (state?.timer) clearInterval(state.timer);
  if (state?.timeout) clearTimeout(state.timeout);
  state = null;
  teardownSymbols();
}

export function renderVisual(container) {
  teardownVisual();
  const mode = store.settings().visualMode === "symbols" ? "symbols" : "sequence";

  container.innerHTML = `
    <h1>${esc(t("visual.title"))}</h1>
    <div class="card">
      <div class="field"><span>${esc(t("visual.mode"))}</span>
        <div class="segmented" id="visual-mode">
          <button type="button" data-mode="sequence" class="${mode === "sequence" ? "active" : ""}">${esc(t("visual.mode.sequence"))}</button>
          <button type="button" data-mode="symbols" class="${mode === "symbols" ? "active" : ""}">${esc(t("visual.mode.symbols"))}</button>
        </div>
      </div>
    </div>
    <div id="visual-body"></div>
  `;
  container.querySelectorAll("#visual-mode button").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.mode === mode) return;
      store.saveSettings({ visualMode: b.dataset.mode });
      renderVisual(container);
    }),
  );

  if (mode === "symbols") renderSymbols(container.querySelector("#visual-body"));
  else renderSequence(container);
}

function renderSequence(container) {
  const s = store.settings();
  const difficulty = s.visualDifficulty || "easy";
  const rounds = ROUND_OPTIONS.includes(s.visualRounds) ? s.visualRounds : 10;
  const study = clampStudy(s.visualStudySec || 2);

  container.querySelector("#visual-body").innerHTML = `
    <div class="card" id="visual-config">
      <p class="muted small">${esc(t("visual.intro"))}</p>
      <p class="muted small">${esc(t("visual.studyHint"))} ${esc(t("visual.failHint"))}</p>
      <div class="controls">
        <div class="field"><span>${esc(t("label.difficulty"))}</span>
          <div class="segmented" id="visual-difficulty">
            ${DIFFICULTIES.map((d) => `<button type="button" data-diff="${d}" class="${d === difficulty ? "active" : ""}">${esc(t("diff." + d))}</button>`).join("")}
          </div>
        </div>
        <div class="field"><span>${esc(t("visual.rounds"))}</span>
          <div class="segmented" id="visual-rounds">
            ${ROUND_OPTIONS.map((n) => `<button type="button" data-rounds="${n}" class="${n === rounds ? "active" : ""}">${n}</button>`).join("")}
          </div>
        </div>
      </div>
      <label class="field"><span>${esc(t("visual.studyTime"))}: <b id="visual-study-value">${study.toFixed(1)} s</b></span>
        <input type="range" id="visual-study" min="${STUDY_MIN}" max="${STUDY_MAX}" step="${STUDY_STEP}" value="${study}" />
      </label>
      <div class="control-actions"><button class="btn btn-primary" id="visual-start">${esc(t("visual.start"))}</button></div>
    </div>
    <div id="visual-session"></div>
  `;

  container.querySelectorAll("#visual-difficulty button").forEach((b) =>
    b.addEventListener("click", () => {
      container.querySelectorAll("#visual-difficulty button").forEach((x) => x.classList.toggle("active", x === b));
    }),
  );
  container.querySelectorAll("#visual-rounds button").forEach((b) =>
    b.addEventListener("click", () => {
      container.querySelectorAll("#visual-rounds button").forEach((x) => x.classList.toggle("active", x === b));
    }),
  );

  const slider = $("#visual-study");
  const valueOut = $("#visual-study-value");
  slider.addEventListener("input", () => {
    valueOut.textContent = `${Number(slider.value).toFixed(1)} s`;
  });
  slider.addEventListener("change", () => {
    store.saveSettings({ visualStudySec: clampStudy(Number(slider.value)) });
  });

  $("#visual-start").addEventListener("click", () => {
    const cfg = {
      difficulty: container.querySelector("#visual-difficulty .active").dataset.diff,
      rounds: Number(container.querySelector("#visual-rounds .active").dataset.rounds),
      studySec: clampStudy(Number(slider.value)),
    };
    store.saveSettings({ visualDifficulty: cfg.difficulty, visualRounds: cfg.rounds, visualStudySec: cfg.studySec });
    startSession(container, cfg);
  });
}

function clampStudy(value) {
  if (!Number.isFinite(value)) return 2;
  return Math.min(STUDY_MAX, Math.max(STUDY_MIN, Math.round(value * 10) / 10));
}

// coloredCount returns a jittered tile count around the level's average so the
// number of colored tiles varies from image to image.
function coloredCount(level) {
  const total = level.size * level.size;
  const factor = 0.75 + Math.random() * 0.5; // ±25 %
  const count = Math.round(level.base * factor);
  return Math.max(2, Math.min(total - 1, count));
}

function startSession(container, cfg) {
  const myToken = ++token;
  if (state?.timer) clearInterval(state.timer);
  if (state?.timeout) clearTimeout(state.timeout);
  container.querySelector("#visual-config")?.classList.add("hidden");

  state = {
    token: myToken,
    cfg,
    level: LEVELS[cfg.difficulty] || LEVELS.easy,
    round: 0,
    totals: { correct: 0, errors: 0, colored: 0 },
    times: [],
    colored: new Set(),
    selected: new Set(),
    failedCell: -1,
    roundDone: false,
    recallStart: 0,
    phase: "study",
    timer: null,
    timeout: null,
  };
  window.scrollTo({ top: 0, behavior: "smooth" });
  startRound(container);
}

function startRound(container) {
  if (!isCurrent(state.token)) return;
  if (state.round >= state.cfg.rounds) {
    finish(container, state.token);
    return;
  }

  const { level } = state;
  const total = level.size * level.size;
  const colored = new Set();
  const wanted = coloredCount(level);
  while (colored.size < Math.min(wanted, total)) {
    colored.add(Math.floor(Math.random() * total));
  }
  state.colored = colored;
  state.selected = new Set();
  state.failedCell = -1;
  state.roundDone = false;
  state.phase = "study";

  renderBoard(container);
  startCountdown(container, state.token);
}

function renderBoard(container) {
  const { level, colored, phase, round, cfg } = state;
  const cells = [];
  for (let i = 0; i < level.size * level.size; i++) {
    const on = phase === "study" && colored.has(i);
    cells.push(`<div class="grid-cell ${on ? "on" : ""}" data-i="${i}"></div>`);
  }

  // The countdown sits below the board so the tiles never shift when it changes.
  container.querySelector("#visual-session").innerHTML = `
    <div class="card">
      <div class="session-head">
        <span class="pill">${esc(t("visual.progress", { i: round + 1, n: cfg.rounds }))}</span>
        <span class="pill">${level.size}×${level.size}</span>
        <button class="btn btn-ghost" id="visual-cancel">${esc(t("visual.cancel"))}</button>
      </div>
      <div class="grid-board" style="grid-template-columns: repeat(${level.size}, 1fr)">${cells.join("")}</div>
      <div class="countdown" id="visual-countdown"></div>
      <div class="feedback" id="visual-feedback"></div>
    </div>
  `;
  $("#visual-cancel").addEventListener("click", () => cancelSession(container));
  if (phase === "recall") bindRecall(container);
}

function startCountdown(container, myToken) {
  const end = Date.now() + state.cfg.studySec * 1000;
  const tick = () => {
    if (!isCurrent(myToken) || state.phase !== "study") return;
    const remaining = end - Date.now();
    if (remaining <= 0) {
      switchToRecall(container);
      return;
    }
    const el = $("#visual-countdown");
    if (el) el.textContent = `${(remaining / 1000).toFixed(1)} s`;
  };
  tick();
  if (state.phase === "study") state.timer = setInterval(tick, 100);
}

function switchToRecall(container) {
  if (!isCurrent(state.token) || state.phase !== "study") return;
  state.phase = "recall";
  state.recallStart = performance.now();
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }

  renderBoard(container);
  const countdown = $("#visual-countdown");
  if (countdown) countdown.textContent = "";
  $("#visual-feedback").textContent = t("visual.recall");
}

function bindRecall(container) {
  container.querySelectorAll(".grid-cell").forEach((cell) => {
    cell.classList.add("clickable");
    onTap(cell, () => pickCell(container, Number(cell.dataset.i)));
  });
}

// pickCell ends the image as soon as a non-colored tile is picked; otherwise it
// completes once every colored tile has been found.
function pickCell(container, index) {
  if (!state || state.phase !== "recall" || state.roundDone) return;
  const cell = container.querySelector(`.grid-cell[data-i="${index}"]`);

  if (!state.colored.has(index)) {
    state.failedCell = index;
    state.roundDone = true;
    if (cell) cell.classList.add("wrong");
    completeRound(container, false);
    return;
  }

  if (state.selected.has(index)) return;
  state.selected.add(index);
  if (cell) cell.classList.add("selected");

  if (state.selected.size >= state.colored.size) {
    state.roundDone = true;
    completeRound(container, true);
  }
}

function completeRound(container, success) {
  if (!isCurrent(state.token) || state.phase !== "recall") return;
  state.phase = "reveal";

  const elapsed = Math.round(performance.now() - state.recallStart);
  state.times.push(elapsed);

  container.querySelectorAll(".grid-cell").forEach((cell) => {
    const index = Number(cell.dataset.i);
    const wasColored = state.colored.has(index);
    const wasSelected = state.selected.has(index);
    cell.classList.remove("selected", "clickable");
    if (wasColored) {
      if (wasSelected) cell.classList.add("correct");
      else cell.classList.add("missed");
    } else if (wasSelected || index === state.failedCell) {
      cell.classList.add("wrong");
    }
  });

  // A wrong pick makes the whole image count as wrong.
  const roundCorrect = success ? state.colored.size : 0;
  state.totals.correct += roundCorrect;
  state.totals.colored += state.colored.size;
  state.totals.errors += state.colored.size - roundCorrect;

  const feedback = $("#visual-feedback");
  if (feedback) {
    const label = success ? t("visual.cleared") : t("visual.failed");
    feedback.innerHTML = `<b>${esc(label)}</b> · ${esc(t("label.correct"))}: ${roundCorrect}/${state.colored.size} · ${fmtDuration(elapsed)}`;
  }

  state.timeout = setTimeout(() => {
    if (!isCurrent(state.token)) return;
    state.round++;
    startRound(container);
  }, 900);
}

async function finish(container, myToken) {
  if (!isCurrent(myToken)) return;
  state.phase = "done";

  const { totals, cfg, times } = state;
  const memorizeMs = Math.round(cfg.studySec * 1000 * cfg.rounds);
  const avgResponseMs = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;

  const stat = { profile_type: "visual", errors: totals.errors, memorize_ms: memorizeMs };
  if (auth.isAuthenticated()) {
    try {
      await api.logMemory(stat);
    } catch {
      /* the local history below still records the session */
    }
  } else {
    store.addMemoryStat(stat);
  }
  if (!isCurrent(myToken)) return;

  store.addHistory({
    kind: "memory",
    profileType: "visual",
    total: totals.colored,
    correct: totals.correct,
    durationMs: avgResponseMs,
  });
  document.dispatchEvent(new CustomEvent("trainer:updated"));

  container.querySelector("#visual-session").innerHTML = `
    <div class="card">
      <h2>${esc(t("visual.summary"))}</h2>
      <div class="stat-grid">
        <div class="stat"><div class="value">${totals.correct}/${totals.colored}</div><div class="label">${esc(t("label.correct"))}</div></div>
        <div class="stat"><div class="value">${totals.errors}</div><div class="label">${esc(t("visual.errors"))}</div></div>
        <div class="stat"><div class="value">${fmtDuration(avgResponseMs)}</div><div class="label">${esc(t("visual.answerTime"))}</div></div>
        <div class="stat"><div class="value">${cfg.studySec.toFixed(1)} s</div><div class="label">${esc(t("visual.avgStudy"))}</div></div>
      </div>
      ${!auth.isAuthenticated() ? `<p class="muted small">${esc(t("guest.note"))}</p>` : ""}
      <div class="control-actions">
        <button class="btn btn-primary" id="visual-again">${esc(t("action.newRound"))}</button>
        <button class="btn btn-ghost" id="visual-settings">${esc(t("action.settings"))}</button>
      </div>
    </div>
  `;
  $("#visual-again").addEventListener("click", () => startSession(container, cfg));
  $("#visual-settings").addEventListener("click", () => renderVisual(container));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelSession(container) {
  teardownVisual();
  renderVisual(container);
}
