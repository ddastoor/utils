// SuperTools Graphviz glue: lay out one DOT graph with a chosen engine and write it in one or more formats.
//   gv_layout(src, engine, index) → 0 ok, 1 no graph could be read, 2 layout failed   (the graph stays laid out)
//                                   index = which graph of the text (from 0; the last one if there are fewer)
//   gv_format(format)             → 0 ok, 3 render failed; the text is in gv_out (svg, json, plain, xdot, dot, canon …)
//   gv_done()                     → frees the graph and its layout
//   gv_count(what)                → nodes, edges, directed?, subgraphs of the laid-out graph; graphs in the text, graph drawn
//   gv_engine()                   → the engine that laid the graph out: a graph's own layout attribute decides, as it
//                                   does for the dot program (there it wins over -K)
//   gv_render(src, engine, format) = the first graph, one format, all in one call
// Messages (errors and warnings, one per line) collect in gv_err from gv_layout on.
// A fresh GVC context per graph: an error in one graph must not leave state (a pending job) behind for the next.
//
// Several graphs in one text are read as the dot program reads a file: a line at a time, one graph after the other
// (so a graph that starts on the line on which the one before it ends is not seen — as with dot). Graphviz counts the
// lines of every graph from 1; the messages here name the line of the whole text.
//
// The text arrives as UTF-8 whatever the graph says (the tab decodes a file before it gets here), so a charset
// attribute that names something else is set to UTF-8: Graphviz would otherwise convert the text a second time.
//
// Text is measured by the host when it can: Graphviz asks its "textlayout" plugin for the size of every piece of
// text, and the one below hands the question to the import supertools.text_width (the tab's worker measures with the
// fonts the browser will draw the SVG with). When the host answers with a negative number — as the unit harness
// does — Graphviz falls back to its built-in font tables, exactly like a native build without Pango.
#include "config.h"
#include <stdio.h>
#include <strings.h>
#include <cgraph/cgraph.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <gvc/gvc.h>
#include <gvc/gvplugin.h>
#include <gvc/gvplugin_textlayout.h>
#include <common/const.h>
#include <common/textspan.h>
#define EXPORT __attribute__((visibility("default")))

__attribute__((import_module("supertools"), import_name("text_width")))
extern double st_text_width(const char *family, const char *weight, const char *style, const char *stretch, double size, const char *text);

// the font the SVG renderer will name for this span (gvrender_core_svg.c, svg_textspan): family[,svg family], weight, style
static bool st_textlayout(textspan_t *span, char **fontpath) {
  textfont_t *font = span->font;
  PostscriptAlias *pa = font->postscript_alias;
  char family[512];
  const char *weight = "", *style = "", *stretch = "";
  if (pa) {
    snprintf(family, sizeof family, "%s%s%s", pa->family ? pa->family : font->name, pa->svg_font_family ? "," : "", pa->svg_font_family ? pa->svg_font_family : "");
    if (pa->weight) weight = pa->weight;
    if (pa->style) style = pa->style;
    if (pa->stretch) stretch = pa->stretch;
  } else snprintf(family, sizeof family, "%s", font->name);
  if ((font->flags & HTML_BF) && !*weight) weight = "bold";
  if ((font->flags & HTML_IF) && !*style) style = "italic";
  double width = st_text_width(family, weight, style, stretch, font->size, span->str ? span->str : "");
  if (!(width >= 0)) return false;                 // the host does not measure: Graphviz's own tables
  span->size.x = width;
  span->size.y = font->size * LINESPACING;         // the rest as estimate_textspan_size() sets it
  span->yoffset_layout = 0.0;
  span->yoffset_centerline = 0.1 * font->size;
  span->layout = NULL;
  span->free_layout = NULL;
  if (fontpath) *fontpath = "[host]";
  return true;
}
static gvtextlayout_engine_t st_textlayout_engine = { st_textlayout };
static gvplugin_installed_t st_textlayout_types[] = { { 0, "textlayout", 10, &st_textlayout_engine, NULL }, { 0, NULL, 0, NULL, NULL } };
static gvplugin_api_t st_apis[] = { { API_textlayout, st_textlayout_types }, { (api_t)0, 0 } };
static gvplugin_library_t st_library = { "supertools", st_apis };

extern gvplugin_library_t gvplugin_dot_layout_LTX_library, gvplugin_neato_layout_LTX_library, gvplugin_core_LTX_library;
lt_symlist_t lt_preloaded_symbols[] = {
  { "gvplugin_dot_layout_LTX_library", &gvplugin_dot_layout_LTX_library },
  { "gvplugin_neato_layout_LTX_library", &gvplugin_neato_layout_LTX_library },
  { "gvplugin_core_LTX_library", &gvplugin_core_LTX_library },
  { "gvplugin_supertools_LTX_library", &st_library },
  { 0, 0 } };

static char *out; static size_t olen;
static char *errs; static size_t elen, ecap;
static int line_offset;   // lines of the text in front of the graph that is being read
static void erradd(const char *msg, size_t n) {
  if (elen + n + 1 > ecap) { ecap = (elen + n + 1) * 2; errs = realloc(errs, ecap); }
  memcpy(errs + elen, msg, n); elen += n; errs[elen] = 0;
}
static int errf(char *msg) {
  // "… in line 3 …" of the graph → the line of the whole text
  const char *at = line_offset ? strstr(msg, " in line ") : NULL;
  if (at && at[9] >= '0' && at[9] <= '9') {
    char *end; long n = strtol(at + 9, &end, 10); char num[24];
    erradd(msg, (size_t)(at + 9 - msg));
    erradd(num, (size_t)snprintf(num, sizeof num, "%ld", n + line_offset));
    erradd(end, strlen(end));
  } else erradd(msg, strlen(msg));
  return 0;
}
// a line at a time, like cgraph's own readers (lib/cgraph/io.c); the position stays for the next graph
typedef struct { const char *data; size_t len, cur; } st_rdr;
static int st_read(void *chan, char *buf, int bufsize) {
  st_rdr *r = chan; int n = 0;
  while (n < bufsize && r->cur < r->len) { char c = r->data[r->cur++]; buf[n++] = c; if (c == '\n') break; }
  return n;
}
static Agiodisc_t st_io;
EXPORT void *gv_alloc(uint32_t n) { return malloc(n ? n : 1); }
EXPORT void gv_free(void *p) { free(p); }
EXPORT const char *gv_out(void) { return out ? out : ""; }
EXPORT uint32_t gv_out_len(void) { return (uint32_t)olen; }
EXPORT const char *gv_err(void) { return errs ? errs : ""; }
EXPORT uint32_t gv_err_len(void) { return (uint32_t)elen; }
EXPORT const char *gv_version(void) { return PACKAGE_VERSION; }

static GVC_t *gvc; static Agraph_t *graph; static bool laid;
static int n_graphs, drawn;
static char engine_used[64];
EXPORT const char *gv_engine(void) { return engine_used; }
static char *keep[3];   // Graphviz may keep pointers to the source and to the engine and format names after a call;
                        // our own copies live until the next graph, so the caller can free its buffers at once.
EXPORT void gv_done(void) {
  if (graph) { if (laid) gvFreeLayout(gvc, graph); agclose(graph); graph = NULL; }
  if (gvc) { gvFreeContext(gvc); gvc = NULL; }
  laid = false;
}
// what = 0 nodes, 1 edges, 2 directed?, 3 subgraphs of the laid-out graph (-1 without one);
//        4 graphs read from the text, 5 which of them was taken (both stay after gv_done)
EXPORT int gv_count(int what) {
  if (what == 4) return n_graphs;
  if (what == 5) return drawn;
  if (!graph) return -1;
  if (what == 0) return agnnodes(graph);
  if (what == 1) return agnedges(graph);
  if (what == 2) return agisdirected(graph);
  if (what == 3) return agnsubg(graph);
  return -1;
}
EXPORT int gv_layout(const char *src_, const char *engine_, int index) {
  gv_done();
  free(keep[0]); free(keep[1]);
  const char *src = keep[0] = strdup(src_), *engine = keep[1] = strdup(engine_);
  free(out); out = NULL; olen = 0; elen = 0; if (errs) errs[0] = 0;
  n_graphs = 0; drawn = 0; engine_used[0] = 0;
  agseterrf(errf); agseterr(AGWARN);
  gvc = gvContextPlugins(lt_preloaded_symbols, 0);
  agreseterrors();
  st_io.afread = st_read; st_io.putstr = AgIoDisc.putstr; st_io.flush = AgIoDisc.flush;
  Agdisc_t disc = { &AgIdDisc, &st_io };
  st_rdr rdr = { src, strlen(src), 0 };
  size_t counted = 0; int lines = 0;
  for (;;) {
    for (; counted < rdr.cur; counted++) if (src[counted] == '\n') lines++;
    line_offset = lines;
    Agraph_t *g = agread(&rdr, &disc);
    if (!g) break;                                   // the end of the text, or a graph that cannot be read
    if (n_graphs <= index) { if (graph) agclose(graph); graph = g; drawn = n_graphs; } else agclose(g);
    n_graphs++;
  }
  line_offset = 0;
  if (!graph) { gv_done(); if (!elen) errf("Error: there is no graph in this text\n"); return 1; }
  char *cs = agget(graph, "charset");
  if (cs && *cs && strcasecmp(cs, "UTF-8") && strcasecmp(cs, "UTF8")) agset(graph, "charset", "UTF-8");
  char *own = agget(graph, "layout");
  if (own && *own) engine = own;
  snprintf(engine_used, sizeof engine_used, "%s", engine);
  if (gvLayout(gvc, graph, engine) != 0) { agclose(graph); graph = NULL; gv_done(); if (!elen) errf("Error: layout failed\n"); return 2; }
  laid = true;
  return 0;
}
EXPORT int gv_format(const char *format_) {
  free(out); out = NULL; olen = 0;
  if (!graph || !laid) { errf("Error: no graph is laid out\n"); return 3; }
  free(keep[2]);
  const char *format = keep[2] = strdup(format_);
  char *r = NULL; size_t n = 0;
  int rc = gvRenderData(gvc, graph, format, &r, &n);
  if (rc == 0 && r) { out = malloc(n + 1); memcpy(out, r, n); out[n] = 0; olen = n; }
  gvFreeRenderData(r);
  return rc == 0 ? 0 : 3;
}
EXPORT int gv_render(const char *src, const char *engine, const char *format) {
  int rc = gv_layout(src, engine, 0);
  if (rc) return rc;
  rc = gv_format(format);
  gv_done();
  return rc;
}
