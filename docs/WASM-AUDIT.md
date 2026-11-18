# WebAssembly audit — can an existing module replace one we wrote?

**Owner, 18 Nov 2026:** "for all the apps that you've done a bug hunt for up till now, that is the 51 of them, see if
you can replace the handwritten WebAssembly ones with already existing WebAssembly modules out there, but only if the
WebAssembly modules out there fit all the requirements that I've asked you for. … if you do replace handwritten
WebAssembly modules with existing WebAssembly modules, don't forget to run those test cases again."

**Owner, 18 Nov 2026 (later):** "When you continue the bug hunt from the 52nd app onwards, first see if any WebAssembly
module that you wrote can be replaced by an existing one out there using the rules that you mentioned, and then find
bugs and then write extensive test cases, solve the bugs as you've been doing, and then move on to the next app."

So this file has two parts: the audit of the first 51 tabs (done), and a running log for every tab after them (one
entry per tab, written **before** its bug hunt starts).

## The rule being applied (STANDING RULE #1, CLAUDE.md — as it stands after the owner's tweak)
1. An existing, tried-and-tested, well-known WebAssembly module. If it covers everything asked for the utility: use
   it. **If it covers only part: still use it for that part**, and add the missing features beside it — (a) a
   supplementary WebAssembly module of our own, (b) an existing JS / TS library, (c) our own JS / TS. The hard
   requirements (hosted in the app, no CDN, no run-time downloads from elsewhere, data stays on the device, lazy per
   tab, an open-source licence) are not "features": a module that breaks one is not used.
2. No such module at all: our own WebAssembly module from open-source code.
3. Not doable: an existing JavaScript / TypeScript library, with the reason in CLAUDE.md §3a; our own JS / TS last.
The first audit below was made under the morning's wording ("use it only if it satisfies all"); the **second pass**
further down applies the tweak.

## How candidates were found and judged
- **Search:** the npm registry's search API per topic (`<topic> wasm`, `<topic> webassembly`, `<topic> rust`), kept
  only packages whose own name / description / keywords mention both the topic and WebAssembly, with their monthly
  downloads, version and date (18 Nov 2026); plus the upstream projects' own builds where one is known.
- **"Tried and tested, famous":** wide use (hundreds of thousands of downloads a month or the upstream project's own
  build), a history of releases, a stable version. A package with a few hundred downloads, a 0.0.x version or a few
  weeks of history does not count — it is somebody else's handwritten glue, no better known than ours.
- **Test:** a candidate that passed that bar was installed in a scratch folder and run against the tab's own reference
  cases (the same ones our module must pass) or a list of the tab's requirements. One failed requirement = not used.

## Result for the first 51 tabs

**First audit (rule as it stood that morning: "only if it satisfies all"): one module replaced, 50 tabs keep their
engine.** Replaced: the HMAC Generator's engine (our Rust glue in keys.wasm → `hash-wasm`). **The second pass further
down, made after the owner's tweak, moved two more tabs (TOTP, Password Hash) onto hash-wasm.** The table lists every tab; "—" under candidate means the search found no WebAssembly
package for the job at all.

### Tabs whose engine is a WebAssembly module we built

| Tab | Our module | Existing candidate (monthly downloads) | What happened when it was checked | Decision |
|---|---|---|---|---|
| `hmac` | keys.wasm (RustCrypto hmac + our streaming glue) | **hash-wasm 4.13.0** (10.8 M; MIT; C → wasm, embedded, no eval) | All eight algorithms, streaming, key and message of any length: equal to OpenSSL in 6,272 combinations and to the RFC 2104 / 2202 / 4231 vectors; bundled into a 57 KB chunk, nothing fetched at run time | **Replaced** (commit "HMAC Generator: engine replaced by hash-wasm"). Re-run: unit hmac 48 + keys 174, e2e hmac 30, totp 49, pwhash 31, sshkey 34, apikey 26, lazy 549, shell 63, no-external 43 |
| `pwhash` | keys.wasm (argon2, bcrypt, pbkdf2, scrypt + PHC strings) | hash-wasm 4.13.0 | Argon2 and bcrypt give encoded hashes and can verify; **scrypt and PBKDF2 return a bare digest**: no PHC string, no verification of a pasted hash (the tab must make and check `$scrypt$…`, `$pbkdf2-sha256$…`, and PBKDF2-SHA1 hashes made elsewhere), no worded refusals for parameters a tab cannot run | ~~Keep ours~~ → **second pass: hash-wasm + our supplement** (below) |
| `totp` | keys.wasm (HOTP / TOTP, lenient Base32, otpauth) | @xet/totp-wasm (67) | Not established; hash-wasm has no Base32 or OTP | ~~Keep ours~~ → **second pass: hash-wasm's HMAC + our supplement** (below) |
| `sshkey` | keys.wasm (ssh-key crate + our OpenSSH wire reader) | ssh-keygen-wasm (112; Go), @ai-ecoverse/wasix-openssh (4,845; needs the WASIX runtime) | Not established; neither inspects pasted keys | Keep ours |
| `apikey` | keys.wasm | — | — | Keep ours |
| `jq` | jq.wasm (jq 1.8.2 + oniguruma, built by us) | **jq-wasm 3.0.0-jq-1.8.2** (678 k) | 4,841 of our 4,903 reference cases equal to the native jq; fails: `strflocaltime` ("unknown system failure"), `mktime` wrong outside the 32-bit range, a made-up environment (`env.HOME` = /home/web_user), no way to stop an endless filter or cap its output | Keep ours. Found on the way: our build shows local time as UTC (`localtime`, `strflocaltime`) — to fix with the host time-zone support CPython got |
| `python` | python.wasm (CPython 3.14.8 built by us) | **Pyodide 314.0.8** (3.47 M; CPython 3.14.2) | 41 of 50 reference programs equal to native CPython; fails: zoneinfo (no tzdata without a run-time download), `hashlib.pbkdf2_hmac`, shelve / dbm, help topics, local zone names ("UTC+0530"), `asyncio.run` without JSPI, and a **fatal "Maximum call stack size exceeded"** on `@cache fib(900)` and deeply nested calls (ours ends in Python's own RecursionError); ~1.8 s per fresh interpreter | Keep ours |
| `xml` | devcore-xml.wasm (our formatter: re-indents only element-only content, everything else byte for byte) | **libxml2-wasm 0.7.2** (1.77 M), **xmllint-wasm 5.3.0** (3.28 M; the same libxml2 serialiser), sax-wasm 3.3.0 (525 k; a tokeniser, no formatter) | libxml2 adds a declaration, lower-cases the encoding name, rewrites quotes, turns `<b></b>` into `<b/>` and expands character references — the tab's rule is "leave everything else as typed" | Keep ours |
| `json`, `jwt` | devcore-json.wasm (our lossless reader / formatter) | @dprint/json 0.26.0 (253 k), @wasm-fmt/clang-format 23.1.1 (157 k), @biomejs/wasm-web (70 MB) | dprint accepts comments, trailing commas, NaN and single quotes (the tab accepts exactly JSON), has no minify, no sort keys, no note about duplicate keys, no worded error with line / column; clang-format and Biome have the same gaps | Keep ours |
| `svgo` | svgo.wasm (OXVG 0.0.9 + our safe preset and picture check) | @oxvg/wasm 0.0.9 (751) | The same source we build; not established; without our safe preset its "safe" jobs change pictures (hazard drawings in `tests/fixtures/svg/hazards.json`) | Keep ours |
| `pwstrength` | zxcvbn.wasm (zxcvbn-rs 3.1.1 + four fixes) | @lychee-org/zxcvbn-wasm 1.0.1 (2,777) | Not established; plain bindings to the same crate without the four fixes that make it agree with the reference implementation on our 304 passwords | Keep ours |
| `yaml` | formats-yaml.wasm (serde_yaml_ng + toml) | yq.rs 0.1.4 (70.9 k; first release Oct 2026), @dprint/toml 0.10.0 (1.25 M), @tombi-toml/wasm-lib (82.8 k), @shopify/toml-patch (115 k), @taplo/lib | yq.rs: YAML and JSON only ("TOML … unavailable"), a month old; the TOML packages are formatters / linters / in-place editors — none converts YAML ⇄ JSON ⇄ TOML | Keep ours |
| `jsonschema` | formats-schema.wasm (jsonschema crate + our inference) | — (validators on npm are JavaScript: Ajv, @cfworker/json-schema) | — | Keep ours |
| `json2types` | devcore-j2t.wasm | quickertype-core 0.3.0 (329) | Not established | Keep ours |
| `jsondiff` | devcore-jsondiff.wasm | — | — | Keep ours |
| `cron` | devcore-cron.wasm (croner + chrono) | cron-js-wasm 0.1.0 (229) | Not established | Keep ours |
| `baseenc`, `base64` | devcore-enc.wasm | @litert/base32 2.0.0 (853), @hazae41/base58.wasm 1.0.8 (161) | Not established; one alphabet each | Keep ours |
| `bindecode` | devcore-bin.wasm (our protobuf / MessagePack / CBOR readers) | @cratestack/cbor-web 0.20.4 (8,045) | A CBOR codec for one RPC framework; no MessagePack / protobuf, no annotated dump | Keep ours |
| `cidr`, `x509`, `semver`, `glob`, `patch`, `hexview` | devcore-`<tab>`.wasm | — (JavaScript only: ip-cidr, PKI.js / @peculiar/x509, semver, minimatch / picomatch, diff; `@vscode/diff` computes diffs, it does not apply patches) | — | Keep ours |
| `uuid`, `mockdata` | crypto.wasm (libsodium + our CSPRNG helpers, UUID v4 / v7) | — | — | Keep ours |
| `color`, `contrast`, `gradient` | mathcore.wasm (`m_color`) | lcms-wasm 1.0.5 (184 k) | ICC colour management, not CSS colour syntax / OKLCH gamut mapping / WCAG contrast | Keep ours |

### Tabs whose engine is the browser's own compiled code or a JavaScript library

| Tab | Engine | Existing WebAssembly candidate | Why it is not used |
|---|---|---|---|
| `regex` | the browser's RegExp (compiled C++), in a worker | re2-wasm 1.0.2 (2.69 M), @shikijs/engine-oniguruma, rregex 1.13.5 (12.5 k) | The tab tests **JavaScript** regular expressions as the browser runs them; RE2, Oniguruma and Rust's regex are other dialects (RE2 and Rust: no look-behind, no back-references) |
| `mermaid` | Mermaid 12 (JavaScript, the reference implementation) | **Merman** (`@mermanjs/web` 0.10.0, 84.5 k; a Rust re-implementation, first alpha June 2026) | See "For the owner" below |
| `mdtable` | TypeScript layout + sheet.wasm for CSV | markdown-table-formatter 2.1.0 (180 k; MIT; Rust → wasm, 68 KB) | Its engine pads by display width as we do (CJK, emoji, flags checked), but the package is a Node command-line tool (`fs`, Node ≥ 22.17): a browser would have to load its internal `.wasm` through an undocumented interface that may change with any release. The tab's layout is output formatting (padding strings), which CLAUDE.md §7 leaves to TypeScript |
| `curl` | `src/lib/curl.ts` | wasm builds of curl itself (@ai-ecoverse/wasm-curl) | They are the program, not a "command line → code" converter. A Rust port is item 1 of `todo.md` |
| `urlenc`, `epoch`, `escape`, `unicode`, `logview`, `chmod`, `ieee754`, `bitwise`, `sla`, `transfer`, `httpstatus`, `mime`, `ports`, `ascii`, `keycode`, `shadow` | browser-native (URL, TextDecoder, Intl, Date, BigInt, DataView) + string formatting and single-step arithmetic in TypeScript | — | Nothing to replace: no handwritten WebAssembly, and no WebAssembly package exists for these jobs |

Count check: 31 tabs in the first table and 20 in the second = 51.

### Mermaid Diagrams → Merman? (decided for now: no — the owner left such calls to Claude's judgement)
**The candidate:** Merman is a Rust re-implementation of Mermaid compiled to WebAssembly
(`@mermanjs/web` 0.10.0, MIT / Apache-2.0, targets Mermaid 12.3). Checked on 18 Nov 2026 with its Node build: all
seven samples of the tab and 13 further diagram types rendered, quickly (2–300 ms). Against it:
- it is **five months old** (first alpha June 2026, version 0.10) — not yet "tried and tested";
- it is a re-implementation: Mermaid itself is what GitHub, GitLab and others run, so a preview made by another
  engine can differ from what those sites will draw;
- size: about **19 MB** unpacked for the browser package against 2.2 MB that the tab loads today;
- syntax errors come without a line ("Unexpected character at 24" against Mermaid's "Parse error on line 3"), and
  its documentation leaves making the SVG safe for the page to the host (Mermaid's `securityLevel: 'strict'` does it).
Decision: keep Mermaid for now and look again when Merman reaches 1.0 (the owner can overrule this with a word; the
switch would re-run the tab's suite).

## Second pass — the owner's tweak of 18 Nov 2026

**Owner:** "if the existing wasm module out there already exists but does not cover all the features i ask for in a
utility, then still use that, but use the remaining 2 points in the rule for the additional features not covered in
the existing wasm, as in a) build out an additional supplementary wasm module for the extra missing features b) use
existing JS/TS c) build your own js/ts … do another pass for all the existing 52 apps first and for the remaining
apps." And: "use your best judgement.. but always try to do wasm-first in any case".

The first audit above asked "does the module satisfy everything?". This pass asks "does it cover part, and can the
rest be added beside it?". How the line is drawn (Claude's judgement, as the owner allowed): a module that **lacks a
feature** is used and supplemented; a module that gives **wrong results or crashes** on something the tab needs,
inside itself where nothing beside it can reach, is not — the tab keeps a WebAssembly engine of ours.

### What changed in the 52 tabs
| Tab | Before | Now | Supplement for what the module lacks | Tests re-run |
|---|---|---|---|---|
| `hmac` | keys.wasm (ours) | **hash-wasm** (all of it) | — | unit hmac 48; e2e hmac 30 |
| `totp` | keys.wasm (ours) | **hash-wasm** for the HMAC (SHA-1 / 256 / 512) | (a) our keys.wasm: lenient Base32 secrets, counters, RFC 4226 truncation | unit totp 36 (RFC 4226 / 6238 + 600 random cases against an independent implementation); e2e totp 49 |
| `pwhash` | keys.wasm (ours: RustCrypto argon2, bcrypt, scrypt, pbkdf2) | **hash-wasm** for Argon2id / i / d, bcrypt, scrypt, PBKDF2 — hashing and checking | (a) our keys.wasm: checked parameters with worded refusals, random salts, PHC strings for scrypt and PBKDF2 (hash-wasm gives bare digests), the reader of pasted hashes, Argon2 version 1.0 hashes (hash-wasm reads only 1.3) | unit pwhash 92 (Argon2 reference vectors incl. 1.0, Openwall bcrypt, RFC 6070, RFC 7914, 48 OpenSSL-made hashes); e2e pwhash 31 (argon2-cffi, bcrypt, hashlib) |
| `sqlite` (tab 52) | official SQLite wasm | unchanged — already the upstream project's own build | (a) sheet.wasm (ours) for CSV import / export; TypeScript around SQLite's own API | (the tab's hunt is in progress) |

keys.wasm lost its bcrypt, scrypt, pbkdf2, hmac and sha3 crates (0.38 → 0.31 MB) and is now only the supplement
plus the OpenSSH and API-key code, for which no WebAssembly module exists.

### Re-checked under the tweak and kept — with the evidence
| Tab | Existing module | Why it is a fault inside the module, not a missing feature |
|---|---|---|
| `jq` | jq-wasm 3.0.0 (678 k) | On 72 date / environment filters run in two time zones it differs from the native jq 1.8.2 on 10–11: **every `strftime` / `strflocaltime` with `%Z` ends in "unknown system failure"**, `%z` prints `+0000` in local time, `strptime` and far-past dates give other numbers, `$ENV` is a made-up Emscripten environment. These are built-in functions of the jq language: a module beside it cannot answer for them — only a second complete jq could, which is what we have. Our build now passes 891 local-time cases against the native jq in 27 zones (it answered in UTC before; found by this audit) |
| `python` | Pyodide 314.0.8 (3.47 M) | Missing parts could be supplied (its own tzdata, hashlib and pydoc packages hosted here, a dbm module). What cannot: **a fatal "Maximum call stack size exceeded" that kills the interpreter** on `@cache fib(900)` and on nested `__repr__` / `__eq__` / json / pickle / sorted(key=…) calls — programs that run on a desktop and end in a clean RecursionError in our build — and C-library zone names ("UTC+0530" where CPython says "IST"). Memoised recursion is in every tutorial; a tab that dies on it is a step back from the 18 bugs fixed in the hunt |
| `curl` | curlconverter 4.12.0 (241 k; its shell parser is tree-sitter-bash compiled to WebAssembly) | Run through the tab's own acceptance test (35 commands, the real curl as ground truth, the generated programs executed against a local server): **Node 25 / 35, Python 25 / 35, Go 7 / 12**. Wrong, not missing: JSON bodies re-serialised (other bytes than curl sends), `12345678901234567890` rounded to `…67000`, `-d @file` sent with its line ends or as the literal text "@body.json", `--data-urlencode name@file` sent empty, non-ASCII `-u` crashes the generated program; and no Windows cmd syntax ("Copy as cURL (cmd)") at all. Using only its parser would add 1.55 MB for a syntax tree whose words our code would still have to evaluate, next to our own splitter that must stay for cmd. The WebAssembly route for this tab is a Rust port of `src/lib/curl.ts` — item 1 of `todo.md`, for the owner to pick |
| `xml` | libxml2-wasm 0.7.2 (1.77 M), xmllint-wasm 5.3.0 (3.28 M) | The tab already parses and runs XPath with libxml2 — Chrome's own XML parser is libxml2, native and with nothing to download. What a WebAssembly copy would add is its serialiser, which rewrites what the tab must leave as typed (adds a declaration, lower-cases the encoding, changes quotes, `<b></b>` → `<b/>`, expands `&#169;`): the losses the hunt fixed. Formatting cannot be half libxml2 and half ours |
| `json`, `jwt` | @dprint/json 0.26.0 (253 k) | It is a code-style formatter, not a pretty-printer: `{"a":1,"b":[1,2,3]}` comes back on one line (`{ "a": 1, "b": [1, 2, 3] }`), comments and trailing commas are accepted and kept, `'a'` and `NaN` pass. The tab's core — expand / minify strict JSON — is not in it |
| `mdtable` | markdown-table-formatter 2.1.0 (180 k) | Its WebAssembly engine was first published on **1 Nov 2026** (versions 1.x were JavaScript) — 17 days old, and packaged as a Node command-line tool. Not tried and tested yet; look again later |
| `mermaid` | Merman 0.10.0 (84.5 k) | Five months old, a re-implementation, about 19 MB (see above). Mermaid 12 stays; look again at Merman 1.0 |
| `svgo`, `pwstrength`, `json2types`, `cron`, `baseenc`, `bindecode`, `yaml`, … | packages with 100–3,000 downloads a month, or none | Not established modules (rule step 1 needs a tried-and-tested one); several are plain bindings to the very crates we build |

## Candidates for the tabs still to be hunted (survey of 18 Nov 2026)
Checked one by one when each tab is reached — module first, then bugs, tests, fixes. Monthly downloads in brackets.
| Tab(s) | Ours today | Existing module(s) to try first |
|---|---|---|
| `graphviz` | graphviz.wasm (our build of Graphviz 14.1.2) | **@viz-js/viz 3.31.0** (1.79 M), **@hpcc-js/wasm-graphviz 1.30.0** (1.36 M) |
| `hash` | crypto.wasm (own MD5 / SHA-1 / SHA-3 / CRC-32 + libsodium) | **hash-wasm** (already in the app: MD5, SHA-1, SHA-2, SHA-3, BLAKE2b, CRC-32, streaming) |
| `sodium`, `sharelink`, `password`, `passphrase`, random tools | crypto.wasm (libsodium 1.0.20 built by us) | **libsodium-wrappers / -sumo** (the libsodium project's own WebAssembly build) |
| `audio`, `tts`, `stt`, `noise`, `pitch` (MP3 output) | audio.wasm (LAME 4.0 built by us) | **@mediabunny/mp3-encoder 1.66.0** (10.4 M; LAME, from the muxer project already in the app) |
| `noise` | rnnoise.wasm (RNNoise 0.2 built by us) | **@jitsi/rnnoise-wasm 0.2.1** (304 k), @shiguredo/rnnoise-wasm (105 k) |
| `pitch` | audio.wasm (own WSOLA) | **signalsmith-stretch 1.3.2** (229 k; MIT), rubberband-wasm 3.3.0 (16.6 k; GPL) |
| `tts` (phonemes) | espeak.wasm (eSpeak NG 1.52 built by us) | espeak-ng 1.0.2 (32 k), the phonemizer package kokoro-js uses |
| `stt` | whisper.wasm (whisper.cpp 1.8.3 built by us) | Whisper on ONNX Runtime (already in the app) through transformers.js; sherpa-onnx 2.0.1 (422 k) |
| `video`, `slideshow`, `screencast` (AAC where the browser has no encoder) | — (Opus is used instead) | **@mediabunny/aac-encoder 1.66.0** (10.7 M) |
| `diff` | textcore.wasm (own Myers) | **@vscode/diff** 0.0.2-0 (622 k; VS Code's algorithm) |
| `zip` | zip.js (JavaScript) | **7z-wasm 1.2.0** (360 k; 7-Zip itself, writes AES-256), libarchive.js 2.0.2 (already in the app for extraction; now also creates) |
| `prettier` | Prettier (JavaScript) | @biomejs/wasm-web (Prettier-compatible for JS / TS / JSON / CSS), dprint plugins (@dprint/typescript 474 k, @dprint/markdown 1.31 M, @dprint/toml 1.25 M) — the rest stays with Prettier |
| `image`, `batch`, `formphoto`, … (resize, filters) | imgproc.wasm (own C) | @jsquash/resize (same family as our codecs), wasm-vips, @imagemagick/magick-wasm |
| `scanner` | imgproc.wasm (own page detection + warp) | scanic 1.8.0 (144 k), OpenCV builds |
| `exif` | metacore.wasm (own C) | @uswriting/exiftool 1.0.9 (27.8 k; ExifTool) |
| `sheet` | sheet.wasm (calamine + rust_xlsxwriter built by us) | @ironcalc/wasm-xlsx 0.9.1 (96 k) |
| `markdown` | markdown.wasm (cmark-gfm built by us) | gfm-wasm 1.0.1 (1.5 k; cmark-gfm) — not established; md4c / Discord builds are other dialects |
| `sqlfmt` | devcore-sqlfmt.wasm (sqlformat crate built by us) | none found (sql-formatter is JavaScript) |
| `terminal`, `bc` console | busybox.wasm (BusyBox 1.38 built by us) | none found (coreutils builds for the WASIX runtime only) |
| `pgp` | OpenPGP.js (JavaScript) | none found |
| `calc`, calculators, Math & Science | mathcore.wasm (own C) | none found |
| already existing modules, to keep current | MuPDF, SQLite, ONNX Runtime, MediaPipe, jSquash, libheif-js, tesseract.js-core, zxing-wasm, libarchive.js, ffmpeg.wasm, hash-wasm | — |

## Log for tabs after the first 51
One entry per tab, written before its bug hunt: our module → candidates → check → decision.

### 52. `sqlite` — SQLite Playground (18 Nov 2026)
- **Engine today:** the SQLite project's own WebAssembly build (`@sqlite.org/sqlite-wasm` 3.54) — already rule step 1.
- **Our parts beside it:** `src/lib/sqlite-engine.ts` (TypeScript calling SQLite's C API: it is the glue the official
  build expects its users to write) and **sheet.wasm** (ours) for reading CSV / workbooks and writing CSV.
- **Could an existing module replace a part of ours?** CSV: SQLite's own CSV virtual table is not in the official
  build; no established CSV WebAssembly package turned up (search of 18 Nov: @nteract/sift-csv 11 k, a parser for
  one product). Workbooks: see the `sheet` tab's entry when it is reached (@ironcalc/wasm-xlsx to try).
- **Decision:** nothing to replace. Hunt: 22 bugs, unit 0 → 106 (native SQLite as reference), e2e 14 → 63.

*(further entries follow as the hunt goes on)*
