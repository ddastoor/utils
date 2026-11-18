// jq.wasm (jq 1.8.2 from the official source, built by us): examples from the jq 1.8 manual with their documented
// outputs, CLI flags (-r -c -s -n -S -j -R -e, --arg/--argjson), regex (oniguruma), dates, errors and exit codes.
// Then the reference: tests/fixtures/jq/reference.json holds what the NATIVE jq 1.8.2 command line prints (stdout,
// stderr, exit status) for ~4,800 filter × option × input cases (scripts/make-jq-reference.mjs) — our build must give
// the same three things for every one of them. Last: what the tab adds (the 16 MB output stop) and engine hygiene.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
export default async (t, { load, wasm, root }) => {
  const { bindJq } = await load('/src/wasm/jq.ts');
  // local time is the host's answer (supertools.tz_info): the zone is chosen per test, UTC for the main reference
  const { tzInfoImport } = await load('/src/lib/tzinfo.ts');
  const zoneNames = JSON.parse(readFileSync(join(root, 'src/lib/tzabbr.json'), 'utf8')), tz = { zone: 'UTC', names: true, run: 0 };   // run: a new number = a new process (the native jq ran once per case)
  const engine = async () => { let e; e = await wasm('jq', { supertools: { tz_info: tzInfoImport(() => e.memory.buffer, () => ({ zone: tz.zone, abbr: tz.names ? zoneNames[tz.zone] || '' : '', run: tz.run })) } }); return e; };
  const jq = bindJq(await engine());
  const c = (f, i, o = {}) => jq.run(f, i, { compact: true, ...o }).output.trimEnd();
  t.eq(c('.foo', '{"foo": 42, "bar": "less interesting data"}'), '42', 'manual: .foo');
  t.eq(c('.[0]', '[{"name":"JSON", "good":true}, {"name":"XML", "good":false}]'), '{"name":"JSON","good":true}', 'manual: .[0]');
  t.eq(c('.[]', '[{"name":"JSON", "good":true}, {"name":"XML", "good":false}]'), '{"name":"JSON","good":true}\n{"name":"XML","good":false}', 'manual: .[] iterates');
  t.eq(c('{user, title: .titles[]}', '{"user":"stedolan","titles":["JQ Primer", "More JQ"]}'), '{"user":"stedolan","title":"JQ Primer"}\n{"user":"stedolan","title":"More JQ"}', 'manual: object construction with a generator');
  t.eq(c('map(select(. >= 2))', '[1,5,3,0,7]'), '[5,3,7]', 'manual: map(select(...))');
  t.eq(c('group_by(.foo)', '[{"foo":1, "bar":10}, {"foo":3, "bar":100}, {"foo":1, "bar":1}]'), '[[{"foo":1,"bar":10},{"foo":1,"bar":1}],[{"foo":3,"bar":100}]]', 'manual: group_by');
  t.eq(c('reduce .[] as $item (0; . + $item)', '[1,2,3,4,5]'), '15', 'manual: reduce');
  t.eq(c('[paths]', '[1,[[],{"a":2}]]'), '[[0],[1],[1,0],[1,1],[1,1,"a"]]', 'manual: paths');
  t.eq(c('test("a b c # spaces are ignored"; "ix")', '"xabcd ABC"'), 'true', 'manual: test() with x and i flags (oniguruma)');
  t.eq(c('[ match("(?<x>a)?b"; "g") | .captures[0].name ]', '"ab b"'), '["x","x"]', 'named captures');
  t.eq(c('sub("(?<x>[a-z]+)"; "<\\(.x)>"; "g")', '"abc 123 def"'), '"<abc> 123 <def>"', 'sub with a named capture');
  t.eq(c('@base64, @uri, @csv, @sh', '["a b","c,d"]', { raw: true }), 'WyJhIGIiLCJjLGQiXQ==\n%5B%22a%20b%22%2C%22c%2Cd%22%5D\n"a b","c,d"\n\'a b\' \'c,d\'', 'formats @base64 @uri @csv @sh with -r');
  t.eq(c('todate, (.|strftime("%Y-%m-%dT%H:%M:%SZ"))', '1425599621'), '"2015-03-05T23:53:41Z"\n"2015-03-05T23:53:41Z"', 'manual: todate / strftime');
  t.eq(c('"2015-03-05T23:51:47Z" | fromdate', 'null'), '1425599507', 'manual: fromdate');
  t.eq(c('$foo', 'null', { args: { foo: 'bar' } }), '"bar"', '--arg foo bar');
  t.eq(c('$n + 1', 'null', { args: { n: 41 } }), '42', '--argjson n 41');
  t.eq(c('.', '1 2 3', { slurp: true }), '[1,2,3]', '-s slurps several inputs');
  t.eq(c('[inputs]', '1 2 3', { nullInput: true }), '[1,2,3]', '-n with inputs');
  t.eq(c('.', '{"b":1,"a":{"d":1,"c":2}}', { sortKeys: true }), '{"a":{"c":2,"d":1},"b":1}', '-S sort keys');
  t.eq(jq.run('.[]', '["a","b"]', { raw: true, join: true }).output, 'ab', '-j joins without new lines');
  t.eq(c('.', 'line one\nline two', { rawInput: true }), '"line one"\n"line two"', '-R raw lines');
  t.eq(c('split("\\n") | length', 'a\nb\nc', { rawInput: true, slurp: true }), '3', '-Rs whole text');
  t.eq(jq.run('.', '{"a":[1,2]}').output, '{\n  "a": [\n    1,\n    2\n  ]\n}\n', 'pretty output with 2 spaces (jq default)');
  t.eq(jq.run('.', '{"a":1}', { tab: true }).output, '{\n\t"a": 1\n}\n', '--tab');
  t.eq(jq.run('.', '"é"', { ascii: true }).output.trim(), '"\\u00e9"', '-a ASCII output');
  t.eq(c('1e1000, 100000000000000000001', 'null'), '1E+1000\n100000000000000000001', 'big number literals kept exactly (decNumber, as jq 1.8 prints them)');
  let r = jq.run('.a.b', '{"a": 5}\n'); t.eq([r.code, r.error], [5, 'jq: error (at input.json:1): Cannot index number with string ("b")'], 'runtime error: exit 5, the message of the command line with the input position');
  r = jq.run('.[', '{}'); t.ok(r.code === 3 && /syntax error/.test(r.error), `compile error, exit 3 (${r.error.split('\n')[0]})`);
  r = jq.run('.', '{"a": 1'); t.eq([r.code, r.error], [5, 'jq: parse error: Unfinished JSON term at EOF at line 1, column 7'], 'input that is not JSON: exit 5 and "jq: parse error" (jq 1.8; older versions used exit 2)');
  r = jq.run('error("custom")', 'null'); t.ok(r.code === 5 && /custom/.test(r.error), 'error() message');
  r = jq.run('"bye\\n" | halt_error(1)', 'null'); t.ok(r.code === 1 && /bye/.test(r.error), 'halt_error exit code');
  t.eq([jq.run('.a', '{"a": false}', { exitStatus: true }).code, jq.run('.a', '{"a": 1}', { exitStatus: true }).code, jq.run('empty', '1', { exitStatus: true }).code], [1, 0, 4], '-e exit status');
  t.eq(c('[limit(3; range(10))], first(range(5;10)), ([.[] | tostring] | join("-"))', '[1,2]'), '[0,1,2]\n5\n"1-2"', 'limit, first, join');
  t.eq(c('getpath(["a","b"]), (to_entries | map("\\(.key)=\\(.value|tostring)") | join("&")), (with_entries(.value |= tostring) | keys)', '{"a":{"b":1},"c":2}'), '1\n"a={\\"b\\":1}&c=2"\n["a","c"]', 'getpath, to_entries, with_entries');
  const many = JSON.stringify(Array.from({ length: 20000 }, (_, i) => ({ id: i, even: i % 2 === 0 })));
  t.eq(c('map(select(.even)) | length', many), '10000', '20,000-element input');

  // ---- the native jq 1.8.2 command line is the reference
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/jq/reference.json'), 'utf8'));
  t.ok(ref.jq === '1.8.2' && ref.cases.length > 4500, `reference made with jq ${ref.jq}: ${ref.cases.length} cases`);
  const K = { r: 'raw', c: 'compact', s: 'slurp', n: 'nullInput', S: 'sortKeys', R: 'rawInput', t: 'tab', a: 'ascii', j: 'join', e: 'exitStatus' };
  const make = (i) => typeof i === 'string' ? i : i.rep.map(([u, n]) => u.repeat(n)).join('');
  const same = (got, want) => want === null || (typeof want === 'string' ? got === want : got.length === want.len && createHash('sha256').update(got).digest('hex') === want.sha256);
  const cut = (x) => JSON.stringify(typeof x === 'string' ? x.slice(0, 120) : x);
  for (const c of ref.cases) {
    const o = { args: c.a || {} }; for (const k of c.f) o[K[k]] = true;
    let g; try { g = jq.run(c.p, make(c.i), o); } catch (e) { g = { output: '', error: 'trap: ' + e.message, code: -1 }; }
    t.ok(same(g.output, c.o) && g.code === c.s && same(g.error, c.e), `jq ${[...c.f].map((k) => '-' + k).join(' ')} ${JSON.stringify(c.p)} on ${cut(make(c.i))}${c.a ? ' args ' + JSON.stringify(c.a) : ''}: got ${g.code} ${cut(g.output)} ${cut(g.error)}, native jq gives ${c.s} ${cut(c.o)} ${cut(c.e)}`);
  }
  // ---- details the reference covers in bulk, spelled out
  t.eq(jq.run('.', '"é☕"', { raw: true, ascii: true }).output, '"\\u00e9\\u2615"\n', '-r with -a prints strings quoted and in ASCII (as jq does)');
  t.eq(jq.run('.', '{"a":[1]}', { compact: true, tab: true }).output, '{"a":[1]}\n', 'Compact wins over Tab indent (the tab passes -c only)');
  t.eq(jq.run('input_filename, input_line_number', '1\n2\n', { compact: true }).output, '"input.json"\n1\n"input.json"\n2\n', 'input_filename and input_line_number work (jq\'s own input reader)');
  r = jq.run('.a', '{"a":1}\n5\n{"a":3}', { compact: true });
  t.eq([r.output, r.code, r.error], ['1\n3\n', 0, 'jq: error (at input.json:2): Cannot index number with string ("a")'], 'an error on one input: the others are still filtered and the exit status is that of the last input');
  r = jq.run('.a', '{"a":1}\n5', { compact: true }); t.eq([r.output, r.code], ['1\n', 5], 'an error on the last input → exit 5');
  r = jq.run('if . == 2 then ("stop\n" | halt_error(7)) else . end', '1 2 3', { compact: true });
  t.eq([r.output, r.code, r.error], ['1\n', 7, 'stop'], 'halt_error ends the run: later inputs are not read, its text goes to stderr without a prefix');
  r = jq.run('if . == 2 then halt else . end', '1 2 3', { compact: true }); t.eq([r.output, r.code, r.error], ['1\n', 0, ''], 'halt: exit 0, nothing more printed');
  r = jq.run('debug, (. | debug("seen \\(.)") | empty), ("to stderr" | stderr | empty)', '{"a":1}', { compact: true });
  t.eq([r.output, r.error], ['{"a":1}\n', '["DEBUG:",{"a":1}]\n["DEBUG:","seen {\\"a\\":1}"]\nto stderr'], 'debug and stderr messages are kept (they were dropped)');
  r = jq.run('$JQ_BUILD_CONFIGURATION | type', 'null', { raw: true }); t.eq(r.output, 'string\n', '$JQ_BUILD_CONFIGURATION is defined as on the command line');
  r = jq.run('import "lib" as lib; 1', 'null'); t.ok(r.code === 3 && /module not found: lib/.test(r.error), `import: there are no module files in a browser tab (${r.error.split('\n')[0]})`);
  r = jq.run('$nope', 'null'); t.eq([r.code, r.error.split('\n')[0]], [3, 'jq: error: $nope is not defined at <top-level>, line 1, column 1:'], 'undefined variable: compile error with its position');
  r = jq.run('.[', '{}'); t.eq(r.error, 'jq: error: syntax error, unexpected end of file at <top-level>, line 1, column 2:\n    .[\n     ^\njq: 1 compile error', 'syntax error text with the caret under the place');
  t.eq([jq.run('.', '', {}).output, jq.run('.', '', { slurp: true, compact: true }).output, jq.run('.', '', { rawInput: true }).output, jq.run('.', '', { rawInput: true, slurp: true }).output], ['', '[]\n', '', '""\n'], 'empty input: nothing, [] with -s, nothing with -R, "" with -Rs');
  t.eq(jq.run('.', 'a\r\nb\r\n', { rawInput: true, compact: true }).output, '"a\\r"\n"b\\r"\n', '-R keeps the carriage return of Windows line ends (as jq does)');
  // ---- local time: the native jq 1.8.2 with TZ=<zone> (scripts/make-jq-localtime.mjs) — `localtime`, `strflocaltime`
  // (%Z, %z and every other field), wall-clock readings that do not exist or exist twice, moments around changes of
  // the clocks, 27 zones. Our build asks the host; it used to answer in UTC for everybody.
  {
    const LT = JSON.parse(readFileSync(join(root, 'tests/fixtures/jq/localtime.json'), 'utf8'));
    t.eq(LT.jq, 'jq-1.8.2', 'local-time reference made with the native jq 1.8.2');
    const byZone = new Map(); let n = 0;
    for (const c of LT.cases) {
      tz.zone = c.z; tz.run++;
      const g = jq.run(c.f, 'null', { nullInput: true, compact: true });
      const ok = g.output === c.o && g.code === c.s && g.error.replace(/\s+$/, '') === c.e.replace(/\s+$/, '');
      if (!byZone.has(c.z)) byZone.set(c.z, []);
      if (!ok) byZone.get(c.z).push(`${c.f.slice(0, 60)} → got ${g.code} ${JSON.stringify((g.output || g.error).slice(0, 300))}, native ${c.s} ${JSON.stringify((c.o || c.e).slice(0, 300))}`);
      n++;
    }
    for (const [z, bad] of byZone) t.ok(!bad.length, `local time in ${z}: ${LT.cases.filter((c) => c.z === z).length} filters as the native jq prints them${bad.length ? ` — ${bad.length} differ: ${bad.slice(0, 2).join(' ‖ ')}` : ''}`);
    t.ok(n >= 880, `${n} local-time cases were run`);
    tz.zone = 'Asia/Kolkata';
    t.eq(jq.run('1700000000 | strflocaltime("%H:%M %Z %z"), (localtime | mktime), (localtime | .[3:5])', 'null', { nullInput: true, compact: true, raw: true }).output, '03:43 IST +0530\n1700019800\n[3,43]\n', 'India: 03:43 IST +0530 (was 22:13 UTC +0000)');
    tz.names = false;
    t.eq(jq.run('1700000000 | strflocaltime("%H:%M %Z %z")', 'null', { nullInput: true, raw: true }).output, '03:43 IST +0530\n', 'without the table of zone names the browser\'s own name is used');
    tz.zone = 'Asia/Kathmandu';
    t.eq(jq.run('1700000000 | strflocaltime("%H:%M %Z %z")', 'null', { nullInput: true, raw: true }).output, '03:58 +0545 +0545\n', 'a zone without an abbreviation is named by its offset');
    tz.zone = 'Not/AZone';
    t.eq(jq.run('1700000000 | strflocaltime("%H:%M %Z %z")', 'null', { nullInput: true, raw: true }).output, '22:13 UTC +0000\n', 'an unknown zone falls back to UTC');
    tz.zone = 'UTC'; tz.names = true;
  }
  // ---- what the tab adds: a filter that never ends is stopped after 16 MB of output
  r = jq.run('repeat(1)', 'null', { compact: true });
  t.ok(r.code === 5 && r.output.length > 16 << 20 && r.output.length < (16 << 20) + 64 && /stopped after 16 MB of output/.test(r.error) && r.output.startsWith('1\n1\n'), `repeat(1) stops after 16 MB of output (${r.output.length} bytes, exit ${r.code})`);
  r = jq.run('range(1; 4)', 'null', { compact: true }); t.eq([r.output, r.code, r.error], ['1\n2\n3\n', 0, ''], 'the next run starts clean (output, messages and status reset)');
  r = jq.run('"x" * 2000000 | length', 'null'); t.eq(r.output, '2000000\n', 'a 2 MB string built inside the filter');
  // ---- no memory is kept from run to run
  const e = await engine(), j2 = bindJq(e);
  const doc = JSON.stringify(Array.from({ length: 300 }, (_, i) => ({ id: i, tags: ['a', 'b'], name: 'n' + i })));
  const mix = () => { j2.run('map(select(.id % 2 == 0)) | length', doc, {}); j2.run('.[] | .a.b.c', doc, {}); j2.run('.[', doc, {}); j2.run('.', '{"a":', {}); j2.run('[inputs] | add', '1 2 3', { nullInput: true }); j2.run('.', 'x\ny', { rawInput: true, slurp: true }); j2.run('halt_error', '"bye"', {}); j2.run('$a', 'null', { args: { a: [1, 2] } }); };
  for (let i = 0; i < 40; i++) mix();
  const before = e.memory.buffer.byteLength;
  for (let i = 0; i < 400; i++) mix();
  t.eq(e.memory.buffer.byteLength, before, `3,200 more runs (results, errors, bad input, halts, arguments) do not grow the memory (${before >> 20} MB)`);
};
