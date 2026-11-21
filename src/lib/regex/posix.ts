// The POSIX ERE flavour: GNU's regex — gnulib's regcomp / regexec, the copy GNU grep 3.12 ships, compiled to WebAssembly
// by us (wasm/posixre, §5.1q; glibc's own are the same code) — the engine grep -E and sed -E run on Linux:
// leftmost-longest, POSIX classes, back-references, GNU's \w \s \b \< \> \` \'. The walk is GNU sed's s///g (no empty
// match right where the previous one ended) and lives in the module; the replacement is sed's and is made here:
// & and \1 … \9, \& \\, \n \t and the other escapes GNU sed reads, \U \L \u \l \E.
import { COUNTED, fromOffsets, PatternError, SHOWN, utf8Index, type EngineOut, type EngineReq } from './common';

const enc = new TextEncoder(), dec = new TextDecoder();
const ESC: Record<string, string> = { n: '\n', t: '\t', r: '\r', a: '\x07', f: '\f', v: '\v' };

/** A replacement as GNU sed makes it. `g`: the group texts by number (0 = the match), null for one that took no part. */
export function sedSub(rep: string, g: Array<string | null>): string {
  let out = '', mode: 'U' | 'L' | '' = '', one: 'u' | 'l' | '' = '';
  const add = (t: string) => {
    for (const ch of t) {
      let c = mode === 'U' ? ch.toUpperCase() : mode === 'L' ? ch.toLowerCase() : ch;
      if (one) { c = one === 'u' ? c.toUpperCase() : c.toLowerCase(); one = ''; }
      out += c;
    }
  };
  for (let i = 0; i < rep.length; i++) {
    const c = rep[i];
    if (c === '&') { add(g[0] ?? ''); continue; }
    if (c !== '\\' || i + 1 >= rep.length) { add(c); continue; }
    const d = rep[++i];
    if (d >= '0' && d <= '9') add(g[+d] ?? '');
    else if (d === 'U' || d === 'L') { mode = d; one = ''; }
    else if (d === 'E') { mode = ''; one = ''; }
    else if (d === 'u' || d === 'l') one = d;
    else if (ESC[d]) add(ESC[d]);
    else add(d); // \& \\ and the rest: the character itself
  }
  return out;
}

/** `e`: the exports of posix-re.wasm, instantiated. */
export function runPosix(e: any, q: EngineReq): EngineOut {
  const p = enc.encode(q.pattern), t = enc.encode(q.text);
  const pp = e.px_alloc(p.length), tp = e.px_alloc(t.length);
  new Uint8Array(e.memory.buffer, pp, p.length).set(p);
  new Uint8Array(e.memory.buffer, tp, t.length).set(t);
  const flags = (q.flags.includes('i') ? 1 : 0) | (q.flags.includes('m') ? 2 : 0);
  // with a replacement every match is needed (up to the count), else only the shown ones
  e.px_run(pp, p.length, tp, t.length, flags, q.replacement === null ? SHOWN : COUNTED, COUNTED);
  e.px_free(pp); e.px_free(tp);
  const a = JSON.parse(dec.decode(new Uint8Array(e.memory.buffer, e.px_out(), e.px_out_len())));
  if (a.error) throw new PatternError(a.error);
  const map = utf8Index(q.text);
  const all = a.matches.map((o: number[]) => fromOffsets(q.text, o, map));
  let replaced: string | null = null;
  if (q.replacement !== null) {
    let r = '', last = 0;
    for (const m of q.all ? all : all.slice(0, 1)) { r += q.text.slice(last, m.index) + sedSub(q.replacement, [m.text, ...m.groups]); last = m.index + m.text.length; }
    replaced = r + q.text.slice(last);
  }
  return { total: a.total, matches: all.slice(0, SHOWN), names: Array<string>(a.groups).fill(''), replaced, version: 'GNU regex (grep 3.12)' };
}
