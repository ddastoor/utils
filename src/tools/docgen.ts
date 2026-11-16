// Document generators: GST Invoice, Rent Receipt, Resume Builder. Each fills an HTML template that MuPDF lays out
// into a real PDF (src/lib/htmlpdf.ts); the preview shows that same PDF. Money maths (integer paise) and GSTIN checks
// run in mathcore.wasm; amounts in words (lakh/crore) too. Details can be saved to / loaded from a JSON file you keep —
// nothing is stored in the browser.
import { h, card, field, stack, note, actions, button, segmented, toggle, input, select, textarea, filePicker, pickFiles, clear, toast, errMsg, downloadBlob, shareOrDownload, type Mount } from '../ui';
import { htmlToPdf, pdfPreview, esc } from '../lib/htmlpdf';
import { mathcore } from '../wasm/mathcore';
import { loadImg, encodeImg, previewOf } from '../lib/imgio';

// ------------------------------------------------------------------ shared
type Obj = Record<string, any>;
const money = (n: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
async function inWords(amount: number) {
  const mc = await mathcore(), r = Math.floor(Math.round(amount * 100) / 100), p = Math.round((amount - r) * 100);
  return `Rupees ${cap(mc.words(BigInt(r), true))}${p ? ` and ${cap(mc.words(BigInt(p), true))} Paise` : ''} Only`;
}
const fmtDate = (iso: string) => { if (!iso) return ''; const [y, mo, d] = iso.split('-'); return `${d}/${mo}/${y}`; };
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ACCENTS: Array<[string, string]> = [['#1f3a8a', 'Navy'], ['#0f766e', 'Teal'], ['#7c2d12', 'Brown'], ['#111827', 'Black'], ['#6d28d9', 'Violet']];

/** Text / number / date input bound to obj[key]. */
function bound(obj: Obj, key: string, label: string, o: { type?: string; placeholder?: string; area?: boolean; hint?: string; change: () => void }) {
  const el = (o.area ? textarea({ value: obj[key] ?? '', rows: 3, placeholder: o.placeholder, onInput: (v: string) => { obj[key] = v; o.change(); } })
    : input({ type: o.type || 'text', value: obj[key] ?? '', placeholder: o.placeholder, onInput: (v: string) => { obj[key] = o.type === 'number' ? (v === '' ? '' : +v) : v; o.change(); } })) as HTMLInputElement;
  return field(label, el, o.hint);
}

/** Rows of fields (items, jobs, schools…) with add / remove / move. */
function repeater(rows: Obj[], make: () => Obj, renderRow: (row: Obj, i: number) => HTMLElement[], change: () => void, addLabel: string) {
  const list = h('div', { class: 'dg-rows' });
  const draw = () => {
    clear(list).append(...rows.map((r, i) => h('div', { class: 'dg-row' },
      h('div', { class: 'dg-row-fields' }, ...renderRow(r, i)),
      h('div', { class: 'dg-row-tools' },
        button('', () => { rows.splice(i - 1, 0, ...rows.splice(i, 1)); draw(); change(); }, { icon: 'ArrowUp', small: true, variant: 'ghost', title: 'Move up', disabled: i === 0 }),
        button('', () => { rows.splice(i, 1); draw(); change(); }, { icon: 'Trash2', small: true, variant: 'ghost', title: 'Remove' })))));
  };
  draw();
  return { el: h('div', { class: 'stack' }, list, h('div', null, button(addLabel, () => { rows.push(make()); draw(); change(); }, { icon: 'Plus', small: true }))), draw };
}

/** Live PDF preview + download + save/load details. */
function docShell(root: HTMLElement, ctx: { isMobile: boolean }, o: { build: () => Promise<Uint8Array>; fileName: () => string; state: () => Obj; load: (s: Obj) => void; kind: string }) {
  const pages = h('div', { class: 'dg-pages', 'aria-label': 'Preview' });
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  let timer = 0, tok = 0;
  const refresh = () => {
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const my = ++tok; status.textContent = 'Updating preview…';
      try {
        const bytes = await o.build(); if (my !== tok) return;
        const cs = await pdfPreview(bytes, ctx.isMobile ? 360 : 560, 6); if (my !== tok) return;
        clear(pages).append(...cs);
        status.textContent = `${cs.length} page${cs.length > 1 ? 's' : ''} · ${Math.round(bytes.length / 1024)} KB`;
      } catch (e) { if (my === tok) status.textContent = `Cannot make the PDF: ${errMsg(e)}`; }
    }, 450);
  };
  const save = async () => {
    const bytes = await o.build(); // always fresh: the preview may still be waiting for its debounce
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' }), name = o.fileName();
    ctx.isMobile ? await shareOrDownload(blob, name) : downloadBlob(blob, name);
  };
  const saveJson = () => downloadBlob(new Blob([JSON.stringify({ kind: o.kind, version: 1, ...o.state() }, null, 2)], { type: 'application/json' }), `${o.kind}-details.json`);
  const loadJson = async () => {
    const [f] = await pickFiles('application/json,.json'); if (!f) return;
    try { const d = JSON.parse(await f.text()); if (d.kind && d.kind !== o.kind) throw new Error(`This file holds ${d.kind} details.`); o.load(d); toast('Details loaded', 'ok'); } catch (e) { toast(errMsg(e), 'err'); }
  };
  const preview = card('Preview', status, pages);
  root.append(h('div', { class: 'dg-tools row' },
    button('Load details', loadJson, { icon: 'FolderOpen', small: true, variant: 'ghost', title: 'Open a details file you saved earlier' }),
    button('Save details', saveJson, { icon: 'Save', small: true, variant: 'ghost', title: 'Keep these details in a file on your device (nothing is stored in the browser)' })));
  return { refresh, preview, actions: actions(button('Download PDF', save, { icon: 'Download', variant: 'primary' })) };
}

/** Optional picture (logo, signature, photo) → PNG/JPEG bytes for the template. */
function imagePick(label: string, maxSide: number, onImg: (bytes: Uint8Array | null, name: string) => void) {
  const info = h('span', { class: 'muted small' });
  const picker = filePicker({ accept: 'image/*,.heic,.heif', compact: true, label, onFiles: async ([f]) => {
    try { const img = previewOf(await loadImg(f), maxSide); const png = new Uint8Array(await (await encodeImg(img, 'png')).arrayBuffer()); info.textContent = f.name; onImg(png, f.name); } catch (e) { toast(errMsg(e), 'err'); }
  } });
  return stack(picker, h('div', { class: 'row' }, info, button('Remove', () => { info.textContent = ''; onImg(null, ''); }, { small: true, variant: 'ghost' })));
}

// ------------------------------------------------------------------ GST Invoice
/** GST state codes; UTGST applies in the union territories without a legislature. */
export const STATES: Array<[string, string, boolean?]> = [
  ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh', true], ['05', 'Uttarakhand'], ['06', 'Haryana'],
  ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'],
  ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'], ['20', 'Jharkhand'],
  ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'], ['26', 'Dadra and Nagar Haveli and Daman and Diu', true],
  ['27', 'Maharashtra'], ['29', 'Karnataka'], ['30', 'Goa'], ['31', 'Lakshadweep', true], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'],
  ['35', 'Andaman and Nicobar Islands', true], ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh', true], ['97', 'Other Territory'], ['96', 'Outside India (export)'],
];
const stateName = (c: string) => STATES.find((s) => s[0] === c)?.[1] || '';
export const GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];
const DOC_TYPES: Array<[string, string]> = [['tax', 'Tax Invoice'], ['proforma', 'Proforma Invoice'], ['quote', 'Quotation'], ['bos', 'Bill of Supply']];

export const invoice: Mount = (root, ctx) => {
  const s: Obj = {
    type: 'tax', number: 'INV-001', date: todayIso(), due: '', accent: ACCENTS[0][0], roundoff: true, reverse: false,
    seller: { name: 'Your Business Name', address: 'Street, City, PIN', state: '27', gstin: '', phone: '', email: '' },
    buyer: { name: 'Customer Name', address: 'Street, City, PIN', state: '27', gstin: '' },
    pos: '', items: [{ desc: 'Website design', hsn: '998314', qty: 1, unit: 'Nos', rate: 25000, disc: 0, gst: 18 }],
    bank: { name: '', account: '', ifsc: '', upi: '' }, notes: 'Thank you for your business.', terms: 'Payment due within 15 days.',
  };
  let logo: Uint8Array | null = null, sign: Uint8Array | null = null;
  const change = () => shell.refresh();
  const shell = docShell(root, ctx, {
    kind: 'invoice', state: () => s, fileName: () => `${(s.number || 'invoice').replace(/[^\w.-]+/g, '_')}.pdf`,
    load: (d) => { Object.assign(s, d); delete s.kind; delete s.version; rebuildForm(); change(); },
    build: () => buildInvoice(s, logo, sign),
  });
  const form = h('div', { class: 'stack' });
  const rebuildForm = () => {
    clear(form);
    const party = (who: Obj, title: string, withContact: boolean) => {
      const chk = h('span', { class: 'muted small' });
      const checkG = async () => { const g = (who.gstin || '').trim(); if (!g) { chk.textContent = ''; return; } const ok = (await mathcore()).gstinValid(g); chk.textContent = ok ? `✓ valid GSTIN (state ${stateName(g.slice(0, 2)) || g.slice(0, 2)})` : '✗ check the GSTIN — the check character does not match'; chk.className = ok ? 'small ok-text' : 'small err-text'; if (ok && STATES.some((x) => x[0] === g.slice(0, 2))) { who.state = g.slice(0, 2); stSel.value = who.state; } };
      const stSel = select(STATES.map(([c, n]) => [c, `${c} · ${n}`] as [string, string]), who.state, (v) => { who.state = v; change(); }) as HTMLSelectElement;
      const g = input({ value: who.gstin, placeholder: '15 characters, e.g. 27AAPFU0939F1ZV', onInput: (v) => {
        who.gstin = v.toUpperCase();
        if (g.value !== who.gstin) { const p = g.selectionStart; g.value = who.gstin; g.setSelectionRange(p, p); } // show it in capitals as typed
        checkG(); change();
      } }) as HTMLInputElement;
      checkG();
      return card(title, stack(bound(who, 'name', 'Name', { change }), bound(who, 'address', 'Address', { area: true, change }),
        field('GSTIN', g, chk), field('State', stSel),
        ...(withContact ? [h('div', { class: 'grid2' }, bound(who, 'phone', 'Phone', { type: 'tel', change }), bound(who, 'email', 'Email', { type: 'email', change }))] : [])));
    };
    const items = repeater(s.items, () => ({ desc: '', hsn: '', qty: 1, unit: 'Nos', rate: 0, disc: 0, gst: 18 }), (r) => [
      bound(r, 'desc', 'Description', { change }), bound(r, 'hsn', 'HSN / SAC', { change }), bound(r, 'qty', 'Qty', { type: 'number', change }),
      bound(r, 'unit', 'Unit', { change }), bound(r, 'rate', 'Rate (₹)', { type: 'number', change }), bound(r, 'disc', 'Disc. %', { type: 'number', change }),
      field('GST %', select(GST_RATES.map((g) => [String(g), `${g} %`] as [string, string]), String(r.gst), (v) => { r.gst = +v; change(); })),
    ], change, 'Add item');
    form.append(
      card('Invoice', stack(field('Document', segmented(DOC_TYPES, s.type, (v) => { s.type = v; change(); })),
        h('div', { class: 'grid2' }, bound(s, 'number', 'Number', { change }), bound(s, 'date', 'Date', { type: 'date', change })),
        h('div', { class: 'grid2' }, bound(s, 'due', 'Due date (optional)', { type: 'date', change }),
          field('Place of supply', select([['', 'Same as customer state'], ...STATES.map(([c, n]) => [c, `${c} · ${n}`] as [string, string])], s.pos, (v) => { s.pos = v; change(); }))),
        toggle('Tax payable on reverse charge', s.reverse, (v) => { s.reverse = v; change(); }))),
      party(s.seller, 'From (your business)', true), imagePick('Logo (optional)', 600, (b) => { logo = b; change(); }),
      party(s.buyer, 'Bill to (customer)', false),
      card('Items', items.el, toggle('Round the total to the nearest rupee', s.roundoff, (v) => { s.roundoff = v; change(); })),
      card('Payment', stack(h('div', { class: 'grid2' }, bound(s.bank, 'name', 'Bank', { change }), bound(s.bank, 'account', 'Account number', { change })),
        h('div', { class: 'grid2' }, bound(s.bank, 'ifsc', 'IFSC', { change }), bound(s.bank, 'upi', 'UPI ID (adds a pay-by-UPI QR code)', { placeholder: 'name@bank', change })))),
      card('Notes', stack(bound(s, 'notes', 'Notes', { area: true, change }), bound(s, 'terms', 'Terms', { area: true, change }),
        field('Colour', segmented(ACCENTS, s.accent, (v) => { s.accent = v; change(); })), imagePick('Signature image (optional)', 500, (b) => { sign = b; change(); }))),
      note('Check GST rates and HSN/SAC codes for your goods or services; this tool does the arithmetic, not tax advice.'));
  };
  rebuildForm();
  root.append(h('div', { class: 'dg-layout' }, form, shell.preview), shell.actions);
  change();
};

export async function invoiceTotals(s: Obj) {
  const mc = await mathcore(), pos = s.pos || s.buyer.state, intra = s.type !== 'bos' && pos === s.seller.state && pos !== '96';
  const lines = s.items.map((r: Obj) => [+r.qty || 0, +r.rate || 0, +r.disc || 0, s.type === 'bos' ? 0 : +r.gst || 0] as [number, number, number, number]);
  return { ...mc.invoice(lines, intra, !!s.roundoff), intra, pos, ut: !!STATES.find((x) => x[0] === pos)?.[2] };
}

async function buildInvoice(s: Obj, logo: Uint8Array | null, sign: Uint8Array | null): Promise<Uint8Array> {
  const t = await invoiceTotals(s), files: Record<string, Uint8Array> = {};
  const title = DOC_TYPES.find((d) => d[0] === s.type)![1], noTax = s.type === 'bos', SG = t.ut ? 'UTGST' : 'SGST';
  if (logo) files['logo.png'] = logo;
  if (sign) files['sign.png'] = sign;
  if (s.bank.upi && t.grand > 0) {
    try {
      const { prepareZXingModule, writeBarcode } = await import('zxing-wasm/full');
      const wasm = (await import('zxing-wasm/full/zxing_full.wasm?url')).default;
      prepareZXingModule({ overrides: { locateFile: (p: string, pre: string) => (p.endsWith('.wasm') ? wasm : pre + p) }, fireImmediately: true });
      const uri = `upi://pay?pa=${encodeURIComponent(s.bank.upi.trim())}&pn=${encodeURIComponent(s.seller.name)}&am=${t.grand.toFixed(2)}&cu=INR&tn=${encodeURIComponent(s.number)}`;
      const r = await writeBarcode(uri, { format: 'QRCode', scale: 6 } as any);
      if (r.image) files['upi.png'] = new Uint8Array(await r.image.arrayBuffer());
    } catch { /* QR is optional */ }
  }
  // per-rate summary
  const byRate = new Map<number, { taxable: number; c: number; s: number; i: number }>();
  s.items.forEach((r: Obj, k: number) => { const L = t.lines[k], g = noTax ? 0 : +r.gst || 0, b = byRate.get(g) || { taxable: 0, c: 0, s: 0, i: 0 }; b.taxable += L.taxable; b.c += L.cgst; b.s += L.sgst; b.i += L.igst; byRate.set(g, b); });
  const taxCols = noTax ? '' : t.intra ? `<th class="r">CGST</th><th class="r">${SG}</th>` : '<th class="r">IGST</th>';
  const rows = s.items.map((r: Obj, k: number) => { const L = t.lines[k]; return `<tr><td>${k + 1}</td><td>${esc(r.desc)}</td><td>${esc(r.hsn)}</td><td class="r">${esc(r.qty)} ${esc(r.unit)}</td><td class="r">${money(+r.rate || 0)}</td><td class="r">${+r.disc ? `${r.disc}%` : ''}</td><td class="r">${money(L.taxable)}</td>${noTax ? '' : `<td class="r">${r.gst}%</td>`}${noTax ? '' : t.intra ? `<td class="r">${money(L.cgst)}</td><td class="r">${money(L.sgst)}</td>` : `<td class="r">${money(L.igst)}</td>`}<td class="r">${money(L.taxable + L.cgst + L.sgst + L.igst)}</td></tr>`; }).join('');
  const party = (p: Obj, label: string) => `<div class="lbl">${label}</div><div class="pname">${esc(p.name)}</div><div>${esc(p.address).replace(/\n/g, '<br/>')}</div>${p.gstin ? `<div>GSTIN: <b>${esc(p.gstin)}</b></div>` : ''}<div>State: ${esc(stateName(p.state))} (${esc(p.state)})</div>${p.phone ? `<div>Phone: ${esc(p.phone)}</div>` : ''}${p.email ? `<div>${esc(p.email)}</div>` : ''}`;
  const summary = noTax ? '' : `<table class="sum"><tr><th>GST rate</th><th class="r">Taxable value</th>${t.intra ? `<th class="r">CGST</th><th class="r">${SG}</th>` : '<th class="r">IGST</th>'}<th class="r">Total tax</th></tr>${[...byRate].map(([g, b]) => `<tr><td>${g}%</td><td class="r">${money(b.taxable)}</td>${t.intra ? `<td class="r">${money(b.c)}</td><td class="r">${money(b.s)}</td>` : `<td class="r">${money(b.i)}</td>`}<td class="r">${money(b.c + b.s + b.i)}</td></tr>`).join('')}</table>`;
  const totals = [['Taxable value', t.taxable], ...(noTax ? [] : t.intra ? [['CGST', t.cgst], [SG, t.sgst]] : [['IGST', t.igst]]), ...(t.roundoff ? [['Round off', t.roundoff]] : [])] as Array<[string, number]>;
  const body = `
<table class="head"><tr><td class="hl">${logo ? '<img class="logo" src="img/logo.png"/>' : ''}${party(s.seller, '')}</td>
<td class="hr"><div class="title">${title.toUpperCase()}</div><div class="m">No. <b>${esc(s.number)}</b></div><div class="m">Date: <b>${fmtDate(s.date)}</b></div>${s.due ? `<div class="m">Due: <b>${fmtDate(s.due)}</b></div>` : ''}<div class="m">Place of supply: <b>${esc(stateName(t.pos))} (${esc(t.pos)})</b></div>${noTax ? '' : `<div class="m">Reverse charge: <b>${s.reverse ? 'Yes' : 'No'}</b></div>`}</td></tr></table>
<div class="bill">${party(s.buyer, 'Bill to')}</div>
<table class="items"><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Disc.</th><th class="r">Taxable</th>${noTax ? '' : '<th class="r">GST</th>'}${taxCols}<th class="r">Amount</th></tr>${rows}</table>
<table class="foot"><tr><td class="fl">${summary}<div class="words"><b>Amount in words:</b> ${esc(await inWords(t.grand))}</div>
${s.bank.name || s.bank.account || s.bank.ifsc || s.bank.upi ? `<div class="bank"><b>Bank details</b><br/>${s.bank.name ? `${esc(s.bank.name)}<br/>` : ''}${s.bank.account ? `A/c ${esc(s.bank.account)}<br/>` : ''}${s.bank.ifsc ? `IFSC ${esc(s.bank.ifsc)}<br/>` : ''}${s.bank.upi ? `UPI ${esc(s.bank.upi)}` : ''}</div>` : ''}
${files['upi.png'] ? '<div class="qr"><img src="img/upi.png"/><div>Scan to pay with UPI</div></div>' : ''}</td>
<td class="fr"><table class="tot">${totals.map(([k, v]) => `<tr><td>${k}</td><td class="r">${money(v)}</td></tr>`).join('')}<tr class="grand"><td>Total (₹)</td><td class="r">${money(t.grand)}</td></tr></table>
<div class="sig">For <b>${esc(s.seller.name)}</b>${sign ? '<br/><img class="signimg" src="img/sign.png"/>' : '<br/><br/><br/>'}<br/>Authorised signatory</div></td></tr></table>
${s.notes ? `<p class="notes"><b>Notes:</b> ${esc(s.notes).replace(/\n/g, '<br/>')}</p>` : ''}${s.terms ? `<p class="notes"><b>Terms:</b> ${esc(s.terms).replace(/\n/g, '<br/>')}</p>` : ''}
${s.type === 'bos' ? '<p class="small">Bill of supply: no GST is charged (composition taxpayer / exempt supply).</p>' : ''}<p class="small">This is a computer-generated ${title.toLowerCase()}.</p>`;
  const a = s.accent;
  const css = `body { font-size: 8.6pt; color: #1f2328; } table { border-collapse: collapse; width: 100%; } td, th { vertical-align: top; }
.head td.hl { width: 56%; } .head td.hr { width: 44%; text-align: right; } .logo { height: 44pt; margin-bottom: 4pt; }
.title { font-size: 17pt; font-weight: bold; color: ${a}; margin-bottom: 5pt; } .m { margin: 1pt 0; }
.pname { font-size: 11pt; font-weight: bold; } .lbl { color: ${a}; font-weight: bold; font-size: 7.5pt; text-transform: uppercase; margin-top: 6pt; }
.bill { margin: 10pt 0 8pt; padding: 6pt 8pt; border-left: 3pt solid ${a}; background: #f5f6f8; }
.items th { background: ${a}; color: #fff; font-weight: bold; padding: 4pt 3pt; text-align: left; } .items th.r, .sum th.r { text-align: right; } .items td { padding: 4pt 3pt; border-bottom: 0.6pt solid #d0d4da; }
.r { text-align: right; } .foot { margin-top: 10pt; } .foot td.fl { width: 58%; padding-right: 12pt; } .foot td.fr { width: 42%; }
.sum th, .sum td { border: 0.6pt solid #d0d4da; padding: 2pt 4pt; font-size: 7.6pt; } .sum th { background: #f0f2f5; text-align: left; }
.words { margin: 8pt 0; } .bank { margin-top: 6pt; } .qr { margin-top: 6pt; } .qr img { width: 72pt; } .qr div { font-size: 7pt; color: #555; }
.tot td { padding: 3pt 4pt; border-bottom: 0.6pt solid #e3e6ea; } .tot tr.grand td { font-size: 11pt; font-weight: bold; color: #fff; background: ${a}; border: 0; }
.sig { margin-top: 18pt; text-align: right; } .signimg { height: 34pt; } .notes { margin: 8pt 0 0; } .small { font-size: 7pt; color: #666; margin-top: 8pt; }`;
  return htmlToPdf(body, css, { size: 'a4', margin: 32, title: `${title} ${s.number}`, pageNumbers: true, files });
}

// ------------------------------------------------------------------ Rent Receipt
const MODES: Array<[string, string]> = [['cash', 'Cash'], ['upi', 'UPI'], ['bank', 'Bank transfer'], ['cheque', 'Cheque']];
export function rentMonths(from: string, to: string): Array<{ start: Date; end: Date }> {
  const out: Array<{ start: Date; end: Date }> = [];
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) return out;
  let [y, mo] = from.split('-').map(Number); const [ty, tm] = to.split('-').map(Number);
  while ((y < ty || (y === ty && mo <= tm)) && out.length < 36) { out.push({ start: new Date(y, mo - 1, 1), end: new Date(y, mo, 0) }); mo++; if (mo > 12) { mo = 1; y++; } }
  return out;
}
export const rent: Mount = (root, ctx) => {
  const now = new Date(), fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const s: Obj = { tenant: 'Tenant Name', landlord: 'Landlord Name', pan: '', address: 'Flat, Building, Street, City, PIN', rent: 25000, from: `${fy}-04`, to: `${fy + 1}-03`, mode: 'upi', dateOn: 'end', start: 1 };
  let sign: Uint8Array | null = null;
  const change = () => shell.refresh();
  const shell = docShell(root, ctx, {
    kind: 'rent', state: () => s, fileName: () => `rent-receipts-${s.from}-to-${s.to}.pdf`,
    load: (d) => { Object.assign(s, d); delete s.kind; delete s.version; build(); change(); },
    build: () => buildRent(s, sign),
  });
  const warn = h('div', { class: 'stack' });
  const checks = () => {
    const months = rentMonths(s.from, s.to).length, yearly = (+s.rent || 0) * Math.min(12, months);
    clear(warn);
    if (yearly > 100000 && !String(s.pan).trim()) warn.append(note('Rent above ₹1,00,000 a year: your employer will ask for the landlord’s PAN.', 'warn'));
    if (s.mode === 'cash' && +s.rent > 5000) warn.append(note('Cash receipts above ₹5,000 need a ₹1 revenue stamp signed across by the landlord — a box for it is printed.', 'info'));
  };
  const form = h('div', { class: 'stack' });
  const build = () => {
    clear(form).append(
      card('Who', stack(bound(s, 'tenant', 'Tenant (you)', { change }), bound(s, 'landlord', 'Landlord', { change }),
        bound(s, 'pan', 'Landlord PAN', { placeholder: 'ABCDE1234F', change: () => { s.pan = String(s.pan).toUpperCase(); change(); checks(); } }),
        bound(s, 'address', 'Rented property address', { area: true, change }))),
      card('Rent', stack(bound(s, 'rent', 'Monthly rent (₹)', { type: 'number', change: () => { change(); checks(); } }),
        h('div', { class: 'grid2' }, bound(s, 'from', 'From month', { type: 'month', change: () => { change(); checks(); } }), bound(s, 'to', 'To month', { type: 'month', change: () => { change(); checks(); } })),
        field('Paid by', segmented(MODES, s.mode, (v) => { s.mode = v; change(); checks(); })),
        field('Receipt date', segmented([['end', 'Last day of the month'], ['start', 'First day']], s.dateOn, (v) => { s.dateOn = v; change(); })),
        bound(s, 'start', 'First receipt number', { type: 'number', change }), warn)),
      card('Landlord’s signature (optional)', imagePick('Signature image', 500, (b) => { sign = b; change(); }), note('Usually the landlord signs the printed receipts. A signature image is added only if you choose one.')));
    checks();
  };
  build();
  root.append(h('div', { class: 'dg-layout' }, form, shell.preview), shell.actions);
  change();
};
async function buildRent(s: Obj, sign: Uint8Array | null): Promise<Uint8Array> {
  const months = rentMonths(s.from, s.to);
  if (!months.length) throw new Error('Choose the from and to months.');
  const words = await inWords(+s.rent || 0), mode = MODES.find((m) => m[0] === s.mode)![1], stamp = s.mode === 'cash' && +s.rent > 5000;
  const d = (x: Date) => `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`;
  const mon = (x: Date) => x.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  const receipts = months.map((m, i) => `<div class="rc">
<table class="t"><tr><td><div class="h">RENT RECEIPT</div><div class="sub">${esc(mon(m.start))}</div></td><td class="r">Receipt No. <b>${(+s.start || 1) + i}</b><br/>Date: <b>${d(s.dateOn === 'start' ? m.start : m.end)}</b></td></tr></table>
<p>Received with thanks from <b>${esc(s.tenant)}</b> a sum of <b>₹ ${money(+s.rent || 0)}</b> (${esc(words)}) by <b>${esc(mode)}</b> towards the rent of the property at <b>${esc(s.address).replace(/\n/g, ', ')}</b> for the period <b>${d(m.start)}</b> to <b>${d(m.end)}</b>.</p>
<table class="t sg"><tr><td>Landlord: <b>${esc(s.landlord)}</b>${s.pan ? `<br/>PAN: <b>${esc(s.pan)}</b>` : ''}</td><td class="r">${stamp ? '<div class="stamp">Revenue<br/>stamp</div>' : ''}${sign ? '<img class="si" src="img/sign.png"/><br/>' : '<br/><br/><br/>'}Signature of landlord</td></tr></table></div>${i % 3 !== 2 && i < months.length - 1 ? '<div class="cut">- - - - - - - - - - - - - - - -  cut here  - - - - - - - - - - - - - - - -</div>' : ''}`);
  const pages = Array.from({ length: Math.ceil(receipts.length / 3) }, (_, k) => receipts.slice(k * 3, k * 3 + 3).join('')); // three per A4 page
  const css = `body { font-size: 10pt; color: #1f2328; } table.t { width: 100%; border-collapse: collapse; } td { vertical-align: top; } .r { text-align: right; }
.rc { border: 1pt solid #9aa3ad; padding: 12pt 14pt; margin: 6pt 0; } .h { font-size: 15pt; font-weight: bold; color: #1f3a8a; letter-spacing: 1pt; } .sub { color: #555; }
p { line-height: 1.7; margin: 12pt 0; } .sg td { padding-top: 8pt; } .si { height: 34pt; } .stamp { display: inline-block; border: 0.8pt dashed #777; width: 42pt; height: 42pt; font-size: 6.5pt; color: #777; text-align: center; padding-top: 12pt; margin-bottom: 4pt; }
.cut { color: #9aa3ad; font-size: 8pt; margin: 10pt 0; text-align: center; }`;
  return htmlToPdf(pages, css, { size: 'a4', margin: 36, title: `Rent receipts ${s.from} to ${s.to}`, files: sign ? { 'sign.png': sign } : {} });
}

// ------------------------------------------------------------------ Resume Builder
export const resume: Mount = (root, ctx) => {
  const s: Obj = {
    template: 'classic', accent: ACCENTS[0][0], size: 'a4',
    name: 'Your Name', title: 'Job title', email: 'you@example.com', phone: '+91 98765 43210', location: 'City, India', links: 'linkedin.com/in/you',
    summary: 'Two or three lines about what you do best and what you are looking for.',
    jobs: [{ role: 'Role', org: 'Company', place: 'City', from: '2022', to: 'Present', points: 'Achievement with a number (cut costs by 20 %)\nAnother result you are proud of' }],
    schools: [{ degree: 'B.Tech, Computer Science', org: 'College', from: '2018', to: '2022', grade: 'CGPA 8.4' }],
    skills: 'Skill one, Skill two, Skill three', projects: [] as Obj[], extras: 'Languages: English, Hindi',
  };
  let photo: Uint8Array | null = null;
  const change = () => shell.refresh();
  const shell = docShell(root, ctx, {
    kind: 'resume', state: () => s, fileName: () => `${String(s.name || 'resume').trim().replace(/\s+/g, '-')}-resume.pdf`,
    load: (d) => { Object.assign(s, d); delete s.kind; delete s.version; build(); change(); },
    build: () => buildResume(s, photo),
  });
  const form = h('div', { class: 'stack' });
  const build = () => {
    const jobs = repeater(s.jobs, () => ({ role: '', org: '', place: '', from: '', to: '', points: '' }), (r) => [
      bound(r, 'role', 'Role', { change }), bound(r, 'org', 'Company', { change }), bound(r, 'place', 'Place', { change }),
      bound(r, 'from', 'From', { change }), bound(r, 'to', 'To', { placeholder: 'Present', change }), bound(r, 'points', 'What you did (one point per line)', { area: true, change })], change, 'Add job');
    const schools = repeater(s.schools, () => ({ degree: '', org: '', from: '', to: '', grade: '' }), (r) => [
      bound(r, 'degree', 'Degree / course', { change }), bound(r, 'org', 'School / college', { change }), bound(r, 'from', 'From', { change }), bound(r, 'to', 'To', { change }), bound(r, 'grade', 'Grade (optional)', { change })], change, 'Add education');
    const projects = repeater(s.projects, () => ({ name: '', link: '', points: '' }), (r) => [
      bound(r, 'name', 'Project', { change }), bound(r, 'link', 'Link (optional)', { change }), bound(r, 'points', 'Description (one point per line)', { area: true, change })], change, 'Add project');
    clear(form).append(
      card('Layout', stack(field('Template', segmented([['classic', 'Classic'], ['modern', 'Modern (two columns)'], ['compact', 'Compact']], s.template, (v) => { s.template = v; change(); })),
        field('Colour', segmented(ACCENTS, s.accent, (v) => { s.accent = v; change(); })), field('Paper', segmented([['a4', 'A4'], ['letter', 'Letter']], s.size, (v) => { s.size = v; change(); })))),
      card('You', stack(h('div', { class: 'grid2' }, bound(s, 'name', 'Full name', { change }), bound(s, 'title', 'Headline', { change })),
        h('div', { class: 'grid2' }, bound(s, 'email', 'Email', { type: 'email', change }), bound(s, 'phone', 'Phone', { type: 'tel', change })),
        h('div', { class: 'grid2' }, bound(s, 'location', 'Location', { change }), bound(s, 'links', 'Links (LinkedIn, GitHub, website)', { change })),
        imagePick('Photo (optional)', 600, (b) => { photo = b; change(); }), bound(s, 'summary', 'Summary', { area: true, change }))),
      card('Experience', jobs.el), card('Education', schools.el), card('Projects (optional)', projects.el),
      card('Skills and more', stack(bound(s, 'skills', 'Skills (comma separated)', { area: true, change }), bound(s, 'extras', 'Other (languages, certificates, awards — one per line)', { area: true, change }))));
  };
  build();
  root.append(h('div', { class: 'dg-layout' }, form, shell.preview), shell.actions);
  change();
};
async function buildResume(s: Obj, photo: Uint8Array | null): Promise<Uint8Array> {
  const a = s.accent, lines = (t: string) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const bullets = (t: string) => { const l = lines(t); return l.length ? `<ul>${l.map((x) => `<li>${esc(x.replace(/^[-•*]\s*/, ''))}</li>`).join('')}</ul>` : ''; };
  const dates = (f: string, t: string) => esc([f, t].filter(Boolean).join(' – '));
  const contact = [s.email, s.phone, s.location, s.links].filter((x) => String(x || '').trim()).map(esc);
  const sec = (title: string, inner: string) => (inner.trim() ? `<div class="sec"><div class="st">${title}</div>${inner}</div>` : '');
  const jobs = s.jobs.filter((j: Obj) => j.role || j.org).map((j: Obj) => `<div class="item"><table class="row"><tr><td><b>${esc(j.role)}</b>${j.org ? ` · ${esc(j.org)}` : ''}${j.place ? `, ${esc(j.place)}` : ''}</td><td class="d">${dates(j.from, j.to)}</td></tr></table>${bullets(j.points)}</div>`).join('');
  const schools = s.schools.filter((e: Obj) => e.degree || e.org).map((e: Obj) => `<div class="item"><table class="row"><tr><td><b>${esc(e.degree)}</b>${e.org ? ` · ${esc(e.org)}` : ''}${e.grade ? ` · ${esc(e.grade)}` : ''}</td><td class="d">${dates(e.from, e.to)}</td></tr></table></div>`).join('');
  const schoolsSide = s.schools.filter((e: Obj) => e.degree || e.org).map((e: Obj) => `<div class="item"><b>${esc(e.degree)}</b>${e.org ? `<br/>${esc(e.org)}` : ''}${e.grade ? `<br/>${esc(e.grade)}` : ''}${e.from || e.to ? `<br/><span class="muted">${dates(e.from, e.to)}</span>` : ''}</div>`).join('');
  const projects = s.projects.filter((p: Obj) => p.name).map((p: Obj) => `<div class="item"><b>${esc(p.name)}</b>${p.link ? ` · <span class="muted">${esc(p.link)}</span>` : ''}${bullets(p.points)}</div>`).join('');
  const skills = String(s.skills || '').split(',').map((x) => x.trim()).filter(Boolean);
  const skillHtml = skills.length ? (s.template === 'modern' ? `<ul class="plain">${skills.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p>${skills.map(esc).join(' · ')}</p>`) : '';
  const extras = lines(s.extras).length ? `<ul class="plain">${lines(s.extras).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  const head = `<div class="name">${esc(s.name)}</div>${s.title ? `<div class="title">${esc(s.title)}</div>` : ''}`;
  const img = photo ? '<img class="photo" src="img/photo.png"/>' : '';
  let body: string;
  if (s.template === 'modern') {
    body = `<table class="cols"><tr><td class="side">${img}${head}<div class="contact">${contact.join('<br/>')}</div>${sec('Skills', skillHtml)}${sec('Education', schoolsSide)}${sec('More', extras)}</td>
<td class="main">${sec('Profile', s.summary ? `<p>${esc(s.summary)}</p>` : '')}${sec('Experience', jobs)}${sec('Projects', projects)}</td></tr></table>`;
  } else {
    body = `<table class="top"><tr><td>${head}<div class="contact">${contact.join(' · ')}</div></td>${img ? `<td class="pc">${img}</td>` : ''}</tr></table>
${sec('Summary', s.summary ? `<p>${esc(s.summary)}</p>` : '')}${sec('Experience', jobs)}${sec('Education', schools)}${sec('Projects', projects)}${sec('Skills', skillHtml)}${sec('More', extras)}`;
  }
  const compact = s.template === 'compact';
  // MuPDF ignores percentage column widths: give the two columns of the modern template fixed widths in points
  const inner = (s.size === 'letter' ? 612 : 595.28) - 2 * (compact ? 30 : 38), side = Math.round(inner * 0.31) - 23, main = Math.round(inner * 0.69) - 14;
  const css = `body { font-size: ${compact ? 8.8 : 9.8}pt; color: #1f2328; line-height: ${compact ? 1.3 : 1.42}; } table { border-collapse: collapse; width: 100%; } td { vertical-align: top; }
.name { font-size: ${compact ? 18 : 22}pt; font-weight: bold; color: ${a}; } .title { font-size: 11pt; color: #444; margin-top: 1pt; } .contact { color: #555; margin-top: 4pt; }
.photo { width: 70pt; } .top .pc { width: 80pt; text-align: right; }
.sec { margin-top: ${compact ? 7 : 11}pt; } .st { font-size: 8.5pt; font-weight: bold; color: ${a}; text-transform: uppercase; letter-spacing: 1pt; border-bottom: 0.8pt solid ${a}; padding-bottom: 2pt; margin-bottom: 4pt; }
.item { margin: 0 0 ${compact ? 4 : 7}pt; } .row td.d { text-align: right; color: #555; white-space: nowrap; width: 90pt; } ul { margin: 2pt 0 0; padding-left: 12pt; } li { margin: 1pt 0; }
ul.plain { list-style: none; padding-left: 0; } p { margin: 0; } .muted { color: #666; }
.cols { table-layout: fixed; } .cols td.side { width: ${side}pt; background: #f3f5f8; padding: 12pt 10pt; border-left: 3pt solid ${a}; } .cols td.main { width: ${main}pt; padding: 4pt 0 0 14pt; } .cols .contact { margin-bottom: 4pt; } .cols .photo { margin-bottom: 8pt; }`;
  return htmlToPdf(body, css, { size: s.size, margin: compact ? 30 : 38, title: `${s.name} — Resume`, files: photo ? { 'photo.png': photo } : {} });
}
