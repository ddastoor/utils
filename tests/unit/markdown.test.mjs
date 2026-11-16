// markdown.wasm (cmark-gfm built by us): CommonMark + GFM known answers and the safety guarantees the app relies on.
export default async (t, { load, wasm }) => {
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
};
