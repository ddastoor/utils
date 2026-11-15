import { h, note, type Mount } from '../ui';
import { calcForm, fmtINR, fmtN, need } from '../lib/form';
import { emiCalc } from './calculators';

// ------------------------------------------------------------------ Loan prepayment
export const prepay: Mount = (root) => {
  calcForm(root, [
    { key: 'p', label: 'Outstanding principal', value: 2500000, unit: '₹' },
    { key: 'r', label: 'Interest rate', value: 8.5, unit: '% p.a.', step: 0.05 },
    { key: 'n', label: 'Remaining tenure', value: 20, unit: 'years' },
    { key: 'pp', label: 'Prepayment amount', value: 200000, unit: '₹' },
    { key: 'when', label: 'Prepay after', value: 12, unit: 'months' },
    { key: 'freq', label: 'Prepayment', type: 'seg', value: 'once', options: [['once', 'One time'], ['yearly', 'Every year']] },
    { key: 'keep', label: 'After prepaying, keep', type: 'seg', value: 'emi', options: [['emi', 'Same EMI (shorter tenure)'], ['tenure', 'Same tenure (lower EMI)']] },
  ], (v) => {
    need(v.p, v.r, v.n, v.pp);
    const months = Math.round(v.n * 12), r = v.r / 1200;
    let emi = emiCalc(v.p, v.r, months);
    const baseInterest = emi * months - v.p;
    let bal = v.p, interest = 0, m = 0, newEmi = emi;
    while (bal > 0.5 && m < 1200) {
      const i = bal * r; interest += i;
      bal -= Math.min(bal, newEmi - i);
      m++;
      const due = v.freq === 'once' ? m === v.when : m >= v.when && (m - v.when) % 12 === 0;
      if (due && bal > 0) {
        bal = Math.max(0, bal - v.pp);
        if (v.keep === 'tenure' && months - m > 0) newEmi = emiCalc(bal, v.r, months - m);
      }
    }
    const saved = baseInterest - interest;
    return {
      big: [['Interest saved', fmtINR(Math.round(saved))], [v.keep === 'emi' ? 'Loan ends' : 'New EMI', v.keep === 'emi' ? `${Math.floor((months - m) / 12)}y ${(months - m) % 12}m earlier` : fmtINR(Math.round(newEmi))]],
      rows: [['Original EMI', fmtINR(Math.round(emi))], ['Interest without prepayment', fmtINR(Math.round(baseInterest))], ['Interest with prepayment', fmtINR(Math.round(interest))], ['Months to close', `${m} (was ${months})`]],
    };
  });
  root.append(note('Floating-rate home loans in India have no prepayment penalty for individuals (RBI). Check your lender for fixed-rate loans.'));
};

// ------------------------------------------------------------------ PPF
export const ppf: Mount = (root) => {
  calcForm(root, [
    { key: 'amt', label: 'Yearly deposit (₹500 – ₹1.5 lakh)', value: 150000, unit: '₹' },
    { key: 'r', label: 'Interest rate (current notified rate)', value: 7.1, unit: '% p.a.', step: 0.05 },
    { key: 'y', label: 'Years', value: 15, unit: 'years', hint: '15-year lock-in, extendable in 5-year blocks' },
  ], (v) => {
    need(v.amt, v.r, v.y);
    if (v.amt > 150000) throw new Error('The PPF limit is ₹1,50,000 per financial year.');
    let bal = 0;
    for (let y = 0; y < v.y; y++) bal = (bal + v.amt) * (1 + v.r / 100); // deposited before 5 April each year
    const inv = v.amt * v.y;
    return { big: [['Maturity value', fmtINR(Math.round(bal))], ['Interest earned', fmtINR(Math.round(bal - inv))], ['Total deposited', fmtINR(inv)]], rows: [['Tax status', 'EEE — deposit (80C), interest and maturity tax-free']] };
  });
  root.append(note('Assumes the yearly deposit is made before 5 April and the rate stays constant. The government revises the rate every quarter.'));
};

// ------------------------------------------------------------------ EPF
export const epf: Mount = (root) => {
  calcForm(root, [
    { key: 'basic', label: 'Monthly basic + DA', value: 50000, unit: '₹' },
    { key: 'age', label: 'Current age', value: 30, unit: 'years' },
    { key: 'ret', label: 'Retirement age', value: 58, unit: 'years' },
    { key: 'bal', label: 'Current EPF balance', value: 0, unit: '₹' },
    { key: 'inc', label: 'Yearly salary increase', value: 6, unit: '%' },
    { key: 'r', label: 'EPF interest rate', value: 8.25, unit: '% p.a.', step: 0.05 },
  ], (v) => {
    need(v.basic, v.age, v.ret, v.r);
    let bal = v.bal || 0, basic = v.basic, contrib = 0;
    const years = Math.max(0, v.ret - v.age);
    for (let y = 0; y < years; y++) {
      for (let m = 0; m < 12; m++) {
        const emp = basic * 0.12;
        const eps = Math.min(basic, 15000) * 0.0833; // employer share to pension (EPS)
        const er = basic * 0.12 - eps;
        bal += emp + er; contrib += emp + er;
        bal += bal * (v.r / 1200);
      }
      basic *= 1 + (v.inc || 0) / 100;
    }
    return { big: [['EPF corpus at retirement', fmtINR(Math.round(bal))], ['Your + employer contributions', fmtINR(Math.round(contrib))]], rows: [['Interest earned', fmtINR(Math.round(bal - contrib - (v.bal || 0)))], ['Years', String(years)]] };
  });
  root.append(note('12% of basic+DA from you; employer 12% minus the EPS pension share (8.33% of up to ₹15,000). Interest credited monthly at the chosen rate.'));
};

// ------------------------------------------------------------------ NPS
export const nps: Mount = (root) => {
  calcForm(root, [
    { key: 'amt', label: 'Monthly contribution', value: 10000, unit: '₹' },
    { key: 'age', label: 'Current age', value: 30, unit: 'years' },
    { key: 'r', label: 'Expected return', value: 10, unit: '% p.a.', step: 0.5 },
    { key: 'ann', label: 'Annuity purchase (min 40%)', value: 40, unit: '%' },
    { key: 'ar', label: 'Annuity rate', value: 6, unit: '% p.a.', step: 0.25 },
  ], (v) => {
    need(v.amt, v.age, v.r, v.ann, v.ar);
    const months = Math.max(0, (60 - v.age) * 12), i = v.r / 1200;
    let corpus = 0;
    for (let k = 0; k < months; k++) corpus = (corpus + v.amt) * (1 + i);
    const annuity = (corpus * Math.max(40, v.ann)) / 100;
    return { big: [['Corpus at 60', fmtINR(Math.round(corpus))], ['Monthly pension', fmtINR(Math.round((annuity * v.ar) / 1200))]], rows: [['Lump sum (tax-free up to 60%)', fmtINR(Math.round(corpus - annuity))], ['Used to buy annuity', fmtINR(Math.round(annuity))], ['Total invested', fmtINR(v.amt * months)]] };
  });
};

// ------------------------------------------------------------------ Inflation
export const inflation: Mount = (root) => {
  calcForm(root, [
    { key: 'amt', label: 'Amount today', value: 100000, unit: '₹' },
    { key: 'r', label: 'Inflation rate', value: 6, unit: '% p.a.', step: 0.1 },
    { key: 'y', label: 'Years', value: 20, unit: 'years' },
  ], (v) => {
    need(v.amt, v.r, v.y);
    const f = Math.pow(1 + v.r / 100, v.y);
    return { big: [['Future cost of the same things', fmtINR(Math.round(v.amt * f))], ['Today\'s money is worth (in future)', fmtINR(Math.round(v.amt / f))]], rows: [['Purchasing power lost', `${fmtN((1 - 1 / f) * 100, 1)}%`], ['Prices multiply by', `${fmtN(f, 2)}×`], ['Years for prices to double', fmtN(Math.log(2) / Math.log(1 + v.r / 100), 1)]] };
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
export const bodyfat: Mount = (root) => {
  calcForm(root, [
    { key: 'sex', label: 'Sex', type: 'seg', value: 'm', options: [['m', 'Male'], ['f', 'Female']] },
    { key: 'h', label: 'Height', value: 175, unit: 'cm' },
    { key: 'neck', label: 'Neck', value: 38, unit: 'cm' },
    { key: 'waist', label: 'Waist (at navel)', value: 85, unit: 'cm' },
    { key: 'hip', label: 'Hip (women)', value: 95, unit: 'cm' },
    { key: 'w', label: 'Weight', value: 75, unit: 'kg' },
  ], (v) => {
    need(v.h, v.neck, v.waist);
    const bf = v.sex === 'm'
      ? 495 / (1.0324 - 0.19077 * Math.log10(v.waist - v.neck) + 0.15456 * Math.log10(v.h)) - 450
      : 495 / (1.29579 - 0.35004 * Math.log10(v.waist + v.hip - v.neck) + 0.221 * Math.log10(v.h)) - 450;
    if (!isFinite(bf) || bf <= 0) throw new Error('Check the measurements (waist must be larger than neck).');
    const cat = v.sex === 'm' ? (bf < 6 ? 'Essential fat' : bf < 14 ? 'Athletic' : bf < 18 ? 'Fit' : bf < 25 ? 'Average' : 'Obese') : (bf < 14 ? 'Essential fat' : bf < 21 ? 'Athletic' : bf < 25 ? 'Fit' : bf < 32 ? 'Average' : 'Obese');
    return { big: [['Body fat', `${fmtN(bf, 1)}%`], ['Category (ACE)', cat]], rows: isFinite(v.w) ? [['Fat mass', `${fmtN((v.w * bf) / 100, 1)} kg`], ['Lean mass', `${fmtN(v.w * (1 - bf / 100), 1)} kg`]] : [] };
  });
};

// ------------------------------------------------------------------ Ideal weight
export const idealweight: Mount = (root) => {
  calcForm(root, [
    { key: 'sex', label: 'Sex', type: 'seg', value: 'm', options: [['m', 'Male'], ['f', 'Female']] },
    { key: 'h', label: 'Height', value: 170, unit: 'cm' },
  ], (v) => {
    need(v.h);
    const inchesOver5ft = Math.max(0, v.h / 2.54 - 60), m = v.sex === 'm';
    const f = {
      'Devine (1974)': (m ? 50 : 45.5) + 2.3 * inchesOver5ft,
      'Robinson (1983)': (m ? 52 : 49) + (m ? 1.9 : 1.7) * inchesOver5ft,
      'Miller (1983)': (m ? 56.2 : 53.1) + (m ? 1.41 : 1.36) * inchesOver5ft,
      'Hamwi (1964)': (m ? 48 : 45.5) + (m ? 2.7 : 2.2) * inchesOver5ft,
    };
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
export const coords: Mount = (root) => {
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
    const R = 6371.0088, rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
    const hv = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    const km = 2 * R * Math.asin(Math.sqrt(hv));
    const y = Math.sin(dLon) * Math.cos(b[0] * rad), x = Math.cos(a[0] * rad) * Math.sin(b[0] * rad) - Math.sin(a[0] * rad) * Math.cos(b[0] * rad) * Math.cos(dLon);
    const brg = (Math.atan2(y, x) / rad + 360) % 360;
    rows.push(['B (decimal)', `${b[0].toFixed(6)}, ${b[1].toFixed(6)}`], ['B (DMS)', `${toDMS(b[0], true)}, ${toDMS(b[1], false)}`]);
    return { big: [['Distance (great circle)', `${fmtN(km, 2)} km`], ['Initial bearing', `${fmtN(brg, 1)}°`]], rows: [['Miles', fmtN(km * 0.621371, 2)], ['Nautical miles', fmtN(km / 1.852, 2)], ...rows] };
  });
  root.append(h('p', { class: 'muted small' }, 'Accepts decimal degrees (−12.5) or degrees-minutes-seconds with N/S/E/W. Haversine on a mean-radius sphere (±0.5%).'));
};
