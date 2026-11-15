import { h, card, field, input, select, segmented, button, clear, stack, copy, note, type Mount } from '../ui';
import { calcForm, fmtINR, fmtN, need, today } from '../lib/form';
import { mathcore } from '../wasm/mathcore';

// ------------------------------------------------------------------ Unit converter
const UNITS: Record<string, { label: string; units: Record<string, number | [(x: number) => number, (x: number) => number]> }> = {
  length: { label: 'Length', units: { 'mm': 1e-3, 'cm': 1e-2, 'm': 1, 'km': 1e3, 'inch': 0.0254, 'foot': 0.3048, 'yard': 0.9144, 'mile': 1609.344, 'nautical mile': 1852 } },
  mass: { label: 'Weight / mass', units: { 'mg': 1e-6, 'g': 1e-3, 'kg': 1, 'tonne': 1000, 'ounce': 0.028349523125, 'pound': 0.45359237, 'stone': 6.35029318, 'carat': 2e-4, 'tola': 0.0116638 } },
  temperature: { label: 'Temperature', units: {
    '°C': [(c) => c, (c) => c], '°F': [(f) => ((f - 32) * 5) / 9, (c) => (c * 9) / 5 + 32], 'K': [(k) => k - 273.15, (c) => c + 273.15] } },
  area: { label: 'Area', units: { 'm²': 1, 'cm²': 1e-4, 'km²': 1e6, 'ft²': 0.09290304, 'in²': 0.00064516, 'yd²': 0.83612736, 'acre': 4046.8564224, 'hectare': 1e4, 'mile²': 2589988.110336, 'gaj (sq yd)': 0.83612736, 'bigha (UP, 27,000 ft²)': 2508.38 } },
  volume: { label: 'Volume', units: { 'ml': 1e-3, 'litre': 1, 'm³': 1000, 'tsp': 0.00492892, 'tbsp': 0.0147868, 'cup (US)': 0.236588, 'fl oz (US)': 0.0295735, 'pint (US)': 0.473176, 'gallon (US)': 3.78541, 'gallon (UK)': 4.54609, 'ft³': 28.3168 } },
  speed: { label: 'Speed', units: { 'm/s': 1, 'km/h': 1 / 3.6, 'mph': 0.44704, 'knot': 0.514444, 'ft/s': 0.3048 } },
  data: { label: 'Data size', units: { 'bit': 0.125, 'byte': 1, 'KB (1000)': 1e3, 'MB (1000²)': 1e6, 'GB (1000³)': 1e9, 'TB (1000⁴)': 1e12, 'KiB (1024)': 1024, 'MiB (1024²)': 1048576, 'GiB (1024³)': 1073741824, 'TiB (1024⁴)': 1099511627776 } },
  time: { label: 'Time', units: { 'ms': 1e-3, 'second': 1, 'minute': 60, 'hour': 3600, 'day': 86400, 'week': 604800, 'month (avg)': 2629746, 'year (365.2425 d)': 31556952 } },
  pressure: { label: 'Pressure', units: { 'Pa': 1, 'kPa': 1e3, 'bar': 1e5, 'atm': 101325, 'psi': 6894.757, 'mmHg': 133.322 } },
  energy: { label: 'Energy', units: { 'J': 1, 'kJ': 1e3, 'cal': 4.184, 'kcal': 4184, 'Wh': 3600, 'kWh (unit)': 3.6e6, 'BTU': 1055.06, 'eV': 1.602176634e-19 } },
  power: { label: 'Power', units: { 'W': 1, 'kW': 1e3, 'hp (metric)': 735.49875, 'hp (mech)': 745.69987 } },
  fuel: { label: 'Fuel economy', units: { 'km/l': [(x) => x, (x) => x], 'l/100km': [(x) => 100 / x, (x) => 100 / x], 'mpg (US)': [(x) => x * 0.425144, (x) => x / 0.425144], 'mpg (UK)': [(x) => x * 0.354006, (x) => x / 0.354006] } },
};

export const units: Mount = (root) => {
  let cat = 'length';
  const catSel = select(Object.entries(UNITS).map(([k, v]) => [k, v.label]), cat, (v) => { cat = v; fill(); });
  const val = input({ type: 'number', value: 1, onInput: () => run() });
  const from = h('select', { class: 'input select', onchange: () => run() });
  const to = h('select', { class: 'input select', onchange: () => run() });
  const big = h('div', { class: 'big-results' });
  const table = h('div', { class: 'kv' });
  const toBase = (u: string, x: number) => { const f = UNITS[cat].units[u]; return typeof f === 'number' ? x * f : f[0](x); };
  const fromBase = (u: string, x: number) => { const f = UNITS[cat].units[u]; return typeof f === 'number' ? x / f : f[1](x); };
  const fill = () => {
    const us = Object.keys(UNITS[cat].units);
    from.replaceChildren(...us.map((u) => h('option', { value: u }, u)));
    to.replaceChildren(...us.map((u) => h('option', { value: u }, u)));
    to.value = us[Math.min(1, us.length - 1)];
    if (cat === 'length') { from.value = 'km'; to.value = 'mile'; }
    if (cat === 'temperature') { from.value = '°C'; to.value = '°F'; }
    if (cat === 'mass') { from.value = 'kg'; to.value = 'pound'; }
    run();
  };
  const run = () => {
    const x = parseFloat(val.value);
    clear(big); clear(table);
    if (!isFinite(x)) return;
    const base = toBase(from.value, x);
    const r = fromBase(to.value, base);
    big.append(h('button', { class: 'big-result', type: 'button', onclick: () => copy(fmtN(r, 10)) }, h('span', { class: 'big-label' }, `${fmtN(x, 10)} ${from.value} =`), h('span', { class: 'big-value' }, `${fmtN(r, 8)} ${to.value}`)));
    table.append(...Object.keys(UNITS[cat].units).flatMap((u) => [h('span', null, u), h('span', null, fmtN(fromBase(u, base), 8))]));
  };
  root.append(card(null, stack(field('Quantity', catSel), h('div', { class: 'form-grid' }, field('Value', val), field('From', from), field('To', to)),
    button('Swap', () => { const t = from.value; from.value = to.value; to.value = t; run(); }, { small: true, icon: 'ArrowLeftRight' }))),
    card('Result', big, table));
  fill();
};

// ------------------------------------------------------------------ Dates
const DAY = 86400000;
const parseD = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmtD = (d: Date) => d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
function ymd(a: Date, b: Date) {
  let [s, e] = a <= b ? [a, b] : [b, a];
  let y = e.getUTCFullYear() - s.getUTCFullYear(), m = e.getUTCMonth() - s.getUTCMonth(), d = e.getUTCDate() - s.getUTCDate();
  if (d < 0) { m--; d += new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), 0)).getUTCDate(); }
  if (m < 0) { y--; m += 12; }
  return { y, m, d };
}
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
      const a = parseD(v.a), b = parseD(v.b);
      const days = Math.round(Math.abs(b.getTime() - a.getTime()) / DAY) + (v.incl === 'yes' ? 1 : 0);
      const { y, m, d } = ymd(a, b);
      const d0 = Math.round(Math.min(a.getTime(), b.getTime()) / DAY), d1 = Math.round(Math.max(a.getTime(), b.getTime()) / DAY) - (v.incl === 'yes' ? 0 : 1);
      const wd = mc.weekdays(d0, d1); // closed form in mathcore.wasm
      return { big: [['Days', fmtN(days, 0)], ['Years, months, days', `${y}y ${m}m ${d}d`]], rows: [['Weeks', `${Math.floor(days / 7)} weeks ${days % 7} days`], ['Weekdays (Mon–Fri)', fmtN(wd, 0)], ['Hours', fmtN(days * 24, 0)], ['Minutes', fmtN(days * 1440, 0)]] };
    });
    else if (mode === 'add') calcForm(body, [
      { key: 'a', label: 'Start date', type: 'date', value: today() },
      { key: 'op', label: 'Operation', type: 'seg', value: '+', options: [['+', 'Add'], ['-', 'Subtract']] },
      { key: 'y', label: 'Years', value: 0 }, { key: 'm', label: 'Months', value: 0 }, { key: 'w', label: 'Weeks', value: 0 }, { key: 'd', label: 'Days', value: 30 },
    ], (v) => {
      const s = v.op === '-' ? -1 : 1, a = parseD(v.a);
      const r = new Date(Date.UTC(a.getUTCFullYear() + s * (v.y || 0), a.getUTCMonth() + s * (v.m || 0), a.getUTCDate() + s * ((v.d || 0) + 7 * (v.w || 0))));
      return { big: [['Result', fmtD(r)]], rows: [['ISO date', r.toISOString().slice(0, 10)]] };
    });
    else calcForm(body, [
      { key: 'dob', label: 'Date of birth', type: 'date', value: '1990-01-01' },
      { key: 'on', label: 'Age on', type: 'date', value: today() },
    ], (v) => {
      const a = parseD(v.dob), b = parseD(v.on);
      if (b < a) throw new Error('The "age on" date is before the birth date.');
      const { y, m, d } = ymd(a, b);
      let next = new Date(Date.UTC(b.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()));
      if (next < b) next = new Date(Date.UTC(b.getUTCFullYear() + 1, a.getUTCMonth(), a.getUTCDate()));
      const days = Math.round((b.getTime() - a.getTime()) / DAY);
      return { big: [['Age', `${y} years ${m} months ${d} days`]], rows: [['Born on', fmtD(a)], ['Total days', fmtN(days, 0)], ['Total weeks', fmtN(Math.floor(days / 7), 0)], ['Next birthday', `${fmtD(next)} (in ${Math.round((next.getTime() - b.getTime()) / DAY)} days)`]] };
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
    { key: 'n', label: 'Tenure', value: 20, unit: 'years' },
    { key: 'unit', label: 'Tenure in', type: 'seg', value: 'y', options: [['y', 'Years'], ['m', 'Months']] },
  ], (v) => {
    need(v.p, v.r, v.n);
    const months = Math.round(v.unit === 'y' ? v.n * 12 : v.n);
    const e = m.emi(v.p, v.r, months), total = e * months, interest = total - v.p;
    const rows = m.amortizeYearly(v.p, v.r, months).map((y, i) => h('tr', null, h('td', null, `Year ${i + 1}`), h('td', { class: 'num' }, fmtINR(y.principal)), h('td', { class: 'num' }, fmtINR(y.interest)), h('td', { class: 'num' }, fmtINR(y.balance))));
    const pp = (v.p / total) * 100;
    return {
      big: [['Monthly EMI', fmtINR(Math.round(e))], ['Total interest', fmtINR(Math.round(interest))], ['Total payment', fmtINR(Math.round(total))]],
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
    const run = () => { const x = parseFloat(a.value), y = parseFloat(b.value); out.textContent = isFinite(x) && isFinite(y) ? f(x, y) : '—'; };
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
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const opts = [...new Set([local, ...ZONES, ...all])].map((z) => [z, z.replace(/_/g, ' ')] as [string, string]);
  const now = new Date();
  calcForm(root, [
    { key: 'date', label: 'Date', type: 'date', value: today() },
    { key: 'time', label: 'Time', type: 'time', value: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` },
    { key: 'from', label: 'From zone', type: 'select', value: local, options: opts },
  ], (v) => {
    if (!v.date || !v.time) throw new Error('Pick a date and time.');
    const [y, mo, d] = v.date.split('-').map(Number), [hh, mm] = v.time.split(':').map(Number);
    let utc = Date.UTC(y, mo - 1, d, hh, mm);
    utc -= zoneOffset(v.from, new Date(utc)) * 60000;
    utc -= (zoneOffset(v.from, new Date(utc)) - zoneOffset(v.from, new Date(utc))) * 60000;
    const at = new Date(utc);
    const fmt = (z: string) => new Intl.DateTimeFormat('en-IN', { timeZone: z, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }).format(at);
    const off = (z: string) => { const o = zoneOffset(z, at); return `UTC${o >= 0 ? '+' : '−'}${String(Math.floor(Math.abs(o) / 60)).padStart(2, '0')}:${String(Math.abs(o) % 60).padStart(2, '0')}`; };
    return { rows: [...new Set([v.from, ...ZONES])].map((z) => [`${z.replace(/_/g, ' ')} (${off(z)})`, fmt(z)] as [string, string]) };
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
    const b = m.bmi(kg, hm);
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
    const lmp = parseD(v.lmp), adj = (v.cycle || 28) - 28;
    const due = new Date(lmp.getTime() + (280 + adj) * DAY);
    const todayD = parseD(today());
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
