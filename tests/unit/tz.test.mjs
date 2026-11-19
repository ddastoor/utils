// Time zones (src/lib/tz.ts): offsets and the reading of wall-clock times, against Python's zoneinfo on the IANA
// database (tests/fixtures/tz/reference.json, scripts/make-tz-reference.py). Node's Intl carries the same database
// (process.versions.tz); where the two are of different versions the suite says so and compares what both know.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, root }) => {
  const Z = await load('/src/lib/tz.ts');
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/tz/reference.json'), 'utf8'));
  const version = /tzdata (\S+)/.exec(ref.made_with)[1], same = process.versions.tz === version;
  t.ok(ref.zones.length === 52 && ref.zones.every((z) => Z.zoneKnown(z)), `the 52 zones of the reference are known to Intl (reference tzdata ${version}, this Node ${process.versions.tz})`);

  // ---- offsets: 52 zones from 1850 to 2037
  let bad = [];
  for (const [zi, sec, off] of ref.offsets) { const got = Z.zoneOffset(ref.zones[zi], sec * 1000); if (got !== off) bad.push(`${ref.zones[zi]} at ${new Date(sec * 1000).toISOString()}: ${got} s, not ${off} s`); }
  if (same) t.ok(ref.offsets.length === 2288 && !bad.length, `${ref.offsets.length} offsets agree to the second — local mean time, wartime summer time, half-hour zones ${bad.slice(0, 3).join(' | ')}`);
  else t.ok(bad.length < ref.offsets.length * 0.01, `offsets agree but for ${bad.length} of ${ref.offsets.length} (different tzdata versions) ${bad.slice(0, 3).join(' | ')}`);

  // ---- wall-clock readings around every clock change of seven years, and at random times
  bad = []; const kinds = { ok: 0, twice: 0, skipped: 0 };
  for (const [zi, date, time, sec, kind] of ref.readings) {
    const [y, mo, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number), r = Z.wallToInstant(ref.zones[zi], Z.utcMs(y, mo, d, h, mi));
    kinds[r.kind]++;
    if (r.at !== sec * 1000 || r.kind !== kind) bad.push(`${ref.zones[zi]} ${date} ${time}: ${new Date(r.at).toISOString()} (${r.kind}), not ${new Date(sec * 1000).toISOString()} (${kind})`);
  }
  if (same) t.ok(ref.readings.length === 3095 && !bad.length, `${ref.readings.length} wall-clock readings stand for the instants Python gives: ${kinds.ok} that exist once, ${kinds.twice} twice (the first is taken), ${kinds.skipped} not at all (read past the gap) ${bad.slice(0, 3).join(' | ')}`);
  else t.ok(bad.length < ref.readings.length * 0.02, `readings agree but for ${bad.length} of ${ref.readings.length} (different tzdata versions) ${bad.slice(0, 3).join(' | ')}`);

  // ---- known cases
  const at = (zone, y, mo, d, h, mi) => Z.wallToInstant(zone, Z.utcMs(y, mo, d, h, mi));
  const iso = (ms) => new Date(ms).toISOString().slice(0, 16) + 'Z';
  for (const [zone, w, want, kind] of [
    ['Asia/Kolkata', [2026, 11, 16, 9, 30], '2026-11-16T04:00Z', 'ok'], ['America/New_York', [2026, 7, 4, 18, 0], '2026-07-04T22:00Z', 'ok'],
    ['America/New_York', [2026, 3, 8, 2, 30], '2026-03-08T07:30Z', 'skipped'], ['America/New_York', [2026, 3, 8, 3, 30], '2026-03-08T07:30Z', 'ok'], ['America/New_York', [2026, 11, 1, 1, 30], '2026-11-01T05:30Z', 'twice'],
    ['Europe/London', [2026, 10, 25, 1, 30], '2026-10-25T00:30Z', 'twice'], ['Europe/London', [2026, 3, 29, 1, 30], '2026-03-29T01:30Z', 'skipped'],
    ['Australia/Lord_Howe', [2026, 4, 5, 1, 45], '2026-04-04T14:45Z', 'twice'], ['Australia/Lord_Howe', [2026, 10, 4, 2, 15], '2026-10-03T15:45Z', 'skipped'],
    ['Pacific/Apia', [2011, 12, 30, 12, 0], '2011-12-30T22:00Z', 'skipped'], ['Asia/Kathmandu', [2026, 1, 1, 0, 0], '2025-12-31T18:15Z', 'ok'], ['UTC', [2026, 1, 1, 0, 0], '2026-01-01T00:00Z', 'ok'],
  ]) { const r = at(zone, ...w); t.ok(iso(r.at) === want && r.kind === kind, `${zone} ${w.join('-')}: ${iso(r.at)} (${r.kind})`); }

  // ---- offsets written out
  for (const [sec, text] of [[19800, 'UTC+05:30'], [0, 'UTC+00:00'], [-18000, 'UTC−05:00'], [-12600, 'UTC−03:30'], [20700, 'UTC+05:45'], [50400, 'UTC+14:00'], [21208, 'UTC+05:53:28'], [-2670, 'UTC−00:44:30'], [19270, 'UTC+05:21:10'], [-28378, 'UTC−07:52:58'], [45900, 'UTC+12:45']])
    t.eq(Z.offsetLabel(sec), text, `offsetLabel(${sec})`);
  t.eq(Z.zoneOffset('Asia/Kolkata', Z.utcMs(1850, 1, 1, 12)), 21208, 'Kolkata in 1850: local mean time, 5 h 53 min 28 s (the tab wrote "UTC+05:53.46666666666664")');
  t.eq(Z.zoneOffset('Asia/Kolkata', Z.utcMs(1900, 6, 1, 12)), 19270, 'Kolkata in 1900: Madras time, 5 h 21 min 10 s');
  t.eq(Z.zoneOffset('Asia/Kolkata', Z.utcMs(1943, 6, 1, 12)), 23400, 'Kolkata in 1943: wartime, 6 h 30 min');
  // ---- the first hundred years are not the twentieth century (Date.UTC reads 50 as 1950)
  t.eq(Z.utcMs(50, 1, 1), -60589296000000, 'utcMs(50, 1, 1) is the year 50');
  t.eq(new Date(Z.utcMs(1, 1, 1)).toISOString(), '0001-01-01T00:00:00.000Z', 'utcMs(1, 1, 1)');
  t.eq(Z.zoneOffset('Asia/Kolkata', Z.utcMs(50, 6, 1, 12)), 21208, 'Kolkata in the year 50: local mean time (it was worked out for 1950: UTC+05:30)');
  t.eq(Z.zoneOffset('America/Los_Angeles', Z.utcMs(1, 6, 1, 12)), -28378, 'Los Angeles in the year 1: −7 h 52 min 58 s (it was −08:00, the offset of 1901)');
  t.eq(Z.fmtInstant(Z.utcMs(1, 1, 3, 12), 'UTC'), 'Wed, 3 Jan 0001, 12:00 pm', '3 January 0001 was a Wednesday (the tab showed the weekday of 1901)');
  t.eq(Z.zoneOffset('UTC', Z.utcMs(1, 1, 1) - 1000), 0, 'the last second of 1 BC has an offset as well');

  // before 1970 the browser's database gives Amsterdam the history of Brussels (IANA's main data links the two; only
  // distributions that add the "backzone" file keep Amsterdam's own 19 min 32 s) — which is why it is not in the reference
  t.eq(Z.zoneOffset('Europe/Amsterdam', Z.utcMs(1900, 6, 1, 12)), Z.zoneOffset('Europe/Brussels', Z.utcMs(1900, 6, 1, 12)), 'Amsterdam in 1900 follows Brussels, as in IANA\'s main data');
  t.eq(Z.zoneOffset('Europe/Amsterdam', Date.UTC(2026, 6, 1)), 7200, 'Amsterdam today: UTC+02:00 in summer');
  // ---- instants written out: the zone's own clock and calendar, the year always
  for (const [ms, zone, text] of [[Date.UTC(2026, 10, 16, 4, 0), 'Asia/Kolkata', 'Mon, 16 Nov 2026, 9:30 am'], [Date.UTC(2026, 10, 16, 4, 0), 'America/New_York', 'Sun, 15 Nov 2026, 11:00 pm'], [Date.UTC(2026, 11, 31, 20, 0), 'Asia/Tokyo', 'Fri, 1 Jan 2027, 5:00 am'],
    [Date.UTC(2026, 0, 1, 0, 0), 'UTC', 'Thu, 1 Jan 2026, 12:00 am'], [Date.UTC(2026, 0, 1, 12, 5), 'UTC', 'Thu, 1 Jan 2026, 12:05 pm'], [Z.utcMs(50, 1, 1, 12), 'UTC', 'Sat, 1 Jan 0050, 12:00 pm'], [Z.utcMs(1, 1, 1, 0) - 3600000, 'UTC', 'Sun, 31 Dec 1 BC, 11:00 pm']])
    t.eq(Z.fmtInstant(ms, zone), text, `fmtInstant(${new Date(ms).toISOString()}, ${zone})`);
  t.eq(Z.fmtClock(Date.UTC(2026, 2, 8, 7, 30), 'America/New_York'), '3:30 am', 'fmtClock');

  // ---- how far one zone is from another, at that instant
  const nov = Date.UTC(2026, 10, 16, 4, 0), jul = Date.UTC(2026, 6, 1, 4, 0);
  for (const [from, to, ms, text] of [['Asia/Kolkata', 'America/New_York', nov, '10 hours 30 minutes behind'], ['Asia/Kolkata', 'America/New_York', jul, '9 hours 30 minutes behind'], ['America/New_York', 'Asia/Kolkata', nov, '10 hours 30 minutes ahead'],
    ['Asia/Kolkata', 'Asia/Kathmandu', nov, '15 minutes ahead'], ['Asia/Kolkata', 'Asia/Dubai', nov, '1 hour 30 minutes behind'], ['Europe/London', 'UTC', nov, 'the same time'], ['Europe/London', 'UTC', jul, '1 hour behind'], ['Asia/Kolkata', 'Asia/Colombo', nov, 'the same time'],
    ['UTC', 'Asia/Kolkata', Z.utcMs(1850, 1, 1), '5 hours 53 minutes 28 seconds ahead']]) t.eq(Z.zoneGap(from, to, ms), text, `${to} seen from ${from}`);

  // ---- names
  for (const [old, now] of [['Asia/Calcutta', 'Asia/Kolkata'], ['Asia/Katmandu', 'Asia/Kathmandu'], ['Europe/Kiev', 'Europe/Kyiv'], ['Asia/Saigon', 'Asia/Ho_Chi_Minh'], ['Asia/Rangoon', 'Asia/Yangon'], ['America/Buenos_Aires', 'America/Argentina/Buenos_Aires'], ['America/Godthab', 'America/Nuuk'],
    ['America/Indianapolis', 'America/Indiana/Indianapolis'], ['Atlantic/Faeroe', 'Atlantic/Faroe'], ['Pacific/Truk', 'Pacific/Chuuk'], ['Pacific/Enderbury', 'Pacific/Kanton'], ['Africa/Asmera', 'Africa/Asmara']])
    t.ok(Z.modernZone(old) === now && Z.zoneOffset(old, nov) === Z.zoneOffset(now, nov), `${old} is shown as ${now} (the same clock)`);
  for (const z of ['Europe/Bratislava', 'Europe/Vatican', 'Asia/Kolkata', 'UTC', 'America/New_York']) t.eq(Z.modernZone(z), z, `${z} keeps its name`);
  t.eq(Z.modernZone('Nowhere/Nothing'), 'Nowhere/Nothing', 'an unknown name is left alone'); t.ok(!Z.zoneKnown('Nowhere/Nothing') && Z.zoneKnown('Asia/Kolkata'), 'zoneKnown');
  t.eq(Z.zoneLabel('America/Argentina/Buenos_Aires'), 'America/Argentina/Buenos Aires', 'zoneLabel');
};
