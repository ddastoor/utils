// The link checker (devcore-links.wasm, wasm/devcore/src/links.rs) — shared by Scam & QR Check and Clean Link — held to
// independent readings:
//  - ClearURLs 1.28.0's own cleaning code (tests/lib/clearurls-ref.mjs, run in a vm on the engine's rules file): every link of a
//    corpus — real tracking links, a link made for every provider whose address pattern a sample can be made for, with its rules'
//    fields among fields to keep, in the query and in the fragment, and random links of the global rules — cleaned alike;
//  - tests/fixtures/links/reference.json (scripts/make-links-reference.py): the Public Suffix List as the Python package
//    publicsuffixlist reads it (the same list as the psl crate's: its VERSION line), UTS #39 skeletons made from Unicode's own
//    confusables.txt 18.0 (and ICU 74's where Unicode 15.1 maps the characters alike), ICU's restriction levels with UTS #39's
//    identifier profile, the characters that profile does not allow;
//  - Node's own URL parser for the names as a person reads them (domainToUnicode);
//  - known answers for links and messages, genuine and scams.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { domainToUnicode } from 'node:url';
import { clearurls } from '../lib/clearurls-ref.mjs';

const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const REF = JSON.parse(readFileSync(at('../fixtures/links/reference.json'), 'utf8'));
const RULES_TEXT = readFileSync(at('../../wasm/devcore/data/links/clearurls.json'), 'utf8');
const RULES = JSON.parse(RULES_TEXT);

// a seeded generator, so that the random links are the same every run
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

/** A sample address for a provider's pattern (written for its site: ^https?://(?:[a-z0-9-]+\.)*?amazon(?:\.[a-z]{2,}){1,} …),
 *  or null — the pattern is made simple step by step and the result must match the pattern itself. */
function sampleFor(pattern) {
  let s = pattern;
  s = s.replace(/^\^/, '').replace(/\$$/, '');
  s = s.replace(/\(\?:\[a-z0-9-\]\+\\\.\)\*\??/g, 'www.');
  s = s.replace(/\(\?:\\\.\[a-z\]\{2,\}\)\{1,\}/g, '.com');
  s = s.replace(/https\?:\\\/\\\//g, 'https://');
  for (let i = 0; i < 6; i++) s = s.replace(/\(\?:([^()|]*)(?:\|[^()]*)?\)[?*]?/g, '$1');
  s = s.replace(/\[a-z\]\{2,\}/g, 'com').replace(/\[a-z0-9-\]\+/g, 'abc').replace(/\\d\+|\[0-9\]\+/g, '1');
  s = s.replace(/\.\*\??|\[\^[^\]]*\]\*/g, '').replace(/\[\^[^\]]*\]\+/g, 'x');
  s = s.replace(/\\([./?\-=&#:])/g, '$1');
  if (!/^https:\/\//.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  try { const u = new URL(s); if (!new RegExp(pattern, 'i').test(u.href)) return null; return u.href; } catch { return null; }
}
/** A field name a rule matches (^rule$, i): the rule as written, or made simple */
function nameFor(rule) {
  const ok = (n) => n && /^[\w.%\-[\]$:]+$/.test(n) && new RegExp('^' + rule + '$', 'i').test(n);
  if (ok(rule)) return rule;
  let s = rule;
  for (let i = 0; i < 4; i++) s = s.replace(/\(\?:([^()|]*)(?:\|[^()]*)?\)[?*]?/g, '$1');
  s = s.replace(/\[a-z\]\+|\[a-z\]\*|\\w\+|\\w\*|\[a-z0-9_\]\+|\[\^&\]\*|\.\*\??|\.\+/gi, 'x').replace(/\\d\+|\\d\*|\[0-9\]\+/g, '1');
  s = s.replace(/\\([._\-[\]$])/g, '$1').replace(/[?*+]/g, '');
  return ok(s) ? s : null;
}

export default async (t, { load, wasm }) => {
  const { bindDevcore } = await load('/src/wasm/devcore.ts');
  const d = bindDevcore(await wasm('devcore-links'));
  const call = (op, arg) => d.json(op, arg);
  const ref = await clearurls();

  // ---- the rules file and what the engine says of it
  const info = call('links:info', {});
  t.eq(info.clearurls.sha256, createHash('sha256').update(RULES_TEXT).digest('hex'), 'the rules file is the one pinned in the engine');
  t.eq(info.clearurls.providers, Object.keys(RULES.providers).length, `every provider of the rules file read (${info.clearurls.providers})`);
  t.eq(ref.providers, info.clearurls.providers, 'ClearURLs itself makes as many providers of the same file');
  t.eq(info.clearurls.unreadable, [], 'every rule of the file is a pattern the engine can read');
  t.eq(info.unicode, REF.unicodeData, `the look-alike data is Unicode ${info.unicode}'s, as the reference's`);

  // ---- ClearURLs: the same cleaning as the extension's
  const corpus = [
    'https://www.amazon.in/Apple-iPhone-15-128-GB/dp/B0CHX1W1XY/ref=sr_1_1?crid=2X3&dib=eyJ2IjoiMSJ9&dib_tag=se&keywords=iphone+15&qid=1732790000&sprefix=iphone%2Caps%2C312&sr=8-1',
    'https://www.amazon.in/gp/product/B09G9HD6PD/ref=ppx_yo_dt_b_asin_title_o00_s00?ie=UTF8&psc=1',
    'https://www.amazon.com/dp/B08N5WRWNW?tag=affiliate-20&linkCode=ogi&th=1&psc=1',
    'https://www.amazon.in/s?k=headphones&crid=1&sprefix=head&ref=nb_sb_noss_1',
    'https://www.amazon.co.uk/gp/aw/d/B07XJ8C8F5?pd_rd_w=abc&pf_rd_p=def&pf_rd_r=XYZ&pd_rd_r=123&pd_rd_wg=xyz',
    'https://www.amazon.in/dp/B0CHX1W1XY?_encoding=UTF8&pd_rd_w=x&content-id=amzn1.sym.1&pf_rd_p=x&pf_rd_r=x&pd_rd_wg=x&pd_rd_r=x&ref_=pd_gw_ci_mcx_mr_hp_d',
    'https://amzn.in/d/7Hj2kQ1',
    'https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4?pid=MOBGTAGPTB3VS24W&lid=LSTMOBGTAGPTB3VS24WKFODHL&marketplace=FLIPKART&q=iphone&store=tyy%2F4io&srno=s_1_1&otracker=search&otracker1=search&fm=Search&iid=abc&ppt=sp&ppn=sp&ssid=abc&qH=0b3f45',
    'https://dl.flipkart.com/s/abcdEFgh',
    'https://www.google.com/url?sa=t&rct=j&q=&esrc=s&source=web&cd=&ved=2ahUKEwi&url=https%3A%2F%2Fwww.example.com%2Fpage&usg=AOvVaw0',
    'https://www.google.com/url?q=https://example.com/page%3Fa%3D1&sa=D&ust=1&usg=AOv',
    'https://www.google.co.in/search?q=weather&sca_esv=abc&source=hp&ei=xyz&iflsig=AL&ved=0ah&uact=5&oq=weather&gs_lp=Egdnd3MtV2l6&sclient=gws-wiz',
    'https://www.google.com/maps/place/Taj+Mahal/@27.17,78.04,17z/data=!3m1!4b1?entry=ttu&g_ep=Eg',
    'https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.org%2Fnews%3Futm_source%3Dfacebook&h=AT0abc&__tn__=-UK-R',
    'https://www.facebook.com/somepage?fbclid=IwAR0abc&mibextid=Zxz2cZ',
    'https://www.instagram.com/p/C1abcDEF/?igsh=MTZ3bXlqZ2l6YQ==',
    'https://www.instagram.com/reel/C2xyz/?utm_source=ig_web_copy_link&igshid=MzRlODBiNWFlZA==',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc123&pp=ygUJcmljayByb2xs',
    'https://youtu.be/dQw4w9WgXcQ?si=EyQ4dW&t=42',
    'https://www.youtube.com/redirect?event=video_description&redir_token=QUFF&q=https%3A%2F%2Fexample.com%2F&v=abc',
    'https://twitter.com/user/status/1234567890?s=20&t=abcDEF', 'https://x.com/user/status/1234567890?s=46&t=xyz',
    'https://www.linkedin.com/posts/user_activity-123?utm_source=share&utm_medium=member_android',
    'https://www.linkedin.com/feed/update/urn:li:activity:123?trackingId=abc%3D%3D&lipi=urn%3Ali%3Apage',
    'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=a1b2c3d4&context=spotify%3Aplaylist',
    'https://www.reddit.com/r/india/comments/abc/title/?utm_source=share&utm_medium=android_app&utm_name=androidcss&utm_term=1&utm_content=share_button',
    'https://out.reddit.com/t3_abc?url=https%3A%2F%2Fexample.com%2F&token=AQ&app_name=web2x',
    'https://www.bing.com/ck/a?!&&p=abc&ptn=3&ver=2&hsh=3&fclid=1&u=a1aHR0cHM6Ly9leGFtcGxlLmNvbS8&ntb=1',
    'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2F&rut=abc',
    'https://www.tiktok.com/@user/video/123?is_from_webapp=1&sender_device=pc&web_id=123',
    'https://in.pinterest.com/pin/123/?mt=login&nic_v3=1a',
    'https://www.myntra.com/tshirts/roadster/123/buy?utm_source=dms_google&utm_medium=searchbrand',
    'https://www.swiggy.com/restaurants/abc?utm_source=GooglePlaceOrder&utm_campaign=GoogleMap',
    'https://www.ebay.com/itm/123?_trkparms=abc&_trksid=p123&hash=item1',
    'https://www.aliexpress.com/item/100500.html?spm=a2g0o&algo_pvid=abc&aff_fcid=1&aff_fsk=2&aff_platform=link-c-tool&sk=3&aff_trace_key=4&terminal_id=5',
    'https://medium.com/@user/title-123?source=email-abc&sk=def',
    'https://www.etsy.com/listing/123/title?click_key=abc&click_sum=def&ref=hp_rv-1&frs=1&sts=1',
    'https://www.booking.com/hotel/in/x.html?aid=304142&label=gen173nr&sid=abc&dest_id=1',
    'https://store.steampowered.com/app/123/?snr=1_4_4__129', 'https://steamcommunity.com/linkfilter/?url=https://example.com/',
    'https://www.facebook.com/flx/warn/?u=https%3A%2F%2Fexample.com%2F', 'https://www.google.com/amp/s/www.example.com/amp/article.html',
    'https://www.youtube.com/attribution_link?u=%2Fwatch%3Fv%3Dabc%26feature%3Dshare',
    // the redirect decoder's edges (ClearURLs' decodeRedirectTarget)
    'https://www.google.com/url?q=javascript:alert(1)', 'https://www.google.com/url?q=%2F%2Fevil.example%2F', 'https://www.google.com/url?q=/local/path',
    'https://www.google.com/url?q=evil.example', 'https://www.google.com/url?q=https%253A%252F%252Fexample.com%252F',
    'https://www.google.com/url?q=https%3A%2F%2Fexample.com%2F%3Fa%FF%26b%3Dc', 'https://www.google.com/url?q=http', 'https://www.google.com/url?q=%E0%A4',
    'https://www.google.com/url?q=https%3A%2F%2Fexample.com%2F%0A', 'https://l.facebook.com/l.php?u=mailto%3Ax%40example.com',
    // the query and the fragment as written
    'https://example.com/?utm_source=x&id=7#utm_medium=y&top', 'https://example.com/page?gclid=abc&fbclid=def&msclkid=ghi&yclid=1&mc_eid=2&mc_cid=3&_hsenc=4&_hsmi=5&igshid=6',
    'https://example.com/#!/route?utm_source=x', 'https://example.com/?a=1&&b=2&utm_source=x&', 'https://example.com/?', 'https://example.com/#', 'https://example.com/?#',
    'https://example.com/?utm_source=&utm_medium', 'https://example.com/?%75tm_source=x', 'https://example.com/?UTM_SOURCE=X', 'https://example.com/?utm_source=a%26b&keep=%20x+y',
    'https://example.com/?utm+source=1&utm%5Fsource=2', 'https://example.com/#utm_source&a=1&&b', 'https://example.com/#%75tm_source=1', 'https://example.com/#%253F=1&?utm_source=2',
    'https://example.com/#%3Futm_source=1', 'https://user:pass@example.com/?utm_source=x', 'https://example.com:8443/path;params?utm_source=x#frag',
    'https://例子.中国/?utm_source=x', 'https://example.com/?é=1&utm_source=ü', 'https://example.com/?a=%ZZ&utm_source=1',
    // addresses ClearURLs leaves alone (a computer of the home network)
    'http://192.168.1.1/?utm_source=x', 'http://localhost:8080/?utm_source=x', 'http://10.0.0.5/?fbclid=1', 'http://127.0.0.1/?fbclid=1',
    'http://8.8.8.8/?fbclid=1', 'https://[::1]/?fbclid=1', 'http://172.20.1.1/?fbclid=1', 'http://100.70.1.1/?fbclid=1', 'http://169.254.0.9/?fbclid=1',
    'http://1.2.3.4.example.com/?fbclid=1',
    'https://doubleclick.net/x', 'https://ad.doubleclick.net/ddm/trackclk/N123?u=https://x',
  ];
  // a link for every provider whose pattern a sample can be made for: its rules' fields among fields to keep, in the query
  // and in the fragment
  let made = 0;
  for (const p of Object.values(RULES.providers)) {
    const base = sampleFor(p.urlPattern || '');
    if (!base) continue;
    made++;
    const names = [...(p.rules || []), ...(p.referralMarketing || [])].map(nameFor).filter(Boolean);
    const q = ['id=7', ...names.map((n, i) => `${n}=v${i}`), 'page=2'].join('&');
    corpus.push(`${base.split('#')[0].split('?')[0]}?${q}`);
    if (names.length) corpus.push(`${base.split('#')[0].split('?')[0]}?keep=1#${names[0]}=x&anchor`);
  }
  t.ok(made >= 150, `a sample link made for ${made} of the ${Object.keys(RULES.providers).length} providers`);
  // random links of the global rules on any site
  const r = rng(7), pick = (a) => a[Math.floor(r() * a.length)];
  const glob = (RULES.providers.globalRules.rules || []).map(nameFor).filter(Boolean);
  const hosts = ['example.com', 'news.example.co.in', 'shop.example.in', 'a.b.example.org', 'xn--fiqs8s.example'];
  for (let i = 0; i < 400; i++) {
    const parts = [];
    for (let k = 0, n = 1 + Math.floor(r() * 5); k < n; k++) {
      const tr = r() < 0.6;
      const key = tr ? pick(glob) : pick(['id', 'q', 'page', 'lang', 'ref', 'sort', 'a b', 'ünï']);
      const enc = r() < 0.2 ? encodeURIComponent(key).replace(/[a-z]/, (c) => '%' + c.charCodeAt(0).toString(16)) : key;
      parts.push(r() < 0.1 ? enc : `${enc}=${pick(['1', '', 'x%26y', 'a+b', '%E2%82%B9', '=='])}`);
    }
    if (r() < 0.15) parts.splice(Math.floor(r() * parts.length), 0, '');
    const frag = r() < 0.3 ? '#' + (r() < 0.5 ? `${pick(glob)}=1&top` : 'section-2') : '';
    corpus.push(`https://${pick(hosts)}/${pick(['', 'p/1', 'a/b.html'])}?${parts.join('&')}${frag}`);
  }
  const diff = [];
  let blockedDiff = 0, cleaned = 0;
  for (const raw of corpus) {
    const u = new URL(raw).href;
    const ours = call('links:clearurls', { url: u });
    const theirs = ref.clean(u);
    if (ours.url !== u) cleaned++;
    if (ours.url !== theirs) diff.push(`${u}\n      ours ${ours.url}\n      ClearURLs ${theirs}`);
    if (!ours.steps.some((s) => s.kind === 'redirect') && !!ours.blocked !== ref.blocked(u).length > 0) blockedDiff++;
  }
  t.ok(!diff.length, `${corpus.length} links cleaned as ClearURLs cleans them (${cleaned} changed)${diff.length ? ` — ${diff.length} differ:\n    ${diff.slice(0, 5).join('\n    ')}` : ''}`);
  t.eq(blockedDiff, 0, 'the addresses ClearURLs blocks outright are the ones the engine says are blocked');

  // ---- the product's own address (ours, beside ClearURLs)
  const clean = (u) => call('links:clean', { url: u });
  const products = [
    [corpus[0], 'https://www.amazon.in/dp/B0CHX1W1XY', 'Amazon'],
    [corpus[1], 'https://www.amazon.in/dp/B09G9HD6PD', 'Amazon'],
    [corpus[2], 'https://www.amazon.com/dp/B08N5WRWNW', 'Amazon'],
    [corpus[4], 'https://www.amazon.co.uk/dp/B07XJ8C8F5', 'Amazon'],
    [corpus[7], 'https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4?pid=MOBGTAGPTB3VS24W', 'Flipkart'],
  ];
  for (const [u, want, who] of products) {
    const c = clean(u);
    t.eq([c.url, c.product], [want, who], `${who}'s product link cut to ${want}`);
    t.ok(c.removed.length > 0 && c.removed.every((x) => x.by), `  every part taken off said (${c.removed.length}), and by what`);
  }
  t.eq(clean(corpus[3]).product, null, 'an Amazon search is no product: ClearURLs alone');
  const tags = clean('https://example.com/a?utm_source=whatsapp&utm_medium=social&fbclid=IwAR&id=4');
  t.eq(tags.url, 'https://example.com/a?id=4', 'campaign tags and a click ID taken off, the rest kept');
  t.ok(tags.removed.every((x) => x.what), '  each said in words (a campaign tag, Facebook\'s click ID …)');
  const wrap = clean('https://www.google.com/url?q=https%3A%2F%2Fexample.org%2F%3Futm_source%3Dg&sa=D');
  t.eq([wrap.url, wrap.via.length], ['https://example.org/', 1], 'a redirect wrapper unwrapped, its target cleaned too');
  t.eq(clean('hxxps://example[.]com/?utm_source=x').url, 'https://example.com/', 'a link written so it cannot be clicked is read as the link');

  // ---- the site: the Public Suffix List as publicsuffixlist reads it
  const sites = call('links:site', { hosts: REF.psl.map((x) => x.host) });
  const pslBad = [];
  REF.psl.forEach((x, i) => {
    const s = sites[i];
    const want = { suffix: x.suffix, site: x.site ?? x.host, private: x.suffix !== x.icannSuffix, icannSite: x.icannSite ?? x.host, unicode: domainToUnicode(x.host) };
    for (const k of Object.keys(want)) if (s[k] !== want[k]) pslBad.push(`${x.host} ${k}: ours ${s[k]}, reference ${want[k]}`);
  });
  t.ok(!pslBad.length, `${REF.psl.length} hosts: suffix, site, a service's or not, the site of its ICANN part, the name as read — as the reference (list ${REF.pslVersion})${pslBad.length ? ': ' + pslBad.slice(0, 4).join(' | ') : ''}`);

  // ---- look-alike letters: UTS #39
  const sk = call('links:skeleton', { texts: REF.skeleton.map((x) => x.text) });
  const skBad = [], icuBad = [], lvBad = [];
  REF.skeleton.forEach((x, i) => {
    if (sk[i].skeleton !== x.skeleton) skBad.push(`${x.text}: ${sk[i].skeleton} ≠ ${x.skeleton}`);
    if (x.stable && sk[i].skeleton !== x.icu) icuBad.push(`${x.text}: ${sk[i].skeleton} ≠ ICU ${x.icu}`);
    if (sk[i].level !== x.level) lvBad.push(`${x.text}: ${sk[i].level} ≠ ${x.level}`);
  });
  t.ok(!skBad.length, `${sk.length} skeletons as Unicode ${REF.unicodeData}'s confusables make them${skBad.length ? ': ' + skBad.slice(0, 4).join(' | ') : ''}`);
  t.ok(!icuBad.length, `…and as ICU ${REF.icu} makes them where Unicode ${REF.icuUnicode} maps the characters alike (${REF.skeleton.filter((x) => x.stable).length})${icuBad.length ? ': ' + icuBad.join(' | ') : ''}`);
  t.ok(!lvBad.length, `restriction levels as ICU gives them with UTS #39's identifier profile${lvBad.length ? ': ' + lvBad.slice(0, 4).join(' | ') : ''}`);
  t.ok(REF.skeleton.some((x) => !x.stable), `  (${REF.skeleton.filter((x) => !x.stable).map((x) => x.text).join(', ')}: their mapping changed between ${REF.icuUnicode} and ${REF.unicodeData})`);
  // a character no name is written with: the sign of its own (where it survives the address's own mapping: ｐ becomes p)
  const oddBad = [];
  for (const x of REF.skeleton) {
    const host = `${x.text}.com`;
    let label;
    try { label = domainToUnicode(new URL(`https://${host}/`).hostname).split('.')[0]; } catch { continue; }
    const a = call('links:analyse', { url: `https://${host}/` });
    const has = a.signs.some((s) => s.id === 'odd');
    const want = [...label].some((c) => x.odd.includes(c));
    if (has !== want) oddBad.push(`${x.text} (read ${label}): ${has ? 'said' : 'not said'}`);
  }
  t.ok(!oddBad.length, `characters outside UTS #39's identifier profile said as such where the address keeps them${oddBad.length ? ': ' + oddBad.join(' | ') : ''}`);

  // ---- links: known answers
  const A = (u) => call('links:analyse', { url: u });
  const cases = [
    // [link, verdict, signs that must be there, what it imitates (domain, how) or its own brand's domain]
    ['https://www.hdfcbank.com/personal/pay/cards', 'good', ['own'], 'own hdfcbank.com'],
    ['https://netbanking.hdfcbank.com/netbanking/', 'good', ['own'], 'own hdfcbank.com'],
    ['https://www.onlinesbi.sbi/', 'good', ['own'], 'own onlinesbi.sbi'],
    ['https://sbi.bank.in/', 'good', ['own'], 'own sbi.bank.in'],
    ['https://www.incometax.gov.in/iec/foportal/', 'good', ['own']],
    ['https://some-office.gov.in/', 'good', ['trusted']],
    ['https://hdfcbаnk.com/login', 'danger', ['mixed', 'lookalike'], 'hdfcbank.com letters'],
    ['https://раураl.com/', 'danger', ['mixed', 'lookalike'], 'paypal.com letters'],
    ['https://paytrn.com/', 'danger', ['lookalike'], 'paytm.com letters'],
    ['https://ɑmazon.in/', 'danger', ['odd', 'lookalike'], 'amazon.in letters'],
    ['https://ɡoogle.com/', 'danger', ['odd', 'lookalike'], 'google.com letters'],
    ['https://ǀnstagram.com/', 'danger', ['odd', 'typo'], 'instagram.com typo'],
    ['https://hdfcbank.com.verify-kyc.top/login', 'danger', ['front'], 'hdfcbank.com front'],
    ['https://indiapost.gov.in-track.cc/parcel', 'danger', ['front'], 'indiapost.gov.in front'],
    ['https://hdfcbnak.com/', 'warn', ['typo'], 'hdfcbank.com typo'],
    ['https://hdfcbnak.top/', 'danger', ['typo', 'risky-tld'], 'hdfcbank.com typo'],
    ['https://sbi-kyc-update.in/', 'danger', ['names'], 'sbi.co.in name'],
    ['https://amazon-offers.shop/', 'danger', ['names'], 'amazon.in name'],
    ['https://uidai-gov.in/update', 'danger', ['names'], 'uidai.gov.in name'],
    ['https://flipkart-sale.web.app/', 'danger', ['names', 'service'], 'flipkart.com name'],
    ['https://x.github.io/sbi/login', 'warn', ['service', 'names-path'], 'sbi.co.in path'],
    ['https://x.s3.amazonaws.com/sbi/index.html', 'warn', ['service', 'names-path']],
    ['https://sites.google.com/view/sbi-kyc', 'warn', ['open', 'names-path']],
    ['https://docs.google.com/forms/d/e/1FAIpQL/viewform', 'none', ['open']],
    ['https://wa.me/919876543210', 'none', ['open', 'whatsapp']],
    ['https://chat.whatsapp.com/AbCdEf', 'none', ['open']],
    ['https://amzn.to/3xyz', 'good', ['own', 'short-own']],
    ['https://bit.ly/3abcDEF', 'warn', ['short']],
    ['hxxps://bit[.]ly/x', 'warn', ['defanged', 'short']],
    ['https://www.sbi.co.in@phish.example.com/', 'danger', ['userinfo']],
    ['http://45.33.22.11/login', 'warn', ['ip', 'http']],
    ['https://192.168.1.1/', 'none', ['ip-local']],
    ['https://example.com/files/update.apk', 'danger', ['app']],
    ['https://example.com:8443/', 'warn', ['port']],
    ['javascript:alert(1)', 'danger', ['script']],
    ['https://www.google.com/url?q=https://hdfcbank.com.verify-kyc.top/', 'danger', ['own', 'via']],
    ['intent://pay#Intent;scheme=upi;package=com.phonepe.app;S.browser_fallback_url=https%3A%2F%2Fhdfcbank.com.verify-kyc.top%2F;end', 'danger', ['intent', 'via']],
    ['upi://pay?pa=refund.sbi@ybl&pn=SBI%20Refund&am=4999&cu=INR&tn=Refund', 'danger', ['upi-pay', 'upi-bait', 'upi-name']],
    ['upi://pay?pa=shop@okicici&pn=Ram%20Stores&am=250', 'warn', ['upi-pay', 'upi-amount']],
    ['upi://mandate?pa=x@ybl&pn=Netflix&am=649&mn=Sub', 'danger', ['upi-mandate']],
    ['tel:+911800123456', 'none', ['tel']],
    ['https://microsoft-support.help/', 'danger', ['names'], 'microsoft.com name'],
  ];
  const bad = [];
  for (const [u, verdict, ids, what] of cases) {
    const a = A(u), have = a.signs.map((s) => s.id);
    const miss = ids.filter((i) => !have.includes(i));
    let whatOk = true;
    if (what?.startsWith('own ')) whatOk = a.brand?.domain === what.slice(4);
    else if (what) { const [dom, how] = what.split(' '); whatOk = a.imitates?.domain === dom && a.imitates?.how === how; }
    if (a.verdict !== verdict || miss.length || !whatOk) bad.push(`${u}: ${a.verdict} [${have.join(' ')}] ${JSON.stringify(a.imitates || a.brand)}`);
  }
  t.ok(!bad.length, `${cases.length} links: the verdict, its signs and the brand${bad.length ? ' — ' + bad.join('\n    ') : ''}`);
  t.ok(A('https://hdfcbаnk.com/').signs.find((s) => s.id === 'lookalike').text.includes('‘а’ (Cyrillic letters) where hdfcbank has ‘a’'), 'a look-alike says which letter, and its alphabet');
  t.ok(!A('https://ɑmazon.in/').signs.find((s) => s.id === 'lookalike').text.includes('Latin letters'), '…but not "Latin" for a Latin look-alike');

  // ---- messages: known answers
  const S = (text) => call('links:scan', { text });
  const msgs = [
    ['123456 is your OTP for login to HDFC Bank NetBanking. Do not share it with anyone. -HDFC Bank', 'none', []],
    ['Rs.2,500.00 debited from A/c XX1234 on 28-11-26 to VPA shop@okicici. Not you? Call 18002586161 - SBI', 'none', []],
    ['Your Amazon order #402-1234567-1234567 has been delivered. Details: https://www.amazon.in/gp/your-account/order-details?orderID=402-1234567-1234567', 'none', []],
    ['ALERT: Never share your OTP, PIN or CVV with anyone. SBI never asks for them.', 'none', []],
    ['Dear Customer, your SBI account will be blocked today. Update your PAN immediately: https://sbi-kyc-update.in/', 'danger', ['threat', 'urgent', 'kyc']],
    ['Your electricity power will be disconnected tonight at 9.30 pm because your previous month bill was not updated. Please immediately contact our electricity officer 9876543210.', 'danger', ['power', 'urgent', 'call']],
    ['Congratulations! You have won Rs 25,00,000 in KBC lottery. To claim, pay processing fee of Rs 12,500. WhatsApp +44 7700 900123', 'danger', ['prize', 'fee']],
    ['You will receive Rs 5,000 refund. Scan this QR and enter UPI PIN to receive the money.', 'danger', ['receive']],
    ['This is CBI officer. A parcel in your name with drugs was seized by customs. You are under digital arrest. Do not disconnect the call.', 'danger', ['arrest', 'authority', 'parcel']],
    ['Install AnyDesk so our executive can help you get your refund', 'danger', ['remote']],
    ['Part time job: earn Rs 3000 daily by liking YouTube videos. Contact on Telegram https://t.me/joinchat/xyz', 'warn', ['job']],
    ['Click here to verify your account: https://bit.ly/3xyz', 'warn', ['generic']],
    ['Pay ₹1 to verify: upi://pay?pa=refund@ybl&pn=Refund&am=1', 'danger', []],
    ['Please send the OTP you just received to confirm the delivery.', 'danger', ['otp']],
  ];
  const mbad = [];
  for (const [text, verdict, ids] of msgs) {
    const m = S(text), have = m.words.map((w) => w.id);
    const miss = ids.filter((i) => !have.includes(i));
    const spans = m.items.every((x) => text.slice(x.start, x.end) === x.text);
    if (m.verdict !== verdict || miss.length || !spans) mbad.push(`${text.slice(0, 50)}…: ${m.verdict} [${have.join(' ')}]${spans ? '' : ' (spans)'}`);
  }
  t.ok(!mbad.length, `${msgs.length} messages: the verdict, the wording found, every span on its text${mbad.length ? ' — ' + mbad.join('\n    ') : ''}`);
  const emoji = '🎉 Win big! Visit https://amazon-offers.shop now 🎁 or pay shop@ybl, call +44 7700 900123';
  const em = S(emoji);
  t.ok(em.items.every((x) => emoji.slice(x.start, x.end) === x.text) && em.items.some((x) => x.kind === 'link'), 'spans in UTF-16 units after an emoji (the page\'s own string indices)');
  t.eq(em.links[0].verdict, 'danger', '  and the link in it judged');
  t.eq(S('Meet at 10.30 a.m. near Rs.500 shop; file report.txt').links.length, 0, 'Rs.500, a.m. and file.txt are no links');

  // ---- nothing traps
  const r2 = rng(11), chars = [...'aZ0.-_/:?#&=%@ \n\t€₹аеоχ漢😀́‍[]()<>"\''];
  let threw = 0;
  for (let i = 0; i < 1500; i++) {
    let s = '';
    for (let k = 0, n = Math.floor(r2() * 60); k < n; k++) s += chars[Math.floor(r2() * chars.length)];
    if (r2() < 0.3) s = 'https://' + s;
    try { call('links:analyse', { url: s }); call('links:scan', { text: s }); } catch (e) { if (!/not a link/.test(e.message)) threw++; }
  }
  t.eq(threw, 0, '1,500 random texts as a link and as a message: nothing traps');
  t.throws(() => call('links:scan', { text: 'a\ud83d b' }), 'text with a lone surrogate is refused (the page makes it well-formed first)');
  const long = ('Dear customer, visit https://example.com/?utm_source=x and call 9876543210 today. ').repeat(250);
  const t0 = performance.now(); S(long); const ms = performance.now() - t0;
  t.ok(ms < 1500, `a message of ${long.length.toLocaleString('en')} characters scanned in ${ms.toFixed(0)} ms`);
};
