import {PageActions} from '../../components/PageActions'
import {t as tr} from '../../i18n'
import {WorkflowCanvas, NODE_KINDS} from './WorkflowCanvas'
import {currentNodeId, kindStage, liveLine, nodeAgent, nodeStatus, type Draft, type PlanNode, type Receipt, type Run} from './workflow-model'
import {PanelHeader, IconBtn, Button} from '../../components/ui'
import {Input, Textarea, Select, FormField} from '../../components/forms'
import {Play, Plus, Settings2, Square, X, Trash2, Download} from 'lucide-react'
import {IconCanvas} from '../../components/icons'
import {getNativeProfiles} from '../chat/client'
import {listWorkspaces, request as apiRequest, type WorkspaceSummary} from '../../lib/api'
import type {NativeProfile} from '@xgc2/native-agent/state'
import {useAcademicNotes} from '../resources/useAcademicNotes'
import {parseCanvas, type CanvasNode} from '../projects/canvas-model'
import {useWorkbench} from '../../store'
import {useEffect, useMemo, useRef, useState} from 'react'

export type {PlanNode}
type Revision = {version: number; digest: string; draft: Draft; approved: boolean; runs: Run[]}
async function request<T>(url: string, body?: unknown, key?: string): Promise<T> {
  const response = await fetch(url, body === undefined ? undefined : {method: 'POST', headers: {'Content-Type': 'application/json', ...(key ? {'Idempotency-Key': key} : {})}, body: JSON.stringify(body)})
  const value = await response.json()
  if (!response.ok) throw new Error(value.error?.message || `Request failed (${response.status})`)
  return value.data as T
}
const blank = (): Draft => ({title: '', goal: '', workspace: {id: '', revision: ''}, researcher: '', reviewer: '', writer: '', nodes: [{id: 'evidence', kind: 'EvidenceRead', title: tr('证据研究'), objective: '', acceptance: [tr('每个结论关联可核对来源；明确未验证假设')], inputs: [], dependsOn: [], knowledge: []}]})
const STAGE_LABEL: Record<string, string> = {research: tr('研究'), review: tr('独立审查'), write: tr('写作')}

export function WorkflowPage({projectId, onQuote, onOpenSession}: {projectId: string | null; onQuote?: (text: string) => void; onOpenSession?: (id: string) => void}) {
  const {openCanvas, previewDocument, knowledgeDocuments} = useWorkbench()
  const {notes} = useAcademicNotes()
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [draft, setDraft] = useState<Draft>(blank)
  const [selectedNode, setSelectedNode] = useState('')
  const [editing, setEditing] = useState(false)
  const [editingBaseVersion, setEditingBaseVersion] = useState(0)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [profiles, setProfiles] = useState<NativeProfile[]>([])
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [thoughts, setThoughts] = useState<CanvasNode[]>([])
  const [assembling, setAssembling] = useState('')
  const generation = useRef(0)
  const executionKeys = useRef<Record<string, string>>({})
  const savedDrafts = useRef<Record<string, {draft: Draft; baseVersion: number}>>({})
  const draftProject = useRef(projectId)
  useEffect(() => {if (projectId && editing && draftProject.current === projectId) savedDrafts.current[projectId] = {draft, baseVersion: editingBaseVersion}}, [draft, projectId, editing, editingBaseVersion])
  const base = `/api/v1/research/projects/${encodeURIComponent(projectId || '')}/plans`
  const head = revisions[0]
  useEffect(() => {setConsent(false)}, [head?.digest])
  useEffect(() => {
    const current = ++generation.current
    draftProject.current = projectId
    setBusy(false)
    setRevisions([]); setDraft(savedDrafts.current[projectId || '']?.draft || blank()); setEditing(false); setConsent(false); setError(''); setAssembling(''); setThoughts([])
    if (!projectId) return
    const refresh = () => request<Revision[]>(base).then(data => {if (current === generation.current) setRevisions(data)}).catch(reason => {if (current === generation.current) setError(String(reason.message))})
    void refresh()
    const controller = new AbortController()
    void Promise.allSettled([getNativeProfiles(controller.signal), listWorkspaces(controller.signal)]).then(([p, w]) => {
      if (controller.signal.aborted) return
      if (p.status === 'fulfilled') setProfiles(p.value)
      if (w.status === 'fulfilled') setWorkspaces(w.value)
      if (p.status === 'rejected' || w.status === 'rejected') setError('无法加载工作者或工作区，请刷新后再配置计划。')
    })
    void apiRequest<{content: string}>(`/workspaces/${encodeURIComponent(projectId)}/files/thinking.canvas.json`, {signal: controller.signal})
      .then(d => {if (!controller.signal.aborted) setThoughts(parseCanvas(d.content).nodes)})
      .catch(() => {if (!controller.signal.aborted) setThoughts([])})
    return () => {++generation.current; controller.abort()}
  }, [base, projectId])
  const running = revisions.some(revision => revision.runs.some(run => run.status === 'running'))
  useEffect(() => {
    if (!running) return
    const current = generation.current
    const timer = window.setInterval(() => {if (document.visibilityState === 'visible') void request<Revision[]>(base).then(data => {if (current === generation.current) setRevisions(data)}).catch(() => {})}, 800)
    return () => window.clearInterval(timer)
  }, [running, base])
  async function action(work: () => Promise<unknown>, savedDraft = false) {
    const current = generation.current; setBusy(true); setError('')
    try {
      await work()
      const data = await request<Revision[]>(base)
      if (current === generation.current) {
        setRevisions(data)
        if (savedDraft && projectId) {delete savedDrafts.current[projectId]; setEditing(false); setSelectedNode('')}
        setConsent(false)
      }
    } catch (reason) {if (current === generation.current) setError(reason instanceof Error ? reason.message : String(reason))}
    finally {if (current === generation.current) setBusy(false)}
  }
  function executeApproved() {
    if (!head) return Promise.resolve()
    const identity = `${projectId}/${head.version}/${head.digest}/${head.runs[0]?.id || 'initial'}`
    const key = executionKeys.current[identity] ||= crypto.randomUUID()
    return request(`${base}/${head.version}/execute`, {digest: head.digest}, key)
  }
  const download = async (format: string) => {
    if (!head) return
    try {
      const data = await request<unknown>(`${base}/${head.version}/export/${format}`)
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}))
      const link = document.createElement('a'); link.href = url; link.download = `research-plan-v${head.version}.${format}.json`; link.click(); URL.revokeObjectURL(url)
    } catch (reason) {setError(String(reason))}
  }
  function beginEdit() {
    if (!projectId) return
    const saved = savedDrafts.current[projectId]
    setDraft(saved?.draft || (head ? structuredClone(head.draft) : blank()))
    setEditingBaseVersion(saved?.baseVersion ?? head?.version ?? 0)
    setSelectedNode(''); setEditing(true); setAssembling('')
  }
  const visible = editing ? draft : head?.draft
  const chosen = visible?.nodes.find(node => node.id === selectedNode)
  const latestRun = head?.runs[0]
  const nowId = currentNodeId(visible?.nodes || [], latestRun)
  const live = liveLine(latestRun)
  const available = profiles.filter(p => p.available)
  const changeNode = (id: string, patch: Partial<PlanNode>) => setDraft(current => ({...current, nodes: current.nodes.map(node => node.id === id ? {...node, ...patch} : node)}))
  const addNode = () => {
    const node: PlanNode = {id: `step${crypto.randomUUID().replace(/-/g, '')}`, kind: 'DerivationCheck', title: `${tr('验证')} ${draft.nodes.length}`, objective: '', acceptance: [tr('保留可重现检查与失败记录')], inputs: [], dependsOn: draft.nodes.length ? [draft.nodes[draft.nodes.length - 1].id] : [], knowledge: []}
    setDraft(current => ({...current, nodes: [...current.nodes, node]})); setSelectedNode(node.id)
  }
  function assignAgent(target: string) {
    if (!assembling) return
    if (target === 'researcher' || target === 'reviewer' || target === 'writer') setDraft(current => ({...current, [target]: assembling}))
    else changeNode(target, {agent: assembling})
    setAssembling('')
  }
  const relatedThoughts = useMemo(() => {
    if (!chosen) return thoughts.slice(0, 4)
    const keys = [chosen.title, ...(chosen.knowledge || []), ...chosen.inputs]
    return thoughts.filter(n => keys.some(k => k && (n.title.includes(k) || n.body?.includes(k) || n.ref?.path === k || n.anchor?.includes(k)))).slice(0, 6)
  }, [chosen, thoughts])
  const knowledgeIndex = useMemo(() => new Map((knowledgeDocuments.length ? knowledgeDocuments : notes).map(n => [n.path, n])), [knowledgeDocuments, notes])

  return <div className="workflow-page flex h-full min-h-0 flex-col">
    <PageActions page="workflow">
      {editing ? <>
        <Button variant="solid" loading={busy} onClick={() => void action(() => request(base, {baseVersion: editingBaseVersion, draft}), true)}>{tr('保存新版本')}</Button>
        <Button icon={Plus} disabled={busy || draft.nodes.length >= 32} onClick={addNode}>{tr('添加步骤')}</Button>
        <IconBtn icon={Settings2} label={tr('计划设置')} onClick={() => setSelectedNode('')}/>
        <Button disabled={busy} onClick={() => {setEditing(false); setAssembling('')}}>{tr('取消')}</Button>
      </> : <>
        <Button variant="solid" icon={running ? Square : head?.approved ? Play : Plus} disabled={!projectId || busy} onClick={() => {
          if (running) {
            const revision = revisions.find(r => r.runs.some(run => run.status === 'running'))!
            const run = revision.runs.find(run => run.status === 'running')!
            void action(() => request(`${base}/${revision.version}/runs/${run.id}/cancel`, {}))
          } else if (head?.approved) void action(executeApproved)
          else beginEdit()
        }}>{running ? tr('停止运行') : head?.approved ? tr('开始研究、验证与写作') : head ? tr('修订计划') : tr('创建计划')}</Button>
        {head && <><IconBtn icon={Settings2} label={tr('计划设置')} onClick={() => setSelectedNode('')}/>{head.approved && <Button disabled={busy} onClick={beginEdit}>{tr('修订计划')}</Button>}<Button icon={Download} onClick={() => void download('planweave')}>{tr('导出 PlanWeave')}</Button></>}
      </>}
    </PageActions>
    {error && <p role="alert" className="ui-error">{error}</p>}
    <div className="workflow-layout flex min-h-0 flex-1">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <WorkflowCanvas key={`${projectId}:${editing ? 'draft' : head?.digest || 'empty'}`} nodes={visible?.nodes || []} selected={selectedNode} onSelect={id => {setSelectedNode(id); if (assembling) assignAgent(id)}}
        onLink={editing ? (from, to) => {const node = draft.nodes.find(n => n.id === to)!; if (!node.dependsOn.includes(from)) changeNode(to, {dependsOn: [...node.dependsOn, from]})} : undefined}
        statusOf={id => nodeStatus(visible?.nodes.find(n => n.id === id)?.kind || '', latestRun)}
        nowId={nowId} liveOf={id => (nowId === id ? live?.text : '') || ''}
        agentOf={id => {const n = visible?.nodes.find(x => x.id === id); return n ? nodeAgent(n, visible) : ''}}
        assembling={editing ? assembling : ''} onAssemble={editing ? assignAgent : undefined}
        empty={<><h2 className="font-display text-[24px] tracking-tight">{projectId ? tr('建立研究工作流') : tr('选择研究项目')}</h2><p className="mt-2 max-w-xs text-secondary leading-relaxed text-ink-3">{projectId ? tr('添加步骤、连接依赖，再为每一步设置证据与验收条件。') : tr('工作流属于具体研究项目。选择或创建项目后开始编排。')}</p></>}/>
      {visible && <CrewDock draft={visible} editing={editing} assembling={assembling} onPick={id => setAssembling(a => a === id ? '' : id)} onSlot={assignAgent} run={latestRun} profiles={available} onOpenSession={onOpenSession} live={live}/>}
      </div>
      {visible && <aside className="flex w-[320px] shrink-0 flex-col overflow-hidden border-l border-line bg-panel">
        <PanelHeader title={chosen ? chosen.title : tr('计划设置')} actions={chosen ? <IconBtn icon={X} label={tr('返回计划设置')} onClick={() => setSelectedNode('')}/> : projectId ? <IconBtn icon={IconCanvas} label={tr('思维白板')} onClick={() => openCanvas(projectId)}/> : undefined}/>
        <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
          {editing ? <form className="space-y-4" onSubmit={e => {e.preventDefault(); void action(() => request(base, {baseVersion: editingBaseVersion, draft}), true)}}>
            {chosen ? <NodeEditor node={chosen} draft={draft} profiles={available} notes={[...knowledgeIndex.values()]} thoughts={relatedThoughts} onChange={patch => changeNode(chosen.id, patch)} onDelete={() => {setDraft(current => ({...current, nodes: current.nodes.filter(n => n.id !== chosen.id).map(n => ({...n, dependsOn: n.dependsOn.filter(id => id !== chosen.id)}))})); setSelectedNode('')}} onOpenThought={() => projectId && openCanvas(projectId)} onOpenNote={path => {const note = knowledgeIndex.get(path); if (note) previewDocument({workspace: 'academic', path: note.path, title: note.title})}}/> : <PlanEditor draft={draft} setDraft={setDraft} workspaces={workspaces} profiles={available}/>}
          </form> : <div className="space-y-4">
            {chosen ? <NodeRead node={chosen} agent={nodeAgent(chosen, visible)} thoughts={relatedThoughts} notes={knowledgeIndex} run={latestRun} onEdit={() => {beginEdit(); setSelectedNode(chosen.id)}} onOpenThought={() => projectId && openCanvas(projectId)} onOpenNote={path => {const note = knowledgeIndex.get(path); if (note) previewDocument({workspace: 'academic', path: note.path, title: note.title})}} onOpenSession={onOpenSession}/> : head && <PlanRead head={head} consent={consent} setConsent={setConsent} busy={busy} onApprove={() => void action(() => request(`${base}/${head.version}/approve`, {digest: head.digest, nativeAccessConfirmed: true}))} onExport={download} htmlHref={`${base}/${head.version}/export/html`} onQuote={onQuote} onOpenSession={onOpenSession} revisions={revisions}/>}
          </div>}
        </div>
      </aside>}
    </div>
  </div>
}

function CrewDock({draft, editing, assembling, onPick, onSlot, run, profiles, onOpenSession, live}: {
  draft: Draft; editing: boolean; assembling: string; onPick: (id: string) => void; onSlot: (role: string) => void
  run?: Run; profiles: NativeProfile[]; onOpenSession?: (id: string) => void; live: ReturnType<typeof liveLine>
}) {
  const slots: {role: 'researcher' | 'reviewer' | 'writer'; stage: string; label: string}[] = [
    {role: 'researcher', stage: 'research', label: tr('研究')},
    {role: 'reviewer', stage: 'review', label: tr('独立审查')},
    {role: 'writer', stage: 'write', label: tr('写作')},
  ]
  const receipt = (stage: string) => run?.receipts.find(r => r.stage === stage)
  return <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3" data-xgc-role="workflow-crew">
    <div className="pointer-events-auto flex max-w-[min(640px,100%)] flex-col gap-1.5">
      {live && <p className="mx-auto max-w-xl truncate rounded-full border border-line bg-panel/95 px-3 py-1 text-center text-caption text-ink-2 shadow-soft">{STAGE_LABEL[live.stage] || live.stage}{live.text ? ` · ${live.text}` : ''}</p>}
      <div className="flex items-center gap-1 rounded-full border border-line bg-panel/95 p-1 shadow-soft">
        {slots.map((slot, i) => {
          const r = receipt(slot.stage)
          const active = r && (r.status === 'running' || r.status === 'starting' || r.status === 'awaiting-input')
          const done = r && (r.status === 'completed' || r.status === 'success')
          return <div key={slot.role} className="flex min-w-0 items-center">
            {i > 0 && <span aria-hidden className="mx-0.5 h-px w-4 bg-line"/>}
            <button type="button" data-role={slot.role} aria-pressed={assembling !== '' && assembling === draft[slot.role]}
              className={`flex h-8 min-w-0 items-center gap-2 rounded-full px-2.5 text-caption transition-colors ${active ? 'bg-ink text-base' : done ? 'text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}
              onClick={() => {if (editing && assembling) onSlot(slot.role); else if (r?.sessionId && onOpenSession) onOpenSession(r.sessionId)}}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-base pulse-dot' : done ? 'bg-ink' : 'bg-ink/30'}`}/>
              <span className="shrink-0">{slot.label}</span>
              <span className="max-w-[7rem] truncate">{draft[slot.role] || '—'}</span>
            </button>
          </div>
        })}
      </div>
      {editing && <div className="flex flex-wrap justify-center gap-1 px-1">
        {profiles.map(p => <button key={p.id} type="button" data-xgc-role="crew-profile" aria-pressed={assembling === p.id} onClick={() => onPick(p.id)}
          className={`rounded-full px-2.5 py-1 text-caption transition-colors ${assembling === p.id ? 'bg-ink text-base' : 'border border-line bg-panel text-ink-2 hover:border-line-strong hover:text-ink'}`}>{p.provider === p.id ? p.id : `${p.provider} · ${p.id}`}</button>)}
        {assembling && <span className="px-2 py-1 text-caption text-ink-3">{tr('点选步骤或角色槽以挂上这个工作者')}</span>}
      </div>}
    </div>
  </div>
}

function NodeEditor({node, draft, profiles, notes, thoughts, onChange, onDelete, onOpenThought, onOpenNote}: {
  node: PlanNode; draft: Draft; profiles: NativeProfile[]; notes: {path: string; title: string}[]; thoughts: CanvasNode[]
  onChange: (patch: Partial<PlanNode>) => void; onDelete: () => void; onOpenThought: () => void; onOpenNote: (path: string) => void
}) {
  return <>
    <FormField htmlFor="step-title" label={tr('步骤名称')}><Input id="step-title" required value={node.title} onChange={e => onChange({title: e.target.value})}/></FormField>
    <FormField htmlFor="step-kind" label={tr('步骤类型')}><Select id="step-kind" value={node.kind} onValueChange={kind => onChange({kind})}>{Object.entries(NODE_KINDS).map(([value, label]) => <option key={value} value={value}>{tr(label)}</option>)}</Select></FormField>
    <FormField htmlFor="step-agent" label={tr('执行者')}><Select id="step-agent" value={node.agent || ''} onValueChange={agent => onChange({agent})}><option value="">{tr('跟随')} {tr(STAGE_LABEL[kindStage(node.kind)])}</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.provider === p.id ? p.id : `${p.provider} · ${p.id}`}</option>)}</Select></FormField>
    <FormField htmlFor="step-objective" label={tr('任务')}><Textarea id="step-objective" required value={node.objective} onChange={e => onChange({objective: e.target.value})}/></FormField>
    <FormField htmlFor="step-inputs" label={tr('证据输入（每行一个版本引用）')}><Textarea id="step-inputs" value={node.inputs.join('\n')} onChange={e => onChange({inputs: e.target.value.split('\n').filter(Boolean)})}/></FormField>
    <FormField htmlFor="step-acceptance" label={tr('验收条件（每行一条）')}><Textarea id="step-acceptance" required value={node.acceptance.join('\n')} onChange={e => onChange({acceptance: e.target.value.split('\n').filter(Boolean)})}/></FormField>
    <div className="ui-field"><span>{tr('知识库')}</span>
      <div className="mt-1 flex flex-wrap gap-1">{(node.knowledge || []).map(path => <span key={path} className="flex items-center gap-1 rounded-md bg-inset px-1.5 py-0.5 text-caption text-ink-2"><button type="button" onClick={() => onOpenNote(path)}>{notes.find(n => n.path === path)?.title || path.split('/').pop()}</button><button type="button" aria-label={tr('取消链接')} onClick={() => onChange({knowledge: (node.knowledge || []).filter(p => p !== path)})}><X size={10}/></button></span>)}
        <Select value="" onValueChange={path => {if (path && !(node.knowledge || []).includes(path)) onChange({knowledge: [...(node.knowledge || []), path]})}}><option value="">{tr('链接一篇笔记')}</option>{notes.slice(0, 80).map(n => <option key={n.path} value={n.path}>{n.title}</option>)}</Select>
      </div>
    </div>
    <div className="ui-field"><span>{tr('前置步骤')}</span>{draft.nodes.slice(0, draft.nodes.findIndex(n => n.id === node.id)).map(dep => <label key={dep.id} className="flex items-center gap-2"><input type="checkbox" checked={node.dependsOn.includes(dep.id)} onChange={e => onChange({dependsOn: e.target.checked ? [...node.dependsOn, dep.id] : node.dependsOn.filter(id => id !== dep.id)})}/>{dep.title}</label>)}</div>
    {thoughts.length > 0 && <div><h4 className="mb-1.5 text-caption font-semibold text-ink-3">{tr('思维链')}</h4><ul className="space-y-1">{thoughts.map(t => <li key={t.id}><button type="button" className="text-secondary text-ink-2 hover:text-ink" onClick={onOpenThought}>{t.title}</button></li>)}</ul></div>}
    <Button icon={Trash2} disabled={draft.nodes.length <= 1} onClick={onDelete}>{tr('删除步骤')}</Button>
  </>
}

function PlanEditor({draft, setDraft, workspaces, profiles}: {draft: Draft; setDraft: (d: Draft) => void; workspaces: WorkspaceSummary[]; profiles: NativeProfile[]}) {
  return <>
    <FormField htmlFor="plan-title" label={tr('计划名称')}><Input id="plan-title" required value={draft.title} onChange={e => setDraft({...draft, title: e.target.value})}/></FormField>
    <FormField htmlFor="plan-goal" label={tr('研究目标')}><Textarea id="plan-goal" required value={draft.goal} onChange={e => setDraft({...draft, goal: e.target.value})}/></FormField>
    <FormField htmlFor="plan-workspace" label={tr('工作区')}><Select id="plan-workspace" required value={draft.workspace.id} onValueChange={id => setDraft({...draft, workspace: {id, revision: workspaces.find(w => w.workspaceId === id)?.head || ''}})}><option value="">{tr('选择工作区')}</option>{workspaces.map(w => <option key={w.workspaceId} value={w.workspaceId}>{w.workspaceId}</option>)}</Select></FormField>
    <FormField htmlFor="plan-revision" label={tr('已审阅 Git commit')}><Input id="plan-revision" required value={draft.workspace.revision} onChange={e => setDraft({...draft, workspace: {...draft.workspace, revision: e.target.value}})}/></FormField>
    {(['researcher', 'reviewer', 'writer'] as const).map((role, index) => <FormField key={role} htmlFor={`plan-${role}`} label={[tr('研究员'), tr('独立审查'), tr('写作')][index]}><Select id={`plan-${role}`} required value={draft[role]} onValueChange={id => setDraft({...draft, [role]: id})}><option value="">{tr('选择原生工作者')}</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.provider === p.id ? p.id : `${p.provider} · ${p.id}`}</option>)}</Select></FormField>)}
  </>
}

function NodeRead({node, agent, thoughts, notes, run, onEdit, onOpenThought, onOpenNote, onOpenSession}: {
  node: PlanNode; agent: string; thoughts: CanvasNode[]; notes: Map<string, {path: string; title: string}>; run?: Run
  onEdit: () => void; onOpenThought: () => void; onOpenNote: (path: string) => void; onOpenSession?: (id: string) => void
}) {
  const receipt = run?.receipts.find(r => r.stage === kindStage(node.kind))
  return <>
    <p className="text-caption text-ink-3">{tr(NODE_KINDS[node.kind])}{agent ? ` · ${agent}` : ''}</p>
    <p className="whitespace-pre-wrap text-secondary leading-relaxed text-ink-2">{node.objective}</p>
    <div><h4 className="mb-2 text-caption font-semibold text-ink-3">{tr('验收条件')}</h4><ul className="space-y-2 text-secondary">{node.acceptance.map((text, i) => <li key={i}>{text}</li>)}</ul></div>
    {(node.knowledge?.length || 0) > 0 && <div><h4 className="mb-2 text-caption font-semibold text-ink-3">{tr('知识库')}</h4><div className="flex flex-wrap gap-1">{node.knowledge!.map(path => <button key={path} type="button" className="rounded-md bg-inset px-1.5 py-0.5 text-caption text-ink-2 hover:text-ink" onClick={() => onOpenNote(path)}>{notes.get(path)?.title || path.split('/').pop()}</button>)}</div></div>}
    {node.inputs.length > 0 && <div><h4 className="mb-2 text-caption font-semibold text-ink-3">{tr('证据输入')}</h4><p className="break-all text-secondary">{node.inputs.join('\n')}</p></div>}
    {thoughts.length > 0 && <div><h4 className="mb-2 text-caption font-semibold text-ink-3">{tr('思维链')}</h4><ul className="space-y-1">{thoughts.map(t => <li key={t.id}><button type="button" className="text-secondary text-ink-2 hover:text-ink" onClick={onOpenThought}>{t.title}</button></li>)}</ul></div>}
    {receipt?.sessionId && onOpenSession && <Button pulse={receipt.status === 'awaiting-input'} onClick={() => onOpenSession(receipt.sessionId)}>{receipt.status === 'awaiting-input' ? tr('处理审批') : tr('打开会话与审批')}</Button>}
    <Button variant="outline" onClick={onEdit}>{tr('编辑步骤')}</Button>
  </>
}

function PlanRead({head, consent, setConsent, busy, onApprove, onExport, htmlHref, onQuote, onOpenSession, revisions}: {
  head: Revision; consent: boolean; setConsent: (v: boolean) => void; busy: boolean
  onApprove: () => void; onExport: (format: string) => void; htmlHref: string; onQuote?: (text: string) => void; onOpenSession?: (id: string) => void
  revisions: Revision[]
}) {
  return <>
    <h3 className="text-title font-semibold">{head.draft.title}</h3>
    <p className="text-secondary leading-relaxed text-ink-2">{head.draft.goal}</p>
    <div className="rounded-md bg-inset p-3 text-caption text-ink-2">{tr('版本')} {head.version} · {head.approved ? tr('已批准') : tr('待批准')}<p className="mt-1 break-all text-ink-3">{head.draft.workspace.id} · {head.draft.workspace.revision.slice(0, 12)}</p></div>
    {!head.approved && <><label className="flex items-start gap-2 text-secondary leading-relaxed"><input type="checkbox" className="mt-1" checked={consent} onChange={e => setConsent(e.target.checked)}/>{tr('批准此版本，并允许三个原生 Agent 访问该工作区副本')}</label><Button variant="solid" disabled={!consent || busy} onClick={onApprove}>{tr('批准版本')} {head.version}</Button></>}
    {head.runs[0] && <RunCard run={head.runs[0]} onQuote={onQuote} onOpenSession={onOpenSession}/>}
    <div className="flex flex-wrap gap-2"><Button onClick={() => void onExport('archify')}>{tr('导出 Archify 图源')}</Button><a className="inline-flex h-7 items-center text-secondary text-ink-2 underline" href={htmlHref} download>{tr('导出交互图')}</a></div>
    {revisions.length > 1 && <details><summary className="cursor-pointer text-secondary text-ink-2">{tr('版本历史')} · {revisions.length}</summary>{revisions.slice(1).map(r => <div key={r.version} className="mt-2 border-t border-line pt-2 text-secondary">{tr('版本')} {r.version} · {r.draft.title}</div>)}</details>}
  </>
}

function RunCard({run, onQuote, onOpenSession}: {run: Run; onQuote?: (text: string) => void; onOpenSession?: (id: string) => void}) {
  return <div className="space-y-2">
    {run.failure && <p role="alert" className="ui-error">{run.failure}</p>}
    {run.researchAcceptance === 'awaiting-human-acceptance' && <p className="text-secondary text-ink-2">{tr('执行完成，研究成果等待人工验收。')}</p>}
    {run.receipts.map(receipt => <ReceiptRow key={receipt.stage} receipt={receipt} onQuote={onQuote} onOpenSession={onOpenSession}/>)}
  </div>
}

function ReceiptRow({receipt, onQuote, onOpenSession}: {receipt: Receipt; onQuote?: (text: string) => void; onOpenSession?: (id: string) => void}) {
  return <div className="border-t border-line py-2">
    <div className="flex items-center gap-2"><span className="text-secondary font-medium">{STAGE_LABEL[receipt.stage] || receipt.stage}</span><span className="text-caption text-ink-3">{tr(receipt.status)}</span>{receipt.sessionId && onOpenSession && <Button variant={receipt.status === 'awaiting-input' ? 'solid' : 'ghost'} pulse={receipt.status === 'awaiting-input'} className="ml-auto" onClick={() => onOpenSession(receipt.sessionId)}>{receipt.status === 'awaiting-input' ? tr('处理审批') : tr('打开会话')}</Button>}</div>
    {receipt.output && <details><summary className="text-secondary">{tr('查看输出')}</summary><pre>{receipt.output}</pre>{onQuote && <Button onClick={() => onQuote(receipt.output)}>{tr('引用到讨论')}</Button>}</details>}
  </div>
}
