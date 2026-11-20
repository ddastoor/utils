#!/usr/bin/env python3
"""Reference for the Morse Code tab → tests/fixtures/morse/reference.json.

The code table and the lengths of dots, dashes and gaps are read out of libcw, the library of unixcw — the Morse
program of Linux radio amateurs (GPL; only what it answers is recorded here: the international Morse alphabet and
numbers).

    sudo apt install cw        (brings libcw.so.7)
    python3 scripts/make-morse-reference.py
"""
import ctypes, json, os, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
lib = ctypes.CDLL('libcw.so.7')
lib.cw_character_to_representation.restype = ctypes.c_void_p
lib.cw_character_to_representation.argtypes = [ctypes.c_int]
lib.cw_representation_to_character.restype = ctypes.c_int
lib.cw_representation_to_character.argtypes = [ctypes.c_char_p]
lib.cw_get_character_count.restype = ctypes.c_int
lib.cw_generator_new.argtypes = [ctypes.c_int, ctypes.c_char_p]

n = lib.cw_get_character_count()
buf = ctypes.create_string_buffer(n + 1)
lib.cw_list_characters(buf)
table = {}
for b in buf.raw[:n]:
    code = ctypes.string_at(lib.cw_character_to_representation(b)).decode()
    assert lib.cw_representation_to_character(code.encode()) & 0xff == b, (b, code)   # and back (a signed char above 127)
    table[bytes([b]).decode('latin-1')] = code

# lengths in microseconds at a speed in words a minute: dot, dash, the gap after every dot or dash, and what is added
# to that gap after a letter
timing = {}
assert lib.cw_generator_new(1, None) == 1   # 1 = no sound device
for wpm in (5, 8, 10, 12, 15, 18, 20, 25, 30, 40):
    assert lib.cw_set_send_speed(wpm) == 1
    v = [ctypes.c_int() for _ in range(7)]
    lib.cw_get_send_parameters(*[ctypes.byref(x) for x in v])
    timing[str(wpm)] = [x.value for x in v[:4]]
lib.cw_generator_delete()

version = subprocess.run(['dpkg-query', '-W', '-f', '${Version}', 'cw'], capture_output=True, text=True).stdout or '?'
ref = {'_source': f'unixcw (package cw {version}), libcw.so.7', 'table': table, 'timing': timing}
path = os.path.join(ROOT, 'tests', 'fixtures', 'morse', 'reference.json')
with open(path, 'w', encoding='utf8') as f: json.dump(ref, f, ensure_ascii=False, indent=1); f.write('\n')
print(f"{len(table)} characters, {len(timing)} speeds from {ref['_source']}")
