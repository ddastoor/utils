#!/usr/bin/env bash
# Builds public/engines/dotnet-regex/_framework/ — the Regex Tester's .NET flavour: .NET 10's own
# System.Text.RegularExpressions on Microsoft's WebAssembly runtime (browser-wasm: dotnet.native.wasm, the runtime pack
# Microsoft.NETCore.App.Runtime.Mono.browser-wasm from NuGet — no workload needed), with RegexRun.cs (shared with the
# native reference, native/) behind one [JSExport] (Exports.cs). Trimmed; .NET's own error words kept
# (UseSystemResourceKeys=false); the invariant culture (as the reference runs). CLAUDE.md §5.1s.
# Needs: the .NET 10 SDK (apt install dotnet-sdk-10.0) and nuget.org.
#   bash wasm/dotnetregex/build.sh          (≈ 1 min)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
WORK="${WORK:-/tmp/dotnetregex-build}"
OUT="$ROOT/public/engines/dotnet-regex"
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
rm -rf "$WORK" && mkdir -p "$WORK"
cp "$HERE/DotnetRegex.csproj" "$HERE/RegexRun.cs" "$HERE/Exports.cs" "$WORK/"
(cd "$WORK" && dotnet publish -c Release -o "$WORK/out" -nologo -v quiet)
rm -rf "$OUT" && mkdir -p "$OUT" && cp -r "$WORK/out/wwwroot/_framework" "$OUT/"
ls -la "$OUT/_framework"
du -sb "$OUT"
