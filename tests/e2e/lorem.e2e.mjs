// Lorem Ipsum (#/lorem): exact paragraph / sentence / word counts, the classic opening replacing (not adding to) the
// first sentence or words, every sentence capitalised, only Lorem vocabulary, regenerate gives new text, copy.
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] }); await page.goto(`${base}#/lorem`);
  const out = page.locator('textarea').first(), slider = page.locator('input[type=range]');
  const setN = async (n) => { await slider.fill(String(n)); await slider.dispatchEvent('input'); };
  const unit = (u) => page.getByRole('radio', { name: u, exact: true }).click();
  const sentencesOf = (t) => t.split(/(?<=\.)\s+/).filter(Boolean);
  const VOCAB = new Set('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' '));
  await out.waitFor();
  let t = await out.inputValue();
  ok(t.split('\n\n').length === 3 && t.startsWith('Lorem ipsum dolor sit amet, consectetur adipiscing elit. ') && /^[A-Z]/.test(t.slice(57)), `default: 3 paragraphs, classic first sentence, next sentence capitalised ("${t.slice(57, 70)}")`);
  ok(t.split(/\n\n/).every((p) => sentencesOf(p).every((s) => /^[A-Z][a-z ,]+\.$/.test(s))), 'every sentence starts with a capital and ends with a full stop');
  ok(t.toLowerCase().match(/[a-z]+/g).every((w) => VOCAB.has(w)), 'only Lorem vocabulary');
  await unit('Sentences'); await setN(5); t = await out.inputValue();
  ok(sentencesOf(t).length === 5 && sentencesOf(t)[0] === 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.', `exactly 5 sentences incl. the classic one (${sentencesOf(t).length}) — was 6`);
  await unit('Words'); await setN(12); t = await out.inputValue();
  ok(t.split(' ').length === 12 && t.startsWith('Lorem ipsum dolor sit amet consectetur adipiscing elit ') && t.endsWith('.'), `exactly 12 words starting with the classic ones (${t.split(' ').length}) — was 20`);
  await setN(3); t = await out.inputValue(); ok(t === 'Lorem ipsum dolor.', `3 words → "${t}"`);
  await page.locator('label.switch').filter({ hasText: /Start with/ }).click();
  await setN(40); t = await out.inputValue();
  ok(t.split(' ').length === 40 && !t.startsWith('Lorem ipsum dolor sit amet consectetur'), 'without the classic opening: 40 random words');
  await unit('Paragraphs'); await setN(50); t = await out.inputValue();
  ok(t.split('\n\n').length === 50, '50 paragraphs');
  const before = await out.inputValue(); await page.getByRole('button', { name: 'Regenerate' }).click();
  ok(await out.inputValue() !== before, 'regenerate gives new text');
  await page.locator('.actions').getByRole('button', { name: 'Copy', exact: true }).click();
  ok(await page.evaluate(() => navigator.clipboard.readText()) === await out.inputValue(), 'copy');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/lorem`); await ph.locator('textarea').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
