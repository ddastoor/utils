import { ICONS } from './icons.gen';

/** An icon as SVG markup. An icon the map does not hold (yet) is drawn as a circle and named in `data-missing` — the lazy
 *  suite looks for it on every page. */
export function icon(name: string): string {
  const inner = ICONS[name], miss = inner === undefined ? ` data-missing="${name.replace(/[^\w]/g, '')}"` : '';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${miss}>${inner ?? ICONS.Circle}</svg>`;
}
