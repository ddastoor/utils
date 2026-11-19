// Which emoji can this device draw? A phone or PC draws emoji with its own font, and an emoji newer than the font
// comes out as an empty box. One emoji of every recent Emoji version is drawn on a canvas: a colour glyph looks the
// same whatever the text colour, a missing-glyph box (or nothing at all) does not. Needs a DOM.
const FONT = '24px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';
/** One new character of each Emoji version (12 – 18) … */
export const SINGLE: Array<[number, string]> = [[12, '\u{1f971}'], [13, '\u{1f972}'], [14, '\u{1fae0}'], [15, '\u{1fae8}'], [16, '\u{1fae9}'], [17, '\u{1faea}'], [18, '\u{1faeb}']];
/** … and one sequence of each version that added only sequences (a font that lacks it draws its parts side by side). */
export const JOINED: Array<[number, string]> = [[12.1, '\u{1f9d1}\u200d\u{1f9b0}'], [13.1, '❤\ufe0f\u200d\u{1f525}'], [15.1, '\u{1f642}\u200d↔\ufe0f']];

/** The Emoji versions this device cannot draw (empty when it draws them all — or when that cannot be found out:
 *  no canvas, or a device whose emoji are not colour glyphs). */
export function missingEmojiVersions(): Set<number> {
  const out = new Set<number>();
  try {
    const c = document.createElement('canvas'); c.width = 40; c.height = 40;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (!x) return out;
    const paint = (t: string, colour: string) => { x.clearRect(0, 0, 40, 40); x.font = FONT; x.textBaseline = 'top'; x.fillStyle = colour; x.fillText(t, 2, 4); return x.getImageData(0, 0, 40, 40).data; };
    const coloured = (t: string) => { const a = paint(t, '#000').slice(), b = paint(t, '#fff'); let ink = 0; for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return false; if (i % 4 === 3) ink += a[i]; } return ink > 0; };
    if (!coloured('\u{1f600}')) return out; // no colour emoji here: nothing can be told
    for (const [v, ch] of SINGLE) if (!coloured(ch)) out.add(v);
    x.font = FONT; const one = x.measureText('\u{1f600}').width;
    for (const [v, ch] of JOINED) if (x.measureText(ch).width > one * 1.4) out.add(v);
  } catch { out.clear(); }
  return out;
}
