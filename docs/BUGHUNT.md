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
| `image` | Image Editor | PC + mobile | images1 |  |  |  |  |
| `batch` | Batch Images | PC only | images1 |  |  |  |  |
| `heic` | HEIC → JPG | PC + mobile | images1 |  |  |  |  |
| `passport` | Passport Photo | PC + mobile | images2 |  |  |  |  |
| `formphoto` | Photo & Signature Resizer | PC + mobile | images2 |  |  |  |  |
| `bgremove` | Background Remover | PC + mobile | images2 |  |  |  |  |
| `cartoon` | Cartoonizer | PC + mobile | images2 |  |  |  |  |
| `redact` | Blur & Redact | PC + mobile | images2 |  |  |  |  |
| `watermark` | Watermark | PC + mobile | images1 |  |  |  |  |
| `caption` | Text on Image | PC + mobile | images1 |  |  |  |  |
| `collage` | Collage Maker | PC + mobile | images1 |  |  |  |  |
| `exif` | EXIF / Photo Info | PC + mobile | images1 |  |  |  |  |
| `scanner` | Doc Scanner | PC + mobile | images2 |  |  |  |  |
| `ocr` | OCR | PC + mobile | images2 |  |  |  |  |
| `signature` | Signature Maker | PC + mobile | images1 |  |  |  |  |

## documents
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `pdf-merge` | Merge PDF | PC + mobile | pdf |  |  |  |  |
| `pdf-split` | Split PDF | PC + mobile | pdf |  |  |  |  |
| `pdf-organize` | Organize PDF | PC + mobile | pdf |  |  |  |  |
| `img2pdf` | Images → PDF | PC + mobile | pdf |  |  |  |  |
| `pdf2img` | PDF → Images | PC + mobile | pdf |  |  |  |  |
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
| `pgp` | OpenPGP | PC + mobile | security-codes |  |  |  |  |
| `sodium` | Sodium Encrypt | PC + mobile | security-codes |  |  |  |  |
| `sharelink` | Encrypted Share Link | PC + mobile | security-codes |  |  |  |  |
| `hash` | Hash / Checksum | PC + mobile | security-codes |  |  |  |  |
| `password` | Password Generator | PC + mobile | security-codes |  |  |  |  |
| `passphrase` | Passphrase Generator | PC + mobile | security-codes |  |  |  |  |

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
| `stats` | Statistics | PC + mobile | calc2-math |  |  |  |  |
| `matrix` | Matrix Calculator | PC + mobile | calc2-math |  |  |  |  |
| `fraction` | Fraction Calculator | PC + mobile | calc2-math |  |  |  |  |
| `primes` | Prime / LCM / GCD | PC + mobile | calc2-math |  |  |  |  |
| `periodic` | Periodic Table | PC + mobile | calc2-math |  |  |  |  |

## text
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `wordcount` | Word Counter | PC + mobile | text |  |  |  |  |
| `case` | Case Converter | PC + mobile | text |  |  |  |  |
| `lines` | Line Tools | PC + mobile | text |  |  |  |  |
| `replace` | Find & Replace | PC + mobile | text |  |  |  |  |
| `diff` | Text Diff | PC + mobile | text |  |  |  |  |
| `fancy` | Fancy Text | PC + mobile | text |  |  |  |  |
| `emoji` | Emoji & Symbols | PC + mobile | text |  |  |  |  |
| `morse` | Morse Code | PC + mobile | text |  |  |  |  |
| `lorem` | Lorem Ipsum | PC + mobile | text |  |  |  |  |
| `photodict` | Photo Dictionary | Mobile only | text |  |  |  |  |

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
| `qr` | QR Generator | PC + mobile | security-codes |  |  |  |  |
| `barcode` | Barcode Generator | PC + mobile | security-codes |  |  |  |  |
| `scan` | QR & Barcode Scanner | PC + mobile | security-codes |  |  |  |  |
| `zip` | Create Zip | PC + mobile | security-codes |  |  |  |  |
| `unzip` | Extract Archive | PC + mobile | security-codes |  |  |  |  |

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

