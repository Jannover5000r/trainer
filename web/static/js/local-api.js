// Offline API backed by the Go WASM core (cmd/wasm). Mirrors ./api.js; account,
// sync and preferences are unavailable offline.

let readyPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.append(script);
  });
}

function waitFor(check, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (check()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("offline core did not start"));
      setTimeout(tick, 25);
    };
    tick();
  });
}

async function boot() {
  if (globalThis.trainerOffline) return;
  await loadScript("/wasm/wasm_exec.js");
  if (typeof globalThis.Go !== "function") {
    throw new Error("Go WASM runtime is unavailable");
  }
  const go = new globalThis.Go();
  const response = await fetch("/wasm/trainer.wasm");
  const bytes = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
  // main() blocks after registering trainerOffline; do not await.
  go.run(instance);
  await waitFor(() => globalThis.trainerOffline, 15000);
}

export function ensureOfflineCore() {
  if (!readyPromise) readyPromise = boot();
  return readyPromise;
}

function call(name, payload) {
  const raw = globalThis.trainerOffline[name](JSON.stringify(payload ?? {}));
  const data = JSON.parse(raw);
  if (data && data.error) {
    const err = new Error(data.error);
    err.status = data.status || 0;
    err.data = data;
    throw err;
  }
  return data;
}

function unavailable() {
  const err = new Error("not available in the offline app");
  err.status = 0;
  return err;
}

export const localApi = {
  me: async () => ({ authenticated: false, user: null }),
  register: async () => {
    throw unavailable();
  },
  login: async () => {
    throw unavailable();
  },
  recover: async () => {
    throw unavailable();
  },
  logout: async () => ({ ok: true }),
  sync: async () => ({ ok: true, imported: 0 }),
  preferences: async () => ({}),
  putPreferences: async () => ({ ok: true }),

  mathTasks: async (type, difficulty, count) => {
    await ensureOfflineCore();
    return call("mathGenerate", { type, difficulty, count });
  },
  mathVerify: async (answers) => {
    await ensureOfflineCore();
    return call("mathVerify", { answers });
  },
  memoryGenerate: async (count, delaySeconds) => {
    await ensureOfflineCore();
    return call("memoryGenerate", { count, delay_seconds: delaySeconds });
  },
  memoryQuestions: async (sessionId) => {
    await ensureOfflineCore();
    return call("memoryQuestions", { session_id: sessionId });
  },
  memoryEvaluate: async (payload) => {
    await ensureOfflineCore();
    return call("memoryEvaluate", payload);
  },

  logMemory: async () => ({ ok: true }),
  logReaction: async () => ({ ok: true }),
};
