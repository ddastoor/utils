// Microphone Test (#/mic): raw capture requested (no echo cancellation / noise suppression / AGC), level meter = peak
// of a known fake input (0.5 → 50 %, 0 → 0 %, overload → 100 %), waveform drawn, "Record 5 s" gives a ~5 s recording
// that decodes to the input tone (440 Hz by zero crossings), restart stops the old stream, permission messages,
// stream + AudioContext released when the tab is left, Chromium's real fake microphone (sample rate row), phone layout.
import { phoneLayout } from './_phone.mjs';
import { fakeMedia, allStopped, trackAudioContexts } from './_media.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage({ permissions: ['microphone'] });
  await page.addInitScript(trackAudioContexts); await page.addInitScript(fakeMedia, { freq: 440, amp: 0.5 });
  await page.goto(`${base}#/mic`);
  const btn = (n) => page.getByRole('button', { name: n, exact: true }); await btn('Start').waitFor();
  const meter = () => page.locator('.meter > span').evaluate((e) => parseFloat(e.style.width) || 0);
  const settle = () => page.waitForTimeout(400);
  ok(await page.evaluate(() => window.__gumCalls.length) === 0, 'nothing requested before Start');
  await btn('Start').click(); await page.locator('.kv').waitFor(); await settle();
  const gum = await page.evaluate(() => window.__gumCalls[0]);
  ok(gum.audio.echoCancellation === false && gum.audio.noiseSuppression === false && gum.audio.autoGainControl === false && !gum.video, 'raw microphone requested (no echo cancellation, noise suppression or auto gain)');
  let m = await meter(); ok(m > 45 && m <= 51, `meter shows the peak of a 0.5 sine ≈ 50 % (${m.toFixed(1)} %)`);
  const ink = await page.locator('canvas.wave').evaluate((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  ok(ink > 500, `waveform drawn (${ink} pixels)`);
  await page.evaluate(() => (window.__gain.gain.value = 0)); await settle(); m = await meter(); ok(m < 1, `silence → meter at 0 (${m.toFixed(1)} %)`);
  await page.evaluate(() => (window.__gain.gain.value = 1.6)); await settle(); m = await meter(); ok(m === 100, `overload is capped at 100 % (${m} %)`);
  await page.evaluate(() => (window.__gain.gain.value = 0.25)); await settle(); m = await meter(); ok(m > 21 && m <= 26, `0.25 → 25 % (${m.toFixed(1)} %)`);
  await btn('Start').click(); await settle();
  ok(await page.evaluate(() => window.__tracks.length === 2 && window.__tracks[0].readyState === 'ended' && window.__tracks[1].readyState === 'live'), 'Start again replaces the stream (old one stopped)');
  await page.evaluate(() => (window.__gain.gain.value = 0.5));
  await btn('Record 5 s').click();
  ok(/Recording 5 seconds/.test(await page.locator('.card', { hasText: 'Playback test' }).textContent()), '"Recording 5 seconds… speak now."');
  await page.locator('audio').waitFor({ timeout: 9000 });
  const rec = await page.evaluate(async () => {
    const a = document.querySelector('audio'), buf = await (await fetch(a.src)).arrayBuffer();
    const d = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(buf), ch = d.getChannelData(0);
    const s0 = Math.floor(d.sampleRate * 0.5), s1 = Math.floor(d.sampleRate * 4.5); let z = 0, peak = 0;
    for (let i = s0 + 1; i < s1; i++) { if ((ch[i - 1] < 0) !== (ch[i] < 0)) z++; peak = Math.max(peak, Math.abs(ch[i])); }
    return { dur: d.duration, hz: z / 2 / ((s1 - s0) / d.sampleRate), peak, controls: a.controls };
  });
  ok(rec.dur > 4.6 && rec.dur < 5.6, `recording lasts ~5 s (${rec.dur.toFixed(2)} s)`);
  ok(Math.abs(rec.hz - 440) < 3 && rec.peak > 0.3, `recording is the input tone: ${rec.hz.toFixed(1)} Hz, peak ${rec.peak.toFixed(2)}`);
  ok(rec.controls, 'playback has player controls');
  await page.goto(`${base}#/screen`); await page.locator('.kv').first().waitFor(); await page.waitForTimeout(200);
  ok(await allStopped(page), 'leaving the tab stops the microphone');
  ok(await page.evaluate(() => window.__acs.filter((a) => !a.__fake && a.state !== 'closed').length === 0), 'leaving the tab closes its AudioContext');
  await page.goto(`${base}#/mic`); await btn('Start').waitFor();
  await page.evaluate(() => (window.__gumError = 'NotAllowedError')); await btn('Start').click();
  ok(/Permission was denied/.test(await page.locator('.note-err').textContent()), 'permission denied → how to allow it');
  await page.evaluate(() => { window.__gumError = null; window.__realGum = true; }); await btn('Start').click(); await page.locator('.kv').waitFor();
  const real = await page.evaluate(() => window.__tracks.at(-1).getSettings());
  const rows = await page.evaluate(() => [...document.querySelectorAll('.kv > span')].map((e) => e.textContent));
  ok(rows[rows.indexOf('Sample rate') + 1] === (real.sampleRate ? `${real.sampleRate} Hz` : '—') && /fake|default/i.test(rows[rows.indexOf('Microphone') + 1]), `real fake microphone: ${rows.join(' ')}`);
  ok(await page.locator('.note-err').count() === 0, 'old error cleared after a successful start');
  // Record twice in a row: one recording (a second one ran over the first)
  await page.evaluate(() => { window.__realGum = false; window.__rec = 0; const S = MediaRecorder.prototype.start; MediaRecorder.prototype.start = function (...a) { window.__rec++; return S.apply(this, a); }; });
  await btn('Start').click(); await page.locator('.kv').waitFor();
  await btn('Record 5 s').click(); await btn('Record 5 s').click(); await page.waitForTimeout(200);
  ok(await page.evaluate(() => window.__rec) === 1, `Record pressed twice: one recording (${await page.evaluate(() => window.__rec)})`);
  // the tab left during a recording: nothing plays afterwards
  await page.evaluate(() => { window.__played = 0; const P = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__played++; return P.call(this); }; });
  await page.goto(`${base}#/screen`); await page.locator('.kv').first().waitFor(); await page.waitForTimeout(800);
  ok(await page.evaluate(() => window.__played) === 0 && await allStopped(page), 'the tab left during a recording: the microphone stops and the recording does not play (it played after the tab was left)');
  // Start and a microphone chosen while the browser asks: one live stream
  await page.goto(`${base}#/mic`); await btn('Start').waitFor(); await page.evaluate(() => { window.__gumDelay = 300; });
  const n0 = await page.evaluate(() => window.__tracks.length);
  await btn('Start').click(); await btn('Record 5 s').click();
  await page.waitForFunction((n) => window.__tracks.length >= n + 2, n0, { timeout: 5000 }).catch(() => {}); await page.waitForTimeout(200);
  const live = await page.evaluate((n) => window.__tracks.slice(n).filter((t) => t.readyState === 'live').length, n0);
  ok(live === 1, `two requests while the browser asks: one live microphone stream (${live})`);
  await page.evaluate(() => { window.__gumDelay = 0; });
  await page.goto(`${base}#/screen`); await page.locator('.kv').first().waitFor(); await page.waitForTimeout(300);
  ok(await allStopped(page), 'and leaving stops it');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await phoneLayout(ctx, 'mic', { ready: '.meter', buttons: ['Start', 'Record 5 s'] });
};
