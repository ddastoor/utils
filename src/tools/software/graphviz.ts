// Graphviz (DOT) — PC only. Graphviz 14.1.2 compiled by us to WebAssembly (wasm/graphviz), run in a worker
// (src/workers/graphviz.worker.ts) so a long layout can be stopped. The SVG is shown as an image (inert: no scripts or
// links from the graph run in this page). Text formats (plain, JSON, xdot, dot with positions, canon) for tooling.
import { h, card, field, textarea, segmented, select, clear, note, copy, button, outputBox, filePicker, downloadBlob, type Mount } from '../../ui';
import { graphviz, stopGraphviz } from '../../lib/graphviz-client';
import { debounce } from './devui';

export const SAMPLES: Record<string, [string, string]> = {
  Flowchart: ['dot', `digraph Order {
  rankdir=TB;
  node [shape=box, style="rounded,filled", fillcolor="#e8f0fe", fontname="Helvetica"];
  start [label="Order placed", shape=oval, fillcolor="#d2f4d8"];
  pay [label="Payment OK?", shape=diamond, fillcolor="#fff4cf"];
  start -> pay;
  pay -> pack [label="yes"];
  pay -> retry [label="no"];
  retry [label="Ask to pay again"];
  retry -> pay [style=dashed];
  pack [label="Pack and ship"];
  pack -> done;
  done [label="Delivered", shape=oval, fillcolor="#d2f4d8"];
}`],
  Clusters: ['dot', `digraph Services {
  compound=true; node [shape=box, fontname="Helvetica"];
  subgraph cluster_web { label="Web"; style=filled; color="#eef3fb"; ui; api; }
  subgraph cluster_data { label="Data"; style=filled; color="#f6efe6"; db [shape=cylinder]; cache [shape=cylinder]; }
  ui -> api; api -> db; api -> cache; worker -> db [lhead=cluster_data];
}`],
  'HTML table': ['dot', `digraph Tables {
  node [shape=plaintext, fontname="Helvetica"];
  users [label=<<table border="0" cellborder="1" cellspacing="0">
    <tr><td bgcolor="#dbe7fb"><b>users</b></td></tr>
    <tr><td port="id" align="left">id  int</td></tr>
    <tr><td align="left">name  text</td></tr></table>>];
  orders [label=<<table border="0" cellborder="1" cellspacing="0">
    <tr><td bgcolor="#dbe7fb"><b>orders</b></td></tr>
    <tr><td align="left">id  int</td></tr>
    <tr><td port="uid" align="left">user_id  int</td></tr></table>>];
  orders:uid -> users:id;
}`],
  'State machine': ['dot', `digraph FSM {
  rankdir=LR; node [shape=circle, fontname="Helvetica"];
  idle [shape=doublecircle];
  idle -> running [label="start"];
  running -> paused [label="pause"];
  paused -> running [label="resume"];
  running -> idle [label="stop"];
  paused -> idle [label="stop"];
}`],
  Network: ['neato', `graph Network {
  node [shape=circle, style=filled, fillcolor="#e8f0fe", fontname="Helvetica"]; overlap=false;
  router -- {pc1 pc2 printer nas};
  nas -- backup; router -- switch; switch -- {cam1 cam2 tv};
}`],
  'Mind map': ['twopi', `graph Trip {
  root=Trip; ranksep=1.6; node [shape=box, style="rounded,filled", fillcolor="#fef3d6", fontname="Helvetica"];
  Trip -- {Tickets Packing Places Budget};
  Tickets -- {Train Hotel}; Packing -- {Clothes Charger Medicines}; Places -- {Fort Beach Market}; Budget -- {Food Travel};
}`],
  Cycle: ['circo', `digraph Cycle {
  node [shape=box, style=rounded, fontname="Helvetica"];
  Plan -> Build -> Test -> Release -> Feedback -> Plan;
}`],
};
const ENGINES: Array<[string, string]> = [['dot', 'dot (layers)'], ['neato', 'neato (spring)'], ['fdp', 'fdp (force)'], ['sfdp', 'sfdp (large graphs)'], ['circo', 'circo (circular)'], ['twopi', 'twopi (radial)'], ['osage', 'osage (clusters)'], ['patchwork', 'patchwork (treemap)']];
const TEXT_FORMATS: Array<[string, string]> = [['plain', 'plain (positions)'], ['json', 'JSON'], ['dot', 'DOT with positions'], ['xdot', 'xdot (drawing operations)'], ['canon', 'canon (normalised DOT)']];

export const mount: Mount = (root) => {
  let engine = 'dot', textFmt = 'plain', svgText = '', svgUrl = '', seq = 0, zoom: 'fit' | '100' = 'fit';
  const src = textarea({ rows: 18, mono: true, value: SAMPLES.Flowchart[1] });
  const engineSel = select(ENGINES, 'dot', (v) => { engine = v; render(); });
  engineSel.setAttribute('aria-label', 'Layout engine');
  const img = h('img', { class: 'gv-img', alt: 'Rendered graph' }) as HTMLImageElement;
  const view = h('div', { class: 'gv-view fit' }, img), status = h('div'), busy = h('div', { hidden: true }, note('Laying out…', 'info'), button('Stop', () => stopGraphviz(), { small: true, icon: 'Square' }));
  const textOut = outputBox({ rows: 12, mono: true });
  const msgFilter = (m: string) => m.split('\n').filter((l) => l.trim() && !/no value for width of non-ASCII character|Falling back to width of space/.test(l)).join('\n');
  const render = async () => {
    const my = ++seq;
    const timer = setTimeout(() => { if (my === seq) busy.hidden = false; }, 400);
    try {
      const r = await graphviz(src.value, engine, 'svg');
      if (my !== seq) return;
      clear(status);
      const msg = msgFilter(r.messages);
      if (r.code) { status.append(note(msg || 'Graphviz could not draw this graph.', 'warn')); return; }
      if (msg) status.append(note(msg, 'info'));
      svgText = r.output;
      if (svgUrl) URL.revokeObjectURL(svgUrl);
      svgUrl = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' })); img.src = svgUrl;
      renderText();
    } catch (e: any) { if (my === seq) clear(status).append(note(e?.message === 'Stopped' ? 'Stopped. Edit the graph or pick a faster engine (sfdp for big graphs).' : String(e?.message || e), 'warn')); }
    finally { clearTimeout(timer); if (my === seq) busy.hidden = true; }
  };
  const renderText = async () => {
    const r = await graphviz(src.value, engine, textFmt).catch(() => null);
    textOut.value = r && !r.code ? (textFmt === 'json' ? JSON.stringify(JSON.parse(r.output), null, 2) : r.output) : '';
  };
  const png = async () => {
    if (!svgText) throw new Error('Nothing to save yet');
    const m = /viewBox="([\d.\s-]+)"/.exec(svgText); const [, , w, hgt] = m ? m[1].trim().split(/\s+/).map(Number) : [0, 0, img.naturalWidth, img.naturalHeight];
    const scale = Math.min(2, 16000 / Math.max(w, hgt, 1)) * (96 / 72);   // points → pixels at 2×, capped for huge graphs
    const im = new Image(); im.src = svgUrl; await im.decode();
    const c = h('canvas'); c.width = Math.ceil(w * scale); c.height = Math.ceil(hgt * scale);
    const g = c.getContext('2d')!; g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
    await new Promise<void>((res) => c.toBlob((b) => { if (b) downloadBlob(b, 'graph.png'); res(); }, 'image/png'));
  };
  const rerun = debounce(render, 300);
  src.addEventListener('input', rerun);
  const samples = h('div', { class: 'chips' }, Object.entries(SAMPLES).map(([k, [e, s]]) => button(k, () => { src.value = s; engine = e; engineSel.value = e; render(); }, { small: true })));
  root.append(h('div', { class: 'grid2' },
    card(null, samples, field('DOT source', src), field('Layout engine', engineSel),
      filePicker({ accept: '.dot,.gv,.txt', label: 'Open a .dot / .gv file', onFiles: async ([f]) => { src.value = await f.text(); render(); } }),
      button('Download .dot', () => downloadBlob(new Blob([src.value], { type: 'text/vnd.graphviz' }), 'graph.dot'), { small: true, icon: 'Download' })),
    card('Graph', busy, status, h('div', { class: 'row' }, segmented([['fit', 'Fit'], ['100', '100 %']], 'fit', (v) => { zoom = v; view.classList.toggle('fit', zoom === 'fit'); })), view,
      h('div', { class: 'row' }, button('Download SVG', () => { if (!svgText) throw new Error('Nothing to save yet'); downloadBlob(new Blob([svgText], { type: 'image/svg+xml' }), 'graph.svg'); }, { small: true, icon: 'Download' }),
        button('Download PNG', png, { small: true, icon: 'Image' }), button('Copy SVG', () => copy(svgText), { small: true, icon: 'Copy' })))),
  card('Text output', field('Format', select(TEXT_FORMATS, 'plain', (v) => { textFmt = v; renderText(); })), textOut),
  note('Graphviz 14.1.2 (dot, neato, fdp, sfdp, circo, twopi, osage, patchwork) compiled from the official C source to WebAssembly. Text widths use Graphviz\'s built-in font metrics, so labels in unusual fonts can sit a little loose or tight.', 'info'));
  render();
  return () => { rerun.cancel(); if (svgUrl) URL.revokeObjectURL(svgUrl); };
};
