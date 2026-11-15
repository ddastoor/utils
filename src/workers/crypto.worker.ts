// Runs Argon2id, secretstream encryption and hashing off the main thread.
import { sodium, HASH_ALGS, type HashAlg, toHex } from '../wasm/crypto';
import { MAGIC, CHUNK, HEADER_LEN, parseHeader, writeHeader } from '../lib/sodium-format';

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
    if (msg.op === 'encrypt') {
      progress(0, 'Deriving key with Argon2id…');
      const salt = na.random(16);
      const key = na.pwhash(msg.password, salt, msg.ops, msg.memKiB);
      const s = na.pushStream(key);
      key.fill(0);
      const parts: BlobPart[] = [writeHeader({ ops: msg.ops, memKiB: msg.memKiB, chunk: CHUNK, salt, header: s.header })];
      const size = msg.data.size;
      let off = 0;
      do {
        const m = new Uint8Array(await msg.data.slice(off, off + CHUNK).arrayBuffer());
        off += m.length;
        parts.push(s.push(m, off >= size) as BlobPart);
        progress(size ? off / size : 1, 'Encrypting…');
      } while (off < size);
      s.dispose();
      post({ id: msg.id, type: 'done', result: new Blob(parts, { type: 'application/octet-stream' }) });
      return;
    }
    if (msg.op === 'decrypt') {
      const head = new Uint8Array(await msg.data.slice(0, HEADER_LEN).arrayBuffer());
      const h = parseHeader(head);
      progress(0, 'Deriving key with Argon2id…');
      const key = na.pwhash(msg.password, h.salt, h.ops, h.memKiB);
      const s = na.pullStream(key, h.header);
      key.fill(0);
      const parts: BlobPart[] = [];
      const size = msg.data.size, cchunk = h.chunk + 17;
      let off = HEADER_LEN, done = false;
      while (off < size) {
        const c = new Uint8Array(await msg.data.slice(off, off + cchunk).arrayBuffer());
        off += c.length;
        const r = s.pull(c);
        if (!r) throw new Error(off === HEADER_LEN + c.length ? 'Wrong password, or the file is not a valid encrypted file.' : 'The file is corrupted or was modified.');
        parts.push(r.m as BlobPart);
        progress(off / size, 'Decrypting…');
        if (r.final) { done = true; break; }
      }
      s.dispose();
      if (!done) throw new Error('The encrypted file is incomplete (truncated).');
      if (off < size) throw new Error('Unexpected extra data after the end of the encrypted file.');
      post({ id: msg.id, type: 'done', result: new Blob(parts) });
      return;
    }
  } catch (e: any) {
    post({ id: msg.id, type: 'error', message: e?.message || String(e) });
  }
};
void MAGIC; void HASH_ALGS;
