// The PCRE2 flavour: PCRE2 compiled to WebAssembly (pcre2-wasm 10.49, MIT) — the existing, maintained build, used as it
// is (STANDING RULE #1). The text is always UTF; matching, the global loop (an empty match is retried at the same place
// for a non-empty one, as Perl and PHP do) and substitution (pcre2_substitute, extended: \U \L \E) are PCRE2's own.
import { createPCRE2, FLAGS, PCRE2CompileError, PCRE2MatchError, type PCRE2 } from 'pcre2-wasm';
import { COUNTED, PatternError, SHOWN, type EngineOut, type EngineReq, type RegexMatch } from './common';
import { namedGroups } from './flavours';

const BITS: Record<string, number> = {
  i: FLAGS.CASELESS, m: FLAGS.MULTILINE, s: FLAGS.DOTALL, x: FLAGS.EXTENDED, n: FLAGS.NO_AUTO_CAPTURE, U: FLAGS.UNGREEDY,
  J: FLAGS.DUPNAMES, D: FLAGS.DOLLAR_ENDONLY, A: FLAGS.ANCHORED, u: FLAGS.UCP,
};
let lib: Promise<PCRE2> | null = null;
export const loadPcre2 = () => (lib ??= createPCRE2().catch((e) => { lib = null; throw e; }));

/** "PCRE2 compile error at offset 2: missing closing parenthesis" → "missing closing parenthesis (at character 3)". */
const tidy = (e: any) => {
  const msg = String(e?.message || e).replace(/^PCRE2 (compile|match) error( at offset \d+)?: /, '');
  return typeof e?.offset === 'number' ? `${msg} (at character ${e.offset + 1})` : msg;
};

export async function runPcre2(q: EngineReq): Promise<EngineOut> {
  const p = await loadPcre2();
  let fl = FLAGS.UTF;
  for (const c of q.flags) fl |= BITS[c] ?? 0;
  let re;
  try { re = p.compile(q.pattern, fl); } catch (e) { if (e instanceof PCRE2CompileError) throw new PatternError(tidy(e)); throw e; }
  try {
    const matches: RegexMatch[] = []; let total = 0;
    try {
      for (const m of re.matchAllIterator(q.text)) {
        if (matches.length < SHOWN) matches.push({ index: m.index, text: m.match, groups: m.groups.map((g) => g ?? null) });
        if (++total >= COUNTED) break;
      }
    } catch (e) {
      if (e instanceof PCRE2MatchError) throw new PatternError(`PCRE2 stopped: ${tidy(e)} — a pattern that backtracks without end (nested repeats such as (a+)+) hits PCRE2's own limit.`);
      throw e;
    }
    const n = re.patternInfo().captureCount;
    const parsed = namedGroups(q.pattern, { noCapture: q.flags.includes('n'), extended: q.flags.includes('x') });
    const names = parsed && parsed.length === n ? parsed : Array<string>(n).fill('');
    let replaced: string | null = null, repError: string | undefined;
    if (q.replacement !== null) {
      try { replaced = q.all ? re.replaceAll(q.text, q.replacement) : re.replace(q.text, q.replacement); }
      catch (e) { repError = tidy(e); }
    }
    return { total, matches, names, replaced, repError };
  } finally { re.destroy(); }
}
