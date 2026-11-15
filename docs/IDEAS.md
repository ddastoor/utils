# Candidate new tabs (research, 2026-11-15) — AWAITING OWNER DECISION

Researched on GitHub by a sub-agent (repo stars/licences from the GitHub API on 2026-11-15). None duplicates the
176 current tabs or anything the owner rejected. **Nothing here is accepted yet** — add a tab to the registry only
after the owner picks it (then follow CLAUDE.md §8 and STANDING RULE #1). "Own build" = we compile it to wasm.

## Top picks
| # | Tab | Category | Platform | Engine (licence) | What it does / notes |
|---|---|---|---|---|---|
| 1 | Office → PDF | Documents | both | MuPDF 1.28 — already vendored (AGPL) | DOCX/XLSX/PPTX/ODT/RTF → PDF. Verified: our mupdf opens DOCX. Layout via HTML, not pixel-identical to Office. |
| 2 | Searchable PDF (OCR) | Documents | both | Tesseract — already vendored | Scanned PDF/photos → PDF with a text layer (eng + hin). |
| 3 | Redact PDF (true redaction) | Documents | both | MuPDF `applyRedactions()` — vendored | Boxes or patterns (Aadhaar, PAN, account no.) permanently removed. |
| 4 | Document Converter | Documents | both | Pandoc official wasm (GPL-2.0, Haskell) | DOCX⇄Markdown⇄HTML⇄ODT⇄EPUB⇄LaTeX. ~16 MB compressed; own build impractical (GHC wasm). |
| 5 | Image → SVG | Images | both | visioncortex/vtracer (MIT, Rust) own build; potrace (GPL, C) for B/W | Logos, signatures, scans → SVG. Small. |
| 6 | AI Upscaler | Images | both | Real-ESRGAN `realesr-general-x4v3` (BSD-3) on ONNX Runtime Web (MIT, C++) | 2–4× upscale, tiled. Model ~4.6 MB. |
| 7 | Magic Eraser | Images | both | MI-GAN (MIT) or LaMa (Apache-2.0) on ONNX Runtime Web | Paint over objects to remove them. LaMa int8 ~37 MB. |
| 8 | Grammar & Spell Check | Text | both | Automattic/harper (Apache-2.0, Rust) official wasm | Offline English grammar/spelling/style. API "early access". |
| 9 | Indic Script Converter | Text | both | ambuda-org/vidyut `vidyut-lipi` (MIT, Rust) | Devanagari ⇄ Tamil/Telugu/Kannada/Bengali/Gujarati/Gurmukhi ⇄ IAST/ITRANS. (+ own Krutidev ⇄ Unicode table?) |
| 10 | Symbolic Math (CAS) | Math & Science | both | Giac/Xcas (GPL-3.0, C++) | Integrate, differentiate, simplify, solve. ~12 MB+. |
| 11 | Panchang + Sunrise/Moon | Everyday | both | cosinekitty/astronomy (MIT, C) own build | Sunrise/sunset, moon phase, tithi, nakshatra, yoga, karana, Rahu kaal (Lahiri ayanamsa). |
| 12 | age Encrypt | Security | both | age format (BSD-3); own C on our libsodium | Files compatible with `age`/`rage` CLI (X25519 or passphrase/scrypt). No new dependency. |
| 13 | Vocal Remover / Stem Splitter | Media | PC | sevagh/demucs.cpp (MIT, C++/Eigen) own build | Song → vocals/drums/bass/other. 45–80 MB model, ~4 GB RAM → PC only. |

## Also worth considering
GIF Maker (gifski AGPL Rust / gifsicle GPL C) · Image Compare (odiff/pixelmatch maths in imgproc) · eBook → PDF /
reader (MuPDF: EPUB/MOBI/FB2/CBZ) · Secret Splitter — Shamir (dsprenkels/sss, MIT, C) · Sign & Verify files —
Minisign (ISC, C, on libsodium) · Braille Translator (liblouis LGPL C, Bharati Braille) · Units Calculator (numbat,
Apache/MIT Rust) · Molecule Viewer (RDKit MinimalLib, BSD) · Chess Analyzer (Stockfish GPL, lite single-thread) ·
Sheet Music Viewer (Verovio LGPL C++) · 3D Model Viewer/Converter (assimp BSD + occt-import-js LGPL; new "CAD & 3D"
category) · DWG/DXF Viewer (LibreDWG GPL C) · Typst Editor (Apache Rust; fonts must be vendored) · Regex Generator
(grex Apache Rust, PC) · Python Lint & Format (ruff MIT Rust, PC; or add clang-format/gofmt/ruff to Code Formatter) ·
Parquet / DuckDB SQL (duckdb-wasm MIT, PC; extensions must be self-hosted) · Font Converter & Subsetter (google/woff2
MIT + harfbuzz hb-subset MIT, PC) · Mouse Test (PC), Gamepad Test, Refresh-Rate Test (own code, Device).
Lower: D2 diagrams, audio → MIDI (basic-pitch), loudness meter (libebur128), FIGlet, KeePass viewer.

## Checked and not recommended
LibreOffice/ZetaOffice (huge; threads/COOP-COEP unclear) · PDF → Word (needs a custom MuPDF build) · ShellCheck (no
wasm) · photo colourise / face restore (200 MB+, CodeFormer not OSI) · IOPaint (archived) · PIN-code / IFSC lookup
(large datasets needing regular updates).
