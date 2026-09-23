import { useEffect, useMemo, useRef, useState } from 'react'
import { useWorkbench, type ReviewIntent } from '../../store'
import { readDesignFocus } from '../projects/design-focus'
import { check, scopeKey, type Scope } from '../review/review-model'
import { useWritingReview } from '../review/useWritingReview'
import type { useReview } from '../review/useReview'
import { captureWritingContext, designRequestFromContext, mapSavedWriting, prepareWritingFromDesign } from './writing-integration'

export function useDesignWriting(scope: Scope, review: ReturnType<typeof useReview>) {
  const mapping = useMemo(() => ({ mapSaved: mapSavedWriting.bind(null, scope) }), [scope.projectId, scope.workspace])
  const writing = useWritingReview(scope, review, mapping)
  const { reviewIntents, consumeReviewFeedback } = useWorkbench()
  const incoming = reviewIntents.filter(item => item.designDiscussion && scopeKey(item.scope) === scopeKey(scope))
  const attempted = useRef(new Set<string>())
  const requests = useRef(new Map<string, ReturnType<typeof designRequestFromContext>>())
  const [error, setError] = useState(''), [capturing, setCapturing] = useState(false)
  const pending = useRef(false), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const cards = () => {
    const context = useWorkbench.getState().contextItems.filter(item => item.project === scope.projectId && item.kind === 'canvas-node' && (!item.source?.workspace || item.source.workspace === scope.workspace)).flatMap(item => {
      const match = /^research-content\.json#object\/([^/]+)$/.exec(item.ref)
      return match ? [match[1]] : []
    })
    const focus = readDesignFocus()
    return [...new Set(context.length ? context : focus?.project === scope.projectId ? focus.cardIds : [])]
  }
  const discuss = async (intent: ReviewIntent) => {
    if (pending.current) return
    pending.current = true; setCapturing(true); setError('')
    try {
      let request = requests.current.get(intent.id)
      if (!request) {
        const selected = await captureWritingContext(scope, cards())
        check(alive.current, 'The design project changed.')
        request = designRequestFromContext(intent.id, scope, { id: intent.annotationId || intent.id, author: 'researcher', at: intent.at, body: intent.body, anchor: intent.anchor }, selected)
        requests.current.set(intent.id, request)
      }
      const sent = await writing.requestDesign(request)
      check(sent.observing, 'The project or conversation changed before discussion could be observed.')
      if (alive.current) consumeReviewFeedback(intent.id)
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { pending.current = false; if (alive.current) setCapturing(false) }
  }
  const next = incoming[0]
  useEffect(() => {
    if (!next || !review.book || review.busy || writing.busy || pending.current || attempted.current.has(next.id)) return
    attempted.current.add(next.id)
    // The user's submitted annotation authorizes this discussion, not any source write.
    void discuss(next)
  }, [next?.id, review.book, review.busy, writing.busy])

  const confirmDesign = async (proposalId: string, operationIds: string[], actor: string) => {
    check(!writing.busy && !pending.current, 'Finish the current design discussion first.')
    pending.current = true; setCapturing(true); setError('')
    try {
      await review.action(engine => prepareWritingFromDesign(engine, scope, proposalId, operationIds, actor, () => alive.current))
    } finally { pending.current = false; if (alive.current) setCapturing(false) }
  }
  return { ...writing, busy: writing.busy || capturing, error: error || writing.error, incoming, discuss, confirmDesign }
}
