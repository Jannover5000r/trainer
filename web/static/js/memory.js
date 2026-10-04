// Merkfähigkeit / Faktenlernen. Phase 1 shows patient fact sheets with a
// countdown enforced by the server (425 Too Early until ready). When the
// countdown reaches zero the view switches to the questions automatically.
// Phase 2 probes the facts with MC (number keys) or matching selects.

import { api } from "./api.js";
import { auth } from "./auth.js";
import { store } from "./store.js";
import { $, esc, fmtPct, fmtClock } from "./ui.js";
import { t } from "./i18n.js";

const COUNTS = [4, 5, 6, 8];
const DURATIONS = [
  { seconds: 30, label: "duration.30" },
  { seconds: 60, label: "duration.60" },
  { seconds: 180, label: "duration.180" },
];

let state = null;

function stopCountdown() {
  if (state?.timer) clearInterval(state.timer);
  if (state) state.timer = null;
}

export function teardownMemory() {
  stopCountdown();
  if (state?.keyHandler) document.removeEventListener("keydown", state.keyHandler);
  state = null;
}

export function renderMemory(container) {
  teardownMemory();
  const s = store.settings();
  const count = s.memoryCount || 5;
  const delay = s.memoryDelay || 60;

  container.innerHTML = `
    <h1>${esc(t("memory.title"))}</h1>
    <div class="card" id="memory-config">
      <div class="controls">
        <div class="field"><span>${esc(t("memory.profileCount"))}</span>
          <div class="segmented" id="memory-count">
            ${COUNTS.map((n) => `<button data-count="${n}" class="${n === count ? "active" : ""}">${n}</button>`).join("")}
          </div>
        </div>
        <div class="field"><span>${esc(t("memory.delay"))}</span>
          <div class="segmented" id="memory-delay">
            ${DURATIONS.map((d) => `<button data-seconds="${d.seconds}" class="${d.seconds === delay ? "active" : ""}">${esc(t(d.label))}</button>`).join("")}
          </div>
        </div>
      </div>
      <div class="control-actions">
        <button class="btn btn-primary" id="memory-start">${esc(t("memory.start"))}</button>
      </div>
      <p class="muted small" style="margin-top:.8rem">${esc(t("memory.hint"))}</p>
    </div>
    <div id="memory-session"></div>
  `;

  container.querySelectorAll("#memory-count button").forEach((b) =>
    b.addEventListener("click", () => {
      container.querySelectorAll("#memory-count button").forEach((x) => x.classList.toggle("active", x === b));
    }),
  );
  container.querySelectorAll("#memory-delay button").forEach((b) =>
    b.addEventListener("click", () => {
      container.querySelectorAll("#memory-delay button").forEach((x) => x.classList.toggle("active", x === b));
    }),
  );

  $("#memory-start").addEventListener("click", () => {
    const cfg = {
      count: Number(container.querySelector("#memory-count .active").dataset.count),
      delay: Number(container.querySelector("#memory-delay .active").dataset.seconds),
    };
    store.saveSettings({ memoryCount: cfg.count, memoryDelay: cfg.delay });
    startSession(container, cfg);
  });
}

async function startSession(container, cfg) {
  stopCountdown();
  container.querySelector("#memory-config")?.classList.add("hidden");
  const root = container.querySelector("#memory-session");
  root.innerHTML = `<div class="card"><p class="muted">${esc(t("memory.loading"))}</p></div>`;

  let gen;
  try {
    gen = await api.memoryGenerate(cfg.count, cfg.delay);
  } catch (err) {
    root.innerHTML = `<div class="card"><p class="form-error">${esc(err.message)}</p></div>`;
    return;
  }

  state = {
    cfg,
    sessionId: gen.session_id,
    readyAt: Date.parse(gen.ready_at),
    profiles: gen.profiles,
    memorizeStart: Date.now(),
    container,
    questions: [],
    qi: 0,
    answers: [],
    phase: "memorize",
    timer: null,
    keyHandler: null,
    loading: false,
  };
  renderPhase1(container);
}

function profileCard(p) {
  return `<div class="profile">
    <h3>${esc(p.name)}</h3>
    <dl>
      <dt>${esc(t("profile.age"))}</dt><dd>${p.age}</dd>
      <dt>${esc(t("profile.profession"))}</dt><dd>${esc(p.profession)}</dd>
      <dt>${esc(t("profile.diagnosis"))}</dt><dd>${esc(p.diagnosis)}</dd>
      <dt>${esc(t("profile.medication"))}</dt><dd>${esc(p.medication)}</dd>
      <dt>${esc(t("profile.blood"))}</dt><dd>${esc(p.blood_group)}</dd>
      <dt>${esc(t("profile.symptom"))}</dt><dd>${esc(p.symptom)}</dd>
    </dl>
  </div>`;
}

function renderPhase1(container) {
  const root = container.querySelector("#memory-session");
  root.innerHTML = `
    <div class="card">
      <div class="session-head">
        <h2>${esc(t("memory.phase1"))}</h2>
        <button class="btn btn-ghost" id="memory-cancel">${esc(t("memory.cancel"))}</button>
      </div>
      <div class="countdown" id="memory-countdown">--:--</div>
      <div class="profile-grid">${state.profiles.map(profileCard).join("")}</div>
    </div>
  `;

  const countdownEl = $("#memory-countdown");
  const tick = () => {
    // Only run while still memorising; an extra/leaked tick is a no-op.
    if (!state || state.phase !== "memorize") return;
    const remaining = state.readyAt - Date.now();
    if (remaining <= 0) {
      startQuestions(container);
      return;
    }
    countdownEl.textContent = fmtClock(remaining / 1000);
  };
  tick();
  if (state.phase === "memorize" && state.timer === null) {
    state.timer = setInterval(tick, 200);
  }

  $("#memory-cancel").addEventListener("click", () => cancelSession(container));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// startQuestions is the one-shot auto transition. The phase flag makes it
// idempotent, so a stray countdown tick can never re-run the switch.
function startQuestions(container) {
  if (!state || state.phase !== "memorize") return;
  state.phase = "questions";
  stopCountdown();
  fetchQuestions(container);
}

function cancelSession(container) {
  teardownMemory();
  renderMemory(container);
}

// fetchQuestions loads and renders the probes. It is independent of the phase
// so the manual 425 retry can call it again after the auto transition.
async function fetchQuestions(container) {
  if (!state || state.loading) return;
  state.loading = true;
  stopCountdown();

  const root = container.querySelector("#memory-session");
  root.innerHTML = `<div class="card"><p class="muted">${esc(t("memory.loadingQuestions"))}</p></div>`;
  try {
    const data = await api.memoryQuestions(state.sessionId);
    state.questions = data.questions;
    state.memorizeMs = Date.now() - state.memorizeStart;
    state.loading = false;
    state.keyHandler = onKey;
    document.addEventListener("keydown", state.keyHandler);
    renderQuestion(container);
  } catch (err) {
    state.loading = false;
    if (err.status === 425) {
      root.innerHTML = `<div class="card"><p class="form-error">${esc(t("memory.notReady"))}</p>
        <div class="control-actions"><button class="btn btn-primary" id="memory-retry">${esc(t("action.retry"))}</button></div></div>`;
      $("#memory-retry").addEventListener("click", () => fetchQuestions(container));
    } else {
      root.innerHTML = `<div class="card"><p class="form-error">${esc(err.message)}</p>
        <div class="control-actions"><button class="btn" id="memory-back">${esc(t("action.back"))}</button></div></div>`;
      $("#memory-back").addEventListener("click", () => renderMemory(container));
    }
  }
}

function onKey(event) {
  // Never hijack keys while a form control (e.g. a matching dropdown) has
  // focus, otherwise Enter/numbers would close or submit the question.
  const tag = event.target?.tagName;
  if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA") return;

  const q = state?.questions?.[state.qi];
  if (!q || !state.container) return;
  if (q.type === "mc" && /^[1-9]$/.test(event.key)) {
    const index = Number(event.key) - 1;
    if (index < q.choices.length) {
      event.preventDefault();
      chooseMC(state.container, index);
    }
  } else if (q.type === "match" && event.key === "Enter") {
    event.preventDefault();
    submitMatch(state.container);
  }
}

function renderQuestion(container) {
  const root = container.querySelector("#memory-session");
  const q = state.questions[state.qi];

  let body = "";
  if (q.type === "mc") {
    body = `<div class="choice-grid">${q.choices
      .map(
        (c, i) =>
          `<button class="choice" data-index="${i}"><span class="key">${i + 1}</span><span>${esc(c)}</span></button>`,
      )
      .join("")}</div>`;
  } else {
    body = `${q.items
      .map(
        (it) => `<div class="match-row">
          <span>${esc(it.label)}</span>
          <select data-item="${esc(it.id)}">${q.options
            .map((o) => `<option value="${esc(o)}">${esc(o)}</option>`)
            .join("")}</select>
        </div>`,
      )
      .join("")}
      <div class="control-actions"><button class="btn btn-primary" id="memory-submit-match">${esc(t("action.next"))}</button></div>`;
  }

  root.innerHTML = `
    <div class="card">
      <div class="session-head">
        <span class="pill">${esc(t("memory.question", { i: state.qi + 1, n: state.questions.length }))}</span>
        <button class="btn btn-ghost" id="memory-cancel">${esc(t("memory.cancel"))}</button>
      </div>
      <h2>${esc(q.prompt)}</h2>
      ${body}
    </div>
  `;

  if (q.type === "mc") {
    root.querySelectorAll(".choice").forEach((b) =>
      b.addEventListener("click", () => chooseMC(container, Number(b.dataset.index))),
    );
  } else {
    $("#memory-submit-match").addEventListener("click", () => submitMatch(container));
  }
  $("#memory-cancel").addEventListener("click", () => cancelSession(container));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function chooseMC(container, index) {
  const q = state.questions[state.qi];
  state.answers.push({ question_id: q.id, value: q.choices[index] });
  container.querySelectorAll(".choice")[index]?.classList.add("selected");
  setTimeout(() => {
    if (state) advance(container);
  }, 140);
}

function submitMatch(container) {
  const q = state.questions[state.qi];
  const matches = {};
  container.querySelectorAll("#memory-session select").forEach((sel) => {
    matches[sel.dataset.item] = sel.value;
  });
  state.answers.push({ question_id: q.id, matches });
  advance(container);
}

function advance(container) {
  state.qi++;
  if (state.qi >= state.questions.length) evaluate(container);
  else renderQuestion(container);
}

async function evaluate(container) {
  if (state) state.phase = "done";
  if (state.keyHandler) {
    document.removeEventListener("keydown", state.keyHandler);
    state.keyHandler = null;
  }
  const root = container.querySelector("#memory-session");
  root.innerHTML = `<div class="card"><p class="muted">${esc(t("memory.evaluating"))}</p></div>`;

  const memorizeMs = state.memorizeMs || Date.now() - state.memorizeStart;
  let evalData;
  try {
    evalData = await api.memoryEvaluate({
      session_id: state.sessionId,
      memorize_ms: memorizeMs,
      answers: state.answers,
    });
  } catch (err) {
    root.innerHTML = `<div class="card"><p class="form-error">${esc(err.message)}</p>
      <div class="control-actions"><button class="btn" id="memory-settings">${esc(t("action.settings"))}</button></div></div>`;
    $("#memory-settings").addEventListener("click", () => renderMemory(container));
    return;
  }

  const errors = evalData.total - evalData.correct;
  if (!auth.isAuthenticated()) {
    store.addMemoryStat({ profile_type: "steckbrief", errors, memorize_ms: memorizeMs });
  }
  store.addHistory({ kind: "memory", profileType: "steckbrief", total: evalData.total, correct: evalData.correct });
  document.dispatchEvent(new CustomEvent("trainer:updated"));

  const promptById = new Map(state.questions.map((q) => [q.id, q.prompt]));
  const rows = evalData.results
    .map(
      (r) => `<div class="result-row ${r.correct ? "ok" : "no"}">
        <span>${esc(promptById.get(r.question_id) || t("memory.questionFallback"))}</span>
        <span class="mark">${r.correct ? "✓" : "✗"}</span>
      </div>`,
    )
    .join("");

  root.innerHTML = `
    <div class="card">
      <h2>${esc(t("math.result"))}</h2>
      <div class="stat-grid">
        <div class="stat"><div class="value">${evalData.correct}/${evalData.total}</div><div class="label">${esc(t("label.correct"))}</div></div>
        <div class="stat"><div class="value">${fmtPct(evalData.hit_rate)}</div><div class="label">${esc(t("label.accuracy"))}</div></div>
        <div class="stat"><div class="value">${fmtClock(memorizeMs / 1000)}</div><div class="label">${esc(t("memory.memorizeTime"))}</div></div>
      </div>
      ${!auth.isAuthenticated() ? `<p class="muted small">${esc(t("guest.note"))}</p>` : ""}
      <div class="result-list">${rows}</div>
      <div class="control-actions">
        <button class="btn btn-primary" id="memory-again">${esc(t("action.newRound"))}</button>
        <button class="btn btn-ghost" id="memory-settings">${esc(t("action.settings"))}</button>
      </div>
    </div>
  `;
  $("#memory-again").addEventListener("click", () => startSession(container, state.cfg));
  $("#memory-settings").addEventListener("click", () => renderMemory(container));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
