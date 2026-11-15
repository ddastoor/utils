import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true }, logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
const { evaluate, fmtNum } = await server.ssrLoadModule('/src/lib/expr.ts');
await server.close();
const cases = [
  ['1+2*3', '7'], ['(1+2)*3', '9'], ['2^3^2', '512'], ['-2^2', '-4'], ['0.1+0.2', '0.3'], ['2pi', fmtNum(2 * Math.PI)],
  ['3(4+1)', '15'], ['5!', '120'], ['50%', '0.5'], ['200*15%', '30'], ['sqrt(16)', '4'], ['√16', '4'], ['sin(30)', '0.5', true],
  ['cos(pi)', '-1'], ['tan(45)', '1', true], ['log(1000)', '3'], ['ln(e)', '1'], ['log(8,2)', '3'], ['nCr(5,2)', '10'], ['nPr(5,2)', '20'],
  ['2x+1', '7', false, { x: 3 }], ['x^2', '9', false, { x: 3 }], ['sin x', fmtNum(Math.sin(2)), false, { x: 2 }], ['10÷4', '2.5'], ['6×7', '42'],
  ['1e3+1', '1001'], ['abs(-3)', '3'], ['(2)(3)', '6'], ['2 sqrt 9', '6'], ['gcd(12,18)', '6'], ['lcm(4,6)', '12'], ['asin(1)', '90', true], ['0.5!', fmtNum(Math.sqrt(Math.PI) / 2)],
];
let fail = 0;
for (const [src, want, deg, env] of cases) {
  let got; try { got = fmtNum(evaluate(src, env || {}, { deg: !!deg })); } catch (e) { got = 'ERR ' + e.message; }
  if (got !== want) { fail++; console.log(`✗ ${src} = ${got}, want ${want}`); }
}
for (const bad of ['1+', '(2', 'foo(2)', '2**']) { try { evaluate(bad); console.log('✗ no error for', bad); fail++; } catch {} }
console.log(fail ? `${fail} failures` : `all ${cases.length} expression tests passed`);
process.exit(fail ? 1 : 0);
