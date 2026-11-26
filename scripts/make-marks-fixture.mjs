// make-marks-fixture.mjs — tests/fixtures/ocr/marks.jpg and marks.json for imgproc's p_clear_marks (to-do #18; owner,
// 26 Nov 2026: "no need to keep bullets and indentation in the text;.. but the ocr should not get confused by them").
// A page drawn by Chromium: list marks of every kind (● ○ ■ ▪ ◆ ► □ ☐ ☑ ☒, Word's "o" after a tab), a table with its
// grid, an underline — and what looks like a mark but is text and must stay: the Spanish word "o" after a word space, a
// roman numeral "i.", a colon, the dot of an i, the letter o inside words, a bullet between two words (a separator, not
// a list), a degree sign. marks.json: the box (px of the picture) of every mark that must go and of everything that must
// stay. Run by hand: node scripts/make-marks-fixture.mjs (the JPEG — a camera's format, its artefacts too — and the JSON
// are committed).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(join(root, 'package.json'))('playwright');
const out = join(root, 'tests/fixtures/ocr');
const SCALE = 1.5;
// g: must go (a list mark); k: must stay (text)
const li = (mark, text, indent = 0, gap = 14) => `<div class="li" style="padding-left:${24 + indent}px"><span class="g" style="margin-right:${gap}px">${mark}</span>${text}</div>`;
const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; background: #fff; }
  .page { width: 560px; padding: 28px 30px; font: 16px/1.45 'Liberation Sans', Arial, sans-serif; color: #111; }
  .li { margin: 2px 0; }
  .g, .k { display: inline-block; }
  .w { font-family: 'Courier New', 'Liberation Mono', monospace; }
  table { border-collapse: collapse; margin: 10px 0 8px; }
  td, th { border: 1px solid #777; padding: 3px 9px; text-align: left; font-weight: normal; }
  u { text-decoration-thickness: 1px; }
</style></head><body><div class="page">
  <div>Lists in documents mark their items:</div>
  ${li('●', 'a solid round bullet before the first item')}
  ${li('○', 'a ring for the second level of a list', 24)}
  ${li('■', 'a square bullet on the third level', 48)}
  ${li('▪', 'a small square, as Word draws it')}
  ${li('◆', 'a diamond, as some templates draw it')}
  ${li('►', 'an arrowhead pointing at the item')}
  ${li('□', 'an empty square for an open question')}
  ${li('☐', 'a box to tick in a checklist')}
  ${li('☑', 'a box with its tick, a task done')}
  ${li('☒', 'a box with a cross, a task dropped')}
  ${li('<span class="w">o</span>', 'the letter o in Courier, Word second level', 24, 34)}
  <div style="margin-top:8px">Text that only looks like a mark stays:</div>
  <div style="padding-left:24px"><span class="k">o</span> bien uno <span class="k">o</span> bien dos, dice el texto</div>
  <div style="padding-left:24px"><span class="k">i.</span> the first point, numbered as a roman numeral</div>
  <div style="padding-left:24px"><span class="k">:</span> a colon that opens a line, then the words</div>
  <div style="padding-left:24px">Home <span class="k">•</span> About <span class="k">•</span> Contact, a separator in a line</div>
  <div style="padding-left:24px">It was <span class="k">30°</span> in the shade, <span class="k">o</span>ne day in June</div>
  <table><tr><th>Phase</th><th>Owner</th><th>Status</th></tr><tr><td>Planning</td><td>Asha</td><td>Done</td></tr><tr><td>Review</td><td>Ravi</td><td>Waiting</td></tr></table>
  <div>A line with <u>underlined words</u> in it.</div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 620, height: 900 }, deviceScaleFactor: SCALE });
await page.setContent(HTML, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
const boxes = await page.evaluate((S) => {
  const pg = document.querySelector('.page').getBoundingClientRect(), r = (el) => { const b = el.getBoundingClientRect(); return [Math.round((b.left - pg.left) * S), Math.round((b.top - pg.top) * S), Math.round(b.width * S), Math.round(b.height * S)]; };
  return {
    go: [...document.querySelectorAll('.g')].map((e) => ({ text: e.textContent, box: r(e) })),
    keep: [...document.querySelectorAll('.k')].map((e) => ({ text: e.textContent, box: r(e) })),
    rules: [...document.querySelectorAll('td, th')].map((e) => ({ text: e.textContent, box: r(e) })),
  };
}, SCALE);
mkdirSync(out, { recursive: true });
await page.locator('.page').screenshot({ path: join(out, 'marks.jpg'), type: 'jpeg', quality: 88 });
writeFileSync(join(out, 'marks.json'), JSON.stringify({ scale: SCALE, ...boxes }, null, 1) + '\n');
console.log(`marks.jpg: ${boxes.go.length} marks, ${boxes.keep.length} look-alikes, ${boxes.rules.length} table cells`);

// columns.jpg: a page of two columns of text under a heading across both (a newsletter) — counted as two columns, and
// read column by column (src/lib/readpage.ts); its words in reading order in columns.txt
const para = (n) => ['Kubernetes is a portable, extensible, open source platform for managing containerized workloads and services, that facilitates both declarative configuration and automation.',
  'It has a large, rapidly growing ecosystem. Kubernetes services, support, and tools are widely available, and the name originates from Greek, meaning helmsman or pilot.',
  'Containers are a good way to bundle and run your applications. In a production environment, you need to manage the containers that run the applications and ensure that there is no downtime.',
  'That is how Kubernetes comes to the rescue: it provides you with a framework to run distributed systems resiliently, takes care of scaling and failover, and provides deployment patterns.'][n];
await page.setViewportSize({ width: 760, height: 700 });
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; background: #fff; } .page { width: 700px; padding: 26px 30px; font: 15px/1.45 'Liberation Serif', serif; color: #111; }
  h1 { font: 700 24px 'Liberation Sans', sans-serif; margin: 0 0 12px; } .cols { column-count: 2; column-gap: 36px; text-align: justify; } p { margin: 0 0 9px; }
</style></head><body><div class="page"><h1>Why you need Kubernetes</h1><div class="cols"><p>${para(0)}</p><p>${para(1)}</p><p>${para(2)}</p><p>${para(3)}</p><p>${para(0)}</p><p>${para(1)}</p></div></div></body></html>`, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.locator('.page').screenshot({ path: join(out, 'columns.jpg'), type: 'jpeg', quality: 88 });
writeFileSync(join(out, 'columns.txt'), ['Why you need Kubernetes', para(0), para(1), para(2), para(3), para(0), para(1)].join(' ') + '\n');
console.log('columns.jpg: a heading over two columns');
await browser.close();
