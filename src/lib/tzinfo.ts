// What a C library asks about a time zone, answered from the browser's own time-zone database (Intl): the UTC offset
// at a moment, whether that is daylight time, the year's other offset and the zone's abbreviation. Used by our WASI
// host (src/lib/terminal/wasi.ts) for programs whose libc has no time zones (wasi-libc: CPython's localtime, mktime,
// strftime %Z %z) — see wasm/python/wasi_start.c.
export interface ZoneMoment { offset: number; isdst: boolean; other: number; name: string }

/**
 * `abbr`: tzdata's own abbreviations for this zone — "19800/0=IST …" (offset/isdst=name, newest first) from
 * src/lib/tzabbr.json (scripts/make-tzabbr.py). With it the names and the daylight flag are tzdata's, as desktop
 * CPython and its zoneinfo module give them ("+04" for Dubai, where Intl says "GST"); without it they are Intl's.
 */
export function zoneInfo(zone: string = Intl.DateTimeFormat().resolvedOptions().timeZone, abbr = '') {
  const exact = new Map<string, string>(), byOffset = new Map<number, [boolean, string]>();
  for (const e of abbr.split(' ')) {
    const m = /^(-?\d+)\/([01])=(.+)$/.exec(e); if (!m) continue;
    exact.set(`${m[1]}/${m[2]}`, m[3]); if (!byOffset.has(+m[1])) byOffset.set(+m[1], [m[2] === '1', m[3]]);
  }
  let fmt: Intl.DateTimeFormat;
  try { fmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', era: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }); }
  catch { zone = 'UTC'; fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hourCycle: 'h23', era: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }); }
  /** Seconds east of UTC at the moment `utc` (seconds since 1970). */
  const offsetAt = (utc: number): number => {
    const d = new Date(utc * 1000); if (Number.isNaN(d.getTime())) return 0;
    const p: Record<string, string> = {}; for (const x of fmt.formatToParts(d)) p[x.type] = x.value;
    const year = p.era === 'BC' ? 1 - +p.year : +p.year;
    const wall = new Date(Date.UTC(2000, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)); wall.setUTCFullYear(year);   // Date.UTC would read the year 26 as 1926
    return Math.round(wall.getTime() / 1000 - Math.floor(utc));
  };
  // per calendar year: the offset of standard time (the smaller one) and of daylight time
  const years = new Map<number, [number, number]>();
  const yearOffsets = (utc: number): [number, number] => {
    const y = new Date(utc * 1000).getUTCFullYear(); let v = years.get(y);
    if (!v) { const a = offsetAt(Date.UTC(2000, 0, 1) / 1000 + (y - 2000) * 31556952), b = offsetAt(Date.UTC(2000, 6, 1) / 1000 + (y - 2000) * 31556952); v = [Math.min(a, b), Math.max(a, b)]; if (years.size > 400) years.clear(); years.set(y, v); }
    return v;
  };
  // "IST", "CEST", "EDT" where some English locale has an abbreviation, else "+0530" (as C libraries name such zones)
  const names = new Map<string, string>();
  const nameAt = (utc: number, offset: number, isdst: boolean): string => {
    const key = `${offset}/${isdst}`; let n = names.get(key);
    if (n === undefined) {
      n = exact.get(`${offset}/${isdst ? 1 : 0}`) ?? byOffset.get(offset)?.[1] ?? '';
      if (!n && !exact.size) for (const loc of ['en-IN', 'en-US', 'en-GB', 'en-AU', 'en-CA', 'en-NZ', 'en-ZA']) {
        const tz = new Intl.DateTimeFormat(loc, { timeZone: zone, timeZoneName: 'short' }).formatToParts(new Date(utc * 1000)).find((x) => x.type === 'timeZoneName')?.value || '';
        if (/^[A-Z]{2,6}$/.test(tz)) { n = tz; break; }
      }
      if (!n) { const a = Math.abs(offset), h = Math.floor(a / 3600), m = Math.floor((a % 3600) / 60); n = `${offset < 0 ? '-' : '+'}${String(h).padStart(2, '0')}${m ? String(m).padStart(2, '0') : ''}`; }
      if (!exact.size && (zone === 'UTC' || zone === 'Etc/UTC')) n = 'UTC';
      names.set(key, n);
    }
    return n;
  };
  /** `local` = false: `secs` is a moment (UTC). true: `secs` is a wall-clock reading in this zone (what mktime has). */
  return (secs: number, local = false): ZoneMoment => {
    if (!Number.isFinite(secs) || Math.abs(secs) > 8.64e12) return { offset: 0, isdst: false, other: 0, name: 'UTC' };
    let utc = secs;
    if (local) { const first = offsetAt(secs - offsetAt(secs)); utc = secs - (offsetAt(secs - first) === first ? first : offsetAt(secs - first)); }
    const offset = offsetAt(utc), [std, dst] = yearOffsets(utc);
    let isdst = dst !== std && offset === dst;
    // tzdata knows better which of a zone's two offsets is "daylight" (Dublin: winter time is the daylight one)
    if (exact.size && !exact.has(`${offset}/${isdst ? 1 : 0}`)) { const o = byOffset.get(offset); if (o) isdst = o[0]; }
    return { offset, isdst, other: offset === std ? dst : std, name: nameAt(utc, offset, isdst) };
  };
}
