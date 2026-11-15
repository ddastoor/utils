// Everyday: timers (stopwatch, countdown, Pomodoro, interval) and randomness (libsodium CSPRNG via crypto.wasm).
import { h, card, field, input, textarea, button, segmented, toggle, slider, clear, stack, note, copy, type Mount } from '../ui';
import { sodium } from '../wasm/crypto';

// ------------------------------------------------------------------ shared timer helpers
const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, '0');
export const clock = (ms: number, hundredths = false) => {
  const t = Math.max(0, ms), hh = Math.floor(t / 3600000), mm = Math.floor((t % 3600000) / 60000), ss = Math.floor((t % 60000) / 1000);
  return `${hh ? `${hh}:` : ''}${pad(mm)}:${pad(ss)}${hundredths ? `.${pad((t % 1000) / 10)}` : ''}`;
};
let audio: AudioContext | null = null;
export function beep(times = 3, freq = 880) {
  audio ||= new AudioContext();
  const now = audio.currentTime;
  for (let i = 0; i < times; i++) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = freq; o.connect(g).connect(audio.destination);
    g.gain.setValueAtTime(0.0001, now + i * 0.35); g.gain.exponentialRampToValueAtTime(0.35, now + i * 0.35 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.35 + 0.25);
    o.start(now + i * 0.35); o.stop(now + i * 0.35 + 0.3);
  }
  navigator.vibrate?.([200, 100, 200, 100, 200]);
}
/** Keeps the screen on while a timer runs (where supported). */
function wakeLock() {
  let lock: any = null;
  return {
    async on() { try { lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* ignore */ } },
    off() { lock?.release?.(); lock = null; },
  };
}
const display = (cls = '') => h('div', { class: `timer-display ${cls}` });

// ------------------------------------------------------------------ Stopwatch
export const stopwatch: Mount = (root) => {
  let start = 0, acc = 0, running = false, raf = 0, lastLap = 0;
  const disp = display();
  const laps = h('div', { class: 'laps' });
  const wl = wakeLock();
  const elapsed = () => acc + (running ? performance.now() - start : 0);
  const tick = () => { disp.textContent = clock(elapsed(), true); if (running) raf = requestAnimationFrame(tick); };
  const startStop = button('Start', () => {
    if (running) { acc += performance.now() - start; running = false; wl.off(); }
    else { start = performance.now(); running = true; wl.on(); tick(); }
    startStop.setLabel(running ? 'Stop' : 'Start');
  }, { variant: 'primary', icon: 'Play' });
  const lap = button('Lap', () => {
    const t = elapsed(); if (!t) return;
    const n = laps.children.length + 1;
    laps.prepend(h('div', { class: 'lap' }, h('span', null, `Lap ${n}`), h('span', { class: 'mono' }, clock(t - lastLap, true)), h('span', { class: 'mono muted' }, clock(t, true))));
    lastLap = t;
  }, { icon: 'Flag' });
  const reset = button('Reset', () => { running = false; acc = 0; lastLap = 0; wl.off(); clear(laps); startStop.setLabel('Start'); tick(); }, { icon: 'RotateCcw' });
  root.append(card(null, disp, h('div', { class: 'actions inline center-row' }, startStop, lap, reset)), card('Laps', laps));
  tick();
  return () => { cancelAnimationFrame(raf); wl.off(); };
};

// ------------------------------------------------------------------ Countdown
export const countdown: Mount = (root) => {
  let endAt = 0, remaining = 5 * 60000, running = false, raf = 0;
  const disp = display('big');
  const wl = wakeLock();
  const hI = input({ type: 'number', value: 0, min: 0 }), mI = input({ type: 'number', value: 5, min: 0 }), sI = input({ type: 'number', value: 0, min: 0 });
  const total = () => ((+hI.value || 0) * 3600 + (+mI.value || 0) * 60 + (+sI.value || 0)) * 1000;
  const tick = () => {
    const left = running ? endAt - performance.now() : remaining;
    disp.textContent = clock(Math.ceil(left / 1000) * 1000);
    document.title = running ? `${clock(Math.ceil(left / 1000) * 1000)} · Countdown` : document.title;
    if (running && left <= 0) { running = false; remaining = 0; wl.off(); beep(4); disp.classList.add('done'); go.setLabel('Start'); return; }
    if (running) raf = requestAnimationFrame(tick);
  };
  const go = button('Start', () => {
    if (running) { remaining = endAt - performance.now(); running = false; wl.off(); }
    else { if (remaining <= 0) remaining = total(); endAt = performance.now() + remaining; running = true; disp.classList.remove('done'); wl.on(); tick(); }
    go.setLabel(running ? 'Pause' : 'Start');
  }, { variant: 'primary', icon: 'Play' });
  const reset = () => { running = false; remaining = total(); wl.off(); disp.classList.remove('done'); go.setLabel('Start'); tick(); };
  [hI, mI, sI].forEach((x) => x.addEventListener('input', reset));
  const presets = h('div', { class: 'chips' }, [1, 3, 5, 10, 15, 30, 60].map((m) => h('button', { class: 'chip chip-btn', type: 'button', onclick: () => { hI.value = String(Math.floor(m / 60)); mI.value = String(m % 60); sI.value = '0'; reset(); } }, m < 60 ? `${m} min` : '1 hour')));
  root.append(card(null, disp, h('div', { class: 'actions inline center-row' }, go, button('Reset', reset, { icon: 'RotateCcw' }))),
    card('Set time', h('div', { class: 'form-grid' }, field('Hours', hI), field('Minutes', mI), field('Seconds', sI)), presets), note('Keep this tab open; the screen stays awake while the timer runs (where supported).'));
  tick();
  return () => { cancelAnimationFrame(raf); wl.off(); };
};

// ------------------------------------------------------------------ Pomodoro & Interval share a phase engine
function phaseTimer(root: HTMLElement, phases: () => Array<{ name: string; ms: number; cls: string }>, extra: Node[], rounds = true) {
  let i = 0, endAt = 0, left = 0, running = false, raf = 0;
  const disp = display('big'), label = h('div', { class: 'phase-label' }), count = h('div', { class: 'muted center' });
  const wl = wakeLock();
  const cur = () => phases()[i % phases().length];
  const show = () => {
    const p = cur(), l = running ? endAt - performance.now() : left;
    disp.textContent = clock(Math.ceil(l / 1000) * 1000);
    label.textContent = p.name; label.className = `phase-label ${p.cls}`;
    count.textContent = rounds ? `Step ${i + 1} of ${phases().length}` : '';
    if (running && l <= 0) {
      beep(2, p.cls === 'work' ? 660 : 990);
      i++;
      if (i >= phases().length) { running = false; i = 0; left = cur().ms; wl.off(); go.setLabel('Start'); beep(4); show(); return; }
      endAt = performance.now() + cur().ms;
    }
    if (running) raf = requestAnimationFrame(show);
  };
  const go = button('Start', () => {
    if (running) { left = endAt - performance.now(); running = false; wl.off(); }
    else { if (left <= 0) left = cur().ms; endAt = performance.now() + left; running = true; wl.on(); show(); }
    go.setLabel(running ? 'Pause' : 'Start');
  }, { variant: 'primary', icon: 'Play' });
  const reset = () => { running = false; i = 0; left = cur().ms; wl.off(); go.setLabel('Start'); show(); };
  root.append(card(null, label, disp, count, h('div', { class: 'actions inline center-row' }, go, button('Skip', () => { left = 0; endAt = performance.now(); if (!running) { i = (i + 1) % phases().length; left = cur().ms; show(); } }, { icon: 'SkipForward' }), button('Reset', reset, { icon: 'RotateCcw' }))), ...extra);
  reset();
  return { reset, cleanup: () => { cancelAnimationFrame(raf); wl.off(); } };
}

export const pomodoro: Mount = (root) => {
  const o = { work: 25, short: 5, long: 15, cycles: 4 };
  const phases = () => Array.from({ length: o.cycles }, (_, k) => [{ name: 'Focus', ms: o.work * 60000, cls: 'work' }, { name: k === o.cycles - 1 ? 'Long break' : 'Short break', ms: (k === o.cycles - 1 ? o.long : o.short) * 60000, cls: 'rest' }]).flat();
  let t: ReturnType<typeof phaseTimer>;
  const settings = card('Settings', h('div', { class: 'stack' },
    slider({ label: 'Focus', min: 5, max: 90, value: o.work, unit: ' min', onChange: (v) => { o.work = v; t.reset(); } }),
    slider({ label: 'Short break', min: 1, max: 30, value: o.short, unit: ' min', onChange: (v) => { o.short = v; t.reset(); } }),
    slider({ label: 'Long break', min: 5, max: 60, value: o.long, unit: ' min', onChange: (v) => { o.long = v; t.reset(); } }),
    slider({ label: 'Focus sessions', min: 1, max: 8, value: o.cycles, onChange: (v) => { o.cycles = v; t.reset(); } })));
  t = phaseTimer(root, phases, [settings]);
  return t.cleanup;
};

export const interval: Mount = (root) => {
  const o = { work: 40, rest: 20, rounds: 8, prep: 10 };
  const phases = () => [{ name: 'Get ready', ms: o.prep * 1000, cls: 'prep' }, ...Array.from({ length: o.rounds }, (_, k) => [{ name: `Work · round ${k + 1}`, ms: o.work * 1000, cls: 'work' }, ...(k < o.rounds - 1 ? [{ name: 'Rest', ms: o.rest * 1000, cls: 'rest' }] : [])]).flat()];
  let t: ReturnType<typeof phaseTimer>;
  const preset = (w: number, r: number, n: number) => { o.work = w; o.rest = r; o.rounds = n; t.reset(); };
  const settings = card('Settings', h('div', { class: 'stack' },
    h('div', { class: 'chips' }, h('button', { class: 'chip chip-btn', type: 'button', onclick: () => preset(20, 10, 8) }, 'Tabata 20/10 ×8'), h('button', { class: 'chip chip-btn', type: 'button', onclick: () => preset(40, 20, 8) }, 'HIIT 40/20 ×8'), h('button', { class: 'chip chip-btn', type: 'button', onclick: () => preset(60, 30, 6) }, '60/30 ×6')),
    slider({ label: 'Work', min: 5, max: 300, value: o.work, unit: ' s', onChange: (v) => { o.work = v; t.reset(); } }),
    slider({ label: 'Rest', min: 0, max: 180, value: o.rest, unit: ' s', onChange: (v) => { o.rest = v; t.reset(); } }),
    slider({ label: 'Rounds', min: 1, max: 30, value: o.rounds, onChange: (v) => { o.rounds = v; t.reset(); } })));
  t = phaseTimer(root, phases, [settings]);
  return t.cleanup;
};

// ------------------------------------------------------------------ Randomness (libsodium CSPRNG)
const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
export const dice: Mount = async (root) => {
  const na = await sodium();
  let n = 2, sides = 6;
  const out = h('div', { class: 'dice-row' }), total = h('div', { class: 'big-value center' });
  const roll = () => {
    const vals = Array.from({ length: n }, () => na.uniform(sides) + 1);
    clear(out).append(...vals.map((v) => h('div', { class: 'die rolled' }, sides === 6 ? FACES[v - 1] : String(v))));
    total.textContent = n > 1 ? `Total ${vals.reduce((a, b) => a + b, 0)}` : '';
  };
  root.append(card(null, out, total), card(null, stack(slider({ label: 'Dice', min: 1, max: 10, value: n, onInput: (v) => (n = v) }),
    field('Sides', segmented([['4', 'd4'], ['6', 'd6'], ['8', 'd8'], ['10', 'd10'], ['12', 'd12'], ['20', 'd20'], ['100', 'd100']], '6', (v) => (sides = +v))))),
  h('div', { class: 'actions' }, button('Roll', roll, { variant: 'primary', icon: 'Dices' })));
  roll();
};

export const coin: Mount = async (root) => {
  const na = await sodium();
  let heads = 0, tails = 0;
  const face = h('div', { class: 'coin' }, '?'), stats = h('div', { class: 'muted center' });
  const flip = () => {
    const isH = na.uniform(2) === 0;
    isH ? heads++ : tails++;
    face.textContent = isH ? 'Heads' : 'Tails'; face.className = `coin flip ${isH ? 'heads' : 'tails'}`;
    stats.textContent = `Heads ${heads} · Tails ${tails}`;
  };
  root.append(card(null, face, stats), h('div', { class: 'actions' }, button('Flip', flip, { variant: 'primary', icon: 'Coins' }), button('Reset', () => { heads = tails = 0; stats.textContent = ''; face.textContent = '?'; }, { icon: 'RotateCcw' })));
};

export const rng: Mount = async (root) => {
  const na = await sodium();
  const min = input({ type: 'number', value: 1 }), max = input({ type: 'number', value: 100 }), count = input({ type: 'number', value: 1, min: 1, max: 1000 });
  let unique = false, sort = false;
  const out = h('div', { class: 'big-value center rng-out' });
  const gen = () => {
    const a = Math.ceil(+min.value), b = Math.floor(+max.value), c = Math.min(1000, Math.max(1, Math.floor(+count.value)));
    if (!(b >= a)) { out.textContent = 'Max must be ≥ min'; return; }
    const span = b - a + 1;
    if (span > 2 ** 32) { out.textContent = 'Range too large'; return; }
    if (unique && c > span) { out.textContent = `Only ${span} unique numbers exist in that range`; return; }
    const seen = new Set<number>(), vals: number[] = [];
    while (vals.length < c) { const v = a + na.uniform(span); if (unique && seen.has(v)) continue; seen.add(v); vals.push(v); }
    if (sort) vals.sort((x, y) => x - y);
    out.textContent = vals.join(', ');
  };
  root.append(card(null, h('div', { class: 'form-grid' }, field('Min', min), field('Max', max), field('How many', count)), h('div', { class: 'row' }, toggle('No repeats', false, (v) => (unique = v)), toggle('Sort', false, (v) => (sort = v)))),
    card('Result', out, button('Copy', () => copy(out.textContent || ''), { small: true, icon: 'Copy' })), h('div', { class: 'actions' }, button('Generate', gen, { variant: 'primary', icon: 'Shuffle' })), note('Uses a cryptographically secure generator (libsodium) — fair for draws and lotteries.'));
  gen();
};

const items = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
export function shuffleWith<T>(arr: T[], uniform: (n: number) => number) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = uniform(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export const picker: Mount = async (root) => {
  const na = await sodium();
  const ta = textarea({ rows: 8, value: 'Pizza\nBiryani\nDosa\nPaneer tikka\nPasta', placeholder: 'One item per line (or comma-separated)' });
  const n = input({ type: 'number', value: 1, min: 1 });
  const out = h('div', { class: 'pick-out' });
  const pick = () => {
    const list = items(ta.value), k = Math.min(list.length, Math.max(1, +n.value || 1));
    if (!list.length) { out.textContent = 'Add some items first'; return; }
    clear(out).append(...shuffleWith(list, (x) => na.uniform(x)).slice(0, k).map((x, i) => h('div', { class: 'pick-item' }, k > 1 ? h('span', { class: 'muted' }, `${i + 1}.`) : null, x)));
  };
  root.append(card(null, field('Items', ta), field('How many to pick', n)), card('Winner', out), h('div', { class: 'actions' }, button('Pick', pick, { variant: 'primary', icon: 'ListChecks' })));
};

export const teams: Mount = async (root) => {
  const na = await sodium();
  const ta = textarea({ rows: 8, value: 'Aarav\nDiya\nVihaan\nAnanya\nIshaan\nMeera\nKabir\nSara', placeholder: 'One name per line' });
  let mode = 'count';
  const k = input({ type: 'number', value: 2, min: 1 });
  const out = h('div', { class: 'teams' });
  const split = () => {
    const names = shuffleWith(items(ta.value), (x) => na.uniform(x));
    if (!names.length) return;
    const nTeams = mode === 'count' ? Math.max(1, Math.min(names.length, +k.value || 2)) : Math.max(1, Math.ceil(names.length / Math.max(1, +k.value || 2)));
    const teamsArr: string[][] = Array.from({ length: nTeams }, () => []);
    names.forEach((x, i) => teamsArr[i % nTeams].push(x));
    clear(out).append(...teamsArr.map((t, i) => card(`Team ${i + 1} (${t.length})`, h('div', { class: 'stack' }, t.map((x) => h('div', null, x))))));
  };
  root.append(card(null, field('Names', ta), field('Split by', segmented([['count', 'Number of teams'], ['size', 'People per team']], mode, (v) => (mode = v))), field('Value', k)), out,
    h('div', { class: 'actions' }, button('Make teams', split, { variant: 'primary', icon: 'Users' })));
  split();
};
