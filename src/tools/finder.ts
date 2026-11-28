// Screenshot Finder (potentials #76): hundreds of screenshots and photos — chosen, dropped, a folder on a PC — are read on the
// device (Tesseract in its sparse-text mode, every word wherever it stands; a few readers at once on a PC) and the words
// inside them searched as they are typed: "that PNR", "the Wi-Fi password someone sent". The search is our C
// (wasm/textcore/find.c): the same word, words written together or apart, numbers read with their spaces, the OCR's slips,
// the beginning or the inside of a word, one slip of the keyboard. The words found are marked on the picture with the line
// around them. Nothing is stored and nothing leaves the device: what was read is forgotten when the tab is left.
import { h, card, button, note, clear, toast, errMsg, downloadBlob, shareOrDownload, copy, input, type Mount } from '../ui';
import { imagePicker } from '../lib/imgtools';
import { sparseReader, type SparseReader, type OcrResult } from '../lib/ocr';
import { textcore, type FindHit } from '../wasm/textcore';
import { onLeave } from '../lifecycle';
import { screenOn } from '../lib/wakelock';
import { imgproc, toImageData } from '../wasm/imgproc';
import { takenAt, readSize, prepare, indexWords, hasText, rank } from '../lib/finder';
import './finder.css';

/** a picture and what was read in it */
interface Pic {
  id: number; file: File; path: string;
  /** when it was taken (its name's date, else the file's) and whether that has a time of day */
  when: number; timed: boolean;
  thumb?: string; tw?: number; th?: number;
  /** the size it was read at (the words' boxes are in it) */
  rw?: number; rh?: number;
  /** a picture the browser cannot show itself (HEIC): a JPEG of it */
  shown?: Blob;
  read?: OcrResult; text?: string; failed?: string;
}
const IMG_EXT = /\.(jpe?g|jfif|png|webp|gif|bmp|heic|heif|avif|tiff?)$/i;
/** at most this many pictures (phones fewer: each keeps a thumbnail and its words) */
const MAX_PC = 5000, MAX_PHONE = 1500;
/** results shown at most (the summary counts all) */
const SHOWN = 240;

export const mount: Mount = (root, ctx) => {
  const phone = ctx.isMobile, MAX = phone ? MAX_PHONE : MAX_PC;
  // a few readers at once on a PC (each about 150 MB); one on a phone
  const POOL = phone ? 1 : Math.max(1, Math.min(3, Math.floor((navigator.hardwareConcurrency || 2) / 2)));
  let alive = true, paused = false, nextId = 1, index = 0;
  const pics: Pic[] = [], byId = new Map<number, Pic>(), queue: Pic[] = [], urls = new Set<string>();
  let tc: Awaited<ReturnType<typeof textcore>> | null = null;
  interface Slot { r: SparseReader; running: boolean }
  const slots: Slot[] = [];
  const screen = screenOn();
  let readMs = 0, readN = 0;
  const url = (b: Blob) => { const u = URL.createObjectURL(b); urls.add(u); return u; };

  // ---------------------------------------------------------------- the page
  const status = h('p', { class: 'small fi-status', role: 'status' });
  const bar = h('progress', { class: 'fi-progress', max: 1, value: 0, hidden: true, 'aria-label': 'Pictures read' }) as HTMLProgressElement;
  const stopB = button('Stop reading', () => { paused = true; sync(); }, { small: true, variant: 'ghost', icon: 'Pause', title: 'The pictures read so far can be searched; Go on reads the rest' });
  const goB = button('Go on reading', () => { paused = false; pump(); sync(); }, { small: true, icon: 'Play' });
  stopB.hidden = goB.hidden = true;
  const dirInput = h('input', { type: 'file', multiple: true, hidden: true }) as HTMLInputElement;
  dirInput.setAttribute('webkitdirectory', '');
  dirInput.addEventListener('change', () => { add([...(dirInput.files || [])].map((f) => ({ file: f, path: (f as any).webkitRelativePath || f.name }))); dirInput.value = ''; });
  const dirB = button('Choose a folder', () => chooseFolder(), { icon: 'FolderOpen', title: 'Every picture in a folder and in the folders inside it — Screenshots, Pictures, Downloads …' });
  const picker = imagePicker({
    accept: 'image/*,.heic,.heif', multiple: true, label: 'Choose screenshots or photos',
    hint: phone ? 'as many as you like — read on this phone' : 'or drop them, or a whole folder, here — read on this computer',
    onFiles: (files) => add(files.map((f) => ({ file: f, path: f.name }))), beside: phone ? [] : [dirB],
  });

  const q = input({ type: 'search', placeholder: 'e.g. PNR · wifi password · order shipped · 4521 678 903', attrs: { 'aria-label': 'Search the words in the pictures', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search', maxlength: 200 } });
  q.classList.add('fi-q');
  const summary = h('p', { class: 'small fi-summary', role: 'status' });
  const results = h('ul', { class: 'fi-grid', 'aria-label': 'Pictures found' });
  const unread = h('details', { class: 'fi-unread', hidden: true });
  const allTextB = button('Save all the text (.txt)', () => saveAllText(), { small: true, variant: 'ghost', icon: 'FileText', title: 'What was read in every picture, one after another' });
  const restartB = button('Start over', () => restart(), { small: true, variant: 'ghost', icon: 'RotateCcw', title: 'Forget these pictures and what was read in them' });
  const searchCard = card('Search the words in them', h('div', { class: 'stack' }, q, summary, results, unread, h('div', { class: 'row' }, allTextB, restartB)));
  searchCard.hidden = true;
  root.append(
    card('Pictures', h('div', { class: 'stack' }, picker, dirInput, bar, h('div', { class: 'row fi-status-row' }, status, stopB, goB),
      note(phone ? 'Read on this phone and forgotten when you leave this tab — nothing is stored or sent anywhere. Hundreds of pictures are read faster on a computer.'
        : 'Read on this computer and forgotten when you leave this tab — nothing is stored or sent anywhere.'))),
    searchCard,
  );
  const say = (t: string) => { status.textContent = t; };

  // ---------------------------------------------------------------- pictures in
  /** a folder dropped on the tab (a file picker takes only files): its pictures and those of the folders inside it */
  const onDrop = async (e: DragEvent) => {
    const entries = [...(e.dataTransfer?.items || [])].map((it) => (it as any).webkitGetAsEntry?.()).filter(Boolean);
    if (!entries.some((x: any) => x.isDirectory)) return; // files alone: the picker's own drop
    e.preventDefault(); e.stopPropagation();
    (e.target as HTMLElement).closest?.('.drop')?.classList.remove('over');
    const out: Array<{ file: File; path: string }> = [];
    const walk = async (en: any, path: string): Promise<void> => {
      if (out.length >= MAX || en.name.startsWith('.')) return;
      if (en.isFile) { if (IMG_EXT.test(en.name)) out.push({ file: await new Promise<File>((res, rej) => en.file(res, rej)), path: path + en.name }); return; }
      const reader = en.createReader();
      for (;;) {
        const batch: any[] = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const c of batch) await walk(c, `${path}${en.name}/`);
      }
    };
    say('Looking through the folder…');
    try { for (const en of entries) await walk(en, ''); } catch (err) { say(`The folder could not be read: ${errMsg(err)}`); return; }
    if (!out.length) { say('No pictures in that folder.'); return; }
    add(out);
  };
  const onOver = (e: DragEvent) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); };
  root.addEventListener('drop', onDrop, true);
  root.addEventListener('dragover', onOver);

  async function chooseFolder() {
    const pickDir = (window as any).showDirectoryPicker;
    if (typeof pickDir !== 'function') { dirInput.click(); return; }
    let dir: any;
    try { dir = await pickDir.call(window, { mode: 'read', id: 'superutils-finder' }); } catch (e: any) { if (e?.name !== 'AbortError') toast(errMsg(e), 'err'); return; }
    if (!alive) return;
    say(`Looking through ${dir.name}…`);
    const out: Array<{ file: File; path: string }> = [];
    const walk = async (d: any, path: string): Promise<void> => {
      for await (const [name, handle] of d.entries()) {
        if (out.length >= MAX || name.startsWith('.')) continue;
        if (handle.kind === 'directory') await walk(handle, `${path}${name}/`);
        else if (IMG_EXT.test(name)) out.push({ file: await handle.getFile(), path: path + name });
      }
    };
    try { await walk(dir, `${dir.name}/`); } catch (err) { say(`${dir.name} could not be read: ${errMsg(err)}`); return; }
    if (!alive) return;
    if (!out.length) { say(`No pictures in ${dir.name}.`); return; }
    add(out);
  }

  function add(files: Array<{ file: File; path: string }>) {
    if (!alive) return;
    const key = (f: File, path: string) => `${path}|${f.size}|${f.lastModified}`;
    const have = new Set(pics.map((p) => key(p.file, p.path)));
    const isPic = (f: File) => f.type.startsWith('image/') || IMG_EXT.test(f.name);
    const fresh: Array<{ file: File; path: string }> = [];
    for (const f of files) {
      if (!isPic(f.file) || have.has(key(f.file, f.path))) continue;
      have.add(key(f.file, f.path)); fresh.push(f);
    }
    const room = MAX - pics.length;
    if (!fresh.length) { if (files.length) say(files.some((f) => isPic(f.file)) ? 'Those pictures are here already.' : 'Those are no pictures.'); return; }
    if (fresh.length > room) toast(`At most ${MAX.toLocaleString('en-IN')} pictures at a time: ${(fresh.length - room).toLocaleString('en-IN')} left out.`, 'info', 5000);
    for (const f of fresh.slice(0, Math.max(0, room))) {
      const named = takenAt(f.file.name);
      const p: Pic = { id: nextId++, file: f.file, path: f.path, when: named ? named.t : f.file.lastModified || 0, timed: named ? named.timed : !!f.file.lastModified };
      pics.push(p); byId.set(p.id, p); queue.push(p);
    }
    // the newest first: those are usually the ones looked for
    queue.sort((a, b) => b.when - a.when);
    searchCard.hidden = false;
    paused = false;
    pump(); sync(); render();
  }

  // ---------------------------------------------------------------- reading
  /** the first reader starts at once; the others when it has its files (then they come from the browser's cache) */
  function pump() {
    if (paused || !alive || !queue.length) return;
    if (!slots.length) {
      const s: Slot = { r: sparseReader('eng'), running: false };
      slots.push(s);
      s.r.ready.then(() => { if (alive && slots.includes(s)) grow(); }, () => {});
    } else grow();
    for (const s of slots) if (!s.running) void run(s);
    screen.on();
  }
  function grow() {
    const first = slots[0];
    if (!first || paused || !alive) return;
    first.r.ready.then(() => {
      while (alive && !paused && slots.length < POOL && queue.length > slots.filter((s) => s.running).length) {
        const s: Slot = { r: sparseReader('eng'), running: false };
        slots.push(s); void run(s);
      }
    }, () => {});
  }
  async function run(s: Slot) {
    if (s.running) return;
    s.running = true;
    try {
      await s.r.ready;
      while (alive && !paused && queue.length) {
        const p = queue.shift()!;
        const t0 = performance.now();
        try { await readOne(s.r, p); } catch (e) {
          if (!alive) return;
          if (/text engine/.test(errMsg(e))) { queue.unshift(p); throw e; } // the reader itself failed: the picture waits for the next
          p.failed = errMsg(e);
        }
        if (!alive) return;
        readMs += performance.now() - t0; readN++;
        sync(); later();
      }
    } catch (e) {
      if (!alive) return;
      say(errMsg(e));
      const at = slots.indexOf(s); if (at >= 0) slots.splice(at, 1); // Go on starts a new reader
      s.r.end();
      paused = true;
    } finally {
      s.running = false;
      if (alive && !slots.some((x) => x.running)) { screen.off(); sync(); later(); }
    }
  }
  async function readOne(r: SparseReader, p: Pic) {
    let bmp: ImageBitmap;
    try { bmp = await createImageBitmap(p.file, { imageOrientation: 'from-image' } as any); }
    catch {
      const { loadImg } = await import('../lib/imgio'); // HEIC and what the browser cannot open itself
      let im;
      try { im = await loadImg(p.file); } catch { throw new Error('this picture could not be opened'); }
      bmp = await createImageBitmap(new ImageData(new Uint8ClampedArray(im.data), im.width, im.height));
      p.shown = new Blob(); // marked: a JPEG of it is made below
    }
    if (!alive) { bmp.close(); return; }
    const { width: rw, height: rh } = readSize(bmp.width, bmp.height);
    const c = h('canvas', { width: rw, height: rh }) as HTMLCanvasElement, g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bmp, 0, 0, rw, rh);
    bmp.close();
    const tk = Math.min(1, 360 / Math.max(rw, rh)), tw = Math.max(1, Math.round(rw * tk)), th = Math.max(1, Math.round(rh * tk));
    const t = h('canvas', { width: tw, height: th }) as HTMLCanvasElement;
    t.getContext('2d')!.drawImage(c, 0, 0, tw, th);
    const thumb = await new Promise<Blob | null>((res) => t.toBlob(res, 'image/jpeg', 0.8));
    if (p.shown) p.shown = (await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.88))) || undefined;
    if (!alive) return;
    if (thumb) { p.thumb = url(thumb); p.tw = tw; p.th = th; }
    p.rw = rw; p.rh = rh;
    // made ready in imgproc.wasm (its worker): a dark screen turned light, the background evened out (src/lib/finder.ts)
    const ready = await prepare({ data: g.getImageData(0, 0, rw, rh).data, width: rw, height: rh }, {
      histogram: (x) => imgproc('histogram', x), invert: (x) => imgproc('invert', x), flatShare: (x) => imgproc('flatShare', x), docEnhance: (x, m) => imgproc('docEnhance', x, m),
    });
    if (!alive) return;
    const read = await r.read(toImageData(ready.img), ready.screenshot);
    if (!alive) return;
    p.read = read;
    p.text = (read.lines || []).map((l) => read.words.slice(l.w0, l.w1).map((w) => w.text).join(' ')).join('\n');
    tc ||= await textcore();
    if (!alive) return;
    if (!index) index = tc.findNew();
    tc.findAdd(index, p.id, indexWords(read.words));
  }
  function sync() {
    if (!alive) return;
    const total = pics.length, done = pics.filter((p) => p.read || p.failed).length, busy = slots.some((s) => s.running);
    bar.hidden = !total || done === total; bar.max = Math.max(1, total); bar.value = done;
    stopB.hidden = !(busy && !paused) || done === total; goB.hidden = !paused || done === total;
    if (!total) { say(''); return; }
    if (done < total) {
      const each = readN ? readMs / readN / Math.max(1, slots.filter((s) => s.running).length) : 0;
      const left = each ? Math.round((each * (total - done)) / 1000) : 0;
      const when = left >= 90 ? `about ${Math.round(left / 60)} min left` : left > 5 ? `about ${left} s left` : '';
      say(`${paused ? 'Stopped' : 'Reading'}: ${done.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} ${total === 1 ? 'picture' : 'pictures'}${!paused && slots.length > 1 ? ` · ${slots.length} at a time` : ''}${!paused && when ? ` · ${when}` : ''}${done ? ' — what is read can be searched already.' : '.'}`);
    } else {
      const none = pics.filter((p) => p.read && !hasText(p.read.words)).length, bad = pics.filter((p) => p.failed).length;
      say(`${total.toLocaleString('en-IN')} ${total === 1 ? 'picture' : 'pictures'} read${none ? ` · ${none} without text` : ''}${bad ? ` · ${bad} could not be opened` : ''}.`);
    }
    const failed = pics.filter((p) => p.failed);
    unread.hidden = !failed.length;
    if (failed.length) clear(unread).append(h('summary', null, `${failed.length} could not be opened`), h('ul', { class: 'small' }, failed.slice(0, 200).map((p) => h('li', null, `${p.path} — ${p.failed}`))));
  }

  // ---------------------------------------------------------------- search
  let timer = 0, shownKey = '';
  const later = () => { clearTimeout(timer); timer = window.setTimeout(render, 300); };
  q.addEventListener('input', () => { clearTimeout(timer); timer = window.setTimeout(render, 120); });
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); render(); results.querySelector<HTMLButtonElement>('.fi-open')?.click(); } });
  /** the query as the index compares it: lower case, accents off */
  const norm = (s: string) => s.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().trim();
  function render() {
    if (!alive) return;
    const query = norm(q.value), readSoFar = pics.filter((p) => p.read).length, waiting = pics.some((p) => !p.read && !p.failed);
    let hits: Array<{ p: Pic; hit: FindHit; when: number }> = [];
    if (query && tc && index) {
      hits = rank(tc.findQuery(index, query).map((x) => ({ p: byId.get(x.p)!, hit: x, when: byId.get(x.p)?.when ?? 0 })).filter((x) => x.p));
    }
    const all = hits.filter((x) => x.hit.m === x.hit.n).length, some = hits.length - all;
    summary.textContent = !pics.length ? '' : !query ? `${readSoFar.toLocaleString('en-IN')} of ${pics.length.toLocaleString('en-IN')} ${pics.length === 1 ? 'picture' : 'pictures'} read — type words to search them.`
      : !hits.length ? `No picture has “${q.value.trim()}”${waiting ? ' yet — some are still being read' : ''}.`
        : `${all ? `${all.toLocaleString('en-IN')} ${all === 1 ? 'picture has' : 'pictures have'} ${hits[0].hit.n > 1 ? 'all the words' : 'it'}` : 'No picture has all the words'}${some ? ` · ${some.toLocaleString('en-IN')} ${some === 1 ? 'has' : 'have'} some of them` : ''}${hits.length > SHOWN ? ` · the first ${SHOWN} shown` : ''}${waiting ? ' · still reading the rest' : ''}.`;
    const key = query + '|' + hits.slice(0, SHOWN).map((x) => `${x.p.id}:${x.hit.w.join(',')}:${x.p.thumb ? 1 : 0}`).join(' ');
    if (key === shownKey) return; // the same pictures: the grid stays as it is (the focus too)
    shownKey = key;
    clear(results).append(...hits.slice(0, SHOWN).map(({ p, hit }) => h('li', { class: 'fi-item' }, tile(p, hit))));
  }
  /** the boxes of the words found, in % of the picture */
  function marks(p: Pic, hit: FindHit) {
    if (!p.read || !p.rw || !p.rh) return null;
    return h('span', { class: 'fi-marks', 'aria-hidden': 'true' }, hit.w.map((i) => {
      const w = p.read!.words[i]; if (!w) return null;
      const pad = 0.15 * (w.y1 - w.y0);
      return h('span', { class: 'fi-mark', style: `left:${(100 * (w.x0 - pad)) / p.rw!}%;top:${(100 * (w.y0 - pad)) / p.rh!}%;width:${(100 * (w.x1 - w.x0 + 2 * pad)) / p.rw!}%;height:${(100 * (w.y1 - w.y0 + 2 * pad)) / p.rh!}%` });
    }));
  }
  /** the lines the words found stand on, the words marked (a long line cut round them) */
  function snippet(p: Pic, hit: FindHit) {
    const r = p.read!, found = new Set(hit.w);
    return (r.lines || []).filter((l) => hit.w.some((i) => i >= l.w0 && i < l.w1)).slice(0, 2).map((l) => {
      const line = r.words.slice(l.w0, l.w1).map((w, k) => ({ t: w.text, on: found.has(l.w0 + k) }));
      const first = line.findIndex((x) => x.on), last = line.length - 1 - [...line].reverse().findIndex((x) => x.on);
      const cut = line.length > 16, from = cut ? Math.max(0, first - 6) : 0, to = cut ? Math.min(line.length, last + 7) : line.length;
      return h('span', { class: 'fi-line' }, from > 0 ? '… ' : '', ...line.slice(from, to).flatMap((x, k) => [k ? ' ' : '', x.on ? h('mark', null, x.t) : x.t]), to < line.length ? ' …' : '');
    });
  }
  /** the thumbnail: a window on the picture, a tall one moved to its first word found (finder.css) */
  function thumbOf(p: Pic, hit: FindHit) {
    const r = p.tw && p.th ? p.th / p.tw : 1;
    const w = p.read?.words[hit.w[0]], my = w && p.rh ? (w.y0 + w.y1) / 2 / p.rh : 0;
    return h('span', { class: 'fi-thumb' },
      h('span', { class: ['fi-pic', r <= 4 / 3 && 'fi-wide'], style: `--r:${r.toFixed(4)};--my:${my.toFixed(4)}` }, p.thumb ? h('img', { src: p.thumb, alt: '' }) : null, marks(p, hit)));
  }
  const dateOf = (p: Pic) => (p.when ? new Date(p.when).toLocaleString(undefined, p.timed ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  function tile(p: Pic, hit: FindHit) {
    const part = hit.m < hit.n ? `${hit.m} of ${hit.n} words` : '';
    return h('button', { type: 'button', class: 'fi-open', onclick: () => view.open(p, hit) },
      thumbOf(p, hit),
      h('span', { class: 'fi-text' },
        h('span', { class: 'fi-name' }, p.path),
        h('span', { class: 'fi-meta small' }, [dateOf(p), part].filter(Boolean).join(' · ')),
        h('span', { class: 'fi-snip small' }, snippet(p, hit))));
  }

  // ---------------------------------------------------------------- one picture, large
  const view = (() => {
    let dlg: HTMLDialogElement | null = null, big = '';
    const drop = () => { if (big) { URL.revokeObjectURL(big); urls.delete(big); big = ''; } };
    const remove = () => { if (dlg?.open) dlg.close(); dlg?.remove(); dlg = null; drop(); };
    function open(p: Pic, hit: FindHit) {
      remove();
      big = url(p.shown || p.file);
      const title = h('h2', { class: 'fi-dlg-title', id: 'fi-dlg-title' }, p.path);
      const img = h('img', { src: big, alt: p.path, class: 'fi-big-img' });
      const stage = h('div', { class: 'fi-stage', style: p.rw ? `aspect-ratio:${p.rw}/${p.rh}` : '' }, img, marks(p, hit));
      const save = button(phone ? 'Share or save' : 'Save the picture', () => (phone ? shareOrDownload(p.file, p.file.name) : downloadBlob(p.file, p.file.name)), { icon: phone ? 'Share2' : 'Download', small: true });
      const copyB = button('Copy the text', () => copy(p.text || ''), { icon: 'Copy', small: true, disabled: !p.text });
      const closeB = button('', () => dlg?.close(), { icon: 'X', variant: 'ghost', title: 'Close' });
      const d = h('dialog', { class: 'fi-dlg', 'aria-labelledby': title.id },
        h('div', { class: 'fi-dlg-head' }, title, closeB),
        h('div', { class: 'fi-dlg-body' },
          h('div', { class: 'fi-stage-wrap' }, stage),
          h('div', { class: 'fi-dlg-side stack' },
            h('p', { class: 'small muted' }, [dateOf(p), p.rw ? `read at ${p.rw} × ${p.rh}` : ''].filter(Boolean).join(' · ')),
            h('p', { class: 'fi-snip' }, snippet(p, hit)),
            h('div', { class: 'row' }, save, copyB),
            h('details', { class: 'fi-alltext' }, h('summary', null, 'All the text read in it'), h('pre', null, p.text || 'No text was found in this picture.'))))) as HTMLDialogElement;
      dlg = d;
      d.addEventListener('close', () => { d.remove(); if (dlg === d) { dlg = null; drop(); } });
      document.body.append(d);
      d.showModal();
      closeB.focus();
      // the first word found brought into view in a tall screenshot
      img.addEventListener('load', () => (stage.querySelector('.fi-mark') as HTMLElement | null)?.scrollIntoView({ block: 'center' }), { once: true });
    }
    return { open, remove };
  })();

  // ---------------------------------------------------------------- the text, starting over, leaving
  function saveAllText() {
    const parts = pics.filter((p) => p.read).map((p) => `=== ${p.path}${p.when ? ` (${new Date(p.when).toLocaleString()})` : ''}\n${p.text || '(no text)'}\n`);
    if (!parts.length) { toast('Nothing is read yet.'); return; }
    downloadBlob(new Blob([parts.join('\n').replace(/\r?\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' }), 'screenshot-text.txt');
  }
  /** everything let go: the readers, the index, the pictures and their thumbnails */
  function letGo() {
    queue.length = 0;
    for (const s of slots) s.r.end();
    slots.length = 0;
    if (tc && index) { try { tc.findFree(index); } catch { /* gone with its module */ } }
    index = 0;
    view.remove();
    for (const u of urls) URL.revokeObjectURL(u);
    urls.clear(); pics.length = 0; byId.clear(); readMs = 0; readN = 0; shownKey = '';
  }
  function restart() {
    letGo(); paused = false; screen.off();
    q.value = ''; clear(results); searchCard.hidden = true;
    sync(); say('Forgotten. Choose pictures to search again.');
  }
  onLeave('finder', () => { alive = false; letGo(); tc = null; screen.dispose(); });

  sync();
  return () => { root.removeEventListener('drop', onDrop, true); root.removeEventListener('dragover', onOver); };
};
