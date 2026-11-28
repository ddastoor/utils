# SuperUtils — project spec & runbook

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
> **The process (owner, 21 Nov 2026; agreed):** "after all the to-dos, we'll start going through potentials.md. So you
> show me potentials.md apps. Then I will select either one app or a bunch of apps, and you build them out and then
> remove them from potential.md, and then we repeat this process." So, once the work in hand is finished (the offline
> voices, to-do #5 SuperUtils, the Regex Tester's flavours, the Photo Dictionary plan — `docs/RESUME.md`): show the
> apps of `docs/potentials.md` → the owner picks one or several → **the size check below for each** (wait for the
> decision) → build and test them → remove them from `docs/potentials.md` → show the list again.

> ## 📖 The Photo Dictionary matters most (owner, 21 Nov 2026; standing)
> **Owner:** "photo dictionary, particularly as an app, is very important to me, and it has to work extremely well on my
> phone, especially when I take pictures of my Kindle, because I read a lot on my Kindle. It also obviously has to work
> very well on the PC using a webcam, but my primary use case for photo dictionary is while using it with my phone to take
> pictures of Kindle page so that I can quickly look up stuff."
> Owner, the same day: "especially when I take a picture of my Kindle paperweight [Paperwhite]. But it should work for
> newspapers and other pages also" — and it "should be absolutely fantastic".
> So: **its first case is a phone photographing a Kindle Paperwhite page** (an e-ink screen: moiré, glare, a slight tilt,
> the camera's focus), **then newspapers and printed pages** (columns, small type, newsprint), then a PC's webcam. Every
> change to it, to its OCR (`src/lib/ocr.ts`), to the shared live camera (`src/lib/livecam.ts`) or to the image clean-up
> it uses is judged first by how well a phone's photo of a Kindle page reads; its suite measures that (§3 Photo
> Dictionary). The owner's report of 21 Nov 2026: on the phone the OCR was worse than with the webcam (the Kindle's
> "Comforta" font) — the same engine on both; the phone's Snap gave one frame of the live video, not a photo — it takes
> the camera's still now, the page is found and straightened before it is read, and a photo too soft to read gets a
> "snap again" hint (§3 Photo Dictionary, "The upgrade", item 5).
> **The OCR tab too** (owner, 21 Nov 2026: "just like the photo dictionary, the OCR app should also work really well from
> my phone"): it shares the engine, the camera and the clean-up, and is held to the same phone photos (`todo.md` #9).
> **Owner, 21 Nov 2026 (later):** "just like photo dictionary on the phone, the OCR on the phone also has to be extremely
> high quality. In fact, both photo dictionary and OCR on the phone and PC should be extremely high quality." — the two
> tabs, on phones and on PCs, are judged by the same standard: the photos a person really takes read right.
> **Phone held sideways (owner, 21 Nov 2026 — `todo.md` #11):** "when I take my phone and turn it 90 degrees
> horizontally, either with my left hand or my right hand, and then take a photo of my Kindle, it gets screwed up. It
> can't understand a thing. Fix that. Do whatever you have to do internally, rotate the image … should work even if my
> camera is in landscape mode and portrait mode." — both tabs find which way up the text stands (the phone's tilt at the
> moment of the snap where the browser gives it, and the picture itself) and turn the photo before it is read.
> **The OCR tab keeps the page's formatting (owner, 26 Nov 2026, later — correcting #18):** "In the OCR app, the rich
> formatting should be preserved, the bullet points, etc. In the photo dictionary app, it need not be, only because the
> actual OCR rendition is needed for me to further select a phrase that I could then look up in Wikipedia." — the OCR
> tab's text keeps bullets, check boxes and indentation (to-do #31, built 26 Nov 2026 — §3 OCR, "The page's lists"; the
> owner's choices: plain text with the marks at the line starts and nested items indented — in the text box, Copy and the
> .txt —, lists only); the Photo Dictionary's stays plain.
> **OCR quality is paramount (owner, 26 Nov 2026):** "make sure no functionality is compramised.. the high quality of the
> ocr is paramount !!!" — said of to-do #18 (one shared reading path for the OCR tab and the Photo Dictionary): every
> feature of both tabs stays, and every change to their reading is measured before and after — none may read worse.
> **Printed books (potentials #96, built 27 Nov 2026):** both tabs flatten a photo of an open book before reading it — the
> pages' curve near the spine taken out, a spread's left page read before its right one (§3 OCR, "Books"; measured: no photo
> reads worse, thick books 53.7 → 88.0 % of their words).
> **At any angle (owner, 21 Nov 2026):** "the OCR app also should be extremely good, especially on the phone, when I click
> it at different angles … Just like what you're doing for the photo dictionary app." — both tabs also measure the slant
> of the lines and level the photo before the quarter turns (§3 OCR, "At any angle").

> ## 📏 Size check before every new app (owner, 20 Nov 2026; standing)
> **Owner:** "Whenever next new app I suggest from potentials.md, you do a rough calculation, tell me how much more
> space it will occupy, and potentially if you can get rid of an existing app to make space, and then I'll make a
> decision."
> When the owner names an app from `docs/potentials.md` (or `docs/IDEAS.md`), **before building anything**:
> 1. Estimate what it adds to the deployed site (`dist/`): engines, models, data, fonts, in MB (look up the real
>    file sizes of the release or package, not a guess from memory).
> 2. Give the new total against GitHub Pages' **1 GB cap for a published site** (20 Nov 2026, after Speech to Text was removed: **512 MB**, 488 MB of room — `du -sb
>    dist` after `npm run build`, in bytes: 1 GB is read as 10⁹ bytes; `du -sh` shows MiB), and for a large model the 100 GB / month soft bandwidth limit.
> 3. Name what could be removed to make room, when room is short — an app, or a big model of one (the biggest today:
>    Text-to-Speech's voices 167 MB — Kokoro 94 MB + Piper 73 MB; Code Formatter's Biome 67 MB; the Diagram Editor's
>    draw.io 53 MB; Photo Dictionary's data 34 MB; FFmpeg 31 MB; PaddleOCR, the OCR's second reader, 31 MB; Tesseract
>    27 MB; ExifTool 24 MB). 26 Nov 2026, with PaddleOCR: **555 MB**; with the Noise Remover's Studio voice (DeepFilterNet
>    3, 8.6 MB): **563 MB**; 28 Nov 2026, with SliceDiceGrapher: **578.8 MB**; with the Diagram Editor (draw.io): **631.7 MB**; with sqlite3, bz2 and
>    lzma in the Python tab (1.9 MB) and the Cartoonizer's anime looks (34.6 MB): **668.3 MB**.
> 4. **Wait for the owner's decision.** Build nothing until the owner has decided.

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
>   tesseract.js-core, zxing-wasm, 7z-wasm (7-Zip; replaced libarchive.js in Nov 2026), ffmpeg.wasm, MuPDF, SQLite,
>   ONNX Runtime, MediaPipe) and our own
>   builds (crypto, imgproc, BusyBox, jq, Graphviz, CPython, devcore, formats, …).
> - A sweep to move as much JS/TS as possible into WebAssembly modules, where doable, is in `docs/potentials.md` (#74 —
>   moved there from `todo.md` by the owner on 21 Nov 2026) — **only when the owner picks it**.

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
> - **Run only the tests a change needs; the full suite only when the owner says so** (owner, 26 Nov 2026: "When you
>   make a change, don't run the entire test suite. Just run whichever test suites or tests that you think is
>   necessary. Run the full test suite only when I tell you to run the full test suite."): after a change, the unit
>   suites and e2e suites of what it touches (`node tests/unit.mjs <names>`, `node tests/e2e.mjs <names>` on a fresh
>   build) — and, where a shared file changed, the suites of the tabs that use it. The complete suites (`npm test`, then
>   `npm run build && node tests/e2e.mjs`) — and the whole "Windows check" (`.github/workflows/windows.yml` without
>   `suites`) — **only at the owner's word**; the Windows check otherwise takes the suites needed in its `suites`
>   input. **Pushing does not wait for tests** (STANDING RULE #3). Record what was found and fixed in `docs/BUGHUNT.md`.

> ## ⚠️ STANDING RULE #3 — Commit and push regularly and often (owner, 17 Nov 2026; permanent)
> **Owner:** "Commit and push regularly and often. Don't wait for the entire test suite to get over or the entire
> utility to get over."
> - Commit **and push** after every meaningful step — an engine fix, a rebuilt wasm module, a new test file, a page
>   change, a docs update — not once per finished utility and not only after the complete e2e run. The owner can be
>   cut off at any moment (usage limit, session reset) and must not lose work.
> - What a push needs: the project builds (`npm run build`) and the tests of the files just touched have been run.
>   Work that is not finished is pushed too — say so in the commit message ("in progress: …") and in
>   `docs/RESUME.md`.
> - The complete suites run only when the owner asks for them (26 Nov 2026, STANDING RULE #2); what they find is fixed
>   and pushed as its own commit.
> - Push to the working branch only (see the session's branch rule); never force-push.

> ## 📷 STANDING RULE — a camera wherever a picture is taken in (owner, 20 Nov 2026; repeated 21 Nov 2026)
> **Owner, 20 Nov 2026:** "In all apps that offer to upload an image, also add the option of taking a photo if it's a
> phone app, and take the photo with a webcam if it's a PC app." **Again, 21 Nov 2026:** "make note of this new rule
> that wherever you need to upload a picture, an image, also have the facility of taking a photo with the phone's
> camera if the app is a mobile app, and taking the same with the PC's webcam if the app is a PC based app."
> - Every picture picker — in every tab, existing and new — is `imageInput` or `imagePicker` (`src/lib/imgtools.ts`),
>   which carry the live camera (`src/lib/livecam.ts`): the phone's camera (back first) on phones, the webcam on PCs.
> - `tests/e2e/camera.e2e.mjs` fails on a picture picker without one, unless its EXEMPT list names the tab and the
>   reason (today only the SVG Optimizer — it takes SVG drawings, which no camera makes; the QR Scanner has a camera of
>   its own; the Photo Dictionary uses the shared one since 21 Nov 2026, when it became PC + mobile). EXIF / Photo Info and FFmpeg's main picker got the camera at the owner's
>   word (21 Nov 2026: "also add it for exif too"; FFmpeg's webcam had been only in the picture box of three tasks).
>   Details: §3 "Camera in every tab that takes a picture"; checklist §8 item 5.

> ## 🐧 Linux: every app knows X11 or Wayland (owner, 21 Nov 2026; standing)
> **Owner:** "make a note that all apps on Linux should be aware of or auto-detect or have some way of detecting on Linux
> if I'm using X11 or Wayland." — on a Linux PC every tab can tell which display server the session runs on: one shared
> detection (`src/linux.ts`: the passive guess at once — Wayland never tells a page its window's position —, the
> one-click popup check to confirm; kept in memory for the visit, nothing stored), and **every tab uses it wherever X11
> and Wayland behave differently**: screen and window capture (Wayland's portal asks again; Screencast, Screenshot,
> YouTube Clip), the colour picker outside the window (the EyeDropper), popups and Picture-in-Picture windows placed by
> the page, full screen and the pointer lock, global keys, drag-and-drop from the file manager, the clipboard, the camera
> (PipeWire) — the tab says what Wayland changes and how to work with it. Checked across all PC tabs in `todo.md` #13 — the tabs that
> differ carry the shared note (`linuxBanner(tips)`): Screencast, Screenshot (its countdown window may not stay on top on
> Wayland), YouTube Clip, Screen Info; `tests/e2e/os.e2e.mjs` opens every PC tab as Windows, X11 and Wayland.
> **Windows:** `.github/workflows/windows.yml` runs the browser suites in Google Chrome on GitHub's Windows runner (by hand);
> every file name must be valid on Windows (`tests/unit/repo-paths`), and scripts take paths with `fileURLToPath`.

> ## 🗣️ Languages — don't bother about Hindi (owner, 20 Nov 2026; standing)
> **Owner:** "going forward, as far as languages is concerned, don't bother about hindi … make a note of this."
> No new work, features or test cases for Hindi (Devanagari) in any tab from now on — English first (the OCR tab's
> rule of 16 Nov 2026, "don't bother about Hindi", now applies everywhere). What already handles Hindi stays as it is;
> it is not removed, and it is not extended or tested further.

> ## 📝 Owner's to-do list: `todo.md` (the owner calls it "to do")
> Created 17 Nov 2026. When the owner says "add … to to do" or "what's on to do", it means this file. Read it at the
> start of a session and keep it current. **Never start an item on your own (owner, 17 Nov 2026):** when the current
> work is finished, show the owner the open items and ask which ones to do — then do only those.

---

## 1. What this is

**SuperUtils** (owner-chosen name; called SuperTools until the owner renamed it on 21 Nov 2026; repo `ddastoor/utils`) — a personal **utilities web app**: one static
single-page app (SPA) hosted on **GitHub Pages**
(`https://ddastoor.github.io/utils/`), used from **desktop browsers** (Chrome on Windows and Linux, X11 or
Wayland) and **mobile browsers** (Android Chrome, iPhone Safari).

### Hard requirements (from the owner — do not violate)
1. **Static and stateless.** No backend, no login, no accounts, no analytics, no cookies, no service worker,
   **no PWA / offline install**. Nothing is saved between visits **except the owner-requested Favorites list**
   (tool ids in `localStorage` key `superutils.favorites.v1` — the stars of the old key `supertools.favorites.v1` are
   moved to it once —, `src/favorites.ts`; never leaves the browser) **and, since the owner's word of 26 Nov 2026, whether the category's list of apps is folded**
   (to-do #27 — owner: "remembered between visits like Favorites"; `localStorage` beside Favorites, nothing else) **and, since
   28 Nov 2026, the Settings page's settings** (to-do #39 — §3 "Settings page"; the set the owner chose that day): in
   `localStorage`, one key an app — `superutils.app.<id>.v1` for Text-to-Speech, Camera Reader and Audiobook (voice, speed; the
   Camera Reader's text size and "read aloud at once"; the Audiobook's MP3 quality), the EPUB Reader (its look; since to-do #40
   also its reading voice and speed and **the books the reader asks it to remember**: each book's fingerprint — XXH128 of the file,
   not the file —, title, author and place), the Spell Checker (its language and the words added) and the World Clock (its cities,
   its 12 / 24-hour clock) —, and
   `superutils.settings.v1`, this device's own "a settings file after every change"; in IndexedDB (`superutils-settings`), the
   folder chosen for the settings files (its handle — a normal window only; never in a private one). The settings file it writes
   after every change stays on the device. **Allowed by the owner, to be built:** World Radio's favourite stations, in the
   Settings page (owner, 28 Nov 2026 — `docs/potentials.md` #116). A new kind of setting needs the owner's word.
2. **No online *code* dependencies (owner clarification).** Every library, script, WebAssembly module, ML model,
   font and icon is embedded in / served from this site — WebAssembly first, else a locally hosted open-source JS
   library. Never a CDN or remote script. **Fetching *data* from a public online API is allowed** (e.g. network
   time, daylight-saving info, exchange rates) when a tool needs live information. Enforcement: CSP keeps
   `script-src`/`style-src`/`font-src`/`worker-src` to `'self'`; `connect-src` = `'self'` + an explicit allowlist of
   approved data-API hosts (listed in `index.html` and §3a "Approved data APIs"); the YouTube Clip tool may embed
   `youtube-nocookie.com` (`frame-src`), and the Diagram Editor a page of this site (`frame-src 'self'`: draw.io's own page,
   which has a Content-Security-Policy of its own — code only from this site, no other site contacted). `tests/e2e/no-external.e2e.mjs` fails on any code from another host and on
   any request to a non-allowlisted host.
   **What the rule means (owner, 28 Nov 2026 — his wording; standing):** "when I say that SuperUtil's website should not
   depend on external libraries at runtime, what I mean is they should not pull in JavaScript libraries or Node libraries
   through CDN links, etc., or through any links as the page loads from other sites … whatever is needed for the site to
   function in terms of supporting code, library code, that should be at build time, at compile time, hosted on the site
   itself. However, what you can do while the app is running itself is make fetch calls to get data. For example, a
   wallpaper API, etc. This obviously is part of the functionality of the app in terms of app data, not supporting library
   code. Or another example is a world radio, where obviously what I'm streaming onto the site is a radio station. So that
   is okay." → **code** (JavaScript, WebAssembly, workers, styles, fonts, models — anything the site runs on) comes only
   from this site, built in at build time; **data** an app is about (an API's answers, pictures from a wallpaper service, a
   radio station's stream) may come from other sites while the app runs. Each data host is still named when its app is
   built (connect-src, or media-src / img-src for streams and pictures, §3a "Approved data APIs", the no-external suite),
   and what a user's own files hold never goes with it (rule 3).
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
10. **Search**: every tab has relevant keywords (`src/keywords.ts`, one line per tab id; a chunk of its own that
    `loadKeywords()` of the registry fetches with the search box, so the start page does not carry it). A search box
    (home screen + sidebar; `/` or Ctrl+K focuses it on PC) ranks tabs by title and keywords; pressing **Enter opens
    the top match immediately**.
11. **Lazy dependencies per tab (owner, Nov 16 2026):** a tab's engines, models, data and fonts are fetched from
    this site only when that tab is used, and released when it is left — see §4 "Lazy dependencies".

### Owner's answers to open questions
- App name: **SuperUtils** (title, header brand, `document.title` suffix) — **renamed from SuperTools on 21 Nov 2026**
  (owner: "make a note to change this app's name from SuperTools to 'SuperUtils'" and "make sure you rename it
  everywhere. For example, in the text-to-speech download utility also"; `todo.md` #5, done): the page, the terminal
  (prompt `user@superutils`, hostname, uname — busybox.wasm rebuilt), the samples, the JSON → Types header
  (devcore-j2t.wasm rebuilt), the Python tab's helper module (`_superutils_asyncio`), the offline speech scripts
  (`superutils-speech.sh` / `.cmd`, the folder `SuperUtils-TTS` — owner: no migration of the old folder, he deletes it),
  the Favorites key (old stars moved over once). **Kept, on purpose:** the internal name of the import module through
  which our WebAssembly builds talk to the page, `supertools.*` (spawn, ncpu, tz_info, text_width — compiled into
  BusyBox, CPython, jq and Graphviz; never shown), the C names inside those builds (`SUPERTOOLS_STACK_PAD`,
  `supertools_localtime_r` …), and test data that carries the old name (fixture photos' camera "SuperToolsCam",
  the test certificates, a subtitle file).
- Commit and push **each tool as soon as it works** — never batch many finished tools into one push. (17 Nov 2026:
  more often still — see STANDING RULE #3: push after every meaningful step, without waiting for the whole utility or
  the complete test run.)
- Passport photo: owner lives in **India** → Indian presets first.
- No offline/installable app — **all online** (plain website).
- OpenPGP: **GnuPG-compatible** (v4 Curve25519 keys). Decryption accepts both v4 and RFC 9580 v6 input,
  so a future GnuPG that adopts RFC 9580 keeps working with this tool.
  21 Nov 2026: a second mode beside it, **"Latest standard (RFC 9580)"** — v6 keys, SEIPDv2 (AEAD), Argon2 — "which may
  or may not be compatible with GPG"; the GnuPG-compatible mode stays exactly as it was (§3 OpenPGP).
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
  the tab). Tool URLs: `#/<toolId>` (`?from=fav` keeps the Favorites row active). A star clicked on a card keeps that
  card where it was on the screen and its star the focus (the page drawn again with the star scrolled to the top and lost
  a keyboard's place — fixed 28 Nov 2026).
- **Settings (to-do #39; owner, 27 – 28 Nov 2026):** a "Settings" link at the end of the header (an icon on phones) opens
  `#/settings` — what the site keeps in this browser, section by section, and the settings files that hold it (§3
  "Settings page").
- **The category's list of apps folds away (to-do #27; owner, 26 Nov 2026: "make the list of apps in this category in a
  collapsible pane … By default, keep the app pane expanded … collapse the list of all apps in that category so that
  the real estate for the currently selected app increases"; "remembered between visits like Favorites"):** a button at
  the end of the category row (outside the tool row, a tab list): "Hide apps" (aria-expanded) folds the tool row away —
  then "All n apps" opens it again; folded stays folded through other apps and categories, after a reload and in other
  tabs (`src/applist.ts`: `localStorage` key `superutils.applist.v1` = "folded"; open is the default and stored as
  nothing; private mode: for the visit). Software's tool rows on a PC: about 330 px given back to the app; a phone: one
  row. e2e `applist` 20.
- **Camera wherever a picture is taken in (owner, 20 Nov 2026; standing):** "in all apps that offer to upload an image,
  also add the option of taking a photo if it's a phone app, and take the photo with a webcam if it's a PC app". Every
  picture picker is `imageInput` or `imagePicker` (`src/lib/imgtools.ts` — the camera is built in); a new one without a
  camera fails `tests/e2e/camera.e2e.mjs` unless it is added to its EXEMPT list with the reason (§3 "Camera in every
  tab that takes a picture").
- **New utilities:** whenever the owner accepts a new utility, place it in the most fitting existing category,
  or create a new, well-named category for it (update `CATEGORIES` in `src/registry.ts` and this file).
  Give it rich search keywords (synonyms, everyday phrasing, file extensions, common misspellings) and add
  queries for it to `tests/search.test.mjs`.
Platform is PC + mobile unless marked **PC**. Tab ids are the URL hash (`#/<id>`).

**The authoritative, always-current list is `docs/TOOLS.md`, generated from `src/registry.ts` (`npm run docs`).**
Current total: **198 tabs in 11 categories — 130 PC + mobile, 65 PC only, 3 Mobile only** (regenerate with
`npm run docs` after every registry change; the owner asked for the registry to always be noted).
The per-category notes below record decisions; when they disagree with the registry, the registry wins.

**Platform model (owner rule):** every tool is exactly one of **PC + mobile** (`'both'`), **PC only** (`'pc'`,
hidden on phones) or **Mobile only** (`'mobile'`, hidden on desktops) — the `platform` field in
`src/registry.ts`. Mobile only = needs phone hardware: `level` Bubble Level, `compass` Compass, `touch` Touch
Test. (`photodict` Photo Dictionary was mobile only until the owner made it PC + mobile on 21 Nov 2026 — the webcam on a
PC.) `keyboard` Keyboard Test is PC only (physical keyboard). Opening a hidden tool by URL shows an explanation.
**The start page says what the other kind of device has** (to-do #36; owner, 27 Nov 2026: "When the app opens in the mobile
on the landing page indicate to the user that there are additional PC-only apps and when the app opens in the PC, notify to
the user that there are additional mobile-only apps"): a note under its first lines (`otherDevice()` in `src/main.ts`) —
on a PC the mobile-only apps by name ("3 more apps on a phone: Bubble Level, Compass and Touch Test — they need a phone's
sensors or touchscreen …"), on a phone the PC-only ones counted by category, the largest first ("64 more apps on a
computer: Software (56), Media (4) …"), every name under "Show the 64 apps" (by category, in the order of the tab row);
up to six apps are named in the sentence, more are counted. The site's address to open on the other device. Counted from
the registry; on the start page only. e2e `other-device` 36 (a PC, an iPhone and an Android phone; held to the registry
and to the counts of `docs/TOOLS.md`; axe in both themes).

**Images**
| id | Tab | Platform | Engine |
|---|---|---|---|
| `image` | Image Editor | both | own C wasm `imgproc` + MozJPEG/WebP/OxiPNG (jSquash) |
| `batch` | Batch Images | **PC** | `imgproc` resize + jSquash + zip.js |
| `heic` | HEIC → JPG | both | libheif (C++ → wasm, libheif-js) + Little CMS (lcms-wasm: Display P3 → sRGB with the photo's profile) + jSquash |
| `passport` | Passport Photo | both | MediaPipe Face Landmarker (eyes/chin/tilt) + selfie multiclass (person mask, crown via `p_mask_top`) → layout to head-height / eye-height rules (`src/lib/passport.ts`) → crop region only at full res → guided-filter matte + required colour → one homography warp (`p_warp_quad_fill`) → 300 dpi JPEG, digital-upload JPEG (px/KB limits), 4×6 in / A4 sheets |
| `formphoto` | Photo & Signature Resizer | both | presets (`src/lib/form-specs.ts`: IBPS/SBI/RBI, SSC, UPSC, NTA, PAN — px + KB ranges, all editable, "confirm with the notification"), face auto-framing (BlazeFace), paper clean-up (`imgproc` ink), resize @jsquash/resize, DPI (`metacore`), MozJPEG best quality ≤ max, JPEG comment padding up to the min (`metacore` `m_jpeg_pad`); KB read strictly (max × 1,000, min × 1,024 bytes) |
| `bgremove` | Background Remover | both | MediaPipe selfie-multiclass (6 categories) → person mask in C (`p_person_mask`: hair+skin+clothes, accessories only next to the person) → `imgproc` guided-filter matte at full res → transparent PNG / colour / blur / another photo (`p_composite_img`) |
| `cartoon` | Cartoonizer | both | `imgproc` filters (DoG lines, k-means, Kuwahara, dodge, halftone) + Magenta arbitrary style transfer (TF.js: WebGL → wasm XNNPACK → CPU) + AnimeGAN v2's anime looks (ONNX Runtime Web) |
| `tosvg` | Image to SVG | both | colour: VTracer 0.6.5 (our vtracer.wasm); black and white: Potrace 1.16 (esm-potrace-wasm); imgproc's black and white (`flat.c`) |
| `clipart` | Clipart Maker | both | the subject cut out by U²-Net small (rembg's u2netp on ONNX Runtime Web), refined by imgproc's guided filter → imgproc `flat.c` (two smoothings, greedy k-means++ in CIE Lab, specks taken in, DoG ink lines) → VTracer → the styles (`src/lib/clipart.ts`) |
| `redact` | Blur & Redact | both | MediaPipe BlazeFace on the whole photo + multi-scale square tiles (small faces in group photos), NMS + pixelate/blur/fill in `imgproc`; manual boxes; tap a box to keep it visible |
| `watermark` | Watermark | both | canvas text/logo watermark |
| `caption` | Text on Image | both | canvas captions / meme text |
| `collage` | Collage Maker | both | canvas photo grid |
| `exif` | EXIF / Photo Info | both | ExifTool 13.42 (Perl on zeroperl, WebAssembly) in a worker: every tag of every format; strip metadata losslessly (colour profile + orientation kept) |
| `scanner` | Doc Scanner | both | page finder DocCornerNet LEAN (scanic-ml, MIT) on ONNX Runtime Web (fed by imgproc's OpenCV-exact area resize) → else `imgproc` outline (Otsu + largest region) → else the whole photo; draggable corners, homography warp, enhance (`imgproc`); PDF via MuPDF (`src/lib/pdf.ts`: photos JPEG, B & W PNG) or JPEGs |
| `clipper` | Newspaper Clipper | both | the OCR tab's page finder → the page sharpened (imgproc `p_sharpen`) and read by Tesseract laid out as a page (its blocks) → headlines, pictures (imgproc ink regions) and a story from its headline (`src/lib/clipper.ts`) → its parts in reading order (textcore's XY-cut) as one tall picture (MozJPEG / OxiPNG), an A4 PDF (MuPDF) or its text (Copy, .txt, Read aloud → Text-to-Speech) |
| `bookflat` | Book Page Flattener | both | own C in imgproc (`wasm/imgproc/flatten.c`: page-dewarp's method — the text lines found, a curved sheet and the camera fitted to them by Levenberg–Marquardt, the gutter of a spread split, lines held to the margins) → each page drawn flat at the photo's resolution; PDF via MuPDF or JPEGs |
| `ocr` | OCR | both | Tesseract (C++ → wasm), English, French, Spanish, German; a file, or the camera (phone) / webcam (PC) live in the page (`src/lib/livecam.ts`) |

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
resized (Lanczos in linear light, @jsquash/resize) to the level's dpi of the largest page, re-encoded with MozJPEG (grey stays
grey) and kept only if ≥ 8 % smaller; images with a colour-key /Mask stay as they are; fonts subset; `garbage=deduplicate`. Levels Light 220/84 · Recommended 150/72 · Strong
110/60 · Extreme 80/48 (dpi / quality); Target size (KB of 1,000 bytes, at least 20) tries them in order; Scanned pages = one
JPEG per page at the exact page size, at most 100 megapixels (text layer, links and form fields lost, warned). Nothing is
downloaded when the file cannot get smaller; a run keeps its own file (a PDF chosen meanwhile gets nothing from it) and
ends with the tab; e2e 20), `pdf-sign` (12: draw
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
**As built after the Nov 2026 bug hunt** (rules in `src/lib/docrules.ts`, unit `tests/unit/docgen.test.mjs` 19; e2e invoice
29, rent 16, resume 12; `tests/lib/docgen-check.mjs` reads the PDFs back — links, JPEGs, the QR code with zbarimg): the
pages' **links survive** into the PDF (`htmlToPdf` makes them again on the drawn pages; MuPDF gives mailto: / tel: back as
"OEBPS/…" paths, which are mended) — the invoice's e-mail, the resume's e-mail, phone, LinkedIn / GitHub / project
addresses (only mailto:, tel:, http(s); other text stays text). The invoice's **UPI QR is the QR tab's `upi()`**
(NPCI: the @ as it is, two decimals, cu=INR; its notes under the UPI box); a due date before the date is said. **Save
details keeps the pictures** (logo, signature, photo as data: URLs) and Load brings them back; a download waits for a
picture still being read; the preview's updates end with the tab. Rent: three receipts a page when they fit, else two,
else one (a cash receipt's stamp box spilled each page onto an empty one); up to 120 months; what stops the receipts
said in words (months reversed, no rent, too many) and a PAN that is not five letters, four digits and a letter
warned. Resume: the photo is a JPEG (quality 85); file names are made safe (`safeName`).
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
| `pdf-redact` | PDF Redact | both — **BUILT** (27 Nov 2026; potentials #61 — §3 "PDF Redact": numbers, words and areas taken out for good) |
| `pdf-ocr` | Make PDF Searchable | both — **BUILT** (27 Nov 2026; potentials #3 — §3 "Make PDF Searchable": an invisible OCR text layer on scanned pages) |
| `pdf-compare` | PDF Compare | both — **BUILT** (27 Nov 2026; potentials #15 — §3 "PDF Compare": two versions compared word by word, the changes marked on their pages side by side) |
| `pdf-tables` | PDF Tables → Excel | both — **BUILT** (27 Nov 2026; potentials #16 — §3 "PDF Tables → Excel": the tables of a bank statement or a bill as Excel or CSV) |
| `idcopy` | Safe ID Copy | both — **BUILT** (27 Nov 2026; potentials #93 — §3 "Safe ID Copy": the Aadhaar number masked, "For … only" stamped across, flattened) |
| `epub` | PDF → EPUB (Kindle) | **PC** — **BUILT** (see §3) |
| `kindlepdf` | PDF for Kindle | both — **BUILT** (27 Nov 2026; potentials #109 — §3 "PDF for Kindle") |
| `articles` | Articles → Kindle | both — **BUILT** (27 Nov 2026; potentials #106 — §3 "Articles → Kindle": saved web articles made into one EPUB) |
| `ebook` | EPUB Reader | both — **BUILT** (27 Nov 2026; potentials #71 — §3 "EPUB Reader": EPUB, MOBI, FictionBook, comics, text) |
| `audiobook` | PDF / EPUB → Audiobook | both — **BUILT** (27 Nov 2026; potentials #14 — §3 "PDF / EPUB → Audiobook": a book read aloud into MP3s, one per chapter) |
| `slicedice` | SliceDiceGrapher | both — **BUILT** (28 Nov 2026; potentials #75 with Chart Maker #25 — §3 "SliceDiceGrapher": a range pasted from Excel, LibreOffice Calc or Google Sheets, or a spreadsheet → a board of pivots and graphs from presets, your own pivot, every graph and pivot saved as a picture and as CSV / Excel) |
| `diagram` | Diagram Editor | **PC** — **BUILT** (28 Nov 2026; potentials #54 — §3 "Diagram Editor": draw.io 32.7.7 itself, served from this site in a frame of its own with a strict policy, driven by its embed protocol — standard shapes, UML, flowcharts …; open .drawio, editable PNG / SVG, Visio, Gliffy, Mermaid, PlantUML; save .drawio, PNG / SVG with the diagram inside, PDF) |
| `sheet` | CSV / Excel Viewer & Converter | **PC** — **BUILT** (sheet.wasm; open xlsx/xlsm/xlsb/xls/ods/csv/tsv/json and the "Excel" files that are web pages or Excel 2003 XML, sheet tabs incl. hidden, separator override, filter, export CSV (BOM) / TSV / JSON / XLSX; as built: §3 "CSV / Excel"; unit `sheet.test.mjs` 120 + `sheetdata.test.mjs` 42, e2e 32) |
| `markdown` | Markdown Editor | both — **BUILT** (cmark-gfm wasm; live preview, toolbar + Ctrl+B/I/K, .md open/save, standalone .html, print of the preview only; as built: §3 "Markdown Editor"; unit 29 incl. the 744 GFM spec examples, e2e 46) |

**Security**: `pgp` OpenPGP · `sodium` Sodium Encrypt · `sharelink` Encrypted Share Link (ciphertext in the
URL `#fragment`, never sent to a server) · `hash` Hash / Checksum · `password` Password Generator ·
`passphrase` Passphrase Generator — all both.

**Media**: `video` Video Compressor (both, **BUILT**) · `audio` Audio Recorder (both, **BUILT**) · `tts` Text-to-Speech (both, **BUILT**) ·
`ffmpeg` FFmpeg (**PC**, **BUILT**) · `screencast` Screencast (**PC**, **BUILT**) · `screenshot` Screenshot (**PC**, **BUILT**) ·
`youtube` YouTube Clip (**PC**, **BUILT**)

**Calculators** (all both): `calc` Scientific · `units` Unit Converter · `dates` Date Calculator ·
`emi` EMI · `gst` GST · `sip` SIP · `fd` FD / RD · `percent` Percentage · `words` Number to Words ·
`timezone` Time Zone Converter · `bmi` BMI · `calories` Calorie (BMR/TDEE) · `duedate` Pregnancy Due Date ·
`tip` Tip & Bill Splitter · `billsplit` Bill Splitter by Photo (**BUILT** 28 Nov 2026, potentials #78 — §3 "Bill Splitter by
Photo") · `fuel` Fuel Cost · `gpa` GPA · `base` Number Base Converter · `roman` Roman Numerals

**Text** (all both): `wordcount` Word Counter · `case` Case Converter · `lines` Line Tools · `replace` Find &
Replace · `diff` Text Diff · `fancy` Fancy Text · `emoji` Emoji & Symbols · `morse` Morse Code · `lorem` Lorem Ipsum ·
`photodict` **Photo Dictionary (PC + mobile — owner, 21 Nov 2026; see §3)** · `camreader` Camera Reader (**BUILT** 28 Nov 2026, potentials #81 — §3
"Camera Reader") · `spell` Spell Checker (**BUILT** 28 Nov 2026, potentials #10 — §3 "Spell Checker")

**Software** — owner rule: **every Software tool is PC only.** Moved here from the old "Text & Dev": `json` JSON
Formatter · `regex` Regex Tester · `base64` Base64 · `urlenc` URL Encoder · `epoch` Epoch Converter · `uuid` UUID
Generator · `color` Color Converter · `jwt` JWT Decoder. New: `sqlite` SQLite Playground (official SQLite wasm) ·
`jq` jq Playground (jq C source → wasm) · `yaml` YAML ⇄ JSON ⇄ TOML (our Rust formats-yaml.wasm) · `xml` XML Formatter /
XPath · `json2types` JSON → Types (TS/Go/Rust/Java/Python) · `jsondiff` JSON Diff · `sqlfmt` SQL Formatter
(our own formatter, Rust → devcore-sqlfmt.wasm) · `prettier` Code Formatter (Biome's official wasm, dprint's JSON and markup plugins; Prettier for Markdown and as the fallback — §3) · `mockdata` Mock Data Generator · `mdtable`
Markdown Table · `cidr` Subnet / CIDR (IPv4+IPv6) · `chmod` chmod Calculator · `x509` Certificate Decoder (own
DER parser) · `sshkey` SSH Key Generator (Ed25519, OpenSSH format, libsodium) · `hmac` HMAC Generator · `pwhash`
Password Hash Tool (Argon2id/bcrypt/PBKDF2) · `apikey` API Key Generator · `curl` cURL Converter · `cron` Cron
Explainer · `escape` String Escape · `unicode` Unicode Inspector · `hexview` Hex Viewer · `logview` Log Viewer ·
`mermaid` Mermaid Diagrams · `sla` SLA / Uptime · `transfer` Data Transfer · `semver` Semver Checker · `glob`
Glob Tester. Left out: API client (CORS/CSP), DNS/WHOIS/ping/port scan (need network), cloud cost calculators.

**Codes & Files** (all both): `qr` QR Generator · `barcode` Barcode Generator · `scan` QR & Barcode Scanner ·
`numcheck` Number Detective (**BUILT** 27 Nov 2026, potentials #84 — §3 "Number Detective") · `wifiqr` Router Sticker → Wi-Fi QR (**BUILT**
27 Nov 2026, potentials #88 — §3 "Router Sticker → Wi-Fi QR") · `visitcard` Visiting Card → Contact (**BUILT** 28 Nov 2026, potentials #89 — §3
"Visiting Card → Contact") · `zip` Create Zip · `unzip` Extract Archive

**Everyday** (all both): `deadlines` Paper Deadlines → Calendar (**BUILT** 28 Nov 2026, potentials #77 — §3 "Paper Deadlines → Calendar") ·
`worldclock` World Clock (**BUILT** 28 Nov 2026, potentials #73 — §3 "World Clock") · `stopwatch` · `countdown` · `pomodoro` · `interval` · `dice` · `coin` · `rng` ·
`picker` · `teams`

**Device** (all both): `webcam` · `mic` · `speaker` · `keyboard` · `pixels` · `touch` · `screen` · `level` ·
`compass` · `soundmeter` · `ruler` — `keyboard` is **PC only**; `level`, `compass`, `touch` are **Mobile only**.

Batch 3 (accepted): **Math & Science** category (new): `graph` Graphing Calculator · `equation` Equation
Solver · `stats` Statistics · `matrix` Matrix · `fraction` Fraction · `primes` Prime/LCM/GCD · `periodic` Periodic
Table. Calculators: `prepay` Loan Prepayment · `ppf` · `epf` · `nps` · `inflation` · `sleep` Sleep Cycle · `bodyfat` ·
`idealweight` · `coords` Coordinates. Media: `noise` Noise Remover (RNNoise 0.2, Jitsi's WebAssembly build, **BUILT**) · `pitch` Pitch & Speed (Signalsmith Stretch, **BUILT**)
· `slideshow` Slideshow Maker (WebCodecs, **BUILT**). Documents: `invoice` GST Invoice · `rent` Rent Receipt · `resume` Resume
Builder (HTML → browser "Save as PDF"). Images: `signature` Signature Maker. Software (PC): `graphviz` (Graphviz C →
wasm) · `python` (CPython 3.14 C → wasm32-wasi, built by us) · `totp` · `pwstrength` (zxcvbn) · `jsonschema` · `bitwise` · `ieee754` ·
`contrast` · `baseenc` · `bindecode` · `httpstatus` · `mime` · `ports` · `ascii` · `keycode` · `gradient` · `shadow` ·
`svgo` · `patch`.
**Speech to Text** (`stt`) — **removed by the owner on 20 Nov 2026** to make room for apps used more often (its two
Whisper models were 238 MB of the site's 1 GB). The tab, its whisper.cpp build and its tests are in the git history
(last in commit `f1e9f21`); Auto Subtitles (`docs/potentials.md` #13), which would have reused it, was removed with it.

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
**Offline mode, PC only (owner, 21 Nov 2026) — BUILT (as built: below):** "keep the existing functionality … add a new offline
mode … download a high quality latest model to the local computer … the sophisticated light Indian accent one", then:
"I intend that this runs entirely from the user's PC, not in the browser. So you will also have to find out whether this
operating system is Linux or Windows, and appropriately download whatever is needed for the user to run it. Also give
instructions in the offline mode. Also make this offline mode for PC only." Plan: the tab tells Windows from Linux
(user-agent client hints, as `src/lib/ytdlp.ts` does for yt-dlp) and offers, as links the person clicks (nothing fetched by
the page; the CSP unchanged), a native speech program and the model — candidates: sherpa-onnx's prebuilt offline TTS
(Apache-2.0; Windows and Linux builds; runs Kokoro, Piper / VITS voices and others) with MeloTTS EN_INDIA (MIT) or another
light Indian-English model chosen by ear (samples first, owner's pick, size of the downloads said); a ready script for
that system (.bat / .sh) holding the text typed in the tab, which writes the speech to a WAV and an MP3; step-by-step
instructions in the tab. The existing in-browser mode stays exactly as it is.
**Owner, 21 Nov 2026 (later the same day) — what is PC only, and what goes into it:** "the whole text to speech app should
not be PC only. Only this new offline mode of this app should be PC only." → the tab stays **PC + mobile**; on phones the
Offline mode is simply not offered (the in-browser voices are all there). And: "in the new offline pc-only Text-to-Speech
mode … it's just going to be offline and will finally be downloaded to the user's PC. Knock yourself out and include many
more large, sophisticated models. Not just … the Indian accent, but even for the US accent, UK accent, and include more
options also in offline mode. Especially for the Indian accent, I want the Indian accent to be as light as possible.
Include many more voices in offline mode." → no size limit of the site applies to these models (they go to the PC, not
onto GitHub Pages): a catalogue of many large, high-quality voices — US, UK and Indian English (the Indian ones chosen
for the lightest accent with clear diction), more accents and options beside them — each with its size, licence and a
note on what it sounds like; the person picks the voices, the tab gives the downloads and the script for them.
**Owner, 21 Nov 2026 (third message):** "include as many different variants of Indian, US and [UK] accents as you can, even
if they are large in size. That's the whole point of it being offline mode … it doesn't affect the size of … my GitHub
project." → every good offline voice found goes into the catalogue, whatever its size; the files are downloaded by the PC
from where their makers publish them (Hugging Face, the engines' releases) — nothing of them is in the repository or on
the site.
**Offline mode as built (21 Nov 2026)** (`src/tools/tts-offline.ts`, imported when the mode is chosen — 111 KB / 24 KB
gzip with the catalogue; `src/lib/offline-tts/`: `catalogue.json` from `python3 scripts/make-offline-tts-catalogue.py`,
`plan.ts`, `scripts.ts`, `driver.py`; unit `offline-tts.test.mjs` 55 (+2 with `OFFLINE_TTS_E2E=1`) and `offline-tts-plan.test.mjs` 168, e2e
`tts-offline.e2e.mjs` 48). On a PC a "Mode" switch above the text: **In this browser** (the tab as it was) or **Offline
on this PC**; phones never see the switch.
- **What the page does:** nothing but write a script. Windows or Linux is detected (client hints, else the user agent;
  another system is told the scripts are for those two) and can be switched; the script for that system holds the text,
  the chosen voices (the job) and `driver.py` as Base64. The CSP is unchanged; no request leaves the page.
- **What the script does on the PC:** everything in one folder (`%USERPROFILE%\SuperUtils-TTS`, `~/SuperUtils-TTS`):
  **uv 0.13.9** from its wheel on PyPI (SHA-256 checked; x86-64 and ARM64) → Python 3.12 (uv's own build) → each engine
  in its own environment with **pinned packages** (`engines` in the catalogue) → the models from **Hugging Face at
  pinned commits** (`fetch()` in driver.py; plain HTTPS, `HF_HUB_DISABLE_XET=1`) → `output/<date_time>/<voice>.wav` and
  `.mp3` (lameenc, 128 kbps). **Each engine's environment is `envs/<engine>`**, made the first time by `uv venv` +
  `uv pip install` with the engine's pins (a `.pins` file says which; new pins make it again; a later run starts at
  once), so that **PyTorch's build fits the PC: `UV_TORCH_BACKEND=auto`** — the CUDA build for the NVIDIA card there is,
  else the processor's (`+cpu`, about 1 GB against 4 – 5 GB). Until 21 Nov 2026 the scripts ran each engine with
  `uv run --with`, which has no such choice (only `uv pip` and `uv tool run` take `--torch-backend`): every Linux PC got
  PyPI's CUDA build with 4 GB of NVIDIA libraries, and a Windows PC with an NVIDIA card never got its GPU used (found
  in this sandbox's cache; checked here by running MMS through the script: `torch 2.15.0+cpu`, no NVIDIA package).
  **Each engine is installed with its lock** (`envs/<engine>.lock`, from `scripts/data/offline-tts-locks.json` —
  `python3 scripts/make-offline-tts-locks.py`: `uv pip compile --universal`, Python 3.12, for every engine's packages;
  PyTorch keeps its version but not its build (+cpu …), NVIDIA's libraries and Triton are left to PyTorch's CUDA build)
  given to `uv pip install` as constraints (`-c`): a PC gets the versions that ran here, whatever a library releases
  later (21 Nov 2026: coqui-tts asks only for transformers ≥ 4.57, and transformers 5.24, out that day, broke XTTS-v2 on
  every fresh install — now pinned 5.23.0 as well). A new lock or new pins make the environment again (`.pins` holds
  both). The accent survey (`run.py`) installs the same way.
  **What it shows while it works** (owner, 21 Nov 2026 — a first run sat silent after "== Parler-TTS: 1 voice" for
  minutes, "is this stuck?"): uv is not quiet (its download bars and "Installed n packages"); under each engine's heading a
  line says what its first run downloads — its programs (PyTorch with the first engine that needs it, again with an
  engine that pins its own), the size with PyTorch's NVIDIA build, its model files (`firstRunNote`, sizes from
  `runsOf`); driver.py says "The programs are ready; starting." and "Downloading <repo>: <files> …" before a model, with
  Hugging Face's progress bars.
  Windows: a `.cmd` that runs the PowerShell under it (ASCII, CRLF; Windows PowerShell 5.1 is part of Windows 10 / 11).
  Linux: bash with curl or wget. A gated model (Indic Parler-TTS) makes the script ask once for a Hugging Face token
  (hidden input), kept in the folder's `cache/huggingface/token`, and **checks it at once** (owner, 21 Nov 2026: his
  token was refused only after gigabytes of programs): `driver.py job.json --check-access <repo>…` with huggingface-hub
  alone (`CHECK_PINS`) — `auth_check`, and on a refusal `access_help` tells the three cases apart by `whoami`: a token
  Hugging Face does not know (make a "Read" token, delete the saved one), an account that has not accepted the model's
  conditions (its name, the page, "Agree and access repository"), a fine-grained token without "Read access to contents
  of all public gated repos" — and stops before any engine ("Nothing else was downloaded"). A later refusal (fetch) says
  the same. The libraries' SyntaxWarning / FutureWarning / DeprecationWarning lines are filtered out (they read as errors).
- **The voices (2,327 in 67 models, 19 engines; round 2 on 21 Nov 2026 — owner: "include them all"):** grouped Indian
  (574) / American (555) / British and Irish (669) / other accents (225) / accent not documented (304); filters by engine, sex and
  words; sizes counted once per model; licences shown, "personal use only" marked; XTTS-v2 (Coqui Public Model License,
  non-commercial) needs its licence ticked before the download; a model not run here carries the tag "not run by
  SuperUtils yet" with the reason (`UNTRIED` in the generator). **Accents are filed only where the makers document
  them**; where they do not, the voice is under "accent not documented" and its label says what our test heard — except
  Kyutai's recordings that come with no word about the speaker (below), which are filed as heard and say so.
  - **Piper** (piper-tts 1.8.0): every English voice of rhasspy/piper-voices except LibriTTS — VCTK's 109 speakers by
    VCTK's own accent list (Indian: p248, p251, p376), L2-ARCTIC's 24 (Hindi L1: ASI, RRBI, SVBI, TNI), CMU ARCTIC's 18
    (ksp Indian; eleven not described), ARU's 12, SEMAINE's 4, and the single voices.
  - **Kokoro** (kokoro 0.9.4 — hexgrad's own pipeline: misaki's dictionary, spaCy's tagger (en_core_web_sm 3.7.1 from
    Hugging Face, handed to spacy.load by its folder), eSpeak NG for words it does not know — every word is spoken;
    sherpa-onnx's Kokoro drops unknown words): 20 American and 8 British voices with the authors' grades, and the 4 Hindi
    voices reading English three ways (American or British reading, or eSpeak's Hindi rules); and **goonj-1-82M**
    (BH-Builds, Apache-2.0 — Kokoro-82M trained further on Indian speakers): 10 Indian English personas and 4
    Hindi-native ones, read the same way (the engine runs each Kokoro-family model with its own weights and voice packs).
    Two of goonj's and Indic Parler's two recommended voices are ticked when the mode opens.
  - **Parler-TTS** (parler-tts 0.2.3, transformers 4.46.1, sentencepiece 0.2.0 — 0.2.3's protobuf code needs protobuf 5,
    which the audio codec's package forbids): **Indic Parler-TTS** (AI4Bharat; 21 Indian English speakers, Thoma and Mary
    recommended; gated), **Large v1** (9.3 GB) and **Mini v1.1** (3.8 GB) with 34 named speakers each (accents not
    documented). A speaker is described in words ("Thoma speaks at a moderate pace …"; the pace from the speed); the
    text goes in pieces of ≤ 240 characters with one seed.
  - **XTTS-v2** (coqui-tts[codec] 0.28.0): 58 studio voices (accents not documented; their made-up names say nothing
    reliable — each is "a deeper / middle / higher voice" by the measured pitch of a sample) and the **163 recordings of the
    engines that clone** (below). A clip is read with librosa — torchaudio ≥ 2.9 hands decoding to torchcodec, which needs
    FFmpeg on the system.
  - **Pocket TTS** (pocket-tts 4.0.1; the package pins its model files): its 21 English voices, accents from VCTK's list
    where a voice was made from VCTK; no speed control (said). The sex of the others from the pitch of a sample. **With
    voice cloning** (the gated kyutai/pocket-tts at the revision the package pins): the 163 recordings (below).
  - **The recordings of the engines that clone** (XTTS-v2, Pocket cloning, Chatterbox and Turbo, VoxCPM2, VibeVoice, F5;
    `clone_clips()` in the generator; owner, 21 Nov 2026: "as many different variants of Indian, US and UK accents as you
    can"): the cleaned ("enhanced") recordings of kyutai/tts-voices — **the 57 voice donations Kyutai's voices file as
    Indian** (a donor whose name says India, a recording in Hindi, an Indian accent heard clearly; the five named ones
    keep their old ids, `xtts-clip-imran` …) and **VCTK's 106 speakers** with the accents, sexes and ages of VCTK's list
    (p248, p251, p376 Indian) — 60 Indian, 66 British and Irish, 21 American, 15 other, 1 not documented.
  - **MeloTTS** (MyShell, MIT; k2-fsa's ONNX conversion `csukuangfj/vits-melo-tts-en` on sherpa-onnx 2.0.2): American,
    British, Indian, Australian and its default voice — five women's voices. sherpa-onnx reads only the words of the
    model's dictionary (it spelled out or left out the others, and every digit): `spoken()` in driver.py writes numbers,
    money, times, dates and titles in words (num2words), and every other unknown word is added to a copy of the dictionary
    with **g2p_en's** pronunciation (`G2pNet`: g2p_en's predict() with its weights — importing g2p_en would download NLTK
    data, which NLTK 3.10 refuses through a proxy; the port gives g2p_en's own phonemes).
  - **Supertonic** (Supertone; package supertonic 1.3.1, MIT; models OpenRAIL-M, at the revisions the package pins):
    versions 1, 2 and 3, ten voices each (F1 – F5 women, M1 – M5 men — pitch agrees), 16 steps.
  - **Indic Tiny TTS** (sulabhkatiyar/indic-tiny-tts-english; weights CC BY 4.0, code MIT): IISc SYSPIN's two Indian
    English speakers, its own small package from the repository, run on ONNX Runtime (no PyTorch); reads ₹, lakh, crore.
  - **Qwen3-TTS** (Alibaba, Apache-2.0; qwen-tts 0.1.1): the nine speakers of the 0.6B and 1.7B CustomVoice models, and
    12 VoiceDesign voices described by sex, age and manner. **No speed control:** an instruction to speak slowly or
    faster moved the 1.7B model's pace by about 5 % (tested), and the 0.6B takes none. **VoiceDesign gives no accent in
    English**: light, mild and strong Indian accents, a South Indian one and RP all came out North American (tested).
  - **OmniVoice** (k2-fsa / Xiaomi; code Apache-2.0, model CC BY-NC): 40 voices made of its own words — sex, age and an
    accent (Indian, American, British, Australian, Canadian × young / middle-aged / older; Chinese, Japanese, Korean,
    Russian, Portuguese). **Its accents do come through** (tested: Indian first for 3 of 4 Indian voices).
  - **Bark** and **Bark small** (Suno, MIT; transformers 4.57.3): the 20 v2 presets (English and Hindi speakers — the
    Hindi ones read English with an Indian accent); sex from each preset's own reference audio (EnCodec codes decoded,
    pitch measured; a middle voice left unsaid). No speed. Very slow on a processor.
  - **Chatterbox** and **Chatterbox Turbo** (Resemble AI, MIT; chatterbox-tts 0.1.7, which pins PyTorch 2.6 — counted as
    a second PyTorch): their own voice and the 163 recordings; Resemble's inaudible watermark (Perth).
  - **Veena** (Maya Research, Apache-2.0; 3B Llama + SNAC 24 kHz, as its card decodes): Kavya, Agastya, Maitri, Vinaya.
  - **VoxCPM2** (OpenBMB, Apache-2.0; voxcpm 2.0.3): 8 described voices (the description in brackets before the text, as
    its card shows; the later parts of a long text take the first part's voice) and the 163 recordings.
  - **F5-TTS** (SWivid; f5-tts 1.1.22; code MIT, model CC BY-NC 4.0 — personal use; v1 Base, 336 M parameters, 1.4 GB with
    Vocos 24 kHz): the 162 English recordings of the engines that clone (the Hindi one is left out: its vocabulary has no
    Devanagari), each with **what is said in it** — F5 needs the words of its reference: `scripts/data/clip-transcripts.json`
    from `scripts/make-clip-transcripts.py` (Whisper large-v3 turbo, pinned; no recording is above F5's 12 s, so none is
    cut). torchaudio's file reading (torchcodec → FFmpeg) is replaced by soundfile (`wav_tensor` in driver.py).
  - **VibeVoice 1.5B** (Microsoft, MIT; its card: for research and development; Microsoft's own `vibevoice` 0.0.1 on PyPI,
    the 1.5B inference code, transformers 4.51.3; 5.4 GB; text tokenizer Qwen2.5's at a pinned revision): the 163
    recordings; no speed; about 12 GB of memory on a processor.
  - **SYSPIN** (IISc, MIT; Coqui TTS VITS, characters): Indian English woman and man. **MMS** (Meta, CC BY-NC; transformers
    VITS): its English voice.
  - **Kyutai TTS 1.6B** (Kyutai, CC BY 4.0; moshi 0.2.13, which needs PyTorch below 2.10 — its own PyTorch 2.9; 4.1 GB):
    **601 voices**, one for every recording of kyutai/tts-voices that has Kyutai's embedding for this model (the model
    takes the embedding, so nothing is recorded or analysed on the PC; the two Freesound clips are left out — the README
    gives no licence): VCTK's 106 speakers (VCTK's own list), EARS and Expresso (CC BY-NC: "personal use only", marked per
    voice — `personal` on the voice), Alba MacKenna, Unmute's voices and **228 voice donations** (CC0). The pace is the
    model's padding between words (`kyutai_bonus` in driver.py: 3 × (1 − speed), held within ±3; measured 0.62× – 1.3× of
    the normal pace, every word read back by Whisper at each). **How a recording without a description is filed**
    (`heard_accent` in the generator; `scripts/data/kyutai-voices-heard.json` from `scripts/accent-survey/recordings.py` and
    `languages.py`): a donor whose name says India → Indian ("the donor says so"); a recording in another language —
    Whisper base sure of it, 0.8 and more: 16 Spanish, 7 French (de Gaulle's appeal among them), 1 Malay, 1 Hindi — → "a
    Spanish speaker (the recording is in Spanish)", under other accents (an Indian language under Indian); an English one
    by SpeechBrain's CommonAccent when it hears one accent first by 0.05 and more ("accent heard in our test: Indian"),
    else under "accent not documented" ("accent not clear in our test (nearest: …)"). Sex: VCTK's list, the README (EARS
    p003, p031), Expresso by each speaker's pitch, the rest "a deeper / middle / higher voice" by the recording's pitch.
    57 of the donations are Indian.
- **Measured here (Linux, 4-core processor, no graphics card; every voice run was read back by Whisper small.en, its
  pitch measured with pYIN and its accent heard by SpeechBrain's CommonAccent model):** Supertonic 1 / 2 ≈ 8× faster than
  real time, 3 ≈ 2.6×; Indic Tiny ≈ 7×; MeloTTS ≈ 3.5×; MMS ≈ 2.7×; Kokoro ≈ 4×; Pocket ≈ 2×; XTTS-v2 ≈ 1.7× slower (studio
  voice), 2.6× with a clip; Qwen3-TTS 0.6B ≈ 3.5× slower, 1.7B CustomVoice and VoiceDesign ≈ 4.5×; OmniVoice ≈ 6×; Parler Mini ≈ 5.5×; Bark
  small ≈ 8× slower (13 s of speech in 100 s, after its 1.6 GB download); SYSPIN ≈ 4× faster; Kyutai 1.6B ≈ 8.5× slower
  (float32; 15 GB of memory — said in the tab); with their downloads included, Bark (full) 13.5 s of speech in 8 minutes,
  VoxCPM2 6 s in 5, VibeVoice 1.5B 8 s in 5, Veena 6 s in 7, F5-TTS 10 s in 34 (≈ 200× slower: a 4-core processor). Every
  engine was run here with its lock as the scripts make it (`python3 scripts/accent-survey/smoke.py WORK ENGINE:VOICE …`,
  21 Nov 2026). The accent of every Indian voice that runs here: the ranking below. Qwen's voices sound North American.
  Chatterbox and Turbo 5 s in 10 and 9. Not run here (tagged in the tab): Indic Parler and Pocket cloning (gated), Parler
  Large (9.3 GB, the program of Parler Mini). **The Windows script is run for real on GitHub's Windows runner** (to-do
  #13; PowerShell cannot be installed in the sandbox): "Windows offline speech" (`.github/workflows/windows-tts.yml`, by
  hand; input `voices` = a JSON list, one job per entry) runs `tests/unit/offline-tts-run.test.mjs` with
  OFFLINE_TTS_E2E=1 — the .cmd as a double-click runs it: a WAV and an MP3 per voice, each engine's packages held to its
  lock, and (without `voices`) exit code 1 for a voice that cannot be made. Linux: the same suite runs the .sh here.
  Left out (docs/BUGHUNT.md, "TTS offline"): Indic-Speak (gated; its
  inference code cannot be read without access), Maya 2 (no pinnable release; Linux and NVIDIA only), ZONOS3-Mini (an
  Indian accent with a dose; on a processor only through its C++ tool). To-do #7 (round 2's rest): F5-TTS, VibeVoice, the
  Indian voice donations for every engine that clones and the engines not run here — done; the new Indian voices
  measured until the owner stopped the survey at 104 (below; more: `scripts/accent-survey/finish-7.sh WORK --surveys`).
- **Indian accents, lightest first** (owner, 21 Nov 2026: "keep a note that shows ranked all the Indian accents in order
  of increasing Indian accent thickness … the topmost … as British sounding as possible … name the model … Don't clutter
  the page … a kind of text pop-up … when the user clicks a button"): a small button beside the accent groups opens a
  dialog (`openRanking` in `src/tools/tts-offline.ts`, `rankIndian` / `strength` / `ACCENT_WORDS` in `plan.ts`): every
  Indian voice that was measured, lightest first — #, a tick (chooses the voice as the list does), the voice and its
  model, a bar and words for the Indian accent (very light at −0.2 and below — Indian 5th – 15th of the 16 accents —,
  light up to 0, clear up to 0.25, strong above), what it sounds like otherwise (English (England), Scottish, American …);
  then, folded under one line, the Indian voices not measured, by model, with the reason (an account, a size this
  machine cannot run). **The survey of 21 Nov 2026:** 104 voices measured (192 recordings), 77 heard as Indian first;
  lightest: XTTS-v2's voices made from VCTK p251 and p248, Kyutai's and XTTS-v2's VCTK p376, XTTS-v2's voice donations
  "Indian guy" and Imran; strongest: some of Kyutai's voice donations (Aadi, Rahul) and goonj's Indian English voices.
  **Stopped there at the owner's word** (21 Nov 2026: "if there are enough top Indian accents ranked, then can we stop
  the remaining ranking altogether … without loss of any functionality") — every voice stays in the catalogue and its
  scripts; the 470 not measured are listed with the reason (`NOT_MEASURED` in the generator: copies of recordings
  already measured — Chatterbox / Turbo, VoxCPM2, VibeVoice, the rest of XTTS-v2 and Kyutai —, F5 too slow here, Bark
  and Veena stopped, Indic Parler and Pocket cloning gated). **How it is measured** (`scripts/accent-survey/`): every runnable Indian voice reads
  the same two British sentences through driver.py; SpeechBrain's CommonAccent classifier (ECAPA-TDNN on Common Voice,
  16 accents, pinned revision) scores each recording; a voice's `heard.indian` = its Indian score minus its best other
  score, averaged over the two sentences (above 0: heard as Indian first), `heard.like` = the closest other accent. The raw
  scores are committed (`scripts/data/indian-accents.json`, from `python3 scripts/make-indian-accents.py WORK`); the
  generator turns them into the catalogue's `heard`, and the unit suite works them out again from the raw scores. To
  measure again: `python3 scripts/accent-survey/run.py WORK` (hours on a processor), then the two scripts.
- **To update:** change a pin or a revision in `scripts/make-offline-tts-catalogue.py` (packages: `ENGINES`), make its lock
  again (`python3 scripts/make-offline-tts-locks.py ENGINE`), run the generator, run the engine on a short text with its
  lock (`smoke.py` above), both suites.
Tests: Kokoro 24 kHz mono, plausible length and energy, female median F0 > male + 40 Hz (Heart vs Michael), British
voice, 2× speed ≈ half the length, Piper 22.05 kHz with female above male pitch, MP3 frames, sentence progress, stop,
markdown → text.
**As built after the Nov 2026 bug hunt** (e2e 16; docs/BUGHUNT.md tab 146): Stop ends the run at once and Speak works
again right after (it stayed busy for good); the worker takes runs one after another (two shared one ONNX session) and
a cancelled run ends at its next sentence; the sentence shown is the one being heard; a system voice that fails is
said; a .txt in Windows-1252 or UTF-16 is decoded as the CSV tab does; the model download grows its buffer when a
server sends more than it announced; WAV written by the browser's own 16-bit rule (see the Audio Recorder).

**Batch 4 (owner-requested):**
- **`bc` console** — PC only, shown **inside the Scientific Calculator tab** next to the keypad calculator (owner's
  explicit request; phones show only the keypad). Engine: BusyBox's `bc` (Gavin Howard's bc, arbitrary precision,
  `-l` maths library) from our BusyBox wasm build — **BUILT** (`src/tools/bc-console.ts`, runs in the terminal worker;
  each Enter replays the session through `bc -lq` so variables/functions persist and shows only the new output;
  errors shown without breaking the session; e2e `tests/e2e/bc-console.e2e.mjs` 30).
  **Every result in a variable (to-do #10, owner, 21 Nov 2026 — done):** each number bc prints gets the next free name —
  A … Z, AA … ZZ, AAA …, as Excel names its columns — shown at the right end of its row (a click puts `$A` into the
  input); one Enter that prints several rows (a loop, `1; 2`) names each row. A later line uses it as `$A`; names are
  case-insensitive (`$a` is `$A`). `$total = 7 * 6` names a result yourself (a letter first, then letters, digits, _);
  the automatic names skip a name the user took. **A $ name is set once:** `$A = …` again, `$A++`, `++$A`, `$A += 1` …
  are refused with what it holds; a name not yet set is said. The names are our glue (`src/lib/bcvars.ts`, unit
  `tests/unit/bcvars.test.mjs` 35): `$A` is replaced by the number as bc printed it, in brackets, before bc sees the
  line — never inside strings or comments, never a bc variable (bc's capital letters are hex digits); bc's own lower-case
  variables, loops and `define` functions work as before. Text rows (`print "…"`) and obase above 16 get no name. "Clear
  session" starts the names again at A.
  **bc's own variables are $ names too (to-do #25, owner, 26 Nov 2026 — done):** "> interest=20.78 / > $interest … The interest
  variable should also be set, and the user should be able to use this interest variable as $interest subsequently." A
  variable the session has set — `interest=20.78`, `rate = 7.5` inside a line with other statements, a loop's `i++` and
  `total += i`, a global set inside `define` (not its parameters or `auto` variables), and `scale`, `ibase`, `obase` — is
  reached as `$interest` (`$Interest` too); it is put in as the variable itself, `(interest)`, so it is the value bc holds
  at that point (a later `interest = 21` is seen; a result's name keeps its number). Where a result has the same name
  (`$a` and bc's `a`), the result's name comes first and the console says so once; a $ name of a bc variable is for
  reading (`$interest += 1`, `$interest = 5` refused: change it without the $); "not set" names both ways to set a name
  and lists bc's variables with the results' names. Unit `bcvars` 79 (the substituted session also run by the native GNU
  bc), e2e `bc-console` 44.
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
  "superutils"); uname; nproc; chmod accepted without effect (WASI cannot store permissions); stat adds 755/644 bits;
  own realpath; dup2 via fd_renumber; setjmp/longjmp via wasm exception handling. UI (`src/tools/software/terminal.ts`):
  colour output, history, Tab completion, Ctrl+L, multi-line paste runs as a script, drag-drop upload, file panel with
  **Upload**, per-file **Download**, folder download as .tar, click-to-cd. Left out (cannot work in a browser tab):
  networking, mount, process lists (ps/top/kill), full-screen tty apps (vi, less, top). Tests:
  `tests/unit/terminal-applets.test.mjs` (**every applet has a known-answer case; the suite fails if one is added
  without**), `terminal.test.mjs` (shell), `busybox.test.mjs` (raw module under Node WASI), `tests/e2e/terminal.e2e.mjs`.
  **As built after the Nov 2026 bug hunt** (e2e 22; docs/BUGHUNT.md tab 156, docs/WASM-AUDIT.md 153): a crashed shell
  worker (out of memory) is started again with a line that says so — its files are gone; the file panel's errors in
  words; Ctrl+C during a command says why it cannot be interrupted (a synchronous WebAssembly call cannot be reached
  without shared memory, which GitHub Pages cannot enable) and that it stops by itself after 60 s. BusyBox 1.38.0 is the
  newest release (its ash / hush are not built in). **v86** (a real Linux in an emulated PC): **left out completely — owner, 20 Nov 2026** (do not suggest it again).

Removed by the owner from batch 3: Spin the Wheel, Tambola/Housie, Secret Santa, Scoreboard.

**Wallpapers — no longer rejected (owner, 21 Nov 2026: "I changed my mind. You can use the wallpaper tab. Make a note of
this.").** Declined on 16 Nov (photo wallpapers via Wikimedia Commons / NASA, or a procedural generator); the same day the
owner added "Wallpapers from Wikimedia and Museums" and the "NASA Image Explorer" to `docs/potentials.md` (#115, #114).
They are allowed; like every candidate, built when the owner picks them, after the size check and the approval of
their data hosts.

Rejected by the owner: Typing Speed Test, Tuner, Metronome, Discount Calculator, Unit Price Compare, News Shorts
(hourly AI news summaries — considered via GitHub Actions + llama.cpp; owner declined), Local AI / LLM tab and
Key-Sentence Summariser (in-browser llama.cpp/WebLLM with ~1.7B model — owner declined), and from `docs/potentials.md` (Nov 16 2026): Chess Board + Analysis (Stockfish),
Python/JS Linter & Formatter (Ruff/Biome), Offline Translation (Mozilla Bergamot); and (20 Nov 2026) **v86** — a real Linux
in an emulated PC, for the Terminal or a tab of its own: "leave out V86 completely"; and (20 Nov 2026, to make room for
apps used more often) **Speech to Text** — removed from the site — with **Auto Subtitles** (potentials #13).
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
**As built after the Nov 2026 bug hunt** (`src/tools/image-editor.ts`, geometry `src/lib/editor-geom.ts`; unit
`tests/unit/editor-geom.test.mjs` 6, e2e `tests/e2e/image-editor.e2e.mjs` 37): the live preview and the adjustments,
geometry and sharpening are imgproc.wasm's; **resizing on export is @jsquash/resize** (Squoosh's Lanczos-3 in linear
light, premultiplied alpha; in the codec worker — docs/WASM-AUDIT.md 109). Straightening keeps the largest centred
rectangle of the picture's shape without an empty corner (k = min(w / (w·cos + h·sin), h / (w·sin + h·cos))); the size
boxes take whole numbers 1 – 16,384. JPEG export puts a transparent picture on white (the codec worker, for every tab);
WebP and PNG keep transparency. **Batch Images** (`src/tools/batch.ts`, e2e 21): the same resize; sizes and the scale
(0 – 400 %) checked; Stop; files that cannot be read listed under the results. The shared result list
(`resultList` in `src/lib/imgtools.ts`) gives a second result of one name " (2)" (zip downloads keep every file).

### Passport Photo (India first)
Camera (owner, Nov 16 2026: **on phones use the phone's camera, on PC use the webcam** — one "Use camera" button opens
the live camera with getUserMedia on both: phone front/selfie camera by default + "Switch camera" for the back camera;
PC webcam; oval face guide, 3-second timer, selfie view un-mirrored) or upload (the picker does not force the camera: with
`capture` a phone opens only the camera, so a photo already taken could not be chosen — fixed 20 Nov 2026). **Busy real-world backgrounds (house, furniture, walls, people) are fully replaced** by the
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
**As built after the Nov 2026 bug hunt** (e2e `tests/e2e/passport.e2e.mjs` 25): a photo without a face hides the result
and says why (the newest photo wins); Cancel ends the camera's countdown; camera errors in words (`src/lib/camera.ts`,
shared with the QR scanner and the Photo Dictionary); the custom size is 10 – 150 mm; the online-upload copy is
resized with @jsquash/resize.

### Photo & Signature Resizer — as built after the Nov 2026 bug hunt
(`formphoto` in `src/tools/formphoto.ts`, presets and `kbRange` in `src/lib/form-specs.ts`; unit
`tests/unit/form-specs.test.mjs` 80, e2e `tests/e2e/formphoto.e2e.mjs` 47.) **KB limits are read the strict way**:
portals differ in what a KB is, so the file is at most maxKB × 1,000 and at least minKB × 1,024 bytes (both readings
pass; 50 – 50 KB, where they leave no room, is 50,000 bytes); the result line names the bytes. Order: crop (imgproc;
signatures, thumbs and declarations cleaned to white paper first) → @jsquash/resize to the exact pixels → MozJPEG at the
highest quality under the maximum → the dpi into the JFIF header (`encodeInRange`, shared with the Passport tab; the
size is judged with it) → JPEG comment segments up to the minimum (`m_jpeg_pad`, exact to the byte). A file that cannot
get under the maximum is not downloaded on its own (reason + "Download anyway"). Width and height 10 – 5,000 px, each
box refused with its own reason; the frame follows the boxes while they hold a valid size (the face is found once per
photo); the newest photo or kind wins.

### Background Remover — as built after the Nov 2026 bug hunt
(`bgremove` in `src/tools/bgremove.ts`, `personMask` in `src/lib/segment.ts`; e2e `tests/e2e/bgremove.e2e.mjs` 31.)
MediaPipe's selfie multiclass model → imgproc's person mask (hair + skin + clothes, accessories only next to the
person) → guided-filter matte at full size → transparent PNG, a colour (five swatches with a pressed state, or any
colour), a blurred background, or another photo (cover-cropped, resized with @jsquash/resize when saved). A mask
holding less than 0.3 % of the picture is "No person was found" (Save refuses with that reason); the status line says
how much of the photo the person fills. The newest photo and the newest background photo win. People only — objects
and animals would need another model (docs/WASM-AUDIT.md, 114).

### Blur & Redact, Watermark, Text on Image, Collage — as built after the Nov 2026 bug hunt
- `redact` (e2e 47): Save is refused while faces are still being looked for (it would save every face visible); the
  newest photo wins; boxes drawn during the search are kept; a failed search is said in the status line.
  **Every face at once, or only the faces chosen (to-do #15; owner, 26 Nov 2026: "a toggle to find all faces and redact,
  or … selectively choose only that face he wants to redact … any number of faces manually to redact and undo them, or
  select all the faces in one shot"):** a switch **"Redact every face found"** — on (the default, as before): every face
  hidden when it is found; off: the faces are found and outlined, none hidden until chosen; it keeps its setting for
  the next photo (while the page is open), and flipped it does the same to the photo shown. A tap (click, Enter) on a
  face hides it, another shows it again (`aria-pressed`); **"Redact all faces"** / **"Show all faces"** in one go; boxes
  drawn by hand stay as they are. **Undo** (and Ctrl+Z / ⌘Z) takes back the last change, step by step, back to how the
  photo began — taps, all / none, the switch, a box drawn, "Remove my boxes" (a box drawn during the face search keeps
  its Undo: the faces are added to what Undo brings back). The line under the photo: "6 faces found · 2 hidden · 1 box
  of your own"; Save saves what is shown. e2e: a group photo of six faces, black bars — the saved file's pixels at each
  face (hidden or the photo's own) with the switch on and off, two taps and one taken back, Undo and Ctrl+Z, all and
  none, Undo to the beginning; the switch kept for the portrait and undone there; phone touch targets.
- `watermark` (e2e 19): the preview is the first photo that opens; "Clear photos"; empty text refused; photos that
  fail are listed under the results; the saved photos' logo resized with @jsquash/resize.
  **The diagonal, and PDFs and Word documents (to-do #17; owner, 26 Nov 2026: "a watermark-style option; the watermark should
  be from the bottom left to the top right, diagonally right across the picture … I should be able to upload a PDF or a Word
  document, and the style of the watermark chosen should be applied to every page of this PDF or Word document"):**
  - **"Diagonal"**, a position beside the nine and "Tiled": one mark from the bottom left to the top right, turned by the
    picture's (or page's) own diagonal (atan(height ÷ width) — steeper on a tall photo), centred, as large as the diagonal
    holds inside the margin (the glyphs' own box, turned, touches it on the side that limits it); "Length along the
    diagonal" (20 – 100 %) takes the Size slider's place. Text or logo. The geometry of every document mark is
    `src/lib/wmlayout.ts` (`placeMarks`: the nine positions from the edges, the tiles, the diagonal — sizes a share of the
    page's shorter side, as on a photo; unit `wmlayout` 49).
  - **"Add PDFs or Word documents"** beside "Add photos": every page gets the mark as chosen, each page by its own shape
    (/Rotate and size); the preview shows the first document's first page (a PDF exactly as the file gets it; a Word page
    as Word will draw the mark, the page's own text left out). **PDF** (`markPdf` in `src/lib/docmark.ts`, MuPDF, as the
    PDF Watermark tab): drawn into each page's own content under an ExtGState for the opacity; the pages' text stays text.
    Text in Sans, Serif and Mono is vector text in PDF's standard fonts (Helvetica, Times-Roman, Courier; its glyph box
    measured from MuPDF's own drawing of it); Meme (Anton), Script and other scripts are a picture of the text made by the
    browser at up to 300 dpi; the shadow as on a photo — under vector text a picture of the same glyphs drawn by MuPDF and
    blurred by imgproc.wasm; a logo as chosen, with its transparency. A password is asked for (the shared prompt of the
    PDF tabs, `passwordAsker` in `src/lib/pdfui.ts`); the copy has none, and a signed PDF is said to lose its signature.
    **Word** (`markDocx` in `src/lib/docxmark.ts`; .docx and .docm; the old .doc and password-protected files are sent back
    with what to do): Word's own watermark — VML shapes in the headers, as Design → Watermark writes them (a text path:
    the font — Impact, Arial, Georgia, Courier New, Segoe Script for the tab's five —, colour, opacity, Word's shadow, which
    is not blurred; a logo as a picture with its opacity in its transparency), behind the text. **Every section gets a
    header part of its own for each header that shows on its pages** (default; first page with "Different first page";
    even pages with "Different odd and even pages"): a section that used the one before it ("Link to previous") gets a
    copy of it, so each mark is placed for its own page shape and nothing else in the headers changes; the mark goes at
    the start of the header's first paragraph (no new line in the header). One mark is named as Word names its
    watermarks (PowerPlusWaterMarkObject, WordPictureWatermark — Design → Watermark → Remove takes it away); tiles are
    shapes of their own; an earlier watermark is replaced. 7-Zip (7z-wasm) takes the zip apart and makes it again —
    `[Content_Types].xml` first, no folder entries (`exact` in the 7-Zip worker); the browser's DOMParser and
    XMLSerializer edit the XML. **Found with LibreOffice:** it keeps one shape of a `w:pict` (each shape is a run of its
    own); it sizes a text watermark by its width with its own line height (its letters taller than Word's) and grows it
    down from a top given in points — so a mark in the page's middle is centred by alignment, as Word writes its own.
    White text on a document: "shows only by its shadow" (or "does not show on a white page" without one).
  - e2e `watermark-docs` 57: photos of three shapes (angle within 1.5°, centred, the glyphs' turned box inside the margin
    reaching 97 %+; 50 % → half; a 5 : 1 logo's pixels as the fit worked out in the test); a PDF of five pages of four
    shapes, two turned by /Rotate and one with its box away from 0, 0, read back by MuPDF (the mark along each page's own
    diagonal, centred, inside the margin; the pages' text and the mark still text; tiled in every quarter; bottom right
    at the margin; the shadow; Meme as a picture; a password-protected PDF); `tests/fixtures/docs/sections.docx`
    (`scripts/make-docx-fixture.py`: four sections, A4 portrait and landscape and US Letter, own, linked, first-page and
    even-page headers, a table at the top of a header) read back by **python-docx** (every header a page shows has one
    mark; the headers' and the body's text as they were) and drawn by **LibreOffice** (all six pages, each along its own
    diagonal; tiled; a logo); watermarked again → replaced; the old .doc and a file that is no Word document said.
  - **The first page, the cover, with or without the mark (to-do #34; owner, 27 Nov 2026: "in the Watermark app for uploaded
    documents only, have an option to include (or not) the watermark on the first page or cover page..")**: a switch
    "Watermark the first page (the cover) too" under the documents — there only when documents are added, on by default
    (every page, as before), kept for the next document while the page is open. Off: a **PDF's** page 1 is left exactly as
    it was (`o.cover` in `markPdf`; a PDF of one page is refused with the reason; the preview shows page 2 and says so). A
    **Word document's** first section gets Word's own "Different first page" (`w:titlePg`, in its place among the
    section's properties) where it had none, and the cover a header of its own — a copy of the header page 1 showed —
    and a footer of its own — a copy of the footer page 1 showed, its page-number field too —, both without the mark; a
    first-page header or footer that was stored but not in use (Word keeps them when "Different first page" is switched
    off) stays off page 1, and a later section that took its first-page footer from section 1 keeps the one it had
    (pinned by a reference of its own; its headers have their own copies anyway). Where section 1 had a different first
    page already, its first-page header is left without the mark (an earlier watermark taken out). e2e `watermark-cover`
    40 — MuPDF: page 1 drawn exactly as the original's, pages 2 – 5 along their diagonals; python-docx and LibreOffice on
    `sections.docx` and `tests/fixtures/docs/cover.docx` (`scripts/make-docx-fixture.py`: a footer with a page number,
    a first-page header and footer stored but not in use, a later section taking them); a document marked whole, then
    with the cover left out (its earlier mark taken out), then whole again.
- `caption` (unit `textwrap.test.mjs` 18, e2e 14): `wrapLines` in `src/lib/textwrap.ts` breaks an over-long word
  (a web address, Chinese / Japanese without spaces) between grapheme clusters; text is made smaller until each block
  is at most 45 % of the height.
- `collage` (e2e 19): the saved photos resized with @jsquash/resize; an A4 JPEG says 300 dpi.
- `signature` (Signature Maker, `src/tools/signature.ts`, e2e `tests/e2e/signature.e2e.mjs` 24): draw (strokes kept in the
  pad's CSS pixels and scaled with the pad, so a narrower window or a turned phone keeps the whole signature), type (the
  three OFL handwriting fonts are fetched when "Type" is chosen — the pad needs none) or a photo (imgproc `inkToAlpha`;
  the newest photo wins; blank paper: "No ink was found in the photo"). The ink colour is the colour of the whole
  signature, strokes drawn before it was chosen too. The photo from a file or the camera (phones: the back camera;
  PCs: the webcam — §3 "Camera in every tab that takes a picture"); the picker does not force the camera.

### EXIF / Photo Info — as built after the Nov 2026 bug hunt
(`exif` in `src/tools/images.ts`; shaping `src/lib/photoinfo.ts`, engine `src/lib/exiftool.ts` in
`src/workers/exiftool.worker.ts` + `src/lib/exiftool-client.ts`; unit `tests/unit/exiftool.test.mjs` 87 — needs
`apt install libimage-exiftool-perl` for the native reference; e2e `tests/e2e/exif.e2e.mjs` 33.) **ExifTool 13.42**
(`@uswriting/exiftool`, Perl on zeroperl; `public/vendor/exiftool/zeroperl.wasm`, 25 MB / 7.6 MB gzipped, fetched with
the first photo, one job at a time in its worker, ended on leave). Reading: `-json -G1 -a -c %+.8f -m`; the summary
cards (location with decimal and DMS and an OpenStreetMap link, camera, exposure), "This photo gives away: …" (place,
date, camera or phone, serial numbers, names, people, an embedded preview, software, descriptions), every tag by
group; a broken GPS block or 0, 0 is no position. "Save without metadata": `-q -q -m -all= --icc_profile:all
-tagsfromfile @ -orientation -jfif:all` — the file keeps its format and its picture's bytes; the result is read
again (a position left would be refused); formats ExifTool cannot write are re-saved as JPEG. A file that is no
picture is named for what it is.

### Cartoonizer ("Prisma-like") — BUILT (`src/tools/cartoon.ts`, e2e `tests/e2e/cartoon.e2e.mjs` 45, `cartoon-detail.e2e.mjs` 10)
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
  "Hold to compare" (pointer, or Space / Enter held) shows the original. Measured: 512 px ≈ 6 s on WebAssembly (sandbox CPU).
- **As built after the Nov 2026 bug hunt** (e2e 45): a see-through photo or painting is put on white first (`onWhite`
  in `src/lib/imgio.ts`); one AI painting at a time — a change meanwhile waits and only the newest settings follow;
  Save in AI mode gives only a painting made with the current photo, style, strength and size (else the reason).
- **Finer, more detailed results (to-do #16; owner, 26 Nov 2026: "The Cartoonizer app's output is too coarse-grained. Make it
  more fine-grained with more detail, more like the Prisma app"; the models at Claude's discretion):**
  - **Why it was coarse:** the AI styles painted at 512 px on a processor (1024 on a real graphics card) and saved at that
    size; the network paints strokes of a fixed size in pixels, so a small painting has big strokes. The filters were
    tuned for 1000 px pictures, with ten colours.
  - **AI styles — "Brush strokes"** (in place of Size): Finest 4096 px (PC), Fine 2048 px (phones 1536), Medium 1024, Bold
    512 — never above the photo's own size; the painting is saved at that size. Defaults: Fine on a real graphics card,
    Medium on WebAssembly and the CPU. **Above 1024 px (768 on phones) the picture is painted in tiles** of 512 px
    overlapping by 96, blended linearly (`tiled` in `src/workers/style.worker.ts`), with the progress in the status line:
    the transformer normalises every layer by its features' mean and variance over the whole picture (conditional
    instance norm), so a tile normalised by its own statistics differs from its neighbours — **the whole picture is run
    once at 1024 px for those 26 statistics, and every tile is run with them fed to the graph in place of its own**
    (TF.js executes from fed intermediate nodes). Measured: tiles with their own statistics left visible bands; tiles
    fed the statistics of the whole picture at their own scale give the one-pass painting back (e2e: 0.9 of 255 and
    less); fed them at a smaller scale they are seamless and keep the style, the strokes as fine as the tiles' scale.
    Time on this sandbox's processor (WebAssembly, one thread): Medium (1024 × 740, one pass) 14.9 s, Fine (1800 × 1300,
    15 tiles) 77.7 s; a graphics card does it in seconds. `#/cartoon?tiles=same` (diagnostic) paints in tiles at every size with the statistics at the
    painting's own size — the suite compares that with the one-pass painting.
  - **Filters — "Detail"** Fine (the default) / Medium / Bold: the size (2000 / 1000 / 600 px) a filter's lines, brushes and
    smoothing are drawn for — the preview and the full-size save scale alike; Colours 14 by default (4 – 32). Two fixes
    in imgproc.wasm made the save look like its preview at fine detail: the line finder's blur is an exact Gaussian below
    σ 3 (`gauss_exact_f`: the three-box approximation cannot go below σ ≈ 1.4), and the colour quantiser starts from the
    luminance quantiles of the picture, not from pixels picked by index (each size started elsewhere and could settle on
    other colours) — the save against its preview, measured on the astronaut: 9.5 → 2.0 of 255.
  - **Measured** (e2e `cartoon-detail` 10; "detail kept" = the correlation of the edges, Sobel magnitudes, of the result
    and of the photo at the photo's size): AI style on a photo of a book page (1800 × 1300) — Fine 0.147 against Bold 0.045
    (the page readable through the strokes at Fine, blobs at Bold — the style's own strokes carry most of a painting's
    edges); Cartoon filter at 1200 px — Fine 0.946 against Bold 0.888.
  - **How cartoony, in grades (to-do #33; owner, 27 Nov 2026: "In the Cartoonizer app, in the cartoon filter, have some kind
    of gradation selection as to less cartoony or more cartoony.")**: "How cartoony" above the Cartoon filter's settings —
    **Subtle** (32 colours, ink lines 0.4, smoothing 1, Fine detail) · **Light** (20, 0.7, 2, Fine) · **Medium** (14, 0.9, 2,
    Fine — the filter's old defaults, lit at first) · **Strong** (8, 1.3, 3, Medium detail) · **Extreme** (5, 1.8, 5, Bold):
    fewer colours, darker and thicker ink lines and more smoothing grade by grade (`GRADES` in `src/tools/cartoon.ts`; no
    engine change). A grade moves the sliders and Detail to its values (the line under it names them); a slider or Detail
    moved afterwards makes a mix of your own (no grade lit) until a grade is picked again; the grades are the Cartoon
    filter's only. **Measured** (e2e `cartoon-grades` 23, from the results the tab shows): the difference from the photo
    (coffee 6.2 → 8.5 → 10.3 → 13.8 → 18.2; astronaut 5.8 → 21.5), the share of flat areas (73 → 91 %; 74 → 87 %) grow and
    the photo's edges kept (0.945 → 0.694; 0.968 → 0.788) fall from each grade to the next; Extreme saved at full size as
    its preview; a phone's grade buttons 44 px.
  - **Anime looks (offered 26 Nov 2026; built at the owner's word of 28 Nov 2026, "finish off the small choices"):** a third
    kind beside Filters and AI art styles (`src/lib/anime.ts`, worker `src/workers/anime.worker.ts` + `src/lib/anime-client.ts`;
    unit `anime` 28, e2e `cartoon-anime` 25). **AnimeGAN v2**'s **Hayao**, **Shinkai** and **Paprika** (Asher Chan /
    TachibanaYoshino — free for non-commercial use: personal use) and bryandlee's **face portrait v2** (MIT), each an ONNX graph
    of 8.6 MB (vumichien's and akhaliq's conversions on Hugging Face, pinned by SHA-256 in `scripts/assets.json`), run by ONNX
    Runtime Web (the app's copy, one thread) in a worker; a look's graph is fetched from this site the first time it is chosen,
    with its progress ("Fetching the Hayao look (4.3 of 8.6 MB, once a visit)…"), and the two used last are kept for the visit.
    **The picture in and out as the looks' own code makes them** (imgproc.wasm's C, `p_anime_in` / `p_anime_out`: RGB as
    v / 127.5 − 1 in single precision, the last row and column repeated to a multiple of 8; (y + 1) × 127.5 held to 0 … 255 and
    truncated, the padding cut off). **Size** — 1,536 / 1,024 / 512 px on a PC (1,024 at first), 1,024 / 768 / 512 on phones
    (768) —, never above the photo's own; the face portrait at 512 px at most (its export fixed 512 × 512: a smaller picture is
    padded by its edges). **Strength** mixes the drawing with the photo (imgproc's composite) without drawing again; Hold to
    compare; the tiles show what each look makes of the coffee photo and the astronaut's face (`public/data/anime/`, 160 px,
    fetched when the kind is first chosen). Save gives the drawing shown (`<photo>-anime-<look>.jpg`, JPEG 90), and is refused
    with what to do while a drawing is under way; a graph that cannot be fetched is said and fetched at the next try; leaving
    the tab ends the worker (the graphs with it). Nothing of it is fetched before the kind is chosen.
    **Measured:** ONNX Runtime Web gives native ONNX Runtime's pixels — a 100 × 66 crop of the coffee photo (no multiple of
    8: the padding) through each look, the scene looks within a step of rounding (unit; `tests/fixtures/anime/`, `python3
    scripts/make-anime-reference.py` — `pip install onnxruntime`); the face portrait within a few steps of 255: its export
    normalises each layer over all its values at once (8.4 million in a 512 × 512 picture) and ONNX Runtime Web's
    InstanceNormalization adds them up less exactly than the native one (its first layer 0.4 % off; native ONNX Runtime agrees
    with itself to 1, all optimisations on or off). In the browser the whole coffee photo at 600 × 400 (Hayao) and the
    astronaut (the face portrait) against native's, 20 px block by block (`blocks.json`); Hayao at 600 × 400 in about 8 s on
    this sandbox's processor.
  - **Looked at, not added:** White-box Cartoonization (a TensorFlow model — a cartoon look of its own). Real paintings as
    styles (public-domain Van Gogh, Hokusai …) would look more like Prisma's; Wikimedia is not reachable from this sandbox,
    and the built-in styles stay drawn by the page.

### Image to SVG — BUILT (potentials #1; owner's pick of 27 Nov 2026 — group 3 of the suggested order)
(`tosvg` in `src/tools/tosvg.ts`, the pipelines `src/lib/vectorize.ts` (no DOM) in `src/workers/vector.worker.ts` + `src/lib/vector-client.ts`; the
engines VTracer 0.6.5 (our vtracer.wasm — §5.1v), Potrace 1.16 (esm-potrace-wasm) and imgproc.wasm's `flat.c`; unit `tests/unit/vector.test.mjs` 65,
e2e `tests/e2e/tosvg.e2e.mjs` 25 (+ the camera sweep's entry); fixtures `tests/fixtures/vector/` by `python3 scripts/make-vector-fixtures.py`.) The
owner's words (potentials #1): "trace a logo, signature or scan into vectors".
- **Colour** (VTracer: each colour a shape, stacked, or cut out of one another): four kinds — **Logo** (colour detail 6 bits, gradient steps 16,
  specks under 4 px left out, curves), **Drawing** (7, 10, 6), **Photo as a poster** (8, 6, 10, corners from 75°), **Pixel art** (every colour, the
  pixels' own edges) — and the sliders (colour detail, gradient steps, specks, corners), the edges (curves, straight lines, pixels), "cut the shapes
  out of one another". The long side traced at most 1,600 px.
- **Black and white** (Potrace): a threshold (by hand or **Otsu's**), or **"a photo of paper"** (a signature, a page: imgproc's document clean-up
  finds the ink however the light falls, then 128 — measured on a signature photographed on paper lit unevenly: the ink traced overlaps the stroke
  as it was drawn by 86.9 %, Otsu's one threshold 39.2 % — the shadow turns to ink); invert; specks; smoothness (alphamax 0 – 1.33); curves joined
  (opticurve); the ink colour (the SVG's fill). The long side traced at most 3,000 px; the paper see-through.
- **The tab:** a picture (or the camera; Paste image); the picture and the SVG side by side, the shapes, the SVG's size and the threshold under it;
  every change traced again (the newest wins); **Download SVG** (the picture's name), **Copy SVG code**, **Save PNG** (as the picture, twice, four
  times, 2,048 px wide). A picture chosen in one kind is traced at the other kind's size when the kind changes. Nothing at open: the worker, VTracer,
  Potrace and imgproc with the first picture.
- **Measured:** VTracer's SVG byte for byte the native tool's (built on musl — on glibc its trigonometry differs in the last digit now and then, and
  a corner of a photo's path with it), on a logo, pixel art, photos and black and white; Potrace's paths the native potrace 1.16's; the logo's
  pixels inside its shapes 100 % in the colour drawn (99.3 % of all — the rest on its edges, a pixel either way), drawn by librsvg; pixel art's 576
  pixels back exactly.

### Clipart Maker — BUILT (potentials #117; owner, 26 Nov 2026; built 28 Nov 2026 — group 3 of the suggested order)
(`clipart` in `src/tools/clipart.ts`, the pipeline `src/lib/vectorize.ts` (`clipParts`, `cutMask`), the styles `src/lib/clipart.ts` (no DOM), the
worker `src/workers/vector.worker.ts`; unit `tests/unit/vector.test.mjs` (with Image to SVG), e2e `tests/e2e/clipart.e2e.mjs` 31 (+ the camera
sweep's entry).) The owner's words: "a new clipart maker app. User should be able to upload a picture and you should convert the picture into a
clip art as best you can."
- **The subject cut out:** U²-Net small (**u2netp**, rembg's model, Apache-2.0, 4.6 MB in `public/models/u2netp`, fetched from this site with the
  first photo, once a visit, with its progress) on ONNX Runtime Web, its input and output as rembg makes them (imgproc's `p_u2_planes` /
  `p_u2_mask` — held to rembg's own steps in Python: the subject overlaps by 99.2 – 99.99 %), on the photo at most 1,024 px; refined by imgproc's
  guided filter; islands and holes under 0.2 % of the picture taken in. A mask holding less than 1 % of the photo found nothing: the whole photo
  is used, and said.
- **From the photo's own pixels:** the subject's box taken from the photo (not the 1,024 px copy) at the clip art's size — 1,024 / 800 / 640 px for
  Fine / Medium / Bold —, the mask resized to it.
- **Two smoothings** (imgproc, sizes for 800 px, scaled): **light** (bilateral) for the ink lines, **strong** (bilateral, then Kuwahara) for the
  colours. **Flat colours** (`p_clip_flat`): k-means in CIE Lab seeded by **greedy k-means++** (scikit-learn's: 2 + ln k candidates a step, the best
  kept — one draw missed a small colour of its own, an eye or a button, one time in eight on the test picture) from a fixed seed (the same photo
  gives the same clip art); a mode filter evens the edges; areas under the detail's share of the picture (0.05 / 0.12 / 0.3 %) taken into their
  neighbours; **each colour the mean of its own pixels** (a speck taken in does not tint the area it joins). **Ink lines** (`p_clip_lines`):
  Winnemöller's difference of Gaussians (the Cartoonizer's line finder) at 1.5 px for 800 px, inside the subject and not at its edge (its outline
  is drawn there), specks of line left out — the eyes, nose and mouth the flat colours smooth away (measured: 6.3 % of the astronaut's face is ink).
- **Traced** by VTracer (stacked shapes; the subject's outline; the lines) and **composed in a style** (`clipSvg`): **Cartoon** (a black outline,
  the ink lines), **Flat** (colours only — icons, slides), **Sticker** (the ink lines, an outline in a darker shade, a white border, a soft
  shadow), **Line art** (white shapes with lines round every colour, the ink lines — a colouring page), **Silhouette** (the shape in one colour).
  Outline none / black / a darker shade, thin / medium / thick, ink lines, a line round every colour, the border, the shadow, the ink colour: a
  style or a switch changes the SVG at once (the same tracing); colours (3 – 24), the detail and the cut make it again.
- **The tab:** a photo (or the camera; Paste image); the clip art on a see-through chequer, its colours, shapes, size and time; **Hold to compare**;
  **Download SVG** (`<photo>-clipart.svg`), **Save PNG** (512 – 4,096 px, see-through); phones: the fixed bar. The newest photo wins. The choices
  are kept while the page is open; nothing is stored. Nothing at open: the worker, the engines and the model with the first photo.

### OpenPGP
Generate key pair (name, email, passphrase) → download armored public/private keys. Encrypt file
(to one or more public keys, optional signing), decrypt (+ verify), detached sign, verify, clearsign
text, symmetric (passphrase) encrypt/decrypt. Binary or ASCII-armored output.
**Profile: GnuPG-compatible** — v4 keys, Ed25519 (sign) + Curve25519 (encrypt), AES-256, SHA-512,
SEIPDv1 with MDC, iterated+salted S2K for passphrases (GnuPG cannot read Argon2 S2K yet).
Decryption accepts v4 and v6 (RFC 9580, AEAD/OCB, Argon2) input.
**As built after the Nov 2026 bug hunt** (`src/tools/pgp.ts`, reading what was pasted `src/lib/pgptext.ts`; unit
`tests/unit/pgp.test.mjs` 35 — the RFC 9580 Appendix A vectors in `tests/fixtures/pgp/rfc9580/`; e2e `tests/e2e/pgp.e2e.mjs`
34 against gpg 2.4): the armored block is found anywhere in what was pasted or chosen (an e-mail around it); **every
key block is read on its own** (OpenPGP.js reads only the first block of a text — a second recipient was dropped);
the wrong kind of thing in a box is named; the library's errors are said in words; a decrypted file takes the name
stored in the message; a message for another key names the key IDs; a good signature shows the signing key's
fingerprint and the date; decrypted text is shown whenever it is text. Engine: OpenPGP.js stays (docs/WASM-AUDIT.md,
tab 100: rPGP is low-level and its semantics layer is experimental).
**A second mode, "Latest standard (RFC 9580)"** (owner, 21 Nov 2026: "keep the existing functionality exactly the same
and add another, new mode which uses the latest OpenPGP standard, which may or may not be compatible with GPG";
settings and words `src/lib/pgpstd.ts`; unit `tests/unit/pgp9580.test.mjs` 68, e2e `tests/e2e/pgp9580.e2e.mjs` 40 —
against **rPGP** (rsop 0.12, rpgp 0.21) and **Sequoia PGP** (sqop 0.38, Sequoia 2.4), found by `$RSOP` / `$SQOP` or on
the PATH (build commands: docs/HANDOFF.md; skipped with a note where missing)). A "Standard" switch above the five
actions: **GnuPG-compatible** (the default — the tab exactly as it was; `gpgConfig` is its old settings, its suite
unchanged) or **Latest standard**: Generate makes a **v6 key**, Ed25519 + X25519 or Ed448 + X448, its secret parts
locked with **Argon2** (3 passes, 4 lanes, 64 MiB — RFC 9580's second recommended setting; the first wants 2 GiB, too
much for a phone) and AES-256 in OCB mode, asking for SEIPDv2 with AES-256 / OCB; Encrypt writes **SEIPDv2** (AEAD; OCB
first, the cipher both sides list) with v6 session keys, a password through Argon2 into a v6 SKESK; a recipient key
that does not offer SEIPDv2 (every GnuPG key) gets **SEIPDv1 with v3 session keys, as RFC 9580 §5.1 requires** — the tab
names those keys; Sign makes v6 signatures with a v6 key (SHA-512); **every result says its format** ("Format: SEIPDv2 —
AES-256 in OCB mode (AEAD, RFC 9580) · v6 session key for 1 key", "Made: v6 signature (RFC 9580) · Ed25519 · SHA-512"),
Decrypt and Verify too (also what another program made: Sequoia stretches passwords with iterated S2K inside a v6
SKESK, and the line says so). GnuPG 2.4 reads none of it (it follows LibrePGP) — said in the tab; it still decrypts the
SEIPDv1 messages this mode writes to its keys. A message encrypted with `format: 'object'` (to read its format)
keeps its data as a stream: `readOut` joins what `armor()` / `write()` give (the tab showed "[object Object]"). **Not there: post-quantum keys** (RFC 9980,
ML-KEM-768 + X25519 / ML-DSA-65 + Ed25519 — rPGP and Sequoia have them); OpenPGP.js 6.3.2, the newest release, does not.
A later step when the library has them (engine unchanged: docs/WASM-AUDIT.md, tab 100).
**Every password and passphrase of Encrypt is typed twice (to-do #30; owner, 26 Nov 2026: "in OpenPGP, for all possible
encrypt modes where a password or passphrase is asked, it should be asked twice (2 input fields), not just once"), in
both standards:** the message password with "Repeat password" (a typo there locks the message for good) and the signing
key's passphrase with "Repeat passphrase"; a line under the boxes says, as they are typed, when the two differ; Encrypt
refuses two that differ and makes nothing; Enter in the second box encrypts. Generate asked twice already; Decrypt and
Sign open what exists — one box. e2e `pgp` 40 (+6), `pgp9580` 27 with rPGP's rsop (its encrypting helper fills both boxes).

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
**As built after the Nov 2026 bug hunt** (`sodium_` in `src/tools/security.ts`; format `src/lib/usodium.ts` and
`src/lib/sodium-format.ts`; unit `tests/unit/usodium.test.mjs` 43, e2e `tests/e2e/sodium.e2e.mjs` 25): **the cryptography is
libsodium.js** (`libsodium-wrappers-sumo`, libsodium 1.0.22 — `src/wasm/libsodium.ts`) in the crypto worker; the 61-byte
header stays crypto.wasm's (our C); the format is unchanged (files of either engine open with the other; PyNaCl's
reference decryptor opens both). Encrypted text is read as people paste it — Base64 standard or URL-safe, broken over
lines, in quotation marks, or a whole share link (`readEncryptedText`); a .txt file holding it is read as the encrypted
bytes (`encryptedTextFile`); what is not encrypted text is said in words. The key derivation shows an indeterminate
progress with the memory it takes, and a failure to get that memory is said. The version in the note comes from the
worker after a run. The password box is a new password when encrypting and a plain one when decrypting (the browser must not offer to
make one up there).

### Encrypted Share Link — as built after the Nov 2026 bug hunt
(`sharelink` in `src/tools/security.ts`, reading a link `readShareLink` in `src/lib/sodium-format.ts`; unit in
`tests/unit/usodium.test.mjs`, e2e `tests/e2e/sharelink.e2e.mjs` 26.) The message is encrypted as Sodium Encrypt's text is
(USODIUM1, Argon2id "Interactive", libsodium.js in the crypto worker) and the bytes go into the link as URL-safe Base64
after `#/sharelink?d=` — the fragment, which browsers never send. **Composer:** message, password of at least 6
characters typed twice, "Copy link" / "Share"; a link longer than 2,000 characters gets a note with its length (some
apps cut long links; for a long text, Sodium Encrypt and a file). **Recipient:** the link is read as the page opens —
what follows `d=` up to the next `&`, space, quotation mark or bracket, without the full stop or comma of a sentence,
percent-escapes undone, white space dropped; a link that is empty, holds characters a link never has, is cut short
(a length Base64 cannot have, or fewer than 78 bytes) or was not made by this tab is said in words and there is no
Decrypt button. An empty password is asked for; a failure of the cipher says "the password is wrong, or the link was
cut or changed on the way" (the two cannot be told apart). Enter decrypts; the password box is not a new-password
box. "New message" goes back to the composer.

### Hash / Checksum
Algorithms: MD5, SHA-1 (legacy, labelled), SHA-256, SHA-512, SHA3-256, SHA3-512, BLAKE2b-256,
BLAKE2b-512, CRC-32. Streaming (large files), progress, paste an expected checksum to verify, compare
two files, hash typed text.
**As built after the Nov 2026 bug hunt** (`hash` in `src/tools/security.ts`; algorithms `src/lib/hashes.ts`, expected
checksums and lists `src/lib/checksums.ts`, worker `src/workers/hash.worker.ts` + `src/lib/hash-client.ts`; unit
`tests/unit/hash.test.mjs` 106, e2e `tests/e2e/hash.e2e.mjs` 40; reference `python3 scripts/make-hash-reference.py` —
needs `pip install pycryptodomex blake3 xxhash crc32c`; the unit and e2e suites also run sha*sum, b2sum, cksum, openssl,
and — where installed — `xxhsum` and `rhash` (`apt install xxhash rhash`)). **Engine: hash-wasm 4.13** (docs/WASM-AUDIT.md,
103) in its own worker, fetched with the first Compute or the first typed text; **Stop** ends a run. 23 algorithms: the
nine above, and under "More algorithms" SHA-224, SHA-384, SHA3-224, SHA3-384, Keccak-256, BLAKE2s-256, BLAKE3,
RIPEMD-160, CRC-32C, CRC-64 (XZ), Adler-32, xxHash64, XXH3-64, XXH128 (each chip's tooltip says where it is used).
Files are read 4 MiB at a time (progress with bytes and speed); text is hashed as it is typed (UTF-8). Shown as hex,
HEX or Base64; Copy gives what is shown. **The expected checksum** box (or a checksum list chosen with the files —
SHA256SUMS, *.sha256, *.md5, *.sfv, B2SUMS …, read and not hashed) takes a checksum as people paste it: hex in any case,
in groups or bytes apart, `0x`, Base64 / URL-safe Base64 (16 bytes and more), lines of sha*sum / b2sum / b3sum /
xxhsum (also `--tag` and `*binary` and coreutils' escaped names), openssl dgst, .sfv, certutil -hashfile, Get-FileHash
(table and list), `sha384-…` integrity values, and a download page's sentence ("SHA-256: …"). Lines with a file name
check that file (by the name as written, its last part, then without regard to case); a list's summary names the
files that do not match and the listed files that were not chosen. An algorithm the checksum names, or the usual one
of its length (8 → CRC-32, 16 → xxHash64, 32 → MD5, 40 → SHA-1, 56 → SHA-224, 64 → SHA-256, 96 → SHA-384, 128 → SHA-512)
is worked out as well when not chosen, and the tab says so; a mismatch names the other algorithms of that length with
"Try those too"; the verdict follows the box as it changes. **Two or more files** are compared by size and a secure
hash (BLAKE3 on the side when only weak ones are chosen) and the identical ones named. **Checksum list** card: the
files in the format of the command-line tool (CRC-32 as .sfv), Download as SHA256SUMS, MD5SUMS, B2SUMS, B3SUMS …
(`sha256sum -c` accepts it; a name with a backslash is written as it is — Ubuntu 26.04's `sha256sum`, uutils 0.10, and BusyBox read no escaped line — and only a line break is escaped as coreutils escapes it).

### Passwords
Random passwords (length, sets, exclude look-alikes, require each set) and diceware passphrases
(EFF large wordlist, 7776 words, CC-BY 3.0, `public/data/eff_large_wordlist.txt`). Shows entropy bits.
Randomness from libsodium `randombytes_uniform` (→ `crypto.getRandomValues`).
**Password Generator as built after the Nov 2026 bug hunt** (`password` in `src/tools/security.ts`, `src/lib/passwords.ts`;
unit `tests/unit/passwords.test.mjs` 25, e2e `tests/e2e/password.e2e.mjs` 25): randomness from **libsodium.js**
(`randombytes_uniform`, docs/WASM-AUDIT.md 104; the chunk comes as the tab opens — passwords are shown at once).
Length 4 – 128 by slider or box; upper, lower, digits, symbols (the symbols box: only printable ASCII that is not a
letter or digit, each once; what else was typed is named); "Avoid look-alikes" drops I l 1 | O 0 o ` ' ". With two or
more sets and a length that can hold them, every set is used at least once (a draw that misses one is drawn again, so
every allowed password is equally likely). The entropy is log2 of the number of passwords the settings allow
(inclusion–exclusion, BigInt) — Weak < 40, Fair < 64, Strong < 90 bits, Very strong above; the line under it gives the
alphabet's size and the rule. Five passwords, each with "Copy password n"; a click selects a whole password.
**Passphrase Generator as built** (`passphrase` in `src/tools/security.ts`, `src/lib/passphrases.ts`; unit
`tests/unit/passphrases.test.mjs` 13, e2e `tests/e2e/passphrase.e2e.mjs` 16): libsodium.js `randombytes_uniform` (docs/
WASM-AUDIT.md 105); the EFF large list is checked as it arrives (exactly 7,776 different words of a – z and hyphens,
else "the word list did not arrive whole" and nothing is made; SHA-256 `6d557f06…` in the unit suite); 3 – 12 words,
separator hyphen / space / dot / underscore / none, capitals, a digit after a random word; entropy = words × log2(7,776)
+ log2(10 × words) with the digit; "Copy passphrase n".

### Zip
Create zip (optional AES-256 password, WinZip AE-2 format) from multiple files; extract zip (incl.
AES/ZipCrypto passwords) and 7z/rar/tar/gz/bz2/xz via libarchive. Download single entries or all.
**Create Zip as built after the Nov 2026 bug hunt** (`zip` in `src/tools/archive.ts`, names and password rules
`src/lib/archive-names.ts`, worker `src/workers/sevenzip.worker.ts` + `src/lib/sevenzip-client.ts`; unit
`tests/unit/archive-names.test.mjs` 13, e2e `tests/e2e/zip.e2e.mjs` 28 — Python's zipfile, pyzipper, py7zr and the
native 7z read the results; `pip install pyzipper py7zr`, `apt install 7zip`). **Engine: 7-Zip 24.09 compiled to
WebAssembly (7z-wasm)**, fetched with the first archive, a fresh instance per archive, the files mounted read-only
(WORKERFS) with their own dates; **Stop**. Formats: **Zip** (deflate 0 – 9, UTF-8 names, AES-256 in WinZip's format) or
**7z** (LZMA2, AES-256, file names encrypted too unless switched off). Password: at least 4 characters, typed twice;
for a zip ASCII only (7-Zip and WinRAR cannot take other letters for a zip) — 7z takes any. Names: folder paths kept,
no leading / or .. parts, the same name again becomes "name (2).ext". Above 1.5 GB of input (256 MB on phones) a zip is
written by **zip.js** piece by piece (said in the tab) and a 7z is refused — 7-Zip holds the archive in memory.
**Extract Archive as built** (`unzip` in `src/tools/archive.ts`, the listing `src/lib/sevenzip-text.ts`, safe names
`safeParts` in `src/lib/archive-names.ts`; e2e `tests/e2e/unzip.e2e.mjs` 38 — `apt install unar` for the RAR reference):
**7-Zip (7z-wasm) reads every archive** — zip (AES, ZipCrypto), 7z (encrypted names too), RAR 1.5 – 5 (encrypted
headers too), tar, gz, bz2, xz, iso, cab, wim, cpio, arj, lzh, rpm, deb, dmg …; a tar inside gzip / bzip2 / xz is opened
in its turn. The password is asked for when needed and the same file opened again with Open or Enter; a wrong password
and a damaged archive are said (7z / RAR headers that do not decrypt: "wrong password — or damaged"). Files listed with
size and a lock when encrypted (first 2,000); one file at a time, "Save all to a folder" (File System Access; names made
safe) or "Download all as .zip" (7-Zip re-zips them) — the last two up to 1.5 GB (256 MB on phones). Stop.

### QR Codes
Generate: text, URL, Wi-Fi (WPA/WEP/none), UPI payment link (`upi://pay?pa=…&pn=…&am=…`), email, phone,
SMS, contact card. Error-correction level, size, colours, PNG/SVG download. Scan: camera (back camera
on phones) or image upload.
**QR Generator as built after the Nov 2026 bug hunt** (`qr` in `src/tools/codes.ts`, contents and checks
`src/lib/qrdata.ts`; unit `tests/unit/codes.test.mjs` 39, e2e `tests/e2e/qr.e2e.mjs` 27 — read back by the Scanner tab
and by zbar, `apt install zbar-tools`). Engine zxing-wasm 3.1.7 (docs/WASM-AUDIT.md 106). Wi-Fi as ZXing describes it
(\ ; , : " escaped; WPA 8 – 63 characters or 64 hex digits, WEP lengths, SSID ≤ 32 bytes — warnings, the code is still
made); UPI as NPCI writes it (`pa=` with its @, values percent-encoded, `am=` with two decimals and `cu=INR`; the
amount read as people type it — ₹ / Rs / INR, Indian or international commas; "49,50", three decimals, 0 or less are
refused and no code is made; a note above ₹1 lakh, for a UPI ID that does not look like one, and for notes over 50
characters); vCard 3.0 (RFC 2426 escaping); mailto (subject and body percent-encoded); SMSTO and tel with the digits
and +; VEVENT (RFC 5545 escaping of the title and place, local times in UTC, an end before the start refused). "What
the code holds" shows the exact text. Colours: a light code on a dark ground or contrast below 3 : 1 is warned about.
Too much text is said in words. The newest text wins when zxing answers out of order. PNG (256 – 4,096 px, saved as
qr-code.png) and SVG.
**Barcode Generator as built** (`barcode` in `src/tools/codes.ts`, checks `src/lib/barcodes.ts`; unit
`tests/unit/barcodes.test.mjs` 26 — GS1 check digits against python-stdnum, `python3 scripts/make-barcode-reference.py`;
e2e `tests/e2e/barcode.e2e.mjs` 50 — read back by the Scanner tab, zbar and libdmtx). Twelve formats (EAN-13, EAN-8,
UPC-A, UPC-E, Code 128, Code 39, Code 93, ITF, Codabar, Data Matrix, PDF417, Aztec). Before zint draws: EAN / UPC digits
only (hyphens and spaces of an ISBN dropped), the check digit added or checked ("should be 0, not 1"), zeros zint
adds in front said and the full number shown; UPC-E 6 – 8 digits with number system 0 / 1; ITF digits (a zero added
in front of an odd count, under 6 digits pointed out); Code 39 upper-cased with a note, its characters checked;
Codabar's A – D start and stop; Code 128 Latin-1 only, Code 93 ASCII only (the 2-D formats take any text). zint's own
errors without their numbers. A typed value stays when the format changes; an untouched sample is replaced.
**QR & Barcode Scanner as built** (`scan` in `src/tools/codes.ts`, `describeCode` in `src/lib/qrdata.ts`; e2e
`tests/e2e/scan.e2e.mjs` 21): back camera (getUserMedia; a second Start ends the first stream; refused / missing / busy
cameras said in words; a frame every 250 ms, one that cannot be read is skipped), an image file, or a screenshot pasted
with Ctrl+V. Each code once, newest first, titled with its format ("QR code · Wi-Fi network") and shown field by
field: Wi-Fi (network, password with its own copy button, security, hidden), UPI (payee, ID, amount, note; "Pay with a
UPI app"), vCard / MECARD ("Save contact (.vcf)", CRLF), VEVENT ("Add to calendar (.ics)", wrapped in VCALENDAR; UTC
times in local time), mailto, SMSTO / sms:, tel:, geo:, http(s) links (the site shown; opened in a new tab with
noopener); javascript: and data: stay text. The raw text is always shown with Copy; Clear empties the list.

### Visiting Card → Contact — BUILT (potentials #89; owner's pick of 27 Nov 2026 — group 4 of the suggested order)
(`visitcard` in `src/tools/visitcard.ts`, the card's wording and the vCard `src/lib/visitcard.ts` (no DOM), the second look
`src/lib/snapsecond.ts`; the numbers by devcore-ids.wasm's `ids:tel`; unit `tests/unit/visitcard.test.mjs` 80, e2e `tests/e2e/visitcard.e2e.mjs`
30 (+ the camera sweep's entry); fixtures `tests/fixtures/snaps/card-*.jpg` — eight cards of our own making, `truth.json` —, by `python3
scripts/make-snap-photos.py`.) The owner's words (potentials #89): "photograph a business card → name, phone numbers, e-mail, company,
address → a contact file (.vcf) to save, or its QR" — "phone numbers by #33's libphonenumber if built": #33 is not built, so the
Number Detective's engine reads them (libphonenumber's rules for India, every country's calling code).
- **Reading the photo:** the camera helpers' way (`SNAP_READ`, §3 "Router Sticker → Wi-Fi QR") — with `invertDark` for a dark card
  (PaddleOCR read one as it stood: "Parther", the e-mail's domain wrong, the address lost; turned over, Tesseract read it all) — and a
  QR code on the card by zxing-cpp: a **vCard** (2.1 with quoted-printable, 3.0 as iPhones write it — grouped properties, several
  TYPE parameters —, 4.0 with tel: URIs) or a **MECARD** is read exactly, and the printed text adds what it leaves out (`mergeContacts`).
- **The card's wording** (`readCard`): each line cut into its parts (two columns: an address beside the numbers); then, in this
  order, **e-mail addresses** (a label before them, spaces round the @, © read for @), **websites** (www., http(s)://, or a bare domain
  in lower case with a known ending — not B.Tech, Pvt. Ltd. or St. Mary's), **phone numbers** (labels before them — M, Mob, Mobile,
  Cell, WhatsApp, HP; Tel, Ph, T, P; O, Off, Office, W, Direct, Board; R, Res, Home; F, Fax; Toll free — or after them in brackets:
  (M), (O), and (0), an (O) read as a zero; a second number after a slash takes the first's label; "+44 (0)20" the trunk (0) left
  out; not the PIN code of an address, not a GSTIN), **the address** (lines of one column one after another that score as an
  address: a PIN code, a UK postcode, a US state and ZIP, street words — Road, Floor, Plot, Nagar, Suite …; St and Dr only after a
  word —, a house number, a country, an Indian state), then **the name** (a few capitalised words, no digit, no company or title word;
  scored by the size of its letters, a title before it — Dr., Shri, CA … —, and above all by agreeing with an e-mail address on the
  card: ananya.iyer@ → Ananya Iyer), **the company** (Pvt. Ltd., LLP, Inc …, company words, and a domain it spells: kaverisoft.in ←
  Kaveri Software), **the job title** (title words; next to the name scores more); what is left is "Also on the card" (a slogan, a
  GSTIN), each line addable to the note.
- **Names** (`splitName`): a title before (Dr., Mr., Prof., Er., Adv., CA, Shri, Smt. …) and degrees after (", MD", MBBS, PhD …) set
  apart; the last word the last name (a switch: the family name first); a name in capitals given its capitals only at the start of
  each part (ANANYA IYER → Ananya Iyer, O'BRIEN → O'Brien). **Addresses** (`parseAddress`): the street, city, state or region,
  postcode and country — "Bengaluru 560001", "Ahmedabad, Gujarat 382445", "London W1G 9PF, United Kingdom", "San Jose, CA 95134", a
  state after the PIN ("Bengaluru - 560 034, Karnataka").
- **Numbers** (`phoneOf`, the engine's `ids:tel` — §5.1 devcore): an Indian number in libphonenumber's international form (+91 98450
  12345, +91 80 4112 3456) with its kind (mobile, landline and its place, toll-free); another country's with its calling code and the
  card's grouping (+44 20 7946 0958; its own rules are not checked — said under the box); **a number printed without a calling code on
  a card from abroad is that country's first** — the card's calling code from its other numbers, else its address (a US state and
  ZIP: +1; a UK postcode: +44; a country named; the trunk 0 dropped where the country has one): "020 7946 0959" on a London card is no
  landline of Pune, whose STD code is 020 too. The kind: the card's label, else the engine's (a mobile number → Mobile, else Work).
- **A line read again:** a phone number's, an e-mail address's or a website's line Tesseract was unsure of (a word under 90) goes to
  PaddleOCR's recogniser (`secondLook`); the surer reading is kept, but **a number that keeps libphonenumber's rules is never given up
  for one that breaks them**.
- **The contact file:** vCard 3.0 (RFC 2426) — N, FN, ORG, TITLE, TEL with its TYPE (CELL; WORK,VOICE; HOME,VOICE; WORK,FAX), EMAIL,
  URL (https:// added to a bare domain), ADR;TYPE=WORK by its parts, NOTE; text escaped, CRLF, lines folded at 75 octets never inside a
  character; several contacts in one file. Named after the person ("Ananya Iyer.vcf"; "contacts-4.vcf").
- **The tab:** a photo (or the camera; Paste image) → a contact card: the name (one box, its parts said under it), job title,
  company, numbers (kind and number, what the engine says of each under it; on phones the number on a row of its own), e-mail
  addresses, websites, the address by its parts, a note, "Also on the card", "What was read on the card"; its QR code (the vCard, error
  correction L) beside it, following every box; **Save contact (.vcf)** (phones: the share sheet — Contacts), **Save QR (PNG)**,
  **Read the other side** (the next photo is added to this contact: a card with more on its back), Remove. Each photo adds a contact
  at the top; "Save all n contacts (.vcf)", "Remove all", "Type a contact by hand"; phones: the main action in the fixed bar. The
  contacts last while the page is open; nothing is stored. Nothing at open: the OCR, zxing-cpp and devcore-ids.wasm come with the
  first photo, PaddleOCR with an unsure line.
- **Measured** (eight photos — an Indian card with (M) and (0); one with its company above the name and "Mob: … | Tel: …"; a doctor's
  card from London in two columns; one with a vCard QR code, a fax and two mobiles after a slash; a card from the United States; a
  dark card; a card's front and back): every field as printed in Node and in the browser, the two sides one contact; every .vcf the tab
  saves read by **vobject** (Python, the independent reader: N's five parts, FN, the numbers' TYPEs, ADR by its parts, folded NOTE with
  ₹ and Devanagari), the QR code read back by **zbar** and its vCard by vobject.

### Router Sticker → Wi-Fi QR — BUILT (potentials #88; owner's pick of 27 Nov 2026 — group 4 of the suggested order)
(`wifiqr` in `src/tools/wifiqr.ts`, the label's wording `src/lib/wifilabel.ts` (no DOM), the camera helpers' reading `src/lib/snaptext.ts`,
the code `src/lib/qrdraw.ts`; unit `tests/unit/wifiqr.test.mjs` 40, e2e `tests/e2e/wifiqr.e2e.mjs` 24 (+ the camera sweep's entry);
fixtures `tests/fixtures/snaps/router-*.jpg` with `truth.json`, made by `python3 scripts/make-snap-photos.py` — labels of our own
making photographed on a desk; the unit suite reads them through the tabs' own reading path in Node, `tests/lib/snapread.mjs`.) The
owner's words (potentials #88): "photograph the label under the router → its network name and password read → a Wi-Fi QR for guests".
- **Reading the photo** (the camera helpers' way, `SNAP_READ` in `src/lib/snaptext.ts`): the OCR's reading path (§3 OCR, "one reading
  path") with two options made for small things — `layout: 'both'` (read as one block and as a page, the better score kept: as one
  uniform block Tesseract dropped a visiting card's name set larger than the rest; laid out as a page it read nothing of a label with a
  QR code on it and misread a receipt's total) and `small` (a page found that gave fewer than 25 words is still the thing: the whole
  photo, read too, is kept only with clearly more words read surely — confidence 80 and up —, not for more words: a desk's grain read
  as letters gave more, and won); and `invertDark` (light text on a dark ground turned dark on light first — a dark visiting card,
  28 Nov 2026). `linesOf`: each line cut into parts at gaps wider than 1.1 × its height (a label's two columns, a QR code's specks
  beside a value), specks — signs alone, short words read under 45 — left out; a group of digits never by its confidence (Tesseract
  gave "+91 98470" of a dark card's number a confidence of 0, read right). A QR code on the label is read by zxing-cpp on the photo.
- **The label's wording** (`readLabel`): keys as routers print them — SSID, Network Name (SSID), Wi-Fi / WLAN / Wireless Name, Wireless
  Password/PIN, Network Key (Password), WLAN / Wi-Fi / WPA / WEP Key, PSK, Passphrase, Password —, a band in brackets or around the key
  ((2.4G), 5G SSID, (5GHz)), a key's value up to the next key or the part's end (two fields on a line; a value standing apart in the
  next part — a label set as a table — taken), the word right after "Key:" its value whatever it says ("Password: password"), a key
  after a word only with its colon ("Default SSID:"). **Not the Wi-Fi password, set aside and listed:** a password named for the
  router (Admin / Login / Web …), a plain "Password" on a line with a user name or right under one, the WPS PIN, the address of the
  settings page. Names and passwords paired by band, else one password for every name, else in order; a QR code's network (WIFI:,
  ZXing's escapes) first and exact, its lines found on the label. **Characters to look at again** (0 / O, 1 / l / I, 5 / S, 2 / Z,
  8 / B, 6 / G, 9 / g / q, u / v, rn / m, vv / w) named for a password read by the OCR; a WPA password under 8 or over 63 characters
  pointed out.
- **A name's or a password's line read again** when Tesseract was unsure of it (a word under 90): its crop from the picture read goes
  to PaddleOCR (the second reader) — **its recogniser alone, the crop being one line** (`src/lib/snapsecond.ts`, shared with the
  Visiting Card tab; `paddleRead`'s `line` option, 28 Nov 2026: the detector cut a short line into boxes that overlap and their texts
  joined twice what stood in both — "+91 98450" + "0 12345 (M)") —, and the value each reader gives is weighed by the readers'
  confidences (`secondBetter`: the shares of words read right at each confidence, measured for the OCR) — measured: a label's
  "kT7mq2Vr9w" read "kT7mq2Vrow" at 74 by Tesseract in the browser, right by PaddleOCR. The line under the picker says so.
- **The tab:** a photo (or the camera; Paste image), the progress; each network a card — "Network 1 · 5 GHz", "from the label's QR
  code" or "read from the label — check it" — with its name, password (monospace), security (WPA / WPA2 / WPA3, WEP, No password) and
  "Hidden network", all editable, the QR code following the boxes (the QR tab's `wifi()` writer, drawn by zxing-cpp); **Save QR (PNG)**,
  **Card for guests** (1200 × 1650 px: the code, the network and the password — to print or show), Copy password; "Add a network by
  hand"; "Not the Wi-Fi password" (what was set aside, and what it is for); "What was read on the label". Nothing at open: the OCR,
  zxing-cpp and PaddleOCR come with the first photo. The photo and the password never leave the device.
- **Measured** (the five photos — a dual-band router's label, a fiber gateway's with its admin login under the Wi-Fi password, one with
  "Network Name (SSID)" / "Network Key (Password)", a login line and a WPS PIN, an LTE router's with a QR code, the first one
  photographed with the phone held sideways): every network and password as printed, nothing else taken for them, in Node and in the
  browser; every code the tab makes read back by **zbar** (`zbarimg`) — the PNG, the guests' card, after an edit, an open network.

### Number Detective — BUILT (potentials #84; owner's pick of 27 Nov 2026 — group 2 of the suggested order)
(`numcheck` in `src/tools/numcheck.ts`, glue `src/lib/numcheck.ts`, engine `wasm/devcore/src/ids.rs` → **devcore-ids.wasm**
(feature `ids`, 1.1 MB with its tables); unit `tests/unit/numcheck.test.mjs` 68, e2e `tests/e2e/numcheck.e2e.mjs` 33.) The owner's
words (potentials #84): "paste any number or code → what it is and whether it is valid, offline: Aadhaar (Verhoeff), PAN, GSTIN
(mod 36), IFSC, IMEI and card numbers (Luhn), ISBN, vehicle registration (the state code), PIN code (the region), UPI ID, phone
number".
- **What it reads** (one entry a line, up to 50; a label in front is read too — "PAN:", "IFSC code -", "Mobile no.", "IBAN" —
  and puts that kind first): **Aadhaar** (Verhoeff; never 0 / 1 first, never a palindrome — python-stdnum's rules), a **masked
  Aadhaar** (XXXX XXXX 1234), the **VID** (16 digits, Verhoeff), **PAN** (its shape; the 4th letter names the holder — P individual,
  C company, H HUF …; 0000 refused; its check letter's rule is not public, said), **GSTIN** (the state code, the PAN or a tax
  deductor's TAN inside, the registration count, Z, the mod-36 check character — 25, 28, 38, 97, 99 named), **TAN**, **voter ID**
  (EPIC: Luhn on its digits, stdnum's rule, worded softly — older cards differ), **IFSC** (the bank by RBI's code; a sub-member
  bank working through another's code named as itself; **every branch of RBI's list**: 176,918 codes of 257 banks — in the list,
  not in it, or no bank has that code), **UPI ID** (its shape, the handle's app or bank for 55 well-known handles, a mobile
  number before the @, an e-mail address refused), **PIN code** (India Post's directory: 19,586 PIN codes — district(s), state,
  zone; a post office the directory files under another state named apart; one not in the directory: the place of its first
  three digits; zone 9 the Army Postal Service), **Indian phone numbers** (libphonenumber's own patterns for India, run by
  regex-lite: mobile, landline (its place and STD code), toll-free, shared cost, premium, UAN; its national and international
  forms; written with +91, 0, 91 or nothing; short numbers 100, 101, 102, 108, 112, 139, 1091, 1098, 1930; another country's number
  named by its calling code), **vehicle numbers** (the state of the RTO code — old codes OR, UA, TS, DN named; Bharat series;
  Delhi's class letter), **driving licences** (the national format), **passport** (its shape only), **CIN** (listed, the state
  of the Registrar, the year, the kind of company), **Udyam**, **UAN**, **bank account numbers** (9 – 18 digits, said to have no
  check digit); **cards** (Luhn; the network by Braintree's credit-card-type rules — the longest matching prefix, ties to the
  first tried — with RuPay's ranges first; the security code's name and length; numbers of no network are no card),
  **IMEI** (Luhn, the 14-digit form, IMEISV; the type allocation code; the reporting body of the first two digits), **SIM numbers**
  (ICCID: 89, the country by calling code, Luhn), **ISBN** (10 and 13; hyphenated by the International ISBN Agency's ranges as
  stdnum splits them; the other form; the group's language or country), **ISSN** (and its barcode), **barcodes** (EAN-8, UPC-A,
  EAN-13, GTIN-14: the check digit, the GS1 office of the prefix — "not where the product was made"), **IBAN** (mod 97, the
  registry's length and structure per country; India has none, said), **SWIFT / BIC**, **ISIN** (Luhn on the letters as numbers;
  INE / INF named), **VIN** (the North American check digit — "makers elsewhere need not use it" —, the maker and country by
  vininfo's tables, the model year's two readings).
- **Which reading leads** (`score`): a label's kind first; a check that passes before a shape that fits; ten bare digits are a
  mobile number before an ISBN-10 that happens to pass (an ISBN-10 leads with its hyphens or its label); short "cards" (12 – 14
  digits) and UPC-A barcodes after an Aadhaar number. A failed check is shown only when nothing passes; weak readings (an account
  number, a UAN, a passport's shape) only when nothing stronger fits. Every reading has its verdict — Valid / Check failed (with
  the number as its check digit would make it, and Copy) / Right shape / Not in the list —, its fields and its notes.
- **The tables** (`scripts/make-ids-data.py` → `wasm/devcore/data/ids/*.bin` and `wasm/devcore/src/ids_tables.rs`, committed):
  India Post's "All India Pincode Directory" (data.gov.in, **GODL-India: attribution shown in the tab**) as cleaned by
  @devzoy/indian-pincode 2.1.0 (snapshot 2025.10.03); RBI's IFSC lists as Razorpay's `ifsc` 2.0.50 carries them (14 Nov 2025;
  fetched by `npm pack` into node_modules/.cache, SHA-512 checked — its package pulls in the old `request`, so it is no
  devDependency); libphonenumber 9.0.44's Indian patterns, formats and 8,823 landline places, the calling codes and region names;
  the ISBN ranges of 4 January 2026 and SWIFT's IBAN registry as python-stdnum 2.2 has them; credit-card-type 10.3.1 + RuPay
  (NPCI's ranges); gs1-prefix 1.0.0; vininfo 2.0.0's makers. **To update:** bump a pin in the script, run it, `bash
  wasm/devcore/build.sh` (or the `ids` feature alone), `python3 scripts/make-numcheck-reference.py`, both suites.
- **The tab:** a box (as you type; examples to tap — made-up numbers that pass, the networks' and registries' own test numbers),
  a card a line with "Most likely" / "Could also be", the value with Copy (as the network or registry prints it), the sources at
  the foot; the engine (1.1 MB) fetched with the first number; the text kept while the page is open. Nothing typed leaves the
  device; a valid check digit is said to prove a number was not mistyped — not that it was issued or whose it is.

### Calculator
Sub-tabs: **Scientific** (own parser: + − × ÷ ^ √ ∛ ! nPr nCr %; "a + b%" / "a − b%" add or take off b % of a like phone/Google
calculators (200 + 10% = 220), b% elsewhere = b/100; sin/cos/tan + inverses + hyperbolic,
ln, log10, log2, exp, abs, π, e, DEG/RAD, ANS, memory M+/M−/MR/MC, keyboard input, history for the
session), **Units** (length, mass, temperature, area, volume, speed, data, time, pressure, energy,
cooking), **Dates** (difference, add/subtract, age, weekday), **Finance – India** (EMI + amortisation,
GST add/remove at 5/12/18/28%, SIP, FD/RD compound, percentage, number to words in lakh/crore and
international), **Time zones** (convert a time between zones via `Intl`).

**Unit Converter as built after the Nov 2026 bug hunt** (`src/lib/units.ts` + `units` in `src/tools/calculators.ts`; unit
`tests/unit/units.test.mjs` 93, e2e 56): 13 quantities (length, mass, temperature, area with gaj / cent / guntha /
ground / bigha, volume with metric and US kitchen measures and UK units, speed, data, time, pressure with kgf/cm² and
torr, energy, power, angle, fuel economy); every factor is the exact definition and is held to **GNU Units**
(`scripts/make-units-reference.py`, 3,222 conversions); results with 10 significant digits (whole numbers and large
values with all digits, tiny ones as 9.094947018 × 10⁻¹³ — never 0), a click copies the plain number; notes for
temperatures below absolute zero and a fuel economy of 0.

**Date Calculator as built after the Nov 2026 bug hunt** (`src/lib/dates.ts` + `dates` in `src/tools/calculators.ts`; unit
`tests/unit/dates.test.mjs` 22 — 6,985 cases of **Python's datetime**, `scripts/make-dates-reference.py`; e2e 58): dates
are UTC midnights of the proleptic Gregorian calendar for the years 1 to 9999 (read with `setUTCFullYear`: `Date.UTC`
takes the years 0 – 99 for 1900 – 1999); **today is the reader's local date** (`today()` in `src/lib/form.ts`, shared by
every calculator with a date box); months are added with the day held back to the month's end and a span is the
opposite of adding (31 Jan → 28 Feb is one month); "Count end date" counts it in days, weeks and years-months-days
alike; whole numbers only in Add / subtract, results outside the calendar are refused; Age gives total months, the
next birthday (29 February on the 28th in other years, said so) and the age it brings.

**Finance calculators as built after the Nov 2026 bug hunt** (`src/lib/finance.ts` = what each tab refuses and how it
reads a period; the arithmetic is mathcore's; reference `tests/fixtures/finance/reference.json` from
`scripts/make-finance-reference.py`, which needs `pip install mpmath numpy-financial`). Shared rules: an amount is above
0 and at most ₹10 lakh crore; a rate is 0 – 1,000 % a year; a period is at most 100 years; a result beyond ₹10,000 lakh
crore is refused; every refusal says why; a period that is not whole months is counted as the nearest month and the
tab says so. Shared form helper (`calcForm` in `src/lib/form.ts`): a unit beside a box may follow another field, a
field may be shown only for some choices (`show`), `notes` explain how the input was read, an opened `<details>` stays
open while the numbers change; `fmtINR` writes paise with both digits (₹12.10).
- `emi` (unit `tests/unit/emi.test.mjs` 76, e2e 61): reducing balance; instalment P·r / (1 − (1 + r)^−n) and the
  yearly schedule in closed forms (`expm1` / `log1p`: right at a rate of 10⁻¹³ % and at 1,000 % over 100 years, where
  the textbook formula and the month-by-month recurrence break down). The EMI is shown to the rupee; total payment
  and total interest are instalment × months on the exact instalment (as lenders' calculators show them). Tenure in
  years or months (the number stays when the unit is switched); "Instalments" row; schedule with principal, interest
  and balance per year, the last part-year labelled with its months, ending at exactly ₹0.
- `gst` (unit `tests/unit/gst.test.mjs` 38, e2e 34): whole paise as on an invoice (mathcore `m_gst`, the arithmetic
  of an invoice line). Before tax: CGST and SGST are each the half rate rounded on its own, the GST is their sum
  (so it is an even number of paise; IGST on the same amount may differ by a paisa — as on real invoices).
  Including tax: the tax is found first (amount × rate / (100 + rate), per half for CGST / SGST) and the base is what
  is left, so base + GST gives the typed amount back to the paisa. Seven slabs + "Other" (0 – 100 %, three
  decimals). An amount is read as it is written (₹1.005 is ₹1.01) and a third decimal is rounded with a note. A
  negative amount (a credit) is the mirror image. Limit ₹10 lakh crore.
- `sip` (unit `tests/unit/sip.test.mjs` 52, e2e 39): monthly instalments at the start of each month, monthly rate =
  annual / 12 (the AMFI / Groww convention), optional yearly step-up (0 – 1,000 %); or a lump sum compounded yearly
  (the period may be a fraction of a year). Expected return above −100 % (a loss is shown as one) and at most
  1,000 %. Maturity value, invested and gains are whole rupees that add up as shown; wealth multiple; "Instalments"
  row; the step-up box only for the monthly SIP.
- `fd` (unit `tests/unit/fd.test.mjs` 38, e2e 38): fixed deposit A = P·(1 + r/n)^(n·t) (quarterly by default; monthly,
  half-yearly, yearly, or simple interest; the tenure may be a fraction of a year — banks pay simple interest on a
  broken period, which differs by a few rupees) or recurring deposit (each monthly instalment grows for the time it
  has left — the banks' formula). Effective annual yield to three decimals. mathcore `growth()` puts back what the
  division r/n and the addition 1 + r/n lost, so 1,200 periods keep 15 digits.
- `percent` (`src/lib/percent.ts`; unit `tests/unit/percent.test.mjs` 59, e2e 41): six questions — A % of B, A as a
  percentage of B, % change from A to B (divided by |A|; "+" before an increase, 0 % without a sign), A increased /
  decreased by B %, A is B % of what. The two numbers are taken as decimals (whole number × power of ten) and the
  answer is one division of whole numbers, so it is the nearest double to the exact answer (a small difference of
  two decimals keeps its digits); beyond 2^53 plain doubles. Ten significant digits (`fmtUnit`), tiny and huge
  answers as × 10ⁿ, never rounded to 0; a reason under the card where there is no answer (B = 0, a change from 0);
  a click copies plain digits.
- `words` (`src/lib/words.ts`; unit `tests/unit/words.test.mjs` 144, e2e 62): whole numbers below 10¹⁹ in words by
  mathcore `m_words` — lakh / crore ("one lakh crore" beyond) or million … quintillion, with "and" as British and
  Indian English place it (inside a group of hundreds, and before a last part below a hundred: "One Lakh and One") —
  held to **num2words** (`pip install num2words --no-deps`, `python3 scripts/make-words-reference.py`). Sentences:
  "Rupees … and … Paise Only" (one paisa; under a rupee "Five Paise Only"), "… Dollars and … Cents Only" (one dollar,
  one cent), or a plain number (any sign, up to 30 decimals read digit by digit). Around the amount ₹ $ Rs. INR USD,
  digit commas, spaces, a leading + and a closing "/-" are accepted. "Digits" groups with BigInt (all 19 digits).
  `rupeesInWords()` of the same file words the totals of the GST Invoice and the Rent Receipt.
- `timezone` (`src/lib/tz.ts`; unit `tests/unit/tz.test.mjs` 74, e2e 43): date + time in a "From zone" → the instant
  → its reading in a "To zone" (large, copyable), the difference in words, and thirty cities. The zone database is
  the browser's Intl. `zoneOffset` in whole seconds (local mean time: Kolkata UTC+05:53:28 in 1850) for any year
  (`utcMs`: `Date.UTC` reads 0 – 99 as 1900 – 1999); `wallToInstant`: a reading that exists twice is its first
  instant, one that does not exist is read with the offset from before the change (02:30 → 3:30 am) — as Python and
  java.time do — with a note; `modernZone`: 21 renamed zones under their current names (not the merely linked ones:
  Europe/Bratislava stays). Held to **Python's zoneinfo** (`python3 scripts/make-tz-reference.py`; leave out zones
  whose pre-1970 history depends on the distribution's "backzone" build — Europe/Amsterdam).
- Health (`src/lib/health.ts`; unit `tests/unit/health.test.mjs` 47; reference `python3 scripts/make-health-reference.py`):
  `bmi` (e2e 33) — metric (cm, kg) or imperial (feet + inches, lb) in boxes of their own; the BMI is shown with one
  decimal (decimal rounding) and classed by that number, Asian-Indian (18.5 / 23 / 25) or WHO (18.5 / 25 / 30); the
  healthy weight range is exactly the weights the tab classes Normal (both ends, steps of 0.1 kg or lb) and the
  tab says how far the weight is from it; height 50 – 300 cm, weight 2 – 700 kg. `calories` (e2e 24) —
  Mifflin–St Jeor (10·kg + 6.25·cm − 5·years + 5 / − 161) × activity; targets ± 275 and ± 550 kcal (7,700 kcal a
  kilogram); a target under 1,200 kcal (women) / 1,500 kcal (men) is marked "too low" with a note; ages 15 – 110,
  100 – 250 cm, 20 – 400 kg. `duedate` (e2e 29) — Naegele's rule: first day of the last period + 280 days +
  (cycle − 28); a whole cycle of 20 – 45 days (empty = 28); weeks completed today (the reader's local date),
  trimesters to 13 weeks 6 days and 27 weeks 6 days, days to go.
- Small ones (`src/lib/smallcalc.ts`; unit `tests/unit/smallcalc.test.mjs` 53; reference
  `python3 scripts/make-smallcalc-reference.py`): `tip` (e2e 19) — whole paise; each share is rounded UP (paisa,
  rupee or ₹10) so the bill is covered, "Collected" = share × people, "Left over" = what that leaves; people a whole
  number ≥ 1. `fuel` (e2e 22) — distance × trips ÷ mileage × price, per person, per km (= price ÷ mileage); "1
  litre", small amounts with three decimals. `gpa` (e2e 20) — credit-weighted mean on a 10-point or 4-point scale,
  CBSE / AICTE percentage (× 9.5) on the 10-point one; a row outside the scale, with negative credits or with one
  box empty is left out and named.
- Numerals (`src/lib/numerals.ts`; unit `tests/unit/numerals.test.mjs` 109; reference
  `python3 scripts/make-numerals-reference.py`, needs `pip install roman numpy`): `base` (e2e 37) — whole numbers of
  any length between bases 2 and 36 (mathcore `m_base_convert`: limbs of 2³², digits in and out in chunks of the
  largest power of the base below 2³²); a sign in front; **a prefix only in its own base** (0x in 16, 0o in 8, 0b in
  2 — elsewhere those letters are digits); spaces, commas and _ skipped; at most 10,000 digits a box; a wrong
  digit is named and the other boxes are emptied; the custom base must be a whole number 2 – 36. `roman` (e2e 26)
  — 1 to 3,999 both ways; additive forms (IIII, MDCCCCX, up to MMMM…) are read with the standard form named
  (`m_from_roman_loose`); Unicode numerals, spaces and lower case accepted; the numeral taken apart.
- Loans and retirement (`src/tools/finance2.ts`, plans in `src/lib/finance.ts`; unit `tests/unit/finance2.test.mjs`
  66; reference `python3 scripts/make-finance2-reference.py` → `tests/fixtures/finance2/reference.json`, mpmath at 60
  digits): `prepay` (e2e 21) — the loan month by month (mathcore `m_prepay`): a part-prepayment after N instalments
  (0 = now, before the next one; a whole number below the months left), once or every 12 months from then on,
  with the instalment kept (the loan ends sooner: "3 years 4 months earlier") or the tenure kept (a new, lower
  instalment); a prepayment is capped at what is owed, with a note when it closes the loan; "Prepaid in all";
  "Interest saved" is the difference of the two interests as shown. `ppf` (e2e 17) — a yearly deposit of ₹500 –
  ₹1,50,000 at the start of each year, compounded yearly, whole years 1 – 50, a note when the years are not a
  maturity (15, then blocks of 5). `epf` (e2e 17) — **as the EPFO keeps the account**: 12 % of basic + DA from the
  member, 12 % from the employer less 8.33 % of pay up to ₹15,000 for the pension scheme (EPS, shown, not in the
  corpus); interest on the balance each month opened with, **credited once a year**; pay rises once a year; whole
  ages 15 – 74, retirement above the age and at most 75. `nps` (e2e 19) — monthly contributions at the start of each
  month to the age of 60 (whole ages 18 – 59), monthly rate = annual / 12; "Subscriber": the least share of the
  corpus that must buy an annuity is **40 % for government subscribers and 20 % for everyone else (PFRDA's exit
  rules of December 2025)** — `NPS_MIN_ANNUITY` in `finance.ts`, the one place to change when the rule changes;
  lump sum + annuity = the corpus as shown; pension = annuity × rate / 12; a note for a corpus of up to ₹8 lakh.
  `inflation` (e2e 17) — (1 + r)^years by the engine's `growth()`; rates above −100 % (deflation: "Purchasing power
  gained", "Years for prices to halve"), 0 % "Never — prices stay as they are", at most 100 years.
- Body and sleep (`src/tools/finance2.ts` on `src/lib/health.ts`; unit `tests/unit/body.test.mjs` 77; reference
  `python3 scripts/make-body-reference.py` → `tests/fixtures/body/reference.json`): `bodyfat` (e2e 22) — the US
  Navy equations (Hodgdon and Beckett 1984, centimetres; mathcore `m_bodyfat`); height 100 – 250 cm, neck 20 – 80,
  waist 40 – 250, hip 50 – 250 (the hip box only for women), weight optional (20 – 400 kg); a man's waist must be
  larger than his neck; a result of 0 % or less, or 75 % and more, is refused with the figure ("no body has");
  shown with one decimal and classed **by that number** on the ACE chart (men 2 / 6 / 14 / 18 / 25, women
  10 / 14 / 21 / 25 / 32; "Below essential fat" with a note); fat mass = weight × shown %, lean = the rest.
  `idealweight` (e2e 18) — the healthy BMI ranges of the BMI tab (`healthyRange`, one routine for both tabs: Asian
  18.5 – 23 on top, WHO 18.5 – 25) and Devine, Robinson, Miller, Hamwi (mathcore `m_idealweight`: inches over 5
  feet; **below 152.4 cm the formulas have no answer** — NaN in the engine, a note in the tab); 100 – 250 cm;
  metric, or feet + inches with pounds. `sleep` (e2e 22) — whole 90-minute cycles (6, 5, 4, 3) back from a wake-up
  time or forward from a bedtime, plus whole minutes 0 – 180 to fall asleep (empty = 0); each row says the day it
  falls on; "Go to bed now" reads the clock and is worked out again when the minute changes (an interval, cleared
  on leave); times in the reader's locale.
- `coords` (e2e 34; `src/lib/coords.ts`, engine `geo.wasm` — §5.1n; unit `tests/unit/geo.test.mjs` 69; reference
  `python3 scripts/make-geo-reference.py`, needs `pip install geographiclib mpmath`): **reading** — decimal degrees
  or degrees, minutes, seconds; minus signs of every kind (−, –), N / S / E / W or the words before or after, a
  decimal comma, ° ′ ″ and their keyboard stand-ins, `deg` / `min` / `sec`, `28d36m50s`, `28:36:50`; only the last
  number may have decimals, minutes and seconds below 60, two numbers always separated; the wrong letter for the
  axis, a letter with a minus sign, values outside ±90 / ±180 are refused with the reason, prefixed "Point A: …".
  A pair in a latitude box ("28.6139, 77.2090", "28°36′50″N 77°12′32″E") fills both boxes (`splitPair`; a comma
  between digits without a space and without decimal points is a decimal comma). **Writing** — six decimals (a
  plain minus, for pasting), DMS with two decimals of a second and degrees with four decimals of a minute, rounded
  as decimals and carried (never 60.00″). **The answer** — distance (km with two decimals, metres under a
  kilometre), miles (1,609.344 m) and nautical miles (1,852 m), initial bearing and bearing on arrival with their
  compass points, the half-way point: the **geodesic on the WGS-84 ellipsoid**; the sphere's (haversine, mean
  radius 6,371,008.8 m) beside it. Notes: the same place (no bearing), exactly opposite points, nearly opposite
  ones (beyond 19,900 km). Point B optional — both boxes or neither.
- Number formatting shared by the calculators (`src/lib/form.ts`, unit `tests/unit/moneyfmt.test.mjs` 79):
  `roundDec(x, d)` (in `src/lib/round.ts`, no DOM) rounds a number as it is written with 15 digits, half away from zero (7.1225 → 7.123, 1.005 →
  1.01; Intl and toFixed round the binary value down) and leaves numbers that need more than 15 digits alone;
  `fmtN`, `fmtIntl` and `fmtINR` use it.

**Scientific Calculator as built after the Nov 2026 bug hunt** (`src/tools/calc.ts`, text helpers `src/lib/calc-text.ts`,
engine `wasm/mathcore` `m_expr_*`; unit `tests/unit/calc.test.mjs` 243 — 3,005 answers of **mpmath at 50 digits** and
Python's exact integers, `scripts/make-calc-reference.py` (needs `pip install mpmath`) → `tests/fixtures/calc/reference.json`;
e2e `tests/e2e/calc.e2e.mjs` 140):
- **Answers people expect at round values:** degrees are reduced to 0…90 exactly (sin 180° = 0, cos 90° = 0, tan 45° = 1);
  in radians a result smaller than the gap between x and the next double is 0 (sin π, cos π/2); tan / sec / csc / cot at
  a pole are refused. (−8)^(1/3) = −2: a negative number has a real power when the exponent is a fraction with an odd
  denominator. nCr / nPr by multiplying (nCr(200, 2) = 19900; k > n gives 0); x! = Γ(x + 1) also for negative
  non-whole x; round(x, n) rounds the decimal as written (round(1.005, 2) = 1.01); log(125, 5) = 3 exactly.
- **What has no answer is refused with its reason** and the expression stays, the history and Ans untouched: a
  division by zero (also 0^−1, mod(a, 0), and inside: 5 ÷ (1 ÷ 0) is not 0), no real result (√ / log of a negative
  number, log 0, asin 2, a pole), too large (beyond 1.8 × 10^308). ∞ is an answer only when ∞ was typed.
- **Reading:** names in any case (Sin, PI, Ans); × ÷ − · √ ∛ π ² ³ ∞ and `**`; things side by side are multiplied (2π,
  3(4+1), 2 sin 30) but two numbers are not ("2 3", "1.2.3" → "A sign is missing between two numbers"); a letter x
  between two operands is × ("2x3"), any other letter is an unknown name (this tab has no unknowns — the graphing
  tab does); at most 100 brackets / signs / functions inside one another; commas in numbers get a hint.
  Percent: `a + b%` / `a − b%` add or take off b % of a only when the term is a bare value with % (10%, −10%);
  `(10%)`, `5×10%` are ordinary values.
- **Display (`fmtNum`, shared with the Math tabs):** whole numbers up to 2^53 digit for digit; otherwise 12
  significant digits (15 from 10^11 on), which hides binary noise; beyond that ten digits and an exponent.
- **Going on from a result is exact:** after "=" the box shows the rounded result, `Ans` holds it exactly; an
  operator (key, keyboard or paste) continues from `ans`, a digit or name starts anew; "=" again changes nothing;
  ±, 1/x and M+ work on the exact value; MR puts back all digits when the rounded form would be another number; a
  history row brings back its expression together with the Ans it was worked out with. Copy result copies the
  result (also of an expression not yet worked out).

### Bill Splitter by Photo — BUILT (potentials #78; owner's pick of 27 Nov 2026 — group 4 of the suggested order)
(`billsplit` in `src/tools/billsplit.ts`, the bill's wording `src/lib/billsplit.ts` (no DOM), the split mathcore's `m_bill_split` (own C —
§5.1b); unit `tests/unit/billsplit.test.mjs` 34, e2e `tests/e2e/billsplit.e2e.mjs` 20 (+ the camera sweep's entry); fixture
`tests/fixtures/snaps/restaurant.jpg` with `truth.json`, by `python3 scripts/make-snap-photos.py`.) The owner's words (potentials #78):
"photograph a restaurant bill → its lines read → tap who had what → each person's share with tax, service and tip in whole paise, and a
UPI QR for each to pay the one who paid".
- **Reading:** the camera helpers' way (`SNAP_READ`, §3 "Router Sticker → Wi-Fi QR"); a line with an amount Tesseract was unsure of (a
  word under 90) read again by PaddleOCR's recogniser (`secondLook`) — the surer reading's amounts put back in their places, the line's
  columns kept.
- **The bill** (`readBill`): the restaurant's name (the first line with letters before the items — no amount, bill number or GSTIN on
  it) and the date; **a line's amounts are the numbers after its last letter** (the currency's letters — Rs., INR, a ₹ read as ¥ — not
  counted): "2 x Cappuccino 360.00", "Croissant x3 450.00", "Naan x 2 120.00", columns Qty / Rate / Amount — an item's rate × quantity
  checked against its amount; **the charges** by their words, with their rates — sub total, service charge, CGST / SGST / IGST / UTGST /
  VAT / cess, a discount (negative), packing, delivery, the round-off (−0.32, (0.32), 0.32-), a tip or gratuity printed on the bill —;
  the total (Grand Total, Net Payable, Amount Due, Total …). **What does not add up is said** (`problemsOf`): an item's rate ×
  quantity, the items against the sub total, a charge against its rate of what it is charged on (GST on the items with the service
  charge, packing and a discount — or on fewer of them, as bills differ), the items and charges against the total.
- **The split** (mathcore `m_bill_split`): each person's exact share of the items is a fraction (an item shared by three is a third
  each; units — "2 of the 4" — in the engine); each extra (the service charge, a tax, a discount, the round-off, a tip) in proportion to
  those shares, or equally among the people who had anything; **the columns rounded cumulatively** — the items, the items and the
  first extra, … the whole bill — each by the largest remainder (ties to the earlier person), a cell the difference of two. So every
  person's items and total are within a paisa of the exact share, every cell within two, each row adds up to its total and each column
  to its amount — the shares to the bill. (The first version rounded each item on its own: the first person paid every leftover paisa,
  five paise more than the last of three who had the same.) Exact in __int128 (any real bill: forty people, a crore of rupees); beyond
  that, the same in double precision.
- **The tab:** a photo (or the camera; Paste image; or "Type the bill by hand") → **The bill**: each item — name, quantity, amount, all
  editable, added or removed — with a chip for each person, pressed for who had it (everyone at first; "Everyone had everything"); the
  charges (editable); "The bill adds up …" or what to check. **Who was there:** the names (Me, Friend 1, Friend 2 at first; added,
  removed), who paid and their UPI ID, a tip — None / 5 % / 10 % / an amount, by what each had or shared equally. **Each one's share:**
  the total and its parts; for everyone but the one who paid **a UPI QR code for exactly that amount** (the QR tab's `upi()`: `pa`,
  `pn`, `am` with two decimals, `cu=INR`, a note), Save QR (PNG), on phones "Pay … with a UPI app" (the upi:// link); **Copy the split**
  (and Share on phones) — "Me: ₹694.46 (paid) / Asha: ₹694.45 / … / Pay Me — UPI me@ybl". Names and amounts last while the page is
  open; nothing is stored. Nothing at open: the OCR and mathcore come with the first photo.
- **Measured:** the restaurant bill photographed (six items with quantities, the sub total, a 5 % service charge, CGST and SGST at
  2.5 %, a round-off of −0.32, ₹1,907.00) read whole in Node and in the browser — every item, every charge, the total, "the bill adds
  up"; the split held to an exact reckoning in BigInt fractions (in the unit suite) over 3,000 random bills, and a bill of 60 people
  beyond __int128; a share's code read back by zbar — pay me@ybl exactly that share.

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
- `regex` — **flavours (to-do #8, owner, 21 Nov 2026; done — ten: JavaScript, PCRE2, Perl, Python's re and regex module, Java, .NET, Go, Ruby, POSIX ERE)**: a Flavour
  list above the pattern; each flavour is the engine its language runs (`src/lib/regex/`, one adapter each, one answer
  shape; `src/workers/regex.worker.ts` fetches an engine the first time its flavour is chosen):
  **JavaScript** — the browser's RegExp, as before (flags g i m s u v y d; without g, Replace changes the first match);
  **PCRE2** — `pcre2-wasm` 10.49 (the text always UTF; flags i m s x n U J D A u = UCP; PCRE2's own global loop and
  pcre2_substitute, extended: `$1 ${name} \U…\E`; a runaway pattern stops at PCRE2's own match limit, said);
  **Perl** — Perl 5.42's own engine: zeroperl, the Perl the EXIF tab runs ExifTool on (`public/vendor/exiftool/zeroperl.wasm`,
  nothing new on the site; one interpreter kept warm; `window` / `document` set for it as in the EXIF worker); flags i m s
  x n a; m//g's matches, @- / @+; the replacement read as Perl reads s///'s (`$1 $+{name} \U…\E`, code in `@{[ … ]}`
  runs); Perl's own error words. One script (`SCRIPT` in `src/lib/regex/perl.ts`) runs in the tab and, as the
  reference, in the native perl;
  **Python** — the `re` of the Python tab's CPython 3.14 (a fresh interpreter a run, ≈ 0.1 – 0.2 s; flags i m s x a;
  `\1 \g<name>`; Python's own error words); **Python (regex module)** — mrab-regex 2026.11.19 (what pip installs as
  "regex"), built into the same CPython (§5.1m; the one interpreter is fetched once for both Python flavours): fuzzy
  matching `(?:colour){e<=1}`, \p{…}, nested sets, recursion, \G …; flags i m s x a, V (version 1: set operations, full
  case-folding), f (full case-folding), b / e (fuzzy: best match, improved fit), p (POSIX leftmost longest), r (from the
  end), w (Unicode word boundaries and line breaks); **Java** — OpenJDK 21's own java.util.regex (Pattern, Matcher and
  the JDK's Unicode tables: `\p{…}`, case folding, `\N{name}`) compiled to WebAssembly (GC) by TeaVM (`wasm/javaregex`,
  §5.1r; 0.86 MB): every answer is Java 21's — flags i m s x d u U c (CANON_EQ through the browser's normalize), `$1`
  `${name}`, Java's error words, Java's StackOverflowError on patterns that recurse too deep, an empty match between the
  halves of a surrogate pair as Java makes it; **.NET** — .NET 10's own System.Text.RegularExpressions on Microsoft's
  WebAssembly runtime (browser-wasm; `wasm/dotnetregex`, §5.1s; 5.1 MB, the files in `public/engines/dotnet-regex/`):
  flags i m s n x, r (RightToLeft), e (ECMAScript), N (NonBacktracking); balancing groups, class subtraction; .NET
  numbers the unnamed groups first, then the named ones; `$1 ${name} $& $` $' $+ $_ $$`, an unknown `$n` kept as text;
  .NET's own error words; **Go** — Go's own regexp compiled by us (`wasm/regexgo`, §5.1p; flags i m s
  U as `(?flags)`; `$1 ${name}`, ReplaceAllString / Expand; no empty match right after a match); **Ruby** — Oniguruma
  (`vscode-oniguruma` 2.0.1) with Ruby's syntax, and around it what Oniguruma does not do as Ruby (Onigmo) does: \w \d
  \s \b ASCII (Oniguruma's ASCII options), `{n,m}` with m < n refused, String#scan's walk (an empty match moves one
  character on), `rb_reg_regsub`'s replacement (`\1 … \9 \k<name> \0 \& \` \' \\`; with named groups plain ones do
  not capture and \1 gives nothing); flags i m (Ruby's m: . matches a new line — ^ $ are always line anchors) x.
  **POSIX ERE** — GNU's regex, the engine grep -E and sed -E run on Linux (gnulib's regcomp / regexec from GNU grep 3.12's
  source, compiled by us: `wasm/posixre`, §5.1q, 112 KB; glibc's are the same code): the longest of the leftmost matches,
  POSIX classes, back-references, GNU's \w \s \b \< \>; flags i, m (REG_NEWLINE); GNU sed's walk (no empty match
  right after a match) and sed's replacement (`& \1 … \9 \& \\ \n \t \U \L \u \l \E`, `sedSub`); GNU's error words.
  The flags box lists the flavour's letters with what each does and refuses others ("“g” is not a flag in Python");
  JavaScript's g and "Replace every match" (the other flavours) stand for each other when the flavour changes.
  **Time limits** start when the engine begins the matching (a first download is not counted): JavaScript 2 s, PCRE2,
  Perl, Java, .NET, Ruby and POSIX 5 s, both Pythons and Go 10 s; when a limit fires for an older request the newest runs in a fresh worker (it used
  to wait behind the stuck one for ever). Matches, groups and names as each engine gives them; indexes in the page's
  own counting (UTF-16); matches found from the end (regex module r, .NET r) are listed as found and highlighted in
  their places. **Tests:** unit `regex-flavours.test.mjs` 559 — 398 cases held to the native engines
  (`tests/fixtures/regex/reference.json` from `python3 scripts/make-regex-reference.py`: CPython 3.14 via uv — with the
  regex module at the build's version from PyPI in a fresh venv —, the JDK whose source the Java engine is built from
  (RegexRun.java on its own java.util.regex), the .NET runtime of the machine (RegexRun.cs, invariant culture), Go's regexp
  built natively, the system's libpcre2-8 through `scripts/regex-ref/pcre2ref.c` — needs `libpcre2-dev`, Ruby 3.3, the
  system's perl 5.38, glibc's regex through ctypes with its walk checked against GNU sed marking every match, and GNU
  sed for every POSIX replacement; three cases differ by version — PCRE2 10.49 / 10.42, Perl 5.42 / 5.38, newer Unicode
  — named in the suite); e2e `regex-flavours.e2e.mjs` 84 and `regex.e2e.mjs` 32.
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
- `keycode` (Key Codes; to-do #26, owner, 26 Nov 2026: "When I press alt+W, I'm not getting the alt+W code. Is this even
  possible? if so do it." — possible: the W key's event carries "Alt held"; there is no single code): a key pressed with
  modifiers is shown as one combination, large — "Alt + W" (Ctrl, Alt, AltGr, Shift, Win / Super / Command in that order;
  the key by its place, with the keyboard's own letters from `navigator.keyboard.getLayoutMap()` where Latin, so a Mac's
  Option + W that types "∑" is Option + W; what it types under the codes where it is not the key's name). **As a
  shortcut:** `Alt+W`, VS Code's `alt+w` (win / meta / cmd), the JavaScript test (`e.altKey && e.code === 'KeyW'`), and
  what a terminal receives — **xterm.js's rules** (the terminal of VS Code: Esc w, ^W, Esc [1;5A …; AltGr and Option give
  the character typed), held to xterm.js 6.0.0's own `evaluateKeyboardEvent` and keydown / keypress handling over 4,642
  key events on Windows, Linux and the Mac (`tests/unit/keycombo.test.mjs`, `@xterm/xterm` a devDependency). Recent keys
  are combinations: a modifier pressed alone opens a row that the key pressed while it is held takes over (Ctrl → Ctrl +
  Shift → Ctrl + Shift + K is one row; Windows' AltGr — a Ctrl of its own, then Ctrl + Alt — too); letting a modifier go
  ends it. **Windows' lone Alt:** its release is taken by the page (else Chrome's menu takes the focus and the next key
  never arrives). The combinations the system and Chrome keep are named per system (they cannot be tested from a page:
  Playwright's keys go straight to the page, past them). `src/lib/keycombo.ts`; unit `keycombo` 28, e2e `keycode` 41
  (Linux, Windows and a Mac through `asOS`).

### Graphing Calculator — as built after the Nov 2026 bug hunt
(`graph` in `src/tools/math.ts`, view arithmetic `src/lib/graph.ts`, engine mathcore `m_expr_*`; unit
`tests/unit/graph.test.mjs` 60, e2e `tests/e2e/graph.e2e.mjs` 52.)
- **Up to six functions of x**, each in its own colour: `2x + 1`, `y = …`, `f(x) = …`, and `x = 2` for a vertical
  line (the right side must be a number). Any other equation, another letter (y, z, t), `Ans` or text the engine
  cannot read is refused **with the reason under the box**; nothing of that function is drawn.
- **Sampling is the engine's** (`m_expr_plot`, two samples a pixel): for every pair of neighbouring samples it says
  whether the curve runs unbroken between them. Samples further apart than 8 px are examined by halving the stretch
  (following the half with the larger difference): a jump (floor), a pole (1/x, tan) or a hole keeps or grows the
  difference, a steep but unbroken curve (1000x) loses it; at the limit of doubles a steep curve is told from a
  jump by its neighbours (same direction, like pace). Values far outside the picture are drawn at 4 heights off.
- **The view:** 50 px per unit at first; zoom by wheel (about the cursor), pinch (about the point between the
  fingers), the buttons and + / − (about the centre), pan by dragging or the arrow keys, 0 and "Reset view".
  `clampScale`: 10⁻¹² … 10¹² px per unit and never finer than 10¹³ ÷ the distance from the origin, so a pixel is
  always thousands of doubles wide (deeper, the grid loop of the old page never ended — a frozen tab);
  `ticks()` counts grid lines as whole multiples of a 1-2-5 step; `tickLabel` gives each the digits its step needs.
- Readout under the graph: x, y of the pointer and every function's value there ("undefined" where it has none).
  Radians / degrees. Save PNG (what is on screen, at the device's pixel ratio). On wide screens (≥ 1000 px) the
  function list stands beside the graph.

### Equation Solver — as built after the Nov 2026 bug hunt
(`equation` in `src/tools/math.ts`; `src/lib/exact.ts` = fractions on BigInt, `src/lib/equations.ts`; engine mathcore;
unit `tests/unit/equations.test.mjs` 62, e2e `tests/e2e/equation.e2e.mjs` 54; reference
`python3 scripts/make-equations-reference.py` → `tests/fixtures/equations/reference.json`, needs `pip install mpmath`.)
- **Quadratic, cubic, simultaneous (2 – 4 unknowns): solved from the decimals as typed.** `parseDec` turns each box
  into an exact fraction; the discriminant (quadratic: b² − 4ac; cubic: 18abcd − 4b³d + b²c² − 4ac³ − 27a²d²) is
  worked out exactly, so the **kind** of the answer is certain — two real roots / one twice / complex; three real /
  one twice / one three times / one real and a pair — and repeated roots are exact fractions. Other roots: the
  quadratic's by an integer square root with 128 guard bits (the root without cancellation first, the other from
  x₁x₂ = c/a); the cubic's from mathcore's real root (`m_cubic`, Kahan's iteration), brought to the nearest double by
  Newton's step on the exact polynomial, then the exact quadratic that is left (deflated from the top, or from the
  bottom where the root is the large one). Linear systems: Gauss–Jordan on fractions → one solution, "No solution:
  the equations contradict each other", or "Infinitely many solutions … only r of the n say something new".
  A root that is a fraction shows it beside the decimal ("= 1/3"). Real roots ascending; a pair with +i first;
  complex numbers written −1 + 2i, 2i, −i.
- **Any equation in x:** mathcore `m_find_roots` on 20,000 steps of the range (sign changes by bisection, touching
  roots by minimising |f|, poles rejected), up to 50 roots listed (a note when the list is full, and when a step is
  wider than 0.05); radians / degrees. Not an equation with an answer: no x in it (true or false as it stands),
  both sides equal everywhere, another letter (y, z, t, Ans), two = signs — each said.
- Answers are live (also as the tab opens) and Enter solves; refusals name the box ("Coefficient a is empty — use 0
  for a term that is missing"; a = 0 gives the solution of what is left). The grid of the simultaneous equations
  keeps what was typed through a change of size.

### Statistics — as built after the Nov 2026 bug hunt
(`stats` in `src/tools/math.ts`, reading of the boxes `src/lib/stats.ts`, engine mathcore `m_stats` / `m_modes` /
`m_regress`; unit `tests/unit/stats.test.mjs` 27, e2e 27; reference `python3 scripts/make-stats-reference.py`.)
Numbers separated by commas, semicolons, spaces or line breaks (a real minus sign is read; what is not a number is
named under the result). **Sums are exact** (Shewchuk's `fsum`); deviations from the rounded mean are taken in a
power-of-two unit and corrected for the mean's rounding (squares and cubes), so data of 10³⁰⁰, of 10⁻³⁰⁰ and of
10⁹ + a few keep their figures. Quartiles: linear interpolation at (n − 1)·q (Excel's QUARTILE.INC, NumPy's default —
said in the tab); mode: the most frequent values when anything repeats, else "none"; skewness of the population
(m₃ / m₂^1.5, shown with ten decimals); geometric and harmonic mean: 0 with a zero among the numbers, none with a
negative one (as Python's statistics module) — each "—" has its reason. The sorted row shows the first 1,000 values.
Regression (optional box, one "x, y" pair a line; other lines are named and left out): least-squares line and
Pearson's r; all x equal → no line, all y equal → a level line and no r.

### Matrix Calculator — as built after the Nov 2026 bug hunt
(`matrix` in `src/tools/math.ts`, `src/lib/matrix.ts` on `src/lib/exact.ts`, engine mathcore for large matrices; unit
`tests/unit/matrix.test.mjs` 54, e2e 35; reference `python3 scripts/make-matrix-reference.py`, needs numpy.)
Cells are whole numbers, decimals, powers of ten or fractions (3/4), separated by spaces, commas or tabs; a row a
line, or on one line with semicolons; brackets and bars are ignored; a real minus sign is read. A + B, A − B, A × B,
det, inverse, transpose, rank, trace and Aⁿ (n whole, 0 – 1000) are worked out on **exact fractions** while the
matrix has at most 400 cells (and a power stays affordable: cells × n ≤ 20,000); the result is shown as decimals
(twelve digits) or, at a press, as fractions, and Copy gives a tab-separated grid. Larger matrices (up to 60 × 60) go
to mathcore in double precision — the line under the result says so; there "singular" and the rank are judged
against the size of the entries (n·ε·max |a|, as NumPy's matrix_rank). Refusals name the matrix, the row and the
shapes ("To add, both matrices need the same shape — A is 2 × 3 and B is 2 × 2").

### Fraction Calculator and Prime / LCM / GCD — as built after the Nov 2026 bug hunt
(`fraction`, `primes` in `src/tools/math.ts`; wording `src/lib/fractions.ts`, `src/lib/primes.ts`; engine mathcore.)
- **`fraction`** (unit `tests/unit/fraction.test.mjs` 34, e2e 26; reference `python3 scripts/make-fraction-reference.py`):
  mathcore `m_frac_eval` reads fractions (3/4), mixed numbers (2 1/2), decimals and powers of ten (taken exactly),
  + − × ÷ (also * / :), whole powers up to ±1,000 and brackets on **128-bit whole numbers with overflow checks**
  (38 digits; beyond: "too large to keep exact here"). "2/3" without spaces is one number (1/3 ÷ 2/3 = 1/2); a power
  comes first (2/3^2 = 2/9). TS tidies ½ ¼ ¾ …, the fraction slashes and odd spaces. Answer: the fraction in lowest
  terms, the mixed number, and the **decimal written exactly** — every digit where it ends, the repeating digits in
  brackets (1/6 = 0.1(6)), "…" after forty digits where the period is longer than 30. Refusals quote the part that
  could not be read, or say: a bracket is not closed, a division by zero, a power that is no whole number.
- **`primes`** (unit `tests/unit/primes.test.mjs` 8, e2e 28; reference `python3 scripts/make-primes-reference.py`,
  needs sympy): whole numbers from 1 to 2⁶⁴ − 1 separated by commas or spaces (+ and _ allowed; anything else is
  named and left out); per number: prime or its factors, and the next prime (none within 64 bits after
  18446744073709551557); for two and more numbers GCD and LCM (the LCM exact beyond 64 bits, by BigInt on mathcore's
  gcd); the first 20 numbers are taken apart.

### Periodic Table — as built after the Nov 2026 bug hunt
(`periodic` in `src/tools/math.ts`, data and search `src/lib/elements.ts`; unit `tests/unit/periodic.test.mjs` 41,
e2e 46; reference `python3 scripts/make-periodic-reference.py`, needs `pip install mendeleev`.) 118 elements: IUPAC
names (Aluminium, Caesium, Sulfur) and abridged standard atomic weights, `[n]` = mass number of the longest-lived
isotope where there is no stable one (explained on the card); group (La and Ac stand in group 3, Ce – Lu and
Th – Lr have none), period, block, category, ground-state electron configuration — "(predicted)" from element 104 on.
Layout: 18 columns, the f-block (15 + 15) in two rows below, markers 57–71 and 89–103 in the gaps. Search
(`findElement`): the symbol exactly, then the number, the name or an alias exactly (aluminum, cesium, sulphur,
wolfram, aurum …), then the first name that begins with the text; `elementMatches` decides what stays lit (symbol,
name, alias or number begins with it; or the category, from four letters on). The legend is a filter (one category
at a time, combined with the search); the shown element is outlined; arrow keys move through the table; "No element
matches …" when nothing does.

### Word Counter — as built after the Nov 2026 bug hunt
(`wordcount` in `src/tools/text.ts`, `src/lib/wordcount.ts`, engine `textkit.wasm` — §5.1o; unit
`tests/unit/wordcount.test.mjs` 125, e2e `tests/e2e/wordcount.e2e.mjs` 36; reference
`python3 scripts/make-wordcount-reference.py` → `tests/fixtures/wordcount/reference.json`, needs `pip install pysbd regex`.)
The same numbers in every browser: nothing is counted with the browser's own segmenter (Chromium's word rules differ
from Safari's and Firefox's — `docs/WASM-AUDIT.md`, tab 90), except the words of Thai, Lao, Khmer and Burmese.
- **Words:** what stands between two spaces and holds a letter or a digit — the count of Microsoft Word and `wc -w`,
  which a word limit is checked against: "don't", "e-mail", "U.S.A.", "km/h", "R&D", "9:30", "10/11/2026", "word(s)"
  and a web or e-mail address are one word each. Corrected where that is plainly not a reader's count: a dash or an
  ellipsis between two words separates them ("stop—go", "wait...what", "x--y"; a range of numbers, 2019–2026, stays
  one), and so does a comma, semicolon, ? or ! with a letter right behind it; danda, Ethiopic wordspace and Tibetan
  tsheg divide; **every Chinese character and kana is a word** (as Word counts); Thai, Lao, Khmer and Burmese
  stretches are cut by the browser's dictionary (`Intl.Segmenter`) and added in `wordcount.ts`.
- **Characters:** extended grapheme clusters (an emoji with its skin tone, a letter with its marks, an Indic conjunct,
  CR LF are one each); line breaks count, but not among "no spaces".
- **Sentences:** Unicode's sentence boundaries, and on top: a piece without a letter or digit is none (***); no end
  after a title or a fixed abbreviation (Dr., Mr., Smt., Shri., Prof., vs., e.g., i.e. …), after an initial (one
  capital letter other than I: "A. P. J. Abdul Kalam"), after No. / Fig. / Rs. / p. **before a number**, after a full
  stop with a letter right behind it (".NET"), after ? or ! inside a web address, or after a quoted question that
  goes on in lower case ("Why now?" he asked.). An abbreviation that may end a sentence (U.S., Ltd., etc.) does so
  before a capital. The end of a line always ends the sentence.
- **Lines** as a text box shows them (a line break at the very end starts none). **Paragraphs:** the blocks between
  blank lines — a row without a letter, digit or emoji (***, ---) separates like a blank line; a text without any
  blank line is one paragraph a line.
- **Average word length** in characters as counted above, without the marks around a word. **Reading time** at 238
  words a minute, **speaking time** at 150 ("45 sec", "3 min", "1 hr 5 min").
- **Top keywords:** the words used at least twice, most used first (ties in order of first use), ten at most; lower
  case, a curly apostrophe as a straight one, without a possessive 's; left out: Snowball's English stop words and
  the usual contractions, numbers, words of one or two letters (in alphabets only), single Chinese characters, web
  addresses. "No word is used more than once." when that is so.
- **The tab:** nothing is fetched while the box is empty (the engine comes with the first text); a text above
  200,000 characters is counted when the typing pauses (1.2 MB takes 0.1 s; a keystroke stays under a millisecond);
  a click on a count copies the plain number; "How these are counted" states the rules; a failed download of the
  engine is said and tried again at the next keystroke.

### Case Converter — as built after the Nov 2026 bug hunt
(`caseConv` in `src/tools/text.ts`, names and hints `src/lib/caseconv.ts`, engine textkit.wasm `tk_case` —
`wasm/textkit/src/case.rs`, §5.1o; unit `tests/unit/caseconv.test.mjs` 79, e2e `tests/e2e/case.e2e.mjs` 43; reference
`python3 scripts/make-case-reference.py` → `tests/fixtures/caseconv/reference.json`, needs `pip install titlecase regex`.)
Thirteen conversions of the text, **line by line** (line breaks, blank lines and tabs stay as they are), the same in
every browser and language setting (nothing uses the browser's locale):
- **UPPER CASE / lower case:** Unicode's full case mapping (ß → SS, ﬁ → FI, the Greek final sigma).
- **Title Case:** John Gruber's rules as the Python package `titlecase` carries them out (the reference of the
  tests): every word gets its capital except a, an, and, as, at, but, by, en, for, if, in, of, on, or, the, to, v,
  via, vs inside a line; the first and the last word of a line always, and a small word after `: . ; ? ! -`; a word
  with a capital inside (iPhone, NASA) or a full stop inside (example.com) stays as typed; the parts of a compound
  are handled one by one (State-of-the-Art); a line in capitals is lowered first; Mc, O', d' names; Mr / Mrs / Ms /
  Dr. **On purpose not as the package:** no "a word without vowels is an acronym" guess (it wrote "Pvt Ltd" as "PVT
  LTD"); "Mc" only with three letters behind it and not on the writer's own capitals (MCQs); a word left as typed
  is not touched by the first / last / after-a-colon rules; tabs and blank lines kept; typographic apostrophes.
- **Sentence case:** lower case, a capital at the start of the text, of every line and after `. ! ? …` (with closing
  quotes or brackets) and a space — the first letter may stand behind an opening quotation mark or bracket; none
  after a single letter with a full stop (e.g., p.m., an initial) or after a title or fixed abbreviation (the list
  of the Word Counter); the English "I", "I'm", "I'll", "I've", "I'd". Names cannot be known and stay small.
- **Capitalized Case:** every word with a capital, the rest small (Word's "Capitalize Each Word"); a word begins
  after a space, hyphen, slash, bracket or quotation mark, not after an apostrophe.
- **camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE, dot.case:** one name per line. Words are runs of
  letters and digits with the marks that belong to them (grapheme clusters: Hindi vowel signs, accents written as
  marks), cut at lower→Upper, before the last capital of a run of capitals (XMLHttp → XML, Http) and at
  digit→Upper (v2Api → v2, Api) — as npm's `change-case` cuts; an apostrophe between letters is dropped.
- **aLtErNaTiNg** (by position in the text) and **iNVERSE**, as they always were.
- **The tab:** the sample sentence is converted as the tab opens (so textkit.wasm is fetched at open — on the lazy
  test's list); each row has its own copy button ("Copy snake_case") and a tooltip that says what it does; results
  keep their line breaks on screen; a result is shown up to 20,000 characters and copied whole; a text above
  200,000 characters is converted when the typing pauses.

### Line Tools — as built after the Nov 2026 bug hunt
(`lines` in `src/tools/text.ts`, the work `src/lib/linetools.ts`; unit `tests/unit/linetools.test.mjs` 80, e2e
`tests/e2e/lines.e2e.mjs` 36; reference `python3 scripts/make-lines-reference.py` → `tests/fixtures/lines/reference.json`.)
In this order: split (a line break at the very end starts no line; an empty box has no lines) → **Trim spaces** →
**Remove empty lines** (a line of spaces is empty) → **Remove duplicates** (the first of each stays; the same
letters written two ways — NFC — are one line; "…ignoring case" also takes ß as ss) → **Sort** → **Reverse order**
→ **Number lines** ("1. ") + prefix + suffix. Sort: *Keep order*; *A → Z* / *Z → A* by the browser's `Intl.Collator`
in the reader's language, digits as numbers ("item 2" before "item 10", v1.9 before v1.10), small before capital and
plain before accented where nothing else differs; *0 → 9* by the number a line begins with (`leadingNumber`: sign or
−, ₹ $ € £ ¥ Rs INR USD, thousands commas incl. Indian grouping, decimals, exponent; equal numbers keep their order,
lines without a number come last and are counted); *By length* in characters as the Word Counter counts them
(textkit.wasm `tk_line_lengths`), equal lengths A → Z; *Shuffle* (crypto.wasm's fair permutation) — the order stays
while other options change and is made anew by "Shuffle again" or a change of the lines. Engines are fetched when
their option is chosen (none at open). The line under the result: "8 lines in → 6 lines out · 1 empty line and 1
duplicate removed". A list above 200,000 characters is worked on when the typing pauses.

### Find & Replace — as built after the Nov 2026 bug hunt
(`replace` in `src/tools/text.ts`, `src/lib/findreplace.ts`, the search in `src/workers/regex.worker.ts`; unit
`tests/unit/findreplace.test.mjs` 61, e2e `tests/e2e/replace.e2e.mjs` 28; reference
`python3 scripts/make-replace-reference.py` → `tests/fixtures/replace/reference.json`.)
The engine is the browser's `RegExp` (the dialect of the Regex Tester tab), run **in a worker and ended after 5
seconds** — a pattern that never ends cannot freeze the page. `plan(find, rep, options)` builds the search: flags
`g`, `m` (^ and $ at every line), `u`, and `i` unless "Case sensitive"; without "Regular expression" every character
of both boxes stands for itself; "Whole words" wraps the pattern in look-arounds on `[\p{L}\p{N}\p{M}_]` (a Hindi
vowel sign or a combining accent continues a word); a pattern that only the older, non-Unicode mode accepts (`\-`,
a lone brace) is run in that mode with a note. In "Replace with", with a regular expression: `$1` … `$9`,
`$<name>`, `$&` and `$0` (the whole match), `$$`, and `\n` `\t` `\r` `\\`. A pattern that is not valid is refused
in a sentence, the box is marked and the text shown unchanged. Under the result: "2 replacements" / "No match —
nothing was replaced." (the count stops at 10,00,000+).

### Text Diff — as built after the Nov 2026 bug hunt
(`diff` in `src/tools/text.ts`, `src/lib/textdiff.ts`, engine **textkit-diff.wasm** — `wasm/textkit/src/diff.rs` on
the `similar` crate, §5.1o; wrapper `src/wasm/textdiff.ts`; unit `tests/unit/textdiff.test.mjs` 51, e2e
`tests/e2e/diff.e2e.mjs` 30; reference `python3 scripts/make-diff-reference.py` → `tests/fixtures/diff/reference.json`.)
- **Lines:** Myers' shortest edit script (as GNU `diff -d` counts). Every row has its number in the original and in
  the changed text and its sign; in a changed line the part that changed is marked (`similar`'s inline changes with
  semantic clean-up; a line replaced by quite another one is not cut up). A last line is the same line whether or
  not a line break follows it; if the texts differ only in that, the tab says so. Unchanged runs are folded with
  three lines kept beside each change (`foldRows`; a click unfolds); at most 5,000 rows are drawn.
- **Words:** pieces by Unicode's word boundaries — a word, a space, a sign are pieces of their own; the counts are
  of words (pieces with a letter or digit). **Characters:** grapheme clusters.
- **Copy as patch / Download .diff:** a unified diff with three lines of context made from the texts as they are
  ("\ No newline at end of file" where it applies), headers `--- original` / `+++ changed`; GNU `patch` and the Patch
  tab apply it.
- A time limit of 2 s on the search for the shortest diff; past it the diff shown is still correct and a note says
  it may not be the shortest. Texts above 20,000 characters are compared when the typing pauses. The sample pair is
  compared as the tab opens (so the module is fetched at open — on the lazy test's list).
- **Two files, a file on GitHub at two commits, a proper patch (to-do #14; owner, 26 Nov 2026: "add 2 more text input
  options. One is to upload two local files. The second option is to name a file in a public GitHub repository with two
  different commit hashes. Also, add the option to download the difference as a universal patch file format."):**
  "Compare": **Typed text** (as before) · **Two files** · **A file on GitHub** (`src/lib/ghdiff.ts`, no DOM; unit `ghdiff`
  37, e2e `diff-sources` 22).
  - **Two files:** "Original file" / "Changed file", read as the other text tabs read files (`readTextFile`: UTF-16 by its
    mark, UTF-8, else Windows-1252; a file that is not text said under the pickers); each named with its lines. The texts
    are compared **as they are, line ends included** (a text box would give them back with LF only); a pair that differs
    only in its line ends is said, and so is a pair whose line ends differ (every line then shows as changed).
  - **A file on GitHub:** the repository (owner/name; a github.com address of the repository, a file — which fills the
    path and the first commit —, a folder or a commit; a raw.githubusercontent.com address; a clone address), the file's
    path, "From commit" and "To commit" (a hash, full or short, a branch or a tag), Compare (or Enter). A full hash goes
    straight to `raw.githubusercontent.com/<owner>/<repo>/<commit>/<path>`; anything else is first made a full commit by
    `api.github.com/repos/<owner>/<repo>/commits/<ref>`. Said in words: no public repository of that name (a private one
    cannot be read without an account), no such commit, branch or tag, no such file at that commit ("it may have been
    added later, moved or deleted"), a file that is not text or above 20 MB, GitHub's 60 look-ups an hour used up (with
    when it starts again — GitHub exposes its X-RateLimit headers to pages, or says "rate limit" in its message), no
    connection. Only the repository, the path and the commits are sent. Checked by hand against GitHub (26 Nov 2026):
    this repository's todo.md from b8e3a26 to 846158b, the patch applied by git apply gives the later file exactly.
  - **Download .patch** (was .diff; Copy as patch as before): two files — `--- <original's name>` / `+++ <changed's name>`,
    saved as `<changed file>.patch` (GNU patch applies it to the original; the hunks are GNU diff -u's); a file of a
    repository — a note of the repository and the two commits (full hashes, with what was typed), then `diff --git
    a/<path> b/<path>`, `--- a/<path>`, `+++ b/<path>`, as git diff writes them (git apply and patch -p1 take it at the
    repository's root), saved as `<file>.patch`; typed text — `original` / `changed`, `changes.patch`.
  - **GitHub as a data host** (approved by the owner): the CSP's connect-src, §3a's table and `no-external.e2e.mjs` list
    `raw.githubusercontent.com` and `api.github.com`; the suites stand in for both with `page.route`.
- **Side by side, change by change (to-do #35; owner, 27 Nov 2026: "an interactive side-by-side diff with next and previous.
  as in to cycle through next and previous diff hunks"):** a fourth view beside Lines, Words and Characters, for every source
  (typed text, two files, a file on GitHub); the other three unchanged.
  - **The columns:** the original on the left, the changed text on the right — named Original / Changed, the two files'
    names, or the commits ("v1.0 (1f0e3d2)", a hash as it was typed) —, every line with its number and its sign (− on the
    left, + on the right: the colour is not alone), one grid so a row's two lines always stand level and wrap inside their
    column; an empty side hatched; unchanged runs folded as in the line view (three lines beside each change); the names
    stay at the top of the list (sticky); the line above, the patch and its download as in the line view.
  - **The lines of a change paired** (`pair_lines`, our Rust in textkit-diff.wasm — mode 3 of `tk_diff`): of a change's
    removed and added lines, those that correspond stand in one row — of all the pairings that keep the order on both sides
    and pair only lines at least 0.6 alike, the one most alike in all (dynamic programming; likeness 2·M / (|a| + |b|), M
    the characters the two have in common in order — the ratio of Python's difflib —, for two lines longer than 400
    characters together their words and signs: unrelated paragraphs share many letters in order, few words); a line of
    nothing but spaces is paired with none; the lines left between two pairs stand side by side in order, the longer side's
    last ones alone; equal totals: the pairs as early as they can be. So a line put in above a changed one stands alone and
    the changed line stays beside what it became (row by row — GitHub's way — "b" stood beside "NEW"). A change of more than
    100 × 100 lines, or one met after 300 ms of weighing, is paired in order. Each row of two lines marks what differs
    between those two lines (similar's inline refinement on the pair; the line view marks within the whole change).
  - **Previous change / Next change** (buttons; **N / P** in the list when it has the focus — WCAG 2.1.4: single keys only
    in the component —; **Alt+↓ / Alt+↑** anywhere in the tab but a text box, as Meld and WinMerge): from one change (a run of
    rows between two unchanged lines — GNU diff's commands, one for one, wherever the engine removed and added the same
    lines) to the next, **round and round** (Next on the last goes to the first, Previous on the first to the last); the
    current change outlined in the accent colour (aria-current) and brought a third of the way down the list, its top
    under the names, the buttons and the list in the window; a click on a change makes it the current one. The words beside
    them: "2 changes — Next goes to the first.", "Change 2 of 4 — original line 3,001, changed line 3,001", "1 line added:
    changed line 5" (aria-live); identical texts: "No changes to go through." and the buttons off. Above 5,000 drawn rows the
    changes among them.
  - Engine: mode 3 is the same diff as mode 0 (counts, patch, line ends equal), in 1 – 30 ms on ordinary texts (a run of
    100 × 100 alike lines 6 ms, 50 × 50 lines of 2,000 characters 28 ms); the module 0.69 → 0.71 MB. `approx` is now set by
    the comparing alone (it counted the time spent marking changed lines too). Unit `textdiff` 80 (the 160 GNU pairs: the
    columns, GNU diff's commands on the 147 pairs where the engine removed and added the same lines, a patch of a hunk per
    change applied by GNU patch; the pairing held to an exhaustive search on 300 edited texts — code, paragraphs, Windows
    line ends, Hindi and emoji — and the reference pairs; known answers), e2e `diff-side` 55 (the keys, round and round,
    8,000 lines with four changes each brought into view, two files and GitHub naming the columns, a phone, axe-core in both
    themes).

### Fancy Text — as built after the Nov 2026 bug hunt
(`fancy` in `src/tools/text.ts`, the styles `src/lib/fancy.ts`, characters by textkit.wasm `tk_clusters` — §5.1o; unit
`tests/unit/fancy.test.mjs` 81, e2e `tests/e2e/fancy.e2e.mjs` 51; reference `python3 scripts/make-fancy-reference.py`
→ `tests/fixtures/fancy/reference.json`.)
Eighteen styles of the text in the box (several lines; line breaks are kept): Bold, Italic, Bold italic, Script, Bold
script, Fraktur, Double-struck, Sans-serif, Sans bold, Sans italic, Monospace, Circled, Fullwidth, Small caps, Upside
down, Strikethrough, Underline, Squared.
- **The alphabets are tables** — the characters Unicode names for each style (Mathematical Alphanumeric Symbols, with
  the letters that block leaves out taken from Letterlike Symbols: ℎ, ℬ ℰ ℱ ℋ ℐ ℒ ℳ ℛ ℯ ℊ ℴ, ℭ ℌ ℑ ℜ ℨ, ℂ ℍ ℕ ℙ ℚ ℝ ℤ);
  digits where Unicode has them (bold, double-struck, sans, sans bold, monospace, circled ⓪ ① … ⑨, fullwidth). The
  reference of the tests looks every character up **by its name** in the Unicode Character Database. An accented
  Latin letter is opened into letter + accent (`normalize('NFD')`), takes the style and keeps the accent; what has no
  styled form (Hindi, emoji, ß, Greek) stays as it is. Small caps: Unicode's small capital letters (x has none; q is
  ǫ, as the real small capital Q is missing from most fonts).
- **Three styles work character by character** (`BY_CHARACTER`): Strikethrough (U+0336) and Underline (U+0332) put one
  mark after every character a reader sees — not inside an emoji sequence, not after each vowel sign; a line break
  gets none. Upside down: the characters in reverse order (so the last line comes first), each turned over — letters,
  digits (6 ↔ 9, 0 and 8 stay), `. , ! ? ' " & _ ;` and brackets, which change places.
  **Characters are told apart by textkit.wasm** (`tk_clusters`: extended grapheme clusters of Unicode 17.0, the ones
  the Word Counter counts) — fetched with the first text that goes beyond Latin letters with accents, everyday
  punctuation and currency signs (`needsEngine`); such a plain text is cut without the engine (`plainClusters`: a
  letter with the accents behind it, exactly what the engine gives — the unit suite compares them). Nothing is
  fetched as the tab opens. If the download fails, the fifteen table styles are there, the three rows are empty, a
  note says why, and the next change tries again.
- **The tab:** a tap anywhere on a row copies it; every copy button is named after its style ("Copy Fraktur"). A row
  shows the style of the first 2,000 characters of a long text (`shownPart`: cut between two characters; Upside down
  shows the end of the text, as its result begins with it) and the tab says so; Copy styles the whole text. A
  keystroke at the end of 200,000 characters takes a few milliseconds.

### Emoji & Symbols — as built after the Nov 2026 bug hunt
(`emoji` in `src/tools/text.ts`; data and search records `src/lib/emoji.ts` on `src/lib/emoji-data.json`; which emoji
the device can draw `src/lib/emoji-support.ts`; ranking textcore.wasm; unit `tests/unit/emoji.test.mjs` 84, e2e
`tests/e2e/emoji.e2e.mjs` 66.)
- **Data: `src/lib/emoji-data.json`, made by `python3 scripts/make-emoji-data.py`** (committed; run it again after
  an update of the package — the unit suite fails when the file was made from another version than the installed
  one). Emoji: **emojibase-data** (`en/data.json`: Unicode's list with the CLDR names and keywords, the Emoji version
  of each, and every skin-tone variant) + the shortcodes of GitHub and Slack ("thumbsup", "pray") + a few Indian
  words (`EXTRA` in the script: namaste, chai, diwali, bharat, roti …). 1,923 emoji in Unicode's nine groups and
  order (Emoji 18); 332 have five skin tones each (the variants where everyone has the same tone). Symbols: eight
  groups, 237 characters (`SYMBOLS` in the script — Arrows, Math, Greek, Superscripts & subscripts, Currency,
  Punctuation, Check & stars, Misc), each with its name from the Unicode Character Database and the words people
  look for it with (`ALIAS`: tick, sqrt, half, rupee …).
- **Search** (one box for both lists): the records `[name, keywords, group]` are ranked by **textcore.wasm** — the
  engine of the tool search (whole phrase, whole word, beginning, stem, slips of the keyboard) — fetched with the
  first search and indexed once (20 ms; a query takes 2 ms). Results: a card "Emoji — n" and a card "Symbols — n",
  best first, the open list's card on top. A symbol is also found by its group's name and its code point ("20b9").
  An emoji or symbol typed or pasted into the box is found as itself (`byCharacter`; any skin tone) — that is how
  to learn a name. Enter copies the best match. If the engine cannot be fetched the tab says so, the lists stay,
  and the next key tries again.
- **Skin tone:** six hands (the plain one and five tones) beside the list switch; the chosen tone is shown and
  copied wherever an emoji has it ("thumbs up: medium skin tone").
- **Emoji the device cannot draw are left out:** as the tab opens, one new emoji of each Emoji version from 12 on is
  drawn on a canvas (`missingEmojiVersions`: a colour glyph looks the same in black and in white text, a
  missing-glyph box does not; versions that added only sequences are told by the width). The tab says how many are
  left out and "Show them anyway" brings them back. Where no colour emoji can be found at all, nothing is left
  out. (Windows has no flag glyphs: flags show as two letters there and are copied as flags.)
- **The tab:** a cell's title and label are its name (a symbol's: "Indian rupee sign · U+20B9"); a tap copies and the
  line under the box says what was copied; nothing but the tab's own code and data is fetched at open.

### Morse Code — as built after the Nov 2026 bug hunt
(`morse` in `src/tools/text.ts`, alphabet / conversions / timing `src/lib/morse.ts`; unit `tests/unit/morse.test.mjs`
52, e2e `tests/e2e/morse.e2e.mjs` 42; reference `python3 scripts/make-morse-reference.py` — needs `apt install cw`:
unixcw's libcw read through ctypes → `tests/fixtures/morse/reference.json`.)
- **The alphabet** (`MORSE`, 62 characters): A – Z, 0 – 9, `. , ? ' ! / ( ) & : ; = + - _ " $ @` and É È À Ä Ö Ü Ñ Ç —
  as unixcw codes them; "!" is -.-.-- (the code in general use; not in ITU-R M.1677-1).
- **Text → Morse** (`encode`): capitals; letters apart by a space, words by " / ", lines stay lines; an accent
  without a code of its own is left off (ê as E, ß as SS); % as the ITU says (0/0); × as X; typographic apostrophe,
  quotes and dashes as the plain ones; `<SK>` (letters in angle brackets) is a procedural signal — its letters
  without gaps. Characters without a code are left out and **named under the result**.
- **Morse → text** (`decode`): dots and dashes also as · • − – — _; words apart by a slash, a bar, a tab or two and
  more spaces; a line stays a line; `...---...` is <SOS>, and <SK> <BK> <KA> <SN> <HH> and CH are read; a group
  that is no code is shown as U+FFFD and named.
- **Direction:** Auto (Morse when the box holds nothing but dots, dashes and separators), or forced either way.
- **Sound** (`schedule`): one unit = 1.2 s ÷ words a minute (PARIS = 50 units); dot 1, dash 3, 1 between the parts
  of a letter, 3 between letters, 7 between words and lines. One oscillator, its gain rising and falling over 5 ms
  per tone (no clicks); Play becomes Stop; a new text, a new speed or leaving the tab ends the sound; the length is
  said beforehand; speed 5 – 40 wpm, pitch 400 – 1,000 Hz (also while it plays).
- **The tab:** the result is a box whose letter groups never break over two lines; Copy gives plain dots, dashes
  and spaces; a chart of the alphabet under the Play button. Nothing but the tab's own code is fetched.

### Lorem Ipsum — as built after the Nov 2026 bug hunt
(`lorem` in `src/tools/text.ts`, reading the count and the layout `src/lib/lorem.ts`, engine **textkit-lorem.wasm** —
`wasm/textkit/src/lorem.rs` on the `lipsum` crate, §5.1o; wrapper `src/wasm/lorem.ts`; unit `tests/unit/lorem.test.mjs`
95, e2e `tests/e2e/lorem.e2e.mjs` 39; reference `python3 scripts/make-lorem-reference.py` →
`tests/fixtures/lorem/reference.json`.)
- **The text:** the Markov chain of word pairs of the `lipsum` crate over its two texts — the classic passage and
  Cicero's *De finibus*, book I — so every two neighbouring words follow each other in one of them. Our glue: the
  texts are cleaned before the chain learns them (quotation marks, dashes, footnote marks, brackets, Roman
  initials) and learned as circles (the crate's chain jumped into the middle of a sentence at a text's end); a
  sentence ends at . ? or !, or at the first comma, colon or semicolon after 24 words, at 40 at the latest;
  paragraphs of 4 – 8 sentences.
- **Paragraphs / Sentences / Words**, exactly as many as asked: 1 – 200 / 1 – 2,000 / 1 – 20,000 (they start at 3 / 5 /
  50). The count is a text box with the number keys (digit commas and spaces read; ↑ / ↓ step by one); what it
  cannot make is refused in a sentence and the text stays.
- **"Start with Lorem ipsum…"** (on): the classic first sentence word for word — "Lorem ipsum dolor sit amet,
  consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua." — then the chain
  from its last two words; off: the text begins where one of Cicero's sentences begins.
- **One seed per text** (32 bytes from `crypto.getRandomValues`): a new number, the opening switch or the format keep
  it — five paragraphs begin with the three that were there — and **Regenerate** makes a new one.
- **Plain text** (paragraphs apart by a blank line) or **HTML** (each in `<p>`); Copy and the box's copy button give
  what is shown; the line under it: "3 paragraphs · 18 sentences · 316 words · 2,135 characters" (the Word Counter
  tab counts the same). A failed download of the engine is said; the next change or Regenerate tries again.

### Spell Checker — BUILT (potentials #10; owner, 26 Nov 2026; built 28 Nov 2026 — group 3 of the suggested order)
(`spell` in `src/tools/spell.ts`, the text's words and changes `src/lib/spelltext.ts` (no DOM), engine `wasm/hunspell` → **hunspell.wasm**
(our build of Hunspell 1.7.6 with our order of suggestions, `wasm/hunspell/rank.hxx`; 0.66 MB) in `src/workers/spell.worker.ts`; unit
`tests/unit/spell.test.mjs` 51, e2e `tests/e2e/spell.e2e.mjs` 65; reference `tests/fixtures/spell/reference.json` from `python3
scripts/make-spell-reference.py` — the native build of the same source that `wasm/hunspell/build.sh` leaves at `$WORK/native/hsref`.) The
owner's words (potentials #10): "the app should be able to take text from the clipboard, and upload text files. The spell checking
operation should involve the usual cycling through of all ill spelt words with suggestions to fix. A download and copy button should also
be there for the end result".
- **In:** a text box (at most 1,000,000 characters); **Paste** (the clipboard's text, at the caret or over the selection; where the browser
  will not let the page read it, Ctrl+V is said), **Open a text file** (.txt, .md, .csv, .srt … — decoded as the other text tabs do) or a
  file dropped on the box.
- **The marks:** each misspelt word underlined in the box itself — a copy of the text under the transparent text area, with its font,
  padding, wrapping and scroll (`.sp-back`); the current one shaded; a click on a marked word makes it the current one; typing moves the
  marks and the current word with the text (`moved`, `diffSpan`). Checked when the typing pauses (250 ms; 600 ms above 200,000
  characters), each different word once.
- **Left alone** (`tokens`): web and e-mail addresses and file names, whole; words with digits (2nd, B2B), in CAPITALS (NASA, GST), and
  capitalised words in mid-sentence (names: Ramesh, Infosys — a full stop after a title or an initial ends no sentence: Dr. Rao, A. P. J.
  Abdul Kalam) — each a switch under "What is left alone"; a capitalised word at a sentence's start is checked.
- **The walk** (Word's spelling pane): "n of N", the word in its sentence (`around`), the suggestions — eight, then "n more" —, the first
  in "Change to"; **Change** (with "Change to" still empty, the first suggestion once it has come), **Change all (n)**, **Ignore** (here),
  **Ignore all**, **Add to dictionary** (kept while the page is open — nothing stored), a word typed in "Change to" and Enter (it takes the
  capitals of the word it replaces: Recieve → Receive), **Previous / Next** round and round, **Undo** (30 steps: changes, ignoring,
  adding, Paste, Open, Clear). Wide screens: the pane beside the text, kept in view; phones: Ignore, Change and Next in the fixed bar.
- **Languages:** English (United States) — SCOWL's en_US; English (United Kingdom) — SCOWL's en_GB with -ise; **English (India)** — the
  British dictionary (Indian English spells as British English does) with our list of 412 words added by Hunspell's `add_dic`
  (`public/data/spell/en-IN.dic`, `python3 scripts/make-spell-india.py`: lakh, crore, paise; the languages, states and cities — India's of
  the World Clock's list —; festivals, food, dress, words of public life and of every day: prepone, Aadhaar, challan, godown …). The first
  one by the browser's language (en-IN → India; en-GB, AU, NZ, IE, ZA → British; else American); kept while the page is open.
- **The order of the suggestions** (`rank.hxx`, compiled into the module and into the native reference): Hunspell's candidates, each
  scored by how common the word is — wordfreq's Zipf frequency, the Photo Dictionary's `public/data/dict/freq.txt`, fetched with the
  first suggestion (1.3 MB gzipped; until it is there, Hunspell's own order) — less 3 × how far it is from what was typed (a weighted edit
  distance on lower case: a letter for another 1, the same letter with another accent 0.3, a vowel for a vowel 0.75, a key beside it 0.8;
  a letter in or out 1, a doubled one 0.5, a vowel 0.8, a space, hyphen or apostrophe 0.4; two swapped 0.9), less 0.1 × Hunspell's
  rank, less 1 for two words (as common as their parts together by chance: Zipf₁ + Zipf₂ − 9), less 0.5 for a capital the typed word
  lacks, plus 2 where the dictionary's own table of misspellings (its REP lines: alot → a lot) makes it of the typed word. **Measured**
  on codespell 2.4.1's list of common misspellings (fitted on its even-numbered half, tested on the odd-numbered one), the right word
  first: 86.3 → 89.6 %; capitalised, as at a sentence's start, 81.9 → 89.5 % (Hunspell lists a capitalised word's own candidates before
  its lower-case form's: "Teh" had "The" ninth); words written together 77.8 → 90.3 %; 131 classic misspellings of people (not fitted
  on) 80.2 → 89.3 %, capitalised 69.5 → 90.8 % — en-GB alike. Ranking by frequency alone was worse than Hunspell's order (84 %).
- **Out:** **Copy** and **Download** — under the file's own name (.txt, .md, .csv, .srt …), else spell-checked.txt.
- **Lazy:** nothing at open; the module and the language's dictionary with the first text (each dictionary 0.55 MB, 0.19 MB gzipped;
  India's list 4 KB), the frequencies with the first suggestion; the worker ends when the tab is left.
- **Measured** (the unit suite): the module's suggestions are native Hunspell 1.7.6's, built from the same source (32-bit x86, as wasm32 —
  Hunspell's word hash is a `long`, and on a 64-bit machine equally scored suggestions come out in another order), for 1,300 misspellings
  in both dictionaries, word for word; the order is the native build's and the script's own Python reading of the rules, list for list.

### Diagram Editor (PC) — BUILT (potentials #54; owner, 26 Nov 2026; built 28 Nov 2026 — the last of group 3)
(`diagram` in `src/tools/diagram.ts`, its files `src/lib/diagramfile.ts` (no DOM), the editor fetched at build time by
`scripts/fetch-drawio.mjs` with our files `scripts/drawio/`; unit `tests/unit/diagram.test.mjs` 106, e2e `tests/e2e/diagram.e2e.mjs` 50;
fixtures `tests/fixtures/diagram/` — `media.vsdx` (a Visio drawing made with Visio, from the Python package vsdx) and `flow.drawio`, `.png`,
`.svg` saved by the tab, `node scripts/make-diagram-fixtures.mjs`.) The owner's words: "a Draw.io clone app - pc only with standard diagram
shapes, uml, flowcharts etc" (26 Nov 2026), and for this tab only: "Even if it's JavaScript for this particular one, it's okay" (21 Nov).
- **The editor is draw.io 32.7.7 itself** (Apache-2.0; not a clone — every shape library, UML, flowcharts, ER, BPMN, network, cloud, floor
  plans, mock-ups …), the release file's editor (53 MB in 2,719 files of its 126 MB — left out: the cloud integrations, the stand-alone
  viewers, the unminified sources, 60 other languages, the Java server's files with its cloud keys, the service worker, live collaboration,
  the hosted site's other pages, the plugins that talk to other services), served from `public/drawio/` — never from another site.
- **In a frame of its own** (`drawio/index.html`, same site): draw.io's page **changed by us** (Apache-2.0 §4(b); each changed file says
  so; `public/drawio/README.txt` lists them) — a **Content-Security-Policy** of its own (`script-src 'self'`, `connect-src 'self' blob:
  data:`, no eval, no other host anywhere; draw.io runs whole under it), **`js/superutils-frame.js` before draw.io's scripts** (its
  localStorage and sessionStorage last only while the page is open; no IndexedDB, Cache Storage, cookies or service worker), **our
  `js/PreConfig.js`** (no export server, no error reports, no news, no plugins from other sites) and **`js/PostConfig.js`** (draw.io's two
  lines, and `window.superutilsEditor`, a handle on the editor for the tab — to open Visio and Gliffy files with draw.io's own importers),
  the hosted site's meta tags, links and loading logo left out. The address: `embed=1&proto=json` (draw.io's embed protocol, JSON
  messages), `stealth=1&lockdown=1&local=1&pwa=0` (nothing of draw.io's own services, storage or offline app), `lang=en`,
  `noExitBtn=1&saveAndExit=0`, `libraries=1` ("More Shapes"), `modified=unsavedChanges` (draw.io's own status line), `dark=auto` (the
  system's theme). The site's CSP allows the frame (`frame-src 'self'`).
- **The protocol** (the frame says `init` → the tab sends `load` with `autosave: 1` → every change comes back as `autosave` with the
  diagram): **Save** (the tab's button, draw.io's own Save button and Ctrl+S — `invokeAction save` → `save`) downloads `<name>.drawio`
  (draw.io's uncompressed `<mxfile>`), and `status` clears draw.io's "Unsaved changes"; **PNG** and **SVG** (`export` `xmlpng` at 2×, a
  border of 10, / `xmlsvg`) download `<name>.drawio.png` / `.drawio.svg` with the diagram inside the picture (a PNG's `tEXt` chunk
  `mxfile`, an SVG's `content` attribute) — open them here again to edit; **PDF…** opens draw.io's own PDF dialog (`invokeAction
  exportPdf`: the browser's print window — "Save as PDF"; draw.io's web PDF needs no server); **New…** draw.io's templates (`template`
  with a callback: blank, or a template and its name). More formats (JPEG, WebP, HTML, XML …, transparency, size): draw.io's own File
  → Export as, which downloads from the frame. A name box (the file names: `safeName` — no characters a system refuses, not a Windows
  device name, at most 120 characters).
- **Open** (the button, or a file dropped on the bar — one dropped on the editor is put into the diagram, as draw.io does): what a file is
  by its first bytes, else its name (`kindOf`); **.drawio / .xml** (an `<mxfile>` or `<mxGraphModel>`; a shape library is said to be one —
  File → Open Library from); **an editable PNG** (the diagram in its `tEXt` / `zTXt` chunk, read by `pngDiagram`) and **SVG** (its
  `content`, `svgDiagram`) — a picture without one is refused with what to do; **Visio** (.vsdx, .vsd …) and **Gliffy** through
  draw.io's own importers (`superutilsEditor.importVisio` / `importGliffy`); **Mermaid** and **PlantUML** text made into shapes that
  can be edited (`load` with a `descriptor`). Anything else refused in words. A diagram with changes not saved: Open and New ask first.
- **Stateless:** the diagram and its name are kept while the page is open (another tab and back: still there, with "Unsaved changes");
  nothing is stored; while it has changes not saved **the page asks before it is closed** — after the tab is left too (the diagram is
  still in memory). Leaving the tab removes the frame (draw.io's memory goes with it).
- **When the editor cannot be fetched:** seen at the frame's load (draw.io's page waits for its scripts: no `EditorUi` there means its
  code did not come) and said, with Try again; a frame that loads but never says `init` is said after 60 s.
- **Measured:** the editor starts in about 1.5 s here; opening the tab fetches about 22 MB (app.min.js 12, extensions 4.8, stencils
  3.9, shapes 1.5 — about 6 MB over the wire) — the lazy suite's `AT_OPEN`, the editor being the tab's first view; no request to another
  site, no CSP violation, nothing stored (localStorage, IndexedDB, service worker, Cache Storage, cookies checked); the files read back by
  Python (ElementTree: the .drawio, the SVG's `content`; Pillow: the PNG's text chunk) and the SVG drawn by librsvg; the Visio drawing
  made with Visio opened with its six shapes and their texts; Mermaid made into shapes and connectors; PlantUML; Gliffy.

### CSV / Excel (PC) — as built after the Nov 2026 bug hunt
(`sheet` in `src/tools/sheet.ts`, around it `src/lib/sheetdata.ts`, engine sheet.wasm — §5.1f; unit `tests/unit/sheet.test.mjs`
120 and `sheetdata.test.mjs` 42, e2e `tests/e2e/sheet.e2e.mjs` 32; fixtures and reference `python3
scripts/make-sheet-fixtures.py` — needs `pip install openpyxl` and LibreOffice: every cell of kinds.xlsx, base.xlsx / .xls /
.ods is held to **LibreOffice Calc's** reading, `soffice --convert-to csv` with the cells as shown.)
- **Reading:** a zip or OLE file → calamine (xlsx, xlsm, xlsb, xls, ods): Excel's error values as Excel writes them
  (#DIV/0!, #N/A, #NAME?, #GETTING_DATA), dates as ISO text, a time alone as hh:mm:ss, a duration with its hours going
  past 24 (255:10:10). Anything else is text, decoded by its byte-order mark (UTF-16 LE / BE, UTF-8), as UTF-8 when it is
  valid, else Windows-1252 (what Excel on Windows saves) — the line under the table names it; a file that is not text
  (NUL bytes) is refused. Text that is a web page with tables (bank statements saved as ".xls") → one sheet per table,
  the cells on the grid as the HTML table model puts them (colspan / rowspan), a layout table around tables left out;
  Excel 2003 XML → its worksheets (ss:Index, MergeAcross / MergeDown, Number / Boolean / DateTime). JSON → one sheet
  (objects → a column per key in the order they appear; a number a double cannot hold as written stays text — the
  browser's JSON.parse source). Otherwise CSV: the separator (comma, semicolon, tab, pipe) is the one under which the
  first 50 records, read as CSV, most often have the same number of fields; each new file is detected afresh; the
  line names it. The newest file wins.
- **Showing:** numbers as Excel's "General" shows them — 15 significant digits (0.1 + 0.2 is 0.3), whole numbers up to
  2^53 digit for digit, an exponent beyond (1E+21, 1.25E-7); TRUE / FALSE; the first 1,000 rows (filtered rows keep
  their numbers; a sheet above 20,000 rows is filtered when the typing pauses).
- **Writing:** CSV (BOM) and TSV give the cells as shown. JSON: objects keyed by the header (a repeated heading →
  Value_2, an empty one or a column beyond the header → its letter), arrays without one. "Numbers and dates written as
  text become real numbers and dates": in .xlsx a cell becomes a number only when a double holds it exactly as written
  (no leading zero, no +, not 16 digits of an ID), and ISO dates / times (2026-11-20, 2026-11-20 10:30[:15], 10:30[:15])
  become Excel dates with their format; in JSON whole columns that sheet.wasm types INTEGER (within 2^53) or REAL become
  numbers. .xlsx: sheet names Excel accepts (31 characters, none of [ ] : * ? / \\, no apostrophe at an end, not
  "History", unique without regard to case); a CSV's sheet is named after the file; Excel's limits said in words
  ("Cell C6 of “x” holds 40000 characters; an Excel cell holds at most 32,767"; 1,048,576 rows; 16,384 columns).

### SliceDiceGrapher — BUILT (potentials #75, with Chart Maker #25; owner, 21 Nov 2026; built 28 Nov 2026 — group 3 of the suggested order)
(`slicedice` in `src/tools/slicedice.ts`, the data, pivots, presets, tables and graphs' options `src/lib/slicedice.ts` (no DOM), the engine
`src/lib/pivotengine.ts`, the graphs `src/lib/charts.ts`; unit `tests/unit/slicedice.test.mjs` 83, e2e `tests/e2e/slicedice.e2e.mjs` 47; fixtures
`tests/fixtures/slicedice/` — 240 sales as CSV and .xlsx, the first 30 as Excel, LibreOffice Calc and Google Sheets put them on the clipboard
and as its plain text, 13 as an American Excel does, and pandas' answers (`reference.json`) — by `python3 scripts/make-slicedice-fixtures.py`.)
The owner's words: "copy a set of rows and columns, basically a sheet from Excel or LibreOffice or any such open source spreadsheet software out
there, both on Linux and Windows, and paste it in the app, or upload an Excel file itself with data. Then the app should be able to create
different pivots and create different graphs based on standard presets … have a download button to be able to save it as an image".
- **In:** **a pasted range** — Ctrl+V anywhere in the tab, the paste box (a phone's long press → Paste), or **Paste** (the Async Clipboard API,
  asking for the spreadsheet's own HTML: `unsanitized: ['text/html']`); the clipboard's HTML read with the value behind each cell (`pasteTables`:
  Excel's `x:num`, LibreOffice's `sdval`, Google Sheets' `data-sheets-value`): **a date's day number decides it** (46119 is 7 April 2026 — an
  American Excel's 4/7/2026 needs no guess of the order), a number shown rounded keeps its exact value (12 % for 0.125) and its format from the
  text, Excel's accounting zero ("₹ -") is 0; the largest table of a web page; colspan and rowspan on the grid. Plain text (tabs, or a separator
  found) by sheet.wasm; typed CSV with "Read this text". **A file** — .xlsx .xlsm .xlsb .xls .ods .csv .tsv (and the CSV / Excel tab's other
  kinds: `readSpreadsheet` in `src/lib/sheetdata.ts`, shared); a workbook's sheets to choose from. **The sample** — 360 sales of a tea and spice
  trader over two years (a fixed seed).
- **The columns** (`readGrid`): the first row the names when none of its cells is a number or a date (a switch); a last row "Total" / "Grand
  total" left out and said (a switch keeps it); numbers as India and the world write them (₹ / Rs. / INR / $ / € / £, Indian and international
  grouping, brackets and Dr for negatives, %, 1.2E+05; a code with a leading zero, a phone or account number stays text); dates day first unless
  a date says month first (ISO, 28/11/2026, 28 Nov 2026, Nov 28, 2026, Nov 2026); a column is numbers or dates when four in five of its cells
  are. "Columns" lists each with what it was read as (a choice: Numbers, Dates, Text) and what is in it; "The first rows as read".
- **The pivots** — **Perspective 5.10** (its C++ engine in WebAssembly, in a worker): rows (up to three levels), a split (columns), values
  (up to four: sum, count, average, minimum, maximum, distinct count — or the number of rows — each shown as the value, % of the grand total,
  of the group above, of the row, of the column, or a running total down the rows), filters (is one of / is not one of / contains; at least /
  at most a number or a date), dates by year, quarter, month, week, day, month of the year or day of the week, the order (labels A → Z, Z → A,
  largest or smallest value first, within each group), the top N groups, subtotals and the total. **No median:** Perspective's is not the
  middle of a larger group (docs/WASM-AUDIT.md 202); **the box plot's five numbers are mathcore's** (exact; quartiles as Excel's QUARTILE.INC).
  The table on the screen: Excel's layout (a group's label once; subtotals at the top of their group, the total last, in bold), the first 500
  rows (the files have all).
- **Presets** (`presetsFor`, from the columns' kinds: categories of 2 – 60 values, measures — an amount by its name or its currency first, a
  price or rate after counts —, dates): the total of the first measure by the first category, the trend by month (by day, quarter or year by the
  dates' span), the category × month, its share (donut), the top 10 of the category with the most values, the number of rows, the average, two
  levels (treemap), year against year (two years and more), the spread (histogram), two measures against each other (scatter), the Pareto and the
  box plot.
- **Graphs** (ECharts 6.1, tree-shaken, `src/lib/charts.ts`): columns (side by side, stacked, 100 %), bars (stacked), line, area (stacked),
  pie, donut, scatter, heatmap, treemap, sunburst, waterfall, funnel, Pareto (the cumulative share, its 80 % line), histogram (about 20 bins of a
  nice width, counted by the engine), box plot, columns + line (a second axis) — values in their column's format (₹ in lakhs, %), a legend for
  more than one series, tooltips, ECharts' description for screen readers; drawn as each card comes into view; the theme followed. On the
  screen the card's heading is the title; a picture saved has it inside.
- **The board:** every preset as a card — its graph, its kind of graph (a choice), "The pivot" (folded), Edit (into the editor), Remove;
  "Bring back the presets". **The editor:** "Start from" a preset or nothing, the title (it follows what the pivot shows until typed), rows,
  split, values, filters (a list of the values to tick), the order, the top N, subtotals, total, the graph — drawn as it changes; "Add to the
  board", or "Save to the board" for a card being changed.
- **Downloads** (owner: "a download button to be able to save it as an image"): under every graph and in the editor — **PNG** (2× or 4×, white
  or see-through, chosen once for all; a picture larger than 16 megapixels made at the scale that fits, said), **SVG**, the table as **PNG**
  (drawn by the tab; the first rows that fit a picture, said), **CSV** (UTF-8 with a BOM; numbers plain, shares with %), **Excel** (sheet.wasm:
  the header and the totals in bold, numbers in their format — `[$₹-4009]#,##,##0.00`, `0.0%`), **Copy** (tab-separated, to paste into a
  spreadsheet); phones share the pictures. **Download all (.zip)** (the phone's bar): every graph as PNG and SVG, every table as PNG and CSV,
  and `tables.xlsx` with a sheet a table.
- **Kept while the page is open** (nothing stored): the data, the board as it was (a card removed stays removed), the pictures' size and
  background; back in the tab the engines are fetched again and the board drawn as it was.
- **Lazy:** at open the tab's own code (70 KB); with the first data Perspective (its client's JavaScript 65 KB and WebAssembly 0.64 MB, the
  engine 2.65 MB in its worker), ECharts (0.72 MB), sheet.wasm for files and the downloads, mathcore for a box plot; the worker ends when the
  tab is left.
- **Measured:** the 15 pivots of the reference cell for cell against pandas, the box plot against NumPy, the three clipboards and the plain text
  giving the 30 rows exactly (unit); in the browser the board of the sample in about half a second, 20,000 pasted rows to the board in a few
  seconds, every download read back (the PNG's size and its see-through corner, the SVG's text, the CSV, the Excel file by openpyxl, the zip by
  Python's zipfile).

### Markdown Editor — as built after the Nov 2026 bug hunt
(`markdown` in `src/tools/markdown.ts`, heading ids `src/lib/mdslug.ts`, engine `src/wasm/markdown.ts` — §5.1e; unit
`tests/unit/markdown.test.mjs` 29, e2e `tests/e2e/markdown.e2e.mjs` 46.) **cmark-gfm 0.29.0.gfm.13** with GitHub's
extensions (tables, strikethrough, autolinks, tag filter, task lists, footnotes) in its safe mode; the unit suite runs
the 744 examples of the GFM spec and cmark-gfm's test files at that tag (`tests/fixtures/markdown/`; 12 differ only
as GitHub's extensions make them). The HTML is tidied in an **inert DOMParser document** before it is shown: pictures
from other sites are not fetched (a note with their description; the .html shows them), links leave in a new tab with
noopener, headings get **GitHub's ids** (github-slugger's rule, held to the npm package), ids are prefixed "md-" in the
preview, and links inside the document scroll the preview pane (the address never changes: "#fn-1" would leave the
tab). Toolbar and Ctrl+B / I / K: inline marks wrap the selection and come off on a second press (asterisk runs: 1 or 3
italic, 2 or 3 bold), line formats come off when every line has them, a heading of another level is replaced, empty
lines are skipped by lists; every edit goes through the browser's insertText, so Ctrl+Z undoes it. Counts are of the
rendered text. Above 200,000 characters the preview is drawn when the typing pauses. Files: decoded by their mark,
UTF-8 or Windows-1252, CR LF → LF, Ctrl+Z brings the text before back; a file dropped on the editor is opened.
Printing — the button, Ctrl+P or the menu — shows the preview only (beforeprint / afterprint). The .html: the first
rendered h1 as its title, GitHub's ids.
**Copy, "Copy with formatting" (to-do #29; owner, 26 Nov 2026: "copy the rendered markdown with formatting so that he can
paste it in, say, another Microsoft Word or any rich text setting. so basically a 'copy with formatting' toggle"):** on (the
default, kept while the page is open) the rendered document goes onto the clipboard as HTML and plain text together
(`ClipboardItem`; without it the page's own copy event carries both) — made for pasting (`src/lib/mdcopy.ts`): styles
written on each element (code in Consolas / Courier New, the table's borders and the columns' alignment, the quote's bar,
strike-through — Word, Google Docs and mail drop style sheets), headings, lists and links left to the program pasted
into, task boxes as ☐ / ☑, footnotes as superscript numbers with the notes after a rule, no ids or links inside the
document, a code block's language out of `lang`, pictures as the .html has them (nothing fetched by the page); the plain
text as the document reads (laid out off the screen for a moment). Off: the Markdown as typed. e2e `markdown-copy` 21 —
the clipboard read back in both forms, and **LibreOffice** turns the copied HTML into a .docx as Word would take it:
Heading 1 – 3, the nested list's level, the table's 6 cells, the code's font.

### SQLite Playground (PC) — as built after the Nov 2026 bug hunt
(`src/tools/software/sqlite.ts`, engine `src/lib/sqlite-engine.ts`, worker `src/workers/sqlite.worker.ts`; unit
`tests/unit/sqlite.test.mjs` 106, e2e `tests/e2e/sqlite.e2e.mjs` 63.) Engine: the **official SQLite WebAssembly build**
(`@sqlite.org/sqlite-wasm`, SQLite 3.54: FTS5, JSON, maths, R-tree; no FTS3/4) in a worker; `sqlite-engine.ts` drives its
C API and also runs under Node, where the unit suite holds it to **the native SQLite** (Python's `sqlite3`):
`tests/fixtures/sqlite/reference.json` = 32 scripts, 160 statements with the type of every value, the rows each data
change reports and every error text (`python3 scripts/make-sqlite-reference.py`, which also writes the fixture
databases and CSV files).
- **A script** is cut into statements by SQLite's own parser (`sqlite3_prepare_v3` + its tail pointer): semicolons in
  strings, comments and trigger bodies never split one. An error names the statement, its line and column, and nothing
  after it runs; lines that start with a dot get "that is a command of the sqlite3 program".
- **Values keep their type:** INTEGER beyond 2^53 exact, REAL in SQLite's own writing (`1.0`, `1.0e+300`, `Inf`), NULL
  beside empty text, blobs by their first bytes and length (an empty blob is a blob, not NULL).
- **"N rows changed"** = the statement's own changes (`sqlite3_changes64`, what other tools call rows affected), shown
  for every INSERT / UPDATE / DELETE / REPLACE — also 0; trigger and cascade changes are not added.
- **Limits:** 2,000 rows on screen, up to 1,000,000 kept for CSV / JSON (CSV by sheet.wasm, RFC 4180, BOM; JSON with
  exact numbers); a time limit (10 s – 10 min, a progress handler) ends a statement that never finishes and leaves the
  database as it was; one action at a time (a second one is told to wait).
- **Files:** checked before they replace anything (not a database / text / workbook / damaged → the reason, and the
  open database stays); write-ahead-log files open with a note; a replaced database that held something can be brought
  back once (the button stays until used). The download keeps the file's name and warns when a transaction is open.
- **Imports** (CSV, TSV, semicolons, .xlsx / .xls / .ods — every sheet with rows becomes a table): sheet.wasm says
  what each column can be stored as without loss (`types`): codes with leading zeros and numbers no REAL can hold
  stay TEXT, long ids are exact INTEGERs; repeated or empty column names, taken or reserved table names are made
  usable; any name is only ever a quoted name. Numbers beyond the 64-bit range are bound as REAL (the binding would
  wrap them round).
- **Tables panel:** tables, virtual tables, views with columns, keys, generated columns, indexes, triggers and row
  counts, attached and temporary databases too; storage tables of FTS5 / R-tree hidden; an object that cannot be read
  (a module this build lacks, a view on a dropped column) is listed with the reason. "Show rows" quotes any name.
- An open transaction after a run is pointed out with COMMIT / ROLLBACK buttons.

### SQL Formatter (PC) — as built after the Nov 2026 bug hunt
(`src/tools/software/sqlfmt.ts`, engine `wasm/devcore/src/sqlfmt.rs` → `devcore-sqlfmt.wasm` 0.21 MB, no crates beside
serde_json; unit `tests/unit/sqlfmt.test.mjs` 113, e2e `tests/e2e/sqlfmt.e2e.mjs` 49.) **Our own formatter**: no
established WebAssembly SQL formatter exists, and the `sqlformat` crate the tab used changed the meaning of SQL
(`docs/WASM-AUDIT.md`, tab 53). The rule it is built on: **a formatter may change white space and the case of
keywords — nothing else.**
- **Four steps:** `lex` (the lexical rules of each dialect: what a string, a quoted name, a comment, a number, a
  variable, an operator is) → `analyse` (is this word a keyword *here*? clauses, blocks, statements) → `layout`
  (white space between the tokens; a token is never altered beyond the case of a keyword) → **guard**: the result is
  tokenized again and must hold the tokens of the input in order, else the input is returned untouched (`kept`; the
  tab says so). The unit suite demands that the guard never has to step in.
- **Dialects:** Auto-detect (default), Standard SQL, PostgreSQL, MySQL / MariaDB, SQLite, SQL Server, Oracle. Detection
  reads the text as each dialect and scores what it finds (a string that never ends counts against a reading); the
  tab shows "Read as …". What differs: backslashes in strings (MySQL, PostgreSQL `E'…'`), `"…"` strings (MySQL),
  `$$…$$` (PostgreSQL), `q'[…]'` (Oracle), `[names]` (SQL Server, SQLite) versus subscripts (PostgreSQL), `#` comments
  (MySQL) / `#temp` (SQL Server) / operator (PostgreSQL), nested comments (PostgreSQL, SQL Server, standard),
  PostgreSQL's own rule for operators. Where a reading is unsure the safe one is taken: `--` starts a comment in every
  dialect (MySQL's `5--5` is then simply left as typed), unknown signs keep the spacing they came with, a function
  and its bracket are never pulled apart or pushed together (MySQL reads `count (` differently).
- **Keywords:** UPPER / lower / as typed. A word changes case only where it is used as a keyword: about 60 words are
  keywords everywhere (SELECT, FROM …); 330 more only in their place (`key` after PRIMARY, `offset` before a number,
  `rows` in a window frame, `first` after NULLS, types after a column name or `::`); never next to a dot, never the
  name after AS, never the first word of an entry in CREATE TABLE ( … ). Functions keep their case.
- **Layout:** the style the tab always had (clauses on their own lines, their content indented, one entry a line,
  subqueries as blocks, short brackets on the line) plus: CTEs, MERGE (a line per WHEN), windows (PARTITION BY /
  ORDER BY / frame a line each), INSERT … ON CONFLICT, ALTER TABLE (an action a line), DDL on one line with its
  definition list as a block, the query of CREATE VIEW / EXPLAIN on its own lines, long lists of short entries
  filled to 72 columns, a bracket that fits its line (80) kept on it, AND / OR breaking only in conditions, the AND
  of a join condition one level deeper. Comments stay where they were (behind their line, or on a line of their
  own); a comma that follows a comment moves in front of it. Lines are indented at most 50 levels.
- **Scripts:** statements without semicolons are told apart (a second SELECT, a command at the start of a line, GO);
  BEGIN … END, IF … THEN … ELSE … END IF, LOOP, WHILE … DO, TRY / CATCH indent their statements; `BEGIN;` is a
  transaction, CASE … END no block. One line per statement keeps the line break after a `--` comment and between two
  parts of a string.
- **The tab:** warnings for text, comments, quoted names and brackets that never close (with the line); a script of
  megabytes is formatted in a fraction of a second, the box shows its first 10,00,000 characters, Copy and Download
  give all; the download is named after the opened file.
- **Tests:** an independent reader of SQL written in the unit suite (1,692 formattings of the 141-statement,
  5-dialect corpus `tests/fixtures/sqlfmt/corpus.json`: same tokens, only keywords change case, all stable); the
  SQLite engine runs original and result (rows, column names, errors, database); 224 keyword-like names × 48
  statement shapes; the recorded layout (`layout.json`, `node scripts/make-sqlfmt-layout.mjs` — read its diff); the
  tokens of each dialect; 4,000 broken texts. e2e: what the tab shows is read by the **native SQLite**, **sqlglot**
  and **sqlparse** (`tests/lib/sqlfmt_check.py`; the last two are skipped with a note where they are not installed).

### Code Formatter (PC) — as built after the Nov 2026 bug hunt
(`src/tools/software/prettier.ts`, engines `src/lib/codefmt.ts` in `src/workers/codefmt.worker.ts`, page side
`src/lib/codefmt-client.ts`; unit `tests/unit/codefmt.test.mjs` 205, e2e `tests/e2e/prettier.e2e.mjs` 85; the tab's id
stays `prettier`.) Ten languages. **Which engine formats which** was decided by evidence (`docs/WASM-AUDIT.md`,
tab 54): every candidate's results were read again by a parser that belongs to none of them, on hazard texts and on
real files.
| Language | Engine | Beside it |
|---|---|---|
| JS / JSX, TS / TSX, CSS, SCSS, YAML, GraphQL | **Biome's official WebAssembly build** (`@biomejs/wasm-web`, 70 MB / 18 MB over the wire) | Prettier when Biome cannot read the text |
| JSON | **`@dprint/json`** (0.66 MB) — the one formatter that leaves every number as typed (Biome and Prettier respell `1.50`, `1E+10`) | Prettier for text it refuses |
| HTML, Vue | **`dprint-plugin-markup`** (markup_fmt, 2 MB) for the markup; scripts, styles, template expressions and JSON blocks go to Biome / `@dprint/json` through the plugin's host callback | Prettier for omitted end tags, a Pug template, a Less block |
| Markdown | **Prettier** (JavaScript) — Biome's and dprint's Markdown formatters change what a document renders to | — |
- **Our glue at the seam** (`markup()` in `src/lib/codefmt.ts`): a Vue expression is formatted with semicolons and
  without trailing commas; a handler of several statements stays as typed (Vue needs the `;`, and over lines inside an
  attribute it reads worse); nothing with a double quote goes back into a double-quoted attribute; `let <pattern> = 0`
  (the variables of a slot or `v-for`, as the plugin wraps them) must come back on one line or the expression is left
  as typed; attributes of plain HTML (`style="…"`, `onclick="…"`) stay as typed, so a page without `<script>` /
  `<style>` never needs Biome; **`rootBreaks`** puts touching top-level elements on their own lines where a block is
  involved (the plugin leaves `</section><footer>` and `</template><script>` on one line); **the letters guard** — a
  markup result that does not hold the same letters as the input is not used (Prettier formats instead).
- **Fallback:** a refusal by the language's engine → Prettier formats, and the tab says so with the engine's reason
  and place ("Biome, the formatter for CSS, could not read this text — … (line 1, column 4) — so Prettier formatted
  it"). If Prettier cannot read it either, its message with the code frame is shown. An engine that cannot be fetched
  is an error, never a silent switch. Vue through Prettier with "Semicolons" off keeps the semicolons when a handler
  has several statements (Prettier would write `@click="a = 1⏎ b()"`, which Vue cannot compile) and says so.
- **Lazy:** nothing is fetched before the first Format; then the worker and only the engine the language needs
  (JSON: the JSON plugin; plain HTML: the markup plugin; Markdown: Prettier's two chunks). TypeScript text is tried
  as `.ts`, `.tsx` and `.d.ts` (a file's name decides which first). Biome's `tailwindDirectives` is on for CSS and
  off for SCSS (it breaks `@forward … as x-*`); parameter decorators are allowed.
- **The tab:** language (a typed text survives the switch; only a sample is replaced), Open a file (by extension —
  .mjs .cjs .jsx .tsx .mts .cts .d.ts .jsonc .json5 .yml .markdown .gql .htm …), print width 40–160, indent, semicolons,
  quotes, trailing commas with a line that says what they mean for the chosen language, Format (Ctrl+Enter), Format
  as you type (a slow answer cannot overwrite a newer one), Copy, Download (the file's own name, or
  `formatted.<ext>`). Markdown: lines are not re-wrapped and code fences are left alone.
- **Known limits (recorded, not hidden):** Biome refuses custom properties holding `[ … ]` / `{ … }` and old IE hacks
  (→ Prettier, which adds a `;` inside `--x: {a:b}`); a YAML flow list whose `]` stands in column 1 (→ Prettier); in
  Vue a `<i18n lang="json">` block is left as typed; a result formatted by Prettier may change once more when
  formatted again (the second time the WebAssembly engine can read it). Prettier's own Markdown faults remain (a list
  followed by a line that holds one space; tabs in a list's code block).
- **To update an engine:** bump the package, `node scripts/make-codefmt-layout.mjs`, **read the diff** of
  `tests/fixtures/codefmt/layout.json`, run both suites. The independent readers are `tests/lib/codefmt-check.mjs`
  (each allowance named where it is made); the engines for Node are `tests/lib/codefmt-node.mjs`.

### Graphviz (PC) — as built after the Nov 2026 bug hunt
(`src/tools/software/graphviz.ts`, helpers `src/lib/graphviz-text.ts`, client `src/lib/graphviz-client.ts`, worker
`src/workers/graphviz.worker.ts`, wrapper `src/wasm/graphviz.ts`; unit `tests/unit/graphviz.test.mjs` 686, e2e
`tests/e2e/graphviz.e2e.mjs` 81.) Engine: **our own build of Graphviz 16.1.0** (§5.1l) — the existing WebAssembly
builds (Viz.js, hpcc) trap on valid graphs (`docs/WASM-AUDIT.md`, tab 55). The reference of the tests is the **native
`dot`** built from the same source.
- **Draws what `dot` draws on Linux:** with glibc's `qsort` and `rand` in the module, dot, neato, circo, osage and
  patchwork give the SVG of the native tool byte for byte (457 graph files of the Graphviz sources, every one); fdp,
  sfdp and twopi where the last digit of sin / cos does not decide (the drawing then differs, the nodes, sizes and
  edges never).
- **A fresh instance of the engine for every drawing** (≈ 1 ms; the page compiles the module once and hands it to
  the worker). Graphviz the library counts on across graphs (ids of gradients and link anchors), so a reused instance
  did not draw the same text the same way twice; and nothing a failed graph leaves behind reaches the next one.
- **Text is measured by the browser:** Graphviz asks its "textlayout" plugin for the size of every piece of text; ours
  (in `glue.c`) passes the question to the import `supertools.text_width`, which the worker answers from an
  OffscreenCanvas with exactly the font words the SVG will carry (`cssFont`; `fontnames=svg|ps` followed as the SVG
  writer does). Labels in any script and font fit their nodes. Without a canvas (or in the unit harness: -1) Graphviz
  falls back to its built-in tables, as a native build without Pango does.
- **Prism overlap removal** (`overlap=prism`, `overlap=false`, sfdp's default) and sfdp's `smoothing=triangle|rng`
  work: they need a Delaunay triangulation, which Graphviz takes from GTS and which no WebAssembly build had — ours is
  `wasm/graphviz/st_delaunay.h`, a C port of Delaunator. Not there (GTS only): the spline router for parallel edges in
  the spring engines, which needs a triangulation with fixed segments.
- **As the dot program reads a file:** several graphs in one text (a chooser "2 of 3" appears; a graph that starts on
  the line on which the one before ends is not seen, as with dot), a graph's own `layout=` decides the engine (the tab
  says so), messages name the line of the whole text ("Go to line"); `charset=` is set to UTF-8 because the text
  always arrives as UTF-8 — files are decoded when opened (UTF-8, UTF-16 by its mark, Big5 when named, else
  Windows-1252), binary files and files over 20 MB are refused.
- **The tab:** one layout gives the picture and the chosen text format (plain, JSON, DOT with positions, xdot, canon;
  shown as Graphviz writes it, the first 5,00,000 characters on screen, Copy and Download give all). The newest text
  wins: a layout that holds up a newer text for 400 ms is ended (worker terminated); Stop for a long one. After an
  error the last drawing stays, dimmed, and SVG / PNG / Copy / the text download are refused until the text draws
  again. Messages: Graphviz's doubled "Warning: Warning:" said once, repeats counted, eight lines shown. PNG at
  1× / 2× / 4× on white, within the canvas limits (16,384 px a side, 100 megapixels; made smaller with a note when it
  would not fit). Download names from the opened file, "-2" for the second graph. Control characters XML forbids are
  left out of the SVG with a note. Fit / 100 % / 200 %. Ctrl+Enter draws at once.
- **Assertions stay in the build.** Where Graphviz fails one of its own checks the tool aborts and the module traps at
  the same check; the tab says which ("cp" in chanSearch, ortho.c line 390) and the next graph gets a new instance.
  Known faults of Graphviz 16.1.0 that the hazard graphs ran into (the tool has them too): `splines=ortho` with a loop
  in circo and twopi; in fdp an HTML name `<y>` beside a plain name `"y"` (the tool aborts; the module draws with `<y>`
  never placed).
- **Not loaded:** pictures and files a graph points to (`image=`, `shapefile=`): nothing enters or leaves the page.
- **To update Graphviz:** bump the version and SHA-256 in `wasm/graphviz/build.sh`, check that the two patches still
  apply, build (it leaves the native tool), `DOT=$WORK/native/cmd/dot/dot_static node
  scripts/make-graphviz-reference.mjs`, **read the diff** of `tests/fixtures/graphviz/reference.json`, run both suites.

### Paper Deadlines → Calendar — BUILT (potentials #77; owner's pick of 27 Nov 2026 — group 4 of the suggested order)
(`deadlines` in `src/tools/deadlines.ts`, the paper's dates and the calendar file `src/lib/deadlines.ts` (no DOM); unit
`tests/unit/deadlines.test.mjs` 58, e2e `tests/e2e/deadlines.e2e.mjs` 21 (+ the camera sweep's entry); reference
`tests/fixtures/deadlines/reference.json` from `python3 scripts/make-deadlines-reference.py` (Python's dateutil, the independent reader
— needs `pip install python-dateutil`); fixtures `tests/fixtures/snaps/notice-*.jpg` — a bill, an insurance renewal letter, a school
circular of our own making — by `python3 scripts/make-snap-photos.py`.) The owner's words (potentials #77): "photograph a bill, school
circular, notice or insurance letter → every date and amount found ("due 30 Nov", "renew by", "within 15 days") → one tap per reminder
into the calendar (.ics)".
- **Reading:** the camera helpers' way (`SNAP_READ`, §3 "Router Sticker → Wi-Fi QR"); a line with a date or an amount Tesseract was
  unsure of (a word under 90) read again by PaddleOCR's recogniser (`secondLook`), the surer kept — one digit read wrong and the
  reminder comes on the wrong day. Or a message's text pasted ("Or paste the text of a message").
- **Sentences** (`sentencesOf`): Tesseract puts blank lines inside a paragraph ("… expires on" / blank / "31 January 2027.") — a line
  that ends with a word a sentence cannot end with (on, by, of, the, will …) runs on over it; a label and its value ("Due date:
  15/12/2026" — a colon after a letter, not "10:00"), a heading and a greeting ("Dear Parents,") stand alone; the parts of a line apart;
  no sentence ends after "Rs.", "Mr.", "No.", "Ltd." or an initial.
- **Dates** (`datesIn`): 15/12/2026, 15-12-26, 15.12.2026 (day first as in India — a switch: month first, as in the United States; a
  number above 12 decides either way), 2026-12-15, "6th December 2026", "Saturday, 6th Dec 2026", "1st of March, 2027", "07-Nov-2026",
  "December 6, 2026", "Dec. 6th" — not a circular's number (42/2026-27), a policy number, 1.25 %, a month and a year alone, "2 Market
  Road", an IP address or a version. **No year written:** the next such date on or after the paper's earliest full date, else after
  today — said under it.
- **What each date is** (`labelOf`, from the words before it in its sentence): **a deadline** (due, by, before, last date, expires,
  renew, pay, submit, return, disconnect …: ticked, a reminder 3 days before at 9 am), **an event** (held, meeting, exam, interview,
  appointment … or a time beside it — "at 10:00 am", "4 p.m.", "14:30 hrs": ticked, 1 day before), **the paper's own date** (a label
  that ends with Date, Bill date, Dated … — not a due, expiry or last date: not ticked), another date (not ticked); a date already past
  is not ticked and said. **Counted deadlines:** "within 7 days of the bill date", "within 15 days of the date of this circular", "30
  days after expiry" — counted from the paper's date of that name (days, weeks, months; a month's day held at its end). **Amounts**
  (₹ — read as ¥ by Tesseract —, Rs., INR in Indian grouping, "/-", $, €, £): the sentence's own, else the paper's one amount payable
  beside a payment's deadline. The title: what it is, the paper's heading, the amount ("Due date — Godavari Power Distribution Co.
  Ltd. (₹2,032.71)").
- **The calendar file** (`icsOf`, iCalendar RFC 5545): all-day events (DTSTART;VALUE=DATE) or timed ones in floating local time (the
  paper's 10:00 am is the reader's), an hour long; a reminder (VALARM DISPLAY) — on the day at 9 am, 1 day, 3 days or 1 week before
  (an all-day event's "3 days before at 9 am" is TRIGGER:-P2DT15H, as Apple's and Google's calendars write it), or none; SUMMARY and
  DESCRIPTION (the sentence, the amount, the paper) escaped; a UID each; CRLF, folded at 75 octets.
- **The tab:** a photo (or the camera; Paste image) → "Reminders": the paper's heading and date; a row a date, by date — a tick (44 px
  to a finger), its kind, the amount, its title, date, time (empty: all day) and reminder (all editable), how it was read ("15 days after
  1 December 2026", "the year is not written: taken as 2027", "already past"), the sentence; **Add to calendar (.ics)** per row and **Add
  the n ticked reminders (.ics)** (phones: the fixed bar, the share sheet — the calendar); "Amounts on the paper", "What was read on
  the paper". The switch is kept while the page is open; nothing is stored. Nothing at open: the OCR comes with the first photo.
- **Measured** (the three papers, photographed): every date as printed with what it is for, the counted deadlines (5 December — 7 days
  after the bill date; 2 March 2027 — 30 days after the expiry; 16 December — 15 days after the circular), the meeting at 10:00, the
  amounts — in Node and in the browser; 80 dates as Python's dateutil reads them; every file the tab saves read by **vobject**.

### World Clock — BUILT (potentials #73; owner, 21 Nov 2026; built 28 Nov 2026 — group 3 of the suggested order)
(`worldclock` in `src/tools/worldclock.ts`, its cities, sun and words `src/lib/worldclock.ts` (no DOM), the cities `src/lib/worldcities.json`
(`python3 scripts/make-worldclock-cities.py`), the sun mathcore's `m_sun` (§5.1b); unit `tests/unit/worldclock.test.mjs` 39, e2e
`tests/e2e/worldclock.e2e.mjs` 55; reference `tests/fixtures/worldclock/reference.json` from `python3 scripts/make-worldclock-reference.py` —
astral 3.2 and Python's zoneinfo, `pip install astral==3.2 geonamescache==3.0.2`.) The owner's words (potentials #73): "a world clock with
live ticking of time … standard presets, city presets, all the important ones. Definitely like New York, San Francisco, London, Mumbai,
Sydney, Hong Kong, Singapore … use the common code from time converter".
- **The cities** (`allCities`): GeoNames' cities15000 as geonamescache 3.0.2 carries it (**CC BY 4.0 — said in the tab**) — every city of
  300,000 people and more, every country's capital, the largest city of every zone GeoNames uses (356 zones), a few well-known smaller
  places (Geneva, Oxford, Cupertino, Shimla, Leh, Tromsø …): 2,149 cities, largest first, one line each (86 KB, in the tab's chunk). Names as
  English writes them: Cologne, Seville, "New York" (GeoNames: Köln, Sevilla, New York City), a scholar's marks dropped for Indian, Arabic-
  script, Japanese, Chinese and Korean names (Thane, Ghaziabad, Kofu — GeoNames: Thāne, Ghāziābād, Kōfu); other names people use as aliases
  (Bombay, Bangalore, Madras, Calcutta, Gurgaon, Goa → Panaji, Peking, Saigon, Kiev, NYC, SF …), a US state or UK nation, the country and
  its other names (USA, UK, UAE, Bharat …). Ids: the name's letters and digits and the country ("new-york-us", "tromso-no"), made the same
  in the script and in TypeScript (the unit suite holds all 2,149). A zone of its own is a place too: "utc", "tz:Europe/Lisbon".
- **A card:** the time ticking by the second (the digits — 12 or 24 hours — and a dial, light by day and dark by night where the city has
  a place on the globe), the date there and its day against yours (Today, Tomorrow, Yesterday), how far from your time ("−10 h 30 min from
  you", in words for a screen reader), the zone line (UTC offset · tzdata's abbreviation where it has letters — EST, BST, IST, AEDT; tzdata
  writes "+04" for Dubai, which is left out — · the English name from the browser's CLDR: "Eastern Standard Time", "British Summer Time"),
  **sunrise and sunset** to the nearest minute with the daylight's length, or "The sun does not rise today (polar night)" / "does not set
  today (midnight sun)", a sun or a moon beside the name (day or night there now, by the last sunrise or sunset), and **the next clock
  change** ("Clocks go forward 1 hour on Sun, 14 Mar 2027 at 2:00 am (to 3:00 am)", "— in 4 days" within a week, or "No clock changes in
  the coming year"). Your own clock first ("You": your zone, no sun — the page does not ask where you are).
- **The sun** (`sunEvent`, mathcore `m_sun`): NOAA's equations as astral 3.2 has them — the event of the UTC date, again a day before or
  after when it falls on another local date, none when that does not either; the sun staying up or down from the hour angle. **Clock
  changes** (`nextChange`): the zone's offset by Intl a day at a time for 400 days, the change found to the second by halving.
- **The tab:** the search (a combobox: the arrows, Enter adds, Escape empties) over textcore.wasm's ranking — cities by name, other names,
  state and country; zones by their name, abbreviations ("IST" finds India, Israel and Ireland), English names ("Eastern Time") and offset
  ("UTC+5:30", "+9"), the zones of the largest cities first — each suggestion with its time there now; **sets** (Popular — the owner's
  seven, the first list —, Around the world, Stock markets, India & the world, Asia & Pacific, Europe & Africa, Americas) replace the list;
  move earlier / later, remove; **Undo** for an add, a removal or a set; **12 h / 24 h** (the browser's own way at first); **Look ahead**
  (−12 … +12 hours in quarter hours: every card at that time, its date, sun and day or night with it; "Back to now"). The list is kept while
  the page is open and carried in the address (`#/worldclock?c=new-york-us,london-gb,tz%3AEurope%2FLisbon&h=24` — a link opens that list;
  unknown ids left out); nothing is stored. Phones: one column, the sets in one row that scrolls sideways.
- **Lazy:** at open the tab's code (142 KB with the cities and tzdata's abbreviations) and mathcore (a small engine); textcore.wasm with the
  first focus of the search box (its index of 2,149 cities and the zones built then).
- **Measured:** the sun — 15,624 sunrises and sunsets of 161 cities on 49 days of 2026 – 2027, within 0.5 ms of astral, and the 150 days the
  sun stays up or down and the 4 without the event on that date the same; the clock changes — every change of offset of 2026 – 2027 in
  357 zones (389) to the second, as zoneinfo over tzdata 2026e gives it (the unit suite runs on Node's Intl; the e2e suite on Chromium's:
  New York, London, Sydney, Lord Howe's half hour).

### Everyday timers and randomness — as built after the Nov 2026 bug hunt
(`src/tools/everyday.ts`; e2e `stopwatch` 21, `countdown` 44, `pomodoro` 37, `interval` 23, `dice` 21, `coin` 18, `rng` 37,
`picker` 18, `teams` 18; docs/BUGHUNT.md tabs 157 – 165, docs/WASM-AUDIT.md 154 – 155.)
- **The timers ring in a background tab.** `runner()`: a frame loop while the tab is shown (the display), **one timeout
  per planned end, all set when the run starts or its plan changes** (none chained — Chrome runs a timeout set by a
  timeout only once a minute after five minutes in the background), a 1 s interval (the tab's title; the catch-up after
  a sleep) and the moment the tab is shown again. Steps end at their **planned** times (the next begins when the last was
  due); several ended at once (a sleep) → one beep, for the last. **`timerNow()`** = performance.now() + the time the
  computer slept (the wall clock running ahead by more than a second; performance.now() and the timeouts stand still
  in sleep on macOS and Linux). The screen wake lock is asked for again whenever the tab is shown and let go at once if
  it arrives after a Pause. The alarm's AudioContext is opened in the Start tap (Safari) and closed on leave; the
  end-of-run alarm follows the last step's double beep. The tests switch frames and our interval off to stand for a
  background tab, and lag performance.now() behind the wall clock for a sleep.
- Countdown: at most 99:59:59 (said); title "mm:ss · Countdown" also in the background, "Time’s up · Countdown". Pomodoro /
  Interval: title "mm:ss · step"; **a setting changed during a run keeps the run** — the step being timed stays with the
  time spent in it (made shorter than that: it ends now, the next starts whole), a step no longer in the plan gives way
  to the one at its place, a timer not yet started shows the new plan from step 1; presets (Tabata …) start over.
  Interval: "Get ready" 0 – 60 s (0 leaves it out). Stopwatch: no empty lap from a second Lap while stopped.
- Randomness: Dice and Coin use **libsodium.js** (`randombytes_uniform`; Coin fetches it with the first flip, Dice rolls
  at open); Random Number, Picker and Teams **crypto.wasm** (the same routine plus draws without repeats and shuffles).
  Random Number: ranges up to 2⁵³ (above 2³² three draws give 53 bits, drawn again in the incomplete last block),
  numbers beyond ±(2⁵³ − 1) refused, empty boxes asked for. Teams: once there is more than one line a line is one name
  ("Sharma, Rahul"); a single line is split at its commas; a count of 0 / empty is asked for. Coin: the spin restarts on
  every flip (Web Animations; none with reduced motion).

### Device tabs — as built after the Nov 2026 bug hunt
(`src/tools/device.ts`, maths `src/lib/sensors.ts`; unit `tests/unit/sensors.test.mjs` 25; e2e `webcam` 27, `mic` 26,
`speaker` 30, `keyboard` 25, `pixels` 19, `touch` 18, `screen` 18, `level` 26, `compass` 22, `soundmeter` 18, `ruler` 17;
docs/BUGHUNT.md tabs 166 – 176, docs/WASM-AUDIT.md 156.)
- **Camera and microphone:** `mediaGate()` per tab — the newest getUserMedia request wins, a stream that arrives for an
  older request or after the tab was left is stopped at once; errors in words (`mediaError`: denied, none, gone, busy);
  a device that stops by itself is said. Microphone and Sound Meter open their AudioContext in the tap (Safari).
  Microphone: one 5 s recording at a time, no playback after the tab was left. Fake media in the suites:
  `tests/e2e/_media.mjs` (`__gumError`, **`__gumDelay`** for a permission question still open).
- Dead Pixel Test: without full screen (iPhones) a tap on the last colour ends the test (the hint says so); the
  resting mouse pointer hides. Ruler: the calibration is kept in device pixels — a browser zoom keeps the ruler's size
  (resize + a resolution media query), with a note. Dice: the roll in words for screen readers (`.sr-only`, announced);
  Random Number, List Picker and Team Splitter announce their results.
- Speaker: every stop is a 20 ms fade; the sweep fades in and out. Keyboard: the main block (78 keys, "n of 78 keys
  tested"), the navigation keys and the number pad; keys on no drawing named; held keys released when the window loses
  the focus. Screen Info: refresh rate = 1000 ÷ the median gap of 60 frames' time stamps; Windows by its client-hint
  number (13+ → Windows 11, `platformName`); WebGPU "Available" only with an adapter; the table at once, the rate after.
- **Compass:** `headingOf(alpha, beta, gamma, angle)` — the heading of the screen's top (in landscape a side of the
  phone: `angle` from `window.orientation`, else `screen.orientation.angle`), or of the back camera when the phone is
  within 30° of upright; iPhone: `webkitCompassHeading` + the screen's angle. Magnetic north on both (Safari's heading
  is magnetic too). **Level:** `screenTilt(beta, gamma, angle)` turns the tilt to the screen's axes; the numbers are
  "left–right · front–back". **Sound Meter:** levels kept in dB of full scale, the offset added when shown (min / avg /
  max move with it); avg = the energy average (Leq); unweighted, said.

### Audio Recorder — BUILT (`src/tools/audio.ts`, shared UI `src/lib/audioui.ts`; e2e `tests/e2e/audio.e2e.mjs` 21)
Record the mic (MediaRecorder: Opus/WebM, AAC/M4A on Safari; 128 kbps) with pause/resume, big timer, live level meter
with clip mark and a scrolling waveform; microphone picker; "voice clean-up" (browser echo/noise/AGC) on by default,
optional stereo; Screen Wake Lock while recording (phones). Or open any audio/video file the browser can decode.
Waveform trim editor (peaks from audio.wasm; drag either edge, or type Start/End seconds; "Whole recording"), play
the selection with a playhead. Clean up: normalise (loudest point to −1 dB) and 0.3 s fades. Save as **MP3** (own
LAME 4.0 wasm: 64/128/192/320 kbps CBR or VBR V2, with the LAME/Info tag), **WAV** 16-bit (own C), or **Original**
(the recorded codec cut by packet copy with mediabunny — no re-encoding, and MediaRecorder's missing duration is
fixed; WAV/FLAC originals keep their real sample rate). Volume/fade changes need MP3 or WAV (explained in a toast).
`recorder()`, `waveEditor()`, `savePanel()` and `copyTrim()` are reused by Noise Remover and Pitch & Speed.
**As built after the Nov 2026 bug hunt** (e2e 23): **files are decoded at their own rate** (`decodeAudio` in
`src/lib/audio-client.ts`: mediabunny reads the rate from the headers, an OfflineAudioContext of that rate decodes — a
plain AudioContext resamples to the device's rate; shared by every audio tab); the newest file or recording wins;
microphone errors in words (busy, unplugged — the next try takes the default —, blocked). **16-bit WAV round trip:**
Chromium reads 16-bit PCM as s ÷ 32767 above zero and s ÷ 32768 below, Firefox and Safari ÷ 32768 for both;
`int16Asymmetric()` finds the rule once (one sample decoded) and audio.wasm's writer inverts it (`a_wav` flag), so a
file opened and saved unchanged keeps every sample (the suite compares exactly). Under heavy parallel load in one
headless browser Chromium's MediaRecorder has been seen to ignore `pause()` (docs/BUGHUNT.md, tab 147); the harness
re-runs the suite alone.

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
**As built after the Nov 2026 bug hunt** (e2e 30; docs/BUGHUNT.md tab 150, docs/WASM-AUDIT.md 147): **the sound of the MP4
is AAC everywhere** — AAC and MP3 are copied as they are, any other sound (Opus, a WebM's Vorbis — which mediabunny would
put into the MP4 as it is) becomes AAC at its own bitrate (128 – 256 kbps), "Smaller" is AAC 64 kbps; where the browser
has no AAC encoder (Linux Chromium, Firefox) **@mediabunny/aac-encoder** (libavcodec's AAC in WebAssembly, 1.1 MB) is
fetched for it (`ensureAac` in `src/lib/aac.ts`; ffprobe reads every result back in the suite). "To a size" never goes
above the original's own bitrate (a target above the file's size made it bigger; the result says it was already
under); a target of 0 is refused; the target is named as chosen ("50 MB"); a run keeps its own file and a new file
ends it; Cancel works between the size mode's retries; the newest file wins.

### Slideshow Maker — BUILT (`src/tools/slideshow.ts`; e2e `tests/e2e/slideshow.e2e.mjs` 20 + `slideshow-whole.e2e.mjs` 21)
Photos (our loader: HEIC, EXIF orientation, downscaled to the output size) + optional music → MP4. Frames composed
on an OffscreenCanvas at 30 fps: crossfade (≤ 0.8 s, fade in/out from black), gentle zoom/pan (Ken Burns, on by
default), "Fill" (cover) or "Fit" with a blurred background (a 24 px copy stretched — works on Safari without
`ctx.filter`); shapes 16:9 / 9:16 (phones default) / 1:1 / 4:5 at 1080p or 720p; 1–10 s per photo or "fit to the
music". WebCodecs via mediabunny `CanvasSource` (H.264, else VP9/AV1, QUALITY_HIGH, key frame every 2 s); music looped
or cut to the length with 0.4 s fade-in / ≤ 2.5 s fade-out (our audio.wasm), AAC or Opus (no AAC encoder on Linux
Chromium). Reorder (◀ ▶), remove, live preview with music, progress + cancel, Download/Share. Tests: 3 real photos +
660 Hz MP3 → H.264 1280×720, 6 s, music track; the photo on screen at 1/3/5 s is the right one (diff 6–11 vs 57–75 for
the others); reorder; 9:16 → 720×1280; fit to music → 2 s; music frequency; phone defaults to 9:16.
**As built after the Nov 2026 bug hunt** (e2e 19; tab 151): the music is AAC everywhere (`ensureAac`; it was Opus where
the browser has no AAC encoder); a video is made from a copy of the photos and settings taken when it starts (a photo
removed meanwhile is closed afterwards — drawing it failed the video; a shape changed halfway changed the rest); the
newest music wins.
**Whole pictures (to-do #19; owner, 26 Nov 2026: "none of the pictures get cut at all … the original pictures in their
full, original uncut form") — a third look beside Fill and Fit, which stay exactly as they were:** every photo is entire
on screen for all its time (`placement` in `src/lib/slideshow-geom.ts`): fitted inside the frame, the gentle zoom from
92 % of the fitted size up to it (never past it), the pan only within the room left beside the photo; around it the
blurred photo, black, white or any colour (the start and the end fade from and to that colour); the thumbnails whole
too. Unit `slideshow-geom.test.mjs` 12 (46,000 placements — 8 video shapes × 8 photo shapes, zoom on and off, every frame
of 10 s: inside the frame, the shape kept; Fill and Fit equal to the formula they always had); e2e `slideshow-whole` 21 (a
4 : 1 panorama, a 1 : 3 strip and a square with a coloured square in each corner, made into videos of all four shapes:
the four squares whole in every frame read, from the first to the last frame of each photo; the colour around; the
control — Fit with the zoom, unchanged, cuts the panorama, and the check sees it).

### Noise Remover — BUILT (`src/tools/noise.ts`, worker `src/workers/noise.worker.ts`; e2e `tests/e2e/noise.e2e.mjs` 25, `noise-studio.e2e.mjs` 28)
"Kind of cleaning", chosen above the file picker: **Remove noise** (RNNoise, as below — the default, unchanged) or **Studio
voice** (to-do #20, below).
**Xiph RNNoise 0.2** (recurrent network trained on speech + noise, C, BSD-3) as **Jitsi builds it** —
`@jitsi/rnnoise-wasm` 0.2.1 (Apache-2.0; its "sync" file, which carries the 0.2 model with the WebAssembly inlined,
1.9 MB / 1.34 MB gzipped; the package's `rnnoise.wasm` still has the 0.1 model and is not used), fetched only when the
tab cleans something (docs/WASM-AUDIT.md, tab 144: our own build ran the release's debugging float weights). It equals
the release as RNNoise's configure builds it (8-bit weights). Pipeline in one worker: audio.wasm resamples to 48 kHz
and scales to ±32768 (`a_scale`) → RNNoise in 10 ms frames, one at a time through the module's memory
(`src/wasm/rnnoise.ts`: its two frames of lag removed, so the output lines up with the input; the voice probability of
a frame = the larger of the channels) → back to ±1 and to the file's rate. **The worker keeps the input and the fully
cleaned sound:** Strength (0 – 100 %) is then only mixed (`a_mix2`) — 0 % is the file sample for sample, 50 % the exact
middle; nothing is cleaned again. A newer file ends the cleaning of an older one; Save waits for the file just chosen
and refuses after a failure with the reason; a new file is selected whole, a new strength keeps the selection.
Voice-activity share reported, A/B button ("Hear the original"), waveform trim, MP3/WAV. Open a file or record
(recorder with the browser's own noise suppression off).
Tests: unit `tests/unit/rnnoise.test.mjs` (26) — **every 10 ms frame within 0.02 dB and every voice probability within
0.001 of the native RNNoise 0.2 release** (`bash scripts/make-rnnoise-reference.sh` → `tests/fixtures/rnnoise/
reference.json`: the release from the Ubuntu archive, compiled with `-DDISABLE_DEBUG_FLOAT` and the generic C path, run
by `scripts/rnnoise-ref/driver.c`), white noise −20 dB+, speech kept within 6 dB, pauses −15 dB+, lag 0 to the sample,
channels independent, odd lengths, the module's memory flat over a minute; e2e — LibriSpeech sample + seeded white
noise at 5 dB SNR (`tests/fixtures/speech/`, `scripts/make-speech-fixtures.mjs`) → SNR against the clean reference
from 5.0 to 11.5 dB, rate and length kept, strength 0 / 50 % exact, a strength is a mix, Save right after another file,
the newest file, a 4-minute file superseded, a voice on the right channel only, 48 kHz without resampling, a file that
is no sound, the microphone, leaving mid-clean, phone layout.
**Studio voice (to-do #20; owner, 26 Nov 2026: "when I record my voice, say out in the open, in traffic or outside, when I remove
the noise, there should be a new option so that it should sound as if I'm speaking in the studio, like they do in movie studio
editing"; then: "Just use your discretion and get the best quality" — chosen by measurement, no samples first):**
- **The noise taken out: DeepFilterNet 3** (Schröter et al., 48 kHz; the official v0.5.6 checkpoint as an ONNX graph —
  `soniqo/DeepFilterNet3-ONNX`, MIT, 8.6 MB, SHA-256 pinned in `scripts/assets.json`, `public/models/deepfilternet3/`) on ONNX
  Runtime Web (the app's copy) in the noise worker, fetched from this site the first time Studio voice cleans something, once
  a visit, with its progress. **Its signal processing is our C in audio.wasm** (`wasm/audio/studio.c`, a port of DeepFilterNet's
  libDF — no WebAssembly build of it exists): a 960-point STFT with a 480-sample hop and the Vorbis window, 32 ERB bands of at
  least two bins, their powers in dB less a running mean (α 0.99), the first 96 bins over their running magnitude, the
  network's mask on the bands, its deep filter (order 5, two frames ahead) on the noisy spectrum below bin 96, overlap-add,
  the STFT's 480 samples of delay taken off — held to libDF to float precision (130 dB apart natively; unit `dfn`).
  **Recordings of any length** (`src/lib/studio.ts`): segments of 10 s, each read from 3 s before to 1 s after it, joined by
  0.5 s crossfades (the network's GRUs keep a memory from a segment's start): 40 dB apart from one pass over 31 s and as clean,
  the network's memory and time those of 14.5 s. Two channels of one sound are cleaned once.
- **Chosen by measurement** (the LibriSpeech sentence with DEMAND's street traffic, public square, train station and café
  recordings mixed in at 0 / 5 / 10 dB; SI-SDR against the clean speech; DNSMOS P.835 — Microsoft's speech-quality predictor):
  mean SI-SDR noisy 5.0 → RNNoise 10.6 → **DeepFilterNet 3 14.6 dB**; DNSMOS overall 2.55 → 3.10 → **3.18**; Ceva's DPDFNet-8
  48 kHz (ONNX, 14.9 MB) level with it or below; MossFormer2 48 kHz (ONNX, 229 MB, 27 × the size) better only on café chatter
  (−0.3 OVRL elsewhere at the square and the station); WPE dereverberation (nara_wpe) before it: +0.3 – 0.9 dB SI-SDR in a room,
  no DNSMOS gain in noise — not added; restoration networks (VoiceFixer, Resemble Enhance — generative, hundreds of MB) not
  needed: the tab's own recordings and phone files carry the full band (docs/WASM-AUDIT.md, Noise Remover).
- **The studio finish** ("Studio finish" switch, on; `a_studio_finish` in studio.c, at 48 kHz): a 4th-order Butterworth
  rumble filter at 75 Hz; a downward expander 25 dB below the voice's level (1 : 2, at most 10 dB — quieter pauses); warmth and
  presence (+3 dB below 160 Hz, −3 dB at 350 Hz, +3 dB at 3.5 kHz, +2.25 dB above 10 kHz); a compressor (3 : 1 from 6 dB under
  the voice's level, 5 ms / 100 ms, channels linked); a de-esser (the band above 6 kHz lowered by up to 8 dB while it holds
  more than −8 dB of the energy); the loudness brought to **−16 LUFS as heard on two speakers** (ITU-R BS.1770-4, gated; a mono
  file counted on both — BS.1770's dual mono —, so it is measured −19 on its one channel) and the true peak held at **−1.5 dBTP**
  (4× oversampled, a look-ahead limiter of ±1.5 ms, 80 ms release; measured again and brought back up to four times). The
  thresholds follow the voice's own gated loudness. DNSMOS overall 3.18 → **3.30** (signal 3.41 → 3.54). Measured and not
  taken: −16 LUFS on a mono file's one channel (natural speech's peaks then limited by 3 dB and more half the time — DNSMOS
  marked it down, 3.21); the EQ at ±4 dB (scored higher still — not chased: DNSMOS likes brightness); a peak compressor
  before the limiter (changed nothing measurable); a phase rotator (−0.4 to −1.4 dB of peak only). The line under the
  result says what it did ("Studio finish: −24.0 → −16.1 LUFS, peaks at −1.5 dBTP · the pauses lowered by 3.2 dB · …").
- **Strength** mixes as in Remove noise: without the finish at the file's rate (0 % is the file sample for sample, 50 % the
  exact middle); with it, mixed at 48 kHz and then finished. The finish switched or a new strength is mixed in the worker,
  never cleaned again. Saved as `<name>-studio.mp3 / .wav`. Speed: 10.4 s cleaned in 3.1 s in headless Chromium (one thread).
- **Tests:** unit `tests/unit/dfn.test.mjs` 33 — the STFT, the features, the network on ONNX Runtime Web and the cleaned sound
  held to DeepFilterNet's own libDF + ONNX Runtime (`python3 scripts/make-dfn-reference.py` → `tests/fixtures/dfn/
  reference.json`; needs `pip install deepfilterlib==0.5.6 onnxruntime soundfile numpy`), an identity network through the
  segments (25 s back sample for sample), 31 s in segments against one pass, loudness and true peak against FFmpeg's ebur128
  (the native ffmpeg), every step of the finish on signals with a known answer, silence; e2e `noise-studio` 28 — the traffic
  fixture (`tests/fixtures/speech/traffic-speech.wav`, made by the same script) SI-SDR 5.0 → 15.5 dB (RNNoise 11.2), −16 LUFS
  as heard on two speakers by a BS.1770 written in the suite and by FFmpeg, nothing fetched for Remove noise, the model once
  a visit with its progress, strength 0 / 50 % exact, the finish and the strength mixed not cleaned, A/B, a stereo file of
  one voice cleaned once, leaving mid-clean, a model that cannot be fetched said and fetched at the next try, the phone.
  Both suites also in Chrome on Windows (the Windows check, run 16: noise-studio 28 / 28, noise 25 / 25; run 17: FFmpeg 9.1's
  ebur128 there −16 LUFS, true peak −1.5 dBTP).

### Pitch & Speed — BUILT (`src/tools/pitch.ts`, engine `src/lib/stretch.ts`; e2e `tests/e2e/pitch.e2e.mjs` 18)
Open any audio/video file → speed 0.5–2× (pitch kept) and pitch −12…+12 semitones (length kept), both by **Signalsmith
Stretch** 1.3.2 (`signalsmith-stretch`, MIT — its authors' WebAssembly / AudioWorklet release; docs/WASM-AUDIT.md, tab
145: 7 – 15 dB cleaner on a chord than our WSOLA, which it replaced) rendered offline: an OfflineAudioContext of the
file's rate, the node fed the whole file and started 0.25 s ahead (its latency is 0.12 s; started at 0 it fades in),
the lead cut off, length = input ÷ speed. The worklet loads the package's own file by URL (the package would make a
blob: module, which the CSP refuses); nothing is fetched before the first change. Pitch is within a few cents (speed
alone ≤ 2.4, with a pitch shift ≤ 5.0 — measured; inaudible). One rendering at a time: settings changed during one are
rendered once after it; "Original" is the file itself. A selection follows its passage when the speed changes; the
newest file wins; Save waits for the file and the settings shown and refuses after a failure. Presets (Practice
75 %, Half speed, 1.25×, Podcast 1.5×, ±1 tone, Nightcore, Slowed, Deep voice, Chipmunk); result on the waveform editor
(trim, play); MP3 192 kbps default / WAV. Tests: 440 Hz stereo WAV → "Original" sample for sample, 1.5× = 58,800
samples at 440 Hz (< 3 cents) and full level from the first 10 ms, +7 st = 659.26 Hz and −5 st (< 6 cents) with the
length kept, a C-major chord's stray energy below −40 dB (−47.2), MP3 length, stereo balance, a selection at another
speed, four speeds during a minute-long rendering → at most three renderings, Save at once after another file, the
newest file, a file that is no sound, leaving mid-rendering.
(Audio Recorder) Tests: fake microphone (pause excluded from the length), and a generated 440 Hz / silence / 880 Hz stereo WAV:
exact 1.00 s trims, the 880 Hz part found by zero crossings, channel levels kept, MP3 decoded by the browser,
normalise peak −1 dB, fade envelope.

### PDF Toolkit
Merge, split (ranges / every page), reorder (drag thumbnails), rotate, delete pages, images → PDF
(page size A4/Letter/fit, margins), PDF → images (PNG/JPEG at chosen DPI), **compress** (recompress
embedded images with MozJPEG at a chosen max resolution/quality; "rasterise" mode for scans; "target
size" mode tries levels until the file is under the limit).
**As built after the Nov 2026 bug hunt** (tabs 126 – 138, 42 bugs: docs/BUGHUNT.md "Documents — PDF"; MuPDF 1.28 stays —
docs/WASM-AUDIT.md 124 – 135; unit `tests/unit/pdfpages.test.mjs`, read back by MuPDF and by **pypdf**
(`tests/lib/pdfpages_check.py`, `pip install pypdf`); test PDFs with annotations, links, forms and outlines from
`tests/lib/pdfannot.mjs`):
- **Nothing but the page content used to survive Merge, Split and Organize** (MuPDF's `graftPage` copies no
  annotations): `mergePdfs` in `src/lib/pdf.ts` copies comments, highlights, stamps, links (renumbered), form fields
  with their values (a repeated field name becomes "name (2)", said) and the outlines, with one graft map per file
  (shared fonts and images once); Split and Organize use MuPDF's `rearrangePages` on the file opened afresh. Split
  makes one part at a time; "Every N pages" is a box; page lists take "1 3 5", "1..3" and other dashes (`parseRanges`).
- **A run keeps its own file:** PDF → Images, Compress, Page Numbers and Watermark (`pageRun` in `src/tools/pdf.ts`) —
  a PDF chosen during a run ends it without a result (the old file's pages were saved under the new name); leaving the
  tab ends it; long runs show "Page n of N…" and give the page a breath. Organize draws its tiles at once and the
  pictures one by one (the newest PDF wins); "Rotate all left / right". PDF → Text works page by page and lists form
  values; Copy / .txt of a PDF without text say why.
- **Sizes:** pages are drawn at most 16,384 px a side and 100 megapixels (PDF → Images, Compress "Scanned pages"), the
  pages drawn smaller are named; image names padded (p01 …). Images → PDF "Fit to image" keeps the paper size of a
  file stating ≥ 150 dpi (a 300 dpi A4 scan stays A4); "Sort by file name". Compress: a KB is 1,000 bytes, a target
  under 20 KB refused, images with a colour-key mask kept as they are.
- **Sign PDF:** the signature belongs to the page it was put on (it went on the page shown when saving), stays on the
  page near its edges, strokes scale with the pad; Clear wins over a signature still being made; typed signatures are
  sized to the font's measured bounds (`typedSignature`, shared with the Signature Maker).
- **Fill PDF Form:** an unset radio group shows nothing chosen; ✓ ✔ ✗ ✘ in "type anywhere" are ZapfDingbats with a
  ToUnicode map; a ₹ in a field is stored but MuPDF draws fields with a Latin / Greek / Cyrillic font (known limit,
  said — "Rs." shows everywhere).
- **Unlock / Protect:** a digitally signed PDF (an e-Aadhaar) is unlocked or protected with a warning that the copy no
  longer proves the signature (`signatureCount`); a password outside SASLprep's tables (₹, emoji) is warned about.

### PDF Redact — BUILT (potentials #61; owner's pick of 27 Nov 2026 — group 2 of the suggested order)
(`pdf-redact` in `src/tools/pdfredact.ts`, the library `src/lib/redact.ts` and `src/lib/redact-pictures.ts` (no DOM: the unit suite
runs them in Node on the real MuPDF, Tesseract and zxing-cpp); unit `tests/unit/redact.test.mjs` 26, e2e
`tests/e2e/pdf-redact.e2e.mjs` 45; fixtures `tests/fixtures/redact/` with what is in them (`truth.json`), made by
`python3 scripts/make-redact-pdfs.py` — needs reportlab, pypdf, Pillow and segno.) The owner's words (potentials #61): "black out an
Aadhaar number, PAN, account number or address so the text is really gone from the PDF (not a box over it)".
- **Finding:** each page's text with every character's box (MuPDF's structured text) → the Number Detective's scan
  (devcore-ids.wasm `ids:scan`: Aadhaar numbers and VIDs (Verhoeff), masked Aadhaar, PAN, GSTIN, card numbers (Luhn and a
  network's length), Indian phone numbers (libphonenumber's patterns), e-mail addresses, UPI IDs, IFSC codes, account numbers
  (9 – 18 digits after "A/c", "Account No." …), dates of birth (after "DOB", "Date of birth"), and the reader's words — any line
  typed, whole words, without regard to case or spacing) → a place per match, a box per line it covers. The chips choose the
  kinds (Aadhaar, PAN, phone, e-mail, account, card, UPI and date of birth at first; IFSC and GSTIN when chosen — an invoice
  needs its own). **Comments and form fields are made part of the pages first** (`bakeAll`): a phone number in a sticky note
  or a PAN in a form field is found and removed like the rest. **Pictures** (on at first, "OCR — slower"): a page that is a
  picture without text (a scan: under 20 characters, over 40 % picture) is drawn at 3 px a point and read by the OCR tab's
  Tesseract laid out as a page; every page, drawn at 2 px a point, is searched for QR codes and barcodes by zxing-cpp (an
  e-Aadhaar's QR code holds the number and the address) — a code's box with its quiet zone.
- **The list and the pages:** the places by kind (in the chips' order), each with its page, its text and a tick; "Keep all" /
  "Redact all" a kind; the pages drawn as they come into view, a box over each place (red: redacted; grey, dashed: kept) — a
  click on a box keeps or redacts it (a pointer's shortcut: the list's ticks are the control for the keyboard and screen
  readers — the boxes are as small as the text, WCAG 2.5.8's "equivalent"); **Draw a box** over anything else — a photo, a
  signature, an address — with the mouse or a finger.
- **Redacting** (`redact`, on a fresh copy of the file each time): two passes of MuPDF's own redaction a page — (1) the text: a
  band through the middle third of each place's line (`band`), so only that line's characters go: **MuPDF removes every
  character whose box (the font's ascent to its descent, taller than its ink) touches a redaction — on lines set solid a box over
  one line took letters of the lines above and below**; for a box drawn by hand, a band through each run of the characters whose
  middle it covers (`boxRuns`); for text read in a picture, the whole box (an invisible text layer under it goes too); (2) the
  cover: each place's whole box — the pixels of any picture under it made black, vector drawings inside it removed, a black box
  drawn. **Hidden places** ("Also remove hidden information", on): the document's information (title, author, subject …), its
  XMP metadata, attached files, scripts (document JavaScript, open and additional actions), the tag tree for screen readers (it
  holds the text), page thumbnails (pictures of the pages as they were) and editors' private page data; a bookmark that names a
  redacted value is renamed "(redacted)" in any case. Saved whole — no incremental update (the old text would stay in the file),
  objects deduplicated and unused ones dropped, no encryption: a protected PDF is asked for its password and the copy has none
  (said); a digitally signed PDF is said to lose its signature.
- **Read again before it is offered** (`check`): the saved file opened afresh, every page's text, the document's details,
  bookmarks and comments scanned once more with the same kinds and words — "Read again: none of the redacted text is anywhere in
  the new file", or the values still there and where.
- **Measured** on the test PDFs (a statement of three pages — 17 places of 12 kinds on 10-point lines set solid, a sticky note, a
  form field, the PAN in the title, the Aadhaar number in the subject and in a bookmark, a page turned by /Rotate 90, a page in an
  embedded font; a scan of two pages — a picture only, and a picture under an invisible OCR layer — with a QR code that holds an
  Aadhaar number): every value gone as MuPDF, **poppler's pdftotext** and **pypdf** read the saved file (text, details,
  bookmarks) and from the file with every stream decompressed; every word around them kept, on the lines set solid too; black
  over every place; the scan's numbers no longer read by OCR and no code found by zxing-cpp or **zbar**, the rest of the letter
  still read; the invisible layer without the numbers.
- **The tab:** a PDF (a password asked for) → "What to find" (the chips, words, the two switches, Find; a search runs at once with
  the chosen kinds) → "Places found" (the line "16 places to redact on 3 pages", the list, Draw a box, the pages) → "Redact and
  save" (the phone's bar) → what was removed, the check, the hidden information removed, Download (phones: Share or save)
  `<name>-redacted.pdf`. The chips, words and switches are kept while the page is open. Nothing at open: MuPDF and
  devcore-ids.wasm with the first PDF, Tesseract with a scanned page, zxing-cpp with the first search for codes.

### Safe ID Copy — BUILT (potentials #93; owner's pick of 27 Nov 2026 — group 2 of the suggested order)
(`idcopy` in `src/tools/idcopy.ts`, the rules `src/lib/idcopy.ts` (no DOM), codes on a picture `src/lib/codesread.ts` (shared with PDF
Redact); unit `tests/unit/idcopy.test.mjs` 36, e2e `tests/e2e/idcopy.e2e.mjs` 34 (+ the camera sweep's entry); fixtures
`tests/fixtures/idcopy/` — photos of a made-up specimen card (not any real card's design) and an e-letter PDF behind a password,
`truth.json` — made by `python3 scripts/make-id-photos.py`.) The owner's words (potentials #93): "before an Aadhaar, PAN, passport or
driving-licence copy is sent for KYC — the first 8 Aadhaar digits hidden (the last 4 shown, as UIDAI's masked Aadhaar does), 'For
<purpose> only · <date>' stamped across it, the result flattened into one picture or PDF so the stamp cannot be lifted off; a photo,
or the e-Aadhaar PDF (its password asked for: MuPDF opens it); said in the tab: the copy no longer carries UIDAI's digital signature".
- **A photo** (or the camera — PCs: the webcam; several, a card's front and back): **the card found by the Doc Scanner's finder**
  (DocCornerNet on ONNX Runtime, else the outline imgproc finds — `startQuad`) **and straightened with a margin round it**
  (`expandQuad`: the corners pushed out from the middle by 14 % of its size — both finders stop short of a card's dark band along
  its top, which merges with a dark desk: measured on the specimen card, 4 – 6 % of its height; the OCR's own page finder keeps
  only the light part of a page and cut the band off); then read by the OCR tab's reading path **as it is** (`readPage`, clean-up
  off, set upright and level) — `pre` is the picture the copy is made of, the words' boxes fit it. A photo without a card edge is
  used whole.
- **A PDF** (an e-Aadhaar; the password asked for, the copy has none — said): each page drawn at 200 dpi (the long side at most
  2,400 px); its numbers from the page's own text (MuPDF's characters and their boxes); a page that is a picture (under 20
  characters) read by the OCR. "The copy is made of pictures of the pages: it no longer carries the PDF's digital signature (an
  e-Aadhaar's proves it came from UIDAI) — whoever must check that needs the original file."
- **What is hidden** (`digitCovers`): every Aadhaar number the Number Detective's scan finds (`ids:scan`, Verhoeff) and every
  number in its shape that fails the check (`idShapes`: 4 4 4 digits — a digit misread by the OCR is as private); **its first 8
  digits** under a white box with "XXXX XXXX" (the last 4 left, as UIDAI's masked Aadhaar prints it); **a VID's first 12** (4 4 4 4
  digits after "VID", or one that passes its check — a card number has the same shape); an OCR word's box shared evenly among its
  characters (digits are of one width), so the box ends at the 8th digit — numbers written without spaces too. **QR codes**
  (zxing-cpp): one that holds the full number (`qrNumber`: older cards' XML, `uid="…"`; `<uid>`; the bare number) covered
  ("QR code hidden"); UIDAI's Secure QR (one long signed number — only the last 4 digits in it) kept unless "Cover every QR
  code". Switches: Aadhaar numbers, VIDs, every QR code; each place a tick in the list (the boxes on the picture are a pointer's
  shortcut); **Draw a box** (black) over anything else — a photo, an address, a signature.
- **The stamp** (`stampText`): "For <purpose> only · <date>" — the purpose as typed ("KYC" when empty; its own "for" / "only"
  kept once), the date from a date box (today at first, "27 Nov 2026"); red, blue or black at 15 – 60 % (30 % at first), bold,
  in rows across the whole picture turned 30° (`placeMarks` of the Watermark tab, tiled): no part can be cut off without it.
- **Saved — flattened:** **PDF** (`packPages`: A4 pages, each picture as wide as the text area and no wider than its pixels at 150
  dpi, down the page while they fit — a card's two sides on one page; an A4 page on its own) of JPEGs (MozJPEG, quality 86) —
  pictures only, no text; or **one picture** (JPEG, the copies one under another). Named `<first file>-safe-copy.pdf / .jpg`;
  a PC downloads at once, a phone shares from a tap of its own. The choices are kept while the page is open.
- **Measured** (e2e, in the browser, read back in Node): the two photos of the card — the number found on both sides, the VID
  on the back, the front's QR (it holds the number) covered, the back's Secure QR kept; Tesseract reads the last 4 digits and
  "XXXX" in the copy and never the first 8; zbar reads the Secure QR and not the other; the stamp's pink covers 1 % and more of
  the page; the PDF has no text layer. The e-letter: three places and the VID hidden, its QR covered, no first 8 digits, no
  password. The scanned PDF of PDF Redact's fixtures: the picture page read by the OCR, the number and the QR hidden.
- **Nothing at open:** MuPDF, the finder, the OCR, devcore-ids.wasm and zxing-cpp come with the first photo or PDF.

### Make PDF Searchable — BUILT (potentials #3; owner's pick of 27 Nov 2026 — group 2 of the suggested order)
(`pdf-ocr` in `src/tools/pdfocr.ts`, the text layer `src/lib/searchable.ts` (no DOM); unit `tests/unit/searchable.test.mjs` 28, e2e
`tests/e2e/pdf-ocr.e2e.mjs` 50; fixtures `tests/fixtures/searchable/` — scanned pages upright, lying a quarter to the left, upside
down and shown through /Rotate 90, a page of real text; `truth.json` has every word's box on the page as shown — made by `python3
scripts/make-searchable-pdfs.py`.) The owner's words (potentials #3): "add an OCR text layer to scanned PDFs" — the idea behind
OCRmyPDF.
- **Which pages:** a page with 20 characters of text and more is left as it is (a page of real text, or one read before —
  OCRmyPDF's `--skip-text`); every other page is read, also one without a picture (its letters may be drawn as shapes).
- **Which way up:** a 1,000 px drawing of the page and the OCR's `uprightByReading` (the letters' look, quick readings where it is
  not sure). **"Turn pages that lie sideways or upside down upright"** (on): the page's /Rotate is turned — the page shows upright
  in every reader (OCRmyPDF's `--rotate-pages`); off: the page stays as it is and its words are written along its lines.
- **Reading:** the page drawn at up to 300 dpi (at most 3,000 px — the reading path's size) and read by the OCR tab's reading
  path with its clean-up (the document clean-up, ruled lines and list marks cleared, columns read as a page, a watermark taken out;
  PaddleOCR, the second reader, for a soft page) — **never straightened**: `readPage`'s `straighten: false` (the words must keep
  their places on the page); four languages and "Mixed".
- **The text layer** (`textLayer`): each word as invisible text (render mode 3) in Helvetica (WinAnsi; a ligature written out, a
  character it lacks a "?"), at its box — each line one size (its height ÷ Helvetica's 0.93 em) and one baseline (above the
  descent), each word stretched to its box (Tz) with a space after it, so that readers of the text see words; the text matrix
  turned with the page (`toPage`, `DIRS`: a picture read turned t quarter turns maps back onto the page as shown). Drawn by
  `stampPage` in the page's shown coordinates (any /Rotate); the page's own content untouched (it draws exactly as before).
- **Saved:** `<name>-searchable.pdf`, the password kept (`encrypt=keep`; said, or that it could not be); read again — the words
  written are counted in the new file's text ("every word written is in the new file's text"); pages that read poorly (a soft or
  small scan) named; a signed PDF said to lose its signature. **Stop** keeps the pages read so far. The text read under "The text
  read" (Copy). A PC downloads at once; a phone shares from a tap of its own.
- **Measured** (e2e, in the browser; the file read back in Node): every scanned page of the fixture 95 %+ of its words in MuPDF's
  and poppler's text; a search finds a word over its place in the scan on all four (upright, turned upright from sideways and
  upside down, the /Rotate 90 page; and with turning off, along the sideways lines); the pages draw exactly as before; the page of
  real text untouched; the four pages read in about 10 s.

### PDF Compare — BUILT (potentials #15; owner's pick of 27 Nov 2026 — group 2 of the suggested order)
(`pdf-compare` in `src/tools/pdfcompare.ts`, the comparison `src/lib/pdfcompare.ts` (no DOM), engine `wasm/textkit/src/tokens.rs` →
**textkit-tokens.wasm** (feature `tokens`, 0.20 MB); unit `tests/unit/pdfcompare.test.mjs` 45, e2e `tests/e2e/pdf-compare.e2e.mjs` 44;
fixtures `tests/fixtures/compare/` — two versions of a supply agreement and the ten edits between them (`truth.json`), made by
`python3 scripts/make-compare-pdfs.py`.) The owner's words (potentials #15): "Two versions of a contract or agreement side by side,
changes highlighted on the pages".
- **Reading** (`tokensOf`): each page's characters with their boxes — MuPDF's structured text (`pageText` of PDF Redact), or on a
  scanned page the OCR's reading path (turned upright by `uprightByReading`, read at up to 300 dpi with the clean-up, never
  straightened; `ocrText` gives each character a share of its word's box and maps it back onto the page as shown) — become
  tokens: words (letters, digits and their marks; an apostrophe or a hyphen between letters and a full stop or a comma between
  digits inside the word: "Buyer’s", "e-mail", "1,25,000") and every other sign on its own. **A word broken over two lines**
  ("agree-" / "ment", or a soft hyphen) is one word, with a box on each line; it keeps its hyphen only where the documents
  write it with one elsewhere ("well-known"). **Running heads and page numbers** are left out (PDF → EPUB's rule, `headerKeys`,
  in the frame of the page's text — a page shown turned has them at a side; an option).
- **Comparing** (`keyOf`, `compare`): tokens in their compatibility form (ﬁ is fi), typographic quotes and apostrophes plain;
  capitals and punctuation ignored when asked. The engine: the `similar` crate's **patience algorithm** (chosen by measurement:
  on 60 stretches of real legal prose — the Federal Register's pages, a paper — with 615 known edits it found 609 exactly and
  no change that was not made; Myers' algorithm 598 and 10 changes that were none, a "the" matched far away; histogram 608, but
  it told a moved clause as the two clauses round it moved the other way — docs/WASM-AUDIT.md 190); then ours: **runs that are
  only added or removed slide** to where they read best (from a sentence's end, ending with one — git's indent heuristic for
  words); **a short equal run between two changes is taken into them** (diff-match-patch's semantic clean-up, capped at 3
  tokens and 20 characters: "thirty (30" → "sixty (60" is one change, not two round the "("); **a removed run put back
  elsewhere is a move** (the same tokens, or 80 % of them in order: "moved, with small changes"). A 5 s limit on the search.
- **The tab:** two pickers (passwords asked for; Swap), the options (capitals the same, punctuation left out, running heads
  left out, read scanned pages, their language), Compare → "10 changes: 5 changed, 3 added, 1 removed, 1 moved · 19 words
  added, 11 removed"; what is compared (words — not fonts, colours, pictures or the layout); notes for scanned pages read by
  the OCR ("a word it misreads shows as a change") or left unread. **The list:** each change with its kind, page and words in
  their context (struck / green / blue), a button that makes it current. **Previous / Next change** (round and round; Alt+↑ /
  Alt+↓ anywhere but a text box, N / P in the list or the pages), "Change 3 of 10 — original page 1, changed page 1"; the
  current change outlined on both sides and brought a third of the way down each column. **The pages side by side** (PC):
  each version's pages drawn by MuPDF as they come into view, the changes marked where their words stand — red on the
  original (taken out, changed), green on the new version (added, changed), blue for a move, a thin bar where words were added
  or taken out on the other side; a click on a mark makes it current. **Scroll the two together** (on): the word at the top
  of one column brought to the same height in the other (`counterpart`: an unchanged word's partner, a changed word to its
  change). **Phones:** one version at a time (Original / Changed). **Saved:** both PDFs with the changes as comments that any
  reader shows (`markPdf`: strike-outs on the original — "Now: …" —, highlights on the new version — "Was: …" —, carets
  where words were added or taken out, the move's places; the password kept) — `<name>-compared.pdf` —, and the list (Copy,
  `<changed>-changes.txt`). Nothing at open: MuPDF with the first PDF, textkit-tokens.wasm with Compare, the OCR with a
  scanned page.
- **Measured:** the test agreement (another font size, width, line and page breaks; ten words broken with hyphens; curly
  against straight quotes; other running heads and page counts) — exactly the ten edits; with every page of the new version
  turned (/Rotate 90) — the same ten, marked down the page; the new version scanned — the ten (a moved paragraph "with small
  changes" where the OCR ran two words together) and two signature lines the OCR does not read; the marked PDFs read back by
  MuPDF (each highlight and strike-out over its change's words), pypdf (the comments) and poppler (the text unchanged).

### PDF Tables → Excel — BUILT (potentials #16; owner's pick of 27 Nov 2026 — group 2 of the suggested order)
(`pdf-tables` in `src/tools/pdftables.ts`, the cells, the joining and the reading of amounts and dates `src/lib/pdftables.ts` (no DOM),
the finder `wasm/textcore/table.c` in **textcore.wasm** (`t_tables`, own C), the .xlsx and the CSV by **sheet.wasm**; unit
`tests/unit/pdftables.test.mjs` 71, e2e `tests/e2e/pdf-tables.e2e.mjs` 32; fixtures `tests/fixtures/tables/` — a bank statement of
two pages, the same with ruled lines, an electricity bill with two tables among its paragraphs, the statement's first page as a
scan; `truth.json` holds every cell — made by `python3 scripts/make-table-pdfs.py`.) The owner's words (potentials #16): "Bank-statement
PDFs → clean rows in Excel/CSV". MuPDF's own table finder (`table-hunt`) loses columns on every one of these PDFs: docs/WASM-AUDIT.md 191.
- **Reading a page:** its words with their boxes (MuPDF's characters, words between spaces; text running up or down a margin left
  out) and its ruled lines (PDF → EPUB's `readRules`: thin filled bars and stroked lines). A scanned page (`pageKind` of PDF Redact)
  is read by the OCR's reading path (set upright by `uprightByReading`, at up to 300 dpi, with the clean-up, never straightened),
  each word's box as tall as its line (`ocrWords`: the OCR's boxes hold only the ink, and the finder measures its gaps in word
  heights); "Read scanned pages" and their language are options.
- **Finding the tables** (`t_tables`, Tabula's and Camelot's two ways): **ruled** — horizontal and vertical lines that touch make a
  grid; two lines and more each way and two cells and more with words in them are a table, its columns and rows between the lines,
  the rows above the first with a number its header (at most two). **Lined up** — words on one line make a line, cut into chunks at
  gaps wider than 0.6 of the usual word height; runs of lines of two chunks and more (no gap above 2.2 word heights), with the
  narrow one-chunk lines among them (a narration wrapped onto a second line), are a table when three lines have two chunks; its
  columns are the stretches no chunk of its lines with a number covers (a chunk wider than 45 % of the table — a total across
  columns — left out); three of its lines must reach two columns or more (label-and-value lines, "Account number: … IFSC: …",
  are no table); a row starts at a line with a word in the **key column** (the leftmost one 80 % of the lines with numbers fill —
  the date) and takes the lines under it; up to two lines above, without numbers and in two columns or more, within 3.5 word
  heights, are its header (a rule between them). A one-chunk line at the end is a note under the table unless it follows as
  closely as a wrapped line. Tables in reading order, top to bottom.
- **A cell's text** (`cellText`): its words line by line, the lines joined by a space — or by nothing after a "/" or "-" (a
  narration wrapped at a slash: "…/CHEQUE 004521/" + "NARMADA PACKAGING LLP"). **A table that runs on over pages** (`joinPages`, an
  option, on): a table at the top of a page continues the last table of the page before when it has the same columns (within 2 %
  of the width) or the same header — the repeated header left out.
- **Amounts and dates** (`typed`, an option, on): 1,25,000.00 → 125000, (1,234.00) and 1,234.00 Dr → −1234, Cr and ₹ / Rs. / INR
  dropped; dates day first (07/11/2026, 7-11-26, 7 Nov 2026, 07-Nov-2026 → 7 November 2026; 31/02/2026 stays text); a reference
  or account number stays text (no grouping and more than 9 digits, or more than 15; a leading zero: 005953). **In the .xlsx a
  date is a real date shown as printed** (`excelCell` → sheet.wasm's `{ date, format, shown }`: 07/11/2026 → `dd\/mm\/yyyy`, the
  separators escaped — Excel reads a bare / in a date format as the computer's own separator, 01-11-2026 on many Indian Windows
  set-ups); in the CSV dates are ISO (2026-11-07) and amounts plain numbers. Off: every cell as printed.
- **The tab:** a PDF (a password asked for) → "Reading the tables" (the three switches, the language), the progress page by page
  → "Tables": "1 table found (a table that runs on over pages is one)"; each table a card — its pages, "46 rows · 7 columns ·
  columns that line up · a header row · joined over 2 pages, the header they repeat left out", the first 30 rows as printed
  (amounts right-aligned; the header sticky; the table scrolls in its own box), Excel / CSV (with a BOM, for Excel) / Copy (tab
  separated, to paste into a spreadsheet); **Save as Excel** (the phone's bar): every table a sheet ("Table 1 (pages 1–2)"), the
  header bold and frozen with a filter — `<name>-tables.xlsx`, `<name>-table-1.csv`. **The pages:** drawn by MuPDF as they come
  into view, each table outlined and numbered, its columns dashed; **Draw a table** — drag a box round a table it missed: the words
  inside are one table (`force`), "Table 3 (drawn)", with Remove. No table: what a table needs, said. The choices are kept while
  the page is open. Nothing at open: MuPDF, textcore.wasm and sheet.wasm with the first PDF, the OCR with a scanned page.
- **Measured:** the statement — one table of 46 rows and 7 columns over its two pages, every cell as printed (the narrations wrapped
  over two lines, the last one at the foot of page 2), the header read once; the ruled statement the same, its grid read, and
  **pdfplumber** (the unit suite's reference) reads its cells as ours do; the bill — its two tables and nothing of its paragraphs;
  the scan — the 30 rows of its first page, 90 %+ of the cells as printed, the header over the rule; the Excel file read back by
  **openpyxl** (dates datetime, amounts numbers, references text) and shown by **LibreOffice** with the dates as printed.

### Doc Scanner
Camera or upload; automatic page detection with draggable corners; perspective correction; enhance modes (Colour
clean, Grey, B/W adaptive threshold); multi-page → PDF (A4/Letter/fit) or JPEGs.
**As built after the Nov 2026 bug hunt** (`src/tools/scanner.ts`; page finder `src/lib/pagefind.ts` (glue, no DOM),
`src/workers/pagefind.worker.ts`, `src/lib/pagefind-client.ts`; unit `tests/unit/pagefind.test.mjs` 38, e2e
`tests/e2e/scanner.e2e.mjs` 37; fixtures `python3 scripts/make-scan-photos.py` (photos with exact corners) and
`python3 scripts/make-scanner-reference.py` (OpenCV's area resize) — need `pip install scikit-image
opencv-python-headless`):
- **Finding the page** (docs/WASM-AUDIT.md 121): the preview (1,100 px; 900 on phones) is made 224 × 224 with imgproc's
  `resizeArea` (OpenCV's INTER_AREA, pixel for pixel — what the network was trained on) and given to **DocCornerNet
  LEAN** (scanic-ml 0.2.0, MIT, 1.9 MB) on **ONNX Runtime Web 1.31** (the app's copy, shared with Text-to-Speech) in a
  worker, fetched with the first page (about 5 MB over the wire). Its corners are used when P(document) ≥ 0.5 and they
  make a convex page of at least 2 % of the photo (`startQuad`); else imgproc's outline (Otsu + the largest region);
  else the whole photo, 2 % in from the edges. The line under the photo says which ("page found", "outline of the paper
  found", "no page found"). If the finder cannot be fetched the tab says so once and goes on with the outline.
- **Pages:** only the preview is kept; the photo is read again, one page at a time, when saving (phones run out of
  memory with full-size photos). Every page has a thumbnail; move earlier / later (off at the ends), rotate, delete,
  "Whole photo", "Start over". Corners that cross or fold back are said under the editor, the preview dims, and saving
  is refused with the page's number. Handles: 26 px drawn, 46 px to touch, arrow keys (Shift = larger steps), a screen
  reader hears where each one is.
- **Saving:** pages straightened at up to 3,000 px; PDF (MuPDF): colour and grey pages as JPEG (quality 80), black and
  white as PNG (lossless — the smallest and crispest); A4 and Letter fit the page (turned for a landscape scan); "Fit to
  scan" = the scan's shape with A4's long side (297 mm). JPGs: quality 80 (B & W 85). Phones and PCs: "Use camera" /
  "Use webcam" — the camera stays open and every Snap adds a page (owner, 20 Nov 2026) — and "Choose photos"; Share.

### Book Page Flattener — BUILT (potentials #96; owner, 21 Nov 2026; built 27 Nov 2026 — group 1 of the suggested order)
(`bookflat` in `src/tools/bookflat.ts`, steps `src/lib/bookflat.ts` (no DOM), engine `wasm/imgproc/flatten.c` in
imgproc.wasm; unit `tests/unit/bookflat.test.mjs` 106, e2e `tests/e2e/bookflat.e2e.mjs` 37; fixtures `tests/fixtures/books/`
with ground truth, made by `python3 scripts/make-book-photos.py` — `tele.jpg` taken with a phone's 2× lens and saying so in
its EXIF, `--focal F --exif`.) The owner's words (potentials #96): "photograph two pages
of an open book → the curve near the spine flattened, the two pages split left and right, the lines straight → clean pages as
pictures or a PDF; the OCR tab and the Photo Dictionary then read printed books as well as a Kindle page."
- **The engine** (`p_book_fit`, `p_book_render`, `p_book_locate`, `p_book_project`; bindings `bookFit` / `bookRender` /
  `bookLocate` / `bookProject` in `src/wasm/imgproc.ts`): **Matt Zucker's page-dewarp method** (MIT, as page-dewarp 0.3.4
  has it) in our C — the text mask (mean adaptive threshold, dilated along the lines), word blobs (`cm_label`), chained
  into lines (spans: edges of at most 100 px, 1 px of overlap and 7.5° of turn, best first), sampled every 20 px; the page
  a sheet bent along one axis (z = a cubic of x, end slopes held within ±0.5) seen by a pinhole camera — its pose, the
  cubic, a height per line and a place per sample fitted so the model's points fall where the photo has them. **The
  camera's focal length** is the photo's own where it says it (EXIF FocalLengthIn35mmFilm, as phones write it: `focalFrom35`
  in `src/lib/bookflat.ts` — 26 mm on a 4 : 3 photo is 1.50 half-widths of the longer side), else 1.45 (a phone's main
  camera, a webcam); page-dewarp's 1.2 is a wider lens's. Each page's record keeps the focal length it was fitted with. **Ours** (measured, and why:
  docs/WASM-AUDIT.md 179): the fit by Levenberg–Marquardt with the per-sample unknowns eliminated (a Schur complement —
  milliseconds; page-dewarp's Powell took 5 – 90 s a page); the **working size from the letter height** (letters about
  7 px: close-ups and far shots alike); the **gutter** of a spread found from the word blobs in four bands before lines
  are chained (a straight line through the widest empty stretches near the middle; a gutter is at least 4 % of the text's
  width — wider than two columns of one page — and each side holds a fifth of the text), lines never chained across it;
  a strip of the facing page at a side left out; **lines held to the page's margins** (a second pass: the lines whose
  ends meet the densest start / end — justified text; indents, short last lines and headings free; a line the model fits
  far worse than the others — a table's ruled pieces, a caption beside a figure — left out and the page fitted again);
  **word blobs that are no print left out**: the paper's own top and bottom edges (the table on one side of the blob: the
  light end of the grey 3 px above and below it apart by more than 30 and a sixth) and specks of the table's grain (darker
  than the grey round them by less than the photo's words are — their darkest tenth above the words' median + 0.2, kept
  within 0.75 – 0.9); **the page's extent from the paper**: from the text outwards along the model until the light end of
  nine samples across the edge falls below the paper just inside the text (its 80th percentile, raised by the lightest
  step on the way) — page numbers, running heads and the margins come with it, a light table and a foreshortened margin
  are found; **a page of a spread reaches the gutter** on its inner side (the words nearest the spine stand on the steepest
  curl and seldom join a line of the fit; the spine's shadow is no paper's edge); at least half a line's height round the
  text; **drawn along the paper** — across, by the length along the curved sheet (the cubic's arc length), so the words
  near the spine are not squeezed —, bicubically in colour at the photo's own resolution.
- **Measured** (photos of `scripts/make-book-photos.py`: two printed pages (Literata, Liberation Serif, Noto Sans) bent
  near the spine — the slope falling off from the spine, θ0·e^(−s/L), a different curl per page and along the spine;
  `--thick` steeper and deeper; a phone's still or a video frame, turned and tilted; `--focal` another lens; the ground
  truth = where each printed point was seen): lines bent 0.026 line spacings (thick books 0.038; the photo 0.50;
  Leptonica's dewarp 0.27, page-dewarp 0.13); the flat page 0.38 % of its width on average from where the text was printed
  (40 pages; the photo 1.3 – 2.6 %), its shape within 0.8 % of the printed page's; photos of a 2× zoom, an ultra-wide lens
  and a webcam-like one, with the lens from their EXIF, 0.26 % (42 pages; without it, a 2× zoom's 1.75 %); 80 of 82 pages
  end at the paper with their running head and page number; OCR (the app's reading path) of 16 photos 90.7 → 92.4 % of
  the words, every page as well as the photo or better.
- **Which way up:** the letters' guess first (`textTurns` of `src/lib/upright.ts`); a fit is taken as lines of print only
  when they are (`found()`: 8 samples a line and more, fitted within 3 px — a photo held sideways makes short "lines" of
  letters joined across, about 4 samples each, fitted at 5 – 7 px); else the photo turned a quarter either way is tried
  and the turn that found the most text kept. A photo without print (a cup of coffee) gives no page, said.
- **Also a step of the OCR tab and the Photo Dictionary** (their shared reading path flattens a photo of an open book before
  it is read: §3 OCR, "Books").
- **The tab:** photos (or the camera — page after page, as the Doc Scanner) → each photo's pages flattened at once; a strip
  of every page in order, named ("Page 2: right page of IMG_0042.jpg"); for the page chosen: the photo with what was found
  drawn on it (a dot for each sample — the left page's orange, the right's green —, the gutter dashed, each page's outline
  as the model sees it, the chosen one heavier) beside the flat page; "Pages in this photo": Find out / One page / Two pages;
  **"Camera lens"**: "As the photo says (52 mm)" where its EXIF does, else "Main camera or webcam (1×, about 26 mm)", and
  Ultra-wide (0.5×), Zoom 2×, 3×, 5× for a photo that lost its EXIF in a chat app (a zoomed page flattened as the main
  camera's comes out skewed); turn the photo a quarter by hand; move a photo earlier or
  later; remove it. Clean-up: Colour (the paper whitened, the gutter's shadow evened out) / Grey / B & W / Original (imgproc
  `docEnhance`). Save: one PDF (MuPDF; "Fit to page" — each page its own shape, A4's length — A4 or Letter; B & W pages as
  PNG) or JPEGs (`book-page-01.jpg` …); Share on phones. Only a copy of each photo (≤ 1,600 px) is kept; the photo is read
  again when saving and each page drawn at most 3,200 px (2,400 on phones) from it at up to 4,000 px.


### Newspaper Clipper — BUILT (potentials #110; owner, 21 Nov 2026; built 27 Nov 2026 — group 1 of the suggested order)
(`clipper` in `src/tools/clipper.ts`, steps `src/lib/clipper.ts` (no DOM), the hand-over to Text-to-Speech `src/lib/handoff.ts`;
unit `tests/unit/clipper.test.mjs` 156, e2e `tests/e2e/clipper.e2e.mjs` 48; fixtures `tests/fixtures/news/` with every story's
words, made by `python3 scripts/make-newspaper-photos.py`; measured with `node scripts/measure-clipper.mjs DIR` — the tab's own
code in Node.) The owner's words (potentials #110): "photograph a newspaper article that runs over several columns → the page
found and straightened, the reader taps the blocks of the article (a page holds several stories) → its columns stacked one
under another in reading order with the headline on top — PDF → EPUB's rule for side-by-side pieces, each marked 'part 1',
'part 2' … → one clean, tall picture that reads on a phone by scrolling, a PDF, or its text (to copy, or to hear with the
Text-to-Speech voices); an article continued on another page joined from a second photo".
- **Reading a page** (`readClip`): the photo at most 4,000 px → the page found and straightened (the OCR tab's finder:
  `src/lib/pagecrop.ts`, the Doc Scanner's network where the outline is not a page's) → set upright and level
  (`src/lib/upright.ts`) → **sharpened** (imgproc's unsharp mask, 1.0) and cleaned up (`docEnhance`, grey) → read by Tesseract
  **laid out as a page** (PSM 3: its blocks — a headline, a column, a caption). Read again **sharper** (2.0), the reading that
  scores better kept, when the first shows that Tesseract's layout went wrong: words in blocks it took for vertical text
  (`readingOf` counts them: `vertical`) or five lines of the page that no word covers (`unreadLines`: imgproc's ink regions with
  the words left out). Measured: Tesseract's layout lost whole columns next to a picture (its halftone finder grows into
  touching letters) and took soft columns for vertical text — both coming and going with a 1 % change of size; the light mask
  read both picture pages whole (536 → 673, 597 → 675 words), changed nothing on sharp pages; the strong one read the soft page
  (136 → 626). **The pictures**: the ink left once the words read are taken away, in areas three lines high and wide and more
  (`picturesOf`) — a photo, a drawing, a chart; blocks of their own.
- **The blocks** (`blocksOf`, on Tesseract's words): **a headline's line** has letters 1.3 × as wide as the text's and words
  1.15 × as tall (letter width, not height: Tesseract's boxes of a whole line of justified text were sometimes twice as tall as
  its letters); runs of headline lines are headlines wherever they stand in a block (inside one, only standing apart from the
  lines round it); a headline's lines that came as blocks of their own are one; a block over two columns is cut at the gutters
  no word crosses, and at gaps of a line and a half; a line read across the columns under a wide headline goes to the columns
  it stands over.
- **A story from its headline** (`storyOf`, on core boxes — `coreBox`: one word's box reaching into the block under it decides
  nothing): the headline, the first row of blocks under it (its columns, its picture and caption), the columns beside them that
  start with them (a short headline) unless a nearer headline of their own stands above them or their row goes up, block by
  block, to another headline (the columns under another story's picture), and each column on down to the next headline or a
  wide gap. **The order** (`readingOrder`): textcore's XY-cut on the blocks' core boxes, cut at gaps of 2 px (a headline can
  stand 10 px over its columns). Measured on 16 photos of the generator (`measure-clipper.mjs`, each story's headline tapped,
  the clipping held to the story as printed — its headline, its picture's caption, its text): **93 of 127 stories clipped
  whole** (95 % of their words in order, nothing of other stories), nearly all on the sharp photos; the misses are soft or
  badly lit photos (Tesseract reads them poorly — the tab says so) and a page whose edge the page finder cut.
- **The tab:** photos (or the camera — page after page, a story continued on another page joined from its photo) → each read
  in turn with its progress ("reading the page… 64 %", "again, sharper"); the page shown with every block outlined (dashed: a
  headline, dotted: a picture) and tappable — **a headline puts its whole story in** (tapped again, takes it out), any block
  goes in or out; "Stories on this page" lists the headlines as buttons (a phone's finger needs no tiny box); each chosen block
  carries its part number. **The clipping:** the parts in order, each movable up / down within its photo or taken out; the
  preview; **"Mark the parts"** (on: "Part 1", "Part 2" … — "· photo 2" when photos are joined) as large as the text; the
  clipping as wide as the story's widest column at the photo's own resolution (a second photo's text drawn the same size); a
  headline wider than that set again word by word to the width (it keeps its size); a picture made smaller to fit; a margin
  round it. Clean-up Colour / Grey / B & W / Original (`docEnhance` on each page). **Save picture** (JPEG, PNG in B & W; named
  after the headline), **Save PDF** (A4 pages inside half-inch margins, each ending between two lines or two parts —
  `pageCuts`), Share on phones; **its text** (editable) — Copy, Save .txt (CRLF), **Read aloud**: the Text-to-Speech tab opens
  with it (`give('tts', …)` / `take('tts')`, in memory: nothing stored). A photo read poorly (confidence below 60, fewer than
  25 words) gets "a sharper photo — closer, in good light, the phone held still — reads better". Each page is kept as a JPEG
  (a phone's memory) and a copy of at most 1,400 px for the screen; the clipping is cut from the JPEG when saved, in memory
  (no canvas limit).
### OCR
Tesseract 5 LSTM (tesseract.js-core wasm), **languages English, French, Spanish, German** (owner decision Nov 16 2026:
"don't bother about Hindi"; `@tesseract.js-data/{eng,fra,spa,deu}` 4.0.0_best_int, MIT, vendored) + "Mixed" (all four).
`cacheMethod: 'none'` so models are never stored in IndexedDB (stateless). Image upload, camera, or paste from
clipboard; optional pre-clean (imgproc doc enhance, grey); low-confidence words highlighted; copy / download `.txt`.
**As built after the Nov 2026 bug hunt** (`src/tools/ocr.ts`, engine `src/lib/ocr.ts` — shared with the Photo
Dictionary; e2e `tests/e2e/ocr.e2e.mjs` 24): tesseract.js 7.0.0 (docs/WASM-AUDIT.md 122). A failed download of the engine
or a language is caught through Tesseract.js's error handler (it otherwise waits for ever) and said in words; the next
try starts afresh. The picture goes to Tesseract.js as the PNG bytes it would make of it itself (`imageBytes`; it made them
after it was called, and a tab left in that moment had its worker ended under it — an uncaught error, found by the PDF
Redact suite); a worker ended so is refused in words. A reading below 60 % confidence is tried turned the three other ways (a copy of ≤ 1,200 px) and the
picture read the way that is clearly better (≥ 60 % and 20 points more), the line says so; buttons turn the picture
by hand. With the clean-up on, a dark picture (mean luma < 110) is inverted first. The newest picture or language wins.
**Camera (owner, 20 Nov 2026: "take a photo with the camera if it's on the phone, or with the webcam if it's on the
PC"; the first tab with it — then every picture tab: §3 "Camera in every tab that takes a picture"; e2e 57):** the
picker's own camera; Snap takes the full frame into the editor, scrolled into view (`reveal`), and its text downloads
under the photo's name (camera-20261120-211503.txt). The picker does not force the camera (screenshots, photos already
taken; an iPhone's picker also offers its camera app).
**Paste image (to-do #37; owner, 27 Nov 2026: "Make both ocr app and photo dictionary app take images, as input, from the
clipboard", "Make a paste button for ocr and photo dictionary apps on the pc too"; this tab and the Photo Dictionary):** a
"Paste image" button beside "Use webcam" / "Use camera", on PCs and phones (`imageInput(…, { paste: true })`; the button steps
aside with the camera's while the camera is open). It reads the clipboard with the browser's Async Clipboard API
(`src/lib/clipimage.ts`; read in the tap itself — Safari reads only there): Chrome on Windows, Linux and Android asks once
for leave, iPhone Safari shows its own "Paste" to tap. The picture (PNG first, then JPEG, WebP …; an SVG drawing last)
arrives as a chosen file does, named clipboard-20261127-091503.png (-2 … within a second), so the text downloads as
clipboard-….txt. Said under the buttons, in the device's words: text instead of a picture or an empty clipboard (how to
copy a picture there — a right-click's Copy image, a screenshot to the clipboard: Win+Shift+S, Shift+PrtScn; press and hold
on Android; Photos → Share → Copy Photo on an iPhone; a picture *file* copied in a file manager arrives only with Ctrl+V),
a refusal (where to allow it: the site settings' Clipboard; on an iPhone, tap Safari's Paste), a page without the focus.
A newer picture wins over a slow clipboard. Ctrl+V as before (it needs no leave). Where the browser cannot read the
clipboard from a button, there is no button. Unit `clipimage` 37, e2e `paste-image` 29 (Chromium's real clipboard granted
and refused, a stand-in for the rest; the OCR's text and the Photo Dictionary's words the same as the file's).
**The text on the clipboard as soon as it is read (to-do #38; owner, 27 Nov 2026: "Both the ocr and the photo dictionary app
should copy the ocr text to the clipboard immediately after conversion"; this tab and the Photo Dictionary):** the OCR tab's
text as its box shows it (the lists' marks and indentation kept), the Photo Dictionary's whole text (its words broken over two
lines put together, as shown), and the line beside Copy ("Copy the text" in the Photo Dictionary, a button of its own there)
says "Copied to the clipboard.". **Begun in the tap that starts the reading** (`src/lib/clipwrite.ts`, `laterCopy`): Chrome
writes to the clipboard while the page has the focus, Safari and Firefox only within a tap — and a reading takes seconds; so
the tap hands the clipboard a ClipboardItem whose text is still a promise, given when the text is read (Chrome and Safari
take such an item; Chromium keeps it until the text arrives). The tap is **Extract text** in the OCR tab, and in the Photo
Dictionary — whose reading starts as the photo arrives — **Snap, Paste image or Ctrl+V** (`imageInput`'s `onTap`, called in
the tap before anything is awaited; a tap's copy is the next reading's within 15 s, `FRESH_MS`); a photo chosen as a file
begins its copy when its reading starts (Chrome writes then; Safari refuses). Where the item is refused, the text itself is
written once it is there; where that is refused too (Safari, a photo chosen from the gallery), the line says "Not copied by
itself: this browser lets a page copy only when you tap — press “Copy”." and the button does it in one tap. **Dropped** — the
clipboard left exactly as it was — when nothing is read, a newer picture comes, the language or the turn is changed, or the
tab is left (the promised item rejected: no write left waiting). Not awaited by the reading: the buttons stay free. Unit
`clipwrite` 29 (stand-ins of the browsers' clipboards: promised items taken, refused, both refused, no ClipboardItem, one
that cannot take a promise, none), e2e `ocr-copy` 25 (Chromium's real clipboard: every write recorded with the event it was
made in — `click` for Extract text, Paste image and Snap, `paste` for Ctrl+V, none for a file —, the text handed over and
read back exactly; nothing read, a newer picture, the tab left → the clipboard as it was; no leave → said, Copy does it; a
stand-in with Safari's rule: the gallery photo said and copied by the button, Paste image copied by itself; a phone). The
suites share the browser's clipboard: the OCR and paste-image suites read without the leave to write (the OCR suite gives it
for its Copy check only), so their readings do not write to it.
**A photographed page straightened first (owner, 21 Nov 2026: "just like the photo dictionary, the OCR app should also
work really well from my phone" — `todo.md` #9; e2e 64):** with the clean-up on, the page of a camera's photo (a Kindle's
screen in its black body, a sheet on a table) is found and straightened before it is read (`src/lib/pagecrop.ts`, the
Photo Dictionary's) and shown in place of the photo, so the unsure words are marked on what was read; the line says
"the page was found and straightened". A page that gives fewer than 25 words → the whole picture is read too, the better
kept. A screenshot or a scan made by a program (more than a fifth of it exactly one colour: imgproc `p_flat_share`) is
read as it is — a white panel in it is no page. Measured on the generated Kindle photos: the clean-up of before read
1 % of a still in Noto Sans (the black body divided by itself), the photo as it is 81 %, straightened and cleaned 99 %.
Phones' Snap takes the camera's still (§3 Photo Dictionary, Progress). A reading below 60 % confidence (`POOR`) adds
"the text reads poorly: a sharper photo, closer and in good light, reads better" to the line under the text.
**The phone held sideways (owner, 21 Nov 2026 — `todo.md` #11: "turn it 90 degrees horizontally, either with my left hand or my
right hand … it can't understand a thing"):** both this tab and the Photo Dictionary set the text upright before it is
read (`src/lib/upright.ts` on imgproc's `p_text_turns`): after the page is found and straightened, the lines' axis
comes from each letter's nearest neighbour (letters of a word stand closer than the lines) and which end is up from the
letters that rise above the x-height against those that drop below the baseline (Latin script: more ascenders); looked
at 1,200 px long, then 800 and 1,800 (letters too small at one size, specks at another). Where only the axis is clear
(a blurred frame of a whole Kindle photo) a copy of at most 1,000 px is read both ways round and the better reading's
way kept (`uprightByReading`). The line says "the text stood sideways: the picture was turned a quarter to the left to
read it"; a picture turned with the buttons is read as it is shown. Works on the picture alone — a phone held either
way, a gallery photo, a page held sideways to a webcam. Measured: the page found in each of the four real photos turned
four ways gives the right turn in all 16 cases (unit `textturns.test.mjs` 36); the Kindle photo turned 90°, 270° and
180° reads 95 %+ of its words in this tab and gives 90 %+ of the upright photo's uncommon words in the Photo Dictionary,
also from a phone still lying across the picture (e2e).
**At any angle (owner, 21 Nov 2026: "especially on the phone, when I click it at different angles"):** both tabs level a
slanted photo and set it upright before it is read (`src/lib/upright.ts`), from two looks at the ink, both own C in
imgproc.wasm: **the lines** (`p_text_lines`: the ink of letter and word size projected across every direction, by a
degree and then a tenth; the direction with the sharpest profile — Postl's criterion, as Leptonica's skew finder uses
it — is the lines'; sound where letters run together on a soft photo, and exact to a tenth of a degree on the real
pages) and **the letters** (`p_text_turns`: the axis from each letter's nearest neighbour, the top from the letters that
rise above the x-height against those that drop below the baseline). A slant of 5° and more is levelled (the picture
turned back on a canvas that holds every corner, the new corners white). **Nothing they say is trusted alone**
(`uprightByReading`): on a soft photo the letters run together into words and a look can be wrong — the first version,
live for a few hours, turned two upright photos of the Kindle set over or sideways and read 2 % and 0 % of their words
instead of 98 % and 80 % (docs/BUGHUNT.md). Each picture a look suggests, and the picture as it is, is read quickly — the
middle, at most 1,000 px a side at its own scale (smaller copies and 700 px crops decided worse) — and scored by the words
read right as the OCR's confidence in each puts them (`score`: words of two letters and more; not the average
confidence — a page lying sideways is read confidently in a few places, the OCR turning some lines by itself); a change
is kept only when it scores above 1.15 × the picture as it is + 3. Nothing is read when both looks say upright and level
(never wrong on the set); only the picture as it is when its lines run across, nothing needs levelling and it reads at
65 % confidence or more (text upside down reads far below); when the looks see the lines run different ways (a desk's
stripes in a whole photo), each one's direction and slant is tried. The line says "the picture was levelled (12°) to read
it" ("levelled (7°) and turned a quarter to the left"; the Photo Dictionary: "the photo was …"). **Measured**
(`node scripts/measure-ocr.mjs DIR --prep page,page+level --tilt DEG`: the 24 Kindle and newspaper photos of
`scripts/make-kindle-photos.py`, turned on their own ground with a camera's noise; the page found and straightened →
also set upright and level): level 67.0 → 67.0 % of the words read right (none worse), turned 25° 53.9 → 63.0 %, −35°
46.1 → 59.3 %, a quarter 55.8 → 66.0 %, upside down 1.8 → 65.8 %. The cost: about one quick reading more for most upright
photos (two thirds of them; none where both looks agree). What still fails is the page finder on some tilted whole
photos (it takes a wrong outline) and photos too soft to read at any angle. Unit `textturns.test.mjs` 74 (the pages of
three real photos turned 8° … 200° come back level — the profiles measure the turn exactly —, a reader that knows the
page: wrong suggestions refused, the right way round kept) and `imgproc.test.mjs` (a made-up page at known angles and in
four orientations); e2e: the whole Kindle photo turned 30° and −40° reads 95 %+ of its words, a close-up of its screen
(no edge, words cut at the sides) turned 20° and −25° 90 %+ of the words of the close-up as it is, the two soft upright
photos the first version spoiled (`kindle-blur`, `kindle-comfortaa`) read as they stand — and the Photo Dictionary gives
90 %+ of the same uncommon words (`tests/e2e/_tilt.mjs`).
**Documents — one reading path for both tabs (to-do #18; owner, 26 Nov 2026: "can u make the ocr app's ocr capability the
same quality as the Photo Dictionary's … works very poorly for a document that has formatting, rich text formatting like
bullet points, indentation, etc., especially using the phone camera. Also improve the quality when the document has a
watermark"; "no need to keep bullets and indentation in the text;.. but the ocr shold not get confused by them" — corrected
later the same day for the OCR tab, whose text is to keep them: to-do #31; "One
shared reading path is fine.. but make sure no functionality is compramised.. the high quality of the ocr is paramount
!!!"):** both tabs read through `readPage` (`src/lib/readpage.ts`), and each asks for its own steps (`ReadOptions`) — the
OCR tab: its clean-up switch, light text on a dark ground turned over, the turn buttons, a poor reading tried the other
ways round, four languages; the Photo Dictionary: "Photo of a screen". The engines are passed in (`ReadEngines`), so
`scripts/measure-ocr.mjs` (`--prep read`) and the unit suites run exactly the tabs' code. In order:
1. the picture turned as the reader turned it; at most 3,000 px;
2. **the page** (clean-up on): the Kindle finder's outline (`p_page_quad`) is checked edge by edge — a page is lighter
   than what lies around it (`p_quad_steps`: a step of 20 and more; an edge along the photo's border counts); with fewer
   than four such edges (a white sheet on a light desk) the Doc Scanner's network is asked too (DocCornerNet on ONNX
   Runtime, src/lib/pagefind.ts — fetched only then), its 224 px look fitted to the photo's edges (`p_refine_quad`; a
   corner may lie outside the photo where the page runs off it), and the outline with more real edges is taken. **An
   outline that leaves a fifth of the photo's letters outside is no page** (`p_quad_text`: on a scan with a strong
   CONFIDENTIAL the white area its letters fence in passed for the page; pages leave 0 – 8 % outside, such regions 25 –
   73 %). A flat picture's outline square on is a screenshot's panel (left alone); **no outline more elongated than 6 : 1
   is a page** (`MAX_ASPECT`: the most elongated page found in the measured photos is 1.49 : 1 — on Windows, where Chrome
   draws the OCR suite's dark test sentence in Arial, the outline of its one line was straightened as a page and its
   descenders cut off: "iumps … lazv doa"). Straightened; a strip of the desk or
   of a screen's bezel along its edges painted the paper's colour (`p_clear_border`: with a dark strip down its side
   Tesseract dropped a form's title);
3. upright and level (`src/lib/upright.ts`, above); its quick readings look at the window with the most ink
   (`p_ink_window` — the middle of a form is often blank paper) and read one block;
4. the clean-up: (OCR tab) a dark picture turned over; ("Photo of a screen") the moiré blurred; the document clean-up;
   **a watermark taken out** (`p_clear_wash`, below); **ruled lines and list marks cleared, the columns counted**
   (`p_clear_marks`, own C): a mark is the first thing on its
   line (nothing just before it — also no word run together on a soft photo, longer than the search for neighbours
   reaches: "UI" after a blob "Scuba Configuration" was cleared as a ticked box; `cm_run_before`, to-do #31),
   followed by a gap wider than every word space of that line — ● ○ ■ ▪ ◆ ► □ ☐ ☑ ☒, Word's "o" after a tab; a box
   (□ ☐ ☑ ☒: a frame with ink in its four corners, which no letter has) by any gap, as a checklist sets it off by a word
   space (to-do #31: a Google Docs checklist's boxes stayed and were read as "[J" and "[0"); **faint marks** — a box or a
   ring drawn in thin grey strokes, which a phone's photo softens below the ink threshold in places (a checklist's ☐ whose
   top and bottom came out fainter than its sides: two bars in the ink) — are looked for on the light ink: a frame or a
   round mark, the first thing on its line, paler than the letters after it, and only where another mark of the page
   stands at the same place on another line (a list: a pale letter of a light watermark stands alone); on a soft page
   (its letters pale) a blob without a hole as dark as the letters and as tall as they are (0.85 of the x-height and
   more) is a letter whose hole the blur closed — the "a." of a lettered list, set off by a tab, which #18's clean-up
   erased as a dot, or a roman "ii." run together — and stays; a small mark drawn thin is as pale but shorter (the ➢ of a
   soft frame, 0.67 – 0.78 of the x-height: kept, they made Tesseract read 33 % of the page instead of 46 %) and is
   cleared. Every mark cleared is listed where it
   stood and as what it was (the OCR tab puts it back: "The page's lists", below); and
   what only looks like one stays (the Spanish "o" after a word space, "i.", a colon, the dot of an i, a bullet between
   two words, a degree sign; and the word "a" at the start of a Kindle line, which a soft photo makes a solid blob — the
   first version cleared it); a rule is a long thin run with paper beside it from 2 px out (a table's grid, a signature
   line — not the middle of a soft word, not a bold word's top and bottom: the first version erased "Department" and
   "configuration" on a video frame of a form);
5. read as one block (Tesseract's mode 6, what Tesseract.js does unless told), or **as a page** (mode 3: its layout
   analysis reads each column on its own) when the page has two columns or more — gutters on a page of at least twelve
   bands of text, columns at least eighteen x-heights wide, the lines on the left reaching the gutter (a form's labels and
   a table's cells are no columns). A page with rules, list marks or columns read less surely than 85 % is **read again
   the other way** and the reading with more words surely read kept (`score`, by 3 %);
6. a page found that gave fewer than 25 words: the whole photo read too, the better kept; (OCR tab) a reading below
   60 % tried the other ways round.
**Watermarks:** one as strong as printers make them (CONFIDENTIAL in grey, a red DRAFT, a blue stamp) is a second,
lighter level of ink under the text — laid out as a page, Tesseract took the text under CONFIDENTIAL's big letters for a
picture and left a paragraph out. When the ink of a light page has such a level of its own (a narrow peak in the greys,
with darker text below it), its broad strokes — wider than any letter's — are painted the paper's colour
(`p_clear_wash`); the text over it is darker and stays. Never on a page whose text is the grey itself (a Kindle's — the
first version painted a whole Kindle page white) or on a dark page. A light watermark needed nothing of its own: the
document clean-up and the page checks above read it as well as a plain page. Measured on the same six pages plain, with
a light watermark and with a strong one (each a phone's still, a video frame and a scan): plain 73.7 → 85.8 %, light
watermark 69.6 → 88.4 %, strong 74.4 → 82.3 % (a newsletter under a strong CONFIDENTIAL 50.3 → 90.6 %).
**Measured** (`node scripts/measure-ocr.mjs DIR --prep read` against the code before #18, checked out at d456729 and run
as the tabs ran it — `--prep page+level --psm 6`): the Kindle and newspaper photos 65.4 → 68.0 % of their words read right;
36 photos of the documents of `scripts/make-format-docs.mjs` (a phone's still, a video frame, a scan each) 71.6 → 87.1 %;
the same pages laid out harder 63.3 → 75.3 %; with watermarks (54) 72.5 → 85.5 %; lines that begin with a stray sign (a
bullet read as a letter) 148 → 73, 136 → 65, 225 → 116. **No photo reads worse:** a photo counts as worse only beyond
its own noise — the old code on the same photo shifted by 2 px moves up to 9 points on soft document photos (a form's
video frame 86.3 → 77.5 %), Kindle photos hardly at all. Time (Node, a quiet 4-core machine, 12 photos): 6.6 → 7.2 s a
photo, the Kindle photos as before. **PaddleOCR** (PP-OCRv6, RapidOCR 3.10, on the photos as they are) read less than the
new path on every set — Kindle 67.4, documents 81.6, harder 72.7, watermarks 81.6 % — but more on soft video frames
(watermarked frames 68.5 against 61.0 %): Tesseract stays the first reader; PaddleOCR became the second, for soft photos,
at the owner's word (below). The measuring script used to read every page in mode 3,
which the tabs never did (Tesseract.js reads mode 6 unless told): the earlier numbers of this section were of mode 3.
Not measured: Tesseract's float "best" models (the tabs use best_int, the same network in 8 bits) — the host refused
the download here. Unit `pageclean.test.mjs` 50 (`tests/fixtures/ocr/`: marks.jpg — every kind of mark and its
look-alikes, a table; columns.jpg; soft.jpg — blurred justified lines that begin with "a"; the watermark taken out, grey
text and dark pages left alone), `readpage.test.mjs` 22 (a stand-in reader: every step of both tabs), `pagecrop.test.mjs`
47 (with the real watermark scan
`doc-memo-watermark-scan.jpg` and the network); e2e OCR and Photo Dictionary: three photographed documents
(`doc-checklist-draft-still`, `doc-newsletter-frame`, `doc-memo-still`: 85 – 92 %+ of their words in reading order, no
mark read as a letter, no rule as |) and the watermark scan read whole (95 %+).
**The second reader: PaddleOCR for soft photos (owner, 26 Nov 2026: "Ok use PaddleOCR fallback for soft photos").** A
reading Tesseract is unsure of — its confidence below 88 (`SOFT` in `src/lib/readpage.ts`: soft video frames, a shaken
still) — is read again by **PaddleOCR**: PP-OCRv6's small detector and recogniser (Apache-2.0, 31.2 MB, out of the RapidOCR
3.10.0 wheel on PyPI — `scripts/assets.json`) on ONNX Runtime Web in a worker of its own (`src/workers/paddle.worker.ts`),
fetched from this site with the first soft photo and kept for the visit. It reads the page Tesseract read (found,
straightened, set upright and level) as it stands, or cleaned up where the clean-up cleared list marks or turned a dark
page over (`secondPicture`: the clean-up is made for Tesseract — on a Kindle's grey e-ink it cost PaddleOCR up to 10 points
a photo, and on formatted documents the marks and rules it clears are what PaddleOCR misread). **The reading with more
words read right as each reader's own confidences say is kept** (`expectedRight`: every word of three letters and more
counts the share of words its reader gets right at its confidence — `RIGHT`, measured on the training photos and made
monotone; Tesseract's words at 95 are right 97 times in 100, PaddleOCR's at 99.9 only 91: it is sure of words that are not
there). The pipeline is RapidOCR's, ported (`src/lib/paddle.ts`; the pixel steps in imgproc.wasm in OpenCV's own
arithmetic — INTER_LINEAR's fixed point, fillPoly's pixels for the box scores) and held to RapidOCR's Python (unit
`paddle` 51, `scripts/make-paddle-reference.py`), **without its direction classifier** (it turned 134 of 3,611 upright
lines over, every one then read as garbage; the page is set upright before). A page of columns is read column by column:
textcore's XY-cut is given the middles of PaddleOCR's boxes (`cutInput` — the boxes reach past their text, neighbouring
lines touch, and the narrow gap under a title above two columns hid the way into them: in order, 19,986 → 26,547 of the
27,859 words PaddleOCR read on the multi-column photos). Both tabs say it in the line ("the photo was soft: PaddleOCR
read it"), show the progress ("Fetching PaddleOCR, the second reader (12.0 of 31.2 MB, once a visit)…", "PaddleOCR is reading
the soft photo: line 12 of 41…"), mark its words below 85 as unsure and give the "snap again" hint below 85
(`PADDLE_UNSURE`, `PADDLE_POOR`); models that cannot be fetched leave Tesseract's reading, the reason in the line.
**Measured** (the readings of `OCR_JSON=DIR OCR_JSON_MAXCONF=92 node scripts/measure-ocr.mjs SET --prep read --paddle`;
the rule worked out on 114 photos, checked on 78 made afresh — `make-kindle-photos.py --first 100`, `PHOTO_SALT=check1
make-doc-photos.py` — and on 12 newspapers more, `--first 200`): training 80.6 → 86.6 % of the words read right (Kindle
and newspapers 67.9 → 71.9, documents 87.1 → 93.1, harder 75.3 → 81.6, watermarked 85.5 → 92.2); the second set 83.8 →
93.4 % (Kindle and newspapers 80.0 → 89.7, documents 85.3 → 94.3, watermarked 84.4 → 94.5); 20 newspapers 52.6 → 65.6 %;
**no photo worse.** A newspaper whose columns stand closer than PaddleOCR's boxes reach is read across them (one box for
two columns' lines: newspaper-101, 75.5 % against Tesseract's 97.9) — such pages were read surely by Tesseract and never
reached the second reader. The cost: a soft photo is read once more — 15 – 30 s in Node on a 4-core machine, a phone
longer, with the progress shown; a sharp photo nothing. Unit `readpage` 38 (both readers, the picture, the columns, the
rule), `paddle` 51; e2e OCR 91 (a soft checklist frame 60 → 93 % and a two-column newsletter frame 72.5 → 94 %, the
models fetched only then — three files, once a visit —, refused models), Photo Dictionary 124 (the checklist frame: 21 of
the 25 uncommon words of a clean copy, Tesseract alone 16).

**The page's lists kept in the OCR tab's text (to-do #31; owner, 26 Nov 2026: "In the OCR app, the rich formatting should be
preserved, the bullet points, etc. In the photo dictionary app, it need not be, only because the actual OCR rendition is
needed for me to further select a phrase that I could then look up in Wikipedia"; the owner's choices: plain text with the
marks at the line starts and nested items indented — in the text box, Copy and the .txt —, lists only: bullets, check
boxes, numbered and lettered items, indentation).** The reading is not changed — its words, their order and its lines stay
as the reader gave them (`readingOf` in src/lib/ocr.ts gives Tesseract's lines; PaddleOCR's reading has its lines too). The
marks the clean-up clears before the page is read (step 4) are listed by `p_clear_marks` — where each stood and what it
was: a dot, a ring (Word's o; a ring whose hole the blur closed, by being paler than the letter after it), a square, a
diamond, a triangle, an empty box, a box with a tick or a cross (by the quarters of the box its ink fills — a cross fills
all four, a tick leaves the top left empty), a ring round a dot — and `src/lib/listtext.ts` sets the reading out with them:
- each mark is put back before the word that followed it — • ◦ ▪ ◆ ► ☐ ☑ ☒ ◉ (the size of a mark is not told: ● and • are
  one) — matched by the height of that word, so a page not quite level keeps its marks on their lines; a mark PaddleOCR
  read as a character (it reads the page as it stands when the clean-up saw fewer than two signs of a list) is left out;
- a line that begins with a list's label as text — a number, letter or roman numeral (i … xxxix) with its full stop or
  bracket (1. 2) (3) a. B) iv.), or a mark the reader read itself (– - * + > ➢ ✓ …) — is an item too; "1.2" (a numbered
  heading) and a number alone are not;
- an item is indented four spaces a level: the levels are the places the items' marks or labels stand at, left to right,
  counted afresh for each list — a list ends at a line that starts left of its items' text, at the top of a new column,
  or well below its last line (three lines' heights);
- a line an item runs on to (it starts under the item's text, within three quarters of an x-height — a table right after
  a checklist starts a little left of it and is no part of the last item) is set under that text — four spaces a level
  and the mark's or label's width and a space; a line under a parent item after its sub-list belongs to the parent;
- the blank lines Tesseract puts between one list's items (its paragraphs) are left out where they stand as close as
  lines; around a list they stay.
A page without a list keeps the reading's text exactly. The Photo Dictionary keeps its text plain (its e2e suite checks
that no mark comes back). **The reading itself** changed only where the clean-up did: checklist boxes cleared after a word
space, faint marks cleared, a soft "a." or "ii." kept as letters (step 4) — and a label kept counts with the cleared marks
where the marks decide which picture PaddleOCR reads and whether a page is read again (`listSigns` in src/lib/readpage.ts:
counted as the marks are, a soft report frame with its "ii." kept went to PaddleOCR as it stood and read 70 % of its words
where it had read 74 %). **Measured** (`OCR_LIST=DIR node scripts/measure-ocr.mjs SET --prep read --paddle` against the
build before #31 on the same sets; every list line of the pages held to `scripts/make-format-docs.mjs`'s `<page>.lists.json`
by `tests/lib/listscore.mjs`): **the reading as before** — the same photos read in the same order by both builds
(Tesseract learns from the pages read before it in a process): the documents (108 photos of 18 pages — a phone's still,
a video frame and a scan of each, photographed twice) 92.2 → 92.2 % and 94.5 → 94.5 % of their words read right, the
harder set 81.7 → 81.6 %, the Kindle sets 71.9 → 71.9 % and 89.7 → 89.7 % (every photo as before), newspapers 66.4 →
66.3 %; no photo worse beyond its own noise — the most, a soft memo frame 92.1 → 89.8 % (shifted by 2 px it reads alike
or better: 91.1 / 92.4 / 92.8 against 91.1 / 91.8 / 92.8) and a soft checklist frame 81.7 → 80.2 % (one ○ more cleared,
PaddleOCR reads its line a little otherwise; shifted: −2.0, 0, 0, where the old build alone moves 3.5 points); stray
signs where bullets stood 193 → 189 lines; every photo's text holds exactly the reading's words. **The lists** on those
108 photos (before: none — no marks, no indentation): 565 of the 756 list items set out as on the page, mark or number
and level (74.7 %: scans 90.5 %, phone stills 79.8 %, soft video frames 54.0 %), 285 of the 334 lines an item runs on to
set under its text (85.3 %), the marks the clean-up clears written as what they were 89.4 %; 20 lines set out as list
lines where the page has none.
**Not kept:** a ✓ used as a bullet (the clean-up does not clear it; Tesseract reads "v" or "+"), ➢ (read as ">" or ">»":
its indentation is kept, not its look; on a soft photo, its point blurred round, it is cleared and written •), a mark too
soft or too small to see; headings and tables (the owner: lists only).
Tests: unit `listtext` 73 (marks, levels, run-on lines, numbers and letters, paragraphs, columns, a table after a checklist, a slanted page,
PaddleOCR's reading of a mark, Tesseract's real reading of the memo photo: 14 of 14 items, 9 of 9 run-on lines),
`pageclean` 71 (each mark of marks.jpg listed as what it is; four lossless pictures of what `p_clear_marks` gets —
`OCR_MARKS=DIR node scripts/measure-ocr.mjs … --only PHOTO` writes them as `PHOTO.read.marks.png`: a phone's still of a
checklist — faint rings and boxes —, a soft memo frame — closed rings, the "a." kept —, a soft report frame — its ➢
cleared, its "ii." kept —, a soft form frame — "UI" after a word run together kept), `readpage` 39 (`listSigns`),
`pagecrop` 50; e2e OCR 95 (the photographed memo, checklist and
newsletter held to their pages' lists; .txt and Copy with the marks), Photo Dictionary 127 (its text stays plain) — both also on Windows (the Windows check, runs 12 – 13).

**Books — their pages flattened first (potentials #96 as a step of both tabs, the last of the owner's group 1; built 27 Nov
2026 — the owner, 21 Nov 2026: "the OCR tab and the Photo Dictionary then read printed books as well as a Kindle page").**
With the clean-up on, before the page finder (`bookPages` in `src/lib/readpage.ts`): the Book Page Flattener's fit
(imgproc's `p_book_fit`, `wasm/imgproc/flatten.c`) on a copy of at most 1,600 px, the photo turned a quarter either way when
the lines run up and down it (`analyse` of `src/lib/bookflat.ts`), the camera's lens from the photo's EXIF where it says
(FocalLengthIn35mmFilm: both tabs read it with `readExif`; else a phone's main camera — measured: wide-angle photos 94.0 →
96.0 % with their lens). **A book** (`isBook`): **two pages** either side of a gutter (no flat photo of the ~400 measured gave
the fit two pages) — kept when the flat pages read surely (Tesseract's confidence 88 and more: every such spread read better
or as well); read unsurely (a soft close-up), the page is read the usual way too, each reading gets its second reader
(PaddleOCR) where it is soft, and the reading with more words read right as each reader's confidences say is kept — on a tie
the flat pages, whose words stand in order (measured: a soft 2× close-up read 13 % of its words flattened against 32 % the
usual way); **one page** — bent by 1.2 % of its width and more (`bendOf`: the paper's curve against its chord; flat pages
0.05 – 1.1 %, a book's 1.2 – 9 %), 15 lines and more, fitted within 1.6 px — **read both ways**, the flat page kept only when
its reading scores 5 % more than the page found the usual way (`BOOK_BY`; a strong watermark's big diagonal letters bend a
flat page's fit as a curl does — flattened, such pages read 4 – 70 % of their words instead of 90 – 100 %). Each page is drawn flat from the photo at the
photo's resolution (`renderPage`), a spread's left page above its right one with a white gap (`stackPages`: one block of text,
in order), then set upright (a book photographed upside down), cleaned up and read as any page; the OCR tab shows the flat
pages in place of the photo and says "the book's two pages were flattened (the curve near the spine taken out) and are read
left, then right"; the Photo Dictionary's line says it too. Flat pages that give fewer than 25 words: the page found the usual
way is read too, the better kept. A poor reading tried the other ways round (the OCR tab's retry) takes the page finder, as
before. **Measured** with the tabs' own code (`node scripts/measure-ocr.mjs SET --prep read --paddle`; `read+noflat` and
`read+flatall` force the step off, or on every page whose lines are found; the photo sets made by `scripts/make-book-photos.py`,
`make-kindle-photos.py`, `make-format-docs.mjs` + `make-doc-photos.py`; `--focal F --exif` for other lenses): 16 photos of
open books 90.2 → 93.2 % of their words read right in order, 12 of thick books 53.7 → 88.0 % (a thick book's single pages 62.6
→ 92.7 %), 8 taken with an ultra-wide lens 84.9 → 96.0 %, 8 close-ups with a 2× lens 63.9 → 67.3 % (soft: some read under a
third either way), the repository's four 82.4 → 98.3 % (`thick.jpg` 35.0 → 98.6 %); **no photo reads worse** — of 390 flat photos (Kindle pages and
newspapers, documents, the same with watermarks, each set twice) the rule took two, both strong CONFIDENTIAL newsletters, read
them both ways and kept the usual reading. Forced onto flat pages the step costs points (newspapers 87.2 → 83.3 %, watermarked
documents 92.2 → 88.4 %): hence the rule. The cost: the fit on every photo read with the clean-up (0.1 – 0.2 s in Node), a
second reading for a single page that passes the rule or an unsure spread (and its second reader). Unit `readpage` 70, e2e
`ocr-books` 25 (both tabs on `tests/fixtures/books`: 97.8 – 99.1 % of the words in order in the browser; the Photo Dictionary
finds 90 %+ of the uncommon words of a clean copy of the text).

### Camera in every tab that takes a picture (owner, 20 Nov 2026)
Owner: "In all apps that offer to upload an image, also add the option of taking a photo if it's a phone app, and take
the photo with a webcam if it's a PC app." No engine to fetch: the browser's getUserMedia.
- **`liveCamera` (`src/lib/livecam.ts`):** "Use camera" on phones — the back camera; the camera-switch symbol turns to
  the front one — and "Use webcam" on PCs — the default webcam; "Switch camera" goes through the others when there are
  more. A live view in the page (up to 4K, the whole picture, not mirrored so text reads the right way; a selfie's view —
  the résumé photo, `facing: 'user'`, front camera first — is mirrored as a mirror is, the photo is not). Snap hands
  over the frame as pixels and, for tabs that read files, as a JPEG (quality 0.92) named as a phone names its photos:
  camera-20261120-211503.jpg (-2, -3 … within a second). One photo: Snap closes it; several (`multiple`): it stays
  open, a shutter flash (none with reduced motion) and "n photos taken", Done closes it.
- **It closes** on Snap, Cancel / Done, a file chosen, dropped or pasted instead, another camera of the page opening (one
  at a time — an iPhone cannot hold two), its box hidden by another mode (a ResizeObserver: no camera left running
  unseen), and when the tab is left (`onLeave`, registered as it opens — no tab has to remember it). A camera that
  answers after that (the permission question was still open) is stopped at once; one that stops by itself is said;
  refusals in words (`cameraError`). While it is open a phone's fixed action bar steps aside (`html.cam-open`) and
  `reveal(el)` (`src/ui.ts`) brings the view and its buttons in between the sticky tab rows and the screen's foot.
- **Where:** built into `imageInput` — Image Editor, Photo & Signature Resizer, Background Remover, Cartoonizer, Image to SVG, Clipart Maker, Blur &
  Redact, Text on Image, OCR, Signature Maker, Sign PDF, Photo Dictionary (21 Nov 2026), and the camera helpers of 27 – 28 Nov
  2026 — Router Sticker → Wi-Fi QR, Visiting Card → Contact, Paper Deadlines → Calendar, Bill Splitter by Photo, Camera Reader (`camera: false` for Passport
  Photo, which has a camera of its own); `imagePicker` (a file picker with the camera, photos arriving as files) — Batch Images,
  HEIC → JPG, Watermark (photos and the logo), Collage, Doc Scanner, Images → PDF, Slideshow (several photos each), Safe ID
  Copy (a card's sides), the
  Cartoonizer's own style painting, the Background Remover's background photo, the logo / signature / photo of GST
  Invoice, Rent Receipt and Resume; EXIF / Photo Info (owner, 21 Nov 2026 — a photo taken in the page carries no
  metadata, and the tab says so: "Taken here in the browser …"); FFmpeg's main picker (owner, 21 Nov 2026 — the
  snapped photo is the file to work on) and its picture inputs (logo, the picture for a sound, picture-in-picture;
  shown when a task asks for one). The phones' native camera inputs (Doc Scanner, Signature Maker, Sign PDF) are gone
  — the live camera does it on both. **Beside the camera button, "Paste image"** where a tab asks for it (`paste: true`:
  the OCR and the Photo Dictionary — to-do #37; `liveCamera`'s `beside` holds it in the camera's row).
- **Without a camera, on purpose** (EXEMPT in the sweep): SVG Optimizer (it takes SVG drawings, which no camera makes);
  the QR & Barcode Scanner keeps a camera of its own.
- **Tests:** `tests/e2e/camera.e2e.mjs` — every picture picker a tab shows, on a PC and a phone, has the camera in its
  card; in every tab the stand-in camera (`tests/e2e/_camera.mjs`: a canvas stream showing a sentence) is opened, Snap
  pressed (twice and Done where a tab takes several) and the tab's result checked; modes, one camera at a time,
  leaving; phones: the back camera, the résumé selfie mirrored, pages one after another in the Doc Scanner. The OCR
  suite holds the component's behaviour in detail (what Snap takes is read back; Switch; late and refused answers).

### Photo Dictionary (`photodict`, Text, **PC + mobile** — owner request, owner chose the name) — BUILT
**Owner, 21 Nov 2026:** "Looks like you missed out the photo dictionary app" — it was mobile only (the owner's choice of
16 Nov), so a PC showed only "made for phones"; asked, the owner chose **PC + phone, the photo from the webcam on a PC**.
Its own camera gave way to the shared live camera of every picture tab (`imageInput` — the back camera on phones, the
webcam on PCs, "Switch camera", closed on leave); "Share list" sits in the phone's fixed bar once there is a list. e2e
55: a PC's webcam showing the book page → Snap → the same 20 words as the photo file. **"Paste image"** beside the camera
button, on PCs and phones (to-do #37 — as the OCR tab: §3 OCR, "Paste image"). **The page's whole text on the clipboard as
soon as it is read**, with "Copy the text" beside it (to-do #38 — §3 OCR, "The text on the clipboard").
**The upgrade (owner, 21 Nov 2026 — "make a note of this and build it out when you come to it"; after the PDF → EPUB
fix) — BUILT 21 Nov 2026** (items 1 – 4: 31dbd3e; item 5: abe1d69, cd07746, 5617e29, d4f5b2d and the "snap again" hint
after them):
1. **Wikipedia under every word:** after the OCR and the word list, each word gets — besides its dictionary meaning — a
   **live look-up on the Wikipedia API**, shown in a little box under the meaning (a summary of the article). This adds
   `en.wikipedia.org` (Wikimedia REST, e.g. `/api/rest_v1/page/summary/<title>`, CORS without a key) to the approved
   data APIs: CSP `connect-src`, §3a's table, `no-external.e2e.mjs`'s allowlist; only the word (or phrase) is sent; the
   reply shown as plain text; mocked in the tests.
2. **As many words as are uncommon, not a fixed 20:** the list stops where the words turn common ("the" …) — fewer than
   20 when the page has fewer uncommon words, more than 20 when it has more.
   **Shown A → Z (to-do #12, owner, 21 Nov 2026 — done):** "don't change the list of words, just sort them in alphabetical
   order … so that I can quickly locate the word which is in my mind": the same cards — the words the ranking chose,
   their meanings and rarity labels — in alphabetical order without regard to case or accents (`alphabetical` in
   `src/lib/dictionary.ts`; the ranking still decides which words, and looks the rarest up first); the line above says
   "A → Z", Share list gives the same order; a phrase you select stays at the top. Unit `photodict-order` 6, e2e 115.
3. **The complete OCR text before the list, on phones and PCs,** where a phrase can be **selected** (touch selection on a
   phone, the mouse on a PC) and **searched on Wikipedia**: the phrase is added to the list — looked up on Wikipedia
   only (a phrase has no dictionary entry).
4. **Words broken over two lines are one word** (owner, 21 Nov 2026: "If words have a hyphen or a dash between them
   because they have to go to the next line … treat them as one word"): every line-end mark OCR gives — `-`, `‐`, `–`,
   `—`, `¬`, the soft hyphen — joins the two halves in the word list, in the shown text (a tap on either half looks up
   the whole word), in a selected phrase and in the Wikipedia look-up; a real compound that falls at a line end keeps
   its hyphen (well-known, self-evident). (The ranking already joins a line-end `-` when a half is no word or the joined
   word is at least as common — `rare.c`; the rest is new.)
5. **The phone's photo of a Kindle page reads as well as it can** (owner, 21 Nov 2026: "it has to work extremely well on
   my phone, especially when I take pictures of my Kindle" — the standing note at the top; his report: worse on the
   phone than with the webcam): Snap takes the camera's full-resolution still where the browser can (ImageCapture
   `takePhoto`, Android Chrome; continuous autofocus), else the frame; a set of Kindle-page photos (generated: e-ink
   grey, moiré, tilt, blur, noise; and the owner's own when he sends them — "Save this photo" under the thumbnail saves
   exactly what was read) with the words read right measured for each clean-up (moiré, contrast, straightening, scale),
   the best kept, and the suite holds that accuracy.
   **Progress (21 Nov 2026):** the measuring is built — `scripts/make-kindle-photos.py OUT --count N` (photos of a
   Kindle Paperwhite page in Literata / Noto Sans / Liberation Serif / Comfortaa and of newspapers, the camera's still or
   a video frame, tilt, focus, noise, glare, moiré, each with its words) and `node scripts/measure-ocr.mjs OUT --prep
   app,page` (the app's OCR and imgproc in Node: words read right, rare words found). **The page found and straightened
   first** (`src/lib/pagecrop.ts` on imgproc's `p_page_quad`: of every bright region the cleanest quadrilateral of a
   page's size that does not run off the photo, at five thresholds, and the light area inside a dark body — a Kindle on a
   light desk, glare on its body) raised the words read right from 28 % to the high 90s on most photos (Comfortaa 0 → 93 %,
   a video frame 0 → 97 %); the Photo Dictionary reads the straightened page and, when it gives fewer than 25 words, the
   whole photo too (the better kept). **Snap on a phone takes the camera's still** (`stillOf` in `src/lib/livecam.ts`:
   ImageCapture `takePhoto`, at most 4096 px wide, turned to the live picture's way round; continuous autofocus asked
   for; the frame where there is none — Safari — or it fails). The OCR tab straightens a photographed page too (#9).
   **What is left reads badly because the photo does** (out of focus, shaken, text a few pixels high in a video frame):
   no clean-up read those (sharpening, upscaling, Sauvola thresholding — docs/WASM-AUDIT.md, tab 122), and PaddleOCR, the
   second reader for soft photos since 26 Nov 2026 (§3 OCR, "The second reader"), reads only some of them; so a reading
   below 60 % confidence (`POOR` in `src/lib/ocr.ts`; sharp photos read at 94 – 95 %; PaddleOCR's below 85), or a page read
   as fewer than 25 words, gets a "snap again" hint above the list (the OCR tab: in its line).
**Owner, 21 Nov 2026: build this upgrade next — after the Indian-accent ranking in progress, before the rest of the
voice work, the rename and the regex flavours, and before anything from `docs/potentials.md`** (`todo.md` #6).
(`src/tools/photodict.ts`, engine `src/lib/dictionary.ts`, ranking `wasm/textcore/rare.c`; e2e `tests/e2e/photodict.e2e.mjs`
96 checks on photographed-page fixtures — a book page, Kindle stills and video frames; unit `tests/unit/rare.test.mjs` 65 checks.) **As built** (bug hunt of Nov 2026:
`docs/BUGHUNT.md`, tab 99)**:**
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
  words and tokens < 3 letters or mixed with digits dropped, names = always capitalised + capitalised mid-sentence
  (the full stop of a title — Mr., Dr., Prof., St. … — or of an initial — J. — ends no sentence, and a title with its
  full stop is no candidate). Letters U+00C0 – U+024F are lowered by a table generated from Python's `str.lower()`.
  Candidates with Zipf < 4.5, rarest first (unknown to wordfreq = rarest), then count, then first appearance.
- Lookup (TS): bundled entry → if it is only an inflection, its lemma's card with the note ("plural of goose"); an
  inflection of a common word ("rode" → ride) is skipped as common; capitalised names not in the bundle are skipped
  ("Names skipped" list); others go online (≤ 25 per photo, rarest first, 5 s timeout, session cache).
- UI: "Use camera" on phones / "Use webcam" on PCs (the shared live camera: back camera viewfinder + Snap, which waits
  for the first frame) or "Choose a photo of a page" (a photo chosen while another is being read is shown at once and
  read next; the older result is not shown); "Photo of a
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

### Camera Reader — BUILT (potentials #81; owner's pick of 27 Nov 2026 — group 4 of the suggested order)
(`camreader` in `src/tools/camreader.ts`, the page's pieces and how each is spoken `src/lib/readertext.ts` (no DOM), the player
`src/lib/sayer.ts`, the screen kept on `src/lib/wakelock.ts`; unit `tests/unit/camreader.test.mjs` 33, e2e `tests/e2e/camreader.e2e.mjs` 26 (+ the
camera sweep's entry); fixtures `tests/fixtures/snaps/leaflet.jpg`, `leaflet-b.jpg`, `menu.jpg`, `letter.jpg` with `truth.json`, by `python3
scripts/make-snap-photos.py`.) The owner's words (potentials #81): "point the phone at printed text — a letter, a medicine leaflet, a menu —
and it is read aloud (English); for parents, elders, small print".
- **Reading:** the OCR tab's own reading path and options (`readPage`: the page found and straightened, set upright and level, cleaned up,
  a page of columns read column by column, PaddleOCR for a soft photo — the café's menu, its dot leaders making Tesseract unsure, is read
  by it; a book's pages drawn flat), English; the page's lists set out as the OCR tab sets them (`listText`).
- **The pieces** (`pageParas`): paragraphs of pieces, a piece a sentence (`sentencesOf`: not after Mr., Dr., Tab., No., e.g., an initial,
  a list's number), or a line that stands alone — **a line stopped short of its column's width** (an address, a label in bold of the
  text's size — "Dosage"), **a line ending with a number** (a menu's price), unless the next line runs on in small letters; lines that
  reach the column's width run on, a word broken over two lines made whole. **Headings** by their size — each word's type size from its
  box and its letters (`emOf`: a word of small letters alone is about half the size, one with an ascender, a capital or a digit about
  three quarters, one with both all of it; slashes and commas counted) — a fifth larger than the text (a tenth for a short paragraph of
  its own without closing punctuation; a third for a line of one or two words), or a short line in capitals (KAVERI CAFE). List items
  (a mark or a label) each their own paragraph, their next lines joined. The pauses: 0.3 s between sentences, 0.5 s after a line that
  stands alone, 0.6 s after an item, 0.8 s after a paragraph (0.5 s for a short one), 0.9 s after a heading.
- **What is spoken** (`spokenText`; the voices' normalisers read the rest — numbers, decimals, ordinals, Mr.): amounts in rupees (₹, a ₹
  read as ¥, Rs., INR, Indian commas, paise, "/-"; a menu's "60.00" as 60); **medicine units** after a number (mg, mcg, g, kg, ml, l, IU,
  cm, mm, km, kcal, hrs, min, pcs, %, °C — also read as *C —, °F; one and many); **doses** 1-0-1 and ½-0-½ (morning, afternoon, night)
  as "1, 0, 1", "x 5 days" as "for 5 days", ranges (4–6 → 4 to 6), "1 x 10" as "1 by 10"; **dates** day first (27/11/2026, 5-6-26,
  01.12.2026 → 27 November 2026; an impossible date left); **times** as "10 AM", "2:30 PM" (eSpeak says "AM" right, "A M" not);
  **phone numbers, PIN codes and long numbers** digit by digit (not an amount or a year); the abbreviations of prescriptions, leaflets
  and letters (Tab., Cap., Inj., Syp., approx., e.g., i.e., No., Govt., Dept., Pvt., Ltd., Smt., Rd., Mob., Tel. …); a menu's dot
  leaders a pause; list marks, rules and signs a reader misread (Chinese and Japanese characters on an English page) left out.
- **The player** (`sayer`): the Text-to-Speech tab's voices — Kokoro (US, British) and Piper (Indian English) in the Text-to-Speech
  worker (a worker of its own here), **one request a piece and three asked for ahead**, the sound laid end to end on one AudioContext
  with each piece's pause after it; or a voice of this device (Web Speech, on-device English voices — they start at once), one
  utterance a piece. **The piece being heard is the one whose sound has begun by the AudioContext's clock**, so it is marked as it is
  heard and a pause (the clock stands still) keeps it. Pause and go on, Back and Next, a tap on any sentence reads from there; a new
  voice or speed goes on from the piece being heard; Stop. **Sound may start without a tap** only after one: any tap or key in the tab
  unlocks it (Safari starts an AudioContext and Web Speech only in a user's gesture) — a photo chosen with a tap is read aloud as soon
  as it is read; else "Tap “Read aloud” to hear it." The screen is kept on while it reads.
- **The tab:** a photo (the back camera on phones, the webcam on PCs; a file; Paste image) → the progress → the page shown large (24 px;
  18 – 40 px by "Smaller text" / "Larger text"), headings in bold, list items with their marks, the piece being heard marked (a background
  and an underline) and kept in view; the player — Back, Read aloud / Pause / Go on / Read again, Next, Stop — sticky above the text on
  PCs, in the bar at the foot of the screen on phones; voice (the Text-to-Speech voices and this device's), speed (Slower 0.8×, Normal,
  Faster 1.2×), "Read aloud as soon as the page is read" (on); Copy the text; **Open in Text-to-Speech (save as MP3)** (the text handed
  over, `give('tts', …)`). A soft photo is said ("PaddleOCR read it"); a poor reading gets the "a sharper photo …" hint; a photo without
  text: "No text was found on this photo …". The choices are kept while the page is open; nothing is stored. Nothing at open: the OCR
  with the first photo, the voice with the first sound.
- **Measured:** the four papers read in Node and in the browser — every piece as printed, in order: the leaflet's title a heading; the
  medicine leaflet's heading, labels, sentences and three list items, spoken with its units, dose and range in words; the menu a line
  an item, its prices in rupees; the letter's address a line at a time, its dates and times in words, the PIN code digit by digit; a
  two-column newsletter (a soft video frame) 85 %+ of its words in order; a photo of coffee nothing to read. In the browser every piece is
  marked in turn and **Whisper** (tests/lib/transcribe.py) hears the leaflet read by Kokoro (85 %+ of its words in order), the medicine
  leaflet read by the Indian English voice (two thirds and more), the letter's dates, times and name; Faster is shorter; a pause keeps
  everything still.

### FFmpeg (PC) — BUILT (`src/tools/ffmpeg.ts`; e2e `tests/e2e/ffmpeg.e2e.mjs` 75, `ffmpeg-sound` 15, `ffmpeg-fixes` 51, `ffmpeg-effects` 55)
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
log opens. Stop = terminate the worker ("Stopped.", no error); a new file chosen during a job ends it (its probe reset the job's log and the outputs took the new name), probes of a second file or of clips wait for a running job, outputs are named after the file the job ran on (Nov 2026 hunt, tab 152; libav.js checked as a replacement: docs/WASM-AUDIT.md 149). **Known limits of this core:** libvpx-vp9 and libx265 wait forever for
threads (so presets use VP8/x264 and the raw box warns); FFmpeg 5.1 ignores input `-to` and `-shortest` with a looped
picture (handled with `-t`); **its Opus encoder crashes on two channels and more** at complexity 5 and above (made at 4 —
"Sound at its own level" below). Replacing it with our own build of current FFmpeg stays on the §3a audit list — and is
`docs/potentials.md` U3 (owner, 26 Nov 2026: with the stabiliser, Rubber Band and VP9 / H.265 it would bring). The 22 new
jobs the core can do as it is: to-do #32, built (27 Nov 2026 — "22 new jobs" below).
Tests: clip.mp4/tone.wav/tone.mp3 → WebM plays, AAC copy, MP3 440 Hz, no-sound copy, fast trim ≈ 1 s and exact 1.00 s,
426×240, rotate 360×640, square crop, GIF89a 320 px, 2× = 1.5 s, 3 frames zipped, merge 660 Hz, raw hflip, bad filter
reported, loudness changed, waveform 1280×720, picture + sound 2 s.
**21 new jobs (owner, 20 Nov 2026 — todo.md item 2; the list = the owner's six + popular FFmpeg uses found on the
web, sources in docs/BUGHUNT.md).** The jobs are `src/lib/ffjobs.ts` (pure: `buildJob(job, options, ctx)` → arguments,
output names, text files to write, fonts, `jpeg`; every refusal a sentence — no picture, no sound, a time after the
end, a reverse too long for memory (`maxReverseSeconds`: 700 MB of frames), fades longer than the clip, a timelapse
under half a second …; `parseProbe` reads `ffmpeg -i`). The task list is a native `<select>` in eight groups:
**Convert and extract** (convert, extract audio, remove audio, picture at a moment, extract frames, contact sheet —
`fps=n/length,scale=320:-2,tile`, GIF, audio → MP4), **Cut and join** (trim, cut a part out — trim / atrim + concat,
join clips — every clip fitted to the first one's size with black bars at 30 fps, silence for a clip without sound,
or "Fast" with the concat demuxer when the clips match; a clip list with move / remove, split into equal parts — the
segment muxer, no re-encoding, so parts start at key frames; loop n times — `-stream_loop`, boomerang, reverse),
**Size and shape** (compress, resize, crop, fit to 9:16 / 16:9 / 1:1 / 4:5 at 720 px with a blurred copy or bars,
rotate / flip, frame rate), **Picture** (colours — `eq` brightness / contrast / saturation, black and white;
stabilise — `deshake` (the core has no vid.stab); clean up grain — `hqdn3d` light / medium / strong; deinterlace —
`bwdif`; fade in / out — `fade` + `afade` from the probed length; text — an ASS script drawn by libass in Noto Sans
(our vendored TTFs written to /fonts), position / size / colour / box; logo — `overlay` of a picture scaled to 10 – 30 %
of the width, a corner, an opacity; picture-in-picture — a second video in a corner, `eof_action=pass`), **Speed**
(speed up / slow down, timelapse 8× – 60× without sound), **Sound** (volume 25 – 300 %, loudness, remove silence — the
ends, or every pause longer than 0.5 / 1 / 2 s (FFmpeg 5.1's `silenceremove`; 6.1 reads `stop_duration` differently),
add audio — replace, or music under the sound with `amix normalize=0` and the music looped; sound settings — mono /
stereo, 44.1 / 48 kHz), **Subtitles** (burn in a .srt / .vtt / .ass file or the video's own track — libass with Noto
Sans; add a file as a track — mov_text in MP4, SRT / ASS in MKV, a language; extract the first track as SRT / WebVTT /
ASS; picture subtitles (DVD / Blu-ray) are refused with the reason), **Expert** (own arguments).
- **This core's JPEG encoder crashes the page.** ffmpeg.wasm's mjpeg overflows a buffer when it spends many bits on a
  block (`-q:v 3` on a 640 × 360 frame, `-q:v 4` on a detailed one): the page dies, or memory is damaged for the jobs
  after it (that was the "function signature mismatch" of the subtitle renderer seen in the e2e suite). So FFmpeg
  writes PNG and **MozJPEG** (jSquash, the app's encoder) makes every JPEG (thumbnail, contact sheet, frames) at quality
  90; "Your own arguments" refuses JPEG output from FFmpeg with the reason. (The tab's old "Extract frames → JPEG" used
  `-q:v 2` and crashed the page on ordinary videos.)
- A failed job gets a new core (cheap insurance); every other job runs on the same one. A new core for every job was
  tried and dropped: slow, and it crashed the page run after run.
- **The test browser's own crash (Nov 2026):** Playwright's headless shell (Chrome for Testing 153) segfaults its
  renderer when, after about 60 jobs on one FFmpeg, Stop ends a command and Run starts a new FFmpeg; the full Chromium
  build does not (`E2E_CHANNEL=chromium E2E_FF_SAME_PAGE=1 node tests/e2e.mjs ffmpeg`: 72 / 72). The suite therefore runs
  its Stop checks on a fresh page; look again with a newer Playwright (docs/BUGHUNT.md, "FFmpeg after a long session").
- Tests: unit `tests/unit/ffjobs.test.mjs` (202) — every job's command run by a **native FFmpeg 6.1** (`apt install
  ffmpeg`) on the fixtures and read back with ffprobe, decoded pixels and sound levels; every refusal; the probe reader
  against ffprobe. e2e `tests/e2e/ffmpeg.e2e.mjs` runs every new job on ffmpeg.wasm in the browser. Fixtures
  `tests/fixtures/media/` subs.srt, clip-subs.mkv, silent-320.mp4, pauses.wav, kf6.mp4.
**Sound at its own level (to-do #23; owner, 26 Nov 2026: "the audio volume of the output resultant videos and audio files
seems to be lower than when I hear it from the original. Please confirm … If this is indeed the case, then please fix.")**
— confirmed, and fixed in `src/lib/ffjobs.ts` ("sound kept at its level"). Every job was measured against its original —
EBU R128 integrated loudness, a mono file as heard on two speakers (`ebur128=dualmono=true`) — on mono, stereo, 5.1 and
an AC-3's 5.1(side), by the native FFmpeg 6.1 and by the tab's FFmpeg 5.1 in the browser:
- **A mono sound made stereo was 3 dB lower:** FFmpeg's own upmix puts mono on each side at 0.71 — "Sound settings →
  Stereo" (`-ac 2`), **Join clips** (every clip was made stereo), the music under a mono voice (amix's layout). Now on
  both sides at full level (`pan=stereo|c0=c0|c1=c0`, `upmix`), as players play mono; a join of mono clips stays mono, of
  5.1 clips 5.1 (a mix of kinds: stereo).
- **"Mono"** is the average of the two sides (`toMono`, as Audacity mixes them): the same sound on both sides keeps its
  level, a two-microphone recording comes out about 1.4 dB quieter (the sides partly cancel), sides that differ
  completely 3 dB — said in the tab. (FFmpeg's `-ac 1` adds them at 0.71: 3 dB louder for the same sound on both sides,
  and clipping.) "Mono" of a mono sound and "Stereo" of a stereo one are refused with that reason.
- **5.1:** AAC and Opus got the stereo bitrate for six channels (Opus lost 2 dB — its upper bands); now as much a channel
  as stereo gets (`kbpsFor`: AAC 160 → 480 kb/s, Opus 128 → 384). An AC-3 / DTS "5.1(side)" was refused by libopus
  ("Invalid channel layout 5.1(side) for specified mapping family -1") and written by the AAC encoder with a PCE, which
  ffprobe and players read as "unknown": now asked for as 5.1 (`-ch_layout 5.1`; the side channels go to the back at
  gain 1). 5.1 mixed into two (MP3, "Stereo") measures 0.6 – 0.8 dB lower: R128 counts the surround channels 1.5 dB
  more in 5.1 than in a stereo mix — players mix it down the same way.
- **This core's Opus encoder crashed on every stereo sound** — "RuntimeError: memory access out of bounds" at the first
  frame (libopus 1.3.1 in ffmpeg.wasm 0.12): 20, 40 and 60 ms frames at complexity 5 and above, which turn on its pitch
  pre-filter and its late transient check (10 ms frames and complexity 4 and below run; mono runs). Convert → WebM / OGG
  and Volume / Sound settings of a WebM failed on any stereo or 5.1 file — unseen, as every media fixture was mono. Now
  two channels and more are made at `-compression_level:a 4` (`OPUS_SAFE`; a noise-to-mask measure put it level with
  the default at these bitrates, docs/BUGHUNT.md), and "Your own arguments" that make Opus and set no complexity get it
  too (the warning says so).
- **Exact trim of a WebM** put H.264 into the WebM, which the muxer refused: now an MP4; the sound of an exact trim with
  its encoder named (it was the container's default: AAC at 128 kb/s for any number of channels, or libopus).
- **Kept, and said:** "Normalise loudness" brings the file to −16 LUFS on purpose — louder or quieter (the tab says so);
  a speed change of noise-like sound (rain, applause) loses up to 1.3 dB — atempo's WSOLA crossfades its pieces, which
  adds unrelated sound in power — while speech and music keep their level (within 0.4 dB).
**"Extract audio" in plain sight (to-do #22; owner, 26 Nov 2026: "the extracted audio is by default in the .m4a format. Add
an MP3 audio formats also for the download.")** — MP3 was there, in a list whose first entry ("Keep the original codec")
was already chosen, and was not found. Now buttons: **As it is (.m4a)** — the file's own kind named after the probe
(`keptAudioExt`) — · **MP3** · **WAV** · **FLAC** · **OGG (Opus)**; MP3 shows its quality — **VBR V2** (LAME's recommended
setting, ≈ 190 kb/s; the default), **128**, **192** or **320 kb/s** (`mp3Args`). An extracted sound that is not MP3 gets
**"Download as MP3"** beside its Download: the file just extracted is made MP3 by the same FFmpeg at the quality chosen
under MP3 (`mp3Of`; no second run of the job; Stop works; a second click downloads the same MP3). The format and the
quality are kept while the page is open — through other files and other tabs (module memory; nothing stored). Unit
`ffjobs`: the arguments; MP3 at V2 / 128 / 320 natively — LAME's frames, the bitrate, 3.00 s, the original's loudness;
"Download as MP3" of an .m4a. e2e: the five buttons, "Download as MP3" on the .m4a (valid frames, VBR, 440 Hz, the length),
320 kb/s in every frame, the choice kept through another file and through leaving the tab, the MP3 of a stereo .m4a at the
original's loudness.
Tests: unit `ffjobs` 202 (the arguments; 14 jobs × mono, stereo and 5.1 files run natively within 0.5 dB of the
original — a trimmed or cut file against the same part —, 5.1 mixed down within −1 – 0 dB, mono → stereo, joins, the
music under a mono voice against a reference mix); e2e `ffmpeg` (stereo → WebM / OGG and own arguments with Opus run;
5.1(side) → WebM / MP4 as 5.1; mono → stereo and joins at the original's loudness — read by the native FFmpeg where it is
installed). Fixtures `stereo.mp4` (the voice as two microphones hear it) and `surround.mkv` (AC-3 5.1(side)): `node
scripts/make-sound-fixtures.mjs`.
**22 new jobs (to-do #32; owner, 26 Nov 2026: "include all the new cool FFmpeg features that you just mentioned above,
leaving out the 3 that would require you to build the new FFmpeg module"; started 27 Nov 2026: "yes go ahead with #32").**
All on the tab's FFmpeg 5.1 as it is — every filter was looked for in the core and run in it first (a Node runner of the
core, scratch work) —, nothing added to the site: 61 jobs in ten groups (`JOB_GROUPS`; "Effects" and "Information and
privacy" are new). What the tab gained for them (`Built` in `src/lib/ffjobs.ts`): **a measuring pass first** (`then`: the
first command's log decides the second — the black bars, the side of a voice, the hum's frequency, the loudness for a bleep
or an effect; the command box shows both, "Edit as arguments" says why it cannot take two); **a report** instead of a file
(`report`: Analyse — Copy, Download `<name>-analysis.txt`); **outputs named from the log** (`names`: the scenes by their
times); **made again while too big** (`next`: the sticker); **notes** under the result (what was found and done). A refusal
after a measuring pass keeps its FFmpeg (only a failed command starts a new one); **after 12 commands the next job starts a
new FFmpeg** (`RECYCLE` in `src/tools/ffmpeg.ts`: after about twenty of these jobs on one core a command failed with "memory
access out of bounds" — each half of the sequence alone ran clean and the heap stayed at 67 – 80 MB: state left by earlier
commands, not a leak; a new core loads from the browser's cache in a second or two).
- **Fixes:** **MKV → MP4 at once** (`remuxPlan`: before the run every stream is listed with what happens to it — a picture
  an MP4 holds copied (H.265 tagged hvc1, for Apple), a sound an MP4 holds copied, any other made AAC at its level, SRT /
  ASS / WebVTT made MP4 text, picture subtitles, attachments and data tracks left out, chapters kept; an MP4, or a picture an
  MP4 cannot hold as it is (VP8 …), refused with what to do); **sound out of step** (earlier or later by ms or s, to the
  sample; the picture copied, the length kept); **a voice on one side** (found by each side's RMS, 6 dB apart at least, or
  chosen; swap); **mains hum** (its frequency found first — the mains drifts, and a notch 0.1 Hz off took out only a third
  of the hum: the band around 50 / 60 Hz, a 3.3 Hz notch at each of nine candidates 0.05 Hz apart, the quietest once the notch has
  settled; no clear valley → the nominal frequency, said; then ten notches 3 + 0.3·k Hz wide: the hum −35 dB and more, the
  speech within half a decibel, a mains at 50.1 Hz found); **a lecture evened out** (dynaudnorm — FFmpeg 5.1's speechnorm left the
  speakers 20 dB apart; under 6 now); **HDR → SDR** (HLG and PQ; BT.2408 — HDR's reference white, 203 cd/m², becomes SDR
  white, a mobius knee up to 1000 cd/m²; BT.709 colours and tags; Dolby Vision 5 refused; measured on HLG and PQ clips made
  by BT.2100's formulas against the SDR picture they were made from: within 12 of 255, skin within 15 — zimg applies HLG's
  system gamma to each colour, so saturated colours come out a little richer); **black bars** (cropdetect over the whole
  video — its key frames above a minute —, then crop; a video without bars said); **a logo removed** (delogo; the box on a
  picture of the video at a time chosen, dragged or typed in pixels, kept a pixel inside the frame — delogo refuses a box on
  its edge); **location and metadata removed** (what the file says listed first — the place in degrees, dates, device,
  names, chapters, data tracks; copied without it all, bitexact; the copy read again and what is left said).
- **Effects:** **transitions** (16 of xfade's; every clip fitted to the first one's size at 30 fps and held to its exact
  length, the sound crossfaded at equal power — no dip; sound files too); **green screen** (chromakey + despill over a photo
  or a video cut to the shape; a shorter background repeats); **split screen, one above the other, a 2 × 2 grid** (tiles of
  the first one's shape, the sound of one or all mixed at their levels); **light trails** (lagfun in RGB) and **motion blur**
  (tmix); **a music visualiser** (showcqt's bars, a scrolling spectrum, a stereo scope; over a picture with their black
  keyed out; 1280 × 720, x264 ultrafast — the drawing takes a tenth of the time); **the sound as a picture** (showwavespic,
  a strip a channel; a spectrogram of 512 rows by the scrolling showspectrum — the whole sound across one frame of 1600
  columns, a longer sound by 1600 blocks of 1024 samples spread over it —, its frequency legend; the note gives the span); **smooth slow motion** (minterpolate; the work it takes here said
  before the run, refused above 20 minutes of it); **360° → a normal view** (direction, field of view) **or a tiny planet**,
  **a wide lens straightened** (lenscorrection); **sound effects** (8D, slowed + reverb, bass boost, telephone, old radio,
  echo — the effect measured with the file in one pass and brought back to the file's loudness, within 0.8 dB); **bleep**
  (a 1 kHz beep as loud as the file, or silence, over stretches typed as times); **an animated WhatsApp sticker** (a WebP of
  512 × 512, at most 10 s and 500 KB: 15 pictures a second at quality 75, then four smaller tries, else the reason);
  **the scene finder** (the first picture and every change of scene, named by their times, JPEG by MozJPEG, zipped); **a
  file analysed** (EBU R128 loudness, loudness range and true peak; black, frozen and silent stretches — a report).
- **Found in FFmpeg 5.1** (docs/BUGHUNT.md, "FFmpeg: 22 new jobs"): **showspectrumpic draws wrong pictures** — it never
  sets its hop (6.1 does: `hop_size = spf`), so each analysis window held one column's samples and zeros: dim, the
  frequencies off, black at 1024 rows (only a rectangular window came out right); its spectrum transform is fast only at a
  power-of-two height (800 rows: 100 s for 2 s of sound, 512 rows: 0.2 s); speechnorm evens out nothing; ebur128 prints a
  summary of −70 LUFS before the real one (the last of each instance is read); delogo needs its box a pixel inside the
  frame.
- **Tests:** unit `ffjobs2` 136 (the parsers of the measuring passes, the probe's new details against ffprobe, every refusal,
  every job run by the native FFmpeg and measured — pixels, samples, levels, loudness, packets), `ffjobs` 202; e2e
  `ffmpeg-fixes` 51 and `ffmpeg-effects` 55 — the same jobs in the browser, on mono, stereo and 5.1 files, read
  back by the native FFmpeg (`tests/lib/ffread.mjs`, shared with the unit suite). Fixtures: `node
  scripts/make-ffmpeg-fixtures.mjs` (17 files; the HDR clips by BT.2100's formulas, not by zscale). All four FFmpeg suites
  also in Chrome on Windows (the Windows check, run 18: 196 / 196, read back by the native FFmpeg 9.1 there).

### PDF → EPUB (PC) — BUILT (`src/tools/epub/epub.ts`, engine `src/lib/pdf2epub.ts`; unit `tests/unit/pdf2epub.test.mjs` 94 + `xycut.test.mjs` 33, e2e `tests/e2e/epub.e2e.mjs` 52)
**Owner's rule for the reading order (21 Nov 2026; standing):** "in the original PDF, whenever there are multiple columns
or things which are not exactly top to bottom, then you should make it top to bottom in the EPUB and space it out
correctly, and add your own little text and markers saying … this section of the original page is now the next section
in the vertical form … Don't write the word from the original PDF, but just say page 1, part 1, page 1, part 2, page 1,
part 3, that kind of thing." → everything that stands side by side in a PDF page (columns, blocks left and right) is
laid out one after another, top to bottom, spaced apart, each piece introduced by a marker of our own — "Page 1, part
1", "Page 1, part 2" … (the labels "Page N · Column K" became these) — never words taken from the PDF.
**Purpose (owner, 21 Nov 2026):** "this new PDF to EPUB functionality … is so that technical and scientific PDFs, or any
PDFs that have things in multiple columns or sections in one page, can nicely flow onto an EPUB in a normal vertical
fashion with word reflow … vanilla PDFs with text only will also … get rendered into EPUBs that way." → text is always
real, reflowable text (the reader's font and size); what cannot reflow without losing its layout — figures, tables,
display equations — is a picture sized to its column; a page with nothing side by side has no part markers.
**Owner's strict rule for pictures (21 Nov 2026; standing):** "maintain original images as images in the new EPUB. Don't
do OCR of any sort. If in the original PDF it's an image, preserve it as an image in the new EPUB", and then: "Don't drop
any images from the original page at all. That's a strict rule. If it's a full page image in the original PDF, then
include it as a full, the same image in the new EPUB … preserve all original images exactly."
**As built after the owner's test PDFs (21 Nov 2026; docs/BUGHUNT.md "PDF → EPUB, the owner's test PDFs").** The owner's
five pairs (AJUR_January_2016p5 — a journal page; 2611.25554v1 — an arXiv paper from Word; another_one — REVTeX two
columns; test_1 — a LaTeX paper; test_2 — 115 pages of REVTeX lecture notes) were converted and read page by page:
- **Parts:** textcore's `t_xycut(boxes, heavy, n, gx, gy, minh, hd, …)` returns a part per position: at the first vertical
  split outside any part with two sides that count — a real column, or a side holding a heavy box (a figure or a table
  of ≥ 1.5 % of the page) — every counting side is a part of its own; a side that does not count (a margin note) joins
  the part after it. Each segment of a page with parts gets `<h4 class="part">Page N, part K</h4>` (the toggle "Mark the
  parts of a page laid out side by side"); the summary says "n laid out in parts · figures · tables · equations".
  `hd` (0.8 × body): boxes at the top of one column that end above where every other column begins, with a gap under
  them across the region (an epigraph), are read before the columns.
- **Contents pages:** page numbers flush right (three or more sharing their right edge) join the entry on their row
  ("I. Equilibrium … 3", `keep`: a line each) — unless another cell stands before the entry (a table of three columns).
- **Tables:** ruled — grids, stacked rules of one extent, growing over table rows above and below (a table cut by the
  page), a ruled region with drawn ink inside it is a figure (a plot's frame); without rules — rows of short cells
  aligned in three places, built from lines that are not running text (in two columns a line of the other column beside
  a formula's pieces made a "table" across the page) and not contents entries; rows mostly maths are a formula; a
  paragraph's line inside ends the table. A table is a picture, `<div class="fig tbl">`, sized in em.
- **Display equations** (lines mostly in a maths font, or of pictures): grouped by distance in ems of the body text (on
  one row up to 1.5 em, up to 4 em where running text spans the gap — never across a gutter; close above / below;
  stacked); groups closer than 0.9 em that overlap merge; a paragraph's line that is mostly maths stays text (also a list
  item's next line, under its text); what stands inside, small pieces beside, short lines stacked right beside it (a
  fraction in the text font), the limits of a sum in small type under it; groups that grew into each other are one
  picture; the picture takes in ink that runs out of MuPDF's boxes (a big Σ); its number = the nearest label to the right
  on its rows with nothing between (`<p class="eqno">`). A formula inside a line is a small picture in the line (em-sized,
  on the baseline); raised / lowered marks are `<sup>` / `<sub>` (by baseline, or by box when MuPDF's origin hides the
  rise).
- **TeX's habits mended:** an accent set before its letter (in a span, or a run of another style: "Gröbner", "q̇", "n̂",
  "Šmejkal"); a line that is only an accent goes into the box of the line under it; ≠ drawn as "=" with a slash; chess
  and dingbat fonts (SkakNew-Figurine gave "KQRNBp") are pictures.
- **Pictures — the strict rule:** our MuPDF device reads every picture the page draws (images and image masks), with its
  clip, soft masks and blended groups, whether anything visible is drawn over it afterwards, and the image object it
  comes from. **No picture is dropped** (any size; a logo repeated in every footer; one that fills the page). A picture
  with nothing over it is **its own bytes**: a JPEG of the PDF copied byte for byte, any other image its own pixels as
  PNG (`picBytes`); with labels over it or drawn together with other pictures, its region is drawn as the page shows it
  at the picture's own resolution (never below the screen's), in colour, PNG when none of it is a JPEG. The greyscale
  option touches only our own drawings (formulas, tables, vector figures). A figure is as wide on the screen as in its
  column. A page that is one picture: that picture exactly, the page's visible text after it as text. **A scanned page
  under invisible OCR text** (render mode 3, counted by the device) keeps its picture and **the OCR text is not used**. A
  picture under a page of running text (a slide's background) stands first, exactly, and the text is read as text.
- Footnote separators: one `<hr class="fn"/>` (a rule inside a line of rule glyphs is the same rule).
As built after the Nov 2026 bug hunt (docs/BUGHUNT.md tab 139, docs/WASM-AUDIT.md 136):
- **Text:** MuPDF's structured text with `preserve-spans` — each span in one font — joined into lines (same baseline,
  close after one another; a space where the PDF leaves a gap without one); a line takes the size and the weight most
  of its characters have (MuPDF gives a line the font of its first character: "**Theorem 1.** Let …" is no bold line).
  Lines that run up or down the page (arXiv's stamp, the Federal Register's) are kept apart: left out with the running
  headers, else a note at the end of the page; a page whose text mostly runs sideways is a picture. Lines off the page
  are dropped. Characters XML does not allow (MuPDF passes U+FFFF of a broken Unicode map through) and C1 controls are
  left out (`xmlText`).
- **Running headers / footers:** top / bottom 10 % lines whose first 12 letters repeat on ≥ 40 % of the chosen pages
  (OCR slips like "VICKSBUEG" still match) and page numbers on their own (`pageNumberLike`: digits, "Page n", "n of m",
  "– n –", a real Roman numeral — not "ill" or "civil"). Their ink stays text for the figure finder (it came back as
  a picture).
- **Figures:** every picture of the PDF (see the strict rule above) ∪ ink outside every text line and outside the
  pictures on a 1.5 px/pt drawing (imgproc `p_ink_regions`), merged until no two touch; lines inside a figure and short
  labels touching it (or beside a ruled diagram) belong to it.
- **Order and columns:** textcore's XY-cut (`t_xycut(boxes, gx, gy, minh)`: vertical gutters first, then the widest
  horizontal gap, recursively): gutters of 0.45 × the body text (the Federal Register's are 7.5 pt), and only real
  columns are numbered — at least three lines and a tenth of the page high (a note in the margin, table cells are not).
  The body size is the size most characters have; more than three "heading" lines in a row are text.
- **Paragraphs and headings:** the page's line pitch, indents, short last lines, a size change after a sentence end;
  headings by size (≥ 1.18 × body) or short bold lines; de-hyphenation (keeps "e-reader"). Unreadable lines (more than
  a tenth U+FFFD, private-use or control characters — a maths font without a Unicode map) are a picture in their
  place; a column is one picture when most of it is unreadable or with "Columns as pictures".
- **Pictures:** MuPDF draws just the figure (a display list into a pixmap of its box) so that a column is as wide as the
  screen (Paperwhite 1236 px / Scribe 1860 px), a figure across the page as wide as the screen, within 32 megapixels
  and 16,384 px a side; greyscale MozJPEG by default; a page without text is a picture as wide as the screen.
- **The book:** one XHTML per PDF page (`page-break-before`, "Page N, part K" markers), EPUB 3 with the PDF's
  bookmarks as the contents (nested; a bookmark of a page left out → the next page that is in; else one entry per page
  with its first heading), a page list, an NCX for older readers (bookmarks of one file share its play order), the
  PDF's /Lang as the language (else English), `dcterms:modified`, urn:uuid; mimetype stored first; fflate.
- **The tab:** a conversion keeps the PDF it started with; a newer PDF or leaving the tab ends it (`Stopped`); progress
  for both passes ("Reading the text: page n of N…", "Page n of N…") and a pause every 30 ms (300 pages: the longest
  gap between frames 0.25 s — it was 3.6 s); the preview (first three pages in reading order) lets its pictures go
  with the next PDF, run or the tab; a PDF without pages is refused; the summary counts in words.
- **Tests:** unit — the engine in Node on its own engines (`EpubEngines`): the Federal Register's first three pages
  (public domain, `tests/fixtures/pdf/federal-register-3p.pdf`) held to poppler's `pdftotext` (`python3
  scripts/make-epub-reference.py` → `tests/fixtures/epub/reference.json`, needs poppler-utils); the OCR'd Vicksburg pages
  kept as their pictures (no OCR text); pictures byte for byte / pixel for pixel; generated PDFs for each rule above;
  the generated two-column paper to the order its generator wrote (poppler reads it wrong); generated PDFs for bold
  run-in headings, broken Unicode maps, unreadable formulas, bookmarks, /Lang, stamps, sideways, offset and huge pages.
  e2e — the tab in Chromium, every XHTML parsed as XML, the EPUB re-opened by MuPDF, races and responsiveness.
  **epubcheck** (the W3C's validator, Java 21): both suites run it on every EPUB where installed — `EPUBCHECK=/path/
  epubcheck.jar`, or a release unpacked under `/opt/epubcheck*` (github.com/w3c/epubcheck/releases; 5.2.1 used); errors
  and warnings fail.
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

### PDF for Kindle — BUILT (potentials #109; owner, 21 Nov 2026; built 27 Nov 2026 — group 1 of the suggested order)
(`kindlepdf` in `src/tools/kindlepdf.ts`, engine `src/lib/kindlepdf.ts`, the cuts `wasm/imgproc/kindle.c`; unit
`tests/unit/kindlepdf.test.mjs` 68, e2e `tests/e2e/kindlepdf.e2e.mjs` 36; fixtures `tests/fixtures/kindle/` with the place of every
line, figure, formula and table, made by `node scripts/make-kindle-pdfs.mjs`.) The owner's words (potentials #109, "keep separate
from the PDF → EPUB app"): "technical and scientific PDFs kept exactly as typeset — formulas, figures and tables as the authors
laid them out, nothing reflowed — but readable on a Kindle's 6 – 7″ screen: the white margins trimmed, a page of two columns cut
into its columns in reading order, each column cut into screen-high pieces at the gaps between lines (never through a line of
text, a formula or a figure) → a new PDF whose pages have the Kindle screen's shape …, a small 'p. 3 · 2 of 4' on each piece.
The pieces stay vector … pictures only for scanned pages (greyscale, contrast raised for e-ink)."
- **A page's regions** (`regionsOf`): its lines (PDF → EPUB's reader, `readPage`), its pictures and what is drawn outside the
  text (imgproc's ink regions — plots, formulas drawn as lines, tables' rules), the running heads and page numbers left out
  when chosen (PDF → EPUB's `headerKeys`; the stamp up a margin with them); textcore's XY-cut on them, and each run of items in
  reading order with one part — the full-width flow, or one side of what stands side by side — is a region: the title and the
  abstract, the left column, the right column, a figure across the page. Thin rules (round a note, under a masthead, between
  columns) are drawn but take no part in finding the regions: one across two columns' tops joined them (the Federal Register).
- **The cuts** (`wasm/imgproc/kindle.c`, at 2 px/pt): a region's rows where a piece may end are those with no pixel darker than
  160 (a tint and the anti-aliased fringe of letters are paper: lines set 10 on 10 pt leave a point between them) outside every
  protected interval — a line's letters from above its x-height to its baseline, a picture, a vector figure, a display formula
  (lines in a maths font with what is drawn round them: a fraction's bar), a figure with its caption ("Figure 3", "Table 2", or
  a line set right under it within its width: "(b) Brown bear"), a table with the caption above it. A piece ends at the lowest
  gap of half a line's height or more (a paragraph's end, a heading) past 65 % of the room left on the screen, else at the
  lowest gap: the screen filled. A region that holds no gap within a whole screen is tried again without its figures' and
  formulas' protection (a table taller than a screen is cut between its rows), else drawn smaller, whole.
- **The screens** (`layOut`): pages of the screen's shape (the Kindle's pixels: Paperwhite 7″ / Colorsoft / Oasis 1264 × 1680,
  Paperwhite 6.8″ 1236 × 1648, Kindle 6″ 1072 × 1448, Scribe 1860 × 2480, or another size, 300 – 4,000 px), as wide as the page's
  text columns — regions side by side holding a fifth of its text or more (side-by-side figures are no text columns: the
  full-width text under them keeps its size) — so a column fills the screen's width; a wider region (a title, an abstract
  across two columns) drawn smaller to fit. The pieces of a page follow one another, a thin rule where the text jumps to the
  next column; each PDF page starts a new screen; "p. 3 · 2 of 4" in grey at the foot (page 3, its second screen of four).
  The PDF's bookmarks point at the first screen of their page.
- **Vector pieces** (`pieceForm`): a piece is the page itself — grafted into the new PDF (one graft map: fonts and pictures
  once for all the pieces), every character outside the piece taken out by MuPDF's redaction, its content made a Form XObject,
  drawn clipped to the piece. The Kindle can look words up and search; each word is in the PDF once. **The redaction areas**
  (`redactionAreas`): MuPDF removes a character whose box — its advance by the font's ascent and descent, taller than the ink —
  touches an area, and the boxes of two lines overlap the gap between them (the first version lost the first line of every
  piece); so four big rectangles stand off the piece by the page's largest character box, and the outside characters nearer
  than that are caught by thin bands through their centres, one band a run along a line — no box inside reaches another
  line's centre. Drawings entirely under the big rectangles are removed too (the file stays small); pictures stay and are
  clipped. Comments and filled form fields are baked into the pages first.
- **Other pages:** a scanned page (a picture over half the page with no visible text, or with its text hidden — an OCR layer)
  is cut the same way on its ink (the paper whitened by imgproc's clean-up, greyscale) and its pieces are greyscale JPEGs at
  the screen's resolution; its running head and page number left out where its OCR layer finds them; the OCR text itself is not
  used. A page whose text runs sideways (a table turned) is kept whole on one screen, said ("turn the Kindle to read it").
  An empty page is left out.
- **Measured** on the repository's PDFs: every line of text on the screens exactly once, nothing else, but the running heads,
  page numbers and the Federal Register's margin stamp (the two-column paper, the Federal Register's three columns,
  side-by-side figures, the fixtures); every vector piece drawn by MuPDF exactly as the page draws it (mean difference 0.00 of
  255 at 3 px/pt; at 2 px/pt MuPDF snaps small glyphs drawn through a form otherwise, at 4 it samples photos otherwise —
  edges, not letters); the Federal Register's 3 pages make 29 screens of large type (its columns 172 pt wide fill the screen).
- **The tab:** a PDF (a password asked for), the Kindle, "Leave out running heads and page numbers", "Number the screens",
  pages; "Make PDF for Kindle" with the progress page by page; the result (`<name>-kindle.pdf`, its size, screens, columns,
  scanned pages, pieces drawn smaller), Download (Share on phones), how to send it (Send to Kindle *as a PDF* — "Convert" off,
  no "convert" in an e-mail's subject: converting reflows it), a preview a screen at a time (Previous / Next), the page report.
  The choices are kept while the page is open. A newer PDF or leaving the tab ends a conversion.

### EPUB Reader — BUILT (potentials #71; owner, 20 Nov 2026; built 27 Nov 2026 — group 1 of the suggested order)
(`ebook` in `src/tools/ebook.ts`, engine `src/lib/ebook.ts` (no DOM), worker `src/workers/ebook.worker.ts` + `src/lib/ebook-client.ts`;
unit `tests/unit/ebook.test.mjs` 148, e2e `tests/e2e/ebook.e2e.mjs` 59; fixtures `tests/fixtures/ebooks/` with every word of each
book, made by `python3 scripts/make-ebooks.py`.) The owner's words (potentials #71): "read .epub books (and FB2, CBZ comics — MuPDF
reads those too; MOBI to be checked) — contents, page turning (tap, swipe, keys), font size and margins, light / dark / sepia,
search in the book, go to a page or chapter; the book never leaves the device".
- **What opens** (`openFile`: what a file is, from its bytes, not its name): **EPUB** 2 and 3 (nav or NCX), **MOBI** (Mobipocket,
  PalmDOC-compressed — what Calibre writes; its title and author from its EXTH header, which MuPDF does not read; a KF8-only
  AZW3 gets a note: its text is read, its pictures and styles may be missing — no such file to test with), **FictionBook** (also
  zipped), comics — **CBZ**, **CBT**, and **CBR** / **CB7** handed to **7-Zip** (on the site) and opened as the zip it makes (a
  comic's title and writer from ComicInfo.xml) —, **plain text** made a web page (`textToHtml`: lines broken by hand joined so
  the text reflows, short lines kept, chapter lines and short lines in capitals made headings — the contents), **web pages**.
  **Refused in words:** a book with DRM (Adobe ADEPT, Readium LCP, Apple FairPlay, Mobipocket encryption — MuPDF reads past a
  MOBI's encryption field and would show garbage; font obfuscation alone is no DRM), Amazon's KFX, MOBI's HUFF/CDIC compression,
  a PDF (the browser shows PDFs; PDF for Kindle cuts them for a Kindle), a Word document, a zip without a book or pictures.
- **Laid out by MuPDF in the reader's worker** at the page's size in CSS px with the font size as its em; **the look is a user
  style sheet** (`readerCSS`; MuPDF lets user CSS win at equal specificity): the reader's margins in place of the book's (`@page`
  and body margins off; the margins are the space the tab draws round the page — Narrow / Normal / Wide), the font for the body
  text (**Literata** (TTF, on the site since this tab), **Serif** — MuPDF's Times —, **Sans** — Noto Sans, on the site —, or
  **the book's own**; code stays monospace and wraps instead of running off the page), line spacing (the book's, or 1.25 – 2),
  justified (PCs) or left-aligned (phones: MuPDF does not hyphenate, and a phone's justified lines open wide), the book's own
  styles on or off, and **Light / Sepia / Dark / Black** — in all but Light every text takes the theme's colour and no box paints
  a background; the page is drawn on the theme's colour (a pixmap filled first: no premultiplied edges). Fonts reach MuPDF through
  its font hook (`fontHook`); a script none of MuPDF's built-in fonts covers (Latin, Greek, Cyrillic, Chinese / Japanese /
  Korean) is recorded and the tab says that text is left out (Arabic, Hebrew, Indic scripts — unless the book's own fonts have
  them). MOBI's `<mbp:pagebreak/>` breaks the page (`page-break-after`: MuPDF ignores page-break-before in user CSS).
- **The place is kept** when the look or the window changes (`anchorOf` / `findAnchor`): the first words of the page are looked
  for on the new pages, from the same share of the book outwards; a page without words (the cover) keeps the share. Measured in
  the unit suite at four other sizes and shapes, and in the browser after a larger font and a narrower window.
- **The tab:** the page area fills the window under the sticky rows (`--navh`); a wide window shows **two pages side by side**
  (Auto / One page / Two pages; a spread is named by its right page's chapter); **turning:** the arrows, Page Up / Down, Space,
  Home / End, the wheel (a pause between turns), a tap at the left third (back) or the right two thirds (forward), a swipe,
  buttons, a slider; **Contents** (the book's own, nested, each entry with its page; the current one marked) and **Go to page**;
  **Back to page n** after any jump (a link, the contents, a search hit); **links** inside the book followed, links to the web
  opened in a new tab; **search** (case and accents ignored, MuPDF's search with the line round each hit, from this page round the
  book, hits as they are found, Stop; the hits marked on the page); **selection** — a drag with the mouse, a long press on a word
  on a phone (then the finger extends it) — with Copy, Search the book, Read aloud; **▷ reads the page here** (to-do #40, below);
  **reading mode** (the reader fills the screen, real full screen where the browser allows; Esc leaves; a tap in the middle shows or
  hides the bars). The book last read — its file handle and place — is kept while the page is open, and coming back offers "Go
  back to “Title” — page n of N"; between visits, the books the reader asks it to remember (to-do #40, below).
- **"Remember book" (to-do #40; owner, 27 Nov 2026 — his words in todo.md's Done):** a switch beside the book's title (on phones
  the tools take a row of their own under it). Switched on: **"Processing…"** over the whole page (a modal dialog Esc does not
  close; shown at least 0.6 s so it is seen) while the **fingerprint** of the file is made — **XXH128** by hash-wasm in the hash
  worker (measured in V8 on 64 MB: XXH128 2.6 GB/s, BLAKE3 0.56, MD5 0.58, SHA-1 0.70 — the fastest, and 128 bits tell books apart);
  then the book — fingerprint, title, author and **its exact place**: the first words of the page and their share of the book
  (`anchorOf`, found again in any layout by `findAnchor`) with the page as laid out then — goes into the Settings' EPUB Reader
  section (this browser, and a settings file); "Remembered: open … again and it opens at this page." **Kept up to date as the
  pages turn** — quietly (`setQuietly`: stored at once, no settings file a page — the place goes into the next file and Export;
  Claude's judgement — a file a page turn would be a download a page —, kept so by the owner, 28 Nov 2026: "finish off the small
  choices"). **Opening a book:** when any book is remembered, its
  fingerprint is made while it is laid out and looked up; found → it opens where it was left ("Back where you left off: page 212
  of 380."), the switch on — another visit, another file name, another text size or window (the same words). Switched off →
  forgotten (a settings file follows). Every book switched on is remembered until forgotten (at most 1,000; each a few hundred
  bytes) — Claude's default for the open question "how many", kept by the owner the same day; the start of the tab lists them ("Books you asked it to remember").
  Focus goes back to the page after the switch (the arrow keys turn the pages again).
- **▷ — the page read aloud here (to-do #40):** no jump to the Text-to-Speech tab. The page shown — both pages of a spread — or
  the selection: a sentence a piece (`src/lib/ebookread.ts`: MuPDF's text → paragraphs → sentences, what is said by the
  Audiobook's `speechText`, 0.3 s after a sentence and 0.8 s after a paragraph; a sentence the page cuts off is read to its end
  from the next page when it plainly goes on), played by the Camera Reader's player (`src/lib/sayer.ts`: Kokoro and Piper in the
  Text-to-Speech worker, or a voice of this device). **The first ▷: all the voices** — US and British English (Kokoro), Indian
  English (Piper), this device's own — with the speed (Slower / Normal / Faster) and the download said; the choice kept in the
  Settings and used from then on ("Voice…" on the reading bar, and the Settings page, change it). **The sentence being heard is
  marked on the page** (green; `findOnPage` in `src/lib/ebook.ts`: MuPDF's search for it on its page, across lines — in the unit
  suite every sentence read was found, 570 of 570). A bar over the page: what is read and with which voice, Pause / Go on,
  Voice…, Stop; a page turned (or the look changed) stops it; it ends at the page's end.
- **Lazy:** nothing at the tab's start; the worker, MuPDF and Literata's four files (1.0 MB) with the first book; Noto Sans only
  when chosen; 7-Zip only for a CBR / CB7. The worker ends when the tab is left (the book's memory with it).
- **Found while building it** (docs/BUGHUNT.md): the worker lost the first book (MuPDF's top-level await in a module worker, see
  §4); the page area changed size when Back or the selection bar appeared and laid the book out again in a loop (both now take no
  room from it); a FictionBook's title is lost once the book is styled (read right after opening, `metaOf`).

### Articles → Kindle — BUILT (potentials #106; owner, 21 Nov 2026; built 27 Nov 2026 — group 1 of the suggested order)
(`articles` in `src/tools/articles.ts`, steps `src/lib/articles.ts` (no DOM), engine `wasm/article` → `src/wasm/bin/article.wasm`
(binding `src/wasm/article.ts`); unit `tests/unit/articles.test.mjs` 198, e2e `tests/e2e/articles.e2e.mjs` 49; fixtures
`tests/fixtures/articles/` with what is known about each page, made by `python3 scripts/make-article-pages.py` and
`node scripts/make-article-mhtml.mjs` — Chrome's own MHTML, saved by Chromium.) The owner's words (potentials #106): "a web
article saved with Ctrl+S (.html, .mhtml) or pasted → the article alone — no ads, menus or pop-ups — with its pictures, title,
author and date → an EPUB ready for Send to Kindle; several articles → one EPUB with a contents page (a weekend's reading)".
- **What it takes** (`pagesOf`, by the bytes, not only the name): Chrome's and Edge's "Webpage, Single File" (**.mhtml** — and
  Chrome on Android's "Download page"), Safari's **web archive** (an iPhone's Share → Options → "Web Archive"; a Mac's Save As),
  a page saved "**complete**" with its "…_files" folder (chosen as a folder on a PC, or dropped — a dropped folder's files are
  read with their paths), **HTML only**, a **text file**, and a **pasted selection** (the browser's HTML of it: text and links).
  The MHTML and the web archive are taken apart by our readers in article.wasm (below); an HTML file's text is decoded by its
  mark, the character set its container or its `<meta>` gives, else UTF-8 when valid, else Windows-1252 (`decodeHtml`, the
  browser's TextDecoder); the page's address from the save (Chrome's "saved from" mark, the MHTML's, the archive's), else its
  canonical link or og:url (`canonicalOf`). "How to save a web page on this device" in the tab says it per browser.
- **The article** (`articleOf`): article.wasm runs **dom_smoothie 0.20.0** — Mozilla Readability's algorithm, the engine of
  Firefox's Reader View, in Rust — and writes the article as **XHTML for an EPUB** (`xhtml.rs`, ours): the text's own elements
  under their HTML names, HTML's content models kept (a list holds items, a table its parts in order, a list of terms its
  groups, a paragraph no blocks, no link in a link), only links' addresses (http, https, mailto, the article's own #ids),
  descriptions, a list's start, spans, lang and dir as attributes; scripts, styles, forms, inline SVG left out; a video or an
  embedded page a link to it; MathML its TeX source; a tracking pixel (1 × 1) no picture; pictures as placeholders with every
  address they may come from (a `<picture>`'s sources, the srcset largest first, src, lazy-loading attributes). Its title,
  author (the "By" and a date after a separator cut off — `cleanByline`), site, date (the metadata's, else the article's
  `<time>`: **Chrome's MHTML leaves the page's scripts out, and its JSON-LD with them**), language, the text (a line a block).
  Reader View's own doubt (`readable`) is said; a page in which it finds no article is used whole, and said; "Use the whole
  page" (in the Preview) when it left something out. **Ours beside it:** the page's og:image on top when it was saved and the
  article does not show it (Readability — Firefox's too — leaves a lead photo above the article's text out); a pasted selection
  without a title is titled by its first heading; a frame of a Chrome MHTML points at its saved part (cid:) — its address is
  put back, so the video becomes a link.
- **Its pictures** (`pictureFor`): among the saved files by address (resolved against the page's), Content-ID, data: URL, or a
  path in the folder (escaped or not; the file's name when it is the only one). In the book (`convert` in the tab): JPEG, PNG
  and GIF that fit are kept **byte for byte**; WebP, AVIF, SVG and pictures larger than 1,600 × 2,400 are drawn again (MozJPEG,
  OxiPNG when transparent — the app's codec worker); a picture not saved with the page is left out and counted.
- **The EPUB** (`makeEpub`): a chapter per article — its title, "author · site · date · n min read" and its address on top —,
  its second-level headings in the contents, a contents page for several articles (titles with the same line), a cover drawn
  by the tab (the title and the articles, 1,200 × 1,800; optional), EPUB 3 with an NCX for older readers, the language of the
  first article, dc:date / publisher / source / description for one article; epubcheck 5.2.1 finds nothing. File: the book's
  title (`Articles-27-November-2026.epub`). Download, Share (phones), **Read it here** (the EPUB Reader opens it — the hand-over
  `src/lib/handoff.ts` carries a file), and how to send it with Send to Kindle.
- **The tab:** the articles as cards — the title (editable), the line under it, the pictures found ("2 of 3"), what to know
  (Reader View's doubt, pictures not saved — how to keep them —, videos as links), up / down / Remove, a **Preview** (the
  article as the book has it, its pictures from the saved files as blob: URLs, links in a new tab); the book's title and
  author follow the articles until typed; Pictures and the cover switches kept while the page is open. Nothing is fetched at
  open: article.wasm (1.1 MB) with the first page.
- **Measured:** on Mozilla Readability's own 128 test pages, 99.8 % of the expected words (the differences: embeds written as
  links, code blocks kept); on the fixtures, held word for word to Readability.js 0.6.0 run in the browser's DOM — every word
  it keeps is kept, and beyond it only the embed link, a code block under `md:hidden` (dom_smoothie 0.19's fix) and a heading
  with a `scroll-…` class (0.20's) that Readability.js drops.

### PDF / EPUB → Audiobook — BUILT (potentials #14; owner's pick of 27 Nov 2026 — group 1 of the suggested order)
(`audiobook` in `src/tools/audiobook.ts`; the book's text `src/lib/audiobook.ts` (no DOM) in `src/workers/bookread.worker.ts`; the
speech `src/workers/audiobook.worker.ts` on `src/lib/speech.ts` — the Text-to-Speech worker's engine, shared since — and
`src/lib/speechtext.ts`; the voices `src/lib/voices.ts`; unit `tests/unit/audiobook.test.mjs` 61 and `audio` 64 (the MP3
stream), e2e `tests/e2e/audiobook.e2e.mjs` 55; fixtures `tests/fixtures/audiobook/` with every track's words, made by
`python3 scripts/make-audiobook-books.py`.) The owner's words (potentials #14): "Read a book or PDF aloud into MP3s, one per
chapter" — MuPDF's text, the Kokoro / Piper voices, our LAME; PC and phones (long books best on a PC).
- **The book's text** (`readReflowable`, `readPdf`): EPUB, MOBI, FictionBook, plain text and web pages (what the EPUB Reader's
  `openFile` takes; comics, DRM and Amazon's formats refused in words) are laid out by MuPDF on pages 100,000 px tall — an EPUB's
  file is one page, a MOBI's headings stand at known heights — with paragraph margins forced (MOBI and many EPUBs set paragraphs
  without space: MuPDF gave one block for a chapter); MuPDF's blocks are cut where a paragraph begins inside one (an indented
  line after a short or finished one), lines joined (after a hyphen without a space), a drop cap joined to its word (MuPDF does
  no floats: it stands inline). The contents (the book's own, or MuPDF's from a MOBI's or a text's headings) resolved to page
  and height (`resolveLinkDestination`: a `#id` inside a file — Project Gutenberg's books are one file). **Footnote marks** are
  taken out of the XHTML before MuPDF reads it (`stripNotes`: EPUB 3's noteref and ARIA's, a raised link, a link round a raised
  mark, a link that is only a number or [1] or †; MuPDF's CSS reads no `epub:type`) and FictionBook's by CSS; the notes
  (`<aside epub:type="footnote">`, FictionBook's notes) are left out unless "Read the footnotes"; pictures are taken out (MuPDF
  writes "[image]" for one it cannot find). **A PDF** goes through the PDF → EPUB engine (reading order, columns, words broken
  over lines joined, running heads and page numbers by its 40 % rule, figures, tables and display formulas found — no pictures
  made: `jpeg` gives an empty one) and its XHTML is read (`pdfPageBlocks`): page labels, parts' markers, pictures, an
  equation's number and a figure's label (a few words without a sentence's end beside it) out, raised note marks out (with a
  space: the engine keeps none), the footnotes under its rule and the margin notes out unless asked for. **Running heads it
  keeps** (`dropRunningHeads`: a book alternates its title and the chapter's, each on fewer than 40 % of the pages): a page's
  first or last paragraph of a few words that is the book's title, the author or a chapter's title after its first showing,
  that copies a heading on its page, or that stands at the edge of three pages; a paragraph that goes on over a page is joined
  ("break-" + "water", `joinPages`); a contents page is left out (`dropContents`: a paragraph holding three titles, or three
  titles in a row); a bookmark well down a page begins at its heading there (`pdfIndex`). A PDF of pictures only (a scan) is
  refused: "the OCR tab reads the text of a page's picture".
- **The tracks** (`buildTracks`): one per entry of the contents, at the deepest level whose tracks are 250 words and more at
  the median (a paper's subsections of a few lines are read inside their section); entries at one place are one ("The Watches
  — The First Watch"); a track of fewer than 30 words goes with the next (a part's title page: "Part One: The Rock — Chapter 1.
  The Keeper"; generic front matter's names dropped from the title); contents, index, copyright, cover, "also by", about the
  author: not ticked at first; a track that is only its heading is none. Without contents: the headings (`how: 'headings'`);
  without headings: parts of about 2,500 words (17 minutes) ended at paragraphs. The text spoken (`speechText`): a web address
  as its site, bracketed marks out; Kokoro's own normaliser reads numbers, money, times, titles.
- **The speech** (`src/workers/audiobook.worker.ts`): each track's paragraphs said by the voice (Kokoro's US and British voices at
  24 kHz, Piper's Indian English at 22.05 kHz — the TTS tab's voices; `src/lib/speech.ts` is their engine) straight into an
  **MP3 stream** (audio.wasm `a_mp3s_*`, LAME 4.0: only the MP3 is kept — an hour of speech is 29 MB at 64 kbps, 345 MB as
  samples; fed in any pieces it is byte for byte the one-shot encoder's file), mono at 48 / 64 / 96 kbps, with **ID3v2.3 tags**
  (UTF-16: title, the book, the author as artist and album artist, track n/N, genre "Audiobook", language) and the **cover** (an
  EPUB's own, a PDF's first page; at most 500 px, JPEG; marked front cover — LAME writes "other") through LAME's own id3tag
  code; the LAME / Xing frame written after the tag (gapless: players drop the encoder's delay and padding). The pauses of a
  book read aloud (`PAUSE`, shorter when faster): 0.75 s before a track, 2 s after (an audiobook's room tone), 0.6 s after a
  paragraph, 1 s after a heading and 0.5 s more before it, 1.6 s for a break between scenes.
- **The tab:** Choose a book (or drop it) → its title and author (to edit), cover, how its tracks were found and what is not
  read ("4 footnote marks, 4 notes, 8 running heads and page numbers"); "Read the footnotes"; the tracks — a check box, the
  title (to edit: it goes into the file's name and its tag), words and length at the chosen speed, ▷ a sample of its beginning;
  Choose all / none; the line "3 of 5 tracks chosen · 92,345 words · about 10 h 15 min of speech at 1×". Voice (the TTS tab's,
  in groups), speed 0.5 – 2×, MP3 quality, "Listen to a sample". **Make the audiobook**: the progress, the tracks being made,
  the speech made, how fast ("3.0× as fast as it is spoken") and the time left; **Stop** (the workers end at once). On a PC
  **one to four speech engines at once** (default half the processor's cores, at most three; each a worker with its own ONNX
  session, about 400 MB): the first fetches the voice, the others start when it has it (from the browser's cache); measured
  here, Piper with two engines: 44 s of speech in 14 s. The MP3s: **kept in the page** (each playable, its Download; "Download
  all (.zip)" — a folder named after the book with the MP3s, numbered "01 The Harbour.mp3", and an .m3u playlist; Share on
  phones), or on a PC **saved into a folder as they are made** (File System Access) — a folder that already holds some tracks
  is carried on from (a run that was stopped, the page closed: choose the same folder). A track made with the same voice,
  speed, quality and titles is not made again. The screen is kept on while it works (a phone that sleeps stops the page); the
  tab says a laptop on battery may pause a background tab. The choices are kept while the page is open. Nothing at open: the
  reading worker (MuPDF; textcore and imgproc for a PDF) with the first book — it ends when the book is read —, the speech
  workers (the voice's model, espeak.wasm, audio.wasm) with the first sample or run; all end when the tab is left.
- **Tests:** unit `audiobook` 61 — every word of every test book in order, held to its own word list (novel.epub, old.epub's
  NCX, book.mobi, plain.txt, tale.fb2, long.epub's 36 chapters word for word, a Gutenberg-style EPUB, a text without headings,
  a 16-page book PDF with bookmarks, running heads, a footnote, a figure, two columns and a chapter that starts mid-page — made
  by reportlab), what must not be heard absent, the rules on made-up blocks; `audio` 64 — the stream byte for byte the one-shot
  file, mutagen reads every tag and the cover, FFmpeg decodes exactly the samples fed. e2e `audiobook` 55 — real MP3s (Piper,
  two engines; Kokoro) read back by ffprobe (tags, cover), FFmpeg (the exact gapless length from the LAME frame, the silences
  at the ends) and **Whisper** (faster-whisper base.en, `tests/lib/transcribe.py` — `pip install faster-whisper`; skipped with a
  note where missing): each file says its own chapter, far more than any other; the zip; a folder carried on from; Stop; a PDF;
  footnotes; a protected PDF; refusals; axe-core with a book open in both themes; the phone.

### Screencast (PC) — BUILT (`src/tools/screencast.ts`; e2e `tests/e2e/screencast.e2e.mjs` 50)
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
**As built after the Nov 2026 bug hunt** (tab 153): the recording is finished by `finishRecording` (`src/lib/aac.ts`):
duration index, and an MP4's sound as AAC (Linux Chromium's recorder writes Opus into MP4; re-encoded, the picture
copied; if that fails, copied as it was — the sound is never dropped); Start cannot be pressed twice during the
countdown; sharing ended during the countdown is said and the next Start asks again.
**21 Nov 2026 (owner's questions; e2e 32):** **an area recording was black** — the crop made each frame a `VideoFrame`
with `visibleRect`, which MediaRecorder encoded as black for BGRA frames (Chrome's usual screen frames; Chromium's test
screen sends I420, where it worked, so the size check passed): the rectangle is now drawn onto an OffscreenCanvas of its
size frame by frame (any kind of frame; black around what is left if the shared picture shrinks). The video **is** the
rectangle at the screen's own pixels (owner: "only the rectangular area becomes the full screen of the video?" — yes):
the suite records a known picture (red around four colours) and reads the file's pixels with ffmpeg. **"Show the mouse
pointer"** (owner: "add an option to exclude the mouse"; on by default): the capture's `cursor` ('always' / 'never'),
asked for when sharing starts — Chrome keeps a live track's setting, so the pointer or the shared sound changed on an
open share ends it ("… is set when sharing starts: choose what to record again"; also when changed while Chrome's
picker is open), the frame rate is applied to the open share; the line under the preview says what the browser reports
("no mouse pointer", "with the mouse pointer: this browser keeps it in, though it was asked to leave it out", or "may
still record" where it reports nothing — whether Chrome honours 'never' depends on its version and the system; its test
screen has no pointer, so the suite sets the report). The switches are locked while recording. A share ended while its
picture was on its way no longer leaves the tab waiting.
**Countdowns and the sound level (to-do #21; owner, 26 Nov 2026: "add … a 5-second countdown, an 8-second countdown, and a
custom countdown in seconds … the volume of the output video seemed a little lower than the normal. Please check and
confirm this. If it is actually so, then fix it."; e2e 50):**
- **Countdown before recording:** Off · 3 s (the default) · 5 s · 8 s · Custom — whole seconds, 1 to 120 (`countdownSecs`;
  another number is marked "Whole seconds, 1 to 120." and Start says why it does not begin). The choice is kept while the
  page is open (module memory, through other tabs; nothing stored). The countdown also shows in a small window that
  stays on top (Document Picture-in-Picture, `src/lib/pipcount.ts`, shared with the Screenshot tab), so it can be seen
  with the browser minimised — "Start now" and "Cancel" in it; it is closed 250 ms before the first frame, so it is never
  recorded. A Cancel button on the page ends the countdown too ("Cancelled.", nothing recorded). Where the browser gives
  no such window (or no click is left for it — after the save dialog), the countdown is in the page only.
- **The sound level — checked, not lower:** a known tone as the shared sound (440 Hz, amplitude 0.3) and another as the
  microphone (1 kHz, 0.2), recorded as MP4 and WebM with and without the microphone: each tone's amplitude in the file
  (Goertzel over the middle second, ffmpeg decoding) is the one played within 0.02 dB — the recorder, the mix with the
  microphone (Web Audio: sources added, a mono source on both sides at full level) and an MP4's Opus re-encoded as AAC
  (Linux Chromium) change no level; the suite holds it within 0.5 dB. The tab records the shared sound at the level the
  browser hands it over (the system's or the tab's playback before the volume control); what it cannot see: Chrome's
  processing of a real microphone (echo cancellation, noise suppression, automatic gain — asked for, as calls do), and
  Windows lowering other sounds while a "communications" microphone is open (Sound settings → Communications).
- **"Bring the sound to a normal loudness"** (owner, 26 Nov 2026: "Yes" — offered after the check): a button under a
  recording that has sound (`src/lib/normalize.ts`). FFmpeg's loudnorm (the FFmpeg tab's ffmpeg.wasm — the existing
  module that measures EBU R128 and limits true peaks; fetched on the first press, let go on leave) in two passes on the
  sound alone: the first measures; the second brings it to **−16 LUFS** with **one gain for the whole recording**
  (`linear`), or — where one gain would push a peak above −1.5 dBTP, the loudness range is above 20 LU, or the sound has
  no range at all (a steady tone) — loudnorm's dynamic mode. The new sound (AAC 160 kb/s in an MP4, Opus in a WebM — the
  stereo Opus at complexity 4) is joined to the recording's own video packets by mediabunny (`joinSound`, the two tracks
  in time order; the picture never re-encoded, ffmpeg's md5 of the video stream equal before and after). The line under
  it says before → after ("−30.8 → −15.9 LUFS (+14.8 dB), one gain for the whole recording"); silence, no sound, or
  already within 0.5 LU of −16 is said and nothing changes; "Download the original" keeps the one before. Recordings
  saved straight to a file are pointed to the FFmpeg tab's "Normalise loudness". e2e: a quiet MP4 with a changing level
  (linear) and a steady WebM tone (dynamic) both −16 ± 0.5 LUFS, the picture's packets identical; one already at −16.

### Screenshot (PC) — BUILT (`src/tools/screenshot.ts`; e2e `tests/e2e/screenshot.e2e.mjs` 68)
Share once (Chrome's picker: screen, window or tab; own tab excluded; optional mouse pointer) → "Take screenshot"
now or after 3/5/10 s. With a delay, a small always-on-top **Document Picture-in-Picture** window counts down with
"Snap now" and "Cancel" (the owner minimises the browser: Win+↓ / Super+H); it closes itself 250 ms before the
frame is grabbed. The frame is read at full resolution (MediaStreamTrackProcessor → VideoFrame; `<video>` fallback).
Editor: crop box (shared `cropBox`), **PNG** (our OxiPNG), **JPEG** (our MozJPEG, q 90), **Copy** to the clipboard
(PNG); gallery of this visit's shots (click to reopen). The share stays alive for more shots ("Stop sharing" ends
it). A web page cannot screenshot silently, minimise the browser or see the active window (said in the tab).
Tests: full-size PNG, JPEG, cropped PNG = 84 %, clipboard PNG, 3 s delay, PiP "Snap now" (< 1.5 s) and "Cancel",
gallery, stop sharing.
**As built after the Nov 2026 bug hunt** (tab 154): each shot's copy of the shared track is stopped (they kept the screen
shared after "Stop sharing"); shots not shown are kept as lossless PNG (not 33 MB of pixels each) and decoded again
when opened; sharing stopped during the countdown is said; no new share during the countdown.
**21 Nov 2026 (e2e 22):** "Show the mouse pointer" (off by default) did nothing when changed during a share (Chrome keeps
a live track's `cursor`): a change now ends the share ("… share again"), also while the picker is open; the status line
says what the browser reports for the pointer; the switch is locked during the countdown.
**An area drawn with the mouse (to-do #24; owner, 26 Nov 2026: "add the ability for the user to draw a rectangular area with
his mouse also as an option to take the screenshot"):** "Take": **The whole picture** (as before) or **An area (draw a
rectangle)**, kept while the page is open. A page cannot draw over the desktop, so — as Windows' Snipping Tool does — the
frame is taken first (after the countdown, which comes first with a delay) and shown frozen over the whole window
(`src/lib/areapick.ts`): **full screen at once while the click that started it lasts** (Chrome keeps a click 5 s; a long
countdown leaves a "Full screen" button), at the screen's own pixels — one device pixel a frame pixel when it fits, the
screen in a full-screen window of its size lies exactly over it; a larger frame fitted (`layoutOf` in
`src/lib/areageom.ts`) — and dimmed. The mouse or a finger drags a rectangle (its size in pixels beside it as it grows);
its four corners and four sides adjust it, a drag inside moves it, a drag outside starts anew; the keys: an arrow starts
the middle half, arrows move it (Shift: 10 px), Ctrl with an arrow sizes it, Ctrl+A takes all; **Enter, a double-click or
"Take this area"** take it, **Esc or Cancel** cancel (in full screen Esc reaches the page through the Keyboard Lock API: a
short press cancels, a long one leaves full screen), "Whole picture" takes all of it. Points are pixel edges, so the
rectangle drawn is the pixels taken; the area goes to the editor at full resolution (`cropImg`: rows copied as they are)
and the editor says where it was ("an area at 100, 50 of 640×360"). The rest of the page is inert meanwhile; leaving the
tab closes it. Tests: unit `areageom` 37 (every pixel edge found again from where it is drawn, at 1:1 and fitted; drags,
moves, edges and corners, turning over; the crop against a pixel-by-pixel copy); e2e — a known noise picture shared (a
rectangle one pixel off never matches), the area's PNG byte for byte the same rectangle of the whole shot: dragged with the
mouse, a corner and a side adjusted and moved and taken by a double-click, the keys alone, a finger (CDP touches), "Whole
picture", Esc, a 3 s delay (full screen offered or taken), a 1920 × 1080 screen fitted into the view, leaving the tab.
**Scrolling screenshots (to-do #28; owner, 26 Nov 2026: "Make a new option also for scrolling screenshots in the
screenshot app."):** "Take" → **A scrolling page**: one tall picture of something longer than the screen, made of the views
taken while it scrolls. **Who scrolls:** a page cannot scroll another window, and Chrome's Captured Surface Control has no
programmatic scrolling (the early `sendWheel` proposal shipped as `CaptureController.forwardWheel(element)`, Chrome 136,
which forwards the user's own wheel turned over an element to the shared tab; checked in this sandbox's Chromium: no
`sendWheel`) — so **a shared tab** is shown here and scrolled with the mouse wheel over its picture (Chrome asks once; the
share keeps this tab in front, `setFocusBehavior('focus-capturing-application')`), and **a window or a screen** is scrolled
by hand where it is, at any pace (the tab says so on a line of its own for the whole capture; come back and press Stop). A
countdown first, if one is set. **Joining** (`src/workers/scrollshot.worker.ts` → `src/lib/scrollstitch.ts` → imgproc.wasm's
`p_scroll_match`): every new frame (the newest one when the joining falls behind) is placed against the view kept before
by its rows — rows that stay put at the top and bottom (a sticky header, a footer, a chat's input box) are kept once; the
shift of the rest is the one under which the overlap differs least against the detail it holds (a blank overlap is no
evidence); the overlap's pixels are checked. Screens are captured exactly, so the picture is pixel for pixel the page.
Said as it happens: the views and the picture's size; a view that does not fit (scrolled too fast — more than a view at
once — or sideways): scroll back a little and it goes on; a blank stretch longer than the view (nothing to place by);
the window resized, or the picture at 100 million pixels — stopped, the picture so far kept. **The result** goes to the
editor (crop, PNG, JPEG, Copy; a long picture in a box that scrolls); above 32,000 rows it comes in parts (a browser's
canvas holds 32,767 a side), part 1 shown, the others in the gallery. Unit `scrollstitch` 24 (synthetic pages: header +
page + footer pixel for pixel — steady, scrolled back, up first, after a jump, repeated rows, parts, the pixel limit; a
jump, sideways, resized, a blank stretch said; a capture off by 2 in every pixel still placed); e2e screenshot (a made-up
640 × 480 view of a 2,400-row page with a sticky header and footer: a tab scrolled by the wheel over its picture and a
window by hand with a jump of 600 rows on the way — every row of the PNG as the page drawn whole; Stop lets the wheel go;
leaving the tab ends it).

### YouTube Clip (PC) — BUILT (`src/tools/youtube.ts`; e2e `tests/e2e/youtube.e2e.mjs` 13)
Inputs: "Two links" (YouTube's Share → Start at… / right-click → "Copy video URL at current time" at the start and
at the end) or "One link + times" (1:02, 1:02:03, 62, 1m2s). Links: watch?v=, youtu.be, shorts/, live/, embed/,
m./music. hosts, `t=` / `start=` / `#t=`; different videos and end ≤ start are refused.
1. **yt-dlp command** (original quality): `yt-dlp --download-sections "*START-END" -f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]"
   --merge-output-format mp4 -o "%(title)s [start-end].%(ext)s" URL`, optional `--force-keyframes-at-cuts` (exact) or
   `-x --audio-format mp3` (sound only); install hints for Windows (winget), Linux (pipx) and Android (Termux).
   **"Download latest yt-dlp"** (owner, 20 Nov 2026; `src/lib/ytdlp.ts`): a link to GitHub's
   `github.com/yt-dlp/yt-dlp/releases/latest/download/<file>` (always the newest release) for this computer —
   yt-dlp.exe / yt-dlp_arm64.exe / yt-dlp_x86.exe (Chromium's architecture and bitness), yt-dlp_macos, yt-dlp_linux /
   yt-dlp_linux_aarch64, the Python zipapp elsewhere — the other six under "Other systems", how to run it; a link, not a
   request: nothing is fetched by the page and the CSP is unchanged. **What else yt-dlp needs is said** (owner, 20 Nov 2026: Ubuntu's apt
   yt-dlp 2026.03.17 without a JavaScript runtime got "HTTP error 403 Forbidden"): since November 2025 yt-dlp runs
   YouTube's player code with a JavaScript runtime — Deno by default (2.3+), Node 22+ or QuickJS with `--js-runtimes`
   (yt-dlp's EJS wiki). `needsHint(file)` under the download button (Windows: winget DenoLand.Deno; macOS: brew; Linux:
   Deno's installer and why the distribution's yt-dlp will not do; Termux: nodejs + `--js-runtimes node`, pip
   "yt-dlp[default]") and `TROUBLE_403` beside the command (what the two messages mean; `yt-dlp -U`).
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
**As built after the Nov 2026 bug hunt** (tab 155; links and times in `src/lib/ytclip.ts`, unit `ytclip.test.mjs` 41): a
link to another video unloads the player (it recorded the old video at the new times); a recording keeps its clip and
cannot be started twice; the MP4's sound is AAC (`finishRecording`); minutes and seconds above 59 are refused; times
are rounded before they are written (no "0:60").

### Settings page — BUILT (to-do #39; owner, 27 – 28 Nov 2026)
(`#/settings`, a page of the shell, not a tab: the store `src/settings.ts` (part of the start page, small), the page `src/settingspage.ts`
and `.css` (fetched with the page), the file `src/lib/settingsfile.ts` (fetched with the first file); unit `tests/unit/settings.test.mjs` 32,
e2e `tests/e2e/settings.e2e.mjs` 96.) The owner's words (28 Nov 2026): "the storage for all the settings in the settings page should be in
the browser. Each app should have, if necessary, … a section of that app in the settings page … when I change something in the settings
page, it should be reflected in the browser storage, and then … in that part of the app that requires it. And the other way around … whenever
something is changed in the overall consolidated settings, a new settings file should be immediately downloaded to the local device. So
something like superutils_settings_ mmdd_ hour minute."
- **One store, every view in step:** each section is what one part of the site keeps, under its own `localStorage` key (§1 rule 1), each
  value checked as it is read, stored or imported (a wrong type, a value out of range or a choice the app does not offer falls back to its
  default; unknown fields dropped). A change in an app, on the Settings page or by an import changes the store and every view of it at once;
  another open tab of the site follows (the `storage` event) — an open app too: its voice, its words, its cities — and writes no file.
- **The sections** (the set the owner chose, 28 Nov 2026): **Favorites** (the starred apps; removed there, the star goes off); **The list of
  apps** (folded or not); **Text-to-Speech** (the voice — the site's voices, or one of this device's own, kept by its name — and the speed);
  **Camera Reader** (voice, speed, text size, "read aloud as soon as the page is read"); **PDF / EPUB → Audiobook** (voice, speed, MP3
  quality); **EPUB Reader** (font, text size, line spacing, theme, margins, text edge, one or two pages, the book's own styles — "as the
  device suits" until chosen; since to-do #40 the reading voice and speed of its ▷ — "Not chosen yet" until the first ▷ — and **the remembered books**, each with its place, when it was last read and Forget (the reader open in another tab turns its switch off)); **Spell Checker** (the language; the words added with "Add to dictionary" — kept between visits now — each
  removable there); **World Clock** (its cities, added with its search or a set, moved, taken off — each removable there —, and the 12 /
  24-hour clock; owner, 28 Nov 2026: "when I add new cities, it gets saved in the settings page"). Each section links to its app. A link to
  the World Clock with a list of its own (`?c=…`) shows that list without storing it until something is changed there.
- **A settings file after every change** ("Save a settings file after every change", on: this device's own switch, not in the file):
  `superutils_settings_YYYYMMDD_HHMM.json` (the year added so the files sort across years — told to the owner), 1.5 s after the last of a
  burst of changes (a slider dragged is one file), by the tab where the change was made: JSON — `{ "app": "SuperUtils", "kind": "settings",
  "format": 1, "saved": "2026-11-28T10:42:07+05:30", "settings": { "favorites": […], "applist": {…}, "tts": {…}, … } }`. Downloaded (Chrome
  asks once to allow several downloads; an iPhone asks each time), or — on a PC whose browser allows it (File System Access: Chrome, Edge) —
  written into a folder chosen once ("Choose a folder for the files"; a second file in the same minute replaces that minute's; after a
  browser restart the browser asks again, "Allow writing to …", and until then each file is downloaded; "Download the files instead").
  **Export settings now**: a file at once (with the switch off too). The files card names the last file and where it went.
- **Import settings…:** a settings file → the sections it holds replace what is kept (the others stay); apps the site does not have,
  sections this version does not know and values it cannot take are named and left out; a file of a newer version, of another program or
  not JSON is refused in words and changes nothing. An import is a change: one settings file after it.
- **A Chromium fault kept away** (found 28 Nov 2026 in Chromium 153 — docs/BUGHUNT.md, "Settings"): a folder's handle read back from
  IndexedDB in a private (Incognito) window closes the whole browser — a real folder and the private file system alike; a normal profile
  is fine. A page cannot ask whether it is in a private window, but its storage quota is a share of the memory there and of the disk
  otherwise: below twice the script heap's limit (`privateWindow()` in `settingsfile.ts`) the folder is kept for the visit only — never
  stored, never read back — and the page says so. The handle is read from IndexedDB once a visit (another open tab's choice reaches it by a
  BroadcastChannel).
- **The shell:** a change of Favorites no longer draws the Settings page again (its import message vanished and the page jumped to the top
  when a favorite was removed there) — only the tab row's count.
- **Tests:** unit — every section's checks, a change told as made here or in another tab, the snapshot, an import (replaced, kept, refused,
  named), the file's name; e2e — the header link, every section both ways (a star; the list folded; a voice and a speed in each speech app;
  a page read by the Camera Reader at the size chosen and not read aloud by itself; a book opened in the theme and size chosen; a word added
  in the Spell Checker, kept after a reload, taken out on the page; a set of cities, a city taken off, 24 hours), a burst of changes one
  file, the file's name and contents, the switch off (no file) and Export now, an import and the refusals, two tabs of the site following
  each other with one file a change, the folder in a private window (for the visit) and in a normal profile the suite launches (remembered
  after a reload), axe-core in both themes, the phone. Every other suite's pages have the file after every change off (`page({
  settingsFiles: true })` keeps it on), so that their own downloads are not taken for settings files.

### Linux X11 vs Wayland (owner requirement: auto-detect)
**Every app, not only the capture tabs (owner, 21 Nov 2026 — the standing note at the top):** the detection below is
shared by all tabs on Linux; each uses it where the two display servers differ.
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
| libsodium 1.0.20 + own MD5/SHA-1/SHA-3/CRC-32 + OpenBSD bcrypt + own CSPRNG helpers (shuffle, sampling, UUID v4/v7 — v7 values always increase: RFC 9562 §6.2 method 2, a random step inside one millisecond, clock steps back of up to 10 s tolerated) + USODIUM1 header | C | **us** (`wasm/crypto`) | rng, picker, teams (draws without repeats, shuffles — what libsodium.js lacks: `docs/WASM-AUDIT.md` 155), uuid, mock data, line shuffle; the USODIUM1 header for sodium and sharelink (beside libsodium.js); its hashes (`u_hash_*`) are no longer called (hash-wasm since Nov 2026) |
| **libsodium.js** — `libsodium-wrappers-sumo` 0.8.4 (libsodium **1.0.22**; the sumo build: the standard one has no Argon2) | C | the libsodium project (official WebAssembly build, embedded in the module) — binding `src/wasm/libsodium.ts`, format `src/lib/usodium.ts`, in `src/workers/crypto.worker.ts` | sodium, sharelink: Argon2id + XChaCha20-Poly1305 secretstream (`docs/WASM-AUDIT.md`, tab 101); password, passphrase, dice, coin: randombytes_uniform (tabs 104, 105, 155) |
| imgproc (adjustments, resize, OpenCV's area resize (`p_resize_area`, equal to cv2's INTER_AREA), lossless orient/crop, filters, matting, warp + homography, doc enhance, the page in a photo (`p_page_quad`) and whether an outline is a page's (`p_quad_steps`: the step across each edge; `p_quad_text`: the letters it leaves outside), an outline fitted to the photo's edges (`p_refine_quad`), strips of the desk along a straightened page painted (`p_clear_border`), which way up the text stands and how its lines slant (`p_text_turns`: the letters; `p_text_lines`: projection profiles), where the text is (`p_ink_window`), a watermark's broad strokes taken out (`p_clear_wash`), the views of a scrolling
screenshot placed against each other (`p_scroll_sig`, `p_scroll_match`: rows that stay put, the shift by the overlap's
difference over its detail, the overlap's pixels), ruled lines and list marks cleared and the columns counted (`p_clear_marks`); **book pages flattened** (`flatten.c`: `p_book_fit`, `p_book_render`, `p_book_locate` — page-dewarp's method, Levenberg–Marquardt, the gutter, the margins); **where a region of a PDF page may be cut for a Kindle's screen** (`kindle.c`: `p_blank_rows` — rows with no ink outside the letters' bodies, figures and formulas; `p_next_cut` — the lowest paragraph gap past 65 % of the room, else the lowest gap); PaddleOCR's steps around its networks, as RapidOCR takes them in OpenCV's arithmetic (`p_resize_linear` / `p_net_planes`: cv2.resize INTER_LINEAR in its own fixed point; `p_db_boxes`: DBPostProcess, its box score over cv2.fillPoly's exact pixels; `p_crop_quad`: get_rotate_crop_image; `p_ctc`: CTC's greedy reading); **flat colours, masks, black and white and ink lines for Image to SVG and the Clipart Maker** (`flat.c`: `p_clip_flat` — greedy k-means++ in CIE Lab, a mode filter, specks taken in, each colour the mean of its own pixels; `p_clip_mask`, `p_clip_lines` — Winnemöller's DoG inside the subject, not at its edge; `p_bw` — a threshold or Otsu's; `p_u2_planes` / `p_u2_mask` — U²-Net's input and output as rembg makes them); AnimeGAN v2's input and output as its own code makes them (`p_anime_in` / `p_anime_out`, the Cartoonizer's anime looks)) | C (own code) | **us** (`wasm/imgproc`) | image tools, scanner, passport, cartoon, ocr and photodict (pages found, set upright and level, rules and list marks cleared — to-do #18; the second reader's pixel work), bookflat |
| metacore (EXIF → JSON, lossless metadata strip JPEG/PNG/WebP, JPEG DPI, image sniffing) | C (own code) | **us** (`wasm/metacore`) | exif, image loading, passport/formphoto DPI |
| BusyBox 1.38.0 (130 applets) + compat shims | C | **us** (`wasm/busybox`) | terminal, bc console |
| jq 1.8.2 (+ oniguruma) | C | **us** (`wasm/jq`) | jq |
| CPython 3.14.8 (+ zlib 1.3.2; **SQLite 3.54.1, bzip2 1.0.8 and liblzma 5.8.4** — the C libraries of sqlite3, bz2 and lzma, linked in (28 Nov 2026); stdlib as .pyc in python314.zip with tzdata 2026.6; **the regex module 2026.11.19** — mrab-regex's C extension built in as `_regex`) **+ our changes** (§5.1m: recursion guard for a browser's two stacks, lru_cache in Python, pbkdf2_hmac fallback, socket stand-in + asyncio loop without sockets, local time from the host, regex-wasm.patch) | C | **us** (`wasm/python`, python.wasm 9.6 MB + python314.zip 5.76 MB, loaded on the first Run; run by our WASI host `src/lib/terminal/wasi.ts` in `src/workers/python.worker.ts`) | python; regex (the Python re and regex-module flavours, `src/lib/regex/python.ts`) |
| Graphviz **16.1.0** (cgraph, gvc, dot/neato/fdp/sfdp/circo/twopi/osage/patchwork, core renderers; the official release archive) + Expat 2.9.0 **+ our changes** (§5.1l: `storeline.patch` — an upstream crash on labels that start with an empty line; `triangulation.patch` + `st_delaunay.h` — prism overlap removal on our C port of Delaunator instead of GTS; glibc's `qsort` and `rand`; assertions kept; text measured by the host through a "textlayout" plugin) | C / C++ | **us** (`wasm/graphviz`, 1.65 MB / 0.56 MB gz, a fresh instance per drawing in `src/workers/graphviz.worker.ts`; the existing builds — Viz.js, hpcc — trap on valid graphs: `docs/WASM-AUDIT.md`, tab 55) | graphviz |
| audio: **LAME 4.0** libmp3lame (MP3 encoder) + own C (WAV writer — 16-bit by the browser's own rule, waveform peaks, levels, gain/fades, scale, mix, Kaiser windowed-sinc resampler) + `studio.c`: **DeepFilterNet 3's signal processing** (a C port of libDF's STFT, ERB features, norms, mask and deep filter — held to libDF) and **the studio finish** (rumble filter, expander, EQ, compressor, de-esser, BS.1770-4 loudness, 4× oversampled true-peak limiter — held to FFmpeg's ebur128); **MP3 as a stream** (`a_mp3s_*`: fed a piece at a time, ID3v2.3 tags and a cover through LAME's own id3tag code, the LAME / Xing frame written after the tag — the Audiobook) | C | **us** (`wasm/audio`) | audio (and tts, noise — Studio voice —, pitch, slideshow, audiobook) |
| Signalsmith Stretch 1.3.2 (tempo and pitch, polyphonic) | C++ | Signalsmith Audio (official `signalsmith-stretch`, WebAssembly in an AudioWorklet) — rendered offline by `src/lib/stretch.ts` | pitch (replaced our WSOLA in Nov 2026: `docs/WASM-AUDIT.md`, tab 145) |
| espeak: **eSpeak NG 1.52.0** (+ English phoneme tables and dictionary compiled from the same release, linked in, served to its fopen/stat from memory) + glue (IPA for Kokoro, piper-phonemize-style sentences) | C | **us** (`wasm/espeak`) | tts, audiobook, camreader |
| geo: Charles Karney's **geodesic.c 2.2** (GeographicLib's geodesic routines in C, MIT; the two files unmodified from the PROJ 9.9.0 release) + glue (inverse problem on WGS-84, half-way point, the haversine great circle for comparison) | C | **us** (`wasm/geo`, 36 KB, loaded by the Coordinates tab only; no tried-and-tested WebAssembly geodesic module exists: `docs/WASM-AUDIT.md`, tab 82) | coords |
| textcore: tool-search ranking, rare-word ranking (tokeniser, lemmatiser, wordfreq hash table), XY-cut reading order (columns numbered only where they are real: `minh`), **the tables of a page** (`table.c`, `t_tables`: ruled grids and columns that line up — Tabula's and Camelot's two ways; MuPDF's own `table-hunt` loses columns: docs/WASM-AUDIT.md 191) | C (own code) | **us** (`wasm/textcore`) | search box, emoji (search), photodict, epub, clipper (the order of a story's parts), kindlepdf (a page's regions), pdf-tables, worldclock (the city search) |
| textkit: **unicode-segmentation 1.13.3** (the Rust ecosystem's UAX #29 implementation, Unicode 17.0, MIT / Apache-2.0: extended grapheme clusters, sentence boundaries) + our counting rules: words as a word limit counts them, abbreviations and initials, lines and paragraphs, keywords (Snowball's stop words); **the Case Converter's thirteen conversions** (`case.rs`: Title Case is a port of the Python package `titlecase` 2.4.1 — Gruber's rules, MIT; the code cases cut words as npm's `change-case` does; case mapping by Rust's standard library) | Rust | **us** (`wasm/textkit`, crates.io via `Cargo.lock`, two modules by Cargo features: **textkit.wasm** 217 KB — fetched with the Word Counter's first text, with the Case Converter, and with the first Fancy Text that has an emoji or another script — and **textkit-diff.wasm** 0.71 MB = the **`similar` crate 3.2.1** (Apache-2.0: Myers in linear space with a time limit, line / word / grapheme diffs, inline changes, unified diffs) + our glue and our pairing of a change's lines side by side (`pair_lines`: likeness by a bounded Myers search, the best order-keeping pairing by dynamic programming — to-do #35), fetched by the Text Diff only; and **textkit-lorem.wasm** 0.13 MB = the **`lipsum` crate 0.9.1** (MIT: a Markov chain over the classic passage and Cicero's *De finibus*, with rand 0.8 / rand_chacha 0.3) + our glue (cleaned texts learned as circles, exact counts), fetched by the Lorem Ipsum tab; and **textkit-tokens.wasm** 0.20 MB = the same `similar` crate's **patience algorithm** on two documents' tokens + ours (`tokens.rs`: runs that are only added or removed slid to where they read best, short equal runs taken into the changes round them, moves), fetched by PDF Compare's first Compare; the existing module — ICU4X's official build — is one file of 20 MB: `docs/WASM-AUDIT.md`, tab 90) | wordcount, case, lines ("By length"), fancy (characters); diff (textkit-diff); lorem (textkit-lorem); pdf-compare (textkit-tokens) |
| Hunspell 1.7.6 (the spell checker of LibreOffice, Firefox and Chrome) **+ ours**: its time limits ten times as long (a WebAssembly build — and a phone — is slower than the desktop), its file streams read through C's stdio from memory (`stdio_stream.hxx`), and our order of the suggestions (`rank.hxx`: wordfreq's frequencies, a weighted edit distance, the dictionary's table of misspellings) | C++ | **us** (`wasm/hunspell`, 0.66 MB; the existing builds — hunspell-asm 4.0.2, hunspell-wasm 0.3.0 — give other suggestions than Hunspell 1.7.6 or cut them short: `docs/WASM-AUDIT.md`, tab 198) | spell |
| VTracer 0.6.5 (visioncortex's colour tracer; visioncortex 0.8.10) | Rust | **us** (`wasm/vtracer`, plain exports on wasm32-wasip1, 0.17 MB; the existing npm build, `vectortracer`, is its demo's glue tied to a canvas and a DOM — `docs/WASM-AUDIT.md`, tab 199) — the same SVG as the native tool, byte for byte (built on musl's maths library, as wasi-libc's) | tosvg (colour), clipart (every shape, the outline, the ink lines) |
| Potrace 1.16 (Peter Selinger's black-and-white tracer) | C | esm-potrace-wasm 0.5.1 (Emscripten, the engine of SVGcode; GPL-2.0) — in `src/workers/vector.worker.ts`, fetched with the first black-and-white tracing | tosvg (black and white) |
| sheet: calamine 0.38 (read .xlsx .xlsm .xlsb .xls .ods) + rust_xlsxwriter 0.102 (write .xlsx; `dates`: ISO dates as dates, and a date in the form it was printed in — `{ date, format, shown }`) + csv 1 + serde_json | Rust | **us** (`wasm/sheet`, crates.io sources verified by `Cargo.lock`, target wasm32-wasip1) | sheet, pdf-tables |
| article: **dom_smoothie 0.20.0** (Mozilla Readability's algorithm in Rust, MIT; on dom_query 0.30 / html5ever) + ours: the article written as XHTML for an EPUB (`xhtml.rs`), Chrome's MHTML read (`mhtml.rs`: MIME headers, multiparts, base64, quoted-printable, encoded words) and Safari's web archive (`webarchive.rs`: Apple's binary property list) | Rust | **us** (`wasm/article`, crates.io via `Cargo.lock`, opt-level s, 1.1 MB; the author's npm build — dom-smoothie-js 0.16.0 — is a Node.js build four releases behind, with faults later releases fixed: `docs/WASM-AUDIT.md`, tab 183) | articles |
| svgo: **OXVG 0.0.9** (Rust port of SVGO's plugins; lightningcss for `<style>`) + our glue: DOCTYPE / entities allowed, nesting limit 256, **our own safe preset** (OXVG's `Jobs::safe()` is not safe), `sv_diff` (do two rasters look alike? — the tab renders every result next to its original and falls back to the safe result when the full optimisation changed the picture) | Rust | **us** (`wasm/svgo`, crates.io via `Cargo.lock`, opt-level z, 4.9 MB / 1.3 MB gz, loaded with the first SVG; unit `tests/unit/svgo.test.mjs`, hazard drawings `tests/fixtures/svg/hazards.json`) | svgo |
| keys — the **supplement** to hash-wasm for the key tabs (owner's tweak of 18 Nov 2026: what the existing module does not cover): lenient Base32 secrets, HOTP counters and truncation; checked parameters, random salts, PHC strings for scrypt / PBKDF2 and the reader of pasted hashes; RustCrypto **argon2** for Argon2 version 1.0 hashes (v=16 or no version, keyid / data), which hash-wasm does not read; RustCrypto **ssh-key** (OpenSSH Ed25519 generation), **aes + ctr + bcrypt-pbkdf** and our own OpenSSH wire reader (inspect Ed25519 / RSA / ECDSA / DSA keys, encrypted private keys, authorized_keys / known_hosts lines); API keys | Rust | **us** (`wasm/keys`, 0.31 MB; no existing WebAssembly module makes or reads OpenSSH key files) | totp, pwhash (with hash-wasm); sshkey, apikey |
| zxcvbn 3.1.1 (Rust port of Dropbox's estimator + its word lists) **+ our four fixes** (`wasm/zxcvbn/zxcvbn-fixes.patch`, applied by build.sh to the SHA-256-checked crate: ALL-CAPS words with a digit, repeats taken for sequences, single-character l33t words, keyboard-walk degree divided in integers) | Rust | **us** (`wasm/zxcvbn`, 2.2 MB, loaded with the first password; guesses + scores equal the Python reference for 304 passwords — `tests/unit/zxcvbn.test.mjs`) | pwstrength |
| formats: **serde_yaml_ng** (unsafe-libyaml = libyaml translated to Rust), **toml**, **jsonschema** 0.61 (no network/file resolvers) + own schema inference | Rust | **us** (`wasm/formats`, two modules: formats-yaml 0.42 MB, formats-schema 2.7 MB) | yaml, jsonschema |
| devcore: ipnet (CIDR), croner + chrono (cron; zone offsets from the browser's Intl via an `env.tz_offset` import, so no tz database), **own port of npm's semver** (`semver_npm.rs`: the package's range / comparator / inc logic with its own regular expressions on regex-lite — the nodejs-semver crate gave different answers), **own Unicode-aware glob matcher** (`globm`; globset matches bytes), **own unified-diff reader / applier** (`patchm`: offsets, white space, fuzz, like GNU patch; diffy refused most real patches), data-encoding + bs58 + own Ascii85/Z85 (long inputs go through data-encoding in pieces: it refuses 8 MiB and more on a 32-bit target), **own protobuf, MessagePack and CBOR readers** (`bin.rs`; rmpv and ciborium could not show CBOR `undefined` / simple values / long bignums or MessagePack's unused 0xc1, and reported errors as Rust debug text), x509-parser + sha1/sha2 (+ own PEM / PKCS #7 reader), **own SQL formatter** (`sqlfmt.rs`: a tokenizer for standard SQL, PostgreSQL, MySQL, SQLite, SQL Server and Oracle; changes white space and the case of keywords only and checks its result against the input — the sqlformat crate changed the meaning of SQL), own hex dump + search, **own lossless JSON reader / formatter** (`jsonfmt.rs`: changes white space only — member order, duplicate keys and number spelling kept; worded errors with line / column; JSON.parse → JSON.stringify reordered keys, dropped duplicates and rounded big numbers), **own JSON diff** (`jsondiff.rs`, RFC 6902 on that reader: lists aligned by equal elements (LCS) and records by `id`, numbers by value and never rounded), **own XML formatter** (`xmlfmt.rs`: re-indents elements that hold only elements, everything else byte-for-byte — declaration, DOCTYPE, entities, CDATA, text; the DOM round trip lost or rewrote all of these), **own JSON → types generator** (`j2t.rs`: TypeScript / Go / Rust serde / Java records / Python dataclasses; the e2e suite compiles its output with tsc, go, rustc, javac and python; crates unicode-ident (MIT / Apache-2.0 + Unicode-3.0) for Python identifiers and unicode-general-category (Apache-2.0) for what Go's struct tags accept) | Rust | **us** (`wasm/devcore`, crates.io via `Cargo.lock`, wasm32-wasip1; one `dc_call(op, input)` entry; **one module per tab** via Cargo features → `devcore-<feature>.wasm`, 67–650 KB) | cidr, x509, cron, semver, glob, patch, sqlfmt, hexview, baseenc, bindecode, base64 (devcore-enc), json + jwt (devcore-json), jsondiff, xml, json2types (devcore-j2t); numcheck (devcore-ids: **our Number Detective** — Verhoeff, Luhn and mod 36 / 97 / 11 checks, India Post's PIN directory, RBI's IFSC list, libphonenumber's Indian patterns on regex-lite, the ISBN ranges walked as stdnum's numdb walks them; no WebAssembly module checks Indian IDs: `docs/WASM-AUDIT.md`, tab 186); pdf-redact and idcopy (devcore-ids `ids:scan`: the numbers in a page's text); visitcard (devcore-ids `ids:tel`: a phone number as a card prints it → its calling code and country, E.164, and for an Indian number libphonenumber's kind, forms and place) |
| cmark-gfm 0.29.0.gfm.13 (GitHub Flavored Markdown) | C | **us** (`wasm/markdown`, source from the PyPI `cmarkgfm` sdist, SHA-256 pinned) | markdown |
| libyaml 0.2.5 + toml++ 3 | C / C++ | **us** (`wasm/formats`) | yaml |
| MuPDF 1.28 | C | Artifex (official `mupdf` npm) | all PDF tools, PDF → EPUB, PDF for Kindle (the pieces: the page grafted, redacted, drawn as a form), Watermark (PDFs: to-do #17), Book Page Flattener and Newspaper Clipper (their PDFs), EPUB Reader (EPUB, MOBI, FictionBook, comics, text laid out at any size with HarfBuzz and drawn — in the reader's worker, `src/workers/ebook.worker.ts`), Audiobook (a book's text: laid out on pages 100,000 px tall, its contents resolved to page and height — in `src/workers/bookread.worker.ts`; a PDF through the PDF → EPUB engine), PDF Redact (its redaction in two passes — the text by a band through each line, then pictures' pixels, drawings and a black box; comments and form fields baked first; the saved file read again), Safe ID Copy (an e-Aadhaar's pages drawn and their text read; the copy's PDF of pictures), Make PDF Searchable (each page's invisible text layer, `stampPage`; the password kept), PDF Compare (each page's characters with their boxes, the pages drawn, the changes written as comments), PDF Tables (each page's words and ruled lines, the pages drawn) |
| ExifTool 13.42 on zeroperl (Perl 5 compiled to WebAssembly with ExifTool's library inside) | Perl / C | Phil Harvey (ExifTool), uswriting / 6over3 (`@uswriting/exiftool` 1.0.9, `@6over3/zeroperl-ts` 1.0.10) — run in `src/workers/exiftool.worker.ts` | exif (replaced metacore's reader and stripper in Nov 2026: `docs/WASM-AUDIT.md`, tab 120); regex (the Perl flavour, the same module: `src/lib/regex/perl.ts`) |
| hash-wasm 4.13.0 (hand-tuned C → wasm, one small binary per algorithm, embedded in the package; streaming; HMAC over any of its hashes; Argon2, bcrypt, scrypt, PBKDF2) | C | Dani Biró (`hash-wasm` npm, ~10 M downloads a month) — wrappers `src/lib/hmac.ts`, `src/lib/totp.ts`, `src/lib/pwhash.ts`, `src/lib/hashes.ts` (in `src/workers/hash.worker.ts`); only the algorithms a tab uses are bundled into its chunk, loaded with the tab's first result | hash (23 algorithms), hmac (all of it), totp (the HMAC), pwhash (Argon2id / i / d, bcrypt, scrypt, PBKDF2) — replaced RustCrypto builds and crypto.wasm's hashes of ours in Nov 2026 (`docs/WASM-AUDIT.md`); ebook (a remembered book's fingerprint, XXH128 — to-do #40) |
| ONNX Runtime Web 1.31 (CPU/WebAssembly, SIMD) | C++ | Microsoft (official `onnxruntime-web` wasm build) | tts, audiobook and camreader (Kokoro, Piper — `src/lib/speech.ts`, one session a worker; the Audiobook runs one to four workers at once); scanner and idcopy (DocCornerNet LEAN, scanic-ml 0.2.0: the page's — a card's — corners — `docs/WASM-AUDIT.md`, tab 121); ocr, photodict and clipper (the same network, asked where the Kindle finder's outline is not a page's — to-do #18; and **PaddleOCR's PP-OCRv6 detector and recogniser, the second reader for soft photos** — owner, 26 Nov 2026: `src/lib/paddle.ts` in `src/workers/paddle.worker.ts`); noise (**DeepFilterNet 3**, the Studio voice — to-do #20: `src/workers/noise.worker.ts`); clipart (**U²-Net small**, rembg's u2netp: the subject cut out — `src/workers/vector.worker.ts`); cartoon (**AnimeGAN v2**'s Hayao, Shinkai and Paprika and the face portrait v2: the anime looks — `src/workers/anime.worker.ts`) |
| SQLite 3.54 | C | SQLite project (official `@sqlite.org/sqlite-wasm`), run in `src/workers/sqlite.worker.ts` (terminated on leave) | sqlite |
| Perspective 5.10 (the pivot engine: group by, split by, aggregates, filters, date expressions) | C++ (engine), Rust (client) | FINOS (official `@perspective-dev/server` and `/client`, Apache-2.0) — the engine in the package's worker script, its two WebAssembly files fetched by `src/lib/pivotengine.ts` and handed over once a page | slicedice (its median is not used: docs/WASM-AUDIT.md 202) |
| PCRE2 (pcre2-wasm 10.49.3: PCRE2 compiled by Emscripten, the WebAssembly inside the package) | C | gudoshnikovn (`pcre2-wasm`, MIT; PCRE2 BSD-3 with the PCRE2 exception) — in `src/workers/regex.worker.ts` | regex (the PCRE2 flavour: `docs/WASM-AUDIT.md`, tab 178) |
| Oniguruma (vscode-oniguruma 2.0.1) | C | Microsoft (`vscode-oniguruma`, MIT; Oniguruma BSD-2) — the build VS Code and Shiki run | regex (the Ruby flavour, with Ruby's rules beside it in `src/lib/regex/ruby.ts`) |
| Go's regexp (Go 1.24.7's standard library, GOOS=wasip1) | Go | **us** (`wasm/regexgo`, 2.6 MB — §5.1p; `re2-wasm` rejected: `docs/WASM-AUDIT.md`, tab 178) | regex (the Go flavour) |
| GNU regex (gnulib's regcomp / regexec, from GNU grep 3.12's source; glibc's are the same code) | C | **us** (`wasm/posixre`, 112 KB — §5.1q) | regex (the POSIX ERE flavour) |
| OpenJDK 21's java.util.regex + java.lang.Character with its Unicode data (the JDK's own source, packages renamed `ojdk.*`) on TeaVM 0.16.0's class library | Java → WebAssembly GC | **us** (`wasm/javaregex`, 0.86 MB — §5.1r; TeaVM's own java.util.regex is Apache Harmony's: other messages, other answers) | regex (the Java flavour) |
| .NET 10.0.15's runtime for browser-wasm (`dotnet.native.wasm`, Mono's interpreter, CoreLib) + System.Text.RegularExpressions, trimmed | C / C# | Microsoft (the official runtime pack `Microsoft.NETCore.App.Runtime.Mono.browser-wasm` from NuGet, published by `dotnet publish`; `wasm/dotnetregex`, §5.1s) | regex (the .NET flavour) |
| Biome 2.6.8 (formatter for JS / JSX / TS / TSX, CSS, SCSS, YAML, GraphQL; 70 MB) | Rust | Biome project (official `@biomejs/wasm-web`), run in `src/workers/codefmt.worker.ts` (terminated on leave) | prettier (Code Formatter) |
| dprint plugins: `@dprint/json` 0.26 and `dprint-plugin-markup` 0.28 (markup_fmt) — the JSON and HTML / Vue engines of `deno fmt` — behind the host `@dprint/formatter` 0.6 (JavaScript, 40 KB) | Rust | dprint project / g-plane (the plugins are published as WebAssembly: that is how dprint runs them) | prettier (Code Formatter) |
| FFmpeg | C | ffmpeg.wasm project | ffmpeg |
| MozJPEG, libwebp, OxiPNG, Squoosh's resize (Lanczos-3 in linear light) | C / Rust | jSquash (Squoosh codecs; `@jsquash/resize` since Nov 2026) | image encoders; resizing in the Image Editor and Batch Images (`docs/WASM-AUDIT.md`, tabs 109, 110) |
| libheif + libde265 | C++ | libheif-js | heic |
| Little CMS 2.16 | C | lcms-wasm (Matt DesLauriers; npm 1.0.5) — in the codec worker, fetched for a HEIC with a non-sRGB ICC profile | heic and every tab that opens HEIC: Display P3 → sRGB (`docs/WASM-AUDIT.md`, tab 111) |
| Tesseract 5 | C++ | tesseract.js-core | ocr, photodict, clipper (laid out as a page: its blocks), pdf-redact (a scanned page's numbers), idcopy (a card's numbers, through the reading path), pdf-ocr (each scanned page, through the reading path — never straightened), pdf-compare (a scanned page's words, the same way), pdf-tables (a scanned page's words, the same way), wifiqr (a router's label, through the reading path with the camera helpers' options — `SNAP_READ`), visitcard (a business card, the same way), deadlines (a paper's dates, the same way), billsplit (a restaurant bill, the same way), camreader (a page to read aloud, through the reading path with the OCR tab's options) |
| zxing-cpp | C++ | zxing-wasm | qr, barcode, scan, pdf-redact (QR codes and barcodes on the pages), idcopy (a QR that holds the number) — `src/lib/codesread.ts`; wifiqr (a QR code on a router's label read; the Wi-Fi code drawn — `src/lib/qrdraw.ts`); visitcard (a vCard or MECARD on a card read; the contact's code drawn); billsplit (each share's UPI code drawn) |
| 7-Zip 24.09 (`7zz`, the command line, Emscripten build with WORKERFS) | C++ | use-strict (`7z-wasm` npm 1.2.0) — run in `src/workers/sevenzip.worker.ts`, a fresh instance per archive | zip (zip and 7z with AES-256; `docs/WASM-AUDIT.md`, tab 107), unzip (reads every archive; tab 108), watermark (a Word document taken apart and zipped again: to-do #17), ebook (a CBR or CB7 comic unpacked into a zip for MuPDF) |
| MediaPipe Tasks (TFLite) | C++ | Google (official) | passport, bgremove, redact |
| RNNoise 0.2 (Xiph, BSD-3; the 0.2 model, 8-bit weights — the release as its configure builds it) | C | Jitsi (`@jitsi/rnnoise-wasm` 0.2.1, Emscripten; the "sync" file) — frames, lag and voice probability in `src/wasm/rnnoise.ts`, resampling / scaling / mixing in audio.wasm (`src/workers/noise.worker.ts`) | noise (replaced our own build in Nov 2026: `docs/WASM-AUDIT.md`, tab 144) |
| Browser-native C++ (WebCodecs, WebCrypto, Web Speech, MediaRecorder) | — | the browser | video (H.264/AV1 encode + decode, hardware-accelerated), audio recorder, tts, screencast, pbkdf2 |

JavaScript-only components (no C/C++ equivalent exists for the job):
| Library | Why JS | Used by |
|---|---|---|
| own `src/lib/curl.ts` (shell word splitting for bash and cmd.exe, curl option table, code generators) | no tried-and-tested WebAssembly build of a curl command-line parser exists (curl's own parser is tied to libcurl and its tool's globals); it is string parsing of one short line and code templating. A Rust port into devcore is part of the JS/TS → WebAssembly sweep (`docs/potentials.md` #74) | curl |
| OpenPGP.js 6 (LGPL-3.0) — both standards of the tab (GnuPG-compatible and RFC 9580) | the audited browser OpenPGP implementation (Proton Mail); no WebAssembly OpenPGP module exists, and the Rust one that could be built (rPGP) is low-level — which key to use and whether it is valid is left to the caller, and its semantics layer (rpgpie) is marked experimental by its authors: swapping it in would lower the tab's security (`docs/WASM-AUDIT.md`, tab 100; to look at again) | pgp |
| Mermaid 12 (MIT) | Mermaid exists only as JavaScript; `securityLevel: 'strict'` (labels sanitised), bundled by Vite | mermaid |
| draw.io 32.7.7 (Apache-2.0; its mxGraph inside; fetched at build time by `scripts/fetch-drawio.mjs`, not bundled) | no compiled diagram editor exists, and the owner allowed JavaScript for this tab (21 Nov 2026: "Even if it's JavaScript for this particular one, it's okay. Don't change the rule"); the real editor is hosted, not a clone (`docs/WASM-AUDIT.md`, tab 203) | diagram |
| Apache ECharts 6.1 (Apache-2.0; zrender BSD-3-Clause) | no WebAssembly charting library exists; tree-shaken to the nine charts and seven components drawn (0.72 MB, `src/lib/charts.ts`), PNG and SVG built in; the parts used make no code from strings (docs/WASM-AUDIT.md 202) | slicedice |
| Prettier 3 standalone (MIT) | Markdown: both WebAssembly Markdown formatters (Biome's, dprint's) change what a document renders to (`docs/WASM-AUDIT.md`, tab 54). And the fallback for text the WebAssembly engines of the other nine languages cannot read (owner's tweak: (b) an existing JS library for what the module does not cover); each parser is fetched only then | prettier |
| TensorFlow.js (Apache-2.0) | runs the Magenta style-transfer graph on the GPU via WebGL; its **wasm backend** (XNNPACK, C++ → wasm, tier 2 official build) is the CPU path | cartoon (neural) |
| zip.js (BSD-3) | zips larger than 7-Zip can hold in the browser's memory (above 1.5 GB of input, 256 MB on phones): zip.js streams; 7-Zip (7z-wasm) makes every other archive (`docs/WASM-AUDIT.md`, tab 107) | zip (large zips) |
| mediabunny (MPL-2.0) | MP4 muxing around the browser's hardware WebCodecs encoders; cutting audio without re-encoding (packet copy) | video, audio |
| — beside it, WebAssembly: @mediabunny/aac-encoder (libavcodec's AAC-LC) | the AAC encoder browsers without one lack (Linux Chromium, Firefox); fetched only then (`src/lib/aac.ts`) | video, slideshow, screencast, youtube |

**Audit of handwritten WebAssembly against existing modules (owner, 18 Nov 2026): `docs/WASM-AUDIT.md`** — per tab: our
module, the existing candidates (version, downloads), what failed or passed, the decision. Kept current as the bug hunt
moves on.

**Audit list (STANDING RULE #1)** — by the owner's 18 Nov 2026 wording, existing tried-and-tested WebAssembly
builds are the first choice and stay as they are (jSquash MozJPEG/libwebp/OxiPNG, libheif-js, tesseract.js-core, zxing-wasm,
7z-wasm — 7-Zip, which replaced libarchive.js and zip.js's reading in Nov 2026 —, the ffmpeg.wasm core): **no replacement needed, just keep them at the latest stable version** (the
ffmpeg.wasm core is FFmpeg 5.1.4 and cannot run libvpx-vp9/libx265 single-threaded — a newer wasm build of FFmpeg, ours or
someone else's, would be an upgrade, not an obligation). What remains optional is moving **JavaScript** components to
WebAssembly where a route exists:
| JavaScript component | Possible WebAssembly route | Status |
|---|---|---|
| zip.js (AES-256 zip creation) | 7-Zip (7z-wasm) makes the archives since Nov 2026; zip.js only for zips that do not fit in memory | done (tab 107) |
| mediabunny (MP4/WebM mux + demux around WebCodecs) | minimp4 (C, CC0) muxer around WebCodecs | optional |
| semver (npm, used only by tests now — the Semver tab runs our Rust port of it in devcore-semver.wasm, checked against the package over 16,380 version × range pairs) | — | done |
| `src/lib/curl.ts` (cURL command parser, Nov 2026) | Rust module in devcore (`devcore-curl.wasm`) | waiting (`docs/potentials.md` #74) |
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
Nov 2026 (Percentage): `src/lib/percent.ts` — six formulas on two typed numbers, done on their decimals with one
division of whole numbers (no loop, no data).
Nov 2026 (Tip, Fuel, GPA, BMI's range, due date): `src/lib/smallcalc.ts`, `src/lib/health.ts` — a few multiplications
and one division each, checks and wording; BMI and BMR themselves are mathcore's.
Nov 2026 (Equation Solver): `src/lib/exact.ts` + `src/lib/equations.ts` — exact fractions on the browser's BigInt
(compiled big-number arithmetic, like JSON.parse or RegExp in this list): discriminants, elimination on at most 4 × 4,
Newton's step with exact residuals. mathcore's exact fractions are 64-bit and overflow here; the iterations and the
root search stay in mathcore.
Nov 2026 (Find & Replace): `src/lib/findreplace.ts` — the pattern and the replacement as the browser's RegExp wants
them (`docs/WASM-AUDIT.md`, tab 93: the same dialect as the Regex Tester); the search itself runs in the regex worker.
Nov 2026 (Line Tools): `src/lib/linetools.ts` — split, trim, a `Set` for duplicates, reading a leading number, and
`Array.sort` on the browser's `Intl.Collator` (compiled ICU, in the reader's language: `docs/WASM-AUDIT.md`, tab 92);
the shuffle is crypto.wasm's and the line lengths are textkit.wasm's.
Nov 2026 (Lorem Ipsum): `src/lib/lorem.ts` — reading the count, the `<p>` layout and the line under the text; the
text is textkit-lorem.wasm's (`docs/WASM-AUDIT.md`, tab 98).
Nov 2026 (OCR's second reader, PaddleOCR): `src/lib/paddle.ts` — RapidOCR's size rules (a few multiplications and Python's
rounding), sorting a page's few hundred line boxes, and the lines made into a reading (words, their boxes along each line,
the text in order); `expectedRight` in `src/lib/readpage.ts` — a table look-up per word. The networks are ONNX Runtime's,
every pixel loop, the box finding and the decoding imgproc.wasm's (`docs/WASM-AUDIT.md`, tab 122).
Nov 2026 (the OCR tab's lists, to-do #31): `src/lib/listtext.ts` — the reading's lines and the marks' boxes compared, a
list's label matched by a regular expression, the levels counted from where the items stand: string glue around the
readers' output; what each mark was and where it stood is imgproc.wasm's (`p_clear_marks` lists it — own C).
Nov 2026 (Screenshot's scrolling capture, to-do #28): `src/lib/scrollstitch.ts` — the bookkeeping of which rows of which
view join the picture, and the rows copied (`TypedArray.set`); every comparison of rows and pixels is imgproc.wasm's
(`p_scroll_sig`, `p_scroll_match`, own C — no WebAssembly module joins scrolled views).
Nov 2026 (Watermark's diagonal and documents, to-do #17): `src/lib/wmlayout.ts` — where a mark goes on a page (a few
multiplications and a rotation per mark); `src/lib/docxmark.ts` — which header part each section shows, and VML shapes put
into them: the XML is read and written by the browser's DOMParser and XMLSerializer (compiled C++), the zip by 7-Zip
(7z-wasm); `src/lib/docmark.ts` — PDF content-stream text around MuPDF, whose drawing of the glyphs gives their box and the
shadow (blurred by imgproc.wasm). No WebAssembly module edits a Word document in place (docx-rs, a Rust crate, builds documents
from its own model of them; a header changed in place, everything else byte for byte, is what a document needs —
`docs/WASM-AUDIT.md`, Watermark).
Nov 2026 (Newspaper Clipper, potentials #110): `src/lib/clipper.ts` — which of Tesseract's words make a headline, a block,
a story, and where each piece goes in the clipping: rules over a few hundred word boxes a page (glue around the reader's output,
as `src/lib/listtext.ts`); the pixels are imgproc.wasm's (unsharp mask, clean-up, ink regions), the order textcore.wasm's
XY-cut. No WebAssembly module finds a newspaper's articles (`docs/WASM-AUDIT.md`, tab 180). The pieces are copied out of a
page a row at a time (`TypedArray.set`) and made smaller by imgproc's resize.
Nov 2026 (PDF / EPUB → Audiobook, potentials #14): `src/lib/audiobook.ts` — MuPDF's structured text (and the PDF → EPUB engine's
XHTML) made into paragraphs and tracks: string glue and rules over a few thousand blocks a book (which block begins a chapter,
which line is a running head, which link is a footnote mark); the layout is MuPDF's, the speech ONNX Runtime's and
espeak.wasm's, the MP3 and its tags audio.wasm's (LAME). No WebAssembly module makes audiobooks (`docs/WASM-AUDIT.md`, tab 184).
Nov 2026 (SliceDiceGrapher, potentials #75): `src/lib/slicedice.ts` — numbers and dates read as sheets write them (regular expressions), the
clipboard's HTML walked for its cells and the values behind them, a pivot turned into Perspective's views and its answer into a table (a tree
of a few thousand rows ordered and shown as asked), the CSV and Excel cells, the presets and the graphs' options — glue around Perspective,
mathcore, sheet.wasm and ECharts; the pivot PNG is drawn by the browser's canvas (`docs/WASM-AUDIT.md`, tab 202).
Nov 2026 (Paper Deadlines → Calendar, potentials #77): `src/lib/deadlines.ts` — dates, times and amounts found by regular expressions, a
paper's lines made into sentences, dates counted on with the browser's Date in UTC, the iCalendar file written as text: string glue
around the readers' output (`docs/WASM-AUDIT.md`, tab 194).
Nov 2026 (the Settings page, to-do #39): `src/settings.ts`, `src/lib/settingsfile.ts` — values checked by a comparison or two, the browser's JSON, localStorage, IndexedDB and File System Access: nothing for an engine to do (`docs/WASM-AUDIT.md`, 201).
Nov 2026 (World Clock, potentials #73): `src/lib/worldclock.ts` — a city's line read, its id made, the words of a card, a zone's offset by
the browser's Intl a day at a time with a halving to the second for its next change: glue around Intl (compiled ICU), mathcore (`m_sun`)
and textcore's search (`docs/WASM-AUDIT.md`, tab 197).
Nov 2026 (Spell Checker, potentials #10): `src/lib/spelltext.ts` — the text cut into words by one regular expression, what is left alone
(addresses, digits, capitals, names) by a few more, positions moved after an edit: string glue around hunspell.wasm, which checks, suggests
and orders (`docs/WASM-AUDIT.md`, tab 198).
Nov 2026 (Camera Reader, potentials #81): `src/lib/readertext.ts` — a page's lines made into paragraphs and pieces (a few comparisons of
the words' boxes), sentences cut and printed matter made speakable by regular expressions: string glue around the readers' output;
`src/lib/sayer.ts` — the pieces' sound laid end to end on the browser's Web Audio (the voices are espeak.wasm and ONNX Runtime in the
Text-to-Speech worker) (`docs/WASM-AUDIT.md`, tab 196).
Nov 2026 (Bill Splitter by Photo, potentials #78): `src/lib/billsplit.ts` — a bill's lines sorted into items, charges and a total by
regular expressions, what does not add up said, the split written as text; the split itself is mathcore's (`m_bill_split`, own C —
`docs/WASM-AUDIT.md`, tab 195).
Nov 2026 (Visiting Card → Contact, potentials #89): `src/lib/visitcard.ts` — a card's lines sorted into a contact by regular expressions and
scores (labels, keywords, the letters' size, an e-mail address agreeing with a name), addresses split at their commas, the vCard written
and read as text: string glue around Tesseract, zxing-cpp, PaddleOCR and devcore-ids.wasm (`docs/WASM-AUDIT.md`, tab 193).
Nov 2026 (Router Sticker → Wi-Fi QR, potentials #88): `src/lib/wifilabel.ts` (a label's keys and values by regular expressions,
pairing by band), `src/lib/snaptext.ts` (the reading's words grouped by the gaps between them) — string glue around the OCR, zxing-cpp
and PaddleOCR; `src/lib/qrdraw.ts` draws zint's SVG on the browser's canvas (`docs/WASM-AUDIT.md`, tab 192).
Nov 2026 (PDF Tables → Excel, potentials #16): `src/lib/pdftables.ts` — a page's words from MuPDF's characters, a cell's text from
its words, tables of consecutive pages joined, amounts and dates read by regular expressions: glue around MuPDF, Tesseract,
textcore.wasm's finder (`table.c`) and sheet.wasm (`docs/WASM-AUDIT.md`, tab 191).
Nov 2026 (Make PDF Searchable, potentials #3): `src/lib/searchable.ts` — a word's place on the page (a turn and a scale) and the
text operators that write it (a few multiplications a word); the reading is the OCR's path, the writing MuPDF's (`docs/WASM-
AUDIT.md`, tab 189).
Nov 2026 (Safe ID Copy, potentials #93): `src/lib/idcopy.ts` — which characters a number's first 8 digits are (a count),
a regular expression for numbers in Aadhaar's shape, a QR code's text looked at, the stamp's words, pictures placed on A4 pages (a
few multiplications); the drawing is the browser's canvas; the finding, the reading, the codes and the PDF are devcore-ids.wasm,
DocCornerNet / imgproc, Tesseract, zxing-cpp and MuPDF (`docs/WASM-AUDIT.md`, tab 188).
Nov 2026 (PDF Redact, potentials #61): `src/lib/redact.ts`, `src/lib/redact-pictures.ts` — which characters a place covers (a
few comparisons per character box), the rectangles handed to MuPDF's redaction, and the PDF objects that hold hidden text named
and deleted: glue around MuPDF (the redaction, drawing and saving), devcore-ids.wasm (the finding), Tesseract and zxing-cpp; no
WebAssembly module redacts a PDF but MuPDF (`docs/WASM-AUDIT.md`, tab 187).
Nov 2026 (Articles → Kindle, potentials #106): `src/lib/articles.ts` — which file is what (its first bytes), the HTML's character set
(the browser's TextDecoder), a picture's addresses matched with the saved files' (the browser's URL parser), the EPUB's files
written as text and zipped by fflate; the article, its XHTML and the readers of the saved files are article.wasm's; the
pictures are drawn by the codec worker (MozJPEG, OxiPNG, Squoosh's resize). The cover is drawn by the browser's canvas.
Nov 2026 (the book step of the OCR tab and the Photo Dictionary, potentials #96): `bendOf` (a cubic evaluated at 64 points),
`isBook` (a few comparisons of the fit's numbers) and `stackPages` (rows copied with `TypedArray.set`) in `src/lib/readpage.ts`
— glue around imgproc.wasm's fit and drawing (`flatten.c`), which do the work.
Nov 2026 (the EPUB Reader's ▷ and "Remember book", to-do #40): `src/lib/ebookread.ts` — a page's text cut into paragraphs and
sentences by regular expressions (string glue around MuPDF's text, its search marking each sentence, and the voices); the
remembered books are a list kept by the Settings; the fingerprint is hash-wasm's XXH128.
Nov 2026 (the text copied as soon as it is read, to-do #38): `src/lib/clipwrite.ts` — the browser's Async Clipboard API
(a ClipboardItem with a promised text, writeText where that is refused); no engine has work to do.
Nov 2026 (Paste image, to-do #37): `src/lib/clipimage.ts` — the browser's Async Clipboard API, a choice among the formats
it offers and a file name; no engine has work to do.
Nov 2026 (Screenshot's area, to-do #24): `src/lib/areageom.ts` — the rectangle's arithmetic (where the frame stands, a
drag, a move, an edge) and the area copied row by row with `TypedArray.set` (a memory copy per row, no pixel computed);
`src/lib/areapick.ts` draws the frozen frame with the browser's canvas. No engine has anything to do here.
Nov 2026 (Key Codes, to-do #26): `src/lib/keycombo.ts` — a key event named as a combination and the bytes a terminal
receives: tables of key codes and names (xterm.js's rules, held to xterm.js itself), string glue around the browser's
KeyboardEvent; no WebAssembly module exists for it and none would have work to do (`docs/WASM-AUDIT.md`, tab `keycode`).
Nov 2026 (Morse Code): `src/lib/morse.ts` — a table of 62 codes, a look-up per character and a list of tone times for
the browser's Web Audio; no WebAssembly Morse module exists and none would have work to do (`docs/WASM-AUDIT.md`, tab 97).
Nov 2026 (Emoji & Symbols): `src/lib/emoji.ts` (records for the search engine, the pick of a skin-tone variant) and
`src/lib/emoji-support.ts` (ten characters drawn on the browser's canvas to see which emoji the device's font has); the
ranking is textcore.wasm's (`docs/WASM-AUDIT.md`, tab 96).
Nov 2026 (Fancy Text): `src/lib/fancy.ts` — the tables (which character stands for which: data, nothing to
compute) and `String.prototype.normalize` (the browser's ICU) for accented letters; the characters of a text with emoji
or another script are told apart by textkit.wasm (`docs/WASM-AUDIT.md`, tab 95).
Nov 2026 (Case Converter): nothing — the conversions are textkit.wasm's; `src/lib/caseconv.ts` holds the row names,
the tooltips and the cut of a long result for the screen.
Nov 2026 (Word Counter): the words of Thai, Lao, Khmer and Burmese stretches are cut by the browser's `Intl.Segmenter`
(its dictionaries; `src/lib/wordcount.ts`) and added to textkit.wasm's count — the part the engine does not cover.
Nov 2026 (Coordinates, Sleep Cycle): `src/lib/coords.ts` — reading a coordinate as a person typed it (one regular
expression on a short string) and writing it back; the sleep times are one subtraction of minutes per row. The
geodesic itself is geo.wasm.
Nov 2026 (CSV / Excel): `src/lib/sheetdata.ts` — the "Excel" files that are web pages or Excel 2003 XML are parsed by the
browser's DOMParser (its HTML5 / XML parser, compiled C++) and laid on a grid by our TS; a CSV's encoding is the
browser's TextDecoder; numbers shown with 15 digits (`toPrecision`); JSON in and out with JSON.parse / stringify.
calamine (sheet.wasm) reads neither format (docs/WASM-AUDIT.md, tab 137).
Nov 2026 (Python Scratchpad): `src/lib/termtext.ts` (what a terminal would show for the program's output: display
code that feeds the DOM), `src/lib/python-hints.ts` (one sentence per known error), `src/lib/tzinfo.ts` (the browser's
Intl answering the C library's questions about local time; the zone table it uses is data made by a script) stay in TS.
Third-party WebAssembly builds in use (accepted, see above): MuPDF, SQLite, MediaPipe Tasks, ONNX Runtime, RNNoise (Jitsi's build), Signalsmith Stretch, jSquash, libheif-js, tesseract.js-core, zxing-wasm, 7z-wasm (7-Zip), ffmpeg.wasm, hash-wasm, libsodium.js, Biome, the dprint JSON and markup plugins. Staying JS (no compiled
equivalent, reasons above): OpenPGP.js, Mermaid, TensorFlow.js; Prettier for Markdown and as the Code Formatter's fallback. (sql-formatter was replaced by a build of the sqlformat crate, and that in Nov 2026 by our own Rust formatter: `docs/WASM-AUDIT.md`, tab 53.)

### Approved data APIs (connect-src allowlist)
Add a host here and to the CSP `connect-src` in `index.html` (and the allowlist in `tests/e2e/no-external.e2e.mjs`)
only when a tool needs live data and the owner has accepted that tool. **Approved:**
| Host | Used by | What is sent | Why |
|---|---|---|---|
| `en.wiktionary.org` (Wikimedia REST: `/api/rest_v1/page/definition/<word>`) | `photodict` | one word | online fallback for words missing from the bundled dictionary (owner request) |
| `api.dictionaryapi.dev` (Free Dictionary API: `/api/v2/entries/en/<word>`) | `photodict` | one word | second fallback if Wiktionary has no entry or is down |
| `raw.githubusercontent.com` (a file of a public repository at a commit: `/<owner>/<repo>/<commit>/<path>`) | `diff` (to-do #14) | the repository, the file's path and a commit | the Text Diff's "a file of a public GitHub repository at two commits" — approved by the owner, 26 Nov 2026: "yes u may contact raw.githubusercontent.com and api.github.com in real time"; in the CSP since #14 was built (26 Nov 2026) |
| `api.github.com` (REST, no key: a short hash or a branch made a full commit, a path missing at a commit explained) | `diff` (to-do #14) | the repository, the path, the commits | what the raw files cannot say (60 requests an hour without an account, said when used up) — approved with the host above |
| `en.wikipedia.org` (Wikimedia REST: `/api/rest_v1/page/summary/<title>`) | `photodict` | one word, or the phrase the reader selected | a short summary under each word and phrase (owner, 21 Nov 2026; `src/lib/wikipedia.ts`; a switch turns it off) |
All are free, need no key or account, send CORS headers, set no cookies we read. **Live in the CSP** (`connect-src 'self' blob:
data: https://en.wiktionary.org https://api.dictionaryapi.dev https://en.wikipedia.org https://raw.githubusercontent.com
https://api.github.com` — Wikipedia since 21 Nov 2026, the two GitHub hosts since 26 Nov 2026);
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
  `frame-src 'self' https://www.youtube-nocookie.com` (the Diagram Editor's draw.io page; the YouTube player), `object-src 'none'`.
- Our wasm modules are WASI "reactor" modules (no Emscripten); `src/wasm/wasi.ts` is a tiny shim
  (`random_get` → `crypto.getRandomValues`, `fd_write` → console, everything else ENOSYS).

### Lazy dependencies per tab + release on leave (owner rule, Nov 16 2026)
Owner: "make the full site faster, more responsive and memory efficient — load dependencies from the site's host
**per app/tab, only when the user selects that tab**". Rules (enforced by `tests/e2e/lazy.e2e.mjs`):
1. **The shell loads no engine.** Home and category pages fetch only `index.html`, the entry JS/CSS and the icons they
   show (≈ 168 KB in 11 files on 28 Nov 2026, with the Settings' store; the test's budget is 180 KB): no `.wasm`, `vendor/`, `models/`, `data/` or font file.
   **A tab's own styles load with the tab** (27 Nov 2026 — the stylesheet had reached 86 of the start page's 180 KB): a rule
   whose classes only one tool module uses lives in a stylesheet beside it (`src/tools/<module>.css`, imported by the module —
   Vite loads it with the tab's chunk); `src/styles.css` keeps what the shell and the shared components use (56 KB built).
   `python3 scripts/split-tab-css.py` moves the rules that have become tab-only (54 tab stylesheets made the first time — 376
   of the 1,105 rules, each in exactly one place; every tab's first view, PC and phone, drawn the same before and after). Its
   rules, each learnt from a wrong first try (found by comparing screenshots of every tab): **a class is named in a string**
   ('…', "…", `…` — a variable called `el` is no class `.el`); **a class a file builds from a beginning** (`btn-${variant}`,
   `note note-${kind}`, `kb-key kb-${code}`, `'md-' + x`) counts as that file's for every class with that beginning (ghost
   buttons had borders, green notes went blue); **a rule stays when a later rule here of the same specificity, setting a
   property it sets, could style the same element** — a tab's sheet loads after this one, so the moved rule would win where
   it lost (`.kb-key { flex: 1 1 0 }` over `.kb-Space { flex-grow: 6 }`: the keyboard's wide keys narrow). Rules moved keep
   their order, @media blocks with them. A new tab's styles go straight into its own sheet (§8).
   **The icons come in two parts** (`scripts/gen-icons.mjs`, run before every build): `src/icons.gen.ts` — the icons named
   in the shell's files (`src/main.ts` and what it imports, not the tabs: the categories, every tab's icon, the header,
   the shared controls of `src/ui.ts`) — and `src/icons-tabs.gen.ts`, the tabs' own button icons (99 of 282, 15 KB), which
   the registry's loaders fetch with every tab (`withIcons` in `src/registry.ts`; one file, once a visit). An icon the map
   does not hold is drawn as a circle with `data-missing="<name>"`: the lazy suite fails on one on the start page or in
   any tab's first view, desktop and phone (27 Nov 2026: the start page had reached 181 KB with all 282 icons). The search box's
   engine (textcore.wasm, own instance via `newTextcore()`) **and the search keywords of all tabs** (`src/keywords.ts`,
   22 KB, by `loadKeywords()` in `src/registry.ts`) load when the box is first focused/typed in (`ensureSearch()` in
   `src/main.ts` → `initSearch()` in `src/search.ts`). Until then `kw` of every registry entry is empty: code that
   needs keywords (tests, `scripts/gen-toollist.mjs`) awaits `loadKeywords()` first.
2. **Opening a tab loads only that tab's code** (its dynamic-import chunk, < 400 KB). Engines, models, data files,
   fonts and workers load on **first use** — a file chosen, a button pressed, the first Enter — never at module
   load and never at mount, except where the tab's first view needs them. Allowed at open (listed with the reason
   in `AT_OPEN` in the test): our three small engines (mathcore/crypto/textcore ≤ 160 KB: live results as you
   type), invoice/rent/resume (MuPDF + Noto Sans: the live PDF preview is the main view), markdown (cmark-gfm,
   sample preview), terminal (BusyBox: the shell is ready at once), qr/barcode (zxing-cpp: drawn as you type),
   caption/watermark (fonts of the first preview), coords (geo.wasm, 36 KB: the sample distance), password, passphrase and dice (libsodium.js, 0.53 MB: the first passwords, the first roll; the EFF word list, 62 KB), case
   (textkit.wasm, 0.21 MB: the sample sentence in all its conversions), diff (textkit-diff.wasm, 0.71 MB: the sample
   pair compared), cidr/cron/semver/glob/patch (their devcore-<tab>.wasm: the
   sample is computed live), json/jwt/xml/json2types/jsondiff/base64 (their devcore module: the sample is formatted,
   decoded, compared or converted at once), mermaid (the sample diagram), graphviz (the sample graph: its module
   and worker), diagram (draw.io in its own page: the editor is the tab's first view). Adding to that list needs a reason in the test.
   Examples of deferral: bc console starts BusyBox on its first Enter; Image Editor instantiates imgproc with
   the first photo; CSV/Excel loads sheet.wasm with the first file; Photo Dictionary loads the word list and
   Literata while OCR runs; PDF tabs load MuPDF when a PDF is chosen; the OCR tab and the Photo Dictionary fetch the Doc
   Scanner's page network (its worker, ONNX Runtime and DocCornerNet) only for a photo whose page the Kindle finder
   cannot outline (to-do #18), and PaddleOCR, the second reader (its worker and 31.2 MB of models), only for a photo
   Tesseract reads unsurely (owner, 26 Nov 2026); the Noise Remover fetches DeepFilterNet 3 (8.6 MB) only when Studio
   voice cleans something (to-do #20).
3. **Release on leave** (`src/lifecycle.ts`): engine loaders are made with `lazyEngine(key, load)` (one promise for
   every caller, forgotten when the tab is left — **and when the load fails, so that the next call tries again**;
   `.reset()` after a trap) or register `onLeave(key, release)` themselves; workers are created
   through `trackWorker(worker, key, onEnd)`. `main.ts` `teardown()` calls `releaseAll()` on every navigation:
   workers are terminated (imgproc, codec, crypto, style-transfer, OCR, bc), cached wasm instances are dropped
   (textcore, mathcore, metacore, markdown, sheet, sodium, imgproc direct), MediaPipe tasks are `close()`d,
   dictionary tables/shards and PDF fonts are dropped. Pending calls of a released worker are dropped silently
   (the tab is gone; no stray error toast). Coming back re-creates them (HTTP cache makes it fast).
   `globalThis.__superutilsLive()` → `{ workers, resources }` (used by the test: 0 after leaving).
4. **Limitation:** libraries that load into the main thread as ES modules stay in memory until the page reloads
   (the browser never unloads an imported module): MuPDF (its wasm heap), zxing-cpp, the MediaPipe runtime,
   libheif, OpenPGP.js. Their *data* is released; only the code/heap stays. Moving MuPDF into a worker (so it can
   be terminated) is a possible later improvement — the EPUB Reader does so already (`src/workers/ebook.worker.ts`: the
   book and MuPDF's heap end with the worker when the tab is left). **In a module worker, import a module with a top-level
   await (MuPDF waits for its WebAssembly) dynamically, after `onmessage` is set:** a message that arrives while a static
   import still waits finds no handler and is lost (the reader's first book never opened).
5. New tools: put every heavy import behind a function called on first use; wrap a wasm engine in `lazyEngine`;
   create workers with `trackWorker`; register caches with `onLeave`; never start work in `mount` that the first view does not show.

### Directory map
```
index.html                 app entry (CSP, root element)
src/main.ts                shell: router, nav, home grid
src/registry.ts            every tab (id, title, category, platform, loader); src/keywords.ts = their search keywords (lazy)
src/icons.gen.ts           GENERATED (scripts/gen-icons.mjs): the Lucide icons the start page shows; icons-tabs.gen.ts the tabs' own (with a tab)
src/lifecycle.ts           onLeave / trackWorker / releaseAll: free a tab's workers + engines when it is left
src/settings.ts            the Settings' store (one localStorage key a section, the file after every change); settingspage.ts the page (#/settings, lazy)
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
public/engines/            COMMITTED engines served as their build wrote them (dotnet-regex: wasm/dotnetregex/build.sh)
public/vendor/             GENERATED by scripts/vendor.mjs from node_modules (gitignored)
public/drawio/             GENERATED by scripts/fetch-drawio.mjs: draw.io 32.7.7, pinned by SHA-256, our page and scripts from scripts/drawio/ (gitignored)
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
(EMI, amortisation, SIP, FD/RD, PPF, EPF, NPS, prepayment), health (BMI, BMR, body fat, ideal weight),
colour (RGB ⇄ HSL ⇄ OKLCH, WCAG luminance / contrast, and `m_color` op 5: OKLCH → sRGB with the CSS Color 4 gamut mapping).
Finance since Nov 2026: `m_emi` and `m_amortize_yearly` in closed forms (see §3 "Finance calculators as built");
`m_gst` (GST on one amount in whole paise, forwards and backwards, 128-bit products); `paise()` reads an amount as it
is written with 15 digits (1.005 is 101 paise — also for the invoice lines); periods are clamped before they become
loop counts. `m_prepay` (out[7]: instalment, interest without and with the prepayment, months taken, the last
instalment, prepaid in all, 1 when a prepayment closed the loan; a loan is closed below half a paisa), `m_epf`
(out[5]: corpus, the member's and the employer's contributions, the pension-scheme share, interest — the EPFO's
method, see §3), `m_nps` (no silent floor on the annuity share; months clamped), `m_ppf` (years clamped).
`m_bill_split` (the Bill Splitter by Photo, 28 Nov 2026): a bill's items and extras split in whole paise — the exact shares as fractions
over one denominator in __int128 (overflow checked), the cumulative columns rounded by the largest remainder (§3 "Bill Splitter by
Photo"); beyond __int128 the same in double precision (returns 1). The module is 156.6 KB with it.
`m_sun(y, mo, d, lat, lon, out[3])` (the World Clock, 28 Nov 2026): sunrise, sunset and solar noon in minutes after 0 h UTC of that UTC date —
NOAA's equations exactly as astral 3.2 has them (two passes of the hour angle, zenith 90° + 32′ + the refraction at it, latitude held within
±89.8°); NaN for an event that does not happen, and the return value says whether the sun stays up (1) or down (−1). 159.5 KB with it.
`wasm/mathcore/build.sh` (exports every `API m_*` function). Expression engine since Nov 2026 (details in §3
"Scientific Calculator as built"): names without regard to case, one decimal point per number, no implicit product of
two numbers, nesting limit 100, exact trigonometry at round angles (`sind` / `cosd`, the "gap" rule in radians),
`power_fn` (real powers of negatives), `ncr` / `npr` by multiplying, Γ without overflow up to 171 and NaN at its poles,
divisions by zero and undefined values as NaN with a reason (`m_expr_why`: 1 division by zero, 2 outside the
function's domain — the graphing tab draws a gap there), decimal `round`, the bare-percent rule. `m_expr_plot(h, x0, dx, n, tol, y, join)` samples a curve for the graphing tab and marks which neighbours are
joined (see §3 "Graphing Calculator"). `m_quadratic` / `m_cubic` are W. Kahan's (1986): coefficients scaled by a power of two,
the discriminant with fma where its two products nearly cancel, the cubic's real root by Newton's iteration from a
start that cannot overshoot, then the quadratic that is left. TS wrapper: `src/wasm/mathcore.ts` (`bindMathcore`
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
autofilter, numeric text → numbers except leading-zero codes, column widths; a date in the form printed `{ date, format, shown }`; since
28 Nov 2026 a number in a number format `{ num, format, bold, shown }` and text in bold `{ text, bold }` — SliceDiceGrapher's pivots),
`csv_write`. Dates → ISO text; Excel
time-only cells → `hh:mm:ss`; ODS durations → `h:mm:ss`; encrypted workbooks and empty files get clear messages;
hidden sheets flagged. Imports only WASI random/clock/environ/fd_write/proc_exit (the browser shim and the unit
harness both implement a real clock). ~1.4 MB, loaded only by the PC-only `sheet` tab. Tests `tests/unit/sheet.test.mjs`
(33, real files from python-calamine's test data in `tests/fixtures/sheets/`).

### 5.1g audio → `src/wasm/bin/audio.wasm`
`ZIG=… wasm/audio/build.sh`: downloads `lame_4.0.orig.tar.gz` from the Ubuntu archive (lame.sourceforge.io is not
reachable from the sandbox; SHA-256 `3df5124d…` from Ubuntu's signed `lame_4.0-1.dsc`; LAME 4.0 = upstream release
of 2026-07-11), uses our `wasm/audio/lame-config.h` (from LAME's own configure run as a cross build), compiles
`libmp3lame/*.c` (no frontend, decoder, NASM or SSE) + `audio.c` with `-O2 -msimd128`, exports every `API a_*`.
~253 KB. TS wrapper `src/wasm/audio.ts` (`bindAudio`), worker `src/workers/audio.worker.ts`, client
`src/lib/audio-client.ts` (`audio(op, …)`, tracked worker). Tests `tests/unit/audio.test.mjs` (35: WAV bytes — every
16-bit value back as it was under both browsers' rules, peaks, resampler pass band + alias rejection, scale and mix, MP3
frame chain + Info/Xing tag). The WSOLA time stretch is gone (Nov 2026: Signalsmith Stretch, tab 145).

### 5.1h rnnoise — no longer ours (Jitsi's build since Nov 2026)
The Noise Remover runs `@jitsi/rnnoise-wasm` (docs/WASM-AUDIT.md, tab 144). What stays is the **native reference**:
`bash scripts/make-rnnoise-reference.sh` fetches `rnnoise_0.2+ds.orig.tar.xz` from the Ubuntu archive (xiph.org is
blocked in the sandbox; Debian's repack of upstream 0.2 incl. the trained model, SHA-256 `db2718ee…` from the signed
.dsc; model version `0b50c45` checked), compiles it with the system's cc as the release's configure would
(`-DDISABLE_DEBUG_FLOAT`: the 8-bit weights) on the generic C path (`-U__SSE2__ …`, as every WebAssembly build) —
`scripts/rnnoise-ref/os_support.h` supplies the `OPUS_CLEAR` macro that path includes but the release does not ship —
and runs `scripts/rnnoise-ref/driver.c`. **To update:** a newer `@jitsi/rnnoise-wasm`; if it carries another RNNoise,
point the script at that release and run both suites.

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

### 5.1j whisper — removed (owner, 20 Nov 2026)
Speech to Text and our whisper.cpp 1.8.3 build (`wasm/whisper`, `src/wasm/bin/whisper.wasm`) were removed at the owner's
word to make room on the site; the last commit that has them is `f1e9f21` (`git show f1e9f21:wasm/whisper/build.sh`).
**Big models** (still supported by `scripts/fetch-assets.mjs`): `scripts/assets.json` entries with `"split": N` are
verified, then stored as `<name>.0 … .k` (≤ N bytes) + `<name>.parts.json` (sha256, size, part sizes) and the whole file
removed, so no deployed file exceeds 100 MB.

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
`ZIG=… wasm/graphviz/build.sh` (≈ 4 min; needs a host C/C++ compiler, make and patch): **Graphviz 16.1.0** from the
project's own release archive (gitlab.com, package "graphviz-releases"; SHA-256 as published next to it — the archive
ships the generated parsers, so no bison / flex / cmake) and `expat_2.9.0.orig.tar.gz` from the Ubuntu archive (SHA-256
from the signed .dsc). Steps: our two patches are applied; a **native** autotools build of that source (without GTS,
Pango, zlib …; static) gives the exact list of sources per library and leaves the **reference tool**
`$WORK/native/cmd/dot/dot_static` (WORK defaults to /tmp/graphviz-build); the same files are compiled for wasm32-wasi
with our `config.h`, `expat_config.h`, `compat.h` (force-included: prototypes wasi-libc lacks — an implicit declaration
gets the wrong wasm signature and traps) and `fstreamshim.h` (VPSC's debug log stream); `cxxabi_stubs.c` (throw =
abort; flockfile no-op). Plugins are linked statically (`lt_preloaded_symbols`).
**Our changes (each file says why):**
- `storeline.patch` (lib/common/labels.c, one line): a label whose first line is empty left a text span
  uninitialised; freeing the label then called whatever stood in its `free_layout` — the native tool survives by luck
  (valgrind shows the read), every WebAssembly build traps. Worth reporting upstream.
- `triangulation.patch` + `st_delaunay.h`: lib/neatogen/delaunay.c gets a third branch beside "GTS" and "nothing" that
  takes the Delaunay triangulation from our C port of **Delaunator 5.1.0** (ISC) with the `orient2d` of
  **robust-predicates 3.0.3** (Unlicense); overlap.c, adjust.c and sfdpinit.c accept it where they ask for GTS → prism
  overlap removal and sfdp's smoothing. The port makes the arrays the original makes for every input (unit suite,
  against the npm package). Against a native Graphviz built with GTS, on 449 graph files: sfdp 447 identical, neato +
  prism 442, fdp + prism 432, twopi 382, circo 359 (points on one circle have more than one triangulation).
- `qsort.c` (glibc's merge sort: equal elements keep their order — Graphviz's comparison functions call different
  elements equal, and the order decides which layout is drawn) and `rand.c` (glibc's `rand()`; sfdp's starting
  positions): with them the module draws what `dot` draws on Linux.
- `-UNDEBUG` (**zig cc defines NDEBUG by itself at -O2**): the assertions stay in, as in the tool; a failed one is a
  trap at that check instead of a run with a null pointer, which WebAssembly does not notice. `-ffile-prefix-map`
  keeps the build directory out of the messages (and of the module).
- `glue.c`: `gv_layout(src, engine, index)` (several graphs in one text, read a line at a time like dot; the graph's
  own `layout=`; `charset` → UTF-8; messages with the line of the whole text), `gv_format(format)` any number of
  times on one layout (a failed format's job is cleared — Graphviz would run it again and end in exit(1)),
  `gv_done`, `gv_count`, `gv_engine`, `gv_version`, `gv_render` (the three in one); a fresh GVC context per graph;
  the "textlayout" plugin that asks the import `supertools.text_width(family, weight, style, stretch, size, text)`
  (a negative answer = Graphviz's own tables); for the tests `gv_delaunay`, `gv_rand`, `gv_sort_pairs`.
**Tests:** `tests/unit/graphviz.test.mjs` (686): 3,464 drawings of the native tool (240 graph files of the Graphviz
sources and 200 hazard graphs × 8 engines; `scripts/make-graphviz-reference.mjs`, `tests/lib/graphviz-ref.mjs`), the
triangulation against Delaunator and exact arithmetic, `rand()` against glibc's values, qsort against a stable sort,
prism against geometry, the measuring import against what the SVG says. Text measuring in a real browser is the e2e
suite's. **Do not install libgts-dev expecting the reference tool to change:** build.sh passes `--without-gts`.
Licences of what is compiled in: Graphviz EPL-2.0, Expat MIT, Delaunator ISC, robust-predicates Unlicense (public
domain); the two glibc routines are written anew from the published algorithm (no glibc code).

### 5.1m python → `src/wasm/bin/python.wasm` + `python314.zip`
`ZIG=… wasm/python/build.sh` (≈ 12 min on 4 cores; host C compiler, make, xz, patch): CPython 3.14.8, zlib 1.3.2, SQLite 3.54.1,
bzip2 1.0.8 and xz 5.8.4 from the Ubuntu archive, tzdata 2026.6 and the regex module 2026.11.19 from PyPI (all SHA-256 pinned).
**sqlite3, bz2 and lzma** (owner, 28 Nov 2026: "finish off the small choices" — the offer of 20 Nov): SQLite's amalgamation made by its
own build (its Jim Tcl — no Tcl needed) and compiled twice, for wasm32-wasi and natively (the native Python that makes the tests'
reference runs the same SQLite and options; liblzma too, so a compressor writes the same bytes); WASI has no file locking, mmap or
threads, so SQLite opens files with its `unix-none` VFS (one program, an in-memory file system), no WAL (`journal_mode=WAL` stays
"delete"), temporary tables in memory, single-threaded (`sqlite3.threadsafety` 0), FTS3/4/5, R-tree, maths functions and dbstat in,
local time from the host (as CPython's); `dbm` and `shelve` use `dbm.sqlite3`, as on a desktop. Configure's link checks add
`-lsqlite3`, so each library is named by its folder (`-L… -lsqlite3`) — an archive alone left `_sqlite3` "missing". +1.9 MB. A native CPython is built first (the cross build's "build Python"),
then CPython's **own** WASI configuration (`Tools/wasm/wasi/config.site-wasm32-wasi` + our `config.site.extra`: no
socket module; functions zig's wasi-libc declares but lacks) with zig cc (a wrapper drops `--stack-first`, which zig
rejects). `wasi_start.c` (linked in through LIBS, constructors): links the main thread into musl's thread list — zig's
single-threaded libc leaves it NULL and `pthread_key_delete` then loops forever at interpreter exit — and `chdir($PWD)`
(wasi-libc starts in "/"). Upstream sources unmodified apart from the changes listed below. The stdlib is compiled to .pyc by the same CPython version and
zipped without tests/IDLE/Tk/venv/ensurepip/curses (+ tzdata for zoneinfo, + `wasm/python/lib/*.py`); CPython finds `/lib/python314.zip`
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
  http.client, urllib.request; `lib/_superutils_asyncio.py` + `sitecustomize.py`: an asyncio event loop without
  sockets and threads (to_thread / run_in_executor run inline). `pydoc_data` (help("if")) and `dbm.dumb` (shelve) are
  kept in the zip.
- **Local time:** wasi-libc has no time-zone database. `wasi_start.c` renames `localtime_r` / `mktime`
  (`-Dlocaltime_r=supertools_localtime_r …`) to versions that ask the host (`supertools.tz_info` import, answered by
  `src/lib/tzinfo.ts`): the offset at a moment comes from the browser's Intl; tzdata's abbreviation and daylight flag
  from **`src/lib/tzabbr.json`** (`python3 scripts/make-tzabbr.py`, generated from the tzdata inside python314.zip:
  per zone "offset/isdst=NAME …" newest first, plus the periods in which the simple rule — daylight = the larger of
  the year's two offsets — is wrong, e.g. Moscow 2011, Lisbon 1996). The Python worker fetches the table with the
  interpreter. **Run make-tzabbr.py again after every rebuild of python314.zip with another tzdata.**
- **The regex module** (mrab-regex 2026.11.19, Apache-2.0 AND CNRI-Python; the Regex Tester's "Python (regex module)" and
  `import regex` in the Python tab): its C extension is compiled in as the built-in module `_regex` (`Modules/Setup.local`
  written before configure — a WebAssembly program cannot load an extension from a file, and makesetup cannot give a
  built-in a dotted name); its package is zipped with `regex_ext.py` as `regex/_regex.py`, which hands the package the
  built-in module. **`regex-wasm.patch`:** five functions were declared with fewer parameters than CPython calls them
  with (two getters, three METH_NOARGS methods); native code does not notice, WebAssembly traps on the indirect call —
  Pattern.groupindex, pickling, Match.capturesdict(), allcaptures(), allspans() (the unit suite calls each; worth
  reporting upstream). +0.8 MB.
- Absent, with a hint in the tab (`src/lib/python-hints.ts`): ctypes, curses, readline, compression.zstd, ssl,
  tkinter, turtle, mmap, fcntl, termios, pwd, grp, resource, syslog, venv, ensurepip (the unit suite checks that this
  list is exactly what fails to import); threads, processes, the network.
**The tab (`src/tools/software/python.ts`, worker `src/workers/python.worker.ts`):** output pane `src/lib/termtext.ts`
(a text model + a view drawn once per frame: \r / \b / ESC[K / clears / ANSI colours as a terminal shows them; the
last 600,000 characters on screen, of one line at most 200,000; Copy and Save output give everything); the worker
sends every write at once at a human pace, a flood in pieces a millisecond apart, and what is waiting at any system
call (`onCall`); stdin is handed over a line at a time and a line that answers a prompt is echoed (`stdinLines`,
`onStdinRead`); limits 32 MB of output / 30 minutes (`onAbort`); hints for errors particular to the tab; Enter keeps
the indentation; "All as .zip" for written files.
**Tests:** `tests/unit/python.test.mjs` (223) — 92 programs (`tests/fixtures/python/cases/*.py`: language, standard
library, uncaught errors, input, files, asyncio, local time in 20 zones; `datastores.py` — sqlite3 (types, errors, transactions,
functions of one's own, a database file's size and bytes, backup, serialize, FTS5 / FTS4 / R-tree, dbm and shelve, local time in four
zones), bz2 and lzma (the bytes they write at each level and check, streams made by the system's xz and bzip2 programs, files,
tarfile, zipfile, shutil)) must print what **native CPython 3.14.8**
prints, byte for byte on stdout and stderr (`tests/fixtures/python/reference.json`, made with the build's own native
interpreter: `$WORK/native/python scripts/make-python-reference.py`); local time against the zone files inside the
build for 51 zones × 575 moments; nested-call table; RFC 6070; host options; hints. `tests/unit/termtext.test.mjs`
(61, incl. 3,000 random streams against a cell-by-cell terminal). e2e `tests/e2e/python.e2e.mjs` (90).

### 5.1n geo → `src/wasm/bin/geo.wasm`
`ZIG=… wasm/geo/build.sh`: downloads `proj_9.9.0.orig.tar.gz` from the Ubuntu archive (SHA-256 `791a0610…` from the
signed `proj_9.9.0-1.dsc`), takes **only** `src/geodesic.c` and `src/geodesic.h` — Charles Karney's C implementation
of GeographicLib's geodesic routines, version 2.2.0, MIT, which PROJ ships unmodified — and compiles them with
`glue.c` as a reactor (36 KB). Exports: `g_inverse(lat1, lon1, lat2, lon2)` fills a static buffer (`g_out()`): metres
along the geodesic on WGS-84 (a = 6,378,137 m, 1/f = 298.257223563), the azimuths at both ends (−180 … 180), metres
and bearing on a sphere of the mean radius 6,371,008.8 m (haversine), latitude and longitude half-way
(`geod_direct` at half the distance); `g_version()`. No allocation, no imports beyond the WASI start-up. Wrapper
`src/wasm/geo.ts` (`bindGeo`, bearings turned to 0 … 360). Tests `tests/unit/geo.test.mjs` (69): 437 pairs within
20 nm of Karney's Python implementation (`tests/fixtures/geo/reference.json`; 352 of them confirmed there with
Vincenty's formula in mpmath), the example of geodesic.h (JFK → Changi 15,347,512.94 m), a quarter of the equator,
half a meridian, the date line, there and back. **To update:** a newer PROJ release in build.sh (URL + SHA-256
from its .dsc), check the version line, `python3 scripts/make-geo-reference.py`, both suites.

### 5.1o textkit → `src/wasm/bin/textkit.wasm` + `textkit-diff.wasm` + `textkit-lorem.wasm` + `textkit-tokens.wasm` (Rust)
`wasm/textkit/build.sh` builds the crate twice with `cargo build --release --locked --target wasm32-wasip1
--no-default-features --features <f>` (no zig needed): feature `text` → **textkit.wasm** (Word Counter, Case Converter,
line lengths), feature `diff` → **textkit-diff.wasm** (Text Diff; built with `opt-level = "s"`: the `similar` crate is
generic over every token type and algorithm — 0.71 MB instead of 0.9). Feature `lorem` → **textkit-lorem.wasm** (Lorem Ipsum, also
`opt-level = "s"`, 0.13 MB): `src/lorem.rs` on the **`lipsum` crate 0.9.1** (MIT) — `tk_lorem(unit, n, classic, seed32)` →
`{ paragraphs: [...], sentences, words }` (unit 0 paragraphs, 1 sentences, 2 words). The two texts are the crate's
own constants, cleaned and learned as circles (see §3 "Lorem Ipsum"). Feature `tokens` → **textkit-tokens.wasm** (PDF Compare,
`opt-level = "s"`, 0.20 MB): `src/tokens.rs` — `tk_tokens(a, lenA, b, lenB, limit_ms)`, each list one token a line →
`{ same, removed, added, approx, changes: [[start in a, tokens of a, start in b, tokens of b], …], moves: [[i, j, exact], …] }`
(see §3 "PDF Compare"); a module of its own so that the Text Diff does not carry the patience algorithm. Dependencies (crates.io, pinned by
`Cargo.lock`): **`unicode-segmentation` 1.13.3** (MIT / Apache-2.0; Unicode 17.0) and, for `diff`, **`similar` 3.2.1**
(Apache-2.0). `src/diff.rs`: `tk_diff(a, lenA, b, lenB, mode, limit_ms)` → JSON — mode 0 lines:
`{ added, removed, same, approx, rows: [[kind, lineA, lineB, [[marked, text], …]], …], unified, endA, endB }`, mode 1
words / 2 characters: `{ …, spans: [[kind, text], …] }` (kind 0 same, 1 only in the original, 2 only in the changed
text); mode 3 side by side (to-do #35): mode 0's answer with `rows` of `[0, lineA, lineB, parts]`, `[1, lineA, 0, parts]`,
`[2, 0, lineB, parts]` and `[3, lineA, lineB, partsA, partsB]` — a removed and an added line in one row (`pair_lines`: §3
"Text Diff", side by side); `approx` = the time limit ended the search for the line diff (not the marking or the pairing). Wrapper `src/wasm/textdiff.ts`. Our code
(`src/lib.rs`, ~250 lines): `tk_stats(text, len)` → JSON in `tk_out_ptr()` / `tk_out_len()`:
`{ words, chars, noSpace, sentences, paragraphs, lines, wordChars, bytes, top: [[word, count], …] }`; `tk_alloc` /
`tk_free`. The rules are those of §3 "Word Counter". `src/case.rs` (~260 lines): `tk_case(text, len)` → a JSON array
of the thirteen conversions of §3 "Case Converter", in the order of `CASE_NAMES` (`src/lib/caseconv.ts`). `tk_line_lengths(text, len)`
→ a JSON array: the characters of every line (Line Tools, "By length"). `tk_clusters(text, len)` → a JSON array: the length in
UTF-16 units of every character a reader sees, in order (Fancy Text cuts its own string with them). Speed: plain ASCII is counted without the segmenter (between
two ASCII characters there is always a cluster boundary, except inside CR LF); a stretch around other characters
goes to the crate. No imports beyond the WASI start-up. Wrapper `src/wasm/textkit.ts` (`bindTextkit`, `textkit()`).
**To update:** `cargo update -p unicode-segmentation` in `wasm/textkit`, build, run `node tests/unit.mjs wordcount`
— the comparison with ICU needs a Node whose `process.versions.unicode` equals the crate's Unicode version (the
suite says so when it has to skip it).

### 5.1p regexgo → `src/wasm/bin/regex-go.wasm` (Go)
`bash wasm/regexgo/build.sh` (needs Go ≥ 1.21; built with 1.24.7): `GOOS=wasip1 GOARCH=wasm go build -trimpath
-ldflags="-s -w -buildid="` of `wasm/regexgo/main.go` — Go's own regexp package as a WASI command run by
`src/lib/terminal/wasi.ts`: the request on stdin as "<byte length>:<bytes>" fields (pattern, flags, text, a replacement
or not, the replacement, every match, shown, counted), the answer as JSON on stdout (UTF-8 byte offsets of
FindAllStringSubmatchIndex, SubexpNames, ReplaceAllString or one Expand, the compile error with the pattern as typed).
No encoding/json on purpose (2.6 MB without it, 3.6 MB with it). The same source built natively is the reference of
the unit suite (`scripts/make-regex-reference.py`). **To update:** a newer Go, build.sh, the reference script, both suites.

### 5.1q posixre → `src/wasm/bin/posix-re.wasm`
`ZIG=… bash wasm/posixre/build.sh`: `grep_3.12.orig.tar.xz` from the Ubuntu archive (SHA-256 `2649b27c…` from the signed
`grep_3.12-1.dsc`); compiles its `lib/regex.c` (which includes regcomp.c, regexec.c, regex_internal.c — gnulib's regex,
the same code as glibc's) and `lib/malloc/dynarray_*.c` with `wasm/posixre/config.h` (GNU's own `config.hin` first —
its `_GL_ATTRIBUTE_*` blocks —, then what configure would find in wasi-libc; no GNULIB_LOCK: single-threaded) and
`glue.c`: `px_run(pattern, len, text, len, flags, shown, counted)` — regcomp with REG_EXTENDED (+ REG_ICASE, REG_NEWLINE)
in the C.UTF-8 locale, the walk of GNU sed's s///g with REG_STARTEND (the text before the start stays visible to \b and
back-references), JSON of UTF-8 byte offsets in `px_out()`. Stripped, 112 KB. **To update:** a newer grep source in
build.sh (URL + SHA-256 from its .dsc), the reference script (glibc's regex is the reference), both suites.

### 5.1r javaregex → `src/wasm/bin/java-regex.wasm` + `src/lib/regex/teavm-runtime.js`
`bash wasm/javaregex/build.sh` (≈ 1 min; needs `apt install openjdk-21-jdk-headless openjdk-21-source` — the same version,
because the unit suite's reference is that JDK's own java.util.regex — Maven and python3; TeaVM 0.16.0 comes from Maven
Central). Steps: **`prepare.py`** writes the sources: OpenJDK's `java/util/regex/*` and `jdk/internal/util/regex/Grapheme`
from the JDK's `src.zip` as `ojdk.util.regex` / `ojdk.internal.regex` (TeaVM has its own `java.util.regex` — Apache
Harmony's — which must not be the one compiled), the JDK's `java.lang.Character` with `CharacterData*` and `CharacterName`
as `ojdk.lang` (so `\p{…}`, case folding and `\N{…}` answer from the JDK's Unicode 15.0 tables, not TeaVM's), our glue
(`java/superutils/`: `RegexRun` — the run, shared with the native reference `Native` —, `Main` with the one `@JSExport`,
`Norm`, `Support`) and three generated classes: `Version`, `UniNameData` (the JDK's `uniName.dat`, 157,710 bytes, in
string constants — TeaVM loads no class-path resources) and `CombiningClass` (the JDK's canonical combining classes,
dumped by `Dump.java` from `sun.text.Normalizer`, for CANON_EQ). Its changes to OpenJDK's code are exact replacements
that must apply (`PATCHES`): VM annotations, the CDS archive and constant descriptors left out, `java.text.Normalizer` →
the browser's `String.prototype.normalize` through a JSO class (decompositions of assigned characters never change),
`ArraysSupport` → `Support`, `Class.getPrimitiveClass`, `sun.nio.cs`, the old `String(byte[], hibyte, …)` constructor,
and **`Pattern.namedGroups()` without `Map.copyOf`**: TeaVM's empty immutable map takes a remainder by its size in
`get()` and traps (`${x}` with no such group — found by the unit suite). **Maven** runs TeaVM (`pom.xml`, target
WEBASSEMBLY_GC). **`patch-runtime.py`** turns TeaVM's runtime (`wasm-gc-module-runtime.js` from teavm-core) into
`src/lib/regex/teavm-runtime.js` **without code made from strings**: TeaVM's JSO glue is made with the Function
constructor (eval — refused by a CSP without 'unsafe-eval'); each such place is a closure now, the one `@JSBody` script
TeaVM's classes ask for (`return str;`) is in a table, and the build fails if any `new Function` / `eval(` is left.
Note: TeaVM traps on an integer division by zero where Java throws ArithmeticException; `java.ts` gives a new instance
after any trap, and after a stack overflow (said in Java's words). WebAssembly GC needs Chrome 119+ (the tab is PC only).
**To update:** a newer JDK 21 source (apt), or TeaVM (`teavm.version` in `pom.xml`): build.sh, then the reference script
(`python3 scripts/make-regex-reference.py`), both suites; a patch that no longer applies names itself.

### 5.1s dotnetregex → `public/engines/dotnet-regex/_framework/`
`bash wasm/dotnetregex/build.sh` (≈ 1 min; needs `apt install dotnet-sdk-10.0` and nuget.org): `dotnet publish` of
`DotnetRegex.csproj` (`Microsoft.NET.Sdk.WebAssembly`, browser-wasm — no workload: Microsoft's prebuilt runtime from the
NuGet runtime pack) in a copy under `$WORK`, the `_framework` folder copied as it is to `public/engines/dotnet-regex/`
(committed: `dotnet.js` loads its siblings by name, so the files are served as published and the worker imports
`engines/dotnet-regex/_framework/dotnet.js` by its address). `RegexRun.cs` is the run (shared with the native reference
`native/`), `Exports.cs` its one `[JSExport]`. Trimmed; `UseSystemResourceKeys=false` (a trimmed build keeps only the
resource keys of its messages: "MakeException, (, 1, InsufficientClosingParentheses" instead of .NET's words);
`InvariantGlobalization` (the reference runs invariant too). **In a worker:** `dotnet.js` treats a worker as its
"sidecar" only when the worker has no `onmessage` handler — the regex worker has one, and `dotnet.create()` then waits
for ever after loading the assemblies; `src/lib/regex/dotnet.ts` sets `globalThis.dotnetSidecar = true` first. The
runtime's one Function constructor is in the debugger protocol's `callFunctionOn` (runs only with a .NET debugger
attached). **To update:** a newer `dotnet-sdk-10.0` (apt), build.sh, the reference script, both suites.

### 5.1t article → `src/wasm/bin/article.wasm` (Rust)
`bash wasm/article/build.sh` = `cargo build --release --locked --target wasm32-wasip1` (no zig): **dom_smoothie 0.20.0** (MIT,
crates.io, pinned by `Cargo.lock` with dom_query 0.30, html5ever 0.40 …) and our three files — `xhtml.rs` (the writer of the
article's XHTML and its text), `mhtml.rs` (MIME: headers unfolded, parameters, multiparts nested, base64, quoted-printable,
RFC 2047 words), `webarchive.rs` (the bplist00 format: objects, offset table, trailer; bounds-checked). Exports: `ar_read(html,
len, url, ulen, flags)` (flags 1 = the whole page, 2 = strict visibility) → JSON (the metadata, `xhtml`, `text`, `words`,
`images`, `dropped`, `readable`); `ar_mhtml` / `ar_webarchive(bytes, len)` → JSON of the parts and their bytes in `ar_blob_ptr()` /
`ar_blob_len()`; `ar_alloc` / `ar_free` / `ar_out_ptr` / `ar_out_len` / `ar_blob_free`. `panic = "abort"`: a panic is a trap,
the binding's engine is made again (`lazyEngine`). **To update:** `cargo update -p dom_smoothie` in `wasm/article`, build.sh,
`node scripts/make-article-mhtml.mjs` only if the pages change, both suites; Mozilla's own test pages (`git clone --depth 1 --branch
0.6.0 https://github.com/mozilla/readability`, test/test-pages) for a measure of the words kept.

### 5.1u hunspell → `src/wasm/bin/hunspell.wasm`
`ZIG=… bash wasm/hunspell/build.sh` (≈ 1 min): `hunspell_1.7.6.orig.tar.gz` from the Ubuntu archive (SHA-256 `4fa9c52a…` from the signed
`hunspell_1.7.6-3.dsc`); its time limits for suggestions (250 / 100 / 50 ms in `atypes.hxx`) made ten times as long — each line checked,
the build fails if Hunspell changes them —; its `std::ifstream`s replaced by `StdioStream` (`wasm/hunspell/stdio_stream.hxx`: C's stdio;
zig's C++ library for WASI has no file streams), which opens a file through `hunspell_open_file` — in the module the bytes handed over
with `hs_file` (fmemopen), in the reference `fopen`. `glue.cxx`: `hs_file` / `hs_unfile`, `hs_create(aff, dic)` (and the affix file's
REP lines kept for the order), `hs_add_dic`, `hs_spell`, `hs_suggest(h, word, ranked)`, `hs_freq(text)` (wordfreq's list for the order),
`hs_rank(h, word, list)` (the tests order what native Hunspell gave), `hs_add` / `hs_add_with_affix` / `hs_remove`, `hs_version`; words in
and out UTF-8. The script also builds **the native reference** from the same source, the same changes and `rank.hxx`
(`scripts/hunspell-ref/ref.cxx` → `$WORK/native/hsref`, 32-bit x86 with zig's C++ library, as wasm32 — Hunspell's word hash is a
`long`). **To update:** a newer Hunspell in build.sh (URL + SHA-256 from its .dsc), the time-limit lines, `python3
scripts/make-spell-reference.py`, both suites; new dictionaries: bump dictionary-en / dictionary-en-gb (`scripts/vendor.mjs` copies
them to `public/vendor/spell/`), `python3 scripts/make-spell-india.py`, the reference script, both suites.

### 5.1v vtracer → `src/wasm/bin/vtracer.wasm` (Rust)
`bash wasm/vtracer/build.sh` = `cargo build --release --locked --target wasm32-wasip1` (no zig): **vtracer 0.6.5** with **visioncortex 0.8.10**
(MIT OR Apache-2.0, crates.io, pinned by `Cargo.lock`) behind four plain exports (`wasm/vtracer/src/lib.rs`): `vt_alloc` / `vt_free`, `vt_trace(rgba,
w, h, color, cutout, mode, filter_speckle, color_precision, layer_difference, corner_threshold, length_threshold, max_iterations, splice_threshold,
precision)` → 0 and the SVG in `vt_out_ptr()` / `vt_out_len()`, or 1 and the message. WASI's random_get only (VTracer picks a key colour at random for
see-through pictures). 0.17 MB. **The reference:** the native command-line VTracer of the same version built on musl (`rustup target add
x86_64-unknown-linux-musl; cargo install vtracer --version 0.6.5 --target x86_64-unknown-linux-musl`, `$VTRACER`) — wasi-libc's maths functions are
musl's, so the two write the same SVG byte for byte. **To update:** bump the version in `Cargo.toml`, `cargo update -p vtracer`, build, rebuild the
reference with the new version, `node tests/unit.mjs vector`.

### 5.1e markdown → `src/wasm/bin/markdown.wasm`
`ZIG=… wasm/markdown/build.sh`: downloads the `cmarkgfm` 2025.10.22 sdist from PyPI (SHA-256 `5bec6100…`), which vendors
cmark-gfm 0.29.0.gfm.13 (latest upstream) plus its CMake-generated headers (`generated/unix`), and links all of
`src/*.c` (minus the CLI) + `extensions/*.c` + `glue.c` (`md_html(src, len, flags, &outlen)`: GFM tables,
strikethrough, autolinks, tag filter, task lists, footnotes; flags = smart punctuation, hard breaks; raw HTML and
unsafe URLs always suppressed). TS wrapper `src/wasm/markdown.ts`; tests `tests/unit/markdown.test.mjs` (25).

**Rebuild everything we compile ourselves:** `ZIG=/path/to/zig wasm/build-all.sh` (builds each module, then runs
the unit tests).

### 5.2 Image processing → `src/wasm/bin/imgproc.wasm`
Own C (`wasm/imgproc/imgproc.c`, and `wasm/imgproc/flatten.c` — the Book Page Flattener — which imgproc.c includes at its
end: it uses the component labeller; build.sh reads the exports of both files). `wasm/imgproc/build.sh` compiles with
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
| fflate | MIT | EPUB zip (PDF → EPUB, Articles → Kindle); SliceDiceGrapher's Download all |
| @perspective-dev/client 5.10.0, @perspective-dev/server 5.10.0 (Perspective — FINOS) | Apache-2.0 | SliceDiceGrapher (the pivots) |
| echarts 6.1.0 (Apache ECharts, with zrender) | Apache-2.0 (zrender BSD-3-Clause) | SliceDiceGrapher (the graphs) |
| *not a package — fetched by `scripts/fetch-drawio.mjs`:* draw.io 32.7.7 (draw.io Ltd / draw.io AG; draw.war of jgraph/drawio) | Apache-2.0 (the icons and stencils: not for use in or with Atlassian products; the templates CC BY 4.0; libavoid LGPL-2.1) — `public/drawio/LICENSE`, `README.txt`; not affiliated with draw.io (its trademark: the tab is "Diagram Editor") | Diagram Editor |
| *test only:* media.vsdx of the Python package vsdx 0.6.1 (a Visio drawing made with Visio) | BSD-3-Clause | the Diagram Editor's Visio file (`tests/fixtures/diagram/`) |
| @jsquash/jpeg (MozJPEG), /webp, /oxipng, /resize | Apache-2.0 (+ codec licences) | image encoders; resizing |
| @mediapipe/tasks-vision | Apache-2.0 | Passport |
| @tensorflow/tfjs-core, -converter, -backend-webgl, -backend-wasm (XNNPACK wasm), -backend-cpu | Apache-2.0 | Cartoonizer style transfer |
| tesseract.js, tesseract.js-core, @tesseract.js-data/eng, /fra, /spa, /deu | Apache-2.0 / MIT | OCR |
| zxing-wasm | MIT (zxing-cpp Apache-2.0) | QR |
| @zip.js/zip.js | BSD-3-Clause | Zip, Batch Images |
| 7z-wasm 1.2.0 (7-Zip 24.09) | LGPL-2.1 + unRAR restriction (the unRAR code may not be used to re-create RAR compression) | Create Zip, Extract Archive |
| @fontsource/anton (Anton font) | OFL-1.1 | Text on Image (meme style), Watermark |
| @fontsource/great-vibes, /dancing-script, /caveat | OFL-1.1 | Signature Maker (typed signatures) |
| @fontsource/literata (Literata, Google's reading typeface) | OFL-1.1 | Photo Dictionary cards |
| emojibase-data 18.0.0 (Unicode's emoji list with CLDR names and keywords; shortcodes of GitHub's gemoji and Slack's emoji-data) — a devDependency: `scripts/make-emoji-data.py` cuts it down to `src/lib/emoji-data.json`, which is what ships | MIT (the Unicode data: Unicode License v3) | Emoji & Symbols |
| onnxruntime-web 1.31.1 | MIT | Text-to-Speech (Kokoro, Piper), Doc Scanner (page finder), OCR and Photo Dictionary (the page finder; PaddleOCR) |
| scanic-ml 0.2.0 (DocCornerNet LEAN, the page-corner network; its own trimmed ONNX Runtime build is not used) | MIT | Doc Scanner |
| hash-wasm 4.13.0 | MIT | Hash / Checksum, HMAC Generator, TOTP, Password Hash Tool |
| pcre2-wasm 10.49.3 (PCRE2) | MIT (PCRE2: BSD-3-Clause WITH PCRE2-exception) | Regex Tester (PCRE2) |
| vscode-oniguruma 2.0.1 (Oniguruma) | MIT (Oniguruma: BSD-2-Clause) | Regex Tester (Ruby) |
| *built in:* Go's standard library (regexp, the runtime) in regex-go.wasm | BSD-3-Clause (the Go licence) | Regex Tester (Go) |
| *built in:* gnulib's regex (from GNU grep 3.12) in posix-re.wasm | LGPL-2.1-or-later | Regex Tester (POSIX ERE) |
| *built in:* regex 2026.11.19 (mrab-regex, PyPI) in python.wasm + python314.zip | Apache-2.0 AND CNRI-Python | Regex Tester (Python regex module), Python Scratchpad |
| *built in:* SQLite 3.54.1, bzip2 1.0.8 and liblzma (xz 5.8.4) in python.wasm (the modules sqlite3, bz2, lzma) | public domain (SQLite) / bzip2's BSD-style licence / 0BSD (liblzma) | Python Scratchpad |
| *built in:* OpenJDK 21's java.util.regex, java.lang.Character and its Unicode data (uniName.dat) in java-regex.wasm | GPL-2.0 WITH Classpath-exception-2.0 | Regex Tester (Java) |
| *built in:* TeaVM 0.16.0's class library in java-regex.wasm, and its WebAssembly GC runtime (`src/lib/regex/teavm-runtime.js`, patched) | Apache-2.0 | Regex Tester (Java) |
| .NET 10.0.15 runtime for browser-wasm and its libraries (System.Private.CoreLib, System.Text.RegularExpressions …), in `public/engines/dotnet-regex/` | MIT | Regex Tester (.NET) |
| libsodium-wrappers-sumo 0.8.4 (+ libsodium-sumo; libsodium 1.0.22 compiled to WebAssembly by its author) | ISC | Sodium Encrypt, Encrypted Share Link, Password Generator, Passphrase Generator |
| mediabunny | MPL-2.0 | Video Compressor, Audio Recorder (cut without re-encoding) |
| @mediabunny/aac-encoder 1.66.2 (FFmpeg's AAC encoder in WebAssembly) | MPL-2.0 (FFmpeg's code: LGPL-2.1) | Video Compressor, Slideshow, Screencast, YouTube Clip |
| @jitsi/rnnoise-wasm 0.2.1 (RNNoise 0.2 compiled to WebAssembly by Jitsi) | Apache-2.0 (RNNoise: BSD-3-Clause) | Noise Remover |
| signalsmith-stretch 1.3.2 (Signalsmith Stretch, WebAssembly + AudioWorklet) | MIT | Pitch & Speed |
| lcms-wasm 1.0.5 (Little CMS 2.16) | MIT | HEIC colours (Display P3 → sRGB) |
| esm-potrace-wasm 0.5.1 (Potrace 1.16 compiled to WebAssembly) | GPL-2.0 | Image to SVG (black and white) |
| *built in:* vtracer 0.6.5 and visioncortex 0.8.10 in vtracer.wasm | MIT OR Apache-2.0 | Image to SVG, Clipart Maker |
| *test only (apt / cargo / pip, not shipped):* potrace 1.16, librsvg's rsvg-convert, vtracer 0.6.5's command line, onnxruntime (Python) | GPL-2.0 / LGPL-2.1+ / MIT OR Apache-2.0 / MIT | the references of `tests/unit/vector.test.mjs` and the SVGs drawn in the e2e suites |
| dictionary-en 4.0.0, dictionary-en-gb 3.0.0 (SCOWL's en_US and en_GB-ise Hunspell dictionaries, wordlist.aspell.net) | MIT AND BSD | Spell Checker |
| *built in:* Hunspell 1.7.6 in hunspell.wasm | MPL-1.1 / GPL-2.0+ / LGPL-2.1+ (tri-licensed) | Spell Checker |
| @uswriting/exiftool 1.0.9 + @6over3/zeroperl-ts 1.0.10 (ExifTool 13.42; Perl 5) | Apache-2.0 (the packages); ExifTool and Perl: the Artistic License or GPL-1.0+ | EXIF / Photo Info |
| @biomejs/wasm-web 2.6.8 (Biome's official WebAssembly build) | MIT OR Apache-2.0 | Code Formatter |
| @dprint/formatter 0.6.0, @dprint/json 0.26.0, dprint-plugin-markup 0.28.0 (markup_fmt) | MIT | Code Formatter |
| prettier 3 | MIT | Code Formatter (Markdown; fallback) |
| *test only (devDependencies, not shipped):* typescript-classic (= typescript 5.9.3), postcss, postcss-scss, parse5, graphql, marked, @vue/compiler-sfc, yaml | Apache-2.0 / MIT / ISC | independent readers of the Code Formatter's suites |
| *test only:* delaunator 5.1.0 | ISC | the original that `wasm/graphviz/st_delaunay.h` (our C port, shipped inside graphviz.wasm) is held to |
| *test only:* change-case 5.4.4 | MIT | the reference of the Case Converter's code cases (`tests/unit/caseconv.test.mjs`) |
| *test only:* github-slugger 2.0.0 | ISC | the reference of the Markdown Editor's heading ids (`tests/unit/markdown.test.mjs`) |
| *test only:* @fontsource/comfortaa 5.3.0 (Comfortaa) | OFL-1.1 | a Kindle font of the owner's in the test photos of `scripts/make-kindle-photos.py` (Photo Dictionary) |
| *test only:* unicode-emoji-json 0.9.0 | MIT | another reading of Unicode's emoji list, which the Emoji tab's data is held to (`tests/unit/emoji.test.mjs`) |
| *test only:* @xterm/xterm 6.0.0 (its TypeScript source, transpiled in the test) | MIT | what a terminal receives for a key, which the Key Codes tab's "A terminal receives" is held to (`tests/unit/keycombo.test.mjs`) |
| *test only:* axe-core 4.14.1 (Deque's accessibility checker) | MPL-2.0 | `tests/e2e/a11y.e2e.mjs`: WCAG 2.2 A / AA on every page, desktop light and dark, phone dark |
| *test only:* @mozilla/readability 0.6.0 (Readability.js, Firefox's Reader View) | Apache-2.0 | `tests/e2e/articles.e2e.mjs`: the article Articles → Kindle finds, held to Firefox's |
| *test only (pip, not shipped):* faster-whisper 1.2.1 with Whisper base.en (OpenAI's model, CTranslate2's conversion) | MIT | `tests/lib/transcribe.py`: what the Audiobook's MP3s say, heard by an independent ear |
| *test only (pip):* mutagen, reportlab | GPL-2.0+ (mutagen), BSD (reportlab) | the MP3s' ID3 tags read back (`tests/unit/audio.test.mjs`); the Audiobook's test PDF made (`scripts/make-audiobook-books.py`) |
| *test only (pip):* pdfplumber (on pdfminer.six), openpyxl | MIT | PDF Tables → Excel: a second reading of the ruled statement's cells, the Excel file read back (`tests/unit/pdftables.test.mjs`) |
| *test only (pip):* vobject 0.9.9 | Apache-2.0 | Visiting Card → Contact and Paper Deadlines: the .vcf and .ics files read by an independent reader (`tests/unit/visitcard.test.mjs`, `deadlines.test.mjs` and their e2e suites) |
| *test only (pip):* codespell 2.4.1's list of common misspellings (dictionary.txt) | GPL-2.0 | the Spell Checker's order of suggestions fitted and measured (`scripts/make-spell-reference.py`; a part of it in `tests/fixtures/spell/reference.json`) |
| *test only (pip):* python-dateutil | Apache-2.0 / BSD-3-Clause | Paper Deadlines: dates read by an independent reader (`scripts/make-deadlines-reference.py`) |
| @expo-google-fonts/noto-sans (Noto Sans TTF: regular, bold, italic) | OFL-1.1 (package MIT) | PDFs made by GST Invoice, Rent Receipt, Resume Builder; EPUB Reader (its Sans) |
| @expo-google-fonts/literata 0.4.3 (Literata TTF: regular, italic, bold, bold italic — four files, 1.0 MB on the site) | OFL-1.1 (package MIT) | EPUB Reader (the text's font; MuPDF's FreeType reads no WOFF, so @fontsource/literata's files cannot serve) |

**The World Clock's cities** (`src/lib/worldcities.json`, `scripts/make-worldclock-cities.py`): GeoNames (geonames.org) — **CC BY 4.0:
attribution shown in the tab** — as geonamescache 3.0.2 (MIT) carries it. Test only (pip): astral 3.2 (Apache-2.0) — the sun's reference.

**The Number Detective's tables** (inside devcore-ids.wasm; `scripts/make-ids-data.py`): India Post's All India Pincode
Directory (Department of Posts, data.gov.in — **Government Open Data License – India: attribution**, shown in the tab) as cleaned
by @devzoy/indian-pincode 2.1.0 (MIT); RBI's IFSC lists via Razorpay's `ifsc` 2.0.50 (MIT; the data public domain);
libphonenumber's metadata and geocoding via `phonenumbers` 9.0.44 (Apache-2.0); the ISBN ranges and the IBAN registry via
python-stdnum 2.2 (LGPL-2.1+); credit-card-type 10.3.1 (MIT); gs1-prefix 1.0.0 (MIT); vininfo 2.0.0 (BSD-3-Clause). Test only:
india-post-pincode 1.0.0 (MIT) and gs1-prefix-code-to-country-code 1.0.3 (ISC) — second readings of the PIN directory and of
the GS1 prefixes; python-stdnum, phonenumbers and vininfo (pip) make the reference answers.

**Data files committed in `public/data/`**: EFF large wordlist (CC-BY 3.0); `dict/` — English Wiktionary via
wiktextract/kaikki.org (CC-BY-SA 4.0 + GFDL, Wiktionary contributors) and wordfreq 3.1.1 English frequencies (CC-BY-SA
4.0, Robyn Speer). Attribution is shown in the Photo Dictionary.

**draw.io is not committed either** (53 MB in 2,719 files): `scripts/fetch-drawio.mjs` (in `predev` / `prebuild`, after
fetch-assets) takes the release file draw.war 32.7.7 from the layer of draw.io's own Docker image `jgraph/drawio:32.7.7` that holds
it — Docker Hub serves a layer by its SHA-256 (the pin; no manifest is read, so no pull is counted) — else from the GitHub release,
checks the war against its pinned SHA-256, keeps it in `node_modules/.cache/superutils-assets`, and unpacks the editor's files into
`public/drawio/` with our changed page, `js/PreConfig.js`, `js/PostConfig.js`, `js/superutils-frame.js`, the licence and a README
(`scripts/drawio/`); it does nothing when `public/drawio/.superutils.json` says the same war and the same files of ours. **To
update draw.io:** the new version's war SHA-256 and size, and its Docker layer's digest (`curl` the tag's manifest from
`registry-1.docker.io` with an anonymous token: the layer whose history line is "COPY /tmp/drawio/build/draw.war /tmp"), in the
script; check the LEAVE_OUT rules against the new war's folders, `node scripts/fetch-drawio.mjs`, `npm run build`, `node
scripts/make-diagram-fixtures.mjs`, both suites (`diagram`).

**Models are not committed** (too large for git). `scripts/assets.json` lists each model's URL, pinned SHA-256,
size, licence and users; `scripts/fetch-assets.mjs` downloads them into `public/models/` (curl, retries) and refuses
any file whose hash differs. It runs automatically in `predev`/`prebuild` (so CI fetches them too); `npm run assets`
runs it by hand; `node scripts/fetch-assets.mjs --pin <name>` records the hash of a NEW entry once (review + commit).
Current entries (all Apache-2.0, Google MediaPipe, versioned URLs `…/float16|float32/1/…`):
- `mediapipe/blaze_face_short_range.tflite` (0.2 MB) — redact (and passport framing)
- `mediapipe/face_landmarker.task` (3.8 MB) — passport
- `mediapipe/selfie_multiclass_256x256.tflite` (16.4 MB) — passport, bgremove
- `paddleocr/PP-OCRv6_det_small.onnx` (9.9 MB) and `paddleocr/PP-OCRv6_rec_small.onnx` (21.2 MB) — ocr, photodict: the
  second reader for soft photos. **Apache-2.0** (PaddleOCR, PaddlePaddle; converted to ONNX by RapidAI). Not from a URL of
  their own: `"member"` entries — the file inside the **RapidOCR 3.10.0 wheel on PyPI**, the wheel's SHA-256 checked
  (`"archiveSha256"`, kept in `node_modules/.cache/superutils-assets`, never deployed), then the file's; the recogniser's
  alphabet (18,708 characters) is written beside it from the model's metadata (`"metadata": "character"` →
  `PP-OCRv6_rec_small.onnx.character.txt`: ONNX Runtime Web cannot read a model's metadata). RapidOCR's direction
  classifier (PP-OCRv4, 0.6 MB) is left out (§3 OCR, "The second reader").
- `u2netp/u2netp.onnx` (4.6 MB) — clipart: **U²-Net small** (Qin et al. 2020, Apache-2.0) as rembg ships it (`github.com/danielgatis/rembg` release
  v0.0.0, SHA-256 `309c8469…`); the subject of a photo cut out.
- `deepfilternet3/deepfilter.onnx` (8.6 MB) — noise (Studio voice): DeepFilterNet 3's v0.5.6 checkpoint as an FP32 ONNX graph
  (`huggingface.co/soniqo/DeepFilterNet3-ONNX`, revision 63d8ba44, SHA-256 `e1157049…`). **MIT** (DeepFilterNet by Hendrik
  Schröter and contributors, MIT OR Apache-2.0; the export published under MIT). The graph only — its signal processing is
  ours (`wasm/audio/studio.c`).
- `animegan/AnimeGANv2_Hayao.onnx`, `…_Shinkai.onnx`, `…_Paprika.onnx` (8.6 MB each) — cartoon (the anime looks): AnimeGAN v2's
  generators (Asher Chan / TachibanaYoshino, github.com/TachibanaYoshino/AnimeGANv2) — **free for non-commercial use** ("made
  freely available to academic and non-academic entities for non-commercial purposes": personal use) —, converted to ONNX by
  vumichien (Hugging Face, pinned revisions); `animegan/face_paint_512_v2.onnx` (8.6 MB) — the face portrait v2, **MIT**
  (bryandlee, github.com/bryandlee/animegan2-pytorch), converted by akhaliq. The tiles `public/data/anime/*.jpg` (committed, 23 KB)
  are what they make of the coffee photo (CC0) and the astronaut (public domain, NASA): `scripts/make-anime-reference.py`.
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
E2E_DIST=<folder> node tests/e2e.mjs …   # test another build (npx vite build --outDir <folder>): never rebuild dist under a run
E2E_TZ=Asia/Kolkata node tests/e2e.mjs … # every page in another time zone (the suites are written in UTC)
E2E_CHANNEL=chromium node tests/e2e.mjs … # the full Chromium (new headless mode) instead of Playwright's headless shell
DEBUG=pw:browser E2E_CHROME_ARGS="--enable-logging=stderr --v=0" node tests/e2e.mjs …   # why a page crashed
```
- `tests/unit/*.test.mjs` export `default async (t, { load, wasm })`; `t.ok/eq/near/throws`; `load()` = Vite SSR
  import of any `src/` module; `wasm(name)` instantiates `src/wasm/bin/<name>.wasm` with a WASI shim.
- `tests/e2e/*.e2e.mjs` export `default async ({ base, page, ok, download, tmp, devices })`; `page(opts)` makes an
  isolated context (console errors collected in `page.errors`; the Settings' file after every change off — `page({ settingsFiles:
  true })` keeps it on; a context is a private, Incognito-like profile: a test that needs a normal one launches it, as the Settings
  suite does).
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
- **Suites run on Linux and on the Windows runner** (to-do #13): a check that means one system says so with
  `asOS(page, 'windows' | 'linux')` (`tests/e2e/_os.mjs`: user agent, client hints, platform) — never by doing nothing;
  file names by `basename` / `join` (never `split('/')`); file hashes in Node (Git Bash's `sha256sum` escapes Windows
  paths and writes binary-mode lines — a reference list in `--text`); a Python snippet takes paths as arguments, not in
  its source (`\U…` is an escape); `import()` of a path through `pathToFileURL`; the gpg program from `$GPG`; native
  Python's output with `\r\n` turned back. `.gitattributes` (`* -text`) checks every file out as stored, on Windows too.
  A suite runs its reference tools through `tests/lib/child.mjs` (node:child_process with a time limit — 3 minutes unless
  a call sets its own — on the synchronous calls: every suite shares one Node process, so a tool that waits for ever, as
  Python's `getpass` does on Windows with a pipe for its input, stopped every suite of a run); a tool that takes a
  password reads it from its standard input when that is no terminal.
- `no-external.e2e.mjs` visits every route on desktop + phone (sharded) and fails on any request to another host,
  any CSP violation or any page error.
- **Sweeps over every tab** (Nov 2026): `touch-targets.e2e.mjs` — on a phone, the hit area of every visible control of
  every tab ≥ 44 × 44 px (measured with elementFromPoint), sliders ≥ 44 px tall, no sideways scroll; `a11y.e2e.mjs` —
  axe-core with the WCAG 2.2 A / AA rules on every page (desktop light and dark, phone dark: contrast, names, ARIA,
  keyboard access, 24 px targets); `tests/unit/css-vars.test.mjs` — every CSS custom property used is defined and
  every light colour token has a dark value. Colour of small text: `--hint` (≥ 4.5 : 1 in both themes), never
  `--faint` (icons and graphics only). A control without a visible label takes one (`select(…, label)`).
  `camera.e2e.mjs` — the camera beside every picture picker (owner rule, §2) and its photo reaching every tab.
  `scroll-focus.e2e.mjs` — what the browser scrolls into view lands below the sticky tab rows and, on phones, above a tab's
  fixed action bar (WCAG 2.2, 2.4.11 Focus Not Obscured): a control reached with Tab or Shift+Tab (Chromium centres it, so
  the rows hid it only when they took more than half the window — Software's open list on a laptop; Firefox and Safari
  align it to the edge) and anything `scrollIntoView()` brings in (to the top edge: under the rows, always). `html`'s
  `scroll-padding-top` follows the rows' height (`--navh`, kept by a ResizeObserver in `src/main.ts` — the rows fold, wrap
  and are hidden on the home page), `scroll-padding-bottom` makes room for the phone's bar.
  `junk-files.e2e.mjs` — an empty file and random bytes in every file picker: no tab may throw (text tabs read files
  with `readTextFile` from `src/lib/textfile.ts`: UTF-16 by its mark, UTF-8, else Windows-1252; binary refused).
  `engine-download.e2e.mjs` — every desktop tab with its engine's download refused: no uncaught failure (the shell says
  one nothing else caught, with "Try again"), and "Try again" works when the connection is back.
  **Blob URLs:** the harness records every blob URL a page makes and lets go; `released(page, id)` leaves the tab and
  returns what it still holds (a result kept in memory until the page reloads). Every tab that shows results from blob
  URLs checks it in its suite; a new one must too.
  **Big input:** a box that feeds a heavy step has a length (`maxlength`), a result box shows a part of a huge result
  and says so (Copy / Download give all), and work on a text above 200,000 characters waits for a pause in the typing.
- `tests/shoot.mjs <dir> <routes> [desktop|mobile|both]` takes screenshots for visual checks (phone = iPhone 13).
Playwright is the pre-installed global one (no `playwright install`); CI runs build + unit tests.

**Compute rule (owner):** algorithms and loops run in WebAssembly (own C where practical); TypeScript only builds
UI, formats output and does trivial glue arithmetic (unit factors, a single multiplication, Date/Intl handling).

**Deploy — from `main` (owner, 26 Nov 2026: "commit the current changes to the branch, then merge the branch to main,
push main, and start making subsequent changes to main, and also … tell GitHub to make the site live off of main"):**
`.github/workflows/pages.yml` builds and runs the unit suites on every push to `main` and publishes that build. **All
work is committed and pushed to `main` since 26 Nov 2026** (the working branch `claude/exciting-bohr-b9yfwc` was merged
into it — a fast-forward — and is no longer pushed to). **Live since 20 Nov 2026 at https://ddastoor.github.io/utils/**
(Settings → Pages → Source: GitHub Actions). GitHub lets a branch publish only when the `github-pages` environment allows
it: **the owner allowed `main` under Settings → Environments → github-pages → Deployment branches and tags on 27 Nov 2026**
(the session's tools cannot change repository settings; until then every deploy job from main was refused and the site
stayed at 1d5e8dc, published from the old branch). **Published from main since 27 Nov 2026** — the first: 754d1b5 (run 523,
its deploy job re-run once the setting was made). A push that passes the unit suites goes live within about four minutes;
a run whose deploy job was refused or failed is published by re-running its failed jobs (the build's artifact is kept).
GitHub's runner is Ubuntu 26.04 (`ubuntu-latest`): its coreutils are uutils (Rust), not GNU — a unit check that runs a
system tool must work with both. GitHub Pages limits: a published site ≤ 1 GB (512 MB on 20 Nov 2026, after Speech to Text was removed: 488 MB of room), 100 GB / month soft
bandwidth, 10 minutes per deployment.

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
1. Create `src/tools/<id>.ts` exporting `mount(root)`; use helpers from `src/ui.ts`. Its own styles go in `src/tools/<id>.css`,
   imported by it (§4: the start page carries only the shell's).
2. Register it in `src/registry.ts` (id, title, desc, category, icon, `platform`: 'both' unless the owner says PC
   only, or it genuinely needs phone hardware → 'mobile') and give it rich keywords in `src/keywords.ts` (the unit
   suite refuses a tab without a line there, and a line without a tab). Add search cases (`tests/search-cases.mjs`).
3. Heavy dependencies: dynamic-import inside the tool **on first use** (not at mount — §4 "Lazy dependencies");
   workers via `trackWorker`, caches via `onLeave` (`src/lifecycle.ts`); vendor runtime files via
   `scripts/vendor.mjs`; never load from a CDN; keep the CSP intact. `tests/e2e/lazy.e2e.mjs` checks every tab.
4. Add a smoke test in `tests/e2e.mjs`, update §2/§3 of this file, commit, push.
5. A tab that takes a picture uses `imageInput` or `imagePicker` (`src/lib/imgtools.ts`): the camera — the phone's, the
   PC's webcam — comes with it (owner rule, §2); `tests/e2e/camera.e2e.mjs` checks every picker.
