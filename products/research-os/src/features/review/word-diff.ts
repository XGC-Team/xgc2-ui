/** Word-level inline diff for reviewing prose and TeX (Cursor / VS Code inline-diff grammar).
 * Tokens keep whitespace and punctuation, so joining a side's segments reproduces that side exactly. */
export type DiffSegment = { kind: 'same' | 'del' | 'add'; text: string }

const tokens = (text: string) => text.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? []

export function wordDiff(before: string, after: string, limit = 250_000): DiffSegment[] {
  const a = tokens(before), b = tokens(after)
  // Beyond the budget an LCS table is too costly for an interactive panel: show a whole replacement instead.
  if (a.length * b.length > limit) return [...(before ? [{ kind: 'del' as const, text: before }] : []), ...(after ? [{ kind: 'add' as const, text: after }] : [])]
  let start = 0; while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length, endB = b.length; while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }
  const x = a.slice(start, endA), y = b.slice(start, endB)
  const table = Array.from({ length: x.length + 1 }, () => new Uint32Array(y.length + 1))
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) table[i][j] = x[i] === y[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
  const out: DiffSegment[] = []
  const push = (kind: DiffSegment['kind'], text: string) => { const last = out.at(-1); if (last?.kind === kind) last.text += text; else if (text) out.push({ kind, text }) }
  push('same', a.slice(0, start).join(''))
  let i = 0, j = 0
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) { push('same', x[i]); i++; j++ }
    else if (j < y.length && (i === x.length || table[i][j + 1] >= table[i + 1][j])) push('add', y[j++])
    else push('del', x[i++])
  }
  push('same', a.slice(endA).join(''))
  return cleanup(out)
}

/* Semantic cleanup: an "unchanged" run of only whitespace/punctuation (or a lone short word) sandwiched between changes
   is noise for a reader, so each changed region collapses into one deletion followed by one insertion. */
function cleanup(segments: DiffSegment[]): DiffSegment[] {
  const trivial = (s: DiffSegment) => s.kind === 'same' && (/^[\s\p{P}]*$/u.test(s.text) || s.text.trim().length <= 2)
  const out: DiffSegment[] = []
  let del = '', add = ''
  const flush = () => { if (del) out.push({ kind: 'del', text: del }); if (add) out.push({ kind: 'add', text: add }); del = add = '' }
  segments.forEach((s, i) => {
    const between = i > 0 && i < segments.length - 1 && segments[i - 1].kind !== 'same' && segments[i + 1].kind !== 'same'
    if (s.kind === 'del') del += s.text
    else if (s.kind === 'add') add += s.text
    else if (between && trivial(s)) { del += s.text; add += s.text }
    else { flush(); out.push({ ...s }) }
  })
  flush()
  return out
}

/** 1-based line of a character offset, for "main.tex:12" style locations. */
export const lineAt = (content: string, offset: number) => content.slice(0, offset).split('\n').length
