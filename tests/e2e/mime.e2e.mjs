// MIME Types (#/mime, PC only): known extension ⇄ type pairs (IANA / WHATWG as browsers use them), every row well formed
// (type/subtype), no extension listed twice with different types, search by extension, by type and by words, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
const KNOWN = { html: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', mp3: 'audio/mpeg', mp4: 'video/mp4', webm: 'video/webm', wav: 'audio/wav', ogg: 'audio/ogg', zip: 'application/zip',
  gz: 'application/gzip', wasm: 'application/wasm', woff2: 'font/woff2', ttf: 'font/ttf', csv: 'text/csv', txt: 'text/plain', xml: 'application/xml', ics: 'text/calendar', '7z': 'application/x-7z-compressed',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', epub: 'application/epub+zip', heic: 'image/heic', flac: 'audio/flac', mov: 'video/quicktime', yaml: 'application/yaml' };
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/mime`);
  const q = page.locator('input[aria-label=Filter]'); await q.waitFor();
  const rows = () => page.$$eval('.ref-tbl tbody tr', (r) => r.map((e) => [...e.children].map((c) => c.textContent)));
  let r = await rows();
  const map = {}; const clash = [];
  for (const [exts, type] of r) for (const e of exts.split(' ').filter((x) => x.startsWith('.'))) { const k = e.slice(1); if (map[k] && map[k] !== type) clash.push(k); map[k] = type; }
  const bad = Object.entries(KNOWN).filter(([e, t]) => map[e] !== t).map(([e, t]) => `.${e} = ${map[e]} (want ${t})`);
  ok(!bad.length, `${Object.keys(KNOWN).length} known extension → type pairs ${bad.join('; ')}`);
  ok(!clash.length, `no extension mapped to two types (${clash})`);
  ok(r.length >= 100 && r.every((x) => /^[a-z]+\/[a-z0-9.+-]+$/i.test(x[1]) && x[2]), `${r.length} rows, every type is "type/subtype" with a description`);
  const s = async (v) => { await q.fill(v); return rows(); };
  r = await s('.docx'); ok(r.length === 1 && r[0][1].endsWith('wordprocessingml.document'), '".docx" → the Word type');
  r = await s('image/webp'); ok(r.length === 1 && r[0][0] === '.webp', 'reverse lookup: image/webp → .webp');
  r = await s('font'); ok(r.length >= 4 && r.every((x) => /font/i.test(x.join(' '))), `"font" → the font types (${r.length})`);
  r = await s('iphone'); ok(r.some((x) => x[0] === '.heic'), '"iphone" finds HEIC');
  r = await s('form'); ok(r.some((x) => x[1] === 'multipart/form-data') && r.some((x) => x[1] === 'application/x-www-form-urlencoded'), 'form encodings listed');
  ok(/Content-Type/.test(await page.locator('.note').first().textContent()), 'note about the Content-Type header');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'mime');
};
