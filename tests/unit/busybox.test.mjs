// busybox.wasm (our wasm32-wasi build of BusyBox 1.38.0) run under Node's WASI against a real temp directory:
// every applet group gives a known answer; cwd comes from $PWD (each command is a fresh instance).
import { WASI } from 'node:wasi';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, readFileSync as rd } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export default async (t, { root }) => {
  const mod = await WebAssembly.compile(readFileSync(join(root, 'src/wasm/bin/busybox.wasm')));
  const dir = mkdtempSync(join(tmpdir(), 'bb-'));
  try {
    writeFileSync(join(dir, 'fruit.txt'), 'banana\napple\ncherry\napple\n');
    mkdirSync(join(dir, 'sub'));
    // stdin/stdout through files (Node WASI uses real fds): run(args, stdin) → { out, code }
    let n = 0;
    const run = async (args, stdin = '', pwd = '/') => {
      const i = n++, inF = join(dir, `.in${i}`), outF = join(dir, `.out${i}`);
      writeFileSync(inF, stdin); writeFileSync(outF, '');
      const { openSync, closeSync } = await import('node:fs');
      const fin = openSync(inF, 'r'), fout = openSync(outF, 'w');
      const w = new WASI({ version: 'preview1', args, env: { PWD: pwd, HOME: '/', TZ: 'UTC' }, preopens: { '/': dir }, stdin: fin, stdout: fout, stderr: fout, returnOnExit: true });
      const code = w.start(await WebAssembly.instantiate(mod, w.getImportObject()));
      for (const f of [fin, fout]) try { closeSync(f); } catch { /* the program may have closed it */ }
      return { out: rd(outF, 'utf8'), code };
    };
    const eq = async (args, want, msg, stdin) => t.eq((await run(args, stdin)).out, want, msg || args.join(' '));
    t.ok((await run(['busybox', '--list'])).out.split('\n').filter(Boolean).length >= 85, 'about 88 applets built');
    await eq(['echo', 'hello', 'world'], 'hello world\n');
    await eq(['sort', '-u', '/fruit.txt'], 'apple\nbanana\ncherry\n');
    await eq(['uniq', '-c'], '      2 a\n      1 b\n', 'uniq -c', 'a\na\nb\n');
    await eq(['wc', '-l', '/fruit.txt'], '4 /fruit.txt\n');
    await eq(['grep', '-c', 'apple', '/fruit.txt'], '2\n');
    await eq(['sed', 's/an/AN/g', '/fruit.txt'], 'bANANa\napple\ncherry\napple\n');
    await eq(['awk', '{n[$1]++} END {print n["apple"]}', '/fruit.txt'], '2\n', 'awk associative arrays');
    await eq(['tr', 'a-z', 'A-Z'], 'HELLO\n', 'tr', 'hello\n');
    await eq(['cut', '-d,', '-f2'], 'b\ne\n', 'cut', 'a,b,c\nd,e,f\n');
    await eq(['head', '-n', '2', '/fruit.txt'], 'banana\napple\n');
    await eq(['tail', '-n', '1', '/fruit.txt'], 'apple\n');
    await eq(['tac', '/fruit.txt'], 'apple\ncherry\napple\nbanana\n');
    await eq(['seq', '-s', ',', '5'], '1,2,3,4,5\n');
    await eq(['factor', '360'], '360: 2 2 2 3 3 5\n');
    await eq(['expr', '6', '*', '7'], '42\n');
    await eq(['bc'], '1267650600228229401496703205376\n', 'bc 2^100', '2^100\n');
    await eq(['bc', '-l'], '3.14159265358979323844\n', 'bc -l pi', 'scale=20; 4*a(1)\n');
    await eq(['dc'], '5\n', 'dc', '2 3 + p\n');
    await eq(['sha256sum', '/fruit.txt'], 'f436c825fec3a18c8105983f22374edf4366b4fb2f525d82a3a91dadf6911fa1  /fruit.txt\n');
    await eq(['md5sum'], 'd41d8cd98f00b204e9800998ecf8427e  -\n', 'md5 of empty input', '');
    await eq(['base64'], 'aGVsbG8=\n', 'base64', 'hello');
    await eq(['printf', '%05.1f|%s\n', '3.14159', 'x'], '003.1|x\n');
    await eq(['date', '-u', '-d', '@0', '+%Y-%m-%d'], '1970-01-01\n');
    t.ok((await run(['cal', '2', '2024'])).out.includes('25 26 27 28 29'), 'cal Feb 2024 (leap year)');
    // files: mkdir/touch/cp/mv/rm/ls/find with cwd from $PWD
    await run(['mkdir', '-p', '/sub/a/b']); await run(['touch', '/sub/a/b/x.txt']);
    await run(['cp', '/fruit.txt', 'copy.txt'], '', '/sub');
    t.ok(rd(join(dir, 'sub/copy.txt'), 'utf8').startsWith('banana'), 'cp relative to $PWD');
    await run(['mv', '/sub/copy.txt', '/sub/moved.txt']);
    await eq(['ls', '/sub'], 'a\nmoved.txt\n', 'ls after mv');
    t.eq((await run(['find', '/sub', '-name', '*.txt'])).out.split('\n').filter(Boolean).sort(), ['/sub/a/b/x.txt', '/sub/moved.txt'], 'find -name');
    await run(['rm', '-r', '/sub/a']);
    await eq(['ls', '/sub'], 'moved.txt\n', 'rm -r');
    // archives round trip (compression flags need a second process; the terminal's shell turns them into pipelines)
    await run(['tar', '-cf', '/f.tar', '-C', '/', 'fruit.txt']);
    await eq(['tar', '-tf', '/f.tar'], 'fruit.txt\n', 'tar -cf / -tf');
    t.ok((await run(['tar', '-czf', '/f.tgz', '/fruit.txt'])).code !== 0, 'tar -z is refused cleanly (the terminal shell turns it into a pipeline)');
    await run(['gzip', '-k', '/fruit.txt']);
    await eq(['zcat', '/fruit.txt.gz'], 'banana\napple\ncherry\napple\n', 'gzip + zcat');
    await run(['bzip2', '-k', '/fruit.txt']);
    await eq(['bzcat', '/fruit.txt.bz2'], 'banana\napple\ncherry\napple\n', 'bzip2 + bzcat');
    await eq(['diff', '/fruit.txt', '/fruit.txt'], '', 'diff identical files');
    // error handling: missing file → message + non-zero exit, no trap
    const bad = await run(['cat', '/nope']);
    t.ok(bad.code !== 0 && /No such file/.test(bad.out), `missing file error (${bad.code})`);
    const gz = await run(['gunzip', '-c', '/fruit.txt']); // not gzip data → longjmp error path
    t.ok(gz.code !== 0 && /invalid|not in gzip/i.test(gz.out), `corrupt gzip handled via setjmp/longjmp (${gz.out.trim()})`);
    void spawnSync;
  } finally { rmSync(dir, { recursive: true, force: true }); }
};
