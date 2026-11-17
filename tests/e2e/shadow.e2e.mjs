// CSS Box Shadow (#/shadow, PC only): the CSS text for one and several layers (offsets, blur, spread, colour + opacity
// as rgba, inset), the preview's computed box-shadow equals what that CSS gives a test element, presets, removing the
// last layer refused, every preset, layer tabs keep each layer's own values, colours typed as rgb() / names, a
// see-through colour is refused here (opacity has its own slider), radius, colours, copy, phone note.
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
  // every preset: exact CSS, and the preview renders it
  for (const [name, css] of [['Subtle', '0px 1px 2px 0px rgba(0, 0, 0, 0.05)'], ['Card (2 layers)', '0px 10px 15px -3px rgba(0, 0, 0, 0.1), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)'], ['Floating', '0px 25px 50px -12px rgba(0, 0, 0, 0.25)'], ['Inset', 'inset 0px 2px 4px 0px rgba(0, 0, 0, 0.06)']]) {
    await page.locator('.chip-btn', { hasText: name }).click(); [w, g] = await applied(); ok((await code.textContent()).startsWith(`box-shadow: ${css};`) && w === g, `preset ${name}`); }
  // layer tabs: each layer keeps its own values
  await page.locator('.chip-btn', { hasText: 'Card (2 layers)' }).click(); await page.locator('.chips .chip-btn', { hasText: 'Layer 2' }).click();
  const slv = (label) => page.locator('.slider').filter({ hasText: label }).locator('input').inputValue();
  ok(await slv('Blur') === '6' && await slv('Spread') === '-4' && await slv('Vertical offset') === '4', 'Layer 2 tab shows layer 2 (blur 6, spread -4, y 4)');
  await sl('Blur', 77); await page.locator('.chips .chip-btn', { hasText: 'Layer 1' }).click(); ok(await slv('Blur') === '15' && (await code.textContent()).includes('0px 4px 77px -4px'), 'editing layer 2 leaves layer 1 alone');
  await page.getByRole('button', { name: 'Remove layer' }).click(); ok(await page.locator('.chips .chip-btn', { hasText: /^Layer/ }).count() === 1 && (await code.textContent()).startsWith('box-shadow: 0px 4px 77px -4px rgba(0, 0, 0, 0.1);'), 'removing layer 1 leaves the edited layer');
  // colours: other spellings; transparency belongs to the Opacity slider
  const col = page.locator('input[aria-label="Shadow colour"]');
  await col.fill('rgb(255, 136, 0)'); ok((await code.textContent()).includes('rgba(255, 136, 0, 0.1)'), 'rgb() colour');
  await col.fill('crimson'); ok((await code.textContent()).includes('rgba(220, 20, 60, 0.1)'), 'named colour');
  await col.fill('#ff000080'); ok(await col.evaluate((e) => e.classList.contains('bad')) && /see-through/.test(await col.getAttribute('title')) && (await code.textContent()).includes('rgba(220, 20, 60, 0.1)'), 'a see-through colour is refused with the reason (it used to lose its transparency silently)');
  await col.fill('#f00'); await sl('Opacity', 0); ok((await code.textContent()).includes('rgba(255, 0, 0, 0)'), 'opacity 0');
  await sl('Opacity', 1); ok((await code.textContent()).includes('rgba(255, 0, 0, 1)'), 'opacity 1');
  await sl('Opacity', 0.333); ok((await code.textContent()).includes('rgba(255, 0, 0, 0.33)'), 'opacity is written with two decimals');
  await sl('Horizontal offset', -100); await sl('Vertical offset', 100); await sl('Blur', 200); await sl('Spread', 100); [w, g] = await applied();
  ok((await code.textContent()).startsWith('box-shadow: -100px 100px 200px 100px rgba(255, 0, 0, 0.33);') && w === g, 'slider extremes');
  await sl('Corner radius', 0); ok((await code.textContent()).endsWith('border-radius: 0px;'), 'radius 0');
  await page.locator('input[aria-label="Box colour"]').fill('teal'); ok(await page.locator('.shadow-box').evaluate((e) => getComputedStyle(e).backgroundColor) === 'rgb(0, 128, 128)', 'box colour by name');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'shadow');
};
