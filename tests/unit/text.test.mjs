export default async (t, { load }) => {
  const x = await load('/src/tools/text.ts');
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
  // stats
  const s = x.textStats('Hello world. This is a test!\n\nSecond paragraph here.');
  t.eq([s.words, s.sentences, s.paragraphs], [9, 3, 2], 'word/sentence/paragraph counts');
  t.eq(x.textStats('नमस्ते दुनिया').words, 2, 'Hindi word count');
  // fancy
  const bold = x.FANCY.find(([n]) => n === 'Bold')[1]('Ab1'); t.eq(bold, '𝐀𝐛𝟏', 'bold unicode');
  t.eq(x.FANCY.find(([n]) => n === 'Upside down')[1]('hi'), 'ᴉɥ', 'upside down');
  // colour
  const { hexToRgb, rgbToHex, rgbToHsl, hslToRgb, rgbToOklch, oklchToRgb } = x.colorFns;
  t.eq(hexToRgb('#4f46e5'), [79, 70, 229], 'hex → rgb'); t.eq(hexToRgb('#fff'), [255, 255, 255], 'short hex');
  t.eq(rgbToHex(...hslToRgb(...rgbToHsl(79, 70, 229))), '#4f46e5', 'rgb ⇄ hsl round trip');
  t.eq(rgbToHex(...oklchToRgb(...rgbToOklch(12, 200, 99))), '#0cc863', 'rgb ⇄ oklch round trip');
  t.near(x.contrastRatio([0, 0, 0], [255, 255, 255]), 21, 1e-9, 'black/white contrast 21:1');
};
