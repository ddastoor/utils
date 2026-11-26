// make-doc-sources.mjs — the real text of the formatted test documents (to-do #18; owner, 26 Nov 2026: "use many real
// documents with a lot of rich text formatting, etc to further improve the ocr quality"). Fetches openly licensed
// documents (public-domain US government guides, CC BY 4.0, MIT, CC BY-SA) and keeps their headings, paragraphs and list
// items as plain sentences in tests/fixtures/docs/sources.json, with each source's address, licence and attribution —
// scripts/make-format-docs.mjs lays them out as Word, Google Docs and LibreOffice pages. Run by hand (needs curl and
// raw.githubusercontent.com); the file is committed so that the pages are made the same way every time.
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = 'https://raw.githubusercontent.com/';
export const SOURCES = [
  { id: 'contribute', title: 'How to Contribute to Open Source', path: 'github/opensource.guide/main/_articles/how-to-contribute.md', licence: 'CC BY 4.0', by: 'GitHub and the Open Source Guides contributors (opensource.guide)' },
  { id: 'k8s', title: 'Kubernetes Overview', path: 'kubernetes/website/main/content/en/docs/concepts/overview/_index.md', licence: 'CC BY 4.0', by: 'The Kubernetes Authors' },
  { id: 'scuba', title: 'ScubaGear', path: 'cisagov/ScubaGear/main/README.md', licence: 'CC0 1.0 (a work of the US government)', by: 'CISA' },
  { id: 'covenant', title: 'Contributor Covenant Code of Conduct', path: 'EthicalSource/contributor_covenant/release/content/version/2/1/code_of_conduct.md', licence: 'CC BY 4.0', by: 'Organization for Ethical Source (Contributor Covenant 2.1)' },
  { id: 'ghformat', title: 'Basic writing and formatting syntax', path: 'github/docs/main/content/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax.md', licence: 'CC BY 4.0', by: 'GitHub, Inc. (GitHub Docs)' },
  { id: 'rust', title: 'Installation', path: 'rust-lang/book/main/src/ch01-01-installation.md', licence: 'MIT OR Apache-2.0', by: 'The Rust Project Developers (The Rust Programming Language)' },
  { id: 'mdn-ul', title: 'The Unordered List element', path: 'mdn/content/main/files/en-us/web/html/reference/elements/ul/index.md', licence: 'CC BY-SA 2.5', by: 'Mozilla Contributors (MDN Web Docs)' },
  { id: 'playbook', title: 'About This Project', path: 'usds/playbook/master/README.md', licence: 'Public domain (a work of the US government)', by: 'U.S. Digital Service' },
  { id: 'handbook', title: '18F Handbook', path: '18F/handbook/main/README.md', licence: 'CC0 1.0 (a work of the US government)', by: '18F (GSA)' },
];

/** Markdown → what a page shows: no front matter, templates, HTML, code, pictures or link targets; emphasis marks off. */
export function plain(line) {
  return line
    .replace(/!\[[^\]]*\](?:\([^)]*\)|\[[^\]]*\])/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1').replace(/\[([^\]]+)\]/g, '$1')
    .replace(/`([^`]*)`/g, '$1').replace(/<[^>]+>/g, '').replace(/\{%[^%]*%\}|\{\{[^}]*\}\}|\{#[^}]*\}/g, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2').replace(/(^|\W)[*_](\S.*?\S|\S)[*_](?=\W|$)/g, '$1$2')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
const usable = (s) => s.length >= 25 && /^[\x20-\x7E“”‘’–—…]+$/.test(s) && !/https?:|www\.|[|{}<>\\[\]*]|^[#>:+-]|\b(TODO|INSERT)\b/.test(s) && (s.match(/[A-Za-z]{2,}/g) || []).length >= 4;

export function parse(md) {
  md = md.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/^\+\+\+\n[\s\S]*?\n\+\+\+\n/, '').replace(/```[\s\S]*?```/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const headings = [], paragraphs = [], items = [];
  let para = [], item = null;
  const flush = () => {
    if (para.length) { const p = plain(para.join(' ')); if (usable(p)) paragraphs.push(p); para = []; }
    if (item !== null) { const i = plain(item); if (usable(i)) items.push(i); item = null; }
  };
  for (const raw of md.split('\n')) {
    const line = raw.replace(/\t/g, '    ');
    if (/^\s*$/.test(line)) { flush(); continue; }
    const hd = /^#{1,6}\s+(.*)$/.exec(line);
    if (hd) { flush(); const t = plain(hd[1]); if (t.length >= 3 && /^[\x20-\x7E]+$/.test(t)) headings.push(t); continue; }
    const li = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) { flush(); item = li[1]; continue; }
    if (/^\s*\|/.test(line) || /^\s*>/.test(line)) { flush(); continue; }
    if (item !== null && /^\s+\S/.test(line)) { item += ' ' + line.trim(); continue; }
    if (item !== null) flush();
    para.push(line.trim());
  }
  flush();
  return { headings, paragraphs, items };
}

async function main() {
  const out = [];
  for (const s of SOURCES) {
    const r = spawnSync('curl', ['-sfL', '-m', '60', RAW + s.path], { encoding: 'utf8', maxBuffer: 1 << 26 });
    if (r.status) throw new Error(`${s.path}: curl ${r.status} ${r.stderr}`);
    const p = parse(r.stdout);
    out.push({ ...s, url: RAW + s.path, fetched: new Date().toISOString().slice(0, 10), ...p });
    console.log(`${s.id}: ${p.headings.length} headings, ${p.paragraphs.length} paragraphs, ${p.items.length} list items`);
  }
  const file = join(root, 'tests/fixtures/docs/sources.json');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
  console.log(`wrote ${file}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
