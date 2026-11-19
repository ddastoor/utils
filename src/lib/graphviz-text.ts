// What the Graphviz tab does around the engine: reading a graph file's bytes as text, tidying Graphviz's messages,
// the size of the picture and of its PNG, file names. Plain string work on what a person typed or what Graphviz
// wrote (no loops over graph data — the layout is the WebAssembly module's).

/** A file's bytes as text. Graph files are UTF-8 unless they say otherwise (charset=latin1, big5) or carry a
 *  UTF-16 mark; a file that is not valid UTF-8 and names no charset is read as Windows-1252 (what Graphviz's
 *  "latin1" means on the files people have). `as` names the reading when it is not UTF-8. */
export function decodeGraphFile(b: Uint8Array): { text: string; as: string } {
  if (b[0] === 0xff && b[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(b.subarray(2)), as: 'UTF-16' };
  if (b[0] === 0xfe && b[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(b.subarray(2)), as: 'UTF-16' };
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(b), as: '' }; } catch { /* not UTF-8 */ }
  let ascii = '';
  for (let i = 0, n = Math.min(b.length, 1 << 20); i < n; i += 8192) ascii += String.fromCharCode(...b.subarray(i, Math.min(n, i + 8192)));
  const cs = /\bcharset\s*=\s*"?\s*([A-Za-z0-9_-]+)/i.exec(ascii)?.[1].toLowerCase().replace(/[-_]/g, '') || '';
  if (cs === 'big5') return { text: new TextDecoder('big5').decode(b), as: 'Big5' };
  return { text: new TextDecoder('windows-1252').decode(b), as: 'Windows-1252 (Latin-1)' };
}
/** Bytes that say "this is not text": a NUL in the first 4 KB (UTF-16 files are told apart by their mark first). */
export const looksBinary = (b: Uint8Array) => !(b[0] === 0xff && b[1] === 0xfe) && !(b[0] === 0xfe && b[1] === 0xff) && b.subarray(0, 4096).includes(0);

export interface GvMessages { lines: string[]; more: number; errors: number; line: number | null }
/** Graphviz's messages for a person: one per line, its doubled "Warning: Warning:" said once, repeats counted
 *  ("… (× 12)"), at most `max` lines; `line` = the first line number a syntax error names. */
export function tidyMessages(raw: string, max = 8): GvMessages {
  const count = new Map<string, number>();
  for (let l of raw.split('\n')) {
    l = l.trim().replace(/^(Warning|Error): \1: /, '$1: ');
    if (l) count.set(l, (count.get(l) || 0) + 1);
  }
  const all = [...count].map(([l, n]) => (n > 1 ? `${l} (× ${n})` : l));
  const m = /\bin line (\d+)\b/.exec(raw);
  return { lines: all.slice(0, max), more: Math.max(0, all.length - max), errors: [...count.keys()].filter((l) => l.startsWith('Error:')).length, line: m ? +m[1] : null };
}
/** Characters XML 1.0 does not allow (Graphviz copies them from a label into the SVG, which no browser then opens). */
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
export function xmlSafe(svg: string): { svg: string; removed: number } {
  let removed = 0;
  const out = svg.replace(NOT_XML, () => { removed++; return ''; });
  return { svg: out, removed };
}
/** Width and height an SVG from Graphviz declares, in CSS pixels (it writes points: 1 pt = 4/3 px). */
export function svgSize(svg: string): { w: number; h: number } | null {
  const head = /<svg\b[^>]*>/.exec(svg)?.[0] || '';
  const dim = (name: string) => { const m = new RegExp(`\\b${name}="([0-9.]+)(pt|px|in|)"`).exec(head); return m ? +m[1] * (m[2] === 'pt' ? 4 / 3 : m[2] === 'in' ? 96 : 1) : NaN; };
  const w = dim('width'), hgt = dim('height');
  return w > 0 && hgt > 0 ? { w, h: hgt } : null;
}
/** The browser's canvas limits (Chrome: 16,384 px a side) and a size that still fits in memory (4 bytes a pixel). */
export const PNG_MAX_SIDE = 16384, PNG_MAX_AREA = 100e6;
/** Pixel size of the PNG for a picture of w × h CSS pixels at `scale`, made smaller when it would not fit. */
export function pngSize(w: number, h: number, scale: number): { w: number; h: number; scale: number; reduced: boolean } {
  let s = scale;
  s = Math.min(s, PNG_MAX_SIDE / w, PNG_MAX_SIDE / h, Math.sqrt(PNG_MAX_AREA / (w * h)));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)), scale: s, reduced: s < scale };
}
/** Start of a download's name: the opened file's name without its extension, else "graph"; "-2" for the second graph of several. */
export function fileStem(fileName: string, index = 0, graphs = 1): string {
  const stem = fileName.replace(/\.[^.]*$/, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'graph';
  return graphs > 1 ? `${stem}-${index + 1}` : stem;
}
export const TEXT_EXT: Record<string, string> = { plain: 'plain.txt', json: 'json', dot: 'layout.dot', xdot: 'xdot', canon: 'canon.dot' };
/** Character offsets of line `n` (from 1) in `text`, for selecting it in the editor. */
export function lineSpan(text: string, n: number): [number, number] {
  let start = 0;
  for (let i = 1; i < n; i++) { const k = text.indexOf('\n', start); if (k < 0) break; start = k + 1; }
  const end = text.indexOf('\n', start);
  return [start, end < 0 ? text.length : end];
}
