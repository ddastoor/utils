// χ² goodness-of-fit against a uniform distribution. Critical value at p = 1e-4 (Wilson–Hilferty), so a fair
// generator fails about once in 10,000 runs.
export function chiUniform(counts) {
  const n = counts.reduce((a, b) => a + b, 0), k = counts.length, E = n / k, df = k - 1;
  const chi = counts.reduce((s, o) => s + (o - E) ** 2 / E, 0);
  const z = 3.719, crit = df * (1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df))) ** 3;
  return { chi, crit, df, pass: chi < crit, text: `χ² = ${chi.toFixed(1)} (df ${df}, limit ${crit.toFixed(1)}, n ${n})` };
}
