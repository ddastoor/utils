// Keeps the screen on while something is read aloud (a phone that sleeps stops the page) — the Camera Reader. The browser lets
// the lock go when the tab is hidden: it is asked for again when the tab is shown. Refused or missing: the reading goes on.
export function screenOn() {
  let lock: any = null, want = false;
  const ask = async () => {
    const wl = (navigator as any).wakeLock;
    if (!want || lock || !wl || document.visibilityState !== 'visible') return;
    try {
      const l = await wl.request('screen');
      if (!want || lock) { l.release?.()?.catch?.(() => {}); return; }
      lock = l;
      l.addEventListener?.('release', () => { if (lock === l) lock = null; });
    } catch { /* refused */ }
  };
  const shown = () => { if (document.visibilityState === 'visible') void ask(); };
  document.addEventListener('visibilitychange', shown);
  const off = () => { want = false; const l = lock; lock = null; l?.release?.()?.catch?.(() => {}); };
  return { on() { want = true; void ask(); }, off, dispose() { off(); document.removeEventListener('visibilitychange', shown); } };
}
