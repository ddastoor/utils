// graphviz.wasm (Graphviz 14.1.2 + Expat, our build): every layout engine runs; SVG/JSON/plain/xdot/canon outputs are
// well-formed and agree with the graph (node/edge counts, labels, HTML-like labels, clusters, rankdir order, ports,
// record shapes); attribute defaults; errors (syntax, unknown engine/format) are reported without breaking the next call.
export default async (t, { load, wasm }) => {
  const { bindGraphviz, ENGINES } = await load('src/wasm/graphviz.ts');
  const gv = bindGraphviz(await wasm('graphviz'));
  const g = 'digraph G { a -> b -> c; a -> c; b [label="Bee"]; }';
  for (const e of ENGINES) {
    const r = gv.render(g, e, 'svg');
    t.ok(r.code === 0 && r.output.startsWith('<?xml') && (r.output.match(/class="node"/g) || []).length === 3 && (r.output.match(/class="edge"/g) || []).length === (e === 'patchwork' ? 0 : 3), `${e}: SVG with 3 nodes and ${e === 'patchwork' ? 'no edges (a treemap)' : '3 edges'}${r.messages ? ' (' + r.messages + ')' : ''}`);
  }
  const svg = gv.render(g, 'dot', 'svg').output;
  t.ok(svg.includes('>Bee</text>') && svg.includes('<title>a&#45;&gt;b</title>'), 'labels and edge titles in the SVG');
  // plain: node positions; dot ranks top to bottom (y decreases along a -> b -> c)
  const plain = (src, e = 'dot') => Object.fromEntries(gv.render(src, e, 'plain').output.split('\n').filter((l) => l.startsWith('node ')).map((l) => { const p = l.split(' '); return [p[1], { x: +p[2], y: +p[3] }]; }));
  let p = plain(g); t.ok(p.a.y > p.b.y && p.b.y > p.c.y, `dot ranks a above b above c (${p.a.y}, ${p.b.y}, ${p.c.y})`);
  p = plain('digraph { rankdir=LR; a -> b -> c }'); t.ok(p.a.x < p.b.x && p.b.x < p.c.x && p.a.y === p.c.y, 'rankdir=LR: left to right on one line');
  p = plain('graph { a -- b; b -- c; c -- a }', 'circo'); const d = (u, v) => Math.hypot(p[u].x - p[v].x, p[u].y - p[v].y);
  t.near(d('a', 'b'), d('b', 'c'), 0.05, 'circo: triangle sides equal (ab vs bc)'); t.near(d('b', 'c'), d('c', 'a'), 0.05, 'circo: triangle sides equal (bc vs ca)');
  p = plain('graph { root -- a; root -- b; root -- c; root -- d; root=root }', 'twopi'); const r0 = ['a', 'b', 'c', 'd'].map((k) => Math.hypot(p[k].x - p.root.x, p[k].y - p.root.y));
  t.ok(Math.max(...r0) - Math.min(...r0) < 0.01, 'twopi: leaves on one circle around the root');
  p = plain('graph { a -- b [len=3]; }', 'neato'); t.near(Math.hypot(p.a.x - p.b.x, p.a.y - p.b.y), 3, 0.1, 'neato honours edge len (3 in)');
  p = plain('graph { a [pos="1,2!"]; b [pos="4,6!"]; a -- b }', 'neato'); t.ok(p.b.x - p.a.x === 3 && p.b.y - p.a.y === 4, `neato keeps pinned positions (pos="x,y!" in inches): b − a = (${p.b.x - p.a.x}, ${p.b.y - p.a.y})`);
  // JSON
  const j = JSON.parse(gv.render('digraph { subgraph cluster_x { label="Team"; a; b } a -> b; c }', 'dot', 'json').output);
  t.eq([j.objects.filter((o) => o.nodes === undefined).length, j.edges.length, j.objects.some((o) => o.label === 'Team')], [3, 1, true], 'JSON: 3 nodes, 1 edge, the cluster');
  t.ok(/^\d+(\.\d+)?,\d+(\.\d+)?$/.test(j.objects.find((o) => o.name === 'a').pos), 'JSON node pos');
  // HTML-like labels (Expat) and records
  const html = gv.render('digraph { n [shape=plaintext label=<<table><tr><td port="p1"><b>Bold</b></td><td>Two &amp; three</td></tr></table>>]; m; n:p1 -> m }', 'dot', 'svg');
  t.ok(html.code === 0 && html.output.includes('>Bold</text>') && html.output.includes('Two &amp; three') && html.output.includes('font-weight="bold"'), `HTML-like label rendered (${html.messages})`);
  const bad = gv.render('digraph { n [label=<<table><tr><td>x</td></table>>] }', 'dot', 'svg');
  t.ok(/mismatched tag|syntax error/i.test(bad.messages), `malformed HTML label reported (${bad.messages.split('\n')[0]})`);
  const rec = gv.render('digraph { s [shape=record label="<f0> left|<f1> mid|<f2> right"]; t; s:f2 -> t }', 'dot', 'svg');
  t.ok(rec.code === 0 && ['left', 'mid', 'right'].every((w) => rec.output.includes(`>${w}</text>`)), 'record shape fields');
  // canon / xdot / dot formats
  t.ok(gv.render('digraph { a -> b }', 'dot', 'canon').output.includes('a -> b'), 'canon output');
  t.ok(/_draw_/.test(gv.render('digraph { a -> b }', 'dot', 'xdot').output), 'xdot drawing operations');
  t.ok(/pos="/.test(gv.render('digraph { a -> b }', 'dot', 'dot').output), 'dot output with positions');
  // Unicode
  t.ok(gv.render('digraph { "नमस्ते" -> "€ 5" -> "😀" }', 'dot', 'svg').output.includes('>नमस्ते</text>'), 'Unicode node names (UTF-8)');
  // errors and recovery
  let r = gv.render('digraph { a -> }', 'dot', 'svg'); t.ok(r.code === 1 && /syntax error in line 1/.test(r.messages), `syntax error (${r.messages})`);
  r = gv.render('digraph { a }', 'nope', 'svg'); t.ok(r.code === 2 && /Layout type: "nope" not recognized/.test(r.messages), `unknown engine (${r.messages.split('\n')[0]})`);
  r = gv.render('digraph { a }', 'dot', 'png'); t.ok(r.code === 3 && /Format: "png" not recognized/.test(r.messages), `unknown format (${r.messages.split('\n')[0]})`);
  r = gv.render('digraph { a [shape=nosuch] }', 'dot', 'svg'); t.ok(r.code === 0 && /using box for unknown shape nosuch/.test(r.messages), `warning kept with the result (${r.messages})`);
  t.ok(gv.render(g, 'dot', 'svg').code === 0 && !gv.render(g, 'dot', 'svg').messages, 'next call clean after errors');
  // a bigger graph
  const big = 'digraph { ' + Array.from({ length: 100 }, (_, i) => `n${i} -> n${(i * 7 + 3) % 100}; n${i} -> n${(i * 13 + 1) % 100};`).join(' ') + ' }';
  for (const e of ['dot', 'sfdp']) { const t0 = performance.now(); r = gv.render(big, e, 'svg'); t.ok(r.code === 0 && (r.output.match(/class="node"/g) || []).length === 100, `100 nodes / 200 edges with ${e} (${Math.round(performance.now() - t0)} ms)`); }
};
