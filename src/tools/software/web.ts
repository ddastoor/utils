// Software › web design tabs: WCAG contrast (mathcore.wasm), CSS gradient and box-shadow builders (CSS text glue),
// SVG optimiser (our Rust svgo.wasm = OXVG).
import { h, card, field, input, select, segmented, toggle, slider, clear, note, copy, button, filePicker, fmtBytes, downloadBlob, type Mount } from '../../ui';
import { mathcore } from '../../wasm/mathcore';
import { svgo, resetSvgo, type Svgo } from '../../wasm/svgo';
import { cssColor, hexA, over, hexToRgb, rgbToHex, type Rgba } from '../../lib/color';
import { kvRows } from './devui';
import './web.css';

export { cssColor, hexA, over, type Rgba };
/** Colour picker + text box. The text box takes any CSS colour; `alpha` says whether a see-through colour is usable here. */
const colorInput = (value: string, label: string, onChange: (css: string) => void, alpha = false) => {
  const pick = h('input', { type: 'color', class: 'color-picker sm', value: value.slice(0, 7), 'aria-label': `${label} picker` });
  const txt = input({ value, attrs: { class: 'input mono', 'aria-label': label } });
  pick.addEventListener('input', () => { txt.value = pick.value; txt.classList.remove('bad'); txt.title = ''; onChange(pick.value); });
  txt.addEventListener('input', () => {
    const c = cssColor(txt.value), ok = !!c && (alpha || c[3] === 1);
    txt.classList.toggle('bad', !ok); txt.title = c && !ok ? 'A see-through colour cannot be used here — give an opaque colour' : !c && txt.value.trim() ? 'Not a colour — try #1f2937, rgb(31 41 55) or a name such as navy' : '';
    if (c && ok) { pick.value = rgbToHex(c[0], c[1], c[2]); onChange(hexA(c)); }
  });
  const el = h('div', { class: 'row color-in' }, pick, txt);
  return Object.assign(el, { set(v: string) { pick.value = v.slice(0, 7); txt.value = v; txt.classList.remove('bad'); txt.title = ''; } });
};

// ------------------------------------------------------------------ WCAG contrast checker
export const contrast: Mount = async (root) => {
  const mc = await mathcore();
  let fg = '#1f2937', bg = '#ffffff';
  const fgI = colorInput(fg, 'Text colour', (v) => { fg = v; run(); }, true), bgI = colorInput(bg, 'Background colour', (v) => { bg = v; run(); }, true);
  const big = h('div', { class: 'big-value center contrast-ratio' }), table = h('div'), preview = h('div', { class: 'contrast-preview' }), fix = h('div');
  /** The nearest colour to `c` (OKLCH: lightness moved as little as possible, hue kept, chroma lowered only when the
   *  gamut needs it — so pure white or black is found when nothing more colourful passes) that reaches `target` against `other`. */
  const nearest = (c: number[], other: number[], target: number) => {
    const [L, C, H] = mc.rgbToOklch(c[0], c[1], c[2]);
    for (let d = 1; d <= 100; d++) for (const k of [1, 0.75, 0.5, 0.25, 0]) for (const sgn of [-1, 1]) {
      const l2 = Math.min(100, Math.max(0, L + sgn * d)); if (l2 !== L + sgn * d && d < 100) continue;
      const rgb = mc.oklchToRgb(l2, C * k, H).map((x) => Math.min(255, Math.max(0, Math.round(x))));
      if (mc.contrast(rgb, other) >= target) return rgbToHex(rgb[0], rgb[1], rgb[2]);
    }
    return null;
  };
  const run = () => {
    const fc = cssColor(fg)!, bc = cssColor(bg)!;
    // see-through colours are judged as they appear: the background over a white page, the text over that background
    const b = bc[3] < 1 ? over(bc, [255, 255, 255]) : [bc[0], bc[1], bc[2]], a = fc[3] < 1 ? over(fc, b) : [fc[0], fc[1], fc[2]];
    const r = mc.contrast(a, b), shown = Math.floor(r * 100 + 1e-9) / 100; // WCAG: do not round up to pass (the tiny term only absorbs binary noise: 4.5 must not read 4.49)
    big.textContent = `${shown.toFixed(2)} : 1`;
    const pass = (t: number) => (r >= t ? h('span', { class: 'ok-text' }, '✓ Pass') : h('span', { class: 'err-text' }, '✗ Fail'));
    clear(table).append(h('table', { class: 'tbl' }, h('tbody', null,
      h('tr', null, h('th', null, 'Normal text — AA (4.5 : 1)'), h('td', null, pass(4.5))), h('tr', null, h('th', null, 'Normal text — AAA (7 : 1)'), h('td', null, pass(7))),
      h('tr', null, h('th', null, 'Large text (≥ 24 px, or 19 px bold) — AA (3 : 1)'), h('td', null, pass(3))), h('tr', null, h('th', null, 'Large text — AAA (4.5 : 1)'), h('td', null, pass(4.5))),
      h('tr', null, h('th', null, 'Icons, borders, UI parts — AA (3 : 1)'), h('td', null, pass(3))))));
    Object.assign(preview.style, { color: fg, background: bg });
    clear(fix);
    if (fc[3] < 1 || bc[3] < 1) fix.append(note(`${[bc[3] < 1 && `The background is ${Math.round(bc[3] * 100)} % opaque: over a white page it looks like ${rgbToHex(b[0], b[1], b[2])}.`, fc[3] < 1 && `The text is ${Math.round(fc[3] * 100)} % opaque: over this background it looks like ${rgbToHex(a[0], a[1], a[2])}.`].filter(Boolean).join(' ')} The ratio is for the colours as they appear.`, 'info'));
    if (r < 4.5) {
      const f = nearest(a, b, 4.5), g = nearest(b, a, 4.5);
      fix.append(note(h('span', null, 'To reach AA 4.5 : 1 keep the hue and ', f ? h('button', { type: 'button', class: 'link-btn mono', onclick: () => { fg = f; fgI.set(f); run(); } }, `use text ${f}`) : 'change the text colour', g ? [' or ', h('button', { type: 'button', class: 'link-btn mono', onclick: () => { bg = g; bgI.set(g); run(); } }, `background ${g}`)] : ''), 'info'));
    }
  };
  preview.append(h('p', { class: 'cp-large' }, 'Large heading text'), h('p', null, 'Body text: the quick brown fox jumps over the lazy dog. ₹1,234.56'), h('p', { class: 'cp-small' }, 'Small print, 13 px'));
  root.append(card(null, h('div', { class: 'grid2' }, field('Text', fgI), field('Background', bgI)), button('Swap', () => { [fg, bg] = [bg, fg]; fgI.set(fg); bgI.set(bg); run(); }, { small: true, icon: 'ArrowLeftRight' })),
    card('Contrast ratio', big, table, fix), card('Preview', preview), note('WCAG 2.2 relative-luminance contrast. The ratio is truncated, never rounded up, so a shown pass is a real pass. Colours can be typed as #hex, rgb(), hsl() or a CSS name.', 'info'));
  run();
};

// ------------------------------------------------------------------ CSS gradient
interface Stop { color: string; pos: number }
export function gradientCss(kind: string, angle: number, stops: Stop[], repeating: boolean, shape = 'circle', at = 'center') {
  const s = [...stops].sort((a, b) => a.pos - b.pos).map((x) => `${x.color} ${x.pos}%`).join(', ');
  const fn = `${repeating ? 'repeating-' : ''}${kind}-gradient`;
  return kind === 'linear' ? `${fn}(${angle}deg, ${s})` : kind === 'radial' ? `${fn}(${shape} at ${at}, ${s})` : `${fn}(from ${angle}deg at ${at}, ${s})`;
}
export const gradient: Mount = (root) => {
  let kind = 'linear', angle = 90, repeating = false, shape = 'circle', at = 'center';
  const stops: Stop[] = [{ color: '#ff9933', pos: 0 }, { color: '#ffffff', pos: 50 }, { color: '#138808', pos: 100 }];
  const prev = h('div', { class: 'grad-preview' }), code = h('pre', { class: 'mono out-pre css-out' }), list = h('div', { class: 'stack' });
  const css = () => gradientCss(kind, angle, stops, repeating, shape, at);
  const drawStops = () => clear(list).append(...stops.map((s, i) => { // the position box shows what is used: 150 becomes 100 when the box is left
    const pos = input({ type: 'number', value: s.pos, min: 0, max: 100, attrs: { 'aria-label': `Stop ${i + 1} position`, class: 'input num-sm' }, onInput: (v) => { s.pos = Math.max(0, Math.min(100, +v || 0)); run(); } });
    pos.addEventListener('change', () => { pos.value = String(s.pos); });
    return h('div', { class: 'row stop-row' }, colorInput(s.color, `Stop ${i + 1} colour`, (v) => { s.color = v; run(); }, true),
    pos, h('span', { class: 'muted' }, '%'),
    button('', () => { if (stops.length <= 2) throw new Error('A gradient needs at least two colours'); stops.splice(i, 1); drawStops(); run(); }, { small: true, icon: 'X', title: `Remove stop ${i + 1}` })); }));
  /** A new stop goes into the widest gap, in the colour the gradient has there. */
  const addStop = () => {
    const st = [...stops].sort((x, y) => x.pos - y.pos); let gi = 0;
    for (let i = 0; i + 1 < st.length; i++) if (st[i + 1].pos - st[i].pos > st[gi + 1].pos - st[gi].pos) gi = i;
    const ca = cssColor(st[gi].color)!, cb = cssColor(st[gi + 1].color)!;
    stops.push({ color: hexA(ca.map((x, k) => (x + cb[k]) / 2)), pos: Math.round((st[gi].pos + st[gi + 1].pos) / 2) });
  };
  const angleS = slider({ label: 'Angle', min: 0, max: 360, value: angle, unit: '°', onInput: (v) => { angle = v; run(); } });
  const shapeS = select([['circle', 'circle'], ['ellipse', 'ellipse']], shape, (v) => { shape = v; run(); }), atS = select([['center', 'center'], ['top', 'top'], ['bottom', 'bottom'], ['left', 'left'], ['right', 'right'], ['top left', 'top left'], ['top right', 'top right'], ['bottom left', 'bottom left'], ['bottom right', 'bottom right']], at, (v) => { at = v; run(); });
  // only the controls the chosen type uses are live: a radial gradient has no angle, a linear one no centre or shape
  const lock = () => { const a = kind === 'radial'; angleS.querySelector('input')!.disabled = a; angleS.classList.toggle('disabled', a); shapeS.disabled = kind !== 'radial'; atS.disabled = kind === 'linear'; };
  const run = () => { const c = css(); prev.style.background = c; code.textContent = `background: ${c};`; lock(); };
  root.append(card(null, prev),
    card(null, field('Type', segmented([['linear', 'Linear'], ['radial', 'Radial'], ['conic', 'Conic']], kind, (v) => { kind = v; run(); })),
      angleS,
      h('div', { class: 'grid2' }, field('Radial shape', shapeS), field('Centre (radial, conic)', atS)),
      toggle('Repeating', false, (v) => { repeating = v; run(); })),
    card('Colour stops', list, button('Add colour', () => { addStop(); drawStops(); run(); }, { small: true, icon: 'Plus' })),
    card('CSS', code, button('Copy CSS', () => copy(code.textContent || ''), { small: true, icon: 'Copy' })));
  drawStops(); run();
};

// ------------------------------------------------------------------ CSS box shadow
interface Shadow { x: number; y: number; blur: number; spread: number; color: string; alpha: number; inset: boolean }
export function shadowCss(layers: Shadow[]) {
  return layers.map((l) => { const [r, g, b] = hexToRgb(l.color)!; return `${l.inset ? 'inset ' : ''}${l.x}px ${l.y}px ${l.blur}px ${l.spread}px rgba(${r}, ${g}, ${b}, ${+l.alpha.toFixed(2)})`; }).join(', ');
}
export const shadow: Mount = (root) => {
  const layers: Shadow[] = [{ x: 0, y: 4, blur: 12, spread: 0, color: '#000000', alpha: 0.15, inset: false }];
  let sel = 0, radius = 16, boxColor = '#ffffff', pageColor = '#eef0f4';
  const box = h('div', { class: 'shadow-box' }), stage = h('div', { class: 'shadow-stage' }, box), code = h('pre', { class: 'mono out-pre css-out' }), ctl = h('div'), tabs = h('div', { class: 'chips' });
  const run = () => { const c = shadowCss(layers); box.style.boxShadow = c; box.style.borderRadius = `${radius}px`; box.style.background = boxColor; stage.style.background = pageColor; code.textContent = `box-shadow: ${c};\nborder-radius: ${radius}px;`; };
  const draw = () => {
    clear(tabs).append(...layers.map((_, i) => h('button', { type: 'button', class: `chip chip-btn ${i === sel ? 'on' : ''}`, onclick: () => { sel = i; draw(); } }, `Layer ${i + 1}`)));
    const l = layers[sel];
    const sl = (label: string, k: 'x' | 'y' | 'blur' | 'spread', min: number, max: number) => slider({ label, min, max, value: l[k], unit: ' px', onInput: (v) => { l[k] = v; run(); } });
    clear(ctl).append(h('div', { class: 'grid2' }, sl('Horizontal offset', 'x', -100, 100), sl('Vertical offset', 'y', -100, 100), sl('Blur', 'blur', 0, 200), sl('Spread', 'spread', -100, 100)),
      h('div', { class: 'grid2' }, field('Colour', colorInput(l.color, 'Shadow colour', (v) => { l.color = v; run(); })), slider({ label: 'Opacity', min: 0, max: 1, step: 0.01, value: l.alpha, onInput: (v) => { l.alpha = v; run(); } })),
      toggle('Inset (inner shadow)', l.inset, (v) => { l.inset = v; run(); }),
      h('div', { class: 'row' }, button('Add layer', () => { layers.push({ x: 0, y: 1, blur: 3, spread: 0, color: '#000000', alpha: 0.1, inset: false }); sel = layers.length - 1; draw(); run(); }, { small: true, icon: 'Plus' }),
        button('Remove layer', () => { if (layers.length === 1) throw new Error('Keep at least one layer'); layers.splice(sel, 1); sel = Math.max(0, sel - 1); draw(); run(); }, { small: true, icon: 'Trash2' })));
  };
  const preset = (ls: Shadow[]) => { layers.splice(0, layers.length, ...ls); sel = 0; draw(); run(); };
  root.append(card(null, stage), card('Layers', tabs, ctl, h('div', { class: 'chips' },
    h('button', { type: 'button', class: 'chip chip-btn', onclick: () => preset([{ x: 0, y: 1, blur: 2, spread: 0, color: '#000000', alpha: 0.05, inset: false }]) }, 'Subtle'),
    h('button', { type: 'button', class: 'chip chip-btn', onclick: () => preset([{ x: 0, y: 10, blur: 15, spread: -3, color: '#000000', alpha: 0.1, inset: false }, { x: 0, y: 4, blur: 6, spread: -4, color: '#000000', alpha: 0.1, inset: false }]) }, 'Card (2 layers)'),
    h('button', { type: 'button', class: 'chip chip-btn', onclick: () => preset([{ x: 0, y: 25, blur: 50, spread: -12, color: '#000000', alpha: 0.25, inset: false }]) }, 'Floating'),
    h('button', { type: 'button', class: 'chip chip-btn', onclick: () => preset([{ x: 0, y: 2, blur: 4, spread: 0, color: '#000000', alpha: 0.06, inset: true }]) }, 'Inset'))),
  card('Box', slider({ label: 'Corner radius', min: 0, max: 100, value: radius, unit: ' px', onInput: (v) => { radius = v; run(); } }), h('div', { class: 'grid2' }, field('Box colour', colorInput(boxColor, 'Box colour', (v) => { boxColor = v; run(); })), field('Page colour', colorInput(pageColor, 'Page colour', (v) => { pageColor = v; run(); })))),
  card('CSS', code, button('Copy CSS', () => copy(code.textContent || ''), { small: true, icon: 'Copy' })));
  draw(); run();
};

// ------------------------------------------------------------------ SVG optimiser
/** The text of an SVG file as editors save them: gzip (.svgz), UTF-16 with a BOM, or the encoding named in the XML declaration. */
export async function svgText(bytes: Uint8Array): Promise<string> {
  let b = bytes;
  if (b[0] === 0x1f && b[1] === 0x8b) { // .svgz = gzip
    try { b = new Uint8Array(await new Response(new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()); }
    catch { throw new Error('This .svgz file is damaged (it does not unpack)'); }
  }
  if (!b.length) throw new Error('This file is empty');
  if ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) return new TextDecoder(b[0] === 0xff ? 'utf-16le' : 'utf-16be').decode(b).replace(/(<\?xml[^>]*encoding\s*=\s*["'])[\w-]+/i, '$1UTF-8');
  const named = /<\?xml[^>]*encoding\s*=\s*["']([\w-]+)["']/i.exec(new TextDecoder('latin1').decode(b.subarray(0, 200)))?.[1];
  if (named && !/^utf-?8$/i.test(named)) { try { return new TextDecoder(named).decode(b).replace(/(<\?xml[^>]*encoding\s*=\s*["'])[\w-]+/i, '$1UTF-8'); } catch { /* unknown label: read as UTF-8 below */ } }
  return new TextDecoder().decode(b);
}
/** Draw an SVG as the browser renders it (longest side 256 px whatever its own size, on mid grey so both white and black shapes count). null = it does not load as a picture. */
async function rasterSvg(svg: string): Promise<{ data: Uint8ClampedArray; w: number; h: number; nw: number; nh: number } | null> {
  const img = new Image(); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  try { await img.decode(); } catch { return null; }
  const nw = img.naturalWidth || 300, nh = img.naturalHeight || 150, k = 256 / Math.max(nw, nh);
  const w = Math.max(1, Math.round(nw * k)), h2 = Math.max(1, Math.round(nh * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h2; const g = c.getContext('2d', { willReadFrequently: true }); if (!g) return null;
  g.fillStyle = '#808080'; g.fillRect(0, 0, w, h2); g.drawImage(img, 0, 0, w, h2);
  try { return { data: g.getImageData(0, 0, w, h2).data, w, h: h2, nw, nh }; } catch { return null; } // a browser may refuse to read back some SVGs (foreignObject)
}
type Look = 'same' | 'different' | 'unknown';
/** Does `out` look like `src`? Compared in svgo.wasm (sv_diff: edge anti-aliasing ignored). "Different" = more than 0.4 % of the
 *  pixels clearly changed, or a mean change above 0.9 levels — calibrated on 630 real icons (largest: 0.14 %, 0.45) and
 *  the known optimiser faults (smallest: 1.0 %, 1.3). */
async function looksSame(o: Svgo, src: string, out: string): Promise<Look> {
  const [a, b] = await Promise.all([rasterSvg(src), rasterSvg(out)]);
  if (!a) return 'unknown'; // the original itself is not drawable (no xmlns, outside references …)
  if (!b || Math.abs(a.nw - b.nw) > 1 || Math.abs(a.nh - b.nh) > 1 || a.w !== b.w || a.h !== b.h) return 'different';
  const d = o.diff(a.data, b.data, a.w, a.h);
  return d.mean > 0.9 || d.big > 0.004 ? 'different' : 'same';
}
interface SvgFile { name: string; src: string; size: number; out?: string; err?: string; look?: Look; fellBack?: boolean; kept?: boolean }
export const svgoTool: Mount = (root) => {
  let safe = false, pretty = false, turn = 0;
  const list = h('div', { class: 'stack' });
  const files: SvgFile[] = [];
  const render = async () => {
    const mine = ++turn; let o = await svgo();
    const tryOpt = async (f: SvgFile, s: boolean) => {
      try { return o.optimise(f.src, { safe: s, pretty }); }
      catch (e: any) { if (e instanceof WebAssembly.RuntimeError) { resetSvgo(); o = await svgo(); throw new Error('The optimiser could not handle this file (it is too complex)'); } throw e; }
    };
    for (const f of files) {
      f.out = undefined; f.look = undefined; f.fellBack = false; f.kept = false;
      if (!f.src) { f.err ||= 'This file is empty'; continue; }
      try {
        f.out = await tryOpt(f, safe); f.err = undefined; f.look = await looksSame(o, f.src, f.out);
        // the full optimisation changed the picture (it happens with CSS selectors, animations, group opacity …): keep only the safe changes
        if (f.look === 'different' && !safe) { const s2 = await tryOpt(f, true), l2 = await looksSame(o, f.src, s2); if (l2 !== 'different') { f.out = s2; f.look = l2; f.fellBack = true; } }
        // an optimiser must not hand back a bigger file (re-printed CSS can add a character or two): the original stays
        if (!pretty && new Blob([f.out]).size >= new Blob([f.src]).size) { f.out = f.src; f.look = 'same'; f.kept = true; f.fellBack = false; }
      } catch (e: any) { f.out = undefined; f.err = e.message; }
      if (mine !== turn) return; // a newer run took over (a switch was flipped meanwhile)
    }
    const size = (t: string) => new Blob([t]).size, done = files.filter((f) => f.out !== undefined), failed = files.length - done.length;
    const total = done.reduce((a, f) => a + f.size, 0), after = done.reduce((a, f) => a + size(f.out!), 0); // bytes of the files that were optimised
    const pct = (a: number, b: number) => (b <= a ? `−${(100 - (100 * b) / a).toFixed(1)} %` : `+${((100 * b) / a - 100).toFixed(1)} %`);
    clear(list).append(files.length > 1 ? note(`${done.length} of ${files.length} files optimised${done.length ? `: ${fmtBytes(total)} → ${fmtBytes(after)} (${pct(total, after)})` : ''}${failed ? ` · ${failed} could not be read` : ''}`, failed ? 'warn' : 'ok') : '',
      ...files.map((f) => card(f.name, f.err ? note(f.err, 'warn') : [
        kvRows([['Before', `${fmtBytes(f.size)} (${f.size.toLocaleString('en-IN')} bytes)`], ['After', `${fmtBytes(size(f.out!))} (${size(f.out!).toLocaleString('en-IN')} bytes)`], [size(f.out!) > f.size ? 'Larger by' : 'Saved', `${Math.abs(100 - (100 * size(f.out!)) / f.size).toFixed(1)} %`]]),
        f.kept ? note('This file is already as small as the optimiser can make it — it is left as it is.', 'info')
          : f.fellBack ? note('The full optimisation changed how this drawing looks, so only the safe changes were made (checked by rendering both).', 'info')
          : f.look === 'different' ? note('The optimised drawing does not look the same as the original — compare the two pictures before using it.', 'warn')
          : f.look === 'unknown' ? note('The original could not be drawn here (for example no xmlns, or it needs outside files), so the result could not be checked by eye.', 'info')
          : h('div', { class: 'muted svg-check' }, '✓ Rendered and compared: looks the same as the original.'),
        h('div', { class: 'grid2 svg-compare' }, h('figure', null, h('img', { alt: 'original', src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(f.src)}` }), h('figcaption', null, 'Original')), h('figure', null, h('img', { alt: 'optimised', src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(f.out!)}` }), h('figcaption', null, 'Optimised'))),
        h('details', null, h('summary', null, 'Optimised code'), h('pre', { class: 'mono out-pre svg-code' }, f.out!)),
        h('div', { class: 'row' }, button('Download', () => downloadBlob(new Blob([f.out!], { type: 'image/svg+xml' }), f.name.replace(/(\.svgz?)?$/i, '.min.svg')), { small: true, icon: 'Download' }), button('Copy', () => copy(f.out!), { small: true, icon: 'Copy' }))])));
  };
  const paste = h('textarea', { class: 'input textarea mono', rows: 5, placeholder: 'Paste SVG code here', 'aria-label': 'SVG code' }) as HTMLTextAreaElement;
  const read = async (f: File): Promise<SvgFile> => { try { return { name: f.name, size: f.size, src: await svgText(new Uint8Array(await f.arrayBuffer())) }; } catch (e: any) { return { name: f.name, size: f.size, src: '', err: e.message as string }; } };
  root.append(card(null, filePicker({ accept: '.svg,.svgz,image/svg+xml', multiple: true, label: 'Choose SVG files', onFiles: async (fs) => { files.splice(0, files.length, ...(await Promise.all(fs.map(read)))); await render(); } }),
    field('…or paste', paste), button('Optimise pasted SVG', async () => { if (!paste.value.trim()) throw new Error('Paste some SVG first'); files.splice(0, files.length, { name: 'pasted.svg', src: paste.value, size: new Blob([paste.value]).size }); await render(); }, { small: true }),
    h('div', { class: 'row' }, toggle('Safe mode (only changes that cannot alter the picture)', false, (v) => { safe = v; if (files.length) render(); }), toggle('Pretty-print', false, (v) => { pretty = v; if (files.length) render(); }))), list,
  note('Optimised with OXVG (a Rust port of SVGO’s plugins), compiled to WebAssembly and run on this device. Every result is drawn next to the original and compared; if the full optimisation changes the picture, the safe result is used instead.', 'info'));
};
export { svgoTool as svgo };
