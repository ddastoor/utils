// Page side of src/workers/jq.worker.ts. One run at a time and the newest request wins:
//   - a request that arrives while another is still running waits for it — almost every run ends within milliseconds,
//     so the worker (and its compiled engine) is kept; only when the older run is still going after GRACE_MS is the
//     worker ended and a fresh one started for the waiting request;
//   - a run over the time limit, a stopped run and a crash of the engine (out of memory) end the worker as well.
import { trackWorker, releaseNow } from '../lifecycle';
import type { JqOpts, JqResult } from '../wasm/jq';
import type { JqReq, JqRes } from '../workers/jq.worker';

/** How long one run may take. jq handles tens of megabytes in a second or two; what takes longer is usually endless. */
export const JQ_LIMIT_MS = 10000;
/** How long a newer request waits for the run before it. */
const GRACE_MS = 250;
export class JqStopped extends Error { constructor(public why: 'stopped' | 'timeout' | 'superseded' | 'crashed' | 'left', message: string) { super(message); } }
interface Job { id: number; req: JqReq; limitMs: number; res: (v: JqResult) => void; rej: (e: Error) => void; timer?: ReturnType<typeof setTimeout> }
let worker: Worker | null = null, seq = 0;
let running: Job | null = null;   // posted to the worker, its answer not back yet
let wanted = false;               // somebody still waits for the running job's answer
let waiting: Job | null = null;   // the newest request, started when the worker is free
let grace: ReturnType<typeof setTimeout> | undefined;

const fail = (j: Job | null, why: JqStopped['why'], message: string) => { if (j) { clearTimeout(j.timer); j.rej(new JqStopped(why, message)); } };
/** End the worker (and with it whatever it is doing); the next start() makes a new one. */
let killing = false;
const kill = () => { clearTimeout(grace); clearTimeout(running?.timer); running = null; wanted = false; killing = true; try { releaseNow('jq-worker'); } finally { killing = false; } };
const next = () => { const j = waiting; waiting = null; if (j) start(j); };
function start(j: Job) {
  if (!worker) {
    worker = trackWorker(new Worker(new URL('../workers/jq.worker.ts', import.meta.url), { type: 'module' }), 'jq-worker', () => {
      worker = null;
      if (killing) return;            // ended by kill(): its caller deals with the jobs
      clearTimeout(grace);            // the tab was left
      if (wanted) fail(running, 'left', 'The tab was left');
      clearTimeout(running?.timer); running = null; wanted = false;
      fail(waiting, 'left', 'The tab was left'); waiting = null;
    });
    worker.onmessage = (e: MessageEvent<JqRes>) => {
      const r = running; if (!r || e.data.id !== r.id) return;
      clearTimeout(grace); clearTimeout(r.timer);
      const crashed = e.data.error !== undefined, was = wanted;
      if (crashed) kill(); else { running = null; wanted = false; }
      if (was) { if (crashed) fail(r, 'crashed', e.data.error!); else r.res(e.data.result!); }
      next();
    };
    worker.onerror = (e) => { const r = running, was = wanted; kill(); if (was) fail(r, 'crashed', e.message || 'the jq engine could not start'); next(); };
  }
  running = j; wanted = true;
  j.timer = setTimeout(() => { const r = running; kill(); fail(r, 'timeout', `Stopped after ${j.limitMs / 1000} seconds`); next(); }, j.limitMs);
  worker.postMessage(j.req);
}
export function runJq(filter: string, input: string, opts: JqOpts, limitMs = JQ_LIMIT_MS): Promise<JqResult> {
  return new Promise((res, rej) => {
    const id = ++seq, j: Job = { id, req: { id, filter, input, opts }, limitMs, res, rej };
    if (!running) { start(j); return; }
    fail(waiting, 'superseded', 'A newer run replaced this one');
    if (wanted) {                                  // the run in the worker: nobody waits for its answer any more
      wanted = false; fail(running, 'superseded', 'A newer run replaced this one');
      grace = setTimeout(() => { kill(); next(); }, GRACE_MS);
    }
    waiting = j;
  });
}
/** End the run that is going (Stop button). */
export function stopJq() {
  if (waiting) { fail(waiting, 'stopped', 'Stopped'); waiting = null; return; }   // the run before it ends on its own or at the end of its grace time
  if (running && wanted) { const r = running; kill(); fail(r, 'stopped', 'Stopped'); }
}
export const jqBusy = () => (running !== null && wanted) || waiting !== null;
