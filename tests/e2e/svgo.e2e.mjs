// SVG Optimizer (#/svgo, PC only): editor-style SVGs (comments, metadata, Inkscape/Sodipodi namespaces, long decimals,
// default attributes, empty groups) and the 1,600-icon Lucide sprite get smaller; output is well-formed XML; the
// optimised image RENDERS THE SAME (both rasterised in the page, pixel difference), safe mode, pretty-print, several
// files, broken SVG message, download, nothing loaded before a file is chosen; files with a DOCTYPE (most editor
// exports — they used to be refused) and Illustrator entities; 130 drawings that optimisers get wrong
// (tests/fixtures/svg/hazards.json): every final result is rasterised HERE and must look like its original — where the
// full optimisation changes the picture the tab falls back to the safe result and says so; safe mode changes none;
// .svgz, UTF-16 and Latin-1 files; a result is never larger than the original; deep nesting refused and the engine
// keeps working; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
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
  ok(/^2 of 2 files optimised: .* → .* \(−\d+\.\d %\)$/.test(await page.locator('.note-ok').first().textContent()), `total for several files (${await page.locator('.note-ok').first().textContent()})`);
  ok(await page.locator('.svg-check').count() === 2 && /looks the same as the original/.test(await page.locator('.svg-check').first().textContent()), 'each result is rendered and compared with its original by the tab');
  ok(await page.locator('.svg-compare img').count() === 4, 'side-by-side previews');
  await page.locator('label.switch', { hasText: 'Pretty-print' }).click(); await page.waitForTimeout(500);
  const pretty = await page.locator('.svg-code').first().textContent(); ok(pretty.split('\n').length > 5 && await wellFormed(pretty), 'pretty-print indents the output');
  await page.locator('label.switch', { hasText: 'Pretty-print' }).click(); await page.locator('label.switch', { hasText: 'Safe mode' }).click(); await page.waitForTimeout(500);
  const safe = await page.locator('.svg-code').first().textContent(); ok(safe.length >= outs[0].length && diff(await raster(EDITOR), await raster(safe)) < 0.5, `safe mode: renders the same, not smaller than default (${safe.length} vs ${outs[0].length})`);
  const dl = await download(page, () => page.getByRole('button', { name: 'Download' }).first().click()); ok(/flag\.min\.svg$/.test(dl) && readFileSync(dl, 'utf8') === safe, 'download as flag.min.svg');
  await page.locator('.drop input[type=file]').setInputFiles(f3); await page.waitForTimeout(500); ok(/Not a valid SVG/.test(await page.locator('.note-warn').textContent()), 'broken SVG → message');
  await page.locator('textarea').fill('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><!-- hi --><rect width="10.000" height="10.000" fill="#ff0000"/></svg>'); await page.getByRole('button', { name: 'Optimise pasted SVG' }).click(); await page.waitForTimeout(500);
  ok(!/<!--/.test(await page.locator('.svg-code').textContent()) && /pasted\.svg/.test(await page.locator('.card-title', { hasText: 'pasted.svg' }).textContent()), 'pasted SVG optimised');
  // ---- DOCTYPE and entities
  const S = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">${body}</svg>`;
  const cards = () => page.$$eval('.tool-body .stack > .card', (cs) => cs.map((c) => ({ name: c.querySelector('.card-title')?.textContent, warn: c.querySelector('.note-warn')?.textContent || '', info: c.querySelector('.note-info')?.textContent || '', check: c.querySelector('.svg-check')?.textContent || '', code: c.querySelector('.svg-code')?.textContent ?? null, kv: [...c.querySelectorAll('.kv span')].map((x) => x.textContent) })));
  const give = async (files) => { await page.locator('.drop input[type=file]').setInputFiles(files); await page.waitForFunction((n) => document.querySelectorAll('.tool-body .stack > .card').length === n && !document.querySelector('.tool-body .stack > .card .card-title')?.textContent.includes('pasted'), files.length, { timeout: 60000 }); await page.waitForTimeout(200); return cards(); };
  const file = (name, content) => { const f = join(tmp, name); writeFileSync(f, content); return f; };
  if (await page.locator('label.switch', { hasText: 'Safe mode' }).locator('input').isChecked()) await page.locator('label.switch', { hasText: 'Safe mode' }).click();
  const dt = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n${S('<rect width="60" height="60" fill="red"/>')}`;
  const ai = '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [\n<!ENTITY ns_svg "http://www.w3.org/2000/svg">\n]>\n<svg xmlns="&ns_svg;" width="120" height="120"><rect width="60" height="60" fill="red"/></svg>';
  let c = await give([file('doctype.svg', dt), file('illustrator.svg', ai)]);
  ok(c[0].code === S('<path fill="red" d="M0 0h60v60H0Z"/>') && !c[0].warn && /looks the same/.test(c[0].check), `a file with the SVG 1.1 DOCTYPE is optimised (${c[0].warn || c[0].code}) — it used to be refused as "XML with DTD"`);
  ok(c[1].code?.includes('xmlns="http://www.w3.org/2000/svg"') && !/ENTITY|&ns_svg;/.test(c[1].code) && /looks the same/.test(c[1].check), 'Illustrator-style entities in the DOCTYPE are expanded');
  // ---- encodings and .svgz; "Before" is the size of the file itself
  const plain = S('<text x="5" y="50">café ₹</text><!-- note -->');
  const u16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`<?xml version="1.0" encoding="UTF-16"?>${plain}`, 'utf16le')]);
  const l1 = Buffer.from(`<?xml version="1.0" encoding="ISO-8859-1"?>${S('<text x="5" y="50">caf\xe9</text><!-- note -->')}`, 'latin1'), gz = gzipSync(Buffer.from(plain));
  c = await give([file('utf16.svg', u16), file('latin1.svg', l1), file('packed.svgz', gz), file('damaged.svgz', Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0])), file('empty.svg', '')]);
  ok(c[0].code === S('<text x="5" y="50">café ₹</text>') && c[0].kv[1].includes(`(${u16.length.toLocaleString('en-IN')} bytes)`), `UTF-16 file read; "Before" is the file's own ${u16.length} bytes (${c[0].kv[1]})`);
  ok(c[1].code === S('<text x="5" y="50">café</text>'), `Latin-1 file: é survives (${c[1].code})`);
  ok(c[2].code === S('<text x="5" y="50">café ₹</text>') && c[2].kv[1].includes(`(${gz.length} bytes)`), '.svgz is unpacked and optimised');
  ok(/damaged/.test(c[3].warn) && c[4].warn === 'This file is empty', 'a damaged .svgz and an empty file are reported, the others still done');
  ok(/^3 of 5 files optimised: .* · 2 could not be read$/.test(await page.locator('.tool-body .stack > .note').first().textContent()), `total counts what worked (${await page.locator('.tool-body .stack > .note').first().textContent()})`);
  const dz = await download(page, () => page.locator('.tool-body .stack > .card', { hasText: 'packed.svgz' }).getByRole('button', { name: 'Download' }).click()); ok(/packed\.min\.svg$/.test(dz) && readFileSync(dz, 'utf8') === c[2].code, '.svgz downloads as packed.min.svg (plain text)');
  // ---- the hazard drawings: whatever the tab hands back must look like the original
  const haz = JSON.parse(readFileSync(new URL('../fixtures/svg/hazards.json', import.meta.url), 'utf8')).cases; mkdirSync(join(tmp, 'haz'), { recursive: true });
  const hfiles = haz.map((h) => file(`haz/${h.name}.svg`, h.svg));
  const look = (pairs) => page.evaluate(async (ps) => { const ras = async (s2) => { const img = new Image(); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s2)}`; try { await img.decode(); } catch { return null; } const c2 = new OffscreenCanvas(200, 200), g = c2.getContext('2d'); g.fillStyle = '#9ab'; g.fillRect(0, 0, 200, 200); g.drawImage(img, 0, 0, 200, 200); return g.getImageData(0, 0, 200, 200).data; };
    const out = []; for (const [a, b] of ps) { const A = await ras(a), B = b === null ? null : await ras(b); if (!A) { out.push(-1); continue; } if (!B) { out.push(999); continue; } let big = 0; for (let i = 0; i < A.length; i += 4) if (Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2])) > 64) big++; out.push(big / (A.length / 4)); } return out; }, pairs);
  c = await give(hfiles);
  const byName = Object.fromEntries(c.map((x) => [x.name.replace(/\.svg$/, ''), x])), errs = c.filter((x) => x.code === null).map((x) => `${x.name}: ${x.warn}`);
  ok(c.length === haz.length && errs.every((e) => /unknown namespace prefix|unknown entity/.test(e)), `${haz.length} hazard drawings: all optimised (${errs.length} are not valid XML and say so) ${errs.filter((e) => !/unknown namespace prefix|unknown entity/.test(e)).slice(0, 2).join(' | ')}`);
  let d = await look(haz.map((h) => [h.svg, byName[h.name]?.code ?? null]));
  const changed = haz.filter((h, i) => byName[h.name]?.code !== null && d[i] > 0.01).map((h, i2) => h.name);
  ok(changed.length === 0, `full optimisation: every result looks like its original when rasterised here (more than 1 % of pixels changed: ${changed.join(', ') || 'none'})`);
  const fell = c.filter((x) => /only the safe changes were made/.test(x.info)).map((x) => x.name.replace(/\.svg$/, ''));
  const keptNow = c.filter((x) => /already as small/.test(x.info)).map((x) => x.name.replace(/\.svg$/, '')), guarded = [...fell, ...keptNow];
  const known = ['group-collapse-opacity', 'inherit-via-style-elem', 'css-hover-and-attr-selectors', 'smil-hidden-revealed', 'css-id-descendant', 'css-child-combinator', 'opacity-group-child-opacity', 'micro-viewbox-precision', 'path-zero-length-caps'];
  ok(known.every((n) => guarded.includes(n)) && fell.length >= 5 && guarded.length < 40, `the ${known.length} drawings the full optimisation is known to change were caught: ${fell.length} got the safe result, ${keptNow.length} were left as they are (not caught: ${known.filter((n) => !guarded.includes(n)).join(', ') || 'none'})`);
  ok(c.every((x) => !/does not look the same/.test(x.warn)), 'no result is handed back with a "looks different" warning');
  ok(c.filter((x) => /could not be drawn/.test(x.info)).map((x) => x.name).join() === 'no-xmlns.svg', 'the one drawing a browser cannot show (no xmlns) is said to be unchecked');
  const bigger = c.filter((x) => x.code !== null && /Larger by/.test(x.kv.join(' '))).map((x) => x.name); ok(!bigger.length, `no result is larger than its original ${bigger.join(', ')}`);
  await page.locator('label.switch', { hasText: 'Safe mode' }).click(); await page.waitForTimeout(300); await page.waitForFunction(() => !document.querySelector('.tool-body .stack > .card .note-info')?.textContent.includes('only the safe changes'), null, { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(800);
  c = await cards(); const by2 = Object.fromEntries(c.map((x) => [x.name.replace(/\.svg$/, ''), x]));
  d = await look(haz.map((h) => [h.svg, by2[h.name]?.code ?? null]));
  const changed2 = haz.filter((h, i) => by2[h.name]?.code !== null && d[i] > 0.002).map((h) => h.name);
  ok(changed2.length === 0 && c.every((x) => !/only the safe changes|does not look the same/.test(x.info + x.warn)), `safe mode: no drawing changes at all (${changed2.join(', ') || 'none'})`);
  const kept = c.filter((x) => /already as small/.test(x.info)); ok(kept.length >= 1 && kept.every((x) => x.kv[5] === '0.0 %' && x.code === haz.find((h) => `${h.name}.svg` === x.name).svg), `${kept.length} drawings safe mode cannot shrink are handed back unchanged, never larger`);
  await page.locator('label.switch', { hasText: 'Safe mode' }).click(); await page.waitForTimeout(300);
  // ---- nesting limit, not SVG, and the engine afterwards
  c = await give([file('deep.svg', S('<g>'.repeat(600) + '<rect width="5" height="5"/>' + '</g>'.repeat(600))), file('notsvg.svg', '<a><b/></a>'), file('text.svg', 'hello'), file('fine.svg', S('<rect width="60" height="60" fill="#ff0000"/>'))]);
  ok(c[0].warn === 'This SVG nests elements 602 levels deep; the optimiser handles up to 256' && c[1].warn === 'This file is XML, but not an SVG (it has no <svg> element)' && /Not a valid SVG/.test(c[2].warn), 'too deep, not SVG, not XML: each says why');
  ok(c[3].code === S('<path fill="red" d="M0 0h60v60H0Z"/>'), 'the next file is still optimised (a deep file used to break the engine until the tab was reopened)');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await page.locator('.tool-body .stack > .card', { hasText: 'fine.svg' }).getByRole('button', { name: 'Copy' }).click(); const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
  if (clip !== null) ok(clip === c[3].code, 'Copy puts the optimised code on the clipboard');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'svgo');
};
