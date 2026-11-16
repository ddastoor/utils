// YouTube Clip (#/youtube, PC): link/time parsing, the yt-dlp command, and recording through the embedded player.
// YouTube is never contacted: Playwright serves a fake youtube-nocookie.com player that speaks the IFrame API's
// postMessage protocol (listening → onReady / infoDelivery; seekTo / playVideo / pauseVideo / mute / unMute) and draws
// its current time; the recording is checked for its length and the reported crop state.
import { readFileSync } from 'node:fs';
const FAKE = `<!doctype html><html><body style="margin:0;background:#000;overflow:hidden">
<canvas id="c" width="640" height="360" style="width:100vw;height:100vh;display:block"></canvas><script>
const q = new URLSearchParams(location.search); let t = +q.get('start') || 0, playing = false, last = performance.now();
const post = (o) => parent.postMessage(JSON.stringify(o), '*');
addEventListener('message', (e) => { let d; try { d = JSON.parse(e.data); } catch { return; }
  if (d.event === 'listening') { post({ event: 'onReady', id: 1, channel: 'widget' }); post({ event: 'initialDelivery', info: { currentTime: t, playerState: 5 } }); }
  if (d.event === 'command') { window.cmds = (window.cmds || []).concat(d.func);
    if (d.func === 'seekTo') t = d.args[0]; if (d.func === 'playVideo') playing = true; if (d.func === 'pauseVideo') playing = false;
    post({ event: 'onStateChange', info: playing ? 1 : 2 }); } });
const g = document.getElementById('c').getContext('2d');
(function frame(now) { if (playing) t += (now - last) / 1000; last = now;
  g.fillStyle = 'hsl(' + Math.round((t * 90) % 360) + ' 85% 50%)'; g.fillRect(0, 0, 640, 360);
  g.fillStyle = '#fff'; g.font = 'bold 120px sans-serif'; g.fillText(t.toFixed(1), 120, 230); requestAnimationFrame(frame); })(last);
setInterval(() => post({ event: 'infoDelivery', info: { currentTime: t, playerState: playing ? 1 : 2 } }), 100);
</script></body></html>`;

export default async ({ base, page: newPage, ok, info, download }) => {
  const page = await newPage({ viewport: { width: 1280, height: 1000 } });
  const hits = [];
  await page.route('https://www.youtube-nocookie.com/**', (route) => { hits.push(route.request().url()); route.fulfill({ status: 200, contentType: 'text/html', body: FAKE }); });
  await page.goto(`${base}#/youtube`);
  const summary = () => page.locator('[aria-live]').filter({ hasText: /Video |link|end|Enter/ }).first().textContent();

  // parsing
  await page.getByLabel('Video link').fill('https://youtu.be/dQw4w9WgXcQ?t=62');
  ok(/Now paste the link copied at the end/.test(await summary()), 'asks for the end link');
  await page.getByLabel('End link').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s&si=abc');
  ok((await summary()) === 'Video dQw4w9WgXcQ · from 1:02 to 1:30 (0:28)', `two links → ${await summary()}`);
  const cmd = await page.locator('.outbox textarea').inputValue();
  ok(cmd === 'yt-dlp --download-sections "*62-90" -f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]" --merge-output-format mp4 -o "%(title)s [1.02-1.30].%(ext)s" "https://www.youtube.com/watch?v=dQw4w9WgXcQ"', `yt-dlp command: ${cmd}`);
  await page.getByText('Sound only (MP3)').click();
  ok(/-x --audio-format mp3/.test(await page.locator('.outbox textarea').inputValue()), 'sound-only command');
  await page.getByLabel('End link').fill('https://youtu.be/aaaaaaaaaaa?t=90');
  ok(/different videos/.test(await summary()), 'different videos refused');
  await page.getByRole('radio', { name: 'One link + times' }).click();
  await page.getByLabel('Video link').fill('https://www.youtube.com/shorts/dQw4w9WgXcQ');
  await page.getByLabel('Start time').fill('1:02:03'); await page.getByLabel('End time').fill('3725.5');
  ok((await summary()) === 'Video dQw4w9WgXcQ · from 1:02:03 to 1:02:05.5 (0:02)', `shorts link + h:mm:ss → ${await summary()}`);
  await page.getByLabel('End time').fill('1:00');
  ok(/end must be after/.test(await summary()), 'end before start refused');
  ok(!hits.length, 'nothing loaded from YouTube before “Load the player”');

  // record 2 s → 5 s through the (fake) player
  await page.getByLabel('Video link').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.getByLabel('Start time').fill('2'); await page.getByLabel('End time').fill('5');
  await page.getByRole('button', { name: 'Load the player' }).click();
  await page.getByRole('button', { name: 'Record clip' }).waitFor();
  ok(hits.length === 1 && /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?enablejsapi=1&start=2/.test(hits[0]), `privacy-enhanced embed requested (${hits[0]?.slice(0, 80)})`);
  await page.getByRole('button', { name: 'Record clip' }).click();
  await page.getByText('Done.').waitFor({ timeout: 40000 });
  const cmds = await page.frameLocator('.yt-frame').locator('body').evaluate(() => window.cmds || []);
  ok(['mute', 'seekTo', 'playVideo', 'pauseVideo', 'unMute'].every((c) => cmds.includes(c)), `player driven by postMessage (${[...new Set(cmds)].join(', ')})`);
  const f = await download(page, () => page.getByRole('button', { name: 'Download', exact: true }).click());
  const m = await page.evaluate(async (b64) => {
    const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
    await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('cannot play')); });
    const hue = async (t) => { v.currentTime = t; await new Promise((r) => (v.onseeked = r)); const c = new OffscreenCanvas(32, 18), g = c.getContext('2d'); g.drawImage(v, 0, 0, 32, 18); const d = g.getImageData(2, 2, 4, 4).data; return [d[0], d[1], d[2]]; };
    return { duration: v.duration, w: v.videoWidth, h: v.videoHeight, a: await hue(0.3), b: await hue(Math.max(0.5, v.duration - 0.3)) };
  }, readFileSync(f).toString('base64'));
  info(`clip ${m.duration.toFixed(2)} s · ${m.w}×${m.h}. Headless Chromium's display capture is a synthetic "monitor" (not this tab), so Region Capture cannot be exercised here; the fallback is checked instead.`);
  ok(Math.abs(m.duration - 3) < 0.8, `recorded the 2 s → 5 s section (${m.duration.toFixed(2)} s)`);
  const label = await page.locator('.vid-big + .muted').textContent();
  ok(/cropped to the player|NOT cropped \(something other than this tab was shared\)/.test(label), `crop state reported to the user (${label})`);
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);
};
