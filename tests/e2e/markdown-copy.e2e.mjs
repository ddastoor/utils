// Markdown Editor — "Copy with formatting" (to-do #29; owner, 26 Nov 2026: "copy the rendered markdown with formatting so
// that he can paste it in, say, another Microsoft Word or any rich text setting. so basically a 'copy with formatting'
// toggle"). The clipboard is read back in both forms: the HTML (headings, nested and numbered lists, a table with its
// borders and alignment, code in a fixed-width font, a quote, a link, task boxes as ☐ / ☑, a footnote as a superscript
// number with the note at the end, no ids) and the plain text as the document reads; LibreOffice — as Word would take it
// — turns the copied HTML into a .docx: Heading 1 – 3, list levels, the table's cells, the code's font. Off: the Markdown
// as typed. Where the browser has no ClipboardItem the page's copy event carries both. A picture from another site is
// in the copy (as the .html download has it) and is not fetched by the page.
import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from '../lib/child.mjs';
import { unzipSync, strFromU8 } from 'fflate';

const DOC = `# Title one

Intro with **bold**, *italic*, ~~gone~~, \`inline code\` and a [link](https://example.com/page).

## Section two

- item one
  - nested a
  - nested b
- item two

1. first
2. second

### Third level

> A quote here.

| Name | Score |
|:-----|------:|
| Asha | 91 |
| Ravi | 78 |

\`\`\`js
const x = 1;
\`\`\`

- [x] done task
- [ ] open task

![logo](https://example.com/logo.png)

Text with a note[^1].

[^1]: The note itself.
`;

export default async ({ base, page: newPage, ok, info, tmp, devices }) => {
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] });
  let fetchedAway = 0;
  page.on('request', (r) => { if (/example\.com/.test(r.url())) fetchedAway++; });
  await page.goto(base + '#/markdown');
  const ta = page.getByLabel('Markdown text');
  await page.locator('.md-preview h1').waitFor();
  await ta.fill(DOC); await page.waitForTimeout(150);
  const toggle = page.getByText('Copy with formatting');
  ok(await page.getByRole('checkbox', { name: 'Copy with formatting' }).isChecked(), '"Copy with formatting" is on by default');
  const clip = () => page.evaluate(async () => {
    const out = {};
    for (const item of await navigator.clipboard.read()) for (const t of item.types) out[t] = await (await item.getType(t)).text();
    return out;
  });
  await page.locator('.actions').getByRole('button', { name: 'Copy' }).click();
  await page.locator('.toast', { hasText: 'Copied with formatting' }).waitFor({ timeout: 5000 });
  const c = await clip();
  ok(typeof c['text/html'] === 'string' && typeof c['text/plain'] === 'string', `both forms on the clipboard (${Object.keys(c).join(', ')})`);
  // the HTML, read by the browser's parser
  const h = await page.evaluate((html) => {
    const d = new DOMParser().parseFromString(html, 'text/html'), q = (s) => d.querySelector(s), all = (s) => [...d.querySelectorAll(s)];
    return {
      heads: all('h1, h2, h3').map((x) => `${x.tagName}:${x.textContent}`),
      nested: all('ul > li > ul > li').map((x) => x.textContent), ol: all('ol > li').length - all('section ol > li').length,
      th: all('th').map((x) => [x.textContent, x.getAttribute('style') || '']), td: all('td').map((x) => [x.textContent, x.getAttribute('style') || '']),
      code: q('p code')?.getAttribute('style') || '', pre: q('pre')?.getAttribute('style') || '', preText: q('pre')?.textContent || '', preLang: q('pre')?.getAttribute('lang'),
      quote: q('blockquote')?.getAttribute('style') || '', link: q('a[href="https://example.com/page"]')?.textContent, del: q('del')?.getAttribute('style') || '',
      tasks: all('li').map((x) => x.textContent.trim()).filter((t) => /task/.test(t)), inputs: all('input').length,
      sup: q('sup')?.textContent, note: q('section.footnotes li')?.textContent.trim(), hrBeforeNotes: q('section.footnotes')?.previousElementSibling?.tagName,
      ids: all('[id]').length, md: /md-/.test(html), backref: !!q('a[href^="#"]'), img: q('img')?.getAttribute('src'),
    };
  }, c['text/html']);
  ok(JSON.stringify(h.heads) === JSON.stringify(['H1:Title one', 'H2:Section two', 'H3:Third level']), `headings as headings (${h.heads.join(', ')})`);
  ok(JSON.stringify(h.nested) === JSON.stringify(['nested a', 'nested b']) && h.ol === 2, 'a nested list keeps its level; a numbered list stays numbered');
  ok(h.th.length === 2 && h.td.length === 4 && h.td.every(([, s]) => /border: 1px solid/.test(s)) && /text-align: right/.test(h.th[1][1]) && /text-align: left/.test(h.th[0][1]), `the table: its cells with borders written on them, the columns' alignment (${JSON.stringify(h.th)})`);
  ok(/Consolas/.test(h.code) && /Consolas/.test(h.pre) && h.preText === 'const x = 1;\n' && h.preLang === null, 'code in a fixed-width font (inline and the block); the block\'s language is no "lang" (Word would proof it as a language)');
  ok(/border-left/.test(h.quote) && h.link === 'link' && /line-through/.test(h.del), 'the quote\'s bar, the link, the strike-through — written on the elements');
  ok(JSON.stringify(h.tasks) === JSON.stringify(['☑ done task', '☐ open task']) && h.inputs === 0, `task boxes as ☑ / ☐ (${h.tasks.join(' | ')})`);
  ok(h.sup === '1' && h.note === 'The note itself.' && h.hrBeforeNotes === 'HR' && !h.backref, 'the footnote: a superscript number, the note at the end after a rule, no links inside the document');
  ok(h.ids === 0 && !h.md, 'no ids (the preview\'s "md-" ones least of all)');
  ok(h.img === 'https://example.com/logo.png' && fetchedAway === 0, `the picture from another site is in the copy, as the .html has it — and the page fetched nothing from there (${fetchedAway})`);
  // the plain text: as the document reads
  const t = c['text/plain'];
  ok(/^Title one\n/.test(t) && /Intro with bold, italic, gone, inline code and a link\./.test(t) && /nested a/.test(t) && /☑ done task/.test(t) && /Asha\t91/.test(t) && /The note itself\./.test(t) && !/[*#`]/.test(t.replace(/const x = 1;/, '')), `the plain text reads as the document (${JSON.stringify(t.slice(0, 120))}…)`);
  // LibreOffice — as Word would take it — makes a .docx of the copied HTML
  const lo = spawnSync('soffice', ['--version'], { encoding: 'utf8' });
  if (lo.error || lo.status !== 0) ok(true, 'LibreOffice not installed: the .docx check is skipped (apt install libreoffice-writer)');
  else {
    const dir = join(tmp, 'mdcopy'); writeFileSync(join(tmp, 'copied.html'), c['text/html']);
    const r = spawnSync('soffice', ['--headless', `-env:UserInstallation=file://${join(tmp, 'lo-profile').replace(/\\/g, '/')}`, '--convert-to', 'docx:MS Word 2007 XML', '--outdir', dir, join(tmp, 'copied.html')], { encoding: 'utf8', timeout: 120000 });
    const f = (() => { try { return readdirSync(dir).find((n) => n.endsWith('.docx')); } catch { return null; } })();
    if (!f) ok(false, `LibreOffice made no .docx: ${r.stderr || r.stdout}`);
    else {
      const x = strFromU8(unzipSync(readFileSync(join(dir, f)))['word/document.xml']);
      const styles = [...x.matchAll(/<w:pStyle w:val="([^"]+)"/g)].map((m) => m[1]);
      ok(['Heading1', 'Heading2', 'Heading3'].every((s) => styles.includes(s)), `Word's Heading 1 – 3 styles (${[...new Set(styles)].join(', ')})`);
      ok(/<w:ilvl w:val="1"\/>/.test(x), 'the nested items at list level 2 (w:ilvl 1)');
      const cells = (x.match(/<w:tc>/g) || []).length;
      ok(/<w:tbl>/.test(x) && cells === 6 && /Asha/.test(x), `the table with its 6 cells (${cells})`);
      ok(/w:ascii="(Consolas|Courier New|Liberation Mono)/.test(x), 'the code in a fixed-width font');
      info(`LibreOffice paragraph styles: ${[...new Set(styles)].join(', ')}`);
    }
  }
  // off: the Markdown as typed
  await toggle.click();
  await page.locator('.actions').getByRole('button', { name: 'Copy' }).click();
  await page.waitForTimeout(300);
  const off = await clip();
  ok(off['text/plain'] === DOC && !off['text/html'], `"Copy with formatting" off: the Markdown as typed, no HTML (${Object.keys(off).join(', ')})`);
  // kept while the page is open: off after leaving the tab and coming back
  await page.goto(base + '#/'); await page.goto(base + '#/markdown'); await page.locator('.md-preview h1').waitFor();
  ok(!(await page.getByRole('checkbox', { name: 'Copy with formatting' }).isChecked()), 'the choice is kept while the page is open');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // a browser without ClipboardItem: the copy event carries both forms
  const old = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] });
  await old.addInitScript(() => { delete window.ClipboardItem; });
  await old.goto(base + '#/markdown'); await old.locator('.md-preview h1').waitFor();
  await old.getByLabel('Markdown text').fill('# Hello\n\n**bold**\n'); await old.waitForTimeout(150);
  await old.locator('.actions').getByRole('button', { name: 'Copy' }).click();
  await old.waitForTimeout(300);
  const o = await old.evaluate(async () => { const out = {}; for (const item of await navigator.clipboard.read()) for (const t of item.types) out[t] = await (await item.getType(t)).text(); return out; });
  ok(/<h1>Hello<\/h1>/.test(o['text/html'] || '') && /<strong>bold<\/strong>/.test(o['text/html'] || '') && /^Hello\n/.test(o['text/plain'] || ''), `without ClipboardItem: both forms through the copy event (${Object.keys(o).join(', ')})`);

  // phones: the Copy button in the bar
  const ph = await newPage(devices['iPhone 13']);
  await ph.goto(base + '#/markdown'); await ph.getByLabel('Markdown text').waitFor();
  ok(await ph.locator('.actions').getByRole('button', { name: 'Copy' }).isVisible() && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: Copy in the bar, no sideways scroll');
};
