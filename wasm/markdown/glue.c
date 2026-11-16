/* Markdown → HTML with cmark-gfm (GitHub Flavored Markdown: tables, strikethrough, autolinks, task lists, tag filter,
 * footnotes). Raw HTML and dangerous URLs (javascript:, vbscript:, file:, data: except images) are suppressed unless
 * the caller passes MD_UNSAFE — the app never does. */
#include <stdlib.h>
#include <string.h>
#include "cmark-gfm.h"
#include "cmark-gfm-core-extensions.h"

#define API __attribute__((visibility("default")))
enum { MD_SMART = 1, MD_HARDBREAKS = 2, MD_FOOTNOTES = 4, MD_UNSAFE = 8, MD_SOURCEPOS = 16 };

API void *md_malloc(int n) { return malloc(n > 0 ? (size_t)n : 1); }
API void md_free(void *p) { free(p); }

static int ready;
/* Returns a malloc'd NUL-terminated HTML string (free with md_free); its length goes to *outlen. */
API char *md_html(const char *src, int len, int flags, int *outlen) {
  if (!ready) { cmark_gfm_core_extensions_ensure_registered(); ready = 1; }
  int opts = CMARK_OPT_DEFAULT | CMARK_OPT_GITHUB_PRE_LANG | CMARK_OPT_TABLE_PREFER_STYLE_ATTRIBUTES;
  if (flags & MD_SMART) opts |= CMARK_OPT_SMART;
  if (flags & MD_HARDBREAKS) opts |= CMARK_OPT_HARDBREAKS;
  if (flags & MD_FOOTNOTES) opts |= CMARK_OPT_FOOTNOTES;
  if (flags & MD_UNSAFE) opts |= CMARK_OPT_UNSAFE;
  if (flags & MD_SOURCEPOS) opts |= CMARK_OPT_SOURCEPOS;
  cmark_parser *p = cmark_parser_new(opts);
  static const char *exts[] = { "table", "strikethrough", "autolink", "tagfilter", "tasklist", 0 };
  for (int i = 0; exts[i]; i++) { cmark_syntax_extension *e = cmark_find_syntax_extension(exts[i]); if (e) cmark_parser_attach_syntax_extension(p, e); }
  cmark_parser_feed(p, src, (size_t)len);
  cmark_node *doc = cmark_parser_finish(p);
  char *html = cmark_render_html(doc, opts, cmark_parser_get_syntax_extensions(p));
  cmark_node_free(doc);
  cmark_parser_free(p);
  *outlen = (int)strlen(html);
  return html;
}
API const char *md_version(void) { return cmark_version_string(); }
