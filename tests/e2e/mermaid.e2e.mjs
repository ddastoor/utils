// Mermaid Diagrams (#/mermaid, PC only): every sample renders to an SVG containing its labels, edits re-render, a syntax
// error is reported (and the last good diagram kept), labels with HTML are not executed (strict security level), theme,
// SVG + PNG downloads (PNG decoded: 2× size, not blank), the library loads only on this tab and from this site, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { readFileSync } from 'node:fs';
export default async (ctx) => {
  const { base, page: newPage, ok, download } = ctx;
  const page = await newPage(); const hosts = new Set(); page.on('request', (r) => hosts.add(new URL(r.url()).host));
  await page.goto(`${base}#/mermaid`);
  const ta = page.locator('textarea'), svg = page.locator('.mermaid-view svg'); await svg.waitFor({ timeout: 20000 });
  const labels = { Flowchart: ['Order placed', 'Paid?', 'Ship'], Sequence: ['User', 'POST /pay', 'Payment done'], 'ER diagram': ['CUSTOMER', 'places', 'LINE_ITEM'], Gantt: ['Release plan', 'Design', 'Test'], Class: ['Animal', 'Dog', 'speak()'], State: ['Draft', 'Review', 'Published'], Pie: ['Coding', 'Meetings', 'Email'] };
  for (const [k, words] of Object.entries(labels)) {
    await page.locator('.chip-btn', { hasText: k }).click(); await page.waitForTimeout(400);
    const t = await page.locator('.mermaid-view svg').textContent(); ok(words.every((w) => t.includes(w)) && !(await page.locator('.mermaid-view ~ .note-warn, .card .note-warn').count()), `${k} renders (${words.join(', ')})`);
  }
  await ta.fill('flowchart LR\n  X[Mumbai] --> Y[Pune]'); await page.waitForTimeout(700);
  ok(/Mumbai/.test(await svg.textContent()) && /Pune/.test(await svg.textContent()), 'edit re-renders');
  await ta.fill('flowchart LR\n  X[Mumbai] --> '); await page.waitForTimeout(700);
  ok(await page.locator('.note-warn').count() === 1 && /Mumbai/.test(await svg.textContent()), 'syntax error reported, last good diagram kept');
  await page.evaluate(() => (window.__pwned = 0));
  await ta.fill('flowchart LR\n  A["<img src=x onerror=window.__pwned=1>"] --> B["<script>window.__pwned=2</script>"]'); await page.waitForTimeout(800);
  ok(await page.evaluate(() => window.__pwned) === 0 && await page.locator('.mermaid-view img[onerror], .mermaid-view script').count() === 0, 'HTML in labels is not executed (strict mode sanitises)');
  await page.locator('.chip-btn', { hasText: 'Flowchart' }).click(); await page.getByRole('radio', { name: 'Dark' }).click(); await page.waitForTimeout(500);
  ok(/Order placed/.test(await svg.textContent()), 'theme switch re-renders');
  const fsvg = await download(page, () => page.getByRole('button', { name: 'Download SVG' }).click()); const s = readFileSync(fsvg, 'utf8');
  ok(s.startsWith('<svg') && s.includes('Order placed') && /\.svg$/.test(fsvg), 'SVG download');
  const fpng = await download(page, () => page.getByRole('button', { name: 'Download PNG' }).click());
  const png = await page.evaluate(async (b64) => { const bm = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob()); const c = new OffscreenCanvas(bm.width, bm.height), g = c.getContext('2d'); g.drawImage(bm, 0, 0); const d = g.getImageData(0, 0, bm.width, bm.height).data; const set = new Set(); for (let i = 0; i < d.length; i += 4000) set.add(d[i] + ',' + d[i + 1]); return { w: bm.width, h: bm.height, colours: set.size }; }, readFileSync(fpng).toString('base64'));
  const box = await svg.boundingBox();
  ok(Math.abs(png.w - Math.ceil(box.width * 2)) <= 2 && png.colours > 2, `PNG at 2× (${png.w}×${png.h}, ${png.colours} colours)`);
  ok([...hosts].every((h) => h === new URL(base).host), `nothing loaded from other hosts (${[...hosts]})`);
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'mermaid');
};
