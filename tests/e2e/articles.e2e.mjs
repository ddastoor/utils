// Articles → Kindle (#/articles, PC + phones; potentials #106): the tab end to end on the saved pages of
// tests/fixtures/articles (scripts/make-article-pages.py; Chrome's own MHTML by scripts/make-article-mhtml.mjs). The
// article it finds is held to Mozilla's Readability.js — Firefox's Reader View, run here in the browser's own DOM on the
// same page — and to what is known about each page; the EPUB it makes is read back in Node: its chapters, contents and
// pictures (WebP and SVG drawn again, a large picture made smaller, the rest byte for byte), MuPDF reads every sentence
// in order, and the W3C's epubcheck finds nothing (where installed). A folder saved "complete", a pasted selection, a
// page that is no article, the whole-page switch, "Read it here" (the EPUB Reader), leaving the tab, the phone.
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { execFileSync } from '../lib/child.mjs';
import { phoneLayout } from './_phone.mjs';

const F = (n) => fileURLToPath(new URL(`../fixtures/articles/${n}`, import.meta.url));
const TRUTH = JSON.parse(readFileSync(F('index.json'), 'utf8'));
const READABILITY = readFileSync(fileURLToPath(new URL('../../node_modules/@mozilla/readability/Readability.js', import.meta.url)), 'utf8');
const jar = process.env.EPUBCHECK || ['/opt/epubcheck', '/opt/epubcheck-dl'].flatMap((d) => (existsSync(d) ? readdirSync(d).map((x) => `${d}/${x}/epubcheck.jar`).concat(`${d}/epubcheck.jar`) : [])).find((x) => existsSync(x));
const java = (() => { try { execFileSync('java', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const norm = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const words = (s) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
const f1 = (a, b) => { const A = new Map(); for (const x of a) A.set(x, (A.get(x) || 0) + 1); let n = 0; for (const x of b) { const k = A.get(x) || 0; if (k) { n++; A.set(x, k - 1); } } const p = n / Math.max(1, b.length), r = n / Math.max(1, a.length); return p + r ? (2 * p * r) / (p + r) : 0; };
/** A JPEG's or PNG's size in pixels. */
function size(b) {
  if (b[0] === 0x89 && b[1] === 0x50) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b[0] === 0x47 && b[1] === 0x49) return [b.readUInt16LE(6), b.readUInt16LE(8)];
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xff) { i++; continue; }
    const mk = b[i + 1], len = b.readUInt16BE(i + 2);
    if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return [0, 0];
}

export default async ({ base, page: newPage, ok, download, devices, released }) => {
  const m = await import('mupdf');
  const page = await newPage({ viewport: { width: 1366, height: 900 } });
  const fetched = [];
  page.on('request', (r) => fetched.push(r.url()));
  await page.goto(base + '#/articles');
  await page.getByRole('button', { name: 'Make EPUB' }).waitFor();
  await page.waitForTimeout(400);
  ok(!fetched.some((u) => /\.wasm($|\?)/.test(u)), 'nothing heavy fetched before a page is chosen (the engine comes with the first page)');
  const items = () => page.locator('.art-item');
  const add = async (files, n) => { await page.locator('input[type=file]').first().setInputFiles(files); await items().nth(n - 1).waitFor({ timeout: 60000 }); await page.waitForTimeout(200); };
  const preview = async (k) => {
    const it = items().nth(k), det = it.locator('details.art-details');
    if (!(await det.evaluate((d) => d.open))) await it.locator('details.art-details > summary').click();
    await it.locator('.art-preview > *').first().waitFor();
    // the article as the preview shows it, without the title and the line under it that the tab puts on top
    return it.locator('.art-preview').evaluate((el) => [...el.children].slice(2).map((c) => c.innerText).join('\n'));
  };

  // ---- three pages saved three ways: Chrome's MHTML, Safari's web archive, HTML only (Windows-1252)
  await add([F('news.mhtml'), F('blog.webarchive'), F('fr.html')], 3);
  ok(fetched.some((u) => /article[^/]*\.wasm/.test(u)), 'the engine (article.wasm) came with the first page');
  const titles = await page.locator('.art-head input').evaluateAll((els) => els.map((e) => e.value));
  ok(JSON.stringify(titles) === JSON.stringify([TRUTH.news.title, TRUTH.blog.title, TRUTH.fr.title]), `the three articles listed by their titles, in the order chosen (${titles.join(' | ')})`);
  const metas = await items().evaluateAll((els) => els.map((e) => e.querySelector(':scope > .muted').textContent));
  ok(/^Priya Sharma · The Coastal Gazette · 20 November 2026 · \d+ min read · 2 of 3 pictures · news\.mhtml$/.test(metas[0]), `news (MHTML): author, site, date, reading time, the pictures saved, the file (${metas[0]})`);
  ok(/^Anika Rao · Ferris Notes · 5 October 2026 · \d+ min read · 5 of 5 pictures · blog\.webarchive$/.test(metas[1]), `blog (web archive): the same (${metas[1]})`);
  ok(/^Claire Dubois · Le Journal du Littoral · 14 September 2026 · \d+ min read · 0 of 1 picture · fr\.html$/.test(metas[2]), `fr (HTML only): the same (${metas[2]})`);
  const tips = await items().evaluateAll((els) => els.map((e) => [...e.querySelectorAll('.art-tip')].map((t) => t.textContent).join(' | ')));
  ok(/2 of 3 pictures were saved with the page/.test(tips[0]) && /A video or embedded post is a link in the book/.test(tips[0]), `news: the picture not saved and the video said (${tips[0]})`);
  ok(/saved as HTML only\) — save it as a single file \(\.mhtml\) or a web archive/.test(tips[2]), `fr: how to keep the pictures (${tips[2]})`);
  ok((await page.getByRole('textbox', { name: 'The book’s title' }).inputValue()).startsWith('Articles — ') && (await page.getByRole('textbox', { name: 'Author' }).inputValue()) === 'Priya Sharma, Anika Rao, Claire Dubois', 'the book’s title and author follow the articles');

  // ---- the same article as Firefox's Reader View: Mozilla's Readability.js in the browser's DOM, on the same pages
  // (in a blank page of its own: the tab's Content-Security-Policy refuses a script that is not the site's)
  const refPage = await newPage();
  await refPage.setContent('<!DOCTYPE html><html><body></body></html>');
  await refPage.addScriptTag({ content: READABILITY });
  for (const [k, n] of [['news', 0], ['blog', 1], ['fr', 2]]) {
    const html = new TextDecoder(k === 'fr' ? 'windows-1252' : 'utf-8').decode(readFileSync(F(`${k}.html`)));
    // its article as a page shows it (innerText: blocks and cells apart), its pictures and frames left out (nothing fetched)
    const ref = await refPage.evaluate((h) => {
      const a = new Readability(new DOMParser().parseFromString(h, 'text/html')).parse();
      const d2 = new DOMParser().parseFromString(a?.content || '', 'text/html');
      d2.querySelectorAll('img, picture, source, iframe, video, audio, object, embed').forEach((x) => x.remove());
      const div = document.createElement('div');
      div.append(...[...d2.body.childNodes].map((x) => document.importNode(x, true)));
      document.body.append(div);
      const t = div.innerText; div.remove(); return t;
    }, html);
    const ours = await preview(n);
    // every word Firefox keeps, we keep; and what we keep beyond it is only what is named here: the
    // embedded video written as a link, the code block under "md:hidden" (dom_smoothie 0.19's fix, #226) and the heading
    // with a "scroll-…" class (0.20's, #250) that Readability.js drops
    const EXTRA = { news: ['embedded', 'www', 'youtube', 'nocookie', 'com'], blog: ['recording', 'a', 'profile', 'fn', 'main', 'let', 'map', 'build', 'once', 'serve'], fr: [] }[k];
    const R = words(ref), O = words(ours), cnt = (x) => { const c = new Map(); for (const w of x) c.set(w, (c.get(w) || 0) + 1); return c; }, CR = cnt(R), CO = cnt(O);
    const glued = (w) => O.some((_, i) => { let s2 = ''; for (let j = i; j < Math.min(O.length, i + 10); j++) { s2 += O[j]; if (s2 === w && j > i) return true; if (!w.startsWith(s2)) return false; } return false; });
    const lost = [...CR].filter(([w, c]) => c > (CO.get(w) || 0) && !glued(w)).map(([w]) => w);
    const more = [...CO].filter(([w, c]) => c > (CR.get(w) || 0) && !EXTRA.includes(w)).map(([w]) => w);
    ok(!lost.length && !more.length, `${k}: the article Firefox’s Reader View (Readability.js 0.6.0) finds — every word of it (F1 ${f1(R, O).toFixed(3)}), and beyond it only what is named ${lost.length ? `lost: ${lost.join(' ')}` : ''} ${more.length ? `more: ${more.join(' ')}` : ''}`);
    const txt = norm(ours);
    let at = 0; const missing = [];
    for (const x of TRUTH[k].sentences) { const p = txt.indexOf(norm(x), at); if (p < 0) missing.push(x.slice(0, 30)); else at = p + norm(x).length; }
    ok(!missing.length, `${k}: the preview holds every sentence of the article in order ${missing.join(' | ')}`);
    ok(!TRUTH[k].not.some((x) => txt.toLowerCase().includes(x.toLowerCase())), `${k}: and nothing of the page around it`);
  }
  const pv = await items().nth(0).locator('.art-preview img').evaluateAll((els) => els.map((e) => e.src));
  ok(pv.length === 2 && pv.every((u) => u.startsWith('blob:')), `news: the preview shows the two saved pictures from the saved file itself (${pv.length})`);
  const links = await items().nth(0).locator('.art-preview a[href^="http"]').evaluateAll((els) => els.map((e) => [e.target, e.rel]));
  ok(links.length && links.every(([t, r]) => t === '_blank' && /noopener/.test(r)), 'the preview’s links open in a new tab, with noopener');

  // ---- the order: move the third article up, then back
  await items().nth(2).getByRole('button', { name: 'Move article 3 up' }).click();
  ok(JSON.stringify(await page.locator('.art-head input').evaluateAll((els) => els.map((e) => e.value))) === JSON.stringify([TRUTH.news.title, TRUTH.fr.title, TRUTH.blog.title]), 'an article moved up');
  await items().nth(1).getByRole('button', { name: 'Move article 2 down' }).click();

  // ---- the EPUB
  const make = async () => {
    await page.getByRole('button', { name: 'Make EPUB' }).click();
    await page.getByRole('button', { name: 'Download EPUB' }).waitFor({ timeout: 120000 });
    const f = await download(page, () => page.getByRole('button', { name: 'Download EPUB' }).click());
    const z = unzipSync(new Uint8Array(readFileSync(f)));
    return { f, z, text: (k) => strFromU8(z[k]), said: await page.locator('.tool-body .note-ok').last().innerText() };
  };
  let r = await make();
  ok(r.f.endsWith('Articles-27-November-2026.epub'), `saved under the book’s title (${r.f.split(/[\\/]/).pop()})`);
  ok(/: \d+ KB · 3 articles · [\d,]+ words \(about \d+ minutes of reading\) · 7 pictures \(2 not saved with the pages\)/.test(r.said), `the result says what is in the book (${r.said})`);
  const opf = r.text('OEBPS/content.opf');
  ok(JSON.stringify([...opf.matchAll(/<itemref idref="([^"]+)"\/>/g)].map((x) => x[1])) === JSON.stringify(['contents', 'a01', 'a02', 'a03']), 'the contents page, then the three articles in their order');
  const ch = (k) => r.text(`OEBPS/a0${k}.xhtml`), pics = (k) => [...ch(k).matchAll(/<img src="([^"]+)"/g)].map((x) => Buffer.from(r.z[`OEBPS/${x[1]}`]));
  const site = (n) => readFileSync(F(`complete/${n}`));
  const news = pics(1), blog = pics(2);
  ok(news.length === 2 && news[0].equals(site('news/The lighthouse keepers of Kestrel Rock_files/keepers.jpg')), 'news: the lead photo (the page’s og:image) on top, its JPEG byte for byte');
  ok(news[1][0] === 0xff && news[1][1] === 0xd8 && size(news[1]).join('×') === '640×400', `news: the WebP of the <picture> made a JPEG for the Kindle (${size(news[1]).join('×')})`);
  ok(blog.length === 5 && blog[0].equals(site('blog/Profiling Rust code with flamegraphs_files/hero-1600.jpg')) && blog[1].equals(site('blog/Profiling Rust code with flamegraphs_files/chart.png')) && blog[2].equals(site('blog/Profiling Rust code with flamegraphs_files/anim.gif')), 'blog: the srcset’s picture, the transparent PNG and the GIF byte for byte');
  ok(size(blog[3]).join('×') === '960×480', `blog: the SVG picture drawn (${size(blog[3]).join('×')})`);
  ok(size(blog[4]).join('×') === '1600×800', `blog: the 3,000 px picture made 1,600 px wide (${size(blog[4]).join('×')})`);
  ok(!Object.keys(r.z).some((n) => /\.(webp|svg)$/.test(n)) && !/pixel/.test(opf), 'no WebP, no SVG, no tracking pixel in the book');
  ok(/properties="cover-image"/.test(opf) && size(Buffer.from(r.z['OEBPS/images/cover.jpg'])).join('×') === '1200×1800', 'a cover of 1,200 × 1,800');
  // MuPDF (the EPUB Reader's engine) reads every sentence of every article, in order
  const doc = m.Document.openDocument(readFileSync(r.f), 'application/epub+zip');
  doc.layout(500, 800, 12);
  let all = '';
  for (let i = 0; i < doc.countPages(); i++) all += ' ' + doc.loadPage(i).toStructuredText().asText();
  all = norm(all);
  const lostAll = [];
  let at = 0;
  for (const k of ['news', 'blog', 'fr']) for (const x of TRUTH[k].sentences) { const p = all.indexOf(norm(x), at); if (p < 0) lostAll.push(x.slice(0, 30)); else at = p + norm(x).length; }
  ok(!lostAll.length, `MuPDF reads every sentence of the three articles in order (${doc.countPages()} pages) ${lostAll.join(' | ')}`);
  if (jar && java) {
    const rep = `${r.f}.json`;
    try { execFileSync('java', ['-jar', jar, r.f, '--json', rep], { stdio: 'ignore', timeout: 180000 }); } catch { /* exit 1 when it found something */ }
    const msgs = (JSON.parse(readFileSync(rep, 'utf8')).messages || []).filter((x) => x.severity !== 'USAGE' && x.severity !== 'INFO');
    ok(!msgs.length, `epubcheck: no error and no warning ${msgs.slice(0, 3).map((x) => `${x.ID} ${x.message}`).join(' | ')}`);
  }

  // ---- pictures and cover off; a typed title
  await page.getByRole('textbox', { name: 'The book’s title' }).fill('Weekend reading');
  await page.locator('label.switch', { hasText: 'Pictures' }).click();
  await page.locator('label.switch', { hasText: 'A cover' }).click();
  r = await make();
  ok(r.f.endsWith('Weekend-reading.epub') && !Object.keys(r.z).some((n) => /images\//.test(n)) && !/<img/.test(ch(1) + ch(2)), 'a title of one’s own; no pictures and no cover when switched off');
  await page.locator('label.switch', { hasText: 'Pictures' }).click();
  await page.locator('label.switch', { hasText: 'A cover' }).click();

  // ---- "Read it here": the book opens in the EPUB Reader
  await page.getByRole('button', { name: 'Read it here' }).click();
  await page.waitForFunction(() => location.hash === '#/ebook');
  await page.locator('.ebr-title').filter({ hasText: 'Weekend reading' }).waitFor({ timeout: 60000 });
  ok(true, '“Read it here” opens the book in the EPUB Reader');
  await page.goto(base + '#/articles');
  await page.getByRole('button', { name: 'Make EPUB' }).waitFor();

  // ---- a page saved "complete": the folder with the .html and its _files folder
  await page.locator('input[webkitdirectory]').setInputFiles(F('complete/news'));
  await items().first().waitFor({ timeout: 60000 });
  const meta1 = await items().first().locator(':scope > .muted').innerText();
  ok(/3 of 3 pictures · The lighthouse keepers of Kestrel Rock\.html$/.test(meta1), `a folder saved "complete": its pictures found beside the page (${meta1})`);
  await items().first().getByRole('button', { name: 'Remove' }).click();

  // ---- a pasted selection: its text and links, its pictures stay on the website
  const pasteHtml = '<meta charset="utf-8"><h1>A pasted story</h1><p>The first paragraph of a story copied from a web page, with a <a href="https://example.org/more">link</a>.</p><p><img src="https://example.org/photo.jpg" alt="a photo"></p><p>The second paragraph of it.</p>';
  await page.getByRole('textbox', { name: 'Paste an article' }).evaluate((ta, h) => { const dt = new DataTransfer(); dt.setData('text/html', h); dt.setData('text/plain', 'plain'); ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, pasteHtml);
  await items().first().waitFor({ timeout: 30000 });
  ok((await items().first().locator('.art-head input').inputValue()) === 'A pasted story', 'a pasted selection: titled by its heading');
  const ptip = await items().first().locator('.art-tip').allInnerTexts();
  ok(ptip.some((t) => /stay on the website/.test(t)), `a pasted selection: its pictures stay on the website, said (${ptip.join(' | ')})`);
  const ptxt = await preview(0);
  ok(/The first paragraph of a story copied from a web page, with a link\./.test(ptxt) && /The second paragraph of it\./.test(ptxt) && !fetched.some((u) => u.includes('example.org')), 'a pasted selection: its text as it was; the website’s picture never fetched');
  await items().first().getByRole('button', { name: 'Remove' }).click();

  // ---- a page that is no article, and the switch to the whole page
  await add([F('home.mhtml')], 1);
  const said = (await page.locator('.tool-body [role=status]').first().innerText()) + ' ' + (await items().first().innerText());
  ok(/found no article in it — the whole page is used|not sure this page is an article/.test(said), 'a front page of headlines: Reader View finds no article, and says so');
  await items().first().getByRole('button', { name: 'Remove' }).click();
  await add([F('news.mhtml')], 1);
  const before = await preview(0);
  await items().first().locator('label.switch', { hasText: 'Use the whole page' }).click();
  await page.waitForFunction(() => /We use cookies/.test(document.querySelector('.art-preview')?.textContent || ''), null, { timeout: 30000 });
  ok(!/We use cookies/.test(before), 'the whole page, when asked for: the cookie banner too (it was left out before)');

  // ---- a file that is no saved page
  await page.locator('input[type=file]').first().setInputFiles({ name: 'broken.mhtml', mimeType: 'multipart/related', buffer: Buffer.from('MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="x"\r\n\r\n--x\r\nContent-Type: image/png\r\n\r\nnot a page\r\n--x--\r\n') });
  await page.locator('.tool-body .note-warn').filter({ hasText: 'broken.mhtml' }).waitFor({ timeout: 30000 });
  ok(/broken\.mhtml: it holds no web page/.test(await page.locator('.tool-body .note-warn').filter({ hasText: 'broken.mhtml' }).innerText()), 'a saved file without a page: said in words');
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);
  const held = await released(page, 'articles');
  ok(!held.length, `leaving the tab lets the preview’s pictures go (${held.length} blob URLs held)`);

  // ---- the phone
  const ph = await phoneLayout({ base, page: newPage, devices, ok }, 'articles', {
    ready: '.drop', buttons: ['Make EPUB'],
    before: async (p) => { await p.locator('input[type=file]').first().setInputFiles([F('news.webarchive')]); await p.locator('.art-item').first().waitFor({ timeout: 60000 }); },
  });
  const fixed = await ph.evaluate(() => getComputedStyle(document.querySelector('.actions')).position);
  ok(fixed === 'fixed', `phone: Make EPUB in the bar at the bottom (${fixed})`);
  const small = await ph.locator('.art-item button, .art-details > summary').evaluateAll((els) => els.filter((e) => e.getClientRects().length && e.getBoundingClientRect().height < 44).length);
  ok(!small, `phone: every control of an article ≥ 44 px tall (${small} smaller)`);
};
