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
| `calc` | Scientific Calculator | PC + mobile | calc-core |  |  |  |  |
| `units` | Unit Converter | PC + mobile | calc-core |  |  |  |  |
| `dates` | Date Calculator | PC + mobile | calc-core |  |  |  |  |
| `emi` | EMI Calculator | PC + mobile | calc-core |  |  |  |  |
| `gst` | GST Calculator | PC + mobile | calc-core |  |  |  |  |
| `sip` | SIP Calculator | PC + mobile | calc-core |  |  |  |  |
| `fd` | FD / RD Calculator | PC + mobile | calc-core |  |  |  |  |
| `percent` | Percentage Calculator | PC + mobile | calc-core |  |  |  |  |
| `words` | Number to Words | PC + mobile | calc-core |  |  |  |  |
| `timezone` | Time Zone Converter | PC + mobile | calc-core |  |  |  |  |
| `bmi` | BMI Calculator | PC + mobile | calc-core |  |  |  |  |
| `calories` | Calorie Calculator | PC + mobile | calc-core |  |  |  |  |
| `duedate` | Pregnancy Due Date | PC + mobile | calc-core |  |  |  |  |
| `tip` | Tip & Bill Splitter | PC + mobile | calc-core |  |  |  |  |
| `fuel` | Fuel Cost Calculator | PC + mobile | calc-core |  |  |  |  |
| `gpa` | GPA Calculator | PC + mobile | calc-core |  |  |  |  |
| `base` | Number Base Converter | PC + mobile | calc-core |  |  |  |  |
| `roman` | Roman Numerals | PC + mobile | calc-core |  |  |  |  |
| `prepay` | Loan Prepayment | PC + mobile | calc2-math |  |  |  |  |
| `ppf` | PPF Calculator | PC + mobile | calc2-math |  |  |  |  |
| `epf` | EPF Calculator | PC + mobile | calc2-math |  |  |  |  |
| `nps` | NPS Calculator | PC + mobile | calc2-math |  |  |  |  |
| `inflation` | Inflation Calculator | PC + mobile | calc2-math |  |  |  |  |
| `sleep` | Sleep Cycle | PC + mobile | calc2-math |  |  |  |  |
| `bodyfat` | Body Fat | PC + mobile | calc2-math |  |  |  |  |
| `idealweight` | Ideal Weight | PC + mobile | calc2-math |  |  |  |  |
| `coords` | Coordinates Converter | PC + mobile | calc2-math |  |  |  |  |

## math
| id | Tab | Platform | Area | R | B | T | Notes |
|---|---|---|---|---|---|---|---|
| `graph` | Graphing Calculator | PC + mobile | calc2-math |  |  |  |  |
| `equation` | Equation Solver | PC + mobile | calc2-math |  |  |  |  |
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
| `sqlite` | SQLite Playground | PC only | data-engines |  |  |  |  |
| `jq` | jq Playground | PC only | data-engines | ✓ | 16 | 4951 | runs in a worker (10 s limit, Stop, 16 MB output stop, restart after out of memory); glue follows jq's main.c with jq's own input reader: messages with input.json:N, exit status of the last input, halt, debug / stderr, input_filename, -r -a; memory 2 GB and given back; reference = native jq 1.8.2 for 4,903 cases (unit) and 192 typed into the page |
| `yaml` | YAML ⇄ JSON ⇄ TOML | PC only | data-engines | ✓ | 21 | 1933 | own value model + own JSON / YAML / TOML writers: numbers keep every digit, YAML output quotes what YAML 1.1 parsers misread (no, y, 1_000, 1:30, dates), .inf / .nan and TOML dates travel, TOML refuses what 64 bits cannot hold; notes for keys written twice; outputs read back by PyYAML, ruamel.yaml and tomllib (1,750 texts), 393 texts written by other programs read correctly |
| `xml` | XML Formatter / XPath | PC only | dev-data2 | ✓ | 9 | 45 | own Rust formatter moves white space only: declaration, DOCTYPE, entities, &#10;, nbsp and padded text were lost or rewritten; <parsererror> element; xml: and default-namespace prefixes in XPath; ISO-8859-1 / UTF-16 files; 74 documents compared by Chrome's parser |
| `json2types` | JSON → Types | PC only | dev-data2 | ✓ | 10 | 110 | own Rust generator; every output compiled by tsc, go, rustc, javac, python for 36 samples: root lists / values as aliases, colliding and reserved names, shadowed type names, one-file Java, Python kw_only and kept keys, keys Go cannot tag, uint64 / BigInteger, plurals |
| `jsondiff` | JSON Diff | PC only | dev-data2 | ✓ | 5 | 70 | own Rust diff on the lossless reader: lists aligned by equal elements and by id (one removal was N changes); numbers by value and never rounded; duplicate keys; empty sides; Swap; rows carry both values; 400 random pairs with two appliers |
| `sqlfmt` | SQL Formatter | PC only | data-engines |  |  |  |  |
| `prettier` | Code Formatter | PC only | data-engines |  |  |  |  |
| `mockdata` | Mock Data Generator | PC only | dev-data2 | ✓ | 10 | 47 | ranges beyond 32 bits, swapped / unreadable ranges explained, dd/mm/yyyy dates (threw 'Invalid time value'), id start, fine-grained decimals, duplicate / empty / __proto__ names, quoted SQL names (run in SQLite), word-count limit, no fields |
| `mdtable` | Markdown Table | PC only | dev-data2 | ✓ | 6 | 28 | separator found by the sheet engine (a tab in a quoted cell forced TSV); <br> for line breaks, also in the editor; table inside other text; CJK / emoji widths; 3,000 rows; output read by cmark-gfm |
| `cidr` | Subnet / CIDR Calculator | PC only | net | ✓ | 3 | 74 | e2e 15→43 + 46 unit; 300 cases vs Python ipaddress |
| `chmod` | chmod Calculator | PC only | net | ✓ | 3 | 26 | e2e 13→39; 800 modes + 1,152 expressions vs real chmod |
| `x509` | Certificate Decoder | PC only | net | ✓ | 10 | 66 | e2e 16→45 + 37 unit; fixtures vs OpenSSL |
| `sshkey` | SSH Key Generator | PC only | net | ✓ | 2 | 58 | e2e 16→34 + 40 unit; keys from another tool |
| `hmac` | HMAC Generator | PC only | net | ✓ | 4 | 55 | e2e 10→30 + 35 unit; streaming, RFC 4231 |
| `pwhash` | Password Hash Tool | PC only | net | ✓ | 3 | 51 | e2e 15→31 + 36 unit |
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
| `graphviz` | Graphviz (DOT) | PC only | data-engines |  |  |  |  |
| `python` | Python Scratchpad | PC only | data-engines | ✓ | 18 | 313 | native CPython 3.14.8 is the reference for 69 programs (stdout + stderr byte for byte); recursion through C code ends in RecursionError instead of killing the run, lru_cache in Python (cached recursion as deep as on a desktop), local time with tzdata's names and flags, socket stand-in + asyncio, pbkdf2_hmac; output pane survives 300,000 lines (92 s → 1.4 s), shows output during long computations, \r / colours / the answers to input(); hints for errors particular to the tab |
| `totp` | TOTP / 2FA Codes | PC only | net | ✓ | 6 | 63 | e2e 11→49 + 25 unit; RFC 4226/6238 |
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

### Software › data-engine tabs (17 Nov 2026, in progress) — jq, yaml, jsonschema, python done; sqlite, sqlfmt, prettier, graphviz open
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
