// Python worker: CPython 3.14 (our wasm32-wasi build, wasm/python) run with our WASI host (src/lib/terminal/wasi.ts)
// against a fresh in-memory filesystem per run: /lib/python314.zip (standard library), /home/user/main.py + the files
// the user added. stdout/stderr are streamed back; files the program creates or changes in /home/user are returned.
import pyUrl from '../wasm/bin/python.wasm?url';
import zipUrl from '../wasm/bin/python314.zip?url';
import { runWasi, ProcExit, Abort } from '../lib/terminal/wasi';
import { VFS } from '../lib/terminal/vfs';

let mod: WebAssembly.Module | null = null, stdlib: Uint8Array | null = null;
const ready = (async () => {
  const [m, z] = await Promise.all([
    WebAssembly.compileStreaming(fetch(pyUrl)).catch(async () => WebAssembly.compile(await (await fetch(pyUrl)).arrayBuffer())),
    fetch(zipUrl).then((r) => r.arrayBuffer()),
  ]);
  mod = m; stdlib = new Uint8Array(z);
})();
let buf = '', stream: 'out' | 'err' = 'out', last = 0;
const flush = () => { if (buf) { (self as any).postMessage({ type: stream, text: buf }); buf = ''; } last = performance.now(); };
const emit = (s: 'out' | 'err') => { const d = new TextDecoder(); return (b: Uint8Array) => {
  if (s !== stream) { flush(); stream = s; }
  buf += d.decode(b, { stream: true });
  if (buf.length > 8192 || performance.now() - last > 40) flush();
}; };
type InFile = { name: string; bytes: Uint8Array };
function walk(vfs: VFS, dir: string, out: Array<{ path: string; bytes: Uint8Array }>) {
  for (const e of vfs.list(dir)) {
    const p = `${dir}/${e.name}`;
    if (e.kind === 'dir') { if (e.name !== '__pycache__') walk(vfs, p, out); }
    else if (e.kind === 'file') out.push({ path: p, bytes: vfs.readFile(p) });
  }
}
self.onmessage = async (ev: MessageEvent) => {
  const { id, code, stdin, files, args } = ev.data as { id: number; code: string; stdin: string; files: InFile[]; args: string[] };
  try {
    await ready;
    const vfs = new VFS();
    vfs.mkdirp('/lib'); vfs.mkdirp('/home/user'); vfs.mkdirp('/tmp');
    vfs.writeFile('/lib/python314.zip', stdlib!);
    const before = new Map<string, Uint8Array>();
    for (const f of files) { const p = `/home/user/${f.name.replace(/[\\/]/g, '_')}`; vfs.writeFile(p, f.bytes); before.set(p, f.bytes); }
    vfs.writeFile('/home/user/main.py', new TextEncoder().encode(code));
    const t0 = performance.now();
    let rc = 0, note = '';
    try {
      rc = runWasi(mod!, {
        args: ['python', '-u', 'main.py', ...(args || [])], vfs, cwd: '/home/user',
        env: { PYTHONHOME: '/', PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', HOME: '/home/user', PWD: '/home/user', TZ: 'UTC', LANG: 'C.UTF-8' },
        stdin: new TextEncoder().encode(stdin || ''), stdout: emit('out'), stderr: emit('err'),
        maxOutput: 32 * 1024 * 1024, timeLimit: 30 * 60 * 1000,
      });
    } catch (e: any) {
      if (e instanceof ProcExit) rc = e.code;
      else if (e instanceof Abort) { rc = e.code; note = e.reason === 'output' ? 'Stopped: more than 32 MB of output.' : 'Stopped: time limit.'; }
      else if (e instanceof WebAssembly.RuntimeError) { rc = 134; note = `Python crashed (${e.message}) — perhaps it ran out of memory or recursed too deeply.`; }
      else throw e;
    }
    flush();
    const all: Array<{ path: string; bytes: Uint8Array }> = []; walk(vfs, '/home/user', all);
    const changed = all.filter((f) => f.path !== '/home/user/main.py' && (!before.has(f.path) || !eq(before.get(f.path)!, f.bytes)))
      .map((f) => ({ name: f.path.slice('/home/user/'.length), bytes: f.bytes.slice() }));
    (self as any).postMessage({ type: 'done', id, code: rc, ms: performance.now() - t0, note, files: changed }, changed.map((f) => f.bytes.buffer));
  } catch (e: any) {
    flush();
    (self as any).postMessage({ type: 'done', id, code: -1, error: String(e?.message || e), files: [] });
  }
};
const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);
