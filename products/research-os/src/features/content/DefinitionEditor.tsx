import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { Textarea } from '../../components/forms'
import { registerReviewEditor } from '../review/write-coordinator'
import type { DraftScope } from '../projects/draft-model'
import { CONTENT_PATH, type ContentObject } from './content-model'
import { definitionDraftKey } from './definition-recovery'
export function initialDefinition(kind: ContentObject['kind']): Record<string, unknown> {
  if (kind === 'workflow') return { goal: '', nodes: [{ id: 'review', kind: 'Review', title: '人工检查', objective: '', inputs: [], acceptance: ['记录依据和结论'], dependsOn: [], execution: { type: 'human' } }] }
  if (kind === 'tool') return { executor: 'script', interpreter: 'python3', implementation: { kind: 'file', workspace: '', path: '', digest: '' }, argv: [], outputs: [], timeoutSeconds: 60 }
  return { inputs: [], steps: [], outputs: [], acceptance: [] }
}
export function DefinitionEditor({ object, scope, disabled, locale, onChange, onDirtyChange }: { object: ContentObject; scope: DraftScope; disabled: boolean; locale: 'zh' | 'en'; onChange: (definition: Record<string, unknown>) => void; onDirtyChange?: (dirty: boolean) => void }) {
  const external = JSON.stringify(object.definition ?? initialDefinition(object.kind), null, 2)
  const key = definitionDraftKey(scope.workspace, object.id)
  const [text, setText] = useState(external), [error, setError] = useState('')
  const dirty = useRef(false); dirty.current = text !== external
  useEffect(() => {
    let next = external, warning = ''
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null')
      if (saved && typeof saved.text === 'string') { next = saved.text; if (saved.base !== external) warning = locale === 'zh' ? '已恢复未保存定义，期间已保存的定义有变化；请核对后再保存。' : 'Recovered local definition. The saved definition changed; compare before saving.' }
    } catch { warning = locale === 'zh' ? '本地定义恢复不可用。' : 'Local definition recovery is unavailable.' }
    setText(next); setError(warning)
  }, [key, external, locale])
  useEffect(() => { onDirtyChange?.(text !== external); return () => onDirtyChange?.(false) }, [text, external, onDirtyChange])
  useEffect(() => registerReviewEditor(scope.workspace, CONTENT_PATH, { blocked: () => dirty.current, reload: async () => {} }), [scope.workspace, key])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn)
  }, [])
  const change = (next: string) => {
    setText(next)
    try { if (next === external) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify({ text: next, base: external })) } catch { setError(locale === 'zh' ? '本地恢复空间不可用，请保存定义后再离开。' : 'Local recovery is unavailable. Save the definition before leaving.') }
  }
  return <section className="space-y-2">
    <p className="text-caption font-medium text-ink-2">{locale === 'zh' ? '可复用定义' : 'Reusable definition'}</p>
    <p className="text-caption text-ink-3">{locale === 'zh' ? '输入、步骤、实现与产物保存在此对象中。保存定义后，可以在方法库中调用或创建执行版本。' : 'Inputs, steps, implementation and outputs belong to this object. Save the definition before using it from the method library.'}</p>
    <Textarea aria-label={locale === 'zh' ? '方法与工具定义' : 'Method and tool definition'} className="min-h-56 w-full font-mono text-caption" spellCheck={false} value={text} disabled={disabled} onChange={e => change(e.target.value)}/>
    <div className="flex gap-2"><Button size="xs" disabled={disabled} onClick={() => {
      try {
        const parsed: unknown = JSON.parse(text)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(locale === 'zh' ? '定义必须是 JSON 对象。' : 'Definition must be a JSON object.')
        onChange(parsed as Record<string, unknown>); setError('')
        try { localStorage.removeItem(key) } catch { /* The canonical writer retains its own local recovery. */ }
      } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    }}>{locale === 'zh' ? '保存定义' : 'Save definition'}</Button>
    {text !== external && <Button size="xs" disabled={disabled} onClick={() => { change(external); setError('') }}>{locale === 'zh' ? '恢复已保存定义' : 'Restore saved definition'}</Button>}</div>
    {error && <p role="alert" className="text-caption">{error}</p>}
  </section>
}
