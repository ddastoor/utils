// The small always-on-top countdown window of the Screenshot and Screencast tabs (Document Picture-in-Picture): it stays
// above other windows, so the countdown can be seen with the browser minimised or another window in front. Its number
// is #n, its buttons #s (go now: "Snap now", "Start now") and #c (Cancel). The tab closes it before it takes its picture
// or starts recording, so it is never in the shot or the recording.

/** Opens the window, or gives null where the browser has none (Firefox, Safari) or refuses it (no click left for it). */
export async function countdownWindow(nowLabel: string, onNow: () => void, onCancel: () => void): Promise<Window | null> {
  const dpip = (window as any).documentPictureInPicture;
  if (!dpip) return null;
  try {
    const w: Window = await dpip.requestWindow({ width: 260, height: 160 });
    const d = w.document;
    d.body.innerHTML = '';
    const css = d.createElement('style');
    css.textContent = 'body{margin:0;font:600 15px system-ui,sans-serif;background:#1e1b4b;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;height:100vh;text-align:center}#n{font:800 44px system-ui}#n:empty,#t:empty{display:none}#t{font:500 13px system-ui;padding:0 10px}button{font:600 14px system-ui;border:0;border-radius:8px;padding:8px 12px;cursor:pointer}#s{background:#818cf8;color:#fff}#c{background:#334155;color:#fff}';
    d.head.append(css);
    const n = d.createElement('div'); n.id = 'n';
    const t = d.createElement('div'); t.id = 't';
    const now = d.createElement('button'); now.id = 's'; now.textContent = nowLabel; now.onclick = onNow;
    const cancel = d.createElement('button'); cancel.id = 'c'; cancel.textContent = 'Cancel'; cancel.onclick = onCancel;
    const row = d.createElement('div'); row.append(now, ' ', cancel);
    d.body.append(n, t, row);
    return w;
  } catch { return null; }
}

/** The number shown in the window ('' hides it). */
export const showCount = (w: Window | null, k: number | '') => { const n = w?.document.getElementById('n'); if (n) n.textContent = String(k); };
/** A line of text under it (the scrolling screenshot's progress; '' hides it). */
export const showText = (w: Window | null, text: string) => { const t = w?.document.getElementById('t'); if (t) t.textContent = text; };
