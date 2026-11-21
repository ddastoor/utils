// The reference: RegexRun on the .NET runtime of this machine (the same System.Text.RegularExpressions as the tab's).
// Reads one request from stdin as "<byte length>:<bytes>" fields — pattern, flags, text, has a replacement (0 / 1), the
// replacement, every match (0 / 1), shown, counted — and prints the JSON (scripts/make-regex-reference.py). Run with
// DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1, as the WebAssembly build runs (InvariantGlobalization).
using System;
using System.IO;
using System.Text;

public static class Native
{
    public static void Main()
    {
        using var stdin = Console.OpenStandardInput();
        using var ms = new MemoryStream();
        stdin.CopyTo(ms);
        byte[] b = ms.ToArray();
        int pos = 0;
        string Field()
        {
            int c = pos;
            while (b[c] != (byte)':') c++;
            int n = int.Parse(Encoding.ASCII.GetString(b, pos, c - pos));
            string s = Encoding.UTF8.GetString(b, c + 1, n);
            pos = c + 1 + n;
            return s;
        }
        string pattern = Field(), flags = Field(), text = Field();
        bool hasRep = Field() == "1";
        string rep = Field();
        bool all = Field() == "1";
        int shown = int.Parse(Field()), counted = int.Parse(Field());
        string json = RegexRun.Run(".NET " + Environment.Version, pattern, flags, text, hasRep ? rep : null, all, shown, counted);
        using var stdout = Console.OpenStandardOutput();
        byte[] outb = Encoding.UTF8.GetBytes(json);
        stdout.Write(outb, 0, outb.Length);
    }
}
