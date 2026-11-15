#ifndef UTILS_HASHES_H
#define UTILS_HASHES_H
#include <stddef.h>
#include <stdint.h>

typedef struct { uint32_t h[4]; uint64_t len; uint8_t buf[64]; size_t used; } md5_ctx;
typedef struct { uint32_t h[5]; uint64_t len; uint8_t buf[64]; size_t used; } sha1_ctx;
typedef struct { uint64_t s[25]; int rate; int outlen; int pos; } sha3_ctx;

void md5_init(md5_ctx *c);
void md5_update(md5_ctx *c, const uint8_t *p, size_t n);
void md5_final(md5_ctx *c, uint8_t out[16]);
void sha1_init(sha1_ctx *c);
void sha1_update(sha1_ctx *c, const uint8_t *p, size_t n);
void sha1_final(sha1_ctx *c, uint8_t out[20]);
void sha3_init(sha3_ctx *c, int outbytes);
void sha3_update(sha3_ctx *c, const uint8_t *p, size_t n);
void sha3_final(sha3_ctx *c, uint8_t *out);
uint32_t crc32_update(uint32_t crc, const uint8_t *p, size_t n);

#endif
