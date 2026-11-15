// Periodic table data (IUPAC standard atomic weights, abridged; [n] = mass number of the most stable isotope).
export const CATEGORY_COLORS: Record<string, string> = {
  'alkali metal': '#fca5a5', 'alkaline earth metal': '#fdba74', 'transition metal': '#fde68a', 'post-transition metal': '#bbf7d0',
  metalloid: '#99f6e4', nonmetal: '#bae6fd', halogen: '#c7d2fe', 'noble gas': '#e9d5ff', lanthanide: '#fbcfe8', actinide: '#f5d0fe', unknown: '#e5e7eb',
};
const CAT: Record<string, string> = { a: 'alkali metal', e: 'alkaline earth metal', t: 'transition metal', p: 'post-transition metal', m: 'metalloid', n: 'nonmetal', h: 'halogen', g: 'noble gas', l: 'lanthanide', c: 'actinide', u: 'unknown' };
// z sym name mass cat group config (core shorthand)
const RAW = `1 H Hydrogen 1.008 n 1 1s1
2 He Helium 4.0026 g 18 1s2
3 Li Lithium 6.94 a 1 [He] 2s1
4 Be Beryllium 9.0122 e 2 [He] 2s2
5 B Boron 10.81 m 13 [He] 2s2 2p1
6 C Carbon 12.011 n 14 [He] 2s2 2p2
7 N Nitrogen 14.007 n 15 [He] 2s2 2p3
8 O Oxygen 15.999 n 16 [He] 2s2 2p4
9 F Fluorine 18.998 h 17 [He] 2s2 2p5
10 Ne Neon 20.180 g 18 [He] 2s2 2p6
11 Na Sodium 22.990 a 1 [Ne] 3s1
12 Mg Magnesium 24.305 e 2 [Ne] 3s2
13 Al Aluminium 26.982 p 13 [Ne] 3s2 3p1
14 Si Silicon 28.085 m 14 [Ne] 3s2 3p2
15 P Phosphorus 30.974 n 15 [Ne] 3s2 3p3
16 S Sulfur 32.06 n 16 [Ne] 3s2 3p4
17 Cl Chlorine 35.45 h 17 [Ne] 3s2 3p5
18 Ar Argon 39.95 g 18 [Ne] 3s2 3p6
19 K Potassium 39.098 a 1 [Ar] 4s1
20 Ca Calcium 40.078 e 2 [Ar] 4s2
21 Sc Scandium 44.956 t 3 [Ar] 3d1 4s2
22 Ti Titanium 47.867 t 4 [Ar] 3d2 4s2
23 V Vanadium 50.942 t 5 [Ar] 3d3 4s2
24 Cr Chromium 51.996 t 6 [Ar] 3d5 4s1
25 Mn Manganese 54.938 t 7 [Ar] 3d5 4s2
26 Fe Iron 55.845 t 8 [Ar] 3d6 4s2
27 Co Cobalt 58.933 t 9 [Ar] 3d7 4s2
28 Ni Nickel 58.693 t 10 [Ar] 3d8 4s2
29 Cu Copper 63.546 t 11 [Ar] 3d10 4s1
30 Zn Zinc 65.38 t 12 [Ar] 3d10 4s2
31 Ga Gallium 69.723 p 13 [Ar] 3d10 4s2 4p1
32 Ge Germanium 72.630 m 14 [Ar] 3d10 4s2 4p2
33 As Arsenic 74.922 m 15 [Ar] 3d10 4s2 4p3
34 Se Selenium 78.971 n 16 [Ar] 3d10 4s2 4p4
35 Br Bromine 79.904 h 17 [Ar] 3d10 4s2 4p5
36 Kr Krypton 83.798 g 18 [Ar] 3d10 4s2 4p6
37 Rb Rubidium 85.468 a 1 [Kr] 5s1
38 Sr Strontium 87.62 e 2 [Kr] 5s2
39 Y Yttrium 88.906 t 3 [Kr] 4d1 5s2
40 Zr Zirconium 91.224 t 4 [Kr] 4d2 5s2
41 Nb Niobium 92.906 t 5 [Kr] 4d4 5s1
42 Mo Molybdenum 95.95 t 6 [Kr] 4d5 5s1
43 Tc Technetium [98] t 7 [Kr] 4d5 5s2
44 Ru Ruthenium 101.07 t 8 [Kr] 4d7 5s1
45 Rh Rhodium 102.91 t 9 [Kr] 4d8 5s1
46 Pd Palladium 106.42 t 10 [Kr] 4d10
47 Ag Silver 107.87 t 11 [Kr] 4d10 5s1
48 Cd Cadmium 112.41 t 12 [Kr] 4d10 5s2
49 In Indium 114.82 p 13 [Kr] 4d10 5s2 5p1
50 Sn Tin 118.71 p 14 [Kr] 4d10 5s2 5p2
51 Sb Antimony 121.76 m 15 [Kr] 4d10 5s2 5p3
52 Te Tellurium 127.60 m 16 [Kr] 4d10 5s2 5p4
53 I Iodine 126.90 h 17 [Kr] 4d10 5s2 5p5
54 Xe Xenon 131.29 g 18 [Kr] 4d10 5s2 5p6
55 Cs Caesium 132.91 a 1 [Xe] 6s1
56 Ba Barium 137.33 e 2 [Xe] 6s2
57 La Lanthanum 138.91 l 3 [Xe] 5d1 6s2
58 Ce Cerium 140.12 l 0 [Xe] 4f1 5d1 6s2
59 Pr Praseodymium 140.91 l 0 [Xe] 4f3 6s2
60 Nd Neodymium 144.24 l 0 [Xe] 4f4 6s2
61 Pm Promethium [145] l 0 [Xe] 4f5 6s2
62 Sm Samarium 150.36 l 0 [Xe] 4f6 6s2
63 Eu Europium 151.96 l 0 [Xe] 4f7 6s2
64 Gd Gadolinium 157.25 l 0 [Xe] 4f7 5d1 6s2
65 Tb Terbium 158.93 l 0 [Xe] 4f9 6s2
66 Dy Dysprosium 162.50 l 0 [Xe] 4f10 6s2
67 Ho Holmium 164.93 l 0 [Xe] 4f11 6s2
68 Er Erbium 167.26 l 0 [Xe] 4f12 6s2
69 Tm Thulium 168.93 l 0 [Xe] 4f13 6s2
70 Yb Ytterbium 173.05 l 0 [Xe] 4f14 6s2
71 Lu Lutetium 174.97 l 0 [Xe] 4f14 5d1 6s2
72 Hf Hafnium 178.49 t 4 [Xe] 4f14 5d2 6s2
73 Ta Tantalum 180.95 t 5 [Xe] 4f14 5d3 6s2
74 W Tungsten 183.84 t 6 [Xe] 4f14 5d4 6s2
75 Re Rhenium 186.21 t 7 [Xe] 4f14 5d5 6s2
76 Os Osmium 190.23 t 8 [Xe] 4f14 5d6 6s2
77 Ir Iridium 192.22 t 9 [Xe] 4f14 5d7 6s2
78 Pt Platinum 195.08 t 10 [Xe] 4f14 5d9 6s1
79 Au Gold 196.97 t 11 [Xe] 4f14 5d10 6s1
80 Hg Mercury 200.59 t 12 [Xe] 4f14 5d10 6s2
81 Tl Thallium 204.38 p 13 [Xe] 4f14 5d10 6s2 6p1
82 Pb Lead 207.2 p 14 [Xe] 4f14 5d10 6s2 6p2
83 Bi Bismuth 208.98 p 15 [Xe] 4f14 5d10 6s2 6p3
84 Po Polonium [209] p 16 [Xe] 4f14 5d10 6s2 6p4
85 At Astatine [210] h 17 [Xe] 4f14 5d10 6s2 6p5
86 Rn Radon [222] g 18 [Xe] 4f14 5d10 6s2 6p6
87 Fr Francium [223] a 1 [Rn] 7s1
88 Ra Radium [226] e 2 [Rn] 7s2
89 Ac Actinium [227] c 3 [Rn] 6d1 7s2
90 Th Thorium 232.04 c 0 [Rn] 6d2 7s2
91 Pa Protactinium 231.04 c 0 [Rn] 5f2 6d1 7s2
92 U Uranium 238.03 c 0 [Rn] 5f3 6d1 7s2
93 Np Neptunium [237] c 0 [Rn] 5f4 6d1 7s2
94 Pu Plutonium [244] c 0 [Rn] 5f6 7s2
95 Am Americium [243] c 0 [Rn] 5f7 7s2
96 Cm Curium [247] c 0 [Rn] 5f7 6d1 7s2
97 Bk Berkelium [247] c 0 [Rn] 5f9 7s2
98 Cf Californium [251] c 0 [Rn] 5f10 7s2
99 Es Einsteinium [252] c 0 [Rn] 5f11 7s2
100 Fm Fermium [257] c 0 [Rn] 5f12 7s2
101 Md Mendelevium [258] c 0 [Rn] 5f13 7s2
102 No Nobelium [259] c 0 [Rn] 5f14 7s2
103 Lr Lawrencium [266] c 0 [Rn] 5f14 7s2 7p1
104 Rf Rutherfordium [267] t 4 [Rn] 5f14 6d2 7s2
105 Db Dubnium [268] t 5 [Rn] 5f14 6d3 7s2
106 Sg Seaborgium [269] t 6 [Rn] 5f14 6d4 7s2
107 Bh Bohrium [270] t 7 [Rn] 5f14 6d5 7s2
108 Hs Hassium [269] t 8 [Rn] 5f14 6d6 7s2
109 Mt Meitnerium [278] u 9 [Rn] 5f14 6d7 7s2 (predicted)
110 Ds Darmstadtium [281] u 10 [Rn] 5f14 6d8 7s2 (predicted)
111 Rg Roentgenium [282] u 11 [Rn] 5f14 6d9 7s2 (predicted)
112 Cn Copernicium [285] u 12 [Rn] 5f14 6d10 7s2 (predicted)
113 Nh Nihonium [286] u 13 [Rn] 5f14 6d10 7s2 7p1 (predicted)
114 Fl Flerovium [289] u 14 [Rn] 5f14 6d10 7s2 7p2 (predicted)
115 Mc Moscovium [290] u 15 [Rn] 5f14 6d10 7s2 7p3 (predicted)
116 Lv Livermorium [293] u 16 [Rn] 5f14 6d10 7s2 7p4 (predicted)
117 Ts Tennessine [294] u 17 [Rn] 5f14 6d10 7s2 7p5 (predicted)
118 Og Oganesson [294] u 18 [Rn] 5f14 6d10 7s2 7p6 (predicted)`;

export interface Element { z: number; sym: string; name: string; mass: string; cat: string; group: number; period: number; config: string; row: number; col: number }

export const ELEMENTS: Element[] = RAW.split('\n').map((line) => {
  const [z, sym, name, mass, c, g, ...cfg] = line.split(' ');
  const Z = +z;
  const period = Z <= 2 ? 1 : Z <= 10 ? 2 : Z <= 18 ? 3 : Z <= 36 ? 4 : Z <= 54 ? 5 : Z <= 86 ? 6 : 7;
  const fBlock = (Z >= 57 && Z <= 71) || (Z >= 89 && Z <= 103);
  return {
    z: Z, sym, name, mass, cat: CAT[c], group: +g, period, config: cfg.join(' '),
    row: fBlock ? (Z <= 71 ? 9 : 10) : period,
    col: fBlock ? 3 + (Z <= 71 ? Z - 57 : Z - 89) : +g,
  };
});
