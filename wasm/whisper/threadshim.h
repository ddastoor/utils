/* Force-included into whisper.cpp / ggml C++ sources. zig's libc++ for single-threaded wasm32-wasi is built without
 * threads and without file streams. Threads: std::mutex and std::thread do not exist. With one thread a mutex has nothing to exclude, and a
 * "thread" can run its work at once: whisper.cpp starts workers on disjoint ranges and joins them right after. */
#pragma once
#ifdef __cplusplus
#include <__config>
#if !_LIBCPP_HAS_THREADS
#include <functional>
#include <utility>
namespace std {
struct mutex {
  constexpr mutex() noexcept = default;
  mutex(const mutex &) = delete;
  mutex &operator=(const mutex &) = delete;
  void lock() {}
  bool try_lock() { return true; }
  void unlock() {}
};
class thread {
 public:
  thread() noexcept = default;
  template <class F, class... A> explicit thread(F &&f, A &&...a) { std::invoke(std::forward<F>(f), std::forward<A>(a)...); }
  bool joinable() const noexcept { return false; }
  void join() {}
  void detach() {}
  static unsigned hardware_concurrency() noexcept { return 1; }
};
}  // namespace std
#endif

/* File streams: whisper.cpp opens model files with std::ifstream (we load from memory instead) and may dump debug data
 * with std::ofstream. Minimal FILE*-based versions: in the browser opening fails, which whisper.cpp already handles. */
#if !(_LIBCPP_HAS_FILESYSTEM && _LIBCPP_HAS_LOCALIZATION)
#include <cstdio>
#include <ios>
#include <string>
namespace std {
template <> class basic_ifstream<char> {
  FILE *f_ = nullptr;
  bool eof_ = false, fail_ = true;
 public:
  basic_ifstream() = default;
  explicit basic_ifstream(const char *p, ios_base::openmode = ios_base::in) : f_(fopen(p, "rb")), fail_(!f_) {}
  explicit basic_ifstream(const string &p, ios_base::openmode m = ios_base::in) : basic_ifstream(p.c_str(), m) {}
  basic_ifstream(basic_ifstream &&o) noexcept : f_(o.f_), eof_(o.eof_), fail_(o.fail_) { o.f_ = nullptr; }
  ~basic_ifstream() { close(); }
  bool is_open() const { return f_ != nullptr; }
  explicit operator bool() const { return f_ && !fail_; }
  bool operator!() const { return !f_ || fail_; }
  basic_ifstream &read(char *s, streamsize n) { size_t r = f_ ? fread(s, 1, (size_t)n, f_) : 0; if ((streamsize)r < n) eof_ = fail_ = true; return *this; }
  bool eof() const { return eof_; }
  void close() { if (f_) { fclose(f_); f_ = nullptr; } }
};
template <> class basic_ofstream<char> {
  FILE *f_ = nullptr;
 public:
  explicit basic_ofstream(const char *p, ios_base::openmode = ios_base::out) : f_(fopen(p, "wb")) {}
  ~basic_ofstream() { close(); }
  bool is_open() const { return f_ != nullptr; }
  basic_ofstream &operator<<(const char *s) { if (f_) fputs(s, f_); return *this; }
  basic_ofstream &operator<<(double v) { if (f_) fprintf(f_, "%g", v); return *this; }
  void close() { if (f_) { fclose(f_); f_ = nullptr; } }
};
}  // namespace std
#endif
#endif

