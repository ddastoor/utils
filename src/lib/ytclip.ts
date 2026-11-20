// YouTube Clip's reading of links and times, and its writing of times (no DOM: unit-tested in tests/unit/ytclip.test.mjs).
/** "1h2m3s", "62", "62s", "1:02", "01:02:03.5" → seconds (NaN if unreadable). */
export function parseTime(t: string): number {
  t = String(t || '').trim().toLowerCase();
  if (!t) return NaN;
  if (/^\d+(\.\d+)?$/.test(t)) return +t;
  if (/^\d+(:\d{1,2}){1,2}(\.\d+)?$/.test(t)) { // minutes and seconds below 60 (1:60 was read as 2:00)
    const p = t.split(':').map(Number);
    return p.slice(1).every((x) => x < 60) ? p.reduce((a, x) => a * 60 + x, 0) : NaN;
  }
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(t);
  return m && (m[1] || m[2] || m[3]) ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : NaN;
}
/** Video id and ?t= / &t= / #t= / start= time from any common YouTube link. */
export function parseYouTube(url: string): { id: string; t: number } | null {
  let u: URL;
  try { u = new URL(url.trim().replace(/^(?!https?:)/, 'https://')); } catch { return null; }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id = '';
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (/^(youtube\.com|youtube-nocookie\.com)$/.test(host)) id = u.searchParams.get('v') || (/^\/(?:shorts|live|embed|v)\/([^/?#]+)/.exec(u.pathname)?.[1] ?? '');
  if (!/^[\w-]{11}$/.test(id)) return null;
  const t = u.searchParams.get('t') ?? u.searchParams.get('start') ?? (/[#&]t=([^&]+)/.exec(u.hash)?.[1] ?? '');
  return { id, t: t ? parseTime(t) : NaN };
}
/** 62.5 → "1:02.5"; rounded to hundredths first (59.996 came out "0:60") */
export const hms = (s0: number) => { const s = Math.round(s0 * 100) / 100, H = Math.floor(s / 3600), M = Math.floor((s % 3600) / 60), S = +(s - H * 3600 - M * 60).toFixed(2); return `${H ? `${H}:` : ''}${H ? String(M).padStart(2, '0') : M}:${S < 10 ? '0' : ''}${S}`; };
