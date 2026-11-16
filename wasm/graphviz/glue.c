// SuperTools Graphviz glue: lay out one DOT graph with a chosen engine and render it (svg, json, plain, xdot, dot…).
// gv_render(src, engine, format) → 0 ok, 1 syntax error, 2 layout failed, 3 render failed; text in gv_out, messages
// (errors and warnings, one per line) in gv_err.
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <gvc/gvc.h>
#include <gvc/gvplugin.h>
#define EXPORT __attribute__((visibility("default")))

extern gvplugin_library_t gvplugin_dot_layout_LTX_library, gvplugin_neato_layout_LTX_library, gvplugin_core_LTX_library;
lt_symlist_t lt_preloaded_symbols[] = {
  { "gvplugin_dot_layout_LTX_library", &gvplugin_dot_layout_LTX_library },
  { "gvplugin_neato_layout_LTX_library", &gvplugin_neato_layout_LTX_library },
  { "gvplugin_core_LTX_library", &gvplugin_core_LTX_library },
  { 0, 0 } };

static char *out; static size_t olen;
static char *errs; static size_t elen, ecap;
static int errf(char *msg) {
  size_t n = strlen(msg);
  if (elen + n + 1 > ecap) { ecap = (elen + n + 1) * 2; errs = realloc(errs, ecap); }
  memcpy(errs + elen, msg, n); elen += n; errs[elen] = 0; return 0;
}
EXPORT void *gv_alloc(uint32_t n) { return malloc(n ? n : 1); }
EXPORT void gv_free(void *p) { free(p); }
EXPORT const char *gv_out(void) { return out ? out : ""; }
EXPORT uint32_t gv_out_len(void) { return (uint32_t)olen; }
EXPORT const char *gv_err(void) { return errs ? errs : ""; }
EXPORT uint32_t gv_err_len(void) { return (uint32_t)elen; }
static char *keep[3];   // Graphviz may keep pointers to the engine/format names (and messages to the source) after a
                        // call; our own copies live until the next call, so the caller can free its buffers at once.
EXPORT int gv_render(const char *src_, const char *engine_, const char *format_) {
  for (int i = 0; i < 3; i++) free(keep[i]);
  const char *src = keep[0] = strdup(src_), *engine = keep[1] = strdup(engine_), *format = keep[2] = strdup(format_);
  // a fresh context per call: an error in one graph must not leave state (e.g. a pending job) behind for the next
  agseterrf(errf); agseterr(AGWARN);
  GVC_t *gvc = gvContextPlugins(lt_preloaded_symbols, 0);
  free(out); out = NULL; olen = 0; elen = 0; if (errs) errs[0] = 0;
  agreseterrors();
  Agraph_t *g = agmemread(src);
  if (!g) { gvFreeContext(gvc); if (!elen) errf("Error: syntax error in the graph\n"); return 1; }
  if (gvLayout(gvc, g, engine) != 0) { agclose(g); gvFreeContext(gvc); if (!elen) errf("Error: layout failed\n"); return 2; }
  char *r = NULL; size_t n = 0;
  int rc = gvRenderData(gvc, g, format, &r, &n);
  if (rc == 0 && r) { out = malloc(n + 1); memcpy(out, r, n); out[n] = 0; olen = n; }
  gvFreeRenderData(r);
  gvFreeLayout(gvc, g); agclose(g); gvFreeContext(gvc);
  return rc == 0 ? 0 : 3;
}
