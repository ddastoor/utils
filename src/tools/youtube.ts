// YouTube Clip (PC). Two ways to get a clip of a YouTube video between two times:
//  1. yt-dlp command (original quality; needs yt-dlp + ffmpeg on the computer, or Termux on Android).
//  2. Record in this browser: the youtube-nocookie.com embedded player (owner-approved frame-src; no YouTube script in
//     our page — it is driven with postMessage), this tab is shared once, Region Capture (CropTarget) crops the
//     recording to the player, the player seeks to the start, plays, and recording stops at the end time reported by
//     the player itself. Real time; ads may appear; some videos refuse embedding.
// Nothing is contacted until "Load the player" is pressed. Direct download from a web page is impossible (CORS).
import { h, card, field, actions, button, input, segmented, toggle, stack, note, outputBox, toast, errMsg, fmtBytes, fmtTime, downloadBlob, type Mount } from '../ui';
import { linuxBanner } from '../linux';
import { YTDLP_FILES, YTDLP_RELEASES, pickYtdlp, runHint, ytdlpUrl } from '../lib/ytdlp';
import { finishRecording } from '../lib/aac';
import { parseTime, parseYouTube, hms } from '../lib/ytclip';
export { parseTime, parseYouTube, hms };

export const mount: Mount = (root) => {
  let mode: 'two' | 'one' = 'two', exact = false, audioOnly = false;
  let clip: { id: string; start: number; end: number } | null = null;
  const urlA = input({ placeholder: 'https://youtu.be/…?t=62  (Share → Start at…)', onInput: () => parse() }) as HTMLInputElement;
  const urlB = input({ placeholder: 'https://youtu.be/…?t=90', onInput: () => parse() }) as HTMLInputElement;
  const startIn = input({ placeholder: '1:02', onInput: () => parse() }) as HTMLInputElement;
  const endIn = input({ placeholder: '1:30', onInput: () => parse() }) as HTMLInputElement;
  urlA.setAttribute('aria-label', 'Video link'); urlB.setAttribute('aria-label', 'End link'); startIn.setAttribute('aria-label', 'Start time'); endIn.setAttribute('aria-label', 'End time');
  const linkField = field('Link at the start (with ?t=)', urlA);
  const twoBox = stack(field('Link at the end (with ?t=)', urlB));
  const oneBox = h('div', { class: 'row' }, field('Start', startIn), field('End', endIn));
  oneBox.hidden = true;
  const summary = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const cmd = outputBox({ rows: 3, mono: true });
  const work = h('div', { class: 'stack', hidden: true });

  function parse() {
    const a = parseYouTube(urlA.value);
    clip = null;
    if (!a) { summary.textContent = urlA.value.trim() ? 'Not a YouTube video link.' : ''; work.hidden = true; return; }
    let start: number, end: number;
    if (mode === 'two') {
      const b = parseYouTube(urlB.value);
      if (!b) { summary.textContent = urlB.value.trim() ? 'The end link is not a YouTube video link.' : 'Now paste the link copied at the end of the clip.'; work.hidden = true; return; }
      if (b.id !== a.id) { summary.textContent = 'The two links are for different videos.'; work.hidden = true; return; }
      start = isNaN(a.t) ? 0 : a.t; end = b.t;
      if (isNaN(end)) { summary.textContent = 'The end link has no time: on YouTube use Share → “Start at”, or right-click the video → “Copy video URL at current time”.'; work.hidden = true; return; }
    } else { start = parseTime(startIn.value || (isNaN(a.t) ? '0' : String(a.t))); end = parseTime(endIn.value); }
    if (isNaN(start) || isNaN(end)) { summary.textContent = 'Enter the start and end times (e.g. 1:02 and 1:30).'; work.hidden = true; return; }
    if (end <= start) { summary.textContent = 'The end must be after the start.'; work.hidden = true; return; }
    if (frame && loadedId !== a.id) { clear(); recBtn.hidden = true; loadBtn.hidden = false; recStatus.textContent = 'Another video: load its player.'; } // it recorded the old video
    clip = { id: a.id, start, end };
    summary.textContent = `Video ${a.id} · from ${hms(start)} to ${hms(end)} (${fmtTime(end - start)})`;
    work.hidden = false;
    renderCmd();
  }
  function renderCmd() {
    if (!clip) return;
    const url = `https://www.youtube.com/watch?v=${clip.id}`, sec = `*${clip.start}-${clip.end}`;
    const parts = ['yt-dlp', '--download-sections', `"${sec}"`, ...(exact ? ['--force-keyframes-at-cuts'] : []),
      ...(audioOnly ? ['-x', '--audio-format', 'mp3', '--audio-quality', '0'] : ['-f', '"bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]"', '--merge-output-format', 'mp4']),
      '-o', `"%(title)s [${hms(clip.start).replace(/:/g, '.')}-${hms(clip.end).replace(/:/g, '.')}].%(ext)s"`, `"${url}"`];
    cmd.value = parts.join(' ');
  }

  // ------------------------------------------------------------------ record in the browser
  const ORIGIN = 'https://www.youtube-nocookie.com';
  let frame: HTMLIFrameElement | null = null, playerTime = 0, playerState = -1, ready = false, onInfo: (() => void) | null = null;
  let rec: MediaRecorder | null = null, stream: MediaStream | null = null, outBlob: Blob | null = null, outUrl = '', loadedId = '', recording = false;
  const playerBox = h('div', { class: 'yt-player' });
  const recStatus = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const result = h('div', { class: 'stack' });
  const send = (func: string, args: any[] = []) => frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args, id: 1, channel: 'widget' }), ORIGIN);
  const onMessage = (e: MessageEvent) => {
    if (e.origin !== ORIGIN || e.source !== frame?.contentWindow) return;
    let d: any; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
    if (d.event === 'onReady' || d.event === 'initialDelivery') ready = true;
    if (d.event === 'onError') { recStatus.textContent = `The player reports error ${d.info}: ${[101, 150, 152].includes(+d.info) ? 'the owner does not allow this video to be embedded — use the yt-dlp command.' : 'video unavailable.'}`; }
    const info = d.info || {};
    if (typeof info.currentTime === 'number') playerTime = info.currentTime;
    if (typeof info.playerState === 'number') playerState = info.playerState;
    if (d.event === 'onStateChange' && typeof d.info === 'number') playerState = d.info;
    onInfo?.();
  };
  addEventListener('message', onMessage);
  function loadPlayer() {
    if (!clip) return;
    clear();
    frame = h('iframe', {
      src: `${ORIGIN}/embed/${clip.id}?enablejsapi=1&start=${Math.floor(clip.start)}&rel=0&playsinline=1&modestbranding=1&origin=${encodeURIComponent(location.origin)}`,
      title: 'YouTube video player', allow: 'autoplay; encrypted-media; picture-in-picture', referrerpolicy: 'strict-origin-when-cross-origin', allowfullscreen: true, class: 'yt-frame',
    }) as HTMLIFrameElement;
    frame.addEventListener('load', () => { // ask the player to report its time and state (the IFrame API's "listening" handshake)
      ready = false;
      const hello = () => frame?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), ORIGIN);
      hello(); let n = 0; const iv = window.setInterval(() => { if (ready || ++n > 40 || !frame) clearInterval(iv); else hello(); }, 250);
    });
    playerBox.replaceChildren(frame); loadedId = clip.id;
    recBtn.hidden = false; loadBtn.hidden = true;
    recStatus.textContent = 'Player loaded from youtube-nocookie.com. Press “Record clip”, then share THIS tab when Chrome asks.';
  }
  const clear = () => { frame?.remove(); frame = null; ready = false; playerState = -1; };
  const waitFor = (cond: () => boolean, ms: number) => new Promise<boolean>((res) => {
    if (cond()) return res(true);
    const t = window.setTimeout(() => { onInfo = null; res(false); }, ms);
    onInfo = () => { if (cond()) { clearTimeout(t); onInfo = null; res(true); } };
  });
  async function record() {
    if (!clip || !frame || recording) return; // a second press started a second recording
    recording = true; recBtn.disabled = true;
    try { await recordClip({ ...clip }); } finally { recording = false; recBtn.disabled = false; }
  }
  /** c: the clip as it was when recording started (editing the link meanwhile changed where it stopped and its name) */
  async function recordClip(clip: { id: string; start: number; end: number }) {
    if (clip.id !== loadedId) { recStatus.textContent = 'The player shows another video: load the player again.'; return; }
    if (!ready && !(await waitFor(() => ready, 8000))) { recStatus.textContent = 'The player did not answer. Reload the player (or use the yt-dlp command).'; return; }
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: { suppressLocalAudioPlayback: false } as any, preferCurrentTab: true, selfBrowserSurface: 'include' } as any);
    } catch (e: any) { if (e?.name !== 'NotAllowedError') toast(errMsg(e), 'err'); return; }
    const track = stream.getVideoTracks()[0] as any;
    let cropped = false;
    try { if ((window as any).CropTarget && track.cropTo) { await track.cropTo(await (window as any).CropTarget.fromElement(playerBox)); cropped = true; } } catch { /* not a capture of this tab */ }
    const mime = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/webm;codecs=vp9,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const chunks: Blob[] = [];
    send('mute'); send('seekTo', [clip.start, true]); send('playVideo'); // muted while seeking so the start is clean
    recStatus.textContent = `Seeking to ${hms(clip.start)}…`;
    if (!(await waitFor(() => playerState === 1 && playerTime >= clip.start - 0.5 && playerTime < clip.start + 2, 20000))) { recStatus.textContent = 'The video did not start (ad, age check or sign-in?). Start it by hand once, then try again.'; stopStream(); return; }
    send('pauseVideo'); send('seekTo', [clip.start, true]); send('unMute');
    await new Promise((r) => setTimeout(r, 400));
    rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => (rec!.onstop = r));
    rec.start(500); send('playVideo');
    const tick = window.setInterval(() => { recStatus.textContent = `Recording ${hms(Math.max(clip.start, playerTime))} → ${hms(clip.end)}${cropped ? '' : ' (not cropped: share THIS tab to record only the player)'}…`; if (playerTime >= clip.end || !stream?.active) finish(); }, 100);
    const finish = () => { clearInterval(tick); if (rec?.state === 'recording') { send('pauseVideo'); rec.stop(); } };
    await done; clearInterval(tick);
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    const blob = await finishRecording(new Blob(chunks, { type: `video/${ext}` }), ext); // duration index; an MP4's sound as AAC
    stopStream(); rec = null;
    outBlob = blob; URL.revokeObjectURL(outUrl); outUrl = URL.createObjectURL(blob);
    const v = h('video', { src: outUrl, controls: true, class: 'vid-prev' });
    result.replaceChildren(h('div', { class: 'vid-big' }, fmtBytes(blob.size)), h('div', { class: 'muted small' }, `${hms(clip.start)}–${hms(clip.end)} · ${ext.toUpperCase()}${cropped ? ' · cropped to the player' : ' · NOT cropped (something other than this tab was shared)'}`), v,
      h('div', { class: 'row' }, button('Download', () => downloadBlob(outBlob!, `youtube-${clip.id}-${hms(clip.start).replace(/:/g, '.')}.${ext}`), { icon: 'Download', variant: 'primary' })));
    recStatus.textContent = 'Done.';
  }
  const stopStream = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; };
  const loadBtn = button('Load the player', () => loadPlayer(), { icon: 'Play', variant: 'primary' });
  const recBtn = button('Record clip', () => record(), { icon: 'Circle', variant: 'primary' }); recBtn.hidden = true;

  work.append(
    card('Download with yt-dlp (original quality)', stack(cmd,
      toggle('Exact cut (re-encodes the edges; slower)', exact, (v) => { exact = v; renderCmd(); }),
      toggle('Sound only (MP3)', audioOnly, (v) => { audioOnly = v; renderCmd(); }),
      note(h('span', null, 'Needs ', h('strong', null, 'yt-dlp'), ' and ', h('strong', null, 'ffmpeg'), ' on the computer — Windows: winget install yt-dlp.yt-dlp Gyan.FFmpeg · Linux: pipx install yt-dlp and your ffmpeg package · Android: Termux (pkg install python ffmpeg, pip install yt-dlp).'), 'info'))),
    card('Record in this browser', stack(
      note('Plays the clip in YouTube’s privacy-enhanced player and records it in real time. Chrome asks to share this tab — choose it. Ads may appear; some videos cannot be embedded.', 'info'),
      playerBox, recStatus, h('div', { class: 'row' }, loadBtn, recBtn), result)));
  // "Download the latest yt-dlp": a link to yt-dlp's GitHub releases (always the newest); the file for this computer
  // first — Chromium tells the architecture (ARM) a moment later
  const ytMain = h('a', { class: 'btn btn-primary', rel: 'noopener noreferrer', referrerpolicy: 'no-referrer' });
  const ytHint = h('div', { class: 'muted small' });
  const showYt = (arch = '', bitness = '') => {
    const f = pickYtdlp(navigator.userAgent, arch, bitness);
    ytMain.setAttribute('href', ytdlpUrl(f.file)); ytMain.dataset.file = f.file;
    ytMain.textContent = `Download latest yt-dlp — ${f.system} (${f.file})`;
    ytHint.textContent = runHint(f);
  };
  showYt();
  (navigator as any).userAgentData?.getHighEntropyValues?.(['architecture', 'bitness']).then((v: any) => showYt(v?.architecture || '', v?.bitness || '')).catch(() => {});
  const ytCard = card('Get yt-dlp — the newest version, from GitHub', stack(
    h('div', { class: 'row' }, ytMain), ytHint,
    h('details', null, h('summary', null, 'Other systems'), h('ul', { class: 'ytdlp-files' }, ...YTDLP_FILES.map((f) =>
      h('li', null, h('a', { href: ytdlpUrl(f.file), rel: 'noopener noreferrer', referrerpolicy: 'no-referrer' }, f.file), ` — ${f.system}, ${f.note}`)))),
    note(h('span', null, 'Your browser downloads it straight from yt-dlp’s own releases on GitHub (', h('a', { href: YTDLP_RELEASES, target: '_blank', rel: 'noopener noreferrer' }, 'github.com/yt-dlp/yt-dlp'), ') — always the latest release. This page itself fetches nothing. For merging the best video with its sound yt-dlp also needs ffmpeg (Windows: winget install Gyan.FFmpeg).'), 'info')));
  root.append(
    card('Clip', stack(field('I have', segmented<'two' | 'one'>([['two', 'Two links (start and end)'], ['one', 'One link + times']], mode, (v) => { mode = v; twoBox.hidden = v !== 'two'; oneBox.hidden = v !== 'one'; (linkField.querySelector('.field-label') as HTMLElement).textContent = v === 'two' ? 'Link at the start (with ?t=)' : 'Video link'; parse(); })),
      linkField, twoBox, oneBox, summary)),
    work, ytCard,
    ...[linuxBanner()].filter((x): x is HTMLElement => !!x),
    note('A web page cannot download from YouTube directly (YouTube does not allow it across sites). Respect the creator’s rights: clip only what you may use.', 'info'));
  return () => { removeEventListener('message', onMessage); rec?.state === 'recording' && rec.stop(); stopStream(); clear(); URL.revokeObjectURL(outUrl); };
};
