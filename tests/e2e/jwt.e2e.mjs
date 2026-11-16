// JWT Decoder (#/jwt): header and payload of real tokens (base64url with - and _, no padding, non-ASCII claims),
// iat/nbf/exp shown, expired / not-yet-valid / valid notes, unsigned two-part tokens, garbage, signature warning.
import { pcOnlyOnPhone } from './_pconly.mjs';
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tok = (h, p, sig = 'c2lnbmF0dXJl') => `${b64u(h)}.${b64u(p)}${sig === null ? '' : '.' + sig}`;
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/jwt`);
  const ta = page.getByLabel('JWT');
  const boxes = () => page.$$eval('.card textarea', (t) => t.slice(1).map((e) => JSON.parse(e.value)));
  const notes = async () => (await page.locator('.note').allTextContents()).join(' | ');
  await ta.waitFor();
  let [h, p] = await boxes();
  ok(h.alg === 'HS256' && p.name === 'SuperTools' && p.exp === 1800000000, 'default sample decoded');
  ok(/not expired/.test(await notes()) && /NOT verified/.test(await notes()), 'not expired; signature not verified warning');
  const now = Math.floor(Date.now() / 1000);
  const P = { sub: 'user/42?x=>>>', name: 'अनन्या 👩‍💻', roles: ['admin', 'ops'], iat: now - 60, exp: now - 10 };
  const T = tok({ alg: 'RS256', typ: 'JWT', kid: 'k-1' }, P);
  ok(/[-_]/.test(T.split('.')[1]), 'test token uses the URL-safe characters - and _');
  await ta.fill(T); [h, p] = await boxes();
  ok(h.alg === 'RS256' && h.kid === 'k-1' && JSON.stringify(p) === JSON.stringify(P), 'header and payload exact (base64url, Unicode claims)');
  ok(/EXPIRED/.test(await notes()), 'expired token flagged');
  ok(await page.locator('.kv > span').filter({ hasText: /^(iat|exp)$/ }).count() === 2, 'iat and exp shown as dates');
  await ta.fill(tok({ alg: 'HS256' }, { nbf: now + 3600, exp: now + 7200 })); ok(/NOT VALID YET/.test(await notes()) && /not expired/.test(await notes()), 'nbf in the future → not valid yet');
  await ta.fill(tok({ alg: 'none' }, { a: 1 }, null)); [h, p] = await boxes(); ok(h.alg === 'none' && p.a === 1, 'unsigned two-part token');
  await ta.fill(`  ${tok({ alg: 'HS256' }, { a: 2 })}\n`); [, p] = await boxes(); ok(p.a === 2, 'surrounding spaces/new lines ignored');
  await ta.fill('hello'); ok(/three dot-separated parts/.test(await notes()), 'not a JWT');
  await ta.fill('abc.def.ghi'); ok(/not a valid JWT/.test(await notes()), 'undecodable parts reported');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'jwt');
};
