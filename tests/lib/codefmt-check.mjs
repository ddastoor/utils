// Independent readers for the Code Formatter's suites (tests/unit/codefmt.test.mjs, tests/e2e/prettier.e2e.mjs):
// what a file MEANS, as read by a parser that belongs to none of the formatters the tab uses or was compared with.
//
//   same(lang, before, after) → ''      the two texts mean the same
//                               'skip'  the original is not sound input for the reader (nothing can be said)
//                               other   what differs (a sentence for the test's message)
//
// Readers: JavaScript / TypeScript — Microsoft's TypeScript 5.9 parser (the tree without layout, brackets and quote
// style; every comment). JSON — the tokens as typed. CSS / SCSS — PostCSS (+ postcss-scss). YAML — eemeli's yaml
// (the data of every document, with its types; the comments). Markdown — marked (the HTML it renders). HTML — parse5
// (the document tree; white space where the browser shows it). GraphQL — graphql-js (its printed AST; the comments).
// Vue — the Vue compiler's own parser for the blocks and the template tree.
//
// Each reader allows exactly what a formatter is entitled to change, and each allowance is named where it is made.
import { createRequire } from 'node:module';
import postcss from 'postcss';
import scssSyntax from 'postcss-scss';
import * as parse5 from 'parse5';
import * as gql from 'graphql';
import YAML from 'yaml';
import { marked } from 'marked';
import { parse as parseSfc } from '@vue/compiler-sfc';

const ts = createRequire(import.meta.url)('typescript-classic');

// ───────────────────────────────────────────────────────────── JavaScript / TypeScript
const KIND = { js: ts.ScriptKind.JSX, jsx: ts.ScriptKind.JSX, ts: ts.ScriptKind.TS, tsx: ts.ScriptKind.TSX };
/** JSX text as React reads it: lines trimmed where they meet a line break, empty lines dropped, joined by one space.
 *  Allowed beyond that: a run of white space counts as one space (it is one in the page). */
const jsxText = (s) => { const a = s.split(/\r\n|\n|\r/); return a.map((l, i) => { l = l.replace(/\t/g, ' '); if (i > 0) l = l.replace(/^ +/, ''); if (i < a.length - 1) l = l.replace(/ +$/, ''); return l; }).filter((l) => l !== '').join(' ').replace(/\s+/g, ' '); };
const LOGICAL = [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken];

/** The program without its layout. `ext`: js (JSX allowed), ts, tsx. */
export function program(text, ext = 'js') {
  const sf = ts.createSourceFile(`f.${ext}`, text, ts.ScriptTarget.Latest, true, KIND[ext] ?? ts.ScriptKind.TS);
  const out = [];
  // a property name: 'a', "a" and a are one name, 1 and '1' too
  const name = (n) => (ts.isStringLiteral(n) || ts.isIdentifier(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? `name:${n.text}` : ts.isNumericLiteral(n) ? `name:${Number(n.text)}` : null;
  const walk = (n, asName) => {
    // brackets that only group: the tree already says what they said
    if (ts.isParenthesizedExpression(n) || n.kind === ts.SyntaxKind.ParenthesizedType) { ts.forEachChild(n, (c) => walk(c)); return; }
    if (asName) { const k = name(n); if (k !== null) { out.push(k); return; } }
    switch (n.kind) {
      case ts.SyntaxKind.Identifier: case ts.SyntaxKind.PrivateIdentifier: out.push(`id:${n.text}`); return;
      case ts.SyntaxKind.StringLiteral: out.push(`str:${n.text}`); return;                                  // the value, whatever the quotes
      case ts.SyntaxKind.NumericLiteral: out.push(`num:${Number(n.text)}`); return;                         // the value: 0XAB = 0xab, .5 = 0.5
      case ts.SyntaxKind.BigIntLiteral: out.push(`big:${n.text.toLowerCase().replace(/_/g, '')}`); return;
      case ts.SyntaxKind.RegularExpressionLiteral: { const k = n.text.lastIndexOf('/'); out.push(`re:${n.text.slice(0, k + 1)}${[...n.text.slice(k + 1)].sort().join('')}`); return; }   // flags in any order
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral: case ts.SyntaxKind.TemplateHead: case ts.SyntaxKind.TemplateMiddle: case ts.SyntaxKind.TemplateTail: out.push(`tpl:${n.rawText ?? n.text}`); return;
      case ts.SyntaxKind.JsxText: { const t = jsxText(n.text); if (t) out.push(`jsx:${t}`); return; }
      case ts.SyntaxKind.EmptyStatement: return;                                                            // a stray ";"
      default:
    }
    if (ts.isJsxElement(n) || ts.isJsxFragment(n)) {
      // children: text and {" "} are the same thing; {/* a comment */} is a comment
      out.push(ts.SyntaxKind[n.kind]); walk(n.openingElement ?? n.openingFragment);
      let text = null; const flush = () => { if (text) out.push(`jsx:${text.replace(/\s+/g, ' ')}`); text = null; };
      for (const c of n.children) {
        if (c.kind === ts.SyntaxKind.JsxText) { text = (text ?? '') + jsxText(c.text); continue; }
        if (ts.isJsxExpression(c) && !c.expression) continue;
        if (ts.isJsxExpression(c) && ts.isStringLiteral(c.expression) && /^ +$/.test(c.expression.text)) { text = (text ?? '') + ' '; continue; }
        flush(); walk(c);
      }
      flush(); walk(n.closingElement ?? n.closingFragment); return;
    }
    if (n.kind === ts.SyntaxKind.BinaryExpression && LOGICAL.includes(n.operatorToken.kind)) {
      // a && (b && c) is a && b && c
      const op = n.operatorToken.kind, parts = [];
      const flat = (x) => { while (ts.isParenthesizedExpression(x)) x = x.expression; if (x.kind === ts.SyntaxKind.BinaryExpression && x.operatorToken.kind === op) { flat(x.left); flat(x.right); } else parts.push(x); };
      flat(n); out.push(`chain:${ts.SyntaxKind[op]}:${parts.length}`); parts.forEach((x) => walk(x)); return;
    }
    out.push(ts.SyntaxKind[n.kind] + (n.kind === ts.SyntaxKind.BinaryExpression || n.kind === ts.SyntaxKind.PrefixUnaryExpression || n.kind === ts.SyntaxKind.PostfixUnaryExpression ? `:${ts.SyntaxKind[n.operatorToken?.kind ?? n.operator]}` : '')
      + (ts.canHaveModifiers?.(n) && ts.getModifiers(n)?.length ? `[${ts.getModifiers(n).map((m) => ts.SyntaxKind[m.kind]).join()}]` : ''));
    const named = (ts.isPropertyAssignment(n) || ts.isPropertySignature(n) || ts.isPropertyDeclaration(n) || ts.isMethodDeclaration(n) || ts.isMethodSignature(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n) || ts.isEnumMember(n) || ts.isShorthandPropertyAssignment(n)) && n.name;
    ts.forEachChild(n, (c) => walk(c, named && c === n.name));
  };
  walk(sf);
  // every comment stands in front of some token or behind one; a block comment may be indented anew
  const comments = [], seen = new Set();
  const grab = (pos) => { for (const r of [...(ts.getTrailingCommentRanges(text, pos) || []), ...(ts.getLeadingCommentRanges(text, pos) || [])]) if (!seen.has(r.pos)) { seen.add(r.pos); comments.push(text.slice(r.pos, r.end).split('\n').map((l) => l.trim().replace(/^\*\s?/, '* ').trim()).join('\n')); } };
  const leaves = (n) => { if (n.kind >= ts.SyntaxKind.FirstJSDocNode && n.kind <= ts.SyntaxKind.LastJSDocNode) return; const ch = n.getChildren(sf); if (!ch.length) grab(n.pos); else ch.forEach(leaves); };
  leaves(sf); grab(0);
  return { shape: out, comments: comments.sort(), errs: sf.parseDiagnostics.length };
}
function sameProgram(a, b, ext) {
  const x = program(a, ext);
  if (x.errs) return 'skip';
  const y = program(b, ext);
  if (y.errs) return 'the result does not parse';
  return diffList(x.shape, y.shape, 'the program') || diffList(x.comments, y.comments, 'the comments');
}
const diffList = (x, y, what) => {
  if (x.length === y.length && x.every((s, i) => s === y[i])) return '';
  let i = 0; while (i < x.length && i < y.length && x[i] === y[i]) i++;
  const cut = (a) => a.slice(Math.max(0, i - 2), i + 3).map((s) => String(s).slice(0, 80)).join(' · ');
  return `${what} differ at ${i} of ${x.length} / ${y.length}: ${cut(x)}  ≠  ${cut(y)}`;
};

// ───────────────────────────────────────────────────────────── JSON
/** The tokens of a JSON text exactly as typed (strings with their escapes, numbers with their digits) and its
 *  comments. Allowed: white space, and a comma in front of a closing bracket (JSON with comments). */
export function jsonTokens(text) {
  const toks = [], comments = []; const n = text.length; let i = 0;
  const lit = /(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/y;
  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '﻿') { i++; continue; }
    if (c === '/' && text[i + 1] === '/') { let j = text.indexOf('\n', i); if (j < 0) j = n; comments.push(text.slice(i, j).trim()); i = j; continue; }
    if (c === '/' && text[i + 1] === '*') { const j = text.indexOf('*/', i + 2); if (j < 0) throw new Error('a comment never ends'); comments.push(text.slice(i, j + 2).split('\n').map((l) => l.trim()).join('\n')); i = j + 2; continue; }
    if (c === '"') { let j = i + 1; while (j < n && text[j] !== '"') j += text[j] === '\\' ? 2 : 1; if (j >= n) throw new Error('a string never ends'); toks.push(text.slice(i, j + 1)); i = j + 1; continue; }
    if ('{}[],:'.includes(c)) { toks.push(c); i++; continue; }
    lit.lastIndex = i; const m = lit.exec(text);
    if (!m) throw new Error(`unexpected ${JSON.stringify(text.slice(i, i + 12))}`);
    toks.push(m[1]); i = lit.lastIndex;
  }
  return { toks: toks.filter((t, k) => !(t === ',' && (toks[k + 1] === '}' || toks[k + 1] === ']'))), comments };
}
function sameJson(a, b) {
  let x; try { x = jsonTokens(a); } catch { return 'skip'; }
  let y; try { y = jsonTokens(b); } catch (e) { return `the result is not JSON: ${e.message}`; }
  return diffList(x.toks, y.toks, 'the tokens') || diffList(x.comments, y.comments, 'the comments');
}

// ───────────────────────────────────────────────────────────── CSS / SCSS
const IDENT0 = /[A-Za-z_\u0080-￿\\$@%&]/, IDENT = /[\w\-\u0080-￿]/;
/** A value, a selector's bracket or an at-rule's parameters as a list of tokens. Allowed: white space where CSS (and
 *  Sass) give it no meaning — around , ( ) [ ] { } / * : ; = and comparisons, in front of !important, at both ends;
 *  one quote style for a string that holds no quote; numbers by value with the unit in lower case (.5 = 0.50,
 *  10PX = 10px); hex colours and !important in lower case. Everything else must be the same text.
 *  The signs: in CSS a sign in front of a digit belongs to the number ("1px+2px" is 1px and +2px), and white space
 *  around a lone + or − is kept as typed (calc( ) needs it). In Sass "+" with something on its left always adds, and
 *  "−" subtracts unless white space stands in front of it and a number or a name right behind it — "1 -2" and
 *  "a -b" are lists (sass-lang.com, Numeric Operators); around the operators white space means nothing; a comma in
 *  front of ")" counts only in a list of one. */
export function cssTokens(v, scss = false) {
  const out = []; const n = v.length; let i = 0;
  const isValue = (t) => t !== undefined && t !== ' ' && !/^[,(\[{/*:;=<>!+-]$|^==$|^!=$|^<=$|^>=$/.test(t);
  const NUM = /((?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)([A-Za-z%]*)/y;
  const number = (at, sign) => { NUM.lastIndex = at; const m = NUM.exec(v); const x = Number(m[1]); out.push(`${sign}${Number.isFinite(x) ? String(x) : m[1]}${m[2].toLowerCase()}`); return NUM.lastIndex; };
  const ident = (at) => { let j = at + 1; while (j < n && (IDENT.test(v[j]) || (v[j] === '\\' && j + 1 < n))) j += v[j] === '\\' ? 2 : 1; out.push(v.slice(at, j)); return j; };
  while (i < n) {
    const c = v[i];
    if (/\s/.test(c)) { if (out.length && out[out.length - 1] !== ' ') out.push(' '); i++; continue; }
    if (c === '/' && v[i + 1] === '*') { const j = v.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; continue; }           // comments are compared on their own
    if (scss && c === '/' && v[i + 1] === '/') { let j = v.indexOf('\n', i); if (j < 0) j = n; i = j; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < n && v[j] !== c) { if (v[j] === '\\' && (v[j + 1] === '"' || v[j + 1] === "'")) { s += v[j + 1]; j += 2; } else if (v[j] === '\\') { s += v.slice(j, j + 2); j += 2; } else if (scss && v[j] === '#' && v[j + 1] === '{') { const k = close(v, j + 1); s += `#{${cssTokens(v.slice(j + 2, k), true).join('')}}`; j = k + 1; } else s += v[j++]; }
      out.push(`"${s}"`); i = j + 1; continue;
    }
    if (c === '#' && v[i + 1] === '{') { const k = close(v, i + 1); out.push(`#{${cssTokens(v.slice(i + 2, k), scss).join('')}}`); i = k + 1; continue; }
    if (/^url\(/i.test(v.slice(i, i + 4)) && !/^\s*["']/.test(v.slice(i + 4)) && !(scss && /^\s*[$#]/.test(v.slice(i + 4)))) { const k = v.indexOf(')', i); const e = k < 0 ? n : k; out.push(`url(${v.slice(i + 4, e).trim()})`); i = e + 1; continue; }
    if (/^[uU]\+[0-9a-fA-F?]/.test(v.slice(i, i + 3))) { const m = /^[uU]\+[0-9a-fA-F?]+(?:-[0-9a-fA-F]+)?/.exec(v.slice(i)); out.push(m[0].toUpperCase()); i += m[0].length; continue; }
    if (c === '#') { const m = /^#[0-9a-fA-F]{3,8}(?![\w-])/.exec(v.slice(i)); if (m) { out.push(m[0].toLowerCase()); i += m[0].length; continue; } }
    if (c === '+' || c === '-') {
      const prev = out[out.length - 1], left = isValue(prev);
      const numNext = /^.(?:\d|\.\d)/.test(v.slice(i, i + 3)), nameNext = c === '-' && /^-(?:[A-Za-z_\u0080-￿\\-]|#\{)/.test(v.slice(i, i + 3));
      if (scss) {
        if (c === '-' && numNext && !left) { i = number(i + 1, '-'); continue; }
        if (nameNext && !left) { i = ident(i); continue; }
        out.push(c); i++; continue;
      }
      if (numNext) { if (c === '+' && prev === ' ' && isValue(out[out.length - 2])) out.pop(); i = number(i + 1, c === '-' ? '-' : ''); continue; }
      if (nameNext && !left) { i = ident(i); continue; }
      out.push(c); i++; continue;
    }
    if (/\d/.test(c) || (c === '.' && /\d/.test(v[i + 1] ?? ''))) { i = number(i, ''); continue; }
    if (c === '!') { const m = /^!\s*([A-Za-z]+)/.exec(v.slice(i)); if (m) { out.push(`!${m[1].toLowerCase()}`); i += m[0].length; continue; } }
    if (IDENT0.test(c)) { i = ident(i); continue; }
    const two = v.slice(i, i + 2);
    if (two === '==' || two === '!=' || two === '<=' || two === '>=') { out.push(two); i += 2; continue; }
    if (v.slice(i, i + 3) === '...') { out.push('...'); i += 3; continue; }
    out.push(c); i++;
  }
  // white space that means nothing
  const tight = scss ? /^[,(\[\]{}/*:;=<>)+-]$|^==$|^!=$|^<=$|^>=$/ : /^[,(\[\]{}/*:;=<>)]$|^==$|^!=$|^<=$|^>=$/;
  const res = [];
  for (let k = 0; k < out.length; k++) {
    const t = out[k];
    if (t !== ' ') { res.push(t); continue; }
    const p = out[k - 1], q = out[k + 1];
    if (p === undefined || q === undefined) continue;
    if (q === '(') { if (/^[,(\[{/*:;=<>+\-)]$/.test(p)) continue; res.push(' '); continue; }       // "and (" is not "and("
    if (tight.test(p) || tight.test(q)) continue;
    if (/^![a-z]+$/.test(q)) continue;                                                             // 8px!default = 8px !default
    if (/\)$/.test(p) && /^[A-Za-z"]/.test(q)) continue;                                           // url(a)format("b") = url(a) format("b")
    res.push(' ');
  }
  for (let k = res.length - 2; k >= 0; k--) if (res[k] === ';' && res[k + 1] === '}') res.splice(k, 1);    // {a:b;} = {a:b}: the last declaration of a block needs no semicolon
  if (!scss) return res;
  // Sass: a comma in front of ")" means something only in a list of one — (1px,) is a list, (1px) is not
  const fin = [], stack = [];
  for (let k = 0; k < res.length; k++) {
    const t = res[k], top = stack[stack.length - 1];
    if (t === '(') stack.push({ more: false });
    else if (t === ')') stack.pop();
    else if (t === ':' && top) top.more = true;
    else if (t === ',' && top) { if (res[k + 1] === ')' && top.more) continue; top.more = true; }
    fin.push(t);
  }
  return fin;
}
const close = (v, open) => { let d = 0; for (let j = open; j < v.length; j++) { if (v[j] === '{') d++; else if (v[j] === '}' && --d === 0) return j; } return v.length; };
/** A selector. Allowed: white space around the combinators > + ~ and the comma, inside ( ) and [ ]; one quote style
 *  in [attr="value"]; An+B without spaces; the names of pseudo-classes and pseudo-elements in lower case. */
export function cssSelector(s, scss = false) {
  let out = '', i = 0; const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '*') { const j = s.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; out += ' '; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < n && s[j] !== c) j += s[j] === '\\' ? 2 : 1; out += `"${s.slice(i + 1, j)}"`; i = j + 1; continue; }
    if (c === '[') {
      const j = s.indexOf(']', i), body = s.slice(i + 1, j < 0 ? n : j);
      const m = /^\s*([^\s=~|^$*]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))\s*([a-zA-Z])?\s*)?$/.exec(body);
      out += m ? `[${m[1]}${m[2] ? `${m[2]}"${m[3] ?? m[4] ?? m[5]}"${m[6] ? ` ${m[6].toLowerCase()}` : ''}` : ''}]` : `[${body.replace(/\s+/g, ' ').replace(/'/g, '"').trim()}]`;
      i = (j < 0 ? n : j) + 1; continue;
    }
    if (scss && c === '#' && s[i + 1] === '{') { const k = close(s, i + 1); out += `#{${cssTokens(s.slice(i + 2, k), true).join('')}}`; i = k + 1; continue; }
    out += c; i++;
  }
  return out.replace(/::?[A-Za-z][\w-]*/g, (m) => m.toLowerCase()).replace(/\s+/g, ' ').replace(/\s*([>+~,])\s*/g, '$1').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/(\d*n)\s*([+-])\s*(\d)/g, '$1$2$3').replace(/,$/, '').trim();
}
/** Every comment of a style sheet, wherever it stands (strings and url( ) are stepped over). */
export function cssComments(text, scss = false) {
  const out = []; const n = text.length; let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '"' || c === "'") { i++; while (i < n && text[i] !== c && text[i] !== '\n') i += text[i] === '\\' ? 2 : 1; i++; continue; }
    if (/^url\(/i.test(text.slice(i, i + 4)) && !/^\s*["']/.test(text.slice(i + 4))) { const k = text.indexOf(')', i); i = k < 0 ? n : k + 1; continue; }
    if (c === '/' && text[i + 1] === '*') { const j = text.indexOf('*/', i + 2), e = j < 0 ? n : j + 2; out.push(text.slice(i, e).split('\n').map((l) => l.trim()).join('\n')); i = e; continue; }
    if (scss && c === '/' && text[i + 1] === '/') { let j = text.indexOf('\n', i); if (j < 0) j = n; out.push(text.slice(i, j).trim()); i = j; continue; }
    i++;
  }
  return out;
}
export function styleSheet(text, scss = false) {
  const out = [];
  const root = postcss().process(text, { syntax: scss ? scssSyntax : undefined, from: undefined }).root;
  const walk = (node) => {
    for (const n of node.nodes || []) {
      if (n.type === 'decl') {
        // a property's name is not case-sensitive; a custom property's and a Sass variable's is
        const plain = !/^(--|\$)|[#$@]/.test(n.prop);
        out.push(`${plain ? n.prop.toLowerCase() : n.prop}: ${cssTokens(n.value, scss).join('')}${n.important ? ' !important' : ''}`);
        if (n.nodes) { out.push('{'); walk(n); out.push('}'); }                        // Sass: nested properties
      } else if (n.type === 'rule') { out.push(`${cssSelector(n.selector, scss)} {`); walk(n); out.push('}'); }
      else if (n.type === 'atrule') { out.push(`@${n.name.toLowerCase()} ${cssTokens(n.params, scss).join('')}${n.nodes ? ' {' : ''}`); if (n.nodes) { walk(n); out.push('}'); } }
    }
  };
  walk(root);
  return { rules: out, comments: cssComments(text, scss) };
}
function sameStyle(a, b, scss) {
  let x; try { x = styleSheet(a, scss); } catch { return 'skip'; }
  let y; try { y = styleSheet(b, scss); } catch (e) { return `the result does not parse: ${String(e.message).slice(0, 100)}`; }
  return diffList(x.rules, y.rules, 'the rules') || diffList(x.comments, y.comments, 'the comments');
}

// ───────────────────────────────────────────────────────────── YAML
/** The data of every document (maps in their order, every value with its type) and the comments. */
export function yamlData(text) {
  const docs = YAML.parseAllDocuments(text, { merge: false, uniqueKeys: false });
  if (docs.errors?.length) throw new Error(docs.errors[0].message);
  const comments = [];
  const note = (c) => { if (c) for (const l of String(c).split('\n')) if (l.trim()) comments.push(l.trim()); };
  const data = [];
  const val = (n) => {
    if (n == null) return 'null:';
    if (YAML.isAlias(n)) return `alias:${n.source}`;
    note(n.commentBefore); note(n.comment);
    const tag = n.tag && !/^tag:yaml\.org,2002:(str|int|float|bool|null|map|seq)$/.test(n.tag) ? `${n.tag} ` : '', anchor = n.anchor ? `&${n.anchor} ` : '';
    if (YAML.isMap(n)) return `${anchor}${tag}{${n.items.map((p) => { const k = val(p.key), v = val(p.value); return `${k} => ${v}`; }).join(', ')}}`;
    if (YAML.isSeq(n)) return `${anchor}${tag}[${n.items.map((p) => (YAML.isPair(p) ? `${val(p.key)} => ${val(p.value)}` : val(p))).join(', ')}]`;
    const v = n.value;
    return `${anchor}${tag}${v === null ? 'null' : typeof v}:${typeof v === 'number' || typeof v === 'bigint' ? (Object.is(v, -0) ? '-0' : String(v)) : JSON.stringify(v)}`;
  };
  for (const d of docs) {
    if (d.errors.length) throw new Error(d.errors[0].message);
    note(d.commentBefore); note(d.comment);
    data.push(val(d.contents));
  }
  return { data, comments: comments.sort() };
}
function sameYaml(a, b) {
  let x; try { x = yamlData(a); } catch { return 'skip'; }
  let y; try { y = yamlData(b); } catch (e) { return `the result is not YAML: ${String(e.message).slice(0, 100)}`; }
  return diffList(x.data, y.data, 'the documents') || diffList(x.comments, y.comments, 'the comments');
}

// ───────────────────────────────────────────────────────────── Markdown
/** The page a Markdown text renders to (marked, GitHub flavour), tag by tag; white space between tags aside, text
 *  inside <pre> exactly. Front matter (--- … --- at the top) is compared as YAML. */
export function markdownPage(text) {
  let front = null;
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (m) { try { front = yamlData(m[1]).data.join('\n'); text = text.slice(m[0].length); } catch { /* not front matter */ } }
  const html = marked.parse(text.replace(/\r\n/g, '\n'), { gfm: true, async: false });
  // allowed: white space between block tags and around comments; in a code block, white space at the end of a line (it does not show)
  const parts = html.split(/(<pre>[\s\S]*?<\/pre>)/).map((p, i) => (i % 2 ? p.replace(/[ \t]+$/gm, '') : p.replace(/\s+/g, ' ').replace(/ ?(<\/?(?:p|ul|ol|li|h\d|table|thead|tbody|tr|th|td|blockquote|hr|pre|div|details|summary|br)\b[^>]*>|<!--[\s\S]*?-->) ?/g, '$1')));
  return { front, html: parts.join('').trim().split(/(?=<)/) };
}
function sameMarkdown(a, b) {
  let x; try { x = markdownPage(a); } catch { return 'skip'; }
  const y = markdownPage(b);
  if (x.front !== y.front) return 'the front matter differs';
  return diffList(x.html, y.html, 'the rendered page');
}

// ───────────────────────────────────────────────────────────── HTML
// Elements a browser lays out as blocks (or does not show): white space next to their tags is not shown.
const BLOCK = new Set(('html head body div p ul ol li dl dt dd table thead tbody tfoot tr td th caption colgroup col h1 h2 h3 h4 h5 h6 section article aside nav header footer main figure figcaption blockquote pre form fieldset legend address hr details summary dialog menu title meta link base script style noscript option optgroup br center hgroup search source track param area template slot iframe video audio picture canvas '
  + 'svg math').split(' '));
// … and elements laid out as a box in the line: white space just inside their tags is not shown
const BOX = new Set('button select textarea label text'.split(' '));
const RAW = new Set(['pre', 'textarea', 'listing', 'plaintext', 'xmp']);
const JS_TYPE = /^(|module|(text|application)\/(javascript|ecmascript|babel|jsx))$/i, JSON_TYPE = /json$|^importmap$|^speculationrules$/i;
const attr = (n, name) => (n.attrs || []).find((a) => a.name === name)?.value;
function domStream(root, { vue = false } = {}) {
  const out = [];   // strings; ' ' = white space that shows
  const ws = () => { if (out.length && out[out.length - 1] !== ' ') out.push(' '); };
  const text = (t) => { const parts = t.split(/[ \t\n\r\f]+/); parts.forEach((w, i) => { if (i > 0) ws(); if (w) out.push(`t:${w}`); }); };
  const walk = (n, inSvg) => {
    if (n.nodeName === '#text') { text(n.value); return; }
    if (n.nodeName === '#comment') { out.push(`<!--${/^\[if\b/.test(n.data) ? n.data.replace(/\s+/g, '') : n.data.replace(/\s+/g, ' ').trim()}-->`); return; }
    if (n.nodeName === '#documentType') { out.push(`<!doctype ${n.name} ${n.publicId} ${n.systemId}>`); return; }
    if (!n.tagName) { (n.childNodes || []).forEach((c) => walk(c, inSvg)); return; }
    const tag = n.tagName, svg = inSvg || tag === 'svg' || tag === 'math';
    // in a drawing and in a formula white space shows only inside a run of text
    const run = inSvg === 'text' || (svg && tag === 'text') ? 'text' : svg;
    const block = (!inSvg && BLOCK.has(tag)) || (svg && run !== 'text') ;
    const attrs = (n.attrs || []).map((a) => `${a.name}=${attrValue(tag, a.name, a.value)}`).sort().join(' ');
    out.push(`${block ? 'B' : BOX.has(tag) ? 'X' : 'I'}<${tag}${attrs ? ` ${attrs}` : ''}>`);
    const raw = () => (n.childNodes || []).map((c) => c.value ?? '').join('');
    if (tag === 'script') { const type = attr(n, 'type') ?? ''; out.push(JS_TYPE.test(type) ? `js:${embedded(raw(), attr(n, 'lang') === 'ts' ? 'ts' : 'js')}` : JSON_TYPE.test(type) ? `json:${embeddedJson(raw())}` : `raw:${raw().trim()}`); }
    else if (tag === 'style') out.push(`css:${embeddedCss(raw(), attr(n, 'lang') === 'scss')}`);
    else if (RAW.has(tag)) out.push(`raw:${serialize(n)}`);
    else (n.content?.childNodes || n.childNodes || []).forEach((c) => walk(c, tag === 'foreignObject' ? false : run));
    out.push(`${block ? 'B' : BOX.has(tag) ? 'X' : 'I'}</${tag}>`);
  };
  walk(root, false);
  // white space that does not show: at the ends, next to a block's tags, just inside a box's tags
  const res = [];
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== ' ') { res.push(out[i]); continue; }
    const p = out[i - 1], q = out[i + 1];
    if (p === undefined || q === undefined) continue;
    if (/^B<\/?/.test(p) || /^B<\/?/.test(q) || /^<!doctype/.test(p) || /^X<[^/]/.test(p) || /^X<\//.test(q)) continue;
    if (/^<!--/.test(p) && (res.length === 0 || /^B<\/?/.test(res[res.length - 1] ?? 'B<'))) continue;
    res.push(' ');
  }
  return res.map((s) => s.replace(/^[BXI]</, '<'));
}
const serialize = (n) => (n.childNodes || []).map((c) => (c.nodeName === '#text' ? c.value : c.tagName ? `<${c.tagName}>${serialize(c)}</${c.tagName}>` : '')).join('');
const loose = (code) => `raw:${code.replace(/\s+/g, '')}`;   // code the reader cannot read (a template language inside): its text without white space
const embedded = (code, ext) => { try { const p = program(code, ext); return p.errs ? loose(code) : `${p.shape.join(' ')} | ${p.comments.join(' | ')}`; } catch { return loose(code); } };
const embeddedJson = (code) => { try { const j = jsonTokens(code); return j.toks.join(' '); } catch { return loose(code); } };
const embeddedCss = (code, scss) => { try { const s = styleSheet(code, scss); return `${s.rules.join(' ')} | ${s.comments.join(' | ')}`; } catch { return loose(code); } };
/** An attribute's value. Allowed: class — the names, however spaced; style — its declarations as CSS; on… — the
 *  JavaScript it is; srcset and sizes — white space around the commas. Everything else exactly. */
function attrValue(tag, name, value) {
  if (name === 'class') return value.split(/\s+/).filter(Boolean).join(' ');
  if (name === 'style') { try { return styleSheet(`a{${value}}`).rules.slice(1, -1).join('; '); } catch { return value; } }
  if (/^on[a-z]+$/.test(name)) { try { const a = program(`function f(){${value}\n}`, 'js'); if (!a.errs) return `js:${a.shape.join(' ')}`; } catch { /* as text */ } return value; }
  if (name === 'srcset' || name === 'sizes' || name === 'imagesrcset' || name === 'imagesizes') return value.split(',').map((s) => s.replace(/\s+/g, ' ').trim()).join(',');
  return value;
}
export const htmlDocument = (text) => domStream(parse5.parse(text, { scriptingEnabled: false }));
function sameHtml(a, b) {
  let x; try { x = htmlDocument(a); } catch { return 'skip'; }
  return diffList(x, htmlDocument(b), 'the document');
}

// ───────────────────────────────────────────────────────────── GraphQL
export function graphqlDocument(text) {
  const printed = gql.print(gql.parse(text, { noLocation: false }));
  const comments = []; const lexer = new gql.Lexer(new gql.Source(text));
  let t = lexer.token; while (t.kind !== gql.TokenKind.EOF) t = lexer.advance();
  for (; t; t = t.prev) if (t.kind === gql.TokenKind.COMMENT) comments.push(String(t.value).trim());
  return { printed: printed.split('\n'), comments: comments.reverse() };
}
function sameGraphql(a, b) {
  let x; try { x = graphqlDocument(a); } catch { return 'skip'; }
  let y; try { y = graphqlDocument(b); } catch (e) { return `the result does not parse: ${String(e.message).slice(0, 100)}`; }
  return diffList(x.printed, y.printed, 'the document') || diffList(x.comments, y.comments, 'the comments');
}

// ───────────────────────────────────────────────────────────── Vue
/** An expression in a template: the JavaScript it is (v-for's "x in list" by its two halves); when it is not
 *  JavaScript, its text without white space. */
function vueExpr(src, kind) {
  const js = (code) => { const p = program(code, 'ts'); if (p.errs) throw new Error('no'); return p.shape.slice(1, -1).join(' '); };
  try {
    if (kind === 'for') { const m = /^([\s\S]*?)\s+(in|of)\s+([\s\S]*)$/.exec(src); if (m) return `${js(`(${m[1].replace(/^\s*\(([\s\S]*)\)\s*$/, '$1')}) => 0`)} ${m[2]} ${js(`(${m[3]})`)}`; }
    if (kind === 'slot') return js(`(${src}) => 0`);
    try { return js(`(${src})`); } catch { return js(src); }
  } catch { return `text:${src.replace(/\s+/g, '').replace(/["']/g, '"')}`; }
}
function vueTemplate(ast) {
  const out = [];
  const ws = () => { if (out.length && out[out.length - 1] !== ' ') out.push(' '); };
  const walk = (n, raw) => {
    if (n.type === 2) { if (raw) { out.push(`raw:${n.content}`); return; } n.content.split(/[ \t\n\r\f]+/).forEach((w, i) => { if (i > 0) ws(); if (w) out.push(`t:${w}`); }); return; }
    if (n.type === 3) { out.push(`<!--${n.content.replace(/\s+/g, ' ').trim()}-->`); return; }
    if (n.type === 5) { out.push(`{{${vueExpr(n.content.loc.source)}}}`); return; }
    if (n.type !== 1) { (n.children || []).forEach((c) => walk(c, raw)); return; }
    const tag = n.tag, block = BLOCK.has(tag), mark = block ? 'B' : BOX.has(tag) ? 'X' : 'I';
    const props = n.props.map((p) => {
      if (p.type === 6) return `${p.name}=${p.value ? attrValue(tag, p.name, p.value.content) : ''}`;
      const name = p.rawName ?? p.name, exp = p.exp?.loc.source;
      return `${name}=${exp == null ? '' : vueExpr(exp, p.name === 'for' ? 'for' : p.name === 'slot' ? 'slot' : '')}`;
    }).sort().join(' ');
    out.push(`${mark}<${tag}${props ? ` ${props}` : ''}>`);
    n.children.forEach((c) => walk(c, raw || RAW.has(tag)));
    out.push(`${mark}</${tag}>`);
  };
  ast.children.forEach((c) => walk(c, false));
  const res = [];
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== ' ') { res.push(out[i]); continue; }
    const p = out[i - 1], q = out[i + 1];
    if (p === undefined || q === undefined || /^B<\/?/.test(p) || /^B<\/?/.test(q) || /^X<[^/]/.test(p) || /^X<\//.test(q)) continue;
    res.push(' ');
  }
  return res.map((s) => s.replace(/^[BXI]</, '<'));
}
export function vueFile(text) {
  const { descriptor: d, errors } = parseSfc(text, { templateParseOptions: { whitespace: 'preserve', comments: true } });
  if (errors.length) throw new Error(String(errors[0].message ?? errors[0]));
  const out = [];
  const attrs = (b) => Object.entries(b.attrs).map(([k, v]) => `${k}=${v === true ? '' : v}`).sort().join(' ');
  if (d.template) out.push(`<template ${attrs(d.template)}>`, ...((d.template.lang && d.template.lang !== 'html') ? [`raw:${d.template.content.trim()}`] : vueTemplate(d.template.ast)));
  for (const s of [d.script, d.scriptSetup]) if (s) out.push(`<script ${attrs(s)}>`, `js:${embedded(s.content, /^tsx?$/.test(s.lang ?? '') ? s.lang : 'js')}`);
  for (const s of d.styles) out.push(`<style ${attrs(s)}>`, (!s.lang || s.lang === 'css' || s.lang === 'scss' || s.lang === 'postcss') ? `css:${embeddedCss(s.content, s.lang === 'scss')}` : s.lang === 'less' ? loose(s.content).replace(/;\}/g, '}') : `raw:${s.content.trim()}`);
  for (const c of d.customBlocks) out.push(`<${c.type} ${attrs(c)}>`, c.lang === 'json' ? `json:${embeddedJson(c.content)}` : `raw:${c.content.trim()}`);
  const comments = [...text.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());
  return { blocks: out, comments };
}
function sameVue(a, b) {
  let x; try { x = vueFile(a); } catch { return 'skip'; }
  let y; try { y = vueFile(b); } catch (e) { return `the result does not parse: ${String(e.message).slice(0, 100)}`; }
  return diffList(x.blocks, y.blocks, 'the blocks') || diffList(x.comments, y.comments, 'the comments');
}

// ───────────────────────────────────────────────────────────── all of them
/** lang: js, ts, tsx, json, css, scss, yaml, markdown, html, graphql, vue */
export function same(lang, before, after) {
  switch (lang) {
    case 'js': case 'jsx': return sameProgram(before, after, 'js');
    case 'ts': case 'tsx': return sameProgram(before, after, lang);
    case 'json': return sameJson(before, after);
    case 'css': return sameStyle(before, after, false);
    case 'scss': return sameStyle(before, after, true);
    case 'yaml': return sameYaml(before, after);
    case 'markdown': return sameMarkdown(before, after);
    case 'html': return sameHtml(before, after);
    case 'graphql': return sameGraphql(before, after);
    case 'vue': return sameVue(before, after);
    default: throw new Error(`no reader for ${lang}`);
  }
}
