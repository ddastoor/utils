// The Long Screenshot Stitcher's work off the page's main thread (potentials #87): the screenshots' pixels, every two of
// them placed against each other (src/lib/stitch.ts on imgproc.wasm), the order, the picture — a preview the size it is
// shown, and the whole picture when it is saved (its pixels transferred, not copied).
import { instantiateWasi } from '../wasm/wasi';
import { bindImgproc, type Img, type Imgproc } from '../wasm/imgproc';
import wasmUrl from '../wasm/bin/imgproc.wasm?url';
import { Stitch, type Arrangement, type Item } from '../lib/stitch';

let ip: Promise<Imgproc> | null = null, S: Stitch | null = null;
let manual: number[] | null = null, bars = { top: false, bottom: false };
const small = new Map<number, { w: number; img: Img }>();
const post = (m: any, t: Transferable[] = []) => (self as any).postMessage(m, t);

/** what the page shows of each screenshot */
const info = (arr: Arrangement) => [...S!.shots.values()].map((s) => ({ id: s.id, name: s.name, width: s.orig.width, height: s.orig.height, from: s.from ?? null }));
const items = (arr: Arrangement): Item[] => [...arr.order, ...S!.given.filter((id) => !arr.order.includes(id))].map((id) => arr.items.get(id)!).filter(Boolean);

self.onmessage = async (ev: MessageEvent<any>) => {
  const { id, op } = ev.data;
  try {
    ip ||= instantiateWasi(wasmUrl).then((x) => bindImgproc(x.exports));
    const p = await ip;
    S ||= new Stitch(p);
    let r: any = null;
    if (op === 'add') {
      let n = 0;
      S.add(ev.data.shot, ev.data.name, ev.data.img, () => { if (++n % 4 === 0) post({ id, op: 'progress', pairs: n }); });
      small.clear(); // the common width may have changed
      r = { shots: info(S.arrange()) };
    } else if (op === 'remove') { S.remove(ev.data.shot); small.delete(ev.data.shot); if (manual) manual = manual.filter((x) => x !== ev.data.shot); }
    else if (op === 'order') manual = ev.data.manual;
    else if (op === 'bars') bars = ev.data.bars;
    else if (op === 'clear') { S.free(); S = null; small.clear(); manual = null; }
    if ((op === 'view' || op === 'full') && S) {
      const st = S, arr = st.arrange(manual ?? undefined), plan = st.plan(arr, bars);
      if (op === 'view') {
        // a preview `width` wide: each screenshot made that small once (OpenCV's area resize, imgproc.wasm)
        const W = plan.width || 1, pw = Math.max(1, Math.min(W, Math.round(ev.data.width))), k = pw / W;
        for (const s of st.shots.values()) {
          const c = small.get(s.id);
          if (!c || c.w !== pw) small.set(s.id, { w: pw, img: pw === s.img.width ? s.img : p.resizeArea(s.img, pw, Math.max(1, Math.round(s.img.height * k))) });
        }
        const img = plan.pieces.length ? st.compose(plan, k, new Map([...small].map(([i, c]) => [i, c.img]))) : null;
        r = { order: arr.order, items: items(arr), manual: arr.manual, shots: info(arr), width: plan.width, height: plan.height, joins: plan.joins.map((y) => y * k),
              pieces: plan.pieces.length, preview: img };
        post({ id, op, result: r }, img ? [img.data.buffer] : []);
        return;
      }
      const img = st.compose(plan);
      post({ id, op, result: { img } }, [img.data.buffer]);
      return;
    }
    post({ id, op, result: r });
  } catch (e: any) {
    post({ id, op, error: e?.message || String(e) });
  }
};
