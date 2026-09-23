import { create } from 'zustand'
import { APIError, request } from '../../lib/api'
import type { CanvasPatch } from './revision-model'

/* Proposed canvas edits waiting for a human decision, kept in the project repository beside
   research-content.json as research-proposals.json. Writes use the workspace file API with
   compare-and-swap (expectedDigest / createOnly); a conflict re-reads and re-applies the one change.
   A proposal is an intent, not content: accepting it is a separate write through the content writer. */
export type ProposalOrigin = 'agent' | 'pasted' | 'sample'
export type CanvasProposal = {
  id: string; project: string; origin: ProposalOrigin
  /** Where it came from: thread + message id for agent replies, a label otherwise. */
  sourceLabel: string; key: string
  patch: CanvasPatch
  status: 'pending' | 'applied' | 'rejected'
  createdAt: string; decidedAt?: string
  /** Content revision produced by accepting the patch. */
  baseRevision?: string
}
export const PROPOSALS_PATH = 'research-proposals.json'
export const PROPOSALS_SCHEMA = 'research.canvas-proposals/v1'
export type ProposalFile = { schemaVersion: typeof PROPOSALS_SCHEMA; projectId: string; proposals: CanvasProposal[] }

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
export function parseProposalFile(text: string, project: string): ProposalFile {
  const value: unknown = JSON.parse(text)
  if (!record(value) || value.schemaVersion !== PROPOSALS_SCHEMA || value.projectId !== project || !Array.isArray(value.proposals)) throw new Error('Unsupported or foreign proposal file.')
  const proposals = value.proposals.filter((p): p is CanvasProposal => record(p) && typeof p.id === 'string' && typeof p.key === 'string' && record(p.patch) && Array.isArray(p.patch.ops) && ['pending', 'applied', 'rejected'].includes(String(p.status)))
    .map(p => ({ ...p, project }))
  return { schemaVersion: PROPOSALS_SCHEMA, projectId: project, proposals }
}
export const serializeProposalFile = (file: ProposalFile) => JSON.stringify(file, null, 2) + '\n'
export const emptyProposalFile = (project: string): ProposalFile => ({ schemaVersion: PROPOSALS_SCHEMA, projectId: project, proposals: [] })

export type ProposalChange =
  | { type: 'propose'; proposal: CanvasProposal }
  | { type: 'decide'; id: string; status: 'applied' | 'rejected'; at: string; baseRevision?: string }
  | { type: 'clear-decided' }
/** Pure: apply one change to the latest file. Duplicate keys and already-decided proposals are left alone. */
export function applyProposalChange(file: ProposalFile, change: ProposalChange): ProposalFile {
  switch (change.type) {
    case 'propose': return file.proposals.some(p => p.key === change.proposal.key) ? file : { ...file, proposals: [...file.proposals, change.proposal].slice(-300) }
    case 'decide': return { ...file, proposals: file.proposals.map(p => p.id === change.id && p.status === 'pending' ? { ...p, status: change.status, decidedAt: change.at, ...(change.baseRevision ? { baseRevision: change.baseRevision } : {}) } : p) }
    case 'clear-decided': return { ...file, proposals: file.proposals.filter(p => p.status === 'pending') }
  }
}

export type ProposalPort = {
  read: (project: string) => Promise<{ content: string; digest: string } | null>
  write: (project: string, content: string, expectedDigest: string) => Promise<string>
}
const fileURL = (project: string) => `/workspaces/${encodeURIComponent(project)}/files/${PROPOSALS_PATH}`
export const proposalPort: ProposalPort = {
  read: async project => {
    try { return await request<{ content: string; digest: string }>(fileURL(project)) }
    catch (error) { if (error instanceof APIError && error.status === 404) return null; throw error }
  },
  write: async (project, content, expectedDigest) => {
    const saved = await request<{ digest?: string }>(fileURL(project), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(expectedDigest ? { content, expectedDigest } : { content, createOnly: true }) })
    if (!saved?.digest) throw new Error('The proposal file has no saved-file receipt.')
    return saved.digest
  },
}

/** Read-modify-write with CAS; one retry after a conflict re-reads the file and re-applies the same change. */
export async function commitProposalChange(port: ProposalPort, project: string, change: ProposalChange): Promise<{ file: ProposalFile; digest: string }> {
  for (let attempt = 0; ; attempt++) {
    const current = await port.read(project)
    const file = current ? parseProposalFile(current.content, project) : emptyProposalFile(project)
    const next = applyProposalChange(file, change)
    if (next === file && current) return { file, digest: current.digest }
    try { return { file: next, digest: await port.write(project, serializeProposalFile(next), current?.digest ?? '') } }
    catch (error) { if (attempt === 0 && error instanceof APIError && (error.status === 409 || error.status === 412)) continue; throw error }
  }
}

type ProjectState = { status: 'loading' | 'ready' | 'error'; digest: string; error: string; proposals: CanvasProposal[] }
export const useProposals = create<{
  projects: Record<string, ProjectState>
  /** Every loaded project's proposals, flattened for simple selectors. */
  proposals: CanvasProposal[]
  load: (project: string) => Promise<void>
  /** Resolves false when the same proposal (same key) was already recorded. */
  propose: (input: Omit<CanvasProposal, 'id' | 'status' | 'createdAt'>) => Promise<boolean>
  decide: (id: string, status: 'applied' | 'rejected', baseRevision?: string) => Promise<void>
  clearDecided: (project: string) => Promise<void>
}>((set, get) => {
  const put = (project: string, patch: Partial<ProjectState>) => set(s => {
    const base: ProjectState = s.projects[project] ?? { status: 'ready', digest: '', error: '', proposals: [] }
    const projects = { ...s.projects, [project]: { ...base, ...patch } }
    return { projects, proposals: Object.values(projects).flatMap(p => p.proposals) }
  })
  const commit = async (project: string, change: ProposalChange) => {
    try { const { file, digest } = await commitProposalChange(proposalPort, project, change); put(project, { status: 'ready', digest, error: '', proposals: file.proposals }) }
    catch (error) { put(project, { error: error instanceof Error ? error.message : String(error) }); throw error }
  }
  return {
    projects: {}, proposals: [],
    load: async project => {
      if (!project) return
      put(project, { status: get().projects[project]?.status === 'ready' ? 'ready' : 'loading' })
      try {
        const current = await proposalPort.read(project)
        put(project, { status: 'ready', error: '', digest: current?.digest ?? '', proposals: current ? parseProposalFile(current.content, project).proposals : [] })
      } catch (error) { put(project, { status: 'error', error: error instanceof Error ? error.message : String(error) }) }
    },
    propose: async input => {
      if (get().projects[input.project]?.proposals.some(p => p.key === input.key)) return false
      await commit(input.project, { type: 'propose', proposal: { ...structuredClone(input), id: crypto.randomUUID(), status: 'pending', createdAt: new Date().toISOString() } })
      return true
    },
    decide: async (id, status, baseRevision) => {
      const proposal = get().proposals.find(p => p.id === id)
      if (proposal) await commit(proposal.project, { type: 'decide', id, status, at: new Date().toISOString(), baseRevision })
    },
    clearDecided: project => commit(project, { type: 'clear-decided' }),
  }
})

/** One identity for an agent patch wherever it is detected (chat tray or revision board), so it is recorded once. */
export const agentProposalKey = (thread: string, item: string, index: number, patch: CanvasPatch) => `agent:${thread}:${item}:${index}:${JSON.stringify(patch)}`

export function proposalCounts(proposals: readonly CanvasProposal[], project: string) {
  const mine = proposals.filter(p => p.project === project)
  return { pending: mine.filter(p => p.status === 'pending').length, applied: mine.filter(p => p.status === 'applied').length, rejected: mine.filter(p => p.status === 'rejected').length }
}
