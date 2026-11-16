// Photo Dictionary engine: rank the words of a recognised page (textcore.wasm, own C), look each up in the bundled
// English Wiktionary (public/data/dict/<xx>.json, built by scripts/build-dict.mjs) and, only for words the bundle
// lacks, online (Wiktionary REST, then the Free Dictionary API — one word per request, nothing else is sent).
import { newTextcore, type RareWord } from '../wasm/textcore';
import { onLeave } from '../lifecycle';

export interface Sense { g: string; t?: string; x?: string }
export interface Entry { p: string; i?: string; s?: Sense[]; l?: string; f?: string; w?: string }
export type Source = 'local' | 'wiktionary' | 'dictionaryapi';
export interface WordCard {
  word: string;          // headword shown (the lemma when the page had an inflected form)
  seen: string;          // the form on the page
  note?: string;         // "plural of goose"
  entries: Array<{ pos: string; ipa?: string; senses: Sense[] }>;
  source: Source;
  z: number;             // Zipf × 10 (−1 = not in the frequency list)
  count: number;
}
export interface Result { cards: WordCard[]; notFound: string[]; names: string[]; online: { tried: number; failed: boolean } }

export const DICT_COMMON = 45; // Zipf ≥ 4.5: common words are never shown
const MAX_ONLINE = 25, ONLINE_TIMEOUT = 5000;

// ------------------------------------------------------------------ bundled data
const dataUrl = (f: string) => new URL(`data/dict/${f}`, document.baseURI).href;
/** Same rules as scripts/build-dict.mjs */
export const keyOf = (w: string) => w.normalize('NFC').replace(/[’ʼ]/g, "'").toLowerCase();
const fold = (key: string, n: number) => [...key.normalize('NFD').replace(/\p{M}/gu, '').slice(0, n).padEnd(n, '_')].map((c) => (/[a-z]/.test(c) ? c : '_')).join('');
export const shardOf = (key: string, split: string[] = []) => { const two = fold(key, 2); return split.includes(two) ? fold(key, 3) : two; };
type Meta = { split: string[]; files: Set<string> | null };
let meta: Promise<Meta> | null = null;
const dictMeta = () => (meta ||= fetch(dataUrl('meta.json')).then((r) => (r.ok ? r.json() : {}))
  .then((m: any): Meta => ({ split: m.split || [], files: Array.isArray(m.files) ? new Set(m.files) : null }))
  .catch(() => { meta = null; return { split: [], files: null }; }));

let freqReady: Promise<Awaited<ReturnType<typeof newTextcore>>> | null = null;
/** textcore with the frequency table loaded (≈ 2.6 MB text, fetched once per page). */
export const ranker = () => (freqReady ||= (async () => {
  onLeave('dictionary', () => { freqReady = null; shards.clear(); });
  const tc = await newTextcore();
  const r = await fetch(dataUrl('freq.txt'));
  if (!r.ok) throw new Error('Could not load the word list.');
  tc.freqLoad(await r.text());
  return tc;
})().catch((e) => { freqReady = null; throw e; }));

const shards = new Map<string, Promise<Record<string, Entry[]>>>();
const shard = (name: string) => {
  let p = shards.get(name);
  if (!p) { p = fetch(dataUrl(`${name}.json`)).then((r) => (r.ok ? r.json() : {})).catch(() => { shards.delete(name); return {}; }); shards.set(name, p); }
  return p;
};
/** Entries for a word in the bundled dictionary (null if absent). */
export async function lookupLocal(word: string): Promise<Entry[] | null> {
  const k = keyOf(word), m = await dictMeta(), name = shardOf(k, m.split);
  if (m.files && !m.files.has(name)) return null; // no word starts like this: don't request a missing file
  return (await shard(name))[k] || null;
}

// ------------------------------------------------------------------ online fallback (approved hosts, see CLAUDE.md §3a)
const plain = (html: string) => (new DOMParser().parseFromString(html, 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim();
const online = new Map<string, Promise<{ source: Source; entries: WordCard['entries'] } | null>>();
async function getJson(url: string): Promise<any | null> {
  const r = await fetch(url, { signal: AbortSignal.timeout(ONLINE_TIMEOUT), credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function fromWiktionary(word: string) {
  const j = await getJson(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`);
  const list: any[] = j?.en || [];
  const entries = list.map((e) => ({
    pos: String(e.partOfSpeech || '').toLowerCase(),
    senses: (e.definitions || []).map((d: any) => ({ g: plain(String(d.definition || '')), x: d.examples?.[0] ? plain(String(d.examples[0])) : undefined })).filter((s: Sense) => s.g).slice(0, 5),
  })).filter((e) => e.senses.length);
  return entries.length ? { source: 'wiktionary' as Source, entries } : null;
}
async function fromFreeDictionary(word: string) {
  const j = await getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (!Array.isArray(j)) return null;
  const entries = j.flatMap((w: any) => (w.meanings || []).map((m: any) => ({
    pos: String(m.partOfSpeech || ''),
    ipa: w.phonetic || w.phonetics?.find((p: any) => p.text)?.text,
    senses: (m.definitions || []).map((d: any) => ({ g: String(d.definition || ''), x: d.example ? String(d.example) : undefined })).filter((s: Sense) => s.g).slice(0, 5),
  }))).filter((e: any) => e.senses.length);
  return entries.length ? { source: 'dictionaryapi' as Source, entries } : null;
}
/** Online definition of ONE word: Wiktionary first, then the Free Dictionary API. Cached for this page only. */
export function lookupOnline(word: string) {
  const k = keyOf(word);
  let p = online.get(k);
  if (!p) {
    p = (async () => {
      let failed = 0;
      for (const f of [fromWiktionary, fromFreeDictionary]) {
        try { const r = await f(k); if (r) return r; } catch { failed++; }
      }
      if (failed === 2) throw new Error('offline');
      return null;
    })();
    online.set(k, p);
    p.catch(() => online.delete(k));
  }
  return p;
}

// ------------------------------------------------------------------ from text to cards
/** Headword: the lower-case spelling when Wiktionary has one ("quixotic"), else its own spelling ("Quixote"). */
const headword = (es: Entry[], key: string) => (es.some((e) => !e.w) ? key : es.find((e) => e.w)!.w!);
const toCardEntries = (es: Entry[]) => es.filter((e) => e.s?.length).map((e) => ({ pos: e.p, ipa: e.i, senses: e.s! }));

type Resolved = { card?: WordCard; skip?: 'common' | 'name' | 'missing'; offline?: boolean; triedOnline?: boolean };
async function resolve(c: RareWord, tc: Awaited<ReturnType<typeof ranker>>, allowOnline: boolean): Promise<Resolved> {
  const base: Omit<WordCard, 'word' | 'entries' | 'source'> = { seen: c.w, z: c.z, count: c.n };
  let key = c.w, es = await lookupLocal(c.w);
  if (!es && c.b) { key = c.b; es = await lookupLocal(c.b); }
  if (es) {
    const own = toCardEntries(es), form = es.find((e) => e.l);
    // an inflection of a common word ("rode" → ride) is common too, even if Wiktionary lists a rare second meaning
    if (form?.l && tc.freqGet(form.l) >= DICT_COMMON) return { skip: 'common' };
    if (!own.length && form?.l) {
      // only an inflected form ("geese"): show its lemma
      const lem = await lookupLocal(form.l);
      const lemEntries = lem ? toCardEntries(lem) : [];
      if (lemEntries.length) return { card: { ...base, word: headword(lem!, form.l), note: form.f, entries: lemEntries, source: 'local' } };
    }
    if (own.length) return { card: { ...base, word: headword(es, key), note: form?.f, entries: own, source: 'local' } };
  }
  if (c.c) return { skip: 'name' };
  if (!allowOnline) return { skip: 'missing' };
  return resolveOnline(c, base);
}
async function resolveOnline(c: RareWord, base: Omit<WordCard, 'word' | 'entries' | 'source'> = { seen: c.w, z: c.z, count: c.n }): Promise<Resolved> {
  try {
    const r = await lookupOnline(c.w) || (c.b ? await lookupOnline(c.b) : null);
    return r ? { card: { ...base, word: c.w, entries: r.entries, source: r.source }, triedOnline: true } : { skip: 'missing', triedOnline: true };
  } catch { return { skip: 'missing', offline: true, triedOnline: true }; }
}

/** The `max` hardest words of `text` with their meanings, rarest first. */
export async function hardWords(text: string, o: { max?: number; online?: boolean; onProgress?: (done: number, of: number) => void } = {}): Promise<Result> {
  const max = o.max ?? 20, tc = await ranker();
  const cands = tc.rare(text, DICT_COMMON);
  const res: Result = { cards: [], notFound: [], names: [], online: { tried: 0, failed: false } };
  const shown = new Set<string>();
  let i = 0, budget = o.online === false ? 0 : MAX_ONLINE;
  while (res.cards.length < max && i < cands.length) {
    // look up the next window in parallel, then take results in rank order
    const win = cands.slice(i, i + Math.max(6, max - res.cards.length + 4)); i += win.length;
    const out = await Promise.all(win.map((c) => resolve(c, tc, false)));
    // words the bundle lacks go online, rarest first, at most MAX_ONLINE per page
    const need = out.map((r, k) => (r.skip === 'missing' ? k : -1)).filter((k) => k >= 0).slice(0, Math.max(0, budget));
    budget -= need.length;
    (await Promise.all(need.map((k) => resolveOnline(win[k])))).forEach((r, j) => (out[need[j]] = r));
    for (let k = 0; k < win.length; k++) {
      const r = out[k], c = win[k];
      if (r.triedOnline) res.online.tried++;
      if (r.offline) res.online.failed = true;
      if (r.card) {
        const id = keyOf(r.card.word);
        if (shown.has(id)) continue;
        if (res.cards.length < max) { shown.add(id); res.cards.push(r.card); }
      } else if (r.skip === 'name') res.names.push(c.w);
      else if (r.skip === 'missing') res.notFound.push(c.w);
    }
    o.onProgress?.(Math.min(i, cands.length), cands.length);
  }
  return res;
}

/** Look up one word the user tapped (bundled dictionary, then online if allowed). */
export async function lookupWord(word: string, allowOnline: boolean): Promise<WordCard | null> {
  const tc = await ranker();
  const w = keyOf(word).replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  if (!w) return null;
  const c: RareWord = { w, b: '', z: tc.freqGet(w), n: 1, c: 0 };
  if (c.z < 0) { const r = tc.rare(w, 999)[0]; if (r?.b) c.b = r.b; }
  const r = await resolve(c, tc, allowOnline);
  if (r.card) return r.card;
  if (r.skip === 'common') { // tapped a common inflection: show the lemma anyway
    const es = await lookupLocal(w), l = es?.find((e) => e.l)?.l, lem = l ? await lookupLocal(l) : null;
    if (lem) return { word: l!, seen: w, note: es!.find((e) => e.l)!.f, entries: toCardEntries(lem), source: 'local', z: tc.freqGet(l!), count: 1 };
  }
  return null;
}

/** Rarity label from Zipf × 10. */
export const rarity = (z: number) => (z < 0 ? 'not in the frequency list' : z < 20 ? 'very rare' : z < 30 ? 'rare' : z < 38 ? 'uncommon' : 'less common');
