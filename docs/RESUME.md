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
`claude remote-control` to steer it from the phone app. Pending owner decision: docs/IDEAS.md (new-tab candidates).

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
`ocr` (10), `bgremove` (11), `passport` (19), `cartoon` (37; Magenta models fetched + converted by
`scripts/fetch-assets.mjs` → `scripts/convert-magenta.mjs`). **Images category complete (15/15).** `bc` console (12).

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

## Queue (in order) — each: implement → own e2e suite with real fixtures → screenshot at 390×844 → commit + push
1. (Audit done.) Continue image tools below.
2. **Linux Terminal DONE** (130 BusyBox applets, all tested; see CLAUDE.md §2). bc console DONE (12 e2e checks). OCR DONE (owner: English, French, Spanish, German — no Hindi; 10 e2e checks).
   Background Remover DONE (11 e2e). Passport Photo DONE (19 e2e; webcam on PC / phone camera; busy backgrounds replaced by the
   preset colour). Cartoonizer DONE (37 e2e: 6 filters in imgproc C with DoG lines, Magenta AI styles on TF.js WebGL → wasm,
   legacy model converter scripts/convert-magenta.mjs). **All Images tools are done. Next: Photo Dictionary**; then, in order: (imgproc detect/warp/enhance → PDF via MuPDF),
   ocr (Tesseract eng+hin), passport (36 presets in src/lib/passport-specs.ts; MediaPipe landmarks + selfie
   segmentation + imgproc guided filter; camera, print sheet, KB target, DPI), bgremove, cartoon (classic imgproc
   + Magenta TF.js). Models: add entries to scripts/assets.json and pin with `fetch-assets.mjs --pin <name>`.
   (Done: Blur & Redact; pinned model fetching via scripts/assets.json + scripts/fetch-assets.mjs.)
3. Photo Dictionary (`photodict`, mobile only) — design in CLAUDE.md §3 (Wiktionary via kaikki.org + Open English
   WordNet, wordfreq, online fallback Wiktionary REST → dictionaryapi.dev, CSP connect-src hosts added when it ships).
   kaikki.org is NOT reachable from the dev sandbox yet → ask the owner to allow the host (environment network).
4. PDF/document tools on MuPDF (merge, split, organize, img2pdf, pdf2img, compress, sign, fill, unlock, protect,
   pdf2text, pagenum, watermark), markdown (own cmark-gfm wasm), epub (PC), sheet (PC), invoice/rent/resume.
5. Media: video (WebCodecs + muxer), audio recorder, TTS (Kokoro + Piper L2-ARCTIC Indian voices, own LAME MP3
   wasm, 0.5–2×), STT (own whisper.cpp wasm, small.en/base.en, hint box), noise (RNNoise), pitch (own C WSOLA),
   slideshow, ffmpeg (PC), screencast, screenshot, youtube (PC; `src/linux.ts` X11/Wayland detection).
6. Software (PC only, ~47): jq, yaml (libyaml + toml++), sqlite, graphviz, python (MicroPython), terminal
   (BusyBox 1.38.0 → wasm32-wasi + own shell layer + WASI FS), bc console inside the calc tab (PC), and the rest.
7. Audit list replacements (own builds of mozjpeg/libwebp/oxipng, libheif, tesseract, zxing-cpp, libarchive,
   zip AES in crypto.wasm, minimp4).

## Environment notes for a fresh container
- Zig is NOT persistent: reinstall per CLAUDE.md §5 (`pip download ziglang==0.17.1`, unzip, `export ZIG=…`).
- `npm ci` then `npm test` (unit, ~1.5 s) and `npm run build && node tests/e2e.mjs` (parallel e2e).
- huggingface.co + its CDN hosts are allowed in the environment (models for Whisper/Kokoro/Piper).
- Fixtures are committed (`tests/fixtures/`, regenerate with `node scripts/make-fixtures.mjs`).
