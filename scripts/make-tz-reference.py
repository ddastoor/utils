#!/usr/bin/env python3
"""Reference for the Time Zone Converter → tests/fixtures/tz/reference.json

Python's zoneinfo on the system's tzdata (the IANA database itself; the app asks the browser's ICU copy of it):
  * offsets — seconds ahead of UTC of 52 zones at 1 January and 1 July of 18 years from 1850 to 2037 and at 400
    random instants (local mean time with its seconds, wartime double summer time, abolished and reintroduced
    daylight saving, half-hour and quarter-hour zones);
  * readings — a wall-clock reading in a zone → the instant it stands for and whether it exists once, twice or not at
    all: around every clock change of seven recent years (30 minutes before, at the change, 30 minutes in, at its
    end, 30 minutes after) and at random times. A reading that exists twice is the first of the two (fold = 0); one
    that does not exist is read with the offset from before the change — Python's own rule, and java.time's.

    python3 scripts/make-tz-reference.py
"""
import json, os, random
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

random.seed(20261119)
OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'tz', 'reference.json')
UTC = timezone.utc
ZONES = ['Asia/Kolkata', 'UTC', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Sao_Paulo',
         'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Kathmandu', 'Asia/Colombo', 'Australia/Sydney', 'Australia/Perth',
         'Pacific/Auckland', 'Africa/Johannesburg', 'Africa/Lagos', 'Europe/Moscow', 'Asia/Riyadh', 'Asia/Seoul', 'Asia/Jakarta', 'Asia/Manila',
         # the unusual ones
         'Australia/Lord_Howe', 'Pacific/Chatham', 'Pacific/Apia', 'Pacific/Kiritimati', 'America/St_Johns', 'Africa/Casablanca', 'Europe/Dublin', 'Asia/Tehran', 'Africa/Cairo', 'America/Nuuk',
         'Antarctica/Troll', 'America/Caracas', 'Africa/Monrovia', 'Europe/Brussels', 'America/Phoenix', 'Pacific/Honolulu', 'Asia/Yangon', 'Australia/Adelaide', 'America/Havana', 'Asia/Jerusalem',
         'America/Santiago', 'Europe/Lisbon']
# Not in the list: zones that IANA's main data links to a neighbour for the time before 1970 (Europe/Amsterdam → Brussels,
# Europe/Oslo → Berlin …). Debian and Ubuntu build tzdata with the "backzone" file, which gives them back their own old
# history; ICU — the browser — follows the main data. For those zones this reference would describe another database.
version = open('/usr/share/zoneinfo/tzdata.zi').readline().split()[-1]
epoch = lambda dt: int((dt - datetime(1970, 1, 1, tzinfo=UTC)).total_seconds())

offsets = []
for zi, name in enumerate(ZONES):
    z = ZoneInfo(name)
    moments = [datetime(y, m, 1, 12, tzinfo=UTC) for y in (1850, 1880, 1900, 1925, 1942, 1950, 1970, 1985, 2000, 2010, 2016, 2019, 2022, 2024, 2025, 2026, 2030, 2037) for m in (1, 7)]
    moments += [datetime(1970, 1, 1, tzinfo=UTC) + timedelta(seconds=random.randint(-3_000_000_000, 2_500_000_000)) for _ in range(8)]
    for t in moments:
        offsets.append([zi, epoch(t), int(t.astimezone(z).utcoffset().total_seconds())])

def resolve(z, w):
    """a naive wall-clock reading → (instant, kind)"""
    a, b = w.replace(tzinfo=z, fold=0), w.replace(tzinfo=z, fold=1)
    at = (w - a.utcoffset()).replace(tzinfo=UTC)
    if a.utcoffset() == b.utcoffset(): kind = 'ok'
    elif at.astimezone(z).replace(tzinfo=None) == w: kind = 'twice'
    else: kind = 'skipped'
    return at, kind

readings, changes = [], 0
for zi, name in enumerate(ZONES):
    z = ZoneInfo(name)
    walls = set()
    for year in (2011, 2016, 2019, 2022, 2024, 2025, 2026):
        t, end = datetime(year, 1, 1, tzinfo=UTC), datetime(year + 1, 1, 1, tzinfo=UTC)
        prev = t.astimezone(z).utcoffset()
        while t < end:  # find the changes of the year to the minute
            nxt = t + timedelta(hours=1)
            if nxt.astimezone(z).utcoffset() != prev:
                lo, hi = t, nxt
                while hi - lo > timedelta(minutes=1):
                    mid = lo + (hi - lo) / 2
                    if mid.astimezone(z).utcoffset() == prev: lo = mid
                    else: hi = mid
                new = hi.astimezone(z).utcoffset(); changes += 1
                before, after = (hi + prev).replace(tzinfo=None), (hi + new).replace(tzinfo=None)  # the wall clock at the change, old and new
                first, last = min(before, after), max(before, after)
                for w in (first - timedelta(minutes=30), first, first + timedelta(minutes=1), first + (last - first) / 2, last - timedelta(minutes=1), last, last + timedelta(minutes=30)):
                    walls.add(w.replace(second=0, microsecond=0))
                prev = new
            t = nxt
    for _ in range(12):
        walls.add(datetime(random.randint(1900, 2037), random.randint(1, 12), random.randint(1, 28), random.randint(0, 23), random.randint(0, 59)))
    for w in sorted(walls):
        at, kind = resolve(z, w)
        readings.append([zi, w.strftime('%Y-%m-%d'), w.strftime('%H:%M'), epoch(at), kind])

ref = {'made_with': f'Python zoneinfo, tzdata {version}', 'zones': ZONES, 'offsets': offsets, 'readings': readings}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f: json.dump(ref, f, separators=(',', ':'))
kinds = {k: sum(1 for r in readings if r[4] == k) for k in ('ok', 'twice', 'skipped')}
print(version, len(ZONES), 'zones,', len(offsets), 'offsets,', len(readings), 'readings', kinds, changes, 'clock changes;', os.path.getsize(OUT), 'bytes')
