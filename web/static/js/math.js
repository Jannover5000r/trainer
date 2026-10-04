// Kopfrechnen / Quantitativer Drill. Speed-focused: big type, auto-focus,
// Enter to submit, instant per-task feedback (checked server-side against the
// encrypted token) and an optional countdown.

import { api } from "./api.js";
import { auth } from "./auth.js";
import { store } from "./store.js";
import { $, esc, fmtPct, fmtDuration, fmtClock } from "./ui.js";
import { t } from "./i18n.js";

const CATEGORIES = [
  { key: "mental", label: "math.cat.mental" },
  { key: "units", label: "math.cat.units" },
  { key: "formulas", label: "math.cat.formulas" },
];
const DIFFICULTIES = [
  { key: "easy", label: "diff.easy" },
  { key: "medium", label: "diff.medium" },
  { key: "hard", label: "diff.hard" },
];
const FREE_COUNTS = [10, 20, 30];

let state = null;
let sessionToken = 0;

function isCurrent(token) {
  return Boolean(state && state.token === token);
}

export function teardownMath() {
  sessionToken++;
  if (state?.timer) clearInterval(state.timer);
  state = null;
}

export function renderMath(container) {
  // Rendering the config means no session is active: invalidate any running one.
  sessionToken++;
  if (state?.timer) clearInterval(state.timer);
  state = null;

  const s = store.settings();
  const category = s.mathCategory || "mental";
  const difficulty = s.mathDifficulty || "medium";
  const mode = s.mathMode || "timed";
  const freeCount = s.mathFreeCount || 10;
  const hideHint = Boolean(s.hideDivisionHint);

  container.innerHTML = `
    <h1>${esc(t("math.title"))}</h1>
    <div class="card" id="math-config">
      <div class="controls">
        <label class="field"><span>${esc(t("label.category"))}</span>
          <select id="math-category">${CATEGORIES.map((c) => `<option value="${c.key}" ${c.key === category ? "selected" : ""}>${esc(t(c.label))}</option>`).join("")}</select>
        </label>
        <label class="field"><span>${esc(t("label.difficulty"))}</span>
          <select id="math-difficulty">${DIFFICULTIES.map((d) => `<option value="${d.key}" ${d.key === difficulty ? "selected" : ""}>${esc(t(d.label))}</option>`).join("")}</select>
        </label>
        <div class="field"><span>${esc(t("label.mode"))}</span>
          <div class="segmented" id="math-mode">
            <button data-mode="timed" class="${mode === "timed" ? "active" : ""}">${esc(t("math.mode.timed"))}</button>
            <button data-mode="free" class="${mode === "free" ? "active" : ""}">${esc(t("math.mode.free"))}</button>
          </div>
        </div>
        <div class="field ${mode === "free" ? "" : "hidden"}" id="math-free-wrap"><span>${esc(t("label.tasks"))}</span>
          <div class="segmented" id="math-free-count">
            ${FREE_COUNTS.map((n) => `<button data-count="${n}" class="${n === freeCount ? "active" : ""}">${n}</button>`).join("")}
          </div>
        </div>
      </div>
      ${
        hideHint
          ? ""
          : `<div class="hint" id="math-hint">
               <p>${esc(t("math.divisionHint"))}</p>
               <button type="button" id="math-hint-dismiss">${esc(t("math.hideHint"))}</button>
             </div>`
      }
      <div class="control-actions">
        <button class="btn btn-primary" id="math-start">${esc(t("math.start"))}</button>
      </div>
      <p class="muted small" style="margin-top:.8rem">${esc(t("math.enterHint"))}</p>
    </div>
    <div id="math-session"></div>
  `;

  const hintVisibleFor = (cat) => cat === "mental" && !hideHint;
  const syncHint = () => {
    const hint = $("#math-hint");
    if (hint) hint.classList.toggle("hidden", !hintVisibleFor($("#math-category").value));
  };
  syncHint();

  const modeButtons = container.querySelectorAll("#math-mode button");
  modeButtons.forEach((b) =>
    b.addEventListener("click", () => {
      modeButtons.forEach((x) => x.classList.toggle("active", x === b));
      container.querySelector("#math-free-wrap").classList.toggle("hidden", b.dataset.mode !== "free");
    }),
  );
  container.querySelectorAll("#math-free-count button").forEach((b) =>
    b.addEventListener("click", () => {
      container.querySelectorAll("#math-free-count button").forEach((x) => x.classList.toggle("active", x === b));
    }),
  );
  $("#math-category").addEventListener("change", syncHint);

  const dismiss = $("#math-hint-dismiss");
  if (dismiss) {
    dismiss.addEventListener("click", () => {
      store.saveSettings({ hideDivisionHint: true });
      $("#math-hint").remove();
    });
  }

  $("#math-start").addEventListener("click", () => {
    const activeMode = container.querySelector("#math-mode .active").dataset.mode;
    const activeCount = Number(container.querySelector("#math-free-count .active")?.dataset.count || 10);
    const cfg = {
      category: $("#math-category").value,
      difficulty: $("#math-difficulty").value,
      mode: activeMode,
      count: activeMode === "timed" ? 20 : activeCount,
      seconds: activeMode === "timed" ? 120 : 0,
    };
    store.saveSettings({
      mathCategory: cfg.category,
      mathDifficulty: cfg.difficulty,
      mathMode: cfg.mode,
      mathFreeCount: activeCount,
    });
    startSession(container, cfg);
  });
}

async function startSession(container, cfg) {
  const myToken = ++sessionToken;
  if (state?.timer) clearInterval(state.timer);
  state = null;
  container.querySelector("#math-config")?.classList.add("hidden");

  const root = container.querySelector("#math-session");
  root.innerHTML = `<div class="card"><p class="muted">${esc(t("math.loading"))}</p></div>`;

  let data;
  try {
    data = await api.mathTasks(cfg.category, cfg.difficulty, cfg.count);
  } catch (err) {
    if (myToken !== sessionToken) return;
    root.innerHTML = `<div class="card"><p class="form-error">${esc(err.message)}</p>
      <div class="control-actions"><button class="btn" id="math-back">${esc(t("action.back"))}</button></div></div>`;
    $("#math-back").addEventListener("click", () => renderMath(container));
    return;
  }
  if (myToken !== sessionToken) return;

  state = {
    cfg,
    token: myToken,
    tasks: data.tasks,
    i: 0,
    shownAt: performance.now(),
    answers: [],
    results: [],
    deadline: cfg.seconds ? Date.now() + cfg.seconds * 1000 : null,
    timer: null,
    locked: false,
    finished: false,
  };

  root.innerHTML = `
    <div class="card" id="math-card">
      <div class="session-head">
        <span class="pill" id="math-progress"></span>
        <span class="pill pill-cat">${esc(t(`math.cat.${cfg.category}`))}</span>
        <span class="pill time" id="math-clock">${cfg.seconds ? fmtClock(cfg.seconds) : "∞"}</span>
        <button class="btn btn-ghost" id="math-cancel">${esc(t("math.cancel"))}</button>
      </div>
      <div class="timer-track"><div class="timer-fill" id="math-timer"></div></div>
      <div class="prompt" id="math-prompt"></div>
      <div class="prompt-sub" id="math-unit"></div>
      <input id="math-input" class="answer-input" type="text" inputmode="none" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" />
      <div class="feedback" id="math-feedback"></div>
      <div class="keypad" id="math-keypad"></div>
    </div>
  `;

  $("#math-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitAnswer(container);
    }
  });
  $("#math-cancel").addEventListener("click", () => cancelSession(container));
  buildKeypad(container, cfg.category);

  showTask(container);
  if (cfg.seconds) startTimer(container);
}

function cancelSession(container) {
  sessionToken++;
  if (state?.timer) clearInterval(state.timer);
  if (state) state.finished = true;
  state = null;
  renderMath(container);
}

// buildKeypad renders big on-screen keys so the answer can be entered without
// the phone keyboard. Only the keys that category needs are shown: mental
// arithmetic can have a remainder ("r"), units/formulas need a decimal comma.
function buildKeypad(container, category) {
  const pad = container.querySelector("#math-keypad");
  if (!pad) return;

  const decimal = category === "mental" ? "r" : ",";
  let html = "";
  for (const row of [["7", "8", "9"], ["4", "5", "6"], ["1", "2", "3"]]) {
    for (const key of row) html += `<button type="button" class="key" data-key="${key}">${key}</button>`;
  }
  html += `<button type="button" class="key" data-key="${decimal}">${decimal}</button>`;
  html += `<button type="button" class="key" data-key="0">0</button>`;
  html += `<button type="button" class="key key-back" data-back="1" aria-label="backspace">⌫</button>`;
  html += `<button type="button" class="key key-enter" id="math-key-enter">${esc(t("keypad.enter"))}</button>`;
  pad.innerHTML = html;

  const input = () => $("#math-input");
  const editable = () => state && !state.locked && !state.finished;

  pad.querySelectorAll(".key[data-key]").forEach((b) =>
    b.addEventListener("click", () => {
      if (editable()) input().value += b.dataset.key;
    }),
  );
  pad.querySelector("[data-back]")?.addEventListener("click", () => {
    if (editable()) input().value = input().value.slice(0, -1);
  });
  $("#math-key-enter")?.addEventListener("click", () => submitAnswer(container));
}

function showTask(container) {
  const task = state.tasks[state.i];
  $("#math-progress").textContent = `${state.i + 1} / ${state.tasks.length}`;
  $("#math-prompt").textContent = task.prompt;
  $("#math-unit").textContent = task.answer_unit ? t("math.answerIn", { unit: task.answer_unit }) : "";
  const input = $("#math-input");
  input.value = "";
  input.disabled = false;
  state.shownAt = performance.now();
  input.focus();
}

function startTimer(container) {
  const token = state.token;
  const total = state.cfg.seconds * 1000;
  const tick = () => {
    if (!isCurrent(token) || state.finished) return;
    const remaining = state.deadline - Date.now();
    const clock = $("#math-clock");
    const fill = $("#math-timer");
    if (remaining <= 0) {
      clock.textContent = "00:00";
      fill.style.width = "0%";
      finish(container, token);
      return;
    }
    clock.textContent = fmtClock(remaining / 1000);
    fill.style.width = `${Math.max(0, (remaining / total) * 100)}%`;
    const danger = remaining < 15000;
    clock.classList.toggle("danger", danger);
    fill.classList.toggle("danger", danger);
  };
  tick();
  if (isCurrent(token)) state.timer = setInterval(tick, 100);
}

async function submitAnswer(container) {
  if (!state || state.locked || state.finished || state.i >= state.tasks.length) return;
  const token = state.token;
  const input = $("#math-input");
  const answer = input.value.trim();
  if (answer === "") return;

  state.locked = true;
  const task = state.tasks[state.i];
  const duration = Math.round(performance.now() - state.shownAt);

  let correct = false;
  let expected = "";
  try {
    const res = await api.mathVerify([{ token: task.token, answer, duration_ms: duration }], false);
    if (!isCurrent(token)) return;
    correct = res.results[0].correct;
    expected = res.results[0].expected;
  } catch {
    /* Offline: keep the answer, correctness stays unknown. */
  }
  if (!isCurrent(token)) return;

  state.answers.push({ token: task.token, answer, duration_ms: duration });
  state.results.push({ prompt: task.prompt, given: answer, expected, correct, durationMs: duration });

  const feedback = $("#math-feedback");
  const card = $("#math-card");
  feedback.textContent = correct ? t("math.correct") : expected ? t("math.wrong", { answer: expected }) : t("math.saved");
  feedback.className = `feedback ${correct ? "correct" : "wrong"}`;
  card.classList.add(correct ? "card-correct" : "card-wrong");
  input.disabled = true;

  setTimeout(() => {
    if (!isCurrent(token)) return;
    card.classList.remove("card-correct", "card-wrong");
    feedback.textContent = "";
    feedback.className = "feedback";
    state.locked = false;
    state.i++;
    if (state.i >= state.tasks.length) finish(container, token);
    else showTask(container);
  }, correct ? 260 : 700);
}

async function finish(container, token) {
  if (!isCurrent(token) || state.finished) return;
  state.finished = true;
  if (state.timer) clearInterval(state.timer);

  const results = state.results;
  const total = results.length;
  const correct = results.filter((r) => r.correct).length;
  const durationMs = results.reduce((n, r) => n + r.durationMs, 0);

  // Record once on the server when signed in (the per-task calls used log:false).
  if (total > 0 && auth.isAuthenticated()) {
    try {
      await api.mathVerify(state.answers, true);
    } catch {
      /* history below still captures the session locally */
    }
  }
  if (!isCurrent(token)) return;

  if (total === 0) {
    container.querySelector("#math-session").innerHTML = `<div class="card"><p class="muted">${esc(t("math.noneAnswered"))}</p>
      <div class="control-actions"><button class="btn" id="math-back">${esc(t("action.back"))}</button></div></div>`;
    $("#math-back").addEventListener("click", () => renderMath(container));
    return;
  }

  const accuracy = correct / total;
  const backlogEntry = {
    category: state.cfg.category,
    duration_ms: durationMs,
    accuracy,
    error_rate: 1 - accuracy,
  };
  if (!auth.isAuthenticated()) store.addMathStat(backlogEntry);
  store.addHistory({ kind: "math", category: state.cfg.category, total, correct, durationMs });
  document.dispatchEvent(new CustomEvent("trainer:updated"));

  const rows = results
    .map(
      (r) => `<div class="result-row ${r.correct ? "ok" : "no"}">
        <span>${esc(r.prompt)}</span>
        <span class="mark">${r.correct ? "✓" : `✗ (${esc(r.expected || r.given)})`}</span>
      </div>`,
    )
    .join("");

  container.querySelector("#math-session").innerHTML = `
    <div class="card">
      <h2>${esc(t("math.result"))}</h2>
      <div class="stat-grid">
        <div class="stat"><div class="value">${correct}/${total}</div><div class="label">${esc(t("label.correct"))}</div></div>
        <div class="stat"><div class="value">${fmtPct(accuracy)}</div><div class="label">${esc(t("label.accuracy"))}</div></div>
        <div class="stat"><div class="value">${fmtDuration(durationMs / total)}</div><div class="label">${esc(t("label.perTask"))}</div></div>
      </div>
      ${!auth.isAuthenticated() ? `<p class="muted small">${esc(t("guest.note"))}</p>` : ""}
      <div class="result-list">${rows}</div>
      <div class="control-actions">
        <button class="btn btn-primary" id="math-again">${esc(t("action.newRound"))}</button>
        <button class="btn btn-ghost" id="math-settings">${esc(t("action.settings"))}</button>
      </div>
    </div>
  `;
  $("#math-again").addEventListener("click", () => {
    const cfg = { ...state.cfg };
    startSession(container, cfg);
  });
  $("#math-settings").addEventListener("click", () => renderMath(container));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
