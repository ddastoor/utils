# The link checker's data

- `clearurls.json` — ClearURLs' rules (`data.min.json` of github.com/ClearURLs/Rules at commit
  7c30a16c37c13526bd43eead3135459e79975585, the same file as gitlab.com/ClearURLs/rules at 326be261 — 18 Nov 2026), byte for byte:
  SHA-256 6778b151d3cc9f9e08a05b333f7268df835d0419d40ce7e6c3ad166ac507165d. **LGPL-3.0** (`LICENSE-clearurls.txt`), compiled into
  devcore-links.wasm by `include_str!`. To update: fetch the new `data.min.json` at a commit, put its commit and SHA-256 into
  `src/links.rs` (`CLEARURLS_COMMIT`, `CLEARURLS_SHA256`) and here, `bash wasm/devcore/build.sh`, `node tests/unit.mjs links`.
- The Public Suffix List comes with the psl crate (its version in `Cargo.lock`), the confusables of UTS #39 with unicode-security.
- Everything else (brands and their own addresses, shorteners, services, endings, calling codes, the scam wording) is ours:
  `src/links_data.rs`, `src/links.rs`.
