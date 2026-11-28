// ClearURLs 1.28.0 itself, as the reference of the link checker (tests/fixtures/links/clearurls-addon/README.md): its own
// cleaning code run in a vm context, the parts of a browser it touches stood in for, fed the engine's rules file.
//   const ref = await clearurls();  ref.clean(url) → pureCleaning(url, true);  ref.blocked(url) → the providers that would
//   block the address outright (completeProvider), as removeFieldsFormURL decides it on the link as it stands.
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const DIR = fileURLToPath(new URL('../fixtures/links/clearurls-addon/', import.meta.url));
const RULES = fileURLToPath(new URL('../../wasm/devcore/data/links/clearurls.json', import.meta.url));
// the extension's background scripts that the cleaning needs, in the order of its manifest
const FILES = ['core_js/utils/URLHashParams.js', 'core_js/utils/decodeRedirectTarget.js', 'external_js/ip-range-check.js',
  'core_js/tools.js', 'core_js/pureCleaning.js', 'clearurls.js'];

export async function clearurls() {
  const text = readFileSync(RULES, 'utf8').trim();
  const hash = createHash('sha256').update(text).digest('hex');
  const noop = () => {};
  const api = new Proxy(function () {}, { get: (_t, k) => (k === 'then' ? undefined : api), apply: () => Promise.resolve() });
  const listeners = [];
  const sandbox = {
    console: { log: noop, warn: noop, info: noop, error: (...a) => { throw new Error('ClearURLs: ' + a.join(' ')); } },
    URL, URLSearchParams, TextEncoder, TextDecoder, crypto: webcrypto, setTimeout, clearTimeout,
    // as the extension's storage.js holds it after loading the rules: the default settings that touch cleaning
    storage: {
      ClearURLsData: JSON.parse(text), dataHash: hash, hashURL: 'hash', ruleURL: 'rules', globalStatus: true,
      localHostsSkipping: true, domainBlocking: true, referralMarketing: false, loggingStatus: false, statisticsStatus: false,
      badgedStatus: false, pingBlocking: true, pingRequestTypes: ['ping', 'beacon'], types: ['main_frame'], log: { log: [] },
      totalCounter: 0, cleanedCounter: 0, logLimit: 100,
    },
    // the rules' hash as the extension's server gives it: equal to the stored one, so the stored rules are used
    fetch: async () => ({ status: 200, text: async () => hash, clone() { return this; } }),
    getData: (k) => sandbox.storage[k], increaseBadged: noop, saveOnDisk: noop, deferSaveOnDisk: noop, storeHashStatus: noop,
    saveOnExit: noop,
    chrome: { runtime: { getPlatformInfo: (cb) => cb({ os: 'linux' }) } },
    browser: {
      i18n: { getMessage: (k) => k },
      webRequest: { onBeforeRequest: { addListener: (f) => listeners.push(f) } },
      browserAction: api, runtime: api, tabs: api,
    },
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of FILES) vm.runInContext(readFileSync(DIR + f, 'utf8'), ctx, { filename: f });
  vm.runInContext('start()', ctx);
  // the providers are made when the hash's promise settles
  for (let i = 0; i < 50 && !vm.runInContext('providers.length', ctx); i++) await new Promise((r) => setTimeout(r, 5));
  const n = vm.runInContext('providers.length', ctx);
  if (!n) throw new Error('ClearURLs made no providers');
  ctx.__clean = vm.runInContext('(u) => pureCleaning(u, true)', ctx);
  ctx.__blocked = vm.runInContext(`(u) => providers.filter((p) => p.matchURL(u) && removeFieldsFormURL(p, u, true).cancel).map((p) => p.getName())`, ctx);
  return { providers: n, clean: (u) => ctx.__clean(u), blocked: (u) => [...ctx.__blocked(u)], listeners: listeners.length };
}
