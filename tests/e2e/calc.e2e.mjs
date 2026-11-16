// Scientific Calculator (#/calc): typed expressions with known answers (precedence, right-associative ^, unary minus,
// factorial, roots, trig in DEG and RAD, logs, nCr/nPr, percent of a running total, float noise hidden, overflow,
// errors), Ans, the keypad (fresh start after =, 2nd functions, memory, ±, 1/x, ⌫, AC), live preview, history,
// Escape; PC shows the bc console, phones only the keypad.
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/calc`);
  const ex = page.getByLabel('Expression'), pad = page.locator('.calc-pad'), preview = page.locator('.calc-preview');
  await ex.waitFor();
  const key = (k) => pad.getByRole('button', { name: k, exact: true }).click();
  const run = async (s) => { await ex.fill(s); await ex.press('Enter'); return ex.inputValue(); };
  for (const [e, want] of [
    ['2+3×4', '14'], ['(2+3)*4', '20'], ['10÷4', '2.5'], ['7−10', '-3'], ['2^10', '1024'], ['2^3^2', '512'], ['-2^2', '-4'], ['2**8', '256'],
    ['5!', '120'], ['√16', '4'], ['√2', '1.41421356237'], ['cbrt(27)', '3'], ['root(-8,3)', '-2'], ['3²+4²', '25'],
    ['sin(30)', '0.5'], ['cos(60)', '0.5'], ['tan(45)', '1'], ['asin(1)', '90'], ['sinh(0)', '0'],
    ['ln(e)', '1'], ['log(1000)', '3'], ['log2(1024)', '10'], ['exp(0)', '1'], ['e', '2.71828182846'], ['2π', '6.28318530718'],
    ['nCr(52,5)', '2598960'], ['nPr(5,2)', '20'], ['mod(17,5)', '2'], ['gcd(84,36)', '12'], ['abs(-7.5)', '7.5'],
    ['0.1+0.2', '0.3'], ['1/3*3', '1'], ['1e-10', '1e-10'], ['2^64', '1.844674407e19'],
    ['200+18%', '236'], ['1500−10%', '1350'], ['50%', '0.5'], ['200×15%', '30'],
  ]) { const got = await run(e); ok(got === want, `${e} = ${want} (${got})`); }
  ok(await run('1.844674407e19/2') === '9.223372035e18', 'a result in e-notation can be used again');
  ok(await run('1/0') === 'inf' && /∞/.test(await page.locator('.calc-hrow').first().textContent()), '1/0 = ∞');
  ok(await run('171!') === 'inf', '171! overflows to ∞');
  ok(await run('sqrt(-1)') === '' && /Error/.test(await page.locator('.calc-hrow').first().textContent()), '√−1 = Error');
  await ex.fill('(2+3'); await ex.press('Enter');
  ok(/Missing \)/.test(await preview.textContent()) && await preview.evaluate((e) => e.classList.contains('err')) && await ex.inputValue() === '(2+3', 'unbalanced bracket: message, input kept');
  await ex.fill('foo(2)'); await ex.press('Enter');
  ok(/Unknown name/.test(await preview.textContent()), 'unknown function reported');

  // Ans and continuing after a result
  await run('2+3'); await ex.press('End'); await ex.pressSequentially('*2'); await ex.press('Enter');
  ok(await ex.inputValue() === '10', 'typing an operator after = continues from the result');
  ok(await run('ans+1') === '11', 'ans = last result');

  // DEG / RAD
  await page.locator('.calc-mode').click();
  ok(await page.locator('.calc-mode').textContent() === 'RAD' && await run('sin(π/2)') === '1' && await run('sin(30)') === '-0.988031624093', 'RAD mode');
  await key('deg/rad');
  ok(await page.locator('.calc-mode').textContent() === 'DEG', 'deg/rad key switches back');

  // keypad
  await key('AC'); for (const k of ['7', '×', '6']) await key(k);
  ok(await preview.textContent() === '= 42', 'live preview while typing on the keypad');
  await key('=');
  ok(await ex.inputValue() === '42', 'keypad 7 × 6 = 42');
  await key('2'); ok(await ex.inputValue() === '2', 'a digit after = starts a new calculation');
  for (const k of ['+', '3', '=']) await key(k);
  await key('+'); await key('1'); await key('=');
  ok(await ex.inputValue() === '6', 'an operator after = continues: 5 + 1 = 6');
  await key('2nd');
  ok(await pad.getByRole('button', { name: 'asin', exact: true }).isVisible() && await pad.getByRole('button', { name: 'x³', exact: true }).isVisible(), '2nd shows the second functions');
  await key('2nd'); ok(await pad.getByRole('button', { name: 'sin', exact: true }).isVisible(), '2nd again goes back');
  await key('AC'); await key('2nd'); await key('asin'); await key('1'); await key(')'); await key('=');
  ok(await ex.inputValue() === '90' && await pad.getByRole('button', { name: 'sin', exact: true }).isVisible(), '2nd asin(1) = 90, then 2nd turns off');
  await key('AC'); await key('2nd'); await key('nCr'); for (const k of ['5', ',', '2', ')', '=']) await (k === ',' ? ex.press(',') : key(k));
  ok(await ex.inputValue() === '10', '2nd nCr(5,2) = 10');
  await key('AC'); await key('5'); await key('±'); ok(await ex.inputValue() === '-5', '± negates'); await key('±'); ok(await ex.inputValue() === '5', '± again');
  await key('AC'); await key('4'); await key('1/x'); ok(await ex.inputValue() === '1/(4)' && await preview.textContent() === '= 0.25', '1/x');
  await key('AC'); for (const k of ['1', '2', '3']) await key(k); await key('⌫'); ok(await ex.inputValue() === '12', '⌫ deletes one character');
  await key('AC'); await key('3'); await key('x²'); await key('='); ok(await ex.inputValue() === '9', 'x²');
  await key('AC'); await key('π'); await key('='); ok(await ex.inputValue() === '3.14159265359', 'π key');
  await key('AC'); await key('2'); await key('EXP'); await key('3'); await key('='); ok(await ex.inputValue() === '2000', 'EXP: 2e3 = 2000');

  // memory
  await key('AC'); await key('6'); await key('M+');
  ok(await page.locator('.calc-ind').nth(1).textContent() === 'M = 6', 'M+ stores 6');
  await key('AC'); await key('4'); await key('M+'); ok(await page.locator('.calc-ind').nth(1).textContent() === 'M = 10', 'M+ adds 4 → 10');
  await key('AC'); await key('MR'); ok(await ex.inputValue() === '10', 'MR recalls 10');
  await key('AC'); await key('3'); await key('2nd'); await key('M−'); ok(await page.locator('.calc-ind').nth(1).textContent() === 'M = 7', '2nd M− subtracts 3 → 7');
  await key('MC'); ok(await page.locator('.calc-ind').nth(1).textContent() === '', 'MC clears memory');

  // history and Escape
  const rows = page.locator('.calc-hrow'), n = await rows.count();
  ok(n === 50 && !/^2\+3×4/.test(await rows.last().textContent()), `history keeps the last 50 calculations, oldest dropped (${n})`);
  await rows.nth(2).click(); const restored = await ex.inputValue();
  ok(restored.length > 0 && (await rows.nth(2).locator('.muted').textContent()) === restored, `clicking a history row restores its expression (${restored})`);
  await ex.press('Escape'); ok(await ex.inputValue() === '', 'Escape clears');
  await page.getByRole('button', { name: 'Clear history' }).click(); ok(await rows.count() === 0, 'Clear history');
  ok(await page.locator('.bc-out').count() === 1, 'PC: bc console shown beside the keypad');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/calc`); await ph.getByLabel('Expression').waitFor();
  ok(await ph.locator('.bc-out').count() === 0 && await ph.getByLabel('Expression').getAttribute('inputmode') === 'none', 'phone: keypad only (no bc console, no on-screen keyboard)');
  for (const k of ['9', '÷', '4', '=']) await ph.locator('.calc-pad').getByRole('button', { name: k, exact: true }).click();
  ok(await ph.getByLabel('Expression').inputValue() === '2.25', 'phone keypad: 9 ÷ 4 = 2.25');
  const keyH = await ph.locator('.calc-key').first().evaluate((e) => e.getBoundingClientRect().height);
  ok(keyH >= 44 && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `phone: keys ≥ 44 px tall (${keyH.toFixed(0)}), no horizontal scroll`);
};
