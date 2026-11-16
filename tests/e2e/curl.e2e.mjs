// cURL Converter (#/curl, PC only): the real curl binary and the generated Node fetch / Python requests code are all run
// against a local HTTP server here, and must send the same request (method, path + query, headers, body); quoting
// ($'…', double quotes, line continuations), -u basic auth, -G, --data-urlencode, --json, -F form; errors; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { createServer } from 'node:http';
import { execFileSync, execFile } from 'node:child_process';
// async: the HTTP server lives in this process, a synchronous child would deadlock it
const run = (cmd, args) => new Promise((res) => execFile(cmd, args, { timeout: 15000 }, () => res()));
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
export default async (ctx) => {
  const { base, page: newPage, ok, tmp, info } = ctx;
  const got = [];
  const srv = createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { got.push({ method: req.method, url: req.url, h: req.headers, body: b }); res.end('ok'); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port, U = `http://127.0.0.1:${port}`;
  const page = await newPage(); await page.goto(`${base}#/curl`);
  const ta = page.locator('textarea').nth(0), out = page.locator('textarea').nth(1); await ta.waitFor();
  const conv = async (cmd, lang) => { await page.getByRole('radio', { name: lang }).click(); await ta.fill(cmd); await page.waitForTimeout(250); return out.inputValue(); };
  const pick = (r) => ({ method: r.method, url: r.url, body: r.body, ct: r.h['content-type'] || '', auth: r.h.authorization || '', x: r.h['x-trace-id'] || '', ua: r.h['user-agent'] || '', cookie: r.h.cookie || '' });
  const cmds = [
    `curl -X POST '${U}/v1/orders?ref=web' \\\n  -H 'Authorization: Bearer TOKEN' \\\n  -H 'Content-Type: application/json' \\\n  -H "X-Trace-Id: abc 123" \\\n  -d '{"item":"chai","qty":2,"gift":false,"note":"it\\'s"}'`.replace("it\\'s", 'its'),
    `curl ${U}/search -G --data-urlencode 'q=masala dosa & chai' -d page=2 -u asha:p@ss -A 'MyAgent/1.0' -b 'sid=xyz'`,
    `curl --json '{"a":[1,2,{"b":null}]}' ${U}/api/json`,
    `curl -X PUT ${U}/items/7 --data-raw $'line1\\nline2' -H 'Content-Type: text/plain'`,
    `curl -d 'name=Asha&city=Pune' ${U}/form -sS -L --compressed`,
  ];
  let pyOk = true; try { execFileSync('python3', ['-c', 'import requests']); } catch { pyOk = false; info('python requests missing — Python check skipped'); }
  for (const cmd of cmds) {
    got.length = 0; await run('bash', ['-c', cmd.replace(/--compressed/, '')]); const real = pick(got[0]);
    const js = await conv(cmd, 'Node.js'); const f = join(tmp, `c${Math.random().toString(36).slice(2)}.mjs`); writeFileSync(f, js); got.length = 0; await run('node', [f]); const viaNode = got[0] ? pick(got[0]) : null;
    const diffOf = (a) => !a ? 'no request' : Object.keys(real).filter((k) => k !== 'ua' && JSON.stringify(a[k]) !== JSON.stringify(real[k])).map((k) => `${k}: ${JSON.stringify(a[k])} ≠ ${JSON.stringify(real[k])}`).join('; ');
    const same = (a) => a && a.method === real.method && a.url === real.url && a.body === real.body && a.ct.split(';')[0] === real.ct.split(';')[0] && a.auth === real.auth && a.x === real.x && a.cookie === real.cookie && (real.ua.startsWith('curl') || a.ua === real.ua);
    ok(same(viaNode), `Node fetch sends what curl sends: ${real.method} ${real.url} ${diffOf(viaNode)}`);
    if (pyOk) { const p = await conv(cmd, 'Python requests'); got.length = 0; await run('python3', ['-c', p]); const pp = got[0] && pick(got[0]); ok(same(pp), `Python requests sends what curl sends (${real.method} ${real.url}) ${same(pp) ? '' : diffOf(pp)}`); }
  }
  // form upload
  const ff = join(tmp, 'photo.txt'); writeFileSync(ff, 'FILEDATA');
  const fcmd = `curl -F 'title=Hello' -F 'file=@${ff}' ${U}/upload`;
  got.length = 0; await run('bash', ['-c', fcmd]); const realF = got[0];
  const pf = await conv(fcmd, 'Python requests'); got.length = 0; if (pyOk) { await run('python3', ['-c', pf]); ok(got[0] && /multipart\/form-data/.test(got[0].h['content-type']) && got[0].body.includes('FILEDATA') && got[0].body.includes('Hello') && realF.body.includes('FILEDATA'), '-F file upload → multipart in Python too'); }
  const go = await conv(cmds[0], 'Go net/http'); ok(go.includes('http.NewRequest("POST", ' + JSON.stringify(`${U}/v1/orders?ref=web`)) && go.includes('req.Header.Set("Authorization", "Bearer TOKEN")'), 'Go output');
  const raw = await conv(cmds[2], 'Raw HTTP'); ok(raw.startsWith('POST /api/json HTTP/1.1\nHost: 127.0.0.1:') && raw.includes(`Content-Length: ${Buffer.byteLength('{"a":[1,2,{"b":null}]}')}`), 'raw HTTP with Content-Length');
  const fe = await conv(cmds[2], 'JavaScript fetch'); ok(fe.includes('body: JSON.stringify(') && fe.includes('"Content-Type": "application/json"'), 'JSON body shown as an object');
  await conv('wget http://x', 'Node.js'); ok(/must start with curl/.test(await page.locator('.note-warn').textContent()), 'not curl → message');
  await conv("curl 'http://x", 'Node.js'); ok(/Unclosed single quote/.test(await page.locator('.note-warn').textContent()), 'unclosed quote → message');
  await conv('curl -H "A: b"', 'Node.js'); ok(/No URL/.test(await page.locator('.note-warn').textContent()), 'no URL → message');
  srv.close();
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'curl');
};
