The diagram editor of SuperUtils' Diagram Editor tab
=====================================================

This folder holds draw.io 32.7.7 (https://github.com/jgraph/drawio, the release file draw.war of 25 November 2026),
the work of draw.io Ltd (formerly JGraph) and draw.io AG. SuperUtils serves it from its own site; it is not affiliated
with, endorsed or sponsored by draw.io ("draw.io" is a registered trademark of draw.io Ltd).

Licences
- The source code: Apache License 2.0 (LICENSE in this folder, as in the repository at the tag v32.7.7).
- The icon sets and stencil libraries: as the repository's README and img/LICENSE, shapes/LICENSE and stencils/LICENSE
  say (they may not be used in or with Atlassian products; diagrams made with them are not restricted).
- The diagram templates (templates/): Creative Commons Attribution 4.0 International (templates/LICENSE) — by draw.io
  Ltd and draw.io AG.
- libavoid (js/libavoid-js/, Adaptagrams): GNU LGPL 2.1 (js/libavoid-js/LICENSE). Other libraries bundled by draw.io
  keep their own notices inside its files.

What SuperUtils changed (Apache License 2.0, section 4(b))
- index.html: written anew from draw.io's (it says how, at its top): a Content-Security-Policy, our script before
  draw.io's, the hosted site's meta tags, links and the loading screen's logo left out.
- js/PreConfig.js: in place of draw.io's — no export server, no error reports, no news, no plugins from other sites.
- js/PostConfig.js: draw.io's two lines, and a handle on the editor for the tab (to open Visio and Gliffy files).
- js/superutils-frame.js: ours — storage only while the page is open; no database, cache, cookies or service worker.
- Left out of the release file: the cloud integrations (js/integrate.min.js), the stand-alone viewers, the unminified
  sources, the other 60 languages, the Java server's files, the service worker, live collaboration, the hosted site's
  other pages and the plugins that talk to other services.

Written by scripts/fetch-drawio.mjs of the SuperUtils repository (https://github.com/ddastoor/utils), which fetches the
release file at build time and checks it against its SHA-256.
