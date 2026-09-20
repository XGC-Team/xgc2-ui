import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { request } from '../../lib/api'
import { assertEditorClean, isReviewLocked } from '../review/write-coordinator'
import { CANVAS_PATH, type CanvasNodeV2, type ThinkingCanvasV2 } from './canvas-model'
import {
  captureSourceBinding, correctSourceBinding, putSourceBinding, resolveSourceBinding,
  sourceLines, unlinkSourceBinding, validateSourceSnapshot,
  type CanvasSourceBinding, type DesignSourceRange, type DesignSourceSnapshot,
} from './design-source'
import { validSourcePath } from './draft-model'

type Props = {
  project: string; node: CanvasNodeV2; canvas: ThinkingCanvasV2; locale: 'zh' | 'en'; locked: boolean
  ready: boolean; focusBindingId?: string
  apply: (update: (canvas: ThinkingCanvasV2) => ThinkingCanvasV2, coalesceKey?: string) => void
  onContext: (bindingId: string) => void
}
/** A source reader inside the existing canvas editor. Only `apply` can edit the design;
 * this component never PUTs source text or creates a competing canvas session. */
export function DesignSourceEditor({ project, node, canvas, locale, locked, ready, focusBindingId, apply, onContext }: Props) {
  const zh = locale === 'zh'
  const bindings = (canvas.sourceBindings ?? []).filter(binding => binding.nodeIds.includes(node.id))
  const [path, setPath] = useState(node.anchor && validSourcePath(node.anchor) && !node.anchor.includes('#') ? node.anchor : '')
  const [source, setSource] = useState<DesignSourceSnapshot | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [range, setRange] = useState<DesignSourceRange | null>(null)
  const [first, setFirst] = useState(1), [last, setLast] = useState(1)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const operation = useRef<AbortController | null>(null)
  const latest = useRef({ project, nodeId: node.id, canvas, locked })
  latest.current = { project, nodeId: node.id, canvas, locked }
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => () => operation.current?.abort(), [project, node.id])
  const editing = editingId ? bindings.find(binding => binding.id === editingId) : undefined
  const resolution = editing && source ? resolveSourceBinding(editing, source) : null
  const read = async (file: string, signal: AbortSignal) => {
    if (!validSourcePath(file) || file.includes('#')) throw new Error(zh ? '请选择项目内的源码文件。' : 'Choose a source file in this project.')
    assertEditorClean(project, file)
    const record = await request<{ content: string; digest: string }>(`/workspaces/${encodeURIComponent(project)}/files/${file.split('/').map(encodeURIComponent).join('/')}`, { signal })
    const observed = { workspace: project, path: file, digest: record.digest, content: record.content }
    validateSourceSnapshot(observed)
    assertEditorClean(project, file)
    return observed
  }
  const choose = (next: DesignSourceRange, observed: DesignSourceSnapshot) => {
    setRange(next)
    const firstLine = observed.content.slice(0, next.start).split('\n').length
    setFirst(firstLine); setLast(observed.content.slice(0, next.end).split('\n').length)
    list.current?.querySelector<HTMLElement>(`[data-design-source-line="${firstLine}"]`)?.scrollIntoView({ block: 'nearest' })
  }
  const load = async (file: string, binding?: CanvasSourceBinding) => {
    operation.current?.abort()
    const controller = new AbortController(); operation.current = controller
    setBusy(true); setError(''); setSource(null); setRange(null); setPath(file); setEditingId(binding?.id ?? null)
    try {
      const observed = await read(file, controller.signal)
      if (controller.signal.aborted || latest.current.project !== project || latest.current.nodeId !== node.id) return
      setSource(observed)
      // Changed source gets candidates only. Never highlight an old offset as current.
      const match = binding ? resolveSourceBinding(binding, observed) : null
      if (match?.state === 'exact') choose(match.candidates[0], observed)
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  const focused = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!focusBindingId || focusBindingId === focused.current) return
    const binding = bindings.find(item => item.id === focusBindingId)
    if (binding) { focused.current = focusBindingId; void load(binding.path, binding) }
    // Navigation is one-shot; ordinary saves must not reread or reset a manual correction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusBindingId, project, node.id])
  const confirm = async () => {
    if (!source || !range || busy || locked) return
    const displayed = source, selected = range, original = editing
    const originalJSON = original ? JSON.stringify(original) : null
    operation.current?.abort()
    const controller = new AbortController(); operation.current = controller
    setBusy(true); setError('')
    try {
      const fresh = await read(displayed.path, controller.signal)
      if (controller.signal.aborted || latest.current.project !== project || latest.current.nodeId !== node.id) return
      if (fresh.digest !== displayed.digest || fresh.content !== displayed.content) {
        setSource(fresh); setRange(null)
        throw new Error(zh ? '源码已变化；请重新选择当前范围，未保存旧映射。' : 'Source changed. Select a current range; the old mapping was not saved.')
      }
      if (latest.current.locked || isReviewLocked(project, CANVAS_PATH)) throw new Error(zh ? '设计正在审阅写入，请稍后重新检查。' : 'A review write is active; recheck before editing.')
      if (editingId && !original) throw new Error(zh ? '关联已被移除，请重新读取。' : 'The binding was removed. Read it again.')
      apply(current => {
        if (!current.nodes.some(item => item.id === node.id)) throw new Error('Design card no longer exists.')
        const existing = original && current.sourceBindings?.find(item => item.id === original.id)
        if (original && JSON.stringify(existing) !== originalJSON) throw new Error('Design mapping changed while checking source. Review it again.')
        const binding = original ? correctSourceBinding(original, fresh, selected.start, selected.end)
          : captureSourceBinding(fresh, [node.id], selected.start, selected.end)
        return putSourceBinding(current, binding, project)
      })
      setEditingId(null); setRange(null)
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  const stateLabel = (binding: CanvasSourceBinding) => {
    if (!source || source.path !== binding.path) return zh ? '尚未校验' : 'Not checked'
    return resolveSourceBinding(binding, source).state === 'exact' ? (zh ? '当前范围匹配' : 'Current range matches') : (zh ? '待校正' : 'Needs correction')
  }
  return <section className="space-y-2" data-design-source-editor={node.id}>
    <h3 className="text-caption font-medium text-ink-2">{zh ? '正文关联' : 'Manuscript links'}</h3>
    <p className="text-caption text-ink-3">{zh ? '一张卡片可对应多个正文块，同一正文块也可承接多张卡片。版本变化后必须校正，不按旧行号自动重绑。' : 'Cards and body blocks may have multiple links. Changed revisions require an explicit correction, never an old line number.'}</p>
    {bindings.map(binding => <div key={binding.id} data-design-binding={binding.id} className="space-y-1 rounded-md bg-elevated p-2 text-caption">
      <p className="break-all text-ink-2">{binding.path} · {binding.id}</p>
      <p className="break-all text-ink-3">{binding.digest} · [{binding.start}, {binding.end}) · {stateLabel(binding)}</p>
      <blockquote className="max-h-28 overflow-auto whitespace-pre-wrap text-ink-2">{binding.quote}</blockquote>
      <div className="flex flex-wrap gap-1">
        <Button size="xs" disabled={busy} onClick={() => void load(binding.path, binding)}>{zh ? '定位 / 校正' : 'Locate / correct'}</Button>
        <Button size="xs" disabled={!ready || busy} onClick={() => onContext(binding.id)}>{zh ? '仅此块上下文' : 'Context for this block'}</Button>
        <Button size="xs" disabled={locked || busy} onClick={() => apply(current => unlinkSourceBinding(current, binding.id, node.id))}>{zh ? '解除本卡关联' : 'Unlink this card'}</Button>
      </div>
    </div>)}
    <label className="block text-caption text-ink-2">{zh ? '项目源码路径' : 'Project source path'}
      <input className="ui-input mt-1 w-full" value={path} disabled={busy} onChange={event => setPath(event.target.value)} placeholder="sections/method.tex"/>
    </label>
    <Button size="xs" disabled={busy || !path.trim()} onClick={() => void load(path.trim())}>{zh ? '读取当前源码 / 新建关联' : 'Read current source / new link'}</Button>
    {source && <>
      <p className="break-all text-caption text-ink-3">{source.workspace}/{source.path} · {source.digest}</p>
      {resolution && resolution.state !== 'exact' && <div role="status" className="space-y-1 text-caption text-warn">
        <p>{zh ? '映射待确认。以下匹配仅为候选；也可在当前源码中手动选择范围。' : 'Mapping needs confirmation. Matches below are candidates only; a current range can also be selected manually.'}</p>
        {resolution.candidates.map(candidate => <Button key={candidate.start} size="xs" onClick={() => choose(candidate, source)}>{zh ? '查看候选' : 'Inspect candidate'} [{candidate.start}, {candidate.end})</Button>)}
        {!resolution.candidates.length && <p>{zh ? '原文未找到，请手动校正或解除关联。' : 'Original text not found. Correct manually or unlink.'}</p>}
        {resolution.truncated && <p>{zh ? '还有更多重复匹配，请手动缩小范围。' : 'More duplicate matches exist. Narrow the range manually.'}</p>}
      </div>}
      <div className="flex flex-wrap items-end gap-1">
        <label className="text-caption">{zh ? '起始行' : 'First line'}<input type="number" min={1} className="ui-input block w-20" value={first} onChange={event => { setFirst(Number(event.target.value)); setRange(null) }}/></label>
        <label className="text-caption">{zh ? '结束行' : 'Last line'}<input type="number" min={first} className="ui-input block w-20" value={last} onChange={event => { setLast(Number(event.target.value)); setRange(null) }}/></label>
        <Button size="xs" onClick={() => { try { choose(sourceLines(source, first, last), source); setError('') } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } }}>{zh ? '选择范围' : 'Select range'}</Button>
      </div>
      <div ref={list} className="max-h-60 overflow-auto rounded border border-line font-mono text-caption" aria-label={zh ? '当前源码（只读）' : 'Current source (read only)'}>
        {source.content.split('\n').map((line, index) => <div key={index} data-design-source-line={index + 1} className={range && index + 1 >= first && index + 1 <= last ? 'bg-hover' : ''}>
          <span className="mr-2 select-none text-ink-3">{index + 1}</span><span className="whitespace-pre">{line || ' '}</span>
        </div>)}
      </div>
      {range && <blockquote className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-elevated p-2 text-caption">{range.quote}</blockquote>}
      <Button size="xs" variant="outline" disabled={busy || locked || !range} onClick={() => void confirm()}>{editingId ? (zh ? '确认校正此关联' : 'Confirm this correction') : (zh ? '将所选范围关联到本卡' : 'Link the selected range to this card')}</Button>
      <p className="text-caption text-ink-3">{zh ? '仅保存设计映射，不修改正文；已有卡片关联会保留。' : 'Saves a design mapping only; source text and links to other cards stay intact.'}</p>
    </>}
    {busy && <p role="status" className="text-caption text-ink-3">{zh ? '正在核对当前源码…' : 'Checking current source…'}</p>}
    {error && <p role="alert" className="text-caption text-warn">{error}</p>}
  </section>
}
