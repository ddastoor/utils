// Python worker: CPython 3.14 (our wasm32-wasi build, wasm/python) run with our WASI host (src/lib/terminal/wasi.ts)
// against a fresh in-memory filesystem per run: /lib/python314.zip (standard library), /home/user/main.py + the files
// the user added. stdout/stderr are streamed back; files the program creates or changes in /home/user are returned.
// Local time is the browser's (the host answers supertools.tz_info). Standard input is handed over a line at a time,
// and a line that answers a prompt (the output did not end with a line break) is echoed, as a terminal would.
import pyUrl from '../wasm/bin/python.wasm?url';
import zipUrl from '../wasm/bin/python314.zip?url';
import abbrUrl from '../lib/tzabbr.json?url';
import { runWasi, ProcExit } from '../lib/terminal/wasi';
import { VFS } from '../lib/terminal/vfs';

let mod: WebAssembly.Module | null = null, stdlib: Uint8Array | null = null, ready: Promise<void> | null = null;
let zoneNames: Record<string, string> = {};        // tzdata's abbreviations per zone (scripts/make-tzabbr.py)
const load = () => (ready ||= (async () => {
  const [m, z, names] = await Promise.all([
    WebAssembly.compileStreaming(fetch(pyUrl)).catch(async () => WebAssembly.compile(await (await fetch(pyUrl)).arrayBuffer())),
    fetch(zipUrl).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); }),
    fetch(abbrUrl).then((r) => r.json()).catch(() => ({})),
  ]);
  mod = m; stdlib = new Uint8Array(z); zoneNames = names;
})().catch((e) => { ready = null; throw new Error(`Python could not be loaded (${e?.message || e}). Check the connection and run again.`); }));

// Output. A worker cannot run timers while Python runs, so text can only leave when the program makes a system call.
// Every write is sent at once while the program writes at a human pace (TOKENS writes in a burst, REFILL more per
// millisecond); a flood is sent in pieces a millisecond apart, and what is waiting also goes out at the program's next
// system call of any kind (tick). What cannot be helped: the last millisecond of a flood stays here while the program
// then computes without a single system call.
const TOKENS = 2048, REFILL = 2;
let parts: string[] = [], tokens = TOKENS, last = 0, fed = 0, lineStart = true;
const send = () => { if (parts.length) { (self as any).postMessage({ type: 'io', parts }); parts = []; } last = performance.now(); };
const push = (k: 'o' | 'e' | 'i', text: string) => {
  if (!text) return;
  const n = parts.length; if (n && parts[n - 2] === k) parts[n - 1] += text; else parts.push(k, text);
  lineStart = text.endsWith('\n');
  const now = performance.now(); tokens = Math.min(TOKENS, tokens + (now - fed) * REFILL); fed = now;
  if (tokens >= 1) { tokens--; send(); } else if (now - last >= 1) send();
};
const tick = () => { if (parts.length && performance.now() - last >= 1) send(); };
type InFile = { name: string; bytes: Uint8Array };
function walk(vfs: VFS, dir: string, out: Array<{ path: string; bytes: Uint8Array }>) {
  for (const e of vfs.list(dir)) {
    const p = `${dir}/${e.name}`;
    if (e.kind === 'dir') { if (e.name !== '__pycache__') walk(vfs, p, out); }
    else if (e.kind === 'file') out.push({ path: p, bytes: vfs.readFile(p) });
  }
}
self.onmessage = async (ev: MessageEvent) => {
  const { id, code, stdin, files, args, zone } = ev.data as { id: number; code: string; stdin: string; files: InFile[]; args: string[]; zone?: string };
  try {
    await load();
    const vfs = new VFS();
    vfs.mkdirp('/lib'); vfs.mkdirp('/home/user'); vfs.mkdirp('/tmp');
    vfs.writeFile('/lib/python314.zip', stdlib!);
    const before = new Map<string, Uint8Array>();
    for (const f of files) { const p = `/home/user/${f.name.replace(/[\\/]/g, '_')}`; vfs.writeFile(p, f.bytes); before.set(p, f.bytes); }
    vfs.writeFile('/home/user/main.py', new TextEncoder().encode(code));
    const t0 = performance.now(), dOut = new TextDecoder(), dErr = new TextDecoder(), dIn = new TextDecoder();
    tokens = TOKENS; lineStart = true;
    const tz = zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    let rc = 0, note = '';
    try {
      rc = runWasi(mod!, {
        args: ['python', '-u', 'main.py', ...(args || [])], vfs, cwd: '/home/user',
        env: { PYTHONHOME: '/', PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', HOME: '/home/user', PWD: '/home/user', LANG: 'C.UTF-8' },
        stdin: new TextEncoder().encode(stdin || ''), stdout: (b) => push('o', dOut.decode(b, { stream: true })), stderr: (b) => push('e', dErr.decode(b, { stream: true })),
        stdinLines: true, onCall: tick,
        onStdinRead: (b) => { if (!lineStart) { const t = dIn.decode(b); push('i', t.endsWith('\n') ? t : t + '\n'); } },
        maxOutput: 32 * 1024 * 1024, timeLimit: 30 * 60 * 1000, timeZone: tz, timeZoneNames: zoneNames[tz],
        onAbort: (why) => { note = why === 'output' ? 'Stopped: more than 32 MB of output.' : 'Stopped: the program ran for 30 minutes.'; },
      });
    } catch (e: any) {
      if (e instanceof ProcExit) rc = e.code;
      else if (e instanceof RangeError) { rc = 134; note = 'Python stopped: the program nested calls more deeply than this browser allows.'; }
      else if (e instanceof WebAssembly.RuntimeError) { rc = 134; note = /unreachable/.test(e.message) ? 'Python stopped itself (abort).' : `Python crashed (${e.message}) — perhaps it ran out of memory.`; }
      else throw e;
    }
    push('o', dOut.decode()); push('e', dErr.decode()); send();
    const all: Array<{ path: string; bytes: Uint8Array }> = []; walk(vfs, '/home/user', all);
    const changed = all.filter((f) => f.path !== '/home/user/main.py' && (!before.has(f.path) || !eq(before.get(f.path)!, f.bytes)))
      .map((f) => ({ name: f.path.slice('/home/user/'.length), bytes: f.bytes.slice() }));
    (self as any).postMessage({ type: 'done', id, code: rc, ms: performance.now() - t0, note, files: changed }, changed.map((f) => f.bytes.buffer));
  } catch (e: any) {
    send();
    (self as any).postMessage({ type: 'done', id, code: -1, error: String(e?.message || e), files: [] });
  }
};
const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);
