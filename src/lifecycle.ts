// Per-tab resource lifecycle (memory). Anything heavy that a tool creates — Web Workers, WebAssembly instances, ML model
// sessions, large caches — registers a release function here under a key. When the user leaves a tool the router calls
// releaseAll(): workers are terminated and caches dropped so the memory can be collected; the next tool that needs them
// creates them again (lazily, on first use). Shell-level things (the search index) never register.
type Release = () => void;
const releases = new Map<string, Release>();
const workers = new Set<Worker>();

/** Run `fn` when the user leaves the current tool (one entry per key; re-registering replaces it). */
export function onLeave(key: string, fn: Release) { releases.set(key, fn); }

/** Track a worker: it is terminated when the user leaves the tool; `onEnd` lets the owner forget its handle. */
export function trackWorker(w: Worker, key: string, onEnd?: () => void): Worker {
  workers.add(w);
  onLeave(key, () => { w.terminate(); workers.delete(w); onEnd?.(); });
  return w;
}

/** Release everything registered (called by the router between tools). */
export function releaseAll() {
  for (const [, f] of releases) { try { f(); } catch (e) { console.warn('release failed', e); } }
  releases.clear();
}

// test hook (tests/e2e/lazy.e2e.mjs): what is alive right now
(globalThis as any).__supertoolsLive = () => ({ workers: workers.size, resources: [...releases.keys()] });
