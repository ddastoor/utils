#!/usr/bin/env python3
"""Writes src/lib/tzabbr.json: for every time zone of the tzdata package inside src/wasm/bin/python314.zip,
    "offset/isdst=NAME …"                      the abbreviations it has used since 1970, newest first, and after a "|"
    "start:end:isdst:NAME,…"                   the periods (seconds since 1970) in which the simple rule below is wrong.

Why: CPython on wasm32-wasi has no time-zone database in its C library, so our WASI host answers its questions about
local time from the browser (src/lib/tzinfo.ts). The browser's Intl gives the offset at any moment, but not tzdata's
abbreviation (CLDR says "GST" for Dubai, tzdata "+04") nor its daylight flag. The host's rule: daylight time = the
larger of the year's January and July offsets; the name = the newest entry with that offset and flag (else the newest
with that offset). That is right almost always; where a zone's history breaks it (Moscow kept its summer offset as
standard time in 2011, Karachi's "+05" became "PKT" in 1971, Argentina's 1999 daylight time had the standard
offset…), this script — which reads the real transitions — records the period and what tzdata says for it. With the
table, time.tzname, strftime("%Z") and tm_isdst say what desktop CPython and the bundled zoneinfo module say.

Run again whenever python314.zip is rebuilt with another tzdata:      python3 scripts/make-tzabbr.py
"""
import datetime, json, os, shutil, struct, tempfile, zipfile, zoneinfo

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
z = zipfile.ZipFile(os.path.join(ROOT, 'src', 'wasm', 'bin', 'python314.zip'))
PREFIX = 'tzdata/zoneinfo/'


def parse(data):
    """The 64-bit block of a TZif file: transition times, their types, the types (utoff, isdst, abbr), the footer."""
    def block(pos, tsize):
        magic, version, isut, isstd, leap, timecnt, typecnt, charcnt = struct.unpack('>4sc15x6l', data[pos:pos + 44])
        assert magic == b'TZif'
        p = pos + 44
        times = struct.unpack(f'>{timecnt}{"q" if tsize == 8 else "l"}', data[p:p + timecnt * tsize]); p += timecnt * tsize
        idx = data[p:p + timecnt]; p += timecnt
        raw = [struct.unpack('>lBB', data[p + 6 * i:p + 6 * i + 6]) for i in range(typecnt)]; p += 6 * typecnt
        chars = data[p:p + charcnt]; p += charcnt
        p += leap * (tsize + 4) + isstd + isut
        return version, times, idx, [(u, d, chars[a:chars.index(b'\0', a)].decode()) for u, d, a in raw], p
    version, times, idx, types, end = block(0, 4)
    footer = ''
    if version >= b'2':
        version, times, idx, types, end = block(end, 8)
        footer = data[end:].decode().strip()
    return times, idx, types, footer


def entries(times, idx, types):
    """(utoff, isdst, abbr) of every local-time type in effect at or after 1970, newest first."""
    used = []                                   # type indexes, newest first
    for i in range(len(times) - 1, -1, -1):
        used.append(idx[i])
        if times[i] <= 0:
            break
    else:
        used.append(0)
    out, seen = [], set()
    for t in used:
        if types[t][:2] not in seen:
            seen.add(types[t][:2])
            out.append(types[t])
    return out


JAN, JUL, YEAR = 946684800, 962409600, 31556952        # src/lib/tzinfo.ts: yearOffsets()
END = 2145916800                                        # 2038-01-01


def exceptions(zone, times, idx, types, footer, ents):
    """Periods since 1970 in which the host's rule gives another daylight flag or name than tzdata."""
    off = lambda t: int(datetime.datetime.fromtimestamp(t, zone).utcoffset().total_seconds())
    exact = {(u, d): a for u, d, a in reversed(ents)}
    by_off = {}
    for u, d, a in ents:
        by_off.setdefault(u, (d, a))
    numeric = lambda u: ('-' if u < 0 else '+') + f'{abs(u) // 3600:02d}' + (f'{abs(u) % 3600 // 60:02d}' if abs(u) % 3600 // 60 else '')

    def rule(t, offset):
        y = datetime.datetime.fromtimestamp(t, datetime.timezone.utc).year
        a, b = off(JAN + (y - 2000) * YEAR), off(JUL + (y - 2000) * YEAR)
        std, dst = min(a, b), max(a, b)
        isdst = 1 if dst != std and offset == dst else 0
        if (offset, isdst) not in exact and offset in by_off:
            isdst = by_off[offset][0]
        return isdst, exact.get((offset, isdst)) or (by_off[offset][1] if offset in by_off else numeric(offset))

    def last_until(t0):
        """When the type that starts at the last listed transition ends: at the first change the footer's yearly rule
        brings (looked for day by day, then to the second), or never."""
        what = lambda t: (off(t), datetime.datetime.fromtimestamp(t, zone).tzname())
        w, t = what(t0), t0
        while t < min(t0 + 800 * 86400, END) and what(t + 86400) == w:
            t += 86400
        if t >= min(t0 + 800 * 86400, END):
            return END
        lo, hi = t, t + 86400
        while hi - lo > 1:
            mid = (lo + hi) // 2
            lo, hi = (mid, hi) if what(mid) == w else (lo, mid)
        return hi

    segs = []                                   # (start, end, type) from 1970 on
    for i in range(len(times)):
        nxt = times[i + 1] if i + 1 < len(times) else (END if ',' not in footer else last_until(max(0, times[i])))
        if nxt <= 0:
            continue
        segs.append((max(0, times[i]), min(nxt, END), types[idx[i]]))
    if not times or times[0] > 0:
        segs.insert(0, (0, min(times[0], END) if times else END, types[0]))
    out = []
    for start, end, (utoff, isdst, abbr) in segs:
        t = start
        while t < end:
            y = datetime.datetime.fromtimestamp(t, datetime.timezone.utc).year
            stop = min(end, int(datetime.datetime(y + 1, 1, 1, tzinfo=datetime.timezone.utc).timestamp()))
            if rule(t, utoff) != (isdst, abbr):
                if out and out[-1][1] == t and out[-1][2:] == (isdst, abbr):
                    out[-1] = (out[-1][0], stop, isdst, abbr)
                else:
                    out.append((t, stop, isdst, abbr))
            t = stop
    return out


tmp = tempfile.mkdtemp(prefix='tzabbr-')
z.extractall(tmp, [n for n in z.namelist() if n.startswith(PREFIX)])
zoneinfo.reset_tzpath([os.path.join(tmp, 'tzdata', 'zoneinfo')])
table, nexc = {}, 0
for info in z.infolist():
    n = info.filename
    if not n.startswith(PREFIX) or n.endswith('/'):
        continue
    data = z.read(n)
    if data[:4] != b'TZif':
        continue
    times, idx, types, footer = parse(data)
    ents = entries(times, idx, types)
    key = n[len(PREFIX):]
    exc = exceptions(zoneinfo.ZoneInfo(key), times, idx, types, footer, ents)
    nexc += len(exc)
    table[key] = ' '.join(f'{u}/{d}={a}' for u, d, a in ents) + ('|' + ','.join(f'{s}:{e}:{d}:{a}' for s, e, d, a in exc) if exc else '')
shutil.rmtree(tmp, ignore_errors=True)
dest = os.path.join(ROOT, 'src', 'lib', 'tzabbr.json')
with open(dest, 'w', encoding='utf-8') as f:
    json.dump(dict(sorted(table.items())), f, separators=(',', ':'))
    f.write('\n')
print(len(table), 'zones,', nexc, 'periods in which the simple rule is wrong →', os.path.normpath(dest), os.path.getsize(dest), 'bytes')
for k in ('Asia/Kolkata', 'Asia/Dubai', 'America/New_York', 'Europe/London', 'Europe/Dublin', 'Europe/Moscow', 'Asia/Karachi', 'Europe/Istanbul', 'UTC'):
    print(' ', k, '→', table.get(k))
