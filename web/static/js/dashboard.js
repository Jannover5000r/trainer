// Dashboard: streak, today's summary and a 7-day accuracy chart, computed
// entirely from the local history log (works offline and for guests).

import { store } from "./store.js";
import { esc, fmtPct, fmtDuration, dayKey } from "./ui.js";
import { t } from "./i18n.js";

const DAY_MS = 86_400_000;
const WEEKDAY_KEYS = ["weekday.sun", "weekday.mon", "weekday.tue", "weekday.wed", "weekday.thu", "weekday.fri", "weekday.sat"];

function weekdayLabel(ts) {
  return t(WEEKDAY_KEYS[new Date(ts).getDay()]);
}

export function computeStats(history = store.history()) {
  const activeDays = new Set(history.map((e) => dayKey(e.ts)));

  // Streak: consecutive days with at least one session. Yesterday still counts
  // as an active run if today has not been used yet.
  let streak = 0;
  let cursor = Date.now();
  if (!activeDays.has(dayKey(cursor))) {
    cursor -= DAY_MS;
  }
  while (activeDays.has(dayKey(cursor))) {
    streak++;
    cursor -= DAY_MS;
  }

  const today = dayKey();
  const todays = history.filter((e) => dayKey(e.ts) === today);
  const taskEntries = todays.filter((e) => e.kind !== "reaction");
  const reactionEntries = todays.filter((e) => e.kind === "reaction");

  const knowledgeTasks = taskEntries.reduce((n, e) => n + (e.total || 0), 0);
  const correctTasks = taskEntries.reduce((n, e) => n + (e.correct || 0), 0);
  const reactionTrials = reactionEntries.reduce((n, e) => n + (e.trials || 0), 0);
  const totalTasks = knowledgeTasks + reactionTrials;

  const mathMs = todays.filter((e) => e.kind === "math").reduce((n, e) => n + (e.durationMs || 0), 0);
  const mathTasks = todays.filter((e) => e.kind === "math").reduce((n, e) => n + (e.total || 0), 0);
  const reactionMs = reactionEntries.reduce((n, e) => n + (e.avgMs || 0) * (e.trials || 0), 0);

  let avgMs = null;
  if (reactionTrials > 0) avgMs = reactionMs / reactionTrials;
  else if (mathTasks > 0) avgMs = mathMs / mathTasks;

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const ts = Date.now() - i * DAY_MS;
    const key = dayKey(ts);
    const entries = history.filter((e) => dayKey(e.ts) === key && e.kind !== "reaction");
    const total = entries.reduce((n, e) => n + (e.total || 0), 0);
    const correct = entries.reduce((n, e) => n + (e.correct || 0), 0);
    days.push({ key, label: weekdayLabel(ts), total, accuracy: total ? correct / total : null });
  }

  return {
    streak,
    sessionsToday: todays.length,
    totalTasks,
    accuracy: knowledgeTasks ? correctTasks / knowledgeTasks : null,
    avgMs,
    days,
  };
}

function buildChart(days) {
  const W = 320;
  const H = 130;
  const padX = 14;
  const padTop = 12;
  const padBottom = 24;
  const plotH = H - padTop - padBottom;
  const slot = (W - padX * 2) / days.length;
  const barW = slot * 0.5;

  let bars = "";
  const points = [];
  days.forEach((d, i) => {
    const x = padX + i * slot + (slot - barW) / 2;
    const value = d.accuracy ?? 0;
    const h = value * plotH;
    const y = padTop + plotH - h;
    bars += `<rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3"><title>${esc(d.label)}: ${fmtPct(d.accuracy)}</title></rect>`;
    if (d.accuracy !== null) {
      points.push([padX + i * slot + slot / 2, y]);
    }
    bars += `<text class="label" x="${(padX + i * slot + slot / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>`;
  });

  const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const dots = points.map(([x, y]) => `<circle class="dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" />`).join("");

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("dashboard.chart"))}">
    <line class="axis" x1="${padX}" y1="${padTop}" x2="${padX}" y2="${padTop + plotH}" />
    <line class="axis" x1="${padX}" y1="${padTop + plotH}" x2="${W - padX}" y2="${padTop + plotH}" />
    ${bars}
    ${points.length > 1 ? `<path class="line" d="${line}" />` : ""}
    ${dots}
  </svg>`;
}

export function renderDashboard(container) {
  const stats = computeStats();
  const history = store.history().slice(-8).reverse();
  const backlog = store.backlog();
  const pending = backlog.math.length + backlog.memory.length;

  const recent = history.length
    ? history
        .map((e) => {
          let kind;
          let detail;
          let score;
          let accuracy;
          if (e.kind === "reaction") {
            kind = t("kind.reaction");
            detail = t("reaction.detail", { avg: fmtDuration(e.avgMs), best: fmtDuration(e.bestMs) });
            score = `${e.trials}×`;
            accuracy = fmtDuration(e.avgMs);
          } else if (e.kind === "memory") {
            const visual = e.profileType === "visual";
            kind = visual ? t("kind.visual") : t("kind.memory");
            detail = visual
              ? e.variant === "symbols"
                ? t("visual.symbolField")
                : t("visual.grid")
              : t("memory.profiles");
            score = `${e.correct}/${e.total}`;
            accuracy = e.total ? fmtPct(e.correct / e.total) : "–";
          } else {
            kind = t("kind.math");
            detail = e.category || "";
            score = `${e.correct}/${e.total}`;
            accuracy = e.total ? fmtPct(e.correct / e.total) : "–";
          }
          const perfect = e.kind !== "reaction" && e.correct === e.total;
          return `<div class="result-row ${perfect ? "ok" : ""}">
            <span>${esc(kind)} <span class="muted small">${esc(detail)}</span></span>
            <span class="muted small">${esc(score)} · ${accuracy}</span>
          </div>`;
        })
        .join("")
    : `<p class="muted small">${esc(t("dashboard.empty"))}</p>`;

  container.innerHTML = `
    <h1>${esc(t("dashboard.title"))}</h1>
    <p class="muted small">${esc(t("dashboard.subtitle"))}${pending ? ` ${esc(t("dashboard.pending", { n: pending }))}` : ""}.</p>

    <div class="card">
      <div class="stat-grid">
        <div class="stat"><div class="value">🔥 ${stats.streak}</div><div class="label">${esc(t("dashboard.streak"))}</div></div>
        <div class="stat"><div class="value">${stats.sessionsToday}</div><div class="label">${esc(t("dashboard.todaySessions"))}</div></div>
        <div class="stat"><div class="value">${stats.totalTasks}</div><div class="label">${esc(t("dashboard.todayTasks"))}</div></div>
        <div class="stat"><div class="value">${fmtDuration(stats.avgMs)}</div><div class="label">${esc(t("dashboard.avgReaction"))}</div></div>
        <div class="stat"><div class="value">${fmtPct(stats.accuracy)}</div><div class="label">${esc(t("dashboard.todayAccuracy"))}</div></div>
      </div>
    </div>

    <div class="card">
      <h2>${esc(t("dashboard.chart"))}</h2>
      ${buildChart(stats.days)}
    </div>

    <div class="card">
      <h2>${esc(t("dashboard.recent"))}</h2>
      <div class="result-list">${recent}</div>
    </div>
  `;
}
