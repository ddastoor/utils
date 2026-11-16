// Graphviz (#/graphviz, PC only): every sample renders (SVG image decodes, node/edge counts match the DOT); every engine
// draws the same graph; editing re-renders; plain/JSON/xdot/dot/canon text outputs agree with the graph (plain node
// positions: dot ranks top to bottom; LR left to right); HTML-like labels; syntax error and unknown shape reported and
// the next good graph renders again; a heavy graph can be stopped and the tab recovers; the SVG shown is an inert image
// (a URL="javascript:…" attribute never runs); SVG/PNG/.dot downloads (PNG decodes at 2× the point size); .gv file
// open; worker released on leave; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export default async (ctx) => {
  const { base, page: newPage, ok, tmp, download, info } = ctx;
  const page = await newPage(); await page.goto(`${base}#/graphviz`);
  const src = page.locator('textarea').first(), textOut = page.locator('textarea').nth(1);
  const engine = page.getByRole('combobox', { name: 'Layout engine' }), fmt = page.getByRole('combobox', { name: 'Format' });
  const img = page.locator('img.gv-img');
  const svgOf = () => page.evaluate(async () => { const i = document.querySelector('img.gv-img'); if (!i?.src) return ''; return (await fetch(i.src)).text(); });
  const waitSvg = async (prev) => { await page.waitForFunction((p) => { const i = document.querySelector('img.gv-img'); return i && i.src && i.src !== p && i.complete && i.naturalWidth > 0; }, prev, { timeout: 20000 }); };
  const count = (svg, cls) => (svg.match(new RegExp(`class="${cls}"`, 'g')) || []).length;
  await waitSvg('');
  let svg = await svgOf(); ok(count(svg, 'node') === 5 && count(svg, 'edge') === 5 && svg.includes('>Payment OK?</text>'), `first sample drawn (5 nodes, 5 edges)`);
  // all samples
  const samples = page.locator('.chips button'); const n = await samples.count(); let good = 0;
  const expect = { Flowchart: [5, 5], Clusters: [5, 4], 'HTML table': [2, 1], 'State machine': [3, 5], Network: [10, 9], 'Mind map': [15, 14], Cycle: [5, 5] };
  for (let i = 0; i < n; i++) {
    const name = await samples.nth(i).textContent(); const prev = await img.getAttribute('src');
    await samples.nth(i).click(); await waitSvg(prev); svg = await svgOf();
    const [nn, ne] = expect[name] || [-1, -1];
    if (count(svg, 'node') === nn && count(svg, 'edge') === ne) good++; else info(`${name}: ${count(svg, 'node')} nodes, ${count(svg, 'edge')} edges`);
  }
  ok(good === n && n === 7, `all ${n} samples drawn with the right node/edge counts (${good})`);
  ok(await engine.inputValue() === 'circo', 'a sample selects its engine (Cycle → circo)');
  // every engine
  await src.fill('digraph { a -> b -> c -> a; c -> d }'); await page.waitForTimeout(500); let fine = 0;
  for (const e of ['dot', 'neato', 'fdp', 'sfdp', 'circo', 'twopi', 'osage', 'patchwork']) {
    const prev = await img.getAttribute('src'); await engine.selectOption(e); await waitSvg(prev); svg = await svgOf();
    if (count(svg, 'node') === 4 && count(svg, 'edge') === (e === 'patchwork' ? 0 : 4) && svg.includes(`<svg width=`)) fine++; else info(`engine ${e}: ${count(svg, 'node')}/${count(svg, 'edge')}`);
  }
  ok(fine === 8, `all 8 engines draw the graph (${fine})`);
  // text formats
  await engine.selectOption('dot'); await src.fill('digraph { rankdir=LR; a -> b -> c }'); await page.waitForTimeout(700);
  await fmt.selectOption('plain'); await page.waitForTimeout(400);
  const pos = Object.fromEntries((await textOut.inputValue()).split('\n').filter((l) => l.startsWith('node ')).map((l) => { const p = l.split(' '); return [p[1], [+p[2], +p[3]]]; }));
  ok(pos.a[0] < pos.b[0] && pos.b[0] < pos.c[0] && pos.a[1] === pos.c[1], `plain: rankdir=LR puts a, b, c left to right (${JSON.stringify(pos)})`);
  await fmt.selectOption('json'); await page.waitForTimeout(400);
  const j = JSON.parse(await textOut.inputValue()); ok(j.objects.length === 3 && j.edges.length === 2 && j.edges.every((e) => e._draw_), 'JSON: 3 nodes, 2 edges with drawing operations');
  await fmt.selectOption('xdot'); await page.waitForTimeout(400); ok(/_draw_="/.test(await textOut.inputValue()), 'xdot');
  await fmt.selectOption('dot'); await page.waitForTimeout(400); ok(/a -> b\s+\[pos="/.test(await textOut.inputValue()), 'DOT with positions');
  await fmt.selectOption('canon'); await page.waitForTimeout(400); ok((await textOut.inputValue()).includes('a -> b;'), 'canon');
  // HTML label + errors
  let prev = await img.getAttribute('src');
  await src.fill('digraph { t [shape=plaintext label=<<table><tr><td><b>Bold</b></td><td>&#8377; 500</td></tr></table>>] }'); await waitSvg(prev); svg = await svgOf();
  ok(svg.includes('>Bold</text>') && svg.includes('font-weight="bold"') && svg.includes('₹ 500'), 'HTML-like label with bold text and ₹');
  await src.fill('digraph { a -> }'); await page.waitForTimeout(800);
  ok(/syntax error in line 1/.test(await page.locator('.note-warn').first().textContent()), 'syntax error reported');
  prev = await img.getAttribute('src'); await src.fill('digraph { x [shape=nosuch]; x -> y }'); await waitSvg(prev);
  const notes = await page.locator('.note').allTextContents(); ok(notes.some((t) => /unknown shape nosuch/.test(t)) && count(await svgOf(), 'node') === 2, `${notes.join(' / ')}: ` + 'warning shown and the graph drawn again after the error');
  // unicode + non-ASCII width warnings hidden
  prev = await img.getAttribute('src'); await src.fill('digraph { "नमस्ते" -> "Ünïcødé" }'); await waitSvg(prev);
  ok((await svgOf()).includes('>नमस्ते</text>') && !(await page.locator('.note', { hasText: 'non-ASCII' }).count()), 'Unicode labels; font-width fallback warnings not shown');
  // inert SVG: a javascript: URL must not run
  prev = await img.getAttribute('src'); await src.fill('digraph { evil [URL="javascript:window.__pwned=1", label="click"] }'); await waitSvg(prev);
  const box = await img.boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(200);
  ok(!(await page.evaluate(() => window.__pwned)) && (await svgOf()).includes('javascript:'), 'SVG shown as an image: links/scripts in the graph are inert');
  // stop a heavy layout
  const heavy = 'digraph { ' + Array.from({ length: 700 }, (_, i) => `n${i} -> n${(i * 7 + 3) % 700}; n${i} -> n${(i * 13 + 1) % 700}; n${i} -> n${(i * 29 + 5) % 700};`).join(' ') + ' }';
  await src.fill(heavy); await page.getByRole('button', { name: 'Stop' }).waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: 'Stop' }).click(); await page.waitForTimeout(300);
  ok(/Stopped/.test(await page.locator('.note-warn').first().textContent()) && !(await page.getByRole('button', { name: 'Stop' }).isVisible()), 'a long layout can be stopped');
  prev = await img.getAttribute('src'); await src.fill('digraph { back -> again }'); await waitSvg(prev);
  ok((await svgOf()).includes('>again</text>'), 'renders again after stopping (fresh worker)');
  // downloads
  let d = await download(page, () => page.getByRole('button', { name: 'Download SVG' }).click()); ok(readFileSync(d, 'utf8').includes('>again</text>'), 'SVG download');
  d = await download(page, () => page.getByRole('button', { name: 'Download PNG' }).click());
  const pngBuf = readFileSync(d); const w = pngBuf.readUInt32BE(16), hh = pngBuf.readUInt32BE(20);
  const vb = /viewBox="0.00 0.00 ([\d.]+) ([\d.]+)"/.exec(await svgOf());
  ok(pngBuf.slice(1, 4).toString() === 'PNG' && Math.abs(w - Math.ceil(+vb[1] * 2 * 96 / 72)) <= 1 && Math.abs(hh - Math.ceil(+vb[2] * 2 * 96 / 72)) <= 1, `PNG at 2× (${w}×${hh})`);
  d = await download(page, () => page.getByRole('button', { name: 'Download .dot' }).click()); ok(readFileSync(d, 'utf8') === 'digraph { back -> again }', '.dot download');
  const f = join(tmp, 'g.gv'); writeFileSync(f, 'graph { opened -- file }'); prev = await img.getAttribute('src');
  await page.locator('.drop input[type=file]').setInputFiles(f); await waitSvg(prev); ok((await svgOf()).includes('>opened</text>'), '.gv file opened');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await page.goto(`${base}#/`); await page.waitForTimeout(300);
  ok((await page.evaluate(() => globalThis.__supertoolsLive())).workers === 0, 'worker released on leave');
  await pcOnlyOnPhone(ctx, 'graphviz');
};
