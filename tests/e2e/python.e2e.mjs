// Python Scratchpad (#/python, PC only): nothing is downloaded until the first Run; every sample prints exactly what
// the host's native CPython prints for the same code and input (speed test only checked for shape); input() reads the
// Input box; output streams while a program runs; tracebacks shown as errors with a non-zero exit status; files given
// to the program are readable and files it writes are offered for download (bytes checked); Stop ends an endless
// loop and the next run works; Ctrl+Enter runs; Tab indents; .py open/download; worker released on leave; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export default async (ctx) => {
  const { base, page: newPage, ok, tmp, download, info } = ctx;
  const page = await newPage(); const reqs = [];
  page.on('request', (r) => reqs.push(r.url()));
  await page.goto(`${base}#/python`);
  const code = page.getByRole('textbox', { name: 'Python code' }), stdin = page.getByRole('textbox', { name: 'Input' }), out = page.locator('pre.py-out');
  await code.waitFor(); await page.waitForTimeout(300);
  ok(!reqs.some((u) => /python\.worker|python[-.][^/]*\.wasm|python314/.test(u)), 'nothing of Python is downloaded before the first Run');
  const runBtn = page.getByRole('button', { name: 'Run', exact: true });
  const run = async (timeout = 60000) => { await runBtn.click(); await page.waitForFunction(() => !document.querySelector('.note-info')?.textContent?.match(/Running|Starting/) && !!document.querySelector('.note-ok, .note-warn'), null, { timeout }); return out.textContent(); };
  const native = (src, input = '') => { try { return execFileSync('python3', ['-c', src], { input, env: { ...process.env, PYTHONUTF8: '1', TZ: 'UTC' } }).toString(); } catch { return null; } };
  // samples vs native Python
  const chips = page.locator('.card .chips').first().locator('button'); const n = await chips.count(); let same = 0, checked = 0;
  for (let i = 0; i < n; i++) {
    const name = (await chips.nth(i).textContent()).trim(); await chips.nth(i).click();
    if (name === 'Hello') await stdin.fill('Asha');
    const got = await run(i === 0 ? 90000 : 60000);
    if (name === 'Speed test') { ok(/^17984 primes below 200 000 in [\d.]+ s\n$/.test(got), `speed test sample (${got.trim()})`); continue; }
    if (name === 'Write a file') { ok(/Wrote people.json/.test(got), 'write-a-file sample runs'); continue; }
    const want = native(await code.inputValue(), name === 'Hello' ? 'Asha' : '');
    if (want == null) { info(`native python3 failed for ${name}`); continue; }
    checked++; if (got === want) same++; else info(`${name}: got ${JSON.stringify(got).slice(0, 200)} want ${JSON.stringify(want).slice(0, 200)}`);
  }
  ok(same === checked && checked >= 5, `${same}/${checked} samples print exactly what native CPython prints`);
  ok(/Finished in [\d.]+ s/.test(await page.locator('.note-ok').first().textContent()), 'finish time shown');
  // traceback
  await code.fill('def f(n):\n    return 10 / n\nprint("start")\nf(0)\n'); let got = await run();
  ok(got.startsWith('start\n') && /line 2, in f/.test(got) && (await page.locator('.py-stderr').textContent()).includes('ZeroDivisionError') && /Exited with status 1/.test(await page.locator('.note-warn').first().textContent()), 'traceback in the error colour, exit status 1');
  // streaming output
  await code.fill('import time\nfor i in range(4):\n    print("tick", i)\n    time.sleep(0.4)\n');
  await runBtn.click(); await page.waitForFunction(() => document.querySelector('pre.py-out').textContent.includes('tick 1'), null, { timeout: 20000 });
  ok(!(await out.textContent()).includes('tick 3'), 'output appears while the program is still running');
  await page.locator('.note-ok').first().waitFor({ timeout: 20000 });
  // files in and out
  const fin = join(tmp, 'marks.csv'); writeFileSync(fin, 'name,marks\nAsha,91\nRavi,78\nMeera,85\n');
  await page.locator('.drop input[type=file]').nth(1).setInputFiles(fin); await page.waitForTimeout(200);
  ok(await page.getByRole('button', { name: 'marks.csv ✕' }).isVisible(), 'input file listed');
  await code.fill('import csv\nrows = list(csv.DictReader(open("marks.csv")))\navg = sum(int(r["marks"]) for r in rows) / len(rows)\nprint(f"average {avg:.2f}")\nwith open("result.txt", "w") as f:\n    f.write(f"{len(rows)} students, average {avg:.2f}\\n")\nopen("raw.bin", "wb").write(bytes(range(256)))\n');
  got = await run(); ok(got === 'average 84.67\n', `reads the given file (${got.trim()})`);
  let d = await download(page, () => page.getByRole('button', { name: /^result\.txt/ }).click()); ok(readFileSync(d, 'utf8') === '3 students, average 84.67\n', 'written text file downloaded');
  d = await download(page, () => page.getByRole('button', { name: /^raw\.bin \(256 B\)/ }).click()); const raw = readFileSync(d); ok(raw.length === 256 && raw[255] === 255 && raw[0] === 0, 'written binary file downloaded byte for byte');
  await page.getByRole('button', { name: 'marks.csv ✕' }).click(); ok(!(await page.getByRole('button', { name: 'marks.csv ✕' }).count()), 'input file removed');
  // stop
  await code.fill('n = 0\nwhile True:\n    n += 1\n'); await runBtn.click();
  await page.getByRole('button', { name: 'Stop' }).waitFor(); await page.waitForTimeout(1500); await page.getByRole('button', { name: 'Stop' }).click();
  await page.locator('.note-warn', { hasText: 'Stopped' }).waitFor({ timeout: 5000 }); ok(true, 'endless loop stopped');
  await code.fill('print("alive", 6 * 7)'); got = await run(); ok(got === 'alive 42\n', 'runs again after Stop (fresh worker)');
  // keyboard
  await code.fill(''); await code.focus(); await page.keyboard.type('if True:'); await page.keyboard.press('Enter'); await page.keyboard.press('Tab'); await page.keyboard.type('print("tabbed")');
  ok(await code.inputValue() === 'if True:\n    print("tabbed")', 'Tab inserts four spaces');
  await page.keyboard.press('Control+Enter'); await page.locator('.note-ok').first().waitFor({ timeout: 20000 }); ok(await out.textContent() === 'tabbed\n', 'Ctrl+Enter runs');
  // .py open / download
  const fpy = join(tmp, 'mine.py'); writeFileSync(fpy, 'print("from file")\n'); await page.locator('.drop input[type=file]').first().setInputFiles(fpy); await page.waitForTimeout(200);
  ok(await code.inputValue() === 'print("from file")\n', '.py file opened');
  d = await download(page, () => page.getByRole('button', { name: 'Download .py' }).click()); ok(readFileSync(d, 'utf8') === 'print("from file")\n', '.py download');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await page.goto(`${base}#/`); await page.waitForTimeout(300);
  ok((await page.evaluate(() => globalThis.__supertoolsLive())).workers === 0, 'worker released on leave');
  await pcOnlyOnPhone(ctx, 'python');
};
