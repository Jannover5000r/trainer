#!/usr/bin/env bash
# Builds the offline training core to WebAssembly for the Capacitor app and
# copies the matching wasm_exec.js runtime from the Go toolchain.
set -euo pipefail

cd "$(dirname "$0")/.."

OUT="web/static/wasm"
mkdir -p "$OUT"

GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o "$OUT/trainer.wasm" ./cmd/wasm

WASM_EXEC="$(go env GOROOT)/lib/wasm/wasm_exec.js"
if [ ! -f "$WASM_EXEC" ]; then
  WASM_EXEC="$(go env GOROOT)/misc/wasm/wasm_exec.js"
fi
if [ ! -f "$WASM_EXEC" ]; then
  echo "error: wasm_exec.js not found under $(go env GOROOT)" >&2
  exit 1
fi
cp "$WASM_EXEC" "$OUT/wasm_exec.js"

echo "built $OUT/trainer.wasm ($(du -h "$OUT/trainer.wasm" | cut -f1))"
