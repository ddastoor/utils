// Runs Argon2id, secretstream encryption (libsodium.js) and hashing (crypto.wasm) off the main thread.
import { sodium, HASH_ALGS, type HashAlg, toHex } from '../wasm/crypto';
import { libsodium } from '../wasm/libsodium';
import { encrypt, decrypt } from '../lib/usodium';

type Msg =
  | { id: number; op: 'encrypt'; data: Blob; password: Uint8Array; ops: number; memKiB: number }
  | { id: number; op: 'decrypt'; data: Blob; password: Uint8Array }
  | { id: number; op: 'hash'; data: Blob; algs: HashAlg[] };

const post = (m: any, transfer: Transferable[] = []) => (self as any).postMessage(m, transfer);

self.onmessage = async (ev: MessageEvent<Msg>) => {
  const msg = ev.data;
  const progress = (frac: number, text: string) => post({ id: msg.id, type: 'progress', frac, text });
  try {
    const na = await sodium();
    if (msg.op === 'hash') {
      const hs = msg.algs.map((a) => [a, na.hasher(a)] as const);
      const size = msg.data.size, step = 4 << 20;
      for (let off = 0; off < size || (size === 0 && off === 0); off += step) {
        const part = new Uint8Array(await msg.data.slice(off, off + step).arrayBuffer());
        for (const [, h] of hs) h.update(part);
        progress(size ? Math.min(1, (off + step) / size) : 1, 'Hashing…');
        if (size === 0) break;
      }
      post({ id: msg.id, type: 'done', result: Object.fromEntries(hs.map(([a, h]) => [a, toHex(h.final())])) });
      return;
    }
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
void HASH_ALGS;
