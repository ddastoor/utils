# SuperTools — project spec & runbook

This file is the **single source of truth** for this repository. It records every requirement the owner
gave, every design decision made on their behalf, and the exact procedures to rebuild, extend, test and
deploy the app. Read it fully before changing anything. Keep it updated in the same commit as any change
that affects it.

> ## ▶ RESUME POINT: `docs/RESUME.md`
> Owner rule: `docs/RESUME.md` is the sync point for when a session stops (usage limit, reset). **Read it right after
> this file and continue from its "Next steps". Update it in every commit that changes status, and push often** —
> the owner may be cut off at any moment and must be able to come back and continue without losing anything.

> ## ⚠️ STANDING RULE #1 — WebAssembly first (owner; permanent; applies to every line of new code)
> The owner has had to repeat this several times. **Check this rule before choosing ANY engine, library or
> algorithm for ANY tool — new or existing — without waiting to be reminded.**
> 1. **First choice, always:** build our own WebAssembly module from the **latest stable upstream open-source
>    source** (C/C++, or Rust/Zig/other compiled code) — the correct, official project source, verified by
>    checksum/signature — or from our own C (`wasm/`). Use it for the algorithms and all heavy loops.
> 2. Only if (1) is genuinely impossible or impractical: the upstream project's **official** wasm build, then a
>    widely used third-party wasm build of the same upstream source.
> 3. Only if no compiled implementation exists or can practically be built: a JavaScript/TypeScript library.
> 4. **Whatever is used is vendored, pinned and served from this site. Never a CDN, never fetched at runtime.**
> 5. Every choice below tier 1 is written down with the reason in §3a — the "why not our own wasm" column.
>    Before adding a dependency, write the tier and the reason in the commit message too.
> 6. TypeScript only builds UI, formats output and does trivial glue (see the compute rule in §7). Pixel loops,
>    parsers, codecs, maths, search, diff, compression, crypto → wasm.
> 7. Existing tier-2/3/4 components are on the audit list in §3a; replace them with our own builds when practical.

---

## 1. What this is

**SuperTools** (owner-chosen name; repo `ddastoor/utils`) — a personal **utilities web app**: one static
single-page app (SPA) hosted on **GitHub Pages**
(`https://ddastoor.github.io/utils/`), used from **desktop browsers** (Chrome on Windows and Linux, X11 or
Wayland) and **mobile browsers** (Android Chrome, iPhone Safari).

### Hard requirements (from the owner — do not violate)
1. **Static and stateless.** No backend, no login, no accounts, no analytics, no cookies, no service worker,
   **no PWA / offline install**. Nothing is saved between visits **except the owner-requested Favorites list**
   (tool ids in `localStorage` key `supertools.favorites.v1`, `src/favorites.ts`; never leaves the browser).
2. **No online *code* dependencies (owner clarification).** Every library, script, WebAssembly module, ML model,
   font and icon is embedded in / served from this site — WebAssembly first, else a locally hosted open-source JS
   library. Never a CDN or remote script. **Fetching *data* from a public online API is allowed** (e.g. network
   time, daylight-saving info, exchange rates) when a tool needs live information. Enforcement: CSP keeps
   `script-src`/`style-src`/`font-src`/`worker-src` to `'self'`; `connect-src` = `'self'` + an explicit allowlist of
   approved data-API hosts (listed in `index.html` and §3a "Approved data APIs"); the YouTube Clip tool may embed
   `youtube-nocookie.com` (`frame-src`). `tests/e2e/no-external.e2e.mjs` fails on any code from another host and on
   any request to a non-allowlisted host.
3. **User files never leave the device.** All processing happens in the browser.
4. **Each utility is its own tab.** Tools are **PC + mobile** unless the owner explicitly said PC only.
   PC-only tools are hidden on mobile.
5. **Responsive UI** that works on phone and desktop.
6. **Implementation preference order — see STANDING RULE #1 at the top (WebAssembly first, always):**
   1. Our own WebAssembly modules compiled from the latest proper open-source **C/C++** (or other compiled)
      source (own code, or the upstream library's source).
   2. Otherwise a widely used, safe, OSI-licensed library, vendored (copied into the build) and pinned.
   Personal use only, so copyleft (GPL/LGPL/AGPL) is acceptable.
7. Use the **most standard / modern / hardened** approach for each tool.
8. **Every tool works on Windows and Linux** (Chrome; X11 and Wayland) and every non-PC-only tool also
   works on the owner's **mobile browser** (Android Chrome and iPhone Safari). Do not rely on a
   Chrome-only API in a mobile tool without a Safari fallback.
9. **The mobile UI must look good**, not just work: mobile-first layouts, ≥44 px touch targets, single
   column, sticky bottom action bar for the main action, no horizontal scroll, safe-area insets.
   Check every mobile tool at 390×844 with a screenshot before calling it done.
10. **Search**: every tab has relevant keywords (`keywords` in the registry). A search box (home screen +
    sidebar; `/` or Ctrl+K focuses it on PC) ranks tabs by title and keywords; pressing **Enter opens the
    top match immediately**.

### Owner's answers to open questions
- App name: **SuperTools** (title, header brand, `document.title` suffix).
- Commit and push **each tool as soon as it works** — never batch many finished tools into one push.
- Passport photo: owner lives in **India** → Indian presets first.
- No offline/installable app — **all online** (plain website).
- OpenPGP: **GnuPG-compatible** (v4 Curve25519 keys). Decryption accepts both v4 and RFC 9580 v6 input,
  so a future GnuPG that adopts RFC 9580 keeps working with this tool.
- "Use your best discretion" for everything else; "leave out the things you suggested leaving out".

---

## 2. Tool list

**Rules from the owner:**
- **Two levels of tabs.** Level 1 = **category tabs** (Images, Documents, Security, Media, Calculators,
  Math & Science, Text, Software, Codes & Files, Everyday, Device). Level 2 = inside the selected category, **one tab per
  utility**. Never merge two utilities into one utility tab (no sub-tabs inside a utility).
- PC: two horizontal tab bars above the content (utility bar wraps). Mobile: two sticky, horizontally
  swipeable tab rows at the top (active tab scrolled into view). PC-only utilities are hidden on mobile.
- Clicking a category shows that category's tool cards; its utility tabs fill the second row.
- A search box in the header jumps straight to any utility (Enter = top match).
- **Browse + favorites (owner request):** the category row starts with **All** (`#/`, home: favorites + every
  category with tool cards) and **★ Favorites** (`#/c/fav`), then one tab per category (`#/c/<cat>` = card grid of
  that category). Every tool page and card has a ☆ star toggle; starred tools appear in Favorites (count badge on
  the tab). Tool URLs: `#/<toolId>` (`?from=fav` keeps the Favorites row active).
- **New utilities:** whenever the owner accepts a new utility, place it in the most fitting existing category,
  or create a new, well-named category for it (update `CATEGORIES` in `src/registry.ts` and this file).
  Give it rich search keywords (synonyms, everyday phrasing, file extensions, common misspellings) and add
  queries for it to `tests/search.test.mjs`.
Platform is PC + mobile unless marked **PC**. Tab ids are the URL hash (`#/<id>`).

**The authoritative, always-current list is `docs/TOOLS.md`, generated from `src/registry.ts` (`npm run docs`).**
Current total: **176 tabs in 11 categories — 108 PC + mobile, 64 PC only, 4 Mobile only** (regenerate with
`npm run docs` after every registry change; the owner asked for the registry to always be noted).
The per-category notes below record decisions; when they disagree with the registry, the registry wins.

**Platform model (owner rule):** every tool is exactly one of **PC + mobile** (`'both'`), **PC only** (`'pc'`,
hidden on phones) or **Mobile only** (`'mobile'`, hidden on desktops) — the `platform` field in
`src/registry.ts`. Mobile only = needs phone hardware: `level` Bubble Level, `compass` Compass, `touch` Touch
Test, plus `photodict` Photo Dictionary (owner said mobile only — phone camera). `keyboard` Keyboard Test is PC only (physical keyboard). Opening a hidden tool by URL shows an explanation.

**Images**
| id | Tab | Platform | Engine |
|---|---|---|---|
| `image` | Image Editor | both | own C wasm `imgproc` + MozJPEG/WebP/OxiPNG (jSquash) |
| `batch` | Batch Images | **PC** | `imgproc` resize + jSquash + zip.js |
| `heic` | HEIC → JPG | both | libheif (C++ → wasm, libheif-js) + jSquash |
| `passport` | Passport Photo | both | MediaPipe face landmarks + selfie multiclass segmentation + `imgproc` guided filter |
| `formphoto` | Photo & Signature Resizer | both | presets for Indian exam/job portals (px + KB limits), `imgproc` + MozJPEG |
| `bgremove` | Background Remover | both | MediaPipe segmentation + guided filter → transparent PNG / colour / blur |
| `cartoon` | Cartoonizer | both | `imgproc` classic filters + Magenta arbitrary style transfer (TF.js) |
| `redact` | Blur & Redact | both | MediaPipe face detector + manual boxes |
| `watermark` | Watermark | both | canvas text/logo watermark |
| `caption` | Text on Image | both | canvas captions / meme text |
| `collage` | Collage Maker | both | canvas photo grid |
| `exif` | EXIF / Photo Info | both | own EXIF parser; strip metadata |
| `scanner` | Doc Scanner | both | `imgproc` page detection, warp, enhance + pdf-lib |
| `ocr` | OCR | both | Tesseract (C++ → wasm), English + Hindi |

**Documents** (engines: pdf-lib + PDF.js; QPDF 12 wasm for unlock/protect)
| id | Tab | Platform |
|---|---|---|
| `pdf-merge` | Merge PDF | both |
| `pdf-split` | Split PDF | both |
| `pdf-organize` | Organize PDF (reorder/rotate/delete) | both |
| `img2pdf` | Images → PDF | both |
| `pdf2img` | PDF → Images | both |
| `pdf-compress` | Compress PDF | both |
| `pdf-sign` | Sign PDF | both |
| `pdf-fill` | Fill PDF Form | both |
| `pdf-unlock` | Unlock PDF (known password) | both |
| `pdf-protect` | Protect PDF (AES-256) | both |
| `pdf2text` | PDF → Text | both |
| `pdf-pagenum` | PDF Page Numbers | both |
| `pdf-watermark` | PDF Watermark | both |
| `epub` | PDF → EPUB (Kindle) | **PC** |
| `sheet` | CSV / Excel Viewer & Converter | **PC** |
| `markdown` | Markdown Editor | both |

**Security**: `pgp` OpenPGP · `sodium` Sodium Encrypt · `sharelink` Encrypted Share Link (ciphertext in the
URL `#fragment`, never sent to a server) · `hash` Hash / Checksum · `password` Password Generator ·
`passphrase` Passphrase Generator — all both.

**Media**: `video` Video Compressor (both) · `audio` Audio Recorder (both) · `tts` Text-to-Speech (both) ·
`ffmpeg` FFmpeg (**PC**) · `screencast` Screencast (**PC**) · `screenshot` Screenshot (**PC**) ·
`youtube` YouTube Clip (**PC**)

**Calculators** (all both): `calc` Scientific · `units` Unit Converter · `dates` Date Calculator ·
`emi` EMI · `gst` GST · `sip` SIP · `fd` FD / RD · `percent` Percentage · `words` Number to Words ·
`timezone` Time Zone Converter · `bmi` BMI · `calories` Calorie (BMR/TDEE) · `duedate` Pregnancy Due Date ·
`tip` Tip & Bill Splitter · `fuel` Fuel Cost · `gpa` GPA · `base` Number Base Converter · `roman` Roman Numerals

**Text** (all both except `photodict`): `wordcount` Word Counter · `case` Case Converter · `lines` Line Tools · `replace` Find &
Replace · `diff` Text Diff · `fancy` Fancy Text · `emoji` Emoji & Symbols · `morse` Morse Code · `lorem` Lorem Ipsum ·
`photodict` **Photo Dictionary (Mobile only, owner request — see §3)**

**Software** — owner rule: **every Software tool is PC only.** Moved here from the old "Text & Dev": `json` JSON
Formatter · `regex` Regex Tester · `base64` Base64 · `urlenc` URL Encoder · `epoch` Epoch Converter · `uuid` UUID
Generator · `color` Color Converter · `jwt` JWT Decoder. New: `sqlite` SQLite Playground (official SQLite wasm) ·
`jq` jq Playground (jq C source → wasm) · `yaml` YAML ⇄ JSON ⇄ TOML (js-yaml, smol-toml) · `xml` XML Formatter /
XPath · `json2types` JSON → Types (TS/Go/Rust/Java/Python) · `jsondiff` JSON Diff · `sqlfmt` SQL Formatter
(sql-formatter) · `prettier` Code Formatter (Prettier standalone) · `mockdata` Mock Data Generator · `mdtable`
Markdown Table · `cidr` Subnet / CIDR (IPv4+IPv6) · `chmod` chmod Calculator · `x509` Certificate Decoder (own
DER parser) · `sshkey` SSH Key Generator (Ed25519, OpenSSH format, libsodium) · `hmac` HMAC Generator · `pwhash`
Password Hash Tool (Argon2id/bcrypt/PBKDF2) · `apikey` API Key Generator · `curl` cURL Converter · `cron` Cron
Explainer · `escape` String Escape · `unicode` Unicode Inspector · `hexview` Hex Viewer · `logview` Log Viewer ·
`mermaid` Mermaid Diagrams · `sla` SLA / Uptime · `transfer` Data Transfer · `semver` Semver Checker · `glob`
Glob Tester. Left out: API client (CORS/CSP), DNS/WHOIS/ping/port scan (need network), cloud cost calculators.

**Codes & Files** (all both): `qr` QR Generator · `barcode` Barcode Generator · `scan` QR & Barcode Scanner ·
`zip` Create Zip · `unzip` Extract Archive

**Everyday** (all both): `stopwatch` · `countdown` · `pomodoro` · `interval` · `dice` · `coin` · `rng` ·
`picker` · `teams`

**Device** (all both): `webcam` · `mic` · `speaker` · `keyboard` · `pixels` · `touch` · `screen` · `level` ·
`compass` · `soundmeter` · `ruler` — `keyboard` is **PC only**; `level`, `compass`, `touch` are **Mobile only**.

Batch 3 (accepted): **Math & Science** category (new): `graph` Graphing Calculator · `equation` Equation
Solver · `stats` Statistics · `matrix` Matrix · `fraction` Fraction · `primes` Prime/LCM/GCD · `periodic` Periodic
Table. Calculators: `prepay` Loan Prepayment · `ppf` · `epf` · `nps` · `inflation` · `sleep` Sleep Cycle · `bodyfat` ·
`idealweight` · `coords` Coordinates. Media: `noise` Noise Remover (RNNoise) · `pitch` Pitch & Speed (own C WSOLA)
· `slideshow` Slideshow Maker (WebCodecs). Documents: `invoice` GST Invoice · `rent` Rent Receipt · `resume` Resume
Builder (HTML → browser "Save as PDF"). Images: `signature` Signature Maker. Software (PC): `graphviz` (Graphviz C →
wasm) · `python` (MicroPython C → wasm) · `totp` · `pwstrength` (zxcvbn) · `jsonschema` · `bitwise` · `ieee754` ·
`contrast` · `baseenc` · `bindecode` · `httpstatus` · `mime` · `ports` · `ascii` · `keycode` · `gradient` · `shadow` ·
`svgo` · `patch`.
**Speech to Text** (`stt`, Media, both): whisper.cpp (C/C++, MIT) built by us to wasm + Whisper English
models (MIT): `ggml-base.en-q5_1` (60 MB, default on phones) and `ggml-small.en-q5_1` (190 MB, default on PC),
from huggingface.co/ggerganov/whisper.cpp, SHA-256 pinned in `scripts/assets.json`. Record or upload → transcript
+ .srt/.vtt. Not live dictation (no threads on GitHub Pages).

**Text-to-Speech** (`tts`) — owner asked for the best-quality option; decision: **Kokoro-82M** (Apache-2.0,
`onnx-community/Kokoro-82M-v1.0-ONNX`, q8 model ≈ 90 MB, SHA-256 pinned) on ONNX Runtime Web (C++ → wasm, WebGPU when
available) via kokoro-js / transformers.js (Apache-2.0) with espeak-ng phonemizer (C → wasm, GPL-3.0) — default
"Natural voice", ~20 US/UK voices, speed control, WAV download. Second engine "System voice": Web Speech API limited
to `localService` voices (includes Indian English voices on Windows/Android/iOS). Claude's own app voice was
considered and rejected: proprietary cloud service (online, needs an account) — violates the hard requirements.
Owner-confirmed TTS requirements: input = text area **or** uploaded .txt/.md; output = play + **MP3 download**
(LAME, C → wasm, built by us); **voices: US female/male, UK female/male, Indian English female/male**; **speed
slider 0.5×–2×** (model-side speed, natural pitch). Voices: US/UK = Kokoro (`af_*`, `am_*`, `bf_*`, `bm_*`);
Indian English = Piper `en_US-l2arctic-medium` (VITS ONNX, 77 MB, CC BY-NC 4.0 — personal use OK) speakers from
native Hindi speakers: female `SVBI` (id 2), `TNI` (id 9); male `ASI` (id 10), `RRBI` (id 19). System voices remain a
play-only extra (browsers can't capture speechSynthesis audio for MP3).
Speech to Text accent requirement: very good on US, UK and **especially Indian English** → Whisper small.en default
plus a "names & terms" hint box fed to Whisper's initial prompt.

**Batch 4 (owner-requested):**
- **`bc` console** — PC only, shown **inside the Scientific Calculator tab** next to the keypad calculator (owner's
  explicit request; phones show only the keypad). Engine: BusyBox's `bc` (Gavin Howard's bc, arbitrary precision,
  `-l` maths library) from our BusyBox wasm build.
- **Linux Terminal** (`terminal`, Software, **PC only — owner confirmed explicitly**): BusyBox (C, GPL-2.0) compiled by us to wasm32-wasi; an
  in-memory WASI filesystem shared by every command; our own shell layer (pipes via buffers, `> >> <`, `&& || ;`,
  variables, `cd pwd export history`, globbing) runs one applet per WASI instance (wasm cannot fork, so BusyBox
  `ash` itself is not used). Upload button → files into the FS; file browser with download. Applets limited to
  those that need only filesystem/stdio (plus shimmed clock/random); no process, network, mount, tty/full-screen
  apps.

Removed by the owner from batch 3: Spin the Wheel, Tambola/Housie, Secret Santa, Scoreboard.

Rejected by the owner: Typing Speed Test, Tuner, Metronome, Discount Calculator, Unit Price Compare, News Shorts
(hourly AI news summaries — considered via GitHub Actions + llama.cpp; owner declined), Local AI / LLM tab and
Key-Sentence Summariser (in-browser llama.cpp/WebLLM with ~1.7B model — owner declined), Wallpapers (photo
wallpapers via Wikimedia Commons/NASA, or a procedural generator — owner declined).
Not added because a PC-only tool already covers them: Video Trimmer, Video → MP3, Audio Cutter (FFmpeg),
Image Converter (Batch Images). Optional "nice to have" ideas not requested: GIF maker, screenshot
beautifier, palette extractor, image compare, tone generator, white noise, pace calculator, recipe scaler,
breathing guide, ICS creator, TOTP, subnet/chmod calculators, YAML↔JSON, cron explainer, SVG optimiser,
favicon generator.

The owner's original items b) "YouTube clip creator" and h) "YouTube downloader" are merged into
**YouTube Clip** (agreed — they are the same job).

### Deliberately left out (owner agreed)
Currency converter/live rates, cloud speech-to-text, notes/to-do (needs state), income-tax calculator
(rules change yearly), speed test, IP lookup, weather, translation, maps, URL shortener.

---

## 3. Per-tool requirements and design

### Image Editor
Upload → edit → **Save** downloads the file. Crop (free + aspect presets), rotate 90°, flip, straighten,
resize, brightness, contrast, exposure, saturation, vibrance, hue, temperature, tint, sharpen.
**Reduce file size**: MozJPEG / WebP / PNG (OxiPNG) with quality slider, live output size, and a
**target size** mode (binary search on quality, e.g. "under 200 KB"). Strip EXIF/GPS. Share button on
mobile (Web Share) so iPhone users can save to Photos. Large photos (>16 MP) are processed in wasm
memory, not canvas (iOS canvas limit).

### Passport Photo (India first)
Camera (webcam / phone front or back camera, self-timer, face guide overlay) or upload. Background → pure
white via MediaPipe `selfie_multiclass_256x256` mask refined by `imgproc` guided filter at full
resolution. Auto-framing from MediaPipe face landmarks (chin, eyes, crown estimate). Output JPEG at
300 dpi with DPI metadata, optional max-KB target, and a 4×6 in / A4 print sheet with copies.
Presets — **owner request: as many countries as possible, with background-colour rules, not just sizes.**
Data lives in `src/lib/passport-specs.ts` (36 presets: India ×4 first, then Americas, Europe, Asia-Pacific,
Middle East & Africa). Each preset records print size (mm), head height (chin-to-crown, mm) where published,
**required background colour** (+ accepted alternatives; the tool fills exactly that colour — e.g. UK = cream or
light grey, France = light blue/grey and *white is forbidden*, most others white), digital upload limits (px, KB)
where published, and notes. Custom size + background picker (white, off-white, light grey, cream, light blue, blue,
red). Only rules known with confidence are included; the UI tells users to confirm with the official site.
Unit test checks every preset is well-formed.
Note shown to user: some agencies reject digitally altered photos; lighting on the face matters.
Wayland/X11 is irrelevant for cameras.

### Cartoonizer ("Prisma-like")
Two engines:
- **Classic** (own C, instant): Cartoon (edge-preserving smoothing + XDoG ink lines + k-means colour
  quantisation), Oil paint (Kuwahara), Watercolour, Pencil sketch (B/W + colour), Comic/halftone.
- **Neural style transfer**: Magenta *arbitrary image stylization* (Apache-2.0) via TF.js (WebGL
  backend, CPU fallback). Built-in styles are **procedurally generated** artwork textures created at
  runtime (no copyrighted art shipped); the user can also upload any painting as the style. Strength
  slider blends with the original.

### OpenPGP
Generate key pair (name, email, passphrase) → download armored public/private keys. Encrypt file
(to one or more public keys, optional signing), decrypt (+ verify), detached sign, verify, clearsign
text, symmetric (passphrase) encrypt/decrypt. Binary or ASCII-armored output.
**Profile: GnuPG-compatible** — v4 keys, Ed25519 (sign) + Curve25519 (encrypt), AES-256, SHA-512,
SEIPDv1 with MDC, iterated+salted S2K for passphrases (GnuPG cannot read Argon2 S2K yet).
Decryption accepts v4 and v6 (RFC 9580, AEAD/OCB, Argon2) input.

### Sodium Encrypt (libsodium, symmetric only)
Files **and** typed text. Argon2id (`crypto_pwhash`) derives a key; data encrypted with
`crypto_secretstream_xchacha20poly1305` in 64 KiB chunks (authenticated, detects truncation/reordering,
constant memory). Strength presets: Interactive (ops 2, 64 MiB), Moderate (ops 3, 256 MiB, default on
PC), Sensitive (ops 4, 1 GiB, PC only). Parameters stored in the header. Text output is Base64.
**File format** (all integers little-endian) — see `docs/sodium-format.md` and the reference decryptor
`tools/sodium_decrypt.py` (PyNaCl), so files are never locked to this app:
```
magic   8 bytes  "USODIUM1"
alg     1 byte   2 = Argon2id13
ops     4 bytes  opslimit
mem     4 bytes  memlimit in KiB
chunk   4 bytes  plaintext chunk size (65536)
salt   16 bytes
header 24 bytes  secretstream header
then ciphertext chunks: each = chunk plaintext + 17 bytes; last chunk carries TAG_FINAL
```
The 41..61-byte header (everything before the first chunk) is also used as additional data? — No: AD is
empty; integrity of parameters is implicit because wrong parameters derive a wrong key and the first
chunk fails to authenticate.

### Hash / Checksum
Algorithms: MD5, SHA-1 (legacy, labelled), SHA-256, SHA-512, SHA3-256, SHA3-512, BLAKE2b-256,
BLAKE2b-512, CRC-32. Streaming (large files), progress, paste an expected checksum to verify, compare
two files, hash typed text.

### Passwords
Random passwords (length, sets, exclude look-alikes, require each set) and diceware passphrases
(EFF large wordlist, 7776 words, CC-BY 3.0, `public/data/eff_large_wordlist.txt`). Shows entropy bits.
Randomness from libsodium `randombytes_uniform` (→ `crypto.getRandomValues`).

### Zip
Create zip (optional AES-256 password, WinZip AE-2 format) from multiple files; extract zip (incl.
AES/ZipCrypto passwords) and 7z/rar/tar/gz/bz2/xz via libarchive. Download single entries or all.

### QR Codes
Generate: text, URL, Wi-Fi (WPA/WEP/none), UPI payment link (`upi://pay?pa=…&pn=…&am=…`), email, phone,
SMS, contact card. Error-correction level, size, colours, PNG/SVG download. Scan: camera (back camera
on phones) or image upload.

### Calculator
Sub-tabs: **Scientific** (own parser: + − × ÷ ^ √ ∛ ! nPr nCr %, sin/cos/tan + inverses + hyperbolic,
ln, log10, log2, exp, abs, π, e, DEG/RAD, ANS, memory M+/M−/MR/MC, keyboard input, history for the
session), **Units** (length, mass, temperature, area, volume, speed, data, time, pressure, energy,
cooking), **Dates** (difference, add/subtract, age, weekday), **Finance – India** (EMI + amortisation,
GST add/remove at 5/12/18/28%, SIP, FD/RD compound, percentage, number to words in lakh/crore and
international), **Time zones** (convert a time between zones via `Intl`).

### Text & Dev
Word/char/line/reading-time counts; case conversion (UPPER, lower, Title, Sentence, camel, snake, kebab);
sort/dedupe/trim/reverse lines; find & replace (regex); diff two texts (Myers line + word diff);
JSON format/minify/validate with error position; Base64, URL, HTML-entity, hex encode/decode;
Unix epoch ↔ date; UUID v4/v7; colour converter (HEX/RGB/HSL/OKLCH) with picker; JWT decode (no verify).

### Audio Recorder
Record mic (MediaRecorder), live level meter + waveform, play back, trim start/end on the waveform,
download as original (WebM/Opus or M4A) or WAV.

### PDF Toolkit
Merge, split (ranges / every page), reorder (drag thumbnails), rotate, delete pages, images → PDF
(page size A4/Letter/fit, margins), PDF → images (PNG/JPEG at chosen DPI), **compress** (recompress
embedded images with MozJPEG at a chosen max resolution/quality; "rasterise" mode for scans; "target
size" mode tries levels until the file is under the limit).

### Doc Scanner
Camera or upload; automatic page detection (own C: Otsu + largest component + corners) with draggable
corners; perspective correction; enhance modes (Colour clean, Grey, B/W adaptive threshold); multi-page
→ PDF (A4/Letter/fit) or JPEGs.

### OCR
Tesseract LSTM, languages English and Hindi (bundled `.traineddata.gz`). Image upload, camera, or paste
from clipboard; optional pre-clean (doc enhance). Copy text / download `.txt`.

### Photo Dictionary (`photodict`, Text, **Mobile only** — owner request, owner chose the name)
Owner's words: photograph text (Kindle screen, newspaper, book) with the phone camera → OCR it → sort the words by
how common they are in English, **rarest (hardest) first**, leaving out common words ("and", "the", …) → show at most
**20 words**, each with its **dictionary meaning underneath in a nice, readable font**.
- Input: back camera (`capture="environment"`; live viewfinder via getUserMedia with a "Snap" button) or a photo from
  the gallery; Kindle/phone-screen photos get a pre-clean (moiré/glare: `imgproc` doc enhance, grey mode).
- OCR: the existing Tesseract English engine (same vendored files as the OCR tool).
- Word ranking (compute in own C, `textcore` wasm): tokenise, fold case, strip possessives/hyphen breaks, lemmatise
  ("running" → run, "geese" → goose: rule-based + exception lists), drop stop words, numbers, single letters and
  OCR junk (not in the dictionary), drop the most common words (Zipf frequency ≥ ~4.5) → sort by general-English
  frequency ascending (wordfreq Zipf scores), tie-break by count in the photo → top 20. Capitalised words that are
  only names (not in the dictionary) are skipped.
- Dictionary: the owner asked for "the most comprehensive open-source American Oxford English dictionary". **The
  Oxford dictionaries (OED, Oxford American, Lexico) are proprietary — not open source — so they cannot be bundled.**
  Decision: **English Wiktionary** (machine-readable extraction from kaikki.org / wiktextract; CC-BY-SA 4.0 + GFDL)
  — the largest open English dictionary, with US spellings, parts of speech, IPA pronunciation, usage labels and
  examples — trimmed to English entries; fallback **Open English WordNet** (CC-BY 4.0) for any word Wiktionary
  lacks. Data is sharded by word prefix and served from this site; the phone fetches only the shards it needs.
  Prepared at build time by a script with SHA-256-pinned sources (never fetched from another host at runtime).
  Attribution shown in the tool.
- **Online fallback (owner request):** a word **not found in the bundled dictionary** is looked up online — only
  then, and only that single word (the photo and the rest of the text never leave the phone). Providers in order:
  Wikimedia's Wiktionary REST definition endpoint, then the Free Dictionary API (see §3a "Approved data APIs").
  Rules: lookups run in parallel with a ~5 s timeout each, at most ~25 per photo, results cached in memory for the
  session only; definitions arrive as HTML snippets and are rendered as **plain text** (parsed with DOMParser,
  `textContent` only — never `innerHTML`). A word found online is marked "from Wiktionary online" on its card. If
  neither the local dictionary nor the APIs know the word (OCR misread, a name), it is dropped from the top 20 and
  the next-rarest word takes its place; such words are listed in a collapsed "Not found" line so nothing is hidden.
  Offline / API down → a short note, local results still shown. A setting "Look up missing words online" (on by
  default) lets the owner turn it off.
- Frequency list: **wordfreq** English data (CC-BY-SA 4.0), shipped as a compact table. Words absent from it count
  as rarest, so they are the candidates that trigger online lookups.
- Output: cards "word · part of speech · pronunciation", 1–3 senses each with an example, serif reading font; tap a
  word to see all senses; tap a word in the recognised text to look it up; copy/share the list.
- Tests: e2e with a real photographed page fixture (known rare words expected in the top 20, "the"/"and" absent);
  unit tests for tokenising, lemmatising and ranking.

### FFmpeg (PC)
ffmpeg.wasm single-threaded core (GitHub Pages cannot send COOP/COEP headers, and the owner refused a
service worker). Presets: convert video/audio formats, extract audio (copy or re-encode), remove audio,
trim (stream copy or precise), compress (CRF / target size), resize, fps, rotate/flip, crop, video → GIF,
merge audio+video, normalise loudness, speed, extract frames, **audio → MP4** (audio-only M4A, still image,
or animated waveform), plus a raw-arguments box. Limits: ~2 GB files; re-encoding is ~10–20× slower than
native.

### PDF → EPUB (PC)
Kindle Paperwhite now, Scribe later. Requirements: preserve **page breaks**; detect **columns** in technical
PDFs, split them vertically, extract text and figures per column in reading order, and label sections
**"Page N · Column K"**. Pipeline per page: PDF.js text items (positions, font size) → render page →
mask text → connected "ink" regions = figures (raster + vector diagrams, tables) cropped as images →
recursive XY-cut on whitespace for columns (handles full-width title/abstract above two columns) →
paragraphs (line spacing), de-hyphenation, heading detection by font size, header/footer/page-number
removal (repeated across pages) → one XHTML file per PDF page. Fallbacks: garbled text (bad ToUnicode)
or math-heavy column → that column as image; scanned page → page image. Modes: Reflow (default) and
Column images. EPUB 3 + NCX (EPUB 2 fallback), validated with epubcheck in development, compatible with
Send-to-Kindle. Image width presets: Paperwhite 1236 px / Scribe 1860 px; greyscale option.

### Screencast (PC)
Chrome on Windows/Linux. Modes: whole screen / window / tab via Chrome's picker; **rectangle**: pick a
screen, then drag a rectangle on the live preview (a web page cannot draw on the desktop), frames are
cropped in real time. Audio: tab audio; Windows system audio when sharing the entire screen; on Linux pick
the "Monitor of …" PipeWire/PulseAudio input; optional mic mix. Start/Pause/Stop, timer, MP4 output
(H.264/AAC via MediaRecorder; WebM fallback), long recordings stream to disk via File System Access.

### Screenshot (PC)
Modes: full screen, window, tab, region. Flow: choose mode → Chrome picker (own tab excluded) → choose
delay → **Arm** → a tiny always-on-top countdown window (Document Picture-in-Picture) appears → owner
minimises the browser (Win+↓ / Super+H) → capture after the delay or via "Snap now" (PiP hides itself
first) → preview, crop, save PNG/JPEG. The share stays alive for repeated shots.
A web page **cannot** silently screenshot, minimise the browser, or detect the active window.

### YouTube Clip (PC)
Inputs: two "Copy video URL at current time" links (start/end) **or** one URL + start + end.
1. **Record in browser**: embeds `youtube-nocookie.com` player (postMessage API, no YouTube script in our
   page), the user shares *this tab* once; Region Capture (`CropTarget`) crops to the player; the player
   seeks to start, plays, and recording stops at end → MP4. Real-time; ads may appear; some videos block
   embedding.
2. **yt-dlp command**: exact `yt-dlp --download-sections "*START-END" -f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]"
   --merge-output-format mp4 URL` with copy button (original quality; needs yt-dlp + ffmpeg locally;
   works in Termux on Android).
Direct download from a static page is impossible (CORS + YouTube stream protection).
**Owner-approved (explicitly):** this is the ONLY tool allowed an online dependency, and only to YouTube's embedded
player (`frame-src https://www.youtube-nocookie.com`; `connect-src` stays `'self'`, so our scripts never contact
YouTube). The player is driven via postMessage (no YouTube script in our page). Both methods ship.

### Linux X11 vs Wayland (owner requirement: auto-detect)
No web API reports the display server and Chrome's UA says `X11; Linux` on both, so `src/linux.ts` detects it:
1. **Passive** (instant): Wayland never tells clients their global window position, so Chrome reports
   `screenX == screenY == 0` there. Non-zero position ⇒ **X11** (or Chrome under XWayland, which behaves as X11).
   Zero ⇒ **Wayland (likely)** — a maximised X11 window at the top-left corner can also be 0,0.
2. **Active** (one click, "Confirm"): open a tiny popup, `moveTo(120, 120)`, read its `screenX`. X11 honours
   the move; Wayland ignores it. Result is kept in memory for the session only.
Used by Screencast, Screenshot and YouTube Clip: they show "Detected: X11 / Wayland", and on Wayland explain that
the desktop portal (GNOME/KDE) shows its own picker after Chrome's, keep the capture alive for repeated shots
(avoids repeated portal prompts), and show the right minimise shortcut. If capture fails on Wayland they point
to `chrome://flags/#enable-webrtc-pipewire-capturer` and the `xdg-desktop-portal` packages.

---

## 3a. Engine policy (owner rule) and engine inventory

**Rule:** for every utility, prefer a WebAssembly engine compiled from open-source **C/C++** (or another
compiled language) over a JavaScript library. Order of preference:
1. Our own wasm build from the upstream C/C++ source (source verified by checksum/signature).
2. The upstream project's **official** wasm build (e.g. SQLite's, Artifex's MuPDF).
3. A widely used wasm build by a third party.
4. A JavaScript library — **only when no C/C++/compiled implementation exists** for that job. Record why.
Simple UI logic (calculators, timers, text tools) is plain TypeScript. Everything is vendored and served
from this site — **nothing is loaded from the internet at runtime**. Never violate a licence: record every
third-party component and its licence in §6. Because of AGPL (MuPDF) and GPL (FFmpeg) the repository must
stay **public** (the source of the deployed site is then available to every user, satisfying both).

| Engine | Language → wasm | Built by | Used by |
|---|---|---|---|
| libsodium 1.0.20 + own MD5/SHA-1/SHA-3/CRC-32 + OpenBSD bcrypt | C | **us** (`wasm/crypto`) | sodium, sharelink, hash, passwords, sshkey, hmac, pwhash, apikey, random tools |
| imgproc (adjustments, resize, filters, matting, warp, doc enhance) | C (own code) | **us** (`wasm/imgproc`) | image tools, scanner, passport, cartoon |
| jq 1.8.2 (+ oniguruma) | C | **us** (`wasm/jq`) | jq |
| cmark-gfm (GitHub Flavored Markdown) | C | **us** (`wasm/markdown`) | markdown |
| libyaml 0.2.5 + toml++ 3 | C / C++ | **us** (`wasm/formats`) | yaml |
| MuPDF 1.28 | C | Artifex (official `mupdf` npm) | all PDF tools, PDF → EPUB |
| SQLite 3.54 | C | SQLite project (official `@sqlite.org/sqlite-wasm`) | sqlite |
| FFmpeg | C | ffmpeg.wasm project | ffmpeg |
| MozJPEG, libwebp, OxiPNG | C / Rust | jSquash (Squoosh codecs) | image encoders |
| libheif + libde265 | C++ | libheif-js | heic |
| Tesseract 5 | C++ | tesseract.js-core | ocr |
| zxing-cpp | C++ | zxing-wasm | qr, barcode, scan |
| libarchive | C | libarchive.js | unzip |
| MediaPipe Tasks (TFLite) | C++ | Google (official) | passport, bgremove, redact |
| Browser-native C++ (WebCodecs, WebCrypto, Web Speech, MediaRecorder) | — | the browser | video, tts, screencast, pbkdf2 |

JavaScript-only components (no C/C++ equivalent exists for the job):
| Library | Why JS | Used by |
|---|---|---|
| OpenPGP.js 6 (LGPL-3.0) | the audited browser OpenPGP implementation; C alternatives (GnuPG, RNP+Botan) are not built or audited for wasm | pgp |
| Mermaid (MIT) | Mermaid exists only as JavaScript | mermaid |
| Prettier standalone (MIT) | no compiled formatter covers JS/TS/CSS/HTML/YAML/Markdown/GraphQL together | prettier |
| sql-formatter (MIT) | no C/C++ SQL pretty-printer library | sqlfmt |
| TensorFlow.js (Apache-2.0) | runs the Magenta style-transfer graph on the GPU via WebGL | cartoon (neural) |
| zip.js (BSD-3) | AES-256 zip *creation*; libarchive's wasm build has no crypto | zip |
| mediabunny (MPL-2.0) | MP4 muxing around the browser's hardware WebCodecs encoders | video |
| semver (ISC) | tiny logic library | semver |

**Audit list (STANDING RULE #1, item 7)** — components not yet on tier 1 and what replaces them. Work through it
whenever a tool that uses one is touched; move rows to the engine table above when done.
| Component (current tier) | Replace with (own wasm build from upstream source) | Status |
|---|---|---|
| jSquash MozJPEG / libwebp / OxiPNG (3) | own builds of mozjpeg (C), libwebp (C), oxipng (Rust → wasm32) | planned |
| libheif-js (3) | own build of libheif + libde265 (C++) | planned |
| tesseract.js-core (3) | own build of Tesseract 5 + Leptonica (C/C++) | planned |
| zxing-wasm (3) | own build of zxing-cpp (C++) | planned |
| libarchive.js (3) | own build of libarchive (C) | planned |
| ffmpeg.wasm core (3) | own build of FFmpeg (C) — large; keep until the rest are done | later |
| zip.js (4) | own C: deflate (zlib/miniz) + WinZip AES (AES-CTR + HMAC-SHA1 + PBKDF2) in `crypto.wasm` | planned |
| mediabunny (4) | minimp4 (C, CC0) muxer around WebCodecs | planned |
| semver (4) | own C semver parser/comparator | planned |
| own TS parsers: EXIF reader/stripper (`src/lib/exif.ts`), X.509 DER, hex/log viewers, search ranking | port to C (`wasm/`) | EXIF: in progress |
Staying on tier 2 (official upstream wasm, fine): MuPDF, SQLite, MediaPipe Tasks. Staying JS (no compiled
equivalent, reasons above): OpenPGP.js, Mermaid, Prettier, sql-formatter, TensorFlow.js.

### Approved data APIs (connect-src allowlist)
Add a host here and to the CSP `connect-src` in `index.html` (and the allowlist in `tests/e2e/no-external.e2e.mjs`)
only when a tool needs live data and the owner has accepted that tool. **Approved:**
| Host | Used by | What is sent | Why |
|---|---|---|---|
| `en.wiktionary.org` (Wikimedia REST: `/api/rest_v1/page/definition/<word>`) | `photodict` | one word | online fallback for words missing from the bundled dictionary (owner request) |
| `api.dictionaryapi.dev` (Free Dictionary API: `/api/v2/entries/en/<word>`) | `photodict` | one word | second fallback if Wiktionary has no entry or is down |
Both are free, need no key or account, send CORS headers, set no cookies we read. Hosts go into the CSP when the
tool ships. e2e tests never hit them: Playwright `page.route` serves recorded responses (the dev sandbox cannot
reach them anyway). Candidate tools offered to the owner: currency converter (frankfurter.app, ECB rates),
weather (Open-Meteo), IP/network info, clock-accuracy check (network time).

## 4. Architecture

- **Vite + TypeScript, no UI framework.** Small DOM helper `h()` in `src/ui.ts`.
- **Hash routing** (`#/pgp`) — GitHub Pages has no SPA fallback. Vite `base: './'` so the site works under
  `/utils/`.
- Each tool lives in `src/tools/<id>.ts` (or a folder) and exports `mount(root: HTMLElement): Cleanup | void`.
  Tools are **lazy-loaded** with dynamic `import()` so a phone only downloads what it opens.
- Registry: `src/tools/registry.ts` (id, title, group, icon, `pcOnly`, loader).
- Layout: header (title + search) → category tab bar → utility tab bar → tool content. Same structure on
  mobile with swipeable sticky rows. PC-only tools hidden when `isMobile()` (`src/platform.ts`).
- **CSP** in `index.html` `<meta http-equiv="Content-Security-Policy">`: `default-src 'self'`,
  `script-src 'self' 'wasm-unsafe-eval'`, `worker-src 'self' blob:`, `connect-src 'self' blob: data:`,
  `img-src 'self' blob: data:`, `media-src 'self' blob: mediastream:`, `style-src 'self' 'unsafe-inline'`,
  `frame-src https://www.youtube-nocookie.com`, `object-src 'none'`.
- Our wasm modules are WASI "reactor" modules (no Emscripten); `src/wasm/wasi.ts` is a tiny shim
  (`random_get` → `crypto.getRandomValues`, `fd_write` → console, everything else ENOSYS).

### Directory map
```
index.html                 app entry (CSP, root element)
src/main.ts                shell: router, nav, home grid
src/ui.ts                  DOM helpers & widgets (file picker/drop, sliders, progress, download, toast)
src/platform.ts            mobile / capability detection
src/wasm/                  loaders for our wasm (wasi.ts, imgproc.ts, crypto.ts)
src/tools/                 one module per tool
src/styles.css             all styles (light/dark via prefers-color-scheme)
wasm/crypto/               libsodium glue + own hash C sources + build.sh
wasm/imgproc/              own image-processing C source + build.sh
wasm/tools/                verify-minisign.mjs
src/wasm/bin/*.wasm        COMMITTED build outputs of our wasm modules (imported with ?url)
public/models/             COMMITTED ML models (see §6)
public/data/               COMMITTED data files (EFF wordlist, …)
public/vendor/             GENERATED by scripts/vendor.mjs from node_modules (gitignored)
scripts/vendor.mjs         copies vendored runtime files (ffmpeg core, mediapipe wasm, tesseract, …)
tools/sodium_decrypt.py    reference decryptor for the Sodium format
docs/                      format specs
.github/workflows/pages.yml  build + deploy to GitHub Pages
```

---

## 5. Building our WebAssembly modules

Toolchain: **Zig** (its `zig cc` is clang + bundled wasi-libc). Install without root:
```bash
python3 -m pip download ziglang==0.17.1 --no-deps -d /tmp/zig
python3 -m zipfile -e /tmp/zig/ziglang-*.whl /tmp/zig/x && chmod +x /tmp/zig/x/ziglang/zig
export ZIG=/tmp/zig/x/ziglang/zig
```

### 5.1 libsodium → `src/wasm/bin/crypto.wasm`
Source: the libsodium **stable** tarball vendored inside the crates.io crate `libsodium-sys-stable`
(crates.io is reachable from restricted sandboxes; github.com/download.libsodium.org may not be).
It is **verified with minisign** against libsodium's official public key
`RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3` before use.
```bash
ZIG=/path/to/zig wasm/crypto/build.sh      # downloads crate, verifies signature, builds, writes src/wasm/bin/crypto.wasm
```
The script: fetch `https://static.crates.io/crates/libsodium-sys-stable/libsodium-sys-stable-<ver>.crate`,
extract `LATEST.tar.gz` + `.minisig`, run `node wasm/tools/verify-minisign.mjs`, `./configure
--host=wasm32-wasi --disable-ssp --disable-shared --without-pthreads` with `CC="zig cc --target=wasm32-wasi"`,
`make`, then link `libsodium.a` + `glue.c` + `hashes.c` as a reactor (`-mexec-model=reactor`) exporting only
the functions listed in `glue.c`. To upgrade libsodium: bump the crate version in `build.sh`, rebuild,
run the self-test (`node wasm/crypto/test.mjs`), commit the new wasm.
Last built from: libsodium **1.0.20-stable** (tarball signed 2025-04-05, crate 1.22.3).

### 5.1b mathcore → `src/wasm/bin/mathcore.wasm`
Own C (`wasm/mathcore/mathcore.c`, ~700 lines): expression compiler + bytecode VM (also evaluates whole plot ranges
in one call), root finding, quadratic/cubic, det/inverse/matmul/rank/linear solve, statistics + regression,
64-bit primes (deterministic Miller–Rabin) and Pollard-rho factorisation, exact fractions (int64 with overflow
detection), arbitrary-length base conversion, Roman numerals, number→words (Indian + international), finance
(EMI, amortisation, SIP, FD/RD, PPF, EPF, NPS, prepayment), health (BMI, BMR, body fat, ideal weight), haversine.
`wasm/mathcore/build.sh` (exports every `API m_*` function). TS wrapper: `src/wasm/mathcore.ts` (`bindMathcore`
works in the browser and in Node tests). Tests: `tests/unit/mathcore.test.mjs` (~150 known-answer checks).

**Rebuild everything we compile ourselves:** `ZIG=/path/to/zig wasm/build-all.sh` (builds each module, then runs
the unit tests).

### 5.2 Image processing → `src/wasm/bin/imgproc.wasm`
Own C (`wasm/imgproc/imgproc.c`). `wasm/imgproc/build.sh` compiles with
`zig cc --target=wasm32-wasi -O3 -msimd128 -mexec-model=reactor`. TS wrapper `src/wasm/imgproc.ts` (`bindImgproc`; `imgproc(op, ...)` runs ops in `src/workers/imgproc.worker.ts`). Tests: `tests/unit/imgproc.test.mjs` (synthetic images, known answers). Ops: adjust (tone LUT + temp/tint/hue/sat/vibrance), Lanczos-3 resize (premultiplied), Gaussian blur, unsharp mask, rotate, bilateral, cartoon (XDoG + k-means), Kuwahara, sketch, watercolour, halftone, pixelate/blur rect, guided-filter alpha + composite, page detection, perspective warp, document enhance (colour/grey/B&W), histogram.

---

## 6. Vendored third-party code and models

npm packages (pinned in `package-lock.json`) are bundled by Vite or copied to `public/vendor/` by
`scripts/vendor.mjs` (runs automatically before `dev` and `build`).

| Package | Licence | Used by |
|---|---|---|
| openpgp | LGPL-3.0 | OpenPGP |
| @ffmpeg/ffmpeg, @ffmpeg/util, @ffmpeg/core | MIT / GPL-2.0+ (core) | FFmpeg |
| pdfjs-dist | Apache-2.0 | PDF Toolkit, PDF→EPUB |
| pdf-lib | MIT | PDF Toolkit, Doc Scanner |
| fflate | MIT | EPUB zip |
| @jsquash/jpeg (MozJPEG), /webp, /oxipng | Apache-2.0 (+ codec licences) | image encoders |
| @mediapipe/tasks-vision | Apache-2.0 | Passport |
| @tensorflow/tfjs-* | Apache-2.0 | Cartoonizer style transfer |
| tesseract.js, tesseract.js-core, @tesseract.js-data/eng, /hin | Apache-2.0 / MIT | OCR |
| zxing-wasm | MIT (zxing-cpp Apache-2.0) | QR |
| @zip.js/zip.js | BSD-3-Clause | Zip, Batch Images |
| libarchive.js | MIT (libarchive BSD) | Zip extract |

Models committed under `public/models/` (download URLs for refresh):
- `face_landmarker.task` — https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task (Apache-2.0)
- `selfie_multiclass_256x256.tflite` — https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite (Apache-2.0)
- `style/predictor`, `style/transformer` — Magenta arbitrary style transfer, converted from the legacy
  TF.js format at https://storage.googleapis.com/magentadata/js/checkpoints/style/arbitrary/{predictor,transformer}/
  (`tensorflowjs_model.pb` + `weights_manifest.json` + shards) to `model.json` by `scripts/convert_magenta.py`
  (Apache-2.0).

Rejected: `@jspawn/ghostscript-wasm` (unmaintained 2022 single-maintainer build of Ghostscript; safety).

---

## 7. Develop, test, deploy

```bash
npm ci
npm run dev        # http://localhost:5173  (vendor files copied first)
npm run build      # → dist/
npm run preview    # serve dist/
```
**Tests (fast and parallel — owner requirement):**
```bash
npm test                 # node tests/unit.mjs — all unit suites concurrently in one process (~1 s)
npm run build && npm run test:e2e   # node tests/e2e.mjs — one Chromium, suites run concurrently (~15 s)
node tests/unit.mjs mathcore        # filter by file name; same for e2e
E2E_CONCURRENCY=8 node tests/e2e.mjs
```
- `tests/unit/*.test.mjs` export `default async (t, { load, wasm })`; `t.ok/eq/near/throws`; `load()` = Vite SSR
  import of any `src/` module; `wasm(name)` instantiates `src/wasm/bin/<name>.wasm` with a WASI shim.
- `tests/e2e/*.e2e.mjs` export `default async ({ base, page, ok, download, tmp, devices })`; `page(opts)` makes an
  isolated context (console errors collected in `page.errors`).
- **Owner rule (bulletproof testing):** besides the whole-app suites (`shell`, `layout`, `no-external`), **every
  utility tab has its own independent e2e suite** (`tests/e2e/<tool-or-group>.e2e.mjs`), all suites run in parallel,
  and every wasm module has unit tests. Use **real media files** wherever possible: real photos with EXIF/GPS
  (public-domain samples from scikit-image / Pillow test data), real HEIC (pillow-heif test files), real PDFs incl.
  encrypted ones (PDF library test corpora), real audio/video (generated with the Playwright-bundled ffmpeg at
  `/opt/pw-browsers/ffmpeg-*`), a real face via Chromium's `--use-file-for-fake-video-capture` (passport, webcam),
  and speech produced by our own TTS for the STT round trip. Fixtures live in `tests/fixtures/` (committed, small;
  `tests/fixtures/README.md` records each file's source and licence).
- Every tool must have e2e coverage of its main flow with known answers; every wasm module must have unit tests.
- `no-external.e2e.mjs` visits every route on desktop + phone (sharded) and fails on any request to another host,
  any CSP violation or any page error.
- `tests/shoot.mjs <dir> <routes> [desktop|mobile|both]` takes screenshots for visual checks (phone = iPhone 13).
Playwright is the pre-installed global one (no `playwright install`); CI runs build + unit tests.

**Compute rule (owner):** algorithms and loops run in WebAssembly (own C where practical); TypeScript only builds
UI, formats output and does trivial glue arithmetic (unit factors, a single multiplication, Date/Intl handling).

**Deploy:** `.github/workflows/pages.yml` builds and publishes on push to `main` or the working branch.
One-time setup by the owner: GitHub → repo **Settings → Pages → Source: GitHub Actions**. If the
deployment is refused for a branch, allow it under **Settings → Environments → github-pages →
Deployment branches**.

## 8. Adding a new tool (checklist)
0. **Apply STANDING RULE #1 first** (top of this file): for every engine/library/algorithm the tool needs, pick
   our own wasm build from upstream source unless impossible; record the tier and reason in §3a.
1. Create `src/tools/<id>.ts` exporting `mount(root)`; use helpers from `src/ui.ts`.
2. Register it in `src/registry.ts` (id, title, desc, category, icon, rich keywords, `platform`: 'both' unless
   the owner says PC only, or it genuinely needs phone hardware → 'mobile'). Add search cases.
3. Heavy dependencies: dynamic-import inside the tool; vendor runtime files via `scripts/vendor.mjs`;
   never load from a CDN; keep the CSP intact.
4. Add a smoke test in `tests/e2e.mjs`, update §2/§3 of this file, commit, push.
