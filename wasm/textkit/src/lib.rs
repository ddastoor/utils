//! SuperTools text engine (wasm32-wasip1). Counting for the Word Counter tab on Unicode's own segmentation rules
//! (UAX #29, the unicode-segmentation crate): user-perceived characters and sentences — with the rules a person counts
//! by that the standard leaves open ("Dr. Rao" does not end a sentence) — and words as a word limit counts them. The same numbers in every browser: nothing here depends on the browser's own segmenter, whose
//! rules differ between Chrome, Safari and Firefox.
//!
//!   tk_stats(text, len) → 0, JSON in tk_out_ptr() / tk_out_len():
//!     { words, chars, noSpace, sentences, paragraphs, lines, wordChars, bytes, top: [[word, count], …] }
//!   tk_case(text, len)  → 0, JSON: the thirteen conversions of the Case Converter (case.rs)
//!   tk_line_lengths(text, len) → 0, JSON: the characters of every line (Line Tools, "By length")
//!   tk_clusters(text, len) → 0, JSON: the length in UTF-16 units of every character a reader sees (Fancy Text)
//!   tk_lorem(unit, n, classic, seed32) → 0, JSON: Lorem ipsum — paragraphs, sentences and words counted (lorem.rs)
//!   tk_diff(a, lenA, b, lenB, mode, limit_ms) → 0, JSON: the differences of two texts (diff.rs)
// the module for the Text Diff (feature "diff") is built without the counting code below
#![cfg_attr(not(feature = "text"), allow(dead_code, unused_imports))]
use std::cell::RefCell;
use std::collections::HashMap;
use unicode_segmentation::UnicodeSegmentation;

#[cfg(feature = "text")] mod case;
#[cfg(feature = "diff")] mod diff;
#[cfg(feature = "lorem")] mod lorem;

thread_local! { static OUT: RefCell<Vec<u8>> = RefCell::new(Vec::new()); }
#[no_mangle] pub extern "C" fn tk_alloc(n: usize) -> *mut u8 { let mut v = Vec::<u8>::with_capacity(n.max(1)); let p = v.as_mut_ptr(); std::mem::forget(v); p }
#[no_mangle] pub unsafe extern "C" fn tk_free(p: *mut u8, n: usize) { drop(Vec::from_raw_parts(p, 0, n.max(1))); }
#[no_mangle] pub extern "C" fn tk_out_ptr() -> *const u8 { OUT.with(|o| o.borrow().as_ptr()) }
#[no_mangle] pub extern "C" fn tk_out_len() -> usize { OUT.with(|o| o.borrow().len()) }

// ------------------------------------------------------------------ scripts
/// Thai, Lao, Myanmar, Khmer: written without spaces between words; only a dictionary can find the words. This module
/// has none, so it leaves these letters out of the word count and the page adds the words the browser's dictionary
/// finds (src/lib/wordcount.ts uses the same ranges).
fn is_sea(c: char) -> bool { matches!(c as u32, 0x0E00..=0x0EFF | 0x1000..=0x109F | 0x1780..=0x17FF | 0x19E0..=0x19FF | 0xA9E0..=0xA9FF | 0xAA60..=0xAA7F) }
/// Chinese characters and kana: every character is a word of its own here (as Microsoft Word counts them); they are
/// left out of the keywords, where a single character says nothing.
fn is_cjk(c: char) -> bool { matches!(c as u32, 0x2E80..=0x303F | 0x3040..=0x30FF | 0x31F0..=0x31FF | 0x3400..=0x4DBF | 0x4E00..=0x9FFF | 0xF900..=0xFAFF | 0xFF66..=0xFF9F | 0x20000..=0x3FFFF) }
fn counts(c: char) -> bool { c.is_alphanumeric() && !is_sea(c) }
/// What a text box shows as the end of a line.
fn is_break(c: char) -> bool { matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}') }

// ------------------------------------------------------------------ words
// A word is what stands between two spaces and holds a letter or a digit — the count of Microsoft Word and of
// `wc -w`, which is what a word limit is checked against: "e-mail", "don't", "U.S.A.", "km/h", "R&D", "9:30",
// "10/11/2026" and "word(s)" are one word each. Corrected where that count is plainly not a reader's:
//   · a dash or an ellipsis between two words separates them ("stop—go", "wait...what", "x--y"), and so does a comma,
//     semicolon, question or exclamation mark with a letter right behind it ("yes,no");
//   · the word dividers of scripts that do not use the space (danda, Ethiopic wordspace, Tibetan tsheg);
//   · every Chinese character and kana is a word (as Word counts them); Thai, Lao, Khmer and Myanmar letters are left
//     to the page's dictionary.
/// Number of characters a word divider takes at `i` (0 = none there).
fn divider(cs: &[(usize, char)], i: usize) -> usize {
    let c = cs[i].1;
    let prev = if i > 0 { Some(cs[i - 1].1) } else { None };
    let at = |k: usize| cs.get(k).map(|x| x.1);
    let run = |ch: char| cs[i..].iter().take_while(|x| x.1 == ch).count();
    match c {
        // a range of numbers stays one piece: 2019–2026
        '\u{2013}' | '\u{2014}' | '\u{2015}' => if prev.is_some_and(char::is_numeric) && at(i + 1).is_some_and(char::is_numeric) { 0 } else { 1 },
        '-' if at(i + 1) == Some('-') => run('-'),
        '\u{2026}' => 1,
        '.' if at(i + 1) == Some('.') => run('.'),
        ',' | ';' | '?' | '!' | '\u{60c}' | '\u{61b}' | '\u{61f}' => if at(i + 1).is_some_and(char::is_alphabetic) { 1 } else { 0 },
        '\u{964}' | '\u{965}' | '\u{1361}' | '\u{f0b}' => 1,
        _ => 0,
    }
}
fn trim_edges(s: &str) -> &str {
    s.trim_matches(|c: char| matches!(c, '(' | ')' | '[' | ']' | '{' | '}' | '<' | '>' | '"' | '\'' | '\u{201c}' | '\u{201d}' | '\u{2018}' | '\u{2019}' | '\u{ab}' | '\u{bb}' | ',' | ';' | '!' | '?' | '.' | ':' | '\u{2026}'))
}
fn is_email(t: &str) -> bool {
    let mut it = t.split('@');
    let (Some(l), Some(d), None) = (it.next(), it.next(), it.next()) else { return false };
    !l.is_empty() && l.chars().all(|c| c.is_alphanumeric() || "._%+-'".contains(c)) && d.contains('.')
        && d.split('.').all(|p| !p.is_empty() && p.chars().all(|c| c.is_alphanumeric() || c == '-'))
}
/// A web address or an e-mail address: one word, whatever is inside it.
fn is_address(chunk: &str) -> bool {
    let t = trim_edges(chunk);
    if let Some(p) = t.find("://") {
        let scheme = &t[..p];
        return scheme.chars().next().is_some_and(|c| c.is_ascii_alphabetic()) && scheme.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-'))
            && t[p + 3..].chars().any(char::is_alphanumeric);
    }
    let lower = t.get(..7).map(|x| x.to_ascii_lowercase());
    if lower.as_deref() == Some("mailto:") { return is_email(&t[7..]); }
    if t.get(..4).is_some_and(|x| x.eq_ignore_ascii_case("www.")) && t[4..].contains('.') && t[4..].chars().any(char::is_alphanumeric) { return true; }
    is_email(t)
}

// English words that say nothing about a text (the classic Snowball / NLTK list and the contractions people type).
const STOP: &[&str] = &["a", "about", "above", "after", "again", "against", "all", "also", "am", "an", "and", "any", "are", "aren't", "as", "at", "be", "because",
    "been", "before", "being", "below", "between", "both", "but", "by", "can", "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't",
    "doing", "don't", "down", "during", "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't", "have", "haven't", "having", "he", "he'd",
    "he'll", "he's", "her", "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into",
    "is", "isn't", "it", "it's", "its", "itself", "just", "let's", "may", "me", "might", "more", "most", "must", "mustn't", "my", "myself", "no", "nor", "not",
    "now", "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "shan't", "she", "she'd",
    "she'll", "she's", "should", "shouldn't", "so", "some", "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there",
    "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", "those", "through", "to", "too", "under", "until", "up", "us", "very",
    "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were", "weren't", "what", "what's", "when", "when's", "where", "where's", "which", "while",
    "who", "who's", "whom", "why", "why's", "will", "with", "won't", "would", "wouldn't", "yes", "you", "you'd", "you'll", "you're", "you've", "your",
    "yours", "yourself", "yourselves"];

struct Words<'a> { n: u64, chars: u64, seen: HashMap<String, (u32, u32)>, order: u32, stop: std::collections::HashSet<&'a str> }
impl Words<'_> {
    /// A stretch between two dividers: a word if it holds a letter or a digit, without the marks around it.
    fn piece(&mut self, s: &str) {
        let core = s.trim_matches(|c: char| !counts(c));
        if !core.is_empty() { self.add(core, true); }
    }
    fn add(&mut self, w: &str, keyword: bool) {
        self.n += 1;
        self.chars += if w.is_ascii() { w.len() } else { w.graphemes(true).count() } as u64;
        if !keyword { return; }
        // the form the word is counted under: lower case, a straight apostrophe, no possessive 's
        let mut k = if w.is_ascii() { w.to_ascii_lowercase() } else { w.to_lowercase().replace(['\u{2019}', '\u{2bc}', '\u{2018}'], "'") };
        if let Some(base) = k.strip_suffix("'s") { if !self.stop.contains(k.as_str()) { k = base.to_string(); } }
        let k = k.trim_matches('\'');
        let Some(first) = k.chars().find(|c| c.is_alphabetic()) else { return };   // a number is no keyword
        if is_cjk(first) || self.stop.contains(k) { return; }
        if (first as u32) < 0x0530 && k.graphemes(true).count() < 3 { return; }   // "ox", "we" — in alphabets only
        if let Some(e) = self.seen.get_mut(k) { e.0 += 1; return; }
        self.order += 1;
        self.seen.insert(k.to_string(), (1, self.order));
    }
}

// ------------------------------------------------------------------ sentences
/// Abbreviations after which a full stop does not end the sentence, whatever follows.
pub(crate) const ABBR: &[&str] = &["mr", "mrs", "ms", "mx", "dr", "prof", "sr", "jr", "st", "mt", "smt", "shri", "sri", "kum", "er", "adv", "gen", "col", "lt", "capt",
    "cpt", "sgt", "cmdr", "maj", "brig", "rev", "fr", "hon", "gov", "sen", "rep", "pres", "supt", "insp", "messrs", "mme", "mlle", "vs", "v", "viz", "cf",
    "e.g", "i.e", "approx", "ca", "pvt"];
/// … and those that are one only before a number: "No. 5", "Fig. 3", "Rs. 500" — but "The answer is No. That is final."
const ABBR_NUM: &[&str] = &["no", "nos", "fig", "figs", "sec", "ch", "vol", "pp", "p", "pg", "para", "eq", "ref", "rs", "re", "art", "cl", "approx"];
#[derive(PartialEq, Clone, Copy)]
enum Tail { Ends, Abbr, AbbrNum, Glued, Mark, Quoted }
/// How does a piece that Unicode's rules end here really end?
fn tail(seg: &str) -> Tail {
    let t = seg.trim_end();
    if seg[t.len()..].chars().any(is_break) { return Tail::Ends; }               // the line ends: so does the sentence
    // A full stop with no space behind it: if a letter or digit follows at once, it stands inside something — ".NET",
    // "file.Txt" (the full stop of Chinese or Hindi needs no space and is not meant here). A question or exclamation
    // mark does so only inside a web address ("…/apply?year=2026"): the caller looks.
    if t.len() == seg.len() && t.ends_with('.') { return Tail::Glued; }
    if t.len() == seg.len() && t.ends_with(['?', '!']) { return Tail::Mark; }
    // "Why now?" he asked.  — a quoted question or outcry inside a sentence that goes on in lower case
    let unq = t.trim_end_matches(['"', '\'', '\u{201d}', '\u{2019}', '\u{bb}', ')', ']']);
    if unq.len() < t.len() && unq.ends_with(['?', '!']) { return Tail::Quoted; }
    let Some(body) = t.strip_suffix('.') else { return Tail::Ends };
    if body.ends_with('.') { return Tail::Ends; }                                 // "..." is no abbreviation
    let start = body.char_indices().rev().take_while(|(_, c)| c.is_alphanumeric() || *c == '.').last().map_or(body.len(), |(i, _)| i);
    let (token, before) = (&body[start..], body[..start].chars().next_back());
    if token.is_empty() { return Tail::Ends; }
    let lower = token.to_lowercase();
    if ABBR.contains(&lower.as_str()) { return Tail::Abbr; }
    // an initial: one capital letter standing alone — "A. P. J. Abdul Kalam", "John F. Kennedy"
    let mut cs = token.chars();
    // (not "I": "So do I. Then we left." is two sentences)
    if let (Some(c), None) = (cs.next(), cs.next()) { if c.is_uppercase() && c != 'I' && before.is_none_or(|b| b.is_whitespace() || matches!(b, '(' | '"' | '\u{201c}' | '\'' | '\u{2018}')) { return Tail::Abbr; } }
    if ABBR_NUM.contains(&lower.as_str()) { return Tail::AbbrNum; }
    Tail::Ends
}
fn sentences(text: &str) -> u64 {
    let (mut n, mut open) = (0u64, Tail::Ends);
    for (at, seg) in text.split_sentence_bound_indices() {
        if !seg.chars().any(char::is_alphanumeric) {                              // "***", a row of dashes: no sentence
            if seg.chars().any(is_break) { open = Tail::Ends; }
            continue;
        }
        let first = seg.trim_start().chars().next();
        let goes_on = match open { Tail::Ends => false, Tail::Abbr => true, Tail::AbbrNum => first.is_some_and(char::is_numeric), Tail::Glued => seg.chars().next().is_some_and(char::is_alphanumeric), Tail::Quoted => first.is_some_and(char::is_lowercase), Tail::Mark => false };
        if !goes_on { n += 1; }
        open = tail(seg);
        if open == Tail::Mark {
            let end = at + seg.len();
            let from = text[..end].rfind(char::is_whitespace).map_or(0, |i| i + text[i..].chars().next().unwrap().len_utf8());
            let to = text[end..].find(char::is_whitespace).map_or(text.len(), |i| end + i);
            open = if is_address(&text[from..to]) { Tail::Glued } else { Tail::Ends };
        }
    }
    n
}

// ------------------------------------------------------------------ lines and paragraphs
/// (lines, paragraphs). A line break at the very end does not start another line. Paragraphs are the blocks between
/// blank lines (a line without a letter, a digit or an emoji — a row of asterisks — separates like a blank one); a text that has no blank line anywhere is taken as one paragraph a line (text copied from a word
/// processor or a web page comes like that).
fn lines_paragraphs(text: &str) -> (u64, u64) {
    if text.is_empty() { return (0, 0); }
    let (mut lines, mut filled, mut blocks, mut in_block, mut any_blank_between) = (0u64, 0u64, 0u64, false, false);
    let mut rest = text;
    loop {
        let end = rest.find(is_break);
        let line = &rest[..end.unwrap_or(rest.len())];
        lines += 1;
        if !line.chars().any(|c| c.is_alphanumeric() || c as u32 >= 0x1F000) { in_block = false; }   // blank, or a row of *** / ---
        else {
            filled += 1;
            if !in_block { if blocks > 0 { any_blank_between = true; } blocks += 1; in_block = true; }
        }
        let Some(e) = end else { break };
        let b = rest[e..].chars().next().unwrap();
        let mut next = e + b.len_utf8();
        if b == '\r' && rest[next..].starts_with('\n') { next += 1; }
        rest = &rest[next..];
        if rest.is_empty() { break; }                                             // the text ends with its last line break
    }
    (lines, if any_blank_between { blocks } else { filled })
}

/// (characters, characters that are not white space): extended grapheme clusters. Plain ASCII is counted directly —
/// between two ASCII characters there is always a boundary, except inside CR LF — and the crate's segmenter is asked
/// only for the stretches around other characters (a stretch ends where two ASCII characters meet).
fn characters(text: &str) -> (u64, u64) {
    let (b, mut chars, mut no_space, mut i) = (text.as_bytes(), 0u64, 0u64, 0usize);
    let ascii_space = |c: u8| matches!(c, b' ' | b'\t' | b'\n' | b'\r' | 0x0b | 0x0c);
    while i < b.len() {
        if b[i] < 0x80 && (i + 1 == b.len() || b[i + 1] < 0x80) {
            if !(b[i] == b'\r' && i + 1 < b.len() && b[i + 1] == b'\n') { chars += 1; if !ascii_space(b[i]) { no_space += 1; } }
            i += 1;
            continue;
        }
        let mut j = i + 1;
        while j < b.len() && !(b[j - 1] < 0x80 && b[j] < 0x80) { j += 1; }
        // (a CR that closes the stretch may belong to a CR LF: leave it to the loop above)
        if j < b.len() && b[j - 1] == b'\r' && j - 1 > i { j -= 1; }
        for g in text[i..j].graphemes(true) { chars += 1; if !g.chars().all(char::is_whitespace) { no_space += 1; } }
        i = j;
    }
    (chars, no_space)
}

pub(crate) fn json_str(out: &mut String, s: &str) {
    out.push('"');
    for c in s.chars() {
        match c { '"' => out.push_str("\\\""), '\\' => out.push_str("\\\\"), c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)), c => out.push(c) }
    }
    out.push('"');
}

fn stats(text: &str) -> String {
    let (chars, no_space) = characters(text);
    let mut w = Words { n: 0, chars: 0, seen: HashMap::new(), order: 0, stop: STOP.iter().copied().collect() };
    let mut cs: Vec<(usize, char)> = Vec::new();
    for chunk in text.split(char::is_whitespace) {
        if chunk.is_empty() { continue; }
        if chunk.contains(['@', ':', '.']) && is_address(chunk) { w.add(trim_edges(chunk), false); continue; }
        if chunk.is_ascii() && !chunk.contains("--") && !chunk.contains("..") && !chunk.contains([',', ';', '?', '!']) { w.piece(chunk); continue; }   // the usual case
        cs.clear();
        cs.extend(chunk.char_indices());
        let (mut i, mut from) = (0usize, 0usize);
        while i < cs.len() {
            let (at, c) = cs[i];
            let own = is_cjk(c) && c.is_alphanumeric();                           // a word of its own
            let cut = if own || is_sea(c) { 1 } else { divider(&cs, i) };
            if cut == 0 { i += 1; continue; }
            w.piece(&chunk[from..at]);
            i += cut;
            from = cs.get(i).map_or(chunk.len(), |x| x.0);
            if own { w.add(&chunk[at..at + c.len_utf8()], false); }
        }
        w.piece(&chunk[from..]);
    }
    let (lines, paragraphs) = lines_paragraphs(text);
    let mut top: Vec<(&String, &(u32, u32))> = w.seen.iter().filter(|(_, v)| v.0 >= 2).collect();   // a word used once is no keyword
    top.sort_by(|a, b| b.1 .0.cmp(&a.1 .0).then(a.1 .1.cmp(&b.1 .1)));
    let mut out = format!("{{\"words\":{},\"chars\":{},\"noSpace\":{},\"sentences\":{},\"paragraphs\":{},\"lines\":{},\"wordChars\":{},\"bytes\":{},\"top\":[",
        w.n, chars, no_space, sentences(text), paragraphs, lines, w.chars, text.len());
    for (i, (k, v)) in top.iter().take(10).enumerate() {
        if i > 0 { out.push(','); }
        out.push('['); json_str(&mut out, k); out.push_str(&format!(",{}]", v.0));
    }
    out.push_str("]}");
    out
}

/// Counts of a UTF-8 text (bytes that are not UTF-8 are read as U+FFFD, as browsers do).
#[cfg(feature = "text")] #[no_mangle] pub unsafe extern "C" fn tk_stats(p: *const u8, n: usize) -> i32 {
    let bytes = std::slice::from_raw_parts(p, n);
    let text = String::from_utf8_lossy(bytes);
    let json = stats(&text);
    OUT.with(|o| *o.borrow_mut() = json.into_bytes());
    0
}

/// The Case Converter's conversions of a UTF-8 text: a JSON array of strings in the order of case::all().
#[cfg(feature = "text")] #[no_mangle] pub unsafe extern "C" fn tk_case(p: *const u8, n: usize) -> i32 {
    let text = String::from_utf8_lossy(std::slice::from_raw_parts(p, n));
    let mut out = String::with_capacity(text.len() * 14 + 64);
    out.push('[');
    for (i, v) in case::all(&text).iter().enumerate() { if i > 0 { out.push(','); } json_str(&mut out, v); }
    out.push(']');
    OUT.with(|o| *o.borrow_mut() = out.into_bytes());
    0
}

/// The number of characters (grapheme clusters, as the Word Counter counts them) of every line of a text that is
/// split at "\n": a JSON array of numbers. For the Line Tools' "By length".
#[cfg(feature = "text")] #[no_mangle] pub unsafe extern "C" fn tk_line_lengths(p: *const u8, n: usize) -> i32 {
    let text = String::from_utf8_lossy(std::slice::from_raw_parts(p, n));
    let mut out = String::from("[");
    for (i, line) in text.split('\n').enumerate() { if i > 0 { out.push(','); } out.push_str(&characters(line).0.to_string()); }
    out.push(']');
    OUT.with(|o| *o.borrow_mut() = out.into_bytes());
    0
}

/// The characters a reader sees (extended grapheme clusters, as the Word Counter counts them): a JSON array with the
/// length of each in UTF-16 units, in order — the page cuts its own string with them. For the Fancy Text styles that
/// work character by character (a mark under every character, the text turned upside down).
#[cfg(feature = "text")] #[no_mangle] pub unsafe extern "C" fn tk_clusters(p: *const u8, n: usize) -> i32 {
    let text = String::from_utf8_lossy(std::slice::from_raw_parts(p, n));
    let mut out = String::with_capacity(text.len() * 2 + 2);
    out.push('[');
    for (i, g) in text.graphemes(true).enumerate() {
        if i > 0 { out.push(','); }
        let units: usize = g.chars().map(char::len_utf16).sum();
        if units < 10 { out.push((b'0' + units as u8) as char); } else { out.push_str(&units.to_string()); }
    }
    out.push(']');
    OUT.with(|o| *o.borrow_mut() = out.into_bytes());
    0
}

/// The differences of two UTF-8 texts (diff.rs): mode 0 lines, 1 words, 2 characters; `limit_ms` is the time after
/// which the comparing settles for a diff that is not the shortest. JSON in tk_out_ptr() / tk_out_len().
#[cfg(feature = "diff")] #[no_mangle] pub unsafe extern "C" fn tk_diff(pa: *const u8, na: usize, pb: *const u8, nb: usize, mode: u32, limit_ms: u32) -> i32 {
    let a = String::from_utf8_lossy(std::slice::from_raw_parts(pa, na));
    let b = String::from_utf8_lossy(std::slice::from_raw_parts(pb, nb));
    let json = diff::diff(&a, &b, mode, limit_ms);
    OUT.with(|o| *o.borrow_mut() = json.into_bytes());
    0
}

/// Lorem ipsum (lorem.rs): unit 0 paragraphs, 1 sentences, 2 words; `n` of them; `classic` = begin with "Lorem ipsum";
/// 32 bytes of seed at `seed` (the page fills them from crypto.getRandomValues; the tests choose them).
#[cfg(feature = "lorem")] #[no_mangle] pub unsafe extern "C" fn tk_lorem(unit: u32, n: u32, classic: u32, seed: *const u8) -> i32 {
    let mut s = [0u8; 32];
    s.copy_from_slice(std::slice::from_raw_parts(seed, 32));
    let json = lorem::lorem(unit, (n as usize).min(1_000_000), classic != 0, s);
    OUT.with(|o| *o.borrow_mut() = json.into_bytes());
    0
}
