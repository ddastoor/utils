//! SuperUtils developer-tool engine (wasm32-wasip1, no JS glue). One entry point:
//!   dc_call(op, input) → 0 and the result in dc_out, or −1 and an error message in dc_out.
//! Ops take JSON or raw bytes (see each function) and return JSON, text or bytes.
use serde_json::{json, Value};
use std::cell::RefCell;

#[cfg(feature = "bin")]
mod bin;
#[cfg(feature = "cidr")]
mod cidr;
#[cfg(feature = "enc")]
mod enc;
#[cfg(feature = "ids")]
mod ids;
#[cfg(feature = "ids")]
mod ids_tables;
#[cfg(feature = "j2t")]
mod j2t;
#[cfg(feature = "jsondiff")]
mod jsondiff;
#[cfg(any(feature = "json", feature = "jsondiff", feature = "j2t"))]
mod jsonfmt;
mod misc;
#[cfg(feature = "sqlfmt")]
mod sqlfmt;
#[cfg(feature = "semver")]
mod semver_npm;
#[cfg(feature = "semver")]
mod semver_re;
#[cfg(feature = "x509")]
mod x509;
#[cfg(feature = "xml")]
mod xmlfmt;

thread_local! { static OUT: RefCell<Vec<u8>> = RefCell::new(Vec::new()); }

#[no_mangle]
pub extern "C" fn dc_alloc(n: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(n.max(1));
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}
#[no_mangle]
pub unsafe extern "C" fn dc_free(p: *mut u8, n: usize) {
    drop(Vec::from_raw_parts(p, 0, n.max(1)));
}
#[no_mangle]
pub extern "C" fn dc_out_ptr() -> *const u8 { OUT.with(|o| o.borrow().as_ptr()) }
#[no_mangle]
pub extern "C" fn dc_out_len() -> usize { OUT.with(|o| o.borrow().len()) }

pub type R = Result<Vec<u8>, String>;
#[allow(dead_code)]
pub fn js(v: Value) -> R { Ok(serde_json::to_vec(&v).unwrap()) }
#[allow(dead_code)]
pub fn arg(input: &[u8]) -> Result<Value, String> { serde_json::from_slice(input).map_err(|e| format!("bad input: {e}")) }
#[allow(dead_code)]
pub fn s<'a>(v: &'a Value, k: &str) -> &'a str { v.get(k).and_then(|x| x.as_str()).unwrap_or("") }

#[no_mangle]
pub unsafe extern "C" fn dc_call(op: *const u8, op_n: usize, inp: *const u8, in_n: usize) -> i32 {
    let op = std::str::from_utf8(std::slice::from_raw_parts(op, op_n)).unwrap_or("");
    let input = if in_n == 0 { &[][..] } else { std::slice::from_raw_parts(inp, in_n) };
    let r: R = match op {
        #[cfg(feature = "cidr")]
        "cidr" => cidr::run(input),
        #[cfg(feature = "cron")]
        "cron" => misc::cron(input),
        #[cfg(feature = "semver")]
        "semver" => misc::semver(input),
        #[cfg(feature = "glob")]
        "glob" => misc::glob(input),
        #[cfg(feature = "patch")]
        "patch" => misc::patch(input),
        #[cfg(feature = "sqlfmt")]
        "sqlfmt" => sqlfmt::run(input),
        #[cfg(feature = "sqlfmt")]
        "sqlfmt:tokens" => sqlfmt::tokens(input),
        "hexdump" => misc::hexdump(input),
        "find" => misc::find(input),
        #[cfg(feature = "jsondiff")]
        "jsondiff" => jsondiff::run(input),
        #[cfg(feature = "jsondiff")]
        "jsonpatch" => misc::jsonpatch(input),
        #[cfg(feature = "x509")]
        "x509" => x509::run(input),
        #[cfg(feature = "ids")]
        "ids" => ids::run(input),
        #[cfg(feature = "ids")]
        "ids:info" => ids::info(),
        #[cfg(feature = "ids")]
        "ids:phone" => ids::phone_info(input),
        #[cfg(feature = "ids")]
        "ids:tel" => ids::tel(input),
        #[cfg(feature = "ids")]
        "ids:card" => ids::card_info(input),
        #[cfg(feature = "ids")]
        "ids:scan" => ids::scan(input),

        #[cfg(feature = "bin")]
        "bin:protobuf" => bin::protobuf(input, false),
        #[cfg(feature = "bin")]
        "bin:protobuf+sint" => bin::protobuf(input, true),
        #[cfg(feature = "bin")]
        "bin:msgpack" => bin::msgpack(input),
        #[cfg(feature = "bin")]
        "bin:cbor" => bin::cbor(input),
        #[cfg(feature = "json")]
        _ if op.starts_with("jsonfmt:") => jsonfmt::run(&op[8..], input),
        #[cfg(feature = "xml")]
        _ if op.starts_with("xmlfmt:") => xmlfmt::run(&op[7..], input),
        #[cfg(feature = "j2t")]
        _ if op.starts_with("j2t:") => j2t::run(&op[4..], input),
        #[cfg(feature = "enc")]
        _ if op.starts_with("enc:") => enc::encode(&op[4..], input),
        #[cfg(feature = "enc")]
        _ if op.starts_with("dec:") => enc::decode(&op[4..], input),
        _ => Err(format!("unknown op {op}")),
    };
    let (code, bytes) = match r { Ok(b) => (0, b), Err(e) => (-1, e.into_bytes()) };
    OUT.with(|o| *o.borrow_mut() = bytes);
    code
}

#[allow(dead_code)]
pub fn ok_json() -> Value { json!({}) }
