// The document generators' rules, apart from the page (so the unit suite can hold them): GST states and rates, rent
// months and what stops them, file names made of what was typed, and the links put into the PDFs.
import { esc } from './htmlpdf';
type Obj = Record<string, any>;

/** A file name made of what the user typed: no characters a file system refuses. */
export const safeName = (s: string, fallback: string) => String(s || '').trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, '-').replace(/^[.-]+|[.]+$/g, '').slice(0, 80) || fallback;

/** Links in the PDF (MuPDF keeps them as link annotations): an e-mail address, a phone number, a web address. */
export const mailLink = (e: string) => { const t = String(e).trim(); return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(t) ? `<a href="mailto:${esc(t)}">${esc(t)}</a>` : esc(t); };
export const telLink = (p: string) => { const t = String(p).trim(), d = t.replace(/[^\d+]/g, ''); return /^\+?\d{6,15}$/.test(d) ? `<a href="tel:${esc(d)}">${esc(t)}</a>` : esc(t); };
export const webLinks = (s: string) => String(s).split(/(\s*[,;]\s*|\s+)/).map((w) => {
  if (!w.trim() || /^[\s,;]+$/.test(w)) return esc(w);
  const href = /^https?:\/\//i.test(w) ? w : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(w) ? `https://${w}` : '';
  return href ? `<a href="${esc(href)}">${esc(w)}</a>` : esc(w);
}).join('');

/** GST state codes; UTGST applies in the union territories without a legislature. */
export const STATES: Array<[string, string, boolean?]> = [
  ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh', true], ['05', 'Uttarakhand'], ['06', 'Haryana'],
  ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'],
  ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'], ['20', 'Jharkhand'],
  ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'], ['26', 'Dadra and Nagar Haveli and Daman and Diu', true],
  ['27', 'Maharashtra'], ['29', 'Karnataka'], ['30', 'Goa'], ['31', 'Lakshadweep', true], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'],
  ['35', 'Andaman and Nicobar Islands', true], ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh', true], ['97', 'Other Territory'], ['96', 'Outside India (export)'],
];
export const GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];

export function rentMonths(from: string, to: string): Array<{ start: Date; end: Date }> {
  const out: Array<{ start: Date; end: Date }> = [];
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) return out;
  let [y, mo] = from.split('-').map(Number); const [ty, tm] = to.split('-').map(Number);
  while ((y < ty || (y === ty && mo <= tm)) && out.length <= MAX_MONTHS) { out.push({ start: new Date(y, mo - 1, 1), end: new Date(y, mo, 0) }); mo++; if (mo > 12) { mo = 1; y++; } }
  return out;
}
/** Receipts made at once: ten years (it stopped at 36 without a word). */
export const MAX_MONTHS = 120;
/** Why the months cannot be made, or '' (also used under the boxes). */
export function rentProblem(s: Obj): string {
  if (!/^\d{4}-\d{2}$/.test(String(s.from)) || !/^\d{4}-\d{2}$/.test(String(s.to))) return 'Choose the from and to months.';
  if (s.to < s.from) return 'The last month is before the first.';
  if (rentMonths(s.from, s.to).length > MAX_MONTHS) return `At most ${MAX_MONTHS} months (ten years) at a time.`;
  if (!(+s.rent > 0)) return 'Enter the monthly rent.';
  return '';
}
