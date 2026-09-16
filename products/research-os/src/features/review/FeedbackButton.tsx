import { useState } from 'react'
import { Button } from '../../components/ui'
import { useWorkbench } from '../../store'
import { captureTarget } from './review-api'
import { validateAnchor, type Anchor, type Scope, type Target } from './review-model'
export function FeedbackButton({scope, anchor, target, displayed, body = '', disabled = false}: {
  scope: Scope; anchor?: Anchor; target?: Target; displayed?: string; body?: string; disabled?: boolean
}) {
  const {locale, requestReviewFeedback} = useWorkbench(), zh = locale === 'zh'
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  return <span className="inline-flex flex-wrap items-center gap-1">
    <Button size="xs" disabled={disabled || !scope.projectId} loading={busy} onPointerDown={e => e.preventDefault()} onClick={() => {
      setBusy(true); setError('')
      void (async () => {
        const source = target ? await captureTarget(scope, target, displayed) : anchor
        validateAnchor(source)
        requestReviewFeedback({id: crypto.randomUUID(), scope, anchor: structuredClone(source), body, at: new Date().toISOString()})
      })().catch(e => setError(String(e.message))).finally(() => setBusy(false))
    }}>{zh ? '反馈与修改提案' : 'Feedback and proposal'}</Button>
    {error && <span role="alert" className="w-full break-words text-caption">{error}</span>}
  </span>
}
