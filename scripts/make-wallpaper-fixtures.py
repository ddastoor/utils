#!/usr/bin/env python3
"""Recorded answers of the Wallpapers tab's services: tests/fixtures/wallpapers/.

    python3 scripts/make-wallpaper-fixtures.py [--feed FILE]

- feed.json            Wikipedia's featured feed of 28 Nov 2026, cut to its Picture of the Day (`image`).
- commons-search.json  an answer of Commons' search among its featured pictures (MediaWiki's action API, formatversion=2), written
                       in that API's format from the real Picture of the Day of 28 Nov 2026 (its file, size, author, licence and
                       description, as the feed gives them): Commons' API — and, after one answer, the feed — refused this machine's
                       address (HTTP 429, Wikimedia's rate limit) when the fixtures were made, so their own answers could not be
                       recorded. --feed FILE: the feed's answer saved before (curl …/feed/featured/2026/11/28 -o FILE).
- met-search.json      the Met's search (v1.1) for landscape paintings in the public domain, and met-highlights.json for its
                       highlighted ones; met-objects.json the objects they name (cut to the fields the tab reads).
- aic-search.json      the Art Institute of Chicago's search for landscape paintings in the public domain; aic-boosted.json a page
                       of its highlighted ("boosted") public-domain paintings.
- busy.jpg             a test picture (made here, no network): a smooth gradient with a checkered block at a known place — where
                       the crop's "busiest part" must land.
- face.jpg             a test picture: the astronaut's portrait (tests/fixtures/images/astronaut.png) at the right of a wide plain
                       picture — a face far from the middle, which the crop must hold.
- tall.jpg             a test picture of a portrait painting's shape (600 × 1200) with a checkered block low down: the Art
                       Institute's El Greco (The Assumption of the Virgin) is shown as it.
--pictures: only the three test pictures.
The e2e harness answers every page's requests to these services from them (tests/lib/wallstub.mjs) — no suite reaches the real ones;
the pictures themselves are test pictures (busy.jpg, face.jpg, tall.jpg), not the services' files.
"""
import json, os, sys, time, urllib.parse, urllib.request

OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'wallpapers')
UA = {'User-Agent': 'SuperUtils-tests/1.0 (recording test fixtures)'}


def get(url):
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return json.load(r)
        except Exception as e:
            print(f'{url[:90]}: {e}', file=sys.stderr)
            time.sleep(2 * (i + 1))
    sys.exit(f'no answer: {url}')


def save(name, data):
    with open(os.path.join(OUT, name), 'w', encoding='utf8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')


def busy_picture():
    from PIL import Image
    w, h = 1600, 1000
    im = Image.new('RGB', (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = (60 + x * 120 // w, 110 + y * 90 // h, 200 - y * 60 // h)
    for y in range(300, 700):           # the busy block: x 1150 – 1450, y 300 – 700
        for x in range(1150, 1450):
            v = 30 if ((x // 12) + (y // 12)) % 2 else 235
            px[x, y] = (v, v, v)
    im.save(os.path.join(OUT, 'busy.jpg'), quality=88)


def face_picture():
    # the astronaut's portrait (tests/fixtures/images/astronaut.png, NASA — public domain) at the right of a wide, plain picture:
    # a face far from the middle, where a crop centred on the picture would cut it off
    from PIL import Image
    w, h = 1600, 600
    im = Image.new('RGB', (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = (90 + x * 40 // w, 100 + y * 30 // h, 130)
    face = Image.open(os.path.join(OUT, '..', 'images', 'astronaut.png')).convert('RGB').resize((600, 600), Image.LANCZOS)
    im.paste(face, (1000, 0))
    im.save(os.path.join(OUT, 'face.jpg'), quality=88)


def tall_picture():
    # a tall picture (a portrait painting's shape): a gradient with a checkered block low down — the crop of a monitor must find it
    from PIL import Image
    w, h = 600, 1200
    im = Image.new('RGB', (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = (150 - y * 60 // h, 90 + x * 50 // w, 70 + y * 80 // h)
    for y in range(800, 1000):          # the block: x 150 – 450, y 800 – 1000
        for x in range(150, 450):
            v = 25 if ((x // 10) + (y // 10)) % 2 else 240
            px[x, y] = (v, v, v)
    im.save(os.path.join(OUT, 'tall.jpg'), quality=88)


def main():
    os.makedirs(OUT, exist_ok=True)
    busy_picture()
    face_picture()
    tall_picture()
    if '--pictures' in sys.argv:
        return
    # ---- Wikipedia's feed: the Picture of the Day (one answer — Wikimedia limits how often it is asked)
    j = json.load(open(sys.argv[sys.argv.index('--feed') + 1], encoding='utf8')) if '--feed' in sys.argv else get('https://en.wikipedia.org/api/rest_v1/feed/featured/2026/11/28')
    feeds = [j['image']]
    save('feed.json', {'image': feeds[0]})
    pages = []
    for i, im in enumerate(feeds):
        src = im['image']['source'].split('?')[0]
        pages.append({'pageid': 1000 + i, 'ns': 6, 'title': im['title'], 'index': i + 1, 'imagerepository': 'local', 'imageinfo': [{
            'url': src, 'descriptionurl': im.get('file_page', ''), 'width': im['image']['width'], 'height': im['image']['height'],
            'mime': 'image/png' if src.lower().endswith('.png') else 'image/tiff' if src.lower().endswith(('.tif', '.tiff')) else 'image/jpeg',
            'extmetadata': {
                'ImageDescription': {'value': (im.get('description') or {}).get('html', ''), 'source': 'commons-desc-page'},
                'Artist': {'value': (im.get('artist') or {}).get('html', ''), 'source': 'commons-desc-page'},
                'LicenseShortName': {'value': (im.get('license') or {}).get('type', ''), 'source': 'commons-desc-page'},
                'LicenseUrl': {'value': (im.get('license') or {}).get('url', ''), 'source': 'commons-desc-page'},
                'AttributionRequired': {'value': 'true', 'source': 'commons-desc-page'},
            }}]})
    pages.reverse()  # the API gives pages by id, not by rank: the tab sorts them by `index`
    save('commons-search.json', {'batchcomplete': True, 'continue': {'gsroffset': len(pages), 'continue': 'gsroffset||'}, 'query': {'pages': pages}})
    # ---- the Met
    keep = ['objectID', 'isHighlight', 'isPublicDomain', 'primaryImage', 'primaryImageSmall', 'department', 'objectName', 'title', 'culture',
            'artistDisplayName', 'artistDisplayBio', 'objectDate', 'medium', 'creditLine', 'objectURL', 'classification']
    base = 'https://collectionapi.metmuseum.org/public/collection'
    s1 = get(f'{base}/v1.1/search?q=landscape&hasImages=true&isPublicDomain=true&medium=Paintings&limit=12')
    s2 = get(f'{base}/v1.1/search?q=*&hasImages=true&isPublicDomain=true&isHighlight=true&medium=Paintings&limit=6')
    save('met-search.json', s1)
    save('met-highlights.json', s2)
    objects = {}
    for oid in s1['objectIDs'] + s2['objectIDs']:
        o = get(f'{base}/v1/objects/{oid}')
        objects[str(oid)] = {k: o.get(k) for k in keep}
        time.sleep(0.2)
    save('met-objects.json', objects)
    # ---- the Art Institute of Chicago
    fields = 'id,title,image_id,artist_title,artist_display,date_display,thumbnail,short_description,is_public_domain,artwork_type_title'
    must = [{'term': {'is_public_domain': True}}, {'exists': {'field': 'image_id'}}, {'term': {'artwork_type_title.keyword': 'Painting'}}]
    q1 = {'query': {'bool': {'must': must + [{'multi_match': {'query': 'landscape', 'fields': ['title^2', 'artist_title', 'term_titles', 'subject_titles', 'style_titles', 'classification_titles', 'description']}}]}}}
    q2 = {'query': {'bool': {'must': must + [{'term': {'is_boosted': True}}]}}}
    for name, q, lim in [('aic-search.json', q1, 12), ('aic-boosted.json', q2, 6)]:
        j = get('https://api.artic.edu/api/v1/artworks/search?' + urllib.parse.urlencode({'params': json.dumps(q), 'fields': fields, 'limit': lim, 'page': 1}))
        for d in j.get('data', []):
            if d.get('thumbnail'):
                d['thumbnail'].pop('lqip', None)  # a picture in the answer: not needed
        save(name, {'pagination': j['pagination'], 'data': j['data']})
    print(f'{len(feeds)} Pictures of the Day; Met {len(objects)} objects; AIC answers saved in {os.path.normpath(OUT)}')


if __name__ == '__main__':
    main()
