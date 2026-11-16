// shared check for PC-only tabs: phones show the "desktop browsers only" note instead of the tool
export async function pcOnlyOnPhone({ base, page, devices, ok }, id) {
  const ph = await page(devices['iPhone 13']); await ph.goto(`${base}#/${id}`);
  await ph.locator('.note-warn').first().waitFor();
  ok(/desktop browsers only/.test(await ph.locator('.note-warn').first().textContent()) && await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `phone: PC-only note shown, no horizontal scroll (#/${id})`);
}
