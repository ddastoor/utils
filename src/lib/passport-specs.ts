// Passport / visa / ID photo specifications. Reviewed 2026-11 from official guidance as known at build time.
// Rules change — the tool tells users to confirm with the issuing authority before submitting.
// Head height = chin to crown (top of hair). Background hex = the colour the tool fills.

export interface BgSpec { name: string; hex: string; rule: string }
export interface PhotoSpec {
  id: string; country: string; doc: string; region: 'India' | 'Americas' | 'Europe' | 'Asia-Pacific' | 'Middle East & Africa';
  w: number; h: number;                 // print size, mm
  head?: [number, number];              // chin-to-crown, mm
  bg: BgSpec;
  bgAlt?: BgSpec[];                     // other accepted backgrounds
  digital?: { minPx?: [number, number]; maxPx?: [number, number]; exactPx?: [number, number]; minKB?: number; maxKB?: number; square?: boolean };
  notes?: string;
}

export const BG = {
  white: { name: 'White', hex: '#ffffff', rule: 'Plain white, no shadows or patterns' },
  offWhite: { name: 'Off-white', hex: '#f5f5f0', rule: 'Plain white or off-white' },
  lightGrey: { name: 'Light grey', hex: '#dcdfe2', rule: 'Plain light grey' },
  cream: { name: 'Cream', hex: '#f3ead7', rule: 'Plain cream' },
  lightBlue: { name: 'Light blue', hex: '#d9e6f2', rule: 'Plain light blue' },
  light: { name: 'Light (white/light grey)', hex: '#f2f2f2', rule: 'Plain, uniform, light-coloured' },
  blue: { name: 'Blue', hex: '#3d6fb6', rule: 'Plain blue' },
  red: { name: 'Red', hex: '#c8102e', rule: 'Plain red' },
} satisfies Record<string, BgSpec>;

export const SPECS: PhotoSpec[] = [
  // ---------------------------------------------------------------- India (owner's country, listed first)
  { id: 'in-passport', country: 'India', doc: 'Passport (Passport Seva)', region: 'India', w: 35, h: 45, head: [31.5, 36], bg: BG.white, notes: 'Face covers 70–80% of the photo; eyes open, neutral expression, no glasses glare.' },
  { id: 'in-visa', country: 'India', doc: 'Visa / e-Visa', region: 'India', w: 51, h: 51, head: [25, 35], bg: BG.white, bgAlt: [BG.offWhite], digital: { minPx: [350, 350], maxPx: [1000, 1000], minKB: 10, maxKB: 1024, square: true }, notes: 'e-Visa upload: square JPEG, 350–1000 px, 10 KB–1 MB.' },
  { id: 'in-oci', country: 'India', doc: 'OCI card', region: 'India', w: 51, h: 51, head: [25, 35], bg: BG.white, bgAlt: [BG.light], digital: { minPx: [200, 200], maxPx: [1500, 1500], minKB: 20, maxKB: 1024, square: true }, notes: 'OCI upload: square JPEG, 200–1500 px, 20 KB–1 MB.' },
  { id: 'in-form', country: 'India', doc: 'Exam / job form photo (typical)', region: 'India', w: 35, h: 45, head: [25, 34], bg: BG.white, bgAlt: [BG.light], digital: { minKB: 20, maxKB: 50 }, notes: 'Many portals (SSC, IBPS, state PSCs) ask 3.5×4.5 cm, 20–50 KB JPEG — check the notification. Use Photo & Signature Resizer for exact portal presets.' },

  // ---------------------------------------------------------------- Americas
  { id: 'us-passport', country: 'United States', doc: 'Passport & Visa (DS-160)', region: 'Americas', w: 51, h: 51, head: [25, 35], bg: BG.white, bgAlt: [BG.offWhite], digital: { minPx: [600, 600], maxPx: [1200, 1200], maxKB: 240, square: true }, notes: 'Eyes 28–35 mm from the bottom. No glasses. Visa upload: square JPEG 600–1200 px, ≤240 KB.' },
  { id: 'ca-passport', country: 'Canada', doc: 'Passport', region: 'Americas', w: 50, h: 70, head: [31, 36], bg: BG.white, bgAlt: [BG.light], notes: 'Plain white or light-coloured background with uniform lighting.' },
  { id: 'ca-visa', country: 'Canada', doc: 'Visa / PR / citizenship (IRCC)', region: 'Americas', w: 35, h: 45, head: [31, 36], bg: BG.white, bgAlt: [BG.light] },

  // ---------------------------------------------------------------- Europe
  { id: 'uk-passport', country: 'United Kingdom', doc: 'Passport', region: 'Europe', w: 35, h: 45, head: [29, 34], bg: BG.lightGrey, bgAlt: [BG.cream], digital: { minPx: [600, 750] }, notes: 'Background must be plain cream or plain light grey — white is not listed. Online: at least 600 × 750 px.' },
  { id: 'uk-visa', country: 'United Kingdom', doc: 'Visa', region: 'Europe', w: 35, h: 45, head: [29, 34], bg: BG.lightGrey, bgAlt: [BG.cream] },
  { id: 'schengen', country: 'Schengen area', doc: 'Schengen visa', region: 'Europe', w: 35, h: 45, head: [32, 36], bg: BG.light, bgAlt: [BG.white, BG.lightGrey], notes: 'Face 70–80% of the height (ICAO). Used by all 29 Schengen states.' },
  { id: 'ie-passport', country: 'Ireland', doc: 'Passport', region: 'Europe', w: 35, h: 45, head: [32, 36], bg: BG.white, bgAlt: [BG.lightGrey] },
  { id: 'de-passport', country: 'Germany', doc: 'Passport / ID card', region: 'Europe', w: 35, h: 45, head: [32, 36], bg: BG.lightGrey, bgAlt: [BG.light], notes: 'Plain light background; light grey is ideal.' },
  { id: 'fr-passport', country: 'France', doc: 'Passport / ID card', region: 'Europe', w: 35, h: 45, head: [32, 36], bg: BG.lightBlue, bgAlt: [BG.lightGrey], notes: 'Plain light blue or light grey. A white background is NOT accepted.' },
  { id: 'it-passport', country: 'Italy', doc: 'Passport', region: 'Europe', w: 35, h: 45, head: [32, 36], bg: BG.white, bgAlt: [BG.light] },
  { id: 'es-passport', country: 'Spain', doc: 'Passport / DNI', region: 'Europe', w: 26, h: 32, bg: BG.white, notes: 'Spain uses 32 × 26 mm for the passport and DNI (not 35 × 45).' },
  { id: 'nl-passport', country: 'Netherlands', doc: 'Passport / ID card', region: 'Europe', w: 35, h: 45, head: [26, 30], bg: BG.lightGrey, bgAlt: [BG.lightBlue], notes: 'Plain, evenly coloured light background (not pure white).' },
  { id: 'ru-passport', country: 'Russia', doc: 'Passport / visa', region: 'Europe', w: 35, h: 45, head: [32, 36], bg: BG.white, bgAlt: [BG.light] },

  // ---------------------------------------------------------------- Asia-Pacific
  { id: 'au-passport', country: 'Australia', doc: 'Passport', region: 'Asia-Pacific', w: 35, h: 45, head: [32, 36], bg: BG.white, bgAlt: [BG.lightGrey], notes: 'Plain white or light grey background.' },
  { id: 'nz-passport', country: 'New Zealand', doc: 'Passport', region: 'Asia-Pacific', w: 35, h: 45, head: [32, 36], bg: BG.lightGrey, bgAlt: [BG.white], digital: { minPx: [900, 1200], maxPx: [2250, 3000] }, notes: 'Online: 900 × 1200 to 2250 × 3000 px, plain light background.' },
  { id: 'cn-passport', country: 'China', doc: 'Passport / visa', region: 'Asia-Pacific', w: 33, h: 48, head: [28, 33], bg: BG.white, digital: { minPx: [354, 472], maxPx: [420, 560], minKB: 40, maxKB: 120 }, notes: 'Visa upload: 354 × 472 to 420 × 560 px, 40–120 KB.' },
  { id: 'jp-passport', country: 'Japan', doc: 'Passport', region: 'Asia-Pacific', w: 35, h: 45, head: [32, 36], bg: BG.white, bgAlt: [BG.light] },
  { id: 'kr-passport', country: 'South Korea', doc: 'Passport', region: 'Asia-Pacific', w: 35, h: 45, head: [32, 36], bg: BG.white },
  { id: 'sg-passport', country: 'Singapore', doc: 'Passport / ICA', region: 'Asia-Pacific', w: 35, h: 45, head: [25, 35], bg: BG.white, digital: { exactPx: [400, 514] }, notes: 'ICA online: exactly 400 × 514 px, plain white background.' },
  { id: 'my-passport', country: 'Malaysia', doc: 'Passport', region: 'Asia-Pacific', w: 35, h: 50, bg: BG.white },
  { id: 'hk-passport', country: 'Hong Kong', doc: 'Passport / ID', region: 'Asia-Pacific', w: 40, h: 50, head: [32, 36], bg: BG.white },
  { id: 'tw-passport', country: 'Taiwan', doc: 'Passport', region: 'Asia-Pacific', w: 35, h: 45, head: [32, 36], bg: BG.white },
  { id: 'vn-visa', country: 'Vietnam', doc: 'Visa', region: 'Asia-Pacific', w: 40, h: 60, bg: BG.white },
  { id: 'lk-passport', country: 'Sri Lanka', doc: 'Passport', region: 'Asia-Pacific', w: 35, h: 45, bg: BG.white, bgAlt: [BG.light] },
  { id: 'np-passport', country: 'Nepal', doc: 'Passport / visa', region: 'Asia-Pacific', w: 35, h: 45, bg: BG.white },
  { id: 'pk-visa', country: 'Pakistan', doc: 'Visa / NICOP', region: 'Asia-Pacific', w: 35, h: 45, bg: BG.white },

  // ---------------------------------------------------------------- Middle East & Africa
  { id: 'ae-visa', country: 'United Arab Emirates', doc: 'Visa / Emirates ID', region: 'Middle East & Africa', w: 43, h: 55, bg: BG.white },
  { id: 'sa-visa', country: 'Saudi Arabia', doc: 'Visa / Iqama', region: 'Middle East & Africa', w: 40, h: 60, bg: BG.white },
  { id: 'tr-passport', country: 'Turkey', doc: 'Passport / ID', region: 'Middle East & Africa', w: 50, h: 60, bg: BG.white },
  { id: 'il-passport', country: 'Israel', doc: 'Passport', region: 'Middle East & Africa', w: 35, h: 45, bg: BG.white },
  { id: 'eg-visa', country: 'Egypt', doc: 'Passport / visa', region: 'Middle East & Africa', w: 40, h: 60, bg: BG.white },
  { id: 'za-passport', country: 'South Africa', doc: 'Passport', region: 'Middle East & Africa', w: 35, h: 45, bg: BG.white, bgAlt: [BG.offWhite] },
  { id: 'ng-passport', country: 'Nigeria', doc: 'Passport / visa', region: 'Middle East & Africa', w: 35, h: 45, bg: BG.white },
];

/** Background choices offered for Custom sizes (some forms ask for blue or red, e.g. certain ID cards). */
export const CUSTOM_BGS: BgSpec[] = [BG.white, BG.offWhite, BG.lightGrey, BG.cream, BG.lightBlue, BG.blue, BG.red];

/** Pixel size at a given print resolution. */
export const pxAt = (mm: number, dpi = 300) => Math.round((mm / 25.4) * dpi);
