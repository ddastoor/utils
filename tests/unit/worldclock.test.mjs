// The World Clock (potentials #73): src/lib/worldclock.ts and mathcore's m_sun against tests/fixtures/worldclock/ —
// reference.json (scripts/make-worldclock-reference.py: astral 3.2's sunrise and sunset in each city's own zone and day, Python's
// zoneinfo over the system's tzdata for every change of a zone's offset in 2026 – 2027) and ids.json (every city's id as
// scripts/make-worldclock-cities.py makes it). The search is textcore.wasm's, as in the tab.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, wasm, root }) => {
  const W = await load('/src/lib/worldclock.ts');
  const { bindMathcore } = await load('/src/wasm/mathcore.ts');
  const { bindTextcore } = await load('/src/wasm/textcore.ts');
  const m = bindMathcore(await wasm('mathcore'));
  const fx = (f) => JSON.parse(readFileSync(join(root, 'tests/fixtures/worldclock', f), 'utf8'));
  const ref = fx('reference.json'), ids = fx('ids.json');
  const utc = (s) => Date.parse(s);

  // ================================================================== the cities
  const cities = W.allCities();
  t.eq(cities.length, ids.ids.length, `${cities.length} cities`);
  {
    const bad = cities.map((c, i) => (c.id !== ids.ids[i] || c.name !== ids.names[i] ? `${c.id}/${c.name} ≠ ${ids.ids[i]}/${ids.names[i]}` : '')).filter(Boolean);
    t.ok(!bad.length, `every city's id made in TypeScript as the script made it (accents dropped, ø as o: tromso-no) ${bad.slice(0, 5).join(' | ')}`);
    const dup = cities.length - new Set(cities.map((c) => c.id)).size;
    t.eq(dup, 0, 'no two cities share an id');
    const unknown = [...new Set(cities.map((c) => c.zone))].filter((z) => { try { new Intl.DateTimeFormat('en', { timeZone: z }); return false; } catch { return true; } });
    t.ok(!unknown.length, `every city's zone is known to Intl (${unknown.join(' ')})`);
    const zones = new Set(cities.map((c) => c.zone));
    t.ok(zones.size >= 350, `the list covers ${zones.size} zones (every zone GeoNames uses)`);
    t.ok(cities.every((c) => c.where && Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180), 'every city has a country and a place on the globe');
  }
  const P = (id) => { const p = W.placeOf(id); if (!p) throw new Error(`no place ${id}`); return p; };
  t.eq(['new-york-us', 'san-francisco-us', 'london-gb', 'mumbai-in', 'sydney-au', 'hong-kong-hk', 'singapore-sg'].map((i) => `${P(i).name} (${P(i).where})`).join('; '),
    'New York (New York, United States); San Francisco (California, United States); London (England, United Kingdom); Mumbai (India); Sydney (Australia); Hong Kong (Hong Kong); Singapore (Singapore)', 'the owner\'s seven: names and places');
  t.eq([P('tromso-no').name, P('cologne-de').name, P('washington-d-c-us').name, P('thane-in').name, P('seville-es').name].join(', '), 'Tromsø, Cologne, Washington, D.C., Thane, Seville', 'names as English writes them (Thane, not Thāne; Cologne, not Köln)');
  t.ok(W.SETS.every((s) => s.ids.every((i) => W.placeOf(i))) && W.SETS.find((s) => s.id === W.DEFAULT_SET).ids.length === 7, 'every city of every set is in the list; the first set is the owner\'s seven');
  t.eq(JSON.stringify([W.placeOf('utc')?.name, W.placeOf('tz:Europe/Lisbon')?.where, W.placeOf('tz:Mars/Olympus'), W.placeOf('atlantis-xx')]), '["UTC","Time zone Europe/Lisbon",null,null]', 'zones of their own: UTC and any zone Intl knows; nothing for an unknown one');

  // ================================================================== the list in the address
  t.eq(JSON.stringify(W.listFromHash('#/worldclock?c=new-york-us,london-gb,tz%3AEurope%2FLisbon,utc,atlantis-xx,london-gb&h=24')), '["new-york-us","london-gb","tz:Europe/Lisbon","utc"]', 'the list read from the address: unknown ids and repeats dropped');
  t.eq(JSON.stringify([W.listFromHash('#/worldclock'), W.listFromHash('#/worldclock?h=24'), W.listFromHash('#/worldclock?c=')]), '[null,null,[]]', 'no list given: null; an empty one: []');
  t.eq(JSON.stringify([W.hourFromHash('#/worldclock?c=x&h=24'), W.hourFromHash('#/worldclock?h=12'), W.hourFromHash('#/worldclock?h=13'), W.hourFromHash('#/worldclock')]), '[24,12,null,null]', '12 or 24 hours from the address');
  { const list = ['new-york-us', 'tz:America/Argentina/Buenos_Aires', 'tz:Etc/GMT+5', 'utc']; t.eq(JSON.stringify(W.listFromHash(`#/worldclock?c=${W.encodeList(list)}`)), JSON.stringify(list), `there and back: ${W.encodeList(list)}`); }

  // ================================================================== the sun, against astral 3.2
  {
    let worst = 0, n = 0, polar = 0, none = 0;
    const bad = [];
    for (const [id, date, rise, set] of ref.sun) {
      const p = P(id), [y, mo, d] = date.split('-').map(Number);
      for (const [want, rising] of [[rise, true], [set, false]]) {
        const got = W.sunEvent(m, rising, p.lat, p.lon, p.zone, y, mo, d);
        if (typeof want === 'number') {
          const dt = typeof got === 'number' ? Math.abs(got / 1000 - want) : Infinity;
          worst = Math.max(worst, dt); n++;
          if (!(dt <= 0.5)) bad.push(`${id} ${date} ${rising ? 'sunrise' : 'sunset'}: ${got} ≠ ${want * 1000}`);
        } else {
          if (want === null) none++; else polar++;
          if (got !== want) bad.push(`${id} ${date} ${rising ? 'sunrise' : 'sunset'}: ${got} ≠ ${want}`);
        }
      }
    }
    t.ok(!bad.length && n > 15000 && polar > 50, `${n} sunrises and sunsets of ${new Set(ref.sun.map((r) => r[0])).size} cities on ${new Set(ref.sun.map((r) => r[1])).size} days as astral ${ref.astral} gives them, within ${(worst * 1000).toFixed(1)} ms; ${polar} days the sun stays up or down and ${none} without the event on that date, the same ${bad.slice(0, 4).join(' | ')}`);
  }
  {
    const day = (id, date) => { const p = P(id), [y, mo, d] = date.split('-').map(Number); return W.sunDay(m, p, { y, mo, d }); };
    const local = (t, zone) => W.sunClock(zone, t, true);
    const ny = day('new-york-us', '2026-11-28');
    t.eq(`${local(ny.rise, 'America/New_York')} – ${local(ny.set, 'America/New_York')} · ${W.daylightText(ny.rise, ny.set)}`, '06:58 – 16:30 · 9 h 32 min of daylight', 'New York, 28 Nov 2026 (astral: 06:57:52 – 16:29:56), to the nearest minute');
    const mum = day('mumbai-in', '2026-11-28');
    t.eq(`${local(mum.rise, 'Asia/Kolkata')} – ${local(mum.set, 'Asia/Kolkata')} · ${W.daylightText(mum.rise, mum.set)}`, '06:54 – 17:59 · 11 h 5 min of daylight', 'Mumbai, 28 Nov 2026 (astral: 06:53:36 – 17:58:58)');
    t.eq(JSON.stringify(day('longyearbyen-sj', '2026-12-21')), '{"rise":"down","set":"down"}', 'Longyearbyen at midwinter: the sun stays down');
    t.eq(JSON.stringify(day('longyearbyen-sj', '2026-06-21')), '{"rise":"up","set":"up"}', 'Longyearbyen at midsummer: the sun stays up');
    t.eq(JSON.stringify(day('tz:Europe/Lisbon' === 'x' ? 'x' : 'utc', '2026-06-21') ?? null), 'null', 'a zone has no sun (no place on the globe)');
    const up = (id, iso) => W.sunUp(m, P(id), utc(iso));
    t.eq([up('new-york-us', '2026-11-28T17:00:00Z'), up('new-york-us', '2026-11-29T03:00:00Z'), up('mumbai-in', '2026-11-28T06:00:00Z'), up('mumbai-in', '2026-11-28T18:00:00Z'), up('longyearbyen-sj', '2026-12-21T12:00:00Z'), up('longyearbyen-sj', '2026-06-21T00:00:00Z'), up('sydney-au', '2026-11-28T02:00:00Z')].join(), 'true,false,true,false,false,true,true', 'day or night: New York at noon and at night, Mumbai, the polar night and the midnight sun, Sydney');
    t.eq(W.sunUp(m, W.placeOf('utc'), Date.now()), null, 'a zone has no day or night');
  }

  // ================================================================== clock changes, against zoneinfo
  {
    const end = utc('2028-01-01T00:00:00Z'), bad = [];
    let n = 0, differ = [];
    for (const [zone, want] of Object.entries(ref.changes)) {
      // the transitions where this Intl's tzdata agrees with the reference's (a newer or older tzdata may differ)
      const agree = want.every(([at, before, after]) => {
        const o = (s) => { try { return W.readingAt(zone, s * 1000) && Math.round((Date.UTC(...(() => { const r = W.readingAt(zone, s * 1000); return [r.y, r.mo - 1, r.d, r.h, r.mi, r.s]; })()) - s * 1000) / 1000); } catch { return NaN; } };
        return o(at - 1) === before && o(at) === after;
      });
      if (!agree) { differ.push(zone); continue; }
      const got = [];
      let from = utc('2026-01-01T00:00:00Z');
      for (;;) { const c = W.nextChange(zone, from, 800); if (!c || c.at >= end) break; got.push([c.at / 1000, c.before, c.after]); from = c.at; }
      n += want.length;
      if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${zone}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
    }
    t.ok(!bad.length && n > 350 && differ.length <= 3, `every change of offset in 2026 – 2027 found to the second in ${Object.keys(ref.changes).length - differ.length} zones (${n} changes, tzdata ${ref.tzdata}; this Intl's tzdata differs in: ${differ.join(' ') || 'none'}) ${bad.slice(0, 3).join(' | ')}`);
    const from = utc('2026-11-28T10:00:00Z'), text = (z, h24 = false) => { const c = W.nextChange(z, from); return c ? W.changeText(c, h24) : 'none'; };
    t.eq(text('America/New_York'), 'Clocks go forward 1 hour on Sun, 14 Mar 2027 at 2:00 am (to 3:00 am)', 'New York\'s next change');
    t.eq(text('Europe/London'), 'Clocks go forward 1 hour on Sun, 28 Mar 2027 at 1:00 am (to 2:00 am)', 'London\'s');
    t.eq(text('Australia/Sydney'), 'Clocks go back 1 hour on Sun, 4 Apr 2027 at 3:00 am (to 2:00 am)', 'Sydney\'s (it is summer there)');
    t.eq(text('Australia/Lord_Howe', true), 'Clocks go back 30 minutes on Sun, 4 Apr 2027 at 02:00 (to 01:30)', 'Lord Howe Island moves half an hour (24-hour clock)');
    t.eq([text('Asia/Kolkata'), text('Asia/Singapore'), text('UTC')].join(' / '), 'none / none / none', 'India, Singapore and UTC have no clock changes');
  }

  // ================================================================== the words of a card
  t.eq(JSON.stringify([19800, -34200, 0, 3600, 2700, -1800].map((s) => W.gapText(s))), JSON.stringify([
    { short: '+5 h 30 min', words: '5 hours 30 minutes ahead of you' }, { short: '−9 h 30 min', words: '9 hours 30 minutes behind you' },
    { short: 'Same time', words: 'the same time as yours' }, { short: '+1 h', words: '1 hour ahead of you' }, { short: '+45 min', words: '45 minutes ahead of you' },
    { short: '−30 min', words: '30 minutes behind you' }]), 'how far a zone is from yours, short and in words');
  {
    const r = (iso, zone) => W.readingAt(zone, utc(iso)), you = r('2026-11-28T20:00:00Z', 'Asia/Kolkata'); // 1:30 am on the 29th in India
    t.eq([W.dayWord(r('2026-11-28T20:00:00Z', 'America/New_York'), you), W.dayWord(r('2026-11-28T20:00:00Z', 'Asia/Tokyo'), you), W.dayWord(r('2026-11-28T20:00:00Z', 'Asia/Dubai'), you), W.dayWord(r('2026-11-28T20:00:00Z', 'Pacific/Kiritimati'), you)].join(', '), 'Yesterday, Today, Today, Today', 'the day there against yours (1:30 am on the 29th in India: midnight in Dubai, the 29th too)');
    t.eq(W.dateText(you), 'Sun, 29 Nov 2026', 'the date');
    t.eq([W.clockText({ h: 0, mi: 5, s: 9 }, false, true), W.clockText({ h: 12, mi: 0, s: 0 }, false), W.clockText({ h: 21, mi: 41, s: 5 }, true, true), W.clockText({ h: 9, mi: 7, s: 0 }, true)].join(' | '), '12:05:09 am | 12:00 pm | 21:41:05 | 09:07', '12 and 24 hours');
  }
  t.eq([W.zoneLine('America/New_York', utc('2026-01-15T12:00:00Z')), W.zoneLine('America/New_York', utc('2026-07-15T12:00:00Z')), W.zoneLine('Asia/Kolkata', utc('2026-07-15T12:00:00Z')), W.zoneLine('Europe/London', utc('2026-07-15T12:00:00Z')), W.zoneLine('Asia/Dubai', utc('2026-07-15T12:00:00Z')), W.zoneLine('UTC', utc('2026-07-15T12:00:00Z'))].join(' | '),
    'UTC−05:00 · EST · Eastern Standard Time | UTC−04:00 · EDT · Eastern Daylight Time | UTC+05:30 · IST · India Standard Time | UTC+01:00 · BST · British Summer Time | UTC+04:00 · Gulf Standard Time | UTC+00:00 · UTC · Coordinated Universal Time',
    'the zone line: offset, tzdata\'s abbreviation where it has letters, the English name');

  // ================================================================== the search
  {
    const tc = bindTextcore(await wasm('textcore'));
    const { recs, places } = W.searchRecords(utc('2026-11-28T10:00:00Z'));
    const ix = tc.searchBuild(recs);
    const top = (q, k = 1) => tc.searchQuery(ix, W.fold(q), 20).slice(0, k).map((i) => places[i].id);
    const cases = [
      ['new york', 'new-york-us'], ['nyc', 'new-york-us'], ['big apple', 'new-york-us'], ['san francisco', 'san-francisco-us'], ['san fran', 'san-francisco-us'], ['sf', 'san-francisco-us'],
      ['london', 'london-gb'], ['london canada', 'london-ca'], ['mumbai', 'mumbai-in'], ['bombay', 'mumbai-in'], ['bangalore', 'bengaluru-in'], ['madras', 'chennai-in'],
      ['calcutta', 'kolkata-in'], ['gurgaon', 'gurugram-in'], ['goa', 'panaji-in'], ['sydney', 'sydney-au'], ['hong kong', 'hong-kong-hk'], ['singapore', 'singapore-sg'],
      ['tromso', 'tromso-no'], ['tromsø', 'tromso-no'], ['zurich', 'zurich-ch'], ['koln', 'cologne-de'], ['munchen', 'munich-de'], ['saigon', 'ho-chi-minh-city-vn'],
      ['sao paulo', 'sao-paulo-br'], ['washington dc', 'washington-d-c-us'], ['utc', 'utc'], ['gmt', 'utc'], ['india standard time', 'tz:Asia/Kolkata'], ['eastern time', 'tz:America/New_York'],
      ['pacific time', 'tz:America/Los_Angeles'], ['europe/lisbon', 'tz:Europe/Lisbon'], ['america/argentina/buenos aires', 'tz:America/Argentina/Buenos_Aires'], ['cupertino', 'cupertino-us'], ['portland oregon', 'portland-us'],
      ['kathmandu', 'kathmandu-np'], ['nepal', 'kathmandu-np'], ['uk', 'london-gb'], ['uae', 'dubai-ae'], ['kiev', 'kyiv-ua'],
    ];
    const bad = cases.filter(([q, want]) => top(q)[0] !== want).map(([q, want]) => `"${q}" → ${top(q, 3).join(', ')} (want ${want})`);
    t.ok(!bad.length, `${cases.length} searches give the place first: other names (Bombay, Saigon, Köln), states and countries, zones by name and English name ${bad.join(' | ')}`);
    const ist = top('ist', 3).sort();
    t.eq(ist.join(' '), 'tz:Asia/Jerusalem tz:Asia/Kolkata tz:Europe/Dublin', '"IST" finds the three zones that write it (India, Israel, Ireland)');
    t.ok(top('pst', 3).includes('tz:America/Los_Angeles'), `"PST" finds Pacific time (${top('pst', 3).join(', ')})`);
    t.ok(top('utc+5:30', 4).includes('tz:Asia/Kolkata') && top('gmt+05:30', 4).includes('tz:Asia/Kolkata') && top('+9', 6).some((x) => /Tokyo|Seoul/.test(x)), `zones by their offset: UTC+5:30 → ${top('utc+5:30', 3).join(', ')}; +9 → ${top('+9', 4).join(', ')}`);
    t.ok(top('paris')[0] === 'paris-fr' && top('paris', 2)[1] === 'tz:Europe/Paris', `Paris is Paris, France, then its zone (${top('paris', 3).join(', ')})`);
    t.ok(!top('xqzv').length, 'nonsense finds nothing');
    tc.searchFree(ix);
  }
};
