// Corpus for the YAML ⇄ JSON ⇄ TOML tests (tests/unit/formats.test.mjs): awkward strings, number spellings and a
// seeded generator of nested documents — and the "typed" form in which results are compared, so that 1, 1.0 and "1"
// are three different things (the same form tests/lib/formats_check.py prints for the Python parsers).

/** Strings that some YAML parser reads as something else when they are not quoted, or that need care in any format. */
export const STRINGS = [
  '', ' ', '  x', 'x  ', '\t', 'a\tb', 'no', 'No', 'NO', 'yes', 'Yes', 'YES', 'on', 'On', 'ON', 'off', 'Off', 'OFF', 'y', 'Y', 'n', 'N',
  'true', 'True', 'TRUE', 'false', 'False', 'FALSE', 'null', 'Null', 'NULL', '~', 'nil', 'none', 'None', 'NaN', 'nan', '.nan', '.NaN', '.NAN',
  '.inf', '-.inf', '+.inf', '.Inf', '.INF', 'inf', 'Infinity', '0', '1', '-1', '+1', '01', '010', '0o7', '0o17', '0O17', '0x10', '0X10', '0b101', '0B1',
  '1_000', '1__0', '_1', '1_', '1e3', '1E3', '1e+3', '1.e3', '.5', '5.', '-.5', '+.5', '1.5', '1.5.5', '1.2.3', 'v1.2.3', '10.0.0.1', '127.0.0.1:8080',
  '1:30', '1:30:00', '-1:30', '12:30:45.5', '190:20:30', '0:0', '22:22', '8080:80', '::1', 'a:b', 'a: b', 'a :b', 'a:', 'a: ', ':', '::', ': x', 'x :',
  '- x', '-x', '-', '--', '---', '--- x', '...', '... x', '?', '? x', '?x', '!', '!x', '!!str x', '&', '&x', '*', '*x', '#', '#x', 'x #y', 'x#y', '@x', '`x', '%x',
  '|', '|x', '>', '> x', '[', '[x]', ']', '{', '{x}', '}', ',', 'a,b', "'", "'x'", "it's", '"', '"x"', 'x"y', '\\', 'a\\b', '\\n',
  '\n', '\n\n', 'x\n', '\nx', 'x\ny', 'x\n\ny', 'x\ny\n', 'x\ny\n\n', '  x\ny', 'x \ny', 'x\n y', 'x\r\ny', 'x\ry', '\r', 'a\u0000b', '\u0007', '\u001b[0m', '\u007f',
  '\u0085', '\u00a0', '\u2028', '\u2029', '\ufeff', '\ufeffx', '\u00e9', '\u65e5\u672c\u8a9e', '\ud83d\ude00', '\u0928\u092e\u0938\u094d\u0924\u0947', '=', '<<', '<', '==',
  '2026-01-01', '2026-1-1', '2026-01-01T10:00:00Z', '2026-01-01 10:00:00', '2026-01-01t10:00:00+05:30', '2026-13-45', '10:30', '1e', 'e1', '0x', '0xg',
  '1,000', '1 000', '$5', '5%', '5 apples', '1st', '#1', '1#', 'true ', '  true', 'true\n', 'Yes sir', 'on-call', 'offline', 'nope', 'yess', 'n/a', 'N/A',
  'key: value', 'key:value', '- item', '* item', 'http://x.y/z#frag', 'C:\\dir', '/path', '~/home', '~user', 'a|b', 'a>b', '<a>', '{{ x }}', '{{x}}', '${VAR}', '%s', '100%',
  'a@b.c', "'a' and 'b'", '"a" and "b"', "a 'b' c", 'trailing space ', 'trailing tab\t', ' leading', '\tleading tab', 'long ' + 'word '.repeat(60),
  'multi\nline\ntext', 'line1\n\nline3\n', 'ends with colon:', 'has: colon space', 'has :colon', 'has #hash', 'has # hash', 'has  #hash', '[brackets]', '{braces}', 'a, b',
  '!important', '*.txt', '&ref', '|pipe', '>gt', '%percent', '`tick`', '0.1', '-0', '+0', '0.0', '00', '0_0', '1e1000', '0b', '0o', '0o8', '0x_', '1.', '.', '..', '.1', '._',
  '1.0e+21', 'infinity', '+inf', '-inf', 'Null ', 'TRUE!', 'Yes/No', '<<: x', '= x', '? ', ': ', '- ', '# ', '--- ', '... ', 'a\u200bb', 'a\u00adb', 'x'.repeat(2000),
  '#!/bin/sh\nset -e\necho "hi"\n', 'SELECT *\n  FROM t\n WHERE a = \'x\';', "'''", "a'''b", "ends with '", '"""', 'a\tb\nc\td\n', '\ttab first\nline', 'x\n\n\n', 'trail \nspace',
];

/** JSON number spellings: [literal, kind]. kind i = integer (compared digit for digit), f = float (compared as a 64-bit float). */
export const NUMBERS = [
  ['0', 'i'], ['-0', 'i'], ['1', 'i'], ['-1', 'i'], ['42', 'i'], ['9007199254740991', 'i'], ['9007199254740993', 'i'], ['-9007199254740993', 'i'],
  ['9223372036854775807', 'i'], ['-9223372036854775808', 'i'], ['9223372036854775808', 'I'], ['18446744073709551615', 'I'], ['12345678901234567890', 'I'],
  ['123456789012345678901234567890', 'I'], ['-9223372036854775809', 'I'],
  ['0.0', 'f'], ['-0.0', 'f'], ['1.0', 'f'], ['1.10', 'f'], ['0.1', 'f'], ['1.5', 'f'], ['-2.5', 'f'], ['100.0', 'f'], ['3.14159265358979323846', 'f'], ['123456789.123456789', 'f'],
  ['1e3', 'f'], ['1E3', 'f'], ['1e+3', 'f'], ['1e-3', 'f'], ['1.5e3', 'f'], ['1.5E-3', 'f'], ['1e21', 'f'], ['1e-7', 'f'], ['1.5e300', 'f'], ['5e-324', 'f'], ['1.7976931348623157e308', 'f'],
  ['0e0', 'f'], ['-1e2', 'f'], ['2.5e+10', 'f'], ['0.000001', 'f'], ['1000000000000000000000.0', 'f'],
];

/** Seeded random numbers. */
export function rng(seed = 1) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }

// ---- the typed form
const big = (t) => { const n = BigInt(t); return n >= -(2n ** 53n) && n <= 2n ** 53n ? Number(n) : { $int: n.toString() }; };
const flt = (x) => Number.isNaN(x) ? { $float: 'nan' } : x === Infinity ? { $float: 'inf' } : x === -Infinity ? { $float: '-inf' } : { $f: x };
/** Typed form of a number literal as an exact reader sees it. */
export const typedNum = (lit, kind) => kind === 'f' ? flt(Number(lit)) : big(lit);
/**
 * Deep equality of two typed values (floats by value, -0 and 0 apart; NaN equals NaN). `anyOrder`: the entries of a
 * mapping may come in another order (TOML writes the plain values of a table before its sub-tables).
 */
export function same(a, b, anyOrder = false) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => same(x, b[i], anyOrder));
  if ('$f' in a || '$f' in b) return '$f' in a && '$f' in b && Object.is(a.$f, b.$f);
  if (anyOrder && '$map' in a && '$map' in b) return a.$map.length === b.$map.length && a.$map.every(([k, v]) => { const o = b.$map.find(([k2]) => same(k, k2)); return !!o && same(v, o[1], true); });
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => k in b && same(a[k], b[k], anyOrder));
}

/**
 * A random document: { json (text with exact number spellings), typed (what a reader must give back), toml (can TOML hold
 * it: no null, integers within 64 bits) }. Keys and string values are drawn from STRINGS and from plain words.
 */
export function makeDoc(r, { toml = false } = {}) {
  const words = ['name', 'id', 'tags', 'items', 'port', 'host', 'enabled', 'spec', 'meta', 'env', 'x', 'y', 'n', 'on', 'no', 'value', 'list', 'a b', 'a.b', 'k-1', 'k_2', '1', '007', 'true', 'null', '', '\u0915\u0941\u0902\u091c\u0940'];
  const pick = (a) => a[Math.floor(r() * a.length)];
  const nums = toml ? NUMBERS.filter(([, k]) => k !== 'I') : NUMBERS;
  const str = () => r() < 0.6 ? pick(STRINGS) : pick(['Pune', 'chai', 'hello world', 'v2', 'dev', 'https://example.com/a?b=c', 'line one\nline two\n', 'x: y', '\u0928\u092e\u0938\u094d\u0924\u0947']);
  const value = (depth) => {
    const k = r();
    if (depth > 3 || k < 0.42) {
      const s = r();
      if (s < 0.5) { const t = str(); return { json: JSON.stringify(t), typed: t }; }
      if (s < 0.8) { const [lit, kind] = pick(nums); return { json: lit, typed: typedNum(lit, kind) }; }
      if (s < 0.9 || toml) { const b = r() < 0.5; return { json: String(b), typed: b }; }
      return { json: 'null', typed: null };
    }
    if (k < 0.7) {
      const n = Math.floor(r() * 5), keys = new Set(), parts = [], typed = [];
      for (let i = 0; i < n; i++) { const key = r() < 0.35 ? pick(STRINGS) : pick(words); if (keys.has(key)) continue; keys.add(key); const v = value(depth + 1); parts.push(`${JSON.stringify(key)}:${v.json}`); typed.push([key, v.typed]); }
      return { json: `{${parts.join(',')}}`, typed: { $map: typed } };
    }
    const n = Math.floor(r() * 5), items = Array.from({ length: n }, () => value(depth + 1));
    return { json: `[${items.map((i) => i.json).join(',')}]`, typed: items.map((i) => i.typed) };
  };
  if (!toml) return value(0);
  // TOML: a table at the top
  const n = 1 + Math.floor(r() * 6), keys = new Set(), parts = [], typed = [];
  for (let i = 0; i < n; i++) { const key = r() < 0.3 ? pick(STRINGS) : pick(words); if (keys.has(key)) continue; keys.add(key); const v = value(1); parts.push(`${JSON.stringify(key)}:${v.json}`); typed.push([key, v.typed]); }
  return { json: `{${parts.join(',')}}`, typed: { $map: typed } };
}

/** Typed form of what JSON.parse gives for JSON that our tab wrote from YAML / TOML (numbers: integers and floats by their spelling). */
export function typedFromJson(text) {
  // numbers are read from the text itself, so 1 and 1.0 stay apart and big integers keep their digits
  let i = 0;
  const ws = () => { while (/\s/.test(text[i] || '')) i++; };
  const val = () => {
    ws(); const c = text[i];
    if (c === '{') { i++; const m = []; ws(); if (text[i] === '}') { i++; return { $map: m }; } for (;;) { ws(); const k = val(); ws(); i++; const v = val(); m.push([k, v]); ws(); if (text[i++] === '}') return { $map: m }; } }
    if (c === '[') { i++; const a = []; ws(); if (text[i] === ']') { i++; return a; } for (;;) { a.push(val()); ws(); if (text[i++] === ']') return a; } }
    if (c === '"') { let j = i + 1; while (text[j] !== '"') j += text[j] === '\\' ? 2 : 1; const s = JSON.parse(text.slice(i, j + 1)); i = j + 1; return s; }
    const m = /^(true|false|null|-?\d+(\.\d+)?([eE][+-]?\d+)?)/.exec(text.slice(i)); i += m[0].length;
    return m[0] === 'true' ? true : m[0] === 'false' ? false : m[0] === 'null' ? null : /[.eE]/.test(m[0]) ? flt(Number(m[0])) : big(m[0]);
  };
  return val();
}
