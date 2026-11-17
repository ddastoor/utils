#!/usr/bin/env node
// Writes tests/fixtures/jq/reference.json: what the NATIVE jq 1.8.2 command line prints (stdout, stderr, exit status)
// for a few thousand filter × option × input cases. tests/unit/jq.test.mjs runs every case through our jq.wasm and
// expects the same three things, byte for byte.
//   JQ=/path/to/jq-1.8.2/jq node scripts/make-jq-reference.mjs
// Build the reference binary from the same source our wasm is built from (wasm/jq/build.sh downloads it):
//   tar xzf jq_1.8.2.orig.tar.gz && cd jq-1.8.2 && ./configure --with-oniguruma=builtin --disable-docs && make -j8
// Each case runs as `TZ=UTC jq <flags> [--arg …] '<filter>' input.json` in an empty folder with an empty environment.
// Left out because the C library decides, not jq (glibc on the PC, musl in our wasm build): strftime's %Z ("GMT" / "UTC")
// and years below 1000 (%Y gives "3" / "0003"); and anything that depends on the clock or the environment.
// Flag letters: r -r, c -c, s -s, n -n, S -S, R -R, t --tab, a -a, j -j, e -e. As in the tab: with c, t is not passed.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const JQ = process.env.JQ; if (!JQ) { console.error('set JQ to a native jq 1.8.2 binary'); process.exit(1); }
const ver = spawnSync(JQ, ['--version'], { encoding: 'utf8' }).stdout.trim();
if (ver !== 'jq-1.8.2') { console.error(`need jq-1.8.2, this is ${ver}`); process.exit(1); }
const FLAG = { r: '-r', c: '-c', s: '-s', n: '-n', S: '-S', R: '-R', t: '--tab', a: '-a', j: '-j', e: '-e' };
const IN = '{"a":"héllo ☕ \\ud83d\\ude00","b":[1,2.50,1e3,null,true],"z":{"y":1,"x":"q\\"uote"},"big":12345678901234567890,"f":0.1}\n"second"\n[3,2,1]\n';
const F = ['limit(3; range(10))', 'first(range(10;0;-1))', 'try error("x") catch .', 'error("boom")', 'error(null)', 'error({"a":1})', '"bye\\n" | halt_error', '{"a":1} | halt_error', 'halt_error(3)', 'halt', '1, halt, 2', '$ENV | type', 'env | type', 'input_filename', '@sh "echo \\(.)"', '[1,"a b",null] | @sh', '"prefix-x" | ltrimstr("prefix-")', '"x.tar.gz" | rtrimstr(".gz")', '{"a":{"b":[1,2]}} | getpath(["a","b",1])', '$__loc__', '"2015-03-05T23:51:47Z" | fromdate', '1425599507 | todate', '"10:20 2026-11-17" | strptime("%H:%M %Y-%m-%d") | mktime', '1700000000 | strftime("%A, %B %d, %Y")', '1700000000 | gmtime', '1700000000 | localtime | mktime', '1700000000 | strflocaltime("%H:%M %Z")', '[1,2,3] | IN(2)', '[{"a":1},{"a":2}] | INDEX(.a)', '"abc" | test("B";"i")', '"aXbXc" | [splits("X")]', '"test 123 abc" | [scan("[a-z]+")]', '"h\u00e9llo" | @base64', '"aGVsbG8=" | @base64d', '"a b&c" | @uri', '[1,[2,[3]]] | flatten', '{} | .a.b.c = 1', '[3,1,2] | sort | bsearch(2)', '"abc" | explode | implode', 'now | type', '"\\u00e9" | utf8bytelength', '[.[]?]', 'infinite', 'nan | isnan', '[nan] | sort', '1/3', '1e1000', '-0', '0.1+0.2', '100000000000000000000', '3.0', '1.000', '[1,2] | tojson | fromjson', '"1 2" | tonumber?', '" 12 " | tonumber', 'input_line_number', '[splits("a";"b";"c")]?', 'getpath(["a","b"])', 'path(..)', '[paths]', 'to_entries', 'with_entries(.value |= tostring)?', 'walk(if type=="number" then .+1 else . end)', 'ascii', '@text', '@html "<\\(.)>"', 'tojson', 'ltrimstr(1)', 'splits', 'abs', 'toarray', 'have_literal_numbers', 'have_decnum', 'trim', 'ltrimstr("a") | trim?', 'pick(.a)?', 'debug', 'debug("msg")', 'stderr', '"x" | stderr', 'input_line_number', 'getpath(["x"]) as $x | $x', '$ARGS', '$ARGS.named', '$__prog_args?', 'significand?', 'gamma?', 'limit(0; 1,2)', 'until(. > 100; . * 2)?', '[range(0;1;0.3)]', 'range(5) | select(. % 2 == 0)', '@base32', '@base32d?', 'ascii_upcase?', 'tojson | ascii?', 'env.HOME', '$ENV.PATH', 'splits("a")?', 'getpath(1)?', 'error', 'try error catch .', '.[] as [$a] | $a', '. as {a: $x} | $x', 'reduce range(5) as $i (0; . + $i)', 'foreach range(5) as $i (0; . + $i)', 'label $out | 1, break $out, 2', 'def f(x): x * 2; f(3)', 'isvalid(error)?', 'input_filename | type', 'ltrimstr("x")', '"\\(1+2)"', '@json "v=\\(.)"', 'tojson | length', 'indices(1)?', '"a,b" | split(",")', '"a1b2" | gsub("[0-9]";"#")', '"abc" | sub("(?<x>b)";"[\\(.x)]")', '"abc" | capture("(?<x>b)")', '[match("a";"g")?]', 'ascii(65)?', 'tojson|fromjson', 'getpath([])', 'del(.a)?', 'to_entries?', 'keys_unsorted?', 'add?', 'any?', 'min_by(.)?', 'unique?', 'group_by(.)?', 'combinations?', 'transpose?', 'input?', 'ltrimstr("")', 'splits("")?', 'tostring | test("\\\\p{L}")', '"\u00df" | ascii_upcase', '"\u0130" | ascii_downcase', '@uri "\\(.)"', 'tojson | @base64 | @base64d | fromjson', 'now - now | fabs < 1', 'mktime?', '(numbers | . + 1e9 | todate)?', '[2026,10,17,10,30,0,2,320] | todate', 'dateadd("seconds"; 1)?', 'date?', 'localtime?', 'gmtime?|todate?', '"2026-02-30T00:00:00Z" | fromdate?', '"x" * 3', '"x" * 0', '[1,2,3] - [2]', '{} + null', 'null + 1', '"a" + 1', '{} | .["a"]?', '.[1:3]?', '.[:-1]?', '"abcdef" | .[2:4]', '[1,2,3] | .[1:] = ["x"]', '[1,2,3] | del(.[0,2])', 'try (1/0) catch .', '[1,2] | .[1e10]?', '. == .', '[limit(5; repeat(1))]', 'tojson | . as $s | $s | fromjson | . == .', 'splits("a") | 1', '$x', '.a.b.c', '.[', 'foo', 'import "x" as x; 1', 'include "x"; 1', 'input | input', '{(1):2}', '{"a":1} | has("a"), has("b")', '[1] | has(0)', 'ascii_downcase', 'ltrimstr', '@csv', '[1,"a\\"b",null,true] | @csv', '[1,"a\\tb"] | @tsv', '[[1]] | @csv', 'tojson | @sh', 'getpath(["a"]) |= 3', 'to_entries | from_entries', 'with_entries(select(.key != "a"))', 'ltrimstr("a") | ascii_downcase', '@text "\\(1)"', '"\\u0000x" | length', '"a\\u0000b"', 'implode?', '[65, 1114112] | implode?', '[55357] | implode?', '"\\ud83d"', '"\\ud83d\\ude00" | explode', 'tojson | explode | length', 'splits(1)?', 'getpath("a")?', 'ascii(1)?', 'error(error)', 'try error("\\u0000") catch .', '"\\(null)"', 'null | not', '[.[] | numbers]?', 'env | has("HOME")', 'halt_error("x")?', '"abc" | halt_error(0)', 'input_line_number | type', 'get_search_list?', 'modulemeta?', '$__prog_name?', 'ltrimstr("a"; "b")?', 'tojson | test("a")', 'limit(-1; 1,2)', 'nth(1; 1,2,3)', 'nth(-1; 1,2,3)', 'first(empty)', 'last(empty)', 'isempty(empty)', 'add(empty)?', 'range(1;0)', 'range(0;10;-1)', '[range(0;10;3)]', 'splits("a";null)?', '[.[]?] | length', 'tojson | ltrimstr("{")', 'sql?', 'ascii?', 'getpath(["a","b","c"])?', 'paths(type == "number")', 'leaf_paths', 'any(.[]?; . == 1)', 'all', 'flatten(-1)?', 'range(3) as $x | $x*2', 'env.__loc__', '$__loc__.line', 'try input catch .', '[inputs] | length', 'first(inputs)', 'input, input, input, input', 'ltrimstr("a"), input', 'tojson, (input|tojson)', '{a:1} | .a as $x | [$x, $__loc__.file]', '@json "\\(.)" | length', 'ascii_downcase? // "no"', 'tostring | length', 'tojson | fromjson | tojson | length', 'tojson | .[0:10]', 'error("\\(.)")?', 'if . then 1 end', 'if . == 1 then 1 elif . == 2 then 2 else 3 end', '.. |= (if type == "number" then . + 1 else . end)', 'del(..|select(. == null))', 'to_entries[]?', 'splits("\\\\s+")?', '"a  b" | [splits(" +")]', '"abc" | ascii', 'tojson | @uri', 'getpath(["a"]; 1)?', 'trimstr("a")?', 'ltrimstr("h") | rtrimstr("o")', 'abs?', 'toarray?', 'have_decnum?', 'getpath(["big"])?', '.big?', '.big? | . + 1', '.f?', '.b?', '.b? | add?', '[.b?[]? | numbers] | add', 'tojson | fromjson | .big?', '.big? | tostring', '.big? | tojson', '[.big?] | sort', '.big? == 12345678901234567890', '12345678901234567890 == 12345678901234567891', '9007199254740993', '-9007199254740993', '1.5e308 * 10', '5e-324', '1e-400', '0.1e1', '1E2', '1.10', '1.0e0', '[1.0, 2.50]', '{"a":1.0}', '1.0 + 0', '3.14159265358979323846264338327950288', '123456789012345678901234567890 | . + 0', '0.30000000000000004', '100000000000000000000000000000000000000', '1e17', '1e16', '123456789012345680000', '1.7976931348623157e308', '4.9e-324', 'pow(2;64)', 'pow(2;53)+1', '13911860366432393 | . * 1', '0.1 + 0.7', '1e500 | tojson', '-1e500', '[1e500] | tojson', 'infinite | tostring', 'nan | tostring', 'nan | tojson', '[nan, infinite, -infinite]', 'nan < 1', 'null < false', '[] < {}', '"a" < "b"', '{"a":1} == {"a":1.0}', '[{"b":1,"a":2}] | sort_by(.a)', '{"b":1,"a":2} | keys', '{"b":1,"a":2} | to_entries', '{"b":1,"a":2}', '{"b":1,"a":2} | tojson', '{"b":1,"a":2} | tostring', 'ltrimstr("x") | tojson?', '$__loc__ | tojson', '"\\u007f\\u0080\\u2028\\u2029\\ufeff"', '"<script>&\'"', '"\\b\\f\\n\\r\\t\\u001f\\\\/"', '"/"', '"\\ud83d\\ude00"', '"\\u00e9" | @json', '@text', '@json', '@html', '@uri', '@csv?', '@tsv?', '@sh?', '@base64?', '@base64d?', '@base32?', '@base32d?'];
const INPUTS = ['', ' ', '\n', '1', '1 2 3', '[1,2', '{"a":1}{"a":2}', '{"a":1}\n\n\n{"a":2}', 'nan', 'NaN', 'Infinity', '-Infinity', "'a'", '{a:1}', '[1,]', '01', '1.', '.5', '+1', '"\\x"', '"tab\tin string"', '"nl\nin string"', '\ufeff{"a":1}', '{"a":1}\ufeff', '\u0000', '{"a":1}\u0000{"b":2}', '// c\n1', '# c\n1', '1 # c', 'true false null', 'tru', '[1]]', '{"a":1,"a":2}', '{"a":{"a":{"a":{}}}}', '"\ud800"', '"\\ud800"', '"\\udc00\\ud800"', '1e', '1e+', '0x10', '1_000', '\r\n1\r\n2\r\n', '[1,2]\r\n', 'a\r\nb\r\n', 'a\nb', 'a\n\nb\n', '\n', 'x', '{"a":1} x', '1 2 x 3', { rep: [['"', 1], ['a', 100000], ['"', 1]] }, { rep: [['[', 1], ['1,', 50000], ['1]', 1]] }, { rep: [['[', 300], [']', 300]] }, { rep: [['[', 12000], [']', 12000]] }];
// cases whose message names folders of the machine that made the fixture: only the exit status and stdout are compared
const LOOSE = /import |include |get_search_list|modulemeta/;
const cases = [];
const add = (f, p, i, a, g) => cases.push({ f, p, i, ...(a ? { a } : {}), ...(g ? { g } : {}) });
// 1. every option combination the tab offers × filters that show the option
for (const f of ['', 'r', 'c', 's', 'S', 't', 'a', 'j', 'ra', 'ct', 'cS', 'sc', 'rj', 'aj', 'n', 'R', 'Rs', 'nR', 'ns', 'Rr', 'St', 'ca', 'e', 'ne', 'ce', 'Rsr', 'nRs', 'raj', 'Sa', 'ja', 'tS', 'cr'])
  for (const p of ['.', '.a?', '.. | strings?', 'input', '[inputs]', 'tojson', '.[0]?', 'length', '@json', '"x\\ty"', 'ascii_downcase?', 'tostring', 'empty', 'null', 'false', '.[]?', 'input_filename', 'input_line_number', '.a? // empty | ., "\\u00e9\\u2615"']) add(f, p, IN);
// 2. builtins, numbers, errors, halts
for (const p of F) for (const f of ['n', 'nc', '', 'e']) add(f, p, IN);
// 3. inputs: valid, invalid, odd bytes, several values, deep and long
for (const i of INPUTS) for (const f of ['', 's', 'R', 'Rs', 'n', 'c', 'nR', 'sRn', 'e']) for (const p of ['.', '[inputs]', 'input', 'length?', 'input_line_number']) add(f, p, i);
// 4. --arg / --argjson
for (const [p, a] of [['$a', { a: 'x=y z' }], ['$a', { a: 'ünï ☕' }], ['[$a,$b]', { a: { x: [1, 2] }, b: 'q' }], ['$ARGS', { a: 1, b: 'two' }], ['$named', { a: 1 }], ['$ENV.a', { a: 1 }], ['$__loc__', { __loc__: 'x' }], ['$ARGS', { ARGS: 'x' }],
  ['$a | type', { a: '5' }], ['$a + 1', { a: 5 }], ['$a', { a: null }], ['$a.b[1]', { a: { b: [1, 2] } }], ['[$a, $ARGS.named.a] | unique | length', { a: [1, 1.0] }], ['$big', { big: 12345678901234567890 }], ['$JQ_BUILD_CONFIGURATION | type', {}], ['$a', { a: "it's" }], ['$a', { a: '' }], ['$a | length', { a: 'a\nb' }]])
  for (const f of ['n', 'nc', 'nr']) add(f, p, '', a);
// 5. positions in messages: errors on the 1st, 3rd and last input line, and inside `inputs`
for (const p of ['.a', '.[0]', 'if . == 3 then error("three") else . end', 'input_line_number', '[., input_line_number]', 'try error("x") catch input_line_number', '.a.b', 'error', 'error(null)', 'error({})', 'halt_error', 'if . == 2 then halt else . end', 'if . == 2 then halt_error(7) else . end', 'if . == 2 then ("stop\\n" | halt_error(1)) else . end', 'debug', 'debug("at \\(.)")', 'stderr', '., (. | tojson | stderr | empty)'])
  for (const f of ['', 'c', 'e', 's', 'n']) for (const i of ['1\n2\n3\n4\n', '{"a":{"b":1}}\n[1]\n"x"\n', '1\n2\n[3\n4\n', '\n\n\n{"a":1}\n\n{"a":']) add(f, p, i);
// 6. what the tab's e2e suite (tests/e2e/jq.e2e.mjs) types into the page — tag g: the sample with its filter, every
//    example chip (the tab always passes --arg name Ravi from its Arguments box), filter + option cases, arguments
const S = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/tools/software/jq-samples.json'), 'utf8'));
const SAMPLE = JSON.stringify(S.sample, null, 2), NAME = { name: 'Ravi' };
add('', S.filter, SAMPLE, NAME, 'sample');
for (const [p] of S.examples) for (const f of ['', 'r']) add(f, p, SAMPLE, NAME, 'chip');
for (const [p, i, f] of [
  ['.', '{"b":[1,2,{"x":"é"}],"a":null}', ''], ['.', '{"b":[1,2],"a":"€"}', 'cS'], ['.[]', '["x","y"]', 'r'],
  ['.', '1 2 3', 's'], ['[inputs] | add', '1 2 3', 'n'], ['input', '7 8', 'n'], ['.', 'line one\nline "two"', 'R'],
  ['split("\\n") | length', 'a\nb\nc', 'Rs'], ['.', '{"a":[1,{"b":2}]}', 't'], ['.', '"ünïcødé ₹ 😀"', 'a'],
  ['.[]', '["a","b",1]', 'j'], ['.a', '{"a":1}\n{"a":2}\n{"a":3}', 'c'],
  ['.[] | [.n, .v] | @csv, @tsv', '[{"n":"x,y","v":"q\\"t"},{"n":"tab\\there","v":2}]', 'r'], ['@base64, (@base64 | @base64d), @uri, @html', '"a+b <c> & d/é"', 'r'],
  ['[.[] | select(test("^[A-Z][a-z]+ \\\\d{3}$"))], [.[] | capture("(?<w>[a-z]+) (?<n>\\\\d+)")], (.[0] | gsub("(?<d>\\\\d)"; "<\\(.d)>"))', '["Pune 411","mumbai 400","Delhi 11"]', 'c'],
  ['"2026-11-16T10:30:00Z" | fromdate, (fromdate | strftime("%A %d %B %Y")), (1700000000 | todate)', 'null', ''],
  ['[paths], [paths(scalars)], (tostream | select(length == 2)) | tojson', '{"a":[1,{"b":null}],"c":"x"}', 'r'],
  ['reduce range(1; 11) as $i (0; . + $i), ([limit(5; repeat(.) | . * 2)] | length), (def f: if . > 1 then . * (. - 1 | f) else 1 end; 20 | f)', '3', 'c'],
  ['to_entries | sort_by(.value) | from_entries | keys_unsorted', '{"z":3,"y":1,"x":2}', 'c'],
  ['.[] as [$a, $b] | {a: $a, b: $b}, (. as [[$x]] ?// [$x] | $x)', '[[1,2],[3,4]]', 'c'],
  ['ascii_downcase, ltrimstr("He"), (explode | implode), (. / "l"), ([match("l+"; "g").offset]), (@json | fromjson), tojson', '"HeLLo world"', 'c'],
  ['getpath(["a","b"]) = 5 | del(.c) | walk(if type == "number" then . + 1 else . end)', '{"a":{"b":1},"c":2,"d":[1,2]}', 'c'],
  ['[splits(", *")], (.[2:4]), (indices(",")), ascii_upcase, (tostring | length)', '"a, b,c"', 'c'],
  // options together
  ['.', '{"b":"é","a":[1,2]}', 'ct'], ['.', '{"b":"é","a":[1,2]}', 'St'], ['.', '{"b":"é","a":[1,2]}', 'cSa'], ['.[]', '["é","b",{"k":"₹"}]', 'ra'], ['.[]', '["é","b",{"k":"₹"}]', 'ja'], ['.[]', '["é","b",{"k":"₹"}]', 'rj'],
  ['.', 'a,b\n1,2\n', 'Rr'], ['.', 'a,b\n1,2\n', 'Rsr'], ['[inputs]', 'a\nb\n', 'nRc'], ['., input', '1 2 3 4', 'c'], ['[., input]', '1 2 3', 'c'], ['.', '[1,[2,[3,{"a":[]}]],{}]', ''], ['.', '[1,[2,[3,{"a":[]}]],{}]', 'tS'],
  // messages: an error on one of several inputs, debug / stderr, halt, input that is not JSON, compile errors
  ['.a', '{"a":1}\n5\n{"a":3}\n', 'c'], ['.a', '{"a":1}\n5\n', 'c'], ['.[] | .a', '[{"a":1},5,{"a":3}]', 'c'], ['error("custom stop")', 'null', ''], ['error({"code":7})', 'null', ''], ['debug | .a', '{"a":1}', 'c'], ['debug("id \\(.a)") | .a', '{"a":1}\n{"a":2}\n', 'c'], ['"note\\n" | stderr | 1', 'null', ''],
  ['if . == 2 then ("stop here\\n" | halt_error(7)) else . end', '1 2 3', 'c'], ['if . == 2 then halt else . end', '1 2 3', 'c'], ['.', '{"a": 1', ''], ['.', '{"a":1}\n{"a":\n', 'c'], ['.', "{'a': 1}", ''], ['[inputs]', '1 2 x', 'nc'],
  ['.[', '{}', ''], ['.a |', '{}', ''], ['foo', '{}', ''], ['$nope', '{}', ''], ['.a as $x | $y', '{}', ''], ['{a: 1', '{}', ''], ['. | map(.x', '[]', ''], ['"abc', '{}', ''], ['import "lib" as lib; .', '{}', ''],
  ['input_filename, input_line_number', '1\n2\n', 'c'], ['9007199254740993, 1e1000, 0.1 + 0.2, 100000000000000000000, 3.0, 1.10', 'null', ''], ['.', '9007199254740993 12345678901234567890 1.000 1e2', 'c'],
]) add(f, p, i, null, 'case');
for (const [p, a] of [['[$name, $n, $ARGS.named]', { name: 'Asha Rao', n: { k: [1, 2] } }], ['$a + $b', { a: 'x', b: 'y' }], ['$n | . * 2', { n: 21 }], ['$q', { q: "it's \"quoted\"" }], ['$empty | length', { empty: '' }], ['.orders[] | select(.id == $id) | .customer', { id: 102 }]])
  add('c', p, p.includes('orders') ? SAMPLE : 'null', a, 'args');
// … and a spread of the cases above that a text box can hold (no -e, no control characters, not too long)
{ let k = 0; for (const c of cases) if (!c.g && !c.f.includes('e') && typeof c.i === 'string' && c.i.length < 3000 && !/[\u0000-\u0008\r﻿\ud800-\udfff]/.test(c.i) && !Object.values(c.a || {}).some((v) => typeof v === 'string' && /\n/.test(v)) && k++ % 29 === 0) c.g = 'spread'; }
const make = (i) => typeof i === 'string' ? i : i.rep.map(([u, n]) => u.repeat(n)).join('');
const dir = mkdtempSync(join(tmpdir(), 'jqref-'));
const keep = (s) => s.length > 3000 ? { len: s.length, sha256: createHash('sha256').update(s).digest('hex') } : s;
const out = [];
for (const c of cases) {
  writeFileSync(join(dir, 'input.json'), make(c.i));
  const flags = [...c.f].filter((k) => !(k === 't' && c.f.includes('c'))).map((k) => FLAG[k]);
  const args = Object.entries(c.a || {}).flatMap(([k, v]) => typeof v === 'string' ? ['--arg', k, v] : ['--argjson', k, JSON.stringify(v)]);
  const r = spawnSync(JQ, [...flags, ...args, c.p, 'input.json'], { cwd: dir, env: { TZ: 'UTC' }, maxBuffer: 1 << 28 });
  if (r.status === null) { console.error(`killed (${r.signal}): ${c.f} ${c.p}`); continue; }   // a crash of the native jq is not a reference
  out.push({ ...c, o: keep(r.stdout.toString('utf8')), e: LOOSE.test(c.p) ? null : keep(r.stderr.toString('utf8').trim()), s: r.status });
}
rmSync(dir, { recursive: true });
const dest = join(dirname(fileURLToPath(import.meta.url)), '../tests/fixtures/jq/reference.json');
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, '{"jq":"1.8.2","cases":[\n' + out.map((c) => JSON.stringify(c)).join(',\n') + '\n]}\n');
console.log(`${out.length} cases → ${dest}`);
