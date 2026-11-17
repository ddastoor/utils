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
| `cidr` | Subnet / CIDR Calculator | PC only | net | ✓ | 3 | 74 | e2e 15→43 + 46 unit; 300 cases vs Python ipaddress |
| `chmod` | chmod Calculator | PC only | net | ✓ | 3 | 26 | e2e 13→39; 800 modes + 1,152 expressions vs real chmod |
| `x509` | Certificate Decoder | PC only | net | ✓ | 10 | 66 | e2e 16→45 + 37 unit; fixtures vs OpenSSL |
| `sshkey` | SSH Key Generator | PC only | net | ✓ | 2 | 58 | e2e 16→34 + 40 unit; keys from another tool |
| `hmac` | HMAC Generator | PC only | net | ✓ | 4 | 55 | e2e 10→30 + 35 unit; streaming, RFC 4231 |
| `pwhash` | Password Hash Tool | PC only | net | ✓ | 3 | 51 | e2e 15→31 + 36 unit |
| `apikey` | API Key Generator | PC only | net | ✓ | 2 | 15 | e2e 11→26 |
| `curl` | cURL Converter | PC only | net | ✓ | 12 | 89 | e2e 10→22 (35 commands vs real curl) + 77 unit (new) |
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
| `totp` | TOTP / 2FA Codes | PC only | net | ✓ | 6 | 63 | e2e 11→49 + 25 unit; RFC 4226/6238 |
| `pwstrength` | Password Strength | PC only | net | ✓ | 6 | 95 | e2e 13→32 + 76 unit (new); 304 passwords vs Python zxcvbn |
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
