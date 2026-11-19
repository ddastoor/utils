// Periodic Table: the 118 elements of src/lib/elements.ts against the `mendeleev` package
// (tests/fixtures/periodic/reference.json, scripts/make-periodic-reference.py), and the search.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async (t, { load, root }) => {
  const { ELEMENTS, ALIASES, CATEGORY_COLORS, elementMatches, findElement } = await load('/src/lib/elements.ts');
  const ref = JSON.parse(readFileSync(join(root, 'tests/fixtures/periodic/reference.json'), 'utf8'));
  const CORE = { He: 2, Ne: 10, Ar: 18, Kr: 36, Xe: 54, Rn: 86 };
  const expand = (cfg) => { const o = {}; for (const part of cfg.replace('(predicted)', '').trim().split(/\s+/)) { const c = /^\[(\w+)\]$/.exec(part); if (c) Object.assign(o, expand(ELEMENTS[CORE[c[1]] - 1].config)); else { const m = /^(\d[spdf])(\d+)$/.exec(part); o[m ? m[1] : `?${part}`] = m ? +m[2] : 1; } } return o; };
  // where this table knowingly differs from the reference, and why
  const NAME = { Al: 'Aluminum', Cs: 'Cesium' };                                       // IUPAC spells Aluminium and Caesium
  const NEWER_ISOTOPE = { Lr: 266, Sg: 269, Bh: 270, Mt: 278, Mc: 290 };               // longest-lived isotopes found since the reference's data
  const WEIGHED = ['Th', 'Pa', 'U'];                                                   // radioactive, yet with a standard atomic weight
  const PREDICTED_OTHERWISE = { Ds: '[Rn] 5f14 6d8 7s2 (predicted)', Rg: '[Rn] 5f14 6d9 7s2 (predicted)' }; // never measured: predictions differ

  t.ok(ELEMENTS.length === 118 && ref.length === 118 && ELEMENTS.every((e, i) => e.z === i + 1), '118 elements, in order');
  const bad = [];
  for (const r of ref) {
    const e = ELEMENTS[r.z - 1], at = `${r.z} ${r.symbol}`;
    if (e.sym !== r.symbol) bad.push(`${at}: symbol ${e.sym}`);
    if (e.name !== r.name && NAME[e.sym] !== r.name) bad.push(`${at}: name ${e.name}, not ${r.name}`);
    const bracket = e.mass.startsWith('['), mass = bracket ? +e.mass.slice(1, -1) : +e.mass;
    if (bracket !== (r.radioactive && !WEIGHED.includes(e.sym))) bad.push(`${at}: ${e.mass} for ${r.radioactive ? 'a radioactive' : 'a stable'} element`);
    if (bracket ? (NEWER_ISOTOPE[e.sym] ? mass !== NEWER_ISOTOPE[e.sym] : Math.abs(mass - r.weight) > 1.5) || !Number.isInteger(mass) : Math.abs(mass - r.weight) > 0.0006 * r.weight) bad.push(`${at}: mass ${e.mass}, reference ${r.weight}`);
    if (!bracket && !/^\d+(\.\d+)?$/.test(e.mass)) bad.push(`${at}: mass "${e.mass}"`);
    if ((e.group || null) !== r.group) bad.push(`${at}: group ${e.group}, not ${r.group}`);
    if (e.period !== r.period) bad.push(`${at}: period ${e.period}, not ${r.period}`);
    if (e.block !== r.block) bad.push(`${at}: block ${e.block}, not ${r.block}`);
    if (PREDICTED_OTHERWISE[e.sym] ? e.config !== PREDICTED_OTHERWISE[e.sym] : JSON.stringify(Object.entries(expand(e.config)).sort()) !== JSON.stringify(Object.entries(r.config).sort())) bad.push(`${at}: configuration ${e.config}, reference ${JSON.stringify(r.config)}`);
    if (Object.values(expand(e.config)).reduce((a, b) => a + b, 0) !== e.z) bad.push(`${at}: the configuration ${e.config} holds ${Object.values(expand(e.config)).reduce((a, b) => a + b, 0)} electrons`);
    if ((r.z >= 104) !== e.config.endsWith('(predicted)')) bad.push(`${at}: "(predicted)" is for the elements from 104 on`);
    if (!(e.cat in CATEGORY_COLORS)) bad.push(`${at}: category ${e.cat}`);
  }
  t.ok(!bad.length, `every element against the reference: symbol, name (IUPAC spelling), atomic weight to 5 digits — or the mass number in brackets where there is no stable isotope — group, period, block, and an electron configuration that holds exactly Z electrons ${bad.slice(0, 4).join(' | ')}`);
  // categories by the reference's series (its names differ; the borderline elements are listed)
  const SERIES = { 'Alkali metals': 'alkali metal', 'Alkaline earth metals': 'alkaline earth metal', 'Transition metals': 'transition metal', 'Poor metals': 'post-transition metal', Metalloids: 'metalloid', Nonmetals: 'nonmetal', Halogens: 'halogen', 'Noble gases': 'noble gas', Lanthanides: 'lanthanide', Actinides: 'actinide' };
  const other = ref.filter((r) => SERIES[r.series] !== ELEMENTS[r.z - 1].cat).map((r) => `${r.symbol}: ${ELEMENTS[r.z - 1].cat} (reference: ${r.series})`);
  t.ok(other.length <= 16 && other.every((x) => /^(Mt|Ds|Rg|Cn|Nh|Fl|Mc|Lv|Ts|Og|Po|At|Lu|Lr|La|Ac): /.test(x)), `categories as the reference's series, but for the borderline cases — polonium and astatine, the ends of the f-block, and the elements from 109 on, whose chemistry is unknown (${other.join('; ')})`);
  // the layout: no two elements in a cell
  t.ok(new Set(ELEMENTS.map((e) => `${e.row},${e.col}`)).size === 118 && ELEMENTS.every((e) => e.row >= 1 && e.row <= 10 && e.col >= 1 && e.col <= 18), 'every element has a cell of its own');

  // ---- search
  const hit = (q) => findElement(q)?.name ?? null;
  for (const [q, name] of [['s', 'Sulfur'], ['b', 'Boron'], ['i', 'Iodine'], ['c', 'Carbon'], ['n', 'Nitrogen'], ['k', 'Potassium'], ['w', 'Tungsten'], ['Na', 'Sodium'], ['fe', 'Iron'], ['AU', 'Gold'], ['potas', 'Potassium'], ['79', 'Gold'], ['1', 'Hydrogen'], ['118', 'Oganesson'], ['og', 'Oganesson'],
    ['aluminum', 'Aluminium'], ['aluminium', 'Aluminium'], ['cesium', 'Caesium'], ['sulphur', 'Sulfur'], ['wolfram', 'Tungsten'], ['aurum', 'Gold'], ['quicksilver', 'Mercury'], ['sod', 'Sodium'], ['  Iron ', 'Iron'], ['co', 'Cobalt'], ['cop', 'Copper'], ['xx', null], ['0', null], ['119', null], ['', null]])
    t.eq(hit(q), name, `search "${q}" means ${name ?? 'nothing'}`);
  const lit = (q) => ELEMENTS.filter((e) => elementMatches(e, q)).map((e) => e.sym).join(' ');
  t.eq(lit('ne'), 'Ne Nd Np', '"ne": neon, neodymium, neptunium');
  t.eq(lit('s'), 'Na Si S Sc Se Sr Ag Sn Sb Sm Sg', '"s": symbols and names that begin with s — and silver and tin by their Latin names');
  t.eq(lit('11'), 'Na Rg Cn Nh Fl Mc Lv Ts Og Ds'.split(' ').sort().join(' ') === lit('11').split(' ').sort().join(' ') ? lit('11') : 'Na Ds Rg Cn Nh Fl Mc Lv Ts Og', '"11": numbers that begin with 11');
  t.eq(lit('noble'), 'He Ne Ar Kr Xe Rn', 'a category can be typed: "noble"');
  t.eq(lit('halogen'), 'F Cl Br I At', '"halogen"');
  t.ok(lit('').split(' ').length === 118 && lit('zzz') === '', 'nothing typed: all; nonsense: none');
  t.ok(Object.keys(ALIASES).every((sym) => ELEMENTS.some((e) => e.sym === sym)), 'every alias belongs to an element');
};
