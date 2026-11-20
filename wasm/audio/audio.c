// audio.wasm — own C (MIT) around LAME 4.0's libmp3lame (LGPL-2.0). All sample buffers are 32-bit float, range
// −1…1, PLANAR: channel c of `frames` samples starts at x + c*frames. Functions that return a new buffer allocate it
// with malloc (free it with a_free) and put its length in a_outlen() (bytes for encoders, frames for audio).
//   a_wav        float → RIFF/WAVE (16-bit PCM or 32-bit float)
//   a_mix2       two signals mixed with their own gains
//   a_mp3        float → MP3 (CBR kbps or VBR V0–V9), with the LAME/Xing tag frame so players know the length
//   a_peaks      min/max per bucket (waveform drawing)
//   a_levels     peak + RMS
//   a_gain, a_fade, a_mix_mono
//   a_resample   windowed-sinc (Kaiser) resampler, any ratio
#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "lame.h"

#define API __attribute__((visibility("default")))
static char g_err[200];
static uint32_t g_outlen;
static void *fail(const char *m) { strncpy(g_err, m, sizeof g_err - 1); return NULL; }
API const char *a_error(void) { return g_err; }
API uint32_t a_outlen(void) { return g_outlen; }
API void *a_malloc(uint32_t n) { return malloc(n ? n : 1); }
API void a_free(void *p) { free(p); }
API const char *a_lame_version(void) { return get_lame_version(); }

static inline float clampf(float v) { return v > 1.f ? 1.f : v < -1.f ? -1.f : v; }

// ------------------------------------------------------------------ WAV
static void le16(uint8_t *p, uint32_t v) { p[0] = v; p[1] = v >> 8; }
static void le32(uint8_t *p, uint32_t v) { p[0] = v; p[1] = v >> 8; p[2] = v >> 16; p[3] = v >> 24; }
/** bits = 16 (PCM, rounded) or 32 (IEEE float). Channels interleaved in the file.
 *  flags bit 0 (16-bit): samples above zero ×32767 and below ×32768 — the inverse of how Chromium reads 16-bit PCM
 *  (s / 32767 above zero, s / 32768 below); without it ×32768 for both and clipped at 32767 — the inverse of s / 32768
 *  (Firefox, Safari, FFmpeg, libsndfile). With the browser's own rule a file opened and saved unchanged keeps every
 *  sample (×32767 for both changed the loud half of them by a step). */
API uint8_t *a_wav(const float *x, uint32_t frames, uint32_t ch, uint32_t sr, uint32_t bits, uint32_t flags) {
  if (!ch || ch > 8 || !sr || (bits != 16 && bits != 32)) return fail("bad WAV parameters");
  uint32_t bps = bits / 8, data = frames * ch * bps;
  if ((uint64_t)frames * ch * bps > 0xFFFFFFFFull - 64) return fail("too long for a WAV file (4 GB)");
  uint8_t *o = malloc(44 + data);
  if (!o) return fail("out of memory");
  memcpy(o, "RIFF", 4); le32(o + 4, 36 + data); memcpy(o + 8, "WAVEfmt ", 8);
  le32(o + 16, 16); le16(o + 20, bits == 32 ? 3 : 1); le16(o + 22, ch); le32(o + 24, sr);
  le32(o + 28, sr * ch * bps); le16(o + 32, ch * bps); le16(o + 34, bits);
  memcpy(o + 36, "data", 4); le32(o + 40, data);
  uint8_t *p = o + 44;
  for (uint32_t i = 0; i < frames; i++)
    for (uint32_t c = 0; c < ch; c++) {
      float v = clampf(x[(size_t)c * frames + i]);
      if (bits == 16) { int32_t s = (int32_t)lrintf(v * ((flags & 1) && v > 0 ? 32767.f : 32768.f)); if (s > 32767) s = 32767; le16(p, (uint16_t)(int16_t)s); p += 2; }
      else { uint32_t u; memcpy(&u, &v, 4); le32(p, u); p += 4; }
    }
  g_outlen = 44 + data;
  return o;
}

// ------------------------------------------------------------------ MP3 (LAME)
/** vbr = 0: CBR at `rate` kbps (32…320). vbr = 1: VBR quality `rate` (0 best … 9 smallest). ch = 1 or 2.
 *  quality = LAME's algorithm quality 0 (best, slowest) … 9; 2 is "high quality", 5 the default. */
API uint8_t *a_mp3(const float *x, uint32_t frames, uint32_t ch, uint32_t sr, uint32_t vbr, uint32_t rate, uint32_t quality) {
  if (ch < 1 || ch > 2) return fail("MP3 needs mono or stereo");
  lame_global_flags *gf = lame_init();
  if (!gf) return fail("LAME init failed");
  lame_set_in_samplerate(gf, (int)sr);
  lame_set_num_channels(gf, (int)ch);
  lame_set_mode(gf, ch == 1 ? MONO : JOINT_STEREO);
  lame_set_quality(gf, (int)(quality > 9 ? 9 : quality));
  lame_set_write_id3tag_automatic(gf, 0);
  lame_set_bWriteVbrTag(gf, 1);
  if (vbr) { lame_set_VBR(gf, vbr_default); lame_set_VBR_quality(gf, (float)(rate > 9 ? 9 : rate)); }
  else { lame_set_VBR(gf, vbr_off); lame_set_brate(gf, (int)rate); }
  if (lame_init_params(gf) < 0) { lame_close(gf); return fail("LAME rejected these settings"); }
  size_t cap = (size_t)(1.25 * frames) + 7200 * 4 + 16384, len = 0;
  uint8_t *out = malloc(cap);
  if (!out) { lame_close(gf); return fail("out of memory"); }
  const float *L = x, *R = ch == 2 ? x + frames : x;
  const uint32_t CH = 8192;
  for (uint32_t i = 0; i < frames; i += CH) {
    uint32_t n = frames - i < CH ? frames - i : CH;
    int w = lame_encode_buffer_ieee_float(gf, L + i, R + i, (int)n, out + len, (int)(cap - len));
    if (w < 0) { free(out); lame_close(gf); return fail("MP3 encoding failed"); }
    len += (size_t)w;
  }
  int w = lame_encode_flush(gf, out + len, (int)(cap - len));
  if (w < 0) { free(out); lame_close(gf); return fail("MP3 flush failed"); }
  len += (size_t)w;
  // the first frame was written as a placeholder: replace it with the LAME/Xing tag (frame count, seek table)
  uint8_t tag[2880];
  size_t t = lame_get_lametag_frame(gf, tag, sizeof tag);
  if (t > 0 && t <= len) memcpy(out, tag, t);
  lame_close(gf);
  g_outlen = (uint32_t)len;
  return out;
}

// ------------------------------------------------------------------ analysis + simple processing
/** out[2*b] = min, out[2*b+1] = max of bucket b (buckets equal slices of x). */
API void a_peaks(const float *x, uint32_t n, uint32_t buckets, float *out) {
  for (uint32_t b = 0; b < buckets; b++) {
    uint64_t s = (uint64_t)n * b / buckets, e = (uint64_t)n * (b + 1) / buckets;
    if (e <= s) e = s + 1 <= n ? s + 1 : s;
    float lo = 0, hi = 0;
    for (uint64_t i = s; i < e && i < n; i++) { float v = x[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    out[2 * b] = lo; out[2 * b + 1] = hi;
  }
}
/** out[0] = peak |x|, out[1] = RMS. */
API void a_levels(const float *x, uint32_t n, float *out) {
  double s = 0; float pk = 0;
  for (uint32_t i = 0; i < n; i++) { float a = fabsf(x[i]); if (a > pk) pk = a; s += (double)x[i] * x[i]; }
  out[0] = pk; out[1] = n ? (float)sqrt(s / n) : 0;
}
API void a_gain(float *x, uint32_t n, float g) { for (uint32_t i = 0; i < n; i++) x[i] = clampf(x[i] * g); }
/* x·g, not clamped (RNNoise reads its samples on the ±32768 scale of 16-bit audio) */
API void a_scale(float *x, uint32_t n, float g) { for (uint32_t i = 0; i < n; i++) x[i] *= g; }
/* a = ga·a + gb·b, sample by sample (the Noise Remover's strength: the cleaned sound with the untouched input) */
API void a_mix2(float *a, const float *b, uint32_t n, float ga, float gb) { for (uint32_t i = 0; i < n; i++) a[i] = clampf(ga * a[i] + gb * b[i]); }
/** Linear fade in over the first `fin` frames and fade out over the last `fout` frames, every channel. */
API void a_fade(float *x, uint32_t frames, uint32_t ch, uint32_t fin, uint32_t fout) {
  for (uint32_t c = 0; c < ch; c++) {
    float *p = x + (size_t)c * frames;
    for (uint32_t i = 0; i < fin && i < frames; i++) p[i] *= (float)i / fin;
    for (uint32_t i = 0; i < fout && i < frames; i++) p[frames - 1 - i] *= (float)i / fout;
  }
}
/** Planar ch channels → one channel (average), written to out[frames]. */
API void a_mix_mono(const float *x, uint32_t frames, uint32_t ch, float *out) {
  for (uint32_t i = 0; i < frames; i++) { float s = 0; for (uint32_t c = 0; c < ch; c++) s += x[(size_t)c * frames + i]; out[i] = s / ch; }
}

// ------------------------------------------------------------------ resampler
// Windowed sinc, Kaiser window (β = 8.6, ≈ −90 dB stop band), 24 zero crossings each side, table-driven with
// linear interpolation between 512 phases per zero crossing. Cut-off = min(1, ratio) × 0.95 × Nyquist.
#define RS_Z 24
#define RS_RES 512
static float rs_tab[RS_Z * RS_RES + 2];
static int rs_ready;
static double bessel_i0(double x) { double s = 1, t = 1; for (int k = 1; k < 40; k++) { t *= (x / (2 * k)) * (x / (2 * k)); s += t; } return s; }
static void rs_init(void) {
  if (rs_ready) return;
  const double beta = 8.6, i0b = bessel_i0(beta);
  for (int i = 0; i <= RS_Z * RS_RES + 1; i++) {
    double t = (double)i / RS_RES, r = t / RS_Z;
    double w = r >= 1 ? 0 : bessel_i0(beta * sqrt(1 - r * r)) / i0b;
    double s = t == 0 ? 1 : sin(M_PI * t) / (M_PI * t);
    rs_tab[i] = (float)(s * w);
  }
  rs_ready = 1;
}
static inline float rs_k(double t) { // kernel at |t| zero crossings
  t = fabs(t) * RS_RES;
  int i = (int)t;
  if (i >= RS_Z * RS_RES) return 0;
  float f = (float)(t - i);
  return rs_tab[i] + f * (rs_tab[i + 1] - rs_tab[i]);
}
/** Planar resample by ratio = out rate / in rate. Output frames = round(frames × ratio) in a_outlen(). */
API float *a_resample(const float *x, uint32_t frames, uint32_t ch, double ratio) {
  if (!(ratio > 0.01 && ratio < 100)) return fail("bad resampling ratio");
  rs_init();
  uint32_t on = (uint32_t)llround(frames * ratio);
  float *o = malloc((size_t)on * ch * sizeof(float) + 4);
  if (!o) return fail("out of memory");
  double fc = (ratio < 1 ? ratio : 1) * 0.95; // cut-off relative to the input Nyquist
  double half = RS_Z / fc;                    // kernel half-width in input samples
  for (uint32_t c = 0; c < ch; c++) {
    const float *in = x + (size_t)c * frames;
    float *out = o + (size_t)c * on;
    for (uint32_t j = 0; j < on; j++) {
      double t = j / ratio;
      int64_t a = (int64_t)ceil(t - half), b = (int64_t)floor(t + half);
      if (a < 0) a = 0;
      if (b > (int64_t)frames - 1) b = (int64_t)frames - 1;
      double s = 0;
      for (int64_t k = a; k <= b; k++) s += in[k] * rs_k((t - k) * fc);
      out[j] = (float)(s * fc);
    }
  }
  g_outlen = on;
  return o;
}

