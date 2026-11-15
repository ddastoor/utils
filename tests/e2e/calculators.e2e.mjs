// Calculators (27): known answers via the real UI (computations run in mathcore.wasm).
export default async ({ base, page: newPage, ok }) => {
  const page = await newPage();
  const big = async () => (await page.locator('.big-value').allTextContents()).join(' | ');
  const check = async (route, re, label) => { await page.goto(base + '#/' + route); await page.waitForSelector('.big-value, .kv', { timeout: 15000 }); const t = await big(); ok(re.test(t), `${label}: ${t.slice(0, 100)}`); };
  await check('emi', /₹21,696/, 'EMI 25L @8.5% 20y');
  await check('gst', /₹1,180/, 'GST 1000 + 18%');
  await check('words', /Rupees Twelve Lakh Thirty-Four Thousand Five Hundred and Sixty-Seven and Fifty Paise Only/, 'Number to words');
  await check('roman', /MMXXVI/, 'Roman 2026');
  await check('bmi', /23\.5/, 'BMI');
  await check('sip', /₹50,45,760/, 'SIP 10k @12% 15y');
  await check('fd', /₹1,41,478/, 'FD 1L @7% 5y quarterly');
  await check('fuel', /₹2,450/, 'Fuel cost');
  await check('tip', /₹660/, 'Tip split');
  await check('ppf', /₹40,68,209/, 'PPF');
  await check('coords', /1,1[45]\d\.\d+ km/, 'Delhi→Mumbai');
  await check('inflation', /₹3,20,714/, 'Inflation');
  await check('calories', /2,224 kcal/, 'TDEE (BMR 1618 × 1.375)');
  await check('idealweight', /kg/, 'Ideal weight');
  await check('bodyfat', /%/, 'Body fat');
  await check('prepay', /₹/, 'Prepayment');
  await check('nps', /₹/, 'NPS'); await check('epf', /₹/, 'EPF');
  await page.goto(base + '#/base'); await page.waitForSelector('input.mono');
  ok((await page.locator('input.mono').nth(3).inputValue()) === 'FF', 'Base: 255 → FF');
  await page.locator('input.mono').nth(2).fill('12345678901234567890');
  ok((await page.locator('input.mono').nth(3).inputValue()) === 'AB54A98CEB1F0AD2', 'Base: 20-digit decimal → hex');
  await page.goto(base + '#/calc'); await page.waitForSelector('.calc-expr');
  await page.locator('.calc-expr').fill('2^10 + sin(30)'); await page.keyboard.press('Enter');
  ok((await page.locator('.calc-expr').inputValue()) === '1024.5', 'Scientific: 2^10 + sin(30°)');
  await page.locator('.calc-expr').fill('ans*2'); await page.keyboard.press('Enter');
  ok((await page.locator('.calc-expr').inputValue()) === '2049', 'Scientific: ans');
  await page.locator('[data-first="AC"]').click();
  for (const k of ['7', '×', '6']) await page.locator(`[data-first="${k}"]`).click();
  await page.locator('[data-first="="]').click();
  ok((await page.locator('.calc-expr').inputValue()) === '42', 'Scientific: keypad 7×6');
  for (const r of ['units', 'dates', 'percent', 'timezone', 'duedate', 'gpa', 'sleep']) {
    await page.goto(base + '#/' + r); await page.waitForTimeout(150);
    ok(!(await page.locator('.note-warn').count()) && !/being built/.test(await page.locator('.tool-body').innerText()), `${r} renders`);
  }
  ok(!page.errors.length, 'no console errors ' + page.errors.join(' | '));
};
