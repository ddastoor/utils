// Markdown Editor: GitHub Flavored Markdown rendered by cmark-gfm (C → our own wasm build). Live preview, toolbar,
// open .md, download .md / standalone .html, print or save as PDF (browser print of the preview only).
import { h, card, actions, button, segmented, toggle, filePicker, downloadBlob, shareOrDownload, baseName, toast, errMsg, type Mount } from '../ui';
import { markdown } from '../wasm/markdown';

const SAMPLE = `# Markdown Editor

Write in Markdown and see the formatted result as you type. Everything stays in this browser.

## What works
- **Bold**, *italic*, ~~strikethrough~~ and \`code\`
- [Links](https://commonmark.org) and autolinks like www.example.com
- [x] Task lists
- [ ] Tables, quotes, code blocks, footnotes[^1]

| Feature | Supported |
|---|:-:|
| Tables | ✓ |
| Footnotes | ✓ |

> Raw HTML is not rendered, so pasted text can never run scripts.

\`\`\`js
console.log('code blocks keep their language');
\`\`\`

[^1]: Footnotes appear at the end.
`;

/** Styles used by the preview and by the standalone HTML export. */
export const MD_CSS = `.markdown-body{font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1f2328;max-width:820px;margin:0 auto;overflow-wrap:anywhere}
.markdown-body h1,.markdown-body h2{border-bottom:1px solid #d1d9e0;padding-bottom:.3em}.markdown-body h1,.markdown-body h2,.markdown-body h3{margin:1.2em 0 .5em;line-height:1.25}
.markdown-body p,.markdown-body ul,.markdown-body ol,.markdown-body blockquote,.markdown-body pre,.markdown-body table{margin:0 0 1em}
.markdown-body code{font:.9em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:rgba(129,139,152,.15);padding:.15em .35em;border-radius:6px}
.markdown-body pre{background:#f6f8fa;padding:12px 14px;border-radius:8px;overflow:auto}.markdown-body pre code{background:none;padding:0}
.markdown-body blockquote{color:#59636e;border-left:4px solid #d1d9e0;padding:0 1em;margin-left:0}
.markdown-body table{border-collapse:collapse;display:block;overflow:auto}.markdown-body th,.markdown-body td{border:1px solid #d1d9e0;padding:6px 12px}.markdown-body tr:nth-child(2n){background:#f6f8fa}
.markdown-body img{max-width:100%}.markdown-body li>input[type=checkbox]{margin-right:.4em}.markdown-body ul:has(> li > input[type=checkbox]){list-style:none;padding-left:1.2em}
.markdown-body .footnotes{font-size:.9em;color:#59636e;border-top:1px solid #d1d9e0;margin-top:2em}`;

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export const mount: Mount = async (root, ctx) => {
  const md = await markdown();
  let smart = true, breaks = false, name = 'document', view: 'write' | 'preview' = 'write', tok = 0;
  const ta = h('textarea', { class: 'input textarea md-src', spellcheck: 'true', 'aria-label': 'Markdown text', rows: 24 }) as HTMLTextAreaElement;
  ta.value = SAMPLE;
  const preview = h('article', { class: 'markdown-body md-preview', 'aria-label': 'Preview' });
  const stats = h('div', { class: 'muted small' });
  const render = () => {
    const my = ++tok;
    queueMicrotask(() => {
      if (my !== tok) return;
      preview.innerHTML = md.html(ta.value, { smart, hardBreaks: breaks }); // safe: cmark drops raw HTML and unsafe URLs
      for (const a of preview.querySelectorAll('a[href]')) { if (!a.getAttribute('href')!.startsWith('#')) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); } }
      const words = [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(ta.value)].filter((s) => s.isWordLike).length;
      stats.textContent = `${words.toLocaleString()} words · ${ta.value.length.toLocaleString()} characters · ${Math.max(1, Math.round(words / 230))} min read`;
    });
  };
  ta.addEventListener('input', render);

  // toolbar: wrap the selection or insert at the start of each selected line
  const wrap = (before: string, after = before, placeholder = 'text') => {
    const { selectionStart: s, selectionEnd: e, value: v } = ta, sel = v.slice(s, e) || placeholder;
    ta.setRangeText(before + sel + after, s, e, 'end');
    ta.setSelectionRange(s + before.length, s + before.length + sel.length); ta.focus(); render();
  };
  const lines = (prefix: (i: number) => string) => {
    const { selectionStart: s, selectionEnd: e, value: v } = ta, a = v.lastIndexOf('\n', s - 1) + 1, b = v.indexOf('\n', e) < 0 ? v.length : v.indexOf('\n', e);
    const block = v.slice(a, b).split('\n').map((l, i) => prefix(i) + l).join('\n');
    ta.setRangeText(block, a, b, 'select'); ta.focus(); render();
  };
  const insert = (text: string) => { ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); ta.focus(); render(); };
  const tb = (icon: string, title: string, f: () => void) => button('', f, { icon, small: true, variant: 'ghost', title });
  const toolbar = h('div', { class: 'md-toolbar', role: 'toolbar', 'aria-label': 'Formatting' },
    tb('Bold', 'Bold (Ctrl+B)', () => wrap('**')), tb('Italic', 'Italic (Ctrl+I)', () => wrap('*')), tb('Strikethrough', 'Strikethrough', () => wrap('~~')),
    tb('Heading', 'Heading', () => lines(() => '## ')), tb('Link', 'Link (Ctrl+K)', () => wrap('[', '](https://)', 'link text')),
    tb('List', 'Bulleted list', () => lines(() => '- ')), tb('ListOrdered', 'Numbered list', () => lines((i) => `${i + 1}. `)), tb('ListTodo', 'Task list', () => lines(() => '- [ ] ')),
    tb('Quote', 'Quote', () => lines(() => '> ')), tb('Code', 'Code', () => wrap('`')), tb('SquareCode', 'Code block', () => wrap('\n```\n', '\n```\n', 'code')),
    tb('Table', 'Table', () => insert('\n| Column 1 | Column 2 |\n|---|---|\n| a | b |\n')), tb('Minus', 'Horizontal line', () => insert('\n\n---\n\n')));
  ta.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'b') { e.preventDefault(); wrap('**'); } else if (k === 'i') { e.preventDefault(); wrap('*'); } else if (k === 'k') { e.preventDefault(); wrap('[', '](https://)', 'link text'); }
  });

  const title = () => (/^#\s+(.+)$/m.exec(ta.value)?.[1] || name).trim();
  const standalone = () => `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title())}</title>\n<style>body{margin:0;padding:32px 16px}${MD_CSS}</style></head>\n<body><article class="markdown-body">\n${md.html(ta.value, { smart, hardBreaks: breaks })}</article></body></html>\n`;
  const save = (blob: Blob, file: string) => (ctx.isMobile ? shareOrDownload(blob, file) : downloadBlob(blob, file));
  const print = () => {
    render();
    document.documentElement.classList.add('print-md');
    const done = () => { document.documentElement.classList.remove('print-md'); removeEventListener('afterprint', done); };
    addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(done, 1000); }, 50);
  };
  const open = filePicker({ accept: '.md,.markdown,.txt,text/markdown,text/plain', label: 'Open a .md file', compact: true, onFiles: async ([f]) => {
    try { ta.value = await f.text(); name = baseName(f.name); render(); toast(`Opened ${f.name}`, 'ok'); } catch (e) { toast(errMsg(e), 'err'); }
  } });
  const editorPane = h('div', { class: 'md-pane md-edit' }, toolbar, ta);
  const previewPane = h('div', { class: 'md-pane md-view' }, preview);
  const setView = (v: typeof view) => { view = v; editorPane.hidden = ctx.isMobile && v !== 'write'; previewPane.hidden = ctx.isMobile && v !== 'preview'; };
  root.append(
    card(null, h('div', { class: 'row md-top' },
      ctx.isMobile ? segmented([['write', 'Write'], ['preview', 'Preview']], view, setView) : null,
      toggle('Smart quotes', smart, (v) => { smart = v; render(); }), toggle('Line breaks as typed', breaks, (v) => { breaks = v; render(); }), stats)),
    h('div', { class: 'md-split' }, editorPane, previewPane),
    card(null, open),
    actions(
      button(ctx.isMobile ? '.md' : 'Download .md', () => save(new Blob([ta.value], { type: 'text/markdown;charset=utf-8' }), `${name}.md`), { icon: 'Download' }),
      button(ctx.isMobile ? '.html' : 'Download .html', () => save(new Blob([standalone()], { type: 'text/html;charset=utf-8' }), `${name}.html`), { icon: 'FileCode' }),
      button(ctx.isMobile ? 'PDF' : 'Print / PDF', print, { icon: 'Printer', variant: 'primary' })),
  );
  setView('write'); render();
};
