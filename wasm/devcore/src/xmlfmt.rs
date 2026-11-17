//! XML formatter that changes nothing but the white space between tags. Every tag, attribute, entity reference,
//! comment, CDATA section, processing instruction, the XML declaration and the DOCTYPE (with its internal subset) are
//! written back exactly as they were typed. (Re-serialising the browser's DOM lost the declaration and the DOCTYPE
//! ids, expanded entities, turned &#10; in attributes into real line breaks and — worse — trimmed text: a
//! non-breaking space, a single space or "  padded  " inside an element disappeared.)
//! Rules: an element whose children are only elements, comments and PIs (plus white space) is laid out one child per
//! line; an element that holds text or CDATA is left exactly as written, and so is everything under
//! xml:space="preserve". Only XML white space (space, tab, CR, LF) counts as white space — not U+00A0.
//! Op "xmlfmt:<indent>:<comments>": indent 2 | 4 | -1 (tab) | 0 (minify); comments 1 = keep, 0 = drop. Input: the text.
//! The page checks well-formedness with the browser's parser first; this reader only needs the token boundaries.
use crate::R;

enum N<'a> { El { open: &'a str, close: &'a str, kids: Vec<N<'a>>, selfclosed: bool }, Text(&'a str), CData(&'a str), Comment(&'a str), Other(&'a str) }

fn is_ws(t: &str) -> bool { t.bytes().all(|c| c == b' ' || c == b'\t' || c == b'\r' || c == b'\n') }
/// The end of a markup declaration that starts at `i` ("<!DOCTYPE …" with a possible [internal subset] and quoted ids).
fn doctype_end(b: &[u8], mut i: usize) -> usize {
    let (mut depth, mut q) = (0i32, 0u8);
    while i < b.len() {
        let c = b[i];
        if q != 0 { if c == q { q = 0; } } else if c == b'"' || c == b'\'' { q = c; } else if c == b'[' { depth += 1; } else if c == b']' { depth -= 1; }
        else if c == b'<' && b[i..].starts_with(b"<!--") { i = find(b, i + 4, b"-->").map_or(b.len(), |e| e + 2); }
        else if c == b'>' && depth <= 0 { return i + 1; }
        i += 1;
    }
    b.len()
}
fn find(b: &[u8], from: usize, pat: &[u8]) -> Option<usize> { if from > b.len() { return None; } b[from..].windows(pat.len()).position(|w| w == pat).map(|p| from + p) }
/// The end (index after ">") of the tag that starts at `i`; quotes may hold ">".
fn tag_end(b: &[u8], mut i: usize) -> usize { let mut q = 0u8; while i < b.len() { let c = b[i]; if q != 0 { if c == q { q = 0; } } else if c == b'"' || c == b'\'' { q = c; } else if c == b'>' { return i + 1; } i += 1; } b.len() }
fn name_of(tag: &str) -> &str { let t = tag.trim_start_matches('<').trim_start_matches('/'); let e = t.find(|c: char| c.is_whitespace() || c == '/' || c == '>').unwrap_or(t.len()); &t[..e] }

fn parse<'a>(s: &'a str) -> Result<Vec<N<'a>>, String> {
    let b = s.as_bytes(); let mut i = 0;
    // stack of open elements: (open tag, children so far)
    let mut stack: Vec<(&'a str, Vec<N<'a>>)> = vec![("", Vec::new())];
    while i < b.len() {
        if b[i] != b'<' { let e = find(b, i, b"<").unwrap_or(b.len()); stack.last_mut().unwrap().1.push(N::Text(&s[i..e])); i = e; continue; }
        if b[i..].starts_with(b"<!--") { let e = find(b, i + 4, b"-->").map_or(b.len(), |p| p + 3); stack.last_mut().unwrap().1.push(N::Comment(&s[i..e])); i = e; continue; }
        if b[i..].starts_with(b"<![CDATA[") { let e = find(b, i + 9, b"]]>").map_or(b.len(), |p| p + 3); stack.last_mut().unwrap().1.push(N::CData(&s[i..e])); i = e; continue; }
        if b[i..].starts_with(b"<?") { let e = find(b, i + 2, b"?>").map_or(b.len(), |p| p + 2); stack.last_mut().unwrap().1.push(N::Other(&s[i..e])); i = e; continue; }
        if b[i..].starts_with(b"<!") { let e = doctype_end(b, i + 2); stack.last_mut().unwrap().1.push(N::Other(&s[i..e])); i = e; continue; }
        let e = tag_end(b, i + 1); let tag = &s[i..e]; i = e;
        if tag.starts_with("</") {
            if stack.len() < 2 { return Err(format!("{tag} closes nothing")); }
            let (open, kids) = stack.pop().unwrap();
            if name_of(open) != name_of(tag) { return Err(format!("{tag} does not match <{}>", name_of(open))); }
            stack.last_mut().unwrap().1.push(N::El { open, close: tag, kids, selfclosed: false });
        } else if tag.ends_with("/>") { stack.last_mut().unwrap().1.push(N::El { open: tag, close: "", kids: Vec::new(), selfclosed: true }); }
        else { stack.push((tag, Vec::new())); }
    }
    if stack.len() != 1 { return Err(format!("<{}> is never closed", name_of(stack.last().unwrap().0))); }
    Ok(stack.pop().unwrap().1)
}
/// xml:space="preserve" (either quote) on this tag.
fn preserve(open: &str) -> bool { open.find("xml:space").map_or(false, |p| { let r = open[p + 9..].trim_start(); r.strip_prefix('=').map_or(false, |v| { let v = v.trim_start(); v.starts_with("\"preserve\"") || v.starts_with("'preserve'") }) }) }
fn raw(n: &N, comments: bool, o: &mut String) {
    match n {
        N::El { open, close, kids, .. } => { o.push_str(open); for k in kids { raw(k, comments, o); } o.push_str(close); }
        N::Text(t) | N::CData(t) | N::Other(t) => o.push_str(t),
        N::Comment(t) => { if comments { o.push_str(t); } }
    }
}
fn emit(n: &N, ind: &str, depth: usize, comments: bool, o: &mut String) {
    let pad = |o: &mut String, d: usize| { for _ in 0..d { o.push_str(ind); } };
    match n {
        N::El { open, close, kids, selfclosed } => {
            if *selfclosed || kids.is_empty() { o.push_str(open); o.push_str(close); return; }
            let holds_text = kids.iter().any(|k| matches!(k, N::CData(_)) || matches!(k, N::Text(t) if !is_ws(t)));
            let only_ws = kids.iter().all(|k| matches!(k, N::Text(_)) || (!comments && matches!(k, N::Comment(_))));
            // text content, a lone " ", or xml:space="preserve": exactly as written
            if holds_text || only_ws || preserve(open) { raw(n, comments, o); return; }
            o.push_str(open);
            for k in kids {
                if matches!(k, N::Text(_)) || (!comments && matches!(k, N::Comment(_))) { continue; }
                if !ind.is_empty() { o.push('\n'); pad(o, depth + 1); }
                emit(k, ind, depth + 1, comments, o);
            }
            if !ind.is_empty() { o.push('\n'); pad(o, depth); }
            o.push_str(close);
        }
        N::Text(t) | N::CData(t) | N::Other(t) => o.push_str(t),
        N::Comment(t) => { if comments { o.push_str(t); } }
    }
}
pub fn run(opts: &str, input: &[u8]) -> R {
    let mut p = opts.split(':');
    let indent: i64 = p.next().and_then(|x| x.parse().ok()).unwrap_or(2);
    let comments = p.next() != Some("0");
    let text = std::str::from_utf8(input).map_err(|_| "The text is not valid UTF-8")?;
    let s = text.strip_prefix('\u{feff}').unwrap_or(text);
    let ind = if indent < 0 { "\t".to_string() } else { " ".repeat(indent.min(16) as usize) };
    let top = parse(s)?;
    let mut o = String::with_capacity(s.len() + s.len() / 4);
    let mut first = true;
    for n in &top {
        if matches!(n, N::Text(_)) || (!comments && matches!(n, N::Comment(_))) { continue; } // only white space is allowed between top-level items
        if !first && !ind.is_empty() { o.push('\n'); }
        first = false;
        emit(n, &ind, 0, comments, &mut o);
    }
    Ok(o.into_bytes())
}
