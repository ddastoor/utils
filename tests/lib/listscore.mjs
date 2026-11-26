// How well a text keeps a page's lists (to-do #31: the OCR tab's text keeps bullets, check boxes and indentation). The
// page's lists come from scripts/make-format-docs.mjs (<page>.lists.json: every item's mark or number, its level and the
// words of each line it takes up). Every item is looked for in the text by its words and checked: the character the OCR
// tab writes for its mark (WRITTEN) — or, for a mark the clean-up does not clear (– ➢ ✓: the reader reads it itself),
// some sign before the words —, or its number as on the page; four spaces a level; and every line it runs on to set under
// its text (four spaces a level and the mark's or number's width and a space). Used by the OCR tab's e2e suite and the
// unit suite of src/lib/listtext.ts.
export const WRITTEN = { '•': '•', '●': '•', '◦': '◦', '○': '◦', '▪': '▪', '■': '▪', '☐': '☐', '□': '☐', '☑': '☑', '☒': '☒', '◆': '◆', '►': '►' };
const GLYPHS = /[•◦▪◆►☐☑☒◉]/g;
export const tokens = (s) => (s.normalize('NFC').replace(/[’‘]/g, "'").toLowerCase().match(/[a-z0-9']+/g) || []).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean);
const lcs = (a, b) => { let p = new Array(b.length + 1).fill(0); for (let i = 1; i <= a.length; i++) { const c = [0]; for (let j = 1; j <= b.length; j++) c[j] = a[i - 1] === b[j - 1] ? p[j - 1] + 1 : Math.max(p[j], c[j - 1]); p = c; } return p[b.length]; };

/** { items, found, right, conts, contRight, wrong: [what went wrong, in words] } */
export function scoreLists(text, lists) {
  const out = text.split('\n'), toks = out.map((l) => tokens(l.replace(GLYPHS, ' '))), used = new Set();
  const r = { items: 0, found: 0, right: 0, conts: 0, contRight: 0, wrong: [] };
  let at = 0;
  // the line of the text that holds these words (the nearest after the last one found, unless another holds them better)
  const find = (words, from, short) => {
    const g = tokens(words.join(' '));
    if (!g.length) return -1;
    let best = -1, bv = 0;
    for (let i = 0; i < out.length; i++) {
      if (used.has(i) || (short && toks[i].length > g.length + 2)) continue;
      const v = lcs(g, toks[i]) / g.length - (i < from ? 0.05 : 0) - Math.abs(i - from) * 0.001;
      if (v > bv) { bv = v; best = i; }
    }
    return bv >= (g.length <= 2 ? 0.99 : 0.5) ? best : -1;
  };
  for (const it of lists) {
    r.items++;
    const i = find(it.lines[0], at, false);
    if (i < 0) { r.wrong.push(`not found: ${it.lines[0].slice(0, 4).join(' ')}`); continue; }
    used.add(i); at = i + 1; r.found++;
    const line = out[i], sp = line.match(/^ */)[0].length, body = line.slice(sp);
    const mark = it.label ? body.split(' ')[0] === it.label : WRITTEN[it.mark] ? body.startsWith(WRITTEN[it.mark] + ' ') : /^[^\p{L}\p{N}]{1,2}\s/u.test(body);
    if (mark && sp === 4 * it.level) r.right++;
    else r.wrong.push(`${'  '.repeat(it.level)}${it.mark || it.label} ${it.lines[0].slice(0, 4).join(' ')} → ${JSON.stringify(line.slice(0, 50))}`);
    const lead = 4 * it.level + (it.label ? it.label.length : 1) + 1;
    for (const cl of it.lines.slice(1)) {
      r.conts++;
      const k = find(cl, at, cl.length <= 3);
      if (k < 0) { r.wrong.push(`  run-on line not found: ${cl.slice(0, 3).join(' ')}`); continue; }
      used.add(k); at = k + 1;
      const n = out[k].match(/^ */)[0].length;
      if (n === lead) r.contRight++; else r.wrong.push(`  run-on line ${cl.slice(0, 3).join(' ')}: ${n} spaces, not ${lead} → ${JSON.stringify(out[k].slice(0, 40))}`);
    }
  }
  return r;
}
