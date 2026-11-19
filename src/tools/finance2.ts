import { h, note, type Mount } from '../ui';
import { calcForm, fmtINR, fmtN, need } from '../lib/form';
import { prepayPlan, ppfPlan, epfPlan, npsPlan, inflation as infl, span } from '../lib/finance';
import { plural } from '../lib/dates';
import { BF_CHART, bodyFat, clockMinutes, clockText, feetInches, idealWeight, sleepTimes, type IdealWeight } from '../lib/health';
import { antipodal, bearingText, parseCoord, splitPair, toDDM, toDecimal, toDMS } from '../lib/coords';
import { mathcore } from '../wasm/mathcore';
import { geo } from '../wasm/geo';

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
  const hhmm = () => { const n = new Date(); return `${n.getHours()}:${String(n.getMinutes()).padStart(2, '0')}`; };
  let shownFor = '';
  const form = calcForm(root, [
    { key: 'mode', label: 'I want to', type: 'seg', value: 'wake', options: [['wake', 'Wake up at…'], ['bed', 'Go to bed at…'], ['now', 'Go to bed now']] },
    { key: 't', label: 'Time', type: 'time', value: '06:30', show: (v) => v.mode !== 'now' },
    { key: 'fall', label: 'Time to fall asleep', value: 15, unit: 'min', hint: 'Most people take 10 – 20 minutes' },
  ], (v) => {
    const now = v.mode === 'now', time = now ? hhmm() : String(v.t ?? '');
    shownFor = now ? time : '';
    const rows = sleepTimes(v.mode === 'wake' ? 'wake' : 'bed', time, v.fall);
    const day = (d: number) => (d < 0 ? ' (the day before)' : d > 0 ? ' (the next day)' : '');
    return {
      big: [[v.mode === 'wake' ? 'Go to bed at' : now ? `Going to bed now (${clockText(clockMinutes(time)!)}), set the alarm for` : 'Set alarm for', rows.slice(0, 2).map((r) => clockText(r.at)).join('  or  ')]],
      rows: rows.map((r) => [`${r.cycles} cycles (${r.hours} h sleep)`, clockText(r.at) + day(r.day)] as [string, string]),
    };
  });
  root.append(note('Sleep runs in ~90-minute cycles; waking between cycles feels easier. Adults need 7–9 hours (5–6 cycles).'));
  // "now" moves on: when the minute changes the times are worked out again
  const tick = setInterval(() => { if (form.values.mode === 'now' && shownFor !== hhmm()) form.refresh(); }, 5000);
  return () => clearInterval(tick);
};

// ------------------------------------------------------------------ Body fat (US Navy)
export const bodyfat: Mount = async (root) => {
  const m = await mathcore();
  calcForm(root, [
    { key: 'sex', label: 'Sex', type: 'seg', value: 'm', options: [['m', 'Male'], ['f', 'Female']] },
    { key: 'h', label: 'Height', value: 175, unit: 'cm' },
    { key: 'neck', label: 'Neck', value: 38, unit: 'cm', hint: 'Below the larynx' },
    { key: 'waist', label: 'Waist', value: 85, unit: 'cm', hint: 'Men: at the navel. Women: at the narrowest point' },
    { key: 'hip', label: 'Hip', value: 95, unit: 'cm', hint: 'At the widest point', show: (v) => v.sex === 'f' },
    { key: 'w', label: 'Weight (optional)', value: 75, unit: 'kg' },
  ], (v) => {
    const male = v.sex === 'm';
    need(v.h, v.neck, v.waist); if (!male) need(v.hip);
    const b = bodyFat(m, male, v.h, v.neck, v.waist, v.hip, v.w), chart = BF_CHART[male ? 'm' : 'f'], c = chart.cuts;
    return {
      big: [['Body fat', `${b.shown.toFixed(1)}%`], ['Category (ACE)', b.category]],
      rows: [...(b.fat === null ? [] : [['Fat mass', `${fmtN(b.fat, 1)} kg`], ['Lean mass', `${fmtN(b.lean!, 1)} kg`]] as Array<[string, string]>),
        [`Chart used (${male ? 'men' : 'women'})`, `<${c[0]} essential · <${c[1]} athletic · <${c[2]} fit · <${c[3]} average · ≥${c[3]} obese`]],
      notes: b.category === 'Below essential fat' ? [`Less than the fat a body needs to work (about ${chart.essential} % for ${male ? 'men' : 'women'}) — check the measurements.`] : [],
    };
  });
  root.append(note('US Navy method (Hodgdon and Beckett, 1984): an estimate from a tape measure, usually within 3 – 4 percentage points of a laboratory measurement. Measure on bare skin, the tape level and not pulled tight.'));
};

// ------------------------------------------------------------------ Ideal weight
export const idealweight: Mount = async (root) => {
  const m = await mathcore();
  const metric = (v: Record<string, any>) => v.sys === 'm', imperial = (v: Record<string, any>) => v.sys === 'i';
  calcForm(root, [
    { key: 'sex', label: 'Sex', type: 'seg', value: 'm', options: [['m', 'Male'], ['f', 'Female']] },
    { key: 'sys', label: 'Units', type: 'seg', value: 'm', options: [['m', 'Metric'], ['i', 'Imperial']] },
    { key: 'h', label: 'Height', value: 170, unit: 'cm', show: metric },
    { key: 'ft', label: 'Height (feet)', value: 5, show: imperial },
    { key: 'inch', label: 'and inches', value: 7, show: imperial },
  ], (v) => {
    let w: IdealWeight;
    if (v.sys === 'm') { need(v.h); w = idealWeight(m, v.sex === 'm', v.h / 100); }
    else { if (!isFinite(v.ft) && !isFinite(v.inch)) need(NaN); w = idealWeight(m, v.sex === 'm', feetInches(v.ft, v.inch), 'lb'); }
    const n1 = (x: number) => fmtN(x, 1), range = (r: { lo: number; hi: number }) => `${n1(r.lo)} – ${n1(r.hi)} ${w.unit}`;
    return {
      big: [['Healthy BMI range (Asian 18.5–23)', range(w.asian)]],
      rows: [['Healthy BMI range (WHO 18.5–25)', range(w.who)], ...(w.formulas ?? []).map(([k, x]) => [k, `${n1(x)} ${w.unit}`] as [string, string])],
      notes: w.formulas ? [] : ['The four formulas (Devine, Robinson, Miller, Hamwi) start at a height of 5 feet (152.4 cm) and say nothing below it — the BMI range is the guide here.'],
    };
  });
  root.append(note('The formulas were made to work out doses of medicine, from the height alone; the BMI range is the better guide to a healthy weight. Indian guidelines use the lower range (BMI up to 23).'));
};

// ------------------------------------------------------------------ Coordinates
const MILE = 1609.344, NAUTICAL_MILE = 1852; // metres, by definition
export const coords: Mount = async (root) => {
  const g = await geo();
  const point = (name: string, latText: string, lonText: string) => {
    let lat: number, lon: number;
    try { lat = parseCoord(latText, 'lat'); } catch (e: any) { throw new Error(`Point ${name}: ${e.message}`); }
    try { lon = parseCoord(lonText, 'lon'); } catch (e: any) { throw new Error(`Point ${name}: ${e.message}`); }
    return { lat, lon, rows: [[`${name} (decimal)`, `${toDecimal(lat)}, ${toDecimal(lon)}`], [`${name} (DMS)`, `${toDMS(lat, 'lat')}, ${toDMS(lon, 'lon')}`], [`${name} (degrees, minutes)`, `${toDDM(lat, 'lat')}, ${toDDM(lon, 'lon')}`]] as Array<[string, string]> };
  };
  calcForm(root, [
    { key: 'lat1', label: 'Point A latitude', type: 'text', value: '28.6139', placeholder: '28.6139 or 28° 36′ 50″ N', hint: 'A pair such as "28.6139, 77.2090" fills both boxes' },
    { key: 'lon1', label: 'Point A longitude', type: 'text', value: '77.2090', placeholder: '77.2090 or 77° 12′ 32″ E' },
    { key: 'lat2', label: 'Point B latitude (optional)', type: 'text', value: '19.0760', placeholder: 'Leave both empty for one point' },
    { key: 'lon2', label: 'Point B longitude (optional)', type: 'text', value: '72.8777' },
  ], (v) => {
    const a = point('A', String(v.lat1), String(v.lon1));
    const bLat = String(v.lat2).trim(), bLon = String(v.lon2).trim();
    if (!bLat && !bLon) return { rows: a.rows };
    if (!bLat || !bLon) throw new Error(`Point B: the ${bLat ? 'longitude' : 'latitude'} is missing — fill in both boxes, or empty both for one point.`);
    const b = point('B', bLat, bLon), x = g.inverse(a.lat, a.lon, b.lat, b.lon), km = x.metres / 1000;
    const same = x.metres === 0, far = (m: number) => (m < 1000 ? `${fmtN(m, 1)} m` : `${fmtN(m / 1000, 2)} km`);
    const few = (n: number) => fmtN(n, n < 10 ? 3 : 2); // a short walk keeps a third decimal: 0.062 miles, not 0.06
    return {
      big: [['Distance', far(x.metres)], ['Initial bearing', same ? '—' : bearingText(x.bearing)]],
      rows: [['Miles', few(x.metres / MILE)], ['Nautical miles', few(x.metres / NAUTICAL_MILE)], ['Bearing on arrival', same ? '—' : bearingText(x.finalBearing)],
        ['Half-way point', same ? '—' : `${toDecimal(x.mid[0])}, ${toDecimal(x.mid[1])}`], ['On a sphere (haversine)', far(x.sphereMetres)], ...a.rows, ...b.rows],
      notes: same ? ['The two points are the same place.'] : antipodal(a.lat, a.lon, b.lat, b.lon) ? ['The two points are exactly opposite each other on the globe: more than one way is the shortest, all equally long — the bearing shown is one of them.']
        : km > 19900 ? ['The points are almost opposite each other: the shortest way and its bearing change a great deal with a small change of either point.'] : [],
    };
  });
  // a pair typed or pasted into a latitude box ("28.6139, 77.2090" as map apps copy it) goes into both boxes
  const boxes = [...root.querySelectorAll<HTMLInputElement>('input.input')];
  for (const i of [0, 2]) boxes[i]?.addEventListener('input', () => {
    const pair = splitPair(boxes[i].value);
    if (!pair || !boxes[i + 1]) return;
    boxes[i].value = pair[0]; boxes[i + 1].value = pair[1];
    boxes[i + 1].dispatchEvent(new Event('input', { bubbles: true })); boxes[i].dispatchEvent(new Event('input', { bubbles: true }));
  });
  root.append(h('p', { class: 'muted small' }, 'Decimal degrees (−12.5, 12.5 S) or degrees, minutes and seconds with N / S / E / W. The distance is the shortest path on the WGS-84 ellipsoid — the Earth\'s shape as GPS uses it — by Karney\'s method (GeographicLib), good to a millimetre; the sphere figure is what the haversine formula gives (up to 0.5 % off).'));
};
