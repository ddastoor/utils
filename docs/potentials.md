# Potential new tabs — waiting for the owner's go-ahead

Open-source projects suggested on **16 Nov 2026** in answer to the owner's questions "Any other interesting GitHub utility
projects which you can add as utility tabs?" (round 1), "Any more interesting and useful open source, legal and free
GitHub projects … given all the restraints and conditions I have put?" (round 2) and "Any more cool open source projects,
not just GitHub, in general … maintaining the rules and constraints" (round 3).

**Status: none accepted yet. Build nothing from this list until the owner picks.**

**Reminder rule (owner, 16 Nov 2026):** remind the owner about this list and ask whether to build any of it:
- when the current per-tab test work is finished, before starting the Software tabs;
- at the start of any new session that resumes from `docs/RESUME.md`.

**Size check first (owner, 20 Nov 2026 — standing rule, CLAUDE.md top):** when the owner names a tab from this list,
first estimate how many MB it adds to the deployed site, give the new total against GitHub Pages' 1 GB cap (512 MB on
20 Nov 2026), say what existing app or model could be removed to make room if needed — and **wait for the owner's
decision** before building anything.

**The process (owner, 21 Nov 2026; agreed):** "after all the to-dos, we'll start going through potentials.md. So you show
me potentials.md apps. Then I will select either one app or a bunch of apps, and you build them out and then remove them
from potential.md, and then we repeat this process." — show this list, the owner picks one or several, the size check
for each, build and test, remove the built ones from this file, show the list again.

When the owner picks a tab (after the size check):
1. Mark it **accepted** here.
2. Add it to the registry in the best-fitting category (CLAUDE.md §2 "New utilities").
3. Build it by CLAUDE.md §8, WebAssembly first (STANDING RULE #1).
4. Give it its own thorough e2e suite.
5. When it is built and tested: **remove it from this file** (CLAUDE.md §2 and `docs/TOOLS.md` record it from then on).

Every candidate:
- runs fully on the device;
- compiles to WebAssembly (C/C++/Rust), ships an official wasm build, or (where marked) is a JavaScript-only project;
- is served from this site, with its heavy parts downloaded only when the tab is used (lazy loading, CLAUDE.md §4);
- duplicates no existing tab and nothing the owner rejected.

Platform: "both" = PC + mobile.

## Suggested order (28 Nov 2026 — Claude's second suggestion, at the owner's request; nothing accepted until the owner picks)
The owner, 28 Nov 2026: "Suggest what to do next from potentials.md.. you can group if you want based on shared functionality".
The site: **668.4 MB** of 1 GB (≈ 332 MB of room). The first suggestion (27 Nov 2026: four groups — reading on the phone and the
Kindle, PDF and ID tools for India, the owner's larger asks, camera helpers) was picked whole and built 27 – 28 Nov 2026.
1. **World Radio and pictures from the web** — the owner's latest wishes (28 Nov: World Radio's favourites in the Settings page,
   playing on in other tabs, a station that fails said and skipped; radio and wallpapers his examples of allowed data): ~~116 World
   Radio~~ (**built 28 Nov 2026** — CLAUDE.md §3 "World Radio"; no hls.js: the owner's browsers play HLS themselves; 31 KB) · ~~115
   Wallpapers from Wikimedia and Museums~~ (**built 28 Nov 2026** — CLAUDE.md §3 "Wallpapers"; Cleveland left out: its picture server lets no
   page read a picture; 34 KB) · ~~114 NASA Image Explorer~~ (**built 28 Nov 2026** — CLAUDE.md §3 "NASA Image Explorer"; its files
   read at NASA's bucket; APOD left out — it needs a key; 17 KB). **Group 1 done.** Shared: approved data hosts, pictures sized to the
   screen (BlazeFace's crop, @jsquash/resize, MozJPEG), a Settings section. The hosts are approved with the pick.
2. **Screenshots and scams** — ~~87 Long Screenshot Stitcher~~ (**built 28 Nov 2026** — CLAUDE.md §3 "Long Screenshot Stitcher"; its own
   engine in imgproc.wasm — votes, then the best stretch of matching rows —, on the Screenshot tab's row signatures; 43 KB) ·
   113 Screenshot Annotator & How-To Guide · 76 Screenshot Finder (the OCR) · 82 Is This Screenshot Real? · 83 Scam & QR Check ·
   101 Clean Link (83 and 101 share one link checker: the real site's name, look-alike letters). ≈ 1 MB.
3. **The camera, round 2** — 100 Magnifier · 80 Measure from a Photo · 98 Old Photo Album Scanner · 103 Handwriting Analysis ·
   92 Social Media Sizer. Shared: the live camera, the page finder and the homography, MediaPipe's faces. ≈ 0 MB.
4. **Frames of a video** — 99 Best Shot from a Video · 17 Video Face Blur · 85 Lecture Video → Slides · 64 Subtitle Sync · 6 GIF
   Maker. Shared: WebCodecs + mediabunny reading frames, the faces, the OCR. ≈ 0.7 MB (gifski).
5. **Making documents** — 72 PDF / EPUB Creator · 97 Printable Paper · 18 Label & Sticker Sheet Maker · 90 Family Emergency Card ·
   91 PDF Library Search. Shared: MuPDF's layout and the Noto fonts, the EPUB writer, zxing's codes. ≈ 0 – 0.3 MB.
6. **India first: money, IDs, places, dates** — 111 Trip Settle-Up (the Bill Splitter's engine; a UPI QR for each payment) · 30
   Aadhaar & e-Invoice QR Verifier · 31 DIGIPIN & Plus Codes · 34 Calendar Converter. Shared: mathcore, zxing, WebCrypto. ≈ 0 MB.
7. **Folders on a PC (Windows and Linux)** — 102 Folder Space Map · 112 Backup Checker · 20 Duplicate Photo Finder · 63 Photo
   Organizer. Shared: File System Access, hash-wasm, ExifTool. ≈ 0 MB.
All seven: ≈ 2 MB. **Picked by the owner, 28 Nov 2026 ("Ok go ahead with the order you suggest") — being built in this order;
each app taken off the lists below when it is built.** **Bigger — each after its size check:** U3 our own FFmpeg (the stabiliser, Rubber Band, VP9 / H.265; + 5 – 15
MB, 1 – 2 days) · 4 Document Converter (Pandoc, 58.6 MB) · 2 Photo Upscaler (4.8 MB; the best model 33.7) · 55 Cut Out Anything
(14 – 34 MB). Held back for room: 5 Vocal Remover (180 MB), 67 Object Eraser (208 MB), 22 LaTeX (≈ 175 MB). **Not suggested:**
118 (checked: no gain), 119 (bends the lazy-loading rule; measure first), 33 (the Number Detective reads phone numbers already).

## Size check of every candidate (20 Nov 2026)
The site is **512 MB** (511,614,356 bytes, `du -sb dist`, after Speech to Text was removed on 20 Nov 2026 — it was
763 MB) of GitHub Pages' 1 GB for a published site (read as 10⁹ bytes) → **488 MB of room**. A size here is what the tab would ship — one build, without source maps or debug copies —
measured on 20 Nov 2026 from the package's file list (`npm pack <pkg> --dry-run --json`) or the model's file list on
Hugging Face (`huggingface.co/api/models/<repo>/tree/main`). **"est."** = no published build that could be measured
from the sandbox (GitHub is not reachable there): measure it before building.
- **Nothing new — about 0 – 0.3 MB, the tab's own code; its engines are already on the site:** 3 Make PDF Searchable,
  9 Shamir Secret Split, 15 PDF Compare, 16 PDF Tables → Excel, 17 Video Face Blur,
  18 Label Sheets, 20 Duplicate Photos, 27 WireGuard, 30 Aadhaar / e-Invoice QR, 31 DIGIPIN, 34 Calendar Converter,
  36 Metadata Remover, 61 PDF Redact, 62 Authenticator Export, 63 Photo Organizer, 64 Subtitle
  Sync, 76 Screenshot Finder, 77 Paper Deadlines, 78 Bill Splitter by Photo, 79 Phone ⇄ PC Beam, 80 Measure from
  a Photo, 81 Camera Reader, 84 Number Detective, 85 Lecture Video → Slides, 88 Wi-Fi QR from a sticker,
  89 Visiting Card, 90 Emergency Card, 91 PDF Library Search, 92 Social Media Sizer, 93 Safe ID Copy, 94 Pulse from a
  Fingertip, 97 Printable Paper, 98 Old Photo Album Scanner, 99 Best Shot from a
  Video, 100 Magnifier, 101 Clean Link (its rules ≈ 0.1 MB), 102 Folder Space Map, 103 Handwriting Analysis,
  111 Trip Settle-Up, 112 Backup Checker, 113 Screenshot Annotator & How-To Guide; and 29 Breach Check, 52 Food Label, 53 Book Lookup (each needs its data-API host
  approved first).
- **Small — under 10 MB:** 1 Image to SVG 0.2 (vtracer / potrace) · 117 Clipart Maker ≈ 1 – 6 (vtracer < 1; a general
  cut-out model ≈ 4.7 if things and animals are cut out too — people use the model on the site) · 2 Photo Upscaler 4.8 (Real-ESRGAN general x4v3;
  the best model, x4plus, 33.7 at half precision / 67.1 full) · 6 GIF Maker 0.7 (gifski) · 7 AVIF / JPEG XL 7 (jSquash:
  AVIF 3.5 + 1.2, JXL 1.4 + 0.8; one-thread builds) · 8 age 0.1 · 10 Spell Checker ≈ 3 (Hunspell 0.8 + dictionaries,
  est.) · 11 BPM & Key 0.4 (aubio) · 19 Music Tags 0.7 (TagLib) · 23 Circuit Simulator ≈ 2 (est.) · 25 Chart Maker < 1
  (est.) · 26 Certificate Maker + 32 PDF Signatures ≈ 1 together (one Mbed TLS build, est.) · 33 Phone Numbers ≈ 1 – 2
  (libphonenumber, est.) · 35 DjVu ≈ 1 – 2 (est.) · 37 Hidden Message < 1 (steghide, est.) · 38 RAW Photos 1.4 (LibRaw)
  · 41 Favicon Maker 2.4 (resvg) · 42 Audio Effects ≈ 1 – 2 (SoX, est.) · 45 PARI/GP ≈ 5 – 10 (est.) · 47 Offline
  Wikipedia ≈ 2 – 5 (libzim, est.; the .zim files are the user's own, never hosted) · 48 ESP32 Flasher 0.5 · 57 Lottie
  1.2 (ThorVG) · 60 Code Screenshot ≈ 3 – 6 (Shiki 0.6 + the languages chosen) · 68 KeePass 0.3 (kdbxweb; Argon2 is on
  the site) · 70 CyberChef 9.0 (its OCR data left out: the site has Tesseract) · 82 Screenshot Check < 0.5 (own C, est.) · 83 Scam
  & QR Check ≈ 0.3 (confusables data, est.) · 86 Handwriting Font ≈ 1 (a font writer + tracing, est.) · 95 Regex from Examples ≈ 0.5 (grex, est.) · 105 Air-Gap Transfer ≈ 1 – 2 (libcimbar, est.) · 106 Articles → Kindle
  ≈ 0.5 (dom_smoothie, est.) · 107 Video Editor ≈ 5 – 10 (Omniclip, est.) · U4 JBIG2 ≈ 1, U5 unpaper < 1, U6 GMP
  ≈ 1 (est.).
- **Medium — 10 to 60 MB:** 4 Document Converter 58.6 (pandoc.wasm) · 12 CSV/Excel SQL 37 (DuckDB, one of its three
  builds: 35.9 + worker) · 21 Whiteboard 17.7 (Excalidraw with its fonts) · 24 Sky Map ≈ 20 – 50 (est.) · 28 Code Runner:
  Lua 0.5, Ruby + 30.6, PHP + ≈ 50 (its ICU data alone 30.8), C + ≈ 70 (est.) · 39 Image Converter 16.3 (ImageMagick) ·
  40 Panorama ≈ 10 – 15 (own OpenCV build with stitching, est.; opencv.js without it is 13.3) · 43 MIDI → MP3 ≈ 9 – 33
  (FluidSynth 2.4 + a SoundFont, est.) · 46 3D → STL 11.1 (OpenSCAD) · 49 R Console 48.7 (webR) · 54 Diagram Editor 49.5
  (draw.io 32.7.4, measured; 42.2 without templates and maths; built 28 Nov 2026 with 32.7.7 and PlantUML's converter: 52.9) · 55 Cut Out Anything 13.8 (SlimSAM, quantized; SAM 2.1 tiny 33.1) + Transformers.js ≈ 1 – 2 ·
  56 Flash Player 15.3 (Ruffle) · 58 Map Converter 40 (GDAL: 28.2 + 11.6 data) · 59 Retro DOS ≈ 8 – 18 (js-dos) · U2 Full
  Python ≈ 45 (Pyodide 13.9 measured + numpy / pandas / matplotlib, est.) · U7 PROJ ≈ 12 (est., with its database) · 104 Typst
  Studio ≈ 15 (the compiler + its fonts, est.) · 108 Audio Editor ≈ 10 – 20 (Wavacity, est.).
- **Large — over 60 MB:** 5 Vocal Remover 180.5 (HTDemucs; 113.1 for vocals only with Open-Unmix) · 22 LaTeX ≈ 175 (est.)
  · 50 Packet Capture 76 (Wiregasm: 73.4 + 2.6) · 51 Scratch 87 (the GUI) + the sprite and sound library it normally
  fetches from Scratch's servers · 67 Object Eraser 208 (LaMa) · 69 Data Notebook ≈ 70 (JupyterLite, est.).
- **Off the list:** U1 Hindi voices (owner's rule, 20 Nov 2026: no Hindi work).
- **In place of a tab's engine:** U3 our own FFmpeg build ≈ 36 – 46 MB in place of FFmpeg's 31 today (est.: + 5 – 15).
- **What could make room, biggest first** (Speech to Text, 238 MB, was removed on 20 Nov 2026): Text-to-Speech's Kokoro voices (US / UK) 94 MB or Piper's (Indian English) 73 MB · Code
  Formatter's Biome 67 MB (Prettier, JavaScript, would format those languages instead) · a whole tab's engine: Photo
  Dictionary 34, FFmpeg 31, OCR 27, EXIF 24. Or, removing nothing: a **second GitHub Pages site** of the owner's
  (`ddastoor.github.io/<another repo>/`) for big models — the same web address (origin), so the CSP and the "served from
  this site" rule hold, with its own 1 GB.

## Round 1 — top picks
| # | New tab | Open-source project | Engine | Download | Platform | Status |
|---|---|---|---|---|---|---|
| 2 | **Photo Upscaler**: 2× / 4×, sharpen blurry or small photos | Real-ESRGAN / Upscayl models | ONNX Runtime Web (already on the site for TTS) | 17–65 MB model | both | waiting |
| 4 | **Document Converter**: DOCX ⇄ Markdown / HTML / EPUB / ODT (owner, 20 Nov 2026: "include all the Pandoc uses when you come to the Pandoc app" — when it is built, every popular Pandoc use gets its own button, as in the FFmpeg tab, no command line needed; search the web for the popular uses first; what pandoc.wasm cannot do is added beside it by STANDING RULE #1 or said in the tab) | Pandoc | official pandoc.wasm | ≈ 50 MB | PC | waiting |
| 5 | **Vocal Remover / Karaoke**: split vocals from music | Demucs (stem separation) | ONNX Runtime Web | 80+ MB model | PC | waiting |

## Round 1 — also good fits
| # | New tab | Project | Notes | Status |
|---|---|---|---|---|
| 6 | **GIF Maker**: video or photos → high-quality GIF | gifski (Rust) | best-quality GIF encoder | waiting |
| 7 | **AVIF / JPEG XL Converter** | libavif, libjxl (C/C++) | smaller photos than JPEG/WebP | waiting |
| 8 | **age Encrypt**: modern file encryption | age / rage format | files open with the standard `age` tool on any computer; can use our libsodium | waiting |
| 9 | **Shamir Secret Split**: split a password into N parts, any K recover it | ssss-style, in our own C | small; good for family emergency info | waiting |
| 11 | **BPM & Key Detector** for songs | aubio (C) | small | waiting |
| 12 | **CSV/Excel SQL**: query big spreadsheets with SQL | DuckDB-wasm (official) | PC; complements the SQLite tab | waiting |

## Round 2 — reuse engines already on the site (cheapest)
| # | New tab | Built from | What it does | Platform | Status |
|---|---|---|---|---|---|
| 17 | **Video Face Blur** | MediaPipe BlazeFace (already used by Blur & Redact) + WebCodecs | Blur every face (or chosen ones) through a whole video before sharing | both | waiting |
| 18 | **Label & Sticker Sheet Maker** | zxing-cpp + MuPDF (both on the site) | QR codes, barcodes or addresses laid out on standard A4 label sheets (e.g. 24 / 48 / 65 per page) → PDF to print | both | waiting |

## Round 2 — new open-source engines
| # | New tab | Open-source project | Engine | Download | Platform | Status |
|---|---|---|---|---|---|---|
| 19 | **Music Tag Editor**: title, artist, album, cover art for MP3 / M4A / FLAC / OGG | TagLib (C++, LGPL-2.1 / MPL-1.1) | own wasm build (taglib-wasm, MIT bindings, shows it works) | < 1 MB | both | waiting |
| 20 | **Duplicate Photo Finder**: find exact and near-duplicate photos to clean up a gallery | perceptual hashing (dHash/pHash, the method used by imagededup / dupeGuru) | own C in imgproc | none | both (folder picker on PC, multi-select on phones) | waiting |
| 21 | **Whiteboard / Sketch Diagrams** (owner: keep): hand-drawn style diagrams, export PNG/SVG, open/save .excalidraw files | Excalidraw (MIT) | JavaScript only — no compiled equivalent (record in §3a); collaboration off | ≈ 2–3 MB | PC | waiting |
| 22 | **LaTeX Editor**: write LaTeX, get a PDF, fully offline | BusyTeX (TeX Live → WebAssembly; pdfTeX / XeTeX / LuaTeX) | own build from upstream; a curated package set hosted here (no package server) | large (≈ 175 MB with packages) | PC | waiting |
| 23 | **Circuit Simulator**: build electronic circuits and watch current flow (students, hobbyists) | Falstad / Sharp CircuitJS1 (GPL-2.0) | JavaScript (Java compiled with GWT) — no compiled equivalent | ≈ 2 MB | PC (works on tablets) | waiting |
| 24 | **Sky Map / Planetarium**: point the phone at the sky to name stars and planets | Stellarium Web Engine (AGPL-3.0, C) | official C source → wasm; star catalogue subset hosted here | tens of MB | both (sensors on phones) | waiting |
| 26 | **Certificate Maker**: CSR, self-signed certificates, PEM ⇄ DER ⇄ PFX/P12 | Mbed TLS (C, Apache-2.0) | own wasm build; complements Certificate Decoder | < 1 MB | PC (Software) | waiting |
| 27 | **WireGuard Config Generator**: keys + config file + QR for the phone app | WireGuard config format | our libsodium (X25519) + zxing QR | none | PC (Software) | waiting |
| 28 | **Code Runner**: Lua / Ruby / PHP / C snippets | Lua (MIT, C), ruby.wasm (official), php-wasm (official), wasm-clang (Apache-2.0) | own Lua build; official builds for the others | Lua < 1 MB; others 10–40 MB each | PC (Software) | waiting |
| 29 | **Password Breach Check** (inside Password Strength) | Have I Been Pwned "Pwned Passwords" range API (free, no key) | only the first 5 characters of the password's SHA-1 are sent (k-anonymity); **needs the owner's approval of a new data-API host** (`api.pwnedpasswords.com`) | none | PC (Software) | waiting |

## Upgrades to existing or planned tabs (round 2)
| # | Upgrade | Project | Notes | Status |
|---|---|---|---|---|
| U1 | **Hindi voices** in Text-to-Speech | Piper `hi_IN` voices (pratham, rohan) | same Piper engine already on the site; dataset licence is non-commercial (personal use is fine). The owner skipped Hindi for OCR, so ask first. | waiting |
| U2 | **"Full Python"** option in the planned Python tab | Pyodide (MPL-2.0, official CPython wasm) | numpy / pandas / matplotlib beside the built-in CPython 3.14 (standard library only); ≈ 10–30 MB, loaded only when chosen | waiting |
| U3 | **Our own FFmpeg build** for the FFmpeg tab (owner, 26 Nov 2026: the three new FFmpeg uses that need it go here — the other 22 are to-do #32): **(1) a good video stabiliser** — vid.stab (GPL-2.0; `vidstabdetect` + `vidstabtransform`, two passes; FFmpeg 5.1's `deshake` only moves the picture against the shake); **(2) high-quality pitch and speed change** — Rubber Band (GPL-2.0; `rubberband`; `atempo` crossfades its pieces — 1.3 dB lower on noise-like sound, to-do #23); **(3) VP9 and H.265 encoding** — libvpx-vp9 and x265 built without threads (in ffmpeg.wasm 0.12 they wait for ever for worker threads; GitHub Pages cannot give SharedArrayBuffer) | current FFmpeg (8.x) + the libraries the tab uses now (x264, LAME, Opus, Vorbis, libvpx, libwebp, freetype / fribidi / libass, zimg) + vid.stab + Rubber Band, compiled by us to WebAssembly (Emscripten, as ffmpeg.wasm's own build scripts, or libav.js's "fat" variant — docs/WASM-AUDIT.md, tab 149) | ≈ 1 – 2 days, then every FFmpeg job's suites again (FFmpeg changed some filters since 5.1: `silenceremove`); the stereo Opus workaround of to-do #23 (`OPUS_SAFE`) comes out if the new build passes the stereo checks; size ≈ 36 – 46 MB in place of today's 31 (est.) | waiting |

## Round 3 — open-source projects from anywhere (not only GitHub)

### India-first
| # | New tab | Open-source project / spec | Engine | Platform | Status |
|---|---|---|---|---|---|
| 30 | **Aadhaar & e-Invoice QR Verifier**: scan the Secure QR on an Aadhaar card / e-Aadhaar or a GST e-invoice; show the fields (and Aadhaar photo) and check the government's digital signature, offline | UIDAI Secure QR specification + UIDAI public certificate; GST e-invoice signed QR (NIC public key) | zxing (on the site) + own C (decompress, field layout) + the browser's WebCrypto RSA check | both | waiting |
| 31 | **DIGIPIN & Plus Codes**: India Post's 10-character digital address ⇄ latitude/longitude, plus Google Plus Codes | DIGIPIN (India Post, Apache-2.0, `INDIAPOST-gov/digipin`); Open Location Code (Apache-2.0) | own C (tiny) | both | waiting |
| 32 | **PDF Digital Signatures**: verify signed PDFs (DSC-signed, Aadhaar eSign) and sign with your own .pfx certificate | MuPDF (on the site) + Mbed TLS (Apache-2.0) | own wasm build of Mbed TLS | both | waiting |
| 33 | **Phone Number Checker**: valid or not, mobile/landline, country, E.164 / national format | Google libphonenumber (Apache-2.0, C++) | own wasm build | both | waiting |
| 34 | **Calendar Converter**: Gregorian ⇄ Indian National (Saka), Hijri, Hebrew, Persian, Chinese, Buddhist | ICU (in every browser, compiled C++) | browser `Intl` + own glue | both | waiting |

### Documents, images, media
| # | New tab | Open-source project | Engine | Platform | Status |
|---|---|---|---|---|---|
| 35 | **DjVu → PDF / reader**: old scanned books (archive.org, Indian digital libraries) | DjVuLibre (GPL, C, SourceForge) | own wasm build | both | waiting |
| 36 | **Metadata Remover for any file**: PDF, Word, MP4, MP3, images — see it and strip it before sharing | ExifTool (Perl) on zeroperl (`@uswriting/exiftool`, Apache-2.0 wrapper) | Perl interpreter in wasm (removal with `-all=` to be tested) | both | waiting |
| 37 | **Hidden Message in Photo / Audio**: encrypt a message into a JPEG/BMP/WAV; files open with the standard `steghide` tool | steghide (GPL, C++, SourceForge) | own wasm build | both | waiting |
| 38 | **RAW Photo Developer**: camera RAW (CR2, NEF, ARW, DNG…) → JPEG with exposure/white balance | LibRaw (LGPL-2.1 / CDDL, C++) | own wasm build | both (big files best on PC) | waiting |
| 39 | **Any-Format Image Converter**: TIFF (incl. multi-page → PDF), PSD, TGA, BMP, ICO, EPS… | ImageMagick (`magick-wasm`, official, Apache-2.0-style licence) | official wasm build | both | waiting |
| 40 | **Panorama Stitcher**: join overlapping photos into one wide picture | OpenCV stitching module (Apache-2.0, C++) | own wasm build (opencv.js lacks stitching) | PC | waiting |
| 41 | **Favicon & App-Icon Maker**: one logo → favicon.ico + all PNG sizes + SVG render | resvg (Rust, permissive) + own ICO writer | own wasm build | both | waiting |
| 42 | **Audio Effects**: equaliser, bass boost, reverb, echo, chorus, fade, normalise | SoX (GPL/LGPL, C, SourceForge) | own wasm build | both | waiting |
| 43 | **MIDI Player → MP3**: play .mid files with real instruments and save audio | FluidSynth (LGPL, C) + a free General MIDI SoundFont | own wasm build + our LAME | both | waiting |

### Science, makers, software
| # | New tab | Open-source project | Engine | Platform | Status |
|---|---|---|---|---|---|
| 45 | **Number Theory Console**: factor and test numbers of any size, polynomials, modular arithmetic | PARI/GP (GPL, C; University of Bordeaux) | official WebAssembly build (or own) | PC | waiting |
| 46 | **3D Model from Code → STL**: write a shape, preview it, export for 3D printing | OpenSCAD (GPL, C++) | official openscad-wasm | PC | waiting |
| 47 | **Offline Wikipedia Reader**: open a downloaded .zim file (Wikipedia, Wiktionary, Stack Exchange) and browse it with no internet | Kiwix libzim (GPL, C++) | own wasm build | both (PC best: files are GBs) | waiting |
| 48 | **ESP32 / Arduino Flasher + Serial Monitor** | esptool-js (Espressif, Apache-2.0) | JavaScript + Chrome's Web Serial | PC (Chrome) | waiting |
| 49 | **R Console**: run R scripts and plots | webR (official R → wasm; R is GPL) | official wasm build | PC | waiting |
| 50 | **Packet Capture Viewer**: open .pcap/.pcapng files with Wireshark's own dissectors | Wiregasm (Wireshark → wasm, GPL) | official-community wasm build | PC (Software) | waiting |
| 51 | **Scratch for Kids**: block programming, save/open .sb3 files | Scratch GUI (MIT Scratch Foundation, BSD-3) | JavaScript, self-hosted | PC / tablet | waiting |

### Asked about by the owner (16 Nov 2026)
| # | New tab | Open-source project | Engine | Platform | Status |
|---|---|---|---|---|---|

**#54 Diagram Editor — built 28 Nov 2026** (the tab `diagram`; CLAUDE.md §3 "Diagram Editor"): its legal notes, the owner's question and its answer, the size check and the stateless plan were here; what was built follows them (the licence of v32.7.7 read again: plain Apache 2.0; the tab is called "Diagram Editor", not draw.io; draw.io's own loading logo left out of its page).
- **Not to be built until the owner says so** (the size rule).

### Need the owner's approval of a new data-API host (like the dictionary APIs)
| # | New tab | Data source | What is sent | Status |
|---|---|---|---|---|
| 52 | **Food Label Scanner**: scan a food barcode → ingredients, nutrition, allergens, Nutri-Score | Open Food Facts (open data, ODbL; free, no key) | the barcode number only | waiting |
| 53 | **Book Lookup by ISBN**: scan a book's barcode → title, author, cover, editions | Open Library (Internet Archive; free, no key) | the ISBN only | waiting |

### Upgrades to existing tabs (round 3)
| # | Upgrade | Project | Notes | Status |
|---|---|---|---|---|
| U4 | **Compress PDF: JBIG2** for black-and-white scans (often 5–10× smaller) | jbig2enc (Apache-2.0, C++) + Leptonica | own wasm build | waiting |
| U5 | **Doc Scanner / Make Searchable: unpaper** — deskew, remove black borders and specks | unpaper (GPL-2.0, C) | own wasm build | waiting |
| U6 | **Prime / LCM / GCD beyond 64 bits** | GMP (LGPL, C) | own wasm build; primality and GCD/LCM of any size | waiting |
| U7 | **Coordinates: UTM and other map grids** | PROJ (MIT, C++) | own wasm build | waiting |

## Round 4 — ready-made WebAssembly modules to use as they are (20 Nov 2026)
Asked by the owner: "are there any other ready popular interesting webassembly modules that u can pull in as is and make
a new app out of?" Answered with the ready-made ones already above (#2, #4, #7, #12, #28, #39, #46, #49; IDEAS.md: Typst,
Verovio, basic-pitch) and these new ones (npm versions checked 20 Nov 2026):
| # | New tab | Ready-made module | Platform | Status |
|---|---|---|---|---|
| 55 | **Cut Out Anything** (owner, 20 Nov 2026: "add it to potentials" — keep on the list): tap an object, pet or product in a photo → transparent PNG (the Background Remover does people only) | Segment Anything (SlimSAM / SAM 2 small) through Transformers.js 4.3 on ONNX Runtime Web (already on the site), Apache-2.0 | both | waiting |
| 56 | **Flash Player**: play old .swf games and animations offline (the user's own files) | Ruffle 0.8.0 (`@ruffle-rs/ruffle`, Rust → wasm, MIT OR Apache-2.0) | PC | waiting |
| 57 | **Lottie Animation Viewer**: open .json / .lottie animations, export GIF / MP4 / PNG frames | ThorVG (`@thorvg/lottie-player` 1.1.3 / `@lottiefiles/dotlottie-web` 0.83, MIT) | both | waiting |
| 58 | **Map File Converter**: KML / KMZ ⇄ GPX ⇄ GeoJSON ⇄ Shapefile ⇄ CSV | GDAL (`gdal3.js` 2.8.1, LGPL-2.1) | both | waiting |
| 59 | **Retro DOS PC**: run old DOS programs and games the user owns | js-dos 8.5 (DOSBox → wasm, GPL-2.0) | PC | waiting |
| 60 | **Code Screenshot**: code → a styled, syntax-highlighted PNG / SVG | Shiki 4.6 (MIT; its regex engine Oniguruma as wasm; mostly JavaScript — reason to record in §3a if accepted) | PC (Software) | waiting |

## Round 5 — everyday tools (20 Nov 2026)
Asked by the owner: "any other cool open source projects out there that I could actually use in day-to-day life?" —
the owner said "add all ten". Every one runs in the browser on the device; none uploads anything. Build none until picked.
| # | New tab | Engine | Platform | Status |
|---|---|---|---|---|
| 62 | **Authenticator Export Reader**: read Google Authenticator's "Transfer accounts" QR (`otpauth-migration://`) → each account with its own QR, to back up 2FA or move it to another app | zxing-wasm + devcore's protobuf reader (on the site) | both | waiting |
| 63 | **Photo Organizer**: rename photos by the date taken, shift a wrong camera clock, find photos without a date | ExifTool (on the site) + File System Access | PC | waiting |
| 64 | **Subtitle Sync**: shift or stretch an .srt to match a video, or line it up with the speech automatically (ffsubsync's method, MIT) | audio.wasm + a voice detector (RNNoise's, on the site) | both | waiting |
| 67 | **Object Eraser**: paint over a photobomber, a wire or a blemish and it is filled in | LaMa (Apache-2.0) on ONNX Runtime Web (on the site), ≈ 200 MB model | PC | waiting |
| 68 | **KeePass Vault Viewer**: open a .kdbx (KeePass, KeePassXC, KeePassDX), search, copy passwords, 2FA codes | kdbxweb (MIT, JavaScript) + hash-wasm's Argon2 (on the site) | both | waiting |
| 69 | **Data Notebook**: pandas and charts on a CSV / Excel file, offline | JupyterLite (BSD-3) on Pyodide (MPL-2.0) | PC | waiting |
| 70 | **CyberChef**: GCHQ's data toolkit — 400+ operations chained into recipes (decode, decompress, extract, convert) | CyberChef (Apache-2.0, JavaScript: a reason to record in §3a if accepted) | PC | waiting |

## Round 6 — asked for by the owner (20 – 21 Nov 2026)
| # | New tab | Engine | Platform | Status |
|---|---|---|---|---|
| 72 | **PDF / EPUB Creator** (owner, 21 Nov 2026: "add a new potential app … PDF/EPUB creator … PC only … kind of like a rich text editor where the user can either type, copy, paste, and even embed another PDF and copy paste pictures, insert pictures, and finally there should be an option to convert to either PDF or EPUB. Use all the existing functionality that is already there"): a rich-text editor (headings, bold / italic / underline, lists, links, tables, alignment); text typed or pasted (pasted web / Word text keeps its formatting, cleaned); pictures pasted, dropped or inserted (the camera beside the picker — owner rule); another PDF embedded — its pages as pictures, or chosen pages; then **Save as PDF** or **Save as EPUB** | Reuses what is on the site: MuPDF's HTML engine and Noto Sans (`src/lib/htmlpdf.ts`, the GST Invoice / Resume PDFs — fonts subset, links kept), the EPUB writer of PDF → EPUB (`src/lib/pdf2epub.ts`: XHTML pages, nav, NCX, JPEGs), MuPDF to draw an embedded PDF's pages, the codec worker (MozJPEG / OxiPNG) and the shared picture picker with camera; the editor itself is the browser's own editing on our TypeScript (as the Markdown Editor's toolbar) — WebAssembly first would be checked for any editor engine before a JS one (ProseMirror ≈ 0.3 MB if needed). Size: ≈ 0 MB new (no new engine); a JS editor library at most ≈ 0.3 MB | PC | waiting |
| 74 | **JS/TS → WebAssembly sweep** (not a tab — moved here from `todo.md` item 1 by the owner, 21 Nov 2026: "for now move 'JS/TS → WebAssembly sweep' from to-do to potentials.md"; the owner's words when it was added, 17 Nov 2026: "Do another sweep and as far as possible replace as much JS/TS code as you can into WebAssembly modules (JS/TS to WebAssembly build-out) if possible, only if doable and possible"): follow STANDING RULE #1 (an existing tried-and-tested WebAssembly module first — used for what it covers, the rest beside it; else our own WebAssembly build from open-source code, a port where the code exists only as JS/TS; JS/TS kept only where that is not doable, the reason in CLAUDE.md §3a) and STANDING RULE #2 (extensive tests for whatever moves). Starting points: CLAUDE.md §3a's "JavaScript-only components" table and audit list (`src/lib/curl.ts` → devcore; zip.js, mediabunny, OpenPGP.js, Mermaid, Prettier, TensorFlow.js) and its "Deliberately left in TypeScript" notes; then every `src/tools/**/*.ts` and `src/lib/*.ts` for loops, parsers and maths still in TypeScript | per item: an existing module where one fits, else our own Rust / C build into `wasm/` | — | waiting |

## Round 7 — things people didn't know they needed (21 Nov 2026)
Owner, 21 Nov 2026: "think of some cool new app ideas and utilities which we humans didn't know we needed. But once we
use them, we wonder how we existed without them" — then: "Add all these latest suggestions to potentials.md." Each runs
on the device and keeps nothing between visits; most only put engines already on the site together (size: ≈ 0 MB new).
**Windows and Linux alike (owner, 21 Nov 2026: "make a note that all these most recent PC Power tools … obviously work on
both Linux and Windows"):** every PC tool of this round — the Folder Space Map, the Backup Checker and Clean Link among them, Lecture Video →
Slides, Regex from Examples — works the same on Windows and Linux (Chrome or Edge; X11 and Wayland), as every tab must
(CLAUDE.md §1, rule 8); its suite runs on both kinds of system's paths and file dialogs where they differ.
| # | New tab | Engine | Platform | Status |
|---|---|---|---|---|
| 76 | **Screenshot Finder**: drop hundreds of screenshots and photos (a folder on a PC) and search the words inside them — "that PNR", "the Wi-Fi password someone sent"; the text is read on the device and forgotten when the tab is left | Tesseract (on the site), File System Access on PCs | both (big folders best on PC) | waiting |
| 79 | **Phone ⇄ PC Beam**: send files or text between a phone and a PC straight over the Wi-Fi — no app, account or server: the two screens connect by scanning each other's QR codes (the connection offer and answer, compressed), then the browser's own peer-to-peer link carries the files | WebRTC data channels (the browser's, compiled C++) + zxing (on the site) + fflate; to check first: networks that keep devices apart (guest / office Wi-Fi), iPhone Safari | both | waiting |
| 80 | **Measure from a Photo**: an A4 sheet or a bank card (85.6 × 54 mm) in the picture → tap its corners → measure anything in the same plane — a window, a wall, a sofa, a TV — straightened by one homography | imgproc's warp + homography (on the site) | both | waiting |
| 82 | **Is This Screenshot Real?**: a "payment successful" UPI screenshot or any photo checked for signs of editing — the software that saved it (ExifTool), a second JPEG save (error-level analysis, the quantization tables), patched or copied areas — with plain words on what it can and cannot prove (signs, never a proof that a picture is genuine) | ExifTool (on the site) + own C in imgproc / metacore (error levels, copy-move search) + MozJPEG (on the site) | both | waiting |
| 83 | **Scam & QR Check**: paste a suspicious SMS / WhatsApp message or scan a QR before paying → "this QR asks you to pay, it does not pay you", "this link imitates sbi.co.in with a look-alike letter" (Unicode's confusables, UTS #39), link shorteners, urgency and KYC wording typical of scams; offline | zxing (on the site) + own Rust in textkit with the `unicode-security` crate (MIT / Apache-2.0) or the UTS #39 data | both | waiting |
| 85 | **Lecture Video → Slides PDF**: drop a recorded class or webinar → each slide caught once when it changes → a searchable PDF of the slides (and their text as .txt) | WebCodecs + mediabunny or ffmpeg.wasm, imgproc (slide changes), Tesseract, MuPDF — all on the site | PC (long videos) | waiting |
| 86 | **Your Handwriting as a Font**: print a grid, fill it by hand, photograph it → a .ttf / .otf of your own handwriting to use anywhere | imgproc (the page found and straightened) + tracing (potrace / vtracer — #1's) + a font writer: candidates Google's `write-fonts` (Rust, Apache-2.0 / MIT) as own wasm, fontTools in the Python tab's CPython | both | waiting |
| 90 | **Family Emergency Card**: a wallet card (85.6 × 54 mm) and a bag sticker with blood group, allergies, medicines and emergency numbers, as text and a QR any phone reads offline → printable PDF; "Save details / Load details" as a file of your own, like the GST Invoice | zxing + MuPDF's HTML layout with Noto Sans (on the site) | both | waiting |
| 91 | **PDF Library Search** (owner, 21 Nov 2026: "ok add PDF Library Search" — from the second batch of round 7's question; asked how a web app takes a folder: the browser hands the page the files the reader picks or drops, nothing goes to a server): choose or drop a folder of PDFs and EPUBs ("Choose a folder", a folder dragged from Explorer / Dolphin, or File System Access on Chrome for PCs — Chrome's dialog says "upload", though the files only reach the page in the browser) → every word of every file searchable, each hit with its page and a small preview, a click opens that page; the index lives in memory and goes with the tab | MuPDF (on the site: text of PDFs and EPUBs, page previews) + an index and search of our own in WebAssembly (textcore / textkit) | both (folders on PCs; on phones many files picked at once) | waiting |
| 92 | **Social Media Sizer** (owner, 21 Nov 2026: "add to potentials.md … Social Media Sizer" — round 7's second batch): one photo → every size at once — WhatsApp DP, Instagram post (square and 4 : 5), story, carousel slices and the 3 × 3 grid, YouTube thumbnail, LinkedIn and X banners — the crop following the faces; each picture saved, or all as a .zip | MediaPipe BlazeFace (on the site) + @jsquash/resize and MozJPEG (on the site) + 7-Zip / zip.js (on the site) | both | waiting |
| 94 | **Pulse from Your Fingertip** (owner, 21 Nov 2026: "add … Pulse from Your Fingertip"): a finger over the phone's back camera with the flash on → the pulse in about 20 seconds from the red light that changes with each heartbeat (photoplethysmography), with a signal-quality bar and the wave drawn; "not a medical device" said plainly. The flash is switched on by the page where the browser allows it (Android Chrome); iPhone Safari gives a page no flash control — bright light behind the finger instead, less sure | the camera (`src/lib/livecam.ts`) + own C (band-pass filter, peaks and autocorrelation; in audio.wasm or a small module of its own) | mobile only (needs a phone's camera and flash) | waiting |
| 95 | **Regex from Examples** (owner, 21 Nov 2026: "add … Regex from Examples"): type a few strings that should match (and, optionally, some that should not) → the regular expression — digits as \\d, repeats folded, case and anchors as chosen — with "Try it in the Regex Tester" | grex (Peter M. Stahl, Rust, Apache-2.0): its own WebAssembly build if one is published (to check), else our own build of the crate | PC (Software) | waiting |
| 97 | **Printable Paper** (owner, 21 Nov 2026: "add …" — round 7's third batch): graph (1 / 2 / 5 mm), dotted, isometric, hexagonal, music staff, calligraphy and handwriting guides, kids' letter-tracing sheets (A – Z, 0 – 9, cursive), planner pages (day, week, month, to-do) → a PDF at the exact size (A4, A5, Letter) with margins for a binder | MuPDF (on the site: vector lines at exact sizes) + the handwriting and Noto fonts on the site | both | waiting |
| 98 | **Old Photo Album Scanner** (owner, 21 Nov 2026: "add …" — round 7's third batch): a print photographed 3 – 4 times from different angles → the shots aligned and the glare taken out (each spot kept from a shot where it does not shine); or several prints on a flatbed scan or a table → each found, straightened and saved on its own — a parents' album digitised in an evening | imgproc (on the site: the page finder for several prints, the homography warp) + own C for aligning the shots and combining them | both | waiting |
| 99 | **Best Shot from a Video** (owner, 21 Nov 2026: "add …" — round 7's third batch): a short video of kids, pets or a moment → the sharpest frames where every face has its eyes open (and smiles, if asked) → full-size photos | WebCodecs + mediabunny, MediaPipe Face Landmarker (its blink and smile scores), imgproc (sharpness), MozJPEG — all on the site | both | waiting |
| 100 | **Magnifier** (owner, 21 Nov 2026: "add …" — round 7's third batch): the phone's back camera (or a PC's webcam) as a magnifying glass — zoom (the camera's own where the browser gives it), freeze the frame and move around it, high contrast, inverted and yellow-on-black, the torch — medicine labels, bills, small print | the live camera (`src/lib/livecam.ts`) + imgproc's filters (on the site) | both (phones first) | waiting |
| 101 | **Clean Link** (owner, 21 Nov 2026: "add …" — round 7's third batch): paste a link → the tracking parts taken off (utm_…, fbclid, gclid, igshid, si, ref …; Amazon and Flipkart product links cut to the product's own address) and where it points shown in plain words (the site's real name, look-alike letters — shared with #83) → copy or share the clean link; offline, so a shortener's redirect cannot be followed (said) | own Rust in devcore (the URL taken apart, rules after the open ClearURLs list, LGPL-3.0 data) | both (Windows, Linux, phones) | waiting |
| 102 | **Folder Space Map** (owner, 21 Nov 2026: "add …" — round 7's third batch); asked whether a whole drive would run out of memory — no: only the files' names, sizes and dates are read, never their contents (a million files ≈ 100 MB of list), and Chrome keeps pages out of system folders and, it seems, the top of a drive — so a big folder (Documents, Downloads, Videos, a data drive's folders)): what fills a folder as nested boxes, the biggest, oldest and duplicate files (same size first, then only those hashed in 4 MB slices) | File System Access (Chrome, Edge on PCs) + hash-wasm (on the site) + an own treemap layout in WebAssembly | PC — Windows and Linux | waiting |
| 103 | **Handwriting Analysis** (owner, 21 Nov 2026: "a new app … that scans a handwritten page by a human and then studies the handwriting and gives an analysis of the person's character. Basically, handwriting analysis."): photograph or scan a handwritten page → the page found and straightened → the handwriting measured: slant (the strokes' angle), the size of the letters and of the loops above and below, the spaces between letters, words and lines, the baseline rising or falling, margins, pen pressure (the ink's darkness and width), letters joined or apart, how regular it all is → a profile with the numbers and pictures of each feature; then the character traits graphology traditionally reads into those features. **Said plainly in the tab:** the measurements are real, the character reading is entertainment — studies find graphology's personality readings no better than chance — so nothing to judge a person (a job, a match) by | imgproc (on the site: the page finder, the ink, the projection profiles of `p_text_lines` for slant and lines, the letters as components) + own C for the measurements | both | waiting |
| 104 | **Typst Studio** (owner, 21 Nov 2026: "add …" — round 7's fourth batch, open-source projects included): write letters, reports, résumés, invoices and slides in Typst's simple markup → a beautiful PDF beside it, updated as you type; templates to start from; open / save .typ files. Typst's online package registry is code fetched at run time — not allowed: a chosen set of packages is hosted here instead | Typst (typst/typst, Rust, Apache-2.0) as WebAssembly — the existing build of typst.ts (Myriad-Dreamin, Apache-2.0) first; its fonts hosted here | PC (an editor; phones could view) | waiting |
| 105 | **Air-Gap File Transfer** (owner, 21 Nov 2026: "add …" — round 7's fourth batch, open-source projects included): move a file between a PC and a phone with no network at all — one screen plays animated colour codes (with error-correcting fountain codes, so missed frames do not matter), the other's camera films them and rebuilds the file; for sensitive files and places without Wi-Fi | libcimbar (sz3/libcimbar, C++, MPL-2.0; its authors' own WebAssembly build of the encoder and decoder) + the live camera (on the site) | both | waiting |
| 107 | **Simple Video Editor** (owner, 21 Nov 2026: "add …" — round 7's fourth batch, open-source projects included): a timeline — trim, split and join clips and photos, text titles, music with fades, simple transitions → MP4 (H.264 / AAC), all in the browser | Omniclip (omni-media/omniclip, open source, on the browser's WebCodecs — its licence and upkeep to check) or our own on mediabunny + WebCodecs (on the site) | PC | waiting |
| 108 | **Audio Editor** (owner, 21 Nov 2026: "add …" — round 7's fourth batch, open-source projects included): Audacity in the browser — several tracks, cut / copy / paste, effects, noise reduction, fades, record → WAV / MP3 | Wavacity (Audacity compiled to WebAssembly, GPL — its upkeep and size to check) + our LAME for MP3 (on the site) | PC | waiting |
| 111 | **Trip Settle-Up** (owner, 21 Nov 2026: "add …" — round 7's fifth batch): every expense of a trip or a shared flat's month — who paid, how much, for whom (everyone, some of them, or unequal shares) → each person's balance in whole paise and **the fewest payments that settle everyone** (exact for groups up to about 20: a search for groups whose balances cancel; beyond that, the largest debt paid to the largest credit — never more than one payment fewer than the people), each payment with a UPI QR and link for the exact amount to the payee's UPI ID, and a summary to share on WhatsApp; "Save details / Load details" as a file of one's own (like the GST Invoice), since nothing is kept between visits. Unlike #78 (one bill, by photo) and the Tip & Bill Splitter (one bill, equal shares) | own C in mathcore (balances, the settlement search) + the QR tab's `upi()` and zxing (on the site) | both | waiting |
| 112 | **Backup Checker** (owner, 21 Nov 2026: "add …" — round 7's fifth batch): choose the original folder and its copy (an external disk, a pen drive, a network share mounted on the PC) → every file compared: missing from the copy, extra in it, changed (size and date first; the contents by hash when asked — BLAKE3 in 4 MB slices in the hash worker), moved to another folder (found by its hash), and names the other system cannot hold (Windows' forbidden characters and reserved names, two names differing only in case — fine on Linux, one file on Windows —, paths beyond 260 characters, files over 4 GB for a FAT32 pen drive) → a report to save (.txt / .csv); nothing is ever written to either folder. Only names, sizes and dates are read unless the contents are compared (as #102) | File System Access (Chrome, Edge on PCs) + hash-wasm (on the site) + own Rust in devcore for the comparison | PC — Windows and Linux | waiting |
| 113 | **Screenshot Annotator & How-To Guide** (owner, 21 Nov 2026: "add …" — round 7's fifth batch): a screenshot or photo (pasted with Ctrl+V, chosen, taken with the camera — the picture-picker rule —, or straight from the Screenshot tab) → arrows, boxes, circles, numbered step markers, highlighter, text callouts, blur or pixelate (passwords, account numbers: burnt into the pixels when saved), crop, undo / redo → PNG / JPEG or the clipboard. **How-to guide:** several annotated screenshots, each with a caption ("Step 3: tap Renew") → one PDF, or one tall picture for WhatsApp — "how to renew the policy online", for parents | canvas drawing + imgproc's blur and pixelate (as Blur & Redact) + MozJPEG / OxiPNG + MuPDF's HTML layout with Noto Sans — all on the site | both (mouse or finger) | waiting |

## Round 8 — free online data (21 Nov 2026)
Owner, 21 Nov 2026: "Any cool new app ideas so that the app connects to free APIs out there on the internet, whether it's
sports, wallpapers, space, cool facts, trivia, something fun, anything?" — then picked the three below. Each fetches
**data** from a public service, which the hard requirements allow (CLAUDE.md §1, rule 2) — but every host must first be
approved by the owner and added to the CSP's `connect-src`, §3a "Approved data APIs" and `no-external.e2e.mjs` (picking
the tab after the size check is that approval). Only services that need **no key or account** (a key in a public page is
public). Pictures are fetched through `connect-src` and shown from `blob:` URLs, so `img-src` stays `'self'`; only the
search words go out; a service that is down is said in words.
| # | New tab | Engine | Platform | Status |
|---|---|---|---|---|

## Round 9 — asked for by the owner (26 Nov 2026)
| # | New tab | Engine | Platform | Status |
|---|---|---|---|---|

## Round 10 — asked for by the owner (27 Nov 2026)
Asked by the owner: "Suppose we merge all the WebAssembly modules into one big WebAssembly modules for the sake of efficiency
and speed. Is that a good idea or not a good idea?" — **not done**: every tab would fetch and compile all 73 modules (213 MB)
instead of its own (the start page fetches none, the Word Counter 0.2 MB) — too large for an iPhone, and WebAssembly memory
never shrinks, so nothing could be let go when a tab is left (CLAUDE.md §4); the toolchains cannot be linked into one module
(Go's and .NET's runtimes, TeaVM's WebAssembly GC, the official Emscripten builds of FFmpeg, MuPDF, SQLite and ONNX Runtime
with their own glue); BusyBox (GPL-2.0 only) cannot be one program with MuPDF (AGPL-3.0) or Apache-2.0 code; one fault — such
as FFmpeg's damaged memory (to-do #32) — would reach every tool; any change would make every visitor fetch all of it again;
the site keeps every file under 100 MB (CLAUDE.md §5.1j). Two smaller ideas instead — the owner: "Ok, add both to potentials":
| # | New tab | Engine | Platform | Status |
|---|---|---|---|---|
| 118 | **One module for the three small engines** (not a tab): mathcore (151.6 KB, 65 KB gzipped), crypto (57.1 KB, 23 KB) and textcore (40.2 KB, 15 KB) linked into one of about 249 KB (104 KB gzipped) — one download and one compilation where a page needs two of them. **Checked on 27 Nov 2026: likely no gain.** Only Mock Data loads two of them together (crypto and mathcore, fetched side by side — over HTTP/2 the second request costs almost nothing); otherwise they meet only when the search box (textcore, fetched on its first use) is used on a page whose tab has one of the others, at another moment; and every tab that needs one of them would fetch all three — Random Number, List Picker, Team Splitter, UUID and Line Tools' shuffle 23 → 104 KB gzipped, the search box 15 → 104 KB. Do it only if a measurement shows a gain (the time to a tab's first result, on a first visit and cached, on a PC and a phone) | our own C (`wasm/mathcore`, `wasm/crypto`, `wasm/textcore`) built into one WASI reactor with one memory; the search box keeps an instance of its own | — | waiting |
| 119 | **Fetch ahead** (not a tab): when the pointer rests on a tab's card or its tab (on phones, which have no hover: as a touch starts), start fetching what that tab needs into the browser's cache — its code at once, its engine too where the engine is small — so the tab opens and gives its first result sooner. **Checked on 27 Nov 2026:** the tabs' code is small (half of the build's 310 code files are under 7.4 KB, nine in ten under 141 KB), so fetching it ahead saves about one round trip to the site (not measured yet); the engines are what takes seconds (MuPDF 9.9 MB, ExifTool 24 MB). **Fetching an engine before its tab is used bends the owner's rule of lazy loading** (CLAUDE.md §1 rule 11, §4: an engine is fetched on first use, never as the tab opens): it would only fill the browser's cache — nothing compiled, no memory held, the release on leave unchanged —, but a card the pointer rests on and that is not opened costs its data. So: the owner's word on that first; engines of a few MB only (never Biome's 67 MB, FFmpeg's 31 MB or a model); nothing where the browser asks to save data or the connection is slow; `tests/e2e/lazy.e2e.mjs` learns the rule; measure first (a click to a tab's first view and to its first result, on a PC and a phone) | the browser's own preloading (`<link rel="modulepreload">` for a tab's code — what a click fetches anyway —, a low-priority `fetch()` for an engine) — nothing new, ≈ 0 MB | — | waiting |

## Notes
- **Cheapest wins:** the "reuse engines" tabs still waiting (17, 18), Duplicate Photo Finder, WireGuard Config.
- **Heavy ones:** Pandoc, Demucs, the upscaler models, LaTeX and Sky Map download only when their tab is used.
- **JavaScript-only (tier 4, reason recorded if accepted):** Excalidraw and CircuitJS1 have no compiled equivalent.
- **Data API:** only #29, #52 and #53 contact another host, each only after the owner approves it (CLAUDE.md §3a
  "Approved data APIs").
- **Round 7 favourites (Claude's pick when suggesting them):** 76 Screenshot Finder, 77 Paper Deadlines, 78 Bill Splitter
  by Photo, 83 Scam & QR Check, 85 Lecture Video → Slides.
- **Round 3 cheapest wins:** DIGIPIN & Plus Codes, Calendar Converter, Aadhaar/e-Invoice QR Verifier,
  Favicon Maker, JBIG2 for scans.

## Removed by the owner (16 – 21 Nov 2026) — do not suggest again
- Chess Board + Analysis (Stockfish)
- Python/JS Linter & Formatter (Ruff / Biome)
- Offline Translation (Mozilla Bergamot)
- v86 — a real Linux in an emulated PC, for the Terminal or a tab of its own (owner, 20 Nov 2026: "leave out V86 completely")
- Auto Subtitles (#13) — owner, 20 Nov 2026: removed together with the Speech to Text tab whose engine it would have reused
  (Speech to Text was taken off the site to make room for apps used more often)
- XIRR / Mutual-fund Returns (#66: the real return from actual SIP and redemption dates, CAGR) — owner, 21 Nov 2026: "remove
  XIRR / Mutual-fund Returns"
- Anki Flashcards from CSV (#44: an .apkg deck for the Anki app) — owner, 21 Nov 2026: "remove 44 Anki Flashcards"
- Kindle Highlights Exporter (#65: `My Clippings.txt` → a file per book, or Anki cards) — owner, 21 Nov 2026: "remove Kindle
  Highlights Exporter (#65)"

## Related
`docs/IDEAS.md` is an earlier, longer research list from 15 Nov 2026, also waiting for the owner. It overlaps with this
one and adds Office → PDF, Redact PDF, AI Magic Eraser, Grammar Check (Harper), Indic Script Converter, Symbolic Math,
Panchang and more.
