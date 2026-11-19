export default async (t, { load, wasm }) => {
  const x = await load('/src/tools/text.ts');
  const { bindTextcore } = await load('/src/wasm/textcore.ts');
  const tc = bindTextcore(await wasm('textcore'));
  // morse
  t.eq(x.toMorse('SOS Help'), '... --- ... / .... . .-.. .--.', 'to morse');
  t.eq(x.fromMorse('... --- ... / .... . .-.. .--.'), 'SOS HELP', 'from morse');
  t.eq(x.fromMorse(x.toMorse('Hello, World 2026!')), 'HELLO, WORLD 2026!', 'morse round trip');
  // case
  const c = Object.fromEntries(x.CASES.map(([n, f]) => [n, f('the quickBrown fox-of the_year')]));
  t.eq(c['camelCase'], 'theQuickBrownFoxOfTheYear', 'camel'); t.eq(c['snake_case'], 'the_quick_brown_fox_of_the_year', 'snake');
  t.eq(c['kebab-case'], 'the-quick-brown-fox-of-the-year', 'kebab'); t.eq(c['CONSTANT_CASE'], 'THE_QUICK_BROWN_FOX_OF_THE_YEAR', 'constant');
  t.eq(x.CASES.find(([n]) => n === 'Title Case')[1]('war and peace of the world'), 'War and Peace of the World', 'title case small words');
  t.eq(x.CASES.find(([n]) => n === 'Sentence case')[1]('HELLO THERE. HOW ARE YOU?'), 'Hello there. How are you?', 'sentence case');
  // fancy
  const bold = x.FANCY.find(([n]) => n === 'Bold')[1]('Ab1'); t.eq(bold, '𝐀𝐛𝟏', 'bold unicode');
  t.eq(x.FANCY.find(([n]) => n === 'Upside down')[1]('hi'), 'ᴉɥ', 'upside down');
  // colour
  const { hexToRgb, rgbToHex } = await load('/src/lib/color.ts');
  const { bindMathcore } = await load('/src/wasm/mathcore.ts');
  const mc = bindMathcore(await wasm('mathcore'));
  const { rgbToHsl, hslToRgb, rgbToOklch, oklchToRgb } = mc;
  t.eq(hexToRgb('#4f46e5'), [79, 70, 229], 'hex → rgb'); t.eq(hexToRgb('#fff'), [255, 255, 255], 'short hex');
  t.eq(rgbToHex(...hslToRgb(...rgbToHsl(79, 70, 229))), '#4f46e5', 'rgb ⇄ hsl round trip');
  t.eq(rgbToHex(...oklchToRgb(...rgbToOklch(12, 200, 99))), '#0cc863', 'rgb ⇄ oklch round trip');
  t.near(mc.contrast([0, 0, 0], [255, 255, 255]), 21, 1e-9, 'black/white contrast 21:1');
  t.near(mc.contrast([118, 118, 118], [255, 255, 255]), 4.54, 0.01, '#767676 on white ≈ 4.54:1 (WCAG AA boundary)');
  t.eq(rgbToHsl(255, 0, 0).map(Math.round), [0, 100, 50], 'red → hsl(0 100% 50%)');
  t.eq(hslToRgb(240, 100, 50).map(Math.round), [0, 0, 255], 'hsl(240 100% 50%) → blue');
  const ok = rgbToOklch(255, 255, 255); t.ok(Math.abs(ok[0] - 100) < 0.01 && ok[1] < 1e-4, `white → oklch(100% 0 …): ${ok}`);
};
