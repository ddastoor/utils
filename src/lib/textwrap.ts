// Line breaking for text drawn on a canvas (Text on Image): the canvas measures, this decides where lines end.
// String glue around the browser's own text shaping and Intl.Segmenter (§3a).
const graphemes = (s: string) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].map((x) => x.segment);
/** Greedy word wrap using the canvas' own text metrics (handles any script the browser can shape). A word wider than
 *  the line (a web address, or Chinese / Japanese text, which has no spaces) is broken between two characters. */
export function wrapLines(g: { measureText(s: string): { width: number } }, text: string, maxW: number): string[] {
  const out: string[] = [];
  const fits = (s: string) => g.measureText(s).width <= maxW;
  for (const para of text.replace(/\r\n?/g, '\n').split('\n')) {
    const words = para.split(/(\s+)/).filter((w) => w.length);
    let line = '';
    for (const w of words) {
      const t = line + w;
      if (fits(t.trimEnd()) || !/\S/.test(w)) { line = t; continue; }
      if (line.trim()) { out.push(line.trimEnd()); line = ''; }
      line = w.trimStart();
      if (!fits(line)) { // the word alone is too wide: break it
        let cur = '';
        for (const ch of graphemes(line)) {
          if (cur && !fits(cur + ch)) { out.push(cur); cur = ch; } else cur += ch;
        }
        line = cur;
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}
