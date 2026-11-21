#!/usr/bin/env python3
"""prepare.py OUT — the Java sources of java-regex.wasm (wasm/javaregex/build.sh), in OUT/src/main/java:

  * OpenJDK's own java.util.regex (Pattern, Matcher, …) and jdk.internal.util.regex.Grapheme, from the JDK's src.zip
    (apt install openjdk-21-source), under the package ojdk.util.regex / ojdk.internal.regex — TeaVM brings its own
    java.util.regex (Apache Harmony's: other messages, other answers), so the JDK's must not carry that name;
  * the JDK's java.lang.Character with its Unicode data (CharacterData00 … and CharacterName) as ojdk.lang, so that
    every \\p{…}, case folding and \\N{…} answers from the JDK's Unicode 15.0 tables, not TeaVM's;
  * superutils/: our glue (RegexRun, Main, Norm, Support) and three generated classes — Version, UniNameData (the
    JDK's uniName.dat, which \\N{name} reads, in string constants: TeaVM loads no resources) and CombiningClass (the
    JDK's canonical combining classes, for CANON_EQ).

Every change to OpenJDK's code is an exact replacement that must apply (PATCHES): a JDK whose code moved stops the
build here instead of compiling something else. Licence of the OpenJDK files: GPL-2.0 with the Classpath Exception.
"""
import os
import re
import subprocess
import sys
import tempfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
JDK = os.environ.get('JDK_HOME', '/usr/lib/jvm/java-21-openjdk-amd64')
SRC_ZIP = os.path.join(JDK, 'lib', 'src.zip')

REGEX = ['ASCII', 'CharPredicates', 'IntHashSet', 'MatchResult', 'Matcher', 'Pattern', 'PatternSyntaxException']
LANG = ['Character', 'CharacterData', 'CharacterData00', 'CharacterData01', 'CharacterData02', 'CharacterData03',
        'CharacterData0E', 'CharacterDataLatin1', 'CharacterDataPrivateUse', 'CharacterDataUndefined', 'CharacterName']

# (file, old, new): exact replacements, each must apply once (count=None: every occurrence, at least one)
PATCHES = [
    # --- the regex package: our Character, the browser's normalizer, our ArraysSupport
    ('Pattern', 'import java.text.Normalizer;\nimport java.text.Normalizer.Form;\n', ''),
    ('Pattern', 'import jdk.internal.util.ArraysSupport;\nimport jdk.internal.util.regex.Grapheme;\n',
     'import ojdk.internal.regex.Grapheme;\n'),
    ('Pattern', 'Normalizer.normalize(seq, Normalizer.Form.NFD)', 'superutils.Norm.normalize(seq, "NFD")'),
    ('Pattern', 'Normalizer.normalize(seq, Normalizer.Form.NFC)', 'superutils.Norm.normalize(seq, "NFC")'),
    ('Pattern', 'Normalizer.normalize(src.substring(off, limit), Form.NFC)', 'superutils.Norm.normalize(src.substring(off, limit), "NFC")'),
    ('Pattern', 'sun.text.Normalizer.getCombiningClass(c)', 'superutils.CombiningClass.of(c)'),
    ('Pattern', 'Normalizer.normalize(firstTwoCharacters, Normalizer.Form.NFC)', 'superutils.Norm.normalize(firstTwoCharacters, "NFC")'),
    ('Pattern', 'Normalizer.normalize(\n                            seq.toString().substring(i, j), Normalizer.Form.NFC)',
     'superutils.Norm.normalize(\n                            seq.toString().substring(i, j), "NFC")'),
    ('Pattern', 'ArraysSupport.newLength(', 'superutils.Support.newLength('),
    # TeaVM 0.16's immutable map (Map.copyOf → TemplateCollections.NEtriesMap) takes a remainder by its size in get():
    # an empty one — a pattern without names, asked for ${x} — traps ("remainder by zero") instead of answering null
    ('Pattern', '        return Map.copyOf(namedGroupsMap());',
     '        return java.util.Collections.unmodifiableMap(new HashMap<>(namedGroupsMap()));'),
    # --- java.lang.Character as a plain class of ours: no VM intrinsics, no CDS archive, no constant descriptors
    ('Character', 'import jdk.internal.misc.CDS;\nimport jdk.internal.vm.annotation.IntrinsicCandidate;\nimport jdk.internal.vm.annotation.Stable;\n', ''),
    ('Character', 'import java.lang.constant.Constable;\nimport java.lang.constant.DynamicConstantDesc;\n', ''),
    ('Character', 'import static java.lang.constant.ConstantDescs.BSM_EXPLICIT_CAST;\nimport static java.lang.constant.ConstantDescs.CD_char;\nimport static java.lang.constant.ConstantDescs.DEFAULT_NAME;\n', ''),
    ('Character', '@jdk.internal.ValueBased\n', ''),
    ('Character', 'class Character implements java.io.Serializable, Comparable<Character>, Constable {',
     'class Character implements java.io.Serializable, Comparable<Character> {'),
    ('Character', '    @Override\n    public Optional<DynamicConstantDesc<Character>> describeConstable() {\n        return Optional.of(DynamicConstantDesc.ofNamed(BSM_EXPLICIT_CAST, DEFAULT_NAME, CD_char, (int) value));\n    }\n', ''),
    ('Character', '        @Stable\n        static final Character[] cache;', '        static final Character[] cache;'),
    ('Character', '            CDS.initializeFromArchive(CharacterCache.class);\n', ''),
    ('Character', 'return String.valueOfCodePoint(codePoint);', 'return String.valueOf(toChars(codePoint));'),
    ('Character', '    @IntrinsicCandidate\n', '', None),
    ('Character', 'public static final Class<Character> TYPE = (Class<Character>) Class.getPrimitiveClass("char");',
     'public static final Class<Character> TYPE = (Class<Character>) (Class<?>) char.class;'),
    ('CharacterDataLatin1', 'import jdk.internal.vm.annotation.IntrinsicCandidate;\n', ''),
    ('CharacterDataLatin1', '    @IntrinsicCandidate\n', '', None),
    # --- CharacterName reads the JDK's uniName.dat from our string constants (TeaVM has no class-path resources)
    ('CharacterName', 'import java.security.AccessController;\nimport java.security.PrivilegedAction;\n', ''),
    ('CharacterName', 'import jdk.internal.util.ArraysSupport;\n', ''),
    ('CharacterName', '''        try (@SuppressWarnings("removal") DataInputStream dis = new DataInputStream(new InflaterInputStream(
            AccessController.doPrivileged(new PrivilegedAction<>() {
                public InputStream run() {
                    return getClass().getResourceAsStream("uniName.dat");
                }
            })))) {''', '''        try (DataInputStream dis = new DataInputStream(new InflaterInputStream(superutils.UniNameData.open()))) {'''),
    ('CharacterName', 'ArraysSupport.vectorizedHashCode(a, off, len, 1, ArraysSupport.T_BYTE)', 'superutils.Support.hashBytes(a, off, len, 1)'),
    ('CharacterName', 'name.getBytes(sun.nio.cs.ISO_8859_1.INSTANCE)', 'name.getBytes(java.nio.charset.StandardCharsets.ISO_8859_1)'),
    ('CharacterName', 'String result = new String(strPool, 0, off >>> 8, off & 0xff);  // ASCII',
     'String result = new String(strPool, off >>> 8, off & 0xff, java.nio.charset.StandardCharsets.ISO_8859_1);  // ASCII'),
]


def patch(name, src):
    for p in PATCHES:
        f, old, new = p[0], p[1], p[2]
        if f != name:
            continue
        every = len(p) > 3 and p[3] is None
        n = src.count(old)
        if n == 0 or (n > 1 and not every):
            sys.exit(f'prepare.py: the patch of {name}.java does not apply ({n} places): {old[:80]!r}')
        src = src.replace(old, new) if every else src.replace(old, new, 1)
    return src


def java_string(b):
    """A Java string literal holding the bytes as chars 0 … 255: octal escapes (\\uXXXX would not do — Java turns those
    into characters before it reads the source, so \\u000a would end the line inside the string)."""
    out = []
    for x in b:
        c = chr(x)
        if c == '"' or c == '\\':
            out.append('\\' + c)
        elif 0x20 <= x < 0x7f:
            out.append(c)
        else:
            out.append(f'\\{x:03o}')
    return '"' + ''.join(out) + '"'


def main():
    out = sys.argv[1]
    root = os.path.join(out, 'src', 'main', 'java')
    z = zipfile.ZipFile(SRC_ZIP)

    def write(rel, text):
        p = os.path.join(root, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'w', encoding='utf-8') as fh:
            fh.write(text)

    for n in REGEX:
        s = z.read(f'java.base/java/util/regex/{n}.java').decode('utf-8')
        s = patch(n, s)
        s = s.replace('package java.util.regex;', 'package ojdk.util.regex;\n\nimport ojdk.lang.Character;', 1)
        s = s.replace('java.util.regex.', 'ojdk.util.regex.')
        write(f'ojdk/util/regex/{n}.java', s)
    s = z.read('java.base/jdk/internal/util/regex/Grapheme.java').decode('utf-8')
    s = s.replace('package jdk.internal.util.regex;', 'package ojdk.internal.regex;\n\nimport ojdk.lang.Character;', 1)
    write('ojdk/internal/regex/Grapheme.java', s)
    for n in LANG:
        s = z.read(f'java.base/java/lang/{n}.java').decode('utf-8')
        s = patch(n, s)
        assert s.count('package java.lang;') == 1, n
        s = s.replace('package java.lang;', 'package ojdk.lang;', 1)
        write(f'ojdk/lang/{n}.java', s)

    # our glue: RegexRun on the renamed package
    for n in ('RegexRun', 'Main', 'Norm', 'Support'):
        s = open(os.path.join(HERE, 'java', 'superutils', f'{n}.java'), encoding='utf-8').read()
        if n == 'RegexRun':
            s = s.replace('import java.util.regex.', 'import ojdk.util.regex.')
        write(f'superutils/{n}.java', s)

    # the JDK's version
    rel = open(os.path.join(JDK, 'release'), encoding='utf-8').read()
    version = re.search(r'^JAVA_VERSION="([^"]+)"', rel, re.M).group(1)
    write('superutils/Version.java', 'package superutils;\n\n/** Made by prepare.py. */\npublic final class Version {\n'
          f'    private Version() {{}}\n\n    public static final String JDK = "{version}";\n}}\n')

    # uniName.dat (the JDK's Unicode names) in string constants of at most 32,000 bytes
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([os.path.join(JDK, 'bin', 'jimage'), 'extract', '--dir', tmp, '--include', r'regex:.*/uniName\.dat',
                        os.path.join(JDK, 'lib', 'modules')], check=True)
        data = open(os.path.join(tmp, 'java.base', 'java', 'lang', 'uniName.dat'), 'rb').read()
    parts = [data[i:i + 32000] for i in range(0, len(data), 32000)]
    write('superutils/UniNameData.java', 'package superutils;\n\nimport java.io.ByteArrayInputStream;\nimport java.io.InputStream;\n\n'
          f'/** Made by prepare.py: the JDK\'s java/lang/uniName.dat ({len(data)} bytes), which Character.codePointOf (\\\\N{{name}})\n'
          ' *  reads; in string constants, one char a byte, because TeaVM loads no class-path resources. */\n'
          'public final class UniNameData {\n    private UniNameData() {}\n\n'
          + ''.join(f'    private static final String P{i} = {java_string(b)};\n' for i, b in enumerate(parts))
          + f'\n    public static InputStream open() {{\n        String[] parts = {{ {", ".join(f"P{i}" for i in range(len(parts)))} }};\n'
          f'        byte[] b = new byte[{len(data)}];\n        int k = 0;\n'
          '        for (String p : parts) for (int i = 0; i < p.length(); i++) b[k++] = (byte) p.charAt(i);\n'
          '        return new ByteArrayInputStream(b);\n    }\n}\n')

    # the canonical combining classes of the JDK's normalizer
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([os.path.join(JDK, 'bin', 'javac'), '--add-exports', 'java.base/sun.text=ALL-UNNAMED', '-d', tmp,
                        os.path.join(HERE, 'java', 'superutils', 'Dump.java')], check=True)
        rows = subprocess.run([os.path.join(JDK, 'bin', 'java'), '--add-exports', 'java.base/sun.text=ALL-UNNAMED', '-cp', tmp,
                               'superutils.Dump'], check=True, capture_output=True, text=True).stdout.split()
    nums = ', '.join(rows)
    write('superutils/CombiningClass.java', 'package superutils;\n\n'
          '/** Made by prepare.py from the JDK\'s sun.text.Normalizer.getCombiningClass: runs of one non-zero canonical\n'
          ' *  combining class as (first, last, class), for OpenJDK\'s Pattern with CANON_EQ. */\n'
          'public final class CombiningClass {\n    private CombiningClass() {}\n\n'
          f'    private static final int[] RUNS = {{ {nums} }};\n\n'
          '    public static int of(int c) {\n        int lo = 0, hi = RUNS.length / 3 - 1;\n'
          '        while (lo <= hi) {\n            int m = (lo + hi) >>> 1;\n'
          '            if (c < RUNS[3 * m]) hi = m - 1;\n            else if (c > RUNS[3 * m + 1]) lo = m + 1;\n'
          '            else return RUNS[3 * m + 2];\n        }\n        return 0;\n    }\n}\n')
    print(f'prepare.py: OpenJDK {version}: {len(REGEX) + 1 + len(LANG)} files, uniName.dat {len(data)} bytes in '
          f'{len(parts)} strings, {len(rows) // 3} runs of combining classes')


if __name__ == '__main__':
    main()
