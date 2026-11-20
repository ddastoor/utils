// The USODIUM1 container (docs/sodium-format.md): Argon2id → XChaCha20-Poly1305 secretstream in 64 KiB chunks. The
// cryptography is libsodium's (libsodium.js in the app; any engine of the StreamCrypto shape in the tests); the 61-byte
// header is written and read by crypto.wasm (our C — what libsodium does not have). No DOM: runs in the worker and in Node.
import type { StreamCrypto } from '../wasm/libsodium';
import type { SodiumHeader } from '../wasm/crypto';
import { CHUNK, HEADER_LEN } from './sodium-format';

export interface HeaderCodec { write(h: SodiumHeader): Uint8Array; parse(b: Uint8Array): SodiumHeader }
type Progress = (frac: number, text: string) => void;

export async function encrypt(data: Blob, password: Uint8Array, s: { ops: number; memKiB: number }, na: StreamCrypto, codec: HeaderCodec, progress: Progress = () => {}): Promise<Blob> {
  progress(0, 'Deriving key with Argon2id…');
  const salt = na.random(16);
  const key = na.pwhash(password, salt, s.ops, s.memKiB);
  const st = na.pushStream(key);
  key.fill(0);
  const parts: BlobPart[] = [codec.write({ ops: s.ops, memKiB: s.memKiB, chunk: CHUNK, salt, header: st.header }) as BlobPart];
  const size = data.size;
  let off = 0;
  do { // an empty input still gets its final chunk (17 bytes)
    const m = new Uint8Array(await data.slice(off, off + CHUNK).arrayBuffer());
    off += m.length;
    parts.push(st.push(m, off >= size) as BlobPart);
    progress(size ? off / size : 1, 'Encrypting…');
  } while (off < size);
  st.dispose();
  return new Blob(parts, { type: 'application/octet-stream' });
}

export async function decrypt(data: Blob, password: Uint8Array, na: StreamCrypto, codec: HeaderCodec, progress: Progress = () => {}): Promise<Blob> {
  const head = new Uint8Array(await data.slice(0, HEADER_LEN).arrayBuffer());
  const h = codec.parse(head);
  progress(0, 'Deriving key with Argon2id…');
  const key = na.pwhash(password, h.salt, h.ops, h.memKiB);
  const st = na.pullStream(key, h.header);
  key.fill(0);
  const parts: BlobPart[] = [];
  const size = data.size, cchunk = h.chunk + 17;
  let off = HEADER_LEN, done = false;
  while (off < size) {
    const c = new Uint8Array(await data.slice(off, off + cchunk).arrayBuffer());
    off += c.length;
    const r = st.pull(c);
    if (!r) throw new Error(off === HEADER_LEN + c.length ? 'Wrong password, or the file is not a valid encrypted file.' : 'The file is corrupted or was modified.');
    parts.push(r.m as BlobPart);
    progress(off / size, 'Decrypting…');
    if (r.final) { done = true; break; }
  }
  st.dispose();
  if (!done) throw new Error('The encrypted file is incomplete (truncated).');
  if (off < size) throw new Error('Unexpected extra data after the end of the encrypted file.');
  return new Blob(parts);
}
