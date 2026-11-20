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
| `batch` | Batch Images | PC only | images1 | ✓ | 4 | 7 | jSquash resize; unique result names (shared list); sizes/scale checked; failed files listed; Stop |
| `heic` | HEIC → JPG | PC + mobile | images1 | ✓ | 3 | 16 | libheif-js kept (latest) + lcms-wasm: Display P3 → sRGB (iPhone colours were off, every HEIC tab); primary image; failed files listed |
| `passport` | Passport Photo | PC + mobile | images2 | ✓ | 4 | 6 | MediaPipe 1.2.3 (latest) + imgproc kept; no stale result after a face-less photo; Cancel ends the countdown; camera errors worded (shared src/lib/camera.ts); custom size 10–150 mm; jSquash resize for upload |
| `formphoto` | Photo & Signature Resizer | PC + mobile | images2 | ✓ | 8 | 55 | engines kept + jSquash resize; KB read strictly (max ×1000, min ×1024); dpi before padding (was +18 bytes over max); metacore padding exact; no download of an over-max file; per-field reasons; re-frame without new face search; newest photo wins; object URLs revoked |
| `bgremove` | Background Remover | PC + mobile | images2 | ✓ | 8 | 21 | MediaPipe + imgproc kept (imgly ISNet noted for objects); newest photo/background wins; no-person said + Save refuses; failure reason on Save; status restored; .swatch CSS clash with Color tab fixed (.bg-swatch); 44 px swatches with pressed state; model note only first time |
| `cartoon` | Cartoonizer | PC + mobile | images2 | ✓ | 7 | 8 | imgproc + TF.js (wasm/WebGL) kept; see-through photo/painting on white (onWhite in imgio); one AI painting at a time, newest settings follow; Save refuses a stale AI result; keyboard compare; model note only until loaded |
| `redact` | Blur & Redact | PC + mobile | images2 | ✓ | 6 | 13 | Save refused during the face search (it saved every face visible); newest photo wins; boxes drawn during the search kept; failure in the status line; pointercancel; setPointerCapture guarded |
| `watermark` | Watermark | PC + mobile | images1 | ✓ | 6 | 6 | unreadable first photo no longer blocks the preview; Clear photos; empty text refused; logo errors said; failures listed; HEIC logos; jSquash resize |
| `caption` | Text on Image | PC + mobile | images1 | ✓ | 3 | 21 | over-long words and CJK broken between graphemes (src/lib/textwrap.ts); long text shrunk to fit |
| `collage` | Collage Maker | PC + mobile | images1 | ✓ | 2 | 4 | A4 JPEG says 300 dpi; first photo's Move earlier off; jSquash resize on save |
| `exif` | EXIF / Photo Info | PC + mobile | images1 | ✓ | 8 | 106 | engine replaced by ExifTool 13.42 (zeroperl wasm, worker): iPhone HEIC position was hidden; HEIC/WebP stay their format on strip; orientation + ICC kept; XMP/IPTC/maker notes/previews shown; non-photo files named; newest photo wins; HEIC preview; DMS carry |
| `scanner` | Doc Scanner | PC + mobile | images2 | ✓ | 12 | 62 | page finder: DocCornerNet LEAN on ONNX Runtime Web (WASM-AUDIT 121); OpenCV's area resize in imgproc; memory, phone picker, B&W lossless, Fit to scan |
| `ocr` | OCR | PC + mobile | images2 | ✓ | 6 | 11 | language data that cannot be fetched no longer hangs the tab; sideways/upside-down pictures turned; dark mode; phone picker (also passport, signature) |
| `signature` | Signature Maker | PC + mobile | images1 | ✓ | 5 | 9 | strokes scaled with the pad; ink colour for the whole signature; fonts only for Type; blank paper said |

## documents
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `pdf-merge` | Merge PDF | PC + mobile | pdf | ✓ | 4 | 37 | annotations, links, forms, outlines kept (graftPage dropped them); one graft map per file |
| `pdf-split` | Split PDF | PC + mobile | pdf | ✓ | 4 | 14 | parts keep annotations/links/forms/outline (rearrangePages); one at a time; N pages box; page lists read |
| `pdf-organize` | Organize PDF | PC + mobile | pdf | ✓ | 4 | 5 | rearrangePages keeps annotations/links/forms/outline; tiles at once; newest PDF wins; Rotate all |
| `img2pdf` | Images → PDF | PC + mobile | pdf | ✓ | 3 | 2 | Fit keeps a scan's paper size (its own dpi); Sort by file name; URLs released |
| `pdf2img` | PDF → Images | PC + mobile | pdf | ✓ | 4 | 6 | a run keeps its own file; size cap 16384 px / 100 MP; padded names; stops on leave |
| `pdf-compress` | Compress PDF | PC + mobile | pdf |  |  |  |  |
| `pdf-sign` | Sign PDF | PC + mobile | pdf |  |  |  |  |
| `pdf-fill` | Fill PDF Form | PC + mobile | pdf |  |  |  |  |
| `pdf-unlock` | Unlock PDF | PC + mobile | pdf |  |  |  |  |
| `pdf-protect` | Protect PDF | PC + mobile | pdf |  |  |  |  |
| `pdf2text` | PDF → Text | PC + mobile | pdf |  |  |  |  |
| `pdf-pagenum` | PDF Page Numbers | PC + mobile | pdf |  |  |  |  |
| `pdf-watermark` | PDF Watermark | PC + mobile | pdf |  |  |  |  |
| `epub` | PDF → EPUB | PC only | docs2 |  |  |  |  |
| `sheet` | CSV / Excel | PC only | docs2 |  |  |  |  |
| `markdown` | Markdown Editor | PC + mobile | docs2 |  |  |  |  |
| `invoice` | GST Invoice | PC + mobile | docs2 |  |  |  |  |
| `rent` | Rent Receipt | PC + mobile | docs2 |  |  |  |  |
| `resume` | Resume Builder | PC + mobile | docs2 |  |  |  |  |

## security
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `pgp` | OpenPGP | PC + mobile | security-codes | ✓ | 8 | 61 | a 2nd recipient was dropped (library reads 1 armored block); stored file name; armor inside e-mail; errors in words; key IDs; fingerprint+date; RFC 9580 vectors; gpg both ways. Engine kept (rPGP semantics layer experimental) |
| `sodium` | Sodium Encrypt | PC + mobile | security-codes | ✓ | 5 | 53 | engine → libsodium.js (sumo, libsodium 1.0.22) + crypto.wasm header; pasted text in every form (atob errors), .txt files, progress during Argon2; PyNaCl + cross-engine tests |
| `sharelink` | Encrypted Share Link | PC + mobile | security-codes | ✓ | 10 | 32 | engine as sodium (libsodium.js + crypto.wasm header); links read as they arrive (cut, changed, trailing full stop, %-escapes, other site's d=), password twice, long-link warning, autocomplete, Enter |
| `hash` | Hash / Checksum | PC + mobile | security-codes | ✓ | 10 | 133 | engine → hash-wasm (existing wasm, 23 algorithms, own worker, Stop); expected checksums in every common form, checksum lists, auto-added algorithms, secure file comparison; crypto-client ordering fix |
| `password` | Password Generator | PC + mobile | security-codes | ✓ | 3 | 37 | randombytes_uniform → libsodium.js; exact entropy (inclusion–exclusion), length box 4–128, symbols box, named copy buttons |
| `passphrase` | Passphrase Generator | PC + mobile | security-codes | ✓ | 3 | 17 | libsodium.js; word list checked (7,776 words; error pages were used as lists); digit entropy log2(10×n); named copy buttons; flaky split fixed; lazy suite root-folder gap fixed |

## media
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `video` | Video Compressor | PC + mobile | video |  |  |  |  |
| `audio` | Audio Recorder | PC + mobile | audio |  |  |  |  |
| `tts` | Text-to-Speech | PC + mobile | audio |  |  |  |  |
| `stt` | Speech to Text | PC + mobile | audio |  |  |  |  |
| `noise` | Noise Remover | PC + mobile | audio |  |  |  |  |
| `pitch` | Pitch & Speed | PC + mobile | audio |  |  |  |  |
| `slideshow` | Slideshow Maker | PC + mobile | video |  |  |  |  |
| `ffmpeg` | FFmpeg | PC only | video |  |  |  |  |
| `screencast` | Screencast | PC only | video |  |  |  |  |
| `screenshot` | Screenshot | PC only | video |  |  |  |  |
| `youtube` | YouTube Clip | PC only | video |  |  |  |  |

## calculators
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `calc` | Scientific Calculator | PC + mobile | calc-core | ✓ | 21 | 308 | engine kept (WASM-AUDIT 56: no tried-and-tested wasm calculator); reference mpmath at 50 digits for 3,005 expressions; exact round angles, whole numbers digit for digit, exact chaining through Ans, refusals with reasons |
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
| `periodic` | Periodic Table | PC + mobile | calc2-math | ✓ | 5 | 70 | no engine (WASM-AUDIT 89); data held to the mendeleev package (11 knowing differences listed); search: symbol first ('s' showed sodium), other spellings, categories; legend filter, selection mark, arrow keys, gap markers, 'predicted' from 104, 44 px cells on phones |

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
| `morse` | Morse Code | PC + mobile | text | ✓ | 11 | 78 | characters and groups no longer vanish silently; lines and word gaps read; sound: Stop, typographic signs, line gaps; held to unixcw's libcw (table and timing) |
| `lorem` | Lorem Ipsum | PC + mobile | text | ✓ | 9 | 121 | engine → lipsum crate (textkit-lorem.wasm) + our glue for 2 crate defects; up to 20,000 words (was 50); exact counts held to the Word Counter; text held to the crate's own texts |
| `photodict` | Photo Dictionary | Mobile only | text | ✓ | 6 | 15 | rare.c: case table (Gdańsk was gdaŅsk), titles/initials end no sentence (names found), bounded writes; a 2nd photo while reading was dropped; Snap before the first frame |

## software
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `json` | JSON Formatter | PC only | dev-data2 | ✓ | 7 | 68 | own lossless Rust formatter: member order, duplicate keys and number spelling kept (JSON.stringify moved "10" first, dropped duplicates, rewrote 1.0 / 1e5); duplicate-key warning; a worded message + line / column + Show it for every mistake; no stale output; Minify stays; BOM; deep nesting |
| `regex` | Regex Tester | PC only | dev-data2 | ✓ | 4 | 18 | matching in a worker: a runaway pattern is stopped after 2 s (it froze the tab); flag mistakes named; named groups in the table; a million matches counted |
| `base64` | Base64 | PC only | dev-data2 | ✓ | 8 | 33 | on devcore-enc: data: URLs, %3D, extra padding, zero-width characters accepted; binary results recognised, shown as hex, saved under the right name; Download no longer decodes the plain text in Encode; 30 MB file 21 s → 4 s; vs Python base64 |
| `urlenc` | URL Encoder | PC only | dev-data2 | ✓ | 7 | 65 | + is a space only in queries (mailto:user+tag, tel:+91 broke); lenient decoding (Windows-1252, stray %) instead of '⚠ URI malformed'; full URL without double encoding, IPv6, Punycode (= Node's URL); parts from the URL itself; vs Python quote |
| `epoch` | Epoch Converter | PC only | dev-data2 | ✓ | 6 | 45 | µs / ns recognised, separators, 1.7e9, ISO and dd/mm/yyyy dates, unit shown and selectable, picker in step, no NaN; 120 instants vs Python in 3 time zones |
| `uuid` | UUID Generator | PC only | dev-data2 | ✓ | 5 | 36 | v7 strictly increasing (crypto.wasm, RFC 9562 method 2); switches rewrite the same IDs; inspector: braces / urn, nil / max, v1 / v6 time, clock sequence, node; vs Python uuid |
| `color` | Color Converter | PC only | dev-data2 | ✓ | 7 | 34 | alpha kept (8-digit hex); rgb % / exponents, hsl turn / rad / grad, oklch L 0–1, oklab, hwb, names; colours outside sRGB mapped as CSS Color 4 (was rgb(-1065, …)); wrong input marked; exact round trips over all 16.7 M colours; vs colorsys + Chrome's CSS engine |
| `jwt` | JWT Decoder | PC only | dev-data2 | ✓ | 7 | 33 | Bearer / quotes / wrapped; JWE; null, list, text, non-UTF-8 payloads; 20-digit claims not rounded; exp as string / ms; alg none; damaged signature; UTC + local + relative times; vs PyJWT |
| `sqlite` | SQLite Playground | PC only | data-engines | ✓ | 22 | 155 | official SQLite wasm; engine drives its C API: SQLite's own parser cuts scripts, error line / column, values keep their type (exact big integers, reals as SQLite writes them, blobs), own-changes count, time limit, files checked before replacing + undo, WAL, imports with types from sheet.wasm (leading zeros, long ids, every sheet), exports of all kept rows; reference = native SQLite (160 statements unit; 12 queries, 3,000-row CSV / JSON and the downloaded file e2e) |
| `jq` | jq Playground | PC only | data-engines | ✓ | 17 | 5860 | runs in a worker (10 s limit, Stop, 16 MB output stop, restart after out of memory); glue follows jq's main.c with jq's own input reader: messages with input.json:N, exit status of the last input, halt, debug / stderr, input_filename, -r -a; memory 2 GB and given back; reference = native jq 1.8.2 for 4,903 cases (unit) and 192 typed into the page; runs in a worker (10 s limit, Stop, 16 MB output stop, restart after out of memory); glue follows jq's main.c with jq's own input reader: messages with input.json:N, exit status of the last input, halt, debug / stderr, input_filename, -r -a; memory 2 GB and given back; local time (localtime, strflocaltime, %Z %z) is the browser's zone, was UTC (host answers supertools.tz_info, wasm/jq/hosttz.c); reference = native jq 1.8.2 for 4,903 cases + 891 local-time cases in 27 zones (unit) and 192 + 4 zones (e2e) |
| `yaml` | YAML ⇄ JSON ⇄ TOML | PC only | data-engines | ✓ | 21 | 1933 | own value model + own JSON / YAML / TOML writers: numbers keep every digit, YAML output quotes what YAML 1.1 parsers misread (no, y, 1_000, 1:30, dates), .inf / .nan and TOML dates travel, TOML refuses what 64 bits cannot hold; notes for keys written twice; outputs read back by PyYAML, ruamel.yaml and tomllib (1,750 texts), 393 texts written by other programs read correctly |
| `xml` | XML Formatter / XPath | PC only | dev-data2 | ✓ | 9 | 45 | own Rust formatter moves white space only: declaration, DOCTYPE, entities, &#10;, nbsp and padded text were lost or rewritten; <parsererror> element; xml: and default-namespace prefixes in XPath; ISO-8859-1 / UTF-16 files; 74 documents compared by Chrome's parser |
| `json2types` | JSON → Types | PC only | dev-data2 | ✓ | 10 | 110 | own Rust generator; every output compiled by tsc, go, rustc, javac, python for 36 samples: root lists / values as aliases, colliding and reserved names, shadowed type names, one-file Java, Python kw_only and kept keys, keys Go cannot tag, uint64 / BigInteger, plurals |
| `jsondiff` | JSON Diff | PC only | dev-data2 | ✓ | 5 | 70 | own Rust diff on the lossless reader: lists aligned by equal elements and by id (one removal was N changes); numbers by value and never rounded; duplicate keys; empty sides; Swap; rows carry both values; 400 random pairs with two appliers |
| `sqlfmt` | SQL Formatter | PC only | data-engines | ✓ | 24 | 146 | our own formatter (Rust, devcore-sqlfmt.wasm) replaces the sqlformat crate, which changed the meaning of SQL (WASM-AUDIT 53): dialect-aware tokenizer (standard, PostgreSQL, MySQL, SQLite, SQL Server, Oracle; auto-detect), keywords change case only where they are keywords, layout of CTEs / MERGE / windows / DDL / blocks, scripts without semicolons, a guard that re-reads its own result; unit 113 (independent reader, SQLite engine, 10,752 names, layout record), e2e 49 (native SQLite, sqlglot, sqlparse read what the tab shows) |
| `prettier` | Code Formatter | PC only | data-engines | ✓ | 13 | 282 | engines changed (WASM-AUDIT 54): Biome's official wasm (JS/TS/CSS/SCSS/YAML/GraphQL), @dprint/json, dprint-plugin-markup + Biome (HTML, Vue); Prettier for Markdown and as fallback. Independent readers per language (TypeScript parser, PostCSS, yaml, marked + cmark-gfm, parse5, graphql-js, Vue compiler); 140 hazard sections x 8 option sets; typed text survives a language switch; stale results; Markdown fences; Vue ts scripts and handlers; JSON numbers as typed; worker |
| `mockdata` | Mock Data Generator | PC only | dev-data2 | ✓ | 10 | 47 | ranges beyond 32 bits, swapped / unreadable ranges explained, dd/mm/yyyy dates (threw 'Invalid time value'), id start, fine-grained decimals, duplicate / empty / __proto__ names, quoted SQL names (run in SQLite), word-count limit, no fields |
| `mdtable` | Markdown Table | PC only | dev-data2 | ✓ | 6 | 28 | separator found by the sheet engine (a tab in a quoted cell forced TSV); <br> for line breaks, also in the editor; table inside other text; CJK / emoji widths; 3,000 rows; output read by cmark-gfm |
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
| `unicode` | Unicode Inspector | PC only | misc | ✓ | 8 | 48 | e2e 16→30 + 34 unit |
| `hexview` | Hex Viewer | PC only | misc | ✓ | 5 | 33 | e2e 14→29 + 18 unit |
| `logview` | Log Viewer | PC only | misc | ✓ | 7 | 24 | e2e 13→32 + 5 unit (60 log lines) |
| `mermaid` | Mermaid Diagrams | PC only | misc | ✓ | 2 | 12 | e2e 9→21 |
| `sla` | SLA / Uptime Calculator | PC only | misc | ✓ | 3 | 19 | e2e 10→25 + 4 unit |
| `transfer` | Data Transfer Calculator | PC only | misc | ✓ | 4 | 18 | e2e 10→28 |
| `semver` | Semver Checker | PC only | misc | ✓ | 7 | 24 | e2e 8→18 + 14 unit; engine = our port of npm semver, 16,380 pairs vs the package |
| `glob` | Glob Tester | PC only | misc | ✓ | 2 | 44 | e2e 16→39 + 21 unit; own Unicode-aware matcher vs Python glob.translate (420 patterns) |
| `terminal` | Linux Terminal | PC only | terminal |  |  |  |  |
| `graphviz` | Graphviz (DOT) | PC only | data-engines | ✓ | 22 | 712 | engine: own build kept (WASM-AUDIT 55 — Viz.js and hpcc trap on valid graphs), now Graphviz 16.1.0 + storeline fix, prism on our Delaunator port, glibc qsort/rand (dot = native byte for byte), browser text measuring, assertions kept; reference = native dot (3,464 drawings) |
| `python` | Python Scratchpad | PC only | data-engines | ✓ | 18 | 313 | native CPython 3.14.8 is the reference for 69 programs (stdout + stderr byte for byte); recursion through C code ends in RecursionError instead of killing the run, lru_cache in Python (cached recursion as deep as on a desktop), local time with tzdata's names and flags, socket stand-in + asyncio, pbkdf2_hmac; output pane survives 300,000 lines (92 s → 1.4 s), shows output during long computations, \r / colours / the answers to input(); hints for errors particular to the tab |
| `totp` | TOTP / 2FA Codes | PC only | net | ✓ | 6 | 74 | e2e 11→49 + 25 unit; RFC 4226/6238; e2e 11→49; unit 36 (RFC 4226 / 6238, 600 random cases vs an independent implementation); HMAC = hash-wasm, Base32 + truncation = our supplement |
| `pwstrength` | Password Strength | PC only | net | ✓ | 6 | 95 | e2e 13→32 + 76 unit (new); 304 passwords vs Python zxcvbn |
| `jsonschema` | JSON Schema | PC only | data-engines | ✓ | 14 | 5431 | exact numbers and IDN formats switched on; inference no longer crashes on non-ASCII text and adds a format only when the validator accepts every example; plain messages (unknown $schema, $ref elsewhere, schema not valid at …), first 200 of N problems, formats not checked are named; reference = python-jsonschema verdicts for 5,338 pairs over five drafts, formats and patterns by hand against the RFCs / ECMA 262 |
| `bitwise` | Bitwise Calculator | PC only | bitswebref | ✓ | 6 | 40 | rotate ≥ width wrapped, shift ≥ width, B overflow note, + / spaces, outputs paste back, unused boxes off; vs BigInt, random operands |
| `ieee754` | IEEE-754 Inspector | PC only | bitswebref | ✓ | 5 | 45 | float32 ties (no double rounding) vs exact rationals; 1e-1000000 froze the page; stale result on bad input; too large / too small notes |
| `contrast` | Contrast Checker | PC only | bitswebref | ✓ | 3 | 31 | see-through colours blended; a fix for every failing pair (white/black fallback); rgb() / hsl() / names; 40 random pairs vs formula |
| `baseenc` | Base32 / Base58 / Ascii85 | PC only | bitswebref | ✓ | 9 | 98 | ≥ 8 MiB trapped the engine; Base58 froze on files; unpadded / spaced / 0x / data: input; file in Decode; vs Python base64 (147 values × 10) |
| `bindecode` | Protobuf / MsgPack / CBOR | PC only | bitswebref | ✓ | 15 | 87 | own CBOR + MessagePack readers; deep nesting broke the tab; undefined, simple, bignums, floats, 0xc1; vs cbor2 / msgpack / protobuf (480 messages) |
| `httpstatus` | HTTP Status Codes | PC only | bitswebref | ✓ | 2 | 19 | everyday words and old names find the code; nginx / Cloudflare / Laravel codes marked unofficial |
| `mime` | MIME Types | PC only | bitswebref | ✓ | 2 | 25 | exact extension first; image/jpg & co find the row; 17 more types |
| `ports` | Port Numbers | PC only | bitswebref | ✓ | 2 | 25 | exact port first; database / email / vpn / k8s find their ports; 27 more ports |
| `ascii` | ASCII Table | PC only | bitswebref | ✓ | 3 | 23 | newline / enter / ^C found; caret names; filter kept and focus not stolen by the Latin-1 switch |
| `keycode` | Key Codes | PC only | bitswebref | ✓ | 4 | 10 | keyboard trap removed (Tab, Enter / Space on buttons), browser keys left alone, AltGr |
| `gradient` | CSS Gradient | PC only | bitswebref | ✓ | 4 | 20 | transparency kept, stop goes into the widest gap, positions brought into range, only live controls enabled |
| `shadow` | CSS Box Shadow | PC only | bitswebref | ✓ | 1 | 18 | see-through colour refused with reason; presets, layer tabs, extremes |
| `svgo` | SVG Optimizer | PC only | bitswebref | ✓ | 7 | 59 | DOCTYPE files refused; Safe mode did nothing; deep nesting broke the engine; every result rendered and compared, safe fallback; .svgz / UTF-16 / Latin-1; 130 hazard drawings |
| `patch` | Patch Applier | PC only | misc | ✓ | 10 | 56 | e2e 10→24 + 42 unit; own reader/applier vs GNU patch (150 random patches) |

## codes
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `qr` | QR Generator | PC + mobile | security-codes | ✓ | 7 | 41 | zxing-wasm 3.1.7 kept (latest); qrdata.ts: UPI amounts as typed (commas were dropped), NPCI form, RFC 5545 escaping, SMS digits, Wi-Fi/colour checks, newest text wins; zbar read-back |
| `barcode` | Barcode Generator | PC + mobile | security-codes | ✓ | 5 | 44 | zxing-wasm kept; barcodes.ts: zero padding / capitals / ITF said, check digit worded + shown, zint errors in words, typed value kept across formats; zbar + libdmtx read-back |
| `scan` | QR & Barcode Scanner | PC + mobile | security-codes | ✓ | 3 | 31 | zxing-wasm kept; second Start leaked the camera; camera errors worded; describeCode: Wi-Fi/UPI/contact/event/e-mail/SMS/tel/geo fields, .vcf/.ics, paste, Clear |
| `zip` | Create Zip | PC + mobile | security-codes | ✓ | 5 | 28 | engine → 7-Zip (7z-wasm) + zip.js above 1.5 GB; non-ASCII zip passwords refused (7-Zip/WinRAR could not open them), wrong macOS note, password twice, duplicate names, Stop; 7z format |
| `unzip` | Extract Archive | PC + mobile | security-codes | ✓ | 3 | 23 | engine → 7-Zip reads everything (libarchive.js removed); password asked without re-choosing; '..' names made safe for folder saves; size guard; RAR/7z-encrypted-names/iso…; unar as RAR reference |

## everyday
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `stopwatch` | Stopwatch | PC + mobile | everyday-device |  |  |  |  |
| `countdown` | Countdown Timer | PC + mobile | everyday-device |  |  |  |  |
| `pomodoro` | Pomodoro | PC + mobile | everyday-device |  |  |  |  |
| `interval` | Interval Timer | PC + mobile | everyday-device |  |  |  |  |
| `dice` | Dice Roller | PC + mobile | everyday-device |  |  |  |  |
| `coin` | Coin Flip | PC + mobile | everyday-device |  |  |  |  |
| `rng` | Random Number | PC + mobile | everyday-device |  |  |  |  |
| `picker` | List Picker | PC + mobile | everyday-device |  |  |  |  |
| `teams` | Team Splitter | PC + mobile | everyday-device |  |  |  |  |

## device
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `webcam` | Webcam Test | PC + mobile | everyday-device |  |  |  |  |
| `mic` | Microphone Test | PC + mobile | everyday-device |  |  |  |  |
| `speaker` | Speaker Test | PC + mobile | everyday-device |  |  |  |  |
| `keyboard` | Keyboard Test | PC only | everyday-device |  |  |  |  |
| `pixels` | Dead Pixel Test | PC + mobile | everyday-device |  |  |  |  |
| `touch` | Touch Test | Mobile only | everyday-device |  |  |  |  |
| `screen` | Screen Info | PC + mobile | everyday-device |  |  |  |  |
| `level` | Bubble Level | Mobile only | everyday-device |  |  |  |  |
| `compass` | Compass | Mobile only | everyday-device |  |  |  |  |
| `soundmeter` | Sound Meter | PC + mobile | everyday-device |  |  |  |  |
| `ruler` | Ruler | PC + mobile | everyday-device |  |  |  |  |

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
