// Screencast (#/screencast, PC): getDisplayMedia (Chromium's fake picker picks the screen) → MediaRecorder → remuxed
// file. Checks length (pause excluded), area crop size, WebM with a real duration, mic track, streaming to a file.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mp4Info } from './video.e2e.mjs';
const probeAudio = (f) => { try { return execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim(); } catch { return null; } };

export default async ({ base, page: newPage, ok, info, download, released }) => {
  const page = await newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => { // stand-in for the save dialog: count what would be written to disk
    window.showSaveFilePicker = async (o) => ({ name: o.suggestedName, createWritable: async () => ({ write: async (d) => { window.__written = (window.__written || 0) + d.size; }, close: async () => { window.__closed = true; } }) });
  });
  await page.goto(`${base}#/screencast`);
  const btn = (name) => page.locator('.actions').getByRole('button', { name, exact: true });
  const recordFor = async (ms, mid, done = /^Recorded /) => { await btn('Start recording').click(); await page.getByText(/^Recording ·/).waitFor({ timeout: 15000 }); if (mid) await mid(); else await page.waitForTimeout(ms); await btn('Stop').click(); await page.getByText(done).first().waitFor({ timeout: 30000 }); };
  const meta = (path) => page.evaluate(async (b64) => {
    const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
    await new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = () => j(new Error('cannot play')); });
    return { duration: v.duration, w: v.videoWidth, h: v.videoHeight };
  }, readFileSync(path).toString('base64'));

  ok(await page.getByText(/Detected: (X11|Wayland)/).isVisible(), 'Linux display server shown (X11 / Wayland)');
  await page.getByText('3-second countdown').click(); // off for the test
  await recordFor(2200);
  const f1 = await download(page, () => btn('Download').click()), m1 = await meta(f1), i1 = /\.mp4$/.test(f1) ? mp4Info(readFileSync(f1)) : null;
  ok(/\.mp4$/.test(f1) && i1?.video?.codec === 'avc1', `MP4 with H.264 (${i1?.video?.codec}, ${f1.split('/').pop()})`);
  ok(m1.duration > 1.9 && m1.duration < 3.3 && m1.w > 0, `about 2.2 s recorded, has a duration (${m1.duration.toFixed(2)} s, ${m1.w}×${m1.h})`);

  // pause is not counted
  await recordFor(0, async () => { await page.waitForTimeout(1000); await btn('Pause').click(); await page.waitForTimeout(1200); await btn('Resume').click(); await page.waitForTimeout(1000); });
  const m2 = await meta(await download(page, () => btn('Download').click()));
  ok(Math.abs(m2.duration - 2) < 0.5, `pause left out (${m2.duration.toFixed(2)} s for 2 s recorded + 1.2 s paused)`);

  // area: drag the middle of the preview
  await page.getByRole('radio', { name: 'An area (rectangle)' }).click();
  ok(await btn('Start recording').isDisabled(), 'area mode: Start waits for an area');
  const v = page.locator('.sc-preview');
  await page.evaluate(() => scrollBy(0, document.querySelector('.sc-preview').getBoundingClientRect().top - 260)); // below the sticky bars
  const b = await v.boundingBox();
  const vs = await v.evaluate((el) => [el.videoWidth, el.videoHeight]);
  const sc = Math.min(b.width / vs[0], b.height / vs[1]), ox = (b.width - vs[0] * sc) / 2, oy = (b.height - vs[1] * sc) / 2;
  await page.mouse.move(b.x + ox + vs[0] * sc * 0.25, b.y + oy + vs[1] * sc * 0.25); await page.mouse.down();
  await page.mouse.move(b.x + ox + vs[0] * sc * 0.75, b.y + oy + vs[1] * sc * 0.75, { steps: 5 }); await page.mouse.up();
  ok(await page.locator('.sc-sel').isVisible(), 'area drawn on the preview');
  await recordFor(1500);
  const m3 = await meta(await download(page, () => btn('Download').click()));
  ok(Math.abs(m3.w - vs[0] / 2) <= 6 && Math.abs(m3.h - vs[1] / 2) <= 6, `recorded only the area: ${m3.w}×${m3.h} of ${vs[0]}×${vs[1]}`);

  // WebM: remuxed so it has a real duration (raw MediaRecorder WebM reports Infinity)
  await page.getByRole('radio', { name: 'Screen, window or tab' }).click();
  await page.getByRole('combobox', { name: /^Format/ }).selectOption('webm');
  await page.getByText('Add my microphone').click();
  await recordFor(1500);
  const f4 = await download(page, () => btn('Download').click()), m4 = await meta(f4);
  ok(/\.webm$/.test(f4) && readFileSync(f4).readUInt32BE(0) === 0x1a45dfa3, 'WebM file');
  ok(Number.isFinite(m4.duration) && Math.abs(m4.duration - 1.5) < 0.5, `WebM has a duration (${m4.duration})`);
  const hasAudio = await page.evaluate(async () => { const v = document.querySelector('.vid-prev'); return v.mozHasAudio || v.webkitAudioDecodedByteCount > 0 || (v.audioTracks ? v.audioTracks.length > 0 : true); });
  ok(hasAudio, 'microphone mixed in (audio track present)');

  // MP4 with the microphone: the sound is AAC (Linux Chromium's recorder writes Opus into MP4; it is re-encoded)
  await page.getByRole('combobox', { name: /^Format/ }).selectOption('mp4');
  await recordFor(1500);
  const f5 = await download(page, () => btn('Download').click()), i5 = mp4Info(readFileSync(f5)), a5 = probeAudio(f5);
  ok(i5.video?.codec === 'avc1' && i5.audio?.codec === 'mp4a' && (a5 === null || a5 === 'aac'), `MP4 with the microphone: H.264 + AAC (${i5.audio?.codec}${a5 ? `, ffprobe ${a5}` : ''})`);

  // the countdown: a second click on Start does not start a second recorder; sharing ended meanwhile is said
  await page.getByText('Add my microphone').click();
  await page.getByText('3-second countdown').click(); // on again
  const recorders = await page.evaluate(() => { const R = window.MediaRecorder; window.__recs = 0; window.MediaRecorder = class extends R { constructor(...a) { super(...a); window.__recs++; } }; window.MediaRecorder.isTypeSupported = R.isTypeSupported; return true; });
  await btn('Start recording').click({ force: true });
  await page.waitForTimeout(300);
  ok(await btn('Start recording').isDisabled(), 'Start cannot be pressed again during the countdown');
  await btn('Start recording').click({ force: true }).catch(() => {});
  await page.getByText(/^Recording ·/).waitFor({ timeout: 15000 });
  await page.waitForTimeout(800); await btn('Stop').click(); await page.getByText(/^Recorded /).first().waitFor({ timeout: 30000 });
  ok(recorders && await page.evaluate(() => window.__recs) === 1, `one recorder for a double press (${await page.evaluate(() => window.__recs)})`);
  await btn('Start recording').click();
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('.sc-preview').srcObject.getVideoTracks()[0].stop());
  await page.getByText('Sharing ended before the recording started.').waitFor({ timeout: 8000 }).catch(() => {});
  ok(await page.getByText('Sharing ended before the recording started.').isVisible(), 'sharing ended during the countdown: said, nothing recorded');
  await page.getByText('3-second countdown').click(); // off

  // straight to a file
  await page.getByText('Save straight to a file while recording').click();
  await recordFor(1500, null, /^Saved screencast-/);
  const w = await page.evaluate(() => [window.__written, window.__closed]);
  ok(w[0] > 5000 && w[1] === true, `streamed to the file while recording (${w[0]} bytes, closed)`);
  ok(await page.getByText(/Saved straight to screencast-/).isVisible(), 'saved message');
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);
  // leaving the tab lets go of what it made: its results' blob URLs (they kept the files in memory until the page reloaded)
  { const had = await page.evaluate((id) => [...window.__blobs.values()].filter((b) => b.at.startsWith(`#/${id}`) && !b.download && !/javascript/.test(b.type)).length, 'screencast');
    const kept = await released(page, 'screencast');
    ok(kept.length === 0, `leaving the tab: ${had} blob URLs it held are let go (${kept.length} kept${kept.length ? ': ' + kept.map((b) => `${b.type} ${Math.round(b.size / 1024)} KB ${b.from}`).join(', ') : ''})`); }
};
