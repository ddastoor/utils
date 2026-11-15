/*
 * metacore.wasm — file-metadata parsing for SuperTools (own code, WebAssembly first: STANDING RULE #1).
 *   m_sniff        : detect image type and pixel size from the header (JPEG, PNG, WebP, GIF, BMP, HEIC/AVIF brand)
 *   m_exif_json    : read EXIF (JPEG APP1 / PNG eXIf / WebP EXIF chunk) into a compact JSON object of named tags
 *   m_strip        : remove metadata without re-encoding (JPEG: APP1..APP15 except ICC + COM; PNG: eXIf/tEXt/zTXt/iTXt/
 *                    tIME; WebP: EXIF/XMP chunks, VP8X flags fixed)
 *   m_jpeg_set_dpi : write JFIF density (inserting a JFIF APP0 when missing)
 * All input is untrusted: every read is bounds-checked; IFD recursion depth and entry counts are capped.
 */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define API __attribute__((visibility("default")))
API void *m_malloc(uint32_t n) { return malloc(n ? n : 1); }
API void m_free(void *p) { free(p); }

static uint16_t be16(const uint8_t *p) { return (uint16_t)(p[0] << 8 | p[1]); }
static uint32_t be32(const uint8_t *p) { return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3]; }
static uint32_t le32(const uint8_t *p) { return (uint32_t)p[3] << 24 | (uint32_t)p[2] << 16 | (uint32_t)p[1] << 8 | p[0]; }
static uint16_t le16(const uint8_t *p) { return (uint16_t)(p[1] << 8 | p[0]); }
static int is_jpeg(const uint8_t *b, int n) { return n >= 4 && b[0] == 0xff && b[1] == 0xd8; }
static int is_png(const uint8_t *b, int n) { return n >= 8 && !memcmp(b, "\x89PNG\r\n\x1a\n", 8); }
static int is_webp(const uint8_t *b, int n) { return n >= 16 && !memcmp(b, "RIFF", 4) && !memcmp(b + 8, "WEBP", 4); }

/* ------------------------------------------------------------------ sniff
 * out[0] = type (0 unknown, 1 jpeg, 2 png, 3 webp, 4 gif, 5 bmp, 6 heic, 7 avif), out[1] = width, out[2] = height */
API int m_sniff(const uint8_t *b, int n, int32_t *out) {
    out[0] = out[1] = out[2] = 0;
    if (is_jpeg(b, n)) {
        out[0] = 1;
        int o = 2;
        while (o + 9 < n && b[o] == 0xff) {
            int m = b[o + 1];
            if (m == 0xff) { o++; continue; }
            int len = be16(b + o + 2);
            if (m >= 0xc0 && m <= 0xcf && m != 0xc4 && m != 0xc8 && m != 0xcc) { out[2] = be16(b + o + 5); out[1] = be16(b + o + 7); break; }
            if (m == 0xda || len < 2) break;
            o += 2 + len;
        }
    } else if (is_png(b, n) && n >= 24) { out[0] = 2; out[1] = (int32_t)be32(b + 16); out[2] = (int32_t)be32(b + 20); }
    else if (is_webp(b, n) && n >= 30) {
        out[0] = 3;
        if (!memcmp(b + 12, "VP8X", 4)) { out[1] = 1 + (b[24] | b[25] << 8 | b[26] << 16); out[2] = 1 + (b[27] | b[28] << 8 | b[29] << 16); }
        else if (!memcmp(b + 12, "VP8 ", 4)) { out[1] = le16(b + 26) & 0x3fff; out[2] = le16(b + 28) & 0x3fff; }
        else if (!memcmp(b + 12, "VP8L", 4)) { uint32_t v = le32(b + 21); out[1] = (int32_t)(v & 0x3fff) + 1; out[2] = (int32_t)((v >> 14) & 0x3fff) + 1; }
    } else if (n >= 10 && (!memcmp(b, "GIF87a", 6) || !memcmp(b, "GIF89a", 6))) { out[0] = 4; out[1] = le16(b + 6); out[2] = le16(b + 8); }
    else if (n >= 26 && b[0] == 'B' && b[1] == 'M') { out[0] = 5; out[1] = (int32_t)le32(b + 18); int32_t hh = (int32_t)le32(b + 22); out[2] = hh < 0 ? -hh : hh; }
    else if (n >= 12 && !memcmp(b + 4, "ftyp", 4)) {
        const char *brands[] = {"heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis"};
        if (!memcmp(b + 8, "avif", 4) || !memcmp(b + 8, "avis", 4)) out[0] = 7;
        else for (int i = 0; i < 8; i++) if (!memcmp(b + 8, brands[i], 4)) out[0] = 6;
    }
    return out[0];
}

/* ------------------------------------------------------------------ EXIF → JSON */
typedef struct { uint16_t tag; const char *name; } Tag;
static const Tag TAGS[] = {
    {0x010f, "Make"}, {0x0110, "Model"}, {0x0112, "Orientation"}, {0x011a, "XResolution"}, {0x011b, "YResolution"}, {0x0128, "ResolutionUnit"},
    {0x0131, "Software"}, {0x0132, "DateTime"}, {0x013b, "Artist"}, {0x8298, "Copyright"}, {0x829a, "ExposureTime"}, {0x829d, "FNumber"},
    {0x8822, "ExposureProgram"}, {0x8827, "ISO"}, {0x9003, "DateTimeOriginal"}, {0x9004, "DateTimeDigitized"}, {0x9010, "OffsetTime"},
    {0x9201, "ShutterSpeed"}, {0x9202, "Aperture"}, {0x9204, "ExposureBias"}, {0x9207, "MeteringMode"}, {0x9209, "Flash"}, {0x920a, "FocalLength"},
    {0xa002, "PixelXDimension"}, {0xa003, "PixelYDimension"}, {0xa402, "ExposureMode"}, {0xa403, "WhiteBalance"}, {0xa405, "FocalLengthIn35mm"},
    {0xa406, "SceneCaptureType"}, {0xa433, "LensMake"}, {0xa434, "LensModel"}, {0, 0}};
static const Tag GPS[] = {{1, "GPSLatitudeRef"}, {2, "GPSLatitude"}, {3, "GPSLongitudeRef"}, {4, "GPSLongitude"}, {5, "GPSAltitudeRef"},
                          {6, "GPSAltitude"}, {7, "GPSTimeStamp"}, {0x1d, "GPSDateStamp"}, {0, 0}};
static const char *tag_name(const Tag *t, uint16_t tag) { for (; t->name; t++) if (t->tag == tag) return t->name; return 0; }

typedef struct { char *p; int n, cap; } Out;
static void put(Out *o, const char *s, int len) { if (o->n + len < o->cap) { memcpy(o->p + o->n, s, len); o->n += len; } else o->n = o->cap; }
static void puts_(Out *o, const char *s) { put(o, s, (int)strlen(s)); }
static void put_num(Out *o, double v) { char t[40]; int k = snprintf(t, sizeof t, "%.10g", v); if (v != v || v > 1e300 || v < -1e300) k = snprintf(t, sizeof t, "0"); put(o, t, k); }
static void put_str(Out *o, const uint8_t *s, int len) {
    while (len > 0 && (s[len - 1] == 0 || s[len - 1] == ' ')) len--; /* trailing NULs / padding */
    int start = 0; while (start < len && s[start] == ' ') start++;
    puts_(o, "\"");
    for (int i = start; i < len; i++) {
        uint8_t c = s[i];
        if (c == 0) break;
        if (c == '"' || c == '\\') { char e[2] = {'\\', (char)c}; put(o, e, 2); }
        else if (c < 0x20) { char e[8]; int k = snprintf(e, sizeof e, "\\u%04x", c); put(o, e, k); }
        else put(o, (const char *)&c, 1);
    }
    puts_(o, "\"");
}

typedef struct { const uint8_t *b; int n; int le; Out *o; int first; } Tiff;
static uint16_t t16(Tiff *t, uint32_t off) { return t->le ? le16(t->b + off) : be16(t->b + off); }
static uint32_t t32(Tiff *t, uint32_t off) { return t->le ? le32(t->b + off) : be32(t->b + off); }
static const int SIZES[] = {0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8};

static void read_ifd(Tiff *t, uint32_t off, const Tag *names, int depth) {
    if (depth > 4 || off < 8 || (uint64_t)off + 2 > (uint64_t)t->n) return;
    int cnt = t16(t, off);
    for (int i = 0; i < cnt && i < 512; i++) {
        uint32_t e = off + 2 + (uint32_t)i * 12;
        if ((uint64_t)e + 12 > (uint64_t)t->n) break;
        uint16_t tag = t16(t, e), type = t16(t, e + 2);
        uint32_t count = t32(t, e + 4);
        if (type == 0 || type > 12 || count > (1u << 24)) continue;
        uint64_t size = (uint64_t)SIZES[type] * count;
        uint32_t vo = size > 4 ? t32(t, e + 8) : e + 8;
        if ((uint64_t)vo + size > (uint64_t)t->n) continue;
        if (tag == 0x8769 || tag == 0x8825) { read_ifd(t, t32(t, e + 8), tag == 0x8825 ? GPS : TAGS, depth + 1); continue; }
        const char *name = tag_name(names, tag);
        if (!name || count == 0) continue;
        Out *o = t->o;
        int item = 1;
        if (type == 2) { if (!t->first) puts_(o, ","); puts_(o, "\""); puts_(o, name); puts_(o, "\":"); put_str(o, t->b + vo, (int)count); t->first = 0; continue; }
        if (type == 1 || type == 7) { if (count > 4) continue; }
        if (!t->first) puts_(o, ",");
        t->first = 0;
        puts_(o, "\""); puts_(o, name); puts_(o, "\":");
        int many = count > 1 && type != 1 && type != 7;
        int lim = count < 8 ? (int)count : 8;
        if (many) puts_(o, "[");
        for (int k = 0; k < (many ? lim : item); k++) {
            if (k) puts_(o, ",");
            double v = 0;
            switch (type) {
                case 1: case 7: v = t->b[vo]; break;
                case 3: v = t16(t, vo + k * 2); break;
                case 4: v = t32(t, vo + k * 4); break;
                case 9: v = (int32_t)t32(t, vo + k * 4); break;
                case 5: { uint32_t a = t32(t, vo + k * 8), d = t32(t, vo + k * 8 + 4); v = d ? (double)a / d : 0; break; }
                case 10: { int32_t a = (int32_t)t32(t, vo + k * 8), d = (int32_t)t32(t, vo + k * 8 + 4); v = d ? (double)a / d : 0; break; }
                default: v = 0;
            }
            put_num(o, v);
        }
        if (many) puts_(o, "]");
    }
}

/* Locate the TIFF header of the EXIF block. Returns offset or -1. */
static int exif_base(const uint8_t *b, int n) {
    if (is_jpeg(b, n)) {
        int o = 2;
        while (o + 10 <= n && b[o] == 0xff) {
            int m = b[o + 1];
            if (m == 0xff) { o++; continue; }
            int len = be16(b + o + 2);
            if (len < 2) return -1;
            if (m == 0xe1 && o + 10 <= n && !memcmp(b + o + 4, "Exif\0", 5)) return o + 10;
            if (m == 0xda) return -1;
            o += 2 + len;
        }
    } else if (is_png(b, n)) {
        uint64_t o = 8;
        while (o + 8 <= (uint64_t)n) { uint32_t len = be32(b + o); if (!memcmp(b + o + 4, "eXIf", 4)) return (int)(o + 8); o += 12 + (uint64_t)len; }
    } else if (is_webp(b, n)) {
        uint64_t o = 12;
        while (o + 8 <= (uint64_t)n) {
            uint32_t len = le32(b + o + 4);
            if (!memcmp(b + o, "EXIF", 4)) { uint64_t s = o + 8; return (int)(s + 6 <= (uint64_t)n && !memcmp(b + s, "Exif\0", 5) ? s + 6 : s); }
            o += 8 + (uint64_t)len + (len & 1);
        }
    }
    return -1;
}

/* Writes {"Make":"…","GPSLatitude":[18,55,19.56],…} to out (NUL-terminated). Returns length, 0 if no EXIF, -1 if out too small. */
API int m_exif_json(const uint8_t *b, int n, char *out, int cap) {
    Out o = {out, 0, cap - 1};
    int base = exif_base(b, n);
    puts_(&o, "{");
    if (base >= 0 && base + 8 <= n) {
        Tiff t = {b + base, n - base, b[base] == 'I' && b[base + 1] == 'I', &o, 1};
        if ((b[base] == 'I' && b[base + 1] == 'I') || (b[base] == 'M' && b[base + 1] == 'M')) read_ifd(&t, t32(&t, 4), TAGS, 0);
    }
    puts_(&o, "}");
    if (o.n >= o.cap) return -1;
    out[o.n] = 0;
    return base < 0 ? 0 : o.n;
}

/* ------------------------------------------------------------------ strip (out must hold n bytes). Returns new length, 0 if unsupported. */
API int m_strip(const uint8_t *b, int n, uint8_t *out) {
    int w = 0;
    if (is_jpeg(b, n)) {
        memcpy(out, b, 2); w = 2;
        int o = 2;
        while (o + 4 <= n && b[o] == 0xff) {
            int m = b[o + 1];
            if (m == 0xda) { memcpy(out + w, b + o, n - o); return w + (n - o); }
            int len = be16(b + o + 2);
            if (len < 2 || o + 2 + len > n) return 0; /* truncated / corrupt — refuse rather than emit garbage */
            int icc = m == 0xe2 && len >= 14 && !memcmp(b + o + 4, "ICC_PROFILE", 11);
            int drop = (m >= 0xe1 && m <= 0xef && !icc) || m == 0xfe;
            if (!drop) { memcpy(out + w, b + o, 2 + len); w += 2 + len; }
            o += 2 + len;
        }
        return 0;
    }
    if (is_png(b, n)) {
        memcpy(out, b, 8); w = 8;
        uint64_t o = 8;
        while (o + 12 <= (uint64_t)n) {
            uint32_t len = be32(b + o);
            if (o + 12 + (uint64_t)len > (uint64_t)n) return 0;
            const uint8_t *ty = b + o + 4;
            int drop = !memcmp(ty, "eXIf", 4) || !memcmp(ty, "tEXt", 4) || !memcmp(ty, "zTXt", 4) || !memcmp(ty, "iTXt", 4) || !memcmp(ty, "tIME", 4);
            if (!drop) { memcpy(out + w, b + o, 12 + len); w += 12 + (int)len; }
            if (!memcmp(ty, "IEND", 4)) break;
            o += 12 + (uint64_t)len;
        }
        return w;
    }
    if (is_webp(b, n)) {
        memcpy(out, b, 12); w = 12;
        uint64_t o = 12;
        int vp8x = -1;
        while (o + 8 <= (uint64_t)n) {
            uint32_t len = le32(b + o + 4);
            uint64_t full = 8 + (uint64_t)len + (len & 1);
            if (o + full > (uint64_t)n) full = (uint64_t)n - o;
            int drop = !memcmp(b + o, "EXIF", 4) || !memcmp(b + o, "XMP ", 4);
            if (!memcmp(b + o, "VP8X", 4)) vp8x = w;
            if (!drop) { memcpy(out + w, b + o, (size_t)full); w += (int)full; }
            o += full;
        }
        if (vp8x >= 0 && vp8x + 9 <= w) out[vp8x + 8] &= (uint8_t)~0x0c; /* clear EXIF (0x08) and XMP (0x04) flags */
        uint32_t riff = (uint32_t)(w - 8);
        out[4] = riff & 255; out[5] = (riff >> 8) & 255; out[6] = (riff >> 16) & 255; out[7] = riff >> 24;
        return w;
    }
    return 0;
}

/* ------------------------------------------------------------------ JPEG DPI (out must hold n + 18 bytes). Returns new length, 0 if not JPEG. */
API int m_jpeg_set_dpi(const uint8_t *b, int n, uint8_t *out, int dpi) {
    if (!is_jpeg(b, n) || dpi <= 0 || dpi > 65535) return 0;
    if (n >= 18 && b[2] == 0xff && b[3] == 0xe0 && !memcmp(b + 6, "JFIF", 4)) {
        memcpy(out, b, n);
        out[13] = 1; out[14] = dpi >> 8; out[15] = dpi & 255; out[16] = dpi >> 8; out[17] = dpi & 255;
        return n;
    }
    const uint8_t app0[18] = {0xff, 0xe0, 0, 16, 'J', 'F', 'I', 'F', 0, 1, 2, 1, (uint8_t)(dpi >> 8), (uint8_t)dpi, (uint8_t)(dpi >> 8), (uint8_t)dpi, 0, 0};
    memcpy(out, b, 2); memcpy(out + 2, app0, 18); memcpy(out + 20, b + 2, n - 2);
    return n + 18;
}
