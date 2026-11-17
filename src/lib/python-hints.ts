// Python Scratchpad: one plain sentence for the errors that have a cause particular to this tab (a module that is
// not in the build, input that ran out, memory, threads, nesting depth). No DOM here — unit-tested against the build
// (tests/unit/python.test.mjs checks that ABSENT lists exactly the standard-library modules that do not import).

/** Standard-library modules that cannot be imported in this build → why. */
export const ABSENT: Record<string, string> = Object.fromEntries(([
  ['its C library (SQLite, bzip2, xz, zstd, libffi, ncurses, readline) is not part of this build', 'sqlite3 bz2 lzma ctypes curses readline'],
  ['it needs network connections, and a browser tab gives Python none', 'ssl'],
  ['it needs a desktop window, which Python has no access to here', 'tkinter turtle turtledemo idlelib'],
  ['it needs a Unix system underneath, and here Python runs on WebAssembly', 'fcntl termios tty pty pwd grp resource syslog mmap'],
  ['it is for Windows only', 'msvcrt nt winreg winsound'],
  ['packages cannot be installed in this tab', 'venv ensurepip'],
] as Array<[string, string]>).flatMap(([why, names]) => names.split(' ').map((n) => [n, why])));

/** A hint for what the program wrote to stderr (its last lines are enough), or '' when Python's own words will do. */
export function hint(stderr: string): string {
  const lines = stderr.trimEnd().split('\n'), last = lines[lines.length - 1] || '';
  let m = /^ModuleNotFoundError: No module named '([^']+)'/.exec(last);
  if (m) {
    const top = m[1].replace(/^_/, '').split('.')[0], full = m[1];
    const known = ABSENT[top] || (full === '_zstd' || full === 'compression.zstd' ? ABSENT.bz2 : full === '_interpreters' || full === '_multiprocessing' || full === '_remote_debugging' || full === '_posixsubprocess' ? 'it needs more than one thread or process, and a tab runs Python on one' : '');
    if (known) return `That module is part of Python, but it cannot be used here: ${known}.`;
    const mod = full.split('.')[0];
    return `“${mod}” is not part of Python's standard library, and this tab cannot install packages (no pip). A module of your own must be added under “Files for the program” as ${mod}.py.`;
  }
  if (/^EOFError: EOF when reading a line/.test(last)) return 'The program asked for more input than the Input box holds — give it one line for every input().';
  if (/^MemoryError/.test(last)) return 'The program needed more memory than a browser tab can give Python (about 2 GB).';
  if (/^RuntimeError: can't start new thread/.test(last)) return 'Threads cannot start here: in a browser tab Python runs on one thread. asyncio works.';
  if (/^RecursionError: Stack overflow/.test(last)) return 'Calls were nested more deeply than a browser tab allows. Recursion in plain Python can go deeper (sys.setrecursionlimit); recursion that passes through built-in functions such as sorted, repr, json or lru_cache stops at a few hundred levels here.';
  m = /^(?:OSError|PermissionError|NotImplementedError|AttributeError): .*(wasi does not support processes|module 'os' has no attribute '(?:system|fork|popen|exec\w*|spawn\w*|kill)')/.exec(last);
  if (m) return 'Python cannot start other programs here: a browser tab has no operating system to run them.';
  return '';
}
