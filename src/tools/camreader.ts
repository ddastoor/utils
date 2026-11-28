// Camera Reader (potentials #81; owner's pick of 27 Nov 2026 — group 4 of the suggested order): point the phone at printed text
// — a letter, a medicine leaflet, a menu — and it is read aloud; for parents, elders and small print. The photo is read by the OCR
// tab's reading path (src/lib/readpage.ts: the page found and straightened, set upright and level, cleaned up, a page of columns
// read column by column, PaddleOCR for a soft photo) and its lists set out (src/lib/listtext.ts); its paragraphs, the pieces read
// one at a time and how each is spoken by src/lib/readertext.ts; the voices of the Text-to-Speech tab by src/lib/sayer.ts. The
// text is shown large, the piece being heard marked and kept in view; a tap on a piece reads from there. PC + phones.
import { h, card, field, stack, note, button, toggle, segmented, progress, clear, toast, errMsg, copy, actions, type Mount } from '../ui';
import { imageInput } from '../lib/imgtools';
import type { Img } from '../wasm/imgproc';
import { VOICES, V, type Voice } from '../lib/voices';
import { pageParas, speakable, type Para } from '../lib/readertext';
import { sayer, type SayState } from '../lib/sayer';
import { screenOn } from '../lib/wakelock';
import { give } from '../lib/handoff';
import { camreaderSettings, CAMREADER_SIZES as SIZES } from '../settings';
import './camreader.css';

const SPEEDS: Array<[string, string]> = [['0.8', 'Slower'], ['1', 'Normal'], ['1.2', 'Faster']];

export const mount: Mount = (root, ctx) => {
  // the voice, the speed, the text's size and reading at once are the Settings' (to-do #39: kept in this browser, in the settings file);
  // a voice of this device is kept by its name ("sys:Microsoft Zira"), the select names it by its place in the device's list
  let kept = camreaderSettings.get();
  let seq = 0, gone = false, reads = 0;
  let paras: Para[] = [], spans: HTMLElement[] = [], sysVoices: SpeechSynthesisVoice[] = [];
  const prog = progress();
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const say = h('div', { class: 'small', 'aria-live': 'polite' });
  const text = h('div', { class: 'cr-text', lang: 'en' });
  const wake = screenOn();

  // ---------------------------------------------------------------- the voice
  const allVoices = () => VOICES.flatMap(([, vs]) => vs);
  const vsel = h('select', { class: 'input', 'aria-label': 'Voice' }) as HTMLSelectElement;
  const hint = h('div', { class: 'muted small' });
  const voiceOf = (id: string): [Voice, SpeechSynthesisVoice?] => {
    if (id.startsWith('sys:') && sysVoices[+id.slice(4)]) { const k = +id.slice(4); return [V(id, sysVoices[k].name, 'system', 'a', k), sysVoices[k]]; }
    return [allVoices().find((v) => v.id === id) ?? allVoices()[0]];
  };
  const fillVoices = () => {
    vsel.replaceChildren(...VOICES.map(([g, vs]) => h('optgroup', { label: g }, ...vs.map((v) => h('option', { value: v.id }, v.label)))),
      ...(sysVoices.length ? [h('optgroup', { label: 'This device’s voices (start at once)' }, ...sysVoices.map((v, i) => h('option', { value: `sys:${i}` }, v.name)))] : []));
    if (!kept.voice.startsWith('sys:')) vsel.value = kept.voice;
    else { const i = sysVoices.findIndex((v) => v.name === kept.voice.slice(4)); vsel.value = i >= 0 ? `sys:${i}` : 'af_heart'; }
    if (!vsel.value) vsel.value = 'af_heart';
    sayHint();
  };
  const sayHint = () => {
    const [v] = voiceOf(vsel.value);
    hint.textContent = v.engine === 'piper' ? 'Indian English voice — 77 MB the first time, then it starts at once.'
      : v.engine === 'kokoro' ? 'A natural voice made on this device — 92 MB the first time, then it starts at once.'
        : 'A voice of this device: it starts at once.';
  };
  const loadSys = () => { try { sysVoices = speechSynthesis.getVoices().filter((v) => v.localService && /^en/i.test(v.lang)); fillVoices(); } catch { /* no Web Speech */ } };

  // ---------------------------------------------------------------- the player
  const playBtn = button('Read aloud', () => { sp.unlock(); if (sp.state === 'paused') sp.resume(); else sp.play(sp.state === 'ended' || sp.current < 0 ? 0 : sp.current); }, { icon: 'Play', variant: 'primary' });
  const pauseBtn = button('Pause', () => sp.pause(), { icon: 'Pause', variant: 'primary' });
  const backBtn = button('Back', () => { sp.unlock(); sp.play(Math.max(0, sp.current - 1)); }, { icon: 'SkipBack', title: 'The piece before' });
  const nextBtn = button('Next', () => { sp.unlock(); sp.play(Math.min(spans.length - 1, sp.current + 1)); }, { icon: 'SkipForward', title: 'The next piece' });
  const stopBtn = button('Stop', () => sp.stop(), { icon: 'Square', title: 'Stop and go back to the start' });
  pauseBtn.hidden = true;
  const sp = sayer({
    onPiece: (i) => {
      for (const s of text.querySelectorAll('.cr-s.on')) { s.classList.remove('on'); s.removeAttribute('aria-current'); }
      const el = spans[i];
      if (!el) { say.textContent = ''; return; }
      el.classList.add('on'); el.setAttribute('aria-current', 'true');
      const r = el.getBoundingClientRect(), top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--navh')) || 0;
      const bottom = innerHeight - (ctx.isMobile ? 96 : 0);
      if (r.top < top + 40 || r.bottom > bottom - 40) el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      say.textContent = `Reading ${i + 1} of ${spans.length}`;
    },
    onState: (s: SayState) => {
      root.dataset.state = s;
      const going = s === 'playing' || s === 'loading' || s === 'waiting';
      playBtn.hidden = going; pauseBtn.hidden = !going;
      playBtn.setLabel(s === 'paused' ? 'Go on' : s === 'ended' ? 'Read again' : 'Read aloud');
      if (going) wake.on(); else wake.off();
      if (s === 'loading') say.textContent = 'Getting the voice ready…';
      if (s === 'waiting') say.textContent = 'The voice is catching up…';
      if (s === 'ended') say.textContent = 'Read to the end.';
      if (s === 'paused') say.textContent = 'Paused.';
    },
    onLoad: (p, t) => { if (p === null) prog.done(); else prog.set(p, t); },
    onError: (m) => toast(m, 'err'),
  });
  // any tap or key in the tab lets the sound start later on its own (Safari: only in a user's gesture)
  const unlock = () => sp.unlock();
  root.addEventListener('pointerdown', unlock, true);
  root.addEventListener('keydown', unlock, true);
  vsel.addEventListener('change', () => {
    const val = vsel.value;
    camreaderSettings.set({ voice: val.startsWith('sys:') ? `sys:${sysVoices[+val.slice(4)]?.name ?? ''}` : val }); kept = camreaderSettings.get();
    sayHint(); const [v, sv] = voiceOf(val); sp.setVoice(v, sv);
  });
  const speedSel = segmented<string>(SPEEDS, kept.speed, (v) => { camreaderSettings.set({ speed: v as '0.8' | '1' | '1.2' }); kept = camreaderSettings.get(); sp.setSpeed(+v); });
  const sizeSay = h('span', { class: 'muted small' });
  const applySize = () => { text.style.setProperty('--cr-size', `${kept.size}px`); sizeSay.textContent = `${kept.size} px`; };
  const setSize = (n: number) => { camreaderSettings.set({ size: n as (typeof SIZES)[number] }); kept = camreaderSettings.get(); applySize(); };
  const smaller = button('Smaller text', () => setSize([...SIZES].reverse().find((x) => x < kept.size) ?? SIZES[0]), { icon: 'AArrowDown', small: true });
  const larger = button('Larger text', () => setSize(SIZES.find((x) => x > kept.size) ?? SIZES[SIZES.length - 1]), { icon: 'AArrowUp', small: true });
  const auto = toggle('Read aloud as soon as the page is read', kept.auto, (v) => { camreaderSettings.set({ auto: v }); kept = camreaderSettings.get(); });
  // changed elsewhere (the Settings page in another tab, an import there): the tab follows
  const offSettings = camreaderSettings.on((local) => {
    if (local || gone) return;
    kept = camreaderSettings.get();
    fillVoices(); speedSel.value = kept.speed; applySize(); auto.checked = kept.auto;
    const [v, sv] = voiceOf(vsel.value); sp.setVoice(v, sv); sp.setSpeed(+kept.speed);
  });

  // ---------------------------------------------------------------- the page, shown
  function draw() {
    clear(text); spans = [];
    for (const p of paras) {
      const el = h('p', { class: `cr-p cr-${p.kind}` });
      p.pieces.forEach((pc, k) => {
        if (!speakable(pc)) { el.append(pc.text, pc.br ? h('br') : ' '); return; }
        const i = spans.length, s = h('span', { class: 'cr-s', 'data-i': String(i) }, pc.text);
        s.addEventListener('click', () => { sp.unlock(); sp.play(i); });
        spans.push(s);
        el.append(s, pc.br ? h('br') : k < p.pieces.length - 1 ? ' ' : '');
      });
      text.append(el);
    }
    sp.setPieces(paras.flatMap((p) => p.pieces).filter(speakable).map((pc) => ({ say: pc.say, pause: pc.pause })));
  }
  const plain = () => paras.map((p) => p.pieces.map((pc) => pc.text + (pc.br ? '\n' : ' ')).join('').trim()).join('\n\n');

  async function run(img: Img, file?: File) {
    const my = ++seq, stale = () => gone || my !== seq;
    sp.stop(); status.textContent = ''; say.textContent = '';
    root.setAttribute('aria-busy', 'true');
    try {
      prog.set(null, 'Reading the page…');
      const [{ readPage, readsPoorly, secondWords }, { listText }, { readExif }] = await Promise.all([import('../lib/readpage'), import('../lib/listtext'), import('../lib/exif')]);
      // the lens, where the photo's EXIF says (a phone's JPEG does): the camera of a book's pages drawn flat
      const f35 = file ? (await readExif(file).catch(() => null))?.focal35 ?? 0 : 0;
      if (stale()) return;
      const res = await readPage(img, {
        lang: 'eng', clean: true, auto: true, retryTurns: true, invertDark: true, stale, f35,
        onProgress: (p, s) => { if (!stale()) prog.set(/recogn/i.test(s) ? p : null, /recogn/i.test(s) ? `Reading the page… ${Math.round(p * 100)} %` : 'Loading the text engine…'); },
        onRetry: () => { if (!stale()) prog.set(null, 'The text reads badly — trying the photo turned…'); },
        onSecond: (q) => { if (!stale()) { const w = secondWords(q); prog.set(w.p, w.text); } },
      });
      if (stale()) return;
      prog.done();
      paras = res && res.r.text.trim() ? pageParas(res.r, listText(res.r, res.listMarks, res.xh)) : [];
      result.hidden = false;
      draw();
      if (bar) bar.hidden = !spans.length;
      controls.hidden = !spans.length;
      if (!spans.length) {
        status.textContent = '';
        text.append(note('No text was found on this photo. Hold the phone straight over the page, in good light — closer for small print.', 'warn'));
        return;
      }
      const bits = [`${spans.length === 1 ? 'One piece' : `${spans.length} pieces`} to read`];
      if (res!.engine === 'paddle') bits.push('the photo was soft: PaddleOCR read it');
      if (readsPoorly(res!)) bits.push('the text reads poorly: a sharper photo — closer, in good light, the phone held still — reads better');
      status.textContent = bits.join(' · ') + '.';
      if (kept.auto && sp.canStart()) sp.play(0);
      else { say.textContent = 'Tap “Read aloud” to hear it.'; if (!ctx.isMobile) playBtn.focus({ preventScroll: true }); }
    } catch (e) {
      prog.done();
      if (!stale()) toast(errMsg(e), 'err');
    } finally {
      if (!stale()) { root.removeAttribute('aria-busy'); root.dataset.reads = String(++reads); }
    }
  }

  const pick = imageInput((img, file) => { void run(img, file); }, { label: 'Take or choose a photo of the page', instead: 'choose a photo of the page instead', paste: true });
  const controls = h('div', { class: 'cr-controls' }, backBtn, playBtn, pauseBtn, nextBtn, stopBtn);
  // phones: the player in the fixed bar at the foot of the screen, once there is something to read
  const bar = ctx.isMobile ? actions(backBtn, playBtn, pauseBtn, nextBtn) : null;
  if (bar) bar.hidden = true;
  const result = stack(
    card(null, ctx.isMobile ? null : controls, h('div', { class: 'cr-say' }, say), text),
    card('Voice and text', stack(field('Voice', vsel), hint, field('Speed', speedSel), h('div', { class: 'row cr-size' }, smaller, larger, sizeSay), auto,
      h('div', { class: 'row' },
        button('Copy the text', () => copy(plain()), { icon: 'Copy', small: true }),
        button('Open in Text-to-Speech (save as MP3)', () => { give('tts', plain()); location.hash = '#/tts'; }, { icon: 'AudioLines', small: true })))));
  result.hidden = true;
  root.append(stack(
    card(null, pick.el, prog, status,
      h('p', { class: 'muted small' }, 'Hold the phone straight over the page — a letter, a medicine leaflet, a menu — in good light. The page is read and then read aloud; the part being read is marked, and a tap on any sentence reads from there.')),
    result,
    bar,
    note('Everything happens on this device: the photo and its text never leave it.', 'info')));
  applySize();
  if ('speechSynthesis' in window) { loadSys(); speechSynthesis.addEventListener?.('voiceschanged', loadSys); } else fillVoices();
  { const [v, sv] = voiceOf(vsel.value); sp.setVoice(v, sv); sp.setSpeed(+kept.speed); }
  return () => {
    gone = true; seq++;
    root.removeEventListener('pointerdown', unlock, true); root.removeEventListener('keydown', unlock, true);
    try { speechSynthesis.removeEventListener?.('voiceschanged', loadSys); } catch { /* none */ }
    sp.dispose(); wake.dispose(); pick.dispose(); offSettings();
  };
};
