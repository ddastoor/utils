// Wallpapers (potentials #115): src/lib/wallpapers.ts in Node — the services' answers read (tests/fixtures/wallpapers, recorded by
// scripts/make-wallpaper-fixtures.py: Wikipedia's feed of 28 Nov 2026, the Met's and the Art Institute's searches and objects; Commons'
// search answer written in its API's format from that day's real Picture of the Day — Commons refused the recording machine), the
// addresses asked for, a picture's renditions, the crop for a screen, the credit in the JPEG (read back by Pillow where installed).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from '../lib/child.mjs';

export default async (t, { load, root }) => {
  const W = await load('/src/lib/wallpapers.ts');
  const fx = (f) => JSON.parse(readFileSync(join(root, 'tests/fixtures/wallpapers', f), 'utf8'));
  const P = (u) => new URL(u).searchParams;

  // ================================================================== text from the services
  t.eq(W.htmlText('<p>Four-segment panorama of <a href="https://en.wikipedia.org/wiki/Lower%20Manhattan">Lower Manhattan</a>,<br>New&nbsp;York &amp; more &#8212; &#x263A;</p><script>x()</script>'),
    'Four-segment panorama of Lower Manhattan, New York & more — ☺', 'HTML as plain text: tags out, entities read, scripts dropped');
  t.eq([W.htmlText(7), W.htmlText('a\u0000b')], ['', 'a b'], '… nothing that is no text; control characters out');
  t.eq(W.wikiLink('<a href="https://en.wikipedia.org/wiki/Lower%20Manhattan" title="w:Lower Manhattan">x</a> <a href="//en.wikipedia.org/wiki/New_York_City">y</a>'), 'Lower Manhattan', 'the first Wikipedia article linked: its story');
  t.eq([W.wikiLink('<a href="https://en.wikipedia.org/wiki/File:X.jpg">'), W.wikiLink('<a href="https://de.wikipedia.org/wiki/Berlin">'), W.wikiLink(null)], ['', '', ''], '… not a file, a page of another language, or nothing');
  t.eq(W.cleanUrl('https://upload.wikimedia.org/a.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&x=1'), 'https://upload.wikimedia.org/a.jpg?x=1', 'tracking (utm_…) out of an address');
  t.eq([W.cleanUrl('http://x/a.jpg'), W.cleanUrl('javascript:1'), W.cleanUrl(3)], ['', '', ''], '… only https: addresses kept');

  // ================================================================== Wikimedia Commons
  const orig = 'https://upload.wikimedia.org/wikipedia/commons/b/b6/Lower_Manhattan_from_Jersey_City_November_2014_panorama_3.jpg';
  t.eq(W.commonsThumb(orig, 960, 9250), 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Lower_Manhattan_from_Jersey_City_November_2014_panorama_3.jpg/960px-Lower_Manhattan_from_Jersey_City_November_2014_panorama_3.jpg',
    'a thumbnail on upload.wikimedia.org (the feed\'s thumb.wikimedia.org is not asked)');
  t.eq(W.commonsThumb(orig, 9600, 9250), orig, '… the original when the thumbnail would not be smaller');
  t.eq([W.commonsThumb('https://upload.wikimedia.org/wikipedia/commons/a/ab/Map.svg', 500), W.commonsThumb('https://upload.wikimedia.org/wikipedia/commons/a/ab/Scan.tif', 500)],
    ['https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Map.svg/500px-Map.svg.png', 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Scan.tif/lossy-page1-500px-Scan.tif.jpg'], '… of a drawing (PNG) and a TIFF (JPEG) as MediaWiki names them');
  t.eq(W.commonsThumb('https://example.org/a.jpg', 500), 'https://example.org/a.jpg', 'an address of elsewhere: as it is');
  t.eq([W.commonsSize(700, 9250), W.commonsSize(1921, 9250), W.commonsSize(4000, 9250), W.commonsSize(1200, 1280)], [960, 3840, 0, 0], 'the smallest standard size wide enough (0: the original)');
  const cs = P(W.commonsSearchUrl('mountain', 24, 12));
  t.eq([cs.get('origin'), cs.get('formatversion'), cs.get('gsrnamespace'), cs.get('gsroffset'), cs.get('gsrlimit')], ['*', '2', '6', '24', '12'], 'Commons\' search: anonymous CORS, files, a page from an offset');
  t.ok(cs.get('gsrsearch') === 'incategory:"Featured_pictures_on_Wikimedia_Commons" filetype:bitmap mountain' && /extmetadata/.test(cs.get('iiprop')), `… among its featured pictures, photographs and paintings only, with their metadata (${cs.get('gsrsearch')})`);
  const c = W.readCommonsSearch(fx('commons-search.json'));
  const p0 = c.pics[0];
  t.ok(c.pics.length >= 1 && p0.source === 'wikimedia' && p0.key.startsWith('wikimedia:File:'), `Commons' answer read (${c.pics.length} picture)`);
  t.eq([p0.artist, p0.licence.name, p0.width, p0.height], ['King of Hearts', 'CC BY-SA 3.0', 9250, 3700], 'its author, licence and size');
  t.eq(p0.credit, 'King of Hearts, CC BY-SA 3.0, via Wikimedia Commons', '… the credit CC BY-SA asks for');
  t.ok(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/.*\/500px-/.test(p0.thumb) && /\/1280px-/.test(p0.preview) && p0.original === orig, 'its renditions on upload.wikimedia.org, the original without tracking');
  t.eq([p0.wiki, /^Four-segment panorama of Lower Manhattan/.test(p0.about)], ['Lower Manhattan', true], 'its description as text, and the article it links to');
  const ordered = W.readCommonsSearch({ query: { pages: [{ title: 'File:B.jpg', index: 2, imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/b/bb/B.jpg', width: 10, height: 10, mime: 'image/jpeg' }] }, { title: 'File:A.jpg', index: 1, imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/A.jpg', width: 10, height: 10, mime: 'image/jpeg' }] }, { title: 'File:C.webm', index: 0, imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/c/cc/C.webm', mime: 'video/webm' }] }] }, continue: { gsroffset: 24 } });
  t.eq([ordered.pics.map((p) => p.title), ordered.next], [['A', 'B'], 24], 'in the search\'s order (the API gives pages by id), no video; the next page\'s offset');
  t.eq(W.readCommonsSearch(null), { pics: [], next: 0 }, 'no answer: no pictures');
  const pod = W.readFeedImage(fx('feed.json'));
  t.ok(pod && pod.title === 'Lower Manhattan from Jersey City November 2014 panorama 3' && pod.artist === 'King of Hearts' && pod.licence.name === 'CC BY-SA 3.0' && pod.page === 'https://commons.wikimedia.org/wiki/File:Lower_Manhattan_from_Jersey_City_November_2014_panorama_3.jpg',
    `the Picture of the Day of Wikipedia's feed (${pod?.title})`);
  t.eq(W.readFeedImage({}), null, 'a feed without a picture: none');
  t.eq(W.feedUrl(2026, 3, 7), 'https://en.wikipedia.org/api/rest_v1/feed/featured/2026/03/07', 'the feed of a date');

  // ================================================================== the Met
  const ms = P(W.metSearchUrl('', { highlight: true, limit: 6, offset: 50 }));
  t.ok(W.metSearchUrl('x').startsWith('https://collectionapi.metmuseum.org/public/collection/v1.1/search?') && ms.get('q') === '*' && ms.get('isHighlight') === 'true' && ms.get('medium') === 'Paintings' && ms.get('offset') === '50',
    'the Met\'s search (v1.1, paginated): paintings with pictures, its highlights; no words: everything');
  t.eq(W.readMetSearch(fx('met-search.json')).ids.length, 12, 'its answer: object ids and the total');
  const objs = fx('met-objects.json'), metPics = Object.values(objs).map(W.readMetObject);
  const pd = Object.values(objs).filter((o) => o.isPublicDomain && o.primaryImage).length;
  t.eq(metPics.filter(Boolean).length, pd, `only public-domain objects with a picture (${pd} of ${metPics.length} — its search does not keep to the public domain)`);
  const m0 = metPics.find(Boolean);
  t.ok(m0.licence.name === 'Public domain (CC0)' && /^https:\/\/images\.metmuseum\.org\//.test(m0.original) && /web-large/.test(m0.thumb) && m0.width === 0 && m0.page.startsWith('https://www.metmuseum.org/'),
    'a Met picture: public domain, its original and web-large renditions, its size known only once loaded');
  t.eq(W.readMetObject({ objectID: 1, isPublicDomain: false, primaryImage: 'https://images.metmuseum.org/x.jpg' }), null, 'not in the public domain: left out');

  // ================================================================== the Art Institute of Chicago
  const aq = JSON.parse(P(W.aicSearchUrl('water lilies', { page: 2, limit: 12 })).get('params'));
  const must = aq.query.bool.must;
  t.ok(must.some((m) => m.term?.is_public_domain === true) && must.some((m) => m.term?.['artwork_type_title.keyword'] === 'Painting') && must.some((m) => m.multi_match?.query === 'water lilies'),
    'the Art Institute\'s search: public-domain paintings with pictures, and the words');
  t.ok(JSON.parse(P(W.aicSearchUrl('', { boosted: true })).get('params')).query.bool.must.some((m) => m.term?.is_boosted), '… its highlights ("boosted")');
  const a = W.readAicSearch(fx('aic-search.json'));
  t.ok(a.pics.length === 12 && a.total > 0 && a.pics.every((p) => p.source === 'aic' && /^https:\/\/www\.artic\.edu\/iiif\/2\/[0-9a-f-]+\/full\/500,\/0\/default\.jpg$/.test(p.thumb)), `the Art Institute's answer: ${a.pics.length} paintings, IIIF renditions`);
  const a0 = a.pics[0];
  t.ok(a0.width > 1000 && a0.about && a0.aboutCredit === 'Text: Art Institute of Chicago, CC BY 4.0' && a0.page === `https://www.artic.edu/artworks/${a0.key.slice(4)}`, 'its size, its description with the credit its licence asks');
  t.eq(W.aicImage('abc', 99999, 8808, 8460), 'https://www.artic.edu/iiif/2/abc/full/8777,/0/default.jpg', 'a rendition held to the server\'s 74 megapixels');
  t.eq(W.aicImage('abc', 3000, 1200, 800), 'https://www.artic.edu/iiif/2/abc/full/1200,/0/default.jpg', '… and to the picture\'s own width');

  // ================================================================== what to show
  t.eq(W.interleave([[{ key: 'a' }, { key: 'b' }], [{ key: 'c' }], [{ key: 'd' }, { key: 'a' }, { key: 'e' }]]).map((p) => p.key), ['a', 'c', 'd', 'b', 'e'], 'the sources in turn, each picture once');
  t.ok(W.TOPICS.every((x) => x.wikimedia !== null || x.met !== null || x.aic !== null) && W.TOPICS.find((x) => x.id === 'space').met === null, 'every topic has a source; space only Commons');
  t.eq([W.dayNumber(new Date(2000, 0, 1)), W.dayNumber(new Date(2026, 10, 28, 23, 59))], [0, 9828], 'the day\'s number, by the reader\'s own date');
  t.eq(W.screenOf(390, 844, 3), { id: 'this', name: 'This screen, 1170 × 2532', w: 1170, h: 2532 }, 'this screen in its own pixels (an iPhone 13)');

  // ================================================================== the crop
  const f1 = W.frameAt(1600, 1000, 1170, 2532, 1, 800, 500);
  t.ok(Math.abs(f1.w / f1.h - 1170 / 2532) < 1e-9 && Math.abs(f1.h - 1000) < 1e-9 && Math.abs(f1.x - (800 - f1.w / 2)) < 1e-9, `a phone upright on a landscape: the full height, its shape, in the middle (${f1.w.toFixed(1)} × ${f1.h})`);
  const f2 = W.frameAt(1600, 1000, 3840, 2160, 1, 0, 0);
  t.ok(f2.w === 1600 && Math.abs(f2.h - 900) < 1e-9 && f2.x === 0 && f2.y === 0, 'a 4K monitor: the full width; asked at a corner, kept inside');
  const f3 = W.frameAt(1600, 1000, 1920, 1080, 0.5, 1590, 990);
  t.ok(Math.abs(f3.w - 800) < 1e-9 && f3.x + f3.w <= 1600 + 1e-9 && f3.y + f3.h <= 1000 + 1e-9, 'zoomed in twice: half the size, still inside');
  t.ok(W.frameAt(100, 100, 16, 9, 0.01, 50, 50).w >= 20, 'zoom held at 5 ×');
  const ff = W.frameOnFaces(1600, 1000, 1170, 2532, [{ x: 1200, y: 200, w: 100, h: 120 }]);
  t.ok(ff.x <= 1200 && ff.x + ff.w >= 1300 && Math.abs(ff.h - 1000) < 1e-9, `a face: the crop holds it (${ff.x.toFixed(0)} – ${(ff.x + ff.w).toFixed(0)})`);
  t.eq(W.neededWidth({ x: 0, y: 0, w: 640, h: 360 }, 1280, 1920), 3840, 'the rendition needed: a crop of half the picture for 1,920 px → 3,840 px wide');

  // ================================================================== the file
  const jfif = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
  const withC = W.jpegWithComment(jfif, 'Sunflowers — Vincent van Gogh ₹');
  const len = (withC[22] << 8) | withC[23];
  t.ok(withC[20] === 0xff && withC[21] === 0xfe && new TextDecoder().decode(withC.subarray(24, 22 + len)) === 'Sunflowers — Vincent van Gogh ₹' && withC.at(-1) === 0xd9 && withC.length === jfif.length + 4 + len - 2,
    'the credit as a comment segment after the JFIF header (UTF-8)');
  t.eq(W.jpegWithComment(Uint8Array.from([1, 2, 3]), 'x'), Uint8Array.from([1, 2, 3]), 'not a JPEG: as it is');
  const pyOk = spawnSync('python3', ['-c', 'import PIL'], { stdio: 'ignore' }).status === 0;
  if (pyOk) {
    // a real JPEG with the comment, read back by Pillow (its decoder and its comment)
    const real = readFileSync(join(root, 'tests/fixtures/wallpapers/busy.jpg'));
    const out = join(tmpdir(), `wp-${process.pid}.jpg`);
    writeFileSync(out, W.jpegWithComment(new Uint8Array(real), W.creditText(m0)));
    const r = spawnSync('python3', ['-c', 'import sys; from PIL import Image; im = Image.open(sys.argv[1]); im.load(); print(im.size, im.info.get("comment", b"").decode("utf-8"))', out], { encoding: 'utf8' });
    t.ok(r.status === 0 && r.stdout.startsWith('(1600, 1000)') && r.stdout.includes(m0.title) && r.stdout.includes('Public domain (CC0)'), `Pillow decodes it and reads its credit (${(r.stdout || r.stderr).trim().slice(0, 120)})`);
  } else t.ok(true, 'Pillow not installed: the comment checked by its bytes only');
  t.eq(W.fileName({ title: 'Wheat Field with Cypresses — Saint-Rémy!' }, 1920, 1080), 'Wheat-Field-with-Cypresses-Saint-Remy-1920x1080.jpg', 'a file name of the title and the size');
};
