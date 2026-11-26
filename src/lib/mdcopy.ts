// Markdown Editor: "Copy with formatting" (to-do #29; owner, 26 Nov 2026: "The user should additionally be able to copy
// the rendered markdown with formatting so that he can paste it in, say, another Microsoft Word or any rich text setting.
// so basically a 'copy with formatting' toggle"). The rendered document made for pasting:
// - styles written on each element: Word, Google Docs, Outlook and Gmail drop style sheets. Headings, lists, bold,
//   italic and links are left to the place it is pasted into (Word makes <h1> its Heading 1, Google Docs too);
// - task-list boxes as ☐ / ☑; footnote references as superscript numbers, the notes at the end after a rule;
// - no ids, and links inside the document taken off (they lead nowhere once pasted);
// - a code block's language moved out of `lang` (it names a human language: Word would proof the code as "js").
const MONO = "Consolas, 'Courier New', monospace";
const STYLE: Record<string, string> = {
  code: `font-family: ${MONO}; background: #f3f4f6; padding: 0 3px;`,
  pre: `font-family: ${MONO}; background: #f6f8fa; padding: 8px 10px; white-space: pre-wrap;`,
  blockquote: 'border-left: 4px solid #d0d7de; margin-left: 0; padding-left: 12px; color: #57606a;',
  table: 'border-collapse: collapse;',
  th: 'border: 1px solid #8c959f; padding: 4px 8px; background: #f3f4f6; font-weight: bold;',
  td: 'border: 1px solid #8c959f; padding: 4px 8px;',
  del: 'text-decoration: line-through;',
  hr: 'border: 0; border-top: 1px solid #d0d7de;',
};

/** Turns cmark-gfm's HTML (in `body`, a DOMParser document — nothing is fetched there) into what pastes well. */
export function forPasting(body: HTMLElement): void {
  const doc = body.ownerDocument;
  for (const pre of body.querySelectorAll('pre[lang]')) { pre.setAttribute('data-lang', pre.getAttribute('lang') || ''); pre.removeAttribute('lang'); }
  for (const box of body.querySelectorAll('input[type=checkbox]')) { // the space before the item's text is cmark's own
    const next = box.nextSibling, spaced = next?.nodeType === 3 && /^\s/.test(next.textContent || '');
    box.replaceWith(doc.createTextNode((box.hasAttribute('checked') ? '☑' : '☐') + (spaced ? '' : ' ')));
  }
  for (const back of body.querySelectorAll('a.footnote-backref, a[data-footnote-backref]')) back.remove();
  for (const a of body.querySelectorAll('a[href^="#"]')) a.replaceWith(...a.childNodes); // footnote references keep their <sup>
  for (const el of body.querySelectorAll('[id]')) el.removeAttribute('id');
  for (const el of body.querySelectorAll('[data-footnote-ref], [data-footnotes]')) { el.removeAttribute('data-footnote-ref'); el.removeAttribute('data-footnotes'); }
  for (const sec of body.querySelectorAll('section.footnotes')) { const hr = doc.createElement('hr'); sec.before(hr); }
  // a column's alignment: cmark-gfm writes it as style="text-align: …" (or align="…")
  for (const cell of body.querySelectorAll('th, td')) {
    const a = cell.getAttribute('align') || /text-align:\s*(left|right|center)/.exec(cell.getAttribute('style') || '')?.[1];
    if (a) cell.setAttribute('data-align', a);
  }
  for (const [tag, css] of Object.entries(STYLE)) for (const el of body.querySelectorAll(tag)) el.setAttribute('style', css);
  for (const c of body.querySelectorAll('pre code')) c.setAttribute('style', `font-family: ${MONO};`); // no second background inside a block
  for (const cell of body.querySelectorAll('[data-align]')) { cell.setAttribute('style', `${cell.getAttribute('style')} text-align: ${cell.getAttribute('data-align')};`); cell.setAttribute('align', cell.getAttribute('data-align')!); cell.removeAttribute('data-align'); }
}

/** The same document as plain text, as it reads: laid out off the screen for a moment (innerText needs a layout), with
 *  pictures as their descriptions (a picture put into the page would be fetched). */
export function readingText(body: HTMLElement): string {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;white-space:normal';
  const copy = body.cloneNode(true) as HTMLElement;
  for (const img of copy.querySelectorAll('img')) img.replaceWith(document.createTextNode(img.getAttribute('alt') || ''));
  host.append(...copy.childNodes);
  document.body.append(host);
  try { return host.innerText.replace(/\n{3,}/g, '\n\n').trim() + '\n'; } finally { host.remove(); }
}

/** HTML and plain text onto the clipboard together (rich-text programs take the HTML, plain ones the text). Where the
 *  browser has no ClipboardItem (or refuses it) the page's own copy event carries both. */
export async function copyBoth(html: string, text: string): Promise<void> {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) throw new Error('no ClipboardItem');
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
  } catch {
    let done = false;
    const on = (e: ClipboardEvent) => { e.clipboardData?.setData('text/html', html); e.clipboardData?.setData('text/plain', text); e.preventDefault(); done = true; };
    document.addEventListener('copy', on, { once: true });
    try { document.execCommand('copy'); } finally { document.removeEventListener('copy', on); }
    if (!done) throw new Error('this browser did not let the page copy');
  }
}
