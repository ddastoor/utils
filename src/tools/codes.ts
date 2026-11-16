// QR / barcode generation and scanning with zxing-cpp (+ zint writer), C++ compiled to WebAssembly.
import { prepareZXingModule, writeBarcode, readBarcodes } from 'zxing-wasm/full';
import zxingWasm from 'zxing-wasm/full/zxing_full.wasm?url';
import { h, card, field, input, textarea, button, segmented, select, toggle, slider, filePicker, clear, stack, note, copy, downloadBlob, canvasToBlob, type Mount } from '../ui';

let ready: Promise<unknown> | null = null;
const zx = () => (ready ||= Promise.resolve(prepareZXingModule({ overrides: { locateFile: (p: string, prefix: string) => (p.endsWith('.wasm') ? zxingWasm : prefix + p) }, fireImmediately: true })));

// ------------------------------------------------------------------ payload builders (exported for tests)
const esc = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');
export const payload = {
  wifi: (o: { ssid: string; pass: string; sec: string; hidden: boolean }) => `WIFI:T:${o.sec === 'none' ? 'nopass' : o.sec};S:${esc(o.ssid)};${o.sec === 'none' ? '' : `P:${esc(o.pass)};`}${o.hidden ? 'H:true;' : ''};`,
  upi: (o: { vpa: string; name: string; amount: string; note: string }) => {
    const p = new URLSearchParams({ pa: o.vpa.trim(), pn: o.name.trim() });
    if (o.amount) { p.set('am', (+o.amount).toFixed(2)); p.set('cu', 'INR'); }
    if (o.note) p.set('tn', o.note);
    return `upi://pay?${p.toString().replace(/\+/g, '%20')}`;
  },
  // vCard 3.0 text values escape \ ; , and new lines (RFC 2426 §4), so "Tata Sons; Mumbai" stays one field
  vcard: (o: { first: string; last: string; phone: string; email: string; org: string; url: string }) => {
    const v = (s: string) => s.replace(/([\\;,])/g, '\\$1').replace(/\r?\n/g, '\\n');
    return ['BEGIN:VCARD', 'VERSION:3.0', `N:${v(o.last)};${v(o.first)};;;`, `FN:${v(`${o.first} ${o.last}`.trim())}`, o.org && `ORG:${v(o.org)}`, o.phone && `TEL;TYPE=CELL:${o.phone}`, o.email && `EMAIL:${o.email}`, o.url && `URL:${o.url}`, 'END:VCARD'].filter(Boolean).join('\n');
  },
  email: (o: { to: string; subject: string; body: string }) => `mailto:${o.to}${o.subject || o.body ? '?' + new URLSearchParams({ ...(o.subject ? { subject: o.subject } : {}), ...(o.body ? { body: o.body } : {}) }).toString().replace(/\+/g, '%20') : ''}`,
  sms: (o: { phone: string; msg: string }) => `SMSTO:${o.phone}:${o.msg}`,
  tel: (o: { phone: string }) => `tel:${o.phone.replace(/\s+/g, '')}`,
  event: (o: { title: string; start: string; end: string; place: string }) => {
    const d = (s: string) => (s ? new Date(s).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') : '');
    return ['BEGIN:VEVENT', `SUMMARY:${o.title}`, o.start && `DTSTART:${d(o.start)}`, o.end && `DTEND:${d(o.end)}`, o.place && `LOCATION:${o.place}`, 'END:VEVENT'].filter(Boolean).join('\n');
  },
};

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
  const status = h('div');
  let svg = '', fg = '#000000', bg = '#ffffff', size = 1024;
  const run = async (text: string) => {
    await zx();
    clear(status);
    if (!text) { clear(preview); svg = ''; return; }
    const r = await writeBarcode(text, { format: format() as any, ...extra() });
    if (r.error) { clear(preview); svg = ''; status.append(note(r.error, 'warn')); return; }
    svg = recolor(r.svg, fg, bg);
    preview.innerHTML = svg; // zint's own SVG output (our generated markup, not user HTML)
  };
  const controls = stack(
    h('div', { class: 'row' }, field('Colour', h('input', { type: 'color', value: fg, class: 'color-picker sm', oninput: (e: any) => { fg = e.target.value; regen(); } })),
      field('Background', h('input', { type: 'color', value: bg, class: 'color-picker sm', oninput: (e: any) => { bg = e.target.value; regen(); } }))),
    slider({ label: 'PNG size', min: 256, max: 4096, step: 64, value: size, unit: ' px', onInput: (v) => (size = v) }));
  let regen = () => {};
  const actionsEl = h('div', { class: 'actions' },
    button('PNG', async () => { if (!svg) throw new Error('Nothing to save yet.'); downloadBlob(await svgToPng(svg, size, bg), `${format().toLowerCase()}.png`); }, { variant: 'primary', icon: 'Download' }),
    button('SVG', () => { if (!svg) throw new Error('Nothing to save yet.'); downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${format().toLowerCase()}.svg`); }, { icon: 'Download' }));
  return { preview, status, controls, actionsEl, run, setRegen: (f: () => void) => (regen = f) };
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
  const build = () => {
    const v = vals;
    switch (kind) {
      case 'url': return v.text || '';
      case 'wifi': return v.ssid ? payload.wifi({ ssid: v.ssid, pass: v.pass || '', sec: v.sec || 'WPA', hidden: !!v.hidden }) : '';
      case 'upi': return v.vpa ? payload.upi({ vpa: v.vpa, name: v.name || '', amount: v.amount || '', note: v.note || '' }) : '';
      case 'vcard': return v.first || v.last ? payload.vcard({ first: v.first || '', last: v.last || '', phone: v.phone || '', email: v.email || '', org: v.org || '', url: v.url || '' }) : '';
      case 'email': return v.to ? payload.email({ to: v.to, subject: v.subject || '', body: v.body || '' }) : '';
      case 'sms': return v.phone ? payload.sms({ phone: v.phone, msg: v.msg || '' }) : '';
      case 'tel': return v.phone ? payload.tel({ phone: v.phone }) : '';
      case 'event': return v.title ? payload.event({ title: v.title, start: v.start || '', end: v.end || '', place: v.place || '' }) : '';
    }
    return '';
  };
  const regen = () => r.run(build());
  r.setRegen(regen);
  const renderForm = () => {
    for (const k of Object.keys(vals)) delete vals[k];
    if (kind === 'url') vals.text = 'https://ddastoor.github.io/utils/';
    if (kind === 'wifi') vals.sec = 'WPA';
    clear(form).append(...inputs[kind].map(([key, label, ph]) => {
      if (key === 'sec') return field(label, segmented([['WPA', 'WPA/WPA2/WPA3'], ['WEP', 'WEP'], ['none', 'Open']], 'WPA', (v) => { vals.sec = v; regen(); }));
      const el = key === 'body' || key === 'msg' || (kind === 'url' && key === 'text') ? textarea({ rows: 3, value: vals[key] || '', placeholder: ph }) : input({ value: vals[key] || '', placeholder: ph, type: key === 'start' || key === 'end' ? 'datetime-local' : key === 'amount' ? 'number' : key === 'email' || key === 'to' ? 'email' : key === 'phone' ? 'tel' : 'text' });
      el.addEventListener('input', () => { vals[key] = (el as HTMLInputElement).value; regen(); });
      return field(label, el);
    }), kind === 'wifi' ? toggle('Hidden network', false, (v) => { vals.hidden = v; regen(); }) : '');
    regen();
  };
  root.append(card(null, stack(field('Type', select([['url', 'Text / link'], ['wifi', 'Wi-Fi login'], ['upi', 'UPI payment'], ['vcard', 'Contact card'], ['email', 'Email'], ['sms', 'SMS'], ['tel', 'Phone call'], ['event', 'Calendar event']], kind, (v) => { kind = v; renderForm(); })), form)),
    card(null, r.preview, r.status, stack(field('Error correction', segmented([['L', 'Low 7%'], ['M', 'Medium 15%'], ['Q', 'Quartile 25%'], ['H', 'High 30%']], ec, (v) => { ec = v; regen(); })), r.controls)), r.actionsEl);
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
