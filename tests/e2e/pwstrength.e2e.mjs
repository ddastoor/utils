// Password Strength (#/pwstrength, PC only): scores for 20 passwords equal the Python port of zxcvbn (the reference
// algorithm), crack-time rows, warnings for common passwords, personal words lower the score, the pattern breakdown
// (dictionary, keyboard, date, sequence, repeat), guess counts on the page against the reference fixture, the 2^64
// ceiling, personal words, odd input, the engine loads only with the first password, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const PWS = ['password', 'P@ssw0rd', '123456', 'qwerty', 'asdfghjkl', 'iloveyou', 'abc123', 'Tr0ub4dor&3', 'correcthorsebatterystaple', 'aaaaaaaaaa', '19/11/1988', 'abcdefgh', 'Mumbai2026', 'xK9#mQ2$vL7!', 'dragon', 'zxcvbnm', 'Th1s1sMyP@ss', 'ilovechai', 'q8T!vR2#nZ5&wL', '1234567890'];
export default async (ctx) => {
  const { base, page: newPage, ok, info } = ctx;
  const page = await newPage(); const reqs = []; page.on('request', (r) => reqs.push(r.url())); await page.goto(`${base}#/pwstrength`);
  const pw = page.locator('input[aria-label=Password]'); await pw.waitFor(); await page.waitForTimeout(300);
  ok(!reqs.some((u) => /zxcvbn.*\.wasm/.test(u)), 'engine not downloaded before typing');
  let ref = null; try { ref = JSON.parse(execFileSync('python3', ['-c', 'import zxcvbn,json,sys; print(json.dumps([zxcvbn.zxcvbn(p)["score"] for p in json.loads(sys.argv[1])]))', JSON.stringify(PWS)]).toString()); } catch { info('python zxcvbn missing (pip install --user zxcvbn) — reference scores skipped'); }
  const score = async (p) => { await pw.fill(p); await page.waitForFunction((p) => document.querySelector('.strength-label')?.textContent && document.querySelector('input[aria-label=Password]').value === p, p); await page.waitForTimeout(150); return +(/score (\d)/.exec(await page.locator('.strength-label').textContent())[1]); };
  const mine = []; for (const p of PWS) mine.push(await score(p));
  if (ref) { const diff = PWS.filter((p, i) => mine[i] !== ref[i]); ok(diff.length <= 1, `scores match the Python zxcvbn reference for ${PWS.length - diff.length}/${PWS.length} (${diff.map((p) => `${p}: ${mine[PWS.indexOf(p)]} vs ${ref[PWS.indexOf(p)]}`).join(', ')})`); }
  ok(mine[0] === 0 && mine[2] === 0 && mine[8] === 4 && mine[18] === 4, `"password", "123456" → 0; "correcthorsebatterystaple", random 14 chars → 4 (${mine})`);
  await score('password'); ok(/top-10 common|common password/i.test(await page.locator('.note-err').first().textContent()), 'warning for a very common password');
  const rows = await page.evaluate(() => [...document.querySelectorAll('.kv span')].map((e) => e.textContent));
  ok(rows.includes('Online attack, throttled (100/hour)') && rows.includes('Offline, fast hash (10 billion/second)') && rows.length === 10, 'guesses + 4 crack-time rows');
  // the breakdown must not undo the hidden password box: dots until "Show" is pressed (it used to print the pieces in clear)
  await score('MySecret#19/11/1988aaaa');
  const hiddenParts = (await page.locator('.zx-part b').allTextContents()).join(''), hiddenAll = await page.locator('.tool-body').innerText();
  ok(/^•+$/.test(hiddenParts) && hiddenParts.length === 23 && !/MySecret|1988|aaaa/.test(hiddenAll) && /press Show/.test(hiddenAll), `while the password is hidden its pieces are dots of the same length (${hiddenParts.length}) and no date or repeated text is shown`);
  ok(await page.locator('.zx-part').evaluateAll((els) => els.every((e) => !/MySecret|1988|"a"/.test(e.title))), 'the hover titles do not give the pieces away either');
  await page.getByRole('button', { name: 'Show' }).click(); await page.waitForFunction(() => /MySecret/.test(document.querySelector('.zx-seq')?.textContent || ''));
  ok(await pw.getAttribute('type') === 'text' && (await page.locator('.zx-part b').allTextContents()).join('') === 'MySecret#19/11/1988aaaa' && /1988-11-19/.test(await page.locator('.zx-date').textContent()) && !/press Show/.test(await page.locator('.tool-body').innerText()), 'Show reveals the password and the pieces together');
  await page.getByRole('button', { name: 'Hide' }).click(); await page.waitForFunction(() => /^•+$/.test([...document.querySelectorAll('.zx-part b')].map((e) => e.textContent).join('')));
  ok(await pw.getAttribute('type') === 'password', 'Hide masks both again');
  await page.getByRole('button', { name: 'Show' }).click(); // the checks below read the pieces
  await score('oiuytrfghjk'); ok(await page.locator('.zx-keyboard').count() >= 1, `keyboard walk detected (oiuytrfghjk: ${await page.locator('.zx-part').allTextContents()})`);
  await score('19/11/1988'); ok(await page.locator('.zx-date').count() === 1 && /1988-11-19/.test(await page.locator('.zx-date').textContent()), 'date detected (1988-11-19)');
  await score('abcdefgh'); ok(await page.locator('.zx-sequence').count() === 1, 'sequence detected');
  await score('aaaaaaaaaa'); ok(await page.locator('.zx-repeat').count() === 1, 'repeat detected');
  const before = await score('Ravindra1987!');
  await page.locator('input[aria-label="Personal words"]').fill('Ravindra Kulkarni ravindra@example.in'); await page.waitForTimeout(400);
  const after = +(/score (\d)/.exec(await page.locator('.strength-label').textContent())[1]);
  ok(after < before || (after === before && await page.locator('.zx-dictionary', { hasText: 'UserInputs' }).count() > 0), `your own name counts as a guessable word (score ${before} → ${after})`);
  // ---- bug hunt, Nov 2026: the numbers on the page = the reference estimator (tests/fixtures/zxcvbn/reference.json, Python zxcvbn)
  const REF = JSON.parse(readFileSync(new URL('../fixtures/zxcvbn/reference.json', import.meta.url), 'utf8')).passwords;
  const row = async (name) => page.evaluate((name) => { const s = [...document.querySelectorAll('.kv span')]; return s[s.findIndex((e) => e.textContent === name) + 1]?.textContent; }, name);
  const noDigits = REF.filter((x) => !/\d/.test(x.p) && Number(x.g) < 1e15 && x.p.length < 30).filter((_, i) => i % 3 === 0).slice(0, 45); // (no digits: the estimate of years and dates depends on today's date)
  const off = [];
  for (const x of noDigits) { const sc = await score(x.p); const shown = await row('Guesses needed'); if (sc !== x.s || shown !== Number(x.g).toLocaleString('en-IN')) off.push(`${x.p}: ${shown} (score ${sc}) vs ${Number(x.g).toLocaleString('en-IN')} (${x.s})`); }
  ok(noDigits.length >= 40 && !off.length, `"Guesses needed" and the score equal the reference for ${noDigits.length - off.length}/${noDigits.length} more passwords ${off.slice(0, 4).join(' | ')}`);
  const fixed = [];
  for (const p of ['TRUSTNO1', 'SUNSHINE1', 'AB12CD34', 'aaaaaaab', '1111112', 'zzzzzzzy', '!!!!!!!!', 'asdf;lkj', '~!@#$%^&*()_+']) { await score(p); const want = Number(REF.find((x) => x.p === p).g).toLocaleString('en-IN'), shown = await row('Guesses needed'); if (shown !== want) fixed.push(`${p}: ${shown} vs ${want}`); }
  ok(!fixed.length, `the engine bugs fixed in our patch stay fixed on the page (TRUSTNO1 was "2 guesses", aaaaaaab a "sequence", "!!!!!!!!" 40, keyboard walks 13 % low) ${fixed.join(' | ')}`);
  await score('aaaaaaab'); ok(await page.locator('.zx-sequence').count() === 0 && await page.locator('.zx-repeat').count() === 1, 'aaaaaaab: a repeat + one letter, no "sequence"');
  await score('Kolkata1'); ok((await page.locator('.zx-part').allTextContents()).join(' ') === 'Kolkatadictionary · English 1random', `a trailing "1" is shown as random, not as a word from a film list (${await page.locator('.zx-part').allTextContents()})`);
  // beyond what the estimator can count (2^64): no misleading "57 years"
  for (const p of ['q8T!vR2#nZ5&wL9@xK4$', 'correct horse battery staple correct horse', 'zQ9vX2mK7rT4nL8wP3yB6hD1sF5gJ0cA']) {
    const sc = await score(p); const all = await page.evaluate(() => [...document.querySelectorAll('.kv span')].map((e) => e.textContent));
    ok(sc === 4 && all.includes('more than 10^19 (beyond what the estimator counts)') && all.filter((x) => x === 'centuries').length === 3 && all.includes('more than 58 years (likely far longer)') && !all.some((x) => /^10\^19\.\d|^57 years/.test(x)), `${p.length} characters: "more than 10^19", centuries (was "10^19.3" and "57 years" for every long password)`);
  }
  const big = await score('Tr0ub4dor&3xyzzy'); const gRow = await row('Guesses needed'); ok(/^10\^\d\d\.\d$/.test(gRow) || /^[\d,]+$/.test(gRow), `large estimates are shown as a power of ten or with Indian digit grouping (${gRow}, score ${big})`);
  await score('zebra'); ok(/^[\d,]+$/.test(await row('Guesses needed')) && (await row('Online attack (10/second)')).length > 0 && (await row('Offline, slow hash (10k/second)')).length > 0, 'small estimates: plain number + all four time rows filled');
  // personal words: separators, short words ignored, changing the list re-runs the check
  const words = page.locator('input[aria-label="Personal words"]');
  await words.fill(''); const plainScore = await score('kulkarni@home'); const g0 = await row('Guesses needed');
  await words.fill('Ravindra;Kulkarni, r.kulkarni@example.in'); await page.waitForFunction((g) => { const s = [...document.querySelectorAll('.kv span')]; return s[s.findIndex((e) => e.textContent === 'Guesses needed') + 1]?.textContent !== g; }, g0, { timeout: 3000 }).catch(() => {});
  ok(await page.locator('.zx-dictionary', { hasText: 'UserInputs' }).count() >= 1 && (await row('Guesses needed')) !== g0, `words split on ; , . @ and spaces; "kulkarni@home" is now a guessable word (${g0} → ${await row('Guesses needed')}, score was ${plainScore})`);
  await words.fill('in at me'); await page.waitForTimeout(400); ok((await row('Guesses needed')) === g0, 'personal words of one or two letters are ignored');
  await words.fill('');
  // typing fast: only the last password is shown; show/hide button; long and unusual input
  await pw.fill('a'); await pw.fill('ab'); await pw.fill('correcthorsebatterystaple'); await page.waitForFunction(() => /score 4/.test(document.querySelector('.strength-label').textContent)); await page.waitForTimeout(300);
  ok(/score 4/.test(await page.locator('.strength-label').textContent()) && (await page.locator('.zx-part').count()) === 4, 'after fast typing the result is for the final password (4 words)');
  ok(await page.locator('.strength-meter.s4').count() === 1, 'meter shows 4 of 4');
  for (const p of ['🙂🙃🙂🙃🙂🙃🙂', 'नमस्ते दुनिया १२३', 'correct horse battery staple '.repeat(20), ' ', '\t']) { await pw.fill(p); await page.waitForTimeout(350); if (!/score \d/.test(await page.locator('.strength-label').textContent())) ok(false, `no result for ${JSON.stringify(p.slice(0, 20))}`); }
  ok(!page.errors.length, `emoji, Devanagari, a 560-character passphrase, a single space: all scored without an error ${page.errors.join(' | ')}`);
  await pw.fill(''); await page.waitForTimeout(200); ok(await page.locator('.strength-label').textContent() === '' && await page.locator('.kv').count() === 0, 'empty password clears the result');
  { const p2 = await newPage(); await p2.goto(`${base}#/pwstrength`); ok(await p2.locator('input[aria-label=Password]').getAttribute('type') === 'password', 'password hidden by default'); await p2.close(); }
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'pwstrength');
};
