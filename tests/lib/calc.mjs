// Helpers for the calcForm-based tabs (src/lib/form.ts): set a field by its label, pick a segment option, read a
// result by its label. Labels are matched exactly so the tests break loudly if the UI wording changes.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function calc(page) {
  const fieldOf = (label) => page.locator('.field').filter({ has: page.locator('.field-label', { hasText: new RegExp(`^${esc(label)}$`) }) }).first();
  const api = {
    async set(label, value) { const f = fieldOf(label), i = f.locator('input'); await i.fill(String(value)); await i.dispatchEvent('input'); },
    async seg(label, option) { await fieldOf(label).getByRole('radio', { name: option, exact: true }).click(); },
    async pick(label, value) { await fieldOf(label).locator('select').selectOption(value); },
    async big(label) {
      const v = await page.locator('.big-result').filter({ has: page.locator('.big-label', { hasText: new RegExp(`^${esc(label)}$`) }) }).locator('.big-value').first().textContent({ timeout: 5000 });
      return v.trim();
    },
    async row(label) {
      return page.evaluate((l) => { const s = [...document.querySelectorAll('.kv > span')]; const i = s.findIndex((e) => e.textContent.trim() === l); return i >= 0 ? s[i + 1].textContent.trim() : null; }, label);
    },
    async rows() { return page.evaluate(() => { const s = [...document.querySelectorAll('.kv > span')].map((e) => e.textContent.trim()); const o = {}; for (let i = 0; i + 1 < s.length; i += 2) o[s[i]] = s[i + 1]; return o; }); },
    async warn() { const n = page.locator('.calc-result .note-warn'); return (await n.count()) ? (await n.first().textContent()).trim() : ''; },
  };
  return api;
}
/** "₹21,696.45" / "1,234.5 kg" / "−3" → number */
export const num = (s) => +String(s).replace(/−/g, '-').replace(/[^0-9.\-e]/g, '');
/** Indian grouping like the app (en-IN; whole rupees, or rupees with both digits of the paise: ₹12.10) */
export const inr = (n) => `${n < 0 ? '−' : ''}₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Math.abs(n)).replace(/\.\d$/, (m) => m + '0')}`;
/** the finance reference (scripts/make-finance-reference.py) */
export const financeRef = async () => JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../fixtures/finance/reference.json', import.meta.url), 'utf8'));
export const near = (a, b, tol) => Math.abs(a - b) <= tol;
