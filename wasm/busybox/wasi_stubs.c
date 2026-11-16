/* Run-time side of compat.h: POSIX calls WASI preview 1 cannot provide. Process/socket calls fail with ENOSYS;
 * identity calls describe a single user (root); temp files are created in the shared in-memory filesystem. */
#include <errno.h>
#include <fcntl.h>
#include <stdarg.h>
#include <string.h>
#include <sys/stat.h>
#include <stdlib.h>
#include <unistd.h>

#define NOSYS(ret) { errno = ENOSYS; return ret; }
#ifndef SA_RESTART
#endif
int sigaction(int s, const struct sigaction *a, struct sigaction *o) { (void)s; (void)a; if (o) memset(o, 0, sizeof *o); return 0; }
int sigemptyset(sigset_t *s) { memset(s, 0, sizeof *s); return 0; }
int sigfillset(sigset_t *s) { memset(s, 0xff, sizeof *s); return 0; }
int sigaddset(sigset_t *s, int n) { (void)s; (void)n; return 0; }
int sigdelset(sigset_t *s, int n) { (void)s; (void)n; return 0; }
int sigismember(const sigset_t *s, int n) { (void)s; (void)n; return 0; }
int sigprocmask(int h, const sigset_t *s, sigset_t *o) { (void)h; (void)s; if (o) memset(o, 0, sizeof *o); return 0; }
int sigsuspend(const sigset_t *s) { (void)s; NOSYS(-1) }
int kill(pid_t p, int s) { (void)p; (void)s; NOSYS(-1) }

pid_t fork(void) NOSYS(-1)
pid_t vfork(void) NOSYS(-1)
int execv(const char *p, char *const a[]) { (void)p; (void)a; NOSYS(-1) }
int execve(const char *p, char *const a[], char *const e[]) { (void)p; (void)a; (void)e; NOSYS(-1) }
int execvp(const char *p, char *const a[]) { (void)p; (void)a; NOSYS(-1) }
int execlp(const char *p, const char *a, ...) { (void)p; (void)a; NOSYS(-1) }
pid_t getppid(void) { return 1; }
pid_t setsid(void) NOSYS(-1)
int pipe(int f[2]) { (void)f; NOSYS(-1) }
int dup(int f) { (void)f; NOSYS(-1) }
/* dup2 → WASI fd_renumber. Renumber MOVES the descriptor (a becomes invalid), which is exactly BusyBox's
   xmove_fd(a, b) = dup2(a, b) + close(a); the following close(a) then just fails harmlessly. */
#include <wasi/api.h>
int dup2(int a, int b) {
	if (a == b) return b;
	__wasi_errno_t e = __wasi_fd_renumber((__wasi_fd_t)a, (__wasi_fd_t)b);
	if (e) { errno = e; return -1; }
	return b;
}
unsigned alarm(unsigned s) { (void)s; return 0; }
FILE *popen(const char *c, const char *m) { (void)c; (void)m; NOSYS(NULL) }
int pclose(FILE *f) { (void)f; NOSYS(-1) }

uid_t getuid(void) { return 0; }
uid_t geteuid(void) { return 0; }
gid_t getgid(void) { return 0; }
gid_t getegid(void) { return 0; }
int setuid(uid_t u) { return u ? (errno = EPERM, -1) : 0; }
int seteuid(uid_t u) { return u ? (errno = EPERM, -1) : 0; }
int setgid(gid_t g) { return g ? (errno = EPERM, -1) : 0; }
int setegid(gid_t g) { return g ? (errno = EPERM, -1) : 0; }
int getgroups(int n, gid_t g[]) { if (n > 0) g[0] = 0; return n > 0 ? 1 : 1; }
static mode_t cur_umask = 022;
mode_t umask(mode_t m) { mode_t o = cur_umask; cur_umask = m & 0777; return o; }
int chown(const char *p, uid_t u, gid_t g) { (void)p; (void)u; (void)g; return 0; }
int fchown(int f, uid_t u, gid_t g) { (void)f; (void)u; (void)g; return 0; }
int lchown(const char *p, uid_t u, gid_t g) { (void)p; (void)u; (void)g; return 0; }
int mknod(const char *p, mode_t m, dev_t d) { (void)p; (void)m; (void)d; NOSYS(-1) }
int chroot(const char *p) { (void)p; NOSYS(-1) }
int fchdir(int f) { (void)f; NOSYS(-1) }
int ttyname_r(int f, char *b, size_t n) { (void)f; (void)b; (void)n; return ENOTTY; }

/* temp files: random 6-char suffix from getentropy, O_EXCL, retried */
static int fill_x(char *t) {
	size_t n = strlen(t), k = 0;
	while (k < n && k < 6 && t[n - 1 - k] == 'X') k++;
	if (k < 6) { errno = EINVAL; return -1; }
	static const char a[] = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	unsigned char r[6];
	getentropy(r, 6);
	for (int i = 0; i < 6; i++) t[n - 6 + i] = a[r[i] % 62];
	return 0;
}
int mkstemp(char *t) {
	char save[4096]; strncpy(save, t, sizeof save - 1); save[sizeof save - 1] = 0;
	for (int i = 0; i < 100; i++) {
		strcpy(t, save);
		if (fill_x(t)) return -1;
		int fd = open(t, O_RDWR | O_CREAT | O_EXCL, 0600);
		if (fd >= 0 || errno != EEXIST) return fd;
	}
	errno = EEXIST; return -1;
}
char *mkdtemp(char *t) {
	char save[4096]; strncpy(save, t, sizeof save - 1); save[sizeof save - 1] = 0;
	for (int i = 0; i < 100; i++) {
		strcpy(t, save);
		if (fill_x(t)) return NULL;
		if (mkdir(t, 0700) == 0) return t;
		if (errno != EEXIST) return NULL;
	}
	return NULL;
}
char *mktemp(char *t) { if (fill_x(t)) t[0] = 0; return t; }

int getrlimit(int r, struct rlimit *l) { (void)r; l->rlim_cur = l->rlim_max = RLIM_INFINITY; return 0; }
int setrlimit(int r, const struct rlimit *l) { (void)r; (void)l; return 0; }
int settimeofday(const void *t, const void *z) { (void)t; (void)z; errno = EPERM; return -1; }
int clock_settime(clockid_t c, const struct timespec *t) { (void)c; (void)t; errno = EPERM; return -1; }

int socket(int a, int b, int c) { (void)a; (void)b; (void)c; NOSYS(-1) }
int bind(int a, const struct sockaddr *b, socklen_t c) { (void)a; (void)b; (void)c; NOSYS(-1) }
int connect(int a, const struct sockaddr *b, socklen_t c) { (void)a; (void)b; (void)c; NOSYS(-1) }
int listen(int a, int b) { (void)a; (void)b; NOSYS(-1) }
ssize_t sendto(int a, const void *b, size_t c, int d, const struct sockaddr *e, socklen_t f) { (void)a; (void)b; (void)c; (void)d; (void)e; (void)f; NOSYS(-1) }
int setsockopt(int a, int b, int c, const void *d, socklen_t e) { (void)a; (void)b; (void)c; (void)d; (void)e; NOSYS(-1) }
int getsockname(int a, struct sockaddr *b, socklen_t *c) { (void)a; (void)b; (void)c; NOSYS(-1) }
int getpeername(int a, struct sockaddr *b, socklen_t *c) { (void)a; (void)b; (void)c; NOSYS(-1) }
#include <netinet/in.h>
char *inet_ntoa(struct in_addr a) { (void)a; static char s[] = "0.0.0.0"; return s; }
int sched_getaffinity(pid_t p, size_t n, void *m) { (void)p; if (n) memset(m, 0, n); if (n) ((unsigned char *)m)[0] = 1; return 0; }

/* no child processes exist */
pid_t wait(int *s) { (void)s; errno = ECHILD; return -1; }
pid_t waitpid(pid_t p, int *s, int o) { (void)p; (void)s; (void)o; errno = ECHILD; return -1; }

/* Each command is a fresh WASI instance; the terminal passes the shell's working directory as $PWD. */
__attribute__((constructor)) static void bb_init_cwd(void) { const char *p = getenv("PWD"); if (p && *p == '/') chdir(p); }
