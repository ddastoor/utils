// The scripts of the Text-to-Speech tab's offline mode (owner, 21 Nov 2026: "I intend that this runs entirely from the
// user's PC, not in the browser … find out whether this operating system is Linux or Windows, and appropriately download
// whatever is needed"). One file per system — a .cmd for Windows (double-click; PowerShell inside) and a .sh for Linux —
// that keeps everything in one folder (SuperUtils-TTS in the home folder): uv (Astral's Python manager, from PyPI,
// SHA-256 checked) fetches Python and the speech engines; the engines fetch the chosen models from Hugging Face at pinned
// revisions; driver.py (the same on both systems) makes one WAV and one MP3 per voice. The page itself fetches nothing.
// The text, the job and driver.py are carried as Base64 (any character is safe, and the .cmd file stays ASCII).

/** uv, from its wheels on PyPI (a wheel is a zip; the program is inside it). */
export const UV = {
  version: '0.13.9',
  linux: {
    x86_64: { url: 'https://files.pythonhosted.org/packages/3d/aa/26d64642d808de4a652579ef950d7cd2d37f080a8babf9c67c6b75fc4c3f/uv-0.13.9-py3-none-manylinux_2_17_x86_64.manylinux2014_x86_64.whl', sha256: 'd7f459fe4fd247d830351c75686d3996ace3c6f3f728eb0e85a30b7ada0cef19', mb: 17.6 },
    aarch64: { url: 'https://files.pythonhosted.org/packages/57/15/94b6cd62ac3ff6550288328e8035288875197cbc183f51554b266a69877b/uv-0.13.9-py3-none-manylinux_2_17_aarch64.manylinux2014_aarch64.musllinux_1_1_aarch64.whl', sha256: '5435c5ce14a56431208ca0996416d310f1598e8c2c8ba707688985a16bb82dbe', mb: 18.0 },
  },
  windows: {
    AMD64: { url: 'https://files.pythonhosted.org/packages/dd/ef/ceeabf3631117f7354787d9fb1ffe943899e59ed4b887a696ed547e47e76/uv-0.13.9-py3-none-win_amd64.whl', sha256: '6a44b2ed8111d2f60d2b92627c5dccda3f7ed7570b18ce115e569cd68c28246b', mb: 15.7 },
    ARM64: { url: 'https://files.pythonhosted.org/packages/da/d1/d97a5db1f27e077e4d6329223f6b3f719c02c97e4092043f13e628558d05/uv-0.13.9-py3-none-win_arm64.whl', sha256: 'eeb92051c2123b9730c46b04cc843cfa4bc7d7b0aec56df431a2215ef4cb0273', mb: 15.8 },
  },
  member: { linux: 'uv-0.13.9.data/scripts/uv', windows: 'uv-0.13.9.data/scripts/uv.exe' },
} as const;
/** The Python every engine runs on (uv downloads its own build: nothing is installed on the system). */
export const PYTHON = '3.12';

/** One engine's run: its packages (pinned), settings it needs (COQUI_TOS_AGREED for XTTS-v2, once the person accepted
 *  its licence in the tab) and a line for the person. */
/** `first`: what the engine's first run downloads, in MB (its programs — with PyTorch where this run is the first to
 *  need it —, the same with PyTorch's NVIDIA build, its models): said before it starts, so a first run that spends
 *  minutes on PyTorch does not look stuck (owner, 21 Nov 2026). */
export interface EngineRun {
  engine: string; name: string; packages: string[]; lock?: string[]; voices: number; env?: Record<string, string>;
  first?: { programs: number; cuda: number; models: number };
}

/** "1.2 GB" / "350 MB" (MB = 10⁶ bytes, as the catalogue counts). */
export function fmtMB(mb: number): string {
  return mb >= 1000 ? `${(mb / 1000).toFixed(mb >= 10000 ? 0 : 1)} GB` : `${Math.max(1, Math.round(mb))} MB`;
}

/** The line under an engine's heading: what its first run downloads (ASCII: the Windows script is ASCII). */
export function firstRunNote(r: EngineRun): string {
  if (!r.first) return '';
  const f = r.first;
  const programs = `about ${fmtMB(f.programs)} of programs${f.cuda !== f.programs ? ` (${fmtMB(f.cuda)} with an NVIDIA graphics card)` : ''}`;
  return `  First run: ${programs} and ${fmtMB(f.models)} of model files to download; uv and Hugging Face show the progress. Later runs reuse them.`;
}

/** UTF-8 → Base64 (the browser's btoa takes Latin-1 only). */
export function b64(s: string): string {
  const u = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(bin);
}
const wrap = (s: string, n = 76) => s.replace(new RegExp(`(.{${n}})`, 'g'), '$1\n').replace(/\n$/, '');

/** A package pin is a name, ==, a version and optional extras — nothing a shell would read otherwise. */
const SAFE_PIN = /^[A-Za-z0-9._-]+(\[[A-Za-z0-9._,-]+\])?(==[A-Za-z0-9.+!_-]+)?$/;
/** The pins as words for both shells: in single quotes (bash would read "misaki[en]==0.9.4" as a file pattern — a file
 *  named misakie==0.9.4 in the folder would take its place); no pin holds a quote. */
function pinWords(packages: string[]): string[] {
  for (const p of packages) if (!SAFE_PIN.test(p)) throw new Error(`Not a package pin: ${p}`);
  return packages.map((p) => `'${p}'`);
}
function withArgs(packages: string[]): string[] { return pinWords(packages).flatMap((p) => ['--with', p]); }
/** A lock line: a pinned package and, after " ; ", an environment marker (sys_platform == 'win32' …). Written through
 *  Base64, but checked all the same: nothing in it is anything but a requirement. */
const LOCK_LINE = /^[A-Za-z0-9._-]+(\[[A-Za-z0-9._,-]+\])?===?[A-Za-z0-9.+!_-]+( ; [A-Za-z0-9_.'" =!<>()-]+)?$/;
/** The lock file of an engine (one requirement a line), checked. */
export function lockText(r: EngineRun): string {
  const lock = r.lock || [];
  for (const l of lock) if (!LOCK_LINE.test(l)) throw new Error(`Not a lock line: ${l}`);
  return lock.length ? lock.join('\n') + '\n' : '';
}
/** An engine's name is its folder under envs/: letters, digits, - and _. */
function engineDir(r: EngineRun): string {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(r.engine)) throw new Error(`Not an engine name: ${r.engine}`);
  return r.engine;
}
const ascii = (s: string) => s.normalize('NFKD').replace(/[^\x20-\x7e]/g, '');
/** A setting is NAME=value with nothing a shell would read otherwise. */
function envOf(r: EngineRun): Array<[string, string]> {
  const e = Object.entries(r.env || {});
  for (const [k, v] of e) if (!/^[A-Z][A-Z0-9_]*$/.test(k) || !/^[A-Za-z0-9._-]*$/.test(v)) throw new Error(`Not a setting: ${k}=${v}`);
  return e;
}
const REPO = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** What the token check runs with: Hugging Face's own library, nothing else (a few MB). */
export const CHECK_PINS = ['huggingface-hub==0.36.2'];

/** `gated`: Hugging Face repositories that need a (free) account and a token — the script asks for the token once and
 *  keeps it in its own folder (cache/huggingface/token), where huggingface_hub looks for it. */
export interface ScriptInput { job: object; driver: string; runs: EngineRun[]; made: string; site: string; gated?: string[] }

const tokenSteps = (repos: string[]) => [
  `${repos.length > 1 ? 'These voices are' : 'This voice is'} on Hugging Face behind a free account: ${repos.join(', ')}.`,
  '1. Sign in (or sign up, free) at https://huggingface.co',
  ...repos.map((r, i) => `${i + 2}. Open https://huggingface.co/${r} and accept its conditions`),
  `${repos.length + 2}. Make a token with the "Read" permission at https://huggingface.co/settings/tokens`,
];

/** Linux: bash, curl or wget, sha256sum; uv taken out of its wheel by python3, unzip or bsdtar (whichever is there). */
export function linuxScript(o: ScriptInput): string {
  const runs = o.runs.map((r) => [
    `say ${shq(`${r.name}: ${r.voices} voice${r.voices > 1 ? 's' : ''}`)}`,
    ...(r.first ? [`echo ${shq(firstRunNote(r))}`] : []),
    // an engine that fails does not stop the others (the voices made so far stay; the end says which failed); uv is
    // not quiet: its downloads show (PyTorch is hundreds of MB, GB with CUDA — silent, a first run looked stuck)
    // the exact versions that ran on the project's test machine (scripts/make-offline-tts-locks.py)
    ...(lockText(r) ? [`base64 -d > "$DIR/envs/${engineDir(r)}.lock" <<'SUPERUTILS_LOCK'`, wrap(b64(lockText(r))), 'SUPERUTILS_LOCK'] : [`: > "$DIR/envs/${engineDir(r)}.lock"`]),
    `if ! { envfor ${engineDir(r)} ${pinWords(r.packages).join(' ')} && ${envOf(r).map(([k, v]) => `${k}=${v} `).join('')}"$DIR/envs/${engineDir(r)}/bin/python" "$DIR/driver.py" "$RUN/job.json" ${r.engine} "$RUN"; }; then FAILED="$FAILED, "${shq(r.name)}; fi`,
  ].join('\n')).join('\n');
  const gated = o.gated || [];
  for (const r of gated) if (!REPO.test(r)) throw new Error(`Not a repository: ${r}`);
  const token = gated.length ? `if [ -z "\${HF_TOKEN:-}" ] && [ ! -s "$HF_HOME/token" ]; then
${tokenSteps(gated).map((l) => `  echo ${shq(l)}`).join('\n')}
  read -rsp 'Paste the token here (it is not shown) and press Enter: ' TOKEN; echo
  if [ -z "$TOKEN" ]; then echo 'No token given: run this again when you have one.' >&2; exit 1; fi
  mkdir -p "$HF_HOME"; (umask 077; printf '%s' "$TOKEN" > "$HF_HOME/token"); unset TOKEN
fi
` : '';
  return `#!/usr/bin/env bash
# SuperUtils - offline speech for Linux. Made by ${o.site} on ${o.made}.
# It runs entirely on this computer and keeps everything in one folder (~/SuperUtils-TTS, or $SUPERUTILS_TTS_DIR):
#   bin/uv          uv ${UV.version} (Astral's Python manager, from PyPI, SHA-256 checked); it fetches Python and the engines
#   envs/<engine>/  each engine's Python environment, with its pinned packages
#   models/         the voices you chose, from Hugging Face (fixed revisions)
#   output/<time>/  one WAV and one MP3 per voice
# Run it with:  bash <this file>     Run it again for another text: what is downloaded stays.
# To remove everything, delete the folder.
set -euo pipefail
DIR="\${SUPERUTILS_TTS_DIR:-$HOME/SuperUtils-TTS}"
mkdir -p "$DIR/bin" "$DIR/output" "$DIR/envs"
say() { printf '\\n== %s\\n' "$*"; }
fetch() {
  if command -v curl >/dev/null 2>&1; then curl -fL --retry 3 --progress-bar -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then wget -q --show-progress -O "$2" "$1"
  else echo "Neither curl nor wget is installed: install one of them (sudo apt install curl) and run this again." >&2; exit 1; fi
}
if [ ! -x "$DIR/bin/uv" ]; then
  case "$(uname -m)" in
    x86_64|amd64) URL='${UV.linux.x86_64.url}'; SHA='${UV.linux.x86_64.sha256}' ;;
    aarch64|arm64) URL='${UV.linux.aarch64.url}'; SHA='${UV.linux.aarch64.sha256}' ;;
    *) echo "This computer's processor ($(uname -m)) is not one uv is made for." >&2; exit 1 ;;
  esac
  say 'Downloading uv ${UV.version} (about 18 MB)'
  fetch "$URL" "$DIR/uv.whl"
  if ! echo "$SHA  $DIR/uv.whl" | sha256sum -c --status -; then rm -f "$DIR/uv.whl"; echo "The download of uv is damaged (its SHA-256 does not match); run this again." >&2; exit 1; fi
  if command -v python3 >/dev/null 2>&1; then python3 -c 'import sys, zipfile; open(sys.argv[2], "wb").write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[3]))' "$DIR/uv.whl" "$DIR/bin/uv" '${UV.member.linux}'
  elif command -v unzip >/dev/null 2>&1; then unzip -p "$DIR/uv.whl" '${UV.member.linux}' > "$DIR/bin/uv"
  elif command -v bsdtar >/dev/null 2>&1; then bsdtar -xOf "$DIR/uv.whl" '${UV.member.linux}' > "$DIR/bin/uv"
  else echo "Unpacking uv needs python3, unzip or bsdtar: install one of them (sudo apt install unzip) and run this again." >&2; exit 1; fi
  chmod +x "$DIR/bin/uv"; rm -f "$DIR/uv.whl"
fi
# (settings already made in the environment are kept: UV_PYTHON_PREFERENCE=system uses a Python 3.12 of the system,
# UV_TORCH_BACKEND=cu128 a given CUDA, HF_HUB_DISABLE_XET=0 Hugging Face's faster Xet downloads)
export UV_CACHE_DIR="$DIR/cache/uv" UV_PYTHON_INSTALL_DIR="$DIR/python" UV_NO_CONFIG=1
export UV_PYTHON_PREFERENCE="\${UV_PYTHON_PREFERENCE:-only-managed}" UV_TORCH_BACKEND="\${UV_TORCH_BACKEND:-auto}"
export HF_HOME="$DIR/cache/huggingface" HF_HUB_DISABLE_XET="\${HF_HUB_DISABLE_XET:-1}" HF_HUB_DISABLE_TELEMETRY=1
# One Python environment per engine (envs/<engine>), made the first time with the engine's pinned packages and kept.
# uv pip install picks PyTorch's build for this computer (UV_TORCH_BACKEND=auto: CUDA for the NVIDIA card there is,
# else the processor's — uv run cannot, and gave every Linux computer the 4 GB CUDA build). envs/<engine>.lock holds
# the exact version of every package that ran on SuperUtils' test machine, given to uv as constraints (a new release of
# a library cannot break an engine). New pins or a new lock make the environment again.
envfor() {
  local e="$DIR/envs/$1" lock="$DIR/envs/$1.lock"; shift
  local want="$*"; if [ -s "$lock" ]; then want="$want"$'\\n'"$(cat "$lock")"; fi
  if [ -x "$e/bin/python" ] && [ "$(cat "$e/.pins" 2>/dev/null)" = "$want" ]; then return 0; fi
  echo '  Setting up its Python environment (once)...'
  "$DIR/bin/uv" python find ${PYTHON} >/dev/null 2>&1 || "$DIR/bin/uv" python install ${PYTHON} || return 1
  rm -rf "$e"
  "$DIR/bin/uv" venv --quiet --python ${PYTHON} "$e" || return 1
  if [ -s "$lock" ]; then "$DIR/bin/uv" pip install --python "$e/bin/python" -c "$lock" "$@" || return 1
  else "$DIR/bin/uv" pip install --python "$e/bin/python" "$@" || return 1; fi
  printf '%s' "$want" > "$e/.pins"
}
${token}RUN="$DIR/output/$(date +%Y-%m-%d_%H%M%S)"
mkdir -p "$RUN"
base64 -d > "$DIR/driver.py" <<'SUPERUTILS_DRIVER'
${wrap(b64(o.driver))}
SUPERUTILS_DRIVER
base64 -d > "$RUN/job.json" <<'SUPERUTILS_JOB'
${wrap(b64(JSON.stringify(o.job)))}
SUPERUTILS_JOB
${gated.length ? `say ${shq(`Checking that Hugging Face lets this computer download ${gated.join(', ')}`)}
if ! "$DIR/bin/uv" run --python ${PYTHON} --no-project ${withArgs(CHECK_PINS).join(' ')} python "$DIR/driver.py" "$RUN/job.json" --check-access ${gated.map(shq).join(' ')}; then
  echo 'Nothing else was downloaded. Fix that, then run this again.' >&2; exit 1
fi
` : ''}FAILED=''
${runs}
if command -v xdg-open >/dev/null 2>&1; then xdg-open "$RUN" >/dev/null 2>&1 || true; fi
if [ -n "$FAILED" ]; then echo "Stopped with an error: \${FAILED#, } (the messages above say why). The other voices are in $RUN" >&2; exit 1; fi
say "Done. The speech is in $RUN"
`;
}

/** Windows: a .cmd file that runs the PowerShell under it (a hybrid: "<# :" is a label to cmd and opens a comment
 *  in PowerShell). Windows PowerShell 5.1 is part of Windows 10 and 11; nothing else is needed. ASCII only. */
export function windowsScript(o: ScriptInput): string {
  const ps = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const runs = o.runs.map((r) => [
    `Say ${ps(ascii(`${r.name}: ${r.voices} voice${r.voices > 1 ? 's' : ''}`))}`,
    ...(r.first ? [`Write-Host ${ps(ascii(firstRunNote(r)))}`] : []),
    ...envOf(r).map(([k, v]) => `$env:${k} = ${ps(v)}`),
    `[IO.File]::WriteAllBytes((Join-Path $Dir ${ps(`envs\\${engineDir(r)}.lock`)}), [Convert]::FromBase64String(${ps(b64(lockText(r)))}))`,
    `$py = EnvFor ${ps(engineDir(r))} @(${pinWords(r.packages).join(', ')})`,
    `if ($py) { & $py "$Dir\\driver.py" "$Run\\job.json" ${r.engine} "$Run" }`,
    `if (-not $py -or $LASTEXITCODE -ne 0) { $failed += ${ps(ascii(r.name))} }`,
  ].join('\r\n')).join('\r\n');
  const gated = o.gated || [];
  for (const r of gated) if (!REPO.test(r)) throw new Error(`Not a repository: ${r}`);
  const token = gated.length ? `  $tokenFile = Join-Path $env:HF_HOME 'token'
  if (-not $env:HF_TOKEN -and -not (Test-Path -LiteralPath $tokenFile)) {
${tokenSteps(gated).map((l) => `    Write-Host ${ps(ascii(l))}`).join('\n')}
    $secure = Read-Host -AsSecureString 'Paste the token here (it is not shown) and press Enter'
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
    if (-not $token) { throw 'No token given: run this again when you have one.' }
    New-Item -ItemType Directory -Force -Path $env:HF_HOME | Out-Null
    [IO.File]::WriteAllText($tokenFile, $token.Trim()); Remove-Variable token
  }
` : '';
  const body = `<# : SuperUtils - offline speech for Windows. Made by ${ascii(o.site)} on ${ascii(o.made)}. Double-click this file.
@echo off
setlocal
set "SUPERUTILS_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ([IO.File]::ReadAllText($env:SUPERUTILS_SELF))"
set "SUPERUTILS_RC=%errorlevel%"
echo.
pause
exit /b %SUPERUTILS_RC%
#>
# It runs entirely on this computer and keeps everything in one folder (SuperUtils-TTS in your user folder):
#   bin\\uv.exe      uv ${UV.version} (Astral's Python manager, from PyPI, SHA-256 checked); it fetches Python and the engines
#   envs\\<engine>\\  each engine's Python environment, with its pinned packages
#   models\\         the voices you chose, from Hugging Face (fixed revisions)
#   output\\<time>\\  one WAV and one MP3 per voice
# Run it again for another text: what is downloaded stays. To remove everything, delete the folder.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
function Say($m) { Write-Host ''; Write-Host "== $m" -ForegroundColor Cyan }
try {
  $Dir = if ($env:SUPERUTILS_TTS_DIR) { $env:SUPERUTILS_TTS_DIR } else { Join-Path $env:USERPROFILE 'SuperUtils-TTS' }
  New-Item -ItemType Directory -Force -Path (Join-Path $Dir 'bin'), (Join-Path $Dir 'output'), (Join-Path $Dir 'envs') | Out-Null
  $uv = Join-Path $Dir 'bin\\uv.exe'
  if (-not (Test-Path -LiteralPath $uv)) {
    if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { $url = ${ps(UV.windows.ARM64.url)}; $sha = ${ps(UV.windows.ARM64.sha256)} }
    else { $url = ${ps(UV.windows.AMD64.url)}; $sha = ${ps(UV.windows.AMD64.sha256)} }
    Say 'Downloading uv ${UV.version} (about 16 MB)'
    $whl = Join-Path $Dir 'uv.whl'
    Invoke-WebRequest -Uri $url -OutFile $whl -UseBasicParsing
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $whl).Hash -ne $sha) { Remove-Item -LiteralPath $whl; throw 'The download of uv is damaged (its SHA-256 does not match); run this again.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $z = [IO.Compression.ZipFile]::OpenRead($whl)
    try { $e = $z.Entries | Where-Object { $_.FullName -eq ${ps(UV.member.windows)} }; [IO.Compression.ZipFileExtensions]::ExtractToFile($e, $uv, $true) } finally { $z.Dispose() }
    Remove-Item -LiteralPath $whl
  }
  $env:UV_CACHE_DIR = Join-Path $Dir 'cache\\uv'; $env:UV_PYTHON_INSTALL_DIR = Join-Path $Dir 'python'; $env:UV_NO_CONFIG = '1'
  if (-not $env:UV_PYTHON_PREFERENCE) { $env:UV_PYTHON_PREFERENCE = 'only-managed' }
  if (-not $env:UV_TORCH_BACKEND) { $env:UV_TORCH_BACKEND = 'auto' }
  if (-not $env:HF_HUB_DISABLE_XET) { $env:HF_HUB_DISABLE_XET = '1' }
  $env:HF_HOME = Join-Path $Dir 'cache\\huggingface'; $env:HF_HUB_DISABLE_TELEMETRY = '1'; $env:PYTHONUTF8 = '1'
  # One Python environment per engine (envs\\<engine>), made the first time with the engine's pinned packages and kept.
  # uv pip install picks PyTorch's build for this computer (UV_TORCH_BACKEND=auto: CUDA for the NVIDIA card there is,
  # else the processor's - uv run cannot). envs\\<engine>.lock holds the exact version of every package that ran on
  # SuperUtils' test machine, given to uv as constraints. New pins or a new lock make it again. uv's own lines go to the
  # screen, not into $py.
  function EnvFor($name, [string[]]$pins) {
    $e = Join-Path $Dir ('envs\\' + $name); $py = Join-Path $e 'Scripts\\python.exe'; $mark = Join-Path $e '.pins'
    $lock = Join-Path $Dir ('envs\\' + $name + '.lock'); $want = ($pins -join ' ') + "\`n" + [IO.File]::ReadAllText($lock)
    if ((Test-Path -LiteralPath $py) -and (Test-Path -LiteralPath $mark) -and ([IO.File]::ReadAllText($mark) -eq $want)) { return $py }
    Write-Host '  Setting up its Python environment (once)...'
    # Python first, with its download shown (uv venv is quiet); "not found" from uv is no error here
    $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    & $uv python find ${PYTHON} *> $null; $have = $LASTEXITCODE -eq 0
    $ErrorActionPreference = $eap
    if (-not $have) { & $uv python install ${PYTHON} | Out-Host; if ($LASTEXITCODE -ne 0) { return $null } }
    if (Test-Path -LiteralPath $e) { Remove-Item -LiteralPath $e -Recurse -Force }
    & $uv venv --quiet --python ${PYTHON} $e | Out-Host
    if ($LASTEXITCODE -ne 0) { return $null }
    if ((Get-Item -LiteralPath $lock).Length -gt 0) { & $uv pip install --python $py -c $lock @pins | Out-Host } else { & $uv pip install --python $py @pins | Out-Host }
    if ($LASTEXITCODE -ne 0) { return $null }
    [IO.File]::WriteAllText($mark, $want)
    return $py
  }
${token}  $Run = Join-Path $Dir ('output\\' + (Get-Date -Format 'yyyy-MM-dd_HHmmss'))
  New-Item -ItemType Directory -Force -Path $Run | Out-Null
  [IO.File]::WriteAllBytes((Join-Path $Dir 'driver.py'), [Convert]::FromBase64String(${ps(b64(o.driver))}))
  [IO.File]::WriteAllBytes((Join-Path $Run 'job.json'), [Convert]::FromBase64String(${ps(b64(JSON.stringify(o.job)))}))
${gated.length ? `  Say ${ps(ascii(`Checking that Hugging Face lets this computer download ${gated.join(', ')}`))}
  & $uv run --python ${PYTHON} --no-project ${withArgs(CHECK_PINS).join(' ')} python "$Dir\\driver.py" "$Run\\job.json" --check-access ${gated.map(ps).join(' ')}
  if ($LASTEXITCODE -ne 0) { throw 'Hugging Face refused the download (the message above says why and what to do). Nothing else was downloaded; run this again when it is fixed.' }
` : ''}  $failed = @()
${runs.split('\r\n').map((l) => `  ${l}`).join('\r\n')}
  try { Invoke-Item -LiteralPath $Run } catch { }
  if ($failed.Count) { throw ('Stopped with an error: ' + ($failed -join ', ') + ' (the messages above say why). The other voices are in ' + $Run) }
  Say "Done. The speech is in $Run"
} catch {
  Write-Host ''
  Write-Host ("It stopped: " + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
`;
  return body.replace(/\r?\n/g, '\r\n');
}

/** A single-quoted shell word. */
function shq(s: string): string { return `'${s.replace(/'/g, `'\\''`)}'`; }
