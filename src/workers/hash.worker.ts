// Hash / Checksum: works out the digests of a file or text with hash-wasm (src/lib/hashes.ts), reading 4 MiB at a time.
import { hashers } from '../lib/hashes';

const hex = (b: Uint8Array) => { let s = ''; for (const x of b) s += x.toString(16).padStart(2, '0'); return s; };

self.onmessage = async (ev: MessageEvent<{ id: number; data: Blob; algs: string[] }>) => {
  const { id, data, algs } = ev.data;
  try {
    const hs = await hashers(algs);
    const size = data.size, step = 4 << 20, t0 = performance.now();
    let last = 0;
    for (let off = 0; off < size; off += step) {
      hs.update(new Uint8Array(await data.slice(off, off + step).arrayBuffer()));
      const now = performance.now();
      if (now - last > 100 || off + step >= size) { last = now; (self as any).postMessage({ id, type: 'progress', done: Math.min(size, off + step), ms: now - t0 }); }
    }
    const d = hs.digest();
    (self as any).postMessage({ id, type: 'done', result: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, hex(v)])) });
  } catch (e) {
    (self as any).postMessage({ id, type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
