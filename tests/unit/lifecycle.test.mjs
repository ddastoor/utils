// src/lifecycle.ts: engines register a release function; the router frees them when a tab is left. Inside a Web Worker
// (no document — the same situation as this Node test) the module must NOT treat itself as "no tab open": a release
// run at once there left the worker without its engine (Hash, Sodium Encrypt and Share Link broke, Nov 2026).
export default async (t, { load }) => {
  const L = await load('/src/lifecycle.ts'), live = () => globalThis.__superutilsLive();
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
  // lazyEngine: what every engine wrapper is made with
  { let loads = 0, fail = true; const engine = L.lazyEngine('unit-lazy', () => { loads++; return fail ? Promise.reject(new Error('offline')) : Promise.resolve({ n: loads }); });
    const first = engine(); t.ok(first === engine() && loads === 1, 'while it loads, every caller gets the same promise');
    t.eq(await first.then(() => 'loaded', (e) => e.message), 'offline', 'a failed load is reported to who asked');
    fail = false; const again = await engine();
    t.eq([again.n, loads], [2, 2], 'a failed load is not kept: the next call loads again (it used to stay broken until the tab was left)');
    t.ok((await engine()) === again && loads === 2 && live().resources.includes('unit-lazy'), 'a loaded engine is kept and registered for release');
    L.releaseAll(); t.eq([(await engine()).n, loads], [3, 3], 'after the tab is left the next call loads anew');
    engine.reset(); t.eq([(await engine()).n, loads], [4, 4], 'reset() forgets the instance (after a trap)');
    // an engine that was replaced is not forgotten by the release of the one before it
    const kept = engine(); L.releaseAll(); const fresh = engine(); t.ok(fresh !== kept && (await fresh).n === 5 && engine() === fresh, 'a release only forgets the instance it was registered for');
    L.releaseAll(); }
  // workers
  const fake = () => ({ terminated: 0, terminate() { this.terminated++; } });
  const w1 = fake(), w2 = fake(); let ended = 0;
  L.trackWorker(w1, 'unit-w', () => ended++); t.eq(live().workers, 1, 'a tracked worker is counted');
  L.trackWorker(w2, 'unit-w', () => ended++); t.eq([w1.terminated, live().workers, ended], [1, 1, 1], 'tracking another worker under the same key ends the first');
  L.releaseAll(); t.eq([w2.terminated, live().workers, ended], [1, 0, 2], 'leaving the tab terminates the worker and tells its owner');
};
