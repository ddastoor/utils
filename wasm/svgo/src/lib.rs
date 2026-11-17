//! SVG optimiser for wasm32-wasip1: OXVG (Rust port of SVGO; MIT). One call: sv_run(svg, flags) → optimised SVG.
//! flags bit 0 = "safe": only jobs that cannot change the picture (our own short list — OXVG's own `Jobs::safe()`
//! still inlines styles, collapses groups, rewrites paths and gave the same output as the default preset);
//! bit 1 = pretty-print.
//! sv_diff compares two RGBA rasters (the page renders the original and the optimised file and asks whether they
//! look the same).
use oxvg_ast::{parse::roxmltree::{parse_with_options, ParsingOptions}, serialize::Node as _, visitor::Info, xmlwriter::{Indent, Options}};
use oxvg_optimiser::Jobs;
use std::cell::{Cell, RefCell};

/// OXVG's visitors recurse once per nesting level; deeper files than this would overflow the wasm stack (and a trap
/// leaves the instance unusable). Real drawings nest a few dozen levels at most.
const MAX_DEPTH: usize = 256;

thread_local! { static OUT: RefCell<Vec<u8>> = RefCell::new(Vec::new()); static BIG: Cell<f64> = Cell::new(0.0); }
#[no_mangle] pub extern "C" fn sv_alloc(n: usize) -> *mut u8 { let mut v = Vec::<u8>::with_capacity(n.max(1)); let p = v.as_mut_ptr(); std::mem::forget(v); p }
#[no_mangle] pub unsafe extern "C" fn sv_free(p: *mut u8, n: usize) { drop(Vec::from_raw_parts(p, 0, n.max(1))); }
#[no_mangle] pub extern "C" fn sv_out_ptr() -> *const u8 { OUT.with(|o| o.borrow().as_ptr()) }
#[no_mangle] pub extern "C" fn sv_out_len() -> usize { OUT.with(|o| o.borrow().len()) }

/// Deepest element nesting, found by scanning the tags (comments, CDATA, processing instructions, the DOCTYPE and
/// quoted attribute values are skipped). Good enough for a limit; the XML parser does the real checking.
fn depth(src: &str) -> usize {
    let b = src.as_bytes(); let (mut i, mut d, mut max) = (0usize, 0usize, 0usize);
    let skip_to = |from: usize, pat: &[u8]| -> usize { b[from.min(b.len())..].windows(pat.len()).position(|w| w == pat).map_or(b.len(), |p| from + p + pat.len()) };
    while i < b.len() {
        if b[i] != b'<' { i += 1; continue; }
        if b[i..].starts_with(b"<!--") { i = skip_to(i + 4, b"-->"); continue; }
        if b[i..].starts_with(b"<![CDATA[") { i = skip_to(i + 9, b"]]>"); continue; }
        if b[i..].starts_with(b"<?") { i = skip_to(i + 2, b"?>"); continue; }
        if b[i..].starts_with(b"<!") { // DOCTYPE, possibly with an internal subset in [ ]
            let mut sq = 0i32; i += 2;
            while i < b.len() { match b[i] { b'[' => sq += 1, b']' => sq -= 1, b'>' if sq <= 0 => break, _ => {} } i += 1; }
            i += 1; continue;
        }
        let closing = b.get(i + 1) == Some(&b'/'); let mut q = 0u8; let mut j = i + 1;
        while j < b.len() { let c = b[j]; if q != 0 { if c == q { q = 0; } } else if c == b'"' || c == b'\'' { q = c; } else if c == b'>' { break; } j += 1; }
        let selfclose = j > i && b.get(j.wrapping_sub(1)) == Some(&b'/');
        if closing { d = d.saturating_sub(1); } else if !selfclose { d += 1; max = max.max(d); } else { max = max.max(d + 1); }
        i = j + 1;
    }
    max
}
/// Jobs that leave every pixel alone: they drop what a renderer never reads and re-spell values.
fn careful() -> Jobs {
    let mut j = Jobs::none();
    j.remove_doctype = Some(Default::default());
    j.remove_x_m_l_proc_inst = Some(Default::default());
    j.remove_comments = Some(Default::default());
    j.remove_metadata = Some(Default::default());
    j.remove_editors_n_s_data = Some(Default::default());
    j.cleanup_attrs = Some(Default::default());
    j.remove_empty_attrs = Some(Default::default());
    j.remove_unused_n_s = Some(Default::default());
    j.convert_colors = Some(Default::default());
    j.sort_attrs = Some(Default::default());
    j
}
fn run(src: &str, flags: u32) -> Result<String, String> {
    let d = depth(src);
    if d > MAX_DEPTH { return Err(format!("This SVG nests elements {d} levels deep; the optimiser handles up to {MAX_DEPTH}")); }
    // DOCTYPE lines (Inkscape, Illustrator, old W3C templates) are read, including entities declared inside them
    let opts = ParsingOptions { allow_dtd: true, ..ParsingOptions::default() };
    let out = parse_with_options(src, opts, |dom, allocator| -> Result<String, String> {
        let jobs = if flags & 1 != 0 { careful() } else { Jobs::default() };
        jobs.run(dom, &Info::new(allocator)).map_err(|e| format!("{e}"))?;
        let mut o = Options::default();
        o.indent = if flags & 2 != 0 { Indent::Spaces(2) } else { Indent::None };
        dom.serialize_with_options(o).map_err(|e| format!("{e}"))
    }).map_err(|e| format!("Not a valid SVG/XML document: {e}"))??;
    if !out.contains("<svg") { return Err("This file is XML, but not an SVG (it has no <svg> element)".into()); }
    Ok(out)
}
#[no_mangle]
pub unsafe extern "C" fn sv_run(p: *const u8, n: usize, flags: u32) -> i32 {
    let src = std::str::from_utf8(std::slice::from_raw_parts(p, n)).unwrap_or("");
    let (code, out) = match std::panic::catch_unwind(|| run(src, flags)) { Ok(Ok(s)) => (0, s), Ok(Err(e)) => (-1, e), Err(_) => (-1, "The optimiser failed on this file".to_string()) };
    OUT.with(|o| *o.borrow_mut() = out.into_bytes());
    code
}
/// Do two RGBA rasters (w × h, 4 bytes per pixel) look alike? For each pixel the difference is the smallest
/// colour distance (largest channel difference, alpha ignored: the page paints both on an opaque background) to
/// the 3 × 3 neighbourhood in the other picture, taken both ways — so anti-aliasing and sub-pixel shifts along
/// edges count as nothing, while a missing shape or a changed colour counts in full.
/// Returns the mean of that difference (0–255); sv_diff_big() then gives the share of pixels where it is above 48.
#[no_mangle]
pub unsafe extern "C" fn sv_diff(a: *const u8, b: *const u8, w: usize, h: usize) -> f64 {
    let n = w * h;
    if n == 0 { BIG.with(|x| x.set(0.0)); return 0.0; }
    let (a, b) = (std::slice::from_raw_parts(a, n * 4), std::slice::from_raw_parts(b, n * 4));
    let dist = |p: &[u8], i: usize, q: &[u8], j: usize| -> u32 { (0..3).map(|c| (p[i * 4 + c] as i32 - q[j * 4 + c] as i32).unsigned_abs()).max().unwrap_or(0) };
    let near = |p: &[u8], q: &[u8], x: usize, y: usize| -> u32 {
        let i = y * w + x; let mut m = dist(p, i, q, i);
        if m == 0 { return 0; }
        for yy in y.saturating_sub(1)..=(y + 1).min(h - 1) { for xx in x.saturating_sub(1)..=(x + 1).min(w - 1) { m = m.min(dist(p, i, q, yy * w + xx)); } }
        m
    };
    let (mut sum, mut big) = (0u64, 0u64);
    for y in 0..h { for x in 0..w { let d = near(a, b, x, y).max(near(b, a, x, y)) as u64; sum += d; if d > 48 { big += 1; } } }
    BIG.with(|x| x.set(big as f64 / n as f64));
    sum as f64 / n as f64
}
#[no_mangle] pub extern "C" fn sv_diff_big() -> f64 { BIG.with(|x| x.get()) }
