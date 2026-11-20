// Upload specs for Indian exam / job / government portals (owner lives in India). Only widely published, stable
// specs are included; every value is editable in the tool and the UI tells the user to confirm with the current
// official notification (portals change rules between cycles).
export type Kind = 'photo' | 'signature' | 'thumb' | 'declaration';
export interface Item { kind: Kind; w: number; h: number; minKB: number; maxKB: number; dpi?: number; note?: string }
export interface FormSpec { id: string; name: string; org: string; items: Item[]; note?: string }

export const FORM_SPECS: FormSpec[] = [
  {
    id: 'ibps', name: 'IBPS / SBI / RBI bank exams', org: 'IBPS PO/Clerk/SO/RRB, SBI PO/Clerk, RBI Assistant',
    items: [
      { kind: 'photo', w: 200, h: 230, minKB: 20, maxKB: 50, note: 'Recent colour passport-style photo, light background' },
      { kind: 'signature', w: 140, h: 60, minKB: 10, maxKB: 20, note: 'Black ink on white paper; not in capital letters' },
      { kind: 'thumb', w: 240, h: 240, minKB: 20, maxKB: 50, note: 'Left thumb impression, black or blue ink on white paper' },
      { kind: 'declaration', w: 800, h: 400, minKB: 50, maxKB: 100, note: 'Handwritten declaration in English, black ink' },
    ],
  },
  {
    id: 'ssc', name: 'SSC (CGL, CHSL, MTS, GD…)', org: 'Staff Selection Commission',
    items: [
      { kind: 'photo', w: 413, h: 531, minKB: 20, maxKB: 50, dpi: 300, note: '3.5 × 4.5 cm, no cap or spectacles, plain light background' },
      { kind: 'signature', w: 472, h: 236, minKB: 10, maxKB: 20, dpi: 300, note: '4.0 × 2.0 cm' },
    ],
    note: 'Recent SSC forms may ask for a live photo taken in the app — use this for the uploaded copy.',
  },
  {
    id: 'upsc', name: 'UPSC (CSE, ESE, CDS, NDA…)', org: 'Union Public Service Commission (OTR)',
    items: [
      { kind: 'photo', w: 413, h: 531, minKB: 20, maxKB: 300, dpi: 300, note: 'Each side between 350 and 1000 px; recent photo' },
      { kind: 'signature', w: 700, h: 350, minKB: 20, maxKB: 300, dpi: 300, note: 'Each side between 350 and 1000 px' },
    ],
    note: 'Some UPSC notices also require your name and the date printed on the photo — check the notice.',
  },
  {
    id: 'nta', name: 'NTA (JEE Main, NEET UG, CUET)', org: 'National Testing Agency',
    items: [
      { kind: 'photo', w: 413, h: 531, minKB: 10, maxKB: 200, dpi: 300, note: 'Face ~80% of the photo, white background, ears visible' },
      { kind: 'signature', w: 400, h: 160, minKB: 4, maxKB: 30, dpi: 300, note: 'Running signature, black/blue ink on white paper' },
    ],
    note: 'NTA sets file-size limits but not exact pixels; this size is a safe 3.5 × 4.5 cm.',
  },
  {
    id: 'pan', name: 'PAN card (Protean / NSDL online)', org: 'Income Tax PAN application',
    items: [
      { kind: 'photo', w: 295, h: 413, minKB: 4, maxKB: 50, dpi: 300, note: '2.5 × 3.5 cm at 300 dpi' },
      { kind: 'signature', w: 1063, h: 472, minKB: 4, maxKB: 50, dpi: 600, note: '4.5 × 2 cm at 600 dpi' },
    ],
  },
];
export const KIND_LABEL: Record<Kind, string> = { photo: 'Photo', signature: 'Signature', thumb: 'Thumb impression', declaration: 'Declaration' };

/** The bytes a "KB" limit allows, read the strict way: portals differ — some count 1 KB as 1,000 bytes, some as 1,024 —
 *  so the maximum is maxKB × 1,000 and the minimum minKB × 1,024 (a file between them passes either reading). When the
 *  two readings leave no room (e.g. 50 – 50 KB) the minimum is read as minKB × 1,000. */
export function kbRange(minKB: number, maxKB: number) {
  const max = Math.floor(maxKB * 1000);
  let min = Math.ceil(minKB * 1024);
  if (min > max) min = Math.ceil(minKB * 1000);
  return { min, max };
}
