// cURL Converter engine: read a curl command the way a shell + curl would, then write the same request as code.
// Covers bash quoting ('…', "…", $'…' with \uXXXX \xHH \NNN, line continuations, comments, pipes/redirects,
// here-documents), Chrome's "Copy as cURL (cmd)" for Windows (caret escapes), and curl's own option rules (bundled short
// options, values attached to the letter, which options take a value, -d @file, -F parts, -G, -I, -T, --json, -u…).
// Reference for every rule: the real curl + bash (tests/e2e/curl.e2e.mjs runs both against a local server and compares
// the requests byte for byte with what the generated Node / Python / Go code sends).
// Note for CLAUDE.md §3a: this parser is TypeScript for now (no tried-and-tested WebAssembly curl-command parser exists;
// porting it to our devcore Rust module is on the owner's to-do list "JS/TS → WebAssembly sweep").

export interface DataPart { text?: string; file?: string; strip?: boolean; name?: string; urlencode?: boolean }
export interface FormPart { name: string; value?: string; file?: string; textFile?: string; type?: string; filename?: string }
export interface CurlReq {
  method: string; url: string; headers: Array<[string, string]>;
  /** request body when every piece is literal text; null when there is none or a piece comes from a file (see parts) */
  body: string | null;
  parts: DataPart[]; joiner: string;
  form: FormPart[]; upload: string | null;
  insecure: boolean; compressed: boolean; follow: boolean;
  /** things the user should know: ignored options, assumptions */
  notes: string[];
}

const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

/** bash $'…' escapes */
function ansiC(t: string, i: number): [string, number] {
  const c = t[i + 1];
  const simple: Record<string, string> = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?' };
  if (c === undefined) return ['\\', i + 1];
  if (c in simple) return [simple[c], i + 2];
  const hex = (max: number, from: number) => { let j = from; while (j < from + max && /[0-9a-fA-F]/.test(t[j] ?? '')) j++; return j; };
  if (c === 'x') { const j = hex(2, i + 2); return j > i + 2 ? [String.fromCharCode(parseInt(t.slice(i + 2, j), 16)), j] : ['\\x', i + 2]; }
  if (c === 'u' || c === 'U') { const j = hex(c === 'u' ? 4 : 8, i + 2); if (j === i + 2) return ['\\' + c, i + 2]; const cp = parseInt(t.slice(i + 2, j), 16); return [cp <= 0x10ffff ? String.fromCodePoint(cp) : '�', j]; }
  if (/[0-7]/.test(c)) { let j = i + 1; while (j < i + 4 && /[0-7]/.test(t[j] ?? '')) j++; return [String.fromCharCode(parseInt(t.slice(i + 1, j), 8) & 0xff), j]; }
  if (c === 'c' && t[i + 2]) return [String.fromCharCode(t.charCodeAt(i + 2) & 0x1f), i + 3];
  return ['\\' + c, i + 2]; // bash keeps an unknown escape as it is
}

interface Words { words: string[]; stdin: string | null; notes: string[] }

/** POSIX-shell (bash) word splitting of one command. */
function bashWords(src: string): Words {
  let t = src; const out: string[] = [], notes: string[] = []; let cur = '', has = false, i = 0, stdin: string | null = null;
  const flush = () => { if (has) { out.push(cur); cur = ''; has = false; } };
  const skipWord = () => { // the target of a redirect
    while (i < t.length && (t[i] === ' ' || t[i] === '\t')) i++;
    while (i < t.length && !isSpace(t[i])) { if (t[i] === "'" || t[i] === '"') { const q = t[i]; i++; while (i < t.length && t[i] !== q) i++; } i++; }
  };
  const readWord = (): string => { // a plain or quoted word (here-document delimiter, here-string)
    while (i < t.length && (t[i] === ' ' || t[i] === '\t')) i++;
    let w = '';
    while (i < t.length && !isSpace(t[i])) {
      if (t[i] === "'" || t[i] === '"') { const q = t[i]; const j = t.indexOf(q, i + 1); if (j < 0) throw new Error(`Unclosed ${q === "'" ? 'single' : 'double'} quote`); w += t.slice(i + 1, j); i = j + 1; }
      else if (t[i] === '\\' && i + 1 < t.length) { w += t[i + 1]; i += 2; }
      else w += t[i++];
    }
    return w;
  };
  let stopped = '';
  while (i < t.length && !stopped) {
    const c = t[i];
    if (c === '\n' || c === '\r') { // a pasted command often lacks the trailing "\": go on, unless another command starts here
      flush(); i++;
      if (out.length && /^\s*(curl(\.exe)?|\$|#!)\s/.test(t.slice(i) + ' ')) stopped = 'the next command';
      continue;
    }
    if (c === ' ' || c === '\t') { flush(); i++; continue; }
    if (c === '#' && !has) { while (i < t.length && t[i] !== '\n') i++; continue; }
    if (c === "'") { const j = t.indexOf("'", i + 1); if (j < 0) throw new Error('Unclosed single quote'); cur += t.slice(i + 1, j); has = true; i = j + 1; continue; }
    if (c === '"' || (c === '$' && t[i + 1] === '"')) {
      let j = i + (c === '$' ? 2 : 1); has = true;
      for (;;) {
        if (j >= t.length) throw new Error('Unclosed double quote');
        if (t[j] === '"') break;
        if (t[j] === '\\' && j + 1 < t.length) {
          if (t[j + 1] === '\n') { j += 2; continue; }
          if (t[j + 1] === '\r' && t[j + 2] === '\n') { j += 3; continue; }
          if ('"\\$`'.includes(t[j + 1])) { cur += t[j + 1]; j += 2; continue; }
        }
        cur += t[j++];
      }
      i = j + 1; continue;
    }
    if (c === '$' && t[i + 1] === "'") {
      let j = i + 2; has = true;
      for (;;) {
        if (j >= t.length) throw new Error("Unclosed $'…' quote");
        if (t[j] === "'") break;
        if (t[j] === '\\') { const [s, n] = ansiC(t, j); cur += s; j = n; } else cur += t[j++];
      }
      i = j + 1; continue;
    }
    if (c === '\\') {
      if (t[i + 1] === '\n') { i += 2; continue; }
      if (t[i + 1] === '\r' && t[i + 2] === '\n') { i += 3; continue; }
      if (i + 1 < t.length) { cur += t[i + 1]; has = true; }
      i += 2; continue;
    }
    if (c === '|' || c === ';') { flush(); stopped = c === '|' ? 'the pipe (|)' : '";"'; break; }
    if (c === '&') {
      if (t[i + 1] === '&') { flush(); stopped = '"&&"'; break; }
      if (t[i + 1] === '>') { flush(); i += 2; if (t[i] === '>') i++; skipWord(); continue; } // &> file
      if (has && i + 1 < t.length && !isSpace(t[i + 1])) { // https://x/a?b=1&c=2 pasted without quotes
        if (!notes.some((n) => n.includes('unquoted &'))) notes.push('The command has an unquoted & (a shell would cut the command there). It was read as part of the URL — put the URL in quotes.');
        cur += c; i++; continue;
      }
      flush(); stopped = 'background (&)'; break;
    }
    if (c === '<') {
      if (/^\d+$/.test(cur)) { cur = ''; has = false; } else flush();
      if (t.startsWith('<<<', i)) { i += 3; stdin = readWord() + '\n'; continue; }
      if (t.startsWith('<<', i)) {
        i += 2; const dash = t[i] === '-'; if (dash) i++;
        const delim = readWord();
        const eol = t.indexOf('\n', i);
        if (eol < 0) throw new Error(`The here-document (<<${delim}) has no text`);
        const lines = t.slice(eol + 1).split('\n'); const end = lines.findIndex((l) => (dash ? l.replace(/^\t+/, '') : l).replace(/\r$/, '') === delim);
        if (end < 0) throw new Error(`The here-document is not closed (no line with just ${delim})`);
        stdin = lines.slice(0, end).map((l) => (dash ? l.replace(/^\t+/, '') : l)).join('\n') + (end ? '\n' : '');
        t = t.slice(0, eol); // the rest of this line still belongs to the command; what follows the here-document does not
        continue;
      }
      i++; skipWord(); notes.push('Input redirected from a file (<) was left out.'); continue;
    }
    if (c === '>') {
      if (/^\d+$/.test(cur)) { cur = ''; has = false; } else flush();
      i++; if (t[i] === '>') i++;
      if (t[i] === '&') { i++; while (i < t.length && /[\d-]/.test(t[i])) i++; } else skipWord();
      continue;
    }
    cur += c; has = true; i++;
  }
  flush();
  if (stopped && !/background/.test(stopped)) notes.push(`Only the curl command is converted — everything from ${stopped} on was left out.`);
  return { words: out, stdin, notes };
}

/** Windows cmd.exe: caret escapes (Chrome's "Copy as cURL (cmd)") then the C runtime's argument rules. */
function cmdWords(src: string): Words {
  let s = '', inQ = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '^' && !inQ) {
      const nl = src[i + 1] === '\r' && src[i + 2] === '\n' ? 2 : src[i + 1] === '\n' ? 1 : 0;
      if (nl) { // ^ + newline = line continuation; "^ + two newlines" is how Chrome writes a newline inside a value
        i += nl;
        const nl2 = src[i + 1] === '\r' && src[i + 2] === '\n' ? 2 : src[i + 1] === '\n' ? 1 : 0;
        if (nl2) { s += '\n'; i += nl2; }
      } else if (i + 1 < src.length) { s += src[i + 1] === '"' ? '\u0001' : src[i + 1]; i++; } // \u0001 = a quote that cmd passed on (the C runtime still sees it as a quote)
      continue;
    }
    if (c === '"') inQ = !inQ;
    s += c;
  }
  s = s.replace(/\u0001/g, '"');
  const out: string[] = []; let cur = '', has = false; inQ = false;
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === '\\') {
      let n = 0; while (s[i + n] === '\\') n++;
      if (s[i + n] === '"') { cur += '\\'.repeat(n >> 1); has = true; i += n; if (n & 1) { cur += '"'; i++; } continue; }
      cur += '\\'.repeat(n); has = true; i += n; continue;
    }
    if (c === '"') { if (inQ && s[i + 1] === '"') { cur += '"'; i += 2; continue; } inQ = !inQ; has = true; i++; continue; }
    if (!inQ && isSpace(c)) { if (has) { out.push(cur); cur = ''; has = false; } i++; continue; }
    cur += c; has = true; i++;
  }
  if (inQ) throw new Error('Unclosed double quote');
  if (has) out.push(cur);
  return { words: out, stdin: null, notes: [] };
}

/** Split a curl command line into words like the shell it was copied for (bash, or Windows cmd when it uses ^). */
export function shellWordsEx(cmd: string): Words {
  const isCmd = !/\\\r?\n/.test(cmd) && !/\$'/.test(cmd) && (/\^[ \t]*\r?\n/.test(cmd) || /\^"/.test(cmd));
  return isCmd ? cmdWords(cmd) : bashWords(cmd);
}
export const shellWords = (cmd: string) => shellWordsEx(cmd).words;

// curl options that take a value (so that the value is not mistaken for the URL). Short letters, then long names.
const SHORT_VALUE = 'AbcCdDeEFHKmoPQrtTuUwxXyYz';
const LONG_VALUE = new Set(('abstract-unix-socket alt-svc aws-sigv4 cacert capath cert cert-type ciphers config connect-timeout connect-to continue-at cookie cookie-jar ' +
  'create-file-mode crlfile curves data data-ascii data-binary data-raw data-urlencode delegation dns-interface dns-ipv4-addr dns-ipv6-addr dns-servers doh-url dump-header ' +
  'ech egd-file engine etag-compare etag-save expect100-timeout form form-string ftp-account ftp-alternative-to-user ftp-method ftp-port ftp-ssl-ccc-mode ' +
  'happy-eyeballs-timeout-ms haproxy-clientip header hostpubmd5 hostpubsha256 hsts interface ip-tos ipfs-gateway json keepalive-cnt keepalive-time key key-type krb libcurl ' +
  'limit-rate local-port login-options mail-auth mail-from mail-rcpt max-filesize max-redirs max-time netrc-file noproxy oauth2-bearer output output-dir parallel-max pass ' +
  'pinnedpubkey preproxy proto proto-default proto-redir proxy proxy-cacert proxy-capath proxy-cert proxy-cert-type proxy-ciphers proxy-crlfile proxy-header proxy-key ' +
  'proxy-key-type proxy-pass proxy-pinnedpubkey proxy-service-name proxy-tls13-ciphers proxy-tlsauthtype proxy-tlspassword proxy-tlsuser proxy-user proxy1.0 pubkey quote ' +
  'random-file range rate referer request request-target resolve retry retry-delay retry-max-time sasl-authzid service-name socks4 socks4a socks5 socks5-gssapi-service ' +
  'socks5-hostname speed-limit speed-time stderr telnet-option tftp-blksize time-cond tls-max tls13-ciphers tlsauthtype tlspassword tlsuser trace trace-ascii trace-config ' +
  'unix-socket upload-file url url-query user user-agent variable vlan-priority write-out').split(' '));
const SHORT_TO_LONG: Record<string, string> = { X: 'request', H: 'header', d: 'data', F: 'form', u: 'user', A: 'user-agent', e: 'referer', b: 'cookie', G: 'get', I: 'head', T: 'upload-file', k: 'insecure', L: 'location', r: 'range', x: 'proxy', E: 'cert', K: 'config', c: 'cookie-jar', C: 'continue-at', z: 'time-cond', n: 'netrc', U: 'proxy-user', o: 'output', m: 'max-time', w: 'write-out', D: 'dump-header', Q: 'quote', P: 'ftp-port', t: 'telnet-option', y: 'speed-time', Y: 'speed-limit' };
// options that change what is sent or where, and that the generated code does not reproduce: the user is told
const NOTED = new Set('proxy preproxy socks4 socks4a socks5 socks5-hostname proxy-user cert key cacert capath pinnedpubkey resolve connect-to unix-socket abstract-unix-socket interface digest ntlm negotiate anyauth aws-sigv4 time-cond continue-at cookie-jar config netrc netrc-file netrc-optional request-target proxy-header doh-url dns-servers variable'.split(' '));

const urlenc = (x: string) => encodeURIComponent(x).replace(/%20/g, '+').replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()); // as curl: space → +
const b64utf8 = (s: string) => { let bin = ''; for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b); return btoa(bin); };
const baseName = (p: string) => p.split(/[\\/]/).pop() || p;

export function parseCurl(cmd: string): CurlReq {
  const { words: w, stdin, notes } = shellWordsEx(cmd.trim().replace(/^\$\s+/, ''));
  if (!w.length || !/^curl(\.exe)?$/i.test(w[0])) throw new Error('The command must start with curl');
  const r: CurlReq = { method: '', url: '', headers: [], body: null, parts: [], joiner: '&', form: [], upload: null, insecure: false, compressed: false, follow: false, notes };
  const urls: string[] = [], query: string[] = [], ignored: string[] = [], dropped: string[] = [];
  let get = false, head = false, user: string | null = null, bearer: string | null = null, json = false, usedStdin = false;
  const fromStdin = (strip: boolean): DataPart => {
    if (stdin === null) { notes.push('"@-" reads the request body from standard input — it is shown as the file /dev/stdin.'); return { file: '/dev/stdin', strip }; }
    usedStdin = true; return { text: strip ? stdin.replace(/[\r\n]/g, '') : stdin };
  };
  const dataFile = (v: string, strip: boolean): DataPart => (v.startsWith('@') ? (v === '@-' ? fromStdin(strip) : { file: v.slice(1), strip }) : { text: v });
  const urlencoded = (v: string): DataPart => { // content | =content | name=content | @file | name@file
    const eq = v.indexOf('='), at = v.indexOf('@');
    if (eq >= 0 && (at < 0 || eq < at)) return { text: (eq > 0 ? v.slice(0, eq + 1) : '') + urlenc(v.slice(eq + 1)) };
    if (at >= 0) return { file: v.slice(at + 1), name: v.slice(0, at), urlencode: true };
    return { text: urlenc(v) };
  };
  const formPart = (v: string, literal: boolean): FormPart => {
    const eq = v.indexOf('='); const name = eq < 0 ? v : v.slice(0, eq); let val = eq < 0 ? '' : v.slice(eq + 1);
    if (literal || !/^[@<]/.test(val)) {
      if (!literal) { const m = /;type=([^;]+)\s*$/.exec(val); if (m) return { name, value: val.slice(0, m.index), type: m[1] }; }
      return { name, value: val };
    }
    const kind = val[0]; val = val.slice(1);
    const p: FormPart = { name }; const seg = val.split(';');
    let path = seg[0]; if (path.startsWith('"') && path.endsWith('"') && path.length > 1) path = path.slice(1, -1);
    for (const s of seg.slice(1)) { const m = /^\s*(type|filename)=(.*)$/.exec(s); if (m) { const x = m[2].replace(/^"(.*)"$/, '$1'); if (m[1] === 'type') p.type = x; else p.filename = x; } }
    if (kind === '@') p.file = path; else p.textFile = path;
    return p;
  };
  const opt = (name: string, value: () => string, shown: string) => {
    switch (name) {
      case 'request': r.method = value().toUpperCase(); break;
      case 'header': {
        const hv = value(); if (hv.startsWith('@')) { notes.push(`Headers read from the file ${hv.slice(1)} (-H @file) were left out.`); break; }
        const k = hv.indexOf(':');
        if (k > 0) { const name2 = hv.slice(0, k).trim(), val = hv.slice(k + 1).trim(); if (val) r.headers.push([name2, val]); else dropped.push(name2); } // "Name:" = do not send that header
        else if (hv.endsWith(';') && hv.length > 1) r.headers.push([hv.slice(0, -1).trim(), '']);                                                         // "Name;" = send it empty
        break;
      }
      case 'data': case 'data-ascii': r.parts.push(dataFile(value(), true)); break;
      case 'data-binary': r.parts.push(dataFile(value(), false)); break;
      case 'data-raw': r.parts.push({ text: value() }); break;
      case 'data-urlencode': r.parts.push(urlencoded(value())); break;
      case 'json': r.parts.push(dataFile(value(), false)); json = true; break;
      case 'url-query': { const v = value(); query.push(v.startsWith('+') ? v.slice(1) : (urlencoded(v).text ?? v)); break; }
      case 'form': r.form.push(formPart(value(), false)); break;
      case 'form-string': r.form.push(formPart(value(), true)); break;
      case 'user': user = value(); break;
      case 'oauth2-bearer': bearer = value(); break;
      case 'user-agent': r.headers.push(['User-Agent', value()]); break;
      case 'referer': r.headers.push(['Referer', value().replace(/;auto$/, '')]); break;
      case 'cookie': { const v = value(); if (v.includes('=')) r.headers.push(['Cookie', v]); else notes.push(`Cookies read from the file ${v} (-b file) were left out.`); break; }
      case 'range': r.headers.push(['Range', `bytes=${value()}`]); break;
      case 'upload-file': r.upload = value(); break;
      case 'get': get = true; break;
      case 'head': head = true; break;
      case 'insecure': r.insecure = true; break;
      case 'location': case 'location-trusted': r.follow = true; break;
      case 'compressed': r.compressed = true; break;
      case 'url': urls.push(value()); break;
      default:
        if (LONG_VALUE.has(name)) value();
        if (NOTED.has(name) && !ignored.includes(shown)) ignored.push(shown);
    }
  };
  for (let i = 1; i < w.length; i++) {
    const a = w[i];
    const next = (shown: string) => () => { if (i + 1 >= w.length) throw new Error(`${shown} needs a value`); return w[++i]; };
    if (a.startsWith('--') && a.length > 2) {
      const eq = a.indexOf('='); // curl itself has no --name=value form, but it is often written
      if (eq > 0 && LONG_VALUE.has(a.slice(2, eq))) { const v = a.slice(eq + 1); opt(a.slice(2, eq), () => v, a.slice(0, eq)); }
      else opt(a.slice(2), next(a), a);
    } else if (a.startsWith('-') && a.length > 1 && a !== '--') {
      for (let k = 1; k < a.length; k++) { // -sSLd 'x=1': letters are flags until one takes a value — the rest of the word (or the next word) is that value
        const ch = a[k], name = SHORT_TO_LONG[ch] || ch;
        if (SHORT_VALUE.includes(ch)) { const rest = a.slice(k + 1); if (rest) opt(name, () => rest, `-${ch}`); else opt(name, next(`-${ch}`), `-${ch}`); break; }
        opt(name, () => '', `-${ch}`);
      }
    } else if (a !== '--') urls.push(a);
  }
  if (!urls.length) throw new Error('No URL found');
  r.url = urls[0];
  if (urls.length > 1) notes.push(`curl would request ${urls.length} URLs — only the first one is converted.`);
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(r.url)) r.url = 'http://' + r.url; // curl assumes http://
  if (stdin !== null && !usedStdin) notes.push('The here-document is not used by this command (no "@-").');
  const addQuery = (items: string[]) => { if (items.length) { const hash = r.url.indexOf('#'), baseUrl = hash < 0 ? r.url : r.url.slice(0, hash); r.url = baseUrl + (baseUrl.includes('?') ? '&' : '?') + items.join('&') + (hash < 0 ? '' : r.url.slice(hash)); } };
  addQuery(query);
  const hasHeader = (n: string) => r.headers.some(([k]) => k.toLowerCase() === n) || dropped.some((k) => k.toLowerCase() === n);
  if (json) { r.joiner = ''; if (!hasHeader('content-type')) r.headers.push(['Content-Type', 'application/json']); if (!hasHeader('accept')) r.headers.push(['Accept', 'application/json']); }
  if (get) {
    if (r.parts.some((p) => p.file)) notes.push('With -G, data read from a file was left out of the URL.');
    addQuery(r.parts.filter((p) => p.text !== undefined).map((p) => p.text!)); r.parts = [];
  } else if (r.parts.length) {
    if (r.parts.every((p) => p.text !== undefined)) r.body = r.parts.map((p) => p.text).join(r.joiner);
    if (!hasHeader('content-type')) r.headers.push(['Content-Type', 'application/x-www-form-urlencoded']);
  }
  if (r.upload !== null) { if (r.url.endsWith('/')) r.url += baseName(r.upload); if (r.parts.length || r.form.length) { notes.push('-T (upload a file) and -d / -F cannot be combined: -T was left out.'); r.upload = null; } }
  if (r.form.length && r.parts.length) { notes.push('-F and -d cannot be combined (curl refuses): the -d data was left out.'); r.parts = []; r.body = null; }
  r.method ||= head ? 'HEAD' : r.upload !== null ? 'PUT' : r.parts.length || r.form.length ? 'POST' : 'GET';
  if (!hasHeader('authorization')) {
    if (user !== null) r.headers.push(['Authorization', `Basic ${b64utf8(String(user).includes(':') ? user : `${user}:`)}`]);
    else if (bearer !== null) r.headers.push(['Authorization', `Bearer ${bearer}`]);
  }
  if (ignored.length) notes.push(`Left out (the generated code has no equivalent): ${ignored.join(', ')}.`);
  if (dropped.length) notes.push(`"${dropped.join(':", "')}:" tells curl not to send that header — it is simply not set here.`);
  return r;
}

const q = (s: string) => JSON.stringify(s); // also a valid Python and Go string literal for our strings
const dupNames = (hs: Array<[string, string]>) => new Set(hs.map(([k]) => k.toLowerCase())).size !== hs.length;
/** Same-name headers joined with ", " (what a server sees) — for languages whose header map has one value per name. */
const merged = (hs: Array<[string, string]>) => { const m = new Map<string, [string, string]>(); for (const [k, v] of hs) { const o = m.get(k.toLowerCase()); if (o) o[1] += `, ${v}`; else m.set(k.toLowerCase(), [k, v]); } return [...m.values()]; };
/** Show a JSON body as an object only when that is byte-for-byte what curl sends (no re-ordered keys, big numbers, spacing). */
const exactJson = (body: string) => { try { return JSON.stringify(JSON.parse(body)) === body && /^[[{]/.test(body); } catch { return false; } };

export function curlTo(lang: string, r: CurlReq): string {
  const hs = r.headers.filter(([k]) => !(r.form.length && /^content-type$/i.test(k)));
  const isJson = r.body !== null && hs.some(([k, v]) => /^content-type$/i.test(k) && /json/i.test(v)) && exactJson(r.body);
  const fileParts = r.parts.some((p) => p.file !== undefined);
  if (lang === 'fetch' || lang === 'node') {
    const node = lang === 'node'; let needFs = false; const pre: string[] = [];
    const readText = (p: string) => { needFs = true; return node ? `await fs.readFile(${q(p)}, "utf8")` : `await fileInput.files[0].text() /* ${p} */`; };
    const readBytes = (p: string) => { needFs = true; return node ? `await fs.readFile(${q(p)})` : `fileInput.files[0] /* ${p} */`; };
    const o: string[] = [`  method: ${q(r.method)}`];
    if (hs.length) o.push(dupNames(hs) ? `  headers: [\n${hs.map(([k, v]) => `    [${q(k)}, ${q(v)}],`).join('\n')}\n  ]` : `  headers: {\n${hs.map(([k, v]) => `    ${q(k)}: ${q(v)},`).join('\n')}\n  }`);
    if (r.form.length) {
      pre.push('const form = new FormData();', ...r.form.map((f) => {
        if (f.file !== undefined) return `form.append(${q(f.name)}, ${node ? `new Blob([${readBytes(f.file)}]${f.type ? `, { type: ${q(f.type)} }` : ''})` : readBytes(f.file)}, ${q(f.filename ?? baseName(f.file))});`;
        if (f.textFile !== undefined) return `form.append(${q(f.name)}, ${readText(f.textFile)});`;
        return f.type ? `form.append(${q(f.name)}, new Blob([${q(f.value!)}], { type: ${q(f.type)} }));` : `form.append(${q(f.name)}, ${q(f.value!)});`;
      }), '');
      o.push('  body: form');
    } else if (r.upload !== null) o.push(`  body: ${readBytes(r.upload)}`);
    else if (r.body !== null) o.push(`  body: ${isJson ? `JSON.stringify(${JSON.stringify(JSON.parse(r.body), null, 2).replace(/\n/g, '\n  ')})` : q(r.body)}`);
    else if (fileParts) {
      const binary = r.parts.some((p) => p.file !== undefined && !p.strip && !p.urlencode);
      const expr = (p: DataPart) => p.file === undefined ? q(p.text!) : p.urlencode ? `${p.name ? `${q(p.name + '=')} + ` : ''}encodeURIComponent(${readText(p.file)}).replace(/%20/g, "+")` : p.strip ? `(${readText(p.file)}).replace(/[\\r\\n]/g, "")` : readBytes(p.file);
      if (r.parts.length === 1) o.push(`  body: ${expr(r.parts[0])}`);
      else if (binary && node) { pre.push(`const body = Buffer.concat([\n${r.parts.map((p, i) => `  ${i && r.joiner ? `Buffer.from(${q(r.joiner)}), ` : ''}${p.file !== undefined && !p.strip && !p.urlencode ? expr(p) : `Buffer.from(${expr(p)})`},`).join('\n')}\n]);`, ''); o.push('  body'); }
      else if (binary) { pre.push(`const body = new Blob([\n${r.parts.map((p, i) => `  ${i && r.joiner ? `${q(r.joiner)}, ` : ''}${expr(p)},`).join('\n')}\n]);`, ''); o.push('  body'); }
      else { pre.push(`const body = [\n${r.parts.map((p) => `  ${expr(p)},`).join('\n')}\n].join(${q(r.joiner)});`, ''); o.push('  body'); }
    }
    const lead = [node && needFs ? "import fs from 'node:fs/promises';\n" : '', !node && needFs ? '// fileInput = an <input type="file"> on your page: a browser cannot read files by path\n' : '', r.insecure ? `// -k (skip certificate checks) has no equivalent in fetch${node ? ' — for a test server run node with NODE_TLS_REJECT_UNAUTHORIZED=0' : ''}\n` : ''].join('');
    return `${lead}${lead ? '\n' : ''}${pre.join('\n')}${pre.length ? '\n' : ''}const res = await fetch(${q(r.url)}, {\n${o.join(',\n')},${r.follow ? '' : `\n  redirect: ${q('manual')},`}\n});\nconst text = await res.text();\nconsole.log(res.status, text);`;
  }
  if (lang === 'python') {
    const L = ['import requests', ''];
    const mh = merged(hs);
    if (mh.length) L.push(`headers = {\n${mh.map(([k, v]) => `    ${q(k)}: ${q(v)},`).join('\n')}\n}`);
    let dataArg = '';
    if (r.body !== null) { L.push(`data = ${q(r.body)}`); dataArg = 'data=data.encode()'; } // the exact bytes curl sends (json= would re-serialise and break signatures)
    else if (r.upload !== null) { L.push(`data = open(${q(r.upload)}, "rb").read()`); dataArg = 'data=data'; }
    else if (fileParts) {
      const expr = (p: DataPart) => p.file === undefined ? `${q(p.text!)}.encode()` : p.urlencode ? `${p.name ? `${q(p.name + '=')}.encode() + ` : ''}quote_plus(open(${q(p.file)}, "rb").read()).encode()` : `open(${q(p.file)}, "rb").read()${p.strip ? '.replace(b"\\r", b"").replace(b"\\n", b"")' : ''}`;
      if (r.parts.some((p) => p.urlencode)) L.splice(1, 0, 'from urllib.parse import quote_plus');
      L.push(r.parts.length === 1 ? `data = ${expr(r.parts[0])}` : `data = ${q(r.joiner)}.encode().join([\n${r.parts.map((p) => `    ${expr(p)},`).join('\n')}\n])`); dataArg = 'data=data';
    }
    if (r.form.length) L.push(`files = [\n${r.form.map((f) => `    (${q(f.name)}, ${f.file !== undefined ? `(${q(f.filename ?? baseName(f.file))}, open(${q(f.file)}, "rb")${f.type ? `, ${q(f.type)}` : ''})` : f.textFile !== undefined ? `(None, open(${q(f.textFile)}, "rb").read())` : `(None, ${q(f.value!)}${f.type ? `, ${q(f.type)}` : ''})`}),`).join('\n')}\n]`);
    const args = [q(r.url), mh.length && 'headers=headers', dataArg, r.form.length && 'files=files', r.insecure && 'verify=False', !r.follow && 'allow_redirects=False'].filter(Boolean);
    L.push('', `response = requests.request(${q(r.method)}, ${args.join(', ')})`, 'print(response.status_code, response.text)');
    return L.join('\n');
  }
  if (lang === 'go') {
    const imp = new Set(['fmt', 'io', 'net/http']); const pre: string[] = []; let bodyExpr = 'nil', ctype = '';
    const must = (decl: string, expr: string) => `\t${decl}, err := ${expr}\n\tif err != nil {\n\t\tpanic(err)\n\t}`;
    if (r.form.length) {
      imp.add('bytes'); imp.add('mime/multipart');
      pre.push('\tvar buf bytes.Buffer', '\tform := multipart.NewWriter(&buf)');
      r.form.forEach((f, i) => {
        if (f.file === undefined && f.textFile === undefined && !f.type) { pre.push(`\tform.WriteField(${q(f.name)}, ${q(f.value!)})`); return; }
        const path = f.file ?? f.textFile;
        if (f.type || (f.textFile !== undefined)) {
          imp.add('net/textproto');
          pre.push(`\th${i} := make(textproto.MIMEHeader)`, `\th${i}.Set("Content-Disposition", ${q(`form-data; name="${f.name}"${f.file !== undefined ? `; filename="${f.filename ?? baseName(f.file)}"` : ''}`)})`);
          if (f.type) pre.push(`\th${i}.Set("Content-Type", ${q(f.type)})`);
          pre.push(`\tpart${i}, _ := form.CreatePart(h${i})`);
        } else pre.push(`\tpart${i}, _ := form.CreateFormFile(${q(f.name)}, ${q(f.filename ?? baseName(f.file!))})`);
        if (path !== undefined) { imp.add('os'); pre.push(must(`data${i}`, `os.ReadFile(${q(path)})`), `\tpart${i}.Write(data${i})`); } else pre.push(`\tpart${i}.Write([]byte(${q(f.value!)}))`);
      });
      pre.push('\tform.Close()'); bodyExpr = '&buf'; ctype = 'form.FormDataContentType()';
    } else if (r.body !== null) { imp.add('strings'); bodyExpr = `strings.NewReader(${q(r.body)})`; }
    else if (r.upload !== null) { imp.add('os'); imp.add('bytes'); pre.push(must('data', `os.ReadFile(${q(r.upload)})`)); bodyExpr = 'bytes.NewReader(data)'; }
    else if (fileParts) {
      imp.add('os'); imp.add('bytes');
      const items = r.parts.map((p, i) => {
        if (p.file === undefined) return `[]byte(${q(p.text!)})`;
        pre.push(must(`data${i}`, `os.ReadFile(${q(p.file)})`));
        if (p.urlencode) { imp.add('net/url'); return `[]byte(${p.name ? `${q(p.name + '=')} + ` : ''}url.QueryEscape(string(data${i})))`; }
        return p.strip ? `bytes.ReplaceAll(bytes.ReplaceAll(data${i}, []byte("\\r"), nil), []byte("\\n"), nil)` : `data${i}`;
      });
      pre.push(`\tbody := bytes.Join([][]byte{\n${items.map((x) => `\t\t${x},`).join('\n')}\n\t}, []byte(${q(r.joiner)}))`); bodyExpr = 'bytes.NewReader(body)';
    }
    let client = 'http.DefaultClient';
    if (!r.follow || r.insecure) {
      const f: string[] = [];
      if (!r.follow) f.push('\t\tCheckRedirect: func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse },');
      if (r.insecure) { imp.add('crypto/tls'); f.push('\t\tTransport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}},'); }
      pre.push(`\tclient := &http.Client{\n${f.join('\n')}\n\t}`); client = 'client';
    }
    const dup = dupNames(hs);
    const lines = [`package main`, '', `import (\n${[...imp].sort().map((x) => `\t"${x}"`).join('\n')}\n)`, '', 'func main() {', ...pre,
      `\treq, err := http.NewRequest(${q(r.method)}, ${q(r.url)}, ${bodyExpr})`, '\tif err != nil {\n\t\tpanic(err)\n\t}',
      ...hs.map(([k, v]) => `\treq.Header.${dup ? 'Add' : 'Set'}(${q(k)}, ${q(v)})`), ...(ctype ? [`\treq.Header.Set("Content-Type", ${ctype})`] : []),
      `\tres, err := ${client}.Do(req)`, '\tif err != nil {\n\t\tpanic(err)\n\t}', '\tdefer res.Body.Close()', '\tb, _ := io.ReadAll(res.Body)', '\tfmt.Println(res.StatusCode, string(b))', '}'];
    return lines.join('\n');
  }
  // HTTP message
  let u: URL; try { u = new URL(r.url); } catch { throw new Error(`Not a valid URL: ${r.url}`); }
  const head = [`${r.method} ${u.pathname}${u.search} HTTP/1.1`, `Host: ${u.host}`, ...hs.map(([k, v]) => `${k}: ${v}`)];
  const len = (s: string) => new TextEncoder().encode(s).length;
  if (r.form.length) {
    const b = '------------------------boundary';
    const body = r.form.map((f) => `--${b}\nContent-Disposition: form-data; name="${f.name}"${f.file !== undefined ? `; filename="${f.filename ?? baseName(f.file)}"` : ''}${f.type || f.file !== undefined ? `\nContent-Type: ${f.type ?? 'application/octet-stream'}` : ''}\n\n${f.file !== undefined ? `<contents of ${f.file}>` : f.textFile !== undefined ? `<contents of ${f.textFile}>` : f.value}`).join('\n') + `\n--${b}--`;
    return [...head, `Content-Type: multipart/form-data; boundary=${b}`, '', body].join('\n');
  }
  if (r.body !== null) return [...head, `Content-Length: ${len(r.body)}`, '', r.body].join('\n');
  if (r.upload !== null) return [...head, '', `<contents of ${r.upload}>`].join('\n');
  if (fileParts) return [...head, '', r.parts.map((p) => (p.file === undefined ? p.text : `${p.urlencode && p.name ? p.name + '=' : ''}<contents of ${p.file}${p.urlencode ? ', URL-encoded' : p.strip ? ', line breaks removed' : ''}>`)).join(r.joiner)].join('\n');
  return head.join('\n') + '\n';
}
