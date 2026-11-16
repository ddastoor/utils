// Statistics (#/stats): every summary value against an independent computation (quartiles = linear interpolation,
// as Excel QUARTILE.INC), modes, undefined values shown as —, separators and junk, linear regression.
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * (1 + Math.abs(b));
function summary(xs) {
  const s = [...xs].sort((a, b) => a - b), n = s.length, sum = s.reduce((a, b) => a + b, 0), mean = sum / n;
  const q = (p) => { const pos = (n - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos); return s[lo] + (s[hi] - s[lo]) * (pos - lo); };
  const ss = s.reduce((a, x) => a + (x - mean) ** 2, 0), sdP = Math.sqrt(ss / n);
  return { n, sum, mean, median: q(0.5), q1: q(0.25), q3: q(0.75), varP: ss / n, varS: ss / (n - 1), sdP, sdS: Math.sqrt(ss / (n - 1)),
    geo: Math.exp(s.reduce((a, x) => a + Math.log(x), 0) / n), harm: n / s.reduce((a, x) => a + 1 / x, 0), skew: s.reduce((a, x) => a + ((x - mean) / sdP) ** 3, 0) / n, min: s[0], max: s[n - 1] };
}
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/stats`);
  const data = page.getByLabel('Data'), pairs = page.getByLabel('x, y pairs (optional)');
  const big = (l) => page.locator('.big-result').filter({ has: page.locator('.big-label', { hasText: new RegExp(`^${l.replace(/[()]/g, '\\$&')}$`) }) }).locator('.big-value').textContent();
  const kv = async (l) => page.evaluate((l) => { const s = [...document.querySelectorAll('.kv > span')]; const i = s.findIndex((e) => e.textContent === l); return i >= 0 ? s[i + 1].textContent : null; }, l);
  await page.locator('.big-value').first().waitFor();
  const check = async (xs, label) => {
    const e = summary(xs);
    const got = { mean: +await big('Mean'), median: +await big('Median'), sdP: +await big('Std dev (population)'), q1: +await kv('Q1 (25%)'), q3: +await kv('Q3 (75%)'), varP: +await kv('Variance (population)'), varS: +await kv('Variance (sample)'), sdS: +await kv('Std dev (sample)'), geo: +await kv('Geometric mean'), harm: +await kv('Harmonic mean'), skew: +await kv('Skewness'), sum: +await kv('Sum') };
    const bad = Object.entries(got).filter(([k, v]) => !close(v, e[k], 1e-10)).map(([k, v]) => `${k} ${v} ≠ ${e[k]}`);
    ok(!bad.length && +await kv('Count') === e.n && +await kv('IQR') === +(await kv('Q3 (75%)')) - +(await kv('Q1 (25%)')) || close(+await kv('IQR'), e.q3 - e.q1), `${label}: every value matches (${bad.join('; ') || 'ok'})`);
  };
  const D = [12, 15, 15, 18, 21, 24, 24, 24, 30];
  await check(D, 'default data');
  ok(await big('Mode') === '24' && await kv('Range') === '18' && await kv('Sorted') === D.join(', '), 'mode 24, range 18, sorted list');
  const set = async (s) => { await data.fill(s); await data.dispatchEvent('input'); };
  await set('3.5\n1.25; 9 ,  2.75 7 100.125 0.5');
  await check([3.5, 1.25, 9, 2.75, 7, 100.125, 0.5], 'commas, semicolons, spaces and new lines');
  await set('1 1 2 2 3'); ok(await big('Mode') === '1, 2', 'two modes');
  await set('4 8 15 16 23 42'); ok(await big('Mode') === 'none', 'all different → no mode');
  await check([4, 8, 15, 16, 23, 42], 'even count (median and quartiles interpolated)');
  await set('5'); ok(await big('Mean') === '5' && await kv('Variance (sample)') === '—' && await kv('Skewness') === '—', 'one value: sample variance and skewness are undefined (—, not "Error")');
  await set('7 7 7'); ok(await big('Std dev (population)') === '0' && await kv('Skewness') === '—', 'constant data: sd 0, skewness —');
  await set('-2 4 9'); ok(await kv('Geometric mean') === '—' && await kv('Harmonic mean') === '—', 'negative values: geometric/harmonic mean —');
  await set('10, abc, 20, 3e1, 0x10'); ok(+await kv('Count') === 3 && await big('Mean') === '20', 'junk ignored; 3e1 = 30');
  const many = Array.from({ length: 10000 }, (_, i) => ((i * 7919) % 1000) / 10);
  // Playwright's fill() is very slow with 10,000 lines; set the value the way a paste does
  await data.evaluate((e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, many.join('\n')); await check(many, '10,000 values (pasted)');
  await set('');
  ok(!(await page.locator('.big-value').count()), 'no data → no summary');
  const P = [[1, 2], [2, 4.1], [3, 5.9], [4, 8.2], [5, 9.8]];
  await pairs.fill(P.map((p) => p.join(', ')).join('\n')); await pairs.dispatchEvent('input');
  const n = P.length, mx = P.reduce((a, p) => a + p[0], 0) / n, my = P.reduce((a, p) => a + p[1], 0) / n;
  const sxy = P.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0), sxx = P.reduce((a, p) => a + (p[0] - mx) ** 2, 0), syy = P.reduce((a, p) => a + (p[1] - my) ** 2, 0);
  const slope = sxy / sxx, icpt = my - slope * mx, rr = sxy / Math.sqrt(sxx * syy);
  const line = await big('Best-fit line'), m2 = line.match(/^y = ([\d.-]+)x ([+−]) ([\d.]+)$/);
  ok(m2 && close(+m2[1], slope, 1e-5) && close((m2[2] === '−' ? -1 : 1) * +m2[3], icpt, 1e-5), `regression ${line} (y = ${slope.toFixed(6)}x + ${icpt.toFixed(6)})`);
  ok(close(+await kv('Correlation r'), rr, 1e-5) && close(+await kv('R²'), rr * rr, 1e-5) && await kv('Pairs') === '5', `r = ${rr.toFixed(6)}, R², 5 pairs`);
  await pairs.fill('1, 5\n2, 3\n3, 1'); await pairs.dispatchEvent('input');
  ok(/^y = -2x \+ 7$/.test(await big('Best-fit line')) && await kv('Correlation r') === '-1', 'perfect negative line y = −2x + 7, r = −1');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/stats`); await ph.locator('.big-value').first().waitFor();
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no horizontal scroll');
};
