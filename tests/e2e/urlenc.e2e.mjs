// URL Encoder (#/urlenc): component vs full-URL encoding (reserved characters, UTF-8), decoding (+ as space, malformed
// escapes), and the URL parts table (protocol, host, decoded path, hash, query parameters).
import { pcOnlyOnPhone } from './_pconly.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/urlenc`);
  const inp = page.getByLabel('Input'), out = page.locator('.card').filter({ hasText: 'Output' }).locator('textarea');
  const mode = (m) => page.getByRole('radio', { name: m, exact: true }).click();
  const kv = (l) => page.evaluate((l) => { const s = [...document.querySelectorAll('.kv > span')]; const i = s.findIndex((e) => e.textContent === l); return i >= 0 ? s[i + 1].textContent : null; }, l);
  const params = () => page.$$eval('.tbl tbody tr', (r) => r.map((tr) => [...tr.children].map((td) => td.textContent)));
  await inp.waitFor();
  const S = 'a b&c=d/é?#₹';
  await inp.fill(S); ok(await out.inputValue() === encodeURIComponent(S) && await out.inputValue() === 'a%20b%26c%3Dd%2F%C3%A9%3F%23%E2%82%B9', 'component: reserved characters and UTF-8 encoded');
  await mode('Encode full URL');
  const U = 'https://example.com/path with space/नमस्ते?q=chai samosa&x=1#top';
  await inp.fill(U); ok(await out.inputValue() === encodeURI(U) && (await out.inputValue()).includes('?q=chai%20samosa&x=1#top'), 'full URL: : / ? & # = kept');
  ok(await kv('Host') === 'example.com' && await kv('Path') === '/path with space/नमस्ते' && await kv('Hash') === '#top' && await kv('Protocol') === 'https:', 'URL parts with the path decoded');
  ok(JSON.stringify(await params()) === JSON.stringify([['q', 'chai samosa'], ['x', '1']]), 'query parameters');
  await mode('Decode');
  await inp.fill('https%3A%2F%2Fexample.com%2F%3Fq%3Dmasala+dosa%26city%3D%E0%A4%AE%E0%A5%81%E0%A4%82%E0%A4%AC%E0%A4%88');
  ok(await out.inputValue() === 'https://example.com/?q=masala dosa&city=मुंबई', `decode: %XX and + as space (${await out.inputValue()})`);
  ok(JSON.stringify(await params()) === JSON.stringify([['q', 'masala dosa'], ['city', 'मुंबई']]), 'parts of the decoded URL');
  await inp.fill('%E0%A4%A'); ok(/⚠ URI malformed/.test(await out.inputValue()), 'malformed escape reported');
  await inp.fill('just text'); ok(await out.inputValue() === 'just text' && await page.locator('.kv').count() === 0, 'not a URL: no parts table');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'urlenc');
};
