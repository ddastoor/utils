// Text Diff (#/diff), to-do #14: two local files (their names in the patch, line ends, a file that is not text) and a file
// of a public GitHub repository at two commits — GitHub's answers stood in for with page.route (raw.githubusercontent.com:
// the file at a commit; api.github.com: a branch, a tag or a short hash made a full commit, a file that is not there, the
// hour's limit). The patches are applied by GNU patch and git apply, and the two files' patch is held to GNU diff -u.
import { writeFileSync, readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from '../lib/child.mjs';

const A_SHA = '1f0e3d2c4b5a69788796a5b4c3d2e1f00f1e2d3c', B_SHA = '9a8b7c6d5e4f30211203f4e5d6c7b8a99a8b7c6d';
const OLD = 'alpha\nbeta\ngamma\ndelta\nepsilon\nzeta\neta\ntheta\n', NEW = 'alpha\nbeta\nGAMMA\ndelta\nepsilon\nzeta\neta\ntheta\niota\n';

export default async ({ base, page: newPage, ok, download, tmp }) => {
  const page = await newPage();
  const asked = []; page.on('request', (r) => { if (!r.url().startsWith(base)) asked.push(r.url()); });
  let limit = false;
  await page.route('https://raw.githubusercontent.com/**', (route) => {
    const u = new URL(route.request().url()), [, owner, repo, ref, ...p] = u.pathname.split('/').map(decodeURIComponent), path = p.join('/');
    const files = { [`${A_SHA}:src/app.txt`]: OLD, [`${B_SHA}:src/app.txt`]: NEW, [`${B_SHA}:logo.png`]: '\x89PNG\r\n\x1a\n\0\0\0\rIHDR' };
    const body = owner === 'octo' && repo === 'demo' ? files[`${ref}:${path}`] : undefined;
    return route.fulfill(body === undefined ? { status: 404, body: '404: Not Found', headers: { 'access-control-allow-origin': '*' } } : { status: 200, body, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' } });
  });
  await page.route('https://api.github.com/**', (route) => {
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json', 'access-control-expose-headers': 'ETag, Link, Location, Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Used, X-RateLimit-Resource, X-RateLimit-Reset' }; // as GitHub sends them
    if (limit) return route.fulfill({ status: 403, body: '{"message":"API rate limit exceeded"}', headers: { ...h, 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 1800) } });
    const m = /^\/repos\/([^/]+)\/([^/]+)(?:\/commits\/(.+))?$/.exec(new URL(route.request().url()).pathname);
    if (!m || m[1] !== 'octo' || m[2] !== 'demo') return route.fulfill({ status: 404, body: '{"message":"Not Found"}', headers: h });
    if (!m[3]) return route.fulfill({ status: 200, body: '{"full_name":"octo/demo"}', headers: h });
    const ref = decodeURIComponent(m[3]), sha = { main: B_SHA, 'v1.0': A_SHA, '1f0e3d2': A_SHA, [A_SHA]: A_SHA, [B_SHA]: B_SHA }[ref];
    return route.fulfill(sha ? { status: 200, body: JSON.stringify({ sha }), headers: h } : { status: 422, body: '{"message":"No commit found for SHA"}', headers: h });
  });
  await page.goto(base + '#/diff');
  const info = page.locator('.card', { hasText: 'Differences' }).locator('.muted.small').first();
  const say = (t) => page.locator('.diff-out, .card').filter({ hasText: t }).first().isVisible().catch(() => false);
  const work = mkdtempSync(join(tmpdir(), 'diffsrc-'));

  // ---- two files
  await page.getByRole('radio', { name: 'Two files' }).click();
  ok(await page.getByText('Choose both files.').isVisible(), 'two files: "Choose both files." until both are chosen');
  const fa = join(work, 'old notes.txt'), fb = join(work, 'new notes.txt');
  writeFileSync(fa, OLD); writeFileSync(fb, NEW);
  const pick = (label) => page.locator('.drop', { hasText: label }).locator('input[type=file]');
  await pick('Original file').setInputFiles(fa);
  await pick('Changed file').setInputFiles(fb);
  await page.waitForFunction(() => /line/.test(document.querySelector('#diff-file-b')?.textContent || '') && /added|removed|changed/i.test(document.body.innerText), null, { timeout: 30000 });
  ok(/old notes\.txt · 8 lines/.test(await page.locator('#diff-file-a').innerText()) && /new notes\.txt · 9 lines/.test(await page.locator('#diff-file-b').innerText()), 'each file named with its lines');
  const pf = await download(page, () => page.getByRole('button', { name: 'Download .patch' }).click());
  const patch = readFileSync(pf, 'utf8');
  ok(/new notes\.txt\.patch$/.test(pf) && patch.startsWith('--- old notes.txt\n+++ new notes.txt\n@@'), `the patch names the files and is named after the changed one (${pf.split(/[\\/]/).pop()}: ${patch.split('\n').slice(0, 2).join(' | ')})`);
  // held to GNU diff -u (the hunks) and applied by GNU patch
  let gnu = ''; try { execFileSync('diff', ['-u', fa, fb], { encoding: 'utf8' }); } catch (e) { gnu = e.stdout; }
  ok(gnu && patch.split('\n').slice(2).join('\n') === gnu.split('\n').slice(2).join('\n'), 'its hunks are GNU diff -u\'s');
  const copyA = join(work, 'applied.txt'); writeFileSync(copyA, OLD);
  execFileSync('patch', ['-s', copyA, pf]);
  ok(readFileSync(copyA, 'utf8') === NEW, 'GNU patch turns the original into the changed file with it');
  // line ends only
  writeFileSync(join(work, 'crlf.txt'), OLD.replace(/\n/g, '\r\n'));
  await pick('Changed file').setInputFiles(join(work, 'crlf.txt'));
  await page.waitForFunction(() => /differ only in their line ends/.test(document.body.innerText), null, { timeout: 30000 });
  ok(true, 'a pair that differs only in line ends (CR LF / LF): said');
  // a file that is not text
  await pick('Changed file').setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]) });
  await page.waitForFunction(() => /photo\.jpg is not a text file — only text files can be compared/.test(document.body.innerText), null, { timeout: 30000 });
  ok(await page.getByText('Choose both files.').isVisible(), 'a file that is not text: said, and no comparison');

  // ---- a file on GitHub
  await page.getByRole('radio', { name: 'A file on GitHub' }).click();
  await page.getByLabel('Repository').fill('https://github.com/octo/demo/blob/v1.0/src/app.txt');
  ok(await page.getByLabel('File').inputValue() === 'src/app.txt' && await page.getByLabel('From commit').inputValue() === 'v1.0', 'a file\'s github.com address fills the path and the first commit');
  await page.getByLabel('To commit').fill('main');
  await page.getByRole('button', { name: 'Compare' }).click();
  await page.waitForFunction(() => /octo\/demo · src\/app\.txt · 1f0e3d2 → 9a8b7c6/.test(document.querySelector('#diff-gh')?.textContent || ''), null, { timeout: 30000 });
  ok(/1 line added/.test(await info.innerText()) || /added/.test(await info.innerText()), `the file at the two commits compared: ${await info.innerText()}`);
  const gp = await download(page, () => page.getByRole('button', { name: 'Download .patch' }).click());
  const g = readFileSync(gp, 'utf8');
  ok(/app\.txt\.patch$/.test(gp) && g.startsWith(`Changes to src/app.txt in octo/demo on GitHub\nfrom commit ${A_SHA} (v1.0)\nto commit ${B_SHA} (main)\n\ndiff --git a/src/app.txt b/src/app.txt\n--- a/src/app.txt\n+++ b/src/app.txt\n@@`), `the patch: the commits noted, git's headers (${gp.split(/[\\/]/).pop()})`);
  const repo = join(work, 'repo'); mkdirSync(join(repo, 'src'), { recursive: true }); writeFileSync(join(repo, 'src/app.txt'), OLD);
  execFileSync('git', ['init', '-q'], { cwd: repo });
  // (core.autocrlf off: Git for Windows writes the patched file with \r\n by default — the user's setting, not the patch)
  execFileSync('git', ['-c', 'core.autocrlf=false', 'apply', gp], { cwd: repo });
  ok(readFileSync(join(repo, 'src/app.txt'), 'utf8') === NEW, 'git apply takes it at the repository\'s root');
  writeFileSync(join(repo, 'src/app.txt'), OLD);
  execFileSync('patch', ['-p1', '-s', '-i', gp], { cwd: repo });
  ok(readFileSync(join(repo, 'src/app.txt'), 'utf8') === NEW, '… and GNU patch -p1');
  ok(asked.every((u) => /^https:\/\/(raw\.githubusercontent\.com\/octo\/demo\/|api\.github\.com\/repos\/octo\/demo(\/|$))/.test(u)) && asked.some((u) => u.includes(`/demo/${A_SHA}/src/app.txt`)), `only GitHub was asked, and only for the repository, the path and the commits (${asked.length} requests)`);
  // a file that is not there at a commit; a repository that is not there; a picture; the hour's limit
  const fail = async (repoV, path, a, b, re, what) => {
    await page.getByLabel('Repository').fill(repoV); await page.getByLabel('File').fill(path); await page.getByLabel('From commit').fill(a); await page.getByLabel('To commit').fill(b);
    await page.getByRole('button', { name: 'Compare' }).click();
    await page.waitForFunction((src) => new RegExp(src).test(document.querySelector('#diff-gh')?.textContent || ''), re.source, { timeout: 30000 });
    ok(true, `${what}: "${await page.locator('#diff-gh').innerText()}"`);
  };
  await fail('octo/demo', 'src/gone.txt', A_SHA, B_SHA, /There is no file “src\/gone\.txt” in octo\/demo at commit 1f0e3d2 — it may have been added later/, 'a path not there at a commit');
  ok(await page.getByText('Name the repository, the file and two commits').isVisible(), '… and no comparison is shown');
  await fail('octo/nothing', 'src/app.txt', 'main', 'main', /no public repository octo\/nothing/, 'a repository that is not there');
  await fail('octo/demo', 'src/app.txt', 'v9.9', 'main', /octo\/demo has no commit, branch or tag “v9\.9”/, 'a tag that is not there');
  await fail('octo/demo', 'logo.png', B_SHA, B_SHA, /“logo\.png” is not a text file/, 'a picture');
  limit = true;
  await fail('octo/demo', 'src/app.txt', 'main', 'v1.0', /limit of 60 look-ups an hour without an account is used up — it starts again at/, 'the hour\'s limit used up');
  limit = false;
  await fail('octo/demo', 'src/app.txt', '1f0e3d2', B_SHA, /octo\/demo · src\/app\.txt · 1f0e3d2 → 9a8b7c6/, 'a short hash');
  // typed text again: as before
  await page.getByRole('radio', { name: 'Typed text' }).click();
  await page.waitForFunction(() => !/Name the repository/.test(document.body.innerText), null, { timeout: 10000 });
  const tp = await download(page, () => page.getByRole('button', { name: 'Download .patch' }).click());
  ok(/changes\.patch$/.test(tp) && readFileSync(tp, 'utf8').startsWith('--- original\n+++ changed\n'), 'typed text: "original" / "changed", changes.patch');
  // the browser logs every refused request of the cases above (404, 422, 403) — those are the answers asked for
  const errs = page.errors.filter((e) => !/^Failed to load resource: the server responded with a status of (403|404|422) /.test(e));
  ok(errs.length === 0, `no page errors (besides GitHub's refusals the cases asked for): ${errs.join(' | ')}`);
  void say;
};
