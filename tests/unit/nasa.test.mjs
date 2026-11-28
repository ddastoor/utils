// NASA Image Explorer (potentials #114): src/lib/nasa.ts in Node on NASA's own answers (tests/fixtures/nasa, recorded by
// scripts/make-nasa-fixtures.py): the search's address, its items read (renditions, the original, credits, captions), an item's files,
// SRT made WebVTT, the addresses at NASA's file server and at its bucket, the credit's parties who are not NASA, an item as a wallpaper.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, root }) => {
  const N = await load('/src/lib/nasa.ts');
  const W = await load('/src/lib/wallpapers.ts');
  const fx = (f) => JSON.parse(readFileSync(join(root, 'tests/fixtures/nasa', f), 'utf8'));
  const P = (u) => new URL(u).searchParams;

  // ================================================================== the search's address
  const s1 = P(N.searchUrl({ q: ' apollo 11 ', from: 1969, to: 1969, page: 2, size: 12 }));
  t.eq([s1.get('q'), s1.get('media_type'), s1.get('year_start'), s1.get('year_end'), s1.get('page'), s1.get('page_size')], ['apollo 11', 'image', '1969', '1969', '2', '12'], 'the search: words, years, a page of 12');
  t.eq([P(N.searchUrl({ q: 'x', kind: 'video' })).get('media_type'), P(N.searchUrl({ q: 'x', kind: 'both' })).get('media_type'), P(N.searchUrl({ q: 'x', center: 'JPL' })).get('center'), P(N.searchUrl({ q: 'x' })).get('page')], ['video', 'image,video', 'JPL', null], '… videos, both, a centre; page 1 not written');
  t.ok(N.searchUrl({ q: '' }).startsWith('https://images-api.nasa.gov/search?media_type=image'), 'no words: no q');
  t.eq([N.yearOf(''), N.yearOf('1969'), N.yearOf(' 2024 ', 2026), N.yearOf('1919'), N.yearOf('2031', 2026), N.yearOf('69'), N.yearOf('19x9')], [0, 1969, 2024, NaN, NaN, NaN, NaN], 'a year box: empty, a year of the library, or not one');

  // ================================================================== the answers read
  const e = N.readSearch(fx('search-earth.json'));
  t.ok(e.items.length === 24 && e.total === 19493 && e.next, `"earth from space": ${e.items.length} items of ${e.total}, a next page`);
  t.ok(e.items.every((x) => x.kind === 'image' && x.thumb.startsWith('https://images-assets.nasa.gov/image/') && x.original.startsWith('https://images-assets.nasa.gov/image/')), 'every item a picture with a thumbnail and an original at NASA\'s file server (https)');
  const neb = N.readSearch(fx('search-nebula.json'));
  const pia = neb.items.find((x) => x.id === 'PIA14417');
  t.ok(pia && pia.title === 'Weighing in on the Dumbbell Nebula' && pia.center === 'JPL' && pia.centerName === 'Jet Propulsion Laboratory' && pia.year === 2011 && pia.date === '2011-08-10T21:00:09Z', `an item: title, centre and its name, date (${pia?.title})`);
  t.eq(pia.renditions.map((r) => r.width), [640, 640, 1280, 2800], 'its renditions by width, the original (2,800 px) last');
  t.ok(pia.preview.endsWith('PIA14417~medium.jpg') && pia.thumb.endsWith('PIA14417~thumb.jpg') && pia.original.endsWith('PIA14417~orig.jpg'), 'the view (1,280 px), the grid\'s thumbnail, the original');
  t.eq([pia.credit, pia.others], ['NASA/JPL-Caltech/Harvard-Smithsonian CfA', ['Harvard-Smithsonian CfA']], 'its credit, and who in it is not NASA');
  t.eq(pia.page, 'https://images.nasa.gov/details/PIA14417', 'its page at NASA');
  const apollo = N.readSearch(fx('search-apollo.json'));
  t.ok(apollo.items.length === 12 && apollo.items.every((x) => x.year === 1969), 'Apollo 11 in 1969: every item of 1969');
  const vid = N.readSearch(fx('search-video.json'));
  t.ok(vid.items.length === 6 && vid.items.every((x) => x.kind === 'video' && x.thumb && !x.original.endsWith('.mp4')), 'videos: their thumbnails (their MP4s are in their file lists)');
  t.ok(vid.items.filter((x) => x.captions).length >= 3 && vid.items.every((x) => !x.captions || /\.(srt|vtt)$/i.test(decodeURIComponent(x.captions))), 'captions where NASA has them (SRT or WebVTT)');
  t.ok(vid.items.some((x) => /’/.test(x.id)) && vid.items.every((x) => !/[ ’]/.test(x.thumb)), 'an id with spaces and a curly apostrophe: its addresses escaped');

  // ================================================================== addresses
  t.eq(N.fileUrl('http://images-assets.nasa.gov/video/A B’s/A B’s~medium.mp4'), 'https://images-assets.nasa.gov/video/A%20B%E2%80%99s/A%20B%E2%80%99s~medium.mp4', 'a file at NASA: https, escaped once');
  t.eq(N.fileUrl('https://images-assets.nasa.gov/image/A%20B/A%20B~thumb.jpg'), 'https://images-assets.nasa.gov/image/A%20B/A%20B~thumb.jpg', '… not escaped twice');
  t.eq([N.fileUrl('https://evil.example/image/x.jpg'), N.fileUrl(null)], ['', ''], 'no other host');
  t.eq(N.bucketUrl('https://images-assets.nasa.gov/image/PIA14417/PIA14417~thumb.jpg'), 'https://s3.amazonaws.com/images-assets.nasa.gov/image/PIA14417/PIA14417~thumb.jpg', 'the same file at the bucket\'s own address (it answers CORS)');
  t.eq(N.bucketUrl('https://example.org/x'), '', '… only NASA\'s files');
  t.eq(N.assetUrl('NHQ_2021 Landing’s'), 'https://images-api.nasa.gov/asset/NHQ_2021%20Landing%E2%80%99s', 'an item\'s file list');

  // ================================================================== an item's files
  const assets = fx('assets.json');
  const vid0 = vid.items.find((x) => assets[x.id]);
  const a = N.readAssets(assets[vid0.id]);
  t.ok(a.play.endsWith('~medium.mp4') && a.original.endsWith('~orig.mp4') && /\.(srt|vtt)$/.test(a.captions) && a.files.every((f) => f.startsWith('https://images-assets.nasa.gov/video/')), `a video's files: the medium MP4 to play, the original, its captions (${a.files.length} files)`);
  const ai = N.readAssets(assets.PIA14417);
  t.ok(ai.play === '' && ai.files.some((f) => f.endsWith('~orig.jpg')), 'a picture\'s files: nothing to play');
  t.eq(N.readAssets(null), { files: [], play: '', original: '', captions: '' }, 'no answer: no files');

  // ================================================================== captions and credits
  const srt = readFileSync(join(root, 'tests/fixtures/media/subs.srt'), 'utf8');
  const vtt = N.toVtt(srt);
  t.ok(vtt.startsWith('WEBVTT\n\n') && /\d\d:\d\d:\d\d\.\d{3} --> \d\d:\d\d:\d\d\.\d{3}/.test(vtt) && !/,\d{3}/.test(vtt.split('\n').find((l) => /-->/.test(l))), `SRT made WebVTT (${vtt.split('\n')[2]})`);
  t.eq(N.toVtt('1\r\n00:00:01,5 --> 00:00:02,25\r\nHello\r\n\r\n2\r\n00:01:02,000 --> 00:01:03,000\r\nWorld\r\n'), 'WEBVTT\n\n00:00:01.500 --> 00:00:02.250\nHello\n\n00:01:02.000 --> 00:01:03.000\nWorld\n', '… CR LF, short fractions');
  t.eq(N.toVtt('WEBVTT\n\n00:01.000 --> 00:02.000\nHi'), 'WEBVTT\n\n00:01.000 --> 00:02.000\nHi\n', 'WebVTT: as it is');
  t.eq(N.othersIn('NASA, ESA & Mohammad Heydari-Malayeri Observatoire de Paris, France'), ['ESA', 'Mohammad Heydari-Malayeri Observatoire de Paris', 'France'], 'the parties not NASA (ESA …)');
  t.eq([N.othersIn('NASA/JPL-Caltech'), N.othersIn('NASA'), N.othersIn('NASA and the Hubble Heritage Team'), N.othersIn('')], [[], [], [], []], 'NASA\'s own credits: none');
  t.eq(N.creditInText('Landing on Mars. Credit: NASA/JPL-Caltech'), 'NASA/JPL-Caltech', '"Credit: …" in a description');
  t.eq(N.plain('<p>One<br>two &amp; <a href="x">three</a></p>&#8212;'), 'One\ntwo & three\n—', 'a description as plain text');

  // ================================================================== as a wallpaper
  const pic = N.picOf(pia);
  t.ok(pic.source === 'nasa' && pic.width === 2800 && pic.height === 1400 && pic.renditions.length === 4 && /also credited: Harvard-Smithsonian CfA/.test(pic.licence.name) && pic.licence.url === N.GUIDELINES, `an item as a wallpaper's picture (${pic.licence.name})`);
  t.eq(W.renditionFor(pic, 1000), pia.preview, 'a rendition wide enough: 1,280 px for 1,000');
  t.eq(W.renditionFor(pic, 2000), pia.original, '… the original past it');
  t.eq(W.renditionFor(pic, 9000), pia.original, '… the original when none is enough');
  const own = N.picOf({ ...pia, credit: '', others: [], photographer: 'Alex Gerst' });
  t.ok(own.licence.name === 'NASA — not copyrighted in the US' && own.credit === 'NASA / Alex Gerst, NASA Image and Video Library' && own.artist === 'Alex Gerst', `NASA's own (a photographer named): ${own.credit}`);
};
