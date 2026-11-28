#!/usr/bin/env python3
"""The World Clock's reference answers (tests/fixtures/worldclock/reference.json), from independent implementations:

    python3 scripts/make-worldclock-reference.py        (pip install astral==3.2; the system's tzdata for zoneinfo)

  - astral 3.2 (NOAA's solar equations, as the tab's mathcore m_sun follows them): sunrise and sunset in each city's own zone on
    its own calendar day — or that the sun stays up / stays down all day — for 160 cities (the tab's sets, the far north and
    south, and a seeded sample of the list) on 90 days of 2026 – 2027;
  - Python's zoneinfo over the system's tzdata: every change of a zone's UTC offset in 2026 – 2027 (to the second), for every
    zone of the list and UTC.
The cities and their coordinates are those of src/lib/worldcities.json (two decimals), so both sides see the same place.
"""
import datetime as dt, json, random
from pathlib import Path
from zoneinfo import ZoneInfo

import astral
from astral.sun import sunrise, sunset

ROOT = Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / 'src/lib/worldcities.json').read_text())
IDS = json.loads((ROOT / 'tests/fixtures/worldclock/ids.json').read_text())
OUT = ROOT / 'tests/fixtures/worldclock/reference.json'

SETS = ['new-york-us', 'san-francisco-us', 'london-gb', 'mumbai-in', 'sydney-au', 'hong-kong-hk', 'singapore-sg', 'tokyo-jp', 'dubai-ae',
        'paris-fr', 'berlin-de', 'toronto-ca', 'sao-paulo-br', 'johannesburg-za', 'delhi-in', 'honolulu-us', 'anchorage-us', 'reykjavik-is',
        'longyearbyen-sj', 'tromso-no', 'murmansk-ru', 'norilsk-ru', 'nuuk-gl', 'ushuaia-ar', 'hobart-au', 'st-john-s-ca', 'kathmandu-np',
        'auckland-nz', 'apia-ws', 'pago-pago-as', 'quito-ec', 'kampala-ug', 'singapore-sg', 'anadyr-ru']


def lines():
    out = []
    for i, line in enumerate(DATA['cities']):
        cid, name, cc, zi, lat, lon, st, al = line.split('|')
        out.append({'id': IDS['ids'][i], 'name': name, 'zone': DATA['zones'][int(zi)], 'lat': float(lat), 'lon': float(lon)})
    return out


def event(fn, obs, day, zone):
    try:
        t = fn(obs, day, tzinfo=ZoneInfo(zone))
        assert t.date() == day
        return round(t.timestamp(), 3)                    # seconds since 1970, to the millisecond
    except ValueError as e:
        m = str(e)
        if 'always above' in m:
            return 'up'
        if 'always below' in m:
            return 'down'
        if 'Unable to find' in m:
            return None
        raise


def transitions(zone):
    z = ZoneInfo(zone)
    utc = dt.timezone.utc
    t0 = dt.datetime(2026, 1, 1, tzinfo=utc)
    end = dt.datetime(2028, 1, 1, tzinfo=utc)
    off = lambda t: int(t.astimezone(z).utcoffset().total_seconds())
    out, t, step = [], t0, dt.timedelta(hours=6)
    prev = off(t)
    while t < end:
        n = t + step
        o = off(n)
        if o != prev:
            lo, hi = t, n                               # bisect to the second: off(lo) == prev, off(hi) != prev
            while (hi - lo) > dt.timedelta(seconds=1):
                mid = lo + (hi - lo) / 2
                mid = mid.replace(microsecond=0)
                if off(mid) == prev:
                    lo = mid
                else:
                    hi = mid
            out.append([int(hi.timestamp()), prev, off(hi)])
            prev = off(hi)
        t = n
    return out


def main():
    cities = lines()
    by = {c['id']: c for c in cities}
    missing = [i for i in SETS if i not in by]
    assert not missing, missing
    rnd = random.Random(73)
    pick = list(dict.fromkeys(SETS + [c['id'] for c in rnd.sample(cities, 130)]))
    days = [dt.date(2026, 1, 1) + dt.timedelta(days=16 * k + rnd.randrange(16)) for k in range(46)]
    days += [dt.date(2026, 3, 20), dt.date(2026, 6, 21), dt.date(2026, 9, 23), dt.date(2026, 12, 21), dt.date(2026, 11, 28)]
    days = sorted(set(days))
    sun = []
    for cid in pick:
        c = by[cid]
        obs = astral.Observer(latitude=c['lat'], longitude=c['lon'], elevation=0.0)
        for d in days:
            sun.append([cid, d.isoformat(), event(sunrise, obs, d, c['zone']), event(sunset, obs, d, c['zone'])])
    zones = sorted(set(DATA['zones']) | {'UTC'})
    tz = {z: transitions(z) for z in zones}
    tzver = (Path('/usr/share/zoneinfo/tzdata.zi').read_text().split('\n')[0].split()[-1]) if Path('/usr/share/zoneinfo/tzdata.zi').exists() else '?'
    OUT.write_text(json.dumps({'astral': '3.2', 'tzdata': tzver, 'sun': sun, 'changes': tz}, ensure_ascii=False, separators=(',', ':')) + '\n')
    n = sum(len(v) for v in tz.values())
    print(f'{len(sun)} sun days of {len(pick)} cities, {n} offset changes in {len(zones)} zones (tzdata {tzver}) → {OUT.relative_to(ROOT)} ({OUT.stat().st_size:,} bytes)')


if __name__ == '__main__':
    main()
