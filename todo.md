# To do (the owner's list — "to do")

The owner adds items here in chat ("add … to to do"). Newest instructions win. An item is started when the owner says
so or when the work in progress (see `docs/RESUME.md`) is finished; tick it off here with the date and the commit.

## Open
1. **JS/TS → WebAssembly sweep** (owner, 17 Nov 2026): "Do another sweep and as far as possible replace as much JS/TS
   code as you can into WebAssembly modules (JS/TS to WebAssembly build-out) if possible, only if doable and possible."
   Follow CLAUDE.md STANDING RULE #1 (owner's latest wording, 17 Nov 2026): a WebAssembly module first — built by us
   from open-source code or an existing tried-and-tested build, either is fine; where the code exists only as JS/TS,
   try to make a WebAssembly module out of it; keep JS/TS as it is only where that is not possible (note why in
   CLAUDE.md §3a). Everything stays hosted in the app. And STANDING RULE #2: extensive tests for whatever is moved. Starting points: the "JavaScript-only components" table and the audit list in CLAUDE.md §3a
   (zip.js, mediabunny, OpenPGP.js, Mermaid, Prettier, TensorFlow.js) and the "Deliberately left in TypeScript" notes;
   then every `src/tools/**/*.ts` and `src/lib/*.ts` for loops, parsers and maths still done in TypeScript.

## Done
_(nothing yet)_
