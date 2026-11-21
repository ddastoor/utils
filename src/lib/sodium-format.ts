// "USODIUM1" container format — see docs/sodium-format.md and tools/sodium_decrypt.py.
// The 61-byte header is written and parsed in crypto.wasm (wasm/crypto/glue.c: u_sh_write / u_sh_parse).
import { textOf } from './textfile';

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
  const link = linkPart(t);
  if (link !== null) t = link;
  t = t.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '').replace(/\s+/g, '');
  const r = decodeB64(t);
  if ('bytes' in r) return r;
  return { error: {
    empty: 'Paste the encrypted text (it begins with "VVNPRElVTTE").',
    chars: `That is not the encrypted text of Sodium Encrypt — it holds characters Base64 does not use (${r.bad}).`,
    magic: 'That is Base64, but not text encrypted by Sodium Encrypt (it begins with "VVNPRElVTTE").',
    cut: 'The encrypted text is cut short — copy all of it.',
  }[r.error] };
}

/** The message part of a share link (the hash of the page, or a link pasted somewhere): the bytes, or what is wrong with
 *  the link in words. */
export function readShareLink(hash: string): { bytes: Uint8Array } | { error: string } {
  const t = (linkPart(hash) ?? '').replace(/\s+/g, ''); // a space or line break that came in with a copy (%20)
  const r = decodeB64(t);
  if ('bytes' in r) return r;
  return { error: {
    empty: 'the link holds no message. Ask for the whole link.',
    chars: `the link was changed on the way — it holds characters a share link never has (${r.bad}). Ask for the link again.`,
    magic: 'it was not made by Encrypted Share Link (the part after "d=" should begin with "VVNPRElVTTE").',
    cut: 'the link is cut short (some apps cut long links). Ask for the whole link.',
  }[r.error] };
}

/** What follows "d=" in a link — up to the next parameter, space, quotation mark or bracket, without a full stop or
 *  comma that ends the sentence around it; percent-escapes undone. Null when there is no "d=". */
function linkPart(text: string): string | null {
  const m = /[#?&]d=([^&\s"'“”‘’<>()[\]{}]*)/.exec(text);
  if (!m) return null;
  const v = m[1].replace(/[.,;:!?]+$/, '');
  try { return decodeURIComponent(v); } catch { return v; }
}

function decodeB64(t: string): { bytes: Uint8Array } | { error: 'empty' | 'magic' | 'cut' | 'chars'; bad?: string } {
  if (!t) return { error: 'empty' };
  const bad = t.replace(/[A-Za-z0-9+/\-_]/g, '').replace(/=+$/, '');
  if (bad) return { error: 'chars', bad: [...new Set(bad)].slice(0, 5).join(' ') };
  if (!t.startsWith(B64_MAGIC)) return { error: 'magic' };
  const u = t.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (u.length % 4 === 1) return { error: 'cut' };
  const bin = atob(u + '='.repeat((4 - (u.length % 4)) % 4));
  if (bin.length < HEADER_LEN + 17) return { error: 'cut' }; // the header and the last chunk's 17 bytes at the least
  return { bytes: Uint8Array.from(bin, (c) => c.charCodeAt(0)) };
}

/** A file that holds the encrypted text instead of the encrypted bytes (saved from an e-mail as .txt): its bytes, else
 *  null. Only small files are looked at — the text of a file is a third larger than the file. */
export async function encryptedTextFile(file: Blob): Promise<Uint8Array | null> {
  if (file.size > 64 << 20) return null;
  // the text as Windows programs save it too (Notepad's "Unicode" is UTF-16): to-do #13
  const head = textOf(new Uint8Array(await file.slice(0, 128).arrayBuffer()))?.text ?? '';
  const start = head.replace(/^[\s"'“‘﻿]+/, '');
  if (!start.startsWith(B64_MAGIC) && !/[#?&]d=VVNPRElVTTE/.test(start) && !/^https?:/.test(start)) return null;
  const r = readEncryptedText(textOf(new Uint8Array(await file.arrayBuffer()))?.text ?? '');
  return 'bytes' in r ? r.bytes : null;
}
