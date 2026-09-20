import { writingCopy } from './writing-copy'
import { Button } from '../../components/ui'
import { useWorkbench } from '../../store'
import { fileTarget } from '../projects/project-object-model'
import type { PreviewState } from './useProjectPreview'
import './writing-workbench.css'

export function WritingPreview({ preview, onRetry }: { preview: PreviewState; onRetry: () => void }) {
  const { locale, setActiveNav, openRightTab, projectId } = useWorkbench()
  const copy = writingCopy[locale]
  if (preview.status === 'idle' || preview.status === 'ready') return null
  const detail = preview.status === 'loading' ? copy.previewLoading
    : preview.status === 'empty' ? copy.previewEmpty
    : preview.status === 'unavailable' ? `${copy.previewUnavailable}${preview.detail && preview.detail !== 'LaTeX unavailable' ? ` ${preview.detail}` : ''}`
    : `${copy.previewFailed} ${preview.detail}`
  return <div className="writing-preview" data-xgc-role="writing-preview" data-xgc-id={preview.projectId} role="status">
    <div className="max-w-md">
      <h2 className="font-display text-[18px] tracking-tight">{copy.writingEmpty}</h2>
      <p className="mt-2 text-secondary text-ink-2">{detail}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {projectId && <Button data-xgc-role="open-project-files" data-xgc-id={projectId} onClick={() => openRightTab({ kind: 'file', target: fileTarget(projectId, projectId) })}>{copy.openSource}</Button>}
        {preview.status === 'unavailable' && <Button data-xgc-role="open-compiler-settings" data-xgc-id="settings" onClick={() => setActiveNav('settings')}>{copy.openSettings}</Button>}
        {(preview.status === 'failed' || preview.status === 'empty' || preview.status === 'unavailable') && <Button data-xgc-role="retry-preview" data-xgc-id={preview.projectId} onClick={onRetry}>{copy.retryPreview}</Button>}
      </div>
    </div>
  </div>
}
