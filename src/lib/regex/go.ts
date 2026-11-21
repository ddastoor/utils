// The Go flavour: Go's own regexp package, compiled to WebAssembly by us (wasm/regexgo, GOOS=wasip1) — see main.go there.
// One run of the module a request: the request as "<length>:<bytes>" fields on its stdin, the answer as JSON on its
// stdout. Offsets are UTF-8 byte offsets; the page turns them into its own.
import { runWasi, ProcExit } from '../terminal/wasi';
import { VFS } from '../terminal/vfs';
import { COUNTED, fromOffsets, PatternError, SHOWN, utf8Index, type EngineOut, type EngineReq } from './common';

const enc = new TextEncoder();

/** The request as main.go reads it: each field "<byte length>:<bytes>". */
export function goRequest(q: EngineReq): Uint8Array {
  const fields = [q.pattern, q.flags, q.text, q.replacement === null ? '0' : '1', q.replacement ?? '', q.all ? '1' : '0', String(SHOWN), String(COUNTED)];
  const parts = fields.map((f) => enc.encode(f));
  const out = new Uint8Array(parts.reduce((n, p) => n + String(p.length).length + 1 + p.length, 0));
  let o = 0;
  for (const p of parts) { const h = enc.encode(`${p.length}:`); out.set(h, o); o += h.length; out.set(p, o); o += p.length; }
  return out;
}

/** `mod`: regex-go.wasm compiled. */
export function runGo(mod: WebAssembly.Module, q: EngineReq): EngineOut {
  let out = '', err = '';
  const dO = new TextDecoder(), dE = new TextDecoder();
  let rc = 0;
  try {
    rc = runWasi(mod, {
      args: ['regex-go'], vfs: new VFS(), cwd: '/', env: {},
      stdin: goRequest(q), stdout: (b) => { out += dO.decode(b, { stream: true }); }, stderr: (b) => { err += dE.decode(b, { stream: true }); },
      maxOutput: 1 << 28, timeLimit: 600_000,
    });
  } catch (e) { if (e instanceof ProcExit) rc = e.code; else throw e; }
  let a: any;
  try { a = JSON.parse(out); } catch { throw new Error(`Go stopped (exit status ${rc}): ${err.trim().split('\n').pop() || 'no answer'}`); }
  if (a.error) throw new PatternError(a.error);
  const map = utf8Index(q.text);
  return {
    total: a.total, names: a.names, version: String(a.version).replace(/^go/, 'Go '),
    matches: a.matches.map((o: number[]) => fromOffsets(q.text, o, map)),
    replaced: a.replaced ?? null,
  };
}
