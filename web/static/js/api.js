// Thin fetch wrapper around the Go JSON API. Always sends the session cookie.
// In the Capacitor Android build the offline WASM core is used instead.

import { isOfflineApp } from "./platform.js";
import { localApi } from "./local-api.js";

async function request(path, { method = "GET", body, signal } = {}) {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }

  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const serverApi = {
  me: () => request("/api/auth/me"),
  register: (username, password) => request("/api/auth/register", { method: "POST", body: { username, password } }),
  login: (username, password) => request("/api/auth/login", { method: "POST", body: { username, password } }),
  recover: (username, recoveryCode, newPassword) =>
    request("/api/auth/recover", {
      method: "POST",
      body: { username, recovery_code: recoveryCode, new_password: newPassword },
    }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  sync: (payload) => request("/api/sync", { method: "POST", body: payload }),
  preferences: () => request("/api/preferences"),
  putPreferences: (prefs) => request("/api/preferences", { method: "PUT", body: prefs }),

  mathTasks: (type, difficulty, count) =>
    request(`/api/drill/math?type=${encodeURIComponent(type)}&difficulty=${encodeURIComponent(difficulty)}&count=${count}`),
  mathVerify: (answers, log) => request("/api/drill/math/verify", { method: "POST", body: { answers, log } }),

  memoryGenerate: (count, delaySeconds) =>
    request(`/api/drill/memory/generate?count=${count}&delay_seconds=${delaySeconds}`),
  memoryQuestions: (sessionId) =>
    request(`/api/drill/memory/questions?session_id=${encodeURIComponent(sessionId)}`),
  memoryEvaluate: (payload) => request("/api/drill/memory/evaluate", { method: "POST", body: payload }),

  logMemory: (stat) => request("/api/stats/memory", { method: "POST", body: stat }),
  logReaction: (stat) => request("/api/stats/reaction", { method: "POST", body: stat }),
};

export const api = isOfflineApp() ? localApi : serverApi;
