# ClearURLs 1.28.0's cleaning code — the reference of the link checker's suite

The files the extension's own link cleaning runs on, as they are at commit `5fdc21e90134d8ccd3cc80c1518b7acf004cfa1b`
of github.com/ClearURLs/Addon (its version 1.28.0, `manifest.json`), unchanged:

| file | SHA-256 |
|---|---|
| clearurls.js | 719b1c4f5067192333ccf196103a10c63cf4e6622b9e94ccb0768d2d6708b09b |
| core_js/pureCleaning.js | 763f8fb89b5911f7277332886b42fbcaf98f2d1a8641e746f3abd23bfc6b7f12 |
| core_js/tools.js | 3834f2c407997ae16cb50dc9c4f2fab75f1472508e1d3c81ede0ae32ce9f7766 |
| core_js/utils/URLHashParams.js | a41a1045729d3353d85de43876c0172600dbfef596c9a80ddb49ff750f9a81af |
| core_js/utils/decodeRedirectTarget.js | dec5ae54ffb52cbf95f71e950ab738da522922e2b75a72a59af381a71f44bcf8 |
| external_js/ip-range-check.js | a6a80a54b7c096ddec315d38b7d47241d9fb2befaaf5543e3f0685de6a152ae8 |

ClearURLs © Kevin Röbert, **LGPL-3.0-or-later** (`LICENSE`); ip-range-check © Daniel Compton, MIT (its header).

They are **test data only** — never part of the site. `tests/lib/clearurls-ref.mjs` runs them in a Node `vm` context with
the browser's parts they touch stood in for (storage, the extension APIs), feeds them the same rules file as the engine
(`wasm/devcore/data/links/clearurls.json`), and asks `pureCleaning(url, true)` — what the extension's "copy clean link"
gives — for every link of `tests/unit/links.test.mjs`. The engine (`wasm/devcore/src/links.rs`) must give the same link.
