import { create } from 'zustand'
import { readPreference, writePreference } from '../../lib/storage'
import type { CanvasPatch } from './revision-model'

/* Proposed canvas edits waiting for a human decision. A proposal is an intent, not content:
   it lives in this browser until accepted (then the shared content writer saves the change) or rejected. */
export type ProposalOrigin = 'agent' | 'pasted' | 'sample'
export type CanvasProposal = {
  id: string; project: string; origin: ProposalOrigin
  /** Where it came from: thread + message id for agent replies, a label otherwise. */
  sourceLabel: string; key: string
  patch: CanvasPatch
  status: 'pending' | 'applied' | 'rejected'
  createdAt: string; decidedAt?: string
  /** Content revision the patch was applied on top of (the save that follows produces the next revision). */
  baseRevision?: string
}
export const PROPOSALS_PREFERENCE = 'research-ui-canvas-proposals-v1'

function restore(): CanvasProposal[] {
  try {
    const value: unknown = JSON.parse(readPreference(PROPOSALS_PREFERENCE) || '[]')
    return Array.isArray(value) ? value.filter((p): p is CanvasProposal => Boolean(p) && typeof p === 'object' && typeof p.id === 'string' && typeof p.project === 'string' && typeof p.key === 'string' && Array.isArray(p.patch?.ops) && ['pending', 'applied', 'rejected'].includes(p.status)) : []
  } catch { return [] }
}

export const useProposals = create<{
  proposals: CanvasProposal[]
  /** Returns false when the same proposal (same key) was already recorded. */
  propose: (input: Omit<CanvasProposal, 'id' | 'status' | 'createdAt'>) => boolean
  decide: (id: string, status: 'applied' | 'rejected', baseRevision?: string) => void
  clearDecided: (project: string) => void
}>((set, get) => ({
  proposals: restore(),
  propose: input => {
    if (get().proposals.some(p => p.project === input.project && p.key === input.key)) return false
    set(s => ({ proposals: [...s.proposals, { ...structuredClone(input), id: crypto.randomUUID(), status: 'pending', createdAt: new Date().toISOString() }] }))
    return true
  },
  decide: (id, status, baseRevision) => set(s => ({ proposals: s.proposals.map(p => p.id === id && p.status === 'pending' ? { ...p, status, decidedAt: new Date().toISOString(), ...(baseRevision ? { baseRevision } : {}) } : p) })),
  clearDecided: project => set(s => ({ proposals: s.proposals.filter(p => p.project !== project || p.status === 'pending') })),
}))
useProposals.subscribe((state, previous) => { if (state.proposals !== previous.proposals) writePreference(PROPOSALS_PREFERENCE, JSON.stringify(state.proposals.slice(-200))) })

export function proposalCounts(proposals: readonly CanvasProposal[], project: string) {
  const mine = proposals.filter(p => p.project === project)
  return { pending: mine.filter(p => p.status === 'pending').length, applied: mine.filter(p => p.status === 'applied').length, rejected: mine.filter(p => p.status === 'rejected').length }
}
