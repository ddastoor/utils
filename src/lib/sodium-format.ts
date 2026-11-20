// "USODIUM1" container format — see docs/sodium-format.md and tools/sodium_decrypt.py.
// The 61-byte header is written and parsed in crypto.wasm (wasm/crypto/glue.c: u_sh_write / u_sh_parse).
export const MAGIC = 'USODIUM1';
export const CHUNK = 65536;
export const HEADER_LEN = 8 + 1 + 4 + 4 + 4 + 16 + 24; // 61
export type { SodiumHeader } from '../wasm/crypto';

/** "USODIUM1" in Base64 begins like this (standard and URL-safe alike). */
const B64_MAGIC = 'VVNPRElVTTE';

/** The encrypted text as people paste it: Base64 (standard or URL-safe, with or without padding, broken over lines,
 *  in quotation marks), or a whole share link (…#/sharelink?d=…). The bytes, or the reason they cannot be read. */
export function readEncryptedText(text: string): { bytes: Uint8Array } | { error: string } {
  let t = text.trim();
  const link = /[#?&]d=([A-Za-z0-9_\-+/=%]+)/.exec(t);
  if (link) t = decodeURIComponent(link[1]);
  t = t.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '').replace(/\s+/g, '');
  if (!t) return { error: 'Paste the encrypted text (it begins with "VVNPRElVTTE").' };
  const bad = t.replace(/[A-Za-z0-9+/\-_]/g, '').replace(/=+$/, '');
  if (bad) return { error: `That is not the encrypted text of Sodium Encrypt — it holds characters Base64 does not use (${[...new Set(bad)].slice(0, 5).join(' ')}).` };
  if (!t.startsWith(B64_MAGIC)) return { error: 'That is Base64, but not text encrypted by Sodium Encrypt (it begins with "VVNPRElVTTE").' };
  const u = t.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (u.length % 4 === 1) return { error: 'The encrypted text is cut short — copy all of it.' };
  const bin = atob(u + '='.repeat((4 - (u.length % 4)) % 4));
  return { bytes: Uint8Array.from(bin, (c) => c.charCodeAt(0)) };
}

/** A file that holds the encrypted text instead of the encrypted bytes (saved from an e-mail as .txt): its bytes, else
 *  null. Only small files are looked at — the text of a file is a third larger than the file. */
export async function encryptedTextFile(file: Blob): Promise<Uint8Array | null> {
  if (file.size > 64 << 20) return null;
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const start = new TextDecoder().decode(head).replace(/^[\s"'“‘﻿]+/, '');
  if (!start.startsWith(B64_MAGIC) && !/[#?&]d=VVNPRElVTTE/.test(start) && !/^https?:/.test(start)) return null;
  const r = readEncryptedText(await file.text());
  return 'bytes' in r ? r.bytes : null;
}
