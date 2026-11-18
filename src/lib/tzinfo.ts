// What a C library asks about a time zone, answered from the browser's own time-zone database (Intl): the UTC offset
// at a moment, whether that is daylight time, the year's other offset and the zone's abbreviation. Used by our WASI
// host (src/lib/terminal/wasi.ts) for programs whose libc has no time zones (wasi-libc: CPython's localtime, mktime,
// strftime %Z %z) — see wasm/python/wasi_start.c.
export interface ZoneMoment { offset: number; isdst: boolean; other: number; name: string }

/**
 * `abbr`: this zone's entry of src/lib/tzabbr.json (scripts/make-tzabbr.py) — tzdata's own abbreviations,
 * "19800/0=IST …" (offset/isdst=name, newest first), and after a "|" the periods "start:end:isdst:name,…" in which
 * the rule used here (daylight time = the larger of the year's two offsets; the newest name for that offset) is
 * wrong. With it the names and the daylight flag are tzdata's, as desktop CPython and its zoneinfo module give them
 * ("+04" for Dubai, where Intl says "GST"); without it they are Intl's.
 */
export function zoneInfo(zone: string = Intl.DateTimeFormat().resolvedOptions().timeZone, abbr = '') {
  const exact = new Map<string, string>(), byOffset = new Map<number, [boolean, string]>();
  const [list, periods = ''] = abbr.split('|');
  const odd = periods ? periods.split(',').map((p) => { const [a, b, d, ...n] = p.split(':'); return { from: +a, to: +b, isdst: d === '1', name: n.join(':') }; }) : [];
  for (const e of list.split(' ')) {
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
  /** What the zone shows at the moment `utc`. */
  const at = (utc: number): ZoneMoment => {
    const offset = offsetAt(utc), [std, dst] = yearOffsets(utc);
    let isdst = dst !== std && offset === dst;
    // tzdata knows better which of a zone's two offsets is "daylight" (Dublin: winter time is the daylight one)
    if (exact.size && !exact.has(`${offset}/${isdst ? 1 : 0}`)) { const o = byOffset.get(offset); if (o) isdst = o[0]; }
    for (const p of odd) if (utc >= p.from && utc < p.to) return { offset, isdst: p.isdst, other: otherOf(utc, offset, std, dst, p.isdst), name: p.name };
    return { offset, isdst, other: otherOf(utc, offset, std, dst, isdst), name: nameAt(utc, offset, isdst) };
  };
  // The offset mktime() uses when the caller's daylight flag disagrees with the calendar (glibc: "look for a
  // neighbouring time with the right flag and use its offset … else assume one-hour daylight time"): the year's
  // other offset; if the year has only one, that of the nearest year within 17 that has two; else an hour away.
  const otherOf = (utc: number, offset: number, std: number, dst: number, isdst: boolean): number => {
    if (std !== dst) return offset === std ? dst : std;
    for (let d = 1; d <= 17; d++) for (const sign of [-1, 1]) {
      const [s2, d2] = yearOffsets(utc + sign * d * 31556952);
      if (s2 !== d2) return isdst ? s2 : d2;
    }
    return isdst ? offset - 3600 : offset + 3600;
  };
  // glibc's mktime() remembers the offset of its last answer and starts its next search from there, so what a
  // reading that exists twice (clocks moved back) means depends on the conversions before it — as on the desktop
  let guess = 0;
  /**
   * `local` = false: `secs` is a moment (UTC). true: `secs` is a wall-clock reading in this zone (what mktime has):
   * the answer's `offset` is the one to subtract from the reading (glibc's search: start from the remembered offset,
   * correct at most six times; a reading that does not exist — clocks moved forward — settles on the daylight side,
   * so 02:30 on such a night becomes 03:30), `isdst` and `name` describe the moment it lands on.
   */
  return (secs: number, local = false): ZoneMoment => {
    if (!Number.isFinite(secs) || Math.abs(secs) > 8.64e12) return { offset: 0, isdst: false, other: 0, name: 'UTC' };
    if (!local) return at(secs);
    let t = secs + guess, t1 = t, t2 = t, m = at(t);
    for (let probes = 6; ; probes--) {
      const dt = secs - (t + m.offset);
      if (!dt) break;
      // going round in circles between two moments: the reading does not exist. glibc stops on the daylight side;
      // that is the later moment (zone files differ on which side Dublin's "daylight" is, the later moment does not)
      if (probes === 0 || (t === t1 && t !== t2 && t > t2)) break;
      t1 = t2; t2 = t; t += dt; m = at(t);
    }
    guess = t - secs;
    const off = secs - t;
    if (off === m.offset) return m;
    // a reading that does not exist: `offset` is the one from before the change (subtracting it lands after the
    // gap), so the flag and the "other" offset describe that side — mktime() swaps them when the caller's daylight
    // flag asks for the other reading (glibc: "preferring a time whose tm_isdst differs from the requested value")
    return { offset: off, isdst: at(secs - m.offset).isdst, other: m.offset, name: m.name };
  };
}

/**
 * The `supertools.tz_info(seconds, is_local, out[3], name, cap)` import of a WebAssembly module whose C library has
 * no time zones (wasm/python/wasi_start.c, wasm/jq/hosttz.c): writes { seconds east of UTC, daylight time?, the
 * year's other offset } to `out` and the zone's abbreviation to `name`. `buffer`: the module's memory (it can grow,
 * so it is asked for on every call); `zone`: the IANA zone and its tzabbr.json entry, re-read when they change.
 */
export function tzInfoImport(buffer: () => ArrayBufferLike, zone: () => { zone?: string; abbr?: string; run?: number } = () => ({})) {
  let key = '', z: ReturnType<typeof zoneInfo> | null = null;
  const enc = new TextEncoder();
  return (secs: bigint, local: number, out: number, name: number, cap: number): void => {
    // `run`: a number that changes with every program run — a new run starts like a new process (nothing remembered)
    const want = zone(), k = `${want.zone ?? ''}|${want.abbr ?? ''}|${want.run ?? 0}`;
    if (!z || k !== key) { z = zoneInfo(want.zone, want.abbr); key = k; }
    const m = z(Number(secs), !!local), buf = buffer(), dv = new DataView(buf);
    dv.setInt32(out, m.offset, true); dv.setInt32(out + 4, m.isdst ? 1 : 0, true); dv.setInt32(out + 8, m.other, true);
    const b = enc.encode(m.name).subarray(0, Math.max(0, cap - 1));
    new Uint8Array(buf).set(b, name); dv.setUint8(name + b.length, 0);
  };
}

