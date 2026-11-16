/* zig's libc++ for wasm32-wasi has no file streams. Graphviz's VPSC solver only uses std::ofstream for its debug log
 * (LOGFILE); here it is a stream that writes nothing. */
#pragma once
#ifdef __cplusplus
#include <__config>
#if !(_LIBCPP_HAS_FILESYSTEM && _LIBCPP_HAS_LOCALIZATION)
#include <ios>
namespace std {
template <> class basic_ofstream<char> {
 public:
  explicit basic_ofstream(const char *, ios_base::openmode = ios_base::out) {}
  template <class T> basic_ofstream &operator<<(const T &) { return *this; }
  basic_ofstream &operator<<(basic_ofstream &(*)(basic_ofstream &)) { return *this; }
  void close() {}
};
}  // namespace std
#endif
#endif
