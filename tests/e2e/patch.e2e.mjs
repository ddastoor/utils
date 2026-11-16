// Patch Applier (#/patch, PC only): diffs made here by GNU diff -u and by git diff are applied and the result compared
// byte for byte with GNU patch; reverse; counts; mismatching patch refused; no newline at end; files; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export default async (ctx) => {
  const { base, page: newPage, ok, tmp, info } = ctx;
  const dir = mkdtempSync(join(tmp, 'patch-'));
  const A = Array.from({ length: 60 }, (_, i) => `line ${i + 1}: ${['alpha', 'beta', 'gamma', 'delta'][i % 4]}`).join('\n') + '\n';
  const B = A.replace('line 3: gamma', 'line 3: GAMMA').replace('line 30: beta\n', '').replace('line 45: alpha', 'line 45: alpha\nnew line 45a\nnew line 45b') + 'appended\n';
  writeFileSync(join(dir, 'a.txt'), A); writeFileSync(join(dir, 'b.txt'), B);
  let diff; try { diff = execFileSync('diff', ['-u', 'a.txt', 'b.txt'], { cwd: dir }).toString(); } catch (e) { diff = e.stdout.toString(); }
  let gnu = null; try { writeFileSync(join(dir, 'p.diff'), diff); writeFileSync(join(dir, 'c.txt'), A); execFileSync('patch', ['-s', 'c.txt', 'p.diff'], { cwd: dir }); gnu = readFileSync(join(dir, 'c.txt'), 'utf8'); } catch { info('GNU patch not available — compared with the expected text only'); }
  const page = await newPage(); await page.goto(`${base}#/patch`);
  const [orig, pt] = [page.locator('textarea').nth(0), page.locator('textarea').nth(1)], res = page.locator('textarea').nth(2); await orig.waitFor();
  const apply = async (o, p) => { await orig.fill(o); await pt.fill(p); await page.waitForTimeout(300); return res.inputValue(); };
  let r = await apply(A, diff);
  ok(r === B && (gnu === null || r === gnu), `diff -u applied = the edited file${gnu !== null ? ' = GNU patch' : ''}`);
  const st = await page.locator('.note-ok').textContent(); ok(st === `Applied ${diff.match(/^@@/gm).length} hunks: +4 −2 lines.`, `status counts hunks and lines (${st})`);
  await page.locator('label.switch', { hasText: 'Reverse' }).click(); await orig.fill(B); await page.waitForTimeout(300);
  ok(await res.inputValue() === A, 'reverse: undoes the patch'); await page.locator('label.switch', { hasText: 'Reverse' }).click();
  // git diff with headers, two files (first used)
  execFileSync('git', ['init', '-q'], { cwd: dir }); execFileSync('git', ['add', 'a.txt'], { cwd: dir }); execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'a'], { cwd: dir });
  writeFileSync(join(dir, 'a.txt'), B); writeFileSync(join(dir, 'z.txt'), 'zzz\n'); execFileSync('git', ['add', '-N', 'z.txt'], { cwd: dir });
  const gd = execFileSync('git', ['diff'], { cwd: dir }).toString();
  r = await apply(A, gd); ok(r === B && /only the first file/.test(await page.locator('.note-ok').textContent()), 'git diff (index/mode lines, two files) → first file patched, note says so');
  await apply('totally different\ntext\n', diff); ok(/does not apply/.test(await page.locator('.note-warn').textContent()) && await res.inputValue() === '', 'patch on the wrong file → refused');
  await apply(A, 'not a diff'); ok(/No hunks found/.test(await page.locator('.note-warn').textContent()), 'non-diff text → message');
  const nl = '--- a\n+++ b\n@@ -1,2 +1,2 @@\n one\n-two\n\\ No newline at end of file\n+TWO\n\\ No newline at end of file\n';
  r = await apply('one\ntwo', nl); ok(r === 'one\nTWO', `"No newline at end of file" respected (${JSON.stringify(r)})`);
  await orig.fill(''); await pt.fill('');
  await page.locator('.drop input[type=file]').nth(0).setInputFiles(join(dir, 'b.txt')); writeFileSync(join(dir, 'r.diff'), diff);
  await page.locator('label.switch', { hasText: 'Reverse' }).click(); await page.locator('.drop input[type=file]').nth(1).setInputFiles(join(dir, 'r.diff')); await page.waitForTimeout(300);
  ok(await res.inputValue() === A, 'files opened from disk (original + .diff), reversed');
  const dl = await ctx.download(page, () => page.getByRole('button', { name: 'Download', exact: true }).click());
  ok(readFileSync(dl, 'utf8') === A && /b\.txt$/.test(dl), 'Download saves the result under the original file name');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'patch');
};
