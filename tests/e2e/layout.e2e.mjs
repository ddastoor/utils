// Mobile UI requirement: no page may scroll horizontally on a phone. Also reports tools still showing placeholders.
import { createServer } from 'vite';
export default async ({ base, page: newPage, ok, info, devices }) => {
  const vs = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
  const { TOOLS } = await vs.ssrLoadModule('/src/registry.ts');
  await vs.close();
  const phoneTools = TOOLS.filter((t) => t.platform !== 'pc');
  const SHARDS = 4, overflow = [], pending = [];
  await Promise.all(Array.from({ length: SHARDS }, async (_, k) => {
    const page = await newPage(devices['iPhone 13']);
    for (const t of phoneTools.filter((_, i) => i % SHARDS === k)) {
      await page.goto(`${base}#/${t.id}`); await page.waitForTimeout(250);
      const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, text: document.querySelector('.tool-body')?.textContent || '' }));
      if (w.sw > w.iw + 1) overflow.push(`${t.id} (${w.sw}px > ${w.iw}px)`);
      if (/being built/.test(w.text)) pending.push(t.id);
    }
    ok(!page.errors.length, `phone shard ${k}: no page errors ${page.errors.slice(0, 3).join(' | ')}`);
  }));
  ok(!overflow.length, `no horizontal scrolling on phone: ${overflow.join(', ')}`);
  const pcPending = TOOLS.filter((t) => t.platform === 'pc').map((t) => t.id);
  info(`${phoneTools.length - pending.length}/${phoneTools.length} phone-visible tools implemented; still placeholders: ${pending.join(', ') || 'none'}`);
  void pcPending;
};
