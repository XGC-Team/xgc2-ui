import { useSyncExternalStore, type ReactNode } from 'react'
import { isReviewLocked, subscribeWrites } from './write-coordinator'
import { useWorkbench } from '../../store'
export function WriteBoundary({workspace, path, children}: {workspace: string; path: string; children: ReactNode}) {
  const locked = useSyncExternalStore(subscribeWrites, () => isReviewLocked(workspace, path))
  const zh = useWorkbench(s => s.locale === 'zh')
  return <fieldset disabled={locked} className="relative m-0 h-full min-h-0 min-w-0 border-0 p-0">
    {children}
    {locked && <div role="status" className="absolute inset-0 z-50 grid place-content-center bg-panel/90 p-6 text-secondary">{zh ? '正在进行受审查的条件写入，完成重新读取后恢复编辑。' : 'A reviewed conditional write is in progress. Editing resumes after reloading.'}</div>}
  </fieldset>
}
