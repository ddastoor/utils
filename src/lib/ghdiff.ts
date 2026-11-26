// The Text Diff tab's other sources (to-do #14 — owner, 26 Nov 2026: "add 2 more text input options. One is to upload two
// local files. The second option is to name a file in a public GitHub repository with two different commit hashes. Also,
// add the option to download the difference as a universal patch file format."): reading what people paste for a
// repository, fetching a file as it was at a commit, and the patch's headers. No DOM (the unit suite runs it in Node);
// `fetch` is passed in.
//
// GitHub is a data host of the site (CLAUDE.md §1, §3a — approved by the owner, 26 Nov 2026): raw.githubusercontent.com
// gives a file at a commit (no key, CORS); api.github.com makes a short hash, a branch or a tag a full commit and explains
// a file that is not there (60 requests an hour without an account). Only the repository, the path and the commits are
// sent — nothing typed in the page.
import { textOf } from './textfile';

export interface RepoRef { owner: string; repo: string; ref?: string; path?: string }
const NAME = /^[A-Za-z0-9_.-]+$/, OWNER = /^[A-Za-z0-9-]+$/; // GitHub's account names: letters, digits, hyphens

/** A repository as people paste it: owner/name; a github.com address (of the repository, a file — /blob/<ref>/<path> —,
 *  a folder — /tree/ —, a commit — /commit/<sha>), a raw.githubusercontent.com address, a clone address (https or
 *  git@github.com:…, .git at the end). A file's address gives its commit and path too. null when it is none of these. */
export function parseRepo(input: string): RepoRef | null {
  let s = input.trim().replace(/[?#].*$/, '');
  if (!s) return null;
  const ssh = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(s);
  if (ssh) return OWNER.test(ssh[1]) && NAME.test(ssh[2]) ? { owner: ssh[1], repo: ssh[2] } : null;
  s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  const raw = /^raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i.exec(s);
  if (raw) return OWNER.test(raw[1]) && NAME.test(raw[2]) ? { owner: raw[1], repo: raw[2], ref: decodeURIComponent(raw[3]), path: decodePath(raw[4]) } : null;
  const m = /^(?:github\.com\/)?([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:\/(.*))?$/i.exec(s);
  if (!m || !OWNER.test(m[1]) || !NAME.test(m[2])) return null;
  if (!/^github\.com\//i.test(s) && m[3]) return null; // "owner/name/more" without the host is no repository
  const out: RepoRef = { owner: m[1], repo: m[2] };
  const rest = (m[3] ?? '').replace(/\/+$/, '').split('/');
  if (rest[0] === 'blob' || rest[0] === 'tree' || rest[0] === 'raw') { if (rest[1]) out.ref = decodeURIComponent(rest[1]); if (rest.length > 2 && rest[0] !== 'tree') out.path = decodePath(rest.slice(2).join('/')); }
  else if (rest[0] === 'commit' && rest[1]) out.ref = rest[1];
  return out;
}
const decodePath = (p: string) => p.split('/').map((x) => { try { return decodeURIComponent(x); } catch { return x; } }).join('/');

/** A commit hash written out in full (SHA-1: 40 hex digits; SHA-256 repositories: 64) */
export const fullSha = (ref: string) => /^([0-9a-f]{40}|[0-9a-f]{64})$/i.test(ref);
/** A path as people paste it: no leading / or ./, back slashes as slashes */
export const cleanPath = (p: string) => p.trim().replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '').replace(/\/{2,}/g, '/');
const enc = (p: string) => p.split('/').map(encodeURIComponent).join('/');
export const rawUrl = (r: RepoRef, ref: string, path: string) => `https://raw.githubusercontent.com/${r.owner}/${r.repo}/${encodeURIComponent(ref)}/${enc(path)}`;
export const commitUrl = (r: RepoRef, ref: string) => `https://api.github.com/repos/${r.owner}/${r.repo}/commits/${encodeURIComponent(ref)}`;
export const repoUrl = (r: RepoRef) => `https://api.github.com/repos/${r.owner}/${r.repo}`;
/** The largest file compared (bytes) */
export const MAX_BYTES = 20e6;

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
const API = { headers: { Accept: 'application/vnd.github+json' } };

/** GitHub's word that the hourly limit is used up, with the time it resets (local time): a 403 or 429 with
 *  X-RateLimit-Remaining 0 (GitHub exposes the header to pages), or whose message says so */
async function limited(res: Response): Promise<string | null> {
  if (res.status !== 403 && res.status !== 429) return null;
  let says = res.headers.get('x-ratelimit-remaining') === '0';
  if (!says) { try { says = /rate limit/i.test(String((await res.clone().json())?.message ?? '')); } catch { /* not JSON */ } }
  if (!says) return null;
  const t = +(res.headers.get('x-ratelimit-reset') ?? 0);
  const at = t ? ` — it starts again at ${new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
  return `GitHub's limit of 60 look-ups an hour without an account is used up${at}. A commit written out in full (40 characters) needs no look-up.`;
}
async function get(f: Fetch, url: string, init?: RequestInit): Promise<Response> {
  try { return await f(url, init); } catch { throw new Error('GitHub could not be reached: check the connection and try again.'); }
}

/** The full commit a hash, branch or tag names (one look-up on api.github.com; a full hash needs none) */
export async function resolveRef(f: Fetch, r: RepoRef, ref: string): Promise<string> {
  if (fullSha(ref)) return ref.toLowerCase();
  const res = await get(f, commitUrl(r, ref), API);
  const lim = await limited(res); if (lim) throw new Error(lim);
  if (res.ok) { const j = await res.json(); if (typeof j?.sha === 'string') return j.sha; }
  if (res.status === 404 || res.status === 422) {
    const repo = await get(f, repoUrl(r), API);
    if (repo.status === 404) throw new Error(`There is no public repository ${r.owner}/${r.repo} on GitHub (a private one cannot be read without an account).`);
    throw new Error(`${r.owner}/${r.repo} has no commit, branch or tag “${ref}”.`);
  }
  throw new Error(`GitHub answered ${res.status} for “${ref}” in ${r.owner}/${r.repo}.`);
}

/** The file `path` as it was at commit `sha`, as text (decoded as the other text tabs decode files) */
export async function fileAt(f: Fetch, r: RepoRef, sha: string, path: string): Promise<string> {
  const res = await get(f, rawUrl(r, sha, path));
  if (res.status === 404) {
    // which is wrong: the repository, the commit or the path (look-ups that may be refused once the hour's limit is used)
    const c = await get(f, commitUrl(r, sha), API).catch(() => null);
    if (c && !(await limited(c))) {
      if (c.status === 404 || c.status === 422) {
        const repo = await get(f, repoUrl(r), API).catch(() => null);
        if (repo?.status === 404) throw new Error(`There is no public repository ${r.owner}/${r.repo} on GitHub (a private one cannot be read without an account).`);
        throw new Error(`${r.owner}/${r.repo} has no commit ${sha.slice(0, 12)}.`);
      }
      if (c.ok) throw new Error(`There is no file “${path}” in ${r.owner}/${r.repo} at commit ${sha.slice(0, 7)} — it may have been added later, moved or deleted (paths are case-sensitive).`);
    }
    throw new Error(`GitHub has no file “${path}” in ${r.owner}/${r.repo} at commit ${sha.slice(0, 7)}.`);
  }
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for “${path}” at commit ${sha.slice(0, 7)}.`);
  if (+(res.headers.get('content-length') ?? 0) > MAX_BYTES) throw new Error(`“${path}” is larger than 20 MB — too large to compare here.`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error(`“${path}” is larger than 20 MB — too large to compare here.`);
  const t = textOf(bytes);
  if (!t) throw new Error(`“${path}” is not a text file: it cannot be compared line by line.`);
  return t.text;
}

/** A name as a patch's header line can carry it (no tab or line break) */
const plain = (s: string) => s.replace(/[\t\r\n]+/g, ' ');
/** The engine's unified diff (headers "original" / "changed") with the headers a patch needs:
 *  - two files: their names (`patch the-original-file the.patch` takes it);
 *  - a file of a repository: `a/<path>` / `b/<path>` after a `diff --git` line, as `git diff` writes them (`git apply` and
 *    `patch -p1` take it at the repository's root), and before them a note of the repository and the two commits (text
 *    before the first header is skipped by both).
 *  Typed text keeps "original" / "changed". */
export function namedPatch(unified: string, src: { kind: 'text' } | { kind: 'files'; a: string; b: string } | { kind: 'github'; repo: RepoRef; path: string; a: string; b: string; refA: string; refB: string }): string {
  if (!unified || src.kind === 'text') return unified;
  const body = unified.replace(/^--- original\n\+\+\+ changed\n/, '');
  if (src.kind === 'files') return `--- ${plain(src.a)}\n+++ ${plain(src.b)}\n${body}`;
  const p = plain(src.path), name = (ref: string, sha: string) => (ref.toLowerCase() === sha ? sha : `${sha} (${plain(ref)})`);
  return `Changes to ${p} in ${src.repo.owner}/${src.repo.repo} on GitHub\nfrom commit ${name(src.refA, src.a)}\nto commit ${name(src.refB, src.b)}\n\ndiff --git a/${p} b/${p}\n--- a/${p}\n+++ b/${p}\n${body}`;
}
/** The patch's file name: after the changed file (or the repository's file), `.patch` */
export const patchName = (src: { kind: 'text' } | { kind: 'files'; b: string } | { kind: 'github'; path: string }) =>
  `${(src.kind === 'text' ? 'changes' : src.kind === 'files' ? src.b : src.path.split('/').pop() || 'changes').replace(/[\\/:*?"<>|]+/g, '_')}.patch`;
