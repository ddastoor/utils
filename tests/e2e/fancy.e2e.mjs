// Fancy Text (#/fancy): every style maps A–Z, a–z (and digits where Unicode has them) to real, assigned characters —
// no unassigned code points (the holes in Mathematical Alphanumerics are filled with the Letterlike Symbols), exact
// known outputs, upside-down reversal, combining strikethrough/underline, copy.
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] }); await page.goto(`${base}#/fancy`);
  const inp = page.locator('.card input').first();
  const styles = async (s) => { await inp.fill(s); await inp.dispatchEvent('input'); return page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.case-row')].map((r) => [r.querySelector('.case-name').textContent, r.querySelector('.case-val').textContent]))); };
  const ALL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const r = await styles(ALL);
  ok(Object.keys(r).length === 18, '18 styles');
  const holes = await page.evaluate((r) => Object.entries(r).filter(([, v]) => /\p{Cn}/u.test(v)).map(([k]) => k), r);
  ok(!holes.length, `no unassigned code points in any style (${holes.join(', ') || 'none'})`);
  const full = ['Bold', 'Italic', 'Bold italic', 'Script', 'Bold script', 'Fraktur', 'Double-struck', 'Sans-serif', 'Sans bold', 'Sans italic', 'Monospace', 'Circled', 'Fullwidth'];
  const leftovers = full.filter((k) => /[A-Za-z]/.test(r[k]));
  ok(!leftovers.length, `letters fully converted in ${full.length} styles (${leftovers.join(', ') || 'all'})`);
  ok([...r.Bold].length === ALL.length && [...r['Double-struck']].length === ALL.length, 'one output character per input character');
  const s = await styles('SuperTools 2026');
  ok(s.Bold === '𝐒𝐮𝐩𝐞𝐫𝐓𝐨𝐨𝐥𝐬 𝟐𝟎𝟐𝟔' && s.Monospace === '𝚂𝚞𝚙𝚎𝚛𝚃𝚘𝚘𝚕𝚜 𝟸𝟶𝟸𝟼' && s['Double-struck'] === '𝕊𝕦𝕡𝕖𝕣𝕋𝕠𝕠𝕝𝕤 𝟚𝟘𝟚𝟞', `known outputs (${s.Bold})`);
  ok(s.Fullwidth === 'ＳｕｐｅｒＴｏｏｌｓ　２０２６' && s['Small caps'] === 'SᴜᴘᴇʀTᴏᴏʟꜱ 2026', `fullwidth and small caps (${s['Small caps']})`);
  const h = await styles('Hello!');
  ok(h['Upside down'] === '¡ollǝH' && h.Italic === '𝐻𝑒𝑙𝑙𝑜!' && h.Script === 'ℋℯ𝓁𝓁ℴ!', `upside down reversed; italic/script use the Letterlike forms (${h['Upside down']}, ${h.Script})`);
  ok(h.Strikethrough === 'H̶e̶l̶l̶o̶!̶' && h.Underline === 'H̲e̲l̲l̲o̲!̲', 'combining strikethrough and underline');
  ok((await styles('नमस्ते 🙏')).Bold === 'नमस्ते 🙏', 'non-Latin text and emoji left as they are');
  await styles('abc');
  await page.locator('.case-row').filter({ hasText: 'Circled' }).getByRole('button', { name: 'Copy' }).click();
  ok(await page.evaluate(() => navigator.clipboard.readText()) === 'ⓐⓑⓒ', 'copy');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/fancy`); await ph.locator('.case-row').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
