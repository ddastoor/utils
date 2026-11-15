/*
 * Streaming MD5 (RFC 1321), SHA-1 (FIPS 180-4), SHA-3 (FIPS 202) and CRC-32 (IEEE 802.3).
 * Written for this project; MD5 and SHA-1 are provided only for verifying legacy checksums.
 * SHA-256, SHA-512 and BLAKE2b come from libsodium (see glue.c).
 */
#include <stdint.h>
#include <string.h>
#include "hashes.h"

/* ---------------------------------------------------------------- MD5 */

static inline uint32_t rol32(uint32_t x, int n) { return (x << n) | (x >> (32 - n)); }

static const uint32_t MD5_K[64] = {
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391};
static const uint8_t MD5_R[64] = {7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
                                  5, 9,  14, 20, 5, 9,  14, 20, 5, 9,  14, 20, 5, 9,  14, 20,
                                  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
                                  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21};

static void md5_block(md5_ctx *c, const uint8_t *p) {
    uint32_t m[16];
    for (int i = 0; i < 16; i++)
        m[i] = (uint32_t)p[i * 4] | ((uint32_t)p[i * 4 + 1] << 8) | ((uint32_t)p[i * 4 + 2] << 16) |
               ((uint32_t)p[i * 4 + 3] << 24);
    uint32_t a = c->h[0], b = c->h[1], cc = c->h[2], d = c->h[3];
    for (int i = 0; i < 64; i++) {
        uint32_t f;
        int g;
        if (i < 16) { f = (b & cc) | (~b & d); g = i; }
        else if (i < 32) { f = (d & b) | (~d & cc); g = (5 * i + 1) & 15; }
        else if (i < 48) { f = b ^ cc ^ d; g = (3 * i + 5) & 15; }
        else { f = cc ^ (b | ~d); g = (7 * i) & 15; }
        uint32_t t = d;
        d = cc;
        cc = b;
        b = b + rol32(a + f + MD5_K[i] + m[g], MD5_R[i]);
        a = t;
    }
    c->h[0] += a; c->h[1] += b; c->h[2] += cc; c->h[3] += d;
}

void md5_init(md5_ctx *c) {
    c->h[0] = 0x67452301; c->h[1] = 0xefcdab89; c->h[2] = 0x98badcfe; c->h[3] = 0x10325476;
    c->len = 0; c->used = 0;
}

void md5_update(md5_ctx *c, const uint8_t *p, size_t n) {
    c->len += n;
    while (n > 0) {
        size_t take = 64 - c->used;
        if (take > n) take = n;
        memcpy(c->buf + c->used, p, take);
        c->used += take; p += take; n -= take;
        if (c->used == 64) { md5_block(c, c->buf); c->used = 0; }
    }
}

void md5_final(md5_ctx *c, uint8_t out[16]) {
    uint64_t bits = c->len * 8;
    uint8_t pad = 0x80;
    md5_update(c, &pad, 1);
    pad = 0;
    while (c->used != 56) md5_update(c, &pad, 1);
    uint8_t lb[8];
    for (int i = 0; i < 8; i++) lb[i] = (uint8_t)(bits >> (8 * i));
    md5_update(c, lb, 8);
    for (int i = 0; i < 4; i++)
        for (int j = 0; j < 4; j++) out[i * 4 + j] = (uint8_t)(c->h[i] >> (8 * j));
}

/* -------------------------------------------------------------- SHA-1 */

static void sha1_block(sha1_ctx *c, const uint8_t *p) {
    uint32_t w[80];
    for (int i = 0; i < 16; i++)
        w[i] = ((uint32_t)p[i * 4] << 24) | ((uint32_t)p[i * 4 + 1] << 16) | ((uint32_t)p[i * 4 + 2] << 8) |
               (uint32_t)p[i * 4 + 3];
    for (int i = 16; i < 80; i++) w[i] = rol32(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    uint32_t a = c->h[0], b = c->h[1], cc = c->h[2], d = c->h[3], e = c->h[4];
    for (int i = 0; i < 80; i++) {
        uint32_t f, k;
        if (i < 20) { f = (b & cc) | (~b & d); k = 0x5a827999; }
        else if (i < 40) { f = b ^ cc ^ d; k = 0x6ed9eba1; }
        else if (i < 60) { f = (b & cc) | (b & d) | (cc & d); k = 0x8f1bbcdc; }
        else { f = b ^ cc ^ d; k = 0xca62c1d6; }
        uint32_t t = rol32(a, 5) + f + e + k + w[i];
        e = d; d = cc; cc = rol32(b, 30); b = a; a = t;
    }
    c->h[0] += a; c->h[1] += b; c->h[2] += cc; c->h[3] += d; c->h[4] += e;
}

void sha1_init(sha1_ctx *c) {
    c->h[0] = 0x67452301; c->h[1] = 0xefcdab89; c->h[2] = 0x98badcfe; c->h[3] = 0x10325476;
    c->h[4] = 0xc3d2e1f0; c->len = 0; c->used = 0;
}

void sha1_update(sha1_ctx *c, const uint8_t *p, size_t n) {
    c->len += n;
    while (n > 0) {
        size_t take = 64 - c->used;
        if (take > n) take = n;
        memcpy(c->buf + c->used, p, take);
        c->used += take; p += take; n -= take;
        if (c->used == 64) { sha1_block(c, c->buf); c->used = 0; }
    }
}

void sha1_final(sha1_ctx *c, uint8_t out[20]) {
    uint64_t bits = c->len * 8;
    uint8_t pad = 0x80;
    sha1_update(c, &pad, 1);
    pad = 0;
    while (c->used != 56) sha1_update(c, &pad, 1);
    uint8_t lb[8];
    for (int i = 0; i < 8; i++) lb[i] = (uint8_t)(bits >> (56 - 8 * i));
    sha1_update(c, lb, 8);
    for (int i = 0; i < 5; i++)
        for (int j = 0; j < 4; j++) out[i * 4 + j] = (uint8_t)(c->h[i] >> (24 - 8 * j));
}

/* -------------------------------------------------------------- SHA-3 */

static const uint64_t KECCAK_RC[24] = {
    0x0000000000000001ULL, 0x0000000000008082ULL, 0x800000000000808aULL, 0x8000000080008000ULL,
    0x000000000000808bULL, 0x0000000080000001ULL, 0x8000000080008081ULL, 0x8000000000008009ULL,
    0x000000000000008aULL, 0x0000000000000088ULL, 0x0000000080008009ULL, 0x000000008000000aULL,
    0x000000008000808bULL, 0x800000000000008bULL, 0x8000000000008089ULL, 0x8000000000008003ULL,
    0x8000000000008002ULL, 0x8000000000000080ULL, 0x000000000000800aULL, 0x800000008000000aULL,
    0x8000000080008081ULL, 0x8000000000008080ULL, 0x0000000080000001ULL, 0x8000000080008008ULL};
static const int KECCAK_ROT[25] = {0,  1,  62, 28, 27, 36, 44, 6,  55, 20, 3,  10, 43,
                                   25, 39, 41, 45, 15, 21, 8,  18, 2,  61, 56, 14};

static inline uint64_t rol64(uint64_t x, int n) { return n ? (x << n) | (x >> (64 - n)) : x; }

static void keccak_f(uint64_t s[25]) {
    for (int round = 0; round < 24; round++) {
        uint64_t c[5], d[5], b[25];
        for (int x = 0; x < 5; x++) c[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
        for (int x = 0; x < 5; x++) d[x] = c[(x + 4) % 5] ^ rol64(c[(x + 1) % 5], 1);
        for (int i = 0; i < 25; i++) s[i] ^= d[i % 5];
        /* rho + pi: B[y, 2x+3y] = rot(A[x,y], r[x,y]) */
        for (int x = 0; x < 5; x++)
            for (int y = 0; y < 5; y++) b[y + 5 * ((2 * x + 3 * y) % 5)] = rol64(s[x + 5 * y], KECCAK_ROT[x + 5 * y]);
        for (int x = 0; x < 5; x++)
            for (int y = 0; y < 5; y++)
                s[x + 5 * y] = b[x + 5 * y] ^ (~b[(x + 1) % 5 + 5 * y] & b[(x + 2) % 5 + 5 * y]);
        s[0] ^= KECCAK_RC[round];
    }
}

void sha3_init(sha3_ctx *c, int outbytes) {
    memset(c->s, 0, sizeof c->s);
    c->rate = 200 - 2 * outbytes;
    c->outlen = outbytes;
    c->pos = 0;
}

void sha3_update(sha3_ctx *c, const uint8_t *p, size_t n) {
    uint8_t *st = (uint8_t *)c->s; /* wasm is little-endian, matching Keccak lane order */
    while (n > 0) {
        st[c->pos++] ^= *p++;
        n--;
        if (c->pos == c->rate) { keccak_f(c->s); c->pos = 0; }
    }
}

void sha3_final(sha3_ctx *c, uint8_t *out) {
    uint8_t *st = (uint8_t *)c->s;
    st[c->pos] ^= 0x06;
    st[c->rate - 1] ^= 0x80;
    keccak_f(c->s);
    memcpy(out, st, (size_t)c->outlen);
}

/* ------------------------------------------------------------- CRC-32 */

static uint32_t crc_table[256];
static int crc_ready = 0;

uint32_t crc32_update(uint32_t crc, const uint8_t *p, size_t n) {
    if (!crc_ready) {
        for (uint32_t i = 0; i < 256; i++) {
            uint32_t c = i;
            for (int k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320u ^ (c >> 1) : c >> 1;
            crc_table[i] = c;
        }
        crc_ready = 1;
    }
    crc = ~crc;
    while (n--) crc = crc_table[(crc ^ *p++) & 0xff] ^ (crc >> 8);
    return ~crc;
}
