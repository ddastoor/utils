// Paper Deadlines → Calendar (#/deadlines, PC + phones; potentials #77) end to end on the papers of tests/fixtures/snaps
// (scripts/make-snap-photos.py): a bill, an insurance renewal letter, a school circular photographed — every date found with what it
// is for, the deadlines counted from another date ("within 7 days of the bill date", "30 days after expiry"), a meeting's time, the
// amounts; the ticked reminders saved as one calendar file and one row's alone, both read by Python's vobject (pip install vobject;
// skipped with a note where missing): all-day deadlines and the meeting at 10:00 local time, each with its reminder. Then: a row's
// date and time edited, a message's text pasted (month first), a photo without dates, leaving mid-reading, WCAG 2.2 A / AA in both
// themes, the phone. The page's clock is set to 28 November 2026 (Playwright's fixed time: the papers' dates stay ahead of "today").
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
const NOW = new Date('2026-11-28T10:00:00');
const VOBJECT = `
import sys, json, vobject
cal = vobject.readOne(open(sys.argv[1], encoding='utf-8').read())
out = []
for e in cal.vevent_list:
    s = e.dtstart.value
    a = e.contents.get('valarm', [])
    out.append({'summary': e.summary.value, 'start': s.isoformat(), 'allday': not hasattr(s, 'hour'), 'desc': e.description.value if 'description' in e.contents else '',
      'trigger': a[0].trigger.value.total_seconds() if a else None})
print(json.dumps(out))
`;

export default async ({ base, page: newPage, ok, tmp, devices }) => {
  const vobj = (path) => { const r = spawnSync('python3', ['-c', VOBJECT, path], { encoding: 'utf8' }); return r.status === 0 ? JSON.parse(r.stdout) : /No module named/.test(r.stderr) ? null : { error: r.stderr.slice(-300) }; };
  const saved = async (page, click) => { const d = page.waitForEvent('download', { timeout: 60000 }); await click(); const dl = await d; const p = join(tmp, `${Date.now()}-${dl.suggestedFilename()}`); await dl.saveAs(p); return [p, dl.suggestedFilename()]; };
  const reads = (page) => page.evaluate(() => +(document.querySelector('[data-reads]')?.getAttribute('data-reads') || 0));
  const read = async (page, name, file = F(name)) => {
    const n = await reads(page);
    await page.locator('input[type=file]').first().setInputFiles(file);
    await page.waitForFunction((k) => +(document.querySelector('[data-reads]')?.getAttribute('data-reads') || 0) > k, n, { timeout: 180000 });
    await page.waitForTimeout(200);
  };
  const rows = (page) => page.locator('.dl-row').evaluateAll((els) => els.map((e) => ({ on: e.querySelector('.dl-tick').checked, kind: e.querySelector('.dl-kind').textContent,
    title: e.querySelector('input[aria-label="Title"]').value, date: e.querySelector('input[type=date]').value, time: e.querySelector('input[type=time]').value,
    remind: e.querySelector('select').value, amount: e.querySelector('.dl-amount')?.textContent ?? null, says: e.querySelector('.muted.small')?.textContent ?? '' })));
  const open = async (opts = {}) => { const p = await newPage({ viewport: { width: 1280, height: 1000 }, ...opts }); await p.clock.setFixedTime(NOW); return p; };

  const page = await open();
  const asked = []; page.on('request', (r) => asked.push(r.url()));
  await page.goto(base + '#/deadlines');
  await page.locator('input[type=file]').first().waitFor({ state: 'attached' });
  await page.waitForTimeout(300);
  const early = asked.filter((u) => /\.wasm(\?|$)|\/vendor\/|\/models\/|\/data\//.test(u));
  ok(!early.length, `nothing heavy fetched as the tab opens — the OCR comes with the first photo ${early.join(' ')}`);

  // ---- a bill: the due date, a disconnection, a discount counted from the bill date
  await read(page, 'notice-bill.jpg');
  let r = await rows(page);
  const want = (k) => [...TRUTH[k].dates.map((d) => d[0]), ...TRUTH[k].relative.map((d) => d[0])].sort();
  ok(JSON.stringify(r.map((x) => x.date).sort()) === JSON.stringify(want('notice-bill')), `notice-bill: every date, the counted one too ${JSON.stringify(r.map((x) => x.date))}`);
  const due = r.find((x) => x.date === '2026-12-15'), billDate = r.find((x) => x.date === '2026-11-28'), disc = r.find((x) => x.date === '2026-12-05');
  ok(due?.on && due.kind === 'Deadline' && /^Due date — Godavari Power Distribution Co\. Ltd\./.test(due.title) && due.amount === '₹2,032.71' && due.remind === '3d', `the due date: ticked, a deadline, its title and amount, 3 days before ${JSON.stringify(due)}`);
  ok(billDate && !billDate.on && billDate.kind === 'The paper’s date', 'the bill\'s own date: not ticked');
  ok(disc?.on && /7 days after 28\/11\/2026/.test(disc.says), `the discount: 7 days after the bill date, said ${disc?.says}`);
  ok(/4 dates found — 3 ticked as reminders/.test(await page.locator('.tool-body').innerText()), 'the line says what was found');
  const [all, allName] = await saved(page, () => page.getByRole('button', { name: 'Add the 3 ticked reminders (.ics)' }).click());
  const v = vobj(all);
  if (v === null) ok(true, 'vobject is not installed — the independent reading of the files skipped');
  else ok(!v.error && allName === 'Godavari Power Distribution Co. Ltd.ics' && v.length === 3 && JSON.stringify(v.map((e) => e.start).sort()) === JSON.stringify(['2026-12-05', '2026-12-15', '2026-12-30'])
    && v.every((e) => e.allday && e.trigger === -(2 * 86400 + 15 * 3600)) && v.some((e) => /Amount: ₹2,032\.71/.test(e.desc)), `vobject reads the three all-day deadlines, each 3 days before at 9 am (${allName}) ${JSON.stringify(v)}`);
  // one row's own file, after its date and time are changed
  const row = page.locator('.dl-row').nth((await rows(page)).findIndex((x) => x.date === '2026-12-15'));
  await row.locator('input[type=date]').fill('2026-12-14');
  await row.locator('input[type=time]').fill('18:30');
  await row.locator('select').selectOption('1d');
  const [one] = await saved(page, () => row.getByRole('button', { name: 'Add to calendar (.ics)' }).click());
  const v1 = vobj(one);
  if (v1) ok(v1.length === 1 && v1[0].start === '2026-12-14T18:30:00' && v1[0].trigger === -86400, `one row's file follows its boxes: 14 December at 18:30, a day before ${JSON.stringify(v1)}`);

  // ---- a renewal letter; a school circular with a meeting at 10:00
  await read(page, 'notice-renewal.jpg');
  r = await rows(page);
  ok(JSON.stringify(r.map((x) => x.date).sort()) === JSON.stringify(want('notice-renewal')) && r.find((x) => x.date === '2027-03-02')?.says.includes('30 days after 31 January 2027'), `notice-renewal: the expiry, the renewal, the letter's date, the grace period counted from the expiry ${JSON.stringify(r.map((x) => [x.date, x.kind]))}`);
  await read(page, 'notice-school.jpg');
  r = await rows(page);
  const meet = r.find((x) => x.date === '2026-12-06');
  ok(JSON.stringify(r.map((x) => x.date).sort()) === JSON.stringify(want('notice-school')) && meet?.time === '10:00' && meet.kind === 'Event' && meet.remind === '1d', `notice-school: every date; the meeting at 10:00, an event, a day before ${JSON.stringify(meet)}`);
  const [sch] = await saved(page, () => page.getByRole('button', { name: /Add the \d ticked reminders/ }).click());
  const vs = vobj(sch);
  if (vs) ok(vs.some((e) => e.start === '2026-12-06T10:00:00' && !e.allday && e.trigger === -86400) && vs.some((e) => e.start === '2026-12-16'), `vobject: the meeting at 10:00 local time, the forms due 16 December ${JSON.stringify(vs.map((e) => e.start))}`);

  // ---- a message's text pasted; month first
  await page.getByText('Or paste the text of a message').click();
  await page.getByRole('textbox', { name: 'Text with dates' }).fill('Reminder: your interview is on 12/06/2026 at 4 pm.\nThe offer letter must be signed by Jan 5.');
  await page.locator('label.switch', { hasText: 'month first' }).click();
  await page.getByRole('button', { name: 'Find the dates' }).click();
  r = await rows(page);
  ok(JSON.stringify(r.map((x) => [x.date, x.time])) === JSON.stringify([['2026-12-06', '16:00'], ['2027-01-05', '']]) && /the year is not written: taken as 2027/.test(r[1].says), `pasted text, month first: 6 December at 16:00; "Jan 5" taken as 2027, said ${JSON.stringify(r.map((x) => [x.date, x.time]))}`);
  await page.locator('label.switch', { hasText: 'month first' }).click();
  r = await rows(page);
  ok(r[0].date === '2026-06-12' && !r[0].on && /already past/.test(r[0].says), 'day first again: 12 June — already past, not ticked');

  // ---- a photo without a date
  await read(page, 'coffee.jpg', IMG('coffee.jpg'));
  ok(/No date was found/.test(await page.locator('.tool-body').innerText()), 'a photo without dates: said, with what to do');
  ok(!page.errors.length, `no page errors ${page.errors.slice(0, 3).join(' | ')}`);

  // ---- leaving mid-reading
  const lv = await open();
  await lv.goto(base + '#/deadlines'); await lv.locator('input[type=file]').first().waitFor({ state: 'attached' });
  await lv.locator('input[type=file]').first().setInputFiles(F('notice-bill.jpg'));
  await lv.waitForTimeout(1500);
  await lv.goto(base + '#/stopwatch'); await lv.waitForTimeout(1500);
  ok(!lv.errors.length, `leaving the tab while it reads: no page errors ${lv.errors.slice(0, 2).join(' | ')}`);

  // ---- WCAG 2.2 A / AA with reminders, light and dark
  const ax = await open({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
  for (const scheme of ['light', 'dark']) {
    await ax.emulateMedia({ colorScheme: scheme });
    await ax.goto('about:blank'); await ax.goto(base + '#/deadlines');
    await ax.locator('input[type=file]').first().waitFor({ state: 'attached' });
    await read(ax, 'notice-school.jpg');
    if (!(await ax.evaluate(() => !!window.axe))) await ax.addScriptTag({ content: AXE });
    const vv = await ax.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`), TAGS);
    ok(!vv.length, `${scheme} theme, with reminders: no WCAG 2.2 A / AA violation ${vv.join(' | ')}`);
  }

  // ---- the phone
  await phoneLayout({ base, page: async (o) => { const p = await newPage(o); await p.clock.setFixedTime(NOW); return p; }, devices, ok }, 'deadlines', { ready: '.drop', buttons: ['Add to calendar (.ics)'], before: async (p) => { await read(p, 'notice-bill.jpg'); } });
};
