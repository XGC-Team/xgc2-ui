import { check, now, scopeKey, uid, validateProposal, type Proposal, type ReviewBook, type Scope } from './review-model.ts'
import { decodeDesignProposal, decodeWritingCompletion, validateWritingSelection, writingFingerprint, writingOperations, writingPrompt } from './writing-model.ts'
import type { DesignProposalRequest, AgentWritingCompletion, ReviewBatchReceipt, WritingNativePort, WritingOffer, WritingRecord } from './writing-contract.ts'
import type { ReviewPort } from './review-engine.ts'

type Journal = {
  scope: Scope; port: ReviewPort
  book: () => ReviewBook; proposal: (id: string) => Proposal
  command: <T>(task: () => Promise<T>) => Promise<T>
  persist: (book: ReviewBook) => Promise<void>
  performRun: (id: string, ids: string[], actor: string, mode: 'apply' | 'revert', batchId: string, guard?: () => Promise<void>, cancelled?: () => boolean) => Promise<string[]>
  finishBatch: (id: string) => ReviewBatchReceipt | undefined
  idle: () => Promise<void>; closed: () => boolean; auditUncertain: () => boolean; warn: (detail: string) => void
}
const describe = (error: unknown) => error instanceof Error ? error.message : String(error)
const status = (error: unknown) => error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0

/** Commands bound to the existing engine's mutex, journal CAS and target writer.
 * The only local state is a synchronous cancellation barrier. The journal is the
 * sole durable decision/history owner; native execution remains the session owner.
 */
export function bindWritingReview(journal: Journal) {
  const cancelled = new Map<string, NonNullable<WritingRecord['cancelled']>>()
  const stopped = (id: string) => journal.closed() || cancelled.has(id)
  const active = (id: string) => check(!stopped(id), 'Writing was cancelled or its project session was closed.')
  const writing = (id: string) => {
    const p = journal.proposal(id)
    check(p.writing, 'This proposal is not a confirmed-design writing request.')
    return p.writing
  }
  async function update(id: string, value: WritingRecord, operations = journal.proposal(id).operations) {
    const next = { ...journal.proposal(id), writing: value, operations }
    validateProposal(next, journal.scope)
    await journal.persist({ ...journal.book(), proposals: journal.book().proposals.map(p => p.id === id ? next : p) })
  }
  async function assertDesign(w: WritingRecord) {
    const saved = await journal.port.read(journal.scope.workspace, w.selection.design.path)
    check(saved.digest === w.selection.design.digest, 'The saved design changed. Capture its current scope and obtain a new confirmation.')
  }
  async function assertSources(w: WritingRecord) {
    const files = new Map<string, typeof w.selection.sources>()
    for (const source of w.selection.sources) files.set(source.anchor.path, [...(files.get(source.anchor.path) || []), source])
    for (const [path, sources] of files) {
      const release = journal.port.lease(journal.scope.workspace, path)
      try {
        const saved = await journal.port.read(journal.scope.workspace, path)
        for (const source of sources) {
          const a = source.anchor, t = a.target!
          check(t.kind === 'text' && saved.digest === a.digest && saved.content.slice(t.start, t.end) === a.quote, 'The selected source changed. Reconcile the current difference; do not reuse its old confirmation.')
        }
      } finally { await release() }
    }
  }
  async function withDesign<T>(id: string, task: (w: WritingRecord) => Promise<T>): Promise<T> {
    active(id)
    const w = writing(id), release = journal.port.lease(journal.scope.workspace, w.selection.design.path)
    try { await assertDesign(w); active(id); return await task(w) }
    finally {
      try { await release() } catch (e) { journal.warn(`Review state is recorded; design editor refresh failed: ${describe(e)}`) }
    }
  }
  async function authorization(id: string, w: WritingRecord) {
    active(id)
    check(w.confirmation && w.confirmation.fingerprint === await writingFingerprint(journal.scope, id, w.selection), 'Writing confirmation no longer matches this exact project/design/source scope.')
    active(id)
  }
  return {
    addDesignProposal: (request: DesignProposalRequest, completion: AgentWritingCompletion, expected: { sessionId: string; turnId: string }) => {
      const captured = structuredClone(request), result = structuredClone(completion)
      return journal.command(async () => {
        check(scopeKey(captured.scope) === scopeKey(journal.scope) && result.sessionId === expected.sessionId && result.turnId === expected.turnId, 'Design response belongs to another project or turn.')
        const next = decodeDesignProposal(captured, result)
        validateProposal(next, journal.scope)
        const existing = journal.book().proposals.find(p => p.id === next.id)
        if (existing) {
          const body = (p: Proposal) => JSON.stringify([p.author, p.title, p.feedback, p.operations])
          check(!existing.writing && body(existing) === body(next), 'Conflicting reuse of a design proposal identity.')
          return false
        }
        check(!journal.closed(), 'The project was closed before design admission.')
        await journal.persist({ ...journal.book(), proposals: [...journal.book().proposals, next] })
        return true
      })
    },
    offerWriting: (offer: WritingOffer) => {
      const captured = structuredClone(offer)
      return journal.command(async () => {
        validateWritingSelection(captured.selection, journal.scope)
        check(!journal.book().proposals.some(p => p.id === captured.id), 'Use a new proposal identity when the design or scope changes.')
        const p: Proposal = { id: captured.id, author: captured.author, at: now(), title: captured.title, feedback: captured.feedback, operations: [],
          writing: { version: 1, selection: captured.selection, status: 'proposed' } }
        validateProposal(p, journal.scope)
        await journal.persist({ ...journal.book(), proposals: [...journal.book().proposals, p] })
        return structuredClone(p)
      })
    },
    confirmWriting: (id: string, actor: string) => journal.command(async () => {
      check(actor.trim() && writing(id).status === 'proposed', 'Only a proposed saved design can be confirmed, with an explicit actor.')
      return withDesign(id, async w => {
        await assertSources(w)
        const confirmation = { id: uid(), actor, at: now(), fingerprint: await writingFingerprint(journal.scope, id, w.selection) }
        active(id)
        await update(id, { ...w, status: 'confirmed', confirmation })
        return structuredClone(confirmation)
      })
    }),
    dispatchWriting: (id: string, native: WritingNativePort) => journal.command(async () => {
      const sessionId = native.sessionId, send = native.send
      check(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(sessionId) && writing(id).status === 'confirmed', 'Writing was already dispatched or has no current session.')
      return withDesign(id, async w => {
        await authorization(id, w); await assertSources(w); active(id)
        const execution = { sessionId, requestKey: w.confirmation!.id }
        await update(id, { ...w, status: 'running', execution }) // write-ahead native dispatch identity
        try {
          active(id)
          const turnId = await send(writingPrompt(id, w), execution.requestKey)
          check(/^t_[a-f0-9]{32}$/.test(turnId), 'Dispatch acknowledgement lacks a stable turn identity.')
          // Even a late acknowledgement belongs in its old journal. It never
          // redirects to the newly selected project or authorizes a target write.
          await update(id, { ...writing(id), execution: { ...execution, turnId } })
          return turnId
        } catch (e) {
          if (!journal.auditUncertain()) {
            const refusal = [400, 401, 403, 404, 409, 412, 422].includes(status(e))
            await update(id, { ...writing(id), status: refusal ? 'failed' : 'uncertain', detail: `Dispatch was not confirmed; do not resend automatically. ${describe(e)}` })
          }
          throw e
        }
      })
    }),
    acceptWritingResult: (id: string, completion: AgentWritingCompletion) => {
      const captured = structuredClone(completion)
      return journal.command(async () => {
        const w = writing(id)
        check(captured.sessionId === w.execution?.sessionId && captured.turnId === w.execution?.turnId, 'Stale or foreign writing completion.')
        if (stopped(id) || w.status === 'cancelled') return false
        if (w.resultDigest) {
          const decoded = await decodeWritingCompletion(id, w, captured)
          check(decoded.resultDigest === w.resultDigest, 'The turn returned conflicting results. Existing source operations were not replaced.')
          return false
        }
        check(w.status === 'running', 'Only the acknowledged turn can supply a result; inspect interrupted or uncertain history explicitly.')
        try {
          return await withDesign(id, async current => {
            await authorization(id, current)
            const decoded = await decodeWritingCompletion(id, current, captured)
            active(id)
            const next: WritingRecord = { ...current, ...decoded, status: 'ready' }
            await update(id, next, writingOperations(next))
            return true
          })
        } catch (e) {
          if (!journal.auditUncertain()) await update(id, { ...writing(id), status: 'failed', detail: describe(e) })
          throw e
        }
      })
    },
    failWritingResult: (id: string, sessionId: string, turnId: string, detail: string) => journal.command(async () => {
      const w = writing(id)
      check(w.status === 'running' && w.execution?.sessionId === sessionId && w.execution.turnId === turnId && detail.trim(), 'Stale/foreign writing admission failure.')
      await update(id, { ...w, status: 'failed', detail })
    }),
    applyWriting: (id: string) => journal.command(async () => {
      const w = writing(id)
      check(w.status === 'ready' && w.confirmation && !journal.book().attempts.some(a => a.proposalId === id), 'This confirmed batch is not ready or has already attempted a source write. Inspect its receipts; do not replay it.')
      const batchId = w.confirmation.id
      try {
        await withDesign(id, async current => {
          await authorization(id, current)
          await update(id, { ...current, status: 'applying' })
          const guard = async () => { active(id); await assertDesign(current); active(id) }
          const problems = await journal.performRun(id, journal.proposal(id).operations.map(o => o.id), current.confirmation!.actor, 'apply', batchId, guard, () => stopped(id))
          const saved = journal.book().attempts.some(a => a.proposalId === id && a.outcome === 'applied')
          const cancellation = cancelled.get(id)
          const unknown = journal.book().attempts.some(a => a.proposalId === id && ['pending', 'uncertain'].includes(a.outcome))
          await update(id, { ...writing(id), status: cancellation ? 'cancelled' : unknown ? 'uncertain' : 'settled',
            ...(cancellation ? { cancelled: cancellation } : {}), ...(problems.length ? { detail: problems.join('\n') } : {}),
            ...(saved ? { mapping: { status: 'pending', at: now() } } : {}) })
          return undefined
        })
      } catch (e) {
        if (!journal.auditUncertain() && writing(id).status === 'ready') await update(id, { ...writing(id), status: 'failed', detail: describe(e) })
        throw e
      } finally { journal.finishBatch(batchId) }
      return journal.finishBatch(batchId)
    }),
    cancelWriting: (id: string, actor: string, reason: string) => {
      check(actor.trim() && reason.trim() && !journal.closed(), 'Cancellation needs an actor, reason and open project.')
      const w = writing(id)
      if (w.status === 'cancelled') return Promise.resolve()
      check(w.status !== 'settled', 'This batch is already settled; inspect its real receipts instead of claiming cancellation.')
      // This runs synchronously even while a CAS or native dispatch is in flight.
      // That write may still finish; subsequent groups/results are suppressed.
      const cancellation = { actor, reason, at: now() }
      cancelled.set(id, cancellation)
      return (async () => {
        await journal.idle()
        await journal.command(async () => {
          await update(id, { ...writing(id), status: 'cancelled', cancelled: cancellation, detail: 'Future review writes cancelled. Already dispatched work may finish; no rollback is claimed.' })
        })
      })()
    },
    recordWritingMapping: (id: string, result: { status: 'updated' | 'failed'; detail?: string }) => journal.command(async () => {
      const w = writing(id)
      check(['settled', 'cancelled', 'uncertain'].includes(w.status) && journal.book().attempts.some(a => a.proposalId === id && a.outcome === 'applied'), 'Mapping acknowledgement needs actual source-save receipts.')
      check(result.status === 'updated' || (result.status === 'failed' && result.detail?.trim()), 'Mapping failures need an actionable detail.')
      await update(id, { ...w, mapping: { ...result, at: now() } })
    }),
  }
}
