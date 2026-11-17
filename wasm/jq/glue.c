// SuperTools jq glue: run a jq program over input text exactly like the jq command line
//   jq <flags> [--arg / --argjson …] '<filter>' input.json
// from WebAssembly. It follows jq 1.8.2's own src/main.c step by step — the same input reader (jq_util_input, so
// `input`, `inputs`, `input_filename`, `input_line_number` and the "at input.json:3" positions in messages work), the
// same messages and the same exit status: 0 ok, 2 system, 3 the filter does not compile, 5 error (a filter error or
// input that is not JSON), 1 / 4 with -e, halt_error's own code. What main.c writes to stdout is in jq_out, what it
// writes to stderr in jq_err.
// flags: 1 -r raw output, 2 -c compact, 4 -s slurp, 8 -n null input, 16 -S sort keys, 32 --tab, 64 -j join,
//        128 -a ASCII output, 256 -R raw input, 512 -e (exit status from the last output)
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdio.h>
#include <errno.h>
#include "jq.h"
#include "jv.h"
#include "config_opts.inc"
#define EXPORT __attribute__((visibility("default")))
enum { JQ_OK = 0, JQ_OK_NULL_KIND = -1, JQ_ERROR_SYSTEM = 2, JQ_ERROR_COMPILE = 3, JQ_OK_NO_OUTPUT = -4, JQ_ERROR_UNKNOWN = 5 };   // main.c
enum { RAW_OUTPUT = 1, COMPACT = 2, SLURP = 4, PROVIDE_NULL = 8, SORTED_OUTPUT = 16, TAB = 32, RAW_NO_LF = 64, ASCII_OUTPUT = 128, RAW_INPUT = 256, EXIT_STATUS = 512 };
#define INPUT_NAME "input.json"

static char *buf; static size_t len, cap;                       // stdout
static void put(const char *s, size_t n) { if (len + n + 1 > cap) { cap = (len + n + 1) * 2; buf = realloc(buf, cap); } memcpy(buf + len, s, n); len += n; buf[len] = 0; }
static char *errs; static size_t elen, ecap;                    // stderr
static void eput(const char *s, size_t n) { if (elen + n + 1 > ecap) { ecap = (elen + n + 1) * 2; errs = realloc(errs, ecap); } memcpy(errs + elen, s, n); elen += n; errs[elen] = 0; }
static void eline(const char *a, const char *b, const char *c) { eput(a, strlen(a)); eput(b, strlen(b)); eput(c, strlen(c)); eput("\n", 1); }
// compile errors and other messages jq reports through its error callback (main.c's default prints them to stderr)
static void err_cb(void *data, jv msg) {
  (void)data;
  if (jv_get_kind(msg) == JV_KIND_STRING) eline(jv_string_value(msg), "", "");
  else { jv s = jv_dump_string(jv_copy(msg), 0); eline(jv_string_value(s), "", ""); jv_free(s); }
  jv_free(msg);
}
// `debug` → ["DEBUG:",value] on stderr; `stderr` → the string as it is, anything else as compact JSON (main.c)
static void debug_cb(void *data, jv input) {
  (void)data;
  jv s = jv_dump_string(JV_ARRAY(jv_string("DEBUG:"), input), 0); eline(jv_string_value(s), "", ""); jv_free(s);
}
static void stderr_cb(void *data, jv input) {
  (void)data;
  if (jv_get_kind(input) == JV_KIND_STRING) eput(jv_string_value(input), (size_t)jv_string_length_bytes(jv_copy(input)));
  else { jv s = jv_dump_string(jv_copy(input), 0); eput(jv_string_value(s), strlen(jv_string_value(s))); jv_free(s); }
  jv_free(input);
}
EXPORT void *jq_alloc(uint32_t n) { return malloc(n ? n : 1); }
EXPORT void jq_dealloc(void *p) { free(p); }
EXPORT const char *jq_out(void) { return buf ? buf : ""; }
EXPORT uint32_t jq_out_len(void) { return (uint32_t)len; }
EXPORT const char *jq_err(void) { return errs ? errs : ""; }
EXPORT uint32_t jq_err_len(void) { return (uint32_t)elen; }

// jq's input reader opens its files with fopen(); build.sh compiles jq with fopen → jq_mem_fopen (memfile.h), and the
// only file there is, input.json, is the text the page passed in.
static const char *in_text; static size_t in_len; static FILE *in_file;
FILE *jq_mem_fopen(const char *name, const char *mode) {
  if (strcmp(name, INPUT_NAME) || !in_text || in_file) { errno = ENOENT; return NULL; }
  return in_file = fmemopen((void *)in_text, in_len, mode);
}
int jq_mem_fclose(FILE *f) { if (f == in_file) in_file = NULL; return fclose(f); }
static void open_err(void *data, const char *fname) { (void)data; eline("jq: error: Could not open file ", fname, ": No such file or directory"); }

// A filter such as repeat(1) or recurse without an end produces output for ever: stop once this much has been written.
#define OUT_MAX (16u << 20)
static int over;

static int process(jq_state *jq, jv value, int dumpopts, int options) {
  int ret = JQ_OK_NO_OUTPUT;
  jq_start(jq, value, 0);
  jv result;
  while (jv_is_valid(result = jq_next(jq))) {
    if ((options & RAW_OUTPUT) && jv_get_kind(result) == JV_KIND_STRING) {
      if (options & ASCII_OUTPUT) { jv s = jv_dump_string(jv_copy(result), JV_PRINT_ASCII); put(jv_string_value(s), strlen(jv_string_value(s))); jv_free(s); }
      else put(jv_string_value(result), (size_t)jv_string_length_bytes(jv_copy(result)));
      ret = JQ_OK;
      jv_free(result);
    } else {
      ret = (jv_get_kind(result) == JV_KIND_FALSE || jv_get_kind(result) == JV_KIND_NULL) ? JQ_OK_NULL_KIND : JQ_OK;
      jv s = jv_dump_string(result, dumpopts); put(jv_string_value(s), strlen(jv_string_value(s))); jv_free(s);
    }
    if (!(options & RAW_NO_LF)) put("\n", 1);
    if (len > OUT_MAX) { over = 1; return ret; }
  }
  if (jq_halted(jq)) {                                          // `halt` or `halt_error`
    jv exit_code = jq_get_exit_code(jq);
    if (!jv_is_valid(exit_code)) ret = JQ_OK;
    else if (jv_get_kind(exit_code) == JV_KIND_NUMBER) ret = (int)jv_number_value(exit_code);
    else ret = JQ_ERROR_UNKNOWN;
    jv_free(exit_code);
    jv msg = jq_get_error_message(jq);
    if (jv_get_kind(msg) == JV_KIND_STRING) eput(jv_string_value(msg), (size_t)jv_string_length_bytes(jv_copy(msg)));   // no prefix, no new line
    else if (jv_get_kind(msg) == JV_KIND_NULL) { }
    else if (jv_is_valid(msg)) { jv s = jv_dump_string(jv_copy(msg), 0); eline(jv_string_value(s), "", ""); jv_free(s); }
    jv_free(msg);
  } else if (jv_invalid_has_msg(jv_copy(result))) {             // an error nobody caught
    jv msg = jv_invalid_get_msg(jv_copy(result));
    jv pos = jq_util_input_get_position(jq);
    eput("jq: error (at ", 14); eput(jv_string_value(pos), strlen(jv_string_value(pos)));
    if (jv_get_kind(msg) == JV_KIND_STRING) eline("): ", jv_string_value(msg), "");
    else { msg = jv_dump_string(msg, 0); eline(") (not a string): ", jv_string_value(msg), ""); }
    ret = JQ_ERROR_UNKNOWN;
    jv_free(pos); jv_free(msg);
  }
  jv_free(result);
  return ret;
}
EXPORT int jq_run(const char *filter, const char *input, uint32_t ilen, int options, const char *args_json) {
  len = 0; elen = 0; if (buf) buf[0] = 0; if (errs) errs[0] = 0; over = 0;
  int ret = JQ_OK_NO_OUTPUT, last_result = -1;
  // on the command line the later of -c and --tab wins; the page lists -c first, so here Compact wins as well
  int dumpopts = (options & COMPACT) ? 0 : (options & TAB) ? JV_PRINT_TAB | JV_PRINT_PRETTY : JV_PRINT_INDENT_FLAGS(2);
  if (options & SORTED_OUTPUT) dumpopts |= JV_PRINT_SORTED;
  if (options & ASCII_OUTPUT) dumpopts |= JV_PRINT_ASCII;
  if (options & RAW_NO_LF) options |= RAW_OUTPUT;               // -j implies -r
  jq_state *jq = jq_init();
  if (!jq) { eline("jq: error: out of memory", "", ""); return JQ_ERROR_SYSTEM; }
  jq_set_error_cb(jq, err_cb, NULL);
  jq_set_attr(jq, jv_string("JQ_LIBRARY_PATH"), JV_ARRAY(jv_string("~/.jq"), jv_string("$ORIGIN/../lib/jq"), jv_string("$ORIGIN/../lib")));
  jq_set_attr(jq, jv_string("JQ_ORIGIN"), jv_string("."));
  jq_set_attr(jq, jv_string("PROGRAM_ORIGIN"), jv_string("."));
  jv named = (args_json && *args_json) ? jv_parse(args_json) : jv_object();
  if (jv_get_kind(named) != JV_KIND_OBJECT) { jv_free(named); named = jv_object(); }
  jv ARGS = JV_OBJECT(jv_string("positional"), jv_array(), jv_string("named"), jv_copy(named));
  named = jv_object_set(named, jv_string("ARGS"), ARGS);
  if (!jv_object_has(jv_copy(named), jv_string("JQ_BUILD_CONFIGURATION")))
    named = jv_object_set(named, jv_string("JQ_BUILD_CONFIGURATION"), jv_string(JQ_CONFIG));
  if (!jq_compile_args(jq, filter, named)) { jq_teardown(&jq); if (!elen) eline("jq: error: the filter does not compile", "", ""); return JQ_ERROR_COMPILE; }

  in_text = input; in_len = ilen;
  jq_util_input_state *st = jq_util_input_init(open_err, NULL);
  jq_util_input_set_parser(st, (options & RAW_INPUT) ? NULL : jv_parser_new(0), (options & SLURP) ? 1 : 0);
  jq_set_input_cb(jq, jq_util_input_next_input_cb, st);
  jq_set_debug_cb(jq, debug_cb, NULL);
  jq_set_stderr_cb(jq, stderr_cb, NULL);
  jq_util_input_add_input(st, INPUT_NAME);

  if (options & PROVIDE_NULL) ret = process(jq, jv_null(), dumpopts, options);
  else {
    jv value;
    while (jq_util_input_errors(st) == 0 && (jv_is_valid((value = jq_util_input_next_input(st))) || jv_invalid_has_msg(jv_copy(value)))) {
      if (jv_is_valid(value)) {
        ret = process(jq, value, dumpopts, options);
        if (ret <= 0 && ret != JQ_OK_NO_OUTPUT) last_result = (ret != JQ_OK_NULL_KIND);
        if (jq_halted(jq) || over) break;
        continue;
      }
      jv msg = jv_invalid_get_msg(value);                       // the input is not JSON
      ret = JQ_ERROR_UNKNOWN;
      eline("jq: parse error: ", jv_string_value(msg), "");
      jv_free(msg);
      break;
    }
  }
  if (jq_util_input_errors(st) != 0) ret = JQ_ERROR_SYSTEM;
  if (over) { eline("jq: stopped after 16 MB of output - this filter may never end (repeat, recurse or range without a limit)", "", ""); ret = JQ_ERROR_UNKNOWN; }
  jq_util_input_free(&st);
  jq_teardown(&jq);
  if (in_file) { fclose(in_file); in_file = NULL; }             // a run that ended before the end of the input (halt, parse error, output limit)
  in_text = NULL;
  if (options & EXIT_STATUS) {
    if (ret != JQ_OK_NO_OUTPUT) return ret < 0 ? -ret : ret;
    return last_result == -1 ? 4 : last_result == 0 ? 1 : 0;
  }
  return ret > 0 ? ret : 0;
}
