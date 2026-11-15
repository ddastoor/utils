# RESUME HERE — sync point

Owner rule: this file is the hand-off point if a session stops (usage limit, container reset). It is updated and
pushed with **every** commit. A new session reads `CLAUDE.md` (spec + standing rules), then this file, then
continues from "Next steps" without asking the owner anything already decided.

## Status (last updated with the commit that touched this file — see `git log -1 -- docs/RESUME.md`)

**Branch:** `claude/exciting-bohr-b9yfwc` (push here only). Site: https://ddastoor.github.io/utils/

**Registry:** 176 tabs (108 PC + mobile, 64 PC only, 4 mobile only) — `docs/TOOLS.md` (generated, `npm run docs`).

**Done and tested** (own e2e suite each): security (sodium, sharelink, hash, password, passphrase), pgp, all
calculators (27), math & science (7), text (9) + json/regex/base64/urlenc/epoch/uuid/color/jwt, codes (qr, barcode,
scan), archive (zip, unzip), everyday (9), device (11), **Image Editor** (`tests/e2e/image-editor.e2e.mjs`, 28 checks).

**Written, e2e suite still to write:** `heic` (src/tools/heic.ts), `exif` (src/tools/images.ts), `batch`
(src/tools/batch.ts).

**Stubs ("This tool is being built")**: every other tool — see "Queue".

## In flight: WASM-first audit (owner: "scan everything you've coded and convert to WebAssembly")
STANDING RULE #1 is at the top of `CLAUDE.md`; audit list is in CLAUDE.md §3a.
- [x] imgproc.c: `p_orient` (EXIF 1–8 lossless transforms), `p_crop`, `p_warp_quad` (homography solved in C);
      TS loops for flip/rot90/crop/homography/orient removed; unit tests added (45 checks).
- [x] metacore.c (new module, `wasm/metacore/`, built → `src/wasm/bin/metacore.wasm`): `m_sniff`, `m_exif_json`,
      `m_strip` (JPEG/PNG/WebP), `m_jpeg_set_dpi`.
- [ ] `src/wasm/metacore.ts` (`bindMetacore(e)` + `metacore()` loader); switch `src/lib/exif.ts` (readExif,
      stripMetadata) and `src/lib/imgio.ts` (setJpegDpi, sniff) to it; `tests/unit/metacore.test.mjs` on real
      fixtures (port tests/unit/exif.test.mjs to pass the bound module); add metacore to CLAUDE.md §3a/§5.
- [ ] textcore.c: `t_search` (port src/search.ts: Damerau-Levenshtein, stemming, stop words, scoring) and
      `t_wordfreq` (UTF-8 tokenise + count; also used by Word Counter "top words" and Photo Dictionary).
- [ ] crypto (glue.c): `u_shuffle`/`u_sample` via `randombytes_uniform` (Line Tools shuffle currently uses
      Math.random — fix), everyday `shuffleWith`/rng unique sampling, UUID v4/v7, Sodium header write/parse
      (src/lib/sodium-format.ts).
- [ ] mathcore.c: working days between dates (calculators.ts loops day by day), matrix power + trace (math.ts),
      colour-space conversions + contrast ratio (text.ts colorFns/contrastRatio).
- Left in TS on purpose (record in CLAUDE.md): browser-native engines (JSON, RegExp, Intl, canvas, WebCrypto) are
  compiled C++ already; per-animation-frame tiny loops (audio meter RMS over 2048 samples, graph grid drawing) —
  copying into wasm costs more than the loop.

## Queue (in order) — each: implement → own e2e suite with real fixtures → screenshot at 390×844 → commit + push
1. Finish audit above; e2e suites for heic, exif, batch.
2. Image tools: watermark, caption, collage (`src/tools/canvas-tools.ts`), signature, redact (MediaPipe face
   detector), formphoto (Indian exam presets), scanner (imgproc detect/warp/enhance → PDF), ocr (Tesseract eng+hin),
   passport (36 presets in src/lib/passport-specs.ts, MediaPipe landmarks + segmentation + guided filter, camera,
   print sheet, KB target, DPI), bgremove, cartoon (classic imgproc + Magenta TF.js). Models need
   `scripts/assets.json` (SHA-256 pinned) + a fetch script.
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
