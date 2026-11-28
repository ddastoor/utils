// Bill Splitter by Photo (potentials #78; owner's pick of 27 Nov 2026 — group 4 of the suggested order): photograph a restaurant bill →
// its lines read → tap who had what → each person's share with the service charge, the taxes, the round-off and a tip in whole paise,
// and a UPI QR code for each to pay the one who paid. The photo is read by the OCR's reading path with the camera helpers' options
// (src/lib/snaptext.ts), an amount's line Tesseract was unsure of read again by PaddleOCR (src/lib/snapsecond.ts); the bill's wording
// by src/lib/billsplit.ts; the split by mathcore (m_bill_split); the payment's code by the QR tab's upi() and zxing-cpp. PC + phones.
import { h, card, field, stack, note, button, select, progress, clear, toast, errMsg, downloadBlob, shareOrDownload, input, actions, copy, segmented, type Mount } from '../ui';
import { imageInput } from '../lib/imgtools';
import type { Img } from '../wasm/imgproc';
import { readBill, problemsOf, paiseOf, inr, rupees, shareText, type Bill, type Item, type Charge } from '../lib/billsplit';
import { linesOf, SNAP_READ, type Line } from '../lib/snaptext';
import { upi } from '../lib/qrdata';
import './billsplit.css';

type Tip = 'none' | '5' | '10' | 'amount';
interface Person { name: string }
const MONEY_LINE = /\d+\.\d{2}\b/;

export const mount: Mount = (root, ctx) => {
  let seq = 0, gone = false, reads = 0;
  let bill: Bill | null = null;
  let people: Person[] = [{ name: 'Me' }, { name: 'Friend 1' }, { name: 'Friend 2' }];
  /** who had each item: parts[i][p] (1 had it, 0 not) */
  let parts: number[][] = [];
  let payer = 0, payUpi = '', tip: Tip = 'none', tipAmount = '', tipEqual = false;
  const prog = progress();
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const billBox = h('div', { class: 'stack' });
  const peopleBox = h('div', { class: 'stack' });
  const sharesBox = h('div', { class: 'stack', 'aria-live': 'polite' });
  const bar = h('div');
  const result = stack(card('The bill', billBox), card('Who was there', peopleBox), card('Each one’s share', sharesBox, bar));
  result.hidden = true;

  // ---------------------------------------------------------------- the bill: its items (who had each), its charges, whether it adds up
  function drawBill() {
    clear(billBox);
    if (!bill) return;
    const b = bill;
    billBox.append(h('p', { class: 'muted small' }, [b.name, b.date].filter(Boolean).join(' · ') || 'A bill'));
    const tbl = h('div', { class: 'bs-items' });
    b.items.forEach((it, i) => tbl.append(itemRow(it, i)));
    billBox.append(tbl, h('div', { class: 'row' },
      button('Add an item', () => { b.items.push({ name: '', qty: 1, rate: null, paise: 0, line: -1, check: null }); parts.push(people.map(() => 1)); drawBill(); split(); (billBox.querySelector('.bs-item:last-child input') as HTMLInputElement | null)?.focus(); }, { icon: 'Plus', variant: 'ghost', small: true }),
      button('Everyone had everything', () => { parts = b.items.map(() => people.map(() => 1)); drawBill(); split(); }, { icon: 'Users', variant: 'ghost', small: true })));
    const ch = h('div', { class: 'bs-charges' });
    for (const c of b.charges) ch.append(chargeRow(c));
    if (b.total !== null) ch.append(h('div', { class: 'bs-charge bs-total' }, h('span', null, 'Total on the bill'), h('strong', null, inr(b.total))));
    billBox.append(ch);
    const probs = problemsOf(b);
    billBox.append(probs.length ? note(h('span', null, 'Check these against the bill: ', ...probs.flatMap((p, k) => [k ? ' · ' : '', p])), 'warn')
      : note(b.total !== null ? `The bill adds up: the items and the charges make ${inr(b.total)}.` : 'The items add up to the sub total.', 'ok'));
  }
  function itemRow(it: Item, i: number) {
    const amount = input({ value: rupees(it.paise).replace(/,/g, ''), attrs: { inputmode: 'decimal', 'aria-label': `Amount of ${it.name || 'the item'}`, class: 'input bs-amt' }, onInput: (v) => { const p = paiseOf(v); if (p !== null) { it.paise = p; it.check = null; split(); refreshProblems(); } } });
    const name = input({ value: it.name, attrs: { 'aria-label': 'Item', autocomplete: 'off' }, onInput: (v) => { it.name = v; amount.setAttribute('aria-label', `Amount of ${v || 'the item'}`); split(); } });
    const chips = h('div', { class: 'bs-who', role: 'group', 'aria-label': `Who had ${it.name || 'this item'}` });
    const drawChips = () => {
      clear(chips);
      people.forEach((p, k) => {
        const on = (parts[i]?.[k] ?? 0) > 0;
        chips.append(h('button', { type: 'button', class: ['chip', 'bs-chip', on && 'on'], 'aria-pressed': on ? 'true' : 'false', onclick: () => { parts[i][k] = on ? 0 : 1; drawChips(); split(); } }, p.name || `Person ${k + 1}`));
      });
    };
    drawChips();
    const qty = it.qty > 1 ? h('span', { class: 'muted small' }, `× ${it.qty}`) : null;
    return h('div', { class: 'bs-item', role: 'group', 'aria-label': it.name || 'An item' },
      h('div', { class: 'bs-line' }, name, qty, amount, button('', () => { bill!.items.splice(i, 1); parts.splice(i, 1); drawBill(); split(); }, { icon: 'X', variant: 'ghost', title: 'Remove this item' })),
      chips, it.check === 'off' ? h('div', { class: 'bs-warn small' }, `${it.qty} × ${inr(it.rate!)} is ${inr(it.qty * it.rate!)} — compare the amount with the bill`) : null);
  }
  function chargeRow(c: Charge) {
    if (c.kind === 'subtotal') return h('div', { class: 'bs-charge' }, h('span', null, c.label), h('span', null, inr(c.paise)));
    const amt = input({ value: rupees(c.paise).replace(/,/g, '').replace('−', '-'), attrs: { inputmode: 'decimal', 'aria-label': c.label, class: 'input bs-amt' }, onInput: (v) => { const p = paiseOf(v); if (p !== null) { c.paise = c.kind === 'discount' ? -Math.abs(p) : p; split(); refreshProblems(); } } });
    return h('div', { class: 'bs-charge' }, h('span', null, c.label), amt);
  }
  const refreshProblems = () => { const n = billBox.querySelector('.note'); if (n && bill) { const probs = problemsOf(bill); n.replaceWith(probs.length ? note(`Check these against the bill: ${probs.join(' · ')}`, 'warn') : note(bill.total !== null ? `The bill adds up: the items and the charges make ${inr(bill.total)}.` : 'The items add up to the sub total.', 'ok')); } };

  // ---------------------------------------------------------------- the people, who paid, the tip
  function drawPeople() {
    clear(peopleBox);
    const list = h('div', { class: 'bs-people' });
    people.forEach((p, k) => {
      const inp = input({ value: p.name, attrs: { 'aria-label': `Person ${k + 1}`, autocomplete: 'off' }, onInput: (v) => { p.name = v; drawBill(); drawPayer(); split(); } });
      list.append(h('div', { class: 'bs-line' }, inp, people.length > 1 ? button('', () => { people.splice(k, 1); parts = parts.map((r) => r.filter((_, j) => j !== k)); if (payer >= people.length) payer = 0; drawPeople(); drawBill(); split(); }, { icon: 'X', variant: 'ghost', title: `Remove ${p.name || 'this person'}` }) : null));
    });
    const add = button('Add a person', () => { people.push({ name: `Friend ${people.length}` }); parts = parts.map((r) => [...r, 1]); drawPeople(); drawBill(); split(); }, { icon: 'UserPlus', variant: 'ghost', small: true });
    peopleBox.append(list, h('div', null, add), payerBox, tipBox);
    drawPayer(); drawTip();
  }
  const payerBox = h('div', { class: 'grid2' });
  function drawPayer() {
    clear(payerBox);
    const who = select(people.map((p, k) => [String(k), p.name || `Person ${k + 1}`] as [string, string]), String(payer), (v) => { payer = +v; split(); }, 'Who paid the bill');
    const id = input({ value: payUpi, placeholder: 'name@bank', attrs: { autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'UPI ID of the one who paid' }, onInput: (v) => { payUpi = v.trim(); split(); } });
    payerBox.append(field('Who paid', who), field('Their UPI ID (for the codes to pay them)', id));
  }
  const tipBox = h('div', { class: 'stack' });
  function drawTip() {
    clear(tipBox);
    const amt = input({ value: tipAmount, placeholder: '0.00', attrs: { inputmode: 'decimal', 'aria-label': 'Tip in rupees' }, onInput: (v) => { tipAmount = v; split(); } });
    amt.hidden = tip !== 'amount';
    tipBox.append(field('A tip', segmented<Tip>([['none', 'None'], ['5', '5 %'], ['10', '10 %'], ['amount', 'An amount']], tip, (v) => { tip = v; amt.hidden = v !== 'amount'; split(); })), amt,
      segmented<'prop' | 'equal'>([['prop', 'Tip by what each had'], ['equal', 'Tip shared equally']], tipEqual ? 'equal' : 'prop', (v) => { tipEqual = v === 'equal'; split(); }));
  }

  // ---------------------------------------------------------------- the split
  let splitSeq = 0;
  async function split() {
    const my = ++splitSeq;
    clear(sharesBox); clear(bar);
    if (!bill || !bill.items.length) return;
    try {
      const { mathcore } = await import('../wasm/mathcore');
      const m = await mathcore();
      if (my !== splitSeq || gone) return;
      const charges = bill.charges.filter((c) => c.kind !== 'subtotal'); // a tip or gratuity printed on the bill is a charge like the others
      const billTotal = bill.items.reduce((s, x) => s + x.paise, 0) + charges.reduce((s, c) => s + c.paise, 0);
      const tipPaise = tip === 'none' ? 0 : tip === 'amount' ? Math.max(0, paiseOf(tipAmount || '0') ?? 0) : Math.round((billTotal * +tip) / 100);
      const extras = [...charges.map((c) => ({ paise: c.paise })), ...(tipPaise ? [{ paise: tipPaise, equal: tipEqual }] : [])];
      const res = m.billSplit(bill.items.map((x) => x.paise), parts, extras, people.length);
      const names = people.map((p, k) => p.name || `Person ${k + 1}`);
      const total = res.reduce((s, r) => s + r.total, 0);
      sharesBox.append(h('p', { class: 'muted small' }, `${inr(total)} in all${tipPaise ? `, a tip of ${inr(tipPaise)} with it` : ''} — every share in whole paise; they add up to the paisa.`));
      if (bill.total !== null && billTotal !== bill.total) sharesBox.append(note(`The items and charges make ${inr(billTotal)}, the bill’s total is ${inr(bill.total)}: check the amounts above.`, 'warn'));
      const { qrSvg } = await import('../lib/qrdraw');
      for (let k = 0; k < people.length; k++) {
        const r = res[k];
        const rows = [['Items', r.items], ...charges.map((c, j) => [c.label, r.extras[j]] as [string, number]), ...(tipPaise ? [['Tip', r.extras[charges.length]] as [string, number]] : [])] as Array<[string, number]>;
        const qr = h('div', { class: 'bs-code' });
        const el = h('section', { class: 'bs-share', 'aria-label': names[k] },
          h('div', { class: 'bs-head' }, h('strong', null, names[k]), h('span', { class: 'bs-total-p' }, inr(r.total))),
          h('div', { class: 'muted small' }, rows.filter(([, v]) => v).map(([l, v]) => `${l} ${inr(v)}`).join(' · ')));
        if (k !== payer && r.total > 0) {
          const u = upi({ vpa: payUpi, name: names[payer], amount: (r.total / 100).toFixed(2), note: `${bill.name || 'Bill'} — ${names[k]}`.slice(0, 50) });
          if (!payUpi) el.append(h('div', { class: 'muted small' }, `To pay ${names[payer]}: type their UPI ID above for a code.`));
          else if (u.text) {
            el.append(h('div', { class: 'bs-pay' }, qr, h('div', { class: 'stack' },
              h('p', { class: 'small' }, `${names[k]} pays ${names[payer]} ${inr(r.total)}: scan the code with any UPI app${ctx.isMobile ? ', or tap' : ''}.`),
              ctx.isMobile ? h('a', { class: 'btn btn-secondary btn-sm', href: u.text }, `Pay ${inr(r.total)} with a UPI app`) : null,
              button('Save QR (PNG)', async () => { const { svgToPng } = await import('../lib/qrdraw'); const svg = qr.innerHTML; if (!svg) throw new Error('No code yet.'); const blob = await svgToPng(svg, 1024); const name = `${names[k]}-pays-${names[payer]}.png`.replace(/[\\/:*?"<>|]+/g, ''); await (ctx.isMobile ? shareOrDownload(blob, name) : downloadBlob(blob, name)); }, { icon: 'Download', small: true }))));
            qrSvg(u.text).then((s) => { if (my === splitSeq) qr.innerHTML = s; }).catch(() => {}); // zint's own SVG (our generated markup)
            u.warnings.forEach((w) => el.append(note(w, 'warn')));
          } else u.errors.forEach((w) => el.append(note(w, 'warn')));
        }
        sharesBox.append(el);
      }
      const text = shareText({ name: bill.name, date: bill.date, people: names.map((n, k) => ({ name: n, total: res[k].total })), payer, upi: payUpi });
      const b = button('Copy the split', () => copy(text), { icon: 'Copy', variant: 'primary' });
      const s2 = ctx.isMobile && 'share' in navigator ? button('Share', () => navigator.share({ text }).catch(() => {}), { icon: 'Share2' }) : null;
      bar.append(ctx.isMobile ? actions(b, s2) : h('div', { class: 'row' }, b));
    } catch (e) {
      if (my === splitSeq) sharesBox.append(note(errMsg(e), 'warn'));
    }
  }

  async function run(img: Img) {
    const my = ++seq, stale = () => gone || my !== seq;
    status.textContent = '';
    root.setAttribute('aria-busy', 'true');
    try {
      prog.set(null, 'Reading the bill…');
      const { readPage, secondWords } = await import('../lib/readpage');
      const reading = await readPage(img, {
        lang: 'eng', ...SNAP_READ, stale,
        onProgress: (p, s) => { if (!stale()) prog.set(/recogn/i.test(s) ? p : null, /recogn/i.test(s) ? `Reading the bill… ${Math.round(p * 100)} %` : 'Loading the text engine…'); },
        onSecond: (q) => { if (!stale()) { const w = secondWords(q); prog.set(w.p, w.text); } },
      });
      if (stale()) return;
      const ls: Line[] = reading ? linesOf(reading.r) : [];
      const texts = ls.map((l) => l.text);
      // a line with an amount Tesseract was unsure of, read again by PaddleOCR's recogniser — the surer reading kept, if the line is still
      // one of amounts (its parts: a receipt's columns)
      let again = 0;
      if (reading && reading.engine === 'tesseract') {
        const { secondLook, surer, leastConf, SURE } = await import('../lib/snapsecond');
        for (let i = 0; i < ls.length; i++) {
          const l = ls[i];
          if (stale()) return;
          if (!MONEY_LINE.test(l.text)) continue;
          const conf = leastConf(l);
          if (conf >= SURE) continue;
          const pl = await secondLook(reading.img, l, stale, (p, t) => { if (!stale()) prog.set(p, t); });
          if (stale() || !pl) continue;
          const was = l.text.replace(/\t/g, ' ').replace(/\s+/g, ' ');
          const nums = (s: string) => (s.match(/-?\d[\d,]*\.\d{2}/g) ?? []).join(' ');
          if (nums(pl.text) && nums(pl.text) !== nums(was) && nums(pl.text).split(' ').length === nums(was).split(' ').length && await surer(pl.text, pl.score, was, conf)) {
            // keep the line's parts: the amounts put back in their places
            const a = nums(was).split(' '), b2 = nums(pl.text).split(' ');
            let t = l.text; a.forEach((x, j) => { t = t.replace(x, b2[j]); });
            texts[i] = t; again++;
          }
        }
      }
      if (stale()) return;
      prog.done();
      bill = readBill(texts);
      parts = bill.items.map(() => people.map(() => 1));
      result.hidden = false;
      drawBill(); drawPeople(); await split();
      status.textContent = bill.items.length ? `${bill.items.length} item${bill.items.length > 1 ? 's' : ''} read${bill.total !== null ? `, the total ${inr(bill.total)}` : ''}. Tap who had each one.`
        + (reading?.engine === 'paddle' ? ' The photo was soft: PaddleOCR read it.' : again ? ` ${again === 1 ? 'A line' : `${again} lines`} with amounts the OCR was unsure of read again by PaddleOCR, the second reader.` : '')
        : '';
      if (!bill.items.length) toast('No items were found on this photo. Photograph the bill flat, close and in good light — or add the items by hand.', 'err', 5000);
    } catch (e) {
      prog.done();
      if (!stale()) toast(errMsg(e), 'err');
    } finally {
      if (!stale()) { root.removeAttribute('aria-busy'); root.dataset.reads = String(++reads); }
    }
  }

  const pick = imageInput((img) => { void run(img); }, { label: 'Choose a photo of the bill', instead: 'choose a photo of the bill instead', paste: true });
  const byHand = button('Type the bill by hand', () => { bill = { name: '', date: null, items: [{ name: '', qty: 1, rate: null, paise: 0, line: -1, check: null }], charges: [], subtotal: null, total: null, problems: [] }; parts = [people.map(() => 1)]; result.hidden = false; drawBill(); drawPeople(); void split(); }, { variant: 'ghost', icon: 'Plus' });
  root.append(stack(
    card(null, pick.el, prog, status,
      h('p', { class: 'muted small' }, 'Photograph the whole bill, flat and straight on. Its items are read with their amounts; tap who had each, and every share comes out with the service charge, the taxes and the round-off — in whole paise.'),
      h('div', { class: 'row' }, byHand)),
    result,
    note('Everything happens on this device: the photo, the names and the amounts never leave it.', 'info')));
  return () => { gone = true; seq++; splitSeq++; pick.dispose(); };
};
