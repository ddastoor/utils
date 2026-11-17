// Software › bits, reference and web-design tabs, the parts that are plain TypeScript (src/tools/software/bits.ts,
// ref.ts, web.ts): integer parsing and the bit formats, exact decimal expansion of doubles, correctly rounded float32
// (against exact rational arithmetic, scripts/make-ieee-reference.py), neighbours of a float, pasted hex / Base64,
// the reference tables (IANA status codes, unique rows, sorted), ASCII rows, CSS builders, SVG file decoding.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
export default async (t, { load }) => {
  const B = await load('/src/tools/software/bits.ts'), R = await load('/src/tools/software/ref.ts'), W = await load('/src/tools/software/web.ts');
  const err = (f) => { try { f(); return null; } catch (e) { return e.message; } };

  // ---- Bitwise calculator: numbers as typed
  t.eq(['0', '42', '-42', '+5', '0xFF', '0Xff', '0b1010', '0o17', '1_000', '0xFFFF_0000', '0b1100 1010', ' 7 ', '-0x80', '18446744073709551616'].map((s) => String(B.parseInt2(s))),
    ['0', '42', '-42', '5', '255', '255', '10', '15', '1000', '4294901760', '202', '7', '-128', '18446744073709551616'], 'decimal, hex, binary, octal; sign, underscores and spaces');
  t.eq(['', ' ', 'abc', '0x', '0b12', '0o8', '1.5', '1e3', '--1', '0xG', '12abc', '-'].map((s) => B.parseInt2(s)), Array(12).fill(null), 'what is not a whole number is refused');
  t.eq(B.formats(202n, 8), { unsigned: '202', signed: '-54', hex: '0xCA', oct: '0o312', bin: '0b1100_1010' }, 'formats of 202 in 8 bits');
  t.eq(B.formats(-1n, 32), { unsigned: '4294967295', signed: '-1', hex: '0xFFFF_FFFF', oct: '0o37777777777', bin: '0b1111_1111_1111_1111_1111_1111_1111_1111' }, '-1 in 32 bits');
  t.eq(B.formats(1n << 63n, 64).signed, '-9223372036854775808', 'the most negative 64-bit value');
  for (const w of [8, 16, 32, 64]) { // every printed form reads back as the same value
    let bad = 0; for (let i = 0; i < 300; i++) { const v = BigInt.asUintN(w, BigInt(Math.floor(Math.random() * 2 ** 32)) * 4294967311n + BigInt(i)), f = B.formats(v, w); for (const k of ['unsigned', 'hex', 'oct', 'bin']) if (B.parseInt2(f[k]) !== v) bad++; if (BigInt.asUintN(w, B.parseInt2(f.signed)) !== v) bad++; }
    t.eq(bad, 0, `${w}-bit: unsigned, signed, hex, octal and binary output can be pasted back in (300 values)`);
  }

  // ---- IEEE-754: exact decimal value of a double
  t.eq([0.1, 0.5, 1, -2.5, 1e21, 0, -0, 123456789.125, 2 ** -20].map(B.exactDecimal), ['0.1000000000000000055511151231257827021181583404541015625', '0.5', '1', '-2.5', '1000000000000000000000', '0', '-0', '123456789.125', '0.00000095367431640625'], 'exact decimal expansion of doubles');
  t.ok(B.exactDecimal(5e-324).length === 1076 && /^0\.0{323}4940656458412465/.test(B.exactDecimal(5e-324)) && B.exactDecimal(5e-324).endsWith('5') && B.exactDecimal(1.7976931348623157e308).length === 309 && B.exactDecimal(1.7976931348623157e308) === String(2n ** 1024n - 2n ** 971n), 'the smallest double has 751 significant digits; the largest is 2^1024 − 2^971');
  t.eq([B.exactDecimal(NaN), B.exactDecimal(Infinity), B.exactDecimal(-Infinity)], ['NaN', 'Infinity', '-Infinity'], 'special values');
  t.eq([B.decDiff('0.1', B.exactDecimal(0.1)), B.decDiff('0.5', '0.5'), B.decDiff('1e2', '100'), B.decDiff('0.3', B.exactDecimal(0.3)), B.decDiff('abc', '1'), B.decDiff('1e-1000000', '0'), B.decDiff('-0.0', '-0')],
    ['0.0000000000000000055511151231257827021181583404541015625', '0', '0', '-0.000000000000000011102230246251565404236316680908203125', null, null, '0'], 'stored − typed, exactly; a million-digit exponent is not attempted (it froze the page)');
  // ---- against exact rational rounding (Python fractions)
  const ref = JSON.parse(readFileSync(new URL('../fixtures/ieee/reference.json', import.meta.url), 'utf8')).rows;
  const bits32 = (x) => { const dv = new DataView(new ArrayBuffer(4)); dv.setFloat32(0, x); return dv.getUint32(0).toString(16).toUpperCase().padStart(8, '0'); };
  const bad32 = ref.filter((r) => bits32(B.toFloat32(r.text)) !== r.f32);
  t.eq(bad32.slice(0, 4).map((r) => `${r.text} → ${bits32(B.toFloat32(r.text))} ≠ ${r.f32}`), [], `float32: ${ref.length} decimals round to the nearest float, ties to even (no double rounding)`);
  const naive = ref.filter((r) => bits32(Math.fround(Number(r.text))) !== r.f32).length;
  t.ok(naive >= 15, `the fixture has ${naive} decimals where rounding through a double first gives the wrong float32`);
  const bad64 = ref.filter((r) => B.inspect(Number(r.text), true).hex !== r.f64);
  t.eq(bad64.slice(0, 3).map((r) => r.text), [], `float64: ${ref.length} decimals give the reference bit pattern`);
  const badExact = ref.filter((r) => B.exactDecimal(Number(r.text)) !== r.exact64 || B.inspect(B.toFloat32(r.text), false).exact !== r.exact32);
  t.eq(badExact.slice(0, 3).map((r) => r.text), [], `exact decimal of the stored double and float for all ${ref.length}`);
  // ---- inspect: fields and neighbours
  const i1 = B.inspect(0.1, true);
  t.eq([i1.hex, i1.sign, i1.e, i1.exponent, i1.kind, i1.expBits, i1.mantBits, i1.next, i1.prev], ['3FB999999999999A', 0, 1019, -4, 'Normal', '01111111011', '1001100110011001100110011001100110011001100110011010', 0.10000000000000002, 0.09999999999999999], 'double 0.1: hex, exponent, mantissa, neighbours');
  const i2 = B.inspect(0.1, false);
  t.eq([i2.hex, i2.e, i2.exponent, i2.kind, i2.stored, i2.bin.length], ['3DCCCCCD', 123, -4, 'Normal', 0.10000000149011612, 32], 'float 0.1');
  t.eq([B.inspect(1e-310, true).kind, B.inspect(1e-310, true).exponent, B.inspect(0, true).kind, B.inspect(-0, true).hex, B.inspect(NaN, true).kind, B.inspect(Infinity, false).hex, B.inspect(-Infinity, false).hex, B.inspect(1e-45, false).kind],
    ['Subnormal', -1022, 'Zero', '8000000000000000', 'NaN', '7F800000', 'FF800000', 'Subnormal'], 'subnormal, zero, -0, NaN, infinities');
  t.eq([B.inspect(0, true).next, B.inspect(0, true).prev, B.inspect(-0, true).next, B.inspect(1.7976931348623157e308, true).next, B.inspect(-1.7976931348623157e308, true).prev, B.inspect(5e-324, true).prev, B.inspect(1, false).next, B.inspect(1, false).prev],
    [5e-324, -5e-324, 5e-324, Infinity, -Infinity, 0, 1.0000001192092896, 0.9999999403953552], 'next / previous float across zero and at the ends of the range');
  t.ok(Number.isNaN(B.inspect(Infinity, true).next) && B.inspect(Infinity, true).prev === 1.7976931348623157e308 && Number.isNaN(B.inspect(-Infinity, true).prev) && B.inspect(-Infinity, true).next === -1.7976931348623157e308 && Number.isNaN(B.inspect(NaN, true).next) && Number.isNaN(B.inspect(NaN, false).prev), 'nothing lies beyond ±Infinity or next to NaN');
  let stepBad = 0; for (let i = 0; i < 400; i++) { const x = (Math.random() - 0.5) * 10 ** (Math.random() * 600 - 300), r = B.inspect(x, true); if (!(r.prev < x && x < r.next) || B.inspect(r.next, true).prev !== x || B.inspect(r.prev, true).next !== x) stepBad++; }
  t.eq(stepBad, 0, 'next and previous are neighbours both ways (400 random doubles)');

  // ---- pasted bytes
  const hx = (s) => Buffer.from(B.parseBytes(s, 'hex')).toString('hex');
  t.eq(['08 96 01', '089601', '0x08, 0x96, 0x01', '{0x8, 0x96, 0x1}', '\\x08\\x96\\x01', '08:96:01', '8 96 1', '08-96-01', '[0x08; 0x96]', '"0896" "01"', '0X0896 01', '', '  \n'].map(hx),
    ['089601', '089601', '089601', '089601', '089601', '089601', '089601', '089601', '0896', '089601', '089601', '', ''], 'hex as people paste it (C arrays, \\x escapes, colons, single digits)');
  t.ok(/pairs of hex digits/.test(err(() => B.parseBytes('0a 0bc', 'hex'))) && /is not hex/.test(err(() => B.parseBytes('0a zz', 'hex'))) && /is not hex/.test(err(() => B.parseBytes('hello', 'hex'))), 'odd digits and non-hex are explained');
  const b64 = (s) => Buffer.from(B.parseBytes(s, 'base64')).toString('hex');
  t.eq(['kwECAw==', 'kwECAw', 'k w E C\nAw==', '-_8', '+/8=', 'data:application/octet-stream;base64,kwECAw==', ''].map(b64), ['93010203', '93010203', '93010203', 'fbff', 'fbff', '93010203', ''], 'Base64: padding optional, URL-safe, wrapped, data: URL');
  t.ok(/missing or extra/.test(err(() => B.parseBytes('A', 'base64'))) && /Not valid Base64/.test(err(() => B.parseBytes('a!b', 'base64'))) && /not Base64/.test(err(() => B.parseBytes('data:text/plain,hi', 'base64'))), 'Base64 errors');

  // ---- reference tables
  const codes = R.HTTP_CODES.map((r) => r[0]);
  t.ok(new Set(codes).size === codes.length && codes.every((c, i) => i === 0 || c > codes[i - 1]) && codes.every((c) => c >= 100 && c < 600), `HTTP: ${codes.length} codes, unique, ascending, 100–599`);
  const IANA = [100, 101, 102, 103, 200, 201, 202, 203, 204, 205, 206, 207, 208, 226, 300, 301, 302, 303, 304, 305, 307, 308, 400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 421, 422, 423, 424, 425, 426, 428, 429, 431, 451, 500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511];
  t.eq(IANA.filter((c) => !codes.includes(c)), [], 'every code of the IANA HTTP status registry is listed');
  t.ok(R.HTTP_CODES.every((r) => r[1] && r[2].length > 8 && r[3]) && R.HTTP_CODES.filter((r) => !IANA.includes(r[0]) && r[0] !== 418).every((r) => /^unofficial/.test(r[3])), 'each has a name, a meaning and a source; codes outside the registry are marked unofficial');
  t.eq([R.HTTP_CODES.find((r) => r[0] === 413)[1], R.HTTP_CODES.find((r) => r[0] === 422)[1], R.HTTP_CODES.find((r) => r[0] === 418)[1]], ['Content Too Large', 'Unprocessable Content', "I'm a teapot"], 'RFC 9110 names (413, 422)');
  const exts = R.MIME_TYPES.flatMap((r) => r[0].split(' ').filter(Boolean));
  t.eq(exts.filter((e, i) => exts.indexOf(e) !== i), [], `MIME: ${exts.length} extensions, none listed twice`);
  t.ok(R.MIME_TYPES.every((r) => /^[a-z]+\/[\w.+-]+$/.test(r[1]) && r[2]) && exts.every((e) => /^[a-z0-9]+$/.test(e)), 'every type is type/subtype with a description; extensions are lower case');
  const mime = (e) => R.MIME_TYPES.find((r) => r[0].split(' ').includes(e))?.[1];
  t.eq(['html', 'js', 'mjs', 'json', 'png', 'jpg', 'jpeg', 'svg', 'webp', 'avif', 'pdf', 'wasm', 'woff2', 'mp4', 'mp3', 'csv', 'xlsx', 'docx', 'zip', 'txt', 'ico', 'jsonl', 'vtt', 'heic'].map(mime),
    ['text/html', 'text/javascript', 'text/javascript', 'application/json', 'image/png', 'image/jpeg', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/avif', 'application/pdf', 'application/wasm', 'font/woff2', 'video/mp4', 'audio/mpeg', 'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'text/plain', 'image/vnd.microsoft.icon', 'application/x-ndjson', 'text/vtt', 'image/heic'], 'the types servers should send for common files');
  const ports = R.PORT_LIST;
  t.ok(ports.every((r) => /^\d+$/.test(r[0]) && +r[0] > 0 && +r[0] < 65536 && /^(TCP|UDP|TCP\/UDP)$/.test(r[1]) && r[2]) && ports.every((r, i) => i === 0 || +r[0] >= +ports[i - 1][0]) && new Set(ports.map((r) => r[0])).size === ports.length, `ports: ${ports.length} rows, valid numbers and protocols, ascending, one row per port`);
  const port = (n) => ports.find((r) => r[0] === String(n))?.[2];
  t.eq([22, 25, 53, 80, 123, 443, 3306, 5432, 6379, 27017, 3389, 51820, 9042, 8888].map(port), ['SSH', 'SMTP', 'DNS', 'HTTP', 'NTP', 'HTTPS', 'MySQL', 'PostgreSQL', 'Redis', 'MongoDB', 'RDP', 'WireGuard', 'Cassandra', 'Jupyter'], 'well-known ports');
  // ---- ASCII rows
  t.eq(R.asciiRow(65), ['65', '41', '101', '01000001', 'A', '&#65;', 'Upper-case letter'], 'row for A');
  t.eq([R.asciiRow(0), R.asciiRow(3), R.asciiRow(10), R.asciiRow(27), R.asciiRow(32), R.asciiRow(127)].map((r) => `${r[4]}|${r[5]}|${r[6]}`), ['NUL||Null (^@)', 'ETX||End of text (Ctrl+C, ^C)', 'LF||Line feed \\n (^J)', 'ESC||Escape \\e (^[)', 'Space|&#32;|Space', 'DEL||Delete (^?)'], 'control characters with their caret names');
  t.eq([34, 38, 39, 60, 62, 160, 169, 233].map((c) => R.asciiRow(c)[5]), ['&quot;', '&amp;', '&#39;', '&lt;', '&gt;', '&nbsp;', '&copy;', '&#233;'], 'HTML entities');
  let rowBad = 0; for (let c = 0; c < 256; c++) { const r = R.asciiRow(c); if (+r[0] !== c || parseInt(r[1], 16) !== c || parseInt(r[2], 8) !== c || parseInt(r[3], 2) !== c || r[3].length !== 8 || !r[4] || !r[6]) rowBad++; if (c >= 33 && c < 127 && r[4] !== String.fromCharCode(c)) rowBad++; }
  t.eq(rowBad, 0, 'all 256 rows: decimal, hex, octal and binary agree; printable characters shown as themselves');

  // ---- CSS builders
  const stops = [{ color: '#138808', pos: 100 }, { color: '#ff9933', pos: 0 }, { color: '#ffffff', pos: 50 }];
  t.eq([W.gradientCss('linear', 90, stops, false), W.gradientCss('radial', 90, stops, true, 'ellipse', 'top left'), W.gradientCss('conic', 45, stops, false, 'circle', 'center')], ['linear-gradient(90deg, #ff9933 0%, #ffffff 50%, #138808 100%)',
    'repeating-radial-gradient(ellipse at top left, #ff9933 0%, #ffffff 50%, #138808 100%)', 'conic-gradient(from 45deg at center, #ff9933 0%, #ffffff 50%, #138808 100%)'], 'gradient CSS: stops sorted by position; radial has no angle');
  t.eq(stops.map((x) => x.pos), [100, 0, 50], 'the stop list itself is not reordered');
  t.eq(W.shadowCss([{ x: 0, y: 4, blur: 12, spread: 0, color: '#000000', alpha: 0.15, inset: false }, { x: -2, y: 1, blur: 3, spread: -1, color: '#ff8800', alpha: 0.333, inset: true }]), '0px 4px 12px 0px rgba(0, 0, 0, 0.15), inset -2px 1px 3px -1px rgba(255, 136, 0, 0.33)', 'box-shadow CSS with two layers');
  t.eq([W.hexA([255, 0, 0, 1]), W.hexA([255, 0, 0, 0.5]), W.hexA([0, 0, 0, 0]), W.hexA([18, 52, 86])], ['#ff0000', '#ff000080', '#00000000', '#123456'], 'colours as #rrggbb, or #rrggbbaa when see-through');
  t.eq([W.over([0, 0, 0, 0.5], [255, 255, 255]), W.over([255, 0, 0, 1], [0, 0, 255]), W.over([255, 0, 0, 0], [0, 0, 255]), W.over([0, 0, 0, 128 / 255], [255, 255, 255])], [[128, 128, 128], [255, 0, 0], [0, 0, 255], [127, 127, 127]], 'a see-through colour over an opaque one');
  // ---- SVG files as editors save them
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>café ₹</text></svg>', u8 = (b) => new Uint8Array(b);
  t.eq(await W.svgText(u8(Buffer.from(svg))), svg, 'UTF-8 file');
  t.eq(await W.svgText(u8(gzipSync(Buffer.from(svg)))), svg, '.svgz (gzip) is unpacked');
  t.eq(await W.svgText(u8(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`<?xml version="1.0" encoding="UTF-16"?>${svg}`, 'utf16le')]))), `<?xml version="1.0" encoding="UTF-8"?>${svg}`, 'UTF-16 with a byte-order mark; the declaration then says UTF-8');
  t.eq(await W.svgText(u8(Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><svg xmlns="http://www.w3.org/2000/svg"><text>caf\xe9</text></svg>', 'latin1'))), '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg"><text>café</text></svg>', 'Latin-1 named in the XML declaration');
  t.eq(await W.svgText(u8(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(svg)]))), svg, 'UTF-8 byte-order mark dropped');
  const rej = async (p) => { try { await p; return null; } catch (e) { return e.message; } };
  t.eq([await rej(W.svgText(u8([]))), await rej(W.svgText(u8([0x1f, 0x8b, 8, 0, 0, 0, 0, 0]))), await rej(W.svgText(u8(gzipSync(Buffer.alloc(0)))))], ['This file is empty', 'This .svgz file is damaged (it does not unpack)', 'This file is empty'], 'empty file, damaged .svgz, .svgz of nothing');
};
