// jq Playground (#/jq, PC only). The reference is the NATIVE jq 1.8.2 command line: tests/fixtures/jq/reference.json
// (scripts/make-jq-reference.mjs) holds its stdout, stderr and exit status for every case typed here — the sample filter,
// every example chip, filter × option cases, arguments, messages (errors on one of several inputs, debug, stderr, halt,
// input that is not JSON, filters that do not compile) and a spread of the unit suite's cases. The page must show the
// same output and the same messages. Then what only a page has: a filter that never ends is stopped (16 MB of output,
// the 10-second limit, the Stop button), the engine comes back after running out of memory, a newer filter replaces a
// running one, long output is cut on screen but copied and downloaded whole, the command line, files, the phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { setValue, until, hookClipboard, copied } from './_devdata.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const REF = JSON.parse(readFileSync(new URL('../fixtures/jq/reference.json', import.meta.url), 'utf8')).cases.filter((c) => c.g);
export default async (ctx) => {
  const { base, page: newPage, ok, tmp, download, info } = ctx;
  const page = await newPage(); await page.goto(`${base}#/jq`);
  const filter = page.getByRole('textbox', { name: 'Filter', exact: true }), out = page.getByRole('textbox', { name: 'Output', exact: true });
  const ta = page.locator('textarea'), args = ta.nth(0), src = ta.nth(1);
  const idle = (timeout = 15000) => until(page, () => document.querySelector('textarea[aria-label="Output"]')?.dataset.busy === '0', null, timeout);
  const status = async () => (await page.locator('.card', { hasText: 'Download' }).last().locator('.note').allTextContents()).map((x) => x.trim()).join(' | ');
  const stderr = async () => (await page.locator('.note pre').count()) ? page.locator('.note pre').first().textContent() : '';
  const FLAGS = { r: 'Raw output', c: 'Compact', s: 'Slurp', n: 'Null input', S: 'Sort keys', R: 'Raw input', t: 'Tab indent', a: 'ASCII output', j: 'Join output' };
  const on = new Set();
  const setFlags = async (want) => { for (const k of Object.keys(FLAGS)) if (want.includes(k) !== on.has(k)) { await page.locator('label.switch', { hasText: FLAGS[k] }).click(); want.includes(k) ? on.add(k) : on.delete(k); } };
  const argText = (a) => Object.entries(a || {}).map(([k, v]) => typeof v === 'string' ? `${k}=${v}` : `${k}:=${JSON.stringify(v)}`).join('\n');
  /** Type one case into the page and give back what it shows: output, the stderr text, the notes. */
  const run = async (p, input, flags = '', a = null) => {
    await setFlags(flags); await setValue(args, argText(a)); await setValue(src, input); await setValue(filter, p); await filter.press('Enter');
    const fin = await idle();
    return { fin, out: await out.inputValue(), err: await stderr(), notes: await status() };
  };
  const cut = (x) => JSON.stringify(String(x).slice(0, 140));
  const same = (g, c) => g.fin && g.out === c.o && (c.e === null || g.err === c.e);   // e null: the message names folders of the machine (import)
  await idle();
  const sample = await src.inputValue();

  // ---- the sample, as the tab opens
  const S = REF.find((c) => c.g === 'sample');
  ok(sample === S.i && await filter.inputValue() === S.p && await args.inputValue() === 'name=Ravi', 'the tab opens with the sample, its filter and the argument name=Ravi');
  ok(await out.inputValue() === S.o && (await out.inputValue()).includes('"total": 490'), 'sample filter: the output of native jq (totals 490, 600, 390)');
  ok(/^14 result lines\.$/.test(await status()), `"14 result lines." (${await status()})`);
  ok(await page.locator('code').first().textContent() === `jq --arg name Ravi '${S.p}' input.json`, `command line shown (${await page.locator('code').first().textContent()})`);

  // ---- every example chip (the @csv one switches Raw output on, and it stays on)
  const chips = page.locator('.chips button'); const n = await chips.count(); let good = 0;
  for (let i = 0; i < n; i++) {
    await chips.nth(i).click(); await idle();
    const p = await filter.inputValue(); if (p.includes('@csv')) on.add('r');
    const c = REF.find((x) => x.g === 'chip' && x.p === p && x.f === (on.has('r') ? 'r' : ''));
    const got = await out.inputValue();
    if (c && got === c.o && got.length && c.s === 0) good++; else info(`chip ${i} ${cut(p)}: got ${cut(got)} want ${cut(c?.o)}`);
  }
  ok(good === n && n === 9, `all ${n} example chips give the native jq output (${good})`);
  ok(await page.locator('label.switch', { hasText: 'Raw output' }).locator('input').isChecked(), 'the @csv example switched Raw output on');

  // ---- filter × option cases, messages, compile errors: output and stderr text as the command line
  for (const g of ['case', 'args', 'spread']) {
    const list = REF.filter((c) => c.g === g); let pass = 0;
    for (const c of list) {
      const got = await run(c.p, c.i, c.f, c.a);
      if (same(got, c)) pass++; else info(`${g}: jq -${c.f} ${cut(c.p)} on ${cut(c.i)}: page ${cut(got.out)} / ${cut(got.err)}; native ${cut(c.o)} / ${cut(c.e)}`);
    }
    ok(pass === list.length && list.length >= (g === 'args' ? 6 : 60), `${pass}/${list.length} "${g}" cases show exactly what native jq 1.8.2 prints (output and messages)`);
  }

  // ---- how results and messages are worded
  let got = await run('.[] | .a', '[{"a":1},5,{"a":3}]', 'c');
  ok(got.out === '1\n' && /^The filter stopped with an error\./.test(got.notes) && /^jq: error \(at input\.json:0\): Cannot index number with /.test(got.err), `an error: the output up to it is kept, the message of jq is shown (${got.notes})`);
  got = await run('.a', '{"a":1}\n5\n{"a":3}\n', 'c');
  ok(got.out === '1\n3\n' && /^Messages from the filter .*Cannot index number.* \| 2 result lines\.$/s.test(got.notes) && await page.locator('.note-warn').count() === 0, `an error on one of several inputs: the others are filtered, the message is an information (${got.notes})`);
  got = await run('.', '{"a": 1', '');
  ok(got.out === '' && /^The input is not valid JSON \(turn on "Raw input"/.test(got.notes) && /^jq: parse error: Unfinished JSON term at EOF at line 1, column 7$/.test(got.err), `input that is not JSON (${got.notes})`);
  got = await run('.[', '{}', '');
  ok(got.out === '' && /^The filter does not compile\./.test(got.notes) && got.err.split('\n').length === 4 && /\n {4}\.\[\n {5}\^\n/.test(got.err), `a filter that does not compile: jq's message with the caret line (${cut(got.err)})`);
  got = await run('"bye\\n" | halt_error(3)', 'null', '');
  ok(/^The filter ended with exit status 3\./.test(got.notes) && got.err === 'bye', `halt_error(3): its exit status and text (${got.notes})`);
  got = await run('import "lib" as lib; .', '{}', '');
  ok(/^The filter does not compile\. Modules cannot be imported here/.test(got.notes) && /module not found: lib/.test(got.err), `import: explained (${got.notes.slice(0, 110)})`);
  got = await run('debug("seen") | .a', '{"a":1}', 'c');
  ok(got.out === '1\n' && got.err === '["DEBUG:","seen"]' && /1 result line\.$/.test(got.notes), `debug messages are shown (${got.notes})`);
  got = await run('.', '9007199254740993', ''); ok(got.out === '9007199254740993\n', 'large integers kept exactly (decNumber)');
  got = await run('empty', '1 2 3', ''); ok(got.out === '' && got.notes === '0 result lines.', `no results: "0 result lines." (${got.notes})`);
  got = await run('.', '"one"', ''); ok(got.notes === '1 result line.', `one result: "1 result line." (${got.notes})`);

  // ---- arguments box
  got = await run('[$name, $n, $ARGS.named]', 'null', 'c', { name: 'Asha Rao', n: { k: [1, 2] } });
  ok(await page.locator('code').first().textContent() === "jq -c --arg name 'Asha Rao' --argjson n '{\"k\":[1,2]}' '[$name, $n, $ARGS.named]' input.json", `command line with quoting (${await page.locator('code').first().textContent()})`);
  await setValue(args, 'n:={bad'); await filter.press('Enter'); await idle(); ok(/--argjson n: not valid JSON/.test(await status()) && await out.inputValue() === '', 'bad --argjson value explained, no stale output');
  await setValue(args, 'what is this'); await filter.press('Enter'); await idle(); ok(/Argument line not understood: "what is this"/.test(await status()), 'bad argument line explained');
  await setValue(args, "q=it's"); await setValue(filter, '$q'); await filter.press('Enter'); await idle();
  ok(await out.inputValue() === '"it\'s"\n' && (await page.locator('code').first().textContent()).includes(`--arg q 'it'\\''s'`), 'an apostrophe in an argument is quoted for the shell');

  // ---- command line: the options as jq needs them for the same output
  await run('.', '{"a":[1]}', 'ct'); ok(await page.locator('code').first().textContent() === 'jq -c . input.json', `Compact with Tab indent: only -c is passed (${await page.locator('code').first().textContent()})`);
  await run('.', '"x"', 'rj'); ok(await page.locator('code').first().textContent() === 'jq -j . input.json', 'Join output includes Raw output: only -j is passed');
  await run('.', 'a b', 'RsSa'); ok(await page.locator('code').first().textContent() === 'jq -s -S -R -a . input.json', `several options (${await page.locator('code').first().textContent()})`);
  await run('.a | "x y"', '{"a":1}', 'n'); ok(await page.locator('code').first().textContent() === `jq -n '.a | "x y"' input.json`, 'a filter with spaces and quotes is quoted');

  // ---- a filter that never ends
  let t0 = Date.now();
  await setFlags('c'); await setValue(src, 'null'); await setValue(filter, 'repeat(1)'); await filter.press('Enter');
  ok(await idle(30000) && /^Output stopped\./.test(await status()) && /stopped after 16 MB of output/.test(await stderr()), `repeat(1): stopped after 16 MB of output (${Date.now() - t0} ms: ${(await status()).slice(0, 90)})`);
  const shown = await out.inputValue();
  ok(shown.length === 1_000_000 && /Showing the first 10,00,000 of 1,67,77,21\d characters — Copy and Download give all of it\./.test(await status()), `the box shows the first million characters and says so (${shown.length})`);
  await hookClipboard(page); await page.getByRole('button', { name: 'Copy' }).click(); await until(page, () => window.__copied.length === 1);
  const all = (await copied(page))[0];
  ok(all.length > 16 << 20 && all.length < (16 << 20) + 16 && all.startsWith('1\n1\n') && all.endsWith('1\n'), `Copy gives all of it (${all.length} characters)`);
  let d = await download(page, () => page.getByRole('button', { name: 'Download' }).click());
  ok(readFileSync(d).length === all.length && /output\.json$/.test(d), `Download gives all of it (${readFileSync(d).length} bytes, ${d.split('/').pop()})`);
  got = await run('.a', '{"a":1}', 'c'); ok(got.out === '1\n' && got.notes === '1 result line.', 'the next filter runs as usual');

  t0 = Date.now(); await setValue(filter, 'def f: f; f'); await filter.press('Enter');
  ok(await until(page, () => /Running… ?Stop/.test(document.querySelector('.note')?.textContent || ''), null, 5000), 'a slow run shows "Running… Stop"');
  ok(await idle(20000) && /^Stopped after 10 seconds: this filter does not finish\./.test(await status()) && await out.inputValue() === '' && Date.now() - t0 > 9500 && Date.now() - t0 < 15000, `a filter that loops without output is stopped after 10 seconds (${Date.now() - t0} ms)`);
  ok(await page.evaluate(() => document.title.length > 0 && !!document.querySelector('textarea')), 'the page stayed responsive meanwhile');
  got = await run('.a', '{"a":2}', 'c'); ok(got.out === '2\n', 'a fresh engine answers the next filter');

  await setValue(filter, 'last(range(1e12))'); await filter.press('Enter');
  await page.getByRole('button', { name: 'Stop' }).click({ timeout: 5000 });
  ok(await idle() && await status() === 'Stopped.' && await out.inputValue() === '', `the Stop button ends a run (${await status()})`);
  got = await run('.a', '{"a":3}', 'c'); ok(got.out === '3\n', '… and the next filter runs');

  // a newer filter replaces a running one (typing goes on while a slow filter runs)
  await setValue(filter, 'last(range(1e12))'); await filter.press('Enter'); await page.waitForTimeout(150);
  t0 = Date.now(); await setValue(filter, '.a + 1'); await filter.press('Enter');
  ok(await idle() && await out.inputValue() === '4\n' && Date.now() - t0 < 3000, `a newer filter replaces the running one (${Date.now() - t0} ms)`);
  // quick runs do not restart the engine: 12 option changes in a row, one worker throughout
  const live0 = await page.evaluate(() => globalThis.__supertoolsLive());
  for (let i = 0; i < 6; i++) { await page.locator('label.switch', { hasText: 'Sort keys' }).click(); await page.locator('label.switch', { hasText: 'Slurp' }).click(); }
  ok(await idle() && await out.inputValue() === '4\n' && JSON.stringify(await page.evaluate(() => globalThis.__supertoolsLive())) === JSON.stringify(live0) && live0.workers === 1, `one worker, kept while options change (${JSON.stringify(live0)})`);

  // ---- out of memory: explained, and the engine is restarted
  t0 = Date.now(); await setValue(filter, '[range(1e9)] | length'); await filter.press('Enter');
  const oom = await idle(30000), st = await status();
  ok(oom && /^jq ran out of memory: .*The engine has been restarted/.test(st) && await out.inputValue() === '', `a filter that needs more memory than there is: explained (${Date.now() - t0} ms: ${st.slice(0, 80)})`);
  got = await run('[range(5)] | length', 'null', 'c'); ok(got.out === '5\n' && got.notes === '1 result line.', 'the engine works again afterwards');

  // ---- a big input, a file, download names
  const big = JSON.stringify(Array.from({ length: 20000 }, (_, i) => ({ id: i, v: i % 7 })));
  got = await run('map(select(.v == 3)) | length', big, ''); ok(got.out === '2857\n', 'a 20 000-object array filtered (2857 matches)');
  const fp = join(tmp, 'in.json'); writeFileSync(fp, '{"opened": [1, 2, 3]}'); await setFlags('c'); await setValue(filter, '.opened | add'); await filter.press('Enter'); await idle();
  await page.locator('.drop input[type=file]').setInputFiles(fp);
  ok(await until(page, () => document.querySelector('textarea[aria-label="Output"]').value === '6\n') && await src.inputValue() === '{"opened": [1, 2, 3]}', 'a JSON file opened and filtered');
  d = await download(page, () => page.getByRole('button', { name: 'Download' }).click()); ok(readFileSync(d, 'utf8') === '6\n' && /output\.json$/.test(d), 'Download: output.json');
  const lines = join(tmp, 'log.jsonl'); writeFileSync(lines, '{"lvl":"info","ms":12}\n{"lvl":"error","ms":340}\n{"lvl":"error","ms":7}\n');
  await setFlags('r'); await setValue(filter, 'select(.lvl == "error") | "\\(.ms) ms"'); await page.locator('.drop input[type=file]').setInputFiles(lines);
  ok(await until(page, () => document.querySelector('textarea[aria-label="Output"]').value === '340 ms\n7 ms\n'), 'a JSON Lines file: every line is one input');
  d = await download(page, () => page.getByRole('button', { name: 'Download' }).click()); ok(/output\.txt$/.test(d) && readFileSync(d, 'utf8') === '340 ms\n7 ms\n', 'with Raw output the download is output.txt');
  await run('empty', 'null', '');
  await page.getByRole('button', { name: 'Download' }).click(); ok(await until(page, () => [...document.querySelectorAll('.toast')].some((t) => /Nothing to save yet/.test(t.textContent))), 'Download with no output says so');

  // ---- leaving the tab ends the worker
  await page.goto(`${base}#/`); await page.waitForTimeout(200);
  const live = await page.evaluate(() => globalThis.__supertoolsLive());
  ok(live.workers === 0 && live.resources.length === 0, `leaving the tab ends the jq worker (${JSON.stringify(live)})`);
  await page.goto(`${base}#/jq`); ok(await idle() && await out.inputValue() === S.o, 'coming back: the sample is filtered again');
  const errs = page.errors.filter((e) => !/Nothing to save yet/.test(e));   // the empty Download above: reported as a toast and logged
  ok(!errs.length, `no page errors ${errs.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'jq');
};
