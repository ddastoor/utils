// Articles → Kindle: article.wasm (wasm/article — dom_smoothie 0.20.0, Mozilla Readability's algorithm in Rust, and our
// MHTML / web archive readers and XHTML writer) and src/lib/articles.ts, held to
//   · tests/fixtures/articles/ (python3 scripts/make-article-pages.py, node scripts/make-article-mhtml.mjs): four made-up
//     pages with what is known about each — title, author, site, date, the article's sentences in order and what is no
//     part of it — saved as Chrome saves them (its own MHTML, made by Chromium), as Safari's web archive, "complete" with
//     a folder and as HTML only;
//   · reference.json: every part of every MHTML and web archive as Python's email package and plistlib read them;
//   · hand-made pages for each rule of the XHTML writer, and broken files (never a trap);
//   · the EPUB: its structure, every file XML; and the W3C's epubcheck where it is installed (EPUBCHECK=/path/epubcheck.jar,
//     or under /opt/epubcheck*).
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { execFileSync } from '../lib/child.mjs';

const jar = process.env.EPUBCHECK || ['/opt/epubcheck', '/opt/epubcheck-dl'].flatMap((d) => (existsSync(d) ? readdirSync(d).map((x) => `${d}/${x}/epubcheck.jar`).concat(`${d}/epubcheck.jar`) : [])).find((x) => existsSync(x));
const java = (() => { try { execFileSync('java', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const sha = (b) => createHash('sha256').update(b).digest('hex');
const norm = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const plain = (x) => norm(unesc(x.replace(/<[^>]+>/g, ' ')));

/** Is it well-formed XML (as far as our writer's output needs: balanced tags, quoted attributes, no stray & or <)? */
function wellFormed(x) {
  const stack = [], re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|(<)|(&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);))/g;
  let m;
  while ((m = re.exec(x))) {
    if (m[5]) return `a stray < at ${m.index}: ${x.slice(m.index, m.index + 40)}`;
    if (m[6]) return `a stray & at ${m.index}: ${x.slice(m.index, m.index + 40)}`;
    if (!m[2]) continue;
    if (m[1]) { const top = stack.pop(); if (top !== m[2]) return `</${m[2]}> closes <${top}> at ${m.index}`; }
    else if (!m[4]) stack.push(m[2]);
  }
  return stack.length ? `unclosed: ${stack.join(' ')}` : '';
}

export default async (t, { load, wasm, root }) => {
  const { bindArticle, NoArticle } = await load('/src/wasm/article.ts');
  const A = await load('/src/lib/articles.ts');
  const e = bindArticle(await wasm('article'));
  const DIR = join(root, 'tests/fixtures/articles');
  const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8'));
  const ref = JSON.parse(readFileSync(join(DIR, 'reference.json'), 'utf8'));
  const file = (n) => new Uint8Array(readFileSync(join(DIR, n)));

  // ---------------------------------------------------------------------------------- the readers against Python
  // (a quoted-printable text part is compared with its line ends as LF: Python's email package gives them so; the
  //  canonical form of RFC 2045 — which the engine keeps — is CR LF, and an HTML parser reads both alike)
  const lf = (p, b) => (/^text\//.test(p.type) && /\r\n/.test(Buffer.from(b).toString('latin1')) ? Buffer.from(Buffer.from(b).toString('latin1').replace(/\r\n/g, '\n'), 'latin1') : b);
  for (const [name, r] of Object.entries(ref)) {
    const u = name.endsWith('.mhtml') ? e.mhtml(file(name)) : e.webarchive(file(name));
    const ours = u.parts.map((p) => { const b = name.endsWith('.mhtml') ? lf(p, p.bytes) : p.bytes; return { type: p.type, url: p.url, sha256: sha(b), len: b.length }; });
    t.eq(ours, r.parts, `${name}: ${r.parts.length} parts — the type, the address and every byte of each as ${name.endsWith('.mhtml') ? 'Python’s email package' : 'Python’s plistlib'} reads them`);
    t.eq(u.url, r.url, `${name}: the page’s address (${r.url})`);
  }
  t.eq(e.mhtml(file('news.mhtml')).subject, 'The lighthouse keepers of Kestrel Rock | The Coastal Gazette', 'MHTML: the subject (the title Chrome writes)');

  // the MIME pieces on their own
  const qpDoc = 'MIME-Version: 1.0\r\nSubject: =?utf-8?Q?Caf=C3=A9_au_lait?= =?utf-8?B?IOKAlCBkZQ==?=\r\nContent-Type: multipart/related;\r\n\tboundary="b1"\r\n\r\npreamble\r\n--b1\r\nContent-Type: text/html; charset="iso-8859-1"\r\nContent-Transfer-Encoding: quoted-printable\r\nContent-Location: https://x.example/a\r\n\r\n<p>Caf=E9 =\r\nau lait=3D1</p>\r\n--b1\r\nContent-Type: image/png\r\nContent-Transfer-Encoding: base64\r\nContent-Location: https://x.example/p.png\r\n\r\niVBO\r\nRw0K\r\n--b1\r\nContent-Type: multipart/alternative; boundary=b2\r\n\r\n--b2\r\nContent-Type: text/plain\r\n\r\nplain\r\n--b2--\r\n--b1--\r\nepilogue\r\n';
  const q = e.mhtml(new TextEncoder().encode(qpDoc));
  t.eq(q.parts.map((p) => [p.type, p.charset, p.url, Buffer.from(p.bytes).toString('latin1')]), [['text/html', 'iso-8859-1', 'https://x.example/a', '<p>Caf\xe9 au lait=1</p>'], ['image/png', '', 'https://x.example/p.png', '\x89PNG\r\n'], ['text/plain', '', '', 'plain']],
    'MIME: a quoted-printable part (soft line break, =XX), a base64 part broken over lines, a nested multipart; preamble and epilogue left out');
  t.eq(q.subject, 'Café au lait — de', 'MIME: encoded words in the subject (Q and B, the space between two words dropped)');
  t.eq(A.kindOf({ name: 'page', bytes: new TextEncoder().encode(qpDoc) }), 'mhtml', 'an MHTML without its extension is known by its headers');

  // broken files: a sentence, never a trap
  let seed = 20261127; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  let traps = 0, said = 0;
  for (const name of ['news.mhtml', 'blog.webarchive', 'fr.webarchive', 'home.mhtml']) {
    const b = file(name);
    for (let k = 0; k < 40; k++) {
      const c = b.slice(0, Math.floor(rnd() * b.length));
      if (k % 2) for (let j = 0; j < 30; j++) c[Math.floor(rnd() * c.length)] = Math.floor(rnd() * 256);
      try { name.endsWith('.mhtml') ? e.mhtml(c) : e.webarchive(c); } catch (err) { if (err instanceof WebAssembly.RuntimeError) traps++; else said++; }
    }
  }
  t.ok(traps === 0, `160 cut and damaged MHTML files and web archives: no trap (${said} refused in words)`);
  t.throws(() => e.webarchive(new TextEncoder().encode('<?xml version="1.0"?><plist></plist>')), /XML/, 'a web archive in Apple’s XML form is refused in words');
  t.throws(() => e.mhtml(new TextEncoder().encode('hello')), /Content-Type/, 'a text that is no MHTML is refused in words');

  // ---------------------------------------------------------------------------------- the pages, saved four ways
  const pagesOf = (files) => A.pagesOf(files, e);
  const inFile = (n) => ({ name: n.split('/').pop(), bytes: file(n), path: n });
  const folder = (k) => { const d = join('complete', k); const out = []; const walk = (p) => { for (const x of readdirSync(join(DIR, p), { withFileTypes: true })) { const q2 = join(p, x.name); if (x.isDirectory()) walk(q2); else out.push(inFile(q2.replace(/\\/g, '/'))); } }; walk(d); return out; };
  const saved = (k, via) => via === 'mhtml' ? [inFile(`${k}.mhtml`)] : via === 'webarchive' ? [inFile(`${k}.webarchive`)] : via === 'complete' ? folder(k) : [inFile(`${k}.html`)];
  /** the article's pictures that each way of saving keeps: Chromium loads the WebP of a <picture> and the 800 px of a
   *  srcset (at 1,366 px, 1×), Safari's archive here the WebP and the 1,600 px; a picture a script would have loaded
   *  (data-src) is in no save but the folder */
  const kept = { mhtml: (n) => !['lamp.jpg', 'ledger.jpg', 'hero-400.jpg', 'hero-1600.jpg'].includes(n), webarchive: (n) => !['lamp.jpg', 'ledger.jpg', 'hero-400.jpg', 'hero-800.jpg'].includes(n), complete: () => true, html: () => false };
  const slots = { 'lamp.jpg': ['lamp.jpg', 'lamp.webp'], 'hero-800.jpg': ['hero-400.jpg', 'hero-800.jpg', 'hero-1600.jpg'] };
  const arts = {};
  for (const k of ['news', 'blog', 'fr']) {
    const g = index[k];
    for (const via of ['mhtml', 'webarchive', 'complete', 'html']) {
      const { pages, skipped } = pagesOf(saved(k, via));
      t.ok(pages.length === 1 && pages[0].via === via && !skipped.length, `${k} (${via}): one page ${skipped.map((s) => s.why).join(' | ')}`);
      const a = A.articleOf(e, pages[0]);
      arts[`${k}-${via}`] = a;
      const txt = norm(a.text);
      // every sentence of the article, in order
      let at = 0; const lost = [];
      for (const s of g.sentences) { const p = txt.indexOf(norm(s), at); if (p < 0) lost.push(s.slice(0, 40)); else at = p + norm(s).length; }
      t.eq(lost, [], `${k} (${via}): all ${g.sentences.length} sentences of the article, in order`);
      t.eq(g.not.filter((x) => txt.toLowerCase().includes(x.toLowerCase())), [], `${k} (${via}): nothing of the page around it (${g.not.length} pieces: adverts, menus, the cookie banner, sign-up, comments, related links)`);
      t.eq([a.title, a.author, a.site, a.date, a.lang], [g.title, g.author, g.site, g.date, g.lang], `${k} (${via}): title, author, site, date and language`);
      // the address: from the save (Chrome's mark, the MHTML's, the archive's) — a page saved as HTML only has it only
      // where it names itself (a canonical link)
      t.eq(a.url, via === 'html' && !g.canonical ? '' : g.url, `${k} (${via}): the address it was saved from`);
      // its pictures: the article's own, in order, each found where the save kept it
      const names = a.pictures.map((p) => p.urls.map(([u]) => u.split('/').pop()));
      // the lead photo (og:image) stands on top only where it was saved — Readability leaves it out
      const want = g.pictures.filter((n) => !(g.lead === n && !kept[via](n))).map((n) => slots[n] || [n]);
      t.ok(names.length === want.length && want.every((w, i) => names[i].some((n) => w.includes(n))), `${k} (${via}): its ${want.length} pictures in order, and no other (${names.map((n) => n[0]).join(', ')})`);
      const found = a.pictures.map((p) => !!p.file), should = want.map((w) => w.some((n) => kept[via](n)));
      t.eq(found, should, `${k} (${via}): the pictures the save kept are found (${found.filter(Boolean).length} of ${found.length})`);
      const bad = wellFormed(`<div>${a.xhtml}</div>`);
      t.ok(!bad, `${k} (${via}): the article’s XHTML is well-formed ${bad}`);
      t.ok(!/<(script|style|form|input|button|iframe|svg|nav|aside)\b|\son\w+=|\sstyle=|\sclass="(?!embed|tex)/.test(a.xhtml), `${k} (${via}): no scripts, styles, forms, frames, inline SVG, navigation, event handlers, inline styles or the page’s classes`);
    }
  }
  t.ok(arts['news-mhtml'].dropped.embeds === 1 && /<p class="embed">Embedded: <a href="https:\/\/www\.youtube-nocookie\.com\/embed\/abc123XYZ">www\.youtube-nocookie\.com<\/a><\/p>/.test(arts['news-mhtml'].xhtml), 'news: the YouTube embed is a link');
  t.ok(['mhtml', 'webarchive', 'complete', 'html'].every((v) => /<a id="r1" href="#fn1">1<\/a>/.test(arts[`news-${v}`].xhtml) && /<li id="fn1">/.test(arts[`news-${v}`].xhtml)), 'news: the footnote link and its note keep their ids (a link points at each)');
  t.ok(/<table><thead><tr><th>Year<\/th><th>Keeper<\/th><\/tr><\/thead><tbody><tr><td>1893<\/td>/.test(arts['news-mhtml'].xhtml), 'news: the table, head and body');
  t.ok(/<pre><code>fn main\(\) \{ let map = build_map_once\(\); serve\(&amp;map\); \}<\/code><\/pre>/.test(arts['blog-mhtml'].xhtml), 'blog: the code block under “overflow-hidden md:hidden” is kept (dom_smoothie 0.19’s fix)');
  t.ok(/<ol start="3">/.test(arts['blog-mhtml'].xhtml) && /<dl><dt>Self time<\/dt><dd>/.test(arts['blog-mhtml'].xhtml), 'blog: the list keeps its start, the terms their descriptions');
  t.ok(!/<h1/.test(arts['blog-mhtml'].xhtml) && !/<h1/.test(arts['news-mhtml'].xhtml), 'the heading that repeats the title is left out (the chapter has the title on top)');
  t.ok(arts['fr-html'].text.includes('l’estuaire de la Gironde') && arts['fr-html'].text.includes('roi des phares'), 'fr (HTML only, Windows-1252): the accents and the typographic apostrophe read right');

  // a page that is no article: Reader View says so; the whole page can still be used
  for (const via of ['mhtml', 'webarchive', 'html']) {
    const { pages } = pagesOf(saved('home', via));
    let a = null, none = false;
    try { a = A.articleOf(e, pages[0]); } catch (err) { none = err instanceof NoArticle; }
    t.ok(none || a.readable === false, `home (${via}): Reader View finds no article in a front page of headlines (${none ? 'none found' : 'not readable'})`);
    const w = A.articleOf(e, pages[0], true);
    t.ok(w.whole && /Headline number 24/.test(w.text) && !/<script/.test(w.xhtml), `home (${via}): the whole page, cleaned, when asked for`);
  }

  // ---------------------------------------------------------------------------------- the XHTML writer, rule by rule
  const one = (body, o = {}) => e.read(`<!DOCTYPE html><html lang="en"><head><title>T</title></head><body>${body}</body></html>`, o.url || '', { whole: true });
  const X = (body, o) => one(body, o).xhtml;
  const cases = [
    ['<ul><li>a</li><div>b</div>c</ul>', '<ul><li>a</li><li><div>b</div></li><li>c</li></ul>', 'a list holds items: what else stands in it gets an item of its own'],
    ['<dl><dd>x</dd><dt>t</dt></dl>', '<dl><dt></dt><dd>x</dd><dt>t</dt><dd></dd></dl>', 'a list of terms: a description gets a term before it, a last term a description'],
    ['<dl><div><dt>a</dt><dd>b</dd></div></dl>', '<dl><dt>a</dt><dd>b</dd></dl>', 'a list of terms: a group wrapper gives way'],
    ['<table><tfoot><tr><td>f</td></tr></tfoot><tr><td>r</td></tr><caption>c</caption><col span="2"></table>', '<table><caption>c</caption><colgroup><col span="2"/></colgroup><tbody><tr><td>r</td></tr></tbody><tfoot><tr><td>f</td></tr></tfoot></table>', 'a table in the order HTML wants: caption, columns, rows, foot'],
    ['<h2>a <div>b</div> c</h2><span><p>d</p></span>', '<h2>a b c</h2><span> d </span>', 'a heading or an inline element holds no block: it gives way to its text'],
    ['<p><a href="https://x.example/">x <a href="https://y.example/">y</a></a></p>', '<p><a href="https://x.example/">x </a><a href="https://y.example/">y</a></p>', 'no link inside a link'],
    ['<p><a href="javascript:alert(1)">j</a> <a href="data:text/html,x">d</a> <a href="/rel">r</a> <a href="mailto:a@b.example">m</a></p>', '<p><a>j</a> <a>d</a> <a>r</a> <a href="mailto:a@b.example">m</a></p>', 'links: only http, https and mailto keep their address'],
    ['<p><a href="#n1">1</a> <a href="#gone">2</a></p><p id="n1">note</p>', '<p><a href="#n1">1</a> <a>2</a></p><p id="n1">note</p>', 'an internal link keeps its target; one to an id that is not there loses its address'],
    ['<p>x<math><semantics><mi>x</mi><annotation encoding="application/x-tex">x^2</annotation></semantics></math></p>', '<p>x<code class="tex">x^2</code></p>', 'MathML: its TeX source'],
    ['<p>a<svg><path d="M0 0"/></svg>b</p><script>evil()</script><style>p{}</style><form><input><button>go</button></form>', '<p>ab</p><div></div>', 'inline SVG, scripts, styles and form controls are left out'],
    ['<pre>  a\n    b</pre>', '<pre>  a\n    b</pre>', 'a code block keeps every space and line'],
    ['<p>  </p><p>x</p>', '<p>x</p>', 'an empty paragraph is left out'],
    ['<p onclick="x()" style="color:red" class="c" lang="fr" dir="rtl">t</p>', '<p lang="fr" xml:lang="fr" dir="rtl">t</p>', 'attributes: lang and dir kept; handlers, styles and classes not'],
    ['<figure><figcaption>a</figcaption><img src="https://x.example/i.jpg"><figcaption>b</figcaption></figure>', '<figure><figcaption>a</figcaption><img src="⟦0⟧" alt=""/><div>b</div></figure>', 'a figure’s caption stands first or last; a second one is a block of it'],
    ['<p>1 &lt; 2 &amp; "q" \u0001\u0085</p>', '<p>1 &lt; 2 &amp; "q" </p>', 'text escaped; characters XML forbids and C1 controls left out'],
    ['<custom-card><p>in</p></custom-card><center>c</center><tt>m</tt>', '<p>in</p><div>c</div><code>m</code>', 'unknown elements give way to their content; old ones get their modern names'],
    ['<p><video src="https://v.example/clip.mp4"></video></p>', '<p>Video: <a href="https://v.example/clip.mp4">v.example</a></p>', 'a video inside a paragraph is a link in it'],
  ];
  for (const [inp, want, what] of cases) t.eq(X(inp), want, `XHTML: ${what}`);
  const im = one('<picture><source srcset="https://x.example/a.avif 1x, https://x.example/a2.avif 2x" type="image/avif"><img src="https://x.example/a.jpg" srcset="https://x.example/s.jpg 400w, https://x.example/l.jpg 1200w" alt="A"></picture><img data-src="https://x.example/lazy.jpg" alt="B">');
  t.eq(im.images, [{ alt: 'A', urls: [['https://x.example/a2.avif', 2000], ['https://x.example/a.avif', 1000], ['https://x.example/l.jpg', 1200], ['https://x.example/s.jpg', 400], ['https://x.example/a.jpg', 0]] }, { alt: 'B', urls: [['https://x.example/lazy.jpg', 0]] }], 'pictures: a <picture>’s sources, the srcset largest first, then src; a lazy picture’s data-src');
  t.eq(A.dataUrl('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')?.bytes.length, 42, 'a data: URL’s bytes');

  // ---------------------------------------------------------------------------------- reading files
  const dec = (bytes, label) => A.decodeHtml(new Uint8Array(bytes), label);
  t.eq(dec([0xef, 0xbb, 0xbf, 0x41, 0xc3, 0xa9]), 'Aé', 'UTF-8 with its mark');
  t.eq(dec([0xff, 0xfe, 0x41, 0, 0xe9, 0]), 'Aé', 'UTF-16 by its mark');
  t.eq(dec([...Buffer.from('<meta charset="windows-1252">'), 0xe9, 0x92]), '<meta charset="windows-1252">é’', 'the character set the page declares');
  t.eq(dec([...Buffer.from('<meta http-equiv="Content-Type" content="text/html; charset=utf-16">'), 0xc3, 0xa9]), '<meta http-equiv="Content-Type" content="text/html; charset=utf-16">é', 'a page declaring UTF-16 in its text is UTF-8 (as the HTML standard says)');
  t.eq(dec([0x63, 0x61, 0x66, 0xe9]), 'café', 'no label and not UTF-8: Windows-1252');
  t.eq(dec([0x63, 0xe9], 'iso-8859-15'), 'cé', 'the label of the container (an MHTML part, a web archive) wins');
  t.eq(A.savedFrom('<!DOCTYPE html>\n<!-- saved from url=(0024)https://a.example/x.html -->'), 'https://a.example/x.html', 'Chrome’s “saved from” mark');
  t.eq([A.canonicalOf('<link href="https://a.example/c?x=1&amp;y=2" rel="canonical">'), A.canonicalOf("<meta content='https://a.example/o' property='og:url'>"), A.canonicalOf('<link rel="canonical" href="/relative">')], ['https://a.example/c?x=1&y=2', 'https://a.example/o', ''], 'the address a page names itself by: its canonical link, else og:url (absolute only)');
  t.eq(['a.mhtml', 'a.webarchive', 'a.html', 'a.txt', 'p.jpg'].map((n) => A.kindOf({ name: n, bytes: new Uint8Array(4) })), ['mhtml', 'webarchive', 'html', 'text', 'picture'], 'kinds by name');
  t.eq(A.kindOf({ name: 'x', bytes: new TextEncoder().encode('  <!doctype html><p>') }), 'html', 'an HTML page without its extension');
  t.eq(A.cleanByline('By  Jane Doe'), 'Jane Doe', 'a byline without its “By”');
  t.eq([A.cleanByline('https://x.example/me'), A.cleanByline('The Gazette', 'The Gazette')], ['', ''], 'no byline that is an address or the site’s name');
  t.eq([A.isoDate('2026-11-20T07:30:00+05:30'), A.isoDate('Fri, 20 Nov 2026 07:30:00 GMT'), A.isoDate('yesterday'), A.dateText('2026-11-20')], ['2026-11-20', '2026-11-20', '', '20 November 2026'], 'dates');

  // a pasted selection and a text file are articles as they are
  const pasted = A.articleOf(e, A.pastedPage('<meta charset="utf-8"><b>Pasted title</b><p>First line of the pasted article with a <a href="https://x.example/">link</a>.</p><p>Second paragraph.</p>', ''));
  t.ok(pasted.whole && /<b>Pasted title<\/b>/.test(pasted.xhtml) && /<a href="https:\/\/x\.example\/">link<\/a>/.test(pasted.xhtml) && /Second paragraph/.test(pasted.text), 'a pasted selection: its text, formatting and links as they were');
  const txt = A.pagesOf([{ name: 'notes.txt', bytes: new TextEncoder().encode('A title\n\nThe first paragraph of the notes, written in a text file\nand broken over lines by hand at about sixty characters\nas plain text files often are.\n\nThe second.') }], e).pages[0];
  t.ok(txt.via === 'text' && A.articleOf(e, txt).text.includes('The first paragraph of the notes, written in a text file and broken over lines by hand at about sixty characters as plain text files often are.'), 'a text file: its paragraphs, the lines broken by hand joined');
  t.eq(A.pagesOf([inFile('complete/news/The lighthouse keepers of Kestrel Rock_files/keepers.jpg')], e).skipped.map((s) => s.why.slice(0, 32)), ['a picture on its own is no artic'], 'a picture chosen alone is said to be no article');

  // ---------------------------------------------------------------------------------- the EPUB
  const tmp = mkdtempSync(join(tmpdir(), 'articles-'));
  const jpegs = new Set(['image/jpeg', 'image/png', 'image/gif']);
  const convert = async (f) => { const ty = A.pictureType(f.bytes) || f.type; return jpegs.has(ty) && f.bytes.length > 100 ? { bytes: f.bytes, mime: ty, w: 10, h: 10 } : null; };
  const book = async (list, o = {}) => {
    const r = await A.makeEpub(list, { title: o.title || 'Weekend reading', author: o.author || 'Various', pictures: o.pictures ?? true, cover: o.cover || null, id: 'urn:uuid:00000000-0000-4000-8000-000000000000', modified: '2026-11-27T00:00:00Z' }, convert);
    const z = unzipSync(r.epub);
    return { ...r, z, text: (k) => strFromU8(z[k]) };
  };
  const three = [arts['news-mhtml'], arts['blog-webarchive'], arts['fr-complete']];
  const b = await book(three, { cover: { bytes: file('complete/fr/Le phare de Cordouan_files/cordouan.jpg'), mime: 'image/jpeg' } });
  const names = Object.keys(b.z);
  t.ok(names[0] === 'mimetype' && strFromU8(b.z.mimetype) === 'application/epub+zip' && b.epub[8] === 0 && b.epub[9] === 0, 'the EPUB: the mimetype first, stored');
  const opf = b.text('OEBPS/content.opf');
  t.eq([...opf.matchAll(/<itemref idref="([^"]+)"\/>/g)].map((x) => x[1]), ['contents', 'a01', 'a02', 'a03'], 'several articles: the contents page, then the articles in their order');
  const listed = [...opf.matchAll(/href="([^"]+)"/g)].map((x) => `OEBPS/${x[1]}`);
  t.eq([...listed].sort(), names.filter((n) => n.startsWith('OEBPS/') && n !== 'OEBPS/content.opf').sort(), 'every file of the book is in the manifest (but the package itself), and nothing else');
  const ch = [1, 2, 3].map((k) => b.text(`OEBPS/a0${k}.xhtml`));
  t.ok(three.every((a, k) => ch[k].includes(`<h1>${a.title.replace(/&/g, '&amp;')}</h1>`)), 'each chapter: the article’s title on top');
  t.ok(ch[0].includes('<p class="meta">Priya Sharma · The Coastal Gazette · 20 November 2026 · ') && ch[0].includes('<p class="src"><a href="https://coastal-gazette.example/2026/11/20/lighthouse-keepers">'), 'each chapter: author, site, date, reading time and the address under the title');
  t.ok(!names.some((n) => /pixel|logo/.test(n)) && !ch.some((c) => c.includes('⟦')), 'no placeholder left; no tracking pixel, no site logo');
  const imgs = ch.flatMap((c) => [...c.matchAll(/<img src="([^"]+)"/g)].map((x) => `OEBPS/${x[1]}`));
  t.ok(imgs.length && imgs.every((s) => b.z[s]), `every picture a chapter shows is in the book (${imgs.length})`);
  t.ok(/<nav epub:type="toc" id="toc"><h1>Contents<\/h1><ol><li><a href="contents.xhtml">Contents<\/a><\/li><li><a href="a01.xhtml">The lighthouse keepers of Kestrel Rock<\/a><ol><li><a href="a01.xhtml#a01-s1">A life on the rock<\/a><\/li><li><a href="a01.xhtml#a01-s2">The last keepers<\/a><\/li><\/ol><\/li>/.test(b.text('OEBPS/nav.xhtml')), 'the contents: each article and its sections');
  t.ok(/<h2 id="a01-s1">A life on the rock<\/h2>/.test(ch[0]), 'a section heading gets the id the contents point to');
  t.ok(/properties="cover-image"/.test(opf) && /<meta name="cover" content="cover-image"\/>/.test(opf), 'the cover, for EPUB 3 and for older readers');
  t.ok(/<dc:language>en-GB<\/dc:language>/.test(opf) && /lang="fr" xml:lang="fr"/.test(ch[2]), 'the book’s language from its first article; each chapter its own');
  const bad = Object.entries(b.z).filter(([k]) => /\.(xhtml|opf|ncx|xml)$/.test(k)).map(([k, v]) => [k, wellFormed(strFromU8(v).replace(/^<\?xml[^>]*\?>/, ''))]).filter(([, w]) => w);
  t.eq(bad, [], 'every XHTML, the package and the NCX are well-formed');
  const single = await book([arts['news-webarchive']], { title: 'The lighthouse keepers of Kestrel Rock', author: 'Priya Sharma' });
  const sopf = single.text('OEBPS/content.opf');
  t.ok(!single.z['OEBPS/contents.xhtml'] && /<dc:date>2026-11-20<\/dc:date>/.test(sopf) && /<dc:publisher>The Coastal Gazette<\/dc:publisher>/.test(sopf) && /<dc:source>https:\/\/coastal-gazette\.example\/2026\/11\/20\/lighthouse-keepers<\/dc:source>/.test(sopf) && /<dc:creator>Priya Sharma<\/dc:creator>/.test(sopf), 'one article: no contents page; its date, site, address and author in the package');
  const nop = await book([arts['news-mhtml']], { pictures: false });
  t.ok(!Object.keys(nop.z).some((n) => /images\//.test(n)) && !/<img/.test(nop.text('OEBPS/a01.xhtml')) && nop.pictures === 0, 'pictures left out when asked');
  // epubcheck, where it is installed
  if (jar && java) {
    for (const [what, r] of [['three articles with a cover', b], ['one article', single], ['without pictures', nop]]) {
      const f = join(tmp, `${what.replace(/\W+/g, '-')}.epub`), rep = `${f}.json`;
      writeFileSync(f, r.epub);
      try { execFileSync('java', ['-jar', jar, f, '--json', rep], { stdio: 'ignore', timeout: 180_000 }); } catch { /* exit 1 when it found something */ }
      const msgs = (JSON.parse(readFileSync(rep, 'utf8')).messages || []).filter((x) => x.severity !== 'USAGE' && x.severity !== 'INFO');
      t.eq(msgs.map((x) => `${x.severity} ${x.ID} ${x.message} ${x.locations?.[0]?.path || ''}`), [], `epubcheck: ${what} — no error and no warning`);
    }
  } else t.ok(true, 'epubcheck is not installed here: skipped (EPUBCHECK=/path/epubcheck.jar)');
};
