// Password Strength (#/pwstrength, PC only): scores for 20 passwords equal the Python port of zxcvbn (the reference
// algorithm), crack-time rows, warnings for common passwords, personal words lower the score, the pattern breakdown
// (dictionary, keyboard, date, sequence, repeat), the engine loads only with the first password, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
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
  await score('oiuytrfghjk'); ok(await page.locator('.zx-keyboard').count() >= 1, `keyboard walk detected (oiuytrfghjk: ${await page.locator('.zx-part').allTextContents()})`);
  await score('19/11/1988'); ok(await page.locator('.zx-date').count() === 1 && /1988-11-19/.test(await page.locator('.zx-date').textContent()), 'date detected (1988-11-19)');
  await score('abcdefgh'); ok(await page.locator('.zx-sequence').count() === 1, 'sequence detected');
  await score('aaaaaaaaaa'); ok(await page.locator('.zx-repeat').count() === 1, 'repeat detected');
  const before = await score('Ravindra1987!');
  await page.locator('input[aria-label="Personal words"]').fill('Ravindra Kulkarni ravindra@example.in'); await page.waitForTimeout(400);
  const after = +(/score (\d)/.exec(await page.locator('.strength-label').textContent())[1]);
  ok(after < before || (after === before && await page.locator('.zx-dictionary', { hasText: 'UserInputs' }).count() > 0), `your own name counts as a guessable word (score ${before} → ${after})`);
  await pw.fill(''); await page.waitForTimeout(200); ok(await page.locator('.strength-label').textContent() === '' && await page.locator('.kv').count() === 0, 'empty password clears the result');
  ok(await pw.getAttribute('type') === 'password', 'password hidden by default');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'pwstrength');
};
