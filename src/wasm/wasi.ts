// Minimal WASI shim for our own reactor modules (built with `zig cc --target=wasm32-wasi`).
// Only randomness, the clock and stderr are real; there are no files (fd_prestat_get: EBADF = no pre-opened
// directories) and every other syscall reports ENOSYS. No network.

export interface WasiInstance { exports: any; memory: WebAssembly.Memory }

/** Fetch and compile a module once; `instantiateWasiModule` then makes as many instances of it as are wanted. */
export async function compileWasi(url: string): Promise<WebAssembly.Module> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  return WebAssembly.compileStreaming(res).catch(async () => WebAssembly.compile(await (await fetch(url)).arrayBuffer()));
}
/** `extra`: more import modules (e.g. { env: { w_progress } }) next to wasi_snapshot_preview1. */
export async function instantiateWasi(url: string, extra: WebAssembly.Imports = {}): Promise<WasiInstance> {
  return instantiateWasiModule(await compileWasi(url), extra);
}
export async function instantiateWasiModule(module: WebAssembly.Module, extra: WebAssembly.Imports = {}): Promise<WasiInstance> {
  let memory: WebAssembly.Memory;
  const wasi: Record<string, (...a: number[]) => number> = {};
  for (const imp of WebAssembly.Module.imports(module)) {
    if (imp.module === 'wasi_snapshot_preview1') wasi[imp.name] = () => 52; // ENOSYS
  }
  wasi.random_get = (ptr, len) => {
    const view = new Uint8Array(memory.buffer, ptr, len);
    for (let i = 0; i < len; i += 65536) crypto.getRandomValues(view.subarray(i, Math.min(len, i + 65536)));
    return 0;
  };
  wasi.fd_write = (fd, iovs, iovsLen, nwritten) => {
    const dv = new DataView(memory.buffer);
    let n = 0, text = '';
    for (let i = 0; i < iovsLen; i++) {
      const p = dv.getUint32(iovs + i * 8, true), l = dv.getUint32(iovs + i * 8 + 4, true);
      text += new TextDecoder().decode(new Uint8Array(memory.buffer, p, l));
      n += l;
    }
    dv.setUint32(nwritten, n, true);
    if (text.trim()) (fd === 2 ? console.warn : console.log)('[wasm]', text.trimEnd());
    return 0;
  };
  // "no (more) pre-opened directories" is EBADF; wasi-libc's start-up aborts on any other error
  wasi.fd_prestat_get = () => 8;
  wasi.proc_exit = (code) => { throw new Error(`wasm exited with code ${code}`); };
  wasi.clock_time_get = (_id, _prec, out) => {
    new DataView(memory.buffer).setBigUint64(out, BigInt(Math.round(performance.timeOrigin + performance.now())) * 1_000_000n, true);
    return 0;
  };
  wasi.environ_sizes_get = (a, b) => { const dv = new DataView(memory.buffer); dv.setUint32(a, 0, true); dv.setUint32(b, 0, true); return 0; };
  wasi.environ_get = () => 0;
  wasi.args_sizes_get = wasi.environ_sizes_get;
  wasi.args_get = () => 0;
  const instance = await WebAssembly.instantiate(module, { ...extra, wasi_snapshot_preview1: wasi });
  const exports: any = instance.exports;
  memory = exports.memory;
  exports._initialize?.();
  return { exports, memory };
}

/** Helpers to move bytes in and out of a module's linear memory. */
export function memIO(x: WasiInstance, malloc = 'u_malloc', free = 'u_free') {
  const e = x.exports;
  return {
    alloc: (n: number): number => { const p = e[malloc](n); if (!p) throw new Error('Out of memory'); return p; },
    free: (p: number) => e[free](p),
    put(bytes: Uint8Array): number { const p = this.alloc(bytes.length); new Uint8Array(x.memory.buffer, p, bytes.length).set(bytes); return p; },
    get: (p: number, n: number) => new Uint8Array(x.memory.buffer, p, n).slice(),
    view: (p: number, n: number) => new Uint8Array(x.memory.buffer, p, n),
    cstr(p: number) { const m = new Uint8Array(x.memory.buffer); let e2 = p; while (m[e2]) e2++; return new TextDecoder().decode(m.subarray(p, e2)); },
  };
}
