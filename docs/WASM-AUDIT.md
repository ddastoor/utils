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

## The rule being applied (STANDING RULE #1, CLAUDE.md)
1. An existing, tried-and-tested, well-known WebAssembly module — **only if it satisfies every condition and feature
   the owner asked for that utility** (hosted in the app, no CDN, no run-time downloads from elsewhere, data stays on
   the device, lazy per tab, open-source licence, the tab's requirements in CLAUDE.md §2 / §3, and the tab's test
   suite, which encodes those requirements).
2. Otherwise our own WebAssembly module from open-source code.
3. Otherwise an existing JavaScript / TypeScript library, with the reason in CLAUDE.md §3a.

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

**One module replaced, 50 tabs keep their engine.** Replaced: the HMAC Generator's engine (our Rust glue in
keys.wasm → `hash-wasm`). The table lists every tab; "—" under candidate means the search found no WebAssembly
package for the job at all.

### Tabs whose engine is a WebAssembly module we built

| Tab | Our module | Existing candidate (monthly downloads) | What happened when it was checked | Decision |
|---|---|---|---|---|
| `hmac` | keys.wasm (RustCrypto hmac + our streaming glue) | **hash-wasm 4.13.0** (10.8 M; MIT; C → wasm, embedded, no eval) | All eight algorithms, streaming, key and message of any length: equal to OpenSSL in 6,272 combinations and to the RFC 2104 / 2202 / 4231 vectors; bundled into a 57 KB chunk, nothing fetched at run time | **Replaced** (commit "HMAC Generator: engine replaced by hash-wasm"). Re-run: unit hmac 48 + keys 174, e2e hmac 30, totp 49, pwhash 31, sshkey 34, apikey 26, lazy 549, shell 63, no-external 43 |
| `pwhash` | keys.wasm (argon2, bcrypt, pbkdf2, scrypt + PHC strings) | hash-wasm 4.13.0 | Argon2 and bcrypt give encoded hashes and can verify; **scrypt and PBKDF2 return a bare digest**: no PHC string, no verification of a pasted hash (the tab must make and check `$scrypt$…`, `$pbkdf2-sha256$…`, and PBKDF2-SHA1 hashes made elsewhere), no worded refusals for parameters a tab cannot run | Keep ours |
| `totp` | keys.wasm (HOTP / TOTP, lenient Base32, otpauth) | @xet/totp-wasm (67) | Not established; hash-wasm has no Base32 or OTP | Keep ours |
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

### For the owner — one open choice (nothing changed yet)
**Mermaid Diagrams → Merman?** Merman is a Rust re-implementation of Mermaid compiled to WebAssembly
(`@mermanjs/web` 0.10.0, MIT / Apache-2.0, targets Mermaid 12.3). Checked on 18 Nov 2026 with its Node build: all
seven samples of the tab and 13 further diagram types rendered, quickly (2–300 ms). Against it:
- it is **five months old** (first alpha June 2026, version 0.10) — not yet "tried and tested";
- it is a re-implementation: Mermaid itself is what GitHub, GitLab and others run, so a preview made by another
  engine can differ from what those sites will draw;
- size: about **19 MB** unpacked for the browser package against 2.2 MB that the tab loads today;
- syntax errors come without a line ("Unexpected character at 24" against Mermaid's "Parse error on line 3"), and
  its documentation leaves making the SVG safe for the page to the host (Mermaid's `securityLevel: 'strict'` does it).
My recommendation: keep Mermaid for now and look again when Merman reaches 1.0. Say the word and I switch it and
re-run the tab's suite.

## Candidates already noted for tabs that come later (to be checked when each tab is reached)
| Tab(s) | Our module | Candidate to check first |
|---|---|---|
| `hash` | crypto.wasm (own MD5 / SHA-1 / SHA-3 / CRC-32 + libsodium) | hash-wasm (covers MD5, SHA-1, SHA-2, SHA-3, BLAKE2b, CRC-32, streaming) |
| `sodium`, `sharelink`, `password`, `passphrase` | crypto.wasm (libsodium built by us) | libsodium-wrappers / -sumo 0.8.4 (the libsodium project's own wasm build) |
| `graphviz` | graphviz.wasm (built by us) | @hpcc-js/wasm-graphviz 1.30.0 |
| `diff` | textcore.wasm (Myers) | @vscode/diff |
| `sqlfmt`, `prettier` | devcore-sqlfmt.wasm; Prettier (JS) | dprint plugins, @wasm-fmt/* |
| `markdown` | markdown.wasm (cmark-gfm built by us) | existing cmark-gfm / comrak / pulldown-cmark wasm builds |
| `terminal` | busybox.wasm (built by us) | existing BusyBox wasm builds |
| audio / video tabs | audio.wasm (LAME), rnnoise.wasm, whisper.wasm, espeak.wasm | lamejs-wasm builds, @jitsi/rnnoise-wasm, whisper.cpp's own wasm, espeak-ng wasm builds |

## Log for tabs after the first 51
One entry per tab, written before its bug hunt: our module → candidates → check → decision.

*(entries follow as the hunt goes on)*
