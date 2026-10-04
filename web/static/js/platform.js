// Platform detection: HTTP API on the web, offline WASM core in the app.

export function isNativeApp() {
  // Capacitor Android injects window.androidBridge.
  if (globalThis.androidBridge) return true;
  try {
    const cap = globalThis.Capacitor;
    if (!cap) return false;
    return typeof cap.isNativePlatform === "function" ? cap.isNativePlatform() : Boolean(cap.isNative);
  } catch {
    return false;
  }
}

// ?offline=1 forces the offline core in a desktop browser.
export function isOfflineApp() {
  if (isNativeApp()) return true;
  try {
    return new URLSearchParams(location.search).get("offline") === "1";
  } catch {
    return false;
  }
}
