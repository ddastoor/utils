import { h, note, type Mount } from '../ui';
import { calcForm, fmtINR, fmtN, need } from '../lib/form';
import { prepayPlan, ppfPlan, epfPlan, npsPlan, inflation as infl, span } from '../lib/finance';
import { plural } from '../lib/dates';
import { mathcore } from '../wasm/mathcore';

// ------------------------------------------------------------------ Loan prepayment
export const prepay: Mount = async (root) => {
  const m = await mathcore();
  calcForm(root, [
    { key: 'p', label: 'Outstanding principal', value: 2500000, unit: '₹' },
    { key: 'r', label: 'Interest rate', value: 8.5, unit: '% p.a.', step: 0.05 },
    { key: 'n', label: 'Remaining tenure', value: 20, unit: 'years' },
    { key: 'pp', label: 'Prepayment amount', value: 200000, unit: '₹' },
    { key: 'when', label: 'Prepay after', value: 12, unit: 'months', hint: '0 = now, before the next instalment' },
    { key: 'freq', label: 'Prepayment', type: 'seg', value: 'once', options: [['once', 'One time'], ['yearly', 'Every year']] },
    { key: 'keep', label: 'After prepaying, keep', type: 'seg', value: 'emi', options: [['emi', 'Same EMI (shorter tenure)'], ['tenure', 'Same tenure (lower EMI)']] },
  ], (v) => {
    need(v.p, v.r, v.n, v.pp, v.when);
    const x = prepayPlan(m, v.p, v.r, v.n, v.pp, v.when, v.freq === 'yearly', v.keep === 'tenure');
    const sooner = x.monthsSaved ? `${span(x.monthsSaved)} earlier` : 'No earlier';
    return {
      big: [['Interest saved', fmtINR(Math.round(x.baseInterest) - Math.round(x.interest))], v.keep === 'emi' || x.paidOff ? ['Loan ends', sooner] : ['New EMI', fmtINR(Math.round(x.newEmi))]],
      rows: [['Original EMI', fmtINR(Math.round(x.emi))], ['Interest without prepayment', fmtINR(Math.round(x.baseInterest))], ['Interest with prepayment', fmtINR(Math.round(x.interest))],
        ['Prepaid in all', fmtINR(Math.round(x.prepaid))], ['Months to close', `${x.monthsTaken.toLocaleString('en-IN')} (was ${x.months.toLocaleString('en-IN')})`]],
      notes: x.paidOff ? [`${v.freq === 'yearly' ? 'A prepayment' : 'The prepayment'} pays the loan off: only what was still owed is counted.`] : [],
    };
  });
  root.append(note('Floating-rate home loans in India have no prepayment penalty for individuals (RBI). Check your lender for fixed-rate loans.'));
};

// ------------------------------------------------------------------ PPF
export const ppf: Mount = async (root) => {
  const m = await mathcore();
  calcForm(root, [
    { key: 'amt', label: 'Yearly deposit (₹500 – ₹1.5 lakh)', value: 150000, unit: '₹' },
    { key: 'r', label: 'Interest rate (current notified rate)', value: 7.1, unit: '% p.a.', step: 0.05 },
    { key: 'y', label: 'Years', value: 15, unit: 'years', hint: '15-year lock-in, extendable in 5-year blocks' },
  ], (v) => {
    need(v.amt, v.r, v.y);
    const x = ppfPlan(m, v.amt, v.r, v.y); // deposited before 5 April each year
    const bal = Math.round(x.balance), inv = Math.round(x.invested);
    return {
      big: [['Maturity value', fmtINR(bal)], ['Interest earned', fmtINR(bal - inv)], ['Total deposited', fmtINR(inv)]],
      rows: [['Tax status', 'EEE — deposit (80C), interest and maturity tax-free']],
      notes: x.atMaturity ? [] : [`A PPF account matures after 15 years and can then be extended 5 years at a time — this is the balance after ${plural(x.years, 'year')}.`],
    };
  });
  root.append(note('Assumes the yearly deposit is made before 5 April and the rate stays constant. The government revises the rate every quarter.'));
};

// ------------------------------------------------------------------ EPF
export const epf: Mount = async (root) => {
  const m = await mathcore();
  calcForm(root, [
    { key: 'basic', label: 'Monthly basic + DA', value: 50000, unit: '₹' },
    { key: 'age', label: 'Current age', value: 30, unit: 'years' },
    { key: 'ret', label: 'Retirement age', value: 58, unit: 'years' },
    { key: 'bal', label: 'Current EPF balance', value: 0, unit: '₹' },
    { key: 'inc', label: 'Yearly salary increase', value: 6, unit: '%' },
    { key: 'r', label: 'EPF interest rate', value: 8.25, unit: '% p.a.', step: 0.05 },
  ], (v) => {
    need(v.basic, v.age, v.ret, v.r);
    const x = epfPlan(m, v.basic, v.age, v.ret, v.bal, v.inc, v.r);
    const corpus = Math.round(x.corpus), own = Math.round(x.own), employer = Math.round(x.employer), opening = Math.round(x.opening);
    return {
      big: [['EPF corpus at retirement', fmtINR(corpus)], ['Your + employer contributions', fmtINR(own + employer)]],
      rows: [['Your 12 %', fmtINR(own)], ['Employer\'s share into EPF', fmtINR(employer)], ['Interest earned', fmtINR(corpus - own - employer - opening)], ['Employer\'s share into the pension scheme (EPS, not in the corpus)', fmtINR(Math.round(x.eps))], ['Years', String(x.years)]],
    };
  });
  root.append(note('12% of basic + DA from you; your employer adds 12%, of which 8.33% of pay up to ₹15,000 goes to the pension scheme (EPS). As the EPFO does it: interest is worked out each month on the balance the month opened with and credited once a year.'));
};

// ------------------------------------------------------------------ NPS
export const nps: Mount = async (root) => {
  const m = await mathcore();
  calcForm(root, [
    { key: 'amt', label: 'Monthly contribution', value: 10000, unit: '₹' },
    { key: 'age', label: 'Current age', value: 30, unit: 'years' },
    { key: 'r', label: 'Expected return', value: 10, unit: '% p.a.', step: 0.5 },
    { key: 'sector', label: 'Subscriber', type: 'seg', value: 'other', options: [['other', 'Private / all citizens'], ['gov', 'Government']] },
    { key: 'ann', label: 'Annuity purchase', value: 40, unit: '%', hint: 'At least 20 % (government: 40 %)' },
    { key: 'ar', label: 'Annuity rate', value: 6, unit: '% p.a.', step: 0.25 },
  ], (v) => {
    need(v.amt, v.age, v.r, v.ann, v.ar);
    const x = npsPlan(m, v.amt, v.age, v.r, v.sector, v.ann, v.ar);
    const corpus = Math.round(x.corpus), lump = Math.round(x.lump);
    return {
      big: [['Corpus at 60', fmtINR(corpus)], ['Monthly pension', fmtINR(Math.round(x.pension))]],
      rows: [['Lump sum', fmtINR(lump)], ['Used to buy annuity', fmtINR(corpus - lump)], ['Total invested', fmtINR(Math.round(x.invested))], ['Contributions', `${x.months.toLocaleString('en-IN')} monthly (${span(x.months)})`]],
      notes: v.sector === 'other' && x.corpus <= 800000 ? ['A corpus of up to ₹8 lakh may be taken out in full by non-government subscribers — no annuity is required.'] : [],
    };
  });
  root.append(note('At 60, part of the corpus must buy an annuity (the pension): at least 40% for government subscribers, at least 20% for everyone else since PFRDA\'s exit rules of December 2025. The lump sum is tax-free up to 60% of the corpus. Rules change — check the current ones with PFRDA or your NPS provider.'));
};

// ------------------------------------------------------------------ Inflation
export const inflation: Mount = async (root) => {
  const m = await mathcore();
  calcForm(root, [
    { key: 'amt', label: 'Amount today', value: 100000, unit: '₹' },
    { key: 'r', label: 'Inflation rate', value: 6, unit: '% p.a.', step: 0.1 },
    { key: 'y', label: 'Years', value: 20, unit: 'years' },
  ], (v) => {
    need(v.amt, v.r, v.y);
    const x = infl(m, v.amt, v.r, v.y), down = v.r < 0;
    return {
      big: [['Future cost of the same things', fmtINR(Math.round(x.future))], ['Today\'s money is worth (in future)', fmtINR(Math.round(x.worth))]],
      rows: [[down ? 'Purchasing power gained' : 'Purchasing power lost', `${fmtN(Math.abs(x.lostPct), 1)}%`], ['Prices multiply by', `${fmtN(x.factor, 2)}×`],
        [down ? 'Years for prices to halve' : 'Years for prices to double', x.doubling === null ? 'Never — prices stay as they are' : fmtN(x.doubling, 1)]],
    };
  });
};

// ------------------------------------------------------------------ Sleep cycle
export const sleep: Mount = (root) => {
  const now = new Date();
  calcForm(root, [
    { key: 'mode', label: 'I want to', type: 'seg', value: 'wake', options: [['wake', 'Wake up at…'], ['bed', 'Go to bed at…']] },
    { key: 't', label: 'Time', type: 'time', value: '06:30' },
    { key: 'fall', label: 'Time to fall asleep', value: 15, unit: 'min' },
  ], (v) => {
    const [hh, mm] = String(v.t || `${now.getHours()}:${now.getMinutes()}`).split(':').map(Number);
    const base = hh * 60 + mm, fall = v.fall || 0;
    const fmt = (m: number) => { const t = ((m % 1440) + 1440) % 1440; const d = new Date(2000, 0, 1, Math.floor(t / 60), t % 60); return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
    const cycles = [6, 5, 4, 3];
    const times = cycles.map((c) => (v.mode === 'wake' ? fmt(base - c * 90 - fall) : fmt(base + fall + c * 90)));
    return {
      big: [[v.mode === 'wake' ? 'Go to bed at' : 'Set alarm for', times.slice(0, 2).join('  or  ')]],
      rows: cycles.map((c, i) => [`${c} cycles (${(c * 1.5).toString()} h sleep)`, times[i]] as [string, string]),
    };
  });
  root.append(note('Sleep runs in ~90-minute cycles; waking between cycles feels easier. Adults need 7–9 hours (5–6 cycles).'));
};

// ------------------------------------------------------------------ Body fat (US Navy)
export const bodyfat: Mount = async (root) => {
  const m = await mathcore();
  calcForm(root, [
    { key: 'sex', label: 'Sex', type: 'seg', value: 'm', options: [['m', 'Male'], ['f', 'Female']] },
    { key: 'h', label: 'Height', value: 175, unit: 'cm' },
    { key: 'neck', label: 'Neck', value: 38, unit: 'cm' },
    { key: 'waist', label: 'Waist (at navel)', value: 85, unit: 'cm' },
    { key: 'hip', label: 'Hip (women)', value: 95, unit: 'cm' },
    { key: 'w', label: 'Weight', value: 75, unit: 'kg' },
  ], (v) => {
    need(v.h, v.neck, v.waist);
    const bf = m.bodyfat(v.sex === 'm', v.h, v.neck, v.waist, v.hip);
    if (!isFinite(bf) || bf <= 0) throw new Error('Check the measurements (waist must be larger than neck).');
    const cat = v.sex === 'm' ? (bf < 6 ? 'Essential fat' : bf < 14 ? 'Athletic' : bf < 18 ? 'Fit' : bf < 25 ? 'Average' : 'Obese') : (bf < 14 ? 'Essential fat' : bf < 21 ? 'Athletic' : bf < 25 ? 'Fit' : bf < 32 ? 'Average' : 'Obese');
    return { big: [['Body fat', `${fmtN(bf, 1)}%`], ['Category (ACE)', cat]], rows: isFinite(v.w) ? [['Fat mass', `${fmtN((v.w * bf) / 100, 1)} kg`], ['Lean mass', `${fmtN(v.w * (1 - bf / 100), 1)} kg`]] : [] };
  });
};

// ------------------------------------------------------------------ Ideal weight
export const idealweight: Mount = async (root) => {
  const m = await mathcore();
  calcForm(root, [
    { key: 'sex', label: 'Sex', type: 'seg', value: 'm', options: [['m', 'Male'], ['f', 'Female']] },
    { key: 'h', label: 'Height', value: 170, unit: 'cm' },
  ], (v) => {
    need(v.h);
    const w = m.idealWeight(v.sex === 'm', v.h);
    const f = { 'Devine (1974)': w.devine, 'Robinson (1983)': w.robinson, 'Miller (1983)': w.miller, 'Hamwi (1964)': w.hamwi };
    const hm = v.h / 100;
    return { big: [['Healthy BMI range (Asian 18.5–23)', `${fmtN(18.5 * hm * hm, 1)} – ${fmtN(23 * hm * hm, 1)} kg`]], rows: Object.entries(f).map(([k, x]) => [k, `${fmtN(x, 1)} kg`] as [string, string]) };
  });
};

// ------------------------------------------------------------------ Coordinates
function parseCoord(s: string, isLat: boolean): number {
  const t = s.trim().toUpperCase();
  if (!t) throw new Error('Enter coordinates.');
  const neg = /[SW]/.test(t) || t.startsWith('-');
  const nums = t.match(/\d+(\.\d+)?/g)?.map(Number) || [];
  if (!nums.length) throw new Error(`Can't read "${s}".`);
  const v = nums[0] + (nums[1] || 0) / 60 + (nums[2] || 0) / 3600;
  const r = neg ? -v : v;
  if (Math.abs(r) > (isLat ? 90 : 180)) throw new Error(`${isLat ? 'Latitude' : 'Longitude'} out of range.`);
  return r;
}
const toDMS = (v: number, isLat: boolean) => {
  const a = Math.abs(v), d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), s = (mf - m) * 60;
  return `${d}° ${m}′ ${s.toFixed(2)}″ ${isLat ? (v >= 0 ? 'N' : 'S') : v >= 0 ? 'E' : 'W'}`;
};
export const coords: Mount = async (root) => {
  const m = await mathcore();
  calcForm(root, [
    { key: 'lat1', label: 'Point A latitude', type: 'text', value: '28.6139', placeholder: '28.6139 or 28° 36′ 50″ N' },
    { key: 'lon1', label: 'Point A longitude', type: 'text', value: '77.2090' },
    { key: 'lat2', label: 'Point B latitude (optional)', type: 'text', value: '19.0760' },
    { key: 'lon2', label: 'Point B longitude (optional)', type: 'text', value: '72.8777' },
  ], (v) => {
    const a = [parseCoord(v.lat1, true), parseCoord(v.lon1, false)];
    const rows: Array<[string, string]> = [['A (decimal)', `${a[0].toFixed(6)}, ${a[1].toFixed(6)}`], ['A (DMS)', `${toDMS(a[0], true)}, ${toDMS(a[1], false)}`]];
    if (!String(v.lat2).trim() || !String(v.lon2).trim()) return { rows };
    const b = [parseCoord(v.lat2, true), parseCoord(v.lon2, false)];
    const { km, bearing: brg } = m.haversine(a[0], a[1], b[0], b[1]);
    rows.push(['B (decimal)', `${b[0].toFixed(6)}, ${b[1].toFixed(6)}`], ['B (DMS)', `${toDMS(b[0], true)}, ${toDMS(b[1], false)}`]);
    return { big: [['Distance (great circle)', `${fmtN(km, 2)} km`], ['Initial bearing', `${fmtN(brg, 1)}°`]], rows: [['Miles', fmtN(km * 0.621371, 2)], ['Nautical miles', fmtN(km / 1.852, 2)], ...rows] };
  });
  root.append(h('p', { class: 'muted small' }, 'Accepts decimal degrees (−12.5) or degrees-minutes-seconds with N/S/E/W. Haversine on a mean-radius sphere (±0.5%).'));
};
