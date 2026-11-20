// Touch targets on phones (owner rule, CLAUDE.md §1.9: ≥ 44 px), every tab a phone offers, as it opens: the hit area of
// every visible control — buttons, links, selects, text boxes, switches, chips, fold-outs (<summary>), tabs and radios
// — measured with elementFromPoint from its centre outwards (so a hit area larger than the drawn shape counts, and a
// control covered by something else does not), each scrolled to the middle of the screen first (a sticky action bar
// covers the bottom). Sliders: their height. Also: no sideways scroll. The shell's own controls: shell.e2e.mjs.
export default async (ctx) => {
  const { base, page: newPage, ok, devices } = ctx;
  const page = await newPage({ ...devices['iPhone 13'] });
  await page.goto(base); await page.waitForSelector('.tile');
  const ids = [...new Set(await page.evaluate(() => [...document.querySelectorAll('a.tile')].map((a) => a.getAttribute('href').replace(/^#\//, '')).filter((x) => x && !x.startsWith('c/'))))];
  ok(ids.length > 100, `a phone offers ${ids.length} tabs`);
  const small = [], wide = [];
  for (const id of ids) {
    await page.goto(`${base}#/${id}`); await page.waitForSelector('.tool-body', { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const sel = ['button', 'a[href]', 'select', 'input:not([type=hidden])', 'textarea', 'summary', '[role=button]', '[role=tab]', '[role=radio]', 'label.switch', '.chip-btn'].map((s) => `.tool-body ${s}`).join(', ');
      const out = [];
      for (const el of document.querySelectorAll(sel)) {
        if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
        if (el.matches('input[type=checkbox], input[type=radio]') && el.closest('label')) continue; // the label is the target
        el.scrollIntoView({ block: 'center' });
        const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
        if (el.matches('input[type=range]')) { if (b.height < 44) out.push(`${el.getAttribute('aria-label') || 'slider'}: ${Math.round(b.height)} px tall`); continue; }
        const x = b.left + b.width / 2, y = b.top + b.height / 2;
        const inside = (px, py) => { const e = document.elementFromPoint(px, py); return !!e && (e === el || el.contains(e) || (el.control && (e === el.control || el.control.contains(e)))); };
        if (!inside(x, y)) continue; // covered at its centre (by a sticky bar): not this control's own size
        let t = y, bt = y, l = x, rt = x;
        while (t > 0 && inside(x, t - 1)) t--; while (bt < innerHeight - 1 && inside(x, bt + 1)) bt++;
        while (l > 0 && inside(l - 1, y)) l--; while (rt < innerWidth - 1 && inside(rt + 1, y)) rt++;
        const h = bt - t + 1, w = rt - l + 1;
        if (h < 44 || w < 44) out.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" ${Math.round(w)} × ${Math.round(h)}`);
      }
      return { out, sideways: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    if (r.out.length) small.push(`${id}: ${r.out.join('; ')}`);
    if (r.sideways) wide.push(id);
  }
  ok(!small.length, `every control of every phone tab takes taps over at least 44 × 44 px (${ids.length} tabs) ${small.join(' | ')}`);
  ok(!wide.length, `no phone tab scrolls sideways as it opens ${wide.join(', ')}`);
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 5).join(' | ')}`);
};
