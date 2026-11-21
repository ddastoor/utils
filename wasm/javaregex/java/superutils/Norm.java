package superutils;

import org.teavm.jso.JSClass;
import org.teavm.jso.JSObject;

/**
 * java.text.Normalizer for OpenJDK's Pattern (CANON_EQ) in the WebAssembly build: TeaVM has no Normalizer, so NFD and
 * NFC come from the browser's own String.prototype.normalize — new String(s).normalize(form), through a JSO class
 * (the runtime we ship makes no code from strings, so no @JSBody: patch-runtime.py). Decompositions and compositions
 * of assigned characters never change between Unicode versions (Unicode's normalization stability policy), so the
 * answers are the JDK's.
 */
public final class Norm {
    private Norm() {}

    /** JavaScript's String, as far as normalize goes. */
    @JSClass(name = "String")
    static class JsString implements JSObject {
        JsString(String s) {}

        public native String normalize(String form);
    }

    public static String normalize(CharSequence s, String form) {
        return new JsString(s.toString()).normalize(form);
    }
}
