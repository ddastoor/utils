package superutils;

import org.teavm.jso.JSExport;

/** The module's one export (TeaVM, WebAssembly GC): run(…) → the JSON of RegexRun. */
public final class Main {
    private Main() {}

    public static void main(String[] args) {}

    @JSExport
    public static String run(String pattern, String flags, String text, String rep, boolean hasRep, boolean all,
                             int shown, int counted) {
        return RegexRun.run("OpenJDK " + Version.JDK + " java.util.regex", pattern, flags, text, hasRep ? rep : null,
            all, shown, counted);
    }
}
