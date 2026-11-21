//! SuperUtils spreadsheet engine, compiled by us to wasm32 (no JS glue: plain exported functions + JSON).
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
        // a duration ([h]:mm:ss): the hours go on past 24 (30 hours is 30:00:00, not 06:00:00 of the next day)
        Data::DateTime(dt) if dt.is_duration() => {
            let secs = (dt.as_f64() * 86400.0).round() as i64;
            let a = secs.unsigned_abs();
            Value::String(format!("{}{}:{:02}:{:02}", if secs < 0 { "-" } else { "" }, a / 3600, (a / 60) % 60, a % 60))
        }
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
        // Excel's own texts (#DIV/0!, #N/A, #NAME? …; calamine says "#DATA!" for #GETTING_DATA)
        Data::Error(calamine::CellErrorType::GettingData) => Value::String("#GETTING_DATA".into()),
        Data::Error(e) => Value::String(e.to_string()),
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

/// The delimiter (comma, semicolon, tab, pipe) under which the first 50 records — read as CSV, so quoted separators and
/// line breaks count as text — most often have the same number of fields (two or more); ties go to the earlier one.
fn sniff(text: &[u8]) -> u8 {
    let mut best = (b',', (0usize, 0usize));
    for d in [b',', b';', b'\t', b'|'] {
        let mut rdr = csv::ReaderBuilder::new().delimiter(d).has_headers(false).flexible(true).from_reader(text);
        let mut counts: std::collections::BTreeMap<usize, usize> = Default::default();
        for rec in rdr.byte_records().take(50) { match rec { Ok(r) => *counts.entry(r.len()).or_default() += 1, Err(_) => break } }
        let score = counts.iter().filter(|(f, _)| **f > 1).map(|(f, c)| (*c, *f)).max().unwrap_or((0, 0));
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

/// Text that becomes a number in the .xlsx: written as a double gives back exactly what was written — a whole number
/// up to 2^53 or a decimal a double holds (1.5, 0.1) — and is no code: no leading zeros (007, PIN codes), no plus
/// sign (+91 phone numbers), not 16 digits of a card or an ID (a double keeps 15 – 16).
fn as_number(s: &str) -> Option<f64> {
    let t = s.trim();
    if t.is_empty() || t.starts_with('+') { return None; }
    if int_text(t) { return t.parse::<i64>().ok().filter(|v| v.unsigned_abs() <= 1 << 53).map(|v| v as f64); }
    if real_text(t) { return t.parse::<f64>().ok(); }
    None
}

fn digits(t: &str) -> bool { !t.is_empty() && t.bytes().all(|b| b.is_ascii_digit()) }
/// Text that becomes an Excel date or time: 2026-11-20, 2026-11-20 10:30[:15[.5]] (or with T), 10:30[:15] — the forms
/// the reader writes and Excel turns into dates itself; (the number format to show it with).
fn as_datetime(s: &str) -> Option<(rust_xlsxwriter::ExcelDateTime, &'static str)> {
    let t = s.trim();
    let time_ok = |x: &str| { let p: Vec<&str> = x.split(':').collect(); (2..=3).contains(&p.len()) && p[0].len() == 2 && digits(p[0]) && p[1].len() == 2 && digits(p[1]) && p.get(2).map_or(true, |s| { let w = s.split('.').next().unwrap_or(""); w.len() == 2 && digits(w) && s.split('.').nth(1).map_or(true, digits) }) && p[0].parse::<u32>().unwrap_or(99) < 24 && p[1].parse::<u32>().unwrap_or(99) < 60 && p.get(2).map_or(true, |s| s[..2].parse::<u32>().unwrap_or(99) < 60) };
    let date_ok = |x: &str| x.len() == 10 && digits(&x[0..4]) && &x[4..5] == "-" && digits(&x[5..7]) && &x[7..8] == "-" && digits(&x[8..10]);
    let fmt = if t.len() == 10 && date_ok(t) { "yyyy-mm-dd" }
        else if t.len() > 11 && date_ok(&t[..10]) && matches!(&t[10..11], " " | "T") && time_ok(&t[11..]) { "yyyy-mm-dd hh:mm:ss" }
        else if time_ok(t) { "hh:mm:ss" } else { return None };
    rust_xlsxwriter::ExcelDateTime::parse_from_str(t).ok().map(|d| (d, fmt))
}

/// A1 notation of a cell (0-based row and column).
fn a1(r: usize, c: usize) -> String { let (mut s, mut i) = (String::new(), c + 1); while i > 0 { s.insert(0, (b'A' + ((i - 1) % 26) as u8) as char); i = (i - 1) / 26; } format!("{s}{}", r + 1) }

/// Excel's sheet names: at most 31 characters, none of [ ] : * ? / \, no apostrophe at either end, not "History", and
/// different from each other without regard to case.
fn sheet_names(names: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for (i, n) in names.iter().enumerate() {
        let clean: String = n.chars().filter(|c| !"[]:*?/\\".contains(*c) && !c.is_control()).collect();
        let mut base: String = clean.trim().trim_matches('\'').chars().take(31).collect();
        if base.is_empty() || base.eq_ignore_ascii_case("history") { base = format!("Sheet{}", i + 1); }
        let (mut name, mut k) = (base.clone(), 1);
        while out.iter().any(|o| o.to_lowercase() == name.to_lowercase()) {
            k += 1; let tail = format!(" ({k})");
            name = format!("{}{tail}", base.chars().take(31 - tail.chars().count()).collect::<String>());
        }
        out.push(name);
    }
    out
}

/// JSON { sheets, numbers, header } → .xlsx bytes. numbers: numbers and dates written as text become numbers and dates
/// (see as_number, as_datetime); header: bold, frozen first row with a filter.
#[no_mangle] pub extern "C" fn xlsx_write(p: *const u8, n: usize) -> i32 {
    let book: BookIn = match serde_json::from_slice(input(p, n)) { Ok(b) => b, Err(e) => return err(format!("bad input: {e}")) };
    let mut wb = rust_xlsxwriter::Workbook::new();
    // fixed creation time: no clock is asked
    let props = rust_xlsxwriter::DocProperties::new().set_creation_datetime(&rust_xlsxwriter::ExcelDateTime::from_ymd(2000, 1, 1).unwrap());
    wb.set_properties(&props);
    let bold = rust_xlsxwriter::Format::new().set_bold();
    let names = sheet_names(&book.sheets.iter().map(|s| s.name.clone()).collect::<Vec<_>>());
    for (si, s) in book.sheets.iter().enumerate() {
        let shown = &names[si];
        if s.rows.len() > 1_048_576 { return err(format!("“{shown}” has {} rows; an Excel sheet holds at most 1,048,576. Save it as CSV instead.", s.rows.len())); }
        if let Some(w) = s.rows.iter().map(|r| r.len()).max().filter(|w| *w > 16_384) { return err(format!("“{shown}” has {w} columns; an Excel sheet holds at most 16,384. Save it as CSV instead.")); }
        let ws = wb.add_worksheet();
        if let Err(e) = ws.set_name(shown) { return err(format!("sheet name “{shown}”: {e}")); }
        let mut widths: Vec<usize> = Vec::new();
        for (r, row) in s.rows.iter().enumerate() {
            for (c, v) in row.iter().enumerate() {
                let (r32, c16) = (r as u32, c as u16);
                let hdr = book.header && r == 0;
                if let Value::String(t) = v { let k = t.chars().count(); if k > 32_767 { return err(format!("Cell {} of “{shown}” holds {k} characters; an Excel cell holds at most 32,767. Save it as CSV instead.", a1(r, c))); } }
                let res = match v {
                    Value::Null => Ok(()),
                    Value::Bool(b) => ws.write_boolean(r32, c16, *b).map(|_| ()),
                    Value::Number(x) => ws.write_number(r32, c16, x.as_f64().unwrap_or(0.0)).map(|_| ()),
                    Value::String(t) if hdr => ws.write_string_with_format(r32, c16, t, &bold).map(|_| ()),
                    Value::String(t) if book.numbers => match (as_number(t), as_datetime(t)) {
                        (Some(f), _) => ws.write_number(r32, c16, f).map(|_| ()),
                        (None, Some((d, f))) => ws.write_datetime_with_format(r32, c16, &d, &rust_xlsxwriter::Format::new().set_num_format(f)).map(|_| ()),
                        _ => ws.write_string(r32, c16, t).map(|_| ()),
                    },
                    Value::String(t) => ws.write_string(r32, c16, t).map(|_| ()),
                    other => ws.write_string(r32, c16, other.to_string()).map(|_| ()),
                };
                if let Err(e) = res { return err(format!("Cell {} of “{shown}”: {e}", a1(r, c))); }
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
