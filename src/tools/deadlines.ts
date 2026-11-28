// Paper Deadlines → Calendar (potentials #77; owner's pick of 27 Nov 2026 — group 4 of the suggested order): photograph a bill, a
// school circular, a notice or an insurance letter → every date and amount found ("Due date: 15/12/2026", "renew it by", "within 15
// days of the date of this circular") → one tap per reminder into the calendar (.ics, RFC 5545). The photo is read by the OCR's reading
// path with the camera helpers' options (src/lib/snaptext.ts), a line with a date Tesseract was unsure of read again by PaddleOCR
// (src/lib/snapsecond.ts); the dates by src/lib/deadlines.ts. A message's text can be pasted instead. PC + phones.
import { h, card, field, stack, note, button, toggle, select, progress, clear, toast, errMsg, downloadBlob, shareOrDownload, input, textarea, actions, type Mount } from '../ui';
import { imageInput } from '../lib/imgtools';
import type { Img } from '../wasm/imgproc';
import { readPaper, datesIn, icsOf, titleOf, remindFor, longDate, REMIND, type Found, type Paper, type Remind, type Ev } from '../lib/deadlines';
import { linesOf, SNAP_READ, type Line } from '../lib/snaptext';
import { today } from '../lib/form';
import './deadlines.css';

interface Row { f: Found; on: boolean; title: string; date: string; time: string; remind: Remind; note: string }
let monthFirstKept = false; // kept while the page is open

const slug = (s: string) => (s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60).replace(/[.\s]+$/, '') || 'reminders');
const uid = () => `${crypto.getRandomValues(new Uint32Array(4)).join('-')}@superutils`;
const AMOUNT_HINT = /(?:₹|¥|\bRs\.?|\bINR|\$|€|£)\s?\d/;

export const mount: Mount = (root, ctx) => {
  let seq = 0, gone = false, reads = 0;
  let lines: string[] = [], rows: Row[] = [], paper: Paper | null = null, source = '';
  const prog = progress();
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const list = h('div', { class: 'stack' });
  const head = h('div', { class: 'dl-head' });
  const extra = h('div', { class: 'stack' });
  const bar = h('div');
  const result = card('Reminders', head, list, bar, extra);
  result.hidden = true;
  const monthFirst = toggle('Dates written month first (as in the United States: 12/06 is 6 December)', monthFirstKept, (v) => { monthFirstKept = v; if (lines.length) show(); });

  const evOf = (r: Row): Ev => ({ title: r.title, date: r.date, time: r.time || null, remind: r.remind, note: r.note });
  const save = async (evs: Ev[], name: string) => {
    if (!evs.length) throw new Error('Tick at least one reminder.');
    for (const e of evs) if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new Error(`“${e.title}” has no date.`);
    const blob = new Blob([icsOf(evs, { now: new Date(), uid })], { type: 'text/calendar;charset=utf-8' });
    await (ctx.isMobile ? shareOrDownload(blob, name) : downloadBlob(blob, name));
  };
  const saveTicked = () => save(rows.filter((r) => r.on).map(evOf), `${slug(paper?.heading || 'reminders')}.ics`);

  function rowEl(r: Row) {
    const f = r.f, past = r.date < today();
    const says = h('div', { class: 'muted small' });
    const say = () => {
      const bits = [longDate(r.date)];
      if (f.counted) bits.push(`${f.counted.n} ${f.counted.unit}${f.counted.n > 1 ? 's' : ''} after ${f.printed.replace(/^.* after /, '')} (“${f.counted.of}”)`);
      else bits.push(`written “${f.printed}”`);
      if (f.guessedYear) bits.push(`the year is not written: taken as ${r.date.slice(0, 4)}`);
      if (r.date < today()) bits.push('already past');
      says.textContent = bits.join(' · ');
    };
    const on = h('input', { type: 'checkbox', class: 'dl-tick', 'aria-label': `Add “${r.title}” to the calendar` }) as HTMLInputElement;
    on.checked = r.on;
    on.addEventListener('change', () => { r.on = on.checked; drawBar(); });
    const title = input({ value: r.title, attrs: { 'aria-label': 'Title', autocomplete: 'off' }, onInput: (v) => { r.title = v; on.setAttribute('aria-label', `Add “${v}” to the calendar`); } });
    const date = input({ type: 'date', value: r.date, attrs: { 'aria-label': 'Date', required: true }, onInput: (v) => { r.date = v; say(); } });
    const time = input({ type: 'time', value: r.time, attrs: { 'aria-label': 'Time (empty: all day)' }, onInput: (v) => { r.time = v; } });
    const remind = select<Remind>(REMIND, r.remind, (v) => { r.remind = v; }, 'Reminder');
    say();
    const kind = { deadline: 'Deadline', event: 'Event', issued: 'The paper’s date', date: 'A date' }[f.kind];
    return h('section', { class: ['dl-row', past && 'dl-past'], 'aria-label': r.title },
      h('div', { class: 'dl-top' }, h('label', { class: 'dl-tickwrap' }, on), h('span', { class: `dl-kind dl-${f.kind}` }, kind), f.amount ? h('span', { class: 'dl-amount' }, f.amount) : null),
      field('Title', title),
      h('div', { class: 'dl-when' }, field('Date', date), field('Time (empty: all day)', time), field('Reminder', remind)),
      says,
      h('blockquote', { class: 'dl-quote' }, f.sentence),
      h('div', { class: 'row' }, button('Add to calendar (.ics)', () => save([evOf(r)], `${slug(r.title)}.ics`), { icon: 'CalendarPlus', small: true, title: 'A calendar file of this one reminder: your phone’s calendar, Outlook or Google Calendar opens it' })));
  }
  function drawBar() {
    clear(bar);
    const n = rows.filter((r) => r.on).length;
    const b = button(n ? `Add ${n === 1 ? 'the ticked reminder' : `the ${n} ticked reminders`} (.ics)` : 'Tick a reminder to add it', saveTicked, { variant: 'primary', icon: 'CalendarPlus', disabled: !n });
    bar.append(ctx.isMobile ? actions(b) : h('div', { class: 'row' }, b));
  }
  /** The lines read (or pasted) → the reminders, shown. */
  function show() {
    paper = readPaper(lines, { monthFirst: monthFirstKept, today: today() });
    rows = paper.found.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map((f) => ({
      f, on: (f.kind === 'deadline' || f.kind === 'event') && f.date >= today(), title: titleOf(f, paper!.heading), date: f.date, time: f.time ?? '',
      remind: remindFor(f.kind), note: [f.sentence, f.amount && `Amount: ${f.amount}`, paper!.heading && `— ${paper!.heading}`].filter(Boolean).join('\n') }));
    clear(head); clear(list); clear(extra);
    result.hidden = false;
    head.append(h('p', { class: 'muted small' }, [paper.heading && `From: ${paper.heading}`, paper.issued && `dated ${longDate(paper.issued)}`].filter(Boolean).join(' · ') || source));
    if (!rows.length) list.append(note('No date was found. Photograph the page closer, flat and in good light — or paste its text below.', 'warn'));
    rows.forEach((r) => list.append(rowEl(r)));
    if (paper.amounts.length) extra.append(h('details', { class: 'dl-extra' }, h('summary', null, `Amounts on the paper (${paper.amounts.length})`),
      h('ul', null, ...paper.amounts.map((a) => h('li', null, h('strong', null, a.text), ` — ${a.sentence}`)))));
    extra.append(h('details', { class: 'dl-extra' }, h('summary', null, source === 'pasted' ? 'The text' : 'What was read on the paper'), h('pre', { class: 'dl-pre' }, lines.map((l) => l.replace(/\t/g, '    ')).join('\n'))));
    drawBar();
  }

  async function run(img: Img) {
    const my = ++seq, stale = () => gone || my !== seq;
    status.textContent = '';
    root.setAttribute('aria-busy', 'true');
    try {
      prog.set(null, 'Reading the paper…');
      const { readPage, secondWords } = await import('../lib/readpage');
      const reading = await readPage(img, {
        lang: 'eng', ...SNAP_READ, stale,
        onProgress: (p, s) => { if (!stale()) prog.set(/recogn/i.test(s) ? p : null, /recogn/i.test(s) ? `Reading the paper… ${Math.round(p * 100)} %` : 'Loading the text engine…'); },
        onSecond: (q) => { if (!stale()) { const w = secondWords(q); prog.set(w.p, w.text); } },
      });
      if (stale()) return;
      const ls: Line[] = reading ? linesOf(reading.r) : [];
      const texts = ls.map((l) => l.text);
      // a line with a date or an amount Tesseract was unsure of, read again by PaddleOCR (its recogniser alone): one digit read
      // wrong and the reminder comes on the wrong day
      let again = 0;
      if (reading && reading.engine === 'tesseract') {
        const { secondLook, surer, leastConf, SURE } = await import('../lib/snapsecond');
        for (let i = 0; i < ls.length; i++) {
          const l = ls[i];
          if (stale()) return;
          if (!(datesIn(l.text).length || AMOUNT_HINT.test(l.text)) || l.text.includes('\t')) continue;
          const conf = leastConf(l);
          if (conf >= SURE) continue;
          const pl = await secondLook(reading.img, l, stale, (p, t) => { if (!stale()) prog.set(p, t); });
          if (stale() || !pl || pl.text === l.text) continue;
          if (await surer(pl.text, pl.score, l.text, conf)) { texts[i] = pl.text; again++; }
        }
      }
      if (stale()) return;
      prog.done();
      lines = texts; source = 'photo';
      show();
      const n = paper!.found.length;
      status.textContent = n ? `${n === 1 ? 'One date' : `${n} dates`} found${rows.filter((r) => r.on).length ? ` — ${rows.filter((r) => r.on).length} ticked as reminders` : ''}.`
        + (reading?.engine === 'paddle' ? ' The photo was soft: PaddleOCR read it.' : again ? ` ${again === 1 ? 'A line' : `${again} lines`} with a date the OCR was unsure of read again by PaddleOCR, the second reader.` : '') : '';
    } catch (e) {
      prog.done();
      if (!stale()) toast(errMsg(e), 'err');
    } finally {
      if (!stale()) { root.removeAttribute('aria-busy'); root.dataset.reads = String(++reads); }
    }
  }

  const pick = imageInput((img) => { void run(img); }, { label: 'Choose a photo of a bill, notice or letter', instead: 'choose a photo of the paper instead', paste: true });
  const pasted = textarea({ rows: 6, placeholder: 'Paste the text of an e-mail, a message or a notice…' });
  pasted.setAttribute('aria-label', 'Text with dates');
  const findText = button('Find the dates', () => {
    const t = pasted.value.trim();
    if (!t) throw new Error('Paste a text first.');
    seq++; lines = t.split(/\r?\n/); source = 'pasted';
    show();
    const n = paper!.found.length;
    status.textContent = n ? `${n === 1 ? 'One date' : `${n} dates`} found in the text.` : '';
    root.dataset.reads = String(++reads);
  }, { icon: 'CalendarSearch' });
  root.append(stack(
    card(null, pick.el, prog, status,
      h('p', { class: 'muted small' }, 'Photograph the page flat and in good light. Every date is found with what it is for — a due date, a renewal, a meeting, “within 15 days of …” — and you choose which go into your calendar.'),
      monthFirst,
      h('details', { class: 'dl-paste' }, h('summary', null, 'Or paste the text of a message'), stack(pasted, h('div', { class: 'row' }, findText)))),
    result,
    note('Everything happens on this device: the photo, its text and the reminders never leave it.', 'info')));
  return () => { gone = true; seq++; pick.dispose(); };
};
