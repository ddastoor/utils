// Visiting Card → Contact (#/visitcard, PC + phones; potentials #89) end to end on the card photos of tests/fixtures/snaps
// (scripts/make-snap-photos.py): each card read by the tab — the name, title, company, numbers with their kinds, e-mail, website and
// address as printed; the contact of a card's QR code with what the card prints beside it; a card from the United States (+1 from
// its address); a dark card; a card's two sides as one contact — and every file the tab saves read by Python's vobject, the
// independent reader (pip install vobject; skipped with a note where missing), the QR code read back by zbar (zbarimg) and its
// vCard by vobject. Then: editing the boxes changes the file, a number typed by hand named by its country, "Save all", removing a
// contact, a photo without a card, leaving mid-reading, WCAG 2.2 A / AA in both themes, the phone.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from '../lib/child.mjs';
import { phoneLayout } from './_phone.mjs';
const F = (n) => fileURLToPath(new URL(`../fixtures/snaps/${n}`, import.meta.url));
const IMG = (n) => fileURLToPath(new URL(`../fixtures/images/${n}`, import.meta.url));
const TRUTH = JSON.parse(readFileSync(F('truth.json'), 'utf8'));
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const VOBJECT = `
import sys, json, vobject
out = []
for v in vobject.readComponents(open(sys.argv[1], encoding='utf-8').read()):
    g = lambda k: [x for x in v.contents.get(k, [])]
    n = v.n.value
    a = g('adr')[0].value if g('adr') else None
    out.append({'n': [n.family, n.given, n.additional, n.prefix, n.suffix], 'fn': v.fn.value, 'org': g('org')[0].value[0] if g('org') else '',
      'title': g('title')[0].value if g('title') else '', 'tel': [[t.value, sorted(x.upper() for x in t.params.get('TYPE', []))] for t in g('tel')],
      'email': [e.value for e in g('email')], 'url': [u.value for u in g('url')], 'adr': [a.street, a.city, a.region, a.code, a.country] if a else None,
      'note': g('note')[0].value if g('note') else ''})
print(json.dumps(out))
`;

export default async ({ base, page: newPage, ok, tmp, devices }) => {
  const zbar = (path) => { const r = spawnSync('zbarimg', ['-q', '--raw', path], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.replace(/\n$/, '') : r.error ? null : ''; };
  const vobj = (path) => { const r = spawnSync('python3', ['-c', VOBJECT, path], { encoding: 'utf8' }); return r.status === 0 ? JSON.parse(r.stdout) : /No module named/.test(r.stderr) ? null : { error: r.stderr.slice(-300) }; };
  const saved = async (page, click) => { const d = page.waitForEvent('download', { timeout: 60000 }); await click(); const dl = await d; const p = join(tmp, `${Date.now()}-${dl.suggestedFilename()}`); await dl.saveAs(p); return [p, dl.suggestedFilename()]; };
  const reads = (page) => page.evaluate(() => +(document.querySelector('[data-reads]')?.getAttribute('data-reads') || 0));
  const read = async (page, name, file = F(name)) => {
    const n = await reads(page);
    await page.locator('input[type=file]').first().setInputFiles(file);
    await page.waitForFunction((k) => +(document.querySelector('[data-reads]')?.getAttribute('data-reads') || 0) > k, n, { timeout: 180000 });
    await page.waitForTimeout(300);
  };
  /** the newest contact's boxes, as the tab shows them */
  const shown = (page, i = 0) => page.locator('.vc-contact').nth(i).evaluate((el) => {
    const f = (label) => [...el.querySelectorAll('.field')].find((x) => x.querySelector('.field-label')?.textContent === label);
    const val = (label) => f(label)?.querySelector('input, textarea')?.value ?? '';
    return { name: val('Name'), title: val('Job title'), org: val('Company'),
      phones: [...el.querySelectorAll('[aria-label="Phone numbers"] .vc-item')].map((r) => [r.querySelector('select').value, r.querySelector('input').value]),
      emails: [...el.querySelectorAll('[aria-label="E-mail addresses"] input')].map((x) => x.value), urls: [...el.querySelectorAll('[aria-label="Websites"] input')].map((x) => x.value),
      address: ['Street', 'City', 'State or region', 'PIN or postcode', 'Country'].map(val), from: el.querySelector('.vc-from')?.textContent };
  });
  const adrText = (a) => { const [street, city, region, postcode, country] = a; const town = region ? [city, [region, postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ') : [city, postcode].filter(Boolean).join(' '); return [street, town, country].filter(Boolean).join(', '); };
  const want = (k) => { const w = TRUTH[k]; return { name: [w.prefix, w.name].filter(Boolean).join(' '), title: w.title, org: w.org, emails: w.email ? [w.email] : [], urls: w.url ? [w.url] : [], address: w.address }; };
  const got = (s) => ({ name: s.name, title: s.title, org: s.org, emails: s.emails, urls: s.urls.map((u) => u.replace(/^https?:\/\//, '')), address: adrText(s.address) });
  const KIND = { cell: 'cell', work: 'work', home: 'home', fax: 'fax' };

  const page = await newPage({ viewport: { width: 1280, height: 1000 } });
  const asked = []; page.on('request', (r) => asked.push(r.url()));
  await page.goto(base + '#/visitcard');
  await page.locator('input[type=file]').first().waitFor({ state: 'attached' });
  await page.waitForTimeout(300);
  const early = asked.filter((u) => /\.wasm(\?|$)|\/vendor\/|\/models\/|\/data\//.test(u));
  ok(!early.length, `nothing heavy fetched as the tab opens — the OCR, zxing-cpp and the numbers' engine come with the first photo ${early.join(' ')}`);

  // ---- an Indian card: every field; the file read by vobject; the QR code by zbar, its vCard by vobject
  await read(page, 'card-a.jpg');
  const a = await shown(page);
  ok(JSON.stringify(got(a)) === JSON.stringify(want('card-a')), `card-a: every field as printed ${JSON.stringify(got(a))}`);
  ok(JSON.stringify(a.phones) === JSON.stringify([['cell', '+91 98450 12345'], ['work', '+91 80 4112 3456']]), `card-a: the mobile and the office number (its "(O)" read as "(0)") ${JSON.stringify(a.phones)}`);
  ok(/Indian mobile number/.test(await page.locator('.vc-contact').first().innerText()) && /Bangalore, Karnataka/.test(await page.locator('.vc-contact').first().innerText()), 'each number named: an Indian mobile number, a landline in Bangalore');
  ok(/Read: Ananya Iyer — 2 phone numbers, an e-mail address, a website and the address/.test(await page.locator('.tool-body').innerText()), 'the line says what was read');
  const [vcf, vcfName] = await saved(page, () => page.locator('.vc-contact').first().getByRole('button', { name: 'Save contact (.vcf)' }).click());
  const va = vobj(vcf);
  if (va === null) ok(true, 'vobject is not installed — the independent reading of the files skipped');
  else {
    ok(vcfName === 'Ananya Iyer.vcf' && va.length === 1 && JSON.stringify(va[0].n) === JSON.stringify(['Iyer', 'Ananya', '', '', '']) && va[0].fn === 'Ananya Iyer', `vobject reads the file: N and FN (${vcfName}) ${JSON.stringify(va[0]?.n ?? va)}`);
    ok(JSON.stringify(va[0].tel) === JSON.stringify([['+91 98450 12345', ['CELL']], ['+91 80 4112 3456', ['VOICE', 'WORK']]]) && va[0].email[0] === 'ananya.iyer@kaverisoft.in' && va[0].url[0] === 'https://www.kaverisoft.in'
      && JSON.stringify(va[0].adr) === JSON.stringify(['4th Floor, Prestige Tower, MG Road', 'Bengaluru', '', '560001', '']) && va[0].org === 'Kaveri Software Solutions Pvt. Ltd.' && va[0].title === 'Senior Product Manager',
    `vobject: the numbers and their kinds, e-mail, website, address by its parts, company, title ${JSON.stringify(va[0])}`);
  }
  const [png] = await saved(page, () => page.locator('.vc-contact').first().getByRole('button', { name: 'Save QR (PNG)' }).click());
  const code = zbar(png);
  if (code === null) ok(true, 'zbarimg is not installed — skipped');
  else {
    const p2 = join(tmp, 'from-qr.vcf'); (await import('node:fs')).writeFileSync(p2, code);
    const vq = vobj(p2);
    ok(/^BEGIN:VCARD/.test(code) && (vq === null || (vq[0].fn === 'Ananya Iyer' && vq[0].tel.length === 2 && vq[0].email[0] === 'ananya.iyer@kaverisoft.in')), `zbar reads the QR code, vobject its vCard ${vq ? JSON.stringify(vq[0]?.tel) : ''}`);
  }
  // ---- editing: the name re-split, a number typed by hand, the file follows
  const first = page.locator('.vc-contact').first();
  await first.locator('.field', { hasText: 'Name' }).first().locator('input').fill('Dr. Ananya R. Iyer');
  await first.getByRole('button', { name: 'Add a phone number' }).click();
  await first.locator('[aria-label="Phone numbers"] .vc-item').last().locator('input').fill('+44 20 7946 0958');
  await page.waitForTimeout(700);
  ok(/United Kingdom \(calling code \+44\)/.test(await first.innerText()) && /first name Ananya · middle R\. · last name Iyer/.test(await first.innerText()), 'a number typed by hand named by its calling code; the name\'s parts said');
  const [vcf2] = await saved(page, () => first.getByRole('button', { name: 'Save contact (.vcf)' }).click());
  const vb = vobj(vcf2);
  if (vb) ok(JSON.stringify(vb[0].n) === JSON.stringify(['Iyer', 'Ananya', 'R.', 'Dr.', '']) && vb[0].tel.length === 3 && vb[0].tel[2][0] === '+44 20 7946 0958', `the file follows the boxes ${JSON.stringify(vb[0].n)} ${JSON.stringify(vb[0].tel)}`);

  // ---- more cards: the QR code's contact; a card from the United States; a dark card
  for (const k of ['card-b', 'card-c', 'card-d', 'card-e', 'card-f']) {
    await read(page, `${k}.jpg`);
    const s = await shown(page);
    const phones = s.phones.map(([kind]) => KIND[kind]);
    const ok1 = JSON.stringify(got(s)) === JSON.stringify(want(k)) && s.phones.length === TRUTH[k].phones.length && JSON.stringify(phones.sort()) === JSON.stringify(TRUTH[k].phones.map((p) => p[1]).sort());
    ok(ok1, `${k}: every field as printed ${JSON.stringify(got(s))} ${JSON.stringify(s.phones)}`);
    if (k === 'card-d') ok(/QR code \(exact\) and its printed text/.test(s.from), `card-d: the card's QR code read exactly, its printed text adding the rest (${s.from})`);
    if (k === 'card-e') ok(JSON.stringify(s.phones) === JSON.stringify([['work', '+1 (408) 555-0199'], ['cell', '+1 (408) 555-0142']]), `card-e: numbers without a calling code given +1 by the card's US address ${JSON.stringify(s.phones)}`);
  }
  // ---- a card's two sides
  await read(page, 'card-g-front.jpg');
  const before = await page.locator('.vc-contact').count();
  await page.locator('.vc-contact').first().getByRole('button', { name: 'Read the other side' }).click();
  ok(/other side of Kavya Reddy’s card/.test(await page.locator('.tool-body').innerText()), 'the next photo is the other side — said');
  await read(page, 'card-g-back.jpg');
  const g = await shown(page);
  ok((await page.locator('.vc-contact').count()) === before && g.name === 'Kavya Reddy' && g.phones.length === 2 && g.emails[0] === 'kavya.reddy@zenithfoods.in' && adrText(g.address) === TRUTH['card-g-back'].address,
    `the back added to the same contact: its numbers, e-mail and address ${JSON.stringify(g)}`);
  // ---- all contacts in one file
  const n = await page.locator('.vc-contact').count();
  const [all, allName] = await saved(page, () => page.getByRole('button', { name: `Save all ${n} contacts (.vcf)` }).click());
  const vall = vobj(all);
  if (vall) ok(vall.length === n && allName === `contacts-${n}.vcf` && vall.map((x) => x.fn).includes('Dr. Meera Krishnan') && vall.map((x) => x.fn).includes('Jordan Ellis'), `"Save all": one file of ${n} contacts, read by vobject (${vall.length})`);
  // ---- removing; a photo without a card
  await page.locator('.vc-contact').first().getByRole('button', { name: 'Remove', exact: true }).click();
  ok((await page.locator('.vc-contact').count()) === n - 1, 'a contact removed');
  const before2 = await page.locator('.vc-contact').count();
  await read(page, 'coffee.jpg', IMG('coffee.jpg'));
  ok((await page.locator('.vc-contact').count()) === before2, 'a photo without a card adds no contact');
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  // ---- leaving mid-reading
  const lv = await newPage();
  await lv.goto(base + '#/visitcard'); await lv.locator('input[type=file]').first().waitFor({ state: 'attached' });
  await lv.locator('input[type=file]').first().setInputFiles(F('card-a.jpg'));
  await lv.waitForTimeout(1500);
  await lv.goto(base + '#/qr'); await lv.waitForTimeout(1500);
  ok(!lv.errors.length, `leaving the tab while it reads: no page errors ${lv.errors.slice(0, 2).join(' | ')}`);

  // ---- WCAG 2.2 A / AA with a contact, light and dark
  const ax = await newPage({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
  for (const scheme of ['light', 'dark']) {
    await ax.emulateMedia({ colorScheme: scheme });
    await ax.goto('about:blank'); await ax.goto(base + '#/visitcard');
    await ax.locator('input[type=file]').first().waitFor({ state: 'attached' });
    await read(ax, 'card-c.jpg');
    if (!(await ax.evaluate(() => !!window.axe))) await ax.addScriptTag({ content: AXE });
    const v = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!v.length, `${scheme} theme, with a contact: no WCAG 2.2 A / AA violation ${v.join(' | ')}`);
  }

  // ---- the phone
  await phoneLayout({ base, page: newPage, devices, ok }, 'visitcard', { ready: '.drop', buttons: ['Save contact', 'Save QR (PNG)'], before: async (p) => { await read(p, 'card-b.jpg'); } });
};
