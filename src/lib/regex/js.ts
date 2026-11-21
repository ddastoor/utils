// The JavaScript flavour: the browser's own RegExp (compiled C++), as the Regex Tester always ran it.
import { COUNTED, PatternError, SHOWN, type EngineOut, type EngineReq, type RegexMatch } from './common';
import { groupNames } from './flavours';

export function runJs(q: EngineReq): EngineOut {
  let re: RegExp;
  try { re = new RegExp(q.pattern, q.flags.includes('g') ? q.flags : `${q.flags}g`); } // every match is listed, g or not
  catch (e: any) { throw new PatternError(String(e?.message || e).replace(/^Invalid regular expression: /, '')); }
  const matches: RegexMatch[] = []; let total = 0;
  for (const m of q.text.matchAll(re)) {
    if (matches.length < SHOWN) matches.push({ index: m.index!, text: m[0], groups: m.slice(1).map((g) => g ?? null) });
    if (++total >= COUNTED) break;
  }
  // Replace follows the flags as typed: without g only the first match is replaced, as String.replace does
  const replaced = q.replacement === null ? null : q.text.replace(new RegExp(q.pattern, q.flags), q.replacement);
  return { total, matches, names: groupNames(q.pattern), replaced };
}
