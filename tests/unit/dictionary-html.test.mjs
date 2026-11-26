// The text of an online definition (src/lib/dictionary.ts, stripTags): no tag of another site's HTML may reach a parser
// that makes elements of it — Google Chrome on Windows tried to run an <img onerror> inside a DOMParser document
// (the Windows check of 26 Nov 2026, to-do #13; the CSP refused it). stripTags leaves text and character references only.
export default async (t, { load }) => {
  const { stripTags } = await load('/src/lib/dictionary.ts');
  const cases = [
    ['A <a href="/wiki/shrewd">shrewd</a> person.', 'A shrewd person.', 'links: their words kept, the tag gone'],
    ['A <b>snolly</b>goster', 'A snollygoster', 'inline tags add no space (as textContent read them)'],
    ['x<script>window.__pwned=1</script>y', 'xy', 'a script goes with what it holds'],
    ['x<SCRIPT type="t">a</b>c</Script >y', 'xy', '… in any case, whatever it holds'],
    ['x<style>p{}</style>y', 'xy', 'a style goes with what it holds'],
    ['a<img src="https://evil.example/x.png" onerror="window.__pwned=2">b', 'ab', 'a picture with a handler: gone'],
    ['a<img src=x onerror=alert(1)', 'a', 'a tag left open runs to the end'],
    ['a<script>never closed', 'a', 'a script left open runs to the end'],
    ['a<!-- <img src=x onerror=1> -->b', 'ab', 'a comment goes with what it holds'],
    ['a<!-- open', 'a', 'a comment left open runs to the end'],
    ['a<span title="1 > 0">b</span>c', 'abc', 'a ">" inside a quoted attribute does not end the tag'],
    ["a<span title='x>y' onclick='z'>b</span>c", 'abc', '… in single quotes too'],
    ['&lt;img src=x onerror=1&gt; stays text', '&lt;img src=x onerror=1&gt; stays text', 'character references are left for the parser to read as text'],
    ['5 &amp; 6', '5 &amp; 6', '… &amp; too'],
    ['plain words', 'plain words', 'text without tags is as it was'],
  ];
  for (const [html, want, what] of cases) t.eq(stripTags(html), want, `${what}: ${JSON.stringify(html)}`);
  for (const [html] of cases) t.ok(!/[<]/.test(stripTags(html).replace(/&lt;/g, '')), `no "<" is left for a parser to begin an element with: ${JSON.stringify(html)}`);
};
