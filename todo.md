# To do (the owner's list — "to do")

The owner adds items here in chat ("add … to to do"). Newest instructions win.

> **Never start an item on your own (owner, 17 Nov 2026):** "Don't start doing the todo.md on your own. At some point,
> show me the todo.md, show me the items in the todo.md and ask me which ones to build out and I'll tell you."
> So: when the work in progress (see `docs/RESUME.md`) is finished, **show the owner the open items and ask which
> ones to do** — and do only those. Tick an item off here with the date and the commit.

## Open
1. **JS/TS → WebAssembly sweep** (owner, 17 Nov 2026; **not to be started until the owner says so**): "Do another sweep and as far as possible replace as much JS/TS
   code as you can into WebAssembly modules (JS/TS to WebAssembly build-out) if possible, only if doable and possible."
   Follow CLAUDE.md STANDING RULE #1 (owner's latest wording, 18 Nov 2026): first an existing tried-and-tested
   WebAssembly module (a famous, good one — only if it satisfies everything asked for the utility); if there is none
   or none fits, our own WebAssembly build from open-source code (where
   the code exists only as JS/TS, try to make a WebAssembly module out of it); keep JS/TS as it is only where that
   is not doable (note why in CLAUDE.md §3a). Everything stays hosted in the app. And STANDING RULE #2: extensive tests for whatever is moved. Starting points: the "JavaScript-only components" table and the audit list in CLAUDE.md §3a
   (zip.js, mediabunny, OpenPGP.js, Mermaid, Prettier, TensorFlow.js) and the "Deliberately left in TypeScript" notes;
   then every `src/tools/**/*.ts` and `src/lib/*.ts` for loops, parsers and maths still done in TypeScript.

2. **FFmpeg tab: buttons for more popular jobs** (owner, 20 Nov 2026 — **chosen by the owner: do it** right after the
   EXIF / Photo Info tab of the bug hunt, then go on with the hunt). The owner's words: "make a note to remember to add
   all the popular new jobs for FFmpeg that don't have buttons yet above, and also search for more out there, more
   popular things that people do with FFmpeg and add it to the list. And obviously add this new functionality and then
   obviously continue the bug hunt and the test case writing." The tab must stay button-driven (no command line needed).
   **The owner's six:** (1) join several clips into one; (2) subtitles — burn in, add as a track, extract; (3) a logo
   or text on a video; (4) change the volume by a set amount; (5) reverse a clip; (6) a thumbnail at a chosen time.
   **Found on the web (20 Nov 2026: cheat sheets, FFmpeg GUIs and creators' guides — sources in docs/BUGHUNT.md) and
   not yet a button here or another tab's job:** (7) fade in / fade out (picture and sound); (8) fit to a shape
   (9:16, 16:9, 1:1 …) with a blurred background or bars instead of cropping; (9) remove silence (start, end, inside);
   (10) picture-in-picture (a second video in a corner); (11) loop a clip n times, and "boomerang" (forward + back);
   (12) stabilise a shaky video; (13) clean up a grainy (noisy) video; (14) contact sheet — a grid of frames in one
   picture; (15) timelapse — 8× to 60× faster; (16) split into equal parts (a zip); (17) sound settings — mono /
   stereo, sample rate; (18) colours — brightness, contrast, saturation, black and white; (19) cut a part out of the
   middle; (20) background music under the sound (mix instead of replace); (21) deinterlace old camcorder / TV
   recordings. Already elsewhere: compress to a size (Video Compressor), photos → video (Slideshow Maker), audio noise
   (Noise Remover). Each job with e2e checks against known answers (ffprobe / the decoded frames).

3. _(withdrawn by the owner on 20 Nov 2026: the "Export Python utility" for the YouTube Clip tab — do not build it.)_

## Done
_(nothing yet)_
