// Scientific Calculator (#/calc). The engine's answers are held to mpmath in tests/unit/calc.test.mjs (3,005 cases);
// here: the page. Typed expressions with known answers and their display (whole numbers with all digits, round
// angles exact, float noise hidden); what is refused keeps the expression and Ans and says why (division by zero, no
// real result, too large, a missing sign, an unknown name, commas); going on from a result is exact (Ans), on the
// keys and on the keyboard; "=" twice; history rows bring back their expression with their Ans; the keypad (2nd
// functions, memory, ±, 1/x, ⌫, AC, EXP); Copy result; DEG / RAD; Escape; PC shows the bc console, phones the keypad.
import { hookClipboard, copied } from './_devdata.mjs';
export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage(); await page.goto(`${base}#/calc`);
  const ex = page.getByLabel('Expression'), pad = page.locator('.calc-pad'), preview = page.locator('.calc-preview');
  await ex.waitFor();
  const key = (k) => pad.getByRole('button', { name: k, exact: true }).click();
  // a new calculation: clear first (after a result, text that starts with an operator goes on from Ans)
  const run = async (s) => { await ex.press('Escape'); await ex.fill(s); await ex.press('Enter'); return ex.inputValue(); };
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
  // the display: every digit of a whole number, the exact value at round angles, no noise
  for (const [e, want] of [['2^40', '1099511627776'], ['1234567×1234567', '1524155677489'], ['123456789012345+0', '123456789012345'], ['2^53−1', '9007199254740991'], ['20!', '2432902008176640000'.length === 19 ? '2.432902008e18' : ''],
    ['sin(180)', '0'], ['cos(90)', '0'], ['sin(360)', '0'], ['cos(270)', '0'], ['tan(180)', '0'], ['sin(30)+cos(60)', '1'], ['999999999999.9+0', '999999999999.9'],
    ['nCr(200,2)', '19900'], ['nPr(200,2)', '39800'], ['nCr(5,7)', '0'], ['(-8)^(1/3)', '-2'], ['(-8)^(2/3)', '4'], ['(-0.5)!', '1.77245385091'], ['round(1.005,2)', '1.01'], ['log(125,5)', '3'],
    ['Sin(30)', '0.5'], ['PI×2', '6.28318530718'], ['SQRT(16)', '4'], ['2x3', '6'], ['4 x 5', '20'], ['200+(10%)', '200.1'], ['200+-10%', '180'], ['1÷∞', '0']]) { const got = await run(e); ok(got === want, `${e} = ${want} (${got})`); }
  // what has no answer is refused: the expression stays, nothing goes into the history, Ans keeps its value
  await run('6×7'); const rowsBefore = await page.locator('.calc-hrow').count();
  for (const [e, why] of [['1/0', /^Division by zero\.$/], ['5÷(3−3)', /^Division by zero\.$/], ['0^-1', /^Division by zero\.$/], ['mod(5,0)', /^Division by zero\.$/], ['sqrt(-1)', /^No real result/], ['ln(0)', /^No real result/], ['asin(2)', /^No real result/], ['tan(90)', /^No real result/], ['(-8)^0.5', /^No real result/], ['(-3)!', /^No real result/],
    ['171!', /^Too large: the result is beyond 1\.8 × 10\^308\.$/], ['10^400', /^Too large/], ['exp(1000)', /^Too large/],
    ['1.2.3', /sign is missing between two numbers/], ['2 3', /sign is missing between two numbers/], ['2x', /^Unknown name: x$/], ['foo(2)', /^Unknown name: foo$/], ['(2+3', /Missing \)/], ['1,000+1', /without commas \(1000, not 1,000\)/], ['2+', /Incomplete expression/]]) {
    await ex.fill(e); await ex.press('Enter'); const said = await preview.textContent();
    ok(why.test(said) && await preview.evaluate((el) => el.classList.contains('err')) && await ex.inputValue() === e, `${e} is refused and stays in the box: ${said}`);
  }
  ok(await page.locator('.calc-hrow').count() === rowsBefore && await run('ans+0') === '42', 'the refusals left the history and Ans (42) alone');
  ok(await run('∞') === '∞' && await run('ans+1') === '∞' && await run('1÷ans') === '0', '∞ can be typed and worked with');
  await run('2+2');

  // going on from a result: exact (through Ans), on the keyboard and on the keys
  await run('2+3'); await ex.pressSequentially('*2'); ok(await ex.inputValue() === 'ans*2', 'an operator typed after = goes on from Ans'); await ex.press('Enter');
  ok(await ex.inputValue() === '10', '5 × 2 = 10');
  ok(await run('ans+1') === '11', 'ans = last result');
  await run('1÷3'); ok(await ex.inputValue() === '0.333333333333', '1 ÷ 3 is shown with 12 digits');
  await ex.pressSequentially('*3'); await ex.press('Enter'); ok(await ex.inputValue() === '1', 'then × 3 is 1 — the result went on exactly, not as 0.333333333333 (which gave 0.999999999999)');
  await run('1÷3'); await key('×'); await key('3'); await key('='); ok(await ex.inputValue() === '1', 'the same on the keys');
  await run('2+3'); await ex.pressSequentially('7'); ok(await ex.inputValue() === '7', 'a digit typed after = starts a new calculation (as the digit keys do)');
  await run('2+3'); await ex.press('Enter'); await ex.press('Enter'); ok(await ex.inputValue() === '5' && await run('ans×1') === '5', '"=" again leaves the result standing');
  await run('2+3'); await ex.press('Backspace'); await ex.pressSequentially('9'); await ex.press('Enter'); ok(await ex.inputValue() === '9', 'the shown result can also be edited as text');
  // a history row brings back its expression — with the Ans it had
  await run('5'); await run('ans×2'); await run('ans×2'); ok(await ex.inputValue() === '20', '5, × 2, × 2 = 20');
  const hrow = page.locator('.calc-hrow').nth(1); ok(/^Ans×2\s*10$/.test((await hrow.textContent()).trim()), `the history shows "Ans×2 = 10" (${await hrow.textContent()})`);
  await hrow.click(); await ex.press('Enter'); ok(await ex.inputValue() === '10', 'clicked and worked out again it is 10 again (its own Ans, not the latest)');

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
  await key('AC'); await key('−'); await key('5'); await key('±'); const once = await ex.inputValue(); await key('±'); const twice = await ex.inputValue(); await key('±');
  ok(once === '5' && twice === '-5' && await ex.inputValue() === '5', `± on a number typed with the − key (it piled up brackets): ${once}, ${twice}`);
  await key('AC'); for (const k of ['2', '+', '3']) await key(k); await key('±'); ok(await ex.inputValue() === '-(2+3)', '± wraps an expression'); await key('±'); ok(await ex.inputValue() === '2+3', 'and unwraps it');
  await run('8÷3'); await key('±'); await key('='); ok(await ex.inputValue() === '-2.66666666667', '± after = negates the result'); await key('1/x'); await key('='); ok(await ex.inputValue() === '-0.375', '1/x after = works on the exact result (−3/8)');
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
  await run('1÷3'); await key('M+'); await key('AC'); await key('MR'); const recalled = await ex.inputValue(); await key('×'); await key('3'); await key('=');
  ok(recalled === '0.3333333333333333' && await ex.inputValue() === '1' && /^M = 0\.333333333333$/.test(await page.locator('.calc-ind').nth(1).textContent()), `the memory holds the exact value: MR gives ${recalled}, × 3 = 1`);
  await key('MC');
  // Copy result
  await hookClipboard(page);
  await run('2+3'); await page.getByRole('button', { name: 'Copy result' }).click(); await page.waitForTimeout(80);
  await ex.fill('6×7'); await page.getByRole('button', { name: 'Copy result' }).click(); await page.waitForTimeout(80);
  ok(JSON.stringify(await copied(page)) === '["5","42"]', `Copy result copies the result — also of an expression not yet worked out (${JSON.stringify(await copied(page))})`);
  await ex.fill('6×'); await page.getByRole('button', { name: 'Copy result' }).click(); await page.waitForTimeout(80);
  ok((await copied(page)).length === 2 && /no result yet/.test((await page.locator('.toast').allTextContents()).join(' ')), 'nothing is copied from an unfinished expression');
  page.errors.length = 0;   // that refusal is logged on purpose
  for (let i = 0; i < 40; i++) await run(`${i}+1`);

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
