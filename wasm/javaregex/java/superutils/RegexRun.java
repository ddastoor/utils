package superutils;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * One run of the Regex Tester's Java flavour: compile with the flags, find every match (Matcher.find's own rule for
 * empty matches), replace (Matcher.replaceAll / replaceFirst, Java's replacement syntax), answer as JSON. The same
 * source runs in the tab — OpenJDK's java.util.regex compiled to WebAssembly by TeaVM, its package renamed to
 * ojdk.util.regex by prepare.py — and natively on the JDK as the reference of the unit suite (Native.java).
 */
public final class RegexRun {
    private RegexRun() {}

    static int flags(String f) {
        int r = 0;
        for (int i = 0; i < f.length(); i++) {
            switch (f.charAt(i)) {
                case 'i': r |= Pattern.CASE_INSENSITIVE; break;
                case 'm': r |= Pattern.MULTILINE; break;
                case 's': r |= Pattern.DOTALL; break;
                case 'x': r |= Pattern.COMMENTS; break;
                case 'd': r |= Pattern.UNIX_LINES; break;
                case 'u': r |= Pattern.UNICODE_CASE; break;
                case 'U': r |= Pattern.UNICODE_CHARACTER_CLASS; break;
                case 'c': r |= Pattern.CANON_EQ; break;
                default: throw new IllegalArgumentException("not a flag: " + f.charAt(i));
            }
        }
        return r;
    }

    /** {"version", "error"} or {"version", "names", "total", "matches": [[start, end, start 1, end 1, …], …],
     *  "replaced" | "repError"}; indexes are Java's (UTF-16 code units), -1 for a group that took no part. */
    public static String run(String version, String pattern, String flags, String text, String rep, boolean all,
                             int shown, int counted) {
        StringBuilder o = new StringBuilder(256).append("{\"version\":");
        str(o, version);
        Pattern p;
        try {
            p = Pattern.compile(pattern, flags(flags));
        } catch (PatternSyntaxException e) {
            o.append(",\"error\":");
            str(o, e.getIndex() >= 0 ? e.getDescription() + " near index " + e.getIndex() : e.getDescription());
            return o.append('}').toString();
        } catch (StackOverflowError e) {
            o.append(",\"error\":");
            str(o, "StackOverflowError: the pattern is nested too deeply");
            return o.append('}').toString();
        }
        Matcher m = p.matcher(text);
        int groups = m.groupCount();
        String[] names = new String[groups];
        for (Map.Entry<String, Integer> e : p.namedGroups().entrySet()) names[e.getValue() - 1] = e.getKey();
        o.append(",\"names\":[");
        for (int g = 0; g < groups; g++) {
            if (g > 0) o.append(',');
            str(o, names[g] == null ? "" : names[g]);
        }
        o.append("],\"matches\":[");
        int total = 0;
        try {
            while (m.find()) {
                if (total < shown) {
                    if (total > 0) o.append(',');
                    o.append('[');
                    for (int g = 0; g <= groups; g++) {
                        if (g > 0) o.append(',');
                        o.append(m.start(g)).append(',').append(m.end(g));
                    }
                    o.append(']');
                }
                if (++total >= counted) break;
            }
        } catch (StackOverflowError e) {
            o.setLength(0);
            o.append("{\"version\":");
            str(o, version);
            o.append(",\"error\":");
            str(o, "StackOverflowError: Java's regex engine is recursive, and this pattern goes too deep on this text");
            return o.append('}').toString();
        }
        o.append("],\"total\":").append(total);
        if (rep != null) {
            try {
                Matcher r = p.matcher(text);
                String out = all ? r.replaceAll(rep) : r.replaceFirst(rep);
                o.append(",\"replaced\":");
                str(o, out);
            } catch (IllegalArgumentException | IndexOutOfBoundsException e) {
                o.append(",\"repError\":");
                str(o, e.getMessage());
            } catch (StackOverflowError e) {
                o.append(",\"repError\":");
                str(o, "StackOverflowError");
            }
        }
        return o.append('}').toString();
    }

    /** A JSON string: everything outside printable ASCII as \\uXXXX (lone surrogates too). */
    static void str(StringBuilder o, String s) {
        o.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') o.append('\\').append(c);
            else if (c >= 0x20 && c < 0x7f) o.append(c);
            else {
                String h = Integer.toHexString(c);
                o.append("\\u");
                for (int k = h.length(); k < 4; k++) o.append('0');
                o.append(h);
            }
        }
        o.append('"');
    }
}
