// studio.c — the Noise Remover's "Studio voice" (to-do #20; owner, 26 Nov 2026: "when I record my voice, say out in the open,
// in traffic or outside, when I remove the noise, there should be a new option so that it should sound as if I'm speaking in
// the studio"). Included by audio.c (one translation unit: it shares a_outlen and the error text). Own C, MIT.
//
// 1. DeepFilterNet 3's signal processing around its network (the network runs on ONNX Runtime Web in the worker):
//      a_dfn_prepare(x, n)   one segment at 48 kHz → the STFT (kept), the network's two inputs (a_dfn_ferb, a_dfn_fspec)
//      a_dfn_apply(m, c)     the network's ERB mask and deep-filter coefficients → the cleaned segment, as long as x
//    as DeepFilterNet's own libDF (Rust, v0.5.6) does it, which its enhance() runs: a 960-point STFT with a 480-sample hop
//    and the Vorbis window (analysis scaled by 1 / 960, synthesis unscaled), 32 ERB bands of at least two bins, the band
//    powers in dB normalised by a running mean (α 0.99, from −60 … −90 dB), the first 96 bins normalised by a running
//    magnitude (from 0.001 … 0.0001), the mask on the band's bins, the deep filter (order 5, two frames ahead) on the noisy
//    spectrum below bin 96, overlap-add, and the 480 samples of the STFT's delay taken off. The unit suite holds it to
//    libDF + ONNX Runtime (tests/fixtures/dfn/reference.json, scripts/make-dfn-reference.py).
// 2. The studio finish (a_studio_finish), at 48 kHz: rumble filter, a gentle downward expander in the pauses, warmth and
//    presence, a compressor for an even level, a de-esser, the loudness brought to −16 LUFS as heard on two speakers
//    (ITU-R BS.1770-4 / EBU R128, gated; a mono sound counted on both, BS.1770's dual mono — at −16 measured on its one
//    channel natural speech needs its peaks limited by 3 dB and more half the time, which DNSMOS marks down) and the true
//    peak held at −1.5 dBTP (4× oversampled, look-ahead limiter). Thresholds follow the voice's own level, so a quiet and a
//    loud recording get the same treatment. The unit suite holds the loudness and the true peak to FFmpeg's ebur128.

// ------------------------------------------------------------------ FFT (mixed radix 2, 3, 4, 5; double precision)
typedef struct { double re, im; } cpx;
typedef struct { int n, nf, fac[24]; cpx *tw; } fftplan;
static int fft_plan(fftplan *p, int n) {
  int m = n; p->n = n; p->nf = 0;
  while (m % 4 == 0) { p->fac[p->nf++] = 4; m /= 4; }
  while (m % 2 == 0) { p->fac[p->nf++] = 2; m /= 2; }
  while (m % 3 == 0) { p->fac[p->nf++] = 3; m /= 3; }
  while (m % 5 == 0) { p->fac[p->nf++] = 5; m /= 5; }
  if (m != 1 || p->nf > 24) return 0;
  p->tw = malloc(sizeof(cpx) * n);
  if (!p->tw) return 0;
  for (int k = 0; k < n; k++) { double a = -2 * M_PI * k / n; p->tw[k].re = cos(a); p->tw[k].im = sin(a); }
  return 1;
}
/** decimation in time: the r sub-transforms of every r-th input, then r-point transforms of their twiddled outputs */
static void fft_rec(const fftplan *p, const cpx *in, cpx *out, int n, int stride, int lvl, int inv) {
  if (n == 1) { out[0] = in[0]; return; }
  const int r = p->fac[lvl], m = n / r, N = p->n, step = N / n, rs = N / r;
  for (int j = 0; j < r; j++) fft_rec(p, in + j * stride, out + j * m, m, stride * r, lvl + 1, inv);
  cpx t[5];
  for (int q = 0; q < m; q++) {
    for (int j = 0; j < r; j++) {
      const cpx y = out[j * m + q], w = p->tw[(j * q * step) % N];
      const double wi = inv ? -w.im : w.im;
      t[j].re = y.re * w.re - y.im * wi; t[j].im = y.re * wi + y.im * w.re;
    }
    for (int s = 0; s < r; s++) {
      double ar = 0, ai = 0;
      for (int j = 0; j < r; j++) {
        const cpx w = p->tw[(j * s * rs) % N]; const double wi = inv ? -w.im : w.im;
        ar += t[j].re * w.re - t[j].im * wi; ai += t[j].re * wi + t[j].im * w.re;
      }
      out[q + m * s].re = ar; out[q + m * s].im = ai;
    }
  }
}

// ------------------------------------------------------------------ DeepFilterNet 3 (libDF's DSP)
#define DF_FFT 960
#define DF_HOP 480
#define DF_BINS 481
#define DF_ERB 32
#define DF_NB 96
#define DF_ORDER 5
#define DF_AHEAD 2
static const float DF_ALPHA = 0.99f; // DeepFilterNet's get_norm_alpha(): exp(−hop / sr) rounded to 0.99
static float df_win[DF_FFT];
static int df_erbw[DF_ERB], df_band[DF_BINS], df_ready;
static fftplan df_plan;
static struct { uint32_t n, T; float *spec, *ferb, *fspec; } seg;

static float freq2erb(float f) { return 9.265f * log1pf(f / (24.7f * 9.265f)); }
static float erb2freq(float e) { return 24.7f * 9.265f * (expf(e / 9.265f) - 1.f); }
/** libDF's erb_fb(48000, 960, 32, 2): the number of bins in each band */
static void erb_widths(int sr, int fft, int nb, int minf, int *w) {
  const float fw = (float)sr / fft, lo = freq2erb(0.f), hi = freq2erb((float)(sr / 2)), step = (hi - lo) / nb;
  int prev = 0, over = 0, sum = 0;
  for (int i = 1; i <= nb; i++) {
    const int fb = (int)roundf(erb2freq(lo + i * step) / fw);
    int k = fb - prev - over;
    if (k < minf) { over = minf - k; k = minf; } else over = 0;
    w[i - 1] = k; prev = fb;
  }
  w[nb - 1] += 1;
  for (int i = 0; i < nb; i++) sum += w[i];
  if (sum > fft / 2 + 1) w[nb - 1] -= sum - (fft / 2 + 1);
}
static int df_init(void) {
  if (df_ready) return 1;
  for (int i = 0; i < DF_FFT; i++) { const double s = sin(0.5 * M_PI * (i + 0.5) / (DF_FFT / 2)); df_win[i] = (float)sin(0.5 * M_PI * s * s); }
  erb_widths(48000, DF_FFT, DF_ERB, 2, df_erbw);
  for (int b = 0, f = 0; b < DF_ERB; b++) for (int k = 0; k < df_erbw[b] && f < DF_BINS; k++) df_band[f++] = b;
  if (!fft_plan(&df_plan, DF_FFT)) return 0;
  return df_ready = 1;
}
API const int32_t *a_dfn_erb_widths(void) { df_init(); return df_erbw; }

static void seg_free(void) { free(seg.spec); free(seg.ferb); free(seg.fspec); seg.spec = seg.ferb = seg.fspec = NULL; seg.n = seg.T = 0; }
API void a_dfn_release(void) { seg_free(); }
API float *a_dfn_ferb(void) { return seg.ferb; }   // [T][32]: the network's feat_erb [1, 1, T, 32]
API float *a_dfn_fspec(void) { return seg.fspec; } // [2][T][96]: feat_spec [1, 2, T, 96] (real parts, then imaginary)
API float *a_dfn_spec(void) { return seg.spec; }   // [T][481][2]: the noisy STFT (for the tests)

/** One segment of mono 48 kHz sound → its STFT and the network's inputs. The segment is padded with 960 zeros at the
 *  end (DeepFilterNet's enhance(pad=True)), so T = (n + 960) / 480 frames. Returns T (0 on failure, a_error says why). */
API uint32_t a_dfn_prepare(const float *x, uint32_t n) {
  seg_free();
  if (!df_init()) { fail("out of memory"); return 0; }
  const uint32_t T = (n + DF_FFT) / DF_HOP;
  seg.spec = malloc((size_t)T * DF_BINS * 2 * sizeof(float));
  seg.ferb = malloc((size_t)T * DF_ERB * sizeof(float));
  seg.fspec = malloc((size_t)T * DF_NB * 2 * sizeof(float));
  if (!seg.spec || !seg.ferb || !seg.fspec) { seg_free(); fail("out of memory"); return 0; }
  seg.n = n; seg.T = T;
  float amem[DF_HOP] = { 0 }, erbs[DF_ERB], units[DF_NB];
  for (int b = 0; b < DF_ERB; b++) erbs[b] = -60.f + (-90.f - -60.f) / (DF_ERB - 1) * b;
  for (int f = 0; f < DF_NB; f++) units[f] = 0.001f + (0.0001f - 0.001f) / (DF_NB - 1) * f;
  static cpx in[DF_FFT], out[DF_FFT];
  const float wnorm = 1.f / ((float)DF_FFT * DF_FFT / (2 * DF_HOP));
  for (uint32_t t = 0; t < T; t++) {
    float fr[DF_HOP];
    for (int i = 0; i < DF_HOP; i++) { const uint64_t j = (uint64_t)t * DF_HOP + i; fr[i] = j < n ? x[j] : 0.f; }
    for (int i = 0; i < DF_HOP; i++) { in[i].re = amem[i] * df_win[i]; in[i].im = 0; in[DF_HOP + i].re = fr[i] * df_win[DF_HOP + i]; in[DF_HOP + i].im = 0; }
    memcpy(amem, fr, sizeof fr);
    fft_rec(&df_plan, in, out, DF_FFT, 1, 0, 0);
    float *X = seg.spec + (size_t)t * DF_BINS * 2;
    for (int f = 0; f < DF_BINS; f++) { X[2 * f] = (float)out[f].re * wnorm; X[2 * f + 1] = (float)out[f].im * wnorm; }
    // ERB features: the mean power of each band in dB, less its running mean, / 40
    for (int b = 0, f = 0; b < DF_ERB; b++) {
      const float k = 1.f / df_erbw[b];
      float p = 0;
      for (int j = 0; j < df_erbw[b]; j++, f++) p += (X[2 * f] * X[2 * f] + X[2 * f + 1] * X[2 * f + 1]) * k;
      float v = log10f(p + 1e-10f) * 10.f;
      erbs[b] = v * (1.f - DF_ALPHA) + erbs[b] * DF_ALPHA;
      seg.ferb[(size_t)t * DF_ERB + b] = (v - erbs[b]) / 40.f;
    }
    // the first 96 bins over the square root of their running magnitude
    for (int f = 0; f < DF_NB; f++) {
      const float re = X[2 * f], im = X[2 * f + 1];
      units[f] = hypotf(re, im) * (1.f - DF_ALPHA) + units[f] * DF_ALPHA;
      const float s = sqrtf(units[f]);
      seg.fspec[(size_t)t * DF_NB + f] = re / s;
      seg.fspec[(size_t)T * DF_NB + (size_t)t * DF_NB + f] = im / s;
    }
  }
  return T;
}

/** The network's outputs for the prepared segment — mask [T][32] (erb_mask [1, 1, T, 32]) and coefficients [5][T][96][2]
 *  (df_coefs [1, 5, T, 96, 2]) — → the cleaned segment (n samples, lined up with the input; free with a_free). */
API float *a_dfn_apply(const float *mask, const float *coefs) {
  if (!seg.spec) return fail("nothing prepared");
  const uint32_t T = seg.T, n = seg.n;
  float *o = calloc(n ? n : 1, sizeof(float));
  if (!o) return fail("out of memory");
  float smem[DF_HOP] = { 0 }, Y[DF_BINS * 2];
  static cpx in[DF_FFT], out[DF_FFT];
  for (uint32_t t = 0; t < T; t++) {
    const float *X = seg.spec + (size_t)t * DF_BINS * 2, *m = mask + (size_t)t * DF_ERB;
    for (int f = DF_NB; f < DF_BINS; f++) { const float g = m[df_band[f]]; Y[2 * f] = X[2 * f] * g; Y[2 * f + 1] = X[2 * f + 1] * g; }
    for (int f = 0; f < DF_NB; f++) { // the deep filter: Σ_k X[t + k − 2] · C[k][t] (complex), on the noisy spectrum
      float re = 0, im = 0;
      for (int k = 0; k < DF_ORDER; k++) {
        const int64_t tt = (int64_t)t + k - (DF_ORDER - 1 - DF_AHEAD);
        if (tt < 0 || tt >= (int64_t)T) continue;
        const float *x = seg.spec + ((size_t)tt * DF_BINS + f) * 2, *c = coefs + (((size_t)k * T + t) * DF_NB + f) * 2;
        re += x[0] * c[0] - x[1] * c[1]; im += x[1] * c[0] + x[0] * c[1];
      }
      Y[2 * f] = re; Y[2 * f + 1] = im;
    }
    // inverse real FFT (unscaled; the imaginary parts of DC and Nyquist are ignored, as realfft does), window, overlap-add
    for (int f = 0; f < DF_BINS; f++) { in[f].re = Y[2 * f]; in[f].im = (f == 0 || f == DF_BINS - 1) ? 0 : Y[2 * f + 1]; }
    for (int f = 1; f < DF_BINS - 1; f++) { in[DF_FFT - f].re = Y[2 * f]; in[DF_FFT - f].im = -Y[2 * f + 1]; }
    fft_rec(&df_plan, in, out, DF_FFT, 1, 0, 1);
    for (int i = 0; i < DF_HOP; i++) {
      const float a = (float)out[i].re * df_win[i] + smem[i];
      smem[i] = (float)out[DF_HOP + i].re * df_win[DF_HOP + i];
      const int64_t j = (int64_t)t * DF_HOP + i - (DF_FFT - DF_HOP); // the STFT's delay taken off
      if (j >= 0 && j < (int64_t)n) o[j] = a;
    }
  }
  g_outlen = n;
  return o;
}

// ------------------------------------------------------------------ the studio finish
typedef struct { double b0, b1, b2, a1, a2; } bq_t;
typedef struct { double x1, x2, y1, y2; } bqs_t;
static bq_t bq_norm(double b0, double b1, double b2, double a0, double a1, double a2) { return (bq_t){ b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0 }; }
// RBJ's Audio EQ Cookbook
static bq_t bq_hp(double f, double q, double sr) { const double w = 2 * M_PI * f / sr, c = cos(w), al = sin(w) / (2 * q); return bq_norm((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al); }
static bq_t bq_lp(double f, double q, double sr) { const double w = 2 * M_PI * f / sr, c = cos(w), al = sin(w) / (2 * q); return bq_norm((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al); }
static bq_t bq_peak(double f, double q, double db, double sr) {
  const double A = pow(10, db / 40), w = 2 * M_PI * f / sr, c = cos(w), al = sin(w) / (2 * q);
  return bq_norm(1 + al * A, -2 * c, 1 - al * A, 1 + al / A, -2 * c, 1 - al / A);
}
static bq_t bq_shelf(double f, double db, double sr, int high) { // shelf slope S = 1
  const double A = pow(10, db / 40), w = 2 * M_PI * f / sr, c = cos(w), al = sin(w) / 2 * sqrt(2.0), sa = 2 * sqrt(A) * al;
  if (high) return bq_norm(A * ((A + 1) + (A - 1) * c + sa), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sa), (A + 1) - (A - 1) * c + sa, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sa);
  return bq_norm(A * ((A + 1) - (A - 1) * c + sa), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sa), (A + 1) + (A - 1) * c + sa, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sa);
}
static inline double bq_run(const bq_t *f, bqs_t *s, double x) {
  const double y = f->b0 * x + f->b1 * s->x1 + f->b2 * s->x2 - f->a1 * s->y1 - f->a2 * s->y2;
  s->x2 = s->x1; s->x1 = x; s->y2 = s->y1; s->y1 = y;
  return y;
}
static void bq_apply(float *x, uint32_t n, const bq_t *f, int nf) {
  bqs_t s[8] = { 0 };
  for (uint32_t i = 0; i < n; i++) { double v = x[i]; for (int k = 0; k < nf; k++) v = bq_run(&f[k], &s[k], v); x[i] = (float)v; }
}

/** ITU-R BS.1770-4 integrated loudness (LUFS) of planar audio at 48 kHz: K-weighting, 400 ms blocks every 100 ms, the
 *  absolute gate at −70 LUFS and the relative gate 10 LU below; every channel weighted 1 (mono as one channel, as FFmpeg's
 *  ebur128 and loudnorm measure it). −INFINITY when no block passes the gates. */
API double a_loudness(const float *x, uint32_t frames, uint32_t ch) {
  static const bq_t K1 = { 1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585 };
  static const bq_t K2 = { 1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621 };
  const uint32_t step = 4800, nb = frames >= 19200 ? (frames - 19200) / step + 1 : 0;
  if (!nb) return -INFINITY;
  double *sq = calloc((size_t)(frames / step + 1), sizeof(double)); // the K-weighted energy of every 100 ms, all channels
  double *blk = malloc(sizeof(double) * nb);
  if (!sq || !blk) { free(sq); free(blk); return NAN; }
  for (uint32_t c = 0; c < ch; c++) {
    bqs_t s1 = { 0 }, s2 = { 0 };
    const float *p = x + (size_t)c * frames;
    for (uint32_t i = 0; i < frames; i++) { const double y = bq_run(&K2, &s2, bq_run(&K1, &s1, p[i])); sq[i / step] += y * y; }
  }
  for (uint32_t j = 0; j < nb; j++) blk[j] = (sq[j] + sq[j + 1] + sq[j + 2] + sq[j + 3]) / 19200.0;
  double sum = 0; uint32_t cnt = 0;
  for (uint32_t j = 0; j < nb; j++) if (-0.691 + 10 * log10(blk[j] + 1e-300) > -70) { sum += blk[j]; cnt++; }
  double out = -INFINITY;
  if (cnt) {
    const double rel = -0.691 + 10 * log10(sum / cnt) - 10;
    sum = 0; cnt = 0;
    for (uint32_t j = 0; j < nb; j++) { const double l = -0.691 + 10 * log10(blk[j] + 1e-300); if (l > -70 && l > rel) { sum += blk[j]; cnt++; } }
    if (cnt) out = -0.691 + 10 * log10(sum / cnt);
  }
  free(sq); free(blk);
  return out;
}

// 4× oversampling for the true peak: windowed sinc (Kaiser, β 8), 32 taps a phase (with 16 a peak of white noise read
// 0.8 dB lower than FFmpeg's ebur128 reads it: the filter fell off too early below 24 kHz)
#define TP_TAPS 32
static float tp_h[4][TP_TAPS];
static void tp_init(void) {
  static int done;
  if (done) return;
  for (int ph = 0; ph < 4; ph++) {
    double s = 0;
    for (int k = 0; k < TP_TAPS; k++) {
      const double t = (k - TP_TAPS / 2 + 1) - ph / 4.0, r = t / (TP_TAPS / 2.0); // t in input samples from the point
      const double w = fabs(r) >= 1 ? 0 : bessel_i0(8.0 * sqrt(1 - r * r)) / bessel_i0(8.0);
      const double v = t == 0 ? 1 : sin(M_PI * t) / (M_PI * t);
      tp_h[ph][k] = (float)(v * w); s += v * w;
    }
    for (int k = 0; k < TP_TAPS; k++) tp_h[ph][k] = (float)(tp_h[ph][k] / s);
  }
  done = 1;
}
/** the largest |sample| of the 4× oversampled signal around sample i of one channel */
static inline float tp_at(const float *p, uint32_t n, uint32_t i) {
  float m = fabsf(p[i]);
  for (int ph = 1; ph < 4; ph++) {
    double s = 0;
    for (int k = 0; k < TP_TAPS; k++) { const int64_t j = (int64_t)i + TP_TAPS / 2 - 1 - k; if (j >= 0 && j < (int64_t)n) s += p[j] * tp_h[ph][k]; }
    if (fabs(s) > m) m = (float)fabs(s);
  }
  return m;
}
/** Σ|h| of the worst phase: no interpolated value near a sample exceeds it × the largest |x| of the samples it reads */
static float tp_gain(void) {
  static float g;
  if (!g) { tp_init(); for (int ph = 1; ph < 4; ph++) { float s = 0; for (int k = 0; k < TP_TAPS; k++) s += fabsf(tp_h[ph][k]); if (s > g) g = s; } }
  return g;
}
/** The true peak (dBTP) of planar audio: the largest sample of the 4× oversampled signal */
API double a_true_peak(const float *x, uint32_t frames, uint32_t ch) {
  tp_init();
  float m = 0;
  for (uint32_t c = 0; c < ch; c++) for (uint32_t i = 0; i < frames; i++) { const float v = tp_at(x + (size_t)c * frames, frames, i); if (v > m) m = v; }
  return 20 * log10(m + 1e-30);
}

static inline double db(double v) { return 10 * log10(v + 1e-20); } // of a power
/** The finish's settings, chosen by measurement — DNSMOS on speech in street, traffic, station and café noise
 *  (docs/WASM-AUDIT.md, Noise Remover): [0] compressor threshold relative to the voice's level (dB), [1] its ratio,
 *  [2] attack (ms), [3] release (ms), [4] the EQ's scale (1 = the moves written below), [5] the expander's threshold below
 *  the voice's level (dB). a_studio_param(i, v) sets one (the measuring scripts). */
static double SP[6] = { -6, 3, 5, 100, 1, 25 };
API void a_studio_param(uint32_t i, double v) { if (i < 6) SP[i] = v; }
static inline double coef(double ms) { return exp(-1.0 / (ms * 0.001 * 48000)); }

/** Per-sample level (dB, power) of the loudest channel: one-pole smoothing of the squares with time constant `ms` */
static void level_db(const float *x, uint32_t n, uint32_t ch, double ms, float *out) {
  const double a = coef(ms);
  double *s = calloc(ch, sizeof(double));
  if (!s) return;
  for (uint32_t i = 0; i < n; i++) {
    double m = 0;
    for (uint32_t c = 0; c < ch; c++) { const double v = x[(size_t)c * n + i]; s[c] = a * s[c] + (1 - a) * v * v; if (s[c] > m) m = s[c]; }
    out[i] = 10.f * log10f((float)m + 1e-20f);
  }
  free(s);
}

/** The look-ahead limiter: every sample's 4× oversampled peak at most `cap`. The gain each sample allows is r; h = the
 *  smallest r within ±1.5 ms (a monotonic queue), averaged over ±1.5 ms — at a peak every term is ≤ its r, so the
 *  average is too — then released over 80 ms. Until no peak is over (at most three passes). `r` is scratch (n floats).
 *  Returns the largest reduction (dB). */
static double limit(float *y, uint32_t n, uint32_t ch, double cap, float *r, uint32_t W, double rel_ms) {
  double worst = 0;
  for (int pass = 0; pass < 3; pass++) {
    int any = 0;
    const float bound = (float)cap / tp_gain();
    for (uint32_t i = 0; i < n; i++) {
      float m = 0;
      for (uint32_t c = 0; c < ch; c++) {
        const float *p = y + (size_t)c * n;
        float near = 0; // the largest |x| the interpolation around i reads: below `bound` no peak can reach the cap
        const uint32_t a = i >= TP_TAPS / 2 ? i - TP_TAPS / 2 : 0, b = i + TP_TAPS / 2 < n ? i + TP_TAPS / 2 : n - 1;
        for (uint32_t j = a; j <= b; j++) { const float v = fabsf(p[j]); if (v > near) near = v; }
        if (near <= bound) continue;
        const float v = tp_at(p, n, i); if (v > m) m = v;
      }
      r[i] = m > cap ? (float)(cap / m) : 1.f;
      if (r[i] < 1) any = 1;
    }
    if (!any) break;
    float *h = malloc((size_t)n * sizeof(float) + 4);
    uint32_t *dq = malloc((size_t)(n + 2) * sizeof(uint32_t));
    if (!h || !dq) { free(h); free(dq); break; }
    size_t qh = 0, qt = 0; uint32_t nxt = 0;
    for (uint32_t i = 0; i < n; i++) {
      const uint32_t hiw = i + W < n ? i + W : n - 1;
      while (nxt <= hiw) { while (qt > qh && r[dq[qt - 1]] >= r[nxt]) qt--; dq[qt++] = nxt++; }
      while (dq[qh] + W < i) qh++;
      h[i] = r[dq[qh]];
    }
    free(dq);
    double run = 0, g = 1, most = 1; const double ar = coef(rel_ms);
    for (uint32_t i = 0; i < n + W; i++) {
      if (i < n) run += h[i];
      if (i >= 2 * W + 1) run -= h[i - 2 * W - 1];
      if (i < W) continue;
      const uint32_t j = i - W, lo = j >= W ? j - W : 0, hiw = j + W < n ? j + W : n - 1;
      const double avg = run / (hiw - lo + 1); // at the ends: the part of the window inside the sound
      g = avg < g ? avg : ar * g + (1 - ar) * avg;
      if (g < most) most = g;
      for (uint32_t c = 0; c < ch; c++) y[(size_t)c * n + j] *= (float)g;
    }
    free(h);
    if (20 * log10(most) < worst) worst = 20 * log10(most);
  }
  return worst;
}

/** The finish. x: planar, 48 kHz. flags: bit 0 rumble filter, 1 expander, 2 EQ, 3 compressor, 4 de-esser, 5 loudness + peak
 *  (all = 63). target: LUFS as heard on two speakers (−16); ceiling: dBTP (−1.5). report[8] ← loudness before (as heard
 *  on two speakers), after, true peak after, the
 *  expander's mean reduction while the sound is below its threshold (dB), the compressor's largest reduction, the
 *  de-esser's largest, the gain of the loudness step (dB), the limiter's largest reduction. Returns a new buffer (a_free). */
API float *a_studio_finish(const float *x, uint32_t n, uint32_t ch, uint32_t flags, double target, double ceiling, double *report) {
  if (!ch || ch > 8) return fail("bad channel count");
  float *y = malloc((size_t)n * ch * sizeof(float) + 4), *env = malloc((size_t)n * sizeof(float) + 4);
  if (!y || !env) { free(y); free(env); return fail("out of memory"); }
  memcpy(y, x, (size_t)n * ch * sizeof(float));
  for (int k = 0; k < 8; k++) report[k] = 0;
  const double dm = ch == 1 ? 10 * log10(2.0) : 0; // a mono sound as heard on two speakers (BS.1770's dual mono)
  report[0] = a_loudness(x, n, ch) + dm;
  // 1. rumble: 4th-order Butterworth high-pass at 75 Hz (wind, traffic's rumble, handling noise; a deep voice starts above)
  if (flags & 1) { const bq_t hp[2] = { bq_hp(75, 0.54119610, 48000), bq_hp(75, 1.30656296, 48000) }; for (uint32_t c = 0; c < ch; c++) bq_apply(y + (size_t)c * n, n, hp, 2); }
  const double speech = a_loudness(y, n, ch); // the voice's level: the gated loudness is the level of the words
  const int voiced = isfinite(speech);
  // 2. expander: below the voice's level − 25 dB the sound is lowered 1 dB for every dB further down, by at most 10 dB;
  //    opens in 2 ms, holds 60 ms, closes over 150 ms
  if ((flags & 2) && voiced) {
    level_db(y, n, ch, 10, env);
    const double thr = speech - SP[5], ao = coef(2), ac = coef(150);
    const uint32_t hold = 60 * 48;
    double g = 0, sumr = 0; uint32_t cnt = 0, held = 0;
    for (uint32_t i = 0; i < n; i++) {
      double want = env[i] < thr ? env[i] - thr : 0;
      if (want < -10) want = -10;
      if (want >= g) { g = ao * g + (1 - ao) * want; held = hold; }
      else if (held) held--;
      else g = ac * g + (1 - ac) * want;
      const float lin = expf((float)g * 0.11512925f); // 10^(g / 20)
      for (uint32_t c = 0; c < ch; c++) y[(size_t)c * n + i] *= lin;
      if (want < 0) { sumr += g; cnt++; }
    }
    report[3] = cnt ? sumr / cnt : 0;
  }
  // 3. warmth and presence: +3 dB below 160 Hz (body), −3 dB at 350 Hz (boxiness), +3 dB at 3.5 kHz (clarity), +2.25 dB
  //    above 10 kHz (air)
  if (flags & 4) {
    const double e = SP[4];
    const bq_t eq[4] = { bq_shelf(160, 3 * e, 48000, 0), bq_peak(350, 1.0, -3 * e, 48000), bq_peak(3500, 0.8, 3 * e, 48000), bq_shelf(10000, 2.25 * e, 48000, 1) };
    for (uint32_t c = 0; c < ch; c++) bq_apply(y + (size_t)c * n, n, eq, 4);
  }
  // 4. compressor: 3 : 1 above the voice's level − 6 dB (6 dB soft knee), 5 ms attack, 100 ms release, channels linked
  if ((flags & 8) && voiced) {
    level_db(y, n, ch, 5, env);
    const double thr = speech + SP[0], knee = 6, ratio = SP[1], aa = coef(SP[2]), ar = coef(SP[3]);
    double g = 0, most = 0;
    for (uint32_t i = 0; i < n; i++) {
      const double over = env[i] - thr;
      double want = over <= -knee / 2 ? 0 : over >= knee / 2 ? -(over) * (1 - 1 / ratio) : -(1 - 1 / ratio) * (over + knee / 2) * (over + knee / 2) / (2 * knee);
      g = want < g ? aa * g + (1 - aa) * want : ar * g + (1 - ar) * want;
      if (g < most) most = g;
      const float lin = expf((float)g * 0.11512925f);
      for (uint32_t c = 0; c < ch; c++) y[(size_t)c * n + i] *= lin;
    }
    report[4] = most;
  }
  // 5. de-esser: the band above 6 kHz lowered while it holds more than −8 dB of the sound's energy (an "s"), by up to 8 dB
  if ((flags & 16) && voiced) {
    const bq_t lp = bq_lp(6000, 0.70710678, 48000);
    float *hi = malloc((size_t)n * ch * sizeof(float) + 4);
    if (hi) {
      for (uint32_t c = 0; c < ch; c++) {
        bqs_t s = { 0 };
        const float *p = y + (size_t)c * n; float *q = hi + (size_t)c * n;
        for (uint32_t i = 0; i < n; i++) q[i] = p[i] - (float)bq_run(&lp, &s, p[i]);
      }
      float *ehi = malloc((size_t)n * sizeof(float) + 4);
      if (ehi) {
        level_db(y, n, ch, 3, env); level_db(hi, n, ch, 3, ehi);
        const double aa = coef(1), ar = coef(40);
        double g = 0, most = 0;
        for (uint32_t i = 0; i < n; i++) {
          double want = -(ehi[i] - env[i] + 8);
          if (want > 0) want = 0;
          if (want < -8) want = -8;
          if (env[i] < speech - 30) want = 0; // not in the pauses
          g = want < g ? aa * g + (1 - aa) * want : ar * g + (1 - ar) * want;
          if (g < most) most = g;
          const float k = 1.f - expf((float)g * 0.11512925f);
          for (uint32_t c = 0; c < ch; c++) y[(size_t)c * n + i] -= k * hi[(size_t)c * n + i];
        }
        report[5] = most;
        free(ehi);
      }
      free(hi);
    }
  }
  // 6. loudness to `target`, then the true peak held at `ceiling`: a 4× oversampled look-ahead limiter (1.5 ms window,
  //    80 ms release) — the gain at every sample is at most what that sample's peak allows
  if (flags & 32) {
    tp_init();
    const double cap = pow(10, ceiling / 20);
    // the limiter lowers the loudness a little: measured again and brought back, at most four times
    for (int it = 0; it < 4; it++) {
      const double L = a_loudness(y, n, ch) + dm;
      if (!isfinite(L)) break;
      const double gain = target - L;
      if (it > 0 && fabs(gain) < 0.1) break;
      report[6] += gain;
      const float lin = (float)pow(10, gain / 20);
      for (size_t i = 0; i < (size_t)n * ch; i++) y[i] *= lin;
      const double most = limit(y, n, ch, cap, env, 72, 80);
      if (most < report[7]) report[7] = most;
    }
  }
  for (size_t i = 0; i < (size_t)n * ch; i++) y[i] = clampf(y[i]);
  report[1] = a_loudness(y, n, ch) + dm;
  report[2] = a_true_peak(y, n, ch);
  free(env);
  g_outlen = n;
  return y;
}
