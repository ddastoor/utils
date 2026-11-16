#!/usr/bin/env bash
# Builds src/wasm/bin/whisper.wasm: whisper.cpp 1.8.3 + ggml CPU backend (C/C++, MIT) + glue.cpp (own) for wasm32-wasi,
# single-threaded, WebAssembly SIMD. Source: the whisper.cpp tree vendored in the crates.io crate whisper-rs-sys 0.15.0
# (github.com is not reachable from the sandbox; crates.io is), SHA-256 = the checksum crates.io publishes for it.
# Own files: threadshim.h (std::mutex/std::thread/fstream for a libc++ without threads or file streams),
# backend-reg.cpp (static CPU-only backend registry instead of ggml's dlopen-based one), cxxabi_stubs.c (throw = abort).
# The upstream sources are compiled unmodified.
#   ZIG=/path/to/zig wasm/whisper/build.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"; ZIG="${ZIG:-zig}"
URL=https://static.crates.io/crates/whisper-rs-sys/whisper-rs-sys-0.15.0.crate
SHA=6986c0fe081241d391f09b9a071fbcbb59720c3563628c3c829057cf69f2a56f
WORK="${TMPDIR:-/tmp}/whisper-build"; rm -rf "$WORK"; mkdir -p "$WORK/obj"; cd "$WORK"
curl -fsSL --retry 4 -o src.crate "$URL"
echo "$SHA  src.crate" | sha256sum -c -
tar xzf src.crate
W="$WORK/whisper-rs-sys-0.15.0/whisper.cpp"; G="$W/ggml/src"; C="$G/ggml-cpu"
grep -q 'project("whisper.cpp" VERSION 1.8.3)' "$W/CMakeLists.txt"
DEF=(-DGGML_USE_CPU '-DGGML_VERSION="0.0.0"' '-DGGML_COMMIT="whisper-1.8.3"' '-DWHISPER_VERSION="1.8.3"' -D_GNU_SOURCE -D_WASI_EMULATED_SIGNAL -DNDEBUG)
INC=(-I"$W/include" -I"$W/ggml/include" -I"$G" -I"$C" -I"$W/src")
cc1() { "$ZIG" cc --target=wasm32-wasi -O3 -msimd128 "${DEF[@]}" "${INC[@]}" -c "$1" -o "obj/$2.o"; }
cxx1() { "$ZIG" c++ --target=wasm32-wasi -O3 -msimd128 -std=c++17 -fexceptions "${DEF[@]}" "${INC[@]}" -include "$HERE/threadshim.h" -c "$1" -o "obj/$2.o"; }
cc1 "$G/ggml.c" ggml_c; cc1 "$G/ggml-alloc.c" alloc; cc1 "$G/ggml-quants.c" ggml_quants
cc1 "$C/ggml-cpu.c" cpu_c; cc1 "$C/quants.c" cpu_quants; cc1 "$C/arch/wasm/quants.c" wasm_quants; cc1 "$HERE/cxxabi_stubs.c" cxxabi
for f in ggml.cpp ggml-backend.cpp ggml-threading.cpp gguf.cpp; do cxx1 "$G/$f" "g_${f%.cpp}"; done
for f in ggml-cpu.cpp repack.cpp ops.cpp binary-ops.cpp unary-ops.cpp vec.cpp traits.cpp; do cxx1 "$C/$f" "c_${f%.cpp}"; done
cxx1 "$W/src/whisper.cpp" whisper; cxx1 "$HERE/backend-reg.cpp" backend_reg; cxx1 "$HERE/glue.cpp" glue
"$ZIG" c++ --target=wasm32-wasi -mexec-model=reactor -O3 -msimd128 obj/*.o -lwasi-emulated-signal \
  -Wl,--export=w_malloc,--export=w_free,--export=w_load,--export=w_unload,--export=w_transcribe,--export=w_system_info,--export=w_is_multilingual \
  -Wl,--max-memory=4294901760 -Wl,-z,stack-size=8388608 -Wl,--strip-all -o "$ROOT/src/wasm/bin/whisper.wasm"
ls -l "$ROOT/src/wasm/bin/whisper.wasm"
