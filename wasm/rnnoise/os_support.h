/* Shim for RNNoise 0.2's generic (non-x86, non-NEON) vector path, which includes Opus's os_support.h — a file that
 * is not shipped in the RNNoise release. Only OPUS_CLEAR is used (with OPUS_INLINE/celt_assert from common.h/arch.h). */
#ifndef OS_SUPPORT_H
#define OS_SUPPORT_H
#include <string.h>
#define OPUS_CLEAR(dst, n) (memset((dst), 0, (n) * sizeof(*(dst))))
#define OPUS_COPY(dst, src, n) (memcpy((dst), (src), (n) * sizeof(*(dst)) + 0 * ((dst) - (src))))
#define OPUS_MOVE(dst, src, n) (memmove((dst), (src), (n) * sizeof(*(dst)) + 0 * ((dst) - (src))))
#endif
