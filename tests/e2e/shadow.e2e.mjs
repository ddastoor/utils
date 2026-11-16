// CSS Box Shadow (#/shadow, PC only): the CSS text for one and several layers (offsets, blur, spread, colour + opacity
// as rgba, inset), the preview's computed box-shadow equals what that CSS gives a test element, presets, removing the
// last layer refused, radius, colours, copy, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] }); await page.goto(`${base}#/shadow`);
  const code = page.locator('.css-out'), box = page.locator('.shadow-box'); await box.waitFor();
  const applied = () => page.evaluate(() => { const css = document.querySelector('.css-out').textContent; const t = document.createElement('div'); t.setAttribute('style', css.replace(/\n/g, ' ')); document.body.append(t); const want = getComputedStyle(t).boxShadow + '|' + getComputedStyle(t).borderRadius; t.remove(); const b = document.querySelector('.shadow-box'); return [want, getComputedStyle(b).boxShadow + '|' + getComputedStyle(b).borderRadius]; });
  ok(await code.textContent() === 'box-shadow: 0px 4px 12px 0px rgba(0, 0, 0, 0.15);\nborder-radius: 16px;', 'default CSS');
  let [w, g] = await applied(); ok(w === g && /rgba\(0, 0, 0, 0\.15\) 0px 4px 12px 0px/.test(g), `preview = CSS (${g})`);
  const sl = (label, v) => page.locator('.slider').filter({ hasText: label }).locator('input').evaluate((e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, v);
  await sl('Horizontal offset', -8); await sl('Vertical offset', 20); await sl('Blur', 40); await sl('Spread', -5); await sl('Opacity', 0.5);
  await page.locator('input[aria-label="Shadow colour"]').fill('#4f46e5'); await page.locator('label.switch', { hasText: 'Inset' }).click();
  ok((await code.textContent()).startsWith('box-shadow: inset -8px 20px 40px -5px rgba(79, 70, 229, 0.5);'), `edited layer (${await code.textContent()})`);
  [w, g] = await applied(); ok(w === g, 'preview = CSS after edits');
  await page.getByRole('button', { name: 'Add layer' }).click(); await sl('Blur', 9);
  ok(/^box-shadow: inset -8px 20px 40px -5px rgba\(79, 70, 229, 0\.5\), 0px 1px 9px 0px rgba\(0, 0, 0, 0\.1\);/.test(await code.textContent()), 'second layer appended, comma-separated');
  [w, g] = await applied(); ok(w === g, 'two layers rendered');
  await page.locator('.chip-btn', { hasText: 'Card (2 layers)' }).click();
  ok((await code.textContent()).startsWith('box-shadow: 0px 10px 15px -3px rgba(0, 0, 0, 0.1), 0px 4px 6px -4px rgba(0, 0, 0, 0.1);'), 'Card preset (Tailwind shadow-lg values)');
  await page.getByRole('button', { name: 'Remove layer' }).click(); await page.getByRole('button', { name: 'Remove layer' }).click();
  ok(await page.locator('.chips .chip-btn', { hasText: /^Layer/ }).count() === 1 && /at least one layer/.test(await page.locator('.toast').last().textContent()), 'last layer cannot be removed');
  page.errors.splice(0, page.errors.length, ...page.errors.filter((e) => !/at least one layer/.test(e)));
  await sl('Corner radius', 50); ok((await code.textContent()).endsWith('border-radius: 50px;') && (await applied())[1].endsWith('|50px'), 'corner radius');
  await page.locator('input[aria-label="Page colour"]').fill('#000000'); ok(await page.locator('.shadow-stage').evaluate((e) => getComputedStyle(e).backgroundColor) === 'rgb(0, 0, 0)', 'page colour');
  await page.getByRole('button', { name: 'Copy CSS' }).click(); ok(await page.evaluate(() => navigator.clipboard.readText()) === await code.textContent(), 'Copy CSS');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'shadow');
};
