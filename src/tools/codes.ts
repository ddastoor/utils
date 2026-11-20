// QR / barcode generation and scanning with zxing-cpp (+ zint writer), C++ compiled to WebAssembly.
import { prepareZXingModule, writeBarcode, readBarcodes } from 'zxing-wasm/full';
import zxingWasm from 'zxing-wasm/full/zxing_full.wasm?url';
import { h, card, field, input, textarea, button, segmented, select, toggle, slider, filePicker, clear, stack, note, copy, downloadBlob, canvasToBlob, outputBox, type Mount } from '../ui';
import * as Q from '../lib/qrdata';

let ready: Promise<unknown> | null = null;
const zx = () => (ready ||= Promise.resolve(prepareZXingModule({ overrides: { locateFile: (p: string, prefix: string) => (p.endsWith('.wasm') ? zxingWasm : prefix + p) }, fireImmediately: true })));

function recolor(svg: string, fg: string, bg: string) {
  return svg.replace(/fill="#000000"/gi, `fill="${fg}"`).replace(/fill="#FFFFFF"/gi, `fill="${bg}"`).replace(/<\?xml[^>]*>\s*<!DOCTYPE[^>]*>/, '');
}
async function svgToPng(svg: string, size: number, bg: string): Promise<Blob> {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const scale = size / Math.max(img.width, img.height);
  const c = h('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  const g = c.getContext('2d')!; g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, c.width, c.height);
  return canvasToBlob(c, 'image/png');
}

function renderer(format: () => string, extra: () => Record<string, unknown> = () => ({})) {
  const preview = h('div', { class: 'code-preview' });
  const status = h('div', { class: 'stack' });
  const colourNote = h('div');
  let svg = '', fg = '#000000', bg = '#ffffff', size = 1024, seq = 0;
  /** Draws `text`; `notes` (errors / warnings of the form) are shown above. The newest call wins (zxing is async). */
  const run = async (text: string, notes: { errors?: string[]; warnings?: string[] } = {}) => {
    const me = ++seq;
    await zx();
    if (me !== seq) return;
    clear(status).append(...(notes.errors ?? []).map((e) => note(e, 'err')), ...(notes.warnings ?? []).map((w) => note(w, 'warn')));
    if (!text) { clear(preview); svg = ''; return; }
    const r = await writeBarcode(text, { format: format() as any, ...extra() });
    if (me !== seq) return;
    if (r.error) { clear(preview); svg = ''; status.append(note(codeError(r.error, format()), 'warn')); return; }
    svg = recolor(r.svg, fg, bg);
    preview.innerHTML = svg; // zint's own SVG output (our generated markup, not user HTML)
  };
  const colours = () => { clear(colourNote); const w = Q.colourWarning(fg, bg); if (w) colourNote.append(note(w, 'warn')); };
  const controls = stack(
    h('div', { class: 'row' }, field('Colour', h('input', { type: 'color', value: fg, class: 'color-picker sm', 'aria-label': 'Colour', oninput: (e: any) => { fg = e.target.value; colours(); regen(); } })),
      field('Background', h('input', { type: 'color', value: bg, class: 'color-picker sm', 'aria-label': 'Background', oninput: (e: any) => { bg = e.target.value; colours(); regen(); } }))),
    colourNote,
    slider({ label: 'PNG size', min: 256, max: 4096, step: 64, value: size, unit: ' px', onInput: (v) => (size = v) }));
  let regen = () => {};
  const name = () => (format() === 'QRCode' ? 'qr-code' : format().toLowerCase());
  const actionsEl = h('div', { class: 'actions' },
    button('PNG', async () => { if (!svg) throw new Error('Nothing to save yet.'); downloadBlob(await svgToPng(svg, size, bg), `${name()}.png`); }, { variant: 'primary', icon: 'Download' }),
    button('SVG', () => { if (!svg) throw new Error('Nothing to save yet.'); downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${name()}.svg`); }, { icon: 'Download' }));
  return { preview, status, controls, actionsEl, run, setRegen: (f: () => void) => (regen = f) };
}

/** zint's error text, said for a person. */
function codeError(e: string, format: string): string {
  if (/too long|too much|exceeds|capacity/i.test(e)) return format === 'QRCode'
    ? 'Too much for one QR code (at most about 2,900 bytes, fewer with more error correction) — shorten the text or choose Low error correction.'
    : `Too long for ${format} — shorten the value.`;
  return e;
}

// ------------------------------------------------------------------ QR generator
export const qr: Mount = (root) => {
  let kind = 'url', ec = 'M';
  const r = renderer(() => 'QRCode', () => ({ ecLevel: ec, scale: 8 }));
  const form = h('div', { class: 'stack' });
  const vals: Record<string, any> = {};
  const inputs: Record<string, Array<[string, string, string?]>> = {
    url: [['text', 'Link or text', 'https://']],
    wifi: [['ssid', 'Network name (SSID)'], ['pass', 'Password'], ['sec', 'Security']],
    upi: [['vpa', 'UPI ID (e.g. name@okbank)'], ['name', 'Payee name'], ['amount', 'Amount ₹ (optional)'], ['note', 'Note (optional)']],
    vcard: [['first', 'First name'], ['last', 'Last name'], ['phone', 'Phone'], ['email', 'Email'], ['org', 'Company'], ['url', 'Website']],
    email: [['to', 'To'], ['subject', 'Subject'], ['body', 'Message']],
    sms: [['phone', 'Phone number'], ['msg', 'Message']],
    tel: [['phone', 'Phone number']],
    event: [['title', 'Event title'], ['start', 'Starts'], ['end', 'Ends'], ['place', 'Location']],
  };
  const build = (): Q.Checked => {
    const v = vals, str = (k: string) => String(v[k] ?? '');
    switch (kind) {
      case 'url': return { text: str('text'), errors: [], warnings: [] };
      case 'wifi': return Q.wifi({ ssid: str('ssid'), pass: str('pass'), sec: v.sec || 'WPA', hidden: !!v.hidden });
      case 'upi': return Q.upi({ vpa: str('vpa'), name: str('name'), amount: str('amount'), note: str('note') });
      case 'vcard': return Q.vcard({ first: str('first'), last: str('last'), phone: str('phone'), email: str('email'), org: str('org'), url: str('url') });
      case 'email': return Q.email({ to: str('to'), subject: str('subject'), body: str('body') });
      case 'sms': return Q.sms({ phone: str('phone'), msg: str('msg') });
      case 'tel': return Q.tel({ phone: str('phone') });
      case 'event': return Q.event({ title: str('title'), start: str('start'), end: str('end'), place: str('place') });
    }
    return { text: '', errors: [], warnings: [] };
  };
  const held = outputBox({ rows: 3, mono: true });
  const heldBox = h('details', { class: 'qr-held' }, h('summary', null, 'What the code holds'), held);
  const regen = () => { const b = build(); held.value = b.text; heldBox.hidden = !b.text; return r.run(b.text, b); };
  r.setRegen(regen);
  const renderForm = () => {
    for (const k of Object.keys(vals)) delete vals[k];
    if (kind === 'url') vals.text = 'https://ddastoor.github.io/utils/';
    if (kind === 'wifi') vals.sec = 'WPA';
    clear(form).append(...inputs[kind].map(([key, label, ph]) => {
      if (key === 'amount') { const el = input({ value: '', placeholder: '₹ 49.50', attrs: { inputmode: 'decimal', 'aria-label': label } }); el.addEventListener('input', () => { vals.amount = el.value; regen(); }); return field(label, el); }
      if (key === 'sec') return field(label, segmented([['WPA', 'WPA/WPA2/WPA3'], ['WEP', 'WEP'], ['none', 'Open']], 'WPA', (v) => { vals.sec = v; regen(); }));
      const el = key === 'body' || key === 'msg' || (kind === 'url' && key === 'text') ? textarea({ rows: 3, value: vals[key] || '', placeholder: ph }) : input({ value: vals[key] || '', placeholder: ph, type: key === 'start' || key === 'end' ? 'datetime-local' :  key === 'email' || key === 'to' ? 'email' : key === 'phone' ? 'tel' : 'text' });
      el.addEventListener('input', () => { vals[key] = (el as HTMLInputElement).value; regen(); });
      return field(label, el);
    }), kind === 'wifi' ? toggle('Hidden network', false, (v) => { vals.hidden = v; regen(); }) : '');
    regen();
  };
  root.append(card(null, stack(field('Type', select([['url', 'Text / link'], ['wifi', 'Wi-Fi login'], ['upi', 'UPI payment'], ['vcard', 'Contact card'], ['email', 'Email'], ['sms', 'SMS'], ['tel', 'Phone call'], ['event', 'Calendar event']], kind, (v) => { kind = v; renderForm(); })), form)),
    card(null, r.preview, r.status, heldBox, stack(field('Error correction', segmented([['L', 'Low 7%'], ['M', 'Medium 15%'], ['Q', 'Quartile 25%'], ['H', 'High 30%']], ec, (v) => { ec = v; regen(); })), r.controls)), r.actionsEl);
  renderForm();
};

// ------------------------------------------------------------------ Barcode generator
const FORMATS: Array<[string, string, string]> = [
  ['EAN13', 'EAN-13 (retail, India 890…)', '890123456789'], ['EAN8', 'EAN-8', '9031101'], ['UPCA', 'UPC-A', '03600029145'], ['UPCE', 'UPC-E', '0425261'],
  ['Code128', 'Code 128', 'SUPERTOOLS-2026'], ['Code39', 'Code 39', 'ABC-1234'], ['Code93', 'Code 93', 'CODE93'], ['ITF', 'ITF (Interleaved 2 of 5)', '12345678'],
  ['Codabar', 'Codabar', 'A12345B'], ['DataMatrix', 'Data Matrix', 'Hello DataMatrix'], ['PDF417', 'PDF417', 'PDF417 example'], ['Aztec', 'Aztec', 'Aztec example'],
];
export const barcode: Mount = (root) => {
  let fmt = 'EAN13', hrt = true;
  const r = renderer(() => fmt, () => ({ withHRT: hrt, scale: 4 }));
  const val = input({ value: FORMATS[0][2], attrs: { class: 'input mono', spellcheck: 'false' } });
  const regen = () => r.run(val.value.trim());
  r.setRegen(regen);
  val.addEventListener('input', regen);
  root.append(card(null, stack(field('Format', select(FORMATS.map(([k, l]) => [k, l]), fmt, (v) => { fmt = v; val.value = FORMATS.find((f) => f[0] === v)![2]; regen(); })), field('Value', val, 'EAN/UPC check digits are added automatically when omitted.'), toggle('Show human-readable text', true, (v) => { hrt = v; regen(); }))),
    card(null, r.preview, r.status, r.controls), r.actionsEl);
  regen();
};

// ------------------------------------------------------------------ Scanner
export const scan: Mount = (root, ctx) => {
  let stream: MediaStream | null = null, timer = 0, busy = false;
  const video = h('video', { class: 'scan-video', playsinline: true, muted: true, autoplay: true });
  const results = h('div', { class: 'stack' });
  const seen = new Set<string>();
  const show = (list: Array<{ format: string; text: string }>) => {
    for (const r of list) {
      const key = `${r.format}:${r.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      navigator.vibrate?.(60);
      const isUrl = /^https?:\/\//i.test(r.text);
      results.prepend(card(r.format, h('div', { class: 'scan-text' }, r.text), h('div', { class: 'row' }, button('Copy', () => copy(r.text), { small: true, icon: 'Copy' }),
        isUrl ? h('a', { class: 'btn btn-sm', href: r.text, target: '_blank', rel: 'noopener noreferrer' }, 'Open link') : null)));
    }
  };
  const loop = async () => {
    if (!stream || busy || video.readyState < 2) return;
    busy = true;
    try {
      const c = new OffscreenCanvas(video.videoWidth, video.videoHeight), g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(video, 0, 0);
      show(await readBarcodes(g.getImageData(0, 0, c.width, c.height), { tryHarder: true, maxNumberOfSymbols: 4 }));
    } finally { busy = false; }
  };
  const start = async () => {
    await zx();
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    video.srcObject = stream;
    clearInterval(timer); timer = window.setInterval(loop, 250);
  };
  const stop = () => { clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); stream = null; video.srcObject = null; };
  root.append(card(null, h('div', { class: 'scan-wrap' }, video, h('div', { class: 'scan-frame' }))),
    card('Or scan an image', filePicker({ accept: 'image/*', compact: true, label: 'Choose a photo or screenshot', onFiles: async ([f]) => { await zx(); const r = await readBarcodes(f, { tryHarder: true, maxNumberOfSymbols: 8 }); if (!r.length) results.prepend(note('No code found in that image.', 'warn')); show(r); } })),
    results, h('div', { class: 'actions' }, button('Start camera', start, { variant: 'primary', icon: 'ScanQrCode' }), button('Stop', stop, { icon: 'Square' })),
    note(`Reads QR, Data Matrix, Aztec, PDF417, EAN/UPC, Code 128/39/93, ITF, Codabar and more.${ctx.isMobile ? ' Uses the back camera.' : ''}`));
  return stop;
};
