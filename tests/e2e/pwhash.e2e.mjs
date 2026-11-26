// Password Hash Tool (#/pwhash, PC only): hashes made in the tab are verified by independent implementations in Python —
// argon2-cffi (Argon2id/Argon2i), the bcrypt package, hashlib.pbkdf2_hmac and hashlib.scrypt on the PHC fields — and
// hashes made by Python are verified by the tab (also PBKDF2-SHA1, scrypt, Argon2d); parameters appear in the PHC string;
// out-of-range settings and hashes that would freeze or crash the tab are refused; wrong password; bad hash; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from '../lib/child.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok, info } = ctx;
  const page = await newPage(); await page.goto(`${base}#/pwhash`);
  const pw = page.locator('input[aria-label=Password]'); await pw.waitFor();
  const py = (code, ...args) => execFileSync('python3', ['-c', code, ...args]).toString().trim();
  try { py('import argon2, bcrypt'); } catch { info('python argon2-cffi / bcrypt missing (pip install --user argon2-cffi bcrypt) — suite skipped'); return; }
  const PW = 'Mumbai@2026 नमस्ते';
  const make = async (alg, params) => {
    await page.locator('select').selectOption(alg);
    for (const [k, v] of Object.entries(params)) await page.locator(`input[aria-label="${k}"]`).fill(String(v));
    await pw.fill(PW); await page.getByRole('button', { name: 'Hash', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.outbox textarea, textarea').value.startsWith('$'), null, { timeout: 30000 });
    return page.locator('textarea').first().inputValue();
  };
  let h = await make('argon2id', { 'Memory (KiB)': 8192, 'Iterations (time cost)': 3, Parallelism: 2 });
  ok(/^\$argon2id\$v=19\$m=8192,t=3,p=2\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/.test(h), `Argon2id PHC with the chosen m/t/p (${h.slice(0, 32)}…)`);
  ok(py('import argon2,sys; print(argon2.PasswordHasher().verify(sys.argv[1], sys.argv[2]))', h, PW) === 'True', 'argon2-cffi verifies the Argon2id hash');
  h = await make('argon2i', { 'Memory (KiB)': 4096, 'Iterations (time cost)': 2, Parallelism: 1 }); ok(py('import argon2,sys; print(argon2.PasswordHasher(type=argon2.Type.I).verify(sys.argv[1], sys.argv[2]))', h, PW) === 'True', 'argon2-cffi verifies Argon2i');
  h = await make('bcrypt', { 'Cost (2^n rounds)': 6 }); ok(/^\$2b\$06\$/.test(h) && py('import bcrypt,sys; print(bcrypt.checkpw(sys.argv[2].encode(), sys.argv[1].encode()))', h, PW) === 'True', `Python bcrypt verifies ${h.slice(0, 10)}…`);
  const b64 = (s) => s.replace(/\./g, '+') + '='.repeat((4 - (s.length % 4)) % 4);
  h = await make('pbkdf2-sha256', { Iterations: 5000 }); let [, , prm, salt, dk] = h.split('$');
  ok(prm === 'i=5000,l=32' && py('import hashlib,base64,sys; s=base64.b64decode(sys.argv[2]); d=hashlib.pbkdf2_hmac("sha256", sys.argv[3].encode(), s, 5000, 32); print(base64.b64encode(d).decode().rstrip("=")==sys.argv[1].replace(".","+"))', dk, b64(salt), PW) === 'True', 'hashlib.pbkdf2_hmac reproduces the PBKDF2-SHA256 hash');
  h = await make('pbkdf2-sha512', { Iterations: 3000 }); [, , prm, salt, dk] = h.split('$');
  ok(py('import hashlib,base64,sys; s=base64.b64decode(sys.argv[2]); d=hashlib.pbkdf2_hmac("sha512", sys.argv[3].encode(), s, 3000, 32); print(base64.b64encode(d).decode().rstrip("=")==sys.argv[1])', dk, b64(salt), PW) === 'True', 'hashlib reproduces PBKDF2-SHA512');
  h = await make('scrypt', { 'log2(N)': 12, 'Block size r': 8, Parallelism: 1 }); [, , prm, salt, dk] = h.split('$');
  ok(prm === 'ln=12,r=8,p=1' && py('import hashlib,base64,sys; s=base64.b64decode(sys.argv[2]); d=hashlib.scrypt(sys.argv[3].encode(), salt=s, n=4096, r=8, p=1, dklen=32); print(base64.b64encode(d).decode().rstrip("=")==sys.argv[1])', dk, b64(salt), PW) === 'True', 'hashlib.scrypt reproduces the scrypt hash');
  ok(/Took \d+ ms/.test(await page.locator('.muted', { hasText: 'Took' }).textContent()), 'time taken shown');
  const check = async (hash, p) => { await page.locator('input[aria-label="Hash to check"]').fill(hash); await page.locator('input[aria-label="Password to check"]').fill(p); await page.getByRole('button', { name: 'Check', exact: true }).click(); await page.waitForTimeout(400); return page.locator('.card', { hasText: 'Check a password' }).locator('.note').textContent().catch(() => ''); };
  const pyArgon = py('import argon2,sys; print(argon2.PasswordHasher(time_cost=2, memory_cost=4096, parallelism=1).hash(sys.argv[1]))', 'from python');
  ok(/Match ✓ \(argon2\)/.test(await check(pyArgon, 'from python')), 'an Argon2id hash made by argon2-cffi verifies');
  ok(/No match/.test(await check(pyArgon, 'from pythoN')), 'wrong password → No match');
  const pyB = py('import bcrypt,sys; print(bcrypt.hashpw(sys.argv[1].encode(), bcrypt.gensalt(5)).decode())', 'from python');
  ok(/Match ✓ \(bcrypt\)/.test(await check(pyB, 'from python')), 'a bcrypt hash made by Python verifies');
  ok(/Match ✓ \(bcrypt\)/.test(await check('$2y$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW'.replace('$2y$', '$2a$'), 'U*U')), 'Openwall bcrypt vector');
  ok(/Not a recognised hash/.test(await check('nonsense', 'x')), 'garbage hash → message');
  // ---- bug hunt, Nov 2026: parameters are checked (they used to wrap around, crash the engine or freeze the tab)
  const tryHash = async (alg, params, p = PW) => {
    await page.locator('select').selectOption(alg); for (const [k, v] of Object.entries(params)) await page.locator(`input[aria-label="${k}"]`).fill(String(v));
    await page.locator('textarea').first().evaluate((t) => (t.value = '')); await pw.fill(p); await page.getByRole('button', { name: 'Hash', exact: true }).click(); await page.waitForTimeout(350);
    return { toast: await page.locator('.toast-err').last().textContent().catch(() => ''), out: await page.locator('textarea').first().inputValue() };
  };
  const refusals = [
    ['argon2id', { 'Memory (KiB)': 4 }, /Memory \(KiB\) must be a whole number from 8/], ['argon2id', { 'Memory (KiB)': 2000000 }, /Memory \(KiB\) must be a whole number/], ['argon2id', { 'Memory (KiB)': 16, Parallelism: 4 }, /at least 8 KiB per lane \(32 KiB/],
    ['argon2id', { 'Iterations (time cost)': 0 }, /Iterations must be a whole number from 1 to 1000/], ['argon2id', { 'Iterations (time cost)': 2.5 }, /whole number/], ['argon2id', { Parallelism: 100 }, /Parallelism must be/],
    ['bcrypt', { 'Cost (2^n rounds)': 3 }, /Cost must be a whole number from 4 to 18/], ['bcrypt', { 'Cost (2^n rounds)': 31 }, /Cost must be/], ['pbkdf2-sha256', { Iterations: 0 }, /Iterations must be a whole number from 1/], ['pbkdf2-sha256', { Iterations: -5 }, /Iterations must be/],
    ['pbkdf2-sha512', { Iterations: 4294967297 }, /Iterations must be/], ['scrypt', { 'log2(N)': 131072 }, /log2\(N\) must be a whole number from 1 to 24/], ['scrypt', { 'log2(N)': 24, 'Block size r': 8 }, /needs 16384 MiB of memory/], ['scrypt', { 'log2(N)': 12, 'Block size r': 0 }, /Block size r must be/],
  ];
  const notRefused = [];
  for (const [alg, prm, re] of refusals) { const r = await tryHash(alg, prm); if (!re.test(r.toast) || r.out) notRefused.push(`${alg} ${JSON.stringify(prm)} → "${r.toast}" ${r.out.slice(0, 20)}`); await page.locator('select').selectOption('bcrypt'); }
  ok(!notRefused.length, `${refusals.length} out-of-range settings are refused with a plain message and no hash ${notRefused.join(' | ')}`);
  let r72 = await tryHash('bcrypt', { 'Cost (2^n rounds)': 4 }, 'x'.repeat(73)); ok(/first 72 bytes/.test(r72.toast) && !r72.out, 'bcrypt: a password over 72 bytes is refused (it would be cut silently)');
  r72 = await tryHash('bcrypt', { 'Cost (2^n rounds)': 4 }, 'x'.repeat(72)); ok(/^\$2b\$04\$/.test(r72.out), 'bcrypt: exactly 72 bytes is fine');
  await pw.fill(''); await page.getByRole('button', { name: 'Hash', exact: true }).click(); await page.waitForTimeout(200); ok(/Enter a password/.test(await page.locator('.toast-err').last().textContent()), 'empty password → "Enter a password"');
  // hashes from other systems
  const pyP = (alg, pwd, it) => py('import hashlib,base64,sys,os; s=os.urandom(16); d=hashlib.pbkdf2_hmac(sys.argv[1], sys.argv[2].encode(), s, int(sys.argv[3]), 20 if sys.argv[1]=="sha1" else 32); e=lambda b: base64.b64encode(b).decode().rstrip("="); print("$pbkdf2-%s$i=%s,l=%d$%s$%s" % (sys.argv[1], sys.argv[3], len(d), e(s), e(d)))', alg, pwd, String(it));
  const h1 = pyP('sha1', 'legacy पासवर्ड', 1500);
  ok(/Match ✓ \(pbkdf2\)/.test(await check(h1, 'legacy पासवर्ड')) && /No match/.test(await check(h1, 'legacy')), 'PBKDF2-HMAC-SHA1 hash made by hashlib: right password matches, wrong one does not (used to say "No match" for both)');
  const h256 = pyP('sha256', 'p', 2000), h512 = pyP('sha512', 'p', 2000);
  ok(/Match ✓/.test(await check(h256, 'p')) && /Match ✓/.test(await check(h512, 'p')) && /No match/.test(await check(h512, 'q')), 'PBKDF2-SHA256 / SHA512 hashes made by hashlib verify');
  const pyS = py('import hashlib,base64,os; s=os.urandom(16); d=hashlib.scrypt(b"tea", salt=s, n=1024, r=8, p=2, dklen=32); e=lambda b: base64.b64encode(b).decode().rstrip("="); print("$scrypt$ln=10,r=8,p=2$%s$%s" % (e(s), e(d)))');
  ok(/Match ✓ \(scrypt\)/.test(await check(pyS, 'tea')) && /No match/.test(await check(pyS, 'coffee')), 'scrypt hash made by hashlib verifies');
  const pyAd = py('import argon2,sys; print(argon2.PasswordHasher(time_cost=1, memory_cost=1024, parallelism=2, type=argon2.Type.D).hash("d"))');
  ok(/Match ✓ \(argon2\)/.test(await check(pyAd, 'd')), 'Argon2d hash made by argon2-cffi verifies');
  ok(/cannot be checked|Not a recognised/.test(await check('$argon2id$v=19$m=4096,t=2,p=1$c2FsdA$!!!!', 'x')), 'a damaged Argon2 hash → "cannot be checked", not "No match"');
  ok(/needs \d+ MiB of memory/.test(await check('$argon2id$v=19$m=4194304,t=1,p=1$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG', 'x')), 'an Argon2 hash that needs 4 GiB is refused instead of crashing the engine');
  ok(/cost 31/.test(await check('$2b$31$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW', 'x')), 'a bcrypt hash with cost 31 is refused (it would run for days)');
  ok(/more memory than a browser tab/.test(await check('$scrypt$ln=30,r=8,p=1$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG', 'x')), 'a scrypt hash with N = 2^30 is refused');
  ok(/Unsupported hash scheme|Not a recognised/.test(await check('$md5$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA', 'x')), 'unknown scheme named');
  ok(/Paste the hash/.test(await check('', 'x')), 'empty hash → "Paste the hash to check"');
  ok(/Match ✓/.test(await check(`  ${pyB}\n`, 'from python')), 'spaces / newline around a pasted hash are ignored');
  page.errors.splice(0, page.errors.length, ...page.errors.filter((e) => !/must be|per lane|72 bytes|Enter a password|MiB of memory|cannot be checked|cost 31|browser tab|Unsupported|Paste the hash|Not a recognised/.test(e)));
  ok(await pw.getAttribute('type') === 'password', 'password hidden by default');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'pwhash');
};
