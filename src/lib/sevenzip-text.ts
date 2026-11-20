// Reading what 7zz prints (`l -slt`): the archive's type and its entries. Text glue (§3a); the archive is 7-Zip's.

/** "Key = Value" blocks of `7zz l -slt`: the archive's own block, then one per entry (after the "----------" line). */
export function parseList(out: string, name: string) {
  const [head, body = ''] = out.split(/^-{10}$/m);
  const block = (t: string) => Object.fromEntries(t.split('\n').map((l) => /^([A-Za-z][\w ]*?) = (.*)$/.exec(l)).filter(Boolean).map((m) => [m![1], m![2]]));
  const arc = block(head.slice(head.lastIndexOf('--\n') >= 0 ? head.lastIndexOf('--\n') : 0));
  // bzip2 / xz / lzma streams store no name: 7-Zip names the one entry after the archive (a.tar.bz2 → a.tar)
  const unnamed = name.replace(/\.(bz2|xz|lzma|z|gz)$/i, '').replace(/\.t(bz2?|xz|gz|lz)$/i, '.tar') || 'file';
  const entries = body.split(/\n\s*\n/).map(block).filter((b) => Object.keys(b).length).map((b) => ({
    path: (b.Path ?? unnamed) as string, size: Number(b.Size || 0), dir: b.Folder === '+' || /^D/.test(b.Attributes || ''),
    encrypted: b.Encrypted === '+', modified: b.Modified || '',
  }));
  return { type: (arc.Type as string) || '', entries };
}

