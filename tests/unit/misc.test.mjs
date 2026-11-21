// Software › misc tabs, the pure parts (src/tools/software/misc.ts): string escaping round trips and known answers for
// nine formats, log-level detection (JSON, logfmt, bracketed, syslog numbers, stack traces), Unicode character facts,
// file-type sniffing by magic bytes, duration formatting.
export default async (t, { load }) => {
  const { ESCAPE_FNS: E, levelOf, levelsOf, charInfo, sniff, fmtDur } = await load('/src/tools/software/misc.ts');
  const err = (f) => { try { f(); return null; } catch (e) { return e.message; } };

  // ---- String escape: every format round-trips a nasty text
  const nasty = ['He said "Namaste" — it\'s 5\\6 at 9:00\n\tnext line', '', ' ', '"', '""', "''", '\\', '\\\\"', 'a\\"b', 'tab\there', 'line1\r\nline2', 'नमस्ते 👍🏽 café', '<a href="x?a=1&b=2">O\'Reilly & Sons</a>', '100% $HOME `ls` $(rm -rf) !history', 'a,b;"c"\nd', '/^[a-z]+\\.(js|ts)$/', 'nul\0mid', 'nul\x001 digit after', '\x07bell \x1b[31mred\x1b[0m \x7f', 'emoji 😀 and astral 𝒳', 'trailing backslash\\'];
  for (const [k, { e, u }] of Object.entries(E)) {
    const bad = nasty.filter((s) => { try { return u(e(s)) !== s; } catch { return true; } });
    t.ok(!bad.length, `${k}: ${nasty.length} awkward texts survive escape → unescape ${bad.map((b) => JSON.stringify(b)).slice(0, 3).join(' ')}`);
  }
  // JSON
  t.eq(E.json.e('a"b\\c\n\t\u0001é'), 'a\\"b\\\\c\\n\\t\\u0001é', 'JSON escape = JSON.stringify without the outer quotes');
  t.eq(E.json.u('"quoted\\nstring"'), 'quoted\nstring', 'JSON unescape: a whole quoted string loses its quotes');
  t.eq(E.json.u('say ""hi"" \\u0041\\n'), 'say ""hi"" A\n', 'JSON unescape: bare quotes next to each other are kept (used to fail: "Unexpected token")');
  t.eq(E.json.u('C:\\\\dir\\\\"x"'), 'C:\\dir\\"x"', 'JSON unescape: an escaped backslash before a bare quote (used to fail)');
  t.eq(E.json.u('real\ttab and\nline'), 'real\ttab and\nline', 'JSON unescape: real tabs and line breaks are kept (JSON.parse refuses them)');
  t.eq(E.json.u('\\ud83d\\ude00 \\/'), '😀 /', 'JSON unescape: surrogate pair, \\/');
  t.ok(/not a JSON escape/.test(err(() => E.json.u('bad \\x41'))) && /four hex digits/.test(err(() => E.json.u('\\u12'))) && /very end/.test(err(() => E.json.u('oops\\'))), 'JSON unescape: \\x, short \\u and a dangling backslash are explained');
  // JS / C
  t.eq(E.js.e('é👍\u0000'), '\\u00e9\\ud83d\\udc4d\\0', 'JS escape: \\uXXXX for non-ASCII, surrogate pairs for emoji');
  t.eq([E.js.e('\x001'), E.c.e('\x001')], ['\\u00001', '\\0001'], 'a NUL before a digit is not written as \\0 (\\01 would be another character)');
  t.eq(E.c.e('é👍'), 'é👍', 'C / Python escape keeps Unicode');
  t.eq(E.c.u('\\x41\\101\\u0041\\u{1F44D}\\U0001F44D\\a\\e\\v\\q'), 'AAA👍👍\x07\x1b\vq', 'C unescape: \\x, octal, \\u, \\u{…}, \\U (8 digits), \\a \\e \\v, unknown escape = the letter');
  t.eq(E.js.u('\\U0001F44'), 'U0001F44', '\\U with too few digits is left as text');
  // SQL, shell, HTML, regex, CSV, URL
  t.eq(E.sql.e("O'Reilly"), "'O''Reilly'", "SQL: quotes doubled"); t.eq(E.sql.u("'it''s'"), "it's", 'SQL unescape');
  t.eq(E.shell.e("it's $HOME"), "'it'\\''s $HOME'", 'shell: single quotes'); t.eq(E.shell.u(`'a b'\\''c' "d \\"e\\" $x" f\\ g`), `a b'c d "e" $x f g`, 'shell unescape: single + double quotes + backslash');
  t.ok(/Unclosed single quote/.test(err(() => E.shell.u("'abc"))) && /Unclosed double quote/.test(err(() => E.shell.u('"abc'))), 'shell unescape: unclosed quotes named');
  t.eq(E.html.e(`<a href="x">Tom & 'Jerry'</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;', 'HTML escape');
  t.eq(E.html.u('&lt;b&gt; &amp;amp; &#8377;500 &#x1F600; &copy; &rupee; &nosuchentity; &'), '<b> &amp; ₹500 😀 © &rupee; &nosuchentity; &', 'HTML unescape: named, decimal, hex; unknown entities and a bare & are left alone');
  t.eq(E.html.u('&#x110000; &#xD800; &#0; &#65 &#x41'), '\ufffd \ufffd \ufffd A A', 'HTML unescape: impossible numbers become U+FFFD (as in browsers; it used to throw "Invalid code point"), numbers without a semicolon are read');
  t.eq(E.regex.e('a.b*c?(d)[e]{f}|g^h$i\\j/k+'), 'a\\.b\\*c\\?\\(d\\)\\[e\\]\\{f\\}\\|g\\^h\\$i\\\\j\\/k\\+', 'regex escape: every metacharacter');
  t.ok(new RegExp(`^${E.regex.e('1+1=2 (really?) [yes] $5.00')}$`).test('1+1=2 (really?) [yes] $5.00'), 'an escaped text matches itself as a regular expression');
  t.eq([E.csv.e('plain'), E.csv.e('a,b'), E.csv.e('say "hi"'), E.csv.e('two\nlines')], ['plain', '"a,b"', '"say ""hi"""', '"two\nlines"'], 'CSV: quoted only when needed (RFC 4180)');
  t.eq(E.csv.u('"say ""hi"", ok"'), 'say "hi", ok', 'CSV unescape');
  t.eq(E.url.e('a b&c=d/é?₹'), 'a%20b%26c%3Dd%2F%C3%A9%3F%E2%82%B9', 'URL component'); t.ok(/malformed/i.test(err(() => E.url.u('%E0%A4%A'))), 'URL unescape: a cut-off %-sequence is an error');

  // ---- Log levels
  const lv = (l) => levelOf(l) || 'OTHER';
  const cases = [
    ['2026-11-17 10:00:01 ERROR Database timeout', 'ERROR'], ['2026-11-17T10:00:01Z [WARN] disk 91% full', 'WARN'], ['INFO: server started', 'INFO'], ['[2026-11-17 10:00:00] production.CRITICAL: out of memory', 'FATAL'],
    ['Nov 17 10:00:01 host sshd[123]: Failed password for root', 'OTHER'], ['level=warn msg="slow query" dur=2.1s', 'WARN'], ['ts=2026-11-17 lvl=dbg msg=x', 'DEBUG'], ['time="2026-11-17" level=error msg="boom"', 'ERROR'],
    ['{"level":"info","msg":"listening","port":8080}', 'INFO'], ['{"level":50,"msg":"pino error"}', 'ERROR'], ['{"level":30,"msg":"pino info"}', 'INFO'], ['{"level":60,"msg":"pino fatal"}', 'FATAL'], ['{"level":10,"msg":"pino trace"}', 'TRACE'],
    ['{"severity":"WARNING","message":"gcp"}', 'WARN'], ['{"severity":3,"message":"syslog error"}', 'ERROR'], ['{"severity":4,"message":"syslog warning"}', 'WARN'], ['{"severity":6,"message":"syslog info"}', 'INFO'], ['{"severity":7,"message":"syslog debug"}', 'DEBUG'], ['{"severity":0,"message":"syslog emergency"}', 'FATAL'],
    ['{"levelname":"ERROR","message":"python json logger"}', 'ERROR'], ['{"msg":"no level here"}', 'OTHER'], ['{not json but ERROR inside', 'ERROR'],
    ['E/AndroidRuntime( 1234): FATAL EXCEPTION: main', 'FATAL'], ['W/System.err: at java.lang', 'WARN'], ['D/dalvikvm: GC_CONCURRENT freed', 'DEBUG'], ['I/ActivityManager: Start proc', 'INFO'],
    ['<warn> something', 'WARN'], ['(debug) something', 'DEBUG'], ['error: cannot find module', 'ERROR'], ['warning: unused variable', 'WARN'], ['  Error - failed', 'ERROR'],
    // level words that are only part of the message must not count (they used to: "user info updated" → INFO, "/api/errors" → ERROR)
    ['10:00:01 user info updated for id 7', 'OTHER'], ['GET /api/errors 200 12ms', 'OTHER'], ['10.0.0.1 - - [17/Nov/2026] "GET /debug/info HTTP/1.1" 200', 'OTHER'], ['retrying after error-free run', 'OTHER'], ['the trace of the matrix is 5', 'OTHER'], ['no warning lights on the dashboard', 'OTHER'],
    ['\x1b[31mERROR\x1b[0m database down', 'ERROR'], ['\x1b[33mWARN\x1b[39m slow', 'WARN'], ['\x1b[2m10:00:01\x1b[22m \x1b[32minfo\x1b[39m: listening', 'INFO'], ['\x1b[1;31m[FATAL]\x1b[0m out of memory', 'FATAL'],
    ['11-17 10:00:00.000  1234  1234 E MyTag: logcat threadtime', 'ERROR'], ['11-17 10:00:00.000  1234  5678 W ActivityManager: slow', 'WARN'], ['11-17 10:00:00.000   999   999 V chatty: verbose', 'TRACE'],
    ['W1117 10:00:00.000000       1 klog.go:1] klog warning', 'WARN'], ['E1117 10:00:00.123456   12345 reflector.go:138] failed to list', 'ERROR'], ['I1117 10:00:00.000000       1 leaderelection.go:248] attempting', 'INFO'],
    ['<3>kernel: syslog priority 3', 'ERROR'], ['<134>Nov 17 10:00:00 host app: local0.info', 'INFO'], ['<28>daemon.warning message', 'WARN'], ['<8>user.emerg', 'FATAL'], ['<191>local7.debug', 'DEBUG'],
    ['{"log":{"level":"error"},"message":"ECS nested"}', 'ERROR'], ['{"log.level":"warn","message":"ECS flat"}', 'WARN'],
    ['2026-11-17 INFO request failed with error code 5', 'INFO'], ['2026-11-17 DEBUG WARN threshold is 80', 'DEBUG'], ['', 'OTHER'], ['   ', 'OTHER'],
  ];
  const wrong = cases.filter(([l, w]) => lv(l) !== w).map(([l, w]) => `${JSON.stringify(l.slice(0, 40))} → ${lv(l)} (want ${w})`);
  t.ok(!wrong.length, `${cases.length} log lines get the right level (plain, bracketed, logfmt, JSON words and numbers, syslog, Android; words inside the message are not levels) ${wrong.join(' | ')}`);
  const trace = ['2026-11-17 ERROR Unhandled exception', 'java.lang.NullPointerException: boom', '\tat com.example.App.main(App.java:10)', '\tat java.base/java.lang.Thread.run(Thread.java:840)', 'Caused by: java.io.IOException: disk', '\t... 3 more', '2026-11-17 INFO recovered', '  detail line of the info entry', '', 'plain line after a blank', 'Traceback (most recent call last):', '  File "app.py", line 3, in <module>', 'ValueError: bad'];
  t.eq(levelsOf(trace), ['ERROR', 'ERROR', 'ERROR', 'ERROR', 'ERROR', 'ERROR', 'INFO', 'INFO', '', '', '', '', ''], 'stack-trace and indented lines take the level of the entry they belong to (they used to be OTHER, so "ERROR only" lost the trace)');
  t.eq(levelsOf(['  indented first line', 'x']), ['', ''], 'continuation lines before any entry have no level');
  t.eq(levelsOf([]).length, 0, 'empty input');
  const { stripAnsi } = await load('/src/tools/software/misc.ts');
  t.eq(stripAnsi('\x1b[31mERROR\x1b[0m db \x1b[1;4;38;5;196mdown\x1b[m \x1b]8;;https://x.example\x07link\x1b]8;;\x07 \x1b[2K\x1b[1Gdone'), 'ERROR db down link done', 'terminal colour / cursor / hyperlink codes are removed from log lines');
  t.eq(stripAnsi('plain [31m text'), 'plain [31m text', 'text without an ESC character is left alone');

  // ---- Unicode inspector
  let c = charInfo('A'); t.eq([c.cp, c.dec, c.utf8, c.utf16, c.cat, c.script, c.flag], ['U+0041', 65, '41', '0041', 'Letter, uppercase', 'Latin', ''], 'A');
  c = charInfo('₹'); t.eq([c.cp, c.utf8, c.cat, c.script], ['U+20B9', 'E2 82 B9', 'Symbol, currency', 'Common'], '₹');
  c = charInfo('न'); t.eq([c.cp, c.utf8, c.script, c.cat], ['U+0928', 'E0 A4 A8', 'Devanagari', 'Letter, other'], 'न');
  c = charInfo('👍'); t.eq([c.cp, c.utf8, c.utf16, c.cat], ['U+1F44D', 'F0 9F 91 8D', 'D83D DC4D', 'Symbol, other'], '👍 (astral: 4 UTF-8 bytes, a surrogate pair)');
  c = charInfo('\u200b'); t.eq([c.name, c.flag, c.cat], ['ZERO WIDTH SPACE', 'invisible', 'Format (invisible)'], 'zero-width space');
  c = charInfo('\u00a0'); t.eq([c.name, c.flag], ['NO-BREAK SPACE', 'unusual space'], 'no-break space'); t.eq(charInfo(' ').flag, '', 'an ordinary space is not flagged');
  c = charInfo('а'); t.eq([c.script, c.flag], ['Cyrillic', 'looks like “a”'], 'Cyrillic а looks like Latin a');
  t.eq([charInfo('\u0007').flag, charInfo('\ue000').flag, charInfo('\n').flag, charInfo('\t').flag], ['control character', 'private use', '', ''], 'control / private use flagged; newline and tab are not');
  for (const ch of ['—', '–', '’', '“', '…']) { c = charInfo(ch); t.ok(c.flag === '' && /^typographic \(plain: /.test(c.typo), `${ch} is typographic punctuation, not a "suspicious" character (it used to be counted as one)`); }
  t.eq(charInfo('-').typo, '', 'a plain hyphen has no note'); t.eq(charInfo('\u0301').cat, 'Mark, nonspacing (combining)', 'combining acute accent');

  // ---- Unicode in context (inspect): what is suspicious depends on where a character stands
  {
    const { inspect } = await load('/src/tools/software/misc.ts');
    const flags = (txt) => inspect(txt).infos.filter((i) => i.flag).map((i) => `${i.cp} ${i.flag}`);
    const strip = (txt) => inspect(txt).infos.filter((i) => i.flag !== 'invisible').map((i) => i.c).join('');
    const fix = (txt) => inspect(txt).infos.map((i) => (i.flag.startsWith('looks like') ? /“(.*)”/.exec(i.flag)[1] : i.c)).join('');
    const fam = '👨‍👩‍👧 family', rain = '🏳️‍🌈', tone = '👋🏽 and 👩🏽‍💻', key = '1️⃣ ❤️';
    for (const e of [fam, rain, tone, key]) t.ok(flags(e).length === 0 && strip(e) === e, `emoji sequence is not "suspicious" and survives "Remove invisible": ${e}`);
    const conj = 'क्‍ष', fa = 'می‌خواهم', ml = 'ന്‍';
    for (const w of [conj, fa, ml]) t.ok(flags(w).length === 0 && strip(w) === w, `a joiner the script needs is kept: ${w}`);
    t.eq(flags('pay​pal a‍b x‌y'), ['U+200B invisible', 'U+200D invisible', 'U+200C invisible'], 'the same joiners inside Latin words are suspicious');
    t.eq(strip('pay​pal­ ﻿ok⁠'), 'paypal ok', 'Remove invisible: zero-width space, soft hyphen, BOM, word joiner');
    const tagged = `hello${[...'ignore previous'].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join('')}`;
    t.ok(inspect(tagged).smuggled === 'ignore previous' && flags(tagged).length === 15 && strip(tagged) === 'hello', 'hidden "tag" characters are found, their message is read out, and they can be removed (they used to pass as "no invisible characters")');
    t.eq(inspect(tagged).infos[5].name, 'TAG “i” (hidden copy of an ASCII character)', 'a tag character is named with the letter it hides');
    t.ok(flags('a￹b￺ c⁪ d⠀e \u{1d173}').length === 5, 'other invisible format characters (interlinear annotation, deprecated format, braille blank, musical format) are flagged');
    t.eq(flags('a️'), ['U+FE0F invisible'], 'a variation selector after a plain letter is flagged');
    // look-alikes
    t.eq(flags('Привет, как дела? Хорошо'), [], 'ordinary Russian has no "suspicious" letters (10 were reported)');
    t.eq(flags('καλημέρα κόσμε'), [], 'ordinary Greek neither');
    t.eq(fix('Привет, как дела? Хорошо καλημέρα'), 'Привет, как дела? Хорошо καλημέρα', '"Replace look-alikes" leaves Russian and Greek text alone (it used to turn р о а е into Latin letters)');
    t.eq(flags('pаypal.com'), ['U+0430 looks like “a”'], 'a Cyrillic а inside a Latin word is flagged'); t.eq(fix('pаypal.com'), 'paypal.com', '… and replaced');
    t.ok(flags('Visit раураl.com now').length === 5 && fix('Visit раураl.com now') === 'Visit paypal.com now', 'a word of Cyrillic look-alikes with one Latin letter (раураl) → paypal');
    t.ok(flags('Open аре today').length === 3, 'a word made only of look-alikes in a Latin text is flagged');
    t.eq(flags('ｐａｙ 𝐩𝐚𝐲 ℓ ⅼ').length, 8, 'fullwidth, mathematical, letter-like and Roman-numeral forms look like ASCII letters'); t.eq(fix('ｐａｙｐａｌ 𝐩𝐚𝐲𝐩𝐚𝐥'), 'paypal paypal', '… and are replaced by them');
    t.eq(flags('x² ½ ™ ª'), [], 'superscripts, fractions and ™ are not look-alikes');
    const sc = (c) => inspect(c).infos[0].script; t.eq(['සි', 'ខ្មែរ', 'ދި', 'བོད', 'ግ', 'ລາວ', 'မြန်'].map(sc), ['Sinhala', 'Khmer', 'Thaana', 'Tibetan', 'Ethiopic', 'Lao', 'Myanmar'], 'more scripts are named (they showed "—")');
  }
  // ---- File types by magic bytes
  const B = (...x) => Uint8Array.from(x.flatMap((v) => typeof v === 'string' ? [...Buffer.from(v, 'latin1')] : [v])), pad = (b, n) => { const o = new Uint8Array(n); o.set(b); return o; };
  const kinds = [[B(0x89, 'PNG\r\n\x1a\n'), 'PNG image'], [B(0xff, 0xd8, 0xff, 0xe0), 'JPEG image'], [B('GIF89a'), 'GIF image'], [B('RIFF', 0, 0, 0, 0, 'WEBPVP8 '), 'WebP image'], [B('RIFF', 0, 0, 0, 0, 'WAVEfmt '), 'RIFF (WAV / AVI / WebP)'], [B(0, 0, 0, 0x18, 'ftypheic'), 'HEIC image'], [B(0, 0, 0, 0x1c, 'ftypavif'), 'AVIF image'], [B(0, 0, 0, 0x20, 'ftypisom'), 'MP4 / MOV / M4A (ISO media)'],
    [B('%PDF-1.7'), 'PDF document'], [B('PK', 3, 4), 'ZIP archive (also .docx/.xlsx/.jar/.apk/.epub)'], [B(0x1f, 0x8b, 8), 'gzip'], [B('BZh9'), 'bzip2'], [B(0xfd, '7zXZ', 0), 'XZ'], [B(0x28, 0xb5, 0x2f, 0xfd), 'Zstandard'], [B('7z', 0xbc, 0xaf, 0x27, 0x1c), '7-Zip archive'], [B('Rar!', 0x1a, 7), 'RAR archive'],
    [B(0x7f, 'ELF'), 'ELF executable (Linux)'], [pad(B('MZ', 0x90, 0), 128), 'Windows executable (PE/DOS)'], [B(0, 'asm', 1, 0, 0, 0), 'WebAssembly module'], [B('SQLite format 3', 0), 'SQLite database'], [B('ID3', 4), 'MP3 audio (ID3 tag)'], [B('fLaC'), 'FLAC audio'], [B('OggS'), 'Ogg (Vorbis / Opus)'], [B(0x1a, 0x45, 0xdf, 0xa3), 'Matroska / WebM'],
    [B('II*', 0), 'TIFF (little-endian)'], [B('MM', 0, '*'), 'TIFF (big-endian)'], [pad(B('BM', 0x36, 0, 0, 0, 0, 0, 0, 0, 0x36, 0, 0, 0), 64), 'BMP image'], [B('wOF2'), 'WOFF2 font'], [B('OTTO'), 'OpenType font'], [B('-----BEGIN CERTIFICATE-----'), 'PEM (certificate / key)'], [B(0xef, 0xbb, 0xbf, 'hi'), 'UTF-8 text with BOM'], [B(0xff, 0xfe, 'h', 0), 'UTF-16 LE text (BOM)'],
    [B('<?xml version="1.0"?>'), 'XML'], [B('<svg xmlns='), 'SVG image'], [B('#!/bin/sh\n'), 'Script (shebang)'], [B('USODIUM1', 2), 'Sodium Encrypt file (SuperUtils)'], [pad(B('x'), 300).fill(0x20, 1, 257).map((v, i) => i >= 257 && i < 262 ? 'ustar'.charCodeAt(i - 257) : v), 'tar archive'],
    [B('hello world\n'), 'Text (no binary bytes in the first 4 KB)'], [B(), 'Empty file'], [B(1, 2, 3, 0, 255), 'Unknown binary data'],
    [B(0xff, 0xfe, 0, 0, 'h', 0, 0, 0), 'UTF-32 LE text (BOM)'], [B(0, 0, 0xfe, 0xff, 0, 0, 0, 'h'), 'UTF-32 BE text (BOM)'], [B(0, 0, 0, 0x18, 'ftypmif1'), 'HEIF image'], [B(0, 0, 0, 0x18, 'ftypheix'), 'HEIC image'], [B('PK', 5, 6, 0, 0), 'ZIP archive (empty)'],
    [B('<!DOCTYPE html><html>'), 'HTML document'], [B('<html lang="en">'), 'HTML document'], [B(0xff, 0xf3, 0x84, 0xc4, 0, 0), 'MP3 / MPEG audio'], [B(0xff, 0xfb, 0x90, 0x64), 'MP3 audio'],
    [B('\x1b[31mred\x1b[0m plain\n'), 'Text with terminal escape codes (no other binary bytes in the first 4 KB)'],
    // two-letter signatures at the start of ordinary text are not images / programs
    [B('BMW prices rose 4 % in November\n'), 'Text (no binary bytes in the first 4 KB)'], [B('MZ is the airline code of Merpati\n'), 'Text (no binary bytes in the first 4 KB)']];
  const sn = kinds.filter(([b, w]) => sniff(b) !== w).map(([b, w]) => `${w}: got "${sniff(b)}"`);
  t.ok(!sn.length, `${kinds.length} file types recognised by their first bytes (and "BMW…" / "MZ…" text is text) ${sn.join(' | ')}`);

  // ---- durations
  t.eq([fmtDur(0), fmtDur(-5), fmtDur(0.864), fmtDur(59.94), fmtDur(60), fmtDur(86.4), fmtDur(3600), fmtDur(31556.952), fmtDur(90061), fmtDur(315569.52)], ['0 s', '0 s', '0.86 s', '59.9 s', '1 min', '1 min 26.4 s', '1 h', '8 h 45 min 57 s', '1 d 1 h 1 min 1 s', '3 d 15 h 39 min 29.5 s'], 'durations: seconds with decimals only when short, days / hours / minutes');
  t.eq([fmtDur(59.96), fmtDur(119.96), fmtDur(3599.97), fmtDur(86399.96), fmtDur(9.996), fmtDur(604799.97)], ['1 min', '2 min', '1 h', '1 d', '10 s', '7 d'], 'rounding carries into the next unit (these used to read "60 s", "1 min 60 s", "59 min 60 s", "23 h 59 min 60 s")');
  t.eq([fmtDur(0.0864), fmtDur(0.00864), fmtDur(0.000008), fmtDur(8e-9)], ['86.4 ms', '8.64 ms', '8 µs', '0.008 µs'], 'very short times in ms / µs (they used to read "0 s")');
  t.eq([fmtDur(31556952), fmtDur(31556952 * 2.5), fmtDur(8e9), fmtDur(Infinity), fmtDur(NaN)], ['1 year', '2 years 182 d 14 h', '253 years 186 d', 'never (too long to state)', '0 s'], 'years for long times; infinite → "never"');
  // more escapes
  t.eq(E.c.e('bell\x07 esc\x1b[0m del\x7f'), 'bell\\007 esc\\033[0m del\\177', 'C / Python: other control characters as three octal digits (\\u0007 is not valid C)');
  t.eq(E.js.e('bell\x07'), 'bell\\u0007', 'JavaScript keeps \\uXXXX');
  t.eq(E.c.u('ab\\\ncd\\\r\nef'), 'abcdef', 'a backslash at the end of a line joins the lines');
  t.ok(/beyond the last Unicode character/.test(err(() => E.js.u('\\u{110000}'))) && /beyond/.test(err(() => E.c.u('\\U00110000'))), 'code points past U+10FFFF are refused with a clear message');
  t.eq(E.shell.u("$'a\\nb\\t\\x41\\'q' plain"), "a\nb\tA'q plain", "shell unescape: $'…' (ANSI-C quoting)");
  t.eq(E.sql.u("'it''s'\n"), "it's\n", 'SQL unescape: the closing quote goes even when a newline follows it');
  t.eq(E.sql.u("it''s"), "it's", 'SQL unescape without outer quotes');
};
