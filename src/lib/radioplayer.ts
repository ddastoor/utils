// World Radio's player (potentials #116): one <audio> for the whole site, outside every tab — so that with "Keep playing in other apps"
// (owner, 28 Nov 2026: "I should have an option to keep playing when I switch to another app") a station plays on while another app of
// the site is open, in a small player at the foot of the page (the station, pause / play, stop, back to World Radio). Off, leaving World
// Radio stops the sound, as every tab lets its things go (CLAUDE.md §4) — the sound is the one exception the owner asked for. A station
// that does not play is said, marked, and the next one of its list tried — a few at most in a row (owner: "A station that won't play …
// is skipped and the reason is said, never a silent failure"); the lock screen and the media keys know the station (Media Session); a
// sleep timer. The station's sound comes from its own server (CSP media-src https:); nothing else does.
import { h, button } from '../ui';
import { worldradioSettings } from '../settings';
import * as R from './radio';
import type { Station } from './radio';
import './radioplayer.css';

export type PlayState = 'idle' | 'connecting' | 'playing' | 'paused' | 'failed';
export interface PlayerView {
  state: PlayState; station: Station | null;
  /** why the station shown did not play ('' while it plays) */ reason: string;
  /** a line for what happened on the way (skipped stations, the sleep timer, the end of the list) */ note: string;
  /** the stream is playing but waiting for more sound */ buffering: boolean;
  /** the list Next and Previous move in, and its place */ list: readonly Station[]; index: number;
  /** when the sleep timer stops the sound (ms since the epoch), 0 = off */ sleepAt: number;
}
/** how long a station may take to start sending sound */
export const CONNECT_MS = 15000;
/** stations skipped in a row before the player stops trying */
export const MAX_SKIPS = 5;

let audio: HTMLAudioElement | null = null;
let list: Station[] = [], index = -1, station: Station | null = null, state: PlayState = 'idle', reason = '', note = '';
let attempt = 0, reconnects = 0, onTab = false, sleepAt = 0, sleepTimer = 0, fadeTimer = 0, fading = false, buffering = false, playingSince = 0;
/** the stations skipped on the way to the one that plays (said once it plays: the owner wants every reason said) */
let skippedLog: Array<{ name: string; why: string }> = [];
const failed = new Map<string, string>(); // station id → why it did not play (this visit)
const counted = new Set<string>(); // the directory's click count, once a station a visit
const subs = new Set<() => void>();

export const view = (): PlayerView => ({ state, station, reason, note, buffering, list, index, sleepAt });
export const failedWhy = (id: string) => failed.get(id) ?? '';
export function subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
function emit() { subs.forEach((f) => { try { f(); } catch { /* a view that is gone */ } }); drawMini(); session(); }

function el(): HTMLAudioElement {
  if (audio) return audio;
  const a = document.createElement('audio');
  a.preload = 'none';
  a.setAttribute('aria-hidden', 'true');
  a.volume = worldradioSettings.get().volume;
  document.body.append(a); // outside every tab
  // paused from outside (the system, headphones taken out); not the end of a stream ('pause' comes first, then 'ended')
  a.addEventListener('pause', () => { if (state === 'playing' && !a.ended) { state = 'paused'; note = ''; buffering = false; emit(); } });
  a.addEventListener('play', () => { if (state === 'paused') { state = 'connecting'; emit(); } });
  a.addEventListener('playing', () => { const was = buffering; buffering = false; playingSince = Date.now(); if (state === 'connecting' || state === 'paused') { state = 'playing'; emit(); } else if (was) emit(); });
  a.addEventListener('waiting', () => { if (state === 'playing' && !buffering) { buffering = true; emit(); } });
  // a stream that ends or breaks while it plays: connected again once, then said — once more after it played a good while (a station
  // that drops its listeners now and then), not for ever (one that ends each time it starts)
  const broke = () => {
    if (state !== 'playing' || !station) return;
    buffering = false;
    if (Date.now() - playingSince > 30000) reconnects = 0;
    if (reconnects++ < 1) { note = 'The stream broke off — connecting again…'; emit(); void reconnect(); } else fail(R.REASON.stopped, false);
  };
  a.addEventListener('ended', broke);
  a.addEventListener('error', broke);
  return (audio = a);
}

/** the station's sound, or why it does not come (null: it plays) */
function tryStation(s: Station, my: number): Promise<string | null> {
  if (!R.isWebStream(s.url)) return Promise.resolve(R.REASON.notWeb);
  const a = el(), mime = R.codecMime(s.codec, s.hls);
  if (mime && a.canPlayType(mime) === '') return Promise.resolve(s.hls ? R.REASON.hls : R.REASON.format(s.codec));
  const { src, upgraded } = R.streamUrl(s.url);
  return new Promise((resolve) => {
    let settled = false;
    const done = (why: string | null) => {
      if (settled) return; settled = true;
      clearTimeout(t); a.removeEventListener('playing', ok); a.removeEventListener('error', bad);
      resolve(my === attempt ? why : 'stale');
    };
    const ok = () => done(null);
    const bad = () => done(upgraded ? R.REASON.http : !s.ok ? R.REASON.broken(s.checked) : R.REASON.offline);
    const t = setTimeout(bad, CONNECT_MS);
    a.addEventListener('playing', ok);
    a.addEventListener('error', bad);
    a.src = src;
    a.play().catch((e: unknown) => {
      if ((e as Error)?.name === 'NotAllowedError') done(R.REASON.blocked);
      // AbortError: a newer station took the element — that attempt is stale; NotSupportedError comes with an 'error' event
    });
  });
}

async function start(i: number, auto: boolean): Promise<void> {
  const my = ++attempt;
  index = i; station = list[i] ?? null; reason = ''; reconnects = 0; buffering = false;
  if (!station) { state = 'idle'; emit(); return; }
  state = 'connecting'; emit();
  const why = await tryStation(station, my);
  if (why === 'stale' || my !== attempt) return;
  if (why === null) {
    state = 'playing';
    note = !skippedLog.length ? '' : skippedLog.length === 1 ? `${skippedLog[0].name} did not play (${skippedLog[0].why}) — playing ${station.name} instead.`
      : `${skippedLog.length} stations did not play (each is marked in the list with its reason) — playing ${station.name}.`;
    skippedLog = [];
    emit();
    if (!counted.has(station.id)) { counted.add(station.id); void R.directory(`/json/url/${station.id}`).catch(() => { /* a courtesy to the directory */ }); }
    return;
  }
  if (why === R.REASON.blocked) { state = 'paused'; reason = ''; note = 'The browser wants a tap before it plays sound — press Play.'; emit(); return; }
  fail(why, auto);
}
let skipped = 0;
function fail(why: string, auto: boolean) {
  if (!station) return;
  const gone = station;
  failed.set(gone.id, why);
  const a = el(); a.pause(); a.removeAttribute('src'); a.load();
  state = 'failed'; reason = why; buffering = false;
  if (auto && ++skipped < MAX_SKIPS) {
    const j = nextIndex(index);
    if (j >= 0) { skippedLog.push({ name: gone.name, why }); note = `${gone.name} did not play: ${why}. Trying ${list[j].name}…`; emit(); void start(j, true); return; }
    note = skippedLog.length ? `${skippedLog.length + 1} stations did not play, and no other station is left in this list (each is marked with its reason).` : 'No other station is left in this list.';
  } else note = auto ? `${MAX_SKIPS} stations in a row did not play — stopped trying (each is marked in the list with its reason). Press Next to go on.` : '';
  skipped = 0; skippedLog = []; emit();
}
async function reconnect() {
  if (!station) return;
  const s = station, my = ++attempt;
  state = 'connecting'; emit();
  const why = await tryStation(s, my);
  if (why === 'stale' || my !== attempt) return;
  if (why === null) { state = 'playing'; note = ''; emit(); } else fail(R.REASON.stopped, false);
}
const nextIndex = (from: number) => { for (let j = from + 1; j < list.length; j++) if (!failed.has(list[j].id)) return j; return -1; };
const prevIndex = (from: number) => { for (let j = from - 1; j >= 0; j--) if (!failed.has(list[j].id)) return j; return -1; };

// ------------------------------------------------------------------ what the tab (and the small player, the lock screen) ask for
/** play station `i` of `stations` (the list Next and Previous then move in) */
export function play(stations: readonly Station[], i: number) {
  list = [...stations]; skipped = 0; note = ''; skippedLog = [];
  failed.delete(list[i]?.id ?? ''); // asked for by name: tried again
  void start(i, true);
}
/** pause: the stream's connection let go too (a live station resumed from a buffer would be minutes late) */
export function pause() {
  if (!audio || (state !== 'playing' && state !== 'connecting')) return;
  attempt++; state = 'paused'; note = ''; buffering = false;
  audio.pause(); audio.removeAttribute('src'); audio.load();
  emit();
}
/** play the station shown again: connected afresh, so it is live */
export function resume() { if (!station) return; skipped = 0; skippedLog = []; note = ''; void start(index, false); }
export const toggle = () => (state === 'playing' || state === 'connecting' ? pause() : resume());
export function stop() {
  attempt++;
  if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
  state = 'idle'; reason = ''; note = ''; buffering = false; skippedLog = []; setSleep(0); emit();
}
export function next() { const j = nextIndex(index); if (j >= 0) { skipped = 0; skippedLog = []; note = ''; void start(j, true); } else { note = 'This is the last station of the list.'; emit(); } }
export function prev() { const j = prevIndex(index); if (j >= 0) { skipped = 0; skippedLog = []; note = ''; void start(j, true); } else { note = 'This is the first station of the list.'; emit(); } }
/** the list changed under the player (a favourite taken off): Next and Previous move in the new one, the station playing stays */
export function relist(stations: readonly Station[]) {
  if (!station) return;
  const i = stations.findIndex((s) => s.id === station!.id);
  if (i >= 0) { list = [...stations]; index = i; emit(); }
}
export function setVolume(v: number) {
  const x = Math.min(1, Math.max(0, v));
  el().volume = x;
  // a setting, without a settings file of its own (it goes into the next one): a file at every turn of the knob would be many
  worldradioSettings.setQuietly({ volume: x });
}
/** stop after `min` minutes (0: off) — the sound fades over the last 8 seconds */
export function setSleep(min: number) {
  clearTimeout(sleepTimer); clearInterval(fadeTimer);
  if (fading && audio) audio.volume = worldradioSettings.get().volume;
  fading = false;
  sleepAt = min > 0 ? Date.now() + min * 60000 : 0;
  if (sleepAt) sleepTimer = window.setTimeout(() => {
    const a = el(), v0 = worldradioSettings.get().volume, t0 = Date.now();
    fading = true;
    fadeTimer = window.setInterval(() => {
      const f = 1 - (Date.now() - t0) / 8000;
      if (f <= 0) { stop(); note = 'The sleep timer stopped the radio.'; emit(); } else a.volume = v0 * f;
    }, 200);
  }, Math.max(0, sleepAt - Date.now() - 8000));
  emit();
}

// ------------------------------------------------------------------ the tab comes and goes
/** World Radio is open: its own player shows the station */
export function entered() { onTab = true; drawMini(); }
/** World Radio is left: the sound plays on in the small player when the owner asked for it, else it stops */
export function left() {
  onTab = false;
  if (!worldradioSettings.get().keep && state !== 'idle') stop();
  drawMini();
}
worldradioSettings.on(() => {
  if (audio && !fading && Math.abs(audio.volume - worldradioSettings.get().volume) > 0.001) audio.volume = worldradioSettings.get().volume;
  if (!onTab && !worldradioSettings.get().keep && state !== 'idle') stop(); // switched off on the Settings page while it played on
  drawMini();
});

// ------------------------------------------------------------------ the small player at the foot of every other page
let mini: HTMLElement | null = null;
function drawMini() {
  const show = !onTab && worldradioSettings.get().keep && !!station && (state === 'playing' || state === 'connecting' || state === 'paused');
  document.documentElement.classList.toggle('radio-mini-on', show);
  if (!show) { if (mini) mini.hidden = true; return; }
  if (!mini) {
    mini = h('div', { class: 'radio-mini', role: 'region', 'aria-label': 'World Radio' });
    document.body.append(mini);
  }
  const s = station!, playing = state === 'playing' || state === 'connecting';
  mini.hidden = false;
  mini.replaceChildren(
    h('span', { class: 'radio-letter', style: `--hue:${R.hueOf(s.name)}`, 'aria-hidden': 'true' }, R.letterOf(s.name)),
    h('a', { class: 'radio-mini-name', href: '#/worldradio', title: 'Back to World Radio' }, h('span', { class: 'radio-mini-title' }, s.name),
      h('span', { class: 'radio-mini-state small' }, state === 'connecting' ? 'Connecting…' : state === 'paused' ? 'Paused' : buffering ? 'Waiting for the stream…' : 'Playing — World Radio')),
    button(playing ? 'Pause' : 'Play', () => toggle(), { icon: playing ? 'Pause' : 'Play', small: true, title: playing ? 'Pause the radio' : 'Play the radio' }),
    button('', () => stop(), { icon: 'X', small: true, variant: 'ghost', title: 'Stop the radio' }),
  );
}

// ------------------------------------------------------------------ the lock screen, the media keys (Media Session)
let handlers = false;
function session() {
  const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
  if (!ms) return;
  if (!handlers) {
    handlers = true;
    const set = (a: MediaSessionAction, f: () => void) => { try { ms.setActionHandler(a, f); } catch { /* not offered here */ } };
    set('play', () => resume()); set('pause', () => pause()); set('stop', () => stop());
    set('nexttrack', () => next()); set('previoustrack', () => prev());
  }
  if (!station || state === 'idle') { ms.playbackState = 'none'; ms.metadata = null; return; }
  ms.playbackState = state === 'paused' || state === 'failed' ? 'paused' : 'playing';
  const s = station;
  if (ms.metadata?.title !== s.name) {
    try { ms.metadata = new MediaMetadata({ title: s.name, artist: [s.country, s.lang].filter(Boolean).join(' · ') || 'World Radio', album: 'World Radio — SuperUtils', artwork: [{ src: art(s.name), sizes: '256x256', type: 'image/png' }] }); } catch { /* an old browser */ }
  }
}
/** the station's letter in its circle, as a picture for the lock screen (the station's own logo would come from its server) */
function art(name: string): string {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = `hsl(${R.hueOf(name)} 55% 42%)`; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#fff'; g.font = '600 140px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(R.letterOf(name), 128, 138);
    return c.toDataURL('image/png');
  } catch { return ''; }
}
