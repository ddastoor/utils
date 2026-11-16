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
  // print: only the preview
  await page.evaluate(() => { window.__printed = null; window.print = () => { window.__printed = document.documentElement.classList.contains('print-md'); }; });
  await page.getByRole('button', { name: 'Print / PDF' }).click();
  await page.waitForFunction(() => window.__printed !== null);
  ok(await page.evaluate(() => window.__printed) === true, 'print shows only the preview (print-md mode)');
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
