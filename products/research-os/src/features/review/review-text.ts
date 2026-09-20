import { check, validateTarget, type Operation, type Scope, type Target } from './review-model.ts'

/** Exact UTF-16 source patches. The engine owns digest CAS and undo receipts.
 * Shared by review-targets and the writing engine; no whole-file replacement
 * supplied by the model and no fuzzy/line-number relocation.
 */
export function patchText(content: string, operations: Operation[], scope: Scope, undo = false): string {
  check(operations.length > 0, 'No operations selected.')
  for (const o of operations) {
    validateTarget(o.target)
    check(o.target.kind === 'text' && o.target.workspace === scope.workspace && o.target.path === operations[0].target.path, 'One write must target one source file in this workspace.')
  }
  const sorted = [...operations].sort((a, b) => (a.target as Extract<Target, {kind: 'text'}>).start - (b.target as Extract<Target, {kind: 'text'}>).start)
  let offset = 0, previous = -1
  const patches = sorted.map(o => {
    const t = o.target as Extract<Target, {kind: 'text'}>
    check(t.start >= previous, 'Overlapping source ranges.'); previous = t.end
    const start = t.start + (undo ? offset : 0)
    const before = undo ? o.after : o.before, after = undo ? o.before : o.after
    check(undo || before.length > 0, 'Select a nonempty source range.')
    check(content.slice(start, start + before.length) === before && (undo || before.length === t.end - t.start), 'Source selection no longer matches.')
    offset += o.after.length - o.before.length
    return { start, end: start + before.length, after }
  })
  let result = content
  for (const p of patches.reverse()) result = result.slice(0, p.start) + p.after + result.slice(p.end)
  return result
}
