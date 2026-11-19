// Emoji & Symbols: the data (src/lib/emoji-data.json, made by scripts/make-emoji-data.py from emojibase-data and the
// Unicode Character Database) as the tab uses it, and what the search engine (textcore.wasm) is given. No DOM here.
import raw from './emoji-data.json';
import { norm } from '../search';

/** One thing to copy: an emoji or a symbol. */
export interface Item {
  /** the character(s) */ ch: string;
  /** its name: Unicode's short name of an emoji, the character name of a symbol */ name: string;
  /** the words it is found with, besides its name */ kw: string[];
  /** 'emoji' or 'symbol' */ kind: 'emoji' | 'symbol';
  /** the group it is listed under */ group: string;
  /** the Emoji version it came with (emoji only) */ version?: number;
  /** its five skin tones, light to dark (people and hands only) */ skins?: string[];
}
type RawEmoji = [number, string, string, string, number, string[]?];
const data = raw as unknown as { source: string; unicode: string; groups: string[]; emoji: RawEmoji[]; symbols: Array<[string, Array<[string, string, string]>]> };

export const SOURCE = data.source;
export const EMOJI: Item[] = data.emoji.map(([g, ch, name, kw, version, skins]) => ({ ch, name, kw: kw ? kw.split('|') : [], kind: 'emoji', group: data.groups[g], version, skins }));
export const SYMBOLS: Item[] = data.symbols.flatMap(([group, rows]) => rows.map(([ch, name, kw]): Item => ({ ch, name, kw: kw ? kw.split('|') : [], kind: 'symbol', group })));
export const ALL: Item[] = [...EMOJI, ...SYMBOLS];
export const EMOJI_GROUPS: string[] = data.groups;
export const SYMBOL_GROUPS: string[] = data.symbols.map(([g]) => g);

/** Skin tones: 0 = the plain yellow one, 1 – 5 light to dark. */
export const TONES = ['Default', 'Light', 'Medium-light', 'Medium', 'Medium-dark', 'Dark'] as const;
/** The character as it is copied with a skin tone chosen (only people and hands have tones). */
export const withTone = (it: Item, tone: number): string => (tone > 0 && it.skins ? it.skins[tone - 1] : it.ch);

/** U+20B9 — or U+1F1EE U+1F1F3 for a sequence. */
export const codePoints = (ch: string): string => Array.from(ch, (c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`).join(' ');
/** What a cell says about itself: the name, and for a symbol its code point too. */
export const describe = (it: Item, tone = 0): string => (it.kind === 'symbol' ? `${it.name} · ${codePoints(it.ch)}` : tone > 0 && it.skins ? `${it.name}: ${TONES[tone].toLowerCase()} skin tone` : it.name);

/** The records the search engine indexes, in the order of ALL: [id, name, keywords, description]. A symbol is also
 *  found by its group ("arrows", "currency") and its code point ("20b9"). */
export const records = (): Array<[string, string, string[], string]> => ALL.map((it, i) => [String(i), norm(it.name), it.kw.map(norm).filter(Boolean), it.kind === 'symbol' ? norm(`${it.group} ${codePoints(it.ch).replace(/U\+/g, '')} symbol`) : norm(it.group)]);

/** The items whose character is the text itself (someone pastes 🙏 to learn its name), any skin tone or text style of it. */
const bare = (s: string) => s.replace(/[\ufe0e\ufe0f]|\ud83c[\udffb-\udfff]/g, '');
export function byCharacter(text: string): Item[] {
  const t = bare(text.trim());
  return t ? ALL.filter((it) => bare(it.ch) === t) : [];
}
export { norm };
