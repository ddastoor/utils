// chmod Calculator (#/chmod, PC only): every one of the 512 basic modes round-trips octal → checkboxes → symbolic
// (compared with an independent ls -l formatter), special bits (setuid/setgid/sticky with s/S/t/T), symbolic input,
// chmod expressions (u+x, go-w, a=r, o+t) checked against expected results, invalid input, world-writable warning,
// presets, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
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
  ok(rows.includes('chmod 646 file') && rows.includes('chmod u=rw,g=r,o=rw file') && rows.includes('read, write'), 'commands and plain-language rows');
  await page.locator('.chip-btn', { hasText: '600 · private key' }).click(); ok(await syn.inputValue() === '-rw-------', 'preset 600 private key');
  await page.locator('label.switch', { hasText: 'sticky' }).click(); ok(await oct.inputValue() === '1600', 'sticky toggle → 1600');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'chmod');
};
