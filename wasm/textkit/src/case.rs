//! Case Converter: thirteen conversions of a text, line by line (line breaks, tabs and blank lines stay as they are).
//!
//! Title Case follows John Gruber's rules as the Python package `titlecase` 2.4.1 (MIT) carries them out — the unit
//! suite holds this file to that package — with the differences noted at `title_line`. The code cases split words the
//! way npm's `change-case` does (the suite compares), and besides keep what that library loses: combining marks
//! (Hindi vowel signs, accents written as marks) stay with their letter and an apostrophe is dropped, not a divider.
use unicode_segmentation::UnicodeSegmentation;

const SMALL: &[&str] = &["a", "an", "and", "as", "at", "but", "by", "en", "for", "if", "in", "of", "on", "or", "the", "to", "v", "v.", "via", "vs", "vs."];
/// Gruber's punctuation class
fn is_punct(c: char) -> bool { "!\"\u{201c}#$%&'\u{2018}()*+,-\u{2013}\u{2012}\u{2014}\u{2015}./:;?@[\\]_`{|}~".contains(c) }
fn is_line_break(c: char) -> bool { matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}') }
fn is_wordchar(c: char) -> bool { c.is_alphanumeric() || c == '_' }
fn is_apostrophe(c: char) -> bool { matches!(c, '\'' | '\u{2019}' | '\u{2018}' | '\u{2bc}') }

/// `f` on every line; the line breaks are copied.
fn per_line(text: &str, f: impl Fn(&str, &mut String)) -> String {
    let (mut out, mut from) = (String::with_capacity(text.len() + 16), 0usize);
    for (i, c) in text.char_indices() {
        if is_line_break(c) { f(&text[from..i], &mut out); out.push(c); from = i + c.len_utf8(); }
    }
    f(&text[from..], &mut out);
    out
}
/// First letter upper case, the rest as it is.
fn upper_first(s: &str) -> String {
    let mut cs = s.chars();
    match cs.next() { Some(c) => c.to_uppercase().chain(cs).collect(), None => String::new() }
}
/// Python's str.capitalize(): first character upper case, the rest lower case.
fn capitalize(s: &str) -> String {
    let mut cs = s.chars();
    match cs.next() { Some(c) => c.to_uppercase().collect::<String>() + &cs.as_str().to_lowercase(), None => String::new() }
}

// ------------------------------------------------------------------ Title Case
struct Word { text: String, /** left as typed (a name with capitals inside, a domain): no rule touches it again */ kept: bool }
fn small(word: &str) -> bool { SMALL.contains(&word.to_lowercase().as_str()) }
/// `^[dol]['‘’]letters+(['s]{2})?$` — d'Artagnan, O'Neil, l'Amour
fn apos_second(cs: &[char]) -> bool {
    if cs.len() < 3 || !matches!(cs[0].to_ascii_lowercase(), 'd' | 'o' | 'l') || !is_apostrophe(cs[1]) || cs[1] == '\u{2bc}' { return false; }
    let letters = cs[2..].iter().take_while(|c| c.is_alphabetic()).count();
    let rest = &cs[2 + letters..];
    letters >= 1 && (rest.is_empty() || (rest.len() == 2 && rest.iter().all(|c| matches!(c, '\'' | 's')) && letters >= 1))
}
/// A capital letter after the first letter of the word (iPhone, NASA, McDonald, AT&T): the writer's own spelling.
fn capital_inside(word: &str) -> bool {
    let mut letters = word.chars().skip_while(|c| is_punct(*c)).take_while(|c| c.is_alphabetic());
    letters.next().is_some() && letters.any(char::is_uppercase)
}
fn inline_period(cs: &[char]) -> bool { cs.windows(3).any(|w| w[0].is_alphabetic() && w[1] == '.' && w[2].is_alphabetic()) }
/// `^(?:[A-Z]\.|[A-Z]\.[A-Z])+$` — A.B., U.S.A
fn uc_initials(cs: &[char]) -> bool {
    let mut i = 0;
    while i < cs.len() {
        if !(cs[i].is_uppercase() && cs.get(i + 1) == Some(&'.')) { return false; }
        i += 2;
        if cs.get(i).is_some_and(|c| c.is_uppercase()) && cs.get(i + 1) != Some(&'.') { i += 1; }
    }
    !cs.is_empty()
}
/// The rules for one word that stands between spaces.
fn title_word(word: &str, all_caps: bool) -> Word {
    let cs: Vec<char> = word.chars().collect();
    let plain = |text: String| Word { text, kept: false };
    if cs.is_empty() { return plain(String::new()); }
    if all_caps && uc_initials(&cs) { return Word { text: word.to_string(), kept: true }; }
    if apos_second(&cs) {
        let first: String = if cs[0].to_ascii_lowercase() == 'o' { cs[0].to_uppercase().collect() } else { cs[0].to_lowercase().collect() };
        return plain(first + &cs[1].to_string() + &cs[2].to_uppercase().collect::<String>() + &cs[3..].iter().collect::<String>());
    }
    // McDonald — three letters behind "Mc" make a name ("mcqs", "MCLR" are none), and capitals of the writer's own
    // (MCQs, MCOCA in a line that is not all capitals) are an acronym
    if cs.len() >= 5 && matches!(cs[0], 'm' | 'M') && (cs[1] == 'c' || (cs[1] == 'C' && all_caps)) && cs[2..5].iter().all(|c| c.is_alphabetic()) && (all_caps || !cs[3..].iter().any(|c| c.is_uppercase())) {
        let rest: String = cs[2..].iter().collect();
        return plain(format!("Mc{}", title_line(&rest, true)));
    }
    let lower = word.to_lowercase();
    if matches!(lower.as_str(), "mr" | "mrs" | "ms" | "dr") { return plain(upper_first(word)); }
    if inline_period(&cs) || (!all_caps && capital_inside(word)) { return Word { text: word.to_string(), kept: true }; }
    if small(word) { return plain(lower); }
    if word.contains('/') && !word.contains("//") { return plain(word.split('/').map(|p| title_line(p, false)).collect::<Vec<_>>().join("/")); }
    if word.contains('-') { return plain(word.split('-').map(|p| title_line(p, false)).collect::<Vec<_>>().join("-")); }
    let w = if all_caps { lower } else { word.to_string() };
    // the first letter, if only punctuation stands before it
    let at = w.char_indices().find(|(_, c)| !is_punct(*c));
    plain(match at { Some((i, c)) if c.is_alphabetic() => format!("{}{}{}", &w[..i], c.to_uppercase(), &w[i + c.len_utf8()..]), _ => w })
}
/// One line as a title. `first_last`: a small word that opens or closes the line gets its capital (not inside a
/// compound: "state-of-the-art" → "State-of-the-Art").
///
/// Differences from the Python package, each on purpose (the unit suite lists the cases):
///  · no "a word without vowels is an acronym" guess — it wrote "Tata Motors PVT LTD", "24 HRS", "the NTH time";
///  · "Mc" is completed only in a word without other capitals and with three letters behind it ("MCQs" stays, the
///    package wrote "McQs");
///  · a word left as typed (app.js, iPhone, toString) is not touched by the first / last / after-a-colon rules (the
///    package wrote "example.At", ": About.me", ": ToString");
///  · the first and the last word are the first and the last that are not empty (a line may begin with spaces);
///  · tabs stay tabs; a typographic apostrophe counts in O’Neil / d’Artagnan.
pub fn title_line(line: &str, first_last: bool) -> String {
    let all_caps = line.to_uppercase() == line;
    let mut words: Vec<Word> = Vec::new();
    let mut seps: Vec<char> = Vec::new();                                         // seps[i] stands before words[i + 1]
    let mut from = 0;
    for (i, c) in line.char_indices() {
        if c == ' ' || c == '\t' { words.push(title_word(&line[from..i], all_caps)); seps.push(c); from = i + 1; }
    }
    words.push(title_word(&line[from..], all_caps));
    if first_last {
        if let Some(w) = words.iter_mut().find(|w| !w.text.is_empty()) {
            if !w.kept {
                // ^(punctuation*)(small word)\b
                let start = w.text.char_indices().find(|(_, c)| !is_punct(*c)).map_or(w.text.len(), |(i, _)| i);
                let body = &w.text[start..];
                let hit = SMALL.iter().filter(|s| body.len() >= s.len() && body.is_char_boundary(s.len()) && body[..s.len()].eq_ignore_ascii_case(s))
                    .filter(|s| { let (last, next) = (s.chars().next_back().unwrap(), body[s.len()..].chars().next()); is_wordchar(last) != next.is_some_and(is_wordchar) }).map(|s| s.len()).max();
                if let Some(n) = hit { w.text = format!("{}{}{}", &w.text[..start], capitalize(&body[..n]), &body[n..]); }
            }
        }
        if let Some(w) = words.iter_mut().rev().find(|w| !w.text.is_empty()) {
            if !w.kept {
                // \b(small word)[punctuation]?$
                let t = w.text.clone();
                let tail_punct = t.chars().next_back().filter(|c| is_punct(*c)).map_or(0, char::len_utf8);
                for cut in [0, tail_punct] {
                    let body = &t[..t.len() - cut];
                    let hit = SMALL.iter().filter(|s| body.len() >= s.len() && body.is_char_boundary(body.len() - s.len()) && body[body.len() - s.len()..].eq_ignore_ascii_case(s))
                        .filter(|s| { let (first, before) = (s.chars().next().unwrap(), body[..body.len() - s.len()].chars().next_back()); is_wordchar(first) != before.is_some_and(is_wordchar) }).map(|s| s.len()).max();
                    if let Some(n) = hit { let at = body.len() - n; w.text = format!("{}{}", &t[..at], capitalize(&t[at..])); break; }
                    if cut == tail_punct { break; }
                }
            }
        }
    }
    // a small word right after ": ", ". ", "? ", "- " … opens a part of the title
    for i in 1..words.len() {
        if seps[i - 1] == ' ' && !words[i].kept && SMALL.contains(&words[i].text.as_str()) && words[i - 1].text.chars().next_back().is_some_and(|c| ":.;?!-\u{2013}\u{2012}\u{2014}\u{2015}".contains(c)) {
            words[i].text = capitalize(&words[i].text);
        }
    }
    let mut out = String::with_capacity(line.len() + 8);
    for (i, w) in words.iter().enumerate() { if i > 0 { out.push(seps[i - 1]); } out.push_str(&w.text); }
    out
}

// ------------------------------------------------------------------ Sentence case
/// Lower case, a capital at the start of every sentence and line, and the English "I".
/// A sentence starts after . ! ? … (and closing quotes or brackets) and a space — not after a single letter with a
/// full stop (e.g., p.m., an initial) and not after a title or a fixed abbreviation.
fn sentence_case(text: &str) -> String {
    let low = text.to_lowercase();
    let cs: Vec<char> = low.chars().collect();
    let mut out = String::with_capacity(low.len() + 8);
    let mut start = true;                                                          // the next letter opens a sentence
    let mut i = 0;
    while i < cs.len() {
        let c = cs[i];
        if c.is_alphabetic() {
            // a word: letters and digits, apostrophes inside
            let mut end = i;
            while end < cs.len() && (cs[end].is_alphanumeric() || (is_apostrophe(cs[end]) && cs.get(end + 1).is_some_and(|x| x.is_alphabetic()))) { end += 1; }
            let word: String = cs[i..end].iter().collect();
            let plain: String = word.chars().map(|x| if is_apostrophe(x) { '\'' } else { x }).collect();
            // the English pronoun: "i" standing alone (not the i of "i.e.", not a letter that carries a mark)
            let alone = cs.get(end).is_none_or(|x| x.is_whitespace() || ".,;:!?)]}\"'\u{2019}\u{201d}\u{2026}-\u{2014}\u{2013}".contains(*x));
            let me = match plain.as_str() { "i" => alone && !(cs.get(end) == Some(&'.') && cs.get(end + 1).is_some_and(|x| x.is_alphabetic())), "i'm" | "i'll" | "i've" | "i'd" => true, _ => false };
            if start || me { out.push_str(&upper_first(&word)); } else { out.push_str(&word); }
            start = false;
            i = end;
            continue;
        }
        out.push(c);
        if is_line_break(c) { start = true; }
        else if c.is_numeric() { start = false; }
        else if matches!(c, '.' | '!' | '?' | '\u{2026}') {
            // the mark must be followed (after more marks, closing quotes and brackets) by white space
            let mut j = i + 1;
            while j < cs.len() && matches!(cs[j], '.' | '!' | '?' | '\u{2026}' | '"' | '\'' | '\u{201d}' | '\u{2019}' | ')' | ']' | '\u{bb}') { j += 1; }
            if j < cs.len() && cs[j].is_whitespace() && !(c == '.' && abbreviation(&cs[..i])) { start = true; }
        }
        i += 1;
    }
    out
}
/// Is the full stop that follows `before` the one of an abbreviation?
fn abbreviation(before: &[char]) -> bool {
    let n = before.iter().rev().take_while(|c| c.is_alphanumeric() || **c == '.').count();
    let token: String = before[before.len() - n..].iter().collect();
    let last = token.rsplit('.').next().unwrap_or("");
    // a single letter: e.g., p.m., U.S., an initial — but "i" at the end of a sentence is the pronoun
    if last.chars().count() == 1 && last.chars().all(char::is_alphabetic) && !(token == "i") { return true; }
    crate::ABBR.contains(&token.as_str())
}

// ------------------------------------------------------------------ Capitalized Case
fn capitalized(text: &str) -> String {
    let low = text.to_lowercase();
    let (mut out, mut start) = (String::with_capacity(low.len() + 8), true);
    for c in low.chars() {
        if c.is_alphabetic() { if start { out.extend(c.to_uppercase()); } else { out.push(c); } start = false; continue; }
        out.push(c);
        if c.is_whitespace() || matches!(c, '-' | '\u{2010}' | '\u{2011}' | '\u{2013}' | '\u{2014}' | '/' | '(' | '[' | '{' | '"' | '\u{201c}' | '\u{2018}' | '\u{ab}') { start = true; }
        else if !is_apostrophe(c) && !is_punct(c) { start = false; }               // a digit or a mark: the word has begun
    }
    out
}

// ------------------------------------------------------------------ code cases
/// The words of a line for camelCase & co.: runs of letters and digits (with the marks that belong to them), cut at
/// lower→Upper ("fooBar"), before the last capital of a run of capitals ("XMLHttp" → XML, Http) and at digit→Upper
/// ("v2Api" → v2, Api). An apostrophe between letters is dropped ("don't" → dont).
fn code_words(line: &str) -> Vec<String> {
    let gs: Vec<&str> = line.graphemes(true).collect();
    let first = |g: &str| g.chars().next().unwrap_or(' ');
    let (mut words, mut cur): (Vec<String>, Vec<&str>) = (Vec::new(), Vec::new());
    let flush = |cur: &mut Vec<&str>, words: &mut Vec<String>| { if !cur.is_empty() { words.push(cur.concat()); cur.clear(); } };
    for (i, g) in gs.iter().enumerate() {
        let c = first(g);
        if !c.is_alphanumeric() {
            let inside = is_apostrophe(c) && i > 0 && first(gs[i - 1]).is_alphabetic() && gs.get(i + 1).is_some_and(|n| first(n).is_alphabetic());
            if !inside { flush(&mut cur, &mut words); }
            // a vowel sign that hangs on a divider ("_" + sign) still opens the next word, as it does after a space
            if let Some((k, _)) = g.char_indices().find(|(_, x)| x.is_alphanumeric()) { cur.push(&g[k..]); }
            continue;
        }
        if let Some(p) = cur.last().map(|p| first(p)) {
            let next_lower = gs.get(i + 1).is_some_and(|n| first(n).is_lowercase());
            if c.is_uppercase() && (p.is_lowercase() || p.is_ascii_digit() || (p.is_uppercase() && next_lower)) { flush(&mut cur, &mut words); }
        }
        cur.push(g);
    }
    flush(&mut cur, &mut words);
    words
}
fn code_case(text: &str, sep: &str, style: u8) -> String {
    per_line(text, |line, out| {
        for (i, w) in code_words(line).iter().enumerate() {
            if i > 0 { out.push_str(sep); }
            match style {
                0 => out.push_str(&w.to_lowercase()),
                1 => out.push_str(&w.to_uppercase()),
                2 => out.push_str(&capitalize(w)),                                   // PascalCase
                _ => if i == 0 { out.push_str(&w.to_lowercase()) } else { out.push_str(&capitalize(w)) },   // camelCase
            }
        }
    })
}

/// The conversions, in the order the tab lists them.
pub fn all(text: &str) -> Vec<String> {
    vec![
        text.to_uppercase(),
        text.to_lowercase(),
        per_line(text, |line, out| out.push_str(&title_line(line, true))),
        sentence_case(text),
        capitalized(text),
        code_case(text, "", 3),
        code_case(text, "", 2),
        code_case(text, "_", 0),
        code_case(text, "-", 0),
        code_case(text, "_", 1),
        code_case(text, ".", 0),
        text.chars().enumerate().flat_map(|(i, c)| if i % 2 == 1 { c.to_uppercase().collect::<Vec<char>>() } else { c.to_lowercase().collect() }).collect(),
        text.chars().flat_map(|c| { let up: Vec<char> = c.to_uppercase().collect(); if up.len() == 1 && up[0] == c { c.to_lowercase().collect::<Vec<char>>() } else { up } }).collect(),
    ]
}
