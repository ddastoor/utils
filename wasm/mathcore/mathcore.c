/*
 * mathcore.wasm — numeric engine for SuperTools calculators and Math & Science tools.
 * Own code (MIT-style, part of this repo). Built as a WASI reactor with zig cc; see build.sh.
 *
 * Sections: expression compiler/evaluator · root finding · polynomials · linear algebra · statistics ·
 *           integers (Miller–Rabin, Pollard rho) · exact fractions · bases & Roman numerals & words ·
 *           finance (EMI, SIP, FD/RD, PPF, EPF, NPS, prepayment, inflation) · health · geodesy.
 * All doubles/ints cross the boundary directly; strings are (ptr, len) UTF-8; results go to caller buffers.
 */
#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#define API __attribute__((visibility("default")))

static char g_err[160];
static void set_err(const char *m) { strncpy(g_err, m, sizeof g_err - 1); g_err[sizeof g_err - 1] = 0; }
API const char *m_error(void) { return g_err; }
API void *m_malloc(uint32_t n) { return malloc(n ? n : 1); }
API void m_free(void *p) { free(p); }

/* ======================================================================== expressions */

enum { OP_NUM, OP_VAR, OP_ADD, OP_SUB, OP_MUL, OP_DIV, OP_POW, OP_NEG, OP_FACT, OP_PCT, OP_CALL, OP_ADDP, OP_SUBP };
typedef struct { uint8_t op, arg, nargs; double v; } Ins;
typedef struct { Ins *code; int n, cap; int deg; } Prog;

#define MAXPROG 64
static Prog *progs[MAXPROG];

/* variables: x y z t ans (index 0..4) */
static const char *VARS[] = {"x", "y", "z", "t", "ans"};
#define NVARS 5

static double factorial(double n);
static double gamma_fn(double z);
static double gcd_d(double a, double b) { a = fabs(round(a)); b = fabs(round(b)); while (b > 0.5) { double t = fmod(a, b); a = b; b = t; } return a; }

typedef struct { const char *name; int nargs; } FnDef; /* nargs -1 = variadic (1..2) */
static const FnDef FNS[] = {
    {"sin", 1}, {"cos", 1}, {"tan", 1}, {"asin", 1}, {"acos", 1}, {"atan", 1}, {"atan2", 2},
    {"sinh", 1}, {"cosh", 1}, {"tanh", 1}, {"asinh", 1}, {"acosh", 1}, {"atanh", 1},
    {"sec", 1}, {"csc", 1}, {"cot", 1}, {"ln", 1}, {"log", -1}, {"log10", 1}, {"log2", 1}, {"exp", 1},
    {"sqrt", 1}, {"cbrt", 1}, {"root", 2}, {"abs", 1}, {"floor", 1}, {"ceil", 1}, {"round", -1}, {"trunc", 1},
    {"sign", 1}, {"min", 2}, {"max", 2}, {"hypot", 2}, {"mod", 2}, {"fact", 1}, {"gamma", 1},
    {"nPr", 2}, {"nCr", 2}, {"gcd", 2}, {"lcm", 2},
};
#define NFNS (int)(sizeof FNS / sizeof FNS[0])
typedef struct { const char *name; double v; } ConstDef;
static const ConstDef CONSTS[] = {{"pi", M_PI}, {"e", M_E}, {"tau", 2 * M_PI}, {"phi", 1.6180339887498948}, {"inf", INFINITY}};
#define NCONSTS (int)(sizeof CONSTS / sizeof CONSTS[0])

static int find_fn(const char *s, int n) { for (int i = 0; i < NFNS; i++) if ((int)strlen(FNS[i].name) == n && !strncmp(FNS[i].name, s, n)) return i; return -1; }
static int find_const(const char *s, int n) { for (int i = 0; i < NCONSTS; i++) if ((int)strlen(CONSTS[i].name) == n && !strncmp(CONSTS[i].name, s, n)) return i; return -1; }
static int find_var(const char *s, int n) { for (int i = 0; i < NVARS; i++) if ((int)strlen(VARS[i]) == n && !strncmp(VARS[i], s, n)) return i; return -1; }

/* ---- tokens */
enum { T_END, T_NUM, T_FN, T_CONST, T_VAR, T_OP };
typedef struct { int t; double v; int idx; char op; } Tok;
typedef struct { Tok *t; int n, cap; } Toks;
static void push_tok(Toks *ts, Tok k) { if (ts->n == ts->cap) { ts->cap = ts->cap ? ts->cap * 2 : 32; ts->t = realloc(ts->t, ts->cap * sizeof(Tok)); } ts->t[ts->n++] = k; }

/* Normalise UTF-8 symbols (× ÷ − √ π ² ³) into ASCII. Returns malloc'd string. */
static char *normalise(const char *s, int len) {
    char *o = malloc((size_t)len * 6 + 8);
    int j = 0;
    for (int i = 0; i < len;) {
        const unsigned char *u = (const unsigned char *)s + i;
        if (u[0] == 0xC3 && i + 1 < len && u[1] == 0x97) { o[j++] = '*'; i += 2; }
        else if (u[0] == 0xC3 && i + 1 < len && u[1] == 0xB7) { o[j++] = '/'; i += 2; }
        else if (u[0] == 0xE2 && i + 2 < len && u[1] == 0x88 && u[2] == 0x92) { o[j++] = '-'; i += 3; }
        else if (u[0] == 0xE2 && i + 2 < len && u[1] == 0x88 && u[2] == 0x9A) { memcpy(o + j, " sqrt ", 6); j += 6; i += 3; }
        else if (u[0] == 0xCF && i + 1 < len && u[1] == 0x80) { memcpy(o + j, " pi ", 4); j += 4; i += 2; }
        else if (u[0] == 0xC2 && i + 1 < len && u[1] == 0xB2) { memcpy(o + j, "^2", 2); j += 2; i += 2; }
        else if (u[0] == 0xC2 && i + 1 < len && u[1] == 0xB3) { memcpy(o + j, "^3", 2); j += 2; i += 2; }
        else if (u[0] == '*' && i + 1 < len && u[1] == '*') { o[j++] = '^'; i += 2; }
        else o[j++] = s[i++];
    }
    o[j] = 0;
    return o;
}

/* Split an identifier into known names (implicit multiplication: "pix" → pi·x, "sinx" → sin x). */
static int lex_ident(Toks *ts, const char *s, int n) {
    int i = 0;
    while (i < n) {
        int best = 0, kind = 0, idx = -1;
        for (int l = n - i; l > 0; l--) {
            int f = find_fn(s + i, l), c = find_const(s + i, l), v = find_var(s + i, l);
            if (f >= 0) { best = l; kind = T_FN; idx = f; break; }
            if (c >= 0) { best = l; kind = T_CONST; idx = c; break; }
            if (v >= 0) { best = l; kind = T_VAR; idx = v; break; }
        }
        if (!best) { set_err("Unknown name in expression"); return 0; }
        Tok k = {kind, 0, idx, 0};
        push_tok(ts, k);
        i += best;
    }
    return 1;
}

static int lex(Toks *ts, const char *s) {
    for (int i = 0; s[i];) {
        char c = s[i];
        if (c == ' ' || c == '\t' || c == '\n' || c == '\r') { i++; continue; }
        if ((c >= '0' && c <= '9') || (c == '.' && s[i + 1] >= '0' && s[i + 1] <= '9')) {
            char *end;
            double v = strtod(s + i, &end);
            /* strtod accepts hex/inf; we only allow decimal forms */
            int j = i; while ((s[j] >= '0' && s[j] <= '9') || s[j] == '.') j++;
            if (s[j] == 'e' || s[j] == 'E') { int k = j + 1; if (s[k] == '+' || s[k] == '-') k++; if (s[k] >= '0' && s[k] <= '9') { while (s[k] >= '0' && s[k] <= '9') k++; j = k; } }
            if (end > s + j) end = (char *)s + j;
            v = strtod(s + i, NULL);
            { char buf[64]; int L = j - i < 63 ? j - i : 63; memcpy(buf, s + i, L); buf[L] = 0; v = strtod(buf, NULL); }
            Tok k = {T_NUM, v, 0, 0};
            push_tok(ts, k);
            i = j;
            continue;
        }
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_') {
            int j = i; while ((s[j] >= 'a' && s[j] <= 'z') || (s[j] >= 'A' && s[j] <= 'Z') || (s[j] >= '0' && s[j] <= '9') || s[j] == '_') j++;
            /* whole identifier is a known name (atan2, log10, log2)? otherwise split letters from glued digits (x2) */
            if (find_fn(s + i, j - i) >= 0 || find_const(s + i, j - i) >= 0 || find_var(s + i, j - i) >= 0) {
                if (!lex_ident(ts, s + i, j - i)) return 0;
                i = j;
                continue;
            }
            int k = i; while (k < j && !((s[k] >= '0' && s[k] <= '9'))) k++;
            if (!lex_ident(ts, s + i, k - i)) return 0;
            i = k;
            continue;
        }
        if (strchr("+-*/^%!(),=", c)) { Tok k = {T_OP, 0, 0, c}; push_tok(ts, k); i++; continue; }
        set_err("Unexpected character in expression");
        return 0;
    }
    Tok e = {T_END, 0, 0, 0};
    push_tok(ts, e);
    return 1;
}

/* ---- parser → bytecode */
typedef struct { Toks *ts; int p; Prog *pr; int err; } P;
static void emit(P *ps, Ins in) { Prog *pr = ps->pr; if (pr->n == pr->cap) { pr->cap = pr->cap ? pr->cap * 2 : 64; pr->code = realloc(pr->code, pr->cap * sizeof(Ins)); } pr->code[pr->n++] = in; }
static Tok *pk(P *ps) { return &ps->ts->t[ps->p]; }
static int is_op(P *ps, char c) { Tok *t = pk(ps); return t->t == T_OP && t->op == c; }
static int starts_factor(P *ps) { Tok *t = pk(ps); return t->t == T_NUM || t->t == T_FN || t->t == T_CONST || t->t == T_VAR || (t->t == T_OP && t->op == '('); }
static void expr(P *ps);
static void unary(P *ps);
static void power(P *ps);

static void primary(P *ps) {
    if (ps->err) return;
    Tok *t = pk(ps);
    if (t->t == T_NUM) { ps->p++; Ins in = {OP_NUM, 0, 0, t->v}; emit(ps, in); return; }
    if (t->t == T_CONST) { ps->p++; Ins in = {OP_NUM, 0, 0, CONSTS[t->idx].v}; emit(ps, in); return; }
    if (t->t == T_VAR) { ps->p++; Ins in = {OP_VAR, (uint8_t)t->idx, 0, 0}; emit(ps, in); return; }
    if (t->t == T_OP && t->op == '(') { ps->p++; expr(ps); if (!is_op(ps, ')')) { set_err("Missing )"); ps->err = 1; return; } ps->p++; return; }
    if (t->t == T_FN) {
        int f = t->idx; ps->p++;
        int nargs = 0;
        if (is_op(ps, '(')) {
            ps->p++;
            if (!is_op(ps, ')')) { expr(ps); nargs++; while (is_op(ps, ',')) { ps->p++; expr(ps); nargs++; } }
            if (!is_op(ps, ')')) { set_err("Missing )"); ps->err = 1; return; }
            ps->p++;
        } else { unary(ps); nargs = 1; }
        int want = FNS[f].nargs;
        if ((want > 0 && nargs != want) || (want < 0 && (nargs < 1 || nargs > 2))) { set_err("Wrong number of function arguments"); ps->err = 1; return; }
        Ins in = {OP_CALL, (uint8_t)f, (uint8_t)nargs, 0};
        emit(ps, in);
        return;
    }
    set_err(t->t == T_END ? "Incomplete expression" : "Unexpected symbol");
    ps->err = 1;
}
static void postfix(P *ps) {
    primary(ps);
    while (!ps->err) {
        if (is_op(ps, '!')) { ps->p++; Ins in = {OP_FACT, 0, 0, 0}; emit(ps, in); }
        else if (is_op(ps, '%')) { ps->p++; Ins in = {OP_PCT, 0, 0, 0}; emit(ps, in); }
        else break;
    }
}
static void power(P *ps) {
    postfix(ps);
    if (!ps->err && is_op(ps, '^')) { ps->p++; unary(ps); Ins in = {OP_POW, 0, 0, 0}; emit(ps, in); }
}
static void unary(P *ps) {
    if (is_op(ps, '-')) { ps->p++; unary(ps); Ins in = {OP_NEG, 0, 0, 0}; emit(ps, in); return; }
    if (is_op(ps, '+')) { ps->p++; unary(ps); return; }
    power(ps);
}
static void term(P *ps) {
    unary(ps);
    while (!ps->err) {
        if (is_op(ps, '*') || is_op(ps, '/')) { char op = pk(ps)->op; ps->p++; unary(ps); Ins in = {op == '*' ? OP_MUL : OP_DIV, 0, 0, 0}; emit(ps, in); }
        else if (starts_factor(ps)) { power(ps); Ins in = {OP_MUL, 0, 0, 0}; emit(ps, in); }
        else break;
    }
}
static void expr(P *ps) {
    term(ps);
    /* "a + b%" / "a − b%" add or take off b percent of a (as phone, Google and Windows calculators: 200 + 10% = 220);
       b% anywhere else is b/100 (50% × 30 = 15). Only a term that ends in a bare % counts. */
    while (!ps->err && (is_op(ps, '+') || is_op(ps, '-'))) {
        char op = pk(ps)->op; ps->p++; term(ps);
        int pct = !ps->err && ps->pr->n && ps->pr->code[ps->pr->n - 1].op == OP_PCT;
        Ins in = {pct ? (op == '+' ? OP_ADDP : OP_SUBP) : (op == '+' ? OP_ADD : OP_SUB), 0, 0, 0}; emit(ps, in);
    }
}

/* Compile; returns handle 1..MAXPROG or 0 (see m_error). An "a = b" equation compiles to a - b. */
API int m_expr_compile(const char *src, int len, int deg) {
    char *s = normalise(src, len);
    Toks ts = {0};
    int h = 0;
    for (int i = 0; i < MAXPROG; i++) if (!progs[i]) { h = i + 1; break; }
    if (!h) { set_err("Too many expressions"); free(s); return 0; }
    if (!lex(&ts, s)) { free(ts.t); free(s); return 0; }
    Prog *pr = calloc(1, sizeof(Prog));
    pr->deg = deg;
    P ps = {&ts, 0, pr, 0};
    expr(&ps);
    if (!ps.err && is_op(&ps, '=')) { ps.p++; expr(&ps); Ins in = {OP_SUB, 0, 0, 0}; emit(&ps, in); }
    if (!ps.err && pk(&ps)->t != T_END) { set_err("Unexpected symbol after expression"); ps.err = 1; }
    free(ts.t); free(s);
    if (ps.err) { free(pr->code); free(pr); return 0; }
    progs[h - 1] = pr;
    return h;
}
API void m_expr_free(int h) { if (h >= 1 && h <= MAXPROG && progs[h - 1]) { free(progs[h - 1]->code); free(progs[h - 1]); progs[h - 1] = NULL; } }

static double call_fn(int f, int n, double a, double b, int deg) {
    double k = deg ? M_PI / 180.0 : 1.0, ik = deg ? 180.0 / M_PI : 1.0;
    switch (f) {
    case 0: return sin(a * k);
    case 1: return cos(a * k);
    case 2: if (deg && fabs(fmod(fmod(a, 180) + 180, 180) - 90) < 1e-12) return NAN; return tan(a * k);
    case 3: return asin(a) * ik;
    case 4: return acos(a) * ik;
    case 5: return atan(a) * ik;
    case 6: return atan2(a, b) * ik;
    case 7: return sinh(a); case 8: return cosh(a); case 9: return tanh(a);
    case 10: return asinh(a); case 11: return acosh(a); case 12: return atanh(a);
    case 13: return 1 / cos(a * k); case 14: return 1 / sin(a * k); case 15: return 1 / tan(a * k);
    case 16: return log(a);
    case 17: return n == 2 ? log(a) / log(b) : log10(a);
    case 18: return log10(a); case 19: return log2(a); case 20: return exp(a);
    case 21: return sqrt(a); case 22: return cbrt(a);
    case 23: return (a < 0 && fmod(b, 2) == 1) ? -pow(-a, 1 / b) : pow(a, 1 / b);
    case 24: return fabs(a); case 25: return floor(a); case 26: return ceil(a);
    case 27: { double f10 = n == 2 ? pow(10, b) : 1; return round(a * f10) / f10; }
    case 28: return trunc(a); case 29: return (a > 0) - (a < 0);
    case 30: return a < b ? a : b; case 31: return a > b ? a : b; case 32: return hypot(a, b);
    case 33: return fmod(fmod(a, b) + b, b);
    case 34: return factorial(a); case 35: return gamma_fn(a);
    case 36: return factorial(a) / factorial(a - b);
    case 37: return round(factorial(a) / (factorial(b) * factorial(a - b)));
    case 38: return gcd_d(a, b);
    case 39: { double g = gcd_d(a, b); return g ? fabs(a * b) / g : 0; }
    }
    return NAN;
}

static double run(Prog *pr, const double *vars) {
    double st[256];
    int sp = 0;
    for (int i = 0; i < pr->n; i++) {
        Ins *in = &pr->code[i];
        switch (in->op) {
        case OP_NUM: st[sp++] = in->v; break;
        case OP_VAR: st[sp++] = vars[in->arg]; break;
        case OP_ADD: sp--; st[sp - 1] += st[sp]; break;
        case OP_SUB: sp--; st[sp - 1] -= st[sp]; break;
        case OP_MUL: sp--; st[sp - 1] *= st[sp]; break;
        case OP_DIV: sp--; st[sp - 1] /= st[sp]; break;
        case OP_POW: sp--; st[sp - 1] = pow(st[sp - 1], st[sp]); break;
        case OP_NEG: st[sp - 1] = -st[sp - 1]; break;
        case OP_FACT: st[sp - 1] = factorial(st[sp - 1]); break;
        case OP_PCT: st[sp - 1] /= 100.0; break;
        case OP_ADDP: sp--; st[sp - 1] += st[sp - 1] * st[sp]; break;
        case OP_SUBP: sp--; st[sp - 1] -= st[sp - 1] * st[sp]; break;
        case OP_CALL:
            if (in->nargs == 2) { sp--; st[sp - 1] = call_fn(in->arg, 2, st[sp - 1], st[sp], pr->deg); }
            else st[sp - 1] = call_fn(in->arg, 1, st[sp - 1], 0, pr->deg);
            break;
        }
        if (sp >= 250) return NAN;
    }
    return sp ? st[sp - 1] : NAN;
}

/* vars: x, y, z, t, ans */
API double m_expr_eval(int h, double x, double y, double z, double t, double ans) {
    if (h < 1 || h > MAXPROG || !progs[h - 1]) return NAN;
    double v[NVARS] = {x, y, z, t, ans};
    return run(progs[h - 1], v);
}
/* y[i] = f(x0 + i*dx) for i < n — used for plotting */
API void m_expr_eval_range(int h, double x0, double dx, int n, double *out) {
    if (h < 1 || h > MAXPROG || !progs[h - 1]) return;
    double v[NVARS] = {0, 0, 0, 0, 0};
    for (int i = 0; i < n; i++) { v[0] = x0 + dx * i; out[i] = run(progs[h - 1], v); }
}
/* Does the expression reference variable idx? (lets the UI know if x is used) */
API int m_expr_uses(int h, int idx) {
    if (h < 1 || h > MAXPROG || !progs[h - 1]) return 0;
    for (int i = 0; i < progs[h - 1]->n; i++) if (progs[h - 1]->code[i].op == OP_VAR && progs[h - 1]->code[i].arg == idx) return 1;
    return 0;
}

static double gamma_fn(double z) {
    if (z < 0.5) return M_PI / (sin(M_PI * z) * gamma_fn(1 - z));
    z -= 1;
    static const double c[] = {0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
                               12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7};
    double x = c[0];
    for (int i = 1; i < 9; i++) x += c[i] / (z + i);
    double t = z + 7.5;
    return sqrt(2 * M_PI) * pow(t, z + 0.5) * exp(-t) * x;
}
static double factorial(double n) {
    if (n < 0) return NAN;
    if (n == floor(n)) { if (n > 170) return INFINITY; double r = 1; for (int i = 2; i <= (int)n; i++) r *= i; return r; }
    return gamma_fn(n + 1);
}

/* ======================================================================== root finding */
/* Real roots of expression h (as function of x) in [a,b]: sign-change scan + bisection. Returns count. */
API int m_find_roots(int h, double a, double b, int samples, double *out, int maxroots) {
    if (h < 1 || h > MAXPROG || !progs[h - 1] || samples < 2) return 0;
    Prog *pr = progs[h - 1];
    double v[NVARS] = {0, 0, 0, 0, 0};
    int count = 0;
    v[0] = a; double px = a, pf = run(pr, v), ppx = NAN, ppf = NAN;
    for (int i = 1; i <= samples && count < maxroots; i++) {
        double x = a + (b - a) * i / samples;
        v[0] = x; double fx = run(pr, v);
        /* touching root (even multiplicity, e.g. (x − 1/3)² = 0): no sign change, but |f| has a local minimum near 0 at
           the middle sample. Minimise |f| on [ppx, x] by ternary search; keep it only if f is (numerically) zero there. */
        if (isfinite(ppf) && isfinite(pf) && isfinite(fx) && pf != 0 && fx != 0 && (ppf < 0) == (pf < 0) && (pf < 0) == (fx < 0)
            && fabs(pf) < fabs(ppf) && fabs(pf) <= fabs(fx)) {
            double u = ppx, w = x;
            for (int k = 0; k < 200; k++) {
                double m1 = u + (w - u) / 3, m2 = w - (w - u) / 3;
                v[0] = m1; double f1 = fabs(run(pr, v)); v[0] = m2; double f2 = fabs(run(pr, v));
                if (f1 < f2) w = m2; else u = m1;
            }
            double r = 0.5 * (u + w); v[0] = r; double fr = run(pr, v);
            if (fabs(fr) <= 1e-12 * (1 + fabs(ppf) + fabs(fx)) && (!count || fabs(out[count - 1] - r) > 1e-6)) out[count++] = r;
        }
        if (isfinite(pf) && isfinite(fx)) {
            if (pf == 0) { if (!count || fabs(out[count - 1] - px) > 1e-9) out[count++] = px; }
            else if ((pf < 0) != (fx < 0) && fx != 0) {
                double u = px, w = x, fu = pf;
                for (int k = 0; k < 200; k++) { double m = 0.5 * (u + w); v[0] = m; double fm = run(pr, v); if ((fu < 0) != (fm < 0) || fm == 0) w = m; else { u = m; fu = fm; } }
                double r = 0.5 * (u + w); v[0] = r; double fr = run(pr, v);
                /* reject poles: |f| must actually be small */
                double scale = fabs(pf) + fabs(fx);
                if (fabs(fr) < 1e-6 * (1 + scale) && (!count || fabs(out[count - 1] - r) > 1e-9)) out[count++] = r;
            }
        }
        ppx = px; ppf = pf; px = x; pf = fx;
    }
    if (count < maxroots) { v[0] = b; if (run(pr, v) == 0 && (!count || fabs(out[count - 1] - b) > 1e-9)) out[count++] = b; }
    return count;
}

/* ======================================================================== polynomials */
/* out: re0,im0,re1,im1 */
API void m_quadratic(double a, double b, double c, double *out) {
    double D = b * b - 4 * a * c;
    if (D >= 0) {
        double q = -0.5 * (b + copysign(sqrt(D), b)); /* numerically stable */
        double r1 = q / a, r2 = q != 0 ? c / q : -b / a;
        if (r1 < r2) { double t = r1; r1 = r2; r2 = t; }
        out[0] = r1; out[1] = 0; out[2] = r2; out[3] = 0;
    } else {
        out[0] = -b / (2 * a); out[1] = sqrt(-D) / (2 * a); out[2] = out[0]; out[3] = -out[1];
    }
}
/* out: 3 complex roots (re,im)×3 */
API void m_cubic(double a, double b, double c, double d, double *out) {
    b /= a; c /= a; d /= a;
    double p = c - b * b / 3, q = 2 * b * b * b / 27 - b * c / 3 + d, sh = -b / 3;
    double disc = q * q / 4 + p * p * p / 27;
    if (fabs(disc) < 1e-14) {
        double u = cbrt(-q / 2);
        out[0] = 2 * u + sh; out[2] = out[4] = -u + sh; out[1] = out[3] = out[5] = 0;
    } else if (disc < 0) {
        double r = sqrt(-p * p * p / 27), phi = acos(fmax(-1, fmin(1, -q / (2 * r)))), m = 2 * cbrt(r);
        for (int k = 0; k < 3; k++) { out[2 * k] = m * cos((phi + 2 * M_PI * k) / 3) + sh; out[2 * k + 1] = 0; }
    } else {
        double sd = sqrt(disc), u = cbrt(-q / 2 + sd), v = cbrt(-q / 2 - sd);
        out[0] = u + v + sh; out[1] = 0;
        out[2] = -(u + v) / 2 + sh; out[3] = sqrt(3) / 2 * (u - v);
        out[4] = out[2]; out[5] = -out[3];
    }
}

/* ======================================================================== linear algebra (row-major) */
API double m_det(const double *A, int n) {
    double *a = malloc(sizeof(double) * n * n); memcpy(a, A, sizeof(double) * n * n);
    double d = 1;
    for (int c = 0; c < n; c++) {
        int p = c; for (int r = c + 1; r < n; r++) if (fabs(a[r * n + c]) > fabs(a[p * n + c])) p = r;
        if (fabs(a[p * n + c]) < 1e-14) { free(a); return 0; }
        if (p != c) { for (int k = 0; k < n; k++) { double t = a[p * n + k]; a[p * n + k] = a[c * n + k]; a[c * n + k] = t; } d = -d; }
        d *= a[c * n + c];
        for (int r = c + 1; r < n; r++) { double f = a[r * n + c] / a[c * n + c]; for (int k = c; k < n; k++) a[r * n + k] -= f * a[c * n + k]; }
    }
    free(a);
    return d;
}
/* returns 0 if singular */
API int m_inverse(const double *A, int n, double *out) {
    int w = 2 * n;
    double *a = malloc(sizeof(double) * n * w);
    for (int r = 0; r < n; r++) for (int c = 0; c < w; c++) a[r * w + c] = c < n ? A[r * n + c] : (c - n == r);
    for (int c = 0; c < n; c++) {
        int p = c; for (int r = c + 1; r < n; r++) if (fabs(a[r * w + c]) > fabs(a[p * w + c])) p = r;
        if (fabs(a[p * w + c]) < 1e-14) { free(a); return 0; }
        for (int k = 0; k < w; k++) { double t = a[p * w + k]; a[p * w + k] = a[c * w + k]; a[c * w + k] = t; }
        double pv = a[c * w + c]; for (int k = 0; k < w; k++) a[c * w + k] /= pv;
        for (int r = 0; r < n; r++) if (r != c) { double f = a[r * w + c]; for (int k = 0; k < w; k++) a[r * w + k] -= f * a[c * w + k]; }
    }
    for (int r = 0; r < n; r++) for (int c = 0; c < n; c++) out[r * n + c] = a[r * w + n + c];
    free(a);
    return 1;
}
API void m_matmul(const double *A, int r1, int c1, const double *B, int c2, double *out) {
    for (int i = 0; i < r1; i++) for (int j = 0; j < c2; j++) { double s = 0; for (int k = 0; k < c1; k++) s += A[i * c1 + k] * B[k * c2 + j]; out[i * c2 + j] = s; }
}
API int m_rank(const double *A, int rows, int cols) {
    double *a = malloc(sizeof(double) * rows * cols); memcpy(a, A, sizeof(double) * rows * cols);
    int rk = 0;
    for (int c = 0; c < cols && rk < rows; c++) {
        int p = rk; for (int r = rk + 1; r < rows; r++) if (fabs(a[r * cols + c]) > fabs(a[p * cols + c])) p = r;
        if (fabs(a[p * cols + c]) < 1e-10) continue;
        for (int k = 0; k < cols; k++) { double t = a[p * cols + k]; a[p * cols + k] = a[rk * cols + k]; a[rk * cols + k] = t; }
        for (int r = rk + 1; r < rows; r++) { double f = a[r * cols + c] / a[rk * cols + c]; for (int k = c; k < cols; k++) a[r * cols + k] -= f * a[rk * cols + k]; }
        rk++;
    }
    free(a);
    return rk;
}
/* Solve A x = b; returns 0 if singular */
API int m_solve_linear(const double *A, const double *b, int n, double *x) {
    int w = n + 1;
    double *m = malloc(sizeof(double) * n * w);
    for (int r = 0; r < n; r++) { for (int c = 0; c < n; c++) m[r * w + c] = A[r * n + c]; m[r * w + n] = b[r]; }
    for (int c = 0; c < n; c++) {
        int p = c; for (int r = c + 1; r < n; r++) if (fabs(m[r * w + c]) > fabs(m[p * w + c])) p = r;
        if (fabs(m[p * w + c]) < 1e-12) { free(m); return 0; }
        for (int k = 0; k < w; k++) { double t = m[p * w + k]; m[p * w + k] = m[c * w + k]; m[c * w + k] = t; }
        for (int r = 0; r < n; r++) if (r != c) { double f = m[r * w + c] / m[c * w + c]; for (int k = c; k < w; k++) m[r * w + k] -= f * m[c * w + k]; }
    }
    for (int r = 0; r < n; r++) x[r] = m[r * w + n] / m[r * w + r];
    free(m);
    return 1;
}

/* ======================================================================== statistics */
static int cmpd(const void *a, const void *b) { double x = *(const double *)a, y = *(const double *)b; return (x > y) - (x < y); }
static double quantile(const double *s, int n, double q) { double pos = (n - 1) * q; int lo = (int)floor(pos), hi = (int)ceil(pos); return s[lo] + (s[hi] - s[lo]) * (pos - lo); }
/* Sorts xs in place. out[17]: count sum mean median min max range q1 q3 iqr varP varS sdP sdS geomean harmmean skew */
API void m_stats(double *xs, int n, double *out) {
    for (int i = 0; i < 17; i++) out[i] = NAN;
    if (n <= 0) { out[0] = 0; return; }
    qsort(xs, n, sizeof(double), cmpd);
    double sum = 0; for (int i = 0; i < n; i++) sum += xs[i];
    double mean = sum / n, ss = 0, s3 = 0, lg = 0, inv = 0; int allpos = 1;
    for (int i = 0; i < n; i++) { double d = xs[i] - mean; ss += d * d; if (xs[i] <= 0) allpos = 0; else { lg += log(xs[i]); inv += 1 / xs[i]; } }
    double varp = ss / n, sdp = sqrt(varp);
    for (int i = 0; i < n; i++) { double z = sdp ? (xs[i] - mean) / sdp : 0; s3 += z * z * z; }
    out[0] = n; out[1] = sum; out[2] = mean; out[3] = quantile(xs, n, 0.5); out[4] = xs[0]; out[5] = xs[n - 1]; out[6] = xs[n - 1] - xs[0];
    out[7] = quantile(xs, n, 0.25); out[8] = quantile(xs, n, 0.75); out[9] = out[8] - out[7];
    out[10] = varp; out[11] = n > 1 ? ss / (n - 1) : NAN; out[12] = sdp; out[13] = n > 1 ? sqrt(ss / (n - 1)) : NAN;
    out[14] = allpos ? exp(lg / n) : NAN; out[15] = allpos ? n / inv : NAN; out[16] = sdp ? s3 / n : NAN;
}
/* sorted input → modes (values occurring most often, only if > 1 time). Returns count. */
API int m_modes(const double *s, int n, double *out, int maxout) {
    int best = 1, cnt = 0;
    for (int i = 0; i < n;) { int j = i; while (j < n && s[j] == s[i]) j++; if (j - i > best) best = j - i; i = j; }
    if (best < 2) return 0;
    for (int i = 0; i < n && cnt < maxout;) { int j = i; while (j < n && s[j] == s[i]) j++; if (j - i == best) out[cnt++] = s[i]; i = j; }
    return cnt;
}
/* out[3]: slope, intercept, r */
API void m_regress(const double *x, const double *y, int n, double *out) {
    double mx = 0, my = 0; for (int i = 0; i < n; i++) { mx += x[i]; my += y[i]; } mx /= n; my /= n;
    double sxy = 0, sxx = 0, syy = 0;
    for (int i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); syy += (y[i] - my) * (y[i] - my); }
    out[0] = sxy / sxx; out[1] = my - out[0] * mx; out[2] = sxy / sqrt(sxx * syy);
}

/* ======================================================================== integers (u64) */
typedef unsigned __int128 u128;
static uint64_t mulmod(uint64_t a, uint64_t b, uint64_t m) { return (uint64_t)((u128)a * b % m); }
static uint64_t powmod(uint64_t b, uint64_t e, uint64_t m) { uint64_t r = 1; b %= m; while (e) { if (e & 1) r = mulmod(r, b, m); b = mulmod(b, b, m); e >>= 1; } return r; }
API uint64_t m_gcd(uint64_t a, uint64_t b) { while (b) { uint64_t t = a % b; a = b; b = t; } return a; }
/* 0 on overflow */
API uint64_t m_lcm(uint64_t a, uint64_t b) { if (!a || !b) return 0; uint64_t g = m_gcd(a, b); u128 r = (u128)(a / g) * b; return r >> 64 ? 0 : (uint64_t)r; }
/* Deterministic Miller–Rabin for all 64-bit n */
API int m_is_prime(uint64_t n) {
    if (n < 2) return 0;
    static const uint64_t small[] = {2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37};
    for (int i = 0; i < 12; i++) { if (n == small[i]) return 1; if (n % small[i] == 0) return 0; }
    uint64_t d = n - 1; int s = 0; while (!(d & 1)) { d >>= 1; s++; }
    for (int i = 0; i < 12; i++) {
        uint64_t x = powmod(small[i], d, n);
        if (x == 1 || x == n - 1) continue;
        int comp = 1;
        for (int r = 1; r < s; r++) { x = mulmod(x, x, n); if (x == n - 1) { comp = 0; break; } }
        if (comp) return 0;
    }
    return 1;
}
static uint64_t rho(uint64_t n) {
    if (n % 2 == 0) return 2;
    for (uint64_t c = 1;; c++) {
        uint64_t x = 2, y = 2, d = 1;
        while (d == 1) { x = (mulmod(x, x, n) + c) % n; y = (mulmod(y, y, n) + c) % n; y = (mulmod(y, y, n) + c) % n; d = m_gcd(x > y ? x - y : y - x, n); }
        if (d != n) return d;
    }
}
static int cmpu(const void *a, const void *b) { uint64_t x = *(const uint64_t *)a, y = *(const uint64_t *)b; return (x > y) - (x < y); }
/* prime factors with multiplicity, sorted; returns count */
API int m_factor(uint64_t n, uint64_t *out) {
    int k = 0;
    if (n < 2) return 0;
    static const uint64_t sp[] = {2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37};
    for (int i = 0; i < 12; i++) while (n % sp[i] == 0) { out[k++] = sp[i]; n /= sp[i]; }
    uint64_t stack[64]; int sp2 = 0;
    if (n > 1) stack[sp2++] = n;
    while (sp2) { uint64_t m = stack[--sp2]; if (m_is_prime(m)) out[k++] = m; else { uint64_t d = rho(m); stack[sp2++] = d; stack[sp2++] = m / d; } }
    qsort(out, k, sizeof(uint64_t), cmpu);
    return k;
}
/* 0 when the next prime is above 2^64 − 1 (n + 1 wraps to 0) */
API uint64_t m_next_prime(uint64_t n) { if (n < 2) return 2; uint64_t c = n + 1; while (c && !m_is_prime(c)) c++; return c; }

/* ======================================================================== exact fractions (int64 with overflow checks) */
typedef struct { int64_t n, d; } Q;
static int q_ovf;
static int64_t i64gcd(int64_t a, int64_t b) { if (a < 0) a = -a; if (b < 0) b = -b; while (b) { int64_t t = a % b; a = b; b = t; } return a; }
static Q qmake(int64_t n, int64_t d) { if (d == 0) { q_ovf = 2; Q z = {0, 1}; return z; } if (d < 0) { n = -n; d = -d; } int64_t g = i64gcd(n, d); if (!g) g = 1; Q q = {n / g, d / g}; return q; }
static int64_t mulc(int64_t a, int64_t b) { int64_t r; if (__builtin_mul_overflow(a, b, &r)) q_ovf = 1; return r; }
static int64_t addc(int64_t a, int64_t b) { int64_t r; if (__builtin_add_overflow(a, b, &r)) q_ovf = 1; return r; }
static Q qadd(Q a, Q b) { return qmake(addc(mulc(a.n, b.d), mulc(b.n, a.d)), mulc(a.d, b.d)); }
static Q qsub(Q a, Q b) { Q nb = {-b.n, b.d}; return qadd(a, nb); }
static Q qmul(Q a, Q b) { int64_t g1 = i64gcd(a.n, b.d), g2 = i64gcd(b.n, a.d); if (!g1) g1 = 1; if (!g2) g2 = 1; return qmake(mulc(a.n / g1, b.n / g2), mulc(a.d / g2, b.d / g1)); }
static Q qdiv(Q a, Q b) { Q inv = {b.d, b.n}; if (b.n == 0) { q_ovf = 2; return a; } return qmul(a, qmake(inv.n, inv.d)); }

typedef struct { const char *s; int i; int err; } FP;
static void fws(FP *f) { while (f->s[f->i] == ' ') f->i++; }
static Q fexpr(FP *f);
static Q ffactor(FP *f);
static Q fnum(FP *f) {
    fws(f);
    Q z = {0, 1};
    if (f->s[f->i] == '(') { f->i++; Q v = fexpr(f); fws(f); if (f->s[f->i] != ')') { f->err = 1; return z; } f->i++; return v; }
    if (f->s[f->i] == '-') { f->i++; Q v = ffactor(f); v.n = -v.n; return v; }
    if (!(f->s[f->i] >= '0' && f->s[f->i] <= '9')) { f->err = 1; return z; }
    int64_t ip = 0, fp = 0, fd = 1;
    while (f->s[f->i] >= '0' && f->s[f->i] <= '9') { ip = addc(mulc(ip, 10), f->s[f->i] - '0'); f->i++; }
    int dec = 0;
    if (f->s[f->i] == '.') { dec = 1; f->i++; while (f->s[f->i] >= '0' && f->s[f->i] <= '9') { fp = addc(mulc(fp, 10), f->s[f->i] - '0'); fd = mulc(fd, 10); f->i++; } }
    Q q = qmake(addc(mulc(ip, fd), fp), fd);
    /* "2/3" written without spaces is one fraction, binding tighter than × and ÷ (1/3 ÷ 2/3 = 1/2, as people mean it);
       not when a power follows ("2/3^2" stays 2 ÷ 3²) or the denominator is a decimal */
    if (!dec && f->s[f->i] == '/' && f->s[f->i + 1] >= '0' && f->s[f->i + 1] <= '9') {
        int k = f->i + 1; int64_t den = 0;
        while (f->s[k] >= '0' && f->s[k] <= '9') { den = addc(mulc(den, 10), f->s[k] - '0'); k++; }
        int j = k; while (f->s[j] == ' ') j++;
        if (f->s[k] != '.' && f->s[j] != '^') { f->i = k; return qmake(ip, den); }
    }
    /* mixed number "1 1/2" */
    if (!dec) {
        int j = f->i; while (f->s[j] == ' ') j++;
        if (j > f->i && f->s[j] >= '0' && f->s[j] <= '9') {
            int k = j; int64_t a = 0, b = 0; while (f->s[k] >= '0' && f->s[k] <= '9') { a = addc(mulc(a, 10), f->s[k] - '0'); k++; }
            if (f->s[k] == '/' && f->s[k + 1] >= '0' && f->s[k + 1] <= '9') { k++; while (f->s[k] >= '0' && f->s[k] <= '9') { b = addc(mulc(b, 10), f->s[k] - '0'); k++; } f->i = k; q = qadd(q, qmake(a, b)); }
        }
    }
    return q;
}
static Q ffactor(FP *f) {
    Q b = fnum(f); fws(f);
    if (f->s[f->i] == '^') {
        f->i++; Q e = ffactor(f);
        if (e.d != 1 || e.n > 1000 || e.n < -1000) { f->err = 3; return b; }
        Q r = {1, 1}; Q base = e.n < 0 ? qdiv(r, b) : b; int64_t k = e.n < 0 ? -e.n : e.n;
        for (int64_t i = 0; i < k; i++) r = qmul(r, base);
        return r;
    }
    return b;
}
static Q fterm(FP *f) { Q v = ffactor(f); for (;;) { fws(f); char c = f->s[f->i]; if (c == '*') { f->i++; v = qmul(v, ffactor(f)); } else if (c == '/') { f->i++; v = qdiv(v, ffactor(f)); } else return v; } }
static Q fexpr(FP *f) { Q v = fterm(f); for (;;) { fws(f); char c = f->s[f->i]; if (c == '+') { f->i++; v = qadd(v, fterm(f)); } else if (c == '-') { f->i++; v = qsub(v, fterm(f)); } else return v; } }
/* out[2] = numerator, denominator. Returns 1 ok, 0 error (m_error). */
API int m_frac_eval(const char *src, int len, int64_t *out) {
    char *s = normalise(src, len);
    q_ovf = 0;
    FP f = {s, 0, 0};
    Q v = fexpr(&f); fws(&f);
    if (!f.err && s[f.i]) f.err = 1;
    free(s);
    if (f.err == 3) { set_err("Only whole-number powers keep fractions exact"); return 0; }
    if (f.err) { set_err("Could not read the expression"); return 0; }
    if (q_ovf == 2) { set_err("Division by zero"); return 0; }
    if (q_ovf) { set_err("Numbers too large for exact arithmetic"); return 0; }
    out[0] = v.n; out[1] = v.d;
    return 1;
}

/* ======================================================================== number bases (arbitrary length), Roman, words */
/* Converts digit string in base `from` to base `to` (2..36). Writes upper-case NUL-terminated result.
   Returns length, or -1 on invalid digit. Handles a leading '-' and 0x/0o/0b prefixes. */
API int m_base_convert(const char *src, int len, int from, int to, char *out, int outcap) {
    int i = 0, neg = 0;
    while (i < len && (src[i] == ' ' || src[i] == '_')) i++;
    if (i < len && src[i] == '-') { neg = 1; i++; }
    if (i + 1 < len && src[i] == '0' && (src[i + 1] == 'x' || src[i + 1] == 'X' || src[i + 1] == 'o' || src[i + 1] == 'b' || src[i + 1] == 'B')) i += 2;
    /* limbs base 2^32, little-endian */
    uint32_t *L = calloc((size_t)len + 2, sizeof(uint32_t)); int nl = 1;
    int digits = 0;
    for (; i < len; i++) {
        char c = src[i];
        if (c == '_' || c == ' ' || c == ',') continue;
        int d = c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'z' ? c - 'a' + 10 : c >= 'A' && c <= 'Z' ? c - 'A' + 10 : 99;
        if (d >= from) { free(L); return -1; }
        uint64_t carry = (uint64_t)d;
        for (int k = 0; k < nl; k++) { uint64_t v = (uint64_t)L[k] * from + carry; L[k] = (uint32_t)v; carry = v >> 32; }
        if (carry) L[nl++] = (uint32_t)carry;
        digits++;
    }
    if (!digits) { free(L); return -1; }
    char *tmp = malloc((size_t)nl * 33 + 2); int tn = 0;
    int zero;
    do {
        uint64_t rem = 0; zero = 1;
        for (int k = nl - 1; k >= 0; k--) { uint64_t v = (rem << 32) | L[k]; L[k] = (uint32_t)(v / to); rem = v % to; if (L[k]) zero = 0; }
        tmp[tn++] = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"[rem];
        while (nl > 1 && !L[nl - 1]) nl--;
    } while (!zero);
    int o = 0;
    if (neg && !(tn == 1 && tmp[0] == '0') && o < outcap - 1) out[o++] = '-';
    while (tn && o < outcap - 1) out[o++] = tmp[--tn];
    out[o] = 0;
    free(tmp); free(L);
    return o;
}

static const int RV[] = {1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1};
static const char *RS[] = {"M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"};
API int m_to_roman(int n, char *out) {
    if (n < 1 || n > 3999) return 0;
    int o = 0;
    for (int i = 0; i < 13; i++) while (n >= RV[i]) { int l = (int)strlen(RS[i]); memcpy(out + o, RS[i], l); o += l; n -= RV[i]; }
    out[o] = 0;
    return o;
}
/* returns value or 0 if invalid (strict canonical form) */
API int m_from_roman(const char *s, int len) {
    int n = 0, i = 0;
    char up[32]; if (len > 30) return 0;
    for (int k = 0; k < len; k++) up[k] = (s[k] >= 'a' && s[k] <= 'z') ? s[k] - 32 : s[k];
    up[len] = 0;
    for (int r = 0; r < 13; r++) { int l = (int)strlen(RS[r]); while (!strncmp(up + i, RS[r], l)) { n += RV[r]; i += l; } }
    if (i != len || !n) return 0;
    char back[32]; m_to_roman(n, back);
    return strcmp(back, up) ? 0 : n;
}

static const char *ONES[] = {"", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"};
static const char *TENS[] = {"", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"};
static void cat(char *o, int *k, int cap, const char *s) { int l = (int)strlen(s); if (*k + l + 1 >= cap) return; memcpy(o + *k, s, l); *k += l; o[*k] = 0; }
static void two(char *o, int *k, int cap, int n) {
    if (n < 20) { cat(o, k, cap, ONES[n]); return; }
    cat(o, k, cap, TENS[n / 10]);
    if (n % 10) { cat(o, k, cap, "-"); cat(o, k, cap, ONES[n % 10]); }
}
static void three(char *o, int *k, int cap, int n) {
    if (n >= 100) { cat(o, k, cap, ONES[n / 100]); cat(o, k, cap, " hundred"); if (n % 100) cat(o, k, cap, " and "); }
    if (n % 100) two(o, k, cap, n % 100);
}
static void sep(char *o, int *k, int cap) { if (*k) cat(o, k, cap, " "); }
/* Indian (lakh/crore) when indian=1, else international. Lower-case words. Returns length. */
API int m_words(uint64_t n, int indian, char *out, int cap) {
    int k = 0; out[0] = 0;
    if (!n) { cat(out, &k, cap, "zero"); return k; }
    if (indian) {
        uint64_t crore = n / 10000000ULL; n %= 10000000ULL;
        if (crore) {
            if (crore >= 100) { char sub[512]; m_words(crore, 1, sub, sizeof sub); cat(out, &k, cap, sub); }
            else two(out, &k, cap, (int)crore);
            cat(out, &k, cap, " crore");
        }
        int lakh = (int)(n / 100000); n %= 100000;
        if (lakh) { sep(out, &k, cap); two(out, &k, cap, lakh); cat(out, &k, cap, " lakh"); }
        int th = (int)(n / 1000); n %= 1000;
        if (th) { sep(out, &k, cap); two(out, &k, cap, th); cat(out, &k, cap, " thousand"); }
        if (n) { sep(out, &k, cap); three(out, &k, cap, (int)n); }
    } else {
        static const char *NAMES[] = {"", " thousand", " million", " billion", " trillion", " quadrillion", " quintillion"};
        int groups[7], g = 0;
        while (n) { groups[g++] = (int)(n % 1000); n /= 1000; }
        for (int i = g - 1; i >= 0; i--) if (groups[i]) { sep(out, &k, cap); three(out, &k, cap, groups[i]); cat(out, &k, cap, NAMES[i]); }
    }
    return k;
}

/* ======================================================================== finance */
API double m_emi(double P, double annual, int months) {
    double r = annual / 1200.0;
    if (months <= 0) return NAN;
    return r == 0 ? P / months : P * r * pow(1 + r, months) / (pow(1 + r, months) - 1);
}
/* yearly schedule: out[y*3+0]=principal paid, +1 interest paid, +2 closing balance. Returns number of years. */
API int m_amortize_yearly(double P, double annual, int months, double *out, int maxyears) {
    double e = m_emi(P, annual, months), bal = P, r = annual / 1200.0;
    int years = (months + 11) / 12; if (years > maxyears) years = maxyears;
    for (int y = 0; y < years; y++) {
        double pp = 0, ii = 0;
        for (int m = 0; m < 12 && y * 12 + m < months; m++) { double i = bal * r; ii += i; pp += e - i; bal -= e - i; }
        out[y * 3] = pp; out[y * 3 + 1] = ii; out[y * 3 + 2] = bal > 0 ? bal : 0;
    }
    return years;
}
/* SIP (monthly, nominal r/12, optional annual step-up %) or lumpsum. out[2]: invested, value */
API void m_sip(double amount, double annual, double years, double stepup, int lump, double *out) {
    if (lump) { out[0] = amount; out[1] = amount * pow(1 + annual / 100, years); return; }
    double i = annual / 1200, v = 0, inv = 0, m = amount;
    int n = (int)llround(years * 12);
    for (int k = 0; k < n; k++) { if (k && k % 12 == 0) m *= 1 + stepup / 100; v = (v + m) * (1 + i); inv += m; }
    out[0] = inv; out[1] = v;
}
static double grow(double P, double r, int n, double t) { return n == 0 ? P * (1 + r * t) : P * pow(1 + r / n, n * t); }
/* FD (rd=0) or RD (rd=1, monthly instalment). comp = compounding per year (0 = simple). out[2]: invested, value */
API void m_fd(double amount, double annual, double years, int comp, int rd, double *out) {
    double r = annual / 100;
    if (!rd) { out[0] = amount; out[1] = grow(amount, r, comp, years); return; }
    int months = (int)llround(years * 12); double v = 0;
    for (int k = 0; k < months; k++) v += grow(amount, r, comp, (double)(months - k) / 12);
    out[0] = amount * months; out[1] = v;
}
API double m_ppf(double yearly, double annual, int years) { double b = 0; for (int y = 0; y < years; y++) b = (b + yearly) * (1 + annual / 100); return b; }
/* out[2]: corpus, contributions */
API void m_epf(double basic, int age, int retire, double balance, double inc, double annual, double *out) {
    double bal = balance, b = basic, contrib = 0;
    for (int y = 0; y < retire - age; y++) {
        for (int m = 0; m < 12; m++) {
            double emp = b * 0.12, eps = (b < 15000 ? b : 15000) * 0.0833, er = b * 0.12 - eps;
            bal += emp + er; contrib += emp + er; bal += bal * annual / 1200;
        }
        b *= 1 + inc / 100;
    }
    out[0] = bal; out[1] = contrib;
}
/* out[4]: corpus, monthly pension, lump sum, invested */
API void m_nps(double monthly, int age, double annual, double annuity_pct, double annuity_rate, double *out) {
    int months = (60 - age) * 12; if (months < 0) months = 0;
    double c = 0, i = annual / 1200;
    for (int k = 0; k < months; k++) c = (c + monthly) * (1 + i);
    double ap = annuity_pct < 40 ? 40 : annuity_pct, a = c * ap / 100;
    out[0] = c; out[1] = a * annuity_rate / 1200; out[2] = c - a; out[3] = monthly * months;
}
/* out[5]: emi, base_interest, interest_with_prepay, months_taken, new_emi */
API void m_prepay(double P, double annual, int months, double pp, int when, int yearly, int keep_tenure, double *out) {
    double r = annual / 1200, emi = m_emi(P, annual, months), base = emi * months - P;
    double bal = P, interest = 0, ne = emi; int m = 0;
    while (bal > 0.5 && m < 1200) {
        double i = bal * r; interest += i;
        double pr = ne - i; if (pr > bal) pr = bal; bal -= pr; m++;
        int due = yearly ? (m >= when && (m - when) % 12 == 0) : (m == when);
        if (due && bal > 0) { bal -= pp; if (bal < 0) bal = 0; if (keep_tenure && months - m > 0) ne = m_emi(bal, annual, months - m); }
    }
    out[0] = emi; out[1] = base; out[2] = interest; out[3] = m; out[4] = ne;
}

/* ======================================================================== health & geodesy */
API double m_bmi(double kg, double metres) { return kg / (metres * metres); }
API double m_bmr(int male, double kg, double cm, double age) { return 10 * kg + 6.25 * cm - 5 * age + (male ? 5 : -161); }
API double m_bodyfat(int male, double h, double neck, double waist, double hip) {
    return male ? 495 / (1.0324 - 0.19077 * log10(waist - neck) + 0.15456 * log10(h)) - 450
                : 495 / (1.29579 - 0.35004 * log10(waist + hip - neck) + 0.221 * log10(h)) - 450;
}
/* out[4]: Devine, Robinson, Miller, Hamwi (kg) */
API void m_idealweight(int male, double cm, double *out) {
    double in = cm / 2.54 - 60; if (in < 0) in = 0;
    out[0] = (male ? 50 : 45.5) + 2.3 * in;
    out[1] = (male ? 52 : 49) + (male ? 1.9 : 1.7) * in;
    out[2] = (male ? 56.2 : 53.1) + (male ? 1.41 : 1.36) * in;
    out[3] = (male ? 48 : 45.5) + (male ? 2.7 : 2.2) * in;
}
/* out[2]: great-circle km, initial bearing degrees */
API void m_haversine(double lat1, double lon1, double lat2, double lon2, double *out) {
    double R = 6371.0088, d = M_PI / 180, dLat = (lat2 - lat1) * d, dLon = (lon2 - lon1) * d;
    double h = sin(dLat / 2) * sin(dLat / 2) + cos(lat1 * d) * cos(lat2 * d) * sin(dLon / 2) * sin(dLon / 2);
    out[0] = 2 * R * asin(sqrt(h));
    double y = sin(dLon) * cos(lat2 * d), x = cos(lat1 * d) * sin(lat2 * d) - sin(lat1 * d) * cos(lat2 * d) * cos(dLon);
    out[1] = fmod(atan2(y, x) / d + 360, 360);
}

/* ======================================================================== matrices (more) */
/* out = A + sign·B (same shape) */
API void m_matadd(const double *A, const double *B, int n, double sign, double *out) { for (int i = 0; i < n; i++) out[i] = A[i] + sign * B[i]; }
API void m_transpose(const double *A, int rows, int cols, double *out) { for (int r = 0; r < rows; r++) for (int c = 0; c < cols; c++) out[c * rows + r] = A[r * cols + c]; }
API double m_trace(const double *A, int n) { double s = 0; for (int i = 0; i < n; i++) s += A[i * n + i]; return s; }
/* A^p for square A (p ≥ 0) by repeated squaring. */
API void m_matpow(const double *A, int n, int p, double *out) {
    size_t sz = sizeof(double) * n * n;
    double *base = malloc(sz), *tmp = malloc(sz);
    memcpy(base, A, sz);
    for (int i = 0; i < n * n; i++) out[i] = (i / n == i % n) ? 1 : 0;
    while (p > 0) {
        if (p & 1) { m_matmul(out, n, n, base, n, tmp); memcpy(out, tmp, sz); }
        p >>= 1;
        if (p) { m_matmul(base, n, n, base, n, tmp); memcpy(base, tmp, sz); }
    }
    free(base); free(tmp);
}

/* ======================================================================== calendar */
/* Mon–Fri days in the inclusive day range [a, b] (days since 1970-01-01, which was a Thursday). Closed form. */
static int64_t wd_before(int64_t d) { /* weekdays in [0, d) relative to epoch, d may be negative */
    int64_t w = d >= 0 ? d / 7 : -((-d + 6) / 7), r = d - w * 7; /* 0 ≤ r < 7 */
    int64_t n = w * 5;
    for (int64_t k = 0; k < r; k++) { int dow = (int)((k + 4) % 7); if (dow != 0 && dow != 6) n++; }
    return n;
}
API double m_weekdays(double a, double b) {
    int64_t lo = (int64_t)a, hi = (int64_t)b;
    if (hi < lo) return 0;
    return (double)(wd_before(hi + 1) - wd_before(lo));
}

/* ======================================================================== colour */
static double lin(double c) { c /= 255; return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
static double delin(double c) { return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1 / 2.4) - 0.055); }
API void m_color(int op, double x, double y, double z, double *out);
static double clip255(double v) { return v != v || v < 0 ? 0 : v > 255 ? 255 : v; }
static int gamut_ok(const double *rgb) { for (int i = 0; i < 3; i++) if (!(rgb[i] >= -1e-6 && rgb[i] <= 255 + 1e-6)) return 0; return 1; }
/* Distance in OKLab (deltaEOK) between an sRGB colour and the OKLCH colour (L in %, C, H°). */
static double delta_ok(const double *rgb, double L, double C, double H) {
    double p[3];
    m_color(2, rgb[0], rgb[1], rgb[2], p);
    double a1 = p[1] * cos(p[2] * M_PI / 180), b1 = p[1] * sin(p[2] * M_PI / 180), a2 = C * cos(H * M_PI / 180), b2 = C * sin(H * M_PI / 180), dl = (p[0] - L) / 100;
    return sqrt(dl * dl + (a1 - a2) * (a1 - a2) + (b1 - b2) * (b1 - b2));
}
/* op 0 RGB→HSL, 1 HSL→RGB, 2 RGB→OKLCH (L in %, C, H°), 3 OKLCH→RGB, 4 relative luminance (WCAG) → out[0],
   5 OKLCH→RGB fitted into sRGB (out needs 5 doubles). */
API void m_color(int op, double x, double y, double z, double *out) {
    if (op == 0) {
        double r = x / 255, g = y / 255, b = z / 255, mx = fmax(r, fmax(g, b)), mn = fmin(r, fmin(g, b)), l = (mx + mn) / 2, h = 0, s = 0;
        if (mx != mn) {
            double d = mx - mn;
            s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
            h = mx == r ? (g - b) / d + (g < b ? 6 : 0) : mx == g ? (b - r) / d + 2 : (r - g) / d + 4;
            h *= 60;
        }
        out[0] = h; out[1] = s * 100; out[2] = l * 100;
    } else if (op == 1) {
        double h = x, s = y / 100, l = z / 100, a = s * fmin(l, 1 - l);
        for (int i = 0; i < 3; i++) {
            int n = i == 0 ? 0 : i == 1 ? 8 : 4;
            double k = fmod(n + h / 30, 12);
            if (k < 0) k += 12;
            out[i] = (l - a * fmax(-1, fmin(fmin(k - 3, 9 - k), 1))) * 255;
        }
    } else if (op == 2) {
        double R = lin(x), G = lin(y), B = lin(z);
        double l = cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), m = cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B),
               s = cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
        double L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
               bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
        out[0] = L * 100; out[1] = hypot(a, bb); out[2] = fmod(atan2(bb, a) * 180 / M_PI + 360, 360);
    } else if (op == 3) {
        double a = y * cos(z * M_PI / 180), b = y * sin(z * M_PI / 180), Lr = x / 100;
        double l = pow(Lr + 0.3963377774 * a + 0.2158037573 * b, 3), m = pow(Lr - 0.1055613458 * a - 0.0638541728 * b, 3), s = pow(Lr - 0.0894841775 * a - 1.291485548 * b, 3);
        out[0] = delin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
        out[1] = delin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
        out[2] = delin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
    } else if (op == 4) {
        out[0] = 0.2126 * lin(x) + 0.7152 * lin(y) + 0.0722 * lin(z);
    } else if (op == 5) {
        /* OKLCH → sRGB for a colour that may lie outside sRGB: the gamut mapping of CSS Color 4 (section 13.2).
           Lightness and hue are kept and the chroma is reduced by bisection; at each step the colour is also tried
           clipped to sRGB, and the clipped colour is taken as soon as it is closer than a just-noticeable difference
           (0.02 in OKLab) — so a colour that is outside only by the rounding of its text is simply clipped.
           out[0..2] = RGB within 0..255, out[3] = 1 when the colour was outside sRGB, out[4] = the chroma of the result. */
        double L = x < 0 ? 0 : x > 100 ? 100 : x, C = y < 0 || y != y ? 0 : y, H = z, o[3], lab[3];
        const double JND = 0.02, EPS = 0.0001;
        out[3] = 0; out[4] = C;
        if (L >= 100) { out[0] = out[1] = out[2] = 255; out[3] = C > 0; out[4] = 0; return; }
        if (L <= 0) { out[0] = out[1] = out[2] = 0; out[3] = C > 0; out[4] = 0; return; }
        m_color(3, L, C, H, o);
        if (gamut_ok(o)) { for (int i = 0; i < 3; i++) out[i] = clip255(o[i]); return; }
        out[3] = 1;
        double clipped[3], lo = 0, hi = C; int lo_in = 1;
        for (int i = 0; i < 3; i++) clipped[i] = clip255(o[i]);
        if (delta_ok(clipped, L, C, H) >= JND) {
            while (hi - lo > EPS) {
                double chroma = (lo + hi) / 2;
                m_color(3, L, chroma, H, o);
                if (lo_in && gamut_ok(o)) { lo = chroma; continue; }
                for (int i = 0; i < 3; i++) clipped[i] = clip255(o[i]);
                double E = delta_ok(clipped, L, chroma, H);
                if (E < JND) { if (JND - E < EPS) break; lo_in = 0; lo = chroma; }
                else hi = chroma;
            }
        }
        for (int i = 0; i < 3; i++) out[i] = clipped[i];
        m_color(2, clipped[0], clipped[1], clipped[2], lab);
        out[4] = lab[1];
    }
}
/* WCAG 2 contrast ratio between two sRGB colours (1..21). */
API double m_contrast(double r1, double g1, double b1, double r2, double g2, double b2) {
    double a[1], b[1];
    m_color(4, r1, g1, b1, a); m_color(4, r2, g2, b2, b);
    double hi = fmax(a[0], b[0]), lo = fmin(a[0], b[0]);
    return (hi + 0.05) / (lo + 0.05);
}

/* ======================================================================== India: GST invoices */
/* Money is kept in integer paise; every rounding is half away from zero, per line (as invoices are printed). */
static int64_t paise(double rupees) { double p = rupees * 100.0; return (int64_t)(p < 0 ? p - 0.5 : p + 0.5); }
static int64_t rdiv(int64_t num, int64_t den) { return num >= 0 ? (num + den / 2) / den : -((-num + den / 2) / den); }

/* lines: n × [qty, rate (₹), discount %, gst %]. intra = 1: CGST + SGST/UTGST (half each), 0: IGST.
 * out_lines: n × [taxable, cgst, sgst, igst] in paise. out: [taxable, cgst, sgst, igst, total, roundoff, grand] paise.
 * GST % is taken in hundredths (0.25 % = 25) so rates like 0.1 / 0.25 / 1.5 / 7.5 are exact. */
API void m_invoice(const double *lines, int n, int intra, int roundoff, int64_t *out_lines, int64_t *out) {
    int64_t T = 0, C = 0, S = 0, I = 0;
    for (int i = 0; i < n; i++) {
        double qty = lines[i * 4], rate = lines[i * 4 + 1], disc = lines[i * 4 + 2], g = lines[i * 4 + 3];
        int64_t gross = paise(qty * rate), d = paise(qty * rate * disc / 100.0), taxable = gross - d;
        int64_t g100 = (int64_t)(g * 100.0 + 0.5); /* rate in hundredths of a percent */
        int64_t c = 0, s = 0, ig = 0;
        if (intra) { c = rdiv(taxable * g100, 20000); s = c; } else ig = rdiv(taxable * g100, 10000);
        out_lines[i * 4] = taxable; out_lines[i * 4 + 1] = c; out_lines[i * 4 + 2] = s; out_lines[i * 4 + 3] = ig;
        T += taxable; C += c; S += s; I += ig;
    }
    int64_t total = T + C + S + I, grand = roundoff ? rdiv(total, 100) * 100 : total;
    out[0] = T; out[1] = C; out[2] = S; out[3] = I; out[4] = total; out[5] = grand - total; out[6] = grand;
}

/* GSTIN: 2-digit state code + 10-char PAN + entity number + 'Z' + check character (mod-36 Luhn variant used by GSTN). */
API int m_gstin_valid(const char *g, int len) {
    static const char *cs = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (len != 15) return 0;
    int st = (g[0] - '0') * 10 + (g[1] - '0');
    if (g[0] < '0' || g[0] > '9' || g[1] < '0' || g[1] > '9' || st < 1 || st > 99) return 0;
    for (int i = 2; i < 7; i++) if (g[i] < 'A' || g[i] > 'Z') return 0;          /* PAN: 5 letters */
    for (int i = 7; i < 11; i++) if (g[i] < '0' || g[i] > '9') return 0;        /*      4 digits */
    if (g[11] < 'A' || g[11] > 'Z') return 0;                                   /*      1 letter */
    int sum = 0;
    for (int i = 0; i < 14; i++) {
        const char *p = strchr(cs, g[i]); if (!p || !g[i]) return 0;
        int v = (int)(p - cs) * (i % 2 ? 2 : 1);
        sum += v / 36 + v % 36;
    }
    return cs[(36 - sum % 36) % 36] == g[14];
}
