// Protobuf / MessagePack / CBOR (#/bindecode, PC only): messages encoded here (protobuf wire format by hand, MessagePack
// by hand per the spec, CBOR RFC 8949 Appendix A) in hex, Base64 and as a file decode to the expected text; nested and
// repeated fields, negative ints, floats, maps; truncated input errors; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { writeFileSync } from 'node:fs';
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
  ok(t === '1: "Asha"\n2: 42\n3: "a@x.in"\n4 {\n  1: "98"\n  2: 1  # sint -1\n}\n4 {\n  1: "99"\n}\n5: 5  # sint -3\n6: 0x3fe0000000000000  # fixed64 4602678819172646912, double 0.5\n', `protobuf: strings, ints, repeated nested messages, zigzag hint, double:\n${t}`);
  ok(/6 top-level fields|7 top-level fields/.test(await page.locator('.note-ok').textContent()), 'field count');
  t = await run('Protobuf', 'Base64', Buffer.from(msg).toString('base64')); ok(t.startsWith('1: "Asha"'), 'protobuf from Base64');
  await run('Protobuf', 'Hex', '0a 05 61'); ok(/Not a valid protobuf/.test(await page.locator('.note-warn').textContent()), 'truncated protobuf → error');
  await run('Protobuf', 'Hex', '0a 0'); ok(/pairs of hex/.test(await page.locator('.note-warn').textContent()), 'odd hex → error');
  // MessagePack: {"name":"Asha","age":30,"tags":["a","b"],"ok":true,"pi":1.5,"neg":-1,"nil":null}
  const mp = Buffer.from('87a46e616d65a441736861a36167651ea47461677392a161a162a26f6bc3a27069cb3ff8000000000000a36e6567ffa36e696cc0', 'hex');
  t = await run('MessagePack', 'Hex', mp.toString('hex'));
  ok(t === '{\n  "name": "Asha",\n  "age": 30,\n  "tags": [\n    "a",\n    "b"\n  ],\n  "ok": true,\n  "pi": 1.5,\n  "neg": -1,\n  "nil": null\n}\n', `MessagePack map:\n${t}`);
  t = await run('MessagePack', 'Hex', 'c4 03 01 02 03 d6 ff 00 00 00 00'); ok(t === '<bin 3 bytes: 010203>\n\n<timestamp 1970-01-01T00:00:00+00:00>\n', `bin and timestamp extension (${JSON.stringify(t)})`);
  // CBOR RFC 8949 Appendix A
  t = await run('CBOR', 'Hex', 'a26161016162820203'); ok(t.replace(/\s+/g, ' ').trim() === '{ "a": 1, "b": [ 2, 3 ] }', 'CBOR {"a": 1, "b": [2, 3]}');
  t = await run('CBOR', 'Hex', 'c074323031332d30332d32315432303a30343a30305a'); ok(t.trim() === '0("2013-03-21T20:04:00Z")', 'CBOR tag 0 date string');
  t = await run('CBOR', 'Hex', 'f93c00 3903e7 4401020304'); ok(t === '1.0\n\n-1000\n\nh\'01020304\'\n', 'a CBOR sequence of three items');
  const f = join(tmp, 'm.bin'); writeFileSync(f, Buffer.from(msg));
  await page.getByRole('radio', { name: 'Protobuf', exact: true }).click(); await page.locator('.drop input[type=file]').setInputFiles(f); await page.waitForTimeout(300);
  ok((await out.textContent()).startsWith('1: "Asha"'), 'binary file decoded');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'bindecode');
};
