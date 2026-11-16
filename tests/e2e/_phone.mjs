// Shared phone-layout checks (iPhone 13, 390 × 844): no horizontal scroll, and the named buttons are ≥ 44 px tall.
export async function phoneLayout({ base, page, devices, ok }, id, { ready, buttons = [], before } = {}) {
  const ph = await page(devices['iPhone 13']); await ph.goto(`${base}#/${id}`);
  await ph.locator(ready || '.tool-body > *').first().waitFor({ timeout: 15000 });
  if (before) await before(ph);
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `phone: no horizontal scroll (#/${id})`);
  for (const name of buttons) {
    const b = await ph.getByRole('button', { name, exact: true }).first().boundingBox();
    ok(b && b.height >= 44, `phone: "${name}" button ≥ 44 px tall (${b && Math.round(b.height)})`);
  }
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
  return ph;
}
