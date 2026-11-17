// URL Encoder (#/urlenc, PC only): component encoding (equal to Python's quote and Node), form style, a whole URL made
// valid without double encoding (equal to Node's WHATWG URL), lenient decoding (Windows-1252 escapes, stray %, + only in
// queries, text encoded twice), URL parts read from the URL itself (user, port, path, query parameters, hash).
import { pcOnlyOnPhone } from './_pconly.mjs';
import { REF, setValue, notes, until } from './_devdata.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/urlenc`);
  const inp = page.getByLabel('Input'), out = page.locator('.outbox textarea');
  const mode = (m) => page.getByRole('radio', { name: m, exact: true }).click();
  const sw = (t) => page.locator('label.switch').filter({ hasText: t });
  const kv = async () => { const t = await page.locator('.kv').first().locator('span').allTextContents().catch(() => []); const o = {}; for (let i = 0; i < t.length; i += 2) o[t[i]] = t[i + 1]; return o; };
  const params = () => page.$$eval('table.tbl tbody tr', (r) => r.map((tr) => [...tr.children].map((td) => td.textContent)));
  await inp.waitFor();
  const U = 'https://example.com/search?q=chai & samosa&city=मुंबई#top';
  ok(await out.inputValue() === encodeURIComponent(U), 'default: the sample encoded as a component');
  ok(JSON.stringify(await kv()) === JSON.stringify({ Protocol: 'https:', Host: 'example.com', Port: '443 (default for https)', Path: '/search', Query: new URL(U).search, Hash: '#top' }) && JSON.stringify(await params()) === JSON.stringify([['q', 'chai '], [' samosa', ''], ['city', 'मुंबई']]), `URL parts of the sample: the raw & splits the query, as it does for a server (${JSON.stringify(await params())})`);
  await sw('Form style').click(); ok(await out.inputValue() === encodeURIComponent(U).replace(/%20/g, '+'), 'form style: + for spaces');
  await sw('Form style').click();
  let comp = 0; const rows = REF.url.random.filter((_, i) => i % 4 === 0);
  for (const r of rows) { await setValue(inp, r.text); if (await out.inputValue() === r.component) comp++; else if (comp === rows.indexOf(r)) ok(false, `component ${JSON.stringify(r.text)}: ${await out.inputValue()} ≠ ${r.component}`); }
  ok(comp === rows.length, `${rows.length} texts encode like Python's quote(safe="!~*'()") (${comp})`);
  await setValue(inp, 'a\ud800b'); ok(await out.inputValue() === 'a%EF%BF%BDb' && /half of a surrogate pair/.test(await notes(page)), 'half a surrogate pair is encoded as U+FFFD (it used to show "URI malformed")');
  await setValue(inp, ''); ok(await out.inputValue() === '' && await page.locator('.note').count() === 0, 'empty input');
  // whole URLs
  await mode('Encode full URL');
  for (const u of [U, 'https://example.com/a%20b?x=%26', 'http://[::1]:8080/p', 'https://मुंबई.example/पथ', 'HTTP://EXAMPLE.com', 'mailto:user+tag@example.com?subject=hi there', 'https://user:p@ss@example.com:8443/x', 'https://bücher.example/straße?ß=ü#ö', 'https://example.com/a b{c}`e"f<g>']) {
    await setValue(inp, u); ok(await out.inputValue() === new URL(u).href && /Read as a URL/.test(await notes(page)), `full URL ${u} → ${await out.inputValue()} (as Node's URL parser)`);
  }
  ok(new URL('https://example.com/a%20b?x=%26').href === 'https://example.com/a%20b?x=%26' && new URL('https://मुंबई.example/').hostname === 'xn--i1bm1ig9g.example', '(%20 is not encoded twice, the Devanagari host is Punycode)');
  await setValue(inp, '/path with space/ü?q=1 2&r=%20'); ok(await out.inputValue() === '/path%20with%20space/%C3%BC?q=1%202&r=%20' && /Not an absolute URL/.test(await notes(page)), 'a relative URL: unsafe characters escaped, %20 kept');
  await setValue(inp, 'not a url % 50%'); ok(await out.inputValue() === 'not%20a%20url%20%25%2050%25', 'plain text: a stray % becomes %25');
  await setValue(inp, 'https://user:pw@example.com:8443/a%2Fb/c%20d?q=a%26b&x=1+2&x=3#frag%20ment');
  ok(JSON.stringify(await kv()) === JSON.stringify({ Protocol: 'https:', User: 'user (password: pw)', Host: 'example.com', Port: '8443', Path: '/a%2Fb/c%20d  →  /a/b/c d', Query: '?q=a%26b&x=1+2&x=3', Hash: '#frag%20ment  →  #frag ment' }), `URL parts: user, port, path and hash raw and decoded (${JSON.stringify(await kv())})`);
  ok(JSON.stringify(await params()) === JSON.stringify([['q', 'a&b'], ['x', '1 2'], ['x', '3']]), 'query parameters come from the URL itself: an escaped & stays inside its value, a repeated name is listed twice');
  // decoding
  await mode('Decode');
  let dec = 0; for (const r of rows) { await setValue(inp, r.component); if (await out.inputValue() === r.text) dec++; }
  ok(dec === rows.length, `${rows.length} encoded texts decode back (${dec})`);
  for (const r of REF.url.legacy) { await setValue(inp, r.cp1252); ok(await out.inputValue() === r.text && /not UTF-8 — read as Windows-1252/.test(await notes(page)), `${r.cp1252} (an old Latin-1 escape) reads as ${r.text}, with a note`); }
  for (const [s, want] of [['https://example.com/c++/x?q=a+b%26c&d=1%2B1#a+b', 'https://example.com/c++/x?q=a b&c&d=1+1#a+b'], ['mailto:user+tag@example.com', 'mailto:user+tag@example.com'], ['tel:+91-98765-43210', 'tel:+91-98765-43210'], ['q=chai+%26+samosa&city=Pune', 'q=chai & samosa&city=Pune'], ['%E0%A4%AE%E0%A5%81%E0%A4%82%E0%A4%AC%E0%A4%88', 'मुंबई'], ['caf%E9 %E2%9C%93', 'café ✓'], ['a%00b', 'a\u0000b']]) {
    await setValue(inp, s); ok(await out.inputValue() === want, `decode ${s} → ${JSON.stringify(want)}`);
  }
  await setValue(inp, '100% sure %zz %4'); ok(await out.inputValue() === '100% sure %zz %4' && /3 % signs are not followed by two hex digits — left as written/.test(await notes(page)), 'a % that is not an escape stays as written, with a note (it used to show "⚠ URI malformed" as the result)');
  await setValue(inp, '50%'); ok(/1 % sign is not followed/.test(await notes(page)), 'the note counts in the singular too');
  await setValue(inp, '%2520'); ok(await out.inputValue() === '%20' && /encoded more than once/.test(await notes(page)), 'text that was encoded twice is noticed');
  await page.getByRole('button', { name: 'Decode again' }).click(); ok(await inp.inputValue() === '%20' && await out.inputValue() === ' ', '"Decode again" decodes the result once more');
  await setValue(inp, 'https://example.com/?a=%26%3D&b=x%20y+z');
  ok(JSON.stringify(await params()) === JSON.stringify([['a', '&='], ['b', 'x y z']]) && await out.inputValue() === 'https://example.com/?a=&=&b=x y z', 'in Decode the parameters still come from the encoded URL (a = "&=", not three broken pieces)');
  await sw('Read +').click(); await setValue(inp, 'q=a+b'); ok(await out.inputValue() === 'q=a+b', 'the + rule can be switched off');
  await sw('Read +').click(); ok(await out.inputValue() === 'q=a b', 'and on again');
  await setValue(inp, 'just text'); ok(await page.locator('.kv').count() === 0, 'no URL parts for text that is not a URL');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'urlenc');
};
