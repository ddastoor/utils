# Potential new tabs — waiting for the owner's go-ahead

Open-source projects suggested on **16 Nov 2026** in answer to the owner's questions "Any other interesting GitHub utility
projects which you can add as utility tabs?" (round 1) and "Any more interesting and useful open source, legal and free
GitHub projects … given all the restraints and conditions I have put?" (round 2).

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
| 21 | **Whiteboard / Sketch Diagrams**: hand-drawn style diagrams, export PNG/SVG, open/save .excalidraw files | Excalidraw (MIT) | JavaScript only — no compiled equivalent (record in §3a); collaboration off | ≈ 2–3 MB | PC | waiting |
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
| U2 | **"Full Python"** option in the planned Python tab | Pyodide (MPL-2.0, official CPython wasm) | numpy / pandas / matplotlib beside the small MicroPython engine; ≈ 10–30 MB, loaded only when chosen | waiting |
| U3 | **Video Stabilizer** | vid.stab (GPL) inside our own FFmpeg build | possible only after the own-FFmpeg build on the §3a audit list | waiting |

## Notes
- **Cheapest wins:** Image to SVG, Make PDF Searchable, the six "reuse engines" tabs (13–18), Duplicate Photo Finder,
  Chart Maker, WireGuard Config.
- **Heavy ones:** Pandoc, Demucs, the upscaler models, LaTeX and Sky Map download only when their tab is used.
- **JavaScript-only (tier 4, reason recorded if accepted):** Excalidraw and CircuitJS1 have no compiled equivalent.
- **Data API:** only #29 contacts another host, and only after the owner approves it (CLAUDE.md §3a "Approved data APIs").

## Removed by the owner (16 Nov 2026) — do not suggest again
- Chess Board + Analysis (Stockfish)
- Python/JS Linter & Formatter (Ruff / Biome)
- Offline Translation (Mozilla Bergamot)

## Related
`docs/IDEAS.md` is an earlier, longer research list from 15 Nov 2026, also waiting for the owner. It overlaps with this
one and adds Office → PDF, Redact PDF, AI Magic Eraser, Grammar Check (Harper), Indic Script Converter, Symbolic Math,
Panchang and more.
