import { useEffect, useRef, useState } from 'react'
import { sendNativePrompt } from '../chat/client'
import { belongsToResearchScope, useNativeAgentSession } from '../chat/Session'
import { check, scopeKey, type Scope } from './review-model.ts'
import type { useReview } from './useReview'
import { completedWritingTurn, resumeWritingIdentity } from './native-writing.ts'
import { designProposalPrompt } from './writing-model.ts'
import { writingHistoryReceipt } from './review-batches.ts'
import type { DesignProposalRequest, ReviewBatchReceipt, WritingOffer, WritingSelection } from './writing-contract.ts'

type Review = ReturnType<typeof useReview>
export type WritingMappingPort = {
  /** C updates its authoritative canvas from actual saved operations/attempts.
   * Throw on stale/uncertain mapping; retries only update mapping, never source. */
  mapSaved: (receipt: ReviewBatchReceipt, selection: WritingSelection) => Promise<void>
}
type Active = { scope: string; sessionId: string; turnId: string; proposalId: string; design?: DesignProposalRequest }

/** Compose with the EXISTING useReview instance, not a second journal engine.
 * A owns rendering. Native session permissions/inputs remain in the current
 * Session provider. Only work started in this mount is auto-consumed; opening a
 * saved project restores history without re-sending or re-applying old work.
 */
export function useWritingReview(scope: Scope, review: Review, mapping: WritingMappingPort) {
  const native = useNativeAgentSession()
  const key = scopeKey(scope), latest = useRef({ scope: key, review, native, mapping })
  latest.current = { scope: key, review, native, mapping }
  const generation = useRef(0), alive = useRef(true)
  const active = useRef<Active | null>(null)
  const sending = useRef(new Map<string, { text: string; promise: Promise<string> }>())
  const consuming = useRef(false), launching = useRef(false)
  const [pulse, setPulse] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; generation.current++; active.current = null }
  }, [])
  useEffect(() => { generation.current++; active.current = null; setBusy(false); setError('') }, [key, native.selectedId])

  function currentSession(expectedSession?: string) {
    const live = latest.current
    check(alive.current && live.scope === key && live.native.projectId === scope.projectId, 'The project changed; this writing action cannot target the current conversation.')
    const current = live.native.requireCurrentSession()
    check(!expectedSession || current.session.id === expectedSession, 'The conversation changed before writing dispatch.')
    check(belongsToResearchScope(current.session.scope, scope.projectId, scope.workspace, true), 'The conversation belongs to another project/workspace.')
    check(!current.session.archived && current.state.worker === 'ready' && !current.busy && !current.prompting.has(current.session.id), 'The conversation is not ready. Resolve its existing permission, request, or connection first.')
    check(current.turnSelection.profileId === current.session.scope.profileId, 'Use the currently connected provider.')
    return current
  }
  function sendBound(text: string, requestKey: string, sessionId: string): Promise<string> {
    const id = JSON.stringify([key, sessionId, requestKey]), previous = sending.current.get(id)
    if (previous) { check(previous.text === text, 'A request identity cannot be reused with different design content.'); return previous.promise }
    const current = currentSession(sessionId)
    const { model, effort, permission } = current.turnSelection
    const promise = sendNativePrompt(sessionId, text, requestKey, { model, effort, permission })
    sending.current.set(id, { text, promise })
    // Keep successful responses in this mount for duplicate clicks. A failed
    // response may only retry this SAME request key/payload, not a new native turn.
    void promise.catch(() => { sending.current.delete(id) })
    return promise
  }
  async function mapReceipt(proposalId: string, receipt: ReviewBatchReceipt, selection: WritingSelection, action: Review['action'], owner: WritingMappingPort) {
    if (!receipt.saved.length) return
    try {
      check(alive.current && latest.current.scope === key, 'The mapping project changed.')
      await owner.mapSaved(receipt, selection)
      await action(engine => engine.recordWritingMapping(proposalId, { status: 'updated' }))
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      // Never replay source writes to repair a failed canvas update.
      await action(engine => engine.recordWritingMapping(proposalId, { status: 'failed', detail }))
      throw cause
    }
  }
  useEffect(() => {
    const pending = active.current
    if (!pending || consuming.current || pending.scope !== key || pending.sessionId !== native.session?.id || !native.streamMatchesSelection || native.streamError) return
    let completion
    try { completion = completedWritingTurn(native.state, pending.sessionId, pending.turnId) }
    catch (cause) {
      active.current = null; setBusy(false)
      const detail = cause instanceof Error ? cause.message : String(cause); setError(detail)
      if (!pending.design) void review.action(engine => engine.failWritingResult(pending.proposalId, pending.sessionId, pending.turnId, detail)).catch(() => {})
      return
    }
    if (!completion) return
    consuming.current = true
    const action = review.action, selectedMapping = mapping, g = generation.current
    // Remove before awaiting: duplicate SSE snapshots cannot schedule an apply.
    active.current = null
    void (async () => {
      if (pending.design) {
        await action(engine => engine.addDesignProposal(pending.design!, completion!, pending))
      } else {
        const admitted = await action(engine => engine.acceptWritingResult(pending.proposalId, completion!))
        if (!admitted || !alive.current || generation.current !== g || latest.current.scope !== key) return
        const receipt = await action(engine => engine.applyWriting(pending.proposalId))
        if (!receipt?.saved.length || !alive.current || generation.current !== g) return
        const selection = await action(async engine => engine.snapshot().book!.proposals.find(p => p.id === pending.proposalId)!.writing!.selection)
        // Capture C's owner callback for THIS project, never a newly selected one.
        try {
          await selectedMapping.mapSaved(receipt, selection)
          await action(engine => engine.recordWritingMapping(pending.proposalId, { status: 'updated' }))
        } catch (cause) {
          await action(engine => engine.recordWritingMapping(pending.proposalId, { status: 'failed', detail: cause instanceof Error ? cause.message : String(cause) }))
          throw cause
        }
      }
    })().catch(cause => { if (alive.current && generation.current === g) setError(cause instanceof Error ? cause.message : String(cause)) })
      .finally(() => { consuming.current = false; if (alive.current && generation.current === g) setBusy(false) })
  }, [key, native.state, native.session?.id, native.streamMatchesSelection, native.streamError, review.action, mapping, pulse])

  return {
    busy, error,
    offerWriting: (offer: WritingOffer) => review.action(engine => engine.offerWriting(offer)),
    openWritingSession: async (proposalId:string) => {
      const execution=review.book?.proposals.find(p=>p.id===proposalId)?.writing?.execution
      check(execution?.sessionId,'This writing request has no acknowledged conversation.')
      await native.openSession(execution.sessionId)
    },
    resumeWriting: async (proposalId:string) => {
      check(!active.current&&!consuming.current&&!launching.current&&!busy,'A writing result is already being observed.')
      const current=latest.current.native.requireCurrentSession()
      check(alive.current&&latest.current.scope===key&&belongsToResearchScope(current.session.scope,scope.projectId,scope.workspace,true),'The writing conversation belongs to another project.')
      const writing=await review.action(async engine=>engine.snapshot().book?.proposals.find(p=>p.id===proposalId)?.writing)
      check(writing,'Reload the saved writing request first.')
      if(writing.status==='ready'){
        check(writing.execution?.sessionId===current.session.id,'Open the original writing conversation.')
        setBusy(true);setError('')
        try{const receipt=await review.action(engine=>engine.applyWriting(proposalId));if(receipt)await mapReceipt(proposalId,receipt,writing.selection,review.action,mapping)}finally{setBusy(false)}
        return
      }
      const identity=resumeWritingIdentity(writing,current.session.id)
      active.current={scope:key,...identity,proposalId};setError('');setBusy(true);setPulse(n=>n+1)
    },
    /** Called once by A's explicit confirm action. No separate save/build approval. */
    confirmAndWrite: async (proposalId: string, actor: string) => {
      check(!active.current && !consuming.current && !launching.current && !busy, 'A review turn is already pending.')
      check(typeof mapping.mapSaved === 'function', 'The design mapping owner is not connected.')
      const sessionId = currentSession().session.id, g = generation.current
      launching.current = true; setBusy(true); setError('')
      try {
        await review.action(async engine => {
          const proposal = engine.snapshot().book?.proposals.find(p => p.id === proposalId)
          if (proposal?.writing?.status === 'confirmed') return // same saved authorization; dispatch has not happened
          await engine.confirmWriting(proposalId, actor)
        })
        const turnId = await review.action(engine => engine.dispatchWriting(proposalId, { sessionId, send: (text, requestKey) => sendBound(text, requestKey, sessionId) }))
        if (!alive.current || generation.current !== g || latest.current.scope !== key) return { sessionId, turnId, observing: false }
        active.current = { scope: key, sessionId, turnId, proposalId }; setPulse(n => n + 1)
        return { sessionId, turnId, observing: true }
      } catch (cause) { if (alive.current && generation.current === g) { setBusy(false); setError(cause instanceof Error ? cause.message : String(cause)) } throw cause }
      finally { launching.current = false }
    },
    /** A supplies the durable annotation identity and C-captured design targets.
     * Repeating request.id retries discussion only, never annotation persistence. */
    requestDesign: async (request: DesignProposalRequest) => {
      const captured = structuredClone(request)
      check(scopeKey(captured.scope) === key && !active.current && !consuming.current && !launching.current && !busy, 'The design discussion is already running or targets another project.')
      const sessionId = currentSession().session.id, g = generation.current
      launching.current = true; setBusy(true); setError('')
      try {
        const turnId = await sendBound(designProposalPrompt(captured), captured.id, sessionId)
        if (!alive.current || generation.current !== g || latest.current.scope !== key) return { sessionId, turnId, observing: false }
        active.current = { scope: key, sessionId, turnId, proposalId: captured.id, design: captured }; setPulse(n => n + 1)
        return { sessionId, turnId, observing: true }
      } catch (cause) { if (alive.current && generation.current === g) { setBusy(false); setError(cause instanceof Error ? cause.message : String(cause)) } throw cause }
      finally { launching.current = false }
    },
    cancel: async (proposalId: string, actor: string, reason: string) => {
      generation.current++
      if (active.current?.proposalId === proposalId) active.current = null
      await review.action(engine => engine.cancelWriting(proposalId, actor, reason))
      setBusy(false)
      // The existing Session interrupt remains the owner of native cancellation.
      // Never issue a naked session cancel that could hit a later, unrelated turn.
    },
    dismissDesign: () => {
      check(!active.current || !!active.current.design, 'Cancel the writing proposal rather than dismissing its receipt.')
      generation.current++; active.current = null; setBusy(false)
    },
    retryMapping: async (proposalId: string) => {
      const saved = await review.action(async engine => {
        const book = engine.snapshot().book!, p = book.proposals.find(p => p.id === proposalId)
        check(p?.writing, 'Writing proposal not found.')
        const receipt = writingHistoryReceipt(book, proposalId)
        check(receipt && receipt.saved.length > 0, 'No acknowledged source receipts to map.')
        return { receipt, selection: p.writing.selection }
      })
      await mapReceipt(proposalId, saved.receipt, saved.selection, review.action, mapping)
    },
  }
}
