#!/usr/bin/env python3
"""Writes src/lib/tzabbr.json: for every time zone of the tzdata package inside src/wasm/bin/python314.zip, the
abbreviations it has used since 1970 — "offset/isdst=NAME" entries, newest first.

Why: CPython on wasm32-wasi has no time-zone database in its C library, so our WASI host answers its questions about
local time from the browser (src/lib/tzinfo.ts: offsets and daylight time from Intl). Intl's abbreviations are CLDR's
("GST" for Dubai, "SGT" for Singapore), CPython's come from tzdata ("+04", "+08") — with this table time.tzname,
strftime("%Z") and tm_zone say what desktop CPython and the bundled zoneinfo module say.

Run again whenever python314.zip is rebuilt with another tzdata:      python3 scripts/make-tzabbr.py
"""
import json, os, struct, zipfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
z = zipfile.ZipFile(os.path.join(ROOT, 'src', 'wasm', 'bin', 'python314.zip'))
PREFIX = 'tzdata/zoneinfo/'


def entries(data):
    """(utoff, isdst, abbr) of every local-time type in effect at or after 1970, newest first."""
    def block(pos, tsize):
        magic, version, isut, isstd, leap, timecnt, typecnt, charcnt = struct.unpack('>4sc15x6l', data[pos:pos + 44])
        assert magic == b'TZif'
        p = pos + 44
        times = struct.unpack(f'>{timecnt}{"q" if tsize == 8 else "l"}', data[p:p + timecnt * tsize]); p += timecnt * tsize
        idx = data[p:p + timecnt]; p += timecnt
        types = [struct.unpack('>lBB', data[p + 6 * i:p + 6 * i + 6]) for i in range(typecnt)]; p += 6 * typecnt
        chars = data[p:p + charcnt]; p += charcnt
        p += leap * (tsize + 4) + isstd + isut
        return version, times, idx, types, chars, p
    version, times, idx, types, chars, end = block(0, 4)
    footer = ''
    if version >= b'2':
        version, times, idx, types, chars, end = block(end, 8)
        footer = data[end:].decode().strip()
    name = lambda t: chars[t[2]:chars.index(b'\0', t[2])].decode()
    used = []                                   # type indexes, newest first
    for i in range(len(times) - 1, -1, -1):
        used.append(idx[i])
        if times[i] <= 0:
            break
    else:
        used.append(0 if not times or times[0] > 0 else idx[0])
    out, seen = [], set()
    for t in used:
        utoff, isdst, _ = types[t]
        key = (utoff, isdst)
        if key not in seen:
            seen.add(key)
            out.append((utoff, isdst, name(types[t])))
    return out, footer


table = {}
for info in z.infolist():
    n = info.filename
    if not n.startswith(PREFIX) or n.endswith('/'):
        continue
    data = z.read(n)
    if data[:4] != b'TZif':
        continue
    ents, footer = entries(data)
    table[n[len(PREFIX):]] = ' '.join(f'{u}/{d}={a}' for u, d, a in ents)
dest = os.path.join(ROOT, 'src', 'lib', 'tzabbr.json')
with open(dest, 'w', encoding='utf-8') as f:
    json.dump(dict(sorted(table.items())), f, separators=(',', ':'))
    f.write('\n')
print(len(table), 'zones →', os.path.normpath(dest), os.path.getsize(dest), 'bytes')
for k in ('Asia/Kolkata', 'Asia/Dubai', 'America/New_York', 'Europe/London', 'Europe/Dublin', 'Australia/Lord_Howe', 'Europe/Moscow', 'UTC', 'Asia/Kathmandu'):
    print(' ', k, '→', table.get(k))
