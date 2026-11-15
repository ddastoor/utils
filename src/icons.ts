import { ICONS } from './icons.gen';

export function icon(name: string): string {
  const inner = ICONS[name] ?? ICONS.Circle;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
