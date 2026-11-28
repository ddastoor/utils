// EPUB Reader (potentials #71; owner, 20 Nov 2026): read e-books — EPUB, MOBI (Kindle files without DRM), FictionBook,
// comics (CBZ, CBR, CB7, CBT), plain text and web pages — with contents, page turning (tap, swipe, keys, the wheel), the
// font, its size, line spacing and margins, light / sepia / dark / black, search in the book, a page or chapter to go
// to, and Read aloud through the Text-to-Speech tab. MuPDF lays the book out and draws its pages in a worker
// (src/workers/ebook.worker.ts, engine src/lib/ebook.ts). The book never leaves the device, and nothing is stored: the
// place in the book and the look are kept while the page is open (CLAUDE.md §1).
import { h, card, note, button, toggle, select, segmented, filePicker, clear, toast, errMsg, copy, ic, type Mount } from '../ui';
import * as R from '../lib/ebook-client';
import { THEMES, FONTS, KIND_NAMES, chapterAt, type Look, type Theme, type FontChoice, type Entry, type Hit, type BookInfo, type PageLink } from '../lib/ebook';
import { give, take } from '../lib/handoff';
import { plural } from '../lib/dates';
import { ebookSettings } from '../settings';
import './ebook.css';

const ACCEPT = '.epub,.mobi,.prc,.azw,.azw3,.fb2,.fbz,.zip,.cbz,.cbr,.cb7,.cbt,.txt,.text,.html,.htm,.xhtml,application/epub+zip,application/x-mobipocket-ebook,text/plain,text/html';
const SIZES = [12, 14, 16, 17, 18, 19, 20, 22, 24, 26, 28, 32, 36, 42];
type Margin = 'narrow' | 'normal' | 'wide';
type Spread = 'auto' | 'one' | 'two';
const MARGINS: Record<Margin, { phone: [number, number]; pc: [number, number] }> = {
  narrow: { phone: [10, 10], pc: [20, 16] }, normal: { phone: [18, 16], pc: [44, 28] }, wide: { phone: [30, 22], pc: [80, 40] },
};
const LINES: Array<[string, string]> = [['0', 'As the book sets it'], ['1.25', 'Tight'], ['1.5', 'Normal'], ['1.75', 'Relaxed'], ['2', 'Loose']];

// kept while the page is open (through other tabs; nothing is stored): the look, and the book last read, to go back to
const appDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
let look: Look | null = null, margin: Margin = 'normal', spreadPref: Spread = 'auto';
let last: { file: File; title: string; anchor: string; share: number; page: number; pages: number } | null = null;

export const mount: Mount = (root, ctx) => {
  const phone = ctx.isMobile;
  // justified on a PC; on a phone's narrow page left-aligned (MuPDF does not hyphenate: justified, the spaces open wide)
  // the look is the Settings' (to-do #39: kept in this browser, in the settings file); what was never chosen follows the device (a phone's
  // smaller left-aligned text, the system's light or dark)
  const fromSettings = (into: Partial<Look> = {}): Look => {
    const k = ebookSettings.get();
    margin = k.margin; spreadPref = k.spread;
    return Object.assign(into, { font: k.font, size: k.size ?? (phone ? 18 : 20), line: k.line, justify: k.justify ?? !phone, theme: k.theme ?? (appDark() ? 'dark' : 'light'), publisher: k.publisher }) as Look;
  };
  look = fromSettings();
  const L = look;
  let live = true;

  // ------------------------------------------------------------------------------------ the state of the open book
  let file: File | null = null, info: BookInfo | null = null, pages = 0, page = 0, contents: Entry[] = [], note0 = '';
  let layoutId = 0, laying: Promise<void> | null = null, size = { w: 0, h: 0 }, spread = false, missing: string[] = [];
  let hits: Hit[] = [], hitAt = -1, query = '', searching: ReturnType<typeof R.searchBook> | null = null;
  let selection: { page: number; text: string; quads: number[][] } | null = null, back: number | null = null;
  const bitmaps = new Map<string, Promise<{ bmp: ImageBitmap; w: number; h: number }>>();
  const sizes = new Map<number, Promise<[number, number]>>();
  const links = new Map<number, Promise<PageLink[]>>();

  // ------------------------------------------------------------------------------------ the page before a book
  const status = h('div', { class: 'stack', role: 'status', 'aria-live': 'polite' });
  const again = h('div');
  const pick = filePicker({ accept: ACCEPT, label: 'Choose an e-book', hint: 'EPUB, MOBI, FB2, CBZ / CBR comics, TXT — or drop it here', onFiles: ([f]) => openFile(f) });
  const intro = card(null,
    note('A book is opened and laid out on this device — it is not uploaded anywhere. EPUB and MOBI books without DRM, FictionBook, comics (CBZ, CBR, CB7, CBT), plain text and web pages. Books bought with DRM (Kindle, Kobo, Google Play, Apple Books) open only in their shop’s app.'),
    pick, again, status);
  const showAgain = () => {
    clear(again);
    if (!last) return;
    const l = last;
    again.append(button(`Go back to “${l.title}” — page ${l.page + 1} of ${l.pages}`, () => openFile(l.file, l), { icon: 'BookOpen', variant: 'primary' }));
  };

  // ------------------------------------------------------------------------------------ the reader
  const title = h('div', { class: 'ebr-title' });
  const canvas = h('canvas', { class: 'ebr-page', 'aria-hidden': 'true' }) as HTMLCanvasElement;
  const marks = h('canvas', { class: 'ebr-marks', 'aria-hidden': 'true' }) as HTMLCanvasElement;
  const pageText = h('div', { class: 'sr-only', id: 'ebr-text' });
  const stage = h('div', { class: 'ebr-stage', tabindex: '0', role: 'region', 'aria-label': 'Page of the book (←, → or a tap at the sides turns the page)', 'aria-describedby': 'ebr-text' }, canvas, marks);
  const where = h('div', { class: 'ebr-where', role: 'status', 'aria-live': 'polite' });
  const slider = h('input', { type: 'range', class: 'range ebr-slider', min: 1, max: 1, value: 1, 'aria-label': 'Page' }) as HTMLInputElement;
  const prevB = button('', () => turn(-1), { icon: 'ChevronLeft', title: 'Previous page' });
  const nextB = button('', () => turn(1), { icon: 'ChevronRight', title: 'Next page' });
  const backB = button('', () => { if (back !== null) { const b = back; back = null; go(b); } }, { icon: 'Undo2', small: true });
  backB.hidden = true;
  const notes = h('div', { class: 'ebr-notes' });
  const selBar = h('div', { class: 'ebr-selbar', hidden: true },
    button('Copy', async () => { if (selection) { await copy(selection.text); toast('Copied.', 'ok'); } }, { icon: 'Copy', small: true }),
    button('Search the book', () => { if (selection) { const t = selection.text.replace(/\s+/g, ' ').trim().slice(0, 80); clearSelection(); openSearch(t); } }, { icon: 'Search', small: true }),
    button('Read aloud', () => { if (selection) readAloud(selection.text); }, { icon: 'Volume2', small: true }),
    button('', () => clearSelection(), { icon: 'X', small: true, title: 'Clear the selection' }));
  const fullB = button('', () => setFull(!full), { icon: 'Maximize', title: 'Reading mode (the book fills the screen)' });
  const top = h('div', { class: 'ebr-top' },
    title,
    h('div', { class: 'ebr-tools' },
      button('', () => openContents(), { icon: 'ListTree', title: 'Contents and go to a page' }),
      button('', () => openSearch(), { icon: 'Search', title: 'Search in the book' }),
      button('', () => openLook(), { icon: 'Type', title: 'Font, size, margins and theme' }),
      button('', () => readAloud(), { icon: 'Volume2', title: 'Read aloud from this page (Text-to-Speech)' }),
      fullB,
      button('', () => closeBook(), { icon: 'X', title: 'Close the book' })));
  const bottom = h('div', { class: 'ebr-bottom' }, prevB, h('div', { class: 'ebr-mid' }, slider, h('div', { class: 'ebr-wherebox' }, where, backB)), nextB);
  const reader = h('section', { class: 'ebr', hidden: true, 'aria-label': 'Reader' }, top, notes, stage, selBar, bottom, pageText);
  root.append(intro, reader);
  showAgain();
  // a book another tab made for reading here (Articles → Kindle's "Read it here")
  const handed = take<File>('ebook');
  if (handed instanceof File) queueMicrotask(() => { void openFile(handed).catch((e) => { clear(status).append(note(errMsg(e), 'err')); }); });

  /** the reader just under the sticky rows, so the page and its bar fill the window */
  const place = () => { if (!full) reader.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior }); };

  // ------------------------------------------------------------------------------------ sizes
  const dpr = () => Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const marginPx = () => MARGINS[margin][phone ? 'phone' : 'pc'];
  /** the page the book is laid out on (CSS px) and whether two stand side by side */
  const measure = () => {
    const W = Math.floor(stage.clientWidth), H = Math.floor(stage.clientHeight);
    spread = !phone && (spreadPref === 'two' || (spreadPref === 'auto' && W >= 900 && W / Math.max(1, H) >= 1.25));
    const [mx, my] = info?.fixed ? [8, 8] : marginPx();
    const col = spread ? Math.floor(W / 2) : W;
    return { W, H, w: Math.max(120, col - 2 * mx), h: Math.max(160, H - 2 * my), mx, my, col };
  };

  // ------------------------------------------------------------------------------------ drawing
  const key = (i: number, s: number) => `${layoutId}:${i}:${s.toFixed(3)}`;
  async function sizeOf(i: number) { let p = sizes.get(i); if (!p) { p = R.pageSize(i); sizes.set(i, p); } return p; }
  /** a page as a bitmap at the screen's resolution (a comic's page: fitted into its box) */
  async function bitmap(i: number, box: { w: number; h: number }) {
    let scale = dpr();
    if (info?.fixed) { const [pw, ph] = await sizeOf(i); scale *= Math.min(box.w / pw, box.h / ph); }
    const k = key(i, scale);
    let p = bitmaps.get(k);
    if (!p) {
      p = R.drawPage(i, scale, THEMES[L.theme].bg).then(async (r) => ({ bmp: await createImageBitmap(new ImageData(r.rgba as ImageDataArray, r.w, r.h)), w: r.w, h: r.h }));
      p.catch(() => bitmaps.delete(k));
      bitmaps.set(k, p);
    }
    return p;
  }
  /** the pages kept drawn: the reader's and the ones around it, of this layout */
  const prune = () => {
    for (const [k, v] of bitmaps) {
      const [lid, i] = k.split(':').map(Number);
      if (lid !== layoutId || Math.abs(i - page) > 4) { bitmaps.delete(k); v.then((b) => b.bmp.close(), () => {}); }
    }
  };
  const forget = () => { for (const v of bitmaps.values()) v.then((b) => b.bmp.close(), () => {}); bitmaps.clear(); sizes.clear(); links.clear(); };
  const shown = () => (spread ? [page, page + 1].filter((i) => i < pages) : [page]);
  let drawSeq = 0;
  async function show() {
    if (!info) return;
    const seq = ++drawSeq, m = measure();
    const slots = shown().map((i, k) => ({ i, x: (k ? m.W - m.col : 0) + m.mx, y: m.my }));
    let imgs: Array<{ bmp: ImageBitmap; w: number; h: number }>;
    try { imgs = await Promise.all(slots.map((s) => bitmap(s.i, { w: m.w, h: m.h }))); }
    catch (e) { if (!(e instanceof R.ReaderGone) && live) toast(errMsg(e), 'err'); return; }
    if (seq !== drawSeq || !live) return;
    const d = dpr();
    for (const c of [canvas, marks]) { c.width = Math.round(m.W * d); c.height = Math.round(m.H * d); c.style.width = `${m.W}px`; c.style.height = `${m.H}px`; }
    const g = canvas.getContext('2d')!;
    g.fillStyle = THEMES[L.theme].bg;
    g.fillRect(0, 0, canvas.width, canvas.height);
    slots.forEach((s, k) => {
      const im = imgs[k];
      let x = s.x * d, y = s.y * d;
      if (info!.fixed) { x += (m.w * d - im.w) / 2; y += (m.h * d - im.h) / 2; }
      g.drawImage(im.bmp, Math.round(x), Math.round(y));
      placed.set(s.i, { x: x / d, y: y / d, w: im.w / d, h: im.h / d });
    });
    prune();
    stage.style.background = THEMES[L.theme].bg;
    // where the pages stand on the stage (CSS px), for the tests: the page under a point
    stage.dataset.placed = JSON.stringify([...placed].filter(([i]) => shown().includes(i)).map(([i, at]) => ({ i, x: Math.round(at.x * 100) / 100, y: Math.round(at.y * 100) / 100, w: Math.round(at.w), h: Math.round(at.h) })));
    drawMarks();
    status0();
    // what comes next is drawn while the reader reads
    const step = spread ? 2 : 1;
    for (const i of [page + step, page + step + 1, page - step].filter((x) => x >= 0 && x < pages && !shown().includes(x)).slice(0, spread ? 3 : 2)) void bitmap(i, { w: m.w, h: m.h }).catch(() => {});
    R.anchorOf(page).then((a) => { anchor = a; remember(); }, () => {});
    R.pageText(page).then((t) => { if (seq === drawSeq) pageText.textContent = t; }, () => {});
  }
  // where each shown page stands on the stage (CSS px)
  const placed = new Map<number, { x: number; y: number; w: number; h: number }>();
  let anchor = '';
  const remember = () => { if (file && info) last = { file, title: info.title, anchor, share: pages ? page / pages : 0, page, pages }; };

  function status0() {
    const ps = shown(), ch = chapterAt(contents, ps[ps.length - 1]);   // a spread: the chapter of its right page (one may begin there)
    where.textContent = `${ps.length > 1 ? `Pages ${ps[0] + 1}–${ps[1] + 1}` : `Page ${page + 1}`} of ${pages}${ch && !info?.fixed ? ` · ${ch.title}` : ''} · ${Math.round(((ps[ps.length - 1] + 1) / Math.max(1, pages)) * 100)} %`;
    slider.max = String(Math.max(1, pages)); slider.value = String(page + 1);
    prevB.disabled = page <= 0; nextB.disabled = ps[ps.length - 1] >= pages - 1;
    backB.hidden = back === null;
    if (back !== null) backB.setLabel(`Back to page ${back + 1}`);
  }

  /** search hits and the selection, over the page */
  function drawMarks() {
    const g = marks.getContext('2d')!, d = dpr();
    g.clearRect(0, 0, marks.width, marks.height);
    const quad = (q: number[], at: { x: number; y: number }, fill: string) => {
      g.fillStyle = fill;
      g.beginPath();
      g.moveTo((at.x + q[0]) * d, (at.y + q[1]) * d);
      g.lineTo((at.x + q[2]) * d, (at.y + q[3]) * d);
      g.lineTo((at.x + q[6]) * d, (at.y + q[7]) * d);
      g.lineTo((at.x + q[4]) * d, (at.y + q[5]) * d);
      g.closePath(); g.fill();
    };
    const dark = L.theme === 'dark' || L.theme === 'black';
    for (const [i, at] of placed) {
      if (!shown().includes(i)) continue;
      hits.forEach((hh, k) => { if (hh.page === i) for (const q of hh.quads) quad(q, at, k === hitAt ? (dark ? 'rgb(255 160 0 / 55%)' : 'rgb(255 140 0 / 45%)') : (dark ? 'rgb(255 230 0 / 30%)' : 'rgb(255 220 0 / 45%)')); });
      if (selection && selection.page === i) for (const q of selection.quads) quad(q, at, dark ? 'rgb(120 160 255 / 40%)' : 'rgb(60 110 230 / 30%)');
    }
  }

  // ------------------------------------------------------------------------------------ turning pages
  const go = (i: number, keepSelection = false) => {
    if (!info || !pages) return;
    let p = Math.max(0, Math.min(pages - 1, Math.round(i)));
    if (spread) p -= p % 2;
    if (!keepSelection) clearSelection(false);
    page = p;
    void show();
  };
  const turn = (dir: number) => {
    if (!info) return;
    const step = spread ? 2 : 1, to = page + dir * step;
    if (to < 0) { toast('This is the beginning of the book.'); return; }
    if (to > pages - 1) { toast('This is the end of the book.'); return; }
    go(to);
  };
  const jump = (i: number) => { if (i !== page) back = page; go(i); };
  slider.addEventListener('input', () => { where.textContent = `Page ${slider.value} of ${pages}`; });
  slider.addEventListener('change', () => jump(+slider.value - 1));

  // keys: the arrows, Page Up / Down, Space, Home, End — while the reader is open and no box or panel has the keys
  const onKey = (e: KeyboardEvent) => {
    if (!info || reader.hidden || document.querySelector('dialog.ebr-panel[open]') || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as HTMLElement;
    if (t && (t.closest('input, textarea, select, [contenteditable]') || (t.closest('button, a') && (e.key === ' ' || e.key === 'Enter')))) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) turn(1);
    else if (k === 'ArrowLeft' || k === 'PageUp' || (k === ' ' && e.shiftKey)) turn(-1);
    else if (k === 'Home') jump(0);
    else if (k === 'End') jump(pages - 1);
    else if (k === 'Escape' && full) setFull(false);
    else if (k === 'Escape' && selection) clearSelection();
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  // the wheel turns pages over the page (a pause between turns, so one flick is one page)
  let wheelAt = 0;
  stage.addEventListener('wheel', (e) => {
    if (!info || Math.abs(e.deltaY) < 4 || e.ctrlKey) return;
    e.preventDefault();
    const now = performance.now();
    if (now - wheelAt < 350) return;
    wheelAt = now; turn(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  // taps, swipes, a long press (a word), a drag with the mouse (a selection), links
  let down: { x: number; y: number; t: number; type: string; id: number; moved: boolean; selecting: boolean; page: number; a?: [number, number]; timer?: number } | null = null;
  /** a point of the stage in the coordinates of the page under it */
  const onPage = (x: number, y: number): { i: number; p: [number, number] } | null => {
    if (info?.fixed) return null;   // a comic's pages are pictures: nothing to select or follow
    for (const [i, at] of placed) {
      if (!shown().includes(i)) continue;
      if (x >= at.x - 4 && x <= at.x + at.w + 4 && y >= at.y - 4 && y <= at.y + at.h + 4) return { i, p: [x - at.x, y - at.y] };
    }
    return null;
  };
  const local = (e: PointerEvent) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  async function linkAt(x: number, y: number): Promise<PageLink | null> {
    const at = onPage(x, y);
    if (!at) return null;
    let p = links.get(at.i);
    if (!p) { p = R.linksOf(at.i); links.set(at.i, p); }
    const ls = await p;
    return ls.find((l) => at.p[0] >= l.rect[0] - 2 && at.p[0] <= l.rect[2] + 2 && at.p[1] >= l.rect[1] - 2 && at.p[1] <= l.rect[3] + 2) || null;
  }
  async function selectRange(i: number, a: [number, number], b: [number, number]) {
    const r = await R.selectText(i, a, b);
    if (!down?.selecting && !selection) return;
    selection = { page: i, text: r.text, quads: r.quads };
    drawMarks();
  }
  stage.addEventListener('contextmenu', (e) => { if (info) e.preventDefault(); });
  stage.addEventListener('pointerdown', (e) => {
    if (!info || e.button > 0) return;
    const { x, y } = local(e);
    down = { x, y, t: performance.now(), type: e.pointerType, id: e.pointerId, moved: false, selecting: false, page };
    if (e.pointerType !== 'mouse') {
      // a long press: the word under the finger, then the finger extends the selection
      down.timer = window.setTimeout(async () => {
        if (!down || down.moved) return;
        const at = onPage(down.x, down.y);
        if (!at) return;
        const wd = await R.wordAt(at.i, at.p);
        if (!wd || !down) return;
        down.selecting = true; down.a = wd.a;
        try { stage.setPointerCapture(down.id); } catch { /* the finger already left */ }
        clearSelection(false);
        selection = { page: at.i, text: '', quads: [] };
        await selectRange(at.i, wd.a, wd.b);
        navigator.vibrate?.(10);
      }, 500);
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const { x, y } = local(e), dx = x - down.x, dy = y - down.y;
    if (!down.moved && Math.hypot(dx, dy) > (down.type === 'mouse' ? 5 : 10)) {
      down.moved = true;
      if (down.type === 'mouse') {
        const at = onPage(down.x, down.y);
        if (at) { down.selecting = true; down.a = at.p; clearSelection(false); selection = { page: at.i, text: '', quads: [] }; try { stage.setPointerCapture(e.pointerId); } catch { /* */ } }
      }
    }
    if (down.selecting && down.a && selection) {
      const at = onPage(x, y);
      if (at && at.i === selection.page) void selectRange(at.i, down.a, at.p);
    }
  });
  const up = async (e: PointerEvent) => {
    if (!down || e.pointerId !== down.id) return;
    const d = down; down = null;
    clearTimeout(d.timer);
    const { x, y } = local(e), dx = x - d.x, dy = y - d.y;
    if (d.selecting) {
      // the selection ends where the pointer was let go (a long press not moved keeps its word)
      const at = onPage(x, y);
      if (d.moved && at && d.a && selection && at.i === selection.page) await selectRange(at.i, d.a, at.p);
      if (selection && selection.text.trim()) showSelBar(); else clearSelection();
      return;
    }
    if (e.type === 'pointercancel') return;
    if (d.type !== 'mouse' && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) { turn(dx < 0 ? 1 : -1); return; }
    if (d.moved) return;
    if (selection) { clearSelection(); return; }
    const l = await linkAt(x, y);
    if (l) {
      if (l.uri) { if (/^https?:/i.test(l.uri)) window.open(l.uri, '_blank', 'noopener,noreferrer'); else location.href = l.uri; }
      else if (l.page !== undefined) jump(l.page);
      return;
    }
    const W = stage.clientWidth;
    if (x < W / 3) turn(-1);
    else if (x > (2 * W) / 3 || !full) turn(1);
    else reader.classList.toggle('ebr-bare');   // reading mode: the middle shows or hides the bars
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  function showSelBar() { selBar.hidden = false; }
  function clearSelection(redraw = true) { selection = null; selBar.hidden = true; if (redraw) drawMarks(); }

  // ------------------------------------------------------------------------------------ reading mode
  let full = false;
  function setFull(on: boolean) {
    full = on;
    reader.classList.toggle('ebr-full', on);
    reader.classList.remove('ebr-bare');
    document.documentElement.classList.toggle('ebr-reading', on);
    fullB.setLabel(on ? 'Leave reading mode' : 'Reading mode (the book fills the screen)');
    fullB.querySelector('.ic')!.innerHTML = ic(on ? 'Minimize' : 'Maximize').innerHTML;
    if (on && reader.requestFullscreen && !document.fullscreenElement) reader.requestFullscreen().catch(() => { /* the fixed overlay is enough (iPhone) */ });
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    stage.focus({ preventScroll: true });
  }
  const onFs = () => { if (!document.fullscreenElement && full) setFull(false); };
  document.addEventListener('fullscreenchange', onFs);

  // ------------------------------------------------------------------------------------ laying out again
  let relayTimer = 0;
  const needLayout = (delay = 150) => { clearTimeout(relayTimer); relayTimer = window.setTimeout(() => void relay(), delay); };
  // the look changed elsewhere (the Settings page in another tab, an import there): the book is laid out again in it
  const offSettings = ebookSettings.on((local) => { if (local || !live) return; fromSettings(L); if (info) needLayout(120); });
  async function relay() {
    if (!info || !live) return;
    if (laying) { await laying; }
    const m = measure();
    if (info.fixed) { if (m.W !== size.w || m.H !== size.h) { size = { w: m.W, h: m.H }; forget(); go(page); } return; }
    const done = (async () => {
      stopSearch();
      const share = pages ? page / pages : 0, a = anchor || (await R.anchorOf(page).catch(() => ''));
      const r = await R.relayout(L, m.w, m.h, a, share);
      if (!live) return;
      layoutId++; forget(); stage.dataset.layout = `${m.w}x${m.h}`;
      pages = r.pages; contents = r.contents; missing = r.missing; size = { w: m.W, h: m.H };
      hits = []; hitAt = -1; back = null;
      showNotes();
      go(r.page);
    })();
    laying = done.finally(() => { laying = null; });
    try { await done; } catch (e) { if (!(e instanceof R.ReaderGone) && live) toast(errMsg(e), 'err'); }
  }
  const ro = new ResizeObserver(() => {
    if (!info) return;
    const W = Math.floor(stage.clientWidth), H = Math.floor(stage.clientHeight);
    if (W !== size.w || H !== size.h) needLayout(200);
  });
  ro.observe(stage);

  function showNotes() {
    clear(notes);
    const parts: string[] = [];
    if (note0) parts.push(`This is ${note0}.`);
    if (missing.length) {
      const names = missing.map((s) => s.replace(/_/g, ' '));
      parts.push(`The book has text in ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]}, which no font here can draw — it is left out of the pages.${L.font !== 'book' ? ' The book’s own fonts may have it: Font, size, margins and theme → Font → The book’s own.' : ''}`);
    }
    if (parts.length) notes.append(note(parts.join(' '), 'warn'));
  }

  // ------------------------------------------------------------------------------------ opening and closing
  async function openFile(f: File, resume?: { anchor: string; share: number }) {
    stopSearch(); clearSelection(false); R.closeReader(); forget();
    info = null; file = null; contents = []; hits = []; back = null; missing = []; note0 = '';
    clear(status);
    if (f.size > 1.5e9) { status.append(note(`${f.name} is larger than a browser can read at once (${(f.size / 1e9).toFixed(1)} GB).`, 'err')); return; }
    intro.hidden = true; reader.hidden = false;
    place();
    const m = measure();
    where.textContent = `Opening ${f.name}…`;
    try {
      let bytes: Uint8Array = new Uint8Array(await f.arrayBuffer()), name = f.name, how = '';
      let r = await R.openBook(bytes, name, L, m.w, m.h);
      if (r.unpack) {
        where.textContent = `Unpacking the ${r.unpack === 'RAR' ? 'RAR' : '7z'} archive with 7-Zip…`;
        const { extractAsZip } = await import('../lib/sevenzip-client');
        try { bytes = await extractAsZip(f, f.name, ''); }
        catch (e: any) {
          const msg = String(e?.message || e);
          throw new Error(/PASSWORD/.test(msg) ? `${f.name} is protected by a password.` : /NOT_ARCHIVE|DAMAGED/.test(msg) ? `${f.name} is a damaged ${r.unpack} archive.` : msg);
        }
        name = f.name.replace(/\.[^.]+$/, '') + '.zip'; how = `a ${r.unpack === 'RAR' ? 'CBR (RAR)' : 'CB7 (7z)'} comic, unpacked by 7-Zip`;
        r = await R.openBook(bytes, name, L, m.w, m.h);
      }
      if (!live) return;
      if (r.refused || !r.info) throw new Error(r.refused || `${f.name} could not be opened.`);
      info = r.info; file = f; pages = info.pages; contents = info.contents; missing = r.missing || []; note0 = how || r.note || '';
      size = { w: m.W, h: m.H }; layoutId++; stage.dataset.layout = `${m.w}x${m.h}`;
      title.replaceChildren(h('strong', null, info.title), ...(info.author ? [h('span', { class: 'muted' }, ` · ${info.author}`)] : []));
      document.title = `${info.title} · EPUB Reader · SuperUtils`;
      showNotes();
      page = 0;
      if (resume) {
        // the same book again: the page with the words the reader was at
        if (!info.fixed && resume.anchor) { const lay = await R.relayout(L, m.w, m.h, resume.anchor, resume.share); pages = lay.pages; contents = lay.contents; layoutId++; page = lay.page; }
        else page = Math.round(resume.share * pages);
      }
      go(page);
      stage.focus({ preventScroll: true });
    } catch (e) {
      if (e instanceof R.ReaderGone || !live) return;
      R.closeReader();
      info = null; reader.hidden = true; intro.hidden = false;
      status.append(note(errMsg(e), 'err'));
      showAgain();
    }
  }
  function closeBook() {
    remember();
    if (full) setFull(false);
    stopSearch(); clearSelection(false); R.closeReader(); forget();
    info = null; file = null; pages = 0;
    reader.hidden = true; intro.hidden = false;
    document.title = 'EPUB Reader · SuperUtils';
    clear(status); showAgain();
  }

  // ------------------------------------------------------------------------------------ Read aloud
  async function readAloud(text?: string) {
    if (!info) return;
    if (info.fixed) { toast('A comic has no text to read aloud.'); return; }
    const t = (text ?? (await R.textFrom(page, 30000))).replace(/[ \t]+\n/g, '\n').trim();
    if (!t) { toast('There is no text on this page to read.'); return; }
    remember();
    give('tts', t);
    location.hash = '#/tts';
  }

  // ------------------------------------------------------------------------------------ panels
  function panel(titleText: string, body: HTMLElement, onClose?: () => void) {
    document.querySelector('dialog.ebr-panel')?.remove();
    const dlg = h('dialog', { class: 'ebr-panel', 'aria-label': titleText }) as HTMLDialogElement;
    const close = () => dlg.close();
    dlg.append(h('div', { class: 'ebr-panel-head' }, h('h3', null, titleText), button('', close, { icon: 'X', title: 'Close' })), body);
    dlg.addEventListener('close', () => { dlg.remove(); onClose?.(); if (live && info) stage.focus({ preventScroll: true }); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    (full ? reader : document.body).append(dlg);
    dlg.showModal();
    return { dlg, close };
  }

  function openContents() {
    if (!info) return;
    const cur = chapterAt(contents, page);
    const goIn = h('input', { type: 'number', class: 'input', min: 1, max: pages, value: page + 1, inputmode: 'numeric', 'aria-label': 'Page number' }) as HTMLInputElement;
    const list = h('ol', { class: 'ebr-toc' });
    let p!: { close: () => void };
    const goPage = () => {
      const n = Math.round(+goIn.value);
      if (!Number.isFinite(n) || n < 1 || n > pages) { toast(`Pages 1 to ${pages}.`, 'err'); return; }
      p.close(); jump(n - 1);
    };
    goIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); goPage(); } });
    for (const e of contents) {
      const b = h('button', { type: 'button', class: ['ebr-toc-item', e === cur && 'on'], style: `padding-left:${12 + e.depth * 18}px`, disabled: e.page < 0, 'aria-current': e === cur ? 'true' : null },
        h('span', { class: 'ebr-toc-t' }, e.title), h('span', { class: 'ebr-toc-p' }, e.page >= 0 ? String(e.page + 1) : '—'));
      b.addEventListener('click', () => { p.close(); jump(e.page); });
      list.append(h('li', null, b));
    }
    const facts = [KIND_NAMES[info.kind], plural(pages, 'page'), info.fixed ? '' : `${L.size} px`].filter(Boolean).join(' · ');
    p = panel('Contents', h('div', { class: 'ebr-panel-body' },
      h('p', { class: 'muted small' }, h('strong', null, info.title), info.author ? ` · ${info.author}` : '', h('br'), facts),
      h('div', { class: 'row ebr-goto' }, h('label', { class: 'field-label', for: 'ebr-goto' }, 'Go to page'), Object.assign(goIn, { id: 'ebr-goto' }), button('Go', goPage, { small: true })),
      contents.length ? list : h('p', { class: 'muted' }, info.fixed ? 'A comic has no contents: the slider under the page goes to any page.' : 'This book has no contents.')));
    requestAnimationFrame(() => list.querySelector('.on')?.scrollIntoView({ block: 'center' }));
  }

  function stopSearch() { searching?.stop(); searching = null; }
  function openSearch(preset?: string) {
    if (!info) return;
    if (info.fixed) { toast('A comic’s pages are pictures: there is no text to search.'); return; }
    const box = h('input', { type: 'search', class: 'input', placeholder: 'Words to find', value: preset ?? query, 'aria-label': 'Words to find in the book', enterkeyhint: 'search' }) as HTMLInputElement;
    const line = h('div', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
    const list = h('ol', { class: 'ebr-hits' });
    const stopB = button('Stop', () => { stopSearch(); }, { small: true, icon: 'Square' });
    stopB.hidden = true;
    let p!: { close: () => void };
    const item = (hh: Hit, k: number) => {
      const b = h('button', { type: 'button', class: ['ebr-hit', k === hitAt && 'on'] },
        h('span', { class: 'ebr-hit-p' }, `p. ${hh.page + 1}`),
        h('span', { class: 'ebr-hit-t' }, hh.before, hh.match ? h('mark', null, hh.match) : null, hh.after));
      b.addEventListener('click', () => { hitAt = k; p.close(); if (hh.page !== page && !shown().includes(hh.page)) jump(hh.page); else drawMarks(); });
      return h('li', null, b);
    };
    const run = () => {
      const q = box.value.replace(/\s+/g, ' ').trim();
      stopSearch();
      if (q.length < 2) { line.textContent = 'Type at least two letters.'; return; }
      query = q; hits = []; hitAt = -1; clear(list); drawMarks();
      line.textContent = 'Searching…'; stopB.hidden = false;
      const s = R.searchBook(q, page, (found) => {
        for (const hh of found) { hits.push(hh); if (hits.length <= 500) list.append(item(hh, hits.length - 1)); }
        line.textContent = `${plural(hits.length, 'place')} found so far…`;
        drawMarks();
      }, (done, total) => { line.textContent = `${plural(hits.length, 'place')} found · searched ${done} of ${total} pages…`; });
      searching = s;
      s.done.then((r) => {
        if (searching !== s) return;
        searching = null; stopB.hidden = true;
        // the hits in the book's order, from the reader's page on (the search started there)
        line.textContent = r.stopped ? `Stopped: ${plural(hits.length, 'place')} found so far.` : hits.length ? `${plural(hits.length, 'place')} found${r.capped ? ' (the first 1,000)' : ''}, from this page on.${hits.length > 500 ? ' The first 500 are listed.' : ''}` : `“${q}” is not in the book.`;
      }, (e) => { if (searching === s) { searching = null; stopB.hidden = true; if (!(e instanceof R.ReaderGone)) line.textContent = errMsg(e); } });
    };
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    p = panel('Search in the book', h('div', { class: 'ebr-panel-body' },
      h('div', { class: 'row ebr-search' }, box, button('Search', run, { variant: 'primary', icon: 'Search', small: true }), stopB),
      line, h('p', { class: 'muted small' }, 'Capitals and accents do not matter. The search starts at this page and goes round the book.'), list));
    hits.forEach((hh, k) => { if (k < 500) list.append(item(hh, k)); });
    if (hits.length) line.textContent = `${plural(hits.length, 'place')} found for “${query}”.`;
    if (preset) run();
    setTimeout(() => box.focus(), 0);
  }

  function openLook() {
    if (!info) return;
    const fixed = info.fixed;
    const relook = (layout = true) => { if (layout && !fixed) needLayout(120); else { layoutId++; forget(); void show(); } };
    const sizeOut = h('output', { class: 'ebr-size' }, `${L.size} px`);
    const step = (d: number) => {
      const k = SIZES.findIndex((s) => s >= L.size), at = Math.max(0, Math.min(SIZES.length - 1, (k < 0 ? SIZES.length - 1 : k) + d));
      if (SIZES[at] === L.size) return;
      L.size = SIZES[at]; sizeOut.textContent = `${L.size} px`; ebookSettings.set({ size: L.size }); relook();
    };
    const themeBtns = h('div', { class: 'ebr-themes', role: 'radiogroup', 'aria-label': 'Theme' }, ...(Object.keys(THEMES) as Theme[]).map((t) => {
      const b = h('button', { type: 'button', role: 'radio', class: 'ebr-theme', 'aria-checked': String(L.theme === t), style: `background:${THEMES[t].bg};color:${THEMES[t].fg}` }, h('span', { class: 'ebr-theme-a' }, 'Aa'), h('span', null, THEMES[t].name));
      b.addEventListener('click', () => {
        if (L.theme === t) return;
        L.theme = t; ebookSettings.set({ theme: t });
        for (const x of themeBtns.querySelectorAll('button')) x.setAttribute('aria-checked', String(x === b));
        relook(!fixed);
      });
      return b;
    }));
    const body = h('div', { class: 'ebr-panel-body stack' },
      h('div', { class: 'field', role: 'group', 'aria-label': 'Theme' }, h('span', { class: 'field-label' }, 'Theme'), themeBtns));
    if (!fixed) {
      body.append(
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Font'), select<FontChoice>((Object.keys(FONTS) as FontChoice[]).map((f) => [f, FONTS[f]]), L.font, (v) => { L.font = v; ebookSettings.set({ font: v }); relook(); showNotes(); })),
        h('div', { class: 'field', role: 'group', 'aria-label': 'Text size' }, h('span', { class: 'field-label' }, 'Text size'),
          h('div', { class: 'row ebr-sizes' }, button('', () => step(-1), { icon: 'AArrowDown', title: 'Smaller text' }), sizeOut, button('', () => step(1), { icon: 'AArrowUp', title: 'Larger text' }))),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Line spacing'), select(LINES as Array<[string, string]>, String(L.line), (v) => { L.line = +v; ebookSettings.set({ line: +v }); relook(); })),
        h('div', { class: 'field', role: 'group', 'aria-label': 'Margins' }, h('span', { class: 'field-label' }, 'Margins'),
          segmented<Margin>([['narrow', 'Narrow'], ['normal', 'Normal'], ['wide', 'Wide']], margin, (v) => { margin = v; ebookSettings.set({ margin: v }); relook(); })),
        toggle('Justify the text (straight right edge)', L.justify, (v) => { L.justify = v; ebookSettings.set({ justify: v }); relook(); }),
        toggle('The book’s own styles (its spacing, its headings, its colours in Light)', L.publisher, (v) => { L.publisher = v; ebookSettings.set({ publisher: v }); relook(); }));
    }
    if (!phone) body.append(h('div', { class: 'field', role: 'group', 'aria-label': 'Pages side by side' }, h('span', { class: 'field-label' }, 'Pages side by side'),
      segmented<Spread>([['auto', 'On a wide window'], ['one', 'One page'], ['two', 'Two pages']], spreadPref, (v) => { spreadPref = v; ebookSettings.set({ spread: v }); if (fixed) relook(false); else needLayout(60); })));
    if (fixed) body.append(h('p', { class: 'muted small' }, 'A comic’s pages are pictures: they keep their own look; the theme colours the space around them.'));
    panel('Font, size, margins and theme', body);
  }

  // ------------------------------------------------------------------------------------ leaving
  return () => {
    live = false;
    offSettings();
    remember();
    clearTimeout(relayTimer);
    stopSearch();
    ro.disconnect();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('fullscreenchange', onFs);
    document.documentElement.classList.remove('ebr-reading');
    document.querySelector('dialog.ebr-panel')?.remove();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    forget();
  };
};
