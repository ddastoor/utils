// Person segmentation: MediaPipe selfie_multiclass_256x256 (official C++ → wasm) gives a low-resolution
// "not background" probability; imgproc.wasm's guided filter turns it into a crisp full-resolution alpha matte.
import { selfieSegmenter, toImageData } from './mediapipe';
import { imgprocDirect, type Img } from '../wasm/imgproc';

export interface PersonMask { mask: Uint8Array; w: number; h: number }
/** Low-res person probability mask (0..255) for an image (run on a ≤ 768 px copy). */
export async function personMask(img: Img): Promise<PersonMask> {
  const seg = await selfieSegmenter(), ip = await imgprocDirect();
  const s = Math.min(1, 768 / Math.max(img.width, img.height));
  const small = s < 1 ? ip.resize(img, Math.round(img.width * s), Math.round(img.height * s)) : img;
  const res = seg.segment(toImageData(small));
  try {
    const ms = res.confidenceMasks!, w = ms[0].width, hh = ms[0].height, n = w * hh;
    const planes = new Float32Array(n * 6);
    ms.slice(0, 6).forEach((m, i) => planes.set(m.getAsFloat32Array(), i * n));
    return { mask: ip.personMask(planes, w, hh, Math.max(2, Math.round(Math.max(w, hh) / 40))), w, h: hh }; // combined in C
  } finally { res.close(); }
}
