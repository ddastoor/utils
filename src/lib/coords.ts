// Coordinates: reading a latitude or a longitude as people write them, and writing them back. No DOM.
//   28.6139   -33.8688   −33.8688   28,6139   28° 36′ 50″ N   28 36 50 N   N 28° 36.834′   28d36m50s   28:36:50
// What cannot be read is refused with the reason — never guessed at.
import { roundDec } from './round';

export type Axis = 'lat' | 'lon';
const NAME = { lat: 'latitude', lon: 'longitude' } as const, MAX = { lat: 90, lon: 180 } as const, OWN = { lat: 'NS', lon: 'EW' } as const;
const EXAMPLE = { lat: '28.6139 or 28° 36′ 50″ N', lon: '77.2090 or 77° 12′ 32″ E' } as const;

/** every spelling of the signs and marks → one */
function tidy(text: string): string {
  let s = text.trim()
    .replace(/[−‒–—﹣－]/g, '-')                 // − ‒ – — ﹣ －
    .replace(/[°º˚]/g, '°')                                   // ° º ˚
    .replace(/[″“”ʺ〃]|''|′′|’’/g, '"') // ″ “ ” ʺ 〃 '' ′′ ’’
    .replace(/[′‘’ʹ´`]/g, "'");                      // ′ ‘ ’ ʹ ´ `
  // words, also straight after a number ("28deg", "36min"): a letter on either side would make another word of them
  const word = (w: string) => new RegExp(String.raw`(?<![a-z])(?:${w})(?![a-z])\.?`, 'gi');
  s = s.replace(word('north|south|east|west'), (w) => w[0].toUpperCase())
    .replace(word('degrees?|degs?'), '°').replace(word('minutes?|mins?'), "'").replace(word('seconds?|secs?'), '"');
  // 28d36m50s — the letters d, m, s as marks, only in this complete lower-case form (a lone "s" is South)
  s = s.replace(/^([^a-z]*\d)\s*d\s*(\d[\d.]*)\s*m(?:\s*(\d[\d.]*)\s*s)?/, (_, d, m, sec) => `${d}°${m}'${sec === undefined ? '' : `${sec}"`}`)
    .replace(/^([^a-z]*\d)\s*d\s*$/, '$1°').replace(/^([^a-z]*\d)\s*d(?=\s*[NSEWnsew]\s*$)/, '$1°');
  // a decimal comma: one comma between digits and no point anywhere
  if (!s.includes('.') && /^[^,]*\d,\d[^,]*$/.test(s)) s = s.replace(',', '.');
  return s.replace(/:/g, ' ');
}

const NUM = String.raw`(\d+(?:\.\d*)?|\.\d+)`;
// degrees [° or a space] minutes [′ or a space] seconds [″] — two numbers always have a mark or a space between them
const FORM = new RegExp(String.raw`^([NSEW])?\s*([+-])?\s*${NUM}(?:(?:\s*°\s*|\s+)${NUM}(?:(?:\s*'\s*|\s+)${NUM}(?:\s*")?|\s*')?|\s*°)?\s*([NSEW])?$`, 'i');

/** One coordinate in degrees: south and west are negative. Throws an Error that says what is wrong. */
export function parseCoord(text: string, axis: Axis): number {
  const name = NAME[axis], Name = name[0].toUpperCase() + name.slice(1);
  if (!String(text ?? '').trim()) throw new Error(`Enter the ${name} — ${EXAMPLE[axis]}.`);
  const pair = splitPair(text);
  if (pair) throw new Error(`This box takes the ${name} alone, and it holds two numbers — put ${axis === 'lat' ? `the second (${pair[1]}) into the longitude box` : `the first (${pair[0]}) into the latitude box`}.`);
  const t = FORM.exec(tidy(text));
  if (!t) throw new Error(`Cannot read "${text.trim()}" as a ${name} — write it like ${EXAMPLE[axis]}.`);
  const [, h1, sign, d, m, sec, h2] = t;
  if (h1 && h2) throw new Error(`${Name}: two direction letters (${h1.toUpperCase()} and ${h2.toUpperCase()}) — one is enough.`);
  const letter = (h1 || h2 || '').toUpperCase();
  if (letter && !OWN[axis].includes(letter)) throw new Error(`The ${name} takes ${axis === 'lat' ? 'N or S' : 'E or W'}, not ${letter} — ${axis === 'lat' ? 'E and W belong to the longitude' : 'N and S belong to the latitude'}.`);
  if (letter && sign === '-') throw new Error(`${Name}: a minus sign and the letter ${letter} together — use one of them.`);
  // the last number may have decimals, the ones before it are whole
  if (m !== undefined && d.includes('.')) throw new Error(`${Name}: degrees with a decimal part cannot be followed by minutes.`);
  if (sec !== undefined && m!.includes('.')) throw new Error(`${Name}: minutes with a decimal part cannot be followed by seconds.`);
  if (m !== undefined && !(+m < 60)) throw new Error(`${Name}: the minutes must be below 60 (${m} was given).`);
  if (sec !== undefined && !(+sec < 60)) throw new Error(`${Name}: the seconds must be below 60 (${sec} was given).`);
  const v = +d + (m === undefined ? 0 : +m / 60) + (sec === undefined ? 0 : +sec / 3600);
  if (!(v <= MAX[axis])) throw new Error(`${Name}: ${trimNum(v)}° is outside the range — a ${name} goes from ${MAX[axis]}° ${OWN[axis][1]} (−${MAX[axis]}) to ${MAX[axis]}° ${OWN[axis][0]}.`);
  return sign === '-' || letter === 'S' || letter === 'W' ? -v || 0 : v;
}
const trimNum = (x: number) => String(parseFloat(x.toFixed(9)));

/** "28.6139, 77.2090", "28°36′50″N 77°12′32″E", "N 28.6 E 77.2" → the two parts, when the text holds a latitude
 *  and a longitude; null when it is one coordinate (or nothing readable). */
export function splitPair(text: string): [string, string] | null {
  const raw = String(text ?? '').trim();
  const ok = (a: string, b: string): [string, string] | null => {
    a = a.trim(); b = b.trim();
    if (!a || !b) return null;
    try { one(a, 'lat'); one(b, 'lon'); return [a, b]; } catch { return null; }
  };
  // a comma or semicolon followed by a space, or between two numbers that have their own decimal points
  const cut = /^(.*?)\s*[,;]\s+(.*)$/.exec(raw) ?? /^([^,;]*\.[^,;]*)[,;]([^,;]*\.[^,;]*)$/.exec(raw) ?? /^(.*?)\s*;\s*(.*)$/.exec(raw);
  if (cut) return ok(cut[1], cut[2]);
  const s = tidy(raw);
  // a direction letter closes the first part (28°36′50″N 77°12′32″E) or opens each part (N 28.6 E 77.2)
  const after = /^(.*?[NS])\s*([^NS]*[EW]|[EW].*)$/i.exec(s) ?? /^([NS][^EW]*?)\s*([EW].*)$/i.exec(s);
  if (after) return ok(after[1], after[2]);
  // two plain decimal numbers with a space between them
  const two = /^([+-]?\d+\.\d+)\s+([+-]?\d+\.\d+)$/.exec(s);
  return two ? ok(two[1], two[2]) : null;
}
/** parse without the pair check (the parts of a pair) */
function one(text: string, axis: Axis): number {
  const t = FORM.exec(tidy(text));
  if (!t) throw new Error('unreadable');
  const [, h1, sign, d, m, sec, h2] = t, letter = (h1 || h2 || '').toUpperCase();
  if ((h1 && h2) || (letter && !OWN[axis].includes(letter)) || (letter && sign === '-')) throw new Error('letters');
  if ((m !== undefined && (d.includes('.') || !(+m < 60))) || (sec !== undefined && (m!.includes('.') || !(+sec < 60)))) throw new Error('parts');
  const v = +d + (m === undefined ? 0 : +m / 60) + (sec === undefined ? 0 : +sec / 3600);
  if (!(v <= MAX[axis])) throw new Error('range');
  return v;
}

const hemi = (v: number, axis: Axis) => (axis === 'lat' ? (v < 0 ? 'S' : 'N') : v < 0 ? 'W' : 'E');
/** decimal degrees with six decimals (about 0.1 m), a plain minus sign so that it can be pasted anywhere */
export function toDecimal(v: number): string { return (roundDec(v, 6) || 0).toFixed(6); }
/** 28° 36′ 50.04″ N — seconds with two decimals (about 0.3 m); never 60.00″ */
export function toDMS(v: number, axis: Axis): string {
  const t = roundDec(Math.abs(v) * 360000, 0), d = Math.floor(t / 360000), m = Math.floor((t % 360000) / 6000), s = (t % 6000) / 100;
  return `${d}° ${m}′ ${s.toFixed(2)}″ ${hemi(t ? v : 0, axis)}`;
}
/** 28° 36.8340′ N — degrees and decimal minutes, as GPS sets and charts write them; never 60.0000′ */
export function toDDM(v: number, axis: Axis): string {
  const t = roundDec(Math.abs(v) * 600000, 0), d = Math.floor(t / 600000), m = (t % 600000) / 10000;
  return `${d}° ${m.toFixed(4)}′ ${hemi(t ? v : 0, axis)}`;
}
const WINDS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const;
/** the nearest of the sixteen compass points to a bearing in degrees */
export const compassPoint = (bearing: number) => WINDS[Math.round((((bearing % 360) + 360) % 360) / 22.5) % 16];
/** a bearing with one decimal: 359.96 is 0.0, never 360.0 */
export function bearingText(bearing: number): string {
  const b = Math.round(((bearing % 360) + 360) % 360 * 10) / 10 % 360;
  return `${b.toFixed(1)}° (${compassPoint(b)})`;
}
/** exactly opposite points (the poles whatever their longitudes): more than one way is the shortest */
export const antipodal = (lat1: number, lon1: number, lat2: number, lon2: number) => lat1 === -lat2 && (Math.abs(lat1) === 90 || Math.abs(Math.abs(lon1 - lon2) - 180) < 1e-12);
