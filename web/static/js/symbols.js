// Symbol-field memory. A single field of colored symbols is shown for a
// configurable 15 s–5 min; afterwards the symbols are hidden and the user
// picks a symbol from the palette, then taps every cell that held it. A single
// wrong tap ends the run immediately. Grid size and the number of distinct
// symbols are the two difficulty levers.

import { api } from "./api.js";
import { auth } from "./auth.js";
import { store } from "./store.js";
import { esc, fmtDuration, fmtClock, onTap } from "./ui.js";
import { t } from "./i18n.js";

// Each symbol is a shape + color, drawn as a scalable SVG chip so it stays
// legible on every field size and on both themes.
const SYMBOLS = [
  { glyph: "●", bg: "#ef4444", fg: "#ffffff" },
  { glyph: "■", bg: "#3b82f6", fg: "#ffffff" },
  { glyph: "▲", bg: "#10b981", fg: "#04242c" },
  { glyph: "▼", bg: "#f59e0b", fg: "#04242c" },
  { glyph: "◆", bg: "#8b5cf6", fg: "#ffffff" },
  { glyph: "★", bg: "#ec4899", fg: "#ffffff" },
  { glyph: "♥", bg: "#f43f5e", fg: "#ffffff" },
  { glyph: "♣", bg: "#06b6d4", fg: "#04242c" },
  { glyph: "♠", bg: "#64748b", fg: "#ffffff" },
  { glyph: "✚", bg: "#84cc16", fg: "#04242c" },
  { glyph: "☆", bg: "#a78bfa", fg: "#04242c" },
  { glyph: "◈", bg: "#14b8a6", fg: "#04242c" },
];
const SIZES = [4, 6, 8];
const VARIETIES = [2, 3, 4, 6, 8];
const TIME_MIN = 15;
const TIME_MAX = 300;
const TIME_STEP = 15;
const DEFAULT_SIZE = 6;
const DEFAULT_VARIETY = 4;
const DEFAULT_TIME = 120;

let state = null;
let token = 0;

function isCurrent(myToken) {
  return Boolean(state && state.token === myToken);
}

export function teardownSymbols() {
  token++;
  if (state?.timer) clearInterval(state.timer);
  state = null;
}

function normalize(value, list, fallback) {
  return list.includes(value) ? value : fallback;
}

function clampTime(value) {
  if (!Number.isFinite(value)) return DEFAULT_TIME;
  const stepped = Math.round(value / TIME_STEP) * TIME_STEP;
  return Math.min(TIME_MAX, Math.max(TIME_MIN, stepped));
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function chip(symbol, extra = "") {
  return `<svg class="symbol-chip ${extra}" viewBox="0 0 100 100" aria-hidden="true">
    <rect width="100" height="100" rx="24" fill="${symbol.bg}" />
    <text x="50" y="54" text-anchor="middle" dominant-baseline="central" font-size="64" font-weight="700" fill="${symbol.fg}">${symbol.glyph}</text>
  </svg>`;
}

// pickSymbols returns `count` distinct symbols in random order.
function pickSymbols(count) {
  return shuffle([...SYMBOLS]).slice(0, count);
}

// buildGrid guarantees every selected symbol appears at least once, then fills
// the remaining cells at random.
function buildGrid(total, count) {
  const grid = new Array(total);
  const order = shuffle([...Array(total).keys()]);
  for (let i = 0; i < count; i++) grid[order[i]] = i;
  for (let i = count; i < total; i++) grid[order[i]] = Math.floor(Math.random() * count);
  return grid;
}

export function renderSymbols(body) {
  teardownSymbols();
  const s = store.settings();
  const size = normalize(s.symbolsSize, SIZES, DEFAULT_SIZE);
  const variety = normalize(s.symbolsVariety, VARIETIES, DEFAULT_VARIETY);
  const study = clampTime(s.symbolsStudySec || DEFAULT_TIME);

  body.innerHTML = `
    <div class="card" id="symbols-config">
      <p class="muted small">${esc(t("visual.symbolsIntro"))}</p>
      <p class="muted small">${esc(t("visual.symbolsHint"))}</p>
      <div class="controls">
        <div class="field"><span>${esc(t("visual.size"))}</span>
          <div class="segmented" id="symbols-size">
            ${SIZES.map((n) => `<button type="button" data-size="${n}" class="${n === size ? "active" : ""}">${n}×${n}</button>`).join("")}
          </div>
        </div>
        <div class="field"><span>${esc(t("visual.variety"))}</span>
          <div class="segmented" id="symbols-variety">
            ${VARIETIES.map((n) => `<button type="button" data-variety="${n}" class="${n === variety ? "active" : ""}">${n}</button>`).join("")}
          </div>
        </div>
      </div>
      <label class="field"><span>${esc(t("visual.studyTimeMin"))}: <b id="symbols-time-value">${fmtClock(study)}</b></span>
        <input type="range" id="symbols-time" min="${TIME_MIN}" max="${TIME_MAX}" step="${TIME_STEP}" value="${study}" />
      </label>
      <div class="control-actions"><button class="btn btn-primary" id="symbols-start">${esc(t("visual.start"))}</button></div>
    </div>
    <div id="symbols-session"></div>
  `;

  body.querySelectorAll("#symbols-size button").forEach((b) =>
    b.addEventListener("click", () => {
      body.querySelectorAll("#symbols-size button").forEach((x) => x.classList.toggle("active", x === b));
    }),
  );
  body.querySelectorAll("#symbols-variety button").forEach((b) =>
    b.addEventListener("click", () => {
      body.querySelectorAll("#symbols-variety button").forEach((x) => x.classList.toggle("active", x === b));
    }),
  );

  const slider = body.querySelector("#symbols-time");
  const valueOut = body.querySelector("#symbols-time-value");
  slider.addEventListener("input", () => {
    valueOut.textContent = fmtClock(Number(slider.value));
  });
  slider.addEventListener("change", () => {
    store.saveSettings({ symbolsStudySec: clampTime(Number(slider.value)) });
  });

  body.querySelector("#symbols-start").addEventListener("click", () => {
    const cfg = {
      size: Number(body.querySelector("#symbols-size .active").dataset.size),
      variety: Number(body.querySelector("#symbols-variety .active").dataset.variety),
      studySec: clampTime(Number(slider.value)),
    };
    store.saveSettings({ symbolsSize: cfg.size, symbolsVariety: cfg.variety, symbolsStudySec: cfg.studySec });
    startSession(body, cfg);
  });
}

function startSession(body, cfg) {
  const myToken = ++token;
  if (state?.timer) clearInterval(state.timer);
  body.querySelector("#symbols-config")?.classList.add("hidden");

  const total = cfg.size * cfg.size;
  const chosen = pickSymbols(Math.min(cfg.variety, total));
  const grid = buildGrid(total, chosen.length);
  const remaining = new Array(chosen.length).fill(0);
  grid.forEach((sym) => remaining[sym]++);

  state = {
    token: myToken,
    cfg,
    chosen,
    grid,
    remaining,
    assigned: new Array(total).fill(false),
    active: -1,
    failed: -1,
    phase: "study",
    recallStart: 0,
    timer: null,
  };
  window.scrollTo({ top: 0, behavior: "smooth" });
  renderStudy(body);
}

function renderStudy(body) {
  const { cfg, grid, chosen } = state;
  const cells = grid
    .map((sym) => `<div class="symbol-cell study">${chip(chosen[sym])}</div>`)
    .join("");

  body.querySelector("#symbols-session").innerHTML = `
    <div class="card">
      <div class="session-head">
        <span class="pill">${cfg.size}×${cfg.size}</span>
        <span class="pill">${esc(t("visual.variety"))}: ${chosen.length}</span>
        <button class="btn btn-ghost" id="symbols-cancel">${esc(t("visual.cancel"))}</button>
      </div>
      <div class="symbol-field" style="grid-template-columns: repeat(${cfg.size}, 1fr)">${cells}</div>
      <div class="symbol-timer" id="symbols-countdown"></div>
      <div class="feedback" id="symbols-feedback">${esc(t("visual.symbolsIntro"))}</div>
    </div>
  `;
  body.querySelector("#symbols-cancel").addEventListener("click", () => cancel(body));
  startCountdown(body, state.token);
}

function startCountdown(body, myToken) {
  const end = Date.now() + state.cfg.studySec * 1000;
  const tick = () => {
    if (!isCurrent(myToken) || state.phase !== "study") return;
    const remaining = end - Date.now();
    if (remaining <= 0) {
      switchToRecall(body);
      return;
    }
    const el = body.querySelector("#symbols-countdown");
    if (el) el.textContent = fmtClock(remaining / 1000);
  };
  tick();
  if (state.phase === "study") state.timer = setInterval(tick, 250);
}

function switchToRecall(body) {
  if (!isCurrent(state.token) || state.phase !== "study") return;
  state.phase = "recall";
  state.recallStart = performance.now();
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  // Start on the first symbol that still needs cells.
  state.active = state.remaining.findIndex((n) => n > 0);
  renderRecall(body);
}

function renderRecall(body) {
  const { cfg, grid, chosen, assigned, active, remaining } = state;
  const assignedCount = assigned.filter(Boolean).length;

  const cells = grid
    .map((sym, i) => {
      if (assigned[i]) return `<div class="symbol-cell assigned" data-i="${i}">${chip(chosen[sym])}</div>`;
      return `<div class="symbol-cell clickable" data-i="${i}"></div>`;
    })
    .join("");

  const palette = chosen
    .map((symbol, k) => {
      const left = remaining[k];
      const cls = [k === active ? "active" : "", left === 0 ? "done" : ""].filter(Boolean).join(" ");
      return `<button type="button" class="symbol-key ${cls}" data-sym="${k}" ${left === 0 ? "disabled" : ""}>
        ${chip(symbol)}
        <span class="symbol-key-count">${left}</span>
      </button>`;
    })
    .join("");

  body.querySelector("#symbols-session").innerHTML = `
    <div class="card">
      <div class="session-head">
        <span class="pill">${cfg.size}×${cfg.size}</span>
        <span class="pill" id="symbols-progress">${assignedCount}/${grid.length}</span>
        <button class="btn btn-ghost" id="symbols-cancel">${esc(t("visual.cancel"))}</button>
      </div>
      <div class="symbol-field" style="grid-template-columns: repeat(${cfg.size}, 1fr)">${cells}</div>
      <div class="feedback" id="symbols-feedback">${esc(t("visual.chooseSymbol"))}</div>
      <div class="symbol-palette" id="symbols-palette">${palette}</div>
    </div>
  `;

  body.querySelector("#symbols-cancel").addEventListener("click", () => cancel(body));
  body.querySelectorAll(".symbol-cell.clickable").forEach((cell) =>
    onTap(cell, () => pickCell(body, Number(cell.dataset.i))),
  );
  body.querySelectorAll(".symbol-key").forEach((key) => onTap(key, () => selectSymbol(body, Number(key.dataset.sym))));
}

// selectSymbol switches the active palette symbol without rebuilding the board.
function selectSymbol(body, k) {
  if (!isCurrent(state.token) || state.phase !== "recall") return;
  if (!state.remaining[k]) return;
  state.active = k;
  updateRecallUI(body);
}

// updateRecallUI patches only what changed so rapid taps are never dropped by
// an innerHTML rebuild (the previous behaviour lost taps on mobile).
function updateRecallUI(body, pickedIndex) {
  if (pickedIndex !== undefined) {
    const cell = body.querySelector(`.symbol-cell[data-i="${pickedIndex}"]`);
    if (cell) {
      const symbol = state.chosen[state.grid[pickedIndex]];
      cell.classList.remove("clickable");
      cell.classList.add("assigned");
      cell.innerHTML = chip(symbol);
    }
  }

  const assignedCount = state.assigned.filter(Boolean).length;
  const progress = body.querySelector("#symbols-progress");
  if (progress) progress.textContent = `${assignedCount}/${state.grid.length}`;

  body.querySelectorAll(".symbol-key").forEach((key) => {
    const k = Number(key.dataset.sym);
    const left = state.remaining[k];
    key.classList.toggle("active", k === state.active);
    key.classList.toggle("done", left === 0);
    key.disabled = left === 0;
    const count = key.querySelector(".symbol-key-count");
    if (count) count.textContent = String(left);
  });
}

function pickCell(body, index) {
  if (!isCurrent(state.token) || state.phase !== "recall") return;
  if (state.assigned[index]) return;
  if (state.active < 0) return;

  if (state.grid[index] !== state.active) {
    fail(body, index);
    return;
  }

  state.assigned[index] = true;
  state.remaining[state.active]--;
  if (state.remaining[state.active] === 0) {
    const next = state.remaining.findIndex((n) => n > 0);
    if (next >= 0) state.active = next;
  }

  if (state.assigned.every(Boolean)) {
    complete(body, true);
    return;
  }
  updateRecallUI(body, index);
}

function fail(body, index) {
  if (!isCurrent(state.token) || state.phase !== "recall") return;
  state.phase = "reveal";
  state.failed = index;
  state.timer = setTimeout(() => complete(body, false), 1100);
  renderReveal(body);
}

function renderReveal(body) {
  const { cfg, grid, chosen, assigned, failed } = state;
  const cells = grid
    .map((sym, i) => {
      const classes = ["symbol-cell"];
      if (assigned[i]) classes.push("assigned");
      else classes.push("missed");
      if (i === failed) classes.push("wrong");
      return `<div class="${classes.join(" ")}">${chip(chosen[sym])}</div>`;
    })
    .join("");

  body.querySelector("#symbols-session").innerHTML = `
    <div class="card">
      <div class="session-head">
        <span class="pill">${cfg.size}×${cfg.size}</span>
        <button class="btn btn-ghost" id="symbols-cancel">${esc(t("visual.cancel"))}</button>
      </div>
      <div class="symbol-field" style="grid-template-columns: repeat(${cfg.size}, 1fr)">${cells}</div>
      <div class="feedback wrong" id="symbols-feedback">${esc(t("visual.symbolsFailed"))}</div>
    </div>
  `;
  body.querySelector("#symbols-cancel").addEventListener("click", () => cancel(body));
}

function complete(body, success) {
  if (!state || !isCurrent(state.token)) return;
  if (state.timer) {
    clearInterval(state.timer);
    clearTimeout(state.timer);
    state.timer = null;
  }
  state.phase = "done";

  const myToken = state.token;
  const { cfg, grid } = state;
  const total = grid.length;
  const correct = success ? total : state.assigned.filter(Boolean).length;
  const errors = total - correct;
  const memorizeMs = cfg.studySec * 1000;
  const responseMs = Math.round(performance.now() - state.recallStart);

  const stat = { profile_type: "visual", errors, memorize_ms: memorizeMs };
  const logging = auth.isAuthenticated() ? api.logMemory(stat).catch(() => {}) : Promise.resolve(store.addMemoryStat(stat));

  logging.then(() => {
    if (!isCurrent(myToken)) return;
    store.addHistory({
      kind: "memory",
      profileType: "visual",
      variant: "symbols",
      total,
      correct,
      durationMs: responseMs,
    });
    document.dispatchEvent(new CustomEvent("trainer:updated"));
    if (!isCurrent(myToken)) return;
    renderSummary(body, success, { total, correct, errors, responseMs, memorizeMs });
  });
}

function renderSummary(body, success, result) {
  const { cfg, chosen } = state;
  const legend = chosen.map((symbol) => chip(symbol)).join("");

  body.querySelector("#symbols-session").innerHTML = `
    <div class="card">
      <h2>${esc(t("visual.summary"))} ${success ? esc(t("visual.cleared")) : ""}</h2>
      <div class="stat-grid">
        <div class="stat"><div class="value">${result.correct}/${result.total}</div><div class="label">${esc(t("label.correct"))}</div></div>
        <div class="stat"><div class="value">${result.errors}</div><div class="label">${esc(t("visual.errors"))}</div></div>
        <div class="stat"><div class="value">${fmtDuration(result.responseMs)}</div><div class="label">${esc(t("visual.answerTime"))}</div></div>
        <div class="stat"><div class="value">${fmtClock(result.memorizeMs / 1000)}</div><div class="label">${esc(t("visual.avgStudy"))}</div></div>
      </div>
      <div class="symbol-palette symbol-palette-static">${legend}</div>
      ${!auth.isAuthenticated() ? `<p class="muted small">${esc(t("guest.note"))}</p>` : ""}
      <div class="control-actions">
        <button class="btn btn-primary" id="symbols-again">${esc(t("action.newRound"))}</button>
        <button class="btn btn-ghost" id="symbols-settings">${esc(t("action.settings"))}</button>
      </div>
    </div>
  `;
  body.querySelector("#symbols-again").addEventListener("click", () => startSession(body, cfg));
  body.querySelector("#symbols-settings").addEventListener("click", () => renderSymbols(body));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancel(body) {
  teardownSymbols();
  renderSymbols(body);
}
