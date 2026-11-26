// Where the Watermark tab's mark goes on a page (src/lib/wmlayout.ts, to-do #17): positions from the edges, the diagonal
// fitted inside the margin, tiles covering the page — held to geometry worked out here.
export default async (t, { load }) => {
  const L = await load('/src/lib/wmlayout.ts');
  const text = { w: 7.3, h: 0.77, row: 1, logo: false }; // "CONFIDENTIAL" in Helvetica: its glyphs per point of type
  const base = { size: 5, margin: 3, angle: -30, fill: 1 };
  const pages = [[595, 842], [842, 595], [612, 792], [400, 400], [300, 2000], [2000, 300]];

  // the diagonal: one mark, centred, turned by the page's own diagonal, its four corners inside the margin and touching it
  for (const [W, H] of pages) {
    const [p, ...rest] = L.placeMarks(W, H, { ...base, pos: 'diag' }, text);
    const m = 0.03 * Math.min(W, H), cs = L.cornersOf(p), xs = cs.map((c) => c[0]), ys = cs.map((c) => c[1]);
    const want = -(Math.atan2(H, W) * 180) / Math.PI;
    t.ok(!rest.length && Math.abs(p.rot - want) < 1e-9 && p.cx === W / 2 && p.cy === H / 2, `${W} × ${H}: one mark at the middle, turned ${p.rot.toFixed(2)}° (rising to the right)`);
    const inside = Math.min(...xs) >= m - 1e-6 && Math.max(...xs) <= W - m + 1e-6 && Math.min(...ys) >= m - 1e-6 && Math.max(...ys) <= H - m + 1e-6;
    const touch = Math.min(Math.min(...xs) - m, W - m - Math.max(...xs), Math.min(...ys) - m, H - m - Math.max(...ys));
    t.ok(inside && Math.abs(touch) < 1e-6, `… its corners inside the margin, touching it (${touch.toExponential(1)})`);
    t.near(p.w / p.h, text.w / text.h, 1e-9, '… its shape kept');
  }
  // the fill: the same angle and middle, the size in proportion
  { const a = L.placeMarks(595, 842, { ...base, pos: 'diag' }, text)[0], b = L.placeMarks(595, 842, { ...base, pos: 'diag', fill: 0.5 }, text)[0];
    t.near(b.w / a.w, 0.5, 1e-9, '"Length along the diagonal" 50 %: half the size'); t.eq([b.cx, b.cy, b.rot], [a.cx, a.cy, a.rot], '… the same middle and angle'); }
  // a logo 5 : 1 on the diagonal of a tall page: the corners of the box touch the margin on the side that limits it
  { const p = L.placeMarks(500, 900, { ...base, pos: 'diag' }, { w: 1, h: 0.2, row: 0.2, logo: true })[0];
    const th = Math.atan2(900, 500), m = 15, k = Math.min((500 - 2 * m) / (Math.cos(th) + 0.2 * Math.sin(th)), (900 - 2 * m) / (Math.sin(th) + 0.2 * Math.cos(th)));
    t.near(p.w, k, 1e-9, `a logo 5 : 1 on a tall page: ${p.w.toFixed(1)} pt long, as the margin allows`); }

  // the nine positions: the box from the edges by the margin; the size a share of the shorter side
  const W = 595, H = 842, m = 0.03 * 595, k = 0.05 * 595;
  const want = { tl: [m, m], tc: [(W - text.w * k) / 2, m], tr: [W - m - text.w * k, m], ml: [m, (H - text.h * k) / 2], c: [(W - text.w * k) / 2, (H - text.h * k) / 2], mr: [W - m - text.w * k, (H - text.h * k) / 2], bl: [m, H - m - text.h * k], bc: [(W - text.w * k) / 2, H - m - text.h * k], br: [W - m - text.w * k, H - m - text.h * k] };
  for (const [pos, [x, y]] of Object.entries(want)) {
    const [p] = L.placeMarks(W, H, { ...base, pos }, text);
    t.ok(Math.abs(p.cx - p.w / 2 - x) < 1e-9 && Math.abs(p.cy - p.h / 2 - y) < 1e-9 && p.rot === 0 && Math.abs(p.k - k) < 1e-9, `${pos}: its box at ${x.toFixed(1)}, ${y.toFixed(1)} (type ${k.toFixed(2)} pt)`);
  }
  { const [p] = L.placeMarks(W, H, { ...base, pos: 'br' }, { w: 1, h: 0.5, row: 0.5, logo: true });
    t.near(p.w, 0.2 * 595, 1e-9, 'a logo: four times the size as its width (as on a photo)'); }

  // tiles: every mark turned by the tile angle; together they cover the page (no point of it far from a mark), and no
  // mark lies wholly off it
  for (const [W, H] of pages) {
    const ps = L.placeMarks(W, H, { ...base, pos: 'tile' }, text), S = Math.min(W, H);
    t.ok(ps.length > 3 && ps.every((p) => p.rot === -30), `${W} × ${H}: ${ps.length} tiles, turned −30°`);
    const off = ps.filter((p) => { const cs = L.cornersOf(p); return Math.max(...cs.map((c) => c[0])) < 0 || Math.min(...cs.map((c) => c[0])) > W || Math.max(...cs.map((c) => c[1])) < 0 || Math.min(...cs.map((c) => c[1])) > H; });
    t.eq(off.length, 0, '… none wholly off the page');
    let far = 0;
    for (let y = 0; y <= H; y += H / 20) for (let x = 0; x <= W; x += W / 20) if (Math.min(...ps.map((p) => Math.hypot(p.cx - x, p.cy - y))) > Math.max(text.w * 0.05 * S, S * 0.3)) far++;
    t.eq(far, 0, '… every point of the page near a mark');
  }
};
