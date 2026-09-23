import { writingCopy } from './writing-copy'
import { Button } from '../../components/ui'
import { useWorkbench } from '../../store'
import { fileTarget } from '../projects/project-object-model'
import type { PreviewState } from './useProjectPreview'
import './writing-workbench.css'

export function WritingPreview({ preview, onRetry }: { preview: PreviewState; onRetry: () => void }) {
  const { locale, openResource, projectId } = useWorkbench()
  const copy = writingCopy[locale]
  if (preview.status === 'idle' || preview.status === 'ready') return null
  const detail = preview.status === 'loading' ? copy.previewLoading
    : preview.status === 'empty' ? copy.previewEmpty
    : preview.status === 'unavailable' ? `${copy.previewUnavailable}${preview.detail && preview.detail !== 'LaTeX unavailable' ? ` ${preview.detail}` : ''}`
    : `${copy.previewFailed} ${preview.detail}`
  // Overleaf-style empty PDF pane: one quiet line + one action. The exact gate stays in the tooltip, not an essay.
  const line = preview.status === 'loading' ? copy.previewLoading
    : preview.status === 'empty' ? (locale === 'zh' ? '还没有编译好的 PDF。' : 'No compiled PDF yet.')
    : preview.status === 'unavailable' ? (locale === 'zh' ? 'PDF 预览不可用：本机未启用 LaTeX 构建。' : 'PDF preview unavailable: LaTeX builds are not enabled on this host.')
    : (locale === 'zh' ? '无法读取构建记录。' : 'Could not read build records.')
  return <div className="writing-preview" data-xgc-role="writing-preview" data-xgc-id={preview.projectId} role="status">
    <div className="max-w-sm text-center">
      <p className="text-secondary text-ink-3" title={detail}>{line}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-1">
        {projectId && preview.status !== 'loading' && <Button size="sm" variant="outline" data-xgc-role="open-project-files" data-xgc-id={projectId} onClick={() => openResource({ kind: 'file', target: fileTarget(projectId, projectId) })}>{locale === 'zh' ? '打开项目中的 PDF 或源文件' : 'Open a PDF or source from the project'}</Button>}
        {(preview.status === 'failed' || preview.status === 'empty') && <Button size="sm" data-xgc-role="retry-preview" data-xgc-id={preview.projectId} onClick={onRetry}>{copy.retryPreview}</Button>}
      </div>
    </div>
  </div>
}
