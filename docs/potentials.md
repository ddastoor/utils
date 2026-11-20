# Potential new tabs — waiting for the owner's go-ahead

Open-source projects suggested on **16 Nov 2026** in answer to the owner's questions "Any other interesting GitHub utility
projects which you can add as utility tabs?" (round 1), "Any more interesting and useful open source, legal and free
GitHub projects … given all the restraints and conditions I have put?" (round 2) and "Any more cool open source projects,
not just GitHub, in general … maintaining the rules and constraints" (round 3).

**Status: none accepted yet. Build nothing from this list until the owner picks.**

**Reminder rule (owner, 16 Nov 2026):** remind the owner about this list and ask whether to build any of it:
- when the current per-tab test work is finished, before starting the Software tabs;
- at the start of any new session that resumes from `docs/RESUME.md`.

When the owner picks a tab:
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

## Round 1 — top picks
| # | New tab | Open-source project | Engine | Download | Platform | Status |
|---|---|---|---|---|---|---|
| 1 | **Image to SVG**: trace a logo, signature or scan into vectors | vtracer (Rust, MIT) or potrace (C, GPL) | own wasm build | < 1 MB | both | waiting |
| 2 | **Photo Upscaler**: 2× / 4×, sharpen blurry or small photos | Real-ESRGAN / Upscayl models | ONNX Runtime Web (already on the site for TTS) | 17–65 MB model | both | waiting |
| 3 | **Make PDF Searchable**: add an OCR text layer to scanned PDFs | the idea behind OCRmyPDF | Tesseract + MuPDF (both already on the site) | nothing new | both | waiting |
| 4 | **Document Converter**: DOCX ⇄ Markdown / HTML / EPUB / ODT | Pandoc | official pandoc.wasm | ≈ 50 MB | PC | waiting |
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
| 13 | **Auto Subtitles** | whisper.cpp (our build) + WebCodecs/mediabunny, or FFmpeg on PC | Transcribe a video, edit the captions, burn them into the video (styled, Indian-English friendly) or save .srt | both | waiting |
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
| 54 | **Diagram Editor**: flowcharts, org charts, network / UML / BPMN diagrams, floor plans; open and save `.drawio` files, export PNG / SVG (PDF via our MuPDF if the web build's PDF export needs a server) | the real draw.io web app (`jgraph/drawio`), self-hosted — not a clone | JavaScript (mxGraph) — no compiled diagram editor exists (tier 4, record in §3a); runs in an iframe page with its own CSP, driven by draw.io's embed (postMessage) protocol so files stay on the device; cloud integrations and browser storage switched off; the no-external test must see zero outside requests | PC (works on tablets) | waiting |

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

## Notes
- **Cheapest wins:** Image to SVG, Make PDF Searchable, the six "reuse engines" tabs (13–18), Duplicate Photo Finder,
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

## Related
`docs/IDEAS.md` is an earlier, longer research list from 15 Nov 2026, also waiting for the owner. It overlaps with this
one and adds Office → PDF, Redact PDF, AI Magic Eraser, Grammar Check (Harper), Indic Script Converter, Symbolic Math,
Panchang and more.
