// Image to SVG (potentials #1: "trace a logo, signature or scan into vectors"). Colour — VTracer 0.6.5 (our build, vtracer.wasm): a logo,
// a drawing, a poster or pixel art as stacked shapes of flat colour; black and white — Potrace 1.16 (esm-potrace-wasm, the engine of
// SVGcode): a signature, a scan, line art, as smooth curves in one colour, the paper see-through. Both in src/workers/vector.worker.ts;
// the settings re-trace as they change. SVG (its own name), PNG at a size, the code copied.
import { h, card, button, toggle, segmented, slider, note, copy, downloadBlob, toast, errMsg, actions, field, select, type Mount } from '../ui';
import { imageInput } from '../lib/imgtools';
import { paint } from '../lib/imgio';
import { traceColor, traceBw } from '../lib/vector-client';
import type { Img } from '../wasm/imgproc';
import type { VtOptions } from '../wasm/vtracer';
import './tosvg.css';

type Mode = 'color' | 'bw';
type Preset = 'logo' | 'drawing' | 'photo' | 'pixel';
const PRESETS: Record<Preset, VtOptions & { label: string }> = {
  logo: { label: 'Logo', colorPrecision: 6, layerDifference: 16, filterSpeckle: 4, mode: 'spline', cornerThreshold: 60 },
  drawing: { label: 'Drawing', colorPrecision: 7, layerDifference: 10, filterSpeckle: 6, mode: 'spline', cornerThreshold: 60 },
  photo: { label: 'Photo as a poster', colorPrecision: 8, layerDifference: 6, filterSpeckle: 10, mode: 'spline', cornerThreshold: 75 },
  pixel: { label: 'Pixel art', colorPrecision: 8, layerDifference: 1, filterSpeckle: 0, mode: 'pixel', cornerThreshold: 60 },
};
const COLOR_MAX = 1600, BW_MAX = 3000; // the long side traced, px
/** kept while the page is open (nothing is stored) */
const kept = { mode: 'color' as Mode, preset: 'logo' as Preset, vt: { ...PRESETS.logo } as VtOptions, cutout: false,
  bw: { threshold: -1, invert: false, paper: false, turdsize: 2, alphamax: 1, opticurve: true, opttolerance: 0.2 }, ink: '#000000' };

export const mount: Mount = (root, ctx) => {
  /** the picture chosen, and its copy at each kind's size (colour ≤ 1,600 px, black and white ≤ 3,000 px) */
  let orig: Img | null = null, sized: Partial<Record<Mode, Img>> = {}, name = 'picture', svg = '', seq = 0, timer = 0, gone = false;
  const status = h('div', { class: 'muted small ts-status', 'aria-live': 'polite' });
  const origCanvas = h('canvas', { class: 'ts-orig', 'aria-label': 'The picture' }) as HTMLCanvasElement;
  const out = h('div', { class: 'ts-out', role: 'img', 'aria-label': 'The SVG' });
  const stats = h('div', { class: 'muted small ts-stats' });

  const input = imageInput(async (img, file) => {
    name = file.name.replace(/\.[^.]+$/, '') || 'picture';
    orig = img; sized = {};
    paint(img, origCanvas);
    result.hidden = false;
    schedule(0);
  }, { paste: true });
  /** the picture at the size the kind traces */
  const picFor = async (mode: Mode): Promise<Img> => {
    const img = orig!, s = Math.min(1, (mode === 'color' ? COLOR_MAX : BW_MAX) / Math.max(img.width, img.height));
    if (s >= 1) return img;
    if (!sized[mode]) {
      const { imgproc } = await import('../wasm/imgproc');
      sized[mode] = await imgproc('resize', img, Math.max(1, Math.round(img.width * s)), Math.max(1, Math.round(img.height * s)));
    }
    return sized[mode]!;
  };

  // ---------------------------------------------------------------- tracing (the newest settings win)
  // a change makes the tracing in progress stale at once: its result must not be shown (or saved) in the moment before the new
  // one starts (found by the Windows check: under load an older tracing landed after a switch was changed)
  const schedule = (ms = 250) => { clearTimeout(timer); seq++; timer = window.setTimeout(() => void run(), ms); };
  const run = async () => {
    if (!orig) return;
    const my = ++seq, t0 = performance.now(), mode = kept.mode, from = orig;
    const src = await picFor(mode);
    if (my !== seq || gone || from !== orig) return;
    status.textContent = kept.mode === 'color' ? 'Tracing the colours…' : 'Tracing…';
    try {
      let text: string, extra = '';
      if (mode === 'color') text = await traceColor(src, { ...kept.vt, cutout: kept.cutout });
      else {
        const r = await traceBw(src, kept.bw);
        text = inkColor(r.svg, kept.ink);
        if (!kept.bw.paper) extra = ` · threshold ${r.threshold}${kept.bw.threshold < 0 ? ' (found by Otsu’s method)' : ''}`;
      }
      if (my !== seq || gone) return;
      svg = text;
      out.innerHTML = '';
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const im = h('img', { src: url, alt: 'The traced picture', class: 'ts-svg' }) as HTMLImageElement;
      im.onload = () => URL.revokeObjectURL(url);
      out.append(im);
      const paths = (svg.match(/<path\b/g) || []).length;
      stats.textContent = `${paths.toLocaleString('en-IN')} shape${paths === 1 ? '' : 's'} · ${fmtKB(new Blob([svg]).size)} · ${src.width} × ${src.height}${extra}`;
      status.textContent = `Traced in ${((performance.now() - t0) / 1000).toFixed(1)} s.`;
    } catch (e) {
      if (my === seq && !gone) status.textContent = `The picture could not be traced — ${errMsg(e)}`;
    }
  };
  const fmtKB = (n: number) => n < 1024 ? `${n} bytes` : `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  /** Potrace's black in the ink colour chosen */
  const inkColor = (text: string, ink: string) => text.replace(/fill="(#000000|black|#000)"/gi, `fill="${ink}"`);

  // ---------------------------------------------------------------- settings
  const modeSeg = segmented<Mode>([['color', 'Colour'], ['bw', 'Black and white']], kept.mode, (v) => {
    kept.mode = v; colorBox.hidden = v !== 'color'; bwBox.hidden = v !== 'bw'; hint.textContent = HINTS[v]; schedule(0);
  });
  const HINTS: Record<Mode, string> = {
    color: 'Logos, drawings, icons, posters: each colour a shape (VTracer).',
    bw: 'Signatures, scans, line art and text: smooth curves in one colour, the paper see-through (Potrace).',
  };
  const hint = h('p', { class: 'muted small' }, HINTS[kept.mode]);

  const precision = slider({ label: 'Colour detail', min: 1, max: 8, step: 1, value: kept.vt.colorPrecision ?? 6, onChange: (v) => { kept.vt.colorPrecision = v; schedule(); } });
  const gradient = slider({ label: 'Gradient steps', min: 0, max: 64, step: 1, value: kept.vt.layerDifference ?? 16, onChange: (v) => { kept.vt.layerDifference = v; schedule(); } });
  const speck = slider({ label: 'Leave out specks smaller than', min: 0, max: 64, step: 1, value: kept.vt.filterSpeckle ?? 4, unit: ' px', onChange: (v) => { kept.vt.filterSpeckle = v; schedule(); } });
  const corner = slider({ label: 'Corners at turns sharper than', min: 0, max: 180, step: 5, value: kept.vt.cornerThreshold ?? 60, unit: '°', onChange: (v) => { kept.vt.cornerThreshold = v; schedule(); } });
  const curve = segmented<'spline' | 'polygon' | 'pixel'>([['spline', 'Curves'], ['polygon', 'Straight lines'], ['pixel', 'Pixels']], kept.vt.mode ?? 'spline', (v) => { kept.vt.mode = v; schedule(); });
  const presetSeg = segmented<Preset>((Object.keys(PRESETS) as Preset[]).map((k) => [k, PRESETS[k].label]), kept.preset, (v) => {
    kept.preset = v; const p = PRESETS[v];
    kept.vt = { ...p };
    precision.value = p.colorPrecision!; gradient.value = p.layerDifference!; speck.value = p.filterSpeckle!; corner.value = p.cornerThreshold!; curve.value = p.mode!;
    schedule(0);
  });
  const colorBox = h('div', { class: 'stack' }, field('Kind of picture', presetSeg), precision, gradient, speck, field('Edges', curve), corner,
    toggle('Cut the shapes out of one another (no shape under another)', kept.cutout, (v) => { kept.cutout = v; schedule(); }));

  const thr = slider({ label: 'Threshold', min: 1, max: 254, step: 1, value: kept.bw.threshold < 0 ? 128 : kept.bw.threshold, onChange: (v) => { kept.bw.threshold = v; autoT.checked = false; schedule(); } });
  const autoT = toggle('Threshold found by itself (Otsu’s method)', kept.bw.threshold < 0, (v) => { kept.bw.threshold = v ? -1 : thr.value; schedule(); });
  const paperT = toggle('A photo of paper (a signature, a page): find the ink however the light falls', kept.bw.paper, (v) => { kept.bw.paper = v; thrBox.hidden = v; schedule(); });
  const thrBox = h('div', { class: 'stack' }, autoT, thr);
  thrBox.hidden = kept.bw.paper;
  const inkIn = h('input', { type: 'color', value: kept.ink, class: 'ts-ink', 'aria-label': 'Ink colour' }) as HTMLInputElement;
  inkIn.addEventListener('input', () => { kept.ink = inkIn.value; schedule(0); });
  const bwBox = h('div', { class: 'stack' }, paperT, thrBox,
    toggle('Light lines on a dark ground (invert)', kept.bw.invert, (v) => { kept.bw.invert = v; schedule(); }),
    slider({ label: 'Leave out specks smaller than', min: 0, max: 100, step: 1, value: kept.bw.turdsize, unit: ' px', onChange: (v) => { kept.bw.turdsize = v; schedule(); } }),
    slider({ label: 'Smoothness', min: 0, max: 1.33, step: 0.01, value: kept.bw.alphamax, onChange: (v) => { kept.bw.alphamax = v; schedule(); } }),
    toggle('Join curves where they can be one (smaller file)', kept.bw.opticurve, (v) => { kept.bw.opticurve = v; schedule(); }),
    h('label', { class: 'ts-inkrow' }, h('span', null, 'Ink colour'), inkIn));
  colorBox.hidden = kept.mode !== 'color'; bwBox.hidden = kept.mode !== 'bw';

  // ---------------------------------------------------------------- the result
  const pngSize = select<'1' | '2' | '4' | '2048'>([['1', 'As the picture'], ['2', 'Twice as large'], ['4', 'Four times as large'], ['2048', '2,048 px wide']], '2', undefined, 'PNG size');
  const need = () => { if (!svg) throw new Error('Choose a picture first.'); };
  const saveSvg = () => { need(); downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`); };
  const savePng = async () => {
    need();
    const im = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      im.src = url; await im.decode();
      const w0 = im.naturalWidth || orig!.width, h0 = im.naturalHeight || orig!.height, v = pngSize.value;
      const s = v === '2048' ? 2048 / w0 : +v, w = Math.max(1, Math.round(w0 * s)), hh = Math.max(1, Math.round(h0 * s));
      if (w * hh > 100e6) throw new Error('That is larger than a browser can draw — choose a smaller size.');
      const c = h('canvas', { width: w, height: hh }) as HTMLCanvasElement;
      c.getContext('2d')!.drawImage(im, 0, 0, w, hh);
      const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('The PNG could not be made.'))), 'image/png'));
      downloadBlob(blob, `${name}.png`);
    } finally { URL.revokeObjectURL(url); }
  };
  const run2 = (f: () => unknown) => async () => { try { await f(); } catch (e) { toast(errMsg(e), 'err'); } };
  const result = card('The SVG',
    h('div', { class: 'ts-pair' }, h('figure', null, origCanvas, h('figcaption', { class: 'muted small' }, 'The picture')), h('figure', null, out, h('figcaption', { class: 'muted small' }, 'The SVG'))),
    stats, status,
    h('div', { class: 'row ts-acts' },
      button('Download SVG', run2(saveSvg), { variant: 'primary', icon: 'Download' }),
      button('Copy SVG code', run2(() => { need(); return copy(svg); }), { icon: 'Copy' }),
      h('span', { class: 'ts-png' }, pngSize, button('Save PNG', run2(savePng), { icon: 'Image' }))));
  result.hidden = true;

  root.append(
    card(null, input.el),
    card('Tracing', field('Kind', modeSeg), hint, colorBox, bwBox),
    result,
    note('Everything happens on this device: the picture never leaves it. An SVG scales to any size without blurring — for a print, a cutter or a website.', 'info'),
    ...(ctx.isMobile ? [actions(button('Download SVG', run2(saveSvg), { variant: 'primary', icon: 'Download' }))] : []),
  );
  return () => { gone = true; clearTimeout(timer); input.dispose(); };
};
