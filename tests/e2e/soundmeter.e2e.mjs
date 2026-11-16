// Sound Meter (#/soundmeter): with a fake microphone of known amplitude A the reading must be
// 20·log10(A/√2) + offset dB (RMS of a sine, default offset 90) and the matching description band; offset slider;
// digital silence = 0 dB (was −150); min / avg / max and Reset stats; history graph drawn; Start twice keeps one
// stream; permission message shown once; microphone + audio engine released on leave; phone layout.
import { phoneLayout } from './_phone.mjs';
import { fakeMedia, allStopped, trackAudioContexts } from './_media.mjs';
const band = (db) => (db < 40 ? 'Quiet room' : db < 60 ? 'Conversation' : db < 75 ? 'Busy street' : db < 90 ? 'Loud — limit exposure' : 'Very loud — hearing risk');
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage({ permissions: ['microphone'] });
  await page.addInitScript(trackAudioContexts); await page.addInitScript(fakeMedia, { freq: 440, amp: 0.5 });
  await page.goto(`${base}#/soundmeter`);
  const btn = (n) => page.getByRole('button', { name: n, exact: true }); await btn('Start').waitFor();
  const amp = async (a) => { await page.evaluate((a) => (window.__gain.gain.value = a), a); await page.waitForTimeout(350); };
  const reading = async () => ({ db: await page.locator('.db').textContent(), stats: await page.locator('.card .muted.center').first().textContent() });
  ok(await page.locator('.db').textContent() === '—', 'no reading before Start');
  await btn('Start').click(); await page.waitForTimeout(400);
  const gum = await page.evaluate(() => window.__gumCalls[0]); ok(gum.audio.echoCancellation === false && gum.audio.autoGainControl === false, 'raw microphone (no auto gain) so levels are not flattened');
  const bad = [];
  for (const [a, off] of [[0.5, 90], [0.05, 90], [0.01, 90], [0.002, 90], [1, 90], [0.5, 100], [0.05, 75]]) {
    const s = page.locator('input[type=range]'); await s.fill(String(off)); await s.dispatchEvent('input');
    await amp(a); const r = await reading(), want = 20 * Math.log10(a / Math.SQRT2) + off, got = parseFloat(r.db);
    if (!(Math.abs(got - want) <= 1) || !r.stats.startsWith(band(got))) bad.push(`A ${a}, offset ${off}: ${r.db} / ${r.stats.split(' · ')[0]} (want ${want.toFixed(1)} dB, ${band(want)})`);
  }
  ok(!bad.length, `reading = 20·log10(A/√2) + offset ±1 dB with the right band for 7 levels ${bad.join('; ')}`);
  ok(await page.locator('.slider-val').textContent() === '75 dB', 'offset slider shows its value');
  const s = page.locator('input[type=range]'); await s.fill('90'); await s.dispatchEvent('input');
  await amp(0); let r = await reading(); ok(r.db === '0 dB' && r.stats.startsWith('Quiet room'), `digital silence → 0 dB (${r.db})`);
  await amp(0.05); await btn('Reset stats').click(); await page.waitForTimeout(300); await amp(0.5); await page.waitForTimeout(200);
  r = await reading(); const m = /min (\d+) · avg (\d+) · max (\d+)/.exec(r.stats);
  ok(m && Math.abs(m[1] - 61) <= 1 && Math.abs(m[3] - 81) <= 1 && +m[2] > +m[1] && +m[2] < +m[3], `after Reset stats: min ≈ 61, max ≈ 81, avg between (${r.stats})`);
  const ink = await page.locator('canvas.wave').evaluate((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  ok(ink > 200, `history graph drawn (${ink} pixels)`);
  await btn('Start').click(); await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.__tracks.length === 2 && window.__tracks[0].readyState === 'ended' && window.__tracks[1].readyState === 'live'), 'Start again: old microphone stream stopped, one live stream');
  await page.goto(`${base}#/screen`); await page.locator('.kv').first().waitFor(); await page.waitForTimeout(200);
  ok(await allStopped(page) && await page.evaluate(() => window.__acs.filter((a) => !a.__fake && a.state !== 'closed').length === 0), 'leaving the tab stops the microphone and closes the audio engine');
  await page.goto(`${base}#/soundmeter`); await btn('Start').waitFor(); await page.evaluate(() => (window.__gumError = 'NotAllowedError'));
  await btn('Start').click(); await btn('Start').click();
  ok(await page.locator('.note-err').count() === 1 && /Permission was denied/.test(await page.locator('.note-err').textContent()), 'permission denied → one message (not one per click)');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await phoneLayout(ctx, 'soundmeter', { ready: '.db', buttons: ['Start', 'Reset stats'] });
};
