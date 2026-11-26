# Hand-off notes — read after CLAUDE.md and docs/RESUME.md

Written at the end of the long session of **16 Nov 2026** (session that built Media + the per-tab test suites) so the next
session knows everything that was only said in chat. CLAUDE.md = rules and spec, RESUME.md = status and next steps,
this file = the owner's latest wishes, how the tests are written, and the traps already found. Keep it current.

## 1. The owner (from chat)
- **The order after #13 (owner, 26 Nov 2026):** "After #13, start in your suggested order above of next todo items" —
  (1) quick wins #19, #25, #26, #27, #29, #30; (2) #18 OCR + Photo Dictionary; (3) sound #21 + #22 + #23; (4) Screenshot
  #24 + #28; (5) images #15, #17, #16; (6) #14; (7) #20 (docs/RESUME.md). Approved with it: #14 may contact
  raw.githubusercontent.com and api.github.com "in real time"; #27's folded app list is "remembered between visits like
  Favorites" (CLAUDE.md §1 rule 1, §3a).
- **Tests after a change: only the ones it needs (owner, 26 Nov 2026)** — "When you make a change, don't run the entire
  test suite. Just run whichever test suites or tests that you think is necessary. Run the full test suite only when I
  tell you to run the full test suite." The suites of what a change touches (and of the tabs that share a changed
  file); the complete unit + e2e suites, and the whole Windows check, only at his word (CLAUDE.md, STANDING RULE #2).
- Wants **"amazing", extensive test cases for every utility** — one independent e2e suite per tab with known answers,
  edge cases, invalid input, phone layout. Real app bugs found by tests are fixed in the app, never hidden in the test.
- Wants work to **continue autonomously** ("continue building everything out") and to be able to stop at any moment:
  commit + push after every finished group (at least every ~45 minutes, even WIP) and update RESUME.md each time.
- Uses a **desktop PC with Kubuntu** (X11/Wayland) and an Android/iPhone; lives in **India (IST, UTC+5:30)**.
- New-tab ideas: `docs/potentials.md` (54 ideas + 7 upgrades, 3 rounds + #54 draw.io) and the older `docs/IDEAS.md`.
  **Nothing there is accepted.** The owner asked to be **reminded** about it when the per-tab test work is finished
  (before starting the Software tabs) and at the start of a new session. The owner said **keep #21 Excalidraw** (as well
  as #54 Diagram Editor). The owner **removed** Chess (Stockfish), Python/JS Linter (Ruff/Biome) and Offline
  Translation (Bergamot) — never suggest them again.
- draw.io (#54) was checked: the `jgraph/drawio` LICENSE is plain Apache-2.0 (re-check the pinned version); do not use the
  draw.io name/logo as our branding; self-host the real app (not a clone), embed mode, no cloud/storage, PC only.
- Questions the owner asked and the answers given: closing the PC does not stop a cloud session; the "out of disk, memory
  or time" banner means this session's machine/time is used up (the fix is a new session — work is safe in Git); the
  previous session started this one with `create_session` and stopped itself so two sessions never edit the branch.

- **21 Nov 2026 — the Photo Dictionary matters most** (standing note at the top of CLAUDE.md): "it has to work extremely
  well on my phone, especially when I take pictures of my Kindle … my primary use case". His report: on the phone the
  OCR was worse than with the webcam — the same Tesseract on both; the phone's Snap is one frame of the live video. Asked
  for: his bad phone photo, a webcam shot and a camera-app photo of the same page ("Save this photo" saves what was
  read); not into the public repository.
- **21 Nov 2026 — how the potentials go from here (agreed):** "after all the to-dos, we'll start going through
  potentials.md. So you show me potentials.md apps. Then I will select either one app or a bunch of apps, and you build
  them out and then remove them from potential.md, and then we repeat this process." Before that: the offline voices in
  progress, to-do #5 (SuperUtils), the Regex Tester's flavours, the Photo Dictionary plan. Each pick gets the size check
  first (CLAUDE.md top).
- **21 Nov 2026 — Indic Parler-TTS refused the owner's token** (the message could not say why). Answered with the
  three cases (`whoami` tells them apart) and the fix for each; the script now checks the token right after it is given
  and names the case (CLAUDE.md, offline mode).
- **21 Nov 2026 — "is this stuck?"** The owner ran an offline speech script; after "== Parler-TTS: 1 voice" nothing showed
  for minutes (uv was installing PyTorch with `--quiet`). Fixed: uv's progress shows, each engine says what its first run
  downloads, driver.py says when it starts and what model it downloads.
- **21 Nov 2026 — the JS/TS → WebAssembly sweep moved to the potentials:** "for now move 'JS/TS → WebAssembly sweep' from
  to-do to potentials.md" → `docs/potentials.md` #74 (todo.md item 1 points there). Not to be started until the owner picks it.
- **21 Nov 2026 — rename:** "Also make a note to change this app's name from SuperTools to 'SuperUtils'" → `todo.md` #5 — **done 21 Nov 2026** (CLAUDE.md §1, "App name")
  (what it touches and the two points to settle are written there). A note, not started — the to-do rule applies.
- **17 Nov 2026:** asked for a second, exhaustive bug hunt over every tab ("don't leave out any app") and to
  "increase test coverage significantly for each app/utility" — tracker `docs/BUGHUNT.md`, method in RESUME.md.
- **17 Nov 2026 — engine rule, final wording** (CLAUDE.md STANDING RULE #1): "Existing tested WebAssembly builds from other
  people are preferred. If they are not there, build the WebAssembly module yourself from open-source source code. If
  that's not possible in the existing framework, or for the features needed, then use JS or TS — make a note."
- **17 Nov 2026 — `todo.md`** is the owner's to-do list (the owner calls it "to do"). First item: sweep the code again
  and move as much JS/TS as possible into WebAssembly modules, where doable. **The owner (17 Nov 2026): "Don't start
  doing the todo.md on your own. At some point, show me the items and ask me which ones to build out."**
- **18 Nov 2026 — audit + order of work per tab:** the owner had the 51 hunted tabs audited for handwritten
  WebAssembly that an existing module could replace (`docs/WASM-AUDIT.md`: HMAC → hash-wasm; everything else kept,
  reason per tab) and set the order for every later tab: **(1) existing-module check, entry in WASM-AUDIT.md →
  (2) bugs → (3) extensive tests → (4) fix and re-test → next tab.** A replacement always means re-running the
  tab's suites. How candidates are found: `curl "https://registry.npmjs.org/-/v1/search?text=<topic>%20wasm&size=60"`
  (`downloads.monthly`), keep packages that name both the topic and WebAssembly, then run the serious ones against
  our own reference cases in a scratch folder.
- **17 Nov 2026 — two standing rules, now at the top of CLAUDE.md:** #1 WebAssembly first (**order settled by the owner on
  18 Nov 2026**: first an existing tried-and-tested WebAssembly module, a famous good one — used only if it
  satisfies everything the owner asked for that utility; if there is none or none fits, our own
  build from open-source code — also ports of JS/TS-only functionality where possible; only then a JS/TS library as
  it is; everything hosted in the app). #2 Extensive tests for every utility: test, fix the bug or the test, test again.
- **20 Nov 2026 — languages:** "going forward, as far as languages is concerned, don't bother about hindi … make a note
  of this." No new Hindi work or tests anywhere (CLAUDE.md, top). Existing Hindi handling stays, untouched.
- **20 Nov 2026 — FFmpeg tab, more buttons (todo.md item 2, chosen by the owner):** the owner asked whether the FFmpeg
  tab covers the popular FFmpeg jobs with buttons (it does — 15 tasks, no command line needed; the command is shown
  only for information) and then: add buttons for the popular jobs that have none (join clips, subtitles, logo or
  text on video, volume, reverse, a thumbnail at a chosen time), search for more popular FFmpeg uses and add those
  too, then continue the bug hunt. Also asked: is there a famous existing WebAssembly FFmpeg — ffmpeg.wasm (in use)
  and libav.js (to be checked against it when the hunt reaches the FFmpeg tab, area "video").
- **20 Nov 2026 — Pandoc:** "include all the Pandoc uses when you come to the Pandoc app". The Pandoc tab is
  `docs/potentials.md` #4 (Document Converter), still waiting for the owner to pick it. When it is built, every popular
  Pandoc use gets a button, as in the FFmpeg tab (search the web for them first). The owner believed this had been
  asked earlier; no earlier record of it was found in the repository or this session's chat, so it is recorded now.
- **20 Nov 2026 — size check before every new app (standing rule, CLAUDE.md top):** "Whenever next new app I suggest
  from potentials.md, you do a rough calculation, tell me how much more space it will occupy, and potentially if you
  can get rid of an existing app to make space, and then I'll make a decision." The site was 763 MB of GitHub Pages'
  1 GB, 238 MB of it Speech to Text's models.
- **20 Nov 2026 — Speech to Text removed** (owner: "remove speech to text completely and remove auto subtitles
  completely" — to make room for apps used more often; the owner first checked that the models were not in Git: they
  never were, they are downloaded at build time). The tab, worker, whisper.wasm, `wasm/whisper`, the two model entries,
  its e2e suite and the JFK fixture are gone (last in commit `f1e9f21`); Auto Subtitles (#13) is off the potentials
  list. The site is now **512 MB** (488 MB of room); 175 tabs.
- **20 Nov 2026 — EPUB Reader** added to `docs/potentials.md` (#71, the owner's request): MuPDF on the site, ≈ 0 MB.
- **20 Nov 2026 — OCR camera:** "In the Images OCR app, add functionality to also take a photo with the camera if it's on
  the phone, or with the webcam if it's on the PC." Done as Passport Photo does it — a live view in the page with Snap —
  but as a shared part, `liveCamera` in `src/lib/livecam.ts`, for the other tabs that lack a webcam on PCs (Doc Scanner,
  Signature Maker, Sign PDF: offered to the owner, not started). Its tests: a stand-in camera that shows a sentence
  (`fakeTextCamera`, now in `tests/e2e/_camera.mjs`).
- **20 Nov 2026 — the camera everywhere (standing):** "In fact, in all apps that offer to upload an image, also add the
  option of taking a photo if it's a phone app, and take the photo with a webcam if it's a PC app … Do this for all
  apps also. Once finished, check in merge to main and push." Built into the shared pickers; a new picture picker gets
  it by using `imageInput` / `imagePicker`, and `tests/e2e/camera.e2e.mjs` fails on one without (EXEMPT: EXIF, SVG
  Optimizer, FFmpeg's main input, QR Scanner, Photo Dictionary — with reasons).
- **21 Nov 2026 — the camera rule repeated:** "make note of this new rule that wherever you need to upload a picture, an
  image, also have the facility of taking a photo with the phone's camera if the app is a mobile app, and taking the
  same with the PC's webcam if the app is a PC based app." Now a banner at the top of CLAUDE.md (standing rule).
- **21 Nov 2026 — EXIF and FFmpeg:** asked why some tabs had no camera, then: "i can't see the take a photo thingie for
  ffmpeg... and yes, also add it for exif too" — both have it now (FFmpeg beside its main picker too). Only the SVG
  Optimizer stays without one (SVG drawings).
- **21 Nov 2026 — OpenPGP:** "in the OpenPGP app, keep the existing functionality exactly the same and add another, new
  mode which uses the latest OpenPGP standard, which may or may not be compatible with GPG." References for its tests
  (not in the repository): `cargo install --locked rsop` (rPGP 0.21's SOP tool) and `cargo install --locked
  sequoia-sop --no-default-features --features cli,crypto-openssl` (Sequoia 2; needs libssl-dev).
  **Done (21 Nov 2026):** the "Standard" switch (GnuPG-compatible, unchanged; Latest standard (RFC 9580)). Run its
  suites with the tools: `RSOP=~/.cargo/bin/rsop SQOP=~/.cargo/bin/sqop node tests/unit.mjs pgp9580` and
  `… node tests/e2e.mjs pgp9580` (both find them on the PATH too; without them those checks are skipped with a note).
  SOP refuses to overwrite an output file (`--verifications-out`): give each run its own name.
- **21 Nov 2026 — PDF → EPUB, the owner's user testing:** "this PDF was rendered very badly … see if you can fix it, and
  if you can, please note it … after the OpenPGP thing … please do this PDF to EPUB stuff also." The files:
  AJUR_January_2016p5.pdf and the EPUB the tab made (uploaded in chat; ask again in a new session).
  **The owner's rule for it (21 Nov 2026):** side-by-side content goes top to bottom in the EPUB, spaced apart, each
  piece under a marker of our own — "Page 1, part 1", "Page 1, part 2" … — never words from the PDF (CLAUDE.md §3).
- **21 Nov 2026 — another potential app:** a World Clock, live ticking, city presets (New York, San Francisco, London, Mumbai,
  Sydney, Hong Kong, Singapore …), reusing the Time Zone Converter's code — docs/potentials.md #73 (waiting for the owner's pick).
- **21 Nov 2026 — a new potential app:** "PDF/EPUB creator … PC only … like a rich text editor … type, copy, paste, … embed
  another PDF … paste pictures, insert pictures … convert to either PDF or EPUB. Use all the existing functionality" —
  added to docs/potentials.md as #72 (not to build until the owner picks it; size check first: ≈ 0 MB new).
- **21 Nov 2026 — Text-to-Speech offline mode: BUILT** (CLAUDE.md §3 "Offline mode as built"). Later the same day the
  owner: only the mode is PC only, the tab stays PC + mobile; "Knock yourself out and include many more large,
  sophisticated models … US accent, UK accent … the Indian accent to be as light as possible"; then "include as many
  different variants of Indian, US and [UK] accents as you can, even if they are large in size … it doesn't affect the
  size of … my GitHub project." → 430 voices in 45 models, five engines; samples of the Indian ones sent for listening.
  **How to run an engine by hand** (what the unit suite's real-run option does for Piper): copy `src/lib/offline-tts/driver.py`
  into a scratch folder, write a job.json (voices as `buildJob` makes them: id, label, engine, repo, rev + the engine's
  fields), then `HF_HUB_DISABLE_XET=1 uv run --python 3.12 --no-project --with '<each pin of ENGINES[e].packages>' python
  driver.py job.json <engine> out`. The sandbox reaches PyPI and Hugging Face, not github.com or download.pytorch.org
  (so uv's own Python builds fail here: `UV_PYTHON_PREFERENCE=system`; PyTorch comes from PyPI with its CUDA libraries,
  ~5 GB in uv's cache). Hugging Face rate-limits this machine (429) after many requests — wait a few minutes.
  The earlier note: **(to build next, PC only):** first asked as a self-contained HTML; then the owner:
  "I intend that this runs entirely from the user's PC, not in the browser … find out whether this operating system is
  Linux or Windows, and appropriately download whatever is needed … give instructions … PC only. Okay, go ahead to build
  out this offline mode next whenever you get a chance." Plan: CLAUDE.md §3 Text-to-Speech, "Offline mode".
- **21 Nov 2026 — Text-to-Speech:** "the Indian accents … are too thick … thinner Indian accents with good diction and
  clarity? Are there such models out there?" — the current one is Piper's L2-ARCTIC (non-native speakers). Candidates told
  to the owner: Kokoro's Hindi voices hf_alpha / hf_beta / hm_omega / hm_psi reading English (0.5 MB each, already our
  engine), MeloTTS English speaker EN_INDIA (MIT; VITS2 ≈ 52 M parameters, ≈ 100–170 MB as ONNX), Kokoro fine-tunes
  for Indian English (jeevav62/kokoro-82m-indian-en, goonj-1-82M — licence and quality to check). Offered: listening
  samples of each, the owner picks by ear, then the size check.
- **21 Nov 2026 — Regex Tester:** "add … different regex styles that the user can select from. For example, Python,
  Perl, Python regex, Perl regex, or any other standard regex styles out there. Make a note of this and build it out when
  you get a chance." — noted in CLAUDE.md §3 (`regex`) and the RESUME queue, after the PDF → EPUB fix and the Photo
  Dictionary plan.
- **21 Nov 2026 — Photo Dictionary:** "Looks like you missed out the photo dictionary app" — it was mobile only, so a
  PC showed "made for phones"; asked, the owner chose PC + phone with the webcam: done (shared live camera). Then the
  owner's plan, to build after the PDF → EPUB fix (CLAUDE.md §3 Photo Dictionary, "To build next"): a live Wikipedia
  box under each word's dictionary meaning; as many words as are uncommon (fewer or more than 20); the complete OCR
  text shown first, where a phrase selected on the phone or the PC is searched on Wikipedia and added to the list.
- **21 Nov 2026 — Indian accents for the offline voices: enough looking.** "If you think you've covered the most important
  and widely used and best quality Indian accents for text-to-speech, then I think you can stop looking further for Indian
  accents for the offline mode of text-to-speech." — answered yes (AI4Bharat's Indic Parler, IISc's SYSPIN and Indic Tiny,
  Maya's Veena, goonj, Kokoro's Hindi voices, MeloTTS's Indian voice, Piper's Indian speakers, OmniVoice, Bark, Kyutai's 61
  Indian donations and the 60 Indian recordings in every engine that clones). No more searching: to-do #7 is finished by
  running the engines already listed (so a PC never downloads a model that fails), measuring the fast ones (Kyutai,
  XTTS-v2) for the ranking and marking the slow ones "not measured: too slow on the test machine" — unless the owner
  asks for every voice measured — then #8.
- **21 Nov 2026 — a full disk is no reason to stop:** "If the disk is full, clean out stuff that you don't need anymore
  and continue doing what you're doing in this environment." — delete what can be made again (dist/, build trees under
  /tmp, compiler and model caches, models of engines already run, `uv cache prune`) and carry on without asking. Keep
  what a running job or the next step needs (the survey's models, the voice recordings, the accent model).
- **21 Nov 2026 — the accent survey stopped, and the plan:** "if there are enough top Indian accents ranked, then can we
  stop the remaining ranking altogether and get on with building the other apps without loss of any functionality" —
  stopped at 104 voices (todo.md Done #7). Then: "Continue all the to-dos. Make regular sync points. Commit, check-in.
  Once you're done with all the to-dos, then we'll start iteratively looking at potentials.md to build out new apps." —
  the go-ahead for every open to-do (#8, #10, #12, #13).
- **21 Nov 2026 — wallpapers:** asked whether free, copyright-free wallpaper APIs exist — answered (Openverse with its
  CC0 / public-domain filter, NASA's image library, The Met and the Art Institute of Chicago open access, Wikimedia
  Commons' public-domain files; no key needed; Unsplash / Pexels / Pixabay need a key a static site would expose) and
  reminded that a Wallpapers tab was declined on 16 Nov (CLAUDE.md §2, "Rejected by the owner"). Nothing added unless
  the owner asks.
  **The same day the owner changed their mind: "I changed my mind. You can use the wallpaper tab. Make a note of
  this."** — wallpapers are allowed again; "Wallpapers from Wikimedia and Museums" (#115) and the "NASA Image
  Explorer" (#114) wait in docs/potentials.md (round 8, free online data) for the owner's pick, the size check and
  the approval of their hosts.
- **20 Nov 2026 — live:** the owner asked to merge into `main` and make the site live; Pages was switched on by the
  owner (Source: GitHub Actions). The repository's **default branch is `claude/exciting-bohr-b9yfwc`**, and Pages'
  environment lets only the default branch publish — so the site is published from that branch; `main` holds the
  same commits.

## 2. Status at hand-off (commit 5f87b87)
Own e2e suites now exist for **Calculators 27/27, Math & Science 7/7, Text 9/9, the 8 developer tabs (json, regex,
base64, urlenc, epoch, uuid, color, jwt), Security 5/5 (+pgp), Codes & Files 5/5**, plus all tabs built since Media.
**Update (same night, later session):** Everyday 9/9 and Device 11/11 suites written too — **every built tab now has its
own suite**. **Owner (later that night): "Finish all the original apps before asking me about potentials.md"** → build
the 47 Software stub tabs (each with its own suite) first, then ask about potentials.md. ~45 app bugs were found and fixed by the new suites — list in RESUME.md "Next steps" item 1.

## 3. How the suites are written (conventions)
- Run one suite: `npm run build && node tests/e2e.mjs <name>.e2e` (filter = substring of the file name). All:
  `node tests/e2e.mjs`. Unit: `npm test`. A suite exports `default async ({ base, page, ok, info, download, tmp, devices })`;
  `page(opts)` makes an isolated context (opts → `browser.newContext`, e.g. `{ timezoneId: 'Asia/Kolkata' }`,
  `{ permissions: ['clipboard-read', 'clipboard-write'] }`, `devices['iPhone 13']`); `page.errors` collects page errors
  **and console errors**.
- Helpers: `tests/lib/calc.mjs` (`calc(page)`: `set(label, v)`, `seg(label, option)`, `pick(label, value)`, `big(label)`,
  `row(label)`, `rows()`, `warn()`; `num()`, `inr()`), `tests/e2e/_pconly.mjs` (PC-only tab shows the desktop note on a
  phone), `tests/e2e/_scanback.mjs` (read codes in an image with the Scanner tab), `tests/lib/pdfcheck.mjs` (PDFs), `tests/e2e/_phone.mjs` (`phoneLayout(ctx, id, { ready, buttons, before })`: 390×844, no
  horizontal scroll, buttons ≥ 44 px, no page errors), `_mobileonly.mjs` (Mobile-only tab shows the note on a desktop),
  `_stats.mjs` (`chiUniform(counts)`, p = 1e-4 limit), `_phases.mjs` (Pomodoro/Interval under the fake clock),
  `_media.mjs` (`fakeMedia` init script: canvas camera + oscillator microphone, `window.__gumError`, `__tracks`;
  `allStopped`, `trackAudioContexts`).
- Independent answers: re-implement the formula/rule in the test (see emi, prepay, epf, coords, stats, matrix suites),
  use Node's crypto for hashes, Python for archives (`zipfile`, `tarfile`, `pyzipper`, `py7zr`) and the reference
  decryptor `tools/sodium_decrypt.py` (PyNaCl); randomness → chi-square (password suite); timers → `page.clock`.
- Phone check in every suite: `devices['iPhone 13']`, `document.documentElement.scrollWidth <= innerWidth`.

## 4. UI facts the locators depend on (src/ui.ts)
- `field(label, control)`: a native input/select/textarea is wrapped in `<label>` → `getByLabel` works. Anything else
  (password box with eye button, `outputBox`, segmented) is a `div role=group aria-label=label` → `getByLabel` returns the
  group; target the inner control: `page.locator('.field').filter({ has: page.locator('.field-label', { hasText: /^Label$/ }) }).locator('textarea')`.
- `toggle()` = `<label class="switch">` around a checkbox: click `page.locator('label.switch').filter({ hasText: 'Name' })`.
- `segmented()` = radios: `page.getByRole('radio', { name, exact: true })`.
- `outputBox()` = `div.outbox` (textarea + Copy button) — two "Copy" buttons may exist; scope to `.actions`.
- Password inputs (security tabs) carry `aria-label` → `page.locator('input[aria-label="Password"]')`.
- `button()` shows thrown errors (sync and async) as a toast **and** logs them with console.error, so expected validation
  messages appear in `page.errors` — filter them: `page.errors.filter((e) => !/expected message/.test(e))`.
- `filePicker()`: hidden `<input type=file>` inside `.drop` → `page.locator('.drop input[type=file]').setInputFiles(...)`.
- Formatting: `fmtN` drops trailing zeros (en-US, max decimals); `fmtINR` Indian grouping, negatives "−₹1,234", ₹0 not ₹-0.
- Router: same tab + changed own hash parameters → re-mounted (`?from=` ignored).

## 5. Traps already found
- **Media fixtures of one kind hide whole classes of faults** (to-do #23, 26 Nov 2026): every sound fixture was mono, so
  the FFmpeg tab's crash on stereo Opus (libopus 1.3.1 in ffmpeg.wasm 0.12, complexity ≥ 5: "memory access out of bounds")
  and the 3 dB loss of mono made stereo stayed unseen. `stereo.mp4` and `surround.mkv` (AC-3 5.1(side)) exist now — a
  new sound job is tried on mono, stereo and 5.1. Loudness is compared with EBU R128 *dualmono* (a mono file as heard on
  two speakers, as players play it); a trimmed result against the same part of the original; noise loses ~1.25 dB in
  any WSOLA speed change (not a fault — test speed on speech or music). The browser's FFmpeg is probed quickest with
  "Your own arguments" on a fresh page per command (one crash breaks the core for what follows).
- **The suites on Windows** (the Windows check, 26 Nov 2026): Playwright's `userAgent` option leaves
  navigator.userAgentData / platform saying what the machine is — `asOS` (`tests/e2e/_os.mjs`); `import('D:\\…')` is
  refused (use `pathToFileURL`); `split('/')` keeps a Windows path whole (`basename`); Git Bash's `sha256sum` writes
  `hash *name` and starts a line with `\` for a path with backslashes; `\U` in a Windows path inside Python source is an
  escape; Git Bash's gpg takes a Windows GNUPGHOME for a relative path (`tests/e2e/_gpg.mjs` gives it /d/a/… — every
  suite that runs gpg uses it); native Python writes `\r\n` and
  reads stdin in the ANSI code page (`PYTHONUTF8=1`), and its C runtime reads no IANA zone from TZ; Google Chrome on
  Windows ran an `<img onerror>` inside a DOMParser document (CSP-blocked) where Chromium here did not; Python's
  `getpass` reads the Windows console, never a pipe — a tool that takes a password must read stdin when it is no
  terminal, and a suite's synchronous child processes come from `tests/lib/child.mjs` (a time limit: one that waits for
  ever froze every suite of run 8).
- **Measuring a change to the OCR's reading** (owner: none may read worse): `OCR_IMGPROC=old.wasm node
  scripts/measure-ocr.mjs SET --prep read --paddle` against the tree's build on the same set at the same time (two shards
  each: `OCR_SHARD=k/2`), every photo's "words read right", "clean" and "stray" compared; the photo sets are made by
  `scripts/make-kindle-photos.py`, `scripts/make-format-docs.mjs` + `scripts/make-doc-photos.py` (see CLAUDE.md §3 OCR).
  A change that only adds information (the list of marks, to-do #31) is checked by comparing the cleaned pictures byte
  for byte instead. `OCR_LIST=DIR` dumps the OCR tab's text with its lists; `tests/lib/listscore.mjs` scores it against
  `<page>.lists.json`. On the measuring machine, CPU contention slows the e2e suites: run them after a measurement.
- **`OCR_IMGPROC=old.wasm` runs the old module with the tree's binding** (`src/wasm/imgproc.ts`): when the binding reads
  an output the old module never writes, the old build is measured with whatever stood in that memory. Found on 26 Nov
  2026: clearMarks reads `labels` (out[7]) since to-do #31; with an older imgproc.wasm it read 81 and the reading's
  decisions followed it (a Kindle photo 55.5 → 48.9 %, as if the change had cost it). The binding fills clearMarks'
  outputs with 0 before the call since then (an output an old module does not write reads 0: "nothing"); for any other
  change of a binding, measure the old build with the binding it was made for (a checkout of its commit, as #18 did with
  d456729).
- **A photo's reading depends on the photos read before it in the same process:** Tesseract's adaptive classifier keeps
  what it learnt from earlier pages (in the tabs too: one worker for the visit). newspaper-233 read 9.0 % alone and
  44.5 % after three other newspapers, by either build. Compare two builds with the same `OCR_SHARD` split (the same
  photos in the same order in each process), or each photo alone (`--only`); a comparison across different splits shows
  differences that are only the order (26 Nov 2026, to-do #31).
- **The Windows check's log:** its download link points at a host the proxy refuses, but the GitHub tool reads it —
  `get_job_logs` with `job_id` (from `list_workflow_jobs`), `return_content: true` and `tail_lines` (26 Nov 2026, run 12).
  A check that can fail only on Windows still says in its own message what is needed to understand it (which reader,
  the line under the text, where two texts part …). Windows' clipboard holds a line break as \r\n.
- **zig's wasm32-wasi libc** (single-threaded): an implicitly declared function gets the wrong wasm signature and traps
  at run time (force-include prototypes — wasm/graphviz/compat.h); the main thread's musl thread list is unlinked, so
  `pthread_key_delete` loops forever (wasm/python/wasi_start.c); the process starts in "/" whatever PWD says; zig cc
  rejects some linker flags (`--stack-first`, `--allow-multiple-definition`). C++ throw → `cxxabi_stubs.c` (abort).
- Graphviz keeps pointers to the strings passed to it and can leave a pending job after an error: copy the strings and
  use a fresh GVC context per call (wasm/graphviz/glue.c).
- Under the full parallel e2e run (8 suites at once) mermaid, noise, resume and stt can miss a timing/accuracy check;
  re-run those suites alone before chasing a bug.
- Playwright **drops files whose path is not ASCII** in `setInputFiles` — pass `{ name, mimeType, buffer }` objects.
- Playwright `fill()` is extremely slow with very long multi-line text (10,000 lines) — set `value` in `evaluate` and
  dispatch `input`.
- Don't put `await locator.textContent()` inside an `ok()` message when the element may not exist (30 s timeout crash).
- Audio timing: patch `AudioParam.prototype.setValueAtTime` with `addInitScript` and read the schedule (morse suite).
- Camera: replace `navigator.mediaDevices.getUserMedia` with a canvas `captureStream()` (scan suite).
- Debugging a page by hand: `npx vite preview --port 4173 &` and a scratch script using
  `createRequire('/home/user/utils/tests/e2e.mjs')('playwright')`.
- Fake clock (`page.clock.install` → `pauseAt` → `runFor`/`fastForward`): rAF-driven displays show the last *frame*
  (16 ms steps) — run a little past a boundary (e.g. `runFor(1100)` for "1 s later"). `fastForward` fires a due timer
  only once, so walk multi-phase timers one phase at a time.
- `E2E_STACK=1 node tests/e2e.mjs <suite>` prints the suite's line number when it crashes.
- A test that runs a child process against an HTTP server living in the test process must spawn it asynchronously
  (a synchronous child deadlocks the server).
- `page.goto` to the URL the page is already on (same hash) does not re-mount the tab — go to another tab first.
- Orientation events (level, compass) reach listeners only when the context has the `accelerometer`, `gyroscope`,
  `magnetometer` permissions. Real multi-touch: CDP `Input.dispatchTouchEvent` (synthetic PointerEvents break
  `setPointerCapture`).
- `element.style.left/transform` read back with 6 significant digits — compare with a relative tolerance.
- V8 JSON errors: "Unexpected token" messages have no position (JSON tab finds it by prefix search).

## 6. Machine setup
The environment "utils" has a setup script (added 16 Nov 2026) that installs `pynacl pyzipper py7zr` (pip --user),
Zig 0.17.1 at `/tmp/zig/x/ziglang/zig` and runs `npm ci`; the variable `ZIG` points at Zig. If a machine lacks them, run:
```bash
python3 -m pip install --user -q pynacl pyzipper py7zr bcrypt argon2-cffi zxcvbn requests
python3 -m pip download -q ziglang==0.17.1 --no-deps -d /tmp/zig && python3 -m zipfile -e /tmp/zig/ziglang-0.17.1-*.whl /tmp/zig/x && chmod +x /tmp/zig/x/ziglang/zig
export ZIG=/tmp/zig/x/ziglang/zig
```
Network allowlist of the environment (besides package registries): Hugging Face's hosts (models of the offline voices),
kaikki.org (the Photo Dictionary's data build), and since 21 Nov 2026 **download.pytorch.org + download-r2.pytorch.org**
(the offline speech scripts install PyTorch's CPU build with `uv pip install --torch-backend auto`; without them a
PyTorch engine cannot be tried here). Disk is a fixed allowance (about 10 GB free after clearing uv's cache of CUDA
wheels): delete a model's folder after its run; `uv cache clean <package>` frees packages, and the cached `uv run`
environments in `~/.cache/uv/archive-v0` (folders with a `pyvenv.cfg`) hold hard links to them.

## 7. Limits (usage / session time)
- Commit + push at least every ~45 minutes, with RESUME.md saying exactly what is half-done.
- If a usage limit is close, schedule a `send_later` to this session for just after the reset time.
- **No scheduled check-ins exist** (creating them was blocked by the session's permission check on 16 Nov 2026). If a
  session stops (usage limit, time limit), its pushed work is safe; the owner starts a new session with the standard
  message in RESUME.md ("Continue building SuperUtils…"), or the session schedules its own `send_later` before a limit.

## Bug hunt — lessons so far (17 Nov 2026)
- **Usage limit:** 12 reviewer sub-agents in parallel exhausted the owner's 5-hour limit before most had written a
  report. Review area by area in the main session; at most one helper at a time, and only for a narrow question.
- **What finds bugs fastest:** compare the tab with an independent reference in bulk (hundreds of cases), not with a few
  hand-picked examples: real `curl` against a local server, GNU `chmod` + `stat`, `openssl x509 -text`, Python
  `ipaddress` / `cryptography` / `hashlib` / `argon2-cffi` / `zxcvbn`, Node `crypto`, RFC appendices. Seeded generators
  live in `scripts/make-*-reference.py`; their JSON output is committed under `tests/fixtures/` so the tests stay
  hermetic.
- **Third-party engines have bugs too:** the zxcvbn crate needed four fixes (`wasm/zxcvbn/zxcvbn-fixes.patch`, applied
  to the checksum-verified crate at build time). Check a port against its reference implementation before trusting it.
- **Traps in the tests:** Playwright's `setInputFiles` cannot open a path with non-ASCII characters in this sandbox's
  C locale — pass `{ name, mimeType, buffer }`; run bash with `LC_ALL=C.UTF-8` when it must decode `\uXXXX`;
  `console.log` inside a unit suite shows only its first line — write debug output to a file.
- **Runner:** `node tests/e2e.mjs cidr chmod. x509` and `node tests/unit.mjs keys devcore` take several filters
  (`chmod.` = the whole name, so `chmod` does not also pick another suite).
- **Push often (owner, 17 Nov 2026 — CLAUDE.md STANDING RULE #3):** commit and push after every meaningful step; do
  NOT wait for the complete e2e run or for the whole utility. Before a push: `npm run build` passes and the suites of
  what was touched have been run. The COMPLETE e2e suite (`npm run build && node tests/e2e.mjs`, about 10 minutes; run
  nothing heavy beside it — cargo, tsc, probes make timing checks fail) runs at the end of each area; its fixes are
  pushed as their own commit.
  One lesson stays: a push goes live (GitHub Pages deploys the branch). Commit 277b640 changed the engine life cycle,
  was pushed after only the shell suites had run and broke Hash / Sodium Encrypt / Share Link on the live site. So when
  a **shared module** changes (`src/lifecycle.ts`, `src/ui.ts`, `src/main.ts`, `src/wasm/wasi.ts`, a worker client),
  run at least `shell every-tab lazy no-external` and the suites of the tabs that use it before that push, and the
  complete run right after.
- **Limits of 32-bit wasm show up only with big inputs:** `data-encoding` asserts `len <= usize::MAX / 512`, so Base64
  of an 8 MiB file trapped ("unreachable"). Try every file tool with a file of 8–10 MB and one of 64 MB+.
- **Recursion = stack overflow = a broken instance.** Any recursive parser or visitor in wasm (protobuf nesting, CBOR,
  MessagePack, SVG groups) needs a depth limit; after a trap the module's memory is in an unknown state and every later
  call fails, so the JS wrapper must drop the instance (`resetSvgo()` in `src/wasm/svgo.ts` is the pattern).
- **An optimiser must be checked by its output, not trusted:** OXVG's "safe" preset was not safe and its default preset
  changes 13 of 130 hazard drawings. The SVG tab now rasterises original and result and compares them (`sv_diff`,
  thresholds calibrated on 630 real icons at 256 px: plain mean differences up to 2.7 levels are harmless colour
  rounding; real changes show as > 0.4 % of pixels differing by more than 48 after a 3 × 3 neighbourhood match).
- **A waitForFunction that matches the previous state is a silent pass/fail lottery:** wait for text that only the new
  result can contain (a byte count, a file name), never for "a note exists". An idle machine is faster than the page.
- **`outputBox()` already has its own Copy icon** — adding a "Copy" button next to it gives two buttons with the same
  name (strict-mode failures in tests, and they can copy different things when the display is cut).
- **Keyboard handlers on `window` (Key Codes, Keyboard Test):** never `preventDefault` Tab, F-keys or Ctrl/Meta
  shortcuts, and let Enter / Space through when a button or link has the focus — otherwise the tab is a keyboard trap.
- **A "formatter" that parses and prints again changes the data.** JSON.parse → JSON.stringify reorders integer-like
  keys, drops duplicate keys and rounds numbers; DOMParser → serialiser drops the DOCTYPE, expands entities and (with
  indentation) trims text. A formatter must work on the text: tokens stay byte-for-byte, only layout white space moves
  (`wasm/devcore/src/jsonfmt.rs`, `xmlfmt.rs`). Test it that way: token streams equal, a second run changes nothing.
- **Generated code must be compiled in the suite**, not eyeballed: `tests/e2e/json2types.e2e.mjs` builds every output
  with tsc / go / cargo / javac / python and round-trips the sample (one invocation per language; Go packages and Rust
  modules per sample; caches in the OS temp folder). It found ten classes of code that did not compile.
- **Invisible characters in source:** `\u202e`, `\u2028`, `\ufeff` typed as escapes can arrive in a written file as
  the raw characters (a raw U+2028 ends a regex literal; rustc refuses raw bidi marks). After writing a test or source
  file that mentions them, check: `python3 -c "import re,sys; print(re.findall('[\u200b-\u200f\u202a-\u202e\u2028\u2029\ufeff]', open(sys.argv[1], encoding='utf-8').read()))" <file>`.
- **Playwright's fake clock:** `page.clock.install()` lets time run; use `pauseAt()` when a check needs a fixed
  "now". Under an installed clock `performance.getEntriesByType('resource')` is empty — ask
  `__superutilsLive().resources` instead to see which engine a tab loaded.
- **Round-trip tests need the reference's own limits:** Go's `omitempty` cannot tell null / {} / [] from absent,
  serde refuses duplicate keys, encoding/json has no tag for keys with a comma, a quote or a combining mark, Chrome's
  canvas clips out-of-gamut colours while CSS Color 4 maps them. Encode each such limit as an explicit exception list
  in the test, with the reason.
- **Text precision is a testable property:** HSL needs 1 decimal and OKLCH 2 / 5 / 2 decimals for every 8-bit colour
  to come back exactly — found by running the whole RGB cube (22 s in Node), not by choosing "enough" digits.

- **Choosing between existing engines (Code Formatter, 19 Nov 2026):** do not trust a README or a compatibility
  percentage — run every candidate over hazard texts *and* real files and let a parser that belongs to none of them
  read the result (`tests/lib/codefmt-check.mjs`). That is how dprint's TypeScript plugin (invalid JavaScript for one
  input), its YAML plugin (data changed) and three Markdown / HTML formatters (rendering changed) were found out, and
  how Biome's young YAML formatter earned its place (654 real files, none changed). Real files on this machine:
  `~/.cargo/registry` (YAML, Markdown, TS), `/opt/google-cloud-sdk` (YAML, HTML), node_modules, Python's and Ruby's
  docs; Vue sources come from npm tarballs (primevue 3, element-ui). `plugins.dprint.dev` is blocked here — dprint
  plugins are on npm (`@dprint/json`, `dprint-plugin-markup` …).
- **The reader must be stricter than the formatter, but not wrong:** every allowance in a reader has to be a rule of
  the language (Sass: `$a -$b` subtracts, `1 -2` is a list — sass-lang.com says so, my first guess said otherwise;
  CSS: `1px+2px` is two numbers; a `<text>` in SVG is the only place where white space shows). When all three
  formatters "fail" the same check, the check is the suspect; when one fails alone, it is the formatter.
- **Two engines joined by glue need a guard at the seam** (markup_fmt handing Vue expressions to Biome): a cheap
  invariant checked on every result (same letters in, same letters out) turns an unknown seam bug into a fallback.
- **Node 22 imports `src/lib/*.ts` directly** (type stripping) when the file holds only erasable syntax — scripts and
  e2e suites can run the app's pure modules without Vite (`tests/lib/codefmt-node.mjs`).
- **Opening a file in an e2e test:** the tab reads the file before it starts work, so the notes of the previous result
  are still there — take them away first (`openFile` in `tests/e2e/prettier.e2e.mjs`) or the wait matches the old state.

- **A native build of the same source is the best reference a C engine can have (Graphviz, 19 Nov 2026):** build it
  first (`wasm/graphviz/build.sh` does: it needs the object list anyway), record what it draws
  (`scripts/make-graphviz-reference.mjs`: hashes, so 3,464 drawings fit in 430 KB), and hold the module to it. What
  that showed, none of it visible to hand-written expectations: the C library decides drawings (`qsort` is not
  stable in musl, `rand()` is another generator — bring glibc's along and `dot` is byte for byte the tool's), which
  engines can be exact at all (those without sin / cos in a loop), and where the tool itself aborts.
- **`zig cc -O2` defines NDEBUG.** Assertions are gone unless the build says `-UNDEBUG` (check with
  `strings module.wasm | grep "Assertion failed"`). In WebAssembly a null pointer is readable memory, so an engine
  without assertions runs on where the native tool stops. `-ffile-prefix-map=$SRC/=` keeps the build path out.
- **WebAssembly traps where native survives:** an uninitialised function pointer is a call through a garbage table
  index. When a wasm build of a mature C program traps on valid input, run the native program under **valgrind**
  (installed here) on the same input — twice in one process if the program frees at exit.
- **A fresh instance per job** costs ≈ 1 ms once the module is compiled (`compileWasi` + `instantiateWasiModule`
  in `src/wasm/wasi.ts`; the page compiles, the worker instantiates). Libraries written as command-line tools keep
  counters and "said it once" flags in globals: a reused instance gives history-dependent output.
- **A missing library can sometimes be replaced at its seam:** Graphviz wants GTS only for a Delaunay triangulation;
  a 250-line port of Delaunator under its `delaunay.c` switched prism on. Port line by line and test against the
  original for *identical arrays* (then every difference is a slip, not a matter of taste), and against a native
  build with the real library for how close the whole thing comes (`apt-get install libgts-dev` works here).
- **Editing a shell script while it runs** is safe only behind the line it is executing — and only if the bytes in
  front of that line keep their length. Start long builds, then leave the script alone.
- **Sandbox facts added:** gitlab.com is reachable (Graphviz's release archives); `apt-get install` works (Ubuntu
  archive); foreground `sleep` over a few seconds is blocked — wait with `until grep -q … ; do sleep 5; done`.
- **e2e waiting without sleeps:** the Graphviz tab sets `aria-busy` on the drawing while a text has no answer yet;
  `settled()` in its suite waits for `aria-busy="false"` and a loaded picture. Worth copying in tabs that redraw as
  you type.
- **Trap when writing test files (19 Nov 2026):** a file written in one piece by the editor tool had most of its
  `\uXXXX` escapes turned into the raw characters — invisible ones included (U+2028 inside a regular expression
  ends the line: "Invalid regular expression: missing /"). After writing a file that holds such escapes, look for
  raw invisible characters (`grep -nP '[\x{200b}-\x{200f}\x{2028}\x{2029}\x{a0}\x{300}-\x{36f}]'`) and put
  the escapes back. **A shell here-document does not protect them either** (the decoding happens before the command
  runs): after writing any JS / TS file with such escapes run a re-escaping pass (a ten-line Python script that
  replaces raw U+0080–00A0, U+00AD, U+0300–036F, U+2000–200F, U+2028–202F, U+FE0F … by `\\uXXXX`, building the
  backslash with `chr(92)`), or build the line in Python.
  **Run that pass on JS / TS / MJS sources only — never on a Markdown file:** it turned the joiners of an emoji and a
  non-breaking hyphen in `docs/BUGHUNT.md` into literal backslash-u text once (caught in the diff before the commit).
  Reference tools the suites of area text need again in a new container: `pip install pysbd regex titlecase`,
  `apt install cw` (unixcw's libcw for `scripts/make-morse-reference.py`), perl (for `scripts/make-emoji-reference.py`).
- **Node's ICU is not Chromium's:** Chromium ships its own word-break rules (no join over a full stop or a colon), so
  `Intl.Segmenter` gives other words in the browser than in a unit test. Anything that must be the same everywhere
  belongs in an engine of ours (the Word Counter's textkit.wasm).
- **Seen once, not reproduced (19 Nov 2026):** one `npm test` run of five ended "20205/20206" with 91 assertions
  fewer in the total — one suite stopped early. Three runs right after were clean (20,297 / 20,297). When running the
  unit suites, write the output to a file (`npm test > log 2>&1; grep -A3 '✗' log`) so that the suite can be named
  if it happens again.
- **Lead for the app-shell area (not yet looked into, 19 Nov 2026):** on a phone (iPhone 13 emulation) the header's
  search box (`.search-input`) is 40 px tall — the owner's rule is 44 px touch targets. The phone placeholder says
  "Search 170+ tools…" while a phone shows 112 of the 176 tabs — to check when the shell is hunted.

