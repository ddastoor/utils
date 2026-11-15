/*
 * textcore.wasm — text algorithms for SuperTools (own code).
 *   t_diff: Myers O(ND) shortest edit script over integer token arrays (lines or words are mapped to ids in JS,
 *           so Unicode handling stays with the browser) with common prefix/suffix trimming.
 * Output ops: 0 = equal, 1 = delete (from A), 2 = insert (from B); each op = (kind, indexA, indexB).
 */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#define API __attribute__((visibility("default")))
API void *t_malloc(uint32_t n) { return malloc(n ? n : 1); }
API void t_free(void *p) { free(p); }

/* Returns number of ops written to out (3 ints each), or -1 if the edit distance exceeds max_d (too different). */
API int t_diff(const int32_t *a, int n, const int32_t *b, int m, int32_t *out, int max_d) {
    int pre = 0;
    while (pre < n && pre < m && a[pre] == b[pre]) pre++;
    int suf = 0;
    while (suf < n - pre && suf < m - pre && a[n - 1 - suf] == b[m - 1 - suf]) suf++;
    const int32_t *A = a + pre, *B = b + pre;
    int N = n - pre - suf, M = m - pre - suf;
    int ops = 0;
    for (int i = 0; i < pre; i++) { out[ops * 3] = 0; out[ops * 3 + 1] = i; out[ops * 3 + 2] = i; ops++; }

    if (N == 0 || M == 0) {
        for (int i = 0; i < N; i++) { out[ops * 3] = 1; out[ops * 3 + 1] = pre + i; out[ops * 3 + 2] = pre; ops++; }
        for (int j = 0; j < M; j++) { out[ops * 3] = 2; out[ops * 3 + 1] = pre + N; out[ops * 3 + 2] = pre + j; ops++; }
    } else {
        int MAX = N + M; if (max_d > 0 && max_d < MAX) MAX = max_d;
        int off = MAX + 1, W = 2 * MAX + 3;
        int *V = malloc(sizeof(int) * W);
        /* trace: store V for each d so we can backtrack */
        int *trace = malloc(sizeof(int) * (size_t)W * (MAX + 1));
        if (!V || !trace) { free(V); free(trace); return -1; }
        memset(V, 0, sizeof(int) * W);
        V[off + 1] = 0;
        int found = -1;
        for (int d = 0; d <= MAX && found < 0; d++) {
            for (int k = -d; k <= d; k += 2) {
                int x;
                if (k == -d || (k != d && V[off + k - 1] < V[off + k + 1])) x = V[off + k + 1];
                else x = V[off + k - 1] + 1;
                int y = x - k;
                while (x < N && y < M && A[x] == B[y]) { x++; y++; }
                V[off + k] = x;
                if (x >= N && y >= M) { found = d; break; }
            }
            memcpy(trace + (size_t)d * W, V, sizeof(int) * W);
        }
        if (found < 0) { free(V); free(trace); return -1; }
        /* backtrack into a reversed list, then emit forward */
        int cap = N + M + 1, rn = 0;
        int32_t *rev = malloc(sizeof(int32_t) * 3 * cap);
        int x = N, y = M;
        for (int d = found; d > 0; d--) {
            int *Vd = trace + (size_t)(d - 1) * W;
            int k = x - y, pk;
            if (k == -d || (k != d && Vd[off + k - 1] < Vd[off + k + 1])) pk = k + 1; else pk = k - 1;
            int px = Vd[off + pk], py = px - pk;
            while (x > px && y > py) { x--; y--; rev[rn * 3] = 0; rev[rn * 3 + 1] = x; rev[rn * 3 + 2] = y; rn++; }
            if (x == px) { y--; rev[rn * 3] = 2; rev[rn * 3 + 1] = x; rev[rn * 3 + 2] = y; rn++; }
            else { x--; rev[rn * 3] = 1; rev[rn * 3 + 1] = x; rev[rn * 3 + 2] = y; rn++; }
        }
        while (x > 0 && y > 0) { x--; y--; rev[rn * 3] = 0; rev[rn * 3 + 1] = x; rev[rn * 3 + 2] = y; rn++; }
        for (int i = rn - 1; i >= 0; i--) { out[ops * 3] = rev[i * 3]; out[ops * 3 + 1] = pre + rev[i * 3 + 1]; out[ops * 3 + 2] = pre + rev[i * 3 + 2]; ops++; }
        free(rev); free(V); free(trace);
    }
    for (int i = 0; i < suf; i++) { out[ops * 3] = 0; out[ops * 3 + 1] = n - suf + i; out[ops * 3 + 2] = m - suf + i; ops++; }
    return ops;
}
