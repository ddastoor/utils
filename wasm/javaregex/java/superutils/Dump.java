package superutils;

/**
 * Run natively by prepare.py (java --add-exports java.base/sun.text=ALL-UNNAMED): the canonical combining class of
 * every code point from the JDK's own normalizer, as "first last class" lines for each run of one non-zero class —
 * the table of the WebAssembly build's CombiningClass (CANON_EQ).
 */
public final class Dump {
    private Dump() {}

    public static void main(String[] args) {
        StringBuilder sb = new StringBuilder();
        int start = -1, cls = 0;
        for (int c = 0; c <= Character.MAX_CODE_POINT + 1; c++) {
            int k = c <= Character.MAX_CODE_POINT ? sun.text.Normalizer.getCombiningClass(c) : 0;
            if (k != cls) {
                if (cls != 0) sb.append(start).append(' ').append(c - 1).append(' ').append(cls).append('\n');
                start = c;
                cls = k;
            }
        }
        System.out.print(sb);
    }
}
