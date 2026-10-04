#!/usr/bin/env bash
# Builds the offline core to WebAssembly and copies the Go wasm runtime.
set -euo pipefail

cd "$(dirname "$0")/.."

OUT="web/static/wasm"
mkdir -p "$OUT"

GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o "$OUT/trainer.wasm" ./cmd/wasm

WASM_EXEC="$(go env GOROOT)/lib/wasm/wasm_exec.js"
[ -f "$WASM_EXEC" ] || WASM_EXEC="$(go env GOROOT)/misc/wasm/wasm_exec.js"
[ -f "$WASM_EXEC" ] || { echo "wasm_exec.js not found under $(go env GOROOT)" >&2; exit 1; }
cp "$WASM_EXEC" "$OUT/wasm_exec.js"

echo "built $OUT/trainer.wasm ($(du -h "$OUT/trainer.wasm" | cut -f1))"
