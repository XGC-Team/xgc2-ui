import { describe, expect, it } from 'vitest'
import { wordDiff } from '../src/features/review/word-diff'

const side = (segments: ReturnType<typeof wordDiff>, keep: 'del' | 'add') => segments.filter(s => s.kind === 'same' || s.kind === keep).map(s => s.text).join('')

describe('inline word diff', () => {
  it('reproduces both sides exactly and isolates the changed words', () => {
    const before = 'We compare against a fixed-gain PID baseline on 12 flights (Fig.~3).'
    const after = 'We compare against an MPC and a fixed-gain PID baseline on 12 flights (Fig.~3).'
    const d = wordDiff(before, after)
    expect(side(d, 'del')).toBe(before); expect(side(d, 'add')).toBe(after)
    expect(d.filter(s => s.kind !== 'same').map(s => s.text).join('|')).not.toContain('PID')
  })
  it('handles TeX, CJK and empty sides', () => {
    const d = wordDiff('若 $\\alpha < 1$，误差收敛。', '若投影后 $\\alpha < 1$，误差收敛。')
    expect(side(d, 'add')).toBe('若投影后 $\\alpha < 1$，误差收敛。')
    expect(wordDiff('', 'new')).toEqual([{ kind: 'add', text: 'new' }])
    expect(wordDiff('old', '')).toEqual([{ kind: 'del', text: 'old' }])
  })
  it('falls back to a whole replacement beyond the budget', () => {
    expect(wordDiff('a b c', 'd e f', 4).map(s => s.kind)).toEqual(['del', 'add'])
  })
})

describe('diff readability', () => {
  it('collapses a rewritten clause into one deletion and one insertion', () => {
    const before = 'Adaptive gains improve tracking; model predictive control is left to future work.'
    const after = 'Adaptive gains improve tracking over PID and match MPC at lower computational cost.'
    const d = wordDiff(before, after)
    expect(side(d, 'del')).toBe(before); expect(side(d, 'add')).toBe(after)
    expect(d.map(s => s.kind)).toEqual(['same', 'del', 'add', 'same'])
  })
})
