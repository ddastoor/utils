//! npm's semver rules — a port of the `semver` package 7.8 (ISC licence; classes/semver.js, classes/comparator.js,
//! classes/range.js, internal/trim-comparator-whitespace.js, ranges/min-version.js), default (strict) mode. The Semver tab
//! says "npm syntax", so its answers must be the ones npm gives; the crate used before (nodejs-semver) differed in many
//! cases (">1.2.3 <1.2.3" matched everything, "1.2.3 1.2.4" matched both, includePrerelease, invalid ranges accepted).
//! The regular expressions are the package's own (semver_re.rs, generated). tests/unit/devcore.test.mjs compares this
//! port with the package itself over thousands of range × version pairs.
use crate::semver_re as src;
use regex_lite::{Captures, Regex};
use std::cmp::Ordering;
use std::sync::OnceLock;

const MAX_SAFE: u64 = 9_007_199_254_740_991;
const MAX_LENGTH: usize = 256;
const MAX_SAFE_BUILD_LENGTH: usize = MAX_LENGTH - 6;

struct Res { full: Regex, xrange: Regex, tilde: Regex, caret: Regex, comparator: Regex, tildetrim: Regex, carettrim: Regex, hyphen: Regex, star: Regex, gte0: Regex, gte0pre: Regex, build: Regex, buildstrip: Regex, prerelease: Regex }
fn re() -> &'static Res {
    static R: OnceLock<Res> = OnceLock::new();
    let c = |s: &str| Regex::new(s).expect("semver regex");
    R.get_or_init(|| Res { full: c(src::FULL), xrange: c(src::XRANGE), tilde: c(src::TILDE), caret: c(src::CARET), comparator: c(src::COMPARATOR), tildetrim: c(src::TILDETRIM), carettrim: c(src::CARETTRIM),
        hyphen: c(src::HYPHENRANGE), star: c(src::STAR), gte0: c(src::GTE0), gte0pre: c(src::GTE0PRE), build: c(src::BUILD), buildstrip: c(src::BUILDSTRIP), prerelease: c(src::PRERELEASE) })
}
/// JavaScript's \s / String.prototype.trim set.
fn js_ws(c: char) -> bool { (c.is_whitespace() && c != '\u{85}') || c == '\u{feff}' }
fn js_trim(s: &str) -> &str { s.trim_matches(js_ws) }
/// `s.split(/\s+/)` as JavaScript does it (leading / trailing whitespace give empty first / last items).
fn split_ws(s: &str) -> Vec<String> {
    let mut out = vec![String::new()]; let mut in_ws = false;
    for ch in s.chars() { if js_ws(ch) { if !in_ws { out.push(String::new()); in_ws = true; } } else { in_ws = false; out.last_mut().unwrap().push(ch); } }
    out
}

#[derive(Clone, Debug, PartialEq)]
pub enum Id { Num(u64), Str(String) }
impl Id { fn text(&self) -> String { match self { Id::Num(n) => n.to_string(), Id::Str(s) => s.clone() } } }
fn all_digits(s: &str) -> bool { !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()) }
/// internal/identifiers.js compareIdentifiers
fn cmp_ident(a: &Id, b: &Id) -> Ordering {
    if let (Id::Num(x), Id::Num(y)) = (a, b) { return x.cmp(y); }
    let (sa, sb) = (a.text(), b.text()); let (an, bn) = (all_digits(&sa), all_digits(&sb));
    if an && bn { let (x, y) = (sa.trim_start_matches('0'), sb.trim_start_matches('0')); return x.len().cmp(&y.len()).then_with(|| x.cmp(y)); }
    if an && !bn { Ordering::Less } else if bn && !an { Ordering::Greater } else { sa.as_bytes().cmp(sb.as_bytes()) }
}

#[derive(Clone, Debug)]
pub struct Ver { pub major: u64, pub minor: u64, pub patch: u64, pub pre: Vec<Id>, pub build: Vec<String> }
impl Ver {
    pub fn parse(input: &str) -> Result<Ver, String> {
        if input.chars().count() > MAX_LENGTH { return Err(format!("version is longer than {MAX_LENGTH} characters")); }
        let t = js_trim(input);
        let m = re().full.captures(t).ok_or_else(|| format!("Invalid Version: {input}"))?;
        let num = |i: usize, what: &str| -> Result<u64, String> { m.get(i).unwrap().as_str().parse::<u64>().ok().filter(|n| *n <= MAX_SAFE).ok_or_else(|| format!("Invalid {what} version")) };
        let pre = m.get(4).map(|p| p.as_str().split('.').map(|id| match id.parse::<u64>() { Ok(n) if all_digits(id) && n < MAX_SAFE => Id::Num(n), _ => Id::Str(id.to_string()) }).collect()).unwrap_or_default();
        let build = m.get(5).map(|b| b.as_str().split('.').map(String::from).collect()).unwrap_or_default();
        Ok(Ver { major: num(1, "major")?, minor: num(2, "minor")?, patch: num(3, "patch")?, pre, build })
    }
    /// `SemVer.version`: without build metadata
    pub fn version(&self) -> String {
        let mut s = format!("{}.{}.{}", self.major, self.minor, self.patch);
        if !self.pre.is_empty() { s.push('-'); s.push_str(&self.pre.iter().map(Id::text).collect::<Vec<_>>().join(".")); }
        s
    }
    pub fn with_build(&self) -> String { if self.build.is_empty() { self.version() } else { format!("{}+{}", self.version(), self.build.join(".")) } }
    pub fn compare(&self, o: &Ver) -> Ordering {
        (self.major, self.minor, self.patch).cmp(&(o.major, o.minor, o.patch)).then_with(|| match (self.pre.is_empty(), o.pre.is_empty()) {
            (false, true) => Ordering::Less, (true, false) => Ordering::Greater, (true, true) => Ordering::Equal,
            _ => { for i in 0.. { match (self.pre.get(i), o.pre.get(i)) { (None, None) => return Ordering::Equal, (Some(_), None) => return Ordering::Greater, (None, Some(_)) => return Ordering::Less, (Some(a), Some(b)) => { if a == b { continue; } return cmp_ident(a, b); } } } Ordering::Equal }
        })
    }
    /// `compareBuild`: precedence, then build identifiers (what semver.sort uses)
    pub fn compare_build(&self, o: &Ver) -> Ordering {
        self.compare(o).then_with(|| { for i in 0.. { match (self.build.get(i), o.build.get(i)) { (None, None) => return Ordering::Equal, (Some(_), None) => return Ordering::Greater, (None, Some(_)) => return Ordering::Less,
            (Some(a), Some(b)) => { if a == b { continue; } return cmp_ident(&Id::Str(a.clone()), &Id::Str(b.clone())); } } } Ordering::Equal })
    }
    /// `SemVer.inc(release, identifier)` with the default identifierBase
    pub fn inc(&mut self, release: &str, identifier: Option<&str>) -> Result<(), String> {
        let identifier = identifier.filter(|s| !s.is_empty());
        if release.starts_with("pre") { if let Some(id) = identifier { let probe = format!("-{id}"); let ok = re().prerelease.captures(&probe).and_then(|c| c.get(1).map(|g| g.as_str() == id)).unwrap_or(false); if !ok { return Err(format!("invalid identifier: {id}")); } } }
        let bump = |n: &mut u64| -> Result<(), String> { if *n >= MAX_SAFE { return Err("version number too large".into()); } *n += 1; Ok(()) };
        match release {
            "premajor" => { self.pre.clear(); self.patch = 0; self.minor = 0; bump(&mut self.major)?; self.inc("pre", identifier)?; }
            "preminor" => { self.pre.clear(); self.patch = 0; bump(&mut self.minor)?; self.inc("pre", identifier)?; }
            "prepatch" => { self.pre.clear(); self.inc("patch", identifier)?; self.inc("pre", identifier)?; }
            "prerelease" => { if self.pre.is_empty() { self.inc("patch", identifier)?; } self.inc("pre", identifier)?; }
            "release" => { if self.pre.is_empty() { return Err(format!("version {} is not a prerelease", self.with_build())); } self.pre.clear(); }
            "major" => { if self.minor != 0 || self.patch != 0 || self.pre.is_empty() { bump(&mut self.major)?; } self.minor = 0; self.patch = 0; self.pre.clear(); }
            "minor" => { if self.patch != 0 || self.pre.is_empty() { bump(&mut self.minor)?; } self.patch = 0; self.pre.clear(); }
            "patch" => { if self.pre.is_empty() { bump(&mut self.patch)?; } self.pre.clear(); }
            "pre" => {
                if self.pre.is_empty() { self.pre = vec![Id::Num(0)]; }
                else {
                    let mut done = false;
                    for i in (0..self.pre.len()).rev() { if let Id::Num(n) = &mut self.pre[i] { *n += 1; done = true; break; } }
                    if !done { self.pre.push(Id::Num(0)); }
                }
                if let Some(id) = identifier {
                    let ids: Vec<Id> = id.split('.').map(|x| Id::Str(x.to_string())).collect();
                    let is_same = ids.len() <= self.pre.len() && ids.iter().zip(&self.pre).all(|(want, have)| cmp_ident(have, want) == Ordering::Equal);
                    let fresh = vec![Id::Str(id.to_string()), Id::Num(0)];
                    if is_same { // isNaN(prerelease[n]): missing, or not a number
                        let base_is_number = match self.pre.get(ids.len()) { Some(Id::Num(_)) => true, Some(Id::Str(s)) => s.parse::<f64>().is_ok(), None => false };
                        if !base_is_number { self.pre = fresh; }
                    } else { self.pre = fresh; }
                }
            }
            other => return Err(format!("invalid increment argument: {other}")),
        }
        Ok(())
    }
}

#[derive(Clone, Debug)]
pub struct Comp { pub op: String, pub ver: Option<Ver>, pub value: String }
impl Comp {
    fn new(comp: &str) -> Result<Comp, String> {
        let comp = split_ws(js_trim(comp)).join(" ");
        let m = re().comparator.captures(&comp).ok_or_else(|| format!("Invalid comparator: {comp}"))?;
        let mut op = m.get(1).map(|g| g.as_str()).unwrap_or("").to_string(); if op == "=" { op.clear(); }
        match m.get(2).map(|g| g.as_str()).filter(|s| !s.is_empty()) {
            None => Ok(Comp { op, ver: None, value: String::new() }),
            Some(v) => { let ver = Ver::parse(v)?; let value = format!("{op}{}", ver.version()); Ok(Comp { op, ver: Some(ver), value }) }
        }
    }
    fn test(&self, v: &Ver) -> bool {
        let Some(c) = &self.ver else { return true };
        let o = v.compare(c);
        match self.op.as_str() { "" => o == Ordering::Equal, ">" => o == Ordering::Greater, ">=" => o != Ordering::Less, "<" => o == Ordering::Less, "<=" => o != Ordering::Greater, _ => false }
    }
}

fn is_x(id: Option<&str>) -> bool { match id { None | Some("") => true, Some(s) => s.eq_ignore_ascii_case("x") || s == "*" } }
fn g<'a>(c: &'a Captures, i: usize) -> Option<&'a str> { c.get(i).map(|m| m.as_str()) }
/// `+M + 1` on a numeric identifier
fn plus1(s: &str) -> String { match s.parse::<u64>() { Ok(n) if n < u64::MAX => (n + 1).to_string(), _ => format!("{s}1") /* too large: stays invalid later */ } }
fn replace_first(re: &Regex, s: &str, f: impl Fn(&Captures) -> String) -> String { match re.captures(s) { Some(c) => { let m = c.get(0).unwrap(); format!("{}{}{}", &s[..m.start()], f(&c), &s[m.end()..]) } None => s.to_string() } }

fn replace_tilde(comp: &str, inc_pre: bool) -> String {
    let z = if inc_pre { "-0" } else { "" };
    replace_first(&re().tilde, comp, |c| {
        let (ma, mi, pa, pr) = (g(c, 1), g(c, 2), g(c, 3), g(c, 4));
        if is_x(ma) { String::new() }
        else if is_x(mi) { let m = ma.unwrap(); format!(">={m}.0.0{z} <{}.0.0-0", plus1(m)) }
        else if is_x(pa) { let (m, n) = (ma.unwrap(), mi.unwrap()); format!(">={m}.{n}.0{z} <{m}.{}.0-0", plus1(n)) }
        else { let (m, n, p) = (ma.unwrap(), mi.unwrap(), pa.unwrap()); match pr.filter(|s| !s.is_empty()) { Some(pr) => format!(">={m}.{n}.{p}-{pr} <{m}.{}.0-0", plus1(n)), None => format!(">={m}.{n}.{p} <{m}.{}.0-0", plus1(n)) } }
    })
}
fn replace_caret(comp: &str, inc_pre: bool) -> String {
    let z = if inc_pre { "-0" } else { "" };
    replace_first(&re().caret, comp, |c| {
        let (ma, mi, pa, pr) = (g(c, 1), g(c, 2), g(c, 3), g(c, 4));
        if is_x(ma) { return String::new(); }
        let m = ma.unwrap();
        if is_x(mi) { return format!(">={m}.0.0{z} <{}.0.0-0", plus1(m)); }
        let n = mi.unwrap();
        if is_x(pa) { return if m == "0" { format!(">={m}.{n}.0{z} <{m}.{}.0-0", plus1(n)) } else { format!(">={m}.{n}.0{z} <{}.0.0-0", plus1(m)) }; }
        let p = pa.unwrap();
        let lo = match pr.filter(|s| !s.is_empty()) { Some(pr) => format!(">={m}.{n}.{p}-{pr}"), None => format!(">={m}.{n}.{p}") };
        let hi = if m == "0" { if n == "0" { format!("<{m}.{n}.{}-0", plus1(p)) } else { format!("<{m}.{}.0-0", plus1(n)) } } else { format!("<{}.0.0-0", plus1(m)) };
        format!("{lo} {hi}")
    })
}
fn replace_xrange(comp: &str, inc_pre: bool) -> String {
    let comp = js_trim(comp);
    replace_first(&re().xrange, comp, |c| {
        let whole = c.get(0).unwrap().as_str().to_string();
        let (mut gtlt, ma, mi, pa) = (g(c, 1).unwrap_or("").to_string(), g(c, 2), g(c, 3), g(c, 4));
        // invalidXRangeOrder: a wildcard before a number ("x.2.3", "1.x.3")
        if (is_x(ma) && !is_x(mi)) || (is_x(mi) && pa.map_or(false, |p| !p.is_empty()) && !is_x(pa)) { return comp.to_string(); }
        let x_major = is_x(ma); let x_minor = x_major || is_x(mi); let x_patch = x_minor || is_x(pa); let any_x = x_patch;
        if gtlt == "=" && any_x { gtlt.clear(); }
        let mut pr = if inc_pre { "-0" } else { "" };
        if x_major { return if gtlt == ">" || gtlt == "<" { "<0.0.0-0".into() } else { "*".into() }; }
        let m = ma.unwrap().to_string();
        if !gtlt.is_empty() && any_x {
            let (mut mm, mut n) = (m.clone(), if x_minor { "0".to_string() } else { mi.unwrap().to_string() });
            if gtlt == ">" { gtlt = ">=".into(); if x_minor { mm = plus1(&mm); n = "0".into(); } else { n = plus1(&n); } }
            else if gtlt == "<=" { gtlt = "<".into(); if x_minor { mm = plus1(&mm); } else { n = plus1(&n); } }
            if gtlt == "<" { pr = "-0"; }
            return format!("{gtlt}{mm}.{n}.0{pr}");
        }
        if x_minor { return format!(">={m}.0.0{pr} <{}.0.0-0", plus1(&m)); }
        if x_patch { let n = mi.unwrap(); return format!(">={m}.{n}.0{pr} <{m}.{}.0-0", plus1(n)); }
        whole
    })
}
fn parse_comparator(comp: &str, inc_pre: bool) -> String {
    let comp = replace_first(&re().build, comp, |_| String::new());
    let comp = split_ws(js_trim(&comp)).iter().map(|c| replace_caret(c, inc_pre)).collect::<Vec<_>>().join(" ");
    let comp = split_ws(js_trim(&comp)).iter().map(|c| replace_tilde(c, inc_pre)).collect::<Vec<_>>().join(" ");
    let comp = split_ws(&comp).iter().map(|c| replace_xrange(c, inc_pre)).collect::<Vec<_>>().join(" ");
    replace_first(&re().star, js_trim(&comp), |_| String::new())
}
fn hyphen_replace(range: &str, inc_pre: bool) -> String {
    let z = if inc_pre { "-0" } else { "" };
    replace_first(&re().hyphen, range, |c| {
        let (from, f_ma, f_mi, f_pa, f_pr) = (g(c, 1).unwrap_or(""), g(c, 2), g(c, 3), g(c, 4), g(c, 5));
        let (to, t_ma, t_mi, t_pa, t_pr) = (g(c, 7).unwrap_or(""), g(c, 8), g(c, 9), g(c, 10), g(c, 11));
        let lo = if is_x(f_ma) { String::new() } else if is_x(f_mi) { format!(">={}.0.0{z}", f_ma.unwrap()) } else if is_x(f_pa) { format!(">={}.{}.0{z}", f_ma.unwrap(), f_mi.unwrap()) }
            else if f_pr.map_or(false, |s| !s.is_empty()) { format!(">={from}") } else { format!(">={from}{z}") };
        let hi = if is_x(t_ma) { String::new() } else if is_x(t_mi) { format!("<{}.0.0-0", plus1(t_ma.unwrap())) } else if is_x(t_pa) { format!("<{}.{}.0-0", t_ma.unwrap(), plus1(t_mi.unwrap())) }
            else if let Some(pr) = t_pr.filter(|s| !s.is_empty()) { format!("<={}.{}.{}-{pr}", t_ma.unwrap(), t_mi.unwrap(), t_pa.unwrap()) }
            else if inc_pre { format!("<{}.{}.{}-0", t_ma.unwrap(), t_mi.unwrap(), plus1(t_pa.unwrap())) } else { format!("<={to}") };
        js_trim(&format!("{lo} {hi}")).to_string()
    })
}

/// internal/trim-comparator-whitespace.js: "> 1.2.3" → ">1.2.3" (a scanner, not a regex, in the package too).
fn trim_comparator_whitespace(range: &str) -> String {
    let r: Vec<char> = range.chars().collect();
    let at = |i: usize| r.get(i).copied();
    let is_digit = |c: Option<char>| c.map_or(false, |c| c.is_ascii_digit());
    let is_letter = |c: Option<char>| c.map_or(false, |c| c.is_ascii_alphabetic());
    let is_ident = |c: Option<char>| is_digit(c) || is_letter(c) || c == Some('-');
    let is_wsp = |c: Option<char>| c.map_or(false, js_ws);
    let is_prefix = |c: Option<char>| c == Some('v') || c == Some('=') || is_wsp(c);
    let is_start = |c: Option<char>| is_digit(c) || c == Some('x') || c == Some('X') || c == Some('*');
    let digits_end = |start: usize, limit: usize| -> usize { if !is_digit(at(start)) { return start; } let mut end = start + 1; while is_digit(at(end)) { end += 1; } (start + limit).min(end) };
    let num_end = |start: usize, loose: bool| -> usize { if !loose && at(start) == Some('0') { return start + 1; } digits_end(start, if loose { MAX_LENGTH } else { MAX_LENGTH + 1 }) };
    let pre_ident_end = |start: usize, loose: bool| -> usize {
        let d = digits_end(start, MAX_LENGTH);
        if is_letter(at(d)) || at(d) == Some('-') { let mut end = d + 1; let limit = end + MAX_SAFE_BUILD_LENGTH; while end < limit && is_ident(at(end)) { end += 1; } return end; }
        num_end(start, loose)
    };
    let pre_end = |start: usize, loose: bool| -> usize {
        let hyphen = at(start) == Some('-');
        if !loose && !hyphen { return start; }
        let id_start = start + usize::from(hyphen);
        let mut end = pre_ident_end(id_start, loose);
        if end == id_start { if !loose || !hyphen { return start; } end = pre_ident_end(start, loose); }
        while at(end) == Some('.') { let next = pre_ident_end(end + 1, loose); if next == end + 1 { break; } end = next; }
        end
    };
    let build_ident_end = |start: usize| -> usize { let mut end = start; while end - start < MAX_SAFE_BUILD_LENGTH && is_ident(at(end)) { end += 1; } end };
    let build_end = |start: usize| -> usize {
        if at(start) != Some('+') { return start; }
        let mut end = build_ident_end(start + 1); if end == start + 1 { return start; }
        while at(end) == Some('.') { let next = build_ident_end(end + 1); if next == end + 1 { break; } end = next; }
        end
    };
    let loose_full_end = |start: usize| -> usize {
        let mut end = start;
        for comp in 0..3 { let next = num_end(end, true); if next == end { return start; } end = next; if comp < 2 { if at(end) != Some('.') { return start; } end += 1; } }
        build_end(pre_end(end, true))
    };
    let partial_comp_end = |start: usize| -> usize { if is_digit(at(start)) { num_end(start, false) } else if is_start(at(start)) { start + 1 } else { start } };
    let partial_end = |start: usize| -> usize {
        let mut end = partial_comp_end(start);
        for _ in 0..2 { if at(end) != Some('.') { return end; } let next = partial_comp_end(end + 1); if next == end + 1 { return end; } end = next; }
        build_end(pre_end(end, false))
    };
    let version_end = |start: usize| -> usize { let full = loose_full_end(start); if full != start { full } else { partial_end(start) } };
    let removable = |match_start: usize| -> Option<usize> {
        let mut p = match_start;
        if is_wsp(at(p)) { p += 1; }
        if at(p) == Some('<') || at(p) == Some('>') { p += 1; }
        if at(p) == Some('=') { p += 1; }
        if is_wsp(at(p)) { Some(p) } else { None }
    };
    let (mut result, mut copy_from, mut cursor) = (String::new(), 0usize, 0usize);
    while cursor < r.len() {
        let match_start = cursor;
        if at(cursor) == Some('<') || at(cursor) == Some('>') { cursor += 1; }
        else if !is_prefix(at(cursor)) && !is_start(at(cursor)) { cursor += 1; continue; }
        while cursor < r.len() && is_prefix(at(cursor)) { cursor += 1; }
        if !is_start(at(cursor)) { continue; }
        if let Some(w) = removable(match_start) { result.extend(&r[copy_from..w]); copy_from = w + 1; }
        cursor = version_end(cursor);
    }
    result.extend(&r[copy_from..]);
    result
}

pub struct Range { pub set: Vec<Vec<Comp>>, pub inc_pre: bool }
impl Range {
    pub fn parse(range: &str, inc_pre: bool) -> Result<Range, String> {
        let raw = split_ws(js_trim(range)).join(" ");
        let mut set: Vec<Vec<Comp>> = Vec::new();
        for part in raw.split("||") { let c = Self::parse_range(js_trim(part), inc_pre)?; if !c.is_empty() { set.push(c); } }
        if set.is_empty() { return Err(format!("Invalid SemVer Range: {raw}")); }
        if set.len() > 1 {
            let first = set[0].clone();
            set.retain(|c| c[0].value != "<0.0.0-0");
            if set.is_empty() { set = vec![first]; }
            else if set.len() > 1 { if let Some(any) = set.iter().find(|c| c.len() == 1 && c[0].value.is_empty()).cloned() { set = vec![any]; } }
        }
        Ok(Range { set, inc_pre })
    }
    fn parse_range(range: &str, inc_pre: bool) -> Result<Vec<Comp>, String> {
        let range = re().buildstrip.replace_all(range, "").into_owned();
        let range = hyphen_replace(&range, inc_pre);
        let range = trim_comparator_whitespace(&range);
        let range = re().tildetrim.replace_all(&range, "${1}~").into_owned();
        let range = re().carettrim.replace_all(&range, "${1}^").into_owned();
        let joined = range.split(' ').map(|c| parse_comparator(c, inc_pre)).collect::<Vec<_>>().join(" ");
        let gte0 = if inc_pre { &re().gte0pre } else { &re().gte0 };
        let mut out: Vec<Comp> = Vec::new();
        for comp in split_ws(&joined) {
            let comp = replace_first(gte0, js_trim(&comp), |_| String::new());
            let c = Comp::new(&comp)?;
            if c.value == "<0.0.0-0" { return Ok(vec![c]); }
            match out.iter().position(|o| o.value == c.value) { Some(i) => out[i] = c, None => out.push(c) }
        }
        if out.len() > 1 { out.retain(|c| !c.value.is_empty()); }
        Ok(out)
    }
    pub fn formatted(&self) -> String { self.set.iter().map(|comps| comps.iter().map(|c| js_trim(&c.value).to_string()).collect::<Vec<_>>().join(" ")).collect::<Vec<_>>().join("||") }
    pub fn test(&self, v: &Ver) -> bool { self.set.iter().any(|set| self.test_set(set, v)) }
    fn test_set(&self, set: &[Comp], v: &Ver) -> bool {
        if !set.iter().all(|c| c.test(v)) { return false; }
        if !v.pre.is_empty() && !self.inc_pre {
            // a pre-release only satisfies a range that names a pre-release of the same major.minor.patch
            return set.iter().filter_map(|c| c.ver.as_ref()).any(|a| !a.pre.is_empty() && (a.major, a.minor, a.patch) == (v.major, v.minor, v.patch));
        }
        true
    }
    /// ranges/min-version.js
    pub fn min_version(&self) -> Option<Ver> {
        for start in ["0.0.0", "0.0.0-0"] { let v = Ver::parse(start).unwrap(); if self.test(&v) { return Some(v); } }
        let mut minver: Option<Ver> = None;
        for comps in &self.set {
            let mut set_min: Option<Ver> = None;
            for c in comps {
                let Some(cv) = &c.ver else { continue };
                let mut v = Ver { build: Vec::new(), ..cv.clone() };
                match c.op.as_str() {
                    ">" => { if v.pre.is_empty() { v.patch += 1; } else { v.pre.push(Id::Num(0)); } }
                    "" | ">=" => {}
                    _ => continue,
                }
                if set_min.as_ref().map_or(true, |m| v.compare(m) == Ordering::Greater) { set_min = Some(v); }
            }
            if let Some(sm) = set_min { if minver.as_ref().map_or(true, |m| m.compare(&sm) == Ordering::Greater) { minver = Some(sm); } }
        }
        minver.filter(|m| self.test(m))
    }
}
