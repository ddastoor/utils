// HEIC → the sRGB pixels every other part of the app works in. libheif decodes the pixels in the photo's own colour
// space (iPhones: Display P3, carried as an ICC profile); Little CMS (lcms-wasm, LittleCMS 2.16 compiled to
// WebAssembly) converts them to sRGB with that profile — as the browser does for a JPEG or PNG with a profile.

/** The ICC profile of a decoded HEIC image (libheif's handle), or null (none, or only an "nclx" description). */
export function heicProfile(lib: any, h: any): Uint8Array | null {
  const handle: number = typeof h === 'number' ? h : h?.$$?.ptr; // libheif-js hands out embind wrappers
  if (!handle) return null;
  const type = lib._heif_image_handle_get_color_profile_type(handle) >>> 0;
  const fourcc = String.fromCharCode((type >>> 24) & 255, (type >>> 16) & 255, (type >>> 8) & 255, type & 255);
  if (fourcc !== 'prof' && fourcc !== 'rICC') return null;
  const size = lib._heif_image_handle_get_raw_color_profile_size(handle) >>> 0;
  if (!size) return null;
  const ptr = lib._malloc(size), err = lib._malloc(32);
  try {
    lib._heif_image_handle_get_raw_color_profile(err, handle, ptr);
    return lib.HEAPU8.slice(ptr, ptr + size);
  } finally { lib._free(ptr); lib._free(err); }
}

type Lcms = any;
/** RGBA pixels from the profile's space into sRGB (relative colorimetric, alpha copied), a strip at a time so a
 *  48-megapixel photo never needs its whole size twice in WebAssembly memory. Returns null when the profile is sRGB
 *  already or cannot be read (the pixels are then used as they are). */
export function toSrgb(lcms: Lcms, C: { TYPE_RGBA_8: number; INTENT_RELATIVE_COLORIMETRIC: number; cmsFLAGS_COPY_ALPHA: number; cmsInfoDescription: number }, rgba: Uint8ClampedArray | Uint8Array, icc: Uint8Array): { data: Uint8ClampedArray; profile: string } | null {
  const src = lcms.cmsOpenProfileFromMem(icc, icc.byteLength);
  if (!src) return null;
  const profile: string = lcms.cmsGetProfileInfoASCII(src, C.cmsInfoDescription, 'en', 'US') || '';
  if (/\bsRGB\b/i.test(profile)) { lcms.cmsCloseProfile(src); return null; }
  const dst = lcms.cmsCreate_sRGBProfile();
  const tf = lcms.cmsCreateTransform(src, C.TYPE_RGBA_8, dst, C.TYPE_RGBA_8, C.INTENT_RELATIVE_COLORIMETRIC, C.cmsFLAGS_COPY_ALPHA);
  try {
    if (!tf) return null;
    const out = new Uint8ClampedArray(rgba.length), STRIP = 1 << 20; // pixels
    for (let p = 0; p < rgba.length / 4; p += STRIP) {
      const n = Math.min(STRIP, rgba.length / 4 - p);
      out.set(lcms.cmsDoTransform(tf, rgba.subarray(p * 4, (p + n) * 4), n), p * 4);
    }
    return { data: out, profile };
  } finally { if (tf) lcms.cmsDeleteTransform(tf); lcms.cmsCloseProfile(src); lcms.cmsCloseProfile(dst); }
}
