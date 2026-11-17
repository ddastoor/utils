//! JSON → types: TypeScript interfaces, Go structs, Rust structs (serde), Java records, Python dataclasses.
//! Works on the lossless tree of jsonfmt.rs, so 18446744073709551615 is known to be too big for a signed 64-bit integer
//! (JSON.parse had already rounded it) and duplicate keys are seen.
//! Op "j2t:<lang>:<root name>" (lang ts | go | rust | java | py); input = the JSON text.
//! Output JSON { "out": "<code>", "types": <number of named types>, "root": "<root type name>", "notes": ["…"] }; a JSON problem comes back as
//! Err(JSON { "message", "line", "column", "pos" }) like jsonfmt.
//!
//! What "correct" means here (checked by tests that run tsc, go, rustc, javac and python on the output):
//! * every output compiles, whatever the keys are (reserved words, names that collide after conversion — user_id and
//!   userId —, keys that are not identifiers, non-Latin keys, type names that would shadow String / List / Option);
//! * the sample itself fits the root type: a top-level array is `type Order = Item[]`, not an invented wrapper;
//! * Go and Rust map every key exactly (struct tags, #[serde(rename)]); where Go's encoding/json cannot express a key
//!   in a tag (comma, quote, combining marks) the field says so instead of silently not matching;
//! * Java and Python have no built-in way to rename a field, so a key that is a valid name is kept as it is (the record
//!   / dataclass then matches the JSON without configuration) and only invalid ones are renamed, with a comment.
use crate::jsonfmt::{parse, unescape, Node};
use crate::{js, R};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use unicode_general_category::{get_general_category, GeneralCategory as GC};

#[derive(Clone, Copy, PartialEq)]
enum Lang { Ts, Go, Rust, Java, Py }

/// One alternative of a type. Int(true) = a negative whole number was seen.
#[derive(Clone)]
enum K { Bool, Int(bool), UInt, Big, Float, Str, Arr(Box<Ty>), Obj(Box<ObjT>), Map }
/// A type = the alternatives seen (at most one per class: boolean, number, string, array, object) + "null was seen".
/// No alternative and no null = unknown (the elements of an empty array).
#[derive(Clone, Default)]
struct Ty { null: bool, alts: Vec<K> }
#[derive(Clone)]
struct Field { key: String, t: Ty, optional: bool }
#[derive(Clone)]
struct ObjT { hint: String, name: String, fields: Vec<Field> }

fn class(k: &K) -> u8 { match k { K::Bool => 0, K::Int(_) | K::UInt | K::Big | K::Float => 1, K::Str => 2, K::Arr(_) => 3, K::Obj(_) | K::Map => 4 } }

// ------------------------------------------------------------------ names
/// "line_items" → "LineItems", "deliveredAt" → "DeliveredAt"; only ASCII letters and digits survive. A non-ASCII
/// letter is dropped without starting a new word ("größe" → "Gre", not "GrE").
fn pascal_raw(s: &str) -> String {
    let mut o = String::new(); let mut up = true;
    for c in s.chars() { if c.is_ascii_alphanumeric() { if up { o.push(c.to_ascii_uppercase()); } else { o.push(c); } up = false; } else if !c.is_alphanumeric() { up = true; } }
    o
}
/// As a type name: a leading digit gets an N in front.
fn pascal(s: &str) -> String { let mut o = pascal_raw(s); if o.starts_with(|c: char| c.is_ascii_digit()) { o.insert(0, 'N'); } o }
/// "first-name" / "firstName" → "first_name"
fn snake(s: &str) -> String {
    let mut o = String::new(); let mut prev = ' ';
    for c in s.chars() {
        if c.is_ascii_alphanumeric() { if c.is_ascii_uppercase() && (prev.is_ascii_lowercase() || prev.is_ascii_digit()) { o.push('_'); } o.push(c.to_ascii_lowercase()); }
        else if !c.is_alphanumeric() && !o.is_empty() && !o.ends_with('_') { o.push('_'); }
        prev = c;
    }
    while o.ends_with('_') { o.pop(); }
    o
}
fn camel(s: &str) -> String { let p = pascal_raw(s); let mut c = p.chars(); match c.next() { Some(f) => f.to_ascii_lowercase().to_string() + c.as_str(), None => p } }

const IRREGULAR: &[(&str, &str)] = &[("people", "person"), ("children", "child"), ("men", "man"), ("women", "woman"), ("feet", "foot"), ("teeth", "tooth"), ("mice", "mouse"), ("geese", "goose"),
    ("criteria", "criterion"), ("phenomena", "phenomenon"), ("indices", "index"), ("vertices", "vertex"), ("matrices", "matrix"), ("analyses", "analysis"), ("crises", "crisis"), ("diagnoses", "diagnosis"),
    ("theses", "thesis"), ("hypotheses", "hypothesis"), ("parentheses", "parenthesis"), ("axes", "axis"), ("quizzes", "quiz"), ("shelves", "shelf"), ("leaves", "leaf"), ("knives", "knife"), ("wives", "wife"),
    ("lives", "life"), ("wolves", "wolf"), ("halves", "half"), ("selves", "self"), ("thieves", "thief"), ("loaves", "loaf"), ("calves", "calf"), ("scarves", "scarf"), ("oxen", "ox"), ("menus", "menu")];
/// Words that end in s but are one thing (or have no singular).
const SAME: &[&str] = &["bias", "alias", "atlas", "canvas", "gas", "lens", "news", "series", "species", "chaos", "kudos", "physics", "mathematics", "economics", "analytics", "statistics", "logistics",
    "electronics", "politics", "ethics", "always", "across", "perhaps", "whereas", "was", "has", "does", "goes", "yes", "its", "this", "thus", "plus", "minus"];
const IE_WORDS: &[&str] = &["movies", "cookies", "calories", "zombies", "selfies", "rookies", "brownies", "hoodies", "smoothies", "genies", "ties", "pies", "lies", "dies", "newbies", "freebies", "birdies"];
const US_WORDS: &[&str] = &["status", "bonus", "virus", "campus", "bus", "census", "focus", "corpus", "nexus", "radius", "consensus", "apparatus", "chorus", "plus", "minus"];
const S_WORDS: &[&str] = &["lens", "gas", "alias", "bias", "atlas", "canvas"];
const CHE_WORDS: &[&str] = &["caches", "niches", "headaches", "avalanches", "cliches", "psyches", "moustaches", "mustaches"];
const O_WORDS: &[&str] = &["hero", "potato", "tomato", "echo", "veto", "torpedo", "mosquito", "volcano", "tornado", "cargo", "embargo", "domino", "mango"];
/// The singular of a lower-case word, or None when the word is not a plural we recognise.
fn singular_word(w: &str) -> Option<String> {
    if w.len() < 3 { return None; }
    if let Some((_, s)) = IRREGULAR.iter().find(|(p, _)| *p == w) { return Some((*s).to_string()); }
    if SAME.contains(&w) || !w.ends_with('s') || w.ends_with("ss") || w.ends_with("us") || w.ends_with("is") { return None; }
    let cut = |n: usize| Some(w[..w.len() - n].to_string());
    if w.ends_with("ies") { return if IE_WORDS.contains(&w) || w.len() < 5 { cut(1) } else { Some(format!("{}y", &w[..w.len() - 3])) }; }
    if w.ends_with("uses") && US_WORDS.contains(&&w[..w.len() - 2]) { return cut(2); }
    if w.ends_with("ses") && S_WORDS.contains(&&w[..w.len() - 2]) { return cut(2); }
    if w.ends_with("sses") || w.ends_with("shes") || w.ends_with("xes") || w.ends_with("zzes") { return cut(2); }
    if w.ends_with("ches") { return if w == "aches" || CHE_WORDS.iter().any(|c| w.ends_with(c)) { cut(1) } else { cut(2) }; }
    if w.ends_with("oes") { return if O_WORDS.contains(&&w[..w.len() - 2]) { cut(2) } else { cut(1) }; }
    cut(1)
}
/// The name for one element of the list called `key`: "items" → "item", "lineItems" → "lineItem", "people" →
/// "person"; a word that is not a plural gets "Item" appended ("data" → "dataItem", "status" → "statusItem").
fn element_hint(key: &str) -> String {
    let b = key.as_bytes(); let mut i = b.len();
    // the plural of an acronym: IDs → ID, URLs → URL
    if i >= 3 && b[i - 1] == b's' && b[i - 2].is_ascii_uppercase() && b[i - 3].is_ascii_uppercase() { return key[..i - 1].to_string(); }
    // the last word: letters back to a non-letter, or to the capital that starts it (camelCase)
    while i > 0 && b[i - 1].is_ascii_lowercase() { i -= 1; }
    if i > 0 && b[i - 1].is_ascii_uppercase() && i < b.len() { i -= 1; }
    let tail = &key[i..];
    match singular_word(&tail.to_ascii_lowercase()) {
        Some(s) if !tail.is_empty() => { let mut t = s; if tail.as_bytes()[0].is_ascii_uppercase() { t = t[..1].to_ascii_uppercase() + &t[1..]; } format!("{}{t}", &key[..i]) }
        _ => format!("{key}Item"),
    }
}

/// Type names that would shadow something the generated code (or the reader) relies on.
const RESERVED_TYPES: &[&str] = &["String", "Number", "Boolean", "Object", "Array", "Date", "Function", "Symbol", "Record", "Map", "Set", "Promise", "Error", "BigInt", "Partial", "Required", "Readonly",
    "Pick", "Omit", "Exclude", "Extract", "Option", "Vec", "Box", "Some", "None", "Ok", "Err", "Result", "Self", "Value", "Serialize", "Deserialize", "Default", "Debug", "Clone", "Long", "Double",
    "Integer", "Float", "Short", "Byte", "Character", "Void", "Math", "System", "Class", "Enum", "List", "Any", "True", "False", "Dict", "Optional", "Type", "Union", "Tuple", "BigInteger", "Iterable"];
const RUST_KW: &[&str] = &["as", "break", "const", "continue", "crate", "else", "enum", "extern", "false", "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod", "move", "mut", "pub", "ref", "return",
    "self", "static", "struct", "super", "trait", "true", "type", "unsafe", "use", "where", "while", "async", "await", "dyn", "abstract", "become", "box", "do", "final", "macro", "override", "priv",
    "typeof", "unsized", "virtual", "yield", "try", "gen"];
const JAVA_KW: &[&str] = &["abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const", "continue", "default", "do", "double", "else", "enum", "extends", "final", "finally",
    "float", "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long", "native", "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp",
    "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void", "volatile", "while", "true", "false", "null", "_",
    // not allowed as the name of a record component (JLS 8.10.1)
    "clone", "finalize", "getClass", "hashCode", "notify", "notifyAll", "toString", "wait"];
const PY_KW: &[&str] = &["False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "global", "if",
    "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield"];

fn ascii_ident(k: &str, dollar: bool) -> bool { let mut c = k.chars(); c.next().map_or(false, |f| f.is_ascii_alphabetic() || f == '_' || (dollar && f == '$')) && c.all(|x| x.is_ascii_alphanumeric() || x == '_' || (dollar && x == '$')) }
/// A name Python accepts as it is: an identifier (PEP 3131: XID_Start / XID_Continue), not a keyword, and not a
/// "__private" name (those are rewritten inside a class body).
fn py_ident(k: &str) -> bool { let mut c = k.chars(); c.next().map_or(false, |f| f == '_' || unicode_ident::is_xid_start(f)) && c.all(unicode_ident::is_xid_continue) && !PY_KW.contains(&k) && !k.starts_with("__") }
/// Go's encoding/json accepts a tag name made of letters, digits and this punctuation (isValidTag in encode.go).
fn go_tag_ok(k: &str) -> bool {
    !k.is_empty() && k.chars().all(|c| "!#$%&()*+-./:;<=>?@[]^_{|}~ ".contains(c)
        || matches!(get_general_category(c), GC::UppercaseLetter | GC::LowercaseLetter | GC::TitlecaseLetter | GC::ModifierLetter | GC::OtherLetter | GC::DecimalNumber))
}
/// Characters that must not appear raw in generated source: controls, line separators, zero-width and bidi marks.
fn special(c: char) -> bool { let u = c as u32; u < 0x20 || (0x7f..=0x9f).contains(&u) || matches!(u, 0x200b..=0x200f | 0x2028..=0x202e | 0x2060..=0x206f | 0xfeff | 0xfff9..=0xfffb) }
/// "…" with JSON escapes (valid in TypeScript, and readable in a comment of any language).
fn quote(s: &str) -> String {
    let mut o = String::from("\"");
    for c in s.chars() { match c { '"' => o.push_str("\\\""), '\\' => o.push_str("\\\\"), '\n' => o.push_str("\\n"), '\r' => o.push_str("\\r"), '\t' => o.push_str("\\t"), c if special(c) => o.push_str(&format!("\\u{:04x}", c as u32)), c => o.push(c) } }
    o.push('"'); o
}
/// A Rust string literal.
fn rust_str(s: &str) -> String {
    let mut o = String::from("\"");
    for c in s.chars() { match c { '"' => o.push_str("\\\""), '\\' => o.push_str("\\\\"), '\n' => o.push_str("\\n"), '\r' => o.push_str("\\r"), '\t' => o.push_str("\\t"), c if special(c) => o.push_str(&format!("\\u{{{:x}}}", c as u32)), c => o.push(c) } }
    o.push('"'); o
}

// ------------------------------------------------------------------ inference
fn merge_k(a: K, b: K) -> K {
    match (a, b) {
        (K::Float, _) | (_, K::Float) => K::Float,
        (K::Big, _) | (_, K::Big) => K::Big,
        (K::Int(x), K::Int(y)) => K::Int(x || y),
        (K::UInt, K::UInt) => K::UInt,
        (K::Int(neg), K::UInt) | (K::UInt, K::Int(neg)) => if neg { K::Big } else { K::UInt },
        (K::Arr(x), K::Arr(y)) => K::Arr(Box::new(merge(*x, *y))),
        (K::Map, K::Map) => K::Map,
        // {} next to an object with members: every member may be missing
        (K::Map, K::Obj(mut o)) | (K::Obj(mut o), K::Map) => { for f in o.fields.iter_mut() { f.optional = true; } K::Obj(o) }
        (K::Obj(mut x), K::Obj(y)) => {
            let mut seen: HashSet<String> = HashSet::new();
            for f in y.fields {
                seen.insert(f.key.clone());
                match x.fields.iter().position(|g| g.key == f.key) {
                    Some(i) => { let g = &mut x.fields[i]; g.optional |= f.optional; g.t = merge(std::mem::take(&mut g.t), f.t); }
                    None => x.fields.push(Field { optional: true, ..f }),
                }
            }
            for g in x.fields.iter_mut() { if !seen.contains(&g.key) { g.optional = true; } }
            K::Obj(x)
        }
        (a, _) => a, // same class, same kind (Bool, Str)
    }
}
fn merge(mut a: Ty, b: Ty) -> Ty {
    a.null |= b.null;
    for k in b.alts { match a.alts.iter().position(|x| class(x) == class(&k)) { Some(i) => { let old = a.alts.remove(i); a.alts.insert(i, merge_k(old, k)); } None => a.alts.push(k) } }
    a
}
struct Seen { dup: bool, uint: bool, big: bool }
fn infer(n: &Node, hint: &str, in_array: bool, seen: &mut Seen) -> Ty {
    match n {
        Node::Lit(t) => {
            let k = if t.starts_with('"') { K::Str } else if *t == "true" || *t == "false" { K::Bool } else if *t == "null" { return Ty { null: true, alts: Vec::new() }; }
                else if t.contains(|c| c == '.' || c == 'e' || c == 'E') { K::Float }
                else if let Ok(v) = t.parse::<i64>() { K::Int(v < 0) } else if t.parse::<u64>().is_ok() { seen.uint = true; K::UInt } else { seen.big = true; K::Big };
            Ty { null: false, alts: vec![k] }
        }
        Node::Arr(a) => {
            let h = if in_array { hint.to_string() } else { element_hint(hint) };
            let mut e: Option<Ty> = None;
            for x in a { let t = infer(x, &h, true, seen); e = Some(match e { Some(p) => merge(p, t), None => t }); }
            Ty { null: false, alts: vec![K::Arr(Box::new(e.unwrap_or_default()))] }
        }
        Node::Obj(m) => {
            if m.is_empty() { return Ty { null: false, alts: vec![K::Map] }; }
            let mut fields: Vec<Field> = Vec::new();
            for (k, v) in m {
                let key = unescape(k); let t = infer(v, &key, false, seen);
                match fields.iter().position(|f| f.key == key) { Some(i) => { seen.dup = true; let f = &mut fields[i]; f.t = merge(std::mem::take(&mut f.t), t); } None => fields.push(Field { key, t, optional: false }) }
            }
            Ty { null: false, alts: vec![K::Obj(Box::new(ObjT { hint: hint.to_string(), name: String::new(), fields }))] }
        }
    }
}

// ------------------------------------------------------------------ naming the object types
fn sig_ty(t: &Ty, o: &mut String) {
    if t.null { o.push('?'); }
    for k in &t.alts { match k { K::Bool => o.push('b'), K::Int(_) => o.push('i'), K::UInt => o.push('u'), K::Big => o.push('g'), K::Float => o.push('f'), K::Str => o.push('s'), K::Map => o.push('m'),
        K::Arr(e) => { o.push('['); sig_ty(e, o); o.push(']'); } K::Obj(x) => sig_obj(x, o) } }
    o.push(';');
}
fn sig_obj(x: &ObjT, o: &mut String) { o.push('{'); for f in &x.fields { o.push_str(&quote(&f.key)); if f.optional { o.push('?'); } o.push(':'); sig_ty(&f.t, o); } o.push('}'); }
struct Namer { lang: Lang, used: HashSet<String>, by_sig: HashMap<(String, String), String> }
impl Namer {
    fn unions(&self) -> bool { matches!(self.lang, Lang::Ts | Lang::Py) }
    fn fresh(&mut self, base: &str) -> String { let mut n = base.to_string(); let mut i = 2; while !self.used.insert(n.clone()) { n = format!("{base}{i}"); i += 1; } n }
    fn ty(&mut self, t: &mut Ty) {
        if t.alts.len() > 1 && !self.unions() { return; } // shown as a dynamic type: its parts get no named types
        for k in t.alts.iter_mut() { match k { K::Arr(e) => self.ty(e), K::Obj(o) => self.obj(o), _ => {} } }
    }
    fn obj(&mut self, o: &mut ObjT) {
        let mut base = pascal(&o.hint); if base.is_empty() { base = "Item".into(); }
        if RESERVED_TYPES.contains(&base.as_str()) { base.push_str("Data"); }
        let mut sig = String::new(); sig_obj(o, &mut sig);
        // the same name with the same members (two "address" objects) is one type
        o.name = match self.by_sig.get(&(base.clone(), sig.clone())) { Some(n) => n.clone(), None => { let n = self.fresh(&base); self.by_sig.insert((base, sig), n.clone()); n } };
        for f in o.fields.iter_mut() { self.ty(&mut f.t); }
    }
}
fn gather<'a>(t: &'a Ty, unions: bool, seen: &mut HashSet<&'a str>, out: &mut Vec<&'a ObjT>) {
    if t.alts.len() > 1 && !unions { return; }
    for k in &t.alts { match k { K::Arr(e) => gather(e, unions, seen, out), K::Obj(o) => { if seen.insert(o.name.as_str()) { out.push(o); } for f in &o.fields { gather(&f.t, unions, seen, out); } } _ => {} } }
}

// ------------------------------------------------------------------ output
struct Gen { lang: Lang, notes: Vec<String>, uses_list: bool, uses_map: bool, uses_any: bool }
impl Gen {
    fn note(&mut self, s: String) { if !self.notes.contains(&s) { self.notes.push(s); } }
    fn kind(&mut self, k: &K) -> String {
        match (self.lang, k) {
            (Lang::Ts, K::Bool) => "boolean".into(), (Lang::Ts, K::Int(_) | K::UInt | K::Big | K::Float) => "number".into(), (Lang::Ts, K::Str) => "string".into(), (Lang::Ts, K::Map) => "Record<string, unknown>".into(),
            (Lang::Ts, K::Arr(e)) => { let i = self.ty(e); if i.contains(" | ") { format!("({i})[]") } else { format!("{i}[]") } }
            (Lang::Go, K::Bool) => "bool".into(), (Lang::Go, K::Int(_)) => "int64".into(), (Lang::Go, K::UInt) => "uint64".into(), (Lang::Go, K::Big | K::Float) => "float64".into(), (Lang::Go, K::Str) => "string".into(),
            (Lang::Go, K::Map) => "map[string]any".into(), (Lang::Go, K::Arr(e)) => format!("[]{}", self.ty(e)),
            (Lang::Rust, K::Bool) => "bool".into(), (Lang::Rust, K::Int(_)) => "i64".into(), (Lang::Rust, K::UInt) => "u64".into(), (Lang::Rust, K::Big | K::Float) => "f64".into(), (Lang::Rust, K::Str) => "String".into(),
            (Lang::Rust, K::Map) => "serde_json::Map<String, serde_json::Value>".into(), (Lang::Rust, K::Arr(e)) => format!("Vec<{}>", self.ty(e)),
            (Lang::Java, K::Bool) => "Boolean".into(), (Lang::Java, K::Int(_)) => "Long".into(), (Lang::Java, K::UInt | K::Big) => "java.math.BigInteger".into(), (Lang::Java, K::Float) => "Double".into(), (Lang::Java, K::Str) => "String".into(),
            (Lang::Java, K::Map) => { self.uses_map = true; "Map<String, Object>".into() } (Lang::Java, K::Arr(e)) => { self.uses_list = true; format!("List<{}>", self.ty(e)) }
            (Lang::Py, K::Bool) => "bool".into(), (Lang::Py, K::Int(_) | K::UInt | K::Big) => "int".into(), (Lang::Py, K::Float) => "float".into(), (Lang::Py, K::Str) => "str".into(),
            (Lang::Py, K::Map) => { self.uses_any = true; "dict[str, Any]".into() } (Lang::Py, K::Arr(e)) => format!("list[{}]", self.ty(e)),
            (_, K::Obj(o)) => o.name.clone(),
        }
    }
    /// The type as written in this language, null included.
    fn ty(&mut self, t: &Ty) -> String {
        let dynamic = match self.lang { Lang::Ts => "unknown", Lang::Go => "any", Lang::Rust => "serde_json::Value", Lang::Java => "Object", Lang::Py => "Any" };
        let unions = matches!(self.lang, Lang::Ts | Lang::Py);
        let base = if t.alts.is_empty() || (t.alts.len() > 1 && !unions) { if self.lang == Lang::Py { self.uses_any = true; } dynamic.to_string() }
            else { let parts: Vec<String> = t.alts.iter().map(|k| self.kind(k)).collect(); parts.join(" | ") };
        if !t.null { return base; }
        match self.lang {
            Lang::Ts => if t.alts.is_empty() { "null".into() } else { format!("{base} | null") },
            Lang::Go => if base.starts_with("[]") || base.starts_with("map[") || base == "any" { base } else { format!("*{base}") },
            Lang::Rust => format!("Option<{base}>"),
            Lang::Java => base,
            Lang::Py => format!("{base} | None"),
        }
    }
    /// Field names for one object: (name, renamed?) per field. Keys that already are the name they would get keep it;
    /// the others are numbered when they collide (user_id and userId are both user_id in Rust).
    fn names(&self, o: &ObjT) -> Vec<(String, bool)> {
        let derive = |i: usize, key: &str| -> String {
            let fix = |s: String, kw: &[&str], pre: &str, empty: String| -> String { let s = if s.is_empty() { empty } else if s.starts_with(|c: char| c.is_ascii_digit()) { format!("{pre}{s}") } else { s }; if kw.contains(&s.as_str()) { format!("{s}_") } else { s } };
            match self.lang {
                Lang::Ts => key.to_string(),
                Lang::Go => fix(pascal_raw(key), &[], "F", format!("Field{}", i + 1)),
                Lang::Rust => fix(snake(key), RUST_KW, "f_", format!("field_{}", i + 1)),
                Lang::Java => if ascii_ident(key, true) && !JAVA_KW.contains(&key) { key.to_string() } else { fix(camel(key), JAVA_KW, "f", format!("field{}", i + 1)) },
                Lang::Py => if py_ident(key) { key.to_string() } else { fix(snake(key), PY_KW, "f_", format!("field_{}", i + 1)) },
            }
        };
        let wanted: Vec<String> = o.fields.iter().enumerate().map(|(i, f)| derive(i, &f.key)).collect();
        let mut used: HashSet<String> = HashSet::new();
        let mut out: Vec<Option<String>> = vec![None; wanted.len()];
        for (i, f) in o.fields.iter().enumerate() { if wanted[i] == f.key && used.insert(wanted[i].clone()) { out[i] = Some(wanted[i].clone()); } }
        for i in 0..wanted.len() {
            if out[i].is_some() { continue; }
            let sep = if matches!(self.lang, Lang::Rust | Lang::Py) { "_" } else { "" };
            let mut n = wanted[i].clone(); let mut k = 2; while !used.insert(n.clone()) { n = format!("{}{sep}{k}", wanted[i]); k += 1; }
            out[i] = Some(n);
        }
        out.into_iter().zip(&o.fields).map(|(n, f)| { let n = n.unwrap_or_default(); let renamed = n != f.key; (n, renamed) }).collect()
    }
    fn object(&mut self, o: &ObjT, ind: &str, out: &mut Vec<String>) {
        let names = self.names(o);
        match self.lang {
            Lang::Ts => {
                out.push(format!("export interface {} {{", o.name));
                for f in &o.fields { let k = if ascii_ident(&f.key, true) { f.key.clone() } else { quote(&f.key) }; let t = self.ty(&f.t); out.push(format!("  {k}{}: {t};", if f.optional { "?" } else { "" })); }
                out.push("}".into());
            }
            Lang::Go => {
                out.push(format!("type {} struct {{", o.name));
                for (f, (n, _)) in o.fields.iter().zip(&names) {
                    let mut t = self.ty(&f.t);
                    if f.optional && !(t.starts_with('*') || t.starts_with("[]") || t.starts_with("map[") || t == "any") { t = format!("*{t}"); }
                    if go_tag_ok(&f.key) { out.push(format!("\t{n} {t} `json:\"{}{}\"`", if f.key == "-" { "-," } else { f.key.as_str() }, if f.optional { if f.key == "-" { "omitempty" } else { ",omitempty" } } else { "" })); }
                    else { out.push(format!("\t{n} {t} `json:\"-\"` // the key {} cannot be written in a struct tag", quote(&f.key)));
                        self.note(format!("Go: encoding/json cannot map the key {} with a struct tag (tags allow letters, digits and some punctuation only) — that field is marked json:\"-\"; read it with a map or a custom UnmarshalJSON.", quote(&f.key))); }
                }
                out.push("}".into());
            }
            Lang::Rust => {
                out.push("#[derive(Debug, Clone, Serialize, Deserialize)]".into()); out.push(format!("pub struct {} {{", o.name));
                for (f, (n, renamed)) in o.fields.iter().zip(&names) {
                    let mut t = self.ty(&f.t);
                    if *renamed { out.push(format!("    #[serde(rename = {})]", rust_str(&f.key))); }
                    if f.optional { out.push("    #[serde(default, skip_serializing_if = \"Option::is_none\")]".into()); if !t.starts_with("Option<") { t = format!("Option<{t}>"); } }
                    out.push(format!("    pub {n}: {t},"));
                }
                out.push("}".into());
            }
            Lang::Java => {
                out.push(format!("{ind}public record {}(", o.name));
                let last = o.fields.len() - 1; let mut any = false;
                for (i, (f, (n, renamed))) in o.fields.iter().zip(&names).enumerate() {
                    let t = self.ty(&f.t);
                    out.push(format!("{ind}    {t} {n}{}{}", if i < last { "," } else { "" }, if *renamed { any = true; format!(" // JSON key {}", quote(&f.key)) } else { String::new() }));
                }
                if any { self.note("Java: keys that are not valid Java names were renamed (see the comments) — map them in your JSON library, e.g. @JsonProperty(\"…\") with Jackson or @SerializedName with Gson.".into()); }
                out.push(format!("{ind}) {{")); // the caller closes it (nested records go inside the root record)
            }
            Lang::Py => {
                // a field with a default cannot come before one without: keyword-only fields lift that rule
                let mut seen_opt = false; let mut kw = false; for f in &o.fields { if f.optional { seen_opt = true; } else if seen_opt { kw = true; } }
                out.push(if kw { "@dataclass(kw_only=True)".into() } else { "@dataclass".into() }); out.push(format!("class {}:", o.name));
                let mut any = false;
                for (f, (n, renamed)) in o.fields.iter().zip(&names) {
                    let mut t = self.ty(&f.t);
                    if f.optional { if !t.ends_with(" | None") { t.push_str(" | None"); } t.push_str(" = None"); }
                    out.push(format!("    {n}: {t}{}", if *renamed { any = true; format!("  # JSON key {}", quote(&f.key)) } else { String::new() }));
                }
                if any { self.note("Python: keys that are not valid Python names were renamed (see the comments) — fill those fields yourself, or use a library with aliases (pydantic Field(alias=\"…\")).".into()); }
            }
        }
    }
}
pub fn run(opts: &str, input: &[u8]) -> R {
    let (lang, root_name) = opts.split_once(':').unwrap_or((opts, "Root"));
    let lang = match lang { "ts" => Lang::Ts, "go" => Lang::Go, "rust" => Lang::Rust, "java" => Lang::Java, "py" => Lang::Py, _ => return Err(format!("unknown language {lang}")) };
    let text = std::str::from_utf8(input).map_err(|_| json!({ "message": "The text is not valid UTF-8", "line": 1, "column": 1, "pos": 0 }).to_string())?;
    let parsed = parse(text).map_err(|e| json!({ "message": e.message, "line": e.line, "column": e.column, "pos": e.pos }).to_string())?;
    let mut root = pascal(root_name); if root.is_empty() { root = "Root".into(); }
    if RESERVED_TYPES.contains(&root.as_str()) { root.push_str("Data"); }
    let mut seen = Seen { dup: false, uint: false, big: false };
    // the root object carries the root name; a root list's elements are named after it ("Orders" → Order, "Order" → OrderItem)
    let mut t = infer(&parsed.root, &root, false, &mut seen);
    let root_is_obj = t.alts.len() == 1 && !t.null && matches!(t.alts[0], K::Obj(_));
    let mut nm = Namer { lang, used: HashSet::new(), by_sig: HashMap::new() };
    if !root_is_obj { nm.used.insert(root.clone()); }
    nm.ty(&mut t);
    let mut objs: Vec<&ObjT> = Vec::new(); gather(&t, nm.unions(), &mut HashSet::new(), &mut objs);
    let mut g = Gen { lang, notes: Vec::new(), uses_list: false, uses_map: false, uses_any: false };
    let mut body: Vec<String> = Vec::new();
    let root_ty = g.ty(&t);
    match lang {
        Lang::Ts => { if !root_is_obj { body.push(format!("export type {root} = {root_ty};")); body.push(String::new()); } for o in &objs { g.object(o, "", &mut body); body.push(String::new()); } }
        Lang::Go => { body.push("// Generated by SuperTools JSON → Types".into()); body.push(String::new()); if !root_is_obj { body.push(format!("type {root} {root_ty}")); body.push(String::new()); } for o in &objs { g.object(o, "", &mut body); body.push(String::new()); } }
        Lang::Rust => {
            let mut b: Vec<String> = Vec::new();
            if !root_is_obj { b.push(format!("pub type {root} = {root_ty};")); b.push(String::new()); }
            for o in &objs { g.object(o, "", &mut b); b.push(String::new()); }
            if !objs.is_empty() { body.push("use serde::{Deserialize, Serialize};".into()); body.push(String::new()); }
            body.extend(b);
        }
        Lang::Java => {
            let mut b: Vec<String> = Vec::new();
            if root_is_obj {
                // one file = one public type: the other records are nested in the root record
                g.object(objs[0], "", &mut b);
                for o in &objs[1..] { g.object(o, "    ", &mut b); let l = b.len() - 1; b[l].push('}'); b.push(String::new()); }
                if objs.len() > 1 { b.pop(); b.push("}".into()); } else { let l = b.len() - 1; b[l].push('}'); }
                b.push(String::new());
            } else {
                b.push(format!("// The JSON is not an object, so there is no record for the whole document: read it as {root_ty}.")); b.push(String::new());
                for o in &objs { g.object(o, "", &mut b); let l = b.len() - 1; b[l].push('}'); b.push(String::new()); }
                for l in b.iter_mut() { if l.starts_with("public record ") { *l = l["public ".len()..].to_string(); } } // several top-level types in one file cannot all be public
            }
            if g.uses_list { body.push("import java.util.List;".into()); } if g.uses_map { body.push("import java.util.Map;".into()); }
            if g.uses_list || g.uses_map { body.push(String::new()); }
            body.extend(b);
        }
        Lang::Py => {
            let mut b: Vec<String> = Vec::new();
            for o in objs.iter().rev() { g.object(o, "", &mut b); b.push(String::new()); b.push(String::new()); } // what a class refers to is defined before it
            if !root_is_obj { b.push(format!("{root} = {root_ty}")); b.push(String::new()); }
            body.push("from __future__ import annotations".into()); body.push(String::new());
            if !objs.is_empty() { body.push("from dataclasses import dataclass".into()); }
            if g.uses_any { body.push("from typing import Any".into()); }
            if !objs.is_empty() || g.uses_any { body.push(String::new()); body.push(String::new()); }
            body.extend(b);
        }
    }
    let mut notes = std::mem::take(&mut g.notes);
    if seen.dup { notes.push("A key appears more than once in one object — its values were merged into one field.".into()); }
    if seen.uint || seen.big {
        notes.push(match lang {
            Lang::Ts => "A whole number in the sample is too big for JavaScript to keep exactly (above 2^53) — number will round it; send it as a string or parse it as a bigint.",
            Lang::Go => if seen.big { "A whole number in the sample does not fit 64 bits — float64 keeps about 16 digits of it (json.Number or *big.Int keeps them all)." } else { "A whole number in the sample is above the int64 range — uint64 is used for it." },
            Lang::Rust => if seen.big { "A whole number in the sample does not fit 64 bits — f64 keeps about 16 digits of it." } else { "A whole number in the sample is above the i64 range — u64 is used for it." },
            Lang::Java => "A whole number in the sample does not fit a Long — java.math.BigInteger is used for it.",
            Lang::Py => "",
        }.to_string());
        notes.retain(|n| !n.is_empty());
    }
    let mut out = body.join("\n"); while out.ends_with('\n') { out.pop(); } out.push('\n');
    js(json!({ "out": out, "types": objs.len(), "root": root, "notes": notes }))
}
