/*
 * Exports of crypto.wasm: a thin, 32-bit-friendly API over libsodium plus our own hashes.
 * Every function takes/returns i32 (or f64-free) values so JavaScript never needs BigInt.
 * Built as a WASI reactor; see build.sh.
 */
#include <sodium.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "hashes.h"

#define EXPORT __attribute__((visibility("default")))

EXPORT void *u_malloc(uint32_t n) { return malloc(n ? n : 1); }
EXPORT void u_free(void *p) { free(p); }
EXPORT void u_memzero(void *p, uint32_t n) { sodium_memzero(p, n); }
EXPORT int u_init(void) { return sodium_init(); }
EXPORT const char *u_version(void) { return sodium_version_string(); }

/* ---------------- random ---------------- */
EXPORT void u_random(void *buf, uint32_t n) { randombytes_buf(buf, n); }
EXPORT uint32_t u_uniform(uint32_t upper) { return randombytes_uniform(upper); }

/* ---------------- Argon2id ---------------- */
EXPORT uint32_t u_pwhash_saltbytes(void) { return crypto_pwhash_SALTBYTES; }
/* memlimit given in KiB so it always fits in 32 bits (1 GiB = 1048576 KiB). */
EXPORT int u_pwhash(uint8_t *out, uint32_t outlen, const char *pw, uint32_t pwlen, const uint8_t *salt,
                    uint32_t opslimit, uint32_t memlimit_kib) {
    return crypto_pwhash(out, outlen, pw, pwlen, salt, opslimit, (size_t)memlimit_kib * 1024u,
                         crypto_pwhash_ALG_ARGON2ID13);
}

/* ---------------- secretstream XChaCha20-Poly1305 ---------------- */
EXPORT uint32_t u_ss_statebytes(void) { return (uint32_t)crypto_secretstream_xchacha20poly1305_statebytes(); }
EXPORT uint32_t u_ss_headerbytes(void) { return crypto_secretstream_xchacha20poly1305_HEADERBYTES; }
EXPORT uint32_t u_ss_keybytes(void) { return crypto_secretstream_xchacha20poly1305_KEYBYTES; }
EXPORT uint32_t u_ss_abytes(void) { return crypto_secretstream_xchacha20poly1305_ABYTES; }
EXPORT uint32_t u_ss_tag_final(void) { return crypto_secretstream_xchacha20poly1305_TAG_FINAL; }

EXPORT int u_ss_init_push(void *st, uint8_t *header, const uint8_t *key) {
    return crypto_secretstream_xchacha20poly1305_init_push(st, header, key);
}
/* returns ciphertext length, or -1 */
EXPORT int u_ss_push(void *st, uint8_t *c, const uint8_t *m, uint32_t mlen, uint32_t tag) {
    unsigned long long clen = 0;
    if (crypto_secretstream_xchacha20poly1305_push(st, c, &clen, m, mlen, NULL, 0, (unsigned char)tag) != 0) return -1;
    return (int)clen;
}
EXPORT int u_ss_init_pull(void *st, const uint8_t *header, const uint8_t *key) {
    return crypto_secretstream_xchacha20poly1305_init_pull(st, header, key);
}
/* returns plaintext length (>= 0) and writes the tag, or -1 on authentication failure */
EXPORT int u_ss_pull(void *st, uint8_t *m, uint8_t *tag_out, const uint8_t *c, uint32_t clen) {
    unsigned long long mlen = 0;
    if (crypto_secretstream_xchacha20poly1305_pull(st, m, &mlen, tag_out, c, clen, NULL, 0) != 0) return -1;
    return (int)mlen;
}

/* ---------------- hashing (streaming) ----------------
 * alg: 0 MD5, 1 SHA-1, 2 SHA-256, 3 SHA-512, 4 SHA3-256, 5 SHA3-512, 6 BLAKE2b-256, 7 BLAKE2b-512, 8 CRC-32
 */
typedef struct {
    int alg;
    union {
        md5_ctx md5;
        sha1_ctx sha1;
        crypto_hash_sha256_state sha256;
        crypto_hash_sha512_state sha512;
        sha3_ctx sha3;
        crypto_generichash_state b2;
        uint32_t crc;
    } u;
} hash_ctx;

EXPORT uint32_t u_hash_len(int alg) {
    static const uint32_t lens[] = {16, 20, 32, 64, 32, 64, 32, 64, 4};
    return (alg >= 0 && alg <= 8) ? lens[alg] : 0;
}

EXPORT hash_ctx *u_hash_new(int alg) {
    hash_ctx *h = (hash_ctx *)sodium_malloc(sizeof(hash_ctx));
    if (!h) return NULL;
    h->alg = alg;
    switch (alg) {
    case 0: md5_init(&h->u.md5); break;
    case 1: sha1_init(&h->u.sha1); break;
    case 2: crypto_hash_sha256_init(&h->u.sha256); break;
    case 3: crypto_hash_sha512_init(&h->u.sha512); break;
    case 4: sha3_init(&h->u.sha3, 32); break;
    case 5: sha3_init(&h->u.sha3, 64); break;
    case 6: crypto_generichash_init(&h->u.b2, NULL, 0, 32); break;
    case 7: crypto_generichash_init(&h->u.b2, NULL, 0, 64); break;
    case 8: h->u.crc = 0; break;
    default: sodium_free(h); return NULL;
    }
    return h;
}

EXPORT void u_hash_update(hash_ctx *h, const uint8_t *p, uint32_t n) {
    switch (h->alg) {
    case 0: md5_update(&h->u.md5, p, n); break;
    case 1: sha1_update(&h->u.sha1, p, n); break;
    case 2: crypto_hash_sha256_update(&h->u.sha256, p, n); break;
    case 3: crypto_hash_sha512_update(&h->u.sha512, p, n); break;
    case 4: case 5: sha3_update(&h->u.sha3, p, n); break;
    case 6: case 7: crypto_generichash_update(&h->u.b2, p, n); break;
    case 8: h->u.crc = crc32_update(h->u.crc, p, n); break;
    }
}

/* writes u_hash_len(alg) bytes and frees the context */
EXPORT void u_hash_final(hash_ctx *h, uint8_t *out) {
    switch (h->alg) {
    case 0: md5_final(&h->u.md5, out); break;
    case 1: sha1_final(&h->u.sha1, out); break;
    case 2: crypto_hash_sha256_final(&h->u.sha256, out); break;
    case 3: crypto_hash_sha512_final(&h->u.sha512, out); break;
    case 4: case 5: sha3_final(&h->u.sha3, out); break;
    case 6: crypto_generichash_final(&h->u.b2, out, 32); break;
    case 7: crypto_generichash_final(&h->u.b2, out, 64); break;
    case 8: {
        uint32_t c = h->u.crc;
        out[0] = (uint8_t)(c >> 24); out[1] = (uint8_t)(c >> 16); out[2] = (uint8_t)(c >> 8); out[3] = (uint8_t)c;
        break;
    }
    }
    sodium_free(h); /* sodium_free zeroes the memory */
}

/* ------------------------------------------------------------------ fair randomness helpers (libsodium CSPRNG) */
/* Uniform random permutation of 0..n-1 (Fisher–Yates with unbiased randombytes_uniform). */
EXPORT void u_shuffle_idx(uint32_t *idx, uint32_t n) {
    for (uint32_t i = 0; i < n; i++) idx[i] = i;
    for (uint32_t i = n; i > 1; i--) { uint32_t j = randombytes_uniform(i), t = idx[i - 1]; idx[i - 1] = idx[j]; idx[j] = t; }
}
/* count values in [0, span) (span 0 = 2^32). unique: no repeats (count ≤ span). Returns 0, or -1 if impossible. */
EXPORT int u_sample(uint32_t span, uint32_t count, int unique, uint32_t *out) {
    if (unique && span && count > span) return -1;
    if (unique && span && span <= (1u << 20) && count > span / 16) {
        /* partial Fisher–Yates over the whole range (dense draws) */
        uint32_t *all = malloc(sizeof(uint32_t) * span);
        if (!all) return -1;
        for (uint32_t i = 0; i < span; i++) all[i] = i;
        for (uint32_t i = 0; i < count; i++) { uint32_t j = i + randombytes_uniform(span - i), t = all[i]; all[i] = all[j]; all[j] = t; out[i] = all[i]; }
        free(all);
        return 0;
    }
    for (uint32_t i = 0; i < count; i++) {
        for (;;) {
            uint32_t v = span ? randombytes_uniform(span) : randombytes_random();
            int dup = 0;
            if (unique) for (uint32_t k = 0; k < i; k++) if (out[k] == v) { dup = 1; break; }
            if (!dup) { out[i] = v; break; }
        }
    }
    return 0;
}
/* RFC 9562 UUID: version 4 (random) or 7 (48-bit Unix ms timestamp + 74 random bits). Writes 16 bytes.
   Version 7 values made by one instance always increase (RFC 9562 section 6.2, method 2 "monotonic random"):
   within one millisecond - or when the clock steps back by up to 10 s - the 74 random bits of the previous value
   get a random step added (carrying into the timestamp if they ever overflow), so a batch sorts in the order it
   was made. A clock that was set back by more than 10 s starts afresh from the new time. */
static uint64_t u7_ms, u7_hi, u7_lo; /* last timestamp, rand_a (12 bits), rand_b (62 bits) */
static int u7_have;
EXPORT void u_uuid(int version, double unix_ms, uint8_t *b) {
    randombytes_buf(b, 16);
    if (version == 7) {
        const uint64_t LO = (1ULL << 62) - 1;
        uint64_t t = unix_ms > 0 ? (unix_ms < 281474976710655.0 ? (uint64_t)unix_ms : 0xffffffffffffULL) : 0, hi, lo;
        if (u7_have && t <= u7_ms && u7_ms - t <= 10000) {
            t = u7_ms; hi = u7_hi; lo = u7_lo + 1 + (uint64_t)randombytes_random();
            if (lo > LO) { lo &= LO; if (++hi > 0xfff) { hi = 0; t++; } }
        } else {
            hi = ((uint64_t)(b[6] & 0x0f) << 8) | b[7];
            lo = 0; for (int i = 8; i < 16; i++) lo = (lo << 8) | b[i];
            lo &= LO;
        }
        u7_have = 1; u7_ms = t; u7_hi = hi; u7_lo = lo;
        for (int i = 0; i < 6; i++) b[i] = (uint8_t)(t >> (8 * (5 - i)));
        b[6] = (uint8_t)(0x70 | (hi >> 8)); b[7] = (uint8_t)hi;
        for (int i = 0; i < 8; i++) b[8 + i] = (uint8_t)(lo >> (8 * (7 - i)));
        b[8] = (b[8] & 0x3f) | 0x80;
        return;
    }
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
}

/* ------------------------------------------------------------------ "USODIUM1" container header (docs/sodium-format.md) */
#define SH_LEN 61
static void put32le(uint8_t *p, uint32_t v) { p[0] = (uint8_t)v; p[1] = (uint8_t)(v >> 8); p[2] = (uint8_t)(v >> 16); p[3] = (uint8_t)(v >> 24); }
static uint32_t get32le(const uint8_t *p) { return (uint32_t)p[0] | (uint32_t)p[1] << 8 | (uint32_t)p[2] << 16 | (uint32_t)p[3] << 24; }
EXPORT int u_sh_len(void) { return SH_LEN; }
EXPORT void u_sh_write(uint32_t ops, uint32_t mem_kib, uint32_t chunk, const uint8_t *salt16, const uint8_t *ss_header24, uint8_t *out) {
    memcpy(out, "USODIUM1", 8);
    out[8] = 2; /* Argon2id v1.3 */
    put32le(out + 9, ops); put32le(out + 13, mem_kib); put32le(out + 17, chunk);
    memcpy(out + 21, salt16, 16); memcpy(out + 37, ss_header24, 24);
}
/* Returns 0 ok, -1 not a USODIUM1 file, -2 unsupported KDF, -3 parameters out of range (damaged).
   params[0..2] = ops, mem KiB, chunk; salt (16) and secretstream header (24) copied out. */
EXPORT int u_sh_parse(const uint8_t *in, uint32_t n, uint32_t *params, uint8_t *salt16, uint8_t *ss_header24) {
    if (n < SH_LEN || memcmp(in, "USODIUM1", 8)) return -1;
    if (in[8] != 2) return -2;
    uint32_t ops = get32le(in + 9), mem = get32le(in + 13), chunk = get32le(in + 17);
    if (ops < 1 || ops > 20 || mem < 8 || mem > 4u * 1024 * 1024 || chunk < 1 || chunk > (1u << 24)) return -3;
    params[0] = ops; params[1] = mem; params[2] = chunk;
    memcpy(salt16, in + 21, 16); memcpy(ss_header24, in + 37, 24);
    return 0;
}
