// "USODIUM1" container format — see docs/sodium-format.md and tools/sodium_decrypt.py.
// The 61-byte header is written and parsed in crypto.wasm (wasm/crypto/glue.c: u_sh_write / u_sh_parse).
export const MAGIC = 'USODIUM1';
export const CHUNK = 65536;
export const HEADER_LEN = 8 + 1 + 4 + 4 + 4 + 16 + 24; // 61
export type { SodiumHeader } from '../wasm/crypto';
