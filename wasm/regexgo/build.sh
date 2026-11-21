#!/bin/bash
# Builds src/wasm/bin/regex-go.wasm — the Regex Tester's Go flavour (to-do #8): Go's own regexp package compiled for
# GOOS=wasip1 (a WASI command run by src/lib/terminal/wasi.ts). Needs Go ≥ 1.21 (built with 1.24.7). No encoding/json
# on purpose (main.go: the module is 2.6 MB without it, 3.6 MB with it).
set -euo pipefail
cd "$(dirname "$0")"
GOOS=wasip1 GOARCH=wasm go build -trimpath -ldflags="-s -w -buildid=" -o ../../src/wasm/bin/regex-go.wasm .
ls -la ../../src/wasm/bin/regex-go.wasm
