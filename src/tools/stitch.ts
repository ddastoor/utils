// Long Screenshot Stitcher (potentials #87): screenshots of one chat or web page, taken while it scrolls and chosen in any
// order → one tall picture. The parts that two screenshots have in common are found by themselves (imgproc.wasm:
// wasm/imgproc/stitch.c, in src/workers/stitch.worker.ts with the order and the picture of src/lib/stitch.ts); the
// screenshots are joined where both show the same rows, away from what floats over them (a date chip, a "scroll down"
// button), and the status bar at the top and the typing box at the bottom come once. Nothing leaves the device.
import { h, card, button, toggle, segmented, note, clear, actions, toast, errMsg, downloadBlob, shareOrDownload, baseName, fmtBytes, type Mount } from '../ui';
import { imageInput } from '../lib/imgtools';
import { encodeImg, previewOf, paint } from '../lib/imgio';
import { trackWorker } from '../lifecycle';
import type { Img } from '../wasm/imgproc';
import type { Item } from '../lib/stitch';
import './stitch.css';

interface ShotInfo { id: number; name: string; width: number; height: number; from: number | null }
interface View { order: number[]; items: Item[]; manual: boolean; shots: ShotInfo[]; width: number; height: number; joins: number[]; pieces: number; preview: Img | null }
type Fmt = 'png' | 'jpeg';
/** a JPEG holds at most this many rows */
const JPEG_MAX = 65_535;
/** the preview is drawn in canvases of at most this many rows (a phone's canvas has a limit of its own) */
const CHUNK = 4000;
let fmtChosen: Fmt = 'png', showJoins = true, barsTop = false, barsBottom = false; // kept while the page is open

export const mount: Mount = (root, ctx) => {
  let worker: Worker | null = null, seq = 0, nextId = 1, alive = true, busy = 0, inflight = 0, view: View | null = null;
  const pend = new Map<number, { res: (v: any) => void; rej: (e: Error) => void; progress?: (m: any) => void }>();
  const thumbs = new Map<number, HTMLCanvasElement>();
  const call = <T>(msg: any, transfer: Transferable[] = [], progress?: (m: any) => void): Promise<T> => {
    if (!worker) {
      worker = trackWorker(new Worker(new URL('../workers/stitch.worker.ts', import.meta.url), { type: 'module' }), 'stitch-worker', () => { pend.clear(); worker = null; });
      worker.onmessage = (e) => {
        const p = pend.get(e.data.id); if (!p) return;
        if (e.data.op === 'progress') { p.progress?.(e.data); return; }
        pend.delete(e.data.id); e.data.error ? p.rej(new Error(e.data.error)) : p.res(e.data.result);
      };
      worker.onerror = (e) => { for (const p of pend.values()) p.rej(new Error(e.message || 'The stitcher stopped')); pend.clear(); worker = null; };
    }
    const id = ++seq;
    inflight++; root.setAttribute('data-busy', '');
    const done = () => { if (--inflight === 0) root.removeAttribute('data-busy'); };
    return new Promise<T>((res, rej) => { pend.set(id, { res, rej, progress }); worker!.postMessage({ ...msg, id }, transfer); }).finally(done);
  };

  // ---------------------------------------------------------------- the page
  const status = h('p', { class: 'muted small st-status', role: 'status', 'aria-live': 'polite' });
  const list = h('ol', { class: 'st-list', 'aria-label': 'The screenshots, top to bottom' });
  const auto = button('Find the order again', async () => { await call({ op: 'order', manual: null }); await refresh(); }, { small: true, icon: 'Wand', variant: 'ghost' });
  auto.hidden = true;
  const shown = h('div', { class: 'st-shots', hidden: true }, h('div', { class: 'st-head' }, h('h3', null, 'The screenshots, top to bottom'), auto), list);
  const canvases = h('div', { class: 'st-canvases' });
  const marks = h('div', { class: 'st-marks', 'aria-hidden': 'true' });
  const pic = h('div', { class: 'st-pic', tabindex: '0', role: 'region', 'aria-label': 'The long picture' }, h('div', { class: 'st-inner' }, canvases, marks));
  const size = h('p', { class: 'small', 'aria-live': 'polite' });
  const joinsT = toggle('Show where they meet', showJoins, (v) => { showJoins = v; drawMarks(); });
  const topT = toggle('Leave out the bars at the top (the status bar, the app’s title)', barsTop, (v) => { barsTop = v; void setBars(); });
  const botT = toggle('Leave out the bars at the bottom (the typing box, the buttons)', barsBottom, (v) => { barsBottom = v; void setBars(); });
  const fmtSel = segmented<Fmt>([['png', 'PNG'], ['jpeg', 'JPEG']], fmtChosen, (v) => { fmtChosen = v; });
  const saveB = button('Save picture', () => save('download'), { variant: 'primary', icon: 'Download' });
  const shareB = button('Share', () => save('share'), { icon: 'Share2' });
  const copyB = button('Copy', () => save('copy'), { icon: 'Copy', title: 'The picture on the clipboard (PNG)' });
  shareB.hidden = !ctx.isMobile || !('share' in navigator);
  copyB.hidden = ctx.isMobile || typeof ClipboardItem === 'undefined';
  const again = button('Start over', async () => {
    await call({ op: 'clear' }); thumbs.clear(); view = null; draw(); say('');
    const drop = input.el.querySelector('.drop'); drop?.classList.remove('drop-compact');
    const strong = drop?.querySelector('strong'); if (strong) strong.textContent = 'Choose screenshots';
  }, { variant: 'ghost', icon: 'RotateCcw', small: true });
  const result = h('div', { class: 'st-result', hidden: true },
    h('div', { class: 'st-pane' }, pic),
    h('div', { class: 'stack st-side' }, size, shown, joinsT, topT, botT,
      h('div', { class: 'field', role: 'group', 'aria-label': 'Save as' }, h('span', { class: 'field-label' }, 'Save as'), fmtSel,
        h('span', { class: 'field-hint' }, 'PNG keeps text sharp — and for chats and pages it is usually the smaller file; JPEG is smaller when the screenshots are mostly photos.')),
      actions(saveB, shareB, copyB),
      note('Sent in WhatsApp as a photo, a tall picture is made small and blurry: send it as a document to keep it sharp.'),
      again));

  const resultCard = card(null, result); resultCard.hidden = true;
  const input = imageInput(async (img, file) => { await addShot(img, file.name); }, {
    multiple: true, camera: false, paste: true, label: 'Choose screenshots', more: 'Add more screenshots',
    hint: 'or drop / paste (Ctrl+V) · screenshots of one chat or page, in any order',
  });

  root.append(
    card(null,
      h('p', { class: 'muted' }, 'Screenshots of one chat or web page, taken while scrolling → one tall picture. They may be in any order: the parts two screenshots have in common are found by themselves, and they are joined where both show the same rows.'),
      input.el, status),
    resultCard,
  );

  // ---------------------------------------------------------------- screenshots in
  let queue = Promise.resolve();
  const addShot = (img: Img, name: string) => (queue = queue.then(async () => {
    if (!alive) return;
    const id = nextId++;
    const th = document.createElement('canvas'); paint(previewOf(img, 160), th); th.className = 'st-thumb'; th.setAttribute('aria-hidden', 'true');
    thumbs.set(id, th);
    busy++; say(`Placing ${name} against the others…`);
    try {
      await call({ op: 'add', shot: id, name, img }, [img.data.buffer], (m) => say(`Placing ${name} against the others… (${m.pairs} compared)`));
      await refresh();
    } catch (e) { thumbs.delete(id); toast(`${name}: ${errMsg(e)}`, 'err'); }
    finally { busy--; if (!busy) say(''); }
  }));
  const say = (t: string) => { status.textContent = t; };

  // ---------------------------------------------------------------- the order and the picture
  const previewWidth = () => Math.min(view?.width || 720, Math.round(Math.min(560, Math.max(280, pic.clientWidth || 420)) * Math.min(2, devicePixelRatio || 1)));
  const refresh = async () => {
    if (!alive) return;
    if (!thumbs.size) { view = null; draw(); return; }
    view = await call<View>({ op: 'view', width: previewWidth() });
    if (alive) draw();
  };
  const setBars = async () => { await call({ op: 'bars', bars: { top: barsTop, bottom: barsBottom } }); await refresh(); };
  const nameOf = (id: number) => view?.shots.find((s) => s.id === id)?.name ?? '';
  const statusOf = (it: Item): string => {
    switch (it.status) {
      case 'top': return 'At the top';
      case 'joined': return `Joined under ${nameOf(it.under!)} — ${it.rows} rows in common${it.sure === false ? ' · rows repeat there (a run of the same message): check the join' : ''}`;
      case 'line': return view?.manual ? `Under ${nameOf(it.under!)} with a line: as you put them, they share nothing (the rows they share may be the other way round)`
        : `Nothing in common with ${nameOf(it.under!)}: under a line`;
      case 'same': return `The same as ${nameOf(it.sameAs!)}: left out`;
      case 'alone': return 'Nothing in common with the others';
    }
  };
  const move = async (id: number, by: number) => {
    const order = [...view!.order], i = order.indexOf(id), j = i + by;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    await call({ op: 'order', manual: order }); await refresh();
  };
  const removeShot = async (id: number) => { await call({ op: 'remove', shot: id }); thumbs.delete(id); await refresh(); };
  const draw = () => {
    clear(list);
    const has = !!view && thumbs.size > 0;
    shown.hidden = !has; result.hidden = !has; resultCard.hidden = !has;
    if (!has) { clear(canvases); clear(marks); return; }
    const v = view!, inOrder = v.order.length;
    auto.hidden = !v.manual;
    v.items.forEach((it, k) => {
      const s = v.shots.find((x) => x.id === it.id); if (!s) return;
      const placed = k < inOrder;
      const line = h('span', { class: ['st-what', it.status === 'joined' ? 'st-ok' : it.status === 'top' ? '' : 'st-warn'] }, statusOf(it));
      const scaled = s.from ? h('span', { class: 'st-what muted' }, `Made ${v.width} px wide like the others (it was ${s.from})`) : null;
      list.append(h('li', { class: ['st-item', !placed && 'st-out'] },
        thumbs.get(it.id) ?? null,
        h('div', { class: 'st-text' }, h('span', { class: 'st-name' }, placed ? `${k + 1}. ${s.name}` : s.name), line, scaled),
        h('div', { class: 'st-btns' },
          placed ? button('', () => move(it.id, -1), { icon: 'ArrowUp', small: true, variant: 'ghost', title: `Move ${s.name} up`, disabled: k === 0 }) : null,
          placed ? button('', () => move(it.id, 1), { icon: 'ArrowDown', small: true, variant: 'ghost', title: `Move ${s.name} down`, disabled: k === inOrder - 1 }) : null,
          button('', () => removeShot(it.id), { icon: 'X', small: true, variant: 'ghost', title: `Take ${s.name} out` }))));
    });
    // the preview, in canvases of at most CHUNK rows
    clear(canvases);
    const p = v.preview;
    if (p) {
      for (let y = 0; y < p.height; y += CHUNK) {
        const n = Math.min(CHUNK, p.height - y), c = document.createElement('canvas');
        c.width = p.width; c.height = n;
        c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.data.buffer as ArrayBuffer, y * p.width * 4, n * p.width * 4), p.width, n), 0, 0);
        canvases.append(c);
      }
    }
    pic.setAttribute('aria-label', `The long picture: ${v.width} × ${v.height} pixels, ${v.order.length} screenshots`);
    const groups = v.items.filter((x) => x.status === 'line').length;
    size.textContent = `${v.order.length} screenshot${v.order.length === 1 ? '' : 's'} → one picture of ${v.width.toLocaleString()} × ${v.height.toLocaleString()} px` +
      (groups ? ` · ${groups} line${groups === 1 ? '' : 's'} where screenshots share nothing` : '') + '.';
    drawMarks();
  };
  const drawMarks = () => {
    clear(marks);
    if (!view?.preview || !showJoins) return;
    const H = view.preview.height;
    for (const y of view.joins) marks.append(h('span', { class: 'st-join', style: { top: `${(y / H) * 100}%` } }));
  };

  // ---------------------------------------------------------------- saving
  const save = async (how: 'download' | 'share' | 'copy') => {
    if (!view?.pieces) return;
    const fmt: Fmt = how === 'copy' ? 'png' : fmtChosen;
    if (fmt === 'jpeg' && view.height > JPEG_MAX) { toast(`A JPEG holds at most ${JPEG_MAX.toLocaleString()} rows; this picture has ${view.height.toLocaleString()}. Save it as PNG.`, 'err', 6000); return; }
    const max = ctx.isMobile ? 50e6 : 100e6;
    if (view.width * view.height > max) { toast(`The picture would be ${(view.width * view.height / 1e6).toFixed(0)} megapixels — more than ${ctx.isMobile ? 'a phone' : 'this page'} can make. Leave some screenshots out.`, 'err', 6000); return; }
    say('Making the picture…');
    try {
      const { img } = await call<{ img: Img }>({ op: 'full' });
      say(fmt === 'png' ? 'Saving as PNG…' : 'Saving as JPEG…');
      const blob = await encodeImg(img, fmt, 90);
      const first = view.shots.find((s) => s.id === view!.order[0]);
      const name = `${baseName(first?.name || 'screenshots')}-long.${fmt === 'png' ? 'png' : 'jpg'}`;
      if (how === 'copy') {
        try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast('Copied — paste it anywhere', 'ok'); }
        catch (e) { toast(`The browser did not let the picture onto the clipboard (${errMsg(e)}): save it instead.`, 'err', 6000); }
      } else if (how === 'share') await shareOrDownload(blob, name);
      else downloadBlob(blob, name);
      say(`${name} — ${fmtBytes(blob.size)}`);
    } catch (e) { say(''); toast(errMsg(e), 'err', 6000); }
  };

  // the preview follows the page's width (a phone turned)
  let lastW = 0;
  const ro = new ResizeObserver(() => { const w = previewWidth(); if (view && Math.abs(w - lastW) > 40) { lastW = w; void refresh(); } });
  ro.observe(pic);
  return () => { alive = false; ro.disconnect(); input.dispose(); worker?.terminate(); worker = null; };
};
