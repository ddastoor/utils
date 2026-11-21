// The Ruby flavour: Oniguruma compiled to WebAssembly (Microsoft's vscode-oniguruma 2.0.1, MIT — the build VS Code and
// Shiki run), with Ruby's syntax. Ruby itself runs Onigmo, a fork of Oniguruma; the unit suite holds this flavour to
// the real Ruby. What Oniguruma does not do as Ruby does is done here the way Ruby's own C does it (re.c, string.c):
// the walk over the text (String#scan / gsub: an empty match moves on by one character) and the replacement
// (rb_reg_regsub: \1 … \9, \k<name>, \0 \& \` \' \\).
import onig from 'vscode-oniguruma'; // CommonJS: its exports are one object
type OnigScanner = InstanceType<typeof onig.OnigScanner>;
import { charWidth, COUNTED, PatternError, SHOWN, type EngineOut, type EngineReq, type RegexMatch } from './common';
import { namedGroups } from './flavours';

// vscode-oniguruma's FindOption and Syntax (const enums in its .d.ts: their values)
const OPT: Record<string, number> = { i: 2 /* Ignorecase */, x: 3 /* Extend */, m: 4 /* Multiline: Ruby's m */ };
const NONE = 1, RUBY = 10;

let ready: Promise<void> | null = null;
export const loadOnig = (wasm: ArrayBuffer | Uint8Array) => (ready ??= onig.loadWASM(wasm as ArrayBuffer).catch((e) => { ready = null; throw e; }));

type Span = [number, number] | null;

/** A replacement as Ruby's rb_reg_regsub makes it. */
export function rubySub(rep: string, text: string, g: Span[], names: string[], namedOnly: boolean): string {
  let out = '';
  for (let i = 0; i < rep.length; i++) {
    const c = rep[i];
    if (c !== '\\' || i + 1 >= rep.length) { out += c; continue; }
    const d = rep[++i];
    const put = (n: number) => { const s = g[n]; if (s) out += text.slice(s[0], s[1]); };
    if (d >= '1' && d <= '9') { if (!namedOnly) put(+d); continue; } // with named groups Ruby drops \1 … \9
    if (d === '0' || d === '&') { put(0); continue; }
    if (d === '`') { out += text.slice(0, g[0]![0]); continue; }
    if (d === "'") { out += text.slice(g[0]![1]); continue; }
    if (d === '\\') { out += '\\'; continue; }
    if (d === 'k' && rep[i + 1] === '<') {
      const e = rep.indexOf('>', i + 2);
      if (e < 0) throw new Error('invalid group name reference format');
      const name = rep.slice(i + 2, e), n = names.lastIndexOf(name) + 1;
      if (n < 1) throw new Error(`undefined group name reference: ${name}`);
      put(n); i = e; continue;
    }
    out += c + d;
  }
  return out;
}

export function runRuby(q: EngineReq): EngineOut {
  if (!ready) throw new Error('Oniguruma is not loaded');
  let sc: OnigScanner;
  try { sc = new onig.OnigScanner([q.pattern], { options: [NONE, ...[...q.flags].map((c) => OPT[c])], syntax: RUBY } as any); }
  catch (e: any) { throw new PatternError(String(e?.message || e)); }
  const str = onig.createOnigString(q.text) as any;
  // a group that took no part comes back as −1 (the binding would map it to the end of the text)
  const conv = str.convertUtf8OffsetToUtf16.bind(str);
  str.convertUtf8OffsetToUtf16 = (b: number) => (b > str.utf8Length ? -1 : conv(b));
  try {
    const parsed = namedGroups(q.pattern, { ruby: true, extended: q.flags.includes('x') });
    const namedOnly = !!parsed?.some(Boolean);
    const matches: RegexMatch[] = [];
    let total = 0, pos = 0, n = -1, r = '', last = 0, repError: string | undefined;
    const doRep = q.replacement !== null, len = q.text.length;
    while (pos <= len) {
      const m = sc.findNextMatchSync(str, pos);
      if (!m) break;
      const g: Span[] = m.captureIndices.map((c) => (c.start < 0 ? null : [c.start, c.end] as [number, number]));
      const [s0, e0] = g[0]!;
      if (n < 0) n = g.length - 1;
      if (matches.length < SHOWN) matches.push({ index: s0, text: q.text.slice(s0, e0), groups: g.slice(1).map((x) => (x ? q.text.slice(x[0], x[1]) : null)) });
      if (doRep && !repError && (q.all || total === 0)) {
        try { r += q.text.slice(last, s0) + rubySub(q.replacement!, q.text, g, parsed ?? [], namedOnly); last = e0; }
        catch (e: any) { repError = String(e?.message || e); }
      }
      if (++total >= COUNTED) break;
      // Ruby's scan / gsub: after an empty match, one character on (or past the end)
      pos = e0 === s0 ? (e0 < len ? e0 + charWidth(q.text, e0) : e0 + 1) : e0;
    }
    if (n < 0) n = parsed?.length ?? 0;
    const names = parsed && parsed.length === n ? parsed : Array<string>(n).fill('');
    const replaced = doRep && !repError ? r + q.text.slice(last) : null;
    return { total, matches, names, replaced, repError, version: 'Oniguruma (vscode-oniguruma 2.0.1)' };
  } finally { str.dispose(); sc.dispose(); }
}
