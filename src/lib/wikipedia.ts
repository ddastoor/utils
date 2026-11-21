// Wikipedia summaries for the Photo Dictionary (owner, 21 Nov 2026: "a live look-up on the Wikipedia API, shown in a
// little box under the meaning"; a selected phrase is looked up the same way). Wikimedia's REST API — the page summary
// of en.wikipedia.org: free, no key, CORS. Only the word or the phrase is sent; the answer is shown as plain text (its
// `extract`), never as HTML, and its pictures are not fetched (the CSP's img-src stays 'self'). Wikipedia's text is
// CC BY-SA 4.0: every box links to its article.
import { onLeave } from '../lifecycle';

export interface Summary {
  /** article: a page about it · several: a page that lists the meanings (disambiguation) · none: no article */
  kind: 'article' | 'several' | 'none';
  title: string; text: string; url: string;
}

const API = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const TIMEOUT = 6000, AT_ONCE = 4, MAX_CHARS = 420;
const cache = new Map<string, Promise<Summary>>();
let active = 0;
const waiting: Array<() => void> = [];
onLeave('wikipedia', () => { cache.clear(); });

/** The Wikipedia page name of a word or phrase as typed: spaces as underscores (MediaWiki capitalises the first letter
 *  itself and follows redirects). */
export const titleOf = (term: string) => term.normalize('NFC').trim().replace(/\s+/g, '_');

/** An extract cut to a few sentences: at the last sentence end before MAX_CHARS (else at a space, with "…"). */
export function shorten(text: string, max = MAX_CHARS): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max), end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  if (end > max * 0.4) return cut.slice(0, end + 1);
  const sp = cut.lastIndexOf(' ');
  return `${cut.slice(0, sp > 0 ? sp : max)}…`;
}

/** What Wikipedia's summary answer says, in our terms. */
export function readSummary(j: any, term: string): Summary {
  const title = String(j?.titles?.normalized || j?.title || term.trim());
  const url = String(j?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(titleOf(title))}`);
  if (j?.type === 'disambiguation') return { kind: 'several', title, text: '', url };
  const text = shorten(String(j?.extract || ''));
  return text ? { kind: 'article', title, text, url } : { kind: 'none', title, text: '', url };
}

/** The summary of a word or phrase (at most four requests at a time; each answer kept for this visit of the tab). A
 *  failed request is forgotten, so that "Try again" asks again. */
export function wikiSummary(term: string): Promise<Summary> {
  const key = titleOf(term).toLowerCase();
  const had = cache.get(key);
  if (had) return had;
  const p = (async () => {
    if (active >= AT_ONCE) await new Promise<void>((r) => waiting.push(r));
    active++;
    try {
      const res = await fetch(API + encodeURIComponent(titleOf(term)) + '?redirect=true', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT) });
      if (res.status === 404) return { kind: 'none', title: term.trim(), text: '', url: '' } as Summary;
      if (!res.ok) throw new Error(`Wikipedia answered ${res.status}`);
      return readSummary(await res.json(), term);
    } finally { active--; waiting.shift()?.(); }
  })();
  cache.set(key, p);
  p.catch(() => { if (cache.get(key) === p) cache.delete(key); });
  return p;
}
