// QR / barcode generation and scanning with zxing-cpp (+ zint writer), C++ compiled to WebAssembly.
import { prepareZXingModule, writeBarcode, readBarcodes } from 'zxing-wasm/full';
import zxingWasm from 'zxing-wasm/full/zxing_full.wasm?url';
import { h, card, field, input, textarea, button, segmented, select, toggle, slider, filePicker, clear, stack, note, copy, downloadBlob, canvasToBlob, outputBox, type Mount } from '../ui';
import * as Q from '../lib/qrdata';
import { checkBarcode, zintError } from '../lib/barcodes';

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
  return zintError(e);
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
  const held = outputBox({ rows: 3, mono: true, label: 'What the code holds' });
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
  const full = h('div', { class: 'muted small mono' });
  const regen = () => {
    const c = checkBarcode(fmt, val.value);
    full.textContent = c.full ? `Encoded with its check digit: ${c.full}` : '';
    return r.run(c.error ? '' : c.value, { errors: c.error ? [c.error] : [], warnings: c.notes });
  };
  r.setRegen(regen);
  val.addEventListener('input', regen);
  const sample = (f: string) => FORMATS.find((x) => x[0] === f)![2];
  root.append(card(null, stack(field('Format', select(FORMATS.map(([k, l]) => [k, l]), fmt, (v) => {
    // the sample of the format before is replaced by the new one; a value someone typed stays (to try it in another format)
    if (!val.value.trim() || val.value.trim() === sample(fmt)) val.value = sample(v);
    fmt = v; regen();
  })), field('Value', stack(val, full), 'EAN/UPC check digits are added automatically when omitted.'), toggle('Show human-readable text', true, (v) => { hrt = v; regen(); }))),
    card(null, r.preview, r.status, r.controls), r.actionsEl);
  regen();
};

// ------------------------------------------------------------------ Scanner
const FORMAT_NAMES: Record<string, string> = {
  QRCode: 'QR code', MicroQRCode: 'Micro QR code', rMQRCode: 'rMQR code', DataMatrix: 'Data Matrix', Aztec: 'Aztec', PDF417: 'PDF417', MaxiCode: 'MaxiCode',
  EAN13: 'EAN-13', EAN8: 'EAN-8', UPCA: 'UPC-A', UPCE: 'UPC-E', Code128: 'Code 128', Code39: 'Code 39', Code93: 'Code 93', ITF: 'ITF', Codabar: 'Codabar',
  DataBar: 'GS1 DataBar', DataBarExpanded: 'GS1 DataBar Expanded', DataBarLimited: 'GS1 DataBar Limited', DXFilmEdge: 'DX film edge',
};
/** The browser's camera errors, said for a person. */
function cameraError(e: unknown): Error {
  const n = (e as { name?: string })?.name ?? '';
  if (n === 'NotAllowedError' || n === 'SecurityError') return new Error('The camera was not allowed — allow it in the browser\'s site settings (the camera icon in the address bar), or scan a photo instead.');
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return new Error('No camera was found — scan a photo or a screenshot instead.');
  if (n === 'NotReadableError' || n === 'AbortError') return new Error('The camera is busy (another app or tab is using it). Close that, then try again.');
  return e instanceof Error ? e : new Error(String(e));
}
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
      const d = Q.describeCode(r.text);
      const fmtName = FORMAT_NAMES[r.format] ?? r.format;
      const rows = d.fields.map((f) => h('tr', null, h('th', null, f.label), h('td', { class: f.secret ? 'mono' : '' }, f.value),
        h('td', null, f.secret || d.kind === 'wifi' ? button('', () => copy(f.value), { icon: 'Copy', small: true, variant: 'ghost', title: `Copy ${f.label.toLowerCase()}` }) : null)));
      const open = d.open ? h('a', { class: 'btn btn-sm', href: d.open.href, ...(/^https?:/i.test(d.open.href) ? { target: '_blank' } : {}), rel: 'noopener noreferrer' }, d.open.label) : null;
      const save = d.save ? button(d.save.label, () => downloadBlob(new Blob([d.save!.text], { type: d.save!.type }), d.save!.name), { small: true, icon: 'Download' }) : null;
      results.prepend(card(d.kind === 'text' ? fmtName : `${fmtName} · ${d.title}`,
        rows.length ? h('table', { class: 'tbl scan-fields' }, h('tbody', null, rows)) : null,
        h('div', { class: 'scan-text' }, r.text),
        h('div', { class: 'row' }, button('Copy', () => copy(r.text), { small: true, icon: 'Copy' }), open, save)));
    }
  };
  const readFile = async (f: Blob) => {
    await zx();
    const r = await readBarcodes(f, { tryHarder: true, maxNumberOfSymbols: 8 });
    if (!r.length) results.prepend(note('No code found in that image.', 'warn'));
    show(r);
  };
  const loop = async () => {
    if (!stream || busy || video.readyState < 2 || !video.videoWidth) return;
    busy = true;
    try {
      const c = new OffscreenCanvas(video.videoWidth, video.videoHeight), g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(video, 0, 0);
      show(await readBarcodes(g.getImageData(0, 0, c.width, c.height), { tryHarder: true, maxNumberOfSymbols: 4 }));
    } catch (e) { console.warn('frame not read', e); } // one frame that cannot be read is no reason to stop (or to raise an error)
    finally { busy = false; }
  };
  const stop = () => { clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); stream = null; video.srcObject = null; };
  const start = async () => {
    stop(); // a second Start used to open a second stream and leave the first one running
    await zx();
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } }); }
    catch (e) { throw cameraError(e); }
    video.srcObject = stream;
    for (const t of stream.getVideoTracks()) t.addEventListener('ended', stop);
    timer = window.setInterval(loop, 250);
  };
  // a screenshot or photo pasted with Ctrl+V is scanned too
  const onPaste = (e: ClipboardEvent) => {
    const f = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile();
    if (f) { e.preventDefault(); readFile(f).catch((err) => results.prepend(note(`That image could not be read (${err instanceof Error ? err.message : String(err)}).`, 'err'))); }
  };
  document.addEventListener('paste', onPaste);
  root.append(card(null, h('div', { class: 'scan-wrap' }, video, h('div', { class: 'scan-frame' }))),
    card('Or scan an image', filePicker({ accept: 'image/*', compact: true, label: 'Choose a photo or screenshot', hint: ctx.isMobile ? undefined : 'or paste one with Ctrl+V', onFiles: ([f]) => readFile(f) })),
    results, h('div', { class: 'actions' }, button('Start camera', start, { variant: 'primary', icon: 'ScanQrCode' }), button('Stop', stop, { icon: 'Square' }),
      button('Clear', () => { clear(results); seen.clear(); }, { icon: 'Trash2' })),
    note(`Reads QR, Data Matrix, Aztec, PDF417, EAN/UPC, Code 128/39/93, ITF, Codabar and more. Wi-Fi, UPI, contact and calendar codes are shown field by field.${ctx.isMobile ? ' Uses the back camera.' : ''}`));
  return () => { stop(); document.removeEventListener('paste', onPaste); };
};
