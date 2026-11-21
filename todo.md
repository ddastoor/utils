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


12. **Photo Dictionary: the final list of words in alphabetical order** (owner, 21 Nov 2026: "regarding the final list
    of words that you show to the user with meanings, don't change the list of words, just sort them in alphabetical
    order, that's all, so that I can zoom into the correct word which is in my mind with scrolling purposes. Again, don't
    change the actual content of that list that you finally show, just sort it in alphabetical order.") The same cards
    as now — the same words, meanings and rarity labels; nothing added or taken out — shown A → Z (without regard to
    case or accents) instead of rarest first; the line above them says so, and "Share list" gives them in the same
    order. Owner, the same day: "I don't mean zoom in as in zoom into a picture. What I mean is quickly locate the word
    which is in my mind because it is sorted in alphabetical order." — no picture zoom: the list is only put in order.

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

## Done
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
