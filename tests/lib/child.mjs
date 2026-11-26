// child.mjs — node:child_process for the e2e suites, with a time limit on the synchronous calls. Every suite runs in one
// Node process, so a reference tool that waits for ever blocks every suite with it, and the harness's own suite timeout
// cannot fire either (the Windows check of 26 Nov 2026 stood still for 2½ hours: tools/sodium_decrypt.py waited for a
// password from the console — Python's getpass on Windows reads the console, not a pipe). A tool that has not finished
// after LIMIT is ended, and its check fails with the reason; a call that needs longer gives its own `timeout`.
import * as cp from 'node:child_process';
export * from 'node:child_process';

export const LIMIT = 180000;
const split = (args, opts) => (args && !Array.isArray(args) ? [[], args] : [args ?? [], opts]);
export function spawnSync(cmd, args, opts) { const [a, o] = split(args, opts); return cp.spawnSync(cmd, a, { timeout: LIMIT, ...o }); }
export function execFileSync(cmd, args, opts) { const [a, o] = split(args, opts); return cp.execFileSync(cmd, a, { timeout: LIMIT, ...o }); }
export function execSync(cmd, opts) { return cp.execSync(cmd, { timeout: LIMIT, ...opts }); }
