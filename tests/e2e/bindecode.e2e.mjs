// Protobuf / MessagePack / CBOR (#/bindecode, PC only): messages encoded here (protobuf wire format by hand, MessagePack
// by hand per the spec, CBOR RFC 8949 Appendix A) in hex, Base64 and as a file decode to the expected text; nested and
// repeated fields, negative ints, floats, maps; truncated input errors; 60 random messages decoded by cbor2, msgpack and
// google.protobuf (tests/fixtures/bin/reference.json) give the reference text; bytes as people paste them (C arrays,
// \x escapes, single digits, data: URLs); the values before a bad byte are still shown; zigzag readings on request;
// CBOR undefined / simple values / big numbers / indefinite lengths; MessagePack's unused byte 0xc1; 100 KB of junk
// and 60,000 nested messages (they used to overflow the stack and break the tab); a chosen file survives the input
// switch; copy; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const varint = (n) => { const o = []; let v = BigInt(n); do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; o.push(b); } while (v); return o; };
const key = (f, w) => varint((f << 3) | w), str = (f, s) => { const b = [...Buffer.from(s)]; return [...key(f, 2), ...varint(b.length), ...b]; };
export default async (ctx) => {
  const { base, page: newPage, ok, tmp } = ctx;
  const page = await newPage(); await page.goto(`${base}#/bindecode`);
  const src = page.locator('textarea'), out = page.locator('pre.bin-out'); await src.waitFor();
  const run = async (fmt, how, s) => { await page.getByRole('radio', { name: fmt, exact: true }).click(); await page.getByRole('radio', { name: how, exact: true }).click(); await src.fill(s); await page.waitForTimeout(250); return out.textContent(); };
  ok((await out.textContent()) === '1: 150\n2: "testing"\n3 {\n  1: 150\n}\n', 'sample: protobuf docs example (150, "testing", nested)');
  // person { name: "Asha", id: 42, email: "a@x.in", phones: [{number:"98", type:1},{number:"99"}], score: -3 (sint32), ratio: 0.5 (double) }
  const phone = (n, t) => { const inner = [...str(1, n), ...(t ? [...key(2, 0), ...varint(t)] : [])]; return [...key(4, 2), ...varint(inner.length), ...inner]; };
  const msg = [...str(1, 'Asha'), ...key(2, 0), ...varint(42), ...str(3, 'a@x.in'), ...phone('98', 1), ...phone('99'), ...key(5, 0), ...varint(5), ...key(6, 1), ...[...Buffer.alloc(8)].map((_, i) => { const b = Buffer.alloc(8); b.writeDoubleLE(0.5); return b[i]; })];
  let t = await run('Protobuf', 'Hex', Buffer.from(msg).toString('hex'));
  ok(t === '1: "Asha"\n2: 42\n3: "a@x.in"\n4 {\n  1: "98"\n  2: 1\n}\n4 {\n  1: "99"\n}\n5: 5\n6: 0x3fe0000000000000  # fixed64 4602678819172646912, double 0.5\n', `protobuf: strings, ints, repeated nested messages, double:\n${t}`);
  const zz = page.locator('label.switch', { hasText: 'zigzag' }); await zz.click(); await page.waitForTimeout(200); t = await out.textContent();
  ok(t === '1: "Asha"\n2: 42  # sint 21\n3: "a@x.in"\n4 {\n  1: "98"\n  2: 1  # sint -1\n}\n4 {\n  1: "99"\n}\n5: 5  # sint -3\n6: 0x3fe0000000000000  # fixed64 4602678819172646912, double 0.5\n', `zigzag (sint) readings appear when asked for (score 5 = sint -3):\n${t}`);
  await zz.click(); await page.waitForTimeout(150); ok(!/sint/.test(await out.textContent()), '… and go again (a plain 1 no longer reads "sint -1" by default)');
  ok(/6 top-level fields|7 top-level fields/.test(await page.locator('.note-ok').textContent()), 'field count');
  t = await run('Protobuf', 'Base64', Buffer.from(msg).toString('base64')); ok(t.startsWith('1: "Asha"'), 'protobuf from Base64');
  await run('Protobuf', 'Hex', '0a 05 61'); ok(/Not a valid protobuf/.test(await page.locator('.note-warn').textContent()), 'truncated protobuf → error');
  await run('Protobuf', 'Hex', '0a 0bc'); ok(/pairs of hex digits \(“0bc” has 3\)/.test(await page.locator('.note-warn').textContent()), 'odd hex → error naming the group');
  await run('Protobuf', 'Hex', '08 zz'); ok(/“zz” is not hex/.test(await page.locator('.note-warn').textContent()), 'non-hex → error');
  // MessagePack: {"name":"Asha","age":30,"tags":["a","b"],"ok":true,"pi":1.5,"neg":-1,"nil":null}
  const mp = Buffer.from('87a46e616d65a441736861a36167651ea47461677392a161a162a26f6bc3a27069cb3ff8000000000000a36e6567ffa36e696cc0', 'hex');
  t = await run('MessagePack', 'Hex', mp.toString('hex'));
  ok(t === '{\n  "name": "Asha",\n  "age": 30,\n  "tags": [\n    "a",\n    "b"\n  ],\n  "ok": true,\n  "pi": 1.5,\n  "neg": -1,\n  "nil": null\n}\n', `MessagePack map:\n${t}`);
  t = await run('MessagePack', 'Hex', 'c4 03 01 02 03 d6 ff 00 00 00 00'); ok(t === '<bin 3 bytes: 010203>\n\n<timestamp 1970-01-01T00:00:00Z>\n', `bin and timestamp extension (${JSON.stringify(t)})`);
  // CBOR RFC 8949 Appendix A
  t = await run('CBOR', 'Hex', 'a26161016162820203'); ok(t.replace(/\s+/g, ' ').trim() === '{ "a": 1, "b": [ 2, 3 ] }', 'CBOR {"a": 1, "b": [2, 3]}');
  t = await run('CBOR', 'Hex', 'c074323031332d30332d32315432303a30343a30305a'); ok(t.trim() === '0("2013-03-21T20:04:00Z")', 'CBOR tag 0 date string');
  t = await run('CBOR', 'Hex', 'f93c00 3903e7 4401020304'); ok(t === '1.0\n\n-1000\n\nh\'01020304\'\n', 'a CBOR sequence of three items');
  const f = join(tmp, 'm.bin'); writeFileSync(f, Buffer.from(msg));
  await page.getByRole('radio', { name: 'Protobuf', exact: true }).click(); await page.locator('.drop input[type=file]').setInputFiles(f); await page.waitForTimeout(300);
  ok((await out.textContent()).startsWith('1: "Asha"'), 'binary file decoded');
  // ---- reference messages (encoded and decoded by cbor2, msgpack, google.protobuf)
  const ref = JSON.parse(readFileSync(new URL('../fixtures/bin/reference.json', import.meta.url), 'utf8'));
  for (const [fmt, label, key2] of [['Protobuf', 'top-level field', 'protobuf'], ['MessagePack', 'value', 'msgpack'], ['CBOR', 'value', 'cbor']]) {
    const rows = ref[key2].filter((x) => x.hex.length < 3000).filter((_, i) => i % 7 === 0), bad = [];
    for (const row of rows) { const got = await run(fmt, 'Hex', row.hex); const n = await page.locator('.note-ok').textContent().catch(() => ''); if (got !== row.text || !n.includes(`${row.hex.length / 2} byte${row.hex.length === 2 ? '' : 's'} · ${row.count} ${label}${row.count === 1 ? '' : 's'}`)) bad.push(row.hex.slice(0, 40)); }
    ok(!bad.length, `${fmt}: ${rows.length} random messages decode to the reference text, with the byte and ${label} count ${bad.slice(0, 2).join(', ')}`);
    const b64 = rows.slice(0, 5).filter((row) => true), badB = []; for (const row of b64) if (await run(fmt, 'Base64', Buffer.from(row.hex, 'hex').toString('base64url')) !== row.text) badB.push(row.hex.slice(0, 30));
    ok(!badB.length, `${fmt}: the same from URL-safe Base64 without padding`);
  }
  // ---- bytes as people paste them
  for (const typed of ['08 96 01', '089601', '0x08, 0x96, 0x01', '{0x8, 0x96, 0x1}', '\\x08\\x96\\x01', '08:96:01', '8 96 1', '[0x08; 0x96; 0x01]']) ok(await run('Protobuf', 'Hex', typed) === '1: 150\n', `hex typed as ${typed}`);
  ok(await run('MessagePack', 'Base64', 'data:application/octet-stream;base64,kwECAw==') === '[\n  1,\n  2,\n  3\n]\n', 'Base64 inside a data: URL');
  await run('MessagePack', 'Base64', 'A'); ok(/one character is missing or extra/.test(await page.locator('.note-warn').textContent()), 'impossible Base64 length explained');
  ok(await run('MessagePack', 'Hex', '') === '(nothing to decode)' && /0 bytes · 0 values/.test(await page.locator('.note-ok').textContent()), 'nothing typed');
  ok(await run('Protobuf', 'Hex', '') === '(empty message)', 'an empty protobuf message');
  // ---- what used to be shown wrongly
  const C = [['f7', 'undefined\n'], ['f0', 'simple(16)\n'], ['c249010000000000000000', '18446744073709551616\n'], ['fb7e37e43c8800759c', '1.0e+300\n'], ['fb4341c37937e08000', '10000000000000000.0\n'], ['5f42010243030405ff', "(_ h'0102', h'030405')\n"], ['9f0102ff', '[_\n  1,\n  2\n]\n'], ['c11a514b67b0', '1(1363896240) / 2013-03-21T20:04:00Z /\n']];
  for (const [hx, want] of C) { t = await run('CBOR', 'Hex', hx); ok(t === want, `CBOR ${hx} → ${JSON.stringify(want)} (${JSON.stringify(t)})`); }
  const M = [['cb3ff0000000000000', '1.0\n'], ['cb7ff0000000000000', 'Infinity\n'], ['c400', '<bin 0 bytes>\n'], ['a17f', '"\\u007f"\n'], ['d7ff0ee6b28000000001', '<timestamp 1970-01-01T00:00:01.062500Z>\n']];
  for (const [hx, want] of M) { t = await run('MessagePack', 'Hex', hx); ok(t === want, `MessagePack ${hx} → ${JSON.stringify(want)} (${JSON.stringify(t)})`); }
  await run('MessagePack', 'Hex', 'c1'); ok(await page.locator('.note-warn').textContent() === 'Not valid MessagePack: byte 0xc1 at 0 is never used in MessagePack', '0xc1 is an error, not null');
  t = await run('MessagePack', 'Hex', '01 a161 c1'); ok(t === '1\n\n"a"\n' && /byte 0xc1 at 3 is never used in MessagePack\. Shown below: the 2 values before that point\./.test(await page.locator('.note-warn').textContent()), 'the values before a bad byte are still shown, with the reason');
  t = await run('Protobuf', 'Hex', '08 96 01 12'); ok(t === '1: 150\n' && /Shown below: the 1 field before that point/.test(await page.locator('.note-warn').textContent()), 'protobuf cut in the middle: the first field is shown');
  await run('CBOR', 'Hex', '18'); ok(await page.locator('.note-warn').textContent() === 'Not valid CBOR: the data ends in the middle of the value that starts at byte 0' && await out.textContent() === '', 'errors are in plain words (no Rust debug text)');
  ok(await run('Protobuf', 'Hex', '0a 02 48 69') === '1: "Hi"  # could also be a nested message\n', 'text that also parses as a message says so');
  ok(await zz.isVisible() && await (async () => { await page.getByRole('radio', { name: 'CBOR', exact: true }).click(); return zz.isHidden(); })(), 'the zigzag switch shows only for protobuf');
  // ---- junk and deep nesting do not break the tab
  const junk = join(tmp, 'hashes.txt'); writeFileSync(junk, Buffer.alloc(100000, '#'));
  await page.getByRole('radio', { name: 'Protobuf', exact: true }).click(); await page.locator('.drop input[type=file]').setInputFiles(junk); await page.waitForTimeout(500);
  ok(/nested deeper than 100 levels/.test(await page.locator('.note-warn').textContent()), '100 KB of "#" (100,000 open groups) → refused in words (it used to be "memory access out of bounds")');
  ok(await run('Protobuf', 'Hex', '08 96 01') === '1: 150\n' && await run('CBOR', 'Hex', '01') === '1\n', '… and the tab still works afterwards (it used to stay broken until reopened)');
  const lenp = (n) => { const o = []; while (n > 127) { o.push((n & 127) | 128); n >>>= 7; } o.push(n); return Buffer.from(o); };
  let nest = Buffer.from('0801', 'hex'); for (let i = 0; i < 60000; i++) nest = Buffer.concat([Buffer.from([0x0a]), lenp(nest.length), nest]);
  const deep = join(tmp, 'deep.bin'); writeFileSync(deep, nest); await page.getByRole('radio', { name: 'Protobuf', exact: true }).click(); const t0 = Date.now(); await page.locator('.drop input[type=file]').setInputFiles(deep); await page.waitForFunction(() => /top-level field/.test(document.querySelector('.note-ok')?.textContent || ''), null, { timeout: 20000 });
  t = await out.textContent(); ok(t.length < 40000 && t.split('\n').length < 250 && Date.now() - t0 < 5000, `60,000 nested messages (${nest.length} bytes): shown to 100 levels, ${t.length} characters, in ${Date.now() - t0} ms`);
  // ---- a chosen file is not lost when "Typed input is" changes
  const small = join(tmp, 'small.bin'); writeFileSync(small, Buffer.from('089601', 'hex')); await page.locator('.drop input[type=file]').setInputFiles(small); await page.waitForTimeout(300);
  await page.getByRole('radio', { name: 'Base64', exact: true }).click(); await page.waitForTimeout(250);
  ok(await out.textContent() === '1: 150\n' && /small\.bin, 3 bytes/.test(await src.inputValue()) && !(await page.locator('.note-warn').count()), 'switching Hex / Base64 with a file chosen keeps the file (it used to try to read "(file: …)" as Base64)');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {}); await page.getByRole('button', { name: 'Copy', exact: true }).click(); const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null); if (clip !== null) ok(clip === '1: 150\n', 'Copy');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'bindecode');
};
