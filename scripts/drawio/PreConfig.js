/**
 * Copyright (c) 2006-2024, JGraph Holdings Ltd
 * Copyright (c) 2006-2024, draw.io AG
 *
 * Changed by SuperUtils (2026; Apache License 2.0, section 4(b)): this file takes the place of draw.io's js/PreConfig.js.
 * The editor runs inside SuperUtils' Diagram Editor tab, served from SuperUtils' own site: it fetches nothing from other
 * sites, sends no error reports or usage data, and keeps nothing in the browser — the tab opens and saves the files.
 */
// Overrides of global vars need to be pre-loaded
window.DRAWIO_PUBLIC_BUILD = true;
window.EXPORT_URL = null; // no export server: a PDF is made through the browser's print dialog
window.DRAWIO_BASE_URL = null;
window.DRAWIO_VIEWER_URL = null;
window.DRAWIO_LIGHTBOX_URL = null;
window.DRAW_MATH_URL = 'math4/es5';
window.DRAWIO_LOG_URL = ''; // no error reports
window.NOTIFICATIONS_URL = null; // no news
window.ALLOW_CUSTOM_PLUGINS = false; // no plugins from other sites
window.DRAWIO_CONFIG = null;
urlParams['sync'] = 'manual';
