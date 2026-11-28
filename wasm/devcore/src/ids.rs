//! The Number Detective (potentials #84): what a number or code is, and whether it is valid — offline.
//!
//! `ids` takes one entry (the text of a line, a label before it allowed: "PAN: …", "IFSC code …") and returns every reading
//! that fits, best first: `{ readings: [{ kind, title, verdict, summary, value, fields: [[label, value]], notes, score }],
//! shape }`. Verdicts: "valid" (every check there is passes — a check digit, a list), "invalid" (a check fails: the reason
//! is the summary, the right check digit in `fix`), "format" (the shape is right and nothing more can be checked offline:
//! PAN, vehicle numbers …), "unlisted" (right shape and checks, not in the list: an IFSC RBI does not list, a PIN code
//! India Post does not). The rules and their references: CLAUDE.md §3 "Number Detective"; the tables: ids_tables.rs and
//! data/ids/*.bin, made by scripts/make-ids-data.py.
use crate::ids_tables as T;
use crate::R;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::OnceLock;

static PINS_BIN: &[u8] = include_bytes!("../data/ids/pins.bin");
static IFSC_BIN: &[u8] = include_bytes!("../data/ids/ifsc.bin");
static GEO_BIN: &[u8] = include_bytes!("../data/ids/geo91.bin");
static ISBN_BIN: &[u8] = include_bytes!("../data/ids/isbn.bin");
static WMI_BIN: &[u8] = include_bytes!("../data/ids/wmi.bin");

// ------------------------------------------------------------------------------------------------- reading the tables
struct Rd<'a> { b: &'a [u8], i: usize }
impl<'a> Rd<'a> {
    fn new(b: &'a [u8]) -> Self { Rd { b, i: 0 } }
    fn u8(&mut self) -> u8 { let v = self.b[self.i]; self.i += 1; v }
    fn u16(&mut self) -> u16 { let v = u16::from_le_bytes([self.b[self.i], self.b[self.i + 1]]); self.i += 2; v }
    fn u32(&mut self) -> u32 { let v = u32::from_le_bytes(self.b[self.i..self.i + 4].try_into().unwrap()); self.i += 4; v }
    fn var(&mut self) -> u32 {
        let (mut v, mut s) = (0u32, 0);
        loop { let x = self.u8(); v |= ((x & 0x7f) as u32) << s; if x & 0x80 == 0 { return v; } s += 7; }
    }
    fn take(&mut self, n: usize) -> &'a [u8] { let s = &self.b[self.i..self.i + n]; self.i += n; s }
    fn str1(&mut self) -> &'a str { let n = self.u8() as usize; std::str::from_utf8(self.take(n)).unwrap() }
}

struct Pins { states: Vec<&'static str>, pairs: Vec<(&'static str, u8)>, pins: Vec<u32>, info: Vec<(u8, Vec<u16>, Vec<u8>)> }
fn pins() -> &'static Pins {
    static P: OnceLock<Pins> = OnceLock::new();
    P.get_or_init(|| {
        let mut r = Rd::new(PINS_BIN);
        let states = (0..r.u16()).map(|_| r.str1()).collect();
        let pairs = (0..r.u16()).map(|_| { let s = r.u8(); (r.str1(), s) }).collect();
        let n = r.u32() as usize;
        let (mut pins, mut info, mut prev) = (Vec::with_capacity(n), Vec::with_capacity(n), 0u32);
        for _ in 0..n {
            prev += r.var();
            let st = r.var() as u8;
            let g = (0..r.var()).map(|_| r.var() as u16).collect();
            let o = (0..r.var()).map(|_| r.var() as u8).collect();
            pins.push(prev); info.push((st, g, o));
        }
        Pins { states, pairs, pins, info }
    })
}

struct Ifsc { banks: HashMap<[u8; 4], (Vec<u32>, Vec<[u8; 6]>)>, sublet: HashMap<[u8; 11], &'static str>, custom: Vec<(&'static str, &'static str)> }
fn ifsc_data() -> &'static Ifsc {
    static D: OnceLock<Ifsc> = OnceLock::new();
    D.get_or_init(|| {
        let mut r = Rd::new(IFSC_BIN);
        let mut banks = HashMap::new();
        for _ in 0..r.u16() {
            let code: [u8; 4] = r.take(4).try_into().unwrap();
            let mut nums = Vec::new(); let mut prev: i64 = -1;
            for _ in 0..r.var() { prev += r.var() as i64 + 1; nums.push(prev as u32); }
            let strs = (0..r.var()).map(|_| r.take(6).try_into().unwrap()).collect();
            banks.insert(code, (nums, strs));
        }
        let mut sublet = HashMap::new();
        for _ in 0..r.u16() { let k: [u8; 11] = r.take(11).try_into().unwrap(); sublet.insert(k, r.str1()); }
        let custom = (0..r.u16()).map(|_| (r.str1(), r.str1())).collect();
        Ifsc { banks, sublet, custom }
    })
}

/// libphonenumber's places of Indian landline prefixes: (digits, place) by the prefix's length.
fn geo() -> &'static (Vec<&'static str>, HashMap<(u8, u32), u16>) {
    static G: OnceLock<(Vec<&'static str>, HashMap<(u8, u32), u16>)> = OnceLock::new();
    G.get_or_init(|| {
        let mut r = Rd::new(GEO_BIN);
        let descs = (0..r.u16()).map(|_| r.str1()).collect();
        let mut m = HashMap::new();
        for _ in 0..r.u32() { let l = r.u8(); let v = r.u32(); m.insert((l, v), r.u16()); }
        (descs, m)
    })
}

struct Rg { len: u8, lo: u32, hi: u32, agency: u16, kids: Vec<Rg> }
fn isbn_db() -> &'static (Vec<&'static str>, Vec<Rg>) {
    static I: OnceLock<(Vec<&'static str>, Vec<Rg>)> = OnceLock::new();
    fn node(r: &mut Rd<'static>) -> Vec<Rg> {
        (0..r.var()).map(|_| { let len = r.u8(); let lo = r.u32(); let hi = r.u32(); let agency = r.var() as u16; Rg { len, lo, hi, agency, kids: node(r) } }).collect()
    }
    I.get_or_init(|| { let mut r = Rd::new(ISBN_BIN); let ag = (0..r.u16()).map(|_| r.str1()).collect(); (ag, node(&mut r)) })
}

fn wmi() -> &'static HashMap<&'static str, &'static str> {
    static W: OnceLock<HashMap<&'static str, &'static str>> = OnceLock::new();
    W.get_or_init(|| { let mut r = Rd::new(WMI_BIN); (0..r.u16()).map(|_| (r.str1(), r.str1())).collect() })
}

fn phone_res() -> &'static Vec<(&'static str, regex_lite::Regex, &'static [u8])> {
    static P: OnceLock<Vec<(&'static str, regex_lite::Regex, &'static [u8])>> = OnceLock::new();
    P.get_or_init(|| T::IN_PATTERNS.iter().map(|(k, p, l)| (*k, regex_lite::Regex::new(&format!("^(?:{p})$")).unwrap(), *l)).collect())
}
type Fmt = (regex_lite::Regex, &'static str, Option<regex_lite::Regex>, &'static str);
fn phone_fmts() -> &'static (Vec<Fmt>, Vec<Fmt>) {
    static F: OnceLock<(Vec<Fmt>, Vec<Fmt>)> = OnceLock::new();
    fn mk(rows: &'static [(&'static str, &'static str, &'static str, &'static str)]) -> Vec<Fmt> {
        rows.iter().map(|(p, f, l, n)| (regex_lite::Regex::new(&format!("^(?:{p})$")).unwrap(), *f,
            if l.is_empty() { None } else { Some(regex_lite::Regex::new(&format!("^(?:{l})")).unwrap()) }, *n)).collect()
    }
    F.get_or_init(|| (mk(T::IN_FORMAT_NATIONAL), mk(T::IN_FORMAT_INTL)))
}

/// A sorted, generated table (banks, regions, VIN countries).
fn lookup<'a>(t: &'a [(&'a str, &'a str)], k: &str) -> Option<&'a str> { t.binary_search_by(|(a, _)| (*a).cmp(k)).ok().map(|i| t[i].1) }
/// A small table written here, in no particular order.
fn lin<'a>(t: &'a [(&'a str, &'a str)], k: &str) -> Option<&'a str> { t.iter().find(|(a, _)| *a == k).map(|x| x.1) }
fn region_name(code: &str) -> Option<&'static str> { lookup(T::REGIONS, code) }
fn bank_name(code: &str) -> Option<&'static str> { lookup(T::BANKS, code) }

// ------------------------------------------------------------------------------------------------- check digits
const VD: [[u8; 10]; 10] = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const VP: [[u8; 10]; 8] = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];
const VINV: [u8; 10] = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
fn dv(s: &str) -> Vec<u8> { s.bytes().map(|c| c - b'0').collect() }
/// Verhoeff (Aadhaar, VID): the check digit for `d` (digits without their check digit).
pub fn verhoeff_digit(d: &[u8]) -> u8 { let mut c = 0u8; for (i, &x) in d.iter().rev().enumerate() { c = VD[c as usize][VP[(i + 1) % 8][x as usize] as usize]; } VINV[c as usize] }
fn verhoeff_ok(d: &[u8]) -> bool { let mut c = 0u8; for (i, &x) in d.iter().rev().enumerate() { c = VD[c as usize][VP[i % 8][x as usize] as usize]; } c == 0 }
/// Luhn mod n over values (the rightmost is the check value): the sum that must be 0.
fn luhn_sum(v: &[u32], n: u32) -> u32 {
    let mut s = 0;
    for (i, &x) in v.iter().rev().enumerate() { if i % 2 == 1 { let y = x * 2; s += y / n + y % n; } else { s += x; } }
    s % n
}
fn luhn_digit(v: &[u32], n: u32) -> u32 { let mut w = v.to_vec(); w.push(0); (n - luhn_sum(&w, n)) % n }
fn digits_u32(s: &str) -> Vec<u32> { s.bytes().map(|c| (c - b'0') as u32).collect() }
const A36: &str = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
fn v36(c: u8) -> u32 { A36.bytes().position(|x| x == c).unwrap() as u32 }
fn ean_digit(d: &[u8]) -> u8 { let s: u32 = d.iter().rev().enumerate().map(|(i, &x)| x as u32 * if i % 2 == 0 { 3 } else { 1 }).sum(); ((10 - s % 10) % 10) as u8 }
fn mod97(s: &str) -> u32 { // letters as 10 … 35
    let mut m = 0u32;
    for c in s.bytes() { if c.is_ascii_digit() { m = (m * 10 + (c - b'0') as u32) % 97; } else { m = (m * 100 + (c - b'A') as u32 + 10) % 97; } }
    m
}

// ------------------------------------------------------------------------------------------------- the readings
struct Reading { kind: &'static str, title: &'static str, verdict: &'static str, summary: String, value: String, fields: Vec<(String, String)>, notes: Vec<String>, score: i32, fix: Option<String> }
impl Reading {
    fn new(kind: &'static str, title: &'static str, verdict: &'static str, score: i32, value: impl Into<String>, summary: impl Into<String>) -> Self {
        Reading { kind, title, verdict, summary: summary.into(), value: value.into(), fields: vec![], notes: vec![], score, fix: None }
    }
    fn f(mut self, l: &str, v: impl Into<String>) -> Self { self.fields.push((l.into(), v.into())); self }
    fn n(mut self, s: impl Into<String>) -> Self { self.notes.push(s.into()); self }
    fn json(&self) -> Value {
        json!({ "kind": self.kind, "title": self.title, "verdict": self.verdict, "summary": self.summary, "value": self.value,
                "fields": self.fields.iter().map(|(a, b)| json!([a, b])).collect::<Vec<_>>(), "notes": self.notes, "score": self.score, "fix": self.fix })
    }
}

/// What the engine is given, cleaned three ways.
struct In<'a> { raw: &'a str, alnum: String, digits: String, plus: bool, hint: &'static [&'static str] }

fn group(s: &str, sizes: &[usize], sep: &str) -> String {
    let (mut out, mut i) = (Vec::new(), 0);
    for &n in sizes { if i >= s.len() { break; } let e = (i + n).min(s.len()); out.push(&s[i..e]); i = e; }
    if i < s.len() { out.push(&s[i..]); }
    out.join(sep)
}
fn ord(n: u32) -> String { let s = match (n % 10, n % 100) { (1, x) if x != 11 => "st", (2, x) if x != 12 => "nd", (3, x) if x != 13 => "rd", _ => "th" }; format!("{n}{s}") }
fn is_palindrome(s: &str) -> bool { s.bytes().eq(s.bytes().rev()) }

const PRIVATE: &str = "It is private: share it only where it is needed — this tab works on the device, nothing is sent.";

fn aadhaar(x: &In) -> Option<Reading> {
    let d = &x.digits;
    if d.len() != 12 || x.alnum != *d { return None; }
    let v = dv(d); let val = group(d, &[4, 4, 4], " ");
    let r = |verdict, score, s: String| Reading::new("aadhaar", "Aadhaar number", verdict, score, val.clone(), s);
    if d.starts_with('0') || d.starts_with('1') { return Some(r("invalid", 30, "An Aadhaar number never begins with 0 or 1.".into())); }
    if is_palindrome(d) { return Some(r("invalid", 30, "An Aadhaar number is never the same backwards (UIDAI issues none of those).".into())); }
    if !verhoeff_ok(&v) {
        let c = verhoeff_digit(&v[..11]);
        let mut x = r("invalid", 40, format!("Its check digit is wrong: with these first eleven digits the last one should be {c}, not {}. One of the digits is probably mistyped.", v[11]));
        x.fix = Some(format!("{}{c}", &d[..11])); return Some(x);
    }
    Some(r("valid", 80, "A valid Aadhaar number by its check digit (Verhoeff).".into())
        .n("Only UIDAI can say whether a number was issued; the check digit catches every single mistyped digit and two digits swapped.")
        .n(PRIVATE))
}

fn masked_aadhaar(x: &In) -> Option<Reading> {
    let t: String = x.raw.chars().filter(|c| !c.is_whitespace() && *c != '-').collect::<String>().to_uppercase();
    if t.len() != 12 || !t[..8].bytes().all(|c| c == b'X' || c == b'*' || c == 0xE2) || !t[8..].bytes().all(|c| c.is_ascii_digit()) { return None; }
    Some(Reading::new("aadhaar_masked", "Masked Aadhaar number", "format", 70, format!("XXXX XXXX {}", &t[8..]), "A masked Aadhaar number: only its last four digits are shown — the copy UIDAI's own e-Aadhaar offers.")
        .n("A masked number cannot be checked: its check digit is hidden with the rest."))
}

fn vid(x: &In) -> Option<Reading> {
    let d = &x.digits;
    if d.len() != 16 || x.alnum != *d { return None; }
    let v = dv(d); let val = group(d, &[4, 4, 4, 4], " ");
    let r = |verdict, score, s: String| Reading::new("vid", "Aadhaar Virtual ID (VID)", verdict, score, val.clone(), s);
    if d.starts_with('0') || d.starts_with('1') { return Some(r("invalid", 25, "A Virtual ID never begins with 0 or 1.".into())); }
    if is_palindrome(d) { return Some(r("invalid", 25, "A Virtual ID is never the same backwards.".into())); }
    if !verhoeff_ok(&v) {
        let c = verhoeff_digit(&v[..15]);
        let mut x = r("invalid", 35, format!("Its check digit is wrong: the last digit should be {c}, not {}.", v[15]));
        x.fix = Some(format!("{}{c}", &d[..15])); return Some(x);
    }
    Some(r("valid", 78, "A valid Aadhaar Virtual ID by its check digit (Verhoeff).".into())
        .n("A VID stands in for an Aadhaar number for e-KYC; UIDAI makes a new one on request, and the old one stops working."))
}

const PAN_TYPES: &[(u8, &str)] = &[(b'A', "Association of Persons (AOP)"), (b'B', "Body of Individuals (BOI)"), (b'C', "Company"), (b'F', "Firm / Limited Liability Partnership"),
    (b'G', "Government agency"), (b'H', "Hindu Undivided Family (HUF)"), (b'J', "Artificial juridical person"), (b'K', "Krish (trust)"), (b'L', "Local authority"),
    (b'P', "Individual"), (b'T', "Trust")];
fn pan_shape(s: &str) -> bool { s.len() == 10 && s.bytes().take(5).all(|c| c.is_ascii_uppercase()) && s[5..9].bytes().all(|c| c.is_ascii_digit()) && s.as_bytes()[9].is_ascii_uppercase() }
fn pan_type(s: &str) -> Option<&'static str> { PAN_TYPES.iter().find(|(c, _)| *c == s.as_bytes()[3]).map(|x| x.1) }

fn pan(x: &In) -> Option<Reading> {
    let s = &x.alnum;
    if !pan_shape(s) { return None; }
    let Some(t) = pan_type(s) else {
        return Some(Reading::new("pan", "PAN (Permanent Account Number)", "invalid", 35, s.clone(), format!("The 4th letter of a PAN says who holds it, and “{}” is none of the holder types (P individual, C company, H HUF, F firm …).", &s[3..4])));
    };
    if &s[5..9] == "0000" { return Some(Reading::new("pan", "PAN (Permanent Account Number)", "invalid", 35, s.clone(), "No PAN has 0000 as its four digits.")); }
    let who = if s.as_bytes()[3] == b'P' { "the first letter of the holder’s surname" } else { "the first letter of the holder’s name" };
    Some(Reading::new("pan", "PAN (Permanent Account Number)", "format", 70, s.clone(), format!("The shape of a PAN: held by {} ({}).", if t.starts_with('I') { "an individual" } else { t }, &s[3..4]))
        .f("Holder", t).f("5th letter", format!("{} — {who}", &s[4..5])).f("Last letter", format!("{} — a check letter", &s[9..10]))
        .n("A PAN can only be checked for its shape here: the rule of its last letter is not public. The Income Tax e-filing site (“Verify your PAN”) says whether it exists."))
}

fn tan(x: &In) -> Option<Reading> {
    let s = &x.alnum;
    if s.len() != 10 || !s.bytes().take(4).all(|c| c.is_ascii_uppercase()) || !s[4..9].bytes().all(|c| c.is_ascii_digit()) || !s.as_bytes()[9].is_ascii_uppercase() { return None; }
    Some(Reading::new("tan", "TAN (tax deduction account number)", "format", 62, s.clone(), "The shape of a TAN — the number of a business or office that deducts tax at source (TDS).")
        .f("First three letters", format!("{} — the city of the tax office", &s[..3])).f("4th letter", format!("{} — the first letter of the deductor’s name", &s[3..4]))
        .n("A TAN has no public check letter; the e-filing site’s “Know TAN Details” says whose it is."))
}

const GST_STATES: &[(&str, &str)] = &[("01", "Jammu and Kashmir"), ("02", "Himachal Pradesh"), ("03", "Punjab"), ("04", "Chandigarh"), ("05", "Uttarakhand"), ("06", "Haryana"),
    ("07", "Delhi"), ("08", "Rajasthan"), ("09", "Uttar Pradesh"), ("10", "Bihar"), ("11", "Sikkim"), ("12", "Arunachal Pradesh"), ("13", "Nagaland"), ("14", "Manipur"),
    ("15", "Mizoram"), ("16", "Tripura"), ("17", "Meghalaya"), ("18", "Assam"), ("19", "West Bengal"), ("20", "Jharkhand"), ("21", "Odisha"), ("22", "Chhattisgarh"),
    ("23", "Madhya Pradesh"), ("24", "Gujarat"), ("25", "Daman and Diu (until 2020; merged into 26)"), ("26", "Dadra and Nagar Haveli and Daman and Diu"), ("27", "Maharashtra"),
    ("28", "Andhra Pradesh (its code before 2014; GSTINs use 37)"), ("29", "Karnataka"), ("30", "Goa"), ("31", "Lakshadweep"), ("32", "Kerala"), ("33", "Tamil Nadu"), ("34", "Puducherry"),
    ("35", "Andaman and Nicobar Islands"), ("36", "Telangana"), ("37", "Andhra Pradesh"), ("38", "Ladakh"), ("97", "Other Territory"), ("99", "Centre Jurisdiction")];

fn gstin(x: &In) -> Option<Reading> {
    let s = &x.alnum;
    if s.len() != 15 || !s[..2].bytes().all(|c| c.is_ascii_digit()) { return None; }
    let mid = &s[2..12];
    let tan_based = !pan_shape(mid) && mid.bytes().take(4).all(|c| c.is_ascii_uppercase()) && mid[4..9].bytes().all(|c| c.is_ascii_digit()) && mid.as_bytes()[9].is_ascii_uppercase();
    if !pan_shape(mid) && !tan_based { return None; }
    let t = "GSTIN (GST registration)";
    let r = |verdict, score, sm: String| Reading::new("gstin", t, verdict, score, s.clone(), sm);
    let Some(state) = lin(GST_STATES, &s[..2]) else { return Some(r("invalid", 40, format!("A GSTIN begins with its state’s code, and {} is no state’s.", &s[..2]))); };
    let b = s.as_bytes();
    if b[12] == b'0' { return Some(r("invalid", 40, "Its 13th character counts the holder’s registrations in the state (1 – 9, then A – Z) and is never 0.".into())); }
    if b[13] != b'Z' { return Some(r("invalid", 40, format!("The 14th character of a GSTIN is Z; here it is {}.", b[13] as char))); }
    if !tan_based && pan_type(mid).is_none() { return Some(r("invalid", 40, format!("Its PAN ({mid}) has “{}” as its 4th letter, which is no PAN holder type.", &mid[3..4]))); }
    let vals: Vec<u32> = s.bytes().map(v36).collect();
    if luhn_sum(&vals, 36) != 0 {
        let c = A36.as_bytes()[luhn_digit(&vals[..14], 36) as usize] as char;
        let mut x = r("invalid", 45, format!("Its check character is wrong: with these first fourteen characters the last one should be {c}, not {}.", b[14] as char));
        x.fix = Some(format!("{}{c}", &s[..14])); return Some(x);
    }
    let reg = v36(b[12]);
    let mut x = r("valid", 82, format!("A valid GSTIN by its check character: a registration in {}.", state.split(" (").next().unwrap()))
        .f("State", format!("{} — {}", &s[..2], state));
    if tan_based { x = x.f("TAN", format!("{mid} — a tax deductor’s registration (TDS) under its TAN")); }
    else { x = x.f("PAN", format!("{mid} — {}", pan_type(mid).unwrap())); }
    Some(x.f("Registration", format!("the holder’s {} in this state", ord(reg))).f("Check character", (b[14] as char).to_string())
        .n("Whether the registration is active, and whose it is, the GST portal’s “Search Taxpayer” says."))
}

fn epic(x: &In) -> Option<Reading> {
    let s = &x.alnum;
    if s.len() != 10 || !s.bytes().take(3).all(|c| c.is_ascii_uppercase()) || !s[3..].bytes().all(|c| c.is_ascii_digit()) { return None; }
    let v = digits_u32(&s[3..]);
    let t = "Voter ID (EPIC number)";
    if luhn_sum(&v, 10) != 0 {
        let c = luhn_digit(&v[..6], 10);
        let mut r = Reading::new("epic", t, "invalid", 38, s.clone(), format!("The shape of a voter ID, but its last digit does not match the check new voter IDs carry (it would be {c}). Older cards follow other rules."));
        r.fix = Some(format!("{}{c}", &s[..9])); return Some(r);
    }
    Some(Reading::new("epic", t, "valid", 74, s.clone(), "A voter ID number (EPIC) — its last digit matches the check new voter IDs carry.")
        .f("First three letters", format!("{} — the assembly constituency", &s[..3]))
        .n("The Election Commission’s voter search (electoralsearch.eci.gov.in) finds the voter by this number."))
}

fn ifsc(x: &In) -> Option<Reading> {
    let s = &x.alnum;
    if s.len() != 11 || !s.bytes().take(4).all(|c| c.is_ascii_uppercase()) || s.as_bytes()[4] != b'0' { return None; }
    let d = ifsc_data();
    let t = "IFSC (bank branch code)";
    let resolve = |v: &'static str| -> String { if v.len() == 4 && v.bytes().all(|c| c.is_ascii_uppercase()) { bank_name(v).map(|n| n.to_string()).unwrap_or(v.to_string()) } else { v.to_string() } };
    let key: [u8; 11] = s.as_bytes().try_into().unwrap();
    let (bank, sub) = if let Some(v) = d.sublet.get(&key) { (Some(resolve(v)), true) }
        else if let Some((_, v)) = d.custom.iter().find(|(k, _)| s.starts_with(k)) { (Some(resolve(v)), true) }
        else { (bank_name(&s[..4]).map(|n| n.to_string()), false) };
    let branch = &s[5..];
    let code: [u8; 4] = s.as_bytes()[..4].try_into().unwrap();
    let listed = d.banks.get(&code).map(|(nums, strs)| {
        if branch.bytes().all(|c| c.is_ascii_digit()) { nums.binary_search(&branch.parse::<u32>().unwrap()).is_ok() }
        else { strs.binary_search(&branch.as_bytes().try_into().unwrap()).is_ok() }
    }).unwrap_or(false);
    match (&bank, listed) {
        (None, _) if !d.banks.contains_key(&code) => Some(Reading::new("ifsc", t, "invalid", 40, s.clone(), format!("The shape of an IFSC, but no bank has the code {} in RBI’s lists.", &s[..4]))),
        _ => {
            let name = bank.clone().unwrap_or_else(|| format!("bank code {} (its name is not in the list)", &s[..4]));
            let mut r = if listed { Reading::new("ifsc", t, "valid", 80, s.clone(), format!("An IFSC in RBI’s lists: a branch of {name}.")) }
                else { Reading::new("ifsc", t, "unlisted", 50, s.clone(), format!("The shape of an IFSC of {name}, but RBI’s lists have no branch {branch} — a mistyped code, or a branch opened or closed since.")) };
            r = r.f("Bank", name).f("Branch code", branch);
            if sub { r = r.n(format!("A bank that works through another bank’s branch network: its IFSC begins with {}’s code.", bank_name(&s[..4]).unwrap_or(&s[..4]))); }
            Some(r.f("Bank code", &s[..4]).n(format!("Checked against {}.", T::IFSC_SOURCE)).n("The 5th character of every IFSC is 0, kept for later use."))
        }
    }
}

const UPI_HANDLES: &[(&str, &str)] = &[("abfspay", "Aditya Birla Capital"), ("airtel", "Airtel Payments Bank"), ("apl", "Amazon Pay"), ("aubank", "AU Small Finance Bank"),
    ("axisb", "CRED (Axis Bank)"), ("axisbank", "Axis Bank"), ("axl", "PhonePe (Axis Bank)"), ("barodampay", "Bank of Baroda"), ("boi", "Bank of India"), ("citi", "Citibank"),
    ("cnrb", "Canara Bank"), ("dbs", "DBS Bank India"), ("federal", "Federal Bank"), ("fifederal", "Fi (Federal Bank)"), ("freecharge", "Freecharge"), ("hdfcbank", "HDFC Bank"),
    ("hsbc", "HSBC"), ("ibl", "PhonePe (ICICI Bank)"), ("icici", "ICICI Bank"), ("idfcbank", "IDFC FIRST Bank"), ("ikwik", "MobiKwik"), ("indus", "IndusInd Bank"),
    ("jupiteraxis", "Jupiter (Axis Bank)"), ("kbl", "Karnataka Bank"), ("kotak", "Kotak Mahindra Bank"), ("kvb", "Karur Vysya Bank"), ("mahb", "Bank of Maharashtra"),
    ("naviaxis", "Navi (Axis Bank)"), ("okaxis", "Google Pay (Axis Bank)"), ("okhdfcbank", "Google Pay (HDFC Bank)"), ("okicici", "Google Pay (ICICI Bank)"), ("oksbi", "Google Pay (State Bank of India)"),
    ("paytm", "Paytm"), ("pnb", "Punjab National Bank"), ("postbank", "India Post Payments Bank"), ("ptaxis", "Paytm (Axis Bank)"), ("pthdfc", "Paytm (HDFC Bank)"), ("ptsbi", "Paytm (State Bank of India)"),
    ("ptyes", "Paytm (Yes Bank)"), ("rapl", "Amazon Pay (RBL Bank)"), ("rbl", "RBL Bank"), ("sbi", "State Bank of India"), ("sc", "Standard Chartered"), ("sliceaxis", "slice (Axis Bank)"),
    ("uco", "UCO Bank"), ("unionbank", "Union Bank of India"), ("upi", "BHIM (NPCI)"), ("waaxis", "WhatsApp (Axis Bank)"), ("wahdfcbank", "WhatsApp (HDFC Bank)"), ("waicici", "WhatsApp (ICICI Bank)"),
    ("wasbi", "WhatsApp (State Bank of India)"), ("yapl", "Amazon Pay (Yes Bank)"), ("ybl", "PhonePe (Yes Bank)"), ("yesbank", "Yes Bank")];

fn upi(x: &In) -> Option<Reading> {
    let s: String = x.raw.chars().filter(|c| !c.is_whitespace()).collect();
    let (local, handle) = s.split_once('@')?;
    if local.is_empty() || handle.is_empty() || handle.contains('@') { return None; }
    let t = "UPI ID";
    let low = handle.to_lowercase();
    if handle.contains('.') && !handle.ends_with('.') {
        return Some(Reading::new("upi", t, "invalid", 35, s.clone(), "This looks like an e-mail address: a UPI ID ends in its app’s or bank’s handle (name@okaxis, 98200xxxxx@ybl), never a domain."));
    }
    let local_ok = local.len() >= 2 && local.len() <= 256 && local.bytes().all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c));
    let handle_ok = handle.len() >= 2 && handle.len() <= 64 && handle.as_bytes()[0].is_ascii_alphabetic() && handle.bytes().all(|c| c.is_ascii_alphanumeric() || b".-".contains(&c));
    if !local_ok || !handle_ok {
        return Some(Reading::new("upi", t, "invalid", 35, s.clone(), "Not the shape of a UPI ID: letters, digits, dots, hyphens and underscores before the @, the app’s or bank’s handle after it."));
    }
    let mut r = match lin(UPI_HANDLES, &low) {
        Some(app) => Reading::new("upi", t, "format", 72, s.clone(), format!("The shape of a UPI ID with the handle of {app}.")).f("Handle", format!("@{low} — {app}")),
        None => Reading::new("upi", t, "format", 60, s.clone(), format!("The shape of a UPI ID; its handle @{low} is not in this tab’s list (UPI has hundreds of handles).")).f("Handle", format!("@{low}")),
    };
    if local.len() == 10 && local.bytes().all(|c| c.is_ascii_digit()) && b"6789".contains(&local.as_bytes()[0]) { r = r.f("Before the @", format!("{local} — a mobile number")); }
    Some(r.n("Whether it exists, and whose it is, only the paying app can say: check the name it shows before you pay."))
}

fn pin(x: &In) -> Option<Reading> {
    let d = &x.digits;
    if d.len() != 6 || x.alnum != *d { return None; }
    let t = "PIN code";
    if d.starts_with('0') { return Some(Reading::new("pin", t, "invalid", 35, d.clone(), "No PIN code begins with 0: the first digit is the postal zone, 1 – 9.")); }
    let p = pins();
    let n: u32 = d.parse().unwrap();
    let zone = zone_of(d);
    if d.starts_with('9') {
        return Some(Reading::new("pin", t, "format", 55, d.clone(), "A PIN code of the Army Postal Service (zone 9): field post offices, not a place on the map.").f("Zone", zone));
    }
    match p.pins.binary_search(&n) {
        Ok(i) => {
            let (st, g, others) = &p.info[i];
            if *st == 0 && g.is_empty() {
                // the directory lists a few PIN codes without a district or a state
                let mut r = Reading::new("pin", t, "valid", 74, d.clone(), "A PIN code in India Post’s directory, which lists it without its district and state.");
                if let Some(place) = near_pin(d) { r = r.f("Its first three digits", place); }
                return Some(r.f("Zone", zone).n(format!("From {}.", T::PIN_SOURCE)));
            }
            let si = if *st > 0 { *st - 1 } else { p.pairs[g[0] as usize].1 };
            let state = p.states[si as usize];
            let name = |k: &u16| p.pairs[*k as usize].0.to_string();
            let mut own: Vec<String> = g.iter().filter(|k| p.pairs[**k as usize].1 == si).map(name).collect();
            let mut elsewhere: Vec<String> = g.iter().filter(|k| p.pairs[**k as usize].1 != si).map(|k| format!("{} ({})", name(k), p.states[p.pairs[*k as usize].1 as usize])).collect();
            own.sort(); own.dedup(); elsewhere.sort(); elsewhere.dedup();
            let list = match own.len() { 0 => String::new(), 1 => own[0].clone(), n => format!("{} and {}", own[..n - 1].join(", "), own[n - 1]) };
            let mut r = Reading::new("pin", t, "valid", 78, d.clone(), if list.is_empty() { format!("A PIN code in India Post’s directory, in {state}.") } else { format!("A PIN code in India Post’s directory: {list}, {state}.") })
                .f(if own.len() > 1 { "Districts" } else { "District" }, own.join(", ")).f("State", state);
            if !elsewhere.is_empty() || !others.is_empty() {
                let mut also = elsewhere.clone();
                for k in others { let s = p.states[*k as usize]; if !also.iter().any(|a| a.contains(s)) { also.push(s.to_string()); } }
                r = r.f("Also filed under", also.join(", ")).n("India Post’s directory files some of this PIN code’s post offices under another district or state — usually a slip in the directory, sometimes a PIN code that crosses a border.");
            }
            Some(r.f("Zone", zone).n(format!("From {}.", T::PIN_SOURCE)))
        }
        Err(_) => {
            let near = near_pin(d);
            let mut r = Reading::new("pin", t, "unlisted", 45, d.clone(), format!("The shape of a PIN code, but India Post’s directory (snapshot {}) has no {d}.", T::PIN_VERSION));
            if let Some(place) = near { r = r.f("Its first three digits", place); }
            Some(r.f("Zone", zone))
        }
    }
}
fn zone_of(d: &str) -> String {
    let z = match &d[..1] { "1" => "Northern: Delhi, Haryana, Punjab, Himachal Pradesh, Jammu and Kashmir, Ladakh, Chandigarh", "2" => "Northern: Uttar Pradesh, Uttarakhand",
        "3" => "Western: Rajasthan, Gujarat, Dadra and Nagar Haveli and Daman and Diu", "4" => "Western: Maharashtra, Madhya Pradesh, Chhattisgarh, Goa",
        "5" => "Southern: Andhra Pradesh, Telangana, Karnataka", "6" => "Southern: Tamil Nadu, Kerala, Puducherry, Lakshadweep",
        "7" => "Eastern: West Bengal, Odisha, the North-East, Sikkim, Andaman and Nicobar Islands", "8" => "Eastern: Bihar, Jharkhand", _ => "the Army Postal Service" };
    format!("{} — {z}", &d[..1])
}
/// The place of the PIN codes that share the first three digits (the sorting district): the district most of them name.
fn near_pin(d: &str) -> Option<String> {
    let p = pins();
    let lo: u32 = format!("{}000", &d[..3]).parse().unwrap();
    let a = p.pins.partition_point(|&x| x < lo); let b = p.pins.partition_point(|&x| x < lo + 1000);
    if a == b { return None; }
    let mut count: HashMap<u16, u32> = HashMap::new();
    for i in a..b { for &k in &p.info[i].1 { *count.entry(k).or_default() += 1; } }
    let (&best, _) = count.iter().max_by_key(|(k, c)| (**c, std::cmp::Reverse(**k)))?;
    let (dist, st) = p.pairs[best as usize];
    Some(format!("{} — {} PIN codes, most of them in {dist}, {}", &d[..3], b - a, p.states[st as usize]))
}

// ---------------------------------------------------------------- phone numbers (libphonenumber's rules for India)
fn in_matches(kind: &str, nn: &str) -> bool {
    phone_res().iter().find(|(k, _, _)| *k == kind).map(|(_, re, lens)| lens.contains(&(nn.len() as u8)) && re.is_match(nn)).unwrap_or(false)
}
/// libphonenumber's getNumberType for an Indian national number.
pub fn in_type(nn: &str) -> &'static str {
    if !in_matches("general_desc", nn) { return "unknown"; }
    for k in ["premium_rate", "toll_free", "shared_cost", "voip", "personal_number", "pager", "uan", "voicemail"] { if in_matches(k, nn) { return k; } }
    if in_matches("fixed_line", nn) { return if in_matches("mobile", nn) { "fixed_line_or_mobile" } else { "fixed_line" }; }
    if in_matches("mobile", nn) { return "mobile"; }
    "unknown"
}
/// libphonenumber's formatting of an Indian national number: (national, international).
pub fn in_format(nn: &str) -> (String, String) {
    let (nat, intl) = phone_fmts();
    let apply = |list: &Vec<Fmt>, national: bool| -> Option<String> {
        for (re, f, ldp, rule) in list {
            if let Some(l) = ldp { if !l.is_match(nn) { continue; } }
            let Some(c) = re.captures(nn) else { continue };
            let mut fmt = f.to_string();
            if national && !rule.is_empty() { fmt = fmt.replacen("$1", rule, 1); }
            let mut out = String::new(); let b = fmt.as_bytes(); let mut i = 0;
            while i < b.len() {
                if b[i] == b'$' && i + 1 < b.len() && b[i + 1].is_ascii_digit() { let g = (b[i + 1] - b'0') as usize; out.push_str(c.get(g).map(|m| m.as_str()).unwrap_or("")); i += 2; }
                else { out.push(b[i] as char); i += 1; }
            }
            return Some(out);
        }
        None
    };
    let n = apply(nat, true).unwrap_or_else(|| nn.to_string());
    let i = if intl.is_empty() { apply(nat, false) } else { apply(intl, false) }.unwrap_or_else(|| nn.to_string());
    (n, format!("+91 {i}"))
}
/// libphonenumber's place of an Indian number (its longest geocoding prefix), if any.
pub fn in_place(nn: &str) -> Option<&'static str> {
    let (descs, m) = geo();
    for l in (1..=nn.len().min(9)).rev() { if let Some(&k) = m.get(&(l as u8, nn[..l].parse().unwrap())) { return Some(descs[k as usize]); } }
    None
}

const SHORT: &[(&str, &str)] = &[("100", "Police"), ("101", "Fire"), ("102", "Ambulance"), ("108", "Emergency ambulance (most states)"), ("112", "the national emergency number (police, fire, ambulance)"),
    ("139", "Railway enquiry and help"), ("1091", "Women’s helpline"), ("1098", "Childline (children in need of help)"), ("1930", "the cyber-crime helpline (online fraud)")];

fn phone(x: &In) -> Option<Reading> {
    let d = &x.digits;
    // only digits and the usual signs: a + at the start, spaces, hyphens, dots, brackets
    if d.is_empty() || x.raw.chars().any(|c| !(c.is_ascii_digit() || " +-.()/".contains(c))) { return None; }
    let t = "Phone number";
    if !x.plus && !d.starts_with("00") {
        if (3..=4).contains(&d.len()) {
            if let Some(name) = lin(SHORT, d) { return Some(Reading::new("phone", t, "valid", 75, d.clone(), format!("A short number in India: {name}.")).n("Free to call from any phone, also without a SIM card for 112.")); }
            if in_matches("emergency", d) { return Some(Reading::new("phone", t, "valid", 70, d.clone(), "A short emergency number in India.")); }
            return None;
        }
    }
    let intl = x.plus || d.starts_with("00");
    let digits = if !x.plus && d.starts_with("00") { &d[2..] } else { &d[..] };
    if intl {
        let cc = (1..=3).filter(|&l| l <= digits.len()).find_map(|l| { let c: u16 = digits[..l].parse().ok()?; T::CALLING.iter().find(|(k, _)| *k == c).map(|(k, r)| (*k, *r, l)) });
        let Some((cc, regions, l)) = cc else { return Some(Reading::new("phone", t, "invalid", 35, format!("+{digits}"), "No country has the calling code these digits begin with.")); };
        let nn = &digits[l..];
        if cc == 91 { return indian(nn, t, true); }
        let names: Vec<&str> = regions.iter().filter_map(|r| region_name(r)).collect();
        let place = match (cc, names.len()) { (1, _) => "the North American Numbering Plan (the United States, Canada and much of the Caribbean)".to_string(), (_, 0) => "an international network".to_string(),
            (_, 1) => names[0].to_string(), (_, n) if n <= 5 => format!("{} (the code is shared with {})", names[0], names[1..].join(", ")), (_, n) => format!("{} and {} more", names[0], n - 1) };
        if nn.len() < 4 || digits.len() > 15 { return Some(Reading::new("phone", t, "invalid", 35, format!("+{cc} {nn}"), format!("Calling code +{cc} ({place}), but a number has 4 – 14 digits after it, at most 15 in all."))); }
        return Some(Reading::new("phone", t, "format", 60, format!("+{cc} {nn}"), format!("A phone number in {place} (calling code +{cc}).")).f("Country", place)
            .n("Numbers of other countries are named by their calling code only; their own rules are not checked here."));
    }
    // an Indian number written without +91
    if d.len() == 11 && d.starts_with('0') { return indian(&d[1..], t, false); }
    if d.len() == 12 && d.starts_with("91") && in_type(&d[2..]) != "unknown" { return indian(&d[2..], t, false).map(|r| r.n("Written with 91 in front but without the +: dial +91 from abroad.")); }
    if (8..=13).contains(&d.len()) && (d.len() == 10 || d.starts_with('1')) { return indian(d, t, false); }
    None
}
fn indian(nn: &str, t: &'static str, plus: bool) -> Option<Reading> {
    let ty = in_type(nn);
    let (nat, intl) = in_format(nn);
    if ty == "unknown" {
        if nn.len() != 10 && !plus { return None; }
        return Some(Reading::new("phone", t, "invalid", 35, format!("+91 {nn}"), "Not a number in use in India by libphonenumber’s rules (the numbering plan Android and most apps follow): an Indian number has 10 digits after +91 (0 and the STD code for a landline)."));
    }
    let what = match ty { "mobile" => "an Indian mobile number", "fixed_line" => "an Indian landline number", "fixed_line_or_mobile" => "an Indian landline or mobile number",
        "toll_free" => "an Indian toll-free number (free to call)", "premium_rate" => "an Indian premium-rate number (the caller pays more)",
        "shared_cost" => "an Indian shared-cost number (1860: the caller pays a local call’s rate)", "uan" => "an Indian universal access number (one number for a business’s many lines)", _ => "an Indian phone number" };
    let shown_nat = if ty == "mobile" { nat.trim_start_matches('0').to_string() } else { nat.clone() };
    let mut r = Reading::new("phone", t, "valid", 76, intl.clone(), format!("A valid number: {what}.")).f("In India", shown_nat).f("From abroad", intl);
    if ty == "fixed_line" {
        if let Some(p) = in_place(nn) { r = r.f("Place", p); }
        let std = nat.split(' ').next().unwrap_or("");
        if std.starts_with('0') { r = r.f("STD code", std); }
    } else if ty == "fixed_line_or_mobile" {
        if let Some(p) = in_place(nn) { r = r.f("Place, if a landline", p); }
    }
    if ty == "mobile" { r = r.n("Since numbers can move between operators (portability), the first digits no longer say which operator or state a mobile number belongs to."); }
    Some(r.n(format!("By {}.", T::PHONE_SOURCE)))
}

// ---------------------------------------------------------------- vehicles, licences, companies
const RTO_STATES: &[(&str, &str)] = &[("AN", "Andaman and Nicobar Islands"), ("AP", "Andhra Pradesh"), ("AR", "Arunachal Pradesh"), ("AS", "Assam"), ("BR", "Bihar"), ("CG", "Chhattisgarh"),
    ("CH", "Chandigarh"), ("DD", "Dadra and Nagar Haveli and Daman and Diu"), ("DL", "Delhi"), ("DN", "Dadra and Nagar Haveli (until 2020; now DD)"), ("GA", "Goa"), ("GJ", "Gujarat"),
    ("HP", "Himachal Pradesh"), ("HR", "Haryana"), ("JH", "Jharkhand"), ("JK", "Jammu and Kashmir"), ("KA", "Karnataka"), ("KL", "Kerala"), ("LA", "Ladakh"), ("LD", "Lakshadweep"),
    ("MH", "Maharashtra"), ("ML", "Meghalaya"), ("MN", "Manipur"), ("MP", "Madhya Pradesh"), ("MZ", "Mizoram"), ("NL", "Nagaland"), ("OD", "Odisha"), ("OR", "Odisha (OR until 2012; now OD)"),
    ("PB", "Punjab"), ("PY", "Puducherry"), ("RJ", "Rajasthan"), ("SK", "Sikkim"), ("TG", "Telangana"), ("TN", "Tamil Nadu"), ("TR", "Tripura"), ("TS", "Telangana (TS 2014 – 2024; now TG)"),
    ("UA", "Uttarakhand (UA until 2007; now UK)"), ("UK", "Uttarakhand"), ("UP", "Uttar Pradesh"), ("WB", "West Bengal")];
const DELHI_CLASS: &[(u8, &str)] = &[(b'C', "car"), (b'E', "e-rickshaw"), (b'L', "electric vehicle"), (b'P', "passenger vehicle (bus)"), (b'R', "auto-rickshaw"), (b'S', "two-wheeler"),
    (b'T', "tourist vehicle"), (b'V', "pick-up van"), (b'Y', "taxi")];

fn vehicle(x: &In) -> Option<Reading> {
    let s = &x.alnum;
    let t = "Vehicle registration number";
    let b = s.as_bytes();
    // Bharat series: 22 BH 1234 AA
    if s.len() >= 9 && s.len() <= 10 && b[..2].iter().all(u8::is_ascii_digit) && &s[2..4] == "BH" && b[4..8].iter().all(u8::is_ascii_digit) && b[8..].iter().all(|c| c.is_ascii_uppercase() && *c != b'I' && *c != b'O') {
        return Some(Reading::new("vehicle", t, "format", 68, format!("{} BH {} {}", &s[..2], &s[4..8], &s[8..]), format!("A Bharat-series (BH) registration of 20{}: valid in every state, for those who move between states for work.", &s[..2]))
            .f("Registered", format!("20{}", &s[..2])).f("Number", &s[4..8]).f("Letters", &s[8..]));
    }
    if s.len() < 5 || s.len() > 11 || !b[0].is_ascii_uppercase() || !b[1].is_ascii_uppercase() { return None; }
    let state = lin(RTO_STATES, &s[..2])?;
    let rest = &s[2..];
    let nd = rest.bytes().take_while(u8::is_ascii_digit).count();
    if nd == 0 || nd > 2 { return None; }
    let after = &rest[nd..];
    let nl = after.bytes().take_while(u8::is_ascii_uppercase).count();
    let num = &after[nl..];
    if nl > 3 || num.is_empty() || num.len() > 4 || !num.bytes().all(|c| c.is_ascii_digit()) { return None; }
    let (rto, series) = (&rest[..nd], &after[..nl]);
    let shown = [&s[..2], rto, series, num].iter().filter(|p| !p.is_empty()).cloned().collect::<Vec<_>>().join(" ");
    let mut r = Reading::new("vehicle", t, "format", 65, shown, format!("The shape of a vehicle registration of {}.", state.split(" (").next().unwrap()))
        .f("State", format!("{} — {state}", &s[..2])).f("RTO", format!("{} {rto} — the regional transport office that registered it", &s[..2]));
    if !series.is_empty() { r = r.f("Series", series); }
    if &s[..2] == "DL" && !series.is_empty() { if let Some((_, c)) = DELHI_CLASS.iter().find(|(c, _)| *c == series.as_bytes()[0]) { r = r.f("Kind (Delhi)", format!("{} — {c}", &series[..1])); } }
    Some(r.f("Number", num).n("Whose it is and its details: the Parivahan (VAHAN) “Know your vehicle details” service, or the mParivahan app."))
}

fn dl(x: &In) -> Option<Reading> {
    let s = &x.alnum; let b = s.as_bytes();
    if s.len() != 15 || !b[0].is_ascii_uppercase() || !b[1].is_ascii_uppercase() || !b[2..].iter().all(u8::is_ascii_digit) { return None; }
    let state = lin(RTO_STATES, &s[..2])?;
    let year: u32 = s[4..8].parse().unwrap();
    if !(1950..=2026).contains(&year) { return None; }
    Some(Reading::new("dl", "Driving licence number", "format", 58, format!("{}{} {}", &s[..2], &s[2..4], &s[4..]), format!("The shape of a driving licence issued in {} in {year}.", state.split(" (").next().unwrap()))
        .f("Issued by", format!("RTO {} {} — {state}", &s[..2], &s[2..4])).f("Year", year.to_string()).f("Number", &s[8..])
        .n("The national format (Sarathi) since about 2010; older licences follow each state’s own. The Parivahan site’s “DL status” says whether it is valid."))
}

fn passport(x: &In) -> Option<Reading> {
    let s = &x.alnum;
    if s.len() != 8 || !s.as_bytes()[0].is_ascii_uppercase() || !s[1..].bytes().all(|c| c.is_ascii_digit()) { return None; }
    Some(Reading::new("passport", "Passport number (India)", "format", 25, s.clone(), "The shape of an Indian passport number: a letter and seven digits.")
        .n("A passport number has no public check digit (the digits in a passport’s machine-readable lines do: those are another code)."))
}

const CIN_STATES: &[(&str, &str)] = &[("AN", "Andaman and Nicobar Islands"), ("AP", "Andhra Pradesh"), ("AR", "Arunachal Pradesh"), ("AS", "Assam"), ("BR", "Bihar"), ("CH", "Chandigarh"),
    ("CT", "Chhattisgarh"), ("DD", "Daman and Diu"), ("DL", "Delhi"), ("DN", "Dadra and Nagar Haveli"), ("GA", "Goa"), ("GJ", "Gujarat"), ("HP", "Himachal Pradesh"), ("HR", "Haryana"),
    ("JH", "Jharkhand"), ("JK", "Jammu and Kashmir"), ("KA", "Karnataka"), ("KL", "Kerala"), ("LA", "Ladakh"), ("LD", "Lakshadweep"), ("MH", "Maharashtra"), ("ML", "Meghalaya"),
    ("MN", "Manipur"), ("MP", "Madhya Pradesh"), ("MZ", "Mizoram"), ("NL", "Nagaland"), ("OR", "Odisha"), ("PB", "Punjab"), ("PY", "Puducherry"), ("RJ", "Rajasthan"), ("SK", "Sikkim"),
    ("TG", "Telangana"), ("TN", "Tamil Nadu"), ("TR", "Tripura"), ("UP", "Uttar Pradesh"), ("UR", "Uttarakhand"), ("WB", "West Bengal")];
const CIN_KINDS: &[(&str, &str)] = &[("FLC", "financial lease company"), ("FTC", "subsidiary of a foreign company"), ("GAP", "public company limited by guarantee"),
    ("GAT", "private company limited by guarantee"), ("GOI", "company of the Government of India"), ("NPL", "not-for-profit company (section 8)"), ("OPC", "one person company"),
    ("PLC", "public limited company"), ("PTC", "private limited company"), ("SGC", "company of a state government"), ("ULL", "public unlimited company"), ("ULT", "private unlimited company")];

fn cin(x: &In) -> Option<Reading> {
    let s = &x.alnum; let b = s.as_bytes();
    if s.len() != 21 || !(b[0] == b'L' || b[0] == b'U') || !b[1..6].iter().all(u8::is_ascii_digit) || !b[6..8].iter().all(u8::is_ascii_uppercase)
        || !b[8..12].iter().all(u8::is_ascii_digit) || !b[12..15].iter().all(u8::is_ascii_uppercase) || !b[15..].iter().all(u8::is_ascii_digit) { return None; }
    let t = "CIN (company identification number)";
    let state = lin(CIN_STATES, &s[6..8]); let kind = lin(CIN_KINDS, &s[12..15]);
    if state.is_none() || kind.is_none() {
        return Some(Reading::new("cin", t, "invalid", 35, s.clone(), format!("The shape of a CIN, but {} is no {}.", if state.is_none() { &s[6..8] } else { &s[12..15] }, if state.is_none() { "state of a Registrar of Companies" } else { "kind of company" })));
    }
    Some(Reading::new("cin", t, "format", 72, s.clone(), format!("The shape of a CIN: a {} registered in {} in {}.", kind.unwrap(), state.unwrap(), &s[8..12]))
        .f("Listed", if b[0] == b'L' { "L — its shares are listed on a stock exchange" } else { "U — not listed" }).f("Industry code", format!("{} (NIC)", &s[1..6]))
        .f("State", format!("{} — {}", &s[6..8], state.unwrap())).f("Year", &s[8..12]).f("Kind", format!("{} — {}", &s[12..15], kind.unwrap())).f("Registration number", &s[15..])
        .n("The Ministry of Corporate Affairs’ site (“View company master data”) shows the company."))
}

fn udyam(x: &In) -> Option<Reading> {
    let s = &x.alnum; let b = s.as_bytes();
    if s.len() != 16 || !s.starts_with("UDYAM") || !b[5..7].iter().all(u8::is_ascii_uppercase) || !b[7..].iter().all(u8::is_ascii_digit) { return None; }
    let state = lin(RTO_STATES, &s[5..7]).or_else(|| lin(CIN_STATES, &s[5..7]));
    let t = "Udyam registration (MSME)";
    let Some(state) = state else { return Some(Reading::new("udyam", t, "invalid", 35, s.clone(), format!("The shape of a Udyam number, but {} is no state’s code.", &s[5..7]))); };
    Some(Reading::new("udyam", t, "format", 74, format!("UDYAM-{}-{}-{}", &s[5..7], &s[7..9], &s[9..]), format!("The shape of a Udyam registration (a micro, small or medium enterprise) in {}.", state.split(" (").next().unwrap()))
        .f("State", format!("{} — {state}", &s[5..7])).f("District code", &s[7..9]).f("Number", &s[9..]).n("The Udyam portal (udyamregistration.gov.in) prints the certificate by this number."))
}

fn uan(x: &In) -> Option<Reading> {
    let d = &x.digits;
    if d.len() != 12 || x.alnum != *d || !d.starts_with("10") { return None; }
    Some(Reading::new("uan", "UAN (EPF account)", "format", 20, group(d, &[4, 4, 4], " "), "Could be an EPF Universal Account Number: twelve digits, most of them beginning with 10.")
        .n("A UAN has no check digit; the EPFO member portal shows the account."))
}

fn account(x: &In) -> Option<Reading> {
    let d = &x.digits;
    if d.len() < 9 || d.len() > 18 || x.alnum != *d { return None; }
    Some(Reading::new("account", "Bank account number", "format", 10, d.clone(), "Could be an Indian bank account number (9 – 18 digits).")
        .n("Indian account numbers have no public check digit: a transfer is checked by the account number together with the branch’s IFSC."))
}

// ---------------------------------------------------------------- cards, IMEI, SIM
/// credit-card-type's matching (patterns as [min, max] of the card's first digits; the longest pattern that matches wins,
/// of two as long the network tried first), with RuPay's ranges first.
pub fn card_networks(d: &str) -> Vec<(&'static str, usize)> {
    let mut out = Vec::new();
    for (name, pats, _, _, _, _) in T::CARDS {
        for &(lo, hi) in pats.iter() {
            let len = lo.to_string().len();
            if d.len() < len { continue; }
            let v: u32 = d[..len].parse().unwrap();
            let hs = hi.to_string(); let hi2: u32 = hs[..len.min(hs.len())].parse().unwrap();
            if v >= lo && v <= hi2 { out.push((*name, len)); break; }
        }
    }
    out
}
fn card(x: &In) -> Option<Reading> {
    let d = &x.digits;
    if d.len() < 12 || d.len() > 19 || x.alnum != *d { return None; }
    let nets = card_networks(d);
    let best = nets.iter().enumerate().max_by_key(|(i, (_, l))| (*l, std::cmp::Reverse(*i))).map(|(_, n)| n.0);
    let v = digits_u32(d);
    let ok = luhn_sum(&v, 10) == 0;
    let t = "Payment card number";
    let Some(net) = best else {
        if !ok || d.len() != 16 { return None; }
        return Some(Reading::new("card", t, "format", 30, group(d, &[4, 4, 4, 4], " "), "Sixteen digits that pass the Luhn check of card numbers — of no card network this tab knows."));
    };
    let row = T::CARDS.iter().find(|r| r.0 == net).unwrap();
    let mut gaps = vec![]; let mut prev = 0usize;
    for &g in row.3 { gaps.push(g as usize - prev); prev = g as usize; }
    let shown = group(d, &gaps, " ");
    let others: Vec<&str> = nets.iter().map(|n| n.0).filter(|n| *n != net).collect();
    if !ok {
        let c = luhn_digit(&v[..v.len() - 1], 10);
        let mut r = Reading::new("card", t, "invalid", if d.len() >= 15 { 45 } else { 30 }, shown, format!("A {net} card number would end in {c} with these digits: its check digit (Luhn) is wrong — a digit is mistyped."));
        r.fix = Some(format!("{}{c}", &d[..d.len() - 1])); return Some(r.f("Network", net));
    }
    // a short "card" (Maestro takes 12 – 19 digits from a 6) is more often an Aadhaar number or a barcode that happens to pass
    let mut r = Reading::new("card", t, "valid", match d.len() { 15.. => 80, 13 | 14 => 55, _ => 40 }, shown, format!("A valid {net} card number by its check digit (Luhn)."))
        .f("Network", net).f("Security code", format!("{} digits on the card ({})", row.5, row.4));
    if !row.2.contains(&(d.len() as u8)) { r = r.n(format!("{net} cards have {} digits; this one has {}.", row.2.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(", "), d.len())); }
    if !others.is_empty() { r = r.f("Also", format!("these first digits are used by {} too", others.join(", "))); }
    Some(r.n("The check digit tells mistyped numbers apart, not whether a card exists or works.").n("Never type a card’s number into a site you do not trust — this tab works on the device."))
}

const IMEI_BODIES: &[(&str, &str)] = &[("00", "a test IMEI"), ("01", "PTCRB (United States)"), ("30", "Iridium (United States)"), ("33", "DGPT (France)"), ("35", "BABT (United Kingdom)"),
    ("44", "BABT (United Kingdom)"), ("45", "NTA (Denmark)"), ("49", "BZT ETS (Germany)"), ("50", "BZT ETS (Germany)"), ("51", "Cetecom ICT (Germany)"), ("52", "Cetecom ICT (Germany)"),
    ("53", "TÜV (Germany)"), ("54", "Phoenix Test Lab (Germany)"), ("86", "TAF (China)"), ("91", "MSAI (India)"), ("98", "BABT (United Kingdom)"), ("99", "GHA (multi-standard devices)")];

fn imei(x: &In) -> Option<Reading> {
    let d = &x.digits;
    if !(14..=16).contains(&d.len()) || x.alnum != *d { return None; }
    let t = "IMEI (a phone’s identity)";
    let body = lin(IMEI_BODIES, &d[..2]);
    let common = |r: Reading| -> Reading {
        let mut r = r.f("Type allocation code (TAC)", format!("{} — the maker and model, from the GSMA’s list (not public)", &d[..8])).f("Serial number", &d[8..14]);
        if let Some(b) = body { r = r.f("First two digits", format!("{} — {b}", &d[..2])); }
        r.n("*#06# on a phone shows its IMEI; the government’s Sanchar Saathi (sancharsaathi.gov.in) says whether a phone is reported lost or stolen.")
    };
    let v = digits_u32(d);
    match d.len() {
        15 => {
            if luhn_sum(&v, 10) != 0 {
                let c = luhn_digit(&v[..14], 10);
                let mut r = common(Reading::new("imei", t, "invalid", if body.is_some() { 45 } else { 30 }, group(d, &[2, 6, 6, 1], " "), format!("Its check digit (Luhn) is wrong: the 15th digit should be {c}, not {}.", v[14])));
                r.fix = Some(format!("{}{c}", &d[..14])); Some(r)
            } else {
                Some(common(Reading::new("imei", t, "valid", if body.is_some() { 82 } else { 66 }, group(d, &[2, 6, 6, 1], " "), "A valid IMEI by its check digit (Luhn).")).f("Check digit", &d[14..]))
            }
        }
        14 => { if body.is_none() { return None; } let c = luhn_digit(&v, 10);
            Some(common(Reading::new("imei", t, "format", 45, group(d, &[2, 6, 6], " "), format!("An IMEI without its check digit — with it, it is {d}{c}.")))) }
        _ => { if body.is_none() { return None; }
            Some(common(Reading::new("imei", "IMEISV (IMEI with software version)", "format", 45, group(d, &[2, 6, 6, 2], " "), format!("An IMEISV: the IMEI’s first fourteen digits and the software version {}.", &d[14..]))).f("Software version", &d[14..])) }
    }
}

fn iccid(x: &In) -> Option<Reading> {
    let d = &x.digits;
    if !(18..=20).contains(&d.len()) || x.alnum != *d || !d.starts_with("89") { return None; }
    let rest = &d[2..];
    let cc = (1..=3).find_map(|l| { let c: u16 = rest[..l].parse().ok()?; T::CALLING.iter().find(|(k, _)| *k == c).map(|(k, r)| (*k, *r, l)) });
    let t = "SIM card number (ICCID)";
    let country = cc.map(|(c, r, _)| { let n: Vec<&str> = r.iter().filter_map(|x| region_name(x)).collect(); format!("+{c} — {}", if c == 1 { "North America".to_string() } else { n.first().copied().unwrap_or("an international network").to_string() }) });
    let v = digits_u32(d);
    let shown = group(d, &[4, 4, 4, 4, 4], " ");
    if luhn_sum(&v, 10) != 0 {
        let c = luhn_digit(&v[..v.len() - 1], 10);
        let mut r = Reading::new("iccid", t, "invalid", 40, shown, format!("The shape of a SIM card’s number, but its check digit (Luhn) is wrong: the last digit should be {c}."));
        r.fix = Some(format!("{}{c}", &d[..d.len() - 1])); return Some(r);
    }
    let mut r = Reading::new("iccid", t, "valid", 72, shown, "A valid SIM card number (ICCID) by its check digit (Luhn).").f("89", "telecommunications");
    if let Some(c) = country { r = r.f("Country", c); }
    if let Some((_, _, l)) = cc { if rest.len() > l + 2 { r = r.f("Issuer", format!("{} — the operator’s code", &rest[l..l + 2])); } }
    Some(r.n("Printed on the SIM card and its holder; the phone’s settings show it too (About → SIM status)."))
}

// ---------------------------------------------------------------- books, barcodes
/// stdnum's numdb walk (numdb.NumDB._find): at each level every range that matches the digits takes part — the first
/// one cuts the part to its length, the agencies are merged and the next level is all their children.
pub fn isbn_parts(n13: &str) -> Vec<(String, Option<&'static str>)> {
    let (ag, root) = isbn_db();
    fn find(number: &str, level: &[&'static Rg], ag: &[&'static str], out: &mut Vec<(String, Option<&'static str>)>) {
        if number.is_empty() { return; }
        let (mut part, mut agency, mut next): (&str, Option<&'static str>, Vec<&'static Rg>) = (number, None, vec![]);
        for r in level {
            let l = r.len as usize;
            if part.len() >= l { let v: u32 = part[..l].parse().unwrap(); if v >= r.lo && v <= r.hi { part = &part[..l]; if r.agency > 0 { agency = Some(ag[r.agency as usize - 1]); } next.extend(r.kids.iter()); } }
        }
        out.push((part.to_string(), agency));
        find(&number[part.len()..], &next, ag, out);
    }
    let mut out = vec![];
    find(n13, &root.iter().collect::<Vec<_>>(), ag, &mut out);
    out
}
fn isbn10_check(d9: &str) -> char { let s: u32 = d9.bytes().enumerate().map(|(i, c)| (10 - i as u32) * (c - b'0') as u32).sum(); match (11 - s % 11) % 11 { 10 => 'X', c => (b'0' + c as u8) as char } }

fn isbn(x: &In) -> Option<Reading> {
    let s = &x.alnum; let b = s.as_bytes();
    let t = "ISBN (a book’s number)";
    let n13: String;
    let mut r: Reading;
    if s.len() == 10 && b[..9].iter().all(u8::is_ascii_digit) && (b[9].is_ascii_digit() || b[9] == b'X') {
        let c = isbn10_check(&s[..9]);
        if c != b[9] as char {
            let mut r = Reading::new("isbn", t, "invalid", 40, s.clone(), format!("An ISBN-10’s check digit is wrong: with these nine digits it should be {c}, not {}.", b[9] as char));
            r.fix = Some(format!("{}{c}", &s[..9])); return Some(r);
        }
        let d12 = format!("978{}", &s[..9]); n13 = format!("{d12}{}", ean_digit(&dv(&d12)));
        // ten bare digits are more often a mobile number that happens to pass: an ISBN-10 leads when written with its
        // hyphens or spaces, or named
        let written = x.raw.contains(['-', ' ']) || x.hint.contains(&"isbn");
        r = Reading::new("isbn", t, "valid", if written { 84 } else { 60 }, String::new(), "A valid ISBN-10 by its check digit.");
    } else if s.len() == 13 && b.iter().all(u8::is_ascii_digit) && (s.starts_with("978") || s.starts_with("979")) {
        let c = ean_digit(&dv(&s[..12]));
        if c != b[12] - b'0' {
            let mut r = Reading::new("isbn", t, "invalid", 45, s.clone(), format!("An ISBN-13’s check digit is wrong: with these twelve digits it should be {c}, not {}.", b[12] as char));
            r.fix = Some(format!("{}{c}", &s[..12])); return Some(r);
        }
        n13 = s.clone();
        r = Reading::new("isbn", t, "valid", 84, String::new(), "A valid ISBN-13 by its check digit.");
    } else { return None; }
    // stdnum's isbn.split: the parts of the twelve digits before the check digit — prefix, group, publisher, the rest
    let parts = isbn_parts(&n13[..12]);
    let with_ranges = parts.len() >= 4;
    let join = |p: &[(String, Option<&'static str>)], check: char| -> String {
        let item = p.last().map(|x| x.0.clone()).unwrap_or_default();
        let mut v: Vec<String> = p[..p.len().saturating_sub(1)].iter().map(|x| x.0.clone()).collect();
        v.push(item); v.push(check.to_string());
        v.into_iter().filter(|x| !x.is_empty()).collect::<Vec<_>>().join("-")
    };
    let hy13 = join(&parts, n13.as_bytes()[12] as char);
    r.value = hy13.clone();
    r = r.f("ISBN-13", hy13.clone());
    if n13.starts_with("978") { r = r.f("ISBN-10", join(&parts[1..], isbn10_check(&n13[3..12]))); }
    else { r = r.f("ISBN-10", "none — ISBNs beginning with 979 have no 10-digit form"); }
    if let Some(a) = parts.get(1).and_then(|p| p.1) { r = r.f("Group", format!("{} — {a}", parts[1].0)); }
    if with_ranges { r = r.f("Publisher", parts[2].0.clone()); }
    else { r = r.n("These digits are outside the ranges the International ISBN Agency has given out: no book should have this number."); }
    Some(r.n(format!("Hyphens placed by {}.", T::ISBN_SOURCE)))
}

fn issn_check(d7: &str) -> char { let s: u32 = d7.bytes().enumerate().map(|(i, c)| (8 - i as u32) * (c - b'0') as u32).sum(); match (11 - s % 11) % 11 { 10 => 'X', c => (b'0' + c as u8) as char } }
fn issn(x: &In) -> Option<Reading> {
    let s = &x.alnum; let b = s.as_bytes();
    if s.len() != 8 || !b[..7].iter().all(u8::is_ascii_digit) || !(b[7].is_ascii_digit() || b[7] == b'X') { return None; }
    let c = issn_check(&s[..7]); let shown = format!("{}-{}", &s[..4], &s[4..]);
    let t = "ISSN (a magazine’s or journal’s number)";
    if c != b[7] as char {
        let mut r = Reading::new("issn", t, "invalid", if x.hint.contains(&"issn") { 40 } else { 15 }, shown, format!("An ISSN’s check digit would be {c}, not {}.", b[7] as char));
        r.fix = Some(format!("{}{c}", &s[..7])); return Some(r);
    }
    Some(Reading::new("issn", t, "valid", if x.raw.contains('-') || x.hint.contains(&"issn") { 70 } else { 40 }, shown, "A valid ISSN by its check digit (a serial publication: a magazine, newspaper or journal).")
        .f("As a barcode", { let d12 = format!("977{}00", &s[..7]); format!("{d12}{} (with issue digits 00)", ean_digit(&dv(&d12))) }))
}

fn gs1(prefix3: &str) -> Option<&'static (&'static str, &'static str, &'static str, &'static str, &'static str)> {
    T::GS1.iter().find(|(a, b, _, _, _)| prefix3 >= *a && prefix3 <= *b)
}
fn ean(x: &In) -> Option<Reading> {
    let d = &x.digits;
    if ![8, 12, 13, 14].contains(&d.len()) || x.alnum != *d { return None; }
    if d.len() == 13 && (d.starts_with("978") || d.starts_with("979")) { return None; } // the ISBN reading says it
    let v = dv(d);
    let kind = match d.len() { 8 => "EAN-8", 12 => "UPC-A", 13 => "EAN-13", _ => "GTIN-14" };
    let t = "Barcode number (EAN / UPC / GTIN)";
    let c = ean_digit(&v[..v.len() - 1]);
    if c != v[v.len() - 1] {
        let mut r = Reading::new("ean", t, "invalid", if d.len() == 13 { 38 } else { 20 }, d.clone(), format!("As an {kind} barcode its check digit would be {c}, not {}.", v[v.len() - 1]));
        r.fix = Some(format!("{}{c}", &d[..d.len() - 1])); return Some(r);
    }
    let p3 = match d.len() { 12 => format!("0{}", &d[..2]), 14 => d[1..4].to_string(), _ => d[..3].to_string() };
    let score = match d.len() { 13 => 72, 12 => 55, 14 => 50, _ => 45 };
    let mut r = Reading::new("ean", t, "valid", score, d.clone(), format!("A valid {kind} barcode number by its check digit."));
    match gs1(&p3) {
        Some((_, _, org, country, note)) if !org.is_empty() => { r = r.f("GS1 prefix", format!("{p3} — {org}{}", if country.is_empty() { String::new() } else { format!(" ({country})") })); if !note.is_empty() { r = r.n(note.to_string()); } }
        Some((_, _, _, _, note)) => { r = r.f("GS1 prefix", format!("{p3} — {note}")); }
        None => { r = r.f("GS1 prefix", format!("{p3} — not given out by GS1")); }
    }
    if d.len() == 14 { r = r.f("Packing indicator", format!("{} — the level of packing (0: the item itself)", &d[..1])); }
    if d.starts_with("977") && d.len() == 13 { let i7 = &d[3..10]; r = r.f("ISSN", format!("{}-{}{}", &i7[..4], &i7[4..], issn_check(i7))); }
    Some(r.n("The prefix names the GS1 office that gave the maker its numbers — not where the product was made."))
}

// ---------------------------------------------------------------- banking and securities abroad
fn iban(x: &In) -> Option<Reading> {
    let s = &x.alnum; let b = s.as_bytes();
    if s.len() < 15 || s.len() > 34 || !b[0].is_ascii_uppercase() || !b[1].is_ascii_uppercase() || !b[2].is_ascii_digit() || !b[3].is_ascii_digit() { return None; }
    let t = "IBAN (an international bank account number)";
    let shown = group(s, &[4; 9], " ");
    let Some(&(_, name, bban)) = T::IBAN.iter().find(|r| r.0 == &s[..2]) else {
        if &s[..2] == "IN" { return Some(Reading::new("iban", t, "invalid", 40, shown, "India has no IBAN: an Indian account is its account number with the branch’s IFSC.")); }
        return None;
    };
    // the registry's structure: 4!n4!a … (n digits, a capitals, c either, e space)
    let mut want = 0usize; let mut pat: Vec<(usize, u8)> = vec![];
    let mut it = bban.as_bytes().iter().peekable();
    while it.peek().is_some() {
        let mut n = 0usize; while let Some(c) = it.peek() { if c.is_ascii_digit() { n = n * 10 + (**c - b'0') as usize; it.next(); } else { break; } }
        if it.peek() == Some(&&b'!') { it.next(); }
        let k = *it.next().unwrap(); pat.push((n, k)); want += n;
    }
    let country = region_name(&s[..2]).unwrap_or(name);
    if s.len() != 4 + want { return Some(Reading::new("iban", t, "invalid", 45, shown, format!("An IBAN of {country} has {} characters; this has {}.", 4 + want, s.len()))); }
    let mut i = 4usize; let mut shape = true;
    for (n, k) in pat { for c in &b[i..i + n] { shape &= match k { b'n' => c.is_ascii_digit(), b'a' => c.is_ascii_uppercase(), _ => c.is_ascii_alphanumeric() }; } i += n; }
    let m = mod97(&format!("{}{}", &s[4..], &s[..4]));
    if m != 1 {
        let check = 98 - mod97(&format!("{}{}00", &s[4..], &s[..2]));
        let mut r = Reading::new("iban", t, "invalid", 48, shown, format!("Its check digits do not add up (mod 97): with this account they would be {check:02}, not {} — a character is mistyped.", &s[2..4]));
        r.fix = Some(format!("{}{check:02}{}", &s[..2], &s[4..])); return Some(r.f("Country", country));
    }
    if !shape { return Some(Reading::new("iban", t, "invalid", 45, shown, format!("Its check digits add up, but the account part is not shaped as {country}’s are."))); }
    Some(Reading::new("iban", t, "valid", 82, shown, format!("A valid IBAN of {country} by its check digits (mod 97).")).f("Country", country).f("Check digits", &s[2..4]).f("Account (BBAN)", &s[4..])
        .n("The account’s own check digits inside it (some countries have them) are not checked here."))
}

fn bic(x: &In) -> Option<Reading> {
    let s = &x.alnum; let b = s.as_bytes();
    if (s.len() != 8 && s.len() != 11) || !b[..6].iter().all(u8::is_ascii_uppercase) { return None; }
    if !T::BIC_COUNTRIES.contains(&&s[4..6]) { return None; }
    let country = region_name(&s[4..6]).unwrap_or(&s[4..6]);
    let branch = if s.len() == 11 { &s[8..] } else { "XXX" };
    let loc2 = b[7];
    let mut r = Reading::new("bic", "SWIFT / BIC code", "format", if s.len() == 11 { 60 } else { 45 }, s.clone(), format!("The shape of a SWIFT (BIC) code of a bank in {country}."))
        .f("Bank", format!("{} — the bank’s code", &s[..4])).f("Country", format!("{} — {country}", &s[4..6])).f("Location", &s[6..8])
        .f("Branch", if branch == "XXX" { "XXX — the head office".to_string() } else { branch.to_string() });
    if loc2 == b'0' { r = r.n("A location code ending in 0 marks a test code, not a live one."); }
    Some(r.n("A BIC has no check digit; the bank (or SWIFT’s own directory) confirms whose it is."))
}

fn isin(x: &In) -> Option<Reading> {
    let s = &x.alnum; let b = s.as_bytes();
    if s.len() != 12 || !b[0].is_ascii_uppercase() || !b[1].is_ascii_uppercase() || !b[11].is_ascii_digit() || !b[2..11].iter().all(u8::is_ascii_alphanumeric) { return None; }
    if !T::ISIN_COUNTRIES.contains(&&s[..2]) { return None; }
    let conv: String = s.bytes().map(|c| if c.is_ascii_digit() { (c as char).to_string() } else { ((c - b'A') as u32 + 10).to_string() }).collect();
    let v = digits_u32(&conv);
    let t = "ISIN (a security’s number)";
    let country = match &s[..2] { "XS" => "international (Euroclear / Clearstream)", "EU" => "the European Union", c => region_name(c).unwrap_or(c) };
    if luhn_sum(&v, 10) != 0 {
        let conv11: String = s[..11].bytes().map(|c| if c.is_ascii_digit() { (c as char).to_string() } else { ((c - b'A') as u32 + 10).to_string() }).collect();
        let c = luhn_digit(&digits_u32(&conv11), 10);
        let mut r = Reading::new("isin", t, "invalid", 40, s.clone(), format!("The shape of an ISIN, but its check digit would be {c}, not {}.", b[11] as char));
        r.fix = Some(format!("{}{c}", &s[..11])); return Some(r);
    }
    let mut r = Reading::new("isin", t, "valid", 78, s.clone(), format!("A valid ISIN by its check digit: a security of {country}.")).f("Country", format!("{} — {country}", &s[..2])).f("National number", &s[2..11]);
    if &s[..2] == "IN" {
        let w = match b[2] { b'E' => Some("a company’s shares or bonds (INE)"), b'F' => Some("a mutual fund’s units (INF)"), _ => None };
        if let Some(w) = w { r = r.f("Kind", w); }
    }
    Some(r.n("Stock exchanges and the depositories (NSDL, CDSL) look a security up by its ISIN."))
}

// ---------------------------------------------------------------- VIN
fn vin_value(c: u8) -> Option<u32> {
    match c { b'0'..=b'9' => Some((c - b'0') as u32), b'A'..=b'H' => Some((c - b'A') as u32 + 1), b'J'..=b'N' => Some((c - b'J') as u32 + 1), b'P' => Some(7), b'R' => Some(9),
        b'S'..=b'Z' => Some((c - b'S') as u32 + 2), _ => None }
}
pub fn vin_check(s: &str) -> Option<char> {
    const W: [u32; 17] = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
    let mut sum = 0; for (i, c) in s.bytes().enumerate() { sum += vin_value(c)? * W[i]; }
    Some(match sum % 11 { 10 => 'X', d => (b'0' + d as u8) as char })
}
fn vin(x: &In) -> Option<Reading> {
    let s = &x.alnum; let b = s.as_bytes();
    // seventeen letters and digits without I, O, Q; one digit at least unless it is named a VIN (a word is no VIN)
    if s.len() != 17 || b.iter().any(|c| b"IOQ".contains(c)) || (!b.iter().any(u8::is_ascii_digit) && !x.hint.contains(&"vin")) || !b.iter().any(u8::is_ascii_uppercase) { return None; }
    let check = vin_check(s)?;
    let w = wmi();
    let maker = w.get(&s[..3]).or_else(|| w.get(&s[..2])).copied();
    let country = lookup(T::VIN_COUNTRIES, &s[..2]);
    let years: Vec<String> = { let letters = "ABCDEFGHJKLMNPRSTVWXY123456789"; match letters.find(b[9] as char) { Some(i) => { let mut y = 1980 + i as u32; let mut v = vec![]; while y <= 2027 { v.push(y.to_string()); y += 30; } v } None => vec![] } };
    let t = "VIN (vehicle identification number, the chassis number)";
    let ok = b[8] as char == check;
    let mut r = Reading::new("vin", t, if ok { "valid" } else { "format" }, if ok { 76 } else { 50 }, group(s, &[3, 6, 8], " "),
        if ok { "A VIN whose check digit (its 9th character) is right.".to_string() } else { format!("The shape of a VIN. Its 9th character, {}, is not the check digit North America requires ({check}) — makers elsewhere (India, Europe) need not use it.", b[8] as char) });
    if let Some(m) = maker { r = r.f("Maker", format!("{} — {m}", &s[..3])); } else { r = r.f("Maker code (WMI)", &s[..3]); }
    if let Some(c) = country { r = r.f("Country", c); }
    if !years.is_empty() { r = r.f("Model year", format!("{} (the 10th character, {}, names one year in each 30)", years.join(" or "), b[9] as char)); }
    Some(r.f("Serial", &s[11..]).n("Makers and countries by vininfo’s list of world manufacturer identifiers."))
}

// ------------------------------------------------------------------------------------------------- the entry
const LABELS: &[(&str, &[&str])] = &[("aadhaar", &["aadhaar", "aadhaar_masked", "vid"]), ("aadhar", &["aadhaar", "aadhaar_masked", "vid"]), ("uid", &["aadhaar"]), ("vid", &["vid"]),
    ("virtual id", &["vid"]), ("pan", &["pan"]), ("pan card", &["pan"]), ("gstin", &["gstin"]), ("gst", &["gstin"]), ("tan", &["tan"]), ("epic", &["epic"]), ("voter id", &["epic"]),
    ("ifsc", &["ifsc"]), ("ifs code", &["ifsc"]), ("upi", &["upi"]), ("upi id", &["upi"]), ("vpa", &["upi"]), ("pin", &["pin"]), ("pin code", &["pin"]), ("pincode", &["pin"]),
    ("postal code", &["pin"]), ("tel", &["phone"]), ("telephone", &["phone"]), ("phone", &["phone"]), ("ph", &["phone"]), ("mob", &["phone"]), ("mobile", &["phone"]), ("cell", &["phone"]),
    ("whatsapp", &["phone"]), ("contact", &["phone"]), ("vehicle", &["vehicle"]), ("reg", &["vehicle"]), ("registration", &["vehicle"]), ("dl", &["dl"]), ("driving licence", &["dl"]),
    ("driving license", &["dl"]), ("licence", &["dl"]), ("license", &["dl"]), ("passport", &["passport"]), ("cin", &["cin"]), ("uan", &["uan"]), ("a/c", &["account"]), ("ac", &["account"]),
    ("acct", &["account"]), ("account", &["account"]), ("card", &["card"]), ("credit card", &["card"]), ("debit card", &["card"]), ("imei", &["imei"]), ("imei1", &["imei"]), ("imei 1", &["imei"]),
    ("imei2", &["imei"]), ("imei 2", &["imei"]), ("imeisv", &["imei"]), ("isbn", &["isbn"]), ("isbn-10", &["isbn"]), ("isbn-13", &["isbn"]), ("isbn10", &["isbn"]), ("isbn13", &["isbn"]),
    ("issn", &["issn"]), ("e-issn", &["issn"]), ("eissn", &["issn"]), ("ean", &["ean"]), ("ean-13", &["ean"]), ("ean13", &["ean"]), ("upc", &["ean"]), ("gtin", &["ean"]),
    ("barcode", &["ean"]), ("iban", &["iban"]), ("bic", &["bic"]), ("swift", &["bic"]), ("swift code", &["bic"]), ("bic code", &["bic"]), ("isin", &["isin"]), ("iccid", &["iccid"]),
    ("sim", &["iccid"]), ("vin", &["vin"]), ("chassis", &["vin"])];

/// A label in front of the number ("PAN:", "IFSC code -", "Mobile no.") → the rest, and the kinds it names.
fn strip_label(raw: &str) -> (&str, &'static [&'static str]) {
    let low = raw.to_lowercase();
    let mut best: Option<(usize, &'static [&'static str])> = None;
    for (l, k) in LABELS {
        if !low.starts_with(l) { continue; }
        // "no", "no.", "number", "code", "id" after the label — taken only when a separator follows it ("IBAN NO39…" is
        // Norway's IBAN, not "IBAN no." and 39…)
        let mut starts = vec![l.len()];
        for w in [" number", " no.", " no", " code", " id", " num", " #"] { if low[l.len()..].starts_with(w) { starts.insert(0, l.len() + w.len()); break; } }
        for i in starts {
            let rest = &low[i..];
            let sep = rest.chars().next().map(|c| c.is_whitespace() || ":-#.=".contains(c)).unwrap_or(false);
            if !sep { continue; }
            let skip = rest.chars().take_while(|c| c.is_whitespace() || ":-#.=".contains(*c)).map(char::len_utf8).sum::<usize>();
            if best.map(|(n, _)| i + skip > n).unwrap_or(true) { best = Some((i + skip, *k)); }
            break;
        }
    }
    match best { Some((n, k)) if n < raw.len() && raw.is_char_boundary(n) => (&raw[n..], k), _ => (raw, &[]) }
}

pub fn run(input: &[u8]) -> R {
    let a = crate::arg(input)?;
    let text = crate::s(&a, "text").trim();
    let text: String = text.chars().map(|c| match c { '\u{2010}'..='\u{2015}' | '\u{2212}' => '-', '\u{00A0}' | '\u{2007}' | '\u{202F}' => ' ', _ => c }).collect();
    let (rest, hint) = strip_label(&text);
    let raw = rest.trim();
    let alnum: String = raw.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_ascii_uppercase();
    let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
    let x = In { raw, alnum, digits, plus: raw.starts_with('+'), hint };
    type F = fn(&In) -> Option<Reading>;
    let all: [F; 28] = [aadhaar, masked_aadhaar, vid, pan, gstin, tan, epic, ifsc, upi, pin, phone, vehicle, dl, passport, cin, udyam, uan, account,
        card, imei, iccid, isbn, issn, ean, iban, bic, isin, vin];
    let mut rs: Vec<Reading> = all.iter().filter_map(|f| f(&x)).collect();
    for r in rs.iter_mut() { if x.hint.contains(&r.kind) { r.score += 100; } }
    // a reading the label names always stays; a failed check only when nothing fits that passes, and weak readings (an
    // account number, a UAN, a passport's shape) only when nothing stronger fits
    let every = a.get("all").and_then(|v| v.as_bool()).unwrap_or(false); // the tests see every reading
    let strong = !every && rs.iter().any(|r| r.verdict != "invalid" && r.score >= 45);
    rs.retain(|r| r.score >= 100 || !(strong && r.verdict == "invalid"));
    let top = rs.iter().map(|r| r.score).max().unwrap_or(0);
    if top >= 45 && !every { rs.retain(|r| r.score >= 30); }
    rs.sort_by(|a, b| b.score.cmp(&a.score));
    let shape = if x.alnum.is_empty() { "nothing that is a letter or a digit".to_string() }
        else { let (nd, nl) = (x.alnum.bytes().filter(u8::is_ascii_digit).count(), x.alnum.bytes().filter(u8::is_ascii_alphabetic).count());
            match (nd, nl) { (d, 0) => format!("{d} digit{}", if d == 1 { "" } else { "s" }), (0, l) => format!("{l} letter{}", if l == 1 { "" } else { "s" }), (d, l) => format!("{l} letter{} and {d} digit{}", if l == 1 { "" } else { "s" }, if d == 1 { "" } else { "s" }) } };
    crate::js(json!({ "readings": rs.iter().map(Reading::json).collect::<Vec<_>>(), "shape": shape, "label": !x.hint.is_empty() }))
}

/// `ids:tel` (Visiting Card → Contact): one phone number as a card prints it ("+91 98450 12345", "080 4112 3456", "0044 20 7946
/// 0958", "1800 425 1234") → its calling code and country, the number in E.164, and for an Indian number libphonenumber's kind,
/// its national and international forms and its place (a landline's). Another country's number is named by its calling code
/// only (`valid` null: its own rules are not checked here); a number without a calling code that is no Indian number is
/// none of these (`cc` null) — the card's own writing is kept. The trunk "(0)" of "+44 (0)20 …" is the caller's to drop.
pub fn tel(input: &[u8]) -> R {
    let a = crate::arg(input)?; let raw = crate::s(&a, "text").trim();
    let d: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
    let plus = raw.starts_with('+');
    let none = |why: &str| crate::js(json!({ "cc": null, "country": null, "nn": null, "e164": null, "kind": "unknown", "valid": false, "why": why }));
    if d.len() < 4 { return none("too few digits for a phone number"); }
    if plus || d.starts_with("00") {
        let digits = if plus { &d[..] } else { &d[2..] };
        let cc = (1..=3).filter(|&l| l <= digits.len()).find_map(|l| { let c: u16 = digits[..l].parse().ok()?; T::CALLING.iter().find(|(k, _)| *k == c).map(|(k, r)| (*k, *r, l)) });
        let Some((cc, regions, l)) = cc else { return none("no country has the calling code these digits begin with"); };
        let nn = &digits[l..];
        if cc == 91 { return indian_tel(nn, true); }
        let names: Vec<&str> = regions.iter().filter_map(|r| region_name(r)).collect();
        let country = match (cc, names.len()) { (1, _) => "the United States or Canada".to_string(), (_, 0) => "an international network".to_string(), (_, _) => names[0].to_string() };
        let fits = (4..=14).contains(&nn.len()) && digits.len() <= 15;
        return crate::js(json!({ "cc": cc, "country": country, "regions": regions, "nn": nn, "e164": if fits { Some(format!("+{cc}{nn}")) } else { None },
            "kind": "unknown", "valid": if fits { Value::Null } else { Value::Bool(false) },
            "why": if fits { Value::Null } else { Value::String(format!("calling code +{cc}, but a number has 4 – 14 digits after it, at most 15 in all")) } }));
    }
    // an Indian number written without +91 — as the Number Detective reads one
    if d.len() == 11 && d.starts_with('0') { return indian_tel(&d[1..], false); }
    if d.len() == 12 && d.starts_with("91") && in_type(&d[2..]) != "unknown" { return indian_tel(&d[2..], false); }
    if (8..=13).contains(&d.len()) && (d.len() == 10 || d.starts_with('1')) { return indian_tel(&d, false); }
    none("no calling code, and no Indian number")
}
fn indian_tel(nn: &str, plus: bool) -> R {
    let ty = in_type(nn);
    if ty == "unknown" && !plus { return crate::js(json!({ "cc": null, "country": null, "nn": null, "e164": null, "kind": "unknown", "valid": false, "why": "no calling code, and no Indian number" })); }
    let (nat, intl) = in_format(nn);
    crate::js(json!({ "cc": 91, "country": "India", "nn": nn, "e164": format!("+91{nn}"), "kind": ty, "valid": ty != "unknown",
        "intl": if ty == "unknown" { Value::Null } else { Value::String(intl) }, "national": if ty == "unknown" { Value::Null } else { Value::String(if ty == "mobile" { nat.trim_start_matches('0').to_string() } else { nat }) },
        "place": if ty.starts_with("fixed_line") { in_place(nn) } else { None },
        "why": if ty == "unknown" { Value::String("not a number in use in India by libphonenumber’s rules".into()) } else { Value::Null } }))
}

/// For the tests: libphonenumber's answers for an Indian national number (type, national and international format, place).
pub fn phone_info(input: &[u8]) -> R {
    let a = crate::arg(input)?; let nn = crate::s(&a, "nn");
    let (n, i) = in_format(nn);
    let ty = in_type(nn);
    crate::js(json!({ "type": ty, "national": n, "international": i, "place": if ty.starts_with("fixed_line") { in_place(nn) } else { None } }))
}
/// For the tests: the card network credit-card-type's rules (and RuPay's) give a number.
pub fn card_info(input: &[u8]) -> R {
    let a = crate::arg(input)?; let d = crate::s(&a, "number");
    let nets = card_networks(d);
    let best = nets.iter().enumerate().max_by_key(|(i, (_, l))| (*l, std::cmp::Reverse(*i))).map(|(_, n)| n.0);
    crate::js(json!({ "best": best, "all": nets.iter().map(|n| n.0).collect::<Vec<_>>() }))
}

/// For the tests: the tables' sources and sizes.
pub fn info() -> R {
    let p = pins(); let d = ifsc_data();
    crate::js(json!({ "pins": p.pins.len(), "districts": p.pairs.len(), "ifscBanks": d.banks.len(), "ifsc": d.banks.values().map(|(a, b)| a.len() + b.len()).sum::<usize>(),
        "banks": T::BANKS.len(), "geo": geo().1.len(), "wmi": wmi().len(), "pinSource": T::PIN_SOURCE, "ifscSource": T::IFSC_SOURCE, "phoneSource": T::PHONE_SOURCE, "isbnSource": T::ISBN_SOURCE }))
}

// ------------------------------------------------------------------------------------------------- finding numbers in a text
// `ids:scan` (PDF Redact, Safe ID Copy): every number or code of the chosen kinds in a page's text, as UTF-16 offsets.
// Runs of digits are cut at their separators where the whole run is no number (two numbers side by side); words and
// phrases the reader names are matched without regard to case, any white space standing for a space.
struct Found { s: usize, e: usize, kind: &'static str, value: String }

fn utf16_map(t: &str) -> Vec<u32> {
    let mut m = vec![0u32; t.len() + 1]; let mut u = 0u32;
    for (i, c) in t.char_indices() { for k in 0..c.len_utf8() { m[i + k] = u; } u += c.len_utf16() as u32; }
    m[t.len()] = u;
    m
}
fn re(p: &str) -> regex_lite::Regex { regex_lite::Regex::new(p).unwrap() }
fn scan_res() -> &'static Vec<(&'static str, regex_lite::Regex)> {
    static R: OnceLock<Vec<(&'static str, regex_lite::Regex)>> = OnceLock::new();
    R.get_or_init(|| vec![
        ("digits", re(r"\+?\d(?:[ \-.]?\d){7,22}")),
        ("aadhaar_masked", re(r"(?i)\b[x*•]{4}[ \-]?[x*•]{4}[ \-]?\d{4}\b")),
        ("gstin", re(r"\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b")),
        ("pan", re(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b")),
        ("ifsc", re(r"\b[A-Z]{4}0[A-Z0-9]{6}\b")),
        ("email", re(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}")),
        ("upi", re(r"[A-Za-z0-9._\-]{2,}@[A-Za-z][A-Za-z0-9]{1,30}\b")),
        ("dob", re(r"(?i)\b(?:d\.?\s?o\.?\s?b\.?|date\s+of\s+birth|birth\s*date|year\s+of\s+birth)\s*[:\-]?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{1,2}\s+[a-z]{3,9}\.?\s+\d{4}|\d{4})")),
    ])
}
/// What a run of digits (the separators taken out) is, if it is one of the kinds asked for.
fn digits_kind(d: &str, plus: bool, kinds: &[String], ctx_account: bool) -> Option<&'static str> {
    let want = |k: &str| kinds.iter().any(|x| x == k);
    let v = dv(d);
    if want("aadhaar") && d.len() == 12 && !plus && !d.starts_with('0') && !d.starts_with('1') && !is_palindrome(d) && verhoeff_ok(&v) { return Some("aadhaar"); }
    if want("aadhaar") && d.len() == 16 && !plus && !d.starts_with('0') && !d.starts_with('1') && verhoeff_ok(&v) { return Some("vid"); }
    if want("card") && (13..=19).contains(&d.len()) && !plus && luhn_sum(&digits_u32(d), 10) == 0 {
        let nets = card_networks(d);
        if let Some((name, _)) = nets.iter().max_by_key(|(_, l)| *l) { if T::CARDS.iter().any(|r| r.0 == *name && r.2.contains(&(d.len() as u8))) { return Some("card"); } }
    }
    if want("phone") {
        let nn = if plus && d.starts_with("91") { Some(&d[2..]) } else if !plus && d.len() == 11 && d.starts_with('0') { Some(&d[1..]) }
            else if !plus && d.len() == 12 && d.starts_with("91") { Some(&d[2..]) } else if !plus && d.len() == 10 { Some(&d[..]) } else { None };
        if let Some(nn) = nn { let t = in_type(nn); if t == "mobile" || t.starts_with("fixed_line") || t == "toll_free" { return Some("phone"); } }
    }
    if want("account") && ctx_account && (9..=18).contains(&d.len()) && !plus { return Some("account"); }
    None
}
fn account_context(text: &str, start: usize) -> bool {
    let from = text[..start].char_indices().rev().nth(40).map(|(i, _)| i).unwrap_or(0);
    let before = text[from..start].to_lowercase();
    ["a/c", "a / c", "acct", "account", "ac no", "a/c no", "acc no", "acc. no", "account no", "bank account", "khata"].iter().any(|w| before.contains(w))
}
fn words_found(text: &str, phrases: &[String], out: &mut Vec<Found>) {
    let tc: Vec<(usize, char)> = text.char_indices().collect();
    let low = |c: char| c.to_lowercase().next().unwrap_or(c);
    for p in phrases {
        let pc: Vec<char> = p.split_whitespace().collect::<Vec<_>>().join(" ").chars().map(low).collect();
        if pc.is_empty() { continue; }
        let mut i = 0;
        while i < tc.len() {
            let mut j = i; let mut k = 0; let mut ok = true;
            while k < pc.len() {
                if j >= tc.len() { ok = false; break; }
                if pc[k] == ' ' { if !tc[j].1.is_whitespace() { ok = false; break; } while j < tc.len() && tc[j].1.is_whitespace() { j += 1; } k += 1; continue; }
                if low(tc[j].1) != pc[k] { ok = false; break; }
                j += 1; k += 1;
            }
            // whole words: no letter or digit just before or after when the phrase begins or ends with one
            let edge_ok = |at: Option<char>, pch: char| !(pch.is_alphanumeric() && at.map(|c| c.is_alphanumeric()).unwrap_or(false));
            if ok && edge_ok(if i > 0 { Some(tc[i - 1].1) } else { None }, pc[0]) && edge_ok(tc.get(j).map(|x| x.1), pc[pc.len() - 1]) {
                let (s, e) = (tc[i].0, if j < tc.len() { tc[j].0 } else { text.len() });
                out.push(Found { s, e, kind: "words", value: text[s..e].to_string() }); i = j; continue;
            }
            i += 1;
        }
    }
}

pub fn scan(input: &[u8]) -> R {
    let a = crate::arg(input)?;
    let text = crate::s(&a, "text");
    let kinds: Vec<String> = a.get("kinds").and_then(|v| v.as_array()).map(|v| v.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
    let words: Vec<String> = a.get("words").and_then(|v| v.as_array()).map(|v| v.iter().filter_map(|x| x.as_str().map(String::from)).filter(|w| !w.trim().is_empty()).collect()).unwrap_or_default();
    let want = |k: &str| kinds.iter().any(|x| x == k);
    let mut out: Vec<Found> = Vec::new();
    for (name, r) in scan_res() {
        if *name != "digits" && !want(name) && !(*name == "aadhaar_masked" && want("aadhaar")) { continue; }
        for m in r.find_iter(text) {
            match *name {
                "digits" => {
                    // the run's digit groups; the longest stretch of whole groups that is a number, from left to right
                    let run = m.as_str(); let base = m.start();
                    let plus = run.starts_with('+');
                    let mut groups: Vec<(usize, usize)> = Vec::new(); // byte ranges of digit groups within run
                    let b = run.as_bytes(); let mut i = 0;
                    while i < b.len() { if b[i].is_ascii_digit() { let s = i; while i < b.len() && b[i].is_ascii_digit() { i += 1; } groups.push((s, i)); } else { i += 1; } }
                    // a run glued to letters on either side is part of a word or code (INV2341…): skipped
                    let before = text[..base].chars().next_back(); let after = text[m.end()..].chars().next();
                    if before.map(|c| c.is_alphanumeric()).unwrap_or(false) || after.map(|c| c.is_alphanumeric()).unwrap_or(false) { continue; }
                    let mut g = 0;
                    while g < groups.len() {
                        let mut hit = None;
                        for h in (g + 1..=groups.len()).rev() {
                            let d: String = groups[g..h].iter().map(|(s, e)| &run[*s..*e]).collect();
                            let p = plus && g == 0;
                            if let Some(k) = digits_kind(&d, p, &kinds, account_context(text, base + groups[g].0)) { hit = Some((h, k, d)); break; }
                        }
                        match hit {
                            Some((h, k, d)) => { let s = if plus && g == 0 { base } else { base + groups[g].0 }; out.push(Found { s, e: base + groups[h - 1].1, kind: k, value: d }); g = h; }
                            None => g += 1,
                        }
                    }
                }
                "pan" => { let s = m.as_str(); if pan_type(s).is_some() && &s[5..9] != "0000" { out.push(Found { s: m.start(), e: m.end(), kind: "pan", value: s.into() }); } }
                "gstin" => { let s = m.as_str(); let vals: Vec<u32> = s.bytes().map(v36).collect(); if luhn_sum(&vals, 36) == 0 { out.push(Found { s: m.start(), e: m.end(), kind: "gstin", value: s.into() }); } }
                "ifsc" => { let s = m.as_str(); let code: [u8; 4] = s.as_bytes()[..4].try_into().unwrap(); if bank_name(&s[..4]).is_some() || ifsc_data().banks.contains_key(&code) { out.push(Found { s: m.start(), e: m.end(), kind: "ifsc", value: s.into() }); } }
                "upi" => {
                    let s = m.as_str(); let h = s.rsplit('@').next().unwrap_or("").to_lowercase();
                    let next = text[m.end()..].chars().next();
                    if next != Some('.') && lin(UPI_HANDLES, &h).is_some() { out.push(Found { s: m.start(), e: m.end(), kind: "upi", value: s.into() }); }
                }
                "dob" => { if let Some(c) = r.captures(&text[m.start()..]) { let g = c.get(1).unwrap(); out.push(Found { s: m.start() + g.start(), e: m.start() + g.end(), kind: "dob", value: g.as_str().into() }); } }
                k => out.push(Found { s: m.start(), e: m.end(), kind: if k == "aadhaar_masked" { "aadhaar_masked" } else { k }, value: m.as_str().into() }),
            }
        }
    }
    if !words.is_empty() { words_found(text, &words, &mut out); }
    // earlier first; of two that overlap, the longer
    out.sort_by(|a, b| a.s.cmp(&b.s).then(b.e.cmp(&a.e)));
    let mut kept: Vec<Found> = Vec::new();
    for f in out { if kept.last().map(|l| f.s < l.e).unwrap_or(false) { continue; } kept.push(f); }
    let u = utf16_map(text);
    crate::js(json!(kept.iter().map(|f| json!({ "s": u[f.s], "e": u[f.e], "kind": f.kind, "value": f.value })).collect::<Vec<_>>()))
}
