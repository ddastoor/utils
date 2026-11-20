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
| `graphviz` | graphviz.wasm (our build of Graphviz 14.1.2) → **done, entry 55: own build kept, now Graphviz 16.1.0** | **@viz-js/viz 3.31.0** (1.79 M), **@hpcc-js/wasm-graphviz 1.30.0** (1.36 M) — both trap on valid graphs |
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
| `sqlfmt` | devcore-sqlfmt.wasm (sqlformat crate built by us) | none found (sql-formatter is JavaScript) — **done: see entry 53** |
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

### 53. `sqlfmt` — SQL Formatter (18–19 Nov 2026)
- **Engine before:** devcore-sqlfmt.wasm = the `sqlformat` crate 0.5.0 (its latest), built by us.
- **Is there an existing, tried-and-tested WebAssembly SQL formatter?** No. Search of the npm registry (18 Nov 2026,
  "sql format wasm", by monthly downloads): `@wasm-fmt/sql_fmt` (9 k) and `@dprint/sql` (1.3 k) are builds of **the
  same sqlformat crate**; `syntaqlite` (10.9 k) formats SQLite only; `sql-formatter` (the well-known one, millions) is
  JavaScript; `pg-query-emscripten` / `libpg-query` parse PostgreSQL only and print it back without its comments.
- **Check of the crate against what the tab is for** (a 141-statement corpus in five dialects,
  `tests/fixtures/sqlfmt/corpus.json`; native SQLite, sqlglot and sqlparse as readers): it **changes what the SQL
  means** — in one-line mode everything after a `--` / `#` comment ends up inside the comment; `[bracket names]`
  are broken up and the words inside upper-cased; `0x1F` → `0 x1F`, `1_000` → `1 _000`, `1E+2` split; `'\'` is
  read as an unfinished string, so later strings are rewritten; dollar-quoted text is reformatted; `@@trancount` →
  `@@ trancount`; `#temp` and PostgreSQL's `#>` start a "comment"; 45 of 155 everyday column names (status, type,
  key, level, date …) are upper-cased; 49 of 564 results change again when formatted again. These faults are inside
  its tokenizer: nothing placed beside it can put them right (the rule's "defect, not a missing feature" case).
- **Decision:** rule step 2 — an engine of our own: `wasm/devcore/src/sqlfmt.rs` (Rust, 1,500 lines, no crate beside
  serde_json; the module went from 222 KB to 215 KB). It is built around the one thing a formatter may do — change
  white space and the case of keywords — and proves it on every run (the result is tokenized again and compared).
  Using the crate "for what it covers" with a supplement beside it (the owner's tweak) was considered: what it
  covers correctly cannot be told from what it does not without doing the whole job again.
- **Hunt:** 24 faults gone (list in `docs/BUGHUNT.md`); unit 2 → 113, e2e 14 → 49. Re-run after the replacement:
  the tab's suites, `devcore`, `lazy`, `shell`, `every-tab`, `no-external`.

### 54. `prettier` — Code Formatter (19 Nov 2026)
- **Engine before:** Prettier 3 standalone — JavaScript — for all ten languages of the tab (JS / JSX, TypeScript, CSS,
  SCSS, HTML, JSON, YAML, Markdown, GraphQL, Vue). No WebAssembly module of ours was involved; the question here was
  STANDING RULE #1 itself: is there an existing, tried-and-tested WebAssembly formatter?
- **Candidates** (npm registry, 19 Nov 2026, downloads a month): **Biome's official build** `@biomejs/wasm-web` 2.6.8
  (75 k; its Node sibling is what `@biomejs/js-api` runs, 3.3 M; MIT / Apache-2.0; one module for every language,
  **70 MB, 18 MB compressed**); the **dprint plugins** — the engines of `deno fmt`, published as WebAssembly because
  that is how dprint runs them: `@dprint/typescript` (503 k, 4.9 MB), `@dprint/json` (0.66 MB), `@dprint/markdown`
  (1.4 M), `dprint-plugin-markup` (markup_fmt: HTML, Vue; 126 k, 2.0 MB), `dprint-plugin-malva` (CSS, SCSS),
  `dprint-plugin-yaml`, `dprint-plugin-graphql`; host `@dprint/formatter` (1.5 M). Looked at and set aside:
  `@wasm-fmt/biome_fmt` (a third party's build of Biome's formatter, 2.5 k a month — not widely used); oxfmt has no
  WebAssembly package; Prettier itself has none.
- **How they were judged.** A formatter may change the layout and nothing else, so every result is read again by a
  parser that belongs to none of the formatters (`tests/lib/codefmt-check.mjs`: TypeScript 5.9's parser, PostCSS,
  eemeli's yaml, marked, parse5, graphql-js, the Vue compiler; JSON by its tokens as typed) and compared with the
  original. Input: 140 hazard sections (`tests/fixtures/codefmt/`) × 8 settings of the tab's options, and real files
  from this machine (the repository, node_modules, the Rust registry, Python, Ruby, the gcloud SDK; for Vue the
  sources of PrimeVue and Element). "Refuses" = the formatter reports a syntax error for text Prettier formats.
  Prettier is in every table as the yardstick — it is not free of faults either.

  | Language | Files | Prettier (JS) | Biome (wasm) | dprint plugin (wasm) |
  |---|---|---|---|---|
  | JS / JSX / TS / TSX | 423 files, 232 hazard cases | same program everywhere | **same program everywhere**, stable, 397 of 423 files byte-identical to Prettier | prints `for (var i = (0 in []); ;)` without its brackets (**no longer JavaScript**); adds braces, turns `<const>x` into `x as const`; 66 of 423 results change when formatted again |
  | JSON | 595 files, 136 cases | respells numbers (`1.50` → `1.5`, `1E+10` → `1e10`, `1e-07` → `1e-7`): 3 files | the same respelling | **every token as typed**, stable, nothing refused |
  | CSS | 313 files, 128 cases | adds a `;` inside `--x: {a:b}`; 7 cases not stable | **no change of meaning**, stable; refuses `--x: [1,2,3]`, `--x: {a:b}` and old IE hacks (2 files) | drops brackets inside `calc( )`, lower-cases element names; refuses the hacks |
  | SCSS | 88 cases (13 files) | clean | **clean**, stable | clean; 9 cases not stable |
  | YAML | 654 files, 112 cases | clean | **clean**, 648 of 654 byte-identical to Prettier; refuses a flow sequence written over several lines (4 files) | **changes data**: a `\|+` scalar loses blank lines, tagged values are regrouped (5 files) |
  | GraphQL | 88 cases | clean | **clean**, stable | clean; 8 cases not stable |
  | Markdown | 600 files, 144 cases | 2 files render differently (a list followed by a line of one space; tabs in a list's code) | **11 files**: a fenced block in a tight list makes the list loose, list nesting and code indentation change | **54 files**: blank lines and leading spaces inside code blocks are dropped |
  | HTML | 316 files, 128 cases | clean; refuses unknown entities and some omitted end tags | **adds white space that shows** between `</label>` and `<input>`, `<img>` and `<a>` (also in its strict mode); refuses 22 files | markup plugin: **clean**, stable; refuses omitted end tags (`<li>a<li>b`, 14 files) |
  | Vue | 421 files, 64 cases | clean, but with "no semicolons" it writes `@click="a = 1⏎ b()"`, which Vue cannot compile | support is behind `experimentalFullSupportEnabled`; adds white space between two `{{ }}` (1 file), refuses 14 files and Less, leaves SCSS blocks as they are | markup plugin: **clean** on all 421, nothing refused; re-flows a `lang="pug"` template (ruins it) |
- **Decision — an existing WebAssembly module for nine of the ten languages:**
  - **JS / JSX, TypeScript / TSX, CSS, SCSS, YAML, GraphQL → Biome's official build.** Nothing it printed in these
    languages meant anything else than the input, and its results are the closest to what the tab gave before.
  - **JSON → `@dprint/json`**: the one formatter of the three that leaves every number as it was typed (the JSON
    Formatter tab makes the same promise), and a JSON file no longer needs the 70 MB module.
  - **HTML, Vue → `dprint-plugin-markup`** for the markup, and what stands inside it — scripts, styles, the
    expressions of a Vue template, JSON blocks — is handed to Biome and `@dprint/json` through the plugin's host
    callback (`setHostFormatter`), not to dprint's TypeScript plugin, which failed above. Our glue beside it
    (rule: (c) own TS for what the modules do not cover): expressions of a template always keep their semicolons
    (Vue needs them; this is where Prettier's own result breaks), nothing with a double quote goes back into a
    double-quoted attribute, a wrapper the plugin could not take off again means "leave that expression as typed".
  - **Markdown → stays with Prettier (JavaScript).** Both WebAssembly Markdown formatters change what a document
    renders to — faults inside the engines, nothing beside them can put that right. cmark-gfm's own CommonMark
    writer (our markdown.wasm) was considered as rule step 2: it turns reference links into inline links and
    escapes far more than a person would, which is not formatting.
  - **Beside the modules, rule (b): Prettier as the fallback** for text a module refuses — CSS with IE hacks or
    bracketed custom properties, YAML with a multi-line flow sequence, HTML with omitted end tags, a Vue file with a
    Pug template or a Less block, JSON5-like JSON. The tab says which engine formatted the text. Each Prettier
    parser is fetched only when it is needed.
- **Costs, said plainly.** Biome's module is 70 MB (18 MB over the wire), fetched with the first Format of one of
  its languages and kept by the browser's cache; the deployed site grows from 635 MB to about 705 MB of GitHub
  Pages' 1 GB. A module of 3–6 MB could be built by us from the same Biome crates (rule step 2) — not done,
  because the official build exists and covers everything; it is the way out if the size ever hurts.
- **Not chosen although smaller:** dprint's TypeScript, CSS, YAML and Markdown plugins (faults above). Biome for
  HTML, Vue and Markdown (faults above).

*(further entries follow as the hunt goes on)*

### 55. `graphviz` — Graphviz (DOT) (19 Nov 2026)
- **Our module:** graphviz.wasm — Graphviz 14.1.2 (C / C++) + Expat, compiled by us for wasm32-wasi (1.6 MB).
- **Candidates** (npm, downloads a month): **@viz-js/viz 3.31.0** (1.79 M; Viz.js, the best-known build) and
  **@hpcc-js/wasm-graphviz 1.30.0** (1.36 M; used by d3-graphviz). Both are Emscripten builds of **Graphviz 16.1.0**
  with the module embedded in JavaScript, MIT / Apache-2.0 around EPL-2.0 — both famous, maintained, hostable in the
  app. Either would have covered what the tab asked of its engine, and both were two major releases ahead of ours.
- **Check:** every graph file of the Graphviz sources (`graphs/`, `tests/`: 434 files) through each build and through
  the native `dot` 16.1.0 built here from the official archive.
  | | native dot 16.1.0 | Viz.js 3.31 | hpcc 1.30 | ours (14.1.2) |
  |---|---|---|---|---|
  | files drawn, a new instance per file | 434 | 426 — **8 trap** (`crazy.gv`, `rankdir_dot*.gv`, …) | the same engine; a trap surfaces as an exception | 432 — **2 trap** (`record_dot.gv`) |
  | one instance for several graphs | — | `ER.gv` traps on its **third** drawing (what a tab that redraws on every keystroke does) | as Viz.js | as fresh |
  | Graphviz's warnings | on stderr | returned | **dropped** (none reach the caller) | returned |
  | prism overlap removal (sfdp's default, `overlap=prism`) | only when built with GTS | no — "remove_overlap: Graphviz not built with triangulation library" on every sfdp drawing | no (and silent) | no, the same error |
  The traps have one cause, inside Graphviz: `storeline()` (lib/common/labels.c) leaves a text span uninitialised when a
  label's first line is empty, and freeing the label calls whatever stands in its `free_layout`. valgrind shows the
  read in the native tool, which survives it by luck; in WebAssembly a call through a garbage table index traps.
- **Decision — keep a WebAssembly build of our own** (the judgement clause of STANDING RULE #1): the existing modules
  crash on valid graphs, the fault is inside the engine, and nothing placed beside the module can put it right
  (Viz.js loses the drawing when the clean-up traps). So: own build **from the latest release — Graphviz 16.1.0,
  the official archive, SHA-256 checked** — with the fault repaired (`storeline.patch`, one line; worth reporting
  upstream). With that patch all 434 files are drawn, in a fresh and in a reused instance.
- **What the own build then made possible** (none of it is in the existing modules):
  - *The drawings of the dot program.* wasi-libc's `qsort` (smoothsort) orders equal elements differently from
    glibc's merge sort, and Graphviz's comparison functions call different elements equal; its `rand()` is another
    generator. With glibc's two routines in the module (`qsort.c`, `rand.c`; 2.4 million `rand()` values checked
    against the real one) — final module against the native tool of the same source, **457 graph files × 8
    engines**: **dot, neato, twopi, osage, patchwork: the SVG byte for byte on every file**; circo on all but three
    that ask for overlap removal after it; sfdp 360; fdp 242 (the last digit of sin / cos differs between the C
    libraries and the iterations enlarge it — the nodes, sizes and edges are always the same). No trap anywhere.
    Before: dot differed on 9 files, neato on 4, sfdp on 358. (Viz.js against the tool: 14 of 426 differ in dot.)
  - *Prism.* Graphviz takes its Delaunay triangulation from GTS (LGPL, on GLib — a large thing to bring to wasm32).
    Under the rule's second step — own WebAssembly from open-source code — the triangulation is a C port of
    **Delaunator 5.1.0** (ISC) with robust-predicates' `orient2d`, placed under Graphviz's delaunay.c
    (`triangulation.patch`, `st_delaunay.h`). The port returns the arrays of the original for every input (1,513
    point sets, 184,578 triangles while porting; the unit suite repeats it and checks with exact arithmetic).
    Against a **native Graphviz built with GTS** (libgts 0.7.6), 449 files: sfdp **447** identical, neato + prism
    442, fdp + prism 432, twopi + prism 382, circo + prism 359 — where points lie on one circle two triangulations
    are equally right and the libraries choose differently. Left out: GTS's triangulation with fixed segments, which
    only the spline router for parallel edges in the spring engines uses (two of the 449 files).
  - *Text measured by the browser* (a "textlayout" plugin in the glue → an import the worker answers from a canvas):
    Graphviz's built-in tables know the widths of a few Latin fonts; labels in Devanagari, CJK, Arabic or emoji were
    guessed. The existing modules have the same tables.
  - *Assertions kept* (`-UNDEBUG` — zig cc defines NDEBUG by itself at -O2): where the tool aborts the module stops
    at the same check; the tab names it.
- **Size:** 1.65 MB (0.56 MB compressed) — Viz.js is 1.2 MB of JavaScript with the module inside, hpcc 0.8 MB.
- **Suites re-run after the replacement:** unit 686, e2e 81 (the reference is the native tool: 3,464 drawings);
  lazy, shell, every-tab, no-external.

### 56. `calc` — Scientific Calculator (19 Nov 2026)
- **Our module:** mathcore.wasm — own C (`wasm/mathcore/mathcore.c`, 137 KB): the expression reader and evaluator
  (`m_expr_*`), in doubles. The bc console beside it is BusyBox's bc (own build, tab `terminal`).
- **Candidates** (npm registry search, downloads a month — `api.npmjs.org` is not reachable from here, the search
  endpoint `registry.npmjs.org/-/v1/search?text=…` gives the same counts): WebAssembly calculators —
  **fend-wasm-web 1.5.9** (1,739; the fend calculator, Rust), **libqalculate-wasm 0.0.6** (535), **@paddim8/kalk
  3.2.3** (73), numbat (no package); **gmp-wasm 1.3.2** (1,541) is arithmetic without a reader of expressions.
  JavaScript: mathjs 15.2 (22 M), expr-eval (2.1 M), decimal.js (551 M).
- **Decision:** none of the WebAssembly candidates is a famous, tried-and-tested module (the ones this app uses are
  three to five orders of magnitude more widely used; `@wasm-fmt/biome_fmt` was set aside at 2,500 a month) →
  the rule's second step, a WebAssembly module of our own, which the tab already has; the JavaScript libraries
  come after that in the owner's order. mathcore stays, and its faults were hunted with **mpmath** as the
  independent reference (3,005 answers).
- The same survey stands for the other calculator tabs that rest on mathcore (noted again in their entries).

### 57. `units` — Unit Converter (19 Nov 2026)
- **Ours:** no WebAssembly module — a table of factors and one multiplication and division per conversion
  (`src/lib/units.ts`), which the compute rule leaves in TypeScript ("unit factors, a single multiplication").
- **Candidates:** WebAssembly — none (the registry has no unit-conversion module in WebAssembly; GNU Units has no
  WebAssembly build on npm). JavaScript: convert-units 2.3.4 (1.2 M a month), js-quantities 1.8.0 (0.4 M).
- **Decision:** nothing to replace. A library would bring its own table, and the table is the whole tab; ours is
  now the exact definitions, held to **GNU Units 2.23** for every pair of units (3,222 conversions).

### 58. `dates` — Date Calculator (19 Nov 2026)
- **Ours:** the calendar is the browser's `Date` (compiled code); `src/lib/dates.ts` is the glue around it (month
  ends, spans, birthdays — "Date / Intl handling" under the compute rule) and mathcore counts the weekdays (own C).
- **Candidates:** WebAssembly — none (chrono and jiff are Rust crates, not published as tried-and-tested
  WebAssembly modules; nothing in the registry). JavaScript: date-fns 4.4 (482 M a month), temporal-polyfill (30 M).
- **Decision:** nothing to replace. Held to **Python's datetime and calendar** for 6,985 cases over the years 1 to 9999.

### 59. `emi` — EMI Calculator (19 Nov 2026)
- **Ours:** mathcore (own C): `m_emi`, `m_amortize_yearly`. The tab's checks and wording are `src/lib/finance.ts` (glue).
- **Candidates:** WebAssembly — none: the registry has no loan, amortisation or time-value-of-money module compiled to
  WebAssembly (searched "financial wasm", "loan calculator wasm", "amortization wasm", "finance webassembly"; the hits
  are databases, hashes and parsers). JavaScript: `financial` 0.2.4 (a port of numpy-financial, 2.3 lakh downloads a
  month), `financejs` 4.1 (35 thousand). numpy-financial itself — the reference this tab is now held to — computes
  `(1 + r)^n − 1` as written and has no digits left at a rate of a billionth of a percent, so a port of it would have
  brought back the fault this hunt removed from our engine.
- **Decision:** nothing to replace — the engine stays our C, now in closed forms that hold over the whole range
  (`expm1` / `log1p`). Held to the definition of a reducing-balance loan worked month by month in **mpmath at 420
  digits** for 936 loans, cross-checked with **numpy-financial** (pmt, ipmt, ppmt) on the 540 ordinary ones.

### 60. `gst` — GST Calculator (19 Nov 2026)
- **Ours:** mathcore (own C): the new `m_gst` — GST on one amount in whole paise, forwards and backwards — beside
  `m_invoice`, whose line arithmetic it shares.
- **Candidates:** WebAssembly — none (no tax or decimal-money module in the registry; "gst calculator" finds two
  JavaScript packages with 24 and 33 downloads a month). Decimal libraries are JavaScript (decimal.js, big.js).
- **Decision:** nothing to replace. Whole paise in 64-bit integers with 128-bit products, half away from zero; the
  amount is read as it is written with 15 digits. Held to **Python's decimal** (ROUND_HALF_UP on the typed text) for
  1,126 amount × rate pairs in the four modes.

### 61. `sip` — SIP Calculator (19 Nov 2026)
- **Ours:** mathcore (own C): `m_sip` — the instalments carried forward month by month (yearly step-up), or a lump sum.
- **Candidates:** as for tab 59: no time-value-of-money module exists as WebAssembly; the JavaScript ports of
  numpy-financial have `fv`, without step-ups.
- **Decision:** nothing to replace. Held to the same recurrence in **mpmath at 60 digits** for 1,430 plans and 180
  lump sums, cross-checked with **numpy-financial's fv** on the 120 plans without a step-up.

### 62. `fd` — FD / RD Calculator (19 Nov 2026)
- **Ours:** mathcore (own C): `m_fd` — compound or simple interest on a deposit, or on each instalment of a recurring
  deposit for the time it has left.
- **Candidates:** as for tab 59: none as WebAssembly.
- **Decision:** nothing to replace. Held to compound interest in **mpmath at 60 digits** for 1,100 deposits and 1,000
  recurring deposits; the quarterly recurring deposits were also checked against the formula Indian banks publish,
  M = R·((1 + i)ⁿ − 1) / (1 − (1 + i)^(−1/3)); 76 effective yields by exact decimal arithmetic.

### 63. `percent` — Percentage Calculator (19 Nov 2026)
- **Ours:** no engine: six formulas on two numbers (`src/lib/percent.ts`) — "a single multiplication" under the
  compute rule. Since this hunt the two numbers are taken as decimals (whole number × power of ten) and the answer is
  one division of whole numbers; there is no loop and no data to move into a module.
- **Candidates:** WebAssembly — none (searched "decimal wasm", "percentage wasm": nothing but databases and hashes).
  JavaScript: decimal.js, big.js (arbitrary-precision decimals; not needed for one exact division).
- **Decision:** nothing to replace; stays TypeScript (recorded in CLAUDE.md §3a "Deliberately left in TypeScript").
  Held to **Python's fractions** on the typed text for 841 pairs × 6 questions.

### 64. `words` — Number to Words (19 Nov 2026)
- **Ours:** mathcore (own C): `m_words` — a whole number below 2⁶⁴ in English words, with lakh and crore or with
  million and billion. The sentence around it (`src/lib/words.ts`) is string glue.
- **Candidates:** WebAssembly — none (nothing in the registry spells numbers out as a WebAssembly module).
  JavaScript: `number-to-words`, `to-words` (Indian system too), `written-number`. Python: **num2words**, the
  reference library — used here as the reference of the tests, not shipped.
- **Decision:** nothing to replace; the engine stays our C. Held to **num2words** (`en` and `en_IN`) for 1,598 whole
  numbers up to 10¹⁹ — which showed the one thing it did differently: no "and" before a last part below a hundred.

### 65. `timezone` — Time Zone Converter (19 Nov 2026)
- **Ours:** no engine of ours: the zone database is the browser's (Intl — ICU, compiled C++ with the IANA data), a
  "browser-native engine" under §3a. `src/lib/tz.ts` asks it and writes the answers (glue).
- **Candidates:** WebAssembly — none worth having: a module would have to ship its own copy of the IANA database
  (chrono-tz and jiff in Rust do: 0.5 – 1 MB) to answer what the browser already answers, and it would age with the
  site instead of with the browser. JavaScript: Temporal polyfills, date-fns-tz, Luxon — all sit on the same Intl.
- **Decision:** nothing to replace. Held to **Python's zoneinfo** on tzdata 2026e for 2,288 offsets (52 zones, 1850 –
  2037) and 3,095 wall-clock readings around 353 clock changes — to the second, in Node (the same tzdata) and by
  sample in Chromium.

### 66 – 68. `bmi`, `calories`, `duedate` — BMI, Calorie and Pregnancy Due Date calculators (19 Nov 2026)
- **Ours:** mathcore (own C): `m_bmi` (kg / m²) and `m_bmr` (the Mifflin–St Jeor equation); the due date is calendar
  arithmetic on the browser's `Date` (`src/lib/dates.ts`). What each tab refuses and how it reads its boxes is
  `src/lib/health.ts` (glue).
- **Candidates:** WebAssembly — none (one formula each; nothing in the registry). JavaScript: small single-purpose
  packages with a few hundred downloads a month.
- **Decision:** nothing to replace. Held to exact fractions and decimals (BMI: 1,141 people and 43 healthy ranges
  found by trying every tenth of a kilogram or pound; calories: 588 people) and to **Python's datetime** (1,255
  pregnancies) — `scripts/make-health-reference.py`.

### 69 – 71. `tip`, `fuel`, `gpa` — Tip & Bill Splitter, Fuel Cost, GPA (19 Nov 2026)
- **Ours:** no engine: a handful of multiplications and one division each (`src/lib/smallcalc.ts`) — "trivial glue
  arithmetic" under the compute rule; money in whole paise.
- **Candidates:** none as WebAssembly; nothing to gain from a library.
- **Decision:** nothing to replace; stays TypeScript. Held to exact arithmetic on the typed numbers (Python's decimal
  and fractions): 2,112 bills, 245 trips, 400 grade sheets — `scripts/make-smallcalc-reference.py`.

### 72 – 73. `base`, `roman` — Number Base Converter, Roman Numerals (19 Nov 2026)
- **Ours:** mathcore (own C): `m_base_convert` (numbers of any length between bases 2 and 36, in limbs of 2³²) and
  `m_to_roman` / `m_from_roman` / `m_from_roman_loose`.
- **Candidates:** WebAssembly — big-number libraries exist as WebAssembly (GMP builds such as gmp-wasm, 60 thousand
  downloads a month): 300 KB and more for one function of forty lines that the calculators' module already holds;
  nothing for Roman numerals. JavaScript: BigInt's own `toString(radix)` (not arbitrary-base input), `roman-numerals`.
- **Decision:** nothing to replace — a 0.3 MB arithmetic library for a base conversion would be the opposite of
  "lazy and small", and the engine is already WebAssembly. Held to **Python's int()** and **numpy.base_repr** for 464
  numbers up to 6,000 bits, and to the **roman** library for all 3,999 numerals and 3,000 strings of Roman letters.

### 74 – 78. `prepay`, `ppf`, `epf`, `nps`, `inflation` — Loan Prepayment, PPF, EPF, NPS, Inflation (19 Nov 2026)
- **Ours:** mathcore (own C): `m_prepay` (the loan month by month with a part-prepayment), `m_ppf`, `m_epf` (the
  account as the EPFO keeps it), `m_nps`, and the engine's `growth()` for inflation. What each tab refuses and how
  it reads its boxes is `src/lib/finance.ts` (glue).
- **Candidates:** WebAssembly — none: the registry has no module for loan schedules or Indian retirement schemes
  (searched: "amortization wasm", "loan wasm", "financial wasm", "ppf", "epf", "nps"). JavaScript: `financial`
  (numpy-financial's functions in TypeScript, 60 thousand downloads a month) and `financejs` give pmt / fv / nper —
  the same closed forms the engine already has, and nothing for a prepayment schedule or for the EPFO's way of
  crediting interest, which are the parts that had the bugs.
- **Decision:** nothing to replace; the models are a few lines each on top of the engine's `m_emi` and `growth()`,
  already WebAssembly. Held to **mpmath at 60 digits** by another route where there is one
  (`scripts/make-finance2-reference.py`): 520 prepayments simulated month by month (66 of them also by the closed
  form of a loan's balance), 192 PPF accounts by the annuity-due formula, 144 EPF accounts, 90 NPS accounts
  (cross-checked with numpy-financial's `fv`), 240 inflation cases.

### 79 – 81. `sleep`, `bodyfat`, `idealweight` — Sleep Cycle, Body Fat, Ideal Weight (19 Nov 2026)
- **Ours:** mathcore (own C): `m_bodyfat` (the US Navy equations of Hodgdon and Beckett), `m_idealweight` (Devine,
  Robinson, Miller, Hamwi) and `m_bmi` for the healthy range; the sleep times are clock arithmetic (a subtraction of
  minutes). What each tab refuses and how it reads its boxes is `src/lib/health.ts` (glue).
- **Candidates:** WebAssembly — none (one formula each; nothing in the registry for "body fat", "ideal weight",
  "sleep cycle"). JavaScript: single-purpose packages with a few hundred downloads a month.
- **Decision:** nothing to replace. Held to **mpmath at 40 digits** (700 bodies), exact fractions (384 heights in cm
  and in feet and inches: the four formulas and both healthy ranges, the latter also found by trying every tenth of
  a kilogram) and **Python's datetime** (400 nights) — `scripts/make-body-reference.py`.

### 82. `coords` — Coordinates Converter (19 Nov 2026)
- **Ours (before):** mathcore `m_haversine` — the great circle on a sphere of the mean radius: up to 0.5 % off the
  real Earth (Delhi → Mumbai 3.6 km, opposite points 11 km), shown with two decimals of a kilometre.
- **What the utility needs:** the distance and the bearings between two points as GPS and maps mean them — on the
  WGS-84 ellipsoid — for any two points, the nearly opposite ones included.
- **Candidates:** WebAssembly — `proj-wasm` 0.1.0 (PROJ transpiled; 3,500 downloads a month, first release, a
  projection library whose interface does not offer the geodesic routines), `@crossbind/port-proj-wasm` and
  `@crossbind/port-spatialite-wasm` (2.0.0-beta, 1,500 downloads a month), PGlite with PostGIS (a whole database
  server): none is a tried-and-tested module for this job, and the last three are megabytes for one function.
  JavaScript: `geographiclib-geodesic` 2.2.0 (Karney's own JavaScript port, 970 thousand downloads a month),
  `geodesy` 2.4.0 (Vincenty; does not converge for nearly opposite points), `haversine` (the sphere again).
- **Decision (rule step 2 — our own WebAssembly build from open-source code):** **`geo.wasm`** = Charles Karney's
  `geodesic.c` 2.2 (the C implementation of GeographicLib's geodesic routines, MIT), the two files taken unmodified
  from the PROJ 9.9.0 release archive (SHA-256 from Ubuntu's signed .dsc), + 40 lines of glue; **36 KB**, loaded by
  this tab only (`wasm/geo`). Accurate to about 15 nanometres. `m_haversine` left mathcore; the sphere's figure is
  still shown, beside the real one, for comparison with tools that use it.
- **Check:** against **Karney's Python implementation** (`pip install geographiclib`) for 437 pairs — within 20 nm —
  of which 352 are also worked out with **Vincenty's formula in mpmath** (another method, another author; agreement
  within 65 micrometres, the accuracy of his truncated series) — `scripts/make-geo-reference.py`.

### 83. `graph` — Graphing Calculator (19 Nov 2026)
- **Ours:** mathcore (own C): the expression compiler and bytecode VM of the Scientific Calculator (entry 56),
  `m_expr_eval_range`, and — new — `m_expr_plot`, which samples a curve and says which neighbouring samples belong
  to one unbroken stretch. The picture is drawn on a canvas by the page.
- **Candidates:** WebAssembly — none: no tried-and-tested module evaluates typed formulas or plots them (entry 56's
  survey: `mathjs`, `expr-eval`, `nerdamer`, `algebrite` are JavaScript; the WebAssembly builds of computer-algebra
  systems are megabytes and not made for a per-frame sampler). JavaScript plotters: `function-plot` (on D3 and
  interval arithmetic, 30 thousand downloads a month), Desmos and GeoGebra are services or far larger applications.
- **Decision:** nothing to replace; the engine is already WebAssembly and gained the sampler. Held to the
  mathematics of each function (where floor, 1/x, tan … break and where they do not) on 60 random grids each.

### 84. `equation` — Equation Solver (19 Nov 2026)
- **Ours:** mathcore (own C): `m_find_roots` (real roots of any expression in a range), `m_quadratic`, `m_cubic`,
  `m_solve_linear` — all in double precision.
- **Candidates:** WebAssembly — none that is tried and tested for this job: computer-algebra systems exist as
  WebAssembly builds (SymPy through Pyodide, 10 MB and more; Giac / Xcas, 15 MB; PARI/GP ports), megabytes each and
  seconds to start, for four formulas. JavaScript: `mathjs` (`polynomialRoot`, `lusolve`; 4 million downloads a
  month — double precision, the same faults as ours on repeated roots), `nerdamer`, `algebrite` (symbolic; unmaintained
  or slow), `fraction.js`.
- **Decision:** the engine stays, with Kahan's quadratic and cubic in place of the formulas with cube roots
  (which turned the double root of (x − 1)²(x − 10⁶) into a complex pair). What double precision cannot give — the
  *kind* of an answer for coefficients typed as decimals — is decided beside it on **exact fractions with the
  browser's BigInt** (`src/lib/exact.ts`, `src/lib/equations.ts`): BigInt is the browser's own compiled big-number
  arithmetic, and mathcore's exact fractions are 64-bit (a 4 × 4 system of 15-digit decimals needs 60 digits and
  more). Rule step (c), our own TypeScript, for a part no module covers; reason recorded in CLAUDE.md §3a.
- **Check:** Python's `fractions` and mpmath at 80 digits (`scripts/make-equations-reference.py`): 396 fractions to
  the nearest double bit for bit, 400 quadratics, 300 cubics built from chosen roots, 300 linear systems (one
  solution as fractions / none / infinitely many with the rank), 20 equations in x.

### 85. `stats` — Statistics (19 Nov 2026)
- **Ours:** mathcore (own C): `m_stats` (count, sum, mean, median, quartiles, variances, deviations, geometric and
  harmonic mean, skewness), `m_modes`, `m_regress` (least-squares line, Pearson's r).
- **Candidates:** WebAssembly — none tried and tested for descriptive statistics of a typed list (numerical stacks
  such as NumPy / SciPy through Pyodide are 10 MB and more; `@stdlib` ships a few WebAssembly kernels for BLAS-like
  loops, not these statistics). JavaScript: `simple-statistics` (1.3 million downloads a month), `jstat`, `mathjs`
  — plain double-precision sums, the same fault ours had (10¹⁶ + 1 − 10¹⁶ = 0).
- **Decision:** nothing to replace; the engine got exact summation (Shewchuk's algorithm, as Python's `math.fsum`),
  deviations in a power-of-two unit, and the corrections for the rounded mean. Held to the exact values of the
  doubles (Python's `fractions`), cross-checked with Python's `statistics` module for 262 of 320 data sets —
  `scripts/make-stats-reference.py`.

### 86. `matrix` — Matrix Calculator (19 Nov 2026)
- **Ours:** mathcore (own C): `m_det`, `m_inverse`, `m_rank`, `m_matmul`, `m_matadd`, `m_transpose`, `m_trace`,
  `m_matpow` — double precision.
- **Candidates:** WebAssembly — linear-algebra stacks exist as WebAssembly (OpenBLAS / LAPACK inside Pyodide's NumPy,
  Eigen builds, `@stdlib`'s BLAS kernels): megabytes, made for large numeric work, and double precision — they give
  the same 5 × 10⁻¹⁷ where a hand-typed matrix has the determinant 0. JavaScript: `mathjs` (fractions only through
  its own BigNumber / Fraction types), `ml-matrix`.
- **Decision:** the engine stays for large matrices (its "is this nothing?" tests now measure against the entries);
  matrices of up to 400 cells — every one a person types — are worked out on **exact fractions with the browser's
  BigInt** (`src/lib/matrix.ts` on `src/lib/exact.ts`), as for the Equation Solver (entry 84).
- **Check:** Python's `fractions` for 220 matrices (determinants also by the Leibniz sum, inverses multiplied back),
  NumPy for matrices of 25 – 40 rows — `scripts/make-matrix-reference.py`.

### 87 – 88. `fraction`, `primes` — Fraction Calculator, Prime / LCM / GCD (19 Nov 2026)
- **Ours:** mathcore (own C): `m_frac_eval` (a parser of fraction expressions on exact whole numbers — 64-bit until
  now, 128-bit from now on), `m_is_prime` (deterministic Miller–Rabin for 64 bits), `m_factor` (Pollard rho),
  `m_next_prime`, `m_gcd`.
- **Candidates:** WebAssembly — GMP builds (`gmp-wasm`, 60 thousand downloads a month; 300 KB) give big whole numbers
  and fractions but no expression reader, prime factoriser of this kind or 64-bit Miller–Rabin; PARI/GP ports are
  megabytes. JavaScript: `fraction.js` (10 million downloads a month, no expressions with mixed numbers),
  `mathjs` fractions, `big-integer` / BigInt-based prime tests.
- **Decision:** nothing to replace: both engines are already WebAssembly, small, and agree with the references on
  every case. The fraction engine got twice the room (38 digits) instead of a 300 KB library for unlimited room.
- **Check:** Python's `fractions` on 700 expression trees and 400 exact decimals (`scripts/make-fraction-reference.py`);
  **SymPy** (`factorint`, `isprime`, `nextprime`) on 420 hard 64-bit numbers and Python's `math.gcd` / `lcm` on 121
  lists (`scripts/make-primes-reference.py`, needs `pip install sympy`).

### 89. `periodic` — Periodic Table (19 Nov 2026)
- **Ours:** no engine: a table of 118 rows (`src/lib/elements.ts`) and a search over it.
- **Candidates:** none — there is nothing to compute. Data packages (`periodic-table` on npm, the Python `mendeleev`
  and `periodictable`) carry the same public figures; ours stays (10 KB, IUPAC spelling, current isotopes).
- **Decision:** nothing to replace. The table is held to the `mendeleev` package element by element
  (`scripts/make-periodic-reference.py`): symbol, name, atomic weight, group, period, block, electron
  configuration — with the eleven places where ours knowingly differs listed in the test, each with its reason.

## Text

### 90. `wordcount` — Word Counter (19 Nov 2026)
- **Ours before:** no engine of ours for the counting itself — the browser's `Intl.Segmenter` (ICU inside the browser)
  cut the text into words, characters and sentences, a loop in TypeScript counted them, and `t_wordfreq` in
  textcore.wasm (own C) ranked the keywords.
- **What the check found:** the browser's segmenter is not one engine but three. **Chromium ships its own word rules**
  (a full stop or a colon never joins letters), so the same text had other counts in Chrome than in Safari or
  Firefox: "U.S.A." was 3 words, "e.g." 2, "example.com" 2. Node's ICU (stock rules) says 1 each — so a unit test
  could not even see what the tab showed. And walking the segmenter's objects in JavaScript cost 0.8 s a keystroke on
  1.2 MB of text. Nothing placed beside it puts that right: the counting has to stand on one segmenter of our own.
- **Candidates (existing WebAssembly modules):**
  - **ICU4X, the Unicode Consortium's official build** (`icu` 2.4.0 on npm, Unicode-3.0 licence; Firefox's
    `Intl.Segmenter` is ICU4X): grapheme, word, sentence and line segmenters with dictionaries and LSTM models for
    Thai, Lao, Khmer, Burmese, Chinese and Japanese. It is **one file of 20.3 MB** (all of ICU4X with all its data:
    calendars, collation, number formats …) — for a tab that shows four numbers under a text box, on a phone. Its
    word segmenter is plain UAX #29, which is not what a word limit counts (see below), so the rules would still be
    ours. Not used: 20 MB against 0.17 MB for the same segmentation rules is not a trade this tab should make
    (Claude's judgement, as the owner left such cases to it).
  - `unicode-segmenter` (npm, 0.17, JavaScript), `@formatjs/intl-segmenter` (JavaScript polyfill): not WebAssembly.
- **Open-source code to build from (rule 2):** the Rust crate **`unicode-segmentation`** 1.13.3 (MIT / Apache-2.0;
  700 million downloads, 190 million in the last 90 days; the UAX #29 implementation of the Rust ecosystem; Unicode
  17.0, tested against the Unicode Consortium's own break tests). ICU4X's `icu_segmenter` crate was the alternative
  (same rules plus the dictionaries, megabytes of data); the dictionaries are the one thing it has more, and the
  browser has them already.
- **Decision:** **our own module `textkit.wasm`** (`wasm/textkit`, 170 KB, fetched with the first text): the
  `unicode-segmentation` crate for characters (extended grapheme clusters) and sentence boundaries, and our counting
  rules in Rust on top (words as a word limit counts them, abbreviations and initials, paragraphs, lines, keywords).
  **Beside it, for what it does not cover** (owner's tweak: an existing engine for the missing part): the words of
  Thai, Lao, Khmer and Burmese stretches — scripts without spaces, which only a dictionary can cut — come from the
  browser's `Intl.Segmenter` (`src/lib/wordcount.ts`; the engine leaves those letters out of its count). `t_wordfreq`
  left textcore.wasm (its only user was this tab).
- **Evidence the new engine is right:** characters equal ICU's (Node, the same Unicode 17.0) on the corpus and 4,000
  random strings of the code points the rules are about, and equal Python's `regex` module on the corpus; sentences
  equal ICU and the construction count on 1,500 generated texts and pySBD on the English corpus (two texts where
  pySBD is wrong are listed with the reason); words equal `wc -w` / Word on 32 texts in 16 languages.

### 91. `case` — Case Converter (19 Nov 2026)
- **Ours before:** no engine: twelve one-line functions in TypeScript on the browser's `toLocaleUpperCase` /
  `toLocaleLowerCase` and regular expressions (title rules, sentence starts, word splitting for camelCase & co.).
- **Candidates (existing WebAssembly modules):** none — case conversion is published as JavaScript (`change-case`,
  `title-case` on npm) or as Rust / Python libraries, not as WebAssembly.
- **Open-source code to build from (rule 2), each tried on the tab's texts:**
  - **`heck`** 0.5.0 (1.6 billion downloads; snake / kebab / camel …): cuts a word at every combining mark and drops
    the mark — "नमस्ते" → `नमस_ते` (the virama gone), "café" written with a combining accent → `cafe`; "don't" →
    `don_t`; joins all lines into one name.
  - **`convert_case`** 0.8 (660 million downloads): keeps punctuation inside the names — "Hello, world!" →
    `hello,_world!`; splits `v2Api` into `v_2_api`.
  - **`titlecase`** 3.6.0 (3 million downloads; Gruber's rules; needs the `regex` crate, + 0.6 MB): "state-of-the-art"
    → `State-Of-The-Art`; `'that's what happens'` after a colon stays small; a second line is no title of its own.
  Each fails on something the tab needs and the fault is inside the library (a defect, not a missing feature).
- **Decision:** **our own Rust in textkit.wasm** (`wasm/textkit/src/case.rs`, + 45 KB): case mapping by Rust's
  standard library (Unicode's full mappings: ß → SS, final sigma), words by the `unicode-segmentation` crate's
  grapheme clusters (a mark stays with its letter), Title Case as a port of the Python package **`titlecase`**
  2.4.1 (MIT) — the faithful carrier of Gruber's rules, which the Rust crate is not.
- **Evidence:** Title Case equals the Python package on 197 of 203 titles (its own 72 tests among them); the six
  others are differences on purpose, listed with their reasons in the unit suite. The six code cases equal npm's
  `change-case` 5.4.4 on 3,016 generated names. UPPER and lower equal ICU on 2,509 texts.

### 92. `lines` — Line Tools (19 Nov 2026)
- **Ours:** the shuffle is crypto.wasm's (own C on libsodium's random numbers; a fair Fisher–Yates). Everything
  else was TypeScript: split, trim, a `Set` for duplicates, and `Array.sort` with the browser's **`Intl.Collator`**
  (ICU inside the browser; digits compared as numbers).
- **Candidates for the sorting (the one real engine here):** ICU4X's official WebAssembly build (`icu` on npm: the
  20 MB file of tab 90); a build of ours from the `icu_collator` crate (root collation ≈ 0.5 MB, each language's
  tailoring more) or from `feruca` (the Unicode Collation Algorithm in Rust, root order only).
- **Check:** unlike the browser's word segmenter (tab 90), the collator showed no defect: plain words sort as GNU
  `sort` sorts them and numbered ones as `sort -V` (80 lists in the unit suite, 24 more through the page), and it
  sorts **in the reader's own language** (ä after z in Swedish, with a in German) — which a root-only module of ours
  would lose and a module with every tailoring would pay megabytes for.
- **Decision:** the browser's collator stays (an engine of the platform, like WebCodecs for video: compiled ICU, no
  download). **Beside it:** the length of a line for "By length" is textkit.wasm's count of characters (it was
  UTF-16 units), fetched when that option is chosen; the shuffle stays crypto.wasm's, now fetched when Shuffle is
  chosen instead of when the tab opens. What is left in TypeScript (`src/lib/linetools.ts`) hands lines to those
  three engines: split, trim, a `Set`, reading a leading number — glue that would cost more to marshal into a
  module and back (the sort itself must call the browser's collator) than it costs to run.

### 93. `replace` — Find & Replace (19 Nov 2026)
- **Ours:** none — the browser's own `RegExp` (compiled C++, V8's Irregexp / JavaScriptCore's YARR), as in the Regex
  Tester tab.
- **Candidates (existing WebAssembly regex engines):** `vscode-oniguruma` (Microsoft's build of Oniguruma for VS
  Code's grammars; 0.46 MB; Ruby's dialect; a scanner — no replace), `re2-wasm` (Google's RE2: linear time; no
  look-around, no back-references), a build of ours from Rust's `regex` crate (linear time; the same limits), PCRE2
  builds with few users.
- **Decision:** the browser's `RegExp` stays. What this tab is asked for is "find & replace (regex)" in the dialect a
  web user knows and can try next door in the Regex Tester; a second dialect in the neighbouring tab (no
  `(?<=…)`, no `\1`, or Ruby's syntax) would be a trap, and none of the modules replaces — the `$1` logic would be
  ours on top. The one defect of a backtracking engine, a pattern that never ends, is dealt with outside it: **the
  search now runs in the regex worker and is ended after 5 seconds** (it ran on the page and froze the tab).
  `src/lib/findreplace.ts` builds the pattern (plain text escaped, whole words by Unicode properties) and the
  replacement; that is string glue around a native engine.

### 94. `diff` — Text Diff (19 Nov 2026)
- **Ours before:** `t_diff` in textcore.wasm — own C, Myers' O(ND) algorithm over token ids, with the whole search
  history kept for backtracking.
- **What the check found (a defect of our own module):** the history was reserved for the worst case — a table of
  (lines of both texts)² entries whatever the texts — so 3,000 lines with two changed lines took **528 MB** of
  memory, and from about 8,000 lines on the reservation failed and the tab said **"Texts are too different to
  diff"** about two texts that differed in two lines.
- **Candidates:** no established WebAssembly diff module exists (npm's `diff` and `diff-match-patch` are
  JavaScript). Open-source code to build from: the Rust crate **`similar`** 3.2.1 (Apache-2.0; 257 million
  downloads, 76 million in the last 90 days; the diff library behind `insta`: Myers in linear space with a time
  limit, diffs by line, word and grapheme, the marking of changes inside a line, unified diffs); `imara-diff`
  (the engine of gitoxide: faster on huge files, lines only, no word level); libxdiff (git's C library).
- **Decision:** **replaced by `similar`**, compiled into a module of its own, **textkit-diff.wasm**
  (`wasm/textkit` with the feature `diff`, 0.69 MB — the crate is generic over every kind of token and every
  algorithm, which is where the size comes from; it is built for size and fetched by this tab only). `similar`
  covers everything the tab asks for and more: line numbers, the changed words of a changed line, a unified diff
  that `patch` applies. Our glue (`src/diff.rs`): the rows the page draws, and one rule — a last line is the same
  line whether or not a line break follows it (the unified diff is made from the texts as they are).
- **Evidence:** the counts of removed and added lines equal GNU `diff -d` on 160 pairs; GNU `patch` turns the
  original into the changed text with the module's unified diff (over 100 patches, final line breaks included);
  characters: the fewest changes the longest common subsequence allows on 400 random pairs; 100,000 lines with two
  changes in 0.2 s and 18 MB. The old routine left textcore.wasm (38 → 34 KB).

### 95. `fancy` — Fancy Text (19 Nov 2026)
- **Ours before:** no WebAssembly; tables of Unicode characters in TypeScript, and the styles that work character
  by character (Upside down, Strikethrough, Underline) walked the text code point by code point.
- **Candidates:** there is no WebAssembly module for "fancy text". What exists on npm (`unicode-text-styles`,
  `weird-fonts`, `fancy-text-generator`, `to-unicode`, `unicode-text-decorator` — looked up in the registry) are
  small JavaScript tables of the same kind as ours; none is an established library (their download counts could
  not be read from this sandbox).
- **What needs an engine here:** one thing — telling apart **the characters a reader sees** (extended grapheme
  clusters: an emoji with its skin tone, a flag, a family, a Hindi conjunct with its vowel sign). The old tab got
  this wrong (bugs 1 and 4). Two compiled engines can do it: the browser's `Intl.Segmenter` (ICU — what it knows
  depends on the browser's version: the rule that makes a Hindi conjunct one character came with Unicode 15.1 in
  2023, so a browser on an older ICU cuts it in two) and **textkit.wasm**, which already carries
  `unicode-segmentation` (Unicode 17.0) for the Word Counter.
- **Decision (WebAssembly first):** the clusters come from **textkit.wasm** — a new export, `tk_clusters` (15 lines
  of Rust on the crate; the module grew by 1.4 KB to 217 KB), so the tab cuts a text the same way in every browser,
  and the same way the Word Counter counts it. A text that holds only Latin letters with their accents, everyday
  punctuation and currency signs needs no rules at all (a letter with the accents behind it; `plainClusters`, held
  to the engine on thousands of random texts), so the module is fetched **with the first text that has an emoji or
  another script** — nothing at open. **Left in TypeScript:** the tables themselves (data: which character stands
  for which — there is nothing to compute) and `String.prototype.normalize` (the browser's ICU) to open an accented
  letter into letter + accent.
- **Evidence:** the fourteen alphabets equal the characters the Unicode Character Database **names** for them
  (`scripts/make-fancy-reference.py`: "MATHEMATICAL BOLD CAPITAL A" … looked up by name with Python's
  `unicodedata`), the holes filled from Letterlike Symbols; NFKC of thirteen styles gives the plain text back;
  `tk_clusters` equals ICU 78.3 (Unicode 17.0) on texts in ten scripts; the suites of the Word Counter, the Case
  Converter, the Line Tools and the Text Diff were run again after the rebuild (all green).

### 96. `emoji` — Emoji & Symbols (19 Nov 2026)
- **Ours before:** no WebAssembly; the list came from the npm package `unicode-emoji-json` (names only), and the
  search was `name.includes(word)` in TypeScript.
- **What the tab needs:** (1) data — which emoji exist, what they are called, the words people look for them with,
  their skin-tone variants; (2) a search that ranks.
- **Candidates for the search:** no WebAssembly module is made for searching emoji. The pickers on npm
  (`emoji-mart`, `emoji-picker-element`, `emojibase`'s own helpers) search in JavaScript — a prefix index over
  the keywords, kept in IndexedDB by `emoji-picker-element` (state in the browser, which this app does not keep).
  **We have an engine of our own for exactly this:** `textcore.wasm`'s tool-search ranking (own C: whole phrase,
  whole word, beginning of a word, stem, Damerau–Levenshtein for slips of the keyboard), which takes any list of
  records with a name and keywords.
- **Decision (WebAssembly first):** the search runs in **textcore.wasm** — the 2,160 records (emoji and symbols)
  are indexed in 20 ms, a query takes about 2 ms; the module (34 KB) is fetched with the first search. Nothing
  was added to the module.
- **The data** (data, not code — nothing to compile): replaced `unicode-emoji-json` by **`emojibase-data` 18.0.0**
  (MIT; Unicode's emoji list with the CLDR names and keywords — Unicode's own annotations — and every skin-tone
  variant spelled out, which `unicode-emoji-json` only flags). `scripts/make-emoji-data.py` cuts it down to what
  the tab uses (206 KB, 60 KB over the wire, a chunk of its own) and adds the GitHub and Slack shortcodes from the
  same package, a few Indian words, and the symbols with their names from the Unicode Character Database.
  `unicode-emoji-json` stays as a test-only reference.
- **Left in TypeScript:** `src/lib/emoji.ts` (the records handed to the engine, the choice of a skin-tone variant,
  what a cell says) and `src/lib/emoji-support.ts` (ten characters drawn on a canvas to see which Emoji versions
  the device's font has — the browser's canvas does the work).
- **Evidence:** against `unicode-emoji-json` (another author's reading of Unicode's emoji-test.txt): the same 1,914
  emoji spelled the same, in the same groups, with the same versions and the same skin-tone flags; three flags are
  named differently (CLDR's longer names); ours has the nine emoji of Emoji 18 besides. Symbol names equal Perl's
  `charnames` for all 237. Every emoji and symbol is found by its own name, and by its keywords.

### 97. `morse` — Morse Code (19 Nov 2026)
- **Ours before:** no WebAssembly; a table of 54 codes and two one-line functions in TypeScript; the sound by the
  browser's Web Audio.
- **Candidates:** no WebAssembly module exists for Morse code, and none would have work to do: the alphabet is a
  table of 62 entries, a conversion is a look-up per character, and the sound is an oscillator switched by a list
  of times (the browser's audio engine — compiled code — makes the samples). The established implementation is
  **unixcw's libcw** (C, GPL): its job is keying a sound card in real time, which a browser tab does through Web
  Audio; compiling it to WebAssembly would bring a second audio path and nothing the tab lacks.
- **Decision:** stays TypeScript — a table and string handling (`src/lib/morse.ts`, no loops over data worth the
  name); recorded here as the rule asks. **libcw is the reference of the tests instead**: its table (68 characters)
  and its dot, dash and gap lengths at ten speeds are read out of the library by
  `scripts/make-morse-reference.py` (`apt install cw`, ctypes) into `tests/fixtures/morse/reference.json`.
- **Evidence:** 61 characters coded exactly as libcw codes them; its five procedural signals are read; the one
  deliberate difference is "!" (-.-.--, the code in general use — libcw gives that key another meaning, and the
  ITU recommendation has no exclamation mark); dot, dash, the gap inside a letter and between letters equal
  libcw's to its whole microseconds at 5 – 40 words a minute; the word gap is the ITU's seven units.

### 98. `lorem` — Lorem Ipsum (20 Nov 2026)
- **Ours before:** no WebAssembly of its own; 69 words of the classic passage picked at random with libsodium's
  `randombytes_uniform` (crypto.wasm), the sentences put together in TypeScript.
- **Candidates:** no published WebAssembly Lorem generator exists. npm's `lorem-ipsum` (JavaScript) does what ours
  did — random words from a list of 64. The established open-source generator is the Rust crate **`lipsum`**
  0.9.1 (Martin Geisler, MIT; 7.5 million downloads, 2.5 million in the last 90 days): a Markov chain of word pairs
  over the classic passage and the first book of Cicero's *De finibus*, the book the passage was cut from.
- **Decision (rule 2: our own WebAssembly from open-source code):** the crate is compiled into a module of its own,
  **textkit-lorem.wasm** (the `lorem` feature of `wasm/textkit`, 0.13 MB at opt-level s; fetched as the tab opens,
  for the sample text). **Our glue (`src/lorem.rs`)**: exact numbers of paragraphs (4 – 8 sentences each),
  sentences or words; the classic first sentence word for word ("et dolore" also occurs in Cicero, so the chain
  alone wanders off in the middle of it); a text without it begins where one of Cicero's sentences begins; long
  sentences are cut at a comma after 24 words and at 40 at the latest; a 32-byte seed from the page (the same seed
  gives the same text, a larger number more of it).
- **Defects of the crate found by the tests, put right beside it:** (1) at the end of a text its chain has no
  successor for the last two words — it drops the last word and jumps to a random pair, splicing two
  half-sentences ("… id est distinguique …"); natively, in 400 texts of 400 words, "laborum." never appears. Each
  text is learned as a circle now (its first two words once more at its end). (2) Its texts carry quotation marks
  (which come out unbalanced), "--" dashes, "**" footnote marks, "(est)" and Roman initials ("L. Torquato": the
  full stop ended a sentence in the middle of a name) — 1,079 such signs in those 400 texts. The texts are cleaned
  before the chain learns them. Both through the crate's public API (`MarkovChain::new`, `learn`,
  `iter_with_rng_from` and its two text constants); the crate itself is unmodified.
- **Evidence:** a Python reader of the crate's own two texts (`scripts/make-lorem-reference.py`; the crate checked
  by its crates.io SHA-256) lists every pair of neighbouring words: every pair of the output is one of them (60
  texts, 22,000 words); every word is a word of the texts; sentences begin with a capital and end with . ? or !; the
  counts equal what the Word Counter's engine counts (28 sizes, with and without the classic opening); paragraph
  lengths 4 – 8 equally often (χ²).

### 99. `photodict` — Photo Dictionary (20 Nov 2026)
- **Engines:** OCR — **tesseract.js-core** (an established WebAssembly build, rule 1: stays); page clean-up —
  imgproc.wasm (ours); **the ranking — textcore.wasm `rare.c` (our C)**: tokeniser for OCR text, line-break hyphens,
  possessives, a lemmatiser for regular inflections, the wordfreq table in a hash table, the name heuristic; the
  dictionary — data (Wiktionary via kaikki.org, wordfreq), fetched in shards.
- **Candidates for the ranking:** no WebAssembly module does this job. Parts exist elsewhere: wordfreq is Python
  (a Rust port, `wordfreq` by kampersanda, reads the same data but neither tokenises OCR text nor lemmatises);
  lemmatisers are Python or JavaScript (spaCy, wink-lemmatizer); stemmers (Snowball / `rust-stemmers`) cut words
  to stems that are not dictionary words ("perspicaci"), which a dictionary cannot look up.
- **Decision:** our module stays — **with three faults fixed** that the bug hunt found in it: the case mapping of
  U+00C0 – U+024F (now a table generated from Python's `str.lower()`), the full stop of titles and initials
  ("Mr.", "J.") taken for a sentence end, and two unbounded writes in the tokeniser. 34 → 35 KB.
- **Evidence:** all 398 letters lowered as the JavaScript engine lowers them (ICU — a separate implementation);
  the old module's output for "Gdańsk, Wrocław, Łódź" and "Mr. Darcy" recorded beside the new in the bug list;
  the photographed-page suite unchanged in its results (20 words, all 15 rare words of the page).

## Security and codes

### 100. `pgp` — OpenPGP (20 Nov 2026)
- **Ours:** OpenPGP.js 6.3.2 (JavaScript, LGPL-3.0; the latest release) — the library of Proton Mail, audited
  repeatedly (Cure53, 2014 – 2023). No WebAssembly. The GnuPG-compatible profile and the reading of what is pasted
  are ours (`src/tools/pgp.ts`, `src/lib/pgptext.ts`).
- **Candidates:** no published WebAssembly OpenPGP module exists. Open-source code to build one from:
  **rPGP** (crate `pgp` 0.21.1, MIT / Apache-2.0; 8 million downloads, 2.3 million in the last 90 days; Delta Chat;
  audited in 2019 and 2024; v4 and RFC 9580 v6, AEAD, Argon2; a `wasm` feature) and **Sequoia** (2.4.2,
  LGPL-2.0+, a WebAssembly target that its authors call experimental).
- **The check:** rPGP is a *low-level* library — which subkey to encrypt to or sign with, and whether a key is
  expired, revoked or bound by a valid signature, is left to the caller (its README: "NOTE: This is not always the
  right key!"). That layer is where OpenPGP's security decisions are made. Its authors' own layer on top,
  **rpgpie** 0.12.1, is described as "Experimental high level API" (74,000 downloads in all, 8,000 recent), and
  **rsop** (the Stateless OpenPGP interface on it, which would map onto this tab almost one to one) has 26,000
  downloads in all, a few hundred recent.
- **Decision (rule 3, with the reason the rule asks for):** OpenPGP.js stays. Building our module on rPGP would
  mean either an experimental semantics layer or our own key-selection and validity code — swapping an audited,
  widely deployed implementation of exactly that layer for a less tried one, in a tool whose only job is security.
  That is not doable without lowering what the tab is for. **To look at again** when rpgpie is no longer
  experimental (or when an audited WebAssembly OpenPGP module appears). Noted for the owner.
- **Evidence for what stays:** the RFC 9580 Appendix A vectors (the v6 key of A.4 with SEIPD v1 / v2 messages and
  a clear-signed text; AEAD EAX / OCB / GCM and Argon2-protected messages, `tests/fixtures/pgp/rfc9580/`) decrypt
  and verify with the library in Node (`tests/unit/pgp.test.mjs`) and in the tab; GnuPG 2.4 in both directions for
  keys, recipients, signatures, passwords and the revocation certificate (`tests/e2e/pgp.e2e.mjs`).

### 101. `sodium` — Sodium Encrypt (20 Nov 2026; also `sharelink`, which shares the format and the worker)
- **Ours before:** crypto.wasm — libsodium **1.0.20** built by us (minimal, 57 KB) + our C for the USODIUM1 header,
  hashes, random helpers.
- **Candidate:** **libsodium.js** (`libsodium-wrappers-sumo` 0.8.4, ISC — the libsodium project's own WebAssembly
  build, by libsodium's author; carries libsodium **1.0.22**). The standard build (`libsodium-wrappers`) has no
  Argon2 (`crypto_pwhash` is only in "sumo"); the sumo build has everything the format needs: Argon2id up to the
  "Maximum" preset (1 GiB — 4.4 s in Node), the XChaCha20-Poly1305 secretstream, random bytes. Its WebAssembly is
  embedded in the module (base64) — nothing is fetched. 0.53 MB in the worker's chunk (crypto.wasm: 57 KB).
- **Decision (rule 1, with the owner's tweak):** **the cryptography moves to libsodium.js**; what it does not have —
  the 61-byte USODIUM1 header — stays in **crypto.wasm** (our C, written and read in `u_sh_write` / `u_sh_parse`) as the
  supplement. The format is unchanged, byte for byte. The encrypt / decrypt loop moved from the worker into
  `src/lib/usodium.ts` (runs in Node too), on a `StreamCrypto` interface both engines satisfy
  (`src/wasm/libsodium.ts` binds libsodium.js to it). crypto.wasm keeps its other users (hashes, random tools,
  password tabs) until their own entries.
- **Evidence:** the same Argon2id keys from both engines (four parameter sets, a Hindi + emoji password); files of
  0 B – 200 KB written by either engine opened by the other; **`tools/sodium_decrypt.py` (PyNaCl — the C libsodium)
  opens a file written by libsodium.js**; wrong password, a changed bit in the first and in a later chunk, a cut
  after a whole chunk and inside one, bytes added, changed Argon2 parameters — each refused with its message
  (`tests/unit/usodium.test.mjs`); the Sodium and Share Link e2e suites pass on the new engine.

### 102. `sharelink` — Encrypted Share Link (20 Nov 2026)
- **Ours:** none of its own. The cryptography is **libsodium.js** (entry 101) and the USODIUM1 header is crypto.wasm's,
  through the same worker as Sodium Encrypt; the link is the encrypted bytes as URL-safe Base64 after `#/sharelink?d=`.
- **Candidates looked at:** a WebAssembly module for "encrypted share links" does not exist as such — services of the
  kind (PrivateBin, Yopass, onetimesecret) are server programs; PrivateBin's browser side is JavaScript on WebCrypto
  and its links need its server. Nothing to replace.
- **Decision:** stays on entry 101's engines. What the tab adds is reading a link as it arrives after a trip through
  other apps (`readShareLink` in `src/lib/sodium-format.ts`: string glue on the browser's `atob`) — TypeScript, as
  recorded for the reading of typed input in §3a.

### 103. `hash` — Hash / Checksum (20 Nov 2026)
- **Ours before:** crypto.wasm — our C for MD5, SHA-1, SHA-3, CRC-32 and libsodium's SHA-256 / SHA-512 / BLAKE2b,
  behind one `u_hash_*` interface, run in the crypto worker.
- **Candidate:** **hash-wasm 4.13.0** (MIT; Dani Biró; about ten million downloads a month; already in the app for the
  HMAC, TOTP and password-hash tabs, entry 58 ff.) — hand-tuned C compiled to WebAssembly, one small binary per
  algorithm embedded in the package, streaming. It covers all nine algorithms the tab offered and fourteen more that
  people meet next to them: SHA-224 / 384, SHA3-224 / 384, Keccak-256, BLAKE2s, BLAKE3, RIPEMD-160, CRC-32C, CRC-64
  (XZ), Adler-32, xxHash64, XXH3, XXH128.
- **Decision (rule 1):** **the tab moves to hash-wasm**, in a worker of its own (`src/workers/hash.worker.ts`, 143 KB,
  only the algorithms of `src/lib/hashes.ts` bundled; fetched with the first Compute or the first typed text; Stop =
  terminate). Nothing the owner asked for is left out, so no supplement is needed; reading expected checksums and
  writing checksum lists is string glue (`src/lib/checksums.ts`, §3a). crypto.wasm's `u_hash_*` functions are no
  longer called by the app (its unit suite still checks them); they go when crypto.wasm is next rebuilt (with the
  password tabs' entries).
- **Evidence:** 38 inputs × 23 algorithms equal to implementations that share no code with hash-wasm — Python's
  hashlib (OpenSSL 3.5), zlib, pycryptodomex (Keccak), the `blake3` package (the BLAKE3 team's Rust code), `xxhash`
  (Yann Collet's C), `crc32c`, and CRC-64 cross-checked with liblzma (`scripts/make-hash-reference.py`); whole and in
  odd pieces; the tab's checksum lists accepted by `sha256sum -c`, `md5sum -c`, `b2sum -c`, `xxhsum -c`,
  `rhash --check`; in the browser the same 23 digests for texts and a 3 MiB file.

### 104. `password` — Password Generator (20 Nov 2026)
- **Ours before:** crypto.wasm's `u_uniform` (libsodium 1.0.20's `randombytes_uniform`, built by us).
- **Candidate:** **libsodium.js** (`libsodium-wrappers-sumo` 0.8.4, libsodium 1.0.22 — the libsodium project's own
  WebAssembly build, already in the app since entry 101): `randombytes_uniform` — unbiased integers from the browser's
  cryptographic generator, the same routine as ours.
- **Decision (rule 1):** **the tab moves to libsodium.js** (`uniform` in `src/wasm/libsodium.ts`). The cost: the tab
  shows passwords as it opens, so the 0.53 MB chunk (0.17 MB over the wire) comes with it instead of crypto.wasm's
  57 KB — recorded in the lazy test's list with the reason; the chunk is the one Sodium Encrypt and Share Link use,
  so the browser has it once for all three. The choice of characters, the one-of-each rule and the exact entropy are
  string glue and a little BigInt arithmetic (`src/lib/passwords.ts`, §3a).
- **Evidence:** the unit suite draws from libsodium.js in Node: 2,000 four-character passwords with all four sets;
  the 24 orders of four sets as often as their exact shares (χ²); the characters of 20,000 passwords of 20 at their
  exact shares (χ²); the count of passwords by inclusion–exclusion equal to counting every string one by one.

### 105. `passphrase` — Passphrase Generator (20 Nov 2026)
- **Ours before:** crypto.wasm's `u_uniform` (as tab 104).
- **Decision (rule 1):** **libsodium.js's `randombytes_uniform`**, as the Password Generator (entry 104) — the same
  chunk, so the two tabs and Sodium Encrypt share one download. The word list is data (the EFF large list, 62 KB,
  byte for byte the copy the `xkcdpass` package ships); picking words is string glue (`src/lib/passphrases.ts`).
- **Evidence:** in Node on libsodium.js: 800 passphrases of 3 – 12 words with each separator read back word by word
  from the list; the first letters of 77,760 drawn words at their shares of the list (χ²).

### 106. `qr` — QR Generator (20 Nov 2026; also `barcode`, `scan`, which share the engine)
- **Ours:** none. The engine is **zxing-wasm 3.1.7** (MIT; zxing-cpp's reader and zint's writer compiled to
  WebAssembly; the `full` build) — an existing, widely used module, at its latest version (published 15 Nov 2026).
- **Decision:** stays (rule 1). What goes into a code (Wi-Fi, UPI, vCard, mailto, SMSTO, tel, VEVENT) and the checks
  on what was typed are string glue (`src/lib/qrdata.ts`, §3a).
- **Evidence:** every kind of code the tab makes, saved as PNG, is read back by the Scanner tab (zxing) and by
  **zbar 0.23** (`zbarimg`, an independent decoder), byte for byte, Hindi and emoji included.

### 107. `zip` — Create Zip (20 Nov 2026)
- **Before:** zip.js 2.25 (JavaScript; the browser's own deflate and WebCrypto's AES) — recorded in §3a as a
  JavaScript component "because libarchive's wasm build has no crypto".
- **Candidates:** **7z-wasm 1.2.0** (7-Zip 24.09 compiled to WebAssembly with Emscripten by use-strict; LGPL-2.1 +
  unRAR restriction; 1.65 MB, 0.68 MB over the wire; includes WORKERFS, so the chosen files are read in place, not
  copied) — creates zip (deflate levels, AES-256 — WinZip's format — UTF-8 names) and 7z (LZMA2, AES-256, encrypted
  names). libarchive.js 2.0.2 — its WebAssembly build writes archives but without encryption.
- **Decision (rule 1 with the owner's tweak):** **7-Zip makes the archives**, in a worker of its own
  (`src/workers/sevenzip.worker.ts`; a fresh instance per archive; Stop = terminate). What it does not cover: an
  archive larger than the browser can hold in memory (7-Zip writes into Emscripten's in-memory file system; the heap
  limit is 2 GiB) — **zip.js stays beside it for zips above 1.5 GB of input (256 MB on phones)**, rule (b): it streams.
  A 7z beyond that is refused with the reason. Non-ASCII zip passwords: native 7-Zip refuses them for zip
  (E_INVALIDARG) and the wasm build aborts — the tab refuses them with the reason and offers 7z (UTF-16 passwords), so
  no archive is made that 7-Zip or WinRAR could not open.
- **Evidence:** zips read by Python's zipfile (CRC, names with the UTF-8 flag, store / deflate, the files' dates),
  pyzipper (AES-256: right and wrong password) and the native 7z; 7z archives read by **py7zr** (a 7z implementation of
  its own: bytes, a Hindi password, names encrypted); Stop during a 96 MB archive; on a phone, 260 MB zipped by zip.js
  and read by zipfile.

### 108. `unzip` — Extract Archive (20 Nov 2026)
- **Before:** zip.js (JavaScript) for zips; **libarchive.js 2.0.2** (libarchive compiled to WebAssembly) for the rest.
- **Candidates:** libarchive.js (as it is) and **7z-wasm 1.2.0** (7-Zip 24.09, entry 107 — already in the app). 7-Zip
  reads everything the tab names and more (zip incl. AES / ZipCrypto, 7z incl. encrypted names, RAR 1.5 – 5 incl.
  encrypted headers, tar, gz, bz2, xz, iso, cab, wim, cpio, arj, lzh, rpm, deb, dmg …).
- **Decision (rule 1):** **7-Zip reads every archive**; zip.js and libarchive.js are no longer used for reading
  (libarchive.js leaves the app). A tar inside gzip / bzip2 / xz is opened in its turn (7-Zip lists the .tar).
  What the build does differently from the 7zz program, and how the tab copes: an encrypted header that does not
  decrypt throws (no C++ exception handling in this build) instead of an error code — the worker tells a password
  question from damage by the archive's signature (only 7z and RAR can hide their names); 7zz would ask for a
  password on its input — the worker always passes `-p` (empty = none). Debian's 7z, used as a reference elsewhere,
  has its RAR code removed: RAR results are compared with **The Unarchiver (`unar`)**.
- **Evidence:** zips, tars (gz / bz2 / xz), 7z (also with a Hindi password and encrypted names) made by Python's
  zipfile / tarfile, pyzipper and py7zr, and real RAR3 / RAR5 archives from rarfile's tests: listed, single files and
  "Download all as .zip" byte-identical; RAR contents equal to `unar`'s.

## Images (20 Nov 2026 –)

### 109. `image` — Image Editor (20 Nov 2026)
- **Ours:** imgproc.wasm (our C): the adjustments (exposure in EV, brightness, contrast, highlights, shadows,
  saturation, vibrance, hue, temperature, tint), sharpening, rotation by any angle, quarter turns and flips, crop,
  Lanczos-3 resize. Encoders: jSquash's MozJPEG 1.6.0, libwebp 1.5.0, OxiPNG 2.3.0 — the latest.
- **Candidates:** **@imagemagick/magick-wasm 0.0.46** (ImageMagick's own build, Apache-2.0, no threads needed):
  15.5 MB of WebAssembly; on a 1600 × 1200 preview (Node, the same machine) modulate + brightness-contrast 236 ms,
  unsharp 493 ms, rotate 634 ms — imgproc does all ten adjustments in one pass in 70 ms, sharpening in 396 ms, the
  rotation in 118 ms; and it has no exposure in EV, highlights / shadows, vibrance or temperature / tint.
  **wasm-vips 0.0.19** needs SharedArrayBuffer (threads), which needs cross-origin isolation — GitHub Pages cannot
  send those headers and a service worker is not allowed (§1): excluded. **@jsquash/resize 2.1.1** (Squoosh's resize,
  Rust → 34 KB of WebAssembly; the codecs' own family): Lanczos-3 **in linear light** with premultiplied alpha — a
  1-pixel black / white checkerboard halves to 187 (the right grey), where arithmetic on sRGB values (ours, Pillow's,
  ImageMagick's default) gives 127; 1.4 s for 12 MP → 1600 × 1200 (ours 0.9 s).
- **Decision:** **resizing moves to @jsquash/resize** (rule 1: an existing module for the part it covers; in the codec
  worker); **imgproc stays for the live adjustments, geometry and sharpening** — magick-wasm would make every slider
  move two to five times slower for a 150 times larger download and still need imgproc beside it for the
  adjustments it lacks (Claude's judgement, as for ICU4X in entry 90). The JPEG encoder gets the picture on white when
  it has transparency (the browser's canvas compositing).

### 110. `batch` — Batch Images (20 Nov 2026)
- **Ours:** imgproc.wasm's resize; jSquash's encoders. **Decision:** as entry 109 — resizing moves to
  **@jsquash/resize** (Lanczos-3 in linear light, premultiplied alpha, in the codec worker); decoding stays with the
  browser (and libheif-js / jSquash where it cannot), encoding with jSquash.

### 111. `heic` — HEIC → JPG (20 Nov 2026)
- **Engine:** libheif-js 1.23.5 (libheif + libde265 compiled to WebAssembly) — an existing module, the latest; stays.
- **What it does not cover:** colour management. libheif hands out the pixels in the photo's own colour space; an
  iPhone photo is in Display P3 (its ICC profile travels in the file), and read as sRGB its colours are off — a
  saturated red 220 where it is 240 in sRGB. **Candidate for that part: lcms-wasm 1.0.5** (Little CMS 2.16, the
  colour engine of GIMP, Krita and Pillow's ImageCms, compiled to WebAssembly by Matt DesLauriers; MIT; 316 KB).
- **Decision (rule 1 with the owner's tweak):** libheif-js decodes; **lcms-wasm converts to sRGB with the photo's own
  profile** (relative colorimetric, alpha kept, a strip of a million pixels at a time), in the codec worker, fetched
  only for a HEIC that carries a profile other than sRGB. Reading the profile from libheif's handle is glue
  (`src/lib/heic-color.ts`). Not covered: a HEIC that describes its colours only with an "nclx" box (no ICC profile)
  in a space other than sRGB — lcms-wasm's build cannot make a profile from primaries; such files are used as they are.
- **Evidence:** a chart of saturated Display P3 patches (made by pillow-heif with the profile of pug.heic) and a real
  iPhone photo, converted in Node and in the browser, equal Pillow's ImageCms (LittleCMS, native) within 2 levels.

### 112. `passport` — Passport Photo (20 Nov 2026)
- **Engines:** MediaPipe Tasks 1.2.3 (Google's own build — the latest: face landmarks, selfie segmentation) and
  imgproc.wasm (ours: the person mask from the six classes, the guided-filter matte, compositing, the one warp that
  straightens, scales and crops). **Candidates for imgproc's part:** none that does a guided-filter matte (OpenCV.js's
  default build has no `ximgproc`; magick-wasm and wasm-vips: entry 109). **Decision:** both stay; the digital-upload
  copy is resized with @jsquash/resize (entry 109).

### 113. `formphoto` — Photo & Signature Resizer (20 Nov 2026)
- **Engines:** MediaPipe Tasks 1.2.3 (BlazeFace, for placing the frame on the face — Google's build, the latest);
  imgproc.wasm (ours: the crop, the paper clean-up `inkToAlpha`); jSquash's MozJPEG (the highest quality under the
  maximum); metacore.wasm (ours: the dpi in the JFIF header, the padding with JPEG comments up to the minimum).
- **Candidates:** for the resize, @jsquash/resize (entry 109) — taken, as in the other image tabs. For the paper
  clean-up: none (OpenCV.js could threshold, but not keep the ink's colour on white; magick-wasm: entry 109). For
  metacore's two jobs: exiftool and libexif have no WebAssembly build that writes a JFIF density or pads a file;
  piexifjs is JavaScript and handles EXIF, not JFIF. **Decision:** imgproc and metacore stay; resizing moves to
  @jsquash/resize. metacore's padding was made exact (it could end 1 – 3 bytes above its target).

### 114. `bgremove` — Background Remover (20 Nov 2026)
- **Engines:** MediaPipe Tasks 1.2.3 with the selfie multiclass model (Google's build, the latest; 16 MB, shared with
  the Passport tab) finds hair, skin and clothes; imgproc.wasm (ours) joins the classes into a person mask, makes the
  guided-filter matte at full size and composites. **Candidates:** `@imgly/background-removal` (ISNet on ONNX Runtime
  Web, AGPL-3.0, 40 – 170 MB of models; any subject — objects and animals too); MODNet (Apache-2.0, portrait matting,
  25 MB ONNX); U²-Net (Apache-2.0); BRIA's RMBG-1.4 (licence for non-commercial use only). None replaces the guided
  filter at full resolution (they give a mask at their input size, 320 – 1024 px). **Decision:** MediaPipe and imgproc
  stay — the tab is a person cut-out (the owner's ask), and MediaPipe is the existing module that does it; the saved
  background photo is resized with @jsquash/resize (entry 109). Objects and animals would need a second model of at
  least 40 MB (imgly's ISNet, on the ONNX Runtime the app already ships for Text-to-Speech) — a feature the owner has
  not asked for; noted for the owner rather than added.

### 115. `cartoon` — Cartoonizer (20 Nov 2026)
- **Ours:** imgproc.wasm's six filters (bilateral + k-means + DoG lines, Kuwahara, watercolour, pencil, halftone).
  **Candidates:** OpenCV.js (8 – 10 MB for the whole library; its non-photorealistic functions — stylization,
  pencilSketch, edgePreservingFilter — give another look and cover neither the k-means cartoon, the halftone nor the
  watercolour); magick-wasm (entry 109: no Kuwahara-like oil paint with these controls, 15 MB). **Decision:** imgproc
  stays.
- **AI styles:** Magenta's arbitrary style transfer on TensorFlow.js — its WebAssembly backend (XNNPACK, Google's
  official build) is the CPU engine, WebGL the GPU one. **Candidate:** ONNX Runtime Web (already in the app for
  Text-to-Speech) after converting the graph with tf2onnx — the same XNNPACK kernels on the CPU, and no maintained
  WebGL path (ORT's WebGL backend is deprecated; WebGPU needs the 29 MB JSEP build). **Decision:** TF.js stays (its
  WebAssembly backend is the WebAssembly engine; the GPU path would be lost).

### 116. `redact` — Blur & Redact (20 Nov 2026)
- **Engines:** MediaPipe Tasks 1.2.3 Face Detector with BlazeFace short range (Google's build, the latest — the one
  face model the Tasks API publishes), run on the whole photo and on tiles at three finer scales; imgproc.wasm (ours):
  crops and resizes of the tiles, NMS, pixelate / blur / fill. **Candidates:** YuNet on OpenCV.js (8 – 10 MB for the
  library, a 230 KB model; finds small faces without tiles); RetinaFace / SCRFD on ONNX Runtime Web (1 – 3 MB
  models). **Decision:** MediaPipe and imgproc stay — the tiled search finds the six small faces of the test's group
  photo and of a 3600 px one; a second engine would add megabytes for what the tiles already do. Noted: YuNet is the
  first thing to try if faces at an angle or in profile are missed in real photos.

### 117. `watermark` — Watermark (20 Nov 2026)
- **Engines:** the browser's canvas (text shaping with its own HarfBuzz, compositing); imgproc for the preview's logo;
  jSquash for encoding. **Decision:** the canvas stays (a WebAssembly HarfBuzz + FreeType would repeat the browser's
  own compiled text engine and need fonts for every script); the logo of the saved photos and the iPhone downscale go
  to @jsquash/resize (entry 109).

### 118. `caption` — Text on Image (20 Nov 2026)
- **Engines:** as entry 117 (canvas text). Line breaking is ours (`src/lib/textwrap.ts`: words by spaces, an over-long
  word between grapheme clusters by the browser's Intl.Segmenter). **Candidate:** ICU4X's line segmenter (UAX #14 —
  would break Chinese and Japanese at the right places, Thai by dictionary) — one file of 20 MB (entry 90).
  **Decision:** our wrapping stays; breaking between any two characters is acceptable for Chinese and Japanese.

### 119. `collage` — Collage Maker (20 Nov 2026)
- **Engines:** imgproc (crops; the preview's resizes), canvas (rounded clips, background), jSquash (encoding; the A4
  JPEG's 300 dpi by metacore). **Decision:** the saved collage's photos are resized with @jsquash/resize (entry 109);
  the rest stays.

### 120. `exif` — EXIF / Photo Info (20 Nov 2026) — **replaced: ExifTool**
- **Ours:** metacore.wasm (own C): an EXIF IFD walker and a JPEG / PNG / WebP stripper. It read no HEIC (an iPhone 13
  Pro photo with its position was "no EXIF metadata"), no XMP, IPTC, maker notes or PNG text, and its strip dropped
  the orientation (portrait photos came out on their side) and re-encoded HEIC and WebP to JPEG.
- **Candidates:** **ExifTool 13.42 on zeroperl** (`@uswriting/exiftool` 1.0.9 + `@6over3/zeroperl-ts` 1.0.10,
  Apache-2.0: Perl 5 compiled to WebAssembly with Phil Harvey's ExifTool — the reference tool for photo metadata —
  inside; 25 MB, 7.6 MB gzipped); exiv2-wasm 0.5 (Exiv2, 5 MB); libexif-wasm 0.5 (EXIF only); @saschazar/wasm-exif
  (EXIF only, 2022).
- **Check:** ExifTool-wasm against the native exiftool on every photo of tests/fixtures/images: the same tags with the
  same values (only an iPhone HEIC differs, where 13.42 decodes a few more Apple maker-note tags than Ubuntu's 12.76);
  0.3 – 0.5 s a photo after the first; it writes JPEG, PNG, WebP, HEIC and TIFF without touching the picture (JPEG scan
  data and PNG image data byte for byte, HEIC pixels by Pillow).
- **Decision (rule 1):** ExifTool is the engine of the tab — reading every tag of every format, and "Save without
  metadata" (`-all= --icc_profile:all -tagsfromfile @ -orientation -jfif:all`: the colour profile, orientation and
  density stay). It runs in a worker (zeroperl is told it is in a browser; one job at a time — two at once crashed
  the page), fetched with the first photo, released on leave. metacore stays for the other tabs (orientation on
  loading, JPEG dpi and padding, sniffing); its `m_strip` is no longer used by any tab.

### 121. `scanner` — Doc Scanner (20 Nov 2026) — **page finding: an existing model on ONNX Runtime Web**
- **Ours:** imgproc.wasm (own C): page outline by Otsu's threshold + the largest region + its extreme points; the
  homography warp; the clean-up (colour / grey / black and white).
- **Candidates:** **scanic 1.8.0** (MIT; Rust → WebAssembly for blur, Canny and dilation; the contours, the corner pick
  and the warp in JavaScript) with its optional **ML detector — DocCornerNet LEAN** (scanic-ml 0.2.0, MIT: a
  MobileNetV2 corner network, 1.9 MB, trained on MIDV-500, SmartDoc 2015, UVDoc, WarpDoc and a Roboflow set; it ships
  its own trimmed ONNX Runtime build); **OpenCV.js 5.0** (OpenCV's own WebAssembly build, packaged by TechStark, 14.7 MB;
  the textbook recipe: blur → Canny → dilate → contours → the largest four-sided one — what jscanify does).
- **Check:** (1) the 17 real photos of scanic's repository with hand-checked corners (`testImages/ground-truth.json`;
  pre-filled by the ML detector, then corrected by hand — so leaning towards it): corners within 2 % of the diagonal —
  ours 10, scanic classic 8, OpenCV 9 (6 found nothing), scanic ML 15. (2) 53 photos made for this check (pages,
  receipts, a magazine page, cards on scikit-image's photos and plain desks; perspective, shadows, a thumb, blur,
  noise, JPEG — no detector had seen them): ours 20, scanic classic 15, OpenCV 22 (18 nothing), scanic ML 43 (its 8
  misses: card-like objects without text, where it says it is not sure). Ours fails where the paper is not much
  lighter than the desk (white paper on a light desk, a grey desk, a page held in a hand). When the network is not
  sure (P < 0.5) its corners are mostly wrong (5 – 39 %), so its own threshold is kept.
- **Decision (rule 1):** page finding moves to **DocCornerNet LEAN on ONNX Runtime Web 1.31** — Microsoft's official
  WebAssembly build that the app already ships for Text-to-Speech (the same file, so the browser's cache serves both;
  scanic's trimmed runtime and its JavaScript are not used: feeding the network and reading its eight numbers is 30
  lines, `src/lib/pagefind.ts`), in a worker, fetched with the first page (3.9 + 1.7 MB over the wire). **Supplement
  (rule 1a):** the network was trained on photos made 224 × 224 with OpenCV's area resize, so imgproc gets
  `p_resize_area` — OpenCV's INTER_AREA reproduced (equal to cv2 5.1 pixel for pixel when shrinking; tests 38). When
  the network is not sure, or cannot be fetched, imgproc's outline is used, then the whole photo. The warp and the
  clean-up stay imgproc's (scanic's warp is JavaScript; no candidate has the clean-up). OpenCV.js is not used: worse on
  both sets than the network and 14 MB.

### 122. `ocr` — OCR (20 Nov 2026)
- **Engine:** tesseract.js 7.0.0 + tesseract.js-core 7.0.0 (Tesseract, the project's own fork at 5.1.0-288, compiled to
  WebAssembly; LSTM only, SIMD and relaxed-SIMD builds) with the `4.0.0_best_int` models of English, French, Spanish
  and German — the existing module, at its latest version; imgproc for the clean-up, turning and scaling.
- **Candidates:** PaddleOCR (PP-OCRv5 mobile detection + recognition, Apache-2.0) on ONNX Runtime Web (already in the
  app) through community wrappers (ppu-paddle-ocr, @gutenye/ocr-browser — tens of thousands of downloads at most): often
  better on camera photos of signs and screens, but it gives lines, not the words with their confidences and places
  that the tab marks, and no paragraphs; Tesseract's own orientation detection (OSD) needs the legacy engine and its
  model (another 10 MB core + data).
- **Decision:** Tesseract stays (rule 1: the existing module covers what the tab is asked for). What it does not cover —
  reading a sideways or upside-down picture — is added beside it in the tab (rule 1c, our own glue): a reading below 60 %
  confidence is tried on a smaller copy turned the three other ways, and the picture is read the way that is clearly
  better. PaddleOCR on ONNX Runtime is the thing to try if real camera photos read badly.

### 123. `signature` — Signature Maker (20 Nov 2026)
- **Engines:** the browser's canvas draws the strokes (its own compiled Skia) and the typed name (its HarfBuzz);
  imgproc.wasm (ours) takes the ink off a photo of paper (`inkToAlpha`), trims and crops; jSquash's OxiPNG and MozJPEG
  encode. **Candidates:** signature_pad and perfect-freehand (smoothing and pressure — JavaScript, no WebAssembly; the
  canvas would still draw); for the ink: none (OpenCV.js can threshold but not keep the ink's colour on transparent
  paper — entry 113). **Decision:** all stay.

## Documents — PDF (20 Nov 2026 –)

### 124. `pdf-merge` — Merge PDF (20 Nov 2026; the page routine is shared with `pdf-split` and `pdf-organize`)
- **Engine:** MuPDF 1.28.6 (Artifex's own WebAssembly build — the latest). **Candidates:** PDFium compiled to
  WebAssembly (@embedpdf/pdfium; Google's engine, it can import pages), QPDF builds for the browser (few users, old),
  pdf-lib (JavaScript). None does more for merging than MuPDF does with the right calls.
- **What MuPDF's `graftPage` does not cover** (found in this hunt): a page's annotations — comments, highlights,
  stamps, web links, links between pages, form fields — and the document's outline. **Decision (rule 1, the gaps by
  1c, our own glue in `src/lib/pdf.ts`):** one document's pages go through MuPDF's own `rearrangePages` (it keeps
  annotations, renumbers links and the outline; the form's field list, which it drops, is put back); several
  documents: the first is the base, the others' pages are grafted with one graft map per file, their annotations
  copied, links made again with the pages renumbered, form fields added and outlines appended. pypdf reads the results
  in the unit suite as the independent reference.

### 125 – 127. `pdf-split`, `pdf-organize`, `img2pdf` (20 Nov 2026)
- MuPDF 1.28.6, as entry 124 (Split and Organize: `rearrangePages`). Images → PDF: MuPDF embeds JPEG and PNG as they
  are and reads an image's resolution (JFIF, pHYs, EXIF) — used for "Fit to image"; images it cannot embed (HEIC, WebP,
  a JPEG stored on its side) are decoded by libheif-js / the browser and re-encoded by jSquash's MozJPEG. Nothing to
  replace.

### 128. `pdf-compress` — Compress PDF (20 Nov 2026)
- **Engines:** MuPDF 1.28.6 (decoding images, subsetting fonts, deduplicating, writing); jSquash's MozJPEG; resizing
  moved from imgproc to **@jsquash/resize** (Lanczos in linear light — entry 109); imgproc expands MuPDF's pixmaps to
  RGBA. **Candidates:** Ghostscript, the usual PDF compressor — its WebAssembly builds are one-person projects
  (@jspawn/ghostscript-wasm, unmaintained since 2022 — rejected in §6; ghostpdl-wasm forks) and Ghostscript rewrites
  the whole file (forms and annotations are often flattened or lost). **Decision:** MuPDF stays.

### 129. `pdf-sign` — Sign PDF (20 Nov 2026)
- MuPDF (the page, the image XObject with its soft mask, Helvetica for the date), the browser's canvas (strokes, typed
  names), imgproc (the ink off a photo), jSquash (PNG). As entries 123 and 124: nothing to replace. A cryptographic
  digital signature (PAdES) is not what the tab makes (it says so); MuPDF's signing needs a certificate the user does
  not have here.

### 130. `pdf-fill` — Fill PDF Form (20 Nov 2026)
- MuPDF's widgets (values, appearance streams, `bake` for flattening): nothing to replace. Found: MuPDF draws text
  fields with its built-in sans (Latin, Greek, Cyrillic) whatever font the form's /DA names — a ₹ is a gap; PDFium
  (@embedpdf/pdfium) is the candidate to look at if that matters to the owner.

### 131 – 132. `pdf-unlock`, `pdf-protect` (20 Nov 2026)
- MuPDF's writer (AES-256 R6, AES-128, RC4 read; `encrypt=none`): nothing to replace. mupdf.js has no call for digital
  signatures; they are found in the form's fields (our glue, `signatureCount`).

### 133 – 135. `pdf2text`, `pdf-pagenum`, `pdf-watermark` (20 Nov 2026)
- MuPDF (structured text; content streams with Helvetica; images for other scripts drawn by the browser's canvas):
  nothing to replace. MuPDF has no layout-keeping text mode (poppler's `pdftotext -layout` has one); the PDF → Text
  option is labelled for what it does.

### 136. `epub` — PDF → EPUB (20 Nov 2026)
- **Ours:** textcore's XY-cut (`t_xycut`, own C: reading order and columns) and imgproc's `p_ink_regions` (own C:
  vector figures as ink outside the text), on MuPDF 1.28.6 (text spans with their fonts, images, drawing) and jSquash's
  MozJPEG; fflate zips. **Candidates (existing WebAssembly):** MuPDF itself — the official build already in the app has
  page segmentation (`toStructuredText('segment')`: nested "Split" blocks), `dehyphenate`, `paragraph-break` (marks
  headings) and `table-hunt`; no WebAssembly PDF → EPUB converter exists (Calibre's is Python + Qt; pdf2htmlEX is C++
  with poppler and makes fixed-layout HTML, not reflowable text).
- **The check:** five real PDFs of public test corpora (pdf.js's `tracemonkey.pdf`, a 14-page two-column ACM paper;
  pypdf's LaTeX multicol sample; the Federal Register of 6 August 2020, three columns; GeoTopo, 30 pages of mathematics;
  a review whose fonts have no Unicode maps) — words of each method in the order of poppler's `pdftotext`
  (longest common subsequence; poppler is no perfect reference: it reads the generated two-column fixture and the
  multicol sample with the top of the right column first, where ours is right):

  | PDF | ours before | ours now | MuPDF `segment` | MuPDF plain |
  |---|---|---|---|---|
  | tracemonkey (2 columns) | 97.9 % | 97.8 % | 94.7 % | 94.2 % |
  | multicol (2 columns) | 91.3 % | 91.3 % | 85.2 % | 85.2 % |
  | Federal Register (3 columns) | **55.2 %** | 93.6 % | 79.9 % | 81.1 % |
  | GeoTopo (1 column, maths) | 97.6 % (3,561 words) | 97.3 % (3,773 words) | 96.8 % | 97.1 % |

  MuPDF's segmentation changes the order little and gives no column numbers (the tab labels "Page N · Column K").
  **Decision:** our XY-cut stays (MuPDF's segmentation reads worse — Claude's judgement under the owner's rule); MuPDF
  stays for everything else. The Federal Register exposed two faults of ours, fixed in our C: gutters had to be 8 pt
  (theirs are 7.5 pt — now 0.45 × the body text), and the first vertical split numbered columns (a stamp up the margin
  became "Column 1", the three real columns one). Not taken: MuPDF's `paragraph-break` (our paragraphs follow indents
  and line pitch) and `table-hunt` (tables as HTML tables would be a new feature — for the owner to pick).
- **Also:** epubcheck 5.2.1 (the W3C's validator, Java) runs on every EPUB of both suites where it is installed.

### 137. `sheet` — CSV / Excel (20 Nov 2026)
- **Ours:** sheet.wasm — calamine 0.38 (reads .xlsx .xlsm .xlsb .xls .ods; the Rust reader behind python-calamine and
  fastexcel), rust_xlsxwriter 0.102, the `csv` crate — built by us: no WebAssembly build of calamine is published.
  **Candidates:** DuckDB-wasm (official; a famous CSV sniffer; .xlsx through its `excel` extension, fetched from
  extensions.duckdb.org unless hosted here; no .xls / .xlsb / .ods; about 35 MB); SheetJS (JavaScript, not WebAssembly;
  the npm package is stuck at 0.18.5 with published CVEs, newer versions only from its own CDN); LibreOffice compiled to
  WebAssembly (ZetaOffice: hundreds of MB, not made for this). **Decision:** sheet.wasm stays — it reads more formats
  than DuckDB-wasm at 1.4 MB, and LibreOffice Calc now checks it cell by cell (unit suite).
- **Beside it (the owner's tweak: what the module does not cover):** "Excel" files that are web pages (bank statements)
  and Excel 2003 XML — calamine reads neither. They are read with the browser's DOMParser (its HTML5 parser, compiled
  C++ — like JSON.parse in §3a's list) and our TypeScript lays the cells on a grid (`src/lib/sheetdata.ts`); a
  supplementary WebAssembly module (html5ever) would only duplicate the browser's parser. The text encodings of CSV
  files (UTF-16, Windows-1252) are the browser's TextDecoder.

### 138. `markdown` — Markdown Editor (20 Nov 2026)
- **Ours:** cmark-gfm 0.29.0.gfm.13 — GitHub's own C implementation of GitHub Flavored Markdown — built by us from the
  source the PyPI package `cmarkgfm` vendors (SHA-256 pinned). **Candidates:** markdown-wasm (md4c compiled by rsms;
  last release 2021; no footnotes and no tag filter), WebAssembly builds of comrak (Rust, GFM-compatible; small
  one-person packages), pulldown-cmark (no WebAssembly package of note). None is GitHub's own renderer, and none is
  more tried and tested than it. **Decision:** ours stays. Now held to every example of the GFM spec and of cmark-gfm's
  extension, smart-punctuation and regression files at the same tag (744): 732 give the spec's HTML, 12 differ exactly
  as the extensions GitHub always switches on make them (tag filter 6, autolinks 5, one "must not crash").
- **Beside it:** heading ids as GitHub gives them (`src/lib/mdslug.ts`, held to npm's github-slugger), and the
  rendered HTML tidied in an inert DOMParser document (pictures from other sites, links, ids) — glue in TypeScript.

### 139 – 141. `invoice`, `rent`, `resume` — the document generators (20 Nov 2026)
- **Engine:** MuPDF's own HTML layout (the official build already in the app; HarfBuzz shaping) through an in-memory
  EPUB (`src/lib/htmlpdf.ts`), mathcore for the GST arithmetic, zxing-wasm for the UPI QR code. **Candidates:** no
  HTML → PDF engine exists as WebAssembly besides MuPDF's (WeasyPrint, wkhtmltopdf and Chromium are not); typst
  (Rust, compiled to WebAssembly as typst.ts) is a typesetter of its own markup — the templates would be written anew,
  with tens of MB of fonts and packages, for the same pages. **Decision:** MuPDF stays. Found on the way: the pages were
  drawn into the PDF without their links, and MuPDF reads mailto: / tel: as paths beside the chapter ("OEBPS/mailto:…")
  — the links are made again on the drawn pages now (getLinks → createLink).

### 142. `audio` — Audio Recorder (20 Nov 2026)
- **Ours:** audio.wasm (LAME 4.0 MP3 encoder + our C: WAV, peaks, levels, gain, fades, resampler, WSOLA) built by us;
  mediabunny (JavaScript, MPL-2.0) cuts the original codec without re-encoding. **Candidates:** lamejs is JavaScript;
  wasm-media-encoders (LAME + Ogg Vorbis compiled to WebAssembly, one-person package, LAME 3.100) and
  @breezystack/lamejs; ffmpeg.wasm (31 MB for an MP3 encoder). None is more tried and tested than LAME itself, which
  we build at its latest release. **Decision:** ours stays. New: `a_mix2` (two signals with their own gains) for the
  Noise Remover; decoding at the file's own rate (mediabunny reads it from the headers, an OfflineAudioContext of that
  rate decodes — glue).

### 143. `tts` — Text-to-Speech (20 Nov 2026)
- **Ours:** eSpeak NG 1.52 (our build) for phonemes; **ONNX Runtime Web 1.31** (Microsoft's official build) runs Kokoro-82M
  and Piper. **Candidates:** kokoro-js (JavaScript around transformers.js, which itself runs ONNX Runtime Web — the same
  engine with more JavaScript), piper-tts-web / @mintplex-labs/piper-tts-web (ONNX Runtime Web + an Emscripten
  espeak-ng build, one-person packages), sherpa-onnx's WebAssembly TTS (Kaldi project, official; Piper/Kokoro voices,
  but its own 30 MB+ build and no streaming per sentence in the browser package). **Decision:** ours stays — the network
  runs on the famous official module already; our eSpeak build is at its latest release.

### 144. `noise` — Noise Remover (20 Nov 2026)
- **Ours:** rnnoise.wasm — our zig build of the RNNoise 0.2 release (5.6 MB; 5.05 MB gzipped) + glue (framing, lag,
  mix). **Candidates** (npm, monthly downloads from the registry's search): **@jitsi/rnnoise-wasm 0.2.1** (Jitsi Meet's
  build, Apache-2.0, 328 k), @shiguredo/rnnoise-wasm 2025.1.5 (Apache-2.0, 118 k; a later RNNoise: 23 dB apart from the
  0.2 release, 1.8× slower), @timephy/rnnoise-wasm (a fork of Jitsi's, 37 k), simple-rnnoise-wasm (23 k),
  @echogarden/rnnoise-wasm (18 k), @sapphi-red/web-noise-suppressor 0.4.1 (AudioWorklet nodes around Shiguredo's RNNoise,
  Speex and GTCRN — GTCRN is a newer, better-scoring model but works at 16 kHz only, which would cut the high band of
  every 44.1 / 48 kHz recording; worklets are for live sound, not files), DeepFilterNet 3 (48 kHz and better than
  RNNoise, but no published, widely used WebAssembly build — deepfilternet3-noise-filter is a LiveKit plug-in).
- **Check:** each build run on the same 48 kHz input in Node against a **native build of the RNNoise 0.2 release**
  (`scripts/make-rnnoise-reference.sh`). Jitsi's package has two builds: its async `rnnoise.wasm` still carries the 0.1
  model; its **sync file carries 0.2** and equals the native release **as the release's own configure builds it** — the
  network on the model's 8-bit weights (`DISABLE_DEBUG_FLOAT`): every frame within 0.01 dB, voice probabilities equal to
  four decimals. **Ours compiled the sources without configure and so ran the float weights — the release's debugging
  option (`--enable-dnn-debug-float`)**: 0.12 dB apart at the first frame, 2.4 dB at the worst, and four times the size.
- **Decision: Jitsi's build replaces ours** (the famous module, the release's standard computation, 1.34 MB gzipped
  instead of 5.05). Beside it (glue, `src/wasm/rnnoise.ts`): framing, the two frames of lag, the voice probability of
  every channel; in audio.wasm: resampling, `a_scale` (×32768 unclamped, new) and `a_mix2`. wasm/rnnoise/ is gone; the
  native build stays as the test reference only.
