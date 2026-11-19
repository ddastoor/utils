"""Independent readers for the SQL Formatter's e2e suite (tests/e2e/sqlfmt.e2e.mjs).

stdin : {"setup": SQL, "cases": [{"d": dialect, "o": option name, "sql": one statement of the corpus (now and
         then a few), "f": the same as the tab formatted it}]}
stdout: {"have": {...versions...}, "ran": {...counts...}, "bad": ["...", ...]}

Three checks, none of which uses the formatter's own code:
  1. sqlite  — the NATIVE SQLite (Python's sqlite3) runs the original and the formatted text on a fresh copy of the
               same database: same rows, same column names, same errors, same database afterwards.
  2. sqlglot — both scripts parse to the same statements (the SQL sqlglot writes back for each, compared
               without white space and letter case outside quotes).
  3. sqlparse — both scripts hold the same tokens (white space aside; letter case aside outside quotes) and the
               same comments.
sqlglot and sqlparse are optional (pip install sqlglot sqlparse): without them their checks are reported as absent.

sqlparse has one lexer for every dialect: it reads a backslash in a string as an escape everywhere ('\' never ends
for it), and knows neither PostgreSQL's $$ … $$ nor Oracle's q'[ … ]' nor MySQL's "#" comments. A statement that
holds such text is not given to it (counted as "sqlparse skipped"); the other two readers still see it.
"""
import json
import re
import sqlite3
import sys

try:
    import sqlglot
except Exception:  # not installed
    sqlglot = None
try:
    import sqlparse
    from sqlparse import tokens as T
except Exception:
    sqlparse = None

job = json.load(sys.stdin)
bad = []
ran = {'sqlite statements': 0, 'sqlite with rows': 0, 'sqlglot statements': 0, 'sqlglot skipped': 0, 'sqlparse statements': 0, 'sqlparse skipped': 0}


def squeeze(s):
    """without comments and white space, in lower case"""
    return re.sub(r'\s+', '', re.sub(r'--[^\n]*|/\*.*?\*/', '', s, flags=re.S)).lower()


def run_sqlite(setup, script):
    con = sqlite3.connect(':memory:')
    con.executescript(setup)
    out, buf = [], ''
    for ch in script:
        buf += ch
        if ch == ';' and sqlite3.complete_statement(buf):
            out.append(one(con, buf))
            buf = ''
    if buf.strip():
        out.append(one(con, buf))
    out = [x for x in out if x is not None]
    tables = [n for (n,) in con.execute("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
    state = [(n, con.execute(f'SELECT * FROM "{n}" ORDER BY 1, 2, 3').fetchall()) for n in tables]
    schema = con.execute('SELECT type, name FROM sqlite_schema ORDER BY name').fetchall()
    return out, state, schema


def one(con, sql):
    if not squeeze(sql).strip(';'):
        return None  # a statement of comments only
    try:
        cur = con.execute(sql)
        return ('ok', [d[0] for d in cur.description or []], cur.fetchall())
    except (sqlite3.Error, sqlite3.Warning) as e:
        return ('error', str(e), [])


def same_names(a, b):
    """A column is named by its alias or its own name: exactly. An expression without an alias is named by its
    text, which a formatter changes (white space, keyword case)."""
    return len(a) == len(b) and all(x == y if re.fullmatch(r'[A-Za-z_][\w$]*', x) else squeeze(x) == squeeze(y) for x, y in zip(a, b))


def toks(sql):
    code, comments = [], []
    for st in sqlparse.parse(sql):
        for t in st.flatten():
            if t.ttype in (T.Whitespace, T.Newline) or t.is_whitespace:
                continue
            if t.ttype in T.Comment:
                comments.append(t.value.strip())
                continue
            v = t.value
            if not (t.ttype in T.Literal.String or (t.ttype in T.Name and v[:1] in '"`[')):
                v = v.lower()
            code.append(v)
    return ''.join(code), comments


GLOT = {'sqlite': 'sqlite', 'postgres': 'postgres', 'mysql': 'mysql', 'tsql': 'tsql', 'oracle': 'oracle'}
for c in job['cases']:
    d, o, sql, f = c['d'], c['o'], c['sql'], c['f']
    tag = f'{d} / {o}'
    if d == 'sqlite':
        (ra, sa, ca), (rb, sb, cb) = run_sqlite(job['setup'], sql), run_sqlite(job['setup'], f)
        ran['sqlite statements'] += len(ra)
        ran['sqlite with rows'] += sum(1 for x in ra if x[0] == 'ok' and x[2])
        if len(ra) != len(rb):
            bad.append(f'{tag}: SQLite ran {len(ra)} statements of the original and {len(rb)} of the formatted script')
        for i, (x, y) in enumerate(zip(ra, rb)):
            if x[0] != y[0] or x[2] != y[2] or (x[0] == 'error' and x[1] != y[1]) or (x[0] == 'ok' and not same_names(x[1], y[1])):
                bad.append(f'{tag}: SQLite statement {i + 1}: {str(x)[:160]} became {str(y)[:160]}')
        if sa != sb or ca != cb:
            bad.append(f'{tag}: the database differs after the script')
    if sqlglot is not None:
        try:
            ea = [squeeze(e.sql(GLOT[d])) for e in sqlglot.parse(sql, read=GLOT[d]) if e is not None]
        except Exception:
            ea = None
            ran['sqlglot skipped'] += 1
        if ea is not None:
            ran['sqlglot statements'] += len(ea)
            try:
                eb = [squeeze(e.sql(GLOT[d])) for e in sqlglot.parse(f, read=GLOT[d]) if e is not None]
            except Exception as e:
                eb = ['does not parse: ' + str(e)[:120]]
            if ea != eb:
                i = next((i for i, (x, y) in enumerate(zip(ea, eb)) if x != y), min(len(ea), len(eb)))
                bad.append(f'{tag}: sqlglot statement {i + 1} of {len(ea)} / {len(eb)}: {(ea[i] if i < len(ea) else "")[:160]} became {(eb[i] if i < len(eb) else "")[:160]}')
    if sqlparse is not None and re.search(r"""\\['"]|\$\w*\$|\bn?q'|#|--\S""", sql, flags=re.I):
        ran['sqlparse skipped'] += 1
    elif sqlparse is not None:
        (ta, ka), (tb, kb) = toks(sql), toks(f)
        ran['sqlparse statements'] += 1
        if ta != tb:
            i = next((i for i, (x, y) in enumerate(zip(ta, tb)) if x != y), min(len(ta), len(tb)))
            bad.append(f'{tag}: sqlparse: …{ta[max(0, i - 40):i + 40]}… became …{tb[max(0, i - 40):i + 40]}…')
        if ka != kb:
            bad.append(f'{tag}: sqlparse: the comments differ: {str(ka)[:200]} / {str(kb)[:200]}')

print(json.dumps({
    'have': {'sqlite': sqlite3.sqlite_version, 'sqlglot': getattr(sqlglot, '__version__', None), 'sqlparse': getattr(sqlparse, '__version__', None)},
    'ran': ran, 'bad': bad,
}))
