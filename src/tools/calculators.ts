import { h, card, field, input, select, segmented, button, clear, stack, copy, note, type Mount } from '../ui';
import { localZone, modernZone } from '../lib/tz';
import { calcForm, fmtINR, fmtN, need, today } from '../lib/form';
import { mathcore } from '../wasm/mathcore';
import { UNITS, convert, convertAll, belowAbsoluteZero, fmtUnit, plainUnit } from '../lib/units';
import { DAY, parseD, isoD, fmtD, addDays, daysBetween, ymd, addSpan, nextBirthday, plural } from '../lib/dates';
import { emiPlan, sipPlan, fdPlan, gstSplit, span } from '../lib/finance';

// ------------------------------------------------------------------ Unit converter
// table, arithmetic and number formatting: src/lib/units.ts (exact definitions, held to GNU Units by the unit suite)
export const units: Mount = (root) => {
  let cat = 'length';
  const catSel = select(Object.entries(UNITS).map(([k, v]) => [k, v.label]), cat, (v) => { cat = v; fill(); });
  const val = input({ type: 'number', value: 1, onInput: () => run() });
  val.step = 'any';
  const from = h('select', { class: 'input select', onchange: () => run() });
  const to = h('select', { class: 'input select', onchange: () => run() });
  const big = h('div', { class: 'big-results' });
  const table = h('div', { class: 'kv' });
  const warn = h('div');
  const FIRST: Record<string, [string, string]> = { length: ['km', 'mile'], temperature: ['°C', '°F'], mass: ['kg', 'pound'], volume: ['litre', 'gallon (US)'], area: ['acre', 'hectare'], speed: ['km/h', 'mph'], data: ['GB (1000³)', 'GiB (1024³)'], pressure: ['psi', 'bar'], energy: ['kWh (unit)', 'kcal'], fuel: ['km/l', 'l/100km'], angle: ['degree', 'radian'] };
  const fill = () => {
    const us = Object.keys(UNITS[cat].units);
    from.replaceChildren(...us.map((u) => h('option', { value: u }, u)));
    to.replaceChildren(...us.map((u) => h('option', { value: u }, u)));
    [from.value, to.value] = FIRST[cat] || [us[0], us[Math.min(1, us.length - 1)]];
    run();
  };
  const run = () => {
    const x = parseFloat(val.value);
    clear(big); clear(table); clear(warn);
    if (!isFinite(x)) { if (val.value.trim() || val.validity.badInput) warn.append(note('Type a number, such as 2.5 or 1e6.', 'info')); return; }
    const r = convert(cat, from.value, to.value, x);
    if (belowAbsoluteZero(cat, from.value, x)) warn.append(note(`${fmtUnit(x)} ${from.value} is below absolute zero (−273.15 °C, 0 K): no temperature is that low.`, 'warn'));
    if (cat === 'fuel' && !(x > 0)) warn.append(note('A fuel economy is a number above 0.', 'warn'));
    // click to copy: the plain number (no thousands separators), so that it pastes into a spreadsheet as a number
    big.append(h('button', { class: 'big-result', type: 'button', title: 'Copy the number', onclick: () => { const t = plainUnit(r); if (t) copy(t); } },
      h('span', { class: 'big-label' }, `${fmtUnit(x)} ${from.value} =`), h('span', { class: 'big-value' }, `${fmtUnit(r)} ${to.value}`)));
    table.append(...convertAll(cat, from.value, x).flatMap(([u, v]) => [h('span', null, u), h('span', null, fmtUnit(v))]));
  };
  root.append(card(null, stack(field('Quantity', catSel), h('div', { class: 'form-grid' }, field('Value', val), field('From', from), field('To', to)),
    button('Swap', () => { const t = from.value; from.value = to.value; to.value = t; run(); }, { small: true, icon: 'ArrowLeftRight' }))),
    card('Result', warn, big, table));
  fill();
};

// ------------------------------------------------------------------ Dates
// calendar arithmetic: src/lib/dates.ts (held to Python's datetime by the unit suite)
const pickD = (s: string, what: string) => { const d = parseD(s); if (!d) throw new Error(s ? `${what}: a date from the year 1 to 9999, please.` : `Pick ${what === 'Both' ? 'both dates' : `the ${what.toLowerCase()}`}.`); return d; };
export const dates: Mount = async (root) => {
  const mc = await mathcore();
  let mode = 'diff';
  const body = h('div', { class: 'stack' });
  const render = () => {
    clear(body);
    if (mode === 'diff') calcForm(body, [
      { key: 'a', label: 'From', type: 'date', value: today().slice(0, 4) + '-01-01' },
      { key: 'b', label: 'To', type: 'date', value: today() },
      { key: 'incl', label: 'Count end date', type: 'seg', value: 'no', options: [['no', 'No'], ['yes', 'Yes (+1 day)']] },
    ], (v) => {
      if (!v.a || !v.b) throw new Error('Pick both dates.');
      const a0 = pickD(v.a, 'From'), b0 = pickD(v.b, 'To'), incl = v.incl === 'yes';
      const [a, b] = a0 <= b0 ? [a0, b0] : [b0, a0];
      const days = daysBetween(a, b) + (incl ? 1 : 0);
      // with the end date counted, the span runs to the day after it: 1 Jan – 31 Jan is 31 days and one month
      const { y, m, d } = ymd(a, incl ? addDays(b, 1) : b);
      const d0 = Math.round(a.getTime() / DAY), d1 = Math.round(b.getTime() / DAY) - (incl ? 0 : 1);
      const wd = mc.weekdays(d0, d1); // closed form in mathcore.wasm
      return { big: [['Days', fmtN(days, 0)], ['Years, months, days', `${y}y ${m}m ${d}d`]], rows: [['Weeks', `${plural(Math.floor(days / 7), 'week')} ${plural(days % 7, 'day')}`], ['Weekdays (Mon–Fri)', fmtN(wd, 0)], ['Hours', fmtN(days * 24, 0)], ['Minutes', fmtN(days * 1440, 0)],
        ['From', fmtD(a)], ['To', fmtD(b)]], extra: a0 > b0 ? note('"From" is the later date — the span is counted from the earlier one.', 'info') : undefined };
    });
    else if (mode === 'add') calcForm(body, [
      { key: 'a', label: 'Start date', type: 'date', value: today() },
      { key: 'op', label: 'Operation', type: 'seg', value: '+', options: [['+', 'Add'], ['-', 'Subtract']] },
      { key: 'y', label: 'Years', value: 0 }, { key: 'm', label: 'Months', value: 0 }, { key: 'w', label: 'Weeks', value: 0 }, { key: 'd', label: 'Days', value: 30 },
    ], (v) => {
      const a = pickD(v.a, 'Start date');
      const nz = (x: number) => (Number.isNaN(x) || x === undefined ? 0 : x);          // an empty box counts as 0
      const r = addSpan(a, v.op === '-' ? -1 : 1, nz(v.y), nz(v.m), nz(v.w), nz(v.d));    // months first, clamped to the month end
      const n = daysBetween(a, r);
      return { big: [['Result', fmtD(r)]], rows: [['ISO date', isoD(r)], ['That is', n === 0 ? 'the same day' : `${plural(Math.abs(n), 'day')} ${n > 0 ? 'later' : 'earlier'}`]] };
    });
    else calcForm(body, [
      { key: 'dob', label: 'Date of birth', type: 'date', value: '1990-01-01' },
      { key: 'on', label: 'Age on', type: 'date', value: today() },
    ], (v) => {
      if (!v.dob || !v.on) throw new Error('Pick both dates.');
      const a = pickD(v.dob, 'Date of birth'), b = pickD(v.on, 'Age on');
      if (b < a) throw new Error('The "age on" date is before the birth date.');
      const { y, m, d } = ymd(a, b), next = nextBirthday(a, b), days = daysBetween(a, b), wait = daysBetween(b, next);
      const leapDay = a.getUTCMonth() === 1 && a.getUTCDate() === 29 && next.getUTCDate() === 28;
      return { big: [['Age', `${plural(y, 'year')} ${plural(m, 'month')} ${plural(d, 'day')}`]], rows: [['Born on', fmtD(a)], ['Total months', `${fmtN(12 * y + m, 0)} and ${plural(d, 'day')}`], ['Total weeks', `${fmtN(Math.floor(days / 7), 0)} and ${plural(days % 7, 'day')}`], ['Total days', fmtN(days, 0)],
        ['Next birthday', `${fmtD(next)} (${wait ? `in ${plural(wait, 'day')}` : 'today'}${leapDay ? '; 29 February is kept on the 28th in other years' : ''})`], ['Turning', String(daysBetween(a, next) === 0 ? 0 : ymd(a, next).y)]] };
    });
  };
  root.append(card(null, segmented([['diff', 'Days between dates'], ['add', 'Add / subtract'], ['age', 'Age']], mode, (v) => { mode = v; render(); })), body);
  render();
};

// ------------------------------------------------------------------ EMI
export const emi: Mount = async (root) => {
  const m = await mathcore();
  calcForm(root, [
    { key: 'p', label: 'Loan amount', value: 2500000, unit: '₹' },
    { key: 'r', label: 'Interest rate', value: 8.5, unit: '% p.a.', step: 0.05 },
    { key: 'n', label: 'Tenure', value: 20, unit: (v) => (v.unit === 'm' ? 'months' : 'years') },
    { key: 'unit', label: 'Tenure in', type: 'seg', value: 'y', options: [['y', 'Years'], ['m', 'Months']] },
  ], (v) => {
    need(v.p, v.r, v.n);
    const e = emiPlan(m, v.p, v.r, v.n, v.unit), pp = e.principalShare, part = e.months % 12;
    const rows = e.years.map((y, i) => h('tr', null, h('td', null, `Year ${i + 1}${part && i === e.years.length - 1 ? ` (${span(part)})` : ''}`), h('td', { class: 'num' }, fmtINR(y.principal)), h('td', { class: 'num' }, fmtINR(y.interest)), h('td', { class: 'num' }, fmtINR(y.balance))));
    return {
      big: [['Monthly EMI', fmtINR(Math.round(e.emi))], ['Total interest', fmtINR(Math.round(e.interest))], ['Total payment', fmtINR(Math.round(e.total))]],
      rows: [['Instalments', `${e.months.toLocaleString('en-IN')} monthly${e.months >= 12 ? ` (${span(e.months)})` : ''}`]],
      notes: e.rounded ? [`Instalments are monthly, so the tenure is counted as ${span(e.months)}.`] : [],
      extra: [h('div', { class: 'bar' }, h('span', { style: { width: `${pp}%`, background: 'var(--accent)' } }), h('span', { style: { width: `${100 - pp}%`, background: 'var(--warn)' } })),
        h('div', { class: 'legend' }, h('span', null, h('i', { style: { background: 'var(--accent)' } }), `Principal ${pp.toFixed(1)}%`), h('span', null, h('i', { style: { background: 'var(--warn)' } }), `Interest ${(100 - pp).toFixed(1)}%`)),
        h('details', { class: 'mt' }, h('summary', null, 'Year-by-year schedule'), h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Year'), h('th', { class: 'num' }, 'Principal'), h('th', { class: 'num' }, 'Interest'), h('th', { class: 'num' }, 'Balance'))), h('tbody', null, rows))))],
    };
  });
};

// ------------------------------------------------------------------ GST
export const gst: Mount = (root) => {
  calcForm(root, [
    { key: 'amt', label: 'Amount', value: 1000, unit: '₹' },
    { key: 'rate', label: 'GST rate', type: 'seg', value: '18', options: [['0.25', '0.25%'], ['3', '3%'], ['5', '5%'], ['12', '12%'], ['18', '18%'], ['28', '28%'], ['40', '40%']] },
    { key: 'mode', label: 'Amount is', type: 'seg', value: 'ex', options: [['ex', 'Before GST (add)'], ['in', 'Including GST (remove)']] },
    { key: 'kind', label: 'Supply', type: 'seg', value: 'intra', options: [['intra', 'Within state (CGST+SGST)'], ['inter', 'Inter-state (IGST)']] },
  ], (v) => {
    need(v.amt);
    const r = parseFloat(v.rate) / 100;
    const base = v.mode === 'ex' ? v.amt : v.amt / (1 + r), tax = base * r, total = base + tax;
    return {
      big: [['Total (incl. GST)', fmtINR(total)], ['GST amount', fmtINR(tax)], ['Base (excl. GST)', fmtINR(base)]],
      rows: v.kind === 'intra' ? [['CGST (' + parseFloat(v.rate) / 2 + '%)', fmtINR(tax / 2)], ['SGST (' + parseFloat(v.rate) / 2 + '%)', fmtINR(tax / 2)]] : [['IGST (' + v.rate + '%)', fmtINR(tax)]],
    };
  });
};

// ------------------------------------------------------------------ SIP
export const sip: Mount = async (root) => {
  const m = await mathcore();
  calcForm(root, [
    { key: 'mode', label: 'Investment', type: 'seg', value: 'sip', options: [['sip', 'Monthly SIP'], ['lump', 'Lumpsum']] },
    { key: 'amt', label: 'Amount', value: 10000, unit: '₹' },
    { key: 'r', label: 'Expected return', value: 12, unit: '% p.a.', step: 0.5 },
    { key: 'y', label: 'Period', value: 15, unit: 'years' },
    { key: 'step', label: 'Annual step-up (SIP)', value: 0, unit: '%' },
  ], (v) => {
    need(v.amt, v.r, v.y);
    const { invested, value } = m.sip(v.amt, v.r, v.y, v.step || 0, v.mode === 'lump'); // nominal r/12 — the AMFI/Groww convention
    return { big: [['Maturity value', fmtINR(Math.round(value))], ['Invested', fmtINR(Math.round(invested))], ['Gains', fmtINR(Math.round(value - invested))]], rows: [['Wealth multiple', `${fmtN(value / invested, 2)}×`]] };
  });
};

// ------------------------------------------------------------------ FD / RD
export const fd: Mount = async (root) => {
  const m = await mathcore();
  calcForm(root, [
    { key: 'kind', label: 'Deposit', type: 'seg', value: 'fd', options: [['fd', 'Fixed deposit'], ['rd', 'Recurring deposit']] },
    { key: 'amt', label: 'Amount (FD) / monthly instalment (RD)', value: 100000, unit: '₹' },
    { key: 'r', label: 'Interest rate', value: 7, unit: '% p.a.', step: 0.05 },
    { key: 'y', label: 'Tenure', value: 5, unit: 'years', step: 0.25 },
    { key: 'comp', label: 'Compounding', type: 'select', value: '4', options: [['4', 'Quarterly (usual)'], ['12', 'Monthly'], ['2', 'Half-yearly'], ['1', 'Yearly'], ['0', 'Simple interest']] },
  ], (v) => {
    need(v.amt, v.r, v.y);
    const n = parseInt(v.comp), r = v.r / 100;
    const { invested, value } = m.fd(v.amt, v.r, v.y, n, v.kind === 'rd');
    return { big: [['Maturity value', fmtINR(Math.round(value))], ['Interest earned', fmtINR(Math.round(value - invested))], ['Invested', fmtINR(Math.round(invested))]], rows: [['Effective annual yield', n ? `${fmtN((Math.pow(1 + r / n, n) - 1) * 100, 3)}%` : `${v.r}% (simple)`]] };
  });
};

// ------------------------------------------------------------------ Percentage
export const percent: Mount = (root) => {
  const rows: Array<[string, (a: number, b: number) => string, string, string]> = [
    ['What is A% of B?', (a, b) => fmtN((a / 100) * b, 6), '15', '2400'],
    ['A is what % of B?', (a, b) => `${fmtN((a / b) * 100, 6)}%`, '45', '60'],
    ['% change from A to B', (a, b) => `${b >= a ? '+' : ''}${fmtN(((b - a) / a) * 100, 6)}%`, '80', '100'],
    ['A increased by B%', (a, b) => fmtN(a * (1 + b / 100), 6), '500', '18'],
    ['A decreased by B% (discount)', (a, b) => fmtN(a * (1 - b / 100), 6), '1999', '30'],
    ['A is B% of what?', (a, b) => fmtN(a / (b / 100), 6), '30', '20'],
  ];
  root.append(...rows.map(([label, f, da, db]) => {
    const a = input({ type: 'number', value: da }), b = input({ type: 'number', value: db });
    const out = h('div', { class: 'pct-out' });
    const run = () => { const x = parseFloat(a.value), y = parseFloat(b.value), r = isFinite(x) && isFinite(y) ? f(x, y) : '—'; out.textContent = r.includes('—') ? '—' : r; }; // e.g. ÷ 0 → no '—%'
    a.addEventListener('input', run); b.addEventListener('input', run); run();
    return card(label, h('div', { class: 'pct-row' }, field('A', a), field('B', b), h('button', { class: 'big-result', type: 'button', onclick: () => copy(out.textContent || '') }, h('span', { class: 'big-label' }, 'Answer'), h('span', { class: 'big-value' }, out))));
  }));
};

// ------------------------------------------------------------------ Number to words
export const words: Mount = async (root) => {
  const m = await mathcore();
  calcForm(root, [
    { key: 'n', label: 'Amount', type: 'text', value: '1234567.50', placeholder: 'e.g. 125000' },
    { key: 'sys', label: 'System', type: 'seg', value: 'in', options: [['in', 'Indian (lakh, crore)'], ['intl', 'International (million)']] },
    { key: 'cur', label: 'Currency', type: 'seg', value: 'inr', options: [['inr', 'Rupees'], ['usd', 'Dollars'], ['none', 'Plain number']] },
  ], (v) => {
    const s = String(v.n).replace(/[,\s₹$]/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('Enter a positive number with up to 2 decimals.');
    const [ip, fp = ''] = s.split('.');
    if (ip.length > 19) throw new Error('Number too large.');
    const int = BigInt(ip), paise = parseInt((fp + '00').slice(0, 2));
    const indian = v.sys === 'in';
    const cap = (x: string) => x.replace(/\b\w+/g, (w) => (w === 'and' ? w : w[0].toUpperCase() + w.slice(1)));
    const w = cap(m.words(int, indian)), pw = cap(m.words(BigInt(paise), indian));
    let text = w;
    if (v.cur === 'inr') text = `Rupees ${w}${paise ? ` and ${pw} Paise` : ''} Only`;
    else if (v.cur === 'usd') text = `${w} Dollars${paise ? ` and ${pw} Cents` : ''} Only`;
    else if (fp) text = `${w} point ${fp.split('').map((d) => (d === '0' ? 'zero' : m.words(BigInt(d), true))).join(' ')}`;
    const grouped = indian ? Number(int).toLocaleString('en-IN') : Number(int).toLocaleString('en-US');
    return { big: [['In words', text]], rows: [['Digits', grouped + (fp ? '.' + fp : '')]] };
  });
};

// ------------------------------------------------------------------ Time zones
const ZONES = ['Asia/Kolkata', 'UTC', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Sao_Paulo', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Kathmandu', 'Asia/Colombo', 'Australia/Sydney', 'Australia/Perth', 'Pacific/Auckland', 'Africa/Johannesburg', 'Africa/Lagos', 'Europe/Moscow', 'Asia/Riyadh', 'Asia/Seoul', 'Asia/Jakarta', 'Asia/Manila'];
function zoneOffset(zone: string, at: Date) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at);
  const g = (t: string) => +p.find((x) => x.type === t)!.value;
  return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - at.getTime()) / 60000;
}
export const timezone: Mount = (root) => {
  const all = (Intl as any).supportedValuesOf ? (Intl as any).supportedValuesOf('timeZone') as string[] : ZONES;
  const local = localZone(); // "Asia/Kolkata", not ICU's old "Asia/Calcutta" (India was listed twice)
  const opts = [...new Set([local, ...ZONES, ...all].map(modernZone))].map((z) => [z, z.replace(/_/g, ' ')] as [string, string]);
  const now = new Date();
  calcForm(root, [
    { key: 'date', label: 'Date', type: 'date', value: today() },
    { key: 'time', label: 'Time', type: 'time', value: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` },
    { key: 'from', label: 'From zone', type: 'select', value: local, options: opts },
  ], (v) => {
    if (!v.date || !v.time) throw new Error('Pick a date and time.');
    const [y, mo, d] = v.date.split('-').map(Number), [hh, mm] = v.time.split(':').map(Number);
    // wall-clock time in `from` → instant. Try the offsets in force 14 h before and after; keep those that read back as
    // the same wall time. Two = the hour repeated when clocks go back (earlier one, as java.time); none = the hour
    // skipped when clocks go forward (moved forward by the gap, as java.time).
    const wall = Date.UTC(y, mo - 1, d, hh, mm), offAt = (t: number) => zoneOffset(v.from, new Date(t));
    const cands = [...new Set([offAt(wall - 14 * 3600000), offAt(wall + 14 * 3600000)])].map((o) => wall - o * 60000);
    const valid = cands.filter((t) => t + offAt(t) * 60000 === wall).sort((p, q) => p - q);
    const at = new Date(valid[0] ?? cands[0]);
    const zoneName = v.from.replace(/_/g, ' ');
    const clockNote = valid.length > 1 ? `This time happens twice in ${zoneName} (clocks go back); the first one is used.`
      : !valid.length ? `This time does not exist in ${zoneName} (clocks go forward); it is read as ${new Intl.DateTimeFormat('en-IN', { timeZone: v.from, hour: '2-digit', minute: '2-digit', hour12: true }).format(at)}.` : '';
    const fmt = (z: string) => new Intl.DateTimeFormat('en-IN', { timeZone: z, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }).format(at);
    const off = (z: string) => { const o = zoneOffset(z, at); return `UTC${o >= 0 ? '+' : '−'}${String(Math.floor(Math.abs(o) / 60)).padStart(2, '0')}:${String(Math.abs(o) % 60).padStart(2, '0')}`; };
    return { rows: [...(clockNote ? [['Note', clockNote] as [string, string]] : []), ...[...new Set([v.from, ...ZONES])].map((z) => [`${z.replace(/_/g, ' ')} (${off(z)})`, fmt(z)] as [string, string])] };
  });
};

// ------------------------------------------------------------------ BMI
export const bmi: Mount = async (root) => {
  const m = await mathcore();
  calcForm(root, [
    { key: 'sys', label: 'Units', type: 'seg', value: 'm', options: [['m', 'Metric'], ['i', 'Imperial']] },
    { key: 'h', label: 'Height (cm or inches)', value: 170 },
    { key: 'w', label: 'Weight (kg or lb)', value: 68 },
    { key: 'asian', label: 'Cut-offs', type: 'seg', value: 'asian', options: [['asian', 'Asian / Indian'], ['who', 'WHO international']] },
  ], (v) => {
    need(v.h, v.w);
    const hm = v.sys === 'm' ? v.h / 100 : v.h * 0.0254, kg = v.sys === 'm' ? v.w : v.w * 0.45359237;
    const b = Math.round(m.bmi(kg, hm) * 10) / 10; // categorise the BMI as shown (one decimal): 76.8 kg at 1.60 m is 30.0, not 29.999…
    const cuts = v.asian === 'asian' ? [18.5, 23, 25] : [18.5, 25, 30];
    const cat = b < cuts[0] ? 'Underweight' : b < cuts[1] ? 'Normal' : b < cuts[2] ? 'Overweight' : 'Obese';
    const lo = cuts[0] * hm * hm, hi = cuts[1] * hm * hm;
    return { big: [['BMI', fmtN(b, 1)], ['Category', cat]], rows: [['Healthy weight range', `${fmtN(lo, 1)} – ${fmtN(hi, 1)} kg`], ['Cut-offs used', `<${cuts[0]} under · <${cuts[1]} normal · <${cuts[2]} over · ≥${cuts[2]} obese`]] };
  });
  root.append(note('BMI is a screening number, not a diagnosis. Indian guidelines use lower cut-offs (23 / 25).'));
};

// ------------------------------------------------------------------ Calories
export const calories: Mount = async (root) => {
  const m = await mathcore();
  calcForm(root, [
    { key: 'sex', label: 'Sex', type: 'seg', value: 'm', options: [['m', 'Male'], ['f', 'Female']] },
    { key: 'age', label: 'Age', value: 30, unit: 'years' },
    { key: 'h', label: 'Height', value: 170, unit: 'cm' },
    { key: 'w', label: 'Weight', value: 70, unit: 'kg' },
    { key: 'act', label: 'Activity', type: 'select', value: '1.375', options: [['1.2', 'Sedentary (little exercise)'], ['1.375', 'Light (1–3 days/week)'], ['1.55', 'Moderate (3–5 days/week)'], ['1.725', 'Active (6–7 days/week)'], ['1.9', 'Very active (physical job)']] },
  ], (v) => {
    need(v.age, v.h, v.w);
    const bmr = m.bmr(v.sex === 'm', v.w, v.h, v.age); // Mifflin–St Jeor (mathcore)
    const tdee = bmr * parseFloat(v.act);
    return { big: [['Maintenance (TDEE)', `${fmtN(tdee, 0)} kcal/day`], ['BMR', `${fmtN(bmr, 0)} kcal/day`]], rows: [['Mild weight loss (−0.25 kg/wk)', `${fmtN(tdee - 275, 0)} kcal`], ['Weight loss (−0.5 kg/wk)', `${fmtN(tdee - 550, 0)} kcal`], ['Weight gain (+0.25 kg/wk)', `${fmtN(tdee + 275, 0)} kcal`], ['Formula', 'Mifflin–St Jeor']] };
  });
};

// ------------------------------------------------------------------ Due date
export const duedate: Mount = (root) => {
  calcForm(root, [
    { key: 'lmp', label: 'First day of last period (LMP)', type: 'date', value: new Date(Date.now() - 70 * DAY).toISOString().slice(0, 10) },
    { key: 'cycle', label: 'Cycle length', value: 28, unit: 'days' },
  ], (v) => {
    if (!v.lmp) throw new Error('Pick the first day of the last period.');
    if (isFinite(v.cycle) && (v.cycle < 20 || v.cycle > 45)) throw new Error('Cycle length is usually 20–45 days.');
    const lmp = pickD(v.lmp, 'First day of last period'), adj = (v.cycle || 28) - 28;
    const due = new Date(lmp.getTime() + (280 + adj) * DAY);
    const todayD = parseD(today())!;
    const ga = Math.floor((todayD.getTime() - lmp.getTime()) / DAY) - adj;
    const tri = ga < 98 ? 'First trimester' : ga < 196 ? 'Second trimester' : 'Third trimester';
    return { big: [['Estimated due date', fmtD(due)], ['Today', ga >= 0 && ga < 300 ? `${Math.floor(ga / 7)} weeks ${ga % 7} days — ${tri}` : '—']], rows: [['Estimated conception', fmtD(new Date(lmp.getTime() + (14 + adj) * DAY))], ['End of first trimester', fmtD(new Date(lmp.getTime() + (97 + adj) * DAY))], ['End of second trimester', fmtD(new Date(lmp.getTime() + (195 + adj) * DAY))]] };
  });
  root.append(note('Naegele\'s rule estimate. Only ~4% of babies arrive on the due date — your doctor\'s scan dating takes precedence.'));
};

// ------------------------------------------------------------------ Tip / split
export const tip: Mount = (root) => {
  calcForm(root, [
    { key: 'bill', label: 'Bill amount', value: 2400, unit: '₹' },
    { key: 'tip', label: 'Tip', value: 10, unit: '%' },
    { key: 'people', label: 'People', value: 4 },
    { key: 'round', label: 'Round per person', type: 'seg', value: 'no', options: [['no', 'No'], ['1', 'To ₹1'], ['10', 'To ₹10']] },
  ], (v) => {
    need(v.bill, v.tip, v.people);
    const tipAmt = (v.bill * v.tip) / 100, total = v.bill + tipAmt;
    let each = total / Math.max(1, v.people);
    if (v.round !== 'no') each = Math.ceil(each / +v.round) * +v.round;
    return { big: [['Each person pays', fmtINR(each)], ['Total with tip', fmtINR(total)]], rows: [['Tip amount', fmtINR(tipAmt)], ['Collected', fmtINR(each * v.people)]] };
  });
};

// ------------------------------------------------------------------ Fuel
export const fuel: Mount = (root) => {
  calcForm(root, [
    { key: 'dist', label: 'Distance', value: 350, unit: 'km' },
    { key: 'eff', label: 'Mileage', value: 15, unit: 'km/l' },
    { key: 'price', label: 'Fuel price', value: 105, unit: '₹/l' },
    { key: 'trip', label: 'Trip', type: 'seg', value: '1', options: [['1', 'One way'], ['2', 'Round trip']] },
    { key: 'people', label: 'Split between', value: 1, unit: 'people' },
  ], (v) => {
    need(v.dist, v.eff, v.price);
    const km = v.dist * +v.trip, litres = km / v.eff, cost = litres * v.price;
    return { big: [['Fuel cost', fmtINR(cost)], ['Fuel needed', `${fmtN(litres, 1)} litres`]], rows: [['Per person', fmtINR(cost / Math.max(1, v.people || 1))], ['Cost per km', fmtINR(cost / km)], ['Total distance', `${fmtN(km, 0)} km`]] };
  });
};

// ------------------------------------------------------------------ GPA
export const gpa: Mount = (root) => {
  type Row = { g: HTMLInputElement; c: HTMLInputElement; el: HTMLElement };
  const rows: Row[] = [];
  const list = h('div', { class: 'stack' });
  const out = h('div', { class: 'big-results' });
  const scale = segmented([['10', '10-point'], ['4', '4-point']], '10', () => run());
  const add = (g = '', c = '3') => {
    const gi = input({ type: 'number', value: g, placeholder: 'Grade points', onInput: () => run() }), ci = input({ type: 'number', value: c, placeholder: 'Credits', onInput: () => run() });
    const r: Row = { g: gi, c: ci, el: h('div', { class: 'gpa-row' }, field('Grade point', gi), field('Credits', ci), button('', () => { rows.splice(rows.indexOf(r), 1); r.el.remove(); run(); }, { icon: 'Trash2', small: true, variant: 'ghost', title: 'Remove' })) };
    rows.push(r); list.append(r.el); run();
  };
  const run = () => {
    let s = 0, cs = 0;
    for (const r of rows) { const g = parseFloat(r.g.value), c = parseFloat(r.c.value); if (isFinite(g) && isFinite(c)) { s += g * c; cs += c; } }
    const v = cs ? s / cs : NaN;
    clear(out).append(h('div', { class: 'big-result' }, h('span', { class: 'big-label' }, 'GPA / CGPA'), h('span', { class: 'big-value' }, isFinite(v) ? fmtN(v, 2) : '—')),
      scale.value === '10' ? h('div', { class: 'big-result' }, h('span', { class: 'big-label' }, 'Percentage (CGPA × 9.5, CBSE/AICTE)'), h('span', { class: 'big-value' }, isFinite(v) ? `${fmtN(v * 9.5, 2)}%` : '—'))
        : h('div', { class: 'big-result' }, h('span', { class: 'big-label' }, 'Total credits'), h('span', { class: 'big-value' }, fmtN(cs, 1))));
  };
  root.append(card(null, stack(field('Scale', scale), list, button('Add subject', () => add(), { icon: 'Plus', small: true }))), card('Result', out),
    note('For SGPAs → CGPA, enter each semester\'s SGPA as the grade point and its total credits. Universities may use a different percentage formula.'));
  [['9', '4'], ['8', '3'], ['10', '2']].forEach(([g, c]) => add(g, c));
};

// ------------------------------------------------------------------ Number base
export const base: Mount = async (root) => {
  const m = await mathcore();
  const bases: Array<[number, string]> = [[2, 'Binary'], [8, 'Octal'], [10, 'Decimal'], [16, 'Hexadecimal'], [36, 'Base 36']];
  const inputs = new Map<number, HTMLInputElement>();
  const custom = input({ type: 'number', value: 3, min: 2, max: 36 });
  const customOut = input({ attrs: { spellcheck: 'false' } });
  let value = '255', valueBase = 10; // canonical value kept as digits in some base (arbitrary precision in wasm)
  const cb = () => Math.min(36, Math.max(2, parseInt(custom.value) || 2));
  const sync = (except?: HTMLInputElement) => {
    for (const [b, el] of inputs) if (el !== except) el.value = m.baseConvert(value, valueBase, b) ?? '';
    if (customOut !== except) customOut.value = m.baseConvert(value, valueBase, cb()) ?? '';
  };
  const onEdit = (el: HTMLInputElement, b: () => number) => el.addEventListener('input', () => {
    const ok = el.value.trim() && m.baseConvert(el.value, b(), 10) !== null;
    el.classList.toggle('bad', !ok);
    if (ok) { value = el.value; valueBase = b(); sync(el); }
  });
  for (const [b] of bases) {
    const el = input({ attrs: { spellcheck: 'false', inputmode: b === 10 ? 'numeric' : 'text' } });
    el.classList.add('mono');
    onEdit(el, () => b);
    inputs.set(b, el);
  }
  onEdit(customOut, cb);
  custom.addEventListener('input', () => sync());
  root.append(card(null, stack(...bases.map(([b, n]) => field(`${n} (base ${b})`, inputs.get(b)!)), h('div', { class: 'grid2' }, field('Custom base', custom), field('Value in custom base', customOut)))),
    note('Arbitrary precision (mathcore.wasm). Prefixes 0x, 0o, 0b and _ separators are accepted.'));
  sync();
};

// ------------------------------------------------------------------ Roman numerals
export const roman: Mount = async (root) => {
  const m = await mathcore();
  calcForm(root, [{ key: 'x', label: 'Number (1–3999) or Roman numeral', type: 'text', value: '2026' }], (v) => {
    const s = String(v.x).trim();
    if (/^\d+$/.test(s)) { const r = m.toRoman(+s); if (!r) throw new Error('Roman numerals cover 1–3999.'); return { big: [['Roman', r]] }; }
    const n = m.fromRoman(s);
    if (!n) throw new Error('Not a valid Roman numeral (1–3999).');
    return { big: [['Number', String(n)]] };
  });
};
