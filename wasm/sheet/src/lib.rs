//! SuperTools spreadsheet engine, compiled by us to wasm32 (no JS glue: plain exported functions + JSON).
//! Read: calamine (xlsx, xlsm, xlsb, xls, ods) and RFC 4180 CSV (delimiter detected). Write: xlsx (rust_xlsxwriter), CSV.
use calamine::{open_workbook_auto_from_rs, Data, Reader};
use chrono::{Datelike, Timelike};
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::Cursor;

static mut OUT: Vec<u8> = Vec::new();
fn set_out(v: Vec<u8>) -> i32 { let n = v.len() as i32; unsafe { OUT = v; } n }

#[no_mangle] pub extern "C" fn sheet_alloc(n: usize) -> *mut u8 { let mut v = Vec::<u8>::with_capacity(n.max(1)); let p = v.as_mut_ptr(); std::mem::forget(v); p }
#[no_mangle] pub unsafe extern "C" fn sheet_free(p: *mut u8, n: usize) { drop(Vec::from_raw_parts(p, 0, n.max(1))); }
#[no_mangle] pub extern "C" fn sheet_out_ptr() -> *const u8 { unsafe { (*std::ptr::addr_of!(OUT)).as_ptr() } }
#[no_mangle] pub extern "C" fn sheet_out_len() -> usize { unsafe { (*std::ptr::addr_of!(OUT)).len() } }
fn input<'a>(p: *const u8, n: usize) -> &'a [u8] { unsafe { std::slice::from_raw_parts(p, n) } }
fn err(msg: String) -> i32 { set_out(json!({ "error": msg }).to_string().into_bytes()); -1 }

fn cell(d: &Data) -> Value {
    match d {
        Data::Empty => Value::Null,
        Data::String(s) => Value::String(s.clone()),
        Data::Float(f) => if f.is_finite() { json!(f) } else { Value::String(f.to_string()) },
        Data::Int(i) => json!(i),
        Data::Bool(b) => json!(b),
        Data::DateTime(dt) => match dt.as_datetime() {
            Some(t) => {
                let d = format!("{:04}-{:02}-{:02}", t.year(), t.month(), t.day());
                let tm = format!("{:02}:{:02}:{:02}", t.hour(), t.minute(), t.second());
                // a time without a date is stored as day 0 (1899-12-30/31): show only the time
                Value::String(if t.year() == 1899 { tm } else if tm == "00:00:00" { d } else { format!("{d} {tm}") })
            }
            None => json!(dt.as_f64()),
        },
        Data::DateTimeIso(s) => Value::String(s.replacen('T', " ", 1).trim_end_matches(" 00:00:00").to_string()),
        Data::DurationIso(s) => Value::String(iso_duration(s)),
        Data::Error(e) => Value::String(format!("#{:?}", e).to_uppercase()),
    }
}

/// ODS duration "PT10H10M10.1S" → "10:10:10" (hours may exceed 24, like Excel's [h]:mm:ss).
fn iso_duration(s: &str) -> String {
    let t = s.trim_start_matches('-').trim_start_matches('P').trim_start_matches('T');
    let (mut h, mut m, mut sec, mut num) = (0f64, 0f64, 0f64, String::new());
    for ch in t.chars() {
        match ch { 'H' => { h = num.parse().unwrap_or(0.0); num.clear(); } 'M' => { m = num.parse().unwrap_or(0.0); num.clear(); } 'S' => { sec = num.parse().unwrap_or(0.0); num.clear(); } 'T' => {} c => num.push(c) }
    }
    format!("{}{:02}:{:02}:{:02}", if s.starts_with('-') { "-" } else { "" }, h as u64, m as u64, sec.round() as u64)
}

/// Is this text a whole number as a database would print it back: no plus sign, no leading zeros, within 64 bits?
fn int_text(t: &str) -> bool {
    let d = t.strip_prefix('-').unwrap_or(t);
    !d.is_empty() && d.bytes().all(|b| b.is_ascii_digit()) && (d == "0" && !t.starts_with('-') || !d.starts_with('0')) && t.parse::<i64>().is_ok()
}

/// (negative, significant digits without leading / trailing zeros, power of ten of the last digit) of a decimal
/// number such as "-12.50", ".5", "1e-3", "3.0000000000000004e-1"; None if it is not one. Leading zeros are refused
/// ("007", "00.5" are codes, not numbers) unless the whole part is a single 0.
fn decimal(t: &str) -> Option<(bool, String, i64)> {
    let (neg, rest) = match t.strip_prefix('-') { Some(r) => (true, r), None => (false, t) };
    let (mant, exp) = match rest.find(['e', 'E']) {
        Some(i) => { let e = &rest[i + 1..]; let e2 = e.strip_prefix('+').unwrap_or(e); if e2.is_empty() || e2.len() > 6 || !e2.strip_prefix('-').unwrap_or(e2).bytes().all(|b| b.is_ascii_digit()) || e2 == "-" { return None; } (&rest[..i], e2.parse::<i64>().ok()?) }
        None => (rest, 0),
    };
    let (whole, frac) = match mant.find('.') { Some(i) => (&mant[..i], &mant[i + 1..]), None => (mant, "") };
    if whole.is_empty() && frac.is_empty() || !whole.bytes().chain(frac.bytes()).all(|b| b.is_ascii_digit()) || mant.matches('.').count() > 1 { return None; }
    if whole.len() > 1 && whole.starts_with('0') { return None; }
    let all = format!("{whole}{frac}");
    let digits = all.trim_start_matches('0').trim_end_matches('0').to_string();
    let trailing = (all.len() - all.trim_end_matches('0').len()) as i64;
    Some(if digits.is_empty() { (neg, digits, 0) } else { (neg, digits, exp - frac.len() as i64 + trailing) })
}

/// Is this text a number that a double holds exactly as written (so that nothing is lost by storing it as REAL)?
fn real_text(t: &str) -> bool {
    let Some(want) = decimal(t) else { return false };
    match t.parse::<f64>() { Ok(f) if f.is_finite() => decimal(&format!("{f:e}")) == Some(want), _ => false }
}

/// What each column can be stored as in a database without losing anything, looking at every row but the first
/// (the header): "INTEGER" — whole numbers within 64 bits, written without a plus sign or leading zeros; "REAL" —
/// numbers a double holds exactly as written; otherwise "TEXT" (PIN codes, phone numbers with +, IDs of 20 digits,
/// 1e999, dates, words). Empty cells do not count; a column of nothing but empty cells is TEXT. White space around
/// a value is ignored for the decision.
fn col_types(rows: &[Value]) -> Vec<&'static str> {
    let width = rows.iter().map(|r| r.as_array().map_or(0, |a| a.len())).max().unwrap_or(0);
    let (mut int, mut real, mut any) = (vec![true; width], vec![true; width], vec![false; width]);
    for row in rows.iter().skip(1) {
        for (c, v) in row.as_array().map(|a| a.as_slice()).unwrap_or(&[]).iter().enumerate() {
            match v {
                Value::Null => continue,
                Value::String(s) => { let t = s.trim(); if t.is_empty() { continue; } if !int_text(t) { int[c] = false; if !real_text(t) { real[c] = false; } } }
                Value::Bool(_) => {}
                Value::Number(n) => if !(n.is_i64() || n.as_f64().is_some_and(|f| f.fract() == 0.0 && f.abs() <= 9007199254740992.0)) { int[c] = false; },
                _ => { int[c] = false; real[c] = false; }
            }
            any[c] = true;
        }
    }
    (0..width).map(|c| if !any[c] { "TEXT" } else if int[c] { "INTEGER" } else if real[c] { "REAL" } else { "TEXT" }).collect()
}

/// Spreadsheet file → JSON { sheets: [{ name, rows: [[cell…]…], types }] }. Returns output length, or −1 (error JSON).
#[no_mangle] pub extern "C" fn sheet_read(p: *const u8, n: usize) -> i32 {
    let data = input(p, n).to_vec();
    if data.is_empty() { return err("The file is empty.".into()); }
    let cfb = data.starts_with(&[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    let mut wb = match open_workbook_auto_from_rs(Cursor::new(data)) {
        Ok(w) => w,
        // an encrypted .xlsx is an OLE container that is not an .xls workbook
        Err(_) if cfb => return err("This workbook is password-protected (encrypted). Open it in Excel or LibreOffice and save a copy without a password.".into()),
        Err(e) => return err(format!("Cannot read this spreadsheet: {e}")),
    };
    let hidden: Vec<String> = wb.sheets_metadata().iter().filter(|m| m.visible != calamine::SheetVisible::Visible).map(|m| m.name.clone()).collect();
    let mut sheets = Vec::new();
    for name in wb.sheet_names() {
        match wb.worksheet_range(&name) {
            Ok(r) => {
                let (r0, c0) = r.start().unwrap_or((0, 0));
                let mut rows: Vec<Value> = (0..r0).map(|_| json!([])).collect(); // keep the sheet's own row numbers
                for row in r.rows() {
                    let mut cells: Vec<Value> = (0..c0).map(|_| Value::Null).collect();
                    cells.extend(row.iter().map(cell));
                    while matches!(cells.last(), Some(Value::Null)) { cells.pop(); }
                    rows.push(Value::Array(cells));
                }
                let types = col_types(&rows);
                sheets.push(json!({ "name": name, "rows": rows, "types": types, "hidden": hidden.contains(&name) }));
            }
            Err(e) => sheets.push(json!({ "name": name, "rows": [], "error": e.to_string() })),
        }
    }
    set_out(json!({ "sheets": sheets }).to_string().into_bytes())
}

/// The delimiter that gives the most consistent column count over the first lines (comma, semicolon, tab, pipe).
fn sniff(text: &[u8]) -> u8 {
    let head: Vec<&[u8]> = text.split(|b| *b == b'\n').take(50).collect();
    let mut best = (b',', 0usize);
    for d in [b',', b';', b'\t', b'|'] {
        let counts: Vec<usize> = head.iter().filter(|l| !l.is_empty()).map(|l| l.iter().filter(|b| **b == d).count()).collect();
        if counts.is_empty() || counts[0] == 0 { continue; }
        let same = counts.iter().filter(|c| **c == counts[0]).count();
        let score = same * 1000 + counts[0];
        if score > best.1 { best = (d, score); }
    }
    best.0
}

/// CSV text → JSON { sheets: [{ name: "CSV", rows, types }], delimiter }. delim 0 = detect.
#[no_mangle] pub extern "C" fn csv_read(p: *const u8, n: usize, delim: u8) -> i32 {
    let mut text = input(p, n);
    if text.starts_with(&[0xef, 0xbb, 0xbf]) { text = &text[3..]; } // UTF-8 BOM
    let d = if delim == 0 { sniff(text) } else { delim };
    let mut rdr = csv::ReaderBuilder::new().delimiter(d).has_headers(false).flexible(true).from_reader(text);
    let mut rows = Vec::new();
    for rec in rdr.byte_records() {
        match rec {
            Ok(r) => rows.push(Value::Array(r.iter().map(|f| Value::String(String::from_utf8_lossy(f).into_owned())).collect())),
            Err(e) => return err(format!("CSV error: {e}")),
        }
    }
    let types = col_types(&rows);
    set_out(json!({ "sheets": [{ "name": "CSV", "rows": rows, "types": types }], "delimiter": (d as char).to_string() }).to_string().into_bytes())
}

#[derive(Deserialize)] struct SheetIn { name: String, rows: Vec<Vec<Value>> }
#[derive(Deserialize)] struct BookIn { sheets: Vec<SheetIn>, #[serde(default)] numbers: bool, #[serde(default)] header: bool }

fn as_number(s: &str) -> Option<f64> {
    let t = s.trim();
    if t.is_empty() || t.len() > 30 || (t.len() > 1 && t.starts_with('0') && !t.starts_with("0.")) { return None; } // keep 007, PINs, phone numbers as text
    t.parse::<f64>().ok().filter(|f| f.is_finite())
}

/// JSON { sheets, numbers, header } → .xlsx bytes. numbers: numeric-looking text becomes numbers; header: bold, frozen first row with a filter.
#[no_mangle] pub extern "C" fn xlsx_write(p: *const u8, n: usize) -> i32 {
    let book: BookIn = match serde_json::from_slice(input(p, n)) { Ok(b) => b, Err(e) => return err(format!("bad input: {e}")) };
    let mut wb = rust_xlsxwriter::Workbook::new();
    // fixed creation time: wasm32-unknown-unknown has no clock
    let props = rust_xlsxwriter::DocProperties::new().set_creation_datetime(&rust_xlsxwriter::ExcelDateTime::from_ymd(2000, 1, 1).unwrap());
    wb.set_properties(&props);
    let bold = rust_xlsxwriter::Format::new().set_bold();
    for (si, s) in book.sheets.iter().enumerate() {
        let ws = wb.add_worksheet();
        let name: String = s.name.chars().filter(|c| !"[]:*?/\\".contains(*c)).take(31).collect();
        let _ = ws.set_name(if name.is_empty() { format!("Sheet{}", si + 1) } else { name });
        let mut widths: Vec<usize> = Vec::new();
        for (r, row) in s.rows.iter().enumerate() {
            for (c, v) in row.iter().enumerate() {
                let (r, c16) = (r as u32, c as u16);
                let hdr = book.header && r == 0;
                let res = match v {
                    Value::Null => Ok(()),
                    Value::Bool(b) => ws.write_boolean(r, c16, *b).map(|_| ()),
                    Value::Number(x) => ws.write_number(r, c16, x.as_f64().unwrap_or(0.0)).map(|_| ()),
                    Value::String(t) => match (book.numbers && !hdr).then(|| as_number(t)).flatten() {
                        Some(f) => ws.write_number(r, c16, f).map(|_| ()),
                        None => if hdr { ws.write_string_with_format(r, c16, t, &bold).map(|_| ()) } else { ws.write_string(r, c16, t).map(|_| ()) },
                    },
                    other => ws.write_string(r, c16, other.to_string()).map(|_| ()),
                };
                if let Err(e) = res { return err(format!("cell {r},{c}: {e}")); }
                let w = match v { Value::String(t) => t.chars().count(), Value::Null => 0, o => o.to_string().len() };
                if widths.len() <= c { widths.resize(c + 1, 0); }
                widths[c] = widths[c].max(w);
            }
        }
        for (c, w) in widths.iter().enumerate() { let _ = ws.set_column_width(c as u16, ((*w).clamp(6, 60) as f64) + 2.0); }
        if book.header && !s.rows.is_empty() {
            let _ = ws.set_freeze_panes(1, 0);
            let last = s.rows.iter().map(|r| r.len()).max().unwrap_or(1).max(1) as u16 - 1;
            let _ = ws.autofilter(0, 0, (s.rows.len().max(1) - 1) as u32, last);
        }
    }
    match wb.save_to_buffer() { Ok(b) => set_out(b), Err(e) => err(format!("xlsx: {e}")) }
}

/// JSON { rows, delimiter } → CSV text (RFC 4180 quoting).
#[no_mangle] pub extern "C" fn csv_write(p: *const u8, n: usize, delim: u8) -> i32 {
    let rows: Vec<Vec<Value>> = match serde_json::from_slice(input(p, n)) { Ok(r) => r, Err(e) => return err(format!("bad input: {e}")) };
    let mut w = csv::WriterBuilder::new().delimiter(if delim == 0 { b',' } else { delim }).flexible(true).from_writer(Vec::new());
    for row in rows {
        let fields: Vec<String> = row.iter().map(|v| match v { Value::Null => String::new(), Value::String(s) => s.clone(), o => o.to_string() }).collect();
        if let Err(e) = w.write_record(&fields) { return err(e.to_string()); }
    }
    match w.into_inner() { Ok(b) => set_out(b), Err(e) => err(e.to_string()) }
}
