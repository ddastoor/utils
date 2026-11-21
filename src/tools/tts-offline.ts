// Text-to-Speech — "Offline on this PC" (owner, 21 Nov 2026; PC only — the tab stays PC + mobile): large voices that
// run on the person's own computer, not in the browser. The page fetches nothing and runs nothing: it writes a script
// for Windows (.cmd) or Linux (.sh) that holds the text, the chosen voices and driver.py; on the PC the script fetches
// uv (from PyPI, SHA-256 checked), Python, the engines (pinned packages) and the models (Hugging Face, pinned
// revisions) into one folder, SuperTools-TTS, and writes a WAV and an MP3 per voice. Imported only when the mode is
// chosen (the catalogue of 416 voices is 100 KB).
import { h, card, field, button, segmented, toggle, note, stack, toast, downloadBlob, slider, select } from '../ui';
import catalogue from '../lib/offline-tts/catalogue.json';
import driver from '../lib/offline-tts/driver.py?raw';
import { detectOS, planOf, scriptFor, fmtMB, matches, SCRIPT_NAME, TORCH_MB, type Catalogue, type CVoice, type OS } from '../lib/offline-tts/plan';

const cat = catalogue as unknown as Catalogue;
const SITE = 'https://ddastoor.github.io/utils/#/tts';
const SEXES: Array<[string, string]> = [['', 'Any voice'], ['f', 'Women'], ['m', 'Men']];

/** The voices picked first: the lightest Indian accents by their documentation, and one each of the others. */
export const STARTERS = ['indic-parler-thoma', 'indic-parler-mary', 'kokoro-hf_alpha-a', 'piper-vctk-p248'];

export function offlinePanel(o: { text: () => string; speed: number }): HTMLElement {
  const chosen = new Set<string>(STARTERS);
  let os: OS = detectOS(navigator.userAgent, (navigator as any).userAgentData?.platform || '') || 'windows';
  let group = 'in', engine = '', sex = '', query = '', mp3 = true, speed = o.speed, accepted = false;
  const detected = detectOS(navigator.userAgent, (navigator as any).userAgentData?.platform || '');

  const osSeg = segmented<OS>([['windows', 'Windows'], ['linux', 'Linux']], os, (v) => { os = v; render(); });
  const osLine = h('div', { class: 'muted small' }, detected ? `This computer: ${detected === 'windows' ? 'Windows' : 'Linux'}.` : 'This computer is neither Windows nor Linux: the scripts are made for those two.');
  const groupSeg = segmented<string>([['', 'All'], ...cat.groups.map(([g, n]) => [g, n.replace(' English', '').replace(' — accent not documented', ' (accent not documented)')] as [string, string])], group, (v) => { group = v; list(); });
  const engineSel = select<string>([['', 'Every engine'], ...Object.entries(cat.engines).map(([k, e]) => [k, e.name] as [string, string])], '', (v) => { engine = v; list(); }, 'Engine');
  const sexSel = select<string>(SEXES, '', (v) => { sex = v; list(); }, 'Voices to show');
  const search = h('input', { type: 'search', class: 'input', placeholder: 'Search the voices (name, accent, model)', 'aria-label': 'Search the voices' }) as HTMLInputElement;
  search.addEventListener('input', () => { query = search.value; list(); });

  const listBox = h('div', { class: 'otts-list', role: 'group', 'aria-label': 'Offline voices' });
  const shown = h('div', { class: 'muted small', 'aria-live': 'polite' });
  const summary = h('div', { class: 'otts-summary', 'aria-live': 'polite' });
  const needs = h('div', { class: 'stack' });
  const steps = h('ol', { class: 'otts-steps' });
  const dl = button('Download the script', () => download(), { icon: 'Download', variant: 'primary' });

  const tag = (text: string, cls = '') => h('span', { class: `otts-tag ${cls}` }, text);
  function modelLine(mid: string): HTMLElement {
    const m = cat.models[mid], e = cat.engines[m.engine];
    return h('div', { class: 'otts-model' }, h('strong', null, m.name), ` · ${fmtMB(m.mb)} · ${e.name}`,
      m.personal ? tag('personal use only', 'warn') : null, m.gated ? tag('free Hugging Face account', 'info') : null,
      e.torch && m.mb > 1500 ? tag('slow without a graphics card') : null, h('span', { class: 'muted small' }, ` ${m.licence}`));
  }
  function list() {
    const vs = cat.voices.filter((v) => (!group || v.group === group) && (!engine || cat.models[v.model].engine === engine) && (!sex || v.sex === sex) && matches(cat, v, query));
    const parts: Node[] = [];
    let last = '';
    for (const v of vs) {
      if (v.model !== last) { parts.push(modelLine(v.model)); last = v.model; }
      parts.push(voiceBox(v));
    }
    listBox.replaceChildren(...(parts.length ? parts : [h('div', { class: 'muted' }, 'No voice matches.')]));
    shown.textContent = `${vs.length} of ${cat.voices.length} voices shown`;
  }
  function voiceBox(v: CVoice): HTMLElement {
    const cb = h('input', { type: 'checkbox', value: v.id }) as HTMLInputElement;
    cb.checked = chosen.has(v.id);
    cb.addEventListener('change', () => { if (cb.checked) chosen.add(v.id); else chosen.delete(v.id); render(); });
    return h('label', { class: 'otts-voice' }, cb, h('span', null, v.label));
  }

  function render() {
    const p = planOf(cat, chosen);
    dl.setLabel(`Download the script for ${os === 'windows' ? 'Windows (.cmd)' : 'Linux (.sh)'}`);
    if (!p.voices.length) {
      summary.replaceChildren(h('strong', null, 'No voice chosen yet.'), ' Tick one or more voices above.');
    } else {
      summary.replaceChildren(
        h('strong', null, `${p.voices.length} voice${p.voices.length > 1 ? 's' : ''} chosen`),
        ` · ${p.models.length} model${p.models.length > 1 ? 's' : ''}, ${fmtMB(p.modelMB)} · programs about ${fmtMB(p.programMB)}` +
        (p.programMBcuda !== p.programMB ? ` (${fmtMB(p.programMBcuda)} with an NVIDIA graphics card)` : '') +
        ' — downloaded the first time only.',
        h('div', { class: 'chips' }, ...p.voices.map((v) => h('button', {
          type: 'button', class: 'chip chip-btn', title: 'Remove', 'aria-label': `Remove ${v.label}`,
          onclick: () => { chosen.delete(v.id); list(); render(); },
        }, `${v.label.split(' — ')[0]} · ${cat.engines[cat.models[v.model].engine].name} ✕`))));
    }
    const n: Node[] = [];
    if (p.accept.includes('cpml')) {
      const t = toggle('I accept the Coqui Public Model License: XTTS-v2 may be used for non-commercial purposes only', accepted, (v) => { accepted = v; render(); });
      n.push(stack(t, h('div', { class: 'muted small' }, 'The licence: ', h('a', { href: 'https://coqui.ai/cpml', target: '_blank', rel: 'noopener' }, 'coqui.ai/cpml'), '. The voices taken from recordings use clips their speakers gave for this (CC0) or VCTK’s (CC BY 4.0).')));
    }
    if (p.gated.length) {
      n.push(note(h('span', null, `${p.gated.join(', ')} ${p.gated.length > 1 ? 'are' : 'is'} free, but Hugging Face asks for an account first. `,
        'Before running the script: sign in at huggingface.co, open ', ...p.gated.flatMap((r, i) => [i ? ', ' : '', h('a', { href: `https://huggingface.co/${r}`, target: '_blank', rel: 'noopener' }, r)]),
        ' and accept its conditions, and make a token with the “Read” permission (', h('a', { href: 'https://huggingface.co/settings/tokens', target: '_blank', rel: 'noopener' }, 'Settings → Access Tokens'),
        '). The script asks for the token once and keeps it in its folder; it is sent only to Hugging Face.'), 'info'));
    }
    if (p.personal) n.push(note('Some chosen voices are licensed for personal, non-commercial use only (marked above).', 'warn'));
    if (p.noSpeed.length) n.push(note(`${p.noSpeed.join(' and ')} cannot change speed: its voices speak at their own pace.`, 'info'));
    if (p.engines.some((e) => e === 'parler' || e === 'xtts')) n.push(note('Parler-TTS and XTTS-v2 are large: on a processor alone they take several times as long as the speech lasts (Parler about 5×). With an NVIDIA graphics card they run many times faster — the script uses one by itself.', 'info'));
    needs.replaceChildren(...n);
    dl.disabled = !p.voices.length || (p.accept.includes('cpml') && !accepted);
    steps.replaceChildren(...(os === 'windows' ? [
      h('li', null, 'Download the script (', h('code', null, SCRIPT_NAME.windows), ') and double-click it. If Windows asks whether to run it, choose ', h('em', null, 'More info → Run anyway'), ' (it is a text file: open it in Notepad to read it first).'),
      h('li', null, `The first run downloads the programs and the voices (about ${fmtMB(p.modelMB + p.programMB)}) into the folder `, h('code', null, 'SuperTools-TTS'), ' in your user folder; later runs reuse them.'),
      h('li', null, 'When it is done, the folder with the speech opens: one MP3 and one WAV per voice.'),
      h('li', null, 'For another text, make a new script here: the downloads stay. To remove everything, delete the SuperTools-TTS folder.'),
    ] : [
      h('li', null, 'Download the script (', h('code', null, SCRIPT_NAME.linux), ') and run it in a terminal: ', h('code', null, `bash ~/Downloads/${SCRIPT_NAME.linux}`), '.'),
      h('li', null, `The first run downloads the programs and the voices (about ${fmtMB(p.modelMB + p.programMB)}) into `, h('code', null, '~/SuperTools-TTS'), '; later runs reuse them. It needs curl or wget, and nothing is installed into the system.'),
      h('li', null, 'When it is done, the folder with the speech opens: one MP3 and one WAV per voice.'),
      h('li', null, 'For another text, make a new script here: the downloads stay. To remove everything, delete ~/SuperTools-TTS.'),
    ]));
  }

  function download() {
    const text = o.text().trim();
    if (!text) { toast('Type or open some text first.', 'info'); return; }
    const p = planOf(cat, chosen);
    if (!p.voices.length) { toast('Choose at least one voice.', 'info'); return; }
    if (p.accept.includes('cpml') && !accepted) { toast('Accept XTTS-v2’s licence first, or untick its voices.', 'info'); return; }
    const made = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const s = scriptFor(os, cat, p, { text, speed, mp3, driver, made, site: SITE });
    downloadBlob(new Blob([s], { type: os === 'windows' ? 'application/octet-stream' : 'text/x-shellscript' }), SCRIPT_NAME[os]);
    toast(`${SCRIPT_NAME[os]} downloaded — ${p.voices.length} voice${p.voices.length > 1 ? 's' : ''}.`, 'ok');
  }

  const el = stack(
    note('Large voices that run on this computer instead of in the browser. This page writes a script with your text and the voices you choose; the script downloads the speech programs and the voices from their makers (Hugging Face), keeps them in one folder and makes an MP3 and a WAV of every voice. Nothing is installed into the system, and your text stays on the computer.', 'info'),
    card('This computer', stack(field('System', osSeg), osLine)),
    card('Voices', stack(groupSeg, h('div', { class: 'otts-filters' }, engineSel, sexSel, search), shown, listBox,
      h('div', { class: 'muted small' }, 'Sizes are downloads (MB = 1,000,000 bytes); voices of one model share its download. ',
        `PyTorch, which most engines need, is about ${fmtMB(TORCH_MB.cpu)} (${fmtMB(TORCH_MB.cuda)} for an NVIDIA graphics card).`))),
    card('Your choice', stack(summary, needs,
      slider({ label: 'Speed', min: 0.5, max: 2, step: 0.05, value: speed, fmt: (v) => `${+v.toFixed(2)}×`, onInput: (v) => { speed = v; } }),
      toggle('MP3 as well as WAV', mp3, (v) => { mp3 = v; }), dl)),
    card('How to run it', steps),
  );
  list(); render();
  return el;
}
