// Video Compressor: re-encode with the browser's own hardware/software encoders (WebCodecs: H.264 or AV1, compiled
// C++ inside the browser) and mediabunny (MPL-2.0) for demuxing/muxing MP4. Quality presets or a target size
// (bitrate from the duration, re-run if the encoder overshoots), resolution and frame-rate caps, audio copied when the
// MP4 container accepts it (no quality loss), re-encoded or removed. Nothing leaves the device.
import { h, card, field, actions, button, segmented, select, input, stack, note, progress, filePicker, toast, errMsg, fmtBytes, fmtTime, baseName, downloadBlob, shareOrDownload, type Mount } from '../ui';
import { ensureAac, MP4_COPY_AUDIO } from '../lib/aac';

type Mode = 'quality' | 'size';
type Codec = 'avc' | 'av1';
const QUALITY: Array<[string, string, number]> = [['high', 'High — barely visible change', 0.10], ['medium', 'Medium — good for sharing', 0.06], ['small', 'Small — lowest size', 0.035]];
const SIZES: Array<[string, string]> = [['16', 'WhatsApp (16 MB)'], ['25', 'Email (25 MB)'], ['10', 'Discord (10 MB)'], ['8', '8 MB'], ['50', '50 MB'], ['custom', 'Custom…']];
const RES = [2160, 1440, 1080, 720, 480, 360, 240];

interface Info { duration: number; w: number; h: number; fps: number; vbr: number; vcodec: string; acodec: string | null; abr: number; size: number }

export const mount: Mount = (root, ctx) => {
  let file: File | null = null, info: Info | null = null, mode: Mode = 'quality', q = 'medium', sizeSel = '16', customMB = 16, res = 0, fpsCap = 0, codec: Codec = 'avc', audioMode: 'keep' | 'low' | 'remove' = 'keep';
  let conv: any = null, outBlob: Blob | null = null, outName = '', srcUrl = '', outUrl = '', av1 = false, pickSeq = 0, runSeq = 0, live = true;
  const prog = progress();
  const infoEl = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const before = h('video', { class: 'vid-prev', controls: true, playsinline: true, muted: true, preload: 'metadata' }) as HTMLVideoElement;
  const after = h('video', { class: 'vid-prev', controls: true, playsinline: true, preload: 'metadata' }) as HTMLVideoElement;
  const resultInfo = h('div', { class: 'vid-result', 'aria-live': 'polite' });
  const resultCard = card('Result', resultInfo, after);
  resultCard.hidden = true;
  const work = h('div', { class: 'stack', hidden: true });
  const qualityBox = field('Quality', select(QUALITY.map(([v, l]) => [v, l] as [string, string]), q, (v) => (q = v)));
  const customIn = input({ type: 'number', min: 0.01, step: 0.5, value: customMB, onInput: (v) => (customMB = +v) }) as HTMLInputElement;
  const customBox = field('Target size (MB)', customIn); customBox.hidden = true;
  const sizeBox = h('div', { class: 'stack' }, field('Target', select(SIZES, sizeSel, (v) => { sizeSel = v; customBox.hidden = v !== 'custom'; })), customBox);
  sizeBox.hidden = true;
  const modeSeg = segmented([['quality', 'By quality'], ['size', 'To a size']], mode, (v) => { mode = v; qualityBox.hidden = v !== 'quality'; sizeBox.hidden = v !== 'size'; });
  const resSel = select<string>([['0', 'Original']], '0', (v) => (res = +v));
  const fpsSel = select<string>([['0', 'Original'], ['30', '30 fps'], ['24', '24 fps']], '0', (v) => (fpsCap = +v));
  const codecSeg = h('div');
  const audioSel = select<string>([['keep', 'Keep (AAC and MP3 as they are, others as AAC)'], ['low', 'Smaller (AAC, 64 kbps)'], ['remove', 'Remove sound']], 'keep', (v) => (audioMode = v as any));
  const goBtn = button('Compress', () => run(), { icon: 'Minimize2', variant: 'primary' });
  let cancelled = false;
  const cancelBtn = button('Cancel', () => { cancelled = true; conv?.cancel?.(); }, { icon: 'X' }); cancelBtn.hidden = true;
  const saveBtn = button(ctx.isMobile ? 'Save' : 'Download', () => save(), { icon: 'Download', variant: 'primary' }); saveBtn.hidden = true;

  const targetBytes = () => {
    const mb = sizeSel === 'custom' ? customMB : +sizeSel;
    if (!(mb > 0)) throw new Error('Type a target size above 0 MB.'); // it was taken as 1 MB without a word
    return mb * 1024 * 1024;
  };
  /** the target as chosen ("50 MB", not "50.0 MB") */
  const targetLabel = () => `${sizeSel === 'custom' ? +customMB.toFixed(3) : +sizeSel} MB`;
  /** the sound as it goes into the MP4: copied when it is AAC or MP3, else AAC (at its own bitrate, 128 – 256 kbps) */
  const audioOpts = (i: Info) => !i.acodec || audioMode === 'remove' ? { discard: true }
    : audioMode === 'low' ? { codec: 'aac', bitrate: 64000, forceTranscode: true }
    : MP4_COPY_AUDIO.includes(i.acodec) ? {} : { codec: 'aac', bitrate: Math.max(128000, Math.min(256000, i.abr || 128000)) };
  const dims = (i: Info) => {
    const short = Math.min(i.w, i.h);
    if (!res || res >= short) return { w: undefined, h: undefined, outW: i.w, outH: i.h };
    const k = res / short, outW = Math.round((i.w * k) / 2) * 2, outH = Math.round((i.h * k) / 2) * 2;
    return { w: outW, h: outH, outW, outH };
  };
  const audioBps = (i: Info) => (!i.acodec || audioMode === 'remove' ? 0 : audioMode === 'low' ? 64000 : MP4_COPY_AUDIO.includes(i.acodec) ? i.abr || 128000 : Math.max(128000, Math.min(256000, i.abr || 128000)));
  function videoBitrate(i: Info) {
    const { outW, outH } = dims(i), fps = Math.min(i.fps || 30, fpsCap || 1000);
    if (mode === 'quality') {
      const bpp = QUALITY.find(([v]) => v === q)![2] * (codec === 'av1' ? 0.65 : 1);
      return Math.max(150_000, Math.min(Math.round(outW * outH * fps * bpp), i.vbr ? Math.round(i.vbr * 0.9) : Infinity));
    }
    const budget = (targetBytes() * 8 * 0.96) / i.duration - audioBps(i); // 4 % for the container
    if (budget < 80_000) throw new Error(`${targetLabel()} is too small for ${fmtTime(i.duration)} of video: choose a bigger size, a lower resolution or remove the sound.`);
    // never more than the original's own bitrate: a target above the file's size made the video bigger
    return Math.round(i.vbr ? Math.min(budget, i.vbr * 0.9) : budget);
  }

  async function open(f: File) {
    const my = ++pickSeq;
    if (conv || !cancelBtn.hidden) { cancelled = true; conv?.cancel?.(); } // a running compression is of the file before
    infoEl.textContent = 'Reading the video…';
    try {
      const mb = await import('mediabunny');
      const inp = new mb.Input({ source: new mb.BlobSource(f), formats: mb.ALL_FORMATS });
      const vt = await inp.getPrimaryVideoTrack();
      if (!vt) throw new Error('No video track in this file.');
      const at = await inp.getPrimaryAudioTrack();
      const [duration, vs, as] = await Promise.all([inp.computeDuration(), vt.computePacketStats(300), at ? at.computePacketStats(300) : null]);
      if (!(await vt.canDecode())) throw new Error(`This browser cannot decode ${vt.codec || 'this'} video.`);
      if (my !== pickSeq || !live) { inp.dispose?.(); return; } // a newer file was chosen meanwhile
      info = { duration, w: vt.displayWidth, h: vt.displayHeight, fps: Math.round(vs.averagePacketRate * 100) / 100, vbr: vs.averageBitrate, vcodec: vt.codec || '?', acodec: at?.codec || null, abr: as?.averageBitrate || 0, size: f.size };
      file = f; outBlob = null; resultCard.hidden = true; saveBtn.hidden = true; goBtn.classList.replace('btn-secondary', 'btn-primary'); goBtn.setLabel('Compress');
      URL.revokeObjectURL(srcUrl); srcUrl = URL.createObjectURL(f); before.src = srcUrl;
      const short = Math.min(info.w, info.h);
      resSel.replaceChildren(h('option', { value: '0' }, `Original (${info.w}×${info.h})`), ...RES.filter((r) => r < short).map((r) => h('option', { value: String(r) }, `${r}p`)));
      res = 0; resSel.value = '0';
      infoEl.textContent = `${f.name}: ${fmtBytes(f.size)} · ${fmtTime(duration)} · ${info.w}×${info.h} · ${info.fps} fps · ${info.vcodec.toUpperCase()} ${Math.round(info.vbr / 1000)} kbps${info.acodec ? ` · sound ${info.acodec.toUpperCase()} ${Math.round(info.abr / 1000)} kbps` : ' · no sound'}`;
      work.hidden = false; picker.classList.add('drop-compact');
      inp.dispose?.();
    } catch (e) {
      if (my !== pickSeq || !live) return;
      infoEl.textContent = info && file ? infoEl.dataset.line || '' : ''; // what was open stays open
      toast(`Cannot open this video: ${errMsg(e)}`, 'err');
    }
    if (my === pickSeq && info) infoEl.dataset.line = infoEl.textContent || '';
  }

  async function encodeOnce(f: File, i: Info, bitrate: number) {
    const mb = await import('mediabunny');
    const aud = audioOpts(i);
    if ((aud as any).codec === 'aac') await ensureAac();
    const inp = new mb.Input({ source: new mb.BlobSource(f), formats: mb.ALL_FORMATS });
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
    const { w, h: hh } = dims(i);
    const audio = aud;
    if (cancelled) throw new Error('cancelled');
    conv = await mb.Conversion.init({
      input: inp, output,
      video: { codec, bitrate, width: w, height: hh, fit: 'fill', frameRate: fpsCap && i.fps > fpsCap ? fpsCap : undefined, forceTranscode: true, keyFrameInterval: 2 },
      audio,
    } as any);
    if (!conv.isValid) throw new Error(`Cannot convert: ${(conv.discardedTracks || []).map((d: any) => `${d.track.type} ${d.reason}`).join(', ') || 'unsupported'}`);
    conv.onProgress = (p: number) => prog.set(p, `Compressing… ${Math.round(p * 100)} %`);
    await conv.execute();
    conv = null;
    return new Blob([output.target.buffer!], { type: 'video/mp4' });
  }
  async function run() {
    if (!file || !info) return;
    const f = file, i = info, my = ++runSeq; // a run keeps its own file: one chosen meanwhile ends it
    cancelled = false;
    goBtn.hidden = true; cancelBtn.hidden = false; saveBtn.hidden = true; resultCard.hidden = true;
    const t0 = performance.now();
    try {
      let br = videoBitrate(i), blob = await encodeOnce(f, i, br), tries = 1;
      while (mode === 'size' && blob.size > targetBytes() && tries < 3) { // the encoder overshot: aim lower
        if (cancelled) throw new Error('cancelled');
        br = Math.round(br * (targetBytes() / blob.size) * 0.95); tries++;
        prog.set(0, `A bit too big (${fmtBytes(blob.size)}): trying again at a lower bitrate…`);
        blob = await encodeOnce(f, i, br);
      }
      if (!live || my !== runSeq || f !== file) return;
      outBlob = blob; outName = `${baseName(f.name)}-small.mp4`;
      URL.revokeObjectURL(outUrl); outUrl = URL.createObjectURL(blob); after.src = outUrl;
      const pct = Math.round((1 - blob.size / i.size) * 100), { outW, outH } = dims(i);
      resultInfo.replaceChildren(...[
        h('div', { class: 'vid-big' }, fmtBytes(blob.size), h('span', { class: pct > 0 ? 'ok-text' : 'err-text' }, pct > 0 ? ` · ${pct} % smaller` : ` · ${-pct} % bigger`)),
        h('div', { class: 'muted small' }, `${outW}×${outH} · ${codec === 'av1' ? 'AV1' : 'H.264'} ${Math.round(br / 1000)} kbps · ${((performance.now() - t0) / 1000).toFixed(1)} s`),
        mode === 'size' && blob.size > targetBytes() ? note(`Still above ${targetLabel()}: choose a lower resolution or remove the sound.`, 'warn') : null,
        mode === 'size' && i.size <= targetBytes() ? note(`The video was already under ${targetLabel()}: it was compressed without going above its own bitrate.`, 'info') : null,
        pct <= 0 ? note('This video was already well compressed. Try a lower resolution or the “Small” quality.', 'warn') : null].filter((x): x is HTMLDivElement => !!x));
      resultCard.hidden = false; saveBtn.hidden = false;
      goBtn.classList.replace('btn-primary', 'btn-secondary'); goBtn.setLabel(ctx.isMobile ? 'Again' : 'Compress again');
    } catch (e: any) {
      if (!live || my !== runSeq) return;
      if (cancelled || /cancel/i.test(e?.message || '') || e?.name === 'ConversionCanceledError') { if (f === file) toast('Cancelled', 'info'); }
      else toast(errMsg(e), 'err');
    } finally { if (my === runSeq) { conv = null; prog.done(); goBtn.hidden = false; cancelBtn.hidden = true; } }
  }
  async function save() {
    if (!outBlob) return;
    ctx.isMobile ? await shareOrDownload(outBlob, outName) : downloadBlob(outBlob, outName);
  }

  const picker = filePicker({ accept: 'video/*,.mp4,.mov,.m4v,.webm,.mkv', label: 'Choose a video', hint: 'MP4, MOV (iPhone), WebM, MKV — it stays on this device', onFiles: ([f]) => open(f) });
  (async () => { // AV1 only where the browser can encode it
    try { av1 = !!(await (window as any).VideoEncoder?.isConfigSupported({ codec: 'av01.0.08M.08', width: 1280, height: 720, bitrate: 2e6, framerate: 30 }))?.supported; } catch { av1 = false; }
    codecSeg.replaceChildren(field('Video format', segmented<Codec>(av1 ? [['avc', 'H.264 (plays everywhere)'], ['av1', 'AV1 (smallest, newer devices)']] : [['avc', 'H.264 (plays everywhere)']], codec, (v) => (codec = v))));
  })();
  const noCodecs = typeof (window as any).VideoEncoder === 'undefined';
  work.append(
    card('Original', infoEl, before),
    card('Settings', stack(field('Compress', modeSeg), qualityBox, sizeBox, field('Resolution', resSel), field('Frame rate', fpsSel), codecSeg, field('Sound', audioSel))),
    prog, resultCard);
  if (noCodecs) root.append(note('This browser has no video encoder (WebCodecs). Use a recent Chrome, Edge, Firefox or Safari 17+.', 'warn'));
  root.append(card(null, picker), work, actions(goBtn, cancelBtn, saveBtn));
  return () => { live = false; cancelled = true; conv?.cancel?.(); URL.revokeObjectURL(srcUrl); URL.revokeObjectURL(outUrl); };
};
