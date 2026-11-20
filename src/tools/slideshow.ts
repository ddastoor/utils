// Slideshow Maker: photos + optional music → MP4. Frames are composed on a canvas (crossfades, gentle zoom, blurred
// background for "fit"), encoded by the browser's WebCodecs encoder (H.264, or VP9/AV1 if H.264 is missing) and
// muxed by mediabunny; music is looped/trimmed and faded with our audio.wasm, encoded as AAC (where the browser has no
// AAC encoder — Chromium on Linux, Firefox — by mediabunny's WebAssembly AAC encoder, src/lib/aac.ts; it was Opus inside
// the MP4). Photos are decoded by our loader (HEIC, EXIF orientation, huge photos). A video is made from a copy of the
// settings and the photo list taken when it starts: changes meanwhile wait for the next one.
import { h, card, field, actions, button, select, slider, segmented, toggle, stack, note, progress, filePicker, toast, errMsg, fmtTime, fmtBytes, baseName, downloadBlob, shareOrDownload, clear, type Mount } from '../ui';
import { loadImg, previewOf } from '../lib/imgio';
import { audio, decodeAudio, channelsOf } from '../lib/audio-client';
import { ensureAac } from '../lib/aac';

type Aspect = '16:9' | '9:16' | '1:1' | '4:5';
const ASPECTS: Array<[Aspect, string]> = [['16:9', 'Landscape 16:9'], ['9:16', 'Reels / Stories 9:16'], ['1:1', 'Square 1:1'], ['4:5', 'Portrait 4:5']];
const FPS = 30;
interface Photo { name: string; bmp: ImageBitmap; tiny: ImageBitmap; w: number; h: number }
/** what a frame is drawn from: the live settings for the preview, a copy of them for a video being made */
interface Plan { photos: Photo[]; per: number; total: number; fit: 'fill' | 'fit'; zoom: boolean; fade: boolean }

export const mount: Mount = (root, ctx) => {
  const photos: Photo[] = [];
  let music: { name: string; buf: AudioBuffer } | null = null;
  let secs = 3, fade = true, zoom = true, aspect: Aspect = ctx.isMobile ? '9:16' : '16:9', res = 1080, fit: 'fill' | 'fit' = 'fill', matchMusic = false, busy = false, cancel = false;
  let outBlob: Blob | null = null, outUrl = '', playing = 0, ac: AudioContext | null = null, musicSeq = 0, live = true;
  const doomed = new Set<Photo>(); // removed while a video is being made: closed when it is done (it drew a closed bitmap)
  const free = (p: Photo) => { if (busy) doomed.add(p); else { p.bmp.close(); p.tiny.close(); } };
  /** Output size: the short side is 1080 or 720 px, the long side follows the shape (even numbers for H.264). */
  const size = (): [number, number] => { const [a, b] = aspect.split(':').map(Number), r2 = (v: number) => Math.round(v / 2) * 2; return a >= b ? [r2((res * a) / b), res] : [res, r2((res * b) / a)]; };
  const perPhoto = () => (matchMusic && music && photos.length ? Math.max(1, music.buf.duration / photos.length) : secs);
  const total = () => photos.length * perPhoto();
  const livePlan = (): Plan => ({ photos, per: perPhoto(), total: total(), fit, zoom, fade });

  const list = h('div', { class: 'ss-list' });
  const info = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const preview = h('canvas', { class: 'ss-preview', 'aria-label': 'Slideshow preview' }) as HTMLCanvasElement;
  const prog = progress();
  const after = h('video', { class: 'vid-prev', controls: true, playsinline: true }) as HTMLVideoElement;
  const result = h('div', { class: 'vid-result' });
  const resultCard = card('Your video', result, after); resultCard.hidden = true;
  const musicInfo = h('div', { class: 'muted small' });
  const work = h('div', { class: 'stack', hidden: true });

  // ------------------------------------------------------------------ drawing (same code for preview and export)
  function drawPhoto(g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, pl: Plan, p: Photo, W: number, H: number, prog01: number, k: number, alpha: number) {
    const { fit, zoom } = pl;
    g.globalAlpha = alpha;
    const cover = Math.max(W / p.w, H / p.h), contain = Math.min(W / p.w, H / p.h);
    if (fit === 'fit') { // blurred, darkened cover of the same photo behind it
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
      const s = cover * 1.1; g.drawImage(p.tiny, (W - p.w * s) / 2, (H - p.h * s) / 2, p.w * s, p.h * s);
      g.fillStyle = `rgba(0,0,0,${0.35 * alpha})`; g.fillRect(0, 0, W, H);
    }
    const z = zoom ? 1 + 0.08 * prog01 : 1, s = (fit === 'fill' ? cover : contain) * z;
    const pan = zoom ? (k % 2 ? 1 : -1) * 0.025 * W * (prog01 - 0.5) : 0;
    g.imageSmoothingQuality = 'high';
    g.drawImage(p.bmp, (W - p.w * s) / 2 + pan, (H - p.h * s) / 2, p.w * s, p.h * s);
    g.globalAlpha = 1;
  }
  function frameAt(g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, t: number, W: number, H: number, pl: Plan = livePlan()) {
    const { photos: ps, per: d, total: T, fade: fd } = pl, n = ps.length, tf = fd ? Math.min(0.8, d / 3) : 0;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    if (!n) return;
    const i = Math.min(n - 1, Math.floor(t / d)), local = t - i * d;
    drawPhoto(g, pl, ps[i], W, H, (local + tf) / (d + tf), i, 1);
    if (tf && i + 1 < n && local > d - tf) { const a = (local - (d - tf)) / tf; drawPhoto(g, pl, ps[i + 1], W, H, (local - (d - tf)) / (d + tf), i + 1, a); }
    if (tf && i === 0 && local < tf / 2) { g.fillStyle = `rgba(0,0,0,${1 - local / (tf / 2)})`; g.fillRect(0, 0, W, H); } // fade in from black
    if (tf && t > T - tf / 2) { g.fillStyle = `rgba(0,0,0,${Math.min(1, (t - (T - tf / 2)) / (tf / 2))})`; g.fillRect(0, 0, W, H); } // and out
  }
  function drawPreview(t = 0) {
    const [W, H] = size(), maxH = Math.max(240, innerHeight * 0.55), cw = Math.round(Math.min(preview.parentElement?.clientWidth || 640, 720, (maxH * W) / H)), ch = Math.round((cw * H) / W);
    const dpr = devicePixelRatio || 1;
    preview.width = Math.round(cw * dpr); preview.height = Math.round(ch * dpr); preview.style.height = `${ch}px`; preview.style.width = `${cw}px`;
    const g = preview.getContext('2d')!; g.save(); g.scale(preview.width / W, preview.height / H); frameAt(g, t, W, H); g.restore();
  }
  function refresh() {
    renderList();
    info.textContent = photos.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''} · ${perPhoto().toFixed(1)} s each · video ${fmtTime(total())} · ${size().join('×')}${music ? ` · music ${fmtTime(music.buf.duration)}${!matchMusic && music.buf.duration < total() ? ' (repeats)' : ''}` : ''}` : '';
    work.hidden = !photos.length; goBtn.disabled = !photos.length;
    if (!playing) drawPreview(Math.min(total() - 0.01, perPhoto() * 0.4));
  }
  function renderList() {
    clear(list).append(...photos.map((p, i) => {
      const c = h('canvas', { class: 'ss-thumb', width: 96, height: 72 }) as HTMLCanvasElement;
      const g = c.getContext('2d')!, s = Math.max(96 / p.w, 72 / p.h); g.drawImage(p.bmp, (96 - p.w * s) / 2, (72 - p.h * s) / 2, p.w * s, p.h * s);
      const move = (d: number) => { const j = i + d; if (j < 0 || j >= photos.length) return; [photos[i], photos[j]] = [photos[j], photos[i]]; refresh(); };
      return h('div', { class: 'ss-item' }, h('span', { class: 'ss-num' }, String(i + 1)), c,
        h('div', { class: 'ss-btns' },
          button('', () => move(-1), { icon: 'ChevronLeft', small: true, variant: 'ghost', title: `Move photo ${i + 1} earlier`, disabled: i === 0 }),
          button('', () => move(1), { icon: 'ChevronRight', small: true, variant: 'ghost', title: `Move photo ${i + 1} later`, disabled: i === photos.length - 1 }),
          button('', () => { const [x] = photos.splice(i, 1); free(x); refresh(); }, { icon: 'X', small: true, variant: 'ghost', title: `Remove photo ${i + 1}` })));
    }));
  }
  async function addPhotos(files: File[]) {
    const [W, H] = size(), maxSide = Math.round(Math.max(W, H) * 1.15);
    for (const f of files) {
      info.textContent = `Adding ${f.name}…`;
      try {
        const img = previewOf(await loadImg(f), maxSide);
        const id = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
        const bmp = await createImageBitmap(id), tiny = await createImageBitmap(id, { resizeWidth: 24, resizeHeight: Math.max(1, Math.round((24 * img.height) / img.width)), resizeQuality: 'medium' });
        photos.push({ name: f.name, bmp, tiny, w: img.width, h: img.height });
      } catch (e) { toast(`${f.name}: ${errMsg(e)}`, 'err'); }
    }
    if (photos.length) picker.classList.add('drop-compact');
    refresh();
  }
  async function setMusic(f: File) {
    const my = ++musicSeq; // the newest music wins
    try {
      const buf = await decodeAudio(f);
      if (my !== musicSeq || !live) return;
      if (!buf.duration) throw new Error('there is no sound in this file');
      music = { name: f.name, buf }; musicInfo.textContent = `${f.name} · ${fmtTime(buf.duration)}`; musicClear.hidden = false; refresh();
    } catch (e) { if (my === musicSeq && live) toast(`Cannot read this audio: ${errMsg(e)}`, 'err'); }
  }

  /** Music cut/looped to the video length with fades, as an AudioBuffer. */
  async function musicTrack(len: number, m = music): Promise<AudioBuffer | null> {
    if (!m) return null;
    const src = channelsOf(m.buf).slice(0, 2), sr = m.buf.sampleRate, n = Math.round(len * sr);
    let chs: Float32Array[] = src.map((c) => { const o = new Float32Array(n); for (let k = 0; k < n; k += c.length) o.set(c.subarray(0, Math.min(c.length, n - k)), k); return o; });
    chs = await audio('fade', chs, Math.round(0.4 * sr), Math.round(Math.min(2.5, len / 4) * sr));
    const b = new AudioBuffer({ length: n, numberOfChannels: chs.length, sampleRate: sr });
    chs.forEach((c, i) => b.copyToChannel(c as Float32Array<ArrayBuffer>, i));
    return b;
  }

  async function render() {
    if (!photos.length || busy) return;
    busy = true; cancel = false; stopPreview(); goBtn.hidden = true; cancelBtn.hidden = false; saveBtn.hidden = true; resultCard.hidden = true;
    const t0 = performance.now();
    try {
      const mb = await import('mediabunny');
      // a copy of what is shown now: photos added, removed or moved and settings changed meanwhile wait for the next video
      const plan: Plan = { ...livePlan(), photos: photos.slice() }, m = music;
      const [W, H] = size(), dur = plan.total, frames = Math.round(dur * FPS);
      const vcodec = await mb.getFirstEncodableVideoCodec(['avc', 'vp9', 'av1'], { width: W, height: H });
      if (!vcodec) throw new Error('This browser cannot encode video (WebCodecs).');
      const canvas = new OffscreenCanvas(W, H), g = canvas.getContext('2d')!;
      const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
      const vsrc = new mb.CanvasSource(canvas, { codec: vcodec, bitrate: mb.QUALITY_HIGH, keyFrameInterval: 2 });
      output.addVideoTrack(vsrc, { frameRate: FPS });
      const track = await musicTrack(dur, m);
      let asrc: any = null, acodec: Awaited<ReturnType<typeof mb.getFirstEncodableAudioCodec>> = null;
      if (track) {
        await ensureAac().catch(() => {}); // AAC where the browser has none (it was Opus inside the MP4)
        acodec = await mb.getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: track.numberOfChannels, sampleRate: track.sampleRate });
        if (acodec) { asrc = new mb.AudioBufferSource({ codec: acodec, bitrate: 160000 }); output.addAudioTrack(asrc); }
        else toast('This browser cannot encode audio: the video will be silent.', 'info');
      }
      await output.start();
      if (asrc) { await asrc.add(track!); asrc.close(); }
      for (let f = 0; f < frames; f++) {
        if (cancel) { await output.cancel(); throw new Error('Cancelled'); }
        frameAt(g, f / FPS, W, H, plan);
        await vsrc.add(f / FPS, 1 / FPS);
        if (f % 15 === 0) prog.set(f / frames, `Making the video… ${Math.round((f / frames) * 100)} %`);
      }
      vsrc.close();
      await output.finalize();
      if (!live) return;
      outBlob = new Blob([output.target.buffer!], { type: 'video/mp4' });
      URL.revokeObjectURL(outUrl); outUrl = URL.createObjectURL(outBlob); after.src = outUrl;
      result.replaceChildren(h('div', { class: 'vid-big' }, fmtBytes(outBlob.size)), h('div', { class: 'muted small' }, `${W}×${H} · ${fmtTime(dur)} · ${vcodec === 'avc' ? 'H.264' : vcodec.toUpperCase()}${asrc ? ` + music (${acodec === 'aac' ? 'AAC' : String(acodec).toUpperCase()})` : ''} · made in ${((performance.now() - t0) / 1000).toFixed(1)} s`));
      resultCard.hidden = false; saveBtn.hidden = false;
      goBtn.classList.replace('btn-primary', 'btn-secondary');
    } catch (e) { if (live) { if (errMsg(e) !== 'Cancelled') toast(errMsg(e), 'err'); else toast('Cancelled', 'info'); } }
    finally {
      busy = false; prog.done(); goBtn.hidden = false; cancelBtn.hidden = true;
      for (const p of doomed) { p.bmp.close(); p.tiny.close(); } doomed.clear();
    }
  }

  // live preview: the same frames, in real time, with the music
  async function playPreview() {
    if (playing) return stopPreview();
    const track = await musicTrack(total());
    let srcNode: AudioBufferSourceNode | null = null;
    if (track) { ac ||= new AudioContext(); ac.resume(); srcNode = ac.createBufferSource(); srcNode.buffer = track; srcNode.connect(ac.destination); srcNode.start(); }
    const start = performance.now();
    playBtn.setLabel('Stop');
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      if (t >= total()) { stopPreview(); return; }
      drawPreview(t); playing = requestAnimationFrame(tick);
    };
    (stopPreview as any).node = srcNode;
    playing = requestAnimationFrame(tick);
  }
  function stopPreview() { cancelAnimationFrame(playing); playing = 0; try { (stopPreview as any).node?.stop(); } catch { /* ended */ } (stopPreview as any).node = null; playBtn.setLabel('Preview'); }

  const picker = filePicker({ accept: 'image/*,.heic,.heif', multiple: true, label: 'Add photos', hint: 'JPEG, PNG, WebP, HEIC (iPhone) — in the order you want; reorder below', onFiles: (fs) => addPhotos(fs) });
  const musicPick = filePicker({ accept: 'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac', label: 'Add music (optional)', compact: true, onFiles: ([f]) => setMusic(f) });
  const musicClear = button('Remove music', () => { music = null; musicInfo.textContent = ''; musicClear.hidden = true; refresh(); }, { icon: 'X', small: true, variant: 'ghost' }); musicClear.hidden = true;
  const goBtn = button(ctx.isMobile ? 'Make video' : 'Make video', () => render(), { icon: 'Clapperboard', variant: 'primary', disabled: true });
  const cancelBtn = button('Cancel', () => (cancel = true), { icon: 'X' }); cancelBtn.hidden = true;
  const saveBtn = button(ctx.isMobile ? 'Save' : 'Download', async () => { if (!outBlob) return; const n = `slideshow-${new Date().toISOString().slice(0, 10)}.mp4`; ctx.isMobile ? await shareOrDownload(outBlob, n) : downloadBlob(outBlob, n); }, { icon: 'Download', variant: 'primary' }); saveBtn.hidden = true;
  const playBtn = button('Preview', () => playPreview(), { icon: 'Play' });
  const secsS = slider({ label: 'Seconds per photo', min: 1, max: 10, step: 0.5, value: secs, fmt: (v) => `${v} s`, onInput: (v) => { secs = v; refresh(); } });

  work.append(
    card('Photos', list, info),
    card('Music', stack(musicPick, h('div', { class: 'row' }, musicInfo, musicClear), toggle('Fit the slideshow to the music length', matchMusic, (v) => { matchMusic = v; secsS.hidden = v; refresh(); }))),
    card('Look', stack(
      field('Shape', segmented(ASPECTS, aspect, (v) => { aspect = v; refresh(); })),
      field('Quality', segmented<string>([['1080', '1080p (sharper)'], ['720', '720p (smaller)']], String(res), (v) => { res = +v; refresh(); })),
      field('Photos that do not match the shape', segmented<string>([['fill', 'Fill (crop edges)'], ['fit', 'Fit (blurred background)']], fit, (v) => { fit = v as any; refresh(); })),
      secsS,
      toggle('Crossfade between photos', fade, (v) => { fade = v; refresh(); }),
      toggle('Gentle zoom (Ken Burns)', zoom, (v) => { zoom = v; refresh(); }))),
    card('Preview', preview, h('div', { class: 'row' }, playBtn)),
    prog, resultCard);
  root.append(card(null, picker), work, actions(goBtn, cancelBtn, saveBtn),
    note('Everything is made on this device. Long slideshows at 1080p take a while on phones.', 'info'));
  return () => { live = false; cancel = true; stopPreview(); ac?.close(); URL.revokeObjectURL(outUrl); if (!busy) for (const p of photos) { p.bmp.close(); p.tiny.close(); } };
};
