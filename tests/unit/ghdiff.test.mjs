// The Text Diff tab's other sources (src/lib/ghdiff.ts, to-do #14): a repository as people paste it, a file at a commit
// fetched from GitHub (the answers of raw.githubusercontent.com and api.github.com stood in for), what is said when
// something is not there, and the patch's headers — the patches applied by GNU patch and git apply.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default async (t, { load }) => {
  const G = await load('/src/lib/ghdiff.ts');
  // ---- what people paste
  const cases = [
    ['ddastoor/utils', { owner: 'ddastoor', repo: 'utils' }],
    ['  https://github.com/ddastoor/utils  ', { owner: 'ddastoor', repo: 'utils' }],
    ['https://github.com/ddastoor/utils.git', { owner: 'ddastoor', repo: 'utils' }],
    ['git@github.com:ddastoor/utils.git', { owner: 'ddastoor', repo: 'utils' }],
    ['github.com/torvalds/linux/blob/v6.9/README', { owner: 'torvalds', repo: 'linux', ref: 'v6.9', path: 'README' }],
    ['https://github.com/a-b/c.d_e/blob/0123456789abcdef0123456789abcdef01234567/src/My%20File.ts?plain=1#L3', { owner: 'a-b', repo: 'c.d_e', ref: '0123456789abcdef0123456789abcdef01234567', path: 'src/My File.ts' }],
    ['https://raw.githubusercontent.com/ddastoor/utils/main/src/main.ts', { owner: 'ddastoor', repo: 'utils', ref: 'main', path: 'src/main.ts' }],
    ['https://github.com/ddastoor/utils/tree/main/src', { owner: 'ddastoor', repo: 'utils', ref: 'main' }],
    ['https://github.com/ddastoor/utils/commit/abc1234', { owner: 'ddastoor', repo: 'utils', ref: 'abc1234' }],
  ];
  for (const [inp, want] of cases) t.eq(G.parseRepo(inp), want, `"${inp.trim()}"`);
  for (const bad of ['', 'utils', 'https://gitlab.com/a/b', 'a/b/c', 'a b/c', 'github.com/only']) t.eq(G.parseRepo(bad), null, `"${bad}" is no repository`);
  t.ok(G.fullSha('0123456789abcdef0123456789abcdef01234567') && !G.fullSha('0123456') && !G.fullSha('main'), 'a full hash is 40 hex digits');
  t.eq(G.cleanPath(' ./src\\lib//x.ts '), 'src/lib/x.ts', 'a path as people paste it');
  t.eq(G.rawUrl({ owner: 'o', repo: 'r' }, 'feature/x', 'a b/c#d.txt'), 'https://raw.githubusercontent.com/o/r/feature%2Fx/a%20b/c%23d.txt', 'the raw address: the ref and every part of the path escaped');

  // ---- fetching, with GitHub's answers stood in for
  const A = 'a'.repeat(40), B = 'b'.repeat(40);
  const files = { [`${A}:src/x.txt`]: 'one\ntwo\nthree\n', [`${B}:src/x.txt`]: 'one\n2\nthree\nfour\n' };
  const refs = { main: B, v1: A, abc1234: A };
  let calls = [];
  const res = (status, body, headers = {}) => new Response(body, { status, headers });
  const fake = (limit = false) => async (url) => {
    calls.push(url);
    let m = /^https:\/\/raw\.githubusercontent\.com\/o\/r\/([^/]+)\/(.+)$/.exec(url);
    if (m) { const k = `${decodeURIComponent(m[1])}:${decodeURIComponent(m[2])}`; return k in files ? res(200, files[k]) : res(404, '404: Not Found'); }
    if (limit) return res(403, '{"message":"API rate limit exceeded"}', { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1795730000' });
    m = /^https:\/\/api\.github\.com\/repos\/(\w+)\/(\w+)\/commits\/(.+)$/.exec(url);
    if (m) { if (m[1] !== 'o' || m[2] !== 'r') return res(404, '{}'); const ref = decodeURIComponent(m[3]); const sha = refs[ref] ?? (G.fullSha(ref) && (ref === A || ref === B) ? ref : null); return sha ? res(200, JSON.stringify({ sha })) : res(422, '{"message":"No commit found"}'); }
    m = /^https:\/\/api\.github\.com\/repos\/(\w+)\/(\w+)$/.exec(url);
    if (m) return m[1] === 'o' && m[2] === 'r' ? res(200, '{}') : res(404, '{}');
    return res(500, '');
  };
  const r = { owner: 'o', repo: 'r' };
  calls = [];
  t.eq(await G.resolveRef(fake(), r, A.toUpperCase()), A, 'a full hash: no look-up');
  t.eq(calls.length, 0, '… nothing asked of GitHub');
  t.eq(await G.resolveRef(fake(), r, 'main'), B, 'a branch: made a full commit by api.github.com');
  t.eq(await G.resolveRef(fake(), r, 'abc1234'), A, 'a short hash too');
  const err = async (p) => { try { await p; return ''; } catch (e) { return e.message; } };
  t.ok(/has no commit, branch or tag “nope”/.test(await err(G.resolveRef(fake(), r, 'nope'))), 'a name that is not there: said');
  t.ok(/no public repository x\/y/.test(await err(G.resolveRef(fake(), { owner: 'x', repo: 'y' }, 'main'))), 'a repository that is not there (or private): said');
  t.ok(/limit of 60 look-ups an hour .* used up — it starts again at .*written out in full/.test(await err(G.resolveRef(fake(true), r, 'main'))), 'the hour\'s limit used up: said, with when it starts again and what needs no look-up');
  t.eq(await G.fileAt(fake(), r, A, 'src/x.txt'), 'one\ntwo\nthree\n', 'the file at a commit');
  t.ok(/no file “src\/gone\.txt” in o\/r at commit aaaaaaa — it may have been added later/.test(await err(G.fileAt(fake(), r, A, 'src/gone.txt'))), 'a path that is not there at that commit: said');
  t.ok(/o\/r has no commit cccccccccccc/.test(await err(G.fileAt(fake(), r, 'c'.repeat(40), 'src/x.txt'))), 'a full hash that is no commit: said');
  t.ok(/GitHub has no file “src\/gone\.txt” in o\/r at commit aaaaaaa\.$/.test(await err(G.fileAt(fake(true), r, A, 'src/gone.txt'))), 'a missing file while the look-ups are used up: said plainly');
  { const bin = async () => new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 13]), { status: 200 });
    t.ok(/is not a text file/.test(await err(G.fileAt(bin, r, A, 'logo.png'))), 'a picture: not a text file'); }
  t.ok(/could not be reached/.test(await err(G.fileAt(async () => { throw new TypeError('Failed to fetch'); }, r, A, 'x'))), 'no connection: said');

  // ---- the patch: real names in the headers; GNU patch and git apply take it
  const unified = '--- original\n+++ changed\n@@ -1,3 +1,4 @@\n one\n-two\n+2\n three\n+four\n';
  const gp = G.namedPatch(unified, { kind: 'github', repo: r, path: 'src/x.txt', a: A, b: B, refA: 'v1', refB: B });
  t.ok(gp.startsWith(`Changes to src/x.txt in o/r on GitHub\nfrom commit ${A} (v1)\nto commit ${B}\n\ndiff --git a/src/x.txt b/src/x.txt\n--- a/src/x.txt\n+++ b/src/x.txt\n@@ -1,3 +1,4 @@`), 'a repository\'s file: a note of the commits, then git\'s headers');
  t.eq(G.namedPatch(unified, { kind: 'files', a: 'old notes.txt', b: 'new\tnotes.txt' }).split('\n').slice(0, 2), ['--- old notes.txt', '+++ new notes.txt'], 'two files: their names (a tab in one made a space)');
  t.eq(G.namedPatch(unified, { kind: 'text' }), unified, 'typed text: "original" / "changed" as before');
  t.eq([G.patchName({ kind: 'text' }), G.patchName({ kind: 'files', b: 'notes.txt' }), G.patchName({ kind: 'github', path: 'src/x.txt' })], ['changes.patch', 'notes.txt.patch', 'x.txt.patch'], 'the patch\'s file name');
  // applied by the tools themselves
  const dir = mkdtempSync(join(tmpdir(), 'ghdiff-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src/x.txt'), files[`${A}:src/x.txt`]);
  writeFileSync(join(dir, 'p.patch'), gp);
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['apply', '--check', 'p.patch'], { cwd: dir });
  execFileSync('patch', ['-p1', '-s', '-i', 'p.patch'], { cwd: dir });
  t.eq(readFileSync(join(dir, 'src/x.txt'), 'utf8'), files[`${B}:src/x.txt`], 'git apply checks it and GNU patch -p1 applies it at the repository\'s root');
  writeFileSync(join(dir, 'old notes.txt'), files[`${A}:src/x.txt`]);
  writeFileSync(join(dir, 'f.patch'), G.namedPatch(unified, { kind: 'files', a: 'old notes.txt', b: 'new notes.txt' }));
  execFileSync('patch', ['-s', 'old notes.txt', 'f.patch'], { cwd: dir });
  t.eq(readFileSync(join(dir, 'old notes.txt'), 'utf8'), files[`${B}:src/x.txt`], 'GNU patch applies the two files\' patch to the original');
};
