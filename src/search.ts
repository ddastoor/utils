import type { Tool } from './registry';

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+#.%/ -]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['to', 'from', 'on', 'of', 'a', 'an', 'the', 'for', 'my', 'in', 'into', 'with', 'and', 'or', 'how', 'i', 'me', 'want', 'make', 'do', 'online', 'free', 'tool', 'app']);
const words = (s: string) => s.split(/[\s/-]+/).filter(Boolean);

/** Damerau-Levenshtein distance with early exit (only small distances matter). */
function dist(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length, n = b.length;
  let prev2: number[] = [], prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[n];
}

interface Index { t: Tool; title: string; titleWords: string[]; kws: string[]; kwWords: string[]; desc: string }
const cache = new WeakMap<Tool[], Index[]>();
function index(tools: Tool[]): Index[] {
  let ix = cache.get(tools);
  if (!ix) {
    ix = tools.map((t) => {
      const title = norm(t.title), kws = t.kw.map(norm);
      return { t, title, titleWords: words(title), kws, kwWords: [...new Set(kws.flatMap(words))], desc: norm(t.desc) };
    });
    cache.set(tools, ix);
  }
  return ix;
}

function wordScore(w: string, x: Index): number {
  let s = 0;
  if (x.t.id === w) s = 90;
  for (const tw of x.titleWords) {
    if (tw === w) s = Math.max(s, 75);
    else if (tw.startsWith(w)) s = Math.max(s, 60);
  }
  for (const k of x.kws) {
    if (k === w) s = Math.max(s, 70);
    else if (k.startsWith(w)) s = Math.max(s, 45);
  }
  for (const kw of x.kwWords) {
    if (kw === w) s = Math.max(s, 55);
    else if (kw.startsWith(w)) s = Math.max(s, 35);
    else if (w.length >= 4 && kw.includes(w)) s = Math.max(s, 20);
  }
  if (s) return s;
  // typo tolerance: 1 edit for words of 4+ letters, 2 edits for 8+
  if (w.length >= 4) {
    const max = w.length >= 8 ? 2 : 1;
    for (const c of [...x.titleWords, ...x.kwWords]) if (c.length >= 3 && dist(w, c, max) <= max) return c === x.titleWords.find((tw) => tw === c) ? 40 : 28;
  }
  if (w.length >= 3 && x.desc.includes(w)) return 12;
  return 0;
}

/** Ranks tools for a query: whole-phrase matches first, then every meaningful word must match somewhere. */
export function searchTools(tools: Tool[], query: string): Tool[] {
  const q = norm(query);
  if (!q) return [];
  let ws = words(q).filter((w) => !STOP.has(w));
  if (!ws.length) ws = words(q);
  const scored: Array<[number, number, Tool]> = [];
  index(tools).forEach((x, order) => {
    let phrase = 0;
    if (x.title === q) phrase = 220;
    else if (x.kws.includes(q)) phrase = 170;
    else if (x.title.startsWith(q)) phrase = 130;
    else if (q.length >= 4 && x.kws.some((k) => k.startsWith(q))) phrase = 110;
    else if (q.length >= 5 && (x.title.includes(q) || x.kws.some((k) => k.includes(q)))) phrase = 90;
    let total = phrase, ok = true;
    for (const w of ws) {
      const s = wordScore(w, x);
      if (!s) { ok = false; break; }
      total += s;
    }
    if (ok || phrase) scored.push([total, order, x.t]);
  });
  return scored.sort((a, b) => b[0] - a[0] || a[1] - b[1]).map((x) => x[2]);
}
