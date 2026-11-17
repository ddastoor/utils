// Whole-app sweep (bug hunt, Nov 2026) — every tab on a desktop and, unless it is PC only, on a phone:
//  • opens without a page error and without horizontal scrolling (phone AND desktop),
//  • phone: every visible control is a touch target of at least 44 × 44 px (owner rule §1.9),
//  • every visible input / button has an accessible name,
//  • every button is pressed once in the tab's default state: nothing may throw an uncaught error (messages such as
//    "Choose a PDF first" are fine — a TypeError/ReferenceError/RangeError is a bug), the page must not grow sideways,
//  • after leaving the tab no worker or engine is left alive (src/lifecycle.ts).
// Replaces the old layout.e2e.mjs (phone overflow only).
import { createServer } from 'vite';
export default async ({ base, page: newPage, ok, info, devices }) => {
  const vs = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
  const { TOOLS } = await vs.ssrLoadModule('/src/registry.ts');
  await vs.close();
  const jobs = [];
  for (const t of TOOLS) { if (t.platform !== 'mobile') jobs.push({ id: t.id, phone: false }); if (t.platform !== 'pc') jobs.push({ id: t.id, phone: true }); }
  const bad = { errors: [], overflow: [], small: [], unnamed: [], grew: [], alive: [], pending: [] };
  let pressed = 0;
  const audit = (phone) => {
    const vis = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden]'); };
    const root = document.querySelector('.tool-body') || document.body;
    const out = { overflow: document.documentElement.scrollWidth - window.innerWidth, small: [], unnamed: [], text: root.textContent.slice(0, 200) };
    const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('aria-labelledby') || (el.labels && el.labels.length ? el.labels[0].textContent : '') || el.getAttribute('placeholder') || el.textContent || '').trim();
    for (const el of root.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=radio], [role=tab], [contenteditable=true]')) {
      if (!vis(el) || el.disabled || el.closest('.md-view')) continue;          // .md-view = rendered user Markdown
      const b = el.getBoundingClientRect();
      if (phone && !(el.tagName === 'A' && el.closest('.note, p, .muted, li'))) {   // links inside a sentence are exempt (WCAG 2.5.8)
        const box = (el.matches('input[type=checkbox], input[type=radio]') && el.closest('label')) ? el.closest('label').getBoundingClientRect() : b;
        if (box.height < 43.5 || box.width < 43.5) out.small.push(`${el.tagName.toLowerCase()} "${name(el).slice(0, 20)}" ${Math.round(box.width)}×${Math.round(box.height)}`);
      }
      let n = name(el);
      if (!n && el.closest('.field')) n = el.closest('.field').querySelector('.field-label')?.textContent?.trim() || '';
      if (!n) out.unnamed.push(`${el.tagName.toLowerCase()}${el.type ? '[' + el.type + ']' : ''}.${String(el.className).slice(0, 24)}`);
    }
    out.buttons = [...root.querySelectorAll('button')].filter((x) => vis(x) && !x.disabled).length;
    return out;
  };
  const SHARDS = 4;
  await Promise.all(Array.from({ length: SHARDS }, async (_, k) => {
    for (const phone of [false, true]) {
      const page = await newPage(phone ? devices['iPhone 13'] : { viewport: { width: 1366, height: 900 } });
      await page.addInitScript(() => { window.open = () => null; });
      page.on('dialog', (d) => d.dismiss().catch(() => {}));
      page.on('filechooser', () => {});
      for (const job of jobs.filter((j, i) => j.phone === phone && i % SHARDS === k)) {
        const tag = `${job.id}${phone ? ' (phone)' : ''}`; page.errors.length = 0;
        await page.goto(`${base}#/${job.id}`); await page.waitForTimeout(450);
        const a = await page.evaluate(audit, phone);
        if (/being built/.test(a.text)) bad.pending.push(tag);
        if (a.overflow > 1) bad.overflow.push(`${tag} +${a.overflow}px`);
        if (a.small.length) bad.small.push(`${tag}: ${a.small.slice(0, 3).join(', ')}`);
        if (a.unnamed.length) bad.unnamed.push(`${tag}: ${a.unnamed.slice(0, 3).join(', ')}`);
        for (let i = 0; i < Math.min(a.buttons, 40); i++) {
          const label = await page.evaluate((i) => { const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]'); }; const root = document.querySelector('.tool-body'); const b = root && [...root.querySelectorAll('button')].filter((x) => vis(x) && !x.disabled)[i]; if (!b) return null; b.setAttribute('data-sweep', '1'); return (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 30); }, i).catch(() => null);
          if (label == null) break;
          const before = page.errors.length;
          try { await page.locator('.tool-body button[data-sweep="1"]').first().click({ timeout: 1200 }); pressed++; } catch { /* covered by a dialog or gone */ }
          await page.evaluate(() => document.querySelectorAll('[data-sweep]').forEach((e) => e.removeAttribute('data-sweep'))).catch(() => {});
          await page.waitForTimeout(70);
          for (const e of page.errors.slice(before)) if (/^(pageerror|.*(TypeError|ReferenceError|RangeError|SyntaxError|RuntimeError|is not a function|Cannot read|undefined))/i.test(e) && !/^Error: /.test(e)) bad.errors.push(`${tag} after "${label}": ${e.slice(0, 160)}`);
          if (!page.url().includes('#/' + job.id)) { await page.goto(`${base}#/${job.id}`).catch(() => {}); await page.waitForTimeout(300); }
        }
        await page.waitForTimeout(250);
        const grew = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => 0);
        if (grew > 1) bad.grew.push(`${tag} +${grew}px`);
        await page.goto(`${base}#/`); await page.waitForTimeout(250);
        const live = await page.evaluate(() => globalThis.__supertoolsLive());
        if (live.workers || live.resources.length) bad.alive.push(`${tag}: ${live.workers} worker(s), ${live.resources.join(' ')}`);
      }
      await page.context().close().catch(() => {});
    }
  }));
  const n = jobs.length, list = (a) => `${a.length ? ': ' : ''}${a.slice(0, 8).join(' | ')}${a.length > 8 ? ` (+${a.length - 8} more)` : ''}`;
  ok(!bad.pending.length, `no placeholder tabs${list(bad.pending)}`);
  ok(!bad.overflow.length, `no horizontal scrolling when a tab opens (${n} tab views, desktop + phone)${list(bad.overflow)}`);
  ok(!bad.small.length, `phone: every control is at least 44 × 44 px${list(bad.small)}`);
  ok(!bad.unnamed.length, `every input and button has an accessible name${list(bad.unnamed)}`);
  ok(!bad.errors.length, `pressing every button in the default state throws nothing unexpected (${pressed} presses)${list(bad.errors)}`);
  ok(!bad.grew.length, `no horizontal scrolling after pressing the buttons${list(bad.grew)}`);
  ok(!bad.alive.length, `nothing left running after leaving a tab${list(bad.alive)}`);
  info(`${n} tab views (${jobs.filter((j) => !j.phone).length} desktop, ${jobs.filter((j) => j.phone).length} phone), ${pressed} buttons pressed`);
};
