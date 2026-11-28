// The Spell Checker's worker: our Hunspell 1.7.6 (src/wasm/hunspell.ts) with SCOWL's dictionaries, fetched from this site the first
// time a language is used — en_US; en_GB-ise; for Indian English the British one and our list of Indian words (public/data/spell/
// en-IN.dic, scripts/make-spell-india.py). Suggestions can take tens of milliseconds a word: off the page's thread. They are
// ranked by how common each word is (public/data/dict/freq.txt — the Photo Dictionary's wordfreq list, fetched with the first
// suggestion) and how near it is to what was typed (wasm/hunspell/rank.hxx); without the list, in Hunspell's own order.
import { bindHunspell, type HunspellEngine } from '../wasm/hunspell';
import { instantiateWasi } from '../wasm/wasi';
import wasmUrl from '../wasm/bin/hunspell.wasm?url';

type Lang = 'en-US' | 'en-GB' | 'en-IN';
let hs: HunspellEngine | null = null;
const made = new Map<Lang, Promise<number>>();
let freq: Promise<boolean> | null = null;

async function bytes(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not load ${url.split('/').pop()} (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}
function checker(lang: Lang, base: string): Promise<number> {
  let p = made.get(lang);
  if (!p) {
    p = (async () => {
      hs ||= bindHunspell((await instantiateWasi(wasmUrl)).exports);
      const dict = lang === 'en-US' ? 'en-US' : 'en-GB';
      const [aff, dic, extra] = await Promise.all([bytes(new URL(`vendor/spell/${dict}.aff`, base).href), bytes(new URL(`vendor/spell/${dict}.dic`, base).href),
        lang === 'en-IN' ? bytes(new URL('data/spell/en-IN.dic', base).href) : Promise.resolve(null)]);
      hs.file(`${lang}.aff`, aff); hs.file(`${lang}.dic`, dic);
      const h = hs.create(`${lang}.aff`, `${lang}.dic`);
      hs.unfile(`${lang}.dic`);
      if (extra) { hs.file('en-IN-words.dic', extra); hs.addDic(h, 'en-IN-words.dic'); hs.unfile('en-IN-words.dic'); }
      hs.unfile(`${lang}.aff`);
      return h;
    })();
    p.catch(() => made.delete(lang));
    made.set(lang, p);
  }
  return p;
}

/** the word frequencies in the engine (once); false while they cannot be fetched — tried again with the next suggestion */
function ranked(base: string): Promise<boolean> {
  freq ||= bytes(new URL('data/dict/freq.txt', base).href).then((b) => hs!.freq(b) > 0, () => { freq = null; return false; });
  return freq;
}

onmessage = async (e: MessageEvent) => {
  const { id, op, lang, base } = e.data as { id: number; op: string; lang: Lang; base: string };
  try {
    const h = await checker(lang, base);
    let result: unknown = null;
    if (op === 'load') result = hs!.version();
    else if (op === 'check') result = (e.data.words as string[]).map((w) => hs!.spell(h, w));
    else if (op === 'suggest') result = hs!.suggest(h, e.data.word as string, await ranked(base));
    else if (op === 'add') for (const w of e.data.words as string[]) hs!.add(h, w);
    else if (op === 'remove') for (const w of e.data.words as string[]) hs!.remove(h, w);
    postMessage({ id, ok: true, result });
  } catch (err) {
    postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
