#!/usr/bin/env python3
"""Recorded answers of Radio Browser (radio-browser.info) for World Radio's tests: tests/fixtures/radio/.

    python3 scripts/make-radio-fixtures.py [--from DIR]

The e2e harness answers every page's requests to the directory from these files (tests/lib/radiostub.mjs), so that no suite — the
sweeps over every tab included — reaches the real directory; the unit suite reads stations and lists from them. Kept: India's most
listened stations, All India Radio's, the stations of the quick picks' tags (news, devotional, classical, Bollywood), the world's most
listened, the countries, the 300 languages and genres with the most stations. Only the fields World Radio reads (no logos).
--from DIR reads saved answers (in-all.json, world.json, bollywood.json, countries.json, languages.json, tags.json) instead.
"""
import json, os, re, sys, urllib.request

OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'radio')
SERVERS = ['de1.api.radio-browser.info', 'de2.api.radio-browser.info', 'all.api.radio-browser.info']
KEEP = ['stationuuid', 'name', 'url', 'url_resolved', 'homepage', 'tags', 'country', 'countrycode', 'state', 'language', 'codec', 'bitrate',
        'hls', 'lastcheckok', 'lastchecktime_iso8601', 'clickcount', 'votes']
AIR = re.compile(r'\b(all india radio|a+kashvani|vividh bhara?ti)\b|(?<!\bon\s)\bair\b', re.I)
PICK_TAGS = {'news', 'news talk', 'devotional', 'spiritual', 'bhakti', 'mantra', 'religious', 'classical', 'carnatic', 'hindustani classical', 'bollywood'}


def get(path):
    for host in SERVERS:
        try:
            req = urllib.request.Request(f'https://{host}{path}', headers={'User-Agent': 'SuperUtils-tests/1.0'})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception as e:  # the next server
            print(f'{host}: {e}', file=sys.stderr)
    sys.exit(f'no server answered {path}')


def main():
    src = sys.argv[sys.argv.index('--from') + 1] if '--from' in sys.argv else None
    load = (lambda f, path: json.load(open(os.path.join(src, f), encoding='utf8'))) if src else (lambda f, path: get(path))
    india = load('in-all.json', '/json/stations/search?countrycode=IN&order=clickcount&reverse=true&hidebroken=true&limit=1000')
    world = load('world.json', '/json/stations/search?order=clickcount&reverse=true&hidebroken=true&limit=120')
    bolly = load('bollywood.json', '/json/stations/search?tag=bollywood&tagExact=true&order=clickcount&reverse=true&hidebroken=true&limit=40')
    countries = load('countries.json', '/json/countries?hidebroken=true')
    languages = load('languages.json', '/json/languages?order=stationcount&reverse=true&hidebroken=true&limit=300')
    tags = load('tags.json', '/json/tags?order=stationcount&reverse=true&hidebroken=true&limit=300')

    india.sort(key=lambda s: -s['clickcount'])
    tamil = [s for s in india if 'tamil' in s['language'].lower().split(',')][:15]
    chosen = india[:90] + [s for s in india if AIR.search(s['name'])] + [s for s in india if PICK_TAGS & {t.strip() for t in s['tags'].lower().split(',')}] + tamil + world + bolly
    out, seen = [], set()
    for s in chosen:
        if s['stationuuid'] in seen:
            continue
        seen.add(s['stationuuid'])
        out.append({k: s.get(k) for k in KEEP})
    out.sort(key=lambda s: -s['clickcount'])
    os.makedirs(OUT, exist_ok=True)
    for name, data in [('stations.json', out), ('countries.json', countries), ('languages.json', languages), ('tags.json', tags)]:
        with open(os.path.join(OUT, name), 'w', encoding='utf8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
            f.write('\n')
    print(f'{len(out)} stations ({sum(1 for s in out if s["countrycode"] == "IN")} of India, {sum(1 for s in out if AIR.search(s["name"]))} of All India Radio), '
          f'{len(countries)} countries, {len(languages)} languages, {len(tags)} genres')


if __name__ == '__main__':
    main()
