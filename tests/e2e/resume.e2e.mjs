// Resume Builder (#/resume): three templates, paper sizes, jobs/education/projects, photo, long resumes flow to more pages.
import { pdfDoc } from '../lib/docgen-check.mjs';
const I = (n) => new URL(`../fixtures/images/${n}`, import.meta.url).pathname;
export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto(base + '#/resume');
  await page.waitForFunction(() => /\d+ pages? · \d+ KB/.test(document.querySelector('[aria-live="polite"].muted')?.textContent || ''), null, { timeout: 60000 });
  const pdf = async () => pdfDoc(await download(page, () => page.getByRole('button', { name: 'Download PDF' }).click()));
  await page.getByLabel('Full name').fill('Asha Rao');
  await page.getByLabel('Headline').fill('Data Engineer');
  await page.getByLabel('Role').first().fill('Senior Data Engineer');
  await page.getByLabel('Company').first().fill('Acme Analytics');
  await page.getByLabel('What you did (one point per line)').first().fill('Built pipelines for 2 TB/day\nCut costs by 30 %');
  let d = await pdf();
  ok(d.pages.length === 1 && d.pages[0].w === 595 && /Asha Rao/.test(d.text) && /Senior Data Engineer/.test(d.text) && /Cut costs by 30 %/.test(d.text), 'classic A4 resume with the details');
  ok(/Asha Rao/.test(d.title || ''), `PDF title set (${d.title})`);
  await page.getByRole('radio', { name: 'Modern (two columns)' }).click();
  await page.getByRole('radio', { name: 'Letter' }).click();
  d = await pdf();
  ok(d.pages[0].w === 612 && d.pages[0].h === 792 && /profile/i.test(d.text) && /Skill one/.test(d.text), 'modern template on US Letter');
  await page.locator('input[type=file]').first().setInputFiles(I('astronaut.png'));
  await page.waitForTimeout(600);
  d = await pdf();
  ok(d.images >= 1, 'photo included');
  await page.getByRole('radio', { name: 'Compact' }).click();
  for (let k = 0; k < 9; k++) await page.getByRole('button', { name: 'Add job' }).click();
  const roles = page.getByLabel('Role'), pts = page.getByLabel('What you did (one point per line)');
  for (let k = 1; k < 10; k++) { await roles.nth(k).fill(`Role number ${k}`); await pts.nth(k).fill(Array.from({ length: 6 }, (_, j) => `Result ${k}.${j} with a measurable outcome and enough words to wrap the line`).join('\n')); }
  d = await pdf();
  ok(d.pages.length >= 2 && /Role number 9/.test(d.text), `long resume flows onto ${d.pages.length} pages`);
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/resume');
  await phone.waitForFunction(() => /\d+ pages? · \d+ KB/.test(document.querySelector('[aria-live="polite"].muted')?.textContent || ''), null, { timeout: 60000 });
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
