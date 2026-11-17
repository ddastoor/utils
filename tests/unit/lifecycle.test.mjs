// src/lifecycle.ts: engines register a release function; the router frees them when a tab is left. Inside a Web Worker
// (no document — the same situation as this Node test) the module must NOT treat itself as "no tab open": a release
// run at once there left the worker without its engine (Hash, Sodium Encrypt and Share Link broke, Nov 2026).
export default async (t, { load }) => {
  const L = await load('/src/lifecycle.ts'), live = () => globalThis.__supertoolsLive();
  let freed = 0;
  L.onLeave('unit-a', () => freed++);
  t.eq([freed, live().resources.includes('unit-a')], [0, true], 'without a document (worker context) a registration is kept, not released at once');
  // the pattern every engine loader uses: `if (!inst) { inst = load(); onLeave(key, () => (inst = null)); } return inst;`
  let inst = null; const loader = () => { if (!inst) { inst = Promise.resolve({ ok: true }); L.onLeave('unit-engine', () => (inst = null)); } return inst; };
  t.ok((await loader())?.ok === true && inst !== null, 'an engine loader used in a worker returns its engine (it used to return null)');
  L.releaseAll(); t.eq([freed, inst, live().resources.length], [1, null, 0], 'releaseAll runs every release once and forgets them');
  L.releaseAll(); t.eq(freed, 1, 'a second releaseAll does nothing');
  // the page's rule: while no tool is open, whatever registers is released straight away
  L.setIdle(true); L.onLeave('unit-b', () => freed++); t.eq([freed, live().resources.includes('unit-b')], [2, false], 'page with no tool open: released at once');
  L.setIdle(false); L.onLeave('unit-c', () => freed++); t.eq([freed, live().resources.includes('unit-c')], [2, true], 'tool open: kept until the tab is left');
  L.onLeave('unit-c', () => (freed += 10)); L.releaseAll(); t.eq(freed, 12, 're-registering a key replaces the earlier release');
  L.onLeave('unit-d', () => freed++); L.releaseNow('unit-d'); L.releaseNow('unit-d'); t.eq([freed, live().resources.length], [13, 0], 'releaseNow frees one key, once');
  L.onLeave('unit-bad', () => { throw new Error('boom'); }); L.onLeave('unit-good', () => freed++); const w = console.warn; console.warn = () => {}; L.releaseAll(); console.warn = w;
  t.eq(freed, 14, 'a release that throws does not stop the others');
  // workers
  const fake = () => ({ terminated: 0, terminate() { this.terminated++; } });
  const w1 = fake(), w2 = fake(); let ended = 0;
  L.trackWorker(w1, 'unit-w', () => ended++); t.eq(live().workers, 1, 'a tracked worker is counted');
  L.trackWorker(w2, 'unit-w', () => ended++); t.eq([w1.terminated, live().workers, ended], [1, 1, 1], 'tracking another worker under the same key ends the first');
  L.releaseAll(); t.eq([w2.terminated, live().workers, ended], [1, 0, 2], 'leaving the tab terminates the worker and tells its owner');
};
