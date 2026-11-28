// The Clipart Maker's SVG (potentials #117): the shapes VTracer traced of the picture in flat colours, and its outline, put together in
// a style — flat, cartoon (black outlines), sticker (outlines in a darker shade of each colour, a white border and a soft shadow), line
// art (a colouring page) or a silhouette. String glue around what src/workers/vector.worker.ts traced; no DOM.

export type ClipStyleName = 'flat' | 'cartoon' | 'sticker' | 'lineart' | 'silhouette';
export interface ClipStyle {
  style: ClipStyleName;
  /** the subject's outline: none, black, or a darker shade of its colour */ outline: 'none' | 'black' | 'shade';
  /** outline thickness: 1 thin, 2 medium, 3 thick */ weight: 1 | 2 | 3;
  /** a white border round the subject */ border: boolean;
  /** a soft shadow under it */ shadow: boolean;
  /** the colour of a silhouette or of line art's lines */ ink: string;
  /** the ink lines inside the subject (eyes, a mouth, folds) */ lines: boolean;
  /** a line round every colour (black, or each colour's darker shade with a shade outline) */ edges: boolean;
}
export interface TracedPath { d: string; fill: string; tx: number; ty: number }
export interface ClipParts { shapes: string; silhouette: string; lines?: string; width: number; height: number }

/** the paths of a VTracer SVG: d, fill and the translate VTracer writes on each */
export function pathsOf(svg: string): TracedPath[] {
  const out: TracedPath[] = [];
  for (const m of svg.matchAll(/<path d="([^"]*)" fill="(#[0-9A-Fa-f]{6})" transform="translate\(([-\d.e]+),([-\d.e]+)\)"\/>/g)) {
    out.push({ d: m[1].trim(), fill: m[2].toLowerCase(), tx: +m[3], ty: +m[4] });
  }
  return out;
}

/** a colour made darker (f of the way to black), in sRGB */
export function darker(hex: string, f = 0.45): string {
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - f)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** the styles' own settings (the tab starts each style from these) */
export const STYLES: Record<ClipStyleName, Omit<ClipStyle, 'style' | 'ink'>> = {
  flat: { outline: 'none', weight: 2, border: false, shadow: false, lines: false, edges: false },
  cartoon: { outline: 'black', weight: 2, border: false, shadow: false, lines: true, edges: false },
  sticker: { outline: 'shade', weight: 2, border: true, shadow: true, lines: true, edges: false },
  lineart: { outline: 'black', weight: 2, border: false, shadow: false, lines: true, edges: true },
  silhouette: { outline: 'none', weight: 2, border: false, shadow: false, lines: false, edges: false },
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const pathEl = (p: TracedPath, attrs: string) => `<path d="${p.d}" transform="translate(${p.tx},${p.ty})" ${attrs}/>`;

/** the clip art as an SVG document: the picture's size plus room for the border and the shadow */
export function clipSvg(parts: ClipParts, s: ClipStyle): string {
  const W = parts.width, H = parts.height, size = Math.max(W, H);
  const shapes = pathsOf(parts.shapes), sil = pathsOf(parts.silhouette);
  const line = r2((size / 260) * [0, 1, 1.8, 3][s.weight]);
  const outer = s.outline !== 'none' || s.style === 'lineart' ? r2(line * 1.7) : 0;
  const border = s.border ? r2(size * 0.035) : 0;
  const sd = s.shadow ? r2(size * 0.012) : 0, dy = s.shadow ? r2(size * 0.012) : 0;
  const m = Math.ceil(Math.max(outer / 2, border) + (s.shadow ? sd * 3 + dy : 0) + 1);
  const parts2: string[] = [];
  parts2.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W + 2 * m}" height="${H + 2 * m}" viewBox="${-m} ${-m} ${W + 2 * m} ${H + 2 * m}">`);
  if (s.shadow) parts2.push(`<defs><filter id="clip-shadow" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="${dy}" stdDeviation="${sd}" flood-color="#000" flood-opacity="0.35"/></filter></defs>`);
  // the white border (with the shadow under it)
  if (s.border || s.shadow) {
    const fill = s.border ? '#ffffff' : s.style === 'silhouette' ? s.ink : '#ffffff';
    parts2.push(`<g${s.shadow ? ' filter="url(#clip-shadow)"' : ''}>${sil.map((p) => pathEl(p, `fill="${fill}" stroke="${fill}" stroke-width="${r2(border * 2)}" stroke-linejoin="round"`)).join('')}</g>`);
  }
  if (s.style === 'silhouette') {
    parts2.push(`<g>${sil.map((p) => pathEl(p, `fill="${s.ink}"`)).join('')}</g>`);
  } else {
    // the outline round the whole subject, under the shapes
    if (outer) {
      const c = s.style === 'lineart' ? s.ink : s.outline === 'black' ? '#1b1b1b' : darker(shapes[0]?.fill ?? '#333333', 0.55);
      parts2.push(`<g>${sil.map((p) => pathEl(p, `fill="${c}" stroke="${c}" stroke-width="${r2(outer * 2)}" stroke-linejoin="round"`)).join('')}</g>`);
    }
    const stroke = (fill: string) => s.style === 'lineart' ? s.ink : s.outline === 'shade' ? darker(fill) : '#1b1b1b';
    const thin = r2(line * 0.6);
    const attrs = (p: TracedPath) => s.style === 'lineart'
      ? `fill="#ffffff" stroke="${s.ink}" stroke-width="${thin}" stroke-linejoin="round"`
      : !s.edges ? `fill="${p.fill}"` : `fill="${p.fill}" stroke="${stroke(p.fill)}" stroke-width="${thin}" stroke-linejoin="round"`;
    parts2.push(`<g>${shapes.map((p) => pathEl(p, attrs(p))).join('')}</g>`);
    // the ink lines on top
    if (s.lines && parts.lines) {
      const c = s.style === 'lineart' ? s.ink : '#1b1b1b', extra = r2(line * 0.35 * (s.weight - 1));
      const st = extra > 0 ? ` stroke="${c}" stroke-width="${extra}" stroke-linejoin="round"` : '';
      parts2.push(`<g fill="${c}"${st}>${pathsOf(parts.lines).map((p) => pathEl(p, '')).join('')}</g>`);
    }
  }
  parts2.push('</svg>');
  return parts2.join('\n');
}
