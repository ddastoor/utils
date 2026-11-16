// Promise wrapper around the crypto worker.
import type { HashAlg } from '../wasm/crypto';
import { trackWorker } from '../lifecycle';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; onProgress?: (f: number, t: string) => void }>();

function w() {
  if (!worker) {
    worker = trackWorker(new Worker(new URL('../workers/crypto.worker.ts', import.meta.url), { type: 'module' }), 'crypto-worker', () => { pending.clear(); worker = null; });
    worker.onmessage = (e) => {
      const m = e.data, p = pending.get(m.id);
      if (!p) return;
      if (m.type === 'progress') p.onProgress?.(m.frac, m.text);
      else { pending.delete(m.id); m.type === 'done' ? p.resolve(m.result) : p.reject(new Error(m.message)); }
    };
    worker.onerror = (e) => { for (const p of pending.values()) p.reject(new Error(e.message || 'Worker failed')); pending.clear(); worker = null; };
  }
  return worker;
}

function call<T>(msg: any, onProgress?: (f: number, t: string) => void): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => { pending.set(id, { resolve, reject, onProgress }); w().postMessage({ ...msg, id }); });
}

export const STRENGTH = {
  interactive: { label: 'Fast (64 MiB)', ops: 2, memKiB: 64 * 1024 },
  moderate: { label: 'Strong (256 MiB)', ops: 3, memKiB: 256 * 1024 },
  sensitive: { label: 'Maximum (1 GiB)', ops: 4, memKiB: 1024 * 1024 },
} as const;

export const encryptBlob = (data: Blob, password: string, s: { ops: number; memKiB: number }, onProgress?: (f: number, t: string) => void) =>
  call<Blob>({ op: 'encrypt', data, password: new TextEncoder().encode(password), ops: s.ops, memKiB: s.memKiB }, onProgress);
export const decryptBlob = (data: Blob, password: string, onProgress?: (f: number, t: string) => void) =>
  call<Blob>({ op: 'decrypt', data, password: new TextEncoder().encode(password) }, onProgress);
export const hashBlob = (data: Blob, algs: HashAlg[], onProgress?: (f: number, t: string) => void) =>
  call<Record<HashAlg, string>>({ op: 'hash', data, algs }, onProgress);
