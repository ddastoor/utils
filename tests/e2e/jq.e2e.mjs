// jq Playground (#/jq, PC only): our jq.wasm must print exactly what the native jq command line prints for the same
// filter, input and options (the host's /usr/bin/jq is the reference; skipped with a note if absent): the sample
// filter, every example chip, -r/-c/-s/-n/-S/-R/--tab/-a/-j, --arg/--argjson, `inputs` with -n, multiple inputs (JSON
// lines), @csv/@tsv/@base64, regex (oniguruma), dates, paths. Errors: syntax error, bad input, runtime error, bad
// argument line. Command-line preview, file open, download, Enter runs at once, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
export default async (ctx) => {
  const { base, page: newPage, ok, tmp, download, info } = ctx;
  const page = await newPage(); await page.goto(`${base}#/jq`);
  const filter = page.getByRole('textbox', { name: 'Filter', exact: true }), ta = page.locator('textarea');
  const args = ta.nth(0), src = ta.nth(1), out = ta.nth(2); await src.waitFor();
  await page.waitForFunction(() => document.querySelectorAll('textarea')[2].value.length > 0);
  const FLAGS = { raw: ['Raw output', '-r'], compact: ['Compact', '-c'], slurp: ['Slurp', '-s'], nullInput: ['Null input', '-n'], sortKeys: ['Sort keys', '-S'], rawInput: ['Raw input', '-R'], tab: ['Tab indent', '--tab'], ascii: ['ASCII output', '-a'], join: ['Join output', '-j'] };
  const on = new Set();
  const setFlags = async (want) => { for (const k of Object.keys(FLAGS)) if (want.includes(k) !== on.has(k)) { await page.locator('label.switch', { hasText: FLAGS[k][0] }).click(); want.includes(k) ? on.add(k) : on.delete(k); } };
  const native = existsSync('/usr/bin/jq');
  const ref = (f, input, flags = [], a = []) => { try { return execFileSync('/usr/bin/jq', [...flags.map((k) => FLAGS[k][1]), ...a, f], { input }).toString(); } catch (e) { return { err: e.stderr.toString(), status: e.status }; } };
  const run = async (f, input, flags = [], argText = '') => {
    await setFlags(flags); await args.fill(argText); await src.fill(input); await filter.fill(f); await filter.press('Enter');
    await page.waitForTimeout(120); return out.inputValue();
  };
  const sample = await src.inputValue();
  if (native) ok(await out.inputValue() === ref(await filter.inputValue(), sample), 'sample filter = native jq output');
  ok((await out.inputValue()).includes('"total": 490'), 'sample totals (2×120 + 250 = 490)');
  // every example chip
  const chips = page.locator('.chips button'); const n = await chips.count(); let same = 0;
  for (let i = 0; i < n; i++) {
    await chips.nth(i).click(); await page.waitForTimeout(120);
    const f = await filter.inputValue(), got = await out.inputValue();
    const a = f.includes('$name') ? ['--arg', 'name', 'Ravi'] : [];
    const want = native ? ref(f, sample, f.includes('@csv') || on.has('raw') ? ['raw'] : [], a) : got;
    if (got === want && got.length) same++; else info(`chip ${i} "${f}": got ${JSON.stringify(got).slice(0, 120)} want ${JSON.stringify(want).slice(0, 120)}`);
    if (f.includes('@csv')) { on.add('raw'); }
  }
  ok(same === n && n >= 8, `all ${n} example chips give the native jq output (${same})`);
  ok(await page.locator('label.switch', { hasText: 'Raw output' }).locator('input').isChecked(), 'the @csv example switched Raw output on');
  // option combinations vs native jq
  const cases = [
    ['.', '{"b":[1,2,{"x":"é"}],"a":null}', []], ['.', '{"b":[1,2],"a":"€"}', ['compact', 'sortKeys']], ['.[]', '["x","y"]', ['raw']],
    ['.', '1 2 3', ['slurp']], ['[inputs] | add', '1 2 3', ['nullInput']], ['input', '7 8', ['nullInput']], ['.', 'line one\nline "two"', ['rawInput']],
    ['split("\\n") | length', 'a\nb\nc', ['rawInput', 'slurp']], ['.', '{"a":[1,{"b":2}]}', ['tab']], ['.', '"ünïcødé ₹ 😀"', ['ascii']],
    ['.[]', '["a","b",1]', ['join']], ['.a', '{"a":1}\n{"a":2}\n{"a":3}', ['compact']],
    ['.[] | [.n, .v] | @csv, @tsv', '[{"n":"x,y","v":"q\\"t"},{"n":"tab\\there","v":2}]', ['raw']], ['@base64, (@base64 | @base64d), @uri, @html', '"a+b <c> & d/é"', ['raw']],
    ['[.[] | select(test("^[A-Z][a-z]+ \\\\d{3}$"))], [.[] | capture("(?<w>[a-z]+) (?<n>\\\\d+)")], (.[0] | gsub("(?<d>\\\\d)"; "<\\(.d)>"))', '["Pune 411","mumbai 400","Delhi 11"]', ['compact']],
    ['"2026-11-16T10:30:00Z" | fromdate, (fromdate | strftime("%A %d %B %Y")), (1700000000 | todate)', 'null', []],
    ['[paths], [paths(scalars)], (tostream | select(length == 2)) | tojson', '{"a":[1,{"b":null}],"c":"x"}', ['raw']],
    ['reduce range(1; 11) as $i (0; . + $i), ([limit(5; repeat(.) | . * 2)] | length), (def f: if . > 1 then . * (. - 1 | f) else 1 end; 20 | f)', '3', ['compact']],
    ['to_entries | sort_by(.value) | from_entries | keys_unsorted', '{"z":3,"y":1,"x":2}', ['compact']],
    ['.[] as [$a, $b] | {a: $a, b: $b}, (. as [[$x]] ?// [$x] | $x)', '[[1,2],[3,4]]', ['compact']],
    ['ascii_downcase, ltrimstr("He"), (explode | implode), (. / "l"), ([match("l+"; "g").offset]), (@json | fromjson), tojson', '"HeLLo world"', ['compact']],
    ['getpath(["a","b"]) = 5 | del(.c) | walk(if type == "number" then . + 1 else . end)', '{"a":{"b":1},"c":2,"d":[1,2]}', ['compact']],
    ['[splits(", *")], (.[2:4]), (indices(",")), ascii_upcase, (tostring | length)', '"a, b,c"', ['compact']],
  ];
  let pass = 0;
  for (const [f, input, fl] of cases) {
    const got = await run(f, input, fl);
    const want = native ? ref(f, input, fl) : got;
    if (got === want && typeof want === 'string' && want.length) pass++; else info(`case ${f} [${fl}]: got ${JSON.stringify(got).slice(0, 200)} want ${JSON.stringify(want).slice(0, 200)}`);
  }
  ok(pass === cases.length, `${pass}/${cases.length} filter + option cases print exactly what native jq prints`);
  // arguments
  let got = await run('[$name, $n, $ARGS.named]', 'null', ['compact'], 'name=Asha Rao\nn:={"k":[1,2]}');
  ok(got === (native ? ref('[$name, $n, $ARGS.named]', 'null', ['compact'], ['--arg', 'name', 'Asha Rao', '--argjson', 'n', '{"k":[1,2]}']) : got) && got.includes('"Asha Rao"'), `--arg and --argjson (${got.trim()})`);
  ok((await page.locator('code').first().textContent()).startsWith("jq -c --arg name 'Asha Rao' --argjson n '{\"k\":[1,2]}' '[$name, $n, $ARGS.named]'"), 'command line shown with quoting');
  await args.fill('n:={bad'); await page.waitForTimeout(300); ok(/--argjson n: not valid JSON/.test(await page.locator('.note-warn').first().textContent()), 'bad --argjson value explained');
  await args.fill('what is this'); await page.waitForTimeout(300); ok(/not understood/.test(await page.locator('.note-warn').first().textContent()), 'bad argument line explained');
  // errors
  got = await run('.[', '{}', []); ok(got === '' && /syntax error/.test(await page.locator('.note-warn').first().textContent()), 'syntax error reported');
  got = await run('.', '{"a": 1', []); ok(/not valid JSON/.test(await page.locator('.note-warn').first().textContent()), 'invalid input reported');
  got = await run('.[] | .a', '[{"a":1},5,{"a":3}]', ['compact']);
  ok(got === '1\n' && /Cannot index number/.test(await page.locator('.note-warn').first().textContent()), 'runtime error: output up to the error kept, message shown (like jq)');
  got = await run('error("custom stop")', 'null', []); ok(/custom stop/.test(await page.locator('.note-warn').first().textContent()), 'error() message shown');
  got = await run('.', '9007199254740993', []); ok(got === '9007199254740993\n', 'large integers kept exactly (decNumber)');
  // a big input
  const big = JSON.stringify(Array.from({ length: 20000 }, (_, i) => ({ id: i, v: i % 7 })));
  got = await run('map(select(.v == 3)) | length', big, []); ok(got === '2857\n', 'a 20 000-object array filtered (2857 matches)');
  // file open + download
  const fp = join(tmp, 'in.json'); writeFileSync(fp, '{"opened": [1, 2, 3]}'); await setFlags(['compact']); await filter.fill('.opened | add');
  await page.locator('.drop input[type=file]').setInputFiles(fp); await page.waitForTimeout(250);
  ok(await out.inputValue() === '6\n', 'JSON file opened and filtered');
  const d = await download(page, () => page.getByRole('button', { name: 'Download' }).click()); ok(readFileSync(d, 'utf8') === '6\n', 'download');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  if (!native) info('native jq not installed — outputs not compared with it');
  await pcOnlyOnPhone(ctx, 'jq');
};
