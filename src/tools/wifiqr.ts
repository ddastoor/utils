// Router Sticker → Wi-Fi QR (potentials #88; owner's pick of 27 Nov 2026 — group 4 of the suggested order): photograph the label
// under a router → its network name and password read → a Wi-Fi QR code for guests, and a card to print. The photo is read by
// the OCR's reading path (src/lib/readpage.ts with the camera helpers' options: src/lib/snaptext.ts), a QR code on the label by
// zxing-cpp; the label's wording by src/lib/wifilabel.ts; the code drawn by zxing-cpp (src/lib/qrdraw.ts). PC + phones.
import { h, card, field, stack, note, actions, button, toggle, segmented, progress, clear, toast, errMsg, downloadBlob, shareOrDownload, copy, input, type Mount } from '../ui';
import { imageInput } from '../lib/imgtools';
import type { Img } from '../wasm/imgproc';
import { readLabel, lookalikes, passwordProblem, type Net, type Sec } from '../lib/wifilabel';
import { linesOf, SNAP_READ } from '../lib/snaptext';
import { wifi } from '../lib/qrdata';
import './wifiqr.css';

const BAND: Record<string, string> = { '2.4': '2.4 GHz', '5': '5 GHz', '6': '6 GHz' };

export const mount: Mount = (root, ctx) => {
  let seq = 0, gone = false, nets: Net[] = [];
  const prog = progress();
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const list = h('div', { class: 'stack' });
  const asideEl = h('div');
  const readEl = h('div');
  const result = card('Wi-Fi networks', list);
  result.hidden = true;
  const add = button('Add a network by hand', () => { nets.push({ ssid: '', password: '', sec: 'WPA', hidden: false, band: '', from: 'label', ssidLine: -1, passLine: -1 }); show(); result.hidden = false; }, { variant: 'ghost', icon: 'Plus' });

  /** One network: its name, password, security and the QR code, all editable; the code follows the boxes. */
  function netCard(n: Net, i: number) {
    const preview = h('div', { class: 'wq-code', role: 'img', 'aria-label': 'The Wi-Fi QR code' });
    const warn = h('div', { class: 'stack' });
    let svg = '', my = 0;
    const draw = async () => {
      const me = ++my;
      const c = wifi({ ssid: n.ssid, pass: n.password, sec: n.sec === 'nopass' ? 'none' : n.sec, hidden: n.hidden });
      clear(warn);
      const look = n.from === 'label' && n.password ? lookalikes(n.password) : [];
      const prob = passwordProblem(n.password, n.sec);
      if (prob) warn.append(note(prob, 'warn'));
      if (look.length) warn.append(note(`Read from the label by the OCR: compare the password with the label — look again at ${look.join('; ')}.`, 'info'));
      c.warnings.filter((w) => !/WPA password has 8/.test(w)).forEach((w) => warn.append(note(w, 'warn')));
      if (!c.text) { preview.replaceChildren(h('p', { class: 'muted small' }, 'Type the network’s name to make its code.')); svg = ''; return; }
      try {
        const { qrSvg } = await import('../lib/qrdraw');
        const s = await qrSvg(c.text);
        if (me !== my || gone) return;
        svg = s; preview.innerHTML = s; // zint's own SVG (our generated markup)
      } catch (e) { if (me === my) { preview.replaceChildren(note(errMsg(e), 'err')); svg = ''; } }
    };
    const ssidIn = input({ value: n.ssid, attrs: { autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off' }, onInput: (v) => { n.ssid = v; void draw(); } });
    const passIn = input({ value: n.password, attrs: { class: 'input mono', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off' }, onInput: (v) => { n.password = v; void draw(); } });
    const sec = segmented<Sec>([['WPA', 'WPA / WPA2 / WPA3'], ['WEP', 'WEP'], ['nopass', 'No password']], n.sec, (v) => { n.sec = v; void draw(); });
    const hidden = toggle('Hidden network (it does not show in the list of networks)', n.hidden, (v) => { n.hidden = v; void draw(); });
    const name = () => (n.ssid.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'wifi');
    const save = async (blob: Blob, file: string) => (ctx.isMobile ? shareOrDownload(blob, file) : downloadBlob(blob, file));
    const title = h('h3', { class: 'wq-title' }, `Network ${i + 1}${n.band ? ` · ${BAND[n.band] ?? n.band}` : ''}`,
      h('span', { class: 'wq-from' }, n.from === 'qr' ? 'from the label’s QR code' : n.ssidLine >= 0 || n.passLine >= 0 ? 'read from the label — check it' : 'typed in'));
    void draw();
    return h('div', { class: 'wq-net' },
      title,
      h('div', { class: 'wq-grid' },
        h('div', { class: 'stack' },
          field('Network name (SSID)', ssidIn),
          field('Password', passIn),
          field('Security', sec),
          hidden,
          warn),
        h('div', { class: 'stack wq-side' }, preview,
          h('div', { class: 'row wq-btns' },
            button('Save QR (PNG)', async () => { if (!svg) throw new Error('No code yet: type the network’s name.'); const { svgToPng } = await import('../lib/qrdraw'); await save(await svgToPng(svg, 1024), `${name()}-wifi-qr.png`); }, { icon: 'Download', small: true }),
            button('Card for guests', async () => {
              if (!svg) throw new Error('No code yet: type the network’s name.');
              const { qrCard } = await import('../lib/qrdraw');
              await save(await qrCard({ title: 'Wi-Fi', svg, rows: [['Network', n.ssid], ...(n.sec !== 'nopass' && n.password ? [['Password', n.password] as [string, string]] : [])], foot: 'Point your phone’s camera at the code to join' }), `${name()}-wifi-card.png`);
            }, { icon: 'IdCard', small: true, title: 'A card with the code, the network and the password (PNG) — to print or show' }),
            n.password ? button('Copy password', () => copy(n.password), { icon: 'Copy', small: true, variant: 'ghost' }) : null))));
  }
  function show() {
    clear(list);
    if (!nets.length) list.append(note('No Wi-Fi network name or password was found on this photo. Photograph the label closer, straight on and in good light — or type them by hand.', 'warn'));
    nets.forEach((n, i) => list.append(netCard(n, i)));
    list.append(h('div', { class: 'row' }, add));
  }

  let reads = 0, again2 = false;
  /** Tesseract's confidence under which a name's or a password's line is read again by the second reader */
  const SURE = 90;
  async function run(img: Img) {
    again2 = false;
    const my = ++seq, stale = () => gone || my !== seq;
    nets = []; clear(list); clear(asideEl); clear(readEl); result.hidden = true; status.textContent = '';
    root.setAttribute('aria-busy', 'true');
    try {
      prog.set(null, 'Reading the label…');
      const [{ readPage, secondWords }, { findCodes }] = await Promise.all([import('../lib/readpage'), import('../lib/codesread')]);
      // a QR code on the label (some print one) is read exactly; the text by the OCR's reading path
      const codes = (await findCodes(img).catch(() => [])).map((c) => c.text);
      if (stale()) return;
      const reading = await readPage(img, {
        lang: 'eng', ...SNAP_READ, stale,
        onProgress: (p, s) => { if (!stale()) prog.set(/recogn/i.test(s) ? p : null, /recogn/i.test(s) ? `Reading the label… ${Math.round(p * 100)} %` : 'Loading the text engine…'); },
        onSecond: (q) => { if (!stale()) { const w = secondWords(q); prog.set(w.p, w.text); } },
      });
      if (stale()) return;
      prog.done();
      const lines = reading ? linesOf(reading.r) : [];
      const got = readLabel(lines, codes);
      nets = got.nets;
      // the lines of a name or a password Tesseract was unsure of, read again by the second reader (PaddleOCR) — the surer
      // reading of each value kept: a password is all that matters here, and one character read wrong locks the guest out
      if (reading && reading.engine === 'tesseract') {
        const { browserEngines, secondBetter } = await import('../lib/readpage');
        for (const n of nets) for (const [li, what] of [[n.ssidLine, 'ssid'], [n.passLine, 'password']] as const) {
          const l = lines[li], v = n[what];
          if (n.from !== 'label' || !l || !v || stale()) continue;
          const conf = Math.min(...l.words.map((w) => w.conf));
          if (conf >= SURE) continue;
          const m = Math.round(l.h * 0.6), I = reading.img;
          const x0 = Math.max(0, Math.round(l.box[0] - m)), y0 = Math.max(0, Math.round(l.box[1] - m)), x1 = Math.min(I.width, Math.round(l.box[2] + m)), y1 = Math.min(I.height, Math.round(l.box[3] + m));
          if (x1 - x0 < 8 || y1 - y0 < 8) continue;
          const crop = { width: x1 - x0, height: y1 - y0, data: new Uint8ClampedArray((x1 - x0) * (y1 - y0) * 4) };
          for (let y = y0; y < y1; y++) crop.data.set(I.data.subarray((y * I.width + x0) * 4, (y * I.width + x1) * 4), (y - y0) * (x1 - x0) * 4);
          const pl = await browserEngines.paddle!(crop, (q) => { if (!stale()) { const w = secondWords(q); prog.set(w.p, w.text.replace('reading the soft photo', 'reading the label again')); } }, stale).catch(() => null);
          if (stale() || !pl?.length) continue;
          const text = pl.slice().sort((a, b) => a.box[0] - b.box[0]).map((x) => x.text).join(' '), score = Math.min(...pl.map((x) => x.score));
          const again = readLabel([text]).nets[0]?.[what];
          if (again && again !== v && secondBetter({ words: [{ text: again, conf: score * 100, x0: 0, y0: 0, x1: 0, y1: 0 }] }, { words: [{ text: v, conf, x0: 0, y0: 0, x1: 0, y1: 0 }] })) {
            for (const o of nets) if (o[what] === v && o.from === 'label') o[what] = again; // the same password under both bands
            again2 = true;
          }
        }
        prog.done();
      }
      const qrn = nets.filter((n) => n.from === 'qr').length;
      status.textContent = nets.length
        ? `${nets.length === 1 ? 'One network' : `${nets.length} networks`} found${qrn ? ` — ${qrn === nets.length ? 'from' : 'one from'} the label’s QR code (exact)` : ''}.${reading?.engine === 'paddle' ? ' The photo was soft: PaddleOCR read it.' : again2 ? ' A line the OCR was unsure of was read again by PaddleOCR, the second reader.' : ''}`
        : '';
      show();
      if (got.skipped.length) asideEl.replaceChildren(card('Not the Wi-Fi password', h('p', { class: 'muted small' }, 'The label also prints these — they are for the router itself, not for joining its Wi-Fi:'),
        h('ul', { class: 'wq-skip' }, ...got.skipped.map((x) => h('li', null, h('code', null, x.value), ` — ${x.what}`)))));
      if (lines.length) readEl.replaceChildren(h('details', { class: 'wq-read' }, h('summary', null, 'What was read on the label'), h('pre', { class: 'wq-pre' }, lines.map((l) => l.text.replace(/\t/g, '    ')).join('\n'))));
      result.hidden = false;
    } catch (e) {
      prog.done();
      if (!stale()) toast(errMsg(e), 'err');
    } finally {
      // the photo read (or given up): the count tells a script which reading it sees
      if (!stale()) { root.removeAttribute('aria-busy'); root.dataset.reads = String(++reads); }
    }
  }

  const pick = imageInput((img) => { void run(img); }, { label: 'Choose a photo of the router’s label', instead: 'choose a photo of the label instead', paste: true });
  root.append(stack(
    card(null, pick.el, prog, status,
      h('p', { class: 'muted small' }, 'The label under or behind the router prints its network name (SSID) and password. Photograph it close and straight on; the code is made from what is read, and you can correct it.')),
    result, asideEl, readEl,
    note('Everything happens on this device: the photo and the password never leave it.', 'info')));
  return () => { gone = true; seq++; pick.dispose(); };
};
