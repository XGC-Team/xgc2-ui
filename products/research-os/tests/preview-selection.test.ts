import { describe, expect, it } from 'vitest'
import { canAdvancePreview } from '../src/features/workbench/preview-selection'

const current = { workspace: 'paper', path: 'main.tex', buildId: 'one', digest: 'a', url: '/one' }
const next = { ...current, buildId: 'two', digest: 'b', url: '/two' }
describe('build candidate selection', () => {
  it('advances the followed draft, preserving pinned and unsaved annotation views', () => {
    expect(canAdvancePreview(current, next, true, false)).toBe(true)
    expect(canAdvancePreview(current, next, false, false)).toBe(false)
    expect(canAdvancePreview(current, next, true, true)).toBe(false)
  })
  it('never substitutes another manuscript, project, or an unchanged receipt', () => {
    expect(canAdvancePreview(current, { ...next, workspace: 'other' }, true, false)).toBe(false)
    expect(canAdvancePreview(current, { ...next, path: 'other.tex' }, true, false)).toBe(false)
    expect(canAdvancePreview(current, current, true, false)).toBe(false)
    expect(canAdvancePreview(current, null, true, false)).toBe(false)
  })
})
