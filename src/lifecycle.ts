// Per-tab resource lifecycle (memory). Anything heavy that a tool creates — Web Workers, WebAssembly instances, ML model
// sessions, large caches — registers a release function here under a key. When the user leaves a tool the router calls
// releaseAll(): workers are terminated and caches dropped so the memory can be collected; the next tool that needs them
// creates them again (lazily, on first use). Shell-level things (the search index) never register.
type Release = () => void;
const releases = new Map<string, Release>();
const workers = new Set<Worker>();

// No tool is open (home, category and favourites pages). Only the page has this notion: inside a Web Worker this module
// is a separate copy that the router never talks to, so there it is never "idle" — a worker's engines live exactly as
// long as the worker, which the page terminates when the tab is left. (With `true` here every engine loaded inside a
// worker was released the moment it was created: Hash, Sodium Encrypt and Share Link stopped working.)
let idle = typeof document !== 'undefined';
/** The router says whether a tool is open. While none is, anything that registers is released at once. */
export function setIdle(v: boolean) { idle = v; }

/** Run `fn` when the user leaves the current tool (one entry per key; re-registering replaces it). */
export function onLeave(key: string, fn: Release) {
  // an engine that finished loading after its tab was left (slow download) has no user any more: free it straight away
  if (idle) { try { fn(); } catch (e) { console.warn('release failed', e); } return; }
  releases.set(key, fn);
}

/** Release one key now (e.g. a Stop button that terminates a worker). */
export function releaseNow(key: string) { const f = releases.get(key); if (f) { releases.delete(key); f(); } }

/** Track a worker: it is terminated when the user leaves the tool; `onEnd` lets the owner forget its handle. */
export function trackWorker(w: Worker, key: string, onEnd?: () => void): Worker {
  releaseNow(key); // a worker already tracked under this key (e.g. one its tool stopped by hand) is ended and forgotten first
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
