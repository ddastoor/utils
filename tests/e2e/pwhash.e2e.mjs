// Password Hash Tool (#/pwhash, PC only): hashes made in the tab are verified by independent implementations in Python —
// argon2-cffi (Argon2id/Argon2i), the bcrypt package, hashlib.pbkdf2_hmac and hashlib.scrypt on the PHC fields — and
// hashes made by Python are verified by the tab; parameters appear in the PHC string; wrong password; bad hash; phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { execFileSync } from 'node:child_process';
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
  ok(await pw.getAttribute('type') === 'password', 'password hidden by default');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'pwhash');
};
