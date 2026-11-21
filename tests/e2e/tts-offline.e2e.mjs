// Text-to-Speech, "Offline on this PC" (PC only; owner, 21 Nov 2026): the mode switch, the voice list and its filters,
// what the summary says, the licence and account conditions, and the scripts it downloads — read back here: bash -n
// for the Linux script, ASCII and CRLF for the Windows one, the job inside each decoded and compared with the text typed
// and the voices ticked. The page itself must fetch nothing for this mode but its own chunk.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const dec = (s) => Buffer.from(s.replace(/\s+/g, ''), 'base64').toString('utf8');
const jobOfSh = (sh) => JSON.parse(dec(sh.split(`<<'SUPERTOOLS_JOB'\n`)[1].split('\nSUPERTOOLS_JOB\n')[0]));
const jobOfCmd = (cmd) => JSON.parse(dec(/job\.json'\), \[Convert\]::FromBase64String\('([A-Za-z0-9+/=]+)'\)/.exec(cmd)[1]));

export default async ({ base, page: newPage, ok, download, devices }) => {
  const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (${JSON.stringify(a)})`);
  const page = await newPage({ viewport: { width: 1280, height: 1000 } });
  const reqs = [];
  page.on('request', (r) => reqs.push(r.url()));
  await page.goto(`${base}#/tts`);
  await page.getByLabel('Text to read').waitFor();
  ok(!reqs.some((u) => /tts-offline/.test(u)), 'the offline mode is not fetched with the tab');
  const TEXT = 'Offline speech test. Sagar Chakraborty met Dr. Rao in Bengaluru — ₹500, “quotes”, $HOME and `id`.';
  await page.getByLabel('Text to read').fill(TEXT);
  const before = reqs.length;
  await page.getByRole('radio', { name: 'Offline on this PC' }).click();
  await page.locator('.otts-list .otts-voice').first().waitFor();
  ok(await page.locator('.actions').getByRole('button', { name: 'Speak' }).isHidden(), 'offline: the browser’s Speak button is hidden');
  ok(reqs.slice(before).every((u) => u.startsWith(base.replace(/#.*$/, '')) && /\.js(\?|$)/.test(u)), `offline: only the mode’s own code is fetched (${reqs.slice(before).map((u) => u.split('/').pop()).join(', ')})`);

  // the list: Indian voices first, the starters ticked
  const n = async () => page.locator('.otts-list .otts-voice').count();
  eq(await n(), 49, 'the Indian group lists 49 voices');
  const ticked = () => page.locator('.otts-list input:checked').evaluateAll((els) => els.map((e) => e.value));
  eq((await ticked()).sort(), ['indic-parler-mary', 'indic-parler-thoma', 'kokoro-hf_alpha-a', 'piper-vctk-p248'], 'four voices ticked to begin with');
  ok(/4 voices chosen · 3 models, 4\.2 GB/.test(await page.locator('.otts-summary').innerText()), 'the summary: 4 voices, 3 models, 4.2 GB');
  ok(await page.getByText('ai4bharat/indic-parler-tts is free, but Hugging Face asks for an account first').isVisible(), 'the account note for Indic Parler-TTS');
  await page.getByRole('radio', { name: 'All' }).click();
  eq(await n(), 416, 'All: 416 voices');
  await page.getByLabel('Engine').selectOption('pocket');
  eq(await n(), 21, 'Pocket TTS: 21 voices');
  await page.getByLabel('Engine').selectOption('');
  await page.getByLabel('Voices to show').selectOption('f');
  await page.getByLabel('Search the voices').fill('indian');
  const women = await page.locator('.otts-list .otts-voice').allInnerTexts();
  ok(women.length >= 3 && women.every((t) => /woman/.test(t)), `women, "indian": ${women.length} voices, all women`);
  await page.getByLabel('Search the voices').fill('zzzz');
  ok(await page.getByText('No voice matches.').isVisible(), 'a search that finds nothing says so');
  await page.getByLabel('Search the voices').fill('');
  await page.getByLabel('Voices to show').selectOption('');

  // a chip removes a voice; ticking adds one
  await page.getByRole('button', { name: 'Mary · Parler-TTS — remove' }).click();
  ok(!(await ticked()).includes('indic-parler-mary'), 'the chip’s ✕ removes the voice');
  await page.getByLabel('Search the voices').fill('p376');
  await page.locator('.otts-voice', { hasText: 'VCTK p376 — man, 22, Indian' }).first().locator('input').check();
  await page.getByLabel('Search the voices').fill('');

  // Linux script
  await page.getByRole('radio', { name: 'Linux' }).click();
  let f = await download(page, () => page.getByRole('button', { name: 'Download the script for Linux (.sh)' }).click());
  ok(f.endsWith('supertools-speech.sh'), 'Linux: supertools-speech.sh');
  const sh = readFileSync(f, 'utf8');
  const syn = spawnSync('bash', ['-n', f], { encoding: 'utf8' });
  ok(syn.status === 0, `bash -n reads it (${syn.stderr.trim()})`);
  let job = jobOfSh(sh);
  eq(job.text, TEXT, 'the text inside, untouched');
  eq(job.voices.map((v) => v.id).sort(), ['indic-parler-thoma', 'kokoro-hf_alpha-a', 'piper-vctk-p248', 'piper-vctk-p376'], 'the ticked voices inside');
  ok(job.mp3 === true && job.speed === 1, 'MP3 on, speed 1');
  ok(sh.includes('read -rsp') && !sh.includes('COQUI_TOS_AGREED'), 'asks for the Hugging Face token; no XTTS setting');

  // XTTS-v2: the download waits for its licence
  await page.getByLabel('Search the voices').fill('Vinith');
  await page.locator('.otts-voice', { hasText: 'Vinith' }).locator('input').check();
  const dl = page.getByRole('button', { name: 'Download the script for Linux (.sh)' });
  ok(await dl.isDisabled(), 'an XTTS-v2 voice: the download waits for its licence');
  await page.getByText('I accept the Coqui Public Model License').click();
  ok(await dl.isEnabled(), 'licence accepted: the download is back');
  // Windows script, a slower speed, WAV only
  await page.getByRole('radio', { name: 'Windows' }).click();
  await page.locator('.otts-summary').scrollIntoViewIfNeeded();
  const sl = page.locator('.card', { hasText: 'Your choice' }).getByLabel('Speed');
  await sl.fill('0.8');
  await page.getByText('MP3 as well as WAV').click();
  f = await download(page, () => page.getByRole('button', { name: 'Download the script for Windows (.cmd)' }).click());
  ok(f.endsWith('supertools-speech.cmd'), 'Windows: supertools-speech.cmd');
  const cmd = readFileSync(f, 'latin1');
  ok(/^[\x00-\x7f]*$/.test(cmd) && !/[^\r]\n/.test(cmd) && cmd.startsWith('<# : '), 'ASCII, CRLF, the cmd / PowerShell hybrid');
  job = jobOfCmd(cmd);
  eq(job.text, TEXT, 'Windows: the text inside, untouched');
  ok(job.voices.some((v) => v.id === 'xtts-clip-vinith' && v.clip?.file?.includes('Vinith')) && job.speed === 0.8 && job.mp3 === false, 'Windows: the XTTS clip voice, speed 0.8, WAV only');
  ok(cmd.includes("$env:COQUI_TOS_AGREED = '1'") && cmd.includes('Read-Host -AsSecureString'), 'Windows: XTTS licence setting, token asked for');
  ok(/Double-click|double-click/.test(await page.locator('.otts-steps').innerText()), 'Windows instructions');

  // nothing chosen: no download
  for (const b of await page.locator('.otts-summary .chip-btn').all()) await page.locator('.otts-summary .chip-btn').first().click();
  ok(/No voice chosen yet/.test(await page.locator('.otts-summary').innerText()) && await page.getByRole('button', { name: /Download the script/ }).isDisabled(), 'no voice: nothing to download');

  // back to the browser
  await page.getByRole('radio', { name: 'In this browser' }).click();
  ok(await page.locator('.actions').getByRole('button', { name: 'Speak' }).isVisible() && await page.locator('.otts-list').isHidden(), 'back: the browser mode as it was');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // accessibility of the panel (axe-core, WCAG 2.2 A / AA), light and dark, with an XTTS voice chosen (its licence switch)
  const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
  for (const colorScheme of ['light', 'dark']) {
    const a = await newPage({ viewport: { width: 1366, height: 900 }, colorScheme, bypassCSP: true });
    await a.goto(`${base}#/tts`);
    await a.getByRole('radio', { name: 'Offline on this PC' }).click();
    await a.locator('.otts-list .otts-voice').first().waitFor();
    await a.getByLabel('Search the voices').fill('Vinith');
    await a.locator('.otts-voice', { hasText: 'Vinith' }).locator('input').check();
    await a.addScriptTag({ content: AXE });
    const v = await a.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })).violations
      .map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    ok(!v.length, `${colorScheme}: no WCAG 2.2 A / AA violation in the offline panel ${v.join(' | ')}`);
  }

  // phones: no offline mode
  const ph = await newPage(devices['iPhone 13']);
  await ph.goto(`${base}#/tts`);
  await ph.getByLabel('Text to read').waitFor();
  ok(await ph.getByRole('radio', { name: 'Offline on this PC' }).count() === 0, 'phone: the offline mode is not offered');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
