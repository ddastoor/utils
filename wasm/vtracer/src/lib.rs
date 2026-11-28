//! vtracer.wasm: visioncortex VTracer 0.6.5 — the colour tracer of the Image to SVG and Clipart Maker tabs — as plain exports. A picture's
//! RGBA pixels and the tracer's settings in; the SVG text out (`vt_out_ptr` / `vt_out_len`). No JS glue: wasm32-wasip1, WASI's
//! random_get only (VTracer picks a key colour at random for see-through pictures).
use visioncortex::{ColorImage, PathSimplifyMode};
use vtracer::{convert, ColorMode, Config, Hierarchical};

static mut OUT: Vec<u8> = Vec::new();

#[no_mangle]
pub extern "C" fn vt_alloc(n: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(n.max(1));
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}
#[no_mangle]
pub unsafe extern "C" fn vt_free(p: *mut u8, n: usize) {
    drop(Vec::from_raw_parts(p, 0, n.max(1)));
}
#[no_mangle]
pub unsafe extern "C" fn vt_out_ptr() -> *const u8 { (*std::ptr::addr_of!(OUT)).as_ptr() }
#[no_mangle]
pub unsafe extern "C" fn vt_out_len() -> usize { (*std::ptr::addr_of!(OUT)).len() }

/// Traces `w` × `h` RGBA pixels. `color` 1 colour, 0 black and white; `cutout` 1 shapes cut out of each other, 0 stacked; `mode`
/// 0 pixels, 1 polygons, 2 splines; the rest as VTracer's command line names them (corner and splice thresholds in degrees;
/// `precision` < 0: none). Returns 0 and the SVG in the output buffer, or 1 and a message there.
#[no_mangle]
pub unsafe extern "C" fn vt_trace(
    rgba: *const u8, w: u32, h: u32, color: u32, cutout: u32, mode: u32, filter_speckle: u32, color_precision: i32,
    layer_difference: i32, corner_threshold: i32, length_threshold: f64, max_iterations: u32, splice_threshold: i32, precision: i32,
) -> i32 {
    let n = (w as usize) * (h as usize) * 4;
    let pixels = std::slice::from_raw_parts(rgba, n).to_vec();
    let img = ColorImage { pixels, width: w as usize, height: h as usize };
    let config = Config {
        color_mode: if color == 1 { ColorMode::Color } else { ColorMode::Binary },
        hierarchical: if cutout == 1 { Hierarchical::Cutout } else { Hierarchical::Stacked },
        filter_speckle: filter_speckle as usize,
        color_precision,
        layer_difference,
        mode: match mode { 0 => PathSimplifyMode::None, 1 => PathSimplifyMode::Polygon, _ => PathSimplifyMode::Spline },
        corner_threshold,
        length_threshold,
        max_iterations: max_iterations as usize,
        splice_threshold,
        path_precision: if precision < 0 { None } else { Some(precision as u32) },
    };
    let out = &mut *std::ptr::addr_of_mut!(OUT);
    out.clear();
    match convert(img, config) {
        Ok(svg) => { out.extend_from_slice(svg.to_string().as_bytes()); 0 }
        Err(e) => { out.extend_from_slice(e.as_bytes()); 1 }
    }
}
