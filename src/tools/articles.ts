// Articles → Kindle (potentials #106; owner, 21 Nov 2026): web articles saved on this device — Chrome's or Edge's single
// file (.mhtml; Chrome on Android saves pages so), Safari's web archive, a page saved "complete" with its folder, HTML
// only, a pasted selection, a text file — made into one EPUB for Send to Kindle: the article alone (Mozilla's Reader View
// engine, article.wasm), with its pictures, title, author and date; several articles make one book with a contents page.
// Nothing leaves the device. PC and phones.
import { h, card, field, stack, note, actions, button, toggle, input, textarea, progress, clear, downloadBlob, shareOrDownload, fmtBytes, filePicker, toast, errMsg, type Mount } from '../ui';
import { articleEngine, NoArticle, type ArticleEngine, type SavedPart } from '../wasm/article';
import { pagesOf, pastedPage, articleOf, makeEpub, byline, dateText, minutes, pictureType, type Article, type Page, type InFile, type Convert } from '../lib/articles';
import { loadImg, resizeImg, encodeImg } from '../lib/imgio';
import { safeName } from '../lib/docrules';
import { plural } from '../lib/dates';
import { give } from '../lib/handoff';

const ACCEPT = '.mhtml,.mht,.webarchive,.html,.htm,.xhtml,.shtml,.txt,text/html,multipart/related,application/x-mimearchive,image/*';
// kept while the page is open (through other tabs): pictures and the cover
let keepPictures = true, makeCover = true;
// a picture in the book: at most this size (a Kindle Scribe's width; a tall infographic may run over several screens)
const MAXW = 1600, MAXH = 2400;

interface Item { page: Page; article: Article; title: string; author: string }
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** The files of a drop, a folder's too (with their paths — a page saved "complete" with its "…_files" folder). */
async function dropped(dt: DataTransfer): Promise<File[]> {
  const out: File[] = [];
  const entries = [...dt.items].map((i) => (i.kind === 'file' ? (i as any).webkitGetAsEntry?.() : null)).filter(Boolean);
  if (!entries.length) return [...dt.files];
  const walk = async (e: any, path: string): Promise<void> => {
    if (e.isFile) { const f: File = await new Promise((res, rej) => e.file(res, rej)); Object.defineProperty(f, 'relPath', { value: path + f.name }); out.push(f); return; }
    if (e.isDirectory) {
      const reader = e.createReader();
      for (;;) {
        const batch: any[] = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const c of batch) await walk(c, `${path}${e.name}/`);
      }
    }
  };
  for (const e of entries) await walk(e, '');
  return out;
}

/** A picture in a size for an e-reader: JPEG, PNG and GIF that fit are kept byte for byte; anything else (WebP, AVIF,
 *  SVG, a large picture) is drawn again — JPEG, or PNG when it has transparency. Tracking pixels are left out. */
const convert: Convert = async (f: SavedPart) => {
  const type = pictureType(f.bytes) || f.type;
  let img;
  if (type === 'image/svg+xml') {
    const url = URL.createObjectURL(new Blob([f.bytes as BlobPart], { type }));
    try {
      const im = new Image(); im.src = url; await im.decode();
      const w = im.naturalWidth || 1000, hh = im.naturalHeight || Math.round(w * 0.66), s = Math.min(2, MAXW / w, MAXH / hh);
      const c = new OffscreenCanvas(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(hh * s))), g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(im, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height);
      img = { data: d.data, width: d.width, height: d.height };
    } finally { URL.revokeObjectURL(url); }
  } else img = await loadImg(new Blob([f.bytes as BlobPart], { type: type || 'application/octet-stream' }));
  if (img.width < 3 || img.height < 3 || img.width * img.height <= 64) return null;
  if ((type === 'image/jpeg' || type === 'image/png' || type === 'image/gif') && img.width <= MAXW && img.height <= MAXH && f.bytes.length <= 2_500_000) return { bytes: f.bytes, mime: type, w: img.width, h: img.height };
  const s = Math.min(1, MAXW / img.width, MAXH / img.height);
  if (s < 1) img = await resizeImg(img, img.width * s, img.height * s);
  let alpha = false;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] < 250) { alpha = true; break; }
  const blob = await encodeImg(img, alpha ? 'png' : 'jpeg', 82);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: alpha ? 'image/png' : 'image/jpeg', w: img.width, h: img.height };
};

/** A cover: the book's title and the articles in it, drawn on a canvas (2 : 3, as e-book shops ask). */
async function cover(title: string, lines: string[], sub: string): Promise<{ bytes: Uint8Array; mime: 'image/jpeg' }> {
  const W = 1200, H = 1800, c = new OffscreenCanvas(W, H), g = c.getContext('2d')!;
  g.fillStyle = '#f6f3ec'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1d3557'; g.fillRect(0, 0, W, 300); g.fillRect(0, H - 60, W, 60);
  const wrap = (text: string, font: string, max: number, maxLines: number) => {
    g.font = font;
    const words = text.split(/\s+/), out: string[] = [];
    let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (g.measureText(t).width <= max || !line) line = t; else { out.push(line); line = w; }
      if (out.length === maxLines) break;
    }
    if (line && out.length < maxLines) out.push(line);
    if (out.length === maxLines && words.join(' ') !== out.join(' ')) out[maxLines - 1] = out[maxLines - 1].replace(/\s*\S*$/, '') + ' …';
    return out;
  };
  g.fillStyle = '#ffffff'; g.font = '600 46px Georgia, "Times New Roman", serif'; g.textBaseline = 'middle';
  g.fillText(sub, 80, 150);
  g.fillStyle = '#1b1b1b';
  let y = 420;
  for (const l of wrap(title, 'bold 92px Georgia, "Times New Roman", serif', W - 160, 4)) { g.fillText(l, 80, y); y += 110; }
  y += 40;
  g.fillStyle = '#3a3a3a';
  for (const t of lines.slice(0, 9)) {
    const ls = wrap(t, '40px Georgia, "Times New Roman", serif', W - 200, 2);
    if (y + 54 * ls.length > H - 120) break;
    g.fillText('•', 76, y);
    for (const l of ls) { g.fillText(l, 110, y); y += 54; }
    y += 26;
  }
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg' };
}

export const mount: Mount = (root, ctx) => {
  let items: Item[] = [], live = true, pasted = 0, busy: Promise<void> = Promise.resolve();
  const blobUrls = new Set<string>();
  const status = h('div', { class: 'stack', role: 'status', 'aria-live': 'polite' });
  const list = h('div', { class: 'art-list' });
  const prog = progress(), result = h('div', { class: 'stack' });
  const titleIn = input({ placeholder: 'The book’s title', attrs: { 'aria-label': 'The book’s title' }, onInput: () => (titleIn.dataset.typed = '1') }) as HTMLInputElement;
  const authorIn = input({ placeholder: 'Author', attrs: { 'aria-label': 'Author' }, onInput: () => (authorIn.dataset.typed = '1') }) as HTMLInputElement;
  const engine = (): Promise<ArticleEngine> => articleEngine();

  /** The book's title and author follow the articles until the reader types their own. */
  const defaults = () => {
    if (!titleIn.dataset.typed) titleIn.value = items.length === 1 ? items[0].title : items.length ? `Articles — ${dateText(today())}` : '';
    if (!authorIn.dataset.typed) {
      const names = [...new Set(items.map((i) => i.author || i.article.site).filter(Boolean))];
      authorIn.value = items.length === 1 ? names[0] || '' : names.length <= 3 ? names.join(', ') : 'Various';
    }
  };

  const say = (text: string, kind: 'info' | 'warn' | 'ok' | 'err' = 'info') => { status.append(note(text, kind)); };

  /** One article's card: its title (editable), the line under it, what to know about it, its place and a preview. */
  const render = () => {
    clear(list);
    clear(result);
    defaults();
    if (!items.length) { list.append(h('p', { class: 'muted small' }, 'No article yet — choose saved pages above, or paste one.')); return; }
    items.forEach((it, k) => {
      const a = it.article;
      const found = a.pictures.filter((p) => p.file).length, all = a.pictures.length;
      const tips: string[] = [];
      if (!a.readable && !a.whole) tips.push('Reader View is not sure this page is an article — look at the preview.');
      if (all && !found) tips.push(a.via === 'html' ? 'Its pictures were not saved with the page (saved as HTML only) — save it as a single file (.mhtml) or a web archive to keep them.' : a.via === 'paste' ? 'Its pictures stay on the website (a pasted selection brings only text and links).' : 'None of its pictures was saved with the page.');
      else if (found < all) tips.push(`${found} of ${plural(all, 'picture')} were saved with the page.`);
      const embeds = a.dropped.videos + a.dropped.embeds;
      if (embeds) tips.push(embeds === 1 ? 'A video or embedded post is a link in the book.' : `${embeds} videos and embedded posts are links in the book.`);
      const tIn = input({ value: it.title, attrs: { 'aria-label': `Title of article ${k + 1}` }, onInput: (v) => { it.title = v; defaults(); } });
      const preview = h('div', { class: 'art-preview', lang: a.lang || null, dir: a.dir || null });
      const det = h('details', { class: 'art-details' }, h('summary', null, 'Preview'), preview);
      det.addEventListener('toggle', () => { if (det.open && !preview.childNodes.length) showPreview(it, preview); });
      const whole = toggle('Use the whole page (when Reader View left out part of the article)', a.whole, (v) => { void redo(it, v); });
      list.append(h('div', { class: 'art-item' },
        h('div', { class: 'art-head' }, h('span', { class: 'art-num' }, String(k + 1)), tIn),
        h('div', { class: 'muted small' }, [byline({ ...a, author: it.author }), all ? `${found} of ${plural(all, 'picture')}` : 'no pictures', a.name].filter(Boolean).join(' · ')),
        ...tips.map((t) => h('div', { class: 'small art-tip' }, t)),
        a.via === 'paste' || a.via === 'text' ? null : whole,
        h('div', { class: 'row' },
          button('', () => move(k, -1), { icon: 'ArrowUp', title: `Move article ${k + 1} up`, disabled: k === 0, small: true }),
          button('', () => move(k, 1), { icon: 'ArrowDown', title: `Move article ${k + 1} down`, disabled: k === items.length - 1, small: true }),
          button('Remove', () => { items.splice(k, 1); render(); }, { icon: 'Trash2', small: true })),
        det));
    });
  };
  const move = (k: number, d: number) => { const j = k + d; if (j < 0 || j >= items.length) return; [items[k], items[j]] = [items[j], items[k]]; render(); };

  /** The article as the book will show it (pictures from the saved files; links open in a new tab). */
  const showPreview = (it: Item, box: HTMLElement) => {
    const a = it.article;
    const doc = new DOMParser().parseFromString(`<!DOCTYPE html><html><body><div>${a.xhtml}</div></body></html>`, 'text/html');
    for (const img of [...doc.querySelectorAll('img')]) {
      const n = /⟦(\d+)⟧/.exec(img.getAttribute('src') || '')?.[1];
      const p = n != null ? a.pictures[+n] : null;
      if (!p?.file || !keepPictures) { img.remove(); continue; }
      const url = URL.createObjectURL(new Blob([p.file.bytes as BlobPart], { type: pictureType(p.file.bytes) || p.file.type }));
      blobUrls.add(url); img.src = url; img.loading = 'lazy';
    }
    for (const l of doc.querySelectorAll('a[href]')) { const hr = l.getAttribute('href')!; if (hr.startsWith('#')) l.removeAttribute('href'); else { l.setAttribute('target', '_blank'); l.setAttribute('rel', 'noopener noreferrer'); } }
    clear(box).append(h('h2', null, it.title), h('p', { class: 'muted small' }, byline({ ...a, author: it.author })), ...[...doc.body.firstElementChild!.childNodes].map((x) => document.importNode(x, true)));
  };

  /** Read an article again, the whole page or Reader View's choice. */
  const redo = async (it: Item, whole: boolean) => {
    try {
      const e = await engine();
      const a = articleOf(e, it.page, whole);
      it.article = a;
    } catch (err) {
      toast(err instanceof NoArticle ? 'Reader View found no article in this page.' : errMsg(err), 'err');
    }
    render();
  };

  /** Pages to articles: Reader View's article, or the whole page when it finds none. */
  const add = async (pages: Page[]) => {
    const e = await engine();
    let n = 0;
    for (const p of pages) {
      if (!live) return;
      let a: Article;
      try { a = articleOf(e, p); }
      catch (err) {
        if (!(err instanceof NoArticle)) { say(`${p.name}: ${errMsg(err)}`, 'err'); continue; }
        try { a = articleOf(e, p, true); say(`${p.name}: Reader View found no article in it — the whole page is used.`, 'warn'); }
        catch (err2) { say(`${p.name}: ${errMsg(err2)}`, 'err'); continue; }
      }
      if (!a.words && !a.pictures.length) { say(`${p.name}: no text was found in it.`, 'warn'); continue; }
      items.push({ page: p, article: a, title: a.title, author: a.author });
      n++;
      await new Promise((r) => setTimeout(r, 0));
    }
    if (n) render();
  };

  const onFiles = (fs: File[]) => (busy = busy.then(async () => {
    clear(status);
    prog.set(null, `Reading ${plural(fs.length, 'file')}…`);
    try {
      const files: InFile[] = [];
      for (const f of fs) files.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), path: (f as any).relPath || f.webkitRelativePath || '' });
      const e = await engine();
      const { pages, skipped } = pagesOf(files, e);
      for (const s of skipped) say(`${s.name}: ${s.why}.`, 'warn');
      await add(pages);
    } catch (err) { say(errMsg(err), 'err'); } finally { prog.done(); }
  }));

  const pick = filePicker({ accept: ACCEPT, multiple: true, label: 'Choose saved web pages', hint: '.mhtml, .webarchive or .html — or drop them here (a page’s “_files” folder too)', onFiles });
  // a dropped folder: its files with their paths (the browser gives only the folder's name otherwise)
  pick.addEventListener('drop', (ev) => {
    const dt = (ev as DragEvent).dataTransfer;
    if (!dt || ![...dt.items].some((i) => (i as any).webkitGetAsEntry?.()?.isDirectory)) return;
    ev.preventDefault(); ev.stopImmediatePropagation(); pick.classList.remove('over');
    void dropped(dt).then(onFiles).catch((err) => say(errMsg(err), 'err'));
  }, true);
  const folderIn = h('input', { type: 'file', hidden: true, webkitdirectory: true, multiple: true }) as HTMLInputElement;
  folderIn.addEventListener('change', () => { if (folderIn.files?.length) onFiles([...folderIn.files]); folderIn.value = ''; });
  const folderBtn = ctx.isMobile ? null : button('Choose a folder', () => folderIn.click(), { icon: 'FolderOpen', title: 'A page saved “complete”: the folder with the .html file and its “_files” folder' });

  // a selection copied on a web page and pasted here
  const paste = textarea({ rows: 3, placeholder: 'Or paste an article here: select it on the web page, copy it, and paste it into this box.' });
  paste.setAttribute('aria-label', 'Paste an article');
  paste.addEventListener('paste', (ev) => {
    const cd = ev.clipboardData;
    if (!cd) return;
    const html = cd.getData('text/html'), text = cd.getData('text/plain');
    if (!html.trim() && !text.trim()) return;
    ev.preventDefault();
    busy = busy.then(async () => { clear(status); try { await add([pastedPage(html, text, ++pasted)]); } catch (err) { say(errMsg(err), 'err'); } });
  });
  const addTyped = button('Add the text in the box', () => {
    const t = paste.value;
    if (!t.trim()) throw new Error('The box is empty — paste an article into it first.');
    paste.value = '';
    busy = busy.then(async () => { clear(status); await add([pastedPage('', t, ++pasted)]); });
    return busy;
  }, { icon: 'Plus', small: true });

  const howTo = h('details', { class: 'art-how' }, h('summary', null, 'How to save a web page on this device'),
    h('ul', null,
      h('li', null, h('strong', null, 'Chrome or Edge on a PC: '), 'Ctrl+S (⌘S on a Mac) → Save as type “Webpage, Single File” (.mhtml) — the page and its pictures in one file.'),
      h('li', null, h('strong', null, 'Chrome on Android: '), '⋮ → ↓ (Download). The page is saved in Downloads as .mhtml.'),
      h('li', null, h('strong', null, 'Safari on an iPhone or iPad: '), 'Share → Options → “Web Archive”, then Save to Files.'),
      h('li', null, h('strong', null, 'Safari on a Mac: '), 'File → Save As… → Format “Web Archive”.'),
      h('li', null, h('strong', null, 'Firefox: '), 'Ctrl+S → “Web Page, complete”, then choose the .html file together with its “…_files” folder — or drop both here.'),
      h('li', null, h('strong', null, 'Any browser: '), 'select the article, copy it and paste it into the box below — its text and links (its pictures stay on the website).')));

  root.append(
    card(null,
      note('Web articles saved on this device made into one e-book for a Kindle: the article alone — no adverts, menus or pop-ups — with its pictures, title, author and date (Mozilla’s Reader View engine, as in Firefox). Several articles make one book with a contents page. Nothing is uploaded.'),
      pick, folderBtn ? h('div', { class: 'row' }, folderBtn, folderIn) : null, howTo,
      field('Paste', paste), h('div', { class: 'row' }, addTyped), status),
    card('Articles', list),
    card('The book', stack(
      h('div', { class: 'grid2' }, field('Title', titleIn), field('Author', authorIn)),
      toggle('Pictures (made to fit an e-reader)', keepPictures, (v) => { keepPictures = v; }),
      toggle('A cover with the title and the articles', makeCover, (v) => { makeCover = v; }))),
    actions(button('Make EPUB', async () => {
      if (!items.length) throw new Error('Add an article first: choose a saved web page, or paste one.');
      const arts = items.map((it) => ({ ...it.article, title: it.title.trim() || it.article.title, author: it.author }));
      const title = titleIn.value.trim() || (arts.length === 1 ? arts[0].title : `Articles — ${dateText(today())}`);
      clear(result);
      prog.set(0, 'Pictures…');
      const t0 = performance.now();
      const cov = makeCover ? await cover(title, arts.length > 1 ? arts.map((a) => a.title) : [arts[0].site, dateText(arts[0].date), arts[0].author].filter(Boolean), arts.length > 1 ? `${plural(arts.length, 'article')} · ${dateText(today())}` : (arts[0].site || 'Article')) : null;
      const made = await makeEpub(arts, { title, author: authorIn.value, pictures: keepPictures, cover: cov }, convert, (d, n) => prog.set(n ? d / n : 1, `Pictures: ${d} of ${n}…`));
      prog.done();
      if (!live) return;
      const name = `${safeName(title, 'articles')}.epub`, blob = new Blob([made.epub as BlobPart], { type: 'application/epub+zip' });
      const words = arts.reduce((n, a) => n + a.words, 0);
      result.append(
        note(`${name}: ${fmtBytes(made.epub.length)} · ${plural(arts.length, 'article')} · ${words.toLocaleString('en-IN')} words (about ${plural(minutes(words), 'minute')} of reading)${keepPictures ? ` · ${plural(made.pictures, 'picture')}${made.missing ? ` (${made.missing} not saved with the pages)` : ''}` : ''} · ${((performance.now() - t0) / 1000).toFixed(1)} s`, 'ok'),
        h('div', { class: 'row' },
          button('Download EPUB', () => downloadBlob(blob, name), { icon: 'Download', variant: 'primary' }),
          ctx.isMobile ? button('Share', () => shareOrDownload(blob, name), { icon: 'Share2' }) : null,
          button('Read it here', () => { give('ebook', new File([blob], name, { type: 'application/epub+zip' })); location.hash = '#/ebook'; }, { icon: 'BookOpenText' })),
        note('Send it to your Kindle with Amazon’s Send to Kindle — the app on a PC or a phone, the website, or by e-mail to your Kindle’s address. An EPUB becomes a Kindle book there: its own fonts, sizes and dictionary.'));
    }, { variant: 'primary', icon: 'BookUp' })),
    card(null, prog, result));
  render();
  return () => { live = false; for (const u of blobUrls) URL.revokeObjectURL(u); blobUrls.clear(); items = []; };
};
