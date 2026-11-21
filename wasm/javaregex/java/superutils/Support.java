package superutils;

/** What OpenJDK's sources take from jdk.internal.util.ArraysSupport, for the WebAssembly build (prepare.py). */
public final class Support {
    private Support() {}

    public static final int SOFT_MAX_ARRAY_LENGTH = Integer.MAX_VALUE - 8;

    /** ArraysSupport.newLength (OpenJDK 21). */
    public static int newLength(int oldLength, int minGrowth, int prefGrowth) {
        int prefLength = oldLength + Math.max(minGrowth, prefGrowth);
        if (0 < prefLength && prefLength <= SOFT_MAX_ARRAY_LENGTH) return prefLength;
        int minLength = oldLength + minGrowth;
        if (minLength < 0) throw new OutOfMemoryError("Required array length " + oldLength + " + " + minGrowth + " is too large");
        return Math.max(minLength, SOFT_MAX_ARRAY_LENGTH);
    }

    /** ArraysSupport.vectorizedHashCode(a, off, len, initial, T_BYTE): the hash of Arrays.hashCode, from `initial`. */
    public static int hashBytes(byte[] a, int off, int len, int initial) {
        int h = initial;
        for (int i = off; i < off + len; i++) h = 31 * h + a[i];
        return h;
    }
}
