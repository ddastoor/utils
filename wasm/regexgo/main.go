// regex-go.wasm — the Regex Tester's Go flavour (to-do #8, owner, 21 Nov 2026): Go's own regexp package (RE2 syntax,
// leftmost-first, linear time), compiled to WebAssembly (GOOS=wasip1). One request a run on stdin, the answer as JSON
// on stdout. What Go does is what the tab shows: the matches of FindAllStringSubmatchIndex (Go's rule for empty
// matches: none right after a match), "replace every match" by ReplaceAllString, the first match by Expand. Offsets
// are UTF-8 byte offsets; the page turns them into its own. No encoding/json (it doubles the module's size): the request
// is fields of "<length>:<bytes>", the answer is written by hand.
package main

import (
	"bufio"
	"io"
	"os"
	"regexp"
	"runtime"
	"strconv"
	"unicode/utf8"
)

// request: pattern, flags (i m s U — Go's own (?flags)), text, "1"/"0" a replacement is given, the replacement, "1"/"0"
// every match, shown, counted
func fields(b []byte) ([]string, bool) {
	var out []string
	for len(b) > 0 {
		i := 0
		for i < len(b) && b[i] != ':' {
			i++
		}
		n, err := strconv.Atoi(string(b[:i]))
		if err != nil || i+1+n > len(b) {
			return nil, false
		}
		out = append(out, string(b[i+1:i+1+n]))
		b = b[i+1+n:]
	}
	return out, true
}

func quote(w *bufio.Writer, s string) {
	const hex = "0123456789abcdef"
	w.WriteByte('"')
	for i := 0; i < len(s); {
		c := s[i]
		if c < utf8.RuneSelf {
			switch {
			case c == '"' || c == '\\':
				w.WriteByte('\\')
				w.WriteByte(c)
			case c < 0x20:
				w.WriteString(`\u00`)
				w.WriteByte(hex[c>>4])
				w.WriteByte(hex[c&15])
			default:
				w.WriteByte(c)
			}
			i++
			continue
		}
		r, n := utf8.DecodeRuneInString(s[i:])
		if r == utf8.RuneError && n == 1 {
			w.WriteString(`�`)
		} else {
			w.WriteString(s[i : i+n])
		}
		i += n
	}
	w.WriteByte('"')
}

func main() {
	w := bufio.NewWriter(os.Stdout)
	defer w.Flush()
	in, _ := io.ReadAll(bufio.NewReader(os.Stdin))
	f, ok := fields(in)
	if !ok || len(f) != 8 {
		w.WriteString(`{"error":"bad request"}`)
		return
	}
	pattern, flags, text, hasRep, rep, every := f[0], f[1], f[2], f[3] == "1", f[4], f[5] == "1"
	shown, _ := strconv.Atoi(f[6])
	counted, _ := strconv.Atoi(f[7])
	w.WriteString(`{"version":`)
	quote(w, runtime.Version())
	pat := pattern
	if flags != "" {
		pat = "(?" + flags + ")" + pattern
	}
	re, err := regexp.Compile(pat)
	if err != nil {
		// the message names the pattern as typed, not with the flags put in front of it
		if _, e2 := regexp.Compile(pattern); e2 != nil {
			err = e2
		}
		w.WriteString(`,"error":`)
		quote(w, err.Error())
		w.WriteByte('}')
		return
	}
	w.WriteString(`,"names":[`)
	for i, n := range re.SubexpNames()[1:] {
		if i > 0 {
			w.WriteByte(',')
		}
		quote(w, n)
	}
	all := re.FindAllStringSubmatchIndex(text, counted)
	w.WriteString(`],"total":` + strconv.Itoa(len(all)) + `,"matches":[`)
	for i, m := range all {
		if i == shown {
			break
		}
		if i > 0 {
			w.WriteByte(',')
		}
		w.WriteByte('[')
		for j, v := range m {
			if j > 0 {
				w.WriteByte(',')
			}
			w.WriteString(strconv.Itoa(v))
		}
		w.WriteByte(']')
	}
	w.WriteByte(']')
	if hasRep {
		var s string
		if every {
			s = re.ReplaceAllString(text, rep)
		} else if m := re.FindStringSubmatchIndex(text); m != nil {
			s = text[:m[0]] + string(re.ExpandString(nil, rep, text, m)) + text[m[1]:]
		} else {
			s = text
		}
		w.WriteString(`,"replaced":`)
		quote(w, s)
	}
	w.WriteByte('}')
}
