// Built-in "paintings" for neural style transfer, drawn procedurally with the canvas 2D API at run time (so no
// copyrighted artwork is shipped). Each is deterministic: the same seed always draws the same 256×256 texture.
import type { Img } from '../wasm/imgproc';

export interface ArtStyle { id: string; name: string; draw: (g: OffscreenCanvasRenderingContext2D, r: () => number) => void }
const S = 256;

/** Deterministic PRNG (mulberry32) — only for drawing the textures, never for anything secret. */
const prng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)];

/** Triangulated jittered grid → shards (stained glass, cubist). */
function shards(g: OffscreenCanvasRenderingContext2D, r: () => number, n: number, palette: string[], lead: string, leadW: number, alpha = 1) {
  const step = S / n, pts: number[][][] = [];
  for (let y = 0; y <= n; y++) { pts.push([]); for (let x = 0; x <= n; x++) { const edge = x === 0 || y === 0 || x === n || y === n; pts[y].push([x * step + (edge ? 0 : (r() - 0.5) * step * 0.8), y * step + (edge ? 0 : (r() - 0.5) * step * 0.8)]); } }
  g.lineJoin = 'round';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const a = pts[y][x], b = pts[y][x + 1], c = pts[y + 1][x + 1], d = pts[y + 1][x];
    for (const tri of r() < 0.5 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]]) {
      g.beginPath(); g.moveTo(tri[0][0], tri[0][1]); g.lineTo(tri[1][0], tri[1][1]); g.lineTo(tri[2][0], tri[2][1]); g.closePath();
      g.globalAlpha = alpha; g.fillStyle = pick(r, palette); g.fill(); g.globalAlpha = 1;
      if (leadW) { g.strokeStyle = lead; g.lineWidth = leadW; g.stroke(); }
    }
  }
}

export const ART_STYLES: ArtStyle[] = [
  { id: 'swirls', name: 'Night swirls', draw: (g, r) => {
    g.fillStyle = '#0d2350'; g.fillRect(0, 0, S, S);
    const vort = [[70, 80, 1], [180, 120, -1], [120, 200, 1], [220, 40, 1]];
    const pal = ['#f6d743', '#e9b824', '#5d8fdc', '#93bdf7', '#fdf6d8', '#2350a8', '#1a3a85'];
    g.lineCap = 'round';
    for (let i = 0; i < 900; i++) {
      let x = r() * S, y = r() * S;
      g.strokeStyle = pick(r, pal); g.lineWidth = 2 + r() * 4; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        let vx = 0.6, vy = 0;
        for (const [cx, cy, s] of vort) { const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy + 200; vx += (-dy * s * 900) / d2; vy += (dx * s * 900) / d2; }
        const l = Math.hypot(vx, vy) || 1; x += (vx / l) * 3; y += (vy / l) * 3; g.lineTo(x, y);
      }
      g.stroke();
    }
  } },
  { id: 'mosaic', name: 'Mosaic', draw: (g, r) => {
    g.fillStyle = '#2a2622'; g.fillRect(0, 0, S, S);
    const pal = ['#d7263d', '#f46036', '#2e5eaa', '#1b998b', '#c5d86d', '#ffd23f', '#f3f1e9', '#8a4fff'];
    for (let y = 0; y < S; y += 12) for (let x = (y / 12) % 2 ? -6 : 0; x < S; x += 12) {
      g.fillStyle = pick(r, pal); g.beginPath();
      const j = () => (r() - 0.5) * 3;
      g.moveTo(x + 1.5 + j(), y + 1.5 + j()); g.lineTo(x + 10.5 + j(), y + 1.5 + j()); g.lineTo(x + 10.5 + j(), y + 10.5 + j()); g.lineTo(x + 1.5 + j(), y + 10.5 + j()); g.fill();
    }
  } },
  { id: 'glass', name: 'Stained glass', draw: (g, r) => shards(g, r, 7, ['#c0392b', '#2471a3', '#f1c40f', '#27ae60', '#8e44ad', '#e67e22', '#5dade2'], '#111', 5) },
  { id: 'cubist', name: 'Cubist', draw: (g, r) => {
    g.fillStyle = '#b89b6e'; g.fillRect(0, 0, S, S);
    const pal = ['#7a5c3a', '#c9a66b', '#4f5d6b', '#8c9aa6', '#d8c49c', '#3b2f2a', '#a0522d'];
    for (let i = 0; i < 3; i++) shards(g, r, 4 + i * 2, pal, '#2b211b', 1.5, 0.55);
  } },
  { id: 'ink', name: 'Ink wash', draw: (g, r) => {
    g.fillStyle = '#f2e8d2'; g.fillRect(0, 0, S, S); g.lineCap = 'round';
    for (let i = 0; i < 140; i++) {
      const x = r() * S, y = r() * S, a = r() * Math.PI * 2, l = 30 + r() * 120;
      g.strokeStyle = `rgba(20,20,24,${0.08 + r() * 0.5})`; g.lineWidth = 1 + r() * r() * 16;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.8) * l * 0.6, y + Math.sin(a + 0.8) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  } },
  { id: 'dabs', name: 'Impressionist', draw: (g, r) => {
    const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, '#9cc3e6'); gr.addColorStop(0.55, '#f2d7a0'); gr.addColorStop(1, '#6f9a4c');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    const pal = ['#f7c6d0', '#ffe8a3', '#a8d5a2', '#7fb3d5', '#f9e79f', '#d7bde2', '#f5b041', '#58a55c', '#ffffff'];
    for (let i = 0; i < 2600; i++) {
      g.save(); g.translate(r() * S, r() * S); g.rotate(-0.5 + r() * 0.4); g.globalAlpha = 0.55 + r() * 0.4;
      g.fillStyle = pick(r, pal); g.beginPath(); g.ellipse(0, 0, 3 + r() * 4, 1.2 + r() * 1.5, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
  } },
  { id: 'flames', name: 'Flames', draw: (g, r) => {
    g.fillStyle = '#1a0503'; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    const pal = ['rgba(255,80,20,0.35)', 'rgba(255,170,30,0.35)', 'rgba(255,230,120,0.3)', 'rgba(200,30,10,0.4)'];
    for (let i = 0; i < 260; i++) {
      const x0 = r() * S, ph = r() * 6, amp = 6 + r() * 18, fr = 0.02 + r() * 0.04;
      g.strokeStyle = pick(r, pal); g.lineWidth = 2 + r() * 7; g.beginPath();
      for (let y = S; y > S * r() * 0.6; y -= 4) { const x = x0 + Math.sin(y * fr + ph) * amp * (1 - y / S + 0.3); y === S ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
  } },
  { id: 'pop', name: 'Pop art', draw: (g, r) => {
    const q = [['#ff2e88', '#ffe600'], ['#00b7ff', '#ff6b00'], ['#7cff00', '#8a2be2'], ['#ffe600', '#00b7ff']];
    q.forEach(([bg, dot], i) => {
      const x0 = (i % 2) * 128, y0 = Math.floor(i / 2) * 128;
      g.fillStyle = bg; g.fillRect(x0, y0, 128, 128); g.fillStyle = dot;
      for (let y = 4; y < 128; y += 9) for (let x = (y / 9) % 2 ? 8 : 4; x < 128; x += 9) { g.beginPath(); g.arc(x0 + x, y0 + y, 1.5 + ((x + y) / 256) * 2.5, 0, Math.PI * 2); g.fill(); }
    });
    g.strokeStyle = '#000'; g.lineWidth = 6; g.lineCap = 'round';
    for (let i = 0; i < 9; i++) { g.beginPath(); const y = r() * S; g.moveTo(0, y); g.bezierCurveTo(80, y + (r() - 0.5) * 120, 170, y + (r() - 0.5) * 120, S, y + (r() - 0.5) * 60); g.stroke(); }
  } },
];

const cache = new Map<string, Img>();
/** The 256×256 texture for a built-in style. */
export function artImage(id: string): Img {
  const hit = cache.get(id); if (hit) return hit;
  const st = ART_STYLES.find((s) => s.id === id); if (!st) throw new Error(`Unknown style ${id}`);
  const c = new OffscreenCanvas(S, S), g = c.getContext('2d', { willReadFrequently: true })!;
  st.draw(g, prng([...id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7)));
  const d = g.getImageData(0, 0, S, S), img = { data: d.data, width: S, height: S };
  cache.set(id, img);
  return img;
}
