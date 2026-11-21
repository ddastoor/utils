package superutils;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * The reference: RegexRun on the JDK's own java.util.regex. Reads one request from stdin as "<byte length>:<bytes>"
 * fields — pattern, flags, text, has a replacement (0 / 1), the replacement, every match (0 / 1), shown, counted — and
 * prints the JSON (scripts/make-regex-reference.py).
 */
public final class Native {
    private Native() {}

    public static void main(String[] args) throws IOException {
        byte[] in = System.in.readAllBytes();
        int[] pos = { 0 };
        String pattern = field(in, pos), flags = field(in, pos), text = field(in, pos);
        boolean hasRep = field(in, pos).equals("1");
        String rep = field(in, pos);
        boolean all = field(in, pos).equals("1");
        int shown = Integer.parseInt(field(in, pos)), counted = Integer.parseInt(field(in, pos));
        String out = RegexRun.run("Java " + System.getProperty("java.version"), pattern, flags, text,
            hasRep ? rep : null, all, shown, counted);
        System.out.write(out.getBytes(StandardCharsets.UTF_8));
        System.out.flush();
    }

    static String field(byte[] b, int[] pos) {
        int c = pos[0];
        while (b[c] != ':') c++;
        int n = Integer.parseInt(new String(b, pos[0], c - pos[0], StandardCharsets.US_ASCII));
        String s = new String(b, c + 1, n, StandardCharsets.UTF_8);
        pos[0] = c + 1 + n;
        return s;
    }
}
