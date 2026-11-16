// Linux display-server detection (owner requirement: auto-detect X11 vs Wayland) for the screen-capture tools.
// No web API reports it and Chrome's user agent says "X11; Linux" on both, so:
//  1. passive: Wayland never tells clients their global window position → Chrome reports screenX = screenY = 0.
//     A non-zero position ⇒ X11 (or XWayland, which behaves as X11). Zero ⇒ Wayland (likely): a maximised X11 window
//     at the top-left corner is also at 0,0.
//  2. active ("Confirm"): open a tiny pop-up, moveTo(120, 120) and read its position — X11 honours it, Wayland ignores
//     it. The answer is kept in memory for this visit only.
import { h, button, note, sleep } from './ui';

export type Display = 'x11' | 'wayland';
export const isLinuxDesktop = () => /Linux/.test(navigator.userAgent) && !/Android|CrOS/.test(navigator.userAgent);
let confirmed: Display | null = null;

export function detectPassive(): { display: Display; sure: boolean } {
  if (confirmed) return { display: confirmed, sure: true };
  return screenX !== 0 || screenY !== 0 ? { display: 'x11', sure: true } : { display: 'wayland', sure: false };
}
export async function confirmDisplay(): Promise<Display> {
  const w = window.open('about:blank', 'supertools-probe', 'popup,width=160,height=100,left=0,top=0');
  if (!w) throw new Error('The browser blocked the small test window: allow pop-ups for this site and try again.');
  try {
    w.document.title = 'Checking…';
    w.moveTo(120, 120);
    await sleep(350);
    confirmed = Math.abs(w.screenX - 120) <= 24 && Math.abs(w.screenY - 120) <= 60 ? 'x11' : 'wayland';
  } finally { w.close(); }
  return confirmed;
}

const TIPS: Record<Display, string> = {
  x11: 'X11: Chrome’s own picker lists screens and windows. Minimise the browser with your desktop’s shortcut (often Super+H or Super+↓).',
  wayland: 'Wayland: after Chrome’s picker, the desktop (GNOME/KDE portal) shows its own picker — choose the screen or window there too. Keep the capture running for repeated shots to avoid being asked again. Minimise with Super+H (GNOME). If capturing fails, enable chrome://flags/#enable-webrtc-pipewire-capturer and install xdg-desktop-portal (and -gnome or -kde).',
};
/** A small "Detected: X11 / Wayland" note with a Confirm button (Linux desktops only; null elsewhere). */
export function linuxBanner(): HTMLElement | null {
  if (!isLinuxDesktop()) return null;
  const box = h('div', { class: 'stack linux-banner' });
  const draw = () => {
    const { display, sure } = detectPassive();
    box.replaceChildren(note(h('span', null, h('strong', null, `Detected: ${display === 'x11' ? 'X11' : 'Wayland'}${sure ? '' : ' (likely)'}. `), TIPS[display]), 'info'),
      sure ? h('span') : h('div', { class: 'row' }, button('Confirm X11 or Wayland', async () => { await confirmDisplay(); draw(); }, { small: true, icon: 'ScanSearch' })));
  };
  draw();
  return box;
}
