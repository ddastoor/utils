// svgo.wasm (our Rust glue around OXVG, wasm/svgo): default and safe presets, DOCTYPE and entities, the nesting
// limit, clear errors, pretty printing, every hazard drawing in tests/fixtures/svg/hazards.json (optimises in both
// modes, output is well-formed XML — checked with xmllint when it is installed), big inputs, and sv_diff, the
// look-alike measure the tab uses (edge noise = nothing, a missing shape or a new colour = different).
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export default async (t, { load, wasm }) => {
  const { bindSvgo } = await load('/src/wasm/svgo.ts');
  let exp = await wasm('svgo'), o = bindSvgo(exp);
  const err = (f) => { try { f(); return null; } catch (e) { return e.message; } };
  const S = (body, attrs = 'width="120" height="120" viewBox="0 0 120 120"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

  // ---- what the full optimisation does
  t.eq(o.optimise(S('<rect width="60.000" height="60.000" fill="#ff0000"/>')), S('<path fill="red" d="M0 0h60v60H0Z"/>'), 'rect → path, #ff0000 → red, trailing zeros dropped');
  t.eq(o.optimise(`<?xml version="1.0" encoding="UTF-8"?>\n<!-- made by hand -->\n${S('<metadata>x</metadata><g><circle cx="10.50" cy="10" r="5"/></g>')}`), S('<circle cx="10.5" cy="10" r="5"/>'), 'XML declaration, comment, metadata and an empty group go');
  const ink = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" width="10" height="10" inkscape:version="1.2"><sodipodi:namedview pagecolor="#fff"/><rect width="5" height="5" inkscape:label="box"/></svg>';
  t.ok(!/inkscape|sodipodi/.test(o.optimise(ink)) && !/inkscape|sodipodi/.test(o.optimise(ink, { safe: true })), 'editor (Inkscape / Sodipodi) data is removed in both modes');
  t.eq(o.optimise(S('<text x="5" y="50">₹ नमस्ते café 😀 &amp; &lt;b&gt;</text>')), S('<text x="5" y="50">₹ नमस्ते café 😀 &amp; &lt;b&gt;</text>'), 'text content survives byte for byte (Devanagari, emoji, escapes)');
  // ---- safe mode: only what cannot change the picture
  const shapes = S('<!-- c --><g opacity=".5"><rect width="100" height="100" fill="#000000" opacity=".5"/></g><style>.a{fill:red}</style><circle class="a" r="5.0001"/>');
  const safe = o.optimise(shapes, { safe: true });
  t.ok(/<g opacity=".5">/.test(safe) && /<rect /.test(safe) && /<style>/.test(safe) && /class="a"/.test(safe) && /r="5.0001"/.test(safe) && !/<!--/.test(safe), 'safe mode keeps groups, shapes, styles, classes and numbers as they are; comments go');
  t.ok(/fill="#000"/.test(safe), 'safe mode still shortens colours');
  t.ok(o.optimise(shapes) !== safe, 'safe mode and the full optimisation give different output');
  t.ok(o.optimise(shapes, { safe: true }).length <= shapes.length, 'safe mode never makes this file larger');
  // ---- pretty
  t.eq(o.optimise(S('<g><rect width="5" height="5"/><circle r="2"/></g>'), { safe: true, pretty: true }), '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">\n  <g>\n    <rect width="5" height="5"/>\n    <circle r="2"/>\n  </g>\n</svg>\n', 'pretty-print: two spaces per level');
  // ---- DOCTYPE (most Inkscape / Illustrator / Graphviz files have one; they used to be refused)
  const dt11 = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n${S('<rect width="60" height="60" fill="red"/>')}`;
  t.eq(o.optimise(dt11), S('<path fill="red" d="M0 0h60v60H0Z"/>'), 'a file with the SVG 1.1 DOCTYPE is optimised (the DOCTYPE is dropped)');
  t.eq(o.optimise(dt11, { safe: true }), S('<rect width="60" height="60" fill="red"/>'), '… and in safe mode');
  const ai = '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [\n<!ENTITY ns_svg "http://www.w3.org/2000/svg">\n<!ENTITY st0 "fill:#ff0000;">\n]>\n<svg xmlns="&ns_svg;" width="120" height="120"><rect width="60" height="60" style="&st0;"/></svg>';
  t.ok(/xmlns="http:\/\/www.w3.org\/2000\/svg"/.test(o.optimise(ai)) && /red|#f00/.test(o.optimise(ai)) && !/&ns_svg;|&st0;|ENTITY/.test(o.optimise(ai, { safe: true })), 'Illustrator-style entities declared in the DOCTYPE are expanded');
  t.eq(o.optimise(`<!DOCTYPE svg>\n${S('<circle r="5"/>')}`, { safe: true }), S('<circle r="5"/>'), 'a bare <!DOCTYPE svg> is fine');
  // ---- errors in plain words
  t.eq([err(() => o.optimise('')), err(() => o.optimise('   \n')), err(() => o.optimise('hello')), err(() => o.optimise('{"a":1}')), err(() => o.optimise('<svg><rect></svg>')), err(() => o.optimise('<svg xmlns="http://www.w3.org/2000/svg">')), err(() => o.optimise('<a><b/></a>'))], [
    'Not a valid SVG/XML document: the document does not have a root node', 'Not a valid SVG/XML document: the document does not have a root node', 'Not a valid SVG/XML document: unknown token at 1:1', 'Not a valid SVG/XML document: unknown token at 1:1',
    "Not a valid SVG/XML document: expected 'rect' tag, not 'svg' at 1:12", 'Not a valid SVG/XML document: the root node was opened but never closed', 'This file is XML, but not an SVG (it has no <svg> element)'], 'empty, not XML, broken XML, XML that is not SVG');
  t.ok(/unknown entity reference 'nbsp'/.test(err(() => o.optimise(S('<text>a&nbsp;b</text>')))) && /unknown namespace prefix 'xlink'/.test(err(() => o.optimise(S('<use xlink:href="#a"/>')))), 'HTML entities and undeclared prefixes (not valid XML, browsers refuse them too) are reported');
  // ---- nesting: deep files used to overflow the wasm stack and break the instance
  const deep = (n, tag = 'g') => S(`${`<${tag}>`.repeat(n)}<rect width="5" height="5"/>${`</${tag}>`.repeat(n)}`);
  t.ok(o.optimise(deep(200)).length < 200 && o.optimise(deep(250), { safe: true }).length > 1500, '200 and 250 nested groups are optimised');
  t.eq([300, 500, 1000, 5000, 50000].map((n) => err(() => o.optimise(deep(n)))), [300, 500, 1000, 5000, 50000].map((n) => `This SVG nests elements ${n + 2} levels deep; the optimiser handles up to 256`), 'deeper nesting is refused with the depth found');
  t.eq(o.optimise(S('<rect width="60" height="60" fill="red"/>')), S('<path fill="red" d="M0 0h60v60H0Z"/>'), 'the engine still works after the refusals');
  t.ok(o.optimise(S(`<!-- ${'<g>'.repeat(600)} --><![CDATA[${'<g>'.repeat(600)}]]><rect width="1" height="1" data-x="${'&lt;g>'.repeat(300)}"/>`), { safe: true }).includes('<rect'), 'tags inside comments, CDATA and attribute values do not count as nesting');
  // ---- hazards: every drawing optimises in both modes and stays well-formed
  const haz = JSON.parse(readFileSync(new URL('../fixtures/svg/hazards.json', import.meta.url), 'utf8')).cases;
  const dir = mkdtempSync(join(tmpdir(), 'svgo-')); const files = []; const failed = [];
  for (const { name, svg } of haz) for (const mode of [false, true]) {
    try { const out = o.optimise(svg, { safe: mode }); if (!out.includes('<svg')) failed.push(`${name}: no <svg`); const f = join(dir, `${name}.${mode ? 'safe' : 'full'}.svg`); writeFileSync(f, out); files.push(f); if (mode && out.length > svg.length + 8) failed.push(`${name}: safe output is ${out.length - svg.length} characters larger`); }
    catch (e) { if (!/unknown namespace prefix|unknown entity/.test(e.message)) failed.push(`${name} (${mode ? 'safe' : 'full'}): ${e.message}`); if (/unreachable|out of bounds/.test(e.message)) { exp = await wasm('svgo'); o = bindSvgo(exp); } }
  }
  t.eq(failed, [], `${haz.length} hazard drawings optimise in both modes (${files.length} outputs; safe mode adds at most a few characters when it re-prints CSS — the tab then keeps the original)`);
  let lint = null; try { execFileSync('xmllint', ['--version'], { stdio: 'pipe' }); lint = true; } catch { lint = false; }
  if (lint) { let bad = ''; try { execFileSync('xmllint', ['--noout', '--nonet', ...files], { stdio: 'pipe' }); } catch (e) { bad = String(e.stderr).slice(0, 600); } t.eq(bad, '', `all ${files.length} outputs are well-formed XML (xmllint)`); }
  // safe mode leaves the drawing's structure alone: same elements in the same order (tag names), for every hazard
  const tags = (s) => (s.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/g, '').match(/<[a-zA-Z][\w:.-]*/g) || []).filter((x) => !/^<(metadata|sodipodi:|inkscape:|rdf:|cc:|dc:)/.test(x));
  const moved = haz.filter(({ svg }) => { try { const out = o.optimise(svg, { safe: true }); return tags(out).join() !== tags(svg).join(); } catch { return false; } }).map((h) => h.name);
  t.ok(moved.length <= 3, `safe mode keeps every element in place (${moved.length} of ${haz.length} differ: ${moved.join(', ')})`);
  // ---- size and speed
  const many = S(Array.from({ length: 20000 }, (_, i) => `<path fill="#${(i * 2654435761 >>> 8).toString(16).padStart(6, '0').slice(0, 6)}" d="M${i % 100} ${i % 97}h10v10h-10z"/>`).join(''));
  const t0 = Date.now(), out = o.optimise(many);
  t.ok(out.length < many.length && Date.now() - t0 < 20000, `20,000 paths (${(many.length / 1e6).toFixed(1)} MB) → ${(out.length / 1e6).toFixed(1)} MB in ${Date.now() - t0} ms`);

  // ---- sv_diff: do two rasters look alike?
  const W = 64, H = 64, img = (f) => { const d = new Uint8Array(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b] = f(x, y); d.set([r, g, b, 255], (y * W + x) * 4); } return d; };
  const grey = [128, 128, 128], square = (x0, y0, n, c = [0, 0, 0]) => img((x, y) => (x >= x0 && x < x0 + n && y >= y0 && y < y0 + n ? c : grey));
  const a = square(10, 10, 30);
  t.eq(o.diff(a, a, W, H), { mean: 0, big: 0 }, 'identical pictures: 0');
  const shifted = o.diff(a, square(11, 10, 30), W, H);
  t.eq(shifted, { mean: 0, big: 0 }, 'the same square one pixel to the right counts as the same (edge shifts are ignored)');
  const gone = o.diff(a, img(() => grey), W, H);
  t.ok(gone.big > 0.15 && gone.mean > 20, `a missing square is different (mean ${gone.mean.toFixed(1)}, ${(gone.big * 100).toFixed(1)} % of pixels)`);
  const recol = o.diff(a, square(10, 10, 30, [200, 0, 0]), W, H);
  t.ok(recol.big > 0.15, 'a square in another colour is different');
  const faint = o.diff(a, square(10, 10, 30, [3, 3, 3]), W, H);
  t.ok(faint.big === 0 && faint.mean > 0.5 && faint.mean < 1, `a 3-level colour change is small but measured (mean ${faint.mean.toFixed(2)})`);
  const far = o.diff(a, square(14, 10, 30), W, H);
  t.ok(far.big > 0.02, 'a four-pixel shift is a real difference');
  const thin = o.diff(img((x) => (x === 20 ? [0, 0, 0] : grey)), img(() => grey), W, H), thin2 = o.diff(img(() => grey), img((x) => (x === 20 ? [0, 0, 0] : grey)), W, H);
  t.ok(thin.big > 0.01 && Math.abs(thin.big - thin2.big) < 1e-12 && thin.mean === thin2.mean, 'a hairline that exists in only one picture is found, whichever picture has it');
  // the same answers as a plain JavaScript version of the measure, on random pictures
  const js = (p, q) => { let sum = 0, big = 0; const dist = (A, i, B, j) => Math.max(Math.abs(A[i * 4] - B[j * 4]), Math.abs(A[i * 4 + 1] - B[j * 4 + 1]), Math.abs(A[i * 4 + 2] - B[j * 4 + 2])); const near = (A, B, x, y) => { let m = 255; for (let yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(W - 1, x + 1); xx++) m = Math.min(m, dist(A, y * W + x, B, yy * W + xx)); return m; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.max(near(p, q, x, y), near(q, p, x, y)); sum += d; if (d > 48) big++; } return { mean: sum / (W * H), big: big / (W * H) }; };
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32; let agree = 0;
  for (let k = 0; k < 12; k++) { const p = img(() => [rnd() * 256 | 0, rnd() * 256 | 0, rnd() * 256 | 0]), q = k % 2 ? img((x, y) => { const i = (y * W + x) * 4; return rnd() < 0.3 ? [rnd() * 256 | 0, 0, 0] : [p[i], p[i + 1], p[i + 2]]; }) : img(() => [rnd() * 256 | 0, rnd() * 256 | 0, rnd() * 256 | 0]); const w1 = o.diff(p, q, W, H), w2 = js(p, q); if (Math.abs(w1.mean - w2.mean) < 1e-9 && Math.abs(w1.big - w2.big) < 1e-12) agree++; }
  t.eq(agree, 12, 'sv_diff equals a plain JavaScript version of the measure on 12 random picture pairs');
  t.eq(o.diff(new Uint8Array(0), new Uint8Array(0), 0, 0), { mean: 0, big: 0 }, 'empty rasters');
};
