// Graphviz (#/graphviz, PC only).
// What the page adds to the engine (which tests/unit/graphviz.test.mjs holds to native dot):
//  - text is measured with the browser's fonts: a label in any script fits its node (the reference is the browser's
//    own measurement of the same text in the same font, taken in the page);
//  - one layout gives picture and text output; the newest text wins; a long layout can be stopped;
//  - a drawing that no longer belongs to the text is dimmed and cannot be downloaded or copied;
//  - several graphs in one text, a graph's own layout=, line numbers with "Go to line";
//  - PNG at 1× / 2× / 4× within the canvas limits; file names; files in UTF-8, Latin-1, UTF-16; refusals;
//  - where Graphviz itself aborts the tab says which of its checks failed and draws the next graph;
//  - the SVG is an inert image; the worker ends when the tab is left; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { setValue, until, hookClipboard, copied } from './_devdata.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (ctx) => {
  const { base, page: newPage, ok, tmp, download, info: say } = ctx;
  const page = await newPage({ viewport: { width: 1400, height: 1000 } }); await page.goto(`${base}#/graphviz`);
  const src = page.locator('textarea[aria-label="DOT source"]'), textOut = page.locator('textarea[aria-label="Text output"]');
  const engine = page.getByRole('combobox', { name: 'Layout engine' }), fmt = page.getByRole('combobox', { name: 'Format' });
  const img = page.locator('img.gv-img'), status = page.locator('.gv-status'), infoLine = page.locator('.gv-info'), view = page.locator('.gv-view');
  const svgOf = () => page.evaluate(async () => { const i = document.querySelector('img.gv-img'); if (!i?.getAttribute('src')) return ''; return (await fetch(i.src)).text(); });
  /** the tab has answered the text that is in the editor (and the picture, if there is one, is loaded) */
  const settled = (timeout = 20000) => until(page, () => { const v = document.querySelector('.gv-view'), i = v.querySelector('img'); return v.getAttribute('aria-busy') === 'false' && (!i.getAttribute('src') || (i.complete && i.naturalWidth > 0)); }, null, timeout);
  const draw = async (text) => { await setValue(src, text); return settled(); };
  const count = (svg, cls) => (svg.match(new RegExp(`class="${cls}"`, 'g')) || []).length;
  const toasts = async () => (await page.locator('.toast').allTextContents()).join(' | ');
  const clearToasts = () => page.evaluate(() => document.querySelectorAll('.toast').forEach((x) => x.remove()));
  const stale = () => view.evaluate((v) => v.classList.contains('stale'));

  // ---- the first view ---------------------------------------------------------------------------------------------
  await settled();
  let svg = await svgOf();
  ok(count(svg, 'node') === 5 && count(svg, 'edge') === 5 && svg.includes('>Payment OK?</text>'), 'the first sample is drawn at once (5 nodes, 5 edges)');
  let line = await infoLine.textContent();
  ok(/^5 nodes · 5 edges · directed · laid out by dot in [\d.,]+ ms · Graphviz 16\.1\.0$/.test(line), `the line under the drawing: ${line}`);
  ok(!/own tables/.test(line), 'text is measured by the browser (no fallback to Graphviz\'s tables)');
  ok((await status.textContent()) === '' && !(await stale()), 'no messages, the drawing is current');

  // ---- samples and engines ----------------------------------------------------------------------------------------
  const samples = page.locator('.chips button'); const n = await samples.count(); let good = 0, quiet = 0;
  const expect = { Flowchart: [5, 5, 'dot'], Clusters: [5, 4, 'dot'], 'HTML table': [2, 1, 'dot'], 'State machine': [3, 5, 'dot'], Network: [10, 9, 'neato'], 'Mind map': [15, 14, 'twopi'], Cycle: [5, 5, 'circo'] };
  for (let i = 0; i < n; i++) {
    const name = await samples.nth(i).textContent(); await samples.nth(i).click(); await settled(); svg = await svgOf();
    const [nn, ne, eng] = expect[name] || [-1, -1, ''];
    if (count(svg, 'node') === nn && count(svg, 'edge') === ne && (await engine.inputValue()) === eng && new RegExp(`^${nn} nodes · ${ne} edges? · .* laid out by ${eng} `).test(await infoLine.textContent())) good++; else say(`${name}: ${count(svg, 'node')} nodes, ${count(svg, 'edge')} edges, ${await infoLine.textContent()}`);
    if ((await status.textContent()) === '') quiet++; else say(`${name}: ${await status.textContent()}`);
  }
  ok(good === n && n === 7, `all ${n} samples: the right nodes and edges, their engine chosen and named (${good})`);
  ok(quiet === n, `no sample brings a message with it (${quiet} of ${n}; "Network" asks for overlap=false, which needs the triangulation)`);
  await draw('digraph { a -> b -> c -> a; c -> d }'); let fine = 0; const msgs = [];
  for (const e of ['dot', 'neato', 'fdp', 'sfdp', 'circo', 'twopi', 'osage', 'patchwork']) {
    await engine.selectOption(e); await settled(); svg = await svgOf();
    if (count(svg, 'node') === 4 && count(svg, 'edge') === (e === 'patchwork' ? 0 : 4) && new RegExp(`laid out by ${e} `).test(await infoLine.textContent())) fine++; else say(`engine ${e}: ${count(svg, 'node')}/${count(svg, 'edge')}`);
    const m = await status.textContent(); if (m) msgs.push(`${e}: ${m}`);
  }
  ok(fine === 8, `all 8 engines draw the graph (${fine})`);
  ok(!msgs.length, `and none of them has a message — sfdp used to report a missing triangulation library on every drawing (${msgs.join(' | ')})`);
  await engine.selectOption('dot');

  // ---- text measured with the browser's fonts ----------------------------------------------------------------------
  // the box around a label = the label as this browser measures it + Graphviz's margins (2 × 0.11 in = 15.84 pt)
  const labels = [['Times,serif', '', 'नमस्ते दुनिया, यह एक लंबा लेबल है'], ['Times,serif', '', '漢字の長いラベルをここに書きます'], ['Times,serif', '', 'WWWWWWWWWWWWWWWWWWWW'], ['Times,serif', '', 'iiiiiiiiiiiiiiiiiiii'], ['Helvetica,sans-Serif', 'bold', 'Bold Helvetica label here'], ['Courier,monospace', '', 'monospace label 0123456789'], ['Noto Sans Devanagari', '', 'देवनागरी फ़ॉन्ट में'], ['Times,serif', '', 'مرحبا بالعالم العربي'], ['Times,serif', '', '😀 emoji and text 🎉']];
  const fontname = { 'Times,serif': 'Times-Roman', 'Helvetica,sans-Serif': 'Helvetica-Bold', 'Courier,monospace': 'Courier', 'Noto Sans Devanagari': 'Noto Sans Devanagari' };
  await draw(`digraph { node [shape=box]; ${labels.map(([fam, , text], i) => `n${i} [fontname="${fontname[fam]}" label="${text}"]`).join('; ')} }`);
  svg = await svgOf();
  const measured = await page.evaluate((ls) => { const c = document.createElement('canvas').getContext('2d'); return ls.map(([fam, weight, text]) => { c.font = `${weight} 14px ${fam.split(',').map((f) => (/^(serif|sans-serif|monospace)$/i.test(f) ? f.toLowerCase() : `"${f}"`)).join(', ')}`; return c.measureText(text).width; }); }, labels);
  let fit = 0;
  for (const [i, [, , text]] of labels.entries()) {
    const g = new RegExp(`<title>n${i}</title>\\s*<polygon[^>]*points="([^"]+)"`).exec(svg); if (!g) { say(`no box for n${i}`); continue; }
    const xs = g[1].trim().split(/\s+/).map((p) => +p.split(',')[0]), width = Math.max(...xs) - Math.min(...xs), want = Math.max(measured[i] + 15.84, 54);
    if (Math.abs(width - want) <= 1.5) fit++; else say(`"${text}": box ${width.toFixed(1)} pt, text ${measured[i].toFixed(1)} pt + margins = ${want.toFixed(1)}`);
  }
  ok(fit === labels.length, `${fit} of ${labels.length} boxes are as wide as the browser's own measurement of their label + margins (Devanagari, Japanese, Arabic, emoji, bold, monospace, wide and narrow Latin)`);
  ok(measured[2] > 2.5 * measured[3], `the measurement is real: twenty W are ${(measured[2] / measured[3]).toFixed(1)} times as wide as twenty i`);
  // HTML labels: bold and italic runs
  await draw('digraph { n [shape=box label=<plain <b>bold bold bold</b> <i>italic italic</i>>] }'); svg = await svgOf();
  const run = await page.evaluate(() => { const c = document.createElement('canvas').getContext('2d'); const w = (f, s) => { c.font = f; return c.measureText(s).width; }; return w('14px "Times", serif', 'plain ') + w('bold 14px "Times", serif', 'bold bold bold') + w('14px "Times", serif', ' ') + w('italic 14px "Times", serif', 'italic italic'); });
  { const g = /<title>n<\/title>\s*<polygon[^>]*points="([^"]+)"/.exec(svg), xs = g[1].trim().split(/\s+/).map((p) => +p.split(',')[0]), width = Math.max(...xs) - Math.min(...xs); ok(Math.abs(width - (run + 15.84)) <= 2, `an HTML label with bold and italic runs: box ${width.toFixed(1)} pt for ${run.toFixed(1)} pt of text`); }

  // ---- text formats: one layout for picture and text ---------------------------------------------------------------
  await draw('digraph { rankdir=LR; a -> b -> c }');
  await fmt.selectOption('plain'); await settled();
  const pos = Object.fromEntries((await textOut.inputValue()).split('\n').filter((l) => l.startsWith('node ')).map((l) => { const p = l.split(' '); return [p[1], [+p[2], +p[3]]]; }));
  ok(pos.a[0] < pos.b[0] && pos.b[0] < pos.c[0] && pos.a[1] === pos.c[1], `plain: rankdir=LR puts a, b, c left to right (${JSON.stringify(pos)})`);
  svg = await svgOf();
  { const xs = ['a', 'b', 'c'].map((k) => +new RegExp(`<title>${k}</title>\\s*<ellipse[^>]*cx="([\\d.]+)"`).exec(svg)[1]); ok(xs.every((x, i) => Math.abs(x - pos[['a', 'b', 'c'][i]][0] * 72) < 0.01), `picture and text come from the same layout: the SVG's node centres are the plain output's (${xs.join(', ')} pt)`); }
  await fmt.selectOption('json'); await settled();
  let shown = await textOut.inputValue(); const j = JSON.parse(shown); ok(j.objects.length === 3 && j.edges.length === 2 && j.edges.every((e) => e._draw_), 'JSON: 3 nodes, 2 edges with drawing operations');
  ok(/^\{\n  "name": /.test(shown), 'JSON is shown as Graphviz writes it');
  await fmt.selectOption('xdot'); await settled(); ok(/_draw_="/.test(await textOut.inputValue()), 'xdot');
  await fmt.selectOption('dot'); await settled(); ok(/a -> b\s+\[pos="/.test(await textOut.inputValue()), 'DOT with positions');
  await fmt.selectOption('canon'); await settled(); ok((await textOut.inputValue()).includes('a -> b;'), 'canon');
  let d = await download(page, () => page.locator('.card', { hasText: 'Text output' }).getByRole('button', { name: 'Download' }).click());
  ok(/graph\.canon\.dot$/.test(d) && readFileSync(d, 'utf8') === await textOut.inputValue(), 'the text output downloads as graph.canon.dot');
  await fmt.selectOption('json'); await settled();
  d = await download(page, () => page.locator('.card', { hasText: 'Text output' }).getByRole('button', { name: 'Download' }).click()); ok(/graph\.json$/.test(d) && JSON.parse(readFileSync(d, 'utf8')).edges.length === 2, 'and as graph.json');
  // a long result is cut on screen only
  await fmt.selectOption('plain'); await engine.selectOption('patchwork');
  await draw('graph { ' + Array.from({ length: 9000 }, (_, i) => `node_number_${i} [area=${1 + (i % 7)}]`).join('; ') + ' }');
  shown = await textOut.inputValue();
  ok(shown.length === 500000 && /Showing the first 5,00,000 of [\d,]+ characters/.test(await page.locator('.card', { hasText: 'Text output' }).textContent()), `a long text output: the box shows its first 5,00,000 characters and says so (${shown.length})`);
  await hookClipboard(page);
  await page.locator('.outbox').getByRole('button', { name: 'Copy' }).click(); await page.waitForTimeout(100);
  const all = (await copied(page))[0]; ok(all.length > 600000 && all.endsWith('stop\n') && (all.match(/^node /gm) || []).length === 9000, `Copy gives all of it (${all.length} characters, 9,000 nodes)`);
  d = await download(page, () => page.locator('.card', { hasText: 'Text output' }).getByRole('button', { name: 'Download' }).click()); ok(readFileSync(d, 'utf8') === all && /graph\.plain\.txt$/.test(d), 'and so does Download (graph.plain.txt)');
  await engine.selectOption('dot');

  // ---- errors: the last drawing stays, dimmed, and is not handed out ----------------------------------------------
  await draw('digraph { good -> drawing }'); const goodSvg = await svgOf();
  await draw('digraph {\n  good -> drawing;\n  broken -> ;\n}');
  ok(/Error: syntax error in line 3 near ';'/.test(await status.textContent()) && /last text that could be drawn/.test(await status.textContent()), `a syntax error is reported with its line (${(await status.textContent()).slice(0, 80)})`);
  ok(await stale() && (await svgOf()) === goodSvg && (await infoLine.textContent()) === '', 'the last good drawing stays, dimmed, without its info line');
  ok((await page.evaluate(() => getComputedStyle(document.querySelector('.gv-img')).opacity)) < 0.5, 'dimmed for the eye too');
  let refused = 0; page.errors.length = 0;
  for (const name of ['Download SVG', 'Download PNG', 'Copy SVG']) { await clearToasts(); const dl = page.waitForEvent('download', { timeout: 700 }).then(() => true, () => false); await page.getByRole('button', { name }).click(); if (!(await dl) && /earlier text/.test(await toasts())) refused++; }
  await clearToasts(); { const dl = page.waitForEvent('download', { timeout: 700 }).then(() => true, () => false); await page.locator('.card', { hasText: 'Text output' }).getByRole('button', { name: 'Download' }).click(); if (!(await dl) && /earlier text/.test(await toasts())) refused++; }
  ok(refused === 4 && (await copied(page)).length === 1, `while the text has an error, SVG, PNG, Copy and the text download are refused with the reason (${refused} of 4)`);
  page.errors.length = 0;   // the refusals above are logged on purpose
  await page.getByRole('button', { name: 'Go to line 3' }).click();
  ok(await src.evaluate((e) => e.value.slice(e.selectionStart, e.selectionEnd)) === '  broken -> ;' && await src.evaluate((e) => document.activeElement === e), '"Go to line 3" selects the line in the editor');
  await draw('digraph {\n  good -> drawing;\n  fixed -> again;\n}');
  ok(!(await stale()) && (await status.textContent()) === '' && count(await svgOf(), 'node') === 4, 'put right: drawn, current, no message');
  await draw(''); ok(/Type a graph in the DOT language/.test(await status.textContent()) && !(await img.getAttribute('src')) && (await textOut.inputValue()) === '' && (await infoLine.textContent()) === '', 'an empty editor: a hint instead of an error, nothing shown');
  await clearToasts(); await page.getByRole('button', { name: 'Download SVG' }).click(); ok(/Nothing to save yet/.test(await toasts()), 'nothing to download from an empty editor'); page.errors.length = 0; await clearToasts();
  await draw('   \n// only a comment\n'); ok(/there is no graph in this text/.test(await status.textContent()), 'a text of comments: "there is no graph in this text"');
  await draw('digraph { x [shape=nosuch]; y [shape=nosuch]; z [shape=nosuch]; x -> y -> z }');
  ok(/^Warning: using box for unknown shape nosuch$/.test(await status.textContent()) && count(await svgOf(), 'node') === 3 && !(await stale()), `a warning comes with the drawing (${await status.textContent()})`);
  await draw(`digraph { ${Array.from({ length: 12 }, (_, i) => `n${i} [shape=nosuch${i}]`).join('; ')} }`);
  ok(/unknown shape nosuch0.*unknown shape nosuch7… and 4 more messages$/.test(await status.textContent()) && !/nosuch8/.test(await status.textContent()), `twelve warnings: eight shown, "and 4 more" (${(await status.textContent()).slice(-60)})`);
  await draw('digraph {\n\n\n  n [label=<<table><tr><td>x</td></table>>]\n}');
  ok(/Error: mismatched tag in line 1/.test(await status.textContent()) && /in label of node n/.test(await status.textContent()) && count(await svgOf(), 'node') === 1 && !(await stale()), `a broken HTML label: Graphviz draws the node and says what is wrong (${(await status.textContent()).slice(0, 80)})`);
  ok(!(await page.getByRole('button', { name: /Go to line/ }).count()), 'no "Go to line" for it: that line number counts within the label, not in the editor');

  // ---- several graphs in one text ---------------------------------------------------------------------------------
  const which = page.getByRole('combobox', { name: 'Which graph of the text' });
  ok(!(await which.isVisible()), 'one graph: no graph chooser');
  await draw('digraph first { a -> b }\ngraph second {\n  c -- d -- e\n}\ndigraph third { rankdir=LR; f -> g; g -> h; h -> f }');
  ok(await which.isVisible() && (await which.locator('option').allTextContents()).join() === '1 of 3,2 of 3,3 of 3' && /^2 nodes · 1 edge · directed/.test(await infoLine.textContent()), 'three graphs in the text: a chooser appears, the first is drawn');
  await which.selectOption('1'); await settled(); ok(/^3 nodes · 2 edges · undirected/.test(await infoLine.textContent()) && (await svgOf()).includes('<title>second</title>'), 'graph 2 of 3 is the undirected one');
  d = await download(page, () => page.getByRole('button', { name: 'Download SVG' }).click()); ok(/graph-2\.svg$/.test(d) && readFileSync(d, 'utf8').includes('<title>second</title>'), 'its SVG downloads as graph-2.svg');
  await which.selectOption('2'); await settled(); ok(/^3 nodes · 3 edges · directed/.test(await infoLine.textContent()), 'graph 3 of 3');
  await draw('digraph first { a -> b }\ngraph second {\n  c -- d -- e\n}'); ok((await which.inputValue()) === '1' && (await which.locator('option').count()) === 2 && /undirected/.test(await infoLine.textContent()), 'the third graph deleted: the chooser shows 2 of 2');
  await draw('digraph first { a -> b }\ngraph second {\n  c -- d -- e\n}\ndigraph third {\n  f -> ;\n}');
  ok(/syntax error in line 6 near ';'/.test(await status.textContent()) && !(await stale()) && /undirected/.test(await infoLine.textContent()), `an error in a later graph: the chosen one is drawn, the message names line 6 of the whole text (${await status.textContent()})`);
  await draw('digraph only { a -> b }'); ok(!(await which.isVisible()), 'one graph again: the chooser is gone');

  // ---- a graph that names its own engine --------------------------------------------------------------------------
  await draw('graph { layout=circo; a -- b -- c -- d -- a }');
  ok(/laid out by circo/.test(await infoLine.textContent()) && /sets layout=circo, so circo laid it out/.test(await status.textContent()) && (await engine.inputValue()) === 'dot', 'layout=circo in the graph: circo draws it, and the tab says why the chosen engine did not');
  await draw('graph { layout=nosuch; a -- b }'); ok(/Layout type: "nosuch" not recognized/.test(await status.textContent()), 'an unknown layout= is reported');

  // ---- overlap removal that needs the triangulation ---------------------------------------------------------------
  await engine.selectOption('neato'); await fmt.selectOption('plain');
  const overlaps = async () => { const ns = (await textOut.inputValue()).split('\n').filter((l) => l.startsWith('node ')).map((l) => { const w = l.split(' '); return { x: +w[2], y: +w[3], w: +w[4], h: +w[5] }; }); let c = 0; for (let i = 0; i < ns.length; i++) for (let k = i + 1; k < ns.length; k++) if (Math.abs(ns[i].x - ns[k].x) < (ns[i].w + ns[k].w) / 2 - 1e-6 && Math.abs(ns[i].y - ns[k].y) < (ns[i].h + ns[k].h) / 2 - 1e-6) c++; return [c, ns.length]; };
  const wide = 'node [width=2.2 height=0.9]; ' + Array.from({ length: 24 }, (_, i) => `n${i} -- n${(i * 7 + 3) % 24}`).join('; ');
  await draw(`graph { overlap=true; ${wide} }`); const before = await overlaps();
  await draw(`graph { overlap=prism; ${wide} }`); const after = await overlaps();
  ok(before[0] > 0 && after[0] === 0 && after[1] === 24 && (await status.textContent()) === '', `overlap=prism: ${before[0]} overlapping pairs of nodes become ${after[0]}, without a message`);
  await engine.selectOption('sfdp'); await draw(`graph { ${wide} }`); const sf = await overlaps(); ok(sf[0] === 0 && (await status.textContent()) === '', 'sfdp removes overlaps by itself (prism is its default)');
  await engine.selectOption('dot');

  // ---- PNG ---------------------------------------------------------------------------------------------------------
  await draw('digraph { back -> again }'); svg = await svgOf();
  const pt = /<svg width="(\d+)pt" height="(\d+)pt"/.exec(svg), px = [Math.round(+pt[1] * 4 / 3), Math.round(+pt[2] * 4 / 3)];
  const pngDims = (f) => { const b = readFileSync(f); return b.slice(1, 4).toString() === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };
  const scale = page.getByRole('combobox', { name: 'PNG size' });
  for (const s of [1, 2, 4]) {
    await scale.selectOption(String(s)); d = await download(page, () => page.getByRole('button', { name: 'Download PNG' }).click()); const dims = pngDims(d);
    ok(dims && Math.abs(dims[0] - px[0] * s) <= s && Math.abs(dims[1] - px[1] * s) <= s && /graph\.png$/.test(d), `PNG at ${s}×: ${dims?.join(' × ')} pixels for a drawing of ${px.join(' × ')}`);
  }
  ok(/^PNG saved: [\d,]+ × [\d,]+ pixels\.$/.test(await page.locator('.gv-png-note').textContent()), `the size of the saved PNG is said (${await page.locator('.gv-png-note').textContent()})`);
  // a drawing wider than a canvas can be
  await scale.selectOption('2'); await draw('digraph { rankdir=LR; nodesep=0.1; ' + Array.from({ length: 150 }, (_, i) => `n${i} -> n${i + 1}`).join('; ') + ' }');
  svg = await svgOf(); const widePt = +/<svg width="(\d+)pt"/.exec(svg)[1];
  d = await download(page, () => page.getByRole('button', { name: 'Download PNG' }).click()); let dims = pngDims(d);
  ok(widePt * 4 / 3 * 2 > 16384 && dims[0] === 16384 && /too large for 2×: the PNG is 16,384 × \d+ pixels/.test(await page.locator('.gv-png-note').textContent()), `a drawing ${Math.round(widePt * 4 / 3)} px wide at 2×: the PNG is made as large as a canvas can be (${dims.join(' × ')}) and the tab says so`);
  d = await download(page, () => page.getByRole('button', { name: 'Download SVG' }).click()); ok(readFileSync(d, 'utf8') === svg, 'the SVG has no such limit');
  // the picture: white paper, the drawing on it
  await draw('digraph { a [style=filled fillcolor="#ff0000" shape=box width=2 height=2 label=""] }'); await scale.selectOption('1');
  d = await download(page, () => page.getByRole('button', { name: 'Download PNG' }).click());
  const colours = await page.evaluate(async (b64) => { const im = new Image(); im.src = `data:image/png;base64,${b64}`; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return [[...g.getImageData(1, 1, 1, 1).data], [...g.getImageData(im.width >> 1, im.height >> 1, 1, 1).data]]; }, readFileSync(d).toString('base64'));
  ok(colours[0].join() === '255,255,255,255' && colours[1].join() === '255,0,0,255', `the PNG: white paper at the corner, the red node in the middle (${colours.join(' / ')})`);

  // ---- zoom --------------------------------------------------------------------------------------------------------
  await draw('digraph { a -> b }'); const nat = await img.evaluate((i) => i.naturalWidth);
  await page.getByRole('radio', { name: '200 %' }).click(); ok(Math.abs(await img.evaluate((i) => i.getBoundingClientRect().width) - 2 * nat) <= 1, '200 %: the picture is twice its size');
  await page.getByRole('radio', { name: '100 %' }).click(); ok(Math.abs(await img.evaluate((i) => i.getBoundingClientRect().width) - nat) <= 1, '100 %: its own size');
  await page.getByRole('radio', { name: 'Fit' }).click(); ok(await img.evaluate((i) => i.getBoundingClientRect().width <= i.parentElement.clientWidth), 'Fit: never wider than its frame');

  // ---- the SVG shown is inert; characters XML forbids ---------------------------------------------------------------
  await draw('digraph { evil [URL="javascript:window.__pwned=1", label="click"] }');
  const box = await img.boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(200);
  ok(!(await page.evaluate(() => window.__pwned)) && (await svgOf()).includes('javascript:'), 'SVG shown as an image: links and scripts in the graph are inert');
  await draw('digraph { a [label="bell\u0007 and escape\u001b here"] }');
  ok(await img.evaluate((i) => i.naturalWidth > 0) && /2 control characters in the labels were left out of the SVG/.test(await status.textContent()) && (await svgOf()).includes('>bell and escape here</text>'), `control characters in a label: left out of the SVG (XML forbids them), with a note, and the picture shows (${await status.textContent()})`);

  // ---- where Graphviz itself gives up -------------------------------------------------------------------------------
  await engine.selectOption('circo'); await draw('digraph { splines=ortho; a -> b -> c; a -> c; c -> a; b -> b }');
  let said = await status.textContent();
  ok(/could not finish this graph: Graphviz stopped at one of its own checks \("cp" in chanSearch, ortho\.c line 390\)/.test(said) && /dot program has too/.test(said) && await stale(), `a graph on which Graphviz fails an assertion: the tab names the check (${said.slice(0, 150)})`);
  await draw('digraph { splines=ortho; a -> b -> c; a -> c; c -> a }'); ok(!(await stale()) && count(await svgOf(), 'node') === 3 && (await status.textContent()) === '', 'the next graph is drawn (a new instance of the engine)');
  await engine.selectOption('dot');

  // ---- the newest text wins; a long layout can be stopped ---------------------------------------------------------
  const heavy = 'digraph { ' + Array.from({ length: 700 }, (_, i) => `n${i} -> n${(i * 7 + 3) % 700}; n${i} -> n${(i * 13 + 1) % 700}; n${i} -> n${(i * 29 + 5) % 700};`).join(' ') + ' }';
  await setValue(src, heavy); await page.getByRole('button', { name: 'Stop' }).waitFor({ timeout: 8000 });
  ok(await stale(), 'while a long layout runs the old drawing is dimmed and "Laying out…" shows');
  await page.getByRole('button', { name: 'Stop' }).click(); await settled(3000);
  ok(/Stopped/.test(await status.textContent()) && !(await page.getByRole('button', { name: 'Stop' }).isVisible()), 'Stop ends it');
  await draw('digraph { back -> again }'); ok((await svgOf()).includes('>again</text>') && !(await stale()), 'and the tab draws again (a fresh worker)');
  // typing on while a long layout runs: no Stop needed
  await setValue(src, heavy); await page.waitForTimeout(700);
  const t0 = Date.now(); await setValue(src, 'digraph { newest -> text }'); await settled(8000); const took = Date.now() - t0;
  ok((await svgOf()).includes('>newest</text>') && (await status.textContent()) === '' && took < 4000, `a newer text ends the long layout by itself: drawn after ${took} ms, no message`);
  // Ctrl+Enter draws at once
  await src.evaluate((e) => { e.value = 'digraph { at -> once }'; }); await src.press('Control+Enter'); await settled();
  ok((await svgOf()).includes('>once</text>'), 'Ctrl+Enter draws without waiting for a pause in typing');

  // ---- files -------------------------------------------------------------------------------------------------------
  const file = page.locator('.drop input[type=file]'), put = (name, bytes) => { const f = join(tmp, name); writeFileSync(f, bytes); return f; };
  await file.setInputFiles(put('my graph.gv', 'graph { opened -- file }')); await settled();
  ok((await svgOf()).includes('>opened</text>') && (await src.inputValue()) === 'graph { opened -- file }', 'a .gv file is opened and drawn');
  d = await download(page, () => page.getByRole('button', { name: 'Download SVG' }).click()); ok(/my graph\.svg$/.test(d), 'downloads are named after it: my graph.svg');
  d = await download(page, () => page.getByRole('button', { name: 'Download PNG' }).click()); ok(/my graph\.png$/.test(d), 'my graph.png');
  d = await download(page, () => page.getByRole('button', { name: 'Download .dot' }).click()); ok(/my graph\.gv$/.test(d) && readFileSync(d, 'utf8') === 'graph { opened -- file }', 'and the source under its own name');
  await file.setInputFiles(put('latin.gv', Buffer.from('digraph { charset=latin1; a [label="Gr\xf6\xdfe \xa3 \xe9"]; a -> "\xd1and\xfa" }', 'latin1'))); await settled();
  svg = await svgOf(); ok(svg.includes('>Größe £ é</text>') && svg.includes('>Ñandú</text>') && /latin\.gv is not UTF-8: read as Windows-1252/.test(await page.locator('.card').first().textContent()), 'a Latin-1 file: read as such, said so, drawn with its characters');
  await file.setInputFiles(put('utf16.gv', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('digraph { "नमस्ते" -> "₹ 500" }', 'utf16le')]))); await settled();
  svg = await svgOf(); ok(svg.includes('>नमस्ते</text>') && svg.includes('>₹ 500</text>') && /read as UTF-16/.test(await page.locator('.card').first().textContent()), 'a UTF-16 file (as Notepad saves "Unicode")');
  await file.setInputFiles(put('bom.gv', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('digraph { bom -> ok }')]))); await settled();
  ok((await src.inputValue()) === 'digraph { bom -> ok }' && (await status.textContent()) === '' && !/not UTF-8/.test(await page.locator('.card').first().textContent()), 'a UTF-8 file with a byte order mark: the mark does not reach Graphviz');
  page.errors.length = 0; await clearToasts();
  await file.setInputFiles(put('picture.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]))); await settled(); await until(page, () => !!document.querySelector('.toast'));
  ok(/picture\.png is not a text file/.test(await toasts()) && (await src.inputValue()) === 'digraph { bom -> ok }', 'a file that is not text is refused and the editor keeps its graph'); await clearToasts();
  await file.setInputFiles(put('huge.gv', Buffer.alloc(21 * 1024 * 1024, 0x20))); await settled(); await until(page, () => !!document.querySelector('.toast'));
  ok(/huge\.gv is 21 MB — too large to edit here/.test(await toasts()) && (await src.inputValue()) === 'digraph { bom -> ok }', 'a file of 21 MB is refused with the limit'); await clearToasts();
  page.errors.length = 0;   // the two refusals are logged on purpose
  // a sample forgets the file's name
  await samples.nth(0).click(); await settled(); d = await download(page, () => page.getByRole('button', { name: 'Download .dot' }).click()); ok(/graph\.dot$/.test(d), 'after picking a sample the downloads are "graph" again');

  // ---- copy ---------------------------------------------------------------------------------------------------------
  await draw('digraph { copy -> me }'); await page.evaluate(() => { window.__copied = []; }); await page.getByRole('button', { name: 'Copy SVG' }).click(); await page.waitForTimeout(100);
  ok((await copied(page))[0] === await svgOf() && (await copied(page))[0].includes('>copy</text>'), 'Copy SVG copies the drawing that is shown');

  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await page.goto(`${base}#/`); await page.waitForTimeout(300);
  const live = await page.evaluate(() => globalThis.__superutilsLive()); ok(live.workers === 0 && !live.resources.some((r) => /graphviz/.test(r)), `worker and module released on leave (${JSON.stringify(live)})`);
  await pcOnlyOnPhone(ctx, 'graphviz');
  // leaving the tab lets go of what it made: its results' blob URLs (they kept the files in memory until the page reloaded)
  { const had = await page.evaluate((id) => [...window.__blobs.values()].filter((b) => b.at.startsWith(`#/${id}`) && !b.download && !/javascript/.test(b.type)).length, 'graphviz');
    const kept = await ctx.released(page, 'graphviz');
    ok(kept.length === 0, `leaving the tab: ${had} blob URLs it held are let go (${kept.length} kept${kept.length ? ': ' + kept.map((b) => `${b.type} ${Math.round(b.size / 1024)} KB ${b.from}`).join(', ') : ''})`); }
};
