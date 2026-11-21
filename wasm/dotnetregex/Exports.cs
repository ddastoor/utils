// The module's one export (System.Runtime.InteropServices.JavaScript): Exports.Run(…) → the JSON of RegexRun.
using System;
using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;

public static class Program
{
    public static void Main() { }
}

[SupportedOSPlatform("browser")]
public static partial class Exports
{
    [JSExport]
    public static string Run(string pattern, string flags, string text, string rep, bool hasRep, bool all, int shown, int counted)
        => RegexRun.Run(".NET " + Environment.Version + " System.Text.RegularExpressions", pattern, flags, text, hasRep ? rep : null, all, shown, counted);
}
