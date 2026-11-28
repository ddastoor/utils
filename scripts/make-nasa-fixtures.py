#!/usr/bin/env python3
"""Recorded answers of NASA's Image and Video Library for the NASA Image Explorer's tests: tests/fixtures/nasa/.

    python3 scripts/make-nasa-fixtures.py

- search-earth.json    images-api.nasa.gov/search: "earth from space", images, 24 a page — what the tab shows as it opens.
- search-earth-2.json  … its second page (the tab's "More").
- search-nebula.json   "nebula", images, 24 a page.
- search-apollo.json   "apollo 11", images of 1969 only (year_start = year_end = 1969), 12 a page.
- search-video.json    "mars rover", videos, 6 a page.
- assets.json          images-api.nasa.gov/asset/<nasa_id> of the items the suites open: the files of an item (its renditions; a video's MP4s and captions)
The pictures and videos themselves are not recorded: the e2e harness answers NASA's file server with test pictures
(tests/fixtures/wallpapers/busy.jpg, face.jpg, tall.jpg) and a test video (tests/fixtures/media/clip.mp4, subs.srt) — tests/lib/nasastub.mjs.
NASA's API needs no key; this script asks it a few times, once each.
"""
import json, os, sys, time, urllib.parse, urllib.request

OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'nasa')
UA = {'User-Agent': 'SuperUtils-tests/1.0 (recording test fixtures)'}
API = 'https://images-api.nasa.gov'


def get(url):
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.load(r)
        except Exception as e:
            print(f'{url[:100]}: {e}', file=sys.stderr)
            time.sleep(3 * (i + 1))
    sys.exit(f'no answer: {url}')


def save(name, data):
    with open(os.path.join(OUT, name), 'w', encoding='utf8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')


def search(name, **q):
    j = get(f'{API}/search?{urllib.parse.urlencode(q)}')
    save(name, j)
    time.sleep(0.5)
    return j


def main():
    os.makedirs(OUT, exist_ok=True)
    earth = search('search-earth.json', q='earth from space', media_type='image', page_size=24)
    search('search-earth-2.json', q='earth from space', media_type='image', page_size=24, page=2)
    nebula = search('search-nebula.json', q='nebula', media_type='image', page_size=24)
    search('search-apollo.json', q='apollo 11', media_type='image', page_size=12, year_start=1969, year_end=1969)
    video = search('search-video.json', q='mars rover', media_type='video', page_size=6)
    ids = [earth['collection']['items'][0]['data'][0]['nasa_id'], nebula['collection']['items'][0]['data'][0]['nasa_id']]
    ids += [it['data'][0]['nasa_id'] for it in video['collection']['items'][:2]]
    assets = {}
    for i in ids:
        assets[i] = get(f'{API}/asset/{urllib.parse.quote(i)}')
        time.sleep(0.5)
    save('assets.json', assets)
    print(f'saved in {os.path.normpath(OUT)}: 5 searches, {len(assets)} asset lists ({", ".join(ids)})')


if __name__ == '__main__':
    main()
