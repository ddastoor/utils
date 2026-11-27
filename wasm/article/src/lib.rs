//! SuperUtils article engine (wasm32-wasip1) for the Articles → Kindle tab: Mozilla Readability's algorithm — the
//! engine of Firefox's Reader View — through its Rust port dom_smoothie (MIT) finds the article in a saved web page;
//! our code beside it writes the article as XHTML for an EPUB (xhtml.rs) and reads the files pages are saved as
//! (Chrome's MHTML: mhtml.rs; Safari's web archive: webarchive.rs).
//!
//!   ar_read(html, len, url, ulen, flags) → 0 found / 1 no article / 2 not read; JSON in ar_out_ptr() / ar_out_len():
//!     { title, byline, excerpt, siteName, published, modified, lang, dir, image, url, readable, xhtml, text, words,
//!       images: [{ alt, urls: [[address, size], …] }], dropped: { videos, embeds, svg, forms } }  (or { error })
//!     flags: 1 = the whole page — nothing left out by Readability (a pasted selection: what was chosen is the article);
//!            2 = strict visibility (dom_smoothie's: text hidden by inline styles or screen-reader classes left out)
//!   ar_mhtml(bytes, len) / ar_webarchive(bytes, len) → 0 / 2; JSON { url, subject, parts: [{ type, charset, url, cid,
//!     at, len }] } and the parts' bytes in ar_blob_ptr() / ar_blob_len() (ar_blob_free() lets them go)
use dom_smoothie::{Config, Readability};
use serde_json::json;
use std::cell::RefCell;

mod mhtml;
mod webarchive;
mod xhtml;

thread_local! {
    static OUT: RefCell<Vec<u8>> = RefCell::new(Vec::new());
    static BLOB: RefCell<Vec<u8>> = RefCell::new(Vec::new());
}
#[no_mangle] pub extern "C" fn ar_alloc(n: usize) -> *mut u8 { let mut v = Vec::<u8>::with_capacity(n.max(1)); let p = v.as_mut_ptr(); std::mem::forget(v); p }
#[no_mangle] pub unsafe extern "C" fn ar_free(p: *mut u8, n: usize) { drop(Vec::from_raw_parts(p, 0, n.max(1))); }
#[no_mangle] pub extern "C" fn ar_out_ptr() -> *const u8 { OUT.with(|o| o.borrow().as_ptr()) }
#[no_mangle] pub extern "C" fn ar_out_len() -> usize { OUT.with(|o| o.borrow().len()) }
#[no_mangle] pub extern "C" fn ar_blob_ptr() -> *const u8 { BLOB.with(|o| o.borrow().as_ptr()) }
#[no_mangle] pub extern "C" fn ar_blob_len() -> usize { BLOB.with(|o| o.borrow().len()) }
#[no_mangle] pub extern "C" fn ar_blob_free() { BLOB.with(|o| *o.borrow_mut() = Vec::new()); }

fn set_out(v: serde_json::Value) { OUT.with(|o| *o.borrow_mut() = v.to_string().into_bytes()); }
unsafe fn bytes<'a>(p: *const u8, n: usize) -> &'a [u8] { if n == 0 { &[] } else { std::slice::from_raw_parts(p, n) } }

/// Words as a word limit counts them: what stands between spaces and holds a letter or a digit.
fn words(t: &str) -> usize { t.split_whitespace().filter(|w| w.chars().any(char::is_alphanumeric)).count() }

fn read(html: &str, url: &str, flags: u32) -> (i32, serde_json::Value) {
    let cfg = Config { strict_visibility: flags & 2 != 0, ..Config::default() };
    // an address that is not absolute (a file's) is no address for the page
    let r = match Readability::new(html, if url.is_empty() { None } else { Some(url) }, Some(cfg.clone())) {
        Ok(r) => r,
        Err(_) => match Readability::new(html, None, Some(cfg)) { Ok(r) => r, Err(e) => return (2, json!({ "error": e.to_string() })) },
    };
    let page = r.doc_url.clone().unwrap_or_default();
    // the page's own date where its metadata gives none (Chrome's MHTML leaves the page's scripts out, and JSON-LD with
    // them): the <time> of the article's heading, read before the extraction takes the byline line away
    let time = ["article time[datetime]", "[itemprop=datePublished][datetime]", "time[datetime]"].iter()
        .find_map(|sel| r.doc.select_single(sel).nodes().first().and_then(|n| n.attr("datetime")).map(|d| d.trim().to_string()).filter(|d| !d.is_empty()))
        .or_else(|| r.doc.select_single("meta[itemprop=datePublished][content]").nodes().first().and_then(|n| n.attr("content")).map(|d| d.trim().to_string()));
    let (meta, written, text, readable) = if flags & 1 != 0 {
        // the whole page as it is: its metadata as Readability reads it
        let mut meta = r.get_article_metadata(r.parse_json_ld());
        if meta.title.trim().is_empty() { meta.title = r.get_article_title().to_string(); }
        let root = r.doc.body().unwrap_or_else(|| r.doc.root());
        let w = xhtml::Writer::new(&page, &meta.title).write(&root);
        let text = xhtml::plain(&w.xhtml);
        (meta, w, text, true)
    } else {
        let readable = r.is_probably_readable();
        let ex = match r.extract() { Ok(e) => e, Err(e) => return (1, json!({ "error": e.to_string() })) };
        let root = ex.root();
        let w = xhtml::Writer::new(&page, &ex.metadata.title).write(&root);
        let text = xhtml::plain(&w.xhtml);
        (ex.metadata.clone(), w, text, readable)
    };
    let images: Vec<_> = written.images.iter().map(|i| json!({ "alt": i.alt, "urls": i.urls.iter().map(|(u, s)| json!([u, s])).collect::<Vec<_>>() })).collect();
    (0, json!({
        "title": meta.title.trim(), "byline": meta.byline, "excerpt": meta.excerpt, "siteName": meta.site_name,
        "published": meta.published_time.clone().or(time), "modified": meta.modified_time, "lang": meta.lang, "dir": meta.dir,
        "image": meta.image, "url": meta.url, "readable": readable,
        "xhtml": written.xhtml, "words": words(&text), "text": text, "images": images,
        "dropped": { "videos": written.dropped.videos, "embeds": written.dropped.embeds, "svg": written.dropped.svg, "forms": written.dropped.forms },
    }))
}

/// # Safety
/// `p` / `pu` point to `n` / `nu` bytes of the module's memory (UTF-8).
#[no_mangle]
pub unsafe extern "C" fn ar_read(p: *const u8, n: usize, pu: *const u8, nu: usize, flags: u32) -> i32 {
    let html = String::from_utf8_lossy(bytes(p, n));
    let url = String::from_utf8_lossy(bytes(pu, nu));
    let (code, v) = read(&html, url.trim(), flags);
    set_out(v);
    code
}

fn parts_json(url: &str, subject: &str, parts: &[mhtml::Part]) -> serde_json::Value {
    json!({ "url": url, "subject": subject, "parts": parts.iter().map(|p| json!({ "type": p.ctype, "charset": p.charset, "url": p.location, "cid": p.cid, "at": p.at, "len": p.len })).collect::<Vec<_>>() })
}

/// # Safety
/// `p` points to `n` bytes of the module's memory.
#[no_mangle]
pub unsafe extern "C" fn ar_mhtml(p: *const u8, n: usize) -> i32 {
    let mut blob = Vec::new();
    let r = mhtml::read(bytes(p, n), &mut blob);
    match r {
        Ok(m) => { set_out(parts_json(&m.url, &m.subject, &m.parts)); BLOB.with(|b| *b.borrow_mut() = blob); 0 }
        Err(e) => { set_out(json!({ "error": e })); 2 }
    }
}

/// # Safety
/// `p` points to `n` bytes of the module's memory.
#[no_mangle]
pub unsafe extern "C" fn ar_webarchive(p: *const u8, n: usize) -> i32 {
    let mut blob = Vec::new();
    match webarchive::read(bytes(p, n), &mut blob) {
        Ok((url, parts)) => { set_out(parts_json(&url, "", &parts)); BLOB.with(|b| *b.borrow_mut() = blob); 0 }
        Err(e) => { set_out(json!({ "error": e })); 2 }
    }
}
