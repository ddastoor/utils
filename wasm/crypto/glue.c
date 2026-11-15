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
