// Wrapper for zxcvbn.wasm (Rust, built by us — wasm/zxcvbn). Loaded on the first password, dropped when the tab is left.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/zxcvbn.wasm?url';
import { onLeave } from '../lifecycle';

export interface Strength { score: 0 | 1 | 2 | 3 | 4; guesses: number; log10: number; times: Record<'online_throttled' | 'online' | 'offline_slow' | 'offline_fast', { text: string; seconds: number }>; warning: string | null; suggestions: string[]; sequence: Array<{ token: string; i: number; j: number; kind: string; detail: string; guesses: number | null }> }
const enc = new TextEncoder(), dec = new TextDecoder();
export const zxImports = { zxcvbn: { unix_time_milliseconds_imported: () => BigInt(Date.now()) } };
export function bindZxcvbn(e: any) {
  return {
    check(password: string, inputs: string[] = []): Strength {
      const b = enc.encode(JSON.stringify({ password, inputs })), p = e.z_alloc(b.length);
      new Uint8Array(e.memory.buffer, p, b.length).set(b);
      try { e.z_check(p, b.length); return JSON.parse(dec.decode(new Uint8Array(e.memory.buffer, e.z_out_ptr(), e.z_out_len()))); } finally { e.z_free(p, b.length); }
    },
  };
}
let inst: Promise<ReturnType<typeof bindZxcvbn>> | null = null;
export const zxcvbn = () => { if (!inst) { inst = instantiateWasi(wasmUrl, zxImports).then((x) => bindZxcvbn(x.exports)); onLeave('zxcvbn', () => (inst = null)); } return inst; };
