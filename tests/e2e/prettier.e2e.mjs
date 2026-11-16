// Code Formatter (#/prettier, PC only): for every language the tab's output equals Prettier run here in Node (same
// version, same options) — JS, TS, CSS, SCSS, HTML, JSON, YAML, Markdown, GraphQL, Vue — options (width, tabs, no
// semicolons, single quotes, trailing commas), files by extension, syntax errors shown, nothing loaded before Format,
// phone note.
import { pcOnlyOnPhone } from './_pconly.mjs';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const pr = createRequire(import.meta.url)('../../node_modules/prettier');
export default async (ctx) => {
  const { base, page: newPage, ok, tmp } = ctx;
  const page = await newPage(); const reqs = []; page.on('request', (r) => reqs.push(r.url())); await page.goto(`${base}#/prettier`);
  const src = page.locator('textarea').nth(0), out = page.locator('textarea').nth(1); await src.waitFor(); await page.waitForTimeout(300);
  ok(!reqs.some((u) => /standalone|plugins|babel-/.test(u)), 'Prettier not downloaded before Format');
  const fmt = async () => { await page.getByRole('button', { name: 'Format', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.note-ok, .note-warn')); await page.waitForTimeout(100); return out.inputValue(); };
  const PARSER = { js: 'babel', ts: 'typescript', css: 'css', scss: 'scss', html: 'html', json: 'json', yaml: 'yaml', markdown: 'markdown', graphql: 'graphql', vue: 'vue' };
  const bad = [];
  for (const [k, parser] of Object.entries(PARSER)) {
    await page.locator('select').first().selectOption(k); const code = await src.inputValue(); const got = await fmt();
    const want = await pr.format(code, { parser, printWidth: 80, tabWidth: 2, semi: true, singleQuote: false, trailingComma: 'all' });
    if (got !== want) bad.push(k);
  }
  ok(!bad.length, `10 languages: output = Prettier in Node (${bad.join(', ') || 'all equal'})`);
  await page.locator('select').first().selectOption('js'); const code = await src.inputValue();
  await page.locator('input[type=range]').fill('40'); await page.locator('input[type=range]').dispatchEvent('input');
  await page.getByRole('radio', { name: 'Tabs' }).click(); await page.locator('label.switch', { hasText: 'Semicolons' }).click(); await page.locator('label.switch', { hasText: 'Single quotes' }).click(); await page.getByRole('radio', { name: 'None' }).click();
  ok(await fmt() === await pr.format(code, { parser: 'babel', printWidth: 40, useTabs: true, semi: false, singleQuote: true, trailingComma: 'none' }), 'options: width 40, tabs, no semicolons, single quotes, no trailing commas');
  await page.locator('label.switch', { hasText: 'Format as you type' }).click(); await src.fill('let  a=1;let b  =  2'); await page.waitForTimeout(800);
  ok(await out.inputValue() === 'let a = 1\nlet b = 2\n', 'format as you type');
  await src.fill('function ( {'); await page.waitForTimeout(800); ok(/Unexpected token|SyntaxError/.test(await page.locator('.note-warn').textContent()), 'syntax error shown');
  const f = join(tmp, 'style.css'); writeFileSync(f, 'a{color:red}'); await page.locator('.drop input[type=file]').setInputFiles(f); await page.waitForTimeout(800);
  ok(await page.locator('select').first().inputValue() === 'css' && await out.inputValue() === 'a {\n\tcolor: red;\n}\n', '.css file → CSS selected and formatted');
  ok(!page.errors.length, `no page errors ${page.errors.join(' | ')}`);
  await pcOnlyOnPhone(ctx, 'prettier');
};
