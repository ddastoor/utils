// The geometry of the Screenshot tab's "An area" (src/lib/areageom.ts, to-do #24): where the frozen frame stands on the
// screen, the rectangle a drag makes, moving and resizing it, what the pointer grabs, and the pixels taken — held to a
// pixel-by-pixel reference written here.
export default async (t, { load }) => {
  const G = await load('/src/lib/areageom.ts');

  // where the frame stands: 1:1 on whole device pixels when it fits (a 1920 × 1080 screen in a full-screen 1920 × 1080
  // window: exactly over the screen), fitted and centred when it does not
  t.eq(G.layoutOf(1920, 1080, 1920, 1080), { s: 1, ox: 0, oy: 0 }, 'the screen in a full-screen window of its size: at its own pixels, exactly over it');
  t.eq(G.layoutOf(641, 361, 1280, 900), { s: 1, ox: 319, oy: 269 }, 'a window smaller than the screen: 1:1, centred on whole pixels');
  const big = G.layoutOf(3840, 2160, 1280, 900);
  t.near(big.s, 1 / 3, 1e-12, 'a 4K screen in a 1280 × 900 window: fitted by its width (⅓)');
  t.near(big.oy, (900 - 720) / 2, 1e-9, '… and centred in height');
  const tall = G.layoutOf(1000, 4000, 1280, 900);
  t.near(tall.s, 900 / 4000, 1e-12, 'a tall frame: fitted by its height');
  t.near(tall.ox, (1280 - 1000 * 900 / 4000) / 2, 1e-9, '… centred in width');

  // every pixel edge of the frame, drawn on the canvas, is found again from that point — at 1:1 and at a fitted scale
  for (const [W, H, cw, ch] of [[640, 360, 1280, 900], [3840, 2160, 1280, 900], [2560, 1600, 1707, 1067], [1366, 768, 1366, 768]]) {
    const L = G.layoutOf(W, H, cw, ch);
    let bad = 0;
    for (let x = 0; x <= W; x++) if (G.toFrame(L, L.ox + x * L.s, L.oy).x !== x) bad++;
    for (let y = 0; y <= H; y++) if (G.toFrame(L, L.ox, L.oy + y * L.s).y !== y) bad++;
    t.eq(bad, 0, `${W} × ${H} on ${cw} × ${ch} (scale ${L.s.toFixed(3)}): all ${W + H + 2} pixel edges found again from where they are drawn`);
  }

  // the rectangle of a drag: either direction, held inside the frame
  t.eq(G.rectFrom(100, 50, 300, 150, 640, 360), { x: 100, y: 50, w: 200, h: 100 }, 'a drag from the top left to the bottom right');
  t.eq(G.rectFrom(300, 150, 100, 50, 640, 360), { x: 100, y: 50, w: 200, h: 100 }, '… from the bottom right to the top left: the same rectangle');
  t.eq(G.rectFrom(300, 50, 100, 150, 640, 360), { x: 100, y: 50, w: 200, h: 100 }, '… from the top right to the bottom left');
  t.eq(G.rectFrom(-40, -9, 700, 400, 640, 360), { x: 0, y: 0, w: 640, h: 360 }, 'a drag past the frame\'s edges stops at them');
  t.eq(G.rectFrom(10, 10, 10, 30, 640, 360).w, 0, 'a drag straight down has no width (the tab makes no area of it)');

  // moving: the size kept, stopped at the edges
  const r = { x: 100, y: 50, w: 200, h: 100 };
  t.eq(G.moved(r, 25, -10, 640, 360), { x: 125, y: 40, w: 200, h: 100 }, 'moved by (25, −10)');
  t.eq(G.moved(r, 1000, 1000, 640, 360), { x: 440, y: 260, w: 200, h: 100 }, 'moved far right and down: stops at the frame\'s corner, its size kept');
  t.eq(G.moved(r, -1000, -1000, 640, 360), { x: 0, y: 0, w: 200, h: 100 }, 'moved far left and up: stops at the frame\'s corner');

  // resizing by an edge or a corner; the opposite edges stay; past the opposite edge it turns over
  t.eq(G.resized(r, 'rb', 40, 20, 640, 360), { x: 100, y: 50, w: 240, h: 120 }, 'the bottom right corner dragged by (40, 20)');
  t.eq(G.resized(r, 'lt', 30, 10, 640, 360), { x: 130, y: 60, w: 170, h: 90 }, 'the top left corner dragged by (30, 10)');
  t.eq(G.resized(r, 'r', 40, 99, 640, 360), { x: 100, y: 50, w: 240, h: 100 }, 'the right edge: only the width changes, whatever the pointer does up and down');
  t.eq(G.resized(r, 't', 99, -20, 640, 360), { x: 100, y: 30, w: 200, h: 120 }, 'the top edge: only the top moves');
  t.eq(G.resized(r, 'l', 260, 0, 640, 360), { x: 300, y: 50, w: 60, h: 100 }, 'the left edge dragged past the right one: the rectangle turns over');
  t.eq(G.resized(r, 'rb', 500, 500, 640, 360), { x: 100, y: 50, w: 540, h: 310 }, 'a corner dragged out of the frame: stops at its edges');
  t.eq(G.resized(r, 'lb', -30, 10, 640, 360), { x: 70, y: 50, w: 230, h: 110 }, 'the bottom left corner');
  t.eq(G.resized(r, 'rt', 10, 10, 640, 360), { x: 100, y: 60, w: 210, h: 90 }, 'the top right corner');

  // the keyboard's sizing: the right and bottom edges, never below one pixel or past the frame
  t.eq(G.sized(r, 10, -1, 640, 360), { x: 100, y: 50, w: 210, h: 99 }, 'Ctrl + → / ↑');
  t.eq(G.sized({ x: 5, y: 5, w: 2, h: 2 }, -10, -10, 640, 360), { x: 5, y: 5, w: 1, h: 1 }, 'never smaller than one pixel');
  t.eq(G.sized({ x: 600, y: 300, w: 30, h: 50 }, 100, 100, 640, 360), { x: 600, y: 300, w: 40, h: 60 }, 'never past the frame');

  // what the pointer grabs (a rectangle 100 … 300 × 50 … 150 on the canvas, reach 10)
  const hit = (x, y, tol = 10) => G.hitOf(100, 50, 300, 150, x, y, tol);
  t.eq([hit(100, 50), hit(300, 50), hit(100, 150), hit(300, 150)], ['lt', 'rt', 'lb', 'rb'], 'the four corners');
  t.eq([hit(95, 100), hit(306, 100), hit(200, 44), hit(200, 158)], ['l', 'r', 't', 'b'], 'the four edges, from just outside or inside');
  t.eq([hit(200, 100), hit(115, 65)], ['move', 'move'], 'inside: move it');
  t.eq([hit(50, 100), hit(200, 10), hit(400, 300), hit(85, 100)], ['', '', '', ''], 'outside (beyond reach): a new rectangle');
  t.eq(G.hitOf(100, 100, 106, 106, 104, 104, 10), 'rb', 'a tiny rectangle: the nearer edges win');
  t.eq(G.hitOf(100, 100, 106, 106, 101, 102, 10), 'lt', '… from its other side the other corner');
  t.eq(['move', 'l', 'r', 't', 'b', 'lt', 'rb', 'rt', 'lb', ''].map(G.cursorOf),
    ['move', 'ew-resize', 'ew-resize', 'ns-resize', 'ns-resize', 'nwse-resize', 'nwse-resize', 'nesw-resize', 'nesw-resize', 'crosshair'], 'the pointer\'s look over each part');

  // the pixels taken: exactly those of the rectangle, as they are — against a pixel-by-pixel copy written here
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 8) & 255;
  const W = 37, H = 23, data = new Uint8ClampedArray(W * H * 4).map(rnd), img = { data, width: W, height: H };
  const ref = (q) => { const o = []; for (let y = q.y; y < q.y + q.h; y++) for (let x = q.x; x < q.x + q.w; x++) for (let c = 0; c < 4; c++) o.push(data[(y * W + x) * 4 + c]); return o; };
  const rects = [{ x: 0, y: 0, w: W, h: H }, { x: 0, y: 0, w: 1, h: 1 }, { x: W - 1, y: H - 1, w: 1, h: 1 }, { x: 3, y: 4, w: 17, h: 9 }, { x: 20, y: 0, w: 17, h: 23 }, { x: 0, y: 22, w: 37, h: 1 }];
  for (let i = 0; i < 40; i++) { const x = rnd() % W, y = rnd() % H; rects.push({ x, y, w: 1 + (rnd() % (W - x)), h: 1 + (rnd() % (H - y)) }); }
  let wrong = 0;
  for (const q of rects) { const c = G.cropImg(img, q); if (c.width !== q.w || c.height !== q.h || c.data.length !== q.w * q.h * 4 || c.data.some((v, k) => v !== ref(q)[k])) wrong++; }
  t.eq(wrong, 0, `${rects.length} rectangles (the whole picture, single corner pixels, a row, random ones): every byte as in the picture, nothing else`);
};
