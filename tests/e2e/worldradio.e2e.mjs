// World Radio (potentials #116): the tab in Chromium on a stand-in directory (tests/lib/radiostub.mjs — the recorded stations, and
// stations of the suite's own whose streams it serves: an MP3, an HLS stream, a stream that ends) and stand-in station servers: one that
// streams only over plain HTTP, one that cannot be reached, one that refuses, a format the browser cannot play, an rtsp: address. India's
// most listened as the tab opens; a station played (the one <audio> of the site, outside the tab), paused (the stream let go) and played
// again live; Next past stations that do not play — each skipped, said and marked with its reason; five in a row and it stops trying; a
// stream that breaks off is connected again once; the quick picks (All India Radio's names), the search by name, country, language,
// genre and order; favourites kept in the Settings (World Radio section) both ways, their addresses brought up to date; "Keep playing
// in other apps" — the small player on other pages, its Pause / Play / Stop and the way back; off, leaving stops the sound; the lock
// screen's metadata (Media Session); the volume and the sleep timer; the directory down and back; the phone; axe-core in both themes.
import { readFileSync } from 'node:fs';
import { RADIO_HOSTS, radioRoute, radioFixtures, radioAnswer } from '../lib/radiostub.mjs';

const FX = new URL('../fixtures/radio/', import.meta.url);
const TONE = readFileSync(new URL('tone.mp3', FX)), SHORT = readFileSync(new URL('short.mp3', FX));
const HLS = (f) => readFileSync(new URL(`hls/${f}`, FX));
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const st = (n, name, url, o = {}) => ({ stationuuid: id(n), name, url, url_resolved: url, homepage: 'https://radio.example/', tags: 'music,hindi', country: 'India', countrycode: 'IN', state: '', language: 'hindi', codec: 'MP3', bitrate: 128, hls: 0, lastcheckok: 1, lastchecktime_iso8601: '2026-11-27T10:00:00Z', clickcount: 90_000_000 - n, votes: 10, ...o });
// India's most listened, in this order (their clicks above every recorded station's)
const OURS = [
  st(1, 'Test Tone FM', 'https://ok.stream.test/tone.mp3', { tags: 'music,bollywood', homepage: 'https://tone.example/' }),
  st(2, 'Plain HTTP Radio', 'http://plain.stream.test/live'),
  st(3, 'Dead Air FM', 'https://down.stream.test/live'),
  st(4, 'WMA Classic', 'https://wma.stream.test/live', { codec: 'WMA' }),
  st(5, 'HLS Wave', 'https://ok.stream.test/hls/index.m3u8', { codec: 'AAC', hls: 1, language: 'tamil', tags: 'news' }),
  st(6, 'Refusing Radio', 'https://refuse.stream.test/live'),
  st(7, 'RTSP Radio', 'rtsp://rtsp.stream.test/live'),
  st(8, 'Second Tone FM', 'https://ok.stream.test/tone2.mp3', { language: 'tamil' }),
  st(9, 'World Tone', 'https://ok.stream.test/tone3.mp3', { country: 'United Kingdom', countrycode: 'GB', language: 'english', clickcount: 95_000_000 }),
  ...Array.from({ length: 6 }, (_, i) => st(20 + i, `Broken Station ${i + 1}`, `http://plain.stream.test/broken${i}`, { clickcount: 10 + i, countrycode: 'NP', country: 'Nepal' })),
  st(30, 'Short Wave', 'https://ok.stream.test/short.mp3', { clickcount: 5, countrycode: 'LK', country: 'Sri Lanka' }),
];

export default async ({ base, page: newPage, ok, devices, info }) => {
  const stations = [...OURS, ...radioFixtures().stations];
  const asked = [], streams = [];
  /** a page with the stand-in directory and station servers (`moved`: a station's address now, as the directory has it) */
  async function page(opts = {}, moved = null) {
    const p = await newPage(opts);
    await p.route(RADIO_HOSTS, radioRoute(moved ? stations.map((s) => moved[s.stationuuid] ? { ...s, url: moved[s.stationuuid], url_resolved: moved[s.stationuuid] } : s) : stations, asked));
    await p.route(/^https:\/\/[a-z0-9-]+\.stream\.test\//, (r) => {
      const u = new URL(r.request().url()); streams.push(u.href);
      if (u.host === 'ok.stream.test') {
        if (u.pathname.startsWith('/hls/')) { const f = u.pathname.slice(5); return r.fulfill({ status: 200, contentType: f.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t', body: HLS(f) }); }
        return r.fulfill({ status: 200, contentType: 'audio/mpeg', body: u.pathname === '/short.mp3' ? SHORT : TONE });
      }
      if (u.host === 'refuse.stream.test') return r.fulfill({ status: 403, contentType: 'text/html', body: '<h1>Forbidden</h1>' });
      return r.abort('connectionrefused'); // plain.stream.test asked over HTTPS, down.stream.test, wma.stream.test
    });
    return p;
  }
  const open = async (p, hash = '#/worldradio') => { await p.goto(`${base}${hash}`); await p.locator('.wr-row').first().waitFor({ timeout: 20000 }); };
  const row = (p, name) => p.locator('.wr-row').filter({ has: p.locator('.wr-row-name', { hasText: new RegExp(`^${name}$`) }) });
  const status = (p) => p.locator('.wr-status').innerText();
  const audio = (p) => p.evaluate(() => { const a = document.querySelector('body > audio'); return a && { paused: a.paused, src: a.getAttribute('src') || '', t: a.currentTime, inView: !!a.closest('.view'), volume: a.volume }; });
  const until = async (p, fn, arg, ms = 20000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const playing = (p, name, ms) => until(p, (n) => document.querySelector('.wr-name')?.textContent === n && /^Playing/.test(document.querySelector('.wr-status')?.textContent || '') && !document.querySelector('body > audio')?.paused, name, ms);
  const eventually = async (fn, ms = 8000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await new Promise((r) => setTimeout(r, 100))) if (fn()) return true; return !!fn(); };
  const why = async (p, name) => (await row(p, name).locator('.wr-row-state').innerText().catch(() => '')).trim();

  // ---------------------------------------------------------------- opening: India's most listened, the boxes filled
  const pc = await page({ viewport: { width: 1280, height: 900 } });
  await open(pc);
  const names = await pc.$$eval('.wr-row-name', (xs) => xs.slice(0, 8).map((x) => x.textContent));
  ok(JSON.stringify(names) === JSON.stringify(OURS.slice(0, 8).map((s) => s.name)), `India's most listened first, as the tab opens (${names.join(', ')})`);
  ok(await pc.locator('.wr-chip[aria-pressed="true"]').innerText() === 'India — most listened' && /India — most listened/.test(await pc.locator('.wr-list-title').innerText()), 'the quick pick "India — most listened" is lit');
  ok(!(await pc.locator('.wr-row-name', { hasText: 'World Tone' }).count()), 'a station of another country is not in India\'s list');
  await until(pc, () => document.querySelectorAll('.wr-search select[aria-label="Country"] option').length > 100);
  const cc = await pc.$$eval('.wr-search select[aria-label="Country"] option', (os) => os.slice(0, 3).map((o) => o.textContent));
  ok(cc[0] === 'Any country' && /^India \(/.test(cc[1]), `the countries: India first (${cc.join(' | ')})`);
  const lg = await pc.$$eval('.wr-search select[aria-label="Language"] optgroup', (gs) => gs.map((g) => `${g.label}: ${g.children[0]?.textContent}`));
  ok(/^Languages of India: Hindi/.test(lg[0] || '') && /^All languages/.test(lg[1] || ''), `the languages: India's first (${lg.join(' | ')})`);
  ok(asked.some((u) => /\/json\/stations\/search\?.*countrycode=IN/.test(u)) && ['/json/countries', '/json/languages', '/json/tags'].every((pth) => asked.some((u) => u.includes(pth))), 'the directory was asked for India\'s stations and the three lists');
  ok(!streams.length && !(await audio(pc)), 'nothing is fetched of any station before Play (and no player made)');
  ok(await pc.locator('.wr-empty').isVisible() && !(await pc.locator('.wr-bar').isVisible()), 'before a station: "Choose a station below", no player buttons');

  // ---------------------------------------------------------------- play, pause (the stream let go), play again live
  await row(pc, 'Test Tone FM').locator('.wr-row-main').click();
  ok(await playing(pc, 'Test Tone FM'), `a station plays (${await status(pc)})`);
  let a = await audio(pc);
  ok(a && !a.inView && a.src === 'https://ok.stream.test/tone.mp3', `the site's one player, outside the tab (${JSON.stringify(a)})`);
  ok(await until(pc, () => document.querySelector('body > audio').currentTime > 0.5), 'its sound goes on');
  ok((await row(pc, 'Test Tone FM').getAttribute('aria-current')) === 'true' && /Playing/.test(await why(pc, 'Test Tone FM')), 'its row says it plays (aria-current)');
  ok(/India/.test(await pc.locator('.wr-now .wr-meta').first().innerText()) && /MP3 · 128 kbps/.test(await pc.locator('.wr-now').innerText()), 'its details: country, language, genres, format');
  const site = pc.locator('.wr-now a[href="https://tone.example/"]');
  ok(await site.count() && (await site.getAttribute('target')) === '_blank' && /noopener/.test(await site.getAttribute('rel')), 'the station\'s website, in a new tab (noopener)');
  ok(await eventually(() => asked.filter((u) => u.endsWith(`/json/url/${id(1)}`)).length === 1), 'its listen counted once at the directory');
  const ms = await pc.evaluate(() => ({ t: navigator.mediaSession.metadata?.title, ar: navigator.mediaSession.metadata?.artist, al: navigator.mediaSession.metadata?.album, art: navigator.mediaSession.metadata?.artwork?.[0]?.src.slice(0, 22), s: navigator.mediaSession.playbackState }));
  ok(ms.t === 'Test Tone FM' && /India/.test(ms.ar) && /World Radio/.test(ms.al) && ms.art === 'data:image/png;base64,' && ms.s === 'playing', `the lock screen knows the station (Media Session: ${JSON.stringify(ms)})`);
  ok(!(await pc.locator('.radio-mini').isVisible().catch(() => false)), 'on World Radio itself no small player');
  const n0 = streams.length;
  await pc.locator('.wr-bar').getByRole('button', { name: 'Pause' }).click();
  a = await audio(pc);
  ok(await status(pc) === 'Paused' && a.paused && !a.src, `Pause: paused, and the stream let go (${JSON.stringify(a)})`);
  ok((await pc.evaluate(() => navigator.mediaSession.playbackState)) === 'paused', 'the lock screen says paused');
  await pc.locator('.wr-bar').getByRole('button', { name: 'Play' }).click();
  ok(await playing(pc, 'Test Tone FM') && streams.length > n0, 'Play: connected again (live, not a stale buffer)');
  await pc.locator('.wr-bar').getByRole('button', { name: 'Stop' }).click();
  ok(await status(pc) === 'Stopped' && (await audio(pc)).paused && (await pc.evaluate(() => navigator.mediaSession.playbackState)) === 'none', 'Stop: stopped (the lock screen let go)');

  // ---------------------------------------------------------------- Next past stations that do not play: each skipped, said, marked
  await row(pc, 'Test Tone FM').locator('.wr-row-main').click();
  await playing(pc, 'Test Tone FM');
  await pc.locator('.wr-bar').getByRole('button', { name: 'Next' }).click();
  const hls = await playing(pc, 'HLS Wave', 30000);
  ok(hls, `Next: Plain HTTP Radio, Dead Air FM and WMA Classic do not play — skipped — and HLS Wave (an HLS stream) plays (${await status(pc)})`);
  ok(/3 stations did not play/.test(await pc.locator('.wr-note').innerText()), `… said when it plays (${await pc.locator('.wr-note').innerText()})`);
  ok(/plain HTTP/.test(await why(pc, 'Plain HTTP Radio')), `marked: plain HTTP only (${await why(pc, 'Plain HTTP Radio')})`);
  ok(/did not send the stream/.test(await why(pc, 'Dead Air FM')), `marked: its server did not answer (${await why(pc, 'Dead Air FM')})`);
  ok(/cannot play its kind of stream \(WMA\)/.test(await why(pc, 'WMA Classic')), `marked: a format the browser cannot play (${await why(pc, 'WMA Classic')})`);
  ok(!streams.some((u) => u.includes('wma.stream.test')), '… which was not even asked for (the browser said it cannot play WMA)');
  ok(streams.some((u) => u === 'https://plain.stream.test/live') && !streams.some((u) => u.startsWith('http://')), 'a plain-HTTP stream is asked for over HTTPS only');
  if (hls) ok(await until(pc, () => document.querySelector('body > audio').currentTime > 0.5), 'the HLS stream\'s sound goes on');
  await pc.locator('.wr-bar').getByRole('button', { name: 'Next' }).click();
  ok(await playing(pc, 'Second Tone FM', 30000), `Next: Refusing Radio (403) and RTSP Radio skipped, Second Tone FM plays (${await status(pc)})`);
  ok(/did not send the stream — it is off the air, or it refused/.test(await why(pc, 'Refusing Radio')) && /not a web stream/.test(await why(pc, 'RTSP Radio')), `marked: refused, not a web stream (${await why(pc, 'Refusing Radio')} | ${await why(pc, 'RTSP Radio')})`);
  ok(/2 stations did not play/.test(await pc.locator('.wr-note').innerText()), 'said');
  await pc.locator('.wr-bar').getByRole('button', { name: 'Previous' }).click();
  ok(await playing(pc, 'HLS Wave', 20000), 'Previous: back past the marked ones to HLS Wave');
  await row(pc, 'Plain HTTP Radio').locator('.wr-row-main').click();
  ok(await playing(pc, 'HLS Wave', 30000) && /Plain HTTP Radio did not play \(it streams only over plain HTTP/.test(await pc.locator('.wr-note').innerText()), `a marked station chosen by hand is tried again, said, and the next that plays plays (${await pc.locator('.wr-note').innerText()})`);

  // ---------------------------------------------------------------- five in a row: it stops trying; a stream that breaks off
  await pc.locator('.wr-search input[type="search"]').fill('Broken');
  await until(pc, () => /named “Broken”/.test(document.querySelector('.wr-list-title')?.textContent || '') && document.querySelectorAll('.wr-row').length === 6);
  ok(await pc.locator('.wr-row').count() === 6 && (await pc.locator('.wr-chip[aria-pressed="true"]').count()) === 0, 'the search by name as it is typed: 6 stations, no quick pick lit');
  await pc.locator('.wr-row-main').first().click(); // Broken Station 6: the most listened of them
  ok(await until(pc, () => /5 stations in a row did not play — stopped trying/.test(document.querySelector('.wr-note')?.textContent || ''), null, 30000), `five stations in a row that do not play: it stops trying, and says so (${await pc.locator('.wr-note').innerText()})`);
  ok(await pc.locator('.wr-row.wr-failed').count() === 5 && /^Did not play/.test(await status(pc)), 'five marked; the player says why the last did not play');
  await pc.locator('.wr-search input[type="search"]').fill('Short Wave');
  await until(pc, () => document.querySelectorAll('.wr-row').length === 1);
  await row(pc, 'Short Wave').locator('.wr-row-main').click();
  ok(await until(pc, () => /the stream stopped and did not come back/.test(document.querySelector('.wr-status')?.textContent || ''), null, 30000),
    `a stream that ends (2 s): connected once more, then said (${await status(pc)})`);
  ok(streams.filter((u) => u.endsWith('/short.mp3')).length >= 2, 'it was asked for twice');

  // ---------------------------------------------------------------- the quick picks and the search
  await pc.locator('.wr-chip', { hasText: 'All India Radio' }).click();
  await until(pc, () => /All India Radio/.test(document.querySelector('.wr-list-title')?.textContent || '') && !document.querySelector('.wr-list[aria-busy]'));
  const airs = await pc.$$eval('.wr-row-name', (xs) => xs.map((x) => x.textContent));
  ok(airs.length >= 40 && airs.every((n) => /\b(all india radio|a+kashvani|vividh bhara?ti)\b|(?<!\bon\s)\bair\b/i.test(n)), `All India Radio: ${airs.length} of its streams, every one named so (${airs.slice(0, 4).join(', ')} …)`);
  await pc.locator('.wr-search input[type="search"]').fill('tone');
  await until(pc, () => /named “tone”/.test(document.querySelector('.wr-list-title')?.textContent || ''));
  ok(JSON.stringify(await pc.$$eval('.wr-row-name', (xs) => xs.map((x) => x.textContent))) === JSON.stringify(['World Tone', 'Test Tone FM', 'Second Tone FM']), 'by name: the stations with "tone" in their names, the most listened first');
  await pc.locator('.wr-search select[aria-label="Country"]').selectOption('IN');
  await until(pc, () => document.querySelectorAll('.wr-row').length === 2);
  ok(/named “tone” in India/.test(await pc.locator('.wr-list-title').innerText()), `… and a country (${await pc.locator('.wr-list-title').innerText()})`);
  await pc.locator('.wr-search select[aria-label="Language"]').selectOption('tamil');
  await until(pc, () => document.querySelectorAll('.wr-row').length === 1);
  ok(await pc.locator('.wr-row-name').innerText() === 'Second Tone FM', '… and a language');
  await pc.locator('.wr-search input[type="search"]').fill('');
  await pc.locator('.wr-search select[aria-label="Language"]').selectOption('');
  await pc.locator('.wr-search select[aria-label="Genre"]').selectOption('news');
  await until(pc, () => /— News/.test(document.querySelector('.wr-list-title')?.textContent || '') && !document.querySelector('.wr-list[aria-busy]'));
  const newsOk = await pc.$$eval('.wr-row-name', (xs) => xs.length);
  ok(newsOk > 0 && (await pc.locator('.wr-row-name', { hasText: 'HLS Wave' }).count()) === 1, `a genre: India's news stations (${newsOk})`);
  await pc.locator('.wr-search select[aria-label="Genre"]').selectOption('');
  await pc.locator('.wr-search select[aria-label="Order"]').selectOption('name');
  await until(pc, () => /A → Z/.test(document.querySelector('.wr-list-title')?.textContent || '') && !document.querySelector('.wr-list[aria-busy]'));
  const az = await pc.$$eval('.wr-row-name', (xs) => xs.map((x) => x.textContent));
  const azWant = radioAnswer('https://h/json/stations/search?countrycode=IN&order=name&hidebroken=true&limit=60', stations).map((x) => x.name);
  ok(az.length > 5 && JSON.stringify(az.slice(0, 8)) === JSON.stringify(azWant.slice(0, 8)), `A → Z: in the directory's order of names (${az.slice(0, 3).join(', ')} …)`);
  await pc.locator('.wr-chip', { hasText: 'India — most listened' }).click();
  await until(pc, () => document.querySelector('.wr-row-name')?.textContent === 'Test Tone FM');
  ok(await pc.locator('.wr-search select[aria-label="Country"]').inputValue() === '' && await pc.locator('.wr-search select[aria-label="Order"]').inputValue() === 'clickcount', 'a quick pick clears the search');
  const more0 = await pc.locator('.wr-row').count();
  await pc.getByRole('button', { name: 'More stations' }).click();
  await until(pc, (n) => document.querySelectorAll('.wr-row').length > n, more0);
  ok(await pc.locator('.wr-row').count() > more0, `More stations: the next page added (${more0} → ${await pc.locator('.wr-row').count()})`);

  // ---------------------------------------------------------------- favourites, in the Settings both ways
  await row(pc, 'Test Tone FM').locator('.wr-row-star').click();
  await row(pc, 'Second Tone FM').locator('.wr-row-star').click();
  const kept = await pc.evaluate(() => JSON.parse(localStorage.getItem('superutils.app.worldradio.v1') || 'null'));
  ok(kept?.favourites?.map((f) => f.name).join() === 'Test Tone FM,Second Tone FM' && kept.favourites[0].url === 'https://ok.stream.test/tone.mp3', 'a star keeps the station in the browser (World Radio\'s settings), with what plays it');
  ok((await row(pc, 'Test Tone FM').locator('.wr-row-star').getAttribute('aria-pressed')) === 'true' && /Your favourites \(2\)/.test(await pc.locator('.wr-chip').first().innerText()), 'its star is lit; the chip counts them');
  await pc.locator('.wr-chip').first().click();
  await until(pc, () => /Your favourites/.test(document.querySelector('.wr-list-title')?.textContent || '') && document.querySelectorAll('.wr-row').length === 2);
  ok(asked.some((u) => u.includes(`/json/stations/byuuid?uuids=${id(1)},${id(8)}`)), 'the favourites\' addresses are asked of the directory (a station moves its stream now and then)');
  await pc.goto(`${base}#/settings`);
  await pc.locator('#settings-worldradio .st-stations li').first().waitFor();
  ok(JSON.stringify(await pc.$$eval('#settings-worldradio .st-stations li strong', (xs) => xs.map((x) => x.textContent))) === '["Test Tone FM","Second Tone FM"]', 'the Settings page lists them in World Radio\'s section');
  await pc.locator('#settings-worldradio').getByRole('button', { name: 'Take Second Tone FM off your favourites' }).click();
  await pc.locator('#settings-worldradio').getByText('Keep playing in other apps').click();
  await open(pc);
  ok(await pc.locator('.wr-row').count() === 1 && /Your favourites \(1\)/.test(await pc.locator('.wr-chip').first().innerText()), 'taken off on the Settings page: gone from the tab');
  ok(await pc.locator('.wr-controls input[type="checkbox"]').isChecked(), '"Keep playing in other apps" switched on there: on here');
  // a favourite whose station moved its stream: brought up to date from the directory
  const mv = await page({ viewport: { width: 1280, height: 900 } }, { [id(1)]: 'https://ok.stream.test/tone-moved.mp3' });
  await mv.goto(`${base}#/`);
  await mv.evaluate((f) => localStorage.setItem('superutils.app.worldradio.v1', JSON.stringify({ favourites: [f], keep: false, volume: 0.8 })), { id: id(1), name: 'Test Tone FM', url: 'https://ok.stream.test/tone.mp3', cc: 'IN', country: 'India', lang: 'hindi', codec: 'MP3', bitrate: 128, hls: false, homepage: '', tags: 'music' });
  await open(mv);
  await mv.locator('.wr-chip').first().click();
  ok(await until(mv, () => JSON.parse(localStorage.getItem('superutils.app.worldradio.v1')).favourites[0].url === 'https://ok.stream.test/tone-moved.mp3'), 'a favourite\'s address brought up to date from the directory');
  await row(mv, 'Test Tone FM').locator('.wr-row-main').click();
  ok(await playing(mv, 'Test Tone FM') && streams.includes('https://ok.stream.test/tone-moved.mp3'), '… and played from there');

  // ---------------------------------------------------------------- keep playing in other apps: the small player; off: leaving stops it
  await row(pc, 'Test Tone FM').locator('.wr-row-main').click();
  await playing(pc, 'Test Tone FM');
  await pc.goto(`${base}#/worldclock`);
  await pc.locator('.radio-mini').waitFor({ timeout: 10000 });
  a = await audio(pc);
  ok(!a.paused && a.src && await pc.locator('.radio-mini-title').innerText() === 'Test Tone FM', 'another app open: the station plays on, in the small player at the foot of the page');
  ok(await until(pc, (t0) => document.querySelector('body > audio').currentTime > t0 + 0.5, a.t), '… its sound going on');
  const mini = await pc.locator('.radio-mini').boundingBox(), vh = pc.viewportSize().height;
  ok(mini && mini.y + mini.height <= vh && mini.y > vh - 120, `… at the foot of the window (${mini && Math.round(mini.y)})`);
  await pc.locator('.radio-mini').getByRole('button', { name: 'Pause' }).click();
  ok((await audio(pc)).paused && /Paused/.test(await pc.locator('.radio-mini-state').innerText()), 'its Pause pauses');
  await pc.locator('.radio-mini').getByRole('button', { name: 'Play' }).click();
  ok(await until(pc, () => !document.querySelector('body > audio').paused && /Playing/.test(document.querySelector('.radio-mini-state')?.textContent || '')), 'its Play plays again');
  await pc.goto(`${base}#/`);
  ok(await pc.locator('.radio-mini').isVisible() && !(await audio(pc)).paused, 'the start page too');
  await pc.locator('.radio-mini-name').click();
  await pc.locator('.wr-row').first().waitFor();
  ok(/#\/worldradio$/.test(pc.url()) && !(await pc.locator('.radio-mini').isVisible()) && /^Playing/.test(await status(pc)), 'its name leads back to World Radio, which shows the station playing (the small player gone)');
  await pc.goto(`${base}#/worldclock`);
  await pc.locator('.radio-mini').getByRole('button', { name: 'Stop the radio' }).click();
  ok((await audio(pc)).paused && !(await pc.locator('.radio-mini').isVisible()), 'its Stop stops the sound, and it goes');
  await open(pc);
  await pc.locator('.wr-controls label.switch').click();
  ok(!(await pc.locator('.wr-controls input[type="checkbox"]').isChecked()) && JSON.parse(await pc.evaluate(() => localStorage.getItem('superutils.app.worldradio.v1'))).keep === false, 'the switch off, kept');
  await row(pc, 'Test Tone FM').locator('.wr-row-main').click();
  await playing(pc, 'Test Tone FM');
  await pc.goto(`${base}#/worldclock`);
  await pc.waitForTimeout(400);
  a = await audio(pc);
  ok(a.paused && !a.src && !(await pc.locator('.radio-mini').isVisible()), `switched off: leaving World Radio stops the sound (${JSON.stringify(a)})`);
  ok(!(await pc.evaluate(() => globalThis.__superutilsLive().resources)).includes('worldradio-player'), 'and nothing of the tab is left waiting');
  // the browser itself logs a station's stream that it could not load ("Failed to load resource") — what the stand-in servers do on purpose
  const errs = (p) => p.errors.filter((e) => !/^Failed to load resource/.test(e));
  ok(!errs(pc).length, `no page errors ${errs(pc).slice(0, 3).join(' | ')}`);

  // ---------------------------------------------------------------- the volume, kept; the sleep timer
  const vo = await page({ viewport: { width: 1280, height: 900 } });
  await vo.clock.install();
  await open(vo);
  await vo.locator('.wr-controls input[type="range"]').fill('30');
  await row(vo, 'Test Tone FM').locator('.wr-row-main').click();
  ok(await playing(vo, 'Test Tone FM') && Math.abs((await audio(vo)).volume - 0.3) < 0.001, 'the volume: 30 %');
  ok(JSON.parse(await vo.evaluate(() => localStorage.getItem('superutils.app.worldradio.v1'))).volume === 0.3, '… kept in the browser');
  await vo.locator('.wr-controls select[aria-label="Sleep timer"]').selectOption('15');
  ok(/Stops at/.test(await vo.locator('.wr-controls').innerText()), 'the sleep timer says when it stops');
  await vo.clock.runFor(15 * 60000 - 4000);
  a = await audio(vo);
  ok(!a.paused && a.volume < 0.3 && a.volume > 0, `it fades out over its last seconds (${a.volume.toFixed(3)})`);
  await vo.clock.runFor(6000);
  a = await audio(vo);
  ok(a.paused && /The sleep timer stopped the radio/.test(await vo.locator('.wr-note').innerText()) && await vo.locator('.wr-controls select[aria-label="Sleep timer"]').inputValue() === '0', 'after 15 minutes: stopped, said, the timer off');
  ok(Math.abs(a.volume - 0.3) < 0.001 || a.volume === 0.3, `… and the volume as it was for the next time (${a.volume})`);

  // ---------------------------------------------------------------- the directory down, and back
  const dn = await page({ viewport: { width: 1280, height: 900 } });
  let down = true;
  await dn.route(RADIO_HOSTS, (r) => (down ? r.abort('connectionrefused') : r.fallback()));
  await dn.goto(`${base}#/worldradio`);
  ok(await until(dn, () => /could not be reached/.test(document.querySelector('.wr-err')?.textContent || '')), `the directory down: said in words (${await dn.locator('.wr-err').innerText().catch(() => '')})`);
  down = false;
  await dn.getByRole('button', { name: 'Try again' }).click();
  ok(await until(dn, () => document.querySelectorAll('.wr-row').length > 5), '… and Try again lists the stations when it is back');

  // ---------------------------------------------------------------- the phone
  const ph = await page(devices['iPhone 13']);
  await open(ph);
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no sideways scroll');
  await row(ph, 'Test Tone FM').locator('.wr-row-main').click();
  await playing(ph, 'Test Tone FM');
  const bar = await ph.locator('.wr-bar').boundingBox();
  ok(bar && Math.abs(bar.y + bar.height - ph.viewportSize().height) < 2, `phone: Previous / Pause / Next / Stop in the bar at the foot of the screen (${bar && Math.round(bar.y)})`);
  const small = await ph.$$eval('.wr-bar .btn, .wr-chip, .wr-row-main, .wr-row-star, .wr-now a, .wr-about a', (bs) => bs.filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect()).filter((r) => r.height < 44 || r.width < 44).length);
  ok(!small, `phone: every control a 44 px target (${small} smaller)`);
  ok(!(await ph.locator('.wr-controls input[type="range"]').count()) && /phone’s own buttons/.test(await ph.locator('.wr-controls').innerText()), 'phone (an iPhone): no volume slider — the phone\'s own buttons');
  ok(!errs(ph).length, `phone: no page errors ${errs(ph).slice(0, 3).join(' | ')}`);

  // ---------------------------------------------------------------- WCAG 2.2 A / AA, light and dark, with a station playing and one marked
  const ax = await page({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
  await open(ax);
  await row(ax, 'Test Tone FM').locator('.wr-row-main').click(); await playing(ax, 'Test Tone FM');
  await ax.locator('.wr-bar').getByRole('button', { name: 'Next' }).click(); await playing(ax, 'HLS Wave', 30000);
  for (const scheme of ['light', 'dark']) {
    await ax.emulateMedia({ colorScheme: scheme });
    await ax.waitForFunction(() => !document.getAnimations().some((x) => x.playState === 'running' && x.effect?.getComputedTiming().iterations !== Infinity), null, { timeout: 5000 }).catch(() => {});
    if (!(await ax.evaluate(() => !!window.axe))) await ax.addScriptTag({ content: AXE });
    const v = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((m) => { const d = m.any?.[0]?.data; return m.target.join(' ') + (d?.contrastRatio ? ` (${d.fgColor} on ${d.bgColor}: ${d.contrastRatio} : 1)` : ''); }).join(', ')}`), TAGS);
    ok(!v.length, `${scheme} theme: no WCAG 2.2 A / AA violation ${v.join(' | ')}`);
  }
  info(`${streams.length} stream requests, ${asked.length} directory requests`);
};
