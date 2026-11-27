// Number Detective (potentials #84): paste any number or code → what it is and whether it is valid, offline — Aadhaar
// (Verhoeff), its VID, PAN, GSTIN (mod 36), TAN, voter ID, IFSC (RBI's list), UPI ID, PIN code (India Post's directory),
// Indian phone numbers (libphonenumber's rules), vehicle numbers, driving licences, CIN, Udyam; IMEI, card numbers (Luhn,
// the network), SIM numbers, ISBN, ISSN, barcodes (GS1), IBAN, SWIFT, ISIN, VIN. The checks are devcore-ids.wasm's, fetched
// with the first number; nothing typed leaves the device. PC and phones.
import { h, card, stack, note, button, textarea, clear, copy, errMsg, type Mount } from '../ui';
import { devcore, type Devcore } from '../wasm/devcore';
import { entries, VERDICT, EXAMPLES, MAX_LINES, type Answer, type Reading } from '../lib/numcheck';
import './numcheck.css';

// what was typed, kept while the page is open (another tab and back)
let kept = '';

export const mount: Mount = (root) => {
  let engine: Devcore | null = null, loading: Promise<Devcore> | null = null, timer = 0, seq = 0, gone = false;
  const box = textarea({ rows: 3, placeholder: 'Aadhaar, PAN, GSTIN, IFSC, UPI ID, PIN code, phone, vehicle number, IMEI, card, ISBN, IBAN … — one a line', mono: true });
  box.setAttribute('aria-label', 'Numbers or codes, one a line');
  box.setAttribute('maxlength', '20000');
  box.autocapitalize = 'characters';
  box.value = kept;
  const status = h('div', { class: 'field-hint', 'aria-live': 'polite' });
  const out = h('div', { class: 'stack nd-out' });
  const sources = h('p', { class: 'nd-sources' });

  const examples = h('div', { class: 'nd-examples', role: 'group', 'aria-label': 'Examples to try' },
    h('span', { class: 'field-hint' }, 'Try:'),
    ...EXAMPLES.map(([what, v]) => h('button', { type: 'button', class: 'chip chip-btn', title: `${what}: ${v}`, onclick: () => { box.value = v; kept = v; run(); box.focus(); } }, what)));

  const load = () => (loading ||= devcore('ids').then((d) => {
    engine = d;
    const i = d.json<any>('ids:info', {});
    sources.textContent = `How it knows: PIN codes from ${i.pinSource}. IFSC codes from ${i.ifscSource}. Phone numbers by ${i.phoneSource}. ISBN hyphens by ${i.isbnSource}. IBANs by SWIFT's IBAN registry; card networks by Braintree's credit-card-type and NPCI's RuPay ranges; barcode prefixes by GS1's list; VIN makers by vininfo. Everything is checked on this device — nothing you type is sent anywhere.`;
    return d;
  }).catch((e) => { loading = null; throw e; }));

  function reading(r: Reading, first: boolean, many: boolean): HTMLElement {
    const [label, tone] = VERDICT[r.verdict];
    const copyBtn = (v: string) => { const b = button('Copy', () => copy(v), { small: true, variant: 'ghost', icon: 'Copy' }); b.setAttribute('aria-label', `Copy ${v}`); return b; };
    const value = h('div', { class: 'nd-value' }, h('span', { class: 'mono' }, r.value), copyBtn(r.value));
    const kv = r.fields.length ? h('div', { class: 'kv nd-fields' }, ...r.fields.flatMap(([l, v]) => [h('div', null, l), h('div', null, v)])) : null;
    const fix = r.fix ? h('div', { class: 'nd-fix' }, 'With the right check digit: ', h('span', { class: 'mono' }, r.fix), ' ', copyBtn(r.fix)) : null;
    return h('article', { class: ['nd-reading', first && 'nd-first'], 'data-kind': r.kind, 'data-verdict': r.verdict },
      h('div', { class: 'nd-head' }, many ? h('span', { class: 'nd-rank' }, first ? 'Most likely' : 'Could also be') : null,
        h('h4', null, r.title), h('span', { class: `pill ${tone ? `pill-${tone}` : ''}` }, label)),
      h('p', { class: 'nd-summary' }, r.summary), value, fix, kv,
      r.notes.length ? h('ul', { class: 'nd-notes' }, ...r.notes.map((n) => h('li', null, n))) : null);
  }

  function show(text: string, a: Answer, single: boolean): HTMLElement {
    const head = single ? null : h('h3', { class: 'card-title mono' }, text);
    if (!a.readings.length) {
      return h('section', { class: 'card nd-entry', 'data-none': '' }, head,
        note(`${single ? 'This' : 'It'} is not a number or code this tab knows (${a.shape}). It reads Indian IDs (Aadhaar, PAN, GSTIN, TAN, voter ID, driving licence, vehicle numbers, CIN, Udyam), bank codes (IFSC, UPI IDs, IBAN, SWIFT), PIN codes, phone numbers, IMEI, card and SIM numbers, ISBN, ISSN, barcodes, ISIN and VIN.`, 'info'));
    }
    const many = a.readings.length > 1;
    return h('section', { class: 'card nd-entry' }, head, ...a.readings.map((r, i) => reading(r, i === 0, many)));
  }

  async function run() {
    kept = box.value;
    const my = ++seq;
    const { list, more, long } = entries(box.value);
    if (!list.length) { clear(out); out.dataset.for = box.value; status.textContent = long ? 'A line that long is no number or code (at most 120 characters a line).' : ''; return; }
    if (!engine) {
      status.textContent = 'Getting the checks ready…';
      try { await load(); } catch (e) { if (my === seq && !gone) status.textContent = `The checks could not be fetched: ${errMsg(e)}. Type again to try once more.`; return; }
      if (my !== seq || gone) return;
    }
    const cards = list.map((t) => { try { return show(t, engine!.json<Answer>('ids', { text: t }), list.length === 1); } catch (e) { engine = null; loading = null; return h('section', { class: 'card nd-entry' }, note(`This could not be checked: ${errMsg(e)}`, 'err')); } });
    clear(out).append(...cards);
    out.dataset.for = box.value; // what the answers are for (the tests wait on it)
    const found = list.filter((_, i) => !cards[i].hasAttribute('data-none')).length;
    status.textContent = list.length === 1 ? '' : `${list.length} entries · ${found} recognised${more ? ` · only the first ${MAX_LINES} lines are checked (${more} more)` : ''}${long ? ` · ${long} line${long > 1 ? 's' : ''} too long to be a code left out` : ''}`;
  }
  box.addEventListener('input', () => { clearTimeout(timer); timer = window.setTimeout(run, 120); });

  root.append(stack(
    card('Numbers or codes',
      h('p', { class: 'muted' }, 'Paste or type any number or code: what it is, and whether it is valid — Indian IDs, bank and payment codes, PIN codes, phone numbers, IMEI, ISBN, barcodes, IBAN and more. One a line for several.'),
      box, status, examples,
      note('Checked on this device: nothing you type is sent anywhere. A valid check digit says the number was not mistyped — not that it was issued, or whose it is.', 'info')),
    out, sources));
  if (box.value.trim()) run();
  return () => { gone = true; clearTimeout(timer); };
};
