// graphviz.wasm (Graphviz 16.1.0 + Expat, our build with our changes — wasm/graphviz).
//
// The reference is the NATIVE dot of the same release and the same patched source (scripts/make-graphviz-reference.mjs
// → tests/fixtures/graphviz/reference.json): for 240 graph files of the Graphviz sources and our own hazard graphs,
// in all eight layout engines, the module must draw what the tool draws — the same SVG byte for byte where the
// engine's arithmetic is the same on every machine (dot, neato, circo, osage, patchwork), and at least the same
// nodes, sizes, labels and edges where the last digit of sin / cos decides (fdp, sfdp, twopi) — and say what it says.
// Every drawing gets a fresh instance, as in the tab; one pass reuses a single instance.
// Our own parts have references of their own: rand() against glibc's values, qsort against a stable sort, the
// Delaunay triangulation against the Delaunator package and against exact arithmetic, prism against geometry
// (no two nodes overlap), the text-measuring import against what the SVG then says.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Delaunator from 'delaunator';
import { ENGINES, EXACT, sections, normSvg, short, plainGraphs, plainWords, signature, normErr, aborted } from '../lib/graphviz-ref.mjs';

export default async (t, { load, wasm, root }) => {
  const { bindGraphviz, graphvizHost, ENGINES: listed } = await load('src/wasm/graphviz.ts');
  const txt = await load('src/lib/graphviz-text.ts');
  const fx = join(root, 'tests/fixtures/graphviz');
  const ref = JSON.parse(readFileSync(join(fx, 'reference.json'), 'utf8'));
  /** a new instance; `measure` = the host's answer to "how wide is this text" (none: Graphviz's own tables) */
  const raw = async (measure) => { const host = graphvizHost(measure); const e = await wasm('graphviz', host.imports); host.attach(e); return e; };
  const fresh = async (measure) => bindGraphviz(await raw(measure));
  const gv = await fresh();
  t.eq(gv.version(), ref.graphviz, `the module and the reference are the same Graphviz release (${ref.graphviz})`);
  t.eq([...listed], ENGINES, 'the eight engines');

  // ---------------------------------------------------------------------------------------------------------------
  // 1. the basics, with known answers
  const g = 'digraph G { a -> b -> c; a -> c; b [label="Bee"]; }';
  for (const e of ENGINES) {
    const r = gv.render(g, e, 'svg');
    t.ok(r.code === 0 && r.output.startsWith('<?xml') && (r.output.match(/class="node"/g) || []).length === 3 && (r.output.match(/class="edge"/g) || []).length === (e === 'patchwork' ? 0 : 3), `${e}: 3 nodes${e === 'patchwork' ? '' : ', 3 edges'} (${r.messages})`);
  }
  const svg = gv.render(g, 'dot', 'svg').output;
  t.ok(svg.includes('>Bee</text>') && svg.includes('<title>a&#45;&gt;b</title>'), 'labels and edge titles in the SVG');
  const plain = (src, e = 'dot') => Object.fromEntries(gv.render(src, e, 'plain').output.split('\n').filter((l) => l.startsWith('node ')).map((l) => { const p = l.split(' '); return [p[1], { x: +p[2], y: +p[3], w: +p[4], h: +p[5] }]; }));
  let p = plain(g); t.ok(p.a.y > p.b.y && p.b.y > p.c.y, `dot ranks a above b above c (${p.a.y}, ${p.b.y}, ${p.c.y})`);
  p = plain('digraph { rankdir=LR; a -> b -> c }'); t.ok(p.a.x < p.b.x && p.b.x < p.c.x && p.a.y === p.c.y, 'rankdir=LR: left to right on one line');
  p = plain('graph { a -- b; b -- c; c -- a }', 'circo'); const d = (u, v) => Math.hypot(p[u].x - p[v].x, p[u].y - p[v].y);
  t.near(d('a', 'b'), d('b', 'c'), 0.05, 'circo: triangle sides equal (ab vs bc)'); t.near(d('b', 'c'), d('c', 'a'), 0.05, 'circo: triangle sides equal (bc vs ca)');
  p = plain('graph { root -- a; root -- b; root -- c; root -- d; root=root }', 'twopi'); const r0 = ['a', 'b', 'c', 'd'].map((k) => Math.hypot(p[k].x - p.root.x, p[k].y - p.root.y));
  t.ok(Math.max(...r0) - Math.min(...r0) < 0.01, 'twopi: leaves on one circle around the root');
  p = plain('graph { a -- b [len=3]; }', 'neato'); t.near(Math.hypot(p.a.x - p.b.x, p.a.y - p.b.y), 3, 0.1, 'neato honours edge len (3 in)');
  p = plain('graph { a [pos="1,2!"]; b [pos="4,6!"]; a -- b }', 'neato'); t.ok(p.b.x - p.a.x === 3 && p.b.y - p.a.y === 4, `neato keeps pinned positions (pos="x,y!" in inches): b − a = (${p.b.x - p.a.x}, ${p.b.y - p.a.y})`);
  const j = JSON.parse(gv.render('digraph { subgraph cluster_x { label="Team"; a; b } a -> b; c }', 'dot', 'json').output);
  t.eq([j.objects.filter((o) => o.nodes === undefined).length, j.edges.length, j.objects.some((o) => o.label === 'Team')], [3, 1, true], 'JSON: 3 nodes, 1 edge, the cluster');
  t.ok(/^\d+(\.\d+)?,\d+(\.\d+)?$/.test(j.objects.find((o) => o.name === 'a').pos), 'JSON node pos');
  const html = gv.render('digraph { n [shape=plaintext label=<<table><tr><td port="p1"><b>Bold</b></td><td>Two &amp; three</td></tr></table>>]; m; n:p1 -> m }', 'dot', 'svg');
  t.ok(html.code === 0 && html.output.includes('>Bold</text>') && html.output.includes('Two &amp; three') && html.output.includes('font-weight="bold"'), `HTML-like label rendered (${html.messages})`);
  const bad = gv.render('digraph { n [label=<<table><tr><td>x</td></table>>] }', 'dot', 'svg');
  t.ok(/mismatched tag|syntax error/i.test(bad.messages), `malformed HTML label reported (${bad.messages.split('\n')[0]})`);
  const rec = gv.render('digraph { s [shape=record label="<f0> left|<f1> mid|<f2> right"]; t; s:f2 -> t }', 'dot', 'svg');
  t.ok(rec.code === 0 && ['left', 'mid', 'right'].every((w) => rec.output.includes(`>${w}</text>`)), 'record shape fields');
  t.ok(gv.render('digraph { a -> b }', 'dot', 'canon').output.includes('a -> b'), 'canon output');
  t.ok(/_draw_/.test(gv.render('digraph { a -> b }', 'dot', 'xdot').output), 'xdot drawing operations');
  t.ok(/pos="/.test(gv.render('digraph { a -> b }', 'dot', 'dot').output), 'dot output with positions');
  t.ok(gv.render('digraph { "नमस्ते" -> "€ 5" -> "😀" }', 'dot', 'svg').output.includes('>नमस्ते</text>'), 'Unicode node names (UTF-8)');
  let r = gv.render('digraph { a -> }', 'dot', 'svg'); t.ok(r.code === 1 && /syntax error in line 1/.test(r.messages), `syntax error (${r.messages})`);
  r = gv.render('digraph { a }', 'nope', 'svg'); t.ok(r.code === 2 && /Layout type: "nope" not recognized/.test(r.messages), `unknown engine (${r.messages.split('\n')[0]})`);
  r = gv.render('digraph { a }', 'dot', 'png'); t.ok(r.code === 3 && /Format: "png" not recognized/.test(r.messages), `unknown format (${r.messages.split('\n')[0]})`);
  r = gv.render('digraph { a [shape=nosuch] }', 'dot', 'svg'); t.ok(r.code === 0 && /using box for unknown shape nosuch/.test(r.messages), `warning kept with the result (${r.messages})`);
  t.ok(gv.render(g, 'dot', 'svg').code === 0 && !gv.render(g, 'dot', 'svg').messages, 'next call clean after errors');
  const big = 'digraph { ' + Array.from({ length: 100 }, (_, i) => `n${i} -> n${(i * 7 + 3) % 100}; n${i} -> n${(i * 13 + 1) % 100};`).join(' ') + ' }';
  for (const e of ['dot', 'sfdp']) { const t0 = performance.now(); r = gv.render(big, e, 'svg'); t.ok(r.code === 0 && (r.output.match(/class="node"/g) || []).length === 100, `100 nodes / 200 edges with ${e} (${(performance.now() - t0).toFixed(0)} ms)`); }

  // one layout, several formats; what the answer says about the graph
  let a = gv.renderAll('digraph { a -> b; b -> c; subgraph cluster_x { d } }', 'dot', ['svg', 'plain', 'json', 'canon', 'xdot', 'dot']);
  t.ok(a.code === 0 && a.outputs.length === 6 && a.outputs.every((o) => o.length > 20) && a.outputs[0].startsWith('<?xml') && a.outputs[1].startsWith('graph ') && JSON.parse(a.outputs[2]).objects.length === 5, 'renderAll: six formats from one layout');
  t.eq([a.nodes, a.edges, a.directed, a.graphs, a.index, a.engine], [4, 2, true, 1, 0, 'dot'], 'renderAll: 4 nodes, 2 edges, directed, one graph, laid out by dot');
  t.eq(gv.render('digraph { a -> b; b -> c; subgraph cluster_x { d } }', 'dot', 'plain').output, a.outputs[1], 'the plain format of renderAll is the one render gives');
  a = gv.renderAll('graph { a -- b }', 'neato', ['svg', 'nosuch', 'plain']);
  t.ok(a.code === 3 && a.outputs[0].startsWith('<?xml') && a.outputs[1] === '' && a.outputs[2].startsWith('graph ') && /Format: "nosuch" not recognized/.test(a.messages) && !a.directed, 'a format Graphviz does not have: that output is empty, the others are there');
  a = gv.renderAll('', 'dot', ['svg']); t.eq([a.code, a.outputs, a.messages, a.graphs], [1, [''], 'Error: there is no graph in this text', 0], 'an empty text: code 1 and a plain sentence');
  a = gv.renderAll('  \n// only a comment\n', 'dot', ['svg']); t.eq([a.code, a.graphs], [1, 0], 'a text of comments holds no graph');
  for (const [i, fmt] of ['svg', 'plain', 'json', 'canon', 'xdot', 'dot', 'gv', 'plain-ext', 'json0', 'dot_json', 'xdot_json', 'xdot1.4', 'svg_inline', 'fig', 'pic', 'tk', 'ps', 'eps', 'imap', 'cmapx', 'pov'].entries()) {
    const o = gv.render('digraph { a -> b [label=x] }', 'dot', fmt); t.ok(o.code === 0 && o.output.length > 10, `format ${i + 1}: ${fmt} (${o.output.length} characters)`);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 2. the native tool as reference
  const stats = Object.fromEntries(ENGINES.map((e) => [e, { n: 0, same: 0, aborts: 0 }]));
  /** One drawing against the reference entry `want` (graph k of it). Returns what is wrong ('' = nothing). */
  const NONE = 'Error: there is no graph in this text';   // ours: the tool says nothing about a text without a graph
  const hold = async (src, engine, k, want, { messages = true, engineOf = null } = {}) => {
    let o;
    // where the tool aborts on one of its assertions, the module stops too (a trap) — and nowhere else
    try { o = (await fresh()).renderAll(src, engine, ['svg', 'plain'], k); } catch (e) { stats[engine].aborts++; return aborted(want) ? '' : `${engine}: TRAP ${e.message}`; }
    if (aborted(want)) return `${engine}: an answer (code ${o.code}), but native dot aborts: ${want.err}`;
    const st = stats[engine]; if (want.svg[k]) st.n++;
    // the messages of the drawing alone: writing a second format (plain) can add warnings of its own
    const said = async () => { const m = normErr(o.messages); return m === (want.err || '') ? m : normErr((await fresh()).renderAll(src, engine, ['svg'], k).messages); };
    if (!want.svg[k]) {
      if (o.outputs[0]) return `${engine}: drawn, but native dot drew nothing`;
      const m = messages ? await said() : '', expected = want.err || (want.svg.length ? '' : NONE);
      return messages && m !== expected ? `${engine}: says ${JSON.stringify(m)}, native ${JSON.stringify(want.err || '')}` : '';
    }
    if (!o.outputs[0]) return `${engine}: nothing drawn (${o.messages})`;
    const same = short(normSvg(o.outputs[0])) === want.svg[k], pg = plainGraphs(o.outputs[1])[0];
    if (same) st.same++;
    else if (EXACT.includes(engineOf || engine)) return `${engine}: the SVG differs from native dot's`;
    if (!same && (!pg || signature(pg) !== want.sig[k])) return `${engine}: other nodes or edges than native dot's`;
    if (!pg || pg.nodes.length !== want.n[k][0] || pg.edges.length !== want.n[k][1]) return `${engine}: ${pg?.nodes.length} nodes and ${pg?.edges.length} edges in the plain output, native ${want.n[k]}`;
    if (messages) { const m = await said(); if (m !== (want.err || '')) return `${engine}: says ${JSON.stringify(m.slice(0, 200))}, native ${JSON.stringify((want.err || '').slice(0, 200))}`; }
    return '';
  };
  // 2a. 240 graph files from the Graphviz sources (its own examples and test graphs), every engine
  const files = readdirSync(join(fx, 'graphs')).filter((f) => f.endsWith('.gv')).sort();
  t.eq(files, Object.keys(ref.graphs).sort(), `the reference covers the ${files.length} graph files`);
  const texts = new Map(files.map((f) => [f, txt.decodeGraphFile(readFileSync(join(fx, 'graphs', f))).text]));
  for (const f of files) {
    const wrong = [];
    for (const e of ENGINES) {
      const want = ref.graphs[f][e];
      // a file's own layout= attribute decides the engine, in the tool and here: then that engine's rule applies
      const own = /\blayout\s*=\s*"?(\w+)/.exec(texts.get(f))?.[1];
      for (let k = 0; k < Math.max(1, want.svg.length); k++) { const w = await hold(texts.get(f), e, k, want, { messages: want.svg.length <= 1, engineOf: own && ENGINES.includes(own) ? own : null }); if (w) wrong.push(w); }
    }
    t.ok(!wrong.length, `${f}: as native dot draws it, in ${ENGINES.length} engines${wrong.length ? ` — ${wrong.slice(0, 3).join('; ')}` : ''}`);
  }
  // 2b. our hazard graphs: each piece alone (drawing and messages), and the whole file with the piece's number
  const hazards = readdirSync(join(fx, 'hazards')).filter((f) => f.endsWith('.gv')).sort();
  t.eq(hazards, Object.keys(ref.hazards).sort(), `the reference covers the ${hazards.length} hazard files`);
  let pieces = 0;
  for (const f of hazards) {
    const whole = readFileSync(join(fx, 'hazards', f), 'utf8'), parts = sections(whole), entries = ref.hazards[f];
    if (!parts.length) continue;                                    // read whole: 2c
    t.eq(parts.length, entries.length, `${f}: ${parts.length} pieces, as in the reference`);
    for (const [i, part] of parts.entries()) {
      const wrong = []; pieces++;
      for (const e of ENGINES) { const w = await hold(part.text, e, 0, entries[i][e]); if (w) wrong.push(w); }
      // several graphs in one text: piece i of the whole file is the same drawing (the cut marks are comments to Graphviz)
      if (f !== 'errors.gv' && entries[i].dot.svg.length === 1) {
        const o = (await fresh()).renderAll(whole, 'dot', ['svg'], i);
        if (o.graphs !== parts.length) wrong.push(`the whole file holds ${o.graphs} graphs, not ${parts.length}`);
        else if (short(normSvg(o.outputs[0])) !== entries[i].dot.svg[0]) wrong.push('as graph of the whole file: another drawing');
      }
      t.ok(!wrong.length, `${f} #${i + 1} (${part.title}): as native dot draws it${wrong.length ? ` — ${wrong.slice(0, 3).join('; ')}` : ''}`);
    }
  }
  // 2c. files read whole, several graphs each
  {
    const whole = readFileSync(join(fx, 'hazards/multi.gv'), 'utf8'), want = ref.hazards['multi.gv'][0];
    t.eq(want.dot.svg.length, 5, 'multi.gv: native dot draws five graphs');
    for (let k = 0; k < 5; k++) { const wrong = []; for (const e of ENGINES) { const w = await hold(whole, e, k, want[e], { messages: false }); if (w) wrong.push(w); } t.ok(!wrong.length, `multi.gv, graph ${k + 1} of 5: as native dot draws it ${wrong.slice(0, 3).join('; ')}`); }
    const o = gv.renderAll(whole, 'dot', ['canon'], 3); t.ok(o.graphs === 5 && o.index === 3 && /anonymous -> fourth/.test(o.outputs[0]), 'graph 4 of 5 is the one without a name');
    const last = gv.renderAll(whole, 'dot', ['canon'], 99); t.ok(last.index === 4 && /digraph fifth/.test(last.outputs[0]), 'a number beyond the last graph gives the last one');
    const me = readFileSync(join(fx, 'hazards/multi-error.gv'), 'utf8'), wantMe = ref.hazards['multi-error.gv'][0].dot;
    t.eq([wantMe.svg.length, wantMe.err], [2, "Error: syntax error in line 3 near ';'"], 'multi-error.gv: native dot draws two graphs, then reports line 3 — of the third graph');
    for (let k = 0; k < 2; k++) { const m = (await fresh()).renderAll(me, 'dot', ['svg'], k); t.ok(m.code === 0 && m.graphs === 2 && short(normSvg(m.outputs[0])) === wantMe.svg[k] && m.messages === "Error: syntax error in line 7 near ';'", `multi-error.gv, graph ${k + 1}: drawn, and the error names line 7 of the text (${m.messages})`); }
  }
  // 2d. the line of an error is the line of the whole text: native's line + the lines in front of the graph
  {
    const errs = sections(readFileSync(join(fx, 'hazards/errors.gv'), 'utf8')), want = ref.hazards['errors.gv'];
    let n = 0;
    for (const [i, part] of errs.entries()) {
      const m = /in line (\d+)/.exec(want[i].dot.err || ''); if (!m) continue;
      for (const before of [1, 4, 37]) {
        const lead = Array.from({ length: before }, (_, q) => `digraph ok${q} { a -> b }\n`).join('');
        const o = (await fresh()).renderAll(lead + part.text, 'dot', ['svg'], 0);
        const expected = want[i].dot.err.replace(/in line \d+/, `in line ${+m[1] + before}`);
        t.ok(o.code === 0 && o.graphs === before && normErr(o.messages) === expected, `"${part.title}" after ${before} line${before > 1 ? 's' : ''} of good graphs: ${expected.split('\n')[0]} (got ${o.messages.split('\n')[0]})`); n++;
      }
    }
    t.ok(n >= 30, `${n} line-number cases`);
    // a message of the layout (not of the reader) keeps its own line numbers: an HTML label counts its own lines
    const o = (await fresh()).renderAll('digraph one { a }\n\n\ndigraph two { n [label=<<table><tr><td>x</td></table>>] }', 'dot', ['svg'], 1);
    t.ok(/in line 1\b/.test(o.messages) && !/in line [45]/.test(o.messages), `an error inside an HTML label is counted within the label (${o.messages.split('\n')[0]})`);
  }
  // 2e. how much is the same
  const floor = { dot: 1, neato: 1, circo: 1, osage: 1, patchwork: 1, twopi: 0.99, sfdp: 0.85, fdp: 0.45 };   // seen: twopi 100 %, sfdp 89 %, fdp 49 %
  for (const e of ENGINES) t.ok(stats[e].same >= stats[e].n * floor[e], `${e}: ${stats[e].same} of ${stats[e].n} drawings are byte for byte native dot's${floor[e] < 1 ? ` (at least ${Math.round(floor[e] * 100)} % expected: the rest differ by the C library's sin and cos)` : ''}`);
  t.ok(pieces >= 190, `${pieces} hazard pieces`);
  // 2f. one instance for many graphs. Graphviz the library counts on across graphs — the numbers in the ids of
  // gradients and link anchors — so a drawing depended on what was drawn before it. That is why the tab takes a
  // fresh instance for every drawing; here: apart from those numbers nothing of one graph reaches the next.
  {
    const one = await fresh(); let same = 0, ids = 0, n = 0; const other = [];
    const noCount = (x) => normSvg(x).replace(/\b((?:(?:graph|clust|node|edge)\d+_)?[lr]_)\d+\b/g, '$1N').replace(/\b(a_(?:graph|clust|node|edge)\d+(?:_\w+?)?_)\d+\b/g, '$1N');
    for (const f of files) {
      const want = ref.graphs[f].dot; if (want.svg.length !== 1) continue; n++;
      const o = one.renderAll(texts.get(f), 'dot', ['svg']);
      if (o.outputs[0] && short(normSvg(o.outputs[0])) === want.svg[0]) same++;
      else if (o.outputs[0] && noCount(o.outputs[0]) === noCount((await fresh()).renderAll(texts.get(f), 'dot', ['svg']).outputs[0])) ids++;
      else other.push(f);
    }
    t.eq(other, [], `one instance, ${n} graphs in a row: ${same} drawings byte for byte as from a fresh instance, ${ids} with other numbers in gradient and anchor ids, none different otherwise`);
    t.ok(ids > 0 && same + ids === n, `those running numbers are real (${ids} drawings): a reused instance does not draw the same text the same way twice`);
    const twice = [one.render('digraph { a [style=filled fillcolor="red:blue"] }', 'dot', 'svg').output, one.render('digraph { a [style=filled fillcolor="red:blue"] }', 'dot', 'svg').output];
    const fresh2 = [(await fresh()).render('digraph { a [style=filled fillcolor="red:blue"] }', 'dot', 'svg').output, (await fresh()).render('digraph { a [style=filled fillcolor="red:blue"] }', 'dot', 'svg').output];
    t.ok(twice[0] !== twice[1] && fresh2[0] === fresh2[1], 'the same text twice: two different SVGs from one instance, the same SVG from two fresh ones');
  }
  // 2g. the crash this build repairs (storeline.patch): a label whose first line is empty, in every engine and format
  for (const src of ['digraph { a [label="\\nx"] }', 'digraph { rankdir=LR; r [shape=record label="{\\n a|{b|\\n}|<p> c\\l}"] }', 'digraph { a -> b [label="\\n\\nedge" headlabel="\\l"] }', 'digraph { label="\\n"; subgraph cluster_a { label="\\ntitle"; a } }']) {
    let ok = 0; const one = await fresh();
    for (const e of ENGINES) for (const fmt of ['svg', 'plain', 'json', 'xdot']) { for (let i = 0; i < 3; i++) if (one.render(src, e, fmt).code === 0) ok++; }
    t.eq(ok, ENGINES.length * 4 * 3, `${src}: drawn three times in a row in every engine and format (an uninitialised text span made this a trap)`);
  }

  // 2h. Faults of Graphviz itself that the hazard graphs ran into (the dot program has them; not ours to repair):
  //  - splines=ortho with a loop in circo and twopi fails an assertion of the ortho router. The tool aborts; the
  //    module, built with the assertions in, stops at the same check (a trap) — the hazard piece above holds it to
  //    that — and the next graph is drawn by a new instance.
  //  - fdp looks nodes up by the text of their names, so an HTML name <y> and a plain name "y" become one node to
  //    it. The tool then reads past an array and aborts on an assertion; in WebAssembly the stray read gives 0 and
  //    a drawing comes out in which <y> was never placed. Nothing here tells the two apart, so this is only noted.
  {
    let trapped = ''; try { (await fresh()).render('digraph { splines=ortho; a -> b -> c; a -> c; c -> a; b -> b }', 'circo', 'svg'); } catch (e) { trapped = e.message; }
    t.ok(/unreachable/.test(trapped), `ortho splines with a loop in circo: the module stops where the tool aborts (${trapped})`);
    t.eq((await fresh()).render('digraph { splines=ortho; a -> b -> c; a -> c; c -> a }', 'circo', 'svg').code, 0, 'without the loop the same graph is drawn');
    t.eq(aborted(ref.hazards['layout.gv'].find((x) => x.title === 'spline kinds').circo), true, 'the reference says the tool aborts there');
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 3. a graph's own attributes that the glue acts on
  a = gv.renderAll('graph { layout=neato; a -- b -- c -- a }', 'dot', ['plain']);
  t.ok(a.engine === 'neato' && a.outputs[0] === gv.renderAll('graph { a -- b -- c -- a }', 'neato', ['plain']).outputs[0].replace(/^/, ''), 'layout=neato in the graph wins over the engine asked for, as with dot -K (the drawing is neato\'s)');
  a = gv.renderAll('graph { layout=nosuch; a -- b }', 'dot', ['svg']); t.ok(a.code === 2 && a.engine === 'nosuch' && /Layout type: "nosuch" not recognized/.test(a.messages), `an unknown layout= is an error that names it (${a.messages.split('\n')[0]})`);
  a = gv.renderAll('graph { layout=""; a -- b }', 'circo', ['svg']); t.ok(a.code === 2 && a.engine === '' && /Layout type: "" not recognized/.test(a.messages), `an empty layout= is an error too, as for the dot program (${a.messages.split('\n')[0].slice(0, 60)})`);
  for (const cs of ['latin1', 'Latin-1', 'ISO-8859-1', 'big5', 'nosuch']) {
    const o = gv.renderAll(`digraph { charset="${cs}"; a [label="é ₹ 漢 😀"] }`, 'dot', ['svg', 'canon']);
    t.ok(o.code === 0 && o.outputs[0].includes('>é ₹ 漢 😀</text>') && /encoding="UTF-8"/.test(o.outputs[0]) && /charset="?UTF-8/.test(o.outputs[1]), `charset=${cs}: the text arrives as UTF-8 and stays what it is (${o.messages})`);
  }
  a = gv.renderAll('digraph { charset="utf-8"; a [label="é"] }', 'dot', ['canon']); t.ok(/charset="utf-8"/.test(a.outputs[0]), 'charset="utf-8" is left as written');
  // a real Latin-1 file: decoded by the tab's reader, then the same drawing as native dot makes from the bytes
  {
    const bytes = Buffer.from('digraph { charset=latin1; a [label="Gr\xf6\xdfe \xa3 \xe9"]; a -> "\xd1and\xfa" }', 'latin1'), d = txt.decodeGraphFile(new Uint8Array(bytes));
    t.eq([d.as, d.text.includes('Größe £ é'), d.text.includes('Ñandú')], ['Windows-1252 (Latin-1)', true, true], 'a Latin-1 file is recognised and decoded');
    const o = gv.renderAll(d.text, 'dot', ['svg']); t.ok(o.outputs[0].includes('>Größe £ é</text>') && o.outputs[0].includes('>Ñandú</text>'), 'and drawn with its characters');
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 4. text measured by the host (in the tab: the browser's canvas)
  {
    const seen = [];
    const measured = await fresh((f, s) => { seen.push({ ...f, text: s }); return s.length * 10; });
    const src = 'digraph { a [label="hello" fontname="Helvetica-Bold" fontsize=20 shape=box]; b [label="two\\nlines here" fontname="Times-Italic"]; c [label=<x <b>bold</b> <i>it</i> <font face="Courier" point-size="9">mono</font>> fontname="Arial"]; d [fontname="Noto Sans Devanagari" label="नमस्ते"]; e [fontname="Helvetica-Narrow" label="narrow"] }';
    const o = measured.renderAll(src, 'dot', ['plain', 'svg']);
    const by = (s) => seen.find((x) => x.text === s);
    t.eq(by('hello'), { family: 'Helvetica,sans-Serif', weight: 'bold', style: '', stretch: '', size: 20, text: 'hello' }, 'Helvetica-Bold at 20: family, weight and size as the SVG will say them');
    t.eq([by('two'), by('lines here')].map((x) => [x.family, x.style, x.size]), [['Times,serif', 'italic', 14], ['Times,serif', 'italic', 14]], 'every line of a label is measured on its own, in Times italic');
    t.eq([by('bold').weight, by('it').style, by('mono').family, by('mono').size, by('x ').family], ['bold', 'italic', 'Courier,monospace', 9, 'Arial'], 'HTML labels: <b>, <i> and <font> reach the measuring (Arial is no PostScript font: its name goes as it is)');
    t.eq([by('नमस्ते').family, by('narrow').stretch], ['Noto Sans Devanagari', 'condensed'], 'a font Graphviz does not know keeps its name; Helvetica-Narrow is "condensed"');
    const nodes = Object.fromEntries(o.outputs[0].split('\n').filter((l) => l.startsWith('node ')).map((l) => { const w = plainWords(l); return [w[1], +w[4]]; }));
    t.near(nodes.a, (50 + 16) / 72, 0.001, 'a box is as wide as the measured text (5 × 10) plus its margins (2 × 8 points)');
    t.ok(nodes.d > nodes.a && nodes.d < 2 * nodes.a, `an ellipse around 60 measured points is wider than the box around 50 (${nodes.d} in)`);
    // the words handed to the host are the ones in the SVG: each text element's attributes
    const tags = [...o.outputs[1].matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map((m) => ({ a: m[1], text: m[2].replace(/&#160;/g, ' ').replace(/&amp;/g, '&') }));
    let agree = 0;
    for (const tag of tags) {
      const s = seen.find((x) => x.text.trim() === tag.text.trim()); if (!s) continue;
      const at = (n) => new RegExp(`\\b${n}="([^"]*)"`).exec(tag.a)?.[1] || '';
      if (at('font-family') === s.family && at('font-weight') === s.weight && at('font-style') === s.style && at('font-stretch') === s.stretch && +at('font-size') === s.size) agree++; else t.ok(false, `measured ${JSON.stringify(s)} but the SVG says ${tag.a}`);
    }
    t.ok(agree === tags.length && agree >= 9, `${agree} text elements of the SVG carry exactly the font words that were measured`);
    // which names go into the SVG: fontnames=svg and fontnames=ps
    for (const [mode, family] of [['svg', 'sans-Serif'], ['ps', 'Helvetica-Bold,sans-Serif'], ['gd', 'Helvetica,sans-Serif']]) {
      const got = []; const m = await fresh((f, s) => { got.push(f); return s.length * 7; });
      const out = m.render(`digraph { fontnames=${mode}; a [fontname="Helvetica-Bold" label="x"] }`, 'dot', 'svg').output;
      t.ok(got.length === 1 && out.includes(`font-family="${got[0].family}"`) && (got[0].weight ? out.includes(`font-weight="${got[0].weight}"`) : !out.includes('font-weight')), `fontnames=${mode}: measured as the SVG names the font (${got[0]?.family}${got[0]?.weight ? ' ' + got[0].weight : ''})`);
      t.eq(got[0]?.family, family, `fontnames=${mode}: family ${family}`);
    }
    // a host that does not measure: Graphviz's own tables, i.e. the drawing native dot makes
    const none = gv.render(src, 'dot', 'svg').output;
    for (const [name, answer] of [['-1', () => -1], ['NaN', () => NaN], ['Infinity', () => Infinity], ['an exception', () => { throw new Error('no canvas'); }], ['undefined', () => undefined]]) {
      const m = await fresh(answer); t.eq(m.render(src, 'dot', 'svg').output, none, `a host that answers ${name}: the drawing is the one without a host`);
    }
    const zero = await fresh(() => 0); t.ok(zero.render('digraph { a [label="any text" shape=box] }', 'dot', 'plain').output.includes('node a 0.375 0.25 0.75 0.5'), 'width 0 is an answer: the node has its minimum size');
    // wider text, wider node; the picture grows with it
    const w10 = (await fresh((f, s) => s.length * 10)).render('digraph { a [label="0123456789" shape=box] }', 'dot', 'plain').output, w30 = (await fresh((f, s) => s.length * 30)).render('digraph { a [label="0123456789" shape=box] }', 'dot', 'plain').output;
    t.near(+plainWords(w30.split('\n')[1])[4] - +plainWords(w10.split('\n')[1])[4], 200 / 72, 0.001, 'text measured 200 points wider makes the box 200 points wider');
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 5. the C library functions the module brings along
  {
    const e = await raw();
    const glibc = JSON.parse(readFileSync(join(fx, 'glibc-rand.json'), 'utf8')); let n = 0, okv = 0;
    for (const [seed, vals] of Object.entries(glibc)) { if (seed === 'glibc') continue; for (let i = 0; i < 5; i++) { n++; if (e.gv_rand(+seed | 0, i) === vals[i]) okv++; } n++; if (e.gv_rand(+seed | 0, 999) === vals[5]) okv++; }
    t.eq(okv, n, `rand(): ${n} values for 16 seeds are glibc ${glibc.glibc}'s (the first five and the 1000th of each)`);
    t.eq(e.gv_rand(0, 0), e.gv_rand(1, 0), 'srand(0) is srand(1), as in glibc');
    // qsort keeps equal elements in their order (glibc's merge sort; the reference here is JavaScript's stable sort)
    let seed = 99; const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
    let stable = 0, cases = 0;
    for (const len of [0, 1, 2, 3, 7, 8, 9, 31, 32, 33, 100, 255, 1000, 5000, 40000]) for (const range of [1, 2, 5, 1000]) {
      const keys = Array.from({ length: len }, () => Math.floor(rnd() * range) - (range >> 1));
      const ptr = e.gv_alloc(8 * len + 8), mem = new Int32Array(e.memory.buffer, ptr, 2 * len);
      keys.forEach((k, i) => { mem[2 * i] = k; mem[2 * i + 1] = i; });
      e.gv_sort_pairs(ptr, len);
      const got = Array.from(new Int32Array(e.memory.buffer, ptr, 2 * len)), want = keys.map((k, i) => [k, i]).sort((x, y) => x[0] - y[0]).flat();
      cases++; if (got.length === want.length && got.every((v, i) => v === want[i])) stable++;
      e.gv_free(ptr);
    }
    t.eq(stable, cases, `qsort: ${cases} arrays (up to 40,000 elements, many equal keys) come out as a stable sort orders them`);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 6. the Delaunay triangulation (st_delaunay.h) that prism overlap removal stands on
  {
    const e = await raw();
    const tri = (coords) => {
      const n = coords.length / 2, ptr = e.gv_alloc(16 * n + 16); new Float64Array(e.memory.buffer, ptr, 2 * n).set(coords);
      const out = e.gv_delaunay(ptr, n); e.gv_free(ptr);
      const head = new Int32Array(e.memory.buffer, out, 2), nt = head[0], nh = head[1], all = Array.from(new Int32Array(e.memory.buffer, out + 8, 6 * nt + nh)); e.gv_free(out);
      return { triangles: all.slice(0, 3 * nt), halfedges: all.slice(3 * nt, 6 * nt), hull: all.slice(6 * nt) };
    };
    let seed = 12345; const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
    const sets = []; const push = (kind, pts) => sets.push([kind, Float64Array.from(pts.flat())]);
    for (let k = 0; k < 150; k++) { const n = 1 + Math.floor(rnd() * 60); push('random', Array.from({ length: n }, () => [rnd() * 1000, rnd() * 1000])); }
    for (const n of [100, 500, 2000, 20000]) push('large', Array.from({ length: n }, () => [rnd() * 1e6 - 5e5, rnd() * 1e6 - 5e5]));
    for (let w = 1; w <= 9; w++) for (let h = 1; h <= 5; h++) push('grid', Array.from({ length: w * h }, (_, i) => [i % w, Math.floor(i / w)]));
    for (let k = 0; k < 80; k++) { const n = 2 + Math.floor(rnd() * 40); push('duplicates', Array.from({ length: n }, () => [Math.floor(rnd() * 6), Math.floor(rnd() * 6)])); }
    for (let k = 0; k < 45; k++) { const n = 1 + Math.floor(rnd() * 20); push('line', Array.from({ length: n }, () => { const v = Math.floor(rnd() * 50); return k % 3 === 0 ? [v, 7] : k % 3 === 1 ? [7, v] : [v, 2 * v + 1]; })); }
    for (let k = 0; k < 60; k++) { const n = 3 + Math.floor(rnd() * 30); push('nearly a line', Array.from({ length: n }, () => { const v = rnd() * 100; return [v, v * 0.1 + (rnd() < 0.2 ? 1e-13 * rnd() : 0)]; })); }
    for (let n = 3; n <= 30; n++) { push('circle', Array.from({ length: n }, (_, i) => [Math.cos(2 * Math.PI * i / n), Math.sin(2 * Math.PI * i / n)])); push('circle with centre', [[0, 0], ...Array.from({ length: n }, (_, i) => [100 * Math.cos(2 * Math.PI * i / n), 100 * Math.sin(2 * Math.PI * i / n)])]); }
    for (let k = 0; k < 60; k++) { const n = 3 + Math.floor(rnd() * 30), s = 10 ** (Math.floor(rnd() * 40) - 20); push('magnitudes', Array.from({ length: n }, () => [rnd() * s, rnd() * s])); }
    for (let k = 0; k < 60; k++) { const n = 3 + Math.floor(rnd() * 30); const base = Array.from({ length: n }, () => [rnd() * 10, rnd() * 10]); push('near-duplicates', [...base, ...base.map(([x, y]) => [x + (rnd() < 0.5 ? 0 : 2 ** -53), y])]); }
    for (let k = 0; k < 100; k++) { const n = 3 + Math.floor(rnd() * 80); push('layout rows', Array.from({ length: n }, () => [Math.round(rnd() * 20) * 36 + 27, Math.round(rnd() * 8) * 72 + 18])); }
    for (let k = 0; k < 100; k++) { const n = 3 + Math.floor(rnd() * 80); push('layout positions', Array.from({ length: n }, () => [Math.round(rnd() * 50000) / 100, Math.round(rnd() * 50000) / 100])); }
    const kinds = new Map();
    for (const [kind, coords] of sets) {
      const d = new Delaunator(coords), mine = tri(coords), k = kinds.get(kind) || { n: 0, same: 0, tris: 0 }; kinds.set(kind, k);
      k.n++; k.tris += mine.triangles.length / 3;
      const eq = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
      if (eq(mine.triangles, Array.from(d.triangles)) && eq(mine.halfedges, Array.from(d.halfedges)) && eq(mine.hull, Array.from(d.hull))) k.same++;
    }
    for (const [kind, k] of kinds) t.eq(k.same, k.n, `Delaunay, ${kind}: ${k.n} point sets (${k.tris} triangles) — triangles, half-edges and hull as Delaunator 5.1 makes them`);
    // exact arithmetic (BigInt, whole-number coordinates): every triangle turns the same way, no point lies inside
    // the circle through a triangle's corners, and the triangles are as many as Euler's formula asks for
    const det3 = (m) => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
    let exact = 0, exactTris = 0; const R = 1 << 20;
    for (let k = 0; k < 40; k++) {
      const n = 4 + Math.floor(rnd() * 44), pts = []; const used = new Set();
      while (pts.length < n) { const x = Math.floor(rnd() * R) - R / 2, y = Math.floor(rnd() * R) - R / 2; if (!used.has(`${x},${y}`)) { used.add(`${x},${y}`); pts.push([x, y]); } }
      const res = tri(Float64Array.from(pts.flat())), P = pts.map(([x, y]) => [BigInt(x), BigInt(y)]);
      let ok = res.triangles.length / 3 === 2 * n - 2 - res.hull.length, turn = 0n;
      for (let i = 0; i < res.triangles.length && ok; i += 3) {
        const [A, B, C] = [P[res.triangles[i]], P[res.triangles[i + 1]], P[res.triangles[i + 2]]];
        const o = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
        if (o === 0n || (turn !== 0n && (o > 0n) !== (turn > 0n))) ok = false; turn = o;
        for (let q = 0; q < n && ok; q++) {
          if (q === res.triangles[i] || q === res.triangles[i + 1] || q === res.triangles[i + 2]) continue;
          const D = P[q], row = (X) => { const dx = X[0] - D[0], dy = X[1] - D[1]; return [dx, dy, dx * dx + dy * dy]; };
          const inc = det3([...row(A), ...row(B), ...row(C)]);        // > 0: D inside the circle of a counter-clockwise A B C
          if ((o > 0n ? inc : -inc) > 0n) ok = false;
        }
        exactTris++;
      }
      if (ok) exact++;
    }
    t.eq(exact, 40, `Delaunay, exact check: 40 sets of whole-number points, ${exactTris} triangles — one orientation, empty circles, 2n − 2 − h triangles`);
    const one = tri(Float64Array.of(5, 5)), two = tri(Float64Array.of(1, 1, 0, 0)), none = tri(new Float64Array(0)), same = tri(Float64Array.of(3, 3, 3, 3, 3, 3));
    t.eq([one, two, none, same].map((x) => [x.triangles.length, x.hull]), [[0, [0]], [0, [1, 0]], [0, []], [0, [0]]], 'one point, two points, none, three on one spot: no triangles, the points in order');
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 7. prism overlap removal: after it no two nodes overlap (geometry is the reference here)
  {
    const boxes = (pl) => pl.split('\n').filter((l) => l.startsWith('node ')).map((l) => { const w = plainWords(l); return { x: +w[2], y: +w[3], w: +w[4], h: +w[5] }; });
    const overlaps = (pl) => { const ns = boxes(pl); let c = 0; for (let i = 0; i < ns.length; i++) for (let k = i + 1; k < ns.length; k++) if (Math.abs(ns[i].x - ns[k].x) < (ns[i].w + ns[k].w) / 2 - 1e-6 && Math.abs(ns[i].y - ns[k].y) < (ns[i].h + ns[k].h) / 2 - 1e-6) c++; return c; };
    const parts = sections(readFileSync(join(fx, 'hazards/overlap.gv'), 'utf8'));
    const prism = parts.filter((s) => /overlap=(prism|false)/.test(s.text));
    t.ok(prism.length >= 13, `${prism.length} prism graphs`);
    for (const part of prism) {
      const bad = [];
      for (const e of ['neato', 'fdp', 'sfdp', 'twopi', 'circo']) { const o = (await fresh()).render(part.text, e, 'plain'); if (o.code || /triangulation|unsupported/i.test(o.messages) || overlaps(o.output)) bad.push(`${e}: ${overlaps(o.output)} overlaps ${o.messages}`); }
      t.ok(!bad.length, `prism, "${part.title}" (${/graph (\w+)/.exec(part.text)[1]}): no node overlaps another in neato, fdp, sfdp, twopi, circo ${bad.join('; ')}`);
    }
    const keep = parts.find((s) => /overlap=true/.test(s.text)).text;
    t.ok(overlaps(gv.render(keep, 'neato', 'plain').output) > 0, 'the control: with overlap=true the same wide nodes do overlap');
    const many = 'graph { node [width=1.5 height=0.8]; ' + Array.from({ length: 120 }, (_, i) => `n${i} -- n${(i * 7 + 3) % 120}; n${i} -- n${(i * 11 + 5) % 120}`).join('; ') + ' }';
    const o = (await fresh()).render(many, 'sfdp', 'plain');
    t.ok(o.code === 0 && !o.messages && overlaps(o.output) === 0 && boxes(o.output).length === 120, `sfdp, 120 wide nodes: none overlap and no message (${o.messages})`);
    for (const s of ['triangle', 'rng']) { const q = (await fresh()).render(`graph { smoothing=${s}; a -- b -- c -- d -- e -- a; a -- c; e -- f }`, 'sfdp', 'plain'); t.ok(q.code === 0 && !q.messages && boxes(q.output).length === 6, `sfdp smoothing=${s} (needs the triangulation): drawn without a message`); }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 8. the tab's text helpers (src/lib/graphviz-text.ts)
  {
    const u = (s) => new TextEncoder().encode(s);
    t.eq(txt.decodeGraphFile(u('digraph { "é ₹" }')), { text: 'digraph { "é ₹" }', as: '' }, 'UTF-8 is read as it is');
    t.eq(txt.decodeGraphFile(Uint8Array.of(0xef, 0xbb, 0xbf, 0x61)).text.replace(/^﻿/, ''), 'a', 'a UTF-8 file with a byte order mark');
    t.eq(txt.decodeGraphFile(Uint8Array.of(0xff, 0xfe, 0x61, 0x00, 0xe9, 0x00)), { text: 'aé', as: 'UTF-16' }, 'UTF-16, little end first');
    t.eq(txt.decodeGraphFile(Uint8Array.of(0xfe, 0xff, 0x00, 0x61, 0x20, 0xb9)), { text: 'a₹', as: 'UTF-16' }, 'UTF-16, big end first');
    t.eq(txt.decodeGraphFile(Uint8Array.of(0x61, 0xe9, 0x80)), { text: 'aé€', as: 'Windows-1252 (Latin-1)' }, 'bytes that are not UTF-8: Windows-1252 (0x80 is the euro sign)');
    t.eq(txt.decodeGraphFile(new Uint8Array([...u('graph { charset="Big5"; "'), 0xa4, 0xa4, 0xa4, 0xe5, ...u('" }')])), { text: 'graph { charset="Big5"; "中文" }', as: 'Big5' }, 'a file that names Big5 is read as Big5');
    t.eq(txt.decodeGraphFile(new Uint8Array([...u('graph { charset=big-5 "'), 0xa4, 0xa4, ...u('" }')])).as, 'Big5', 'big-5 without quotes too');
    t.eq(txt.decodeGraphFile(new Uint8Array(0)), { text: '', as: '' }, 'an empty file');
    t.eq([txt.looksBinary(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 13)), txt.looksBinary(u('digraph {}')), txt.looksBinary(Uint8Array.of(0xff, 0xfe, 0x61, 0x00)), txt.looksBinary(new Uint8Array(0))], [true, false, false, false], 'a PNG is not text; a graph is; UTF-16 is (its zero bytes belong to it)');
    t.eq(txt.tidyMessages('Warning: Warning: no value for width\nWarning: Warning: no value for width\nError: syntax error in line 12 near \'x\'\n\n  Warning: other  '), { lines: ['Warning: no value for width (× 2)', "Error: syntax error in line 12 near 'x'", 'Warning: other'], more: 0, errors: 1, line: 12 }, 'messages: the doubled "Warning:", repeats counted, the line found');
    t.eq(txt.tidyMessages(Array.from({ length: 30 }, (_, i) => `Warning: w${i}`).join('\n'), 8), { lines: Array.from({ length: 8 }, (_, i) => `Warning: w${i}`), more: 22, errors: 0, line: null }, 'messages: eight shown, 22 more');
    t.eq(txt.tidyMessages(''), { lines: [], more: 0, errors: 0, line: null }, 'no messages');
    t.eq(txt.tidyMessages('Error: mismatched tag in line 1 \n... </td></table> ...\nin label of node n').line, null, 'a line number inside an HTML label is not a line of the text');
    t.eq(txt.tidyMessages('Error: mismatched tag in line 1 \n... </td></table> ...\nin label of node n\nError: syntax error in line 7 near \';\'').line, 7, 'but the next message\'s is');
    t.eq(txt.tidyMessages("Warning: syntax ambiguity - badly delimited number '6.' in line 3 of input splits into two tokens").line, 3, 'a warning names a line too');
    t.eq(txt.trapReason('unreachable', 'Assertion failed: cp (lib/ortho/ortho.c: chanSearch: 390)\n'), 'Graphviz stopped at one of its own checks ("cp" in chanSearch, ortho.c line 390) — a fault in Graphviz that the dot program has too', 'a failed assertion, in words');
    t.eq(txt.trapReason('unreachable', 'Assertion failed: index < self.size_bits && "out of bounds access" (/tmp/build/lib/util/bitarray.h: bitarray_get: 66)\n'), 'Graphviz stopped at one of its own checks ("index < self.size_bits && "out of bounds access"" in bitarray_get, bitarray.h line 66) — a fault in Graphviz that the dot program has too', 'the path of the source file is cut to its name');
    t.eq(txt.trapReason('unreachable', 'lib/ortho/ortho.c:1055: internal error: attempted to read the value of an empty optional type\n'), 'Graphviz stopped at one of its own checks (attempted to read the value of an empty optional type; ortho.c line 1055) — a fault in Graphviz that the dot program has too', 'an internal error of Graphviz');
    t.eq(txt.trapReason('unreachable', 'lib/ortho/trapezoid.c:308: claimed unreachable code was reached\n'), 'Graphviz stopped at one of its own checks (claimed unreachable code was reached; trapezoid.c line 308) — a fault in Graphviz that the dot program has too', 'code Graphviz holds to be unreachable');
    t.eq([txt.trapReason('unreachable', 'out of memory when trying to allocate 4294967296 bytes\n'), txt.trapReason('memory access out of bounds'), txt.trapReason('Maximum call stack size exceeded'), txt.trapReason('unreachable'), txt.trapReason('something else')], ['it ran out of memory', 'it ran out of memory', 'the graph nests deeper than the browser\'s call stack allows', 'Graphviz gave up inside the layout (an internal check failed or the memory ran out)', 'something else'], 'out of memory, too deep, unknown');
    t.eq(txt.xmlSafe('<text>a\u0001b\u0008c\td\ne\u001f￾</text>'), { svg: '<text>abc\td\ne</text>', removed: 4 }, 'characters XML forbids are taken out; tab and line break stay');
    t.eq(txt.xmlSafe('<svg/>'), { svg: '<svg/>', removed: 0 }, 'a clean SVG is untouched');
    t.eq(txt.svgSize('<?xml version="1.0"?>\n<svg width="62pt" height="116pt"\n viewBox="0.00 0.00 62.00 116.00">'), { w: 62 * (4 / 3), h: 116 * (4 / 3) }, 'size of an SVG in CSS pixels (Graphviz writes points)');
    t.eq([txt.svgSize('<svg width="2in" height="1in">'), txt.svgSize('<svg width="300" height="150px">'), txt.svgSize('<svg viewBox="0 0 1 1">'), txt.svgSize('<svg width="0pt" height="5pt">'), txt.svgSize('')], [{ w: 192, h: 96 }, { w: 300, h: 150 }, null, null, null], 'inches, plain numbers, and no size');
    t.eq(txt.pngSize(100, 50, 2), { w: 200, h: 100, scale: 2, reduced: false }, 'PNG at 2×');
    let q = txt.pngSize(20000, 100, 2); t.ok(q.reduced && q.w === 16384 && q.h === 82 && q.scale < 1, `a drawing wider than a canvas can be: ${q.w} × ${q.h}`);
    q = txt.pngSize(9000, 9000, 4); t.ok(q.reduced && q.w * q.h <= txt.PNG_MAX_AREA * 1.001 && q.w <= txt.PNG_MAX_SIDE && Math.abs(q.w - q.h) <= 1, `a drawing too large in area: ${q.w} × ${q.h}`);
    q = txt.pngSize(0.2, 0.2, 1); t.eq([q.w, q.h], [1, 1], 'never smaller than one pixel');
    t.eq([txt.fileStem('', 0, 1), txt.fileStem('my graph.gv', 0, 1), txt.fileStem('a.b.dot', 1, 3), txt.fileStem('.gv', 0, 1), txt.fileStem('x/y:z?.gv', 0, 2)], ['graph', 'my graph', 'a.b-2', 'graph', 'x_y_z_-1'], 'download names: from the opened file, "-2" for the second of several graphs');
    t.eq([txt.lineSpan('ab\ncde\n\nf', 1), txt.lineSpan('ab\ncde\n\nf', 2), txt.lineSpan('ab\ncde\n\nf', 3), txt.lineSpan('ab\ncde\n\nf', 4), txt.lineSpan('ab\ncde\n\nf', 9), txt.lineSpan('', 1)], [[0, 2], [3, 6], [7, 7], [8, 9], [8, 9], [0, 0]], 'where a line starts and ends in the text');
    t.eq(txt.cssFont({ family: 'Helvetica,sans-Serif', weight: 'bold', style: '', stretch: '', size: 20 }), 'bold 20px "Helvetica", sans-serif', 'a font for the canvas: names quoted, generic families not');
    t.eq(txt.cssFont({ family: 'Times,serif', weight: '', style: 'italic', stretch: 'condensed', size: 14.5 }), 'italic condensed 14.5px "Times", serif', 'style, stretch and a half size');
    t.eq(txt.cssFont({ family: 'Noto Sans Devanagari', weight: 'book', style: 'roman', stretch: 'narrow', size: 12 }), '12px "Noto Sans Devanagari"', 'words CSS does not know are left out, as the browser ignores them in the SVG');
    t.eq(txt.cssFont({ family: ' "Quoted Name" , My"Font\\ , MONOSPACE', weight: '700', style: 'Oblique', stretch: '', size: 9 }), 'oblique 700 9px "Quoted Name", "My\\"Font\\\\", monospace', 'quotes and backslashes in a name; a generic name in capitals');
    t.eq(txt.cssFont({ family: '', weight: '', style: '', stretch: '', size: 14 }), '14px serif', 'no family: the default');
    t.eq(Object.keys(txt.TEXT_EXT).sort(), ['canon', 'dot', 'json', 'plain', 'xdot'], 'an extension for every text format of the tab');
  }
};
