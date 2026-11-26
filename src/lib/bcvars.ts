// The bc console's $ names (to-do #10, owner, 21 Nov 2026): every number bc prints gets the next free name — A … Z,
// AA … ZZ, AAA …, as Excel names its columns — and a later line uses it as $A ($a is the same name). `$name = expression`
// names a result yourself (a letter first, then letters, digits, _). A $ name is set once: no line may change it. The
// names are our glue, put into the line before bc sees it (bc's own capital letters are hex digits and its variables
// are lower case, so a $ name never becomes a bc variable); bc's own variables, loops and functions work as in bc.
// **bc's own variables are $ names too** (to-do #25, owner, 26 Nov 2026: "> interest=20.78 / > $interest … The interest
// variable should also be set, and the user should be able to use this interest variable as $interest subsequently"):
// a variable the session has set (interest = 20.78, rate += 1, i++ in a loop, a global set inside define) — and scale,
// ibase, obase — is reached as $interest ($Interest too: bc's names are lower case). It stands for the variable itself,
// so it is the value bc holds at that point (a later interest = 21 is seen). A result's name comes first where both
// exist ($a is the result A; bc's a is written a) — said once. Parameters and auto variables of a function are not
// variables of the session. A $ name of a bc variable is for reading: the variable is changed without the $.
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
const WORD = /[A-Za-z_][A-Za-z0-9_]*/y;
/** what follows a name that sets it: = (not ==), += -= *= /= %= ^=, ++, -- */
const SETS = /^[ \t]*(?:[-+*/%^]?=(?!=)|\+\+|--)/;
/** a name bc can hold a variable under: lower-case letters, digits, _ (bc's capital letters are digits) */
const BC_NAME = /^[a-z][a-z0-9_]*$/;
/** bc's variables that hold a value before the first line */
export const BC_BUILTIN = ['scale', 'ibase', 'obase'];

interface Var { name: string; value: string }

export interface Prepared {
  /** what bc is given */
  line: string;
  /** the user's name of `$name = expression` */
  own?: string;
  /** why the line cannot be run */
  error?: string;
  /** a word on how a $ name was read (a result and a bc variable of the same name) */
  note?: string;
  /** bc's variables this line sets (not a function's parameters and auto variables) — learned once bc has run it */
  sets: string[];
}

export class BcVars {
  /** by the name in capitals (names are case-insensitive) */
  private vars = new Map<string, Var>();
  private next = 1;
  /** bc's own variables the session has set, in the order they were first set */
  private bc: string[] = [];
  private noted = new Set<string>();

  get(name: string): Var | undefined { return this.vars.get(name.toUpperCase()); }
  get size() { return this.vars.size; }
  /** bc's variables the session has set (scale, ibase and obase are reachable too, and not listed) */
  get bcVariables(): readonly string[] { return this.bc; }
  clear() { this.vars.clear(); this.next = 1; this.bc = []; this.noted.clear(); }

  /** Gives `value` the next free automatic name, or `own` (the user's), and returns the name as shown. */
  assign(value: string, own?: string): string {
    let name = own;
    if (!name) { do name = columnName(this.next++); while (this.vars.has(name)); }
    this.vars.set(name.toUpperCase(), { name, value });
    return name;
  }

  /** bc ran the line: the variables it set are reached as $ names from now on. */
  learn(names: readonly string[]) { for (const n of names) if (!this.bc.includes(n)) this.bc.push(n); }

  private namesSoFar() {
    const all = [...[...this.vars.values()].slice(-8).map((x) => '$' + x.name), ...this.bc.slice(-8).map((n) => '$' + n)];
    return all.length ? ` (the names so far: ${all.join(' ')})` : '';
  }

  /**
   * A line as the user typed it → what bc is given: every $name outside strings and comments replaced — a result's
   * name by its value in brackets, a bc variable's by the variable in brackets. `own`: the name of `$name = expression`
   * (the expression is then given in brackets, so that bc prints it). `error`: why the line cannot be run — a $ name
   * that is not set, or a change of one. `sets`: the bc variables the line sets, for `learn` once bc has run it.
   */
  prepare(src: string): Prepared {
    const sets: string[] = [];
    const isBc = (lower: string) => BC_NAME.test(lower) && (this.bc.includes(lower) || sets.includes(lower) || BC_BUILTIN.includes(lower));
    const m = /^\s*\$([A-Za-z][A-Za-z0-9_]*)\s*=(?!=)([\s\S]*)$/.exec(src);
    let own: string | undefined, body = src, note: string | undefined;
    if (m) {
      const was = this.get(m[1]), lower = m[1].toLowerCase();
      if (was) return { line: '', error: `$${was.name} is set already (${was.value}): a $ name keeps its value — choose another name`, sets };
      if (isBc(lower)) return { line: '', error: `$${m[1]} is bc's own variable ${lower}: set it without the $ (${lower} = …), or choose another $ name`, sets };
      if (!m[2].trim()) return { line: '', error: `$${m[1]} = … needs an expression on the right`, sets };
      own = m[1];
      body = m[2];
    }
    let out = '', i = 0, prev = '', depth = 0;
    // define f(a, b[]) { auto c; … }: the parameters and the auto variables are the function's own
    let header: '' | 'name' | 'params' | 'brace' = '', params = new Set<string>(), auto = false;
    let fn: { depth: number; locals: Set<string> } | null = null;
    while (i < body.length) {
      const c = body[i];
      if (c === '"') { const e = body.indexOf('"', i + 1); const j = e < 0 ? body.length : e + 1; out += body.slice(i, j); i = j; prev = '"'; continue; }
      if (c === '/' && body[i + 1] === '*') { const e = body.indexOf('*/', i + 2); const j = e < 0 ? body.length : e + 2; out += body.slice(i, j); i = j; continue; }
      if (c === '#') { const e = body.indexOf('\n', i); const j = e < 0 ? body.length : e; out += body.slice(i, j); i = j; continue; }
      if (c === '$') {
        NAME.lastIndex = i + 1;
        const n = NAME.exec(body);
        if (!n) { out += c; i++; prev = c; continue; } // not a name: bc says what it thinks of a lone $
        const v = this.get(n[0]), lower = n[0].toLowerCase(), bcVar = isBc(lower), after = body.slice(i + 1 + n[0].length);
        if (SETS.test(after) || /(?:\+\+|--)\s*$/.test(out)) {
          if (v) return { line: '', error: `$${v.name} cannot be changed: it holds ${v.value} (a $ name is set once)`, sets };
          if (bcVar) return { line: '', error: `$${n[0]} is bc's own variable ${lower}: change it without the $ (${lower} = …, ${lower} += …)`, sets };
          return { line: '', error: `$${n[0]} is not set — set it once with $${n[0]} = …`, sets };
        }
        if (v) {
          if (bcVar && !this.noted.has(lower)) { this.noted.add(lower); note = `$${n[0]} is the result named ${v.name} (${v.value}): a result's name comes first — bc's own variable ${lower} is written ${lower}, without the $`; }
          out += `(${v.value})`;
        } else if (bcVar) out += `(${lower})`;
        else return { line: '', error: `$${n[0]} is not set — set it with ${BC_NAME.test(lower) ? `${lower} = … (a bc variable) or ` : ''}$${n[0]} = … (a $ name, set once)${this.namesSoFar()}`, sets };
        i += 1 + n[0].length; prev = ')';
        continue;
      }
      WORD.lastIndex = i;
      const w = /[A-Za-z_]/.test(c) ? WORD.exec(body) : null;
      if (w) {
        const word = w[0], j = i + word.length;
        if (header === 'name') header = word === 'void' ? 'name' : 'params';
        else if (word === 'define') { header = 'name'; params = new Set(); }
        else if (header === 'params') params.add(word);
        else if (word === 'auto' && fn) auto = true;
        else if (auto && fn) fn.locals.add(word);
        else if (BC_NAME.test(word) && body[j] !== '[' && (SETS.test(body.slice(j)) || prev === '++' || prev === '--') && !fn?.locals.has(word) && !sets.includes(word)) sets.push(word);
        out += word; i = j; prev = 'w';
        continue;
      }
      if ((c === '+' || c === '-') && body[i + 1] === c) { out += c + c; i += 2; prev = c + c; continue; }
      if (c === ')' && header === 'params') header = 'brace';
      else if (c === '{') { depth++; if (header === 'brace') { fn = { depth, locals: params }; header = ''; } }
      else if (c === '}') { if (fn && fn.depth === depth) fn = null; depth = Math.max(0, depth - 1); }
      else if (c === ';' || c === '\n') auto = false;
      out += c; i++;
      if (!/\s/.test(c)) prev = c;
    }
    return { line: own ? `(${out.trim()})` : out, own, note, sets };
  }
}
