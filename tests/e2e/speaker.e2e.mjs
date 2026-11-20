// Speaker Test (#/speaker): what actually reaches the speakers is measured — every connection to the destination is
// mirrored into a channel splitter + analysers — so Left plays only in the left channel (and says "Left"), Right only
// right, Both equally; tone generator frequency measured by zero crossings (default 440 Hz, slider, live change while
// playing), 3-second tone, 20 Hz → 20 kHz sweep schedule over 10 s, Stop silences, one sound at a time, released on
// leave, phone layout.
import { phoneLayout } from './_phone.mjs';
import { trackAudioContexts } from './_media.mjs';
const tap = () => {
  window.__said = []; window.__ramps = [];
  const sp = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = (u) => { window.__said.push(u.text); try { sp(u); } catch { /* */ } };
  const c = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dst, ...a) {
    if (dst instanceof AudioDestinationNode) {
      const ctx = this.context;
      if (!ctx.__tap) { const s = ctx.createChannelSplitter(2), L = ctx.createAnalyser(), R = ctx.createAnalyser(); L.fftSize = R.fftSize = 8192; c.call(s, L, 0); c.call(s, R, 1); ctx.__tap = { s, L, R }; window.__tapCtx = ctx; }
      c.call(this, ctx.__tap.s);
    }
    return c.call(this, dst, ...a);
  };
  const ex = AudioParam.prototype.exponentialRampToValueAtTime, sv = AudioParam.prototype.setValueAtTime;
  AudioParam.prototype.exponentialRampToValueAtTime = function (v, t) { window.__ramps.push(['ramp', v, +(t - (window.__tapCtx?.currentTime ?? 0)).toFixed(2)]); return ex.call(this, v, t); };
  AudioParam.prototype.setValueAtTime = function (v, t) { window.__ramps.push(['set', v, +(t - (window.__tapCtx?.currentTime ?? 0)).toFixed(2)]); return sv.call(this, v, t); };
};
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.addInitScript(trackAudioContexts); await page.addInitScript(tap);
  await page.goto(`${base}#/speaker`);
  const btn = (n) => page.getByRole('button', { name: n, exact: true }); await btn('Left').waitFor();
  // RMS per channel and the frequency of the louder channel, from the analysers
  const hear = () => page.evaluate(() => {
    const t = window.__tapCtx?.__tap; if (!t) return { L: 0, R: 0, hz: 0 };
    const rd = (an) => { const b = new Float32Array(an.fftSize); an.getFloatTimeDomainData(b); return b; };
    const l = rd(t.L), r = rd(t.R), rms = (b) => Math.sqrt(b.reduce((s, v) => s + v * v, 0) / b.length);
    const b = rms(l) >= rms(r) ? l : r; let z = 0; for (let i = 1; i < b.length; i++) if ((b[i - 1] < 0) !== (b[i] < 0)) z++;
    return { L: rms(l), R: rms(r), hz: z / 2 / (b.length / window.__tapCtx.sampleRate) };
  });
  const wait = (ms = 450) => page.waitForTimeout(ms), r3 = (h) => `L ${h.L.toFixed(3)} R ${h.R.toFixed(3)}`;
  ok((await hear()).L === 0 && await page.evaluate(() => !window.__tapCtx), 'no sound and no audio engine before a button is pressed');
  await btn('Left').click(); await wait(); let h = await hear();
  ok(h.L > 0.15 && h.R < 0.002, `Left: sound only in the left channel (${r3(h)})`);
  ok(Math.abs(h.hz - 440) < 8, `Left uses the 440 Hz test tone (${h.hz.toFixed(0)} Hz)`);
  await btn('Right').click(); await wait(); h = await hear();
  ok(h.R > 0.15 && h.L < 0.002, `Right: only the right channel, the left tone was stopped (${r3(h)})`);
  await btn('Both').click(); await wait(); h = await hear();
  ok(h.L > 0.1 && Math.abs(h.L - h.R) / h.L < 0.05, `Both: equal in both channels (${r3(h)})`);
  ok(JSON.stringify(await page.evaluate(() => window.__said)) === '["Left","Right","Centre"]', 'the voice says Left, Right, Centre');
  await wait(800); h = await hear(); ok(h.L < 0.002 && h.R < 0.002, `the stereo test tone ends after 0.8 s (${r3(h)})`);
  const range = page.locator('input[type=range]'), setF = async (v) => { await range.fill(String(v)); await range.dispatchEvent('input'); };
  ok(await page.locator('.slider-val').textContent() === '440 Hz', 'tone generator defaults to 440 Hz');
  await setF(1000); await btn('Play tone').click(); await wait(); h = await hear();
  ok(Math.abs(h.hz - 1000) < 10 && h.L > 0.1 && Math.abs(h.L - h.R) / h.L < 0.05, `Play tone: 1000 Hz in both channels (${h.hz.toFixed(0)} Hz, ${r3(h)})`);
  await setF(3000); await wait(250); h = await hear(); ok(Math.abs(h.hz - 3000) < 25, `moving the slider while it plays changes the pitch live (${h.hz.toFixed(0)} Hz)`);
  await setF(100); await wait(300); h = await hear(); ok(Math.abs(h.hz - 100) < 6, `100 Hz (${h.hz.toFixed(1)} Hz)`);
  await page.evaluate(() => (window.__ramps = [])); await btn('Stop').click(); await wait(200); h = await hear(); ok(h.L < 0.002 && h.R < 0.002, `Stop silences the tone (${r3(h)})`);
  const st = await page.evaluate(() => window.__ramps);
  ok(st.some(([k, v, t]) => k === 'ramp' && v === 0.0001 && t > 0 && t <= 0.03), `Stop fades the tone out in 20 ms (cut off at once it clicked) ${JSON.stringify(st)}`);
  await setF(440); await page.evaluate(() => (window.__ramps = [])); await btn('Play tone').click(); await wait(2000);
  ok((await hear()).L > 0.1, 'tone still playing after 2 s');
  await wait(1400); h = await hear(); ok(h.L < 0.002, `tone stops by itself after 3 s (${r3(h)})`);
  const env = await page.evaluate(() => window.__ramps);
  ok(env.some(([k, v, t]) => k === 'ramp' && v === 0.3 && t <= 0.06) && env.some(([k, v, t]) => k === 'ramp' && v === 0.0001 && Math.abs(t - 3) < 0.06), `fade in to 0.3 within 50 ms and out at 3 s (no clicks) ${JSON.stringify(env)}`);
  await page.evaluate(() => (window.__ramps = [])); await btn('Sweep 20 Hz → 20 kHz').click(); await wait(300);
  const sw = await page.evaluate(() => window.__ramps);
  ok(sw.some(([k, v]) => k === 'set' && v === 20) && sw.some(([k, v, t]) => k === 'ramp' && v === 20000 && Math.abs(t - 10) < 0.35), `sweep: 20 Hz rising exponentially to 20 kHz over 10 s ${JSON.stringify(sw)}`);
  ok(sw.some(([k, v, t]) => k === 'ramp' && v === 0.2 && t <= 0.06) && sw.some(([k, v, t]) => k === 'ramp' && v === 0.0001 && Math.abs(t - 10) < 0.35), 'the sweep fades in and out (it started and ended with a click)');
  h = await hear(); ok(h.L > 0.05 && h.hz < 60, `sweep starts low (${h.hz.toFixed(0)} Hz after 0.3 s; 20·1000^(t/10) ≈ 25 Hz)`);
  await btn('Left').click(); await wait(); h = await hear(); ok(h.R < 0.002 && h.L > 0.15, 'pressing Left during the sweep stops the sweep');
  await btn('Stop').click(); await btn('Stop').click(); ok(true, 'Stop twice is harmless');
  await btn('Play tone').click(); await wait(200);
  await page.goto(`${base}#/screen`); await page.locator('.kv').first().waitFor();
  ok(await page.evaluate(() => window.__acs.length === 1 && window.__acs[0].state === 'closed'), 'leaving the tab closes its audio engine (sound stops)');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await phoneLayout(ctx, 'speaker', { ready: '.spk-row', buttons: ['Left', 'Both', 'Right', 'Play tone', 'Stop'] });
};
