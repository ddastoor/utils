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
    a voice that cannot be made; then one job per engine): **all 18 engines make speech on Windows** (Kyutai without a
    C++ compiler, F5-TTS's lock fixed on 26 Nov). The browser suites in Chrome on Windows (run 5, 26 Nov): 19 of 30 passed; one
    app fault (the Photo Dictionary's online HTML: tags now taken out before parsing) and eleven faults of the suites on
    Windows fixed (ef43da3; docs/BUGHUNT.md "Windows / Linux" (10)). Next: run 6 (the 15 suites touched) green → #13 done.

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
      page. Mocked in the suites (`page.route`), checked against GitHub by hand. **Approved by the owner, 26 Nov 2026:**
      "for #14, yes u may contact raw.githubusercontent.com and api.github.com in real time" (CLAUDE.md §3a).
    - **The difference as a patch file** (the unified diff format that `patch` and `git apply` read): the tab already
      has "Copy as patch / Download .diff", with the headers `--- original` / `+++ changed` and the name `changes.diff`
      — `patch` cannot tell which file such a patch is for. Make it a proper patch: the real names in the headers
      (`a/<path>` / `b/<path>` for the repository's file, with the two commits named, so `git apply` and `patch -p1` take
      it at the repository's root; the two files' names for local files), `\ No newline at end of file` as now, saved as
      `<file>.patch`; held to GNU `diff -u` / `git diff` and applied by GNU `patch`, `git apply` and the Patch tab in the
      suite.

15. **Blur & Redact: every face found at once, or only the faces chosen** (owner, 26 Nov 2026: "In the blur and redact
    app, the user should be able to have a toggle to find all faces and redact, or to remove that toggle and selectively
    choose only that face he wants to redact, or choose one or more multiple faces manually. The user should have an
    option to choose any number of faces manually to redact and undo them, or select all the faces in one shot to
    redact.")
    - Today: every face the finder sees is hidden at once; a tap on a box shows that face again, "Hide all" hides them
      all again; boxes can be drawn by hand.
    - **A switch "Redact every face found"** — on: as today, every face hidden; off: the faces are found and outlined,
      but none is hidden until it is chosen.
    - **Choosing by hand:** a tap (or click) on a face hides it, another tap shows it again — any number of faces, one
      or several; **"Redact all faces"** hides every face found in one go and **"Show all faces"** takes that back;
      **Undo** (and Ctrl+Z) takes back the last change, step by step; boxes drawn by hand stay as they are.
    - The line under the photo says how many faces were found and how many are hidden; Save saves exactly what is shown;
      the switch keeps its setting when another photo is chosen.
    - The suite: a group photo — every face hidden with the switch on, none with it off, two chosen by tap and one taken
      back, Undo, all in one shot and back; the saved file's pixels at each face (hidden or not).

16. **Cartoonizer: finer, more detailed results, more like the Prisma app** (owner, 26 Nov 2026: "The Cartoonizer app's
    output is too is too coarse-grained. Make it more fine-grained with more detail, more like the Prisma app. If you need
    to use a better library," — the message ended there; read as: a better library or model may be used. To confirm.)
    - **Why it is coarse now:** the AI styles (Magenta's arbitrary style transfer) paint at 512 px (1024 on a real
      graphics card) and the result is saved at that size — the network paints strokes at a fixed scale of its input,
      so a small input gives big strokes; the Cartoon filter flattens to a few k-means colours with thick lines.
    - **Owner, 26 Nov 2026 (on showing samples and sizes first): "go ahead and use your discrestion.. if needed, i'll ask u
      to change later.."** — Claude chooses by measurement and by eye, without asking first; the sizes are written down
      (commit, CLAUDE.md, docs/WASM-AUDIT.md) and kept to a sensible share of the site's room (488 MB of the 1 GB).
    - **What to try, chosen by measured results and sample pictures:**
      (1) the AI styles at the photo's own resolution — painted in overlapping tiles whose seams are blended, so the
      strokes stay fine at full size (slower on a processor: progress shown);
      (2) better models where they look more like Prisma, on ONNX Runtime Web (already on the site — WebAssembly
      first): per-style networks trained on one painting each (Johnson et al.'s fast neural style — the ONNX model zoo's
      candy, mosaic, rain princess, udnie, pointillism, about 7 MB each), White-box Cartoonization (CVPR 2020) and
      AnimeGAN v2 / v3 for the cartoon look; newer arbitrary-style networks (AdaAttN, StyTr²) looked at too. Licences
      checked; each model's size written down against the site's 1 GB (Claude's discretion — the owner's word);
      (3) the filters: a finer Cartoon — more colours, an edge-preserving smoothing that keeps detail (the detail layer
      added back), lines that thin as the picture grows.
    - **Measured, not guessed:** how much of the photo's fine detail each result keeps (edges, fine-scale structure) for
      the current output and each option; the suite holds the chosen level.

17. **Watermark: a diagonal watermark across the picture; PDFs and Word documents, every page** (owner, 26 Nov 2026: "in
    the Watermark app, add two new options. First option, a watermark-style option; the watermark should be from the
    bottom left to the top right, diagonally right across the picture. And the second option is that I should be able to
    upload a PDF or a Word document, and the style of the watermark chosen should be applied to every page of this PDF or
    Word document.")
    - Today: the text or a logo in one of nine positions, or tiled at an angle; size, opacity, margin, font, colour,
      shadow. (PDFs have their own tab, PDF Watermark: vector text, opacity, tiled.)
    - **"Diagonal", a new position:** one watermark along the line from the bottom-left corner to the top-right one —
      turned by the picture's own diagonal (the angle atan(height ÷ width): steeper on a tall photo), centred, as large
      as the diagonal holds within the margin; text or logo; the size slider then sets how much of the diagonal it fills.
    - **A PDF or a Word document instead of photos:** every page gets the watermark as chosen (a position, tiled or
      diagonal — each page by its own shape). **PDF:** the PDF Watermark tab's engine (MuPDF: vector text, sharp at any
      zoom; the logo as an image with its transparency; opacity); the pages' text stays text (searchable, copyable); a
      password asked for where the PDF has one. **Word (.docx):** Word's own watermark — the shape Word puts in each
      section's header with Design → Watermark ("Diagonal" text runs from the bottom left to the top right; or a
      picture) — so the document stays editable and Word, LibreOffice and Google Docs show it on every page; the old .doc
      format: said to be saved as .docx first. The downloads keep their format (name-watermarked.pdf / .docx).
    - **Engines:** MuPDF (on the site); for .docx, a zip with XML inside — a WebAssembly route first (STANDING RULE #1:
      7z-wasm for the zip, already on the site, and the browser's DOMParser for the XML, or a small Rust module),
      written down in docs/WASM-AUDIT.md.
    - **The suite:** the diagonal's angle and reach measured on photos of three shapes; a PDF of mixed page sizes and
      rotations (/Rotate) watermarked on every page (read back by MuPDF: the drawn pixels, the text still there); a .docx
      with several sections opened by LibreOffice (converted to PDF: the watermark on every page) and by python-docx.

18. **OCR and Photo Dictionary: the OCR tab as good as the Photo Dictionary; documents with rich formatting and with
    watermarks, above all from a phone's camera; measured on many real documents** (owner, 26 Nov 2026: "for the OCR app
    and Photo Dictionary app — can u make the ocr app's ocr capability the same quality as the Photo Dictionary's? the OCR
    engine on the OCR app and I think for the photo dictionary app also, works very poorly for a document that has
    formatting, rich text formatting like bullet points, indentation, etc., especially using the phone camera. Also
    improve the quality when the document has a watermark. use many real documents with a lot of rich text formatting,
    etc to further improve the ocr quality")
    - **Today:** both tabs run the same engine (Tesseract 5, `src/lib/ocr.ts`) on nearly the same preparation — the page
      found and straightened, set upright and level, the document clean-up. Where they differ: the OCR tab's clean-up can
      be switched off and it turns light-on-dark pictures over; it reads four languages; it shows the whole text, every
      mistake in view — the Photo Dictionary shows the uncommon words and joins words broken over two lines; only the
      Photo Dictionary has "Photo of a screen" (moiré). First step: the same photos through both tabs, measured, to find
      where and why the OCR tab reads worse — then **one shared reading path for both tabs**, so a photo reads the same
      in each and every improvement reaches both.
    - **The owner's conditions for the shared path (26 Nov 2026): "One shared reading path is fine.. but make sure no
      functionality is compramised.. the high quality of the ocr is paramount !!!"** — every feature of both tabs stays:
      the OCR tab's languages, its clean-up switch, light-on-dark pictures turned over, the turn buttons, the unsure words
      marked, the camera; the Photo Dictionary's "Photo of a screen", its "snap again" advice, the words joined over a
      line end; both tabs' page finding, levelling and setting upright, and the second try with the whole photo. Where the
      two tabs' steps differ, the better one by measurement for both, or kept per tab. **Nothing may read worse:** the
      measuring run (`scripts/measure-ocr.mjs`: the Kindle and newspaper photos, the e2e fixtures, the new documents) before
      the change and after, for each tab — no photo read worse beyond noise, the totals better — and the suites hold it.
    - **Rich formatting:** bullet points (• ◦ ▪ – ✓), numbered and lettered lists, indentation and nested lists, headings,
      bold and italic, tables, two columns, text boxes, headers and footers. **The owner, 26 Nov 2026: "no need to keep
      bullets and indentation in the text;.. but the ocr shold not get confused by them"** — the result stays plain text;
      what must not happen: a bullet read as a letter or a sign ("e", "©", "«", "*", "o") or glued to the item's first
      word, an item run into the line before, an indented or hanging line split from its item or read out of order, a
      narrow column read across the gutter, a table's cells run together. To do: Tesseract's layout (blocks, paragraphs,
      lines with their boxes — it gives them already) and its page segmentation settings tried on the set; bullet marks
      (a small round or square mark where a line starts, at the height of the small letters) found and left out before
      or after reading; every item and its continuation lines kept together, in order.
    - **Watermarks:** a light or coloured mark behind the text (CONFIDENTIAL, DRAFT, a logo, a name tiled across the
      page — our Watermark tab's diagonal and tiled ones too) taken out before reading: the text is the darkest ink, so
      marks clearly lighter than it, and coloured marks where the text is black or dark grey, are removed (the two levels
      of ink found per page); measured with and without, on the same pages watermarked and not.
    - **Many real documents** (the owner's words): documents with open licences full of formatting — public-domain
      government documents (forms, guides, the Federal Register's lists), Wikipedia articles with lists and tables,
      open-source projects' documentation, Word and LibreOffice documents with bullets and numbering, the site's own
      GST Invoice, Rent Receipt and Resume — each page rendered and photographed by the camera of
      `scripts/make-kindle-photos.py` (tilt, focus, noise, shadow, glare, held sideways) and also taken by a webcam;
      the owner's own photos when he sends them (never in the repository). Scored by the words read right, the
      characters (CER), the reading order, and no stray letters or signs where bullets stood; the suites hold the measured
      level.
    - **Engines** (STANDING RULE #1): Tesseract stays unless another engine reads the set better — measured, not
      guessed: Tesseract's best models (tessdata_best beside best_int), PaddleOCR PP-OCRv5 on ONNX Runtime (on the site
      already; the earlier test, docs/WASM-AUDIT.md tab 122, was on blurred Kindle photos only), a layout model for lists
      and tables (PP-DocLayout, DocLayout-YOLO); each model's size said against the site's 1 GB before it is added.
20. **Noise Remover: "Studio voice" — a voice recorded outdoors made to sound as if spoken in a studio** (owner, 26 Nov
    2026: "In the noise remover app, it should be that when I record my voice, say out in the open, in traffic or
    outside, when I remove the noise, there should be a new option so that it should sound as if I'm speaking in the
    studio, like they do in movie studio editing")
    - **Today:** RNNoise 0.2 removes steady noise (fans, hum, hiss, a constant traffic roar) and keeps the voice; horns,
      passing engines and the echo of the street get through, and the voice keeps the phone microphone's thin, distant
      sound.
    - **"Studio voice", a new option:** (1) stronger noise removal for traffic — a newer speech-enhancement network
      chosen by measurement: DeepFilterNet 3 (48 kHz), GTCRN, ClearerVoice's MossFormer2 and others, on ONNX Runtime
      (on the site already — WebAssembly first); (2) the room and street echo taken out (dereverberation); (3) a
      restoration network where one earns its size (Resemble Enhance, VoiceFixer and newer: they also restore the high
      frequencies a phone loses); (4) the studio finish in our own C (audio.wasm): rumble filter, de-esser, an EQ for
      presence and warmth, a compressor for an even level, loudness to −16 LUFS (EBU R128), a gentle gate in the pauses.
      Each model's size said against the site's 1 GB before it is added (the size check); A/B with the original; the
      present cleaning stays as it is.
    - **Measured, not guessed:** speech with real traffic and street noise mixed in (the suite's speech fixture with
      recorded street noise; outdoor recordings) — the noise left, the speech kept, DNSMOS (Microsoft's open
      speech-quality predictor) before and after; samples for the owner to hear before a model is chosen.
21. **Screencast: more countdowns; the sound level of the recording checked** (owner, 26 Nov 2026: "I want you to fix and
    confirm two things in the screencast app. Firstly, I want you to add another countdown preset. Right now there's a
    3-second countdown. I want you to add, say for example, a 5-second countdown, an 8-second countdown, and a custom
    countdown in seconds. The second thing I noticed is whenever I recorded my video, the volume of the output video
    seemed a little lower than the normal. Please check and confirm this. If it is actually so, then fix it.")
    - **Countdown:** Off, 3 s, 5 s, 8 s or a number of seconds typed in (whole seconds, within limits, said when outside);
      the choice kept while the tab is open. Also: the countdown in a small always-on-top window, as the Screenshot tab
      has, so it can be seen when the browser is minimised or another window is in front — closed before the recording
      starts, so it is not recorded.
    - **The sound level:** our code changes no level — the shared sound is recorded as the browser gives it; with the
      microphone, both are added in Web Audio; an MP4's sound is re-encoded as AAC (160 kbps) where the browser wrote
      Opus; the microphone is asked for with echo cancellation and noise suppression (and the browser's automatic gain
      control). To check: a known tone played in a shared tab and recorded — its level in the file against the tone's,
      with and without the microphone, MP4 and WebM — here on Linux and on the Windows runner (to-do #13's), and Windows'
      own system-sound capture against what is heard. If the recording is quieter: fix where it is lost; if the captured
      sound itself is quieter than what one hears, offer "Bring the sound to a normal loudness" (EBU R128, as the FFmpeg
      tab's loudness job). The suite holds the level to within 0.5 dB.

22. **FFmpeg, "Extract audio": MP3 for the download** (owner, 26 Nov 2026: "in the extract audio option of the FFmpeg app,
    the extracted audio is by default in the .m4a format. Add an MP3 audio formats also for the download.")
    - **Today:** the job has a list "Audio as" — "Keep the original codec (no quality loss)" first and chosen (a video's
      AAC sound comes out as .m4a), then MP3 (LAME, V2 ≈ 190 kbps) and WAV. It was not found: a list under the job,
      its first entry already chosen.
    - **To do:** the choice in plain sight — buttons for the format (as it is · MP3 · WAV · FLAC · OGG Opus), MP3 with
      its quality (128 / 192 / 320 kbps or V2); and on the result, beside the .m4a, **"Download as MP3"** made from the
      sound just extracted (no second run); the format chosen kept while the tab is open. The suite: MP3 frames, the
      bitrate, the length and the level equal to the original's.
23. **FFmpeg: the sound of the results quieter than the original?** (owner, 26 Nov 2026: "In the FFmpeg app, the audio
    volume of the output resultant videos and audio files seems to be lower than when I hear it from the original.
    Please confirm if this is the case. If this is indeed the case, then please fix.")
    - **To check:** every job's result measured against its original — loudness (EBU R128) and peak per channel, by the
      native FFmpeg the unit suite uses and in the browser — with mono, stereo and 5.1 sound, into MP4, M4A, MP3, WAV,
      OGG. Suspects found in the code: **Join clips** makes every clip's sound stereo (`aformat=…channel_layouts=stereo`)
      — FFmpeg spreads a mono sound over the two channels 3 dB lower each, so a mono phone video plays quieter; **5.1
      sound** into MP3 (LAME takes two channels) or into stereo is mixed down by FFmpeg's rule that keeps the sum from
      clipping — up to about 8 dB quieter; **"Normalise loudness"** brings a loud original down to −16 LUFS by design
      (to be said in the tab). Also the Screencast's sound (to-do #21) — the two checked together.
    - **If confirmed — fixed where it is lost:** mono kept mono, or put on both channels at its own level; a mix-down
      that keeps the loudness (with a limiter where it would clip); the jobs that do not set out to change the level
      keep it. The suite holds every such job to the original's loudness within 0.5 dB.
24. **Screenshot: draw a rectangle with the mouse to take the screenshot** (owner, 26 Nov 2026: "In the screenshot app, add
    the ability for the user to draw a rectangular area with his mouse also as an option to take the screenshot")
    - **Today:** share a screen, a window or a tab once → "Take screenshot" (now or after 3 / 5 / 10 s) takes the whole
      picture; it can be cropped afterwards in the editor.
    - **"An area", a new way to take it** (like Windows' Snipping Tool's rectangle): the frame is taken first, then shown
      full screen at the screen's own pixels, dimmed; the mouse drags a rectangle (its size in pixels shown as it
      grows; corners and edges adjustable; Esc cancels, Enter or a double-click takes it) → that part goes into the
      editor at full resolution. A page cannot draw over the desktop itself (as the Screencast's "An area" says), so the
      rectangle is drawn on the frozen screen. With a delay, the countdown first, then the rectangle. Touch works too.
    - **The suite:** a known picture shared, a rectangle dragged → exactly those pixels saved (PNG read back); Esc;
      adjusting a corner; a delay; a window shared instead of a screen.

26. **Key Codes: key combinations such as Alt+W shown as one** (owner, 26 Nov 2026: "In the key codes app, can you make alt
    keys to work? Alt+key seems to be recognized separately. When I press alt+W, I'm not getting the alt+W code. Is this
    even possible? if so do it.")
    - **Possible — the browser does say it:** the W key's event carries "Alt held" (`altKey`); the tab shows only the
      last key pressed — "Alt", then "w" — and the Alt only in the Modifiers row of the table. There is no single code
      for Alt+W in a browser: it is the key W (code KeyW, keyCode 87) with Alt held.
    - **To do:** the combination as one, large: "Alt + W" (Ctrl, Alt, Shift, Win / ⌘ in the usual order; the letter from
      the key's position, so a Mac's Option+W, which types "∑", is still Option + W; AltGr named as AltGr); the list of
      recent keys gives combinations, a modifier held alone replaced by the combination it starts; a row "As a shortcut"
      with the forms people paste — `Alt+W`, `alt+w` (VS Code, hotkeys), `e.altKey && e.code === 'KeyW'` (JavaScript),
      what a terminal receives (Esc w); Windows' lone Alt (it moves the focus to Chrome's menu, and the next key then
      never reaches the page) held back, as the Keyboard Test does. The combinations Windows or Chrome keep for
      themselves (Alt+Tab, Alt+F4, Alt+Space; Chrome's Alt+D, Alt+E, Alt+F) are named in the tab — which of them reach
      a page checked on the Windows runner. The suite: Alt+W, Ctrl+Shift+K, AltGr, a modifier alone, Windows' Alt.

27. **More room for the tab in use: the category's list of apps folds away** (owner, 26 Nov 2026: "the actual real estate on
    the browser for the actual app selected that I'm currently using is considerably reduced because of all the apps listed
    out in the current category. To improve the situation and increase the working area real estate for the app selected,
    when each category is selected, make the list of apps in this category in a collapsible pane. By default, keep the app
    pane expanded, but the user should be able to, once that particular app is selected, the user should be able to
    collapse the list of all apps in that category so that the real estate for the currently selected app increases.")
    - **Today:** on a PC the second row lists every app of the category and wraps — Software's 60-odd apps fill several
      rows above the tab in use; on a phone it is one row that scrolls sideways, sticky with the category row.
    - **To do:** the list of apps in a pane that folds: open by default; once an app is open a button at the row's end
      ("Hide the list of apps", a chevron) folds it to one slim line — the open app's name and "All n apps of Software ▾"
      — and opens it again; the category row and the search box stay. Folded stays folded while moving between apps
      and categories, and **remembered between visits like Favorites** (owner, 26 Nov 2026: "for #27, remembered between
      visits like Favorites.." — `localStorage` beside Favorites; CLAUDE.md §1 rule 1 notes the exception). Keyboard: the button reachable with Tab, its state said to screen readers (aria-expanded). Phones: the same
      for the sticky rows, which then take less of the screen. The suite: open, fold, the tab's height gained, unfold, a
      route change keeps it, every category, phone and PC, the accessibility sweep (a11y.e2e.mjs) and the touch-target
      sweep.

28. **Screenshot: scrolling screenshots** (owner, 26 Nov 2026: "Make a new option also for scrolling screenshots in the
    screenshot app.")
    - **What it is:** one tall picture of something longer than the screen — a whole web page, a chat, a document, a long
      list — made of the views taken while it scrolls, joined where they overlap.
    - **How, in a web page** (it cannot scroll other windows by itself): **a shared Chrome tab is scrolled by the tab** —
      Chrome's Captured Surface Control (`CaptureController.sendWheel`, Chrome 136 and later; Chrome asks the user once)
      scrolls it step by step while each view is taken, to the end or until Stop; **a window or a screen is scrolled by
      the user** — the mouse wheel or the scroll bar, at any pace — while the tab takes the views. The views are joined by
      finding each one's offset against the one before (own C in imgproc.wasm: rows compared; parts that stay put — a
      sticky header, a footer, a chat's input box — kept once, at the top and the bottom), at full resolution; a view that
      does not fit (scrolled too fast, or sideways) is said, and the picture so far kept.
    - **Then** the editor as today (crop, PNG, JPEG, copy); very tall pictures within the browser's canvas limits (made in
      pieces where needed, or saved as several parts — said).
    - **The suite:** a long test page shared and scrolled (the tab's own scrolling, and scrolling by hand simulated) — the
      joined picture equal, pixel for pixel, to the page drawn whole; a sticky header kept once; a fast scroll said;
      Windows, X11 and Wayland notes where they differ (Wayland's portal).

29. **Markdown Editor: "Copy with formatting" — the rendered document onto the clipboard for Word and other rich-text
    places** (owner, 26 Nov 2026: "Markdown editor new feature. The user should additionally be able to copy the
    rendered markdown with formatting so that he can paste it in, say, another Microsoft Word or any rich text setting.
    so basically a 'copy with formatting' toggle")
    - **Today:** no copy button — Save .md, Download .html and Print; a part of the preview selected by hand and copied
      with Ctrl+C keeps some formatting (the browser's own copy), with the site's styles and the preview's ids.
    - **To do:** a **Copy** button with a toggle **"Copy with formatting"**: on — the rendered document as rich text
      (HTML and plain text together on the clipboard, `ClipboardItem`; where a browser lacks it, the preview selected
      and copied), so Word, Google Docs, Outlook, Gmail, LibreOffice and Notion paste headings as headings, bold and
      italic, lists with their levels, numbered lists, tables with borders, code in a fixed-width font, block quotes,
      links; off — the Markdown as typed. The toggle kept for the visit. Made for pasting: styles written on each
      element (Word ignores most style sheets), task-list boxes as ☐ / ☑, footnotes as superscript numbers with the
      notes at the end, the preview's "md-" ids taken off, pictures as the .html download has them; "Copied with
      formatting" said.
    - **The suite:** the clipboard read back (both forms): the HTML parsed — headings, nested lists, a table, code,
      links, footnotes; the plain text as the preview reads; LibreOffice opens the copied HTML and saves it as .docx —
      Heading 1 – 3 styles, list levels, the table's cells (an independent reader, as Word would take it).

30. **OpenPGP: every password or passphrase of an encrypting mode typed twice** (owner, 26 Nov 2026: "in OpenPGP, for all
    possible encrypt modes where a password or passphrase is asked, it should be asked twice (2 input fields), not just
    once")
    - **Today:** Generate asks twice already (Passphrase + Repeat passphrase, in both standards). **Encrypt asks once:**
      "Password (symmetric)" — a typo there locks the message with a password nobody knows — and, with a signing key,
      "Signing key passphrase".
    - **To do:** in Encrypt, in both standards (GnuPG-compatible and RFC 9580): the message password with **Repeat
      password**, and the signing key's passphrase with **Repeat passphrase** (the owner's words: every encrypt mode —
      though a typo there is caught at once, the key does not open); Encrypt runs only when the two agree, and says so
      under the boxes when they do not ("The two passwords differ"); Enter in the second box encrypts; the password
      managers' "new password" hint on the message password. Decrypt and Sign only open what exists — one box, as now.
      (The other tabs that set a password ask twice already: Sodium Encrypt, Encrypted Share Link, Create Zip, Protect
      PDF, SSH Key Generator.)
    - **The suite** (`pgp.e2e.mjs`, `pgp9580.e2e.mjs`): two different passwords refused with the message and nothing
      made; the same twice → gpg (GnuPG-compatible) and rPGP / Sequoia (RFC 9580) decrypt the result; the signing key's
      two boxes; the boxes emptied by a change of mode.

## Done
- **25. bc console: a bc variable usable as a $ name** (owner, 26 Nov 2026: "> interest=20.78 / > $interest … The interest
  variable should also be set") — done 26 Nov 2026: a variable the session has set (also inside a line with other
  statements, in a loop, a global set in `define`) and scale / ibase / obase are reached as `$interest` (`$Interest`
  too) — the value bc holds at that point; a result's name comes first where both exist (said once); a change through
  the $ refused with how to make it; "not set" lists bc's variables too. `src/lib/bcvars.ts`; unit `bcvars` 79 (with the
  native GNU bc), e2e `bc-console` 44. CLAUDE.md §2 "bc console".
- **19. Slideshow Maker: every picture whole, nothing cut** (owner, 26 Nov 2026: "Add a new option whereby when the
  slideshow happens, none of the pictures get cut at all") — done 26 Nov 2026: a third look, **"Whole pictures (nothing
  cut)"**, beside Fill and Fit (both as they were): every photo entire for all its time on screen, the gentle zoom only
  inside the frame (92 – 100 % of the fitted size), the pan only within the room beside it; around it the blurred photo,
  black, white or any colour. `src/lib/slideshow-geom.ts`; unit `slideshow-geom` 12, e2e `slideshow-whole` 21 (every
  frame read keeps all four corners of a panorama, a strip and a square) and `slideshow` 20. Not built: a video shape
  "Like the photos" (it was only considered).
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
