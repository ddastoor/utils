// Builds a small AcroForm PDF for the Fill PDF Form tests: text, multi-line text, checkbox, radio group, combo box,
// a read-only field — with MuPDF in Node (the pypdf corpus only has a single text field).
export async function makeForm() {
  const m = await import('mupdf');
  const doc = new m.PDFDocument();
  const helv = doc.addSimpleFont(new m.Font('Helvetica'));
  const pageObj = doc.addPage([0, 0, 595, 842], 0, { Font: { Helv: helv } }, 'BT /Helv 18 Tf 50 790 Td (Application form) Tj ET');
  doc.insertPage(-1, pageObj);
  const page = doc.findPage(0);
  const fields = [], annots = doc.newArray();
  const ap = (on) => doc.addStream(on ? 'q 0 g 2 2 10 10 re f Q' : '', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 14, 14] });
  const add = (d) => { const o = doc.addObject({ Type: 'Annot', Subtype: 'Widget', F: 4, P: page, DA: '(/Helv 11 Tf 0 g)', ...d }); fields.push(o); annots.push(o); return o; };
  add({ FT: 'Tx', T: '(full_name)', TU: '(Full name)', Rect: [50, 730, 350, 750] });
  add({ FT: 'Tx', T: '(address)', TU: '(Address)', Ff: 4096, Rect: [50, 660, 350, 720] });
  add({ FT: 'Btn', T: '(agree)', TU: '(I agree)', Rect: [50, 620, 64, 634], V: 'Off', AS: 'Off', AP: { N: { Yes: ap(true), Off: ap(false) } } });
  const radio = doc.addObject({ FT: 'Btn', Ff: 49152, T: '(gender)', TU: '(Gender)', V: 'Off', Kids: [] });
  for (const [i, s] of ['Male', 'Female'].entries()) {
    const k = doc.addObject({ Type: 'Annot', Subtype: 'Widget', F: 4, P: page, Parent: radio, Rect: [50 + i * 80, 580, 64 + i * 80, 594], AS: 'Off', AP: { N: { [s]: ap(true), Off: ap(false) } } });
    radio.get('Kids').push(k); annots.push(k);
  }
  fields.push(radio);
  add({ FT: 'Ch', T: '(state)', TU: '(State)', Ff: 131072, Opt: ['(Maharashtra)', '(Karnataka)', '(Delhi)'], Rect: [50, 530, 250, 550] });
  add({ FT: 'Tx', T: '(ref)', TU: '(Reference)', Ff: 1, V: '(ABC-123)', Rect: [50, 490, 250, 510] });
  page.put('Annots', annots);
  const af = doc.newArray(); for (const f of fields) af.push(f);
  doc.getTrailer().get('Root').put('AcroForm', { Fields: af, DA: '(/Helv 11 Tf 0 g)', DR: { Font: { Helv: helv } }, NeedAppearances: true });
  return doc.saveToBuffer('compress').asUint8Array().slice();
}
