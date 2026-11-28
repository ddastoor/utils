// The Settings page (#/settings; to-do #39 — the owner's wording of 27 – 28 Nov 2026 in todo.md). A section for each part of the site that
// keeps something: Favorites, the list of apps, and the apps the owner chose (28 Nov 2026) — each shows what the browser keeps, and a change
// here changes it there (the store: src/settings.ts) and the reverse, at once. The settings files: one after every change (a folder on a PC
// that allows it, else a download), Export now, Import a file (its sections replace what is kept). Loaded when the page is opened.
import { h, ic, card, button, toggle, select, slider, field, note, toast, errMsg, pickFiles, clear } from './ui';
import { TOOL_BY_ID } from './registry';
import { favs, setFavs } from './favorites';
import { appListFolded, setAppListFolded } from './applist';
import {
  settingsSections, onSettings, autoSave, setAutoSave, saveNow, lastFile, onFileSaved, importSettings, snapshot,
  ttsSettings, camreaderSettings, audiobookSettings, ebookSettings, spellSettings, worldclockSettings, EBOOK_THEMES, CAMREADER_SIZES,
} from './settings';
import { VOICES } from './lib/voices';
import './settingspage.css';

const speedText = (v: number) => `${+v.toFixed(2)}×`;
/** the voice choices of the speech apps: the voices on the site, and the one kept if it is one of this device's own */
function voiceSelect(value: string, onChange: (v: string) => void, label: string) {
  const opts: Array<[string, string]> = VOICES.flatMap(([group, vs]) => vs.map((v): [string, string] => [v.id, `${v.label} — ${group}`]));
  if (!opts.some(([id]) => id === value)) opts.push([value, value.startsWith('sys:') ? `This device’s voice: ${value.slice(4)}` : value]);
  return select(opts, value, onChange, label);
}
const openLink = (id: string, text?: string) => {
  const t = TOOL_BY_ID.get(id);
  return t ? h('a', { class: 'st-open', href: `#/${id}` }, ic(t.icon), h('span', null, text ?? `Open ${t.title}`)) : null;
};

export function mountSettings(root: HTMLElement): () => void {
  const offs: Array<() => void> = [];
  let gone = false;

  // ------------------------------------------------------------------ the files
  const fileLine = h('p', { class: 'muted small st-last', 'aria-live': 'polite' });
  const showLast = () => {
    const f = lastFile;
    fileLine.textContent = !f ? 'No settings file saved during this visit yet.'
      : f.error ? `The last settings file could not be saved — ${f.error}`
      : `Last file: ${f.name} — ${f.where === 'folder' ? 'written to the folder' : 'downloaded'} at ${new Date(f.at).toLocaleTimeString()}.`;
  };
  offs.push(onFileSaved(() => { showLast(); void showFolder(); }));
  const autoT = toggle('Save a settings file after every change', autoSave(), (v) => { setAutoSave(v); hows.hidden = !v; });
  const folderBox = h('div', { class: 'stack st-folder' });
  const hows = h('div', { class: 'stack' }, folderBox);
  hows.hidden = !autoSave();
  const showFolder = async () => {
    const m = await import('./lib/settingsfile');
    if (gone) return;
    if (!m.folderSupported()) {
      clear(folderBox).append(h('p', { class: 'muted small' }, 'Each file is downloaded (named superutils_settings_YYYYMMDD_HHMM.json). Chrome asks once to allow several downloads; an iPhone asks for each one. On a PC, Chrome and Edge can instead write the files into a folder you choose.'));
      return;
    }
    const st = await m.folderState();
    if (gone) return;
    if (!st) {
      clear(folderBox).append(
        h('p', { class: 'muted small' }, 'Now each file is downloaded. Choose a folder and the files are written there instead — no download for each change (a file of the same minute is replaced).'),
        h('div', { class: 'row' }, button('Choose a folder for the files', async () => {
          try { const name = await m.chooseFolder(); toast(`Settings files go to “${name}” now`, 'ok'); await showFolder(); } catch (e) { if ((e as Error)?.name !== 'AbortError') toast(errMsg(e), 'err'); }
        }, { icon: 'FolderOpen' })));
      return;
    }
    clear(folderBox).append(
      h('p', { class: 'small' }, st.permission === 'granted' ? `Files are written to the folder “${st.name}”${st.visitOnly ? ' during this visit' : ''}.` : `Files go to the folder “${st.name}” — the browser asks again after a restart; until it is allowed, each file is downloaded.`),
      ...(st.visitOnly ? [h('p', { class: 'muted small' }, 'This looks like a private (Incognito) window: the folder is not remembered for the next visit there — Chrome cannot safely read a remembered folder back in one. Choose it again next time, or use a normal window.')] : []),
      h('div', { class: 'row' },
        st.permission === 'granted' ? null : button(`Allow writing to “${st.name}”`, async () => { if (await m.allowFolder()) { toast('Allowed', 'ok'); } await showFolder(); }, { icon: 'FolderCheck', variant: 'primary' }),
        button('Choose another folder', async () => {
          try { await m.chooseFolder(); await showFolder(); } catch (e) { if ((e as Error)?.name !== 'AbortError') toast(errMsg(e), 'err'); }
        }, { icon: 'FolderOpen' }),
        button('Download the files instead', async () => { await m.forgetFolder(); await showFolder(); }, { icon: 'Download', variant: 'ghost' })));
  };
  const importOut = h('div', { class: 'stack', 'aria-live': 'polite' });
  const doImport = async () => {
    const [f] = await pickFiles('.json,application/json', false);
    if (!f) return;
    try {
      const m = await import('./lib/settingsfile');
      const r = importSettings(m.readSettingsText(await f.text()));
      clear(importOut).append(note(h('div', null,
        h('div', null, `Imported from ${f.name}: ${r.done.join(', ') || 'nothing this version keeps'}.`),
        ...r.notes.map((n) => h('div', { class: 'muted small' }, n))), r.notes.length ? 'warn' : 'ok'));
    } catch (e) {
      clear(importOut).append(note(`${f.name}: ${errMsg(e)}`, 'err'));
    }
  };
  const files = card('Settings files',
    h('p', { class: 'muted small' }, 'Everything below is kept in this browser only. A settings file holds all of it: keep it to bring your settings back after the browser’s data is cleared, or to another device.'),
    autoT, hows, fileLine,
    h('div', { class: 'row st-filebtns' },
      button('Export settings now', () => void saveNow(), { icon: 'Download' }),
      button('Import settings…', () => void doImport(), { icon: 'Upload' })),
    importOut);
  showLast(); void showFolder();

  // ------------------------------------------------------------------ Favorites
  const favList = h('ul', { class: 'st-favs' });
  const showFavs = () => {
    const ids = favs();
    clear(favList).append(...(ids.length ? ids.filter((id) => TOOL_BY_ID.has(id)).map((id) => {
      const t = TOOL_BY_ID.get(id)!;
      return h('li', null, h('a', { href: `#/${id}` }, ic(t.icon), h('span', null, t.title)),
        button('', () => setFavs(favs().filter((x) => x !== id)), { icon: 'X', small: true, variant: 'ghost', title: `Remove ${t.title} from Favorites` }));
    }) : [h('li', { class: 'muted small' }, 'No favorites yet — tap the ☆ star on an app’s page or card.')]));
  };
  showFavs();
  // ------------------------------------------------------------------ the list of apps
  const foldT = toggle('Fold the list of apps away (more room for the app in use)', appListFolded(), (v) => setAppListFolded(v));

  // ------------------------------------------------------------------ the apps
  const tts = ttsSettings.get();
  const ttsVoice = voiceSelect(tts.voice, (v) => ttsSettings.set({ voice: v }), 'Text-to-Speech voice');
  const ttsSpeed = slider({ label: 'Speed', min: 0.5, max: 2, step: 0.05, value: tts.speed, fmt: speedText, onChange: (v) => ttsSettings.set({ speed: v }) });
  const cr = camreaderSettings.get();
  const crVoice = voiceSelect(cr.voice, (v) => camreaderSettings.set({ voice: v }), 'Camera Reader voice');
  const crSpeed = select<'0.8' | '1' | '1.2'>([['0.8', 'Slower (0.8×)'], ['1', 'Normal'], ['1.2', 'Faster (1.2×)']], cr.speed, (v) => camreaderSettings.set({ speed: v }), 'Camera Reader speed');
  const crSize = select<string>(CAMREADER_SIZES.map((n): [string, string] => [String(n), `${n} px`]), String(cr.size), (v) => camreaderSettings.set({ size: +v as (typeof CAMREADER_SIZES)[number] }), 'Camera Reader text size');
  const crAuto = toggle('Read aloud as soon as the page is read', cr.auto, (v) => camreaderSettings.set({ auto: v }));
  const ab = audiobookSettings.get();
  const abVoice = voiceSelect(ab.voice, (v) => audiobookSettings.set({ voice: v }), 'Audiobook voice');
  const abSpeed = slider({ label: 'Speed', min: 0.5, max: 2, step: 0.05, value: ab.speed, fmt: speedText, onChange: (v) => audiobookSettings.set({ speed: v }) });
  const abKbps = select<'48' | '64' | '96'>([['48', '48 kbps (smallest)'], ['64', '64 kbps'], ['96', '96 kbps (best)']], String(ab.kbps) as '48' | '64' | '96', (v) => audiobookSettings.set({ kbps: +v as 48 | 64 | 96 }), 'MP3 quality');
  const eb = ebookSettings.get();
  const ebFont = select<'literata' | 'serif' | 'sans' | 'book'>([['literata', 'Literata'], ['serif', 'Serif'], ['sans', 'Sans'], ['book', 'The book’s own']], eb.font, (v) => ebookSettings.set({ font: v }), 'Font');
  const EB_SIZES = [12, 14, 16, 17, 18, 19, 20, 22, 24, 26, 28, 32, 36, 42];
  const ebSize = select<string>([['', 'As the device suits (18 px on a phone, 20 on a PC)'], ...EB_SIZES.map((n): [string, string] => [String(n), `${n} px`])], eb.size === null ? '' : String(eb.size), (v) => ebookSettings.set({ size: v ? +v : null }), 'EPUB Reader text size');
  const ebTheme = select<'' | (typeof EBOOK_THEMES)[number]>([['', 'As the system (light or dark)'], ['light', 'Light'], ['sepia', 'Sepia'], ['dark', 'Dark'], ['black', 'Black']], eb.theme ?? '', (v) => ebookSettings.set({ theme: v || null }), 'Theme');
  const ebLine = select<'0' | '1.25' | '1.5' | '1.75' | '2'>([['0', 'As the book sets it'], ['1.25', 'Tight'], ['1.5', 'Normal'], ['1.75', 'Relaxed'], ['2', 'Loose']], String(eb.line) as '1.5', (v) => ebookSettings.set({ line: +v }), 'Line spacing');
  const ebMargin = select<'narrow' | 'normal' | 'wide'>([['narrow', 'Narrow'], ['normal', 'Normal'], ['wide', 'Wide']], eb.margin, (v) => ebookSettings.set({ margin: v }), 'Margins');
  const ebSpread = select<'auto' | 'one' | 'two'>([['auto', 'One or two pages by the window'], ['one', 'One page'], ['two', 'Two pages']], eb.spread, (v) => ebookSettings.set({ spread: v }), 'Pages');
  const ebJustify = select<'' | 'yes' | 'no'>([['', 'As the device suits (justified on a PC, left-aligned on a phone)'], ['yes', 'Justified (straight right edge)'], ['no', 'Left-aligned']], eb.justify === null ? '' : eb.justify ? 'yes' : 'no', (v) => ebookSettings.set({ justify: v === '' ? null : v === 'yes' }), 'Justify the text');
  const ebPub = toggle('The book’s own styles', eb.publisher, (v) => ebookSettings.set({ publisher: v }));
  const sp = spellSettings.get();
  const spLang = select<'' | 'en-US' | 'en-GB' | 'en-IN'>([['', 'By the browser’s language'], ['en-US', 'English (United States)'], ['en-GB', 'English (United Kingdom)'], ['en-IN', 'English (India)']], sp.lang ?? '', (v) => spellSettings.set({ lang: v || null }), 'Spell Checker language');
  const spWords = h('ul', { class: 'st-words' });
  const showWords = () => {
    const w = spellSettings.get().added;
    clear(spWords).append(...(w.length ? w.map((x) => h('li', null, h('span', null, x), button('', () => spellSettings.set({ added: spellSettings.get().added.filter((y) => y !== x) }), { icon: 'X', small: true, variant: 'ghost', title: `Take “${x}” out of your words` })))
      : [h('li', { class: 'muted small' }, 'No words added — “Add to dictionary” in the Spell Checker adds them here.')]));
  };
  showWords();
  const wc = worldclockSettings.get();
  const wcList = h('ul', { class: 'st-cities' });
  const wcHour = select<'' | '12' | '24'>([['', 'As the browser shows times'], ['12', '12 hours (am / pm)'], ['24', '24 hours']], wc.h24 === null ? '' : wc.h24 ? '24' : '12', (v) => worldclockSettings.set({ h24: v === '' ? null : v === '24' }), 'Clock');
  const showCities = async () => {
    const ids = worldclockSettings.get().cities;
    if (!ids) { clear(wcList).append(h('li', { class: 'muted small' }, 'The first set — New York, San Francisco, London, Mumbai, Sydney, Hong Kong, Singapore — until you change the list.')); return; }
    const { placeOf } = await import('./lib/worldclock');
    if (gone) return;
    clear(wcList).append(...(ids.length ? ids.map((id) => {
      const p = placeOf(id), name = p ? p.name : id;
      return h('li', null, h('span', null, name, p?.where ? h('span', { class: 'muted small' }, ` · ${p.where}`) : null),
        button('', () => worldclockSettings.set({ cities: (worldclockSettings.get().cities ?? []).filter((x) => x !== id) }), { icon: 'X', small: true, variant: 'ghost', title: `Take ${name} off the list` }));
    }) : [h('li', { class: 'muted small' }, 'No cities — only your own clock.')]));
  };
  void showCities();

  // ------------------------------------------------------------------ every view follows the store (here, an app, another tab, an import)
  offs.push(onSettings((id) => {
    if (gone) return;
    if (id === 'favorites') showFavs();
    else if (id === 'applist') foldT.checked = appListFolded();
    else if (id === 'tts') { const v = ttsSettings.get(); ttsVoice.value = v.voice; ttsSpeed.value = v.speed; }
    else if (id === 'camreader') { const v = camreaderSettings.get(); crVoice.value = v.voice; crSpeed.value = v.speed; crSize.value = String(v.size); crAuto.checked = v.auto; }
    else if (id === 'audiobook') { const v = audiobookSettings.get(); abVoice.value = v.voice; abSpeed.value = v.speed; abKbps.value = String(v.kbps); }
    else if (id === 'ebook') { const v = ebookSettings.get(); ebFont.value = v.font; ebSize.value = v.size === null ? '' : String(v.size); ebTheme.value = v.theme ?? ''; ebLine.value = String(v.line); ebMargin.value = v.margin; ebSpread.value = v.spread; ebPub.checked = v.publisher; ebJustify.value = v.justify === null ? '' : v.justify ? 'yes' : 'no'; }
    else if (id === 'spell') { const v = spellSettings.get(); spLang.value = v.lang ?? ''; showWords(); }
    else if (id === 'worldclock') { const v = worldclockSettings.get(); wcHour.value = v.h24 === null ? '' : v.h24 ? '24' : '12'; void showCities(); }
    else if (id === 'device') { autoT.checked = autoSave(); hows.hidden = !autoSave(); }
  }));

  const sec = (id: string, title: string, ...children: Array<Node | null>) => {
    const c = card(title, ...children);
    c.id = `settings-${id}`; c.classList.add('st-sec');
    return c;
  };
  root.append(
    files,
    sec('favorites', 'Favorites', favList),
    sec('applist', 'The list of apps', foldT),
    sec('tts', 'Text-to-Speech', h('div', { class: 'stack' }, field('Voice', ttsVoice), ttsSpeed, openLink('tts'))),
    sec('camreader', 'Camera Reader', h('div', { class: 'stack' }, field('Voice', crVoice), field('Speed', crSpeed), field('Text size', crSize), crAuto, openLink('camreader'))),
    sec('audiobook', 'PDF / EPUB → Audiobook', h('div', { class: 'stack' }, field('Voice', abVoice), abSpeed, field('MP3 quality', abKbps), openLink('audiobook'))),
    sec('ebook', 'EPUB Reader', h('div', { class: 'stack' }, field('Font', ebFont), field('Text size', ebSize), field('Line spacing', ebLine), field('Theme', ebTheme), field('Margins', ebMargin), field('Text edge', ebJustify), field('Pages', ebSpread), ebPub, openLink('ebook'))),
    sec('spell', 'Spell Checker', h('div', { class: 'stack' }, field('Language', spLang), h('div', null, h('div', { class: 'small st-label' }, 'Your words'), spWords), openLink('spell'))),
    sec('worldclock', 'World Clock', h('div', { class: 'stack' }, field('Clock', wcHour), h('div', null, h('div', { class: 'small st-label' }, 'Your cities'), wcList), openLink('worldclock'))),
  );
  void snapshot; void settingsSections;
  return () => { gone = true; offs.forEach((f) => f()); };
}
