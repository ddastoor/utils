// Local-time reference for the jq tab: what the NATIVE jq 1.8.2 command line prints for local-time filters in a list
// of time zones (TZ=<zone>), written to tests/fixtures/jq/localtime.json. tests/unit/jq.test.mjs runs the same
// filters through our jq.wasm with the host answering for that zone (supertools.tz_info) and wants the same output.
//   JQ=/path/to/jq-1.8.2/jq node scripts/make-jq-localtime.mjs
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const JQ = process.env.JQ; if (!JQ) { console.error('set JQ to a native jq 1.8.2 binary'); process.exit(1); }
const ver = spawnSync(JQ, ['--version'], { encoding: 'utf8' }).stdout.trim();
if (ver !== 'jq-1.8.2') { console.error(`need jq-1.8.2, got ${ver}`); process.exit(1); }
const ZONES = ['UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Kathmandu', 'Asia/Tehran', 'Asia/Tokyo', 'Asia/Singapore', 'Europe/London', 'Europe/Dublin', 'Europe/Berlin', 'Europe/Moscow',
  'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/St_Johns', 'America/Sao_Paulo', 'America/Phoenix', 'Africa/Johannesburg', 'Africa/Casablanca',
  'Australia/Sydney', 'Australia/Lord_Howe', 'Australia/Adelaide', 'Pacific/Auckland', 'Pacific/Chatham', 'Pacific/Kiritimati', 'Pacific/Honolulu', 'Etc/GMT+12'];
// moments (seconds since 1970): ordinary days, both sides of daylight-saving changes in several zones, the 32-bit edge
const T = [0, 86399, 500000000, 946684800, 1300000000, 1319932800, 1700000000, 1710054000, 1710057600, 1710061200, 1711846800, 1711850400, 1720000000, 1730613600, 1730617200, 1730620800,
  1743296400, 1759622400, 2147483647, 2147483648, 2500000000, 4102444800, -1, -86400, -500000000, 1700000000.5, 1720000000.25];
// wall-clock readings [Y, M-1, D, h, m, s]: ordinary ones, times that do not exist (spring forward) or exist twice (fall back)
const WALL = [[2024, 0, 15, 9, 30, 0], [2024, 6, 3, 12, 0, 0], [2024, 2, 10, 2, 30, 0], [2024, 2, 31, 1, 30, 0], [2024, 2, 31, 2, 30, 0], [2024, 10, 3, 1, 30, 0], [2024, 9, 27, 1, 30, 0], [2024, 3, 7, 2, 30, 0],
  [2024, 8, 29, 2, 45, 0], [1999, 11, 31, 23, 59, 59], [2040, 5, 1, 0, 0, 0], [1970, 0, 1, 0, 0, 0], [2024, 1, 29, 23, 59, 60], [2024, 12, 1, 25, 61, 0]];
const FILTERS = [
  ['moments', `[${T.join(',')}] | map(localtime)`],
  ['moments', `[${T.join(',')}] | map(localtime | mktime)`],
  ['moments', `[${T.join(',')}] | map(strflocaltime("%Y-%m-%dT%H:%M:%S %Z %z"))`],
  ['moments', `[${T.join(',')}] | map(strflocaltime("%a %d %b %Y %I:%M:%S %p %j %U %u %e %y %C %G %V %g %s"))`],
  ['moments', `[${T.join(',')}] | map(strflocaltime("%c | %x | %X | %D | %F | %R | %T | %r | %h"))`],
  ['moments', `[${T.join(',')}] | map(localtime | strftime("%H:%M %Z %z"))`],
  ['moments', `[${T.join(',')}] | map(localtime | todate)`],
  ['moments', `[${T.join(',')}] | map(gmtime | strflocaltime("%Y-%m-%d %H:%M:%S %Z %z"))`],
  ['moments', `[${T.join(',')}] | map(strftime("%A, %B %d, %Y %H:%M:%S %Z %z"))`],
  ['moments', `[${T.join(',')}] | map(todate)`],
  ['moments', `[${T.join(',')}] | map(gmtime | mktime)`],
  ['wall', `${JSON.stringify(WALL)} | map(. + [0, 0] | strflocaltime("%Y-%m-%d %H:%M:%S %Z %z %a %j"))`],
  ['wall', `${JSON.stringify(WALL)} | map(. + [0, 0] | mktime)`],
  ['wall', `${JSON.stringify(WALL)} | map(. + [0, 0] | strftime("%Y-%m-%d %H:%M:%S %Z %z"))`],
  ['wall', `${JSON.stringify(WALL)} | map(strflocaltime("%H:%M %Z"))`],
  ['text', `"2024-07-03T12:00:00Z" | fromdate | strflocaltime("%H:%M on %d %B")`],
  ['text', `"2024-12-25T00:00:00Z" | fromdateiso8601 | localtime | .[3]`],
  ['text', `1700000000 | strflocaltime("")`],
  ['text', `1700000000 | strflocaltime("%%Z is %Z, %%z is %z, %% is %%")`],
  ['text', `"x" | try strflocaltime("%Z") catch .`],
  ['text', `[2024,1] | try strflocaltime("%d %B %Z") catch .`],   // a short array: the missing fields are 0
  ['text', `1700000000 | try strflocaltime(5) catch .`],
  ['text', `"x" | try localtime catch .`],
  ['text', `1e18 | try localtime catch .`],
  ['text', `-1e18 | try localtime catch .`],
  ['text', `null | try strflocaltime("%Y") catch .`],
  ['text', `1700000000 | localtime | length`],
  ['text', `1700000000 | [strflocaltime("%Z"), (localtime | strftime("%Z")), strftime("%Z")]`],
  ['text', `"10:15 PM" | strptime("%I:%M %p")`],
  ['text', `"2024-02-29T10:00:00Z" | strptime("%Y-%m-%dT%H:%M:%SZ") | [., mktime, todate]`],
  ['text', `"Mon, 02 Jan 2006 15:04:05" | strptime("%a, %d %b %Y %H:%M:%S") | [., mktime]`],
  ['text', `1700000000 | dateadd("seconds"; 3600), datesub("seconds"; 60), date`],
  ['text', `"2015-03-05T23:51:47Z" | dateadd("seconds"; 86400)`],
];
const cases = [];
for (const z of ZONES) for (const [, f] of FILTERS) {
  const r = spawnSync(JQ, ['-nc', f], { env: { TZ: z }, encoding: 'utf8', maxBuffer: 1 << 26 });
  cases.push({ z, f, o: r.stdout, e: r.stderr, s: r.status });
}
const out = join(dirname(fileURLToPath(import.meta.url)), '../tests/fixtures/jq/localtime.json');
writeFileSync(out, JSON.stringify({ jq: ver, made: 'native jq 1.8.2 with TZ=<zone> (glibc, system tzdata)', cases }));
console.log(`${cases.length} cases (${ZONES.length} zones × ${FILTERS.length} filters) → ${out}`, cases.filter((c) => c.s !== 0).length, 'with a non-zero status');
