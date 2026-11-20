// Lorem Ipsum (#/lorem) in the browser: Latin from the lipsum crate's Markov chain (textkit-lorem.wasm) — the text
// held to the crate's own texts (tests/fixtures/lorem/reference.json), exact counts of paragraphs, sentences and words
// (also as the Word Counter tab counts them), the classic opening, the limits the old tab had (50 of anything), the
// count box and its refusals, plain text and HTML, the seed kept until Regenerate, copy, a failed download, phone.
import { readFileSync } from 'node:fs';
import { setValue, until, hookClipboard, copied, notes } from './_devdata.mjs';

const REF = JSON.parse(readFileSync(new URL('../fixtures/lorem/reference.json', import.meta.url), 'utf8'));
const PAIRS = new Set(REF.pairs);
const bare = (w) => w.toLowerCase().replace(/[^a-z]/g, '');
const sentencesOf = (t) => t.split(/(?<=[.?!])\s+/).filter(Boolean);

export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage({ viewport: { width: 1366, height: 900 } });
  const fetched = []; page.on('request', (r) => fetched.push(r.url()));
  await page.goto(`${base}#/lorem`);
  const box = page.getByRole('textbox', { name: 'How many' }), out = page.getByRole('textbox', { name: 'Generated text' }), info = page.locator('.lorem-info');
  await until(page, () => document.querySelector('.lorem-info')?.textContent);
  /** set the count; wait until the line under the text has changed */
  const setN = async (n) => { const before = await info.textContent(); await setValue(box, String(n)); await until(page, (b) => document.querySelector('.lorem-info').textContent !== b || document.querySelector('.note-warn, .note.warn'), before); return out.inputValue(); };
  const unit = async (u) => { const before = await info.textContent(); await page.getByRole('radio', { name: u, exact: true }).click(); await until(page, (b) => document.querySelector('.lorem-info').textContent !== b, before); return out.inputValue(); };
  const unlearned = (t) => { const w = t.split(/\s+/).filter(Boolean); for (let i = 1; i < w.length; i++) if (!PAIRS.has(`${bare(w[i - 1])} ${bare(w[i])}`)) return `${w[i - 1]} ${w[i]}`; return ''; };

  // ---- as the tab opens
  let t = await out.inputValue();
  const paras = t.split('\n\n');
  ok(paras.length === 3 && t.startsWith(REF.classic + ' '), `three paragraphs, the first beginning with the classic sentence word for word ("${t.slice(0, 60)}…")`);
  ok(paras.every((p) => sentencesOf(p).length >= 4 && sentencesOf(p).length <= 8), `four to eight sentences a paragraph (${paras.map((p) => sentencesOf(p).length).join(', ')})`);
  ok(!unlearned(t) && /,/.test(paras[1]), 'every two neighbouring words follow each other in Cicero or the classic passage; commas inside sentences (the tab had none)');
  ok(sentencesOf(t.replace(/\n\n/g, ' ')).every((s) => /^[A-Z]/.test(s) && /[.?!]$/.test(s) && s.split(' ').length <= 40), 'every sentence begins with a capital, ends with . ? or !, and has at most 40 words');
  const words = t.split(/\s+/).length, sents = sentencesOf(t.replace(/\n\n/g, ' ')).length;
  ok(await info.textContent() === `3 paragraphs · ${sents} sentences · ${words} words · ${[...t].length.toLocaleString('en-IN')} characters`, `the line under the text says what was made (${await info.textContent()})`);
  ok(fetched.filter((u) => /\.wasm/.test(u)).map((u) => u.split('/').pop().replace(/-[\w-]{8}\.wasm$/, '')).join() === 'textkit-lorem', 'one engine is fetched: textkit-lorem.wasm (the crypto engine is no longer needed)');

  // ---- counts beyond the old limit of 50
  await unit('Words');
  ok(await box.inputValue() === '50' && (await out.inputValue()).split(' ').length === 50, 'Words start at 50');
  t = await setN(300); ok(t.split(' ').length === 300 && t.startsWith('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do') && sentencesOf(t).length > 5, `300 words — the tab stopped at 50 — in ${sentencesOf(t).length} sentences, not one sentence of 300 words`);
  t = await setN(20000); ok(t.split(' ').length === 20000 && (await info.textContent()).includes('20,000 words'), '20,000 words');
  t = await setN('1,000'); ok(t.split(' ').length === 1000, 'a digit comma in the box: 1,000 words');
  t = await setN(5); ok(t === 'Lorem ipsum dolor sit amet.', `5 words: "${t}"`);
  t = await setN(1); ok(t === 'Lorem.', '1 word');
  await unit('Sentences'); ok(await box.inputValue() === '5' && sentencesOf(await out.inputValue()).length === 5, 'Sentences start at 5');
  t = await setN(500); ok(sentencesOf(t).length === 500 && sentencesOf(t)[0] === REF.classic, '500 sentences, the classic one first');
  await unit('Paragraphs'); t = await setN(200); ok(t.split('\n\n').length === 200 && !unlearned(t), '200 paragraphs, every word pair learned from the texts');
  // the same counts by the Word Counter tab
  await setN(7); t = await out.inputValue(); const said = await info.textContent();
  const wc = await newPage({ viewport: { width: 1366, height: 900 } }); await wc.goto(`${base}#/wordcount`);
  await setValue(wc.locator('textarea').first(), t);
  const wcNum = () => wc.evaluate(() => { const big = (l) => [...document.querySelectorAll('.big-result')].find((r) => r.querySelector('.big-label')?.textContent === l)?.querySelector('.big-value')?.textContent; const s = [...document.querySelectorAll('.kv > span')]; const kv = (l) => s[s.findIndex((e) => e.textContent === l) + 1]?.textContent; return [kv('Paragraphs'), big('Sentences'), big('Words')]; });
  await until(wc, () => [...document.querySelectorAll('.kv > span')].some((s, i, a) => s.textContent === 'Paragraphs' && a[i + 1]?.textContent === '7'));
  const [wcp, wcs, wcw] = await wcNum();
  ok(said === `7 paragraphs · ${wcs} sentences · ${wcw} words · ${[...t].length.toLocaleString('en-IN')} characters` && wcp === '7', `the Word Counter tab counts the same: ${wcp} paragraphs, ${wcs} sentences, ${wcw} words (${said})`);
  await wc.close();

  await box.focus(); await box.press('ArrowUp'); await until(page, () => /^8 paragraphs/.test(document.querySelector('.lorem-info').textContent));
  ok(await box.inputValue() === '8' && (await out.inputValue()).split('\n\n').length === 8, '↑ in the box: one more');
  await box.press('ArrowDown'); await box.press('ArrowDown'); await until(page, () => /^6 paragraphs/.test(document.querySelector('.lorem-info').textContent));
  ok(await box.inputValue() === '6', '↓ twice: two fewer');
  // ---- the count box refuses what it cannot make, and keeps the last text
  const keep = await out.inputValue();
  for (const [v, msg] of [['0', 'The number of paragraphs cannot be below 1.'], ['', 'Type how many paragraphs you want.'], ['201', 'At most 200 paragraphs at a time.'], ['2.5', 'Type a whole number of paragraphs.']]) {
    await setValue(box, v); await until(page, (m) => document.body.textContent.includes(m), msg);
    ok((await notes(page)).includes(msg) && await out.inputValue() === keep && await box.getAttribute('aria-invalid') === 'true', `"${v}": ${msg} — the text stays`);
  }
  await setN(2); ok((await out.inputValue()).split('\n\n').length === 2 && !(await notes(page)).includes('cannot') && await box.getAttribute('aria-invalid') === null, 'a good number again: the note is gone');

  // ---- the same text until Regenerate
  await setN(3); const three = await out.inputValue(); await setN(5); const five = await out.inputValue();
  ok(five.startsWith(three + '\n\n'), 'five paragraphs begin with the three that were there (a new number does not throw the text away)');
  await page.getByRole('radio', { name: 'HTML <p>' }).click(); await until(page, () => document.querySelector('textarea[aria-label="Generated text"]').value.startsWith('<p>'));
  t = await out.inputValue();
  ok(t === five.split('\n\n').map((p) => `<p>${p}</p>`).join('\n'), 'HTML: the same paragraphs, each in a <p> element');
  ok((await info.textContent()).startsWith('5 paragraphs'), 'the line still counts the text, not the tags');
  await page.getByRole('radio', { name: 'Plain text' }).click(); await until(page, () => !document.querySelector('textarea[aria-label="Generated text"]').value.startsWith('<p>'));
  ok(await out.inputValue() === five, 'and back to plain text: the same text');
  await page.locator('label.switch').filter({ hasText: /Start with/ }).click(); await until(page, (f) => document.querySelector('textarea[aria-label="Generated text"]').value !== f, five);
  t = await out.inputValue(); ok(!t.startsWith('Lorem') && t.split('\n\n').length === 5 && !unlearned(t) && REF.starts.includes(bare(t.split(' ')[0])), `without the classic opening it begins where one of Cicero's sentences begins ("${t.split(' ').slice(0, 4).join(' ')}…")`);
  const beforeRegen = await out.inputValue(); await page.getByRole('button', { name: 'Regenerate' }).click(); await until(page, (b) => document.querySelector('textarea[aria-label="Generated text"]').value !== b, beforeRegen);
  ok(await out.inputValue() !== beforeRegen && (await out.inputValue()).split('\n\n').length === 5, 'Regenerate: a new text of the same size');

  // ---- copy
  await hookClipboard(page);
  await page.locator('.actions').getByRole('button', { name: 'Copy', exact: true }).click();
  ok((await copied(page)).at(-1) === await out.inputValue(), 'Copy gives the text');
  await page.getByRole('radio', { name: 'HTML <p>' }).click(); await until(page, () => document.querySelector('textarea[aria-label="Generated text"]').value.startsWith('<p>'));
  await page.locator('.outbox').getByRole('button', { name: 'Copy' }).click();
  ok((await copied(page)).at(-1).startsWith('<p>') && (await copied(page)).at(-1) === await out.inputValue(), 'the copy button of the box gives the HTML');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- the engine cannot be fetched
  { const p2 = await newPage({ viewport: { width: 1366, height: 900 } }); let block = true, tries = 0;
    await p2.route(/textkit-lorem-[\w-]+\.wasm/, (route) => { tries++; return block ? route.abort() : route.continue(); });
    await p2.goto(`${base}#/lorem`);
    ok(await until(p2, () => /text generator could not be loaded/.test(document.body.textContent)) && await p2.getByRole('textbox', { name: 'How many' }).isVisible(), 'the generator cannot be fetched: the tab says so, the form is there');
    const before = tries; block = false; await p2.getByRole('button', { name: 'Regenerate' }).click();
    ok(await until(p2, () => document.querySelector('textarea[aria-label="Generated text"]').value.startsWith('Lorem ipsum') && !/could not be loaded/.test(document.body.textContent)) && tries > before, 'Regenerate fetches it again and the text comes');
    ok(!p2.errors.filter((e) => !/Failed to load resource|ERR_FAILED/.test(e)).length, `no page errors ${p2.errors.join(' | ')}`); }

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/lorem`); await until(ph, () => document.querySelector('.lorem-info')?.textContent);
  const m = await ph.evaluate(() => { const r = (s) => [...document.querySelectorAll(s)].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect());
    return { wide: document.documentElement.scrollWidth <= innerWidth, btn: Math.min(...r('.actions .btn, .seg-btn').map((b) => b.height)), font: parseFloat(getComputedStyle(document.querySelector('.lorem-count')).fontSize), mode: document.querySelector('.lorem-count').inputMode, sticky: getComputedStyle(document.querySelector('.actions')).position }; });
  ok(m.wide && m.btn >= 44, `phone: no sideways scroll, buttons ${Math.round(m.btn)} px high`);
  ok(m.font >= 16 && m.mode === 'numeric', `phone: the count box is written in ${m.font} px and brings up the number keys`);
  ok(m.sticky === 'sticky' || m.sticky === 'fixed', `phone: Regenerate and Copy stay at the bottom (${m.sticky})`);
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
