// Markdown Editor (#/markdown): live GFM preview (cmark-gfm wasm), toolbar, shortcuts, open/download, standalone HTML,
// print of the preview only, safety against pasted HTML/scripts, phone Write/Preview switch.
import { readFileSync, writeFileSync } from 'node:fs';
export default async ({ base, page: newPage, ok, download, tmp, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/markdown');
  const ta = page.getByLabel('Markdown text'), pv = page.locator('.md-preview');
  await pv.locator('h1').waitFor();
  ok(/Markdown Editor/.test(await pv.locator('h1').textContent()) && await pv.locator('table').count() === 1, 'sample document rendered (heading, table)');
  const set = async (s) => { await ta.fill(s); await page.waitForTimeout(80); };
  await set('# Hello\n\n**bold** ~~old~~ www.example.com\n\n- [x] done\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nNote[^1]\n\n[^1]: Foot.');
  ok(await pv.locator('h1').textContent() === 'Hello', 'heading');
  ok(await pv.locator('strong').textContent() === 'bold' && await pv.locator('del').textContent() === 'old', 'bold and strikethrough');
  ok(await pv.locator('a[href="http://www.example.com"]').getAttribute('target') === '_blank' && /noopener/.test(await pv.locator('a[href="http://www.example.com"]').getAttribute('rel')), 'autolink opens in a new tab with noopener');
  ok(await pv.locator('input[type=checkbox][checked]').count() === 1, 'task list');
  ok(await pv.locator('td').count() === 2 && await pv.locator('.footnotes').count() === 1, 'table and footnote');
  ok(/\d+ words · \d+ characters · \d+ min read/.test(await page.locator('.md-top .muted.small').textContent()), 'word count and reading time');
  // pasted HTML / scripts never run or render
  await set('<script>window.__x=1</script>\n<img src=x onerror="window.__x=2">\n\n[click](javascript:window.__x=3)');
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => window.__x) === undefined && await pv.locator('script, img').count() === 0, 'raw HTML and script are not rendered');
  ok(!(await pv.innerHTML()).includes('javascript:'), 'javascript: link removed');
  // toolbar + shortcuts on a selection
  await set('make me bold');
  await ta.evaluate((e) => e.setSelectionRange(8, 12));
  await page.getByRole('button', { name: 'Bold (Ctrl+B)' }).click();
  ok(await ta.inputValue() === 'make me **bold**', 'toolbar Bold wraps the selection');
  await ta.evaluate((e) => e.setSelectionRange(0, 4)); await ta.press('Control+i');
  ok(await ta.inputValue() === '*make* me **bold**', 'Ctrl+I makes italic');
  await set('one\ntwo'); await ta.evaluate((e) => e.setSelectionRange(0, 7));
  await page.getByRole('button', { name: 'Numbered list' }).click();
  ok(await ta.inputValue() === '1. one\n2. two', 'numbered list on selected lines');
  await page.getByRole('button', { name: 'Table' }).click();
  ok(await pv.locator('table').count() === 1, 'table inserted');
  // smart quotes option
  await set('"quoted" -- dash'); ok((await pv.textContent()).includes('“quoted” – dash'), 'smart quotes on by default');
  await page.getByText('Smart quotes').click(); ok((await pv.textContent()).includes('"quoted" -- dash'), 'smart quotes can be turned off');
  // open / download .md / .html
  const file = `${tmp}/notes.md`; writeFileSync(file, '# My notes\n\nKeep *this*.\n');
  await page.locator('input[type=file]').setInputFiles(file);
  await page.waitForFunction(() => document.querySelector('.md-preview h1')?.textContent === 'My notes');
  ok(await ta.inputValue() === '# My notes\n\nKeep *this*.\n', 'opened a .md file');
  const fmd = await download(page, () => page.getByRole('button', { name: 'Download .md' }).click());
  ok(/notes\.md$/.test(fmd) && readFileSync(fmd, 'utf8') === '# My notes\n\nKeep *this*.\n', 'downloaded .md is the text');
  const fhtml = await download(page, () => page.getByRole('button', { name: 'Download .html' }).click()), html = readFileSync(fhtml, 'utf8');
  ok(/^<!doctype html>/.test(html) && /<title>My notes<\/title>/.test(html) && /<em>this<\/em>/.test(html) && /<style>/.test(html), 'standalone .html with title, content and styles');
  // print (the button, Ctrl+P or the menu: the browser's beforeprint / afterprint): only the preview
  await page.evaluate(() => { window.__printed = null; window.print = () => { dispatchEvent(new Event('beforeprint')); window.__printed = document.documentElement.classList.contains('print-md'); dispatchEvent(new Event('afterprint')); }; });
  await page.getByRole('button', { name: 'Print / PDF' }).click();
  await page.waitForFunction(() => window.__printed !== null);
  ok(await page.evaluate(() => window.__printed) === true && !(await page.evaluate(() => document.documentElement.classList.contains('print-md'))), 'print shows only the preview (print-md while printing, gone after)');
  ok(await page.evaluate(() => { dispatchEvent(new Event('beforeprint')); const on = document.documentElement.classList.contains('print-md'); dispatchEvent(new Event('afterprint')); return on; }), 'printing from the browser (Ctrl+P) also prints the preview only (it printed the whole app)');
  // links inside the document scroll the preview; the address stays (#fn-1 took the app to its start page, the text was lost)
  await set('Read the note[^1] or [the end](#the-end).\n\n' + 'filler\n\n'.repeat(80) + '## The end\n\nDone.\n\n[^1]: The note.');
  await page.waitForTimeout(150);
  await pv.locator('a[href="#fn-1"]').click();
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => location.hash) === '#/markdown' && /Read the note/.test(await ta.inputValue()), `a footnote link keeps the tab and the text (${await page.evaluate(() => location.hash)})`);
  // (the preview scrolls smoothly: wait until the target is inside the pane — one at the very end cannot reach its top)
  const inView = (sel) => page.waitForFunction((q) => { const v = document.querySelector('.md-view').getBoundingClientRect(), e = document.querySelector(q)?.getBoundingClientRect(); return !!e && e.top >= v.top - 2 && e.bottom <= v.bottom + 2; }, sel, { timeout: 4000 }).then(() => true, () => false);
  ok(await inView('.md-preview [id="md-fn-1"]'), 'and scrolls the preview to the note');
  await page.locator('.md-view').evaluate((e) => (e.scrollTop = 0)); await page.waitForTimeout(100);
  await pv.locator('a[href="#the-end"]').click(); await page.waitForTimeout(600);
  ok(await page.evaluate(() => location.hash) === '#/markdown' && await inView('.md-preview h2'), 'a link to a heading (GitHub\'s ids) scrolls to it');
  // Ctrl+K in the editor inserts a link and keeps the focus (the app's own Ctrl+K moved it to the search box)
  await set('site'); await ta.evaluate((e) => e.setSelectionRange(0, 4)); await ta.press('Control+k');
  ok(await ta.inputValue() === '[site](https://)' && await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Markdown text', `Ctrl+K: a link, the focus stays in the editor (${await page.evaluate(() => document.activeElement?.className)})`);
  // a second press takes the formatting off; Ctrl+Z undoes a button
  await set('make me **bold**'); await ta.evaluate((e) => e.setSelectionRange(10, 14)); await ta.press('Control+b');
  ok(await ta.inputValue() === 'make me bold', `Ctrl+B on bold text takes the bold off (${await ta.inputValue()})`);
  await ta.press('Control+z');
  ok(await ta.inputValue() === 'make me **bold**', `Ctrl+Z undoes it (${await ta.inputValue()})`);
  await set('***x***'); await ta.evaluate((e) => e.setSelectionRange(3, 4)); await ta.press('Control+i');
  ok(await ta.inputValue() === '**x**', `italic off a bold italic word leaves it bold (${await ta.inputValue()})`);
  await set('*x*'); await ta.evaluate((e) => e.setSelectionRange(0, 3)); await page.getByRole('button', { name: 'Italic (Ctrl+I)' }).click();
  ok(await ta.inputValue() === 'x', `italic off a selection that includes its stars (${await ta.inputValue()})`);
  await set('one\n\ntwo'); await ta.evaluate((e) => e.setSelectionRange(0, 8));
  await page.getByRole('button', { name: 'Numbered list' }).click();
  ok(await ta.inputValue() === '1. one\n\n2. two', `a numbered list skips empty lines (${JSON.stringify(await ta.inputValue())})`);
  await page.getByRole('button', { name: 'Numbered list' }).click();
  ok(await ta.inputValue() === 'one\n\ntwo', 'a second press takes the numbers off');
  await set('# A\nB'); await ta.evaluate((e) => e.setSelectionRange(0, 5)); await page.getByRole('button', { name: 'Heading' }).click();
  ok(await ta.inputValue() === '## A\n## B', `Heading: every line a level-2 heading (${JSON.stringify(await ta.inputValue())})`);
  await page.getByRole('button', { name: 'Heading' }).click();
  ok(await ta.inputValue() === 'A\nB', 'and off again');
  // pictures from other places are not fetched (the page loads nothing from other sites); a note says so
  await page.evaluate(() => { window.__csp = 0; document.addEventListener('securitypolicyviolation', () => window.__csp++); });
  await set('![logo](https://example.com/logo.png) and ![dot](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==)');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => window.__csp) === 0 && await pv.locator('.md-img').textContent() === '🖼 logo' && await pv.locator('img').count() === 1, `a picture from elsewhere is a note, an embedded one is shown; nothing was fetched (${await page.evaluate(() => window.__csp)} blocked requests)`);
  ok(/A picture from another place is not shown here/.test(await page.locator('.md-view').textContent()), 'the preview says why');
  // the words a reader sees
  await set('[a link](https://example.com/very/long/path/with/many/parts)');
  await page.waitForTimeout(100);
  ok(/^2 words · /.test(await page.locator('.md-top .muted.small').textContent()), `words of the rendered text, not of the address (${await page.locator('.md-top .muted.small').textContent()})`);
  await set('');
  ok(await page.locator('.md-top .muted.small').textContent() === '0 words · 0 characters', 'an empty text: no reading time (it said 1 min)');
  // the .html: GitHub's heading ids, footnote ids as they are, a setext heading as the title
  await set('Big title\n=========\n\n## What works\n\nNote[^1]\n\n[^1]: x');
  const h2 = readFileSync(await download(page, () => page.getByRole('button', { name: 'Download .html' }).click()), 'utf8');
  ok(/<title>Big title<\/title>/.test(h2) && /<h2 id="what-works">What works<\/h2>/.test(h2) && /id="fn-1"/.test(h2) && !/md-/.test(h2.split('<body>')[1]), 'the .html: the setext heading is the title, headings have GitHub\'s ids, footnote ids unprefixed');
  // a Windows-1252 .md; Ctrl+Z brings the text before back; a file dropped on the editor is opened
  const w = `${tmp}/w.md`; writeFileSync(w, Buffer.from('# Caf\xe9\r\n\r\nNa\xefve\r\n', 'latin1'));
  await set('before');
  await page.locator('input[type=file]').setInputFiles(w);
  await page.waitForFunction(() => document.querySelector('.md-preview h1')?.textContent === 'Café');
  ok(await ta.inputValue() === '# Café\n\nNaïve\n' && await page.locator('.toast', { hasText: 'read as Windows-1252' }).count() >= 1, 'a Windows-1252 file: café, not caf\uFFFD; line ends as LF');
  await ta.press('Control+z');
  ok(await ta.inputValue() === 'before', 'Ctrl+Z brings back the text before the file');
  await ta.evaluate((e) => { const dt = new DataTransfer(); dt.items.add(new File(['# Dropped\n'], 'dropped.md', { type: 'text/markdown' })); e.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); });
  await page.waitForFunction(() => document.querySelector('.md-preview h1')?.textContent === 'Dropped', null, { timeout: 5000 });
  ok(true, 'a .md dropped on the editor is opened');
  // a long text is rendered when the typing pauses
  await set('# Long\n\n' + 'word '.repeat(60000));
  await page.waitForFunction(() => document.querySelector('.md-preview h1')?.textContent === 'Long', null, { timeout: 5000 });
  ok(/60,001 words/.test(await page.locator('.md-top .muted.small').textContent()), `300 KB: rendered after the pause (${await page.locator('.md-top .muted.small').textContent()})`);
  // leaving the tab: printing elsewhere is the page's own again
  await page.goto(base + '#/');
  ok(!(await page.evaluate(() => { dispatchEvent(new Event('beforeprint')); return document.documentElement.classList.contains('print-md'); })), 'after leaving the tab, printing is not the preview\'s');
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);
  // phone: Write / Preview
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/markdown');
  await phone.getByLabel('Markdown text').waitFor();
  ok(await phone.locator('.md-view').isHidden(), 'phone: writing view first');
  await phone.getByRole('radio', { name: 'Preview' }).click();
  ok(await phone.locator('.md-view').isVisible() && await phone.getByLabel('Markdown text').isHidden(), 'phone: preview view');
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
