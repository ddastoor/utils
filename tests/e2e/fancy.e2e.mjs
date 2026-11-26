// Fancy Text (#/fancy) in the browser: the eighteen styles against the Unicode Character Database
// (tests/fixtures/fancy/reference.json — characters looked up by their names, python3 scripts/make-fancy-reference.py),
// what the tab wrote wrongly before (digits, brackets, emoji and Hindi in the styles that work character by
// character), several lines, copy by button and by a tap on the row, long texts, the engine that tells characters
// apart (textkit.wasm: fetched with the first text that goes beyond Latin letters; a failed download), phone layout.
import { readFileSync } from 'node:fs';
import { setValue, until, hookClipboard, copied } from './_devdata.mjs';

const REF = JSON.parse(readFileSync(new URL('../fixtures/fancy/reference.json', import.meta.url), 'utf8'));
const NAMES = ['Bold', 'Italic', 'Bold italic', 'Script', 'Bold script', 'Fraktur', 'Double-struck', 'Sans-serif', 'Sans bold', 'Sans italic', 'Monospace', 'Circled', 'Fullwidth', 'Small caps', 'Upside down', 'Strikethrough', 'Underline', 'Squared'];
const UP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', LOW = 'abcdefghijklmnopqrstuvwxyz', DIG = '0123456789';

export default async ({ base, page: newPage, ok, devices }) => {
  const page = await newPage({ viewport: { width: 1366, height: 900 } });
  const fetched = []; page.on('request', (q) => fetched.push(q.url()));
  await page.goto(`${base}#/fancy`);
  const ta = page.locator('textarea[aria-label="Text to style"]'); await ta.waitFor();
  const rows = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.fancy-row')].map((r) => [r.querySelector('.case-name').textContent, r.querySelector('.case-val').textContent])));
  /** put a text in the box; the three styles that work character by character may wait for the engine */
  const styles = async (s) => { await setValue(ta, s); await until(page, () => !document.querySelector('textarea').value || document.querySelectorAll('.fancy-row .case-val')[15].textContent !== ''); return rows(); };
  const kitFetched = () => fetched.filter((u) => /textkit-[\w-]+\.wasm/.test(u)).length;

  // ---- as the tab opens
  let r = await rows();
  ok(Object.keys(r).join('|') === NAMES.join('|'), `eighteen styles in their order (${Object.keys(r).length})`);
  ok(r.Bold === '𝐒𝐮𝐩𝐞𝐫𝐔𝐭𝐢𝐥𝐬' && r['Upside down'] === 'slᴉʇՈɹǝdnS' && r.Squared === '🅂🅄🄿🄴🅁🅄🅃🄸🄻🅂', `the sample is styled at once (${r.Bold}, ${r['Upside down']})`);
  ok(!fetched.some((u) => /\.wasm|\/vendor\/|\/models\/|\/data\//.test(u)), 'nothing is fetched as the tab opens: the styles are tables');
  ok(await ta.evaluate((e) => e.tagName === 'TEXTAREA' && e.rows >= 2), 'the text goes into a box of several lines (it was a one-line field)');

  // ---- the alphabets against the Unicode Character Database, through the page
  r = await styles(`${UP}\n${LOW}\n${DIG}`);
  const wrong = Object.entries(REF).filter(([k]) => !k.startsWith('_')).filter(([name, [caps, small, digits]]) => r[name] !== `${caps}\n${small}\n${digits ?? DIG}`).map(([k]) => k);
  ok(Object.keys(REF).filter((k) => !k.startsWith('_')).length === 14 && !wrong.length, `fourteen alphabets are the characters Unicode names for them ${wrong.join(', ')}`);
  const unassigned = await page.evaluate((x) => Object.entries(x).filter(([, v]) => /\p{Cn}/u.test(v)).map(([k]) => k), r);
  ok(!unassigned.length, `no style writes a code point that is not assigned ${unassigned.join(', ')}`);
  const back = await page.evaluate((x) => Object.entries(x).filter(([k]) => !['Small caps', 'Upside down', 'Strikethrough', 'Underline', 'Squared'].includes(k)).filter(([, v]) => v.normalize('NFKC') !== 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789').map(([k]) => k), r);
  ok(!back.length, `the browser's own normalisation (NFKC) turns thirteen styles back into the plain text ${back.join(', ')}`);
  ok(r['Small caps'] === `${UP}\nᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ\n${DIG}`, `small capitals (${r['Small caps'].split('\n')[1]})`);

  // ---- known answers
  r = await styles('SuperTools 2026');
  ok(r.Bold === '𝐒𝐮𝐩𝐞𝐫𝐓𝐨𝐨𝐥𝐬 𝟐𝟎𝟐𝟔' && r.Monospace === '𝚂𝚞𝚙𝚎𝚛𝚃𝚘𝚘𝚕𝚜 𝟸𝟶𝟸𝟼' && r['Double-struck'] === '𝕊𝕦𝕡𝕖𝕣𝕋𝕠𝕠𝕝𝕤 𝟚𝟘𝟚𝟞', `bold, monospace, double-struck (${r.Bold})`);
  ok(r.Fullwidth === 'ＳｕｐｅｒＴｏｏｌｓ\u3000２０２６' && r['Small caps'] === 'SᴜᴘᴇʀTᴏᴏʟꜱ 2026', `fullwidth and small caps (${r['Small caps']})`);
  ok(r.Circled === 'ⓈⓤⓟⓔⓡⓉⓞⓞⓛⓢ ②⓪②⑥', `circled digits too — the tab left them plain (${r.Circled})`);
  r = await styles('Hello!');
  ok(r.Italic === '𝐻𝑒𝑙𝑙𝑜!' && r.Script === 'ℋℯ𝓁𝓁ℴ!' && r.Fraktur === 'ℌ𝔢𝔩𝔩𝔬!', `italic h, script H e o and Fraktur H are the letterlike symbols (${r.Script})`);
  ok(r.Strikethrough === 'H\u0336e\u0336l\u0336l\u0336o\u0336!\u0336' && r.Underline === 'H\u0332e\u0332l\u0332l\u0332o\u0332!\u0332', 'a line through and a line under every character');

  // ---- upside down
  ok(r['Upside down'] === '¡ollǝH', `upside down: ${r['Upside down']}`);
  r = await styles('Room 69 (first floor) [B]');
  ok(r['Upside down'] === '[ꓭ] (ɹoolɟ ʇsɹᴉɟ) 69 ɯooꓤ', `6 and 9 change into each other and brackets change places — the tab wrote "96" and ")…(" (${r['Upside down']})`);
  r = await styles('café déjà vu, naïve — “Ångström” isn’t ₹500… • ok');
  ok(kitFetched() === 0 && r.Strikethrough.startsWith('c\u0336a\u0336f\u0336é\u0336'.normalize('NFC')) && r['Upside down'].endsWith('ɟɐɔ'), `Latin text needs no engine — accents, curly quotes, dashes, the ellipsis and ₹ included (${kitFetched()} fetched)`);
  r = await styles('Go 👍🏽 India 🇮🇳!');
  ok(kitFetched() === 1, `the engine that tells characters apart (textkit.wasm) is fetched with the first text that has an emoji or another script (${kitFetched()})`);
  ok(r['Upside down'] === '¡🇮🇳 ɐᴉpuI 👍🏽 oꓨ'.replace('ꓨ', '⅁'), `an emoji with its skin tone and a flag stay whole when the text is turned (${r['Upside down']})`);
  ok(r.Strikethrough.includes('👍🏽\u0336') && r.Strikethrough.includes('🇮🇳\u0336') && r.Underline.includes('👍🏽\u0332'), 'a mark goes after the whole emoji, not between the hand and its colour or between the two halves of a flag');
  r = await styles('नमस्ते दुनिया');
  ok(r.Bold === 'नमस्ते दुनिया' && r.Circled === 'नमस्ते दुनिया', 'Hindi has no styled alphabets and stays as it is');
  ok([...r.Strikethrough].filter((c) => c === '\u0336').length === 7, `Hindi struck through: one mark for each of its seven characters, not one after every vowel sign (${[...r.Strikethrough].filter((c) => c === '\u0336').length})`);
  ok(r['Upside down'] === 'यानिदु स्तेमन', `Hindi turned round by whole characters, every vowel sign on its letter (${r['Upside down']})`);
  r = await styles('café déjà vu');
  ok(r.Bold.normalize('NFKC') === 'café déjà vu' && !/[a-zé]/.test(r.Bold.replace(/ /g, '')), `accented letters take the style and keep their accents — "é" stayed plain between bold letters (${r.Bold})`);

  // ---- several lines
  r = await styles('one\ntwo');
  ok(r.Bold === '𝐨𝐧𝐞\n𝐭𝐰𝐨' && r['Upside down'] === 'oʍʇ\nǝuo' && r.Strikethrough === 'o\u0336n\u0336e\u0336\nt\u0336w\u0336o\u0336', 'lines stay lines; turned upside down the last line comes first; a line break gets no mark');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.fancy-val')).whiteSpace === 'pre-wrap'), 'the rows show the line breaks');

  // ---- copy
  await hookClipboard(page);
  await styles('abc 1');
  await page.getByRole('button', { name: 'Copy Circled' }).click();
  ok((await copied(page)).join('|') === 'ⓐⓑⓒ ①', `the button of a row copies its style (${(await copied(page)).join('|')})`);
  await page.locator('.fancy-row').filter({ hasText: 'Fraktur' }).locator('.case-val').click();
  await page.locator('.fancy-row').filter({ hasText: 'Squared' }).locator('.case-name').click();
  ok((await copied(page)).slice(1).join('|') === '𝔞𝔟𝔠 1|🄰🄱🄲 1', `"tap to copy": a tap anywhere on a row copies it — it did nothing (${(await copied(page)).slice(1).join('|')})`);
  const names = await page.evaluate(() => [...document.querySelectorAll('.fancy-row button')].map((b) => b.title || b.getAttribute('aria-label')));
  ok(new Set(names).size === 18 && names.every((n, i) => n === `Copy ${['Bold', 'Italic', 'Bold italic', 'Script', 'Bold script', 'Fraktur', 'Double-struck', 'Sans-serif', 'Sans bold', 'Sans italic', 'Monospace', 'Circled', 'Fullwidth', 'Small caps', 'Upside down', 'Strikethrough', 'Underline', 'Squared'][i]}`), `every copy button says what it copies (eighteen were all called "Copy"): ${names.slice(0, 3).join(', ')} …`);
  await styles('');
  const before = (await copied(page)).length; await page.getByRole('button', { name: 'Copy Bold', exact: true }).click(); await page.locator('.fancy-row').first().click();
  ok((await copied(page)).length === before && Object.values(await rows()).every((v) => v === ''), 'an empty box: empty rows, and nothing is copied');

  // ---- long texts
  const long = 'The quick brown fox jumps over the lazy dog 123. '.repeat(4000); // 200,000 characters
  const t0 = Date.now(); await setValue(ta, long);
  const settled = await until(page, () => document.querySelector('.fancy-val').textContent.endsWith('…'), null, 20000); const took = Date.now() - t0;
  r = await rows();
  ok(settled && took < 3000, `200,000 characters are on screen in ${took} ms (the tab stood still for two minutes)`);
  ok(Object.values(r).every((v) => v.endsWith('…')) && r.Bold.slice(0, -1).normalize('NFKC') === long.slice(0, 2000) && r.Fullwidth.length === 2001, `a long text is shown up to its first 2,000 characters (${[...r.Bold].length - 1} bold ones)`);
  ok(r['Upside down'].startsWith(' ˙ƐᄅƖ ƃop ʎzɐl') && r['Upside down'].length === 2001, `turned upside down it begins with its end, as the whole result does (${r['Upside down'].slice(0, 16)})`);
  ok(await page.locator('p', { hasText: 'A long text is shown up to its first 2,000 characters' }).isVisible(), 'and the tab says so');
  await page.getByRole('button', { name: 'Copy Bold', exact: true }).click(); await page.getByRole('button', { name: 'Copy Upside down' }).click();
  { const c = (await copied(page)).slice(-2);
    ok(c[0].normalize('NFKC') === long && [...c[0]].length === long.length, `Copy gives all of it (${[...c[0]].length.toLocaleString('en-IN')} characters)`);
    ok(c[1].length === long.length && c[1].startsWith(' ˙ƐᄅƖ ƃop ʎzɐl') && c[1].endsWith('ǝɥꓕ'), `… also turned upside down (${c[1].slice(-12)})`); }
  { const typing = await page.evaluate(() => { const e = document.querySelector('textarea'); const t = performance.now(); for (let k = 0; k < 10; k++) { e.value += 'x'; e.dispatchEvent(new Event('input', { bubbles: true })); } return (performance.now() - t) / 10; });
    ok(typing < 30, `a keystroke at the end of 200,000 characters takes ${typing.toFixed(1)} ms`); }
  r = await styles('a'.repeat(1998) + '👍🏽👍🏽👍🏽');
  ok(r.Fullwidth === 'ａ'.repeat(1998) + '…' && r['Small caps'] === 'ᴀ'.repeat(1998) + '…' && r.Bold === '𝐚'.repeat(1998) + '…' && r.Strikethrough === 'a\u0336'.repeat(1998) + '…', `the cut never falls inside a character: an emoji with its skin tone at the 2,000th place is left out whole (${r.Fullwidth.slice(-3)})`);
  ok(r['Upside down'].startsWith('👍🏽👍🏽👍🏽ɐɐɐ') && r['Upside down'].endsWith('ɐ…'), 'upside down: the emoji at the end of the text come first, whole');
  const hindi = 'नमस्ते 🙏 '.repeat(20000); // 180,000 characters through the engine
  const t1 = Date.now(); r = await styles(hindi); const took1 = Date.now() - t1;
  await page.getByRole('button', { name: 'Copy Underline' }).click();
  { const c = (await copied(page)).at(-1);
    ok(took1 < 3000 && r.Underline.startsWith('न\u0332म\u0332स्ते\u0332 \u0332🙏\u0332') && r.Underline.endsWith('…') && c.length === hindi.length + 6 * 20000, `180,000 characters of Hindi and emoji: on screen in ${took1} ms, and Copy underlines every one of the 1,20,000 characters`); }
  r = await styles('short again');
  ok(r.Bold === '𝐬𝐡𝐨𝐫𝐭 𝐚𝐠𝐚𝐢𝐧' && await page.locator('p', { hasText: 'A long text is shown' }).isHidden(), 'a short text again: whole rows, the note is gone');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);

  // ---- the engine cannot be fetched
  { const p2 = await newPage({ viewport: { width: 1366, height: 900 } }); let block = true, tries = 0;
    await p2.route(/textkit-[\w-]+\.wasm/, (route) => { tries++; return block ? route.abort() : route.continue(); });
    await p2.goto(`${base}#/fancy`); const box = p2.locator('textarea').first(); await box.waitFor(); await hookClipboard(p2);
    const get = () => p2.evaluate(() => Object.fromEntries([...document.querySelectorAll('.fancy-row')].map((x) => [x.querySelector('.case-name').textContent, x.querySelector('.case-val').textContent])));
    await setValue(box, 'plain text'); let q = await get();
    ok(tries === 0 && q.Strikethrough === 'p\u0336l\u0336a\u0336i\u0336n\u0336 \u0336t\u0336e\u0336x\u0336t\u0336' && !(await p2.locator('.note.warn, .note-warn').count()), 'Latin text is styled in full without it');
    await setValue(box, 'नमस्ते 🙏');
    const said = await until(p2, () => /could not be loaded/.test(document.body.textContent)); q = await get();
    ok(said && q.Bold === 'नमस्ते 🙏' && q.Circled === 'नमस्ते 🙏' && q.Strikethrough === '' && q.Underline === '' && q['Upside down'] === '', 'a text with Hindi and an emoji: fifteen styles are there, the three that work character by character stay empty, and the tab says why');
    await p2.getByRole('button', { name: 'Copy Strikethrough' }).click(); await p2.getByRole('button', { name: 'Copy Bold', exact: true }).click();
    ok((await copied(p2)).join('|') === 'नमस्ते 🙏', `an empty row copies nothing; the others copy (${(await copied(p2)).join('|')})`);
    const before = tries; block = false; await setValue(box, 'नमस्ते 🙏!');
    const back = await until(p2, () => document.querySelectorAll('.fancy-row .case-val')[15].textContent !== '' && !/could not be loaded/.test(document.body.textContent)); q = await get();
    ok(back && tries > before && q.Strikethrough === 'न\u0336म\u0336स्ते\u0336 \u0336🙏\u0336!\u0336' && q['Upside down'] === '¡🙏 स्तेमन', `the next change fetches it again and the rows are filled (${q['Upside down']})`);
    // leaving while the engine is on its way
    const p3 = await newPage({ viewport: { width: 1366, height: 900 } });
    await p3.route(/textkit-[\w-]+\.wasm/, async (route) => { await new Promise((res) => setTimeout(res, 600)); await route.continue().catch(() => {}); });
    await p3.goto(`${base}#/fancy`); await p3.locator('textarea').first().waitFor(); await setValue(p3.locator('textarea').first(), '🙏'); await p3.goto(`${base}#/morse`); await p3.waitForTimeout(1200);
    ok(!p2.errors.filter((e) => !/Failed to load resource|ERR_FAILED/.test(e)).length && !p3.errors.length, `no page errors, also when the tab is left while the engine is on its way ${[...p2.errors, ...p3.errors].join(' | ')}`); }

  // ---- phone
  const ph = await newPage(devices['iPhone 13']); await ph.goto(`${base}#/fancy`); await ph.locator('.fancy-row').first().waitFor();
  await hookClipboard(ph);
  await setValue(ph.locator('textarea').first(), 'Supercalifragilisticexpialidocious_without_any_space_to_break_at_0123456789 👍🏽');
  const m = await ph.evaluate(() => ({ wide: document.documentElement.scrollWidth <= innerWidth, btn: Math.min(...[...document.querySelectorAll('.fancy-row button')].flatMap((b) => { const q = b.getBoundingClientRect(); return [q.width, q.height]; })), font: parseFloat(getComputedStyle(document.querySelector('textarea')).fontSize) }));
  ok(m.wide, 'phone: a long word without spaces does not make the page scroll sideways');
  ok(m.btn >= 44, `phone: the copy buttons are ${m.btn} px (44 px and more)`);
  ok(m.font >= 16, `phone: the text box is written in ${m.font} px (iPhones zoom into smaller boxes)`);
  await ph.locator('.fancy-row').filter({ hasText: 'Monospace' }).locator('.case-val').tap();
  ok((await copied(ph)).join('|').startsWith('𝚂𝚞𝚙𝚎𝚛𝚌𝚊𝚕𝚒'), 'phone: a tap on a row copies it');
  ok(!ph.errors.length, `phone: no page errors ${ph.errors.join(' | ')}`);
};
