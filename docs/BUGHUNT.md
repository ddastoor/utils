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
| `json` | JSON Formatter | PC only | dev-data2 |  |  |  |  |
| `regex` | Regex Tester | PC only | dev-data2 |  |  |  |  |
| `base64` | Base64 | PC only | dev-data2 |  |  |  |  |
| `urlenc` | URL Encoder | PC only | dev-data2 |  |  |  |  |
| `epoch` | Epoch Converter | PC only | dev-data2 |  |  |  |  |
| `uuid` | UUID Generator | PC only | dev-data2 |  |  |  |  |
| `color` | Color Converter | PC only | dev-data2 |  |  |  |  |
| `jwt` | JWT Decoder | PC only | dev-data2 |  |  |  |  |
| `sqlite` | SQLite Playground | PC only | data-engines |  |  |  |  |
| `jq` | jq Playground | PC only | data-engines |  |  |  |  |
| `yaml` | YAML ⇄ JSON ⇄ TOML | PC only | data-engines |  |  |  |  |
| `xml` | XML Formatter / XPath | PC only | dev-data2 |  |  |  |  |
| `json2types` | JSON → Types | PC only | dev-data2 |  |  |  |  |
| `jsondiff` | JSON Diff | PC only | dev-data2 |  |  |  |  |
| `sqlfmt` | SQL Formatter | PC only | data-engines |  |  |  |  |
| `prettier` | Code Formatter | PC only | data-engines |  |  |  |  |
| `mockdata` | Mock Data Generator | PC only | dev-data2 |  |  |  |  |
| `mdtable` | Markdown Table | PC only | dev-data2 |  |  |  |  |
| `cidr` | Subnet / CIDR Calculator | PC only | net |  |  |  |  |
| `chmod` | chmod Calculator | PC only | net |  |  |  |  |
| `x509` | Certificate Decoder | PC only | net |  |  |  |  |
| `sshkey` | SSH Key Generator | PC only | net |  |  |  |  |
| `hmac` | HMAC Generator | PC only | net |  |  |  |  |
| `pwhash` | Password Hash Tool | PC only | net |  |  |  |  |
| `apikey` | API Key Generator | PC only | net |  |  |  |  |
| `curl` | cURL Converter | PC only | net |  |  |  |  |
| `cron` | Cron Explainer | PC only | misc |  |  |  |  |
| `escape` | String Escape | PC only | misc |  |  |  |  |
| `unicode` | Unicode Inspector | PC only | misc |  |  |  |  |
| `hexview` | Hex Viewer | PC only | misc |  |  |  |  |
| `logview` | Log Viewer | PC only | misc |  |  |  |  |
| `mermaid` | Mermaid Diagrams | PC only | misc |  |  |  |  |
| `sla` | SLA / Uptime Calculator | PC only | misc |  |  |  |  |
| `transfer` | Data Transfer Calculator | PC only | misc |  |  |  |  |
| `semver` | Semver Checker | PC only | misc |  |  |  |  |
| `glob` | Glob Tester | PC only | misc |  |  |  |  |
| `terminal` | Linux Terminal | PC only | terminal |  |  |  |  |
| `graphviz` | Graphviz (DOT) | PC only | data-engines |  |  |  |  |
| `python` | Python Scratchpad | PC only | data-engines |  |  |  |  |
| `totp` | TOTP / 2FA Codes | PC only | net |  |  |  |  |
| `pwstrength` | Password Strength | PC only | net |  |  |  |  |
| `jsonschema` | JSON Schema | PC only | data-engines |  |  |  |  |
| `bitwise` | Bitwise Calculator | PC only | bitswebref |  |  |  |  |
| `ieee754` | IEEE-754 Inspector | PC only | bitswebref |  |  |  |  |
| `contrast` | Contrast Checker | PC only | bitswebref |  |  |  |  |
| `baseenc` | Base32 / Base58 / Ascii85 | PC only | bitswebref |  |  |  |  |
| `bindecode` | Protobuf / MsgPack / CBOR | PC only | bitswebref |  |  |  |  |
| `httpstatus` | HTTP Status Codes | PC only | bitswebref |  |  |  |  |
| `mime` | MIME Types | PC only | bitswebref |  |  |  |  |
| `ports` | Port Numbers | PC only | bitswebref |  |  |  |  |
| `ascii` | ASCII Table | PC only | bitswebref |  |  |  |  |
| `keycode` | Key Codes | PC only | bitswebref |  |  |  |  |
| `gradient` | CSS Gradient | PC only | bitswebref |  |  |  |  |
| `shadow` | CSS Box Shadow | PC only | bitswebref |  |  |  |  |
| `svgo` | SVG Optimizer | PC only | bitswebref |  |  |  |  |
| `patch` | Patch Applier | PC only | misc |  |  |  |  |

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
