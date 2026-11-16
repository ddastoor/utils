//! SVG optimiser for wasm32-wasip1: OXVG (Rust port of SVGO; MIT). One call: svgo(svg, flags) → optimised SVG.
//! flags bit 0 = "safe" preset (fewer, correctness-first jobs) instead of the default preset; bit 1 = pretty-print.
use oxvg_ast::{parse::roxmltree::parse, serialize::Node as _, visitor::Info, xmlwriter::{Indent, Options}};
use oxvg_optimiser::Jobs;
use std::cell::RefCell;

thread_local! { static OUT: RefCell<Vec<u8>> = RefCell::new(Vec::new()); }
#[no_mangle] pub extern "C" fn sv_alloc(n: usize) -> *mut u8 { let mut v = Vec::<u8>::with_capacity(n.max(1)); let p = v.as_mut_ptr(); std::mem::forget(v); p }
#[no_mangle] pub unsafe extern "C" fn sv_free(p: *mut u8, n: usize) { drop(Vec::from_raw_parts(p, 0, n.max(1))); }
#[no_mangle] pub extern "C" fn sv_out_ptr() -> *const u8 { OUT.with(|o| o.borrow().as_ptr()) }
#[no_mangle] pub extern "C" fn sv_out_len() -> usize { OUT.with(|o| o.borrow().len()) }

fn run(src: &str, flags: u32) -> Result<String, String> {
    let r = parse(src, |dom, allocator| -> Result<String, String> {
        let jobs = if flags & 1 != 0 { Jobs::safe() } else { Jobs::default() };
        jobs.run(dom, &Info::new(allocator)).map_err(|e| format!("{e}"))?;
        let mut o = Options::default();
        o.indent = if flags & 2 != 0 { Indent::Spaces(2) } else { Indent::None };
        dom.serialize_with_options(o).map_err(|e| format!("{e}"))
    }).map_err(|e| format!("Not a valid SVG/XML document: {e}"))?;
    r
}
#[no_mangle]
pub unsafe extern "C" fn sv_run(p: *const u8, n: usize, flags: u32) -> i32 {
    let src = std::str::from_utf8(std::slice::from_raw_parts(p, n)).unwrap_or("");
    let (code, out) = match std::panic::catch_unwind(|| run(src, flags)) { Ok(Ok(s)) => (0, s), Ok(Err(e)) => (-1, e), Err(_) => (-1, "The optimiser failed on this file".to_string()) };
    OUT.with(|o| *o.borrow_mut() = out.into_bytes());
    code
}
