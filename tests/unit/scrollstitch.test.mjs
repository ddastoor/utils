// Scrolling screenshots (to-do #28): imgproc's p_scroll_match and the joining around it (src/lib/scrollstitch.ts), on
// synthetic pages whose every row is known — lines of "text" of random lengths, a smooth gradient, noise, blank
// stretches, coloured boxes — seen through a view with a sticky header and a footer. The joined picture must be, pixel
// for pixel, the header, the page and the footer drawn whole; where it cannot be (a jump with nothing in common, a
// sideways move, a blank stretch longer than the view), the picture so far is kept exact and the step says why.
export default async (t, { load, wasm }) => {
  const { bindImgproc } = await load('/src/wasm/imgproc.ts');
  const { stitcher, MEAN_OK } = await load('/src/lib/scrollstitch.ts');
  const ip = bindImgproc(await wasm('imgproc'));

  let seed = 1;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 8) / 16777216;
  /** a page w × n rows: { data, width, height } */
  function page(w, n, plan) {
    const d = new Uint8ClampedArray(w * n * 4).fill(255);
    const set = (x, y, r, g, b) => { const i = (y * w + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; };
    for (const [kind, y0, y1] of plan) {
      if (kind === 'text') for (let y = y0; y + 12 <= y1; y += 18) { // lines of glyph-like blocks, every line its own
        let x = 8 + Math.floor(rnd() * 12);
        const end = w - 8 - Math.floor(rnd() * w * 0.4);
        while (x < end) { const gw = 3 + Math.floor(rnd() * 7), gh = 7 + Math.floor(rnd() * 5), c = Math.floor(rnd() * 60);
          for (let yy = y + 12 - gh; yy < y + 12; yy++) for (let xx = x; xx < Math.min(x + gw, end); xx++) set(xx, yy, c, c, c + 20);
          x += gw + 1 + (rnd() < 0.2 ? 5 : 0); }
      }
      if (kind === 'gradient') for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) { const v = 250 - Math.floor(((y - y0) / (y1 - y0)) * 90); set(x, y, v, v, 255); }
      if (kind === 'noise') for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) set(x, y, Math.floor(rnd() * 256), Math.floor(rnd() * 256), Math.floor(rnd() * 256));
      if (kind === 'boxes') for (let y = y0; y < y1; y += 40) { const c = [Math.floor(rnd() * 255), Math.floor(rnd() * 255), Math.floor(rnd() * 255)], x0 = Math.floor(rnd() * (w - 60)), bw = 20 + Math.floor(rnd() * 40);
        for (let yy = y + 5; yy < Math.min(y + 35, y1); yy++) for (let xx = x0; xx < x0 + bw; xx++) set(xx, yy, ...c); }
    }
    return { data: d, width: w, height: n };
  }
  const band = (w, n, [r, g, b], marks) => { // a header / footer: a colour with a few marks
    const d = new Uint8ClampedArray(w * n * 4);
    for (let i = 0; i < w * n; i++) { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
    for (const [x0, x1] of marks) for (let y = 4; y < n - 4; y++) for (let x = x0; x < x1; x++) d.set([255, 255, 255, 255], (y * w + x) * 4);
    return { data: d, width: w, height: n };
  };
  const rows = (img, y0, y1) => img.data.subarray(y0 * img.width * 4, y1 * img.width * 4);
  /** the view at scroll position S: header, page rows S … S + region, footer */
  const view = (pg, S, head, foot, H) => {
    const w = pg.width, region = H - (head?.height ?? 0) - (foot?.height ?? 0), out = new Uint8ClampedArray(w * H * 4);
    let at = 0;
    if (head) { out.set(head.data, 0); at = head.height; }
    out.set(rows(pg, S, S + region), at * w * 4);
    if (foot) out.set(foot.data, (H - foot.height) * w * 4);
    return out;
  };
  const concat = (...parts) => { const n = parts.reduce((a, p) => a + p.length, 0), o = new Uint8ClampedArray(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };
  const whole = (parts) => concat(...parts.map((p) => p.data));
  const firstDiff = (a, b, w) => { const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) return `row ${Math.floor(i / 4 / w)}`; return a.length === b.length ? 'none' : `lengths ${a.length / 4 / w} and ${b.length / 4 / w} rows`; };
  /** runs a capture through the scroll positions; returns the steps and the picture */
  const run = (pg, Ss, o = {}) => {
    const W = pg.width, H = o.H ?? 240, st = stitcher(ip, o.opts), steps = [];
    let last = Ss[0];
    for (const S of Ss) { steps.push(st.add(o.frame ? o.frame(S) : view(pg, S, o.head, o.foot, H), W, H, o.hint ? S - last : undefined, !!o.hint)); if (['added', 'back', 'first'].includes(steps.at(-1).kind)) last = S; }
    return { steps, parts: st.finish(), kinds: steps.map((s) => s.kind) };
  };
  const W = 320, P = 3000;
  const plan = [['text', 0, 400], ['gradient', 400, 700], ['noise', 700, 900], ['text', 1020, 1500], ['boxes', 1500, 1900], ['text', 1900, 3000]];
  seed = 7; const pg = page(W, P, plan);
  const head = band(W, 30, [40, 40, 90], [[10, 60], [250, 300]]), foot = band(W, 20, [210, 210, 210], [[140, 180]]);
  const ends = (n, steps) => { const S = [0]; let i = 0; while (S.at(-1) < n) S.push(Math.min(n, S.at(-1) + steps[i++ % steps.length])); return S; };

  // steady scrolling with a sticky header and a footer: header + the whole page + footer, exactly
  const region = 240 - 30 - 20, maxS = P - region;
  { const r = run(pg, ends(maxS, [7, 33, 64, 120, 150, 17, 90, 1, 140]), { head, foot });
    const want = concat(head.data, pg.data, foot.data), got = whole(r.parts);
    t.eq(r.parts.length, 1, 'one part');
    // a one-row move inside the smooth gradient differs from the view before by less than a capture's rounding: seen as
    // unmoved (the next view is placed against the one before it, so nothing is lost — the picture below is exact)
    const S0 = ends(maxS, [7, 33, 64, 120, 150, 17, 90, 1, 140]), odd = r.kinds.map((k, i) => [k, S0[i] - S0[i - 1]]).slice(1).filter(([k, d]) => k !== 'added' && !(k === 'still' && d === 1));
    t.eq(odd.length, 0, `every view placed, but a one-row move in a smooth stretch (${odd.map((x) => x.join(' ')).join(', ') || 'none other'})`);
    t.eq(firstDiff(got, want, W), 'none', `the header once, the whole ${P}-row page, the footer once — pixel for pixel (${r.parts[0]?.height} rows)`);
    t.eq(r.steps.at(-1).height, 30 + P + 20, 'the height said at the last view is the picture\'s'); }

  // a plain page (no header, no footer)
  { const r = run(pg, ends(P - 200, [55, 120, 80, 3, 160]), { H: 200 });
    t.eq(firstDiff(whole(r.parts), pg.data, W), 'none', 'a page without header or footer: the page, pixel for pixel'); }

  // scrolled back up and down again on the way; the first move upwards moves the picture's start
  { const S = [0, 100, 250, 180, 120, 260, 400, 550, 540, 680, 790, ...ends(maxS - 790, [60, 100]).map((x) => x + 790).slice(1)];
    const r = run(pg, S, { head, foot });
    t.ok(r.kinds.filter((k) => k === 'back').length === 3, `moves back up are taken as such (${r.kinds.filter((k) => k === 'back').length} of 3)`);
    t.eq(firstDiff(whole(r.parts), concat(head.data, pg.data, foot.data), W), 'none', 'scrolled back up and down again: still the page, exactly');
    const r2 = run(pg, [500, 380, 300, ...ends(maxS - 300, [60]).map((x) => x + 300).slice(1)], { head, foot });
    t.eq(firstDiff(whole(r2.parts), concat(head.data, rows(pg, 300, P), foot.data), W), 'none', 'started in the middle and scrolled up first: the picture starts where the scrolling up stopped'); }

  // a jump with nothing in common: said, the picture so far kept; going on from where it fits again
  // (steps of 60 after it: the page's 120 blank rows at 900 – 1020 are crossed only by steps that keep detail in common)
  { const r = run(pg, [0, 100, 400, 180, 260, ...ends(maxS - 260, [60]).map((x) => x + 260).slice(1)], { head, foot });
    t.eq(r.kinds.slice(0, 5).join(' '), 'first added nofit added added', `a jump of 300 rows (more than the view's ${region}) does not fit; back within reach it goes on (${r.kinds.slice(0, 5).join(' ')})`);
    t.eq(firstDiff(whole(r.parts), concat(head.data, pg.data, foot.data), W), 'none', '… and the picture is the page, exactly');
    const st = stitcher(ip); st.add(view(pg, 0, head, foot, 240), W, 240); st.add(view(pg, 100, head, foot, 240), W, 240);
    t.eq(st.add(view(pg, 400, head, foot, 240), W, 240).kind, 'nofit', 'a jump: does not fit');
    const kept = st.finish();
    t.eq(firstDiff(whole(kept), concat(head.data, rows(pg, 0, 100 + region), foot.data), W), 'none', 'stopped after a jump: the picture up to the last view that fitted, exact'); }

  // sideways: the page moved left by 5 pixels as well — nothing fits
  { const st = stitcher(ip);
    st.add(view(pg, 0, head, foot, 240), W, 240);
    const v = view(pg, 60, head, foot, 240), s = new Uint8ClampedArray(v.length);
    for (let y = 0; y < 240; y++) { s.set(v.subarray(y * W * 4, (y + 1) * W * 4), y * W * 4); if (y >= 30 && y < 220) s.set(v.subarray(y * W * 4 + 20, (y + 1) * W * 4), y * W * 4); }
    t.eq(st.add(s, W, 240).kind, 'nofit', 'scrolled sideways: does not fit');
    t.eq(st.add(view(pg, 0, head, foot, 240), W, 240).kind, 'still', 'the same view again: nothing moved');
    t.eq(st.add(view(pg, 0, head, foot, 300), W, 300).kind, 'size', 'a view of another size (the window resized): said'); }

  // a blank stretch longer than the view: without knowing how far the page went the chain breaks (said: blank, then no
  // fit) and the picture so far stays exact; with the scrolling known (the wheel forwarded to a shared tab) it goes through
  { seed = 11; const pb = page(W, 2000, [['text', 0, 500], ['text', 900, 2000]]);
    const S = ends(2000 - region, [60]);
    const r = run(pb, S, { head, foot });
    const inside = r.kinds.findIndex((k) => k === 'blank' || k === 'still'), after = r.kinds.indexOf('nofit');
    t.ok(inside > 0 && after > inside && r.kinds.slice(inside, after).every((k) => k === 'blank' || k === 'still'), `a 400-row blank stretch, no hint: the views inside it are said to be blank (or unmoved: all their rows alike), the first one after it fits nothing (${[...new Set(r.kinds)].join(', ')})`);
    const lastOk = S[r.kinds.lastIndexOf('added')];
    t.eq(firstDiff(whole(r.parts), concat(head.data, rows(pb, 0, lastOk + region), foot.data), W), 'none', `… and the picture so far is exact (up to page row ${lastOk + region})`);
    const r2 = run(pb, S, { head, foot, hint: true });
    t.eq(firstDiff(whole(r2.parts), concat(head.data, pb.data, foot.data), W), 'none', `with the shift known from the scrolling: through the blank stretch, exactly (${r2.kinds.filter((k) => k === 'added').length} views)`); }

  // a capture that is not exact (every pixel off by up to 2, as a video frame's rounding): still placed, nothing shifted
  { const noisy = (S) => { const v = view(pg, S, head, foot, 240); for (let i = 0; i < v.length; i++) if ((i & 3) !== 3) v[i] = Math.max(0, Math.min(255, v[i] + Math.floor(rnd() * 5) - 2)); return v; };
    const S = ends(maxS, [45, 60]); // steps that keep detail in common across the page's 120 blank rows (190 − 120 = 70)
    const r = run(pg, S, { head, foot, frame: noisy });
    const got = whole(r.parts), want = concat(head.data, pg.data, foot.data);
    let off = 0; for (let i = 0; i < Math.min(got.length, want.length); i++) off = Math.max(off, Math.abs(got[i] - want[i]));
    t.ok(r.kinds.slice(1).every((k) => k === 'added') && got.length === want.length && off <= 2, `a capture off by up to 2 in every pixel (mean within ${MEAN_OK}): every view placed, the picture the page within 2 (${off})`); }

  // repeated rows (a list of identical lines): the shift nearest the one expected; a hint decides
  { const rep = page(W, 1200, []); const line = page(W, 24, [['text', 0, 24]]);
    for (let y = 0; y + 24 <= 1200; y += 24) rep.data.set(line.data, y * W * 4);
    const st = stitcher(ip); st.add(view(rep, 0, head, foot, 240), W, 240);
    const s1 = st.add(view(rep, 50, head, foot, 240), W, 240, 50); // a hint, not trusted: it only chooses among shifts that fit
    t.ok(s1.kind === 'added' && s1.d === 50 && s1.fit.status === 3, `identical lines every 24 rows: with the shift expected (50) it is the one taken (${s1.kind} ${s1.d}, status ${s1.fit?.status})`); st.drop(); }

  // parts: a page taller than one part comes out in parts that together are the page
  { seed = 3; const tall = page(64, 9000, [['noise', 0, 9000]]);
    const r = run(tall, ends(9000 - 200, [150, 170]), { H: 200, opts: { partH: 4000 } });
    t.eq(r.parts.map((p) => p.height).join(' + '), '4000 + 4000 + 1000', `a 9,000-row page in parts of at most 4,000 rows (${r.parts.map((p) => p.height).join(' + ')})`);
    t.eq(firstDiff(whole(r.parts), tall.data, 64), 'none', '… which together are the page, exactly');
    const r2 = run(tall, ends(9000 - 200, [150]), { H: 200, opts: { maxPx: 64 * 3000 } });
    const at = r2.kinds.indexOf('full');
    t.ok(at > 0 && r2.kinds.slice(at).every((k) => k === 'full') && whole(r2.parts).length / 256 <= 3000 + 200 && firstDiff(whole(r2.parts), tall.data.subarray(0, whole(r2.parts).length), 64) === 'none', `the most pixels a capture keeps: "full" said, the picture so far exact (${whole(r2.parts).length / 256} rows)`); }

  // nothing but one view: that view
  { const st = stitcher(ip); st.add(view(pg, 0, head, foot, 240), W, 240); st.add(view(pg, 0, head, foot, 240), W, 240);
    const p = st.finish(); t.eq([p.length, p[0].height, firstDiff(p[0].data, view(pg, 0, head, foot, 240), W)], [1, 240, 'none'], 'no scrolling at all: the one view'); }
};
