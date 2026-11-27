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

## Done
- **37. OCR and Photo Dictionary: an image from the clipboard** (owner, 27 Nov 2026: "Make both ocr app and photo dictionary app
  take images, as input, from the clipboard", then "Make a paste button for ocr and photo dictionary apps on the pc too") —
  done 27 Nov 2026: a **"Paste image"** button beside "Use webcam" / "Use camera" in both tabs, on PCs and phones. It reads
  the picture on the clipboard (Chrome asks once for leave; iPhone Safari shows its own "Paste" to tap) and reads it as a
  chosen photo is — the same text, the same words; the text saves as clipboard-<date>-<time>.txt. Text instead of a
  picture, an empty clipboard and a refusal are said in the device's words, with how to copy a picture or where to allow
  it. Ctrl+V as before. CLAUDE.md §3 OCR ("Paste image"); unit `clipimage` 37, e2e `paste-image` 29.
- **35. Text Diff: an interactive side-by-side diff, hunk by hunk** (owner, 27 Nov 2026: "In the text diff app, add an
  additional option to actually do an interactive side-by-side diff with next and previous. as in to cycle through next and
  previous diff hunks") — done 27 Nov 2026: a fourth view, **Side by side** (Lines, Words and Characters as they were): the
  original on the left, the changed text on the right, each line with its number and sign, the columns named (the files,
  the commits); the lines of a change that correspond stand in one row (the most alike in all, order kept — a line put in
  above a changed one stands alone, the changed line beside what it became) with what differs between them marked.
  **Previous change / Next change** (and N / P in the list, Alt+↑ / Alt+↓ in the tab) go from one change to the next and
  round again; the current change outlined and brought into view; a click picks one. Works with typed text, two files and a
  file on GitHub; the patch as before. CLAUDE.md §3 Text Diff; unit `textdiff` 80 (GNU diff's commands, GNU patch, the
  pairing against an exhaustive search), e2e `diff-side` 55.
- **33. Cartoonizer: how cartoony, in grades** (owner, 27 Nov 2026: "In the Cartoonizer app, in the cartoon filter, have some
  kind of gradation selection as to less cartoony or more cartoony.") — done 27 Nov 2026: "How cartoony" — Subtle · Light ·
  Medium (the old defaults) · Strong · Extreme — sets the Cartoon filter's colours, ink lines, smoothing and Detail
  together; the sliders stay for fine tuning (a slider moved: your own mix). Measured grade by grade on two photos: further
  from the photo, flatter, fewer of its edges kept. CLAUDE.md §3 Cartoonizer; e2e `cartoon-grades` 23.
- **34. Watermark: the first page (cover) with or without the mark** (owner, 27 Nov 2026: "in the Watermark app for uploaded
  documents only, have an option to include (or not) the watermark on the first page or cover page..") — done 27 Nov 2026:
  a switch "Watermark the first page (the cover) too" with the documents (on by default: every page, as before). Off: a
  PDF's page 1 stays exactly as it was (a one-page PDF is refused with the reason); a Word document's first page gets
  Word's own "Different first page" with a copy of the header and footer it showed, without the mark — later sections
  keep what they showed. CLAUDE.md §3 Watermark; e2e `watermark-cover` 40 (MuPDF, python-docx, LibreOffice).
- **36. The start page tells of the apps the other kind of device has** (owner, 27 Nov 2026: "When the app opens in the
  mobile on the landing page indicate to the user that there are additional PC-only apps and when the app opens in the PC,
  notify to the user that there are additional mobile-only apps") — done 27 Nov 2026: a note under the start page's first
  lines — on a PC "3 more apps on a phone: Bubble Level, Compass and Touch Test — they need a phone's sensors or touchscreen
  and are hidden on computers. Open <the site> on your phone to use them."; on a phone "64 more apps on a computer: Software
  (56), Media (4), Documents (2), Images (1) and Device (1) — …" with every name under "Show the 64 apps" (by category, in
  the order of the tab row). Counted from the registry, so a new app changes it by itself; the start page only. CLAUDE.md
  §2 (the platform model); e2e `other-device` 36.
- **32. FFmpeg tab: 22 new jobs** (owner, 26 Nov 2026: "include all the new cool FFmpeg features that you just mentioned
  above, leaving out the 3 that would require you to build the new FFmpeg module"; 27 Nov 2026: "yes go ahead with #32") —
  done 27 Nov 2026, all on the tab's FFmpeg 5.1 as it is (nothing added to the site; the three left out are potentials.md
  U3): **fixes** — MKV → MP4 at once (each stream's fate listed first), sound out of step (earlier / later, to the
  sample), a voice on one side (found, or chosen; swap), mains hum (its exact frequency found first, then ten notches),
  a lecture evened out, HDR (HLG / PQ) → normal colours, black bars found and cut off, a logo or date stamp removed (a box
  on a picture of the video), location and metadata removed (listed before, the copy checked after); **effects** —
  transitions between clips (16, the sound crossfaded at equal power), green screen, 360° → a view or a tiny planet and a
  wide lens straightened, smooth slow motion, light trails and motion blur, split screen / one above the other / a 2 × 2
  grid, a music visualiser, the sound as a picture, sound effects (8D, slowed + reverb, bass, telephone, radio, echo) at
  the file's loudness, a bleep, an animated WhatsApp sticker (made again until it is under 500 KB), the scene finder, a
  file analysed (a report). 61 jobs in ten groups. CLAUDE.md §3 FFmpeg, "22 new jobs"; unit `ffjobs2` 136, e2e
  `ffmpeg-fixes` 51 and `ffmpeg-effects` 55 on mono, stereo and 5.1 files.
- **20. Noise Remover: "Studio voice" — a voice recorded outdoors made to sound as if spoken in a studio** (owner, 26 Nov 2026:
  "In the noise remover app, it should be that when I record my voice, say out in the open, in traffic or outside, when I
  remove the noise, there should be a new option so that it should sound as if I'm speaking in the studio, like they do in
  movie studio editing"; then "Just use your discretion and get the best quality") — done 26 Nov 2026: "Kind of cleaning"
  Remove noise (RNNoise, as it was) / **Studio voice**: **DeepFilterNet 3** (8.6 MB, its DSP our C in audio.wasm, held to
  libDF; the network on ONNX Runtime Web; recordings in 10 s segments) and **the studio finish** (rumble filter, quieter pauses,
  warmth and presence, compressor, de-esser, −16 LUFS as heard on two speakers, true peak −1.5 dBTP). Chosen by measurement on
  speech in DEMAND's traffic, square, station and café noise: SI-SDR 5.0 → 14.6 dB (RNNoise 10.6), DNSMOS overall 2.55 → 3.18
  → 3.30 with the finish (RNNoise 3.10); DPDFNet 48 kHz and MossFormer2 48 kHz (229 MB) measured and not better on balance;
  WPE dereverberation measured and not added; no restoration network needed (full-band recordings). The site: 563 MB. Unit
  dfn 33, e2e noise-studio 28 (+ noise 25). CLAUDE.md §3 Noise Remover, "Studio voice".
- **14. Text Diff: two local files, a file of a public GitHub repository at two commits, the difference as a patch file**
  (owner, 26 Nov 2026: "In the text diff app, add 2 more text input options. One is to upload two local files. The second
  option is to name a file in a public GitHub repository with two different commit hashes. Also, add the option to download
  the difference as a universal patch file format.") — done 26 Nov 2026: "Compare" Typed text / Two files / A file on
  GitHub (a repository as people paste it — a file's github.com address fills the path and the first commit —, the path,
  two commits: full or short hashes, branches, tags; raw.githubusercontent.com and api.github.com, now in the CSP; every
  refusal said in words, the hour's limit with when it starts again); "Download .patch" with the files' names, or git's
  a/ b/ headers and the two commits for a repository's file — GNU patch, patch -p1 and git apply take them, the hunks are
  GNU diff -u's. Checked against the real GitHub. Unit ghdiff 37, e2e diff-sources 22 (+ diff 30). CLAUDE.md §3 Text Diff.
- **16. Cartoonizer: finer, more detailed results, more like the Prisma app** (owner, 26 Nov 2026: "The Cartoonizer app's
  output is too coarse-grained. Make it more fine-grained with more detail, more like the Prisma app. If you need to use a
  better library," — models at Claude's discretion) — done 26 Nov 2026: AI styles get **"Brush strokes"** Finest 4096 /
  Fine 2048 / Medium 1024 / Bold 512 px (never above the photo; Fine by default on a graphics card, Medium on a
  processor), painted in tiles above 1024 px, each tile normalised by the whole picture's statistics (seamless; the
  tiles give the one-pass painting back); filters get **"Detail"** Fine / Medium / Bold (Fine by default, 14 colours),
  and the save matches its preview at fine detail (an exact small Gaussian and a size-independent colour start in
  imgproc.wasm). Measured: the edges of the photo kept — AI Fine 0.147 against Bold 0.045, Cartoon Fine 0.946 against
  0.888. AnimeGAN / White-box looked at and offered as new styles (not added). e2e cartoon 45, cartoon-detail 10.
  CLAUDE.md §3 Cartoonizer, "Finer, more detailed results".
- **17. Watermark: a diagonal watermark across the picture; PDFs and Word documents, every page** (owner, 26 Nov 2026: "in
  the Watermark app, add two new options. First option, a watermark-style option; the watermark should be from the bottom
  left to the top right, diagonally right across the picture. And the second option is that I should be able to upload a
  PDF or a Word document, and the style of the watermark chosen should be applied to every page of this PDF or Word
  document.") — done 26 Nov 2026: **"Diagonal"** (the picture's or page's own diagonal, centred, as large as the margin
  allows; "Length along the diagonal"); **"Add PDFs or Word documents"**: every page, each by its own shape — PDFs through
  MuPDF (vector text in PDF's standard fonts, Meme / Script / other scripts as a picture of the text, the shadow, a logo
  with its transparency, passwords), Word documents with Word's own watermark in every header that shows on a page (each
  section its own header part, linked sections copied; 7-Zip and the browser's XML parser), a preview of the first page.
  Unit wmlayout 49, e2e watermark-docs 57 (MuPDF, python-docx and LibreOffice read the results). CLAUDE.md §3 "Blur &
  Redact, Watermark …".
- **15. Blur & Redact: every face found at once, or only the faces chosen** (owner, 26 Nov 2026: "the user should be able
  to have a toggle to find all faces and redact, or to remove that toggle and selectively choose only that face he wants
  to redact … any number of faces manually to redact and undo them, or select all the faces in one shot to redact.") —
  done 26 Nov 2026: the switch "Redact every face found" (on as before; off: faces only outlined until chosen; kept for
  the next photo), a tap per face hides or shows it, "Redact all faces" / "Show all faces", Undo and Ctrl+Z step by
  step, the count of faces found and hidden under the photo; Save saves what is shown. e2e redact 47 (the saved file's
  pixels at each face of a six-face group photo). CLAUDE.md §3 "Blur & Redact …".
- **28. Screenshot: scrolling screenshots** (owner, 26 Nov 2026: "Make a new option also for scrolling screenshots in the
  screenshot app.") — done 26 Nov 2026: "Take" → **A scrolling page**. A shared tab is shown in the tab and scrolled with the
  mouse wheel over its picture (Chrome's Captured Surface Control forwards the wheel; it has no way for a page to scroll
  by itself — the to-do's `sendWheel` shipped as `forwardWheel`), a window or a screen is scrolled by hand; the views are
  joined where they overlap by our C in imgproc.wasm (sticky headers and footers kept once), the picture pixel for pixel
  the page; a view scrolled too far or sideways, a blank stretch longer than the view, a resize and the 100-megapixel
  limit are said, the picture so far kept; above 32,000 rows in parts. Unit scrollstitch 24, e2e screenshot 68. CLAUDE.md
  §3 Screenshot, "Scrolling screenshots".
- **24. Screenshot: draw a rectangle with the mouse to take the screenshot** (owner, 26 Nov 2026: "In the screenshot app, add
  the ability for the user to draw a rectangular area with his mouse also as an option to take the screenshot") — done 26
  Nov 2026: "Take" → **An area (draw a rectangle)**: the frame is taken (after the countdown, with a delay) and shown frozen
  over the whole window — full screen at once while the click lasts, else a "Full screen" button —, at the screen's own
  pixels, dimmed; a rectangle dragged with the mouse or a finger (its size beside it), corners and sides adjustable, moved
  by a drag inside, the arrow keys for single pixels (Ctrl sizes, Shift steps of 10); Enter, a double-click or "Take this
  area" take it, Esc cancels, "Whole picture" takes all. The area goes to the editor at full resolution. Checked: unit
  areageom 37; e2e screenshot 55 — the area's PNG byte for byte the same rectangle of the whole shot (mouse, adjusted
  corner and side, move, keys, touch, a fitted 1920 × 1080 screen), Esc, a delay, leaving the tab. CLAUDE.md §3
  Screenshot, "An area drawn with the mouse".
- **21. Screencast: more countdowns; the sound level of the recording checked** (owner, 26 Nov 2026: "add … a 5-second
  countdown, an 8-second countdown, and a custom countdown in seconds … the volume of the output video seemed a little
  lower than the normal. Please check and confirm this. If it is actually so, then fix it.") — done 26 Nov 2026: the
  countdown is Off · 3 s · 5 s · 8 s · Custom (whole seconds 1 – 120, a wrong number said), kept while the page is open,
  and also shown in a small always-on-top window (as the Screenshot tab's) with "Start now" and "Cancel", closed before
  the first frame; a Cancel on the page too. **The level, checked:** known tones as the shared sound and as the
  microphone, recorded as MP4 and WebM, with and without the microphone — every tone in the file at the level played
  within 0.02 dB (the suite holds 0.5 dB): the recording does not lower the sound. Not seen by the tab: Chrome's
  processing of a real microphone and Windows lowering other sounds while a communications microphone is open. And
  (owner, 26 Nov 2026: "Yes") **"Bring the sound to a normal loudness"**: FFmpeg's loudnorm in two passes brings the sound
  to −16 LUFS (one gain where it can, its dynamic mode where it must), the picture's packets copied — measured −30.7 →
  −16.0 LUFS. e2e screencast 53, screenshot 22. CLAUDE.md §3 Screencast, "Countdowns and the sound level".
- **22. FFmpeg, "Extract audio": MP3 for the download** (owner, 26 Nov 2026: "in the extract audio option of the FFmpeg app,
  the extracted audio is by default in the .m4a format. Add an MP3 audio formats also for the download.") — done 26 Nov
  2026: the formats are buttons in plain sight — As it is (.m4a, named after the file's own sound) · MP3 · WAV · FLAC · OGG
  (Opus) —, MP3 with its quality (VBR V2 ≈ 190 kb/s, the default; 128 / 192 / 320 kb/s); an extracted sound that is not MP3
  has **"Download as MP3"** beside its Download (made from the file just extracted, by the same FFmpeg, no second run);
  the format and quality kept while the page is open. Checked: LAME's frames, the bitrate in every frame, the length and
  the loudness of the original (unit ffjobs 202, e2e ffmpeg). CLAUDE.md §3 FFmpeg, "Extract audio in plain sight".
- **23. FFmpeg: the sound of the results quieter than the original?** (owner, 26 Nov 2026: "In the FFmpeg app, the audio
  volume of the output resultant videos and audio files seems to be lower than when I hear it from the original. Please
  confirm if this is the case. If this is indeed the case, then please fix.") — **confirmed, and fixed 26 Nov 2026.**
  Every job measured (EBU R128, mono as heard on two speakers) on mono, stereo and 5.1 files, natively and in the
  browser: a mono sound made stereo came out 3 dB lower (Sound settings → Stereo, Join clips, the music under a mono
  voice) — now on both sides at full level, and mono joins stay mono; 5.1 got the stereo bitrate (Opus lost 2 dB) — now as
  much a channel; an AC-3's 5.1(side) failed as WebM and was written as an "unknown" layout in MP4 — now 5.1. Found on the
  way: **the tab's FFmpeg crashed on every stereo sound made Opus** (Convert → WebM / OGG; "memory access out of bounds" —
  every test file had been mono) — now made at a complexity the build runs; an exact trim of a WebM failed — now an MP4.
  "Mono" averages the two sides (FFmpeg's made it 3 dB louder and could clip). Kept, and said in the tab: "Normalise
  loudness" makes −16 LUFS on purpose; 5.1 mixed into two measures 0.6 – 0.8 dB lower (R128's surround weighting); a
  speed change of noise loses up to 1.3 dB (speech and music keep theirs). Every other job within 0.5 dB of the original
  (unit ffjobs 193; e2e ffmpeg). CLAUDE.md §3 FFmpeg, "Sound at its own level"; docs/BUGHUNT.md.
- **31. OCR tab: keep the page's formatting — bullets, sub-bullets, check boxes, indentation** (owner, 26 Nov 2026: "In
  the OCR app, the rich formatting should be preserved, the bullet points, etc. In the photo dictionary app, it need not
  be"; the owner's choices: text with bullets, lists only) — done 26 Nov 2026: the OCR tab's text — the box, Copy and
  the .txt — has the page's lists as they stand on it: • ◦ ▪ ◆ ► ☐ ☑ ☒ ◉ at the line starts, numbers and letters as
  read, four spaces a level, the lines an item runs on to under its text (`src/lib/listtext.ts`; the marks are the ones
  the clean-up clears, listed by imgproc's p_clear_marks with what each was). The Photo Dictionary's text stays plain.
  The clean-up itself: checklist boxes cleared after a word space, faint marks of a phone's photo found on the light
  ink, a soft "a." or "ii." kept as letters (counted with the marks for the reading's decisions), a word run together
  before a candidate honoured. Measured — the build before against this one, the same photos in the same order
  (Tesseract learns from the pages it read before): the reading as before (documents 92.2 → 92.2 % and 94.5 → 94.5 % of
  their words read right, harder layouts 81.7 → 81.6, Kindle 71.9 → 71.9 and 89.7 → 89.7 — every Kindle photo as before
  —, newspapers 66.4 → 66.3; no photo worse beyond its own noise); the lists, against the pages' own (108 photos of 18
  pages): 565 of 756 list items set out as on the page, mark or number and level (scans 90.5 %, phone stills 79.8 %,
  soft video frames 54.0 %), 85.3 % of the lines an item runs on to under its text, every photo's words the reading's;
  e2e OCR 95 and Photo Dictionary 127, on Windows too. CLAUDE.md §3 OCR, "The page's lists"; docs/BUGHUNT.md.
- **13. Every PC app on both Windows and Linux: a quick check across all the apps** (owner, 21 Nov 2026: "Just do a quick
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
  Windows fixed (ef43da3; docs/BUGHUNT.md "Windows / Linux" (10)).
  **Done 26 Nov 2026:** runs 6 – 13 of the Windows check ran every browser suite; what they found was fixed and pinned
  (docs/BUGHUNT.md "Windows / Linux" (1) – (15): a reference program that waited for a password from the Windows console,
  Git's gpg given Windows folders, a one-line screenshot outlined as a page in Arial, the clipboard's \r\n …). Every suite
  has passed on Windows — the last ones the OCR tabs with to-do #31: OCR 95 / 95, Photo Dictionary 127 / 127.
- **18. OCR and Photo Dictionary: the OCR tab as good as the Photo Dictionary; documents with rich formatting and with
  watermarks, above all from a phone's camera; measured on many real documents** (owner, 26 Nov 2026; "One shared reading
  path is fine.. but make sure no functionality is compramised.. the high quality of the ocr is paramount !!!") — done
  26 Nov 2026: **one reading path** for both tabs (`src/lib/readpage.ts`; every feature of each tab kept, asked for by
  option); the page found on a light desk too (edges checked, the Doc Scanner's network where the outline is not a
  page's, an outline that leaves the photo's text outside refused); bullets, check boxes and table rules cleared
  (`p_clear_marks` — the text's own look-alikes kept: "o", "i.", a colon, the word "a" on a soft Kindle line); pages of
  columns read column by column; a strong watermark taken out (`p_clear_wash`); an unsure page with a structure read
  again the other way. Measured on 150 photos (the Kindle and newspaper set and 126 photos of documents with formatting
  and watermarks — phone stills, video frames, scans), each before and after, worse only beyond its own noise: Kindle
  65.4 → 68.0 %, documents 71.6 → 87.1 %, harder layouts 63.3 → 75.3 %, watermarked 72.5 → 85.5 % (strong watermark
  74.4 → 82.3), stray signs where bullets stood 148 → 73 lines; **no photo reads worse**; Kindle photos read and take as
  long as before. PaddleOCR (PP-OCRv6) measured too: less overall, more on soft video frames — a fallback for soft photos
  (about 31 MB) was offered for the owner's decision, and **built at the owner's word the same day** ("Ok use PaddleOCR
  fallback for soft photos"): a reading Tesseract is unsure of (below 88) is read by PaddleOCR too and the reading with more
  words right as each reader's confidences say is kept — 80.6 → 86.6 % on the photos the rule was worked out on, 83.8 → 93.4 %
  on a second set made afresh, no photo worse (CLAUDE.md §3 OCR, "The second reader"). CLAUDE.md §3 OCR, "Documents";
  unit pageclean 50, readpage 22 (38 with the second reader), pagecrop 47; e2e OCR 83, Photo Dictionary 121 (with the
  second reader 91 and 124).
- **30. OpenPGP: every password or passphrase of an encrypting mode typed twice** (owner, 26 Nov 2026) — done 26 Nov
  2026: Encrypt, in both standards — the message password with "Repeat password", the signing key's passphrase with
  "Repeat passphrase"; two that differ are said under the boxes and refused (nothing made); Enter in the second box
  encrypts. e2e `pgp` 40 (gpg decrypts what was encrypted with the password typed twice), `pgp9580`.
- **29. Markdown Editor: "Copy with formatting"** (owner, 26 Nov 2026: "copy the rendered markdown with formatting so
  that he can paste it in, say, another Microsoft Word or any rich text setting") — done 26 Nov 2026: a Copy button and
  the toggle "Copy with formatting" (on by default, kept while the page is open): the rendered document as HTML + plain
  text, made for pasting (styles on each element, ☐ / ☑, footnotes, no ids); off, the Markdown as typed.
  `src/lib/mdcopy.ts`; e2e `markdown-copy` 21 (LibreOffice makes a .docx of the copy: Heading 1 – 3, list levels, the
  table, the code's font), `markdown` 46.
- **27. More room for the tab in use: the category's list of apps folds away** (owner, 26 Nov 2026; "for #27, remembered
  between visits like Favorites..") — done 26 Nov 2026: "Hide apps" at the end of the category row folds the tool row
  away ("All n apps" opens it); kept through apps, categories, reloads and other tabs (localStorage beside Favorites);
  Software on a PC gains about 330 px, a phone one row. `src/applist.ts`, `src/main.ts`; e2e `applist` 20; the shell,
  accessibility, touch-target and lazy-loading sweeps run with it. (The button is beside the category row, not at the
  tool row's end as planned: the tool row is a tab list, which may hold only tabs.)
- **26. Key Codes: key combinations such as Alt+W shown as one** (owner, 26 Nov 2026: "When I press alt+W, I'm not
  getting the alt+W code. Is this even possible? if so do it.") — done 26 Nov 2026: possible — the W key's event says
  "Alt held"; the tab now shows "Alt + W" large (AltGr, Win / Super / Command named per system, the key by its place),
  the recent keys as combinations (a modifier's row taken over by the key pressed while it is held), "As a shortcut"
  (Alt+W, alt+w, the JavaScript test, what a terminal receives — held to xterm.js itself), Windows' lone Alt taken so
  Chrome's menu does not steal the next key, and the combinations each system keeps named. `src/lib/keycombo.ts`; unit
  `keycombo` 28, e2e `keycode` 41. Not done: which reserved combinations reach a page cannot be checked from a test
  (its keys go straight to the page) — named from Microsoft's and Google's lists.
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
  Measured and not kept: sharpening, upscaling, Sauvola thresholding, PaddleOCR PP-OCRv6 (docs/WASM-AUDIT.md, tab 122) —
  PaddleOCR since 26 Nov 2026 the second reader for soft photos (CLAUDE.md §3 OCR, "The second reader").
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
