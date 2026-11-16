// Linux Terminal worker: owns the in-memory filesystem and the shell; runs BusyBox (our wasm32-wasi build)
// synchronously. Output is streamed back in small batches while a command runs.
import busyboxUrl from '../wasm/bin/busybox.wasm?url';
import { bootSystem, WELCOME } from '../lib/terminal/system';
import { BUILTINS, type Shell } from '../lib/terminal/shell';
import { VFS, FsError } from '../lib/terminal/vfs';

let sh: Shell | null = null;
let buf = '', last = 0, stream: 'out' | 'err' = 'out';
const flush = () => { if (buf) { (self as any).postMessage({ type: stream, text: buf }); buf = ''; } last = performance.now(); };
const emit = (s: 'out' | 'err') => (text: string) => {
  if (s !== stream) { flush(); stream = s; }
  buf += text;
  if (buf.length > 8192 || performance.now() - last > 40) flush();
};
const ready = (async () => {
  const mod = await WebAssembly.compileStreaming(fetch(busyboxUrl)).catch(async () => WebAssembly.compile(await (await fetch(busyboxUrl)).arrayBuffer()));
  sh = bootSystem(mod, { out: emit('out'), err: emit('err') });
})();

const reply = (id: number, data: any, transfer: Transferable[] = []) => (self as any).postMessage({ type: 'reply', id, ...data }, transfer);
self.onmessage = async (e: MessageEvent<any>) => {
  const m = e.data;
  try {
    await ready;
    const s = sh!;
    if (m.op === 'hello') return reply(m.id, { prompt: s.prompt(), cwd: s.cwd, welcome: WELCOME, applets: [...s.applets].sort() });
    if (m.op === 'run') {
      s.cols = m.cols || 100;
      const t0 = performance.now();
      let code = 0;
      try { code = s.run(m.line); } catch (err: any) { emit('err')(`sh: internal error: ${err?.message || err}\n`); code = 1; }
      flush();
      return reply(m.id, { code, prompt: s.prompt(), cwd: s.cwd, ms: performance.now() - t0 });
    }
    if (m.op === 'capture') { const r = s.capture(m.line); return reply(m.id, r); }
    if (m.op === 'complete') return reply(m.id, { items: complete(s, m.text) });
    if (m.op === 'ls') return reply(m.id, { path: VFS.join(m.path || s.cwd), items: s.vfs.list(m.path || s.cwd) });
    if (m.op === 'read') { const b = s.vfs.readFile(m.path, s.cwd); return reply(m.id, { bytes: b }, [b.buffer]); }
    if (m.op === 'write') { for (const f of m.files as Array<{ name: string; bytes: Uint8Array }>) s.vfs.writeFile(VFS.join(m.dir || s.cwd, f.name.replace(/[\\/]/g, '_')), f.bytes); return reply(m.id, { ok: true }); }
    if (m.op === 'tar') {
      const out: Uint8Array[] = [];
      const parent = VFS.join(m.path, '..'), name = VFS.parts(m.path).pop() || 'root';
      const code = s.runApplet(['tar', '-cf', '-', '-C', parent, name], s.env(), { stdin: null, out: (b: Uint8Array) => out.push(b), err: () => {}, tty: false, pipe: true });
      const n = out.reduce((a, b) => a + b.length, 0), bytes = new Uint8Array(n);
      let k = 0; for (const b of out) { bytes.set(b, k); k += b.length; }
      return reply(m.id, { code, bytes, name: `${name}.tar` }, [bytes.buffer]);
    }
    if (m.op === 'cd') { s.run(`cd '${String(m.path).replace(/'/g, "'\\''")}'`, false); flush(); return reply(m.id, { prompt: s.prompt(), cwd: s.cwd }); }
  } catch (err: any) {
    flush();
    reply(m.id, { error: err instanceof FsError ? `File error (${err.errno})` : err?.message || String(err) });
  }
};

/** Tab completion: commands for the first word, paths otherwise. */
function complete(s: Shell, text: string): string[] {
  const words = text.split(/\s+/), cur = words[words.length - 1], first = words.length === 1;
  if (first && !cur.includes('/')) return [...new Set([...s.applets, ...BUILTINS])].filter((c) => c.startsWith(cur)).sort();
  const slash = cur.lastIndexOf('/'), dir = slash >= 0 ? cur.slice(0, slash + 1) : '', stem = cur.slice(slash + 1);
  const abs = dir.startsWith('/') ? dir : `${s.cwd}/${dir}`;
  try {
    return s.vfs.list(abs || '/').filter((e) => e.name.startsWith(stem) && (stem.startsWith('.') || !e.name.startsWith('.'))).map((e) => dir + e.name + (e.kind === 'dir' ? '/' : ''));
  } catch { return []; }
}
