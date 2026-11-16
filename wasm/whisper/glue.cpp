// whisper.wasm glue (own code, MIT) around whisper.cpp 1.8.3 (MIT). Model bytes are copied into wasm memory by the
// caller and loaded with whisper_init_from_buffer; audio is 16 kHz mono float. Results come back as JSON.
//   w_load(buf, len) → 0 | w_transcribe(pcm, n, prompt, beam, json_out_len*) → malloc'd JSON
//   progress: imported env.w_progress(percent) is called by whisper.cpp while it works.
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include "whisper.h"

#define API extern "C" __attribute__((visibility("default")))
extern "C" __attribute__((import_module("env"), import_name("w_progress"))) void w_progress(int percent);

static whisper_context *g_ctx = nullptr;
static void quiet_log(enum ggml_log_level, const char *, void *) {}

API void *w_malloc(unsigned n) { return malloc(n ? n : 1); }
API void w_free(void *p) { free(p); }
API const char *w_system_info() { return whisper_print_system_info(); }
API int w_load(const void *buf, unsigned len) {
  whisper_log_set(quiet_log, nullptr);
  if (g_ctx) { whisper_free(g_ctx); g_ctx = nullptr; }
  whisper_context_params cp = whisper_context_default_params();
  cp.use_gpu = false;
  cp.flash_attn = false;
  g_ctx = whisper_init_from_buffer_with_params(const_cast<void *>(buf), len, cp);
  return g_ctx ? 0 : -1;
}
API int w_is_multilingual() { return g_ctx ? whisper_is_multilingual(g_ctx) : -1; }
API void w_unload() { if (g_ctx) { whisper_free(g_ctx); g_ctx = nullptr; } }

static void json_str(std::string &o, const char *s) {
  o += '"';
  for (const unsigned char *p = (const unsigned char *)s; *p; p++) {
    if (*p == '"' || *p == '\\') { o += '\\'; o += (char)*p; }
    else if (*p < 0x20) { char b[8]; snprintf(b, sizeof b, "\\u%04x", *p); o += b; }
    else o += (char)*p;
  }
  o += '"';
}
static void on_progress(whisper_context *, whisper_state *, int p, void *) { w_progress(p); }

/** beam = 0: greedy (fastest); beam ≥ 2: beam search of that width (more accurate). */
API char *w_transcribe(const float *pcm, int n, const char *prompt, int beam, unsigned *out_len) {
  if (!g_ctx) return nullptr;
  whisper_full_params p = whisper_full_default_params(beam >= 2 ? WHISPER_SAMPLING_BEAM_SEARCH : WHISPER_SAMPLING_GREEDY);
  p.n_threads = 1;
  p.language = "en";
  p.translate = false;
  p.print_progress = p.print_realtime = p.print_timestamps = p.print_special = false;
  p.no_context = true;
  p.suppress_blank = true;
  p.initial_prompt = prompt && *prompt ? prompt : nullptr;
  if (beam >= 2) p.beam_search.beam_size = beam;
  p.progress_callback = on_progress;
  if (whisper_full(g_ctx, p, pcm, n) != 0) return nullptr;
  std::string o = "{\"segments\":[";
  const int ns = whisper_full_n_segments(g_ctx);
  for (int i = 0; i < ns; i++) {
    if (i) o += ',';
    char b[64]; snprintf(b, sizeof b, "{\"t0\":%lld,\"t1\":%lld,\"text\":", (long long)whisper_full_get_segment_t0(g_ctx, i), (long long)whisper_full_get_segment_t1(g_ctx, i));
    o += b; json_str(o, whisper_full_get_segment_text(g_ctx, i)); o += '}';
  }
  o += "]}";
  char *r = (char *)malloc(o.size() + 1);
  memcpy(r, o.c_str(), o.size() + 1);
  *out_len = (unsigned)o.size();
  return r;
}
