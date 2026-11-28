// Visiting Card → Contact (potentials #89; owner's pick of 27 Nov 2026 — group 4 of the suggested order): photograph a business
// card → its name, job title, company, phone numbers, e-mail addresses, websites and address → a contact file (.vcf) to save, or
// its QR code. The photo is read by the OCR's reading path with the camera helpers' options (src/lib/snaptext.ts), a QR code on
// the card by zxing-cpp; the card's wording by src/lib/visitcard.ts; the numbers by the Number Detective's engine (devcore-ids
// `ids:tel`); the code drawn by zxing-cpp (src/lib/qrdraw.ts). Several cards one after another, a card's other side added to
// it; one file for all. PC + phones.
import { h, card, field, stack, note, button, toggle, select, progress, clear, toast, errMsg, downloadBlob, shareOrDownload, input, textarea, actions, reveal, type Mount } from '../ui';
import { imageInput } from '../lib/imgtools';
import type { Img } from '../wasm/imgproc';
import { readCard, mergeContacts, splitName, fullName, displayName, vcardOne, vcardOf, fileName, phoneOf, addressText, emptyContact, type Contact, type Phone, type PhoneKind, type Tel, type TelOf } from '../lib/visitcard';
import { linesOf, SNAP_READ, type Line } from '../lib/snaptext';
import './visitcard.css';

const KINDS: Array<[PhoneKind, string]> = [['cell', 'Mobile'], ['work', 'Work'], ['home', 'Home'], ['fax', 'Fax'], ['other', 'Other']];
interface Entry { id: number; c: Contact; others: string[]; cc: number | null; familyFirst: boolean; name: string; read: string[] }

/** What the engine says of a number, in a few words, under its box. */
function telSays(p: Phone): [string, 'ok' | 'warn' | ''] {
  const t = p.tel;
  if (!p.number.trim()) return ['', ''];
  if (!t) return ['No calling code and no Indian number: saved as printed — add the country’s code (+…) if you know it.', 'warn'];
  if (t.cc === 91) {
    if (!t.valid) return ['Not a number in use in India by libphonenumber’s rules — compare it with the card.', 'warn'];
    const what: Record<string, string> = { mobile: 'An Indian mobile number', fixed_line: 'An Indian landline', fixed_line_or_mobile: 'An Indian landline or mobile number', toll_free: 'An Indian toll-free number', premium_rate: 'An Indian premium-rate number', shared_cost: 'An Indian shared-cost number', uan: 'An Indian universal access number' };
    return [`${what[t.kind] ?? 'An Indian number'}${t.place ? ` — ${t.place}` : ''} · ${t.e164}`, 'ok'];
  }
  if (t.valid === false) return [`Calling code +${t.cc} (${t.country}), but ${t.why ?? 'the number has the wrong length'}.`, 'warn'];
  return [`${t.country} (calling code +${t.cc}) · ${t.e164} — that country’s own rules are not checked here.`, ''];
}

export const mount: Mount = (root, ctx) => {
  let seq = 0, gone = false, nid = 0, reads = 0;
  let entries: Entry[] = [];
  /** the next photo is the other side of this card */
  let target: Entry | null = null;
  let telOf: TelOf | null = null;
  const loadTel = async () => {
    if (telOf) return telOf;
    const { devcore } = await import('../wasm/devcore');
    const d = await devcore('ids');
    return (telOf = (text: string) => d.json<Tel>('ids:tel', { text }));
  };
  const prog = progress();
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const side = h('div', { class: 'vc-side-note' });
  const list = h('div', { class: 'stack' });
  const top = h('div', { class: 'row vc-top' });
  const bar = h('div');
  const result = card('Contacts', top, list, bar);
  result.hidden = true;

  const saveVcf = async (cs: Contact[], name: string) => {
    const blob = new Blob([vcardOf(cs)], { type: 'text/vcard;charset=utf-8' });
    await (ctx.isMobile ? shareOrDownload(blob, name) : downloadBlob(blob, name));
  };
  function drawTop() {
    clear(top); clear(bar);
    if (!entries.length) { result.hidden = true; return; }
    result.hidden = false;
    const n = entries.length;
    if (n > 1) top.append(button(`Save all ${n} contacts (.vcf)`, () => saveVcf(entries.map((e) => e.c), `contacts-${n}.vcf`), { icon: 'Download', variant: 'primary', title: 'One file with every contact: phones, Outlook and Google Contacts import them all' }),
      button('Remove all', () => { entries = []; target = null; showTarget(); show(); }, { icon: 'Trash2', variant: 'ghost' }));
    // the phone's bar: the main action (a PC has the buttons beside each contact and above the list)
    if (ctx.isMobile) bar.append(actions(n > 1 ? button(`Save all ${n} (.vcf)`, () => saveVcf(entries.map((e) => e.c), `contacts-${n}.vcf`), { variant: 'primary', icon: 'Download' })
      : button('Save contact', () => saveVcf([entries[0].c], fileName(entries[0].c)), { variant: 'primary', icon: 'UserPlus' })));
  }
  function showTarget() {
    clear(side);
    if (!target) return;
    const t = target;
    side.append(note(h('span', null, `The next photo is read as the other side of ${displayName(t.c) || 'this card'}’s card. `,
      button('Read a new card instead', () => { target = null; showTarget(); }, { variant: 'ghost', small: true })), 'info'));
  }

  /** One contact: every field editable; the QR code and the file follow them. */
  function contactCard(e: Entry) {
    const c = e.c;
    const qr = h('div', { class: 'vc-code', role: 'img', 'aria-label': 'The contact’s QR code' });
    const qrNote = h('div');
    let svg = '', my = 0, timer = 0;
    const draw = () => { clearTimeout(timer); timer = window.setTimeout(drawNow, 150); };
    const drawNow = async () => {
      const me = ++my;
      title.firstChild!.textContent = displayName(c) || 'A contact';
      clear(qrNote);
      try {
        const { qrSvg } = await import('../lib/qrdraw');
        const s = await qrSvg(vcardOne(c).trimEnd(), 'L');
        if (me !== my || gone) return;
        svg = s; qr.innerHTML = s; // zint's own SVG (our generated markup)
      } catch (err) { if (me === my) { qr.replaceChildren(); svg = ''; qrNote.append(note(`${errMsg(err)} Leave out the note, or save the contact as a file.`, 'warn')); } }
    };
    // ---- the name: one box, its parts said under it
    const parts = h('div', { class: 'muted small' });
    const sayParts = () => { parts.textContent = [c.prefix && `${c.prefix} before the name`, c.first && `first name ${c.first}`, c.middle && `middle ${c.middle}`, c.last && `last name ${c.last}`, c.suffix && `after it ${c.suffix}`].filter(Boolean).join(' · ') || 'No name: the contact is saved under its company.'; };
    const setName = (v: string) => { e.name = v; Object.assign(c, splitName(v, e.familyFirst)); sayParts(); draw(); };
    const nameIn = input({ value: e.name, attrs: { autocomplete: 'off', spellcheck: 'false' }, onInput: setName });
    const fam = toggle('The family name comes first', e.familyFirst, (v) => { e.familyFirst = v; setName(e.name); });
    sayParts();
    // ---- phones
    const phones = h('div', { class: 'stack vc-list' });
    const phoneRow = (p: Phone) => {
      const says = h('div', { class: 'small' });
      const sayTel = () => { const [t, k] = telSays(p); says.textContent = t; says.className = `small ${k === 'warn' ? 'vc-warn' : 'muted'}`; };
      const kind = select<PhoneKind>(KINDS, p.kind, (v) => { p.kind = v; draw(); }, 'Kind of number');
      let tt = 0;
      const num = input({ value: p.number, attrs: { inputmode: 'tel', autocomplete: 'off', 'aria-label': 'Phone number', class: 'input mono' }, onInput: (v) => {
        p.number = v; draw();
        clearTimeout(tt); tt = window.setTimeout(async () => { const tel = await loadTel().catch(() => null); if (!tel || gone) return; const q = phoneOf(v, p.kind, tel, e.cc); Object.assign(p, { e164: q.e164, tel: q.tel }); sayTel(); }, 250);
      } });
      const row = h('div', { class: 'vc-item' }, h('div', { class: 'vc-row' }, kind, num, button('', () => { c.phones.splice(c.phones.indexOf(p), 1); row.remove(); draw(); }, { icon: 'X', variant: 'ghost', title: 'Remove this number' })), says);
      sayTel();
      return row;
    };
    c.phones.forEach((p) => phones.append(phoneRow(p)));
    const addPhone = button('Add a phone number', () => { const p: Phone = { number: '', kind: 'cell', e164: null, tel: null, printed: '', line: -1 }; c.phones.push(p); const r = phoneRow(p); phones.append(r); r.querySelector('input')?.focus(); }, { icon: 'Plus', variant: 'ghost', small: true });
    // ---- e-mail addresses and websites: rows of boxes
    const rows = (arr: string[], label: string, type: string, addLabel: string) => {
      const box = h('div', { class: 'stack vc-list' });
      const one = (i: number) => {
        const inp = input({ type, value: arr[i], attrs: { autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', 'aria-label': label }, onInput: (v) => { arr[i] = v; draw(); } });
        const r = h('div', { class: 'vc-row' }, inp, button('', () => { arr[i] = ''; r.remove(); draw(); }, { icon: 'X', variant: 'ghost', title: `Remove this ${label.toLowerCase()}` }));
        return r;
      };
      arr.forEach((_, i) => box.append(one(i)));
      const add = button(addLabel, () => { arr.push(''); const r = one(arr.length - 1); box.append(r); r.querySelector('input')?.focus(); }, { icon: 'Plus', variant: 'ghost', small: true });
      return h('div', { class: 'stack' }, box, h('div', null, add));
    };
    // ---- the address, by its parts
    const a = c.address;
    const adr = (k: keyof typeof a, label: string) => field(label, input({ value: a[k], attrs: { autocomplete: 'off' }, onInput: (v) => { a[k] = v; draw(); } }));
    // ---- the note, and the card's other lines to put in it
    const noteIn = textarea({ value: c.note, rows: 3, onInput: (v) => { c.note = v; draw(); } });
    noteIn.setAttribute('aria-label', 'Note');
    const extras = e.others.length ? h('details', { class: 'vc-extra' }, h('summary', null, `Also on the card (${e.others.length})`),
      h('ul', { class: 'vc-others' }, ...e.others.map((o) => h('li', null, h('span', null, o), ' ',
        button('Add to note', () => { c.note = [c.note.trim(), o].filter(Boolean).join('\n'); noteIn.value = c.note; draw(); }, { small: true, variant: 'ghost', icon: 'Plus' }))))) : null;
    const from = c.from === 'qr' ? 'from the card’s QR code (exact)' : c.from === 'both' ? 'from the card’s QR code (exact) and its printed text' : 'read from the card — check it';
    const title = h('h3', { class: 'vc-title' }, displayName(c) || 'A contact', h('span', { class: 'vc-from' }, from));
    const read = e.read.length ? h('details', { class: 'vc-read' }, h('summary', null, 'What was read on the card'), h('pre', { class: 'vc-pre' }, e.read.join('\n'))) : null;
    const el = h('section', { class: 'vc-contact', 'aria-label': displayName(c) || 'A contact' },
      title,
      h('div', { class: 'vc-grid' },
        h('div', { class: 'stack' },
          field('Name', nameIn, parts), fam,
          h('div', { class: 'grid2' }, field('Job title', input({ value: c.title, attrs: { autocomplete: 'off' }, onInput: (v) => { c.title = v; draw(); } })),
            field('Company', input({ value: c.org, attrs: { autocomplete: 'off' }, onInput: (v) => { c.org = v; draw(); } }))),
          h('div', { class: 'field', role: 'group', 'aria-label': 'Phone numbers' }, h('span', { class: 'field-label' }, 'Phone numbers'), phones, h('div', null, addPhone)),
          h('div', { class: 'field', role: 'group', 'aria-label': 'E-mail addresses' }, h('span', { class: 'field-label' }, 'E-mail'), rows(c.emails, 'E-mail address', 'email', 'Add an e-mail address')),
          h('div', { class: 'field', role: 'group', 'aria-label': 'Websites' }, h('span', { class: 'field-label' }, 'Website'), rows(c.urls, 'Website', 'url', 'Add a website')),
          h('div', { class: 'field', role: 'group', 'aria-label': 'Address' }, h('span', { class: 'field-label' }, 'Address'),
            h('div', { class: 'vc-adr' }, adr('street', 'Street'), adr('city', 'City'), adr('region', 'State or region'), adr('postcode', 'PIN or postcode'), adr('country', 'Country'))),
          field('Note', noteIn), extras, read),
        h('div', { class: 'stack vc-side' }, qr, qrNote,
          h('p', { class: 'muted small' }, 'A phone’s camera reads the code and offers to add the contact.'),
          h('div', { class: 'row vc-btns' },
            button('Save contact (.vcf)', () => saveVcf([c], fileName(c)), { icon: 'UserPlus', small: true, variant: 'primary', title: 'A contact file: phones, Outlook and Google Contacts import it' }),
            button('Save QR (PNG)', async () => { if (!svg) throw new Error('No code yet.'); const { svgToPng } = await import('../lib/qrdraw'); const b = await svgToPng(svg, 1024); await (ctx.isMobile ? shareOrDownload(b, fileName(c, 'png')) : downloadBlob(b, fileName(c, 'png'))); }, { icon: 'QrCode', small: true }),
            button('Read the other side', () => { target = e; showTarget(); reveal(pick.el); }, { icon: 'FlipHorizontal2', small: true, title: 'A card with more on its back: photograph the back, and what it prints is added to this contact' }),
            button('Remove', () => { entries = entries.filter((x) => x !== e); if (target === e) { target = null; showTarget(); } show(); }, { icon: 'Trash2', small: true, variant: 'ghost' })))));
    void drawNow();
    return el;
  }
  function show() {
    clear(list);
    entries.forEach((e) => list.append(contactCard(e)));
    drawTop();
  }

  async function run(img: Img) {
    const my = ++seq, stale = () => gone || my !== seq;
    const into = target;
    status.textContent = '';
    root.setAttribute('aria-busy', 'true');
    try {
      prog.set(null, into ? 'Reading the other side…' : 'Reading the card…');
      const [{ readPage, secondWords }, { findCodes }, tel] = await Promise.all([import('../lib/readpage'), import('../lib/codesread'), loadTel()]);
      // a QR code on the card (many carry their contact) is read exactly; the text by the OCR's reading path
      const codes = (await findCodes(img).catch(() => [])).map((x) => x.text);
      if (stale()) return;
      const reading = await readPage(img, {
        lang: 'eng', ...SNAP_READ, stale,
        onProgress: (p, s) => { if (!stale()) prog.set(/recogn/i.test(s) ? p : null, /recogn/i.test(s) ? `Reading the card… ${Math.round(p * 100)} %` : 'Loading the text engine…'); },
        onSecond: (q) => { if (!stale()) { const w = secondWords(q); prog.set(w.p, w.text); } },
      });
      if (stale()) return;
      const lines: Line[] = reading ? linesOf(reading.r) : [];
      const got = readCard(lines, codes, tel);
      // the lines of a phone number, an e-mail address or a website Tesseract was unsure of, read again by the second reader
      // (PaddleOCR) — the surer reading of each value kept: one digit read wrong and the number calls someone else
      let again = 0;
      if (reading && reading.engine === 'tesseract') {
        const { secondLook, surer, leastConf, SURE } = await import('../lib/snapsecond');
        const c = got.contact;
        const at = new Set([...c.phones.map((p) => p.line), ...got.at.emails, ...got.at.urls].filter((i) => i >= 0));
        for (const li of at) {
          const l = lines[li];
          if (!l || stale()) continue;
          const conf = leastConf(l);
          if (conf >= SURE) continue;
          const pl = await secondLook(reading.img, l, stale, (p, t) => { if (!stale()) prog.set(p, t); }, 'reading the line again');
          if (stale() || !pl) continue;
          const alt = readCard([pl.text], [], tel).contact;
          // the e-mail addresses and websites of this line, in order, against the second reading's
          for (const [vals, ats, alts] of [[c.emails, got.at.emails, alt.emails], [c.urls, got.at.urls, alt.urls]] as Array<[string[], number[], string[]]>) {
            const idx = ats.map((x, i) => (x === li ? i : -1)).filter((i) => i >= 0);
            for (let k = 0; k < idx.length; k++) {
              const v = vals[idx[k]], w = alts[k];
              if (w && w !== v && await surer(w, pl.score, v, conf)) { vals[idx[k]] = w; again++; }
            }
          }
          const ps = c.phones.filter((p) => p.line === li);
          for (let k = 0; k < ps.length; k++) {
            const w = alt.phones[k];
            if (w && w.printed.replace(/\D/g, '') !== ps[k].printed.replace(/\D/g, '') && await surer(w.printed, pl.score, ps[k].printed, conf)) {
              const q = phoneOf(w.printed, ps[k].kind, tel, got.cc, li);
              if (ps[k].tel?.valid && !q.tel?.valid) continue; // a number that keeps libphonenumber's rules is not given up for one that breaks them
              Object.assign(ps[k], q); again++;
            }
          }
        }
      }
      if (stale()) return;
      prog.done();
      const c = got.contact;
      const empty = !fullName(c) && !c.org && !c.phones.length && !c.emails.length && !c.urls.length && !addressText(c.address);
      const read = lines.map((l) => l.text.replace(/\t/g, '    '));
      if (into && entries.includes(into)) {
        // the other side: what it prints added to the contact
        into.c = mergeContacts(into.c, c);
        into.others = [...into.others, ...got.others.filter((o) => !into.others.includes(o))];
        into.read = [...into.read, '— the other side —', ...read];
        if (!into.name) into.name = fullName(into.c);
        target = null; showTarget();
        status.textContent = empty ? 'Nothing of a contact was read on this side.' : `The other side was added to ${displayName(into.c)}.`;
      } else if (empty) {
        status.textContent = '';
        toast('No name, number or address was found on this photo. Photograph the card closer, flat and in good light.', 'err', 5000);
      } else {
        const e: Entry = { id: ++nid, c, others: got.others, cc: got.cc, familyFirst: false, name: fullName(c), read };
        entries.unshift(e);
        const bits = [c.phones.length && `${c.phones.length} phone number${c.phones.length > 1 ? 's' : ''}`, c.emails.length && `${c.emails.length > 1 ? `${c.emails.length} e-mail addresses` : 'an e-mail address'}`,
          c.urls.length && (c.urls.length > 1 ? `${c.urls.length} websites` : 'a website'), addressText(c.address) && 'the address'].filter(Boolean) as string[];
        status.textContent = `Read: ${displayName(c) || 'a contact'}${bits.length ? ` — ${bits.length > 1 ? `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}` : bits[0]}` : ''}.`
          + (c.from !== 'card' ? ' The card’s QR code was read exactly.' : '')
          + (reading?.engine === 'paddle' ? ' The photo was soft: PaddleOCR read it.' : again ? ' A line the OCR was unsure of was read again by PaddleOCR, the second reader.' : '');
      }
      show();
    } catch (err) {
      prog.done();
      if (!stale()) toast(errMsg(err), 'err');
    } finally {
      // the photo read (or given up): the count tells a script which reading it sees
      if (!stale()) { root.removeAttribute('aria-busy'); root.dataset.reads = String(++reads); }
    }
  }

  const pick = imageInput((img) => { void run(img); }, { label: 'Choose a photo of a visiting card', instead: 'choose a photo of the card instead', paste: true });
  const addHand = button('Type a contact by hand', () => { const c = emptyContact(); entries.unshift({ id: ++nid, c, others: [], cc: null, familyFirst: false, name: '', read: [] }); show(); list.querySelector('input')?.focus(); }, { variant: 'ghost', icon: 'Plus' });
  root.append(stack(
    card(null, pick.el, side, prog, status,
      h('p', { class: 'muted small' }, 'Photograph the card flat, close and straight on. Each photo adds a contact; a card with more on its back: “Read the other side”. Check what was read, then save it — the file opens in your phone’s contacts, Outlook or Google Contacts.'),
      h('div', { class: 'row' }, addHand)),
    result,
    note('Everything happens on this device: the photo and the contact never leave it.', 'info')));
  return () => { gone = true; seq++; pick.dispose(); };
};
