// Graphviz (DOT) — PC only. Graphviz compiled by us to WebAssembly (wasm/graphviz), run in a worker
// (src/workers/graphviz.worker.ts): the newest text wins and a long layout can be stopped. One layout gives the
// picture and the chosen text format. The SVG is shown as an image (inert: no scripts or links from the graph run in
// this page). Text formats (plain, JSON, xdot, dot with positions, canon) for tooling.
import { h, card, field, textarea, segmented, select, clear, note, copy, button, outputBox, filePicker, downloadBlob, readBytes, type Mount } from '../../ui';
import { graphviz, stopGraphviz, type GvAnswer } from '../../lib/graphviz-client';
import { decodeGraphFile, looksBinary, tidyMessages, xmlSafe, svgSize, pngSize, fileStem, lineSpan, TEXT_EXT } from '../../lib/graphviz-text';
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
/** The text box shows this much of a long result; Copy and Download give all of it. */
const SHOWN = 500_000;
/** A file larger than this is not put into the editor (a text box of this size stalls the page). */
const MAX_FILE = 20 * 1024 * 1024;
const num = (n: number) => n.toLocaleString('en-IN');

export const mount: Mount = (root) => {
  let engine = 'dot', textFmt = 'plain', index = 0, fileName = '', seq = 0, zoom: 'fit' | '100' | '200' = 'fit', pngScale = 2;
  // what is on screen: the picture and text of `good.src`; `current` = it belongs to the text in the editor now
  let good: { svg: string; text: string; fmt: string; stem: string } | null = null, current = false, svgUrl = '';
  const src = textarea({ rows: 18, mono: true, value: SAMPLES.Flowchart[1] });
  src.setAttribute('aria-label', 'DOT source');
  const engineSel = select(ENGINES, 'dot', (v) => { engine = v; render(); });
  engineSel.setAttribute('aria-label', 'Layout engine');
  const graphSel = h('select', { class: 'input select', 'aria-label': 'Which graph of the text' }) as HTMLSelectElement;
  graphSel.addEventListener('change', () => { index = +graphSel.value; render(); });
  const graphField = h('div', { hidden: true }, field('Graph', graphSel, 'The text holds more than one graph; one is drawn at a time.'));
  const img = h('img', { class: 'gv-img', alt: 'Drawing of the graph' }) as HTMLImageElement;
  const view = h('div', { class: 'gv-view fit' }, img), status = h('div', { class: 'gv-status' }), info = h('div', { class: 'gv-info field-hint' }), fileNote = h('div');
  const busy = h('div', { hidden: true }, note(h('span', null, 'Laying out… ', button('Stop', () => stopGraphviz(), { small: true, icon: 'Square' })), 'info'));
  const textOut = outputBox({ rows: 12, mono: true, label: 'Text output', text: () => needCurrent().text });
  const textNote = h('div');
  const sized = () => { const s = good && svgSize(good.svg); img.style.width = s && zoom === '200' ? `${Math.round(s.w * 2)}px` : ''; };
  const stale = (on: boolean) => { current = !on && !!good; view.classList.toggle('stale', on && !!good); };
  const needCurrent = () => { if (!good) throw new Error('Nothing to save yet'); if (!current) throw new Error('The drawing shown belongs to an earlier text — put the graph right first'); return good; };
  const gotoLine = (n: number) => { const [a, b] = lineSpan(src.value, n); src.focus(); src.setSelectionRange(a, b); const lh = parseFloat(getComputedStyle(src).lineHeight) || 18; src.scrollTop = Math.max(0, (n - 4) * lh); };
  const say = (raw: string, kind: 'info' | 'warn') => {
    const m = tidyMessages(raw);
    if (!m.lines.length) return;
    const body = h('div', null, m.lines.map((l) => h('div', null, l)), m.more ? h('div', null, `… and ${num(m.more)} more messages`) : null,
      m.line ? button(`Go to line ${num(m.line)}`, () => gotoLine(m.line!), { small: true }) : null);
    status.append(note(body, kind === 'warn' || m.errors ? 'warn' : 'info'));
  };
  const setGraphs = (r: GvAnswer) => {
    index = r.index;
    graphField.hidden = r.graphs < 2;
    if (r.graphs >= 2 && graphSel.options.length !== r.graphs) graphSel.replaceChildren(...Array.from({ length: r.graphs }, (_, i) => h('option', { value: String(i) }, `${i + 1} of ${r.graphs}`)));
    graphSel.value = String(index);
  };
  const render = async () => {
    const my = ++seq, text = src.value;
    clearTimeout(busyTimer); busy.hidden = true;
    if (!text.trim()) {
      stopGraphviz(); clear(status).append(note('Type a graph in the DOT language, pick an example or open a file.', 'info'));
      good = null; current = false; view.classList.remove('stale'); img.removeAttribute('src'); textOut.value = ''; clear(textNote); clear(info); graphField.hidden = true; return;
    }
    busyTimer = setTimeout(() => { if (my === seq) busy.hidden = false; }, 400);
    stale(true);
    try {
      const r = await graphviz({ src: text, engine, formats: ['svg', textFmt], index });
      if (my !== seq) return;
      clear(status); setGraphs(r);
      if (!r.outputs[0]) { say(r.messages || 'Graphviz could not draw this graph.', 'warn'); if (good) status.append(note('The drawing below is of the last text that could be drawn.', 'info')); clear(info); return; }
      const safe = xmlSafe(r.outputs[0]);
      good = { svg: safe.svg, text: r.outputs[1], fmt: textFmt, stem: fileStem(fileName, r.index, r.graphs) };
      stale(false);
      if (svgUrl) URL.revokeObjectURL(svgUrl);
      svgUrl = URL.createObjectURL(new Blob([good.svg], { type: 'image/svg+xml' })); img.src = svgUrl; sized();
      say(r.messages, 'info');
      if (r.engine !== engine) status.append(note(`This graph sets layout=${r.engine}, so ${r.engine} laid it out — as the dot program does. Remove the attribute to choose the engine here.`, 'info'));
      if (safe.removed) status.append(note(`${num(safe.removed)} control character${safe.removed > 1 ? 's' : ''} in the labels ${safe.removed > 1 ? 'were' : 'was'} left out of the SVG: XML does not allow them.`, 'info'));
      textOut.value = good.text.length > SHOWN ? good.text.slice(0, SHOWN) : good.text;
      clear(textNote);
      if (!good.text && r.code) textNote.append(note('Graphviz could not write this format for the graph.', 'warn'));
      else if (good.text.length > SHOWN) textNote.append(note(`Showing the first ${num(SHOWN)} of ${num(good.text.length)} characters. Copy and Download give all of it.`, 'info'));
      info.textContent = [`${num(r.nodes)} node${r.nodes === 1 ? '' : 's'}`, `${num(r.edges)} edge${r.edges === 1 ? '' : 's'}`, r.directed ? 'directed' : 'undirected', `laid out by ${r.engine} in ${r.ms < 10 ? r.ms.toFixed(1) : num(Math.round(r.ms))} ms`, `Graphviz ${r.version}`,
        r.measured ? '' : 'text widths from Graphviz\'s own tables'].filter(Boolean).join(' · ');
    } catch (e: any) {
      if (my !== seq || e?.message === 'Superseded') return;
      clear(status).append(note(e?.message === 'Stopped' ? 'Stopped. Edit the graph or pick a faster engine (sfdp for big graphs).' : String(e?.message || e), 'warn'));
      if (good) status.append(note('The drawing below is of the last text that could be drawn.', 'info'));
      clear(info);
    } finally { if (my === seq) { clearTimeout(busyTimer); busy.hidden = true; } }
  };
  let busyTimer: any = null;
  img.addEventListener('error', () => { if (img.getAttribute('src')) status.append(note('The browser could not show this SVG. Download it to look at what Graphviz wrote.', 'warn')); });
  const png = async () => {
    const g = needCurrent(), s = svgSize(g.svg) || { w: img.naturalWidth, h: img.naturalHeight };
    if (!(s.w > 0 && s.h > 0)) throw new Error('The drawing has no size');
    const p = pngSize(s.w, s.h, pngScale);
    const im = new Image(); im.src = svgUrl; await im.decode();
    const c = h('canvas'); c.width = p.w; c.height = p.h;
    const cx = c.getContext('2d'); if (!cx) throw new Error('The browser could not make a picture this large — use the SVG');
    cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, p.w, p.h); cx.drawImage(im, 0, 0, p.w, p.h);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
    if (!blob) throw new Error('The browser could not make a picture this large — use the SVG');
    downloadBlob(blob, `${g.stem}.png`);
    clear(pngNote).append(note(p.reduced ? `The drawing is too large for ${pngScale}×: the PNG is ${num(p.w)} × ${num(p.h)} pixels (${p.scale.toFixed(2)}×). The SVG has no such limit.` : `PNG saved: ${num(p.w)} × ${num(p.h)} pixels.`, p.reduced ? 'warn' : 'ok'));
  };
  const pngNote = h('div');
  const rerun = debounce(render, 300);
  src.addEventListener('input', () => { stale(true); rerun(); });
  src.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); rerun.cancel(); render(); } });
  const open = async ([f]: File[]) => {
    clear(fileNote);
    if (f.size > MAX_FILE) throw new Error(`${f.name} is ${num(Math.round(f.size / 1048576))} MB — too large to edit here (the limit is 20 MB)`);
    const bytes = await readBytes(f);
    if (looksBinary(bytes)) throw new Error(`${f.name} is not a text file. A graph file (.gv, .dot) is plain text.`);
    const d = decodeGraphFile(bytes);
    src.value = d.text.replace(/^﻿/, ''); fileName = f.name; index = 0;
    if (d.as) fileNote.append(note(`${f.name} is not UTF-8: read as ${d.as}.`, 'info'));
    rerun.cancel(); render();
  };
  const samples = h('div', { class: 'chips' }, Object.entries(SAMPLES).map(([k, [e, s]]) => button(k, () => { src.value = s; engine = e; engineSel.value = e; fileName = ''; index = 0; clear(fileNote); rerun.cancel(); render(); }, { small: true })));
  root.append(h('div', { class: 'grid2' },
    card(null, samples, field('DOT source', src, 'Drawn as you type. Ctrl+Enter draws at once.'), field('Layout engine', engineSel), graphField,
      filePicker({ accept: '.dot,.gv,.txt,text/vnd.graphviz,text/plain', label: 'Open a .dot / .gv file', onFiles: open }), fileNote,
      button('Download .dot', () => downloadBlob(new Blob([src.value], { type: 'text/vnd.graphviz' }), fileName || 'graph.dot'), { small: true, icon: 'Download' })),
    card('Graph', busy, status, h('div', { class: 'row' }, segmented([['fit', 'Fit'], ['100', '100 %'], ['200', '200 %']], 'fit', (v) => { zoom = v; view.classList.toggle('fit', zoom === 'fit'); sized(); })), view, info,
      h('div', { class: 'row' }, button('Download SVG', () => { const g = needCurrent(); downloadBlob(new Blob([g.svg], { type: 'image/svg+xml' }), `${g.stem}.svg`); }, { small: true, icon: 'Download' }),
        button('Download PNG', png, { small: true, icon: 'Image' }),
        (() => { const s = select([['1', 'PNG 1×'], ['2', 'PNG 2×'], ['4', 'PNG 4×']], '2', (v) => { pngScale = +v; }); s.setAttribute('aria-label', 'PNG size'); s.classList.add('gv-scale'); return s; })(),
        button('Copy SVG', () => copy(needCurrent().svg), { small: true, icon: 'Copy' })), pngNote)),
  card('Text output', field('Format', select(TEXT_FORMATS, 'plain', (v) => { textFmt = v; render(); })), textOut, textNote,
    button('Download', () => { const g = needCurrent(); if (!g.text) throw new Error('Nothing to save yet'); downloadBlob(new Blob([g.text], { type: g.fmt === 'json' ? 'application/json' : 'text/plain' }), `${g.stem}.${TEXT_EXT[g.fmt] || 'txt'}`); }, { small: true, icon: 'Download' })),
  note('Graphviz (dot, neato, fdp, sfdp, circo, twopi, osage, patchwork), compiled from its official C source to WebAssembly. Labels are measured with the fonts of this browser, so text in any script fits its box. Pictures (image=…) and files a graph points to are not loaded: nothing leaves or enters this page.', 'info'));
  render();
  return () => { seq++; rerun.cancel(); clearTimeout(busyTimer); if (svgUrl) URL.revokeObjectURL(svgUrl); };
};
