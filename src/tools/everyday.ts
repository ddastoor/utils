// Everyday: timers (stopwatch, countdown, Pomodoro, interval) and randomness — libsodium's randombytes_uniform: Dice and
// Coin from libsodium.js (the libsodium project's own WebAssembly build); Random Number, Picker and Teams from crypto.wasm,
// which has it too and adds what libsodium.js lacks: draws without repeats and shuffles (docs/WASM-AUDIT.md 155).
import { h, card, field, input, textarea, button, segmented, toggle, slider, clear, stack, note, copy, type Mount } from '../ui';
import { sodium } from '../wasm/crypto';
import { libsodium } from '../wasm/libsodium';
import './everyday.css';

// ------------------------------------------------------------------ shared timer helpers
const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, '0');
export const clock = (ms: number, hundredths = false) => {
  const t = Math.max(0, ms), hh = Math.floor(t / 3600000), mm = Math.floor((t % 3600000) / 60000), ss = Math.floor((t % 60000) / 1000);
  return `${hh ? `${hh}:` : ''}${pad(mm)}:${pad(ss)}${hundredths ? `.${pad((t % 1000) / 10)}` : ''}`;
};

/** The time the timers count in: performance.now() plus the time the computer slept. performance.now() — and the
 *  browser's timeouts — stand still while a laptop sleeps on macOS and Linux, so a 25-minute timer rang 25 minutes of
 *  *awake* time after it started and a stopwatch left the night out. When the wall clock has run ahead of
 *  performance.now() by more than a second since the last look, the difference was sleep and is counted; a wall clock
 *  set back (or corrected a little) changes nothing. */
let wallSeen = Date.now(), perfSeen = performance.now(), slept = 0;
export function timerNow(): number {
  const w = Date.now(), p = performance.now(), ahead = w - wallSeen - (p - perfSeen);
  if (ahead > 1000) slept += ahead;
  wallSeen = w; perfSeen = p;
  return p + slept;
}

let audio: AudioContext | null = null;
/** Called from the Start tap or click: Safari lets a page make sound only after the person did something, and the alarm
 *  is set off later by a timer — so the alarm's audio is opened (or woken) at Start. */
function unlockAudio() {
  try { audio ||= new AudioContext(); if (audio.state !== 'running') audio.resume().catch(() => {}); } catch { /* no Web Audio: the display still says it */ }
}
function releaseAudio() { const a = audio; audio = null; a?.close().catch(() => {}); }
/** `times` short beeps of `freq` Hz, the first `delay` seconds from now on the audio clock. */
export function beep(times = 3, freq = 880, delay = 0) {
  try {
    audio ||= new AudioContext();
    if (audio.state !== 'running') audio.resume().catch(() => {}); // a phone may have suspended it meanwhile
    const now = audio.currentTime + delay;
    for (let i = 0; i < times; i++) {
      const o = audio.createOscillator(), g = audio.createGain(), t = now + i * 0.35;
      o.frequency.value = freq; o.connect(g).connect(audio.destination);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.start(t); o.stop(t + 0.3);
    }
  } catch { /* no sound possible here */ }
  navigator.vibrate?.([200, 100, 200, 100, 200]);
}

/** Keeps the screen on while a timer runs (where the browser allows it). The browser lets the lock go whenever the tab is
 *  hidden: it is asked for again when the tab is shown (it used to stay off for the rest of the run), and a lock that
 *  arrives after the timer was paused is let go at once (a quick Start → Pause kept the screen on). */
function wakeLock() {
  let lock: any = null, want = false;
  const ask = async () => {
    const wl = (navigator as any).wakeLock;
    if (!want || lock || !wl || document.visibilityState !== 'visible') return;
    try {
      const l = await wl.request('screen');
      if (!want || lock) { l.release?.()?.catch?.(() => {}); return; }
      lock = l; l.addEventListener?.('release', () => { if (lock === l) lock = null; });
    } catch { /* refused (battery saver): the timer still runs */ }
  };
  const shown = () => { if (document.visibilityState === 'visible') void ask(); };
  document.addEventListener('visibilitychange', shown);
  const off = () => { want = false; const l = lock; lock = null; l?.release?.()?.catch?.(() => {}); };
  return { on() { want = true; void ask(); }, off, dispose() { off(); document.removeEventListener('visibilitychange', shown); } };
}
const display = (cls = '') => h('div', { class: `timer-display ${cls}` });
const setTitle = (t: string) => { if (document.title !== t) document.title = t; };

/** Keeps a running timer moving, and ringing on time while its tab is in the background:
 *  — a frame loop while the tab is shown (the display; frames stop in a background tab — the alarm used to wait until
 *    the tab was looked at again),
 *  — one timeout per planned end, all set together when the run starts or its plan changes (a timeout set by a timeout
 *    is a "chained" timer, which Chrome runs only once a minute after five minutes in the background),
 *  — a 1 s interval: the tab's title, and the catch-up after the computer slept (timeouts do not count sleep),
 *  — the moment the tab is shown again.
 *  `tick` does the work; it may call stop(). Ends are on timerNow(). */
const MAX_DELAY = 2 ** 31 - 1; // a longer timeout fires at once
function runner(tick: () => void) {
  let active = false, raf = 0, iv = 0, outs: number[] = [];
  const frame = () => { raf = 0; tick(); if (active && !raf) raf = requestAnimationFrame(frame); };
  const shown = () => {
    if (!active || document.visibilityState !== 'visible') return;
    tick();
    if (active && !raf) raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    active = false;
    for (const t of outs) clearTimeout(t);
    outs = []; clearInterval(iv); iv = 0; cancelAnimationFrame(raf); raf = 0;
    document.removeEventListener('visibilitychange', shown);
  };
  const at = (end: number) => {
    const wait = () => {
      const d = end - timerNow();
      if (d > 0) outs.push(window.setTimeout(wait, Math.min(MAX_DELAY, d + 5))); // early (or beyond 24.8 days): wait on
      else tick();
    };
    outs.push(window.setTimeout(wait, Math.min(MAX_DELAY, Math.max(0, end - timerNow()) + 5)));
  };
  return {
    run(ends: number[]) {
      stop();
      active = true;
      ends.forEach(at);
      iv = window.setInterval(tick, 1000);
      raf = requestAnimationFrame(frame);
      document.addEventListener('visibilitychange', shown);
    },
    stop,
  };
}

// ------------------------------------------------------------------ Stopwatch
export const stopwatch: Mount = (root) => {
  let start = 0, acc = 0, running = false, raf = 0, lastLap = 0;
  const disp = display();
  const laps = h('div', { class: 'laps' });
  const wl = wakeLock();
  const elapsed = () => acc + (running ? timerNow() - start : 0);
  const tick = () => { raf = 0; disp.textContent = clock(elapsed(), true); if (running) raf = requestAnimationFrame(tick); };
  const startStop = button('Start', () => {
    if (running) { acc += timerNow() - start; running = false; wl.off(); } // the exact stopped time, not the last frame's
    else { start = timerNow(); running = true; wl.on(); }
    cancelAnimationFrame(raf); tick(); // one frame loop only, even after a quick Reset → Start
    startStop.setLabel(running ? 'Stop' : 'Start');
  }, { variant: 'primary', icon: 'Play' });
  const lap = button('Lap', () => {
    const t = elapsed(); if (!t || t === lastLap) return; // nothing since the last lap (Lap pressed twice while stopped)
    const n = laps.children.length + 1;
    laps.prepend(h('div', { class: 'lap' }, h('span', null, `Lap ${n}`), h('span', { class: 'mono' }, clock(t - lastLap, true)), h('span', { class: 'mono muted' }, clock(t, true))));
    lastLap = t;
  }, { icon: 'Flag' });
  const reset = button('Reset', () => { running = false; acc = 0; lastLap = 0; wl.off(); clear(laps); startStop.setLabel('Start'); cancelAnimationFrame(raf); tick(); }, { icon: 'RotateCcw' });
  root.append(card(null, disp, h('div', { class: 'actions inline center-row' }, startStop, lap, reset)), card('Laps', laps));
  tick();
  return () => { running = false; cancelAnimationFrame(raf); wl.dispose(); };
};

// ------------------------------------------------------------------ Countdown
const MAX_COUNTDOWN = (99 * 3600 + 59 * 60 + 59) * 1000;
export const countdown: Mount = (root) => {
  let endAt = 0, remaining = 5 * 60000, running = false;
  const disp = display('big');
  const wl = wakeLock();
  const hI = input({ type: 'number', value: 0, min: 0, max: 99 }), mI = input({ type: 'number', value: 5, min: 0 }), sI = input({ type: 'number', value: 0, min: 0 });
  const why = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const baseTitle = document.title;
  const num = (el: HTMLInputElement) => Math.max(0, +el.value || 0); // negative or empty fields count as 0
  const total = () => Math.round((num(hI) * 3600 + num(mI) * 60 + num(sI)) * 1000);
  const left = () => (running ? endAt - timerNow() : remaining);
  const draw = () => {
    const shown = clock(Math.ceil(left() / 1000) * 1000);
    if (disp.textContent !== shown) disp.textContent = shown;
    setTitle(running ? `${shown} · Countdown` : disp.classList.contains('done') ? 'Time’s up · Countdown' : baseTitle);
  };
  const tick = () => {
    if (running && timerNow() >= endAt) { running = false; remaining = 0; r.stop(); wl.off(); beep(4); disp.classList.add('done'); go.setLabel('Start'); }
    draw();
  };
  const r = runner(tick);
  const go = button('Start', () => {
    if (running) { remaining = Math.max(0, endAt - timerNow()); running = false; r.stop(); wl.off(); }
    else {
      if (remaining <= 0) remaining = total();
      if (remaining <= 0 || remaining > MAX_COUNTDOWN) return; // nothing to count / said under the fields
      unlockAudio(); endAt = timerNow() + remaining; running = true; disp.classList.remove('done'); wl.on(); r.run([endAt]);
    }
    go.setLabel(running ? 'Pause' : 'Start'); draw();
  }, { variant: 'primary', icon: 'Play' });
  const reset = () => {
    running = false; r.stop(); remaining = total(); wl.off(); disp.classList.remove('done'); go.setLabel('Start');
    why.textContent = remaining > MAX_COUNTDOWN ? 'A countdown can be at most 99 hours, 59 minutes and 59 seconds.' : '';
    draw();
  };
  [hI, mI, sI].forEach((x) => x.addEventListener('input', reset));
  const presets = h('div', { class: 'chips' }, [1, 3, 5, 10, 15, 30, 60].map((m) => h('button', { class: 'chip chip-btn', type: 'button', onclick: () => { hI.value = String(Math.floor(m / 60)); mI.value = String(m % 60); sI.value = '0'; reset(); } }, m < 60 ? `${m} min` : '1 hour')));
  root.append(card(null, disp, h('div', { class: 'actions inline center-row' }, go, button('Reset', reset, { icon: 'RotateCcw' }))),
    card('Set time', h('div', { class: 'form-grid' }, field('Hours', hI), field('Minutes', mI), field('Seconds', sI)), why, presets),
    note('The alarm sounds also when this tab is in the background (keep the tab open). The screen stays awake while the timer runs and the tab is shown (where supported).'));
  draw();
  return () => { running = false; r.stop(); wl.dispose(); releaseAudio(); if (document.title.endsWith('· Countdown')) document.title = baseTitle; };
};

// ------------------------------------------------------------------ Pomodoro & Interval share a phase engine
type Step = { id: string; name: string; ms: number; cls: string };
function phaseTimer(root: HTMLElement, plan: () => Step[], extra: Node[]) {
  let steps = plan(), i = 0, running = false, t0 = 0, spent = 0; // t0: when step i began (running); spent: time in it (paused)
  const disp = display('big'), label = h('div', { class: 'phase-label' }), count = h('div', { class: 'muted center' });
  const wl = wakeLock(), baseTitle = document.title;
  const endBeep = (s: Step) => (s.cls === 'work' ? 660 : 990);
  const left = () => (running ? t0 + steps[i].ms - timerNow() : steps[i].ms - spent);
  const draw = () => {
    const s = steps[i], shown = clock(Math.ceil(left() / 1000) * 1000);
    if (disp.textContent !== shown) disp.textContent = shown;
    label.textContent = s.name; label.className = `phase-label ${s.cls}`;
    count.textContent = `Step ${i + 1} of ${steps.length}`;
    setTitle(running ? `${shown} · ${s.name}` : baseTitle);
  };
  /** Steps end at their planned times — the next one starts when the last one was due, not when its end was noticed
   *  (after a while in the background the whole plan used to shift by that time). After a sleep several may have ended:
   *  one beep, for the last. */
  const tick = () => {
    if (!running) return;
    const now = timerNow();
    let ended: Step | null = null;
    while (now >= t0 + steps[i].ms) {
      t0 += steps[i].ms; ended = steps[i]; i++;
      if (i >= steps.length) { // the last step is over: the alarm, and back to the first step
        running = false; i = 0; spent = 0; r.stop(); wl.off(); go.setLabel('Start');
        beep(2, endBeep(ended)); beep(4, 880, 0.8);
        draw(); return;
      }
    }
    if (ended) beep(2, endBeep(ended));
    draw();
  };
  const r = runner(tick);
  const arm = () => { let e = t0; r.run(steps.slice(i).map((s) => (e += s.ms))); };
  const go = button('Start', () => {
    if (running) { spent = Math.min(steps[i].ms, timerNow() - t0); running = false; r.stop(); wl.off(); draw(); }
    else { unlockAudio(); t0 = timerNow() - spent; running = true; wl.on(); arm(); tick(); }
    go.setLabel(running ? 'Pause' : 'Start');
  }, { variant: 'primary', icon: 'Play' });
  const skip = () => {
    if (running) { t0 = timerNow() - steps[i].ms; tick(); if (running) arm(); } // the step ends now, with its beep
    else { i = (i + 1) % steps.length; spent = 0; draw(); }
  };
  const reset = () => { running = false; r.stop(); wl.off(); steps = plan(); i = 0; spent = 0; go.setLabel('Start'); draw(); };
  /** A setting changed. The step being timed stays, with the time already spent in it (its new length counts from its
   *  start; one made shorter than that is over); a step the new settings no longer have gives way to the one at its place,
   *  from its start; a timer not yet started shows the new plan from its first step. A running timer keeps running — it
   *  used to stop and go back to step 1, losing the run. */
  const change = () => {
    const old = steps[i], now = timerNow(), done = running ? now - t0 : spent;
    steps = plan();
    if (!running && i === 0 && spent === 0) { draw(); return; } // not started: the new plan from its first step
    const j = steps.findIndex((s) => s.id === old.id);
    i = j >= 0 ? j : Math.min(i, steps.length - 1);
    const keep = j >= 0 ? done : 0;
    // a step made shorter than the time already spent ends now (with its beep); the next one starts now, whole
    if (running) { t0 = now - Math.min(keep, steps[i].ms); arm(); tick(); } else { spent = Math.min(keep, steps[i].ms); draw(); }
  };
  root.append(card(null, label, disp, count, h('div', { class: 'actions inline center-row' }, go, button('Skip', skip, { icon: 'SkipForward' }), button('Reset', reset, { icon: 'RotateCcw' }))),
    ...extra, note('The beeps sound also when this tab is in the background (keep the tab open).'));
  draw();
  return { reset, change, cleanup: () => { running = false; r.stop(); wl.dispose(); releaseAudio(); setTitle(baseTitle); } };
}

export const pomodoro: Mount = (root) => {
  const o = { work: 25, short: 5, long: 15, cycles: 4 };
  const plan = (): Step[] => Array.from({ length: o.cycles }, (_, k) => [{ id: `focus${k}`, name: 'Focus', ms: o.work * 60000, cls: 'work' },
    k === o.cycles - 1 ? { id: 'long', name: 'Long break', ms: o.long * 60000, cls: 'rest' } : { id: `short${k}`, name: 'Short break', ms: o.short * 60000, cls: 'rest' }]).flat();
  let t: ReturnType<typeof phaseTimer>;
  const settings = card('Settings', h('div', { class: 'stack' },
    slider({ label: 'Focus', min: 5, max: 90, value: o.work, unit: ' min', onChange: (v) => { o.work = v; t.change(); } }),
    slider({ label: 'Short break', min: 1, max: 30, value: o.short, unit: ' min', onChange: (v) => { o.short = v; t.change(); } }),
    slider({ label: 'Long break', min: 5, max: 60, value: o.long, unit: ' min', onChange: (v) => { o.long = v; t.change(); } }),
    slider({ label: 'Focus sessions', min: 1, max: 8, value: o.cycles, onChange: (v) => { o.cycles = v; t.change(); } })));
  t = phaseTimer(root, plan, [settings]);
  return t.cleanup;
};

export const interval: Mount = (root) => {
  const o = { work: 40, rest: 20, rounds: 8, prep: 10 };
  const plan = (): Step[] => [...(o.prep > 0 ? [{ id: 'prep', name: 'Get ready', ms: o.prep * 1000, cls: 'prep' }] : []),
    ...Array.from({ length: o.rounds }, (_, k) => [{ id: `work${k}`, name: `Work · round ${k + 1}`, ms: o.work * 1000, cls: 'work' }, ...(k < o.rounds - 1 && o.rest > 0 ? [{ id: `rest${k}`, name: 'Rest', ms: o.rest * 1000, cls: 'rest' }] : [])]).flat()];
  let t: ReturnType<typeof phaseTimer>;
  const preset = (w: number, r: number, n: number) => { o.work = w; o.rest = r; o.rounds = n; sw.value = w; sr.value = r; sn.value = n; t.reset(); };
  const sp = slider({ label: 'Get ready', min: 0, max: 60, step: 5, value: o.prep, unit: ' s', onChange: (v) => { o.prep = v; t.change(); } });
  const sw = slider({ label: 'Work', min: 5, max: 300, value: o.work, unit: ' s', onChange: (v) => { o.work = v; t.change(); } });
  const sr = slider({ label: 'Rest', min: 0, max: 180, value: o.rest, unit: ' s', onChange: (v) => { o.rest = v; t.change(); } });
  const sn = slider({ label: 'Rounds', min: 1, max: 30, value: o.rounds, onChange: (v) => { o.rounds = v; t.change(); } });
  const settings = card('Settings', h('div', { class: 'stack' },
    h('div', { class: 'chips' }, h('button', { class: 'chip chip-btn', type: 'button', onclick: () => preset(20, 10, 8) }, 'Tabata 20/10 ×8'), h('button', { class: 'chip chip-btn', type: 'button', onclick: () => preset(40, 20, 8) }, 'HIIT 40/20 ×8'), h('button', { class: 'chip chip-btn', type: 'button', onclick: () => preset(60, 30, 6) }, '60/30 ×6')),
    sw, sr, sn, sp));
  t = phaseTimer(root, plan, [settings]);
  return t.cleanup;
};

// ------------------------------------------------------------------ Randomness (libsodium CSPRNG)
const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
export const dice: Mount = async (root) => {
  const na = await libsodium(); // the dice are rolled as the tab opens
  let n = 2, sides = 6;
  const out = h('div', { class: 'dice-row', 'aria-hidden': 'true' }), total = h('div', { class: 'big-value center' });
  // a screen reader heard nothing after Roll (the faces are pictures): the roll in words, announced
  const said = h('div', { class: 'sr-only', 'aria-live': 'polite' });
  const roll = () => {
    const vals = Array.from({ length: n }, () => na.uniform(sides) + 1);
    clear(out).append(...vals.map((v) => h('div', { class: 'die rolled' }, sides === 6 ? FACES[v - 1] : String(v))));
    total.textContent = n > 1 ? `Total ${vals.reduce((a, b) => a + b, 0)}` : '';
    said.textContent = `Rolled ${vals.length > 1 ? `${vals.slice(0, -1).join(', ')} and ${vals.at(-1)}` : vals[0]}${n > 1 ? `, total ${vals.reduce((a, b) => a + b, 0)}` : ''}.`;
  };
  root.append(card(null, out, total, said), card(null, stack(slider({ label: 'Dice', min: 1, max: 10, value: n, onInput: (v) => (n = v) }),
    field('Sides', segmented([['4', 'd4'], ['6', 'd6'], ['8', 'd8'], ['10', 'd10'], ['12', 'd12'], ['20', 'd20'], ['100', 'd100']], '6', (v) => (sides = +v))))),
  h('div', { class: 'actions' }, button('Roll', roll, { variant: 'primary', icon: 'Dices' })));
  roll();
};

export const coin: Mount = (root) => {
  let heads = 0, tails = 0, spin: Animation | null = null, na: Awaited<ReturnType<typeof libsodium>> | null = null;
  const face = h('div', { class: 'coin', 'aria-live': 'polite' }, '?'), stats = h('div', { class: 'muted center' });
  // the engine comes with the first flip (the coin shows "?" until then); later flips are immediate
  const flip = () => (na ? toss(na) : libsodium().then((e) => { na = e; toss(e); }));
  const toss = (na: { uniform(upper: number): number }) => {
    const isH = na.uniform(2) === 0;
    isH ? heads++ : tails++;
    face.textContent = isH ? 'Heads' : 'Tails'; face.className = `coin ${isH ? 'heads' : 'tails'}`;
    // the spin runs on every flip — a class put back unchanged did not restart it, so a second Heads looked like nothing happened
    spin?.cancel();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) spin = face.animate?.([{ transform: 'rotateY(720deg) scale(.8)' }, { transform: 'none' }], { duration: 600, easing: 'ease-out' }) ?? null;
    stats.textContent = `Heads ${heads} · Tails ${tails}`;
  };
  root.append(card(null, face, stats), h('div', { class: 'actions' }, button('Flip', flip, { variant: 'primary', icon: 'Coins' }), button('Reset', () => { heads = tails = 0; stats.textContent = ''; face.textContent = '?'; face.className = 'coin'; }, { icon: 'RotateCcw' })));
};

/** A whole number drawn uniformly from 0 … span − 1 for any span up to 2⁵³: 53 random bits from crypto.wasm, drawn again
 *  when they fall into the last, incomplete block (so no number is likelier than another). */
function draw53(na: Awaited<ReturnType<typeof sodium>>, span: number): number {
  const lim = Math.floor(2 ** 53 / span) * span;
  for (;;) {
    const r = na.uniform(2 ** 21) * 2 ** 32 + na.uniform(2 ** 16) * 2 ** 16 + na.uniform(2 ** 16);
    if (r < lim) return r % span;
  }
}
const SAFE = Number.MAX_SAFE_INTEGER;
export const rng: Mount = async (root) => {
  const na = await sodium();
  const min = input({ type: 'number', value: 1 }), max = input({ type: 'number', value: 100 }), count = input({ type: 'number', value: 1, min: 1, max: 1000 });
  let unique = false, sort = false;
  const out = h('div', { class: 'big-value center rng-out', 'aria-live': 'polite' }); // announced (a screen reader heard nothing)
  const gen = () => {
    if (min.value.trim() === '' || max.value.trim() === '') { out.textContent = `Enter the ${min.value.trim() === '' ? 'smallest' : 'largest'} number`; return; }
    const a = Math.ceil(+min.value), b = Math.floor(+max.value), c = Math.min(1000, Math.max(1, Math.floor(+count.value) || 1));
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > SAFE || Math.abs(b) > SAFE) { out.textContent = 'Use whole numbers between −9,007,199,254,740,991 and 9,007,199,254,740,991'; return; }
    if (!(b >= a)) { out.textContent = +max.value >= +min.value ? `There is no whole number from ${min.value} to ${max.value}` : 'Max must be ≥ min'; return; }
    if (b - a >= 2 ** 53) { out.textContent = 'Range too large — it may hold at most 9,007,199,254,740,992 numbers (2⁵³)'; return; } // exact: b − a + 1 can round
    const span = b - a + 1;
    if (unique && c > span) { out.textContent = `Only ${span} unique numbers exist in that range`; return; }
    let vals: number[];
    if (span <= 2 ** 32) vals = na.sample(span === 2 ** 32 ? 0 : span, c, unique).map((v) => a + v); // CSPRNG sampling in crypto.wasm
    else { // ten-digit numbers and the like (it used to say "Range too large" above 2³²)
      const seen = new Set<number>(); vals = [];
      while (vals.length < c) { const v = a + draw53(na, span); if (unique && seen.has(v)) continue; seen.add(v); vals.push(v); }
    }
    if (sort) vals.sort((x, y) => x - y);
    out.textContent = vals.join(', ');
  };
  root.append(card(null, h('div', { class: 'form-grid' }, field('Min', min), field('Max', max), field('How many', count)), h('div', { class: 'row' }, toggle('No repeats', false, (v) => (unique = v)), toggle('Sort', false, (v) => (sort = v)))),
    card('Result', out, button('Copy', () => copy(out.textContent || ''), { small: true, icon: 'Copy' })), h('div', { class: 'actions' }, button('Generate', gen, { variant: 'primary', icon: 'Shuffle' })), note('Uses a cryptographically secure generator (libsodium) — fair for draws and lotteries.'));
  gen();
};

/** The entries of a list box: one a line, or the parts of a single line split at its commas ("Chai, Kaapi, Lassi").
 *  `byLine`: once there is more than one line, a line is one entry — "Sharma, Rahul" stays one name. */
const items = (s: string, byLine = false) => {
  const lines = s.split(/\r?\n/).map((x) => x.trim()).filter((x) => x.replace(/,/g, '').trim());
  return (byLine && lines.length > 1 ? lines : lines.flatMap((l) => l.split(','))).map((x) => x.trim()).filter(Boolean);
};

export const picker: Mount = async (root) => {
  const na = await sodium();
  const ta = textarea({ rows: 8, value: 'Pizza\nBiryani\nDosa\nPaneer tikka\nPasta', placeholder: 'One item per line (or comma-separated)' });
  const n = input({ type: 'number', value: 1, min: 1 });
  const out = h('div', { class: 'pick-out', 'aria-live': 'polite' });
  const pick = () => {
    const list = items(ta.value), k = Math.min(list.length, Math.max(1, Math.floor(+n.value) || 1));
    if (!list.length) { out.textContent = 'Add some items first'; return; }
    clear(out).append(...na.shuffle(list).slice(0, k).map((x, i) => h('div', { class: 'pick-item' }, k > 1 ? h('span', { class: 'muted' }, `${i + 1}.`) : null, x)));
  };
  root.append(card(null, field('Items', ta), field('How many to pick', n)), card('Winner', out), h('div', { class: 'actions' }, button('Pick', pick, { variant: 'primary', icon: 'ListChecks' })));
};

export const teams: Mount = async (root) => {
  const na = await sodium();
  const ta = textarea({ rows: 8, value: 'Aarav\nDiya\nVihaan\nAnanya\nIshaan\nMeera\nKabir\nSara', placeholder: 'One name per line (or all on one line, comma-separated)' });
  let mode = 'count';
  const k = input({ type: 'number', value: 2, min: 1 });
  const out = h('div', { class: 'teams', 'aria-live': 'polite' });
  const split = () => {
    const names = na.shuffle(items(ta.value, true));
    if (!names.length) { clear(out).append(note('Add some names first.', 'warn')); return; }
    const v = Math.floor(+k.value);
    if (!(v >= 1)) { clear(out).append(note(mode === 'count' ? 'Enter how many teams to make (1 or more).' : 'Enter how many people go in a team (1 or more).', 'warn')); return; }
    const nTeams = mode === 'count' ? Math.min(names.length, v) : Math.ceil(names.length / v);
    const teamsArr: string[][] = Array.from({ length: nTeams }, () => []);
    names.forEach((x, i) => teamsArr[i % nTeams].push(x));
    clear(out).append(...teamsArr.map((t, i) => card(`Team ${i + 1} (${t.length})`, h('div', { class: 'stack' }, t.map((x) => h('div', null, x))))));
  };
  root.append(card(null, field('Names', ta), field('Split by', segmented([['count', 'Number of teams'], ['size', 'People per team']], mode, (v) => (mode = v))), field('Value', k)), out,
    h('div', { class: 'actions' }, button('Make teams', split, { variant: 'primary', icon: 'Users' })));
  split();
};
