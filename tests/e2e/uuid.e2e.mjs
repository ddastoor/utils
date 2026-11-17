// UUID Generator (#/uuid, PC only): v4 and v7 from libsodium's random bytes in crypto.wasm — format, count, uniqueness,
// v7 strictly increasing inside a batch and from batch to batch with the current time in front; Uppercase / Hyphens
// rewrite the same IDs; the inspector against Python's uuid module (170 UUIDs), the RFC 9562 vectors, nil / max,
// {braces} and urn:uuid:; Copy all.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { REF, setValue, until, hookClipboard, copied } from './_devdata.mjs';
import { chiUniform } from './_stats.mjs';
export default async (ctx) => {
  const { base, page: newPage, ok } = ctx;
  const page = await newPage(); await page.goto(`${base}#/uuid`);
  const out = page.getByLabel('UUIDs'), chk = page.getByLabel('UUID to inspect');
  const sw = (t) => page.locator('label.switch').filter({ hasText: t });
  const list = async () => (await out.inputValue()).split('\n');
  const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  await out.waitFor(); await until(page, () => document.querySelector('textarea').value.length > 30);
  let a = await list();
  ok(a.length === 5 && a.every((u) => V4.test(u)) && new Set(a).size === 5, `5 version-4 UUIDs (${a[0]})`);
  await sw('Uppercase').click(); let b = await list(); ok(b.join() === a.join().toUpperCase(), 'Uppercase rewrites the same UUIDs (it used to make new ones)');
  await sw('Hyphens').click(); b = await list(); ok(b.join() === a.join().toUpperCase().replace(/-/g, '') && b.every((u) => u.length === 32), 'Hyphens off: the same UUIDs as 32 hex digits');
  await sw('Uppercase').click(); await sw('Hyphens').click(); ok((await list()).join() === a.join(), 'and back');
  await page.getByRole('button', { name: 'Generate' }).click(); b = await list(); ok(b.every((u) => V4.test(u)) && b.every((u) => !a.includes(u)), 'Generate makes new ones');
  await page.getByLabel('How many').fill('100'); a = await list();
  ok(a.length === 100 && new Set(a).size === 100 && a.every((u) => V4.test(u)), '100 at once, all different');
  const digits = a.map((u) => u.slice(0, 14) + u.slice(15, 19) + u.slice(20)).join('').replace(/-/g, ''), freq = Array.from({ length: 16 }, (_, i) => digits.split(i.toString(16)).length - 1); // without the version and variant digits
  ok(chiUniform(freq).pass, `the 3,000 random hex digits are spread evenly: ${chiUniform(freq).text}`);
  await page.getByRole('radio', { name: 'v7 (time-ordered)' }).click(); a = await list();
  ok(a.length === 100 && a.every((u) => V7.test(u)) && new Set(a).size === 100, '100 version-7 UUIDs');
  ok(a.join() === [...a].sort().join(), 'a batch of v7 UUIDs is in increasing order (IDs made in the same millisecond used to come out in random order)');
  const ms = (u) => parseInt(u.replace(/-/g, '').slice(0, 12), 16);
  ok(Math.abs(ms(a[0]) - Date.now()) < 5000 && ms(a[99]) - ms(a[0]) < 1000, `they start with the current time in milliseconds (${new Date(ms(a[0])).toISOString()})`);
  let inOrder = 0; for (let i = 0; i < 5; i++) { await page.getByRole('button', { name: 'Generate' }).click(); const n = await list(); if (n[0] > a[99] && n.join() === [...n].sort().join()) inOrder++; a = n; }
  ok(inOrder === 5, 'each new batch sorts after the one before');
  await page.getByLabel('How many').fill('1'); ok((await list()).length === 1, 'one UUID');
  await hookClipboard(page); await page.getByLabel('How many').fill('7'); a = await list();
  await page.getByRole('button', { name: 'Copy all' }).click(); ok(await until(page, () => window.__copied.length === 1) && (await copied(page))[0] === a.join('\n'), 'Copy all copies the list');
  // inspector
  const info = async () => { const t = await page.locator('.card').filter({ hasText: 'Inspect' }).locator('.kv span').allTextContents(); const o = {}; for (let i = 0; i < t.length; i += 2) o[t[i]] = t[i + 1]; return o; };
  const variant = { RFC: /^RFC 9562/, NCS: /^NCS/, Microsoft: /^Microsoft/, reserved: /^reserved/ };
  let good = 0, n = 0;
  for (const [i, r] of REF.uuid.entries()) {
    if (i % 3) continue; n++;
    await setValue(chk, i % 2 ? r.text.toUpperCase() : `{${r.text}}`); const k = await info();
    const okRow = k['Canonical form'] === r.text && variant[r.variant].test(k.Variant) && (r.version === null ? /not defined/.test(k.Version) : k.Version.startsWith(`${r.version} — `)) && (!r.time || k['Time inside it']?.startsWith(r.time)) && (r.clockSeq === undefined || k['Clock sequence'] === String(r.clockSeq)) && (r.node === undefined || k.Node.startsWith(r.node));
    if (okRow) good++; else if (good === n - 1) ok(false, `inspect ${r.text}: ${JSON.stringify(k)} vs ${JSON.stringify(r)}`);
  }
  ok(good === n, `${n} UUIDs (versions 1, 3, 4, 5, 6, 7 and other variants): version, variant, time, clock sequence and node as Python's uuid module reads them (${good})`);
  for (const [u, v] of [['C232AB00-9414-11EC-B3C8-9F6BDECED846', '1 — time-based'], ['1EC9414C-232A-6B00-B3C8-9F6BDECED846', '6 — time-ordered (Gregorian'], ['017F22E2-79B0-7CC3-98C4-DC0C0C07398F', '7 — time-ordered (Unix']]) {
    await setValue(chk, u); const k = await info(); ok(k.Version.startsWith(v) && k['Time inside it'].startsWith('2022-02-22T19:22:22.000Z (') && /years ago\)$/.test(k['Time inside it']), `RFC 9562 test vector for version ${v[0]}: 22 Feb 2022 19:22:22 UTC`);
  }
  for (const s of ['urn:uuid:550e8400-e29b-41d4-a716-446655440000', '550e8400e29b41d4a716446655440000', '"550e8400-e29b-41d4-a716-446655440000"', '  {550E8400-E29B-41D4-A716-446655440000}  ']) { await setValue(chk, s); ok((await info())['Canonical form'] === '550e8400-e29b-41d4-a716-446655440000' && (await info()).Version === '4 — random', `${s.trim()} is accepted`); }
  await setValue(chk, '00000000-0000-0000-0000-000000000000'); ok((await info()).Version === 'Nil UUID (all zeros)' && (await info()).Variant === '—', 'the nil UUID is named (not "v0")');
  await setValue(chk, 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF'); ok((await info()).Version === 'Max UUID (all ones)', 'the max UUID is named (not "v15")');
  await setValue(chk, '6ba7b810-9dad-11d1-80b4-00c04fd430c8'); ok((await info()).Node === '00:c0:4f:d4:30:c8' && (await info())['Clock sequence'] === '180' && (await info())['Time inside it'].startsWith('1998-02-04T22:13:53.151Z'), 'a version-1 UUID shows its time, clock sequence and node');
  for (const s of ['not-a-uuid', '550e8400-e29b-41d4-a716-44665544000', 'g50e8400-e29b-41d4-a716-446655440000']) { await setValue(chk, s); ok(/Not a UUID: it needs 32 hex digits/.test(await page.locator('.card').filter({ hasText: 'Inspect' }).locator('.note-warn').textContent()), `${s}: not a UUID`); }
  await setValue(chk, ''); ok(await page.locator('.card').filter({ hasText: 'Inspect' }).locator('.note, .kv').count() === 0, 'an empty box shows nothing');
  await setValue(chk, (await list())[0]); ok((await info()).Version.startsWith('7 — ') && Math.abs(Date.parse((await info())['Time inside it'].slice(0, 24)) - Date.now()) < 60000, 'a UUID made here inspects as version 7 with the current time');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'uuid');
};
