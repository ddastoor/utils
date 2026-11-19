// Emoji & Symbols (#/emoji) in the browser: the lists, the search (ranked by textcore.wasm: keywords, shortcodes,
// slips of the keyboard — the tab looked for the typed letters inside the name only), symbols by their names, skin
// tones, emoji this device cannot draw, copy, a failed download of the search engine, phone layout.
import { setValue, until, hookClipboard, copied } from './_devdata.mjs';

export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage({ viewport: { width: 1366, height: 900 } });
  const fetched = []; page.on('request', (r) => fetched.push(r.url()));
  await page.goto(`${base}#/emoji`);
  const q = page.getByRole('searchbox', { name: 'Search emoji and symbols' }); await q.waitFor();
  await page.locator('.emoji-cell').first().waitFor(); await hookClipboard(page);
  const wasm = () => fetched.filter((u) => /\.wasm/.test(u)).map((u) => u.split('/').pop().replace(/-[\w-]+\.wasm$/, ''));
  /** the cards under the search box: [title, [[character, what it says], …]] */
  const cards = () => page.evaluate(() => [...document.querySelectorAll('.card')].filter((c) => c.querySelector('.emoji-grid')).map((c) => [c.querySelector('h2, h3, .card-title')?.textContent ?? '', [...c.querySelectorAll('.emoji-cell')].map((b) => [b.textContent, b.title])]));
  /** type a query and wait until the cards (or the "nothing found" note) are those of this query */
  let n = 0;
  const search = async (text) => {
    const mark = `zzmark${++n}`; await setValue(q, mark); await until(page, (m) => document.body.textContent.includes(`Nothing found for "${m}"`), mark);
    await setValue(q, text); await until(page, (m) => !document.body.textContent.includes(`Nothing found for "${m}"`), mark);
    return cards();
  };
  const of = (cs, title) => (cs.find(([t]) => t.startsWith(title)) ?? ['', []])[1].map(([c]) => c);

  // ---- as the tab opens
  let cs = await cards();
  ok(cs.map(([t]) => t).join('|') === 'Smileys & Emotion|People & Body|Animals & Nature|Food & Drink|Travel & Places|Activities|Objects|Symbols|Flags', `the nine groups of Unicode in their order (${cs.length})`);
  const shown = cs.reduce((a, [, x]) => a + x.length, 0);
  // which Emoji versions can this browser draw? (found out here in another way than the tab does: is there colour in the picture?)
  const drawn = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 48; const x = c.getContext('2d', { willReadFrequently: true });
    const colour = (t) => { x.clearRect(0, 0, 48, 48); x.font = '32px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif'; x.textBaseline = 'top'; x.fillStyle = '#000'; x.fillText(t, 2, 2); const d = x.getImageData(0, 0, 48, 48).data; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && (Math.abs(d[i] - d[i + 1]) > 40 || Math.abs(d[i + 1] - d[i + 2]) > 40)) return true; return false; };
    return { base: colour('\u{1f600}'), v14: colour('\u{1fae0}'), v15: colour('\u{1fae8}'), v16: colour('\u{1fae9}'), v17: colour('\u{1faea}'), v18: colour('\u{1faeb}') }; });
  const left = (drawn.v17 ? 0 : 8) + (drawn.v18 ? 0 : 9), said = await page.locator('.emoji-new').textContent().catch(() => '');
  ok(drawn.base && drawn.v14 && drawn.v15, `this browser draws colour emoji up to Emoji ${drawn.v18 ? 18 : drawn.v17 ? 17 : drawn.v16 ? 16 : 15}`);
  ok(shown === 1923 - left && (left ? said.includes(`${left} newer emoji that this device cannot draw yet are left out.`) : !said), `${shown} emoji are shown; the ${left} of versions its font lacks are left out and the tab says so (they were empty boxes)`);
  const boxes = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 48; const x = c.getContext('2d', { willReadFrequently: true }); let bad = 0;
    for (const b of [...document.querySelectorAll('.emoji-cell')].filter((_, i) => i % 6 === 0)) { x.clearRect(0, 0, 48, 48); x.font = '32px "Noto Color Emoji", sans-serif'; x.textBaseline = 'top'; x.fillStyle = '#000'; x.fillText(b.textContent, 2, 2); const d = x.getImageData(0, 0, 48, 48).data; let ink = 0; for (let i = 3; i < d.length; i += 4) ink += d[i] > 0 ? 1 : 0; if (!ink) bad++; }
    return bad; });
  ok(boxes === 0, `every sixth emoji on the page drawn on a canvas: none comes out empty (${boxes})`);
  ok(wasm().length === 0, `no engine is fetched as the tab opens (${wasm().join(', ') || 'none'})`);
  ok(cs[0][1][0][0] === '\u{1f600}' && cs[0][1][0][1] === 'grinning face' && await page.locator('.emoji-cell').first().getAttribute('aria-label') === 'grinning face', 'a cell says its name (title and label)');
  if (left) { await page.getByRole('button', { name: 'Show them anyway' }).click(); await until(page, () => !document.querySelector('.emoji-new'));
    const all = (await cards()).reduce((a, [, x]) => a + x.length, 0); ok(all === 1923, `"Show them anyway": all 1,923 (${all})`); }

  // ---- the search
  cs = await search('namaste');
  ok(of(cs, 'Emoji').join(' ') === '\u{1f64f}' && cs[0][0] === 'Emoji — 1', `namaste → 🙏 (${cs.map(([t]) => t).join(', ')})`);
  ok(wasm().join(',') === 'textcore', `the search engine (textcore.wasm) is fetched with the first search (${wasm().join(', ')})`);
  cs = await search('thanks'); ok(of(cs, 'Emoji')[0] === '\u{1f64f}', 'thanks → 🙏 first — its name is "folded hands", and the tab found nothing');
  cs = await search('happy'); ok(of(cs, 'Emoji').length >= 10 && of(cs, 'Emoji').slice(0, 8).includes('\u{1f600}'), `happy → the smiling faces (${of(cs, 'Emoji').slice(0, 6).join(' ')} …); the tab found nothing`);
  cs = await search('lol'); ok(of(cs, 'Emoji').slice(0, 6).includes('\u{1f602}'), `lol → 😂 among the first (${of(cs, 'Emoji').slice(0, 6).join(' ')}); the tab found a lollipop`);
  cs = await search('thumbsup'); ok(of(cs, 'Emoji')[0] === '\u{1f44d}', 'thumbsup → 👍');
  cs = await search('flag india'); ok(of(cs, 'Emoji')[0] === '\u{1f1ee}\u{1f1f3}', `flag india → 🇮🇳 first (${of(cs, 'Emoji').join(' ')})`);
  cs = await search('India FLAG'); ok(of(cs, 'Emoji')[0] === '\u{1f1ee}\u{1f1f3}', 'any case, any word order');
  cs = await search('folded hands'); ok(of(cs, 'Emoji')[0] === '\u{1f64f}', 'by its name: folded hands');
  cs = await search('hapy brithday'); ok(of(cs, 'Emoji')[0] === '\u{1f382}', `slips of the keyboard: "hapy brithday" → 🎂 (${of(cs, 'Emoji').slice(0, 4).join(' ')})`);
  cs = await search('ok'); ok(of(cs, 'Emoji').slice(0, 3).includes('\u{1f44c}') && !of(cs, 'Emoji').includes('\u{1f4d6}'), `"ok" → 👌, not every name with o-k inside it (${of(cs, 'Emoji').length} found; the tab listed 31, books and broken hearts among them)`);
  cs = await search('rupee');
  ok(of(cs, 'Symbols').join('') === '₹' && of(cs, 'Emoji').includes('\u{1fa99}') && cs[0][0].startsWith('Emoji'), `rupee → ₹ among the symbols and the coin among the emoji, whichever list is open (${cs.map(([t, x]) => `${t}: ${x.map(([c]) => c).join(' ')}`).join(' | ')})`);
  ok(cs.find(([t]) => t.startsWith('Symbols'))[1][0][1] === 'Indian rupee sign · U+20B9', 'a symbol says its name and its code point');
  cs = await search('heart'); ok(of(cs, 'Emoji').length > 40 && of(cs, 'Emoji').includes('❤\ufe0f') && of(cs, 'Symbols').join('') === '❤♥♡', `heart → ${of(cs, 'Emoji').length} emoji and the three heart symbols`);
  cs = await search('zzzzqqq'); ok(!cs.length && await page.getByText('Nothing found for "zzzzqqq".').isVisible(), 'nothing found, said with the words that were typed');
  // a character itself
  cs = await search('\u{1f64f}\u{1f3fd}'); ok(cs.length === 1 && cs[0][1].length === 1 && cs[0][1][0][1] === 'folded hands', 'an emoji pasted into the box (any skin tone) is found: that is how to learn its name');
  cs = await search('→'); ok(of(cs, 'Symbols').join('') === '→' && cs[0][1][0][1] === 'Rightwards arrow · U+2192', 'a symbol pasted into the box');
  // fast typing: the last text wins
  for (const part of ['f', 'fi', 'fir', 'fire']) await setValue(q, part);
  ok(await until(page, () => document.querySelector('.emoji-grid .emoji-cell')?.textContent === '\u{1f525}'), 'typed fast: the results are those of the last text (fire → 🔥 first)');
  { const ms = await page.evaluate(async () => { const e = document.querySelector('input[type=search][aria-label]'); let worst = 0; for (const v of ['s', 'sm', 'smi', 'smil', 'smile', 'a', '']) { e.value = v; const t = performance.now(); e.dispatchEvent(new Event('input', { bubbles: true })); await Promise.resolve(); worst = Math.max(worst, performance.now() - t); } return worst; });
    ok(ms < 150, `a keystroke takes at most ${ms.toFixed(0)} ms (the whole list of 1,900 is drawn anew when the box is emptied)`); }

  // ---- copy
  await search('namaste'); await page.locator('.emoji-cell').first().click();
  ok((await copied(page)).at(-1) === '\u{1f64f}' && (await page.locator('.emoji-status').textContent()) === 'Copied \u{1f64f} — folded hands', `a tap copies, and the line under the box says what was copied (${await page.locator('.emoji-status').textContent()})`);
  await search('birthday'); await q.press('Enter');
  ok((await copied(page)).at(-1) === '\u{1f382}', 'Enter in the search box copies the best match (🎂)');
  await setValue(q, ''); const nCopies = (await copied(page)).length; await q.press('Enter');
  ok((await copied(page)).length === nCopies, 'Enter in an empty box copies nothing');

  // ---- skin tones
  const tones = page.getByRole('radiogroup', { name: 'Skin tone' });
  ok(await tones.getByRole('radio').count() === 6 && await tones.getByRole('radio', { name: 'Skin tone: Default' }).getAttribute('aria-checked') === 'true', 'six skin tones to choose from, the plain one chosen');
  await tones.getByRole('radio', { name: 'Skin tone: Medium', exact: true }).click();
  cs = await cards(); const people = of(cs, 'People & Body');
  ok(people[0] === '\u{1f44b}\u{1f3fd}' && cs[1][1][0][1] === 'waving hand: medium skin tone' && of(cs, 'Smileys & Emotion')[0] === '\u{1f600}', `Medium: hands and people take the tone (${people.slice(0, 4).join(' ')}), faces stay yellow`);
  ok(people.filter((c) => c.includes('\u{1f3fd}')).length === 332, `332 emoji have the tone (${people.filter((c) => c.includes('\u{1f3fd}')).length})`);
  cs = await search('thumbs up'); await page.locator('.emoji-cell').first().click();
  ok((await copied(page)).at(-1) === '\u{1f44d}\u{1f3fd}' && (await page.locator('.emoji-status').textContent()) === 'Copied \u{1f44d}\u{1f3fd} — thumbs up: medium skin tone', 'the search shows and copies the chosen tone (👍🏽)');
  cs = await search('people holding hands'); ok(of(cs, 'Emoji')[0] === '\u{1f9d1}\u{1f3fd}\u200d\u{1f91d}\u200d\u{1f9d1}\u{1f3fd}', 'two people holding hands: both in the tone');
  await tones.getByRole('radio', { name: 'Skin tone: Default' }).click(); await setValue(q, '');
  ok(await until(page, () => document.querySelectorAll('.emoji-grid')[1]?.querySelector('.emoji-cell')?.textContent === '\u{1f44b}'), 'back to the plain one');

  // ---- symbols
  await page.getByRole('radio', { name: 'Symbols', exact: true }).click();
  cs = await cards();
  ok(cs.map(([t]) => t).join('|') === 'Arrows|Math|Greek|Superscripts & subscripts|Currency|Punctuation|Check & stars|Misc' && cs.reduce((a, [, x]) => a + x.length, 0) === 237, `eight groups of symbols, 237 in all (${cs.reduce((a, [, x]) => a + x.length, 0)})`);
  ok(cs[4][1][0].join(' | ') === '₹ | Indian rupee sign · U+20B9' && cs[1][1].some(([c, t]) => c === '√' && t === 'Square root · U+221A') && cs[2][1][0][1] === 'Greek small letter alpha · U+03B1', 'every symbol has its Unicode name and code point (they had the code point only)');
  ok(await tones.isHidden(), 'no skin tones beside the list of symbols');
  for (const [word, want] of [['euro', '€'], ['pi', 'π'], ['half', '½'], ['degree', '°'], ['infinity', '∞'], ['tick', '✓'], ['copyright', '©'], ['sqrt', '√'], ['not equal', '≠'], ['squared', '²'], ['bullet', '•'], ['em dash', '—'], ['left arrow', '←'], ['alpha', 'α'], ['trademark', '™'], ['20b9', '₹']]) {
    cs = await search(word); const s = of(cs, 'Symbols');
    ok(cs[0][0].startsWith('Symbols') && s.slice(0, word === 'left arrow' ? 6 : word === 'tick' ? 2 : 1).includes(want), `${word} → ${want} (${s.slice(0, 5).join(' ')}) — symbols were found by the name of their group only`);
  }
  cs = await search('arrows'); ok(of(cs, 'Symbols').length >= 28 && of(cs, 'Symbols').includes('⟷'), `the name of a group still finds its symbols (arrows: ${of(cs, 'Symbols').length})`);
  cs = await search('rupee'); await page.locator('.emoji-cell').first().click();
  ok(cs[0][0] === 'Symbols — 1' && (await copied(page)).at(-1) === '₹' && (await page.locator('.emoji-status').textContent()) === 'Copied ₹ — Indian rupee sign · U+20B9', 'with the symbols open they come first; a tap copies ₹');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- the search engine cannot be fetched
  { const p2 = await newPage({ viewport: { width: 1366, height: 900 } }); let block = true, tries = 0;
    await p2.route(/textcore-[\w-]+\.wasm/, (route) => { tries++; return block ? route.abort() : route.continue(); });
    await p2.goto(`${base}#/emoji`); const box = p2.getByRole('searchbox', { name: 'Search emoji and symbols' }); await p2.locator('.emoji-cell').first().waitFor();
    await setValue(box, 'heart');
    ok(await until(p2, () => /The search could not be loaded/.test(document.body.textContent)) && await p2.locator('.emoji-cell').count() > 1800, 'the engine cannot be fetched: the tab says so and the lists stay');
    await setValue(box, '\u{1f64f}'); ok(await until(p2, () => document.querySelectorAll('.emoji-cell').length === 1 && document.querySelector('.emoji-cell').title === 'folded hands'), 'a pasted emoji needs no engine');
    const before = tries; block = false; await setValue(box, 'hearts');
    ok(await until(p2, () => document.querySelector('.emoji-grid .emoji-cell')?.title.includes('heart') && !/could not be loaded/.test(document.body.textContent)) && tries > before, 'the next key fetches it again and the search works');
    // leaving while the engine is on its way
    const p3 = await newPage({ viewport: { width: 1366, height: 900 } });
    await p3.route(/textcore-[\w-]+\.wasm/, async (route) => { await new Promise((res) => setTimeout(res, 600)); await route.continue().catch(() => {}); });
    await p3.goto(`${base}#/emoji`); await p3.locator('.emoji-cell').first().waitFor(); await setValue(p3.getByRole('searchbox', { name: 'Search emoji and symbols' }), 'heart'); await p3.goto(`${base}#/morse`); await p3.waitForTimeout(1200);
    ok(!p2.errors.filter((e) => !/Failed to load resource|ERR_FAILED/.test(e)).length && !p3.errors.length, `no page errors, also when the tab is left while the engine is on its way ${[...p2.errors, ...p3.errors].join(' | ')}`); }

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/emoji`); await ph.locator('.emoji-cell').first().waitFor(); await hookClipboard(ph);
  const m = await ph.evaluate(() => { const box = (e) => e.getBoundingClientRect(); const tb = [...document.querySelectorAll('.tone-btn')].map(box), cell = box(document.querySelector('.emoji-cell'));
    return { wide: document.documentElement.scrollWidth <= innerWidth, cell: [cell.width, cell.height], tone: Math.min(...tb.flatMap((b) => [b.width, b.height])), oneRow: new Set(tb.map((b) => Math.round(b.top))).size === 1, font: parseFloat(getComputedStyle(document.querySelector('input[type=search][aria-label]')).fontSize), seg: Math.min(...[...document.querySelectorAll('.seg-btn')].map((b) => box(b).height)) }; });
  ok(m.wide, 'phone: no sideways scroll');
  ok(m.cell[0] >= 44 && m.cell[1] >= 44, `phone: a cell is ${m.cell.map((v) => Math.round(v)).join(' × ')} px`);
  ok(m.tone >= 44 && m.oneRow, `phone: the six skin tones are ${m.tone} px and stand in one row`);
  ok(m.font >= 16 && m.seg >= 44, `phone: the search box is written in ${m.font} px, the list switch is ${Math.round(m.seg)} px high`);
  await setValue(ph.getByRole('searchbox', { name: 'Search emoji and symbols' }), 'chai'); await ph.locator('.emoji-grid .emoji-cell').first().waitFor();
  await until(ph, () => document.querySelector('.emoji-grid .emoji-cell')?.textContent === '☕'); await ph.locator('.emoji-cell').first().tap();
  ok((await copied(ph)).at(-1) === '☕' && !ph.errors.length, `phone: chai → ☕, a tap copies it ${ph.errors.join(' | ')}`);
};
