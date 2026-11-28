// Diagram Editor (#/diagram, PC only; potentials #54) end to end: draw.io 32.7.7 served from this site in a frame with its own
// Content-Security-Policy — it starts, sends no request to another site and keeps nothing in the browser (no localStorage, database,
// cookies, cache or service worker); a shape put in and labelled like a user would; Save (.drawio, and draw.io's own Ctrl+S) read
// back by Python's XML reader; the editable PNG (Pillow reads the diagram in its text chunk) and SVG (its content attribute; drawn by
// librsvg); PDF opens draw.io's print dialog; Open — the .drawio, the PNG and the SVG just saved, a Visio drawing made with Visio
// (vsdx's media.vsdx), Gliffy, Mermaid and PlantUML text — and what it refuses; New… with draw.io's templates; "Unsaved changes" and the
// page asking before it is closed; the diagram kept while the page is open; the editor that cannot be fetched; leaving the tab;
// WCAG 2.2 A / AA on the tab's own controls in both themes; the phone.
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from '../lib/child.mjs';
import { pcOnlyOnPhone } from './_pconly.mjs';
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const FIX = new URL('../fixtures/diagram/', import.meta.url);
const rsvg = (() => { for (const d of (process.env.PATH || '').split(delimiter)) { const p = join(d, 'rsvg-convert'); if (d && existsSync(p)) return p; } return null; })();
const py = (code, ...args) => JSON.parse(execFileSync('python3', ['-I', '-c', code, ...args], { encoding: 'utf8' }));

export default async (ctx) => {
  const { base, page: newPage, ok, download, tmp, released } = ctx;
  const origin = new URL(base).origin;
  const page = await newPage({ viewport: { width: 1366, height: 900 } });
  const outside = new Set(), csp = [];
  page.context().on('request', (r) => { const u = r.url(); if (!u.startsWith(origin) && !/^(data|blob|about):/.test(u)) outside.add(u); });
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); });
  const dialogs = [];
  page.on('dialog', async (d) => { dialogs.push(`${d.type()}: ${d.message()}`); await (page.acceptNext || d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {}); });

  const t0 = Date.now();
  await page.goto(`${base}#/diagram`);
  const frame = () => page.frames().find((f) => /\/drawio\/index\.html/.test(f.url()));
  const btn = (name) => page.getByRole('button', { name, exact: true });
  const status = () => page.locator('.dg-status').textContent();
  const ready = async () => { await page.waitForFunction(() => { const b = [...document.querySelectorAll('.dg-bar button')].find((x) => x.textContent.trim() === 'Save'); return b && !b.disabled; }, null, { timeout: 60000 }); };
  const model = () => frame().evaluate(() => { const g = window.superutilsEditor.editor.graph; return Object.values(g.model.cells).filter((c) => c.vertex || c.edge).map((c) => ({ v: !!c.vertex, label: String(g.convertValueToString(c) || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() })); });
  const labels = async () => (await model()).map((c) => c.label).filter(Boolean);
  const pages = () => frame().evaluate(() => (window.superutilsEditor.pages || []).length);
  const pick = async (file, setFiles) => { const chooser = page.waitForEvent('filechooser'); await btn('Open…').click(); await (await chooser).setFiles(setFiles ?? file); };
  const toastText = async () => { await page.locator('.toast').last().waitFor({ timeout: 20000 }); return page.locator('.toast').last().textContent(); };
  const away = async () => { const c = frame().locator('.geDiagramContainer'), b = await c.boundingBox(); await c.click({ position: { x: Math.round(b.width * 0.88), y: Math.round(b.height * 0.85) } }); };
  const waitLabels = async (want, what) => { const e = Date.now() + 30000; let got = []; while (Date.now() < e) { got = await labels().catch(() => []); if (want.every((w) => got.includes(w))) return got; await page.waitForTimeout(250); } ok(false, `${what}: ${want.join(', ')} (got ${got.join(', ')})`); return got; };

  await ready();
  const startMs = Date.now() - t0;
  ok(!!frame(), 'the editor runs in a frame of its own (drawio/index.html)');
  const meta = await frame().evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') || '');
  ok(/script-src 'self';/.test(meta) && /connect-src 'self' blob: data:;/.test(meta) && !/https?:/.test(meta) && !/unsafe-eval/.test(meta),
    `the frame's Content-Security-Policy: code only from this site, no other site contacted, no eval (${meta.slice(0, 120)}…)`);
  ok(await frame().locator('.geDiagramContainer').isVisible() && (await frame().locator('a.geItem', { hasText: 'Arrange' }).count()) > 0, `draw.io's editor is shown: its menus and the drawing area (${startMs} ms to start)`);
  ok((await status()) === '', `a new, empty diagram: no status (${await status()})`);
  ok((await page.locator('.dg-name').inputValue()) === 'Diagram', 'its name: Diagram');
  const sidebar = await frame().locator('.geSidebarContainer .geTitle').allInnerTexts();
  ok(['General', 'Flowchart', 'UML', 'Entity Relation'].every((s) => sidebar.some((t) => t.trim() === s)), `the standard shape libraries: General, Flowchart, UML, Entity Relation … (${sidebar.map((t) => t.trim()).join(', ')})`);

  // ---------------------------------------------------------------- a shape put in and labelled, as a user would
  await frame().locator('.geSidebarContainer a.geItem[aria-label="Rectangle"]').first().click();
  await page.waitForTimeout(400);
  await page.keyboard.press('F2'); await page.waitForTimeout(200);
  await page.keyboard.type('Start here');
  await away();
  await waitLabels(['Start here'], 'a rectangle put in from the sidebar and labelled');
  await page.waitForFunction(() => /Unsaved changes/.test(document.querySelector('.dg-status')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
  ok(/Unsaved changes/.test(await status()), `"Unsaved changes" after the edit (${await status()})`);

  // ---------------------------------------------------------------- Save: a .drawio file, read back by Python's XML reader
  let f = await download(page, () => btn('Save').click());
  ok(/Diagram\.drawio$/.test(f), `Save downloads Diagram.drawio (${f.replace(/^.*[\\/]/, '')})`);
  const XML = `import json, sys, xml.etree.ElementTree as ET, base64, zlib, urllib.parse
def cells(root):
    out = []
    for d in root.iter('diagram'):
        m = d.find('mxGraphModel')
        if m is None and (d.text or '').strip():
            m = ET.fromstring(urllib.parse.unquote(zlib.decompress(base64.b64decode(d.text.strip()), -15).decode()))
        if m is not None: out += [c.get('value') or '' for c in m.iter('mxCell') if c.get('vertex') == '1' or c.get('edge') == '1']
    if root.tag == 'mxGraphModel': out += [c.get('value') or '' for c in root.iter('mxCell') if c.get('vertex') == '1']
    return out
`;
  const readDrawio = (p) => py(`${XML}
r = ET.parse(sys.argv[1]).getroot()
print(json.dumps({'root': r.tag, 'pages': len(list(r.iter('diagram'))), 'cells': cells(r)}))`, p);
  let x = readDrawio(f);
  ok(x.root === 'mxfile' && x.pages === 1 && x.cells.includes('Start here'), `the file is draw.io's <mxfile> with its page and the labelled shape, as Python's XML reader reads it (${JSON.stringify(x)})`);
  ok(/Saved as Diagram\.drawio/.test(await status()), `"Saved as Diagram.drawio" (${await status()})`);
  ok(!(await frame().locator('.geStatus').innerText().catch(() => '')).includes('Unsaved'), 'draw.io’s own "Unsaved changes" cleared too');

  // a name of one's own; draw.io's own Ctrl+S saves the same way
  await page.locator('.dg-name').fill('Flow: plan/1');
  await frame().locator('.geSidebarContainer a.geItem[aria-label="Ellipse"]').first().click();
  await page.waitForTimeout(300);
  await page.keyboard.press('F2'); await page.waitForTimeout(200); await page.keyboard.type('End');
  await away();
  await waitLabels(['Start here', 'End'], 'a second shape');
  f = await download(page, async () => { await away(); await page.keyboard.press('Control+s'); });
  ok(/Flow plan 1\.drawio$/.test(f), `Ctrl+S in the editor saves too, under the name typed — made safe for a file name (${f.replace(/^.*[\\/]/, '')})`);
  x = readDrawio(f);
  ok(x.cells.includes('Start here') && x.cells.includes('End'), `both shapes in it (${x.cells.join(', ')})`);
  const own = (p) => { const d = join(tmp, 'dg-own'); mkdirSync(d, { recursive: true }); const q = join(d, p.replace(/^.*[\\/]\d+-/, '')); copyFileSync(p, q); return q; }; // the harness names a download "<time>-<name>"
  const drawioFile = own(f);

  // ---------------------------------------------------------------- PNG and SVG with the diagram inside
  f = await download(page, () => btn('PNG').click());
  ok(/Flow plan 1\.drawio\.png$/.test(f), `PNG: Flow plan 1.drawio.png (${f.replace(/^.*[\\/]/, '')})`);
  const png = py(`${XML}
from PIL import Image
im = Image.open(sys.argv[1]); t = im.info.get('mxfile', '')
r = ET.fromstring(urllib.parse.unquote(t)) if t else None
print(json.dumps({'fmt': im.format, 'size': im.size, 'cells': cells(r) if r is not None else []}))`, f);
  ok(png.fmt === 'PNG' && png.size[0] > 200 && png.cells.includes('Start here') && png.cells.includes('End'), `the PNG carries the diagram in its text chunk, as Pillow reads it (${JSON.stringify(png)})`);
  const pngFile = own(f);
  f = await download(page, () => btn('SVG').click());
  ok(/Flow plan 1\.drawio\.svg$/.test(f), `SVG: Flow plan 1.drawio.svg (${f.replace(/^.*[\\/]/, '')})`);
  const svg = py(`${XML}
r = ET.parse(sys.argv[1]).getroot(); c = r.get('content') or ''
m = ET.fromstring(c) if c else None
print(json.dumps({'tag': r.tag.split('}')[-1], 'cells': cells(m) if m is not None else [], 'text': ' '.join(t.strip() for t in r.itertext() if t.strip())[:400]}))`, f);
  ok(svg.tag === 'svg' && svg.cells.includes('Start here') && /Start here/.test(svg.text), `the SVG carries the diagram in its content attribute and shows the labels (${JSON.stringify(svg).slice(0, 200)})`);
  if (rsvg) {
    const pngOut = join(tmp, 'diagram-svg.png');
    execFileSync(rsvg, ['-o', pngOut, f]);
    const px = py(`from PIL import Image
import json, sys
im = Image.open(sys.argv[1]).convert('RGBA'); w, h = im.size; b = im.tobytes(); dark = sum(1 for i in range(0, len(b), 4) if b[i + 3] > 0 and b[i] + b[i + 1] + b[i + 2] < 300)
print(json.dumps({'size': [w, h], 'dark': dark}))`, pngOut);
    ok(px.size[0] > 100 && px.dark > 50, `librsvg draws the SVG: the shapes' outlines (${JSON.stringify(px)})`);
  } else ok(true, 'NOTE: rsvg-convert was not found (apt install librsvg2-bin) — the SVG was not drawn here');
  const svgFile = own(f);

  // PDF: draw.io's own dialog (its print window)
  await btn('PDF…').click();
  await frame().locator('.geDialog').filter({ hasText: /PDF|Export/ }).first().waitFor({ timeout: 10000 });
  const pdfButtons = await frame().locator('.geDialog button').allInnerTexts();
  ok(pdfButtons.includes('Export') && pdfButtons.includes('Cancel'), `PDF… opens draw.io's PDF dialog (${pdfButtons.join(', ')})`);
  await frame().locator('.geDialog button', { hasText: 'Cancel' }).first().click();

  // ---------------------------------------------------------------- Open: what was saved, Visio, Mermaid, PlantUML, Gliffy
  const openFile = async (file, name) => { await pick(file); try { await page.waitForFunction((n) => document.querySelector('.dg-name')?.value === n, name, { timeout: 30000 }); } catch (e) { if (process.env.DG_DEBUG) { await page.screenshot({ path: join(tmp, 'dg-fail.png') }); console.log('DEBUG name', await page.locator('.dg-name').inputValue(), 'toasts', await page.locator('.toast').allInnerTexts(), 'errors', page.errors, 'file', file, join(tmp, 'dg-fail.png')); } throw e; } await page.waitForTimeout(300); };
  // a blank diagram first: what is opened replaces what is there
  page.acceptNext = true;
  await btn('New…').click();
  await frame().locator('.geDialog').first().waitFor({ timeout: 10000 });
  ok((await frame().locator('.geDialog').first().innerText()).match(/Blank|Templates|Flowchart|Basic/i) != null, 'New… shows draw.io’s templates');
  await frame().locator('.geDialog button', { hasText: /^Create$/ }).first().click();
  await page.waitForFunction(() => document.querySelector('.dg-name')?.value === 'Diagram' || document.querySelector('.dg-name')?.value === 'Untitled Diagram', null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  ok(!(await labels()).length, `New… Create: a blank diagram (${(await labels()).join(', ')})`);
  ok(!/Unsaved/.test(await status()), 'a new diagram has nothing to save yet');

  for (const [file, name, what] of [[drawioFile, 'Flow plan 1', 'the .drawio'], [pngFile, 'Flow plan 1', 'the editable PNG'], [svgFile, 'Flow plan 1', 'the editable SVG']]) {
    await btn('New…').click(); await frame().locator('.geDialog button', { hasText: /^Create$/ }).first().click(); await page.waitForTimeout(800);
    await openFile(file, name);
    const got = await waitLabels(['Start here', 'End'], `Open ${what}`);
    ok(got.length === 2 && !/Unsaved/.test(await status()), `Open ${what}: both shapes, nothing to save yet (${got.join(', ')})`);
  }
  // Visio, made with Visio: six shapes, each named in its text
  await openFile(fileURLToPath(new URL('media.vsdx', FIX)), 'media');
  const visio = await waitLabels(['RECTANGLE', 'CIRCLE', 'LINE', 'CONNECTED_SHAPE'], 'Open a Visio drawing (.vsdx)');
  ok(visio.length >= 4, `Open a Visio drawing made with Visio: its shapes with their texts (${visio.join(', ')})`);
  // Mermaid and PlantUML: made into shapes that can be edited
  writeFileSync(join(tmp, 'order.mmd'), 'flowchart TD\n  A[Order placed] --> B{In stock?}\n  B -->|yes| C[Ship it]\n  B -->|no| D[Back-order]\n');
  await openFile(join(tmp, 'order.mmd'), 'order');
  const mer = await waitLabels(['Order placed', 'In stock?', 'Ship it', 'Back-order'], 'Open Mermaid text');
  ok((await model()).filter((c) => c.v).length >= 4 && (await model()).some((c) => !c.v), `Mermaid made into shapes and connectors (${mer.join(', ')})`);
  writeFileSync(join(tmp, 'login.puml'), '@startuml\nactor User\nUser -> Server: Log in\nServer --> User: Welcome\n@enduml\n');
  await openFile(join(tmp, 'login.puml'), 'login');
  const pl = await waitLabels(['User', 'Server'], 'Open PlantUML text');
  ok(pl.some((l) => /Log in/.test(l)) || (await model()).some((c) => /Log in/.test(c.label)), `PlantUML made into shapes (${pl.join(', ')})`);
  // Gliffy (our own small drawing in Gliffy's JSON)
  const gliffy = { contentType: 'application/gliffy+json', version: '1.3', stage: { background: '#FFFFFF', width: 400, height: 200, nodeIndex: 3, autoFit: true, exportBorder: false, gridOn: true, snapToGrid: true, drawingGuidesOn: true, pageBreaksOn: false, printGridOn: false, printPaper: 'LETTER', printShrinkToFit: false, printPortrait: true, maxWidth: 5000, maxHeight: 5000, themeData: null, viewportType: 'default', fitBB: { min: { x: 20, y: 20 }, max: { x: 160, y: 80 } }, objects: [{ x: 20, y: 20, rotation: 0, id: 0, uid: 'com.gliffy.shape.basic.basic_v1.default.rectangle', width: 140, height: 60, lockAspectRatio: false, lockShape: false, order: 0, graphic: { type: 'Shape', Shape: { tid: 'com.gliffy.stencil.rectangle.basic_v1', strokeWidth: 2, strokeColor: '#333333', fillColor: '#FFFFFF', gradient: false, dropShadow: false, state: 0, shadowX: 0, shadowY: 0, opacity: 1 } }, children: [{ x: 2, y: 0, rotation: 0, id: 1, uid: null, width: 136, height: 14, lockAspectRatio: false, lockShape: false, order: 'auto', graphic: { type: 'Text', Text: { tid: null, valign: 'middle', overflow: 'none', vposition: 'none', hposition: 'none', html: '<p style="text-align:center;"><span style="font-size:12px;">Gliffy box</span></p>', paddingLeft: 2, paddingRight: 2, paddingBottom: 2, paddingTop: 2, outerPaddingLeft: 6, outerPaddingRight: 6, outerPaddingBottom: 2, outerPaddingTop: 6 } }, children: [] }] }], layers: [{ guid: 'L1', order: 0, name: 'Layer 0', active: true, locked: false, visible: true, nodeIndex: 2 }], shapeStyles: {}, lineStyles: {}, textStyles: {} }, metadata: { title: 'untitled', revision: 0, exportBorder: false, loadPosition: 'default', libraries: [] }, embeddedResources: { index: 0, resources: [] } };
  writeFileSync(join(tmp, 'box.gliffy'), JSON.stringify(gliffy));
  await openFile(join(tmp, 'box.gliffy'), 'box');
  const gl = await waitLabels(['Gliffy box'], 'Open a Gliffy drawing');
  ok(gl.includes('Gliffy box'), `Open a Gliffy drawing: its box with its text (${gl.join(', ')})`);

  // what it refuses, in words
  const refuse = async (file, re, what) => { await pick(file); const t = await toastText(); ok(re.test(t), `${what} refused in words (${t})`); await page.waitForTimeout(300); };
  writeFileSync(join(tmp, 'plain.png'), Buffer.from(execFileSync('python3', ['-I', '-c', 'import sys,io\nfrom PIL import Image\nb=io.BytesIO(); Image.new("RGB",(40,30),(200,30,30)).save(b,"PNG"); sys.stdout.buffer.write(b.getvalue())'])));
  await refuse(join(tmp, 'plain.png'), /picture without a diagram in it/, 'a PNG without a diagram');
  writeFileSync(join(tmp, 'notes.txt'), 'Just some notes about a meeting.\nNothing to draw.\n');
  await refuse(join(tmp, 'notes.txt'), /not a diagram this editor opens/, 'a text that is no diagram');
  writeFileSync(join(tmp, 'shapes.xml'), '<mxlibrary>[{"xml":"x","w":40,"h":40}]</mxlibrary>');
  await refuse(join(tmp, 'shapes.xml'), /shape library/, 'a shape library');
  ok((await labels()).includes('Gliffy box'), 'a refused file leaves the diagram as it was');

  // a change not saved: Open asks first (No keeps it), the page asks before it is closed
  await frame().locator('.geSidebarContainer a.geItem[aria-label="Rectangle"]').first().click();
  await page.waitForFunction(() => /Unsaved changes/.test(document.querySelector('.dg-status')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
  ok(/Unsaved changes/.test(await status()), 'a change: Unsaved changes');
  page.acceptNext = false; dialogs.length = 0;
  await pick(drawioFile);
  await page.waitForTimeout(800);
  ok(dialogs.some((d) => /changes that are not saved/.test(d)) && (await page.locator('.dg-name').inputValue()) === 'box', `Open with a change not saved asks first; No keeps the diagram (${dialogs.join(' | ')})`);
  page.acceptNext = true;

  // kept while the page is open: another tab and back
  await page.evaluate(() => { location.hash = '#/sheet'; }); await page.waitForTimeout(500);
  await page.evaluate(() => { location.hash = '#/diagram'; }); await ready(); await page.waitForTimeout(600);
  ok((await labels()).includes('Gliffy box') && /Unsaved changes/.test(await status()) && (await page.locator('.dg-name').inputValue()) === 'box', `back in the tab: the diagram, its name and its unsaved change are still here (${(await labels()).join(', ')} · ${await status()})`);

  // ---------------------------------------------------------------- nothing stored, nothing fetched from elsewhere
  const kept = await page.evaluate(async () => ({ ls: Object.keys(localStorage), dbs: (await indexedDB.databases()).map((d) => d.name), sw: (await navigator.serviceWorker.getRegistrations()).length, caches: await caches.keys(), cookie: document.cookie }));
  ok(JSON.stringify(kept.ls) === JSON.stringify(['superutils.settings.v1']) && !kept.dbs.length && !kept.sw && !kept.caches.length && !kept.cookie,
    `nothing stored by the editor: no localStorage key but the harness's, no database, service worker, cache or cookie (${JSON.stringify(kept)})`);
  ok(!outside.size, `no request to another site (${[...outside].slice(0, 4).join(' ')})`);
  ok(!csp.length, `no Content-Security-Policy violation (${csp.slice(0, 2).join(' | ')})`);

  // ---------------------------------------------------------------- leaving: the frame goes; the page still asks before it is closed
  const left = await released(page, 'diagram');
  ok(!left.length, `leaving the tab lets every blob URL go (${JSON.stringify(left)})`);
  ok(!page.frames().some((f) => /\/drawio\//.test(f.url())) && (await page.evaluate(() => globalThis.__superutilsLive())).workers === 0, 'leaving the tab ends the editor (its frame removed)');
  dialogs.length = 0;
  await page.close({ runBeforeUnload: true });
  await new Promise((r) => setTimeout(r, 800));
  ok(dialogs.some((d) => /^beforeunload/.test(d)), `with a change not saved the page asks before it is closed — the tab left too (${dialogs.join(' | ')})`);

  // ---------------------------------------------------------------- the editor that cannot be fetched; Try again
  const p2 = await newPage({ viewport: { width: 1366, height: 900 } });
  let block = true;
  await p2.route('**/drawio/js/app.min.js', (r) => (block ? r.abort() : r.continue()));
  await p2.goto(`${base}#/diagram`);
  await p2.locator('.dg-problem:not([hidden])').waitFor({ timeout: 30000 });
  ok(/could not be fetched/.test(await p2.locator('.dg-problem').textContent()), `the editor's code refused: said in words with Try again (${await p2.locator('.dg-problem').textContent()})`);
  block = false;
  await p2.getByRole('button', { name: 'Try again' }).click();
  await p2.waitForFunction(() => { const b = [...document.querySelectorAll('.dg-bar button')].find((x) => x.textContent.trim() === 'Save'); return b && !b.disabled; }, null, { timeout: 60000 });
  ok(await p2.locator('.dg-problem').isHidden(), 'Try again starts the editor once it can be fetched');
  const errs2 = p2.errors.filter((e) => !/net::ERR_FAILED/.test(e)); // the editor's code refused on purpose
  ok(!errs2.length, `no page errors (${errs2.slice(0, 3).join(' | ')})`);

  // ---------------------------------------------------------------- WCAG 2.2 A / AA (the tab's own controls) in both themes
  for (const scheme of ['light', 'dark']) {
    const ax = await newPage({ viewport: { width: 1366, height: 900 }, colorScheme: scheme, bypassCSP: true });
    await ax.goto(`${base}#/diagram`);
    await ax.waitForFunction(() => { const b = [...document.querySelectorAll('.dg-bar button')].find((x) => x.textContent.trim() === 'Save'); return b && !b.disabled; }, null, { timeout: 60000 });
    await ax.locator('.dg-about summary').click();
    await ax.addScriptTag({ content: AXE });
    const vv = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'], iframes: false })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!vv.length, `${scheme}: no WCAG 2.2 A / AA violations on the tab's own controls ${vv.join(' | ')}`);
    // draw.io follows the theme (dark=auto)
    const fr = ax.frames().find((f) => /\/drawio\//.test(f.url()));
    const bg = await fr.evaluate(() => { const c = getComputedStyle(document.querySelector('.geDiagramContainer')).backgroundColor.match(/\d+/g).map(Number); return c[0] + c[1] + c[2]; });
    ok(scheme === 'dark' ? bg < 200 : bg > 600, `${scheme}: the editor follows the theme (its drawing area ${bg})`);
    await ax.close();
  }

  await pcOnlyOnPhone(ctx, 'diagram');
};
