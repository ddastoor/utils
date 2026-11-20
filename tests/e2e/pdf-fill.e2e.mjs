// Fill PDF Form (#/pdf-fill): a generated AcroForm (text, multi-line, checkbox, radio group, combo box, read-only) and
// pypdf's real form.pdf; values read back with MuPDF in Node; flatten; type anywhere on a PDF without fields.
import { readFileSync, writeFileSync } from 'node:fs';
import { makeForm } from '../lib/makeform.mjs';
import { pdfInfo, renderGrey } from '../lib/pdfcheck.mjs';
const P = (n) => new URL(`../fixtures/pdf/${n}`, import.meta.url).pathname;
export default async ({ base, page: newPage, ok, download, tmp, devices }) => {
  const m = await import('mupdf');
  const values = (f) => { const d = m.Document.openDocument(readFileSync(f), 'application/pdf').asPDF(), v = {}; for (const w of d.loadPage(0).getWidgets()) { const n = w.getName(); if (!(n in v) || w.getValue() !== 'Off') v[n] = w.getValue(); } return v; };
  const form = `${tmp}/application.pdf`; writeFileSync(form, await makeForm());
  const page = await newPage({ viewport: { width: 1280, height: 1500 } });
  await page.goto(base + '#/pdf-fill');
  await page.locator('input[type=file]').first().setInputFiles(form);
  await page.getByText('6 form fields found.').waitFor();
  ok(true, 'six fields found (radio buttons grouped)');
  ok(await page.getByLabel('Reference').isDisabled(), 'read-only field shown but locked');
  ok(await page.locator('[role=radio][aria-checked=true]', { hasText: /^(Male|Female)$/ }).count() === 0, 'a radio group with nothing chosen shows nothing chosen (it showed "Male" chosen and saved nothing)');
  await page.getByLabel('Full name').fill('Asha Rao');
  await page.getByLabel('Address').fill('12 MG Road\nBengaluru');
  await page.getByText('I agree').click();
  await page.getByRole('radio', { name: 'Female' }).click();
  await page.getByLabel('State').selectOption('Karnataka');
  const save = () => download(page, () => page.getByRole('button', { name: 'Save filled PDF' }).click());
  const f1 = await save(), v1 = values(f1);
  ok(v1.full_name === 'Asha Rao' && /MG Road/.test(v1.address), `text fields filled (${JSON.stringify(v1.full_name)})`);
  await page.getByLabel('Full name').fill('Rent ₹ 5,000');
  const fr = await save();
  ok(values(fr).full_name === 'Rent ₹ 5,000' && await page.locator('.toast', { hasText: 'this form’s font has no ₹' }).count() === 1, 'a ₹ in a field: saved in the value, and the tab says the form\'s font may show a gap ("Rs." everywhere)');
  await page.getByLabel('Full name').fill('Asha Rao');
  ok(v1.agree !== 'Off' && v1.agree !== '', `checkbox ticked (${v1.agree})`);
  ok(v1.gender === 'Female', `radio group set (${v1.gender})`);
  ok(v1.state === 'Karnataka', `combo box set (${v1.state})`);
  ok(v1.ref === 'ABC-123', 'read-only field unchanged');
  // the field's appearance is drawn: its box (PDF rect 50,730–350,750 on a 595×842 page) gets ink
  const e1 = await renderGrey(form, 0, 1), g1 = await renderGrey(f1, 0, 1);
  ok(g1.dark(0.084, 0.109, 0.588, 0.133) > e1.dark(0.084, 0.109, 0.588, 0.133) + 0.01, 'filled values are visible on the page');
  // flatten: no fields left, values printed
  await page.getByText('Flatten (the result can no longer be edited)').click();
  const f2 = await save(), d2 = m.Document.openDocument(readFileSync(f2), 'application/pdf').asPDF();
  ok(d2.loadPage(0).getWidgets().length === 0 && /Asha Rao/.test((await pdfInfo(f2)).list[0].text), 'flattened: no fields, text kept');
  // pypdf's real form
  await page.getByText('Flatten (the result can no longer be edited)').click();
  await page.locator('input[type=file]').first().setInputFiles(P('form.pdf'));
  await page.getByText('1 form field found.').waitFor();
  await page.getByLabel('foo').fill('bar 42');
  ok(values(await save()).foo === 'bar 42', 'real-world form field filled');
  // type anywhere (no fields)
  await page.locator('input[type=file]').first().setInputFiles(P('crazyones.pdf'));
  await page.getByText('No form fields in this PDF').waitFor();
  await page.getByText('Page 1 of 1').waitFor();
  await page.evaluate(() => { const r = document.querySelector('.pdfs-canvas').getBoundingClientRect(); scrollBy(0, r.top - 400); });
  const cb = await page.locator('.pdfs-canvas').boundingBox();
  await page.mouse.click(cb.x + cb.width * 0.1, cb.y + cb.height * 0.04);
  await page.getByPlaceholder('Type here').fill('Received – OK ✓ (not ✗)');
  const f3 = await save(), t3 = (await pdfInfo(f3)).list[0].text, g3 = await renderGrey(f3, 0, 1), o3 = await renderGrey(P('crazyones.pdf'), 0, 1);
  ok(/Received – OK ✓ \(not ✗\)/.test(t3), `typed text is real text in the PDF, ticks too (ZapfDingbats; they were refused as "not Latin"): ${JSON.stringify(t3.slice(0, 40))}`);
  ok(g3.dark(0.08, 0.03, 0.45, 0.08) > o3.dark(0.08, 0.03, 0.45, 0.08) + 0.002, 'typed text placed where clicked');
  await page.getByPlaceholder('Type here').fill('नमस्ते');
  await page.getByRole('button', { name: 'Save filled PDF' }).click();
  ok(await page.getByText('Latin letters and the ticks').count() >= 1, 'non-Latin typed text explained (ticks are allowed)');
  const real = page.errors.filter((e) => !/Latin letters and the ticks/.test(e));
  ok(real.length === 0, `no unexpected page errors: ${real.join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/pdf-fill');
  await phone.locator('input[type=file]').first().setInputFiles(form);
  await phone.getByText('6 form fields found.').waitFor();
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
