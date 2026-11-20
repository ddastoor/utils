// Every tab when its engine cannot be downloaded (a dropped connection: .wasm files, vendor/, models/, data/ and font
// files refused). Twelve tabs that start their engine as they open (JSON, Base64, JWT, XML, JSON → Types, JSON Diff, SQL
// Formatter, Terminal, JSON Schema, Base Encoder, Binary Decoder, QR Generator) left the failure uncaught: a page error
// and a tab that did nothing, without a word; Resume Builder printed Emscripten's "Aborted(both async and sync fetching
// of the wasm failed). Build with -sASSERTIONS for more info." Now every tab says it, and "Try again" works once the
// connection is back.
const ENGINE = /\.wasm(\?|$)|\/vendor\/|\/models\/|\/data\/|\/assets\/.*\.(ttf|woff2?)$/;
const QUIET_BEFORE = ['json', 'base64', 'jwt', 'xml', 'json2types', 'jsondiff', 'sqlfmt', 'terminal', 'jsonschema', 'baseenc', 'bindecode', 'qr'];

export default async ({ base, page: newPage, ok }) => {
  const list = await newPage({ viewport: { width: 1366, height: 900 } });
  await list.goto(base); await list.locator('.tile').first().waitFor();
  const ids = [...new Set(await list.evaluate(() => [...document.querySelectorAll('a.tile')].map((a) => a.getAttribute('href').replace(/^#\//, '')).filter((x) => x && !x.startsWith('c/'))))];
  ok(ids.length > 150, `${ids.length} desktop tabs`);

  // four pages side by side, each through a quarter of the tabs
  const errors = [], said = {};
  await Promise.all([0, 1, 2, 3].map(async (k) => {
    const page = await newPage({ viewport: { width: 1366, height: 900 } });
    await page.context().route(ENGINE, (r) => r.abort('failed'));
    let cur = '';
    page.on('pageerror', (e) => errors.push(`${cur}: ${e.message.slice(0, 120)}`));
    await page.goto(base); await page.locator('.tile').first().waitFor();
    for (const id of ids.filter((_, i) => i % 4 === k)) {
      cur = id;
      await page.evaluate((id) => { location.hash = `#/${id}`; }, id);
      await page.locator('.tool-body').waitFor({ timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1200);
      // the first obvious action: a keystroke in the first text box, else the main button
      await page.evaluate(() => {
        const t = [...document.querySelectorAll('.tool-body textarea:not([readonly]), .tool-body input[type=text]:not([readonly])')].find((x) => x.offsetParent);
        if (t) { t.value = `${t.value || ''} 12`; t.dispatchEvent(new Event('input', { bubbles: true })); }
        else [...document.querySelectorAll('.tool-body .btn.primary, .actions .btn.primary')].find((x) => x.offsetParent && !x.disabled)?.click();
      }).catch(() => {});
      await page.waitForTimeout(900);
      said[id] = await page.evaluate(() => document.querySelector('.tool-body .load-failed, .tool-body .note-err')?.textContent || '');
    }
  }));
  ok(errors.length === 0, `no tab leaves a failed download uncaught (${errors.length}: ${errors.slice(0, 6).join(' | ')})`);
  const mute = QUIET_BEFORE.filter((id) => !/could not be downloaded: Failed to fetch.*Check your internet connection/.test(said[id] || ''));
  ok(mute.length === 0, `the twelve tabs that start their engine as they open say it, with "Try again" (silent: ${mute.join(', ') || 'none'})`);
  ok(/Cannot make the PDF: Failed to fetch|could not be downloaded: Failed to fetch/.test(said.resume || '') && !/Aborted|ASSERTIONS/.test(said.resume || ''), `Resume Builder says it in words (${(said.resume || '').slice(0, 80)})`);
  ok(/Could not load this tool: Failed to fetch/.test(said.calc || ''), 'a tab whose start needs its engine: the shell\'s note, as before');

  // "Try again" once the connection is back: the tab works
  const back = await newPage({ viewport: { width: 1366, height: 900 } });
  await back.context().route(ENGINE, (r) => r.abort('failed'));
  await back.goto(`${base}#/json`);
  const note = back.locator('.load-failed');
  ok(await note.waitFor({ timeout: 15000 }).then(() => true, () => false), 'JSON Formatter offline: the note');
  await back.context().unroute(ENGINE);
  await note.getByRole('button', { name: 'Try again' }).click();
  ok(await back.waitForFunction(() => /"name"|"id"|\{/.test([...document.querySelectorAll('.tool-body textarea[readonly], .tool-body .outbox textarea')].map((t) => t.value).join('')), null, { timeout: 20000 }).then(() => true, () => false)
    && await back.locator('.load-failed').count() === 0, 'Try again with the connection back: the tab formats its sample');
  ok(back.errors.filter((e) => !/Failed to fetch|Failed to load resource: net::ERR_FAILED/.test(e)).length === 0, `no other errors (${back.errors.join(' | ').slice(0, 160)})`);
};
