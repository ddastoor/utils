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

## 2. Status at hand-off (commit 5f87b87)
Own e2e suites now exist for **Calculators 27/27, Math & Science 7/7, Text 9/9, the 8 developer tabs (json, regex,
base64, urlenc, epoch, uuid, color, jwt), Security 5/5 (+pgp), Codes & Files 5/5**, plus all tabs built since Media.
**Remaining:** Everyday (stopwatch, countdown, pomodoro, interval, dice, coin, rng, picker, teams) and Device (webcam, mic,
speaker, keyboard, pixels, touch, screen, level, compass, soundmeter, ruler). Then: remind the owner (above), then the
47 Software tabs. ~45 app bugs were found and fixed by the new suites — list in RESUME.md "Next steps" item 1.

## 3. How the suites are written (conventions)
- Run one suite: `npm run build && node tests/e2e.mjs <name>.e2e` (filter = substring of the file name). All:
  `node tests/e2e.mjs`. Unit: `npm test`. A suite exports `default async ({ base, page, ok, info, download, tmp, devices })`;
  `page(opts)` makes an isolated context (opts → `browser.newContext`, e.g. `{ timezoneId: 'Asia/Kolkata' }`,
  `{ permissions: ['clipboard-read', 'clipboard-write'] }`, `devices['iPhone 13']`); `page.errors` collects page errors
  **and console errors**.
- Helpers: `tests/lib/calc.mjs` (`calc(page)`: `set(label, v)`, `seg(label, option)`, `pick(label, value)`, `big(label)`,
  `row(label)`, `rows()`, `warn()`; `num()`, `inr()`), `tests/e2e/_pconly.mjs` (PC-only tab shows the desktop note on a
  phone), `tests/e2e/_scanback.mjs` (read codes in an image with the Scanner tab), `tests/lib/pdfcheck.mjs` (PDFs).
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
- Playwright **drops files whose path is not ASCII** in `setInputFiles` — pass `{ name, mimeType, buffer }` objects.
- Playwright `fill()` is extremely slow with very long multi-line text (10,000 lines) — set `value` in `evaluate` and
  dispatch `input`.
- Don't put `await locator.textContent()` inside an `ok()` message when the element may not exist (30 s timeout crash).
- Audio timing: patch `AudioParam.prototype.setValueAtTime` with `addInitScript` and read the schedule (morse suite).
- Camera: replace `navigator.mediaDevices.getUserMedia` with a canvas `captureStream()` (scan suite).
- Debugging a page by hand: `npx vite preview --port 4173 &` and a scratch script using
  `createRequire('/home/user/utils/tests/e2e.mjs')('playwright')`.
- V8 JSON errors: "Unexpected token" messages have no position (JSON tab finds it by prefix search).

## 6. Machine setup
The environment "utils" has a setup script (added 16 Nov 2026) that installs `pynacl pyzipper py7zr` (pip --user),
Zig 0.17.1 at `/tmp/zig/x/ziglang/zig` and runs `npm ci`; the variable `ZIG` points at Zig. If a machine lacks them, run:
```bash
python3 -m pip install --user -q pynacl pyzipper py7zr
python3 -m pip download -q ziglang==0.17.1 --no-deps -d /tmp/zig && python3 -m zipfile -e /tmp/zig/ziglang-0.17.1-*.whl /tmp/zig/x && chmod +x /tmp/zig/x/ziglang/zig
export ZIG=/tmp/zig/x/ziglang/zig
```

## 7. Limits (usage / session time)
- Commit + push at least every ~45 minutes, with RESUME.md saying exactly what is half-done.
- If a usage limit is close, schedule a `send_later` to this session for just after the reset time.
- The previous session scheduled **three one-shot check-ins on 17 Nov 2026 at 03:00, 05:00 and 07:00 IST**: each starts a
  fresh session that does nothing if the branch had a commit in the last 90 minutes (a session is still working) or if
  RESUME.md shows the Everyday + Device suites are done; otherwise it continues that work. They disable themselves after
  firing.
