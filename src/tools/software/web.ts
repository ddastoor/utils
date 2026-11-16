// Software › web design tabs: WCAG contrast (mathcore.wasm), CSS gradient and box-shadow builders (CSS text glue),
// SVG optimiser (our Rust svgo.wasm = OXVG).
import { h, card, field, input, select, segmented, toggle, slider, clear, note, copy, button, filePicker, fmtBytes, downloadBlob, type Mount } from '../../ui';
import { mathcore } from '../../wasm/mathcore';
import { svgo } from '../../wasm/svgo';
import { colorFns } from '../text';
import { kvRows } from './devui';

const { hexToRgb, rgbToHex } = colorFns;
const colorInput = (value: string, label: string, onChange: (hex: string) => void) => {
  const pick = h('input', { type: 'color', class: 'color-picker sm', value, 'aria-label': `${label} picker` });
  const txt = input({ value, attrs: { class: 'input mono', 'aria-label': label } });
  pick.addEventListener('input', () => { txt.value = pick.value; txt.classList.remove('bad'); onChange(pick.value); });
  txt.addEventListener('input', () => { const v = hexToRgb(txt.value); txt.classList.toggle('bad', !v); if (v) { pick.value = rgbToHex(v[0], v[1], v[2]); onChange(pick.value); } });
  const el = h('div', { class: 'row color-in' }, pick, txt);
  return Object.assign(el, { set(v: string) { pick.value = v; txt.value = v; } });
};

// ------------------------------------------------------------------ WCAG contrast checker
export const contrast: Mount = async (root) => {
  const mc = await mathcore();
  let fg = '#1f2937', bg = '#ffffff';
  const fgI = colorInput(fg, 'Text colour', (v) => { fg = v; run(); }), bgI = colorInput(bg, 'Background colour', (v) => { bg = v; run(); });
  const big = h('div', { class: 'big-value center contrast-ratio' }), table = h('div'), preview = h('div', { class: 'contrast-preview' }), fix = h('div');
  /** Darken or lighten `c` (OKLCH lightness, hue kept) until it reaches `target` against `other`. */
  const nearest = (c: string, other: string, target: number) => {
    const [L, C, H] = mc.rgbToOklch(...(hexToRgb(c) as [number, number, number])), o = hexToRgb(other)!;
    let best: string | null = null;
    for (let d = 1; d <= 100 && !best; d++) for (const s of [-1, 1]) { const l2 = L + s * d; if (l2 < 0 || l2 > 100) continue; const rgb = mc.oklchToRgb(l2, C, H).map((x) => Math.min(255, Math.max(0, Math.round(x)))); if (mc.contrast(rgb, o) >= target) { best = rgbToHex(rgb[0], rgb[1], rgb[2]); break; } }
    return best;
  };
  const run = () => {
    const a = hexToRgb(fg)!, b = hexToRgb(bg)!, r = mc.contrast(a, b), shown = Math.floor(r * 100) / 100; // WCAG: do not round up to pass
    big.textContent = `${shown.toFixed(2)} : 1`;
    const pass = (t: number) => (r >= t ? h('span', { class: 'ok-text' }, '✓ Pass') : h('span', { class: 'err-text' }, '✗ Fail'));
    clear(table).append(h('table', { class: 'tbl' }, h('tbody', null,
      h('tr', null, h('th', null, 'Normal text — AA (4.5 : 1)'), h('td', null, pass(4.5))), h('tr', null, h('th', null, 'Normal text — AAA (7 : 1)'), h('td', null, pass(7))),
      h('tr', null, h('th', null, 'Large text (≥ 24 px, or 19 px bold) — AA (3 : 1)'), h('td', null, pass(3))), h('tr', null, h('th', null, 'Large text — AAA (4.5 : 1)'), h('td', null, pass(4.5))),
      h('tr', null, h('th', null, 'Icons, borders, UI parts — AA (3 : 1)'), h('td', null, pass(3))))));
    Object.assign(preview.style, { color: fg, background: bg });
    clear(fix);
    if (r < 4.5) { const f = nearest(fg, bg, 4.5), g = nearest(bg, fg, 4.5); fix.append(note(h('span', null, 'To reach AA 4.5 : 1 keep the hue and ', f ? h('button', { type: 'button', class: 'link-btn mono', onclick: () => { fg = f; fgI.set(f); run(); } }, `use text ${f}`) : 'change the text colour', g ? [' or ', h('button', { type: 'button', class: 'link-btn mono', onclick: () => { bg = g; bgI.set(g); run(); } }, `background ${g}`)] : ''), 'info')); }
  };
  preview.append(h('p', { class: 'cp-large' }, 'Large heading text'), h('p', null, 'Body text: the quick brown fox jumps over the lazy dog. ₹1,234.56'), h('p', { class: 'cp-small' }, 'Small print, 13 px'));
  root.append(card(null, h('div', { class: 'grid2' }, field('Text', fgI), field('Background', bgI)), button('Swap', () => { [fg, bg] = [bg, fg]; fgI.set(fg); bgI.set(bg); run(); }, { small: true, icon: 'ArrowLeftRight' })),
    card('Contrast ratio', big, table, fix), card('Preview', preview), note('WCAG 2.2 relative-luminance contrast. The ratio is truncated, never rounded up, so a shown pass is a real pass.', 'info'));
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
  const drawStops = () => clear(list).append(...stops.map((s, i) => h('div', { class: 'row stop-row' }, colorInput(s.color, `Stop ${i + 1} colour`, (v) => { s.color = v; run(); }),
    input({ type: 'number', value: s.pos, min: 0, max: 100, attrs: { 'aria-label': `Stop ${i + 1} position`, class: 'input num-sm' }, onInput: (v) => { s.pos = Math.max(0, Math.min(100, +v || 0)); run(); } }), h('span', { class: 'muted' }, '%'),
    button('', () => { if (stops.length <= 2) throw new Error('A gradient needs at least two colours'); stops.splice(i, 1); drawStops(); run(); }, { small: true, icon: 'X', title: `Remove stop ${i + 1}` }))));
  const run = () => { const c = css(); prev.style.background = c; code.textContent = `background: ${c};`; };
  root.append(card(null, prev),
    card(null, field('Type', segmented([['linear', 'Linear'], ['radial', 'Radial'], ['conic', 'Conic']], kind, (v) => { kind = v; run(); })),
      slider({ label: 'Angle', min: 0, max: 360, value: angle, unit: '°', onInput: (v) => { angle = v; run(); } }),
      h('div', { class: 'grid2' }, field('Radial shape', select([['circle', 'circle'], ['ellipse', 'ellipse']], shape, (v) => { shape = v; run(); })), field('Centre', select([['center', 'center'], ['top', 'top'], ['bottom', 'bottom'], ['left', 'left'], ['right', 'right'], ['top left', 'top left']], at, (v) => { at = v; run(); }))),
      toggle('Repeating', false, (v) => { repeating = v; run(); })),
    card('Colour stops', list, button('Add colour', () => { stops.push({ color: '#4f46e5', pos: 100 }); drawStops(); run(); }, { small: true, icon: 'Plus' })),
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
export const svgoTool: Mount = (root) => {
  let safe = false, pretty = false;
  const list = h('div', { class: 'stack' });
  const files: Array<{ name: string; src: string; out?: string; err?: string }> = [];
  const render = async () => {
    const o = await svgo();
    for (const f of files) { try { f.out = o.optimise(f.src, { safe, pretty }); f.err = undefined; } catch (e: any) { f.out = undefined; f.err = e.message; } }
    const total = files.reduce((a, f) => a + f.src.length, 0), after = files.reduce((a, f) => a + (f.out?.length ?? f.src.length), 0);
    clear(list).append(files.length > 1 ? note(`${files.length} files: ${fmtBytes(total)} → ${fmtBytes(after)} (−${(100 - (100 * after) / total).toFixed(1)} %)`, 'ok') : '',
      ...files.map((f) => card(f.name, f.err ? note(f.err, 'warn') : [
        kvRows([['Before', `${fmtBytes(new Blob([f.src]).size)} (${new Blob([f.src]).size.toLocaleString('en-IN')} bytes)`], ['After', `${fmtBytes(new Blob([f.out!]).size)} (${new Blob([f.out!]).size.toLocaleString('en-IN')} bytes)`], ['Saved', `${(100 - (100 * new Blob([f.out!]).size) / new Blob([f.src]).size).toFixed(1)} %`]]),
        h('div', { class: 'grid2 svg-compare' }, h('figure', null, h('img', { alt: 'original', src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(f.src)}` }), h('figcaption', null, 'Original')), h('figure', null, h('img', { alt: 'optimised', src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(f.out!)}` }), h('figcaption', null, 'Optimised'))),
        h('details', null, h('summary', null, 'Optimised code'), h('pre', { class: 'mono out-pre svg-code' }, f.out!)),
        h('div', { class: 'row' }, button('Download', () => downloadBlob(new Blob([f.out!], { type: 'image/svg+xml' }), f.name.replace(/(\.svg)?$/i, '.min.svg')), { small: true, icon: 'Download' }), button('Copy', () => copy(f.out!), { small: true, icon: 'Copy' }))])));
  };
  const paste = h('textarea', { class: 'input textarea mono', rows: 5, placeholder: 'Paste SVG code here', 'aria-label': 'SVG code' }) as HTMLTextAreaElement;
  root.append(card(null, filePicker({ accept: '.svg,image/svg+xml', multiple: true, label: 'Choose SVG files', onFiles: async (fs) => { files.splice(0, files.length, ...(await Promise.all(fs.map(async (f) => ({ name: f.name, src: await f.text() }))))); await render(); } }),
    field('…or paste', paste), button('Optimise pasted SVG', async () => { if (!paste.value.trim()) throw new Error('Paste some SVG first'); files.splice(0, files.length, { name: 'pasted.svg', src: paste.value }); await render(); }, { small: true }),
    h('div', { class: 'row' }, toggle('Safe mode (fewer changes)', false, (v) => { safe = v; if (files.length) render(); }), toggle('Pretty-print', false, (v) => { pretty = v; if (files.length) render(); }))), list,
  note('Optimised with OXVG (a Rust port of SVGO’s default plugins), compiled to WebAssembly and run on this device. Check the side-by-side preview; use Safe mode if something looks different.', 'info'));
};
export { svgoTool as svgo };
