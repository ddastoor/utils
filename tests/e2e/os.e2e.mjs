// Every PC tab on Windows and on Linux, X11 and Wayland (to-do #13, owner, 21 Nov 2026: "make sure that all the apps that
// work on PC work on both Windows and Linux"; and every app on Linux knows X11 from Wayland — src/linux.ts).
// Each system is stood in for by its user agent AND its client hints (CDP — `asOS` in _os.mjs: Playwright's userAgent
// alone leaves navigator.userAgentData saying what the machine is, and the suite runs on Linux and on Windows), X11 /
// Wayland by the window position the page is told as well (Wayland never tells it: 0, 0). The real Windows run is .github/workflows/windows.yml (Chrome on a Windows runner).
// For every tab that runs on a PC: it opens without an uncaught error on each system; the X11 / Wayland note is there
// in the tabs where the two differ — and only there, and never on Windows — with the right answer; the parts that
// depend on the system pick the right thing (yt-dlp's file, the offline speech script).
import { createServer } from 'vite';
import { asOS } from './_os.mjs';
// the tabs where X11 and Wayland differ, and so say which one this is
const BANNER = ['screencast', 'screenshot', 'youtube', 'screen'];
export default async ({ base, page: newPage, ok, info }) => {
  const vs = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
  const { TOOLS } = await vs.ssrLoadModule('/src/registry.ts');
  await vs.close();
  const tabs = TOOLS.filter((t) => t.platform !== 'mobile').map((t) => t.id);
  const systems = {
    windows: async (page) => asOS(page, 'windows'),
    x11: async (page) => (await asOS(page, 'linux'), page.addInitScript(() => { for (const [k, v] of [['screenX', 140], ['screenY', 60], ['screenLeft', 140], ['screenTop', 60]]) Object.defineProperty(window, k, { get: () => v, configurable: true }); })),
    wayland: async (page) => (await asOS(page, 'linux'), page.addInitScript(() => { for (const k of ['screenX', 'screenY', 'screenLeft', 'screenTop']) Object.defineProperty(window, k, { get: () => 0, configurable: true }); })),
  };
  const BAD = /^(pageerror|.*(TypeError|ReferenceError|RangeError|SyntaxError|RuntimeError|is not a function|Cannot read))/i;
  const SHARDS = 3;
  const found = { windows: { errors: [], banners: [] }, x11: { errors: [], banners: [] }, wayland: { errors: [], banners: [] } };
  await Promise.all(Object.entries(systems).flatMap(([sys, setup]) => Array.from({ length: SHARDS }, async (_, k) => {
    const page = await newPage({ viewport: { width: 1366, height: 900 } });
    await setup(page);
    await page.addInitScript(() => { window.open = () => null; });
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    for (const id of tabs.filter((_, i) => i % SHARDS === k)) {
      page.errors.length = 0;
      await page.goto(`${base}#/${id}`);
      // the tab drawn; where the note belongs, waited for (under load a tab can take longer than a fixed pause — the sweeps met it)
      await page.locator('.tool-body > :not(.loading)').first().waitFor({ timeout: 15000 }).catch(() => {});
      if (sys !== 'windows' && [...BANNER].includes(id)) await page.locator('.linux-banner').first().waitFor({ timeout: 15000 }).catch(() => {});
      else await page.waitForTimeout(400);
      const b = await page.evaluate(() => [...document.querySelectorAll('.linux-banner')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
      if (b.length) found[sys].banners.push([id, b[0]]);
      for (const e of page.errors) if (BAD.test(e)) found[sys].errors.push(`${id}: ${e.slice(0, 160)}`);
    }
    await page.close();
  })));
  info(`${tabs.length} PC tabs, each opened as Windows, Linux X11 and Linux Wayland`);
  for (const sys of Object.keys(systems)) ok(!found[sys].errors.length, `${sys}: every PC tab opens without an uncaught error${found[sys].errors.length ? ` — ${found[sys].errors.slice(0, 6).join(' | ')}` : ''}`);
  ok(!found.windows.banners.length, `Windows: no X11 / Wayland note anywhere${found.windows.banners.length ? ` — ${found.windows.banners.map(([id]) => id).join(', ')}` : ''}`);
  for (const [sys, word] of [['x11', /^Detected: X11\. /], ['wayland', /^Detected: Wayland \(likely\)\. /]]) {
    const ids = found[sys].banners.map(([id]) => id).sort();
    ok(JSON.stringify(ids) === JSON.stringify([...BANNER].sort()), `${sys}: the note is in exactly the tabs where X11 and Wayland differ (${ids.join(', ')})`);
    ok(found[sys].banners.every(([, t]) => word.test(t)), `${sys}: each says ${sys === 'x11' ? 'X11' : 'Wayland (likely)'}${found[sys].banners.filter(([, t]) => !word.test(t)).map(([id, t]) => ` — ${id}: ${t.slice(0, 60)}`).join('')}`);
  }
  const way = Object.fromEntries(found.wayland.banners);
  ok(/may not stay on top/.test(way.screenshot || ''), 'Screenshot on Wayland: the countdown window may not stay on top (Wayland leaves it to the desktop)');
  ok(/never told where its window is/.test(way.screen || '') && /Confirm X11 or Wayland/.test(way.screen || ''), 'Screen Info on Wayland: what a page is not told, and a button to confirm');
  ok(/window/.test(Object.fromEntries(found.x11.banners).screen || ''), 'Screen Info on X11: its own words');

  // the parts that depend on the system: yt-dlp's file and the offline speech script
  for (const [sys, file, script] of [['windows', 'yt-dlp.exe', 'Windows'], ['wayland', 'yt-dlp_linux', 'Linux']]) {
    const page = await newPage({ viewport: { width: 1366, height: 900 } });
    await systems[sys](page);
    await page.goto(`${base}#/youtube`);
    const link = page.getByRole('link', { name: /^Download latest yt-dlp/ });
    await link.waitFor({ timeout: 15000 });
    ok((await link.getAttribute('href')).endsWith(`/download/${file}`), `${sys}: yt-dlp's download is ${file}`);
    await page.goto(`${base}#/tts`);
    await page.getByRole('radio', { name: 'Offline on this PC' }).click();
    await page.locator('.otts-list .otts-voice').first().waitFor({ timeout: 30000 });
    ok(await page.getByRole('radio', { name: script, exact: true }).isChecked(), `${sys}: the offline speech mode starts with the script for ${script}`);
    ok(await page.getByRole('button', { name: new RegExp(`Download the script for ${script}`) }).isVisible(), `${sys}: its download button is for ${script} (${script === 'Windows' ? '.cmd' : '.sh'})`);
    await page.close();
  }
};
