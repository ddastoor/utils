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

When the owner picks a tab (after the size check):
1. Mark it **accepted** here.
2. Add it to the registry in the best-fitting category (CLAUDE.md §2 "New utilities").
3. Build it by CLAUDE.md §8, WebAssembly first (STANDING RULE #1).
4. Give it its own thorough e2e suite.

Every candidate:
- runs fully on the device;
- compiles to WebAssembly (C/C++/Rust), ships an official wasm build, or (where marked) is a JavaScript-only project;
- is served from this site, with its heavy parts downloaded only when the tab is used (lazy loading, CLAUDE.md §4);
- duplicates no existing tab and nothing the owner rejected.

Platform: "both" = PC + mobile.

## Size check of every candidate (20 Nov 2026)
The site is **512 MB** (511,614,356 bytes, `du -sb dist`, after Speech to Text was removed on 20 Nov 2026 — it was
763 MB) of GitHub Pages' 1 GB for a published site (read as 10⁹ bytes) → **488 MB of room**. A size here is what the tab would ship — one build, without source maps or debug copies —
measured on 20 Nov 2026 from the package's file list (`npm pack <pkg> --dry-run --json`) or the model's file list on
Hugging Face (`huggingface.co/api/models/<repo>/tree/main`). **"est."** = no published build that could be measured
from the sandbox (GitHub is not reachable there): measure it before building.
- **Nothing new — about 0 – 0.3 MB, the tab's own code; its engines are already on the site:** 3 Make PDF Searchable,
  9 Shamir Secret Split, 14 Audiobook, 15 PDF Compare, 16 PDF Tables → Excel, 17 Video Face Blur,
  18 Label Sheets, 20 Duplicate Photos, 27 WireGuard, 30 Aadhaar / e-Invoice QR, 31 DIGIPIN, 34 Calendar Converter,
  36 Metadata Remover, 44 Anki Flashcards, 61 PDF Redact, 62 Authenticator Export, 63 Photo Organizer, 64 Subtitle
  Sync, 65 Kindle Highlights, 66 XIRR, 71 EPUB Reader; and 29 Breach Check, 52 Food Label, 53 Book Lookup (each needs its data-API host
  approved first).
- **Small — under 10 MB:** 1 Image to SVG 0.2 (vtracer / potrace) · 2 Photo Upscaler 4.8 (Real-ESRGAN general x4v3;
  the best model, x4plus, 33.7 at half precision / 67.1 full) · 6 GIF Maker 0.7 (gifski) · 7 AVIF / JPEG XL 7 (jSquash:
  AVIF 3.5 + 1.2, JXL 1.4 + 0.8; one-thread builds) · 8 age 0.1 · 10 Spell Checker ≈ 3 (Hunspell 0.8 + dictionaries,
  est.) · 11 BPM & Key 0.4 (aubio) · 19 Music Tags 0.7 (TagLib) · 23 Circuit Simulator ≈ 2 (est.) · 25 Chart Maker < 1
  (est.) · 26 Certificate Maker + 32 PDF Signatures ≈ 1 together (one Mbed TLS build, est.) · 33 Phone Numbers ≈ 1 – 2
  (libphonenumber, est.) · 35 DjVu ≈ 1 – 2 (est.) · 37 Hidden Message < 1 (steghide, est.) · 38 RAW Photos 1.4 (LibRaw)
  · 41 Favicon Maker 2.4 (resvg) · 42 Audio Effects ≈ 1 – 2 (SoX, est.) · 45 PARI/GP ≈ 5 – 10 (est.) · 47 Offline
  Wikipedia ≈ 2 – 5 (libzim, est.; the .zim files are the user's own, never hosted) · 48 ESP32 Flasher 0.5 · 57 Lottie
  1.2 (ThorVG) · 60 Code Screenshot ≈ 3 – 6 (Shiki 0.6 + the languages chosen) · 68 KeePass 0.3 (kdbxweb; Argon2 is on
  the site) · 70 CyberChef 9.0 (its OCR data left out: the site has Tesseract) · U4 JBIG2 ≈ 1, U5 unpaper < 1, U6 GMP
  ≈ 1 (est.).
- **Medium — 10 to 60 MB:** 4 Document Converter 58.6 (pandoc.wasm) · 12 CSV/Excel SQL 37 (DuckDB, one of its three
  builds: 35.9 + worker) · 21 Whiteboard 17.7 (Excalidraw with its fonts) · 24 Sky Map ≈ 20 – 50 (est.) · 28 Code Runner:
  Lua 0.5, Ruby + 30.6, PHP + ≈ 50 (its ICU data alone 30.8), C + ≈ 70 (est.) · 39 Image Converter 16.3 (ImageMagick) ·
  40 Panorama ≈ 10 – 15 (own OpenCV build with stitching, est.; opencv.js without it is 13.3) · 43 MIDI → MP3 ≈ 9 – 33
  (FluidSynth 2.4 + a SoundFont, est.) · 46 3D → STL 11.1 (OpenSCAD) · 49 R Console 48.7 (webR) · 54 Diagram Editor ≈ 40 –
  60 (draw.io, est.) · 55 Cut Out Anything 13.8 (SlimSAM, quantized; SAM 2.1 tiny 33.1) + Transformers.js ≈ 1 – 2 ·
  56 Flash Player 15.3 (Ruffle) · 58 Map Converter 40 (GDAL: 28.2 + 11.6 data) · 59 Retro DOS ≈ 8 – 18 (js-dos) · U2 Full
  Python ≈ 45 (Pyodide 13.9 measured + numpy / pandas / matplotlib, est.) · U7 PROJ ≈ 12 (est., with its database).
- **Large — over 60 MB:** 5 Vocal Remover 180.5 (HTDemucs; 113.1 for vocals only with Open-Unmix) · 22 LaTeX ≈ 175 (est.)
  · 50 Packet Capture 76 (Wiregasm: 73.4 + 2.6) · 51 Scratch 87 (the GUI) + the sprite and sound library it normally
  fetches from Scratch's servers · 67 Object Eraser 208 (LaMa) · 69 Data Notebook ≈ 70 (JupyterLite, est.).
- **Off the list:** U1 Hindi voices (owner's rule, 20 Nov 2026: no Hindi work); U3 needs our own FFmpeg build first.
- **What could make room, biggest first** (Speech to Text, 238 MB, was removed on 20 Nov 2026): Text-to-Speech's Kokoro voices (US / UK) 94 MB or Piper's (Indian English) 73 MB · Code
  Formatter's Biome 67 MB (Prettier, JavaScript, would format those languages instead) · a whole tab's engine: Photo
  Dictionary 34, FFmpeg 31, OCR 27, EXIF 24. Or, removing nothing: a **second GitHub Pages site** of the owner's
  (`ddastoor.github.io/<another repo>/`) for big models — the same web address (origin), so the CSP and the "served from
  this site" rule hold, with its own 1 GB.

## Round 1 — top picks
| # | New tab | Open-source project | Engine | Download | Platform | Status |
|---|---|---|---|---|---|---|
| 1 | **Image to SVG**: trace a logo, signature or scan into vectors | vtracer (Rust, MIT) or potrace (C, GPL) | own wasm build | < 1 MB | both | waiting |
| 2 | **Photo Upscaler**: 2× / 4×, sharpen blurry or small photos | Real-ESRGAN / Upscayl models | ONNX Runtime Web (already on the site for TTS) | 17–65 MB model | both | waiting |
| 3 | **Make PDF Searchable**: add an OCR text layer to scanned PDFs | the idea behind OCRmyPDF | Tesseract + MuPDF (both already on the site) | nothing new | both | waiting |
| 4 | **Document Converter**: DOCX ⇄ Markdown / HTML / EPUB / ODT (owner, 20 Nov 2026: "include all the Pandoc uses when you come to the Pandoc app" — when it is built, every popular Pandoc use gets its own button, as in the FFmpeg tab, no command line needed; search the web for the popular uses first; what pandoc.wasm cannot do is added beside it by STANDING RULE #1 or said in the tab) | Pandoc | official pandoc.wasm | ≈ 50 MB | PC | waiting |
| 5 | **Vocal Remover / Karaoke**: split vocals from music | Demucs (stem separation) | ONNX Runtime Web | 80+ MB model | PC | waiting |

## Round 1 — also good fits
| # | New tab | Project | Notes | Status |
|---|---|---|---|---|
| 6 | **GIF Maker**: video or photos → high-quality GIF | gifski (Rust) | best-quality GIF encoder | waiting |
| 7 | **AVIF / JPEG XL Converter** | libavif, libjxl (C/C++) | smaller photos than JPEG/WebP | waiting |
| 8 | **age Encrypt**: modern file encryption | age / rage format | files open with the standard `age` tool on any computer; can use our libsodium | waiting |
| 9 | **Shamir Secret Split**: split a password into N parts, any K recover it | ssss-style, in our own C | small; good for family emergency info | waiting |
| 10 | **Spell Checker** (en-US / en-GB / en-IN) | Hunspell (C++) + open dictionaries | ≈ 1–2 MB | waiting |
| 11 | **BPM & Key Detector** for songs | aubio (C) | small | waiting |
| 12 | **CSV/Excel SQL**: query big spreadsheets with SQL | DuckDB-wasm (official) | PC; complements the SQLite tab | waiting |

## Round 2 — reuse engines already on the site (cheapest)
| # | New tab | Built from | What it does | Platform | Status |
|---|---|---|---|---|---|
| 14 | **PDF / EPUB → Audiobook** | MuPDF text + Kokoro/Piper voices + our LAME | Read a book or PDF aloud into MP3s, one per chapter | both (long books best on PC) | waiting |
| 15 | **PDF Compare** | MuPDF text + our textcore Myers diff | Two versions of a contract or agreement side by side, changes highlighted on the pages | both | waiting |
| 16 | **PDF Tables → Excel** (bank statements, bills) | MuPDF structured text + own C table detection (extends our XY-cut) + our rust_xlsxwriter | Bank-statement PDFs → clean rows in Excel/CSV. Tabula/Camelot are Java/Python, so own C | both | waiting |
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
| 25 | **Chart Maker**: CSV/Excel → bar, line, pie, scatter chart → PNG/SVG | plotters (Rust, MIT) | own wasm build | < 1 MB | both | waiting |
| 26 | **Certificate Maker**: CSR, self-signed certificates, PEM ⇄ DER ⇄ PFX/P12 | Mbed TLS (C, Apache-2.0) | own wasm build; complements Certificate Decoder | < 1 MB | PC (Software) | waiting |
| 27 | **WireGuard Config Generator**: keys + config file + QR for the phone app | WireGuard config format | our libsodium (X25519) + zxing QR | none | PC (Software) | waiting |
| 28 | **Code Runner**: Lua / Ruby / PHP / C snippets | Lua (MIT, C), ruby.wasm (official), php-wasm (official), wasm-clang (Apache-2.0) | own Lua build; official builds for the others | Lua < 1 MB; others 10–40 MB each | PC (Software) | waiting |
| 29 | **Password Breach Check** (inside Password Strength) | Have I Been Pwned "Pwned Passwords" range API (free, no key) | only the first 5 characters of the password's SHA-1 are sent (k-anonymity); **needs the owner's approval of a new data-API host** (`api.pwnedpasswords.com`) | none | PC (Software) | waiting |

## Upgrades to existing or planned tabs (round 2)
| # | Upgrade | Project | Notes | Status |
|---|---|---|---|---|
| U1 | **Hindi voices** in Text-to-Speech | Piper `hi_IN` voices (pratham, rohan) | same Piper engine already on the site; dataset licence is non-commercial (personal use is fine). The owner skipped Hindi for OCR, so ask first. | waiting |
| U2 | **"Full Python"** option in the planned Python tab | Pyodide (MPL-2.0, official CPython wasm) | numpy / pandas / matplotlib beside the built-in CPython 3.14 (standard library only); ≈ 10–30 MB, loaded only when chosen | waiting |
| U3 | **Video Stabilizer** | vid.stab (GPL) inside our own FFmpeg build | possible only after the own-FFmpeg build on the §3a audit list | waiting |

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
| 44 | **Anki Flashcards from CSV**: make an .apkg deck (front/back, images) for the Anki app | Anki deck format | our SQLite + zip (on the site) | both | waiting |

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
| 54 | **Diagram Editor** (owner, 20 Nov 2026: "keep 54 in potentials.md (don't build it yet)"; checked that day: the draw.io repository's LICENSE is Apache-2.0; its engine mxGraph (JS) is archived, the TypeScript successor is maxGraph 0.25.1, Apache-2.0 — self-hosting the draw.io app is the recommended route): flowcharts, org charts, network / UML / BPMN diagrams, floor plans; open and save `.drawio` files, export PNG / SVG (PDF via our MuPDF if the web build's PDF export needs a server) | the real draw.io web app (`jgraph/drawio`), self-hosted — not a clone | JavaScript (mxGraph) — no compiled diagram editor exists (tier 4, record in §3a); runs in an iframe page with its own CSP, driven by draw.io's embed (postMessage) protocol so files stay on the device; cloud integrations and browser storage switched off; the no-external test must see zero outside requests | PC (works on tablets) | waiting |

**Legal notes for #54 (checked 16 Nov 2026, primary sources):** the repository's `LICENSE` file is the plain Apache
License 2.0 and its README says "The source code in this repository is licensed under the Apache License 2.0" and even
suggests publishing a fork on GitHub Pages. (A secondary source claims a 2024 switch to a "JGraph Adapted Apache
License"; the current LICENSE file does not show it. Re-read the LICENSE of the exact pinned version before vendoring.)
Conditions: ship the Apache licence, mark modified files, keep notices; **trademarks** — do not use the draw.io name or
logo as our tab's name/branding or imply endorsement (the tab is "Diagram Editor"; the credits may say where the code
comes from, which Apache §6 allows); the icon/stencil restriction only concerns Atlassian products; vendor only shape
libraries whose licences allow redistribution. Overlaps #21 (Excalidraw, sketch style) and the planned Mermaid tab
(text → diagram); draw.io is the formal drag-and-drop editor. **Owner (16 Nov 2026): keep #21 Excalidraw as well** — they
are separate candidates, not alternatives.

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
| 61 | **PDF Redact**: black out an Aadhaar number, PAN, account number or address so the text is really gone from the PDF (not a box over it) | MuPDF (on the site): redaction annotations applied | both | waiting |
| 62 | **Authenticator Export Reader**: read Google Authenticator's "Transfer accounts" QR (`otpauth-migration://`) → each account with its own QR, to back up 2FA or move it to another app | zxing-wasm + devcore's protobuf reader (on the site) | both | waiting |
| 63 | **Photo Organizer**: rename photos by the date taken, shift a wrong camera clock, find photos without a date | ExifTool (on the site) + File System Access | PC | waiting |
| 64 | **Subtitle Sync**: shift or stretch an .srt to match a video, or line it up with the speech automatically (ffsubsync's method, MIT) | audio.wasm + a voice detector (RNNoise's, on the site) | both | waiting |
| 65 | **Kindle Highlights Exporter**: `My Clippings.txt` → a clean Markdown / CSV file per book, duplicates removed, or Anki cards | own parser (Rust → wasm) | both | waiting |
| 66 | **XIRR / Mutual-fund Returns**: the real return from actual SIP and redemption dates (Excel's XIRR), CAGR | mathcore (on the site) | both | waiting |
| 67 | **Object Eraser**: paint over a photobomber, a wire or a blemish and it is filled in | LaMa (Apache-2.0) on ONNX Runtime Web (on the site), ≈ 200 MB model | PC | waiting |
| 68 | **KeePass Vault Viewer**: open a .kdbx (KeePass, KeePassXC, KeePassDX), search, copy passwords, 2FA codes | kdbxweb (MIT, JavaScript) + hash-wasm's Argon2 (on the site) | both | waiting |
| 69 | **Data Notebook**: pandas and charts on a CSV / Excel file, offline | JupyterLite (BSD-3) on Pyodide (MPL-2.0) | PC | waiting |
| 70 | **CyberChef**: GCHQ's data toolkit — 400+ operations chained into recipes (decode, decompress, extract, convert) | CyberChef (Apache-2.0, JavaScript: a reason to record in §3a if accepted) | PC | waiting |

## Round 6 — asked for by the owner (20 Nov 2026)
| # | New tab | Engine | Platform | Status |
|---|---|---|---|---|
| 71 | **EPUB Reader** (owner, 20 Nov 2026: "add EPUB reader in potentials.md"): read .epub books (and FB2, CBZ comics — MuPDF reads those too; MOBI to be checked) — contents, page turning (tap, swipe, keys), font size and margins, light / dark / sepia, search in the book, go to a page or chapter; the book never leaves the device. A book's last page cannot be kept between visits (hard rule 1: nothing stored but Favorites) unless the owner allows it the way Favorites are | MuPDF (on the site; lays out reflowable books with HarfBuzz at any font size) — ≈ 0 MB new; Literata (on the site) for the text; read-aloud could reuse Text-to-Speech | both | waiting |

## Notes
- **Cheapest wins:** Image to SVG, Make PDF Searchable, the five "reuse engines" tabs (14–18), Duplicate Photo Finder,
  Chart Maker, WireGuard Config.
- **Heavy ones:** Pandoc, Demucs, the upscaler models, LaTeX and Sky Map download only when their tab is used.
- **JavaScript-only (tier 4, reason recorded if accepted):** Excalidraw and CircuitJS1 have no compiled equivalent.
- **Data API:** only #29, #52 and #53 contact another host, each only after the owner approves it (CLAUDE.md §3a
  "Approved data APIs").
- **Round 3 cheapest wins:** DIGIPIN & Plus Codes, Calendar Converter, Aadhaar/e-Invoice QR Verifier, Anki Flashcards,
  Favicon Maker, JBIG2 for scans.

## Removed by the owner (16 Nov 2026) — do not suggest again
- Chess Board + Analysis (Stockfish)
- Python/JS Linter & Formatter (Ruff / Biome)
- Offline Translation (Mozilla Bergamot)
- v86 — a real Linux in an emulated PC, for the Terminal or a tab of its own (owner, 20 Nov 2026: "leave out V86 completely")
- Auto Subtitles (#13) — owner, 20 Nov 2026: removed together with the Speech to Text tab whose engine it would have reused
  (Speech to Text was taken off the site to make room for apps used more often)

## Related
`docs/IDEAS.md` is an earlier, longer research list from 15 Nov 2026, also waiting for the owner. It overlaps with this
one and adds Office → PDF, Redact PDF, AI Magic Eraser, Grammar Check (Harper), Indic Script Converter, Symbolic Math,
Panchang and more.
