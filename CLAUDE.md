# SuperTools — project spec & runbook

This file is the **single source of truth** for this repository. It records every requirement the owner
gave, every design decision made on their behalf, and the exact procedures to rebuild, extend, test and
deploy the app. Read it fully before changing anything. Keep it updated in the same commit as any change
that affects it.

> ## ▶ RESUME POINT: `docs/RESUME.md`
> Owner rule: `docs/RESUME.md` is the sync point for when a session stops (usage limit, reset). **Read it right after
> this file and continue from its "Next steps". Update it in every commit that changes status, and push often** —
> the owner may be cut off at any moment and must be able to come back and continue without losing anything.

> ## 📒 Also read `docs/HANDOFF.md` (after RESUME.md)
> The owner's latest wishes from chat, how the e2e suites are written (helpers, locators), traps already found, machine
> setup and the plan for usage/time limits. Keep it current.

> ## 🔔 Owner reminder: `docs/potentials.md`
> The owner asked (Nov 16 2026) to be **reminded** about the new-tab ideas in `docs/potentials.md` (and the older
> `docs/IDEAS.md`). **Owner, 16 Nov 2026: finish ALL the original apps (every stub tab) before asking** — then ask
> which to build. Build none of them until the owner picks.

> ## ⚠️ STANDING RULE #1 — WebAssembly first (owner; permanent; applies to every line of new code)
> The owner has had to repeat this several times. **Check this rule before choosing ANY engine, library or
> algorithm for ANY tool — new or existing — without waiting to be reminded.**
> **Owner, 18 Nov 2026 (latest wording — it settles the order, which the 17 Nov wording had left open with "either
> one is fine"):** "As regards the WebAssembly first preference rule, first try and use tried and tested WebAssembly
> modules already out there. Famous ones, good ones. After that, if that's not available, then try and build out
> your own WebAssembly modules from open source code. And after that, if that's not doable, then use existing
> JavaScript or TypeScript libraries."
> **Owner, 18 Nov 2026 (added the same day):** "Just remember that in this preference, the WebAssembly modules that
> are out there should only be used if it satisfies all the conditions and feature requests that I asked for per
> utility. If it doesn't, then build out our own WebAssembly module."
> **Owner, 18 Nov 2026 (third message that day — a tweak that REPLACES the "use it only if it satisfies all" part
> of the sentence above):** "one more tweak to the webassembly first rule... if the existing wasm module out there
> already exists but does not cover all the features i ask for in a utility, then still use that, but use the
> remaining 2 points in the rule for the additional features not covered in the existing wasm, as in a) build out an
> additional supplementary wasm module for the extra missing features b) use existing JS/TS c) build your own js/ts..
> note this in claude.md and do another pass for all the existing 52 apps first and for the remaining apps.. then
> write all the tests and continue the bug hunt and extensive test cases..."
> **Owner, 18 Nov 2026 (right after the tweak):** "regarding my latest prompt about the wasm-first preference, use your
> best judgement.. but always try to do wasm-first in any case" — so: where the words above do not settle a case,
> Claude decides, writes the reason in `docs/WASM-AUDIT.md`, and leans towards WebAssembly every time.
> **Owner, 18 Nov 2026 (bug hunt, from the 52nd tab on — the order of work per tab):** "first see if any WebAssembly
> module that you wrote can be replaced by an existing one out there using the rules that you mentioned, and then find
> bugs and then write extensive test cases, solve the bugs as you've been doing, and then move on to the next app."
> → every tab gets its entry in `docs/WASM-AUDIT.md` (our module → candidates → check → decision) **before** its bug
> hunt; a replacement means running that tab's suites again.
> **The order (as it stands after the tweak):**
> 1. **An existing, tried-and-tested WebAssembly module that is already out there** — a famous, good one: the
>    upstream project's official build (SQLite's, Artifex's MuPDF, Microsoft's ONNX Runtime, Google's MediaPipe) or a
>    widely used, maintained build by someone else (jSquash codecs, libheif-js, tesseract.js-core, zxing-wasm,
>    libarchive.js, ffmpeg.wasm, hash-wasm), at its latest stable version. **Look for one first, every time.**
>    - **It covers everything asked for the utility → use it.**
>    - **It exists but does not cover all the features asked for → STILL use it for what it covers, and add the
>      missing features beside it, in this order:**
>      **(a)** an additional, supplementary WebAssembly module of our own for the missing features (from open-source
>      code or our own C / Rust); **(b)** if that is not doable, an existing JS / TS library; **(c)** if there is
>      none, our own JS / TS.
>    - What is NOT a "missing feature": the hard requirements of §1 (hosted in the app, no CDN, no runtime downloads
>      from elsewhere, user data stays on the device, lazy per tab, the platforms asked for) and an open-source
>      licence. A module that breaks one of those is not used at all.
>    - *Claude's judgement (the owner left such cases to it; listed per tab in `docs/WASM-AUDIT.md`):* a module that
>      gives **wrong results or crashes** on something the utility needs, where nothing placed beside it can put
>      that right (the fault is inside the engine), has a defect, not a missing feature. It is written down with
>      the evidence, and the utility keeps — or gets — a WebAssembly engine of our own whose tests pass.
> 2. **No such module exists at all: build our own WebAssembly module from open-source code** — the latest stable
>    open-source source (C/C++, Rust, Zig…; source verified by checksum or signature; licences respected) or our own
>    C / Rust on top of it (`wasm/`). Functionality that exists only as JavaScript / TypeScript belongs here too: make
>    a WebAssembly module out of it (port it, or compile it) when that is possible and fits the utility (owner,
>    17 Nov 2026).
> 3. **Only when that is not doable either:** use an existing open-source JavaScript / TypeScript library as it is —
>    **and write the reason down in §3a** (the owner asked for a note every time); our own JS / TS comes last. Don't
>    stall a tool over it.
> **Every replacement or addition of an engine means running that tab's suites again** (owner, 18 Nov 2026).
> Still in force from the owner's 17 Nov 2026 wording: "WebAssembly modules are always preferred. They are the first
> choice for functionality, library code. … it should be all legal. … Also remember to host all these libraries in
> the app: library code should not be pulled in at runtime, it should statically be part of the app, whether it's
> JavaScript libraries or TypeScript modules."
> Always:
> - **Everything is hosted in the app** — WebAssembly modules, JavaScript / TypeScript libraries, models, fonts, data:
>   vendored, pinned and served from this site. **Never a CDN, never library code fetched at runtime.**
> - Open-source licences only, and legal: record the licence of every component in §6.
> - Before adding a dependency, write the choice (existing wasm / own wasm from open-source code / JS as is) and the
>   reason in the commit message — for "own wasm", which existing modules were looked at and why none fits.
> - TypeScript only builds UI, formats output and does trivial glue (see the compute rule in §7). Pixel loops,
>   parsers, codecs, maths, search, diff, compression, crypto → wasm.
> - What is already in use stays, at its latest stable version: third-party builds (jSquash codecs, libheif-js,
>   tesseract.js-core, zxing-wasm, libarchive.js, ffmpeg.wasm, MuPDF, SQLite, ONNX Runtime, MediaPipe) and our own
>   builds (crypto, imgproc, BusyBox, jq, Graphviz, CPython, devcore, formats, …).
> - The owner's to-do list (`todo.md`) has an item for it: sweep the code again and move as much JS/TS as possible
>   into WebAssembly modules, where doable — **only when the owner picks that item** (see the to-do note below).

> ## ⚠️ STANDING RULE #2 — Test extensively, fix, test again (owner, 17 Nov 2026; permanent; every utility)
> **Owner:** "For whatever utility you write, make extensive tests and test them. If those tests find bugs, then fix
> the bugs and test again. If the test cases are broken, then fix the test and test again."
> - **Every utility gets extensive tests, written with it:** unit tests for its engine (every wasm module) and its own
>   e2e suite for the tab (`tests/e2e/<id>.e2e.mjs`) — known answers, and wherever one exists an **independent
>   reference** (the native tool, another implementation, a published test vector, a real file) rather than our own
>   output copied into the test. Details and helpers: §7.
> - **Run them. A red test is a question — which side is wrong?** If the code is wrong: fix the bug, run again. If the
>   test is wrong (a slip in the expectation, a race, a stale selector): fix the test, run again. Repeat until green.
> - **Never get to green by weakening a check**, skipping a test or deleting a case that shows a real bug.
> - A bug found any other way (a probe, the owner, a review) gets a test that would have caught it, in the same commit.
> - Run the tests of what was touched as the work goes on; the complete suites (`npm test`, then
>   `npm run build && node tests/e2e.mjs`) at the end of each area. **Pushing does not wait for them** (STANDING
>   RULE #3). Record what was found and fixed in `docs/BUGHUNT.md`.

> ## ⚠️ STANDING RULE #3 — Commit and push regularly and often (owner, 17 Nov 2026; permanent)
> **Owner:** "Commit and push regularly and often. Don't wait for the entire test suite to get over or the entire
> utility to get over."
> - Commit **and push** after every meaningful step — an engine fix, a rebuilt wasm module, a new test file, a page
>   change, a docs update — not once per finished utility and not only after the complete e2e run. The owner can be
>   cut off at any moment (usage limit, session reset) and must not lose work.
> - What a push needs: the project builds (`npm run build`) and the tests of the files just touched have been run.
>   Work that is not finished is pushed too — say so in the commit message ("in progress: …") and in
>   `docs/RESUME.md`.
> - The complete suites still run at the end of each area; what they find is fixed and pushed as its own commit.
> - Push to the working branch only (see the session's branch rule); never force-push.

> ## 📝 Owner's to-do list: `todo.md` (the owner calls it "to do")
> Created 17 Nov 2026. When the owner says "add … to to do" or "what's on to do", it means this file. Read it at the
> start of a session and keep it current. **Never start an item on your own (owner, 17 Nov 2026):** when the current
> work is finished, show the owner the open items and ask which ones to do — then do only those.

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
   1. An existing, tried-and-tested WebAssembly module (a famous, good one: the upstream project's official build
      or a widely used one, latest stable). If it does not cover every feature asked for the tool it is still used,
      and the missing features are added beside it: (a) a supplementary WebAssembly module of our own, (b) an
      existing JS/TS library, (c) our own JS/TS (owner, 18 Nov 2026).
   2. If there is none at all: our own WebAssembly build from the latest proper open-source **C/C++/Rust** (or other
      compiled) source or our own code on top of it — also for functionality that exists only as
      JavaScript/TypeScript, when a port is possible and fits the tool.
   3. Only if that is not doable: a widely used, safe, OSI-licensed JavaScript/TypeScript library as it is, vendored
      and pinned — with the reason noted in §3a.
   Everything — wasm, JS, TS — is hosted in the app; no library code is pulled in at runtime.
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
11. **Lazy dependencies per tab (owner, Nov 16 2026):** a tab's engines, models, data and fonts are fetched from
    this site only when that tab is used, and released when it is left — see §4 "Lazy dependencies".

### Owner's answers to open questions
- App name: **SuperTools** (title, header brand, `document.title` suffix).
- Commit and push **each tool as soon as it works** — never batch many finished tools into one push. (17 Nov 2026:
  more often still — see STANDING RULE #3: push after every meaningful step, without waiting for the whole utility or
  the complete test run.)
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
| `passport` | Passport Photo | both | MediaPipe Face Landmarker (eyes/chin/tilt) + selfie multiclass (person mask, crown via `p_mask_top`) → layout to head-height / eye-height rules (`src/lib/passport.ts`) → crop region only at full res → guided-filter matte + required colour → one homography warp (`p_warp_quad_fill`) → 300 dpi JPEG, digital-upload JPEG (px/KB limits), 4×6 in / A4 sheets |
| `formphoto` | Photo & Signature Resizer | both | presets (`src/lib/form-specs.ts`: IBPS/SBI/RBI, SSC, UPSC, NTA, PAN — px + KB ranges, all editable, "confirm with the notification"), face auto-framing (BlazeFace), paper clean-up (`imgproc` ink), Lanczos resize, MozJPEG best quality ≤ max, JPEG comment padding up to the min (`metacore` `m_jpeg_pad`), DPI |
| `bgremove` | Background Remover | both | MediaPipe selfie-multiclass (6 categories) → person mask in C (`p_person_mask`: hair+skin+clothes, accessories only next to the person) → `imgproc` guided-filter matte at full res → transparent PNG / colour / blur / another photo (`p_composite_img`) |
| `cartoon` | Cartoonizer | both | `imgproc` filters (DoG lines, k-means, Kuwahara, dodge, halftone) + Magenta arbitrary style transfer (TF.js: WebGL → wasm XNNPACK → CPU) |
| `redact` | Blur & Redact | both | MediaPipe BlazeFace on the whole photo + multi-scale square tiles (small faces in group photos), NMS + pixelate/blur/fill in `imgproc`; manual boxes; tap a box to keep it visible |
| `watermark` | Watermark | both | canvas text/logo watermark |
| `caption` | Text on Image | both | canvas captions / meme text |
| `collage` | Collage Maker | both | canvas photo grid |
| `exif` | EXIF / Photo Info | both | own EXIF parser; strip metadata |
| `scanner` | Doc Scanner | both | `imgproc` page detection (convexity/area check → falls back to whole photo), draggable corners, homography warp, enhance; PDF via MuPDF (`src/lib/pdf.ts`, JPEG pages embedded as-is) or JPEGs |
| `ocr` | OCR | both | Tesseract (C++ → wasm), English, French, Spanish, German |

**Documents** (engine: **MuPDF 1.28**, Artifex's official C → wasm build, for every PDF tab — merge/split via `graftPage`,
rotation via `/Rotate`, rendering, text, stamping, AES-256 encrypt/decrypt in `saveToBuffer`; pdf-lib / PDF.js / QPDF are
not used. Shared code: `src/lib/pdf.ts` (open with password, save, `pageGeom` visual-coordinate matrix for /Rotate 0/90/
180/270, `stampPage` (own Resources copy, original content wrapped in q…Q), Helvetica text width, WinAnsi (Windows-1252)
encoding, `parseRanges`), `src/lib/pdfui.ts` (picker that asks for the password of protected files). **BUILT** (each with
its own e2e suite; outputs re-opened in Node with MuPDF by `tests/lib/pdfcheck.mjs` — page counts, order, rotation, text,
rendered pixels): `pdf-merge` (10), `pdf-split` (8), `pdf-organize` (10), `img2pdf` (9: upright JPEG/PNG embedded
byte-for-byte, other formats or EXIF-rotated JPEGs re-encoded), `pdf2img` (7), `pdf2text` (8: scanned PDF → OCR hint),
`pdf-pagenum` (11: text read back, pixel position incl. a /Rotate 90 page), `pdf-watermark` (10: vector Helvetica text,
non-Latin text as a PNG image, opacity via ExtGState, tiled), `pdf-unlock` (12: AES-256/AES-128/RC4 inputs → no password;
owner-only restrictions removed too), `pdf-protect` (13: AES-256 V5 R6, permission bits print/copy/edit, permissions
password (random if empty), re-protecting replaces the old password; passwords cannot contain commas — MuPDF's option
syntax), `pdf-compress` (14: every image XObject except masks is decoded by MuPDF, expanded to RGBA (`p_expand`) and
resized (Lanczos) in imgproc.wasm to the level's dpi of the largest page, re-encoded with MozJPEG (grey stays grey) and
kept only if ≥ 8 % smaller; fonts subset; `garbage=deduplicate`. Levels Light 220/84 · Recommended 150/72 · Strong
110/60 · Extreme 80/48 (dpi / quality); Target size tries them in order; Scanned pages = one JPEG per page at the exact
page size (text layer lost, warned). Nothing is downloaded when the file cannot get smaller), `pdf-sign` (12: draw
(pressure-aware strokes from the Signature Maker), type (OFL handwriting fonts) or photo (paper removed by imgproc
`inkToAlpha`) → trimmed transparent PNG placed as an image XObject with soft mask; tap/click to place, drag, size, date
dd/mm/yyyy, every page; "not a cryptographic digital signature" note), `pdf-fill` (15: AcroForm fields — text, multi-line,
checkbox, radio groups (on-states from the appearance dictionary), combo/list boxes, read-only shown locked — set through
MuPDF widgets with appearance regeneration; optional flatten (`bake`); "type anywhere" text boxes for PDFs without fields
(Latin script); tests build a richer form with `tests/lib/makeform.mjs`). **All 13 PDF tabs done.**

**Document generators** (`src/tools/docgen.ts`) — `invoice` GST Invoice (20), `rent` Rent Receipt (10), `resume` Resume
Builder (7) — **BUILT**. Engine `src/lib/htmlpdf.ts`: the filled HTML template + CSS + images + self-hosted **Noto Sans**
TTFs (OFL, `@expo-google-fonts/noto-sans`, vendored to `public/vendor/fonts/`; covers Latin, Greek, Cyrillic,
**Devanagari** and **₹**) are zipped into an in-memory EPUB, laid out by MuPDF's HTML engine (HarfBuzz shaping), written
page by page with `DocumentWriter('pdf')`, fonts subset (~55 KB files), optional "Page i of n". Why EPUB: mupdf.js has
no Story API and `openDocument` cannot load fonts from outside the document; MuPDF's FreeType reads TTF but not WOFF.
MuPDF ignores CSS page breaks and % column widths: each array element of the body is its own chapter (= new page),
and two-column layouts use widths in points. The preview is the real PDF rendered by MuPDF. "Save details / Load
details" keep a JSON file on the user's device (nothing stored in the browser). GST maths in mathcore
(`m_invoice`: integer paise, half-up per line; CGST+SGST same state, CGST+UTGST in Chandigarh / DNH&DD / Lakshadweep /
A&N / Ladakh, IGST otherwise; rates incl. 0.1/0.25/1.5/7.5/40 %; optional rupee round-off) and `m_gstin_valid` (GSTN
mod-36 check character); amount in words = `m_words` (lakh/crore). Invoice: Tax invoice / Proforma / Quotation / Bill of
supply, GSTIN check auto-fills the state, place of supply, reverse charge, per-rate tax summary, bank details, UPI
pay QR (zxing-wasm), logo and signature images, accent colour. Rent receipt: one per month (exact month ends), three
per A4 page with cut lines, landlord PAN warning above ₹1 lakh/year, revenue-stamp box for cash above ₹5,000. Resume:
Classic / Modern (two columns) / Compact, A4 or Letter, photo, repeatable jobs / education / projects.
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
| `epub` | PDF → EPUB (Kindle) | **PC** — **BUILT** (see §3) |
| `sheet` | CSV / Excel Viewer & Converter | **PC** — **BUILT** (sheet.wasm; open xlsx/xlsm/xlsb/xls/ods/csv/tsv/json, sheet tabs incl. hidden, separator override, filter, export CSV (BOM) / TSV / JSON / XLSX; e2e 17) |
| `markdown` | Markdown Editor | both — **BUILT** (cmark-gfm wasm; live preview, toolbar + Ctrl+B/I/K, .md open/save, standalone .html, print of the preview only; e2e 23) |

**Security**: `pgp` OpenPGP · `sodium` Sodium Encrypt · `sharelink` Encrypted Share Link (ciphertext in the
URL `#fragment`, never sent to a server) · `hash` Hash / Checksum · `password` Password Generator ·
`passphrase` Passphrase Generator — all both.

**Media**: `video` Video Compressor (both, **BUILT**) · `audio` Audio Recorder (both, **BUILT**) · `tts` Text-to-Speech (both, **BUILT**) ·
`ffmpeg` FFmpeg (**PC**, **BUILT**) · `screencast` Screencast (**PC**, **BUILT**) · `screenshot` Screenshot (**PC**, **BUILT**) ·
`youtube` YouTube Clip (**PC**, **BUILT**)

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
`jq` jq Playground (jq C source → wasm) · `yaml` YAML ⇄ JSON ⇄ TOML (our Rust formats-yaml.wasm) · `xml` XML Formatter /
XPath · `json2types` JSON → Types (TS/Go/Rust/Java/Python) · `jsondiff` JSON Diff · `sqlfmt` SQL Formatter
(sqlformat, Rust → devcore-sqlfmt.wasm) · `prettier` Code Formatter (Prettier standalone) · `mockdata` Mock Data Generator · `mdtable`
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
`idealweight` · `coords` Coordinates. Media: `noise` Noise Remover (RNNoise, own wasm, **BUILT**) · `pitch` Pitch & Speed (own C WSOLA, **BUILT**)
· `slideshow` Slideshow Maker (WebCodecs, **BUILT**). Documents: `invoice` GST Invoice · `rent` Rent Receipt · `resume` Resume
Builder (HTML → browser "Save as PDF"). Images: `signature` Signature Maker. Software (PC): `graphviz` (Graphviz C →
wasm) · `python` (CPython 3.14 C → wasm32-wasi, built by us) · `totp` · `pwstrength` (zxcvbn) · `jsonschema` · `bitwise` · `ieee754` ·
`contrast` · `baseenc` · `bindecode` · `httpstatus` · `mime` · `ports` · `ascii` · `keycode` · `gradient` · `shadow` ·
`svgo` · `patch`.
**Speech to Text** (`stt`, Media, both) — **BUILT** (`src/tools/stt.ts`, worker `src/workers/stt.worker.ts`; e2e
`tests/e2e/stt.e2e.mjs` 11). Engine: **whisper.cpp 1.8.3 built by us** (`wasm/whisper`, single thread, WebAssembly SIMD,
~1.2 MB) + OpenAI Whisper English models (MIT) from huggingface.co/ggerganov/whisper.cpp (commit-pinned, SHA-256):
"Accurate" `ggml-small.en-q5_1` (190 MB, served as 3 parts < 95 MB; default on PC; chosen for Indian, UK and US accents)
and "Fast" `ggml-base.en-q5_1` (60 MB; default on phones). Record (browser voice clean-up on) or open any audio/video →
mono 16 kHz by our audio.wasm in the worker → the model is streamed straight into wasm memory (download %), whisper's
own progress via an `env.w_progress` import; "names and terms" box = Whisper's initial prompt (verified: invented
names come out as typed); optional beam search (5); editable transcript, timestamped segments (click to play from
there), Copy / .txt / .srt / .vtt. Stop = terminate the worker. Not live dictation (no threads on GitHub Pages).
Measured in the sandbox (one thread): base.en ≈ 1.7 s of work per second of audio (11 s clip in 19 s), small.en ≈
6× (10 s in 66 s) — the encoder always processes a 30 s window, so short clips cost the same as 30 s.
Tests: JFK clip (public domain) word for word with base.en; LibriSpeech 1089-134686-0000 with small.en (WER ≤ 10 %);
round trips through our own TTS — Indian English (Piper SVBI) with small.en WER ≤ 20 % (observed ~12 %; Piper's
sampling makes each run differ), base.en reported (11–28 % seen), US English (Kokoro Michael) WER ≤ 15 % (0 %);
hint-box spellings; .srt/.vtt/.txt; segments; stop.

**Text-to-Speech** (`tts`) — **BUILT** (`src/tools/tts.ts`, worker `src/workers/tts.worker.ts`, front ends
`src/lib/kokoro.ts` + `src/lib/piper.ts`; unit `espeak.test.mjs` 14 + `tts-text.test.mjs` 26; e2e `tts.e2e.mjs` 13).
Owner asked for the best quality: **Kokoro-82M** (Apache-2.0, `onnx-community/Kokoro-82M-v1.0-ONNX` q8, 92 MB, commit
pinned + SHA-256) for US (Heart, Bella, Nicole, Sarah, Michael, Fenrir, Puck) and British (Emma, Isabella, George,
Fable) voices at 24 kHz; **Indian English** = Piper `en_US-l2arctic-medium` (VITS, 77 MB, CC BY-NC 4.0 — personal use)
speakers SVBI (2) and TNI (9) female, ASI (10) and RRBI (19) male, 22.05 kHz. Phonemes: **our own eSpeak NG 1.52.0
wasm** (`wasm/espeak`, English data linked in) — Kokoro: kokoro-js's text normalisation (money, years, times,
decimals, ranges, titles) and phoneme fix-ups ported to TS (+ eSpeak 1.52's "kəkˈɔːɹoʊ" form), punctuation kept around
eSpeak segments, the model's 115-symbol vocabulary, chunks ≤ 510 tokens, style row = token count; Piper: piper-phonemize
logic (clause punctuation, one sentence per line, `^ _ … _ $` ids, length_scale = 1/speed, 0.2 s sentence silence).
Networks on **ONNX Runtime Web 1.31** (official Microsoft wasm build, one thread — no cross-origin isolation on
GitHub Pages), models streamed with progress, audio sent back sentence by sentence and scheduled gap-free (first
sound after the first sentence). Speed 0.5–2× (model-side, natural pitch). Text box or .txt/.md (markdown stripped).
**MP3** (our LAME, 96 kbps) or WAV; Stop. "System voices": Web Speech on-device English voices, play only (browsers
cannot capture them). Measured in the sandbox: Kokoro ≈ 0.4× real time incl. the first model load, Piper ≈ 0.8×.
Not yet: WebGPU for Kokoro (ORT's 29 MB JSEP build) — would make it several times faster on PCs with a GPU.
Claude's own app voice was considered and rejected: proprietary cloud service — violates the hard requirements.
Tests: Kokoro 24 kHz mono, plausible length and energy, female median F0 > male + 40 Hz (Heart vs Michael), British
voice, 2× speed ≈ half the length, Piper 22.05 kHz with female above male pitch, MP3 frames, sentence progress, stop,
markdown → text.
Speech to Text accent requirement: very good on US, UK and **especially Indian English** → Whisper small.en default
plus a "names & terms" hint box fed to Whisper's initial prompt.

**Batch 4 (owner-requested):**
- **`bc` console** — PC only, shown **inside the Scientific Calculator tab** next to the keypad calculator (owner's
  explicit request; phones show only the keypad). Engine: BusyBox's `bc` (Gavin Howard's bc, arbitrary precision,
  `-l` maths library) from our BusyBox wasm build — **BUILT** (`src/tools/bc-console.ts`, runs in the terminal worker;
  each Enter replays the session through `bc -lq` so variables/functions persist and shows only the new output;
  errors shown without breaking the session; e2e `tests/e2e/bc-console.e2e.mjs`).
- **Linux Terminal — owner instructions (Nov 16 2026):** include **as many BusyBox applets as possible**; when an
  applet needs a syscall WASI lacks, look for a browser-side shim that covers it (e.g. exec/fork → run another
  BusyBox instance on the same in-memory FS via a host import; identity → /etc/passwd in the FS; uname/nproc/df →
  host values) and include it; **every included applet must have its own passing test case**. Be very thorough with
  testing for this app and for all apps. Leave out only what cannot work in a browser tab (networking, mount,
  process lists, full-screen tty apps).
- **Linux Terminal** (`terminal`, Software, **PC only — owner confirmed explicitly**) — **BUILT** (see below).
  BusyBox 1.38.0 (C, GPL-2.0) compiled by us to wasm32-wasi (`wasm/busybox/build.sh` → `src/wasm/bin/busybox.wasm`,
  ~525 KB, **130 applets**); runs in a Web Worker (`src/workers/terminal.worker.ts`). Runtime (`src/lib/terminal/`):
  `vfs.ts` in-memory FS (files, dirs, symlinks, hard links, /dev/null|zero|urandom|random|full|stdin|stdout|stderr),
  `wasi.ts` our WASI preview-1 host (output cap = SIGPIPE stand-in, 60 s per-program limit, tty vs pipe, stdin
  consumption tracking, fd-3 preopen fallback, `supertools.spawn`/`ncpu` host imports), `shell.ts` our shell (quoting,
  `$VAR ${…:-…} $(…) \`…\` $((…))`, globbing, pipes run stage by stage, all redirects incl. here-docs/strings,
  `&& || ;`, if/elif/else, for, while, until, case, `{ }`, `( )`, builtins cd pwd export unset read history clear type
  which help source sh exit break continue, `tar -z/-j` turned into pipelines), `system.ts` boot (/home/user, /etc/passwd
  + group, /bin symlinks for every applet). BusyBox shims (`wasm/busybox/compat.h`, `wasi_stubs.c`): exec/spawn → host
  runs another instance on the same FS (xargs, find -exec, env, nice, nohup, flock); identity (user, uid 0, host
  "supertools"); uname; nproc; chmod accepted without effect (WASI cannot store permissions); stat adds 755/644 bits;
  own realpath; dup2 via fd_renumber; setjmp/longjmp via wasm exception handling. UI (`src/tools/software/terminal.ts`):
  colour output, history, Tab completion, Ctrl+L, multi-line paste runs as a script, drag-drop upload, file panel with
  **Upload**, per-file **Download**, folder download as .tar, click-to-cd. Left out (cannot work in a browser tab):
  networking, mount, process lists (ps/top/kill), full-screen tty apps (vi, less, top). Tests:
  `tests/unit/terminal-applets.test.mjs` (**every applet has a known-answer case; the suite fails if one is added
  without**), `terminal.test.mjs` (shell), `busybox.test.mjs` (raw module under Node WASI), `tests/e2e/terminal.e2e.mjs`.

Removed by the owner from batch 3: Spin the Wheel, Tambola/Housie, Secret Santa, Scoreboard.

Rejected by the owner: Typing Speed Test, Tuner, Metronome, Discount Calculator, Unit Price Compare, News Shorts
(hourly AI news summaries — considered via GitHub Actions + llama.cpp; owner declined), Local AI / LLM tab and
Key-Sentence Summariser (in-browser llama.cpp/WebLLM with ~1.7B model — owner declined), Wallpapers (photo
wallpapers via Wikimedia Commons/NASA, or a procedural generator — owner declined), and from `docs/potentials.md` (Nov 16 2026): Chess Board + Analysis (Stockfish),
Python/JS Linter & Formatter (Ruff/Biome), Offline Translation (Mozilla Bergamot).
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
Camera (owner, Nov 16 2026: **on phones use the phone's camera, on PC use the webcam** — one "Use camera" button opens
the live camera with getUserMedia on both: phone front/selfie camera by default + "Switch camera" for the back camera;
PC webcam; oval face guide, 3-second timer, selfie view un-mirrored) or upload (on phones the picker also offers the
camera, `capture=user`). **Busy real-world backgrounds (house, furniture, walls, people) are fully replaced** by the
preset's required colour (segmentation + guided-filter matte), never just lightened. Background → pure
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

### Cartoonizer ("Prisma-like") — BUILT (`src/tools/cartoon.ts`, e2e `tests/e2e/cartoon.e2e.mjs`, 37 checks)
Two engines, picked with a "Filters | AI art styles" switch; tiles show live thumbnails of the user's photo / the style.
- **Filters** (own C in `imgproc.wasm`, instant): Cartoon (bilateral smoothing → DoG edge lines (Winnemöller, τ≈0.985)
  → k-means colours; settings: colours, ink lines, smoothing), Oil paint (Kuwahara; brush size), Watercolour (abstraction
  + pigment pooling at wash edges + paper fibres; no settings), Pencil sketch and Colour pencil (colour dodge + graphite
  shading in dark areas; stroke softness), Comic (posterise + 45° halftone dots + DoG lines; dot size). XDoG thresholding
  was dropped: it inked every pixel darker than ~75 % grey (black blobs), DoG lines ink only real edges.
  Filter sizes are tuned for ≤ 1000 px and scale with larger images (`scale` arg in C), so the full-size save
  (≤ 4000 px PC, ≤ 2400 px phone) looks like the 1200 / 900 px preview (e2e: 2400 px save vs preview, mean diff < 20).
- **AI art styles**: Magenta *arbitrary image stylization* (Ghiasi et al. 2017, Apache-2.0) on TF.js 4.22 in a worker
  (`src/workers/style.worker.ts`, wrapper `src/lib/style-transfer.ts`). Backend order: **WebGL** (GPU via
  OffscreenCanvas; `WEBGL_CONV_IM2COL` off — im2col of the last 9×9 conv needs a 13033² texture) → **WebAssembly**
  (`@tensorflow/tfjs-backend-wasm`, XNNPACK C++ → wasm, SIMD; files in `public/vendor/tfjs/`) → CPU. Software WebGL
  (SwiftShader/llvmpipe, e.g. headless or no GPU driver) is detected and skipped: WebAssembly is ~15× faster there.
  `#/cartoon?backend=wasm|webgl|cpu` forces one (diagnostic; the e2e suite checks WebGL and WebAssembly give the same
  picture, mean diff < 4). 8 built-in styles are **drawn procedurally at run time** (`src/lib/style-art.ts`, canvas 2D,
  deterministic PRNG — Night swirls, Mosaic, Stained glass, Cubist, Ink wash, Impressionist, Flames, Pop art; no
  copyrighted art shipped); "Use your own painting as the style" adds any image. **Strength** (default 70 %) blends the
  style vector with the photo's own (Magenta's interpolation; 0 % ≈ the photo). Size 512 / 1024 / 1600 px on PC
  (1024 default on a real GPU, 512 on CPU paths), 512 / 768 on phones; the result is saved as shown (JPEG).
  "Hold to compare" shows the original. Measured: 512 px ≈ 6 s on WebAssembly (sandbox CPU).

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
Sub-tabs: **Scientific** (own parser: + − × ÷ ^ √ ∛ ! nPr nCr %; "a + b%" / "a − b%" add or take off b % of a like phone/Google
calculators (200 + 10% = 220), b% elsewhere = b/100; sin/cos/tan + inverses + hyperbolic,
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

**As built after the Nov 2026 bug hunt** (Software, PC only; `src/tools/text.ts` json + regex, `src/tools/software/dev1.ts`
base64 / urlenc / epoch / uuid / color / jwt, `src/tools/software/data2.ts` xml / json2types / jsondiff / mdtable / mockdata;
unit `tests/unit/devdata.test.mjs`, references `tests/fixtures/devdata/reference.json`):
- `json`: the formatter changes white space only (devcore-json): member order, duplicate keys (pointed out) and the
  spelling of numbers and strings are kept; indent 2 / 4 / tab, minify, sort keys; a worded message with line, column and
  "Show it" for every mistake; accepts exactly what JSON.parse accepts.
- `regex`: the browser's RegExp in a worker, ended after 2 s (runaway patterns); flag mistakes named; named groups.
- `base64` (devcore-enc): text or file ⇄ Base64 / URL-safe / data: URL; decoding takes messy input (no padding, line
  breaks, %3D, data: URLs); binary results are recognised by their first bytes, shown as hex and saved under a fitting
  name; long output is cut on screen only.
- `urlenc`: component (optionally form style), whole URL (the browser's URL parser: no double encoding, Punycode), lenient
  decode (Windows-1252 escapes, stray %, "+" = space only in queries, "Decode again" for double encoding); URL parts.
- `epoch`: seconds / ms / µs / ns by the number of digits or chosen; group separators, fractions, 1.7e9; ISO 8601,
  RFC 2822 and dd/mm/yyyy [hh:mm[:ss]] (day first) dates; says how the input was read; picker in step both ways.
- `uuid`: v4 / v7 (v7 strictly increasing); the switches rewrite the shown IDs; inspector: version, variant, time of
  v1 / v6 / v7, clock sequence, node, nil / max; accepts braces, urn:uuid:, no hyphens.
- `color`: every box reads any CSS colour (hex 3 / 4 / 6 / 8, rgb(), hsl(), hwb(), oklch(), oklab(), names; alpha kept,
  Opacity slider); OKLCH outside sRGB is mapped as CSS Color 4 §13.2 (mathcore `m_color` op 5) with a note; printed
  HSL (1 decimal) and OKLCH (2 / 5 / 2 decimals) give every 8-bit colour back exactly (all 16.7 M checked once).
- `jwt`: "Bearer …", quotes and wrapped tokens; claims printed losslessly (devcore-json); iat / nbf / exp / auth_time in
  UTC, local time and words; expired / not valid yet / never expires; exp as a string or in milliseconds noted; alg
  none, empty or damaged signature, JWE (5 parts), payloads that are not objects or not JSON.
- `xml`: devcore-xml lays out elements that contain only elements and leaves everything else as typed (declaration,
  DOCTYPE, entities, CDATA, text, xml:space); the browser's DOMParser checks well-formedness and runs XPath (prefixes
  from the document, `xml:` and `d:` for the default namespace); files are decoded as they declare (BOM / encoding=).
- `json2types` (devcore-j2t): root lists and plain values are type aliases; Go and Rust map every key exactly (tags,
  serde rename; keys encoding/json cannot tag are marked); Java = one public record with the others nested; Java and
  Python keep keys that are valid names and rename the rest with a comment; optional vs nullable; int64 / uint64 /
  float / BigInteger from the digits; type names never shadow built-ins; notes say what the reader must know.
- `jsondiff` (devcore-jsondiff): RFC 6902 patch + table of rows with both values; lists aligned by equal elements and
  by `id`; numbers by value, never rounded; Swap; download.
- `mdtable`: grid editor ⇄ GFM table; imports CSV / TSV / semicolons (separator found by sheet.wasm) or a Markdown
  table (also inside other text); `<br>` for line breaks; padding by display width (CJK, emoji = 2); the editor shows
  the first 200 rows of a big table.
- `mockdata`: 22 field types (India-first); ranges validated and explained (swapped, not a number, dates as
  yyyy-mm-dd or dd/mm/yyyy); 53-bit uniform integers; unique column names; quoted SQL names; same rows in every format.

### Audio Recorder — BUILT (`src/tools/audio.ts`, shared UI `src/lib/audioui.ts`; e2e `tests/e2e/audio.e2e.mjs` 21)
Record the mic (MediaRecorder: Opus/WebM, AAC/M4A on Safari; 128 kbps) with pause/resume, big timer, live level meter
with clip mark and a scrolling waveform; microphone picker; "voice clean-up" (browser echo/noise/AGC) on by default,
optional stereo; Screen Wake Lock while recording (phones). Or open any audio/video file the browser can decode.
Waveform trim editor (peaks from audio.wasm; drag either edge, or type Start/End seconds; "Whole recording"), play
the selection with a playhead. Clean up: normalise (loudest point to −1 dB) and 0.3 s fades. Save as **MP3** (own
LAME 4.0 wasm: 64/128/192/320 kbps CBR or VBR V2, with the LAME/Info tag), **WAV** 16-bit (own C), or **Original**
(the recorded codec cut by packet copy with mediabunny — no re-encoding, and MediaRecorder's missing duration is
fixed; WAV/FLAC originals keep their real sample rate). Volume/fade changes need MP3 or WAV (explained in a toast).
`recorder()`, `waveEditor()`, `savePanel()` and `copyTrim()` are reused by Noise Remover, Pitch & Speed and STT.

### Video Compressor — BUILT (`src/tools/video.ts`; e2e `tests/e2e/video.e2e.mjs` 16)
Engine: the browser's own encoders/decoders through **WebCodecs** (compiled C++ in the browser, hardware where
available) + **mediabunny** for demux/mux (MP4 out, fast-start). A pure-wasm encoder (x264/libaom/ffmpeg.wasm) is
10–50× slower on phones and needs no less code; WebCodecs is the standard, hardware-accelerated path, so it is the
engine here (§3a). Open MP4/MOV/WebM/MKV → info (size, length, resolution, fps, codecs, bitrates) + preview.
"By quality" (High/Medium/Small = 0.10/0.06/0.035 bits per pixel per frame, AV1 × 0.65, never above 90 % of the
original bitrate) or "To a size" (WhatsApp 16 MB, Email 25 MB, Discord 10 MB, 8/50 MB, custom): bitrate = target ×
0.96 / duration − sound; if the encoder overshoots it re-runs up to twice at a scaled bitrate; impossible targets are
explained. Resolution caps by the short side (2160…240p, even sizes), fps cap 30/24, H.264 (plays everywhere) or AV1
(offered only if the browser can encode it). Sound: kept by packet copy when MP4 accepts it (AAC/MP3/Opus — no quality
loss; Chromium on Linux has no AAC encoder), re-encoded (64 kbps) or removed; Vorbis from WebM is re-encoded. Result:
size + % saved, player, Download/Share; cancel. Tests: clip.mp4 (H.264/AAC) → smaller, avc1 + mp4a copied, 640×360,
3 s, decoded frame at 1 s matches the original; 240p no sound (426×240, 1 track); 150 KB target; impossible target;
AV1 (av01) frame match; WebM VP8/Vorbis → H.264 + re-encoded sound; phone layout.

### Slideshow Maker — BUILT (`src/tools/slideshow.ts`; e2e `tests/e2e/slideshow.e2e.mjs` 15)
Photos (our loader: HEIC, EXIF orientation, downscaled to the output size) + optional music → MP4. Frames composed
on an OffscreenCanvas at 30 fps: crossfade (≤ 0.8 s, fade in/out from black), gentle zoom/pan (Ken Burns, on by
default), "Fill" (cover) or "Fit" with a blurred background (a 24 px copy stretched — works on Safari without
`ctx.filter`); shapes 16:9 / 9:16 (phones default) / 1:1 / 4:5 at 1080p or 720p; 1–10 s per photo or "fit to the
music". WebCodecs via mediabunny `CanvasSource` (H.264, else VP9/AV1, QUALITY_HIGH, key frame every 2 s); music looped
or cut to the length with 0.4 s fade-in / ≤ 2.5 s fade-out (our audio.wasm), AAC or Opus (no AAC encoder on Linux
Chromium). Reorder (◀ ▶), remove, live preview with music, progress + cancel, Download/Share. Tests: 3 real photos +
660 Hz MP3 → H.264 1280×720, 6 s, music track; the photo on screen at 1/3/5 s is the right one (diff 6–11 vs 57–75 for
the others); reorder; 9:16 → 720×1280; fit to music → 2 s; music frequency; phone defaults to 9:16.

### Noise Remover — BUILT (`src/tools/noise.ts`, worker `src/workers/noise.worker.ts`; e2e `tests/e2e/noise.e2e.mjs` 11)
**Xiph RNNoise 0.2** (recurrent network trained on speech + noise, C, BSD-3) built by us → `rnnoise.wasm` (5.6 MB, the
default model's weights; fetched only when the tab cleans something). Pipeline in one worker: our audio.wasm resamples
to 48 kHz → RNNoise in 10 ms frames (its 2-frame latency removed, so the output lines up with the input) → back to
the file's rate. Strength = wet/dry mix (0 % = original), voice-activity share reported, A/B button ("Hear the
original"), waveform trim, MP3/WAV. Open a file or record (recorder with the browser's own noise suppression off).
Test: LibriSpeech sample + seeded white noise at 5 dB SNR (`tests/fixtures/speech/`, `scripts/make-speech-fixtures.mjs`)
→ SNR against the clean reference rises from 5.6 to 11.6 dB; strength 0 reproduces the input; 3.00 s trim; MP3;
microphone path; phone layout. Unit `tests/unit/rnnoise.test.mjs` (10: white noise −20 dB+, speech kept within 6 dB,
pauses −15 dB+, zero lag, mix, stereo).

### Pitch & Speed — BUILT (`src/tools/pitch.ts`; e2e `tests/e2e/pitch.e2e.mjs` 11)
Open any audio/video file → speed 0.5–2× (keeps pitch: WSOLA, own C) and pitch −12…+12 semitones (keeps length:
WSOLA by tempo/ratio then Kaiser windowed-sinc resampling by 1/ratio), processed in the audio worker 350 ms after a
slider moves; presets (Practice 75 %, Half speed, 1.25×, Podcast 1.5×, ±1 tone, Nightcore, Slowed, Deep voice,
Chipmunk); result on the waveform editor (trim, play); MP3 192 kbps default / WAV. Tests: 440 Hz stereo WAV →
1.5× = 1.333 s at 440 Hz, +7 st = 659.3 Hz, Deep voice −5 st with the length kept, MP3 length, stereo balance.
Tests: fake microphone (pause excluded from the length), and a generated 440 Hz / silence / 880 Hz stereo WAV:
exact 1.00 s trims, the 880 Hz part found by zero crossings, channel levels kept, MP3 decoded by the browser,
normalise peak −1 dB, fade envelope.

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
Tesseract 5 LSTM (tesseract.js-core wasm), **languages English, French, Spanish, German** (owner decision Nov 16 2026:
"don't bother about Hindi"; `@tesseract.js-data/{eng,fra,spa,deu}` 4.0.0_best_int, MIT, vendored) + "Mixed" (all four).
`cacheMethod: 'none'` so models are never stored in IndexedDB (stateless). Image upload, camera, or paste from
clipboard; optional pre-clean (imgproc doc enhance, grey); low-confidence words highlighted; copy / download `.txt`.

### Photo Dictionary (`photodict`, Text, **Mobile only** — owner request, owner chose the name) — BUILT
(`src/tools/photodict.ts`, engine `src/lib/dictionary.ts`, ranking `wasm/textcore/rare.c`; e2e `tests/e2e/photodict.e2e.mjs`
43 checks on a photographed-page fixture; unit `tests/unit/rare.test.mjs` 56 checks.) **As built:**
- Data (`public/data/dict/`, **committed**, 38 MB raw / 11 MB gzip, rebuilt by hand with `node scripts/build-dict.mjs`):
  `freq.txt` = wordfreq 3.1.1 `large_en` (311,698 words, Zipf×10 buckets; wheel SHA-256 pinned from PyPI);
  `<xx>.json` / `<xxx>.json` = English Wiktionary entries from kaikki.org (streamed, ~3.4 GB JSONL; SHA-256 + date of the
  input recorded in `meta.json`, which also lists the shard files and the 3-letter `split` prefixes) for every word
  wordfreq knows + the lemmas their forms point to (145,851 words, 1,305 shards ≤ 370 KB). Kept per entry: part of
  speech, US IPA, ≤ 5 senses (current before obsolete/archaic, usage labels, one short example), form-of links
  ("geese" → goose, "colour" → color). Proper names, affixes, symbols, phrases are left out. Committed because kaikki
  updates the file in place (a pinned hash would break every build) — regenerate deliberately.
  (kaikki.org was added to this environment's network allowlist for the build; it is never contacted at run time.)
- Ranking (C): tokens (Latin letters, ’ apostrophes, hyphens; possessives stripped; a line-break hyphen is joined when
  a half is not a word or the joined word is at least as common, tolerating OCR noise at the margin), lemmas for
  unknown regular inflections (−s/−es/−ies/−ed/−ing/−er/−est/−ly, doubled consonants, one level of recursion), stop
  words and tokens < 3 letters or mixed with digits dropped, names = always capitalised + capitalised mid-sentence.
  Candidates with Zipf < 4.5, rarest first (unknown to wordfreq = rarest), then count, then first appearance.
- Lookup (TS): bundled entry → if it is only an inflection, its lemma's card with the note ("plural of goose"); an
  inflection of a common word ("rode" → ride) is skipped as common; capitalised names not in the bundle are skipped
  ("Names skipped" list); others go online (≤ 25 per photo, rarest first, 5 s timeout, session cache).
- UI: "Use camera" (back camera viewfinder + Snap; sticky bottom bar on phones) or "Choose a photo"; "Photo of a
  screen" adds a moiré blur; document clean-up always; cards in **Literata** (OFL, self-hosted) with rarity, part of
  speech · IPA, senses + examples, "More meanings"; Not found / Names skipped lists; recognised text with every word
  tappable (lookup card, works for common words too); "Share list" (Web Share, else copy); attribution line.
- Not built from the original notes: the Open English WordNet fallback — the bundle already covers every word wordfreq
  knows and rarer words go online (WordNet's GitHub releases are also unreachable from the dev sandbox).
**Original design notes:**
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

### FFmpeg (PC) — BUILT (`src/tools/ffmpeg.ts`; e2e `tests/e2e/ffmpeg.e2e.mjs` 22)
ffmpeg.wasm 0.12 single-threaded core = **FFmpeg 5.1.4** (libx264/x265, libvpx, LAME, Opus, Vorbis, Theora, WebP,
freetype/libass, zimg; GitHub Pages cannot send COOP/COEP, so no multi-threaded core; no service worker) in its own
worker, loaded on first use (≈ 31 MB) and terminated when the tab is left. Inputs are **mounted with WORKERFS** (read
in place, not copied into memory); FFmpeg probes the streams on open. 16 tasks, each building an argument list shown
as the equivalent command line with the real file names (copyable; "Edit as arguments" switches to the raw box):
convert (MP4/MOV H.264+AAC, WebM **VP8**+Opus, MKV copy, MP3, M4A, WAV, FLAC, OGG Opus, GIF), extract audio (copy
into the right container, or MP3/WAV), remove audio, trim (fast copy with the MP4 edit list, or exact re-encode;
`-ss` + `-t`), compress (CRF 18–35, speed preset), resize (`scale=-2:H,setsar=1`), fps, rotate/flip, centre crop to a
shape, GIF (palettegen/paletteuse), add audio to video, EBU R128 loudness (−16 LUFS), speed (setpts + chained atempo),
frames (PNG/JPEG → zip), audio → MP4 (picture + sound with `-t` = probed length, animated waveform, or M4A), own
arguments (in1.ext / in2.ext, last word = output). Non-zero exit = failure: FFmpeg's own error line is shown and the
log opens. Stop = terminate the worker. **Known limits of this core:** libvpx-vp9 and libx265 wait forever for
threads (so presets use VP8/x264 and the raw box warns); FFmpeg 5.1 ignores input `-to` and `-shortest` with a looped
picture (handled with `-t`). Replacing it with our own build of current FFmpeg stays on the §3a audit list.
Tests: clip.mp4/tone.wav/tone.mp3 → WebM plays, AAC copy, MP3 440 Hz, no-sound copy, fast trim ≈ 1 s and exact 1.00 s,
426×240, rotate 360×640, square crop, GIF89a 320 px, 2× = 1.5 s, 3 frames zipped, merge 660 Hz, raw hflip, bad filter
reported, loudness changed, waveform 1280×720, picture + sound 2 s.

### PDF → EPUB (PC) — BUILT (`src/tools/epub/epub.ts`, engine `src/lib/pdf2epub.ts`; e2e `tests/e2e/epub.e2e.mjs` 27)
As built: MuPDF structured text (lines with font size/weight; raster image blocks) → pieces of a justified line on
the same baseline are joined → running headers/footers = top/bottom-10 % lines whose first 12 letters repeat on ≥ 40 %
of pages (page numbers and OCR slips like "VICKSBUEG" still match) + bare page numbers → figures = raster images
(except a full-page scan under an OCR layer) ∪ ink found outside the text boxes on a 1.5 px/pt render (imgproc
`p_ink_regions`: dilation + connected components) → reading order + columns by XY-cut (textcore `t_xycut`: vertical
gutters first so a column is read top to bottom; otherwise one split at the widest horizontal gap, recursively; first
vertical split numbers columns) → paragraphs by the page's line pitch, indents, short last lines and font-size changes
after a sentence end; headings by size (≥ 1.18 × body) or short bold lines; de-hyphenation (keeps "e-reader") → one
XHTML per PDF page (`page-break-before`), "Page N · Column K" labels, figures cropped from a render where a column is
as wide as the screen (Paperwhite 1236 px / Scribe 1860 px), greyscale MozJPEG by default; pages with no text →
full-page picture; garbled text (private-use / U+FFFD) → that column as a picture; "Columns as pictures" mode.
EPUB 3 (nav + NCX, `dcterms:modified`, urn:uuid), mimetype stored first, zipped with fflate. Tests: a generated
two-column paper (`scripts/make-paper-pdf.mjs`) and pypdf's OCR'd Vicksburg pages; every XHTML parsed as XML in the
browser and the EPUB re-opened by MuPDF. (epubcheck is Java and not available offline here.)
Original notes: Kindle Paperwhite now, Scribe later. Requirements: preserve **page breaks**; detect **columns** in technical
PDFs, split them vertically, extract text and figures per column in reading order, and label sections
**"Page N · Column K"**. Pipeline per page: PDF.js text items (positions, font size) → render page →
mask text → connected "ink" regions = figures (raster + vector diagrams, tables) cropped as images →
recursive XY-cut on whitespace for columns (handles full-width title/abstract above two columns) →
paragraphs (line spacing), de-hyphenation, heading detection by font size, header/footer/page-number
removal (repeated across pages) → one XHTML file per PDF page. Fallbacks: garbled text (bad ToUnicode)
or math-heavy column → that column as image; scanned page → page image. Modes: Reflow (default) and
Column images. EPUB 3 + NCX (EPUB 2 fallback), validated with epubcheck in development, compatible with
Send-to-Kindle. Image width presets: Paperwhite 1236 px / Scribe 1860 px; greyscale option.

### Screencast (PC) — BUILT (`src/tools/screencast.ts`; e2e `tests/e2e/screencast.e2e.mjs` 13)
Chrome on Windows/Linux. "Screen, window or tab" (Chrome's picker; own tab excluded; surface switching allowed) or
"An area": choose a screen, drag a rectangle on the live preview (a page cannot draw on the desktop); the rectangle is
cut from every frame live with WebCodecs `VideoFrame` `visibleRect` (MediaStreamTrackProcessor → Generator; canvas
`captureStream` fallback). Sound: the tab/screen's shared audio (Windows: system audio with "Entire screen"; Linux:
choose the "Monitor of …" input), optional microphone mixed in with Web Audio. MediaRecorder: MP4 H.264 (+ AAC where
the browser has it, else Opus) or WebM VP9/Opus, 8 Mbit/s, 30/60/15 fps; 3-second countdown, pause/resume, stops when
sharing ends. Recordings kept in memory are remuxed by mediabunny (packet copy) so they get a duration/seek index;
"Save straight to a file while recording" streams chunks to disk with File System Access (long recordings).
X11/Wayland note from `src/linux.ts`. Tests (Chromium's fake picker): MP4 H.264 ≈ 2.2 s; pause not counted; area =
half the screen; WebM with a finite duration; microphone track; streaming to a (stubbed) file.

### Screenshot (PC) — BUILT (`src/tools/screenshot.ts`; e2e `tests/e2e/screenshot.e2e.mjs` 12)
Share once (Chrome's picker: screen, window or tab; own tab excluded; optional mouse pointer) → "Take screenshot"
now or after 3/5/10 s. With a delay, a small always-on-top **Document Picture-in-Picture** window counts down with
"Snap now" and "Cancel" (the owner minimises the browser: Win+↓ / Super+H); it closes itself 250 ms before the
frame is grabbed. The frame is read at full resolution (MediaStreamTrackProcessor → VideoFrame; `<video>` fallback).
Editor: crop box (shared `cropBox`), **PNG** (our OxiPNG), **JPEG** (our MozJPEG, q 90), **Copy** to the clipboard
(PNG); gallery of this visit's shots (click to reopen). The share stays alive for more shots ("Stop sharing" ends
it). A web page cannot screenshot silently, minimise the browser or see the active window (said in the tab).
Tests: full-size PNG, JPEG, cropped PNG = 84 %, clipboard PNG, 3 s delay, PiP "Snap now" (< 1.5 s) and "Cancel",
gallery, stop sharing.

### YouTube Clip (PC) — BUILT (`src/tools/youtube.ts`; e2e `tests/e2e/youtube.e2e.mjs` 13)
Inputs: "Two links" (YouTube's Share → Start at… / right-click → "Copy video URL at current time" at the start and
at the end) or "One link + times" (1:02, 1:02:03, 62, 1m2s). Links: watch?v=, youtu.be, shorts/, live/, embed/,
m./music. hosts, `t=` / `start=` / `#t=`; different videos and end ≤ start are refused.
1. **yt-dlp command** (original quality): `yt-dlp --download-sections "*START-END" -f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]"
   --merge-output-format mp4 -o "%(title)s [start-end].%(ext)s" URL`, optional `--force-keyframes-at-cuts` (exact) or
   `-x --audio-format mp3` (sound only); install hints for Windows (winget), Linux (pipx) and Android (Termux).
2. **Record in this browser**: nothing is requested from YouTube until "Load the player"; then the privacy-enhanced
   `youtube-nocookie.com/embed/ID?enablejsapi=1&start=…` player (owner-approved `frame-src`; `connect-src` stays
   'self'; no YouTube script in our page). It is driven with the IFrame API's postMessage protocol ("listening"
   handshake → onReady/infoDelivery with currentTime/playerState; commands mute, seekTo, playVideo, pauseVideo,
   unMute); embedding errors 101/150/152 are explained. "Record clip": the owner shares THIS tab (preferCurrentTab),
   Region Capture (`CropTarget.fromElement(player)` + `track.cropTo`) crops to the player, the player seeks to the
   start (muted), then records until the player reports the end time; remuxed with mediabunny; Download. If
   something other than this tab is shared, the result says it is NOT cropped.
Tests: link/time parsing known answers, exact yt-dlp command, sound-only, refusals, nothing loaded before "Load the
player"; recording with a routed fake player (Playwright serves youtube-nocookie.com): commands received, 2→5 s ≈ 3 s.
Headless Chromium's display capture is a synthetic monitor, so Region Capture itself cannot run in the tests (the
reported crop state is checked).

### Linux X11 vs Wayland (owner requirement: auto-detect)
No web API reports the display server and Chrome's UA says `X11; Linux` on both, so `src/linux.ts` detects it:
1. **Passive** (instant): Wayland never tells clients their global window position, so Chrome reports
   `screenX == screenY == 0` there. Non-zero position ⇒ **X11** (or Chrome under XWayland, which behaves as X11).
   Zero ⇒ **Wayland (likely)** — a maximised X11 window at the top-left corner can also be 0,0.
2. **Active** (one click, "Confirm"): open a tiny popup, `moveTo(120, 120)`, read its `screenX`. X11 honours
   the move; Wayland ignores it. Result is kept in memory for the session only.
Implemented in `src/linux.ts` (`linuxBanner()`). Used by Screencast, Screenshot and YouTube Clip: they show "Detected: X11 / Wayland", and on Wayland explain that
the desktop portal (GNOME/KDE) shows its own picker after Chrome's, keep the capture alive for repeated shots
(avoids repeated portal prompts), and show the right minimise shortcut. If capture fails on Wayland they point
to `chrome://flags/#enable-webrtc-pipewire-capturer` and the `xdg-desktop-portal` packages.

---

## 3a. Engine policy (owner rule) and engine inventory

**Rule (owner, latest wording 18 Nov 2026 — STANDING RULE #1):** for every utility, prefer a WebAssembly engine over a
JavaScript library. Order of preference:
1. An existing, tried-and-tested WebAssembly module that is already out there (a famous, good one) — the upstream
   project's **official** wasm build (e.g. SQLite's, Artifex's MuPDF) or a widely used third-party build, at its
   latest stable version. Look for one first. **If it does not cover every feature asked for the utility it is
   still used for what it covers**, and the missing features are added beside it: (a) a supplementary WebAssembly
   module of our own, (b) an existing JS/TS library, (c) our own JS/TS (owner's tweak of 18 Nov 2026). A module
   that breaks a hard requirement of §1 or has no open-source licence is not used.
2. If there is none at all: our own wasm build from open-source code — the upstream C/C++/Rust source (verified by
   checksum/signature) or our own C / Rust on top of it; functionality that exists only as JavaScript/TypeScript is
   made into a WebAssembly module here (a port to Rust / C, or compiling it) when that is possible and fits the tool.
3. A JavaScript/TypeScript library as it is — **only when that is not doable** in this framework or for the features
   needed. **Record why** (table "JavaScript-only components" below).
Simple UI logic (calculators, timers, text tools) is plain TypeScript. Everything is vendored and served
from this site — **nothing is loaded from the internet at runtime**. Never violate a licence: record every
third-party component and its licence in §6. Because of AGPL (MuPDF) and GPL (FFmpeg) the repository must
stay **public** (the source of the deployed site is then available to every user, satisfying both).

| Engine | Language → wasm | Built by | Used by |
|---|---|---|---|
| libsodium 1.0.20 + own MD5/SHA-1/SHA-3/CRC-32 + OpenBSD bcrypt + own CSPRNG helpers (shuffle, sampling, UUID v4/v7 — v7 values always increase: RFC 9562 §6.2 method 2, a random step inside one millisecond, clock steps back of up to 10 s tolerated) + USODIUM1 header | C | **us** (`wasm/crypto`) | sodium, sharelink, hash, passwords, random tools, uuid, mock data, line shuffle |
| imgproc (adjustments, resize, lossless orient/crop, filters, matting, warp + homography, doc enhance) | C (own code) | **us** (`wasm/imgproc`) | image tools, scanner, passport, cartoon |
| metacore (EXIF → JSON, lossless metadata strip JPEG/PNG/WebP, JPEG DPI, image sniffing) | C (own code) | **us** (`wasm/metacore`) | exif, image loading, passport/formphoto DPI |
| BusyBox 1.38.0 (130 applets) + compat shims | C | **us** (`wasm/busybox`) | terminal, bc console |
| jq 1.8.2 (+ oniguruma) | C | **us** (`wasm/jq`) | jq |
| CPython 3.14.8 (+ zlib 1.3.2; stdlib as .pyc in python314.zip with tzdata 2026.6) **+ our changes** (§5.1m: recursion guard for a browser's two stacks, lru_cache in Python, pbkdf2_hmac fallback, socket stand-in + asyncio loop without sockets, local time from the host) | C | **us** (`wasm/python`, python.wasm 7 MB + python314.zip 5.4 MB, loaded on the first Run; run by our WASI host `src/lib/terminal/wasi.ts` in `src/workers/python.worker.ts`) | python |
| Graphviz 14.1.2 (cgraph, gvc, dot/neato/fdp/sfdp/circo/twopi/osage/patchwork, core renderers) + Expat 2.9.0 | C / C++ | **us** (`wasm/graphviz`, 1.6 MB / 0.54 MB gz, run in `src/workers/graphviz.worker.ts`) | graphviz |
| audio: **LAME 4.0** libmp3lame (MP3 encoder) + own C (WAV writer, waveform peaks, levels, gain/fades, Kaiser windowed-sinc resampler, WSOLA time stretch, tempo × pitch) | C | **us** (`wasm/audio`) | audio (and tts, stt, noise, pitch) |
| rnnoise: Xiph **RNNoise 0.2** (+ default model) + glue (48 kHz frames, latency compensation, wet/dry mix, VAD) | C | **us** (`wasm/rnnoise`) | noise |
| espeak: **eSpeak NG 1.52.0** (+ English phoneme tables and dictionary compiled from the same release, linked in, served to its fopen/stat from memory) + glue (IPA for Kokoro, piper-phonemize-style sentences) | C | **us** (`wasm/espeak`) | tts (stt hints later) |
| whisper: **whisper.cpp 1.8.3** + ggml CPU backend (upstream unmodified) + own threadshim.h (std::mutex/std::thread/fstream for zig's thread-less libc++), backend-reg.cpp (static CPU-only registry), cxxabi_stubs.c (throw = abort), glue.cpp | C / C++ | **us** (`wasm/whisper`) | stt |
| textcore: Myers diff, tool-search ranking, word frequency, rare-word ranking (tokeniser, lemmatiser, wordfreq hash table), XY-cut reading order | C (own code) | **us** (`wasm/textcore`) | diff, search box, word counter, photodict |
| sheet: calamine 0.38 (read .xlsx .xlsm .xlsb .xls .ods) + rust_xlsxwriter 0.102 (write .xlsx) + csv 1 + serde_json | Rust | **us** (`wasm/sheet`, crates.io sources verified by `Cargo.lock`, target wasm32-wasip1) | sheet |
| svgo: **OXVG 0.0.9** (Rust port of SVGO's plugins; lightningcss for `<style>`) + our glue: DOCTYPE / entities allowed, nesting limit 256, **our own safe preset** (OXVG's `Jobs::safe()` is not safe), `sv_diff` (do two rasters look alike? — the tab renders every result next to its original and falls back to the safe result when the full optimisation changed the picture) | Rust | **us** (`wasm/svgo`, crates.io via `Cargo.lock`, opt-level z, 4.9 MB / 1.3 MB gz, loaded with the first SVG; unit `tests/unit/svgo.test.mjs`, hazard drawings `tests/fixtures/svg/hazards.json`) | svgo |
| keys — the **supplement** to hash-wasm for the key tabs (owner's tweak of 18 Nov 2026: what the existing module does not cover): lenient Base32 secrets, HOTP counters and truncation; checked parameters, random salts, PHC strings for scrypt / PBKDF2 and the reader of pasted hashes; RustCrypto **argon2** for Argon2 version 1.0 hashes (v=16 or no version, keyid / data), which hash-wasm does not read; RustCrypto **ssh-key** (OpenSSH Ed25519 generation), **aes + ctr + bcrypt-pbkdf** and our own OpenSSH wire reader (inspect Ed25519 / RSA / ECDSA / DSA keys, encrypted private keys, authorized_keys / known_hosts lines); API keys | Rust | **us** (`wasm/keys`, 0.31 MB; no existing WebAssembly module makes or reads OpenSSH key files) | totp, pwhash (with hash-wasm); sshkey, apikey |
| zxcvbn 3.1.1 (Rust port of Dropbox's estimator + its word lists) **+ our four fixes** (`wasm/zxcvbn/zxcvbn-fixes.patch`, applied by build.sh to the SHA-256-checked crate: ALL-CAPS words with a digit, repeats taken for sequences, single-character l33t words, keyboard-walk degree divided in integers) | Rust | **us** (`wasm/zxcvbn`, 2.2 MB, loaded with the first password; guesses + scores equal the Python reference for 304 passwords — `tests/unit/zxcvbn.test.mjs`) | pwstrength |
| formats: **serde_yaml_ng** (unsafe-libyaml = libyaml translated to Rust), **toml**, **jsonschema** 0.61 (no network/file resolvers) + own schema inference | Rust | **us** (`wasm/formats`, two modules: formats-yaml 0.42 MB, formats-schema 2.7 MB) | yaml, jsonschema |
| devcore: ipnet (CIDR), croner + chrono (cron; zone offsets from the browser's Intl via an `env.tz_offset` import, so no tz database), **own port of npm's semver** (`semver_npm.rs`: the package's range / comparator / inc logic with its own regular expressions on regex-lite — the nodejs-semver crate gave different answers), **own Unicode-aware glob matcher** (`globm`; globset matches bytes), **own unified-diff reader / applier** (`patchm`: offsets, white space, fuzz, like GNU patch; diffy refused most real patches), data-encoding + bs58 + own Ascii85/Z85 (long inputs go through data-encoding in pieces: it refuses 8 MiB and more on a 32-bit target), **own protobuf, MessagePack and CBOR readers** (`bin.rs`; rmpv and ciborium could not show CBOR `undefined` / simple values / long bignums or MessagePack's unused 0xc1, and reported errors as Rust debug text), x509-parser + sha1/sha2 (+ own PEM / PKCS #7 reader), sqlformat, own hex dump + search, **own lossless JSON reader / formatter** (`jsonfmt.rs`: changes white space only — member order, duplicate keys and number spelling kept; worded errors with line / column; JSON.parse → JSON.stringify reordered keys, dropped duplicates and rounded big numbers), **own JSON diff** (`jsondiff.rs`, RFC 6902 on that reader: lists aligned by equal elements (LCS) and records by `id`, numbers by value and never rounded), **own XML formatter** (`xmlfmt.rs`: re-indents elements that hold only elements, everything else byte-for-byte — declaration, DOCTYPE, entities, CDATA, text; the DOM round trip lost or rewrote all of these), **own JSON → types generator** (`j2t.rs`: TypeScript / Go / Rust serde / Java records / Python dataclasses; the e2e suite compiles its output with tsc, go, rustc, javac and python; crates unicode-ident (MIT / Apache-2.0 + Unicode-3.0) for Python identifiers and unicode-general-category (Apache-2.0) for what Go's struct tags accept) | Rust | **us** (`wasm/devcore`, crates.io via `Cargo.lock`, wasm32-wasip1; one `dc_call(op, input)` entry; **one module per tab** via Cargo features → `devcore-<feature>.wasm`, 67–650 KB) | cidr, x509, cron, semver, glob, patch, sqlfmt, hexview, baseenc, bindecode, base64 (devcore-enc), json + jwt (devcore-json), jsondiff, xml, json2types (devcore-j2t) |
| cmark-gfm 0.29.0.gfm.13 (GitHub Flavored Markdown) | C | **us** (`wasm/markdown`, source from the PyPI `cmarkgfm` sdist, SHA-256 pinned) | markdown |
| libyaml 0.2.5 + toml++ 3 | C / C++ | **us** (`wasm/formats`) | yaml |
| MuPDF 1.28 | C | Artifex (official `mupdf` npm) | all PDF tools, PDF → EPUB |
| hash-wasm 4.13.0 (hand-tuned C → wasm, one small binary per algorithm, embedded in the package; streaming; HMAC over any of its hashes; Argon2, bcrypt, scrypt, PBKDF2) | C | Dani Biró (`hash-wasm` npm, ~10 M downloads a month) — wrappers `src/lib/hmac.ts`, `src/lib/totp.ts`, `src/lib/pwhash.ts`; only the algorithms a tab uses are bundled into its chunk, loaded with the tab's first result | hmac (all of it), totp (the HMAC), pwhash (Argon2id / i / d, bcrypt, scrypt, PBKDF2) — replaced RustCrypto builds of ours in Nov 2026 (`docs/WASM-AUDIT.md`) |
| ONNX Runtime Web 1.31 (CPU/WebAssembly, SIMD) | C++ | Microsoft (official `onnxruntime-web` wasm build) | tts (Kokoro, Piper) |
| SQLite 3.54 | C | SQLite project (official `@sqlite.org/sqlite-wasm`), run in `src/workers/sqlite.worker.ts` (terminated on leave) | sqlite |
| FFmpeg | C | ffmpeg.wasm project | ffmpeg |
| MozJPEG, libwebp, OxiPNG | C / Rust | jSquash (Squoosh codecs) | image encoders |
| libheif + libde265 | C++ | libheif-js | heic |
| Tesseract 5 | C++ | tesseract.js-core | ocr |
| zxing-cpp | C++ | zxing-wasm | qr, barcode, scan |
| libarchive | C | libarchive.js | unzip |
| MediaPipe Tasks (TFLite) | C++ | Google (official) | passport, bgremove, redact |
| Browser-native C++ (WebCodecs, WebCrypto, Web Speech, MediaRecorder) | — | the browser | video (H.264/AV1 encode + decode, hardware-accelerated), audio recorder, tts, screencast, pbkdf2 |

JavaScript-only components (no C/C++ equivalent exists for the job):
| Library | Why JS | Used by |
|---|---|---|
| own `src/lib/curl.ts` (shell word splitting for bash and cmd.exe, curl option table, code generators) | no tried-and-tested WebAssembly build of a curl command-line parser exists (curl's own parser is tied to libcurl and its tool's globals); it is string parsing of one short line and code templating. A Rust port into devcore is on the to-do sweep (`todo.md`) | curl |
| OpenPGP.js 6 (LGPL-3.0) | the audited browser OpenPGP implementation; C alternatives (GnuPG, RNP+Botan) are not built or audited for wasm | pgp |
| Mermaid 12 (MIT) | Mermaid exists only as JavaScript; `securityLevel: 'strict'` (labels sanitised), bundled by Vite | mermaid |
| Prettier standalone (MIT) | no compiled formatter covers JS/TS/CSS/HTML/YAML/Markdown/GraphQL together | prettier |
| TensorFlow.js (Apache-2.0) | runs the Magenta style-transfer graph on the GPU via WebGL; its **wasm backend** (XNNPACK, C++ → wasm, tier 2 official build) is the CPU path | cartoon (neural) |
| zip.js (BSD-3) | AES-256 zip *creation*; libarchive's wasm build has no crypto | zip |
| mediabunny (MPL-2.0) | MP4 muxing around the browser's hardware WebCodecs encoders; cutting audio without re-encoding (packet copy) | video, audio |

**Audit of handwritten WebAssembly against existing modules (owner, 18 Nov 2026): `docs/WASM-AUDIT.md`** — per tab: our
module, the existing candidates (version, downloads), what failed or passed, the decision. Kept current as the bug hunt
moves on.

**Audit list (STANDING RULE #1)** — by the owner's 18 Nov 2026 wording, existing tried-and-tested WebAssembly
builds are the first choice and stay as they are (jSquash MozJPEG/libwebp/OxiPNG, libheif-js, tesseract.js-core, zxing-wasm,
libarchive.js, the ffmpeg.wasm core): **no replacement needed, just keep them at the latest stable version** (the
ffmpeg.wasm core is FFmpeg 5.1.4 and cannot run libvpx-vp9/libx265 single-threaded — a newer wasm build of FFmpeg, ours or
someone else's, would be an upgrade, not an obligation). What remains optional is moving **JavaScript** components to
WebAssembly where a route exists:
| JavaScript component | Possible WebAssembly route | Status |
|---|---|---|
| zip.js (AES-256 zip creation) | own C: deflate (zlib/miniz) + WinZip AES (AES-CTR + HMAC-SHA1 + PBKDF2) in `crypto.wasm` | optional |
| mediabunny (MP4/WebM mux + demux around WebCodecs) | minimp4 (C, CC0) muxer around WebCodecs | optional |
| semver (npm, used only by tests now — the Semver tab runs our Rust port of it in devcore-semver.wasm, checked against the package over 16,380 version × range pairs) | — | done |
| `src/lib/curl.ts` (cURL command parser, Nov 2026) | Rust module in devcore (`devcore-curl.wasm`) | to do (`todo.md` item 1) |
| own TS parsers for future tools | write them in C/Rust from the start | EXIF/strip/DPI/sniff **done** (metacore); search ranking **done** (textcore `search.c`, identical rankings verified) |
**Audit of our own TypeScript (done Nov 2026, owner request "convert everything you can"):** moved to C — image
geometry (orient/crop/homography → imgproc), EXIF/strip/DPI/sniff (→ metacore), search ranking + word frequency
(→ textcore), shuffles/sampling/UUIDs/USODIUM1 header (→ crypto), matrix add/sub/transpose/trace/power, working
days, colour spaces + WCAG contrast (→ mathcore). **Deliberately left in TypeScript** (record new cases here):
browser-native engines that are already compiled C++ (JSON.parse, RegExp, Intl.Segmenter/Collator/DateTimeFormat,
String case mapping, canvas, WebCrypto, Date); string formatting/parsing of user input (hex colour, matrix text,
dates); per-animation-frame loops over ≤ 4k samples (audio meter RMS/peak, waveform and graph grid drawing) where
copying into wasm costs more than the loop; Damerau-Levenshtein etc. are all in C now.
Nov 2026 (small developer tabs, `src/tools/software/dev1.ts`, `data2.ts`, `src/lib/color.ts`): reading what a person typed — a
timestamp or date (`parseStamp`), a CSS colour (`parseColor`; the maths and the gamut mapping are in mathcore), a UUID's
fields, a JWT's three parts (`atob` + `TextDecoder`), percent-escapes (the browser's `URL` parser, `encodeURIComponent`
and `TextDecoder` do the work; the Windows-1252 fallback is a per-run retry), Markdown table layout and the assembly of
mock rows (random numbers from crypto.wasm) — is string glue around browser-native or wasm engines and stays in TS;
the Regex Tester is the browser's own RegExp, run in a worker (`src/workers/regex.worker.ts`) so it can be stopped.
Nov 2026 (Python Scratchpad): `src/lib/termtext.ts` (what a terminal would show for the program's output: display
code that feeds the DOM), `src/lib/python-hints.ts` (one sentence per known error), `src/lib/tzinfo.ts` (the browser's
Intl answering the C library's questions about local time; the zone table it uses is data made by a script) stay in TS.
Third-party WebAssembly builds in use (accepted, see above): MuPDF, SQLite, MediaPipe Tasks, ONNX Runtime, jSquash, libheif-js, tesseract.js-core, zxing-wasm, libarchive.js, ffmpeg.wasm, hash-wasm. Staying JS (no compiled
equivalent, reasons above): OpenPGP.js, Mermaid, Prettier, TensorFlow.js. (sql-formatter replaced by our Rust sqlformat build, Nov 2026.)

### Approved data APIs (connect-src allowlist)
Add a host here and to the CSP `connect-src` in `index.html` (and the allowlist in `tests/e2e/no-external.e2e.mjs`)
only when a tool needs live data and the owner has accepted that tool. **Approved:**
| Host | Used by | What is sent | Why |
|---|---|---|---|
| `en.wiktionary.org` (Wikimedia REST: `/api/rest_v1/page/definition/<word>`) | `photodict` | one word | online fallback for words missing from the bundled dictionary (owner request) |
| `api.dictionaryapi.dev` (Free Dictionary API: `/api/v2/entries/en/<word>`) | `photodict` | one word | second fallback if Wiktionary has no entry or is down |
Both are free, need no key or account, send CORS headers, set no cookies we read. **Live in the CSP since the Photo
Dictionary shipped** (`connect-src 'self' blob: data: https://en.wiktionary.org https://api.dictionaryapi.dev`);
`no-external.e2e.mjs` asserts that connect-src lists exactly these hosts and that no code directive allows any host. e2e tests never hit them: Playwright `page.route` serves recorded responses (the dev sandbox cannot
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

### Lazy dependencies per tab + release on leave (owner rule, Nov 16 2026)
Owner: "make the full site faster, more responsive and memory efficient — load dependencies from the site's host
**per app/tab, only when the user selects that tab**". Rules (enforced by `tests/e2e/lazy.e2e.mjs`):
1. **The shell loads no engine.** Home and category pages fetch only `index.html`, the entry JS/CSS and icons
   (≈ 156 KB): no `.wasm`, `vendor/`, `models/`, `data/` or font file. The search box's engine (textcore.wasm, own
   instance via `newTextcore()`) loads when the box is first focused/typed in (`ensureSearch()` in `src/main.ts`).
2. **Opening a tab loads only that tab's code** (its dynamic-import chunk, < 400 KB). Engines, models, data files,
   fonts and workers load on **first use** — a file chosen, a button pressed, the first Enter — never at module
   load and never at mount, except where the tab's first view needs them. Allowed at open (listed with the reason
   in `AT_OPEN` in the test): our three small engines (mathcore/crypto/textcore ≤ 115 KB: live results as you
   type), invoice/rent/resume (MuPDF + Noto Sans: the live PDF preview is the main view), markdown (cmark-gfm,
   sample preview), terminal (BusyBox: the shell is ready at once), qr/barcode (zxing-cpp: drawn as you type),
   caption/watermark/signature (fonts of the first preview), cidr/cron/semver/glob/patch (their devcore-<tab>.wasm: the
   sample is computed live), json/jwt/xml/json2types/jsondiff/base64 (their devcore module: the sample is formatted,
   decoded, compared or converted at once), mermaid (the sample diagram). Adding to that list needs a reason in the test.
   Examples of deferral: bc console starts BusyBox on its first Enter; Image Editor instantiates imgproc with
   the first photo; CSV/Excel loads sheet.wasm with the first file; Photo Dictionary loads the word list and
   Literata while OCR runs; PDF tabs load MuPDF when a PDF is chosen.
3. **Release on leave** (`src/lifecycle.ts`): engine loaders register `onLeave(key, release)`; workers are created
   through `trackWorker(worker, key, onEnd)`. `main.ts` `teardown()` calls `releaseAll()` on every navigation:
   workers are terminated (imgproc, codec, crypto, style-transfer, OCR, bc), cached wasm instances are dropped
   (textcore, mathcore, metacore, markdown, sheet, sodium, imgproc direct), MediaPipe tasks are `close()`d,
   dictionary tables/shards and PDF fonts are dropped. Pending calls of a released worker are dropped silently
   (the tab is gone; no stray error toast). Coming back re-creates them (HTTP cache makes it fast).
   `globalThis.__supertoolsLive()` → `{ workers, resources }` (used by the test: 0 after leaving).
4. **Limitation:** libraries that load into the main thread as ES modules stay in memory until the page reloads
   (the browser never unloads an imported module): MuPDF (its wasm heap), zxing-cpp, the MediaPipe runtime,
   libheif, OpenPGP.js. Their *data* is released; only the code/heap stays. Moving MuPDF into a worker (so it can
   be terminated) is a possible later improvement.
5. New tools: put every heavy import behind a function called on first use; create workers with `trackWorker`;
   register caches with `onLeave`; never start work in `mount` that the first view does not show.

### Directory map
```
index.html                 app entry (CSP, root element)
src/main.ts                shell: router, nav, home grid
src/lifecycle.ts           onLeave / trackWorker / releaseAll: free a tab's workers + engines when it is left
src/ui.ts                  DOM helpers & widgets (file picker/drop, sliders, progress, download, toast)
src/platform.ts            mobile / capability detection
src/wasm/                  loaders for our wasm (wasi.ts, imgproc.ts, crypto.ts)
src/tools/                 one module per tool
src/styles.css             all styles (light/dark via prefers-color-scheme)
wasm/crypto/               libsodium glue + own hash C sources + build.sh
wasm/imgproc/              own image-processing C source + build.sh
wasm/tools/                verify-minisign.mjs
src/wasm/bin/*.wasm        COMMITTED build outputs of our wasm modules (imported with ?url)
public/models/             ML models — FETCHED by scripts/fetch-assets.mjs from scripts/assets.json (SHA-256 pinned, gitignored)
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
in one call; "a ± b%" = percentage of the running total), root finding (sign changes + touching/double roots by
minimising |f|), quadratic/cubic, det/inverse/matmul/rank/linear solve, statistics + regression,
64-bit primes (deterministic Miller–Rabin) and Pollard-rho factorisation, exact fractions (int64 with overflow
detection; "2/3" without spaces is one fraction, so 1/3 ÷ 2/3 = 1/2), arbitrary-length base conversion, Roman numerals, number→words (Indian + international), finance
(EMI, amortisation, SIP, FD/RD, PPF, EPF, NPS, prepayment), health (BMI, BMR, body fat, ideal weight), haversine,
colour (RGB ⇄ HSL ⇄ OKLCH, WCAG luminance / contrast, and `m_color` op 5: OKLCH → sRGB with the CSS Color 4 gamut mapping).
`wasm/mathcore/build.sh` (exports every `API m_*` function). TS wrapper: `src/wasm/mathcore.ts` (`bindMathcore`
works in the browser and in Node tests). Tests: `tests/unit/mathcore.test.mjs` (~150 known-answer checks).

### 5.1c metacore → `src/wasm/bin/metacore.wasm`
Own C (`wasm/metacore/metacore.c`): `m_sniff`, `m_exif_json` (bounds-checked TIFF/IFD walker, depth ≤ 4, ≤ 512 entries),
`m_strip` (JPEG keeps JFIF + ICC; PNG drops eXIf/tEXt/zTXt/iTXt/tIME; WebP drops EXIF/XMP and fixes VP8X flags + RIFF
size), `m_jpeg_set_dpi`. TS wrapper `src/wasm/metacore.ts`; display shaping in `src/lib/exif.ts`. Tests:
`tests/unit/exif.test.mjs` (real files, synthetic WebP, fuzzed/truncated inputs must never trap).

### 5.1d BusyBox → `src/wasm/bin/busybox.wasm`
`ZIG=… wasm/busybox/build.sh`: downloads `busybox_1.38.0.orig.tar.bz2` from the Ubuntu archive (busybox.net is not
reachable from the sandbox) and checks SHA-256 `34f9ea6f…` (from Ubuntu's .dsc); `make allnoconfig` + `applets.cfg`;
patches: spawn() → host import, ed's `open(f, 0)`, stat function pointers; zig cc wrappers (compat.h pre-included,
`-mexception-handling -mllvm -wasm-enable-sjlj`), LLVM `ar` and `wasm-ld`; final link done by the script (BusyBox's
trylink loses `main`, which WASI's `_start` only references weakly). Adding an applet: put it in `applets.cfg`, rebuild,
add a case to `tests/unit/terminal-applets.test.mjs` (the suite refuses untested applets).

### 5.1f sheet → `src/wasm/bin/sheet.wasm` (Rust)
`wasm/sheet/build.sh` = `cargo build --release --locked --target wasm32-wasip1` (needs `rustup target add wasm32-wasip1`;
Rust 1.97 is installed in the sandbox; crates.io is reachable). Plain exported functions + JSON, no wasm-bindgen
(`wasm32-unknown-unknown` pulled wasm-bindgen in through zip → getrandom; on wasip1 getrandom uses WASI `random_get`).
Exports `sheet_read`, `csv_read` (delimiter sniffing over the first 50 lines), `xlsx_write` (bold frozen header +
autofilter, numeric text → numbers except leading-zero codes, column widths), `csv_write`. Dates → ISO text; Excel
time-only cells → `hh:mm:ss`; ODS durations → `h:mm:ss`; encrypted workbooks and empty files get clear messages;
hidden sheets flagged. Imports only WASI random/clock/environ/fd_write/proc_exit (the browser shim and the unit
harness both implement a real clock). ~1.4 MB, loaded only by the PC-only `sheet` tab. Tests `tests/unit/sheet.test.mjs`
(33, real files from python-calamine's test data in `tests/fixtures/sheets/`).

### 5.1g audio → `src/wasm/bin/audio.wasm`
`ZIG=… wasm/audio/build.sh`: downloads `lame_4.0.orig.tar.gz` from the Ubuntu archive (lame.sourceforge.io is not
reachable from the sandbox; SHA-256 `3df5124d…` from Ubuntu's signed `lame_4.0-1.dsc`; LAME 4.0 = upstream release
of 2026-07-11), uses our `wasm/audio/lame-config.h` (from LAME's own configure run as a cross build), compiles
`libmp3lame/*.c` (no frontend, decoder, NASM or SSE) + `audio.c` with `-O2 -msimd128`, exports every `API a_*`.
~257 KB. TS wrapper `src/wasm/audio.ts` (`bindAudio`), worker `src/workers/audio.worker.ts`, client
`src/lib/audio-client.ts` (`audio(op, …)`, tracked worker). Tests `tests/unit/audio.test.mjs` (38: WAV bytes, peaks,
resampler pass band + alias rejection, WSOLA tempo/pitch by zero crossings, MP3 frame chain + Info/Xing tag).

### 5.1h rnnoise → `src/wasm/bin/rnnoise.wasm`
`ZIG=… wasm/rnnoise/build.sh`: `rnnoise_0.2+ds.orig.tar.xz` from the Ubuntu archive (xiph.org is blocked in the sandbox;
Debian's repack of upstream 0.2 incl. the trained model, SHA-256 `db2718ee…` from the signed .dsc; model version
`0b50c45` checked), the library sources from upstream's Makefile.am + `glue.c`; `wasm/rnnoise/os_support.h` supplies
the `OPUS_CLEAR` macro that upstream's generic (non-x86/NEON) path includes but does not ship. Wrapper
`src/wasm/rnnoise.ts`.

### 5.1i espeak → `src/wasm/bin/espeak.wasm`
`ZIG=… wasm/espeak/build.sh` (also needs gcc, make, autoconf, automake, libtool, pkg-config): downloads
`espeak-ng_1.52.0+dfsg.orig.tar.gz` from the Ubuntu archive (SHA-256 `d2a886ba…` from the signed .dsc); a **native**
build compiles `phontab/phonindex/phondata/intonations` and `en_dict`; a Python step turns them + `lang/gmw/en(-US)`
into C arrays (`espeak_data.c`, voice paths lower-cased as eSpeak looks them up); `memfs.h` (force-included) sends
`fopen` to `es_fopen` and the build points `GetFileLength`'s `stat` at `es_stat` — both served from memory with musl's
`fmemopen`; `tmpnam` is stubbed (WASI has none); our `config.h`. Glue: `es_init` (voice gmw/en-us), `es_voice`,
`es_phonemes(text, 0|1)` (mode 1 = `TranslateClauseWithTerminator`, as piper-phonemize). ~1.2 MB. **WASI note:** this is
the first module that links wasi-libc's pre-open scan: `fd_prestat_get` must answer EBADF (8), not ENOSYS, or start-up
aborts with exit 71 — fixed in `src/wasm/wasi.ts` and the unit harness.

### 5.1j whisper → `src/wasm/bin/whisper.wasm`
`ZIG=… wasm/whisper/build.sh`: downloads the `whisper-rs-sys` 0.15.0 crate from static.crates.io (it vendors whisper.cpp
1.8.3 + ggml; SHA-256 `6986c0fe…` = crates.io's published checksum; github.com is blocked in the sandbox) and compiles the
upstream sources **unmodified**: ggml core + CPU backend (generic + `arch/wasm/quants.c` SIMD), whisper.cpp, and our
`backend-reg.cpp` instead of ggml-backend-reg.cpp (which needs dlopen + std::filesystem). zig's libc++ for
single-threaded wasm32-wasi has no threads or file streams: `threadshim.h` (force-included) adds a no-op `std::mutex`,
a `std::thread` that runs its work at once (whisper.cpp joins workers right away; one thread is used anyway) and
FILE*-based `std::ifstream/ofstream` (opening fails in the browser; we load models from memory). `-fwasm-exceptions`
crashes clang here, so C++ is built with `-fexceptions` and `cxxabi_stubs.c` makes `throw` report and abort (only fatal
paths throw). `-D_WASI_EMULATED_SIGNAL` + `-lwasi-emulated-signal`; max memory 4 GiB − 64 KiB; 8 MiB stack. Glue:
`w_load(buf, len)`, `w_transcribe(pcm, n, prompt, beam, &len)` → JSON segments (t0/t1 in centiseconds), `w_unload`.
Imports: WASI + `env.w_progress` (`instantiateWasi(url, extra)` takes extra import modules now).
**Big models:** `scripts/assets.json` entries with `"split": N` are verified, then stored as `<name>.0 … .k` (≤ N bytes)
+ `<name>.parts.json` (sha256, size, part sizes) and the whole file removed, so no deployed file exceeds 100 MB.

### 5.1k jq → `src/wasm/bin/jq.wasm`
`ZIG=… wasm/jq/build.sh`: downloads `jq_1.8.2.orig.tar.gz` from the Ubuntu archive (github.com is blocked in the sandbox;
SHA-256 `71b8d6e8…`), configures with a zig cc wrapper (`-D_WASI_EMULATED_SIGNAL/PROCESS_CLOCKS/MMAN`), builds the
bundled oniguruma, decNumber and libjq, and links `glue.c` as a reactor (`jq_run(filter, input, len, flags, args_json)`:
flags = -r -c -s -n -S --tab -j -a -R -e; one input source shared by the main loop and `input`/`inputs` through
`jq_set_input_cb`; `$ARGS` built like main.c; exit codes 0 / 2 bad input / 3 compile / 5 runtime, halt_error's code).
~0.96 MB. Wrapper `src/wasm/jq.ts`; e2e compares outputs with the native jq.
**Local time:** wasi-libc has no time zones, so `localtime` and `strflocaltime` answered in UTC. `wasm/jq/hosttz.c`
(the same mechanism as CPython's, §5.1m): jq is compiled with `-Dlocaltime_r=supertools_localtime_r
-Dmktime=supertools_mktime -Dtimegm=supertools_timegm`; the first two ask the host (`supertools.tz_info`, answered by
`tzInfoImport` in `src/lib/tzinfo.ts`: the browser's zone through Intl, tzdata's abbreviations from
`src/lib/tzabbr.json`, fetched by the jq worker the first time a filter mentions local time); the third names the UTC
zone "GMT" for `%Z`, as glibc — and so the jq command line — does. The host resolves a wall-clock reading as glibc's
mktime does: it starts from the offset of its last answer (a reading that exists twice therefore depends on the
conversions before it, as on the desktop; a new run starts clean), and a reading that does not exist lands after the
gap (02:30 → 03:30; with an explicit daylight flag, on the side the flag does not name). Limits: abbreviations before
1970 are outside the table (the offset is printed, "+0553" where tzdata says "LMT").
**Tests:** `tests/unit/jq.test.mjs` (4,990): the jq manual's examples, **the native jq 1.8.2** for 4,903 filter ×
option × input cases (`tests/fixtures/jq/reference.json`, `scripts/make-jq-reference.mjs`) and for **891 local-time
cases in 27 zones** (`tests/fixtures/jq/localtime.json`, `JQ=/path/to/jq-1.8.2/jq node scripts/make-jq-localtime.mjs`);
e2e `tests/e2e/jq.e2e.mjs` (68, four browser time zones).

### 5.1l graphviz → `src/wasm/bin/graphviz.wasm`
`ZIG=… wasm/graphviz/build.sh` (also needs cmake, bison, flex and a host C/C++ compiler): `graphviz_14.1.2.orig.tar.bz2` and
`expat_2.9.0.orig.tar.gz` from the Ubuntu archive (SHA-256 from the signed .dsc files). A **native** CMake configure + build
of gvc and the core/dot/neato plugins generates the bison/flex sources and gives the exact source list; those files are
compiled unmodified for wasm32-wasi with our `config.h`, `expat_config.h`, `compat.h` (force-included: prototypes wasi-libc
lacks — an implicit declaration gets the wrong wasm signature and traps) and `fstreamshim.h` (VPSC's debug log stream);
`cxxabi_stubs.c` (throw = abort; flockfile no-op). Plugins are linked statically (`lt_preloaded_symbols`). Glue
`gv_render(src, engine, format)` makes a **fresh GVC context per call** (an error could leave a pending job that later
wrote to stdout) and keeps its own copies of the strings (Graphviz keeps pointers after the call). No FreeType/Pango:
text is measured with Graphviz's built-in metrics. Unit `tests/unit/graphviz.test.mjs` (32).

### 5.1m python → `src/wasm/bin/python.wasm` + `python314.zip`
`ZIG=… wasm/python/build.sh` (≈ 10 min; host C compiler, make, xz): CPython 3.14.8 and zlib 1.3.2 from the Ubuntu archive
and tzdata 2026.6 from PyPI (all SHA-256 pinned). A native CPython is built first (the cross build's "build Python"),
then CPython's **own** WASI configuration (`Tools/wasm/wasi/config.site-wasm32-wasi` + our `config.site.extra`: no
socket module; functions zig's wasi-libc declares but lacks) with zig cc (a wrapper drops `--stack-first`, which zig
rejects). `wasi_start.c` (linked in through LIBS, constructors): links the main thread into musl's thread list — zig's
single-threaded libc leaves it NULL and `pthread_key_delete` then loops forever at interpreter exit — and `chdir($PWD)`
(wasi-libc starts in "/"). Upstream sources unmodified apart from the changes listed below. The stdlib is compiled to .pyc by the same CPython version and
zipped without tests/IDLE/Tk/venv/ensurepip/sqlite3/curses (+ tzdata for zoneinfo, + `wasm/python/lib/*.py`); CPython finds `/lib/python314.zip`
on its default path. Our WASI host's `poll_oneoff` now honours the clock id (time.sleep uses absolute monotonic
deadlines).
**Our changes to CPython (Nov 2026 bug hunt; all in `wasm/python/`, applied by build.sh):**
- `stack-guard.patch` (ceval / pystate headers): CPython 3.14 watches the address of the C stack, but WebAssembly has
  two stacks and the browser's own (≈ 1 MB, unreachable from wasm) overflows first — "Maximum call stack size
  exceeded" killed the run. Every recursion check site now pads the linear-memory stack (`SUPERTOOLS_STACK_PAD=512`,
  eval loop `SUPERTOOLS_EVAL_PAD=384`, budget `SUPERTOOLS_C_STACK=580000`), so nested C calls end in Python's own
  `RecursionError: Stack overflow` (measured in Chromium: `__repr__` / `__eq__` ≈ 300 levels, json / repr of nested
  lists ≈ 1,000, pickle ≈ 460, sorted(key=…) ≈ 140; plain Python recursion, generators and deepcopy are not limited).
- `patch-stdlib.py` (on the copy of Lib/ that is zipped): **functools.lru_cache / cache use the pure-Python wrapper**
  (through the C one a cached recursive function stopped at 241 levels; now it nests no C calls) — and
  `lib/sitecustomize.py` starts every program with **recursion limit 2000** (the wrapper costs a frame per level, so
  memoised recursion reaches the depth it reaches on a desktop); **hashlib.pbkdf2_hmac** has CPython 3.11's Python
  fallback again (CPython ≥ 3.12 takes it from OpenSSL only; no OpenSSL here; `scrypt` stays absent).
- `lib/_socket.py` (stand-in: constants and helpers exist, opening a connection raises OSError "there is no network
  here") — without it `import socket` failed and with it asyncio, doctest, pdb, logging.handlers, email.utils,
  http.client, urllib.request; `lib/_supertools_asyncio.py` + `sitecustomize.py`: an asyncio event loop without
  sockets and threads (to_thread / run_in_executor run inline). `pydoc_data` (help("if")) and `dbm.dumb` (shelve) are
  kept in the zip.
- **Local time:** wasi-libc has no time-zone database. `wasi_start.c` renames `localtime_r` / `mktime`
  (`-Dlocaltime_r=supertools_localtime_r …`) to versions that ask the host (`supertools.tz_info` import, answered by
  `src/lib/tzinfo.ts`): the offset at a moment comes from the browser's Intl; tzdata's abbreviation and daylight flag
  from **`src/lib/tzabbr.json`** (`python3 scripts/make-tzabbr.py`, generated from the tzdata inside python314.zip:
  per zone "offset/isdst=NAME …" newest first, plus the periods in which the simple rule — daylight = the larger of
  the year's two offsets — is wrong, e.g. Moscow 2011, Lisbon 1996). The Python worker fetches the table with the
  interpreter. **Run make-tzabbr.py again after every rebuild of python314.zip with another tzdata.**
- Absent, with a hint in the tab (`src/lib/python-hints.ts`): sqlite3, bz2, lzma, ctypes, curses, readline, ssl,
  tkinter, turtle, mmap, fcntl, termios, pwd, grp, resource, syslog, venv, ensurepip (the unit suite checks that this
  list is exactly what fails to import); threads, processes, the network.
**The tab (`src/tools/software/python.ts`, worker `src/workers/python.worker.ts`):** output pane `src/lib/termtext.ts`
(a text model + a view drawn once per frame: \r / \b / ESC[K / clears / ANSI colours as a terminal shows them; the
last 600,000 characters on screen, of one line at most 200,000; Copy and Save output give everything); the worker
sends every write at once at a human pace, a flood in pieces a millisecond apart, and what is waiting at any system
call (`onCall`); stdin is handed over a line at a time and a line that answers a prompt is echoed (`stdinLines`,
`onStdinRead`); limits 32 MB of output / 30 minutes (`onAbort`); hints for errors particular to the tab; Enter keeps
the indentation; "All as .zip" for written files.
**Tests:** `tests/unit/python.test.mjs` (201) — 69 programs (`tests/fixtures/python/cases/*.py`: language, standard
library, uncaught errors, input, files, asyncio, local time in 20 zones) must print what **native CPython 3.14.8**
prints, byte for byte on stdout and stderr (`tests/fixtures/python/reference.json`, made with the build's own native
interpreter: `$WORK/native/python scripts/make-python-reference.py`); local time against the zone files inside the
build for 51 zones × 575 moments; nested-call table; RFC 6070; host options; hints. `tests/unit/termtext.test.mjs`
(61, incl. 3,000 random streams against a cell-by-cell terminal). e2e `tests/e2e/python.e2e.mjs` (88).

### 5.1e markdown → `src/wasm/bin/markdown.wasm`
`ZIG=… wasm/markdown/build.sh`: downloads the `cmarkgfm` 2025.10.22 sdist from PyPI (SHA-256 `5bec6100…`), which vendors
cmark-gfm 0.29.0.gfm.13 (latest upstream) plus its CMake-generated headers (`generated/unix`), and links all of
`src/*.c` (minus the CLI) + `extensions/*.c` + `glue.c` (`md_html(src, len, flags, &outlen)`: GFM tables,
strikethrough, autolinks, tag filter, task lists, footnotes; flags = smart punctuation, hard breaks; raw HTML and
unsafe URLs always suppressed). TS wrapper `src/wasm/markdown.ts`; tests `tests/unit/markdown.test.mjs` (25).

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
| mupdf (Artifex, official wasm) | AGPL-3.0 | all PDF tools, Doc Scanner PDF output |
| fflate | MIT | EPUB zip |
| @jsquash/jpeg (MozJPEG), /webp, /oxipng | Apache-2.0 (+ codec licences) | image encoders |
| @mediapipe/tasks-vision | Apache-2.0 | Passport |
| @tensorflow/tfjs-core, -converter, -backend-webgl, -backend-wasm (XNNPACK wasm), -backend-cpu | Apache-2.0 | Cartoonizer style transfer |
| tesseract.js, tesseract.js-core, @tesseract.js-data/eng, /fra, /spa, /deu | Apache-2.0 / MIT | OCR |
| zxing-wasm | MIT (zxing-cpp Apache-2.0) | QR |
| @zip.js/zip.js | BSD-3-Clause | Zip, Batch Images |
| libarchive.js | MIT (libarchive BSD) | Zip extract |
| @fontsource/anton (Anton font) | OFL-1.1 | Text on Image (meme style), Watermark |
| @fontsource/great-vibes, /dancing-script, /caveat | OFL-1.1 | Signature Maker (typed signatures) |
| @fontsource/literata (Literata, Google's reading typeface) | OFL-1.1 | Photo Dictionary cards |
| onnxruntime-web 1.31.1 | MIT | Text-to-Speech (Kokoro, Piper) |
| hash-wasm 4.13.0 | MIT | HMAC Generator, TOTP, Password Hash Tool |
| mediabunny | MPL-2.0 | Video Compressor, Audio Recorder (cut without re-encoding) |
| @expo-google-fonts/noto-sans (Noto Sans TTF: regular, bold, italic) | OFL-1.1 (package MIT) | PDFs made by GST Invoice, Rent Receipt, Resume Builder |

**Data files committed in `public/data/`**: EFF large wordlist (CC-BY 3.0); `dict/` — English Wiktionary via
wiktextract/kaikki.org (CC-BY-SA 4.0 + GFDL, Wiktionary contributors) and wordfreq 3.1.1 English frequencies (CC-BY-SA
4.0, Robyn Speer). Attribution is shown in the Photo Dictionary.

**Models are not committed** (too large for git). `scripts/assets.json` lists each model's URL, pinned SHA-256,
size, licence and users; `scripts/fetch-assets.mjs` downloads them into `public/models/` (curl, retries) and refuses
any file whose hash differs. It runs automatically in `predev`/`prebuild` (so CI fetches them too); `npm run assets`
runs it by hand; `node scripts/fetch-assets.mjs --pin <name>` records the hash of a NEW entry once (review + commit).
Current entries (all Apache-2.0, Google MediaPipe, versioned URLs `…/float16|float32/1/…`):
- `mediapipe/blaze_face_short_range.tflite` (0.2 MB) — redact (and passport framing)
- `mediapipe/face_landmarker.task` (3.8 MB) — passport
- `mediapipe/selfie_multiclass_256x256.tflite` (16.4 MB) — passport, bgremove
**MediaPipe telemetry removed:** tasks-vision ≥ 1.2 has a usage logger that POSTs to `odml.pa.googleapis.com` every
60 s and on `close()`; `vite.config.ts` (`noMediapipeTelemetry`) turns its flush into a no-op at build time and fails
the build if that code changes shape; `no-external.e2e.mjs` checks no telemetry host is left in `dist/`.
MediaPipe runtime: `src/lib/mediapipe.ts` (FilesetResolver → `vendor/mediapipe`, models via `document.baseURI`);
BlazeFace runs on the CPU delegate (XNNPACK; as fast as WebGL for a tiny model, no GPU stalls), larger models try
GPU then fall back to CPU.
- `magenta/{predictor,transformer}/…` (9.6 + 7.8 MB, Apache-2.0) — Magenta arbitrary style transfer (cartoon). Upstream
  only has the legacy TF.js format (`tensorflowjs_model.pb` GraphDef + `weights_manifest.json` + shards, from
  https://storage.googleapis.com/magentadata/js/checkpoints/style/arbitrary/…), which TF.js ≥ 1.0 cannot load. Each file
  is SHA-256 pinned; the `.pb` entry has `"convert": "magenta"`, so `fetch-assets.mjs` then runs
  `scripts/convert-magenta.mjs` (our dependency-free protobuf reader → GraphDef JSON → `model.json`, graph-model
  format; weights untouched). Verified: strength 0 reproduces the photo; WebGL = WebAssembly output.

Rejected: `@jspawn/ghostscript-wasm` (unmaintained 2022 single-maintainer build of Ghostscript; safety).

---

## 7. Develop, test, deploy

```bash
npm ci
npm run dev        # http://localhost:5173  (vendor files copied first)
npm run build      # → dist/
npm run preview    # serve dist/
```
**Node bug workaround (unit tests):** `tests/unit.mjs` sets `--no-turbo-fast-api-calls` — Node 22's WASI functions are
V8 fast API calls, and a uvwasi allocation inside one can start a GC that crashes V8 (SIGSEGV seen in `busybox.test`).
The Vite SSR loader in the harness runs without a file watcher (`server.watch: null`).

**Tests (fast and parallel — owner requirement):**
```bash
npm test                 # node tests/unit.mjs — all unit suites concurrently in one process (~1 s)
npm run build && npm run test:e2e   # node tests/e2e.mjs — one Chromium, suites run concurrently (~15 s)
node tests/unit.mjs mathcore keys   # filter by file name (several = any of them); same for e2e: node tests/e2e.mjs cidr chmod.
E2E_CONCURRENCY=8 node tests/e2e.mjs
```
- `tests/unit/*.test.mjs` export `default async (t, { load, wasm })`; `t.ok/eq/near/throws`; `load()` = Vite SSR
  import of any `src/` module; `wasm(name)` instantiates `src/wasm/bin/<name>.wasm` with a WASI shim.
- `tests/e2e/*.e2e.mjs` export `default async ({ base, page, ok, download, tmp, devices })`; `page(opts)` makes an
  isolated context (console errors collected in `page.errors`).
- **Owner rule (bulletproof testing):** besides the whole-app suites (`shell`, `every-tab`, `lazy`, `no-external`), **every
  utility tab has its own independent e2e suite** (`tests/e2e/<tool-or-group>.e2e.mjs`), all suites run in parallel,
  and every wasm module has unit tests. Use **real media files** wherever possible: real photos with EXIF/GPS
  (public-domain samples from scikit-image / Pillow test data), real HEIC (pillow-heif test files), real PDFs incl.
  encrypted ones (PDF library test corpora), real audio/video (generated with the Playwright-bundled ffmpeg at
  `/opt/pw-browsers/ffmpeg-*`), a real face via Chromium's `--use-file-for-fake-video-capture` (passport, webcam),
  and speech produced by our own TTS for the STT round trip. Fixtures live in `tests/fixtures/` (committed, small;
  `tests/fixtures/README.md` records each file's source and licence).
- Every tool must have e2e coverage of its main flow with known answers; every wasm module must have unit tests.
  **Status (16 Nov 2026): every built tab has its own suite** (`tests/e2e/<id>.e2e.mjs`). Shared helpers: `_phone.mjs`
  (phone layout), `_pconly.mjs` / `_mobileonly.mjs` (platform notes), `_stats.mjs` (χ² for random tools), `_phases.mjs`
  (fake-clock timers), `_media.mjs` (fake camera/microphone), `_scanback.mjs`, `tests/lib/calc.mjs`, `tests/lib/pdfcheck.mjs`.
  Timers use Playwright's fake clock; device tabs use fake media streams, CDP touches and dispatched orientation events
  (see `docs/HANDOFF.md` §3–5).
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
   an existing tried-and-tested WebAssembly module first (look for one; if it covers only part of what the owner
   asked for the tool, use it for that part and add the rest beside it: a supplementary WebAssembly module of our
   own → an existing JS/TS library → our own JS/TS); if there is none at all, our own WebAssembly build
   from open-source code (also a port of JS/TS-only functionality where that is possible); only if that is not
   doable, a JS/TS library as it is; record the choice and reason in §3a and the tab's entry in
   `docs/WASM-AUDIT.md`. Everything is hosted in the app.
0b. **Apply STANDING RULE #2 throughout:** extensive tests are written with the tool (unit + its own e2e suite,
   independent references where they exist); run, fix the bug or the test, run again until green.
1. Create `src/tools/<id>.ts` exporting `mount(root)`; use helpers from `src/ui.ts`.
2. Register it in `src/registry.ts` (id, title, desc, category, icon, rich keywords, `platform`: 'both' unless
   the owner says PC only, or it genuinely needs phone hardware → 'mobile'). Add search cases.
3. Heavy dependencies: dynamic-import inside the tool **on first use** (not at mount — §4 "Lazy dependencies");
   workers via `trackWorker`, caches via `onLeave` (`src/lifecycle.ts`); vendor runtime files via
   `scripts/vendor.mjs`; never load from a CDN; keep the CSP intact. `tests/e2e/lazy.e2e.mjs` checks every tab.
4. Add a smoke test in `tests/e2e.mjs`, update §2/§3 of this file, commit, push.
