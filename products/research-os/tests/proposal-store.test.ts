import { describe, expect, it } from 'vitest'
import { APIError } from '../src/lib/api'
import {
  applyProposalChange, commitProposalChange, emptyProposalFile, parseProposalFile, serializeProposalFile,
  type CanvasProposal, type ProposalPort,
} from '../src/features/revision/proposal-store'

const proposal = (key: string, id = key): CanvasProposal => ({ id, project: 'paper-tro', origin: 'agent', sourceLabel: 'thread', key, patch: { ops: [{ op: 'update-card', id: 'rev', status: 'planned' }] }, status: 'pending', createdAt: '2026-09-24T00:00:00Z' })

/** In-memory workspace file with the backend's compare-and-swap semantics. */
function memoryPort(initial?: string) {
  let content = initial, digest = initial ? 'd0' : '', n = 0
  const writes: { expected: string }[] = []
  const port: ProposalPort & { writes: typeof writes; raceOnce?: (next: string) => void } = {
    writes,
    read: async () => content === undefined ? null : { content, digest },
    write: async (_project, next, expected) => {
      writes.push({ expected })
      if (port.raceOnce) { const race = port.raceOnce; port.raceOnce = undefined; race(next); throw new APIError('conflict', 409) }
      if (expected ? expected !== digest : content !== undefined) throw new APIError('conflict', 409)
      content = next; digest = `d${++n}`; return digest
    },
  }
  return Object.assign(port, { set: (text: string) => { content = text; digest = `d${++n}` }, get: () => content })
}

describe('project proposal file', () => {
  it('deduplicates by key and only decides pending proposals', () => {
    let file = applyProposalChange(emptyProposalFile('paper-tro'), { type: 'propose', proposal: proposal('a') })
    expect(applyProposalChange(file, { type: 'propose', proposal: proposal('a', 'other') })).toBe(file)
    file = applyProposalChange(file, { type: 'decide', id: 'a', status: 'applied', at: 't1', baseRevision: 'sha256:x' })
    expect(file.proposals[0]).toMatchObject({ status: 'applied', decidedAt: 't1', baseRevision: 'sha256:x' })
    expect(applyProposalChange(file, { type: 'decide', id: 'a', status: 'rejected', at: 't2' }).proposals[0].status).toBe('applied')
    expect(applyProposalChange(file, { type: 'clear-decided' }).proposals).toEqual([])
  })

  it('rejects a file that belongs to another project', () => {
    expect(() => parseProposalFile(serializeProposalFile(emptyProposalFile('paper-a')), 'paper-b')).toThrow(/foreign/)
  })

  it('creates the file create-only, then writes with the observed digest', async () => {
    const port = memoryPort()
    await commitProposalChange(port, 'paper-tro', { type: 'propose', proposal: proposal('a') })
    await commitProposalChange(port, 'paper-tro', { type: 'propose', proposal: proposal('b') })
    expect(port.writes).toEqual([{ expected: '' }, { expected: 'd1' }])
    expect(parseProposalFile(port.get()!, 'paper-tro').proposals.map(p => p.key)).toEqual(['a', 'b'])
  })

  it('on a conflict re-reads and re-applies the same change, keeping the other writer’s proposal', async () => {
    const port = memoryPort(serializeProposalFile(emptyProposalFile('paper-tro')))
    port.raceOnce = () => port.set(serializeProposalFile({ ...emptyProposalFile('paper-tro'), proposals: [proposal('from-agent')] }))
    const { file } = await commitProposalChange(port, 'paper-tro', { type: 'propose', proposal: proposal('mine') })
    expect(file.proposals.map(p => p.key)).toEqual(['from-agent', 'mine'])
    expect(parseProposalFile(port.get()!, 'paper-tro').proposals).toHaveLength(2)
  })

  it('does not write when the change is a no-op', async () => {
    const port = memoryPort(serializeProposalFile({ ...emptyProposalFile('paper-tro'), proposals: [proposal('a')] }))
    await commitProposalChange(port, 'paper-tro', { type: 'propose', proposal: proposal('a') })
    expect(port.writes).toEqual([])
  })
})
