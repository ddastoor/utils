// Diagram Editor (potentials #54): src/lib/diagramfile.ts — what a file chosen to open is and the diagram inside it — held to files
// draw.io 32.7.7 made in the tab (tests/fixtures/diagram/flow.drawio, flow.drawio.png, flow.drawio.svg: scripts/make-diagram-fixtures.mjs)
// and read again by Python (Pillow's text chunks, ElementTree), to PNGs written here with the chunks as draw.io writes them (tEXt, and the
// zTXt of older versions), a Visio drawing made with Visio, and the names it saves under; scripts/fetch-drawio.mjs — its zip and tar
// readers on archives Python writes (a name that would leave the folder refused), what it leaves out of the release file, and the
// editor it unpacks into public/drawio (when the site has been built): the pinned release, our page with its policy, nothing left in that
// the rules leave out.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { deflateSync } from 'node:zlib';
import { execFileSync, spawnSync } from 'node:child_process';

const FIX = new URL('../fixtures/diagram/', import.meta.url);
const ROOT = new URL('../../', import.meta.url).pathname;
const py = (code, ...args) => JSON.parse(execFileSync('python3', ['-I', '-c', code, ...args], { encoding: 'utf8' }));
const crc = (() => { const t = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; }); return (b) => { let c = -1; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }; })();
/** a PNG of one white pixel with the given chunks before IEND */
function png(extra = []) {
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), ...extra.map(([t, d]) => chunk(t, d)), chunk('IDAT', deflateSync(Buffer.from([0, 255, 255, 255]))), chunk('IEND', Buffer.alloc(0))]));
}

export default async (t, { load }) => {
  const { kindOf, xmlDiagram, svgDiagram, pngDiagram, diagramName, safeName, BLANK } = await load('/src/lib/diagramfile.ts');
  const enc = (s) => new TextEncoder().encode(s);
  const flowXml = readFileSync(new URL('flow.drawio', FIX), 'utf8');
  const flowPng = new Uint8Array(readFileSync(new URL('flow.drawio.png', FIX)));
  const flowSvg = readFileSync(new URL('flow.drawio.svg', FIX), 'utf8');
  const vsdx = new Uint8Array(readFileSync(new URL('media.vsdx', FIX)));

  // ---------------------------------------------------------------- what a file is
  t.eq(kindOf('flow.drawio', enc(flowXml)), 'xml', 'a .drawio file: xml');
  t.eq(kindOf('anything.txt', enc(flowXml)), 'xml', 'an <mxfile> under another name: xml (by its first bytes)');
  t.eq(kindOf('x.xml', enc('\uFEFF<?xml version="1.0"?>\n<!-- made by hand -->\n<mxGraphModel><root/></mxGraphModel>')), 'xml', 'an <mxGraphModel> after a byte-order mark, a declaration and a comment: xml');
  t.eq(kindOf('flow.drawio.png', flowPng), 'png', 'draw.io’s editable PNG: png');
  t.eq(kindOf('picture', flowPng), 'png', 'a PNG without its extension: png (by its signature)');
  t.eq(kindOf('flow.drawio.svg', enc(flowSvg)), 'svg', 'draw.io’s editable SVG: svg');
  t.eq(kindOf('a.svg', enc('<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x"><svg xmlns="http://www.w3.org/2000/svg"/>')), 'svg', 'an SVG with a DOCTYPE: svg');
  t.eq(kindOf('media.vsdx', vsdx), 'visio', 'a Visio drawing made with Visio (.vsdx, a zip): visio');
  t.eq(kindOf('old.vsd', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), 'visio', 'an old Visio file (.vsd, OLE): visio');
  t.eq(kindOf('archive.zip', vsdx), null, 'a zip that is no Visio file: nothing');
  t.eq(kindOf('report.docx', vsdx), null, 'a Word document (a zip too): nothing');
  t.eq(kindOf('box.gliffy', enc('{"contentType":"application/gliffy+json","version":"1.3","stage":{}}')), 'gliffy', 'Gliffy by its extension');
  t.eq(kindOf('box.json', enc('{"contentType":"application/gliffy+json","stage":{"objects":[]}}')), 'gliffy', 'Gliffy by its content');
  t.eq(kindOf('order.mmd', enc('flowchart TD\nA-->B')), 'mermaid', 'Mermaid by its extension');
  t.eq(kindOf('order.txt', enc('sequenceDiagram\nA->>B: hi')), 'mermaid', 'Mermaid by its first word');
  t.eq(kindOf('login.puml', enc('@startuml\nA -> B\n@enduml')), 'plantuml', 'PlantUML by its extension');
  t.eq(kindOf('login.txt', enc('@startuml\nA -> B\n@enduml')), 'plantuml', 'PlantUML by its first line');
  t.eq(kindOf('notes.txt', enc('Meeting notes\nNothing to draw.')), null, 'a text that is no diagram: nothing');
  t.eq(kindOf('page.html', enc('<!doctype html><html></html>')), null, 'a web page: nothing');

  // ---------------------------------------------------------------- the diagram inside
  t.ok(xmlDiagram(flowXml)?.xml?.startsWith('<mxfile'), 'a .drawio file: its <mxfile>');
  t.eq(xmlDiagram('\uFEFF<?xml version="1.0" encoding="UTF-8"?>\n<mxGraphModel><root/></mxGraphModel>\n'), { xml: '<mxGraphModel><root/></mxGraphModel>' }, 'an <mxGraphModel> without its declaration and mark');
  t.eq(xmlDiagram('<mxlibrary>[{"xml":"x"}]</mxlibrary>'), { library: true }, 'a shape library: said to be one');
  t.eq(xmlDiagram('<html><body>no</body></html>'), null, 'other XML: nothing');
  const fromSvg = svgDiagram(flowSvg);
  t.ok(fromSvg?.startsWith('<mxfile') && /<diagram\b/.test(fromSvg), 'draw.io’s editable SVG: the <mxfile> of its content attribute (its page compressed, as draw.io writes it there)');
  // a page's diagram, inline or compressed (raw deflate, Base64, URI-encoded — draw.io's compressed form), read by Python
  const pyCells = `import json, sys, base64, zlib, urllib.parse, xml.etree.ElementTree as ET
r = ET.fromstring(sys.argv[1]); out = []
for d in r.iter('diagram'):
    m = d.find('mxGraphModel')
    if m is None: m = ET.fromstring(urllib.parse.unquote(zlib.decompress(base64.b64decode(d.text.strip()), -15).decode()))
    out += [c.get('value') for c in m.iter('mxCell') if c.get('value')]
print(json.dumps(sorted(out)))`;
  t.eq(py(pyCells, flowXml), ['Order placed', 'Ship it', 'then'], 'the .drawio file draw.io saved, read by Python’s XML reader: the two shapes and the connector');
  t.eq(py(pyCells, fromSvg), ['Order placed', 'Ship it', 'then'], 'the SVG’s diagram as Python reads it (inflated): the same shapes and connector');
  t.eq(py(`import json, sys, xml.etree.ElementTree as ET
print(json.dumps(ET.parse(sys.argv[1]).getroot().get('content')))`, new URL('flow.drawio.svg', FIX).pathname), fromSvg, 'the content attribute as ElementTree unescapes it, exactly');
  t.eq(svgDiagram("<svg xmlns='http://www.w3.org/2000/svg' content='&lt;mxfile&gt;&lt;diagram name=&quot;A &amp;amp; B&quot;/&gt;&lt;/mxfile&gt;'/>"), '<mxfile><diagram name="A &amp; B"/></mxfile>', 'single quotes and entities (&amp;amp; stays one escape)');
  t.eq(svgDiagram('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'), null, 'an SVG without a diagram: nothing');
  t.eq(svgDiagram('<svg content="hello"/>'), null, 'a content attribute that is no diagram: nothing');
  const fromPng = await pngDiagram(flowPng);
  t.ok(fromPng?.startsWith('<mxfile') && /Order placed/.test(fromPng), 'draw.io’s editable PNG: the <mxfile> of its text chunk');
  // Pillow, where it is installed (pip install pillow; GitHub's runner has none): the other readers here are Python's own
  if (spawnSync('python3', ['-I', '-c', 'import PIL']).status === 0) t.eq(fromPng, py(`import json, sys, urllib.parse
from PIL import Image
print(json.dumps(urllib.parse.unquote(Image.open(sys.argv[1]).info['mxfile']).strip()))`, new URL('flow.drawio.png', FIX).pathname), 'the same diagram as Pillow reads from the PNG (its tEXt chunk, unquoted)');
  else t.ok(true, 'Pillow is not installed (pip install pillow): the PNG not read back by it');
  const XML = '<mxfile><diagram name="Plan – Größe ₹"><mxGraphModel><root/></mxGraphModel></diagram></mxfile>';
  t.eq(await pngDiagram(png([['tEXt', Buffer.concat([Buffer.from('mxfile\0', 'latin1'), Buffer.from(encodeURIComponent(XML), 'latin1')])]])), XML, 'a tEXt chunk named mxfile, written as draw.io writes it (encodeURIComponent): the diagram, letters beyond Latin-1 too');
  t.eq(await pngDiagram(png([['zTXt', Buffer.concat([Buffer.from('mxGraphModel\0\0', 'latin1'), deflateSync(Buffer.from(encodeURIComponent('<mxGraphModel><root/></mxGraphModel>'), 'latin1'))])]])), '<mxGraphModel><root/></mxGraphModel>', 'a zTXt chunk named mxGraphModel (older versions): inflated');
  t.eq(await pngDiagram(png([['tEXt', Buffer.from('Software\0GIMP', 'latin1')]])), null, 'a PNG with other text only: nothing');
  t.eq(await pngDiagram(png()), null, 'a plain PNG: nothing');
  t.eq(await pngDiagram(new Uint8Array(flowPng.subarray(0, 60))), null, 'a PNG cut short: nothing (no throw)');

  // ---------------------------------------------------------------- names
  for (const [file, want] of [['Plan.drawio', 'Plan'], ['Plan.drawio.png', 'Plan'], ['Plan.drawio.svg', 'Plan'], ['net.vsdx', 'net'], ['flow.xml', 'flow'], ['order.mmd', 'order'], ['login.puml', 'login'], ['C:\\Users\\me\\Office plan.dio', 'Office plan'], ['/home/me/.drawio', 'Diagram'], ['a.b.c.drawio', 'a.b.c']])
    t.eq(diagramName(file), want, `the diagram's name from ${file}: ${want}`);
  for (const [name, want] of [['Flow: plan/1', 'Flow plan 1'], ['  spaced  out  ', 'spaced out'], ['...dots...', 'dots'], ['con', 'con diagram'], ['LPT1', 'LPT1 diagram'], ['a<b>c|d?e*f"g', 'a b c d e f g'], ['tab\there', 'tab here'], ['', 'Diagram'], ['///', 'Diagram'], ['日本語の図', '日本語の図']])
    t.eq(safeName(name), want, `a file name that every system takes: ${JSON.stringify(name)} → ${want}`);
  t.eq([...safeName('ü'.repeat(300))].length, 120, 'at most 120 characters');
  t.ok(/<mxGraphModel><root><mxCell id="0"\/><mxCell id="1" parent="0"\/><\/root><\/mxGraphModel>/.test(BLANK), 'the empty diagram: draw.io’s two root cells');

  // ---------------------------------------------------------------- scripts/fetch-drawio.mjs: its readers and its rules
  const { zipEntries, tarMember, LEAVE_OUT, VERSION } = await import(new URL('../../scripts/fetch-drawio.mjs', import.meta.url).href);
  const zipPath = join(process.env.TMPDIR || '/tmp', `dg-${process.pid}.zip`), tarPath = join(process.env.TMPDIR || '/tmp', `dg-${process.pid}.tar.gz`);
  py(`import json, sys, zipfile, tarfile, io
with zipfile.ZipFile(sys.argv[1], 'w') as z:
    z.writestr(zipfile.ZipInfo('a/stored.txt'), 'stored as it is')
    z.writestr('b/deflated.js', 'x' * 5000, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr('dir/', '')
    z.writestr('ünï.txt', 'utf-8 name')
with tarfile.open(sys.argv[2], 'w:gz', format=tarfile.USTAR_FORMAT) as t:
    for n, b in [('tmp/other.bin', b'no'), ('tmp/draw.war', b'the war'), ('x/' * 60 + 'long.txt', b'a long name in the prefix field')]:
        i = tarfile.TarInfo(n); i.size = len(b); t.addfile(i, io.BytesIO(b))
print('1')`, zipPath, tarPath);
  const zip = readFileSync(zipPath), got = [...zipEntries(zip)].map((e) => [e.name, e.data().toString()]);
  t.eq(got, [['a/stored.txt', 'stored as it is'], ['b/deflated.js', 'x'.repeat(5000)], ['ünï.txt', 'utf-8 name']], 'the zip reader: stored and deflated files, a UTF-8 name, folders skipped — as Python wrote them');
  const { gunzipSync } = await import('node:zlib');
  const tar = gunzipSync(readFileSync(tarPath));
  t.eq(Buffer.from(tarMember(tar, 'tmp/draw.war')).toString(), 'the war', 'the tar reader finds tmp/draw.war');
  t.eq(Buffer.from(tarMember(tar, `${'x/'.repeat(60)}long.txt`)).toString(), 'a long name in the prefix field', 'a name longer than 100 characters (ustar prefix)');
  t.throws(() => tarMember(tar, 'tmp/none'), 'a file that is not there: an error');
  const evil = Buffer.from(zip.toString('latin1').replaceAll('a/stored.txt', '../stored.t'), 'latin1');
  t.throws(() => [...zipEntries(evil)], 'a name that would leave the folder (../): refused');
  const out = (n) => LEAVE_OUT.some((r) => r.test(n));
  for (const n of ['js/integrate.min.js', 'js/viewer-static.min.js', 'WEB-INF/web.xml', 'META-INF/MANIFEST.MF', 'js/diagramly/App.js', 'mxgraph/src/mxClient.js', 'service-worker.js', 'workbox-05b6c01b.js', 'workbox-05b6c01b.js.map', 'resources/dia_de.txt', 'teams.html', 'index.html', 'js/PreConfig.js', 'js/PostConfig.js', 'plugins/trello.js', 'plugins/update.js', 'js/simplepeer/simplepeer9.10.0.min.js', 'js/onedrive/OneDrive.js', 'favicon.ico', 'images/manifest.json'])
    t.ok(out(n), `left out of the release file: ${n}`);
  for (const n of ['js/app.min.js', 'js/bootstrap.js', 'js/main.js', 'js/extensions.min.js', 'js/stencils.min.js', 'js/shapes-14-6-5.min.js', 'js/plantuml/drawio-plantuml.min.js', 'js/libavoid-js/libavoid.min.js', 'resources/dia.txt', 'styles/grapheditor.css', 'math4/es5/drawio-mathjax.min.js', 'templates/LICENSE', 'img/LICENSE', 'images/sidebar-uml25.png', 'plugins/props.js', 'shortcuts.svg'])
    t.ok(!out(n), `kept: ${n}`);

  // the editor as unpacked for the site (made by npm run build / dev; the CI runs the unit suites after the build)
  const dir = join(ROOT, 'public/drawio');
  if (!existsSync(join(dir, '.superutils.json'))) { t.ok(true, 'NOTE: public/drawio is not there (run npm run build first) — the unpacked editor was not checked'); return; }
  const stamp = JSON.parse(readFileSync(join(dir, '.superutils.json'), 'utf8'));
  t.ok(stamp.version === VERSION && stamp.war === 'ffca456f234c0a51160ea19eec1329a675fd8e84ea472fcf18b74cb87f5d9ca5', `public/drawio: draw.io ${VERSION}, the pinned release file`);
  const files = []; const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else files.push(relative(dir, p).split('\\').join('/')); } }; walk(dir);
  const theirs = files.filter((f) => !['index.html', 'js/PreConfig.js', 'js/PostConfig.js', 'js/superutils-frame.js', 'LICENSE', 'README.txt', '.superutils.json'].includes(f));
  t.eq(theirs.filter(out), [], 'nothing the rules leave out is there');
  const bytes = files.reduce((s, f) => s + statSync(join(dir, f)).size, 0);
  t.ok(files.length > 2500 && bytes > 50e6 && bytes < 56e6, `about 53 MB in about 2,700 files (${(bytes / 1e6).toFixed(1)} MB, ${files.length})`);
  const page = readFileSync(join(dir, 'index.html'), 'utf8');
  t.ok(/<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self';/.test(page) && !/https?:\/\/(?!www\.w3\.org)/.test(page.replace(/<!--[\s\S]*?-->/, '')), 'its page: the policy first, no address of another site');
  t.ok(page.indexOf('js/superutils-frame.js') > 0 && page.indexOf('js/superutils-frame.js') < page.indexOf('js/bootstrap.js'), 'its page: our script before draw.io’s');
  t.ok(readFileSync(join(dir, 'LICENSE'), 'utf8').startsWith('                                 Apache License'), 'the Apache licence beside it');
};
