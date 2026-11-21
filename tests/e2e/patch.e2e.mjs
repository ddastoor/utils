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
  const st = await page.locator('.note-ok').textContent(); ok(st === `Applied ${diff.match(/^@@/gm).length} hunks: +4 −2 lines (b.txt).`, `status counts hunks and lines, and names the file (${st})`);
  await page.locator('label.switch', { hasText: 'Reverse' }).click(); await orig.fill(B); await page.waitForTimeout(300);
  ok(await res.inputValue() === A, 'reverse: undoes the patch'); await page.locator('label.switch', { hasText: 'Reverse' }).click();
  // git diff with headers, two files (first used)
  execFileSync('git', ['init', '-q'], { cwd: dir }); execFileSync('git', ['add', 'a.txt'], { cwd: dir }); execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'a'], { cwd: dir });
  writeFileSync(join(dir, 'a.txt'), B); writeFileSync(join(dir, 'z.txt'), 'zzz\n'); execFileSync('git', ['add', '-N', 'z.txt'], { cwd: dir });
  const gd = execFileSync('git', ['diff'], { cwd: dir }).toString();
  r = await apply(A, gd); ok(r === B && /covers 2 files; used the part for/.test((await page.locator('.tool-body .note-info').allTextContents()).join(' ')), 'git diff (index/mode lines, two files) → the file that fits is patched, note says which');
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
  // a Windows file (CR LF) and its patch as Windows PowerShell 5.1 saves `git diff > fix.diff`: UTF-16 with its mark, CR LF
  // (to-do #13) — the result keeps the file's line ends; it came back with LF, every line of the file changed
  await page.locator('label.switch', { hasText: 'Reverse' }).click(); await orig.fill(''); await pt.fill('');
  writeFileSync(join(dir, 'win.txt'), A.replace(/\n/g, '\r\n'));
  writeFileSync(join(dir, 'fix.diff'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(diff.replace(/\n/g, '\r\n'), 'utf16le')]));
  await page.locator('.drop input[type=file]').nth(0).setInputFiles(join(dir, 'win.txt')); await page.locator('.drop input[type=file]').nth(1).setInputFiles(join(dir, 'fix.diff')); await page.waitForTimeout(300);
  ok(await res.inputValue() === B && /win\.txt ends its lines with CR LF \(Windows\): Download keeps them/.test((await page.locator('.tool-body .note-info').allTextContents()).join(' ')), 'a Windows file and a UTF-16 patch from PowerShell: applied, and the tab says the line ends are kept');
  const dlw = await ctx.download(page, () => page.getByRole('button', { name: 'Download', exact: true }).click());
  ok(readFileSync(dlw, 'utf8') === B.replace(/\n/g, '\r\n') && /win\.txt$/.test(dlw), 'the saved file has CR LF line ends, as the original (GNU patch keeps them too)');
  await orig.fill(''); await page.locator('.drop input[type=file]').nth(0).setInputFiles(join(dir, 'b.txt')); await pt.fill(diff); await page.waitForTimeout(300);
  await page.locator('label.switch', { hasText: 'Reverse' }).click(); await page.waitForTimeout(300);
  const dlu = await ctx.download(page, () => page.getByRole('button', { name: 'Download', exact: true }).click());
  ok(readFileSync(dlu, 'utf8') === A && !(await page.locator('.tool-body .note-info').allTextContents()).some((n) => /CR LF/.test(n)), 'a Unix file opened after it: LF again, no note');
  await page.locator('label.switch', { hasText: 'Reverse' }).click();
  // ---- bug hunt, Nov 2026: patches as people have them (the old reader refused most of these)
  if (await page.locator('label.switch', { hasText: 'Reverse' }).locator('input').isChecked()) await page.locator('label.switch', { hasText: 'Reverse' }).click();
  const O2 = 'one\ntwo\nthree\nfour\nfive\n', W2 = 'one\nTWO\nthree\nfour\n5\n', H2 = '@@ -1,5 +1,5 @@\n one\n-two\n+TWO\n three\n four\n-five\n+5\n';
  const run2 = async (o, p2) => { await orig.fill(o); await pt.fill(p2); await page.waitForTimeout(330); return { out: await res.inputValue(), notes: (await page.locator('.tool-body .note').allTextContents()).join(' | ') }; };
  const forms2 = { 'git show': `commit 3f2a\nAuthor: A <a@example.in>\n\n    Fix numbers\n    --- see ticket ---\n\ndiff --git a/a.txt b/a.txt\nindex 1..2 100644\n--- a/a.txt\n+++ b/a.txt\n${H2}`, 'git format-patch': `From 3f2a Mon Sep 17 00:00:00 2001\nSubject: [PATCH] Fix\n\n---\n a.txt | 4 ++--\n 1 file changed, 2 insertions(+), 2 deletions(-)\n\ndiff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n${H2}-- \n2.43.0\n`,
    'svn Index header': `Index: a.txt\n===================================================================\n--- a.txt\t(revision 7)\n+++ a.txt\t(working copy)\n${H2}`, 'a ```diff fence': `Fix:\n\n\`\`\`diff\n${H2}\`\`\`\n`, 'hunk alone after blank lines': `\n\n${H2}`, 'git rename + edit': `diff --git a/old.txt b/new.txt\nsimilarity index 80%\nrename from old.txt\nrename to new.txt\n--- a/old.txt\n+++ b/new.txt\n${H2}` };
  const fbad = []; for (const [name, p2] of Object.entries(forms2)) { const r2 = await run2(O2, p2); if (r2.out !== W2 || !/Applied 1 hunk: \+2 −2 lines/.test(r2.notes)) fbad.push(`${name}: ${r2.notes.slice(0, 70)}`); }
  ok(!fbad.length, `the same change as 6 kinds of patch (git show, format-patch with diffstat and signature, SVN, a fenced block, a bare hunk, a rename) applies ${fbad.join(' | ')}`);
  let r2 = await run2('-- header\nselect 1;\n-- old\nselect 3;\n', '--- a.sql\n+++ b.sql\n@@ -1,4 +1,3 @@\n -- header\n select 1;\n--- old\n select 3;\n'); ok(r2.out === '-- header\nselect 1;\nselect 3;\n', 'removing an SQL comment line ("-- old") works (it used to be read as a file header: "could not read the patch")');
  const big2 = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\n') + '\n', bd = '@@ -20,3 +20,3 @@\n line 20\n-line 21\n+LINE 21\n line 22\n';
  r2 = await run2(`x\ny\nz\n${big2}`, bd); ok(r2.out === `x\ny\nz\n${big2.replace('line 21\n', 'LINE 21\n')}` && /Found 3 lines lower than the patch says/.test(r2.notes), 'a file that gained 3 lines above: the hunk is found, with a note');
  r2 = await run2('one  \ntwo\nthree\nfour \nfive\n', H2); ok(r2.out === 'one  \nTWO\nthree\nfour \n5\n' && /ignoring spaces at the ends of lines/.test(r2.notes), 'trailing spaces in the file do not stop the patch');
  r2 = await run2('ONE\ntwo\nthree\nfour\nfive\n', H2); ok(r2.out === 'ONE\nTWO\nthree\nfour\n5\n' && /fuzz 1/.test(r2.notes), 'one context line differs: applied with fuzz 1 and said so');
  r2 = await run2(W2, H2); ok(r2.out === '' && /already applied.*Tick “Reverse”/.test(r2.notes), 'a patch that is already applied says so and suggests Reverse (was a bare "does not apply")');
  r2 = await run2('x\ny\n', H2); ok(r2.out === '' && /hunk 1 of 1 \(@@ -1 …\) does not match this text.*“one”/.test(r2.notes), 'a patch for another file names the hunk and the line it could not find');
  const two2 = `diff --git a/first.txt b/first.txt\n--- a/first.txt\n+++ b/first.txt\n${H2}diff --git a/second.txt b/second.txt\n--- a/second.txt\n+++ b/second.txt\n@@ -1,2 +1,2 @@\n x\n-y\n+Y\n`;
  r2 = await run2('x\ny\n', two2); ok(r2.out === 'x\nY\n' && /covers 2 files; used the part for second\.txt/.test(r2.notes), 'a diff of two files: the part that fits the text is used, whichever it is');
  r2 = await run2('a\r\nb\r\nc\r\n', '@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n'); ok(r2.out.replace(/\r/g, '') === 'a\nB\nc\n', 'Windows line ends in the original');
  r2 = await run2('a\nb', '@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+B\n\\ No newline at end of file\n'); ok(r2.out === 'a\nB', '"\\ No newline at end of file" is honoured');
  r2 = await run2(O2, 'see @@ here'); ok(r2.out === '' && /No hunks found/.test(r2.notes), 'text that only mentions @@ is not a patch (it used to "apply 0 hunks")');
  r2 = await run2('', '--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,2 @@\n+hello\n+world\n'); ok(r2.out === 'hello\nworld\n', 'a patch that creates a file, applied to an empty box');
  // against GNU diff + patch from this machine
  try {
    const w = mkdtempSync(join(tmp, 'pe-')); let made = 0; const gbad2 = [];
    for (let c = 0; c < 8; c++) {
      const Aa = Array.from({ length: 120 }, (_, i) => `row ${i} ${'abc'[(i * 7 + c) % 3]}`), Bb = [...Aa]; Bb[10 + c] = 'changed here'; Bb.splice(60 + c, 2); Bb.splice(100, 0, `-- inserted ${c}`, `++ also ${c}`);
      writeFileSync(join(w, 'a.txt'), Aa.join('\n') + '\n'); writeFileSync(join(w, 'b.txt'), Bb.join('\n') + (c % 2 ? '' : '\n'));
      let dtxt = ''; try { execFileSync('diff', [`-U${c % 4}`, join(w, 'a.txt'), join(w, 'b.txt')]); } catch (e) { dtxt = e.stdout.toString(); }
      execFileSync('patch', ['-s', join(w, 'a.txt'), '-i', '-'], { input: dtxt }); const gnu = readFileSync(join(w, 'a.txt'), 'utf8'); made++;
      const o2 = await run2(Aa.join('\n') + '\n', dtxt); if (o2.out !== gnu) gbad2.push(`case ${c}`);
    }
    ok(made === 8 && !gbad2.length, `8 patches made by GNU diff (context 0–3, lines starting with "-- " and "++ ", no final newline) give the same text as GNU patch ${gbad2.join(' ')}`);
  } catch (e) { if (!/ENOENT/.test(String(e))) throw e; }
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'patch');
};
