import { describe, expect, it } from 'vitest'
import { emptyCanvasV2, type ThinkingCanvasV2 } from '../src/features/projects/canvas-model'
import { updateBindingsFromReceipts, type MappingSavedReceipt } from '../src/features/projects/design-context'
import { fileKey, type Operation } from '../src/features/review/review-model'

const original = 'Lead\nAlpha old text and beta terms.\nTail'
const updated = 'Introduction\nAlpha precise text and beta models.\nTail'
const paragraph = 'Alpha old text and beta terms.'
function patch(id: string, before: string, after: string): Operation {
  const start = original.indexOf(before)
  return { id, target: { kind: 'text', workspace: 'paper', path: 'main.tex', start, end: start + before.length }, baseDigest: 'before', before, after, reason: 'Local wording', evidence: [], dependsOn: [], impacts: [] }
}
function receipt(operations = [patch('lead', 'Lead', 'Introduction'), patch('inside-1', 'old', 'precise'), patch('inside-2', 'terms', 'models')]): MappingSavedReceipt {
  return { operations, attempt: { id: 'saved', proposalId: 'local-review', operationIds: operations.map(operation => operation.id), mode: 'apply', at: '2026-09-23T00:00:00Z', actor: 'author', workspace: 'paper', path: 'main.tex', beforeDigest: 'before', beforeHash: 'old-hash', afterHash: 'new-hash', outcome: 'applied', afterDigest: 'after' } }
}
function canvas(): ThinkingCanvasV2 {
  return { ...emptyCanvasV2(), nodes: [paragraph, 'beta terms', 'Tail'].map((quote, i) => ({
    id: `card-${i}`, kind: 'idea', title: `Card ${i}`, x: 0, y: 0,
    bindings: [{ id: `binding-${i}`, workspace: 'paper', path: 'main.tex', digest: 'before', quote, start: original.indexOf(quote), end: original.indexOf(quote) + quote.length }],
  })) }
}
function files(content = updated, digest = 'after') {
  const source = { workspace: 'paper', path: 'main.tex', content, digest }
  return new Map([[fileKey(source), source]])
}

describe('receipt patches contained in paragraph bindings', () => {
  it('maps multiple inner edits and preceding offsets for parent, nested and following bindings', () => {
    const value = canvas(), saved = receipt(), result = updateBindingsFromReceipts(value, [saved], files())
    expect(result.status).toBe('updated')
    const expected = ['Alpha precise text and beta models.', 'beta models', 'Tail']
    expect(result.canvas.nodes.map(node => node.bindings![0])).toEqual(expected.map((quote, i) => ({
      ...value.nodes[i].bindings![0], digest: 'after', quote, start: updated.indexOf(quote), end: updated.indexOf(quote) + quote.length,
    })))
    const retry = updateBindingsFromReceipts(result.canvas, [saved], files())
    expect(retry.status).toBe('updated')
    expect(retry.canvas).toBe(result.canvas)
  })

  it('reverses several contained edits using their saved offsets', () => {
    const value = canvas(), saved = receipt()
    const applied = updateBindingsFromReceipts(value, [saved], files())
    const undo: MappingSavedReceipt = { ...saved, attempt: { ...saved.attempt, id: 'undo', mode: 'revert', outcome: 'reverted', beforeDigest: 'after', afterDigest: 'reverted' } }
    const result = updateBindingsFromReceipts(applied.canvas, [undo], files(original, 'reverted'))
    expect(result.status).toBe('updated')
    expect(result.canvas.nodes.map(node => node.bindings![0])).toEqual(value.nodes.map(node => ({ ...node.bindings![0], digest: 'reverted' })))
  })

  it('maps and reverses an interior deletion without losing the rest of the quote', () => {
    const value = canvas(), saved = receipt([patch('delete', 'old ', '')]), content = 'Lead\nAlpha text and beta terms.\nTail'
    const applied = updateBindingsFromReceipts(value, [saved], files(content))
    expect(applied.status).toBe('updated')
    expect(applied.canvas.nodes[0].bindings![0].quote).toBe('Alpha text and beta terms.')
    const undo: MappingSavedReceipt = { ...saved, attempt: { ...saved.attempt, id: 'undo', mode: 'revert', outcome: 'reverted', beforeDigest: 'after', afterDigest: 'reverted' } }
    const reverted = updateBindingsFromReceipts(applied.canvas, [undo], files(original, 'reverted'))
    expect(reverted.status).toBe('updated')
    expect(reverted.canvas.nodes[0].bindings![0].quote).toBe(paragraph)
  })

  it.each(['stale-binding', 'wrong-before', 'changed-current'] as const)('rejects %s instead of inferring a paragraph match', failure => {
    const value = canvas(), saved = receipt()
    if (failure === 'stale-binding') value.nodes[0].bindings![0].digest = 'stale'
    if (failure === 'wrong-before') saved.operations[1] = { ...saved.operations[1], before: 'BAD' }
    const result = updateBindingsFromReceipts(value, [saved], files(failure === 'changed-current' ? updated.replace('precise', 'unknown') : updated))
    expect(result.status).toBe('failed')
    expect(result.unresolved.some(item => item.bindingId === 'binding-0')).toBe(true)
  })

  it.each(['left', 'right', 'enclosing'] as const)('rejects a patch crossing the %s binding boundary', boundary => {
    const value = canvas(), binding = value.nodes[0].bindings![0]
    const start = boundary === 'right' ? binding.end - 2 : binding.start - 2
    const end = boundary === 'left' ? binding.start + 2 : binding.end + 2
    const before = original.slice(start, end), operation = patch('crossing', before, 'replacement')
    const result = updateBindingsFromReceipts(value, [receipt([operation])], files(original.slice(0, start) + 'replacement' + original.slice(end)))
    expect(result.status).toBe('failed')
    expect(result.unresolved.some(item => item.bindingId === 'binding-0')).toBe(true)
  })

  it('rejects overlapping patches before attempting any binding update', () => {
    const value = canvas(), result = updateBindingsFromReceipts(value, [receipt([patch('outer', 'old text', 'revised text'), patch('inner', 'text', 'words')])], files())
    expect(result.status).toBe('failed')
    expect(result.detail).toContain('patch ranges or versions are inconsistent')
    expect(result.canvas).toBe(value)
  })
})
