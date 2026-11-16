// Text-to-Speech front ends: Kokoro normalisation/phonemes/tokens (port of kokoro-js) and Piper phoneme ids, with
// our espeak.wasm and the real Piper voice config.
import { readFileSync, existsSync } from 'node:fs';
export default async (t, { load, wasm }) => {
  const { bindEspeak } = await load('/src/wasm/espeak.ts');
  const K = await load('/src/lib/kokoro.ts'), P = await load('/src/lib/piper.ts');
  const es = bindEspeak(await wasm('espeak'));
  const n = K.normalizeText;
  t.eq(n('It costs $5.'), 'It costs 5 dollars.', 'money: $5');
  t.eq(n('Pay $1.50 now'), 'Pay 1 dollar and 50 cents now', 'money: $1.50');
  t.eq(n('£20'), '20 pounds', 'money: pounds');
  t.eq(n('In 1999 and 2005'), 'In 19 99 and 2005', 'years read as pairs (2005 stays)');
  t.eq(n('Meet at 12:05 or 3:30'), 'Meet at 12 oh 5 or 3 30', 'times');
  t.eq(n('Dr. Smith and Mr. Jones'), 'Doctor Smith and Mister Jones', 'titles');
  t.eq(n('pi is 3.14'), 'pi is 3 point 1 4', 'decimals');
  t.eq(n('pages 10-20'), 'pages 10 to 20', 'ranges');
  t.eq(n('1,000,000 people'), '1000000 people', 'thousands separators');
  t.eq(K.phonemize(es, 'Hello, world!', 'a'), 'həlˈoʊ, wˈɜːld!', 'US phonemes keep punctuation');
  t.eq(K.phonemize(es, 'Hello world', 'b'), 'həlˈəʊ wˈɜːld', 'British phonemes');
  t.ok(K.phonemize(es, 'Kokoro', 'a').startsWith('kˈoʊkəɹoʊ'), 'Kokoro fix-up applied');
  t.eq(K.phonemize(es, 'ninety', 'a'), 'nˈaɪndi', 'American flap: ninety → nˈaɪndi');
  const ids = K.tokenize('həlˈoʊ');
  t.eq(ids, [0, K.VOCAB.h, K.VOCAB['ə'], K.VOCAB.l, K.VOCAB['ˈ'], K.VOCAB.o, K.VOCAB['ʊ'], 0], 'tokens: $ + symbols + $');
  t.ok(Object.keys(K.VOCAB).length === 114 || Object.keys(K.VOCAB).length === 115, `vocabulary of ${Object.keys(K.VOCAB).length} symbols`);
  t.eq(K.tokenize('a☃b'), [0, K.VOCAB.a, K.VOCAB.b, 0], 'unknown symbols dropped');
  t.eq(K.sentences('Dr. Smith went home. He slept! Did he? Yes.'), ['Dr. Smith went home.', 'He slept!', 'Did he?', 'Yes.'], 'sentence split, abbreviation kept');
  t.eq(K.sentences('First line\n\nSecond paragraph.'), ['First line', 'Second paragraph.'], 'blank line ends a sentence');
  const long = 'This is a fairly long clause that keeps going, and another clause follows it, and then more words come along. '.repeat(1).repeat(8);
  const c = K.chunks(es, long, 'a');
  t.ok(c.every((x) => [...x.phonemes].length <= K.MAX_TOKENS), `chunks ≤ ${K.MAX_TOKENS} symbols (${c.length} chunks)`);
  const short = K.chunks(es, 'Hi. Ok. Fine.', 'a');
  t.ok(short.length === 1 && short[0].text === 'Hi. Ok. Fine.', 'short sentences merged into one chunk');
  // Piper
  t.eq(P.sentencePhonemes(es, 'Hello, world. How are you?'), ['həlˈoʊ, wˈɜːld.', 'hˈaʊ ɑːɹ juː?'], 'Piper sentences with punctuation');
  const cfgPath = new URL('../../public/models/piper/en_US-l2arctic-medium.onnx.json', import.meta.url);
  if (existsSync(cfgPath)) {
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    const { ids: pi, missing } = P.phonemeIds('ab.', cfg.phoneme_id_map);
    const m = cfg.phoneme_id_map;
    t.eq(pi, [1, 0, m.a[0], 0, m.b[0], 0, m['.'][0], 0, 2], 'Piper ids: ^ _ a _ b _ . _ $');
    t.ok(!missing.length, 'all symbols known');
    const all = P.sentencePhonemes(es, 'The quick brown fox jumps over the lazy dog; she sells sea shells, thinks about measure and judge!').join(' ');
    t.eq(P.phonemeIds(all, m).missing, [], 'every eSpeak symbol of an English pangram is in the Piper map');
    t.eq([cfg.speaker_id_map.SVBI, cfg.speaker_id_map.TNI, cfg.speaker_id_map.ASI, cfg.speaker_id_map.RRBI], [2, 9, 10, 19], 'Indian English speaker ids');
    const k = K.tokenize(K.phonemize(es, 'The quick brown fox jumps over the lazy dog; she sells sea shells, thinks about measure and judge!', 'a'));
    t.ok(k.length > 60, `Kokoro pangram: ${k.length} tokens, none lost`);
  } else t.ok(true, 'Piper config not fetched (run npm run assets) — id checks skipped');
};
