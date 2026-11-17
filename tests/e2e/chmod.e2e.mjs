// chmod Calculator (#/chmod, PC only): every one of the 512 basic modes round-trips octal → checkboxes → symbolic
// (compared with an independent ls -l formatter), special bits (setuid/setgid/sticky with s/S/t/T), symbolic input,
// chmod expressions (u+x, go-w, a=r, o+t) checked against expected results, invalid input, world-writable warning,
// presets; every printed command and 1,152 chmod expressions are run with the real chmod (files and folders) and read
// back with stat; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const sym = (m) => { const t = (b, sp, ch) => (b & 4 ? 'r' : '-') + (b & 2 ? 'w' : '-') + (sp ? (b & 1 ? ch : ch.toUpperCase()) : b & 1 ? 'x' : '-'); return '-' + t((m >> 6) & 7, m & 0o4000, 's') + t((m >> 3) & 7, m & 0o2000, 's') + t(m & 7, m & 0o1000, 't'); };
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/chmod`);
  const oct = page.locator('input[aria-label=Octal]'), syn = page.locator('input[aria-label=Symbolic]'); await oct.waitFor();
  ok(await oct.inputValue() === '755' && await syn.inputValue() === '-rwxr-xr-x', 'default 755 = -rwxr-xr-x');
  const res = await page.evaluate(async () => {
    const o = document.querySelector('input[aria-label=Octal]'), s = document.querySelector('input[aria-label=Symbolic]'), out = [];
    const boxes = [...document.querySelectorAll('.chmod-grid input')];
    for (let m = 0; m < 512; m++) { o.value = m.toString(8).padStart(3, '0'); o.dispatchEvent(new Event('input')); out.push([s.value, boxes.map((b) => (b.checked ? 1 : 0)).join('')]); }
    return out;
  });
  const bad = res.map(([s, b], m) => (s !== sym(m) || b !== m.toString(2).padStart(9, '0') ? m.toString(8) : null)).filter(Boolean);
  ok(!bad.length, `all 512 modes: symbolic form and the 9 checkboxes match (${bad.slice(0, 5)})`);
  const setO = async (v) => { await oct.fill(v); return syn.inputValue(); };
  ok(await setO('4755') === '-rwsr-xr-x' && await setO('4644') === '-rwSr--r--' && await setO('2750') === '-rwxr-s---' && await setO('1777') === '-rwxrwxrwt' && await setO('1776') === '-rwxrwxrwT', 'special bits: s/S and t/T');
  await syn.fill('-rw-r-----'); ok(await oct.inputValue() === '640', 'symbolic → octal 640');
  await syn.fill('drwxr-sr-x'); ok(await oct.inputValue() === '2755', 'directory with setgid → 2755');
  const before = await syn.inputValue(); await oct.fill('9'); ok(await oct.evaluate((e) => e.classList.contains('bad')) && await syn.inputValue() === before, 'invalid octal marked, mode unchanged');
  const ex = page.locator('input[aria-label=Change]'), apply = async (start, e) => { await oct.fill(start); await ex.fill(e); await page.getByRole('button', { name: 'Apply', exact: true }).click(); return oct.inputValue(); };
  const cases = [['644', 'u+x', '744'], ['777', 'go-w', '755'], ['000', 'a=r', '444'], ['755', 'o=', '750'], ['644', '+x', '755'], ['755', 'u+s', '4755'], ['777', 'o+t', '1777'], ['640', 'u=rwx,g=rx,o=r', '754'], ['4755', 'u-s', '755']];
  const got = []; for (const [s, e] of cases) got.push(await apply(s, e));
  ok(JSON.stringify(got) === JSON.stringify(cases.map((c) => c[2])), `chmod expressions ${cases.map((c, i) => `${c[0]} ${c[1]} → ${got[i]}`).join(', ')}`);
  await apply('644', 'z+q'); ok(await ex.evaluate((e) => e.classList.contains('bad')) && await oct.inputValue() === '644', 'invalid expression refused');
  page.errors.splice(0, page.errors.length, ...page.errors.filter((e) => !/Use who/.test(e)));
  await page.locator('.chmod-grid input[aria-label="Others write"]').check(); ok(await oct.inputValue() === '646' && /world-writable/.test(await page.locator('.note-warn').textContent()), 'ticking "Others write" → 646 + world-writable warning');
  const rows = await page.evaluate(() => [...document.querySelectorAll('.kv span')].map((e) => e.textContent));
  ok(rows.includes('chmod 646 folder') && rows.includes('chmod u=rw,g=r,o=rw folder') && rows.includes('read, write'), 'commands and plain-language rows (still a folder from the line typed above)');
  await page.locator('.chip-btn', { hasText: '600 · private key' }).click(); ok(await syn.inputValue() === '-rw-------', 'preset 600 private key');
  await page.locator('label.switch', { hasText: 'sticky' }).click(); ok(await oct.inputValue() === '1600', 'sticky toggle → 1600');
  // ---- bug hunt, Nov 2026: every command the tab prints is run with the real chmod (GNU coreutils) and read back with stat
  await syn.fill('-rwxr-xr-x'); // (an earlier check typed a folder line: back to a file)
  const work = mkdtempSync(join(tmpdir(), 'chmod-')), f = join(work, 'file'), d = join(work, 'dir'); writeFileSync(f, ''); mkdirSync(d);
  const all = await page.evaluate(() => {
    const o = document.querySelector('input[aria-label=Octal]'), out = [], row = (name) => { const s = [...document.querySelectorAll('.kv span')]; return s[s.findIndex((e) => e.textContent === name) + 1].textContent; };
    for (let sp = 0; sp < 8; sp++) for (const u of [0, 4, 5, 6, 7]) for (const g of [0, 4, 5, 7]) for (const w of [0, 1, 4, 5, 6]) { o.value = `${sp || ''}${u}${g}${w}`; o.dispatchEvent(new Event('input')); out.push([parseInt(o.value, 8), row('Command'), row('Symbolic command'), document.querySelector('input[aria-label=Symbolic]').value]); }
    return out;
  });
  const sh = (script) => execFileSync('bash', ['-c', script], { cwd: work }).toString().trim().split('\n');
  const q = (c) => c.replace(/ file$/, ' file').replace(/^chmod /, 'chmod -- ');
  let got2 = sh(`umask 0\n${all.map(([, c]) => `chmod 0 file; ${q(c)}; stat -c '%a %A' file`).join('\n')}`);
  let wrong2 = all.filter(([m, , , sy], i) => got2[i] !== `${m.toString(8)} ${sy}`).map(([m, c], i) => `${c} → ${got2[i]} (wanted ${m.toString(8)})`);
  ok(all.length === 800 && !wrong2.length, `"chmod <octal> file" for 800 modes (all 8 setuid/setgid/sticky combinations): real chmod + stat give the mode and the ls -l text shown ${wrong2.slice(0, 3).join(' | ')}`);
  for (const start of ['0', '7777']) {
    got2 = sh(`umask 0\n${all.map(([, , c]) => `chmod ${start} file; ${q(c)}; stat -c '%a' file`).join('\n')}`);
    wrong2 = all.filter(([m], i) => got2[i] !== m.toString(8)).map(([m, , c], i) => `${c} → ${got2[i]} (wanted ${m.toString(8)})`);
    ok(!wrong2.length, `"Symbolic command" for the same 800 modes, applied by the real chmod to a file that was ${start}: exact mode incl. s and t (used to drop setuid/setgid/sticky) ${wrong2.slice(0, 3).join(' | ')}`);
  }
  // the "Change with chmod syntax" box = GNU chmod, for files and folders
  const exprs = ['u+x', 'go-w', 'a=r', 'o=', '+x', 'u+s', 'g+s', 'o+t', '+t', 'a+s', 'u-s', 'g-s', '-t', 'o+s', 'u+t', 'u=rwx,g=rx,o=r', 'ug=rw,o=', 'a+rwx', 'a-rwx', 'u+rw-x', 'go=rx', 'g=u', 'o=g', 'u=g', 'go=u', 'g+u', 'o-u', 'a=u', 'a+X', 'u+x,go+X', 'go+X', 'a-x+X', 'u=rwxs', 'g=rxs', 'o=rwxt', 'u=s', 'ug+s,o+t', 'a=', '=rx', '-w', 'u+r,g+r,o+r', 'o=rwx,o-w', 'g=u,u=', 'u=rwX', 'go=', 'ugo+x', 'a=rwxst', 'u+w,g-w,o=r'];
  const starts = ['0', '644', '755', '600', '4755', '2775', '1777', '7777', '444', '111', '750', '6711'];
  const mine = await page.evaluate(async ({ exprs, starts }) => {
    const o = document.querySelector('input[aria-label=Octal]'), sy = document.querySelector('input[aria-label=Symbolic]'), ex = document.querySelector('input[aria-label=Change]'), btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Apply'), out = [];
    for (const dir of [false, true]) for (const st of starts) for (const e of exprs) {
      o.value = st; o.dispatchEvent(new Event('input')); sy.value = (dir ? 'd' : '-') + sy.value.slice(1); sy.dispatchEvent(new Event('input'));
      ex.value = e; btn.click(); out.push([dir, st, e, o.value, sy.value]);
    }
    return out;
  }, { exprs, starts });
  const real = sh(`umask 0\n${mine.map(([dir, st, e]) => `chmod ${dir ? `0${st.padStart(4, '0')}` : st} ${dir ? 'dir' : 'file'}; chmod -- ${e} ${dir ? 'dir' : 'file'} 2>/dev/null; stat -c '%a %A' ${dir ? 'dir' : 'file'}`).join('\n')}`);
  const norm = (o8) => String(parseInt(o8, 8).toString(8));
  const diff = mine.filter(([, , , o8, sy], i) => `${norm(o8)} ${sy}` !== real[i]).map(([dir, st, e, o8, sy], i) => `${dir ? 'dir' : 'file'} ${st} ${e}: tab ${o8} ${sy}, chmod ${real[i]}`);
  ok(mine.length === 2 * starts.length * exprs.length && !diff.length, `${mine.length} chmod expressions (${exprs.length} × ${starts.length} starting modes × file/folder: g=u copies, X, chained operators, s/t rules, folders keeping setuid/setgid on "=") give what GNU chmod gives ${diff.slice(0, 4).join(' | ')} ${diff.length > 4 ? `(+${diff.length - 4})` : ''}`);
  chmodSync(d, 0o755); rmSync(work, { recursive: true, force: true });
  await syn.fill('-rw-r--r--');
  await oct.fill('644'); await ex.fill('+w'); await ex.press('Enter');
  ok(await oct.inputValue() === '666' && /umask/.test(await page.locator('.note-info', { hasText: 'umask' }).textContent()), 'Enter applies; "+w" without u/g/o explains that the real chmod also applies the umask');
  await ex.fill('u+x'); await ex.press('Enter'); ok(await page.locator('.note-info', { hasText: 'umask' }).count() === 0 && await oct.inputValue() === '766', 'the umask note goes away for u+x');
  for (const bad of ['u+q', 'x+r', 'u+', 'u++x', '755', 'u=rwx g=rx', 'u+x,', '']) { await oct.fill('640'); await ex.fill(bad); await page.getByRole('button', { name: 'Apply', exact: true }).click(); if (bad === 'u+' || bad === 'u++x') continue; if (!(await ex.evaluate((e) => e.classList.contains('bad'))) || await oct.inputValue() !== '640') { ok(false, `"${bad}" should be refused`); } }
  await oct.fill('640'); await ex.fill('u+'); await page.getByRole('button', { name: 'Apply', exact: true }).click(); ok(await oct.inputValue() === '640' && !(await ex.evaluate((e) => e.classList.contains('bad'))), '"u+" (nothing to add) is valid and changes nothing, as in chmod');
  ok(true, 'malformed expressions (u+q, x+r, 755, missing comma, trailing comma, empty) are refused and leave the mode alone');
  page.errors.splice(0, page.errors.length, ...page.errors.filter((e) => !/Use who/.test(e)));
  // the Symbolic box: folder / link type letters are kept, nine-letter form, invalid text
  await syn.fill('drwxr-x---'); ok(await oct.inputValue() === '750' && (await page.evaluate(() => [...document.querySelectorAll('.kv span')].map((e) => e.textContent))).includes('drwxr-x---'), 'typing a folder (d…) keeps the d in the result');
  await ex.fill('a+X'); await ex.press('Enter'); ok(await syn.inputValue() === 'drwxr-x--x' && await oct.inputValue() === '751', 'a+X on a folder adds search permission for everyone (a file without x bits would stay)');
  const rowsNow = () => page.evaluate(() => { const s = [...document.querySelectorAll('.kv span')].map((e) => e.textContent), o = {}; for (let i = 0; i + 1 < s.length; i += 2) o[s[i]] = s[i + 1]; return o; });
  let rr = await rowsNow(); ok(rr.Command === 'chmod 751 folder' && rr['Symbolic command'] === 'chmod u=rwx,g=rx,o=x folder' && await page.locator('label.switch', { hasText: 'folder' }).locator('input').isChecked(), 'folder: the switch is on and the commands say "folder"');
  ok(/keeps a folder’s setuid \/ setgid.*chmod u-s,g-s folder.*chmod 00751 folder/.test(await page.locator('.note-info', { hasText: 'Folders' }).textContent()), 'folder note: GNU chmod keeps setuid/setgid unless cleared on purpose (u-s,g-s or a five-digit mode)');
  { const w2 = mkdtempSync(join(tmpdir(), 'chmod-')), d2 = join(w2, 'folder'); mkdirSync(d2);
    const out = execFileSync('bash', ['-c', "chmod 6777 folder; chmod 751 folder; stat -c %a folder; chmod 00751 folder; stat -c %a folder; chmod 6777 folder; chmod u-s,g-s folder; stat -c %a folder"], { cwd: w2 }).toString().trim().split('\n');
    ok(out.join() === '6751,751,777', `…which is what GNU chmod does here: chmod 751 leaves ${out[0]}, chmod 00751 gives ${out[1]}, u-s,g-s clears the bits`); rmSync(w2, { recursive: true, force: true }); }
  await page.locator('label.switch', { hasText: 'folder' }).click(); ok(await syn.inputValue() === '-rwxr-x--x' && (await rowsNow()).Command === 'chmod 751 file' && await page.locator('.note-info', { hasText: 'Folders' }).count() === 0, 'switching "folder" off → file again');
  await syn.fill('rw-rw-r--'); ok(await oct.inputValue() === '664', 'nine letters without the type letter accepted');
  await syn.fill('lrwxrwxrwx'); ok(await oct.inputValue() === '777', 'symbolic link line (l…) accepted');
  for (const bad of ['rwxrwxrw', '-rwxrwxrwxx', '-wrxrwxrwx', 'rwsrwsrws', '-rwxrwxrwz']) { await oct.fill('600'); await syn.fill(bad); if (!(await syn.evaluate((e) => e.classList.contains('bad'))) || await oct.inputValue() !== '600') ok(false, `symbolic "${bad}" should be refused`); }
  ok(true, 'malformed ls -l text is marked and ignored');
  for (const [v, want] of [['0755', '755'], ['7', '007'], ['77', '077'], ['0000', '000'], ['7777', '7777']]) { await oct.fill(v); const r = await page.evaluate(() => { const s = [...document.querySelectorAll('.kv span')]; return s[s.findIndex((e) => e.textContent === 'Octal') + 1].textContent; }); if (r !== want) ok(false, `octal ${v} → ${r}, wanted ${want}`); }
  ok(true, 'octal with 1–4 digits: leading zero dropped, short forms padded (7 → 007)');
  for (const bad of ['8', '75a', '77777', '-1', '7 5 5']) { await oct.fill('644'); await oct.fill(bad); if (!(await oct.evaluate((e) => e.classList.contains('bad')))) ok(false, `octal "${bad}" should be marked`); }
  await oct.fill('4711'); ok(/setuid/.test(await page.locator('.note-info', { hasText: 'setuid' }).textContent()), 'setuid note');
  const plain = async (m) => { await oct.fill(m); const s = await page.evaluate(() => [...document.querySelectorAll('.kv span')].map((e) => e.textContent)); return [s[s.indexOf('Owner can') + 1], s[s.indexOf('Group can') + 1], s[s.indexOf('Others can') + 1]].join(' / '); };
  ok(await plain('750') === 'read, write, execute / read, execute / nothing' && await plain('421') === 'read / write / execute', 'plain-language rows for 750 and 421');
  const boxesNow = async () => page.evaluate(() => [...document.querySelectorAll('.chmod-grid input')].map((b) => (b.checked ? 1 : 0)).join(''));
  await oct.fill('000'); for (const l of ['Owner read', 'Group write', 'Others execute']) await page.locator(`.chmod-grid input[aria-label="${l}"]`).check();
  ok(await oct.inputValue() === '421' && await boxesNow() === '100010001' && await syn.inputValue() === '-r---w---x', 'ticking boxes builds 421');
  for (const [label, o8] of [['setuid', '4421'], ['setgid', '6421'], ['sticky', '7421']]) { await page.locator('label.switch', { hasText: label }).click(); if (await oct.inputValue() !== o8) ok(false, `${label} toggle → ${await oct.inputValue()}`); }
  ok(await syn.inputValue() === '-r-S-wS--t', `all three special switches on → 7421 = ${await syn.inputValue()}`);
  const chips = await page.locator('.chip-btn').allTextContents(); const chipBad = [];
  for (const c of chips) { await page.locator('.chip-btn', { hasText: c }).click(); if (await oct.inputValue() !== c.split(' ')[0]) chipBad.push(c); }
  ok(chips.length === 7 && !chipBad.length, `all ${chips.length} presets set their mode ${chipBad}`);
  await page.locator('.chip-btn', { hasText: '1777 · /tmp' }).click(); ok(await syn.inputValue() === 'drwxrwxrwt', 'the /tmp preset is a folder: drwxrwxrwt'); await page.locator('.chip-btn', { hasText: '600 · private key' }).click(); ok(await syn.inputValue() === '-rw-------', 'the private-key preset is a file');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'chmod');
};
