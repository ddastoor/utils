// The Diagram Editor's test files made by draw.io itself: a small flowchart loaded into the tab of a built site (dist/, or E2E_DIST)
// and saved with the tab's own Save, PNG and SVG — tests/fixtures/diagram/flow.drawio, flow.drawio.png and flow.drawio.svg, read by
// tests/unit/diagram.test.mjs. Run after `npm run build`:  node scripts/make-diagram-fixtures.mjs
import { createRequire } from 'node:module';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(import.meta.url)('playwright');
const out = join(root, 'tests/fixtures/diagram');
export const FLOW = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>'
  + '<mxCell id="a" value="Order placed" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>'
  + '<mxCell id="b" value="Ship it" style="ellipse;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="240" y="40" width="120" height="60" as="geometry"/></mxCell>'
  + '<mxCell id="e" value="then" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>'
  + '</root></mxGraphModel>';

const server = await preview({ root, preview: { port: 0 }, logLevel: 'error', ...(process.env.E2E_DIST ? { build: { outDir: process.env.E2E_DIST } } : {}) });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
await page.goto(`${base}#/diagram`);
const ready = () => page.waitForFunction(() => { const b = [...document.querySelectorAll('.dg-bar button')].find((x) => x.textContent.trim() === 'Save'); return b && !b.disabled; }, null, { timeout: 60000 });
await ready();
// the flowchart into the editor as the tab's Open would put it there
await page.evaluate((xml) => document.querySelector('.dg-frame').contentWindow.postMessage(JSON.stringify({ action: 'load', autosave: 1, xml }), '*'), FLOW);
await page.waitForTimeout(1500);
await page.locator('.dg-name').fill('flow');
const tmp = mkdtempSync(join(tmpdir(), 'diagram-fixtures-'));
for (const [label, name] of [['Save', 'flow.drawio'], ['PNG', 'flow.drawio.png'], ['SVG', 'flow.drawio.svg']]) {
  const d = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  const dl = await d;
  if (dl.suggestedFilename() !== name) throw new Error(`${label}: ${dl.suggestedFilename()}, not ${name}`);
  const p = join(tmp, name); await dl.saveAs(p); copyFileSync(p, join(out, name));
  console.log(`tests/fixtures/diagram/${name}`);
}
await browser.close(); server.httpServer.close();
