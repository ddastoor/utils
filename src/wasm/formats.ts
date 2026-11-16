// Wrapper for formats-<feature>.wasm (Rust, built by us — wasm/formats): YAML ⇄ JSON ⇄ TOML, JSON Schema.
import { instantiateWasi } from './wasi';
import yamlUrl from './bin/formats-yaml.wasm?url';
import schemaUrl from './bin/formats-schema.wasm?url';
import { onLeave } from '../lifecycle';

export class FormatError extends Error { constructor(msg: string, public line?: number, public column?: number) { super(msg); } }
const enc = new TextEncoder(), dec = new TextDecoder();
export function bindFormats(e: any) {
  return {
    call<T = any>(op: string, arg: unknown): T {
      const o = enc.encode(op), i = enc.encode(JSON.stringify(arg)), po = e.f_alloc(o.length), pi = e.f_alloc(i.length);
      new Uint8Array(e.memory.buffer, po, o.length).set(o); new Uint8Array(e.memory.buffer, pi, i.length).set(i);
      try {
        const r = e.f_call(po, o.length, pi, i.length), out = JSON.parse(dec.decode(new Uint8Array(e.memory.buffer, e.f_out_ptr(), e.f_out_len())));
        if (r !== 0) throw new FormatError(out.error, out.line, out.column);
        return out;
      } finally { e.f_free(po, o.length); e.f_free(pi, i.length); }
    },
  };
}
const URLS = { yaml: yamlUrl, schema: schemaUrl };
const inst: Partial<Record<keyof typeof URLS, Promise<ReturnType<typeof bindFormats>>>> = {};
export const formats = (g: keyof typeof URLS) => { if (!inst[g]) { inst[g] = instantiateWasi(URLS[g]).then((x) => bindFormats(x.exports)); onLeave(`formats-${g}`, () => { delete inst[g]; }); } return inst[g]!; };
