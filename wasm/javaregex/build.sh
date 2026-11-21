#!/usr/bin/env bash
# Builds src/wasm/bin/java-regex.wasm — OpenJDK's own java.util.regex (Pattern, Matcher, the JDK's Unicode tables)
# compiled to WebAssembly (GC) by TeaVM 0.16.0 — and src/lib/regex/teavm-runtime.js, TeaVM's runtime for it, patched to
# make no code from strings (patch-runtime.py). The Regex Tester's Java flavour (CLAUDE.md §5.1r).
# Needs: a JDK 21 with its own source — apt install openjdk-21-jdk-headless openjdk-21-source, the same version (the
# reference of the unit suite is that JDK's java.util.regex) —, Maven (TeaVM comes from Maven Central), python3.
#   bash wasm/javaregex/build.sh          (≈ 1 min)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
WORK="${WORK:-/tmp/javaregex-build}"
JDK_HOME="${JDK_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
[ -f "$JDK_HOME/lib/src.zip" ] || { echo "build.sh: no $JDK_HOME/lib/src.zip — apt install openjdk-21-source" >&2; exit 1; }
TEAVM=$(sed -n 's:.*<teavm.version>\(.*\)</teavm.version>.*:\1:p' "$HERE/pom.xml")
rm -rf "$WORK" && mkdir -p "$WORK"
# 1. the sources: OpenJDK's regex and Character under ojdk.*, our glue, the JDK's name table and combining classes
JDK_HOME="$JDK_HOME" python3 "$HERE/prepare.py" "$WORK"
# 2. TeaVM: Java bytecode → WebAssembly GC
JAVA_HOME="$JDK_HOME" mvn -q -B -f "$HERE/pom.xml" -Dwork="$WORK" package
cp "$WORK/wasm/java-regex.wasm" "$ROOT/src/wasm/bin/java-regex.wasm"
# 3. TeaVM's runtime for WebAssembly GC, without new Function
JAR="${MAVEN_REPO:-$HOME/.m2/repository}/org/teavm/teavm-core/$TEAVM/teavm-core-$TEAVM.jar"
unzip -p "$JAR" org/teavm/backend/wasm/wasm-gc-module-runtime.js > "$WORK/runtime.orig.js"
python3 "$HERE/patch-runtime.py" "$WORK/runtime.orig.js" "$ROOT/src/lib/regex/teavm-runtime.js"
ls -la "$ROOT/src/wasm/bin/java-regex.wasm" "$ROOT/src/lib/regex/teavm-runtime.js"
