import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '../../components/ui'
import { useWorkbench } from '../../store'
import { sameFileTarget, type ProjectFileTarget } from '../projects/project-object-model'
import { registerTabCloseGuard } from '../projects/tab-close-guards'
import { ReadingBridge } from '../projects/ReadingBridge'
import { observeSavedFile } from '../review/file-observations'
import { isReviewLocked, registerReviewEditor, subscribeWrites } from '../review/write-coordinator'
import { MarkdownView } from './Reader'
import { notifyManuscriptSourcesSaved } from './manuscript-build'
import { readSavedSource, reconcileSave, saveFailure, saveSource, type SaveAttempt, type SavedSource } from './saved-source'

type EditorState = { base: SavedSource | null; draft: string; status: 'loading' | 'ready' | 'saving' | 'checking' | 'conflict' | 'rejected' | 'uncertain' | 'error'; error: string; remote: SavedSource | null }
export function SavedSourceEditor({ target, active, onQuote }: { target: ProjectFileTarget; active: boolean; onQuote: (text: string, project?: string) => void }) {
  const { workspace, path, projectId } = target
  const zh = useWorkbench(state => state.locale === 'zh')
  const tabId = useWorkbench(state => state.rightTabs.find(tab => tab.kind === 'file' && sameFileTarget(tab.target, target))?.id)
  const [state, setState] = useState<EditorState>({ base: null, draft: '', status: 'loading', error: '', remote: null })
  const [editing, setEditing] = useState(false)
  const live = useRef(state), mounted = useRef(false), attempt = useRef<SaveAttempt | null>(null), reading = useRef<AbortController | null>(null)
  const patch = useCallback((change: Partial<EditorState>) => { if (mounted.current) { live.current = { ...live.current, ...change }; setState(live.current) } }, [])
  const locked = useSyncExternalStore(subscribeWrites, () => isReviewLocked(workspace, path), () => false)
  const dirty = !!state.base && state.draft !== state.base.content
  const busy = state.status === 'saving' || state.status === 'checking' || state.status === 'loading'
  const hasRisk = useCallback(() => {
    const value = live.current
    return value.status === 'saving' || value.status === 'checking' || value.status === 'uncertain' || (!!value.base && value.draft !== value.base.content)
  }, [])
  const load = useCallback(async () => {
    reading.current?.abort()
    const controller = new AbortController(); reading.current = controller
    patch({ status: 'loading', error: '' })
    try {
      const base = await readSavedSource(workspace, path, controller.signal)
      if (!controller.signal.aborted) { attempt.current = null; patch({ base, draft: base.content, status: 'ready', error: '', remote: null }) }
    } catch (error) { if (!controller.signal.aborted) patch({ status: 'error', error: error instanceof Error ? error.message : String(error) }) }
  }, [workspace, path, patch])
  useEffect(() => {
    mounted.current = true; void load()
    return () => { mounted.current = false; reading.current?.abort() }
  }, [load])
  useEffect(() => registerReviewEditor(workspace, path, {
    blocked: () => live.current.status !== 'ready' || hasRisk(), reload: load,
  }), [workspace, path, load, hasRisk])
  useEffect(() => tabId ? registerTabCloseGuard(tabId, () => !hasRisk()) : undefined, [tabId, hasRisk])
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (hasRisk()) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', unload)
    return () => window.removeEventListener('beforeunload', unload)
  }, [hasRisk])
  const accepted = (saved: SavedSource, written: SaveAttempt) => {
    // Publish only the actual save receipt, even if its initiating tab disappeared.
    observeSavedFile({ projectId, workspace }, path, written.before, saved, 'editor')
    if (/\.(tex|bib|sty|cls|bst|cfg|def)$/i.test(path)) notifyManuscriptSourcesSaved({ workspace, changes: [{ path, digest: saved.digest }] })
    attempt.current = null
    patch({ base: saved, draft: saved.content, status: 'ready', error: '', remote: null })
  }
  const save = async () => {
    const current = live.current
    if (!current.base || current.status !== 'ready' || current.draft === current.base.content || isReviewLocked(workspace, path)) return
    const written: SaveAttempt = { before: current.base, content: current.draft }; attempt.current = written
    patch({ status: 'saving', error: '' })
    try { accepted(await saveSource(workspace, path, written), written) }
    catch (error) { patch({ status: saveFailure(error), error: error instanceof Error ? error.message : String(error) }) }
  }
  const check = async () => {
    const written = attempt.current
    if (!written || ['saving', 'checking', 'loading'].includes(live.current.status)) return
    patch({ status: 'checking', error: '' })
    try {
      const actual = await readSavedSource(workspace, path)
      const result = reconcileSave(written, actual)
      if (result === 'saved') accepted(actual, written)
      else if (result === 'not-saved') { attempt.current = null; patch({ status: 'ready', error: zh ? '文件仍是保存前版本；草稿保留，可重新保存。' : 'The file is unchanged; your draft is retained and can be saved again.', remote: null }) }
      else patch({ status: 'conflict', remote: actual, error: zh ? '磁盘版本已变化。草稿与旧基线均保留，未覆盖外部修改。' : 'The saved file changed. Draft and original baseline are retained; no external edit was overwritten.' })
    } catch (error) { patch({ status: 'uncertain', error: error instanceof Error ? error.message : String(error) }) }
  }
  return <section className="flex min-h-0 flex-col gap-2" data-saved-source={`${workspace}/${path}`}>
    <div className="flex flex-wrap items-center gap-2">
      <Button size="xs" disabled={!state.base || busy || locked} onClick={() => setEditing(value => !value)}>{editing ? zh ? '阅读已保存版本' : 'Read saved version' : zh ? '编辑源码' : 'Edit source'}</Button>
      {editing && <Button size="xs" disabled={!dirty || state.status !== 'ready' || locked} loading={state.status === 'saving'} onClick={() => void save()}>{zh ? '保存' : 'Save'}</Button>}
      {attempt.current && !busy && <Button size="xs" onClick={() => void check()}>{zh ? '核对实际保存结果' : 'Check actual save result'}</Button>}
      <Button size="xs" disabled={busy || state.status === 'uncertain' || locked} onClick={() => { if (!hasRisk() || window.confirm(zh ? '放弃此草稿并重新读取磁盘文件？' : 'Discard this draft and reload the saved file?')) void load() }}>{zh ? '重新读取' : 'Reload'}</Button>
      <span className="text-caption text-ink-3" role="status">{locked ? zh ? '其他写入进行中' : 'Another write is active' : busy ? state.status : dirty ? zh ? '草稿未保存' : 'Unsaved draft' : zh ? '显示已保存版本' : 'Saved version'}</span>
    </div>
    {state.error && <p role="alert" className="ui-error whitespace-pre-wrap">{state.error}</p>}
    {state.status === 'uncertain' && <p role="alert">{zh ? '保存结果未知；不会自动重试、编译或清除草稿。' : 'Save result is unknown. No automatic retry, build or draft removal.'}</p>}
    {state.remote && <details className="text-caption"><summary>{zh ? '对照当前磁盘版本' : 'Compare current saved version'} · {state.remote.digest}</summary><pre className="whitespace-pre-wrap break-words">{state.remote.content}</pre></details>}
    {state.base && <>
      <p className="break-all text-caption text-ink-3">{workspace}/{path} · {state.base.digest}</p>
      {editing ? <textarea aria-label={zh ? '源码草稿' : 'Source draft'} className="min-h-80 w-full resize-y rounded bg-elevated p-3 font-mono text-secondary" value={state.draft} disabled={busy || locked || ['conflict', 'uncertain'].includes(state.status)}
        spellCheck={false} onChange={event => patch({ draft: event.target.value })} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save() } }}/>
        : <ReadingBridge active={active} source={{ id: 'reader', workspace, path, digest: state.base.digest }} projectId={projectId} projectWorkspace={target.projectWorkspace || workspace}>
          {/\.mdx?$/i.test(path) ? <article className="research-document break-words text-secondary leading-relaxed"><MarkdownView content={state.base.content}/></article> : <pre className="whitespace-pre-wrap break-words font-mono text-secondary leading-relaxed">{state.base.content}</pre>}
        </ReadingBridge>}
      <Button size="xs" disabled={dirty || busy} onClick={() => onQuote(`${workspace}/${path}\n${state.base!.digest}\n\n${state.base!.content}`, projectId)}>{zh ? '引用已保存版本' : 'Quote saved version'}</Button>
      {dirty && <p className="text-caption">{zh ? '未保存草稿不会进入构建或引用；关闭标签前请保存或明确放弃。' : 'Unsaved drafts are not built or quoted. Save or explicitly discard before closing.'}</p>}
    </>}
  </section>
}
