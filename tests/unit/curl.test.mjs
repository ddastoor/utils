// cURL Converter engine (src/lib/curl.ts): shell word splitting (bash quoting incl. $'…' escapes, Windows cmd carets,
// pipes / redirects / here-documents / comments), curl's option rules (bundled short options, attached values, options
// that take a value, -d @file, --data-urlencode, -G, -I, -T, -F parts, --json, -u, --oauth2-bearer) and the generated
// code. The e2e suite checks the same things against the real curl; these are the known answers (bug hunt, Nov 2026).
export default async (t, { load }) => {
  const { parseCurl, curlTo, shellWords } = await load('src/lib/curl.ts');
  const p = (c) => parseCurl(c);
  const hdr = (r, n) => r.headers.filter(([k]) => k.toLowerCase() === n.toLowerCase()).map(([, v]) => v);
  // ---- bash quoting
  t.eq(shellWords(`curl 'a b' "c \\"d\\" $x" e\\ f $'g\\th' ''`), ['curl', 'a b', 'c "d" $x', 'e f', 'g\th', ''], 'single, double, backslash, ANSI-C quotes, empty word');
  t.eq(p(`curl 'https://x/a' --data-raw $'{"msg":"Hello\\u0021 it\\'s","tab":"a\\u0009b"}'`).body, `{"msg":"Hello! it's","tab":"a\tb"}`, "Chrome's $'…' body: \\u0021 and \\u0009 decoded");
  t.eq(p(`curl https://x/a --data-raw $'A\\x41\\tB\\101 \\u0928\\u092e \\U0001F600 \\e[0m \\z'`).body, 'AA\tBA नम 😀 \x1b[0m \\z', "$'…': \\xHH, octal, \\u, \\U, \\e; an unknown escape keeps its backslash (bash)");
  t.eq(p('curl "https://x/a?b=1&c=2" \\\n  -H "X-A: 1 \\\n2"').headers, [['X-A', '1 2']], 'backslash-newline joins lines, also inside double quotes');
  t.eq(p("curl 'https://x/a' -d 'line1\\\nline2'").body, 'line1\\\nline2', 'backslash-newline inside single quotes is data');
  // ---- Windows cmd (Chrome "Copy as cURL (cmd)")
  let r = p('curl ^"https://api.example.com/v1/orders?ref=web^&x=1^" ^\r\n  -H ^"content-type: application/json^" ^\r\n  --data-raw ^"^{^\\^"item^\\^":^\\^"chai^\\^",^\\^"pct^\\^":^\\^"5^%^\\^"^}^"');
  t.eq([r.url, r.headers[0], r.body, r.method], ['https://api.example.com/v1/orders?ref=web&x=1', ['content-type', 'application/json'], '{"item":"chai","pct":"5%"}', 'POST'], 'Chrome cmd format: carets and \\" undone');
  r = p('curl ^"https://x/a^" ^\n  --data-raw ^"line1^\n\nline2 ^%^PATH^%^"');
  t.eq(r.body, 'line1\nline2 %PATH%', 'cmd: "^ + two newlines" is a newline inside a value; %^ undone');
  r = p('curl "https://x/a?b=1&c=2" ^\n  -H "X-A: say ""hi"" \\\\" -d "a=1"');
  t.eq([r.url, r.headers[0][1], r.body], ['https://x/a?b=1&c=2', 'X-A: say "hi" \\'.slice(5), 'a=1'], 'older cmd style: plain quotes, "" and \\\\');
  // ---- short options like curl
  t.eq(p('curl -XDELETE https://x/items/7').method, 'DELETE', '-XDELETE (value attached)');
  t.eq(hdr(p("curl -H'X-Trace-Id: abc' https://x/a"), 'x-trace-id'), ['abc'], "-H'…' attached");
  r = p(`curl -d'{"a":1}' -H 'Content-Type: application/json' https://x/a`); t.eq([r.method, r.body], ['POST', '{"a":1}'], "-d'…' attached");
  t.eq(hdr(p('curl -uasha:pw https://x/a'), 'authorization'), ['Basic YXNoYTpwdw=='], '-uuser:pw attached');
  t.eq([p('curl -sX DELETE https://x/items/7').method, p('curl https://x/items/7 -sX DELETE').url], ['DELETE', 'https://x/items/7'], '-sX DELETE (bundle ends with an option that takes a value)');
  r = p("curl -kLd 'a=1' https://x/a"); t.eq([r.insecure, r.follow, r.body, r.method], [true, true, 'a=1', 'POST'], '-kLd bundle');
  t.eq(hdr(p("curl -vH 'X-A: 1' https://x/a"), 'x-a'), ['1'], '-vH bundle');
  r = p(`curl -XGET 'localhost:9200/_search' -H 'Content-Type: application/json' -d'{"query":{"match_all":{}}}'`);
  t.eq([r.method, r.url, r.body], ['GET', 'http://localhost:9200/_search', '{"query":{"match_all":{}}}'], 'Elasticsearch docs style; a URL without a scheme gets http://');
  // ---- the URL is never an option's value, nor what follows a pipe or redirect
  for (const [c, why] of [['curl https://x/a --retry 3', '--retry 3'], ["curl https://x/a -s -w '%{http_code}'", '-w format'], ['curl https://x/a -x http://proxy:8080', '-x proxy'],
    ['curl https://x/a --cert client.pem --key client.key', '--cert/--key'], ['curl -L https://x/a --max-redirs 5', '--max-redirs'], ['curl https://x/a -so /dev/null', '-so file'],
    ['curl -s https://x/a | jq .', '| jq'], ['curl -fsSL https://x/a | sh', '| sh'], ['curl https://x/a > out.json', '> file'], ['curl https://x/a && echo done', '&&'],
    ['curl https://x/a 2>/dev/null', '2>'], ['curl https://x/a 2>&1 | tee log', '2>&1'], ['curl https://x/a; echo hi', ';'], ['curl https://x/a # the API', 'comment'],
    ['curl --connect-timeout 5 -m 10 https://x/a -o out.bin -D headers.txt', 'timeouts and outputs'], ['$ curl https://x/a', 'leading prompt'], ['curl.exe https://x/a', 'curl.exe'], ['curl https://x/a\ncurl https://x/b', 'a second command']]) {
    t.eq(p(c).url, 'https://x/a', `URL kept with ${why}`);
  }
  t.ok(p('curl -s https://x/a | jq .').notes.some((n) => /pipe/.test(n)) && p('curl https://x/a -x http://proxy:8080').notes.some((n) => /-x/.test(n)), 'the user is told about the dropped pipe and the proxy');
  r = p('curl https://a.example/1 https://b.example/2'); t.ok(r.url === 'https://a.example/1' && r.notes.some((n) => /2 URLs/.test(n)), 'two URLs: the first one, with a note');
  r = p('curl https://x/a?b=1&c=2 -H "X: 1"'); t.ok(r.url === 'https://x/a?b=1&c=2' && hdr(r, 'x')[0] === '1' && r.notes.some((n) => /unquoted &/.test(n)), 'unquoted & inside a URL kept, with a note');
  // ---- data
  r = p("curl https://x/s -G --data-urlencode 'q=masala dosa & chai' -d page=2 --data-urlencode '=a b' --data-urlencode 'c d'");
  t.eq([r.url, r.method, r.body], ['https://x/s?q=masala+dosa+%26+chai&page=2&a+b&c+d', 'GET', null], '-G with --data-urlencode forms (name=content, =content, content)');
  t.eq(p("curl 'https://x/s?a=1#frag' --url-query 'b=2 3' --url-query '+c=4'").url, 'https://x/s?a=1&b=2+3&c=4#frag', '--url-query appended before the fragment');
  r = p(`curl --json '{"a":1}' --json '{"b":2}' https://x/j`); t.eq([r.body, hdr(r, 'content-type'), hdr(r, 'accept')], ['{"a":1}{"b":2}', ['application/json'], ['application/json']], 'two --json are concatenated; JSON headers added');
  t.eq(hdr(p(`curl --json '{}' -H 'Accept: text/plain' https://x/j`), 'accept'), ['text/plain'], '--json keeps an explicit Accept');
  r = p("curl -d 'a=1' -d 'b=2' https://x/f"); t.eq([r.body, hdr(r, 'content-type')], ['a=1&b=2', ['application/x-www-form-urlencoded']], 'several -d joined with &');
  r = p('curl -d @body.json -H "Content-Type: application/json" https://x/a'); t.eq([r.body, r.parts], [null, [{ file: 'body.json', strip: true }]], '-d @file is a file (line breaks removed), not the text "@file"');
  t.eq(p('curl --data-binary @body.bin https://x/a').parts, [{ file: 'body.bin', strip: false }], '--data-binary @file keeps line breaks');
  t.eq(p("curl --data-raw '@not-a-file' https://x/a").body, '@not-a-file', '--data-raw never reads a file');
  t.eq(p("curl --data-urlencode 'j@body.json' https://x/a").parts, [{ file: 'body.json', name: 'j', urlencode: true }], '--data-urlencode name@file');
  r = p('curl -d @- https://x/a <<EOF\n{"a": 1,\n "b": 2}\nEOF\necho done'); t.eq([r.url, r.body], ['https://x/a', '{"a": 1, "b": 2}'], 'here-document as the body of -d @- (line breaks removed like curl)');
  t.eq(p("curl --data-binary @- https://x/a <<'EOF'\nl1\nl2\nEOF").body, 'l1\nl2\n', '--data-binary @- keeps the here-document as it is');
  t.eq(p("curl -d @- https://x/a <<< 'a=1'").body, 'a=1', 'here-string');
  // ---- methods, upload, auth
  t.eq([p('curl -I https://x/a').method, p('curl --head https://x/a').method], ['HEAD', 'HEAD'], '-I / --head → HEAD');
  r = p('curl -T photo.txt https://x/up/'); t.eq([r.method, r.url, r.upload], ['PUT', 'https://x/up/photo.txt', 'photo.txt'], '-T file → PUT, file name added to a URL ending in /');
  t.eq(hdr(p('curl --oauth2-bearer TOKEN https://x/a'), 'authorization'), ['Bearer TOKEN'], '--oauth2-bearer');
  t.eq(hdr(p("curl -u 'asha:pässwörd' https://x/a"), 'authorization'), ['Basic ' + Buffer.from('asha:pässwörd').toString('base64')], '-u with non-ASCII characters is UTF-8 (as curl)');
  t.eq(hdr(p("curl -u 'asha:пароль₹' https://x/a"), 'authorization'), ['Basic ' + Buffer.from('asha:пароль₹').toString('base64')], '-u beyond Latin-1 no longer fails');
  t.eq(hdr(p('curl -u asha https://x/a'), 'authorization'), ['Basic ' + Buffer.from('asha:').toString('base64')], '-u without a password');
  t.eq(hdr(p("curl -u a:b -H 'Authorization: Bearer X' https://x/a"), 'authorization'), ['Bearer X'], 'an explicit Authorization header wins over -u');
  t.eq([hdr(p("curl -b 'sid=xyz' -A 'MyAgent/1.0' -e https://ref/ -r 0-99 https://x/a"), 'cookie'), hdr(p("curl -A 'MyAgent/1.0' https://x/a"), 'user-agent'), hdr(p('curl -e https://ref/ https://x/a'), 'referer'), hdr(p('curl -r 0-99 https://x/a'), 'range')], [['sid=xyz'], ['MyAgent/1.0'], ['https://ref/'], ['bytes=0-99']], '-b, -A, -e, -r');
  t.ok(p('curl -b cookies.txt https://x/a').notes.some((n) => /cookies\.txt/.test(n)) && !hdr(p('curl -b cookies.txt https://x/a'), 'cookie').length, '-b file: left out with a note');
  // ---- headers
  r = p("curl -H 'Accept: a/b' -H 'Accept: c/d' -H 'User-Agent:' -H 'X-Empty;' https://x/a");
  t.eq([r.headers, r.notes.some((n) => /not to send/.test(n))], [[['Accept', 'a/b'], ['Accept', 'c/d'], ['X-Empty', '']], true], 'repeated headers kept; "Name:" removed with a note; "Name;" sent empty');
  t.ok(curlTo('node', r).includes('headers: [\n    ["Accept", "a/b"],\n    ["Accept", "c/d"],') && curlTo('python', r).includes('"Accept": "a/b, c/d"') && (curlTo('go', r).match(/req\.Header\.Add\("Accept"/g) || []).length === 2, 'repeated headers reach every language (pairs / merged / Add)');
  // ---- forms
  r = p("curl -F 'title=Hello' -F 'file=@/tmp/photo.png;type=image/png;filename=p.png' -F 'notes=<notes.txt' --form-string 'raw=@x' https://x/upload");
  t.eq([r.method, r.form], ['POST', [{ name: 'title', value: 'Hello' }, { name: 'file', type: 'image/png', filename: 'p.png', file: '/tmp/photo.png' }, { name: 'notes', textFile: 'notes.txt' }, { name: 'raw', value: '@x' }]], '-F parts: value, @file;type=;filename=, <file, --form-string');
  const go = curlTo('go', r), raw = curlTo('http', r), node = curlTo('node', r), py = curlTo('python', r);
  t.ok(go.includes('multipart.NewWriter(&buf)') && go.includes('form.WriteField("title", "Hello")') && go.includes('os.ReadFile("/tmp/photo.png")') && go.includes('form.FormDataContentType()') && go.includes('h1.Set("Content-Type", "image/png")'), 'Go output builds the multipart form');
  t.ok(raw.includes('Content-Type: multipart/form-data; boundary=') && raw.includes('name="file"; filename="p.png"') && raw.includes('<contents of /tmp/photo.png>') && raw.includes('name="title"\n\nHello'), 'Raw HTTP shows the multipart parts');
  t.ok(node.includes('fs.readFile("/tmp/photo.png")') && node.includes('{ type: "image/png" }), "p.png")') && !node.includes(';type='), 'Node: file path without ;type=…');
  t.ok(py.includes('("file", ("p.png", open("/tmp/photo.png", "rb"), "image/png"))') && py.includes('("raw", (None, "@x"))'), 'Python: files list with name, file and type');
  // ---- generated code keeps the bytes
  r = p(`curl https://x/a -H 'Content-Type: application/json' -d '{"id": 12345678901234567890, "price": 1.10, "e": 1e3}'`);
  t.ok(curlTo('node', r).includes('body: "{\\"id\\": 12345678901234567890, \\"price\\": 1.10, \\"e\\": 1e3}"') && !curlTo('fetch', r).includes('JSON.stringify('), 'JSON that would change when re-serialised (big number, 1.10, spacing) is sent as the exact text');
  r = p(`curl https://x/a -H 'Content-Type: application/json' -d '{"b":1,"2":2,"a":3}'`); t.ok(!curlTo('fetch', r).includes('JSON.stringify('), 'key order that JSON.parse would change → exact text');
  r = p(`curl https://x/a -H 'Content-Type: application/json' -d '{"item":"chai","qty":2}'`); t.ok(curlTo('fetch', r).includes('body: JSON.stringify({\n    "item": "chai",\n    "qty": 2\n  })'), 'compact JSON is still shown as an object');
  r = p(`curl https://x/a -H 'Content-Type: text/plain' --data-binary $'line1\\r\\nsay "hi"'`);
  t.ok(curlTo('python', r).includes('data = "line1\\r\\nsay \\"hi\\""') && curlTo('go', r).includes('strings.NewReader("line1\\r\\nsay \\"hi\\"")'), 'Python and Go: one-line escaped literal (CR kept, no broken triple quotes)');
  r = p('curl -d @body.json -d extra=1 https://x/a');
  t.ok(curlTo('node', r).includes('(await fs.readFile("body.json", "utf8")).replace(/[\\r\\n]/g, "")') && curlTo('node', r).includes('].join("&")') && curlTo('python', r).includes('open("body.json", "rb").read().replace(b"\\r", b"").replace(b"\\n", b"")') && curlTo('go', r).includes('os.ReadFile("body.json")') && curlTo('http', r).includes('<contents of body.json, line breaks removed>&extra=1'), 'file data becomes file-reading code in every language');
  t.ok(curlTo('go', p('curl https://x/a')).includes('CheckRedirect') && !curlTo('go', p('curl -L https://x/a')).includes('CheckRedirect') && curlTo('go', p('curl -k -L https://x/a')).includes('InsecureSkipVerify: true') && curlTo('python', p('curl -k https://x/a')).includes('verify=False') && curlTo('python', p('curl https://x/a')).includes('allow_redirects=False'), 'redirects are followed only with -L; -k carried over');
  t.eq(curlTo('http', p("curl 'example.com/api?x=1' -H 'X-A: 1'")), 'GET /api?x=1 HTTP/1.1\nHost: example.com\nX-A: 1\n', 'Raw HTTP for a URL without a scheme');
  // ---- errors
  t.throws(() => p('wget http://x'), /must start with curl/, 'not curl');
  t.throws(() => p("curl 'http://x"), /Unclosed single quote/, 'unclosed quote');
  t.throws(() => p('curl -H "A: b"'), /No URL/, 'no URL');
  t.throws(() => p('curl https://x/a -H'), /-H needs a value/, 'option without its value');
  t.throws(() => p('curl -d @- https://x/a <<EOF\nabc'), /not closed/, 'unterminated here-document');
};
