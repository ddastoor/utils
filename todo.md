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

5. **Rename the app from SuperTools to "SuperUtils"** (owner, 21 Nov 2026: "Also make a note to change this app's name
   from SuperTools to 'SuperUtils'"). About 50 files say SuperTools: the page title and header brand, `document.title`'s
   suffix, CLAUDE.md ("App name"), the docs, the tests that read the title, and the offline Text-to-Speech scripts
   (driver.py's header, the PC folder `SuperTools-TTS`). Points to settle when it is done: the Favorites key
   `supertools.favorites.v1` in localStorage (keep it, or copy it to a new key, so the owner's stars are not lost); the
   offline TTS folder on the PC (a new name would download everything again unless the script looks for the old folder);
   the repository and the site address stay `ddastoor/utils` / `ddastoor.github.io/utils/`.
   **Owner, 21 Nov 2026: "make sure you rename it everywhere. For example, in the text-to-speech download utility
   also"** — the offline speech scripts (`superutils-speech.sh` / `.cmd`), the PC folder (`SuperUtils-TTS`, using an
   existing `SuperTools-TTS` folder so nothing is downloaded twice), driver.py's header and every line the scripts say.

6. **Photo Dictionary upgrade** (owner, 21 Nov 2026 — "build it out next … before you help me building out new apps
   with potentials.md"): a Wikipedia box under every word, all the uncommon words (not a fixed 20), the complete OCR
   text first with phrase selection looked up on Wikipedia, and words broken over two lines by a hyphen or dash
   treated as one word. The plan: CLAUDE.md §3 Photo Dictionary, "To build next" (items 1 – 5). Next after the
   Indian-accent ranking now in progress. **The owner's first case: a phone photographing a Kindle page** (item 5; the
   standing note at the top of CLAUDE.md).

7. **Text-to-Speech offline, the rest of round 2** (owner, 21 Nov 2026: "Don't leave out any of the other TTS stuff
   either. Eventually complete everything that you are/were doing in parallel"): Kyutai TTS 1.6B (kyutai/tts-1.6b-en_fr,
   CC BY 4.0) with its 594 voices of kyutai/tts-voices (228 CC0 voice donations filed by the accent heard, VCTK's 106 by
   its documented accents, Expresso, EARS, Alba MacKenna — licences in the collection's README); F5-TTS and VibeVoice
   (adapters waiting in `scripts/wip/offline-tts-engines-next.py`); the 56 voice donations heard clearly as Indian added
   to every engine that takes a voice from a recording (XTTS-v2, Chatterbox and Turbo, VoxCPM2, Pocket TTS cloning, F5,
   VibeVoice; F5 needs each clip's words — Whisper); the engines not yet run here, where the machine allows; every new
   Indian voice measured for the accent ranking. Order (owner): after the accent ranking and the Photo Dictionary upgrade.

8. **Regex Tester: a choice of regex flavours** (owner, 21 Nov 2026: "make a note of this and build it out when you get
   a chance" — noted in CLAUDE.md §3 "Text & Dev", `regex`, and added here on the owner's question, 21 Nov 2026): the
   user picks the flavour — Python (`re`, and the `regex` module), Perl / PCRE, and the other standard ones (JavaScript
   as now, Go / RE2, Java, .NET, POSIX ERE, Ruby / Oniguruma). WebAssembly first (STANDING RULE #1): candidates PCRE2
   (C; an existing wasm build or ours), RE2 (Google's `re2-wasm`), Python's `re` through our CPython 3.14 wasm (the
   Python tab's), Oniguruma (already compiled into our jq.wasm), Rust `regex` / `fancy-regex`; each flavour held to its
   native engine in the tests. Order: with the work in hand (CLAUDE.md, the potentials process), after the TTS work and
   the Photo Dictionary.

9. **OCR on the phone, as good as the Photo Dictionary** (owner, 21 Nov 2026: "just like the photo dictionary, the OCR
   app should also work really well from my phone"): the OCR tab shares the engine (`src/lib/ocr.ts`), the live camera
   (`src/lib/livecam.ts`) and the picture clean-up with the Photo Dictionary, so the phone work of #6 — the camera's
   full-resolution still instead of a video frame, continuous autofocus, the clean-up chosen by measuring photos of
   Kindle pages, newspapers and printed pages — is held for the OCR tab too: its suite measures the words read right on
   the same photo set. What is the OCR tab's own (a whole page of running text, columns, the four languages, the text
   kept in its lines) is tuned and measured on its own. Done together with #6.

10. **bc console (Scientific Calculator tab): every result in a variable** (owner, 21 Nov 2026, added as the last item:
    "The result of each expression should be stored in a variable, and that variable should be printed at the right
    side, at the end of the row of that expression value. It should start with A to Z, then AA, AB, AC, AD to AZ, all
    the way to ZA, ZB, ZC to ZZ, just like Excel column names. The user should be able to, on subsequent rows, use the
    variables by saying $. So for example, if variable A, they should be able to use it by saying $A, etc. Also,
    variable name should be case insensitive. Variable values are immutable. The user should not be able to, on
    subsequent rows, change or reassign the value of an already existing variable. The user should be able to also add
    their own variable names, starting with alphabets.") Doable — the plan: each row that gives a value gets the next
    free name (A … Z, AA … ZZ, then AAA … as Excel goes on), shown at the right end of its result (a tap puts $A into
    the input); `$A` / `$a` in a later row stands for that value exactly as bc printed it (all its digits — bc's own
    capital letters are hex digits, so the $ names are put in by our glue before bc sees the line, never as bc
    variables); `$name = expression` names a row yourself (a letter first, then letters, digits, _; case-insensitive),
    and the automatic names skip any name taken; any change of an existing $ name (`=`, `+=`, `++` …) is refused with
    what it holds. Owner, 21 Nov 2026 (answer): "when the user presses enter, you get only one value on a new row … So
    that value will get a new variable name … variable name should be case insensitive, so it doesn't matter if the user
    changes the case of the already existing variable, the value should be the same" — so every result row gets the next
    name ($a and $A are one variable with one value). bc's own plain lowercase names, which its loops and `define`
    functions use, work as in bc. Engine unchanged (BusyBox's bc in WebAssembly); the names are TypeScript glue in
    `src/tools/bc-console.ts`, its suite `tests/e2e/bc-console.e2e.mjs`.

## Done
- **2. FFmpeg tab: buttons for more popular jobs** (owner, 20 Nov 2026: "add all the popular new jobs for FFmpeg that don't have buttons yet … search for more out there … and add it") — done 20 Nov 2026: 21 new jobs (39 in all, in eight groups of a task list; no command line needed): the owner's six (join clips; subtitles burn in / add as a track / extract; logo or text on a video; volume; reverse; picture at a chosen moment) and fifteen popular uses found on the web (fades, fit to a shape with a blurred background or bars, remove silence, picture-in-picture, loop / boomerang, stabilise, clean up grain, contact sheet, timelapse, split into parts, sound settings, colours / black and white, cut a part out, background music, deinterlace; sources in docs/BUGHUNT.md). `src/lib/ffjobs.ts`, `src/tools/ffmpeg.ts`; unit `ffjobs.test.mjs` 110 (native FFmpeg 6.1), e2e `ffmpeg.e2e.mjs` 68. Found on the way: the core's JPEG encoder crashed the page (every JPEG is MozJPEG's now).
- **4. YouTube Clip tab: "Download latest yt-dlp"** (owner, 20 Nov 2026: "Have an export button called download latest
  YT-DLP … when the user clicks that button, the app should basically go to GitHub and download the latest version of
  YT-DLP. Is this possible? If so, make it happen.") — done 20 Nov 2026: a link to GitHub's
  `releases/latest/download/<file>` (always the newest release), the file for this computer first (Windows x64 / ARM
  / 32-bit, macOS, Linux x86-64 / ARM64, the Python zipapp elsewhere), the others under "Other systems", how to run it;
  the page fetches nothing itself (CSP unchanged). `src/lib/ytdlp.ts`, unit `ytdlp.test.mjs` 19, youtube e2e +8.
