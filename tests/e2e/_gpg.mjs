// _gpg.mjs — the gpg program for the OpenPGP suites ($GPG, else gpg on the PATH) and a fresh home folder for it. On
// Windows that is Git for Windows' gpg, a POSIX (MSYS) build: it takes a Windows GNUPGHOME (D:\a\…) for a relative path —
// every call failed (to-do #13: the pgp suite in run 5, pgp9580 in run 9) —, so it is given the folder as /d/a/…; a build
// that says "Home: C:\…" (GnuPG for Windows) takes the Windows form. File names in the arguments may stay Windows paths.
// null: no gpg here.
import { mkdtempSync } from 'node:fs';
import { execFileSync } from '../lib/child.mjs';

export function gnupg(tmpRoot, prefix = 'gnupg-') {
  const GPG = process.env.GPG || 'gpg';
  let version = '';
  try { version = execFileSync(GPG, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch { return null; }
  const posixHome = process.platform === 'win32' && /^Home: \//m.test(version);
  const dir = mkdtempSync(tmpRoot + '/' + prefix);
  const GNUPGHOME = posixHome ? dir.replace(/^([A-Za-z]):/, (_, d) => '/' + d.toLowerCase()).replace(/\\/g, '/') : dir;
  /** gpg with these arguments in that home: its standard output */
  const run = (args, o = {}) => execFileSync(GPG, args, { env: { ...process.env, GNUPGHOME }, stdio: ['ignore', 'pipe', 'ignore'], ...o }).toString();
  return { GPG, version, GNUPGHOME, run, gpg: (...a) => run(['--batch', '--yes', '--pinentry-mode', 'loopback', ...a]) };
}
