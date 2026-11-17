// cURL Converter (#/curl, PC only). Ground truth = the real curl run by the real bash against a local HTTP server: the
// generated Node fetch, Python requests and Go net/http programs are run against the same server and must send the
// same request (method, path + query, body bytes, the headers the command sets). Covers the bug hunt of Nov 2026:
// $'…' escapes as Chrome/Firefox write them, Windows cmd carets, bundled / attached short options, options with
// values, pipes and redirects, -d @file, --data-binary, --data-urlencode name@file, here-documents, -I, -T,
// --oauth2-bearer, URLs without a scheme, repeated headers, two --json, exact JSON bytes (big numbers), CRLF bodies,
// non-ASCII -u, -F parts with ;type= / ;filename=, notes for what is left out; errors; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { createServer } from 'node:http';
import { execFileSync, execFile } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
// async: the HTTP server lives in this process, a synchronous child would deadlock it
const run = (cmd, args, opts = {}) => new Promise((res) => execFile(cmd, args, { timeout: 60000, ...opts }, (err, so, se) => res({ err, so, se })));
export default async (ctx) => {
  const { base, page: newPage, ok, tmp, info } = ctx;
  const got = [];
  const srv = createServer((req, res) => { const b = []; req.on('data', (d) => b.push(d)); req.on('end', () => { got.push({ method: req.method, url: req.url, h: req.headers, raw: req.rawHeaders, body: Buffer.concat(b) }); res.end('ok'); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port, U = `http://127.0.0.1:${port}`;
  const UTF8 = { ...process.env, LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' };
  const work = join(tmp, 'curlwork'); mkdirSync(work, { recursive: true });
  writeFileSync(join(work, 'body.json'), '{"from": "file",\r\n "n": 1}\n'); writeFileSync(join(work, 'photo.txt'), 'FILEDATA é\n'); writeFileSync(join(work, 'notes.txt'), 'some notes');
  const page = await newPage(); await page.goto(`${base}#/curl`);
  const ta = page.locator('textarea').nth(0), out = page.locator('textarea').nth(1); await ta.waitFor();
  const conv = async (cmd, lang) => { await page.getByRole('radio', { name: lang }).click(); await ta.fill(cmd); await page.waitForTimeout(220); return out.inputValue(); };
  const notes = () => page.locator('.card .note').allTextContents();
  const view = (r, extra) => r && ({ method: r.method, url: r.url, body: r.body.toString('latin1'), ct: (r.h['content-type'] || '').split(';')[0], auth: r.h.authorization || '', cookie: r.h.cookie || '', trace: r.h['x-trace-id'] || '', range: r.h.range || '', referer: r.h.referer || '', ...Object.fromEntries(extra.map((k) => [k, r.h[k] || ''])) });
  const diff = (a, b) => !a ? 'no request received' : Object.keys(b).filter((k) => a[k] !== b[k]).map((k) => `${k}: ${JSON.stringify(a[k]).slice(0, 90)} ≠ curl ${JSON.stringify(b[k]).slice(0, 90)}`).join('; ');
  const send = async (lang, code) => {
    got.length = 0;
    if (lang === 'Node.js') { const f = join(work, `c${Math.random().toString(36).slice(2)}.mjs`); writeFileSync(f, code); await run('node', [f], { cwd: work }); }
    else if (lang === 'Python requests') await run('python3', ['-c', code], { cwd: work });
    else { const d = join(work, `go${Math.random().toString(36).slice(2)}`); mkdirSync(d); writeFileSync(join(d, 'main.go'), code); const r = await run('go', ['run', join(d, 'main.go')], { cwd: work, env: { ...process.env, GOFLAGS: '-mod=mod', GO111MODULE: 'off', HOME: process.env.HOME || tmp } }); if (r.err && !got.length) info(`go run failed: ${String(r.se).slice(0, 300)}`); }
    return got[0];
  };
  let pyOk = true; try { execFileSync('python3', ['-c', 'import requests']); } catch { pyOk = false; info('python requests missing — Python checks skipped'); }
  let goOk = true; try { execFileSync('go', ['version']); } catch { goOk = false; info('go missing — Go checks skipped'); }
  // [command, extra headers to compare, run Go too?, bash-equivalent used as the reference instead (for Windows cmd text)]
  const J = `-H 'Content-Type: application/json'`;
  const cases = [
    [`curl -X POST '${U}/v1/orders?ref=web' \\\n  -H 'Authorization: Bearer TOKEN' \\\n  ${J} \\\n  -H "X-Trace-Id: abc 123" \\\n  -d '{"item":"chai","qty":2,"gift":false}'`, [], true],
    [`curl ${U}/search -G --data-urlencode 'q=masala dosa & chai' -d page=2 -u asha:p@ss -A 'MyAgent/1.0' -b 'sid=xyz'`, ['user-agent'], true],
    [`curl --json '{"a":[1,2,{"b":null}]}' ${U}/api/json`, ['accept']],
    [`curl -X PUT ${U}/items/7 --data-raw $'line1\\nline2' -H 'Content-Type: text/plain'`, []],
    [`curl -d 'name=Asha&city=Pune' ${U}/form -sS -L --compressed`, []],
    [`curl '${U}/chrome' ${J} --data-raw $'{"msg":"Hello\\u0021 it\\'s","tab":"a\\u0009b","hi":"\\u0928\\u092e"}'`, [], true],
    [`curl '${U}/firefox' --data-raw $'{"c":"\\x41\\101","bang":"Hi\\041"}'`, []],
    [`curl -XDELETE ${U}/items/7`, []],
    [`curl -H'X-Trace-Id: attached' -d'{"a":1}' ${J} ${U}/attached`, []],
    [`curl -uasha:pw ${U}/auth`, []],
    [`curl ${U}/items/8 -sX DELETE`, []],
    [`curl -kLd 'a=1' ${U}/bundle`, [], true],
    [`curl -vH 'X-Trace-Id: vh' ${U}/vh`, []],
    [`curl ${U}/opts --retry 3 -s -w '%{http_code}' -o /dev/null --max-redirs 5 --connect-timeout 5`, []],
    [`curl -s ${U}/pipe | cat`, []],
    [`curl ${U}/redir > /dev/null 2>&1 && echo done`, []],
    [`curl -d @body.json ${J} ${U}/file`, [], true],
    [`curl --data-binary @body.json ${J} ${U}/binary`, [], true],
    [`curl --data-urlencode 'j@body.json' -d 'k=1' ${U}/urlencfile`, [], true],
    [`curl -d @- ${J} ${U}/heredoc <<EOF\n{"a": 1,\n "b": "two"}\nEOF`, []],
    [`curl --data-binary @- ${U}/heredoc2 <<'EOF'\nline $one\nline two\nEOF`, []],
    [`curl ${U}/big ${J} -d '{"id": 12345678901234567890, "price": 1.10, "e": 1e3, "b":1,"2":2,"a":3}'`, []],
    [`curl -I ${U}/head`, []],
    [`curl -T photo.txt ${U}/up/`, [], true],
    [`curl --oauth2-bearer TOKEN-1 ${U}/bearer`, []],
    [`curl 127.0.0.1:${port}/noscheme?x=1`, [], true],
    [`curl -H 'Accept: a/b' -H 'Accept: c/d' -H 'X-Trace-Id: dup' ${U}/dup`, ['accept'], true],
    [`curl --json '{"a":1}' --json '{"b":2}' ${U}/json2`, ['accept']],
    [`curl ${U}/crlf -H 'Content-Type: text/plain' --data-binary $'l1\\r\\nsay "hi"\\r\\nend"'`, [], true],
    [`curl -u 'asha:pässwörd ₹' ${U}/utf8auth`, []],
    [`curl -r 0-99 -e 'https://ref.example/page' ${U}/range`, []],
    [`curl -d a=1 -d 'b=2 3' --data-urlencode 'c=4 5&6' ${U}/multi`, []],
    [`curl ${U}/q?b=1&c=2 -H 'X-Trace-Id: amp'`, [], false, `curl '${U}/q?b=1&c=2' -H 'X-Trace-Id: amp'`],
    [`curl ^"${U}/v1/cmd?ref=web^&x=1^" ^\r\n  -H ^"content-type: application/json^" ^\r\n  -H ^"x-trace-id: win^" ^\r\n  --data-raw ^"^{^\\^"item^\\^":^\\^"chai^\\^",^\\^"pct^\\^":^\\^"5^%^\\^"^}^"`, [], true, `curl '${U}/v1/cmd?ref=web&x=1' -H 'content-type: application/json' -H 'x-trace-id: win' --data-raw '{"item":"chai","pct":"5%"}'`],
    [`curl "${U}/oldcmd?a=1&b=2" ^\n  -H "X-Trace-Id: say ""hi""" -d "a=1"`, [], false, `curl '${U}/oldcmd?a=1&b=2' -H 'X-Trace-Id: say "hi"' -d 'a=1'`],
  ];
  const tally = { 'Node.js': [0, 0], 'Python requests': [0, 0], 'Go net/http': [0, 0] }, misses = [];
  for (const [cmd, extra, withGo, ref] of cases) {
    got.length = 0; await run('bash', ['-c', (ref || cmd).replace(/ --compressed/, '')], { cwd: work, env: UTF8 }); // a UTF-8 locale, as in a real terminal (bash decodes \uXXXX only then)
    if (!got[0]) { misses.push(`curl itself sent nothing for: ${cmd.slice(0, 60)}`); continue; }
    const real = view(got[0], extra);
    for (const lang of ['Node.js', ...(pyOk ? ['Python requests'] : []), ...(goOk && withGo ? ['Go net/http'] : [])]) {
      const code = await conv(cmd, lang); const mine = view(await send(lang, code), extra); const d = diff(mine, real);
      tally[lang][1]++; if (mine && !d) tally[lang][0]++; else misses.push(`${lang} — ${cmd.replace(/\s+/g, ' ').slice(0, 70)} → ${d}`);
    }
  }
  for (const m of misses.slice(0, 12)) info(m);
  for (const lang of Object.keys(tally)) if (tally[lang][1]) ok(tally[lang][0] === tally[lang][1], `${lang}: the generated program sends exactly what curl sends for ${tally[lang][0]}/${tally[lang][1]} commands`);
  // multipart forms: same parts as curl
  const partsOf = (r) => { const m = /boundary=(.+)$/.exec(r?.h['content-type'] || ''); if (!m) return null; return r.body.toString('latin1').split('--' + m[1]).slice(1, -1).map((p) => { const [hd, ...rest] = p.replace(/^\r\n/, '').split('\r\n\r\n'); return { name: /name="([^"]*)"/.exec(hd)?.[1], filename: /filename="([^"]*)"/.exec(hd)?.[1] || '', type: /content-type: ([^\r\n;]+)/i.exec(hd)?.[1] || '', data: rest.join('\r\n\r\n').replace(/\r\n$/, '') }; }); };
  const fcmd = `curl -F 'title=Hello World' -F 'file=@photo.txt;type=text/x-test;filename=renamed.txt' -F 'plain=@photo.txt' -F 'notes=<notes.txt' --form-string 'raw=@not-a-file' ${U}/upload`;
  got.length = 0; await run('bash', ['-c', fcmd], { cwd: work, env: UTF8 }); const realParts = partsOf(got[0]);
  const sameParts = (mine) => mine && mine.length === realParts.length && realParts.every((p, i) => mine[i].name === p.name && mine[i].filename === p.filename && mine[i].data === p.data && (i !== 1 || mine[i].type === p.type));
  ok(realParts && realParts.length === 5 && realParts[1].type === 'text/x-test' && realParts[1].filename === 'renamed.txt' && realParts[3].data === 'some notes' && realParts[4].data === '@not-a-file', 'curl -F reference: 5 parts (;type=, ;filename=, <file, --form-string)');
  for (const lang of ['Node.js', ...(pyOk ? ['Python requests'] : []), ...(goOk ? ['Go net/http'] : [])]) {
    const mine = partsOf(await send(lang, await conv(fcmd, lang)));
    ok(sameParts(mine), `${lang}: multipart form has curl's parts (names, file names, contents, the given type) ${mine ? JSON.stringify(mine.map((p) => [p.name, p.filename, p.type, p.data.length])) : 'no multipart request'}`);
  }
  const rawForm = await conv(fcmd, 'Raw HTTP'); ok(rawForm.startsWith('POST /upload HTTP/1.1') && rawForm.includes('name="file"; filename="renamed.txt"\nContent-Type: text/x-test') && rawForm.includes('<contents of notes.txt>'), 'Raw HTTP shows the multipart parts');
  // notes for what cannot be converted
  await conv(`curl -s ${U}/a -x http://proxy:8080 --cert c.pem | jq .`, 'Node.js'); let ns = (await notes()).join(' | ');
  ok(/pipe/.test(ns) && /-x/.test(ns) && /--cert/.test(ns) && (await out.inputValue()).includes(`fetch("${U}/a"`), 'pipe and proxy / certificate options: URL kept, the user is told what was left out');
  await conv(`curl https://a.example/1 https://b.example/2 -H 'Accept:'`, 'Node.js'); ns = (await notes()).join(' | ');
  ok(/2 URLs/.test(ns) && /not to send/.test(ns), 'two URLs and a removed header are explained');
  await conv(`curl -d @body.json https://x.example/a`, 'JavaScript fetch');
  ok(/fileInput/.test(await out.inputValue()) && /cannot read files by path/.test(await out.inputValue()), 'browser fetch: a file body is taken from a file input, with a comment');
  // presentation
  const sample = `curl -X POST '${U}/v1/orders?ref=web' -H 'Authorization: Bearer TOKEN' ${J} -d '{"item":"chai","qty":2}'`;
  const go = await conv(sample, 'Go net/http'); ok(go.includes('http.NewRequest("POST", ' + JSON.stringify(`${U}/v1/orders?ref=web`)) && go.includes('req.Header.Set("Authorization", "Bearer TOKEN")') && go.includes('strings.NewReader("{\\"item\\":\\"chai\\",\\"qty\\":2}")'), 'Go output');
  const raw = await conv(`curl --json '{"a":[1,2,{"b":null}]}' ${U}/api/json`, 'Raw HTTP'); ok(raw.startsWith('POST /api/json HTTP/1.1\nHost: 127.0.0.1:') && raw.includes(`Content-Length: ${Buffer.byteLength('{"a":[1,2,{"b":null}]}')}`), 'raw HTTP with Content-Length');
  const fe = await conv(sample, 'JavaScript fetch'); ok(fe.includes('body: JSON.stringify(') && fe.includes('"Content-Type": "application/json"'), 'compact JSON body shown as an object');
  const big = await conv(`curl ${U}/big ${J} -d '{"id": 12345678901234567890}'`, 'JavaScript fetch'); ok(big.includes('body: "{\\"id\\": 12345678901234567890}"'), 'a JSON body that would change is kept as exact text');
  await conv('wget http://x', 'Node.js'); ok(/must start with curl/.test(await page.locator('.note-warn').textContent()), 'not curl → message');
  await conv("curl 'http://x", 'Node.js'); ok(/Unclosed single quote/.test(await page.locator('.note-warn').textContent()), 'unclosed quote → message');
  await conv('curl -H "A: b"', 'Node.js'); ok(/No URL/.test(await page.locator('.note-warn').textContent()), 'no URL → message');
  await conv('curl https://x.example/a -H', 'Node.js'); ok(/-H needs a value/.test(await page.locator('.note-warn').textContent()) && (await out.inputValue()) === '', 'option without its value → message, no stale code');
  await conv('curl -I example.com', 'Raw HTTP'); ok((await out.inputValue()) === 'HEAD / HTTP/1.1\nHost: example.com\n', 'Raw HTTP for "curl -I example.com"');
  srv.close();
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'curl');
};
