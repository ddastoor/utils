/* Pre-included into every BusyBox C source for the wasm32-wasi build (SuperTools Linux Terminal).
 * WASI preview 1 offers files, clocks and randomness but no processes, signals, users or sockets. These
 * declarations let the filesystem/stdio applets compile; the functions are implemented in wasi_stubs.c and fail
 * cleanly (ENOSYS) or act as a single-user system (uid 0, umask 022). */
#pragma once
#include <signal.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/ioctl.h>
#include <sys/resource.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <time.h>

/* ---- signals (WASI's emulated signal.h has raise/signal only) */
#ifndef SA_RESTART
typedef struct { int si_signo, si_errno, si_code, si_pid, si_uid, si_status; } siginfo_t;
struct sigaction {
	union { void (*sa_handler)(int); void (*sa_sigaction)(int, siginfo_t *, void *); } __sa_handler;
	sigset_t sa_mask;
	int sa_flags;
	void (*sa_restorer)(void);
};
#define sa_handler   __sa_handler.sa_handler
#define sa_sigaction __sa_handler.sa_sigaction
#define SA_NOCLDSTOP 1
#define SA_NOCLDWAIT 2
#define SA_SIGINFO   4
#define SA_RESTART   0x10000000
#define SA_NODEFER   0x40000000
#define SA_RESETHAND 0x80000000
#define SIG_BLOCK   0
#define SIG_UNBLOCK 1
#define SIG_SETMASK 2
int sigaction(int, const struct sigaction *, struct sigaction *);
int sigemptyset(sigset_t *);
int sigfillset(sigset_t *);
int sigaddset(sigset_t *, int);
int sigdelset(sigset_t *, int);
int sigismember(const sigset_t *, int);
int sigprocmask(int, const sigset_t *, sigset_t *);
int sigsuspend(const sigset_t *);
int kill(pid_t, int);
#endif

/* ---- processes (spawn/exec run another BusyBox instance via the terminal host; see wasi_stubs.c) */
pid_t bb_wasi_spawn(char **argv);
char *getlogin(void);
int getlogin_r(char *, size_t);
int gethostname(char *, size_t);
int sethostname(const char *, size_t);
int setpriority(int, id_t, int);
int getpriority(int, id_t);
void sync(void);
int flock(int, int);
#ifndef LOCK_SH
#define LOCK_SH 1
#define LOCK_EX 2
#define LOCK_NB 4
#define LOCK_UN 8
#endif
#ifndef PRIO_PROCESS
#define PRIO_PROCESS 0
#define PRIO_PGRP 1
#define PRIO_USER 2
#endif
pid_t fork(void);
pid_t vfork(void);
int execv(const char *, char *const[]);
int execve(const char *, char *const[], char *const[]);
int execvp(const char *, char *const[]);
int execlp(const char *, const char *, ...);
pid_t getppid(void);
pid_t setsid(void);
int pipe(int[2]);
int dup(int);
int dup2(int, int);
unsigned alarm(unsigned);
pid_t wait(int *);
pid_t waitpid(pid_t, int *, int);
FILE *popen(const char *, const char *);
int pclose(FILE *);
#ifndef F_DUPFD
#define F_DUPFD 0
#endif

/* ---- users and permissions (a single user, root) */
uid_t getuid(void);
uid_t geteuid(void);
gid_t getgid(void);
gid_t getegid(void);
int setuid(uid_t);
int seteuid(uid_t);
int setgid(gid_t);
int setegid(gid_t);
int getgroups(int, gid_t[]);
mode_t umask(mode_t);
int chown(const char *, uid_t, gid_t);
int fchown(int, uid_t, gid_t);
int lchown(const char *, uid_t, gid_t);
int mknod(const char *, mode_t, dev_t);
int chroot(const char *);
int fchdir(int);
int ttyname_r(int, char *, size_t);

/* ---- temp files */
int mkstemp(char *);
char *mkdtemp(char *);
char *mktemp(char *);

/* ---- resource limits */
#ifndef RLIMIT_CORE
typedef unsigned long long rlim_t;
struct rlimit { rlim_t rlim_cur, rlim_max; };
#define RLIMIT_CPU 0
#define RLIMIT_FSIZE 1
#define RLIMIT_DATA 2
#define RLIMIT_STACK 3
#define RLIMIT_CORE 4
#define RLIMIT_NOFILE 7
#define RLIM_INFINITY (~0ULL)
int getrlimit(int, struct rlimit *);
int setrlimit(int, const struct rlimit *);
#endif

/* ---- clocks */
void tzset(void);
int settimeofday(const void *, const void *);
int clock_settime(clockid_t, const struct timespec *);

/* ---- sockets (none) */
#ifndef SOCK_RAW
#define SOCK_RAW 3
#endif
#ifndef SOCK_RDM
#define SOCK_RDM 4
#endif
#ifndef SOCK_SEQPACKET
#define SOCK_SEQPACKET 5
#endif
#define sockaddr_un bb_sockaddr_un
struct bb_sockaddr_un { sa_family_t sun_family; char sun_path[108]; };
#ifndef SO_REUSEADDR
#define SO_REUSEADDR 2
#define SO_KEEPALIVE 9
#define SO_BROADCAST 6
#endif
int socket(int, int, int);
int bind(int, const struct sockaddr *, socklen_t);
int connect(int, const struct sockaddr *, socklen_t);
int listen(int, int);
ssize_t sendto(int, const void *, size_t, int, const struct sockaddr *, socklen_t);
int setsockopt(int, int, int, const void *, socklen_t);
int getsockname(int, struct sockaddr *, socklen_t *);
int getpeername(int, struct sockaddr *, socklen_t *);
struct in_addr;
char *inet_ntoa(struct in_addr);

/* ---- terminals */
#ifndef TIOCGWINSZ
#define TIOCGWINSZ 0x5413
#endif
#ifndef __DEFINED_struct_winsize
struct winsize { unsigned short ws_row, ws_col, ws_xpixel, ws_ypixel; };
#define __DEFINED_struct_winsize
#endif

/* ---- CPU affinity (nproc) */
int sched_getaffinity(pid_t, size_t, void *);

/* ---- functions whose WASI libc versions are missing or wrong for us: renamed to our implementations */
#include <sys/utsname.h>
#include <sys/stat.h>
#define uname bb_uname       /* sysname/nodename/machine describing the browser terminal */
int bb_uname(struct utsname *);
#define chmod bb_chmod       /* permissions are not stored by the in-browser filesystem: accepted, no effect */
#define fchmod bb_fchmod
#define fchmodat bb_fchmodat
#define lchmod bb_lchmod
int bb_chmod(const char *, mode_t);
int bb_fchmod(int, mode_t);
int bb_fchmodat(int, const char *, mode_t, int);
int bb_lchmod(const char *, mode_t);
#define realpath bb_realpath /* wasi-libc's realpath mishandles ".." after the cwd */
char *bb_realpath(const char *, char *);
