# RESUME HERE — sync point

Owner rule: this file is the hand-off point if a session stops (usage limit, container reset). It is updated and
pushed with **every** commit. A new session reads `CLAUDE.md` (spec + standing rules), then this file, then
continues from "Next steps" without asking the owner anything already decided.

## How to resume in a NEW session (owner instructions)
Start a new Claude Code session on the same repository (claude.ai/code or the Claude app → New session → repo
`ddastoor/utils`, same environment) and send:
> Continue building SuperUtils. Check out `main` (keep committing and pushing to main — I allow it), read CLAUDE.md
> and docs/RESUME.md, and carry on from "Next steps".

**Since 26 Nov 2026 all work goes to `main`** (owner: "merge the branch to main, push main, and start making subsequent
changes to main, and also … make the site live off of main"). The old working branch `claude/exciting-bohr-b9yfwc` was
merged into main (fast-forward, 1d5e8dc) and is no longer pushed to. **The site is published from main since 27 Nov 2026**
(the owner allowed main in the `github-pages` environment; first deploy 754d1b5 — CLAUDE.md §7, Deploy).

## ▶ NOW — 26 Nov 2026, morning (read this first)
**▶▶ 27 Nov 2026 — DONE: the owner's "Go ahead with all items in todo" (to-do #33 – #36), each committed and pushed:**
**#36** (the start page's note of the other device's apps), **#34** (Watermark: the first page of a document with or without
the mark), **#33** (Cartoonizer: how cartoony, in grades), **#35** (Text Diff: Side by side, the lines of a change paired by the
engine — our `pair_lines` in textkit-diff.wasm —, Previous / Next change round and round; CLAUDE.md §3 Text Diff).
**Then the owner's "Continue building out everything in todo.md": #37 DONE** (a "Paste image" button in the OCR and the
Photo Dictionary, on PCs and phones — `src/lib/clipimage.ts`, `imageInput(…, { paste: true })`; CLAUDE.md §3 OCR). todo.md
has no open item. The potentials list was shown to the owner, and at the owner's request (27 Nov 2026) Claude suggested an
order in four groups ("Suggested order" at the top of `docs/potentials.md`). **Next:** wait for the owner's pick; the size
check for each app picked, then build. **▶ 27 Nov 2026 — IN PROGRESS: the owner's "Go ahead with group 1"** (potentials
#96 Book Page Flattener, #110 Newspaper Clipper, #109 PDF for Kindle, #71 EPUB Reader, #106 Articles → Kindle, #14 PDF /
EPUB → Audiobook; then the flattener as a step of the OCR and the Photo Dictionary, measured). Size check, measured: #106's
dom_smoothie 0.20.0 as our own wasm build 1.07 MB (0.40 MB gzipped); #96 / #109 own C, tens of KB; the others nothing new —
563.5 → about 564.6 MB of the 1 GB. Order: #96 first. Each tab committed and pushed when done, and taken off potentials.md. **#96 Book Page Flattener — BUILT (27 Nov 2026):** the tab `bookflat` (Images, PC + mobile; CLAUDE.md §3 "Book Page
Flattener"), engine `wasm/imgproc/flatten.c` in imgproc.wasm (page-dewarp's method in C, measured against Leptonica's
dewarp and page-dewarp itself: docs/WASM-AUDIT.md 179), steps `src/lib/bookflat.ts`, unit `bookflat` 58 (ground truth of
`tests/fixtures/books/`, made by `scripts/make-book-photos.py`), e2e `bookflat` 29; taken off potentials.md. **Then, the same
day (measured against the ground truth and the OCR): the lens** (EXIF, else the main camera; a "Camera lens" choice — a
zoomed photo was skewed by up to 7 %), **the page drawn along the paper** (0.58 → 0.38 % off), **where a page ends** (the
paper's edges and specks of the table were taken for words; the page reached into the table; a spread's pages reach the
gutter) — unit `bookflat` 106, e2e 37; OCR of 16 photos 90.7 → 92.4 %. **#110 Newspaper Clipper — BUILT (27 Nov 2026):** the tab `clipper` (Images, PC + mobile; CLAUDE.md §3 "Newspaper
Clipper"): the page found, straightened, **sharpened** and read by Tesseract laid out as a page — again sharper when its
layout went wrong (columns lost next to a picture, soft text taken for vertical text: both measured, both fixed); headlines
by the width of their letters; a story from its headline (core boxes, rows of columns, the XY-cut on block gaps); the tall
picture, the A4 PDF cut between lines, the text with "Read aloud" (`src/lib/handoff.ts` → Text-to-Speech). Measured with
`node scripts/measure-clipper.mjs DIR` (photos of `scripts/make-newspaper-photos.py`): 93 of 127 stories clipped whole on 16
photos. Unit `clipper` 156, e2e `clipper` 48 (+ the camera sweep's entry); docs/WASM-AUDIT.md 180, docs/BUGHUNT.md; taken
off potentials.md. With it, **the start page's icons split in two** (it had reached 181 KB of its 180: `scripts/gen-icons.mjs`
— the start page's 183 icons, the tabs' own 99 with the first tab; 167 KB now; the lazy suite fails on an icon missing in any
tab's first view; CLAUDE.md §4). **#109 PDF for Kindle — BUILT (27 Nov 2026):** the tab `kindlepdf` (Documents, PC + mobile;
CLAUDE.md §3 "PDF for Kindle"): a page's regions by the XY-cut (title, each column, a figure across), each cut between lines
(our C in imgproc.wasm, `wasm/imgproc/kindle.c`) into pieces on pages of the Kindle screen's shape, "p. 3 · 2 of 4" on each;
the pieces vector — the page as a Form XObject clipped to the piece, the text outside it removed by MuPDF's redaction (big
rectangles a character's height off, bands through the centres of the nearer outside characters); scans as greyscale
pictures. Unit `kindlepdf` 68 (fixtures of `node scripts/make-kindle-pdfs.mjs`: every line once in order, figures, formulas,
tables whole, every vector piece the page's pixels at 3 px/pt), e2e `kindlepdf` 36; docs/WASM-AUDIT.md 181; taken off
potentials.md. **#71 EPUB Reader — BUILT (27 Nov 2026):** the tab `ebook` (Documents, PC + mobile; CLAUDE.md §3 "EPUB Reader"): EPUB, MOBI,
FictionBook, comics (CBZ, CBT; CBR / CB7 through 7-Zip), plain text and web pages, laid out and drawn by MuPDF in the tab's
worker; contents, Go to page, Back, two pages side by side on a wide window, keys / taps / swipe / wheel, search, selection with
Copy, the look (Literata — new TTFs, 1.0 MB —, Serif, Sans, the book's own; size, line spacing, margins, justified, the book's
styles; Light / Sepia / Dark / Black), the place kept, reading mode, Read aloud → Text-to-Speech, DRM refused in words. Unit
`ebook` 148, e2e `ebook` 59 (+ the site-wide sweeps); fixtures `python3 scripts/make-ebooks.py`; docs/WASM-AUDIT.md 182;
taken off potentials.md. **Question for the owner (later, not blocking):** keep the place in a book between visits, as
Favorites are? (hard rule 1 — not done.) **#106 Articles → Kindle — BUILT (27 Nov 2026):** the tab `articles` (Documents,
PC + mobile; CLAUDE.md §3 "Articles → Kindle"): web articles saved on the device — Chrome's / Edge's single file (.mhtml;
Chrome on Android saves pages so), Safari's web archive, a page saved "complete" with its folder, HTML only, a text file, a
pasted selection — made into one EPUB for Send to Kindle: the article alone (Mozilla Readability's algorithm, dom_smoothie
0.20.0 as our own wasm build `wasm/article` — the author's npm build 0.16.0 is Node-only and four releases behind, with
faults 0.17 – 0.20 fixed: docs/WASM-AUDIT.md 183), its pictures from the saved files (WebP / SVG / large ones drawn again),
title, author, site, date; a contents page for several, a cover; "Read it here" opens it in the EPUB Reader. Unit `articles`
198 (the MHTML and web-archive readers held to Python's email package and plistlib, four made-up pages saved four ways —
`scripts/make-article-pages.py`, Chrome's own MHTML by `scripts/make-article-mhtml.mjs` —, epubcheck), e2e `articles` 49
(the article held word for word to Mozilla's Readability.js in the browser's DOM; MuPDF reads every sentence of the EPUB);
taken off potentials.md. **#14 PDF / EPUB → Audiobook — BUILT (27 Nov 2026):** the tab `audiobook` (Documents, PC + mobile;
CLAUDE.md §3 "PDF / EPUB → Audiobook"): a book (EPUB, MOBI, FictionBook, text, a web page, a PDF through the PDF → EPUB engine)
read into tracks — one per chapter of its contents, else its headings, else parts of about 17 minutes; footnote marks, notes,
pictures, running heads, page numbers and a contents page left out — each said by the Text-to-Speech tab's voices (Kokoro,
Piper; their engine shared since: `src/lib/speech.ts`) straight into an MP3 stream with ID3 tags and the cover (our LAME in
audio.wasm, `a_mp3s_*`, gapless); one to four speech engines at once on a PC; the MP3s kept in the page (a zip with a playlist)
or saved into a folder as they are made — a folder that holds some is carried on from. Unit `audiobook` 61 (every word of
every test book in order — `python3 scripts/make-audiobook-books.py`), `audio` 64 (the stream byte for byte the one-shot file,
mutagen, FFmpeg); e2e `audiobook` 55 (real MP3s read back by ffprobe, FFmpeg and Whisper — `pip install faster-whisper`);
docs/WASM-AUDIT.md 184; taken off potentials.md. **#72 the flattener as a step of the OCR and the Photo Dictionary — DONE (27 Nov 2026), and with it group 1:** in the shared
reading path (`src/lib/readpage.ts`: `bookPages`, `isBook`, `bendOf`, `stackPages`; `BOOK_DEFAULT` = 'auto'; CLAUDE.md §3 OCR,
"Books"): a photo of an open book has its pages drawn flat before it is read, a spread's left page above its right one; a
spread read unsurely and a single page are read the usual way too and the better kept; the lens from the photo's EXIF.
Measured with the tabs' own code (`node scripts/measure-ocr.mjs SET --prep read --paddle`; variants `+noflat`, `+flatall`,
`+nolens`): open books 90.2 → 93.2 %, thick books 53.7 → 88.0 %, ultra-wide 84.9 → 96.0 %, 2× close-ups 63.9 → 67.3 %, the
fixtures 82.4 → 98.3 %, the 390 flat photos (Kindle, newspapers, documents, watermarks) unchanged — no photo worse. Unit
`readpage` 70, e2e `ocr-books` 25 (+ ocr, photodict, camera, paste-image, lazy). **Group 1 is complete** (potentials.md).
**▶ 27 Nov 2026, evening — IN PROGRESS: the owner's "Okay, go for it. Build out all the groups, all the remaining groups in
whichever order you feel best."** — groups 2, 3 and 4 of the suggested order (docs/potentials.md), sized there (about 62 MB
new in all, nearly all draw.io: the site ≈ 564 → 626 MB of the 1 GB); each app's size measured as it is built (an app much
bigger than said: stop and ask). **Order chosen:** group 2 — #84 Number Detective, #61 PDF Redact, #93 Safe ID Copy, #3 Make
PDF Searchable, #15 PDF Compare, #16 PDF Tables → Excel; then group 4 — #88 Router Sticker → Wi-Fi QR, #89 Visiting Card →
Contact, #77 Paper Deadlines → Calendar, #78 Bill Splitter by Photo, #81 Camera Reader; then group 3 — #73 World Clock, #10
Spell Checker, #1 Image to SVG with #117 Clipart Maker, #75 SliceDiceGrapher (covering #25 Chart Maker), #54 Diagram Editor.
Each app: its tab, unit + e2e suites, docs, taken off potentials.md, committed and pushed. **#84 Number Detective — BUILT (27 Nov
2026):** the tab `numcheck` (Codes & Files, PC + mobile; CLAUDE.md §3 "Number Detective"), engine devcore-ids.wasm (our Rust, 1.1 MB
with India Post's PIN directory, RBI's IFSC list, libphonenumber's Indian rules, the ISBN ranges …; `scripts/make-ids-data.py`), unit
`numcheck` 68 (8,503 answers of stdnum / libphonenumber / vininfo — `scripts/make-numcheck-reference.py` —, credit-card-type, second
readings of the PIN directory and the GS1 prefixes), e2e `numcheck` 33; docs/WASM-AUDIT.md 186. **#61 PDF Redact — BUILT (27 Nov
2026):** the tab `pdf-redact` (Documents, PC + mobile; CLAUDE.md §3 "PDF Redact"): the places found by devcore-ids `ids:scan` in each
page's text, by Tesseract in scanned pages and by zxing-cpp (QR codes); comments and form fields baked first; MuPDF's redaction in
two passes (a band through each line for the text — a box over solid-set lines took the neighbours' letters —, then pictures'
pixels, drawings and a black box); hidden places removed; the saved file read again. Unit `redact` 26, e2e `pdf-redact` 45 (read
back by MuPDF, poppler, pypdf, zbar); fixtures `python3 scripts/make-redact-pdfs.py`; docs/WASM-AUDIT.md 187. With it,
`src/lib/ocr.ts` hands Tesseract.js the picture's PNG bytes itself (a tab left during its start-up gave an uncaught error).
**#93 Safe ID Copy — BUILT (27 Nov 2026):** the tab `idcopy` (Documents, PC + mobile;
CLAUDE.md §3 "Safe ID Copy"): photos (the card found by the Doc Scanner's finder and straightened with a margin; read by the OCR's
reading path) or an e-Aadhaar PDF (password; its text, or the OCR for a picture page) → the first 8 digits of each Aadhaar number
and the first 12 of a VID under "XXXX XXXX", a QR that holds the number covered, "For … only · date" stamped across, a PDF of
pictures or one picture. Unit `idcopy` 36, e2e `idcopy` 34 (+ camera sweep); fixtures `python3 scripts/make-id-photos.py`;
docs/WASM-AUDIT.md 188. **#3 Make PDF Searchable — BUILT (27 Nov 2026):** the tab `pdf-ocr` (Documents,
PC + mobile; CLAUDE.md §3 "Make PDF Searchable"): pages without text found upright (turned by /Rotate, or their words written
along their lines), read by the OCR's reading path never straightened (`readPage`'s new `straighten: false`), their words written
as invisible text (`src/lib/searchable.ts` + `stampPage`), the password kept. Unit `searchable` 28, e2e `pdf-ocr` 50; fixtures
`python3 scripts/make-searchable-pdfs.py`; docs/WASM-AUDIT.md 189. **With it, the tabs' own styles moved beside them**
(`scripts/split-tab-css.py`: the start page 184 → 154 KB of its 180 KB budget; CLAUDE.md §4). **#15 PDF Compare — BUILT (27 Nov
2026):** the tab `pdf-compare` (Documents, PC + mobile; CLAUDE.md §3 "PDF Compare"): two PDFs' words compared (textkit-tokens.wasm,
the patience algorithm chosen by measurement; our sliding, clean-up and moves), the changes listed and marked on both versions'
pages side by side (scrolled together; one at a time on phones), Previous / Next, both PDFs saved with the changes as comments,
scanned pages through the OCR. Unit `pdfcompare` 45, e2e `pdf-compare` 44; fixtures `python3 scripts/make-compare-pdfs.py`;
docs/WASM-AUDIT.md 190. **#16 PDF Tables → Excel — BUILT (27 Nov 2026):** the tab `pdf-tables` (Documents, PC + mobile; CLAUDE.md §3
"PDF Tables → Excel"): our table finder in textcore.wasm (`wasm/textcore/table.c`: ruled grids and columns that line up — MuPDF's own
`table-hunt` lost columns on every test PDF, docs/WASM-AUDIT.md 191), tables over pages joined, amounts and dates typed, dates in
the .xlsx shown as printed (sheet.wasm), scanned pages through the OCR, a table drawn by hand. Unit `pdftables` 71 (pdfplumber,
openpyxl, LibreOffice), e2e `pdf-tables` 32; fixtures `python3 scripts/make-table-pdfs.py`. **Group 2 is done.** The stylesheet
split was checked tab by tab: 370 screenshots (every tab, PC and phone) before and after, the only differences random values,
timers and anti-aliased pixels. **Next: group 4 — #88 Router Sticker → Wi-Fi QR.**
**Then to-dos #38, #39 and #40** (owner,
27 Nov 2026, evening: "After you finish all these, finish off the items in the todo.md also."; #40, added the same evening:
the EPUB Reader's "Remember book" — a hash of the book, its place and the reading voice in the Settings — after #39). The open question (keep the EPUB Reader's place between visits?) is
answered by #40: yes, for the books the reader asks it to remember. **New, open: to-do #38** (owner, 27 Nov 2026, before the potentials: the OCR's and the
Photo Dictionary's text copied to the clipboard as soon as it is read) — not started; **the owner: later** ("will come back
to do later", 27 Nov 2026) — do not start it until the owner says so.
**Batch 1 done; batch 2 (#18 OCR + Photo Dictionary) DONE** (todo.md Done #18; CLAUDE.md §3 OCR, "Documents — one reading
path"): both tabs read through `src/lib/readpage.ts`; documents with bullets, tables, columns and watermarks read far
better, no photo of the 150 measured reads worse (Kindle 65.4 → 68.0 %, documents 71.6 → 87.1 %). Measuring: `node
scripts/measure-ocr.mjs DIR --prep read` (the tabs' own code; `--without op,…` takes a step out); the photo sets are made by
`scripts/make-kindle-photos.py`, `scripts/make-format-docs.mjs` + `scripts/make-doc-photos.py` (not in the repository).
**PaddleOCR as the second reader for soft photos — DONE** (the owner, 26 Nov 2026: "Ok use PaddleOCR fallback for soft
photos"; CLAUDE.md §3 OCR, "The second reader"; task #51): a reading Tesseract is unsure of (below 88) is read by PaddleOCR
too (PP-OCRv6 small, 31.2 MB, fetched with the first soft photo) — the page as it stands, or cleaned where marks were
cleared (`secondPicture`) — and the reading with more words right as each reader's confidences say is kept; columns
ordered by the XY-cut on the middles of the boxes (`cutInput`). Measured: training 80.6 → 86.6 %, a second set made afresh
83.8 → 93.4 %, 20 newspapers 52.6 → 65.6 %, no photo worse. The measuring scripts of the rule (analysis of the recorded
readings) were scratch work; the readings come from `OCR_JSON=DIR OCR_JSON_MAXCONF=92 node scripts/measure-ocr.mjs SET
--prep read --paddle`.
**#13 (Windows / Linux):** "Windows check" run 8 finished 15 suites and then hung for 2 h 24 min: the sodium suite's
reference decryptor waited for a password from the Windows console (Python's getpass ignores a pipe) — fixed in
`tools/sodium_decrypt.py`, and every suite's child processes now have a time limit (`tests/lib/child.mjs`; 9484594). Run 8
also failed pgp9580 and screencast without saying why (the harness prints the reasons as a suite ends now). **Run 9**
(pgp9580 screencast sodium slideshow unzip youtube sqlfmt): 227 of 228 — only pgp9580's gpg (a Windows GNUPGHOME given to
Git's POSIX gpg; fixed with `tests/e2e/_gpg.mjs`, aeece3b). **Run 10** (pgp9580 ocr photodict zip — the OCR tabs with the
second reader, 04c555e): 299 / 300 — the dark sentence in Arial (a one-line screenshot outlined as a page; the 6 : 1 rule);
runs 12 – 13 with #31: all green — #13 closed (below).
**New, 26 Nov 2026 (after the second reader): to-do #31** — the owner corrected #18 for the OCR tab: its text keeps the
page's formatting (bullets, check boxes, indentation); the Photo Dictionary's stays plain. **The owner chose: text with
bullets (• ◦ ▪ ☐ ☑ at the line starts, nested items indented — in the text box, Copy and the .txt), lists only (no
headings or tables), and next: right after #13 closes, before batch 3.**
**#31 — DONE (26 Nov 2026)** (todo.md Done #31; CLAUDE.md §3 OCR, "The page's lists"): the OCR tab's text keeps the
page's lists (marks, levels, run-on lines; box, Copy and .txt); the Photo Dictionary's stays plain. Measured with both
builds reading the same photos in the same order: the reading as before on every set (Kindle photo for photo), the lists
565 of 756 items as on the page. **#13 — DONE (26 Nov 2026)**: Windows check runs 12 – 13 — OCR 95 / 95, Photo Dictionary
127 / 127; every suite has passed on Windows. Measuring scratch (not in the repository): the clean-up's input of every
photo of the sets (`OCR_MARKS`) checks a later change of p_clear_marks quickly; HANDOFF lists the traps (an old module
with a new binding; the photo order).
**Batch 3 — #23 FFmpeg loudness: DONE (26 Nov 2026)** (todo.md Done #23; CLAUDE.md §3 FFmpeg, "Sound at its own level"):
confirmed — mono made stereo was 3 dB lower (Sound settings → Stereo, Join, music under a mono voice), 5.1 got the stereo
bitrate, an AC-3's 5.1(side) failed as WebM / was "unknown" in MP4; all fixed in `src/lib/ffjobs.ts`. Found on the way:
**the tab's FFmpeg (libopus 1.3.1 in ffmpeg.wasm 0.12) crashes on every stereo Opus at complexity ≥ 5** — made at 4
(`OPUS_SAFE`). New fixtures `stereo.mp4`, `surround.mkv` (`node scripts/make-sound-fixtures.mjs`). The owner asked (26 Nov)
for cool new FFmpeg uses (22 listed in chat — none built; add to todo.md only if he picks) and whether an own FFmpeg build
would undo these fixes (no: they are FFmpeg arguments; it would be its own to-do, after batch 3, only at his word).
**#22 FFmpeg "Extract audio" MP3: DONE (26 Nov 2026)** (todo.md Done #22): format buttons (As it is · MP3 · WAV · FLAC ·
OGG), MP3 quality (V2 / 128 / 192 / 320), "Download as MP3" on an extracted sound (`mp3Of`), the choice kept while the page
is open (`keptAudio` in `src/tools/ffmpeg.ts`).
**#21 Screencast: DONE (26 Nov 2026)** (todo.md Done #21): countdowns Off / 3 / 5 / 8 s / custom (1 – 120 s), kept while the
page is open, in an always-on-top window too (`src/lib/pipcount.ts`, shared with Screenshot); the level checked with known
tones (MP4 / WebM, ± microphone): within 0.02 dB — not lower. Offered to the owner (not built): an R128 "normal
loudness" button for the Screencast. **Batch 3 is complete.** (Disk: the scratchpad's 13 GB offline-TTS work folder `otts`
was deleted on 26 Nov to free space — the survey's results are committed; `scripts/accent-survey/` makes it again.)
**To-do #32 — DONE (27 Nov 2026; started at the owner's word, "yes go ahead with #32")** (todo.md Done #32; CLAUDE.md §3
FFmpeg, "22 new jobs"): 22 new FFmpeg jobs on the tab's FFmpeg 5.1 as it is — nine fixes (MKV → MP4, sound out of step,
one side, mains hum, a lecture evened out, HDR → SDR, black bars, a logo removed, metadata removed) and thirteen effects;
61 jobs in ten groups. A job can measure first (`then`), report (`report`), name its outputs from the log (`names`), try
again smaller (`next`). Unit `ffjobs2` 136 (native FFmpeg), e2e `ffmpeg-fixes` + `ffmpeg-effects` (the tab's FFmpeg in
the browser, read back natively by `tests/lib/ffread.mjs`); fixtures `node scripts/make-ffmpeg-fixtures.mjs`. **On Windows too** (the Windows
check, run 18, on 9a8545a): 206 / 206 in Chrome — ffmpeg 75, ffmpeg-sound 15, ffmpeg-fixes 51, ffmpeg-effects 55 (read back by
the native FFmpeg 9.1 there), scroll-focus 10; the FFmpeg suites in 3.4 minutes. **To-do #33 added (27 Nov
2026, the owner):** the Cartoonizer's Cartoon filter in grades, less to more cartoony — not started (ask when). **To-do #34 added (27 Nov 2026, the owner):** the Watermark tab's documents with or without the mark on the first (cover) page — not started (ask when). **To-do #35 added (27 Nov 2026, the owner):** the Text Diff side by side, Next / Previous through the hunks — not started (ask when). **Found while testing #32 and fixed (27 Nov 2026):** a control the browser scrolls into view landed under the sticky tab rows (WCAG 2.4.11) — `html` has scroll padding from the rows' height now (`--navh`, src/main.ts) and above the phone's action bar; e2e `scroll-focus` 10. **To-do #36 added (27 Nov 2026, the owner):** the start page tells a phone that there are PC-only apps and a PC that there are mobile-only apps — **DONE 27 Nov 2026** (the owner: "Go ahead with all items in todo" — #33 – #36; #36 first: a note on the start page, e2e `other-device` 36). The three that need our own FFmpeg build (a good stabiliser, Rubber Band pitch, VP9 / H.265) are
potentials.md U3 "Our own FFmpeg build".
**#20 Studio voice (batch 7), owner, 26 Nov 2026: "Just use your discretion and get the best quality"** — no samples to judge
and no size decision to wait for: choose by measurement (DNSMOS, noise left, speech kept), the best quality within the 1 GB.
**Screencast "Bring the sound to a normal loudness" — the owner said yes (26 Nov 2026): DONE** (`src/lib/normalize.ts`: FFmpeg's
loudnorm, two passes on the sound, mediabunny joins it to the picture's own packets; e2e screencast 53).
**The owner is asleep (26 Nov 2026, evening, for 9 hours): "if you have any questions, use your own discretion and take your
own recommended approach."** So: carry on in the batch order; decisions taken without him are written here (and in the
commit), to be shown to him when he is back.
**Batch 3 checks:** the Linux FFmpeg suite (with the fresh-page and speed fixes): 85 / 89 — the 4 failures were the suite's
own: the part that checks the MP3 choice is kept ran on a fresh page since the fixes, where the choice made at the start of
the suite (another page) does not exist; it now chooses MP3 at 320 kb/s itself (checked alone: 5 / 5).
**#24 Screenshot area drawn with the mouse: DONE (26 Nov 2026)** (todo.md Done #24; CLAUDE.md §3 Screenshot, "An area drawn
with the mouse"): `src/lib/areapick.ts` + `src/lib/areageom.ts`; unit areageom 37, e2e screenshot 55.
**#28 Scrolling screenshots: DONE (26 Nov 2026)** (todo.md Done #28; CLAUDE.md §3 Screenshot, "Scrolling screenshots"):
decision taken without the owner — Chrome has no way for a page to scroll another tab by itself (`sendWheel` shipped as
`forwardWheel`, which forwards the user's own wheel), so the user scrolls: over the shared tab's picture here, or the shared
window itself. **Batch 4 is complete.** The FFmpeg suite was split (the sound checks: `ffmpeg-sound.e2e.mjs`, 15 / 15 here)
— Windows check run 15 had timed out at 30 minutes on the joined suite.
**Work is on `main` now** (owner, 26 Nov 2026, evening). **The site was not updated after the morning** (every publishing
run failed in `npm test` since #26 — fixed); **published from main since 27 Nov 2026** (754d1b5; CLAUDE.md §7 Deploy).
**#15 Blur & Redact: DONE (26 Nov 2026)** (todo.md Done #15): the switch, a tap per face, all / none, Undo (Ctrl+Z); e2e 47.
**#17 Watermark: DONE (26 Nov 2026)** (todo.md Done #17; CLAUDE.md §3 "Blur & Redact, Watermark …"): "Diagonal" for photos and
documents; "Add PDFs or Word documents" — PDFs through MuPDF (vector text in PDF's standard fonts; Meme / Script as a picture of
the text), Word documents with Word's own watermark in every header a page shows (each section its own header parts). Decisions
taken without the owner: **the shadow goes onto documents too** ("the style chosen" — and the photo's white default shows on
paper only by its shadow): in PDFs the photo's soft shadow (a blurred picture of the glyphs under the vector text), in Word its
own VML shadow (not blurred; LibreOffice does not draw it); **fonts for documents:** Sans / Serif / Mono → Helvetica /
Times-Roman / Courier in PDFs and Arial / Georgia / Courier New in Word, Meme → a picture of Anton in PDFs and Impact in Word,
Script → a picture in PDFs and Segoe Script in Word; a protected PDF's copy has no password (as the other PDF tabs);
an existing Word watermark is replaced (as Word does). Unit wmlayout 49, e2e watermark-docs 57 + watermark 19.
**#16 Cartoonizer: DONE (26 Nov 2026)** (todo.md Done #16; CLAUDE.md §3 Cartoonizer, "Finer, more detailed results"): AI
styles painted up to the photo's size in tiles (each fed the whole picture's normalisation statistics — seamless), "Brush
strokes" Finest / Fine / Medium / Bold; the filters' "Detail" Fine / Medium / Bold (Fine by default); the Cartoon save
matches its preview. **Batch 5 is complete.** To show the owner when he is back: **AnimeGAN v2 / v3 styles** (anime looks:
Hayao, Shinkai, Paprika, a face portrait; ONNX on the site's ONNX Runtime, 4 – 8.6 MB each) and White-box Cartoonization
were looked at and not added — new styles of their own, his call; real paintings as styles need a source this sandbox can
reach (Wikimedia is blocked).
**#14 Text Diff: DONE (26 Nov 2026)** (todo.md Done #14; CLAUDE.md §3 Text Diff, "Two files, a file on GitHub …"): two files,
a file of a public GitHub repository at two commits (raw.githubusercontent.com + api.github.com — in the CSP now), proper
.patch files (GNU patch, git apply). Checked against the real GitHub. **Batch 6 is complete.**
**#20 Studio voice: DONE (26 Nov 2026, night)** (todo.md Done #20; CLAUDE.md §3 Noise Remover, "Studio voice";
docs/WASM-AUDIT.md 144b) — chosen by measurement (DEMAND street noise — traffic, a square, a station, a café — in the
LibriSpeech sentence at 0 / 5 / 10 dB; SI-SDR, DNSMOS P.835): **DeepFilterNet 3** (8.6 MB, `soniqo/DeepFilterNet3-ONNX`, MIT)
— SI-SDR 14.6 dB on average against RNNoise's 10.6, DNSMOS overall 3.18 against 3.10 (noisy 2.55); DPDFNet 48 kHz below it,
MossFormer2 48 kHz (229 MB) level on balance; WPE dereverberation measured and not added. Its DSP is our C in audio.wasm
(`wasm/audio/studio.c`, held to libDF), the network on ONNX Runtime Web in the noise worker, recordings in 10 s segments; then
**the studio finish** — DNSMOS overall 3.18 → 3.30. In the browser: 10.4 s cleaned in 3.1 s; SI-SDR 5.0 → 15.5 dB (RNNoise
11.2). **Decisions taken without the owner (to show him):** the loudness of a mono file is −16 LUFS as heard on two speakers
(−19 on its one channel: at −16 there natural speech needed its peaks limited 3 dB and more half the time); the EQ at ±3 dB
(±4 scored higher on DNSMOS — not chased); no dereverberation and no restoration network (measured / not needed). Unit dfn 33,
e2e noise-studio 28 (+ noise 25) — **both passed on Windows too** (the Windows check, run 16: 28 / 28, 25 / 25; run 17: FFmpeg 9.1's ebur128 there reads the result as −16 LUFS, true peak −1.5 dBTP); the site 563 MB. **Batch 7 is complete — the owner's batch order is finished.**
**Next:** the potentials process — it needs the owner (he picks the apps): when he is back, show him `docs/potentials.md`,
and ask (1) ~~when to do #32~~ — done on 27 Nov 2026; ~~when to do #33 – #35~~ — the owner: "Go ahead with all items in
todo" (27 Nov 2026), in progress (above); (2) ~~remind him to allow `main` in github-pages~~ — done by
the owner on 27 Nov 2026: the site is live from main (754d1b5); (3) offer the AnimeGAN / White-box styles for the Cartoonizer;
(4) tell him the decisions taken tonight (#16, #17, #20 above). (5) potentials #118 – #119 added at the owner's word (27 Nov 2026:
"Ok, add both to potentials") after the question of one WebAssembly module for everything (answered no — the reasons in
potentials.md, Round 10): #118 one module for mathcore, crypto and textcore (checked: likely no gain), #119 fetch a tab's code
and small engine ahead when the pointer rests on it (an engine fetched ahead bends the lazy-loading rule — the owner's word first). Until he answers: nothing new is started (the owner's rule:
never start a to-do item on your own).

## ▶ SYNC POINT — 21 Nov 2026, night (read this first; it supersedes the older "NOW" notes below)
The owner's weekly limit is nearly used up; work resumes on Thursday. Everything below is committed and pushed.
**Done on 21 Nov (all live):** OCR + Photo Dictionary read photos at any angle — letters + projection profiles, every turn
tried by a quick reading (CLAUDE.md §3 OCR, "At any angle"; to-do #11 and the angle request); potentials.md: #44, #65,
#66 removed by the owner, #76 – #113 added (round 7) and #114 – #116 (round 8: free online data); todo.md #13 added (every PC app on Windows and Linux, and X11 /
Wayland — also a standing rule at the top of CLAUDE.md).
**To-do #7 — done (21 Nov 2026):** every engine of the offline catalogue run here with its lock; the accent ranking at
104 Indian voices — the owner stopped the survey there ("if there are enough top Indian accents ranked, then can we
stop the remaining ranking altogether and get on with building the other apps"; todo.md Done #7). More, should it be
wanted: `scripts/accent-survey/finish-7.sh WORK --surveys` (resumes engine by engine), then `make-indian-accents.py
WORK` and the generator.
**The owner's plan (21 Nov 2026): "Continue all the to-dos. Make regular sync points. Commit, check-in. Once you're
done with all the to-dos, then we'll start iteratively looking at potentials.md to build out new apps."** That is the
go-ahead for every open to-do, #12 and #13 included: #8 (in progress), #10, #12, #13 — then the potentials process.
**Machine rules:** 16 GB of memory, no swap — two big models at once were killed; disk is a fixed allowance — when it
fills, clean what can be made again and carry on (owner, 21 Nov 2026).
**#8 Regex Tester flavours — DONE (21 Nov 2026):** ten flavours, each the engine its language runs (CLAUDE.md §3
`regex`; unit `regex-flavours` 559 against the native engines, e2e `regex-flavours` 84 + `regex` 32). **#10 bc variables — DONE (21 Nov 2026):** A … ZZ at the end of each result's row,
`$A` later, `$name = …`, set once (CLAUDE.md §2 "bc console"; unit `bcvars` 35, e2e `bc-console` 30). **#12 the Photo Dictionary's list A → Z — DONE (21 Nov 2026).** **#13 (Windows / Linux / X11 / Wayland) — IN PROGRESS:**
todo.md #13 has the progress. The Windows run: GitHub Actions → "Windows check" (`.github/workflows/windows.yml`,
workflow_dispatch; trigger it with the GitHub tools, read its log with get_job_logs; the log is also an artifact).
Done so far: Windows checkout (con.json / prn.json), the build's file:// paths, UTF-16 files in Hash and Sodium,
X11 / Wayland notes (Screen Info, Screenshot), `os.e2e.mjs`, Extract Archive's folder names, the Patch tab's CR LF, the
Keyboard Test's PrintScreen / Alt, the offline speech script's exit code. **The offline speech script runs on Windows**
("Windows offline speech", `.github/workflows/windows-tts.yml`; input `voices` = a JSON list, one job per entry of voice
ids — `tests/unit/offline-tts-run.test.mjs` with OFFLINE_TTS_E2E=1 and OFFLINE_TTS_VOICES): one job per engine (18) —
**all 18 make speech on Windows** — 16 at once; Kyutai (torch.compile needs a C++ compiler → moshi's NO_TORCH_COMPILE
where there is none) and F5-TTS (its lock had lost a Windows-only tzdata line: the lock generator dropped every
"emscripten" line) after the fixes of 26 Nov (run 3 of "Windows offline speech", both passed). The full browser run of 21 Nov ("Windows check" run 3) lost its runner mid-run (no log): a
targeted run of 30 suites (four at a time) was started on 26 Nov — it stopped in its setup (setup-python already
ships python3.exe; the copy refused "the same file"; fixed) and was started again ("Windows check" run 5): **19 of 30
suites passed** (1,159 / 1,217 checks; FFmpeg 72 / 72); of the 12 failures one was the app's (the Photo Dictionary's
online HTML — `stripTags`), eleven the suites' own on Windows (Linux faked by doing nothing, paths, Git Bash's
sha256sum / gpg, native Python; BUGHUNT "Windows / Linux" (10)) — all fixed in ef43da3 and passing here; **run 6** (the 15
suites touched) was started — read it, and when it is green close #13 — read it (get_job_logs, or the artifact
`e2e-windows`), tell failures of the app on Windows from suites that need a Linux tool, fix the first; then #13 is
done (docs: todo.md, CLAUDE.md) and the potentials process starts. **To-do #14 added on 26 Nov** (Text Diff: two local files, a file of a public GitHub repository at two commits — GitHub as a new data host —, a proper .patch download): **#15 added on 26 Nov** (Blur & Redact: a switch "Redact every face found", faces chosen one by one, Undo, all at once and back). **#16 added on 26 Nov** (Cartoonizer: finer, Prisma-like results — the owner's message was cut off after "If you need to use a better library,"; asked to finish it). **#17 added on 26 Nov** (Watermark: a diagonal position, bottom left to top right; PDFs and Word documents, every page). **#18 – #25 added on 26 Nov:** OCR + Photo Dictionary (the OCR tab as good as the Photo Dictionary; rich formatting — bullets, indentation — and watermarks, from a phone's camera; many real documents); Slideshow (whole pictures, nothing cut); Noise Remover ("Studio voice"); Screencast (countdowns 3 / 5 / 8 s and custom; the sound level checked); FFmpeg Extract audio (MP3 in plain sight — it is in the "Audio as" list already — and "Download as MP3" on the result); FFmpeg's sound quieter? (suspects: Join makes mono stereo at −3 dB, 5.1 mixed down); Screenshot (an area drawn with the mouse); bc console (`interest=20.78` then `$interest`); #26 Key Codes (Alt+W shown as one combination); #27 the category's list of apps folds away (more room for the tab in use); #28 Screenshot: scrolling screenshots; #29 Markdown Editor: "Copy with formatting" (rich text for Word); #30 OpenPGP: Encrypt's password and the signing key's passphrase typed twice. The owner was asked whether to build #14 – #30 right after #13, before the potentials list, and in which order. **Owner, 26 Nov 2026: "ok finish #13 first"** — #13 first; then ask again which of #14 – #30 to build, and in what order. **The order, approved by the owner on 26 Nov 2026 ("After #13, start in your suggested order above of next todo items"):** (1) quick wins — #19 Slideshow, #25 bc, #26 Key Codes, #27 folding app list (remembered between visits like Favorites — the owner's word), #29 Markdown copy, #30 OpenPGP; (2) #18 OCR + Photo Dictionary (his top area); (3) sound — #21 Screencast, #22 + #23 FFmpeg (one loudness check, one FFmpeg suite run); (4) Screenshot #24 + #28; (5) images — #15, #17, then #16 (models at Claude's discretion — owner, 26 Nov: "go ahead and use your discrestion.. if needed, i'll ask u to change later.."); (6) #14 Text Diff (raw.githubusercontent.com and api.github.com approved by the owner on 26 Nov); (7) #20 Studio voice (samples by ear + size check). **Batch 1, as it goes (26 Nov):** #19 Slideshow "Whole pictures (nothing cut)" — done (todo.md Done #19); #25 bc variables as $ names — done; #26 Key Codes (Alt + W as one, xterm.js-checked terminal bytes) — done; #27 folding app list — done; #29 Markdown "Copy with formatting" — done; #30 OpenPGP passwords typed twice — done: **batch 1 is complete**. Next: batch 2, #18 OCR + Photo Dictionary — and "Windows check" run 7 (#13 first if it fails). **Owner, 26 Nov 2026: after a change run only the
tests it needs; the full suite only at his word** (CLAUDE.md STANDING RULE #2).
**Then, in the owner's order:** #8 Regex Tester flavours (research done: PCRE2 — `pcre2-wasm` 10.49.3 or our own build;
Google's `re2-wasm` 1.0.2 for RE2 / Go; `vscode-oniguruma` 2.0.1 for Ruby / Oniguruma; Python's `re` through the Python
tab's CPython and the `regex` module; Perl through ExifTool's zeroperl, already on the site; JavaScript as now; Java and
.NET — to decide; native references in the sandbox: Go, Java 21, Perl 5.38, Ruby, Python 3.13 + regex, GNU grep -P / -E),
then #10 bc variables (todo.md has the owner's exact rules). #12 (the Photo Dictionary's list A → Z) and #13 (the
Windows / Linux / X11 / Wayland check) — the owner's go-ahead: "Continue all the to-dos". After the to-dos: the potentials
process (CLAUDE.md top: show the list, the owner picks, the size check, build).

## Moving to a local machine (owner is moving to Kubuntu, Nov 2026)
```bash
git clone https://github.com/ddastoor/utils.git && cd utils && git checkout claude/exciting-bohr-b9yfwc
npm ci                                   # Node 22; runs vendor + icon generation
npm i -g playwright@1.63.0 && npx playwright install chromium   # e2e browser
export NODE_PATH="$(npm root -g)"        # tests load the global playwright
npm test && npm run build && node tests/e2e.mjs
```
Zig for our wasm modules: CLAUDE.md §5 (pip ziglang 0.17.1). Start Claude Code in the folder with `claude`, or with
`claude remote-control` to steer it from the phone app. Pending owner decision: docs/potentials.md + docs/IDEAS.md (new-tab candidates) — remind the owner.

## ▶ NOW (17 Nov 2026): second-pass bug hunt over ALL 176 tabs — tracker `docs/BUGHUNT.md`
Owner: "Go through all the apps, search for bugs, write extensive more test cases for every single app, squash all bugs
— **don't leave out any app**." Every original tab is built (176/176, each with its own e2e suite); this pass looks for
what those suites missed.
- **Tracker:** `docs/BUGHUNT.md` — one row per tab (R reviewed · B bugs fixed · T checks added). Update it with
  `node scripts/bughunt.mjs set <id>[,<id>] R=✓ B=<n> T=<n> N="note"`; `node scripts/bughunt.mjs status` lists open tabs.
  A tab is done only when R is ticked. Bugs found are listed per tab in the Notes column and summarised below.
- **Method:** (1) an independent reviewer per area (fresh sub-agent, read-only) reads the source + suite and tries to
  break each tab in a served copy of the build; every finding is re-verified before fixing; (2) a sweep of all tabs on
  desktop + phone (page errors, horizontal scroll, touch targets < 44 px, controls without an accessible name, every
  button pressed in the default state, workers released on leave); (3) each confirmed bug fixed in the app and pinned by
  a new check in that tab's suite; (4) full `npm test` + `node tests/e2e.mjs` at the end of each area; commit + push per area.
- **Areas** (column "Area" in the tracker): net, misc, bitswebref, dev-data2, data-engines, calc-core, calc2-math, text,
  security-codes, images1, images2, pdf, docs2, audio, video, terminal, everyday-device, + the app shell.
- **Progress:** see the tracker; fixed-bug summary is appended here area by area.
- After the hunt: ask the owner which `docs/potentials.md` ideas to build (build none until picked).
- **Owner — three standing rules at the top of CLAUDE.md:** #1 WebAssembly first, **order settled on 18 Nov 2026**:
  (1) an existing tried-and-tested WebAssembly module (a famous, good one) — look for one first, and use it **only
  if it satisfies every condition and feature the owner asked for that utility**; (2) if there is none or none
  fits, our own WebAssembly build from open-source code (also ports of JS/TS-only functionality where possible);
  (3) only if that is not doable, a JS/TS library as it is, noted in §3a; everything hosted in the app. #2 Extensive tests for every
  utility: test, fix the bug or the test, test again. #3 Commit and push regularly and often — do not wait for the
  complete test run or for the whole utility.
- **Owner, 18 Nov 2026 — a task that comes BEFORE more new tabs:** "for all the apps that you've done a bug hunt for
  up till now, that is the 51 of them, see if you can replace the handwritten WebAssembly ones with already existing
  WebAssembly modules out there, but only if the WebAssembly modules out there fit all the requirements that I've
  asked you for. And then continue on the new apps for the bug hunt and test cases." **DONE (18 Nov 2026):**
  `docs/WASM-AUDIT.md` — one replacement (HMAC Generator → hash-wasm 4.13, suites re-run), 50 tabs keep their engine
  with the reason per tab; one open choice for the owner (Mermaid → Merman, recommendation: not yet).
- **Owner, 18 Nov 2026 (third message) — TWEAK to rule #1 + a SECOND PASS:** an existing wasm module that does not
  cover all the features of a utility is **still used**; the missing features are added beside it — (a) a
  supplementary wasm module of our own, (b) an existing JS/TS library, (c) our own JS/TS. Then: "use your best
  judgement.. but always try to do wasm-first in any case". **Second pass over the 52 hunted tabs: DONE (18 Nov
  2026)** — `docs/WASM-AUDIT.md` "Second pass": `hmac`, `totp` and `pwhash` now run on **hash-wasm** (keys.wasm is
  the supplement: Base32 / HOTP truncation, PHC strings and checks, Argon2 1.0, plus OpenSSH and API keys); jq
  (jq-wasm), python (Pyodide), curl (curlconverter), xml (libxml2-wasm), json (dprint), mdtable, mermaid (Merman)
  were re-checked and keep their engine, each with the evidence (faults inside the module, or a module that is days
  or months old). The same file lists the **candidates for the tabs still to be hunted** (121 after graphviz; graphviz →
  @viz-js/viz / @hpcc-js/wasm-graphviz, hash → hash-wasm, sodium tabs → libsodium-wrappers, MP3 →
  @mediabunny/mp3-encoder, noise → @jitsi/rnnoise-wasm, pitch → signalsmith-stretch, diff → @vscode/diff, zip →
  7z-wasm, …): each is tried when its tab is reached.
- **Owner, 18 Nov 2026 — order of work for every tab from the 52nd on:** (1) check whether a WebAssembly module we
  wrote can be replaced by an existing one under STANDING RULE #1 and write the tab's entry in `docs/WASM-AUDIT.md`
  (candidates already noted there: hash-wasm for `hash`, libsodium-wrappers for the sodium tabs, @hpcc-js/wasm-graphviz,
  @vscode/diff, …); (2) hunt bugs; (3) extensive tests; (4) fix, re-test; (5) next tab. "Keep going."
- **Found during the audit and fixed:** our jq build showed local time as UTC → `wasm/jq/hosttz.c` + the shared
  `tzInfoImport` (891 reference cases from the native jq 1.8.2 in 27 zones; Python's `time.mktime` on clock-change
  nights corrected by the same host code).
- **Complete suites after the data-engines area (19 Nov):** `npm test` 18,334 / 18,334; `node tests/e2e.mjs`
  4,976 of 4,977 in 188 suites — the one failure was a stale expectation in `json.e2e.mjs` (corrected).
- **NOW: area calc-core** (18 tabs: calc, units, dates, emi, gst, sip, fd, percent, words, timezone, bmi, calories,
  duedate, tip, fuel, gpa, base, roman — `src/tools/calc.ts`, `src/tools/calculators.ts`, engine mathcore).
  **`calc` (tab 56) is DONE** (21 bugs; unit `calc.test.mjs` 243 with mpmath as reference, e2e 140; CLAUDE.md §3
  "Scientific Calculator as built"). **`units` (tab 57) is DONE** (6 bugs; `src/lib/units.ts`, every factor held
  to GNU Units — `apt-get install units`). **`dates` (tab 58) is DONE** (7 bugs; `src/lib/dates.ts`, held to
  Python's datetime; `today()` is the local date now). **`emi` (tab 59) is DONE** (15 bugs; `src/lib/finance.ts`,
  closed forms in mathcore, reference `tests/fixtures/finance/reference.json` — `pip install mpmath numpy-financial`,
  `python3 scripts/make-finance-reference.py`; the fixture already holds the answers for SIP, FD / RD, GST and
  Percentage).
  **`gst` (tab 60) is DONE** (6 bugs; whole paise in mathcore `m_gst`, held to Python's decimal; "Other" rate).
  **`sip` (tab 61) is DONE** (10 bugs; `sipPlan`, held to mpmath + numpy-financial's fv). **`fd` (tab 62) is
  DONE** (11 bugs; `fdPlan`, mathcore `growth()`, `roundDec` in the shared formatters). **`percent` (tab 63) is
  DONE** (9 bugs; `src/lib/percent.ts`: exact decimals, held to Python's fractions). **`words` (tab 64) is DONE**
  (10 bugs; `src/lib/words.ts`, "and" rule in mathcore `m_words`, held to num2words — `pip install num2words
  --no-deps`). **`timezone` (tab 65) is DONE** (6 bugs; `src/lib/tz.ts`, a "To zone", held to Python's zoneinfo).
  **`bmi`, `calories`, `duedate` (tabs 66 – 68) are DONE** (6 + 2 + 5 bugs; `src/lib/health.ts`, held to exact
  fractions and Python's datetime). **`tip`, `fuel`, `gpa` (tabs 69 – 71) are DONE** (4 + 5 + 4 bugs;
  `src/lib/smallcalc.ts`). **`base`, `roman` (tabs 72 – 73) are DONE** (6 + 4 bugs; `src/lib/numerals.ts`).
  **calc-core is complete (18 tabs)** — complete suites after it: 19,492 unit checks, 5,401 e2e checks in 188
  suites, all green. **Area calc2-math, in progress:** **`prepay`, `ppf`, `epf`, `nps`, `inflation` (tabs 74 – 78)
  are DONE** (9 + 5 + 6 + 7 + 6 bugs; plans in `src/lib/finance.ts`, engine `m_prepay` / `m_epf` / `m_nps` / `m_ppf`,
  held to mpmath — `scripts/make-finance2-reference.py`; EPF follows the EPFO's interest method, NPS the PFRDA rules
  of December 2025). **`sleep`, `bodyfat`, `idealweight`, `coords` (tabs 79 – 82) are DONE** (4 + 7 + 3 + 13
  bugs; `src/lib/health.ts`, `src/lib/coords.ts`; **new engine `geo.wasm`** = Karney's geodesic.c on WGS-84,
  `wasm/geo`, CLAUDE.md §5.1n; references `scripts/make-body-reference.py`, `scripts/make-geo-reference.py` — the
  latter needs `pip install geographiclib mpmath`). **`graph` (tab 83) is DONE** (11 bugs, among them a frozen tab on deep zoom; engine
  `m_expr_plot`, `src/lib/graph.ts`). **`equation` (tab 84) is DONE** (14 bugs; exact fractions on BigInt in
  `src/lib/exact.ts` + `src/lib/equations.ts`, Kahan's quadratic / cubic in mathcore; reference
  `scripts/make-equations-reference.py`). **`stats` (tab 85) is DONE** (12 bugs; exact sums in mathcore, `src/lib/stats.ts`,
  reference `scripts/make-stats-reference.py`). **`matrix` (tab 86) is DONE** (8 bugs; exact fractions in `src/lib/matrix.ts`,
  reference `scripts/make-matrix-reference.py`). **`fraction`, `primes` (tabs 87 – 88) are DONE** (6 + 5 bugs; the
  fraction engine counts in 128 bits; references `scripts/make-fraction-reference.py`,
  `scripts/make-primes-reference.py` — the latter needs `pip install sympy`). **`periodic` (tab 89) is DONE** (5 bugs; data held to the `mendeleev` package —
  `scripts/make-periodic-reference.py`). **Area calc2-math is complete (16 tabs: 74 – 89)** — complete suites after it: 20,085 unit checks, 5,613 e2e checks in 188 suites (two failures found and fixed: the start page was 1 KB over its budget → search keywords now live in `src/keywords.ts` and load with the search box; one stale expectation in `math.e2e.mjs`; and a shell bug found on the way — the search box's result list was hidden by a stale timer when the reader came straight back to the box). **Area text has begun: `wordcount` (tab 90) is DONE** (17 bugs; new engine `textkit.wasm`; reference `scripts/make-wordcount-reference.py`, needs `pip install pysbd regex`; `lazyEngine` in `src/lifecycle.ts` now makes every engine wrapper retry a failed download). **`case` (tab 91) is DONE** (14 bugs; the conversions are textkit.wasm's `tk_case`; reference `scripts/make-case-reference.py`, needs `pip install titlecase regex`; npm `change-case` is a test-only devDependency). **`lines` (tab 92) is DONE** (10 bugs; `src/lib/linetools.ts`; reference `scripts/make-lines-reference.py` — GNU coreutils). **`replace` (tab 93) is DONE** (9 bugs; runs in the regex worker with a 5 s limit; reference `scripts/make-replace-reference.py` — Python's re). **`diff` (tab 94) is DONE** (9 bugs; engine replaced by the `similar` crate in textkit-diff.wasm; reference `scripts/make-diff-reference.py` — GNU diff, and GNU patch in the suites). **`fancy` (tab 95) is DONE** (10 bugs; styles in `src/lib/fancy.ts`; the characters of a text with emoji or another script come from textkit.wasm's new `tk_clusters`, fetched with the first such text; reference `scripts/make-fancy-reference.py` — Python's `unicodedata`, no install needed). **`emoji` (tab 96) is DONE** (7 bugs; data `src/lib/emoji-data.json` from `python3 scripts/make-emoji-data.py` — emojibase-data in node_modules + Python's unicodedata; the search is textcore.wasm's ranking; reference `scripts/make-emoji-reference.py` needs perl). **`morse` (tab 97) is DONE** (11 bugs; `src/lib/morse.ts`; reference `scripts/make-morse-reference.py` — unixcw's libcw through ctypes, `apt install cw`). **`lorem` (tab 98) is DONE** (9 bugs; engine replaced: the `lipsum` crate in textkit-lorem.wasm, our glue in `wasm/textkit/src/lorem.rs`; reference `scripts/make-lorem-reference.py` — needs the crate in cargo's cache, so build wasm/textkit first). **`photodict` (tab 99) is DONE** (6 bugs; textcore.wasm `rare.c` fixed — case table, titles and initials, bounded writes). **Area text is complete (10 tabs: 90 – 99)** — complete suites after it: 20,757 unit assertions, 5,853 e2e checks in 188 suites, all green. **Area security-codes has begun: `pgp` (tab 100) is DONE** (8 bugs — a second recipient was dropped; engine kept: OpenPGP.js, judgement in docs/WASM-AUDIT.md 100; the e2e suite needs gpg). **`sodium` (tab 101) is DONE** (5 bugs; the cryptography moved to libsodium.js — `libsodium-wrappers-sumo`, libsodium 1.0.22 — crypto.wasm kept for the USODIUM1 header; docs/WASM-AUDIT.md 101). **`sharelink` (tab 102) is DONE** (10 bugs; links read as they arrive — `readShareLink` in `src/lib/sodium-format.ts`; password typed twice; long-link note). **`hash` (tab 103) is DONE** (10 bugs; engine → hash-wasm in `src/workers/hash.worker.ts`, 23 algorithms; checksum lists; reference `scripts/make-hash-reference.py` needs `pip install pycryptodomex blake3 xxhash crc32c`, the suites also use `apt install xxhash rhash` where present). **`password` (tab 104) is DONE** (3 bugs; randombytes_uniform from libsodium.js; exact entropy in `src/lib/passwords.ts`). **`passphrase` (tab 105) is DONE** (3 bugs — the word list was not checked; libsodium.js; the lazy suite now sees root `data/` / `vendor/` / `models/` files). **`qr` (tab 106) is DONE** (7 bugs — UPI amounts with commas were dropped; zxing-wasm 3.1.7 is the latest; `src/lib/qrdata.ts`; the suites read codes back with zbar too: `apt install zbar-tools dmtx-utils`). **`barcode` (tab 107) is DONE** (5 bugs — zint padded short EANs with zeros without a word; `src/lib/barcodes.ts`; reference `scripts/make-barcode-reference.py`, `pip install python-stdnum`). **`scan` (tab 108) is DONE** (3 bugs — a second Start left the camera on; codes shown field by field: `describeCode` in `src/lib/qrdata.ts`). **`zip` (tab 109) is DONE** (5 bugs; engine → 7-Zip (7z-wasm 1.2.0) in `src/workers/sevenzip.worker.ts`, zip.js only above 1.5 GB / 256 MB on phones; 7z format added). **`unzip` (tab 110) is DONE** (3 bugs; 7-Zip reads every archive, libarchive.js removed; RAR fixtures from rarfile, reference `unar`). **Area security-codes is complete (11 tabs: 100 – 110)** — complete suites after it: see BUGHUNT. Complete suites after it: unit 21,097 green; e2e 6,005 / 6,010 — the QR box name fixed; four load flakes (formphoto, keycode, mermaid, resume) pass alone: **look at keycode's and mermaid's timing** (reviewed tabs), formphoto and resume with their areas. **Area images1 has begun: `image` (tab 111) and `batch` (tab 112) are DONE** (4 + 4 bugs; resizing → @jsquash/resize in linear light; JPEG of a transparent picture on white; straighten crops its corners; unique result names). **`heic` (tab 113) is DONE** (3 bugs — iPhone colours: Display P3 → sRGB with lcms-wasm in the codec worker; reference `scripts/make-heic-reference.py`, `pip install pillow-heif`). **`passport` (tab 114) is DONE** (4 bugs; `src/lib/camera.ts` words camera errors for every camera tab). **`formphoto` (tab 115) is DONE** (8 bugs — KB read strictly, dpi before padding, metacore padding exact (rebuilt metacore.wasm), no download of an over-max file; the load flake fixed). **`bgremove` (tab 116) is DONE** (8 bugs; its `.swatch` CSS had broken the Color tab's sample — `.bg-swatch` now). **`cartoon` (tab 117) is DONE** (7 bugs; see-through photos on white — `onWhite` in imgio; one AI painting at a time). **Complete suites for images1:** unit 21,138 green; e2e 6,104 / 6,111 — the 7 red checks were the new redact and watermark tests run against the old build (edited during the run); both green on the new build. **`redact` (118), `watermark` (119), `caption` (120), `collage` (121) are DONE** (17 bugs). **`exif` (122) is DONE** (8 bugs; engine replaced by ExifTool 13.42 on zeroperl — an iPhone HEIC's position was hidden). **DONE: todo.md item 2 (owner's choice) — FFmpeg tab, 21 new jobs** (39 in all; `src/lib/ffjobs.ts`, the tab rewritten on it; unit `ffjobs.test.mjs` 110 — native FFmpeg 6.1, `apt install ffmpeg`; e2e `ffmpeg.e2e.mjs` 68, 26 minutes, green; the core's JPEG encoder crash found and avoided — MozJPEG makes every JPEG). **`scanner` (tab 123) is DONE** (12 bugs; page finding → DocCornerNet LEAN (scanic-ml 0.2.0, MIT) on the app's ONNX Runtime Web, docs/WASM-AUDIT.md 121 — on 17 real photos 15 found against 10, on 53 generated 43 against 20; imgproc got OpenCV's area resize `p_resize_area`; fixtures `scripts/make-scan-photos.py`, `scripts/make-scanner-reference.py` — `pip install scikit-image opencv-python-headless`). **`ocr` (tab 124) is DONE** (6 bugs — a language file that could not be fetched hung the tab for ever; sideways pictures turned by themselves; the shared picker no longer forces the phone's camera, which also fixed Passport and Signature). **`signature` (tab 125) is DONE** (5 bugs — a narrower window cut the signature off; the ink colour; fonts only for "Type"). **Area images2 is complete (tabs 118 – 125).** The complete suites for it: unit — every assertion passed when the machine was not saturated (a parallel browser run made Vite's module loader time out at 60 s: run `npm test` alone); the complete browser run was restarted on a snapshot (`scratchpad/fullrun`, log `full-e2e2.log`). **Area pdf is under way:** `pdf-merge` (126, 4 bugs — **MuPDF's graftPage dropped every annotation, link, form field and outline**; new `mergePdfs` / `subsetPdf` in `src/lib/pdf.ts`; unit `pdfpages.test.mjs` read back by pypdf), `pdf-split` (127, 4), `pdf-organize` (128, 4), `img2pdf` (129, 3), `pdf2img` (130, 4), `pdf-compress` (131, 5 — a PDF chosen mid-run got the first one's result), `pdf-sign` (132, 6 — the signature went on the page being read), `pdf-fill` (133, 3) are DONE. `pdf-unlock` (134, 1), `pdf-protect` (135, 2), `pdf2text` (136, 4), `pdf-pagenum` (137, 2), `pdf-watermark` (138, 2) are DONE — **area pdf is complete (13 tabs: 126 – 138, 42 bugs)**; its complete browser run: 6,253 / 6,265 — 12 checks in 7 suites (graphviz, jq, keycode, redact, resume, sodium, speaker) failed on the saturated machine and all pass when run again (sodium's PyNaCl step now says why instead of crashing; look at resume's "photo included" with its tab). **Area docs2 has begun: `epub` (tab 139) is DONE** (17 bugs — the Federal Register's three columns were read across, line by line; margin stamps; bold/size of a line; U+FFFF; formulas; bookmarks; /Lang; the tab froze; a newer PDF did not end a run; WASM-AUDIT 136: our XY-cut stays, MuPDF's `segment` reads worse; textcore.wasm rebuilt — `t_xycut` has a `minh` argument; new unit `pdf2epub.test.mjs`, reference `scripts/make-epub-reference.py` (poppler-utils); **epubcheck**: Java 21 + the jar from github.com/w3c/epubcheck/releases unpacked under /opt/epubcheck* or `EPUBCHECK=`). **`sheet` (tab 140) is DONE** (18 bugs — Excel's error values, durations past 24 h, 15-digit numbers, +91 phone numbers and long IDs no longer turned into numbers, JSON keys and IDs, Windows-1252 / UTF-16 CSVs, web-page ".xls" and Excel 2003 XML read; sheet.wasm rebuilt; every cell of five workbooks held to LibreOffice Calc — `python3 scripts/make-sheet-fixtures.py` needs openpyxl + LibreOffice). **`markdown` (tab 141) is DONE** (12 bugs — a footnote link left the tab and lost the text; Ctrl+K stole the focus (shell); Ctrl+P printed the app; remote pictures; undoable toggles; GitHub heading ids; the 744 GFM spec examples in the unit suite; github-slugger is a test-only devDependency). **`invoice` (142, 7 bugs — the UPI QR wrote @ as %40), `rent` (143, 6 — cash receipts spilled onto empty pages; 36-month cut), `resume` (144, 6 — links, JPEG photo, the download did not wait for the photo: the full run's flaky "photo included") are DONE — area docs2 is complete (tabs 139 – 144).** **Area audio has begun: `audio` (145, 5 bugs — every file was decoded at the device's rate; `decodeAudio` now decodes at the file's own rate, shared by noise / pitch / stt / slideshow) and `tts` (146, 6 — after Stop the Speak button stayed busy for good; two runs on one ONNX session) are DONE.** Also: the unit harness no longer times module fetches out at 60 s (`tests/unit.mjs` — the crashed suites of busy runs). The STT suite passes on the new decoding (11/11). **`noise` (147, 11 bugs) is DONE — engine replaced: Jitsi's RNNoise 0.2 build (`@jitsi/rnnoise-wasm` 0.2.1; ours ran the release's debug float weights, 4× larger), reference `bash scripts/make-rnnoise-reference.sh` (native release); a strength is only mixed now; 16-bit WAV written by the browser's own rule (Chromium ÷32767 above zero) so saving unchanged is lossless — audio.wasm rebuilt (`a_scale`, `a_wav` flag).** **`pitch` (148, 8 bugs) is DONE — engine replaced: Signalsmith Stretch 1.3.2 (`signalsmith-stretch`, official wasm/AudioWorklet, MIT) rendered offline (`src/lib/stretch.ts`); our WSOLA removed from audio.wasm.** **`stt` (149, 11 bugs) — the names box now guides the whole recording (`carry_initial_prompt`, whisper.wasm rebuilt); decoded at 16 kHz; a new file clears the old transcript. Its e2e: 18 / 19, the one red was the test's own pattern (fixed).** **Area video (150 – 155) reviewed and fixed: AAC for MP4 sound everywhere by @mediabunny/aac-encoder (`src/lib/aac.ts`: `ensureAac`, `finishRecording`), Video Compressor (Vorbis kept in MP4, size mode made files bigger), Slideshow (snapshot), FFmpeg (new file during a job; libav.js checked — stays), Screencast (countdown), Screenshot (cloned tracks kept the share alive; PNG gallery), YouTube (player of another video; `src/lib/ytclip.ts`). Their e2e run: 165 / 168 — Slideshow's "newest music" check read the wrong card (test fixed, 19/19); FFmpeg's "reverse" failed only under load (passes alone); FFmpeg's solo run 70 / 71 found that the "new file" stop note was wiped by the probe (fixed; re-run in progress).** **`terminal` (156, 3 bugs — a crashed shell left the terminal dead; v86 recorded in WASM-AUDIT 153 for the owner) is DONE. Area everyday-device (157 – 176, 61 bugs) is DONE:** the timers ring in a background tab (one timeout per planned end set at Start, planned ends, sleep counted by `timerNow()`, wake lock asked for again, a setting changed keeps the run), Dice and Coin on libsodium.js (WASM-AUDIT 155), Random Number up to 2⁵³; camera / microphone requests gated (no stream left on), the compass from the whole orientation (`src/lib/sensors.ts`, unit `sensors.test.mjs` held to the W3C spec's example), the level in landscape, the keyboard's navigation keys and number pad, Leq in the sound meter. **ALL 176 TABS REVIEWED.** Owner, 20 Nov 2026: "Be thorough in the bug hunt and test cases coverage" → **cross-cutting sweeps added** (docs/BUGHUNT.md "Cross-cutting sweeps"): `touch-targets.e2e.mjs` (every phone tab's controls ≥ 44 px), `a11y.e2e.mjs` (axe-core, WCAG 2.2 A/AA, every page, desktop light + dark, phone dark — 11 kinds of fault fixed: hint contrast, undefined CSS colours, Markdown `pre lang`, nameless selects …), unit `css-vars.test.mjs`; FFmpeg's Stop during the load fixed; a second look at Dead Pixel Test (iPhone trap), Ruler (zoom), Dice (screen readers). Tracker: 1,197 bugs fixed, 21,893 checks added (after the sweeps below: 1,220 and 21,918). Unit suites complete: 21,731 / 21,731. Then `junk-files.e2e.mjs` (empty and random files in all 71 file pickers: ten text tabs read Windows-1252 and refuse binary files through `src/lib/textfile.ts`; the scanner and FFmpeg say what is wrong), probes with nothing to fix (360 px phone, rapid tab switching, keyboard focus on every control), and **half a megabyte pasted into every text box: Rent Receipt froze for over 40 s → every box of the three document forms has a length limit, rows stop at 100 (`cutText`, `MAX_*` in `src/lib/docrules.ts`)**. Then: Morse Code (a long text crashed) and Unicode Inspector (2.6 s a key) fixed; 100 KB in every one-line box → Mock Data froze and Markdown Table took 0.45 s a key in a big sheet (fixed); phone sideways: clean; **PDF → Images kept its pictures after the tab was left** (fixed; the harness's `released()` checks it in the sixteen suites of tabs with blob URLs); **a refused engine download left twelve tabs silent with an uncaught error** (the shell says it now; new suite `engine-download.e2e.mjs`). The complete e2e run (before these): 6,537 / 6,540 — three test races fixed; FFmpeg's Stop check raced a 1.6 s job (now waits for "Working"). Also since: reduced motion respected, big lists no longer overflow the call stack (Create Zip 150,000 files, Extract Archive, Markdown Table 160,000 rows), favorites follow a data clear in another tab; time zones (IST, Pacific), long file names, timers after leave, listeners, workers: clean. Unit 21,756 / 21,756. **The complete e2e run on the new build: green** — 6,596 / 6,597 in 192 suites, the one red being FFmpeg's page crash, which is the headless shell's own (signal 11 in Chromium; the full Chromium runs the same long session 72 / 72; the suite runs its Stop checks on a fresh page: 72 / 72) — docs/BUGHUNT.md. **Owner, 20 Nov 2026: v86 left out completely.** **Owner, 20 Nov 2026: ten everyday ideas added to docs/potentials.md (#61 – #70, "add all ten"); next work: "nothing for now"; then "merge to main and push … make it live".** **Going live (20 Nov 2026):** the Pages build had stopped at one unit check on GitHub's machine — `ubuntu-latest` is now Ubuntu 26.04, whose `sha256sum` (uutils 0.10) cannot read an escaped checksum line; the Hash tab now writes a name with a backslash as it is (GNU, uutils and BusyBox all read it), line breaks still escaped (docs/BUGHUNT.md, sweeps). Unit 21,763 / 21,763; then merged into `main` and pushed. **The owner switched Pages on; the site is published from the repository's default branch, `claude/exciting-bohr-b9yfwc` (Pages' environment refused `main`): https://ddastoor.github.io/utils/** — the workflow now builds and tests every branch and publishes only from the default branch (CLAUDE.md §7). **Owner rule, 20 Nov 2026: a size check before every new app from docs/potentials.md** — the MB it adds, the new total against GitHub Pages' 1 GB (now 512 MB, 488 MB of room), what could be removed to make room; then the owner decides (CLAUDE.md top). **Owner, 20 Nov 2026: Speech to Text removed completely** (and Auto Subtitles from the potentials) to make room for apps used more often — 175 tabs, the site 512 MB; **EPUB Reader added to the potentials (#71)**. **Owner, 20 Nov 2026: OCR takes a photo with the camera** — the phone's back camera, the PC's webcam, live in the page with Snap (`src/lib/livecam.ts`, shared; OCR e2e 57). **Then: the camera in every tab that takes a picture** (built into `imageInput` / `imagePicker`; standing rule in CLAUDE.md §2; sweep `tests/e2e/camera.e2e.mjs`), merged into `main` at the owner's word. **Queue (owner, 21 Nov 2026), in this order:** (1) OpenPGP — a second mode, "Latest standard (RFC 9580)", beside the GnuPG-compatible one, which stays exactly as it is — **done** (`src/lib/pgpstd.ts`; unit `pgp9580.test.mjs` 68, e2e `pgp9580.e2e.mjs` 40 against rsop (rPGP) and sqop (Sequoia, OpenSSL backend) built with cargo — see HANDOFF; GnuPG suite 34/34 unchanged); (2) camera in EXIF and beside FFmpeg's main picker — done (964a9a4); (2b) **Photo Dictionary on PCs too** — owner, 21 Nov 2026 ("you missed out the photo dictionary app"; asked, chose PC + phone with the webcam): done — the shared live camera, platform 'both', e2e 55, camera sweep 39; (3) **PDF → EPUB — DONE 21 Nov 2026** (the owner's reading-order rule: side-by-side pieces read one after another under "Page N, part K"; the owner's five test PDFs — AJUR, 2611.25554v1, another_one, test_1, test_2, kept in the session scratchpad `epub-owner/` (ask the owner again in a new session) — converted and read page by page; then the owner's **strict rule for pictures**: none dropped, each kept exactly (JPEG byte for byte, others their own pixels as PNG, composed / overlaid ones drawn at their own resolution in colour), no OCR of any sort (a scan keeps its picture, its OCR text is not used). CLAUDE.md §3 PDF → EPUB "as built after the owner's test PDFs"; docs/BUGHUNT.md last entry; unit pdf2epub 94 + xycut 33, e2e epub 52. Scratchpad tools: `epubfix/run.mjs` (convert + screenshot), `dbg-run.mjs` (DEBUG_PAGE=n), `piccheck.mjs` (every picture in the EPUB). Owner, 21 Nov 2026, asked what comes before potentials.md: answered — EPUB (done), TTS offline (now), Regex flavours, Photo Dictionary plan, the lighter in-browser Indian voice (waiting for the owner's pick), then the JS/TS → WebAssembly sweep (moved to docs/potentials.md #74 by the owner, 21 Nov 2026) and potentials.md (#54 draw.io measured: 49.5 MB, PC only, JavaScript allowed for it by the owner; stateless open → edit → download). (5a) **Text-to-Speech "Offline on this PC" — BUILT 21 Nov 2026** (owner: the mode PC only, the tab PC + mobile; many large voices, the Indian accent as light as possible): `src/tools/tts-offline.ts` (loaded when the mode is chosen), `src/lib/offline-tts/` — `catalogue.json` (430 voices in 45 models: Indian 63, American 73, British/Irish 108, other 37, not documented 149; `python3 scripts/make-offline-tts-catalogue.py`), `plan.ts` (choices → job, engine runs, sizes), `scripts.ts` (.cmd hybrid / .sh; uv from PyPI by SHA-256; a Hugging Face token asked for once for gated models), `driver.py` (engines: Piper, Kokoro (hexgrad's own pipeline), Parler-TTS (Indic Parler — gated —, Large v1, Mini v1.1), XTTS-v2 (studio voices + voices from Indian clips, CPML accepted in the tab), Pocket TTS) — every engine run here on the CPU with pinned packages; unit `offline-tts.test.mjs` 25 (+1 with OFFLINE_TTS_E2E=1) and `offline-tts-plan.test.mjs` 70, e2e `tts-offline.e2e.mjs` 31. **Screencast / Screenshot (owner, 21 Nov 2026): area recordings were black — fixed (canvas crop, pixel test); "Show the mouse pointer" in both (Screencast new; Screenshot's now works when changed during a share).** **Owner, 21 Nov 2026 — the order from here: (1) finish the Indian-accent ranking pop-up, (2) the Photo Dictionary upgrade (todo.md #6; CLAUDE.md §3 Photo Dictionary "To build next" 1 – 4: Wikipedia box, all uncommon words, the full text with phrase look-up, line-break hyphens), (3) the rest of the voice work (Kyutai TTS 1.6B — generator code started: its 594 voices from kyutai/tts-voices, model files config.json + dsm_tts_1e68beda@240.safetensors 3.68 GB + tokenizer-e351c8d8-checkpoint125.safetensors + tokenizer_spm_8k_en_fr_audio.model; F5-TTS, VibeVoice; the 56 Indian donors for the cloning engines), the SuperUtils rename (todo #5), the regex flavours, then docs/potentials.md (show the list, the owner picks, size check, build, remove).** **DONE 21 Nov 2026 — the Indian-accent ranking pop-up** (TTS offline; 63 voices measured; CLAUDE.md §3 Text-to-Speech, "Indian accents, lightest first"). **DONE 21 Nov 2026 — the Photo Dictionary upgrade and the OCR tab on the phone (to-do #6 and #9, both in todo.md's Done):** Wikipedia boxes, every uncommon word, the page's text with phrase look-ups, joined line-break words (31dbd3e); the camera's still on phones, the page found and straightened before reading in both tabs (a screenshot read as it is), and a "snap again" hint below 60 % confidence or under 25 words (`POOR` in `src/lib/ocr.ts`). Measured and not kept: sharpening, upscaling, Sauvola thresholding, PaddleOCR PP-OCRv6 (docs/WASM-AUDIT.md, tab 122). The measuring: `python3 scripts/make-kindle-photos.py OUT --count 24` + `node scripts/measure-ocr.mjs OUT --prep page,page+sharp,… [--param name=value]`. **IN PROGRESS: to-do #7 (TTS offline, the rest of round 2).** Done first: the scripts ran each engine with `uv run --with`, which ignores `UV_TORCH_BACKEND` — every Linux PC got the 4 GB CUDA build of PyTorch; now each engine has `envs/<engine>` made once by `uv pip install` (PyTorch's build fits the PC; checked here: MMS → `torch 2.15.0+cpu`). The environment now allows download.pytorch.org and download-r2.pytorch.org (docs/HANDOFF.md §6). **Kyutai TTS 1.6B is in (21 Nov 2026): 601 voices** — one per recording of kyutai/tts-voices with an embedding; run here (≈ 8.5× slower than real time, 15 GB of memory, every word read back by Whisper at 0.5×, 1× and 2×); recordings without a description filed by the language Whisper hears (`scripts/accent-survey/languages.py`: Spanish, French, Malay, Hindi) or the accent CommonAccent hears clearly — CLAUDE.md §3 TTS offline. **Then (21 Nov 2026, in progress):** every engine that clones has the same 163 recordings (`clone_clips()`: the 57 Indian voice donations as Kyutai files them + VCTK's 106 speakers; the old ids kept); **F5-TTS** in driver.py and the catalogue (162 English recordings with Whisper transcripts — `scripts/make-clip-transcripts.py`, 48 recordings over 11.5 s cut after a whole word); **VibeVoice 1.5B** (Microsoft's own `vibevoice` 0.0.1 wheel) in driver.py and the catalogue, tagged "not run yet". Running: the Kyutai survey (`run.py WORK kyutai`, resumes per sentence after an out-of-memory kill), F5's first run here. Still to do in #7: run VibeVoice, Chatterbox / Turbo, VoxCPM2, Bark (full) here as disk and memory allow (one at a time; the Kyutai survey holds 9 GB of memory — no heavy browser suites beside it); measure the new Indian voices (Kyutai 61, F5 59, XTTS 52 new, Chatterbox ×2, VoxCPM2, VibeVoice) with `run.py`, then `make-indian-accents.py` and the generator. **Owner, 21 Nov 2026 (done the same day, 241ab7c): to-do #11 — photos taken with the phone held sideways are set upright in the Photo Dictionary and the OCR tab.** **Owner, 21 Nov 2026 (later): "the OCR app also should be extremely good, especially on the phone, when I click it at different angles"** — both tabs level a slanted photo (5° and more) before the quarter turns, and **every turn and levelling is now tried by a quick reading** (`uprightByReading` in `src/lib/upright.ts`): measuring it on the 24-photo set found that #11's letter-based turn, live for a few hours, spoiled two soft upright photos (98 % → 2 %, 80 % → 0 %) — fixed, and both photos are fixtures now (docs/BUGHUNT.md). Measured with `node scripts/measure-ocr.mjs DIR --prep page,page+level --tilt DEG` (the set: `python3 scripts/make-kindle-photos.py DIR --count 24`): level 67.0 % as before, 25° 53.9 → 61.9 %, −35° 46.1 → 57.8 %, 90° 55.8 → 63.5 %. **Done the same day:** the lines' direction and slant from projection profiles (`p_text_lines`, own C in imgproc; CLAUDE.md §3 OCR, "At any angle"): level 67.0 %, 25° 63.0 %, −35° 59.3 %, 90° 66.0 %, 180° 65.8 % (the page alone: 67.0 / 53.9 / 46.1 / 55.8 / 1.8 %). Left for later (ask the owner before more): the page finder takes a wrong outline in some tilted whole photos (kindle-06 of the set at 25° / −35°). TTS (#7) meanwhile: Bark small and Qwen 0.6B run with their locks (smoke tests OK); the Kyutai survey was killed for memory a third time (restart `run.py WORK kyutai` alone — it resumes per sentence). **Then #8 (regex flavours) and #10 (bc variables — the owner's answer repeated on 21 Nov 2026: one Enter, one value, one name; each printed row its own name), then the potentials process (CLAUDE.md top).** **DONE 21 Nov 2026 — the app is SuperUtils** (todo.md #5; CLAUDE.md §1 "App name": what was renamed and what was kept on purpose; the owner deletes his old SuperTools-TTS folder). **Owner, 21 Nov 2026: the Regex Tester's flavours are todo.md #8 (they had been only in CLAUDE.md §3); SliceDiceGrapher — paste a range from Excel / LibreOffice or open a workbook → pivots and graphs from presets → each one downloadable as an image — is docs/potentials.md #75 (Perspective 3.8, WebAssembly; waiting for the owner's pick).** **Owner, 21 Nov 2026 — in progress: a pop-up in the TTS offline mode ranking every Indian voice from the lightest (most British) accent to the strongest, with the model — measured by the accent model (`scratchpad/otts/bin/accrun.sh`, results to `scripts/data/`).** **Owner's run, 21 Nov 2026: Indic Parler-TTS refused his token — the script now checks the token at once and names the cause (wrong token / conditions not accepted / fine-grained token).** **Owner's run, 21 Nov 2026: "== Parler-TTS: 1 voice" then silence — fixed (uv no longer quiet, first-run sizes under each heading, the driver says when it starts and downloads; docs/BUGHUNT.md). Agreed process after the work in hand: show docs/potentials.md, the owner picks, size check, build, remove from the list, repeat (CLAUDE.md top). In progress: Kyutai TTS 1.6B, F5-TTS and VibeVoice adapters are in `scripts/wip/offline-tts-engines-next.py` (not yet in driver.py — the catalogue does not have them yet); the 56 clearly-Indian voice donations (`scratchpad/otts/bin/donors.json`) for the cloning engines.** **ROUND 2 (owner, 21 Nov 2026: "include them all" — none of it is on the site) — 626 voices in 64 models, 16 engines:** added MeloTTS (sherpa-onnx; unknown words through our port of g2p_en, numbers by `spoken()`), Supertonic 1/2/3, Indic Tiny TTS, Qwen3-TTS (0.6B and 1.7B CustomVoice, 12 VoiceDesign voices), OmniVoice (40 voices of sex × age × accent), Bark and Bark small (20 presets), Chatterbox and Turbo, Veena, VoxCPM2, SYSPIN, MMS, Pocket TTS with voice cloning (gated); unit 32 + 114, e2e 33. **Run here and read back by Whisper, pitch and an accent model (SpeechBrain CommonAccent, `scratchpad/otts/bin/`):** MeloTTS, Supertonic (all 30), Indic Tiny, MMS, Qwen 0.6B (all 9), VoiceDesign (10 descriptions — **no accent comes through in English**, so its voices promise none), OmniVoice (8 — **its Indian accent comes through**). **Still to run here** (tagged "not run by SuperTools yet" in the tab, `UNTRIED` in the generator): SYSPIN (job `scratchpad/otts/sy1`), Bark small (one preset alone — 20 beside another run did not finish one in 8 minutes), Chatterbox / Turbo (needs a second PyTorch 2.6, disk), VoxCPM2 (5 GB), Veena (7.6 GB), Bark full; not looked at yet: Kyutai TTS 1.6B, VibeVoice, F5-TTS. Disk is the limit here (≈ 6 GB free with the uv cache's PyTorch): delete each model after its run. **Not run here (round 1):** the Windows script (PowerShell could not be installed in the sandbox — read by its text only), Indic Parler-TTS itself (gated: no token here; its code is Parler Mini's, which ran), Parler Large (9.3 GB, disk). Candidates left for later (docs/BUGHUNT.md "TTS offline"): MeloTTS EN_INDIA (its package needs torch < 2.0; sherpa-onnx 2.x drops unknown words), Chatterbox (pins torch 2.6), Indic-Speak and Veena (GPU, gated), ZONOS3 (accent dose; C++ CLI). Earlier note of the plan: (5a) Text-to-Speech "Offline" mode, PC only (owner, 21 Nov 2026: "I intend that this runs entirely from the user's PC, not in the browser … find out whether this operating system is Linux or Windows, and appropriately download whatever is needed for the user to run it. Also give instructions in the offline mode. Also make this offline mode for PC only. Okay, go ahead to build out this offline mode next"; the existing mode untouched; purpose: large, high-quality models — the light Indian accent one — that the site cannot host). Plan in CLAUDE.md §3 Text-to-Speech, "Offline mode". **Owner, later on 21 Nov 2026:** the tab itself stays PC + mobile — only the Offline mode is PC only; and in it "Knock yourself out and include many more large, sophisticated models" — US, UK and Indian English and more, many more voices, the Indian accent "as light as possible" (the models go to the PC, so the site's size limit does not apply). (6) **Text-to-Speech: a lighter Indian English accent** (owner, 21 Nov 2026: "the Indian accents … are too thick … latest, more polished, thinner Indian accents with good diction and clarity?" — answered: Kokoro's Hindi voices reading English (≈ 0.5 MB each), MeloTTS EN_INDIA (MIT, ≈ 100–170 MB as ONNX), Kokoro Indian-English fine-tunes; offered listening samples, then the size check — waiting for the owner). (5) **Regex Tester: a choice of flavours** (owner, 21 Nov 2026: Python, Perl / PCRE and the other standard ones — "make a note of this and build it out when you get a chance"; CLAUDE.md §3 Text & Dev, `regex`). (4) **Then: the owner's Photo Dictionary plan of 21 Nov 2026** (CLAUDE.md §3 Photo Dictionary, "To build next"): a live Wikipedia box under every word's meaning; as many words as are uncommon instead of a fixed 20; the complete OCR text before the list, where a selected phrase is searched on Wikipedia and added to the list. Next: the owner picks from docs/potentials.md (size check first). **NEXT (done unless noted): the owner's questions (todo item 1, potentials #4 Pandoc / #54 draw.io / #55 Cut Out Anything and the rest; v86: left out completely, owner 20 Nov 2026) and the final report.** **NEXT: fix what the complete e2e run finds (a suite that fails under load is re-run alone by the harness; look at those too); then ask the owner: todo.md's open items, potentials #4 Pandoc (all its uses as buttons), #54 draw.io, #55 Cut Out Anything (v86: left out completely, owner 20 Nov 2026); the final report.** The CLAUDE.md "as built" notes of the PDF tabs 126 – 138 are written (§3 "PDF Toolkit"). The app shell is DONE (touch targets of 44 px on phones, the placeholder counts the device's tools). Done meanwhile: todo item 4 (yt-dlp download button), item 3 withdrawn; owner rule: no more Hindi work (CLAUDE.md top), `ocr`, `signature` (end of area images2); then
  images1 → images2 → pdf → docs2 → audio → video → terminal → everyday-device (+ the app shell).
  (old note, done:) `periodic` (`src/tools/math.ts`, engine mathcore), then the complete suites for the area;
  per tab: the
  existing-module check with its entry in `docs/WASM-AUDIT.md` first (the survey of entry 56 covers calculators:
  no tried-and-tested WebAssembly calculator exists), then bugs, tests, fixes. Reference tools at hand: mpmath
  (`pip install mpmath`), Python's `decimal` / `fractions` / `datetime` / `zoneinfo`.
  After calc-core: calc2-math → text → … as listed below.
- **Graphviz (tab 55, `graphviz`): DONE (19 Nov 2026).** Existing modules first (`docs/WASM-AUDIT.md` entry 55):
  Viz.js 3.31 and @hpcc-js/wasm-graphviz 1.30 both **trap on valid graphs** (an upstream fault in `storeline()`: a
  label whose first line is empty), so the tab keeps a build of our own — now **Graphviz 16.1.0** from the official
  release (gitlab.com; SHA-256 in `wasm/graphviz/build.sh`) with `storeline.patch`, `triangulation.patch` +
  `st_delaunay.h` (prism overlap removal on our C port of Delaunator — no WebAssembly build had it), `qsort.c` /
  `rand.c` (glibc's: dot, neato, twopi, osage, patchwork are byte for byte the native tool's on 457 graph files),
  assertions kept (`-UNDEBUG`), text measured by the browser through a "textlayout" plugin. New worker (a fresh
  instance per drawing), client (newest text wins), page (CLAUDE.md §3 "Graphviz", §5.1l). 22 bugs; unit 32 → 686,
  e2e 23 → 81; reference = the native `dot` of the same source (`scripts/make-graphviz-reference.mjs`, 3,464
  drawings). **Build tree for quick rebuilds** (lost with the container; `ZIG=/tmp/zig/x/ziglang/zig
  WORK=/tmp/graphviz-build3 wasm/graphviz/build.sh` recreates it in ≈ 4 min): `/tmp/graphviz-build3`
  (`native/cmd/dot/dot_static` = the reference tool). To tell the owner at the end: the upstream crash is worth
  reporting to the Graphviz project (patch ready); native Graphviz 16.1.0 aborts on two hazard graphs.
- **Code Formatter (tab 54, `prettier`): DONE (19 Nov 2026).** Engines by evidence (`docs/WASM-AUDIT.md` entry 54;
  CLAUDE.md §3 "Code Formatter"): **Biome's official wasm** for JS / TS / CSS / SCSS / YAML / GraphQL, **`@dprint/json`**
  for JSON, **`dprint-plugin-markup`** (+ Biome for what stands inside) for HTML and Vue, **Prettier** for Markdown and
  as the fallback. 13 bugs; unit `tests/unit/codefmt.test.mjs` 205, e2e `tests/e2e/prettier.e2e.mjs` 85.
  To change or update an engine: `node scripts/make-codefmt-layout.mjs`, read the diff of
  `tests/fixtures/codefmt/layout.json`, run both suites. The readers the suites rest on: `tests/lib/codefmt-check.mjs`.
  **For the owner to know (said in the final report too):** Biome's module is 70 MB (18 MB over the wire, fetched
  with the first Format of one of its languages); `dist/` is now about 705 MB of GitHub Pages' 1 GB. A module of
  3–6 MB could be built by us from the same Biome crates if the size ever hurts (not done: the official build
  exists and covers everything — rule order).
- **SQL Formatter (tab 53): DONE (19 Nov 2026)** — the sqlformat crate changed the meaning of SQL and no established
  WebAssembly SQL formatter exists, so the tab has **our own formatter** now (`wasm/devcore/src/sqlfmt.rs`; CLAUDE.md
  §3 "SQL Formatter"; `docs/WASM-AUDIT.md` entry 53). 24 bugs, unit 113, e2e 49. To change its layout: edit the
  engine, `bash wasm/devcore/build.sh` (or the one-feature cargo line in it), `node scripts/make-sqlfmt-layout.mjs`,
  **read the diff of `tests/fixtures/sqlfmt/layout.json`**, run `node tests/unit.mjs sqlfmt` and
  `node tests/e2e.mjs sqlfmt` (the e2e uses python3 with `pip install sqlglot sqlparse`; without them those two
  readers are skipped with a note).
- **SQLite Playground (tab 52): DONE** — 22 bugs, unit 106 (native SQLite as reference), e2e 63; CLAUDE.md §3
  "SQLite Playground".
- **Owner's to-do list: `todo.md`** ("to do"). First item (17 Nov 2026): a JS/TS → WebAssembly sweep.
  **Owner, 17 Nov 2026: do NOT start to-do items on your own** — after this hunt, show the owner the items and ask
  which ones to do.
- **Owner, 17 Nov 2026:** "increase test coverage significantly for each app/utility" — every tab's suite must grow in
  this pass (tracker column T), not only the tabs where a bug was found.
- **Shell + whole-app results so far:** see "Bug hunt log" at the end of the tracker.
- **Done so far (17 Nov 2026):** app shell + whole-app sweep (10 fixes); **area `net` — all 10 tabs** (cidr, chmod, x509,
  sshkey, hmac, pwhash, apikey, curl, totp, pwstrength): 51 bugs fixed, 592 checks added, each pinned against an
  independent reference (real curl, GNU chmod, OpenSSL, Python ipaddress / cryptography / hashlib / zxcvbn, RFC vectors).
- **Area `misc` done too** (cron, semver, glob, patch, hexview, escape, unicode, logview, sla, transfer, mermaid): 59
  bugs, 350 checks; three engines replaced by our own Rust (npm-exact semver, Unicode glob, GNU-like patch).
- **Area `bitswebref` done too** (bitwise, ieee754, baseenc, bindecode, httpstatus, mime, ports, ascii, keycode,
  contrast, gradient, shadow, svgo): 63 bugs, 500 checks. Biggest: SVG Optimizer refused every file with a DOCTYPE,
  its Safe mode did nothing and some optimised drawings looked different (now every result is rendered and compared,
  with a safe fallback); the binary decoder's CBOR / MessagePack readers are now our own Rust; files ≥ 8 MiB trapped
  the Base32/64 engine; float32 rounding on ties; Key Codes was a keyboard trap.
- **Area `dev-data2` done too** (json, regex, base64, urlenc, epoch, uuid, color, jwt, xml, json2types, jsondiff,
  mockdata, mdtable): 91 bugs, 632 checks. Four engines written in Rust because the JS could not be made correct:
  a lossless JSON formatter (JSON.stringify reordered keys, dropped duplicates, rounded big numbers), a JSON diff
  that aligns lists, an XML formatter that moves white space only (the DOM round trip trimmed text and lost the
  DOCTYPE), and a JSON → types generator whose output is compiled by tsc / go / rustc / javac / python in the suite.
  Also: v7 UUIDs strictly increasing (crypto.wasm), CSS Color 4 gamut mapping (mathcore), regex matching in a worker
  with a time limit. The small tabs moved from `src/tools/text.ts` to `src/tools/software/dev1.ts`; colour reading
  is `src/lib/color.ts`.
  Running total: **47 of 176 tabs reviewed, 264 bugs fixed, 2,074 checks added** (+ shell).
  Verified at that commit: unit 4567/4567 (39 suites, 12 runs in a row); complete e2e 4,580 checks in 188 suites, all
  passing (mermaid, resume and one mdtable timing check only when re-run alone — CPU contention, as before).
  For the reference generator: `pip install --user pyjwt lxml tzdata` (the tests themselves only read its JSON).
- **Area `data-engines` in progress (17 Nov 2026):** done — **jq** (worker with stop / time limit / output stop; glue
  follows jq's main.c; native jq 1.8.2 as the reference for 4,903 cases), **yaml** (own value model and writers:
  digits kept, YAML 1.1-safe quoting, dates / .inf / .nan travel; PyYAML, ruamel.yaml and tomllib read every output),
  **jsonschema** (exact numbers, IDN formats, safe inference, plain messages; python-jsonschema verdicts for 5,338
  pairs), **python** (recursion guard for the browser's two stacks, lru_cache in Python, local time with tzdata's
  names, socket stand-in + asyncio, pbkdf2_hmac; new output pane that survives floods and shows \r / colours / the
  answers to input(); native CPython 3.14.8 as the reference for 69 programs — details in CLAUDE.md §5.1m).
  Still open in this area: nothing (sqlite, sqlfmt, prettier and graphviz done since).
  Running total: **51 of 176 tabs reviewed, 333 bugs fixed, 14,702 checks added** (+ shell).
  After `sqlite`, `sqlfmt` and `prettier` (19 Nov 2026): **54 of 176 tabs reviewed, 393 bugs fixed, 16,274 checks added**.
  After `graphviz` (19 Nov 2026): **55 of 176 tabs reviewed, 415 bugs fixed, 16,986 checks added** — the data-engines area is complete.
  After `calc`, `units` and `dates` (19 Nov 2026): **58 of 176 tabs reviewed, 449 bugs fixed, 17,452 checks added**.
  Python build tree for quick rebuilds (lost when the container is reclaimed; `wasm/python/build.sh` recreates it in
  ≈ 10 min): `/tmp/pyb3` (`native/python` = the reference interpreter; `rezip.sh` rebuilds only python314.zip).
  After any rebuild: `python3 scripts/make-tzabbr.py` and `<native python> scripts/make-python-reference.py`.
  References are regenerated with `scripts/make-jq-reference.mjs` (needs a native jq 1.8.2: build it from the tarball
  `wasm/jq/build.sh` downloads), `scripts/make-formats-reference.py` and `scripts/make-jsonschema-reference.py`
  (`pip install pyyaml ruamel.yaml tomli_w toml jsonschema`); the tests only read their JSON.
  **Ideas that came up and are NOT started (ask the owner):** build sqlite3, bz2 and lzma into the Python tab.
- **The five first-wave reviewers left their probe scripts** in the scratchpad (`review/<area>/*.mjs`, areas misc,
  bitswebref, dev-data2, data-engines, calc-core): copy them to `own/<area>/`, point them at the preview
  (`sed -i 's#localhost:4180#localhost:4173#'`, `../probe.mjs` → `own/probe.mjs`) and run them one by one — they print
  tool-vs-reference comparisons that show the bugs. (If the scratchpad is gone, review those areas from the source.)
- **Next steps (in this order, one area at a time, commit + push after each):**
  data-engines (sqlite, jq, yaml, sqlfmt, prettier, graphviz, python, jsonschema …) → calc-core → calc2-math → text → security-codes → images1 → images2 → pdf → docs2 → audio → video →
  terminal → everyday-device — **ALL DONE (20 Nov 2026)**; left: the app shell, the complete suites, the owner's
  questions (see the paragraph above) (areas = column "Area" in `docs/BUGHUNT.md`; `node scripts/bughunt.mjs status` lists the
  tabs still open). `E2E_DIST=<folder>` lets a second e2e run use its own build while a long one uses dist/. For each tab: read the source + suite, probe the built site (`npx vite preview --port 4173`, helper
  `scratchpad/own/probe.mjs` — recreate it from `tests/e2e.mjs` if the scratchpad is gone), compare with an independent
  reference, fix, add checks to its suite (and a unit suite for its engine), tick the tracker.
- **Do NOT fan out a dozen reviewer sub-agents at once:** twelve in parallel used up the owner's 5-hour usage limit in
  one go (17 Nov). Work through the areas one by one in the main session.
- Reviewer reports that exist only for `net` (scratchpad `review/net/REPORT.md`, now fully handled). The other areas
  have no report — review them directly.

## Status (last updated with the commit that touched this file — see `git log -1 -- docs/RESUME.md`)

**Branch:** `claude/exciting-bohr-b9yfwc` (push here only). Site: https://ddastoor.github.io/utils/

**Registry:** 176 tabs (108 PC + mobile, 64 PC only, 4 mobile only) — `docs/TOOLS.md` (generated, `npm run docs`).

**Done and tested** (own e2e suite each): security (sodium, sharelink, hash, password, passphrase), pgp, all
calculators (27), math & science (7), text (9) + json/regex/base64/urlenc/epoch/uuid/color/jwt, codes (qr, barcode,
scan), archive (zip, unzip), everyday (9), device (11), **Image Editor** (`tests/e2e/image-editor.e2e.mjs`, 28 checks).

Also done + own e2e suite: `terminal` (20 e2e + 317 unit checks), `scanner` (13; generated phone photo of a rotated page → corners within 1 %, A4/Letter/Fit
PDF via MuPDF (src/lib/pdf.ts imagesToPdf, JPEG embedded as-is), JPEGs, B&W, rotate, multi-page), `formphoto` (14; IBPS/SSC/UPSC/NTA/PAN presets in src/lib/form-specs.ts, face
auto-framing, paper clean-up, JPEG padding to the minimum via metacore m_jpeg_pad), `redact` (14; MediaPipe BlazeFace + tiles, real portrait + generated 6-face group photo),
`heic` (11 checks), `exif` (18), `batch` (12, PC only), `watermark` (12), `caption` (11),
`collage` (14) — src/tools/canvas-tools.ts; `signature` (15; imgproc p_alpha_bbox + p_ink_to_alpha; OFL fonts
Great Vibes / Dancing Script / Caveat self-hosted); Anton font (OFL) self-hosted via @fontsource/anton.
`photodict` (43 e2e + 56 unit), `ocr` (10), `bgremove` (11), `passport` (19), `cartoon` (37; Magenta models fetched + converted by
`scripts/fetch-assets.mjs` → `scripts/convert-magenta.mjs`). **Images category complete (15/15).** `bc` console (12).

**Lazy dependencies per tab (owner request, Nov 16 2026) — DONE:** shell loads no engine (home ≈ 156 KB), search
engine loads on first use, every tab loads only its own chunk and fetches engines/models/data/fonts on first use,
workers + engine instances are released on leave (`src/lifecycle.ts`). Rule + allow-list: CLAUDE.md §4 "Lazy
dependencies"; test `tests/e2e/lazy.e2e.mjs` (every tab, desktop + phone). Every new tool must follow it.
Found on the way: MediaPipe's built-in usage logger (Google telemetry) — removed at build time (CLAUDE.md §6); test
helper `renderGrey` read a detached wasm-heap view under load (now copies).

**Stubs ("This tool is being built")**: every other tool — see "Queue".

## In flight: WASM-first audit (owner: "scan everything you've coded and convert to WebAssembly")
STANDING RULE #1 is at the top of `CLAUDE.md`; audit list is in CLAUDE.md §3a.
- [x] imgproc.c: `p_orient` (EXIF 1–8 lossless transforms), `p_crop`, `p_warp_quad` (homography solved in C);
      TS loops for flip/rot90/crop/homography/orient removed; unit tests added (45 checks).
- [x] metacore.c (new module, `wasm/metacore/`, built → `src/wasm/bin/metacore.wasm`): `m_sniff`, `m_exif_json`,
      `m_strip` (JPEG/PNG/WebP), `m_jpeg_set_dpi`.
- [x] `src/wasm/metacore.ts`; exif.ts / imgio.ts (setJpegDpi, sniff) use it; `tests/unit/exif.test.mjs` (25 checks
      incl. fuzzing); CLAUDE.md §3a + §5.1c updated. OxiPNG effort now scales with image size (12 MP PNG 31 s → 3 s).
- [x] textcore `search.c`: tool search ranking in C (t_search_build/query/free); src/search.ts only normalises;
      parity with the old TS ranking verified on ~1,800 queries; main.ts awaits `initSearch()`.
- [x] textcore `wordfreq.c` (`t_wordfreq`: count + stop words + top-K) — Word Counter uses it; Photo Dictionary will.
- [x] crypto glue.c: `u_shuffle_idx`, `u_sample`, `u_uuid` (v4/v7), `u_sh_write`/`u_sh_parse` (USODIUM1 header).
      `Math.random` is gone from the app (Line Tools shuffle, Lorem); everyday picker/teams/rng use C sampling.
- [x] mathcore.c: m_matadd/m_transpose/m_trace/m_matpow, m_weekdays (closed form, verified vs brute force),
      m_color (HSL/OKLCH) + m_contrast (WCAG). **Audit complete** — summary in CLAUDE.md §3a.
- Left in TS on purpose (record in CLAUDE.md): browser-native engines (JSON, RegExp, Intl, canvas, WebCrypto) are
  compiled C++ already; per-animation-frame tiny loops (audio meter RMS over 2048 samples, graph grid drawing) —
  copying into wasm costs more than the loop.

## Done so far (details in CLAUDE.md §2/§3)
Images (15), Documents (19), Media (11), Security (6), Calculators (27), Math & Science (7), Text (10 incl. Photo
Dictionary), Codes & Files (5), Everyday (9), Device (11), Linux Terminal + bc console, Software tabs moved from the old
"Text & Dev" (8). **129 of 176 tabs built.** Every own wasm module has unit tests (3240 checks passing).

## Next steps (in order)
1. **DONE (16 Nov 2026) — Per-tab e2e suites for the early tabs (owner, Nov 16: "extensive test cases for each utility").** Audit: 47 tabs had
   their own suite; ~80 early tabs were only covered by 7 shared smoke suites (calculators, math, text, security, codes,
   everyday, device). One thorough suite per tab with independent known answers (re-implemented formulas, published
   figures, boundaries, invalid input, phone width) — helper `tests/lib/calc.mjs`.
   **Written and passing (26):** emi, gst, sip, fd, percent, tip, fuel, words, roman, ppf, inflation, prepay, epf, nps,
   bodyfat, idealweight, coords, bmi, calories, sleep, units, dates, timezone, duedate, gpa, base, calc (77 checks).
   **All 27 Calculators tabs have their own suite.** Math & Science (7/7): graph (canvas pixels, pan/zoom, readout),
   equation, stats, matrix, fraction, primes, periodic — 153 checks. Text (9/9): wordcount, case, lines, replace, diff
   (minimal edits = LCS, rebuilds both texts), fancy (no unassigned code points), emoji, morse (playback timing), lorem.
   Developer tabs (8/8, PC only; shared `tests/e2e/_pconly.mjs` checks the phone note): json, regex, base64, urlenc,
   epoch, uuid, color, jwt — 117 checks. Security (5/5): sodium (USODIUM1 header fields, 5-chunk file, tamper/truncate,
   and the independent PyNaCl reference decryptor `tools/sodium_decrypt.py` opening our output — needs `pip install
   pynacl`, otherwise that check is skipped with a note), sharelink (fragment never sent), hash (9 algorithms vs Node and
   test vectors, 3 MB file), password (χ² uniformity), passphrase (EFF list) — 64 checks.
   Bugs found and fixed so far: Percentage showed "—%" on ÷0; BMI exactly on a cut-off (76.8 kg at 1.60 m = 30.0) was
   put in the lower category (float 29.999…) — now categorised as displayed; "₹-0" for a zero amount (NPS lump sum with
   a 100 % annuity) — `fmtINR` now prints ₹0, and negatives as "−₹1,234"; Date Calculator gave negative days (31 Jan → 1 Mar
   = "1m −2d") and "31 Jan + 1 month" = 3 Mar — now month-end clamped like java.time/Excel EDATE (1m 1d, 28 Feb), 29 Feb
   birthdays fall on 28 Feb; Time Zone converter's DST correction was a no-op (03:30 just after the New York spring
   change came out an hour off) — now tries the offsets either side, notes skipped/repeated hours; Due Date showed
   "Invalid Date" for an empty LMP and accepted any cycle length (now 20–45 days); Scientific: "200 + 10%" gave 200.1 —
   mathcore now treats a trailing bare % after + / − as a percentage of the running total (220), like phone calculators;
   Equation Solver threw uncaught errors on bad input (now messages) and missed touching roots like (x − ⅓)² (C root
   finder now minimises |f|); Fractions read "1/3 ÷ 2/3" as 1/18 (now ½: "2/3" is one fraction); Primes showed LCM 0
   beyond 64 bits (now exact), "next prime 2" after 2⁶⁴ − 1, and negative GCD/LCM/next prime above 2⁶³ (wasm i64 read
   signed); Statistics showed "Error" for undefined values (now —) and accepted "0x10" as data; Morse playback had 9-unit
   word gaps (standard 7); Lorem ipsum gave n+1 sentences / n+8 words and a lower-case sentence after "elit."; emoji search
   was case-sensitive (no country flags found); "e-mail" counted as 2 words; Title Case left a final small word lower
   case; code cases kept punctuation ("hello,World!") and did not split acronyms; Sentence case lost "I" and capitalised
   after "i.e."; Regex Tester's highlight dropped the character after an empty match; Base64 "download file" threw on
   bad input; Epoch showed 1970 for an empty box; JSON Formatter rounded big numbers (12345678901234567890 → …000; now
   kept exactly with JSON.rawJSON) and gave no line/column for "Unexpected token" errors (now found by a prefix search);
   Regex Tester said "1000 matches" for 5,000; Color accepted rgb(300, −20, …) unclamped; JWT now flags "nbf" in the
   future; Epoch clock was blank for 250 ms; password boxes in Sodium/Share Link had no accessible name; Share Link's "New
   message" did nothing (the router kept a tab when only its own hash parameters changed — now re-mounted, ?from= ignored);
   Hash "two files identical" compared by DOM position.
   Codes & Files (5/5): qr (19, every payload read back by the Scanner tab — tests/e2e/_scanback.mjs), barcode (32, all
   12 symbologies round-trip), scan (10, two codes per picture, fake live camera), zip (14, checked with Python zipfile and
   pyzipper AES), unzip (24, zip/AES/tar.gz/bz2/xz/7z fixtures built with Python). Test-only Python packages: `pip install
   --user pynacl pyzipper py7zr` (those checks are skipped with a note when missing). Note: Playwright drops files whose
   *path* is not ASCII — pass such files as buffers.
   Fixed: vCard values escape ; , \ and new lines; AES zip without a password says "Wrong or missing password"; **button
   handlers that throw synchronously now show the message** (they escaped as uncaught page errors before — e.g. barcode
   "Nothing to save yet").
   Everyday (9/9): stopwatch (19), countdown (30), pomodoro (26), interval (18) — all under Playwright's fake clock
   (`page.clock` install/pauseAt/runFor/fastForward), phases walked one by one with beeps counted; dice (21), coin (15),
   rng (27), picker (16), teams (15) — χ² uniformity (`tests/e2e/_stats.mjs`, p = 1e-4 limit), ranges, no-repeat rules.
   Shared helpers: `_phone.mjs` (390×844 layout + ≥ 44 px buttons), `_mobileonly.mjs`, `_phases.mjs`.
   Fixed: Stopwatch's Stop showed the last animation frame's time (≤ 16 ms stale, 3.734 s → "03.72"; laps were right);
   Reset → Start (or Pause → Start) before the next frame left **two frame loops** running in Stopwatch/Countdown/
   Pomodoro/Interval — the orphan kept beeping after leaving the tab; Countdown with 0 s alarmed at once on Start,
   negative fields were subtracted, and the tab title stayed "00:00 · Countdown" after pausing/leaving; Interval presets
   did not move the sliders, and Rest 0 s still counted (and beeped through) empty rest phases; Coin's Reset kept the
   heads/tails style; Team Splitter left the old teams on screen for an empty list.
   Device (11/11): webcam (23; fake camera = red|blue canvas stream → mirrored/unmirrored snapshot pixels), mic (22;
   Web Audio oscillator as the microphone → meter = peak, 5 s recording decoded back to 440 Hz), speaker (28; every
   connection to the speakers mirrored into per-channel analysers → Left/Right/Both channel energy, tone frequency by
   zero crossings), keyboard (22), pixels (19), touch (17; real touches via CDP Input.dispatchTouchEvent), screen (16),
   level (23), compass (17), soundmeter (15; reading = 20·log10(A/√2) + offset for a known amplitude), ruler (17) —
   helpers `_media.mjs` (fakeMedia, allStopped, trackAudioContexts). Orientation events only reach the page when the
   context has the sensor permissions (`accelerometer`, `gyroscope`, `magnetometer`).
   Fixed: Webcam "Snapshot" before starting threw "Encoding failed"; Keyboard Test lost focus to the search box on "/"
   and Ctrl+K (the app's shortcuts ran first — those keys could never be tested); Dead Pixel panel was not closed when
   full screen was left by the browser (its once-listener was used up by *entering* full screen) and stayed over the app
   after Back/leaving the tab; Touch Test canvas was not resized after rotating the phone; Screen Info showed India as
   "Asia/Calcutta" (now current IANA names) and did not follow a dark-mode switch; Bubble Level clamped the *reading* at
   45° and showed "−0.0°"; Compass showed "360° N" for 359.6° and its dial spun ~360° the long way when crossing north;
   Sound Meter showed −150 dB for silence, Start twice left two microphone streams and two loops running, and stacked
   one error message per click; Ruler's card outline was squeezed by the phone's screen edge (wrong aspect → wrong
   calibration) — now drawn upright when the card is wider than the screen.
   **Per-tab suites are complete for every built tab.** Full run (16 Nov, 141 suites, concurrency 8): 2882/2886 —
   the 4 misses were load timing (webcam test read the info table before it was drawn → test now waits for it; noise
   and resume timed out under load, both pass alone: 11/11, 7/7). Unit tests 3270/3270.
2. **← NOW: Software (PC only, 47 tabs)** — **built + own suite (24): httpstatus, mime, ports, ascii, keycode (ref.ts,
   shared `refTable` filter); cidr, chmod, x509 (net.ts); cron, semver, glob, patch, hexview, escape, unicode, logview,
   sla, transfer, mermaid (misc.ts); bitwise, ieee754, baseenc, bindecode (bits.ts); sqlfmt (data.ts); contrast, gradient, shadow, svgo (web.ts; svgo =
   our Rust build of OXVG, wasm/svgo); hmac, totp, pwhash, sshkey, apikey, curl, pwstrength (net.ts; wasm/keys +
   wasm/zxcvbn); xml, json2types, jsondiff, mdtable, mockdata (data2.ts; since 17 Nov on our own Rust engines devcore-xml / -j2t / -jsondiff); base64, urlenc, epoch, uuid, color, jwt (dev1.ts; moved out of text.ts); yaml, jsonschema (data3.ts; wasm/formats); prettier (prettier.ts, JS); sqlite (sqlite.ts + src/workers/sqlite.worker.ts, official SQLite wasm); jq (data.ts; wasm/jq = jq 1.8.2 C + oniguruma built by us, glue `jq_run` with an input callback so `input`/`inputs` work, `$ARGS`; e2e compares every output with the native /usr/bin/jq); graphviz (graphviz.ts; wasm/graphviz = Graphviz 14.1.2 + Expat built by us, in a worker with Stop; SVG shown as an inert <img>).** (47/47) devcore = one Rust crate (wasm/devcore), one small wasm per tab via Cargo features
   (`devcore-<feature>.wasm`; cron gets zone offsets from the browser's Intl through `env.tz_offset`); unit suite
   `tests/unit/devcore.test.mjs` (92). python (python.ts; wasm/python = CPython 3.14.8 built by us with zig — real Python 3 with its standard library instead of the planned MicroPython; worker, Stop, stdin, files in/out). **All 47 Software tabs built.**
   **Full run (16 Nov 2026, after the last tab):** unit 3531/3531 (32 suites); e2e 3576/3583 in 188 suites with all
   suites in parallel — the 7 misses (mermaid 4, noise 1 timeout, resume 1, stt Indian-English WER 28 % > 20 %) all pass
   when the suite runs alone (CPU contention; Piper's random sampling for the STT round trip). **Every original tab is
   built.** Next: the owner picks which `docs/potentials.md` ideas to build (asked in chat); build none until then.
   Test-only Python packages now also: `pip install --user bcrypt argon2-cffi zxcvbn requests` (checks skip if missing).
   Bugs fixed on the way: String Escape split emoji into a broken surrogate (😀 → "\ud83d" only); Patch Applier kept the
   previous result on screen when a new patch failed, TOTP's otpauth account line vanished on the next tick, Mock Data made new random rows when only the output format changed, **errors thrown by any file picker's handler
   escaped as uncaught page errors (no message) — `filePicker` now reports them like buttons do (all tabs)**, and added a newline that broke "No newline at end of file" patches;
   the device time zone showed as "Asia/Calcutta" and India was listed twice in the Time Zone converter (src/lib/tz.ts).
   sql-formatter (JS) replaced by a Rust sqlformat build — and that, Nov 2026, by our own formatter (WASM-AUDIT tab 53).
3. Audit list replacements (own builds of mozjpeg/libwebp/oxipng, libheif, tesseract, zxing-cpp, libarchive,
   zip AES in crypto.wasm, minimp4) — CLAUDE.md §3a.
4. **Owner decision (16 Nov 2026, after step 1): "Finish all the original apps before asking me about potentials.md."**
   So: build every remaining original tab (step 2: the 47 Software stubs, each with its own suite) first; only then
   remind the owner and ask which ideas to build: `docs/potentials.md` lists 53 new-tab ideas + 7 upgrades from
   open-source projects (round 1: Image to SVG, Upscaler, Searchable PDF, Pandoc, Vocal Remover, GIF, AVIF/JXL, age, Shamir,
   Spell Checker, BPM & Key, DuckDB; round 2: Auto Subtitles, Audiobook, PDF Compare, PDF Tables → Excel, Video Face
   Blur, Label Sheets, Music Tags, Duplicate Photos, Excalidraw, LaTeX, Circuit Simulator, Sky Map, Chart Maker,
   Certificate Maker, WireGuard, Code Runner, Breach Check; upgrades: Hindi TTS, Pyodide, Video Stabilizer; round 3: Aadhaar/e-Invoice QR verifier, DIGIPIN, PDF signatures,
   phone numbers, calendars, DjVu, metadata remover, steghide, RAW, ImageMagick, panorama, favicon, SoX, MIDI, Anki,
   PARI/GP, OpenSCAD, Kiwix, ESP flasher, webR, Wiregasm, Scratch, Open Food Facts, Open Library; upgrades JBIG2,
   unpaper, GMP, PROJ). The owner
   removed Chess, Ruff/Biome and Offline Translation — never suggest them again.
   Ask the owner which to build **when step 1 (per-tab suites) is finished, before starting step 2**, and at the start
   of any new session. Build nothing from it (or from the older `docs/IDEAS.md`) until the owner picks.

## Environment notes for a fresh container
- Zig is NOT persistent: reinstall per CLAUDE.md §5 (`pip download ziglang==0.17.1`, unzip, `export ZIG=…`).
- `npm ci` then `npm test` (unit, ~1.5 s) and `npm run build && node tests/e2e.mjs` (parallel e2e).
- huggingface.co + its CDN hosts are allowed in the environment (models for Whisper/Kokoro/Piper).
- Fixtures are committed (`tests/fixtures/`, regenerate with `node scripts/make-fixtures.mjs`).
