// Runs Argon2id and secretstream encryption (libsodium.js) off the main thread; the USODIUM1 header is crypto.wasm's.
// (Hashing moved to src/workers/hash.worker.ts — hash-wasm — in Nov 2026.)
import { sodium } from '../wasm/crypto';
import { libsodium } from '../wasm/libsodium';
import { encrypt, decrypt } from '../lib/usodium';

type Msg =
  | { id: number; op: 'encrypt'; data: Blob; password: Uint8Array; ops: number; memKiB: number }
  | { id: number; op: 'decrypt'; data: Blob; password: Uint8Array };

const post = (m: any, transfer: Transferable[] = []) => (self as any).postMessage(m, transfer);

self.onmessage = async (ev: MessageEvent<Msg>) => {
  const msg = ev.data;
  const progress = (frac: number | null, text: string) => post({ id: msg.id, type: 'progress', frac, text });
  try {
    const na = await sodium();
    // Sodium Encrypt / Share Link: the cryptography is libsodium.js's; the USODIUM1 header is crypto.wasm's (ours)
    if (msg.op === 'encrypt' || msg.op === 'decrypt') {
      const lib = await libsodium();
      const blob = msg.op === 'encrypt' ? await encrypt(msg.data, msg.password, msg, lib, na.sodiumHeader, progress) : await decrypt(msg.data, msg.password, lib, na.sodiumHeader, progress);
      post({ id: msg.id, type: 'done', result: blob, version: lib.version });
      return;
    }
  } catch (e: any) {
    post({ id: msg.id, type: 'error', message: e?.message || String(e) });
  }
};
