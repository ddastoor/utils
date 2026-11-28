// The Cartoonizer's anime looks (offered on 26 Nov 2026; built at the owner's word of 28 Nov 2026, "finish off the small
// choices"): AnimeGAN v2's generators for three looks — Hayao, Shinkai, Paprika (Asher Chan / TachibanaYoshino; the author's terms:
// free for non-commercial use) — and bryandlee's face portrait v2 (MIT), as ONNX graphs run by ONNX Runtime Web in
// src/workers/anime.worker.ts, fetched from this site (public/models/animegan, SHA-256 pinned in scripts/assets.json) the first
// time a look is chosen. What is around the networks is here: which look is which file, the size a photo is drawn at, and the
// pixels in and out as the reference implementations make them (their loops imgproc.wasm's). No DOM: the unit suite runs it against
// native ONNX Runtime.

import type { Img, Imgproc } from '../wasm/imgproc';

export type AnimeLayout = 'nhwc' | 'nchw512';
export interface AnimeStyle { id: string; name: string; file: string; bytes: number; layout: AnimeLayout; about: string; licence: string }
const NC = 'AnimeGAN v2 (Tachibana Yoshino) — free for non-commercial use';
export const ANIME_STYLES: AnimeStyle[] = [
  { id: 'hayao', name: 'Hayao', file: 'AnimeGANv2_Hayao.onnx', bytes: 8649739, layout: 'nhwc', about: 'soft painted colours and drawn outlines', licence: NC },
  { id: 'shinkai', name: 'Shinkai', file: 'AnimeGANv2_Shinkai.onnx', bytes: 8649278, layout: 'nhwc', about: 'bright, clear colours, luminous skies', licence: NC },
  { id: 'paprika', name: 'Paprika', file: 'AnimeGANv2_Paprika.onnx', bytes: 8649729, layout: 'nhwc', about: 'bold, warm colours', licence: NC },
  { id: 'face', name: 'Face portrait', file: 'face_paint_512_v2.onnx', bytes: 8594990, layout: 'nchw512', about: 'made for a face: drawn at 512 px', licence: 'bryandlee’s face portrait v2 — MIT' },
];
export const animeStyle = (id: string) => ANIME_STYLES.find((s) => s.id === id) ?? ANIME_STYLES[0];
export const ANIME_DIR = 'models/animegan/';

/** The face portrait's graph was exported for exactly 512 × 512 (its size is fixed in its reshapes). */
export const FACE_SIDE = 512;
/** The size (long side) a photo is drawn at: `side`, never above the photo's own size; the face portrait always 512. */
export function animeSide(style: AnimeStyle, w: number, h: number, side: number): number {
  return style.layout === 'nchw512' ? Math.min(FACE_SIDE, Math.max(w, h)) : Math.min(side, Math.max(w, h));
}

/** What the conversions need of imgproc.wasm (src/wasm/imgproc.ts; the pixel loops are its C, p_anime_in / p_anime_out). */
export type AnimeIp = Pick<Imgproc, 'animeIn' | 'animeOut'>;

/** The network's input for a picture (RGBA): RGB as x / 127.5 − 1 (as AnimeGAN's own code and bryandlee's make it), the picture at
 *  the top left and its last row and column repeated to the size the graph wants — a multiple of 8 each way (AnimeGAN v2 halves the
 *  picture twice and its output is the input rounded down to a multiple of 4), or 512 × 512 for the face portrait. */
export function animeInput(ip: AnimeIp, img: Img, layout: AnimeLayout): { data: Float32Array; dims: number[] } {
  const { width: w, height: h } = img;
  const W = layout === 'nchw512' ? FACE_SIDE : Math.ceil(w / 8) * 8, H = layout === 'nchw512' ? FACE_SIDE : Math.ceil(h / 8) * 8;
  if (w > W || h > H) throw new Error(`a picture of ${w} × ${h} is larger than the face portrait's ${FACE_SIDE} × ${FACE_SIDE}`);
  return { data: ip.animeIn(img, W, H, layout !== 'nhwc'), dims: layout === 'nhwc' ? [1, H, W, 3] : [1, 3, H, W] };
}

/** The network's output (tanh, −1 … 1) → the picture's own w × h (the padding cut off): (y + 1) × 127.5, held to 0 … 255 and
 *  truncated, as AnimeGAN's inverse_transform (a clip, then astype uint8) makes it. */
export function animeOutput(ip: AnimeIp, out: Float32Array, dims: number[], w: number, h: number, layout: AnimeLayout): Img {
  const nhwc = layout === 'nhwc', H = nhwc ? dims[1] : dims[2], W = nhwc ? dims[2] : dims[3];
  if (w > W || h > H || out.length < W * H * 3) throw new Error(`the network gave ${W} × ${H} for a picture of ${w} × ${h}`);
  return ip.animeOut(out, W, H, !nhwc, w, h);
}
