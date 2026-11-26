// make-format-docs.mjs OUT — pages of formatted documents for the OCR tab and the Photo Dictionary (to-do #18; owner,
// 26 Nov 2026: "works very poorly for a document that has formatting, rich text formatting like bullet points,
// indentation, etc., especially using the phone camera. Also improve the quality when the document has a watermark. use
// many real documents with a lot of rich text formatting"). The text is real (tests/fixtures/docs/sources.json, from
// scripts/make-doc-sources.mjs: public-domain US government guides, CC BY 4.0, MIT, CC BY-SA); the pages are laid out as
// Word (Carlito = Calibri's metrics, • ◦ ▪), Google Docs (Liberation Sans = Arial's, ● ○ ■), LibreOffice (Liberation
// Serif, ▪ – ➢), a two-column newsletter with a text box, a form with a table, a handout with ✓ / ☐ — bullets with
// hanging indents, nested and lettered lists, numbered headings, quotes, tables, columns, headers and footers — each also
// with a watermark (a diagonal CONFIDENTIAL in light grey, a red DRAFT, a name tiled across, a blue stamp), and once
// more with the same watermark as strong as printers and scanners make them (name-<watermark>-strong: CONFIDENTIAL at
// 32 % grey, DRAFT at 45 % red, the name at 28 %, a stamp in ink).
// Drawn by Chromium at A4 (794 × 1123 CSS px, × 2.5: about 240 dpi): OUT/pages/<name>.png, and OUT/pages/<name>.txt =
// the words a reader sees on the page, in reading order (from the page itself: every word drawn inside it), without the
// bullet marks and the watermark (the owner: "no need to keep bullets and indentation in the text;.. but the ocr should
// not get confused by them") — list numbers and letters are text and stay; OUT/pages/<name>.lists.json = the page's
// lists, item by item: the mark (or number, letter), the level, the words of each of its lines (to-do #31: the OCR tab
// keeps the lists). scripts/make-doc-photos.py photographs them.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(join(root, 'package.json'))('playwright');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node scripts/make-format-docs.mjs OUT'); process.exit(2); }
const SRC = JSON.parse(readFileSync(join(root, 'tests/fixtures/docs/sources.json'), 'utf8'));
const by = Object.fromEntries(SRC.map((s) => [s.id, s]));

/** a small deterministic random generator (mulberry32) */
const rand = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** a text with a word or two in bold or italic, as people write */
const rich = (s, r) => {
  const w = s.split(' ');
  if (w.length > 6 && r() < 0.6) { const i = 1 + Math.floor(r() * (w.length - 3)); w[i] = `<b>${esc(w[i])}</b>`; }
  if (w.length > 8 && r() < 0.4) { const i = 2 + Math.floor(r() * (w.length - 4)); if (!/^</.test(w[i])) w[i] = `<i>${esc(w[i])}</i>`; }
  return w.map((x) => (/^</.test(x) ? x : esc(x))).join(' ');
};
const short = (s, n) => s.split(' ').slice(0, n).join(' ').replace(/[,;:]$/, '');
/** a list: the marks are real characters in a span of their own (class bul: not in the words a reader reads); numbers
 *  and letters are text (class num). Hanging indents: lines after the first start under the text, not under the mark. */
function list(items, o = {}) {
  const lvl = o.level || 0, marks = o.marks || ['•', '◦', '▪'];
  return `<ul class="l${lvl}">${items.map((it, i) => {
    const mark = o.numbers ? `<span class="num">${o.numbers(i)}</span>` : `<span class="bul">${marks[lvl % marks.length]}</span>`;
    const text = typeof it === 'string' ? it : it.text, sub = typeof it === 'string' ? '' : it.sub || '';
    return `<li>${mark}<span class="t">${text}</span>${sub}</li>`;
  }).join('')}</ul>`;
}
const letters = (i) => `${String.fromCharCode(97 + i)}.`, numbers = (i) => `${i + 1}.`, roman = (i) => `${['i', 'ii', 'iii', 'iv', 'v', 'vi'][i]}.`;

const THEMES = {
  word: { font: "'Carlito', sans-serif", head: "'Carlito', sans-serif", size: 14.7, line: 1.16, hc: '#2f5496', marks: ['•', '◦', '▪'] },
  gdocs: { font: "'Liberation Sans', sans-serif", head: "'Liberation Sans', sans-serif", size: 14.7, line: 1.15, hc: '#000', marks: ['●', '○', '■'] },
  libre: { font: "'Liberation Serif', serif", head: "'Liberation Sans', sans-serif", size: 16, line: 1.15, hc: '#000', marks: ['▪', '–', '➢'] },
  caladea: { font: "'Caladea', serif", head: "'Carlito', sans-serif", size: 15, line: 1.2, hc: '#1f3864', marks: ['•', '–', '▪'] },
};
const css = (t, o = {}) => `
*{box-sizing:border-box;margin:0;padding:0}html,body{background:#fff}
.page{position:relative;width:794px;height:1123px;overflow:hidden;padding:${o.pad || '86px 92px'};font-family:${t.font};font-size:${o.size || t.size}px;line-height:${t.line};color:#111}
h1{font-family:${t.head};font-size:${o.h1 || 26}px;font-weight:${o.h1w || 400};color:${t.hc};margin:0 0 10px}
h2{font-family:${t.head};font-size:${o.h2 || 18.5}px;font-weight:700;color:${t.hc};margin:16px 0 6px}
h3{font-family:${t.head};font-size:15px;font-weight:700;margin:12px 0 4px}
p{margin:0 0 9px}
ul{list-style:none;margin:2px 0 8px}
li{position:relative;padding-left:${o.indent || 24}px;margin:0 0 ${o.gap || 3}px}
ul.l1{margin:3px 0 3px ${o.nest || 24}px}ul.l2{margin:3px 0 3px ${o.nest || 24}px}
.bul,.num{position:absolute;left:${o.markAt || 6}px;top:0}
.num{left:0}
blockquote{margin:6px 0 10px 28px;padding-left:12px;border-left:3px solid #bbb;color:#333}
table{border-collapse:collapse;width:100%;margin:8px 0 12px;font-size:${(o.size || t.size) - 1}px}
th,td{border:1px solid #888;padding:4px 7px;vertical-align:top;text-align:left}th{background:#e9edf3}
.hdr,.ftr{position:absolute;left:92px;right:92px;font-size:12px;color:#555;display:flex;justify-content:space-between}
.hdr{top:40px;border-bottom:1px solid #999;padding-bottom:3px}.ftr{bottom:38px;border-top:1px solid #999;padding-top:3px}
.cols{column-count:2;column-gap:30px;column-rule:1px solid #ccc}
.box{border:1.5px solid #6b7c99;background:#eef2f8;padding:10px 12px;margin:8px 0 12px;break-inside:avoid}
.kv{display:grid;grid-template-columns:160px 1fr;gap:4px 14px;margin:6px 0 12px}.kv b{font-weight:700}
.wm{position:absolute;pointer-events:none;white-space:nowrap}
`;

// ---------------------------------------------------------------------------------------------------- the pages
const DOCS = [];
const doc = (name, theme, body, o = {}) => DOCS.push({ name, theme, body, o });

// 1. a Word memo: bullets • ◦ ▪ with hanging indents, nested; numbered steps with lettered sub-steps
doc('memo', 'word', (r) => {
  const s = by.contribute, k = by.k8s;
  return `<h1>${esc(s.headings[0])}</h1><p>${rich(s.paragraphs[2], r)}</p><h2>${esc(s.headings[1])}</h2>
  ${list([rich(s.items[1], r), { text: rich(s.items[2], r), sub: list([rich(short(s.items[3], 12), r), { text: rich(short(s.items[4], 10), r), sub: list([rich(short(s.items[5], 9), r)], { level: 2 }) }], { level: 1 }) }, rich(s.items[6], r), rich(short(s.items[7], 14), r)])}
  <h2>${esc(k.headings[1] || 'Steps')}</h2>
  ${list([rich(k.items[0], r), { text: rich(k.items[1], r), sub: list([rich(short(k.items[2], 11), r), rich(short(k.items[3], 11), r), rich(short(k.items[4], 11), r)], { level: 1, numbers: letters }) }, rich(k.items[5], r), rich(k.items[6], r)], { numbers })}
  <p>${rich(s.paragraphs[5], r)}</p>`;
});
// 2. Google Docs: ● ○ ■, a checklist ☐ / ☑, a table
doc('checklist', 'gdocs', (r) => {
  const s = by.scuba, c = by.contribute;
  const rows = s.items.slice(6, 11).map((it, i) => `<tr><td>${['Planning', 'Review', 'Testing', 'Rollout', 'Support'][i]}</td><td>${['Asha', 'Ravi', 'Meera', 'Kiran', 'Dev'][i]}</td><td>${['Done', 'In progress', 'Waiting', 'Done', 'Planned'][i]}</td><td>${esc(short(it, 9))}</td></tr>`).join('');
  return `<h1 style="font-weight:700">${esc(s.headings[1])}</h1><p>${rich(s.paragraphs[0], r)}</p>
  ${list([rich(s.items[0], r), rich(s.items[1], r), { text: rich(s.items[2], r), sub: list([rich(short(s.items[3], 10), r), rich(short(s.items[4], 10), r)], { level: 1, marks: ['●', '○', '■'] }) }], { marks: ['●', '○', '■'] })}
  <h2>Checklist</h2>${list([rich(short(c.items[10], 12), r), rich(short(c.items[11], 12), r), rich(short(c.items[12], 12), r), rich(short(c.items[13], 12), r)].map((x, i) => x), { marks: ['☐'] }).replace(/☐/, '☑')}
  <table><tr><th>Phase</th><th>Owner</th><th>Status</th><th>Notes</th></tr>${rows}</table>
  <p>${rich(s.paragraphs[2], r)}</p>`;
}, { gap: 5 });
// 3. a LibreOffice report: numbered headings 1, 1.1; – and ➢ bullets; an indented quote
doc('report', 'libre', (r) => {
  const p = by.playbook, cv = by.covenant;
  return `<h1 style="font-weight:700">1 ${esc(p.headings[0])}</h1><p>${rich(p.paragraphs[0], r)}</p>
  <h2>1.1 ${esc(cv.headings[1])}</h2><p>${rich(cv.paragraphs[0], r)}</p>
  ${list([rich(cv.items[0], r), rich(cv.items[1], r), rich(cv.items[2], r), rich(cv.items[3], r)], { marks: ['–'] })}
  <h2>1.2 ${esc(cv.headings[2])}</h2>
  <blockquote>${rich(cv.paragraphs[2], r)}</blockquote>
  ${list([rich(cv.items[5], r), { text: rich(cv.items[6], r), sub: list([rich(short(cv.items[7], 10), r), rich(short(cv.items[8], 10), r)], { level: 1, numbers: roman }) }, rich(cv.items[9], r)], { marks: ['➢'] })}
  <p>${rich(p.paragraphs[2], r)}</p>`;
}, { indent: 28 });
// 4. a two-column newsletter: header and footer, a text box, bullets inside a column
doc('newsletter', 'caladea', (r) => {
  const k = by.k8s, h = by.handbook, g = by.ghformat;
  return `<div class="hdr"><span>${esc(h.headings[0])} · Newsletter</span><span>Issue 12</span></div>
  <h1 style="font-weight:700;font-size:30px;margin-top:8px">${esc(k.headings[0].replace(/ \{.*/, ''))}</h1>
  <div class="cols"><p>${rich(k.paragraphs[1], r)}</p><p>${rich(k.paragraphs[2], r)}</p>
  ${list([rich(short(k.items[7], 14), r), rich(short(k.items[8], 14), r), rich(short(k.items[9], 14), r)], { marks: ['•'] })}
  <div class="box"><b>Note.</b> ${rich(h.paragraphs[0], r)}</div>
  <p>${rich(k.paragraphs[3], r)}</p><p>${rich(g.paragraphs[1], r)}</p><p>${rich(g.paragraphs[3], r)}</p></div>
  <div class="ftr"><span>${esc(h.headings[0])}</span><span>Page 1 of 4</span></div>`;
}, { size: 14, pad: '76px 92px 70px' });
// 5. a form: labels and values, a table with lines of text in its cells, a signature line
doc('form', 'gdocs', (r) => {
  const sc = by.scuba, m = by['mdn-ul'];
  return `<h1 style="font-weight:700;text-align:center">Application Review Form</h1>
  <div class="kv"><b>Reference</b><span>AR-2026-0417</span><b>Applicant</b><span>Priya Raman</span><b>Department</b><span>Information Security</span><b>Date received</b><span>14 November 2026</span></div>
  <h2>Summary</h2><p>${rich(sc.paragraphs[1], r)}</p>
  <table><tr><th style="width:28%">Requirement</th><th>Assessment</th></tr>
  ${sc.items.slice(12, 16).map((it, i) => `<tr><td>${esc(short(sc.headings[3 + i] || 'Item', 5))}</td><td>${rich(it, r)}</td></tr>`).join('')}</table>
  <h2>Reviewer comments</h2><p>${rich(m.paragraphs[1] || m.items[0], r)}</p>
  <p style="margin-top:28px">Signature: ______________________ &nbsp; Date: ____________</p>`;
}, { size: 14 });
// 6. a handout: large type, ✓ and ➢ bullets, generous spacing
doc('handout', 'word', (r) => {
  const c = by.contribute, ru = by.rust;
  return `<h1 style="font-size:34px;font-weight:700">${esc(c.headings[4] || c.headings[0])}</h1>
  ${list([rich(short(c.items[20], 13), r), rich(short(c.items[21], 13), r), rich(short(c.items[22], 13), r), rich(short(c.items[23], 13), r)], { marks: ['✓'] })}
  <h2 style="font-size:24px">${esc(ru.headings[1])}</h2>
  ${list([rich(short(ru.paragraphs[1], 16), r), rich(short(ru.paragraphs[2], 16), r), rich(short(ru.paragraphs[3], 16), r)], { marks: ['➢'] })}
  <p>${rich(c.paragraphs[8], r)}</p>`;
}, { size: 19, gap: 10, indent: 30 });

// the watermarks: each page above once more, with one of them (not in the words a reader reads: class wm)
// (strong: as printers and scanners make them at their darkest)
const WATERMARKS = {
  confidential: (strong) => `<div class="wm" style="left:50%;top:50%;transform:translate(-50%,-50%) rotate(-54deg);font:700 112px 'Liberation Sans';color:rgba(0,0,0,${strong ? 0.32 : 0.13})">CONFIDENTIAL</div>`,
  draft: (strong) => `<div class="wm" style="left:50%;top:50%;transform:translate(-50%,-50%) rotate(-38deg);font:700 190px 'Liberation Sans';color:rgba(220,40,40,${strong ? 0.45 : 0.2})">DRAFT</div>`,
  tiled: (strong) => { let s = ''; for (let y = -200; y < 1400; y += 150) for (let x = -300; x < 1000; x += 330) s += `<div class="wm" style="left:${x}px;top:${y}px;transform:rotate(-30deg);font:400 26px 'Liberation Sans';color:rgba(0,0,0,${strong ? 0.28 : 0.12})">Asha Verma · Internal</div>`; return s; },
  stamp: (strong) => `<div class="wm" style="right:96px;top:430px;width:230px;height:230px;border:7px solid rgba(30,90,200,${strong ? 0.85 : 0.35});border-radius:50%;display:flex;align-items:center;justify-content:center;transform:rotate(-18deg);font:700 40px 'Liberation Sans';color:rgba(30,90,200,${strong ? 0.85 : 0.35})">APPROVED</div>`,
};
const WITH = { memo: 'confidential', checklist: 'draft', report: 'tiled', form: 'stamp', newsletter: 'confidential', handout: 'draft' };

async function main() {
  mkdirSync(join(OUT, 'pages'), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2.5 });
  const index = [];
  for (const [i, d] of DOCS.entries()) for (const [wm, strong] of [[null, false], [WITH[d.name], false], [WITH[d.name], true]]) {
    const t = THEMES[d.theme], r = rand(1000 + i);
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css(t, d.o)}</style></head><body><div class="page">${wm ? WATERMARKS[wm](strong) : ''}${d.body(r)}</div></body></html>`;
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    // the words a reader sees on the page, in reading order: every word drawn inside it, without bullets and watermark
    const words = await page.evaluate(() => {
      const pg = document.querySelector('.page'), pr = pg.getBoundingClientRect(), out = [];
      const walk = document.createTreeWalker(pg, NodeFilter.SHOW_TEXT);
      for (let n; (n = walk.nextNode());) {
        if (n.parentElement.closest('.bul, .wm')) continue;
        const re = /\S+/g; let m;
        while ((m = re.exec(n.textContent))) {
          const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
          const rs = rg.getClientRects(); if (!rs.length) continue;
          const b = rs[rs.length - 1];
          if (b.width > 0 && b.top >= pr.top && b.bottom <= pr.bottom - 1 && b.left >= pr.left && b.right <= pr.right) out.push(m[0]);
        }
      }
      return out;
    });
    // the lists as they stand on the page (to-do #31: the OCR tab keeps them): every item in order with its mark (or its
    // number / letter), its level and the words of each line it takes up
    const lists = await page.evaluate(() => {
      const pg = document.querySelector('.page'), pr = pg.getBoundingClientRect(), out = [];
      for (const li of pg.querySelectorAll('li')) {
        const bul = li.querySelector(':scope > .bul'), num = li.querySelector(':scope > .num'), t = li.querySelector(':scope > .t');
        const lines = [], walk = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
        for (let n; (n = walk.nextNode());) {
          const re = /\S+/g; let m;
          while ((m = re.exec(n.textContent))) {
            const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
            const b = rg.getClientRects()[0];
            if (!b || !(b.width > 0 && b.top >= pr.top && b.bottom <= pr.bottom - 1)) continue;
            let line = lines.find((l) => Math.abs(l.top - b.top) < 4);
            if (!line) lines.push((line = { top: b.top, words: [] }));
            line.words.push(m[0]);
          }
        }
        lines.sort((a, b) => a.top - b.top);
        if (lines.length) out.push({ mark: bul ? bul.textContent : null, label: num ? num.textContent : null, level: +((li.parentElement.className.match(/l(\d)/) || [0, 0])[1]), lines: lines.map((l) => l.words) });
      }
      return out;
    });
    const name = wm ? `${d.name}-${wm}${strong ? '-strong' : ''}` : d.name;
    await page.locator('.page').screenshot({ path: join(OUT, 'pages', `${name}.png`) });
    writeFileSync(join(OUT, 'pages', `${name}.txt`), words.join(' ') + '\n');
    writeFileSync(join(OUT, 'pages', `${name}.lists.json`), JSON.stringify(lists, null, 1) + '\n');
    index.push({ name, theme: d.theme, watermark: wm, strong, words: words.length });
    console.log(`${name.padEnd(26)} ${d.theme.padEnd(8)} ${words.length} words`);
  }
  writeFileSync(join(OUT, 'pages', 'index.json'), JSON.stringify(index, null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
