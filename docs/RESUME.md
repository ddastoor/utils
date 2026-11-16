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
1. **Per-tab e2e suites for the early tabs (owner, Nov 16: "extensive test cases for each utility").** Audit: 47 tabs had
   their own suite; ~80 early tabs were only covered by 7 shared smoke suites (calculators, math, text, security, codes,
   everyday, device). One thorough suite per tab with independent known answers (re-implemented formulas, published
   figures, boundaries, invalid input, phone width) — helper `tests/lib/calc.mjs`.
   **Written and passing (26):** emi, gst, sip, fd, percent, tip, fuel, words, roman, ppf, inflation, prepay, epf, nps,
   bodyfat, idealweight, coords, bmi, calories, sleep, units, dates, timezone, duedate, gpa, base, calc (77 checks).
   **All 27 Calculators tabs have their own suite.** Math & Science (7/7): graph (canvas pixels, pan/zoom, readout),
   equation, stats, matrix, fraction, primes, periodic — 153 checks. Text (9/9): wordcount, case, lines, replace, diff
   (minimal edits = LCS, rebuilds both texts), fancy (no unassigned code points), emoji, morse (playback timing), lorem.
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
   bad input; Epoch showed 1970 for an empty box.
   **Remaining:** json, regex, base64, urlenc, epoch,
   uuid, color, jwt · sodium, sharelink, hash, password, passphrase · qr, barcode, scan, zip, unzip · stopwatch,
   countdown, pomodoro, interval, dice, coin, rng, picker, teams · webcam, mic, speaker, keyboard, pixels, touch,
   screen, level, compass, soundmeter, ruler.
2. **Software (PC only, 47 tabs left)**, each with its own suite from the start, wasm first: sqlite (official wasm),
   jq (own build of jq 1.8.2 exists), yaml (own libyaml + toml++), graphviz (own build), python (MicroPython), and the
   rest listed in CLAUDE.md §2.
3. Audit list replacements (own builds of mozjpeg/libwebp/oxipng, libheif, tesseract, zxing-cpp, libarchive,
   zip AES in crypto.wasm, minimp4) — CLAUDE.md §3a.
4. **REMIND THE OWNER (owner request, 16 Nov 2026):** `docs/potentials.md` lists 53 new-tab ideas + 7 upgrades from
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
