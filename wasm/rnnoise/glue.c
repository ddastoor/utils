// rnnoise.wasm glue (own code, MIT) around Xiph's RNNoise 0.2 (C, BSD-3): recurrent-network speech denoiser.
// RNNoise works on 48 kHz audio in 10 ms frames of 480 samples scaled to ±32768. Input/output here: planar float
// −1…1 at 48 kHz (the caller resamples). Output is aligned with the input (RNNoise's one-frame delay removed).
//   n_denoise(x, frames, ch, mix, vad_out) → new planar buffer (n_outlen() frames); mix 1 = fully denoised,
//   0 = original; vad_out (optional) receives one voice probability per 10 ms frame of channel 0.
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "rnnoise.h"

#define API __attribute__((visibility("default")))
#define F 480
#define DELAY 2 /* RNNoise 0.2's latency in frames (measured: output frame k holds input frame k−2) */
static uint32_t g_outlen;
API uint32_t n_outlen(void) { return g_outlen; }
API void *n_malloc(uint32_t n) { return malloc(n ? n : 1); }
API void n_free(void *p) { free(p); }
API uint32_t n_frame_size(void) { return (uint32_t)rnnoise_get_frame_size(); }

API float *n_denoise(const float *x, uint32_t frames, uint32_t ch, float mix, float *vad) {
  if (mix < 0) mix = 0;
  if (mix > 1) mix = 1;
  float *o = malloc((size_t)frames * ch * sizeof(float) + 4);
  if (!o) return NULL;
  uint32_t nf = (frames + F - 1) / F + DELAY; // extra frames flush the delay
  float in[F], out[F];
  for (uint32_t c = 0; c < ch; c++) {
    DenoiseState *st = rnnoise_create(NULL);
    if (!st) { free(o); return NULL; }
    const float *src = x + (size_t)c * frames;
    float *dst = o + (size_t)c * frames;
    for (uint32_t k = 0; k < nf; k++) {
      for (uint32_t i = 0; i < F; i++) { uint64_t j = (uint64_t)k * F + i; in[i] = j < frames ? src[j] * 32768.f : 0.f; }
      float p = rnnoise_process_frame(st, out, in);
      if (vad && c == 0 && k >= DELAY && k - DELAY < (frames + F - 1) / F) vad[k - DELAY] = p;
      if (k < DELAY) continue; // output of frame k belongs to input frame k−DELAY
      for (uint32_t i = 0; i < F; i++) {
        uint64_t j = (uint64_t)(k - DELAY) * F + i;
        if (j >= frames) break;
        float d = out[i] / 32768.f, v = mix * d + (1 - mix) * src[j];
        dst[j] = v > 1 ? 1 : v < -1 ? -1 : v;
      }
    }
    rnnoise_destroy(st);
  }
  g_outlen = frames;
  return o;
}
