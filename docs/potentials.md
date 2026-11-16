# Potential new tabs — waiting for the owner's go-ahead

These are open-source projects suggested on **16 Nov 2026** in answer to the owner's question "Any other interesting GitHub
utility projects which you can add as utility tabs?".

**Status: none accepted yet. Build nothing from this list until the owner picks.**

**Reminder rule (owner, 16 Nov 2026):** remind the owner about this list and ask whether to build any of it:
- when the current per-tab test work is finished, before starting the Software tabs;
- at the start of any new session that resumes from `docs/RESUME.md`.

When the owner picks a tab:
1. Mark it **accepted** here.
2. Add it to the registry in the best-fitting category (CLAUDE.md §2 "New utilities").
3. Build it by CLAUDE.md §8, WebAssembly first (STANDING RULE #1).
4. Give it its own thorough e2e suite.

Every candidate runs fully on the device. Each either compiles to WebAssembly (C/C++/Rust/Go) or ships an official wasm
build, and is served from this site. None duplicates an existing tab or anything the owner rejected. Heavy engines and
models download only when their tab is used (lazy loading, CLAUDE.md §4).

## Top picks
| # | New tab | Open-source project | Engine | Download | Platform | Status |
|---|---|---|---|---|---|---|
| 1 | **Image to SVG**: trace a logo, signature or scan into vectors | vtracer (Rust, MIT) or potrace (C, GPL) | own wasm build | < 1 MB | PC + mobile | waiting |
| 2 | **Photo Upscaler**: 2× / 4×, sharpen blurry or small photos | Real-ESRGAN / Upscayl models | ONNX Runtime Web (already on the site for TTS) | 17–65 MB model | PC + mobile | waiting |
| 3 | **Make PDF Searchable**: add an OCR text layer to scanned PDFs | the idea behind OCRmyPDF | Tesseract + MuPDF (both already on the site) | nothing new | PC + mobile | waiting |
| 4 | **Document Converter**: DOCX ⇄ Markdown / HTML / EPUB / ODT | Pandoc | official pandoc.wasm | ≈ 50 MB | PC | waiting |
| 5 | **Vocal Remover / Karaoke**: split vocals from music | Demucs (stem separation) | ONNX Runtime Web | 80+ MB model | PC | waiting |

## Also good fits
| # | New tab | Project | Notes | Status |
|---|---|---|---|---|
| 6 | **GIF Maker**: video or photos → high-quality GIF | gifski (Rust) | best-quality GIF encoder | waiting |
| 7 | **AVIF / JPEG XL Converter** | libavif, libjxl (C/C++) | smaller photos than JPEG/WebP | waiting |
| 8 | **age Encrypt**: modern file encryption | age / rage format | files open with the standard `age` tool on any computer; can use our libsodium | waiting |
| 9 | **Shamir Secret Split**: split a password into N parts, any K recover it | ssss-style, in our own C | small; good for family emergency info | waiting |
| 10 | **Spell Checker** (en-US / en-GB / en-IN) | Hunspell (C++) + open dictionaries | ≈ 1–2 MB | waiting |
| 11 | **BPM & Key Detector** for songs | aubio (C) | small | waiting |
| 12 | **Chess Board + Analysis** | Stockfish (official wasm) | ≈ 7 MB | waiting |
| 13 | **CSV/Excel SQL**: query big spreadsheets with SQL | DuckDB-wasm (official) | PC; complements the SQLite tab | waiting |
| 14 | **Python/JS Linter & Formatter** | Ruff, Biome (Rust, official wasm) | PC (Software) | waiting |
| 15 | **Offline Translation** | Mozilla Bergamot (C++ → wasm) | ≈ 20 MB per language pair, fully offline. Translation was left out earlier because it needed the internet; this version does not. | waiting |

## Notes from the suggestion
- **Cheapest wins:** Image to SVG (small own build), Make PDF Searchable (engines already on the site) and Photo
  Upscaler (reuses the ONNX Runtime that Text-to-Speech already loads).
- **Heavy ones:** Pandoc, Demucs and the upscaler models download only when their tab is used.

## Related
`docs/IDEAS.md` is an earlier, longer research list from 15 Nov 2026, also waiting for the owner. It overlaps with this
one and adds Office → PDF, Redact PDF, AI Magic Eraser, Grammar Check (Harper), Indic Script Converter, Symbolic Math,
Panchang and more.
