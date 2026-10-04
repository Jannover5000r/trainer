// Runtime platform detection. The web build talks to the Go HTTP API; the
// Capacitor Android build runs entirely offline against the bundled WASM core.

export function isNativeApp() {
  // Capacitor Android also injects window.androidBridge.
  if (globalThis.androidBridge) return true;
  try {
    const cap = globalThis.Capacitor;
    if (!cap) return false;
    return typeof cap.isNativePlatform === "function" ? cap.isNativePlatform() : Boolean(cap.isNative);
  } catch {
    return false;
  }
}

// Allows forcing the offline core in a browser for testing with ?offline=1.
export function isOfflineApp() {
  if (isNativeApp()) return true;
  try {
    return new URLSearchParams(location.search).get("offline") === "1";
  } catch {
    return false;
  }
}
