// Passport Photo (India first; 36 country presets with background-colour rules). Upload or take a photo; the face is
// found, straightened and framed to the preset's head-height rule; the background is replaced with the required
// colour; outputs: 300 dpi JPEG, a digital-upload JPEG within the portal's px/KB limits, 4×6 in and A4 print sheets.
import { h, card, field, input, segmented, slider, stack, note, actions, button, clear, toast, errMsg, downloadBlob, shareOrDownload, fmtBytes, baseName, type Mount } from '../ui';
import { imgproc, imgprocDirect, type Img } from '../wasm/imgproc';
import { encodeImg, setJpegDpi, previewOf, paint } from '../lib/imgio';
import { imageInput } from '../lib/imgtools';
import { SPECS, CUSTOM_BGS, pxAt, type PhotoSpec, type BgSpec } from '../lib/passport-specs';
import { analyse, layout, buildPhoto, printSheet, type Analysis, type Adjust } from '../lib/passport';
import { personMask } from '../lib/segment';
import { encodeInRange } from './formphoto';

const REGIONS = ['India', 'Americas', 'Europe', 'Asia-Pacific', 'Middle East & Africa'] as const;

export const mount: Mount = (root, ctx) => {
  let spec: PhotoSpec = SPECS[0], bg: BgSpec = spec.bg, custom = { w: 35, h: 45 };
  let src: Img | null = null, an: Analysis | null = null, name = 'photo';
  let prev: { img: Img; scale: number; an: Analysis } | null = null; // background-replaced preview copy
  const adj: Adjust = { zoom: 1, dx: 0, dy: 0 };
  const eff = () => (spec.id === 'custom' ? { ...spec, w: custom.w, h: custom.h, head: [custom.h * 0.62, custom.h * 0.76] as [number, number] } : spec);

  // ---------------- preset + background
  const select = h('select', { class: 'input', 'aria-label': 'Country and document' },
    ...REGIONS.map((r) => h('optgroup', { label: r }, ...SPECS.filter((s) => s.region === r).map((s) => h('option', { value: s.id }, `${s.country} — ${s.doc} (${s.w}×${s.h} mm)`)))),
    h('optgroup', { label: 'Other' }, h('option', { value: 'custom' }, 'Custom size…')));
  const specInfo = h('div');
  const bgRow = h('div', { class: 'row' });
  const customBox = h('div', { class: 'grid2', hidden: true },
    field('Width (mm)', input({ type: 'number', value: custom.w, min: 10, onInput: (v) => { custom.w = +v || 35; refresh(); } })),
    field('Height (mm)', input({ type: 'number', value: custom.h, min: 10, onInput: (v) => { custom.h = +v || 45; refresh(); } })));
  const renderSpec = () => {
    const s = eff(), choices = spec.id === 'custom' ? CUSTOM_BGS : [spec.bg, ...(spec.bgAlt || [])];
    if (!choices.some((c) => c.hex === bg.hex)) bg = choices[0];
    clear(bgRow).append(...choices.map((c) => h('button', { type: 'button', class: ['bg-chip', c.hex === bg.hex && 'on'], 'aria-pressed': String(c.hex === bg.hex), onclick: () => { bg = c; renderSpec(); refresh(true); } }, h('span', { class: 'bg-dot', style: { background: c.hex } }), c.name)));
    const d = spec.digital;
    clear(specInfo).append(h('div', { class: 'stack' }, h('dl', { class: 'kv' },
      h('dt', null, 'Print size'), h('dd', null, `${s.w} × ${s.h} mm (${pxAt(s.w)} × ${pxAt(s.h)} px at 300 dpi)`),
      h('dt', null, 'Head (chin to crown)'), h('dd', null, s.head ? `${s.head[0]}–${s.head[1]} mm` : 'not specified — about 70% of the height'),
      h('dt', null, 'Background'), h('dd', null, `${spec.bg.name}${spec.bgAlt?.length ? ` (also: ${spec.bgAlt.map((b) => b.name).join(', ')})` : ''} — ${spec.bg.rule}`),
      d ? h('dt', null, 'Online upload') : null,
      d ? h('dd', null, [d.exactPx && `${d.exactPx[0]}×${d.exactPx[1]} px`, d.minPx && `min ${d.minPx[0]}×${d.minPx[1]} px`, d.maxPx && `max ${d.maxPx[0]}×${d.maxPx[1]} px`, d.square && 'square', (d.minKB || d.maxKB) && `${d.minKB ?? 0}–${d.maxKB ?? '∞'} KB`].filter(Boolean).join(', ')) : null),
      spec.notes ? note(spec.notes) : null));
    customBox.hidden = spec.id !== 'custom';
  };
  select.addEventListener('change', () => { spec = SPECS.find((s) => s.id === select.value) || { ...SPECS[0], id: 'custom', country: 'Custom', doc: 'Custom size', w: custom.w, h: custom.h, bg: CUSTOM_BGS[0], bgAlt: [], digital: undefined, notes: undefined }; bg = spec.bg; renderSpec(); refresh(true); });

  // ---------------- photo in (upload or camera)
  const out = h('canvas', { class: 'ed-canvas pp-out' });
  const checks = h('ul', { class: 'checks' });
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const editor = h('div', { class: 'stack', hidden: true });
  const useImage = async (img: Img, fname: string) => {
    src = img; name = baseName(fname); an = null; prev = null; editor.hidden = false; clear(checks);
    status.textContent = 'Finding your face… (first run loads the face and background models)';
    try {
      an = await analyse(img);
      status.textContent = '';
      await refresh(true);
    } catch (e) { status.textContent = errMsg(e); toast(errMsg(e), 'err'); }
  };
  const input$ = imageInput((img, f) => useImage(img, f.name), { label: 'Upload a photo', capture: ctx.isMobile ? 'user' : undefined });

  // live camera with an oval guide and a 3-second timer
  const video = h('video', { class: 'pp-video', autoplay: true, muted: true, playsInline: true } as any) as HTMLVideoElement;
  const count = h('div', { class: 'pp-count' });
  const camBox = h('div', { class: 'pp-cam', hidden: true }, video, h('div', { class: 'pp-oval' }), count);
  let stream: MediaStream | null = null, facing: 'user' | 'environment' = 'user';
  const stopCam = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; camBox.hidden = true; camCtl.hidden = true; };
  const startCam = async () => {
    stopCam();
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false }); }
    catch (e) { toast(`Camera unavailable: ${errMsg(e)}`, 'err'); return; }
    video.srcObject = stream; camBox.hidden = false; camCtl.hidden = false;
  };
  const snap = async () => {
    for (let i = 3; i > 0; i--) { count.textContent = String(i); await new Promise((r) => setTimeout(r, 1000)); }
    count.textContent = '';
    const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    if (facing === 'user') { g.translate(c.width, 0); g.scale(-1, 1); } // un-mirror the selfie view
    g.drawImage(video, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    stopCam();
    await useImage({ data: d.data, width: d.width, height: d.height }, 'camera.jpg');
  };
  const camCtl = h('div', { class: 'row', hidden: true },
    button('Take photo (3 s timer)', snap, { variant: 'primary', icon: 'Camera' }),
    button('Switch camera', () => { facing = facing === 'user' ? 'environment' : 'user'; startCam(); }, { icon: 'SwitchCamera' }),
    button('Cancel', stopCam, { variant: 'ghost' }));

  // ---------------- preview + adjust
  const refresh = async (rebuild = false) => {
    if (!src || !an) return;
    const s = eff();
    if (rebuild || !prev) {
      const ip = await imgprocDirect();
      const small = previewOf(src, 900), scale = small.width / src.width;
      const pm = await personMask(small);
      const alpha = ip.guidedAlpha(small, pm.mask, pm.w, pm.h, 4, 1e-4);
      const n = parseInt(bg.hex.slice(1), 16);
      const sc = (p: [number, number]): [number, number] => [p[0] * scale, p[1] * scale];
      prev = { img: ip.composite(small, alpha, n, 0, false), scale, an: { ...an, w: small.width, h: small.height, eyeL: sc(an.eyeL), eyeR: sc(an.eyeR), chin: sc(an.chin), crown: sc(an.crown) } };
    }
    const ip = await imgprocDirect();
    const L = layout(prev.an, s, adj), k = 0.6; // preview at 60 % of print pixels
    const rgb: [number, number, number] = [parseInt(bg.hex.slice(1, 3), 16), parseInt(bg.hex.slice(3, 5), 16), parseInt(bg.hex.slice(5, 7), 16)];
    paint(ip.warpFill(prev.img, L.quad, Math.round(L.outW * k), Math.round(L.outH * k), rgb), out);
    const okHead = !s.head || (L.headMm >= s.head[0] && L.headMm <= s.head[1]);
    clear(checks).append(...[
      h('li', { class: 'ok' }, `✓ ${s.w} × ${s.h} mm · ${L.outW} × ${L.outH} px at 300 dpi`),
      h('li', { class: okHead ? 'ok' : 'bad' }, `${okHead ? '✓' : '✗'} head height ${L.headMm.toFixed(1)} mm${s.head ? ` (allowed ${s.head[0]}–${s.head[1]})` : ''}`),
      ((okE) => h('li', { class: okE ? 'ok' : 'bad' }, `${okE ? '✓' : '✗'} eyes ${L.eyesFromBottomMm.toFixed(1)} mm from the bottom${s.eyes ? ` (allowed ${s.eyes[0]}–${s.eyes[1]})` : ''}`))(!s.eyes || (L.eyesFromBottomMm >= s.eyes[0] && L.eyesFromBottomMm <= s.eyes[1])),
      h('li', { class: 'ok' }, `✓ background: ${bg.name} (${bg.hex})`),
      h('li', { class: Math.abs(an.roll) < 0.26 ? 'ok' : 'bad' }, `${Math.abs(an.roll) < 0.26 ? '✓' : '!'} head tilt corrected (${((an.roll * 180) / Math.PI).toFixed(1)}°)`),
      L.fits ? null : h('li', { class: 'bad' }, '! the photo is cut off at an edge — use a photo with more space around the head'),
      an.crownFromMask ? null : h('li', { class: 'bad' }, '! top of the head estimated — check the head size')].filter((x): x is HTMLLIElement => !!x));
  };
  const sl = (label: string, min: number, max: number, step: number, key: keyof Adjust, unit: string) => slider({ label, min, max, step, value: adj[key], unit, onInput: (v) => { adj[key] = v; refresh(); } });

  // ---------------- outputs
  const make = async () => { if (!src || !an) throw new Error('Add a photo first.'); status.textContent = 'Making the full-resolution photo…'; const img = await buildPhoto(src, an, eff(), bg.hex, adj); status.textContent = ''; return img; };
  const save = async (blob: Blob, fname: string) => { status.textContent = `${fname} · ${fmtBytes(blob.size)}`; ctx.isMobile ? await shareOrDownload(blob, fname) : downloadBlob(blob, fname); };
  const tag = () => `${name}-${spec.id === 'custom' ? `${custom.w}x${custom.h}mm` : spec.id}`;
  const savePrint = async () => save(await setJpegDpi(await encodeImg(await make(), 'jpeg', 92), 300), `${tag()}.jpg`);
  const saveDigital = async () => {
    const d = spec.digital || {};
    let img = await make();
    let W = img.width, H = img.height;
    if (d.exactPx) [W, H] = d.exactPx;
    else {
      const up = Math.max(d.minPx ? Math.max(d.minPx[0] / W, d.minPx[1] / H) : 1, 1), down = d.maxPx ? Math.min(d.maxPx[0] / W, d.maxPx[1] / H, 1) : 1;
      const f = up > 1 ? up : down; W = Math.round(W * f); H = Math.round(H * f);
      if (d.square) W = H = Math.max(W, H);
    }
    if (W !== img.width || H !== img.height) img = await imgproc('resize', img, W, H);
    const r = await encodeInRange(img, d.minKB ?? 0, d.maxKB ?? 2048, 300);
    await save(r.blob, `${tag()}-upload.jpg`);
  };
  const saveSheet = async (paper: '4x6' | 'a4') => {
    const sheet = printSheet(await make(), paper) as Img & { copies: number };
    await save(await setJpegDpi(await encodeImg(sheet, 'jpeg', 92), 300), `${tag()}-sheet-${paper}.jpg`);
    toast(`${sheet.copies} copies on the ${paper === '4x6' ? '4×6 inch' : 'A4'} sheet`, 'ok');
  };

  editor.append(
    card(null, h('div', { class: 'pp-stage' }, out), status, checks),
    card('Fine-tune', stack(sl('Head size', 0.85, 1.15, 0.01, 'zoom', '×'), sl('Move up / down', -6, 6, 0.25, 'dy', ' mm'), sl('Move left / right', -6, 6, 0.25, 'dx', ' mm'),
      button('Reset', () => { adj.zoom = 1; adj.dx = adj.dy = 0; editor.querySelectorAll('.slider').forEach((s: any) => s.reset?.()); refresh(); }, { small: true, variant: 'ghost', icon: 'RotateCcw' }))),
    actions(button(ctx.isMobile ? 'Photo' : 'Download photo (300 dpi)', savePrint, { variant: 'primary', icon: 'Download', title: 'Print-quality JPEG at 300 dpi' }),
      button(ctx.isMobile ? 'Upload copy' : 'Download for online upload', saveDigital, { icon: 'CloudUpload', title: 'Within the online form\'s pixel and KB limits' })),
    card('Print sheet', h('div', { class: 'row' }, button('4×6 inch sheet', () => saveSheet('4x6'), { icon: 'Printer' }), button('A4 sheet', () => saveSheet('a4'), { icon: 'Printer' })),
      note('Print at 100 % / "actual size" (not "fit to page"), then cut along the grey lines.')),
    note('Some agencies reject digitally edited photos and most require recent photos in even light, eyes open, no glasses glare. Always check the official rules before you submit.', 'warn'),
  );
  root.append(
    card('Photo type', stack(field('Country / document', select), customBox, h('div', null, h('div', { class: 'field-label' }, 'Background colour'), bgRow), specInfo)),
    card(null, stack(input$.el, h('div', { class: 'row' }, button('Use camera', startCam, { icon: 'Camera' })), camBox, camCtl)),
    editor,
  );
  renderSpec();
  return () => { stopCam(); input$.dispose(); };
};
