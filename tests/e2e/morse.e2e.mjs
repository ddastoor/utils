// Morse Code (#/morse) in the browser: text into code and back with known answers, what the tab did wrongly before
// (characters dropped without a word, line breaks lost, word gaps not read), the direction switch, the sound as it is
// scheduled on the audio clock (dot 1 unit, dash 3, gaps 1 / 3 / 7; unit = 1.2 s ÷ words a minute), Play and Stop,
// the alphabet chart, phone layout.
import { setValue, until, hookClipboard, copied, notes } from './_devdata.mjs';

export default async ({ base, page: newPage, ok, devices }) => {
  /** every tone the page schedules: the gain's automation and the oscillators it makes */
  const spy = () => { window.__ev = []; window.__osc = [];
    for (const m of ['setValueAtTime', 'linearRampToValueAtTime']) { const o = AudioParam.prototype[m]; AudioParam.prototype[m] = function (v, t) { if (v === 0 || v === 0.4) window.__ev.push([m === 'setValueAtTime' ? 'set' : 'ramp', v, t]); return o.call(this, v, t); }; }
    const mk = AudioContext.prototype.createOscillator; AudioContext.prototype.createOscillator = function () { const o = mk.call(this); const st = o.stop.bind(o); o.__stops = []; o.stop = (t) => { o.__stops.push(t ?? -1); return st(t); }; window.__osc.push(o); return o; }; };
  const page = await newPage({ viewport: { width: 1366, height: 900 } }); await page.addInitScript(spy);
  const fetched = []; page.on('request', (r) => fetched.push(r.url()));
  await page.goto(`${base}#/morse`);
  const inp = page.getByRole('textbox', { name: 'Text or Morse code' }), out = page.locator('.morse-out'); await inp.waitFor(); await hookClipboard(page);
  const conv = async (s) => { await setValue(inp, s); return out.evaluate((e) => e.textContent); };
  const label = () => page.locator('.field', { has: page.locator('.morse-out') }).locator('.field-label').textContent();

  // ---- text → Morse
  ok(await out.textContent() === '... --- ... / .... . .-.. .--.' && await label() === 'Morse code', 'the sample: SOS Help');
  ok(!fetched.some((u) => /\.wasm|\/vendor\/|\/models\//.test(u)), 'nothing but the tab\'s own code is fetched');
  ok(await conv('Hello, World 2026!') === '.... . .-.. .-.. --- --..-- / .-- --- .-. .-.. -.. / ..--- ----- ..--- -.... -.-.--', 'letters, comma, digits, exclamation mark');
  ok(await conv('@ = +') === '.--.-. / -...- / .-.-.', 'signs @ = +');
  ok(await conv('SOS\nHelp me') === '... --- ...\n.... . .-.. .--. / -- .', 'lines stay lines (they were joined into one)');
  ok(await conv('A € B') === '.- / -...' && (await notes(page)).includes('No Morse code for this character, which is left out:  €'), `a character without a code is left out and named — it left ".- /  / -..." behind and nothing was said (${await notes(page)})`);
  ok(await conv('café, 100%') === '-.-. .- ..-. ..-.. --..-- / .---- ----- ----- ----- -..-. -----' && !(await notes(page)), 'é has its own code and % is sent as 0/0 (both were dropped without a word)');
  ok(await conv('नमस्ते hi') === '.... ..' && (await notes(page)).includes('these 4 characters, which are left out:  न  म  स  त'), `Hindi has no Morse code: said, with the letters (${await notes(page)})`);
  ok(await conv('<SK>') === '...-.-', 'a procedural signal in angle brackets is one sign');
  ok(await conv('') === '' && await page.getByRole('button', { name: 'Play' }).isDisabled() && await page.locator('.morse-length').textContent() === '', 'an empty box: nothing, and nothing to play');

  // ---- Morse → text
  ok(await conv('.... . .-.. .-.. --- / .-- --- .-. .-.. -..') === 'HELLO WORLD' && await label() === 'Text', 'Morse is recognised and read: HELLO WORLD; the result box is called "Text"');
  ok(await conv('... --- ...\n.... . .-.. .--.') === 'SOS\nHELP', 'two lines of Morse are two lines of text (they were read as "SOSHELP")');
  ok(await conv('··· −−− ···') === 'SOS', 'typographic dots and dashes (· −)');
  ok(await conv('.-   -...') === 'A B' && await conv('.-  -...') === 'A B' && await conv('.- | -...') === 'A B', 'words apart by three spaces, by two, by a bar');
  ok(await conv('...---...') === '<SOS>', 'SOS written without gaps is the distress signal (nothing was shown)');
  ok(await conv('.- ...... -...') === 'A�B' && (await notes(page)).includes('This group is no Morse code and is shown as �:  ......'), `a group that is no code is shown as a gap and named (it was dropped: "AB") (${await notes(page)})`);
  const A2Z = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 .,?\'!/()&:;=+-_"$@';
  ok(await conv(await conv(A2Z)) === A2Z, 'the whole alphabet there and back');

  // ---- the direction switch
  ok(await conv('...') === 'S', 'three dots are Morse when the tab decides: S');
  await page.getByRole('radio', { name: 'Text → Morse' }).click();
  ok(await out.textContent() === '.-.-.- .-.-.- .-.-.-' && await label() === 'Morse code', '"Text → Morse": three dots are three full stops');
  await page.getByRole('radio', { name: 'Morse → text' }).click();
  ok(await conv('SOS') === '�' && (await notes(page)).includes('Morse code is made of dots, dashes, spaces and slashes only'), `"Morse → text" with a word in the box: said (${await notes(page)})`);
  await page.getByRole('radio', { name: 'Auto', exact: true }).click();
  ok(await out.textContent() === '... --- ...', 'back to Auto: SOS is text again');

  // ---- copy
  await conv('SOS Help'); await page.locator('.outbox', { has: out }).getByRole('button', { name: 'Copy' }).click();
  ok((await copied(page)).at(-1) === '... --- ... / .... . .-.. .--.', 'Copy gives the code with plain dots, dashes and spaces');

  // ---- sound: what is scheduled, at 20 words a minute (one unit = 60 ms)
  const sliders = page.locator('input[type=range]');
  const slide = (i, v) => sliders.nth(i).evaluate((e, x) => { e.value = String(x); e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  await slide(0, 20);
  /** press Play and return the tones as [length, gap before] in units */
  const play = async (text, u = 0.06) => { await conv(text); await page.evaluate(() => { window.__ev = []; }); await page.getByRole('button', { name: 'Play' }).click();
    await page.waitForFunction(() => window.__ev.length >= 4);
    const ev = await page.evaluate(() => window.__ev), tones = [];
    for (let i = 0; i + 3 < ev.length; i += 4) tones.push([ev[i][2], ev[i + 3][2]]); // set 0 at the start … ramp to 0 at the end
    const shape = ev.every(([kind, v], i) => [['set', 0], ['ramp', 0.4], ['set', 0.4], ['ramp', 0]][i % 4].join() === [kind, v].join());
    return { units: tones.map(([a, b], i) => [Math.round((b - a) / u * 100) / 100, i ? Math.round((a - tones[i - 1][1]) / u * 100) / 100 : 0]), shape, slope: ev[1][2] - ev[0][2] }; };
  let p = await play('A E T');
  ok(JSON.stringify(p.units) === '[[1,0],[3,1],[1,7],[3,7]]', `A E T: dot, 1 unit, dash, then 7 units to the next word (${JSON.stringify(p.units)})`);
  ok(p.shape && Math.abs(p.slope - 0.005) < 1e-6, `every tone rises and falls over 5 ms instead of being switched (a hard switch clicks) (${(p.slope * 1000).toFixed(1)} ms)`);
  ok(await page.getByRole('button', { name: 'Stop' }).isVisible() && await page.getByRole('button', { name: 'Play' }).isHidden(), 'while it plays the button is Stop (there was no way to stop a message)');
  ok(await page.locator('.morse-length').textContent() === '1 s of sound at 20 words a minute.', `the length is said beforehand (${await page.locator('.morse-length').textContent()})`);
  await page.getByRole('button', { name: 'Stop' }).click();
  ok(await page.getByRole('button', { name: 'Play' }).isVisible() && await page.evaluate(() => window.__osc.at(-1).__stops.length === 2), 'Stop ends the tone at once and the button is Play again');
  p = await play('EE'); ok(JSON.stringify(p.units) === '[[1,0],[1,3]]', `between letters 3 units (${JSON.stringify(p.units)})`);
  p = await play('.\n.'); ok(JSON.stringify(p.units) === '[[1,0],[1,7]]', `Morse in two lines: a word gap between them — it was played as one letter (${JSON.stringify(p.units)})`);
  p = await play('·− −'); ok(JSON.stringify(p.units) === '[[1,0],[3,1],[3,3]]', `typographic dots and dashes are played — they were silence (${JSON.stringify(p.units)})`);
  p = await play('.-/-'); ok(JSON.stringify(p.units) === '[[1,0],[3,1],[3,7]]', `a slash without spaces is a word gap in the sound too (${JSON.stringify(p.units)})`);
  // Play pressed again while it plays: the first message is ended, not played on top
  await conv('SOS SOS SOS SOS'); await page.getByRole('button', { name: 'Play' }).click(); await page.getByRole('button', { name: 'Stop' }).waitFor();
  const before = await page.evaluate(() => window.__osc.length);
  await setValue(inp, 'E'); // a new text ends the sound
  ok(await page.getByRole('button', { name: 'Play' }).isVisible() && await page.evaluate((n) => window.__osc.length === n && window.__osc.at(-1).__stops.length === 2, before), 'typing a new text ends the sound that was playing');
  // a message plays to its end and the button comes back
  await slide(0, 40); await conv('E'); await page.getByRole('button', { name: 'Play' }).click();
  ok(await until(page, () => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Play' && !b.hidden), null, 4000), 'when the message is over the button is Play again');
  // speed and pitch
  await slide(0, 5); await conv('PARIS PARIS');
  ok(await page.locator('.morse-length').textContent() === '22 s of sound at 5 words a minute.', `the length follows the speed: PARIS PARIS at 5 words a minute (${await page.locator('.morse-length').textContent()})`);
  await slide(1, 800); await page.getByRole('button', { name: 'Play' }).click(); await page.getByRole('button', { name: 'Stop' }).waitFor();
  ok(await page.evaluate(() => window.__osc.at(-1).frequency.value) === 800, 'the pitch slider sets the tone (800 Hz)');
  await slide(1, 500); ok(await until(page, () => Math.abs(window.__osc.at(-1).frequency.value - 500) < 1), '… also while it plays');
  // leaving while it plays
  await page.goto(`${base}#/lorem`); await page.waitForTimeout(300);
  ok(!page.errors.length, `no page errors, also when the tab is left while it plays ${page.errors.join(' | ')}`);

  // ---- the alphabet
  await page.goto(`${base}#/morse`); await page.getByText('The Morse alphabet').click();
  const chart = await page.$$eval('.morse-item', (xs) => xs.map((x) => [x.querySelector('b').textContent, x.querySelector('code').textContent]));
  ok(chart.length === 62 && chart[0].join(' ') === 'A .-' && chart[25].join(' ') === 'Z --..' && chart[26].join(' ') === '0 -----' && chart.some(([c, m]) => c === '?' && m === '..--..'), `the alphabet chart: 62 characters, letters first, then digits, signs, accented letters (${chart.length})`);

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/morse`); await ph.locator('.morse-out').waitFor();
  await setValue(ph.getByRole('textbox', { name: 'Text or Morse code' }), 'Pack my box with five dozen liquor jugs, 1234567890 times');
  const m = await ph.evaluate(() => ({ wide: document.documentElement.scrollWidth <= innerWidth, broken: [...document.querySelectorAll('.morse-out .nb')].filter((s) => s.getClientRects().length > 1).length, groups: document.querySelectorAll('.morse-out .nb').length,
    play: Math.min(...[...document.querySelectorAll('.actions .btn')].filter((b) => !b.hidden).map((b) => b.getBoundingClientRect().height)), seg: Math.min(...[...document.querySelectorAll('.seg-btn')].map((b) => b.getBoundingClientRect().height)), font: parseFloat(getComputedStyle(document.querySelector('textarea')).fontSize) }));
  ok(m.wide, 'phone: no sideways scroll');
  ok(m.groups > 50 && m.broken === 0, `phone: no letter's dots and dashes are broken over two lines (${m.groups} groups; ".--." used to end one line with "." and begin the next with "--.")`);
  ok(m.play >= 44 && m.seg >= 44 && m.font >= 16, `phone: Play is ${Math.round(m.play)} px high, the switch ${Math.round(m.seg)} px, the text box written in ${m.font} px`);
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
