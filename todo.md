# To do (the owner's list — "to do")

The owner adds items here in chat ("add … to to do"). Newest instructions win.

> **Never start an item on your own (owner, 17 Nov 2026):** "Don't start doing the todo.md on your own. At some point,
> show me the todo.md, show me the items in the todo.md and ask me which ones to build out and I'll tell you."
> So: when the work in progress (see `docs/RESUME.md`) is finished, **show the owner the open items and ask which
> ones to do** — and do only those. Tick an item off here with the date and the commit.

## Open
1. _(moved to `docs/potentials.md` #74 by the owner, 21 Nov 2026: "for now move 'JS/TS → WebAssembly sweep' from
   to-do to potentials.md" — the JS/TS → WebAssembly sweep waits there for the owner's pick.)_

3. _(withdrawn by the owner on 20 Nov 2026: the "Export Python utility" for the YouTube Clip tab — do not build it.)_


13. **Every PC app on both Windows and Linux: a quick check across all the apps** (owner, 21 Nov 2026: "Just do a quick
    test across all the apps and make sure that all the apps that work on PC work on both Windows and Linux.") Every tab
    that runs on a PC (the PC-only ones and the PC + mobile ones) is opened and used for its main job on Windows and on
    Linux (Chrome; on Linux X11 and Wayland), and what differs between the two is looked at on purpose: file and folder
    pickers and drag-and-drop, file names and paths (backslashes, drive letters, case), line endings (CR LF / LF) in the
    files a tab opens and saves, text encodings (Windows-1252 / UTF-16 from Windows programs), keyboard shortcuts
    (Ctrl / Super / AltGr), fonts the page falls back on, the clipboard, screen capture (Screencast, Screenshot — the
    portal on Wayland), camera and microphone, downloads, the offline speech scripts (.cmd on Windows, .sh on Linux) and
    yt-dlp's file per system. What fails is fixed and pinned by a check in the tab's suite. How: this sandbox is Linux;
    Windows by its behaviour where it can be stood in for (Windows-made files, Windows user-agent and client hints,
    CR LF), and the rest on a Windows PC — the owner's, through the Claude app, or a Windows runner of GitHub Actions.
    **And on Linux, X11 or Wayland** (owner, 21 Nov 2026: "make a note that all apps on Linux should be aware of or
    auto-detect or have some way of detecting on Linux if I'm using X11 or Wayland"): every PC tab knows which one the
    session runs on (the shared detection in `src/linux.ts`, CLAUDE.md's standing note) and is checked on both — where
    they differ (capture, the colour picker, popups and Picture-in-Picture, full screen, drag-and-drop, the clipboard, the
    camera) the tab says what Wayland changes and how to work with it.
    **Progress (21 Nov 2026):** the real Windows check is `.github/workflows/windows.yml` (the browser suites in Google
    Chrome on GitHub's Windows runner; run by hand). Its first runs found: the repository could not be checked out on
    Windows (`public/data/dict/con.json`, `prn.json` — device names there; now `con_.json`, `prn_.json`, and
    `tests/unit/repo-paths` refuses such names), and the build stopped on a path taken from a file:// URL (59 places,
    now `fileURLToPath`). Files as Windows programs save them: the Hash tab's checksum lists and Sodium's encrypted
    text read UTF-16 now. X11 / Wayland: the shared note also in Screen Info, Screenshot's Wayland tip about its
    countdown window; `tests/e2e/os.e2e.mjs` opens all 172 PC tabs as Windows, X11 and Wayland. Then: Extract
    Archive's "Save all to a folder" makes names Windows can create (aux.c → aux_.c, `notes.` → notes_, README / readme
    kept apart; elsewhere a name the browser refuses takes that form); the Patch tab keeps a Windows file's CR LF; the
    Keyboard Test registers PrintScreen by its release (Windows keeps its key-down) and takes the key-up (a lone Alt
    moved the focus to Chrome's menu); the offline speech script for Windows ends with its real exit code and **was run
    for real on Windows** (`.github/workflows/windows-tts.yml`: Piper — the lock's versions, a WAV and an MP3, exit 1 for
    a voice that cannot be made; then one job per engine). Next: the per-engine Windows results and the full browser
    run's (both in progress), what they find fixed and pinned.

14. **Text Diff: two local files, a file of a public GitHub repository at two commits, the difference as a patch file**
    (owner, 26 Nov 2026: "In the text diff app, add 2 more text input options. One is to upload two local files. The
    second option is to name a file in a public GitHub repository with two different commit hashes. Also, add the option
    to download the difference as a universal patch file format.")
    - **Two local files:** a picker (and drop) for the original and one for the changed text, read as the other text
      tabs read files (`readTextFile`: UTF-16 by its mark, UTF-8, else Windows-1252; a file that is not text refused in
      words); the files' names go into the patch's headers; a pair that differs only in line ends (CR LF / LF) is said.
    - **A file of a public GitHub repository at two commits:** the repository (owner/name, or its github.com address — a
      file's own address fills the boxes), the file's path and two commit hashes (full or short; a branch or a tag name
      too); the tab fetches the file as it was at each commit and compares them. This makes **GitHub a data host** of
      the site (CLAUDE.md §1: data, never code): `raw.githubusercontent.com` for the file at a commit (CORS, no key) and
      `api.github.com` for what that cannot do — a short hash made full, a path missing at a commit explained (60
      requests an hour without an account; said when used up) — added to the CSP's connect-src, §3a's table of approved
      data APIs and `no-external.e2e.mjs`; only the repository, the path and the hashes are sent, nothing typed in the
      page. Mocked in the suites (`page.route`), checked against GitHub by hand.
    - **The difference as a patch file** (the unified diff format that `patch` and `git apply` read): the tab already
      has "Copy as patch / Download .diff", with the headers `--- original` / `+++ changed` and the name `changes.diff`
      — `patch` cannot tell which file such a patch is for. Make it a proper patch: the real names in the headers
      (`a/<path>` / `b/<path>` for the repository's file, with the two commits named, so `git apply` and `patch -p1` take
      it at the repository's root; the two files' names for local files), `\ No newline at end of file` as now, saved as
      `<file>.patch`; held to GNU `diff -u` / `git diff` and applied by GNU `patch`, `git apply` and the Patch tab in the
      suite.

## Done
- **12. Photo Dictionary: the final list of words in alphabetical order** (owner, 21 Nov 2026) — done 21 Nov 2026: the
  same cards, A → Z without regard to case or accents; the line above says so; Share list in the same order. Unit
  `photodict-order` 6, e2e `photodict` 115.
- **10. bc console: every result in a variable** (owner, 21 Nov 2026) — done 21 Nov 2026: A … Z, AA … ZZ at the end of
  each result's row, `$A` in later lines (any case), `$name = …` for your own names, a $ name set once (every change
  refused). `src/lib/bcvars.ts`; unit `bcvars` 35, e2e `bc-console` 30. CLAUDE.md §2, "bc console".
- **8. Regex Tester: a choice of regex flavours** (owner, 21 Nov 2026) — done 21 Nov 2026: **ten flavours**, each
  the engine its language runs: JavaScript (the browser), PCRE2 (pcre2-wasm), Perl 5.42 (zeroperl), Python's re and the
  regex module (our CPython, mrab-regex built in), Java (OpenJDK 21's java.util.regex compiled by TeaVM), .NET 10
  (Microsoft's WebAssembly runtime), Go (our build of its regexp), Ruby (Oniguruma + Ruby's rules), POSIX ERE (GNU's
  regex, our build). Unit 559 against the native engines (398 cases), e2e 84 + 32. CLAUDE.md §3 `regex`.
- **7. Text-to-Speech offline, the rest of round 2** (owner, 21 Nov 2026: "Don't leave out any of the other TTS stuff
  either") — done 21 Nov 2026: Kyutai TTS 1.6B with 601 voices, F5-TTS, VibeVoice 1.5B, the 57 Indian voice donations
  for every engine that clones; **every engine run here** with its lock (`scripts/accent-survey/smoke.py`) except the
  two gated ones and Parler Large — two Chatterbox faults found and fixed (a lock with two PyTorch versions; its
  watermark needing setuptools < 82). **The accent ranking: 104 Indian voices measured** (192 recordings, 77 heard as
  Indian first; lightest: XTTS-v2's VCTK p251, Kyutai's VCTK p376, XTTS-v2's p248). Owner, 21 Nov 2026: "if there are
  enough top Indian accents ranked, then can we stop the remaining ranking altogether and get on with building the
  other apps without loss of any functionality" — stopped there: every voice is in the catalogue and its scripts as
  before; the 470 not measured are listed in the ranking with the reason (mostly copies of recordings already
  measured; F5 too slow here; Indic Parler and Pocket cloning gated). To measure more: `scripts/accent-survey/finish-7.sh
  WORK --surveys`, then `make-indian-accents.py` and the generator.
- **11. Photo Dictionary and OCR: a photo taken with the phone held sideways** (owner, 21 Nov 2026: "a new requirement in
    todo.md for the photo dictionary on the mobile phone. Basically, the problem is when I take my phone and turn it 90
    degrees horizontally, either with my left hand or my right hand, and then take a photo of my Kindle, it gets screwed
    up. It can't understand a thing. Fix that. Do whatever you have to do internally, rotate the image, and basically the
    photo dictionary app and the OCR on the phone should work even if my camera is in landscape mode and portrait mode.
    So make these changes on OCR and the photo dictionary app.") With it (owner, the same day): "both photo dictionary and
    OCR on the phone and PC should be extremely high quality." The owner asked for the fix at once — **done
  21 Nov 2026**: both tabs set the text upright before it is read (imgproc's `p_text_turns` + `src/lib/upright.ts`: the
  lines' axis from each letter's nearest neighbour, the top from the letters above the x-height; where only the axis is
  clear, a small copy read both ways round); tested on the real Kindle photos turned every way and on a phone still lying
  across the picture (CLAUDE.md §3 OCR).
- **6. Photo Dictionary upgrade** (owner, 21 Nov 2026 — "build it out next … before you help me building out new apps
  with potentials.md") — done 21 Nov 2026: a Wikipedia box under every word, every uncommon word (no fixed 20), the
  page's text first with a selected phrase looked up on Wikipedia, words broken over two lines joined (31dbd3e); **the
  owner's first case, a phone photographing a Kindle page** (item 5): Snap takes the camera's still, the page is found and
  straightened before it is read (most generated photos of Kindle pages read 93 – 100 %), and a photo too soft to read
  says "snap again" (abe1d69, cd07746, 5617e29, the hint after d4f5b2d). CLAUDE.md §3 Photo Dictionary, "The upgrade".
  Measured and not kept: sharpening, upscaling, Sauvola thresholding, PaddleOCR PP-OCRv6 (docs/WASM-AUDIT.md, tab 122).
  The owner's own Kindle photos ("Save this photo" under the thumbnail) are welcome for more tuning.
- **9. OCR on the phone, as good as the Photo Dictionary** (owner, 21 Nov 2026: "just like the photo dictionary, the OCR
  app should also work really well from my phone") — done 21 Nov 2026 (d4f5b2d and the hint after it): the OCR tab
  shares the camera's still, straightens a photographed page (a screenshot or a program's scan is read as it is) and says
  when a photo reads poorly; its suite reads the Kindle fixtures (≥ 95 % and ≥ 90 % of their words). CLAUDE.md §3 OCR.
- **5. Rename the app from SuperTools to "SuperUtils"** (owner, 21 Nov 2026: "make sure you rename it everywhere. For
  example, in the text-to-speech download utility also") — done 21 Nov 2026 (650388c): the page, the header, the tab
  titles, the terminal (prompt, hostname, uname — busybox.wasm rebuilt), the samples, the JSON → Types header, the
  Python tab's asyncio helper, the offline speech scripts (`superutils-speech.sh` / `.cmd`, the folder `SuperUtils-TTS`;
  owner: no migration of the old `SuperTools-TTS` folder — he deletes it), the Favorites key (the old stars are moved
  over once). Kept on purpose: the import module name `supertools` inside four WebAssembly builds (never shown) and
  test data with the old name (CLAUDE.md §1, "App name").
- **2. FFmpeg tab: buttons for more popular jobs** (owner, 20 Nov 2026: "add all the popular new jobs for FFmpeg that don't have buttons yet … search for more out there … and add it") — done 20 Nov 2026: 21 new jobs (39 in all, in eight groups of a task list; no command line needed): the owner's six (join clips; subtitles burn in / add as a track / extract; logo or text on a video; volume; reverse; picture at a chosen moment) and fifteen popular uses found on the web (fades, fit to a shape with a blurred background or bars, remove silence, picture-in-picture, loop / boomerang, stabilise, clean up grain, contact sheet, timelapse, split into parts, sound settings, colours / black and white, cut a part out, background music, deinterlace; sources in docs/BUGHUNT.md). `src/lib/ffjobs.ts`, `src/tools/ffmpeg.ts`; unit `ffjobs.test.mjs` 110 (native FFmpeg 6.1), e2e `ffmpeg.e2e.mjs` 68. Found on the way: the core's JPEG encoder crashed the page (every JPEG is MozJPEG's now).
- **4. YouTube Clip tab: "Download latest yt-dlp"** (owner, 20 Nov 2026: "Have an export button called download latest
  YT-DLP … when the user clicks that button, the app should basically go to GitHub and download the latest version of
  YT-DLP. Is this possible? If so, make it happen.") — done 20 Nov 2026: a link to GitHub's
  `releases/latest/download/<file>` (always the newest release), the file for this computer first (Windows x64 / ARM
  / 32-bit, macOS, Linux x86-64 / ARM64, the Python zipapp elsewhere), the others under "Other systems", how to run it;
  the page fetches nothing itself (CSP unchanged). `src/lib/ytdlp.ts`, unit `ytdlp.test.mjs` 19, youtube e2e +8.
