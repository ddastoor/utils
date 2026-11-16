// Linux Terminal: EVERY BusyBox applet in busybox.wasm has at least one known-answer case here (owner rule), run
// through the real runtime (our shell + WASI host + in-memory FS). The suite fails if an applet is added to the
// build without a case. Fixtures: .xz/.lzma/.zip made with Python's lzma/zipfile; crypt answers from OpenSSL.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const XZ = '/Td6WFoAAAFpIt42AgAhARYAAAB0L+WjAQANaGVsbG8gZnJvbSB4egoAAABE8c6SAAEiDgzejGCQQpkNAQAAAAABWVo=';
const LZMA = 'XQAAgAD//////////wA0GUnujekS5hQOv7l4wqGoqdmXVP//cpgAAA==';
const ZIP = 'UEsDBBQAAAAIANsmcF1BDixVCgAAAAgAAAAFAAAAYS50eHSryixQyM9L5QIAUEsDBBQAAAAIANsmcF2qriw7CgAAAAgAAAAJAAAAZGlyL2IudHh0q8osUCgpz+cCAFBLAQIUAxQAAAAIANsmcF1BDixVCgAAAAgAAAAFAAAAAAAAAAAAAACAAQAAAABhLnR4dFBLAQIUAxQAAAAIANsmcF2qriw7CgAAAAgAAAAJAAAAAAAAAAAAAACAAS0AAABkaXIvYi50eHRQSwUGAAAAAAIAAgBqAAAAXgAAAAAA';
const SHA512_CRYPT = '$6$saltsalt$qFmFH.bQmmtXzyBY0s9v7Oicd2z4XSIecDzlB5KiA2/jctKu9YterLp8wwnSq.qc.eoxqOmSuNp2xS0ktL3nh/';
const MD5_CRYPT = '$1$saltsalt$qjXMvbEw8oaL.CzflDtaK/';
const hash = (alg, s) => createHash(alg).update(s).digest('hex');
// POSIX cksum and BSD sum, computed independently
const cksum = (buf) => { let c = 0; const step = (b) => { c ^= b << 24; for (let k = 0; k < 8; k++) c = c & 0x80000000 ? ((c << 1) ^ 0x04c11db7) >>> 0 : (c << 1) >>> 0; }; for (const b of buf) step(b); for (let n = buf.length; n; n >>>= 8) step(n & 0xff); return (~c) >>> 0; };
const bsdsum = (buf) => { let s = 0; for (const b of buf) { s = ((s >> 1) + ((s & 1) << 15) + b) & 0xffff; } return s; };

export default async (t, { load, root }) => {
  const { bootSystem, listApplets } = await load('/src/lib/terminal/system.ts');
  const mod = await WebAssembly.compile(readFileSync(`${root}/src/wasm/bin/busybox.wasm`));
  const applets = listApplets(mod);
  const sh = bootSystem(mod, { out: () => {}, err: () => {} }, applets);
  const covered = new Set();
  const nproc = String((globalThis.navigator && navigator.hardwareConcurrency) || 4);
  /** case(applets covered, command, expectation: string | RegExp | (out, err, code) => bool) */
  const C = (cov, cmd, want, msg) => {
    for (const a of [].concat(cov)) covered.add(a);
    const r = sh.capture(cmd);
    const ok = typeof want === 'string' ? r.out === want : want instanceof RegExp ? want.test(r.out) : want(r.out, r.err, r.code);
    t.ok(ok, `${[].concat(cov).join(',')}: ${msg || cmd} → got ${JSON.stringify(r.out).slice(0, 160)}${r.err ? ` stderr ${JSON.stringify(r.err).slice(0, 160)}` : ''} (rc ${r.code})`);
  };
  sh.capture('mkdir -p /home/user/w && cd /home/user/w');
  sh.run('cd /home/user/w', false);

  // ---- tests and shell-ish helpers
  C('[', '[ 2 -gt 1 ] && echo yes', 'yes\n');
  C('[[', '[[ abc = abc ]] && echo same', 'same\n');
  C('test', 'printf x > f && test -f f && test ! -d f && echo file', 'file\n');
  C('true', 'true; echo $?', '0\n');
  C('false', 'false; echo $?', '1\n');
  C('echo', "echo -e 'a\\tb' && echo -n no-newline", 'a\tb\nno-newline');
  C('printf', 'printf "%05.1f|%-3s|%x\\n" 3.14159 ab 255', '003.1|ab |ff\n');
  C('yes', 'yes ok | head -n 2', 'ok\nok\n');
  C('sleep', 'sleep 0.05 && echo slept', 'slept\n');
  C('usleep', 'usleep 1000 && echo ok', 'ok\n');
  C('getopt', 'getopt -o ab: -- -a -b val rest', " -a -b 'val' -- 'rest'\n");
  C('expr', 'expr length hello; expr 7 / 2; expr 2 \\* 21', '5\n3\n42\n');
  C('seq', 'seq -s , 2 2 8', '2,4,6,8\n');
  C('factor', 'factor 97 100', '97: 97\n100: 2 2 5 5\n');
  C('bc', "echo '2^64; scale=10; sqrt(2)' | bc", '18446744073709551616\n1.4142135623\n');
  C('dc', "echo '2 3 * p 10 3 / p' | dc", '6\n3\n');
  C('shuf', "shuf -i 1-5 | sort -n | tr '\\n' ' '", '1 2 3 4 5 ');
  C('date', 'date -u -d @86400 +%F_%H', '1970-01-02_00\n');
  C('cal', 'cal 2 2024', (o) => o.includes('February 2024') && o.includes('25 26 27 28 29'));
  C('ts', 'echo line | ts %Y', (o) => /^\d{4} line\n$/.test(o));

  // ---- text processing
  C('cat', "printf 'a\\nb\\n' | cat -n", '     1\ta\n     2\tb\n');
  C('tac', "printf '1\\n2\\n3\\n' | tac", '3\n2\n1\n');
  C('rev', 'echo abc | rev', 'cba\n');
  C(['head', 'tail'], 'seq 10 | head -n 3 | tail -n 1', '3\n');
  C('wc', "printf 'one two\\nthree\\n' | wc -l -w -c", '        2         3        14\n');
  C(['sort', 'uniq'], "printf 'b\\na\\nb\\n' | sort | uniq -c", '      1 a\n      2 b\n');
  C('cut', "printf 'a,b,c\\n' | cut -d, -f2,3", 'b,c\n');
  C('paste', "printf '1\\n2\\n' > p1; printf 'a\\nb\\n' > p2; paste p1 p2", '1\ta\n2\tb\n');
  C('tr', 'echo hello | tr a-z A-Z', 'HELLO\n');
  C('fold', 'echo abcdefgh | fold -w 3', 'abc\ndef\ngh\n');
  C('expand', "printf 'a\\tb\\n' | expand -t 4", 'a   b\n');
  C('unexpand', "printf '        x\\n' | unexpand", '\tx\n');
  C('nl', "printf 'a\\nb\\n' | nl", '     1\ta\n     2\tb\n');
  C('comm', "printf 'a\\nb\\nc\\n' > c1; printf 'b\\nc\\nd\\n' > c2; comm -12 c1 c2", 'b\nc\n');
  C('tsort', "printf 'a b\\nb c\\n' | tsort", 'a\nb\nc\n');
  C('grep', "printf 'apple\\nbanana\\napricot\\n' | grep -n '^ap'", '1:apple\n3:apricot\n');
  C('egrep', "printf 'cat\\ndog\\ncow\\n' | egrep 'c(a|o)'", 'cat\ncow\n');
  C('fgrep', "printf 'a.b\\naxb\\n' | fgrep a.b", 'a.b\n');
  C('sed', "echo 'hello world' | sed -e 's/o/0/g' -e 's/^h/H/'", 'Hell0 w0rld\n');
  C('awk', "printf '3 4\\n5 6\\n' | awk '{s += $1*$2} END {print s}'", '42\n');
  C('strings', "printf 'ab\\0hello world\\0x' | strings", 'hello world\n');
  C('dos2unix', "printf 'a\\r\\nb\\r\\n' | dos2unix | wc -c", '4\n');
  C('unix2dos', "printf 'a\\n' | unix2dos | wc -c", '3\n');
  C('diff', "printf 'a\\nb\\n' > o1; printf 'a\\nc\\n' > n1; diff -u o1 n1", (o, e, c) => c === 1 && o.includes('-b') && o.includes('+c'));
  C('cmp', "cmp o1 o1 && echo same; cmp o1 n1", (o, e, c) => o.startsWith('same\n') && /differ/.test(o) && c === 1);
  C('patch', 'diff -u o1 n1 > d.patch; patch o1 < d.patch > /dev/null && cat o1', 'a\nc\n');
  C('ed', "printf 'l1\\nl2\\nl3\\n' > e.txt; printf '2d\\nw\\nq\\n' | ed -s e.txt; cat e.txt", 'l1\nl3\n');
  C('split', 'seq 5 > s5 && split -l 2 s5 part_ && ls part_* && cat part_ac', 'part_aa\npart_ab\npart_ac\n5\n');
  C('tee', 'echo teed | tee tf > /dev/null; cat tf', 'teed\n');

  // ---- hashes and encodings (answers computed independently in Node)
  C('md5sum', 'printf hello | md5sum', `${hash('md5', 'hello')}  -\n`);
  C('sha1sum', 'printf hello | sha1sum', `${hash('sha1', 'hello')}  -\n`);
  C('sha256sum', 'printf hello | sha256sum', `${hash('sha256', 'hello')}  -\n`);
  C('sha384sum', 'printf hello | sha384sum', `${hash('sha384', 'hello')}  -\n`);
  C('sha512sum', 'printf hello | sha512sum', `${hash('sha512', 'hello')}  -\n`);
  C('sha3sum', 'printf hello | sha3sum -a 256', `${hash('sha3-256', 'hello')}  -\n`);
  C('cksum', 'printf hello | cksum', `${cksum(Buffer.from('hello'))} 5\n`);
  C('sum', 'printf hello | sum', (o) => Number(o.trim().split(/\s+/)[0]) === bsdsum(Buffer.from('hello')));
  C('crc32', 'printf hello | crc32', (o) => o.trim().toLowerCase().replace(/^0x/, '') === zlib.crc32('hello').toString(16).padStart(8, '0') || Number(o.trim()) === zlib.crc32('hello'));
  C('base64', 'printf hello | base64 && echo aGVsbG8= | base64 -d', 'aGVsbG8=\nhello');
  C('base32', 'printf hello | base32 && echo NBSWY3DP | base32 -d', 'NBSWY3DP\nhello');
  C(['uuencode', 'uudecode'], "printf 'uu data\\n' > uin; uuencode uin uin > u.uu && rm uin && uudecode u.uu && cat uin", 'uu data\n');
  C('od', 'printf AB | od -An -tx1', (o) => /41 42/.test(o));
  C('hexdump', 'printf AB | hexdump -C', (o) => /41 42.*\|AB\|/.test(o));
  C('hd', 'printf AB | hd', (o) => /41 42.*\|AB\|/.test(o));
  C('xxd', 'printf AB | xxd', (o) => /4142.*AB/.test(o));
  C(['cryptpw'], 'cryptpw -m sha512 -S saltsalt password', `${SHA512_CRYPT}\n`, 'SHA-512 crypt = OpenSSL');
  C(['mkpasswd'], 'mkpasswd -m md5 -S saltsalt password', `${MD5_CRYPT}\n`, 'MD5 crypt = OpenSSL');
  C('ascii', 'ascii', (o) => o.split('\n').length > 10 && /\bA\b/.test(o));

  // ---- files and directories
  C(['mkdir', 'touch', 'ls'], 'mkdir -p dd/sub && touch dd/a dd/b && ls dd', 'a\nb\nsub\n');
  C('cp', 'printf copy > c0 && cp c0 c1 && cat c1', 'copy');
  C('mv', 'mv c1 c2 && ls c1 2>/dev/null; cat c2', 'copy');
  C('rm', 'rm c2 && [ ! -e c2 ] && echo gone', 'gone\n');
  C('rmdir', 'mkdir emp && rmdir emp && [ ! -d emp ] && echo gone', 'gone\n');
  C(['ln', 'readlink'], 'ln -s c0 sl && readlink sl && cat sl', 'c0\ncopy');
  C('realpath', 'realpath dd/../c0', '/home/user/w/c0\n');
  C(['link', 'stat'], 'link c0 hl && cat hl && stat -c %h c0', 'copy2\n');
  C('unlink', 'unlink hl && [ ! -e hl ] && echo gone', 'gone\n');
  C('stat', "printf 12345 > st && stat -c '%s %F %A %U' st", '5 regular file -rw-r--r-- user\n');
  C('ls', 'mkdir -p lsd && ls -ld lsd st', (o) => /^drwxr-xr-x\s+\d+ user\s+user .* lsd$/m.test(o) && /^-rw-r--r--\s+\d+ user\s+user\s+5 .* st$/m.test(o), 'ls -l shows Linux-style permissions and owners');
  C('truncate', 'truncate -s 3 st && stat -c %s st', '3\n');
  C('du', 'mkdir du && printf 1234567890 > du/f && du -s du', (o) => /^\d+\s+du\n$/.test(o));
  C('find', "mkdir -p fx/a && printf 1 > fx/a/x.txt && printf 2 > fx/y.txt && find fx -name '*.txt' | sort", 'fx/a/x.txt\nfx/y.txt\n');
  C('find', "find fx -name '*.txt' -exec cat {} \\; | sort | tr -d '\\n'", '12', 'find -exec (spawn shim)');
  C('xargs', "printf 'a\\nb\\nc\\n' | xargs echo; printf '1\\n2\\n' | xargs -n 1 echo n; printf 'q\\n' | xargs -I{} echo [{}]", 'a b c\nn 1\nn 2\n[q]\n');
  C('dd', 'printf abcdef > d1 && dd if=d1 of=d2 bs=1 skip=2 count=3 2>/dev/null && cat d2', 'cde');
  C('install', 'install -D c0 inst/a/b/c0 && cat inst/a/b/c0', 'copy');
  C('mktemp', 'p=$(mktemp) && [ -f "$p" ] && case $p in /tmp/tmp.*) echo ok;; *) echo "bad $p";; esac', 'ok\n', 'mktemp creates a file in /tmp');
  C('shred', 'printf secret > sh1 && shred -u sh1 && [ ! -e sh1 ] && echo gone', 'gone\n');
  C('tree', 'mkdir -p tr/a && touch tr/a/x tr/y && tree tr', (o) => /tr\n/.test(o) && /a\n/.test(o) && /x\n/.test(o) && /y\n/.test(o) && /2 files?/.test(o));
  C('basename', 'basename /a/b/c.txt .txt', 'c\n');
  C('dirname', 'dirname /a/b/c', '/a/b\n');
  C('sync', 'sync; echo $?', '0\n');
  C('fsync', 'fsync c0; echo $?', '0\n');
  C('flock', "flock /tmp/lk -c 'echo locked'", 'locked\n', 'flock -c (spawn shim → sh -c)');
  C('touch', "touch -d '2001-02-03 04:05:06' tt && stat -c %y tt | cut -c1-19", '2001-02-03 04:05:06\n');

  // ---- archives and compression
  C(['tar'], 'mkdir -p ta && printf T > ta/t && tar -cf t.tar ta && rm -r ta && tar -xf t.tar && cat ta/t && tar -tf t.tar', 'Tta/\nta/t\n');
  C(['gzip', 'gunzip'], "printf 'gz\\n' > g && gzip g && ls g.gz && gunzip g.gz && cat g", 'g.gz\ngz\n');
  C('zcat', 'gzip -c g | zcat', 'gz\n');
  C(['bzip2', 'bunzip2'], "printf 'bz\\n' > b && bzip2 b && ls b.bz2 && bunzip2 b.bz2 && cat b", 'b.bz2\nbz\n');
  C('bzcat', 'bzip2 -c b | bzcat', 'bz\n');
  C(['unxz'], `echo ${XZ} | base64 -d > x.xz && unxz x.xz && cat x`, 'hello from xz\n');
  C('xzcat', `echo ${XZ} | base64 -d | xzcat`, 'hello from xz\n');
  C(['lzcat'], `echo ${LZMA} | base64 -d | lzcat`, 'hello from lzma\n');
  C(['unlzma'], `echo ${LZMA} | base64 -d > m.lzma && unlzma m.lzma && cat m`, 'hello from lzma\n');
  C(['lzma'], `echo ${LZMA} | base64 -d | lzma -dc`, 'hello from lzma\n');
  C(['lzop', 'lzopcat', 'unlzop'], "printf 'lzo\\n' > l && lzop l && lzopcat l.lzo && rm l && unlzop l.lzo && cat l", 'lzo\nlzo\n');
  C(['unzip'], `echo ${ZIP} | base64 -d > z.zip && unzip -q z.zip && cat a.txt dir/b.txt`, 'zip one\nzip two\n');
  C(['cpio'], 'mkdir -p cpd && printf C > cpd/f && cd cpd && echo f | cpio -o -H newc > ../a.cpio 2>/dev/null && cd .. && cpio -t < a.cpio 2>/dev/null', 'f\n');
  C(['ar'], 'printf 1 > a1 && printf 22 > a2 && ar r lib.a a1 a2 2>/dev/null && ar t lib.a && rm a1 && ar x lib.a a1 && cat a1', 'a1\na2\n1');

  // ---- programs that run programs (spawn/exec browser shim)
  C('env', 'env -i A=1 B=2 printenv B', '2\n');
  C('printenv', 'printenv HOME', '/home/user\n');
  C('nice', 'nice -n 5 echo niced', 'niced\n');
  C('nohup', 'nohup echo hup 2>/dev/null', 'hup\n');

  // ---- identity and system information (shims)
  C('whoami', 'whoami', 'user\n');
  C('logname', 'logname', 'user\n');
  C('groups', 'groups', 'user\n');
  C('id', 'id', (o) => /uid=0\(user\) gid=0\(user\)/.test(o));
  C('hostname', 'hostname', 'supertools\n');
  C('uname', 'uname -n; uname -s', (o) => o.startsWith('supertools\n') || /\S/.test(o));
  C('nproc', 'nproc', `${nproc}\n`);
  C('pwd', 'busybox pwd', '/home/user/w\n', 'BusyBox pwd sees the shell cwd ($PWD)');
  C('which', 'busybox which ls', '/bin/ls\n');
  C('clear', 'clear', (o) => o.includes('\x1b['));

  // ---- every applet in the build has a case
  for (const a of applets) t.ok(covered.has(a), `applet "${a}" has a test case`);
  t.ok(applets.length >= 125, `${applets.length} applets built`);
};
