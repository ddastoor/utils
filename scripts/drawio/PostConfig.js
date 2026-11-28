/**
 * Copyright (c) 2006-2024, JGraph Holdings Ltd
 * Copyright (c) 2006-2024, draw.io AG
 *
 * Changed by SuperUtils (2026; Apache License 2.0, section 4(b)): this file takes the place of draw.io's js/PostConfig.js —
 * its two lines, and a handle on the editor (window.superutilsEditor) for SuperUtils' Diagram Editor tab, the page that holds
 * this one (same site): it opens Visio and Gliffy files with draw.io's own importers, which the embed protocol does not reach.
 */
// null'ing of global vars need to be after init.js
window.ICONSEARCH_PATH = null;
window.ICON_SERVICE_PATH = null;
(function () {
  if (typeof EditorUi !== 'function') return;
  ['installMessageHandler', 'updateActionStates'].forEach(function (name) {
    var f = EditorUi.prototype[name];
    if (typeof f !== 'function') return;
    EditorUi.prototype[name] = function () {
      if (window.superutilsEditor == null) window.superutilsEditor = this;
      return f.apply(this, arguments);
    };
  });
})();
