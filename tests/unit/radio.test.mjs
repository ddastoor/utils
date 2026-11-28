// World Radio (potentials #116): src/lib/radio.ts in Node — a station read from the directory's answers (tests/fixtures/radio/, recorded
// by scripts/make-radio-fixtures.py: India's most listened, All India Radio's, the quick picks' genres, the world's most listened), the
// searches as paths, the directory's servers one after another (one down, one in trouble, one that refuses, a time-out), the quick picks
// (All India Radio's names checked again), the countries with India first, why a station does not play, the small things a row shows.
// The answers to the searches are the harness's stand-in directory (tests/lib/radiostub.mjs), which filters the recorded stations as the
// directory does — so the picks are tested on real stations.
import { radioAnswer, radioFixtures } from '../lib/radiostub.mjs';

export default async (t, { load }) => {
  const R = await load('/src/lib/radio.ts');
  const fx = radioFixtures();
  const U = (c) => `${c.repeat(8)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(12)}`;
  const raw = (o = {}) => ({ stationuuid: U('a'), name: 'Radio One', url: 'http://x.example/live', url_resolved: 'https://x.example/live', homepage: 'https://x.example/', tags: 'Pop,news, pop ,', country: 'India', countrycode: 'IN', state: 'Delhi', language: 'hindi,english', codec: 'mp3', bitrate: 128, hls: 0, lastcheckok: 1, lastchecktime_iso8601: '2026-11-27T10:00:00Z', clickcount: 120, votes: 9, ...o });

  // ================================================================== a station
  const s = R.stationOf(raw());
  t.eq(s, { id: U('a'), name: 'Radio One', url: 'https://x.example/live', homepage: 'https://x.example/', country: 'India', cc: 'IN', state: 'Delhi', lang: 'hindi,english',
    tags: ['pop', 'news'], codec: 'MP3', bitrate: 128, hls: false, ok: true, checked: '2026-11-27T10:00:00Z', clicks: 120, votes: 9 },
    'a station: its id, name, the address the directory resolved, tags once each in lower case, the codec in capitals');
  t.eq([R.stationOf(raw({ stationuuid: 'x' })), R.stationOf(raw({ name: ' \u0000 ' })), R.stationOf(raw({ url: '', url_resolved: '' })), R.stationOf(null), R.stationOf(7)], [null, null, null, null, null],
    'no station without its id, a name or an address');
  t.eq(R.stationOf(raw({ url_resolved: '' })).url, 'http://x.example/live', 'the address as listed when the directory resolved none');
  t.eq(R.stationOf(raw({ stationuuid: U('A') })).id, U('a'), 'the id in lower case (the Settings keep it so)');
  const odd = R.stationOf(raw({ name: 'Tab\tand\nnew  line', countrycode: 'in', homepage: 'javascript:alert(1)', codec: '', bitrate: -1, clickcount: 'many', lastcheckok: 0, hls: 1 }));
  t.eq([odd.name, odd.cc, odd.homepage, odd.codec, odd.bitrate, odd.clicks, odd.ok, odd.hls], ['Tab and new line', '', '', 'UNKNOWN', 0, 0, false, true],
    'control characters out of a name; no country code but two capitals; a website only of the web; numbers that are none 0; the last check failed; HLS');
  t.eq(R.stationOf(raw({ hls: 0, url_resolved: 'https://x.example/master.m3u8?token=1' })).hls, true, 'an .m3u8 address is HLS whatever the directory says');
  t.eq(R.stationOf(raw({ tags: Array.from({ length: 30 }, (_, i) => `tag${i}`).join(',') })).tags.length, 12, 'at most 12 tags');
  const many = R.stationsOf([raw(), raw(), raw({ stationuuid: U('b'), url_resolved: 'http://x.example/live/' }), raw({ stationuuid: U('c'), url_resolved: 'https://y.example/' }), 'junk', null]);
  t.eq(many.map((x) => x.id), [U('a'), U('c')], 'the same station once, and the same stream listed twice once (http / https, a slash at the end)');
  t.eq(R.stationsOf({ error: 1 }), [], 'an answer that is no list: no stations');
  const all = R.stationsOf(fx.stations);
  t.ok(all.length >= 290 && all.every((x) => /^https?:\/\//.test(x.url) && x.name && x.id), `the ${all.length} recorded stations read, each with an address and a name`);

  // ================================================================== the searches
  const sp = (q) => Object.fromEntries(new URL(`https://h${R.searchPath(q)}`).searchParams);
  t.eq(sp({}), { order: 'clickcount', reverse: 'true', hidebroken: 'true', limit: '60' }, 'by default: the most listened first, broken stations left out, a page of 60');
  t.eq(sp({ name: '  Radio\u0000 City ', cc: 'IN', lang: 'Tamil', tag: 'News', order: 'votes', offset: 120, limit: 9999 }),
    { name: 'Radio City', countrycode: 'IN', language: 'tamil', languageExact: 'true', tag: 'news', tagExact: 'true', order: 'votes', reverse: 'true', hidebroken: 'true', limit: '500', offset: '120' },
    'a name cleaned, a language and a tag exact and in lower case, the most liked first, at most 500 a page');
  t.eq([sp({ order: 'name' }).reverse, sp({ order: 'random' }).reverse, sp({ cc: 'india' }).countrycode], [undefined, undefined, undefined], 'A → Z and "surprise me" are not reversed; a country code is two capitals or none');

  // ================================================================== the directory's servers
  const answering = (plan, log) => async (url, init) => {
    const host = new URL(url).host; log.push(host);
    const p = plan[host] ?? 'ok';
    if (p === 'down') throw new TypeError('Failed to fetch');
    if (p === 'hang') return new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError'))));
    if (typeof p === 'number') return { ok: p < 400, status: p, json: async () => ({}) };
    if (p === 'html') return { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } };
    return { ok: true, status: 200, json: async () => radioAnswer(url) };
  };
  const [A, D1, D2] = R.SERVERS;
  t.eq(R.SERVERS, ['all.api.radio-browser.info', 'de1.api.radio-browser.info', 'de2.api.radio-browser.info'], 'the three servers the CSP lists');
  let log = [];
  const r1 = await R.directory('/json/stations/search?countrycode=IN&limit=3', { fetch: answering({ [A]: 'down' }, log) });
  t.eq([log, Array.isArray(r1) && r1.length], [[A, D1], 3], 'a server that cannot be reached: the next one answers');
  log = [];
  await R.directory('/json/countries', { fetch: answering({}, log) });
  t.eq(log, [D1], '… and is asked first the next time (the one that answered last)');
  log = [];
  await R.directory('/json/countries', { fetch: answering({ [D1]: 503, [D2]: 'html' }, log) });
  t.eq(log, [D1, D2, A], 'a server in trouble (5xx) and one that sends no JSON: the next');
  log = [];
  let e1 = null;
  try { await R.directory('/json/countries', { fetch: answering({ [A]: 404 }, log) }); } catch (e) { e1 = e; }
  t.ok(e1 instanceof R.DirectoryError && !e1.retry && /HTTP 404/.test(e1.message) && log.length === 1, `a refusal (4xx) is said, not asked of the others (${e1?.message})`);
  log = [];
  let e2 = null;
  try { await R.directory('/x', { fetch: answering({ [A]: 'down', [D1]: 'down', [D2]: 'hang' }, log), timeout: 50 }); } catch (e) { e2 = e; }
  t.ok(e2 instanceof R.DirectoryError && e2.retry && /could not be reached/.test(e2.message) && log.length === 3, `none answers (one of them never): said in words, to try again (${e2?.message})`);
  const ac = new AbortController();
  const pending = R.directory('/x', { fetch: answering({ [A]: 'hang', [D1]: 'hang', [D2]: 'hang' }, []), signal: ac.signal, timeout: 5000 });
  ac.abort();
  let e3 = null;
  try { await pending; } catch (e) { e3 = e; }
  t.eq(e3?.name, 'AbortError', 'a newer search ends the one before at once (no other server asked)');

  // ================================================================== the quick picks, on the recorded stations
  const f = answering({}, []);
  const india = await R.pickStations(R.PICKS.find((p) => p.id === 'india'), 0, { fetch: f });
  const inRec = fx.stations.filter((x) => x.countrycode === 'IN').sort((a, b) => b.clickcount - a.clickcount);
  const page1 = radioAnswer(`https://h${R.searchPath({ cc: 'IN' })}`);
  t.ok(page1.length === 60 && india.stations.length === R.stationsOf(page1).length && india.more && india.stations.every((x) => x.cc === 'IN'),
    `India's most listened: a page of 60 (${india.stations.length} once the same streams listed twice are kept once), all of India, more to come`);
  t.eq(india.stations[0].id, inRec[0].stationuuid, `… the most listened first (${india.stations[0].name})`);
  t.ok(india.stations.every((x, i, a) => !i || a[i - 1].clicks >= x.clicks), '… in the order of its listeners');
  const page2 = await R.pickStations(R.PICKS.find((p) => p.id === 'india'), 60, { fetch: f });
  t.ok(page2.stations.length > 0 && !page2.stations.some((x) => india.stations.some((y) => y.id === x.id)), 'the next page: other stations');
  const AIRX = R.PICKS.find((p) => p.id === 'air').match;
  const air = await R.pickStations(R.PICKS.find((p) => p.id === 'air'), 0, { fetch: f });
  const airRec = fx.stations.filter((x) => x.countrycode === 'IN' && x.lastcheckok === 1 && AIRX.test(x.name));
  t.ok(air.stations.length >= 40 && air.stations.every((x) => AIRX.test(x.name)) && !air.more, `All India Radio: ${air.stations.length} of its streams — every name All India Radio's (Akashvani, Vividh Bharati, AIR …), in one list`);
  t.eq(air.stations.length, new Set(airRec.map((x) => x.url_resolved.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase())).size, '… all of them found, each once');
  t.ok(air.stations.every((x, i, a) => !i || a[i - 1].clicks >= x.clicks), '… merged from its searches, the most listened first');
  t.eq(['Air Vividh Bharti', 'AIR Kolhapur', 'Aakashvani Kochi', 'All India Radio News', 'Fair FM', 'Hindi On Air', 'Air FM Rainbow'].map((n) => AIRX.test(n)), [true, true, true, true, false, false, true],
    'the names checked again: "AIR " is no part of "Fair", nor "On Air" its name');
  const news = await R.pickStations(R.PICKS.find((p) => p.id === 'in-news'), 0, { fetch: f });
  t.ok(news.stations.length > 0 && news.stations.every((x) => x.cc === 'IN' && x.tags.some((g) => g === 'news' || g === 'news talk')), `Indian news: ${news.stations.length} stations, each tagged news`);
  const dev = await R.pickStations(R.PICKS.find((p) => p.id === 'in-devotional'), 0, { fetch: f });
  t.ok(dev.stations.length > 0 && dev.stations.every((x) => x.tags.some((g) => ['devotional', 'spiritual', 'bhakti', 'mantra', 'religious'].includes(g))), `devotional: ${dev.stations.length} stations`);
  const world = await R.pickStations(R.PICKS.find((p) => p.id === 'world'), 0, { fetch: f });
  t.ok(world.stations.length >= 55 && world.more && new Set(world.stations.map((x) => x.cc)).size > 5, `the world's most listened: stations of ${new Set(world.stations.map((x) => x.cc)).size} countries`);
  const tamil = await R.searchAll([{ lang: 'tamil' }], { fetch: f });
  t.ok(tamil.stations.length > 0 && tamil.stations.every((x) => x.lang.toLowerCase().split(',').includes('tamil')), `a language: only its stations (${tamil.stations.length} in Tamil)`);
  const byId = await R.stationsById([...fx.stations.slice(0, 120).map((x) => x.stationuuid), 'not-an-id'], { fetch: f });
  t.eq(byId.length, 120, 'the directory\'s entries of 120 stations by their ids (asked 50 at a time); a word that is no id not asked');

  // ================================================================== countries, languages, genres
  const cs = R.countriesOf(fx.countries, (cc) => ({ US: 'United States', IN: 'India' })[cc]);
  t.eq([cs[0].cc, cs[0].name, cs[1].cc, cs[1].name], ['IN', 'India', 'US', 'United States'], 'the countries: India first (the owner lives there), then by their stations; English names from the browser where it has them');
  t.ok(cs.every((c, i) => i < 2 || cs[i - 1].stations >= c.stations) && cs.every((c) => /^[A-Z]{2}$/.test(c.cc)), '… the others by their number of stations');
  t.eq(R.countriesOf([{ iso_3166_1: 'gb', name: 'UK', stationcount: 2 }, { iso_3166_1: 'GB', name: 'UK', stationcount: 3 }, { iso_3166_1: '', stationcount: 9 }, 5]),
    [{ cc: 'GB', name: 'UK', stations: 5 }], 'a country listed twice: once, its stations added up; no code: left out');
  const langs = R.namedOf(fx.languages, 5);
  t.ok(langs.some((l) => l.value === 'hindi' && l.name === 'Hindi') && langs.every((l) => l.stations >= 5), 'languages in capitals as they are shown, each with at least 5 stations');
  t.eq(R.namedOf([{ name: 'news talk', stationcount: 3 }, { name: 'NEWS TALK', stationcount: 3 }, { name: '80s', stationcount: 3 }, { name: '1', stationcount: 9 }, { name: 'hip-hop', stationcount: 2 }]),
    [{ value: 'news talk', name: 'News Talk', stations: 3 }, { value: '80s', name: '80s', stations: 3 }, { value: 'hip-hop', name: 'Hip-Hop', stations: 2 }],
    'a name once without regard to case, no name without a letter, capitals after spaces and hyphens');

  // ================================================================== playing
  t.eq([R.codecMime('MP3', false), R.codecMime('AAC+', false), R.codecMime('OGG', false), R.codecMime('UNKNOWN', false), R.codecMime('MP3', true)],
    ['audio/mpeg', 'audio/aac', 'audio/ogg; codecs="vorbis"', '', 'application/vnd.apple.mpegurl'], 'what the browser is asked it can play (an unknown codec: tried)');
  t.eq(R.streamUrl('http://x.example/live'), { src: 'https://x.example/live', upgraded: true }, 'a plain-HTTP stream is asked for over HTTPS (a secure page plays no other)');
  t.eq(R.streamUrl('https://x.example/live'), { src: 'https://x.example/live', upgraded: false }, '… an HTTPS one as it is');
  t.eq(['https://x/y', 'http://x', 'rtsp://x/y', 'mms://x', 'javascript:1'].map(R.isWebStream), [true, true, false, false, false], 'a web stream, or not');
  t.ok(/plain HTTP/.test(R.REASON.http) && /AAC\+/.test(R.REASON.format('AAC+')) && /its format/.test(R.REASON.format('UNKNOWN')) && /2026-11-20/.test(R.REASON.broken('2026-11-20T08:00:00Z')),
    'every reason in words: plain HTTP only, a format the browser lacks, off the air at the directory\'s check');

  // ================================================================== what a row shows
  t.eq(['Radio Mirchi', '  ¡Hola Radio!', 'ആകാശവാണി', '93.5 Red FM', '🎵 Lofi', 'élan'].map(R.letterOf), ['R', 'H', 'ആ', '9', 'L', 'É'], 'a station\'s letter: its first letter or digit');
  t.eq([R.flagOf('IN'), R.flagOf('in'), R.flagOf('')], ['🇮🇳', '', ''], 'a country\'s flag');
  t.eq([R.formatOf({ codec: 'MP3', bitrate: 128, hls: false }), R.formatOf({ codec: 'AAC', bitrate: 0, hls: true }), R.formatOf({ codec: 'UNKNOWN', bitrate: 0, hls: false })], ['MP3 · 128 kbps', 'HLS · AAC', ''], 'its format');
  t.ok(R.hueOf('Radio Mirchi') === R.hueOf('Radio Mirchi') && R.hueOf('Radio Mirchi') !== R.hueOf('Radio City') && R.hueOf('x') >= 0 && R.hueOf('x') < 360, 'a hue for its circle, the same for the same name');
};
