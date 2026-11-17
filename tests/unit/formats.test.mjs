// formats-yaml.wasm / formats-schema.wasm (Rust, built by us — wasm/formats).
// YAML ⇄ JSON ⇄ TOML (conv.rs: libyaml and toml read, our own writers write):
//   1. known answers: YAML features (anchors, merge keys, block scalars, tags, several documents), numbers that keep
//      their digits, .inf / .nan, TOML dates, what each writer quotes, messages with positions, notes, limits;
//   2. a corpus of awkward strings, number spellings and 800 seeded random documents (tests/lib/formats-corpus.mjs):
//      JSON → YAML → JSON and JSON → TOML → JSON give the same data back, type for type;
//   3. the same outputs read by INDEPENDENT parsers when python3 has them (tests/lib/formats_check.py): PyYAML (a
//      YAML 1.1 parser — the one that turns `no` into false and 1:30 into 90), ruamel.yaml (YAML 1.2), tomllib;
//   4. texts that OTHER programs wrote (PyYAML, ruamel.yaml, tomli_w, toml; real-world files) with the data they
//      stand for (tests/fixtures/formats/reference.json, scripts/make-formats-reference.py): our reader gives that data.
// JSON Schema: validation (draft 2020-12 and 7 keywords, formats, $ref) and schema inference.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
export default async (t, { load, wasm, root }) => {
  const { bindFormats } = await load('/src/wasm/formats.ts');
  const y = bindFormats(await wasm('formats-yaml')), sc = bindFormats(await wasm('formats-schema'));
  const { STRINGS, NUMBERS, rng, typedNum, same, makeDoc, typedFromJson } = await import(join(root, 'tests/lib/formats-corpus.mjs'));
  const call = (text, from, to, indent = 2) => y.call('convert', { text, from, to, indent });
  const cv = (text, from, to, indent = 2) => call(text, from, to, indent).out;
  const err = (f) => { try { f(); return null; } catch (e) { return e; } };
  const msg = (text, from, to) => { const e = err(() => cv(text, from, to)); return e ? `${e.message}${e.line ? ` @${e.line}:${e.column}` : ''}` : 'no error'; };
  const J = (text, from) => JSON.parse(cv(text, from, 'json'));

  // ---------------------------------------------------------------- 1. known answers
  // YAML in
  t.eq(J('name: Asha\nage: 30\ntags: [a, b]\nok: true\nnone: ~\n', 'yaml'), { name: 'Asha', age: 30, tags: ['a', 'b'], ok: true, none: null }, 'YAML → JSON basics');
  t.eq(cv('base: &b {x: 1, y: 2}\nchild:\n  <<: *b\n  y: 3\nref: *b\n', 'yaml', 'json', 0), '{"base":{"x":1,"y":2},"child":{"x":1,"y":3},"ref":{"x":1,"y":2}}', 'anchors, aliases and << merge keys: own keys win, merged keys stand where the << was');
  t.eq(cv('a: &a {k: 1, p: 1}\nb: &b {k: 2, q: 2}\nc:\n  z: 0\n  <<: [*a, *b]\n  q: 9\n', 'yaml', 'json', 0), '{"a":{"k":1,"p":1},"b":{"k":2,"q":2},"c":{"z":0,"k":1,"p":1,"q":9}}', 'a list of merges: the earlier one wins, own keys win over both');
  t.eq(cv('"<<": hello\nb:\n  <<: 5\n', 'yaml', 'json', 0), '{"<<":"hello","b":{"<<":5}}', 'a << whose value is not a mapping is an ordinary key (was: an error)');
  t.eq(J('lit: |\n  line1\n  line2\nfold: >\n  a\n  b\n\n  c\nstrip: |-\n  x\nkeep: |+\n  y\n\nind: |2\n    deep\n', 'yaml'), { lit: 'line1\nline2\n', fold: 'a b\nc\n', strip: 'x', keep: 'y\n\n', ind: '  deep\n' }, 'block scalars | and > with chomping and an indentation indicator');
  t.eq(cv('a: 1\n---\nb: 2\n---\n- 3\n', 'yaml', 'json', 0), '[{"a":1},{"b":2},[3]]', 'three YAML documents → a JSON array');
  t.eq(call('a: 1\n---\nb: 2\n', 'yaml', 'json').documents, 2, 'the number of documents is reported');
  t.eq(J('v: 1.0\nn: 0x1F\no: 0o17\ns: "yes"\nb: yes\nc: on\nd: NO\ne: y\nf: True\ng: FALSE\nh: Null\n', 'yaml'), { v: 1, n: 31, o: 15, s: 'yes', b: 'yes', c: 'on', d: 'NO', e: 'y', f: true, g: false, h: null }, 'YAML 1.2: hex / octal integers; yes, on, NO, y stay text; True / FALSE / Null are read');
  t.eq(cv('oct1: 014\nsexa: 1:30:00\nund: 1_000\nplus: +12\nleadz: 007\nd: 2026-11-17\nt: 10:30\n', 'yaml', 'json', 0), '{"oct1":"014","sexa":"1:30:00","und":"1_000","plus":12,"leadz":"007","d":"2026-11-17","t":"10:30"}', 'no YAML 1.1 surprises: 014, 1:30:00, 1_000, dates and times stay text');
  t.eq(cv('u64: 18446744073709551615\nover: 18446744073709551616\nbig: 123456789012345678901234567890\nneg: -9223372036854775809\nhex: 0xFFFFFFFFFFFFFFFFF\n', 'yaml', 'json', 0), '{"u64":18446744073709551615,"over":18446744073709551616,"big":123456789012345678901234567890,"neg":-9223372036854775809,"hex":295147905179352825855}', 'integers beyond 64 bits keep every digit (was: "invalid type: integer … as u128")');
  t.eq(cv('a: 1.5e3\nb: .5\nc: 5.\nd: -0.0\ne: 1e-7\nf: 1.7976931348623157e308\ng: 100000000000000000000.0\n', 'yaml', 'json', 0), '{"a":1500.0,"b":0.5,"c":5.0,"d":-0.0,"e":1e-7,"f":1.7976931348623157e308,"g":1e20}', 'YAML floats → the shortest JSON number that reads back the same');
  t.eq(cv('a: !!str 123\nb: !!int "7"\nc: !!binary aGVsbG8=\nd: !Ref foo\ne: !!float 1\nf: !!set {a, b}\ng: !custom {x: 1}\nh: !Sub "${A}-x"\ni: !GetAtt [a, b]\n', 'yaml', 'json', 0), '{"a":"123","b":7,"c":"aGVsbG8=","d":"foo","e":1.0,"f":{"a":null,"b":null},"g":{"x":1},"h":"${A}-x","i":["a","b"]}', 'tags: core tags applied, custom tags (!Ref, !Sub, !GetAtt) dropped and the value kept');
  t.eq(cv('1: a\ntrue: b\n~: c\n1.5: d\n', 'yaml', 'json', 0), '{"1":"a","true":"b","null":"c","1.5":"d"}', 'keys that are numbers, booleans or null become their text in JSON');
  let r = call('1: a\n"1": b\nx: 0\n', 'yaml', 'json', 0);
  t.ok(r.out === '{"1":"b","x":0}' && r.notes.length === 1 && /same text key "1"/.test(r.notes[0]), `the keys 1 and "1" are one key in JSON: last value, a note (was: {"1":…,"1":…} — the same key twice) — ${r.notes[0]}`);
  t.eq(cv('1: a\n"1": b\ntrue: c\n', 'yaml', 'yaml'), "1: a\n'1': b\ntrue: c\n", 'YAML → YAML keeps such keys apart');
  t.eq([call('', 'yaml', 'json'), call('  \n', 'yaml', 'json'), call('# only a comment\n\n', 'yaml', 'json')].map((x) => [x.out, x.documents]), [['', 0], ['', 0], ['', 0]], 'nothing, white space or only comments: no document, empty output (was: null)');
  t.eq([cv('---\n...\n', 'yaml', 'json'), cv('a: 1\n---\n', 'yaml', 'json', 0), cv('\ufeffa: 1\r\nb:\r\n  - x\r\n', 'yaml', 'json', 0)], ['null', '[{"a":1},null]', '{"a":1,"b":["x"]}'], 'an explicit empty document is null; a byte-order mark and Windows line ends are fine');
  // YAML messages
  let e1 = err(() => cv('a: 1\n b: 2\nc: [1, 2\n', 'yaml', 'json')); t.ok(e1 && e1.line === 2 && /^YAML: /.test(e1.message), `YAML error with a line number (${e1?.message} @ ${e1?.line}:${e1?.column})`);
  t.eq(msg('a: 1\nb: [1, 2\nc: 3\n', 'yaml', 'json'), "YAML: did not find expected ',' or ']' @3:2", 'an unclosed [ is reported where the parser noticed');
  t.eq(msg('a:\n\tb: 1\n', 'yaml', 'json'), 'YAML: found character that cannot start any token @2:1', 'a tab used for indentation');
  t.ok(/^YAML: the key "a" is there twice in one mapping/.test(msg('a: 1\nb: 2\na: 3\n', 'yaml', 'json')), `a key written twice is refused (${msg('a: 1\nb: 2\na: 3\n', 'yaml', 'json')})`);
  t.eq(msg('a: *nope\n', 'yaml', 'json'), 'YAML: unknown anchor @1:4', 'an alias without its anchor');
  t.ok(/list as a key/.test(msg('? [a, b]\n: 1\n', 'yaml', 'json')) && /mapping as a key/.test(msg('? {a: 1}\n: 1\n', 'yaml', 'toml')), 'a list or a mapping as a key cannot be converted (said so)');
  t.eq([msg('a: .inf\n', 'yaml', 'json'), msg('l: [1, .NaN]\n', 'yaml', 'json')], ['JSON has no Infinity or NaN — the value at a is .inf in the YAML', 'JSON has no Infinity or NaN — the value at l[1] is .nan in the YAML'], '.inf / .nan cannot go to JSON: the message says where');
  t.eq([cv('a: .inf\nb: -.INF\nc: .NaN\n', 'yaml', 'yaml'), cv('a: .inf\nb: -.INF\nc: .NaN\n', 'yaml', 'toml')], ['a: .inf\nb: -.inf\nc: .nan\n', 'a = inf\nb = -inf\nc = nan\n'], '… but they go to YAML and TOML (was refused)');
  // limits
  const laughs = 'a: &a [x, x, x, x, x, x, x, x, x]\n' + 'bcdefghij'.split('').map((c, i) => `${c}: &${c} [${Array(9).fill('*' + 'abcdefghi'[i]).join(', ')}]`).join('\n') + '\n';
  t.ok(/repetition limit exceeded/.test(msg(laughs, 'yaml', 'json')), `a "billion laughs" alias bomb is refused (${msg(laughs, 'yaml', 'json')})`);
  t.ok(/recursion limit exceeded/.test(msg('a: &a [*a]\n', 'yaml', 'json')) && /recursion limit exceeded/.test(msg('['.repeat(5000) + ']'.repeat(5000), 'yaml', 'json')), 'an alias inside itself and 5000 nested lists are refused');
  t.ok(/Nested deeper than 512 levels/.test(msg('['.repeat(5000) + ']'.repeat(5000), 'json', 'yaml')) && /recurs/.test(msg('a = ' + '['.repeat(5000) + ']'.repeat(5000), 'toml', 'json')), 'JSON and TOML nesting limits');
  t.eq(cv('a: 1', 'yaml', 'json', 0), '{"a":1}', 'the engine works after those errors');

  // JSON in
  t.eq(cv('{"name":"Asha","items":[{"sku":"A","qty":2},{"sku":"B","qty":1}],"meta":{"v":1}}', 'json', 'yaml'), 'name: Asha\nitems:\n- sku: A\n  qty: 2\n- sku: B\n  qty: 1\nmeta:\n  v: 1\n', 'JSON → YAML');
  t.eq(cv('{"a":12345678901234567890,"b":123456789012345678901234567890,"c":1.0,"d":1e400,"e":-0,"f":0.1,"g":1e21,"h":9007199254740993,"i":-9223372036854775809,"j":1.10,"k":1E2}', 'json', 'json', 0), '{"a":12345678901234567890,"b":123456789012345678901234567890,"c":1.0,"d":1e400,"e":-0,"f":0.1,"g":1e21,"h":9007199254740993,"i":-9223372036854775809,"j":1.10,"k":1E2}', 'JSON → JSON keeps every number as written (was: "number out of range", 1.2345678901234568e+29, -0.0)');
  t.eq(cv('{"a":12345678901234567890,"c":1.0,"g":1e21,"h":9007199254740993,"f":1e-7,"j":1.10,"k":1E2,"l":1.5e300,"m":123456789.123456789}', 'json', 'yaml'), 'a: 12345678901234567890\nc: 1.0\ng: 1.0e+21\nh: 9007199254740993\nf: 1.0e-7\nj: 1.10\nk: 1.0e+2\nl: 1.5e+300\nm: 123456789.123456789\n', 'JSON → YAML: digits kept; floats get a decimal point and a signed exponent (YAML 1.1 parsers read 1e21 as text)');
  r = call('{"a":1,"b":2,"a":3}', 'json', 'yaml');
  t.ok(r.out === 'a: 3\nb: 2\n' && /The key "a" is there twice \(line 1\): the last value is used/.test(r.notes[0]), `a JSON key written twice: the last value, with a note (${r.notes[0]})`);
  r = call('{"a":"\\ud83d\\ude00 ok","b":"\\ud800 lone"}', 'json', 'yaml');
  t.ok(r.out === 'a: \ud83d\ude00 ok\nb: \ufffd lone\n' && /lone surrogate/.test(r.notes[0]), 'a lone surrogate escape becomes U+FFFD with a note (was: "unexpected end of hex escape")');
  t.eq([cv('\ufeff{"a":1}', 'json', 'yaml'), call('', 'json', 'yaml').out, call(' \n', 'json', 'toml').documents], ['a: 1\n', '', 0], 'a byte-order mark in front of JSON is skipped (was refused); empty input gives empty output');
  let e3 = err(() => cv('{"a": 1,\n "b": }', 'json', 'yaml')); t.ok(e3 && e3.line === 2 && e3.column === 7 && /^JSON: /.test(e3.message), `JSON error position (${e3?.message} @ ${e3?.line}:${e3?.column})`);
  t.eq(msg('{"a":1,}', 'json', 'yaml'), 'JSON: Trailing comma before } — remove the last comma @1:8', 'JSON messages are those of the JSON Formatter tab');
  t.eq(cv('{"a":[1,{"b":2}]}', 'json', 'json', 4), '{\n    "a": [\n        1,\n        {\n            "b": 2\n        }\n    ]\n}', 'JSON pretty with 4 spaces');
  t.eq([cv('{"a":[1,2],"e":{},"l":[]}', 'json', 'json', 0), cv('a: {}\nb: []\n', 'yaml', 'json', 2)], ['{"a":[1,2],"e":{},"l":[]}', '{\n  "a": {},\n  "b": []\n}'], 'JSON minified; empty containers stay {} and []');

  // YAML out: what is quoted
  t.eq(cv(JSON.stringify({ a: 'no', b: '123', c: '1.0', d: 'null', e: '~', f: '', g: ' lead', h: 'a: b', i: '#c', j: 'multi\nline', k: '0x10', l: '1e3', m: 'true', n: '2026-01-01', o: '@x', p: '- x', q: '[x]', r: 'y', s: '.inf', t: '0o7', u: '+1', v: '1_000', w: '010', x: '1:30', y: '8080:80', z: 'Yes' }), 'json', 'yaml'),
    "a: 'no'\nb: '123'\nc: '1.0'\nd: 'null'\ne: '~'\nf: ''\ng: ' lead'\nh: 'a: b'\ni: '#c'\nj: |-\n  multi\n  line\nk: '0x10'\nl: '1e3'\nm: 'true'\n'n': '2026-01-01'\no: '@x'\np: '- x'\nq: '[x]'\nr: 'y'\ns: '.inf'\nt: '0o7'\nu: '+1'\nv: '1_000'\nw: '010'\nx: '1:30'\n'y': '8080:80'\nz: 'Yes'\n",
    'JSON → YAML quotes every string another YAML parser could read as something else — no, y, Yes, 1_000, 1:30, 8080:80, 2026-01-01, 010 … (was: a: no, n: 2026-01-01, v: 1_000, x: 1:30 unquoted)');
  t.eq(cv(JSON.stringify({ a: 'plain text', b: 'http://x.y/z#frag', c: 'a:b', d: 'it\'s', e: '5 apples', f: 'v1.2.3', g: '-x', h: 'x - y', i: 'a,b', j: '\u0928\u092e\u0938\u094d\u0924\u0947 \ud83d\ude00', k: 'C:\\dir', l: '50%', m: 'a "b"', n2: '$5', o: 'x#y' }), 'json', 'yaml'),
    'a: plain text\nb: http://x.y/z#frag\nc: a:b\nd: it\'s\ne: 5 apples\nf: v1.2.3\ng: -x\nh: x - y\ni: a,b\nj: \u0928\u092e\u0938\u094d\u0924\u0947 \ud83d\ude00\nk: C:\\dir\nl: 50%\nm: a "b"\nn2: $5\no: x#y\n', '… and leaves ordinary text alone');
  t.eq(cv(JSON.stringify({ t: 'tab\there', c: 'cr\r\nlf', b: '\u0007bell', l: '\u2028', z: 'a\u0000b', n: '\u0085', f: '\ufeffx', q: 'say "hi"\n\tnow ' }), 'json', 'yaml'), 't: "tab\\there"\nc: "cr\\r\\nlf"\nb: "\\x07bell"\nl: "\\u2028"\nz: "a\\0b"\n\'n\': "\\x85"\nf: "\\ufeffx"\nq: "say \\"hi\\"\\n\\tnow "\n', 'control characters, Unicode line breaks and a byte-order mark are written as escapes in double quotes');
  t.eq(cv(JSON.stringify({ a: 'x\ny', b: 'x\ny\n', c: 'x\ny\n\n\n', d: 'x\n\ny', e: ' x\ny', f: 'x \ny', g: '\n', h: 'a\tb\nc' }), 'json', 'yaml'), 'a: |-\n  x\n  y\nb: |\n  x\n  y\nc: |+\n  x\n  y\n\n\nd: |-\n  x\n\n  y\ne: " x\\ny"\nf: "x \\ny"\ng: "\\n"\nh: "a\\tb\\nc"\n', 'text with line breaks: a literal block with the right chomping (|-, |, |+); double quotes when a block cannot hold it exactly (leading or trailing blanks on a line, tabs)');
  const longKey = 'k'.repeat(1500);
  t.ok(cv(JSON.stringify({ [longKey]: { a: 1 }, z: [1] }), 'json', 'yaml') === `? ${longKey}\n:\n  a: 1\nz:\n- 1\n` && same(typedFromJson(cv(cv(JSON.stringify({ [longKey]: { a: 1 } }), 'json', 'yaml'), 'yaml', 'json', 0)), { $map: [[longKey, { $map: [['a', 1]] }]] }), 'a key longer than 1024 characters is written as "? key" (YAML parsers refuse it otherwise)');
  t.eq(cv('{"z":1,"a":{"y":[1,2.5,true,null,"s"],"b":{}},"m":[],"e":"","l":[[1,[2]],{"k":[{"q":1}]}]}', 'json', 'yaml'), "z: 1\na:\n  'y':\n  - 1\n  - 2.5\n  - true\n  - null\n  - s\n  b: {}\nm: []\ne: ''\nl:\n- - 1\n  - - 2\n- k:\n  - q: 1\n", 'JSON → YAML layout: key order kept, nested lists and maps, empty containers');
  t.eq(cv('a\n---\n1\n---\n[x]\n', 'yaml', 'yaml'), 'a\n---\n1\n---\n- x\n', 'YAML → YAML with several documents');
  t.eq(cv('# top\na: &x 1 # trailing\nb: *x\nc: {d: [1, 2]}\n', 'yaml', 'yaml'), 'a: 1\nb: 1\nc:\n  d:\n  - 1\n  - 2\n', 'YAML → YAML normalises: comments gone, aliases expanded, block style');

  // TOML
  const toml = cv('{"title":"Shop","owner":{"name":"Asha","dob":"1990-05-27"},"products":[{"name":"Tea","price":120.5},{"name":"Coffee","price":250}]}', 'json', 'toml');
  t.eq(toml, 'title = "Shop"\n\n[owner]\nname = "Asha"\ndob = "1990-05-27"\n\n[[products]]\nname = "Tea"\nprice = 120.5\n\n[[products]]\nname = "Coffee"\nprice = 250\n', 'JSON → TOML with a table and an array of tables');
  t.eq(J(toml, 'toml'), { title: 'Shop', owner: { name: 'Asha', dob: '1990-05-27' }, products: [{ name: 'Tea', price: 120.5 }, { name: 'Coffee', price: 250 }] }, 'TOML → JSON round trip, key order kept');
  t.eq(cv('d = 1979-05-27T07:32:00Z\nl = 1979-05-27\nt = 07:32:00\nldt = 1979-05-27T07:32:00\no = 1979-05-27T07:32:00.999999-08:00\n', 'toml', 'json', 0), '{"d":"1979-05-27T07:32:00Z","l":"1979-05-27","t":"07:32:00","ldt":"1979-05-27T07:32:00","o":"1979-05-27T07:32:00.999999-08:00"}', 'TOML dates and times become strings in JSON');
  t.eq(cv('# c\n[a]\nb = 1 # c2\nd = 1979-05-27\nt = 17:32:00\n', 'toml', 'toml'), '[a]\nb = 1\nd = 1979-05-27\nt = 17:32:00\n', 'TOML → TOML keeps dates as dates (was: d = "1979-05-27")');
  t.eq(cv('d = 1979-05-27T07:32:00Z\nl = 1979-05-27\nt = 17:32:00\n', 'toml', 'yaml'), "d: 1979-05-27T07:32:00Z\nl: 1979-05-27\nt: '17:32:00'\n", 'TOML → YAML: dates are YAML dates; a time alone is quoted (YAML 1.1 would read 17:32:00 as 63120)');
  t.eq([msg('a = inf\n', 'toml', 'json'), cv('a = nan\nb = -inf\n', 'toml', 'yaml'), cv('a = nan\nb = -inf\nc = +inf\n', 'toml', 'toml')], ['JSON has no Infinity or NaN — the value at a is inf in the TOML', 'a: .nan\nb: -.inf\n', 'a = nan\nb = -inf\nc = inf\n'], 'TOML inf / nan: refused for JSON with the place (was: silently null), kept for YAML and TOML');
  t.eq(cv('hex = 0xDEADBEEF\noct = 0o755\nbin = 0b11\nbig = 9_223_372_036_854_775_807\nflt = 1_000.5\nexp = 5e+22\n', 'toml', 'json', 0), '{"hex":3735928559,"oct":493,"bin":3,"big":9223372036854775807,"flt":1000.5,"exp":5e22}', 'TOML number spellings');
  t.eq([msg('{"a":12345678901234567890}', 'json', 'toml'), msg('{"a":{"b":[1,1e400]}}', 'json', 'toml')], ['TOML integers are 64-bit — 12345678901234567890 at a does not fit (-9223372036854775808 … 9223372036854775807). Write it as a string to keep every digit.', 'TOML floats are 64-bit — 1e400 at a.b[1] does not fit'], 'a number TOML cannot hold is refused with its place (was: written as the rounded float 12345678901234567000.0)');
  t.eq(cv('{"a":[1.0,1e21,1e-7,0.1,1E2,100.0,1.5e300,123456789.123456789,-0.0],"i":9223372036854775807,"n":-9223372036854775808}', 'json', 'toml'), 'a = [1.0, 1e21, 1e-7, 0.1, 1E2, 100.0, 1.5e300, 123456789.123456789, -0.0]\ni = 9223372036854775807\nn = -9223372036854775808\n', 'JSON → TOML keeps number spellings (was: 1500000…000.0 with 300 digits)');
  t.eq(cv('{"title":"x","mixed":[1,"a",{"k":1}],"emptyarr":[],"key with space":1,"":2,"a.b":3,"nested":{"deep":{"x":[[1,2],[3]]}},"empty":{},"srv":[{"ip":"1","tags":["a","b"]},{"ip":"2"}]}', 'json', 'toml'),
    'title = "x"\nmixed = [1, "a", { k = 1 }]\nemptyarr = []\n"key with space" = 1\n"" = 2\n"a.b" = 3\n\n[nested.deep]\nx = [[1, 2], [3]]\n\n[empty]\n\n[[srv]]\nip = "1"\ntags = ["a", "b"]\n\n[[srv]]\nip = "2"\n', 'TOML layout: short arrays on one line, inline tables inside arrays, quoted keys, [a.b] without an empty [a], [[arrays of tables]]');
  t.eq(cv(JSON.stringify({ long: Array.from({ length: 30 }, (_, i) => `item-${i}`), s: 'two\nlines\n', q: "it's\n'''\n", w: 'C:\\dir "x"', t: 'tab\t\u0001' }), 'json', 'toml'), `long = [\n${Array.from({ length: 30 }, (_, i) => `  "item-${i}",\n`).join('')}]\ns = '''\ntwo\nlines\n'''\nq = "it's\\n'''\\n"\nw = "C:\\\\dir \\"x\\""\nt = "tab\\t\\u0001"\n`, 'TOML: a long array goes one item per line; text with line breaks is a \'\'\'literal\'\'\' string when that holds it exactly');
  t.ok(/TOML has no null — the value at a\.b\[1\] is null/.test(msg('{"a":{"b":[1,null]}}', 'json', 'toml')), 'null cannot go to TOML (path named)');
  t.eq([msg('[1,2]', 'json', 'toml'), msg('5', 'json', 'toml'), msg('a: 1\n---\nb: 2\n', 'yaml', 'toml')], ['TOML needs a table (key = value pairs) at the top — this is a list', 'TOML needs a table (key = value pairs) at the top — this is a single value', 'TOML holds one document — this YAML has 2 (separated by ---). Convert them one at a time.'], 'what TOML cannot be: a list, a single value, several documents (each said plainly)');
  let e2 = err(() => cv('a = 1\nb = \n', 'toml', 'json')); t.ok(e2 && e2.line === 2 && /^TOML: /.test(e2.message), `TOML error position (${e2?.message} @ ${e2?.line}:${e2?.column})`);
  t.eq(msg('a = "\ud83d\ude00\ud83d\ude00\ud83d\ude00" x\n', 'toml', 'json'), 'TOML: unexpected key or value, expected newline, `#` @1:11', 'the column of a TOML error counts characters, not bytes (was 20 after three emoji)');
  t.ok(/^TOML: this number does not fit: TOML integers are 64-bit/.test(msg('a = 9223372036854775808', 'toml', 'json')), `a TOML integer beyond 64 bits (was: "u64 value was too large") — ${msg('a = 9223372036854775808', 'toml', 'json')}`);
  t.eq([msg('a = 1\na = 2', 'toml', 'json'), call('', 'toml', 'json').documents], ['TOML: duplicate key @2:1', 0], 'TOML duplicate key; empty TOML = nothing');
  t.eq(cv('a: 1\nb: [1, 2]\nc: {d: x}\nsrv:\n  - {n: a}\n  - {n: b}\n', 'yaml', 'toml'), 'a = 1\nb = [1, 2]\n\n[c]\nd = "x"\n\n[[srv]]\nn = "a"\n\n[[srv]]\nn = "b"\n', 'YAML → TOML');

  // ---------------------------------------------------------------- 2. corpus round trips through our own readers
  const out = [];   // { id, kind, text, typed } — the same outputs go to the Python parsers below
  const tryCv = (text, from, to) => { try { return cv(text, from, to, 0); } catch (e) { return { ERR: e.message }; } };
  STRINGS.forEach((s, i) => {
    const q = JSON.stringify(s), doc = `{"v":${q},${s === 'v' || s === 'l' ? '' : `${q}:1,`}"l":[${q},${q}]}`, typed = { $map: [['v', s], ...(s === 'v' || s === 'l' ? [] : [[s, 1]]), ['l', [s, s]]] };
    const yo = tryCv(doc, 'json', 'yaml'), back = yo.ERR ? yo : tryCv(yo, 'yaml', 'json'), top = tryCv(q, 'json', 'yaml');
    t.ok(!back.ERR && same(typedFromJson(back), typed) && !top.ERR && tryCv(top, 'yaml', 'json') === q, `the string ${q.slice(0, 60)} as a YAML value, key, list item and document comes back unchanged (${JSON.stringify(yo).slice(0, 80)})`);
    if (!yo.ERR) { out.push({ id: `sy${i}`, kind: 'yaml', text: yo, typed }); out.push({ id: `st${i}`, kind: 'yaml', text: top, typed: s }); }
    const to = tryCv(doc, 'json', 'toml'), tb = to.ERR ? to : tryCv(to, 'toml', 'json');
    t.ok(!tb.ERR && same(typedFromJson(tb), typed, true), `the string ${q.slice(0, 60)} as a TOML value, key and array item comes back unchanged (${JSON.stringify(to).slice(0, 80)})`);
    if (!to.ERR) out.push({ id: `sm${i}`, kind: 'toml', text: to, typed });
  });
  NUMBERS.forEach(([lit, kind], i) => {
    const doc = `{"n":${lit},"l":[${lit}]}`, typed = { $map: [['n', typedNum(lit, kind)], ['l', [typedNum(lit, kind)]]] };
    const yo = tryCv(doc, 'json', 'yaml'), back = yo.ERR ? yo : tryCv(yo, 'yaml', 'json');
    t.ok(tryCv(doc, 'json', 'json') === doc && !back.ERR && same(typedFromJson(back), typed), `the number ${lit}: JSON → JSON unchanged, JSON → YAML → JSON the same ${kind === 'f' ? 'float' : 'integer'} (${JSON.stringify(yo)})`);
    if (!yo.ERR) out.push({ id: `ny${i}`, kind: 'yaml', text: yo, typed });
    const to = tryCv(doc, 'json', 'toml');
    if (kind === 'I') t.ok(/64-bit/.test(to.ERR || ''), `the number ${lit} is refused for TOML (64-bit integers)`);
    else { t.ok(!to.ERR && same(typedFromJson(tryCv(to, 'toml', 'json')), typed), `the number ${lit}: JSON → TOML → JSON the same (${JSON.stringify(to)})`); if (!to.ERR) out.push({ id: `nt${i}`, kind: 'toml', text: to, typed }); }
  });
  const rnd = rng(20261117);
  for (let i = 0; i < 400; i++) {
    const d = makeDoc(rnd), yo = tryCv(d.json, 'json', 'yaml'), back = yo.ERR ? yo : tryCv(yo, 'yaml', 'json');
    const y2 = yo.ERR ? yo : tryCv(yo, 'yaml', 'yaml'), y3 = y2.ERR ? y2 : tryCv(y2, 'yaml', 'yaml');
    t.ok(!back.ERR && same(typedFromJson(back), d.typed) && y3 === y2, `random document ${i}: JSON → YAML → JSON gives the data back, YAML → YAML is stable (${d.json.slice(0, 100)})`);
    if (!yo.ERR) out.push({ id: `dy${i}`, kind: 'yaml', text: yo, typed: d.typed });
  }
  for (let i = 0; i < 400; i++) {
    const d = makeDoc(rnd, { toml: true }), to = tryCv(d.json, 'json', 'toml'), back = to.ERR ? to : tryCv(to, 'toml', 'json');
    const t2 = to.ERR ? to : tryCv(to, 'toml', 'toml'), t3 = t2.ERR ? t2 : tryCv(t2, 'toml', 'toml'), viaYaml = to.ERR ? to : tryCv(tryCv(to, 'toml', 'yaml'), 'yaml', 'json');
    t.ok(!back.ERR && same(typedFromJson(back), d.typed, true) && t3 === t2 && !viaYaml.ERR && same(typedFromJson(viaYaml), d.typed, true), `random table ${i}: JSON → TOML → JSON gives the data back, TOML → TOML is stable, TOML → YAML → JSON too (${d.json.slice(0, 100)})`);
    if (!to.ERR) out.push({ id: `dt${i}`, kind: 'toml', text: to, typed: d.typed });
  }

  // ---------------------------------------------------------------- 3. the same outputs, read by independent parsers
  const py = spawnSync('python3', [join(root, 'tests/lib/formats_check.py')], { input: JSON.stringify({ cases: out.map(({ id, kind, text }) => ({ id, kind, text })) }), encoding: 'utf8', maxBuffer: 1 << 28 });
  let res = null; try { res = py.status === 0 ? JSON.parse(py.stdout) : null; } catch { /* no python */ }
  for (const [lib, name] of [['pyyaml', 'PyYAML (YAML 1.1)'], ['ruamel', 'ruamel.yaml (YAML 1.2)'], ['tomllib', "Python's tomllib"]]) {
    if (!res?.have[lib]) { t.ok(true, `${name} is not installed here — its check of our output is skipped`); continue; }
    let n = 0; const bad = [];
    for (const c of out) { const got = res.results[c.id][lib]; if (got === undefined) continue; n++; if (!same(got, c.typed, lib === 'tomllib')) bad.push(`${JSON.stringify(c.text).slice(0, 120)} → ${JSON.stringify(got).slice(0, 120)}`); }
    t.ok(n > 700 && !bad.length, `${name} reads all ${n} of our ${lib === 'tomllib' ? 'TOML' : 'YAML'} outputs as exactly the data that went in${bad.length ? ` — ${bad.length} differ: ${bad.slice(0, 3).join(' ; ')}` : ''}`);
  }

  // ---------------------------------------------------------------- 4. texts other programs wrote
  const REF = JSON.parse(readFileSync(join(root, 'tests/fixtures/formats/reference.json'), 'utf8'));
  t.ok(REF.yaml.length >= 250 && REF.toml.length >= 140, `reference: ${REF.yaml.length} YAML and ${REF.toml.length} TOML texts`);
  for (const kind of ['yaml', 'toml']) REF[kind].forEach((c, i) => {
    const got = tryCv(c.text, kind, 'json');
    t.ok(!got.ERR && same(typedFromJson(got), c.typed, kind === 'toml' || !!c.unordered), `${kind.toUpperCase()} text ${i} written by ${c.by}: read as the data it stands for (${JSON.stringify(c.text).slice(0, 90)} → ${JSON.stringify(got).slice(0, 90)})`);
  });

  // ================================================================ JSON Schema
  const D = { 4: 'http://json-schema.org/draft-04/schema#', 6: 'http://json-schema.org/draft-06/schema#', 7: 'http://json-schema.org/draft-07/schema#', 2019: 'https://json-schema.org/draft/2019-09/schema', 2020: 'https://json-schema.org/draft/2020-12/schema' };
  const S = JSON.stringify({ $schema: D[2020], type: 'object', required: ['name', 'email', 'age'], properties: { name: { type: 'string', minLength: 2 }, email: { type: 'string', format: 'email' }, age: { type: 'integer', minimum: 18 }, tags: { type: 'array', items: { type: 'string' }, uniqueItems: true }, address: { $ref: '#/$defs/address' } }, additionalProperties: false, $defs: { address: { type: 'object', properties: { pin: { type: 'string', pattern: '^[1-9][0-9]{5}$' } } } } });
  const vraw = (schema, data) => sc.call('validate', { schema, data });
  const val = (data, schema = S) => vraw(typeof schema === 'string' ? schema : JSON.stringify(schema), JSON.stringify(data));
  const serr = (f) => { const x = err(f); return x ? `${x.message}${x.line ? ` @${x.line}:${x.column}` : ''}` : 'no error'; };
  /** One schema, many documents → "Yn…" (Y valid, n not valid). */
  const yn = (schema, datas) => sc.call('verdicts', { schema: JSON.stringify(schema), datas: datas.map((d) => JSON.stringify(d)) }).valid.map((x) => (x ? 'Y' : 'n')).join('');

  // ---- known answers
  t.eq(val({ name: 'Asha', email: 'asha@example.in', age: 30, tags: ['a', 'b'], address: { pin: '411001' } }).valid, true, 'valid document');
  const rs = val({ name: 'A', email: 'not-an-email', age: 17.5, tags: ['a', 'a'], address: { pin: '011001' }, extra: 1 });
  t.eq(rs.errors.map((x) => [x.path, x.message, x.schemaPath]).sort(), [
    ['', "Additional properties are not allowed ('extra' was unexpected)", '/additionalProperties'],
    ['/address/pin', '"011001" does not match "^[1-9][0-9]{5}$"', '/$defs/address/properties/pin/pattern'],
    ['/age', '17.5 is less than the minimum of 18', '/properties/age/minimum'],
    ['/age', '17.5 is not of type "integer"', '/properties/age/type'],
    ['/email', '"not-an-email" does not have the format "email"', '/properties/email/format'],
    ['/name', '"A" is shorter than 2 characters', '/properties/name/minLength'],
    ['/tags', '["a","a"] has non-unique elements', '/properties/tags/uniqueItems'],
  ], 'every problem with where it is (JSON pointer), what is wrong and which rule of the schema says so');
  t.eq([rs.valid, rs.total, rs.more, rs.draft], [false, 7, false, 'Draft 2020-12'], 'the result says how many problems there are and which draft was used');
  t.eq(val({ name: 'Asha', email: 'a@b.in' }).errors.map((x) => x.message), ['"age" is a required property'], 'a missing required property');
  t.eq([val({}, {}).draft, val({}, { $schema: D[7] }).draft, val({}, { $schema: D[4] }).draft, val({}, { $schema: D[6] }).draft, val({}, { $schema: D[2019] }).draft, val({}, { $schema: 'http://json-schema.org/draft-07/schema' }).draft],
    ['Draft 2020-12 (the schema has no "$schema" line, so the newest draft is used)', 'Draft 7', 'Draft 4', 'Draft 6', 'Draft 2019-09', 'Draft 7'], 'the draft comes from "$schema" (with or without the # at its end); without one the newest is used and said');
  let big = val(Array(500).fill('x'), { type: 'array', items: { type: 'integer' } });
  t.eq([big.valid, big.errors.length, big.total, big.more, big.errors[199].path], [false, 200, 500, false, '/199'], '500 problems: the first 200 are listed and the total is given (was: "200 problems")');
  big = val(Array(6000).fill('x'), { type: 'array', items: { type: 'integer' } });
  t.eq([big.errors.length, big.total, big.more], [200, 5000, true], 'counting stops at 5000 problems ("more than")');
  const long = val({ a: 'x'.repeat(5000) }, { type: 'string' }).errors[0].message;
  t.ok(long.length < 450 && long.includes(' … ') && long.endsWith('is not of type "string"'), `a message that quotes a huge value is cut in the middle (${long.length} characters)`);
  // boolean schemas, true / false as documents
  t.eq([vraw('true', '{"a":1}').valid, vraw('false', '1').valid, vraw('false', '1').errors[0].message, vraw('{}', 'null').valid], [true, false, 'False schema does not allow 1', true], 'the schemas true, false and {}');

  // ---- drafts: what a keyword means depends on the draft
  t.eq([yn({ $schema: D[4], type: 'number', minimum: 5, exclusiveMinimum: true }, [5, 6, 4]), yn({ $schema: D[6], exclusiveMinimum: 5 }, [5, 6]), yn({ $schema: D[4], type: 'integer' }, [1, 2]), sc.call('verdicts', { schema: JSON.stringify({ $schema: D[4], type: 'integer' }), datas: ['1.0', '1'] }).valid, sc.call('verdicts', { schema: JSON.stringify({ $schema: D[7], type: 'integer' }), datas: ['1.0', '1.5', '1e2'] }).valid],
    ['nYn', 'nY', 'YY', [false, true], [true, false, true]], 'exclusiveMinimum is true / false in Draft 4 and a number later; 1.0 is an integer from Draft 6 on, not in Draft 4');
  t.eq([yn({ $schema: D[4], const: 1 }, [2, 1]), yn({ $schema: D[6], const: 1 }, [2, 1]), yn({ $schema: D[6], if: { const: 1 }, then: { const: 2 } }, [1]), yn({ $schema: D[7], if: { const: 1 }, then: { const: 2 } }, [1, 3])], ['YY', 'nY', 'Y', 'nY'], 'const exists from Draft 6, if / then from Draft 7 (ignored before)');
  t.eq([yn({ $schema: D[7], definitions: { s: { type: 'string' } }, properties: { a: { $ref: '#/definitions/s', maxLength: 1 } } }, [{ a: 'long' }, { a: 5 }]), yn({ $schema: D[2019], $defs: { s: { type: 'string' } }, properties: { a: { $ref: '#/$defs/s', maxLength: 1 } } }, [{ a: 'long' }, { a: 'x' }])], ['Yn', 'nY'], 'keywords next to $ref are ignored up to Draft 7 and apply from 2019-09');
  t.eq([yn({ $schema: D[2020], prefixItems: [{ type: 'string' }, { type: 'integer' }], items: { type: 'boolean' } }, [['a', 1, true], ['a', 'b'], ['a', 1, 2]]), yn({ $schema: D[2019], items: [{ type: 'string' }], additionalItems: false }, [['a'], ['a', 1]]), yn({ $schema: D[2020], prefixItems: [{ type: 'string' }], unevaluatedItems: false }, [['a'], ['a', 1]])], ['Ynn', 'Yn', 'Yn'], 'tuples: prefixItems + items (2020-12), items as a list + additionalItems (before), unevaluatedItems');
  t.eq([yn({ $schema: D[2019], allOf: [{ properties: { a: {} } }], properties: { b: {} }, unevaluatedProperties: false }, [{ a: 1, b: 2 }, { a: 1, c: 3 }]), yn({ $schema: D[2019], dependentRequired: { card: ['cvv'] } }, [{ card: 1 }, { card: 1, cvv: 2 }, {}]), yn({ $schema: D[7], dependencies: { card: ['cvv'], x: { required: ['y'] } } }, [{ card: 1 }, { x: 1 }, { x: 1, y: 1 }])], ['Yn', 'nYY', 'nnY'], 'unevaluatedProperties, dependentRequired (2019-09) and dependencies (Draft 7)');
  t.eq([yn({ $schema: D[2020], $ref: '#/$defs/node', $defs: { node: { type: 'object', required: ['v'], properties: { v: { type: 'integer' }, kids: { type: 'array', items: { $ref: '#/$defs/node' } } }, additionalProperties: false } } }, [{ v: 1, kids: [{ v: 2, kids: [{ v: 3 }] }] }, { v: 1, kids: [{ v: 2, kids: [{ v: 'x' }] }] }]), yn({ $schema: D[2020], $defs: { a: { $anchor: 'pos', type: 'integer', minimum: 1 } }, properties: { n: { $ref: '#pos' } } }, [{ n: 1 }, { n: 0 }]), yn({ $schema: D[2020], $id: 'https://example.com/tree', $dynamicAnchor: 'node', type: 'object', properties: { children: { type: 'array', items: { $dynamicRef: '#node' } } } }, [{ children: [{}] }, { children: [1] }]), yn({ $schema: D[7], definitions: { 'a/b': { type: 'integer' }, 'c~d': { type: 'string' } }, properties: { x: { $ref: '#/definitions/a~1b' }, y: { $ref: '#/definitions/c~0d' } } }, [{ x: 1, y: 's' }, { x: '1' }, { y: 1 }])],
    ['Yn', 'Yn', 'Yn', 'Ynn'], 'references: a recursive tree, $anchor, $dynamicRef, ~1 and ~0 in a pointer');

  // ---- numbers are compared exactly (not as 64-bit floats)
  t.eq([yn({ multipleOf: 0.01 }, [19.99, 0.07, 1.001, 4.35, 0.1]), yn({ multipleOf: 0.1 }, [0.3, 0.7, 0.25]), sc.call('verdicts', { schema: '{"multipleOf":3}', datas: ['9', '10', '9.0', '1e300', '3e300'] }).valid], ['YYnYY', 'YYn', [true, false, true, false, true]], 'multipleOf with decimals (19.99 is 1999 × 0.01) and with huge numbers (1e300 is not a multiple of 3)');
  t.eq([sc.call('verdicts', { schema: '{"type":"integer","maximum":9007199254740993}', datas: ['9007199254740993', '9007199254740994', '9007199254740992'] }).valid, sc.call('verdicts', { schema: '{"const":12345678901234567890123}', datas: ['12345678901234567890123', '12345678901234567890124'] }).valid, sc.call('verdicts', { schema: '{"maximum":1e400}', datas: ['1e399', '1e401'] }).valid, sc.call('verdicts', { schema: '{"uniqueItems":true}', datas: ['[1, 1.0]', '[12345678901234567890123, 12345678901234567890124]', '[1, true]', '[{"a":1,"b":2},{"b":2,"a":1}]'] }).valid],
    [[true, false, true], [true, false], [true, false], [false, true, true, false]], 'integers beyond 2^53 and numbers beyond 1e308 are told apart; 1 and 1.0 are the same number, 1 and true are not');
  t.eq([yn({ const: 1 }, [1, true]), yn({ const: 0 }, [0, false, null, '']), yn({ enum: [1, '1', null] }, [1, '1', null, 'x', 0]), yn({ type: 'number' }, [1, 1.5, '1']), yn({ type: ['string', 'null'] }, ['a', null, 1]), yn({ minLength: 2, maxLength: 2 }, ['😀😀', '😀', 'abc'])], ['Yn', 'Ynnn', 'YYYnn', 'YYn', 'YYn', 'Ynn'], 'const / enum compare by JSON value; "number" accepts integers; string length counts characters (an emoji is one)');

  // ---- formats, checked by hand against the RFCs (Y valid, n not valid)
  const FM = [
    ['email', ['a@b.co', 'asha.rao+tag@example.in', 'a@b', '"quoted"@x.y', 'a@[127.0.0.1]', 'a.b.co', '@b.co', 'a@', 'a b@c.d', 'a@@b.c', 'a@b..c', '.a@b.c', 'a.@b.c', 'ü@b.co', 'a@-b.co'], 'YYYYYnnnnnnnnnn'],
    ['idn-email', ['a@b.co', 'ü@b.co', 'आ@उदाहरण.भारत', 'nope', 'a b@c.d'], 'YYYnn'],
    ['date', ['2026-02-28', '2024-02-29', '0000-01-01', '9999-12-31', '2026-02-29', '2026-02-30', '2026-13-01', '2026-00-10', '2026-1-5', '2026-11-17T10:00:00Z', '20261117', '2026-11-31'], 'YYYYnnnnnnnn'],
    ['date-time', ['2026-11-17T10:30:00Z', '2026-11-17t10:30:00z', '2026-11-17T10:30:00+05:30', '2026-11-17T10:30:00.123456789-08:00', '2026-11-17T23:59:60Z', '2026-11-17 10:30:00Z', '2026-11-17T10:30:00', '2026-11-17T24:00:00Z', '2026-11-17T10:30Z', '2026-02-30T10:30:00Z', '2026-11-17T10:30:00+24:00', '2026-11-17'], 'YYYYYnnnnnnn'],
    ['time', ['10:30:00Z', '10:30:00+05:30', '10:30:00.5Z', '23:59:60Z', '10:30:00', '25:00:00Z', '10:30Z', '10:60:00Z'], 'YYYYnnnn'],
    ['duration', ['P1D', 'PT1H30M', 'P1Y2M3DT4H5M6S', 'P1W', 'PT0S', 'P', 'PT', '3 days', 'P1DT', '1D', 'P1.5D'], 'YYYYYnnnnnn'],
    ['uri', ['https://x.y/z', 'http://x', 'mailto:a@b.co', 'urn:isbn:0451450523', 'file:///etc/hosts', 'http://[::1]:80/', 'HTTP://X.Y', 'not a uri', '//x.y', '/path', 'http://x y', 'http://%zz', 'https://x.y/é', 'x'], 'YYYYYYYnnnnnnn'],
    ['uri-reference', ['https://x.y/z', '/path', '../a', '#frag', '?q=1', '', 'a b', '\\\\bad', 'xé'], 'YYYYYYnnn'],
    ['iri', ['https://x.y/é', 'http://उदाहरण.भारत/', 'not an iri', '/rel'], 'YYnn'],
    ['uri-template', ['/x/{id}', 'http://x.y/{?q,lang}', '/plain', '/x/{id'], 'YYYn'],
    ['uuid', ['123e4567-e89b-12d3-a456-426614174000', '123E4567-E89B-12D3-A456-426614174000', '00000000-0000-0000-0000-000000000000', '123e4567', '123e4567e89b12d3a456426614174000', 'g23e4567-e89b-12d3-a456-426614174000', '{123e4567-e89b-12d3-a456-426614174000}'], 'YYYnnnn'],
    ['ipv4', ['192.168.1.1', '0.0.0.0', '255.255.255.255', '256.1.1.1', '1.2.3', '1.2.3.4.5', '01.2.3.4', '1.2.3.4 ', '0x7f.0.0.1'], 'YYYnnnnnn'],
    ['ipv6', ['::1', '2001:db8::8a2e:370:7334', '::ffff:192.168.1.1', '::', '12345::', '1::2::3', 'fe80::1%eth0', '2001:db8:0:0:0:0:0:0:1'], 'YYYYnnnn'],
    ['hostname', ['example.com', 'a-b.example.in', 'localhost', 'xn--p1ai', '-bad-.com', 'a_b.com', 'a..b', 'x'.repeat(64) + '.com', ''], 'YYYYnnnnn'],
    ['idn-hostname', ['उदाहरण.भारत', 'example.com', '-x-.com', 'a b.com'], 'YYnn'],
    ['regex', ['^a+$', '(?<n>x)\\k<n>', '\\p{L}+', '(?=x)', '((', '[a-', '*a', 'a{2,1}'], 'YYYYnnnn'],
    ['json-pointer', ['', '/a/b', '/a~0b/c~1d', 'a/b', '/a~2', '/~'], 'YYYnnn'],
    ['relative-json-pointer', ['0', '1/a', '2#', '/a', '-1', '01'], 'YYYnnn'],
  ];
  for (const [f, datas, want] of FM) t.eq(yn({ $schema: D[2020], format: f }, datas), want, `format "${f}": ${datas.map((d, i) => `${JSON.stringify(d).slice(0, 30)} ${want[i] === 'Y' ? 'ok' : 'refused'}`).join(', ').slice(0, 300)}`);
  t.eq([yn({ format: 'email' }, [1, null, [], {}, true]), yn({ $schema: D[7], format: 'uuid' }, ['nope']), yn({ $schema: D[7], format: 'duration' }, ['3 days']), yn({ $schema: D[4], format: 'json-pointer' }, ['a/b']), yn({ format: 'phone-number' }, ['x'])], ['YYYYY', 'Y', 'Y', 'Y', 'Y'], 'a format says nothing about values that are not strings; formats a draft does not have, and unknown ones, are not checked');
  t.eq([val('nope', { $schema: D[7], format: 'uuid' }).notes, val('x', { properties: { a: { format: 'phone' }, b: { format: 'email' } }, examples: [{ format: 'in-data' }] }).notes, val('x', { format: 'email' }).notes],
    [['Not checked: format "uuid" (part of JSON Schema from Draft 2019-09 on).'], ['Not checked: format "phone" (not a format this validator knows).'], []], 'formats that are not checked are named in a note (not those inside examples / enum / const / default)');

  // ---- patterns are ECMA 262 regular expressions (the browser's rules), not Python's or PCRE's
  for (const [p, datas, want, what] of [
    ['^\\d+$', ['123', '१२३', '12a'], 'Ynn', '\\d is 0-9 only'], ['^\\p{L}+$', ['héllo', 'क', 'hello1'], 'YYn', '\\p{L} letters'], ['^\\w+$', ['abc_1', 'é'], 'Yn', '\\w is ASCII'],
    ['^a$', ['a', 'a\n', '\na'], 'Ynn', '$ is the very end (no trailing line break)'], ['^(?=.*\\d)(?=.*[a-z]).{6,}$', ['abc123', 'abcdef', '12345'], 'Ynn', 'lookahead'], ['^(a)\\1$', ['aa', 'ab'], 'Yn', 'back-reference'],
    ['a', ['xax', 'b'], 'Yn', 'not anchored: found anywhere'], ['^.$', ['😀', 'ab'], 'Yn', '. is one character, an emoji too'], ['^[\\u0900-\\u097F]+$', ['नमस्ते', 'namaste'], 'Yn', '\\u escapes'],
    ['^\\s*$', ['  \t  ', 'x'], 'Yn', '\\s includes Unicode spaces'], ['^(?<y>\\d{4})-(?<m>\\d{2})$', ['2026-11', '2026-1'], 'Yn', 'named groups'], ['\\bword\\b', ['a word here', 'swordfish'], 'Yn', '\\b'],
  ]) t.eq(yn({ pattern: p }, datas), want, `pattern ${JSON.stringify(p)}: ${what}`);
  t.ok(/^The schema itself is not valid at \/pattern: "\(\(" does not have the format "regex"$/.test(serr(() => val('x', { pattern: '((' }))), `a broken pattern is reported as a problem of the schema (${serr(() => val('x', { pattern: '((' }))})`);

  // ---- messages about the two boxes and the schema
  t.eq([serr(() => vraw('', '1')), serr(() => vraw('{}', '  \n')), serr(() => vraw('{"type": "string",}', '1')), serr(() => vraw('{}', '{"a": 1,\n "b": }')), serr(() => vraw('{}', 'hello'))],
    ['Schema: nothing here yet — paste a JSON Schema, or make one from the data', 'Data: nothing here yet — paste the JSON to check', 'Schema: Trailing comma before } — remove the last comma @1:19', 'Data: A value is missing after the colon @2:7', 'Data: “hello” is not a JSON value — text must be in double quotes @1:1'],
    'empty boxes and JSON mistakes: which box, what, line and column (the wording of the JSON Formatter tab)');
  t.eq([serr(() => vraw('[1]', '1')), serr(() => vraw('"x"', '1')), serr(() => vraw('5', '1')), serr(() => vraw('null', '1'))], ['a list', 'a text', 'a number', 'null'].map((k) => `Schema: a JSON Schema is an object (or just true / false) — this is ${k}`), 'a schema that is not an object');
  t.eq([serr(() => val(1, { type: 'strng' })), serr(() => val(1, { minimum: '5' })), serr(() => val(1, { properties: { a: { required: 'a' } } })), serr(() => val(1, { $schema: D[2020], items: [{ type: 'string' }] }))],
    ['The schema itself is not valid at /type: "strng" is not valid under any of the schemas listed in the \'anyOf\' keyword', 'The schema itself is not valid at /minimum: "5" is not of type "number"', 'The schema itself is not valid at /properties/a/required: "a" is not of type "array"', 'The schema itself is not valid at /items: [{"type":"string"}] is not of types "boolean", "object"'],
    'a schema that breaks the rules of its draft: the place in the schema is named');
  t.ok(/^The "\$schema" of this schema is "http:\/\/json-schema\.org\/draft-03\/schema#" — this tab knows Draft 4, 6, 7, 2019-09 and 2020-12/.test(serr(() => val(1, { $schema: 'http://json-schema.org/draft-03/schema#' }))) && /is "https:\/\/example\.com\/my-meta"/.test(serr(() => val(1, { $schema: 'https://example.com/my-meta' }))), `an unknown "$schema" (was: "Unknown meta-schema … Custom meta-schemas must be registered in the registry") — ${serr(() => val(1, { $schema: 'https://example.com/my-meta' })).slice(0, 90)}`);
  for (const ref of ['https://example.com/schemas/address.json', 'file:///etc/passwd', 'other.json#/x']) t.ok(serr(() => val({}, { properties: { a: { $ref: ref } } })).startsWith(`A "$ref" points to another file or web address (${ref.split('#')[0]}`) && /This tab fetches nothing: put that schema under "\$defs"/.test(serr(() => val({}, { properties: { a: { $ref: ref } } }))), `$ref to ${ref}: nothing is fetched, and the message says what to do (was: "is not present in a registry and retrieving it failed: \`resolve-http\` feature …")`);
  t.eq(serr(() => val({}, { $ref: '#/definitions/missing' })), 'A "$ref" points to "#/definitions/missing", which does not exist in this schema.', 'a $ref that points to nothing');
  t.eq(yn({ $ref: '#/$defs/a', $defs: { a: { $ref: '#/$defs/b' }, b: { $ref: '#/$defs/a' } } }, [1]), 'Y', 'two $refs that point at each other do not hang the tab');
  t.ok(/nested deeper than 128 levels/.test(serr(() => vraw('{"properties":{"a":'.repeat(150) + '{}' + '}}'.repeat(150), '1'))) && val(1, {}).valid, 'a schema nested 300 deep is refused with a plain message, and the engine goes on working');
  let nt = vraw('{"type":"object","type":"array"}', '{"a":1,"a":2}');
  t.ok(nt.valid === false && nt.notes.length === 2 && /^Schema: the key "type" is there twice \(line 1\) — the last one counts\.$/.test(nt.notes[0]) && /^Data: the key "a" is there twice/.test(nt.notes[1]), `a key written twice in the schema or the data is pointed out (${nt.notes.join(' | ')})`);
  t.eq([serr(() => vraw('{}', '"\\ud800"')), vraw('{"maxLength":1}', '"\\ud83d\\ude00"').valid, vraw('﻿{"type":"integer"}', '﻿5').valid], ['Data: a lone surrogate escape (half of an emoji, such as \\ud83d without its second half) is not a character @1:8', true, true], 'a lone surrogate escape is explained; a byte-order mark in front is skipped');

  // ---- a schema made from an example
  const infer = (data) => sc.call('infer', { data: typeof data === 'string' ? data : JSON.stringify(data) }).schema;
  const inf = infer({ id: 1, name: 'Asha', email: 'asha@example.in', price: 12.5, when: '2026-11-16T10:00:00Z', day: '2026-11-16', site: 'https://example.in/a', key: '123e4567-e89b-12d3-a456-426614174000', items: [{ sku: 'A', qty: 1 }, { sku: 'B' }], tags: [], none: null, ok: true });
  t.eq(inf, { $schema: D[2020], type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, email: { type: 'string', format: 'email' }, price: { type: 'number' }, when: { type: 'string', format: 'date-time' }, day: { type: 'string', format: 'date' }, site: { type: 'string', format: 'uri' }, key: { type: 'string', format: 'uuid' }, items: { type: 'array', items: { type: 'object', properties: { sku: { type: 'string' }, qty: { type: 'integer' } }, required: ['sku'], additionalProperties: false } }, tags: { type: 'array' }, none: { type: 'null' }, ok: { type: 'boolean' } }, required: ['id', 'name', 'email', 'price', 'when', 'day', 'site', 'key', 'items', 'tags', 'none', 'ok'], additionalProperties: false },
    'inferred schema: types, formats, required = the keys every example has, the items of a list merged');
  t.eq([infer('[1, 2.5, "a", null]').items.type, infer('[1, 2]').items.type, infer('{"a": 1.0}').properties.a.type, infer('12345678901234567890123').type, infer('"x"'), infer('[]')], [['number', 'string', 'null'], 'integer', 'number', 'integer', { $schema: D[2020], type: 'string' }, { $schema: D[2020], type: 'array' }], 'mixed lists give a list of types; 1.0 is a number, a 23-digit integer an integer; plain values and empty lists work');
  // a format goes in only when the validator itself accepts the example: the made schema always accepts its example
  const tricky = { badDate: '2026-13-45', zero: '0000-00-00', feb: '2026-02-30', dt: '2026-11-17T25:61:00Z', dtNoZone: '2026-11-17T10:30:00', notEmail: '@foo.bar', dots: 'a@b..c', spaceMail: 'first last@x.y', uni: 'ü@b.co', uri1: 'http://[bad', uri2: 'https://x.y/é', uuidish: 'GGGGGGGG-e89b-12d3-a456-426614174000', dates: ['2026-01-01', '2026-13-01'], mails: ['a@b.co', 'nope'], good: ['2026-01-01', '2026-12-31'] };
  const ti = infer(tricky);
  t.ok(Object.entries(ti.properties).every(([k, v]) => k === 'good' ? v.items.format === 'date' : !v.format && !v.items?.format) && val(tricky, ti).valid, 'look-alikes get no format (2026-13-45, @foo.bar, http://[bad, a list with one bad date) — was: a schema that refused the very example it was made from');
  for (const sneaky of ['2026-11-17T10:30 – meeting', 'abcd-efghiTabcdefgéxx', '2026-11-17T10:30:0é and more', '1234-67890T23456789😀x', 'é'.repeat(18), 'x@é', 'éééé-éé-é']) { const sch = err(() => infer({ note: sneaky })); t.ok(!(sch instanceof Error) && val({ note: sneaky }, infer({ note: sneaky })).valid, `text with non-ASCII letters where a date-time has its zone (${JSON.stringify(sneaky).slice(0, 40)}) no longer crashes the engine`); }
  const r2 = rng(99); let okDocs = 0;
  for (let i = 0; i < 300; i++) { const d = makeDoc(r2); let good = false; try { good = vraw(JSON.stringify(sc.call('infer', { data: d.json }).schema), d.json).valid; } catch { /* counted as a failure */ } if (good) okDocs++; else t.ok(false, `the schema made from ${d.json.slice(0, 120)} does not accept it`); }
  t.eq(okDocs, 300, '300 random documents: each one is valid against the schema made from it');
  t.eq([serr(() => infer('')), serr(() => infer('{"a":')), sc.call('infer', { data: '{"a":1,"a":"x"}' }).notes.length], ['Data: nothing here yet — paste the JSON to check', 'Data: The text ends where a value should be @1:6', 1], 'making a schema from nothing or from broken JSON says so; a key written twice is noted');

  // ---- an independent validator as the reference: python-jsonschema's verdicts (scripts/make-jsonschema-reference.py)
  const JREF = JSON.parse(readFileSync(join(root, 'tests/fixtures/formats/jsonschema.json'), 'utf8'));
  let pairs = 0;
  for (const c of JREF) {
    if (c.invalid) { t.ok(/^The schema itself is not valid/.test(serr(() => vraw(JSON.stringify(c.schema), '1'))), `${c.name}: a schema python-jsonschema refuses is refused here too`); continue; }
    const got = sc.call('verdicts', { schema: JSON.stringify(c.schema), datas: c.cases.map(([d]) => d) }).valid;
    pairs += c.cases.length;
    c.cases.forEach(([d, want], i) => t.ok(got[i] === want, `${c.name}: ${d.slice(0, 80)} is ${want ? 'valid' : 'not valid'} for python-jsonschema, ${got[i] ? 'valid' : 'not valid'} here — schema ${JSON.stringify(c.schema).slice(0, 200)}`));
  }
  t.ok(JREF.length > 700 && pairs > 5000, `reference: ${JREF.length} schemas, ${pairs} schema / data pairs across Draft 4, 6, 7, 2019-09 and 2020-12`);
};
