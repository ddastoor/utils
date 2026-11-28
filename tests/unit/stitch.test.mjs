// The Long Screenshot Stitcher's engine (wasm/imgproc/stitch.c) and its order, joins and picture (src/lib/stitch.ts), held
// to what the test screenshots are known to show: tests/fixtures/stitch/truth.json (scripts/make-stitch-shots.py) gives,
// for every screenshot, the page row its row y shows (y + offset), its part that scrolls and what floats over it. A join
// is right when the shift is the offsets' difference; the picture is right when every page row between the first
// screenshot's top and the last one's bottom comes once, in order, and nothing that floats is kept where another
// screenshot shows the page clean.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readPng } from '../lib/png.mjs';

const dir = fileURLToPath(new URL('../fixtures/stitch/', import.meta.url));

export default async (t, { load, wasm }) => {
  const { bindImgproc } = await load('src/wasm/imgproc.ts');
  const { Stitch, linkOf, TOL, LINE_ROWS } = await load('src/lib/stitch.ts');
  const ip = bindImgproc(await wasm('imgproc'));
  const mupdf = await import('mupdf');
  const decode = (f) => {
    const buf = readFileSync(dir + f);
    if (f.endsWith('.png')) { const p = readPng(buf); return { data: new Uint8ClampedArray(p.data), width: p.width, height: p.height }; }
    const pm = new mupdf.Image(buf).toPixmap(), w = pm.getWidth(), h = pm.getHeight(), n = pm.getNumberOfComponents(), px = pm.getPixels();
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, j = 0; j < data.length; i += n, j += 4) { data[j] = px[i]; data[j + 1] = px[n >= 3 ? i + 1 : i]; data[j + 2] = px[n >= 3 ? i + 2 : i]; data[j + 3] = 255; }
    return { data, width: w, height: h };
  };
  const truth = JSON.parse(readFileSync(dir + 'truth.json', 'utf8'));
  const cache = new Map();
  const pic = (f) => { if (!cache.has(f)) cache.set(f, decode(f)); return cache.get(f); };

  /** a set stitched: the screenshots given in `files` order (their names' order when not said) */
  const stitchSet = (set, files) => {
    const S = new Stitch(ip), shots = set.shots;
    const list = files ?? [...shots.map((s) => s.file), ...(set.alone ?? []), ...Object.keys(set.same ?? {})].sort();
    const ids = new Map();
    list.forEach((f, i) => { ids.set(f, i); S.add(i, f, pic(f)); });
    const name = new Map([...ids].map(([f, i]) => [i, f]));
    return { S, ids, name };
  };
  const shotOf = (set, f) => set.shots.find((s) => s.file === f);
  /** the plan's pieces checked against the offsets: within a group each piece starts at the page row where the one above
   *  ended (±tol: a set made smaller moves by fractions of a row) */
  const continuity = (set, plan, name, tol = 0) => {
    const bad = [];
    let prev = null;
    for (const p of plan.pieces) {
      if ('line' in p) { prev = null; continue; }
      const s = shotOf(set, name.get(p.id));
      if (!s) { prev = null; continue; }
      const top = p.y0 + s.offset, bottom = p.y1 + s.offset;
      if (prev && Math.abs(top - prev) > tol + 1e-9) bad.push(`${s.file} starts at page row ${top.toFixed(2)}, the piece above ended at ${prev.toFixed(2)}`);
      if (p.y1 <= p.y0) bad.push(`${s.file}: an empty piece`);
      prev = bottom;
    }
    return bad;
  };
  /** what floats (a date chip, a "scroll down" button — not a scrollbar's thin thumb) kept in the picture where another
   *  screenshot of its group shows those page rows clean */
  const floatsKept = (set, plan, name) => {
    const bad = [], pieces = plan.pieces.filter((p) => !('line' in p) && shotOf(set, name.get(p.id)));
    for (const p of pieces) {
      const s = shotOf(set, name.get(p.id));
      for (const [x0, fy0, x1, fy1] of s.float) {
        if (x1 - x0 < 12) continue; // a scrollbar's thumb
        const y0 = Math.max(p.y0, fy0), y1 = Math.min(p.y1, fy1);
        if (y1 <= y0) continue;
        const py0 = y0 + s.offset, py1 = y1 + s.offset;
        const clean = pieces.some((q) => {
          if (q === p) return false;
          const o = shotOf(set, name.get(q.id));
          if (py0 - o.offset < o.top || py1 - o.offset > o.bottom) return false;
          return !o.float.some(([a0, b0, a1, b1]) => a1 - a0 >= 12 && b0 < py1 - o.offset && b1 > py0 - o.offset);
        });
        if (clean) bad.push(`${s.file} keeps what floats at its rows ${y0}–${y1}`);
      }
    }
    return bad;
  };

  // ---------------------------------------------------------------- every pair of every set: the shift, or nothing
  let right = 0, wrong = [], missed = [], spurious = [];
  for (const [setName, set] of Object.entries(truth)) {
    if (setName === 'mix' || setName === 'shuffled') continue; // their screenshots are the chat's (below)
    const { S, ids } = stitchSet(set, set.shots.map((s) => s.file));
    for (const a of set.shots) for (const b of set.shots) {
      if (a === b || ids.get(a.file) > ids.get(b.file)) continue;
      const want = b.offset - a.offset, R = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      const l = S.link(ids.get(a.file), ids.get(b.file));
      const share = Math.abs(want) < R;
      if (!share) { if (l) spurious.push(`${a.file}–${b.file}`); continue; }
      if (!l) { missed.push(`${a.file}–${b.file}`); continue; }
      const got = l.a === ids.get(a.file) ? l.shift : -l.shift;
      if (Math.abs(got - want) <= 0.5) right++; else wrong.push(`${a.file}–${b.file}: ${got} for ${want}`);
    }
    S.free();
  }
  t.ok(!wrong.length && right >= 19, `every pair that shares rows is placed by the right shift (${right} pairs, to half a row) ${wrong.join(' | ')}`);
  t.ok(!missed.length, `no pair that shares rows is missed ${missed.join(' | ')}`);
  t.ok(!spurious.length, `no pair that shares nothing is joined ${spurious.join(' | ')}`);

  // ---------------------------------------------------------------- each set: the order, the joins, the picture
  for (const setName of ['chat', 'chat-dark', 'chat-sent', 'web', 'web-jpeg', 'small', 'large', 'repeat']) {
    const set = truth[setName], t0 = performance.now();
    const { S, name } = stitchSet(set);
    const ms = performance.now() - t0;
    const arr = S.arrange(), order = arr.order.map((i) => name.get(i));
    t.ok(JSON.stringify(order) === JSON.stringify(set.order), `${setName}: the order top to bottom (${order.join(', ')})`);
    const st = arr.order.map((i) => arr.items.get(i).status);
    t.ok(st[0] === 'top' && st.slice(1).every((x) => x === 'joined'), `${setName}: every screenshot joined under the one above (${st.join(', ')})`);
    const plan = S.plan(arr), tol = setName === 'chat-sent' ? 1 : 0; // a set made smaller: whole rows of a shift by fractions
    const gaps = continuity(set, plan, name, tol);
    t.ok(!gaps.length, `${setName}: every page row once, in order, from the first screenshot's top to the last one's bottom ${gaps.join(' | ')}`);
    const fl = floatsKept(set, plan, name);
    t.ok(!fl.length, `${setName}: nothing that floats (the date chip, the scroll-down button) kept where another screenshot shows the page clean ${fl.join(' | ')}`);
    const first = shotOf(set, set.order[0]), last = shotOf(set, set.order.at(-1));
    const want = Math.round((last.offset + set.height) - first.offset);
    t.ok(Math.abs(plan.height - want) <= (tol ? 2 : 0), `${setName}: the picture is ${plan.height} rows — from the first screenshot's top to the last one's bottom (${want})`);
    const img = S.compose(plan);
    // the picture's rows are the screenshots' own rows, piece by piece
    let at = 0, copied = true;
    for (const p of plan.pieces) {
      const src = S.shots.get(p.id).img, W = src.width;
      for (const y of [p.y0, Math.floor((p.y0 + p.y1) / 2), p.y1 - 1]) {
        const a = img.data.subarray((at + y - p.y0) * W * 4, (at + y - p.y0 + 1) * W * 4), b = src.data.subarray(y * W * 4, (y + 1) * W * 4);
        for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) { copied = false; break; }
      }
      at += p.y1 - p.y0;
    }
    t.ok(copied && img.height === plan.height && img.width === set.width, `${setName}: the picture is the screenshots' rows as they are (${img.width} × ${img.height})`);
    t.ok(ms < 4000, `${setName}: ${set.shots.length} screenshots read and placed in ${ms.toFixed(0)} ms`);
    if (setName === 'repeat') {
      const items = arr.order.slice(1).map((i) => arr.items.get(i));
      t.ok(items.every((x) => x.sure), `repeat: the joins are sure in spite of the run of "Ok" (${items.map((x) => x.sure).join(', ')})`);
    }
    if (setName === 'chat') {
      // the bars: the status bar and the contact's line at the top (160 rows), the typing box and the buttons at the bottom (168)
      const b = S.bars(arr.order[0]);
      t.ok(b.top >= 160 && b.top <= 200 && b.bottom >= 168 && b.bottom <= 200, `chat: the bars found — ${b.top} rows at the top, ${b.bottom} at the bottom (160 and 168 drawn)`);
      const nb = S.plan(arr, { top: true, bottom: true });
      t.ok(nb.height === plan.height - b.top - S.bars(arr.order.at(-1)).bottom, `chat: without the bars, the picture is ${nb.height} rows`);
      const im2 = S.compose(nb), src = S.shots.get(arr.order[0]).img, W = src.width;
      const row0 = im2.data.subarray(0, W * 4), want0 = src.data.subarray(b.top * W * 4, (b.top + 1) * W * 4);
      t.ok(row0.every((v, k) => v === want0[k]), 'chat: without the bars, the picture begins with the first screenshot\'s row below them');
      // a preview a third the size: the same pieces, each screenshot made smaller once
      const small = new Map([...S.shots.values()].map((s) => [s.id, ip.resizeArea(s.img, Math.round(s.img.width / 3), Math.round(s.img.height / 3))]));
      const pv = S.compose(plan, 1 / 3, small);
      t.ok(pv.width === Math.round(set.width / 3) && Math.abs(pv.height - plan.height / 3) <= plan.pieces.length, `chat: a preview a third the size (${pv.width} × ${pv.height})`);
      // the joins marked where pieces meet
      t.ok(plan.joins.length === set.shots.length - 1 && plan.joins.every((y, i) => i === 0 || y > plan.joins[i - 1]), `chat: the joins at ${plan.joins.join(', ')}`);
      // the order as the reader puts it: turned round, nothing joins (each is above the one it shares rows with)
      const rev = S.arrange([...arr.order].reverse());
      t.ok(rev.order.slice(1).every((i) => rev.items.get(i).status === 'line') && rev.manual, 'chat: turned round by hand — each under a line (the rows they share are the other way)');
      const rp = S.plan(rev);
      t.ok(rp.pieces.filter((p) => 'line' in p).length === set.shots.length - 1 && rp.pieces.filter((p) => 'line' in p).every((p) => p.line === LINE_ROWS), 'chat: … and a line between each two');
      // a screenshot taken out of the middle: two groups, a line between them
      S.remove(arr.order[2]);
      const a2 = S.arrange(), s2 = a2.order.map((i) => a2.items.get(i).status);
      t.ok(JSON.stringify(s2) === JSON.stringify(['top', 'joined', 'line', 'joined']), `chat: the middle one taken out — two pieces of the chat, a line between them (${s2.join(', ')})`);
    }
    S.free();
  }

  // ---------------------------------------------------------------- the chat's, given out of order with a duplicate and a stranger
  {
    const set = truth.shuffled, { S, name } = stitchSet(set);
    const arr = S.arrange(), order = arr.order.map((i) => name.get(i));
    t.ok(JSON.stringify(order) === JSON.stringify([...set.order, ...set.alone]), `shuffled: put in order by themselves, the page of something else after them (${order.join(', ')})`);
    const dup = [...arr.items.values()].find((x) => x.status === 'same');
    t.ok(dup && name.get(dup.id) === 'IMG_2042.png' && name.get(dup.sameAs) === 'IMG_2040.png', 'shuffled: the same screenshot twice — the second left out as the same as the first');
    const lone = arr.items.get([...name].find(([, f]) => f === 'IMG_2039.png')[0]);
    t.ok(lone.status === 'line', 'shuffled: the screenshot of something else — under a line');
    const plan = S.plan(arr);
    t.ok(!continuity(set, plan, name).length && plan.pieces.filter((p) => 'line' in p).length === 1, 'shuffled: the chat whole, then a line, then the page');
    S.free();
  }
  // ---------------------------------------------------------------- a forwarded copy among full-size ones
  {
    const set = truth.mix, { S, name } = stitchSet(set, set.shots.map((s) => s.file));
    const third = [...S.shots.values()].find((s) => s.name === 'mix-3.jpg');
    t.ok(third.from === 480 && third.img.width === 720, 'mix: the forwarded screenshot (480 px wide) made 720 px wide like the others');
    const arr = S.arrange(), st = arr.order.map((i) => arr.items.get(i).status);
    t.ok(JSON.stringify(arr.order.map((i) => name.get(i))) === JSON.stringify(set.order) && st.slice(1).every((x) => x === 'joined'), `mix: joined in order (${st.join(', ')})`);
    const plan = S.plan(arr), gaps = continuity(set, plan, name, 1);
    t.ok(!gaps.length, `mix: every page row once, in order ${gaps.join(' | ')}`);
    const id = (f) => [...name].find(([, n]) => n === f)[0];
    const l23 = S.link(id('mix-2.png'), id('mix-3.jpg')), l34 = S.link(id('mix-3.jpg'), id('mix-4.png'));
    t.ok(Math.abs(l23.shift - 865) <= 1 && Math.abs(l34.shift - 954) <= 1, `mix: the forwarded copy placed at the size it was sent in, the shifts scaled up (${l23.shift}, ${l34.shift}; 865 and 954 drawn)`);
    t.ok(!S.link(id('mix-1.png'), id('mix-3.jpg')), 'mix: the forwarded copy and a screenshot it shares nothing with are not joined');
    S.free();
  }
  // ---------------------------------------------------------------- one screenshot; the same one twice; linkOf's rules
  {
    const S = new Stitch(ip);
    S.add(1, 'chat-1.png', pic('chat-1.png'));
    const a = S.arrange(), p = S.plan(a);
    t.ok(a.order.length === 1 && a.items.get(1).status === 'top' && p.height === 1600 && S.bars(1).top === 0, 'one screenshot: the picture is it, whole (no bars to tell without another)');
    S.add(2, 'chat-1 copy.png', pic('chat-1.png'));
    const b = S.arrange();
    t.ok(b.order.length === 1 && b.items.get(2).status === 'same' && b.items.get(2).sameAs === 1, 'the same screenshot twice: the second is the same as the first');
    S.free();
    const base = { found: true, d: 100, f: 0, shift: 100, score: 40, other: 5, y0: 10, y1: 90, matched: 40, missed: 0, same: 0.1, votes: 50, otherShift: 300, allMatched: 40, allMissed: 10 };
    t.ok(linkOf(1, 2, base)?.sure && linkOf(1, 2, { ...base, score: 11 }) === null && linkOf(1, 2, { ...base, allMissed: 200 }) === null && linkOf(1, 2, { ...base, other: 40 }) === null,
      'a join needs a score of 12, a fifth of its rows matching and a score above any other shift\'s');
    const up = linkOf(1, 2, { ...base, shift: -100, d: -100, y0: 300, y1: 380 });
    t.ok(up.a === 2 && up.b === 1 && up.shift === 100 && up.y0 === 200 && up.y1 === 280 && linkOf(1, 2, { ...base, other: 30 }).sure === false,
      'a shift upwards turned round (the upper one first, the stretch in the lower one\'s rows); a close second makes it unsure');
    t.ok(TOL === 64, 'a band may differ by 4 levels');
  }
};
