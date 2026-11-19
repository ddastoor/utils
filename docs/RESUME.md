# RESUME HERE — sync point

Owner rule: this file is the hand-off point if a session stops (usage limit, container reset). It is updated and
pushed with **every** commit. A new session reads `CLAUDE.md` (spec + standing rules), then this file, then
continues from "Next steps" without asking the owner anything already decided.

## How to resume in a NEW session (owner instructions)
Start a new Claude Code session on the same repository (claude.ai/code or the Claude app → New session → repo
`ddastoor/utils`, same environment) and send:
> Continue building SuperTools. Check out branch `claude/exciting-bohr-b9yfwc` (keep committing and pushing to that
> branch — I allow it), read CLAUDE.md and docs/RESUME.md, and carry on from "Next steps".

## Moving to a local machine (owner is moving to Kubuntu, Nov 2026)
```bash
git clone https://github.com/ddastoor/utils.git && cd utils && git checkout claude/exciting-bohr-b9yfwc
npm ci                                   # Node 22; runs vendor + icon generation
npm i -g playwright@1.63.0 && npx playwright install chromium   # e2e browser
export NODE_PATH="$(npm root -g)"        # tests load the global playwright
npm test && npm run build && node tests/e2e.mjs
```
Zig for our wasm modules: CLAUDE.md §5 (pip ziglang 0.17.1). Start Claude Code in the folder with `claude`, or with
`claude remote-control` to steer it from the phone app. Pending owner decision: docs/potentials.md + docs/IDEAS.md (new-tab candidates) — remind the owner.

## ▶ NOW (17 Nov 2026): second-pass bug hunt over ALL 176 tabs — tracker `docs/BUGHUNT.md`
Owner: "Go through all the apps, search for bugs, write extensive more test cases for every single app, squash all bugs
— **don't leave out any app**." Every original tab is built (176/176, each with its own e2e suite); this pass looks for
what those suites missed.
- **Tracker:** `docs/BUGHUNT.md` — one row per tab (R reviewed · B bugs fixed · T checks added). Update it with
  `node scripts/bughunt.mjs set <id>[,<id>] R=✓ B=<n> T=<n> N="note"`; `node scripts/bughunt.mjs status` lists open tabs.
  A tab is done only when R is ticked. Bugs found are listed per tab in the Notes column and summarised below.
- **Method:** (1) an independent reviewer per area (fresh sub-agent, read-only) reads the source + suite and tries to
  break each tab in a served copy of the build; every finding is re-verified before fixing; (2) a sweep of all tabs on
  desktop + phone (page errors, horizontal scroll, touch targets < 44 px, controls without an accessible name, every
  button pressed in the default state, workers released on leave); (3) each confirmed bug fixed in the app and pinned by
  a new check in that tab's suite; (4) full `npm test` + `node tests/e2e.mjs` at the end of each area; commit + push per area.
- **Areas** (column "Area" in the tracker): net, misc, bitswebref, dev-data2, data-engines, calc-core, calc2-math, text,
  security-codes, images1, images2, pdf, docs2, audio, video, terminal, everyday-device, + the app shell.
- **Progress:** see the tracker; fixed-bug summary is appended here area by area.
- After the hunt: ask the owner which `docs/potentials.md` ideas to build (build none until picked).
- **Owner — three standing rules at the top of CLAUDE.md:** #1 WebAssembly first, **order settled on 18 Nov 2026**:
  (1) an existing tried-and-tested WebAssembly module (a famous, good one) — look for one first, and use it **only
  if it satisfies every condition and feature the owner asked for that utility**; (2) if there is none or none
  fits, our own WebAssembly build from open-source code (also ports of JS/TS-only functionality where possible);
  (3) only if that is not doable, a JS/TS library as it is, noted in §3a; everything hosted in the app. #2 Extensive tests for every
  utility: test, fix the bug or the test, test again. #3 Commit and push regularly and often — do not wait for the
  complete test run or for the whole utility.
- **Owner, 18 Nov 2026 — a task that comes BEFORE more new tabs:** "for all the apps that you've done a bug hunt for
  up till now, that is the 51 of them, see if you can replace the handwritten WebAssembly ones with already existing
  WebAssembly modules out there, but only if the WebAssembly modules out there fit all the requirements that I've
  asked you for. And then continue on the new apps for the bug hunt and test cases." **DONE (18 Nov 2026):**
  `docs/WASM-AUDIT.md` — one replacement (HMAC Generator → hash-wasm 4.13, suites re-run), 50 tabs keep their engine
  with the reason per tab; one open choice for the owner (Mermaid → Merman, recommendation: not yet).
- **Owner, 18 Nov 2026 (third message) — TWEAK to rule #1 + a SECOND PASS:** an existing wasm module that does not
  cover all the features of a utility is **still used**; the missing features are added beside it — (a) a
  supplementary wasm module of our own, (b) an existing JS/TS library, (c) our own JS/TS. Then: "use your best
  judgement.. but always try to do wasm-first in any case". **Second pass over the 52 hunted tabs: DONE (18 Nov
  2026)** — `docs/WASM-AUDIT.md` "Second pass": `hmac`, `totp` and `pwhash` now run on **hash-wasm** (keys.wasm is
  the supplement: Base32 / HOTP truncation, PHC strings and checks, Argon2 1.0, plus OpenSSH and API keys); jq
  (jq-wasm), python (Pyodide), curl (curlconverter), xml (libxml2-wasm), json (dprint), mdtable, mermaid (Merman)
  were re-checked and keep their engine, each with the evidence (faults inside the module, or a module that is days
  or months old). The same file lists the **candidates for the tabs still to be hunted** (121 after graphviz; graphviz →
  @viz-js/viz / @hpcc-js/wasm-graphviz, hash → hash-wasm, sodium tabs → libsodium-wrappers, MP3 →
  @mediabunny/mp3-encoder, noise → @jitsi/rnnoise-wasm, pitch → signalsmith-stretch, diff → @vscode/diff, zip →
  7z-wasm, …): each is tried when its tab is reached.
- **Owner, 18 Nov 2026 — order of work for every tab from the 52nd on:** (1) check whether a WebAssembly module we
  wrote can be replaced by an existing one under STANDING RULE #1 and write the tab's entry in `docs/WASM-AUDIT.md`
  (candidates already noted there: hash-wasm for `hash`, libsodium-wrappers for the sodium tabs, @hpcc-js/wasm-graphviz,
  @vscode/diff, …); (2) hunt bugs; (3) extensive tests; (4) fix, re-test; (5) next tab. "Keep going."
- **Found during the audit and fixed:** our jq build showed local time as UTC → `wasm/jq/hosttz.c` + the shared
  `tzInfoImport` (891 reference cases from the native jq 1.8.2 in 27 zones; Python's `time.mktime` on clock-change
  nights corrected by the same host code).
- **Complete suites after the data-engines area (19 Nov):** `npm test` 18,334 / 18,334; `node tests/e2e.mjs`
  4,976 of 4,977 in 188 suites — the one failure was a stale expectation in `json.e2e.mjs` (corrected).
- **NOW: area calc-core** (18 tabs: calc, units, dates, emi, gst, sip, fd, percent, words, timezone, bmi, calories,
  duedate, tip, fuel, gpa, base, roman — `src/tools/calc.ts`, `src/tools/calculators.ts`, engine mathcore).
  **`calc` (tab 56) is DONE** (21 bugs; unit `calc.test.mjs` 243 with mpmath as reference, e2e 140; CLAUDE.md §3
  "Scientific Calculator as built"). **NEXT: `units`**, then the rest of the list in that order; per tab: the
  existing-module check with its entry in `docs/WASM-AUDIT.md` first (the survey of entry 56 covers calculators:
  no tried-and-tested WebAssembly calculator exists), then bugs, tests, fixes. Reference tools at hand: mpmath
  (`pip install mpmath`), Python's `decimal` / `fractions` / `datetime` / `zoneinfo`.
  After calc-core: calc2-math → text → … as listed below.
- **Graphviz (tab 55, `graphviz`): DONE (19 Nov 2026).** Existing modules first (`docs/WASM-AUDIT.md` entry 55):
  Viz.js 3.31 and @hpcc-js/wasm-graphviz 1.30 both **trap on valid graphs** (an upstream fault in `storeline()`: a
  label whose first line is empty), so the tab keeps a build of our own — now **Graphviz 16.1.0** from the official
  release (gitlab.com; SHA-256 in `wasm/graphviz/build.sh`) with `storeline.patch`, `triangulation.patch` +
  `st_delaunay.h` (prism overlap removal on our C port of Delaunator — no WebAssembly build had it), `qsort.c` /
  `rand.c` (glibc's: dot, neato, twopi, osage, patchwork are byte for byte the native tool's on 457 graph files),
  assertions kept (`-UNDEBUG`), text measured by the browser through a "textlayout" plugin. New worker (a fresh
  instance per drawing), client (newest text wins), page (CLAUDE.md §3 "Graphviz", §5.1l). 22 bugs; unit 32 → 686,
  e2e 23 → 81; reference = the native `dot` of the same source (`scripts/make-graphviz-reference.mjs`, 3,464
  drawings). **Build tree for quick rebuilds** (lost with the container; `ZIG=/tmp/zig/x/ziglang/zig
  WORK=/tmp/graphviz-build3 wasm/graphviz/build.sh` recreates it in ≈ 4 min): `/tmp/graphviz-build3`
  (`native/cmd/dot/dot_static` = the reference tool). To tell the owner at the end: the upstream crash is worth
  reporting to the Graphviz project (patch ready); native Graphviz 16.1.0 aborts on two hazard graphs.
- **Code Formatter (tab 54, `prettier`): DONE (19 Nov 2026).** Engines by evidence (`docs/WASM-AUDIT.md` entry 54;
  CLAUDE.md §3 "Code Formatter"): **Biome's official wasm** for JS / TS / CSS / SCSS / YAML / GraphQL, **`@dprint/json`**
  for JSON, **`dprint-plugin-markup`** (+ Biome for what stands inside) for HTML and Vue, **Prettier** for Markdown and
  as the fallback. 13 bugs; unit `tests/unit/codefmt.test.mjs` 205, e2e `tests/e2e/prettier.e2e.mjs` 85.
  To change or update an engine: `node scripts/make-codefmt-layout.mjs`, read the diff of
  `tests/fixtures/codefmt/layout.json`, run both suites. The readers the suites rest on: `tests/lib/codefmt-check.mjs`.
  **For the owner to know (said in the final report too):** Biome's module is 70 MB (18 MB over the wire, fetched
  with the first Format of one of its languages); `dist/` is now about 705 MB of GitHub Pages' 1 GB. A module of
  3–6 MB could be built by us from the same Biome crates if the size ever hurts (not done: the official build
  exists and covers everything — rule order).
- **SQL Formatter (tab 53): DONE (19 Nov 2026)** — the sqlformat crate changed the meaning of SQL and no established
  WebAssembly SQL formatter exists, so the tab has **our own formatter** now (`wasm/devcore/src/sqlfmt.rs`; CLAUDE.md
  §3 "SQL Formatter"; `docs/WASM-AUDIT.md` entry 53). 24 bugs, unit 113, e2e 49. To change its layout: edit the
  engine, `bash wasm/devcore/build.sh` (or the one-feature cargo line in it), `node scripts/make-sqlfmt-layout.mjs`,
  **read the diff of `tests/fixtures/sqlfmt/layout.json`**, run `node tests/unit.mjs sqlfmt` and
  `node tests/e2e.mjs sqlfmt` (the e2e uses python3 with `pip install sqlglot sqlparse`; without them those two
  readers are skipped with a note).
- **SQLite Playground (tab 52): DONE** — 22 bugs, unit 106 (native SQLite as reference), e2e 63; CLAUDE.md §3
  "SQLite Playground".
- **Owner's to-do list: `todo.md`** ("to do"). First item (17 Nov 2026): a JS/TS → WebAssembly sweep.
  **Owner, 17 Nov 2026: do NOT start to-do items on your own** — after this hunt, show the owner the items and ask
  which ones to do.
- **Owner, 17 Nov 2026:** "increase test coverage significantly for each app/utility" — every tab's suite must grow in
  this pass (tracker column T), not only the tabs where a bug was found.
- **Shell + whole-app results so far:** see "Bug hunt log" at the end of the tracker.
- **Done so far (17 Nov 2026):** app shell + whole-app sweep (10 fixes); **area `net` — all 10 tabs** (cidr, chmod, x509,
  sshkey, hmac, pwhash, apikey, curl, totp, pwstrength): 51 bugs fixed, 592 checks added, each pinned against an
  independent reference (real curl, GNU chmod, OpenSSL, Python ipaddress / cryptography / hashlib / zxcvbn, RFC vectors).
- **Area `misc` done too** (cron, semver, glob, patch, hexview, escape, unicode, logview, sla, transfer, mermaid): 59
  bugs, 350 checks; three engines replaced by our own Rust (npm-exact semver, Unicode glob, GNU-like patch).
- **Area `bitswebref` done too** (bitwise, ieee754, baseenc, bindecode, httpstatus, mime, ports, ascii, keycode,
  contrast, gradient, shadow, svgo): 63 bugs, 500 checks. Biggest: SVG Optimizer refused every file with a DOCTYPE,
  its Safe mode did nothing and some optimised drawings looked different (now every result is rendered and compared,
  with a safe fallback); the binary decoder's CBOR / MessagePack readers are now our own Rust; files ≥ 8 MiB trapped
  the Base32/64 engine; float32 rounding on ties; Key Codes was a keyboard trap.
- **Area `dev-data2` done too** (json, regex, base64, urlenc, epoch, uuid, color, jwt, xml, json2types, jsondiff,
  mockdata, mdtable): 91 bugs, 632 checks. Four engines written in Rust because the JS could not be made correct:
  a lossless JSON formatter (JSON.stringify reordered keys, dropped duplicates, rounded big numbers), a JSON diff
  that aligns lists, an XML formatter that moves white space only (the DOM round trip trimmed text and lost the
  DOCTYPE), and a JSON → types generator whose output is compiled by tsc / go / rustc / javac / python in the suite.
  Also: v7 UUIDs strictly increasing (crypto.wasm), CSS Color 4 gamut mapping (mathcore), regex matching in a worker
  with a time limit. The small tabs moved from `src/tools/text.ts` to `src/tools/software/dev1.ts`; colour reading
  is `src/lib/color.ts`.
  Running total: **47 of 176 tabs reviewed, 264 bugs fixed, 2,074 checks added** (+ shell).
  Verified at that commit: unit 4567/4567 (39 suites, 12 runs in a row); complete e2e 4,580 checks in 188 suites, all
  passing (mermaid, resume and one mdtable timing check only when re-run alone — CPU contention, as before).
  For the reference generator: `pip install --user pyjwt lxml tzdata` (the tests themselves only read its JSON).
- **Area `data-engines` in progress (17 Nov 2026):** done — **jq** (worker with stop / time limit / output stop; glue
  follows jq's main.c; native jq 1.8.2 as the reference for 4,903 cases), **yaml** (own value model and writers:
  digits kept, YAML 1.1-safe quoting, dates / .inf / .nan travel; PyYAML, ruamel.yaml and tomllib read every output),
  **jsonschema** (exact numbers, IDN formats, safe inference, plain messages; python-jsonschema verdicts for 5,338
  pairs), **python** (recursion guard for the browser's two stacks, lru_cache in Python, local time with tzdata's
  names, socket stand-in + asyncio, pbkdf2_hmac; new output pane that survives floods and shows \r / colours / the
  answers to input(); native CPython 3.14.8 as the reference for 69 programs — details in CLAUDE.md §5.1m).
  Still open in this area: nothing (sqlite, sqlfmt, prettier and graphviz done since).
  Running total: **51 of 176 tabs reviewed, 333 bugs fixed, 14,702 checks added** (+ shell).
  After `sqlite`, `sqlfmt` and `prettier` (19 Nov 2026): **54 of 176 tabs reviewed, 393 bugs fixed, 16,274 checks added**.
  After `graphviz` (19 Nov 2026): **55 of 176 tabs reviewed, 415 bugs fixed, 16,986 checks added** — the data-engines area is complete.
  After `calc` (19 Nov 2026): **56 of 176 tabs reviewed, 436 bugs fixed, 17,294 checks added**.
  Python build tree for quick rebuilds (lost when the container is reclaimed; `wasm/python/build.sh` recreates it in
  ≈ 10 min): `/tmp/pyb3` (`native/python` = the reference interpreter; `rezip.sh` rebuilds only python314.zip).
  After any rebuild: `python3 scripts/make-tzabbr.py` and `<native python> scripts/make-python-reference.py`.
  References are regenerated with `scripts/make-jq-reference.mjs` (needs a native jq 1.8.2: build it from the tarball
  `wasm/jq/build.sh` downloads), `scripts/make-formats-reference.py` and `scripts/make-jsonschema-reference.py`
  (`pip install pyyaml ruamel.yaml tomli_w toml jsonschema`); the tests only read their JSON.
  **Ideas that came up and are NOT started (ask the owner):** build sqlite3, bz2 and lzma into the Python tab.
- **The five first-wave reviewers left their probe scripts** in the scratchpad (`review/<area>/*.mjs`, areas misc,
  bitswebref, dev-data2, data-engines, calc-core): copy them to `own/<area>/`, point them at the preview
  (`sed -i 's#localhost:4180#localhost:4173#'`, `../probe.mjs` → `own/probe.mjs`) and run them one by one — they print
  tool-vs-reference comparisons that show the bugs. (If the scratchpad is gone, review those areas from the source.)
- **Next steps (in this order, one area at a time, commit + push after each):**
  data-engines (sqlite, jq, yaml, sqlfmt, prettier, graphviz, python, jsonschema …) → calc-core → calc2-math → text → security-codes → images1 → images2 → pdf → docs2 → audio → video →
  terminal → everyday-device (areas = column "Area" in `docs/BUGHUNT.md`; `node scripts/bughunt.mjs status` lists the
  tabs still open). For each tab: read the source + suite, probe the built site (`npx vite preview --port 4173`, helper
  `scratchpad/own/probe.mjs` — recreate it from `tests/e2e.mjs` if the scratchpad is gone), compare with an independent
  reference, fix, add checks to its suite (and a unit suite for its engine), tick the tracker.
- **Do NOT fan out a dozen reviewer sub-agents at once:** twelve in parallel used up the owner's 5-hour usage limit in
  one go (17 Nov). Work through the areas one by one in the main session.
- Reviewer reports that exist only for `net` (scratchpad `review/net/REPORT.md`, now fully handled). The other areas
  have no report — review them directly.

## Status (last updated with the commit that touched this file — see `git log -1 -- docs/RESUME.md`)

**Branch:** `claude/exciting-bohr-b9yfwc` (push here only). Site: https://ddastoor.github.io/utils/

**Registry:** 176 tabs (108 PC + mobile, 64 PC only, 4 mobile only) — `docs/TOOLS.md` (generated, `npm run docs`).

**Done and tested** (own e2e suite each): security (sodium, sharelink, hash, password, passphrase), pgp, all
calculators (27), math & science (7), text (9) + json/regex/base64/urlenc/epoch/uuid/color/jwt, codes (qr, barcode,
scan), archive (zip, unzip), everyday (9), device (11), **Image Editor** (`tests/e2e/image-editor.e2e.mjs`, 28 checks).

Also done + own e2e suite: `terminal` (20 e2e + 317 unit checks), `scanner` (13; generated phone photo of a rotated page → corners within 1 %, A4/Letter/Fit
PDF via MuPDF (src/lib/pdf.ts imagesToPdf, JPEG embedded as-is), JPEGs, B&W, rotate, multi-page), `formphoto` (14; IBPS/SSC/UPSC/NTA/PAN presets in src/lib/form-specs.ts, face
auto-framing, paper clean-up, JPEG padding to the minimum via metacore m_jpeg_pad), `redact` (14; MediaPipe BlazeFace + tiles, real portrait + generated 6-face group photo),
`heic` (11 checks), `exif` (18), `batch` (12, PC only), `watermark` (12), `caption` (11),
`collage` (14) — src/tools/canvas-tools.ts; `signature` (15; imgproc p_alpha_bbox + p_ink_to_alpha; OFL fonts
Great Vibes / Dancing Script / Caveat self-hosted); Anton font (OFL) self-hosted via @fontsource/anton.
`photodict` (43 e2e + 56 unit), `ocr` (10), `bgremove` (11), `passport` (19), `cartoon` (37; Magenta models fetched + converted by
`scripts/fetch-assets.mjs` → `scripts/convert-magenta.mjs`). **Images category complete (15/15).** `bc` console (12).

**Lazy dependencies per tab (owner request, Nov 16 2026) — DONE:** shell loads no engine (home ≈ 156 KB), search
engine loads on first use, every tab loads only its own chunk and fetches engines/models/data/fonts on first use,
workers + engine instances are released on leave (`src/lifecycle.ts`). Rule + allow-list: CLAUDE.md §4 "Lazy
dependencies"; test `tests/e2e/lazy.e2e.mjs` (every tab, desktop + phone). Every new tool must follow it.
Found on the way: MediaPipe's built-in usage logger (Google telemetry) — removed at build time (CLAUDE.md §6); test
helper `renderGrey` read a detached wasm-heap view under load (now copies).

**Stubs ("This tool is being built")**: every other tool — see "Queue".

## In flight: WASM-first audit (owner: "scan everything you've coded and convert to WebAssembly")
STANDING RULE #1 is at the top of `CLAUDE.md`; audit list is in CLAUDE.md §3a.
- [x] imgproc.c: `p_orient` (EXIF 1–8 lossless transforms), `p_crop`, `p_warp_quad` (homography solved in C);
      TS loops for flip/rot90/crop/homography/orient removed; unit tests added (45 checks).
- [x] metacore.c (new module, `wasm/metacore/`, built → `src/wasm/bin/metacore.wasm`): `m_sniff`, `m_exif_json`,
      `m_strip` (JPEG/PNG/WebP), `m_jpeg_set_dpi`.
- [x] `src/wasm/metacore.ts`; exif.ts / imgio.ts (setJpegDpi, sniff) use it; `tests/unit/exif.test.mjs` (25 checks
      incl. fuzzing); CLAUDE.md §3a + §5.1c updated. OxiPNG effort now scales with image size (12 MP PNG 31 s → 3 s).
- [x] textcore `search.c`: tool search ranking in C (t_search_build/query/free); src/search.ts only normalises;
      parity with the old TS ranking verified on ~1,800 queries; main.ts awaits `initSearch()`.
- [x] textcore `wordfreq.c` (`t_wordfreq`: count + stop words + top-K) — Word Counter uses it; Photo Dictionary will.
- [x] crypto glue.c: `u_shuffle_idx`, `u_sample`, `u_uuid` (v4/v7), `u_sh_write`/`u_sh_parse` (USODIUM1 header).
      `Math.random` is gone from the app (Line Tools shuffle, Lorem); everyday picker/teams/rng use C sampling.
- [x] mathcore.c: m_matadd/m_transpose/m_trace/m_matpow, m_weekdays (closed form, verified vs brute force),
      m_color (HSL/OKLCH) + m_contrast (WCAG). **Audit complete** — summary in CLAUDE.md §3a.
- Left in TS on purpose (record in CLAUDE.md): browser-native engines (JSON, RegExp, Intl, canvas, WebCrypto) are
  compiled C++ already; per-animation-frame tiny loops (audio meter RMS over 2048 samples, graph grid drawing) —
  copying into wasm costs more than the loop.

## Done so far (details in CLAUDE.md §2/§3)
Images (15), Documents (19), Media (11), Security (6), Calculators (27), Math & Science (7), Text (10 incl. Photo
Dictionary), Codes & Files (5), Everyday (9), Device (11), Linux Terminal + bc console, Software tabs moved from the old
"Text & Dev" (8). **129 of 176 tabs built.** Every own wasm module has unit tests (3240 checks passing).

## Next steps (in order)
1. **DONE (16 Nov 2026) — Per-tab e2e suites for the early tabs (owner, Nov 16: "extensive test cases for each utility").** Audit: 47 tabs had
   their own suite; ~80 early tabs were only covered by 7 shared smoke suites (calculators, math, text, security, codes,
   everyday, device). One thorough suite per tab with independent known answers (re-implemented formulas, published
   figures, boundaries, invalid input, phone width) — helper `tests/lib/calc.mjs`.
   **Written and passing (26):** emi, gst, sip, fd, percent, tip, fuel, words, roman, ppf, inflation, prepay, epf, nps,
   bodyfat, idealweight, coords, bmi, calories, sleep, units, dates, timezone, duedate, gpa, base, calc (77 checks).
   **All 27 Calculators tabs have their own suite.** Math & Science (7/7): graph (canvas pixels, pan/zoom, readout),
   equation, stats, matrix, fraction, primes, periodic — 153 checks. Text (9/9): wordcount, case, lines, replace, diff
   (minimal edits = LCS, rebuilds both texts), fancy (no unassigned code points), emoji, morse (playback timing), lorem.
   Developer tabs (8/8, PC only; shared `tests/e2e/_pconly.mjs` checks the phone note): json, regex, base64, urlenc,
   epoch, uuid, color, jwt — 117 checks. Security (5/5): sodium (USODIUM1 header fields, 5-chunk file, tamper/truncate,
   and the independent PyNaCl reference decryptor `tools/sodium_decrypt.py` opening our output — needs `pip install
   pynacl`, otherwise that check is skipped with a note), sharelink (fragment never sent), hash (9 algorithms vs Node and
   test vectors, 3 MB file), password (χ² uniformity), passphrase (EFF list) — 64 checks.
   Bugs found and fixed so far: Percentage showed "—%" on ÷0; BMI exactly on a cut-off (76.8 kg at 1.60 m = 30.0) was
   put in the lower category (float 29.999…) — now categorised as displayed; "₹-0" for a zero amount (NPS lump sum with
   a 100 % annuity) — `fmtINR` now prints ₹0, and negatives as "−₹1,234"; Date Calculator gave negative days (31 Jan → 1 Mar
   = "1m −2d") and "31 Jan + 1 month" = 3 Mar — now month-end clamped like java.time/Excel EDATE (1m 1d, 28 Feb), 29 Feb
   birthdays fall on 28 Feb; Time Zone converter's DST correction was a no-op (03:30 just after the New York spring
   change came out an hour off) — now tries the offsets either side, notes skipped/repeated hours; Due Date showed
   "Invalid Date" for an empty LMP and accepted any cycle length (now 20–45 days); Scientific: "200 + 10%" gave 200.1 —
   mathcore now treats a trailing bare % after + / − as a percentage of the running total (220), like phone calculators;
   Equation Solver threw uncaught errors on bad input (now messages) and missed touching roots like (x − ⅓)² (C root
   finder now minimises |f|); Fractions read "1/3 ÷ 2/3" as 1/18 (now ½: "2/3" is one fraction); Primes showed LCM 0
   beyond 64 bits (now exact), "next prime 2" after 2⁶⁴ − 1, and negative GCD/LCM/next prime above 2⁶³ (wasm i64 read
   signed); Statistics showed "Error" for undefined values (now —) and accepted "0x10" as data; Morse playback had 9-unit
   word gaps (standard 7); Lorem ipsum gave n+1 sentences / n+8 words and a lower-case sentence after "elit."; emoji search
   was case-sensitive (no country flags found); "e-mail" counted as 2 words; Title Case left a final small word lower
   case; code cases kept punctuation ("hello,World!") and did not split acronyms; Sentence case lost "I" and capitalised
   after "i.e."; Regex Tester's highlight dropped the character after an empty match; Base64 "download file" threw on
   bad input; Epoch showed 1970 for an empty box; JSON Formatter rounded big numbers (12345678901234567890 → …000; now
   kept exactly with JSON.rawJSON) and gave no line/column for "Unexpected token" errors (now found by a prefix search);
   Regex Tester said "1000 matches" for 5,000; Color accepted rgb(300, −20, …) unclamped; JWT now flags "nbf" in the
   future; Epoch clock was blank for 250 ms; password boxes in Sodium/Share Link had no accessible name; Share Link's "New
   message" did nothing (the router kept a tab when only its own hash parameters changed — now re-mounted, ?from= ignored);
   Hash "two files identical" compared by DOM position.
   Codes & Files (5/5): qr (19, every payload read back by the Scanner tab — tests/e2e/_scanback.mjs), barcode (32, all
   12 symbologies round-trip), scan (10, two codes per picture, fake live camera), zip (14, checked with Python zipfile and
   pyzipper AES), unzip (24, zip/AES/tar.gz/bz2/xz/7z fixtures built with Python). Test-only Python packages: `pip install
   --user pynacl pyzipper py7zr` (those checks are skipped with a note when missing). Note: Playwright drops files whose
   *path* is not ASCII — pass such files as buffers.
   Fixed: vCard values escape ; , \ and new lines; AES zip without a password says "Wrong or missing password"; **button
   handlers that throw synchronously now show the message** (they escaped as uncaught page errors before — e.g. barcode
   "Nothing to save yet").
   Everyday (9/9): stopwatch (19), countdown (30), pomodoro (26), interval (18) — all under Playwright's fake clock
   (`page.clock` install/pauseAt/runFor/fastForward), phases walked one by one with beeps counted; dice (21), coin (15),
   rng (27), picker (16), teams (15) — χ² uniformity (`tests/e2e/_stats.mjs`, p = 1e-4 limit), ranges, no-repeat rules.
   Shared helpers: `_phone.mjs` (390×844 layout + ≥ 44 px buttons), `_mobileonly.mjs`, `_phases.mjs`.
   Fixed: Stopwatch's Stop showed the last animation frame's time (≤ 16 ms stale, 3.734 s → "03.72"; laps were right);
   Reset → Start (or Pause → Start) before the next frame left **two frame loops** running in Stopwatch/Countdown/
   Pomodoro/Interval — the orphan kept beeping after leaving the tab; Countdown with 0 s alarmed at once on Start,
   negative fields were subtracted, and the tab title stayed "00:00 · Countdown" after pausing/leaving; Interval presets
   did not move the sliders, and Rest 0 s still counted (and beeped through) empty rest phases; Coin's Reset kept the
   heads/tails style; Team Splitter left the old teams on screen for an empty list.
   Device (11/11): webcam (23; fake camera = red|blue canvas stream → mirrored/unmirrored snapshot pixels), mic (22;
   Web Audio oscillator as the microphone → meter = peak, 5 s recording decoded back to 440 Hz), speaker (28; every
   connection to the speakers mirrored into per-channel analysers → Left/Right/Both channel energy, tone frequency by
   zero crossings), keyboard (22), pixels (19), touch (17; real touches via CDP Input.dispatchTouchEvent), screen (16),
   level (23), compass (17), soundmeter (15; reading = 20·log10(A/√2) + offset for a known amplitude), ruler (17) —
   helpers `_media.mjs` (fakeMedia, allStopped, trackAudioContexts). Orientation events only reach the page when the
   context has the sensor permissions (`accelerometer`, `gyroscope`, `magnetometer`).
   Fixed: Webcam "Snapshot" before starting threw "Encoding failed"; Keyboard Test lost focus to the search box on "/"
   and Ctrl+K (the app's shortcuts ran first — those keys could never be tested); Dead Pixel panel was not closed when
   full screen was left by the browser (its once-listener was used up by *entering* full screen) and stayed over the app
   after Back/leaving the tab; Touch Test canvas was not resized after rotating the phone; Screen Info showed India as
   "Asia/Calcutta" (now current IANA names) and did not follow a dark-mode switch; Bubble Level clamped the *reading* at
   45° and showed "−0.0°"; Compass showed "360° N" for 359.6° and its dial spun ~360° the long way when crossing north;
   Sound Meter showed −150 dB for silence, Start twice left two microphone streams and two loops running, and stacked
   one error message per click; Ruler's card outline was squeezed by the phone's screen edge (wrong aspect → wrong
   calibration) — now drawn upright when the card is wider than the screen.
   **Per-tab suites are complete for every built tab.** Full run (16 Nov, 141 suites, concurrency 8): 2882/2886 —
   the 4 misses were load timing (webcam test read the info table before it was drawn → test now waits for it; noise
   and resume timed out under load, both pass alone: 11/11, 7/7). Unit tests 3270/3270.
2. **← NOW: Software (PC only, 47 tabs)** — **built + own suite (24): httpstatus, mime, ports, ascii, keycode (ref.ts,
   shared `refTable` filter); cidr, chmod, x509 (net.ts); cron, semver, glob, patch, hexview, escape, unicode, logview,
   sla, transfer, mermaid (misc.ts); bitwise, ieee754, baseenc, bindecode (bits.ts); sqlfmt (data.ts); contrast, gradient, shadow, svgo (web.ts; svgo =
   our Rust build of OXVG, wasm/svgo); hmac, totp, pwhash, sshkey, apikey, curl, pwstrength (net.ts; wasm/keys +
   wasm/zxcvbn); xml, json2types, jsondiff, mdtable, mockdata (data2.ts; since 17 Nov on our own Rust engines devcore-xml / -j2t / -jsondiff); base64, urlenc, epoch, uuid, color, jwt (dev1.ts; moved out of text.ts); yaml, jsonschema (data3.ts; wasm/formats); prettier (prettier.ts, JS); sqlite (sqlite.ts + src/workers/sqlite.worker.ts, official SQLite wasm); jq (data.ts; wasm/jq = jq 1.8.2 C + oniguruma built by us, glue `jq_run` with an input callback so `input`/`inputs` work, `$ARGS`; e2e compares every output with the native /usr/bin/jq); graphviz (graphviz.ts; wasm/graphviz = Graphviz 14.1.2 + Expat built by us, in a worker with Stop; SVG shown as an inert <img>).** (47/47) devcore = one Rust crate (wasm/devcore), one small wasm per tab via Cargo features
   (`devcore-<feature>.wasm`; cron gets zone offsets from the browser's Intl through `env.tz_offset`); unit suite
   `tests/unit/devcore.test.mjs` (92). python (python.ts; wasm/python = CPython 3.14.8 built by us with zig — real Python 3 with its standard library instead of the planned MicroPython; worker, Stop, stdin, files in/out). **All 47 Software tabs built.**
   **Full run (16 Nov 2026, after the last tab):** unit 3531/3531 (32 suites); e2e 3576/3583 in 188 suites with all
   suites in parallel — the 7 misses (mermaid 4, noise 1 timeout, resume 1, stt Indian-English WER 28 % > 20 %) all pass
   when the suite runs alone (CPU contention; Piper's random sampling for the STT round trip). **Every original tab is
   built.** Next: the owner picks which `docs/potentials.md` ideas to build (asked in chat); build none until then.
   Test-only Python packages now also: `pip install --user bcrypt argon2-cffi zxcvbn requests` (checks skip if missing).
   Bugs fixed on the way: String Escape split emoji into a broken surrogate (😀 → "\ud83d" only); Patch Applier kept the
   previous result on screen when a new patch failed, TOTP's otpauth account line vanished on the next tick, Mock Data made new random rows when only the output format changed, **errors thrown by any file picker's handler
   escaped as uncaught page errors (no message) — `filePicker` now reports them like buttons do (all tabs)**, and added a newline that broke "No newline at end of file" patches;
   the device time zone showed as "Asia/Calcutta" and India was listed twice in the Time Zone converter (src/lib/tz.ts).
   sql-formatter (JS) replaced by a Rust sqlformat build — and that, Nov 2026, by our own formatter (WASM-AUDIT tab 53).
3. Audit list replacements (own builds of mozjpeg/libwebp/oxipng, libheif, tesseract, zxing-cpp, libarchive,
   zip AES in crypto.wasm, minimp4) — CLAUDE.md §3a.
4. **Owner decision (16 Nov 2026, after step 1): "Finish all the original apps before asking me about potentials.md."**
   So: build every remaining original tab (step 2: the 47 Software stubs, each with its own suite) first; only then
   remind the owner and ask which ideas to build: `docs/potentials.md` lists 53 new-tab ideas + 7 upgrades from
   open-source projects (round 1: Image to SVG, Upscaler, Searchable PDF, Pandoc, Vocal Remover, GIF, AVIF/JXL, age, Shamir,
   Spell Checker, BPM & Key, DuckDB; round 2: Auto Subtitles, Audiobook, PDF Compare, PDF Tables → Excel, Video Face
   Blur, Label Sheets, Music Tags, Duplicate Photos, Excalidraw, LaTeX, Circuit Simulator, Sky Map, Chart Maker,
   Certificate Maker, WireGuard, Code Runner, Breach Check; upgrades: Hindi TTS, Pyodide, Video Stabilizer; round 3: Aadhaar/e-Invoice QR verifier, DIGIPIN, PDF signatures,
   phone numbers, calendars, DjVu, metadata remover, steghide, RAW, ImageMagick, panorama, favicon, SoX, MIDI, Anki,
   PARI/GP, OpenSCAD, Kiwix, ESP flasher, webR, Wiregasm, Scratch, Open Food Facts, Open Library; upgrades JBIG2,
   unpaper, GMP, PROJ). The owner
   removed Chess, Ruff/Biome and Offline Translation — never suggest them again.
   Ask the owner which to build **when step 1 (per-tab suites) is finished, before starting step 2**, and at the start
   of any new session. Build nothing from it (or from the older `docs/IDEAS.md`) until the owner picks.

## Environment notes for a fresh container
- Zig is NOT persistent: reinstall per CLAUDE.md §5 (`pip download ziglang==0.17.1`, unzip, `export ZIG=…`).
- `npm ci` then `npm test` (unit, ~1.5 s) and `npm run build && node tests/e2e.mjs` (parallel e2e).
- huggingface.co + its CDN hosts are allowed in the environment (models for Whisper/Kokoro/Piper).
- Fixtures are committed (`tests/fixtures/`, regenerate with `node scripts/make-fixtures.mjs`).
