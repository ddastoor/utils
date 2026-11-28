/*
 * SuperUtils (2026) — not part of draw.io: loaded by the editor's page (index.html, changed by SuperUtils) before
 * draw.io's own scripts. SuperUtils keeps nothing between visits (its rule; the Diagram Editor tab opens and saves the
 * files on the device), so the editor gets storage that lasts only while its page is open, and no database, cache,
 * cookies or service worker.
 */
(function () {
  'use strict';
  function memoryStorage() {
    var data = new Map();
    return {
      getItem: function (k) { k = String(k); return data.has(k) ? data.get(k) : null; },
      setItem: function (k, v) { data.set(String(k), String(v)); },
      removeItem: function (k) { data.delete(String(k)); },
      clear: function () { data.clear(); },
      key: function (i) { var keys = Array.from(data.keys()); return i >= 0 && i < keys.length ? keys[i] : null; },
      get length() { return data.size; }
    };
  }
  function replace(obj, name, value) {
    try { Object.defineProperty(obj, name, { value: value, configurable: true, writable: false }); } catch (e) { /* stays as it is */ }
  }
  replace(window, 'localStorage', memoryStorage());
  replace(window, 'sessionStorage', memoryStorage());
  ['indexedDB', 'webkitIndexedDB', 'mozIndexedDB', 'caches'].forEach(function (n) {
    try { delete window[n]; } catch (e) { /* ignore */ }
    if (window[n] !== undefined) replace(window, n, undefined);
  });
  try { delete Navigator.prototype.serviceWorker; } catch (e) { /* ignore */ }
  try { Object.defineProperty(document, 'cookie', { get: function () { return ''; }, set: function () { }, configurable: true }); } catch (e) { /* ignore */ }
})();
