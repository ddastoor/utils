// PDF Watermark (#/pdf-watermark): vector text (searchable), opacity, tiled, colours, and non-Latin text as an image.
import { pdfInfo, renderGrey } from '../lib/pdfcheck.mjs';
import { makeLong, raceRun } from '../lib/pdfannot.mjs';
const P = (n) => new URL(`../fixtures/pdf/${n}`, import.meta.url).pathname;
export default async ({ base, page: newPage, ok, download, devices, tmp }) => {
  const page = await newPage();
  await page.goto(base + '#/pdf-watermark');
  const go = () => download(page, () => page.getByRole('button', { name: 'Add watermark' }).click());
  await page.locator('input[type=file]').first().setInputFiles(P('crazyones.pdf'));
  await page.getByText('crazyones.pdf: 1 page').waitFor();
  const f1 = await go(), i1 = await pdfInfo(f1), o = await renderGrey(P('crazyones.pdf'), 0, 1), g = await renderGrey(f1, 0, 1);
  ok(/CONFIDENTIAL/.test(i1.list[0].text) && /Crazy Ones/.test(i1.list[0].text), 'watermark is real text; page text kept');
  ok(g.mean(0.3, 0.4, 0.7, 0.6) < o.mean(0.3, 0.4, 0.7, 0.6) - 2, `centre is shaded by the watermark (${o.mean(0.3, 0.4, 0.7, 0.6).toFixed(1)} → ${g.mean(0.3, 0.4, 0.7, 0.6).toFixed(1)})`);
  ok(g.mean(0, 0, 0.08, 0.08) > 250, 'corners untouched (single, centred)');
  // stronger opacity darkens more
  await page.evaluate(() => { const r = [...document.querySelectorAll('.slider')].find((s) => s.textContent.includes('Opacity')).querySelector('input'); r.value = 70; r.dispatchEvent(new Event('input')); });
  const g2 = await renderGrey(await go(), 0, 1);
  ok(g2.mean(0.3, 0.4, 0.7, 0.6) < g.mean(0.3, 0.4, 0.7, 0.6) - 2, 'higher opacity → darker watermark');
  // tiled covers the corners too
  await page.getByText('Repeat across the page (tiled)').click();
  const f3 = await go(), g3 = await renderGrey(f3, 0, 1);
  ok(g3.dark(0, 0, 0.3, 0.3, 245) > 0.02, 'tiled watermark reaches the corners');
  const copies = ((await pdfInfo(f3)).list[0].text.match(/CONFIDENTIAL/g) || []).length;
  ok(copies >= 6, `tiled: many copies (${copies})`);
  // Hindi text → drawn as an image (any script), still visible
  await page.getByText('Repeat across the page (tiled)').click();
  await page.getByRole('textbox').first().fill('गोपनीय');
  const f4 = await go(), g4 = await renderGrey(f4, 0, 1);
  ok(!/गोपनीय/.test((await pdfInfo(f4)).list[0].text) && g4.mean(0.3, 0.4, 0.7, 0.6) < o.mean(0.3, 0.4, 0.7, 0.6) - 2, 'non-Latin watermark drawn as an image');
  await page.getByRole('textbox').first().fill('');
  await page.getByRole('button', { name: 'Add watermark' }).click();
  ok(await page.getByText('Type the watermark text').count() >= 1, 'empty text refused');
  const real = page.errors.filter((e) => !/Type the watermark text/.test(e));
  ok(real.length === 0, `no unexpected page errors: ${real.join(' | ')}`);
  // a long PDF: progress shown; another PDF chosen during the run gets no result (it got the first one's pages under
  // its own name); leaving the tab during a run downloads nothing afterwards
  const race = await raceRun(newPage, base, '#/pdf-watermark', 'Add watermark', await makeLong(tmp, 900), P('crazyones.pdf'));
  ok(race.progress, 'a 900-page PDF: "Page n of 900…" while it runs');
  ok(race.afterSwitch === 0, `another PDF chosen during the run: no download (${race.afterSwitch})`);
  ok(race.afterLeave === 0, `the tab left during a run: no download afterwards (${race.afterLeave})`);
  ok(race.errors.length === 0, `no page errors in those runs: ${race.errors.join(' | ')}`);
  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/pdf-watermark');
  ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: no horizontal scroll');
};
