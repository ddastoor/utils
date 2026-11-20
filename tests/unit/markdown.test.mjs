// markdown.wasm (cmark-gfm built by us): CommonMark + GFM known answers and the safety guarantees the app relies on.
import { readFileSync } from 'node:fs';
export default async (t, { load, wasm, root }) => {
  const { bindMarkdown } = await load('/src/wasm/markdown.ts');
  const md = bindMarkdown(await wasm('markdown'));
  const H = (s, o) => md.html(s, o);
  t.eq(md.version(), '0.29.0.gfm.13', 'cmark-gfm version');
  t.eq(H('# Title'), '<h1>Title</h1>\n', 'ATX heading');
  t.eq(H('Some *em* and **strong** and `code`'), '<p>Some <em>em</em> and <strong>strong</strong> and <code>code</code></p>\n', 'inline emphasis and code');
  t.eq(H('- a\n- b'), '<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n', 'bullet list');
  t.eq(H('1. x\n2. y'), '<ol>\n<li>x</li>\n<li>y</li>\n</ol>\n', 'ordered list');
  t.eq(H('```js\nlet a = 1;\n```'), '<pre lang="js"><code>let a = 1;\n</code></pre>\n', 'fenced code with language (GitHub style)');
  t.eq(H('> quote'), '<blockquote>\n<p>quote</p>\n</blockquote>\n', 'block quote');
  t.eq(H('[link](https://example.com "T")'), '<p><a href="https://example.com" title="T">link</a></p>\n', 'link with title');
  t.eq(H('![alt](img.png)'), '<p><img src="img.png" alt="alt" /></p>\n', 'image');
  // GFM extensions
  t.ok(H('| a | b |\n|---|:-:|\n| 1 | 2 |').includes('<table>') && H('| a | b |\n|---|:-:|\n| 1 | 2 |').includes('<td style="text-align: center">2</td>'), 'table with alignment');
  t.eq(H('~~gone~~'), '<p><del>gone</del></p>\n', 'strikethrough');
  t.eq(H('see www.example.com now'), '<p>see <a href="http://www.example.com">www.example.com</a> now</p>\n', 'autolink');
  t.ok(/<li><input type="checkbox" checked="" disabled="" \/> done<\/li>/.test(H('- [x] done\n- [ ] todo')), 'task list');
  t.ok(H('Note[^1]\n\n[^1]: The note.').includes('class="footnotes"'), 'footnotes');
  t.eq(H('"Smart" -- quotes...', { smart: true }), '<p>“Smart” – quotes…</p>\n', 'smart punctuation');
  t.eq(H('a\nb', { hardBreaks: true }), '<p>a<br />\nb</p>\n', 'hard line breaks');
  // safety: raw HTML and dangerous URLs never come through
  t.ok(!H('<script>alert(1)</script>').includes('<script'), 'raw <script> suppressed');
  t.ok(!H('<img src=x onerror=alert(1)>').includes('onerror'), 'raw HTML attributes suppressed');
  t.ok(!/href="javascript/i.test(H('[x](javascript:alert(1))')) && !/href="vbscript/i.test(H('[x](VBScript:x)')), 'javascript:/vbscript: links dropped');
  t.ok(!/src="data:text\/html/.test(H('![x](data:text/html,<b>)')), 'data:text/html image dropped');
  t.ok(H('Inline <b>bold</b>').includes('<!-- raw HTML omitted -->'), 'inline HTML omitted');
  // Unicode, big input, junk
  t.eq(H('नमस्ते **दुनिया** 😀'), '<p>नमस्ते <strong>दुनिया</strong> 😀</p>\n', 'Unicode kept');
  const big = Array.from({ length: 5000 }, (_, i) => `## H${i}\n\nPara *${i}*`).join('\n\n');
  t.eq((H(big).match(/<h2>/g) || []).length, 5000, '5000 sections (≈ 90 KB) in one call');
  let crashed = false; try { for (let i = 0; i < 300; i++) H(String.fromCharCode(...Array.from({ length: 200 }, (_, k) => (k * 7919 + i * 31) % 0x2fff))); } catch { crashed = true; }
  t.ok(!crashed, 'random input never traps');
  t.eq(H('*'.repeat(20000)).length > 0, true, 'pathological emphasis input finishes');

  // ---- the GFM spec and cmark-gfm's own test files at the tag we build (tests/fixtures/markdown/, CC-BY-SA 4.0):
  // every example gives the spec's HTML — but where an extension GitHub always uses changes it (the tag filter escapes
  // <script> / <style>; bare URLs and e-mail addresses become links), which the spec's plain CommonMark examples assume
  // switched off. Our options GITHUB_PRE_LANG and TABLE_PREFER_STYLE_ATTRIBUTES are undone before comparing.
  const FENCE = '`'.repeat(32), counts = { exact: 0, tagfilter: 0, autolink: 0, ignore: 0 }, unexplained = [];
  const norm = (s) => s.replace(/<pre lang="([^"]*)"><code>/g, '<pre><code class="language-$1">').replace(/ style="text-align: (\w+)"/g, ' align="$1"')
    .replace(/<input ([^>]*?) ?\/?>/g, (m, a) => `<input ${(a.match(/[\w-]+="[^"]*"/g) || []).sort().join(' ')}>`);
  for (const f of ['spec.txt', 'extensions.txt', 'smart_punct.txt', 'regression.txt']) {
    const L = readFileSync(`${root}/tests/fixtures/markdown/${f}`, 'utf8').split('\n');
    for (let i = 0; i < L.length; i++) {
      if (!L[i].startsWith(FENCE + ' example')) continue;
      let j = i + 1; const a = [], b = [];
      while (L[j] !== '.') a.push(L[j++]); j++;
      while (L[j] !== FENCE) b.push(L[j++]);
      const src = a.join('\n').replace(/→/g, '\t') + (a.length ? '\n' : ''), want = b.join('\n').replace(/→/g, '\t') + (b.length ? '\n' : '');
      const got = norm(md.html(src, { unsafe: true, smart: f === 'smart_punct.txt' }));
      if (want === '<IGNORE>\n') counts.ignore++;                                   // "should not crash"
      else if (got === norm(want)) counts.exact++;
      else if (got.replace(/&lt;(\/?)(script|style|title|textarea|xmp|iframe|noembed|noframes|plaintext)/gi, '<$1$2') === norm(want)) counts.tagfilter++;
      else if (got.replace(/<a href="(?:https?:\/\/|mailto:)[^"]*">([^<]*)<\/a>/g, '$1') === norm(want)) counts.autolink++;
      else unexplained.push(`${f}:${i + 1} ${JSON.stringify(src)} → ${JSON.stringify(got)}, the spec says ${JSON.stringify(want)}`);
      i = j;
    }
  }
  t.eq(unexplained, [], 'every example of the GFM spec, extensions, smart punctuation and regression files: the spec\'s HTML or an extension GitHub uses');
  t.eq(counts, { exact: 732, tagfilter: 6, autolink: 5, ignore: 1 }, `744 examples: ${JSON.stringify(counts)}`);
  const safe = H('<script>alert(1)</script>\n\n<b>x</b>\n\n[a](javascript:x) ![b](data:text/html,x) ![c](data:image/png;base64,AA==)');
  t.ok(!/<script|<b>|javascript:|data:text/.test(safe) && /data:image\/png/.test(safe), 'without unsafe (the app): raw HTML and unsafe links dropped, a data: picture kept');

  // ---- heading ids as GitHub gives them: our slugger against npm's github-slugger (the one GitHub's tools use)
  const { slugger } = await load('/src/lib/mdslug.ts');
  const GS = (await import('github-slugger')).default;
  const heads = ['Hello World', 'Hello, World!', 'foo bar', 'foo bar', 'foo bar', 'Привет мир', '😄 emoji', 'C++ & C#', 'under_score', '  spaced  ', 'What works', 'Ünïcödé Àccents', '日本語 見出し', 'a-b—c', 'तालिका १', 'foo-bar-1', 'foo-bar', '', '', '#hash', 'Ünïcödé Àccents', 'ÀÉÎ', "It's (a) test.", 'x'.repeat(300), 'Ⅻ roman', '١٢٣ arabic digits', 'ǅ titlecase', 'Ꝃ ꝃ', 'İstanbul', 'ΣΊΣΥΦΟΣ'];
  for (let k = 0; k < 400; k++) heads.push(String.fromCodePoint(...Array.from({ length: 6 }, (_, i) => [0x41, 0x61, 0x30, 0x20, 0x2d, 0x5f, 0x2e, 0xe9, 0x416, 0x5d0, 0x627, 0x915, 0x93f, 0x4e00, 0x1f600, 0x300, 0x2019, 0x3000][(k * 7 + i * 13 + (k >> 2)) % 18])));
  const ours = slugger(), ref = new GS();
  const diff = heads.map((x) => [x, ours(x), ref.slug(x)]).filter(([, a, b]) => a !== b);
  t.eq(diff, [], `${heads.length} headings (with repeats, Unicode, emoji, marks): the same ids as github-slugger`);
};
