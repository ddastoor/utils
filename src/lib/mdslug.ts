// Heading ids as GitHub gives them (the Markdown Editor's preview and its .html export), held to npm's github-slugger.
/** GitHub's id for a heading (github-slugger): lower case, letters, digits, spaces, hyphens and underscores kept,
 *  spaces to hyphens; a repeated one gets -1, -2. */
export function slugger() {
  const occ = new Map<string, number>();
  return (text: string) => {
    const orig = text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-');
    let r = orig;
    while (occ.has(r)) { const n = occ.get(orig)! + 1; occ.set(orig, n); r = `${orig}-${n}`; }
    occ.set(r, 0);
    return r;
  };
}
