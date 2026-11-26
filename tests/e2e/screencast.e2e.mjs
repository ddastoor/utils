// Screencast (#/screencast, PC): getDisplayMedia (Chromium's fake picker picks the screen) → MediaRecorder → remuxed
// file. Checks length (pause excluded), area crop size, WebM with a real duration, mic track, streaming to a file.
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from '../lib/child.mjs';
import { mp4Info } from './video.e2e.mjs';
import { fakeMedia } from './_media.mjs';
const probeAudio = (f) => { try { return execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim(); } catch { return null; } };

export default async ({ base, page: newPage, ok, info, download, released }) => {
  const page = await newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => { // what every share asked the browser for (the pointer setting)
    // and what the browser reports back: Chrome's test screen reports "never" whatever is asked (it has no pointer), so
    // the suite decides — 'echo' (what was asked), a value, or 'none' (a browser that reports nothing)
    const gdm = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices); window.__gdm = []; window.__cursorReport = 'echo';
    navigator.mediaDevices.getDisplayMedia = async (c) => {
      window.__gdm.push(JSON.parse(JSON.stringify(c || {})));
      const s = await gdm(c), t = s.getVideoTracks()[0], gs = t.getSettings.bind(t), m = window.__cursorReport;
      t.getSettings = () => { const r = gs(); if (m === 'echo') r.cursor = c?.video?.cursor; else if (m === 'none') delete r.cursor; else r.cursor = m; return r; };
      return s;
    };
  });
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

  // the X11 / Wayland note on Linux only — the suite runs on Linux and on the Windows runner (the os suite stands in for
  // each system in every tab)
  const onLinux = await page.evaluate(() => /Linux/.test(navigator.userAgent));
  const noted = await page.getByText(/Detected: (X11|Wayland)/).waitFor({ timeout: onLinux ? 10000 : 1500 }).then(() => true, () => false); // (it was read at once: under load, before it was drawn)
  ok(noted === onLinux, onLinux ? 'Linux display server shown (X11 / Wayland)' : 'no X11 / Wayland note on Windows');
  const radio = (name, p = page) => p.getByRole('radio', { name, exact: true });
  const countNow = () => page.getByRole('radiogroup').filter({ has: radio('8 s') }).getByRole('radio', { checked: true }).textContent();
  // the countdown (to-do #21: "add … a 5-second countdown, an 8-second countdown, and a custom countdown in seconds")
  const counts = await page.getByRole('radiogroup').filter({ has: radio('8 s') }).getByRole('radio').allTextContents();
  ok(counts.join(' · ') === 'Off · 3 s · 5 s · 8 s · Custom' && await countNow() === '3 s', `countdown: ${counts.join(' · ')}, 3 s first chosen`);
  await radio('Off').click(); // off for the tests that record
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
  const f3 = await download(page, () => btn('Download').click()), m3 = await meta(f3);
  ok(Math.abs(m3.w - vs[0] / 2) <= 6 && Math.abs(m3.h - vs[1] / 2) <= 6, `recorded only the area: ${m3.w}×${m3.h} of ${vs[0]}×${vs[1]}`);
  { const raw = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.7', '-i', f3, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 26 });
    const mean = raw.reduce((a, v) => a + v, 0) / raw.length;
    ok(raw.length > 1000 && mean > 20, `the area recording of Chromium's own test screen (I420 frames) holds its picture, not black (mean grey ${mean.toFixed(1)})`); }

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
  await radio('3 s').click(); // on again
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
  // 5 s: the recording begins after five seconds; Cancel (on the page) ends the countdown without a recording; a custom
  // number is whole seconds 1 – 120, refused with the reason otherwise; the choice is kept through another tab
  const startsAfter = async () => { const t = Date.now(); await btn('Start recording').click(); await page.getByText(/^Recording ·/).waitFor({ timeout: 20000 }); const s = (Date.now() - t) / 1000; await btn('Stop').click(); await page.getByText(/^Recorded /).first().waitFor({ timeout: 30000 }); return s; };
  await radio('5 s').click();
  const s5 = await startsAfter();
  ok(s5 > 4.6 && s5 < 7, `a 5 s countdown: the recording began ${s5.toFixed(1)} s after Start`);
  await page.evaluate(() => { window.__recs = 0; });
  await btn('Start recording').click();
  await page.getByText(/^Starting in [45]…/).waitFor({ timeout: 5000 });
  await btn('Cancel').click();
  await page.getByText('Cancelled.', { exact: true }).waitFor({ timeout: 5000 });
  await page.waitForTimeout(1200);
  ok(await page.evaluate(() => window.__recs) === 0 && await btn('Start recording').isEnabled() && !(await btn('Cancel').isVisible()), 'Cancel during the countdown: "Cancelled.", no recording, Start again');
  await radio('Custom').click();
  const secs = page.getByLabel('Countdown in seconds');
  for (const bad of ['0', '2.5', '121', '']) {
    await secs.fill(bad);
    ok(await page.getByText('Whole seconds, 1 to 120.').isVisible() && await secs.getAttribute('aria-invalid') === 'true', `a custom countdown of "${bad}": "Whole seconds, 1 to 120."`);
  }
  await btn('Start recording').click();
  ok(await page.getByText('The countdown is whole seconds, 1 to 120 — or choose Off.').isVisible() && await page.evaluate(() => window.__recs) === 0, 'Start with a wrong custom countdown: refused with the reason, nothing recorded');
  await secs.fill('2');
  ok(!(await page.getByText('Whole seconds, 1 to 120.').isVisible()), 'a custom countdown of 2 s is taken');
  const s2 = await startsAfter();
  ok(s2 > 1.6 && s2 < 4, `a custom 2 s countdown: the recording began ${s2.toFixed(1)} s after Start`);
  // the countdown in a small window that stays on top (Document Picture-in-Picture, where the browser has it): its number,
  // "Start now" starts at once, Cancel ends it — and it is closed before the recording begins (never in the recording)
  await radio('5 s').click();
  { const t = Date.now(); await btn('Start recording').click();
    const pipN = () => page.evaluate(() => window.documentPictureInPicture?.window?.document.getElementById('n')?.textContent ?? null);
    const opened = await page.waitForFunction(() => /^[2-5]$/.test(window.documentPictureInPicture?.window?.document.getElementById('n')?.textContent ?? ''), null, { timeout: 3000 }).then(() => true, () => false);
    info(`the countdown window: ${opened ? `opened (showing ${await pipN()})` : 'not available in this browser — the countdown is in the page'}`);
    if (opened) {
      await page.evaluate(() => window.documentPictureInPicture.window.document.getElementById('s').click());
      await page.getByText(/^Recording ·/).waitFor({ timeout: 5000 });
      const s = (Date.now() - t) / 1000;
      ok(s < 3.5 && await page.evaluate(() => !window.documentPictureInPicture.window), `"Start now" in the countdown window starts the recording at once (${s.toFixed(1)} s), the window closed before it`);
      await btn('Stop').click(); await page.getByText(/^Recorded /).first().waitFor({ timeout: 30000 });
      await btn('Start recording').click();
      await page.waitForFunction(() => !!window.documentPictureInPicture?.window?.document.getElementById('c'), null, { timeout: 3000 });
      await page.evaluate(() => window.documentPictureInPicture.window.document.getElementById('c').click());
      await page.getByText('Cancelled.', { exact: true }).waitFor({ timeout: 5000 });
      ok(await page.evaluate(() => !window.documentPictureInPicture.window) && !(await page.getByText(/^Recording ·/).isVisible()), 'Cancel in the countdown window: no recording, the window closed');
    } else { await page.getByText(/^Recording ·/).waitFor({ timeout: 10000 }); await btn('Stop').click(); await page.getByText(/^Recorded /).first().waitFor({ timeout: 30000 }); }
  }
  await radio('8 s').click();
  await page.goto(`${base}#/screenshot`); await page.getByRole('heading', { name: /Screenshot/ }).first().waitFor();
  await page.goto(`${base}#/screencast`); await radio('Off').waitFor();
  ok(await countNow() === '8 s', `the countdown chosen is kept through another tab (${await countNow()})`);
  await radio('Off').click();

  // the mouse pointer (owner, 21 Nov 2026: "add an option to exclude the mouse"): asked for when sharing starts; Chrome
  // keeps a live track's setting, so a change on an open share ends it and the next share has it
  const cursors = () => page.evaluate(() => window.__gdm.map((c) => c.video?.cursor));
  ok((await cursors()).every((c) => c === 'always'), `the pointer is in the picture by default (cursor: ${[...new Set(await cursors())].join(', ')})`);
  const pointerSw = page.locator('label.switch', { hasText: 'Show the mouse pointer' });
  const hintNow = () => page.locator('.sc-hint').textContent();
  const choose = async (word) => { await page.locator('.actions').getByRole('button', { name: /^Choose (what to record|again)$/ }).click(); await page.waitForFunction((w) => document.querySelector('.sc-preview')?.srcObject && document.querySelector('.sc-hint').textContent.includes(w), word, { timeout: 15000 }); };
  await choose('mouse pointer');
  ok(/ · with the mouse pointer$/.test(await hintNow()), `the share says the pointer is in (${await hintNow()})`);
  await pointerSw.click();
  await page.getByText('The mouse pointer is set when sharing starts: choose what to record again.').waitFor({ timeout: 5000 });
  ok(await page.locator('.sc-preview').evaluate((v) => !v.srcObject) && await btn('Choose what to record').isVisible(), 'switched off on an open share: that share ends (its pointer could not change)');
  await choose('mouse pointer');
  ok((await cursors()).at(-1) === 'never' && / · no mouse pointer$/.test(await hintNow()), `the next share asks for no pointer, and the browser's answer is shown (${(await cursors()).at(-1)}; ${await hintNow()})`);
  await page.evaluate(() => (window.__cursorReport = 'motion'));
  await choose('mouse pointer');
  ok(/with the mouse pointer: this browser keeps it in, though it was asked to leave it out/.test(await hintNow()), `a browser that keeps the pointer in is said to (${await hintNow()})`);
  await page.evaluate(() => (window.__cursorReport = 'none'));
  await choose('mouse pointer');
  ok(/this browser may still record the mouse pointer/.test(await hintNow()), `a browser that reports nothing: "may still record" (${await hintNow()})`);
  await page.evaluate(() => (window.__cursorReport = 'echo'));
  await choose('mouse pointer');
  // the switch flipped while the share is still starting (Chrome's picker open): that share is not kept with the old
  // setting, the tab does not wait for ever, and the next share asks with the new one
  await btn('Choose again').click(); await pointerSw.click();
  await page.getByText('The mouse pointer is set when sharing starts: choose what to record again.').waitFor({ timeout: 8000 });
  ok(await page.locator('.sc-preview').evaluate((v) => !v.srcObject), 'switched while a share was starting: that share is not kept');
  await choose('mouse pointer');
  ok(/ · with the mouse pointer$/.test(await hintNow()) && (await cursors()).at(-1) === 'always', `switched during a starting share: the next share works and asks again (${(await cursors()).at(-1)})`);
  await btn('Start recording').click(); await page.getByText(/^Recording ·/).waitFor({ timeout: 15000 });
  ok(await pointerSw.locator('input').isDisabled() && await page.getByRole('combobox', { name: /^Frame rate/ }).isDisabled(), 'the pointer switch and the frame rate are locked while recording');
  await btn('Stop').click(); await page.getByText(/^Recorded /).first().waitFor({ timeout: 30000 });
  await page.getByRole('combobox', { name: /^Frame rate/ }).selectOption('15');
  await page.waitForTimeout(300);
  ok(await page.locator('.sc-preview').evaluate((v) => !!v.srcObject && v.srcObject.getVideoTracks()[0].readyState === 'live'), 'a new frame rate is applied to the open share (it stays)');
  await page.getByRole('combobox', { name: /^Frame rate/ }).selectOption('30');

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

  // an area recording holds the rectangle and only it, at 1:1 (owner, 21 Nov 2026: "can you confirm that if I record the
  // screen in a rectangular area, only the rectangular area becomes the full screen of the video?"). The size check
  // above would also pass a shrunk copy of the whole screen: here the "screen" is a known picture — red all round, four
  // colours in its middle half — and the recording's own pixels are read back (ffmpeg).
  const p2 = await newPage({ viewport: { width: 1280, height: 900 } });
  await p2.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
      const g = c.getContext('2d');
      const draw = () => {
        g.fillStyle = '#ff0000'; g.fillRect(0, 0, 1280, 720);
        for (const [x, y, col] of [[320, 180, '#0000ff'], [640, 180, '#00ff00'], [320, 360, '#ffff00'], [640, 360, '#ff00ff']]) { g.fillStyle = col; g.fillRect(x, y, 320, 180); }
      };
      draw(); setInterval(draw, 33); // a canvas sends a frame when it is drawn
      return c.captureStream(30);
    };
  });
  await p2.goto(`${base}#/screencast`);
  const btn2 = (name) => p2.locator('.actions').getByRole('button', { name, exact: true });
  await radio('Off', p2).click();
  await p2.getByRole('radio', { name: 'An area (rectangle)' }).click();
  await btn2('Choose a screen').click();
  const v2 = p2.locator('.sc-preview');
  await v2.waitFor();
  await p2.waitForFunction(() => document.querySelector('.sc-preview')?.videoWidth > 0);
  await p2.evaluate(() => scrollBy(0, document.querySelector('.sc-preview').getBoundingClientRect().top - 260));
  const b2 = await v2.boundingBox(), vs2 = await v2.evaluate((el) => [el.videoWidth, el.videoHeight]);
  const sc2 = Math.min(b2.width / vs2[0], b2.height / vs2[1]), ox2 = (b2.width - vs2[0] * sc2) / 2, oy2 = (b2.height - vs2[1] * sc2) / 2;
  await p2.mouse.move(b2.x + ox2 + vs2[0] * sc2 * 0.25, b2.y + oy2 + vs2[1] * sc2 * 0.25); await p2.mouse.down();
  await p2.mouse.move(b2.x + ox2 + vs2[0] * sc2 * 0.75, b2.y + oy2 + vs2[1] * sc2 * 0.75, { steps: 5 }); await p2.mouse.up();
  const area2 = (await p2.locator('.sc-hint').textContent()).match(/Area (\d+)×(\d+) at (\d+),(\d+)/)?.slice(1).map(Number);
  await btn2('Start recording').click(); await p2.getByText(/^Recording ·/).waitFor({ timeout: 15000 });
  await p2.waitForTimeout(1500); await btn2('Stop').click(); await p2.getByText(/^Recorded /).first().waitFor({ timeout: 30000 });
  const f6 = await download(p2, () => btn2('Download').click());
  const [W, H] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f6], { encoding: 'utf8' }).trim().split(',').map(Number);
  ok(area2 && W === area2[0] && H === area2[1] && Math.abs(W - 640) <= 6 && Math.abs(H - 360) <= 6, `the video is the rectangle's size: ${W}×${H} (area ${area2?.join(', ')})`);
  const rgb = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.7', '-i', f6, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
  const px = (x, y) => { const i = (Math.round(y) * W + Math.round(x)) * 3; return [rgb[i], rgb[i + 1], rgb[i + 2]]; };
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 48);
  const want = { blue: [0, 0, 255], green: [0, 255, 0], yellow: [255, 255, 0], magenta: [255, 0, 255] };
  const at = { 'top left corner': [10, 10, 'blue'], 'top right corner': [W - 11, 10, 'green'], 'bottom left corner': [10, H - 11, 'yellow'], 'bottom right corner': [W - 11, H - 11, 'magenta'],
    'left of the middle line': [W / 2 - 12, H / 4, 'blue'], 'right of the middle line': [W / 2 + 12, H / 4, 'green'], 'above the middle line': [W / 4, H / 2 - 12, 'blue'], 'below the middle line': [W / 4, H / 2 + 12, 'yellow'] };
  const wrong = Object.entries(at).filter(([, [x, y, c]]) => !near(px(x, y), want[c])).map(([k, [x, y, c]]) => `${k}: ${px(x, y).join('/')} instead of ${c}`);
  ok(rgb.length === W * H * 3 && !wrong.length, `the recording's pixels are the rectangle at 1:1 — its corners are the area's colours, none of the red around it, and the area's middle lines fall on the video's middle (${wrong.join('; ') || 'all eight points right'})`);
  ok(!p2.errors.length, `no page errors in the pattern recording ${p2.errors.slice(0, 3).join(' | ')}`);

  // the sound level (to-do #21: "the volume of the output video seemed a little lower than the normal"): a known tone as
  // the shared sound (440 Hz, amplitude 0.3, both sides) and another as the microphone (1 kHz, 0.2), recorded as MP4 and
  // WebM, with and without the microphone; each tone's amplitude in the file is read back (ffmpeg decodes, a Goertzel
  // filter at the tone's frequency over the middle second) and must be the one played, within 0.5 dB — the recording,
  // the mix with the microphone and an MP4's sound re-encoded as AAC change no level
  const p3 = await newPage({ viewport: { width: 1280, height: 900 } });
  await p3.addInitScript(fakeMedia, { freq: 1000, amp: 0.2 });
  await p3.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 360; const g = c.getContext('2d');
      const draw = () => { g.fillStyle = '#1e1b4b'; g.fillRect(0, 0, 640, 360); g.fillStyle = '#fff'; g.fillRect((Date.now() / 5) % 600, 150, 40, 40); };
      draw(); setInterval(draw, 33);
      const ac = new AudioContext(); await ac.resume();
      const o = ac.createOscillator(), gn = ac.createGain(), d = ac.createMediaStreamDestination();
      o.frequency.value = 440; gn.gain.value = window.__sharedAmp ?? 0.3; o.connect(gn).connect(d); o.start();
      // a level that changes (window.__sharedSwing: the amplitude doubles every other second) has a loudness range — the
      // steady tone has none, and FFmpeg's loudnorm then uses its dynamic mode
      if (window.__sharedSwing) { let hi = false; setInterval(() => { hi = !hi; gn.gain.value = (window.__sharedAmp ?? 0.3) * (hi ? 2 : 1); }, 1000); }
      window.__sharedAc = ac;
      return new MediaStream([...c.captureStream(30).getVideoTracks(), ...d.stream.getAudioTracks()]);
    };
  });
  await p3.goto(`${base}#/screencast`);
  const btn3 = (name) => p3.locator('.actions').getByRole('button', { name, exact: true });
  await radio('Off', p3).click();
  /** each channel's amplitude of a tone, from the decoded file's middle second (48 kHz: the tones fall on whole bins) */
  const tone = (f, hz) => {
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-ss', '1', '-t', '1', '-i', f, '-vn', '-ac', '2', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 1 << 26 });
    const x = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4), N = Math.floor(x.length / 2);
    return [0, 1].map((ch) => { let re = 0, im = 0; for (let n = 0; n < N; n++) { const v = x[2 * n + ch], a = (2 * Math.PI * hz * n) / 48000; re += v * Math.cos(a); im -= v * Math.sin(a); } return (2 * Math.hypot(re, im)) / N; });
  };
  const db = (a, ref) => 20 * Math.log10(a / ref);
  const haveFF = spawnSync('ffmpeg', ['-version']).status === 0;
  for (const [fmt, mic] of [['mp4', false], ['mp4', true], ['webm', false], ['webm', true]]) {
    await p3.getByRole('combobox', { name: /^Format/ }).selectOption(fmt);
    const micSw = p3.locator('label.switch', { hasText: 'Add my microphone' }).locator('input');
    if ((await micSw.isChecked()) !== mic) await p3.getByText('Add my microphone').click();
    await btn3('Start recording').click(); await p3.getByText(/^Recording ·/).waitFor({ timeout: 15000 });
    await p3.waitForTimeout(3200); await btn3('Stop').click(); await p3.getByText(/^Recorded /).first().waitFor({ timeout: 30000 });
    const f = await download(p3, () => btn3('Download').click());
    if (!haveFF) { ok(true, `${fmt}${mic ? ' with the microphone' : ''}: recorded (no native FFmpeg here — the level is not measured)`); continue; }
    const t440 = tone(f, 440).map((a) => db(a, 0.3)), t1k = mic ? tone(f, 1000).map((a) => db(a, 0.2)) : [];
    const all = [...t440, ...t1k], line = `${fmt.toUpperCase()}${mic ? ' with the microphone' : ''}: the shared tone ${t440.map((d) => `${d >= 0 ? '+' : ''}${d.toFixed(2)}`).join(' / ')} dB${mic ? `, the microphone's ${t1k.map((d) => `${d >= 0 ? '+' : ''}${d.toFixed(2)}`).join(' / ')} dB` : ''} (left / right, against what was played)`;
    ok(all.every((d) => Math.abs(d) <= 0.5), line);
    info(`sound level — ${line}`);
  }
  // "Bring the sound to a normal loudness" (owner, 26 Nov 2026: "Yes"): a quiet recording (the tone at 0.03 — about −31 LUFS)
  // made −16 LUFS by FFmpeg's loudnorm, the picture's packets the original's byte for byte (ffmpeg's md5 of the video
  // stream, copied), "Download the original" kept; a recording already at −16 LUFS is left as it is and said so
  const r128 = (f) => { const e = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', f, '-map', '0:a:0', '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' }).stderr; return +/I:\s+(-?[\d.]+) LUFS/.exec(e.slice(e.lastIndexOf('Summary:')))?.[1]; };
  const vmd5 = (f) => execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-map', '0:v:0', '-c', 'copy', '-f', 'md5', '-'], { encoding: 'utf8' }).trim();
  const loudBtn = () => p3.getByRole('button', { name: 'Bring the sound to a normal loudness' });
  if ((await p3.locator('label.switch', { hasText: 'Add my microphone' }).locator('input').isChecked())) await p3.getByText('Add my microphone').click();
  for (const [fmt, swing] of [['mp4', true], ['webm', false]]) {
    await p3.evaluate((sw) => { window.__sharedAmp = 0.02; window.__sharedSwing = sw; }, swing);
    await p3.getByRole('combobox', { name: /^Format/ }).selectOption(fmt);
    await btn3('Choose again').click().catch(() => {}); // a new share: the tone at its new level
    await p3.waitForFunction(() => document.querySelector('.sc-preview')?.srcObject, null, { timeout: 15000 });
    await btn3('Start recording').click(); await p3.getByText(/^Recording ·/).waitFor({ timeout: 15000 });
    await p3.waitForTimeout(swing ? 8200 : 3200); await btn3('Stop').click(); await p3.getByText(/^Recorded /).first().waitFor({ timeout: 30000 });
    await loudBtn().click();
    await p3.getByText(/^The sound: .* LUFS/).waitFor({ timeout: 240000 }).catch(() => {});
    const said = await p3.locator('.card', { hasText: 'Recording' }).locator('[aria-live]').last().textContent();
    const after = await download(p3, () => btn3('Download').click()), orig = await download(p3, () => p3.getByRole('button', { name: 'Download the original' }).click());
    if (!haveFF) { ok(/^The sound: /.test(said), `${fmt}: the sound brought up (${said})`); continue; }
    const a = r128(orig), b = r128(after), same = vmd5(orig) === vmd5(after), codec = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,channels', '-of', 'csv=p=0', after], { encoding: 'utf8' }).trim();
    ok(Math.abs(b + 16) <= 0.5 && a < -28 && same && codec === (fmt === 'mp4' ? 'aac,2' : 'opus,2') && !(await loudBtn().isVisible()) && (swing ? /one gain for the whole recording/ : /its dynamic mode/).test(said),
      `${fmt.toUpperCase()}: the sound ${a} → ${b} LUFS (${codec}), the picture's packets the original's: ${same} — "${said}"`);
    info(`normal loudness — ${fmt.toUpperCase()}: ${a} → ${b} LUFS (${codec}), picture packets identical: ${same}; the tab: "${said}"`);
  }
  await p3.evaluate(() => { window.__sharedAmp = 0.172; window.__sharedSwing = false; }); // about −16 LUFS already
  await btn3('Choose again').click(); await p3.waitForFunction(() => document.querySelector('.sc-preview')?.srcObject, null, { timeout: 15000 });
  await btn3('Start recording').click(); await p3.getByText(/^Recording ·/).waitFor({ timeout: 15000 });
  await p3.waitForTimeout(3200); await btn3('Stop').click(); await p3.getByText(/^Recorded /).first().waitFor({ timeout: 30000 });
  await loudBtn().click();
  await p3.getByText(/already at a normal loudness/).waitFor({ timeout: 240000 }).catch(() => {});
  ok(await p3.getByText(/already at a normal loudness \(-1[56]\.\d LUFS\): nothing was changed/).isVisible(), 'a recording already at −16 LUFS: said, nothing changed');
  ok(!p3.errors.length, `no page errors in the level recordings ${p3.errors.slice(0, 3).join(' | ')}`);
};
