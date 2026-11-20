/* The Noise Remover's reference (scripts/make-rnnoise-reference.sh): RNNoise 0.2 compiled natively, run on
 *   speech — the 16 kHz test recording, three times each sample (48 kHz), on the ±32768 scale of 16-bit audio;
 *   noise  — two seconds of white noise from the unit test's generator (seed 7, ×0.35 around 0).
 * Prints JSON: per 10 ms frame the level of the cleaned frame (dBFS) and the voice probability, the output aligned
 * with the input (RNNoise's two frames of lag dropped, two frames of silence after the end), as src/wasm/rnnoise.ts. */
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "rnnoise.h"
#define F 480
#define DELAY 2

static void run(const char *name, const float *x, uint32_t n, int last) {
  DenoiseState *st = rnnoise_create(NULL);
  uint32_t frames = (n + F - 1) / F;
  float in[F], out[F];
  printf("  \"%s\": { \"frames\": %u, \"db\": [", name, frames);
  float *vad = malloc(frames * sizeof(float));
  for (uint32_t k = 0; k < frames + DELAY; k++) {
    for (uint32_t i = 0; i < F; i++) { uint64_t j = (uint64_t)k * F + i; in[i] = j < n ? x[j] : 0.f; }
    float p = rnnoise_process_frame(st, out, in);
    if (k < DELAY) continue;
    uint32_t f = k - DELAY, len = (f + 1) * F <= n ? F : n - f * F;
    double s = 0; for (uint32_t i = 0; i < len; i++) s += (double)out[i] * out[i];
    double db = s > 0 ? 10 * log10(s / len / (32768.0 * 32768.0)) : -200;
    printf("%s%.2f", f ? "," : "", db < -200 ? -200 : db);
    vad[f] = p;
  }
  printf("], \"vad\": [");
  for (uint32_t f = 0; f < frames; f++) printf("%s%.4f", f ? "," : "", vad[f]);
  printf("] }%s\n", last ? "" : ",");
  free(vad); rnnoise_destroy(st);
}

int main(int argc, char **argv) {
  if (argc < 2) { fprintf(stderr, "usage: %s noisy-speech.wav\n", argv[0]); return 2; }
  FILE *fp = fopen(argv[1], "rb"); if (!fp) { perror(argv[1]); return 1; }
  fseek(fp, 0, SEEK_END); long sz = ftell(fp); fseek(fp, 0, SEEK_SET);
  uint8_t *w = malloc(sz); if (fread(w, 1, sz, fp) != (size_t)sz) return 1; fclose(fp);
  long p = 12; uint32_t dlen = 0; const uint8_t *data = NULL; /* walk the RIFF chunks to "data" */
  while (p + 8 <= sz) { uint32_t len = w[p + 4] | w[p + 5] << 8 | w[p + 6] << 16 | (uint32_t)w[p + 7] << 24;
    if (!memcmp(w + p, "data", 4)) { data = w + p + 8; dlen = len; break; } p += 8 + len + (len & 1); }
  if (!data) { fprintf(stderr, "no data chunk\n"); return 1; }
  uint32_t n16 = dlen / 2, n = n16 * 3;
  float *x = malloc(n * sizeof(float));
  for (uint32_t i = 0; i < n16; i++) { int16_t v = (int16_t)(data[2 * i] | data[2 * i + 1] << 8); x[3 * i] = x[3 * i + 1] = x[3 * i + 2] = v; }
  uint32_t seed = 7, nn = 48000 * 2; float *z = malloc(nn * sizeof(float));
  for (uint32_t i = 0; i < nn; i++) { seed = seed * 1103515245u + 12345u; z[i] = (float)((seed / 4294967296.0 - 0.5) * 0.35) * 32768.f; }
  printf("{\n  \"source\": \"RNNoise 0.2 (model 0b50c45) as its configure builds it (8-bit weights), generic C path, compiled natively by scripts/make-rnnoise-reference.sh\",\n");
  run("speech", x, n, 0);
  run("noise", z, nn, 1);
  printf("}\n");
  return 0;
}
