// Word Counter (#/wordcount): words, characters (grapheme clusters: emoji with skin tone, Devanagari conjuncts count
// as one), sentences, paragraphs, lines, reading/speaking time, top keywords without stop words.
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/wordcount`);
  const ta = page.locator('textarea').first();
  const big = (l) => page.locator('.big-result').filter({ has: page.locator('.big-label', { hasText: new RegExp(`^${l}$`) }) }).locator('.big-value').textContent();
  const kv = (l) => page.evaluate((l) => { const s = [...document.querySelectorAll('.kv > span')]; const i = s.findIndex((e) => e.textContent === l); return i >= 0 ? s[i + 1].textContent : null; }, l);
  const set = async (s) => { await ta.fill(s); await ta.dispatchEvent('input'); };
  await ta.waitFor();
  ok(await big('Words') === '0' && await big('Reading time') === '—', 'empty: 0 words, no reading time');
  await set('The quick brown fox jumps over the lazy dog. It barked!\n\nA new paragraph here.\nSecond line.');
  ok(await big('Words') === '17' && await big('Sentences') === '4' && await kv('Paragraphs') === '2' && await kv('Lines') === '4', `17 words, 4 sentences, 2 paragraphs, 4 lines (${await big('Words')}, ${await big('Sentences')}, ${await kv('Paragraphs')}, ${await kv('Lines')})`);
  ok(await big('Characters') === '91' && await kv('Characters (no spaces)') === '74', `characters 91, without spaces 74 (${await big('Characters')}, ${await kv('Characters (no spaces)')})`);
  await set('👍🏽 नमस्ते दुनिया café');
  ok(await big('Words') === '3' && await big('Characters') === '14', `emoji + Hindi + accents: 3 words, 14 user-perceived characters (👍🏽 = 1, नमस्ते = न म स्ते) (${await big('Words')}, ${await big('Characters')})`);
  await set("don't stop—it's 3.5 km, e-mail me");
  ok(await big('Words') === '7', `contractions, numbers; e-mail counts as one word (${await big('Words')})`);
  await set(Array(476).fill('word').join(' '));
  ok(await big('Reading time') === '2 min' && await kv('Speaking time') === '3 min', 'reading 238 wpm (476 words = 2 min), speaking 150 wpm (3 min)');
  await set('Hello world');
  ok(await big('Reading time') === '1 sec' || /sec$/.test(await big('Reading time')), 'very short text reads in seconds');
  await set('Mumbai trains. Mumbai rains and Mumbai food. The trains are crowded; the food is great, great food.');
  const chips = await page.locator('.chip').allTextContents();
  ok(chips[0] === 'mumbai · 3' && chips.includes('food · 3') && chips.includes('trains · 2') && !chips.some((c) => /^(the|and|are|is) /.test(c)), `top keywords without stop words (${chips.join(', ')})`);
  ok(await kv('Avg word length') === (([...'Mumbai trains Mumbai rains and Mumbai food The trains are crowded the food is great great food'.split(' ')].reduce((a, w) => a + w.length, 0)) / 17).toFixed(1), 'average word length');
  await page.locator('textarea').first().evaluate((e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, Array(50000).fill('lorem ipsum').join(' '));
  ok(await big('Words') === '1,00,000', `100,000 words counted (Indian grouping ${await big('Words')})`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/wordcount`); await ph.locator('textarea').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
