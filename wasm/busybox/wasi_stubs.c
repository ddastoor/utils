/* Run-time side of compat.h: POSIX calls WASI preview 1 cannot provide. Process/socket calls fail with ENOSYS;
 * identity calls describe a single user (root); temp files are created in the shared in-memory filesystem. */
#include <errno.h>
#include <stdio.h>
#include <sys/resource.h>
#include <fcntl.h>
#include <stdarg.h>
#include <string.h>
#include <sys/stat.h>
#include <stdlib.h>
#include <unistd.h>

#define NOSYS(ret) { errno = ENOSYS; return ret; }
__attribute__((import_module("supertools"), import_name("ncpu"))) int st_host_ncpu(void);
void tzset(void) {} /* times are UTC unless TZ is a plain offset; wasi-libc has no zoneinfo */
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

/* ---- running other programs (browser shim). The terminal host runs the program to completion as another BusyBox
   instance on the same in-memory filesystem and returns its exit status:
     spawn(argv)  → fake pid whose status waitpid() reports (xargs, find -exec, flock…)
     exec*(argv)  → run, then exit with its status (env CMD, nice, nohup…) — same observable behaviour as exec */
__attribute__((import_module("supertools"), import_name("spawn")))
int st_host_spawn(char *const *argv, int argc, char *const *envp, int inherit_stdin);
extern char **environ;
static int argc_of(char *const *a) { int n = 0; while (a[n]) n++; return n; }
#define MAXKIDS 64
static struct { pid_t pid; int status; } kids[MAXKIDS];
static pid_t next_pid = 1000;
pid_t bb_wasi_spawn(char **argv) {
	fflush(NULL);
	int code = st_host_spawn(argv, argc_of(argv), environ, 0);
	for (int i = 0; i < MAXKIDS; i++) if (!kids[i].pid) { kids[i].pid = ++next_pid; kids[i].status = (code & 0xff) << 8; return kids[i].pid; }
	errno = EAGAIN; return -1;
}
static _Noreturn void run_and_exit(char *const *argv, char *const *envp) {
	fflush(NULL);
	_exit(st_host_spawn(argv, argc_of(argv), envp ? envp : environ, 1));
}
int execv(const char *p, char *const a[]) { (void)p; run_and_exit(a, NULL); }
int execve(const char *p, char *const a[], char *const e[]) { (void)p; run_and_exit(a, e); }
int execvp(const char *p, char *const a[]) { (void)p; run_and_exit(a, NULL); }
int execlp(const char *p, const char *a, ...) {
	char *argv[256]; int n = 0; va_list ap; va_start(ap, a); argv[n++] = (char *)a;
	while (n < 255 && (argv[n] = va_arg(ap, char *))) n++;
	argv[n] = NULL; va_end(ap); (void)p; run_and_exit(argv, NULL);
}
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
int sched_getaffinity(pid_t p, size_t n, void *m) { (void)p; memset(m, 0, n); int c = st_host_ncpu(); if (c < 1) c = 1; for (int i = 0; i < c && i < (int)n * 8; i++) ((unsigned char *)m)[i / 8] |= 1u << (i % 8); return 0; }

/* children spawned above have already finished: report their recorded status */
pid_t waitpid(pid_t p, int *s, int o) {
	(void)o;
	for (int i = 0; i < MAXKIDS; i++) if (kids[i].pid && (p == -1 || kids[i].pid == p)) { pid_t r = kids[i].pid; if (s) *s = kids[i].status; kids[i].pid = 0; return r; }
	errno = ECHILD; return -1;
}
pid_t wait(int *s) { return waitpid(-1, s, 0); }

/* ---- identity / host info shims */
char *getlogin(void) { static char u[] = "user"; return u; }
int getlogin_r(char *b, size_t n) { if (n < 5) return ERANGE; strcpy(b, "user"); return 0; }
int gethostname(char *b, size_t n) { const char h[] = "superutils"; if (n < sizeof h) { errno = ENAMETOOLONG; return -1; } memcpy(b, h, sizeof h); return 0; }
int sethostname(const char *b, size_t n) { (void)b; (void)n; errno = EPERM; return -1; }
int setpriority(int w, id_t who, int prio) { (void)w; (void)who; (void)prio; return 0; }
int getpriority(int w, id_t who) { (void)w; (void)who; errno = 0; return 0; }
void sync(void) {}
int flock(int fd, int op) { (void)fd; (void)op; return 0; } /* one user, no concurrent processes: locks always succeed */

/* Each command is a fresh WASI instance; the terminal passes the shell's working directory as $PWD. */
__attribute__((constructor)) static void bb_init_cwd(void) { const char *p = getenv("PWD"); if (p && *p == '/') chdir(p); }

/* ---- terminal control (no tty in the browser; password prompts read the line from stdin) */
struct termios;
int tcgetattr(int fd, struct termios *t) { (void)fd; (void)t; errno = ENOTTY; return -1; }
int tcsetattr(int fd, int act, const struct termios *t) { (void)fd; (void)act; (void)t; errno = ENOTTY; return -1; }
int tcflush(int fd, int q) { (void)fd; (void)q; return 0; }
/* ---- name resolution (no network) */
static int h_err;
int *__h_errno_location(void) { return &h_err; }
const char *hstrerror(int e) { (void)e; return "Name resolution is not available in the browser"; }
struct hostent *gethostbyname(const char *n) { (void)n; h_err = 1; return NULL; }

/* ---- uname, chmod (no-op), realpath */
#include <sys/utsname.h>
#include <limits.h>
int bb_uname(struct utsname *u) {
	memset(u, 0, sizeof *u);
	strcpy(u->sysname, "Linux"); strcpy(u->nodename, "superutils"); strcpy(u->release, "6.0-wasm");
	strcpy(u->version, "#1 SuperUtils BusyBox in WebAssembly"); strcpy(u->machine, "wasm32");
	return 0;
}
int bb_chmod(const char *p, mode_t m) { (void)m; struct stat st; return bb_stat(p, &st); }
int bb_fchmod(int fd, mode_t m) { (void)m; struct stat st; return bb_fstat(fd, &st); }
int bb_fchmodat(int d, const char *p, mode_t m, int f) { (void)d; (void)f; return bb_chmod(p, m); }
int bb_lchmod(const char *p, mode_t m) { (void)m; struct stat st; return bb_lstat(p, &st); }
char *bb_realpath(const char *path, char *resolved) {
	char buf[PATH_MAX * 2], out[PATH_MAX], link[PATH_MAX];
	int loops = 0;
	if (!path || !*path) { errno = path ? ENOENT : EINVAL; return NULL; }
	if (path[0] == '/') { strncpy(buf, path, sizeof buf - 1); buf[sizeof buf - 1] = 0; }
	else { if (!getcwd(buf, PATH_MAX)) return NULL; size_t n = strlen(buf); snprintf(buf + n, sizeof buf - n, "/%s", path); }
restart:
	out[0] = 0;
	for (char *p = buf; *p;) {
		while (*p == '/') p++;
		if (!*p) break;
		char *e = strchr(p, '/'); size_t len = e ? (size_t)(e - p) : strlen(p);
		if (len == 1 && p[0] == '.') { p += len; continue; }
		if (len == 2 && p[0] == '.' && p[1] == '.') { char *s = strrchr(out, '/'); if (s) *s = 0; p += len; continue; }
		size_t ol = strlen(out);
		if (ol + 1 + len >= PATH_MAX) { errno = ENAMETOOLONG; return NULL; }
		out[ol] = '/'; memcpy(out + ol + 1, p, len); out[ol + 1 + len] = 0;
		p += len;
		ssize_t n = readlink(out, link, sizeof link - 1);
		if (n >= 0) {
			if (++loops > 40) { errno = ELOOP; return NULL; }
			link[n] = 0;
			char rest[PATH_MAX * 2]; snprintf(rest, sizeof rest, "%s", p);
			if (link[0] == '/') snprintf(buf, sizeof buf, "%s%s", link, rest);
			else { out[ol] = 0; snprintf(buf, sizeof buf, "%s/%s%s", out, link, rest); }
			goto restart;
		}
		if (errno != EINVAL) return NULL; /* missing component (ENOENT) etc. */
	}
	if (!out[0]) strcpy(out, "/");
	if (!resolved) return strdup(out);
	strcpy(resolved, out);
	return resolved;
}

/* ---- permission bits for stat results (see compat.h) */
#undef stat
#undef lstat
#undef fstat
#undef fstatat
static int perms(int r, struct stat *b) {
	if (r == 0) {
		mode_t t = b->st_mode & S_IFMT;
		b->st_mode = t | (t == S_IFDIR ? 0755 : t == S_IFLNK ? 0777 : t == S_IFCHR ? 0666 : 0644);
		b->st_uid = 0; b->st_gid = 0;
		if (!b->st_blocks) b->st_blocks = (b->st_size + 511) / 512;
		if (!b->st_blksize) b->st_blksize = 4096;
	}
	return r;
}
int bb_stat(const char *p, struct stat *b) { return perms(stat(p, b), b); }
int bb_lstat(const char *p, struct stat *b) { return perms(lstat(p, b), b); }
int bb_fstat(int f, struct stat *b) { return perms(fstat(f, b), b); }
int bb_fstatat(int d, const char *p, struct stat *b, int fl) { return perms(fstatat(d, p, b, fl), b); }
