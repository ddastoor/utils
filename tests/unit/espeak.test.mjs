// espeak.wasm (eSpeak NG 1.52.0 built by us, English data linked in): IPA known answers from the native build.
export default async (t, { load, wasm }) => {
  const { bindEspeak } = await load('/src/wasm/espeak.ts');
  const es = bindEspeak(await wasm('espeak'));
  t.ok(/^1\.52\.0/.test(es.version()), `version ${es.version()}`);
  t.eq(es.phonemes('Hello world'), 'həlˈoʊ wˈɜːld', 'US English: hello world');
  t.eq(es.phonemes('Hello world, this is a test of the Kokoro voice.'), 'həlˈoʊ wˈɜːld ðɪs ɪz ɐ tˈɛst ʌvðə kəkˈɔːɹoʊ vˈɔɪs', 'US English sentence (clauses joined by spaces)');
  t.eq(es.phonemes('twelve 12 1999'), 'twˈɛlv twˈɛlv nˈaɪntiːnhˈʌndɹɪd nˈaɪnti nˈaɪn', 'numbers read out (same as the native build)');
  t.eq(es.phonemes('tomato'), 'təmˈeɪɾoʊ', 'US tomato');
  es.voice('gmw/en');
  t.eq(es.phonemes('tomato'), 'təmˈɑːtəʊ', 'British tomato');
  t.eq(es.phonemes('Hello world'), 'həlˈəʊ wˈɜːld', 'British hello');
  es.voice('gmw/en-us');
  t.eq(es.phonemes('Hello, world. How are you? Fine!', 'piper'), 'həlˈoʊ, wˈɜːld.\nhˈaʊ ɑːɹ juː?\nfˈaɪn!', 'Piper mode: punctuation kept, one sentence per line');
  t.eq(es.phonemes('Wait: first; second', 'piper'), 'wˈeɪt: fˈɜːst; sˈɛkənd', 'colon and semicolon kept');
  t.eq(es.phonemes(''), '', 'empty text');
  t.ok(es.phonemes('café naïve résumé').length > 10, 'accented Latin');
  t.ok(es.phonemes('नमस्ते 😀 ✓').length >= 0, 'other scripts and emoji do not crash');
  const long = 'The quick brown fox jumps over the lazy dog. '.repeat(200);
  t.ok(es.phonemes(long, 'piper').split('\n').length === 200, 'long text: 200 sentences');
  t.throws(() => es.voice('gmw/xx'), 'unknown voice refused');
};
