# Hand-off notes — read after CLAUDE.md and docs/RESUME.md

Written at the end of the long session of **16 Nov 2026** (session that built Media + the per-tab test suites) so the next
session knows everything that was only said in chat. CLAUDE.md = rules and spec, RESUME.md = status and next steps,
this file = the owner's latest wishes, how the tests are written, and the traps already found. Keep it current.

## 1. The owner (from chat)
- Wants **"amazing", extensive test cases for every utility** — one independent e2e suite per tab with known answers,
  edge cases, invalid input, phone layout. Real app bugs found by tests are fixed in the app, never hidden in the test.
- Wants work to **continue autonomously** ("continue building everything out") and to be able to stop at any moment:
  commit + push after every finished group (at least every ~45 minutes, even WIP) and update RESUME.md each time.
- Uses a **desktop PC with Kubuntu** (X11/Wayland) and an Android/iPhone; lives in **India (IST, UTC+5:30)**.
- New-tab ideas: `docs/potentials.md` (54 ideas + 7 upgrades, 3 rounds + #54 draw.io) and the older `docs/IDEAS.md`.
  **Nothing there is accepted.** The owner asked to be **reminded** about it when the per-tab test work is finished
  (before starting the Software tabs) and at the start of a new session. The owner said **keep #21 Excalidraw** (as well
  as #54 Diagram Editor). The owner **removed** Chess (Stockfish), Python/JS Linter (Ruff/Biome) and Offline
  Translation (Bergamot) — never suggest them again.
- draw.io (#54) was checked: the `jgraph/drawio` LICENSE is plain Apache-2.0 (re-check the pinned version); do not use the
  draw.io name/logo as our branding; self-host the real app (not a clone), embed mode, no cloud/storage, PC only.
- Questions the owner asked and the answers given: closing the PC does not stop a cloud session; the "out of disk, memory
  or time" banner means this session's machine/time is used up (the fix is a new session — work is safe in Git); the
  previous session started this one with `create_session` and stopped itself so two sessions never edit the branch.

- **17 Nov 2026:** asked for a second, exhaustive bug hunt over every tab ("don't leave out any app") and to
  "increase test coverage significantly for each app/utility" — tracker `docs/BUGHUNT.md`, method in RESUME.md.
- **17 Nov 2026 — engine rule, final wording** (CLAUDE.md STANDING RULE #1): "Existing tested WebAssembly builds from other
  people are preferred. If they are not there, build the WebAssembly module yourself from open-source source code. If
  that's not possible in the existing framework, or for the features needed, then use JS or TS — make a note."
- **17 Nov 2026 — `todo.md`** is the owner's to-do list (the owner calls it "to do"). First item: sweep the code again
  and move as much JS/TS as possible into WebAssembly modules, where doable. **The owner (17 Nov 2026): "Don't start
  doing the todo.md on your own. At some point, show me the items and ask me which ones to build out."**
- **18 Nov 2026 — audit + order of work per tab:** the owner had the 51 hunted tabs audited for handwritten
  WebAssembly that an existing module could replace (`docs/WASM-AUDIT.md`: HMAC → hash-wasm; everything else kept,
  reason per tab) and set the order for every later tab: **(1) existing-module check, entry in WASM-AUDIT.md →
  (2) bugs → (3) extensive tests → (4) fix and re-test → next tab.** A replacement always means re-running the
  tab's suites. How candidates are found: `curl "https://registry.npmjs.org/-/v1/search?text=<topic>%20wasm&size=60"`
  (`downloads.monthly`), keep packages that name both the topic and WebAssembly, then run the serious ones against
  our own reference cases in a scratch folder.
- **17 Nov 2026 — two standing rules, now at the top of CLAUDE.md:** #1 WebAssembly first (**order settled by the owner on
  18 Nov 2026**: first an existing tried-and-tested WebAssembly module, a famous good one — used only if it
  satisfies everything the owner asked for that utility; if there is none or none fits, our own
  build from open-source code — also ports of JS/TS-only functionality where possible; only then a JS/TS library as
  it is; everything hosted in the app). #2 Extensive tests for every utility: test, fix the bug or the test, test again.

## 2. Status at hand-off (commit 5f87b87)
Own e2e suites now exist for **Calculators 27/27, Math & Science 7/7, Text 9/9, the 8 developer tabs (json, regex,
base64, urlenc, epoch, uuid, color, jwt), Security 5/5 (+pgp), Codes & Files 5/5**, plus all tabs built since Media.
**Update (same night, later session):** Everyday 9/9 and Device 11/11 suites written too — **every built tab now has its
own suite**. **Owner (later that night): "Finish all the original apps before asking me about potentials.md"** → build
the 47 Software stub tabs (each with its own suite) first, then ask about potentials.md. ~45 app bugs were found and fixed by the new suites — list in RESUME.md "Next steps" item 1.

## 3. How the suites are written (conventions)
- Run one suite: `npm run build && node tests/e2e.mjs <name>.e2e` (filter = substring of the file name). All:
  `node tests/e2e.mjs`. Unit: `npm test`. A suite exports `default async ({ base, page, ok, info, download, tmp, devices })`;
  `page(opts)` makes an isolated context (opts → `browser.newContext`, e.g. `{ timezoneId: 'Asia/Kolkata' }`,
  `{ permissions: ['clipboard-read', 'clipboard-write'] }`, `devices['iPhone 13']`); `page.errors` collects page errors
  **and console errors**.
- Helpers: `tests/lib/calc.mjs` (`calc(page)`: `set(label, v)`, `seg(label, option)`, `pick(label, value)`, `big(label)`,
  `row(label)`, `rows()`, `warn()`; `num()`, `inr()`), `tests/e2e/_pconly.mjs` (PC-only tab shows the desktop note on a
  phone), `tests/e2e/_scanback.mjs` (read codes in an image with the Scanner tab), `tests/lib/pdfcheck.mjs` (PDFs), `tests/e2e/_phone.mjs` (`phoneLayout(ctx, id, { ready, buttons, before })`: 390×844, no
  horizontal scroll, buttons ≥ 44 px, no page errors), `_mobileonly.mjs` (Mobile-only tab shows the note on a desktop),
  `_stats.mjs` (`chiUniform(counts)`, p = 1e-4 limit), `_phases.mjs` (Pomodoro/Interval under the fake clock),
  `_media.mjs` (`fakeMedia` init script: canvas camera + oscillator microphone, `window.__gumError`, `__tracks`;
  `allStopped`, `trackAudioContexts`).
- Independent answers: re-implement the formula/rule in the test (see emi, prepay, epf, coords, stats, matrix suites),
  use Node's crypto for hashes, Python for archives (`zipfile`, `tarfile`, `pyzipper`, `py7zr`) and the reference
  decryptor `tools/sodium_decrypt.py` (PyNaCl); randomness → chi-square (password suite); timers → `page.clock`.
- Phone check in every suite: `devices['iPhone 13']`, `document.documentElement.scrollWidth <= innerWidth`.

## 4. UI facts the locators depend on (src/ui.ts)
- `field(label, control)`: a native input/select/textarea is wrapped in `<label>` → `getByLabel` works. Anything else
  (password box with eye button, `outputBox`, segmented) is a `div role=group aria-label=label` → `getByLabel` returns the
  group; target the inner control: `page.locator('.field').filter({ has: page.locator('.field-label', { hasText: /^Label$/ }) }).locator('textarea')`.
- `toggle()` = `<label class="switch">` around a checkbox: click `page.locator('label.switch').filter({ hasText: 'Name' })`.
- `segmented()` = radios: `page.getByRole('radio', { name, exact: true })`.
- `outputBox()` = `div.outbox` (textarea + Copy button) — two "Copy" buttons may exist; scope to `.actions`.
- Password inputs (security tabs) carry `aria-label` → `page.locator('input[aria-label="Password"]')`.
- `button()` shows thrown errors (sync and async) as a toast **and** logs them with console.error, so expected validation
  messages appear in `page.errors` — filter them: `page.errors.filter((e) => !/expected message/.test(e))`.
- `filePicker()`: hidden `<input type=file>` inside `.drop` → `page.locator('.drop input[type=file]').setInputFiles(...)`.
- Formatting: `fmtN` drops trailing zeros (en-US, max decimals); `fmtINR` Indian grouping, negatives "−₹1,234", ₹0 not ₹-0.
- Router: same tab + changed own hash parameters → re-mounted (`?from=` ignored).

## 5. Traps already found
- **zig's wasm32-wasi libc** (single-threaded): an implicitly declared function gets the wrong wasm signature and traps
  at run time (force-include prototypes — wasm/graphviz/compat.h); the main thread's musl thread list is unlinked, so
  `pthread_key_delete` loops forever (wasm/python/wasi_start.c); the process starts in "/" whatever PWD says; zig cc
  rejects some linker flags (`--stack-first`, `--allow-multiple-definition`). C++ throw → `cxxabi_stubs.c` (abort).
- Graphviz keeps pointers to the strings passed to it and can leave a pending job after an error: copy the strings and
  use a fresh GVC context per call (wasm/graphviz/glue.c).
- Under the full parallel e2e run (8 suites at once) mermaid, noise, resume and stt can miss a timing/accuracy check;
  re-run those suites alone before chasing a bug.
- Playwright **drops files whose path is not ASCII** in `setInputFiles` — pass `{ name, mimeType, buffer }` objects.
- Playwright `fill()` is extremely slow with very long multi-line text (10,000 lines) — set `value` in `evaluate` and
  dispatch `input`.
- Don't put `await locator.textContent()` inside an `ok()` message when the element may not exist (30 s timeout crash).
- Audio timing: patch `AudioParam.prototype.setValueAtTime` with `addInitScript` and read the schedule (morse suite).
- Camera: replace `navigator.mediaDevices.getUserMedia` with a canvas `captureStream()` (scan suite).
- Debugging a page by hand: `npx vite preview --port 4173 &` and a scratch script using
  `createRequire('/home/user/utils/tests/e2e.mjs')('playwright')`.
- Fake clock (`page.clock.install` → `pauseAt` → `runFor`/`fastForward`): rAF-driven displays show the last *frame*
  (16 ms steps) — run a little past a boundary (e.g. `runFor(1100)` for "1 s later"). `fastForward` fires a due timer
  only once, so walk multi-phase timers one phase at a time.
- `E2E_STACK=1 node tests/e2e.mjs <suite>` prints the suite's line number when it crashes.
- A test that runs a child process against an HTTP server living in the test process must spawn it asynchronously
  (a synchronous child deadlocks the server).
- `page.goto` to the URL the page is already on (same hash) does not re-mount the tab — go to another tab first.
- Orientation events (level, compass) reach listeners only when the context has the `accelerometer`, `gyroscope`,
  `magnetometer` permissions. Real multi-touch: CDP `Input.dispatchTouchEvent` (synthetic PointerEvents break
  `setPointerCapture`).
- `element.style.left/transform` read back with 6 significant digits — compare with a relative tolerance.
- V8 JSON errors: "Unexpected token" messages have no position (JSON tab finds it by prefix search).

## 6. Machine setup
The environment "utils" has a setup script (added 16 Nov 2026) that installs `pynacl pyzipper py7zr` (pip --user),
Zig 0.17.1 at `/tmp/zig/x/ziglang/zig` and runs `npm ci`; the variable `ZIG` points at Zig. If a machine lacks them, run:
```bash
python3 -m pip install --user -q pynacl pyzipper py7zr bcrypt argon2-cffi zxcvbn requests
python3 -m pip download -q ziglang==0.17.1 --no-deps -d /tmp/zig && python3 -m zipfile -e /tmp/zig/ziglang-0.17.1-*.whl /tmp/zig/x && chmod +x /tmp/zig/x/ziglang/zig
export ZIG=/tmp/zig/x/ziglang/zig
```

## 7. Limits (usage / session time)
- Commit + push at least every ~45 minutes, with RESUME.md saying exactly what is half-done.
- If a usage limit is close, schedule a `send_later` to this session for just after the reset time.
- **No scheduled check-ins exist** (creating them was blocked by the session's permission check on 16 Nov 2026). If a
  session stops (usage limit, time limit), its pushed work is safe; the owner starts a new session with the standard
  message in RESUME.md ("Continue building SuperTools…"), or the session schedules its own `send_later` before a limit.

## Bug hunt — lessons so far (17 Nov 2026)
- **Usage limit:** 12 reviewer sub-agents in parallel exhausted the owner's 5-hour limit before most had written a
  report. Review area by area in the main session; at most one helper at a time, and only for a narrow question.
- **What finds bugs fastest:** compare the tab with an independent reference in bulk (hundreds of cases), not with a few
  hand-picked examples: real `curl` against a local server, GNU `chmod` + `stat`, `openssl x509 -text`, Python
  `ipaddress` / `cryptography` / `hashlib` / `argon2-cffi` / `zxcvbn`, Node `crypto`, RFC appendices. Seeded generators
  live in `scripts/make-*-reference.py`; their JSON output is committed under `tests/fixtures/` so the tests stay
  hermetic.
- **Third-party engines have bugs too:** the zxcvbn crate needed four fixes (`wasm/zxcvbn/zxcvbn-fixes.patch`, applied
  to the checksum-verified crate at build time). Check a port against its reference implementation before trusting it.
- **Traps in the tests:** Playwright's `setInputFiles` cannot open a path with non-ASCII characters in this sandbox's
  C locale — pass `{ name, mimeType, buffer }`; run bash with `LC_ALL=C.UTF-8` when it must decode `\uXXXX`;
  `console.log` inside a unit suite shows only its first line — write debug output to a file.
- **Runner:** `node tests/e2e.mjs cidr chmod. x509` and `node tests/unit.mjs keys devcore` take several filters
  (`chmod.` = the whole name, so `chmod` does not also pick another suite).
- **Push often (owner, 17 Nov 2026 — CLAUDE.md STANDING RULE #3):** commit and push after every meaningful step; do
  NOT wait for the complete e2e run or for the whole utility. Before a push: `npm run build` passes and the suites of
  what was touched have been run. The COMPLETE e2e suite (`npm run build && node tests/e2e.mjs`, about 10 minutes; run
  nothing heavy beside it — cargo, tsc, probes make timing checks fail) runs at the end of each area; its fixes are
  pushed as their own commit.
  One lesson stays: a push goes live (GitHub Pages deploys the branch). Commit 277b640 changed the engine life cycle,
  was pushed after only the shell suites had run and broke Hash / Sodium Encrypt / Share Link on the live site. So when
  a **shared module** changes (`src/lifecycle.ts`, `src/ui.ts`, `src/main.ts`, `src/wasm/wasi.ts`, a worker client),
  run at least `shell every-tab lazy no-external` and the suites of the tabs that use it before that push, and the
  complete run right after.
- **Limits of 32-bit wasm show up only with big inputs:** `data-encoding` asserts `len <= usize::MAX / 512`, so Base64
  of an 8 MiB file trapped ("unreachable"). Try every file tool with a file of 8–10 MB and one of 64 MB+.
- **Recursion = stack overflow = a broken instance.** Any recursive parser or visitor in wasm (protobuf nesting, CBOR,
  MessagePack, SVG groups) needs a depth limit; after a trap the module's memory is in an unknown state and every later
  call fails, so the JS wrapper must drop the instance (`resetSvgo()` in `src/wasm/svgo.ts` is the pattern).
- **An optimiser must be checked by its output, not trusted:** OXVG's "safe" preset was not safe and its default preset
  changes 13 of 130 hazard drawings. The SVG tab now rasterises original and result and compares them (`sv_diff`,
  thresholds calibrated on 630 real icons at 256 px: plain mean differences up to 2.7 levels are harmless colour
  rounding; real changes show as > 0.4 % of pixels differing by more than 48 after a 3 × 3 neighbourhood match).
- **A waitForFunction that matches the previous state is a silent pass/fail lottery:** wait for text that only the new
  result can contain (a byte count, a file name), never for "a note exists". An idle machine is faster than the page.
- **`outputBox()` already has its own Copy icon** — adding a "Copy" button next to it gives two buttons with the same
  name (strict-mode failures in tests, and they can copy different things when the display is cut).
- **Keyboard handlers on `window` (Key Codes, Keyboard Test):** never `preventDefault` Tab, F-keys or Ctrl/Meta
  shortcuts, and let Enter / Space through when a button or link has the focus — otherwise the tab is a keyboard trap.
- **A "formatter" that parses and prints again changes the data.** JSON.parse → JSON.stringify reorders integer-like
  keys, drops duplicate keys and rounds numbers; DOMParser → serialiser drops the DOCTYPE, expands entities and (with
  indentation) trims text. A formatter must work on the text: tokens stay byte-for-byte, only layout white space moves
  (`wasm/devcore/src/jsonfmt.rs`, `xmlfmt.rs`). Test it that way: token streams equal, a second run changes nothing.
- **Generated code must be compiled in the suite**, not eyeballed: `tests/e2e/json2types.e2e.mjs` builds every output
  with tsc / go / cargo / javac / python and round-trips the sample (one invocation per language; Go packages and Rust
  modules per sample; caches in the OS temp folder). It found ten classes of code that did not compile.
- **Invisible characters in source:** `\u202e`, `\u2028`, `\ufeff` typed as escapes can arrive in a written file as
  the raw characters (a raw U+2028 ends a regex literal; rustc refuses raw bidi marks). After writing a test or source
  file that mentions them, check: `python3 -c "import re,sys; print(re.findall('[\u200b-\u200f\u202a-\u202e\u2028\u2029\ufeff]', open(sys.argv[1], encoding='utf-8').read()))" <file>`.
- **Playwright's fake clock:** `page.clock.install()` lets time run; use `pauseAt()` when a check needs a fixed
  "now". Under an installed clock `performance.getEntriesByType('resource')` is empty — ask
  `__supertoolsLive().resources` instead to see which engine a tab loaded.
- **Round-trip tests need the reference's own limits:** Go's `omitempty` cannot tell null / {} / [] from absent,
  serde refuses duplicate keys, encoding/json has no tag for keys with a comma, a quote or a combining mark, Chrome's
  canvas clips out-of-gamut colours while CSS Color 4 maps them. Encode each such limit as an explicit exception list
  in the test, with the reason.
- **Text precision is a testable property:** HSL needs 1 decimal and OKLCH 2 / 5 / 2 decimals for every 8-bit colour
  to come back exactly — found by running the whole RGB cube (22 s in Node), not by choosing "enough" digits.

- **Choosing between existing engines (Code Formatter, 19 Nov 2026):** do not trust a README or a compatibility
  percentage — run every candidate over hazard texts *and* real files and let a parser that belongs to none of them
  read the result (`tests/lib/codefmt-check.mjs`). That is how dprint's TypeScript plugin (invalid JavaScript for one
  input), its YAML plugin (data changed) and three Markdown / HTML formatters (rendering changed) were found out, and
  how Biome's young YAML formatter earned its place (654 real files, none changed). Real files on this machine:
  `~/.cargo/registry` (YAML, Markdown, TS), `/opt/google-cloud-sdk` (YAML, HTML), node_modules, Python's and Ruby's
  docs; Vue sources come from npm tarballs (primevue 3, element-ui). `plugins.dprint.dev` is blocked here — dprint
  plugins are on npm (`@dprint/json`, `dprint-plugin-markup` …).
- **The reader must be stricter than the formatter, but not wrong:** every allowance in a reader has to be a rule of
  the language (Sass: `$a -$b` subtracts, `1 -2` is a list — sass-lang.com says so, my first guess said otherwise;
  CSS: `1px+2px` is two numbers; a `<text>` in SVG is the only place where white space shows). When all three
  formatters "fail" the same check, the check is the suspect; when one fails alone, it is the formatter.
- **Two engines joined by glue need a guard at the seam** (markup_fmt handing Vue expressions to Biome): a cheap
  invariant checked on every result (same letters in, same letters out) turns an unknown seam bug into a fallback.
- **Node 22 imports `src/lib/*.ts` directly** (type stripping) when the file holds only erasable syntax — scripts and
  e2e suites can run the app's pure modules without Vite (`tests/lib/codefmt-node.mjs`).
- **Opening a file in an e2e test:** the tab reads the file before it starts work, so the notes of the previous result
  are still there — take them away first (`openFile` in `tests/e2e/prettier.e2e.mjs`) or the wait matches the old state.
