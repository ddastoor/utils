// Wrapper for hunspell.wasm: our build of Hunspell 1.7.6 (wasm/hunspell — the spell checker of LibreOffice, Firefox and Chrome)
// for the Spell Checker. Dictionaries are handed over as bytes (`file`) and opened by name (`create`, `addDic`). Words in and
// suggestions out are UTF-8; suggestions are ranked by how common a word is and how near it is to what was typed
// (wasm/hunspell/rank.hxx) once the word frequencies are given. `bindHunspell(exports)` is environment-neutral so the Node unit
// tests can use it too.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/hunspell.wasm?url';
import { lazyEngine } from '../lifecycle';

export function bindHunspell(e: any) {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const mem = () => new Uint8Array(e.memory.buffer);
  const cstr = (s: string) => { const b = enc.encode(s), p = e.hs_alloc(b.length + 1); if (!p) throw new Error('Out of memory'); const m = mem(); m.set(b, p); m[p + b.length] = 0; return p; };
  const withStr = <T>(s: string, f: (p: number) => T): T => { const p = cstr(s); try { return f(p); } finally { e.hs_free(p); } };
  const read = () => dec.decode(new Uint8Array(e.memory.buffer, e.hs_out(), e.hs_out_len())).split('\n');
  return {
    /** a file the engine may open by its name (an affix file or a dictionary) */
    file(name: string, bytes: Uint8Array) {
      const p = e.hs_alloc(bytes.length); if (!p) throw new Error('Out of memory');
      mem().set(bytes, p);
      try { withStr(name, (n) => e.hs_file(n, p, bytes.length)); } finally { e.hs_free(p); }
    },
    unfile: (name: string) => withStr(name, (n) => e.hs_unfile(n)),
    /** a checker of an affix file and a dictionary given with `file` (its handle) */
    create(aff: string, dic: string): number {
      const h = withStr(aff, (a) => withStr(dic, (d) => e.hs_create(a, d)));
      if (!h) throw new Error('The dictionary could not be read.');
      return h;
    },
    destroy: (h: number) => e.hs_destroy(h),
    /** a second dictionary for the same affixes */
    addDic: (h: number, dic: string) => withStr(dic, (d) => e.hs_add_dic(h, d)) === 0,
    spell: (h: number, word: string) => withStr(word, (w) => e.hs_spell(h, w)) === 1,
    /** the word frequencies suggestions are ranked by (public/data/dict/freq.txt, the Photo Dictionary's): the number of words */
    freq(bytes: Uint8Array): number {
      const p = e.hs_alloc(bytes.length); if (!p) throw new Error('Out of memory');
      mem().set(bytes, p);
      try { return e.hs_freq(p, bytes.length); } finally { e.hs_free(p); }
    },
    /** suggestions, best first: in the tab's order (wasm/hunspell/rank.hxx) once `freq` was given, or Hunspell's own */
    suggest(h: number, word: string, ranked = true): string[] {
      const n = withStr(word, (w) => e.hs_suggest(h, w, ranked ? 1 : 0));
      return n ? read() : [];
    },
    /** a list in the tab's order (the tests rank what native Hunspell gave) */
    rank(h: number, word: string, list: string[]): string[] {
      const n = withStr(word, (w) => withStr(list.join('\n'), (l) => e.hs_rank(h, w, l)));
      return n ? read() : [];
    },
    add: (h: number, word: string) => withStr(word, (w) => e.hs_add(h, w)),
    /** a word that takes the affixes of an example ("Bengaluru" like "London": Bengaluru's) */
    addWithAffix: (h: number, word: string, example: string) => withStr(word, (w) => withStr(example, (x) => e.hs_add_with_affix(h, w, x))),
    remove: (h: number, word: string) => withStr(word, (w) => e.hs_remove(h, w)),
    /** "1.7.6" */
    version: () => { const v = e.hs_version() as number; return `${v >> 16}.${(v >> 8) & 255}.${v & 255}`; },
  };
}
export type HunspellEngine = ReturnType<typeof bindHunspell>;

export const hunspell = lazyEngine('hunspell', () => instantiateWasi(wasmUrl).then((x) => bindHunspell(x.exports)));
