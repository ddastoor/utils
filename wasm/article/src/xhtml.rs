//! The article (a node of dom_query's tree, as Readability left it) written as XHTML for an EPUB's chapter: what an EPUB
//! reader and the Kindle need, valid as EPUB 3 content (the HTML content models kept — a list holds items, a table its
//! rows, a paragraph no blocks), and nothing else.
//!
//!   · Elements: the text's own (paragraphs, headings, lists, quotes, tables, figures, code, emphasis, links, pictures)
//!     under their HTML names; old names mapped (tt → code, strike → s, center → div); anything else — custom elements,
//!     layout wrappers — gives way to its content. Scripts, styles, forms and their controls are left out; a video, a
//!     sound or an embedded page becomes a link to it; inline SVG is left out (icons, mostly) and MathML becomes its TeX
//!     source or its text.
//!   · Attributes: links' addresses (http, https, mailto — and the article's own #ids), a picture's description, a list's
//!     start and numbering, a cell's spans, lang and dir; the page's classes and styles are left out.
//!   · Pictures: `<img src="⟦n⟧" alt="…"/>` — n the index of `images`, whose addresses (src, srcset, the sources of a
//!     <picture>, lazy-loading attributes) the page looks up among the saved page's files.
//!   · Ids: only those an internal link points to; a link whose target is not written loses its address.
use dom_smoothie::dom_query::NodeRef;
use std::collections::HashSet;

/// A picture of the article: its addresses (the best first) and its description.
pub struct Image { pub urls: Vec<(String, f64)>, pub alt: String }

/// What was left out, counted (the page says so).
#[derive(Default)]
pub struct Dropped { pub videos: usize, pub embeds: usize, pub svg: usize, pub forms: usize }

pub struct Written { pub xhtml: String, pub images: Vec<Image>, pub dropped: Dropped }

#[derive(Clone, Copy, PartialEq)]
enum Ctx { Flow, Phrasing, List, Dl, Section, Row, Colgroup }

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Drop, Unwrap, Para(&'static str), Block(&'static str), Pre, Inline(&'static str), A, Img, Picture, Br, Hr, Wbr,
    List(&'static str), Li, Dl, Dt, Dd, Table, TSection(&'static str), Tr, Cell(&'static str), Caption, Colgroup, Col,
    Figure, Figcaption, Media(&'static str), Svg, Math, Form, Control,
}

const SVG_NS: &str = "http://www.w3.org/2000/svg";
const MATH_NS: &str = "http://www.w3.org/1998/Math/MathML";

fn kind(name: &str, ns: &str) -> Kind {
    if ns == SVG_NS { return if name == "svg" { Kind::Svg } else { Kind::Drop }; }
    if ns == MATH_NS { return if name == "math" { Kind::Math } else { Kind::Drop }; }
    match name {
        "p" => Kind::Para("p"),
        "h1" => Kind::Para("h1"), "h2" => Kind::Para("h2"), "h3" => Kind::Para("h3"),
        "h4" => Kind::Para("h4"), "h5" => Kind::Para("h5"), "h6" => Kind::Para("h6"),
        "summary" | "legend" => Kind::Para("p"),
        "div" | "section" | "article" | "main" | "aside" | "header" | "footer" | "nav" | "address" | "center" | "hgroup"
        | "details" | "search" | "dialog" | "fieldset" => Kind::Block("div"),
        "blockquote" => Kind::Block("blockquote"),
        "figure" => Kind::Figure, "figcaption" => Kind::Figcaption,
        "pre" | "listing" | "xmp" | "plaintext" => Kind::Pre,
        "ul" | "menu" | "dir" => Kind::List("ul"), "ol" => Kind::List("ol"), "li" => Kind::Li,
        "dl" => Kind::Dl, "dt" => Kind::Dt, "dd" => Kind::Dd,
        "table" => Kind::Table, "thead" => Kind::TSection("thead"), "tbody" => Kind::TSection("tbody"), "tfoot" => Kind::TSection("tfoot"),
        "tr" => Kind::Tr, "td" => Kind::Cell("td"), "th" => Kind::Cell("th"), "caption" => Kind::Caption,
        "colgroup" => Kind::Colgroup, "col" => Kind::Col,
        "a" => Kind::A, "img" | "image" => Kind::Img, "picture" => Kind::Picture, "br" => Kind::Br, "hr" => Kind::Hr, "wbr" => Kind::Wbr,
        "abbr" | "b" | "bdi" | "bdo" | "cite" | "code" | "del" | "dfn" | "em" | "i" | "ins" | "kbd" | "mark" | "q" | "s"
        | "samp" | "small" | "span" | "strong" | "sub" | "sup" | "time" | "u" | "var" => Kind::Inline(static_name(name)),
        "tt" => Kind::Inline("code"), "strike" => Kind::Inline("s"), "acronym" => Kind::Inline("abbr"),
        "big" | "font" | "nobr" | "label" | "output" | "data" | "blink" | "marquee" | "meter" | "progress" => Kind::Inline("span"),
        "video" => Kind::Media("Video"), "audio" => Kind::Media("Audio"),
        "iframe" | "embed" | "object" | "frame" | "applet" => Kind::Media("Embedded"),
        "form" => Kind::Form,
        "input" | "button" | "select" | "textarea" | "option" | "optgroup" | "datalist" | "keygen" => Kind::Control,
        "script" | "style" | "noscript" | "template" | "head" | "title" | "meta" | "link" | "base" | "canvas" | "source"
        | "track" | "area" | "param" | "frameset" | "noframes" | "noembed" | "portal" => Kind::Drop,
        _ => Kind::Unwrap,
    }
}
fn static_name(n: &str) -> &'static str {
    const NAMES: [&str; 23] = ["abbr", "b", "bdi", "bdo", "cite", "code", "del", "dfn", "em", "i", "ins", "kbd", "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u"];
    NAMES.iter().find(|x| **x == n).copied().unwrap_or("var")
}
/// Elements whose content is flow content in HTML (a paragraph may not hold them).
fn is_block(k: Kind) -> bool {
    !matches!(k, Kind::Inline(_) | Kind::A | Kind::Img | Kind::Picture | Kind::Br | Kind::Wbr | Kind::Unwrap | Kind::Drop | Kind::Media(_) | Kind::Svg | Kind::Math | Kind::Control)
}

/// Characters XML 1.0 does not allow (C0 controls but tab and line ends, U+FFFE / U+FFFF) and the C1 controls.
fn bad_char(c: char) -> bool { (c < ' ' && !matches!(c, '\t' | '\n' | '\r')) || ('\u{7f}'..='\u{9f}').contains(&c) || c == '\u{fffe}' || c == '\u{ffff}' }
pub fn esc_text(s: &str, out: &mut String) {
    for c in s.chars() {
        match c { '&' => out.push_str("&amp;"), '<' => out.push_str("&lt;"), '>' => out.push_str("&gt;"), c if bad_char(c) => {}, c => out.push(c) }
    }
}
pub fn esc_attr(s: &str, out: &mut String) {
    for c in s.chars() {
        match c { '&' => out.push_str("&amp;"), '<' => out.push_str("&lt;"), '>' => out.push_str("&gt;"), '"' => out.push_str("&quot;"), '\n' | '\r' | '\t' => out.push(' '), c if bad_char(c) => {}, c => out.push(c) }
    }
}
fn collapse(s: &str) -> String {
    let mut o = String::with_capacity(s.len());
    let mut sp = false;
    for c in s.chars() {
        if matches!(c, ' ' | '\t' | '\n' | '\r' | '\u{c}') { if !sp { o.push(' '); sp = true; } } else { o.push(c); sp = false; }
    }
    o
}
fn norm(s: &str) -> String { collapse(s).trim().to_lowercase() }

/// The candidates of a srcset attribute, with their sizes (w, or x × 1000 — any larger number is a larger picture).
pub fn srcset(v: &str) -> Vec<(String, f64)> {
    let mut out = Vec::new();
    let b: Vec<char> = v.chars().collect();
    let mut i = 0;
    while i < b.len() {
        while i < b.len() && (b[i].is_whitespace() || b[i] == ',') { i += 1; }
        if i >= b.len() { break; }
        let s = i;
        while i < b.len() && !b[i].is_whitespace() { i += 1; }
        let mut url: String = b[s..i].iter().collect();
        let mut desc = String::new();
        if url.ends_with(',') { url.pop(); } else {
            while i < b.len() && b[i] != ',' { desc.push(b[i]); i += 1; }
        }
        let d = desc.trim();
        let size = if let Some(w) = d.strip_suffix('w') { w.trim().parse::<f64>().unwrap_or(0.0) } else if let Some(x) = d.strip_suffix('x') { x.trim().parse::<f64>().unwrap_or(1.0) * 1000.0 } else { 1000.0 };
        if !url.is_empty() { out.push((url, size)); }
    }
    out
}

pub struct Writer {
    out: String,
    images: Vec<Image>,
    dropped: Dropped,
    targets: HashSet<String>,
    written: HashSet<String>,
    page: String,
    title: String,
    in_a: bool,
    in_pre: bool,
    dl: Vec<u8>,
    seen_text: bool,
    title_skipped: bool,
}

impl Writer {
    /// `page`: the page's address without its fragment (links to its own #ids become the article's); `title`: the
    /// article's title (a first heading that repeats it is left out — the chapter has it on top).
    pub fn new(page: &str, title: &str) -> Self {
        Writer { out: String::new(), images: Vec::new(), dropped: Dropped::default(), targets: HashSet::new(), written: HashSet::new(), page: page.split('#').next().unwrap_or("").to_string(), title: norm(title), in_a: false, in_pre: false, dl: Vec::new(), seen_text: false, title_skipped: false }
    }

    /// The article's content: the children of `root`.
    pub fn write(mut self, root: &NodeRef) -> Written {
        self.collect_targets(root);
        for c in root.children() { self.node(&c, Ctx::Flow); }
        // links to ids that were not written lose their address (an EPUB checker refuses them)
        let mut out = String::with_capacity(self.out.len());
        let mut rest = self.out.as_str();
        while let Some(p) = rest.find(" href=\"#") {
            out.push_str(&rest[..p]);
            let after = &rest[p + 8..];
            let Some(end) = after.find('"') else { out.push_str(&rest[p..]); rest = ""; break; };
            if self.written.contains(&unesc(&after[..end])) { out.push_str(&rest[p..p + 8 + end + 1]); }
            rest = &after[end + 1..];
        }
        out.push_str(rest);
        Written { xhtml: out, images: self.images, dropped: self.dropped }
    }

    /// The fragment an address points to inside this article, if it does.
    fn internal(&self, href: &str) -> Option<String> {
        let h = href.trim();
        if let Some(f) = h.strip_prefix('#') { return if f.is_empty() { None } else { Some(pct_decode(f)) }; }
        if !self.page.is_empty() {
            if let Some((base, frag)) = h.split_once('#') { if base == self.page && !frag.is_empty() { return Some(pct_decode(frag)); } }
        }
        None
    }
    fn collect_targets(&mut self, root: &NodeRef) {
        for d in root.descendants_it() {
            if d.is_element() && d.has_name("a") {
                if let Some(h) = d.attr("href") { if let Some(t) = self.internal(&h) { self.targets.insert(t); } }
            }
        }
    }
    /// ` id="…"` when a link points to this element's id (each id once).
    fn id_attr(&mut self, n: &NodeRef) -> String {
        let mut s = String::new();
        for key in ["id", "name"] {
            if let Some(id) = n.attr(key) {
                let id = id.trim().to_string();
                if !id.is_empty() && !id.contains(char::is_whitespace) && self.targets.contains(&id) && !self.written.contains(&id) {
                    self.written.insert(id.clone());
                    s.push_str(" id=\""); esc_attr(&id, &mut s); s.push('"');
                    break;
                }
            }
        }
        s
    }
    /// lang / dir of an element, when given.
    fn lang_dir(n: &NodeRef) -> String {
        let mut s = String::new();
        if let Some(l) = n.attr("lang") { let l = l.trim(); if !l.is_empty() && l.len() < 36 && l.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') { s.push_str(" lang=\""); s.push_str(l); s.push_str("\" xml:lang=\""); s.push_str(l); s.push('"'); } }
        if let Some(d) = n.attr("dir") { let d = d.trim().to_ascii_lowercase(); if matches!(d.as_str(), "ltr" | "rtl" | "auto") { s.push_str(" dir=\""); s.push_str(&d); s.push('"'); } }
        s
    }

    fn text(&mut self, raw: &str, ctx: Ctx) {
        // in <pre> every character stands as it is
        if self.in_pre && matches!(ctx, Ctx::Flow | Ctx::Phrasing) { esc_text(raw, &mut self.out); if !raw.trim().is_empty() { self.seen_text = true; } return; }
        let t = collapse(raw);
        if t.trim().is_empty() {
            // a space between two words or inline elements stays; between blocks it means nothing
            if matches!(ctx, Ctx::Flow | Ctx::Phrasing) && !t.is_empty() && !self.out.is_empty() && !self.out.ends_with(' ') && !(self.out.ends_with('>') && last_tag_block(&self.out)) { self.out.push(' '); }
            return;
        }
        self.seen_text = true;
        // no second space where the text before ended with one
        let t = if self.out.ends_with(' ') { t.trim_start().to_string() } else { t };
        match ctx {
            Ctx::Flow | Ctx::Phrasing => esc_text(&t, &mut self.out),
            Ctx::List => { self.out.push_str("<li>"); esc_text(t.trim(), &mut self.out); self.out.push_str("</li>"); }
            Ctx::Dl => { self.dd_start(); self.out.push_str("<dd>"); esc_text(t.trim(), &mut self.out); self.out.push_str("</dd>"); }
            Ctx::Section => { self.out.push_str("<tr><td>"); esc_text(t.trim(), &mut self.out); self.out.push_str("</td></tr>"); }
            Ctx::Row => { self.out.push_str("<td>"); esc_text(t.trim(), &mut self.out); self.out.push_str("</td>"); }
            Ctx::Colgroup => {}
        }
    }

    fn children(&mut self, n: &NodeRef, ctx: Ctx) { for c in n.children() { self.node(&c, ctx); } }

    /// An element that gives way to its content keeps a link's target as an empty anchor.
    fn anchor(&mut self, n: &NodeRef, ctx: Ctx) {
        if matches!(ctx, Ctx::Flow | Ctx::Phrasing) { let id = self.id_attr(n); if !id.is_empty() { self.out.push_str("<span"); self.out.push_str(&id); self.out.push_str("></span>"); } }
    }

    fn node(&mut self, n: &NodeRef, ctx: Ctx) {
        if n.is_text() { let t = n.text(); self.text(&t, ctx); return; }
        if !n.is_element() { return; }
        let (name, ns) = match n.qual_name_ref() { Some(q) => (q.local.to_ascii_lowercase(), q.ns.to_string()), None => return };
        let k = kind(&name, &ns);
        match ctx {
            Ctx::List => return self.in_list(n, k),
            Ctx::Dl => return self.in_dl(n, k),
            Ctx::Section => return self.in_section(n, k),
            Ctx::Row => return self.in_row(n, k),
            Ctx::Colgroup => { if k == Kind::Col { self.col(n); } return; }
            _ => {}
        }
        // a paragraph, a heading or an inline element holds no blocks: a block there gives way to its content
        if ctx == Ctx::Phrasing && is_block(k) {
            if k == Kind::Hr { return; }
            if !self.out.ends_with(' ') { self.out.push(' '); }
            self.anchor(n, ctx);
            self.children(n, Ctx::Phrasing);
            self.out.push(' ');
            return;
        }
        match k {
            Kind::Drop => {}
            Kind::Unwrap => { self.anchor(n, ctx); self.children(n, ctx); }
            Kind::Para(tag) => {
                // the first heading that only repeats the title (the chapter shows it on top)
                if tag.starts_with('h') && !self.title_skipped && !self.seen_text && !self.title.is_empty() && norm(&n.text()) == self.title {
                    self.title_skipped = true;
                    self.anchor(n, ctx);
                    return;
                }
                let start = self.out.len();
                self.out.push('<'); self.out.push_str(tag);
                let id = self.id_attr(n); self.out.push_str(&id);
                let ld = Self::lang_dir(n); self.out.push_str(&ld);
                self.out.push('>');
                let inner = self.out.len();
                self.children(n, Ctx::Phrasing);
                // an empty paragraph (spacing in the page) is left out
                if id.is_empty() && self.out[inner..].trim().is_empty() { self.out.truncate(start); return; }
                self.out.push_str("</"); self.out.push_str(tag); self.out.push('>');
            }
            Kind::Block(tag) => self.block(n, tag, Ctx::Flow),
            Kind::Form => { self.dropped.forms += 1; self.block(n, "div", Ctx::Flow); }
            Kind::Control => { self.dropped.forms += 1; }
            Kind::Pre => {
                self.out.push_str("<pre"); let id = self.id_attr(n); self.out.push_str(&id); self.out.push('>');
                let was = self.in_pre; self.in_pre = true;
                self.children(n, Ctx::Phrasing);
                self.in_pre = was;
                self.out.push_str("</pre>");
            }
            Kind::Inline(tag) => {
                self.out.push('<'); self.out.push_str(tag);
                let id = self.id_attr(n); self.out.push_str(&id);
                let ld = Self::lang_dir(n); self.out.push_str(&ld);
                if tag == "abbr" { if let Some(t) = n.attr("title") { self.out.push_str(" title=\""); esc_attr(&t, &mut self.out); self.out.push('"'); } }
                if tag == "time" { if let Some(t) = n.attr("datetime") { self.out.push_str(" datetime=\""); esc_attr(&t, &mut self.out); self.out.push('"'); } }
                self.out.push('>');
                self.children(n, Ctx::Phrasing);
                self.out.push_str("</"); self.out.push_str(tag); self.out.push('>');
            }
            Kind::A => self.link(n, ctx),
            Kind::Img => self.img(n, &[]),
            Kind::Picture => self.picture(n),
            Kind::Br => self.out.push_str("<br/>"),
            Kind::Wbr => self.out.push_str("<wbr/>"),
            Kind::Hr => self.out.push_str("<hr/>"),
            Kind::List(tag) => {
                self.out.push('<'); self.out.push_str(tag);
                let id = self.id_attr(n); self.out.push_str(&id);
                if tag == "ol" {
                    if let Some(s) = n.attr("start") { if let Ok(v) = s.trim().parse::<i64>() { self.out.push_str(&format!(" start=\"{v}\"")); } }
                    if n.has_attr("reversed") { self.out.push_str(" reversed=\"reversed\""); }
                    if let Some(t) = n.attr("type") { let t = t.trim(); if matches!(t, "1" | "a" | "A" | "i" | "I") { self.out.push_str(" type=\""); self.out.push_str(t); self.out.push('"'); } }
                }
                self.out.push('>');
                self.children(n, Ctx::List);
                self.out.push_str("</"); self.out.push_str(tag); self.out.push('>');
            }
            Kind::Li | Kind::Dd => self.block(n, "div", Ctx::Flow),
            Kind::Dt => { self.out.push_str("<p"); let id = self.id_attr(n); self.out.push_str(&id); self.out.push('>'); self.children(n, Ctx::Phrasing); self.out.push_str("</p>"); }
            Kind::Dl => self.dl(n),
            Kind::Table => self.table(n),
            Kind::TSection(_) | Kind::Tr | Kind::Cell(_) => { self.anchor(n, ctx); self.children(n, Ctx::Flow); }
            Kind::Caption => self.block(n, "div", Ctx::Flow),
            Kind::Colgroup | Kind::Col => {}
            Kind::Figure => self.figure(n),
            Kind::Figcaption => self.block(n, "div", Ctx::Flow),
            Kind::Media(what) => self.media(n, what, ctx),
            Kind::Svg => { self.dropped.svg += 1; }
            Kind::Math => self.math(n),
        }
    }

    fn block(&mut self, n: &NodeRef, tag: &str, inner: Ctx) {
        self.out.push('<'); self.out.push_str(tag);
        let id = self.id_attr(n); self.out.push_str(&id);
        let ld = Self::lang_dir(n); self.out.push_str(&ld);
        self.out.push('>');
        self.children(n, inner);
        self.out.push_str("</"); self.out.push_str(tag); self.out.push('>');
    }

    fn link(&mut self, n: &NodeRef, ctx: Ctx) {
        // a link inside a link gives way to its content
        if self.in_a { self.anchor(n, ctx); self.children(n, ctx); return; }
        self.out.push_str("<a");
        let id = self.id_attr(n); self.out.push_str(&id);
        if let Some(h) = n.attr("href") {
            if let Some(t) = self.internal(&h) {
                self.out.push_str(" href=\"#"); esc_attr(&t, &mut self.out); self.out.push('"');
            } else {
                let h = h.trim();
                let lower = h.to_ascii_lowercase();
                if lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("mailto:") {
                    self.out.push_str(" href=\""); esc_attr(h, &mut self.out); self.out.push('"');
                }
            }
        }
        self.out.push('>');
        self.in_a = true;
        // a link is as its parent: a link among blocks may hold blocks
        self.children(n, ctx);
        self.in_a = false;
        self.out.push_str("</a>");
    }

    /// A picture: the addresses it may come from, the best first (`extra`: the sources of its <picture>).
    fn img(&mut self, n: &NodeRef, extra: &[(String, f64)]) {
        let mut urls: Vec<(String, f64)> = extra.to_vec();
        for key in ["srcset", "data-srcset", "data-lazy-srcset"] {
            if let Some(v) = n.attr(key) { let mut c = srcset(&v); c.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal)); urls.extend(c); }
        }
        for key in ["src", "data-src", "data-lazy-src", "data-original", "data-url", "data-hi-res-src"] {
            if let Some(v) = n.attr(key) { let v = v.trim(); if !v.is_empty() && !urls.iter().any(|u| u.0 == v) { urls.push((v.to_string(), 0.0)); } }
        }
        if urls.is_empty() { return; }
        // a tracking pixel (1 × 1, as its page sizes it) is no picture
        let tiny = |k: &str| n.attr(k).and_then(|v| v.trim().trim_end_matches("px").parse::<f64>().ok()).is_some_and(|v| v <= 2.0);
        if tiny("width") || tiny("height") { return; }
        let alt = collapse(&n.attr("alt").map(|a| a.to_string()).unwrap_or_default()).trim().to_string();
        let i = self.images.len();
        self.images.push(Image { urls, alt: alt.clone() });
        self.seen_text = true;
        self.out.push_str(&format!("<img src=\"\u{27e6}{i}\u{27e7}\" alt=\""));
        esc_attr(&alt, &mut self.out);
        self.out.push_str("\"/>");
    }
    fn picture(&mut self, n: &NodeRef) {
        let mut extra = Vec::new();
        let mut img = None;
        for c in n.children() {
            if !c.is_element() { continue; }
            if c.has_name("source") {
                if let Some(v) = c.attr("srcset").or_else(|| c.attr("data-srcset")) {
                    let mut s = srcset(&v);
                    s.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
                    extra.extend(s);
                }
            } else if c.has_name("img") && img.is_none() { img = Some(c); }
        }
        match img {
            Some(i) => self.img(&i, &extra),
            None if !extra.is_empty() => {
                let i = self.images.len();
                self.images.push(Image { urls: extra, alt: String::new() });
                self.out.push_str(&format!("<img src=\"\u{27e6}{i}\u{27e7}\" alt=\"\"/>"));
            }
            None => {}
        }
    }

    fn media(&mut self, n: &NodeRef, what: &str, ctx: Ctx) {
        let mut src = n.attr("src").or_else(|| n.attr("data")).or_else(|| n.attr("data-src")).map(|s| s.to_string());
        if src.is_none() { for c in n.children() { if c.is_element() && c.has_name("source") { if let Some(s) = c.attr("src") { src = Some(s.to_string()); break; } } } }
        let src = src.unwrap_or_default();
        let lower = src.trim().to_ascii_lowercase();
        if what == "Embedded" { self.dropped.embeds += 1; } else { self.dropped.videos += 1; }
        if !(lower.starts_with("http://") || lower.starts_with("https://")) || self.in_a { return; }
        let host = src.trim().splitn(4, '/').nth(2).unwrap_or("").to_string();
        if ctx == Ctx::Flow { self.out.push_str("<p class=\"embed\">"); }
        self.out.push_str(what); self.out.push_str(": <a href=\""); esc_attr(src.trim(), &mut self.out); self.out.push_str("\">");
        esc_text(&host, &mut self.out);
        self.out.push_str("</a>");
        if ctx == Ctx::Flow { self.out.push_str("</p>"); }
        self.seen_text = true;
    }

    /// MathML: its TeX source when it carries one, else its text.
    fn math(&mut self, n: &NodeRef) {
        let mut tex = None;
        for d in n.descendants_it() {
            if d.is_element() && d.has_name("annotation") {
                if d.attr("encoding").is_some_and(|e| e.eq_ignore_ascii_case("application/x-tex")) { tex = Some(d.text().to_string()); break; }
            }
        }
        match tex {
            Some(t) => { self.out.push_str("<code class=\"tex\">"); esc_text(collapse(&t).trim(), &mut self.out); self.out.push_str("</code>"); }
            None => { let t = collapse(&n.text()); esc_text(t.trim(), &mut self.out); }
        }
        self.seen_text = true;
    }

    fn in_list(&mut self, n: &NodeRef, k: Kind) {
        match k {
            Kind::Drop | Kind::Control => {}
            Kind::Li => {
                self.out.push_str("<li"); let id = self.id_attr(n); self.out.push_str(&id);
                if let Some(v) = n.attr("value") { if let Ok(v) = v.trim().parse::<i64>() { self.out.push_str(&format!(" value=\"{v}\"")); } }
                self.out.push('>'); self.children(n, Ctx::Flow); self.out.push_str("</li>");
            }
            // a wrapper inside a list (a <div> round its items) gives way to them
            Kind::Unwrap | Kind::Block(_) | Kind::Form if has_child(n, "li") => self.children(n, Ctx::List),
            _ => { self.out.push_str("<li>"); self.node(n, Ctx::Flow); self.out.push_str("</li>"); }
        }
    }
    fn in_dl(&mut self, n: &NodeRef, k: Kind) {
        match k {
            Kind::Drop | Kind::Control => {}
            Kind::Dt => { self.set_dl(1); self.out.push_str("<dt"); let id = self.id_attr(n); self.out.push_str(&id); self.out.push('>'); self.children(n, Ctx::Phrasing); self.out.push_str("</dt>"); }
            Kind::Dd => { self.dd_start(); self.out.push_str("<dd"); let id = self.id_attr(n); self.out.push_str(&id); self.out.push('>'); self.children(n, Ctx::Flow); self.out.push_str("</dd>"); }
            Kind::Unwrap | Kind::Block(_) => self.children(n, Ctx::Dl),
            _ => { self.dd_start(); self.out.push_str("<dd>"); self.node(n, Ctx::Flow); self.out.push_str("</dd>"); }
        }
    }
    /// What the list of terms last held: 0 nothing, 1 a term, 2 a description.
    fn set_dl(&mut self, v: u8) { if let Some(t) = self.dl.last_mut() { *t = v; } }
    /// A description needs a term before it: an empty one when there is none.
    fn dd_start(&mut self) { if self.dl.last() == Some(&0) { self.out.push_str("<dt></dt>"); } self.set_dl(2); }
    fn in_section(&mut self, n: &NodeRef, k: Kind) {
        match k {
            Kind::Drop | Kind::Control => {}
            Kind::Tr => { self.out.push_str("<tr>"); self.children(n, Ctx::Row); self.out.push_str("</tr>"); }
            Kind::TSection(_) | Kind::Unwrap | Kind::Form => self.children(n, Ctx::Section),
            _ => { self.out.push_str("<tr><td>"); self.node(n, Ctx::Flow); self.out.push_str("</td></tr>"); }
        }
    }
    fn in_row(&mut self, n: &NodeRef, k: Kind) {
        match k {
            Kind::Drop | Kind::Control => {}
            Kind::Cell(tag) => {
                self.out.push('<'); self.out.push_str(tag);
                let id = self.id_attr(n); self.out.push_str(&id);
                for key in ["colspan", "rowspan"] {
                    if let Some(v) = n.attr(key) { if let Ok(v) = v.trim().parse::<u32>() { if v > 1 { self.out.push_str(&format!(" {key}=\"{}\"", v.min(if key == "colspan" { 1000 } else { 65534 }))); } } }
                }
                if tag == "th" { if let Some(s) = n.attr("scope") { let s = s.trim().to_ascii_lowercase(); if matches!(s.as_str(), "row" | "col" | "rowgroup" | "colgroup") { self.out.push_str(" scope=\""); self.out.push_str(&s); self.out.push('"'); } } }
                self.out.push('>'); self.children(n, Ctx::Flow); self.out.push_str("</"); self.out.push_str(tag); self.out.push('>');
            }
            Kind::Unwrap | Kind::Form => self.children(n, Ctx::Row),
            _ => { self.out.push_str("<td>"); self.node(n, Ctx::Flow); self.out.push_str("</td>"); }
        }
    }
    fn col(&mut self, n: &NodeRef) {
        self.out.push_str("<col");
        if let Some(v) = n.attr("span") { if let Ok(v) = v.trim().parse::<u32>() { if v > 1 { self.out.push_str(&format!(" span=\"{}\"", v.min(1000))); } } }
        self.out.push_str("/>");
    }

    fn dl(&mut self, n: &NodeRef) {
        // a list of terms is groups of terms followed by descriptions: a description without a term gets an empty term
        // before it, a term at the end an empty description
        self.out.push_str("<dl"); let id = self.id_attr(n); self.out.push_str(&id); self.out.push('>');
        self.dl.push(0);
        self.children(n, Ctx::Dl);
        if self.dl.pop() == Some(1) { self.out.push_str("<dd></dd>"); }
        self.out.push_str("</dl>");
    }

    fn table(&mut self, n: &NodeRef) {
        // the parts of a table in the order HTML wants them: a caption, column groups, the head, the bodies (loose rows
        // in a body of their own), the foot
        let mut caption = None;
        let mut cols = Vec::new();
        let mut head = None;
        let mut foot = None;
        enum Body<'a> { Part(NodeRef<'a>), Rows(Vec<NodeRef<'a>>) }
        let mut bodies: Vec<Body> = Vec::new();
        for c in n.children() {
            if c.is_text() { if c.text().trim().is_empty() { continue; } bodies.push(Body::Rows(vec![c])); continue; }
            if !c.is_element() { continue; }
            let (name, ns) = match c.qual_name_ref() { Some(q) => (q.local.to_ascii_lowercase(), q.ns.to_string()), None => continue };
            match kind(&name, &ns) {
                Kind::Caption if caption.is_none() => caption = Some(c),
                Kind::Colgroup | Kind::Col => cols.push(c),
                Kind::TSection("thead") if head.is_none() => head = Some(c),
                Kind::TSection("tfoot") if foot.is_none() => foot = Some(c),
                Kind::TSection(_) => bodies.push(Body::Part(c)),
                Kind::Drop | Kind::Control => {}
                _ => { if let Some(Body::Rows(r)) = bodies.last_mut() { r.push(c); } else { bodies.push(Body::Rows(vec![c])); } }
            }
        }
        self.out.push_str("<table"); let id = self.id_attr(n); self.out.push_str(&id); self.out.push('>');
        if let Some(c) = caption { self.out.push_str("<caption>"); self.children(&c, Ctx::Flow); self.out.push_str("</caption>"); }
        for c in cols {
            if c.has_name("col") { self.out.push_str("<colgroup>"); self.col(&c); self.out.push_str("</colgroup>"); }
            else { self.out.push_str("<colgroup"); if let Some(v) = c.attr("span") { if let Ok(v) = v.trim().parse::<u32>() { if v > 1 && !has_child(&c, "col") { self.out.push_str(&format!(" span=\"{}\"", v.min(1000))); } } } self.out.push('>'); self.children(&c, Ctx::Colgroup); self.out.push_str("</colgroup>"); }
        }
        if let Some(h) = head { self.out.push_str("<thead>"); self.children(&h, Ctx::Section); self.out.push_str("</thead>"); }
        for b in bodies {
            self.out.push_str("<tbody>");
            match b { Body::Part(p) => self.children(&p, Ctx::Section), Body::Rows(rows) => for r in rows { self.node(&r, Ctx::Section); } }
            self.out.push_str("</tbody>");
        }
        if let Some(f) = foot { self.out.push_str("<tfoot>"); self.children(&f, Ctx::Section); self.out.push_str("</tfoot>"); }
        self.out.push_str("</table>");
    }

    fn figure(&mut self, n: &NodeRef) {
        // a figure's caption stands first or last; any other is a paragraph of it
        let kids: Vec<NodeRef> = n.children().into_iter().filter(|c| c.is_element() || (c.is_text() && !c.text().trim().is_empty())).collect();
        let caps: Vec<usize> = kids.iter().enumerate().filter(|(_, c)| c.is_element() && c.has_name("figcaption")).map(|(i, _)| i).collect();
        let keep = caps.iter().copied().find(|&i| i == 0 || i + 1 == kids.len());
        self.out.push_str("<figure"); let id = self.id_attr(n); self.out.push_str(&id); self.out.push('>');
        for (i, c) in kids.iter().enumerate() {
            if c.is_element() && c.has_name("figcaption") {
                let tag = if Some(i) == keep { "figcaption" } else { "div" };
                self.block(c, tag, Ctx::Flow);
            } else { self.node(c, Ctx::Flow); }
        }
        self.out.push_str("</figure>");
    }
}

fn has_child(n: &NodeRef, name: &str) -> bool { n.children().iter().any(|c| c.is_element() && c.has_name(name)) }

/// Did the output end with a block's tag (a space after it means nothing)?
fn last_tag_block(out: &str) -> bool {
    let Some(p) = out.rfind('<') else { return false };
    let tag = out[p..].trim_start_matches(['<', '/']);
    let name: String = tag.chars().take_while(|c| c.is_ascii_alphanumeric()).collect();
    matches!(name.as_str(), "p" | "div" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "ul" | "ol" | "li" | "dl" | "dt" | "dd" | "table" | "thead" | "tbody" | "tfoot" | "tr" | "td" | "th" | "caption" | "blockquote" | "figure" | "figcaption" | "pre" | "hr" | "colgroup" | "col")
}

fn pct_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(h), Some(l)) = ((b[i + 1] as char).to_digit(16), (b[i + 2] as char).to_digit(16)) { out.push((h * 16 + l) as u8); i += 3; continue; }
        }
        out.push(b[i]); i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| s.to_string())
}
/// An attribute value as it was before esc_attr.
fn unesc(s: &str) -> String { s.replace("&quot;", "\"").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&") }

/// The text of written XHTML: a line for every block (a paragraph, an item, a cell, a heading, a line break), the
/// spaces of a line collapsed — what is read aloud and counted.
pub fn plain(x: &str) -> String {
    const BREAKS: [&str; 26] = ["p", "div", "li", "dt", "dd", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "td", "th", "caption", "pre", "blockquote", "figure", "figcaption", "table", "ul", "ol", "dl", "hr", "br", "section"];
    let mut raw = String::with_capacity(x.len());
    let mut rest = x;
    while let Some(p) = rest.find(['<', '&']) {
        raw.push_str(&rest[..p]);
        rest = &rest[p..];
        if rest.starts_with('<') {
            let end = rest.find('>').map(|e| e + 1).unwrap_or(rest.len());
            let name: String = rest[1..end].trim_start_matches('/').chars().take_while(|c| c.is_ascii_alphanumeric()).collect();
            if BREAKS.contains(&name.to_ascii_lowercase().as_str()) { raw.push('\n'); }
            rest = &rest[end..];
        } else {
            let (c, n) = [("&amp;", '&'), ("&lt;", '<'), ("&gt;", '>'), ("&quot;", '"')].iter().find(|(e, _)| rest.starts_with(e)).map(|(e, c)| (*c, e.len())).unwrap_or(('&', 1));
            raw.push(c);
            rest = &rest[n..];
        }
    }
    raw.push_str(rest);
    raw.lines().map(|l| l.split_whitespace().collect::<Vec<_>>().join(" ")).filter(|l| !l.is_empty()).collect::<Vec<_>>().join("\n")
}
