// The bc console's $ names (to-do #10, owner, 21 Nov 2026): every number bc prints gets the next free name — A … Z,
// AA … ZZ, AAA …, as Excel names its columns — and a later line uses it as $A ($a is the same name). `$name = expression`
// names a result yourself (a letter first, then letters, digits, _). A $ name is set once: no line may change it. The
// names are our glue, put into the line before bc sees it (bc's own capital letters are hex digits and its variables
// are lower case, so a $ name never becomes a bc variable); bc's own variables, loops and functions work as in bc.
// No DOM: the console (src/tools/bc-console.ts) and the unit suite share it.

/** Excel's column name of n = 1, 2, … (1 → A, 26 → Z, 27 → AA, 702 → ZZ, 703 → AAA). */
export function columnName(n: number): string {
  let s = '';
  for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s;
  return s;
}

/** A number as bc prints it (any obase up to 16: digits and capital letters; a sign, a point) — what gets a name. */
export const isBcNumber = (row: string) => /^-?(?:[0-9A-F]+(?:\.[0-9A-F]*)?|\.[0-9A-F]+)$/.test(row);

const NAME = /[A-Za-z][A-Za-z0-9_]*/y;

interface Var { name: string; value: string }

export class BcVars {
  /** by the name in capitals (names are case-insensitive) */
  private vars = new Map<string, Var>();
  private next = 1;

  get(name: string): Var | undefined { return this.vars.get(name.toUpperCase()); }
  get size() { return this.vars.size; }
  clear() { this.vars.clear(); this.next = 1; }

  /** Gives `value` the next free automatic name, or `own` (the user's), and returns the name as shown. */
  assign(value: string, own?: string): string {
    let name = own;
    if (!name) { do name = columnName(this.next++); while (this.vars.has(name)); }
    this.vars.set(name.toUpperCase(), { name, value });
    return name;
  }

  /**
   * A line as the user typed it → what bc is given: every $name outside strings and comments replaced by its value in
   * brackets. `own`: the name of `$name = expression` (the expression is then given in brackets, so that bc prints it).
   * `error`: why the line cannot be run — a $ name that is not set, or a change of one.
   */
  prepare(src: string): { line: string; own?: string; error?: string } {
    const m = /^\s*\$([A-Za-z][A-Za-z0-9_]*)\s*=(?!=)([\s\S]*)$/.exec(src);
    let own: string | undefined, body = src;
    if (m) {
      const was = this.get(m[1]);
      if (was) return { line: '', error: `$${was.name} is set already (${was.value}): a $ name keeps its value — choose another name` };
      if (!m[2].trim()) return { line: '', error: `$${m[1]} = … needs an expression on the right` };
      own = m[1];
      body = m[2];
    }
    let out = '', i = 0;
    while (i < body.length) {
      const c = body[i];
      if (c === '"') { const e = body.indexOf('"', i + 1); const j = e < 0 ? body.length : e + 1; out += body.slice(i, j); i = j; continue; }
      if (c === '/' && body[i + 1] === '*') { const e = body.indexOf('*/', i + 2); const j = e < 0 ? body.length : e + 2; out += body.slice(i, j); i = j; continue; }
      if (c === '#') { const e = body.indexOf('\n', i); const j = e < 0 ? body.length : e; out += body.slice(i, j); i = j; continue; }
      if (c !== '$') { out += c; i++; continue; }
      NAME.lastIndex = i + 1;
      const n = NAME.exec(body);
      if (!n) { out += c; i++; continue; } // not a name: bc says what it thinks of a lone $
      const v = this.get(n[0]), after = body.slice(i + 1 + n[0].length), before = out;
      if (/^\s*(?:[-+*/%^]?=(?!=)|\+\+|--)/.test(after) || /(?:\+\+|--)\s*$/.test(before)) {
        return { line: '', error: v ? `$${v.name} cannot be changed: it holds ${v.value} (a $ name is set once)` : `$${n[0]} is not set — set it once with $${n[0]} = …` };
      }
      if (!v) return { line: '', error: `$${n[0]} is not set${this.vars.size ? ` (the names so far: ${[...this.vars.values()].slice(-8).map((x) => '$' + x.name).join(' ')})` : ''}` };
      out += `(${v.value})`;
      i += 1 + n[0].length;
    }
    return { line: own ? `(${out.trim()})` : out, own };
  }
}
