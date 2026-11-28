// The Settings page (to-do #39; the owner, 28 Nov 2026): one store in this browser, a section for Favorites, the list of apps and each app
// the owner chose (Text-to-Speech, Camera Reader, Audiobook, EPUB Reader, Spell Checker, World Clock). A change on the Settings page reaches
// the app and a change in the app reaches the Settings page; another open tab follows at once (the storage event) and writes no file of its
// own; after every change a settings file — superutils_settings_YYYYMMDD_HHMM.json, one for a burst of changes — is downloaded, or written
// into the folder chosen once (File System Access: the browser's private file system stands in for a folder here); "Export settings now";
// an import puts back the sections the file holds and names what it left out; a file that is no settings file is refused and changes
// nothing; with "after every change" off no file comes; the phone; axe-core in both themes.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { phoneLayout } from './_phone.mjs';

const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const NAME = /^superutils_settings_(\d{8})_(\d{4})\.json$/;
const BOOK = fileURLToPath(new URL('../fixtures/ebooks/novel.epub', import.meta.url));
const LEAFLET = fileURLToPath(new URL('../fixtures/snaps/leaflet.jpg', import.meta.url));
const SECTIONS = ['favorites', 'applist', 'tts', 'camreader', 'audiobook', 'ebook', 'spell', 'worldclock'];
const MARKETS = ['new-york-us', 'toronto-ca', 'sao-paulo-br', 'london-gb', 'frankfurt-am-main-de', 'johannesburg-za', 'mumbai-in', 'shanghai-cn', 'hong-kong-hk', 'tokyo-jp', 'sydney-au'];

export default async ({ base, page: newPage, ok, tmp, devices, info }) => {
  let n = 0;
  /** every settings file a page saves, as it comes: its name and what it holds */
  const filesOf = (p) => {
    const got = [];
    p.on('download', async (d) => {
      const path = join(tmp, `settings-${++n}-${d.suggestedFilename()}`);
      await d.saveAs(path);
      let json = null;
      try { json = JSON.parse(readFileSync(path, 'utf8')); } catch { /* checked below */ }
      got.push({ name: d.suggestedFilename(), json });
    });
    return {
      got,
      /** wait (at most `ms`) until `k` files have come in all; then wait `settle` more to see that no other comes (20 s: a file is
       *  1.5 s after the change, but a machine busy with other suites — the Windows check, run 20 — once took more than 9) */
      async upTo(k, ms = 20000, settle = 0) {
        const t0 = Date.now();
        while (got.length < k && Date.now() - t0 < ms) await p.waitForTimeout(100);
        if (settle) await p.waitForTimeout(settle);
        return got;
      },
    };
  };
  const go = async (p, hash, ready) => { await p.goto(`${base}#/${hash}`); await p.locator(ready).first().waitFor({ state: 'attached', timeout: 20000 }); };
  const toSettings = (p) => go(p, 'settings', '#settings-tts select');
  const today = (p) => p.evaluate(() => { const d = new Date(), q = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}${q(d.getMonth() + 1)}${q(d.getDate())}`; });
  const range = (loc, v) => loc.evaluate((el, x) => { el.value = String(x); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);
  const stored = (p, id) => p.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), `superutils.app.${id}.v1`);

  const pc = await newPage({ viewport: { width: 1280, height: 900 }, settingsFiles: true });
  const F = filesOf(pc);

  // ---------------------------------------------------------------- the page and the link to it
  await pc.goto(`${base}#/`);
  await pc.locator('.tile').first().waitFor();
  const link = pc.locator('.settings-link');
  ok(await link.isVisible() && (await link.innerText()).trim() === 'Settings', 'the header has a Settings link, named in words on a PC');
  await link.click();
  await pc.locator('#settings-tts select').waitFor({ timeout: 20000 });
  ok(/#\/settings$/.test(pc.url()) && (await pc.title()) === 'Settings · SuperUtils', `the link opens #/settings (${pc.url()}, “${await pc.title()}”)`);
  ok((await link.getAttribute('aria-current')) !== null, 'the link is marked as the page shown (aria-current)');
  ok(!(await pc.locator('.tabs-cat .tab.on').count()), 'no category tab is lit on the Settings page');
  const ids = await pc.$$eval('.st-sec', (cs) => cs.map((c) => c.id.replace('settings-', '')));
  ok(JSON.stringify(ids) === JSON.stringify(SECTIONS), `a section for each part that keeps something, in order (${ids.join(', ')})`);
  ok(/No settings file saved during this visit yet/.test(await pc.locator('.st-last').innerText()), 'the files card says no file has been saved yet');
  ok(!F.got.length, 'opening the page writes no file');

  // ---------------------------------------------------------------- Favorites: a star in the app → a file, and on the page
  await go(pc, 'wordcount', '.head-star');
  await pc.locator('.head-star').click();
  let got = await F.upTo(1);
  ok(got.length === 1 && NAME.test(got[0].name), `a star writes a settings file after the change (${got.map((f) => f.name).join(', ')})`);
  const want = await today(pc);
  ok(got[0]?.name.match(NAME)?.[1] === want, `its name holds today's date (${got[0]?.name}, ${want})`);
  const j = got[0]?.json;
  ok(j?.app === 'SuperUtils' && j?.kind === 'settings' && j?.format === 1 && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/.test(j?.saved || ''), `the file says what it is, its format and when it was saved (${j?.saved})`);
  ok(JSON.stringify(Object.keys(j?.settings || {})) === JSON.stringify(SECTIONS), `the file holds every section (${Object.keys(j?.settings || {}).join(', ')})`);
  ok(JSON.stringify(j?.settings?.favorites) === '["wordcount"]', `… and the star (${JSON.stringify(j?.settings?.favorites)})`);
  // a burst of changes: one file
  await go(pc, 'c/text', '.tile-star');
  const stars = pc.locator('.tile-star');
  for (const k of [1, 2, 3]) await stars.nth(k).click();
  got = await F.upTo(2, 20000, 2500);
  ok(got.length === 2, `three stars in a row: one file after the last (${got.length - 1})`);
  const four = got[1]?.json?.settings?.favorites ?? [];
  ok(four.length === 4 && four[0] === 'wordcount', `… holding all four favorites (${four.join(', ')})`);
  await toSettings(pc);
  const favNames = await pc.locator('#settings-favorites li a').allInnerTexts();
  ok(favNames.length === 4 && favNames.map((s) => s.trim())[0] === 'Word Counter', `the Settings page lists the four favorites (${favNames.map((s) => s.trim()).join(', ')})`);
  await pc.getByRole('button', { name: 'Remove Word Counter from Favorites' }).click();
  got = await F.upTo(3);
  ok(got.length === 3 && !got[2].json?.settings?.favorites?.includes('wordcount'), 'removed on the Settings page: a file without it');
  ok((await pc.locator('#settings-favorites li a').count()) === 3, 'the list follows at once');
  await go(pc, 'wordcount', '.head-star');
  ok((await pc.locator('.head-star').getAttribute('aria-pressed')) === 'false', 'the app shows it is no favorite any more');

  // ---------------------------------------------------------------- the list of apps: both ways
  await toSettings(pc);
  const foldSw = pc.locator('#settings-applist label.switch');
  await foldSw.click();
  got = await F.upTo(4);
  ok(got[3]?.json?.settings?.applist?.folded === true, 'the list of apps folded on the Settings page: in the file');
  await go(pc, 'wordcount', '.tool-body');
  const allApps = pc.getByRole('button', { name: /^All \d+ apps$/ });
  ok(await allApps.isVisible(), 'the app shows the list folded away');
  await allApps.click();
  await toSettings(pc);
  ok(!(await pc.locator('#settings-applist input').isChecked()), 'opened again in the app: the Settings page shows it open');
  await F.upTo(5);

  // ---------------------------------------------------------------- Text-to-Speech: both ways
  await toSettings(pc);
  await pc.locator('#settings-tts select').selectOption('bf_emma');
  got = await F.upTo(6);
  ok(got[5]?.json?.settings?.tts?.voice === 'bf_emma', `the voice chosen on the Settings page: in the file (${got[5]?.json?.settings?.tts?.voice})`);
  ok((await stored(pc, 'tts'))?.voice === 'bf_emma', '… and kept in this browser under the app\'s key');
  await go(pc, 'tts', 'select');
  ok((await pc.getByLabel('Voice', { exact: true }).inputValue()) === 'bf_emma', 'the Text-to-Speech tab opens with that voice');
  await range(pc.getByRole('slider', { name: 'Speed' }), 1.5);
  got = await F.upTo(7);
  ok(got[6]?.json?.settings?.tts?.speed === 1.5, `the speed set in the app: in the file (${got[6]?.json?.settings?.tts?.speed})`);
  await toSettings(pc);
  ok((await pc.locator('#settings-tts input[type=range]').inputValue()) === '1.5' && (await pc.locator('#settings-tts output').innerText()) === '1.5×', 'the Settings page shows the app\'s speed');

  // ---------------------------------------------------------------- Camera Reader: both ways (its voice and text appear with a page read)
  const crs = pc.locator('#settings-camreader select');
  await crs.nth(2).selectOption('34');
  await crs.nth(1).selectOption('1.2');
  await pc.locator('#settings-camreader label.switch').click();
  got = await F.upTo(8, 20000, 2000);
  ok(got.length === 8 && JSON.stringify(got[7]?.json?.settings?.camreader) === '{"voice":"af_heart","speed":"1.2","size":34,"auto":false}', `three changes on the Settings page: one file with all three (${JSON.stringify(got[7]?.json?.settings?.camreader)})`);
  const voiceAsked = [], onReq = (r) => { if (/kokoro|piper|tts\.worker|onnx/i.test(r.url())) voiceAsked.push(r.url()); };
  pc.on('request', onReq);
  await go(pc, 'camreader', 'input[type=file]');
  await pc.locator('input[type=file]').first().setInputFiles(LEAFLET);
  await pc.waitForFunction(() => +(document.querySelector('[data-reads]')?.getAttribute('data-reads') || 0) > 0 && document.querySelector('.cr-s'), null, { timeout: 180000 });
  await pc.waitForTimeout(1500);
  ok((await pc.locator('.cr-size').innerText()).includes('34 px'), 'the Camera Reader shows the page at the text size chosen on the Settings page');
  ok((await pc.getByRole('radio', { name: 'Faster' }).getAttribute('aria-checked')) === 'true', '… at the speed chosen there');
  ok(!(await pc.locator('label.switch', { hasText: 'Read aloud as soon as the page is read' }).locator('input').isChecked()), '… with "read aloud at once" off');
  ok(!voiceAsked.length, `… and so the page is not read aloud by itself: no voice fetched (${voiceAsked.slice(0, 2).join(', ')})`);
  pc.off('request', onReq);
  await pc.getByRole('button', { name: 'Larger text' }).click();
  await F.upTo(9);
  await toSettings(pc);
  ok((await pc.locator('#settings-camreader select').nth(2).inputValue()) === '40', 'Larger text in the app: the Settings page shows 40 px');

  // ---------------------------------------------------------------- Audiobook: both ways
  await pc.locator('#settings-audiobook select').nth(1).selectOption('96');
  await F.upTo(10);
  await go(pc, 'audiobook', '.tool-body select');
  ok((await pc.getByLabel('MP3 quality').inputValue()) === '96', 'the Audiobook opens with the MP3 quality chosen on the Settings page');
  await range(pc.getByRole('slider', { name: 'Speed' }), 0.75);
  got = await F.upTo(11);
  ok(got[10]?.json?.settings?.audiobook?.speed === 0.75, 'its speed set in the app: in the file');
  await toSettings(pc);
  ok((await pc.locator('#settings-audiobook input[type=range]').inputValue()) === '0.75', '… and on the Settings page');

  // ---------------------------------------------------------------- EPUB Reader: both ways (a book open)
  const eb = pc.locator('#settings-ebook select');
  await eb.nth(3).selectOption('sepia');
  await eb.nth(1).selectOption('24');
  await F.upTo(12, 20000, 2000);
  await go(pc, 'ebook', 'input[type=file]');
  await pc.locator('input[type=file]').first().setInputFiles(BOOK);
  await pc.waitForFunction(() => /^Pages? \d+/.test(document.querySelector('.ebr-where')?.textContent || ''), null, { timeout: 60000 });
  await pc.locator('.ebr-tools').getByRole('button', { name: 'Font, size, margins and theme' }).click();
  ok((await pc.getByRole('radio', { name: /Sepia/ }).getAttribute('aria-checked')) === 'true', 'the EPUB Reader opens a book in the theme chosen on the Settings page');
  ok((await pc.locator('.ebr-size').innerText()) === '24 px', '… at the text size chosen there');
  await pc.getByRole('radio', { name: /Dark/ }).click();
  got = await F.upTo(13);
  ok(got[12]?.json?.settings?.ebook?.theme === 'dark', 'a theme chosen in the reader: in the file');
  await toSettings(pc);
  ok((await eb.nth(3).inputValue()) === 'dark', '… and on the Settings page');

  // ---------------------------------------------------------------- Spell Checker: a word added in the app, taken out on the page
  await go(pc, 'spell', '.sp-text');
  const marks = () => pc.$$eval('.sp-back mark.sp-bad', (ms) => ms.map((m) => m.textContent));
  const waitMarks = (w) => pc.waitForFunction((s) => [...document.querySelectorAll('.sp-back mark.sp-bad')].map((m) => m.textContent).join('|') === s, w.join('|'), { timeout: 30000 });
  await pc.locator('.sp-text').fill('The qwyzx came with a zorblax.');
  await waitMarks(['qwyzx', 'zorblax']);
  await pc.getByRole('button', { name: 'Add to dictionary', exact: true }).click();
  await waitMarks(['zorblax']);
  got = await F.upTo(14);
  ok(JSON.stringify(got[13]?.json?.settings?.spell?.added) === '["qwyzx"]', `a word added to the dictionary: in the file (${JSON.stringify(got[13]?.json?.settings?.spell?.added)})`);
  await pc.reload();
  await pc.locator('.sp-text').waitFor();
  await pc.locator('.sp-text').fill('The qwyzx came with a zorblax.');
  await waitMarks(['zorblax']);
  ok(JSON.stringify(await marks()) === '["zorblax"]', 'the word stays added after a reload (kept in this browser)');
  await toSettings(pc);
  ok((await pc.locator('#settings-spell .st-words li span').allInnerTexts()).includes('qwyzx'), 'the Settings page lists the word');
  await pc.getByRole('button', { name: 'Take “qwyzx” out of your words' }).click();
  await pc.locator('#settings-spell select').selectOption('en-GB');
  got = await F.upTo(15, 20000, 2000);
  ok(JSON.stringify(got[14]?.json?.settings?.spell) === '{"lang":"en-GB","added":[]}', `taken out and the language chosen on the page: one file (${JSON.stringify(got[14]?.json?.settings?.spell)})`);
  await go(pc, 'spell', '.sp-text');
  ok((await pc.getByLabel('Language').inputValue()) === 'en-GB', 'the Spell Checker opens in that language');
  await pc.locator('.sp-text').fill('The qwyzx came with a zorblax.');
  await waitMarks(['qwyzx', 'zorblax']);
  ok(true, 'the word taken out on the Settings page is marked again in the app');

  // ---------------------------------------------------------------- World Clock: a set in the app, a city taken out on the page
  await go(pc, 'worldclock', '.wc-set');
  await pc.getByRole('button', { name: 'Stock markets', exact: true }).click();
  got = await F.upTo(16);
  ok(JSON.stringify(got[15]?.json?.settings?.worldclock?.cities) === JSON.stringify(MARKETS), `a set chosen in the World Clock: its cities in the file (${got[15]?.json?.settings?.worldclock?.cities?.length})`);
  await toSettings(pc);
  await pc.waitForFunction(() => document.querySelectorAll('#settings-worldclock .st-cities li').length === 11, null, { timeout: 10000 });
  ok((await pc.locator('#settings-worldclock .st-cities').innerText()).includes('Toronto'), 'the Settings page lists its cities');
  await pc.getByRole('button', { name: 'Take Toronto off the list' }).click();
  await pc.locator('#settings-worldclock select').selectOption('24');
  got = await F.upTo(17, 20000, 2000);
  const wc = got[16]?.json?.settings?.worldclock;
  ok(wc?.h24 === true && wc?.cities?.length === 10 && !wc.cities.includes('toronto-ca'), `a city taken out and 24 hours chosen on the page: one file (${JSON.stringify(wc)})`);
  await go(pc, 'worldclock', '.wc-card');
  ok(!(await pc.locator('li.wc-card[data-id="toronto-ca"]').count()) && (await pc.locator('li.wc-card[data-id="tokyo-jp"]').count()) === 1, 'the World Clock opens without Toronto');
  ok((await pc.getByRole('radio', { name: '24 h' }).getAttribute('aria-checked')) === 'true', '… on the 24-hour clock');
  ok(!(await pc.$$eval('.wc-card .wc-time', (ts) => ts.some((t) => /am|pm/i.test(t.textContent)))), 'its times have no am / pm');

  // ---------------------------------------------------------------- "after every change" off; Export now
  await toSettings(pc);
  const before = F.got.length;
  await pc.locator('label.switch', { hasText: 'Save a settings file after every change' }).click();
  await pc.locator('#settings-tts select').selectOption('am_michael');
  await F.upTo(before + 1, 2500, 0);
  ok(F.got.length === before, '"Save a settings file after every change" off: a change writes no file');
  await pc.getByRole('button', { name: 'Export settings now' }).click();
  got = await F.upTo(before + 1, 5000);
  ok(got.length === before + 1 && got[before].json?.settings?.tts?.voice === 'am_michael', 'Export settings now: a file at once, with the change');
  await pc.waitForFunction(() => /Last file: superutils_settings_\d{8}_\d{4}\.json — downloaded at/.test(document.querySelector('.st-last')?.textContent || ''), null, { timeout: 5000 });
  ok(true, 'the files card names the last file and that it was downloaded');
  await pc.reload(); await pc.locator('#settings-tts select').waitFor();
  ok(!(await pc.locator('label.switch', { hasText: 'Save a settings file after every change' }).locator('input').isChecked()), 'the switch stays off after a reload (this device\'s own setting)');
  ok(!('device' in (got[before].json?.settings || {})), 'and is not in the file');
  await pc.locator('label.switch', { hasText: 'Save a settings file after every change' }).click();
  await F.upTo(before + 2, 2500, 0);
  ok(F.got.length === before + 1, 'switching it on again writes no file by itself');

  // ---------------------------------------------------------------- import
  const imp = join(tmp, 'my-settings.json');
  writeFileSync(imp, JSON.stringify({
    app: 'SuperUtils', kind: 'settings', format: 1, saved: '2026-11-28T10:00:00+05:30', settings: {
      favorites: ['qr', 'hash', 'no-such-app'], tts: { voice: 'bm_george', speed: 0.75 }, worldclock: { cities: ['mumbai-in', 'london-gb'], h24: false },
      radio: { stations: ['x'] },
    },
  }));
  const importFile = async (path) => {
    const fc = pc.waitForEvent('filechooser');
    await pc.getByRole('button', { name: 'Import settings…' }).click();
    await (await fc).setFiles(path);
  };
  const k0 = F.got.length;
  await importFile(imp);
  await pc.locator('#settings-favorites li a').nth(1).waitFor({ timeout: 10000 });
  const note = await pc.locator('.st-page .note').first().innerText();
  ok(/Imported from my-settings\.json: Favorites, Text-to-Speech, World Clock\./.test(note), `the import says which sections it put back (${note.split('\n')[0]})`);
  ok(/1 app this site does not have left out \(no-such-app\)/.test(note) && /“radio”: not a section of this version/.test(note), 'and names what it left out');
  ok(JSON.stringify((await pc.locator('#settings-favorites li a').allInnerTexts()).map((s) => s.trim())) === JSON.stringify(['QR Generator', 'Hash / Checksum']), 'the favorites are the file\'s');
  ok((await pc.locator('#settings-tts select').inputValue()) === 'bm_george' && (await pc.locator('#settings-tts input[type=range]').inputValue()) === '0.75', 'the voice and speed are the file\'s');
  ok((await pc.locator('#settings-worldclock select').inputValue()) === '12' && (await pc.locator('#settings-worldclock .st-cities li').count()) === 2, 'the World Clock\'s cities and clock are the file\'s');
  ok((await pc.locator('#settings-camreader select').nth(2).inputValue()) === '40', 'a section the file does not hold is left as it was');
  got = await F.upTo(k0 + 1, 20000, 2000);
  ok(got.length === k0 + 1 && got[k0].json?.settings?.tts?.voice === 'bm_george', 'the import is a change: one settings file after it');
  // files that are no settings files
  const bad1 = join(tmp, 'other.json'), bad2 = join(tmp, 'broken.json');
  writeFileSync(bad1, '{"hello": 1}'); writeFileSync(bad2, '{ nope');
  await importFile(bad1);
  await pc.waitForFunction(() => /other\.json: .*not a SuperUtils settings file/.test(document.querySelector('.st-page .note')?.textContent || ''), null, { timeout: 5000 }).then(() => ok(true, 'a JSON file of another program is refused in words'), () => ok(false, 'a JSON file of another program is refused in words'));
  await importFile(bad2);
  await pc.waitForFunction(() => /broken\.json: .*not JSON/.test(document.querySelector('.st-page .note')?.textContent || ''), null, { timeout: 5000 }).then(() => ok(true, 'a file that is not JSON is refused in words'), () => ok(false, 'a file that is not JSON is refused in words'));
  await F.upTo(k0 + 2, 2500, 0);
  ok(F.got.length === k0 + 1 && (await pc.locator('#settings-tts select').inputValue()) === 'bm_george', 'a refused file changes nothing and writes no file');
  ok(!pc.errors.length, `no page errors ${pc.errors.join(' | ')}`);

  // ---------------------------------------------------------------- two tabs of the site: each follows the other, one file a change
  const a = await newPage({ viewport: { width: 1100, height: 900 }, settingsFiles: true });
  const b = await a.context().newPage();
  const bErr = []; b.on('pageerror', (e) => bErr.push(e.message));
  const FA = filesOf(a), FB = filesOf(b);
  await toSettings(a);
  await go(b, 'tts', 'select');
  await b.getByLabel('Voice', { exact: true }).selectOption('am_fenrir');
  await a.waitForFunction(() => document.querySelector('#settings-tts select')?.value === 'am_fenrir', null, { timeout: 5000 }).then(() => ok(true, 'a voice chosen in the app in one tab: the Settings page in another follows at once'), () => ok(false, 'a voice chosen in the app in one tab: the Settings page in another follows at once'));
  await FB.upTo(1, 6000);
  await a.locator('#settings-tts select').selectOption('bf_isabella');
  await b.waitForFunction(() => document.querySelector('select[aria-label="Voice"]')?.value === 'bf_isabella', null, { timeout: 5000 }).then(() => ok(true, '… and the reverse: the open app follows the Settings page of the other tab'), () => ok(false, '… and the reverse: the open app follows the Settings page of the other tab'));
  await FA.upTo(1, 6000, 2500);
  ok(FA.got.length === 1 && FB.got.length === 1, `each change writes one file, in the tab where it was made (${FA.got.length} + ${FB.got.length})`);
  ok(FB.got[0]?.json?.settings?.tts?.voice === 'am_fenrir' && FA.got[0]?.json?.settings?.tts?.voice === 'bf_isabella', `… each with its change (${FB.got[0]?.json?.settings?.tts?.voice}, ${FA.got[0]?.json?.settings?.tts?.voice})`);
  ok(!a.errors.length && !bErr.length, `no page errors in the two tabs ${[...a.errors, ...bErr].join(' | ')}`);

  // ---------------------------------------------------------------- a folder for the files (the browser's private file system stands in)
  // Chromium closes itself when a page reads a folder's handle back from IndexedDB in a private (Incognito) window (docs/BUGHUNT.md,
  // "Settings"): there the folder is kept for the visit only. The suite's pages are such windows; a normal profile is launched for the rest.
  const STUB = () => { window.showDirectoryPicker = async () => navigator.storage.getDirectory(); };
  const inFolder = (p) => p.evaluate(async () => {
    const d = await navigator.storage.getDirectory(), out = [];
    for await (const [name, h] of d.entries()) if (h.kind === 'file' && name.startsWith('superutils_settings_')) out.push({ name, json: JSON.parse(await (await h.getFile()).text()) });
    return out.sort((x, y) => y.name.localeCompare(x.name));
  });
  const folderLine = (p) => p.locator('.st-folder').innerText();
  const settled = (p) => p.waitForFunction(() => /written to the folder|downloaded at/.test(document.querySelector('.st-last')?.textContent || ''), null, { timeout: 9000 }).catch(() => {});
  const folderRun = async (p, normal, label) => {
    const FF = filesOf(p);
    await p.addInitScript(STUB);
    await toSettings(p);
    await p.getByRole('button', { name: 'Choose a folder for the files' }).click();
    await p.waitForFunction(() => /Files are written to the folder/.test(document.querySelector('.st-folder')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
    const line = await folderLine(p);
    ok(/Files are written to the folder/.test(line) && !/\bnull\b|undefined/.test(line), `${label}: a folder chosen, the page says the files go there`);
    ok(normal ? !/during this visit|private/.test(line) : /during this visit/.test(line) && /private \(Incognito\) window/.test(line),
      `${label}: ${normal ? 'remembered for later visits' : 'kept for this visit only, and why'} (${line.replace(/\s+/g, ' ').slice(0, 160)})`);
    await range(p.locator('#settings-tts input[type=range]'), 1.25);
    await settled(p);
    let inF = await inFolder(p);
    ok(inF.length === 1 && NAME.test(inF[0].name) && inF[0].json?.settings?.tts?.speed === 1.25, `${label}: a change — the file written into the folder (${inF.map((f) => f.name).join(', ')})`);
    ok(!FF.got.length, `${label}: … and not downloaded`);
    await p.reload(); await p.locator('#settings-tts select').waitFor();
    await p.waitForFunction(() => /Files are written to the folder|Choose a folder for the files/.test(document.querySelector('.st-folder')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
    const after = await folderLine(p);
    if (normal) {
      ok(/Files are written to the folder/.test(after), `${label}: the folder is remembered after a reload`);
      await range(p.locator('#settings-tts input[type=range]'), 1.75);
      await settled(p);
      inF = await inFolder(p);
      ok(inF.length <= 2 && inF[0]?.json?.settings?.tts?.speed === 1.75 && !FF.got.length, `${label}: the next change goes to the folder too (${inF.map((f) => f.name).join(', ')})`);
      await p.getByRole('button', { name: 'Download the files instead' }).click();
      await p.getByRole('button', { name: 'Choose a folder for the files' }).waitFor({ timeout: 5000 });
    } else {
      ok(/Choose a folder for the files/.test(after), `${label}: after a reload the folder is not read back (each file is downloaded until one is chosen again)`);
    }
    await range(p.locator('#settings-tts input[type=range]'), 1);
    await FF.upTo(1);
    ok(FF.got.length === 1 && FF.got[0].json?.settings?.tts?.speed === 1, `${label}: ${normal ? '"Download the files instead" — ' : ''}the next file is downloaded`);
  };
  const fo = await newPage({ viewport: { width: 1100, height: 900 }, settingsFiles: true });
  // what the page can know of the window (src/lib/settingsfile.ts, privateWindow(): a quota below twice the script heap's limit). The
  // suite's pages are private windows, but a browser may not show it: Google Chrome on GitHub's Windows runner gave its private window
  // the folder back after a reload without closing (the Windows check, run 20). Where the browser does not show it, the window is
  // treated as a normal one — and the handle read back from IndexedDB must then not close the browser
  await fo.goto(base);
  const seen = await fo.evaluate(async () => { const { quota } = await navigator.storage.estimate(); return { quota, heap: performance.memory?.jsHeapSizeLimit, ua: navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0] }; });
  const shown = !seen.quota || seen.quota < 2 * (seen.heap || 2 ** 30), gb = (n) => (n / 2 ** 30).toFixed(2);
  info(`the private window (${seen.ua}): quota ${gb(seen.quota)} GiB, script heap ${gb(seen.heap)} GiB — ${shown ? 'the browser shows it is private' : 'the browser does not show it is private: treated as a normal window'}`);
  await fo.goto('about:blank'); // the folder's stand-in is put in by an init script: the Settings page must be a new document
  await folderRun(fo, !shown, shown ? 'a private window' : 'a private window the browser does not show as one');
  ok(!fo.errors.length, `no page errors in the private window ${fo.errors.join(' | ')}`);
  const { chromium } = createRequire(import.meta.url)('playwright');
  const profile = mkdtempSync(join(tmp, 'profile-'));
  const normal = await chromium.launchPersistentContext(profile, { viewport: { width: 1100, height: 900 }, acceptDownloads: true, ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}) });
  try {
    const np = normal.pages()[0] || await normal.newPage();
    const nErr = []; np.on('pageerror', (e) => nErr.push(e.message));
    await folderRun(np, true, 'a normal profile');
    ok(!nErr.length, `no page errors in the normal profile ${nErr.join(' | ')}`);
  } finally { await normal.close().catch(() => {}); }

  // ---------------------------------------------------------------- WCAG 2.2 A / AA, light and dark (with favorites, words and cities)
  const ax = await newPage({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
  for (const scheme of ['light', 'dark']) {
    await ax.emulateMedia({ colorScheme: scheme });
    await ax.goto('about:blank');
    await ax.goto(`${base}#/`);
    await ax.evaluate(() => {
      localStorage.setItem('superutils.favorites.v1', JSON.stringify(['qr', 'tts']));
      localStorage.setItem('superutils.app.spell.v1', JSON.stringify({ lang: 'en-IN', added: ['Aadhaar', 'prepone'] }));
      localStorage.setItem('superutils.app.worldclock.v1', JSON.stringify({ cities: ['mumbai-in', 'london-gb'], h24: true }));
    });
    await ax.reload(); await ax.goto(`${base}#/settings`);
    await ax.locator('#settings-worldclock .st-cities li').nth(1).waitFor({ timeout: 10000 });
    if (!(await ax.evaluate(() => !!window.axe))) await ax.addScriptTag({ content: AXE });
    // a contrast failure names its colours (axe's data): what the browser drew is not seen here
    const v = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((m) => { const d = m.any?.[0]?.data; return m.target.join(' ') + (d?.contrastRatio ? ` (${d.fgColor} on ${d.bgColor}: ${d.contrastRatio} : 1, ${d.fontSize} ${d.fontWeight})` : ''); }).join(', ')}`), TAGS);
    ok(!v.length, `${scheme} theme: no WCAG 2.2 A / AA violation on the Settings page ${v.join(' | ')}`);
  }

  // ---------------------------------------------------------------- the phone
  const ph = await phoneLayout({ base, page: newPage, devices, ok }, 'settings', { ready: '#settings-tts select', buttons: ['Export settings now', 'Import settings…'] });
  const lb = await ph.locator('.settings-link').boundingBox();
  ok(lb && lb.width >= 44 && lb.height >= 44, `phone: the header's Settings link is a 44 px target (${lb && `${Math.round(lb.width)} × ${Math.round(lb.height)}`})`);
  ok(!(await ph.locator('.settings-link > span:not(.ic)').isVisible()) && (await ph.locator('.settings-link').getAttribute('aria-label')) === 'Settings', 'phone: the link is its icon (named for screen readers)');
  info(`${F.got.length} settings files on the PC page`);
};
