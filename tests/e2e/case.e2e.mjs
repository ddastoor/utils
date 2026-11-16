// Case Converter (#/case): all twelve conversions with known answers, Chicago-style title case, sentence case keeps
// "I", code cases drop punctuation and split acronyms, Unicode (Turkish-free) letters, copy.
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] }); await page.goto(`${base}#/case`);
  const ta = page.locator('textarea').first();
  const conv = async (s) => { await ta.fill(s); await ta.dispatchEvent('input'); return page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.case-row')].map((r) => [r.querySelector('.case-name').textContent, r.querySelector('.case-val').textContent]))); };
  let r = await conv('The quick brown fox jumps over the lazy dog');
  for (const [k, v] of Object.entries({ 'UPPER CASE': 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG', 'lower case': 'the quick brown fox jumps over the lazy dog', 'Title Case': 'The Quick Brown Fox Jumps Over the Lazy Dog', 'Sentence case': 'The quick brown fox jumps over the lazy dog', camelCase: 'theQuickBrownFoxJumpsOverTheLazyDog', PascalCase: 'TheQuickBrownFoxJumpsOverTheLazyDog', snake_case: 'the_quick_brown_fox_jumps_over_the_lazy_dog', 'kebab-case': 'the-quick-brown-fox-jumps-over-the-lazy-dog', CONSTANT_CASE: 'THE_QUICK_BROWN_FOX_JUMPS_OVER_THE_LAZY_DOG', 'dot.case': 'the.quick.brown.fox.jumps.over.the.lazy.dog', aLtErNaTiNg: 'tHe qUiCk bRoWn fOx jUmPs oVeR ThE LaZy dOg', iNVERSE: 'tHE QUICK BROWN FOX JUMPS OVER THE LAZY DOG' }))
    ok(r[k] === v, `${k}: ${r[k]}`);
  r = await conv('a tale of two cities: the best of times and what it is for');
  ok(r['Title Case'] === 'A Tale of Two Cities: The Best of Times and What It Is For', `title case: first/last word and after a colon capitalised (${r['Title Case']})`);
  r = await conv("HELLO. i think i'm right, i.e. it works! is it? yes");
  ok(r['Sentence case'] === "Hello. I think I'm right, i.e. it works! Is it? Yes", `sentence case keeps "I" and "I'm", not "i.e." (${r['Sentence case']})`);
  r = await conv('Hello, world! How are you?');
  ok(r.camelCase === 'helloWorldHowAreYou' && r.snake_case === 'hello_world_how_are_you' && r['kebab-case'] === 'hello-world-how-are-you', `punctuation dropped in code cases (${r.camelCase})`);
  r = await conv('XMLHttpRequest parseJSONData user_id v2Api');
  ok(r.snake_case === 'xml_http_request_parse_json_data_user_id_v2_api' && r.PascalCase === 'XmlHttpRequestParseJsonDataUserIdV2Api', `acronyms and humps split (${r.snake_case})`);
  r = await conv('ÉCOLE élève Straße');
  ok(r['lower case'] === 'école élève straße' && r['UPPER CASE'] === 'ÉCOLE ÉLÈVE STRASSE' && r.camelCase === 'écoleÉlèveStraße', `Unicode letters (${r['UPPER CASE']}, ${r.camelCase})`);
  r = await conv('');
  ok(Object.values(r).every((v) => v === ''), 'empty input → empty outputs, no errors');
  await conv('copy me');
  await page.locator('.case-row').filter({ hasText: 'CONSTANT_CASE' }).getByRole('button', { name: 'Copy' }).click();
  ok(await page.evaluate(() => navigator.clipboard.readText()) === 'COPY_ME', 'copy button copies that conversion');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/case`); await ph.locator('.case-row').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
