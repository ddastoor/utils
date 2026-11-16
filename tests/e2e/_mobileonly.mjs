// shared check for Mobile-only tabs: desktops show the "made for phones" note instead of the tool
export async function mobileOnlyOnDesktop({ base, page, ok }, id) {
  const pc = await page(); await pc.goto(`${base}#/${id}`);
  await pc.locator('.note-warn').first().waitFor();
  ok(/made for phones/.test(await pc.locator('.note-warn').first().textContent()) && (await pc.locator('.tool-title .badge').textContent()) === 'Mobile only' && (await pc.locator('.tool-body button').count()) === 0,
    `desktop: Mobile-only note shown instead of the tool (#/${id})`);
}
