# Bug hunt — second pass over every tab (started 17 Nov 2026)

Owner request: "Go through all the apps, search for bugs, write more test cases for every single app, squash all bugs — **don't leave out any app**."

Method: (1) an independent reviewer per area reads the source + the existing suite and tries to break each tab in the
running site (reports in the session scratchpad, findings verified before fixing); (2) a sweep of all tabs (desktop +
phone): page errors, horizontal scroll, touch targets, unnamed controls, every button pressed in the default state;
(3) every confirmed bug fixed in the app and pinned by a new check in that tab's suite; (4) full unit + e2e run.

Status per tab — **R** reviewed, **B** bugs fixed (count), **T** checks added to its suite (count). A tab is done only when R is ticked.
Areas with a shared review: the app shell (router, search, favorites, platform hiding, lifecycle) is its own area.

## images
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `image` | Image Editor | PC + mobile | images1 | ✓ | 4 | 17 | resize → @jsquash/resize (linear light), imgproc kept (magick-wasm 15.5 MB, slower; wasm-vips needs SAB); JPEG of transparency on white; straighten crops its corners; size boxes checked |
| `batch` | Batch Images | PC only | images1 | ✓ | 4 | 8 | jSquash resize; unique result names (shared list); sizes/scale checked; failed files listed; Stop |
| `heic` | HEIC → JPG | PC + mobile | images1 | ✓ | 3 | 17 | libheif-js kept (latest) + lcms-wasm: Display P3 → sRGB (iPhone colours were off, every HEIC tab); primary image; failed files listed |
| `passport` | Passport Photo | PC + mobile | images2 | ✓ | 5 | 6 | MediaPipe 1.2.3 (latest) + imgproc kept; no stale result after a face-less photo; Cancel ends the countdown; camera errors worded (shared src/lib/camera.ts); custom size 10–150 mm; jSquash resize for upload; a11y sweep (white chips in the dark theme) |
| `formphoto` | Photo & Signature Resizer | PC + mobile | images2 | ✓ | 8 | 56 | engines kept + jSquash resize; KB read strictly (max ×1000, min ×1024); dpi before padding (was +18 bytes over max); metacore padding exact; no download of an over-max file; per-field reasons; re-frame without new face search; newest photo wins; object URLs revoked |
| `bgremove` | Background Remover | PC + mobile | images2 | ✓ | 8 | 21 | MediaPipe + imgproc kept (imgly ISNet noted for objects); newest photo/background wins; no-person said + Save refuses; failure reason on Save; status restored; .swatch CSS clash with Color tab fixed (.bg-swatch); 44 px swatches with pressed state; model note only first time |
| `cartoon` | Cartoonizer | PC + mobile | images2 | ✓ | 7 | 8 | imgproc + TF.js (wasm/WebGL) kept; see-through photo/painting on white (onWhite in imgio); one AI painting at a time, newest settings follow; Save refuses a stale AI result; keyboard compare; model note only until loaded |
| `redact` | Blur & Redact | PC + mobile | images2 | ✓ | 6 | 13 | Save refused during the face search (it saved every face visible); newest photo wins; boxes drawn during the search kept; failure in the status line; pointercancel; setPointerCapture guarded |
| `watermark` | Watermark | PC + mobile | images1 | ✓ | 6 | 7 | unreadable first photo no longer blocks the preview; Clear photos; empty text refused; logo errors said; failures listed; HEIC logos; jSquash resize |
| `caption` | Text on Image | PC + mobile | images1 | ✓ | 3 | 21 | over-long words and CJK broken between graphemes (src/lib/textwrap.ts); long text shrunk to fit |
| `collage` | Collage Maker | PC + mobile | images1 | ✓ | 2 | 4 | A4 JPEG says 300 dpi; first photo's Move earlier off; jSquash resize on save |
| `exif` | EXIF / Photo Info | PC + mobile | images1 | ✓ | 8 | 106 | engine replaced by ExifTool 13.42 (zeroperl wasm, worker): iPhone HEIC position was hidden; HEIC/WebP stay their format on strip; orientation + ICC kept; XMP/IPTC/maker notes/previews shown; non-photo files named; newest photo wins; HEIC preview; DMS carry |
| `scanner` | Doc Scanner | PC + mobile | images2 | ✓ | 12 | 63 | page finder: DocCornerNet LEAN on ONNX Runtime Web (WASM-AUDIT 121); OpenCV's area resize in imgproc; memory, phone picker, B&W lossless, Fit to scan |
| `ocr` | OCR | PC + mobile | images2 | ✓ | 6 | 11 | language data that cannot be fetched no longer hangs the tab; sideways/upside-down pictures turned; dark mode; phone picker (also passport, signature) |
| `signature` | Signature Maker | PC + mobile | images1 | ✓ | 5 | 9 | strokes scaled with the pad; ink colour for the whole signature; fonts only for Type; blank paper said |

## documents
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `pdf-merge` | Merge PDF | PC + mobile | pdf | ✓ | 4 | 37 | annotations, links, forms, outlines kept (graftPage dropped them); one graft map per file |
| `pdf-split` | Split PDF | PC + mobile | pdf | ✓ | 4 | 14 | parts keep annotations/links/forms/outline (rearrangePages); one at a time; N pages box; page lists read |
| `pdf-organize` | Organize PDF | PC + mobile | pdf | ✓ | 4 | 5 | rearrangePages keeps annotations/links/forms/outline; tiles at once; newest PDF wins; Rotate all |
| `img2pdf` | Images → PDF | PC + mobile | pdf | ✓ | 3 | 3 | Fit keeps a scan's paper size (its own dpi); Sort by file name; URLs released |
| `pdf2img` | PDF → Images | PC + mobile | pdf | ✓ | 5 | 7 | a run keeps its own file; size cap 16384 px / 100 MP; padded names; stops on leave |
| `pdf-compress` | Compress PDF | PC + mobile | pdf | ✓ | 5 | 5 | a run keeps its own file; ends with the tab; colour-key masks kept; target in 1000-byte KB; scan mode within memory |
| `pdf-sign` | Sign PDF | PC + mobile | pdf | ✓ | 6 | 8 | signature tied to its page; kept on the page; strokes scaled with the pad; Clear wins; typed bounds measured; blank paper |
| `pdf-fill` | Fill PDF Form | PC + mobile | pdf | ✓ | 3 | 3 | unchosen radio shown unchosen; ticks via ZapfDingbats + ToUnicode; ₹ limit said |
| `pdf-unlock` | Unlock PDF | PC + mobile | pdf | ✓ | 1 | 2 | a signed PDF: the unlocked copy no longer proves the signature — said |
| `pdf-protect` | Protect PDF | PC + mobile | pdf | ✓ | 2 | 4 | signed PDF said; non-ASCII password warned (SASLprep) |
| `pdf2text` | PDF → Text | PC + mobile | pdf | ✓ | 4 | 3 | page by page with progress; form values listed; option relabelled; empty copy said |
| `pdf-pagenum` | PDF Page Numbers | PC + mobile | pdf | ✓ | 2 | 4 | a run keeps its own file; ends with the tab; progress |
| `pdf-watermark` | PDF Watermark | PC + mobile | pdf | ✓ | 2 | 4 | a run keeps its own file (sizes were read from the new one); ends with the tab; progress |
| `epub` | PDF → EPUB | PC only | docs2 | ✓ | 17 | 94 | columns with 7.5 pt gutters; margin stamps; bold/size of a line from its spans; U+FFFF; formulas as pictures; bookmarks; /Lang; no freeze; newer PDF ends a run; epubcheck |
| `sheet` | CSV / Excel | PC only | docs2 | ✓ | 18 | 141 | errors #DIV/0!; durations; 15 digits; exact numbers; JSON keys/IDs; Windows-1252/UTF-16; web-page .xls + Excel 2003 XML; newest file wins; Excel limits; LibreOffice reference |
| `markdown` | Markdown Editor | PC + mobile | docs2 | ✓ | 14 | 30 | #fn links left the tab; Ctrl+K focus; Ctrl+P preview only; remote pictures not fetched; undoable toggles; GitHub heading ids; GFM spec 744 examples; a11y sweep (pre lang, task boxes) |
| `invoice` | GST Invoice | PC + mobile | docs2 | ✓ | 8 | 21 | UPI QR @ as NPCI writes it (was %40), zbar read-back; links survive into PDFs; pictures in details; downloads wait for pictures; a11y sweep |
| `rent` | Rent Receipt | PC + mobile | docs2 | ✓ | 8 | 25 | cash receipts no longer spill onto empty pages (3/2/1 a page); 120 months; reasons in words; PAN format; a11y sweep; cash receipts no longer spill onto empty pages (3/2/1 a page); 120 months; reasons in words; PAN format; a11y sweep; a pasted 500 KB address froze the tab — box lengths (all three forms) |
| `resume` | Resume Builder | PC + mobile | docs2 | ✓ | 8 | 10 | mailto/tel/https links; JPEG photo; safe file name; download waits for the photo (the flaky 'photo included'); a11y sweep |

## security
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `pgp` | OpenPGP | PC + mobile | security-codes | ✓ | 8 | 169 | a 2nd recipient was dropped (library reads 1 armored block); stored file name; armor inside e-mail; errors in words; key IDs; fingerprint+date; RFC 9580 vectors; gpg both ways. Engine kept (rPGP semantics layer experimental); a 2nd recipient was dropped (library reads 1 armored block); stored file name; armor inside e-mail; errors in words; key IDs; fingerprint+date; RFC 9580 vectors; gpg both ways. Engine kept (rPGP semantics layer experimental). 21 Nov 2026: 'Latest standard (RFC 9580)' mode, tested both ways against rPGP and Sequoia |
| `sodium` | Sodium Encrypt | PC + mobile | security-codes | ✓ | 5 | 53 | engine → libsodium.js (sumo, libsodium 1.0.22) + crypto.wasm header; pasted text in every form (atob errors), .txt files, progress during Argon2; PyNaCl + cross-engine tests |
| `sharelink` | Encrypted Share Link | PC + mobile | security-codes | ✓ | 10 | 32 | engine as sodium (libsodium.js + crypto.wasm header); links read as they arrive (cut, changed, trailing full stop, %-escapes, other site's d=), password twice, long-link warning, autocomplete, Enter |
| `hash` | Hash / Checksum | PC + mobile | security-codes | ✓ | 11 | 140 | engine → hash-wasm (existing wasm, 23 algorithms, own worker, Stop); expected checksums in every common form, checksum lists, auto-added algorithms, secure file comparison; crypto-client ordering fix; 20 Nov: a name with a backslash written as it is — Ubuntu 26.04's sha256sum (uutils 0.10) and BusyBox (the Terminal tab) read no escaped line; found by GitHub's build machine |
| `password` | Password Generator | PC + mobile | security-codes | ✓ | 3 | 37 | randombytes_uniform → libsodium.js; exact entropy (inclusion–exclusion), length box 4–128, symbols box, named copy buttons |
| `passphrase` | Passphrase Generator | PC + mobile | security-codes | ✓ | 3 | 17 | libsodium.js; word list checked (7,776 words; error pages were used as lists); digit entropy log2(10×n); named copy buttons; flaky split fixed; lazy suite root-folder gap fixed |

## media
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `video` | Video Compressor | PC + mobile | video | ✓ | 8 | 15 | video area 20 Nov 2026 (docs/BUGHUNT.md) |
| `audio` | Audio Recorder | PC + mobile | audio | ✓ | 7 | 4 | decoded at the file's own rate (was the device's: 44.1 kHz saved as 48 kHz); newest file wins; mic errors in words; touch + a11y sweeps |
| `tts` | Text-to-Speech | PC + mobile | audio | ✓ | 6 | 3 | Speak stayed busy after Stop; runs queued in the worker; sentence shown when heard; system-voice errors; text encodings; download size |
| `stt` | Speech to Text | PC + mobile | audio | ✓ | 12 | 9 | names box faded after ~224 tokens (carry_initial_prompt, rebuilt whisper.wasm); decode at 16 kHz; new file clears transcript; download overflow; touch sweep; REMOVED by the owner on 20 Nov 2026 (room for apps used more often; last in commit f1e9f21) |
| `noise` | Noise Remover | PC + mobile | audio | ✓ | 12 | 33 | Jitsi's RNNoise 0.2 build (= the release's standard 8-bit computation; ours ran the debug float weights, 4× larger); Save after a new file; strength re-cleaned everything; stereo voice; 16-bit WAV round trip; touch sweep |
| `pitch` | Pitch & Speed | PC + mobile | audio | ✓ | 8 | 7 | Signalsmith Stretch (official wasm/AudioWorklet, MIT) replaces our WSOLA: chord 7-15 dB cleaner; Save after a new file; coalesced renders; selection follows the passage |
| `slideshow` | Slideshow Maker | PC + mobile | video | ✓ | 5 | 5 | video area 20 Nov 2026 (docs/BUGHUNT.md) |
| `ffmpeg` | FFmpeg | PC only | video | ✓ | 9 | 6 | video area 20 Nov 2026 (docs/BUGHUNT.md); +1 solo run: the new-file stop note was wiped by the probe; +2 stop during the load (the job ran after Stop / a new file); junk sweep (no media) |
| `screencast` | Screencast | PC only | video | ✓ | 4 | 5 | video area 20 Nov 2026 (docs/BUGHUNT.md) |
| `screenshot` | Screenshot | PC only | video | ✓ | 4 | 4 | video area 20 Nov 2026 (docs/BUGHUNT.md) |
| `youtube` | YouTube Clip | PC only | video | ✓ | 7 | 54 | video area 20 Nov 2026 (docs/BUGHUNT.md); 20 Nov (owner): nothing said that yt-dlp needs Deno for YouTube or that apt's copy is too old — the owner got HTTP 403 |

## calculators
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `calc` | Scientific Calculator | PC + mobile | calc-core | ✓ | 23 | 308 | engine kept (WASM-AUDIT 56: no tried-and-tested wasm calculator); reference mpmath at 50 digits for 3,005 expressions; exact round angles, whole numbers digit for digit, exact chaining through Ans, refusals with reasons; a11y sweep (bc log, DEG/RAD 22 px) |
| `units` | Unit Converter | PC + mobile | calc-core | ✓ | 6 | 118 | no engine to replace (WASM-AUDIT 57); exact definitions held to GNU Units 2.23 (3,222 conversions); small results keep their digits; metric and US kitchen measures; Indian area units |
| `dates` | Date Calculator | PC + mobile | calc-core | ✓ | 7 | 40 | nothing to replace (WASM-AUDIT 58); held to Python's datetime (6,985 cases, years 1–9999); today() is the local date; years 0–99; end date counted in y-m-d; refusals |
| `emi` | EMI Calculator | PC + mobile | calc-core | ✓ | 15 | 127 | nothing to replace (WASM-AUDIT 59); held to a month-by-month reference in mpmath at 420 digits (936 loans) + numpy-financial; closed forms over the whole range; unit label follows years / months; refusals with reasons; schedule stays open; paise with two digits |
| `gst` | GST Calculator | PC + mobile | calc-core | ✓ | 6 | 62 | nothing to replace (WASM-AUDIT 60); whole paise in mathcore m_gst, held to Python's decimal (1,126 pairs × 4 modes); CGST + SGST add up to the GST shown; base + GST = the amount typed when it includes the tax; Other rate; paise() reads amounts as written (also for the invoice engine) |
| `sip` | SIP Calculator | PC + mobile | calc-core | ✓ | 10 | 75 | nothing to replace (WASM-AUDIT 61); held to a month-by-month reference in mpmath (1,430 plans, 180 lump sums) + numpy-financial fv; refusals with reasons; no more freeze on absurd periods; figures add up as shown; instalments row |
| `fd` | FD / RD Calculator | PC + mobile | calc-core | ✓ | 11 | 144 | nothing to replace (WASM-AUDIT 62); held to mpmath (1,100 deposits, 1,000 recurring deposits) + the banks' RD formula + exact decimal yields; refusals with reasons; no freeze; engine growth() keeps 15 digits over 1,200 periods; shared roundDec (7.1225 → 7.123) with its own unit suite |
| `percent` | Percentage Calculator | PC + mobile | calc-core | ✓ | 9 | 94 | nothing to replace (WASM-AUDIT 63); exact decimals: one division of whole numbers, held to Python's fractions (841 pairs × 6); tiny answers never 0; % change by |A| with the right sign; reasons where there is no answer; copy plain digits |
| `words` | Number to Words | PC + mobile | calc-core | ✓ | 10 | 188 | nothing to replace (WASM-AUDIT 64); held to num2words (1,598 numbers, both systems); 'and' before a last part below a hundred; singular paisa / dollar / cent; plain numbers with any decimals and a sign; all 19 digits in Digits; lenient reading of ₹ Rs INR /-; shared with invoice and rent receipt |
| `timezone` | Time Zone Converter | PC + mobile | calc-core | ✓ | 6 | 106 | nothing to replace (WASM-AUDIT 65: the browser's zone database); held to Python's zoneinfo (2,288 offsets, 3,095 readings around clock changes); offsets with seconds; years 1–99; a To zone among all zones; the year shown; renamed zones; difference in words |
| `bmi` | BMI Calculator | PC + mobile | calc-core | ✓ | 6 | 45 | nothing to replace (WASM-AUDIT 66–68); exact fractions for 1,141 people; healthy range = exactly the weights classed Normal; feet + inches + pounds in their own boxes; inputs checked |
| `calories` | Calorie Calculator | PC + mobile | calc-core | ✓ | 2 | 24 | Mifflin–St Jeor in exact decimals for 588 people; inputs checked; loss targets under 1,200 / 1,500 kcal marked too low with a note |
| `duedate` | Pregnancy Due Date | PC + mobile | calc-core | ✓ | 5 | 41 | Python's datetime for 1,255 pregnancies; today is the local date; past-due and future periods said in words; whole cycles only; days to go |
| `tip` | Tip & Bill Splitter | PC + mobile | calc-core | ✓ | 4 | 27 | nothing to replace (WASM-AUDIT 69–71); whole paise, shares rounded up so the bill is covered, left-over shown; people a whole number; 2,112 bills by decimal arithmetic |
| `fuel` | Fuel Cost Calculator | PC + mobile | calc-core | ✓ | 5 | 39 | exact fractions for 245 trips; inputs checked; 1 litre; small amounts keep three decimals; distance keeps its decimal |
| `gpa` | GPA Calculator | PC + mobile | calc-core | ✓ | 4 | 24 | exact fractions for 400 grade sheets; rows outside the scale, with negative credits or half empty are named and left out; credits on both scales |
| `base` | Number Base Converter | PC + mobile | calc-core | ✓ | 6 | 79 | nothing to replace (WASM-AUDIT 72–73); Python int() + numpy base_repr for 464 numbers up to 6,000 bits; prefixes only in their own base; reasons for wrong digits, no stale boxes; custom base checked; chunked arithmetic (29× faster) |
| `roman` | Roman Numerals | PC + mobile | calc-core | ✓ | 4 | 72 | the roman library for all 3,999 numerals and 3,000 strings; additive forms (IIII) read with the standard form named; Unicode numerals; reasons; parts |
| `prepay` | Loan Prepayment | PC + mobile | calc2-math | ✓ | 9 | 36 | nothing to replace (WASM-AUDIT 74–78); mpmath simulation of 520 prepayments; prepay now (0 months), months checked, prepayment capped at what is owed and said, prepaid in all, figures add up |
| `ppf` | PPF Calculator | PC + mobile | calc2-math | ✓ | 5 | 25 | closed form in mpmath for 192 accounts; whole years 1–50, ₹500 – ₹1.5 lakh; note when not a maturity year |
| `epf` | EPF Calculator | PC + mobile | calc2-math | ✓ | 6 | 26 | EPFO method (interest on monthly opening balances, credited yearly — monthly compounding overstated the corpus); 144 accounts in mpmath; own / employer / EPS rows that add up; ages checked |
| `nps` | NPS Calculator | PC + mobile | calc2-math | ✓ | 7 | 27 | PFRDA December 2025: 20 % least annuity for non-government subscribers, 40 % government (it was silently raised to 40); 90 accounts in mpmath + numpy-financial; lump + annuity = corpus |
| `inflation` | Inflation Calculator | PC + mobile | calc2-math | ✓ | 6 | 26 | mpmath for 240 cases; deflation (gained / halve), 0 % never doubles, limits and reasons; power by mathcore growth() |
| `sleep` | Sleep Cycle | PC + mobile | calc2-math | ✓ | 4 | 41 | nothing to replace (WASM-AUDIT 79–81); Python datetime for 400 nights; minutes 0–180 whole, empty time refused, the day each time falls on, new 'Go to bed now' that follows the clock |
| `bodyfat` | Body Fat | PC + mobile | calc2-math | ✓ | 7 | 61 | mpmath for 700 bodies (US Navy equations); measurements checked one by one, impossible results refused with the figure, class by the number shown, hip only for women, fat + lean = weight |
| `idealweight` | Ideal Weight | PC + mobile | calc2-math | ✓ | 3 | 28 | exact fractions for 384 heights; no formula below 5 feet (was the weight of 152.4 cm), same healthy range as the BMI tab (one routine), WHO range, feet + inches / lb |
| `coords` | Coordinates Converter | PC + mobile | calc2-math | ✓ | 13 | 99 | NEW ENGINE geo.wasm = Karney's geodesic.c 2.2 on WGS-84 (WASM-AUDIT 82; the sphere was up to 0.5 % off); reference Karney's Python + Vincenty in mpmath, 437 pairs; reader rewritten (minus signs, words, comma, pairs, marks; reasons); DMS carry; half B said |

## math
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `graph` | Graphing Calculator | PC + mobile | calc2-math | ✓ | 11 | 96 | nothing to replace (WASM-AUDIT 83); FROZEN TAB on deep zoom fixed (zoom limits, counted grid lines); engine m_expr_plot tells jumps and poles from steep curves (1000x was not drawn, floor had connectors); reasons under the boxes, x = 2 vertical line, zoom about cursor / fingers, keys, 'undefined' readout |
| `equation` | Equation Solver | PC + mobile | calc2-math | ✓ | 14 | 93 | engine kept + exact fractions on BigInt (WASM-AUDIT 84): kind of every answer exact — (x−1.1)² showed two roots, (x−1)²(x−10⁶) a complex pair; Kahan's quadratic/cubic in mathcore; linear systems: none vs infinitely many, small-unit systems no longer 'unsolvable'; identities, other letters, 50-root cap said; live + Enter; reference fractions + mpmath |
| `stats` | Statistics | PC + mobile | calc2-math | ✓ | 12 | 46 | nothing to replace (WASM-AUDIT 85); exact sums (fsum) — 1e16+1−1e16 was 0; skewness corrected for the rounded mean; extremes scaled; left-out pieces named, real minus read; reasons for every —; regression without 'Error'; reference fractions + Python statistics |
| `matrix` | Matrix Calculator | PC + mobile | calc2-math | ✓ | 8 | 74 | engine kept for large matrices + exact fractions on BigInt up to 400 cells (WASM-AUDIT 86): det 0 is 0, inverse in fractions, fractions typed; tiny values no longer shown as 0 or called singular (relative tests in mathcore); refusals name matrix, row and shapes; reference Python fractions + NumPy |
| `fraction` | Fraction Calculator | PC + mobile | calc2-math | ✓ | 6 | 51 | nothing to replace (WASM-AUDIT 87–88); engine now 128-bit — (1/2)^100 said 'Division by zero', 64-bit limit; ½ ¼, 1e3, hints and quoted errors; exact decimals with repeating digits in brackets; reference Python fractions (700 expressions) |
| `primes` | Prime / LCM / GCD | PC + mobile | calc2-math | ✓ | 5 | 18 | engine agrees with SymPy on 420 hard 64-bit numbers; left-out pieces named (negatives, 0, decimals, words vanished; 0x10 was 16); one too-large number no longer blanks the answer; next prime after primes; copyable GCD/LCM |
| `periodic` | Periodic Table | PC + mobile | calc2-math | ✓ | 6 | 70 | no engine (WASM-AUDIT 89); data held to the mendeleev package (11 knowing differences listed); search: symbol first ('s' showed sodium), other spellings, categories; legend filter, selection mark, arrow keys, gap markers, 'predicted' from 104, 44 px cells on phones; a11y sweep (label in name) |

## text
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `wordcount` | Word Counter | PC + mobile | text | ✓ | 17 | 145 | new engine textkit.wasm (unicode-segmentation + own rules); words as Word counts them; abbreviations, initials; lazyEngine for all wrappers |
| `case` | Case Converter | PC + mobile | text | ✓ | 14 | 108 | conversions in textkit.wasm (case.rs); Title Case = port of python titlecase; code cases held to change-case; lines kept |
| `lines` | Line Tools | PC + mobile | text | ✓ | 10 | 102 | linetools.ts; held to GNU sort/awk/sed on 400 lists; 0 → 9 sort; shuffle stays put; engines lazy |
| `replace` | Find & Replace | PC + mobile | text | ✓ | 9 | 77 | worker + 5 s limit; Unicode whole words; ^ $ per line; \n in replacement; held to Python re on 226 searches |
| `diff` | Text Diff | PC + mobile | text | ✓ | 9 | 65 | engine → similar crate (textkit-diff.wasm); line numbers, marked changes, folds, unified diff; held to GNU diff -d and GNU patch |
| `fancy` | Fancy Text | PC + mobile | text | ✓ | 10 | 118 | characters by textkit.wasm (emoji, Hindi stay whole); digits/brackets turn; tap a row to copy; long texts; alphabets held to Unicode's names |
| `emoji` | Emoji & Symbols | PC + mobile | text | ✓ | 7 | 137 | search by keywords, ranked by textcore.wasm (was: letters inside the name); symbols by name; skin tones; emoji the font lacks left out; data held to unicode-emoji-json and Perl's names |
| `morse` | Morse Code | PC + mobile | text | ✓ | 13 | 90 | characters and groups no longer vanish silently; lines and word gaps read; sound: Stop, typographic signs, line gaps; held to unixcw's libcw (table and timing) |
| `lorem` | Lorem Ipsum | PC + mobile | text | ✓ | 9 | 121 | engine → lipsum crate (textkit-lorem.wasm) + our glue for 2 crate defects; up to 20,000 words (was 50); exact counts held to the Word Counter; text held to the crate's own texts |
| `photodict` | Photo Dictionary | PC + mobile | text | ✓ | 6 | 21 | rare.c: case table (Gdańsk was gdaŅsk), titles/initials end no sentence (names found), bounded writes; a 2nd photo while reading was dropped; Snap before the first frame. 21 Nov 2026: PC + mobile (owner), the shared live camera — a PC webcam's photo of the page gives the same 20 words |

## software
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `json` | JSON Formatter | PC only | dev-data2 | ✓ | 8 | 69 | own lossless Rust formatter: member order, duplicate keys and number spelling kept (JSON.stringify moved "10" first, dropped duplicates, rewrote 1.0 / 1e5); duplicate-key warning; a worded message + line / column + Show it for every mistake; no stale output; Minify stays; BOM; deep nesting |
| `regex` | Regex Tester | PC only | dev-data2 | ✓ | 4 | 18 | matching in a worker: a runaway pattern is stopped after 2 s (it froze the tab); flag mistakes named; named groups in the table; a million matches counted |
| `base64` | Base64 | PC only | dev-data2 | ✓ | 9 | 34 | on devcore-enc: data: URLs, %3D, extra padding, zero-width characters accepted; binary results recognised, shown as hex, saved under the right name; Download no longer decodes the plain text in Encode; 30 MB file 21 s → 4 s; vs Python base64 |
| `urlenc` | URL Encoder | PC only | dev-data2 | ✓ | 7 | 65 | + is a space only in queries (mailto:user+tag, tel:+91 broke); lenient decoding (Windows-1252, stray %) instead of '⚠ URI malformed'; full URL without double encoding, IPv6, Punycode (= Node's URL); parts from the URL itself; vs Python quote |
| `epoch` | Epoch Converter | PC only | dev-data2 | ✓ | 6 | 45 | µs / ns recognised, separators, 1.7e9, ISO and dd/mm/yyyy dates, unit shown and selectable, picker in step, no NaN; 120 instants vs Python in 3 time zones |
| `uuid` | UUID Generator | PC only | dev-data2 | ✓ | 5 | 36 | v7 strictly increasing (crypto.wasm, RFC 9562 method 2); switches rewrite the same IDs; inspector: braces / urn, nil / max, v1 / v6 time, clock sequence, node; vs Python uuid |
| `color` | Color Converter | PC only | dev-data2 | ✓ | 7 | 34 | alpha kept (8-digit hex); rgb % / exponents, hsl turn / rad / grad, oklch L 0–1, oklab, hwb, names; colours outside sRGB mapped as CSS Color 4 (was rgb(-1065, …)); wrong input marked; exact round trips over all 16.7 M colours; vs colorsys + Chrome's CSS engine |
| `jwt` | JWT Decoder | PC only | dev-data2 | ✓ | 8 | 34 | Bearer / quotes / wrapped; JWE; null, list, text, non-UTF-8 payloads; 20-digit claims not rounded; exp as string / ms; alg none; damaged signature; UTC + local + relative times; vs PyJWT |
| `sqlite` | SQLite Playground | PC only | data-engines | ✓ | 22 | 155 | official SQLite wasm; engine drives its C API: SQLite's own parser cuts scripts, error line / column, values keep their type (exact big integers, reals as SQLite writes them, blobs), own-changes count, time limit, files checked before replacing + undo, WAL, imports with types from sheet.wasm (leading zeros, long ids, every sheet), exports of all kept rows; reference = native SQLite (160 statements unit; 12 queries, 3,000-row CSV / JSON and the downloaded file e2e) |
| `jq` | jq Playground | PC only | data-engines | ✓ | 19 | 5861 | runs in a worker (10 s limit, Stop, 16 MB output stop, restart after out of memory); glue follows jq's main.c with jq's own input reader: messages with input.json:N, exit status of the last input, halt, debug / stderr, input_filename, -r -a; memory 2 GB and given back; reference = native jq 1.8.2 for 4,903 cases (unit) and 192 typed into the page; runs in a worker (10 s limit, Stop, 16 MB output stop, restart after out of memory); glue follows jq's main.c with jq's own input reader: messages with input.json:N, exit status of the last input, halt, debug / stderr, input_filename, -r -a; memory 2 GB and given back; local time (localtime, strflocaltime, %Z %z) is the browser's zone, was UTC (host answers supertools.tz_info, wasm/jq/hosttz.c); reference = native jq 1.8.2 for 4,903 cases + 891 local-time cases in 27 zones (unit) and 192 + 4 zones (e2e); junk sweep |
| `yaml` | YAML ⇄ JSON ⇄ TOML | PC only | data-engines | ✓ | 23 | 1934 | own value model + own JSON / YAML / TOML writers: numbers keep every digit, YAML output quotes what YAML 1.1 parsers misread (no, y, 1_000, 1:30, dates), .inf / .nan and TOML dates travel, TOML refuses what 64 bits cannot hold; notes for keys written twice; outputs read back by PyYAML, ruamel.yaml and tomllib (1,750 texts), 393 texts written by other programs read correctly; junk sweep |
| `xml` | XML Formatter / XPath | PC only | dev-data2 | ✓ | 10 | 46 | own Rust formatter moves white space only: declaration, DOCTYPE, entities, &#10;, nbsp and padded text were lost or rewritten; <parsererror> element; xml: and default-namespace prefixes in XPath; ISO-8859-1 / UTF-16 files; 74 documents compared by Chrome's parser |
| `json2types` | JSON → Types | PC only | dev-data2 | ✓ | 13 | 112 | own Rust generator; every output compiled by tsc, go, rustc, javac, python for 36 samples: root lists / values as aliases, colliding and reserved names, shadowed type names, one-file Java, Python kw_only and kept keys, keys Go cannot tag, uint64 / BigInteger, plurals; junk sweep |
| `jsondiff` | JSON Diff | PC only | dev-data2 | ✓ | 8 | 72 | own Rust diff on the lossless reader: lists aligned by equal elements and by id (one removal was N changes); numbers by value and never rounded; duplicate keys; empty sides; Swap; rows carry both values; 400 random pairs with two appliers; junk sweep |
| `sqlfmt` | SQL Formatter | PC only | data-engines | ✓ | 27 | 148 | our own formatter (Rust, devcore-sqlfmt.wasm) replaces the sqlformat crate, which changed the meaning of SQL (WASM-AUDIT 53): dialect-aware tokenizer (standard, PostgreSQL, MySQL, SQLite, SQL Server, Oracle; auto-detect), keywords change case only where they are keywords, layout of CTEs / MERGE / windows / DDL / blocks, scripts without semicolons, a guard that re-reads its own result; unit 113 (independent reader, SQLite engine, 10,752 names, layout record), e2e 49 (native SQLite, sqlglot, sqlparse read what the tab shows); junk sweep |
| `prettier` | Code Formatter | PC only | data-engines | ✓ | 15 | 283 | engines changed (WASM-AUDIT 54): Biome's official wasm (JS/TS/CSS/SCSS/YAML/GraphQL), @dprint/json, dprint-plugin-markup + Biome (HTML, Vue); Prettier for Markdown and as fallback. Independent readers per language (TypeScript parser, PostCSS, yaml, marked + cmark-gfm, parse5, graphql-js, Vue compiler); 140 hazard sections x 8 option sets; typed text survives a language switch; stale results; Markdown fences; Vue ts scripts and handlers; JSON numbers as typed; worker; junk sweep |
| `mockdata` | Mock Data Generator | PC only | dev-data2 | ✓ | 13 | 50 | ranges beyond 32 bits, swapped / unreadable ranges explained, dd/mm/yyyy dates (threw 'Invalid time value'), id start, fine-grained decimals, duplicate / empty / __proto__ names, quoted SQL names (run in SQLite), word-count limit, no fields; a11y sweep |
| `mdtable` | Markdown Table | PC only | dev-data2 | ✓ | 9 | 31 | separator found by the sheet engine (a tab in a quoted cell forced TSV); <br> for line breaks, also in the editor; table inside other text; CJK / emoji widths; 3,000 rows; output read by cmark-gfm; a11y sweep |
| `cidr` | Subnet / CIDR Calculator | PC only | net | ✓ | 3 | 74 | e2e 15→43 + 46 unit; 300 cases vs Python ipaddress |
| `chmod` | chmod Calculator | PC only | net | ✓ | 3 | 26 | e2e 13→39; 800 modes + 1,152 expressions vs real chmod |
| `x509` | Certificate Decoder | PC only | net | ✓ | 10 | 66 | e2e 16→45 + 37 unit; fixtures vs OpenSSL |
| `sshkey` | SSH Key Generator | PC only | net | ✓ | 2 | 58 | e2e 16→34 + 40 unit; keys from another tool |
| `hmac` | HMAC Generator | PC only | net | ✓ | 4 | 68 | e2e 10→30 + 35 unit; streaming, RFC 4231; e2e 10→30; unit 48 (RFC 2104 / 2202 / 4231, 6,272 combinations vs OpenSSL); engine = hash-wasm since the audit |
| `pwhash` | Password Hash Tool | PC only | net | ✓ | 3 | 107 | e2e 15→31 + 36 unit; e2e 15→31; unit 92 (Argon2 reference vectors incl. version 1.0, Openwall bcrypt, RFC 6070, RFC 7914, 48 OpenSSL-made hashes); engine = hash-wasm + our supplement (PHC strings, checks, Argon2 1.0) |
| `apikey` | API Key Generator | PC only | net | ✓ | 2 | 15 | e2e 11→26 |
| `curl` | cURL Converter | PC only | net | ✓ | 12 | 89 | e2e 10→22 (35 commands vs real curl) + 77 unit (new) |
| `cron` | Cron Explainer | PC only | misc | ✓ | 3 | 27 | e2e 17→40 + unit; never-running + DST-gap freeze |
| `escape` | String Escape | PC only | misc | ✓ | 8 | 45 | e2e 18→35 + 28 unit |
| `unicode` | Unicode Inspector | PC only | misc | ✓ | 9 | 50 | e2e 16→30 + 34 unit |
| `hexview` | Hex Viewer | PC only | misc | ✓ | 5 | 33 | e2e 14→29 + 18 unit |
| `logview` | Log Viewer | PC only | misc | ✓ | 9 | 25 | e2e 13→32 + 5 unit (60 log lines); junk sweep |
| `mermaid` | Mermaid Diagrams | PC only | misc | ✓ | 2 | 12 | e2e 9→21 |
| `sla` | SLA / Uptime Calculator | PC only | misc | ✓ | 3 | 19 | e2e 10→25 + 4 unit |
| `transfer` | Data Transfer Calculator | PC only | misc | ✓ | 4 | 18 | e2e 10→28 |
| `semver` | Semver Checker | PC only | misc | ✓ | 7 | 24 | e2e 8→18 + 14 unit; engine = our port of npm semver, 16,380 pairs vs the package |
| `glob` | Glob Tester | PC only | misc | ✓ | 2 | 44 | e2e 16→39 + 21 unit; own Unicode-aware matcher vs Python glob.translate (420 patterns) |
| `terminal` | Linux Terminal | PC only | terminal | ✓ | 4 | 3 | terminal 20 Nov 2026 (docs/BUGHUNT.md); v86: owner said leave it out (20 Nov 2026) |
| `graphviz` | Graphviz (DOT) | PC only | data-engines | ✓ | 22 | 713 | engine: own build kept (WASM-AUDIT 55 — Viz.js and hpcc trap on valid graphs), now Graphviz 16.1.0 + storeline fix, prism on our Delaunator port, glibc qsort/rand (dot = native byte for byte), browser text measuring, assertions kept; reference = native dot (3,464 drawings) |
| `python` | Python Scratchpad | PC only | data-engines | ✓ | 21 | 314 | native CPython 3.14.8 is the reference for 69 programs (stdout + stderr byte for byte); recursion through C code ends in RecursionError instead of killing the run, lru_cache in Python (cached recursion as deep as on a desktop), local time with tzdata's names and flags, socket stand-in + asyncio, pbkdf2_hmac; output pane survives 300,000 lines (92 s → 1.4 s), shows output during long computations, \r / colours / the answers to input(); hints for errors particular to the tab; a11y sweep; junk sweep (binary, Windows-1252) |
| `totp` | TOTP / 2FA Codes | PC only | net | ✓ | 6 | 74 | e2e 11→49 + 25 unit; RFC 4226/6238; e2e 11→49; unit 36 (RFC 4226 / 6238, 600 random cases vs an independent implementation); HMAC = hash-wasm, Base32 + truncation = our supplement |
| `pwstrength` | Password Strength | PC only | net | ✓ | 6 | 95 | e2e 13→32 + 76 unit (new); 304 passwords vs Python zxcvbn |
| `jsonschema` | JSON Schema | PC only | data-engines | ✓ | 17 | 5433 | exact numbers and IDN formats switched on; inference no longer crashes on non-ASCII text and adds a format only when the validator accepts every example; plain messages (unknown $schema, $ref elsewhere, schema not valid at …), first 200 of N problems, formats not checked are named; reference = python-jsonschema verdicts for 5,338 pairs over five drafts, formats and patterns by hand against the RFCs / ECMA 262; junk sweep |
| `bitwise` | Bitwise Calculator | PC only | bitswebref | ✓ | 7 | 42 | rotate ≥ width wrapped, shift ≥ width, B overflow note, + / spaces, outputs paste back, unused boxes off; vs BigInt, random operands; a11y sweep |
| `ieee754` | IEEE-754 Inspector | PC only | bitswebref | ✓ | 5 | 45 | float32 ties (no double rounding) vs exact rationals; 1e-1000000 froze the page; stale result on bad input; too large / too small notes |
| `contrast` | Contrast Checker | PC only | bitswebref | ✓ | 3 | 31 | see-through colours blended; a fix for every failing pair (white/black fallback); rgb() / hsl() / names; 40 random pairs vs formula |
| `baseenc` | Base32 / Base58 / Ascii85 | PC only | bitswebref | ✓ | 10 | 99 | ≥ 8 MiB trapped the engine; Base58 froze on files; unpadded / spaced / 0x / data: input; file in Decode; vs Python base64 (147 values × 10) |
| `bindecode` | Protobuf / MsgPack / CBOR | PC only | bitswebref | ✓ | 16 | 88 | own CBOR + MessagePack readers; deep nesting broke the tab; undefined, simple, bignums, floats, 0xc1; vs cbor2 / msgpack / protobuf (480 messages) |
| `httpstatus` | HTTP Status Codes | PC only | bitswebref | ✓ | 2 | 19 | everyday words and old names find the code; nginx / Cloudflare / Laravel codes marked unofficial |
| `mime` | MIME Types | PC only | bitswebref | ✓ | 2 | 25 | exact extension first; image/jpg & co find the row; 17 more types |
| `ports` | Port Numbers | PC only | bitswebref | ✓ | 2 | 25 | exact port first; database / email / vpn / k8s find their ports; 27 more ports |
| `ascii` | ASCII Table | PC only | bitswebref | ✓ | 3 | 23 | newline / enter / ^C found; caret names; filter kept and focus not stolen by the Latin-1 switch |
| `keycode` | Key Codes | PC only | bitswebref | ✓ | 4 | 10 | keyboard trap removed (Tab, Enter / Space on buttons), browser keys left alone, AltGr |
| `gradient` | CSS Gradient | PC only | bitswebref | ✓ | 4 | 20 | transparency kept, stop goes into the widest gap, positions brought into range, only live controls enabled |
| `shadow` | CSS Box Shadow | PC only | bitswebref | ✓ | 1 | 18 | see-through colour refused with reason; presets, layer tabs, extremes |
| `svgo` | SVG Optimizer | PC only | bitswebref | ✓ | 7 | 59 | DOCTYPE files refused; Safe mode did nothing; deep nesting broke the engine; every result rendered and compared, safe fallback; .svgz / UTF-16 / Latin-1; 130 hazard drawings |
| `patch` | Patch Applier | PC only | misc | ✓ | 12 | 57 | e2e 10→24 + 42 unit; own reader/applier vs GNU patch (150 random patches); junk sweep |

## codes
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `qr` | QR Generator | PC + mobile | security-codes | ✓ | 8 | 42 | zxing-wasm 3.1.7 kept (latest); qrdata.ts: UPI amounts as typed (commas were dropped), NPCI form, RFC 5545 escaping, SMS digits, Wi-Fi/colour checks, newest text wins; zbar read-back |
| `barcode` | Barcode Generator | PC + mobile | security-codes | ✓ | 5 | 44 | zxing-wasm kept; barcodes.ts: zero padding / capitals / ITF said, check digit worded + shown, zint errors in words, typed value kept across formats; zbar + libdmtx read-back |
| `scan` | QR & Barcode Scanner | PC + mobile | security-codes | ✓ | 4 | 32 | zxing-wasm kept; second Start leaked the camera; camera errors worded; describeCode: Wi-Fi/UPI/contact/event/e-mail/SMS/tel/geo fields, .vcf/.ics, paste, Clear; junk sweep (no picture) |
| `zip` | Create Zip | PC + mobile | security-codes | ✓ | 6 | 29 | engine → 7-Zip (7z-wasm) + zip.js above 1.5 GB; non-ASCII zip passwords refused (7-Zip/WinRAR could not open them), wrong macOS note, password twice, duplicate names, Stop; 7z format |
| `unzip` | Extract Archive | PC + mobile | security-codes | ✓ | 4 | 26 | engine → 7-Zip reads everything (libarchive.js removed); password asked without re-choosing; '..' names made safe for folder saves; size guard; RAR/7z-encrypted-names/iso…; unar as RAR reference |

## everyday
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `stopwatch` | Stopwatch | PC + mobile | everyday-device | ✓ | 2 | 2 | everyday-device area 20 Nov 2026 (docs/BUGHUNT.md) |
| `countdown` | Countdown Timer | PC + mobile | everyday-device | ✓ | 8 | 14 | everyday-device area 20 Nov 2026 (docs/BUGHUNT.md) |
| `pomodoro` | Pomodoro | PC + mobile | everyday-device | ✓ | 6 | 11 | everyday-device area 20 Nov 2026 (docs/BUGHUNT.md) |
| `interval` | Interval Timer | PC + mobile | everyday-device | ✓ | 3 | 5 | everyday-device area 20 Nov 2026 (docs/BUGHUNT.md) |
| `dice` | Dice Roller | PC + mobile | everyday-device | ✓ | 2 | 2 | everyday-device area 20 Nov 2026 (docs/BUGHUNT.md); engine → libsodium.js; second look (screen reader) |
| `coin` | Coin Flip | PC + mobile | everyday-device | ✓ | 1 | 3 | everyday-device area 20 Nov 2026 (docs/BUGHUNT.md); engine → libsodium.js |
| `rng` | Random Number | PC + mobile | everyday-device | ✓ | 5 | 11 | everyday-device area 20 Nov 2026 (docs/BUGHUNT.md); announced |
| `picker` | List Picker | PC + mobile | everyday-device | ✓ | 2 | 3 | everyday-device area 20 Nov 2026 (docs/BUGHUNT.md); announced |
| `teams` | Team Splitter | PC + mobile | everyday-device | ✓ | 3 | 4 | everyday-device area 20 Nov 2026 (docs/BUGHUNT.md); announced |

## device
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `webcam` | Webcam Test | PC + mobile | everyday-device | ✓ | 4 | 4 | everyday-device area 20 Nov 2026 (docs/BUGHUNT.md) |
| `mic` | Microphone Test | PC + mobile | everyday-device | ✓ | 7 | 5 | everyday-device area 20 Nov 2026 (docs/BUGHUNT.md) |
| `speaker` | Speaker Test | PC + mobile | everyday-device | ✓ | 3 | 2 | everyday-device area 20 Nov 2026 (docs/BUGHUNT.md) |
| `keyboard` | Keyboard Test | PC only | everyday-device | ✓ | 3 | 3 | everyday-device area 20 Nov 2026 (docs/BUGHUNT.md) |
| `pixels` | Dead Pixel Test | PC + mobile | everyday-device | ✓ | 2 | 5 | everyday-device area 20 Nov 2026 (docs/BUGHUNT.md); second look |
| `touch` | Touch Test | Mobile only | everyday-device | ✓ | 1 | 1 | everyday-device area 20 Nov 2026 (docs/BUGHUNT.md) |
| `screen` | Screen Info | PC + mobile | everyday-device | ✓ | 4 | 13 | everyday-device area 20 Nov 2026 (docs/BUGHUNT.md); unit sensors.test.mjs |
| `level` | Bubble Level | Mobile only | everyday-device | ✓ | 3 | 8 | everyday-device area 20 Nov 2026 (docs/BUGHUNT.md); unit sensors.test.mjs |
| `compass` | Compass | Mobile only | everyday-device | ✓ | 5 | 14 | everyday-device area 20 Nov 2026 (docs/BUGHUNT.md); unit sensors.test.mjs |
| `soundmeter` | Sound Meter | PC + mobile | everyday-device | ✓ | 4 | 3 | everyday-device area 20 Nov 2026 (docs/BUGHUNT.md) |
| `ruler` | Ruler | PC + mobile | everyday-device | ✓ | 1 | 3 | everyday-device area 20 Nov 2026 (docs/BUGHUNT.md); second look (zoom) |

## App shell
| Part | R | B | T | Notes |
|---|---|---|---|---|
| router, tabs, home, category pages (src/main.ts) |  |  |  |  |
| search box + ranking (src/search.ts, textcore) |  |  |  |  |
| favorites |  |  |  |  |
| PC-only / Mobile-only hiding (src/platform.ts) |  |  |  |  |
| lifecycle / lazy loading |  |  |  |  |
| shared widgets (src/ui.ts), styles, dark mode |  |  |  |  |

## Bug hunt log (what was found and fixed, newest area last)

### App shell + whole-app sweep (17 Nov 2026) — `tests/e2e/shell.e2e.mjs` 17 → 63 checks, new `tests/e2e/every-tab.e2e.mjs` (7 checks over 284 tab views, 1,487 button presses)
1. A malformed %-sequence in the address (`#/%`, a cut-off link) threw "URI malformed": blank page when loaded directly.
2. Enter in an empty search box reopened the previous top match; Enter that confirms an IME composition is now ignored.
3. Slow tab → another tab → back before the first finished loading mounted the tool twice and leaked its worker.
4. A cancelled file dialog left its button busy for ever (Terminal "Upload", GST Invoice / Rent / Resume "Load details").
5. A file dropped beside a drop zone made the browser open the file in place of the app (work in the tab lost).
6. A tab whose code failed to download stayed dead until a manual reload — now a clear message + "Try again".
7. Duplicates in stored favorites were shown twice; tools hidden on this device offered a star that did nothing visible.
8. Sliders (29 tabs) had no accessible name; bare text boxes in ~30 tabs had none either (now named from their card /
   field); colour picker, matrix power, UUID / Lorem / Prettier boxes named.
9. Phone: 67 tabs had touch targets under 44 px (segmented buttons 38 px, small buttons 36 px, sliders 28 px, periodic
   table cells 40 px, preset chips 34 px, DEG 22 px) — now ≥ 44 px on touch screens.
10. An engine that finished loading after its tab was left stayed in memory until the next tab (Resume's fonts) — now
    released at once; a worker replaced under the same key stayed counted as alive.
11. **Regression made by fix 10, found and fixed the same day:** the "released at once when no tab is open" rule also
    applied inside Web Workers (a separate copy of `src/lifecycle.ts` that the router never talks to), so an engine
    loaded in a worker was dropped the moment it was created — Hash, Sodium Encrypt and Share Link stopped working on
    the deployed site between commit 277b640 and the next push. Only the page is ever "idle" now
    (`typeof document !== 'undefined'`); pinned by `tests/unit/lifecycle.test.mjs` (12 checks). Lesson: run the
    complete `node tests/e2e.mjs` before every push, not only the suites of the area being worked on.

### Software › network & security tabs (17 Nov 2026) — cidr, chmod, x509, sshkey, hmac, pwhash, apikey, curl, totp, pwstrength
Method: an independent reviewer's report (22 written findings) + its probe scripts re-run on the fixed build + own review.
Every fix is pinned by a test against an independent reference (real `curl`, GNU `chmod`, OpenSSL, Python `ipaddress` /
`cryptography` / `hashlib` / `argon2-cffi` / `zxcvbn`, Node `crypto`, RFC vectors). 51 bugs, 592 new checks.
- **cURL Converter (12):** `$'…'` escapes (`\uXXXX`, `\xHH`, octal) from Chrome/Firefox "Copy as cURL" were not decoded;
  Chrome's "Copy as cURL (cmd)" (carets) gave garbage; short options with an attached value (`-XPOST`, `-uuser:pw`,
  `-sSLk`) were dropped; an unknown option, a pipe or a redirect replaced the URL; `-d @file` sent the text "@file";
  JSON bodies were re-serialised (bytes changed, big numbers lost); `-I`, `-T`, `--oauth2-bearer` ignored; URLs without a
  scheme; `-F` forms missing from Go / raw HTTP; repeated headers collapsed; Python output a syntax error for some
  bodies; `-u` with non-ASCII. Parser rewritten in `src/lib/curl.ts` (TypeScript for now — no tested WebAssembly curl
  parser exists; on the to-do sweep). 35 commands are run through real curl against a local server and compared with
  the generated Node / Python (and 10 Go) programs.
- **Password Strength (6):** the estimator stopped at 2^64 ("10^19.3 guesses", "57 years" for every long password);
  four bugs in the zxcvbn crate, fixed by `wasm/zxcvbn/zxcvbn-fixes.patch`: ALL-CAPS words with a digit = "2 guesses"
  (TRUSTNO1), a repeat + one character counted as a "sequence" (aaaaaaab), a single character counted as a l33t
  dictionary word ("1" = a film title), keyboard walks 13 % too low per turn (average degree divided in integers);
  the breakdown printed the password's pieces in clear while the box was hidden (now dots until "Show").
- **Certificate Decoder (10):** P-521 shown as 528-bit, DSA 2048 as 2088-bit, RSA-PSS as "rsassa-pss 2160-bit"; DSA /
  PSS / SHA-3 signature names missing; "expires in 0 days" five hours before expiry, "EXPIRED 1 day ago" after two hours
  (now minutes / hours / days / years, "no expiry date" for 31 Dec 9999); PEM files with a BOM, in UTF-16 (PowerShell),
  indented (YAML), quoted, with a Latin-1 preamble or stored with literal `\n` (JSON / .env) were refused; `.p7b`
  bundles said "not a certificate" (the certificates inside are now shown); an empty file said nothing; lone public
  keys are decoded (type, size, pin).
- **TOTP (6):** `otpauth://hotp` links shown as time-based codes; 10-digit codes wrong one time in three (32-bit
  overflow); `period=0` / `digits=abc` gave "NaN digits" and kept the previous link's code on screen; upper-case links
  refused; secrets of a length authenticator apps accept (or with a zero-width space from copy-paste) refused; "Copy
  code" copied "———".
- **HMAC (4):** a 40 MB file froze the page for 11 s (now streamed in 4 MB pieces through a new chunked engine call —
  48 MB in under 1 s, longest stall < 0.2 s); signatures written as Stripe's `t=…,v1=…`, `v1=`, with colons, `0x`,
  quotes or padded Base64url did not match; a one-character Base64 key showed the browser's raw `atob` error; hex keys
  with `0x` / colons refused.
- **chmod (3):** the "Symbolic command" left out setuid / setgid / sticky; valid chmod syntax was refused (`g=u`, `X`,
  `u+r-w`); `+w` without u/g/o silently differs from the real chmod (umask) — now explained. New "folder" switch
  (X, "=" keeping setuid/setgid, ls -l letter).
- **Password Hash (3):** a `$pbkdf2-sha1$` hash said "No match" for the right password and every verification error was
  "No match"; scrypt `log2(N)` 16384 wrapped to 0 (a hash with no work factor), 0 iterations / decimals accepted;
  hashes needing 4 GiB or bcrypt cost 31 crashed or froze the engine.
- **Subnet / CIDR (3):** the range printed in the result title (en dash) could not be pasted back; an IPv6 range
  without spaces was refused; the split choice stayed active for ranges. Also new: wildcard masks, `%zone`, `[…]`,
  "a to b", more special-purpose blocks named.
- **SSH Key (2):** "Inspect a key" refused private keys not wrapped at exactly 70 columns, and ECDSA keys; a pasted
  list of keys showed only the first. Now Ed25519 / RSA / ECDSA / DSA, encrypted keys, authorized_keys and
  known_hosts lines, MD5 fingerprints.
- **API Key (2):** every keystroke in the prefix box threw the keys away and made new ones; the "Random bytes" slider
  looked active but did nothing for the GitHub style.
- Test runner: `node tests/e2e.mjs a b c` and `node tests/unit.mjs a b` now take several filters.

### Software › misc tabs (17 Nov 2026) — cron, semver, glob, patch, hexview, escape, unicode, logview, sla, transfer, mermaid
Method: the earlier reviewer's probe scripts (left on disk; no report had been written) re-run by hand + own code review,
then bulk comparison with references: npm's `semver` package, Python `glob.translate`, GNU `diff` + `patch`, a
minute-by-minute cron search. 59 bugs, 350 new checks. Three engines were replaced by our own Rust (STANDING RULE #1,
tier 2 — the crates in use were wrong for the job; nothing moved to JavaScript):
- **Semver (7):** the nodejs-semver crate is not npm's semver: `>1.2.3 <1.2.3` matched everything, `1.2.3 1.2.4`
  matched both, "include pre-releases" behaved differently, `^01.2.3` / `x.2.3` / `1.2.3 - ` were accepted, bumps kept
  build metadata, 9007199254740991.0.0 was refused. Now `wasm/devcore/src/semver_npm.rs`: a port of the package's
  range, comparator, version and inc logic using its own regular expressions (`semver_re.rs`, generated by
  `scripts/make-semver-re.mjs`) on the `regex-lite` crate; 16,380 version × range pairs, validRange, minVersion,
  max/minSatisfying, sort and 1,617 bumps equal the package (which stays a dev dependency for the tests only).
- **Patch Applier (10):** the diffy crate refused patches as people have them — `git show` / `format-patch` output,
  a diffstat, SVN headers, a ```diff fence, blank lines before the hunk, renames, CRLF files, removed lines starting
  with `-- `, text pasted without its final newline, trailing spaces; "0 hunks applied" for text that only mentions
  @@; only the first file of a multi-file diff; a bare "does not apply" for an already-applied patch. Own reader /
  applier (`patchm` in misc.rs): body read by the @@ counts, offsets, white-space tolerance, fuzz ≤ 2, notes.
- **Glob Tester (2):** globset matches bytes: `?.txt` did not match `न.txt` / `é.txt` / `😀.txt`, `[éa]` and `[!x]`
  failed on non-ASCII, case-insensitive only folded ASCII. Own matcher (`globm`), table-driven (no exponential
  patterns), equal to Python 3.13 `glob.translate` on 420 patterns × 46 paths.
- **Cron (3):** schedules that never occur (30 February, 31 April) searched to the year 5000: 1–5 s freeze and an
  empty table; a schedule inside the DST gap took 11 s for 25 runs (an `Intl.DateTimeFormat` was built per offset
  lookup — 180,000 of them; now one per zone + a quarter-hour cache); the "every 30 s" example was every 30 minutes.
- **Unicode Inspector (8):** emoji with joiners (👨‍👩‍👧), Persian ZWNJ and Devanagari ZWJ were "suspicious" and "Remove
  invisible" broke them; hidden "tag" characters (ASCII smuggling) passed as clean; ordinary Russian / Greek text got
  10 "look-alike" warnings and "Replace look-alikes" turned it into Latin letters; fullwidth / mathematical letters
  not flagged; curly quotes and dashes counted as suspicious; Sinhala, Khmer, Tibetan… showed no script; the table
  stopped at 2,000 rows without saying so.
- **String Escape (8):** JSON unescape failed on `""`, `\\"` and real tabs; shell unescape on `\"` inside double
  quotes; HTML unescape knew 24 entity names (and an invented `&rupee;`); C output used `\u0007` (invalid C) and
  `\0` before a digit; `\U0001F44D`, `$'…'`, backslash-newline and SQL with a trailing newline were not handled.
- **Log Viewer (7):** level words inside the message counted ("user info updated" → INFO, "/api/errors" → ERROR);
  coloured (ANSI) lines, logcat, klog, syslog `<priority>` and nested JSON levels were not recognised; stack-trace
  lines were OTHER (lost with "errors only"); the filter ignored the readable form of JSON lines; "Hide matches" with
  an empty filter hid everything.
- **Hex Viewer (5):** the match line of the previous file stayed after opening another; "12abc" / "1e3" were accepted
  as offsets; text starting with "BM" / "MZ" was a BMP image / Windows program; Enter did nothing. New: marked rows,
  "Next match", ignore case, more file types.
- **SLA (3) / Data Transfer (4):** "2 h 23 min 60 s", "1 min 60 s", "60 s"; one second a year = "100 %"; tiny results
  "0 s" / "0 MB/s" / "0 GB"; "Infinity d"; an empty size counted as 0. **Mermaid (2):** a wide diagram exported as a
  1020 × 3 px PNG; an empty box showed Mermaid's internal message.
- Test runner: a suite that fails in the parallel e2e run is re-run once alone (media / timing suites are sensitive
  to 8 browsers on 4 cores); it counts as failed only if it fails both times.

### Software › bits, reference and web-design tabs (17 Nov 2026) — bitwise, ieee754, baseenc, bindecode, httpstatus, mime, ports, ascii, keycode, contrast, gradient, shadow, svgo
Method: the earlier reviewer's probe scripts re-run one by one + own code review, then bulk comparison with
references: BigInt, exact rational rounding (Python `fractions`), Python `base64`, `cbor2`, `msgpack`,
`google.protobuf`, the WCAG formula, a browser raster of every optimised SVG. 63 bugs, 500 new checks (e2e for the 13
tabs 170 → 504; unit +165: devcore 266 → 348, new `svgo.test.mjs` 32 and `bitsweb.test.mjs` 51).
- **SVG Optimizer (7)** — the most serious group. (1) Any file with a `<!DOCTYPE …>` line (most Inkscape, Illustrator,
  Graphviz and matplotlib exports) was refused: "XML with DTD detected". Now read, including entities declared in the
  DOCTYPE. (2) "Safe mode" changed nothing: OXVG's own `Jobs::safe()` still inlines styles, collapses groups and
  rewrites paths. Safe mode is now our own short list (drop DOCTYPE / XML declaration / comments / metadata / editor
  data, tidy attributes, shorten colours, sort attributes). (3) The full optimisation changes how some drawings look
  (group opacity collapsed onto children, CSS selectors that depend on the structure, SMIL-revealed elements, tiny
  viewBoxes, zero-length round caps — 13 of 130 hazard drawings). **Every result is now rendered next to its original
  and compared** (`sv_diff` in svgo.wasm: 3 × 3 neighbourhood match, so anti-aliasing counts as nothing; thresholds
  calibrated on 630 real icons); if it differs, the safe result is used and the card says so. (4) 500 nested groups
  overflowed the wasm stack and left the engine broken until the tab was reopened → refused above 256 levels, and a
  trapped instance is replaced. (5) UTF-16, Latin-1 and .svgz files were read as UTF-8. (6) XML that is not SVG gave
  an empty "result". (7) A result could be larger than the original (re-printed CSS) → the original is kept.
  No unit suite existed for svgo.wasm; `tests/fixtures/svg/hazards.json` (130 drawings) now drives unit + e2e.
- **Protobuf / MsgPack / CBOR (15):** the CBOR and MessagePack readers are now our own Rust (`wasm/devcore/src/bin.rs`;
  ciborium and rmpv dropped): `undefined` was shown as `null`, simple values and bignums over 16 bytes were refused,
  MessagePack's unused byte 0xc1 read as nil, 1.0 printed as `1`, 1e300 as 301 digits, `inf`, errors as Rust debug
  text (`Semantic(None, "invalid type: …")`). Protobuf: 5,000 nested messages or 100 KB of `#` (open groups) overflowed
  the stack — "memory access out of bounds", then every later decode failed → nesting limit 100, bytes shown beyond
  it. A nested message whose bytes are also text was shown as the text; every odd varint carried a "sint" comment
  (now a switch); field numbers above 2^29 − 1 accepted; DEL / C1 characters printed raw. UI: the values before a bad
  byte are shown with the reason; hex as C arrays / `\x` escapes / single digits; a chosen file survived no input
  switch. Checked against cbor2, msgpack and google.protobuf on 480 random messages, RFC 8949 Appendix A (all 81).
- **Base32 / Base58 / Ascii85 (9):** files of 8 MiB and more trapped the engine ("unreachable": data-encoding asserts
  `len <= usize::MAX / 512` on 32-bit targets) → encoded and decoded in pieces. Base58 of a 60 KB file froze the page
  for 10 s (quadratic) → limited to 10,000 bytes with the reason. Decoding refused what people paste: Base32 without
  padding (every TOTP secret), spaced groups, `0x66, 0x6f`, `66:6f`, data: URLs. A file chosen in Decode mode was
  decoded as the text "(file: …)". Long results are shown cut, Copy / Download give all. 147 values × 10 encodings
  equal Python's base64 module and spec implementations of Base58 / Crockford.
- **IEEE-754 (5):** float32 was rounded through a double first, which lands on the wrong float for decimals on or
  next to a tie (`1.0000000596046447753906251` → 3F800000 instead of 3F800001; 20 such cases in the fixture) → exact
  BigInt comparison of the neighbours. `1e-1000000` froze the page (million-digit BigInt). A non-number left the
  previous result on screen. Overflow to Infinity / underflow to 0 were not explained.
- **Bitwise (6):** rotating by the width or more did nothing (ROL 9 in 8 bits), a fractional count threw, B outside
  the width gave no note, `+5` and `0b1100 1010` were refused while the Binary row printed exactly that form, NOT and
  shifts needed a valid B, an empty count meant 0.
- **Contrast (3):** `#00000080` on white read 21 : 1 (alpha dropped) → blended as it appears; saturated colours got no
  fix suggestion although white or black passes; rgb() / hsl() / names were refused.
- **Gradient (4) / Shadow (1):** transparency in a typed colour was dropped silently; 150 % stayed in the box; every
  added stop was the same colour at 100 %; the angle slider was live for radial gradients.
- **Key Codes (4):** the tab was a keyboard trap — Tab never left it, Enter / Space on a focused button were
  recorded instead of pressing it, F5 / Ctrl+R / Ctrl+L were blocked. AltGr showed as Ctrl + Alt.
- **Reference tables (9):** searches by everyday words found nothing ("email", "database", "k8s", "newline", "enter",
  "unauthorised", "payload", `image/jpg`); the exact port / extension / character was not first ("80" listed 1080
  before… ); the ASCII filter was lost and the focus stolen by the Latin-1 switch; nginx / Cloudflare codes,
  27 ports and 17 file types added.

### Software › JSON, text-format and small developer tabs (17 Nov 2026) — json, regex, base64, urlenc, epoch, uuid, color, jwt, xml, json2types, jsondiff, mockdata, mdtable
Method: the earlier reviewer's probe scripts re-run + own code review, then comparison with independent
implementations: `JSON.parse` / `JSON.stringify`, Python (`base64`, `urllib.parse`, `datetime` + `zoneinfo`, `uuid`,
`colorsys`, PyJWT, lxml), Node's WHATWG `URL`, Chrome's own CSS and XML parsers, cmark-gfm, SQLite, and the real
compilers (tsc, go, rustc, javac, python) for generated code. 91 bugs, 632 new checks (e2e for the 13 tabs 166 → 481;
new unit suite `devdata.test.mjs` 309; reference data `tests/fixtures/devdata/reference.json`,
`scripts/make-devdata-reference.py`).
Four engines were written in Rust for this (STANDING RULE #1) — `wasm/devcore/src/jsonfmt.rs`, `jsondiff.rs`,
`xmlfmt.rs`, `j2t.rs` — because the JavaScript they replace could not be made correct:
- **JSON Formatter (7):** `JSON.parse` → `JSON.stringify` is not a formatter: it moved keys such as "10" and "2" to the
  front of their object, dropped duplicate keys, and rewrote numbers (1.0 → 1, 1e5 → 100000, 12345678901234567890 →
  12345678901234567000). The new formatter changes white space only, points out duplicate keys, says what is wrong in
  words with line and column ("Trailing comma before }", "Keys must be in double quotes", "JSON has no undefined")
  and selects the spot; the old result no longer stays under an error; Minify stays on while typing; a BOM is skipped;
  600 nested brackets give a message. It accepts exactly what `JSON.parse` accepts (1,200 mutated documents).
- **JSON Diff (5):** lists were compared index by index — removing the first of 1,000 elements showed 1,000 changes.
  Lists are now aligned by equal elements (longest common subsequence) and, between those, records by their `id`.
  Numbers are compared by value (1 = 1.0 = 1e0) and never rounded (two 20-digit ids that differ in the last digit
  were "equal"); duplicate keys are reported; an empty side is named; the table carries both values as written.
  400 random pairs: the patch applied by two independent appliers gives the right document.
- **XML Formatter (9):** re-serialising the browser's DOM lost the XML declaration and DOCTYPE, expanded entities
  (`&w;`, `&#169;`), turned `&#10;` in an attribute into a real line break, and — worst — trimmed text: a lone space,
  a no-break space or "  padded  " disappeared, and sentences with inline elements were broken over lines. The new
  formatter re-indents only elements whose children are all elements; everything else is byte-for-byte as typed.
  74 documents: Chrome's parser sees the same document before and after. Also: a document containing an element
  named `<parsererror>` was reported as broken; `xml:lang` in XPath was "unresolvable"; a default namespace made
  every XPath return nothing without a word (now explained, prefix `d:` bound); ISO-8859-1 and UTF-16 files were
  read as UTF-8 (é → �) — now decoded as declared, and the download's declaration is corrected to UTF-8.
- **JSON → Types (10):** the output is now compiled by the real tools for 36 awkward samples. Before: a top-level list
  became an invented `{ value: … }` wrapper the sample did not fit; `user_id` and `userId` gave two fields with one
  name (Go, Rust, Java, Python: does not compile); reserved words (`class`, `type`, `self`, `yield`) were used as
  names; a key `list` / `string` / `option` produced types that shadow `List`, `String`, `Option`; Java had several
  `public record`s in one file; Python put fields with defaults before fields without and renamed keys so
  `Order(**data)` failed; Go tags were written for keys encoding/json cannot tag (comma, quote, combining marks —
  the field silently never matched); 18446744073709551615 was typed `int64`; "statuses" → `Statuse`. All fixed;
  Go and Rust round-trip every sample; what cannot be expressed is said in a note.
- **Regex Tester (4):** a pattern that backtracks without end (`(a+)+$`) froze the tab for good — matching now runs in
  a worker that is ended after 2 s with an explanation. Wrong flags are named ("Flag g is given twice"), named groups
  label their columns, counting stops at a million.
- **Base64 (8):** refused what people paste (data: URLs, `%3D`, extra padding, zero-width characters); a binary
  result gave "not valid Base64"; the status of a previous file stayed; "Base64 → download" decoded the plain text
  when the tab was in Encode; a 30 MB file took 21 s and put 42 MB into a text box (now 4 s, the box shows the first
  200,000 characters, Copy / Download give all). Now on devcore-enc; decoded files are recognised (PNG, PDF, ZIP …).
- **URL Encoder (7):** Decode turned every `+` into a space (`mailto:user+tag@…`, `tel:+91…`, `/c++/`); malformed
  input put "⚠ URI malformed" into the result; "Encode full URL" encoded `%20` again (`%2520`), the brackets of an
  IPv6 host and non-Latin host names (now Punycode — equal to Node's URL parser); the parts table was built from the
  decoded text, so `a=%26%3D` became three broken parameters; half a surrogate pair threw.
- **Epoch (6):** microseconds and nanoseconds were read as milliseconds (year 55,000), `1,700,000,000` and ISO dates
  were refused, the picker never followed the box and clearing it wrote "NaN". Now the unit is found from the number
  of digits (and can be chosen), 19-digit nanoseconds lose nothing, dd/mm/yyyy is read day first. 120 instants and
  40 local dates equal Python's in Asia/Kolkata, America/St_Johns and Pacific/Chatham.
- **UUID (5):** version-7 UUIDs made in the same millisecond came out in random order — the point of v7 is that they
  sort. `u_uuid` in crypto.wasm now follows RFC 9562 §6.2 method 2 (20,000 in one millisecond strictly increasing,
  clock steps back tolerated). Uppercase / Hyphens made new UUIDs instead of rewriting the shown ones; the inspector
  refused `{…}` and `urn:uuid:`, called the nil UUID "v0", and showed no time for v1 / v6.
- **Color Converter (7):** an 8-digit hex lost its alpha; `rgb(100% 0% 0%)`, `rgb(1e2, …)`, `hsl(0.5turn …)` and
  `oklch(0.628 …)` were misread by a "take the first three numbers" reader; a colour outside sRGB showed
  `rgb(-1065, 214, -288)`; nothing marked a wrong entry; whole-number HSL / OKLCH did not give the same colour back.
  Now a real CSS colour reader (`src/lib/color.ts`), CSS Color 4 gamut mapping in mathcore, and texts precise enough
  that **all 16,777,216 colours** round-trip; Chrome's CSS engine paints every printed text as the same colour.
- **JWT (7):** "Bearer …" and wrapped tokens were refused; a `null` payload crashed; 20-digit claims were rounded;
  encrypted tokens (JWE) gave "not a valid JWT"; `exp` as a string or in milliseconds was ignored; `alg: none` was not
  flagged; times had no UTC or relative form.
- **Mock Data (10):** whole-number ranges wider than 32 bits gave one value; `from` > `to`, text in a number box and
  dates such as 16/11/2026 produced NaN / null or threw "Invalid time value"; a non-integer id start counted 1.5,
  2.5 …; decimals over a wide range were multiples of 1,000; two fields with one name or a field called `__proto__`
  lost a column; SQL names with spaces or reserved words were not quoted; a word count of 3,000,000 froze the tab.
- **Markdown Table (6):** any tab character forced tab-separated reading (a tab inside a quoted CSV cell broke the
  rows); a line break in a cell vanished from the editor; a table pasted with text around it took the following
  lines as rows; CJK and emoji cells were padded as one column wide; 3,000 rows made every keystroke slow.

### Software › data-engine tabs (17–19 Nov 2026) — jq, yaml, jsonschema, python, sqlite, sqlfmt, prettier, graphviz done
Method for these: the engine's native counterpart or an independent implementation is the reference, in bulk.
- **jq** (16 bugs; unit 35 → 4,957, e2e 23 → 52). Reference: the native jq 1.8.2 command line, built from the same
  tarball — stdout, stderr and exit status for 4,903 filter × option × input cases (`tests/fixtures/jq/reference.json`).
  A filter that never ends froze the tab and left a broken engine (now a worker: 10-second limit, Stop, output stop at
  16 MB, a fresh engine after running out of memory); `-r -a` printed raw UTF-8; the exit status stuck at 5; halt did
  not stop later inputs; `input_filename` / `input_line_number` / `debug` / `stderr` / `$JQ_BUILD_CONFIGURATION` did
  not work; messages lacked the input position; the command line shown did not give the same output with -c + Tab
  indent; long output froze the box; memory ceiling 1 GB → 2 GB and given back after a huge run.
- **yaml** (21 bugs; unit 20 → 1,922, e2e 19 → 50). References: PyYAML (YAML 1.1), ruamel.yaml (YAML 1.2) and tomllib
  read all 1,750 outputs as the data that went in; 393 texts written by those libraries, tomli_w, toml and real files
  are read correctly. Numbers were pushed through 64-bit floats (JSON → JSON lossy, JSON → TOML rounded silently, YAML
  integers beyond 64 bits an error); JSON → YAML left `no`, `y`, `1_000`, `1:30`, `2026-01-01` unquoted; .inf / .nan
  were refused or silently became null; TOML → TOML turned dates into strings; TOML output was badly laid out; keys
  written twice vanished silently; Swap could wipe the input.
- **jsonschema** (14 bugs; unit 12 → 5,413, e2e 9 → 39). Reference: python-jsonschema's verdicts for 5,338 schema /
  data pairs over Draft 4, 6, 7, 2019-09 and 2020-12; formats and patterns checked by hand against the RFCs and
  ECMA 262. "Make a schema" crashed on some non-ASCII text and wrote formats its own example failed; numbers were
  compared as floats; idn-email / idn-hostname were never checked; "200 problems" when there were more; jargon
  messages (unknown `$schema`, `$ref` elsewhere); the shared JSON reader said "nothing is open here" for `"b": }`.
- **python** (18 bugs; unit 17 → 201 + 61 for the new output model, e2e 20 → 88). Reference: **native CPython 3.14.8**
  (the build's own build-Python) — 69 programs must print the same stdout and stderr, byte for byte
  (`tests/fixtures/python/reference.json`); local time against the zone files inside the build (51 zones × 575
  moments); a second, cell-by-cell terminal for the output model (3,000 random streams).
  Engine: recursion through C code (`__repr__`, `__eq__`, json, pickle, sorted(key=…), lru_cache — 11 ways) killed
  the run with the browser's "Maximum call stack size exceeded" → a guard that ends in RecursionError; a cached
  recursive function stopped at 241 levels → lru_cache is the Python wrapper, recursion limit 2000; local time was
  UTC → the browser's zone, with tzdata's names and daylight flags; `import socket` failed and with it asyncio and
  twenty other modules → stand-in + an event loop without sockets; help("if") and shelve were missing;
  hashlib.pbkdf2_hmac did not exist; open("file.csv/x") said "No such file" instead of "Not a directory".
  Page: 300,000 printed lines froze the tab for 92 s (now 1.4 s; only the end stays on screen, Copy / Save give all);
  text printed before a long computation appeared only afterwards; \r progress lines, \b spinners and colour codes
  were shown raw; the answer to input() was not shown, so prompt and output ran together; the 32 MB note never
  appeared; after one failed download Python could not be loaded until the page was reloaded; a data file called
  main.py was silently replaced by the program; Ctrl+Z did not undo an inserted Tab. New: hints under the status
  (missing package, module that cannot work here, input ran out, memory, threads, nesting depth), Save output,
  "All as .zip", Enter keeps the indentation.
  Left as it is: sqlite3, bz2, lzma, ssl, ctypes, tkinter / turtle are not in the build (each has a hint).

### WebAssembly audit of the first 51 tabs (owner, 18 Nov 2026) — `docs/WASM-AUDIT.md`
Could an existing, tried-and-tested WebAssembly module replace one we wrote, while meeting every requirement of the
tab? Candidates were searched on the npm registry (with download counts) and the serious ones run against our own
reference cases.
- **Replaced: `hmac`** — our Rust glue in keys.wasm → **hash-wasm 4.13.0** (MIT, 10.8 M downloads a month). Suites
  re-run: new `tests/unit/hmac.test.mjs` (48: RFC 2104 / 2202 / 4231 vectors, 6,272 combinations against OpenSSL,
  1 MB in pieces of 1 MB … 1 byte), keys 174, e2e hmac / totp / pwhash / sshkey / apikey, lazy, shell, no-external.
- **Kept, with the failed requirement written down:** jq (jq-wasm: local time fails, endless filters cannot be
  stopped), python (Pyodide: 9 of 50 reference programs differ, fatal stack overflow), xml (libxml2 rewrites what
  the tab must leave as typed), json (dprint accepts what is not JSON; no minify / sort / duplicate keys), svgo,
  pwstrength, pwhash (hash-wasm has no PHC strings for scrypt / PBKDF2), yaml, and the modules for which no
  WebAssembly package exists at all (semver, cron, CIDR, X.509, glob, patch, encodings, binary decoders, JSON diff,
  JSON → types, JSON Schema, UUIDs, colour maths).
- **Open choice for the owner:** Mermaid → Merman (Rust port, five months old, ~19 MB) — recommendation: not yet.
- **Found on the way:** our jq build shows local time as UTC → to fix.
- From the 52nd tab on, each tab's entry in `docs/WASM-AUDIT.md` is written before its bug hunt (owner's order of work).
- **jq, local time (found by the audit; 1 bug, +909 checks):** `localtime` and `strflocaltime` answered in UTC for
  everybody (wasi-libc has no time zones; the reference had been made with TZ=UTC, which hid it). Now the browser's
  zone, through the host (`wasm/jq/hosttz.c`, `tzInfoImport`), with tzdata's abbreviations and `%z`; `%Z` of UTC
  conversions is "GMT" as the command line prints. Reference: native jq 1.8.2 with TZ=<zone>, 891 cases in 27 zones
  (unit) and four browser time zones (e2e). The shared host code now resolves wall-clock readings as glibc's mktime
  does (a reading that does not exist lands after the gap; an explicit daylight flag picks the other side) — this
  also corrected Python's `time.mktime` on such nights (13 new zone runs against native CPython 3.14.8).
- **sqlite** (22 bugs; unit 0 → 106, e2e 14 → 63). Reference: the **native SQLite** (Python's sqlite3) — 160
  statements with the type of every value, the reported changes and every error text; in the browser, 12 queries
  (900+ cells) and the 3,000-row CSV / JSON against it, and the downloaded database read back by it.
  Values: integers beyond 2^53 were rounded, 1.0 was shown as 1, an empty blob as NULL, blobs as "[object …]".
  Scripts: statements were cut by our own splitter (a trigger body broke it) → SQLite's own parser; errors said only
  "Statement 2" → line and column; "rows changed" included trigger changes and showed the previous statement's count
  for a change that matched nothing; a statement that never ended froze the tab for good → time limit.
  Files: a write-ahead-log database could not be opened; a file that was not a database closed the one that was open
  and left a raw toast → checked first, reason in the status line; replacing a database could not be undone (and
  the first version of the undo button vanished with the next Run); the download was always "database.sqlite" and
  said nothing about an open transaction; an open transaction went unnoticed.
  Imports: leading zeros lost (PIN codes, phone numbers), 19-digit ids rounded, 1e20 in a REAL column wrapped round
  to an unrelated integer (the binding sends whole-valued numbers as 64-bit integers), "0x1F" read as 31, repeated
  or empty column names failed, non-ASCII table names became "_", only the first sheet of a workbook was read.
  Exports: CSV / JSON held only the 2,000 rows on screen, numbers went through JavaScript's.
  Tables panel: storage tables of full-text tables listed as tables, one unreadable object (fts4, a broken view)
  emptied the whole list, names with quotes could not be shown; a console warning for every failed statement.
- **sqlfmt** (24 bugs; unit 2 → 113, e2e 14 → 49). The engine was the `sqlformat` crate; it is now **our own
  formatter** (`wasm/devcore/src/sqlfmt.rs`; why: `docs/WASM-AUDIT.md` tab 53). References: an independent reader of
  SQL in the unit suite, the SQLite engine (rows, column names, errors, database), and in the e2e suite the
  **native SQLite**, **sqlglot** and **sqlparse** reading what the tab shows for a 141-statement, five-dialect corpus.
  Meaning changed by the old engine: (1) in one-line mode the rest of a statement landed inside a `--` / `#` comment;
  (2) `[bracket names]` were broken up and upper-cased; (3) `0x1F`, (4) `1_000` and (5) `1E+2` were split; (6) `'\'`
  was read as unfinished, corrupting the strings after it; (7) dollar-quoted text was reformatted; (8) `@@variables`
  and (9) `#temp` names / PostgreSQL `#>` were split or taken for comments; (10) nested comments ended early;
  (11) 45 of 155 everyday column names were upper-cased (status, type, key, level, date, end …), which changes the
  column names a query returns; (12) a third of the results changed again when formatted again.
  Layout: (13) `CREATE` / `OR REPLACE` on two lines; (14) GRANT laid out as a query (`GRANT` / `SELECT` / `,` /
  `INSERT`); (15) `NATURAL` / `JOIN` split; (16) `array [ 1,` / `2 ]`; (17) a comma after a comment alone on a line;
  (18) the last line of a CTE glued to its bracket; (19) window frames broken at their AND, their words not
  upper-cased; (20) every block comment forced onto a line of its own (`a` / `/* x */` / `= 1`); (21) the statements
  of a trigger or procedure not indented and separated like top-level ones; (22) a stray blank before each statement
  in one-line mode.
  The tab: (23) "UPPER-CASE keywords" switched off forced lower case — there was no way to keep keywords as typed →
  UPPER / lower / as typed; (24) one reading for every dialect (MySQL's backslashes, SQL Server's brackets,
  PostgreSQL's `$$`) → a dialect choice with detection, and warnings for text or brackets that never close.
  Found by the new suites in the new engine before it shipped: a comment from a later line ran into a `--` comment
  in one-line mode (caught by the guard, which returned the input); a comment at the very start lost its line;
  `go delete`, a BEGIN after a complete statement, FETCH FIRST / START WITH / FOR UPDATE at the start of a line and
  MySQL's `USE INDEX` were not stable or taken for statements; 20,000 open brackets asked for 400 MB (indentation is
  capped at 50 levels); the copy icon of the output box gave only what the box shows (`outputBox({ text })`).
- **prettier** — Code Formatter (13 bugs; unit 0 → 205, e2e 8 → 85). **Engines changed** (STANDING RULE #1,
  `docs/WASM-AUDIT.md` tab 54): Prettier (JavaScript) for everything → Biome's official WebAssembly build (JS / JSX,
  TS / TSX, CSS, SCSS, YAML, GraphQL), `@dprint/json` (JSON), `dprint-plugin-markup` with Biome behind it (HTML, Vue);
  Prettier stays for Markdown and as the fallback. References: parsers that belong to none of the formatters
  (`tests/lib/codefmt-check.mjs` — TypeScript 5.9's parser, PostCSS, eemeli's yaml, marked and cmark-gfm, parse5,
  graphql-js, the Vue compiler; JSON by its tokens), on 140 hazard sections × 8 option sets and on real files
  (2,700 during the choice; 230 of this repository in the unit suite); the e2e suite reads what the tab shows the
  same way and compares it with the engines run in Node.
  What the tab did wrong: (1) choosing another language **threw away the text that had been typed** (it was
  replaced by a sample); (2) with "Format as you type" a slow answer for an older text could overwrite the answer
  for the newer one; (3) Markdown: the code inside a ```` ```markdown ```` fence was rewritten (somebody's example);
  (4) Vue: a `<script lang="ts">` was silently left unformatted (its parser was never loaded); (5) Vue with
  "Semicolons" off: `@click="a = 1; b()"` became `a = 1⏎ b()`, which Vue cannot compile; (6) JSON: numbers were
  respelled (`1.50` → `1.5`, `1E+10` → `1e10`, `1e-07` → `1e-7`); (7) formatting ran on the page itself — a large
  file froze the tab (now a worker); (8) after another language was chosen the download kept the opened file's name
  (`style.css` for SCSS); (9) Copy and Download with nothing formatted copied / saved an empty text; (10) a file
  without an extension was refused as ".Makefile files are not supported"; (11) `.jsonc`, `.json5`, `.mts`, `.cts`,
  `.d.ts` texts, `.graphqls` were not accepted; (12) an empty box was "Already formatted"; (13) a parser's message
  lost its line breaks (the code frame ran together in one line).
  Found in the candidates while choosing (none of it ships): dprint's TypeScript plugin prints
  `for (var i = (0 in []); ;)` without its brackets and adds braces; its YAML plugin drops blank lines of a `|+`
  scalar and regroups tagged values; its Markdown plugin empties code blocks of blank lines and indentation;
  Biome's Markdown formatter makes tight lists loose, its HTML and Vue formatters add white space that shows.
  Found by the new suites in our own glue before it shipped: the markup plugin could not take its wrapper off a
  long slot pattern (`let { … } =⏎ 0` ended up in the attribute); a handler of several statements was laid out over
  lines; `s == &quot;a&quot;` tripped the letters guard; a declaration file (`const x: T;`) was refused; the place
  in a refusal was counted in the prepared text, not the typed one; a fragment pasted on one line came back on one
  line (`rootBreaks`).
  Known and recorded, not fixed (they sit in Prettier, the fallback): `--x: {a:b}` gets a `;`; two Markdown
  constructions (a list followed by a line holding one space; tabs in a list's code block).
- **graphviz** — Graphviz (DOT) (22 bugs; unit 32 → 686, e2e 23 → 81). **Engine:** the existing-module check came
  first (`docs/WASM-AUDIT.md` tab 55): Viz.js and @hpcc-js/wasm-graphviz both trap on valid graphs, so the tab keeps
  a build of our own — now **Graphviz 16.1.0** (was 14.1.2) from the official release with two patches and four
  additions. Reference of the suites: the **native `dot`** built from the same source
  (`scripts/make-graphviz-reference.mjs`: 240 graph files of the Graphviz sources + 200 hazard graphs × 8 engines =
  3,464 drawings); the triangulation against the Delaunator package and exact arithmetic; `rand()` against glibc;
  prism against geometry; in the browser, boxes against the browser's own measurement of their labels.
  What was wrong: (1) **a label whose first line is empty could crash the engine** (`label="\nx"`, a record field
  `{\n a|…}`; Graphviz's own `record_dot.gv`) — an upstream fault (an uninitialised text span), repaired by a one-line
  patch; (2) **the same text was not drawn the same way twice**: one instance of the engine was reused and Graphviz
  counts on across graphs (ids of gradients and link anchors) — now a fresh instance per drawing; (3) **sfdp said
  "Error: remove_overlap: Graphviz not built with triangulation library" on every drawing** and left nodes
  overlapping, `overlap=prism` was refused, `overlap=false` fell back to the Voronoi method, `smoothing=triangle|rng`
  did not exist — the triangulation Graphviz takes from GTS is now our C port of Delaunator; (4) **labels outside
  Graphviz's font tables were measured by guess** (Devanagari, CJK, Arabic, emoji, any font it does not know): text
  ran out of its node or the node was far too wide, and the warnings about it were hidden — the browser measures now;
  (5) drawings differed from the dot program's (dot on 9 of 457 graph files, neato on 4, sfdp on 358) because the C
  library's `qsort` and `rand` are not glibc's — they are now; (6) `charset=latin1` in a graph made Graphviz convert
  the text a second time ("Ã©"); (7) Latin-1 and UTF-16 files were read as UTF-8 (� for every accent); (8) of
  several graphs in one text only the first was drawn and nothing said so; (9) Graphviz's assertions were compiled
  out (zig cc defines NDEBUG by itself): where the tool aborts, the module ran on with a null pointer — it stops at
  the check now and the tab names it; (10) after an error the old drawing stayed and looked current — Download SVG /
  PNG and Copy handed out the drawing of an earlier text; (11) the text output came from a second layout without a
  guard: twice the time, a late answer for an older text could replace the newer, errors were swallowed; (12) PNG:
  above 16,384 pixels (possible from 8,200 px of drawing) nothing was saved and nothing said; (13) JSON went through
  JSON.parse / JSON.stringify (numbers respelled; a text JSON.parse refuses left the old output standing); (14) Copy
  SVG with nothing drawn copied an empty text; (15) a newer text had to wait for the long layout of an older one;
  (16) an empty editor was "could not draw this graph"; (17) Graphviz's doubled "Warning: Warning:" and hundreds of
  repeated lines were shown as they came; (18) a control character in a label made the SVG unreadable for the
  browser — a broken picture, no message; (19) downloads were always "graph.*", whatever file was open; (20) a binary
  or huge file went into the editor as it was; (21) a graph with `layout=…` was drawn by another engine than the
  chooser showed, without a word; (22) megabytes of text output were put into the box whole.
  Found beside the tab: a failed output format left its job in Graphviz's list and the next format ended in exit(1)
  (glue; cleared now); native Graphviz 16.1.0 itself aborts on two of the hazard graphs (`splines=ortho` with a loop
  in circo / twopi; an HTML name beside a plain name with the same text in fdp) — recorded, the tool's to repair.

### Calculators › calc-core (19 Nov 2026)
- **calc** — Scientific Calculator (21 bugs; unit 0 → 243 of its own, e2e 76 → 140). Engine kept
  (`docs/WASM-AUDIT.md` tab 56: no tried-and-tested WebAssembly calculator exists). Reference: **mpmath at 50 digits**
  and Python's exact integers for 3,005 expressions — every function over a grid in degrees and radians, 1,500
  random expressions written with as few brackets as the grammar needs, 135 written cases — each checked for its
  value (12 digits) *and* for being displayed as the exact answer is displayed.
  What was wrong: (1) **sin 180° = 1.224646799e-16**, cos 90° = 6.1e-17, sec 90° = 1.6e16, and the same in radians at
  π; (2) **whole numbers beyond 12 digits came out wrong**: 2^40 = 1099511627780 (…776), 1234567² = …490 (…489);
  999999999999.9 was shown as 1000000000000; (3) **1 ÷ 3 = , × 3 = gave 0.999999999999** — going on from a result
  used its rounded text; (4) nCr(200, 2) and nPr(200, 2) were "Error" (∞ / ∞), nCr(5, 7) too; (5) **"1.2.3" was
  1.2**, "1e5.5" was 50000 and "2 3" was 6; (6) **"2x3" was 0** and "2y" was 0 — letters were unknowns worth 0;
  (7) Sin(30), PI and Ans typed with capitals were unknown names; (8) a result without a real value wiped the
  typed expression, went into the history as "Error" and made Ans useless; (9) ± after the keypad's − piled up
  brackets; (10) (−8)^(1/3) and root(−8, −3) were "Error", root(8, 0) was ∞; (11) deep nesting answered "Maximum
  call stack size exceeded"; (12) **1 ÷ 0 was ∞ and 5 ÷ (1 ÷ 0) was 0**, ln 0 was −∞, an overflow was the
  result "inf"; (13) 200 + (10%) was 220 and 200 + −10% was 199.9; (14) a digit typed on the keyboard after "="
  was appended to the result (the digit keys started anew); (15) Copy result copied the expression; (16) MR put
  back a rounded number; (17) (−0.5)! was "Error", Γ(170 … 171.6) was ∞, Γ(0) was ∞; (18) round(1.005, 2) was 1,
  log(125, 5) was 3.0000000000000004 inside floor / ceil; (19) "Unknown name in expression" did not say which,
  "1,000" was "Unexpected symbol after expression"; (20) "=" pressed twice replaced the exact result by its
  rounded text; (21) a history row with Ans was worked out again with the latest Ans.
  Beside it: the JSON Formatter's e2e suite still expected an older wording of one message (found by the complete
  run after the data-engines area: 4,976 of 4,977; corrected).
- **units** — Unit Converter (6 bugs; unit 0 → 93, e2e 31 → 56). No engine to replace (`docs/WASM-AUDIT.md` tab 57).
  Reference: **GNU Units 2.23** (`scripts/make-units-reference.py`): every ordered pair of units of every quantity
  for several values, 3,222 conversions, all equal to 13 digits. What was wrong: (1) **small results were rounded
  away**: 1 mm in miles showed "0.00000062", 1 byte in TiB and 1 mg in tonnes showed "0", and so did rows of the
  table; (2) **factors rounded to six digits**: 1 knot was 1.8519984 km/h (it is 1.852 by definition), the US
  gallon 3.78541 l (3.785411784) with its teaspoon, tablespoon, cup, fluid ounce and pint, the cubic foot, mmHg,
  the BTU (1055.06 for 1055.05585262), tola, bigha and both mpg — wrong from the sixth or seventh digit, and the
  old suite expected exactly those rounded results; (3) tsp, tbsp and cup were the US customary sizes without
  saying so (4.93 / 14.79 / 236.6 ml) — the kitchen sizes 5 / 15 / 250 ml are there now, both labelled; (4) a click
  on the result copied "1,609.344" with its thousands separator (text to a spreadsheet); (5) a temperature below
  absolute zero was converted without a word; (6) a fuel economy of 0 gave "—" without a reason. Added: quintal,
  cent, guntha, ground, UK pint and fluid ounce, cubic inch, torr, kgf/cm², and the quantity Angle.
- **dates** — Date Calculator (7 bugs; unit 0 → 22, e2e 40 → 58). Nothing to replace (`docs/WASM-AUDIT.md` tab 58).
  Reference: **Python's datetime and calendar** (`scripts/make-dates-reference.py`): 1,700 spans (days; weekdays
  counted one by one; years-months-days found by trying month after month), 4,191 additions of months, 594 mixed
  additions, 500 birthdays, over the years 1 to 9999. What was wrong: (1) **"today" was the date in UTC** — in India
  every date box started on yesterday's date until 05:30 in the morning (also in the Time Zone and Due Date tabs,
  which share the helper); (2) **the years 0 to 99 were read as 1900 to 1999** (Date.UTC does that): 31 Dec 99 →
  1 Jan 100 was not one day; (3) with "Count end date" the days grew by one but the years-months-days did not
  (1 – 31 January: 31 days, yet "0y 0m 30d"); (4) one and a half months, or any fraction, was added as nonsense
  without a word; (5) a result beyond the calendar was shown as "Invalid Date"; (6) "1 years 1 months 1 days" and
  "51 weeks 1 days"; (7) with the dates the other way round nothing said that "From" was the later one.
  Added: the two dates in words, "N days later / earlier", total months, the age the next birthday brings, and for
  29 February birthdays the day that is counted.
- **emi** — EMI Calculator (15 bugs; unit 0 → 76, e2e 10 → 61). Nothing to replace (`docs/WASM-AUDIT.md` tab 59).
  Reference: the definition of a reducing-balance loan — interest on what is owed, the rest repays — worked month by
  month in **mpmath at 420 digits** for 936 loans (₹50,000 to ₹10 lakh crore, 0 % to 1,000 %, 1 to 1,200 months) and
  cross-checked with **numpy-financial** (`scripts/make-finance-reference.py`); the tab's schedule is compared cell by
  cell. What was wrong: (1) with "Tenure in: Months" the box still said **years**; (2) a loan of 0 gave "Principal
  NaN% Interest NaN%"; (3) a negative loan had a negative EMI; (4) a negative rate gave "Principal 172.4% Interest
  -72.4%"; (5) a tenure of 0, or of less than half a month, gave three dashes and "NaN%" without a reason;
  (6) a negative tenure showed **"Invalid typed array length: -6"**; (7) 20.04 years was silently worked out as 240
  months — the number of instalments was nowhere; (8) beyond 100 years the schedule stopped at year 100 without a
  word; (9) **357,913,942 years was worked out as 8 months** (months × 12 wrapped round in the engine's 32-bit
  integer): an EMI of ₹3,22,543 beside a total of ₹1.38 × 10¹⁷; (10) a long tenure at a high rate gave dashes
  ((1 + r)^n overflows; the instalment there is simply loan × rate); (11) a rate of 10⁻¹³ % gave dashes
  ((1 + r)^n − 1 had no digits left — numpy-financial has the same fault); (12) **the opened schedule folded shut on
  every keystroke** (shared form helper: fixed for every calculator); (13) at 100 % over 100 years the schedule
  said the loan is never repaid (the month-by-month recurrence multiplies its rounding by 1 + r each month; now
  closed forms); (14) amounts with paise were written with one digit, "₹12.1" (shared `fmtINR`: every tab that shows
  rupees); (15) a loan of 10³⁰⁰ filled the screen with digits. Refusals now say why (loan above 0 and at most
  ₹10 lakh crore, rate 0 – 1,000 %, tenure 1 month – 100 years). Added: an "Instalments" row, a note when the
  tenure was not whole months, the months of a last part-year in the schedule.
- **gst** — GST Calculator (6 bugs; unit 0 → 38, e2e 10 → 34 — two of them are loops over 250 splits). Nothing to
  replace (`docs/WASM-AUDIT.md` tab 60). Reference: **Python's decimal** with ROUND_HALF_UP on the typed text of the
  amount, 1,126 amount × rate pairs × four modes; 8,000 random splits for what must always hold. The tab worked in
  binary fractions and printed each figure rounded on its own. What was wrong: (1) **CGST + SGST did not add up to
  the GST shown** whenever the tax was an odd number of paise: ₹100.50 at 5 % showed GST ₹5.03 beside CGST ₹2.51 and
  SGST ₹2.51 — on an invoice the two taxes are each rounded and the GST is their sum, ₹5.02; (2) the same when the
  amount includes the tax: ₹100 including 18 % showed GST ₹15.25 beside 7.63 + 7.63 — now the tax is found first
  (7.63 + 7.63 = 15.26) and the base is what is left (₹84.74), so base + GST is the amount typed, to the paisa;
  (3) **base + GST was a paisa off the total** for amounts with a third decimal (₹1,234.565 at 12 %: 1,234.57 +
  148.15 beside a total of 1,382.71); (4) an amount ending in half a paisa was rounded down when its double lies
  below it (₹1.005 → ₹1.00) — the engine's `paise()` now reads the amount as it is written; **the invoice engine
  shares it**: of the amounts x.xx5 up to ₹200, 1,147 of 20,000 had been rounded down; (5) only seven rates — 0.1 %,
  1.5 %, 6 % or 7.5 % (which the invoice tab has) could not be entered: "Other" with a box, up to three decimals;
  (6) 10¹⁸ rupees was worked out with digits a double does not have (limit ₹10 lakh crore, with the reason).
  A credit (negative amount) is the mirror image. Notes say when the amount or the rate was rounded.
- **sip** — SIP Calculator (10 bugs; unit 0 → 52, e2e 16 → 39 — two of them loops over 87 plans and 40 lump sums).
  Nothing to replace (`docs/WASM-AUDIT.md` tab 61). Reference: the instalments carried forward month by month in
  **mpmath** (1,430 plans: −50 % to 1,000 %, 1 to 1,200 months, step-ups to 100 %; 180 lump sums), cross-checked with
  **numpy-financial's fv**. What was wrong: (1) a period of 0, a negative one, or less than half a month gave ₹0 three
  times and "—×" without a reason; (2) 15.04 years was silently worked out as 180 months — the number of instalments
  was nowhere; (3) 300 years gave a maturity value of 23 digits, 5,000 years a screen full of them; (4) **3 × 10⁷
  years froze the page for 1.6 seconds** (the engine looped once per month; it now stops at 12,000 and the tab
  refuses beyond 100 years); (5) a negative amount had a negative maturity value; (6) a return of −1,300 % gave a
  maturity value of −₹769, a lump sum at −150 % three dashes; (7) a step-up of −150 % made the instalments change
  sign; (8) a lump sum for −5 years was worth ₹5,674; (9) "-0×" as the wealth multiple; (10) **Maturity − Invested
  was not the Gains shown** whenever the invested amount had paise (a step-up of 5 % or 12.5 %): 209 of the 1,430
  reference plans were a rupee off — the three figures are now the ones that add up. Refusals say why (amount above
  0, return above −100 % and at most 1,000 %, period 1 month – 100 years, step-up 0 – 1,000 %, result up to ₹10,000
  lakh crore). Added: "Instalments" row, a note for a period that is not whole months, "₹ a month" beside the
  amount; the step-up box is hidden for a lump sum.
- **fd** — FD / RD Calculator (11 bugs; unit 0 → 38 and the shared formatting `moneyfmt.test.mjs` 0 → 79; e2e
  11 → 38). Nothing to replace (`docs/WASM-AUDIT.md` tab 62). Reference: compound interest in **mpmath** for 1,100
  deposits and 1,000 recurring deposits (0 – 100 %, a quarter of a year to a century, five ways of compounding), the
  banks' own RD formula, and 76 effective yields in exact decimals. What was wrong: (1) an FD for −2 years was worth
  ₹87,041, one for no time showed its deposit without a word; (2) **an RD for −2 years showed "Interest earned
  ₹1,20,000 · Invested −₹1,20,000"**; (3) an RD of 0, or of under half a month, gave three zeros; (4) an RD of 1.04 or
  2.3 years was silently 12 or 28 instalments; (5) 5,000 years filled the screen with digits; (6) **an RD of 3 × 10⁷
  years froze the page for 1.8 seconds**; (7) a rate of −500 % gave ₹0 for an FD and dashes for an RD; (8) a negative
  deposit had a negative maturity value; (9) **the effective yield of 7 % half-yearly was shown as 7.122 %** — it is
  7.1225 % exactly, and the double nearest to it lies below: every yield and every amount is now rounded as it is
  written (`roundDec` in `fmtN` / `fmtINR`: 1.005 → 1.01), for all calculators; (10) (1 + r/n) raised to 1,200
  monthly periods kept 13 of 16 digits, and a lump sum at −99 % for a century as few: the engine now puts back what
  the division and the addition lost (`growth()`): 15 – 16 digits everywhere; (11) with paise in the deposit,
  Maturity − Invested was not the interest shown. Added: "Instalments" row and a note for the RD, "₹ a month".
  Found on the way and fixed before it shipped: reading 16-digit amounts with 15 digits (₹1,00,12,49,99,99,999.99
  became …50,00,00,000) — pinned in `moneyfmt.test.mjs`.
- **percent** — Percentage Calculator (9 bugs; unit 0 → 59, e2e 6 → 41 — one of them a loop over 150 answers).
  Nothing to replace (`docs/WASM-AUDIT.md` tab 63). Reference: **exact fractions** of the typed numbers (Python's
  `fractions`) for 841 pairs × the six questions; 4,878 of the 5,046 answers are the nearest double to the exact
  fraction, the rest within two units of the last digit. What was wrong: (1) **small answers were shown as 0** —
  "0.0001 % of 0.001", "1 is what % of 3,000,000,000" (0%), "10⁻⁹ is 50 % of what" — the answer was cut to six
  decimals; (2) **"% change from −50 to −25" was "+-50%"** (divided by A instead of |A|, and the sign was taken from
  B ≥ A): it is +50 %; (3) "-0" and "-0%"; (4) "+0%" for no change; (5) "33.3333333 % of 3" was 1; (6) a small
  difference of two decimals was wrong from the eighth digit ("% change from 99.9999999 to 100": 1.000000083 × 10⁻⁷
  instead of 1.000000001 × 10⁻⁷) — the numbers are now taken as decimals and the answer is one division of whole
  numbers; (7) a dash without a reason when B or A is 0; (8) a click copied "1,399.3" with its comma, and copied the
  dash when there was no answer; (9) 10²³ was written as 24 digits. Answers have ten digits like the Unit Converter
  (`fmtUnit`), a real minus sign, "+" only before an increase; the copy is plain digits.
- **words** — Number to Words (10 bugs; unit 0 → 144, e2e 18 → 62 — two of them loops over 123 and 94 numbers).
  Nothing to replace (`docs/WASM-AUDIT.md` tab 64). Reference: **num2words** (`en_IN` for lakh and crore, `en` for
  millions; `scripts/make-words-reference.py`) for 1,598 whole numbers up to 10¹⁹. What was wrong: (1) **"One Lakh
  One"** — British and Indian English join a last part below a hundred with "and" ("One Lakh and One", "One Thousand
  and Fifty", "One Crore and One"): the engine differed from num2words on 323 of the 1,598 numbers in lakh and crore
  and on 269 in millions; the invoice and the rent receipt, which use the same engine, said it the same way;
  (2) **"One Dollars"**, "One Cents" and "One Paise" (one paisa); (3) ₹0.05 was "Rupees Zero and Five Paise Only" —
  now "Five Paise Only"; (4) a plain number with more than two decimals was refused (3.14159); (5) a negative plain
  number was refused (now "Minus Twelve"); (6) **the "Digits" row lost the digits beyond 2⁵³** — 9,999,999,999,999,999,999
  was shown as 10,000,000,000,000,000,000; (7) ".5", "12.", "Rs. 500", "INR 500", "500/-" and "+500" were refused;
  (8) every refusal said "Enter a positive number with up to 2 decimals" whatever was wrong; (9) "Digits" showed
  12,34,567.5 beside "Fifty Paise"; (10) in the invoice and the rent receipt an amount ending in half a paisa could
  lose it (the shared `rupeesInWords` reads the amount as it is written). Refusals now say what is wrong (not a
  number, written with an exponent, three decimals, a minus sign on money, more than 19 digits).
- **timezone** — Time Zone Converter (6 bugs; unit 0 → 74, e2e 11 → 43 — one of them a loop over 130 readings).
  Nothing to replace (`docs/WASM-AUDIT.md` tab 65: the zone database is the browser's). Reference: **Python's
  zoneinfo** on tzdata 2026e (`scripts/make-tz-reference.py`): 2,288 offsets of 52 zones from 1850 to 2037 and 3,095
  wall-clock readings around every clock change of seven years — which exist once, twice, or not at all. The reading
  of wall-clock times was right (all 3,095 agree); what was wrong: (1) **an offset with seconds was written
  "UTC+05:53.46666666666664"** (Kolkata before 1906, every zone before standard time); (2) **the years 1 to 99 were
  worked out as 1901 to 1999** — wrong weekday, wrong offsets (Date.UTC again); (3) **a time could only be converted
  to thirty fixed cities** — there was no "To zone" among the 419 zones of the list; (4) the year was never shown,
  not even across New Year; (5) Samoa's skipped day (30 Dec 2011) was "read as 12:00 pm" without saying of which
  day; (6) fourteen zones were listed under names tzdata has replaced (America/Buenos_Aires, America/Godthab,
  Atlantic/Faeroe, Pacific/Truk, Africa/Asmera …). Added: the answer in large type (a click copies it), the
  difference between the two zones in words ("New York is 10 hours 30 minutes behind Kolkata"). Dates are taken from
  2 January 0001 to 30 December 9999 (a day inside the calendar in every zone). Known and reported by the suite: the
  browser's database can be older than the reference (Morocco's 2026 dates in this Chromium).
- **bmi** — BMI Calculator (6 bugs; unit `health.test.mjs` 0 → 47 for the three health tabs, e2e 10 → 33).
  Nothing to replace (`docs/WASM-AUDIT.md` tabs 66 – 68). Reference: exact fractions of the typed numbers, the one
  decimal that is shown by decimal rounding, the classes by both sets of cut-offs — 1,141 people — and the healthy
  range of 43 heights found by trying every tenth of a kilogram or pound. What was wrong: (1) a height of 0 gave
  **"BMI — · Obese"**; (2) nothing was checked: a negative weight was "Underweight", 1.7 typed as centimetres an
  obese BMI of 235,294; (3) **the "healthy weight range" ended on a weight the tab itself called overweight** — at
  170 cm it said 53.5 – 66.5 kg, and 66.5 kg is BMI 23.0, overweight by the Indian cut-off (and 53.4 kg, which is
  Normal, was left out): the range is now exactly the weights classed Normal; (4) **Imperial asked for the height
  in inches alone and kept the metric numbers in the boxes** (170 in, 68 lb → BMI 1.7): now feet and inches and
  pounds, in boxes of their own; (5) in Imperial the healthy range was still in kilograms; (6) 30.0 was written
  "30". Added: "Your weight is 1.7 kg above it / within that range".
- **calories** — Calorie Calculator (2 bugs; e2e 9 → 24). Reference: the Mifflin–St Jeor equation in exact decimals
  for 588 people. What was wrong: (1) nothing was checked — a weight of 0, a negative weight or an age of 0 gave a
  daily need all the same; (2) **loss targets far below what is safe were offered as plans** (a small woman of 60:
  "Weight loss: 716 kcal"): targets under 1,200 kcal (women) / 1,500 kcal (men) are marked "too low" and a note says
  why. Added: a +0.5 kg a week row. The formula is for adults: ages 15 – 110.
- **duedate** — Pregnancy Due Date (5 bugs; e2e 14 → 29). Reference: Python's datetime for 1,255 pregnancies (due
  date, conception, trimester ends, days completed, days to go). What was wrong: (1) **the example started from the
  date in UTC** — a day early in India until 05:30; (2) six weeks past the due date, or with a period still to come,
  "Today" was a dash without a word; (3) a cycle of 28.5 days gave "9 weeks 6.5 days"; (4) in the first days of a
  long cycle the count was negative and shown as a dash; (5) a period in the year 9999 gave "Invalid Date". Added:
  "To go: 210 days (30 weeks 0 days)", "Due today", "7 days past the due date".
- **tip** — Tip & Bill Splitter (4 bugs; unit `smallcalc.test.mjs` 0 → 53 for the three tabs, e2e 9 → 19).
  Nothing to replace (`docs/WASM-AUDIT.md` tabs 69 – 71). Reference: decimal arithmetic in whole paise for 2,112
  bills. What was wrong: (1) **the share shown did not cover the bill**: ₹1,150 among three was "₹383.33 each" beside
  "Collected ₹1,150" — three times ₹383.33 is a paisa short; every share is now rounded up (to the paisa, the rupee
  or ₹10), "Collected" is share × people, and "Left over" says what that leaves; (2) 0 people was quietly one
  person; (3) two and a half people were accepted; (4) a negative bill or tip gave negative shares.
- **fuel** — Fuel Cost (5 bugs; e2e 7 → 22). Reference: exact fractions for 245 trips. What was wrong: (1) a mileage
  of 0 gave "Fuel cost —" and "— litres", a negative one a negative cost; (2) 0 people was quietly one, 2.5 people
  accepted; (3) **"1 litres"**; (4) small amounts were "0 litres" (half a kilometre on a scooter: 0.008 litres);
  (5) the total distance was rounded to whole kilometres (12.7 km → "13 km").
- **gpa** — GPA Calculator (4 bugs; e2e 8 → 20). Reference: exact fractions for 400 grade sheets, with the two
  decimals shown rounded half up. What was wrong: (1) **a grade point above the scale was counted** — an 11 on the
  10-point scale, and every 9 or 8 after switching to the 4-point scale ("GPA 8.89" on a 4-point scale);
  (2) negative credits were subtracted; (3) a row with one box empty was skipped without a word; (4) with credits
  adding up to 0 the result was a dash without a reason. Rows that cannot be counted are named and left out; the
  total credits are shown on both scales.
- **base** — Number Base Converter (6 bugs; unit `numerals.test.mjs` 0 → 109 for this tab and the next, e2e
  13 → 37). Nothing to replace (`docs/WASM-AUDIT.md` tabs 72 – 73). Reference: **Python's int()** and **numpy's
  base_repr** for 464 numbers from one bit to 6,000 bits typed in bases 2 – 36. What was wrong: (1) **a prefix was
  taken off in every base**: in hexadecimal "0b1" — the number B1, 177 — was read as binary 1; in base 36 "0x1f"
  (42,819) was 51; (2) a wrong digit only turned the box red: no reason, and **the other boxes went on showing the
  number of before**; (3) an emptied box was marked wrong, the others kept their number; (4) **the custom base was
  bent without a word** (40 was taken as 36, 1 as 2, while the box said 40); (5) "+5", a typographic minus and
  "0O17" were refused; (6) long numbers froze the page — 60,000 digits took 4.4 s per conversion, six conversions a
  keystroke: digits now go in and out in chunks (10⁹, 16⁷ …: 150 ms for the same number) and a box takes at most
  10,000 digits. Every refusal names the digit and the digits of the base.
- **roman** — Roman Numerals (4 bugs; e2e 8 → 26). Reference: the **roman** library for every number from 1 to 3,999
  both ways and for 3,000 strings of Roman letters (what is a numeral in standard form). What was wrong:
  (1) **IIII — every clock face — was "Not a valid Roman numeral"**, as were MDCCCCX and the other additive forms
  carved on buildings: they are read now, with the standard form named; (2) "1,994", 0, −5 and 3.5 all got "Not a
  valid Roman numeral"; (3) Ⅻ and ⅳ (the Unicode numerals) and "MM XXVI" with a space were refused; (4) one message
  for every mistake. Added: the numeral taken apart ("M (1000) + CM (900) + XC (90) + IV (4)").

**Complete suites after calc-core (19 Nov 2026):** `npm test` 19,492 / 19,492 in 60 suites; `node tests/e2e.mjs`
5,401 / 5,401 in 188 suites (749 s; six suites — graphviz, lazy, one copy-button test, a 60 s wait, a photo test,
video AV1 — timed out under the load of the parallel run and passed when run alone).

### Calculators › calc2-math (19 Nov 2026)
Reference for the five finance tabs: **mpmath at 60 digits** (`scripts/make-finance2-reference.py` →
`tests/fixtures/finance2/reference.json`); what each refuses is `src/lib/finance.ts`; unit
`tests/unit/finance2.test.mjs` (66).
- **prepay** — Loan Prepayment (9 bugs; e2e 11 → 21). "Prepay after 0 months" was quietly taken as 1, so prepaying
  now could not be worked out; a month at or past the loan's end, a month with a fraction or a negative one gave
  "Interest saved ₹0" without a word (the prepayment simply never happened); a tenure of 0 showed dashes and
  negative amounts were worked with; a tenure beyond 100 years stopped at 1,200 months with money still owed; a
  prepayment larger than what was owed was not capped in what the tab reported and "Same tenure" then showed
  "New EMI ₹0"; the loop called a loan closed at 50 paise owed; a loan without interest showed rounding noise as
  its interest; "Interest saved" could differ by a rupee from the two interests shown beside it. Now: the engine
  (`m_prepay`) prepays before the instalment that follows, caps a prepayment at the balance and says so, reports
  what was prepaid in all (seven prepayments of ₹2 lakh = ₹14 lakh) and whether a prepayment closed the loan; the
  tab shows "3 years 4 months earlier", figures that add up, and a reason for everything it refuses.
- **ppf** — PPF Calculator (5 bugs; e2e 7 → 17). 15.6 years gave the balance of 16 years against the deposits of
  15.6; −5 years showed "Interest earned ₹7,50,000"; a thousand million years ran the engine's loop that long;
  deposits under ₹500 (and negative ones) were accepted although the label names the limits; a negative rate was
  worked with. Now whole years 1 – 50, ₹500 – ₹1,50,000, and a note when the years are not a maturity (15, then
  blocks of 5).
- **epf** — EPF Calculator (6 bugs; e2e 9 → 17). **The interest was compounded monthly**, which the EPFO does not
  do: it works out interest on each month's opening balance and credits it once a year — the default example showed
  about ₹2.7 crore, it is ₹2,56,34,372. Retiring at or before the present age showed a corpus of ₹0; an age of 30.5
  showed "27.5 years" over a corpus for 27; a huge retirement age ran the loop that long; negative pay, balance,
  raise and rate were worked with; "Interest earned" did not always add up with the figures beside it. Now the
  rows name the member's 12 %, the employer's share into EPF and the share that goes to the pension scheme (EPS,
  not in the corpus), and they add up as shown.
- **nps** — NPS Calculator (7 bugs; e2e 9 → 19). An annuity share below 40 % was quietly worked as 40 % while the
  box still said 20; and the rule itself is out of date — since PFRDA's exit rules of December 2025 a
  non-government subscriber must put only 20 % into an annuity (government subscribers 40 %): new choice
  "Subscriber", the least share is checked and named. An age of 60 or more showed a corpus of ₹0, an age with a
  fraction was cut off without a word, a share above 100 % gave a negative lump sum, negative numbers were worked
  with, lump sum + annuity could miss the corpus by a rupee, and an absurd age made the month count overflow. A
  corpus of up to ₹8 lakh gets the note that it may be taken out in full.
- **inflation** — Inflation Calculator (6 bugs; e2e 7 → 17). At 0 % "Years for prices to double" showed a dash;
  deflation showed "Purchasing power lost −49.8%" and doubling in "−34.3" years (now "gained" and "years for prices
  to halve"); −100 % and below showed ₹0, "—" or NaN; 0, negative and absurd numbers of years were worked with
  (5,000 years: a screen of digits); a negative amount was accepted; results beyond what can be shown were shown.
  The power is the engine's `growth()` now (the tab is mathcore's like the others).
- **sleep** — Sleep Cycle (4 bugs; e2e 7 → 22). A negative "time to fall asleep" moved the bedtime the other way,
  15.5 minutes showed 9:14 for 9:14½, 1,00,000 minutes went round the clock 69 times, and an emptied time box
  worked with the time at which the tab had been opened. Now whole minutes 0 – 180, "Choose a time.", every row
  says the day it falls on ("9:15 PM (the day before)"), and a third choice **"Go to bed now"** follows the clock
  minute by minute (stopped when the tab is left). Reference: Python's datetime for 400 nights.
- **bodyfat** — Body Fat (7 bugs; e2e 7 → 22). A slim tall man (waist 62, neck 42) was told "waist must be larger
  than neck" — the formula had gone below zero; a waist of 9 m showed "Body fat 154.3%" and a lean mass of
  −40.8 kg; a negative weight gave negative masses; a woman without a hip measurement and a height of 0 were both
  blamed on the waist; the class went by the unrounded figure ("18.0 %" beside "Fit"); the hip box was shown to men
  as "Hip (women)" and ignored. Now measurements are checked one by one, a result that no body has (≤ 0 %, ≥ 75 %)
  is refused with the figure, the class goes by the number shown, "Below essential fat" has a note, fat + lean =
  the weight, the hip box appears for women only, the chart used is shown. Reference: the Hodgdon–Beckett equations
  in mpmath for 700 bodies.
- **idealweight** — Ideal Weight (3 bugs; e2e 9 → 18). Below 5 feet the four formulas silently gave the weights of
  152.4 cm (a man of 140 cm: "Devine 50 kg", a BMI of 25.5); a height of 0 showed "0 – 0 kg", −170 cm the range of
  170 cm, ten metres "Devine 817.5 kg"; and the healthy range disagreed with the BMI tab (53.5 – 66.5 kg here,
  53.4 – 66.3 kg there — at 66.5 kg the BMI tab says "23.0, Overweight"). Now 100 – 250 cm, no formula below 5 feet
  (said in a note; the engine returns NaN there), one routine (`healthyRange`) for both tabs, the WHO range beside
  the Asian one, and feet + inches with pounds. Reference: exact fractions for 384 heights.
- **coords** — Coordinates Converter (13 bugs; e2e 17 → 34). **Reading:** a real minus sign (−12.5, as the tab's
  own hint wrote it) was ignored: 12.5 N; the S in "28.6 degrees" or "50 sec" made a southern latitude; a pair pasted
  into one box ("28.6139, 77.2090", as map apps copy it) was read as degrees and minutes: 29.900717; a decimal
  comma was "out of range"; 75 minutes and 80 seconds were accepted; ".5" was 5 and "1e1" was 1° 1′; E was accepted
  on a latitude and a minus sign together with S; "28.5 30" (decimal degrees, then minutes) was accepted.
  **Writing:** 28.9999999° came out as "28° 59′ 60.00″". **The answer:** a second point with one box empty was
  passed over in silence; the same place twice had the bearing "0°"; and the distance was the sphere's — up to
  0.5 % off (Delhi → Mumbai 3.6 km, opposite points 11 km) while shown to ten metres. Now: `src/lib/coords.ts`
  reads every usual writing and refuses the rest with the reason; a pair in a latitude box fills both boxes; the
  distance, both bearings (with compass points) and the half-way point are the **geodesic on WGS-84** by Karney's
  method (`geo.wasm`, `docs/WASM-AUDIT.md` entry 82), the sphere's figure beside it; notes for the same place and
  for (nearly) opposite points. Reference: Karney's Python library for 437 pairs, 352 of them confirmed with
  Vincenty's formula in mpmath; 628 written and 400 typed coordinates by exact fractions.
- **graph** — Graphing Calculator (11 bugs; unit 0 → 60, e2e 22 → 52). **The page froze for good** after panning
  away from the origin and zooming in about 88 times (hold Enter on the button): the grid was drawn by adding a
  step that had become smaller than the gap between two doubles, so the loop never arrived — zoom is now limited
  to what doubles can carry (10⁻¹² … 10¹² px per unit, less far from the origin) and grid lines are counted, not
  added up. **y = 1000x was not drawn at all** and **floor(x) had vertical connectors**: the page judged a break by
  the size of the step between two samples; the engine's new `m_expr_plot` halves the stretch between two distant
  samples until it knows — a jump or a pole keeps its distance, a steep unbroken curve loses it. A function that
  could not be read got a red border and no reason (now the engine's message under the box); "x = 2" drew the
  line y = x − 2 (now the vertical line), "x + y" drew with y = 0, "f(x) = …" was refused; the wheel and a pinch
  zoomed about the middle of the picture instead of the cursor or the fingers; the readout said "f1(x) = Error"
  where a function has no value; "Add function" stayed live at six and did nothing; the PNG's object URL was never
  released. Also: grid labels with the digits their step needs, arrow keys / + / − / 0 on the focused graph, two
  samples a pixel, the functions beside the graph on wide screens (typing one scrolled the picture under the
  sticky tab rows), a redraw when the system theme changes.
- **equation** — Equation Solver (14 bugs; unit 0 → 62, e2e 30 → 54). **Repeated roots came out as different
  numbers:** (x − 1.1)², typed 1, −2.2, 1.21, showed 1.1000000149 and 1.0999999851; (x − 0.1)³ showed 0.100001201554,
  0.0999993992228, 0.0999993992228; (x − 1)²(x − 10⁶) showed 1 ± 0.00278966872477i; x³ + 10⁸x² + x + 1 showed three
  real roots where there is a complex pair. Coefficients of 10²⁰⁰ gave "−0.5 + Errori", x² + 10¹⁶⁰x + 1 gave 0 and
  "Error". **Simultaneous equations:** an ordinary system in units of 10⁻²⁰ and two nearly equal equations were
  called unsolvable (an absolute test on the pivot); contradicting equations and dependent ones got the same "No
  unique solution"; changing the number of unknowns threw away what had been typed. **Any equation:** x = x and
  2 = 2 listed "50 solutions" (−100, −99.99, −99.98 …); x + y = 2 was solved with y = 0; more than twenty roots
  were cut off without a word, and a range of millions was searched in steps of hundreds without saying so.
  Complex numbers were written "− 2i" and "1i". Nothing was solved until Solve was pressed, and Enter did nothing.
  Now: quadratics, cubics and linear systems are read as the decimals they are and classified with exact
  fractions (`src/lib/exact.ts` on BigInt, `src/lib/equations.ts`): the kind of the answer is stated ("One real
  root, twice"), every root is the nearest double of the true value (the cubic's by Newton's step on the exact
  polynomial from the engine's estimate), fractions stand beside their decimals (x = 0.333333333333 = 1/3), "no
  solution" is told from "infinitely many" with the rank; the engine's quadratic and cubic are Kahan's (scaled, no
  cube roots of differences); identities, missing x, other letters, two = signs, fifty roots and coarse steps each
  get their sentence; radians / degrees; live answers, Enter, the grid keeps what was typed.
- **stats** — Statistics (12 bugs; unit 0 → 27, e2e 14 → 27). The sum of 10¹⁶, 1, −10¹⁶ was 0 (and the mean 0):
  sums are exact now (`fsum` in mathcore); the skewness of numbers with a large offset (10⁹ + a few) was right to
  seven digits only — the rounding of the mean is taken out of the squares and the cubes; data of 10³⁰⁰ gave no
  skewness and data of 10⁻³⁰⁰ a deviation of 0 (deviations are scaled by a power of two). "−3" with a real minus
  sign, and anything else that is not a number, was left out without a word (now read, or named: "Left out — not
  numbers: abc, 12x"); with a 0 among the numbers the geometric and harmonic mean showed "—" (they are 0), and no
  "—" had a reason; evenly spread decimals showed a skewness of 5 × 10⁻¹⁶. Regression: points above each other
  gave "y = Errorx + Error", a level line a correlation of "Error"; a line with three numbers was taken as a pair
  and a line with one passed over, both silently. An empty box left an empty page; the sorted list grew without
  limit. The tab now says how its quartiles are worked out.
- **matrix** — Matrix Calculator (8 bugs; unit 0 → 54, e2e 20 → 35). The result wrote every number under 10⁻¹² as
  0 (a matrix of 10⁻¹³s came back as zeros); a matrix with 10⁻¹⁵ on its diagonal was "singular" with rank 0 (fixed
  limits of 10⁻¹⁴ and 10⁻¹⁰ in the engine); a letter in a cell, an empty box and a number with a real minus sign
  all got "Each row needs the same number of values"; a power of 2.5 was quietly cut to 2; "1 2; 3 4" was one row
  of four, and brackets were refused; "Same size needed." did not say which sizes. Now the cells are read as the
  decimals or **fractions** (3/4) they are and the arithmetic is exact (`src/lib/matrix.ts`): a determinant of 0 is
  0, the rank is certain, the inverse can be shown in fractions (Decimals / Fractions switch), the 90th power of
  [[1, 1], [1, 0]] has every digit; matrices beyond 400 cells go to the engine in double precision, and the tab says
  so; every refusal names the matrix, the row and the shapes.
- **fraction** — Fraction Calculator (6 bugs; unit 0 → 34, e2e 14 → 26). (1/2)¹⁰⁰ was reported as "Division by
  zero" (an overflowed product had come out as 0); numbers stopped at 64 bits ("9223372036854775807 + 1: Numbers too
  large") — the engine now counts in 128 bits (38 digits), and what goes wrong first is what is reported; ½ ¼ ¾, a
  power of ten (1e3) and a number starting with a point were "Could not read the expression", which was also all
  an empty box and an open bracket got — now a hint, "A bracket is not closed", and the part that could not be
  read is quoted; the decimal was a rounded 2.8333333333333 — now exact, with the repeating digits in brackets
  (2.8(3), 1/7 = 0.(142857)). Also the ratio colon and the fraction slash, a real minus sign in the answers, and a
  note on what binds to what.
- **primes** — Prime / LCM / GCD (5 bugs; unit 0 → 8, e2e 23 → 28). Negative numbers, 0, decimals and words were
  left out without a word (and with nothing else typed the page stayed empty); "0x10" was read as 16; one number
  beyond 64 bits blanked the whole answer; of more than twenty numbers the rest was dropped silently. Now what is
  left out is named, the next prime is shown after a prime too, and GCD / LCM can be copied. The engine itself
  agrees with SymPy on 420 hard numbers — products of two primes near 2³², Carmichael numbers, strong
  pseudoprimes, the last primes below 2⁶⁴.
- **periodic** — Periodic Table (5 bugs; unit 0 → 41, e2e 22 → 46). Typing a symbol showed another element: "s"
  gave sodium, "b" beryllium, "i" iron (the first name that began with the letter won over the symbol); "aluminum",
  "cesium" and "sulphur" found nothing; a search without a match just dimmed the table; nothing marked which cell
  the card below belonged to; the electron configurations of elements 104 – 108 — never measured — were not marked
  "(predicted)" like those of 109 – 118. Now: symbol first, other spellings and Latin names (wolfram, aurum), a
  category can be typed or picked in the legend ("noble gas"), the shown element is outlined, arrow keys walk the
  table, the two gaps of group 3 say 57–71 and 89–103, a mass in brackets is explained, the block is shown, and on
  phones cells and legend entries are 44 px. The data itself agrees with the `mendeleev` package but for IUPAC's
  spelling of aluminium and caesium, five longest-lived isotopes found since, and two predicted configurations.

**Complete suites after calc2-math (19 Nov 2026):** `npm test` 20,085 / 20,085 in 70 suites; `node tests/e2e.mjs`
5,611 / 5,613 in 188 suites (797 s). The two failures, both fixed, and a third find:
- **The start page had grown to 181 KB** (budget of `lazy.e2e.mjs`: 180 KB) — the search keywords written for the
  tabs of this hunt travel in the entry script, which every visit downloads whether it searches or not. Not answered
  by raising the budget: the keywords of all 176 tabs moved to `src/keywords.ts`, a chunk of its own (22 KB) that
  `loadKeywords()` fetches together with the search engine when the search box is first used. Start page: 8 files,
  161 KB. `tests/unit/registry.test.mjs` holds the two lists to each other (every tab has keywords, no line without a
  tab); search results are unchanged (1,900 checks of the registry and search suites).
- `tests/e2e/math.e2e.mjs` (the older smoke test of the Math tabs) still expected the roots of x² − 3x + 2 as "2, 1";
  the Equation Solver lists real roots ascending since tab 84 → "1, 2". The test was stale, not the tab.
- **A bug of the app shell, found through a test that timed out now and then** (`shell.e2e.mjs`, three of nine runs
  right after the change above, at the step that types "qqzzxxqq" into the search box): when the search box loses
  the focus, a timer hides the result list 120 ms later — **also when the reader is back in the box by then and has
  typed a new word**. The box then held text, the results were worked out, and nothing was shown until the next
  keystroke (Enter on a result, then "/" and a word; or a click elsewhere and straight back). The timer is now
  cancelled when the box gets the focus and does nothing while the box has it. Three checks in the shell suite
  (both ways of leaving the box; the list still closes when the box is really left) — they fail on the build before
  the fix. In the same suite the three stars at its start were clicked right after `goto`; a change of the hash is
  taken up a moment later, so the suite now waits for the new tab's title first (a slip of the test).

### Text (19 Nov 2026 –)
- **`wordcount` (tab 90, 17 bugs; new engine `textkit.wasm`; unit `tests/unit/wordcount.test.mjs` 125, e2e 36 —
  before: 12 e2e checks and 4 unit lines).** The counting stood on the browser's own segmenter, and the browsers do
  not agree (`docs/WASM-AUDIT.md`, tab 90). Found by probing the built page in Chromium:
  1. **Words in Chrome:** "U.S.A." was 3 words, "e.g." 2, "p.m." 2, "example.com" 2 — Chromium's word rules never
     join letters over a full stop (Safari and Firefox do: other counts for the same text).
  2. A web address was 6 words, an e-mail address 5.
  3. A date (10/11/2026) was 3 words, a time (9:30) 2, a fraction 2.
  4. A compound written with the non-breaking hyphen (well‑known) was 2 words.
  5. **Sentences:** "Dr. Smith went to Washington." was two, "Mr. Rao met Mrs. Iyer." three, "It costs Rs. 500."
     two, "A. P. J. Abdul Kalam" four.
  6. A row of asterisks or dashes was a sentence; `"Why now?" he asked.` was two.
  7. **Paragraphs:** three paragraphs separated by single line breaks (text copied from a word processor) were
     "1 paragraph"; a separator row (***) was a paragraph.
  8. **Lines:** a text that ends with a line break had one line too many.
  9. Average word length counted code points: Hindi words came out about twice as long as they are.
  10. **Every keystroke** segmented the whole text four times on the main thread: 0.8 s a key at 1.2 MB, 4 s at 6 MB
      — the tab stood still while one typed in a long text. Now 0.1 s for 1.2 MB, and a text above 200,000
      characters is counted when the typing pauses (a keystroke costs under a millisecond).
  11. **Keywords:** "very", "it's", "don't" and other function words were listed; India’s (curly) and India's
      (straight) were two words, and neither was "india"; "3.5" was a keyword; a text in which no word repeats
      listed its first ten words as "top".
  12. Reading time of a long text in minutes only ("420 min"): now "7 hr 0 min".
  13. The four tiles had a pointer cursor and did nothing: a click copies the number now (plain digits).
  14. The tab fetched an engine (textcore.wasm) when it opened with an empty box; nothing is fetched now before
      there is a text.
  15. **In all twelve engine wrappers** (`src/wasm/*.ts`): a download that failed was remembered — the tab stayed
      without its engine until it was left and opened again. One helper now (`lazyEngine` in `src/lifecycle.ts`): a
      failed load is tried again by the next call. Found by the new e2e check that cuts the download.
  16. On phones the heading of a folded section (`<summary>`, here "How these are counted", also the EMI
      schedule and others) was 36 px tall: 44 px now.
  17. Chinese and Japanese: the count depended on the browser's dictionary (6 "words" for 12 characters in one
      browser, other figures elsewhere); every character counts now, as in Microsoft Word, and the tab says so.
  **The rule now, said in the tab:** a word is what stands between two spaces and holds a letter or a digit — the
  count of Word and `wc -w`, which a word limit is checked against — except that a dash or an ellipsis between two
  words separates them. References: `tests/fixtures/wordcount/` (wc / Word, Python's `regex`, pySBD, Snowball's stop
  words — `python3 scripts/make-wordcount-reference.py`), ICU in the unit suite.
- **`case` (tab 91, 14 bugs; the conversions moved into textkit.wasm; unit `tests/unit/caseconv.test.mjs` 79, e2e 43
  — before: 9 e2e checks and 5 unit lines).**
  1. Title Case wrote "Don’T" for "don’t" (a typographic apostrophe split the word).
  2. Title Case took the writer's capitals away: "the NASA iPhone app" → "The Nasa Iphone App".
  3. Title Case knew one first and one last word for the whole text: of a list of titles only the first began with
     its capital ("of Mice and Men"), and a small word after ? or ! stayed small.
  4. Title Case wrote "Example.Com" for an address.
  5. Title Case searched its list of words once for every word: 7 s a keystroke at 80,000 words (measured), four
     times that at twice the length. One pass now (100,000 words in under 0.1 s).
  6. Sentence case gave only the first line its capital; a new paragraph began small.
  7. Sentence case: no capital after an opening quotation mark or bracket (`he said. "then we left."`).
  8. Sentence case wrote "obéI" for the French "obéi": its test for the lone word "i" knew ASCII letters only.
  9. Code cases took an apostrophe for a divider: "don't stop" → `don_t_stop`.
  10. Code cases cut words at every combining mark and dropped it: Hindi "नमस्ते दुनिया" → `नमस_त_द_निया`, an accent
      written as a mark was lost.
  11. Code cases joined all lines into one name: a list of column names came out as one long word.
  12. Upper and lower case followed the browser's language: on a Turkish browser "TITLE" became "tıtle" and "fish"
      "FİSH" (and camelCase did, while snake_case did not).
  13. A result of several lines was shown as one line (it was copied right).
  14. All twelve copy buttons had the same name ("Copy"): a screen reader could not tell them apart.
  Added: **Capitalized Case** (Word's "Capitalize Each Word" — the tab's keywords promised "capitalize"); a tooltip
  per row; long results shown up to 20,000 characters and copied whole; texts above 200,000 characters converted
  when the typing pauses; Mc / O' / d' names in Title Case.
- **`lines` (tab 92, 10 bugs; `src/lib/linetools.ts`; unit `tests/unit/linetools.test.mjs` 80, e2e 36 — before:
  14 e2e checks).**
  1. A list that ends with a line break had a line too many: sorted, an empty line stood on top; numbered, an empty
     line got the last number.
  2. An empty box was "1 lines in → 0 lines out".
  3. "1 lines".
  4. Duplicates: é typed as one character and as e + accent were two lines.
  5. Duplicates "ignoring case": STRASSE stayed beside Straße (only `toLowerCase` was compared).
  6. "By length" counted UTF-16 units: two emoji with a skin tone were 8 long, नमस्ते 6. Characters now, as the Word
     Counter counts them (textkit.wasm).
  7. Numbers could only be sorted as a dictionary sorts them: −3 before −20, 1.5 before 1.25. New choice **0 → 9**:
     by the number a line begins with (signs, decimals, exponents, 1,20,000, ₹ 500); lines without one last.
  8. Shuffle shuffled anew at every change of any option: a prefix typed letter by letter made the list jump at each
     key. The order now stays until the lines change or "Shuffle again" is pressed.
  9. The tab fetched crypto.wasm when it opened, for a shuffle that had not been asked for. No engine at open now.
  10. A → Z left lines that differ only in capitals or accents (a / A, resume / résumé) in the order they came in, so
      the same lines could sort two ways; the order is fixed now (small before capital, plain before accented).
  Also: the line under the result says what was removed ("1 empty line and 1 duplicate removed"); a list above
  200,000 characters is worked on when the typing pauses. Reference: the GNU tools on 400 lists
  (`scripts/make-lines-reference.py`): all agree.
- **`replace` (tab 93, 9 bugs; `src/lib/findreplace.ts`; unit `tests/unit/findreplace.test.mjs` 61, e2e 28 —
  before: 12 e2e checks).**
  1. The search ran on the page at every key: a pattern such as `(a+)+$` on forty letters **froze the tab**. It runs
     in the regex worker now and is ended after 5 seconds with the reason; the page stays alive meanwhile.
  2. "Whole words" knew ASCII letters only: with it switched on **no Hindi word was ever found** (nor a Russian or
     Greek one).
  3. … and "café" was replaced inside "cafés": after an accented letter the engine's `\b` sees a word end.
     Words are now bounded by Unicode letters, digits, marks and the underscore.
  4. `^` and `$` matched only at the start and the end of the whole text; at every line now, as in an editor
     ("> " in front of each line).
  5. There was no way to replace with a line break or a tab: `\n` in "Replace with" was a backslash and an n. With a
     regular expression `\n`, `\t`, `\r`, `\\` are read now (plain mode stays literal).
  6. `$0` for the whole match was written out as "$0" (only `$&` worked).
  7. A pattern with escapes that JavaScript's Unicode mode refuses (`\-`, `\#`, a lone `{`) — common in patterns
     pasted from elsewhere — was turned away ("Invalid escape"); it is run in the older mode now, with a note.
  8. After a pattern that is not valid the result box kept the replacement of the pattern before it.
  9. The refusal was the engine's raw line ("Invalid regular expression: /(/giu: Unterminated group"); a sentence
     now.
  Also: "No match — nothing was replaced."; a fold-out that says what `$1`, `$&`, `\n`, `^` mean here. Reference:
  Python's `re.subn` on 226 searches (`scripts/make-replace-reference.py`): all agree.
- **`diff` (tab 94, 9 bugs; engine replaced: the `similar` crate in textkit-diff.wasm; unit
  `tests/unit/textdiff.test.mjs` 51, e2e 30 — before: 16 e2e checks and the 40 unit checks of the old routine).**
  1. **"Texts are too different to diff"** for two texts of 8,000 lines that differed in two lines (one near each
     end): the old routine reserved memory by the size of the texts, not by how much they differ.
  2. … and 3,000 such lines took 528 MB of memory. Now: 100,000 lines in 0.2 s and 18 MB.
  3. A last line counted as changed when only one of the texts had a line break after it (the sample itself would
     show "date" removed and added with any engine that compares lines with their ends).
  4. No line numbers: in a long text there was no telling where a change was.
  5. A changed line was shown as a removed and an added line with nothing to say what had changed in it; the
     changed words are marked now.
  6. Every unchanged line was drawn: two long texts with one change were thousands of rows to scroll through.
     Unchanged runs are folded ("⋯ 7,982 unchanged lines — show") with three lines kept beside each change.
  7. Words: "mat." and "mat" were two different words (punctuation was part of the word).
  8. Characters: an emoji with a skin tone or a letter with its vowel sign was cut into halves, and half an emoji
     was drawn as "changed".
  9. Comparing and redrawing ran at every key also for long texts (70 ms a key at 8,000 lines); from 20,000
     characters on it waits for a pause in the typing.
  Added: **Copy as patch / Download .diff** — a unified diff that GNU `patch` applies (the Patch tab reads it too);
  "The texts differ only in the line break at the end"; a note when the time limit (2 s) ended the search for the
  shortest diff.

- **`fancy` (tab 95, 10 bugs; the three styles that work character by character now take their characters from
  textkit.wasm; unit `tests/unit/fancy.test.mjs` 81, e2e 51 — before: 12 e2e checks and 2 unit checks).**
  1. **Upside down scrambled emoji and Hindi:** the text was reversed code point by code point, so 🇮🇳 came out as
     🇳🇮 (another country's flag), a thumbs-up lost its skin tone, and Hindi vowel signs landed on other letters.
  2. Upside down left digits as they were: "69" came out as "96" (6 and 9 must change into each other), 2, 3, 4,
     5 and 7 stayed upright.
  3. … and brackets: "(hi)" came out as ")ᴉɥ(" — every pair opened where it should close.
  4. **Strikethrough and Underline broke emoji:** a mark was put after every code point — between a hand and its
     skin tone, between the members of a family, after every Hindi vowel sign (six marks on नमस्ते's three
     characters).
  5. **"Styles — tap to copy" and a tap did nothing:** only the small button at the end of a row copied.
  6. All eighteen copy buttons had the same name, "Copy" (a screen reader read "Copy" eighteen times).
  7. Circled left digits plain ("Ⓡⓞⓞⓜ 12"); Unicode has ⓪ ① … ⑨.
  8. An accented letter stayed plain in the middle of styled ones ("𝐜𝐚𝐟é"); it takes the style now and keeps its
     accent.
  9. The text box had one line: a pasted text of several lines lost its line breaks.
  10. **A long text froze the tab:** eighteen rows of 20,000 styled characters took 1.5 s to draw at every key,
      200,000 characters two minutes. A row shows the first 2,000 characters now (the tab says so) and Copy styles
      the whole text; a keystroke at the end of 200,000 characters takes a few milliseconds.
  Also: "Bubble squares" is called **Squared** (the characters are squares, not bubbles); line breaks are kept in
  every style; nothing is fetched until a text has an emoji or another script than Latin (then textkit.wasm, which
  tells its characters apart); a failed download is said, the fifteen table styles stay, and the next change tries
  again.

- **`emoji` (tab 96, 7 bugs; the search is ranked by textcore.wasm now, the data comes from emojibase-data; unit
  `tests/unit/emoji.test.mjs` 84, e2e 66 — before: 13 e2e checks).**
  1. **The search looked for the typed letters inside an emoji's name and nowhere else.** An emoji is rarely called
     what people type: "happy", "thanks", "namaste", "thumbsup", "+1" found nothing; "lol" found a lollipop;
     "laugh" did not find 😂 ("face with tears of joy"). Every emoji now carries Unicode's own keywords (CLDR), the
     shortcodes of GitHub and Slack, and a few Indian words (namaste, chai, diwali, bharat …).
  2. … and it matched anywhere inside a name: "ok" listed 31 emoji — books, broken hearts, smoking signs.
     The ranking is that of the tool search (whole words and phrases first, then beginnings, then slips of the
     keyboard: "hapy brithday" → 🎂).
  3. **Symbols could be found by the name of their group only**: "euro", "pi", "tick", "half", "degree",
     "copyright", "infinity" found nothing ("rupee" was a single hard-coded exception).
  4. The search box offered "rupee" as an example, and with the emoji list open "rupee" found nothing: only the
     open list was searched. A search now covers both lists, each in a card of its own.
  5. A symbol said nothing but its code point ("U+221A"). Every symbol has its Unicode name now ("Square root ·
     U+221A"), checked against a second source (Perl's character names).
  6. **Emoji newer than the device's font were empty boxes** (in this Chromium: all of Emoji 17). One emoji of each
     recent version is drawn on a canvas as the tab opens; versions the font lacks are left out, the tab says how
     many, and "Show them anyway" brings them back.
  7. People and hands came in yellow only: there was no way to pick a skin tone (332 emoji have five each).
  Also: the line under the box says what was copied, with its name ("Copied 🙏 — folded hands" — on a phone there
  was no way to learn a name); Enter copies the best match; an emoji or symbol pasted into the box is found (to
  learn its name); two more groups of symbols (Greek letters, superscripts and subscripts) and a few more
  fractions; Emoji 18. The data was held to another package's reading of Unicode's emoji list (unicode-emoji-json:
  the same 1,914 emoji, groups, versions and skin-tone flags; ours has the 9 of Emoji 18 besides).

- **`morse` (tab 97, 11 bugs; `src/lib/morse.ts`; unit `tests/unit/morse.test.mjs` 52, e2e 42 — before: 13 e2e
  checks and 3 unit checks). The reference is unixcw (libcw), the Morse program of Linux radio amateurs.**
  1. A word made of characters without a code left an empty word behind: "A € B" → ".- /  / -...", and a text that
     began with one started with " / ".
  2. **Characters without a code vanished without a word**: é ("café" was sent as CAF), %, €, a whole Hindi word.
     Now: é è à ä ö ü ñ ç have their codes, other accents are left off the letter (ê as E), % is sent as the ITU says
     (0/0), typographic quotes and dashes as the plain ones — and what is left out is named under the result.
  3. Text of several lines came out as one line of Morse.
  4. **Two lines of Morse were read as one word**: "... --- ..." and ".... . .-.. .--." on two lines gave "SOSHELP".
  5. Two spaces, a tab or a bar between words were not word gaps (".-  -..." gave "AB").
  6. A group that is no Morse code was dropped ("AB" for ".- ...... -..."); it is shown as � and named.
  7. "...---..." — SOS as it is sent, without gaps — showed nothing; it is read as <SOS> (and <SK>, <BK>, <KA>, <SN>,
     <HH>, CH; letters in angle brackets are sent as one sign).
  8. **Sound: the dots and dashes of a typographer (· −), which the tab read, were played as silence.**
  9. Sound: a line break in Morse input was no gap at all (two lines sounded as one letter), and a slash without
     spaces was played as a letter gap.
  10. Sound: there was no way to stop a message, and pressing Play again played a second copy on top of the first.
  11. Phone: a letter's dots and dashes were broken over two lines of the result (".--." as "." and "--.").
  Also: a switch Auto / Text → Morse / Morse → text ("..." is no longer always Morse); tones rise and fall over 5 ms
  (a hard switch clicks); the length of the message is said before it plays; a pitch slider; a chart of the alphabet.
  Dot, dash and gap lengths equal libcw's at ten speeds to its whole microseconds.

- **`lorem` (tab 98, 9 bugs; engine replaced: the `lipsum` crate's Markov chain in textkit-lorem.wasm; unit
  `tests/unit/lorem.test.mjs` 95, e2e 39 — before: 13 e2e checks).**
  1. **At most 50 of anything**: 300 words of filler — an everyday request — could not be made. Now up to 200
     paragraphs, 2,000 sentences or 20,000 words.
  2. "Words" gave one sentence of up to 50 words without a full stop inside.
  3. Doubled words — "ut ut", "dolor dolor" — 15 in every 1,000 words.
  4. 63 different words, and no comma after the opening: it did not read like the text it imitates. Now Cicero's
     words in Cicero's order (a Markov chain over *De finibus*, book I): 2,700 words, commas, questions.
  5. The count was a slider: an exact number (say 37) was hard to hit, on a phone harder still. Now a box with the
     number keys (pasted "1,000" is read; ↑ / ↓ step by one), and what it cannot make is refused in a sentence.
  6. A new count threw the text away; changing 3 to 5 paragraphs now keeps the three and adds two (the text stays
     until Regenerate).
  7. No HTML: paragraphs can be copied in `<p>` elements now.
  8. Nothing said what was made; the line under the text counts paragraphs, sentences, words and characters (the
     same numbers as the Word Counter tab — the suites check it).
  9. The engine at open (crypto.wasm) failing to download left only the shell's "Could not load this tool"; now
     the form stays, the tab says what failed, and the next change or Regenerate tries again.
  **Two defects of the `lipsum` crate, put right by our glue beside it (and recorded in docs/WASM-AUDIT.md, 98):**
  its chain, at the end of a text, dropped the last word and jumped into the middle of another sentence ("… id
  est distinguique …"; "laborum." never came out — 0 times in 400 texts), and its source text left 1,079 quotation
  marks, dashes and footnote stars in 400 texts of 400 words. Each text is learned as a circle now, and cleaned
  first (also of Roman initials: "L. Torquato" ended a sentence in the middle of a name); Cicero's sentences of up
  to 103 words are cut at a comma after 24 words.

- **`photodict` (tab 99, 6 bugs; ranking engine textcore.wasm `rare.c` fixed; unit `tests/unit/rare.test.mjs` 65 —
  was 56; e2e 49 — was 43).**
  1. **Letters beyond ASCII were lowered wrongly** (a hand-written rule for Latin Extended-A that flips half-way, and
     none for Latin Extended-B — 131 letters): "Gdańsk" came out as "gdaŅsk", "Wrocław" as "wrocŃaw", "Łódź" as
     "ŁódŻ" — wrong words looked up, wrong names listed. Now a table generated from Python's `str.lower()` and held
     to the JavaScript engine's `toLowerCase` for all 398 letters.
  2. … and a name beginning with Ł was not taken for a capitalised word, so it was never recognised as a name.
  3. **"Mr. Darcy", "J. R. R. Tolkien": the full stop of a title or an initial ended the sentence**, so the name
     after it never stood in mid-sentence and was looked up as a word (online, too) instead of being listed under
     "Names skipped".
  4. "Prof.", "Capt." and other titles with their full stop were offered as hard words.
  5. **A second photo chosen while the first was being read was dropped without a word**; the first page's words
     stayed on screen. Now the newer photo is shown at once ("it is read as soon as the one before is done"), the
     older result is not shown, and the newer one is read.
  6. "Snap" pressed before the camera's first frame did nothing; it waits for the frame now.
  Also (no visible symptom found): apostrophes and hyphens inside a word were appended without a length check, so
  a token like a'a'a'… of 800 characters wrote past the tokeniser's 256-byte buffer; bounded now, with a test.
  Checked and kept: the Wiktionary REST definition endpoint the online fallback uses is still served (experimental,
  English only — what the tab asks for).

- **Complete suites after area text (20 Nov 2026):** `npm test` 20,757 / 20,757 assertions in 78 suites;
  `node tests/e2e.mjs` 5,853 / 5,853 checks in 188 suites (994 s). Nothing to fix.

### Security and codes (20 Nov 2026 –)

- **`pgp` (tab 100, 8 bugs; engine kept: OpenPGP.js — docs/WASM-AUDIT.md, 100; unit `tests/unit/pgp.test.mjs` 35 — new,
  with the RFC 9580 Appendix A vectors; e2e 34 — was 8).**
  1. **A second recipient was dropped without a word.** Two public keys (two files, or pasted one after the other)
     went to OpenPGP.js as one text, and the library reads only the first armored block: the message was encrypted
     to the first person alone (gpg shows one recipient). Each block is read on its own now.
  2. A decrypted file was saved under the encrypted file's name without ".gpg" ("odd-name"), not under the name
     stored inside the message ("photo.bin").
  3. An armored message with an e-mail's words before it failed with "Error during parsing. This message / key
     probably does not conform to a valid OpenPGP format." (the armor was looked for in the first 64 bytes only).
  4. The library's errors were shown as they were: "Armored text not of type private key", "Error generating
     keypair: Invalid user ID format", "Error during parsing …". Each is said in words now (a public key where the
     private one belongs; "not an e-mail address" — checked before the key is made; not an OpenPGP message, or cut
     short; a revoked or expired recipient key).
  5. A message for another key said only "wrong key or password"; it names the key IDs the message is for and the
     ones given now — and a message for a key, opened with a password, says a key is needed.
  6. "Good signature from Bob" without the signing key's fingerprint or the date it was made (a user ID is only a
     claim; gpg shows both). Both are shown now.
  7. Decrypted text was shown only when the message had been pasted; a .asc file that held text gave only a
     download. Text (valid UTF-8, under 2 MB) is shown either way.
  8. A message chosen as the signature file, a clear-signed text pasted under Decrypt, a detached signature under
     "Clear-signed text": each gave a parser error; now each is named.
  Checked against gpg 2.4 in both directions: keys, two recipients, clear-signed and detached signatures (also of
  typed text against the same text in a file), passwords, the revocation certificate; RFC 9580 (v6 key of Annex A.4,
  SEIPD v2, AEAD OCB / EAX, Argon2) in Node and in the tab.
  **21 Nov 2026 — the "Latest standard (RFC 9580)" mode (owner's request; unit `pgp9580.test.mjs` 68, e2e
  `pgp9580.e2e.mjs` 40 against rPGP and Sequoia).** One bug found while it was built, by the interop probe before the
  tab used it: a message encrypted with `format: 'object'` (needed to read its format) gave a stream from `armor()` /
  `write()`, and the tab would have shown "[object Object]" — `readOut` in `src/lib/pgpstd.ts` joins it (unit checks
  for armored and binary). Checked both ways with each tool: v6 keys (Ed25519 and Ed448), messages and signatures
  inside them, the Argon2 / OCB-locked secret key, passwords, clear-signed and detached signatures; a GnuPG key gets
  SEIPDv1 (named), which gpg 2.4 decrypts; gpg refuses the v6 key (as the tab says).

- **`sodium` (tab 101, 4 bugs; engine: the cryptography moved to libsodium.js — the libsodium project's own
  WebAssembly build, libsodium 1.0.22 — with crypto.wasm kept for the USODIUM1 header; unit
  `tests/unit/usodium.test.mjs` 43 — new; e2e 25 — was 16).**
  1. Text that is not Base64 gave the browser's own words: "Failed to execute 'atob' on 'Window': The string to be
     decoded is not correctly encoded."
  2. … and so did good encrypted text in quotation marks, and a whole share link pasted into the box (its d= part is
     the very same text). Both are read now; URL-safe Base64 and text broken over lines too.
  3. A .txt file holding the encrypted text (saved from an e-mail) was refused as "Not a Sodium Encrypt file"; it
     is read as the encrypted bytes now.
  4. While the key was derived the progress bar sat at 0 % (four seconds and more with "Maximum"); it shows that it
     is working now, with the memory the file asks for ("Deriving key with Argon2id (1 GiB)…").
  Also: a key derivation that fails (a phone without the 1 GiB a "Maximum" file asks for) says so in words; the tab
  no longer loads crypto.wasm on the page as it opens just to print libsodium's version (the worker reports the
  version of the engine that did the work). Files of the old engine open with the new one and the other way round;
  the PyNaCl reference decryptor opens what the new one writes.
  5. (Found with tab 102.) The password box of "Decrypt" was marked as a new password, so Chrome offered to make up
     a strong one where the password of the file has to be typed; it is a plain password box there now.

- **`sharelink` (tab 102, 10 bugs; engine: libsodium.js + crypto.wasm's header, as tab 101 — docs/WASM-AUDIT.md, 102;
  unit: share links in `tests/unit/usodium.test.mjs` +13; e2e 26 — was 11).**
  1. A link with a character a link never has (changed on the way by an app) gave the browser's "Failed to execute
     'atob' on 'Window': The string to be decoded is not correctly encoded." — on pressing Decrypt, after the
     password had been typed. The link is read as the page opens now; what is wrong is said in words and there is
     no Decrypt button.
  2. A link copied together with the full stop of its sentence ("…d=VVNP….") could not be opened (the same atob
     error); the full stop is left aside now, as are a space that came in with a copy and percent-escapes.
  3. A link cut inside its first 78 bytes said "Not a Sodium Encrypt file (missing USODIUM1 header)" — "the link is
     cut short (some apps cut long links)" now.
  4. A link cut inside the message said "Wrong password, or the file is not a valid encrypted file", though the
     password was right. The cipher cannot tell the two apart; the tab says both now ("the password is wrong, or
     the link was cut or changed on the way — compare its end with the one that was sent").
  5. No password: the key was derived from an empty one (a second or more) and "Wrong password" followed; the tab
     asks for the password now.
  6. A link with an empty `d=` showed the composer without a word; a `d=` of another site gave "Not a Sodium Encrypt
     file". Both are said for a link now.
  7. The password was typed once: a slip made a link that nobody, the sender included, could ever open. It is typed
     twice now, as in Sodium Encrypt.
  8. A long message gave a long link without a word (5,000 characters → a link of 6,808); some apps cut links beyond
     about 2,000 characters. Above that the tab says how long the link is and suggests Sodium Encrypt and a file.
  9. The recipient's password box was marked as a new password: Chrome offered to make up a strong password where
     the one that was sent has to be typed.
  10. Enter in the recipient's password box did nothing; it decrypts now.

- **`hash` (tab 103, 10 bugs; engine: hash-wasm 4.13 — an existing WebAssembly module, replacing crypto.wasm's hashes —
  docs/WASM-AUDIT.md, 103; unit `tests/unit/hash.test.mjs` 99 — new; e2e 40 — was 12).**
  1. A checksum copied as a line of sha256sum / md5sum output ("e3b0…  ubuntu.iso") never matched: the spaces were
     removed and the file name was glued onto the digits. Every common form is read now — sha*sum, b2sum, b3sum and
     xxhsum lines (also `--tag`), openssl dgst, .sfv, certutil, PowerShell's Get-FileHash, "SHA-256: …" on a download
     page, Base64 (`--base64`, `sha384-…` integrity values).
  2. A checksum of an algorithm that was not chosen (a SHA-256 checksum with SHA-256 switched off) gave "No algorithm
     matches the expected checksum ✗" — which reads as a damaged download. The usual algorithm of that length, or the
     one the text names, is worked out as well now, and the tab says so.
  3. A SHA3-256 checksum, checked with SHA-256, gave the same ✗ without a word that 64 digits can be five other
     hashes; they are named now, with "Try those too".
  4. Words in the box ("the checksum is on the website") gave ✗ too; "No checksum found in what was pasted" now, and
     lines that cannot be read are named.
  5. Changing the expected checksum after Compute left the old verdict on screen; it is checked again at once (and
     the tab says when Compute has to work out another algorithm).
  6. Two files with only CRC-32 chosen were called "identical" when their CRC-32 was the same — anyone can make two
     different files with the same CRC-32 (the suite does). Files are compared by a secure hash now (BLAKE3 on the
     side when only weak ones are chosen), and the tab says by which.
  7. With three or more files nothing was compared; the identical ones are named now.
  8. A checksum list (SHA256SUMS) could not be used to check the files it lists: it is read when chosen with the files
     or pasted, each file is checked against its own line (by name, also through a path or another case), with a
     summary and the listed files that were not chosen.
  9. A large file (an ISO of several GB) could not be stopped; Stop ends the run.
  10. (The crypto client, found here.) A call made after its worker had crashed was never answered: making the new
      worker ended the old one, and that cleared the call just registered. The worker is made first now (the new hash
      client had the same fault after Stop, and the suite caught it).
  Also new: 14 more algorithms (SHA-224 / 384, SHA3-224 / 384, Keccak-256, BLAKE2s, BLAKE3, RIPEMD-160, CRC-32C, CRC-64,
  Adler-32, xxHash64, XXH3, XXH128) under "More algorithms"; text hashed as it is typed; hex / HEX / Base64; progress
  with speed; a checksum list of the files written as the tools write it (Download as SHA256SUMS, B2SUMS …).

- **`password` (tab 104, 3 bugs; engine: randombytes_uniform moved to libsodium.js — docs/WASM-AUDIT.md, 104; unit
  `tests/unit/passwords.test.mjs` 25 — new; e2e 25 — was 13).**
  1. The entropy counted passwords the tab never makes: with "at least one of each set" a password without a digit is
     drawn again, so there are fewer passwords than 89^20. "~130 bits" is 129 (and at 6 characters "~39" is 38); the
     tab counts the passwords it can make now (inclusion–exclusion, exact) and says the alphabet and the rule under
     the label.
  2. A length could only be set with the slider — on a phone 16 or 32 was a matter of luck. A box beside it takes the
     number (4 – 128; beyond is brought back when the box is left).
  3. The five copy buttons were all called "Copy" (a screen reader could not tell them apart): "Copy password 1" … 5.
  Also new: a symbols box (sites that allow only some symbols; what is not a symbol is named and left out), lengths
  from 4 (a PIN), and a note on where the randomness comes from.

- **`passphrase` (tab 105, 3 bugs; engine: randombytes_uniform moved to libsodium.js — docs/WASM-AUDIT.md, 105; unit
  `tests/unit/passphrases.test.mjs` 13 — new; e2e 16 — was 12).**
  1. **The word list was not checked.** Whatever the server sent was split at white space and used: a 404 page or
     an error page from a proxy became a "list" of a dozen words, and the tab made passphrases from them with the
     strength label of 7,776 words. The list must now be exactly 7,776 different words (else the tab says the list
     did not arrive whole and makes nothing); its SHA-256 is held in the unit suite.
  2. "Add a digit" was counted as log2(10) bits; the digit also goes after a random word, so it adds log2(10 × words)
     — 5.9 bits for six words, not 3.3.
  3. The five copy buttons were all called "Copy": "Copy passphrase 1" … 5.
  Also: the e2e suite split passphrases at "-", so "t-shirt", "yo-yo", "drop-down" or "felt-tip" (four words of the
  list) made it fail about one run in seventy; it reads the words back from the list now. And the lazy-loading suite
  never saw files in the site's own `data/`, `vendor/` and `models/` folders (it compared URLs without their leading
  slash with patterns that had one); with that fixed the passphrase tab was the only one loading such a file at open —
  the word list, which its first view needs (now on the list with the reason).

- **`qr` (tab 106, 7 bugs; engine kept: zxing-wasm 3.1.7, the latest — docs/WASM-AUDIT.md, 106; unit
  `tests/unit/codes.test.mjs` 39 — was 6; e2e 27 — was 19; codes are read back by zbar too).**
  1. **A UPI amount with a comma or ₹ was dropped without a word.** The amount box was a number box: "1,000",
     "₹ 250" or "49,50" gave an empty value, and the code asked for no amount. Amounts are read as people write them
     (₹ / Rs / INR, Indian or international digit commas, up to two decimals); "49,50" is refused (it is not ₹4,950)
     and no code is made until the amount is right; above ₹1 lakh a note.
  2. A calendar event's title and place were not escaped: "Diwali party, rooftop" and "Bandra; Mumbai" are split
     into fields by calendar readers (RFC 5545 asks for \, and \;).
  3. An event that ends before it starts was made.
  4. An SMS number kept its spaces ("SMSTO:+91 98200 12345:…"); the number is digits and + now, as for calls.
  5. A WPA password of fewer than 8 or more than 63 characters (no phone can join with it) was made without a word;
     WEP key lengths, a missing WPA password and network names over 32 bytes are pointed out too.
  6. A light code on a dark background, or colours with little contrast, which many phone cameras cannot read, gave
     no warning.
  7. Too much text showed zint's own words; the tab says how much fits and what to do.
  Also: the UPI link is written as NPCI's linking specification writes it (the @ of the UPI ID as it is, not %40);
  "What the code holds" shows the exact text; the newest text wins when zxing answers out of order; the PNG is saved
  as qr-code.png; a UPI ID that does not look like one, a long UPI note and an incomplete e-mail address are pointed
  out.

- **`barcode` (tab 107, 5 bugs; engine kept: zxing-wasm 3.1.7 — docs/WASM-AUDIT.md, 106; unit
  `tests/unit/barcodes.test.mjs` 26 — new, check digits held to python-stdnum; e2e 50 — was 32; read back by zbar and
  libdmtx too).**
  1. **A short EAN / UPC number became another number without a word**: zint pads it with zeros in front ("12345" is
     drawn as EAN-13 0000000123457). The tab says so and shows the number with its check digit.
  2. Code 39 in small letters was upper-cased without a word (a scanner reads ABC-123, not abc-123).
  3. An odd number of digits in ITF got a zero in front without a word; ITF codes under 6 digits, which many scanners
     skip, are pointed out too.
  4. zint's errors were shown as they come ("Error 275: Invalid check digit '1', expecting '0' (retval: 7)", "Error 358:
     Does not begin with …", "Error 204: Invalid character in input (ISO/IEC 8859-1 only)"); each is said for its
     format now, with what to do (the right check digit, Codabar's A – D, the 2-D codes for Hindi).
  5. Changing the format replaced a typed value with the new format's sample; a typed value stays now (only an
     untouched sample is replaced).

- **`scan` (tab 108, 3 bugs; engine kept: zxing-wasm 3.1.7 — docs/WASM-AUDIT.md, 106; unit: `describeCode` in
  `tests/unit/codes.test.mjs` +20; e2e 21 — was 10).**
  1. A second "Start camera" opened a second stream and left the first one running (the camera light stayed on until
     the tab was left); Start ends the old stream first, and a stream that ends by itself stops the scanning.
  2. A refused, missing or busy camera showed the browser's words ("NotAllowedError: Permission denied"); each is said
     with what to do.
  3. A Wi-Fi code was shown only as its raw text, so its password could only be copied with the code's escapes
     ("masala\:chai\;123"). Wi-Fi, UPI, contact, calendar, e-mail, SMS, phone and place codes are shown field by field
     now — Copy password, "Save contact (.vcf)", "Add to calendar (.ics)", Call / Send / Pay / map links (never a
     link for javascript: or data:).
  Also: format names as people say them ("QR code", "EAN-13"); a screenshot pasted with Ctrl+V is scanned; Clear; a
  frame that cannot be read is skipped instead of raising an error.

- **`zip` (tab 109, 5 bugs; engine: 7-Zip 24.09 compiled to WebAssembly (7z-wasm) replaces zip.js, which stays only
  for zips larger than the browser can hold in memory — docs/WASM-AUDIT.md, 107; unit `tests/unit/archive-names.test.mjs`
  13 — new; e2e 28 — was 13).**
  1. **A zip with a non-English password could not be opened by 7-Zip or WinRAR**: they take only ASCII for a zip
     password (native 7-Zip: E_INVALIDARG). The tab made it anyway (zip.js); it refuses such a password for a zip now,
     with the reason, and offers the 7z format, which takes any letters.
  2. The note said macOS Archive Utility opens AES zips — it does not (nor do Windows' zip folders); the note names the
     tools that do.
  3. The password was typed once; a slip made an archive nobody could open. It is typed twice now.
  4. Two files of the same name (from two folders, or added twice) became two entries of one name — extractors
     overwrite one or stop to ask. The second is "notes (2).txt" now.
  5. A long archive could not be stopped; Stop ends 7-Zip at once.
  Also new: the 7z format (LZMA2, AES-256, encrypted file names); the files' own dates kept; the archive name gets the
  format's extension.

- **`unzip` (tab 110, 3 bugs; engine: 7-Zip (7z-wasm) reads every archive — zip.js and libarchive.js no longer read
  any — docs/WASM-AUDIT.md, 108; unit: the listing parser held to the native 7z, `tests/unit/archive-names.test.mjs` +8;
  e2e 38 — was 23).**
  1. An encrypted archive had to be chosen again after the password was typed ("enter the password and choose the file
     again"); the tab asks for it and opens the same file with Open or Enter now.
  2. "Save all to a folder" passed every part of a path to the browser — an entry named "../evil.txt" made
     `getDirectoryHandle('..')` throw and the saving stopped half-way. Names are made safe (no "..", ".", empty parts;
     characters Windows refuses replaced); 7-Zip itself strips "../" when it unpacks.
  3. "Download all as .zip" unpacked and re-zipped everything in memory without a limit (a large archive could take the
     tab down); above 1.5 GB (256 MB on phones) the tab says to download the files one by one.
  Also new: RAR (1.5 – 5, encrypted), 7z with encrypted names, ISO, CAB and the other formats 7-Zip reads; locked files
  marked; a .gz of one file; the archive's type in the title; Stop.

- **Complete suites after area security-codes:** 21,097 unit assertions, all green; e2e 6,005 of 6,010 checks in 188
  suites. One failure was a fault of this area — the QR tab's new "What the code holds" box had no accessible name
  (every-tab) — fixed. Four checks failed only under the full parallel load and pass alone, three times in a row:
  formphoto "IBPS photo spec shown by default", keycode "Space on the focused Copy button copies", mermaid "Class
  renders", resume "photo included" — their timing is to be looked at with those tabs (formphoto and resume come with
  their areas; keycode and mermaid are on the list in RESUME.md).

### Images (20 Nov 2026 –)

- **`image` (tab 111, 4 bugs; engine: resizing moved to @jsquash/resize — Lanczos-3 in linear light; imgproc stays
  for the live adjustments: docs/WASM-AUDIT.md, 109; unit `tests/unit/editor-geom.test.mjs` 6 — new; e2e 37 — was 26).**
  1. **A transparent PNG saved as JPEG came out on black** — MozJPEG keeps the colour under a transparent pixel, which
     the browser stores as black. The JPEG encoder (shared by every image tab) now puts such a picture on white;
     WebP and PNG keep the transparency.
  2. Straightening rotated the picture inside its own frame and left the corners empty — black in a JPEG,
     transparent otherwise. The largest centred rectangle of the same shape without an empty corner is kept now
     (the preview and the size boxes show it).
  3. The size boxes took anything: 0 gave the original size without a word, −5 a picture of one pixel, 99999 a
     picture no browser can hold. They are whole numbers of 1 – 16,384 pixels now, refused in words otherwise.
  4. Making a picture smaller averaged the gamma-encoded values, so fine detail came out darker (a 1-pixel black /
     white checkerboard halved to 128 grey instead of 187). Resizing is done in linear light now.

- **`batch` (tab 112, 4 bugs; engine as tab 111 — docs/WASM-AUDIT.md, 110; e2e 21 — was 14).**
  1. **Two results of one name overwrote each other**: two IMG_0001.jpg from two folders, or a name pattern without
     {n}, put the same name twice into the zip (an unzip keeps one). The shared result list (also HEIC, Doc Scanner,
     Watermark, PDF → Images) adds " (2)", " (3)" now.
  2. The sizes took anything: −5 or 0 made pictures of one pixel; a scale of 0 % too. Refused in words now.
  3. A file that could not be read was reported in a toast per file that vanished; such files are listed under the
     results now, and the others are made.
  4. A long batch could not be stopped; Stop ends it after the picture in hand.

- **`heic` (tab 113, 3 bugs; engine: libheif-js 1.23.5 kept (the latest) + lcms-wasm (Little CMS) for colour —
  docs/WASM-AUDIT.md, 111; unit `tests/unit/heic.test.mjs` 13 — new; e2e 14 — was 11).**
  1. **iPhone photos changed colour**: they are in Display P3 and carry its profile; libheif's pixels were used as if
     they were sRGB, so saturated colours came out duller (a red of 240 became 220). The pixels are turned into sRGB
     with the photo's own profile now — in this tab and in every tab that opens a HEIC (Image Editor, Batch Images,
     Passport Photo …), as the browser does for a JPEG or PNG with a profile.
  2. A HEIC with several images (a burst, a depth map) gave the first one, not the primary one.
  3. A file that could not be read was reported in a toast that vanished; such files are listed now, the others
     converted.

- **`passport` (tab 114, 4 bugs; engines kept: MediaPipe 1.2.3 (latest) + imgproc; the upload copy resized with
  jSquash — docs/WASM-AUDIT.md, 112; e2e 25 — was 19).**
  1. A photo without a face, chosen after a good one, left the earlier person's passport photo and its download
     buttons on screen (which then said "Add a photo first"). The result is hidden and the reason shown now; a photo
     chosen while another is still being read wins.
  2. Cancel during the camera's 3-second countdown did not cancel: the photo was still taken from the stopped camera.
     Cancel, a camera switch or leaving the tab ends the countdown now.
  3. A refused, missing or busy camera showed "Camera unavailable: NotAllowedError: Permission denied"; said with
     what to do now (one helper, `src/lib/camera.ts`, also for the QR scanner and the Photo Dictionary).
  4. The custom size fell back to 35 × 45 mm without a word for 0 or a negative number, and took any size; it is
     10 – 150 mm now, said under the boxes.

- **`formphoto` (tab 115, 8 bugs; engines: MediaPipe + imgproc + jSquash + metacore kept, resizing moved to
  @jsquash/resize — docs/WASM-AUDIT.md, 113; unit `tests/unit/form-specs.test.mjs` 80 — was 58; e2e 47 — was 14).**
  1. "50 KB" was read as 51,200 bytes: a portal that counts a KB as 1,000 bytes refused files of 50,001 – 51,200
     bytes. The maximum is maxKB × 1,000 and the minimum minKB × 1,024 now (a file between them passes either way of
     counting; when the two leave no room, 50 – 50 KB, the minimum is read with 1,000); the result names the bytes.
  2. The dpi was written after the padding: the JFIF header then went in front of the padding as a second one, and
     the file ended 18 bytes above its target — above the maximum for 50 – 50 KB (50,018 bytes). The dpi is written
     first and the size judged with it (also for the Passport tab's upload copy, which shares the routine).
  3. metacore's padding ended 1 – 3 bytes above its target when that was 1 – 3 bytes past a full 64 KB comment
     segment (the last segment cannot be smaller than 4 bytes); the segments are split so that it never happens.
  4. A picture that could not get under the maximum even at the lowest quality was still downloaded — a file the
     portal refuses. It is not downloaded now; the result says why and how to make it fit, with "Download anyway".
  5. "Check the size and KB fields." for every mistake, and an empty minimum, a width of 10.5 or one of 90,000 were
     taken; each box is checked with its own reason now (width and height 10 – 5,000 px).
  6. Each key in the width / height boxes searched the face again, and a half-typed value ("3" of "300") set the
     frame to 3 : 230; the frame follows the boxes only while they hold a valid size, around the face found once.
  7. A second photo (or another kind) chosen while the first was still being cleaned or searched could get the
     frame of the first; the newest wins.
  8. The picture of every result stayed in memory (object URLs never revoked).
  Test: the first check read the page before the spec was drawn (a flake under load) — it waits now.

- **`bgremove` (tab 116, 8 bugs; engines kept: MediaPipe 1.2.3 + imgproc; the background photo of the saved picture
  resized with @jsquash/resize — docs/WASM-AUDIT.md, 114; e2e 31 — was 11; color e2e +1).**
  1. A photo chosen while another was still being searched could end with the earlier photo's mask (a cut-out of the
     wrong shape); the newest photo wins now, and so does the newest background photo.
  2. A photo without a person (a scanned page) gave an empty transparent PNG without a word; the tab says "No person
     was found in this photo — there is nothing to keep" (and that it finds people, not objects), and Save refuses.
  3. When the search failed, Save said "Choose a photo first." — it gives the reason now.
  4. "Choose a background photo." stayed in the status line after switching to another background, and the preview
     kept the last picture; the status line comes back and the preview shows the photo while there is nothing to put
     behind it.
  5. The tab's `.swatch` rule in styles.css (later in the file) turned the Color Converter's 96 px colour sample into a
     40 px-high rounded shape; the tab's buttons are `.bg-swatch` now (a check in color.e2e.mjs).
  6. The colour buttons were 40 px (touch targets are 44) and did not show which colour was chosen; 44 px, pressed
     state (a custom colour un-marks them).
  7. "first run loads a 16 MB model" was said for every photo; only for the first of a visit now.
  8. The status line now says how much of the photo the person fills (a first hint when the search took a cat or a
     pattern for a person — MediaPipe's model is trained on people).

- **`cartoon` (tab 117, 7 bugs; engines kept: imgproc + Magenta on TF.js (WebAssembly / WebGL) — docs/WASM-AUDIT.md,
  115; e2e 45 — was 37).**
  1. A see-through photo (a cut-out from the Background Remover) was painted black where it was transparent by the AI
     styles, and the filters drew ink lines and dark halos along the cut; it is put on white first (`onWhite`, now in
     `src/lib/imgio.ts`, shared with the Signature Maker). The same for a see-through painting used as the style.
  2. Every step of the Strength slider (each arrow key) and every style click queued a whole painting in the worker:
     five changes took five runs (≈ 5 s each on WebAssembly) before the newest showed. One painting at a time now; a
     change meanwhile waits and only the newest settings follow ("your new choice follows").
  3. Save in AI mode gave whatever was on screen — the previous style or strength while the new one was being
     painted, or the Filters picture under an AI style's name when the style engine failed. It refuses with the
     reason now ("still being made", or the engine's error).
  4. "Hold to compare" worked only with a pointer; Space or Enter held on the focused button compares too, and
     losing focus shows the result again.
  5. "Loading the style model (≈ 17 MB the first time)" flashed before every AI change; only until it has loaded.
  6. Save in Filters mode before the first preview was ready said "Choose a photo first." with a photo chosen.
  7. A painting that could not be opened was reported without its file name.

- **`redact` (tab 118, 6 bugs; engines kept: MediaPipe BlazeFace + imgproc — docs/WASM-AUDIT.md, 116; e2e 27 — was 14).**
  1. **Save during the face search saved the photo with every face visible** (the boxes were not there yet). Save
     says "Still looking for faces — Save again in a moment." until the search ends.
  2. A photo chosen while faces were being looked for in another got the other photo's boxes; the newest wins.
  3. Boxes drawn while the search ran were thrown away when it ended; they are kept beside the faces.
  4. A failed search was said in a toast that vanished — and after leaving the tab during a search, an error toast
     appeared on the next page; said in the status line now ("draw boxes by hand"), nothing after leaving.
  5. A gesture the browser took over (a scroll, a second finger) left a half-drawn box on screen and the drawing went
     on with the next move; pointercancel ends it.
  6. `setPointerCapture` threw for a pointer the browser no longer tracked (a page error); caught.
  Test: the face model is held back 4 s so Save and the drawing surely happen during the search.

- **`watermark` (tab 119, 6 bugs; canvas + jSquash, the saved logo resized with @jsquash/resize — 117; e2e 18 — was 12).**
  1. A first photo that could not be opened left the tab without a preview for good (later photos were never shown).
     It is said and left out; the next photo is the preview.
  2. Photos could not be taken off the list; "Clear photos".
  3. Empty text made "watermarked" copies with nothing on them; refused ("Type the text of the watermark.").
  4. A logo that could not be opened was an unhandled error (page error); said with its name.
  5. Photos that failed in a run were toasts that vanished; listed under the results now.
  6. The logo picker did not offer HEIC files.

- **`caption` (tab 120, 3 bugs; canvas text, our wrapping — 118; unit `tests/unit/textwrap.test.mjs` 18 — new; e2e 14 —
  was 11).**
  1. A word wider than the picture (a web address) was drawn past both edges.
  2. Chinese and Japanese (no spaces) were one line running off the picture; an over-long word is broken between two
     characters (never inside an emoji or a letter with its accent).
  3. Long top and bottom text grew into each other and off the picture; the text is made smaller until each block
     takes at most 45 % of the height.

- **`collage` (tab 121, 2 bugs; the saved photos resized with @jsquash/resize — 119; e2e 19 — was 15).**
  1. "A4 print (300 dpi)" saved a file without a dpi: it printed at whatever the program assumed (at 72 dpi a
     34 × 49 inch page). The JPEG says 300 dpi now; for PNG / WebP the line under the preview says to choose JPEG.
  2. "Move photo 1 earlier" was a button that did nothing; it is off.
  Also: an error while drawing the preview is shown under it instead of an unhandled rejection.

- **FFmpeg tab — 21 new jobs (todo.md item 2, the owner's choice of 20 Nov 2026; not yet the tab's own bug hunt, which
  comes with area "video").** The job list: the owner's six (join clips; subtitles burn / add / extract; logo or text
  on a video; volume; reverse; a thumbnail at a chosen time) and the popular FFmpeg uses found on the web that no tab
  had (fades, fit to a shape with a blurred background, remove silence, picture-in-picture, loop / boomerang,
  stabilise, denoise, contact sheet, timelapse, split into parts, sound settings, colours / black and white, cut a part
  out, background music, deinterlace). **Sources** (20 Nov 2026): cheat sheets and guides —
  https://cloudinary.com/blog/questions/what-are-the-most-useful-ffmpeg-command-line-options/ ,
  https://videoproc.com/resource/ffmpeg-commands.htm , https://www.shotstack.io/learn/how-to-use-ffmpeg/ ,
  https://img.ly/blog/ultimate-guide-to-ffmpeg/ , https://ostechnix.com/20-ffmpeg-commands-beginners ,
  https://techearl.com/ffmpeg-commands-cheat-sheet , https://github.com/rendi-api/ffmpeg-cheatsheet ,
  https://dev.to/alexshev/8-ffmpeg-recipes-i-use-every-week-that-most-developers-dont-know-exist-5458 ; FFmpeg GUIs —
  https://corz.org/windows/software/ffe/ , https://github.com/OPS-Solutions/SimpleVideoEditor/ ,
  https://www.linuxlinks.com/edconv-user-friendly-ffmpeg-gui/ ; creators' and filter guides —
  https://shotstack.io/learn/blur-sides-vertical-video/ , https://www.junian.dev/blog/ffmpeg-vertical-video-blur/ ,
  https://sumguy.pages.dev/ffmpeg-advanced-video-audio-manipulations , https://dt.iki.fi/ffmpeg-tips-tricks ,
  https://www.mintlify.com/FFmpeg/FFmpeg/reference/video-filters , https://www.mintlify.com/FFmpeg/FFmpeg/reference/audio-filters .
  **Bug found on the way (1):** the tab's "Extract frames → JPEG" used `-q:v 2`, and this core's JPEG encoder overflows
  a buffer at high quality — the page crashed on ordinary videos (the old suite tested PNG frames only). Every JPEG is
  MozJPEG's now; own arguments refuse JPEG from FFmpeg. Also fixed before it shipped: burned-in subtitles of the video's own track drew nothing (libass found no font: Noto Sans is forced), a refused job no longer reloads the core. Unit `tests/unit/ffjobs.test.mjs` 110 (new; every command run by a native FFmpeg 6.1), e2e `tests/e2e/ffmpeg.e2e.mjs` 68 (was 22; every new job on ffmpeg.wasm in the browser, 26 minutes) — all green.

- **`exif` (tab 122, 8 bugs; engine replaced: ExifTool 13.42 on zeroperl, in a worker — docs/WASM-AUDIT.md, 120; unit
  `tests/unit/exiftool.test.mjs` 87 — new, held to the native exiftool and Pillow; e2e 33 — was 14).**
  1. **An iPhone HEIC photo with its position said "This photo has no EXIF metadata (no camera details or
     location)"** — our reader did not read HEIC. ExifTool reads every format; the position, the phone and the rest
     are shown, and "This photo gives away: …" says in words what is in it.
  2. "Save without metadata" re-encoded HEIC and WebP to JPEG (quality lost, another format); they keep their format
     and their picture's bytes now.
  3. Stripping dropped the orientation: a portrait phone photo came out on its side. The orientation stays (and the
     colour profile and the JFIF density); nothing private does — the result is read again to make sure.
  4. XMP, IPTC, maker notes (serial numbers, owner names), PNG text and time chunks and embedded preview pictures were
     not shown; they are, grouped, and named among what the photo gives away.
  5. A file that is no picture (a text file named .jpg) said "no EXIF metadata"; it says what it is ("ExifTool reads
     it as a TXT file"); an empty file is said.
  6. A second photo chosen while the first was being read could be replaced by the first's details; the newest wins.
  7. The preview of a HEIC photo was a broken image (browsers do not show HEIC in an `<img>`), and the preview's
     object URL was never released; the photo is decoded and drawn.
  8. Degrees, minutes and seconds could read 60.00″ (rounding without a carry); the Coordinates tab's writer is used.

- **`scanner` (tab 123, 12 bugs; page finding → DocCornerNet LEAN on ONNX Runtime Web, docs/WASM-AUDIT.md 121; imgproc
  gets OpenCV's area resize; unit `tests/unit/pagefind.test.mjs` 38 — new, held to OpenCV and to photos with known
  corners (`scripts/make-scan-photos.py`, `scripts/make-scanner-reference.py`, needs `pip install scikit-image
  opencv-python-headless`); e2e 37 — was 13).**
  1. The page was not found where the paper is not much lighter than what it lies on — white paper on a light desk, a
     grey desk, a page held in a hand: on 17 real photos the outline finder got 10 right, on 53 generated ones 20; the
     page finder gets 15 and 43 (photos it never saw). The line under the photo says how the corners were found.
  2. Every page kept its full-size photo in memory (a 12 MP photo is 48 MB of pixels): ten pages on a phone could end
     the tab. Only the preview is kept; the photo is read again, one page at a time, when saving.
  3. On phones the picker always opened the camera — photos already taken could not be added. "Take a photo of a page"
     and "Choose photos" (several at once).
  4. Of several photos added at once, only the last got a thumbnail; every page gets one now.
  5. "Move page earlier" on page 1 did nothing and there was no "Move page later"; both, each off where it cannot move.
  6. Corners dragged across each other made a twisted page without a word; the tab says "The corners cross or fold
     back …", the preview dims, and saving is refused with the page's number.
  7. "Fit to scan" made each PDF page at 150 dpi of the scan's pixels — a 3,000 px page became 20 inches tall; the page
     now has the scan's shape with A4's long side (297 mm).
  8. Black-and-white pages went into the PDF as JPEG at quality 70 (grey smudges round every letter) while the note
     promised "the crispest text and smallest files"; they are PNG now (lossless; 23 KB for two pages against 92 KB in
     colour), and JPGs of them quality 85.
  9. The corner handles were 26 px touch targets (the rule is 44); 46 px now, a cancelled touch no longer leaves a
     handle stuck to the finger, and each handle tells a screen reader where it is.
  10. An error while saving did not say which page; it does ("Page 3 (IMG_2041.jpg): …").
  11. No way to clear the pages for the next document but deleting them one by one: "Start over".
  12. Leaving the tab while photos were being read could still draw into it; the work stops.

- **`ocr` (tab 124, 6 bugs; engine kept — tesseract.js 7.0.0, the latest — docs/WASM-AUDIT.md 122; e2e 24 — was 13).**
  1. If the language data could not be fetched, the tab hung at "Loading the text engine…" for ever with the button
     disabled, and Tesseract.js threw an uncaught "TypeError: Failed to fetch" (it rejects only when its first step
     fails). The failure is caught through its error handler, said in words, and the next try starts afresh (the Photo
     Dictionary, which shares `src/lib/ocr.ts`, had the same hang).
  2. A sideways or upside-down picture came out as garbage. A reading below 60 % confidence is tried the other three
     ways round on a smaller copy and read the way that is clearly better ("the picture was turned a quarter to the
     left to read it"); buttons turn the picture by hand.
  3. Light text on a dark ground (a screenshot in dark mode) gained stray characters ("i.", "»") from the clean-up,
     which expects dark text on paper; dark pictures are inverted before it.
  4. On phones the picker always opened the camera, so screenshots and photos already taken could not be read. The
     shared picker (`imageInput`) never forces the camera now and adds "Take a photo" — this also fixes the Passport
     Photo tab (its upload opened only the front camera; its own "Use camera" stays) and the Signature Maker.
  5. A reading started for one picture (or language) could be shown after another picture was chosen; the newest wins,
     and nothing is written into the tab after it is left.
  6. Copy and "Download .txt" with nothing read copied nothing and saved an empty file; both say there is no text yet.

- **`signature` (tab 125, 5 bugs; engines kept — docs/WASM-AUDIT.md 123; e2e 24 — was 15).**
  1. A window made narrower after signing (or a phone turned) cut the right part of the signature off the saved file:
     the strokes are scaled with the pad now.
  2. A new ink colour applied only to strokes drawn after it — a blue signature turned "Maroon" was saved blue; the
     colour is the whole signature's (and the custom colour box now does what the swatches do, also for a photo).
  3. The three handwriting fonts (113 KB) were fetched as the tab opened although the drawing pad needs none; they are
     fetched when "Type" is chosen (the lazy suite's allowance for the tab is gone).
  4. A photo of blank paper said "Nothing to save yet — sign first"; it says no ink was found and what to try.
  5. On phones the photo picker only opened the camera (the shared picker fix of the OCR tab): "Photograph your
     signature" beside a picker for a photo already taken. Also: the newest photo wins.

### Documents — PDF (20 Nov 2026 –)

- **`pdf-merge` (tab 126, 4 bugs; engine kept — MuPDF 1.28.6, docs/WASM-AUDIT.md 124; unit `tests/unit/pdfpages.test.mjs`
  30 — new, read back by MuPDF and by **pypdf** (`tests/lib/pdfpages_check.py`, `pip install pypdf`); e2e 17 — was 10;
  test PDFs `tests/lib/pdfannot.mjs`).**
  1. **Everything on the pages that is not page content was lost** — comments, highlights, stamps, web links, links
     between pages and form fields with what was typed into them (a filled form came out empty): MuPDF's `graftPage`
     copies no annotations. Now copied (the /P back-reference cut first), links made again with the pages renumbered,
     the form's fields added. The same routine had the same fault in Split and Organize (their entries).
  2. The outlines (bookmarks) of the files were lost; they are appended, pages renumbered.
  3. Fonts and images that pages share were copied again for every page (a graft per page): two files of 677 KB
     merged to 780 KB; with one graft map per file 675 KB.
  4. The same form merged twice would have had two fields of one name (they show the same value); the later one is
     renamed "foo (2)" and the tab says so.

- **`pdf-split` (tab 127, 4 bugs; engine kept — MuPDF, docs/WASM-AUDIT.md 124; unit `pdfpages.test.mjs` +7 for page lists;
  e2e 15 — was 8).**
  1. The parts lost every annotation, link, form field and outline entry (the page routine of Merge); a part is now
     made by MuPDF's `rearrangePages` on the file opened afresh — links between its pages renumbered, its outline
     entries kept, a filled form still a form.
  2. All parts were made at once: "Every page" of a long PDF held a copy of the document per page in memory; one at a
     time now.
  3. "Every N pages" was a slider of 1 – 50 (a 300-page PDF in parts of 100 could not be asked for); a box now, 0 or a
     fraction refused in words.
  4. Page lists typed with spaces only ("1 3 5"), other dashes (— −) or "1..3" were refused; they are read
     (`parseRanges`, also used by PDF → Images).

- **`pdf-organize` (tab 128, 4 bugs; engine kept — MuPDF, docs/WASM-AUDIT.md 124; e2e 15 — was 10).**
  1. The saved PDF lost every annotation, link, form field and outline entry (the page routine of Merge); it is made
     by MuPDF's `rearrangePages` now — a link follows the page it points to, the entry of a deleted page leaves the
     outline.
  2. A long PDF showed nothing until the picture of every page was drawn (80 pages: seconds of an empty card); the
     tiles appear at once and the pictures are drawn into them one by one.
  3. A PDF opened while the last one's pictures were still being drawn got the old document's pages mixed into its
     grid; the newest PDF wins.
  4. A scanned PDF lying on its side needed a click on every page: "Rotate all left / right".

- **`img2pdf` (tab 129, 3 bugs; engine kept — MuPDF; e2e 11 — was 9).**
  1. "Fit to image" laid every image out at 150 dpi, so a 300 dpi scan of an A4 page became a page twice the size
     of the paper; a file that states 150 dpi or more (MuPDF reads JFIF, PNG pHYs and EXIF) keeps its paper size, a
     photo (72 dpi stated, or nothing) stays at 150 dpi.
  2. Files come from a file dialog in its own order (Windows: the last one clicked first) and could only be moved one
     place at a time: "Sort by file name" (page-1, page-2 … page-10).
  3. The previews' object URLs were not released when the tab was left.

- **`pdf2img` (tab 130, 4 bugs; engine kept — MuPDF; unit `pdfpages` +3, e2e 10 — was 7).**
  1. A PDF opened during a conversion had its pages drawn under the old file's names (the loop read "the current file"
     at every page); a run keeps its own file, and a newer file ends it.
  2. A large page at 300 dpi (a 3000 pt poster: 12,500 px a side, 470 MB of pixels) could take the tab's memory; pages
     are drawn at most 16,384 px a side and 100 megapixels, and the tab names the pages drawn smaller.
  3. Names p1 … p12 sort as p1, p10, p11, p12, p2 by name; they are padded (p01 … p12) as the Doc Scanner's are.
  4. Leaving the tab during a conversion left it drawing pages; it stops.

- **`pdf-compress` (tab 131, 5 bugs; resizing → @jsquash/resize, docs/WASM-AUDIT.md 128; e2e 20 — was 15).**
  1. A PDF chosen while another was being compressed received the first one's result: its bytes were downloaded under
     the new file's name, with the new file's size in the "before → after" line. A run keeps its own file; a file
     chosen meanwhile ends it without a result.
  2. Leaving the tab during compression still downloaded the result afterwards; the run ends with the tab.
  3. An image with a colour-key mask (/Mask [min max …]: exact colours cut out) became a JPEG, whose colours are no
     longer exact — speckled holes; such images stay as they are.
  4. "Target size" turned anything under 20 KB into 20 without a word and read a KB as 1,024 bytes (a file just over
     an upload limit of 300,000 bytes could pass); a KB is 1,000 bytes now and under 20 is refused in words.
  5. "Scanned pages" drew a poster page at full size (the memory cap of PDF → Images applies now), and its warning did
     not say that links, bookmarks and form fields are lost too.

- **`pdf-sign` (tab 132, 6 bugs; engines kept — MuPDF, the canvas, imgproc; e2e 19 — was 12).**
  1. **The signature went on the page being looked at when saving**, not on the page it was put on: placed on page 1,
     saved while reading page 2 → page 2 signed. It belongs to its page now; elsewhere the tab says "Your signature is
     on page 1 — tap this page to move it here."
  2. A tap near the bottom edge put part of the signature, and the date under it, below the page; both are kept on
     the page (in the preview and, for pages of another shape with "every page", when saving).
  3. Strokes drawn before the pad got narrower (a smaller window, a phone turned) were cut off when more was drawn;
     they are scaled with the pad (about its middle).
  4. "Clear" did not stop a signature being made in the background (switching back to Draw remakes it): the cleared
     signature came back a moment later. Every newer stroke, text, photo or Clear wins.
  5. A typed name in a script font was drawn on a canvas with fixed margins (a swash could be cut); it is sized to the
     font's measured bounds — `typedSignature` in `signature.ts`, now also the Signature Maker's.
  6. A photo of blank paper said "Nothing to save yet — sign first"; "No ink was found in the photo …". The newest
     photo wins, and phones get a camera button beside a picker for a photo already taken.

- **`pdf-fill` (tab 133, 3 bugs; engine kept — MuPDF; unit `pdfpages` +1, e2e 17 — was 15).**
  1. A radio group with nothing chosen in the PDF showed its first option as chosen — and saved nothing; nothing is
     shown chosen until one is picked.
  2. "Type anywhere" invited "ticks ✓" but refused ✓ as "not Latin" (the old test typed a "v" instead); ✓ ✔ ✗ ✘ are
     drawn with ZapfDingbats (a standard PDF font) with a ToUnicode map, so that MuPDF, pypdf and poppler read them
     back as ✓ (without it MuPDF reads U+0013).
  3. A ₹ typed into a field is stored, but MuPDF draws fields with a built-in font of Latin, Greek and Cyrillic: the ₹
     comes out as a gap (also when flattened). Known limit, said in the tab after saving ("Rs." shows everywhere);
     giving the field an embedded Noto Sans did not change MuPDF's drawing (tried; 350 KB more). A ₹ in "type
     anywhere" text is refused with the same hint.

- **`pdf-unlock` (tab 134, 1 bug; MuPDF; unit `pdfpages` +1 — `signatureCount`; e2e 13 — was 12).**
  1. A digitally signed PDF (an e-Aadhaar is one — the tab's own example) was unlocked without a word, but the
     rewritten copy no longer proves the signature; the tab says so and to give the original where the signature
     matters (`signatureCount` in `src/lib/pdf.ts`: signature fields with a signature dictionary).
- **`pdf-protect` (tab 135, 2 bugs; MuPDF; e2e 17 — was 13).**
  1. The same for protecting a signed PDF.
  2. A password with ₹, an emoji or letters added to Unicode since 2003 is outside the tables the PDF standard's
     password preparation (SASLprep) uses: MuPDF and pypdf open the file (checked: accents, ₹, a space, "="), strict
     readers may not. The tab warns while such a password is typed.

- **`pdf2text` (tab 136, 4 bugs; MuPDF; e2e 11 — was 8).**
  1. A long PDF froze the tab while its text was made (every page at once, no word); page by page now, with progress,
     and a PDF chosen meanwhile wins.
  2. What was typed into a filled form was missing from the text (MuPDF's text leaves form widgets out); the values
     are listed under their page ("Form fields: Full name: Asha Rao …").
  3. "Keep the page layout (spacing, columns)" promised columns side by side; MuPDF's option keeps the spacing and the
     hyphens at line ends, nothing more — it is labelled so now.
  4. Copy and "Download .txt" of a PDF without text (a scan) copied nothing / saved an empty file; both say why.
  Also: two checks of the suite passed on an empty box (the text is made in the background now) — they wait for it.

- **`pdf-pagenum` (tab 137, 2 bugs; MuPDF; e2e 15 — was 11; `raceRun` / `makeLong` in `tests/lib/pdfannot.mjs`).**
  1. A PDF chosen while another was being numbered received the first one's pages under its own name (the run read
     "the current file" when saving); a run keeps its own file and a newer file ends it — `pageRun` in `src/tools/pdf.ts`,
     shared with the Watermark.
  2. Leaving the tab during a run still downloaded the result afterwards, and a long PDF froze the tab without a word;
     the run ends with the tab, shows "Page n of N…" and gives the page a breath every ten pages.
- **`pdf-watermark` (tab 138, 2 bugs; MuPDF; e2e 14 — was 10).**
  1. The same two, and worse: the page sizes were read from the PDF chosen meanwhile while the pages were stamped
     on the old one (a watermark placed for the wrong page size).
  2. As Page Numbers: the run ends with the tab; progress on long PDFs.

### Documents 2 — EPUB, sheets, Markdown, generators (20 Nov 2026 –)
- **`epub` (tab 139, 17 bugs; MuPDF + textcore's XY-cut + imgproc's ink regions; WASM-AUDIT 136; unit
  `tests/unit/pdf2epub.test.mjs` 64 (new: the engine in Node on its own engines, reading order held to poppler's
  `pdftotext` — `python3 scripts/make-epub-reference.py` — and to the generator's known order, epubcheck on the results);
  `xycut.test.mjs` 19 — was 11; e2e 48 — was 27; epubcheck 5.2.1 in both suites where installed; fixture
  `federal-register-3p.pdf`, public domain).** Found by a comparison on five real PDFs (WASM-AUDIT 136) and by reading:
  1. **Narrow gutters were not seen:** the XY-cut wanted 8 pt between columns; the Federal Register's are 7.5 pt, so
     its three columns were cut into rows and read across, line by line (55 % of the words in order → 94 %). The gutter
     is now 0.45 × the body text.
  2. **A stamp up the margin became "Column 1"** (arXiv's, the Federal Register's) and the real columns were numbered as
     one: text that runs up or down the page is kept apart (left out with the running headers, else a note at the end
     of the page), and the XY-cut numbers only real columns (three lines, a tenth of the page high; `minh`).
  3. **A line was as bold and as large as its first character** (MuPDF gives a line the font of its first span): a
     paragraph starting with "**Theorem 1.**" could become a heading, a drop cap made a line large. Spans are read
     (`preserve-spans`) and joined; a line takes the size and weight most of its characters have.
  4. **The running header and the page number came back as a picture:** once left out of the text, their ink counted
     as a figure (the Federal Register's header was a picture on every page).
  5. **A broken Unicode map made the page unreadable:** MuPDF passes U+FFFF through, which XML does not allow (Kindle,
     the preview and epubcheck refuse the page). Characters XML forbids and C1 controls are left out (`xmlText`).
  6. **One unreadable formula turned a whole column into a picture** (a line with U+FFFD — a maths font without a
     Unicode map): such lines are now pictures in their place; a column is a picture only when most of it is
     unreadable (GeoTopo: 3,561 → 3,773 words as text).
  7. **Body text was taken for headings** on a page that is mostly footnotes (the body size was the median, the
     footnotes' size; every body line was 1.18 × larger): the size of most characters, and more than three
     "heading" lines in a row are text.
  8. **The PDF's bookmarks were lost:** they are the contents now (nested; a bookmark of a page left out goes to the
     next page that is in), with a page list; the NCX gives bookmarks of one page one play order (epubcheck's rule).
  9. **Every EPUB said it was English:** the PDF's /Lang is used when it is a language tag (hyphenation and the
     dictionary on the Kindle follow it).
  10. **The tab froze during a conversion:** the text of all pages was read in one loop and pages without figures never
      paused (300 pages: 3.6 s without a frame); now a pause every 30 ms (longest gap 0.25 s) and progress for both
      passes ("Reading the text: page n of N…").
  11. **A conversion went on after another PDF was chosen** and its result came out under the new PDF's name (the name
      was read after the await); leaving the tab did not end it either. A conversion keeps its PDF and ends (`Stopped`)
      when a newer one is chosen or the tab is left.
  12. **The preview's pictures were never let go** (blob URLs): released with the next PDF, the next run and the tab.
  13. **Words made of i, v, x, l, c were page numbers** ("ill", "civil", "vivid" alone at the top or bottom of a page
      were removed): a page number must be a Roman numeral (xiv), digits, "Page n", "n of m" or "– n –".
  14. **Every page with a figure was drawn whole at up to 3 × the screen width** (Scribe: 5,580 × 7,221 px, 160 MB, to
      cut one figure out): MuPDF now draws just the figure at the size it is shown, within 32 megapixels; a figure
      across both columns is drawn as wide as the screen (it was drawn larger and shrunk).
  15. **A PDF without pages gave an EPUB with an empty spine** (not valid); refused in words. The summary said "1
      pages · 1 figures"; the file line "0 page".
  16. **A page whose text runs sideways** (/Rotate 90 over upright text, a table turned on the page) was read as columns
      of single words: the page is a picture.
  17. **The preview showed the lowest page numbers** instead of the first pages of the EPUB (a range like "5, 1-3").
  Also: the e2e suite's checks of responsiveness and of a newer PDF were run against the old code first (they fail
  there: 3.6 s, the old progress went on).
- **`sheet` (tab 140, 18 bugs; sheet.wasm rebuilt — calamine + rust_xlsxwriter + csv; WASM-AUDIT 137; unit
  `sheet.test.mjs` 120 — was 36 (every cell of five workbooks against **LibreOffice Calc**: `python3
  scripts/make-sheet-fixtures.py`, needs openpyxl and LibreOffice), new `sheetdata.test.mjs` 42; e2e 32 — was 17).**
  1. Excel's error values were written #DIV0, #NA, #NAME … (Debug text); now #DIV/0!, #N/A, #NAME? as Excel writes them.
  2. A duration past 24 hours was a time of day or a date: 30 hours showed 06:00:00, the 255:10:10 of base.xlsx
     "1900-01-10 15:10:10" — the hours now go on.
  3. Numbers showed their binary noise (0.1 + 0.2 = 0.30000000000000004) in the table, CSV and TSV; now 15 digits as
     Excel shows them (1E+21, 1.25E-7); booleans TRUE / FALSE in CSV too (they were "true").
  4. "Numbers stored as text → numbers" in .xlsx turned +91 phone numbers into 919876543210 and rounded 16 – 20 digit
     IDs; only what a double holds exactly becomes a number now (no +, no leading zero).
  5. JSON export: a repeated heading overwrote the column before it (Value, Value → one Value); cells beyond the
     header were dropped. Value, Value_2; the extra cells under their letters.
  6. JSON import rounded IDs of more than 15 digits (12345678901234567890 → …67000): kept as text (JSON.parse's source).
  7. CSV → JSON gave every number as a string: the option now also makes numeric columns numbers in JSON.
  8. A Windows-1252 CSV (what Excel on Windows saves) showed caf�; Excel's "Unicode Text" (UTF-16) was unreadable:
     decoded by its byte-order mark, as UTF-8 when valid, else Windows-1252 — said in the line under the table.
  9. The separator chosen for one file stuck to the next one; now each file is detected afresh (and the line says
     what was detected).
  10. The separator was guessed from character counts — a quoted comma in the header or a title line misled it; it
      is now guessed by reading the first 50 records as CSV with each candidate.
  11. "Excel" files that are web pages (bank statements) were shown as CSV garbage: their tables are read (colspan /
      rowspan on the grid, a layout table around them left out); Excel 2003 XML too (ss:Index, MergeAcross, types).
  12. A file that is not text (a PDF named .csv) was shown as garbage: refused in words.
  13. A filter over a big sheet looked up every shown row's number with indexOf (300,000 rows: seconds per key);
      numbers are kept while filtering, and a big sheet is filtered when the typing pauses.
  14. The newest file did not win: a big file chosen just before a small one replaced it when it finished.
  15. Excel's limits came out as Rust's error with 0-based coordinates ("cell 5,2: …"): now "Cell C6 of “x” holds 40000
      characters; an Excel cell holds at most 32,767", and the row / column limits likewise.
  16. Sheet names Excel refuses (the same name in another case, "History", an apostrophe at an end) failed the save or
      came out as SheetN silently: made unique and valid.
  17. Dates written as text (a CSV's 2026-11-20, an .xls → .xlsx copy) stayed text in the .xlsx: with the option they
      are Excel dates and times again.
  18. The sheet of a CSV was named "CSV" in the .xlsx: it is named after the file.
- **`markdown` (tab 141, 12 bugs; cmark-gfm; WASM-AUDIT 138; unit `markdown.test.mjs` 29 — was 26, one check runs the
  744 examples of the GFM spec files (`tests/fixtures/markdown/`, CC-BY-SA 4.0) and one 430 headings against
  github-slugger; e2e 46 — was 19).**
  1. **A footnote or a link to a heading took the app to its start page and the text was lost:** "#fn-1" in the
     address is no tab (hash routing). Links inside the document now scroll the preview pane; the address stays.
  2. **Ctrl+K in the editor** inserted a link and then the app's own Ctrl+K moved the focus to the search box: the
     app's shortcut leaves a key a tab has taken (`defaultPrevented`, src/main.ts).
  3. **Ctrl+P printed the whole app** (only the button switched to the preview); and the button dropped the print
     mode after one second, before a slow print preview (iOS) had read it. The browser's beforeprint / afterprint
     events switch it now, for every way of printing, and the tab removes them when it is left.
  4. **Pictures from other sites** were asked for, refused by the page's CSP (a security-policy violation each) and
     shown broken: the HTML is tidied in an inert document first; such a picture is a note with its description, and
     a line says why (the downloaded .html shows them).
  5. **The toolbar and the shortcuts could not be undone with Ctrl+Z** (setRangeText leaves no undo step): edits go
     through the browser's insertText.
  6. **A second press did not take formatting off:** Bold on bold text gave ****bold****, Heading on a heading
     "## ## Title", a numbered list numbered empty lines. Inline marks toggle (asterisk runs read as italic / bold),
     line formats come off when every line has them, another heading level is replaced, empty lines are skipped.
  7. **The word count counted the Markdown** (a link's address added words); it counts the rendered text, and an
     empty text has no "1 min read".
  8. **The .html's title** came from a regular expression on the source (a "# comment" in a code block won; a setext
     heading and closing #s were missed): the first rendered h1.
  9. **Links to headings went nowhere:** headings get GitHub's ids (in the preview with a prefix, in the .html as on
     GitHub).
  10. **A Windows-1252 .md showed U+FFFD**, CR LF stayed, and opening a file replaced the text with no way back: decoded
      as the CSV tab does, line ends LF, Ctrl+Z brings the text before back.
  11. **A file dropped on the editor was ignored** (the app keeps the browser from opening it in place of the page):
      it is opened.
  12. **A long document was rendered and counted on every key:** above 200,000 characters when the typing pauses.
- **`invoice` (tab 142, 7 bugs; MuPDF HTML + mathcore + zxing-wasm; WASM-AUDIT 139; e2e 29 — was 18; new unit
  `docgen.test.mjs` 19 for the three generators, rules in `src/lib/docrules.ts`).**
  1. **The UPI QR code wrote the UPI ID's @ as %40** — NPCI's linking specification keeps it as it is (the QR tab's
     rule since its hunt); the invoice now uses the QR tab's `upi()` (read back by zbar: `pa=shop@okaxis&…&am=1179.99`),
     and a code that cannot be made is said (it was left out without a word).
  2. A UPI ID that does not look like one was taken without a word: the QR tab's note under the box.
  3. A due date before the invoice date was printed without a word: said.
  4. **No link survived into any generated PDF** (the pages were drawn without them; MuPDF also read mailto: as a
     path): the business's e-mail is a mailto: link now — a fix in `htmlToPdf` for all three tabs.
  5. **The logo and the signature were lost through Save / Load details:** they go into the file (data: URLs).
  6. A download right after choosing a picture could be made without it (still being read): it waits.
  7. Leaving the tab while the preview waited still built a PDF afterwards: the tab's updates end with it.
- **`rent` (tab 143, 6 bugs; e2e 16 — was 9).**
  1. **Cash receipts ran onto empty pages:** with the revenue-stamp box three receipts did not fit an A4 page and each
     group of three spilled onto a second, empty page (60 receipts → 40 pages, every other one blank). Three a page
     when they fit, else two, else one — the same for a long address.
  2. **More than 36 months were cut off without a word:** up to 120 (ten years), beyond that refused in words.
  3. A last month before the first said "Choose the from and to months": it says what is wrong.
  4. No rent printed "₹ 0.00 (Rupees Zero Only)": refused ("Enter the monthly rent.").
  5. A PAN that is no PAN (five letters, four digits, a letter) was taken without a word: said.
  6. The signature image was lost through Save / Load details (as the invoice's pictures).
- **`resume` (tab 144, 6 bugs; e2e 12 — was 7).**
  1. **The e-mail address, the phone number and LinkedIn / GitHub were not links in the PDF:** mailto:, tel: and https:
     links (only those schemes; anything else stays text, quotes escaped — unit suite).
  2. **The photo was a PNG** (a photo as PNG is many times larger): JPEG, quality 85.
  3. A name with / or : gave a broken file name ("A/B-resume.pdf"): file names are made safe (`safeName`).
  4. **A download right after choosing the photo was saved without it** — the full run's flaky "photo included" was
     this race in the tab (the suite waited 600 ms): the download waits for the picture.
  5. The photo was lost through Save / Load details.
  6. Leaving the tab mid-update (as the invoice).

### Media › audio (20 Nov 2026 –)
- **`audio` (tab 145, 5 bugs; audio.wasm + mediabunny; WASM-AUDIT 142; e2e 23 — was 21; unit `audio.test.mjs` +2).**
  1. **Every file was decoded at the device's rate:** a plain AudioContext resamples while it decodes, so a 44.1 kHz
     file was shown as "48000 Hz" and its WAV / MP3 saved at 48 kHz. `decodeAudio` reads the file's rate (mediabunny,
     from the headers) and decodes at it (OfflineAudioContext): the trimmed WAV is now the file's own samples (the
     suite compares them sample for sample). Shared by the Noise Remover, Pitch & Speed, Speech to Text, Slideshow.
  2. The newest file (or recording) did not win: an older, slower decode replaced it.
  3. Microphone errors other than "denied" / "not found" came out as browser codes; a microphone in use by another
     program, one unplugged since it was chosen (the next try takes the default) and a blocked page are said in words.
  4. Nothing was left behind for a load that finished after the tab was left (guarded).
  5. Found by the full run: the recorder's pause check is timing-sensitive under a saturated machine (passes alone,
     twice) — recorded here, not changed.
- **`tts` (tab 146, 6 bugs; eSpeak + ONNX Runtime Web; WASM-AUDIT 143; e2e 16 — was 13).**
  1. **After Stop the Speak button stayed busy for good:** speak() waited for the worker's last word, which carried
     the stopped run's number and was ignored — Stop now ends the wait at once (found by the new "speak again after
     Stop" check; the old suite never pressed Speak after Stop).
  2. **A Speak during a run started a second run on the same ONNX session at once:** the worker queues runs; a
     cancelled one ends at its next sentence.
  3. **The sentence shown as being read was the one just made** — ahead of the sound when the voice is made faster
     than real time: each sentence is shown when it starts to play; Stop clears it.
  4. A system voice that failed (removed, busy) left Stop up and said nothing: said, buttons restored.
  5. A .txt from Notepad (Windows-1252) was read aloud with U+FFFD in it; UTF-16 too: decoded as the CSV tab does; a
     file that is not text is refused.
  6. The model download assumed Content-Length: a server that compresses the file (more bytes than announced)
     overflowed the buffer — it grows now.
- **`noise` (tab 147, 11 bugs; RNNoise 0.2 — now Jitsi's build — + audio.wasm; WASM-AUDIT 144; e2e 25 — was 12; unit
  `rnnoise.test.mjs` 26 — was 10, `audio.test.mjs` +4).** First found while checking the shared decoding: at strength
  0 % the result was no longer the input for files not at 48 kHz (resampled twice) — mixed at the file's rate now.
  1. **Our RNNoise was not the release's standard computation:** compiled without configure, it ran the network on the
     model's float weights — the release's debugging option — 0.12 dB off at the first frame, 2.4 dB at the worst,
     and four times the download. Replaced by Jitsi's build, which equals the native release frame for frame
     (`scripts/make-rnnoise-reference.sh`; the unit suite holds every frame to 0.02 dB and every voice probability to
     0.001).
  2. **Save right after choosing another file saved the previous file's sound under the new name** (the "ready" flag
     was not reset); Save now waits for the file just chosen.
  3. **Every move of the Strength slider cleaned the whole recording again** (minutes for a long one): the worker keeps
     the input and the cleaned sound, a new strength is only mixed (`a_mix2`); 50 % is the exact middle, 0 % the file.
  4. A new file kept the previous file's selection (2 – 5 s of the last file was applied to the next).
  5. The newest file did not win: an older, slower decode replaced it.
  6. A file chosen while a long one was being cleaned waited for the long one (the worker finished the stale job):
     the stale job is ended.
  7. The share of speech was read from the first channel only: a voice on the right channel of a stereo file was
     "speech in 0 %". Each 10 ms frame takes the larger voice probability of the channels.
  8. A failed download of the engine stayed failed until the tab was reopened (a rejected promise was kept).
  9. Save after a failed cleaning saved what the waveform held from before, or failed with a TypeError: refused with
     the reason.
  10. **16-bit WAV (every audio tab): a file opened and saved unchanged lost a step on every loud sample** (written ×32767,
      read back ÷32768; −32768 became −32767). Chromium reads 16-bit PCM as s ÷ 32767 above zero and s ÷ 32768 below,
      Firefox and Safari ÷ 32768 for both: the page finds the rule once (one sample decoded) and the writer inverts it —
      checked for all 65,536 values under both rules; the Recorder's and the Noise Remover's suites compare exactly.
  11. The waveform editor could draw an older sound's peaks over a newer sound when two were set at once (shared).
  - Under load: with three audio suites in one headless browser, Chromium's MediaRecorder sometimes ignored `pause()`
    (the WebM held 66 unbroken 60 ms packets, 3.9 s, for 2.6 s of recording; ffprobe). Never alone, never under four
    busy CPU loops; the harness's re-run alone covers it (`E2E_NO_RETRY=1` shows it).
- **`pitch` (tab 148, 8 bugs; Signalsmith Stretch replaces our WSOLA — WASM-AUDIT 145; e2e 18 — was 11; unit
  `audio.test.mjs` without the WSOLA cases).**
  1. **Music came out smeared:** WSOLA left −30 to −36 dB of stray energy around a chord (Signalsmith −37 to −47 dB).
  2. **Save right after choosing another file saved the previous file's result under the new name** ("ready" not reset).
  3. Every slider step during a processing queued a whole processing of its own (a long file took one per step): one
     rendering at a time now, the newest settings rendered after it.
  4. A selection was lost at every change; at another speed it now follows the same passage (× old ÷ new tempo).
  5. The newest file did not win.
  6. Save after a failed processing saved what was left on the waveform, or failed with a TypeError: refused with the
     reason.
  7. A file that is no sound emptied the status line while the open file stayed.
  8. A processing that ended after the tab was left still touched the page.
  - Found while writing it (not shipped): the coalescing promise (`busy ||= (async () => …)()`) cleared itself before
    the assignment when there was nothing to render and stayed settled for good — `await null` first; the suite's
    first slider check caught it.
- **`stt` (tab 149, 11 bugs; whisper.cpp 1.8.3, our build, stays — WASM-AUDIT 146; whisper.wasm rebuilt; e2e 19 — was 11).**
  1. **The names and terms stopped guiding the spelling after a minute or two:** whisper.cpp keeps the prompt at the head
     of its rolling context and pushes it out after ~224 tokens — at 83 s into a meeting "Zentrixa … Anvika
     Raghunathan" came out "Zentrixor … Amvika Raganathan". `carry_initial_prompt` keeps it in every window.
  2. **A new file left the previous transcript on screen:** its .txt / .srt / .vtt took the new file's name and its
     segments played the new file. A new file clears it.
  3. A new file chosen during a transcription let it run on, and its result appeared under the new file: it is ended.
  4. The newest file did not win; Transcribe could be pressed while a new file was being read (it transcribed the old).
  5. **Memory:** the page decoded at the file's rate and the worker resampled — an hour of 48 kHz stereo was 1.4 GB on
     the page. Decoded straight to 16 kHz now (`decodeAudio(blob, 16000)`), a third; the player keeps the file.
  6. A recording without speech showed an empty transcript and "0 segments": "no speech was found in this recording".
  7. **The model download wrote past its buffer** when a server sent more bytes than its HEAD announced (compression):
     the buffer grows (checked with a route that announces 1,000 bytes).
  8. A dropped connection said "Failed to fetch" / "network error": "Could not download … — check the connection";
     a stream cut halfway is "interrupted".
  9. A long hint was cut by Whisper (223 tokens, the end kept) without a word: a note from 60 words.
  10. Leaving while a file was being read made a blob URL after the tab was gone.
  11. The Settings note claimed nothing about long recordings; it now says the names guide the whole recording (true
      with 1; whisper.cpp drops prompts for the last 5 s — recorded in WASM-AUDIT 146).

Media › video (20 Nov 2026 –)
- **`video` (tab 150, 8 bugs; WebCodecs + mediabunny + @mediabunny/aac-encoder — WASM-AUDIT 147; e2e 30 — was 16).**
  1. **The sound of the MP4 was Opus where the browser has no AAC encoder (Linux Chromium, Firefox)** — "H.264, plays
     everywhere" with a sound many players drop. AAC by mediabunny's WebAssembly encoder (ffprobe reads it back).
  2. **A WebM's Vorbis was kept inside the MP4** (mediabunny allows it; few players play it) — the old check only looked
     at the box's name. Only AAC and MP3 are copied; the rest becomes AAC at its own bitrate (128 – 256 kbps).
  3. **"To a size" with a target above the file's size made the video bigger** (the bitrate followed the target): it
     never goes above the original's own bitrate, and the result says the video was already under.
  4. A target of 0 MB, a blank or a minus was taken as 1 MB without a word: refused.
  5. A new file chosen during a compression changed the file and the settings under it (its retry encoded the new
     file at the old bitrate): the running one is ended, a run keeps its own file.
  6. Cancel between the size mode's retries did nothing (the next try started).
  7. The newest file did not win; a file that is no video emptied the line of the one still open.
  8. The notes said "50.0 MB" for a target of 50 MB: the target as chosen.
- **`slideshow` (tab 151, 5 bugs; same engines — WASM-AUDIT 148; e2e 19 — was 15).**
  1. **The music was Opus inside the MP4** where the browser has no AAC encoder: AAC (ffprobe), and the result says it.
  2. **A photo removed while the video was being made failed it** (its closed bitmap was drawn): photos are let go
     after the video.
  3. **Settings and photos changed during the making were read live** — a shape changed halfway drew the rest of the
     frames for another shape, a photo added or moved jumped in: a video is made from a copy taken when it starts.
  4. The newest music did not win (a slower file chosen first replaced it); a file without sound was accepted.
  5. A video that finished after the tab was left still touched the page.
- **`ffmpeg` (tab 152, 5 bugs; ffmpeg.wasm stays — WASM-AUDIT 149 with the libav.js check; e2e +3 checks).**
  1. **A new file chosen during a job left the job running:** the new file's probe reset the job's log (a failure then
     showed the probe's lines) and the outputs took the new file's name. The job is ended ("Stopped: a new file was
     chosen"); outputs are named after the file the job ran on.
  2. A second file or added clips probed during a job did the same: probes wait for the job.
  3. Stop showed "called FFmpeg.terminate()" in red besides "Stopped": "Stopped." and no error.
  4. A job ended by leaving the tab raised an error toast on the next page.
  5. A zip of several outputs was named after the file chosen last.
- **`screencast` (tab 153, 4 bugs; e2e +4 checks).**
  1. **The sound of an MP4 recording was Opus on Linux Chromium** (its recorder has no AAC): re-encoded to AAC as the
     recording is finished, the picture copied (ffprobe reads AAC).
  2. **A second press of Start during the countdown started a second recorder** (both wrote into one file): disabled.
  3. Sharing ended during the countdown: the recording then started on nothing (TypeError) — said, and the next Start
     asks again.
  4. Leaving the tab during the countdown started a recording on a tab that was gone.
- **`screenshot` (tab 154, 4 bugs; e2e +4 checks).**
  1. **Every shot left a copy of the shared screen running** (a cloned track never stopped): after "Stop sharing" the
     screen stayed shared. Each copy is stopped (the suite counts them).
  2. **Every shot of a visit was kept as raw pixels** (33 MB a 4K shot, no limit): shots not shown are kept as lossless
     PNG and decoded again when opened (pixel for pixel the same file saved).
  3. Sharing stopped during the countdown: "Could not capture: Cannot read properties of null" — said in words.
  4. Another share could be started during the countdown (the shot then had no picture): disabled.
- **`youtube` (tab 155, 6 bugs; unit `ytclip.test.mjs` 41 — new; e2e +2 checks).**
  1. **A link to another video after the player was loaded kept the old player:** "Record clip" recorded the old
     video for the new times. The player goes and is loaded again; other times of the same video keep it.
  2. Editing the link during a recording changed where it stopped and its file name: a recording keeps its clip.
  3. "Record clip" could be pressed again during a recording (a second share and recorder).
  4. The sound of the MP4 was Opus on Linux Chromium: AAC (as Screencast).
  5. Times were written "0:60" (59.996 s): rounded first.
  6. "1:60" was read as two minutes: seconds and minutes above 59 are refused.
- **`ffmpeg`, once more (the solo run of its suite, 70 / 71).** The note "Stopped: a new file was chosen (…)" showed for a
  moment only: the new file's probe started FFmpeg again, and the loader cleared the status line when it was ready. It
  now clears only its own words. (The "reverse" check that failed in the loaded run of six suites passes alone.)
- **Test fix, `slideshow`:** "the music chosen last stays" read the first card whose text holds "music" — the photos card,
  whose summary line says "music 0:02" — so it never saw the Music card: the locator is the card titled "Music", polled.

### Software › terminal (20 Nov 2026)
- **`terminal` (tab 156, 3 bugs; BusyBox 1.38.0 stays — WASM-AUDIT 153; v86 left out by the owner; e2e +2 checks).**
  1. **A crashed shell left the terminal dead:** its worker ran out of memory (a huge `yes | head`) and every later
     command waited for ever. The worker is started again with a line that says so (the files of the old one are gone).
  2. The file panel said "File error (44)": its errors in words ("no such file or folder (removed or renamed meanwhile?)",
     "not a folder", "already there" …).
  3. Ctrl+C while a command runs did nothing, without a word: the status line says a running command cannot be
     interrupted in a browser tab (the page has no way into a synchronous WebAssembly call without shared memory,
     which GitHub Pages cannot enable) and stops by itself after 60 s.

### Everyday (20 Nov 2026) — stopwatch, countdown, pomodoro, interval, dice, coin, rng, picker, teams
- **The timers (tabs 157 – 160; no engine — the browser's clocks and Web Audio, WASM-AUDIT 154).** Shared engine in
  `src/tools/everyday.ts`: `timerNow()`, `runner()`, `wakeLock()`, `unlockAudio()`.
  1. **The alarm rang only when the tab was looked at:** Countdown, Pomodoro and Interval moved on in animation frames,
     which a background tab never draws. Now one timeout per planned end, all set at Start (a timeout set by a timeout
     is "chained" — Chrome runs those once a minute after five minutes in the background), a 1 s interval, and the
     moment the tab is shown. The suite switches frames and our interval off and the alarm still comes on time.
  2. **Pomodoro / Interval drifted:** a step began when the end of the step before was *noticed*. Back in the tab after a
     while away, the break started only then. Steps now end at their planned times; after a sleep, one beep for the last.
  3. **A laptop's sleep was left out** (performance.now() — and the browser's timeouts — stand still during sleep on macOS
     and Linux): a 25-minute timer rang 25 awake minutes later, a stopwatch left the night out. `timerNow()` counts the
     wall clock running ahead by more than a second as sleep (a clock set back changes nothing).
  4. **The screen wake lock was never asked for again** after the tab had been hidden (the browser lets it go then) —
     the screen went dark for the rest of the run; a lock arriving after a quick Start → Pause was kept.
  5. The alarm's audio was opened by the alarm itself — from a timer, where Safari plays no sound: it is opened in the
     Start tap. It was never closed: closed when the tab is left.
  6. **A setting changed during a run stopped the timer and went back to step 1** (a break made longer during a focus lost
     the focus, silently). The step being timed now stays with the time spent in it; one made shorter than that ends
     now; a step that no longer exists gives way to the one at its place; a timer not started shows the new plan.
  7. Countdown: more than 24.8 days overflowed the browser's timeout (it fires at once): at most 99:59:59, said.
  8. The end-of-run alarm sounded over the last step's beeps (990 Hz and 880 Hz at once): it follows them.
  9. Stopwatch: Lap pressed twice while stopped added a lap of 00:00.00.
  10. The tab's title stood still in the background (Countdown); Pomodoro and Interval show time and step there too.
  11. Interval: "Get ready" could not be changed (10 s always): a slider, 0 – 60 s (0 leaves the step out).
- **`dice`, `coin` (161, 162; engine → libsodium.js, WASM-AUDIT 155).** Coin: a side that came up again showed nothing
  happening (the CSS class was put back unchanged, so the spin did not run) — the spin is restarted every flip. Coin
  fetches its engine with the first flip; Dice rolls at open.
- **`rng` (163, 4 bugs).** Ranges above 2³² said "Range too large" (ten-digit numbers): up to 2⁵³ now, 53 random bits
  drawn again when they fall in the incomplete block; numbers beyond 2⁵³ − 1 (which a double cannot hold exactly) are
  refused; an empty Min or Max was read as 0; "1.2 to 1.8" said "Max must be ≥ min" — "There is no whole number…".
- **`picker` (164, 1 bug).** "How many" 1.5 picked one item but numbered it "1.".
- **`teams` (165, 2 bugs).** "Sharma, Rahul" on its own line became two people (every comma split): once there is more
  than one line, a line is one name. A team count of 0 or an empty box made 2 teams silently: asked for.

### Device (20 Nov 2026) — webcam, mic, speaker, keyboard, pixels, touch, screen, level, compass, soundmeter, ruler
- **`webcam`, `mic`, `soundmeter` (166, 167, 175; one gate per tab, `mediaGate` in `src/tools/device.ts`).**
  1. **Two requests while the browser was still asking left the first stream running** (Start and a resolution, Start
     and Record, a device chosen) — and a stream that arrived after the tab was left was never stopped: the camera light
     stayed on. The newest request wins; a late stream is stopped at once (`_media.mjs` got `__gumDelay` to show it).
  2. Microphone: Record pressed twice ran two recordings; a recording that ended after the tab was left played anyway;
     its object URLs were never freed.
  3. A camera / microphone busy in another app, or gone, said the browser's bare error: in words; one that stops by
     itself (unplugged) is said.
  4. The audio engine was opened after the permission question — Safari keeps it suspended then (no meter): opened in
     the tap.
  5. Sound Meter: the "avg" was the mean of the dB values (71 dB for a quiet and a loud second): the energy average
     (Leq, 78 dB), as sound level meters give it; a new calibration offset left min / avg / max at the old one.
- **`speaker` (168, 3 bugs).** Stop cut the tone off (a click) — 20 ms fade; the sweep started and ended with a click;
  Stop left the voice speaking.
- **`keyboard` (169, 3 bugs).** Delete, Home, End, Page Up / Down, Insert, Print Screen, Scroll Lock, Pause and the number
  pad were not drawn (a laptop's Delete key could not be checked); keys on no drawing (the ISO key, F13 …) are named; a key
  held while the window lost the focus (Alt+Tab) showed as stuck.
- **`touch` (171, 1 bug).** The line kept "1 touch" after the finger lifted.
- **`screen` (172, 4 bugs; unit `sensors.test.mjs`).** "Windows 15.0.0" on Windows 11 (client hints number Windows
  their own way: 13 and above is 11); WebGPU "Available" wherever `navigator.gpu` existed, also without an adapter; the
  refresh rate counted from before the first frame ("~59 Hz" on 60 Hz screens) — the median gap of the frames' own time
  stamps; every resize started another 60-frame measurement and the sizes shown were those of its start.
- **`level` (173, 3 bugs).** In landscape the bubble ran along the wrong axis (the tilt is now turned by the screen's
  rotation, `screenTilt`); the two numbers were not named; Start twice showed the no-sensor warning twice.
- **`compass` (174, 5 bugs).** 360 − alpha is right only for a phone lying flat in portrait: held upright it ignored gamma
  (330° shown for 310°), in landscape it was 90° off. `headingOf` works it out from the whole orientation — the screen's
  top, or the back camera's direction when upright — held in the unit suite to geometry and to the W3C spec's own
  example function. iPhone: + window.orientation in landscape; Safari's heading is magnetic north (caniuse's notes on
  `webkitCompassHeading`) — the tab said "true north". The no-data warning twice (as Level).
- **`pixels`, `ruler` (170, 176):** reviewed, nothing found.

### App shell (20 Nov 2026)
- **2 bugs; e2e `shell` +2 checks (68).**
  1. **Touch targets under 44 px on phones** (the owner's rule): the search box was 40 px tall, the category tabs 36,
     the tool tabs 34, the tool page's star 42, a card's star 32. The search box is 44 px on phones; the tabs and the
     cards' stars take taps over 44 px through an invisible hit area that reaches into the row's padding (the pills and
     the rows keep their size: a pseudo-element placed from inside the 1 px border, so 6 px of inset is 5 beyond the
     pill); the tool page's star is 44 px. The suite measures each hit area with `elementFromPoint`.
  2. **The phone's search box said "Search 170+ tools…"** — a phone offers 112 (PC-only tools are not shown there):
     the placeholder counts the tools this device can open (also on PCs, with the "/" hint).

### Cross-cutting sweeps (20 Nov 2026) — every tab at once, after the per-tab pass
The owner asked for more thoroughness: checks that look at every tab the same way, catching what one suite per tab
cannot. Three new suites; each fails on the build before its fixes.
- **`tests/e2e/touch-targets.e2e.mjs`** (new; the CSS named it but it did not exist) — every tab a phone offers, as it
  opens: the hit area of every visible control (buttons, links, selects, text boxes, switches, chips, fold-outs, tabs,
  radios) measured with `elementFromPoint` from its centre, each scrolled to the middle first; ≥ 44 × 44 px; sliders
  ≥ 44 px tall; no sideways scroll. Found: the "Microphone options" / "Or record with the microphone" fold-outs of
  Audio Recorder, Speech to Text and Noise Remover at 34 px (their own rule beat the phone rule).
- **`tests/e2e/a11y.e2e.mjs`** (new) — axe-core 4.14 (Deque's checker, test-only devDependency) with the WCAG 2.0 / 2.1
  / 2.2 A and AA rules on every page: desktop light and dark (173 pages each), phone dark (113). Found and fixed:
  1. **Field hints at 3.1 : 1** (WCAG asks 4.5 : 1 of small text) on 20 tabs, also in the dark theme (4.2 : 1): a `--hint`
     colour per theme (5.0 / 5.3 : 1); `--faint` stays for icons and graphics.
  2. **Passport's background chips white in the dark theme** with the theme's light text (1.2 : 1): they used `--card`,
     never defined. New unit `tests/unit/css-vars.test.mjs`: every custom property used is defined; every light colour
     token has a dark value. Two more undefined variables found by it (a hover colour, the code panes' background).
  3. **Markdown:** cmark-gfm writes a fenced block's language as `<pre lang="js">` (GitHub's way) — `lang` names the
     human language, so a screen reader switched its voice to "js": it becomes `class="language-js"` (preview and
     .html). Task-list checkboxes had no names.
  4. Selects without names (Mock Data's types, Markdown Table's alignments); `select()` takes a label now.
  5. Periodic Table: the names did not contain the visible "2 He" (WCAG 2.5.3, voice control); Bitwise: "A bit 0" →
     "A bit 0: 1".
  6. GST Invoice / Rent / Resume: `aria-label` on a plain div (a region now) and a preview that scrolls beside the form
     but could not take the keyboard's focus.
  7. Python and bc output: `aria-label` on a `<pre>` without a role (a log now); the recorder's level meter without a
     value; the calculator's DEG / RAD toggle 22 px tall (WCAG 2.2: 24).
- **FFmpeg, found by its solo runs (tab 152, 2 more bugs).** Stop — or a new file — while FFmpeg was still loading
  ended nothing: the job went on after the load and ran to the end. Each job now has a token that Stop and a new file
  take away, checked after every step; the worker is ended only inside a command. And a new file during a command: its
  probe loads a new FFmpeg, whose loader wrote over the "Stopped: a new file was chosen" note and cleared it. A script
  checked all four orders; the suite has checks for both.
- **Second look at the tabs where the first pass found nothing:**
  1. **Dead Pixel Test on an iPhone** (Safari makes only videos full screen): the hint said "Esc to exit" and taps went
     round for ever — the panel could be left only with Back. Without full screen a tap on the last colour ends the
     test. The resting mouse pointer hid pixels: it hides after 1.5 s.
  2. **Ruler:** a calibrated ruler grew and shrank with the browser's zoom (a CSS pixel changes size): it keeps its size
     in device pixels (a 2× zoom emulated through DevTools in the suite) and says so.
  3. **Dice:** a screen reader heard nothing after Roll: the roll in words, announced. Random Number, List Picker and
     Team Splitter announce their results too.
- **`tests/e2e/junk-files.e2e.mjs`** (new) — every tab with a file picker (71) is given an empty file and 2 KB of random
  bytes named like the file it asks for (photo.jpg, doc.pdf, data.csv …): no tab may throw. Found and fixed:
  1. **Ten text tabs read files with `File.text()`** (Python, Patch, Log Viewer, YAML, jq, SQL Formatter, Code Formatter,
     JSON → Types, JSON Diff, JSON Schema): a binary file went into the editor as garbage, and a file saved by Notepad or
     Excel in Windows-1252 turned "café" into "caf�". New `src/lib/textfile.ts` (`textOf` / `readTextFile`: UTF-16 by
     its mark, UTF-8 when valid, else Windows-1252; NUL bytes → "photo.jpg is not a text file — …"), shared with the
     CSV tab; unit `textfile.test.mjs` (11).
  2. **QR & Barcode Scanner:** a file that is no picture came back from zxing as one failed result and was listed as an
     empty code with a Copy button — said now ("… is not a picture this browser can read").
  3. **FFmpeg:** a file with no video, sound or subtitles was found out only when a job failed — said as it is read,
     with FFmpeg's reason.
- **Probes over every tab (scripts, not suites — they found nothing to fix):** a 360 px phone (no sideways scroll on
  any tab); every tab left 40 ms after it opens, 173 times in a row (no error, no worker left behind); the keyboard's
  focus on every control of every desktop tab (each Tab stop looks different from the same control unfocused — the
  boxes with a unit beside them draw their ring on the wrapper; the calendar button inside a date box gets Chromium's
  own ring, which a page cannot restyle).
- **Half a megabyte pasted into the text box of every tab** (probe: the longest task the page runs afterwards):
  1. **Rent Receipt froze for over 40 s**: every receipt repeats the address, and MuPDF laid the pasted text out on the
     main thread again and again. Every box of the GST Invoice, Rent Receipt and Resume Builder has a length now (200
     characters a line, 2,000 a text area, 500 an address, 400 the resume's links), said under the box when it is
     reached; a details file is cut the same way (never inside an emoji: `cutText` in `src/lib/docrules.ts`), and the
     rows (items, jobs …) stop at 100 — a file with more keeps the first 100 and says so. Rent e2e +3, invoice +4,
     docgen unit +6.
  2. **Morse Code crashed** ("Maximum call stack size exceeded", nothing shown): the result's letter groups went into
     the box with one spread call. It shows the first 20,000 characters, cut between two groups and said; Copy gives
     all. Play set up every tone before the first sounded (days of sound for a book): it plays the first hour, and
     lengths read in hours ("1234 min 5 s" before). e2e +7, unit +5.
  3. **Unicode Inspector held the page 2.6 s on every keystroke** (dozens of regular expressions a character): each
     different character is looked up once; a text over 200,000 characters waits for a pause in the typing. e2e +2.
  Not ours: a real paste of that size is slow in Chromium itself — `insertText` of 100 KB into a bare text box in an
  empty page takes 5 s (quadratic), so the probe sets the value and measures what the tab does with it.
- **100 KB pasted into every one-line box of every tab** (the same probe):
  1. **Mock Data froze** (over 40 s): a 100 KB field name made 8 MB of JSON with 100 KB lines, which the output box
     could not lay out. Names take 64 characters (PostgreSQL 63, MySQL 64), the table name 128, a list to pick from
     2,000; the box shows the first 10 lakh characters (cut at a line, said) and Copy and Download give all of it —
     even a legitimate 2 MB result (1,000 rows of long text) took 50 s to show before. e2e +3.
  2. **Markdown Table:** every keystroke in a cell measured every cell's width again — 450 ms a key in a 5,000-row
     sheet with Hindi text and emoji, then a 2.1 s task. Widths are remembered; a big table's Markdown follows when
     the typing pauses (Download lays it out first). e2e +2.
- **Every phone tab with the phone turned sideways** (844 × 390): no sideways scroll, no bottom bar taller than a third
  of the screen — nothing to fix.
- **What a tab keeps after it is left:** a result shown from a blob URL keeps its file in memory until that URL is let
  go — for good, if the tab never does it. Every tab that makes them was read: **PDF → Images kept every page's
  picture** after the tab was left (its cleanup ended the run but not the result list). The harness now records
  every blob URL each page makes and lets go, with the tab it was made on (`released(page, id)` in `tests/e2e.mjs`;
  downloads' own URLs, let go 30 s after the click, and zip.js's worker code are not counted), and the suites of the
  sixteen tabs that make them check it on leaving: pdf2img, video, slideshow, screencast, youtube, heic, batch,
  img2pdf, scanner, mic, formphoto, watermark, epub, graphviz, stt, pdf-sign.
- **Every tab with its engine's download refused** (a dropped connection: .wasm, vendor/, models/, data/ and fonts) —
  new suite `tests/e2e/engine-download.e2e.mjs`. Twelve tabs that start their engine as they open (JSON, Base64, JWT,
  XML, JSON → Types, JSON Diff, SQL Formatter, Terminal, JSON Schema, Base Encoder, Binary Decoder, QR Generator) left
  the failure uncaught: a page error, and a tab that did nothing without a word. Resume Builder printed Emscripten's
  "Aborted(both async and sync fetching of the wasm failed). Build with -sASSERTIONS for more info." The shell now
  catches a download failure nothing else caught and says it on the tab once, with "Try again" (a reload — a failed
  module stays failed for the page); `errMsg` words Emscripten's abort as the failed download it is. The other tabs
  already said it (the shell's "Could not load this tool", or their own line: Word Counter, Case, Diff, jq, Graphviz…).
- **Spreading a big list into one call** (the Morse crash, searched for in all the code): `push(...x)` and
  `Math.max(...x)` overflow V8's call stack past about 150,000 items. Three places could get there: **Create Zip** (a
  folder of 150,000 files — a project with node_modules — was never added; the first 500 are listed now, the rest
  counted), **Extract Archive** ("Save all to a folder" on an archive with 150,000 files in one folder; the walk keeps one
  list — `src/lib/fswalk.ts`, unit-tested with a folder of 1,000,000 files) and **Markdown Table** (a 160,000-row CSV).
  The other spreads are over bounded lists (1,000 regex matches, a dozen diff rows, dice, devices, chosen PDFs).
- **Reduced motion** (the reader's system setting): the dice still spun in, toasts slid up, transitions slid and the
  Markdown preview and the Photo Dictionary scrolled smoothly. All stop under `prefers-reduced-motion`; the busy
  spinners and the indeterminate bar keep turning (they say "working"), more slowly. Dice e2e +1.
- **Other time zones** (the suites are written in UTC; the owner lives in IST): the harness takes `E2E_TZ=<zone>`; the
  36 suites of tabs with dates and times (Date Calculator, Due Date, Epoch, Countdown, Pomodoro, Interval, Stopwatch,
  Time Zone, Sleep, EMI, SIP, FD, PPF, EPF, NPS, Prepayment, GST Invoice, Rent, Resume, cron, jq, JWT, X.509, EXIF,
  Python, SQLite, CSV / Excel, Log Viewer, Mock Data, TOTP, UUID, Create Zip, the calculator …) passed in
  Asia/Kolkata and in America/Los_Angeles: 1,426 / 1,426 checks each — nothing to fix.
- **A 120-character file name without spaces** in every phone tab's file picker (a real photo, PDF, MP3, MP4, CSV, JSON
  or text file under that name): nothing wider than the screen, no errors — nothing to fix.
- **Timers left running after a tab is left** (probe: every tab opened, its main button pressed, then left; intervals,
  timeouts of 2 s and more, animation-frame loops still going): nothing but Screen Info's 3 s race against a WebGPU
  adapter that never answers (a one-shot that does nothing once the tab is gone) — nothing to fix.
- **Static checks over all the code (nothing to fix):** every listener a tab adds to `window` / `document` (keys,
  paste, resize, orientation, print, messages, visibility) is removed by its cleanup, and every tab using the shared
  image picker disposes it; every worker is tracked (`trackWorker`) or ended by its tab (the terminal); browser
  storage is read and written inside try/catch; the only HTML written from data is zint's SVG (it escapes the text:
  a Code 128 of `a<b>&c <img …>` shows as text) and Mermaid's (its strict mode sanitises), and the CSP forbids inline
  scripts anyway.
- **Unit suites after all this:** 21,756 / 21,756 assertions in 101 suites.
- **Favorites:** site data cleared in another browser tab left the stars here (the storage listener looked only at the
  favorites key); shell e2e +1.
- **The complete e2e run** (on the build before these sweeps): 6,537 / 6,540 checks in 190 suites. Three checks failed
  twice: PDF Protect's and PDF Unlock's notes about a signed PDF and the Everyday smoke suite's coin were read once,
  at once, after the action — races of the tests under load, which wait now. FFmpeg: the Stop check pressed Stop 1.5 s
  after Run, but "Clean up a grainy video" takes 1.6 s on a warm engine — Stop was gone; the check now waits until
  FFmpeg is working (on the longer Stabilise job).
- **The complete e2e run on the new build:** 6,596 / 6,597 checks in 192 suites. Two checks failed under load and passed
  when run again alone (a timing check of the Python tab's output, a tone still playing after 2 s). One failed twice:
- **FFmpeg after a long session — a fault of the test browser, not of the tab.** At "Stop while FFmpeg loads", after
  about 60 jobs on one FFmpeg, Stop ending a command and Run starting a new FFmpeg, the page crashed: Chromium's
  renderer received signal 11 (SEGV_ACCERR) inside its own compiled code, at the same offset every time — 4 runs of 4
  with Playwright's headless shell (Chrome for Testing 153.0.8010.12; read with `DEBUG=pw:browser
  E2E_CHROME_ARGS="--enable-logging=stderr --v=0"`). A page's JavaScript and WebAssembly cannot make the browser
  segfault. Not in short sessions (10 Stop / reload cycles; 10 warm-up jobs and 4 rounds); a 2 s pause before the new
  FFmpeg did not help (reverted). **The full Chromium build** (`E2E_CHANNEL=chromium`, new headless mode, close to
  Chrome) runs the same long session without a crash: 72 / 72 with `E2E_FF_SAME_PAGE=1` (the Stop checks on the long
  session's page). Its one failure before was the check's fixed 12 s: after the long session the new FFmpeg took
  longer to load — the check now waits up to 60 s for "Stopped." and watches 5 s more for any output or "Working"
  (stronger: a job going on after the load would now be seen). The suite runs its Stop checks on a fresh page in the
  headless shell (72 / 72); the checks are the same.
- **So the complete e2e run is green**: 192 suites, every check passing (the two load flakes pass alone).
- **Complete unit suites** after all this: 21,731 assertions in 99 suites, all green.
- **YouTube Clip — found by the owner (20 Nov 2026).** The yt-dlp command the tab writes failed on the owner's Kubuntu
  with "HTTP error 403 Forbidden": Ubuntu's apt yt-dlp (2026.03.17, eight months old) and no JavaScript runtime
  ("No supported JavaScript runtime could be found … YouTube extraction without a JS runtime has been deprecated"). Since
  November 2025 yt-dlp needs Deno (or Node 22+ / QuickJS with `--js-runtimes`) for YouTube, and YouTube refuses old
  versions — the tab said neither. Now: what each system needs under the download button (`needsHint` in
  `src/lib/ytdlp.ts`) and what the two messages mean beside the command (`TROUBLE_403`). ytdlp unit +8, youtube e2e +2;
  the command itself was right and is unchanged.
- **Ubuntu 26.04's sha256sum — found by GitHub's build machine (20 Nov 2026).** The Pages build stopped at one unit check
  ("a backslash in a name is escaped as sha256sum expects"): GitHub's `ubuntu-latest` is now Ubuntu 26.04, whose
  `sha256sum` is uutils coreutils 0.10.0 (the Rust rewrite). It writes GNU's escaped line for a name with a backslash
  (`\<hash>  back\\slash.txt`) but cannot read one, not even its own ("no properly formatted checksum lines found" —
  checked with the package from the Ubuntu archive). BusyBox's `sha256sum`, the Terminal tab's, cannot either: a list
  from the Hash tab with such a name could not be checked in our own Terminal (it found neither the checksum nor the
  file). GNU reads a line without the leading backslash literally, so the Hash tab now writes such a name as it is and
  escapes only a line break, which cannot go on a line any other way. hash unit +7: the list checked by the installed
  `sha256sum`, whichever it is (the check names it); the Terminal's BusyBox checks it; a line break escaped exactly as
  `sha256sum` writes it (GNU's `-c` checks it — uutils reads no escaped line at all). Run with uutils 0.10.0 in front on
  the PATH: green. Unit suites: 21,763 / 21,763.
- **OCR camera — owner request (20 Nov 2026).** "Take a photo with the camera if it's on the phone, or with the webcam if
  it's on the PC": the PC had no camera at all, phones only the native camera input. Now one live view for both
  (`liveCamera` in `src/lib/livecam.ts`, shared): the back camera / the webcam, Switch (front camera; another webcam),
  Snap, Cancel. Found while building it, in the patterns other camera tabs use: a camera that answers after the person
  moved on (a file chosen, the tab left, the permission question still open) must be stopped at once; the live view's
  top slid under the sticky tab rows and its buttons below a phone's fixed bar (`scrollIntoView` knows neither —
  `reveal()` in `src/ui.ts`); on a 390 px phone Snap / Switch camera / Cancel wrapped (Switch is the camera symbol
  there, Snap the wide button). OCR e2e 24 → 56: a stand-in camera shows a sentence and what Snap takes is read
  (two webcams, each its own sentence; the phone's back and front camera), constraints, tracks stopped after Snap /
  Cancel / a file / leaving / a late answer / a camera that stops by itself, refusals in words, layout on the phone.
- **Camera in every tab that takes a picture — owner request (20 Nov 2026).** "In all apps that offer to upload an image,
  also add the option of taking a photo …": the camera is built into the shared pickers (`imageInput`, and `imagePicker`
  for tabs that read files) — 25 pickers in 20 tabs (CLAUDE.md §3 "Camera in every tab that takes a picture"). Found
  on the way: a camera left open in a box that another mode hides would run on unseen (now a ResizeObserver closes it);
  two cameras of one tab could both be open (one at a time now — an iPhone cannot hold two); a phone tab's fixed
  action bar covered Snap (it steps aside while a camera is open); the phones' native camera inputs (Doc Scanner,
  Signature Maker, Sign PDF) only worked on phones and left the page — replaced. New sweep `camera.e2e.mjs` (36): the
  camera beside every picture picker on PC and phone (a new picker without one fails), the snapped photo reaching
  every tab, several photos, modes, leaving; the OCR suite's test of a file chosen during the camera had a race of its
  own (fixed: it waits for the file's picture). The affected suites' run: 30 suites, 1,124 / 1,130 — six suites
  (Background Remover, Cartoonizer, Blur & Redact, Invoice, Rent, Resume) read "the first polite live region" as the
  tab's status line and found the camera's, which now comes first on the page: the camera's line is `role="status"`
  (the same announcement), and the six pass (267 / 267 with camera, OCR and a11y). FFmpeg 72 / 72, lazy, a11y, touch
  targets, junk files, no-external, engine-download, shell: green. Unit suites: 21,757 / 21,757.
  **Then (owner, 21 Nov 2026): "i can't see the take a photo thingie for ffmpeg … and yes, also add it for exif too".**
  FFmpeg's webcam was only in the picture box of three tasks, which shows after a video is chosen — now also beside the
  main picker (the snapped photo is the file to work on); EXIF / Photo Info has the camera and says what a photo taken
  in the browser carries (nothing). The sweep's EXEMPT list is down to the SVG Optimizer; camera 38 / 38, EXIF 33 / 33.
- **PDF → EPUB, the owner's test PDFs (21 Nov 2026).** The owner's rule: what stands side by side is read one after
  another, each piece under "Page N, part K"; then the strict rule for pictures (none dropped, each kept exactly, no OCR
  of any sort). Five pairs the owner made with the old tab (AJUR_January_2016p5, 2611.25554v1, another_one, test_1,
  test_2 — kept in the session's scratchpad `epub-owner/`) were converted and read page by page against the original.
  Found and fixed (each with a unit check, `pdf2epub.test.mjs` 64 → 94, `xycut.test.mjs` 19 → 33, e2e 48 → 52):
  columns labelled instead of laid out as parts; tables in an arXiv paper read cell by cell as columns; a table cut by
  the page; a plot's frame taken for a table; a "table" across both columns from a line of the other column beside a
  formula's pieces (test_2 pp. 5, 7 — the columns then read row by row); a contents page whose page numbers became
  columns of their own and whose short rows became a table (test_2 p. 1, another_one p. 7); display equations in pieces
  (numerator / denominator, a big Σ whose MuPDF box is too short, limits in small type, pieces of one row 2 em apart, a
  fraction set in the text font beside it), drawn twice (two groups that grew into each other), labels doubled or taken
  from the other column, a list item's next line made a picture; formulas in a line as text soup; "mc 2" (a rise MuPDF's
  origin hides); "Gr¨obner", "a̸ = 0", "˙q", "ˇSmejkal" (TeX's accents and slashes); a chess font read as "KQRNBp"; an
  epigraph read inside the right-hand column, cutting a sentence; a diagram's label left outside it; AJUR's footnote
  separator drawn twice; a footer logo, full-page pictures and a scanned page's picture left out (the strict rule); the
  OCR layer of a scan used as the text (now the scan is kept as its picture). Heap corruption found on the way: a
  JavaScript MuPDF device run over a display list (mupdf.js keeps and drops its packed paths) — the device runs over the
  page. Checked independently (`scratchpad/epubfix/piccheck.mjs`): every page of the five PDFs that draws a picture has
  one in the EPUB; a JPEG drawn on its own is in the EPUB byte for byte (the arXiv paper's JPEGs are halves of composed
  figures, drawn together as the page shows them).
- **TTS offline (21 Nov 2026) — found while building the Offline mode, each run here on the CPU.** sherpa-onnx's Kokoro
  front end left out every word its lexicon lacks ("Chakraborty", "SuperTools", numbers; sherpa-onnx 2.x removed eSpeak
  altogether — its issue #4139) → hexgrad's own pipeline (misaki + eSpeak NG), which speaks every word. Kokoro's
  pipeline: spaCy's model pins spaCy 3.7, whose thinc 8.2 is built against numpy 1 (numpy 2 → "dtype size changed") →
  numpy 1.26.4 pinned; misaki would pip-install the spaCy model from GitHub → the same model from Hugging Face, handed to
  spacy.load by its folder. Parler-TTS: sentencepiece 0.2.3's protobuf code needs protobuf 5, the audio codec's package
  forbids it (ImportError `runtime_version`) → sentencepiece 0.2.0. XTTS-v2: coqui-tts refuses to start without
  torchaudio and torchcodec, and torchcodec decodes through FFmpeg installed on the system → coqui-tts[codec] and the
  clip read with librosa. Hugging Face answers with 429 (rate limit) when nobody is signed in and many requests come
  at once — and fetching two files of a large repository (Piper's voices, Kyutai's clips: thousands of files) listed
  the whole repository, page after page, first → files named exactly are now fetched one by one (`fetch()` in
  driver.py); huggingface_hub waits and retries the rest. A gated model refused (no token, conditions not
  accepted) now ends the engine with a sentence instead of a traceback. Tests: unit `offline-tts.test.mjs` (scripts:
  bash -n, Base64 parts back byte for byte, shell text inert; with OFFLINE_TTS_E2E=1 the Linux script runs for real),
  `offline-tts-plan.test.mjs` 70 (catalogue against VCTK's list and sherpa-onnx's copies of the speaker maps, every voice
  in one script, driver.py's text pieces), e2e `tts-offline.e2e.mjs` 31 (the scripts downloaded and read back).
  Labels checked against the voices themselves (median pitch by pYIN of a sample of every voice that was run): XTTS-v2's
  studio names suggested the wrong sex for 13 of 58 voices → they are described by pitch; goonj's "Kabir" has a woman's
  pitch → its sex left unsaid. The Indian samples were sent to the owner to choose by ear.
  Candidates checked and left for later: MeloTTS (its PyPI package 0.1.1 needs torch < 2.0, no Python 3.12), Chatterbox
  (pins torch 2.6.0 and gradio), Indic-Speak (gated, 7 GB, its inference code unreadable without access), Veena, Maya 2,
  Orpheus (GPU-sized), ZONOS3-Mini (an Indian accent with a dose — on the processor only through its C++ tool).
- **Screencast — area recordings were black (21 Nov 2026; found answering the owner's "only the rectangular area becomes
  the full screen of the video?").** The suite checked only the size of an area recording. A pixel check (a canvas
  "screen": red around four colours) showed every pixel 0/0/0: `new VideoFrame(frame, { visibleRect })` is encoded as
  black for BGRA frames — Chrome's usual kind for screens — while Chromium's test screen sends I420, where it works.
  Fixed: drawn onto an OffscreenCanvas of the rectangle's size. Four pipelines compared (pass-through, visibleRect,
  drawImage, copyTo) on BGRA and I420 sources: only visibleRect failed, on BGRA. Checks: e2e +2 (the rectangle's
  pixels at 1:1, eight points; Chromium's own screen not black).
- **Screencast / Screenshot — the mouse pointer (owner, 21 Nov 2026: "add an option to exclude the mouse", "include the
  mouse exclude option in the screenshot app also").** Screencast had none; Screenshot had one that did nothing when
  changed during a share (Chrome keeps a live track's `cursor`: applyConstraints leaves it). Both: the setting is asked
  for when sharing starts, a change on an open share ends it (also while the picker is open — the share that comes back
  would have the old setting), the status says what the browser reports, locked while recording / during the countdown.
  Screencast's sound switch had the same fault (fixed the same way), its frame rate is applied to the open share. Also:
  a share ended while its picture was loading left the tab waiting (both tabs). Checks: Screencast e2e +9, Screenshot +5
  (the constraint asked for, each wording of the report, the ended share, the locks).
- **TTS offline — Indic Parler-TTS refused the owner's token (21 Nov 2026).** "Hugging Face did not let this computer
  download ai4bharat/indic-parler-tts …" came after the engine's programs were installed, and could not say why. The
  three causes look alike from the download (401 / 403 "GatedRepo"): a token Hugging Face does not know (whoami: "Invalid
  username or password"), an account that has not accepted the model's conditions, a fine-grained token not allowed to
  read gated models. Fixed: the script checks the token right after it is given (driver.py `--check-access`, with
  huggingface-hub only — seconds, before any engine) and `access_help` names the case by `whoami` (the account's name,
  the token's kind) with what to do; a later refusal in `fetch` says the same; the libraries' SyntaxWarnings (audiotools'
  docstrings) and FutureWarnings no longer show. Checks: unit plan +6 (the three cases and an open model with a stand-in
  huggingface_hub; fetch; the warnings filter against a control), offline-tts +6 (the check's place in both scripts, a
  refusal stops before any engine, an accepted token goes on). Run here against Hugging Face itself: no token, a wrong
  token and an open model gave the right answers (an account with a token is not available in the sandbox).
- **TTS offline — a first run looked stuck (owner, 21 Nov 2026).** The owner ran a script with one Parler-TTS voice; it
  printed "== Parler-TTS: 1 voice" and then nothing for minutes — "Is this stuck or is this taking time because the model
  is big?" It was neither: uv ran with `--quiet`, so the download of PyTorch and Parler-TTS's packages (about 0.8 GB, 3 GB
  with an NVIDIA card) showed nothing, and the model's 3.8 GB came after. Fixed: no `--quiet` (uv's bars show, in Linux's
  and Windows' scripts), a line under each heading with what its first run downloads (`firstRunNote`, from `runsOf`: the
  sums equal the tab's totals), driver.py's "The programs are ready; starting." and "Downloading <repo>: <files>". Checks:
  unit offline-tts +5 (no --quiet; the line in both scripts, ASCII on Windows; printed before uv starts), plan +5 (PyTorch
  counted with the first engine that needs it and with Chatterbox's own, sums). A real run here in a pseudo-terminal showed
  uv's progress, the driver's lines and Hugging Face's bars. Also: Qwen3-TTS has no speed control (the 1.7B's pace
  instruction moved it 5 %; the 1.7B CustomVoice now run here — Whisper read Ryan and Serena back, WER 0.15 on the time
  "9:30" only).
- **TTS offline, round 2 (21 Nov 2026; owner: "include them all") — found while adding twelve engines, each run here on
  the CPU where the disk allowed; every voice run was read back by Whisper small.en (word error rate against the text),
  its median pitch measured (pYIN) and its accent heard by SpeechBrain's CommonAccent model (13 of 13 of its own reference
  recordings named right).** sherpa-onnx's MeloTTS spelled out every word its dictionary lacks and dropped every digit →
  `spoken()` writes numbers, money, times, ordinals, dates and titles in words ("Dr" alone was "drive"), and the missing
  words are pronounced by g2p_en's network; importing g2p_en downloads NLTK data, which NLTK 3.10 refuses through a proxy
  (SSRF guard) → its predict() ported (`G2pNet`), giving g2p_en's own phonemes on every test word. Qwen3-TTS VoiceDesign:
  descriptions of a light, mild or strong Indian accent, a South Indian one and RP all came out North American (US or
  Canada first for ten of ten) → its voices are described by sex, age and manner only and promise no accent. OmniVoice's
  accents do come through (Indian first for three of four Indian voices, third for the fourth; Australian, British,
  American first for theirs). Qwen's named speakers sound North American in English whatever their native language →
  filed under "accent not documented", the native language in the label. Bark's presets: sex from each preset's own
  reference audio (its EnCodec codes decoded with facebook/encodec_24khz, then pitch) — no generation needed; three
  English and three Hindi presets sit in the overlap and are "a middle voice". Bark small generating 20 presets beside
  another run did not finish one in 8 minutes (to run alone). Pocket TTS falls back silently to the model without voice
  cloning when the gated one is refused → driver.py makes the catalogue voices first and then says why the recorded ones
  cannot be made. Chatterbox pins PyTorch 2.6 → the planner counts a second PyTorch for it. A model not run here is
  tagged in the tab with the reason. The Vinith check of the e2e suite matched five voices once the other cloning
  engines had the same recordings → it ticks XTTS's by its id.
- **Photo Dictionary on a phone (owner, 21 Nov 2026: "it has to work extremely well on my phone, especially when I take
  pictures of my Kindle"; to-do #6 item 5) — measured, then fixed.** A test set made for it (`scripts/make-kindle-photos.py`:
  a Kindle Paperwhite page in four fonts, Comfortaa among them, or a newspaper; the camera's still or a video frame; tilt,
  focus, noise, glare, moiré) read by the app's own engine in Node (`scripts/measure-ocr.mjs`). Found: (1) **the Kindle's
  black body, the table and the hand were read with the page** — the clean-up divided the dark body by itself and
  Tesseract's layout broke on it: 28 % of the words read right over 24 photos, 0 % on several; the page is now found and
  straightened first (`src/lib/pagecrop.ts`, imgproc `p_page_quad`): most photos read in the high 90s (a Comfortaa still
  0 → 93 %, a video frame 0 → 97 %, a newspaper still 31 → 86 %). (2) **The Doc Scanner's outline takes the largest bright
  region** — on a light desk that is the desk around the Kindle: the reading tabs have their own finder (the cleanest
  quadrilateral not running off the photo; the light area inside a dark body, which also holds when a lamp's glare joins
  the screen to the desk). (3) **A phone's Snap was one frame of the live video** (about 1920 × 1080: the text of a Kindle
  page held at arm's length is a few pixels high) — Snap now takes the camera's still where the browser can
  (ImageCapture, Android Chrome), turned to the live picture's way round, with continuous autofocus. Checks: unit
  pagecrop 19; e2e photodict +9 (the still read and not the frame, its size asked for, autofocus, the camera off, "Save
  this photo" gives the still, a still turned, refused → the frame, no ImageCapture → the frame); camera 39 and OCR 57
  unchanged. Left: small text with glare, small text in a video frame, newspaper columns, the OCR tab (to-do #9).
- **TTS offline — the Indian accents ranked (owner, 21 Nov 2026: "ranked all the Indian accents in order of increasing
  Indian accent thickness … name the model … a kind of text pop-up").** Every Indian voice that runs here read the same
  two British sentences (`scripts/accent-survey/run.py`) and SpeechBrain's CommonAccent classifier scored each recording
  (raw scores: its softmax over cosines is nearly flat). Found on the way: **XTTS-v2 failed at import — coqui-tts 0.28.0
  imports `six` without declaring it** (a user's run would have stopped the same way) → `six==1.17.0` in its packages
  (committed before); Bark small makes a preset in about 100 s after its first, slow one (the earlier note "did not
  finish in 8 minutes" was the download and a shared processor). The pop-up: a button beside the accent groups, a dialog
  (Esc, the backdrop and Close end it; the focus goes back), 63 voices with a tick that chooses the voice; the 71 voices
  not measured folded under one line (the first layout left room for three rows of the ranking — seen on a screenshot).
  Checks: unit offline-tts-plan 134 (every Indian voice once, lightest first, each catalogue number worked out again from
  the raw scores, the thresholds), e2e tts-offline 47 (the order, the model names, the folded list, a tick chooses the
  voice and unticks it, Esc and the focus, axe on the dialog in light and dark).
- **OCR tab on a phone (owner, 21 Nov 2026: "just like the photo dictionary, the OCR app should also work really well from
  my phone"; to-do #9).** The OCR tab's clean-up had the Photo Dictionary's fault: on a photo of a Kindle the black body
  was divided by itself — the still in Noto Sans read 1 % of its words with the clean-up and 81 % without it. Now the
  page is straightened first (shown in place of the photo, so the unsure words sit on what was read) and the same still
  reads 99 %, a video frame 97 %. Found while adding it: **a screenshot's white panel would be taken for the page** (the
  finder sees a light quadrilateral in a dark app) → a picture with more than a fifth of it exactly one colour (imgproc
  `p_flat_share`; a camera has noise everywhere) is read as it is; and `p_flat_share` itself overflowed (long is 32 bits
  in WebAssembly — the share came out negative; caught by the new unit check). Checks: unit pagecrop 22 (camera noise in
  the synthetic photos; a screenshot left alone), e2e ocr 63 (+6: the two Kindle fixtures held to their own words, the
  unsure words inside the page, the clean-up off reads less, a screenshot not cut), photodict 92 (+3: a Kindle still and
  a video frame find 90 % / 80 % of the uncommon words of a clean copy of the same page).
- **A photo too soft to read: said, not passed off (21 Nov 2026; to-do #6 item 5, #9).** What is left after the
  straightening was measured on three sets of generated photos: the photos that still read badly are out of focus, shaken
  (the generator's hand shake streaks 12 – 36 px of a 4032 px still) or hold text a few pixels high (a Kindle at arm's
  length in a 1080p video frame). Neither Tesseract with any clean-up (sharpening, upscaling, Sauvola) nor PaddleOCR's
  newest models read them (docs/WASM-AUDIT.md, tab 122). Tesseract's confidence tells them apart: sharp photos read at
  94 – 95 %, every reading below 60 % had most of its words wrong. So **the Photo Dictionary says "The text reads poorly …
  snap again"** (or "Only n words were read …" when a page gave fewer than 25) above its list, and the OCR tab adds it to
  its line. Found on the way: **the suite's Kindle checks could read the result of the photo before** (the status line
  still showed it until the new photo was decoded, so the check compared a clean copy with itself — it passed, but proved
  nothing) → the line is emptied before each photo and the checks still pass on their own result; **Tesseract's own
  diagnostics reached the console as errors** ("Line cannot be recognized!!" on a blurred photo) → its `debug_file` is
  /dev/null (no result changes — measured). Checks: e2e photodict 96 (+4: no hint on the two good photos, the hint on a
  blurred frame — `tests/fixtures/images/kindle-soft.jpg` — and gone with the next photo), ocr 64 (+1, and no hint on the
  good photos).
- **TTS offline: PyTorch's build did not fit the PC (21 Nov 2026; to-do #7).** The scripts set `UV_TORCH_BACKEND=auto` to
  get the CUDA build of PyTorch with an NVIDIA card and the processor's without one, and ran each engine with
  `uv run --with …` — but `uv run` takes no torch backend (uv 0.13.9: only `uv pip` and `uv tool run` do; the variable
  was ignored). So every Linux PC got PyPI's default build — CUDA, with about 4 GB of NVIDIA libraries and Triton —
  whether or not it has a graphics card, and a Windows PC with one got the processor's build (PyPI's default there).
  Found when this sandbox (no graphics card) held 4 GB of CUDA wheels after the OmniVoice test. Now each engine has its
  own environment, `envs/<engine>`, made once with `uv venv` + `uv pip install` (which takes the backend; Python itself
  is installed first with its download shown, `uv venv` is quiet); a `.pins` file holds the pins it was made with, new
  pins make it again, and a later run starts at once. PowerShell: `EnvFor` returns the environment's python.exe, uv's
  lines go to the screen (`| Out-Host`), and "not found" from `uv python find` is no error (`$ErrorActionPreference`
  Continue around it). Checked here: the MMS voice through the generated script → `torch 2.15.0+cpu`, no NVIDIA
  package, a WAV and an MP3; the second run installs nothing; Piper through the real script (OFFLINE_TTS_E2E=1).
  Tests: unit offline-tts 49 (+5: the engines installed with `uv pip`, not `uv run`; the Windows function; each
  environment made once and kept; new pins make it again; an engine name that is no folder name refused; a stand-in uv
  that makes a stand-in python), offline-tts-plan 134 (each engine runs from its own environment); e2e tts-offline 47.
- **TTS offline: Kyutai TTS 1.6B (21 Nov 2026; to-do #7).** The engine (moshi 0.2.13, its own PyTorch 2.9) with 601
  voices, one for every recording of kyutai/tts-voices with an embedding for the model. Found while adding it:
  - **Kyutai's VCTK embeddings exist only for `pNNN_023.wav`**, not for the `_enhanced` clips XTTS-v2 uses: the
    generator takes the voices from the repository's file list and stops on a recording without its embedding.
  - **Recordings in another language were filed by an English accent.** CommonAccent knows only accents of English, so
    de Gaulle's appeal (French) came out "heard as English (England)" and a French donation "nearest: Indian". Whisper
    base (pinned) now names each undescribed recording's language (`scripts/accent-survey/languages.py`): 25 of the 237
    are surely another language (16 Spanish, 7 French, 1 Malay, 1 Hindi) and are filed as its speakers — the Hindi one
    under Indian, the rest under other accents. Below 0.8 the language decides nothing (Whisper says "Latin" or
    "Yoruba" for many accented English recordings).
  - **Labels read "heard as English (England) English"**: now "accent heard in our test: English (England)".
  - **VCTK's remarks were in the labels** ("(Text and mic2 files unavailable)", "(new speaker, more data would be
    released …)") — of Kyutai's p315 and s5 and of Piper's p280 and s5: the region drops what is in brackets.
  - On a processor it needs about 16 GB of memory (measured 15 GB in float32): said in the engine's note.
  Tests: unit offline-tts-plan 147 (+13: a voice for each recording with an embedding, the Freesound clips left out;
  VCTK's accent, sex and age as VCTK's list gives them; the filing of every undescribed recording worked out again from
  the raw survey; the French recordings and the Hindi one; EARS and Expresso personal use; the pace mapping), e2e
  tts-offline 48 (the counts follow the catalogue; a voice ticked by its id — the label of Piper's p376 is Kyutai's too).
- **Photo Dictionary and OCR: a photo taken with the phone held sideways could not be read (21 Nov 2026; owner, to-do
  #11).** Neither tab asked which way up the text stood: a phone turned to landscape (either hand) — its screen locked
  upright, or a still that came the sensor's way round — handed Tesseract lines running up the picture, and it read
  nothing ("it can't understand a thing"). The OCR tab's old rescue (a reading below 60 % tried turned the three other
  ways) cost three readings and did not fire when the sideways reading was confidently wrong; the Photo Dictionary had
  none. Now imgproc's `p_text_turns` (own C: the lines' axis from each letter's nearest neighbour, the top from the
  letters that rise above the x-height against those below the baseline) and `src/lib/upright.ts` set the page upright
  before it is read in both tabs; where only the axis is clear, a small copy is read both ways round. Also found: a
  first version took the median of an even count as its upper middle value, so the band of a line differed by a pixel
  between a page and the same page upside down — on soft photos that tipped the count (exact medians now; the four
  ways round give mirrored counts). Tests: unit `textturns.test.mjs` 36 (four real photos × four turns, the whole photo
  and the page found in it; a blank sheet, a disc, a tiny picture: nothing to say); e2e Photo Dictionary 103 (the Kindle
  photo turned 90° / 270° / 180°: 90 %+ of the upright photo's uncommon words and the line says how it was turned; a
  phone still lying across the picture, either way; a still turned upside down by the tab's own turn to the live
  picture's shape), OCR 67 (the Kindle photo turned three ways: 95 %+ of its words read right).
- **Photo Dictionary and OCR: the sideways fix turned upright photos over (21 Nov 2026; found while adding photos at any
  angle — owner: "especially on the phone, when I click it at different angles").** Measuring the new levelling on the 24
  Kindle and newspaper photos of `scripts/make-kindle-photos.py` (`scripts/measure-ocr.mjs`, now with `--tilt DEG` and a
  `level` step) showed the turn of to-do #11, live for a few hours, spoiling upright photos: on a soft photo the letters
  run together into words, and the letter-based check took a sepia still for upside down (6 letters rising against 37
  dropping: 98.4 % of its words read → 2.0 %) and a Comfortaa video frame for sideways (80.2 % → 0 %); three more were given
  the wrong axis (word blobs stand closer to the line below than to the next word). The small slants it measured did not
  follow the picture (a page turned −1.5 … +3° still measured 1.3 – 1.8°). Now every turn and levelling is a suggestion
  tried by reading (`uprightByReading` in `src/lib/upright.ts`): the picture as it is and each suggestion are read on their
  middle (at most 1,000 px a side, at the picture's own scale), scored by the words read right as the OCR's confidence puts
  them, and a change kept only above 1.15 × as it is + 3 words; only "upright and level" skips the reading. Also found on
  the way: the quick reading of a copy made smaller could not read a whole photo's small text either way round (a 40°
  photo kept as it was); the average confidence missed a sideways page the OCR read in a few places at 85 % (34 words of
  451 — now the count of words decides: 92 against 190); levelling below 5° is left to Tesseract; and the e2e and measuring
  photos turned on a canvas of another colour outlined the old frame, which the page finder took for the page (they are
  turned on their own ground with a camera's noise now). Result: level photos read exactly as before the levelling (67.0 %),
  turned 25° 53.9 → 61.9 %, −35° 46.1 → 57.8 %, a quarter 55.8 → 63.5 %. Tests: unit `textturns.test.mjs` 73 (a reader with set
  answers: a wrong suggestion refused, a right one kept, a sideways page read confidently in places still turned); e2e OCR
  76 and Photo Dictionary 114 — the two spoiled photos are fixtures now (`kindle-blur.jpg`, `kindle-comfortaa.jpg`: read as
  they stand), the Kindle photo turned 30° / −40°, a close-up of its screen turned 20° / −25° (`tests/e2e/_tilt.mjs`).
  Then (the same day): **the lines' direction and slant from projection profiles** (`p_text_lines`, own C: the direction
  with the sharpest profile of the ink projected across it) — it gave the axis of all 112 straightened pages (28 photos
  × 4 orientations), where the letters missed several soft ones, and measures a turn exactly (8.0°, 15.0°, 35.0°); a
  first version always found 45° (whole-pixel bins alias at that angle: each pixel is shared between two bins now). Its
  own up / down (the ink just outside the x-height band of the average line) was right less often than the letters', so
  a turn is taken without reading only when the two agree on "upright" (never wrong on the set); when they see the lines
  run different ways (a desk's stripes in a whole photo) each one's direction and slant is tried. 700 px quick readings
  instead of 1,000 saved 13 % of the time and decided worse (a soft upright photo 89 → 60 %): kept at 1,000. Result:
  level 67.0 %, 25° 63.0 %, −35° 59.3 %, a quarter 66.0 %, upside down 65.8 % (the page alone: 67.0 / 53.9 / 46.1 / 55.8 /
  1.8 %). Tests: unit imgproc (a made-up page at known angles and in four orientations), textturns 74 (a reader that
  knows the page); e2e OCR 76, Photo Dictionary 114.
- **TTS offline: XTTS-v2 broke on every fresh install — a library released the same day (21 Nov 2026; to-do #7).** The
  survey of XTTS's new Indian voices stopped at its first voice: `'NoneType' object has no attribute 'get_seq_length'`
  in coqui-tts's GPT step. coqui-tts 0.28.0 asks only for transformers ≥ 4.57; transformers 5.24.0, out that day, changed
  what the model's first step gets. Every PC making XTTS's (or SYSPIN's — the same package) environment from then on got
  it. Pinned transformers 5.23.0 for both (a studio voice and a recorded one speak again), and more: **every engine now
  installs with a lock** — the exact version of every package (`scripts/make-offline-tts-locks.py`, `uv pip compile
  --universal`) given to uv as constraints, PyTorch's build still uv's choice — so a release can no longer break an
  engine on the owner's PC. Tests: unit offline-tts 55 (the lock written and passed with `-c` in both scripts; the same
  lock keeps the environment, a new one remakes it; a line that is no requirement refused) and, with OFFLINE_TTS_E2E=1,
  the real Linux script installing exactly the lock's versions of Piper and speaking; offline-tts-plan 168 (every
  engine's lock holds its own pins, PyTorch without a build, no NVIDIA libraries).
- **TTS offline: every engine run here with its lock — Chatterbox could not start anywhere (21 Nov 2026; to-do #7).**
  `scripts/accent-survey/smoke.py` makes each engine's environment as the tab's scripts do (its packages, its lock as
  constraints, PyTorch's processor build) and has it speak one sentence. All passed — Bark (full), VoxCPM2, VibeVoice
  1.5B, Veena and F5-TTS run here for the first time — except Chatterbox and Chatterbox Turbo, which failed twice:
  **its lock asked for two versions of PyTorch at once** (torch 2.6.0 and 2.15.0, torchaudio 2.6.0 and 2.11.1, each line
  without a marker: `uv pip compile --universal` writes a line per platform it splits on, some of them for platforms no
  script runs on — uv refused the constraints on every PC) → the lock maker keeps only the lines whose marker fits a
  platform the scripts serve (Python 3.12 on Linux and Windows, x86-64 and ARM64) and stops on two versions left without a
  marker; and then **every run stopped at start: `'NoneType' object is not callable`** — its watermark, resemble-perth
  1.0.1 (chatterbox-tts pins it), imports `pkg_resources`, which setuptools 82 removed, and swallows the ImportError
  (the watermarker class is None) → setuptools 81.0.0, the last with pkg_resources, is one of the engine's packages.
  Both would have stopped the owner's run; with them fixed, Chatterbox and Turbo speak (5 s of speech each). Tests: unit
  offline-tts-plan 169 (+1: no lock asks for two versions of a package without a marker).
- **Regex Tester flavours: six faults found while building them (21 Nov 2026; to-do #8).** (1) **A request waited
  behind a stuck worker for ever**: the time limit of a request was reset by the next one, so a runaway pattern held the
  worker and the tab showed an old answer — the limit belongs to the request being matched (`running` / `sent` in
  `src/tools/text.ts`), and when it fires for an older one the newest runs in a fresh worker. (2) **Python's regex module
  trapped in WebAssembly** on `Pattern.groupindex`, pickling, `capturesdict()`, `allcaptures()`, `allspans()`: five
  functions declared with fewer parameters than CPython calls them with (native code does not notice, WebAssembly checks
  every indirect call) → `wasm/python/regex-wasm.patch`. (3) **TeaVM: an empty `Map.copyOf` traps in `get()`**
  ("remainder by zero") — Java's `${x}` for a group the pattern does not have → `Pattern.namedGroups()` patched in
  `wasm/javaregex/prepare.py`. (4) **TeaVM: integer division by zero traps** where Java throws ArithmeticException →
  `src/lib/regex/java.ts` gives a new instance after any trap, and says so. (5) **.NET waited for ever in the worker**:
  `dotnet.js` runs as a worker's "sidecar" only when the worker has no `onmessage` handler → `globalThis.dotnetSidecar =
  true` first. (6) **Matches found from the end were highlighted in the wrong places** (the regex module's r, .NET's r:
  the highlighter took the list in the order the engine gave it) → laid out by position; the table keeps the engine's
  order. Each has a test: unit regex-flavours / python, e2e regex-flavours / regex.
- **Windows / Linux (21 Nov 2026; to-do #13).** The first runs of the Windows check (`.github/workflows/windows.yml`,
  Google Chrome on GitHub's Windows runner) and the review: (1) **the repository could not be checked out on Windows** —
  `public/data/dict/con.json` and `prn.json` (CON and PRN are device names there, whatever the extension) → `con_.json`,
  `prn_.json` (`shardFile()` in `src/lib/dictionary.ts`, the same rule in `scripts/build-dict.mjs`); `tests/unit/repo-paths`
  refuses device names, < > : " \ | ? *, trailing dots and spaces, case-only clashes. (2) **`npm run build` stopped on
  Windows**: `scripts/gen-icons.mjs` took a folder as `new URL(…).pathname` (`/D:/a/…` → `D:\D:\a\…`); 59 such places
  (the script and 49 test files) → `fileURLToPath`. (3) **Text files as Windows programs save them**: the Hash tab read a
  checksum list with `File.text()` (UTF-8 only) — Windows PowerShell 5.1 writes `> SHA256SUMS` in UTF-16, which became
  garbage and was hashed as a file; Sodium Encrypt did not recognise its encrypted text in a UTF-16 .txt (Notepad's
  "Unicode") → both through `textOf`. (4) **X11 / Wayland**: Screenshot's countdown window "stays on top" — not on
  Wayland, which leaves that to the desktop (said there now); Screen Info says what a page is not told on Wayland.
  `tests/e2e/os.e2e.mjs` opens all 172 PC tabs as Windows (user agent and client hints), X11 and Wayland.
  Then: (5) **Extract Archive's "Save all to a folder"** wrote every name as it is in the archive — on Windows a device
  name (the Linux kernel's `aux.c`, a folder `con`) cannot be created, a name ending with a dot or a space loses it,
  and README / readme are one file (the second overwrote the first) → `safeParts(path, windows)` (aux_.c, notes_),
  `freeName()` (" (2)" where the folder cannot tell names apart: Windows and macOS); elsewhere a name the browser
  refuses ("Name is not allowed": its File System Access may hold names to what every system can create — its
  sandboxed file system accepts all of them, so this could not be settled here) takes the safe form (e2e unzip 43).
  (6) **The Patch tab** saved a Windows file (CR LF) with LF — a text box gives its text back with LF only, so every
  line of the file had changed; GNU patch keeps them → the line ends of the opened original are kept on Download
  (`crlfText`), and a patch saved by PowerShell 5.1 (UTF-16, CR LF) applies (e2e patch 27). (7) **The Keyboard Test**
  lit a key on its key-down only; Windows keeps PrintScreen's key-down for itself, so PrtSc could never be tested there
  → a key also registers on its release; and the release of a lone Alt moved the focus to Chrome's menu on Windows
  (every key after it went to the browser) → the key-up is taken too (e2e keyboard 29). (8) **The offline speech
  script for Windows** had only been read: it ended with exit code 0 whatever happened, and opening the output folder
  (Invoke-Item) could fail the run where Explorer cannot open it → exit 1 on a failure (after the pause), the folder a
  convenience as xdg-open is on Linux; **run for real on GitHub's Windows runner** (`.github/workflows/windows-tts.yml`,
  `tests/unit/offline-tts-run.test.mjs`): Piper — the lock's versions, a WAV and an MP3, exit 1 for a voice that cannot
  be made; then one job per engine. The Windows steps also say that Chrome may ask to keep the .cmd.
  (9) **Every engine of the offline speech run on Windows** (26 Nov 2026; "Windows offline speech", one job per engine,
  the .cmd as a double-click runs it): 16 of 18 made speech at once. **Kyutai** stopped with "Compiler: cl is not found" —
  moshi compiles some functions with torch.compile, which needs a C++ compiler (an ordinary Windows PC has none, a fresh
  Linux desktop no g++ either) → driver.py sets moshi's own `NO_TORCH_COMPILE` when no compiler is on the PATH, and
  says so. **F5-TTS** spoke, but its environment held tzdata, which no lock had chosen: pandas 3 needs it on Windows, and
  `scripts/make-offline-tts-locks.py` dropped every line naming emscripten — also "emscripten or win32" → that rule is
  gone, the line is in F5's lock. Both jobs run again: **18 of 18 engines make speech on Windows**.
  (10) **The browser suites in Google Chrome on Windows** ("Windows check" run 5, 26 Nov 2026: 30 suites, 1,159 of 1,217
  checks). 19 suites passed as they are — camera, epub, every-tab, exif, ffmpeg (72 / 72), graphviz, junk-files, keyboard,
  markdown, ocr, patch, pdf-merge, pwhash, regex-flavours, screenshot, sodium, sqlfmt, terminal, tts-offline. Of the 12
  that failed, **one fault was the app's**: the Photo Dictionary turned an online definition into text with DOMParser, and
  Google Chrome on Windows tried to run the `onerror` of an `<img>` in it (the CSP refused it: "Executing inline event
  handler violates …"; Chromium here never did) → `stripTags` takes every tag out before any parser sees the HTML (unit
  `dictionary-html` 30). **The other eleven were the suites' own faults on Windows:** the "Linux" checks did nothing to be
  Linux ("this sandbox is Linux") — `tests/e2e/_os.mjs` `asOS()` sets the user agent, client hints and platform (os,
  youtube, unzip; Screencast checks the system it runs on); `import()` of a plain path (`D:\a\…` reads as the URL scheme
  "d:") — by file URL (codefmt-node: the Code Formatter); Git Bash's `sha256sum` writes `hash *name` and escapes a Windows
  path with a leading `\` (hash: `--text`, and the binary form a check of its own; zip: hashes in Node); a list's note
  read before it was drawn (hash); Windows paths inside Python source, where `\U` is an escape (image-editor: arguments);
  a file name by `split('/')` (sheet: 30 s waiting for "Opened D:\a\…\bank.xls" — `basename`; and a CR LF statement as
  Windows saves it is now a check); native CPython's text-mode `\r\n` and a C runtime that cannot read `TZ=Asia/Kolkata`
  (python: turned back; the six comparisons with TZ run on Linux); Git Bash's gpg, a POSIX build that takes a Windows
  GNUPGHOME for a relative path (pgp: `$GPG`, GnuPG for Windows installed by the workflow); Python reading stdin in the
  ANSI code page (sqlfmt's checker skipped: `PYTHONUTF8=1`). And Git for Windows had turned LF into CR LF in every
  fixture: `.gitattributes` (`* -text`) checks every file out as stored. All passed here after the fixes; the 15 suites
  run on Windows again (run 6).
  (11) **A run that hangs shows nothing** (26 Nov 2026): run 6 never got past Chocolatey's GnuPG 2.5.21 installer (an
  hour; the workflow installs no GnuPG now — the suite uses Git for Windows' gpg); run 7 printed its first line and then
  nothing for 150 minutes, when GitHub stopped it — `tests/e2e.mjs` printed every result only at the very end, so one
  suite that hung took all the others' results with it. Now each suite's start and result are printed as they happen,
  and a suite still running after `E2E_SUITE_TIMEOUT` minutes (30) is reported as timed out, its pages closed, and not
  run again; run 8 says which suite hangs.
  (12) **One reference tool stopped the whole run** (run 8, 26 Nov 2026): 15 suites finished (pgp9580 and screencast with
  failures), then nothing for 2 h 24 min. The sodium suite runs the reference decryptor `tools/sodium_decrypt.py` with the
  password on its standard input, and Python's `getpass` on Windows reads the console, never a pipe — it waited for a key
  (run 5 passed: PyNaCl was not installed then, and the step was skipped with a note). The suites share one Node process
  and call their tools synchronously, so the wait froze every suite with it, and the harness's own timeout could not fire.
  → The decryptor takes a password from a pipe or a script as the first line of its standard input (a Windows pipe's
  CR LF taken off — the old version kept the CR in the password even on Linux); `tests/lib/child.mjs` gives every
  synchronous child process of the suites a time limit (3 minutes unless a call sets its own); a failing suite's reasons
  are printed as it ends, not only in the summary, which a stopped run never reaches.
  (13) **Run 9** (26 Nov 2026: pgp9580, screencast, sodium, slideshow, unzip, youtube, sqlfmt): 227 of 228 checks in 68 s —
  sodium passed (the hang is gone), screencast passed (run 8's failure did not come back: the load of four suites at
  once); pgp9580 ran plain `gpg` with a Windows home folder, the pgp suite's fault of run 5 again → both suites take gpg
  and its home folder from `tests/e2e/_gpg.mjs`.
  (14) **Runs 10 and 11** (26 Nov 2026: pgp9580, ocr, photodict, zip, unzip; then ocr alone): 299 of 300 — the OCR
  suite's light-on-dark sentence came back "The quick brown fox iumps over the lazv doa near the river bank.", its
  descenders lost, on Windows only (the suite draws it in the browser in "DejaVu Sans", which Windows does not have:
  Arial). Taken at first for PaddleOCR's reading, wrongly — the commit before run 11 says it was new since PaddleOCR, but
  run 9 never ran the OCR suite. Run 11's check named the reader and the page step: Tesseract, at 93 %, and "the page was
  found and straightened" — in a screenshot of one flat colour, the outline of its single line of text was taken for a
  page (not square on, so not a screenshot's panel) and straightened, the descenders outside it. → No outline more
  elongated than 6 : 1 is a page (`MAX_ASPECT`, src/lib/pagecrop.ts: the most elongated page found in the measured photos
  is 1.49 : 1, so no measured reading changes); unit pagecrop 50 (+3: a tilted strip round a line is outlined and left
  alone). Arial cannot be drawn here, and the picture's bytes, printed into the run's log, could not be fetched from the
  log's host: the next Windows run checks the fix. (15) **Runs 12 – 13 (the build with to-do #31):** the dark sentence
  reads on Windows now (the 6 : 1 rule); the one failure was #31's new check — the copied text compared with the box byte
  for byte, and Windows' clipboard keeps a line break as \r\n (Chrome writes and reads it so there) → compared as the
  platform writes line breaks. OCR 95 / 95, Photo Dictionary 127 / 127: **every suite has passed on Windows — to-do #13
  closed.** The run's log is readable after all: the GitHub tool's `get_job_logs` with `return_content` (HANDOFF).
- **OCR and Photo Dictionary: documents with formatting read poorly, above all from a phone (26 Nov 2026; owner, to-do
  #18: "works very poorly for a document that has formatting, rich text formatting like bullet points, indentation, etc.,
  especially using the phone camera. Also improve the quality when the document has a watermark").** Measured on 150
  photos — the 24 Kindle and newspaper photos and 126 photos of documents made for it (`node scripts/make-format-docs.mjs`:
  a Google Docs checklist with check boxes and a table, a Word memo with nested bullets and numbered and lettered lists, a
  form, a report, a two-column newsletter with a text box, a handout; each also with a watermark — CONFIDENTIAL, a red
  DRAFT, a tiled name, a stamp — light and as strong as printers make them; photographed by `python3
  scripts/make-doc-photos.py` as a phone's still, a video frame and a flat scan). Found:
  - **The tabs never told Tesseract how to lay a page out** — Tesseract.js reads one block unless told (mode 6): straight
    across a newsletter's two columns ("meaning helmsman or pilot. K8s as an Note. The TTS Handbook documents the") — and
    the measuring script read every page in mode 3, which the tabs never did, so the earlier measurements were of another
    layout. Now per reading: one block, or a page where the page has columns.
  - **A white sheet on a light desk:** the Kindle finder took a part of the page for it (a column, the white space under a
    table), and a tilted sheet on a smooth desk, which JPEG makes exactly flat in places (0.22 – 0.34), passed for a
    screenshot and was read as it was. Every outline is checked across its edges now (`p_quad_steps`); where it is not a
    page's on all four, the Doc Scanner's network is asked, its corners fitted to the photo's edges (`p_refine_quad`, a
    corner may lie outside the photo: straightened with its corner inside, a page that runs off the photo came out
    sheared); a screenshot's panel must stand square on.
  - **The quick readings that set a page upright read its middle** — blank paper on many forms — and decided nothing: they
    read the window with the most ink (`p_ink_window`).
  - **Bullets read as letters and signs** ("e", "©", "«", "*", "o" at the start of 148 lines of one set) and **table
    rules as | and _**: `p_clear_marks` paints the marks and the rules the paper's colour. Its first version took serifs
    along a long word's baseline for rules (paper on both sides required), a form's label column for a column of text
    (columns at least eighteen x-heights wide, the lines on their left reaching the gutter), the middle of a soft word and
    a bold word's top and bottom for rules ("Department", "configuration", "comments" erased on a video frame of a form —
    paper beside a rule from 2 px out, another run along it counts as ink), the word "a" at the start of a soft Kindle
    line for a bullet (its hole closed by the blur; "a pod of dolphins" — a mark's gap must be wider than every word space
    of its line), a comma hanging below the baseline for a mark at a line's start, and six justified lines for two columns.
  - **A strong watermark's letters fenced in a white area that passed for the page**: a scanned memo was read from half way
    down (97.7 % of its words → 46.7 %). An outline that leaves a fifth of the photo's letters outside is no page now
    (`p_quad_text`; pages leave 0 – 8 %, such regions 25 – 73 %).
  - **The network's corners a little outside the page** left a strip of the desk down its side, and Tesseract (one block)
    dropped the form's title: strips along the edges are painted the paper's colour (`p_clear_border`).
  - **One block can lose a whole line on a soft photo** (a table's row, a title) that its layout analysis reads: a page with
    rules, marks or columns read below 85 % is read again the other way and the better reading kept (never a page of plain
    text: it gained nothing there, and a phone pays seconds).
  - **A strong watermark under a newsletter's text**: laid out as a page, Tesseract took the text under CONFIDENTIAL's big
    letters for a picture and left a 50-word paragraph out. A second, lighter level of ink in broad strokes is taken out
    now (`p_clear_wash`). Its first version found the "second level" on a Kindle photo whose e-ink text is grey with
    nothing darker, and painted the whole page white — caught by the survey of every photo before measuring: the band
    must be narrow, the text darker than it must be there, the strokes wider than any letter's (21 px at 3,000 px), the
    page mostly light paper.
  - **Painting the desk's strips on a Kindle's straightened screen** moved a soft photo's reading (93.3 → 90.8 %) for
    nothing: strips are looked for only on pages the network found.
  - The OCR suite's helper pressed Extract before a large photo had opened, so the previous picture was read and that
    reading dropped when the new one came — the run waited for ever; it waits for the last result to clear now.
  Result (each photo measured before and after; worse only beyond its own noise — the old code on the photo shifted by
  2 px): Kindle and newspaper photos 65.4 → 68.0 % of the words read right, documents 71.6 → 87.1 %, harder layouts 63.3 →
  75.3 %, watermarked 72.5 → 85.5 % (plain pages 73.7 → 85.8, light watermark 69.6 → 88.4, strong 74.4 → 82.3); stray
  signs where bullets stood 148 → 73 lines; no photo worse. Tests: unit pageclean 50, readpage 22, pagecrop 47 (the real
  watermark scan as a fixture, with the network), textturns 74; e2e OCR 83 (three photographed documents, the watermark
  scan read whole), Photo Dictionary 121.
- **OCR and Photo Dictionary: PaddleOCR as the second reader for soft photos (26 Nov 2026; owner: "Ok use PaddleOCR
  fallback for soft photos").** RapidOCR 3.10's pipeline ported (`src/lib/paddle.ts`, imgproc.wasm) around PP-OCRv6's
  networks on ONNX Runtime; a reading Tesseract is unsure of (below 88) is read again and the reading with more words right
  as each reader's confidences say is kept (CLAUDE.md §3 OCR, "The second reader"). Found on the way:
  - **RapidOCR's direction classifier turned upright lines over** — 134 of the 3,611 lines of the straightened pages, every
    one then read as garbage → left out: the page is set upright before it is read.
  - **OpenCV's arithmetic, not the textbook's:** INTER_LINEAR in floating point differed from cv2.resize in 12 % of the
    values (OpenCV works in 11-bit fixed point, a vector part and a scalar tail that round apart) → ported as it is;
    DBPostProcess scores a box by the mean probability inside it as cv2.fillPoly fills it (edges at x + ½, the right end at
    ⌈x + ½⌉ − 1, LINE_8 edges drawn from their left ends) — a polygon filled another way moved scores by up to 0.034 and
    dropped boxes at the 0.5 threshold → ported: 0 of 266,196 pixels differ.
  - **The suite's own expectations were worked out by hand and wrong** (the size RapidOCR gives a 3024 × 4032 still, its
    padding, the order of boxes on a tilted table) → each held to RapidOCR's Python; RapidOCR's own sorted_boxes orders a
    tilted table's boxes 2 px apart unstably, so the photos are matched by box and sorted_boxes is checked exactly on
    RapidOCR's boxes.
  - **A page of columns was read across** — the only photo of the second set the rule made worse (a newsletter's video
    frame: Tesseract 72.5 %, PaddleOCR's reading kept, 56 %): PaddleOCR's boxes reach past their text, neighbouring lines
    touch, and the gap under the title was narrower than the XY-cut's half-line, so it found no way into the columns and
    kept them line by line. The XY-cut is given the middles of the boxes now (`cutInput`): on every multi-column photo
    19,986 → 26,547 of the 27,859 words PaddleOCR read stand in order; that frame 94 % (a fixture now,
    `doc-newsletter-soft-frame.jpg`).
  - **The clean-up is Tesseract's:** PaddleOCR read 6 of 7 soft Kindle photos better before it (up to 10 points) and
    formatted documents better after it (the marks and rules it clears) → `secondPicture`; one calibration table for the
    readings the rule gives it.
  - **A newspaper whose gutter is narrower than PaddleOCR's boxes reach** is read across: one box holds lines of two columns
    ("The laboratory smelled of solder and | to find another way…"), which no ordering mends. On the photos measured such
    pages were read surely by Tesseract (newspaper-101: 97.9 % — PaddleOCR 75.5 %) and never reached the second reader.
  - **Two folders of the second set held the same photos** (made with the same salt) — counted once.
  Result: training 80.6 → 86.6 % of the words read right, the second set 83.8 → 93.4 %, 20 newspapers 52.6 → 65.6 %, no
  photo worse; unit paddle 51, readpage 38; e2e OCR 91, Photo Dictionary 124 (soft frames read by PaddleOCR, its models
  fetched only then, refused models).
- **OCR tab: the page's lists kept in its text (26 Nov 2026; owner, to-do #31: "In the OCR app, the rich formatting should be
  preserved, the bullet points, etc.").** The clean-up lists the marks it clears and `src/lib/listtext.ts` puts them back,
  with the levels and the lines an item runs on to (CLAUDE.md §3 OCR, "The page's lists"). Measured on the photo sets of
  #18 against the pages' own lists (`scripts/make-format-docs.mjs` now writes them). Found on the way:
  - **A Google Docs checklist's boxes were never cleared** — the rule "a mark is set off by more than every word space of
    its line" (it keeps the word "a" of a soft Kindle line) refused them: a checklist sets its boxes off by one word space.
    Tesseract read them "[J", "[0" or "C". → A frame with ink in its four corners (no letter has one) is exempt.
  - **A phone's photo breaks thin grey marks up:** a checklist's ☐ came out with its top and bottom fainter than its sides
    (two bars in the ink), its ○ in pieces — never found. → Faint marks are looked for on the light ink (the grid's mask):
    paler than the letters after them, the first thing on their line, and only in a list (another mark at the same place
    on another line).
  - **#18's clean-up erased a lettered list's "a." and a roman "ii."** on soft frames (a hole closed by the blur, letters
    run together: a solid blob set off by a tab) — and #31 would have written • for them. → On a soft page a blob as dark
    as the letters is a letter: kept.
  - **That rule kept a soft frame's ➢ too** — as pale as the letters there (darkest grey 119 – 138 against the letters'
    138 – 161), and kept they made Tesseract read 33.1 % of the report frame's words where it had read 46.0 %. → A letter
    is as tall as the x-height (the "a." 0.91 – 1.0, "ii." 1.0 – 1.12), the ➢ are shorter (0.67 – 0.78): the rule asks
    for 0.85 and more.
  - **A label kept took a sign of a list away from the reading's decisions:** the number of marks cleared decides which
    picture PaddleOCR reads (cleaned from two marks on) and whether a page is read again; a soft report frame with one ➢
    cleared and its "ii." kept counted one, went to PaddleOCR as it stood and read 70.2 % where it had read 74.2 %. →
    p_clear_marks counts the labels it keeps where a mark would have been cleared (out[7]); `listSigns` counts them with
    the marks — the decisions are again those of the build before.
  - **A word run together hid the start of a line:** on a soft form frame "Scuba Configuration" was one blob, longer than the
    search for a mark's neighbours reaches (it looks at what has its middle within about five x-heights, and passes over
    blobs longer than eight as pictures), so "UI" after it looked like the first thing on its line — and its letters, run
    together, passed for a ticked box: cleared since #18; with #31 listed, and the OCR tab dropped the word PaddleOCR had
    read there and wrote ☑. → What would be cleared is asked once more for a flat run of ink just before it on its line
    (`cm_run_before`; pinned by soft-form.png).
  - **A table after a checklist was set out as the last item's run-on lines** (two spaces in): on the checklist's video
    frames the table began 1.0 – 1.3 x-heights left of the items' text, inside the 1.5 x-heights a run-on line was allowed.
    → A run-on line starts within 0.75 x-heights of its item's text: 59 → 33 lines set out where the page has none on 180
    photos, every run-on line kept.
  - **A ring whose hole the blur closed was listed as a dot** → told by its paleness against the letter after it (a solid
    dot stays darker than the letters on a soft page). At 5 px and less a blurred dot is as pale: some dots of a soft frame
    are written ◦.
  - **listtext:** a line's height and top were its first word's — a dash read as a word is 3 px high and stands half way
    up, so a normal line gap looked like a jump and every dash list was cut after its first item (the lines' medians
    now); a list at the top of a new column lost the blank line before it; ">" (➢ as Tesseract reads it) and roman numerals
    of five letters were no labels.
  - **A unit fixture that never reached its rule:** the soft memo frame saved as JPEG for pageclean — the JPEG's blocks
    changed the "a." blob so much that it was no candidate any more, and the check "the a. stays" passed without the rule
    it was written for. → The pictures of what p_clear_marks gets are kept lossless (`OCR_SAVE` writes them:
    `PHOTO.read.marks.png`; `tests/lib/png.mjs` reads and writes PNG in the suites); with the build before #31 the four
    checks on them fail.
  - **The OCR suite's stray check** counted every line that starts with • ◦ ☐ as a mark read as a letter — the marks put
    back would fail it → only marks read as letters (e, o, ©, 71 …).
  - **Measuring trap:** `OCR_IMGPROC=old.wasm` runs an old module with the tree's binding, and the binding now reads
    out[7], which old modules never write: the old build read 81 "labels" from stale memory and a Kindle photo went from
    55.5 to 48.9 % — as if the change had cost it (HANDOFF, traps). Measured again with each build's own binding.
  - **The paddle suite's CTC check failed now and then, beside other suites** (a mean probability of 9.6e35): it decoded
    its Base64 data three times and sliced the first copy's memory at the second copy's offset — the same bytes while
    both stood in Node's shared Buffer pool, garbage when the pool ran out between them → decoded once.
  Result: the reading as before (the same photos in the same order by both builds — documents 92.2 → 92.2 % and 94.5 →
  94.5 %, harder layouts 81.7 → 81.6, Kindle 71.9 → 71.9 and 89.7 → 89.7 with every photo as before, newspapers 66.4 →
  66.3; no photo worse beyond its own noise); the lists on 108 photos of 18 pages: 565 of 756 items set out as on the page
  (scans 90.5 %, phone stills 79.8 %, soft video frames 54.0 %), 85.3 % of the lines an item runs on to under its text, 20
  lines set out where the page has none, every photo's words the reading's. Unit listtext 73, pageclean 71, readpage 39;
  e2e OCR 95, Photo Dictionary 127 (both on Windows too).
- **FFmpeg: the sound of the results quieter than the original — confirmed (26 Nov 2026; owner, to-do #23: "the audio
  volume of the output resultant videos and audio files seems to be lower than when I hear it from the original").**
  Every job measured against its original — EBU R128 integrated loudness, a mono file as heard on two speakers
  (`ebur128=dualmono=true`) — on mono, stereo, 5.1 and an AC-3's 5.1(side) (6 s of shaped noise; speech; music), by the
  native FFmpeg 6.1 and by the tab's FFmpeg 5.1 in the browser. Found:
  - **A mono sound made stereo: 3 dB lower** (−3.1 in both FFmpegs) — "Sound settings → Stereo" (`-ac 2`), Join clips
    (every clip was made stereo: two mono phone videos joined came out 3 dB quieter), the music under a mono voice (amix
    takes FFmpeg's upmix). FFmpeg's rematrix puts a mono channel on each side at 0.71 (−3 dB); players play mono on both
    speakers at full level (Web Audio's up-mix rule) → `pan=stereo|c0=c0|c1=c0`, and joins of mono clips stay mono.
  - **5.1 at the stereo bitrate:** Opus at 128 kb/s for six channels lost 2.0 dB natively (its upper bands — K-weighting
    counts them); AAC at 160 kb/s for six added up to +1.1 dB (reverse). → as much a channel as stereo gets.
  - **5.1(side) (AC-3, DTS):** libopus refused it ("Invalid channel layout 5.1(side) for specified mapping family -1":
    Convert → WebM failed); the AAC encoder wrote it with a PCE, read back as "6 channels, unknown" (and the native
    meter could not even measure the browser's output) → `-ch_layout 5.1` (FFmpeg 5.1 and 6.1 take it; the sides go to
    the back at gain 1).
  - **The browser's Opus encoder crashed on every stereo sound** — "RuntimeError: memory access out of bounds" 0.1 s in,
    on noise, on a sine, on speech, from MP4 or WAV, at 64 and 128 kb/s, applications audio and voip; `-application
    lowdelay` failed otherwise ("Error submitting audio frame"). It runs with `-frame_duration 10` or 5, and with
    `-compression_level` 0 – 4; 5 – 10 crash with 20, 40 and 60 ms frames. In libopus 1.3.1 complexity 5 turns on two
    things only: the pitch pre-filter (`run_prefilter`'s search) and the late transient check (`patch_transient_decision`,
    which recomputes the MDCTs) — one of them, at 20 ms frames and with a coupled (stereo) stream, overruns in this build
    (mono runs at any complexity). Unseen since the tab was built: **every media fixture was mono** (clip.mp4, clip.webm, tone.*). →
    two channels and more are made at `-compression_level:a 4` (`OPUS_SAFE`); "Your own arguments" that make Opus and set
    no complexity get it too. Chosen over 10 ms frames because it switches off exactly the two features the crash needs at
    any frame size; by a crude noise-to-mask ratio (half-Bark bands, spread masking, the coding noise against the
    original's threshold; native libopus 1.4) the two are level with the default at 128 and 96 kb/s — speech −2.3 (default)
    / −2.9 (complexity 4) / −1.7 dB (10 ms), a harmonic "piano" 18.3 / 19.3 / 18.7, noise 2.9 / 2.3 / 3.0 (lower is better).
  - **Exact trim of a WebM** put H.264 into the WebM, which the muxer refuses — now an MP4; an exact trim's sound took the
    container's default encoder (AAC at 128 kb/s for any number of channels; libopus for .opus) → named.
  - **"Mono"** (`-ac 1`) added the two sides at 0.71: the same sound on both sides came out 3 dB louder, and clipped at
    full scale → their average (as Audacity's "Mix Stereo Down to Mono"): identical sides keep their level, a voice as two
    microphones 15 cm apart hear it comes out 1.4 dB quieter (the sides partly cancel above 1.7 kHz), sides that differ
    completely 3 dB — said in the tab.
  - **Not faults, said:** 5.1 mixed into two (MP3, "Stereo") measures −0.6 to −0.8 dB — R128 weights the surround
    channels +1.5 dB in 5.1, a stereo mix cannot; a speed change loses 0.7 – 1.4 dB on noise (atempo's WSOLA crossfades
    unrelated pieces, which add in power: a Hann crossfade of uncorrelated sound is −1.25 dB) and keeps speech and music
    within 0.4 dB; "Normalise loudness" makes −16 LUFS on purpose (said in the tab).
  After the fix, natively: 14 jobs (convert to MP4 / WebM / M4A / OGG / FLAC, extract, exact trim, cut out, join, reverse,
  compress, speed, 44.1 kHz) × mono, stereo and 5.1 files within 0.5 dB (mostly 0.0 – 0.2); in the browser the same on
  the cases that failed. Fixtures `stereo.mp4` and `surround.mkv` (`node scripts/make-sound-fixtures.mjs`).
- **Screencast: the sound of the recordings lower than normal? — checked, not lower (26 Nov 2026; owner, to-do #21).** A
  known tone as the shared sound (440 Hz, 0.3) and as the microphone (1 kHz, 0.2) — stand-ins for getDisplayMedia and
  getUserMedia — recorded as MP4 (Linux Chromium writes Opus, re-encoded as AAC by `finishRecording`) and WebM, with and
  without the microphone: every tone's amplitude in the file (ffmpeg decoding, Goertzel at the tone over the middle
  second) within 0.02 dB of what was played — MediaRecorder, the Web Audio mix (sources added; mono on both sides at
  full level) and the AAC re-encode keep the level. Not visible from a page: Chrome's processing of a real microphone
  (echo cancellation, noise suppression, automatic gain) and Windows' "reduce other sounds when communicating". The
  e2e suite holds the level within 0.5 dB; countdowns Off / 3 / 5 / 8 / custom built with it (and a Cancel — the
  in-page countdown had none).
- **Batch 3's browser runs (26 Nov 2026):** (1) **a speed change "lost 1 dB" on the stereo speech fixture** — natively too
  (FFmpeg 6.1: −1.0 at 2×, −0.4 at 1.5×, +0.7 at 0.5×), while the loudest half of its 50 ms frames moved by −0.21, −0.22,
  −0.16 dB: on a 3 s clip the R128 integrated loudness is no measure of a speed change (its 400 ms blocks and gating fall
  otherwise when the time scale changes) → speed is held to the voice's level (the loudest half of the frames), in both
  suites. (2) **The FFmpeg suite's page crashed** ("Target crashed") at 5.1 → MP4 after the Stop checks' new FFmpegs and a
  few jobs — the same job on a fresh page ran three times in 31 s each → the new checks run on a page of their own (the
  long-session crash of the headless shell). (3) **The disk filled** (13 GB of offline-TTS work in the scratchpad) and
  Chrome's renderer crashed mid-run → deleted; a run that fails as "Target crashed" is worth a `df` first. (4) **FFmpeg's
  loudnorm keeps its one-gain ("linear") mode only for a sound with a loudness range above 0** — a steady test tone is
  normalised in its dynamic mode (the Screencast's line now says which); the suite tests both.
- **Windows check run 14 (26 Nov 2026; screencast, screenshot, ffmpeg on a395eac):** screenshot 22 / 22; screencast 50 / 50
  when run alone — under load (four suites at once) its "MP4 with the microphone" saw the shared tone 2.4 dB low over the
  middle second, the microphone's exact: the test's own tone source (a Web Audio oscillator in the page) left gaps on a
  busy runner → each tone is now the median of the 100 ms pieces of 0.5 – 2.5 s (a level change moves every piece, a
  gap only some). ffmpeg: the 2× speed check (fixed since: the voice's level) and, after the Stop checks' new FFmpegs on
  the same page, "memory access out of bounds" in 5.1 → MP4 — the step at which the Linux page crashed too; on fresh pages
  it ran every time (also right after two stereo Opus encodes at complexity 4, and with 10 ms frames) → the new checks
  run on a page of their own (the long-session weakness of one FFmpeg core on one page: its memory only grows).
- **The FFmpeg suite after those fixes (Linux, 26 Nov 2026): 85 / 89** — the four failures were the suite's: its check
  that the MP3 choice is kept "for another file" counted on the choice made at the start of the suite, but that part now
  runs on a page of its own, where the choice was never made (the tab keeps it while its page is open — as it should). The
  part chooses MP3 at 320 kb/s itself now; run alone: 5 / 5 (kept for another file and through leaving the tab, the MP3's
  320 kb/s frames and the loudness of the original).
- **The site was not updated after the morning of 26 Nov 2026** — every publishing run from the Key Codes change (#26,
  de86095, 06:12 UTC) on failed in `npm test`: `bitsweb` loads `src/tools/software/ref.ts`, which now imports
  `src/platform.ts`, and that read `window` as it loaded (`'documentPictureInPicture' in window` …) — no `window` in Node,
  where the unit suites run ("ReferenceError: window is not defined"). Unseen because only the suites a change touched
  were run here, and the workflow's failures were not looked at. Fixed with `globalThis` (the same object in a browser).
  Lesson (HANDOFF): after a push, look at the "Deploy to GitHub Pages" run.
- **Scrolling screenshots (to-do #28, 26 Nov 2026):** while building — every row looked "detailed" (band sums over bands of
  unequal width; now band means), blank rows beside a header shrank the shifts searched (the header capped at the fewest
  rows seen), a capture's rounding hid a static header (tolerance a level a band) and a faint gradient under noise was
  refused although it fit far better than any other shift (accepted when 2× better); the first instruction to the user
  was overwritten by the first view's progress at once (now a line of its own); the start button said "Waiting…" during a
  capture ("Capturing…"). The unit suite's own slips: steps that crossed the made-up page's blank band with nothing in
  common (no method can place those — the test asks for steps that keep detail in common).
- **Screenshot, an area drawn with the mouse (to-do #24, 26 Nov 2026):** built with its checks; found on the way only slips
  of the new suite (an equidistant pointer that takes the top edge, as specified; a full-screen request still on its way when
  checked).
- **Watermark: the diagonal, PDFs and Word documents (to-do #17, 26 Nov 2026):** found while building — MuPDF's
  `getNumberOfComponents()` counts the alpha channel already (4 for RGB with alpha): the glyph box of vector text was read
  as five samples a pixel and came out a quarter too big (marks 78 % of the size they should have been, off the middle),
  and the page could crash; tiles whose centre lay within reach of the page but whose turned box did not touch it were
  kept (the unit suite counts them now). **LibreOffice and Word's VML watermarks** (found by drawing the results with
  LibreOffice 24.2): it keeps only the last shape of a `w:pict` (tiles vanished but one — each shape is a run of its own
  now); it sizes a text watermark by its width with its own line height and stretches the capitals to it (letters taller
  than in Word, which fits the text path to the box we give: the glyphs' own box); and from a top given in points it grows
  the taller box down — the diagonal sat 30 pt low → a mark in the page's middle is centred by alignment, as Word writes its
  own. A header shared by sections of other page shapes (Word's "Link to previous") put every section's mark at the first
  section's angle (seen in LibreOffice: a landscape page's mark at the portrait's 54.7°) → every section gets its own header
  parts. The suite's own slips: the fixture's 10 headers counted as 9; a download kept under a time-stamped name.
- **Cartoonizer: finer, more detailed results (to-do #16, 26 Nov 2026):** found on the way — **the full-size save of the
  Cartoon filter did not look like its preview once the detail was finer**: the line finder's blur (three boxes) cannot go
  below σ ≈ 1.4, so the preview's lines were as thick in pixels as the save's (an exact Gaussian below σ 3 now), and the
  colour quantiser started from pixels picked by their index — another start at each size, sometimes other colours
  (the luminance quantiles now): measured on the astronaut, 9.5 → 2.0 of 255 between the save and its preview. Tiles of
  the AI painting, each normalised by its own statistics, showed bands at their seams (a book page: a bright vertical
  band) → the whole picture's statistics are fed to every tile. The new suite's own slip: a guess at the level of
  "detail kept" for a painting (0.45) — the style's own strokes carry most of a painting's edges; it measures 0.147
  against Bold's 0.045.
- **Text Diff: two files and a file on GitHub (to-do #14, 26 Nov 2026):** found while building — files must not go through
  the text boxes: a text box gives its text back with LF line ends only, so a Windows file (CR LF) compared through one
  would lose what makes it differ (the texts are kept as read now); a file error shown with the comparison's notes was
  cleared at once by the next comparison (it has a line of its own under the pickers); GitHub's rate-limit headers reach
  a page only because GitHub lists them in Access-Control-Expose-Headers — the suite's stand-in left that out and the tab
  said "GitHub answered 403" (the stand-in now sends what GitHub sends, and a 403 whose message says "rate limit" is read
  as the limit too). The old suite's `getByLabel('Original')` met "Original commit" (the commits are "From" / "To" now).
- **Noise Remover: Studio voice (to-do #20, 26 Nov 2026):** found while building — the binding read a wasm pointer after
  taking the memory's buffer: the call grew the memory and the view's buffer was detached ("Cannot perform Construct on a
  detached ArrayBuffer"; pointers first now, `src/wasm/audio.ts`); the true peak read white noise 0.8 dB lower than FFmpeg's
  ebur128 — 16 taps a phase fell off too early below 24 kHz (32 now; speech agreed either way); the de-esser reported a
  reduction on silence (it ran where there is no voice; skipped then, as the expander and the compressor are); the strength
  mixed at 48 kHz without the finish made 50 % not the exact middle of the file and the cleaned sound (the resampler's round
  trip; mixed at the file's rate now, as Remove noise mixes); the info note lost its icon when its text was changed; a
  failed download said "Failed to fetch" (said in words now). **Measured and changed:** −16 LUFS on a mono file's one
  channel made the limiter take 3 dB and more off 38 % of the voice (DNSMOS marked it down) — the loudness is that as heard
  on two speakers now; a peak compressor before the limiter did nothing measurable (taken out). The new suite's own slips:
  the status watcher read the recorder's live region (the first of the page), an A/B check read the line before it changed,
  sample indexes of 48000 × 2.3 that are not whole numbers, a peak bound of −1.5 dBFS at 16 kHz for a true peak held at
  48 kHz (−1.45 now: the resampling and the 16-bit steps move it by hundredths).
