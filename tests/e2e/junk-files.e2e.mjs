// Files that are not what a tab expects, in every file picker of every tab (desktop): an empty file and 2 KB of random
// bytes named like the file the picker asks for. No tab may throw (uncaught errors and rejections), and where a tab used
// to stay silent or take the bytes as text, it says what is wrong. Text tabs also read a file saved in Windows-1252
// (Notepad, Excel) as it was written: File.text() turned "café" into "caf�".
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const TEXT_TABS = ['python', 'patch', 'logview', 'yaml', 'jq', 'sqlfmt', 'prettier', 'json2types', 'jsondiff', 'jsonschema'];
export default async (ctx) => {
  const { base, page: newPage, ok, tmp } = ctx;
  const page = await newPage({ viewport: { width: 1366, height: 900 } });
  const thrown = []; let cur = '';
  page.on('pageerror', (e) => thrown.push(`${cur}: ${e.message.slice(0, 140)}`));
  await page.goto(base); await page.waitForSelector('.tile');
  const ids = [...new Set(await page.evaluate(() => [...document.querySelectorAll('a.tile')].map((a) => a.getAttribute('href').replace(/^#\//, '')).filter((x) => x && !x.startsWith('c/'))))];
  const rnd = Buffer.alloc(2048); for (let i = 0; i < rnd.length; i++) rnd[i] = (i * 2654435761 >>> 13) & 255;
  const said = () => page.evaluate(() => [...document.querySelectorAll('.toast, .note-err, .note-warn, .err-text, .ff-info')].map((e) => e.textContent).join(' | '));
  let pickers = 0; const silentText = [], notDecoded = [];
  for (const id of ids) {
    cur = id;
    await page.goto(`${base}#/${id}`); await page.waitForSelector('.tool-body', { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(300);
    const input = page.locator('.tool-body input[type=file]').first();
    if (!(await input.count())) continue;
    pickers++;
    const accept = (await input.getAttribute('accept')) || '';
    const ext = accept.split(',').map((x) => x.trim()).find((x) => x.startsWith('.')) || { 'image/*': '.jpg', 'audio/*': '.mp3', 'video/*': '.mp4', 'application/pdf': '.pdf' }[accept.split(',')[0].trim()] || '.bin';
    for (const [nm, data] of [[`empty${ext}`, Buffer.alloc(0)], [`junk${ext}`, rnd]]) {
      const p = join(tmp, `${id}-${nm}`); writeFileSync(p, data);
      await input.setInputFiles(p).catch(() => {}); await page.waitForTimeout(id === 'ffmpeg' ? 12000 : 1500);
      if (nm.startsWith('junk') && TEXT_TABS.includes(id) && !/is not a text file/.test(await said())) silentText.push(id);
    }
    if (TEXT_TABS.includes(id)) { // Windows-1252: é is 0xE9
      const p = join(tmp, `${id}-cafe${ext}`); writeFileSync(p, Buffer.from([0x23, 0x20, 0x63, 0x61, 0x66, 0xe9, 0x0a]));
      await input.setInputFiles(p); await page.waitForTimeout(800);
      const boxes = await page.evaluate(() => [...document.querySelectorAll('.tool-body textarea')].map((x) => x.value).join('\n') + '\n' + document.querySelector('.tool-body').innerText); // the Log Viewer shows the file in its own view
      if (!boxes.includes('café')) notDecoded.push(`${id} (${JSON.stringify(boxes.slice(0, 30))})`);
    }
  }
  ok(pickers > 60, `${pickers} tabs with a file picker were given an empty file and random bytes`);
  ok(!thrown.length, `no tab throws on a file that is nothing ${thrown.slice(0, 6).join(' | ')}`);
  ok(!silentText.length, `the text tabs refuse a binary file in words (they put it into the editor as garbage) ${silentText.join(', ')}`);
  ok(!notDecoded.length, `the text tabs read a Windows-1252 file as written: "café" (File.text() gave "caf�") ${notDecoded.join(', ')}`);
  // the QR scanner and FFmpeg said nothing at all
  await page.goto(`${base}#/scan`); await page.waitForSelector('.tool-body');
  const pj = join(tmp, 'scan-junk.jpg'); writeFileSync(pj, rnd);
  await page.locator('.tool-body input[type=file]').first().setInputFiles(pj); await page.waitForTimeout(2500);
  ok(/is not a picture this browser can read/.test(await said()) && !(await page.locator('.scan-text').count()), `QR scanner: a file that is no picture is said (it showed an empty code with a Copy button) — ${(await said()).slice(0, 120)}`);
  await page.goto(`${base}#/ffmpeg`); await page.waitForSelector('.tool-body');
  const pf = join(tmp, 'ff-junk.mp4'); writeFileSync(pf, rnd);
  await page.locator('.tool-body input[type=file]').first().setInputFiles(pf);
  await page.locator('.ff-info').getByText(/no video, sound or subtitles/).waitFor({ timeout: 90000 }).catch(() => {});
  ok(/FFmpeg finds no video, sound or subtitles in this file/.test(await page.locator('.ff-info').textContent()), `FFmpeg: a file without media is said at once (it was found out only by a job) — ${(await page.locator('.ff-info').textContent()).slice(0, 140)}`);
};
