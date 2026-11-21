// One run of the Regex Tester's .NET flavour: compile with the options, walk the matches (Match.NextMatch — .NET's own
// rule for empty matches; right to left with r), replace (Regex.Replace, .NET's replacement syntax), answer as JSON.
// The same file runs in the tab — .NET 10's System.Text.RegularExpressions on Microsoft's WebAssembly runtime — and
// natively on .NET as the reference of the unit suite (native/Native.cs).
using System;
using System.Text;
using System.Text.RegularExpressions;

public static class RegexRun
{
    static RegexOptions Options(string f)
    {
        var o = RegexOptions.None;
        foreach (char c in f)
        {
            o |= c switch
            {
                'i' => RegexOptions.IgnoreCase,
                'm' => RegexOptions.Multiline,
                's' => RegexOptions.Singleline,
                'n' => RegexOptions.ExplicitCapture,
                'x' => RegexOptions.IgnorePatternWhitespace,
                'r' => RegexOptions.RightToLeft,
                'e' => RegexOptions.ECMAScript,
                'N' => RegexOptions.NonBacktracking,
                _ => throw new InvalidOperationException("not a flag: " + c),
            };
        }
        return o;
    }

    /// <summary>{"version", "error"} or {"version", "names", "total", "matches": [[start, end, start 1, end 1, …], …],
    /// "replaced" | "repError"}: indexes in UTF-16 code units, -1 for a group that took no part; the groups in the order
    /// of their numbers (.NET numbers the unnamed groups first, then the named ones).</summary>
    public static string Run(string version, string pattern, string flags, string text, string? rep, bool all, int shown, int counted)
    {
        var o = new StringBuilder(256).Append("{\"version\":");
        Str(o, version);
        Regex re;
        try { re = new Regex(pattern, Options(flags)); }
        catch (ArgumentException e) { return Error(o, e.Message); }
        catch (NotSupportedException e) { return Error(o, e.Message); }
        int[] numbers = re.GetGroupNumbers();
        o.Append(",\"names\":[");
        bool first = true;
        foreach (int n in numbers)
        {
            if (n == 0) continue;
            if (!first) o.Append(',');
            first = false;
            string name = re.GroupNameFromNumber(n);
            Str(o, name == n.ToString(System.Globalization.CultureInfo.InvariantCulture) ? "" : name);
        }
        o.Append("],\"matches\":[");
        int total = 0;
        for (Match m = re.Match(text); m.Success; m = m.NextMatch())
        {
            if (total < shown)
            {
                if (total > 0) o.Append(',');
                o.Append('[').Append(m.Index).Append(',').Append(m.Index + m.Length);
                foreach (int n in numbers)
                {
                    if (n == 0) continue;
                    Group g = m.Groups[n];
                    if (g.Success) o.Append(',').Append(g.Index).Append(',').Append(g.Index + g.Length);
                    else o.Append(",-1,-1");
                }
                o.Append(']');
            }
            if (++total >= counted) break;
        }
        o.Append("],\"total\":").Append(total);
        if (rep != null)
        {
            try
            {
                string r = all ? re.Replace(text, rep) : re.Replace(text, rep, 1);
                o.Append(",\"replaced\":");
                Str(o, r);
            }
            catch (ArgumentException e)
            {
                o.Append(",\"repError\":");
                Str(o, e.Message);
            }
        }
        return o.Append('}').ToString();
    }

    static string Error(StringBuilder o, string message)
    {
        o.Append(",\"error\":");
        Str(o, message);
        return o.Append('}').ToString();
    }

    /// <summary>A JSON string: everything outside printable ASCII as \uXXXX (lone surrogates too).</summary>
    static void Str(StringBuilder o, string s)
    {
        o.Append('"');
        foreach (char c in s)
        {
            if (c == '"' || c == '\\') o.Append('\\').Append(c);
            else if (c >= 0x20 && c < 0x7f) o.Append(c);
            else o.Append("\\u").Append(((int)c).ToString("x4", System.Globalization.CultureInfo.InvariantCulture));
        }
        o.Append('"');
    }
}
