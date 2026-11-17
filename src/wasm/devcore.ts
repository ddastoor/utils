// Wrapper for devcore.wasm (Rust, built by us — see wasm/devcore): one call, `op` + input bytes → output bytes.
import { instantiateWasi } from './wasi';
import cidrUrl from './bin/devcore-cidr.wasm?url';
import cronUrl from './bin/devcore-cron.wasm?url';
import semverUrl from './bin/devcore-semver.wasm?url';
import globUrl from './bin/devcore-glob.wasm?url';
import patchUrl from './bin/devcore-patch.wasm?url';
import sqlfmtUrl from './bin/devcore-sqlfmt.wasm?url';
import x509Url from './bin/devcore-x509.wasm?url';
import encUrl from './bin/devcore-enc.wasm?url';
import binUrl from './bin/devcore-bin.wasm?url';
import hexUrl from './bin/devcore-hex.wasm?url';
import jsondiffUrl from './bin/devcore-jsondiff.wasm?url';
import { onLeave } from '../lifecycle';

/** One small module per tab (Cargo features) — a tab downloads only its own engine. */
const URLS = { cidr: cidrUrl, cron: cronUrl, semver: semverUrl, glob: globUrl, patch: patchUrl, sqlfmt: sqlfmtUrl, x509: x509Url, enc: encUrl, bin: binUrl, hex: hexUrl, jsondiff: jsondiffUrl };
export type DevGroup = keyof typeof URLS;

/** cron's time zone: offsets for the zone named here come from the browser's Intl (no tz database in the wasm). */
let zone = 'UTC';
export const setZone = (z: string) => { zone = z; };
// The engine asks for an offset thousands of times while it searches (a schedule inside a daylight-saving gap: 180,000
// calls for 25 runs). Building an Intl.DateTimeFormat costs ~50 µs, so one formatter per zone is kept, and the answer is
// remembered per quarter of an hour (every zone changes its offset on a quarter-hour boundary).
const fmts = new Map<string, Intl.DateTimeFormat>(), offs = new Map<string, Map<number, number>>();
const QUARTER = 900000;
export function zoneOffsetMinutes(z: string, ms: number) {
  const bucket = Math.floor(ms / QUARTER);
  let m = offs.get(z); if (!m) offs.set(z, (m = new Map()));
  const hit = m.get(bucket); if (hit !== undefined) return hit;
  let f = fmts.get(z); if (!f) fmts.set(z, (f = new Intl.DateTimeFormat('en-US', { timeZone: z, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })));
  const t = bucket * QUARTER, p = f.formatToParts(new Date(t)), g = (k: string) => +p.find((x) => x.type === k)!.value;
  const v = Math.round((Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - t) / 60000);
  if (m.size > 100000) m.clear();
  m.set(bucket, v);
  return v;
}
export const tzImports = (getZone: () => string) => ({ env: { tz_offset: (ms: number) => zoneOffsetMinutes(getZone(), ms) } });

const enc = new TextEncoder(), dec = new TextDecoder();
export function bindDevcore(e: any) {
  const raw = (op: string, input: Uint8Array): Uint8Array => {
    const o = enc.encode(op), po = e.dc_alloc(o.length), pi = e.dc_alloc(input.length);
    new Uint8Array(e.memory.buffer, po, o.length).set(o); new Uint8Array(e.memory.buffer, pi, input.length).set(input);
    try {
      const r = e.dc_call(po, o.length, pi, input.length);
      const out = new Uint8Array(e.memory.buffer, e.dc_out_ptr(), e.dc_out_len()).slice();
      if (r !== 0) throw new Error(dec.decode(out));
      return out;
    } finally { e.dc_free(po, o.length); e.dc_free(pi, input.length); }
  };
  return {
    raw,
    /** JSON in, JSON out */
    json: <T = any>(op: string, arg: unknown): T => JSON.parse(dec.decode(raw(op, enc.encode(JSON.stringify(arg))))),
    /** JSON in, text out */
    text: (op: string, arg: unknown): string => dec.decode(raw(op, enc.encode(JSON.stringify(arg)))),
    /** bytes in, JSON out */
    bytesJson: <T = any>(op: string, b: Uint8Array): T => JSON.parse(dec.decode(raw(op, b))),
    encode: (alg: string, b: Uint8Array): string => dec.decode(raw(`enc:${alg}`, b)),
    decode: (alg: string, text: string): Uint8Array => raw(`dec:${alg}`, enc.encode(text)),
    /** offsets of `needle` in `hay` from `from` (at most `max`) */
    find(hay: Uint8Array, needle: Uint8Array, from = 0, max = 1000, ignoreCase = false): { hits: number[]; more: boolean } {
      const b = new Uint8Array(12 + needle.length + hay.length), v = new DataView(b.buffer);
      v.setUint32(0, from, true); v.setUint32(4, (max | (ignoreCase ? 0x80000000 : 0)) >>> 0, true); v.setUint32(8, needle.length, true); b.set(needle, 12); b.set(hay, 12 + needle.length);
      return JSON.parse(dec.decode(raw('find', b)));
    },
    hexdump(b: Uint8Array, offset = 0, width = 16): string {
      const h = new Uint8Array(12 + b.length), v = new DataView(h.buffer);
      v.setUint32(0, offset, true); v.setUint32(4, width, true); h.set(b, 12);
      return dec.decode(raw('hexdump', h));
    },
  };
}
export type Devcore = ReturnType<typeof bindDevcore>;
const inst: Partial<Record<DevGroup, Promise<Devcore>>> = {};
/** Loaded on first use, dropped when the tab is left. */
export const devcore = (g: DevGroup) => {
  if (!inst[g]) { inst[g] = instantiateWasi(URLS[g], g === 'cron' ? tzImports(() => zone) : {}).then((x) => bindDevcore(x.exports)); onLeave(`devcore-${g}`, () => { delete inst[g]; }); }
  return inst[g]!;
};
