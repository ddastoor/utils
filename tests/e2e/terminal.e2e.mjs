// Linux Terminal (#/terminal, PC only): BusyBox wasm in a worker + our shell; real file upload/download round trips.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';
const F = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));

export default async ({ base, page: newPage, ok, download, devices }) => {
  const page = await newPage();
  await page.goto(base + '#/terminal');
  await page.waitForFunction(() => /Welcome to the SuperUtils terminal/.test(document.querySelector('.term-out')?.textContent || ''), null, { timeout: 30000 });
  const out = () => page.locator('.term-out').innerText();
  const run = async (cmd) => {
    const before = (await out()).length;
    await page.locator('.term-in').fill(cmd);
    await page.locator('.term-in').press('Enter');
    await page.waitForFunction(() => !document.querySelector('.term-line')?.classList.contains('busy'), null, { timeout: 60000 });
    await page.waitForTimeout(50);
    return (await out()).slice(before);
  };
  ok(/user@superutils:~\$/.test(await page.locator('.term-prompt').innerText()), 'prompt shows user@superutils:~$');
  ok((await run('echo hello world')).includes('hello world'), 'echo');
  ok(/README\.txt/.test(await run('mkdir -p folder && ls')), 'ls lists the home directory');
  ok(await page.locator('.term-out span[style*="color"]').count() > 0, 'ls colours (ANSI → styled spans)');
  ok((await run('echo "2^100" | bc')).includes('1267650600228229401496703205376'), 'bc arbitrary precision');
  ok(/n 1\s+n 2\s+n 3/.test(await run('seq 3 | xargs -n 1 echo n')), 'xargs (spawn shim) in the worker');
  ok((await run('uname -a')).includes('superutils'), 'uname');
  ok((await run('nosuch')).includes('command not found'), 'unknown command');
  ok(await page.locator('.term-err').count() > 0, 'stderr shown in red');

  // Tab completion and history
  await page.locator('.term-in').fill('ech');
  await page.locator('.term-in').press('Tab');
  // completion is answered by the shell worker: wait for it
  await page.waitForFunction(() => document.querySelector('.term-in').value === 'echo ', null, { timeout: 5000 }).catch(() => {});
  ok((await page.locator('.term-in').inputValue()) === 'echo ', 'Tab completes the command name');
  await page.locator('.term-in').fill('');
  await page.locator('.term-in').press('ArrowUp');
  ok((await page.locator('.term-in').inputValue()) === 'nosuch', 'ArrowUp recalls history');
  await page.locator('.term-in').fill('');

  // upload a real photo, hash it inside the terminal
  const fc = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload' }).click();
  await (await fc).setFiles(F('coffee.jpg'));
  await page.waitForSelector('.term-file:has-text("coffee.jpg")', { timeout: 10000 });
  const want = createHash('sha256').update(readFileSync(F('coffee.jpg'))).digest('hex');
  ok((await run('sha256sum coffee.jpg')).includes(want), 'uploaded file is byte-identical (sha256sum in the terminal)');
  ok((await run('stat -c %s coffee.jpg')).includes(String(readFileSync(F('coffee.jpg')).length)), 'stat sees the uploaded size');

  // create an archive in the terminal and download it
  await run('mkdir pics && cp coffee.jpg pics/ && echo note > pics/n.txt && tar -czf pics.tgz pics');
  await page.waitForSelector('.term-file:has-text("pics.tgz")', { timeout: 10000 });
  const tgz = readFileSync(await download(page, () => page.getByRole('button', { name: 'Download pics.tgz' }).click()));
  const tar = zlib.gunzipSync(tgz);
  const names = []; for (let o = 0; o + 512 <= tar.length; o += 512) { const n = tar.subarray(o, o + 100).toString().replace(/\0.*$/s, ''); if (!n) break; names.push(n); const size = parseInt(tar.subarray(o + 124, o + 136).toString().replace(/\0.*$/s, '').trim() || '0', 8); o += Math.ceil(size / 512) * 512; }
  ok(names.includes('pics/coffee.jpg') && names.includes('pics/n.txt'), `downloaded .tgz is valid (${names.join(', ')})`);
  const tarDir = readFileSync(await download(page, () => page.getByRole('button', { name: 'Download pics as .tar' }).click()));
  ok(tarDir.subarray(257, 262).toString() === 'ustar', 'folder download is a tar archive');

  // folder navigation from the file panel
  await page.locator('.term-file.dir', { hasText: 'pics' }).click();
  await page.waitForFunction(() => /~\/pics/.test(document.querySelector('.term-prompt')?.textContent || ''));
  ok((await run('ls')).includes('n.txt'), 'clicking a folder cds into it');

  // multi-line paste runs as a script
  await page.locator('.term-in').evaluate((el) => { const dt = new DataTransfer(); dt.setData('text/plain', 'for i in 1 2 3\ndo echo line$i\ndone\n'); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
  await page.waitForFunction(() => /line3/.test(document.querySelector('.term-out')?.textContent || ''), null, { timeout: 30000 });
  ok(true, 'multi-line paste runs as one script');
  await page.locator('.term-in').press('Control+l');
  ok((await out()).trim() === '', 'Ctrl+L clears the screen');
  ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);

  // Ctrl+C during a running command: said why nothing happens (it did nothing, without a word)
  await page.locator('.term-in').fill('sleep 3'); await page.locator('.term-in').press('Enter');
  await page.waitForTimeout(400);
  await page.locator('.term-in').press('Control+c');
  ok(await page.getByText('A running command cannot be interrupted in a browser tab; it stops by itself after 60 s.').isVisible(), 'Ctrl+C during a command says why it goes on');
  await page.waitForFunction(() => !document.querySelector('.term-line')?.classList.contains('busy'), null, { timeout: 30000 });
  // a file removed while its download waits: said in words (it said "File error (44)")
  await page.locator('.term-in').fill('sleep 2; rm n.txt'); await page.locator('.term-in').press('Enter');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Download n.txt' }).click();
  ok(await page.getByText(/n\.txt: no such file or folder \(removed or renamed meanwhile\?\)/).first().waitFor({ timeout: 10000 }).then(() => true, () => false), 'a file removed while its download waited: said in words');

  const phone = await newPage({ ...devices['iPhone 13'] });
  await phone.goto(base + '#/terminal');
  ok(/PC|computer|desktop/i.test(await phone.locator('body').innerText()), 'phone: explains the terminal is PC only');
};
