// Reading expected checksums as people paste them, matching them with what the Hash tab worked out, and writing
// checksum lists. String glue around the digests (hash-wasm, src/lib/hashes.ts) — stays in TypeScript (§3a: reading
// what a person typed).
import { HASHES, algo } from './hashes';

export interface Expected {
  /** Line of the pasted text (1-based). */
  line: number;
  /** The digest in lower-case hex. */
  hex: string;
  /** The file it belongs to, when the line names one. */
  name?: string;
  /** The algorithm, when the line (or the list's file name) names one. */
  alg?: string;
}
export interface ExpectedList { entries: Expected[]; unread: number[] }

const LENGTHS = new Set(HASHES.map((a) => a.bytes));
const key = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const ALIAS = new Map<string, string>(HASHES.map((a) => [key(a.id), a.id]));
for (const [k, v] of Object.entries({
  SHA2224: 'SHA-224', SHA2256: 'SHA-256', SHA2384: 'SHA-384', SHA2512: 'SHA-512', SHA: 'SHA-1',
  BLAKE2B: 'BLAKE2b-512', BLAKE2: 'BLAKE2b-512', B2: 'BLAKE2b-512', BLAKE2S: 'BLAKE2s-256', B3: 'BLAKE3',
  RMD160: 'RIPEMD-160', RIPEMD: 'RIPEMD-160', CRC: 'CRC-32', CRC32B: 'CRC-32', SFV: 'CRC-32', KECCAK: 'Keccak-256',
  XXH64: 'xxHash64', XXHASH: 'xxHash64', XXH3: 'XXH3-64', XXH364BITS: 'XXH3-64', XXH3128: 'XXH128', XXHASH128: 'XXH128',
  ADLER: 'Adler-32', CRC64XZ: 'CRC-64', CRC32CASTAGNOLI: 'CRC-32C',
})) ALIAS.set(k, v);

/** The algorithm a name stands for ("sha256", "SHA2-256", "BLAKE2b", "b3", "XXH64"…), or undefined. */
export const algFromName = (s: string) => ALIAS.get(key(s));

/** The algorithm a checksum list's file name tells (SHA256SUMS, x.iso.sha256, B2SUMS, files.sfv …). */
export function algFromFileName(name: string): string | undefined {
  const base = name.replace(/^.*[\\/]/, '');
  const m = /(?:^|[._-])(md5|sha3-?(?:224|256|384|512)|sha(?:1|224|256|384|512)|b2|b3|blake2[bs]?|blake3|rmd160|ripemd160|xxh(?:64|3|128)|crc32c?|crc64|sfv|adler32)(?:sums?)?(?:\.txt)?$/i.exec(base)
    ?? /^(md5|sha(?:1|224|256|384|512)|b2|b3|xxh(?:64|3|128))sums?(?:\.txt)?$/i.exec(base);
  return m ? algFromName(m[1]) : undefined;
}

/** Does this file look like a checksum list (its name), so that the tab reads it instead of hashing it? */
export const isChecksumListName = (name: string) =>
  !!algFromFileName(name) || /(?:^|[._-])(?:checksums?|sums|digests?)(?:\.txt)?$/i.test(name.replace(/^.*[\\/]/, ''));

/** A digest as typed: hex (any case, 0x, bytes apart by spaces or colons) or Base64 (standard or URL-safe; 16 bytes and
 *  more) of a length one of the algorithms has. Lower-case hex, or null. */
export function readDigest(tok: string): string | null {
  let t = tok.trim().replace(/^0x/i, '');
  if (/^[0-9a-f]{2}([ :][0-9a-f]{2})+$/i.test(t)) t = t.replace(/[ :]/g, '');
  if (/^[0-9a-f]+$/i.test(t)) return t.length % 2 === 0 && LENGTHS.has(t.length / 2) ? t.toLowerCase() : null;
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(t)) return null;
  const u = t.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (u.length % 4 === 1) return null;
  let bin: string;
  try { bin = atob(u + '='.repeat((4 - (u.length % 4)) % 4)); } catch { return null; }
  // Base64 only for digests of 16 bytes and more: a short word ("CRC-32", "BLAKE3") is valid Base64 of 4 bytes
  if (!LENGTHS.has(bin.length) || bin.length < 16) return null;
  return [...bin].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

/** A file name as coreutils writes it after a backslash at the start of the line (\\n, \\r, \\\\). */
const unescapeName = (s: string) => s.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c === 'r' ? '\r' : c));

/** Every checksum in a pasted text: a single checksum (hex or Base64), a line of sha256sum / md5sum / b2sum / b3sum /
 *  xxhsum (also with --tag), openssl dgst, an .sfv line, web-page integrity (sha384-…), certutil and PowerShell
 *  Get-FileHash output, or a sentence on a download page ("SHA-256: …"). `listName` = the name of the checksum file,
 *  which may tell the algorithm (SHA256SUMS). Lines with nothing that looks like a checksum are left aside quietly;
 *  lines that look like one but cannot be read are counted in `unread`. */
export function parseExpected(text: string, listName?: string): ExpectedList {
  const entries: Expected[] = [], unread: number[] = [];
  const listAlg = listName ? algFromFileName(listName) : undefined;
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n|\r/);
  let pendingAlg: string | undefined, pendingName: string | undefined, pendingLine = 0; // certutil: the header, then the hex
  let ps: { alg?: string; hex?: string; name?: string; line: number } | null = null; // Get-FileHash | Format-List
  const flushPs = () => { if (ps?.hex) entries.push({ line: ps.line, hex: ps.hex, name: ps.name, alg: ps.alg }); ps = null; };
  const push = (e: Expected) => entries.push({ ...e, alg: e.alg ?? listAlg });
  lines.forEach((raw, i) => {
    const n = i + 1, line = raw.trim();
    if (!line || /^[#;]/.test(line)) { if (!line) flushPs(); return; }
    // PowerShell, Format-List
    const kv = /^(Algorithm|Hash|Path)\s*:\s*(.*)$/i.exec(line);
    if (kv) {
      const [, k, v] = kv; ps ??= { line: n };
      if (/^alg/i.test(k)) { if (ps.hex) { flushPs(); ps = { line: n }; } ps.alg = algFromName(v); }
      else if (/^hash/i.test(k)) { ps.hex = readDigest(v) ?? undefined; ps.line = n; if (!ps.hex) unread.push(n); }
      else ps.name = v.trim() || undefined;
      return;
    }
    flushPs();
    // certutil: "SHA256 hash of file.iso:" then the digest
    const cu = /^(\S+) hash of (?:file )?(.+?):?$/i.exec(line);
    if (cu && algFromName(cu[1])) { pendingAlg = algFromName(cu[1]); pendingName = cu[2]; pendingLine = n; return; }
    if (pendingLine === n - 1 && pendingAlg) {
      const d = readDigest(line); pendingLine = 0;
      if (d) { push({ line: n, hex: d, name: pendingName, alg: pendingAlg }); return; }
    }
    // a checksum written in groups ("ba7816bf 8f01cfea …", as some pages print it): the groups together
    if (/^(?:0x)?[0-9a-f]+(?:[ :][0-9a-f]+)+$/i.test(line)) {
      const d = readDigest(line.replace(/[ :]/g, ''));
      if (d) { pendingLine = 0; push({ line: n, hex: d }); return; }
    }
    // web-page integrity: sha256-… sha384-… sha512-… (one or several in an integrity="…" attribute)
    const sri = [...line.matchAll(/(?:^|[\s"'=])(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})(?=$|[\s"'>])/gi)];
    if (sri.length) {
      for (const m of sri) { const d = readDigest(m[2]); if (d) push({ line: n, hex: d, alg: algFromName(m[1]) }); else unread.push(n); }
      return;
    }
    // BSD style (--tag, openssl dgst): "SHA256 (file) = hex", "SHA2-256(file)= hex"
    const bsd = /^([A-Za-z][A-Za-z0-9_-]*)\s?\((.*)\)\s?=\s?(\S+)$/.exec(line);
    if (bsd && algFromName(bsd[1])) {
      const d = readDigest(bsd[3]);
      if (d) push({ line: n, hex: d, name: bsd[2], alg: algFromName(bsd[1]) }); else unread.push(n);
      return;
    }
    // PowerShell, table: "SHA256   E3B0…   C:\path\file"
    const pt = /^([A-Za-z][A-Za-z0-9-]*)\s+([0-9A-Fa-f]{8,})\s+(.+)$/.exec(line);
    if (pt && algFromName(pt[1]) && readDigest(pt[2])) { push({ line: n, hex: readDigest(pt[2])!, name: pt[3], alg: algFromName(pt[1]) }); return; }
    // coreutils / b3sum / xxhsum: "hex  name", "hex *name" (binary), "\hex  na\\me" (escaped name)
    const gnu = /^(\\?)(\S+)\s[ *]?(.+)$/.exec(raw.replace(/^\s+/, '').replace(/\s+$/, ''));
    if (gnu) {
      const d = readDigest(gnu[2]);
      if (d && !/^\s*$/.test(gnu[3])) { push({ line: n, hex: d, name: gnu[1] ? unescapeName(gnu[3]) : gnu[3] }); return; }
    }
    // .sfv: "name CRC32"
    const sfv = /^(.+?)\s+([0-9A-Fa-f]{8})$/.exec(line);
    // (the name must look like one: an extension, no spaces, or a list that is an .sfv file — "Call 12345678" is no line)
    if (sfv && !algFromName(sfv[1].replace(/[:\s]+$/, '').replace(/\s*(checksum|hash|sum|digest)$/i, ''))
      && (listAlg === 'CRC-32' || /\.[A-Za-z0-9]{1,8}$/.test(sfv[1]) || !/\s/.test(sfv[1]))) {
      push({ line: n, hex: sfv[2].toLowerCase(), name: sfv[1], alg: listAlg ?? 'CRC-32' }); return;
    }
    // A checksum alone, or in a sentence ("SHA-256 checksum: …", "MD5 = …")
    const named = [...line.matchAll(/\b(MD5|SHA-?(?:1|224|256|384|512)|SHA3-?(?:224|256|384|512)|SHA2-(?:224|256|384|512)|BLAKE2[bs]?(?:-?(?:256|512))?|BLAKE3|B3|RIPEMD-?160|CRC-?32C?|CRC-?64|Adler-?32|XXH(?:64|3|128)|xxHash(?:64)?|Keccak(?:-?256)?)\b/gi)]
      .map((m) => algFromName(m[1])).filter(Boolean) as string[];
    const toks = line.split(/[\s,;|"'`()[\]{}<>]+/).map((t) => t.replace(/^[^0-9A-Za-z+/]+|[.:]+$/g, '')).filter(Boolean);
    const spaced = /^(?:[0-9a-f]{2}[ :]){3,}[0-9a-f]{2}$/i.test(line) ? readDigest(line) : null;
    const found = spaced ? [spaced] : toks.map((t) => {
      const d = readDigest(t);
      if (!d) return null;
      // short ones (CRC, xxHash: 8 or 16 digits) and Base64 only when nothing else is on the line or the line names them
      if ((d.length <= 16 || !/^(0x)?[0-9a-f]+$/i.test(t)) && toks.length > 1 && !named.length) return null;
      return d;
    }).filter(Boolean) as string[];
    if (found.length) {
      const alg = named.length === 1 ? named[0] : undefined;
      for (const d of found) push({ line: n, hex: d, alg: alg && algo(alg)!.bytes * 2 === d.length ? alg : undefined });
      return;
    }
    if (/[0-9a-f]{8,}/i.test(line) && !/^CertUtil:/i.test(line)) unread.push(n);
  });
  flushPs();
  return { entries, unread };
}

/** Algorithms worked out for a checksum of this many hex digits when nothing names one (the usual one of that length). */
const LIKELIEST: Record<number, string> = { 8: 'CRC-32', 16: 'xxHash64', 32: 'MD5', 40: 'SHA-1', 56: 'SHA-224', 64: 'SHA-256', 96: 'SHA-384', 128: 'SHA-512' };
export const likeliest = (hexLen: number) => LIKELIEST[hexLen];
export const algsOfLength = (hexLen: number) => HASHES.filter((a) => a.bytes * 2 === hexLen).map((a) => a.id);

const base = (p: string) => p.replace(/^.*[\\/]/, '').replace(/^\*/, '');

/** The entries that concern a file (by its name: the path as written, its last part, then without regard to case) or
 *  a typed text (name null: the entries without a name). Entries without a name apply to anything when the list has
 *  no names at all. */
export function entriesFor(name: string | null, list: ExpectedList): Expected[] {
  const named = list.entries.filter((e) => e.name !== undefined), nameless = list.entries.filter((e) => e.name === undefined);
  if (name === null) return nameless.length ? nameless : list.entries.length === 1 ? list.entries : [];
  for (const same of [(e: Expected) => e.name === name, (e: Expected) => base(e.name!) === name, (e: Expected) => base(e.name!).toLowerCase() === name.toLowerCase()]) {
    const hit = named.filter(same);
    if (hit.length) return hit;
  }
  return nameless;
}

/** The algorithms to work out besides the chosen ones so that every expected checksum can be checked. */
export function neededAlgs(chosen: string[], items: Array<string | null>, list: ExpectedList): string[] {
  const add = new Set<string>();
  for (const item of items) for (const e of entriesFor(item, list)) {
    if (e.alg) { if (!chosen.includes(e.alg)) add.add(e.alg); continue; }
    if (!chosen.some((a) => algo(a)!.bytes * 2 === e.hex.length)) { const l = likeliest(e.hex.length); if (l) add.add(l); }
  }
  return [...add];
}

export type Verdict =
  | { kind: 'match'; alg: string; entry: Expected }
  | { kind: 'mismatch'; tried: string[]; others: string[]; entry: Expected }
  | { kind: 'missing'; alg: string; entry: Expected }
  | { kind: 'nolength'; entry: Expected }
  | { kind: 'unlisted' };

/** How a file's (or text's) digests compare with the expected checksums; null when nothing was expected. `missing`: the
 *  algorithm the checksum needs was not worked out (the expected box changed after Compute). */
export function verify(name: string | null, digests: Record<string, string>, list: ExpectedList): Verdict | null {
  if (!list.entries.length) return null;
  const es = entriesFor(name, list);
  if (!es.length) return { kind: 'unlisted' };
  const algsOf = (e: Expected) => (e.alg ? [e.alg] : Object.keys(digests).filter((a) => algo(a)!.bytes * 2 === e.hex.length)).filter((a) => a in digests);
  for (const e of es) {
    const hit = algsOf(e).find((a) => digests[a] === e.hex);
    if (hit) return { kind: 'match', alg: hit, entry: e };
  }
  const e = es[es.length - 1], tried = algsOf(e);
  if (!algsOfLength(e.hex.length).length) return { kind: 'nolength', entry: e };
  if (!tried.length) return { kind: 'missing', alg: e.alg ?? likeliest(e.hex.length) ?? algsOfLength(e.hex.length)[0], entry: e };
  return { kind: 'mismatch', tried, others: e.alg ? [] : algsOfLength(e.hex.length).filter((a) => !tried.includes(a)), entry: e };
}

/** Entries of a list whose file was not among the chosen ones. */
export const unmatchedEntries = (names: string[], list: ExpectedList) =>
  list.entries.filter((e) => e.name !== undefined && !names.some((n) => entriesFor(n, { entries: [e], unread: [] }).length));

export type DigestFormat = 'hex' | 'HEX' | 'base64';
export function fmtDigest(hex: string, f: DigestFormat): string {
  if (f === 'hex') return hex;
  if (f === 'HEX') return hex.toUpperCase();
  let s = ''; for (let i = 0; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return btoa(s);
}

/** A checksum list as the command-line tool writes it — `sha256sum -c SHA256SUMS` (b2sum, b3sum, xxhsum alike) checks
 *  it; CRC-32 as an .sfv file. A name with a line break is escaped as coreutils escapes it (a backslash in front of the
 *  line, \\ \n \r in the name): there is no other way to put it on one line. A name with a backslash but no line break
 *  is written as it is: GNU's sha256sum reads a line without the leading backslash literally, and the sha256sum of
 *  Ubuntu 26.04 (uutils coreutils 0.10) and BusyBox's — the Terminal tab's — cannot read an escaped line at all, not
 *  even uutils' own. */
export function sumsText(alg: string, rows: Array<{ name: string; hex: string }>): string {
  if (alg === 'CRC-32') return rows.map((r) => `${r.name} ${r.hex.toUpperCase()}\n`).join('');
  return rows.map((r) => (/[\n\r]/.test(r.name)
    ? `\\${r.hex}  ${r.name.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}\n`
    : `${r.hex}  ${r.name}\n`)).join('');
}
export const sumsName = (alg: string) => algo(alg)?.sums ?? 'CHECKSUMS';
