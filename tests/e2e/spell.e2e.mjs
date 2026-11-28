// Spell Checker (#/spell, PC + phones; potentials #10) end to end: nothing fetched until there is text; the misspelt words
// underlined under the text (the marks under the right letters), one at a time in the pane with its sentence and the suggestions
// in the tab's order (the right word first: Teh → The, jumpd → jumped, recieve → receive — tests/unit/spell.test.mjs holds the
// engine to native Hunspell 1.7.6 and the order to its measurement); Change, Change all, Ignore, Ignore all, Add to dictionary,
// a word typed by hand, Previous / Next round and round, Undo; a click on a word in the text; names, CAPITALS, words with digits
// and web and e-mail addresses left alone, and the switches for them; Paste, Open a text file, a file dropped; Copy and Download
// (the file's own name); American, British and Indian English; a long text; what is kept while the page is open; leaving the tab;
// WCAG 2.2 A / AA in both themes; the phone.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { phoneLayout } from './_phone.mjs';
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

export default async (ctx) => {
  const { base, page: newPage, ok, download, tmp } = ctx;
  const page = await newPage({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const asked = [];
  page.on('request', (r) => { const u = r.url(); if (/hunspell|vendor\/spell|data\/spell|freq\.txt/.test(u)) asked.push(u.replace(/^.*\//, '')); });
  await page.goto(`${base}#/spell`);
  const ta = page.getByRole('textbox', { name: 'Text to check' });
  await ta.waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  ok(!asked.length, `nothing fetched while the box is empty (${asked.join(', ')})`);
  ok((await page.locator('.sp-pane').textContent()).includes('Type, paste or open a text'), 'the pane says what to do');
  ok(!(await page.locator('.tool-body').textContent()).includes('null') && !(await page.locator('.actions').count()), 'a PC has no fixed bar (and no stray text where it would be)');

  const marks = () => page.$$eval('.sp-back mark.sp-bad', (ms) => ms.map((m) => m.textContent));
  const current = () => page.locator('.sp-back mark.cur').textContent();
  const count = () => page.locator('.sp-count').textContent();
  const sugg = async () => { await page.locator('.sp-sugg .sp-s').first().waitFor({ timeout: 20000 }); return page.$$eval('.sp-sugg .sp-s', (bs) => bs.map((b) => b.textContent)); };
  const waitMarks = async (n) => { await page.waitForFunction((k) => document.querySelectorAll('.sp-back mark.sp-bad').length === k, n, { timeout: 20000 }); };
  const waitWords = async (ws) => { await page.waitForFunction((w) => [...document.querySelectorAll('.sp-back mark.sp-bad')].map((m) => m.textContent).join('|') === w, ws.join('|'), { timeout: 20000 }); };
  const btn = (name) => page.getByRole('button', { name, exact: true });
  const sw = (name) => page.locator('label.switch', { hasText: name }); // a switch: its label (the box itself is drawn by CSS)

  // ---------------------------------------------------------------- the marks
  const TEXT = 'Teh quick brown fox jumpd over the lazy dog. I recieve your leter tommorow and recieve more.\n'
    + 'Yesterday Ramesh from Infosys sent the NASA report on 2nd May: see https://exmaple.com/a-b or write to ramsh@exmaple.co.in today.';
  await ta.fill(TEXT);
  await waitMarks(6);
  ok(JSON.stringify(await marks()) === JSON.stringify(['Teh', 'jumpd', 'recieve', 'leter', 'tommorow', 'recieve']),
    `the misspelt words underlined, and only they — names, CAPITALS, 2nd, the addresses left alone (${(await marks()).join(', ')})`);
  ok(asked.some((u) => /^hunspell.*\.wasm$/.test(u)) && asked.includes('en-US.aff') && asked.includes('en-US.dic'), `with the first text: the engine and the American dictionary (${asked.join(', ')})`);
  // the marks lie under the words of the text box: the backdrop has the text box's size, font and wrapping
  const geo = await page.evaluate(() => {
    const t = document.querySelector('.sp-text'), b = document.querySelector('.sp-back'), m = b.querySelector('mark.sp-bad');
    const s = (e) => { const c = getComputedStyle(e); return [c.fontSize, c.fontFamily, c.lineHeight, c.paddingLeft, c.paddingTop, c.whiteSpace, c.letterSpacing].join(); };
    const rt = t.getBoundingClientRect(), rb = b.getBoundingClientRect(), rm = m.getBoundingClientRect();
    return { same: s(t) === s(b), dx: Math.abs(rt.left - rb.left) + Math.abs(rt.width - rb.width), mx: Math.round(rm.left - rt.left), my: Math.round(rm.top - rt.top) };
  });
  ok(geo.same && geo.dx < 1 && geo.mx < 24 && geo.my < 24, `the marks lie under the text: same font, padding and width (${JSON.stringify(geo)})`);
  ok((await count()) === '1 of 6' && (await current()) === 'Teh', 'the first misspelt word is the current one: 1 of 6');
  ok((await page.locator('.sp-ctx').textContent()) === 'Teh quick brown fox jumpd over the lazy dog.', `its sentence in the pane (${await page.locator('.sp-ctx').textContent()})`);
  let s = await sugg();
  ok(s[0] === 'The' && (await page.locator('.sp-to').inputValue()) === 'The', `the suggestions with the right one first, and in “Change to” (${s.join(', ')})`);
  ok(asked.includes('freq.txt'), 'the word frequencies fetched with the first suggestions (the Photo Dictionary’s list)');
  ok(s.length <= 8, `at most eight shown (${s.length})`);

  // ---------------------------------------------------------------- Change, Change all, Ignore, Ignore all, Add, Undo
  await btn('Change').click();
  await waitMarks(5);
  ok((await ta.inputValue()).startsWith('The quick brown fox jumpd'), 'Change: Teh → The in the text');
  ok((await count()) === '1 of 5' && (await current()) === 'jumpd', 'and the next misspelt word is the current one');
  s = await sugg();
  ok(s[0] === 'jumped', `jumpd → jumped first (${s.join(', ')})`);
  await page.locator('.sp-sugg .sp-s', { hasText: /^jumped$/ }).click();
  await btn('Change').click();
  await waitMarks(4);
  ok((await current()) === 'recieve' && (await btn('Change all (2)').count()) === 1, 'recieve twice: “Change all (2)”');
  s = await sugg();
  ok(s[0] === 'receive', `recieve → receive first (${s.join(', ')})`);
  await btn('Change all (2)').click();
  await waitMarks(2);
  ok((await ta.inputValue()).includes('I receive your leter tommorow and receive more.'), 'Change all: both changed');
  ok((await current()) === 'leter', `the walk goes on after the word changed (${await current()})`);
  await btn('Ignore').click();
  await waitMarks(1);
  ok((await current()) === 'tommorow' && !(await marks()).includes('leter'), 'Ignore: leter left as it is, here');
  await page.locator('.sp-to').fill('tomorrow'); // at once: its suggestions may still be coming
  await page.locator('.sp-to').press('Enter');
  await waitMarks(0);
  ok((await ta.inputValue()).includes('your leter tomorrow and'), 'a word typed in “Change to”, and Enter, changes it');
  ok((await page.locator('.sp-pane').textContent()).includes('No spelling mistakes found.'), 'no mistakes left: said');
  await btn('Undo Change').click();
  await waitMarks(1);
  ok((await ta.inputValue()).includes('your leter tommorow and') && (await current()) === 'tommorow', 'Undo: tommorow is back, and current');
  await btn('Undo Ignore').click();
  await waitMarks(2);
  ok(JSON.stringify(await marks()) === JSON.stringify(['leter', 'tommorow']), 'Undo again: leter is marked again');
  // Change pressed at once, before the suggestions have come: the first suggestion, once it is there (not Ignore)
  await ta.fill('A wierd day.');
  await waitWords(['wierd']);
  await btn('Change').click();
  ok(await page.waitForFunction(() => document.querySelector('.sp-text').value === 'A weird day.', null, { timeout: 20000 }).then(() => true, () => false),
    `Change pressed at once changes to the first suggestion (${JSON.stringify(await ta.inputValue())})`);
  await ta.fill('Teh quick brown fox jumped over the lazy dog. I receive your leter tommorow and receive more.');
  await waitWords(['Teh', 'leter', 'tommorow']);

  // Ignore all, Add to dictionary, a click on a word, Previous / Next
  await ta.fill('The zorblax and the zorblax met the qwyzx. Then another qwyzx and a flimbo came.');
  await waitWords(['zorblax', 'zorblax', 'qwyzx', 'qwyzx', 'flimbo']);
  ok((await current()) === 'zorblax', 'a new text: its first misspelt word');
  await btn('Ignore all').click();
  await waitMarks(3);
  ok(!(await marks()).includes('zorblax') && (await current()) === 'qwyzx', 'Ignore all: zorblax everywhere');
  await btn('Add to dictionary').click();
  await waitMarks(1);
  ok(JSON.stringify(await marks()) === JSON.stringify(['flimbo']), 'Add to dictionary: qwyzx taken everywhere');
  await ta.fill('A qwyzx, a zorblax and a flimbo and a glarp and a snerk.');
  await waitWords(['flimbo', 'glarp', 'snerk']);
  ok(JSON.stringify(await marks()) === JSON.stringify(['flimbo', 'glarp', 'snerk']), 'the word added and the word ignored stay so in a new text (while the page is open)');
  await btn('Next').click();
  ok((await count()) === '2 of 3' && (await current()) === 'glarp', 'Next');
  await btn('Next').click(); await btn('Next').click();
  ok((await count()) === '1 of 3' && (await current()) === 'flimbo', 'Next from the last goes round to the first');
  await btn('Previous').click();
  ok((await count()) === '3 of 3' && (await current()) === 'snerk', 'Previous from the first goes round to the last');
  const v = await ta.inputValue();
  await ta.click(); await page.evaluate((i) => { const t = document.querySelector('.sp-text'); t.setSelectionRange(i, i); t.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, v.indexOf('glarp') + 2);
  ok((await current()) === 'glarp' && (await count()) === '2 of 3', 'a click on a misspelt word in the text makes it the current one');
  // typing moves on with the text: a word typed before the current one
  await page.evaluate(() => { const t = document.querySelector('.sp-text'); t.setSelectionRange(0, 0); });
  await page.keyboard.type('Oh, ');
  await page.waitForFunction(() => document.querySelector('.sp-back')?.textContent.startsWith('Oh, A qwyzx'), null, { timeout: 10000 });
  ok((await current()) === 'glarp' && JSON.stringify(await marks()) === JSON.stringify(['flimbo', 'glarp', 'snerk']), 'text typed before it: the marks and the current word follow');

  // ---------------------------------------------------------------- what is left alone
  await ta.fill('We met Gwyndolyn at XQZT on 3rdx. Gwyndolyn said hello.');
  await waitWords(['Gwyndolyn']);
  ok(JSON.stringify(await marks()) === JSON.stringify(['Gwyndolyn']), `a name in mid-sentence, CAPITALS and a word with digits left alone; the name at a sentence's start checked (${(await marks()).join(', ')})`);
  ok((await page.locator('.sp-counts').textContent()).includes('3 left alone'), `the counts say so (${await page.locator('.sp-counts').textContent()})`);
  await page.locator('.sp-opts summary').click();
  await sw(/^Names/).click();
  await waitMarks(2);
  await sw(/CAPITALS/).click();
  await waitMarks(3);
  await sw(/digits/).click();
  await waitMarks(4);
  ok(JSON.stringify(await marks()) === JSON.stringify(['Gwyndolyn', 'XQZT', '3rdx', 'Gwyndolyn']), `with the switches off they are checked (${(await marks()).join(', ')})`);
  for (const n of [/^Names/, /CAPITALS/, /digits/]) await sw(n).click();
  await waitMarks(1);

  // ---------------------------------------------------------------- Paste, Open a text file, a file dropped, Copy, Download
  await ta.fill('');
  await page.evaluate(() => navigator.clipboard.writeText('Pasted txet from the clipbaord.'));
  await btn('Paste').click();
  await waitWords(['txet', 'clipbaord']);
  ok((await ta.inputValue()) === 'Pasted txet from the clipbaord.' && (await page.locator('.sp-info').textContent()).includes('Pasted 31 characters'), 'Paste: the clipboard’s text in the box, checked');
  const file = join(tmp, 'notes.md');
  writeFileSync(file, '# Notes\n\nThe meetting is on teh first floor.\n');
  const ch = page.waitForEvent('filechooser'); await btn('Open a text file').click(); await (await ch).setFiles(file);
  await waitWords(['meetting', 'teh']);
  ok((await ta.inputValue()) === '# Notes\n\nThe meetting is on teh first floor.\n' && (await page.locator('.sp-info').textContent()).includes('Opened notes.md'), 'Open a text file: notes.md in the box, its mistakes marked');
  await btn('Change').click(); await waitMarks(1);
  await page.locator('.sp-sugg .sp-s').first().waitFor();
  await btn('Change').click(); await waitMarks(0);
  const FIXED = '# Notes\n\nThe meeting is on the first floor.\n';
  ok((await ta.inputValue()) === FIXED, `both changed to their first suggestion (${JSON.stringify(await ta.inputValue())})`);
  const dl = await download(page, () => btn('Download').click());
  ok(dl.endsWith('notes.md') && readFileSync(dl, 'utf8') === FIXED, `Download: the text under the file's own name (${dl.split(/[\\/]/).pop()})`);
  await btn('Copy').click();
  ok((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n') === FIXED, 'Copy: the whole text on the clipboard'); // (Windows: \r\n on the clipboard)
  await page.evaluate(() => {
    const dt = new DataTransfer(); dt.items.add(new File(['Droped file text.'], 'drop.txt', { type: 'text/plain' }));
    document.querySelector('.sp-editor').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await waitWords(['Droped']);
  ok((await ta.inputValue()) === 'Droped file text.', 'a text file dropped on the box is opened');
  const dl2 = await download(page, () => btn('Download').click());
  ok(dl2.endsWith('drop.txt'), `Download keeps the dropped file's name (${dl2.split(/[\\/]/).pop()})`);
  const bin = page.waitForEvent('filechooser'); await btn('Open a text file').click();
  await (await bin).setFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0, 0, 0]) });
  await page.waitForFunction(() => /not a text|text file/i.test(document.querySelector('.sp-info')?.textContent || ''), null, { timeout: 10000 });
  ok((await ta.inputValue()) === 'Droped file text.', `a file that is not text is refused in words, the text kept (${await page.locator('.sp-info').textContent()})`);
  await btn('Clear').click();
  await page.waitForFunction(() => document.querySelector('.sp-pane')?.textContent.includes('Type, paste or open'), null, { timeout: 10000 });
  ok((await ta.inputValue()) === '' && !(await marks()).length, 'Clear: the box empty, nothing marked');
  await btn('Undo Clear').click();
  ok((await ta.inputValue()) === 'Droped file text.', 'Undo Clear brings the text back');

  // ---------------------------------------------------------------- the languages
  const lang = page.getByRole('combobox', { name: 'Language' });
  const LT = 'The colour and the color, we organise and organize, a lakh of rupees in Bengaluru; prepone the meeting.';
  await ta.fill(LT);
  await waitWords(['colour', 'organise', 'lakh', 'prepone']);
  ok(JSON.stringify(await marks()) === JSON.stringify(['colour', 'organise', 'lakh', 'prepone']), `American English (${(await marks()).join(', ')}; Bengaluru is a name here)`);
  await lang.selectOption('en-GB');
  await page.waitForFunction(() => [...document.querySelectorAll('.sp-back mark.sp-bad')].map((m) => m.textContent).join() === 'color,organize,lakh,prepone', null, { timeout: 20000 });
  ok(asked.includes('en-GB.aff'), 'British English: its own dictionary, fetched when chosen');
  await lang.selectOption('en-IN');
  await page.waitForFunction(() => [...document.querySelectorAll('.sp-back mark.sp-bad')].map((m) => m.textContent).join() === 'color,organize', null, { timeout: 20000 });
  ok(asked.includes('en-IN.dic'), 'English (India): the British dictionary and India’s words — lakh and prepone taken');
  await ta.fill('Bengaluru is in Karnataka. Bengalru is not.');
  await waitWords(['Bengalru']);
  ok(JSON.stringify(await marks()) === '["Bengalru"]' && (await sugg()).includes('Bengaluru'), 'India’s cities: Bengaluru taken, Bengalru → Bengaluru suggested');

  // ---------------------------------------------------------------- a long text
  const long = 'The quick brown fox jumps over the lazy dog. '.repeat(5000) + 'At the end a mistak.';
  await ta.fill(long);
  await waitWords(['mistak']);
  ok((await marks())[0] === 'mistak' && (await page.locator('.sp-counts').textContent()).includes('45,005 words'), `a text of ${long.length.toLocaleString('en')} characters: checked, its one mistake found (${await page.locator('.sp-counts').textContent()})`);
  await page.locator('.sp-sugg .sp-s').first().waitFor();
  await btn('Change').click();
  await waitMarks(0);
  ok((await ta.inputValue()).endsWith('At the end a mistake.'), 'and changed at its end');

  // ---------------------------------------------------------------- kept while the page is open; leaving the tab
  await ta.fill('Kept txet.');
  await waitWords(['txet']);
  await page.goto(`${base}#/wordcount`); await page.locator('textarea').first().waitFor();
  const live = await page.evaluate(() => globalThis.__superutilsLive());
  ok(live.workers === 0, `leaving the tab ends its worker (${JSON.stringify(live)})`);
  await page.goto(`${base}#/spell`); await ta.waitFor();
  await waitMarks(1);
  ok((await ta.inputValue()) === 'Kept txet.' && (await lang.inputValue()) === 'en-IN', 'coming back: the text and the language kept (nothing stored)');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await page.close();

  // ---------------------------------------------------------------- WCAG 2.2 A / AA, both themes
  for (const scheme of ['light', 'dark']) {
    const ax = await newPage({ viewport: { width: 1366, height: 900 }, colorScheme: scheme, bypassCSP: true });
    await ax.goto(`${base}#/spell`);
    const t = ax.getByRole('textbox', { name: 'Text to check' }); await t.waitFor({ timeout: 20000 });
    await t.fill('Teh quick brown fox.');
    await ax.locator('.sp-sugg .sp-s').first().waitFor({ timeout: 20000 });
    await ax.locator('.sp-opts summary').click();
    await ax.addScriptTag({ content: AXE });
    const vv = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!vv.length, `${scheme}: no WCAG 2.2 A / AA violations with a misspelt word and its suggestions shown ${vv.join(' | ')}`);
    await ax.close();
  }

  // ---------------------------------------------------------------- the phone
  const ph = await phoneLayout(ctx, 'spell', { ready: '.sp-text', buttons: ['Paste', 'Open a text file'], before: async (p) => {
    await p.locator('.sp-text').fill('Teh quick brown fox jumpd.');
    await p.locator('.sp-sugg .sp-s').first().waitFor({ timeout: 20000 });
  } });
  const small = await ph.$$eval('.sp-s, .sp-acts .btn, .sp-nav .btn, .sp-tools .btn, .sp-out .btn', (bs) => bs.filter((b) => b.getBoundingClientRect().width).map((b) => { const r = b.getBoundingClientRect(); return [b.textContent, Math.round(r.width), Math.round(r.height)]; }).filter(([, w, hh]) => w < 44 || hh < 44));
  ok(!small.length, `phone: suggestions and buttons are 44 px and more (${JSON.stringify(small)})`);
  const box = await ph.locator('.sp-text').boundingBox();
  ok(box && box.width > 300 && box.width <= 390, `phone: the box fills the width (${box && Math.round(box.width)} px)`);
  const bar = ph.locator('.actions');
  const bb = await bar.boundingBox();
  ok(bb && Math.round(bb.y + bb.height) === ph.viewportSize().height && JSON.stringify(await bar.locator('.btn').allTextContents()) === '["Ignore","Change","Next"]', `phone: Ignore, Change and Next in the fixed bar at the foot of the screen (${bb && Math.round(bb.y)})`);
  await bar.getByRole('button', { name: 'Change', exact: true }).click();
  await ph.waitForFunction(() => document.querySelector('.sp-text').value === 'The quick brown fox jumpd.', null, { timeout: 10000 });
  await ph.waitForFunction(() => document.querySelector('.sp-back mark.cur')?.textContent === 'jumpd', null, { timeout: 10000 });
  await ph.locator('.sp-sugg .sp-s').first().waitFor();
  await bar.getByRole('button', { name: 'Change', exact: true }).click();
  await ph.waitForFunction(() => document.querySelector('.sp-text').value === 'The quick brown fox jumped.', null, { timeout: 10000 });
  await ph.waitForFunction(() => document.querySelector('.sp-pane').textContent.includes('No spelling mistakes'), null, { timeout: 10000 });
  ok(await bar.isHidden(), 'phone: Change in the bar changes the current word; with nothing left to change, the bar goes');
};
