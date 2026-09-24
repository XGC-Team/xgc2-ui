import { FileText } from 'lucide-react'
import { writingCopy } from './writing-copy'
import { Button } from '../../components/ui'
import { useWorkbench } from '../../store'
import { fileTarget } from '../projects/project-object-model'
import { useProjectShelf } from '../artifacts/ArtifactShelf'
import type { PreviewState } from './useProjectPreview'
import './writing-workbench.css'

export function WritingPreview({ preview, onRetry }: { preview: PreviewState; onRetry: () => void }) {
  const { locale, openResource, projectId } = useWorkbench()
  const copy = writingCopy[locale]
  const zh = locale === 'zh'
  const shelf = useProjectShelf(projectId)
  if (preview.status === 'idle' || preview.status === 'ready') return null
  const detail = preview.status === 'loading' ? copy.previewLoading
    : preview.status === 'empty' ? copy.previewEmpty
    : preview.status === 'unavailable' ? `${copy.previewUnavailable}${preview.detail && preview.detail !== 'LaTeX unavailable' ? ` ${preview.detail}` : ''}`
    : `${copy.previewFailed} ${preview.detail}`
  // Overleaf-style PDF pane: the project's real PDFs first. The build gate lives in the status bar, not here.
  const pdfs = preview.status === 'loading' ? [] : shelf?.pdfs ?? []
  const line = preview.status === 'loading' ? copy.previewLoading
    : pdfs.length ? (zh ? '项目中的 PDF' : 'PDFs in this project')
    : preview.status === 'failed' ? (zh ? '无法读取构建记录。' : 'Could not read build records.')
    : (zh ? '还没有可显示的 PDF。' : 'No PDF to show yet.')
  return <div className="writing-preview" data-xgc-role="writing-preview" data-xgc-id={preview.projectId} data-preview-status={preview.status} role="status">
    <div className="w-full max-w-xs">
      <p className="text-center text-secondary text-ink-3" title={detail}>{line}</p>
      {pdfs.length > 0 && <div className="mt-3 flex flex-col gap-0.5" data-xgc-role="preview-project-pdfs">
        {pdfs.map(path => <button key={path} type="button" title={path} onClick={() => openResource({ kind: 'original', workspace: projectId, path }, 'secondary')}
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-secondary text-ink-2 transition-colors hover:bg-hover hover:text-ink">
          <FileText size={13} strokeWidth={1.75} className="shrink-0 text-ink-3"/><span className="min-w-0 flex-1 truncate">{path.split('/').pop()}</span><span className="max-w-28 shrink-0 truncate text-caption text-ink-3">{path.split('/').slice(0, -1).join('/')}</span>
        </button>)}
      </div>}
      <div className="mt-3 flex flex-wrap justify-center gap-1">
        {projectId && preview.status !== 'loading' && !pdfs.length && <Button size="sm" variant="outline" data-xgc-role="open-project-files" data-xgc-id={projectId} onClick={() => openResource({ kind: 'file', target: fileTarget(projectId, projectId) })}>{zh ? '打开项目文件' : 'Open project files'}</Button>}
        {(preview.status === 'failed' || preview.status === 'empty') && <Button size="sm" data-xgc-role="retry-preview" data-xgc-id={preview.projectId} onClick={onRetry}>{copy.retryPreview}</Button>}
      </div>
    </div>
  </div>
}
