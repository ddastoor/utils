// SVG Optimizer (#/svgo, PC only): editor-style SVGs (comments, metadata, Inkscape/Sodipodi namespaces, long decimals,
// default attributes, empty groups) and the 1,600-icon Lucide sprite get smaller; output is well-formed XML; the
// optimised image RENDERS THE SAME (both rasterised in the page, pixel difference), safe mode, pretty-print, several
// files, broken SVG message, download, nothing loaded before a file is chosen, phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const EDITOR = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Created with Inkscape (http://www.inkscape.org/) -->
<svg xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:svg="http://www.w3.org/2000/svg" xmlns="http://www.w3.org/2000/svg"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="200.00000" height="120.00000" viewBox="0 0 200 120" version="1.1" id="svg8" inkscape:version="1.3" sodipodi:docname="flag.svg">
  <metadata id="metadata5"><rdf:RDF><dc:format>image/svg+xml</dc:format></rdf:RDF></metadata>
  <sodipodi:namedview id="base" pagecolor="#ffffff" inkscape:zoom="1.0" />
  <defs id="defs2"></defs>
  <g inkscape:label="Layer 1" inkscape:groupmode="layer" id="layer1" style="display:inline">
    <rect style="fill:#ff9933;fill-opacity:1;stroke:none" id="rect1" width="200.00000" height="40.000000" x="0.0000000" y="0.0000000" />
    <rect style="fill:#ffffff;fill-opacity:1;stroke:none" id="rect2" width="200.00000" height="40.000000" x="0.0000000" y="40.000000" />
    <rect style="fill:#138808;fill-opacity:1;stroke:none" id="rect3" width="200.00000" height="40.000000" x="0.0000000" y="80.000000" />
    <circle style="fill:none;stroke:#000080;stroke-width:2.0000000" id="c1" cx="100.00000" cy="60.000000" r="17.000000" />
    <path style="fill:#000080" d="M 100.00000,60.000000 L 100.00000,43.000000 L 101.50000,60.000000 Z M 100.000000,60.000000 L 117.000000,60.000000 L 100.000000,61.500000 Z" id="p1" />
    <g id="empty"></g>
  </g>
</svg>`;
export default async (ctx) => {
  const { base, page: newPage, ok, tmp, download } = ctx;
  const f1 = join(tmp, 'flag.svg'), f2 = join(tmp, 'sprite.svg'), f3 = join(tmp, 'broken.svg');
  writeFileSync(f1, EDITOR);
  // a renderable Lucide subset: 40 symbols placed on a grid with <use>
  const sprite = readFileSync(join(process.cwd(), 'node_modules/lucide-static/sprite.svg'), 'utf8');
  const ids = [...sprite.matchAll(/<symbol id="([^"]+)"/g)].slice(0, 40).map((m) => m[1]);
  writeFileSync(f2, sprite.replace(/<\/svg>\s*$/, ids.map((id, i) => `<use href="#${id}" x="${(i % 8) * 30}" y="${Math.floor(i / 8) * 30}" width="24" height="24" stroke="#000" fill="none"/>`).join('') + '</svg>').replace('<svg ', '<svg width="240" height="150" viewBox="0 0 240 150" '));
  writeFileSync(f3, '<svg xmlns="http://www.w3.org/2000/svg"><rect></svg>');
  const page = await newPage(); const reqs = []; page.on('request', (r) => reqs.push(r.url())); await page.goto(`${base}#/svgo`);
  await page.locator('.drop input[type=file]').waitFor({ state: 'attached' }); await page.waitForTimeout(300);
  ok(!reqs.some((u) => /svgo-.*\.wasm/.test(u)), 'the optimiser is not downloaded before a file is chosen');
  const raster = (svg) => page.evaluate(async (s) => { const img = new Image(); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`; await img.decode(); const c = new OffscreenCanvas(240, 150), g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 240, 150); g.drawImage(img, 0, 0, 240, 150); return Array.from(g.getImageData(0, 0, 240, 150).data); }, svg);
  const diff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d / a.length; };
  const wellFormed = (s) => page.evaluate((x) => !new DOMParser().parseFromString(x, 'image/svg+xml').querySelector('parsererror'), s);
  await page.locator('.drop input[type=file]').setInputFiles([f1, f2]); await page.locator('.svg-code').first().waitFor({ state: 'attached', timeout: 20000 });
  const outs = await page.$$eval('.svg-code', (p) => p.map((x) => x.textContent));
  ok(outs.length === 2 && outs[0].length < EDITOR.length * 0.6, `flag.svg shrinks (${EDITOR.length} → ${outs[0].length} characters)`);
  ok(!/inkscape|sodipodi|<!--|metadata|<\?xml/.test(outs[0]) && await wellFormed(outs[0]), 'editor data, comments, metadata and the XML declaration removed; output well-formed');
  ok(diff(await raster(EDITOR), await raster(outs[0])) < 0.5, `flag renders the same after optimising (mean pixel difference ${diff(await raster(EDITOR), await raster(outs[0])).toFixed(3)})`);
  const sp = readFileSync(f2, 'utf8'); ok(outs[1].length < sp.length && await wellFormed(outs[1]), `Lucide sprite shrinks (${sp.length} → ${outs[1].length})`);
  ok(diff(await raster(sp), await raster(outs[1])) < 0.5, `40 sprite icons render the same (diff ${diff(await raster(sp), await raster(outs[1])).toFixed(3)})`);
  ok(/2 files: .* → .* \(−\d+\.\d %\)/.test(await page.locator('.note-ok').first().textContent()), 'total for several files');
  ok(await page.locator('.svg-compare img').count() === 4, 'side-by-side previews');
  await page.locator('label.switch', { hasText: 'Pretty-print' }).click(); await page.waitForTimeout(500);
  const pretty = await page.locator('.svg-code').first().textContent(); ok(pretty.split('\n').length > 5 && await wellFormed(pretty), 'pretty-print indents the output');
  await page.locator('label.switch', { hasText: 'Pretty-print' }).click(); await page.locator('label.switch', { hasText: 'Safe mode' }).click(); await page.waitForTimeout(500);
  const safe = await page.locator('.svg-code').first().textContent(); ok(safe.length >= outs[0].length && diff(await raster(EDITOR), await raster(safe)) < 0.5, `safe mode: renders the same, not smaller than default (${safe.length} vs ${outs[0].length})`);
  const dl = await download(page, () => page.getByRole('button', { name: 'Download' }).first().click()); ok(/flag\.min\.svg$/.test(dl) && readFileSync(dl, 'utf8') === safe, 'download as flag.min.svg');
  await page.locator('.drop input[type=file]').setInputFiles(f3); await page.waitForTimeout(500); ok(/Not a valid SVG/.test(await page.locator('.note-warn').textContent()), 'broken SVG → message');
  await page.locator('textarea').fill('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><!-- hi --><rect width="10.000" height="10.000" fill="#ff0000"/></svg>'); await page.getByRole('button', { name: 'Optimise pasted SVG' }).click(); await page.waitForTimeout(500);
  ok(!/<!--/.test(await page.locator('.svg-code').textContent()) && /pasted\.svg/.test(await page.locator('.card-title', { hasText: 'pasted.svg' }).textContent()), 'pasted SVG optimised');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'svgo');
};
