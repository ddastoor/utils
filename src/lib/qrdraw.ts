// A QR code drawn by zxing-cpp (zxing-wasm, the QR Generator's engine: zint's writer compiled to WebAssembly) for the camera
// helpers (Wi-Fi QR from a router sticker, Visiting Card → Contact): its SVG, a PNG of it, and a printable card with it.
import { h, canvasToBlob } from '../ui';

let ready: Promise<typeof import('zxing-wasm/full')> | null = null;
const zx = () => (ready ||= Promise.all([import('zxing-wasm/full'), import('zxing-wasm/full/zxing_full.wasm?url')]).then(async ([z, u]) => {
  await z.prepareZXingModule({ overrides: { locateFile: (p: string, prefix: string) => (p.endsWith('.wasm') ? u.default : prefix + p) }, fireImmediately: true });
  return z;
}).catch((e) => { ready = null; throw e; }));

/** The QR code of `text` as SVG (zint's own markup, black on white), error correction M. */
export async function qrSvg(text: string, ec: 'L' | 'M' | 'Q' | 'H' = 'M'): Promise<string> {
  const z = await zx();
  const r = await z.writeBarcode(text, { format: 'QRCode', ecLevel: ec, scale: 8 } as any);
  if (r.error) throw new Error(/too long|capacity|exceeds/i.test(r.error) ? 'Too much for one QR code.' : r.error);
  return r.svg.replace(/<\?xml[^>]*>\s*<!DOCTYPE[^>]*>/, '');
}
/** The SVG drawn on a canvas `size` px across (white ground, modules kept sharp). */
export async function svgImage(svg: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  return img;
}
export async function svgToPng(svg: string, size = 1024): Promise<Blob> {
  const img = await svgImage(svg);
  const k = size / Math.max(img.width, img.height), c = h('canvas') as HTMLCanvasElement;
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, c.width, c.height);
  return canvasToBlob(c, 'image/png');
}

/** A card to print or show (1200 × 1650 px): a title, the code, and lines of text under it (label, value — the value in a
 *  monospace face, wrapped where it is long). */
export async function qrCard(o: { title: string; svg: string; rows: Array<[string, string]>; foot?: string }): Promise<Blob> {
  const W = 1200, H = 1650, c = h('canvas') as HTMLCanvasElement; c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#d4d4d8'; g.lineWidth = 4; g.strokeRect(24, 24, W - 48, H - 48);
  g.fillStyle = '#18181b'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.font = '700 64px system-ui, sans-serif'; g.fillText(o.title, W / 2, 140);
  const img = await svgImage(o.svg), side = 760;
  g.imageSmoothingEnabled = false; g.drawImage(img, (W - side) / 2, 190, side, side);
  let y = 190 + side + 90;
  for (const [label, value] of o.rows) {
    g.font = '500 34px system-ui, sans-serif'; g.fillStyle = '#52525b'; g.fillText(label, W / 2, y); y += 62;
    g.font = '600 52px ui-monospace, Menlo, Consolas, monospace'; g.fillStyle = '#18181b';
    // the value on as many lines as it needs, cut between characters (a password has no spaces to break at)
    let line = '';
    for (const ch of [...value]) { if (g.measureText(line + ch).width > W - 160) { g.fillText(line, W / 2, y); y += 64; line = ''; } line += ch; }
    g.fillText(line, W / 2, y); y += 92;
  }
  if (o.foot) { g.font = '400 32px system-ui, sans-serif'; g.fillStyle = '#52525b'; g.fillText(o.foot, W / 2, Math.min(H - 70, y + 10)); }
  return canvasToBlob(c, 'image/png');
}
