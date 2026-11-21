// The Perl flavour: Perl's own regex engine — Perl 5.42 compiled to WebAssembly (zeroperl, the Perl the EXIF tab runs
// ExifTool on: public/vendor/exiftool/zeroperl.wasm, nothing new to fetch). One interpreter kept warm in the regex
// worker; each request is a JSON string in $main::q_json and SCRIPT answers with JSON on stdout: m//g's matches (Perl's
// rule for empty matches), @- / @+ for the groups, s/// with the replacement read as a Perl double-quoted string
// ($1, $+{name}, \U…\E, \n). Offsets are characters (code points); the page turns them into its own. The unit suite runs
// the same SCRIPT in the native perl.
import { codePointIndex, COUNTED, fromOffsets, PatternError, SHOWN, type EngineOut, type EngineReq } from './common';
import { namedGroups } from './flavours';

export const SCRIPT = String.raw`
use strict; use warnings; no warnings qw(utf8 uninitialized);
use JSON::PP;
my $J = JSON::PP->new->utf8->canonical;
my $raw = defined $main::q_json ? $main::q_json : do { local $/; <STDIN> };
utf8::encode($raw) if utf8::is_utf8($raw);
my $q = $J->decode($raw);
my ($pat, $fl, $t) = @$q{qw(pattern flags text)};
my %out = (version => sprintf('Perl %vd', $^V));
my $re = eval { length $fl ? qr/(?$fl)$pat/ : qr/$pat/ };
if (!$re) {
  my $e = $@; $e =~ s/ at \(eval \d+\) line \d+\.?\n?\z//; $e =~ s/ at \S+ line \d+\.?\n?\z//; $e =~ s/\n\z//;
  $out{error} = $e; print $J->encode(\%out); exit 0;
}
my @ms; my $total = 0;
while ($t =~ /$re/g) {
  push @ms, [ map { defined $-[$_] ? ($-[$_], $+[$_]) : (-1, -1) } 0 .. $#+ ] if @ms < $q->{shown};
  last if ++$total >= $q->{counted};
}
$out{matches} = \@ms; $out{total} = $total;
if (defined $q->{rep}) {
  my $rep = $q->{rep};
  my ($d) = grep { index($rep, $_) < 0 } map { chr } 1 .. 8, 14 .. 31;
  my $code = "no strict; qq$d$rep$d";
  my $r = $t;
  my $ok = eval {
    if ($q->{all}) { $r =~ s/$re/my $v = eval $code; die $@ if $@; $v/ge } else { $r =~ s/$re/my $v = eval $code; die $@ if $@; $v/e }
    1;
  };
  if ($ok) { $out{replaced} = $r } else { my $e = $@; $e =~ s/ at \(eval \d+\) line \d+.*\z//s; $out{repError} = $e }
}
print $J->encode(\%out);
`;

/** What runPerl needs of a zeroperl instance (the type of the package is not imported here: Node tests make their own). */
export interface PerlLike { setVariable(name: string, value: string): void; eval(code: string): Promise<{ success: boolean; error?: string }>; flush(): void }

/** `out` collects the interpreter's stdout (the instance is made with a stdout callback that appends to out.text). */
export async function runPerl(perl: PerlLike, out: { text: string }, q: EngineReq): Promise<EngineOut> {
  out.text = '';
  perl.setVariable('q_json', JSON.stringify({ pattern: q.pattern, flags: q.flags, text: q.text, rep: q.replacement, all: q.all, shown: SHOWN, counted: COUNTED }));
  const r = await perl.eval(SCRIPT);
  perl.flush();
  let a: any;
  try { a = JSON.parse(out.text); } catch { throw new Error(`Perl stopped: ${r.error || 'no answer'}`); }
  if (a.error) throw new PatternError(a.error);
  const map = codePointIndex(q.text), matches = a.matches.map((o: number[]) => fromOffsets(q.text, o, map));
  const n = a.matches.length ? (a.matches[0].length - 2) / 2 : 0;
  const parsed = namedGroups(q.pattern, { noCapture: q.flags.includes('n'), extended: q.flags.includes('x') });
  const names = parsed && (parsed.length === n || !a.matches.length) ? parsed : Array<string>(n).fill('');
  return { total: a.total, matches, names, replaced: a.replaced ?? null, repError: a.repError, version: a.version };
}
