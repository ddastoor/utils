// Is This Screenshot Real? (potentials #82): a "payment successful" screenshot or any photo checked for signs of editing, in
// plain words — an earlier JPEG save and the parts not saved like the rest (the amount painted over), copied areas in a photo,
// the preview kept inside the file against the picture, an editing program and its history (ExifTool), and what a payment app
// never writes (a weekday not the date's, a UPI reference not 12 digits, the phone's clock before the payment, two amounts).
// Signs, never a proof: a fake can be made without leaving any — only the money in an account proves a payment. Everything is
// read on the device. The rules: src/lib/realcheck.ts; the picture's checks: src/workers/realcheck.worker.ts.
import { h, card, button, note, clear, errMsg, fmtBytes, type Mount } from '../ui';
import { imageInput } from '../lib/imgtools';
import { trackWorker } from '../lifecycle';
import { imgproc, toImageData, type Img } from '../wasm/imgproc';
import { metacore } from '../wasm/metacore';
import { loadImg, previewOf } from '../lib/imgio';
import { readExif } from '../lib/exif';
import { readPhotoTags, readPreviews } from '../lib/exiftool-client';
import { sparseReader, type SparseReader } from '../lib/ocr';
import { prepare, readSize } from '../lib/finder';
import * as R from '../lib/realcheck';
import './realcheck.css';

interface Pict { facts: R.JpegFacts | null; ghost: { earlier: number; depth: number; dip: number; blocks: number; areas: Array<{ blocks: number; x0: number; y0: number; x1: number; y1: number; excess: number }>; bw: number; bh: number } | null; jpegError: string; screenshot: boolean; copies: R.CopyArea[] | null; ela: Img; elaMean: number; rawW: number; rawH: number }
type Step = 'picture' | 'meta' | 'preview' | 'text';
const STEP_NAMES: Record<Step, string> = { picture: 'The picture: its JPEG saves, its parts', meta: 'The metadata (ExifTool)', preview: 'The preview kept inside the file', text: 'The text: dates, times, references, amounts' };

export const mount: Mount = (root, ctx) => {
  const phone = ctx.isMobile;
  let alive = true, seq = 0, reader: SparseReader | null = null;

  // ---------------------------------------------------------------- the worker
  let worker: Worker | null = null, nid = 0;
  const pend = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
  const work = <T,>(msg: any, transfer: Transferable[] = []): Promise<T> => {
    if (!worker) {
      worker = trackWorker(new Worker(new URL('../workers/realcheck.worker.ts', import.meta.url), { type: 'module' }), 'realcheck', () => { for (const p of pend.values()) p.rej(new Error('Stopped.')); pend.clear(); worker = null; });
      worker.onmessage = (e) => { const m = e.data; if (m.op === 'progress') return; const p = pend.get(m.id); if (!p) return; pend.delete(m.id); m.error ? p.rej(new Error(m.error)) : p.res(m.result); };
      worker.onerror = (e) => { for (const p of pend.values()) p.rej(new Error(e.message || 'The check stopped working.')); pend.clear(); worker?.terminate(); worker = null; };
    }
    const id = ++nid, w = worker;
    return new Promise<T>((res, rej) => { pend.set(id, { res, rej }); w.postMessage({ ...msg, id }, transfer); });
  };

  // ---------------------------------------------------------------- the page
  const intro = note(h('span', null, 'Checks a screenshot or photo for signs of editing: an amount painted over, a part copied, an editing app’s traces, what a payment app never writes. ', h('strong', null, 'Signs, never a proof'), ' — read on this device, nothing is sent.'));
  const input = imageInput((img, file) => { void check(img, file); }, {
    label: 'Choose a screenshot or photo', camera: false, paste: true,
    hint: phone ? 'the screenshot someone sent you — or paste it' : 'or drop it here, or paste it (Ctrl+V) · JPG, PNG, WebP, HEIC',
  });
  const out = h('div', { class: 'rc-out', hidden: true });
  const bank = note(h('span', null, h('strong', null, 'Only your account proves a payment. '), 'A screenshot can be faked without leaving a trace — made from scratch, or shown by a fake-payment app. Before you hand over goods or money, open your own bank or UPI app and see the money arrive (its history, or the bank’s SMS from its own sender).'), 'warn');
  root.append(card(null, intro, input.el), out, bank);

  // ---------------------------------------------------------------- one check
  async function check(img: Img, file: File) {
    const my = ++seq, live = () => alive && my === seq;
    const state = { pict: null as Pict | null, meta: null as R.MetaFacts | null, tags: null as R.Tags | null, preview: null as any, previewSize: null as number[] | null, text: null as R.Row[] | null, steps: {} as Record<Step, 'run' | 'done' | string>, orientation: 1, lossless: true, kind: '' };
    const shown = previewOf(img, phone ? 1200 : 1600);
    // the page for this picture
    const verdictEl = h('section', { class: 'rc-verdict rc-pending', role: 'status', 'aria-live': 'polite' });
    const stepsEl = h('ul', { class: 'rc-steps', 'aria-label': 'What is being checked' });
    const canvas = h('canvas', { class: 'rc-pic', width: shown.width, height: shown.height, role: 'img', 'aria-label': `${file.name}, with the places of the signs outlined` }) as HTMLCanvasElement;
    canvas.getContext('2d')!.putImageData(toImageData(shown), 0, 0);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${img.width} ${img.height}`); svg.setAttribute('class', 'rc-marks'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('preserveAspectRatio', 'none');
    const picBox = h('div', { class: 'rc-picbox' }, h('div', { class: 'rc-pin' }, canvas, svg));
    const signsEl = h('div', { class: 'rc-list' });
    const factsEl = h('dl', { class: 'rc-facts' });
    const elaEl = h('div', { class: 'rc-ela' });
    const textEl = h('pre', { class: 'rc-text small' });
    clear(out).append(
      verdictEl,
      h('div', { class: 'rc-grid' }, h('div', { class: 'rc-col' }, picBox, h('p', { class: 'small muted' }, `${file.name} · ${img.width} × ${img.height}`)), h('div', { class: 'rc-col' }, signsEl, stepsEl)),
      h('details', { class: 'rc-more' }, h('summary', null, 'About the file'), factsEl),
      h('details', { class: 'rc-more' }, h('summary', null, 'Error levels — look for yourself'), elaEl),
      h('details', { class: 'rc-more' }, h('summary', null, 'The text read in it'), textEl),
      h('details', { class: 'rc-more' }, h('summary', null, 'What this can and cannot tell'), limits()),
    );
    out.hidden = false;
    const shownBoxes = new Set<string>();
    /** a sign's places on the picture shown or hidden (pressed: shown) */
    const showButton = (id: string) => {
      const on = shownBoxes.has(id), b = button('On the picture', () => { shownBoxes.has(id) ? shownBoxes.delete(id) : shownBoxes.add(id); render(); }, { small: true, variant: 'ghost', icon: on ? 'Eye' : 'EyeOff', title: on ? 'Its places are outlined on the picture — press to hide them' : 'Outline its places on the picture' });
      b.setAttribute('aria-pressed', String(on));
      return b;
    };
    let seeded = false;
    const render = () => {
      if (!live()) return;
      const p = state.pict;
      const signs = [
        ...(p ? R.pictureSigns({
          jpeg: p.facts, ghost: p.ghost, lossless: state.lossless, screenshot: p.screenshot, name: file.name, copies: p.copies,
          ghostBoxes: p.ghost ? R.areaBoxes({ ...p.ghost, curve: [], qlo: 0, map: new Float32Array() } as any, p.rawW, p.rawH).map((b) => R.orientBox(b, p.rawW, p.rawH, state.orientation)) : [],
          preview: state.preview ? { ...state.preview, boxes: state.preview.boxes.map((b: R.Box) => R.orientBox(b, p.rawW, p.rawH, state.orientation)) } : null,
        }) : []),
        ...(p?.jpegError ? [{ id: 'jpeg-error', strength: 'info' as const, title: 'The JPEG’s data', text: `Its saves could not be checked: ${p.jpegError}` }] : []),
        ...(state.text ? R.textSigns(state.text, { width: img.width, height: img.height, today: today() }) : []),
        ...(state.meta ? R.metaSigns(state.meta) : []),
      ];
      const order = { strong: 0, weak: 1, info: 2 };
      signs.sort((a, b) => order[a.strength] - order[b.strength]);
      // the verdict, once every step has answered
      const pending = (Object.keys(STEP_NAMES) as Step[]).filter((s) => state.steps[s] === 'run');
      clear(verdictEl);
      if (pending.length) { verdictEl.className = 'rc-verdict rc-pending'; verdictEl.dataset.tone = 'pending'; verdictEl.append(h('strong', null, 'Checking…'), h('span', null, ` ${4 - pending.length} of 4 checks done`)); }
      else { const v = R.verdict(signs); verdictEl.className = `rc-verdict rc-tone-${v.tone}`; verdictEl.dataset.tone = v.tone; verdictEl.append(h('strong', { class: 'rc-headline' }, v.headline), h('span', null, v.text)); }
      // the steps
      clear(stepsEl).append(...(Object.keys(STEP_NAMES) as Step[]).map((s) => {
        const st = state.steps[s];
        return h('li', { class: st === 'run' ? 'rc-run' : st === 'done' ? 'rc-done' : 'rc-fail' }, STEP_NAMES[s], st === 'run' ? ' — checking…' : st === 'done' ? '' : ` — ${st}`);
      }));
      // the signs
      const groups: Array<[R.Strength, string]> = [['strong', 'Signs of editing'], ['weak', 'Worth a look'], ['info', 'About the file']];
      // the places of the signs of editing and of those worth a look are outlined at first (once every check has answered)
      if (!pending.length && !seeded) { seeded = true; for (const s of signs) if (s.boxes?.length && s.strength !== 'info') shownBoxes.add(s.id); }
      clear(signsEl).append(...groups.filter(([g]) => signs.some((s) => s.strength === g)).map(([g, title]) => {
        const list = signs.filter((s) => s.strength === g);
        return h('section', { class: `rc-group rc-${g}` }, h('h3', null, title), h('ul', null, ...list.map((s) => h('li', { class: 'rc-sign', 'data-sign': s.id },
          h('div', { class: 'rc-sign-head' }, h('strong', null, s.title), s.boxes?.length ? showButton(s.id) : null),
          h('p', null, s.text)))));
      }));
      // the boxes on the picture
      svg.replaceChildren(...signs.filter((s) => s.boxes?.length && shownBoxes.has(s.id)).flatMap((s) => s.boxes!.map((b) => {
        const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const pad = Math.max(3, img.width / 200);
        r.setAttribute('x', String(b[0] - pad)); r.setAttribute('y', String(b[1] - pad)); r.setAttribute('width', String(b[2] - b[0] + 2 * pad)); r.setAttribute('height', String(b[3] - b[1] + 2 * pad));
        r.setAttribute('class', `rc-box rc-box-${s.strength} rc-box-${s.id}`); r.setAttribute('rx', String(pad));
        return r;
      })));
      // the facts
      const m = state.meta, j = p?.facts;
      const fact = (k2: string, v: string | null | undefined) => (v ? [h('dt', null, k2), h('dd', null, v)] : []);
      clear(factsEl).append(
        ...fact('File', `${file.name} · ${state.kind.toUpperCase() || file.type || 'picture'} · ${fmtBytes(file.size)}`),
        ...fact('Picture', `${img.width} × ${img.height} pixels${state.orientation !== 1 ? ` (stored turned: EXIF orientation ${state.orientation})` : ''}`),
        ...fact('JPEG', j ? `quality ${j.quality}${j.standard ? ', libjpeg’s standard tables' : ', tables of its own'}, colour ${j.sampling}${j.progressive ? ', progressive' : ''}${j.arithmetic ? ', arithmetic coding' : ''}` : null),
        ...fact('Earlier save', p?.ghost ? (p.ghost.earlier ? `about quality ${p.ghost.earlier} (the curve rises ${p.ghost.depth.toFixed(2)}× after its dip)` : 'none found') : null),
        ...fact('Looked like', p ? (p.screenshot ? 'a screenshot (large areas of one exact colour)' : 'a photo') : null),
        ...fact('Saved by', m?.software.join(', ')),
        ...fact('Camera or phone', m?.camera),
        ...fact('Taken', m?.taken), ...fact('Changed', m?.modified),
        ...fact('Comment', m?.comment),
        ...fact('Preview inside', m ? (m.hasPreview ? (state.previewSize ? `yes, ${state.previewSize[0]} × ${state.previewSize[1]}` : 'yes') : 'none') : null),
      );
    };
    const step = (s: Step, st: 'run' | 'done' | string) => { state.steps[s] = st; render(); };
    (Object.keys(STEP_NAMES) as Step[]).forEach((s) => (state.steps[s] = 'run'));
    render();

    // the file's kind and turn
    let raw: Img | null = null;
    try {
      const head = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
      state.kind = (await metacore()).sniff(head).type;
      state.lossless = state.kind !== 'jpeg';
      if (state.kind === 'jpeg') state.orientation = (await readExif(file)).orientation || 1;
      if (state.orientation !== 1) raw = await imgproc('orient', img, R.UNTURN[state.orientation] ?? 1);
    } catch { /* checked as it is shown */ }
    if (!live()) return;

    // the picture (the worker)
    const pic = (async () => {
      try {
        const bytes = state.kind === 'jpeg' ? await file.arrayBuffer() : null;
        state.pict = await work<Pict>({ op: 'picture', img, raw, bytes, maxPx: phone ? 24e6 : 60e6 }, bytes ? [bytes] : []);
        if (!live()) return;
        paintEla(state.pict.ela, state.pict.elaMean);
        if (state.kind === 'heic' || state.kind === 'avif') state.lossless = false;
        step('picture', 'done');
      } catch (e) { if (live()) step('picture', `could not be checked: ${errMsg(e)}`); }
    })();
    // the metadata and the preview (ExifTool)
    const meta = (async () => {
      try {
        state.tags = await readPhotoTags(file);
        if (!live()) return;
        state.meta = R.metaFacts(state.tags);
        step('meta', 'done');
      } catch (e) { if (live()) step('meta', `could not be read: ${errMsg(e)}`); }
      try {
        const pv = await readPreviews(file);
        if (!live()) return;
        const best = pv['IFD1:ThumbnailImage'] ?? Object.values(pv)[0];
        if (!best) { step('preview', 'done'); return; }
        const thumb = await loadImg(new Blob([best as BlobPart], { type: 'image/jpeg' }));
        state.previewSize = [thumb.width, thumb.height];
        await pic;
        if (!live()) return;
        state.preview = await work({ op: 'preview', thumb, raw: raw ?? img });
        step('preview', 'done');
      } catch (e) { if (live()) step('preview', `could not be compared: ${errMsg(e)}`); }
    })();
    // the text (the OCR, as the Screenshot Finder reads a screenshot)
    const text = (async () => {
      try {
        reader ||= sparseReader('eng');
        const { width: rw, height: rh } = readSize(img.width, img.height), small = rw === img.width ? img : await imgproc('resize', img, rw, rh);
        const ready = await prepare(small, { histogram: (x) => imgproc('histogram', x), invert: (x) => imgproc('invert', x), flatShare: (x) => imgproc('flatShare', x), docEnhance: (x, m) => imgproc('docEnhance', x, m) });
        if (!live()) return;
        const read = await reader.read(toImageData(ready.img), ready.screenshot);
        if (!live()) return;
        const sk = img.width / rw;
        state.text = R.rowsOf(read.words.map((w) => ({ ...w, x0: w.x0 * sk, y0: w.y0 * sk, x1: w.x1 * sk, y1: w.y1 * sk })));
        textEl.textContent = state.text.map((r) => r.text).join('\n') || 'No text was read in this picture.';
        step('text', 'done');
      } catch (e) { if (live()) step('text', `could not be read: ${errMsg(e)}`); }
    })();
    await Promise.all([pic, meta, text]);

    function paintEla(ela: Img, mean: number) {
      const c = h('canvas', { width: ela.width, height: ela.height, class: 'rc-ela-pic', role: 'img', 'aria-label': 'The error levels of the picture' }) as HTMLCanvasElement;
      c.getContext('2d')!.putImageData(toImageData(ela), 0, 0);
      clear(elaEl).append(
        h('p', { class: 'small' }, 'The picture saved again as a JPEG at quality 90, and the difference made bright (error-level analysis). The edges of text, lines and icons are always bright. A part whose brightness differs from like parts near it — one number brighter than the numbers beside it — is worth a second look. On its own this proves nothing: error levels are easily misread, and the check above weighs the saves for you.'),
        c, h('p', { class: 'small muted' }, `Mean error ${mean.toFixed(2)} levels a pixel.`));
    }
  }

  function limits() {
    return h('ul', { class: 'rc-limits small' },
      h('li', null, 'A fake made from scratch — drawn in an app, shown by a fake-payment app, a web page made to look like a receipt — leaves none of these traces. No sign found does not mean genuine.'),
      h('li', null, 'The parts changed after a first save are found when the picture was a JPEG before the change: a screenshot sent through a chat app, then edited. Saved at close qualities (85, then 95), made smaller or cropped after the change, the traces are lost. Measured on 647 test pictures: an earlier save found in 97 % of those saved twice at the qualities apps use, the part changed in 6 of 10 edits — and never a part on an unedited picture.'),
      h('li', null, 'A picture sent through WhatsApp or another chat app is saved again by it: what the sender’s phone saved is gone, and its metadata too.'),
      h('li', null, 'The text is read by OCR: a misread digit can make a sign. Look at the picture where it is outlined.'),
      h('li', null, 'An editing program in the metadata is a sign that the picture went through it — not of what was changed. Cropping counts too.'),
    );
  }
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  return () => { alive = false; seq++; reader?.end(); reader = null; input.dispose?.(); };
};
