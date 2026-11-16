// SuperTools jq glue: run a jq program over input text like the jq command line, from WebAssembly.
// jq_run(filter, input, flags, args_json) → 0 ok / 2 compile error / 5 runtime error; output (or error text) in jq_out.
// flags: 1 -r raw output, 2 -c compact, 4 -s slurp, 8 -n null input, 16 -S sort keys, 32 --tab, 64 -j join,
//        128 -a ASCII output, 256 -R raw input, 512 -e (exit status from the last output)
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include "jq.h"
#include "jv.h"
#define EXPORT __attribute__((visibility("default")))

static char *buf; static size_t len, cap;
static void put(const char *s, size_t n) { if (len + n + 1 > cap) { cap = (len + n + 1) * 2; buf = realloc(buf, cap); } memcpy(buf + len, s, n); len += n; buf[len] = 0; }
static void puts_(const char *s) { put(s, strlen(s)); }
static char *errs; static size_t elen, ecap;
static void eput(const char *s) { size_t n = strlen(s); if (elen + n + 2 > ecap) { ecap = (elen + n + 2) * 2; errs = realloc(errs, ecap); } memcpy(errs + elen, s, n); elen += n; errs[elen++] = '\n'; errs[elen] = 0; }
static void err_cb(void *data, jv msg) {
  (void)data;
  if (jv_get_kind(msg) == JV_KIND_STRING) eput(jv_string_value(msg));
  else { jv s = jv_dump_string(jv_copy(msg), 0); eput(jv_string_value(s)); jv_free(s); }
  jv_free(msg);
}
EXPORT void *jq_alloc(uint32_t n) { return malloc(n ? n : 1); }
EXPORT void jq_dealloc(void *p) { free(p); }
EXPORT const char *jq_out(void) { return buf ? buf : ""; }
EXPORT uint32_t jq_out_len(void) { return (uint32_t)len; }
EXPORT const char *jq_err(void) { return errs ? errs : ""; }
EXPORT uint32_t jq_err_len(void) { return (uint32_t)elen; }

static int dumpflags;
static int last_truthy = -1;
static void eput2(const char *a, const char *b) { size_t n = strlen(a) + strlen(b) + 1; char *t = malloc(n); strcpy(t, a); strcat(t, b); eput(t); free(t); }

// Input source shared by the main loop and jq's `input`/`inputs` builtins (as jq_util_input does for the CLI).
static struct { const char *s; uint32_t n, pos; int flags, done, bad; jv_parser *p; } in;
static jv next_input(jq_state *jq, void *data) {
  (void)jq; (void)data;
  if (in.done || in.bad) return jv_invalid();
  int f = in.flags;
  if (f & 256) {                                    // -R: lines as strings, or the whole text with -s
    if (f & 4) { in.done = 1; return jv_string_sized(in.s, (int)in.n); }
    if (in.pos >= in.n) { in.done = 1; return jv_invalid(); }
    uint32_t e = in.pos; while (e < in.n && in.s[e] != '\n') e++;
    jv r = jv_string_sized(in.s + in.pos, (int)(e - in.pos)); in.pos = e + 1; return r;
  }
  if (f & 4) {                                      // -s: every value in one array
    in.done = 1; jv a = jv_array(), v;
    while (jv_is_valid(v = jv_parser_next(in.p))) a = jv_array_append(a, v);
    if (jv_invalid_has_msg(jv_copy(v))) { jv m = jv_invalid_get_msg(v); eput2("jq: parse error (input): ", jv_string_value(m)); jv_free(m); jv_free(a); in.bad = 1; return jv_invalid(); }
    jv_free(v); return a;
  }
  jv v = jv_parser_next(in.p);
  if (jv_is_valid(v)) return v;
  if (jv_invalid_has_msg(jv_copy(v))) { jv m = jv_invalid_get_msg(v); eput2("jq: parse error (input): ", jv_string_value(m)); jv_free(m); in.bad = 1; return jv_invalid(); }
  jv_free(v); in.done = 1; return jv_invalid();
}

static int process(jq_state *jq, jv value, int flags) {
  int ret = 0;
  jq_start(jq, value, 0);
  jv r;
  while (jv_is_valid(r = jq_next(jq))) {
    last_truthy = !(jv_get_kind(r) == JV_KIND_NULL || jv_get_kind(r) == JV_KIND_FALSE);
    if ((flags & 1) && jv_get_kind(r) == JV_KIND_STRING) { int l = jv_string_length_bytes(jv_copy(r)); put(jv_string_value(r), (size_t)l); jv_free(r); }
    else { jv s = jv_dump_string(r, dumpflags); puts_(jv_string_value(s)); jv_free(s); }
    if (!(flags & 64)) put("\n", 1);
  }
  if (jq_halted(jq)) {
    jv code = jq_get_exit_code(jq), msg = jq_get_error_message(jq);
    if (jv_get_kind(msg) == JV_KIND_STRING) eput(jv_string_value(msg));   // halt_error: the string goes to stderr as-is
    else if (jv_is_valid(msg) && jv_get_kind(msg) != JV_KIND_NULL) { jv s = jv_dump_string(jv_copy(msg), 0); eput(jv_string_value(s)); jv_free(s); }
    ret = jv_get_kind(code) == JV_KIND_NUMBER ? (int)jv_number_value(code) : (jv_is_valid(code) ? 5 : 0);
    jv_free(code); jv_free(msg); jv_free(r);
    return ret ? ret : -1;
  }
  if (jv_invalid_has_msg(jv_copy(r))) {
    jv m = jv_invalid_get_msg(jv_copy(r));
    if (jv_get_kind(m) == JV_KIND_STRING) eput2("jq: error: ", jv_string_value(m));
    else { jv s = jv_dump_string(jv_copy(m), 0); eput2("jq: error (not a string): ", jv_string_value(s)); jv_free(s); }
    jv_free(m); jv_free(r);
    return 5;
  }
  jv_free(r);
  return 0;
}
EXPORT int jq_run(const char *filter, const char *input, uint32_t ilen, int flags, const char *args_json) {
  len = 0; elen = 0; if (buf) buf[0] = 0; if (errs) errs[0] = 0; last_truthy = -1;
  dumpflags = (flags & 2) ? 0 : ((flags & 32) ? JV_PRINT_TAB | JV_PRINT_PRETTY : JV_PRINT_INDENT_FLAGS(2));
  if (flags & 16) dumpflags |= JV_PRINT_SORTED;
  if (flags & 128) dumpflags |= JV_PRINT_ASCII;
  jq_state *jq = jq_init();
  if (!jq) { eput("jq: out of memory"); return 2; }
  jq_set_error_cb(jq, err_cb, NULL);
  jv args = (args_json && *args_json) ? jv_parse(args_json) : jv_object();
  if (!jv_is_valid(args)) { jv_free(args); args = jv_object(); }
  jv ARGS = JV_OBJECT(jv_string("positional"), jv_array(), jv_string("named"), jv_copy(args));   // $ARGS, as main.c
  args = jv_object_set(args, jv_string("ARGS"), ARGS);
  if (!jq_compile_args(jq, filter, args)) { jq_teardown(&jq); if (!elen) eput("jq: compile error"); return 3; }
  in.s = input; in.n = ilen; in.pos = 0; in.flags = flags; in.done = 0; in.bad = 0;
  in.p = (flags & 256) ? NULL : jv_parser_new(0);
  if (in.p) jv_parser_set_buf(in.p, input, (int)ilen, 0);
  jq_set_input_cb(jq, next_input, NULL);
  int ret = 0;
  if (flags & 8) ret = process(jq, jv_null(), flags);
  else { jv v; while (jv_is_valid(v = next_input(jq, NULL))) { int r = process(jq, v, flags); if (r) { ret = r; if (r != 5) break; } } jv_free(v); }
  if (in.bad && !ret) ret = 2;
  jq_teardown(&jq);
  if (in.p) { jv_parser_free(in.p); in.p = NULL; }
  if (ret == 0 && (flags & 512)) ret = last_truthy == 1 ? 0 : last_truthy == 0 ? 1 : 4;
  return ret < 0 ? 0 : ret;
}
