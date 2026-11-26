// Markdown Editor: GitHub Flavored Markdown rendered by cmark-gfm (C → our own wasm build). Live preview, toolbar
// (each button undoable with Ctrl+Z, a second press takes the formatting off), open .md, download .md / standalone
// .html, print or save as PDF (the preview only — also with Ctrl+P). The rendered HTML is parsed into an inert
// document first: pictures from other sites are not fetched (shown as a note), links inside the document scroll the
// preview (a "#fn-1" in the address would have taken the app to its start page), headings get GitHub's ids.
// Copy (to-do #29): the rendered document with its formatting, for Word, Google Docs or an e-mail (src/lib/mdcopy.ts),
// or — with "Copy with formatting" off — the Markdown as typed.
import { h, card, actions, button, segmented, toggle, filePicker, downloadBlob, shareOrDownload, baseName, toast, errMsg, copy, type Mount } from '../ui';
import { forPasting, readingText, copyBoth } from '../lib/mdcopy';
import { markdown } from '../wasm/markdown';
import { decodeText } from '../lib/sheetdata';
import { slugger } from '../lib/mdslug';

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

/** Headings get GitHub's ids (so [x](#a-heading) works) — with `prefix` in the preview, where they share the page with
 *  the app. */
function headingIds(root: ParentNode, prefix: string) {
  const slug = slugger();
  for (const hd of root.querySelectorAll('h1, h2, h3, h4, h5, h6')) if (!hd.id) hd.id = prefix + slug(hd.textContent || '');
  if (prefix) for (const el of root.querySelectorAll('[id]')) if (!el.id.startsWith(prefix)) el.id = prefix + el.id;
}
const SIZE_LIVE = 200000; // longer texts are rendered when the typing pauses

/** What assistive technology needs in the rendered HTML (axe-core's findings): cmark-gfm writes a fenced block's
 *  language as `<pre lang="js">`, GitHub's way — but `lang` names the *human* language, so a screen reader switched its
 *  voice to "js"; it becomes `class="language-js"` on the code (and `data-lang`). A task list's checkbox had no name: it
 *  takes its item's text. */
function tidyA11y(root: Element) {
  for (const pre of root.querySelectorAll('pre[lang]')) {
    const lang = pre.getAttribute('lang') || ''; pre.removeAttribute('lang');
    if (lang) { pre.setAttribute('data-lang', lang); pre.querySelector('code')?.classList.add(`language-${lang.replace(/[^\w+#.-]/g, '')}`); }
  }
  for (const box of root.querySelectorAll('li > input[type=checkbox]')) {
    const text = (box.parentElement?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (text) box.setAttribute('aria-label', text);
  }
}
/** "Copy with formatting": kept while the page is open (to-do #29) */
let copyRich = true;

export const mount: Mount = async (root, ctx) => {
  const md = await markdown();
  let smart = true, breaks = false, name = 'document', view: 'write' | 'preview' = 'write', tok = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const ta = h('textarea', { class: 'input textarea md-src', spellcheck: 'true', 'aria-label': 'Markdown text', rows: 24 }) as HTMLTextAreaElement;
  ta.value = SAMPLE;
  const preview = h('article', { class: 'markdown-body md-preview', 'aria-label': 'Preview' });
  const stats = h('div', { class: 'muted small' }), away = h('div', { class: 'muted small', hidden: true });
  const draw = () => {
    const html = md.html(ta.value, { smart, hardBreaks: breaks });
    // an inert document: nothing is fetched while it is tidied (cmark has already dropped raw HTML and unsafe links)
    const doc = new DOMParser().parseFromString(html, 'text/html');
    let other = 0;
    for (const img of doc.querySelectorAll('img')) {
      const src = img.getAttribute('src') || '';
      if (/^data:image\//i.test(src)) continue;
      other++;
      const note = doc.createElement('span'); note.className = 'md-img'; note.title = src;
      note.textContent = `🖼 ${img.getAttribute('alt') || 'picture'}`;
      img.replaceWith(note);
    }
    for (const a of doc.querySelectorAll('a[href]')) if (!a.getAttribute('href')!.startsWith('#')) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); }
    headingIds(doc.body, 'md-');
    tidyA11y(doc.body);
    preview.replaceChildren(...doc.body.childNodes);
    away.hidden = !other;
    away.textContent = other ? `${other === 1 ? 'A picture' : `${other} pictures`} from another place ${other === 1 ? 'is' : 'are'} not shown here (this page loads nothing from other sites); the downloaded .html shows ${other === 1 ? 'it' : 'them'}.` : '';
    const words = [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(preview.textContent || '')].filter((s) => s.isWordLike).length;
    stats.textContent = `${words.toLocaleString('en-IN')} word${words === 1 ? '' : 's'} · ${ta.value.length.toLocaleString('en-IN')} characters${words ? ` · ${Math.max(1, Math.round(words / 230))} min read` : ''}`;
  };
  const render = () => {
    const my = ++tok; clearTimeout(timer);
    if (ta.value.length > SIZE_LIVE) { timer = setTimeout(() => { if (my === tok) draw(); }, 300); return; }
    queueMicrotask(() => { if (my === tok) draw(); });
  };
  ta.addEventListener('input', render);
  // links inside the document scroll the preview (in the address they would leave the tab)
  preview.addEventListener('click', (e) => {
    const a = (e.target as Element).closest?.('a[href^="#"]'); if (!a) return;
    e.preventDefault();
    let id = a.getAttribute('href')!.slice(1); try { id = decodeURIComponent(id); } catch { /* as typed */ }
    const target = preview.querySelector(`[id="${CSS.escape('md-' + id)}"]`); if (!target) return;
    // the preview pane scrolls (PC); where it does not (phones) the page does
    const pane = preview.parentElement!;
    if (pane.scrollHeight > pane.clientHeight + 1) pane.scrollTo({ top: pane.scrollTop + target.getBoundingClientRect().top - pane.getBoundingClientRect().top - 8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    else target.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });

  // editing that Ctrl+Z can undo: the browser's own insertText, else setRangeText
  const replace = (text: string, a: number, b: number) => {
    ta.focus(); ta.setSelectionRange(a, b);
    // (a text of megabytes goes in at once, without undo: the browser's insertText is slow for it)
    if (text.length > 1e6 || !document.execCommand?.('insertText', false, text) || ta.value.slice(a, a + text.length) !== text) ta.setRangeText(text, a, b, 'end');
  };
  // inline formatting: wrap the selection; a second press takes the marks off again
  const wrap = (mark: string, after = mark, placeholder = 'text') => {
    const { selectionStart: s, selectionEnd: e, value: v } = ta, sel = v.slice(s, e), n = mark.length;
    const stars = (str: string, from: number, step: number) => { let k = 0; while (str[from + k * step] === '*') k++; return k; };
    // asterisks: 1 or 3 around the text → italic, 2 or 3 → bold; other marks: exactly those marks around it
    const isOn = (k: number) => (mark === '*' ? k % 2 === 1 : k >= 2);
    const star = mark === '*' || mark === '**';
    const outside = star ? isOn(Math.min(stars(v, s - 1, -1), stars(v, e, 1))) : v.slice(s - n, s) === mark && v.slice(e, e + after.length) === after;
    const inside = sel.length > n + after.length && (star ? isOn(Math.min(stars(sel, 0, 1), stars(sel, sel.length - 1, -1))) : sel.startsWith(mark) && sel.endsWith(after));
    if (outside) { replace(sel, s - n, e + after.length); ta.setSelectionRange(s - n, e - n); }
    else if (inside) { const inner = sel.slice(n, sel.length - after.length); replace(inner, s, e); ta.setSelectionRange(s, s + inner.length); }
    else { const t = sel || placeholder; replace(mark + t + after, s, e); ta.setSelectionRange(s + n, s + n + t.length); }
    render();
  };
  // line formatting: every selected line; when all of them already have it, it comes off
  const lines = (add: (i: number) => string, has: RegExp) => {
    const { selectionStart: s, selectionEnd: e, value: v } = ta, a = v.lastIndexOf('\n', s - 1) + 1, b = v.indexOf('\n', e) < 0 ? v.length : v.indexOf('\n', e);
    const ls = v.slice(a, b).split('\n'), full = ls.filter((l) => l.trim());
    const off = full.length > 0 && full.every((l) => has.test(l));
    let n = 0;
    const heading = has.source.startsWith('^#');   // a heading of another level becomes this one
    const block = ls.map((l) => (!l.trim() ? l : off ? l.replace(has, '') : add(n++) + (heading ? l.replace(has, '') : l))).join('\n');
    replace(block, a, b); ta.setSelectionRange(a, a + block.length); render();
  };
  const insert = (text: string) => { replace(text, ta.selectionStart, ta.selectionEnd); render(); };
  const tb = (icon: string, title: string, f: () => void) => button('', f, { icon, small: true, variant: 'ghost', title });
  const toolbar = h('div', { class: 'md-toolbar', role: 'toolbar', 'aria-label': 'Formatting' },
    tb('Bold', 'Bold (Ctrl+B)', () => wrap('**')), tb('Italic', 'Italic (Ctrl+I)', () => wrap('*')), tb('Strikethrough', 'Strikethrough', () => wrap('~~')),
    tb('Heading', 'Heading', () => lines(() => '## ', /^#{1,6}\s+/)), tb('Link', 'Link (Ctrl+K)', () => wrap('[', '](https://)', 'link text')),
    tb('List', 'Bulleted list', () => lines(() => '- ', /^[-*+]\s+(?!\[[ xX]\]\s)/)), tb('ListOrdered', 'Numbered list', () => lines((i) => `${i + 1}. `, /^\d{1,9}[.)]\s+/)), tb('ListTodo', 'Task list', () => lines(() => '- [ ] ', /^[-*+]\s+\[[ xX]\]\s+/)),
    tb('Quote', 'Quote', () => lines(() => '> ', /^>\s?/)), tb('Code', 'Code', () => wrap('`')), tb('SquareCode', 'Code block', () => wrap('\n```\n', '\n```\n', 'code')),
    tb('Table', 'Table', () => insert('\n| Column 1 | Column 2 |\n|---|---|\n| a | b |\n')), tb('Minus', 'Horizontal line', () => insert('\n\n---\n\n')));
  ta.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    // (the app's Ctrl+K — focus the search box — leaves a key the editor took alone)
    if (k === 'b') { e.preventDefault(); wrap('**'); } else if (k === 'i') { e.preventDefault(); wrap('*'); } else if (k === 'k') { e.preventDefault(); wrap('[', '](https://)', 'link text'); }
  });

  const standalone = () => {
    const doc = new DOMParser().parseFromString(md.html(ta.value, { smart, hardBreaks: breaks }), 'text/html');
    headingIds(doc.body, '');
    tidyA11y(doc.body);
    const t = (doc.querySelector('h1')?.textContent || name).trim();
    return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(t)}</title>\n<style>body{margin:0;padding:32px 16px}${MD_CSS}</style></head>\n<body><article class="markdown-body">\n${doc.body.innerHTML}</article></body></html>\n`;
  };
  const save = (blob: Blob, file: string) => (ctx.isMobile ? shareOrDownload(blob, file) : downloadBlob(blob, file));
  const copyDoc = async () => {
    if (!copyRich) { await copy(ta.value); return; }
    try {
      const doc = new DOMParser().parseFromString(md.html(ta.value, { smart, hardBreaks: breaks }), 'text/html');
      forPasting(doc.body);
      await copyBoth(`<html><head><meta charset="utf-8"></head><body>${doc.body.innerHTML}</body></html>`, readingText(doc.body));
      toast('Copied with formatting — paste it into Word, Google Docs or an e-mail', 'ok');
    } catch (e) { toast(`Could not copy: ${errMsg(e)}`, 'err'); }
  };
  // printing (the button, Ctrl+P or the browser's menu) shows the preview only
  const before = () => { clearTimeout(timer); draw(); document.documentElement.classList.add('print-md'); };
  const after = () => document.documentElement.classList.remove('print-md');
  addEventListener('beforeprint', before); addEventListener('afterprint', after);
  const openFile = async (f: File) => {
    try {
      const { text, how } = decodeText(new Uint8Array(await f.arrayBuffer()));
      replace(text.replace(/\r\n?/g, '\n'), 0, ta.value.length); ta.setSelectionRange(0, 0); ta.scrollTop = 0;
      name = baseName(f.name); render();
      toast(`Opened ${f.name}${how ? ` (read as ${how})` : ''} — Ctrl+Z brings back the text before`, 'ok');
    } catch (e) { toast(`${f.name}: ${errMsg(e)}`, 'err'); }
  };
  const open = filePicker({ accept: '.md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain', label: 'Open a .md file', compact: true, onFiles: ([f]) => openFile(f) });
  // a file dropped on the editor is opened (the browser would otherwise put its name in, or leave the page)
  ta.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  ta.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (f) { e.preventDefault(); openFile(f); } });
  const editorPane = h('div', { class: 'md-pane md-edit' }, toolbar, ta);
  const previewPane = h('div', { class: 'md-pane md-view' }, away, preview);
  const setView = (v: typeof view) => { view = v; editorPane.hidden = ctx.isMobile && v !== 'write'; previewPane.hidden = ctx.isMobile && v !== 'preview'; };
  root.append(
    card(null, h('div', { class: 'row md-top' },
      ctx.isMobile ? segmented([['write', 'Write'], ['preview', 'Preview']], view, setView) : null,
      toggle('Smart quotes', smart, (v) => { smart = v; render(); }), toggle('Line breaks as typed', breaks, (v) => { breaks = v; render(); }),
      toggle('Copy with formatting', copyRich, (v) => { copyRich = v; }), stats)),
    h('div', { class: 'md-split' }, editorPane, previewPane),
    card(null, open),
    actions(
      button('Copy', () => copyDoc(), { icon: 'Copy', title: 'Copy the document — with its formatting (for Word, Google Docs, an e-mail), or the Markdown as typed when "Copy with formatting" is off' }),
      button(ctx.isMobile ? '.md' : 'Download .md', () => save(new Blob([ta.value], { type: 'text/markdown;charset=utf-8' }), `${name}.md`), { icon: 'Download' }),
      button(ctx.isMobile ? '.html' : 'Download .html', () => save(new Blob([standalone()], { type: 'text/html;charset=utf-8' }), `${name}.html`), { icon: 'FileCode' }),
      button(ctx.isMobile ? 'PDF' : 'Print / PDF', () => window.print(), { icon: 'Printer', variant: 'primary' })),
  );
  setView('write'); draw();
  return () => { clearTimeout(timer); removeEventListener('beforeprint', before); removeEventListener('afterprint', after); after(); };
};
