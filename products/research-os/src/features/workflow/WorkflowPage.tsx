import {useEffect, useMemo, useRef, useState} from 'react'
import {Play, Plus, Settings2, Square, X, Trash2, Download, Pause} from 'lucide-react'
import {PageActions} from '../../components/PageActions'
import {t as tr} from '../../i18n'
import {WorkflowCanvas, NODE_KINDS} from './WorkflowCanvas'
import {currentNodeId, defaultRole, liveLine, nodeAgent, nodeStatus, recoverable, unresolved, NODE_STATUS_LABEL, type Draft, type InvokeKind, type PlanNode, type Receipt, type Revision, type Run} from './workflow-model'
import {executeBody, prepareExecutionIntent, reconcileExecutionIntent, subscribeWorkflow, workflowBase, workflowRequest as request, type StreamState} from './workflow-client'
import {PanelHeader, IconBtn, Button} from '../../components/ui'
import {Input, Textarea, Select, FormField} from '../../components/forms'
import {IconCanvas} from '../../components/icons'
import {getNativeProfiles} from '../chat/client'
import {listWorkspaces, request as apiRequest, type WorkspaceSummary} from '../../lib/api'
import type {AgentProfile} from '@xgc2/agent-runtime/state'
import {useAcademicNotes} from '../resources/useAcademicNotes'
import {type CanvasNode} from '../projects/canvas-model'
import {useWorkbench} from '../../store'
import {contentPort} from '../content/content-client'
import {projectCanvas} from '../content/content-model'
import {MethodLibrary} from './MethodLibrary'
import {ReceiptActions} from './ReceiptActions'
import {readWorkflowFocus, subscribeWorkflowFocus, type WorkflowFocus} from './workflow-focus'
import {readWorkflowDraft,saveWorkflowDraft,clearWorkflowDraft} from './workflow-draft'

export type {PlanNode}
const roles = ['researcher', 'reviewer', 'writer'] as const
const ROLE_LABEL = {researcher: '默认研究者', reviewer: '默认审查者', writer: '默认写作者'}
const blank = (): Draft => ({title: '', goal: '', workspace: {id: '', revision: ''}, researcher: '', reviewer: '', writer: '', nodes: [{id: 'evidence', kind: 'EvidenceRead', title: tr('证据研究'), objective: '', acceptance: [tr('每个结论关联可核对来源；明确未验证假设')], inputs: [], dependsOn: [], knowledge: []}]})
const message = (error: unknown) => error instanceof Error ? error.message : String(error)
const RUN_LABEL: Record<Run['status'], string> = {running: '运行中', paused: '已在节点边界暂停', interrupted: '中断，需核对原回执', completed: '执行完成', failed: '执行失败', cancelled: '已确认取消', needs_changes: '证据需补充', 'awaiting-adjudication': '待证据裁定', 'awaiting-input':'等待人工结果'}
const KIND_LABEL: Record<InvokeKind, string> = {research: '获批节点执行', continuous: '连续研究（一页）', verification: '研究验证', archive: '文献归档', writing: '写作应用'}

export function WorkflowPage({projectId, onQuote, onOpenSession}: {projectId: string | null; onQuote?: (text: string) => void; onOpenSession?: (id: string) => void}) {
  const {openCanvas, openResource, previewDocument, knowledgeDocuments, locale} = useWorkbench()
  const {notes} = useAcademicNotes()
  const [revisions, setRevisions] = useState<Revision[]>([]), [selectedVersion, setSelectedVersion] = useState(0)
  const [selectedRunId,setSelectedRunId]=useState(''), lastFocus=useRef('')
  const [draft, setDraft] = useState<Draft>(blank), [selectedNode, setSelectedNode] = useState('')
  const [editing, setEditing] = useState(false), [editingBaseVersion, setEditingBaseVersion] = useState(0)
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [stream, setStream] = useState<StreamState>('connecting')
  const [profiles, setProfiles] = useState<AgentProfile[]>([]), [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [thoughts, setThoughts] = useState<CanvasNode[]>([]), [assembling, setAssembling] = useState('')
  const [invokeKind, setInvokeKind] = useState<InvokeKind>('research')
  const [subscriptionId, setSubscriptionId] = useState('')
  const [hypothesisClaim, setHypothesisClaim] = useState('')
  const [hypothesisGrounds, setHypothesisGrounds] = useState('')
  const generation = useRef(0), inFlight = useRef(false), draftProject = useRef(projectId)
  const savedDrafts = useRef<Record<string, {draft: Draft; baseVersion: number}>>({})
  useEffect(() => {if (projectId && editing && draftProject.current === projectId) {
    const value={draft,baseVersion:editingBaseVersion};savedDrafts.current[projectId]=value
    try{saveWorkflowDraft(localStorage,projectId,value)}catch{setError('流程草稿尚在当前页面，但无法保存到浏览器。请保留此页面直至保存计划。')}
  }}, [draft, projectId, editing, editingBaseVersion])
  const base = workflowBase(projectId || '')
  const head = revisions[0], revision = revisions.find(r => r.version === selectedVersion) || head
  useEffect(() => {setConsent(false)}, [revision?.digest])
  useEffect(() => {
    const current = ++generation.current
    draftProject.current = projectId; inFlight.current = false
    setSelectedRunId('');lastFocus.current=''
    setBusy(false); setRevisions([]); setSelectedVersion(0); setSelectedNode(''); setProfiles([]); setWorkspaces([])
    let restored=projectId?savedDrafts.current[projectId]:undefined,recoveryError=''
    if(projectId&&!restored)try{restored=readWorkflowDraft(localStorage,projectId);if(restored)savedDrafts.current[projectId]=restored}catch(reason){recoveryError=message(reason)}
    setDraft(restored?.draft || blank());setEditingBaseVersion(restored?.baseVersion??0); setEditing(Boolean(restored)); setConsent(false); setError(recoveryError); setAssembling(''); setThoughts([])
    setStream('connecting')
    if (!projectId) return
    const stop = subscribeWorkflow(projectId, {
      snapshot: snapshot => {
        if (current !== generation.current) return
        setRevisions(snapshot.revisions)
        try { for (const r of snapshot.revisions) reconcileExecutionIntent(window.localStorage, projectId, r) }
        catch (reason) { setError(message(reason)) }
      },
      state: (state) => {if (current === generation.current) setStream(state)},
    })
    const controller = new AbortController()
    void Promise.allSettled([getNativeProfiles(controller.signal), listWorkspaces(controller.signal)]).then(([p, w]) => {
      if (controller.signal.aborted) return
      if (p.status === 'fulfilled') setProfiles(p.value)
      if (w.status === 'fulfilled') setWorkspaces(w.value)
      if (p.status === 'rejected' || w.status === 'rejected') setError('无法加载工作者或工作区；不能据此判断现有运行已停止。')
    })
    void contentPort({projectId,workspace:projectId}).read(controller.signal)
      .then(d => {if (!controller.signal.aborted) setThoughts(projectCanvas(d.document).nodes)})
      .catch(() => {if (!controller.signal.aborted) setThoughts([])})
    return () => {++generation.current; stop(); controller.abort()} // Unmount only detaches observers.
  }, [projectId])
  useEffect(()=>{
    const focus=(value:WorkflowFocus)=>{
      if(value.project!==projectId||lastFocus.current===value.nonce)return
      if(!revisions.some(r=>r.version===value.version&&r.runs.some(run=>run.id===value.runId)))return
      lastFocus.current=value.nonce;setSelectedVersion(value.version);setSelectedRunId(value.runId);setSelectedNode(value.nodeId??'');setEditing(false)
    }
    const current=readWorkflowFocus();if(current)focus(current)
    return subscribeWorkflowFocus(focus)
  },[projectId,revisions])
  async function action(work: () => Promise<unknown>, savedDraft = false) {
    if (inFlight.current) return
    const current = generation.current; inFlight.current = true; setBusy(true); setError('')
    try {
      await work()
      if (current === generation.current && savedDraft && projectId) {delete savedDrafts.current[projectId];setEditing(false);setSelectedNode('');setSelectedVersion(0);clearWorkflowDraft(localStorage,projectId)}
      // No follow-up list request: a late GET must not overwrite a newer SSE receipt.
    } catch (reason) {if (current === generation.current) setError(message(reason))}
    finally {if (current === generation.current) {inFlight.current = false; setBusy(false)}}
  }
  const activeRevision = revisions.find(r => r.runs.some(unresolved))
  const activeRun = activeRevision?.runs.find(unresolved)
  const ready = stream === 'live'
  function executeApproved() {
    if (!projectId || !revision || activeRun || !ready) return Promise.resolve()
    const key = prepareExecutionIntent(window.localStorage, projectId, revision, invokeKind)
    return request(`${base}/${revision.version}/execute`, executeBody(invokeKind, revision.digest, {subscriptionId, claim: hypothesisClaim, grounds: hypothesisGrounds}), key)
  }
  function controlRun(actionName: 'pause' | 'cancel' | 'resume') {
    if (!activeRun || !activeRevision) return Promise.resolve()
    return request(`${base}/${activeRevision.version}/runs/${encodeURIComponent(activeRun.id)}/${actionName}`, actionName === 'resume' ? {digest: activeRevision.digest} : {})
  }
  const download = async (format: string) => {
    if (!revision) return
    try {
      const data = await request<unknown>(`${base}/${revision.version}/export/${format}`)
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}))
      const link = document.createElement('a'); link.href = url; link.download = `research-plan-v${revision.version}.${format}.json`; link.click(); URL.revokeObjectURL(url)
    } catch (reason) {setError(message(reason))}
  }
  function beginEdit() {
    if (!projectId) return
    if(revision?.draft.source?.workspace){openResource({kind:'research',workspace:revision.draft.source.workspace,ownerProjectId:revision.draft.source.workspace,view:'table',objectId:revision.draft.source.id});return}
    const saved = savedDrafts.current[projectId]
    setDraft(saved?.draft || (revision ? structuredClone(revision.draft) : blank()))
    setEditingBaseVersion(saved?.baseVersion ?? head?.version ?? 0)
    setSelectedNode(''); setEditing(true); setAssembling('')
  }
  const visible = editing ? draft : revision?.draft, latestRun = revision?.runs.find(run=>run.id===selectedRunId)??revision?.runs[0]
  const chosen = visible?.nodes.find(n => n.id === selectedNode)
  const nowId = editing ? '' : currentNodeId(visible?.nodes || [], latestRun), live = editing ? null : liveLine(latestRun)
  const available = profiles.filter(p => p.available)
  const changeNode = (id: string, patch: Partial<PlanNode>) => setDraft(current => ({...current, nodes: current.nodes.map(n => n.id === id ? {...n, ...patch} : n)}))
  const addNode = () => {
    const node: PlanNode = {id: `step${crypto.randomUUID().replace(/-/g, '')}`, kind: 'DerivationCheck', title: `${tr('验证')} ${draft.nodes.length}`, objective: '', acceptance: [tr('保留可重现检查与失败记录')], inputs: [], dependsOn: draft.nodes.length ? [draft.nodes.at(-1)!.id] : [], knowledge: []}
    setDraft(current => ({...current, nodes: [...current.nodes, node]})); setSelectedNode(node.id)
  }
  function assignAgent(target: string) {
    if (!assembling) return
    if (roles.some(role => role === target)) setDraft(current => ({...current, [target]: assembling}))
    else changeNode(target, {agent: assembling})
    setAssembling('')
  }
  const relatedThoughts = useMemo(() => {
    if (!chosen) return thoughts.slice(0, 4)
    const keys = [chosen.title, ...(chosen.knowledge || []), ...chosen.inputs]
    return thoughts.filter(n => keys.some(k => k && (n.title.includes(k) || n.body?.includes(k) || n.ref?.path === k || n.anchor?.includes(k)))).slice(0, 6)
  }, [chosen, thoughts])
  const knowledgeIndex = useMemo(() => new Map((knowledgeDocuments.length ? knowledgeDocuments : notes).map(n => [n.path, n])), [knowledgeDocuments, notes])
  const openNote = (path: string) => {const note = knowledgeIndex.get(path); if (note) previewDocument({workspace: 'academic', path: note.path, title: note.title})}
  return <div className="workflow-page flex h-full min-h-0 flex-col">
    <PageActions page="workflow">
      {editing ? <>
        <Button variant="solid" loading={busy} disabled={!ready} onClick={() => void action(() => request(base, {baseVersion: editingBaseVersion, draft}), true)}>{tr('保存新版本')}</Button>
        <Button icon={Plus} disabled={busy || draft.nodes.length >= 32} onClick={addNode}>{tr('添加步骤')}</Button>
        <IconBtn icon={Settings2} label={tr('计划设置')} onClick={() => setSelectedNode('')}/>
        <Button disabled={busy} onClick={() => {setEditing(false); setAssembling('')}}>{tr('取消')}</Button>
      </> : <>
        {!activeRun && <Button variant="solid" icon={revision?.approved ? Play : Plus} disabled={!projectId || busy || !ready} onClick={() => {
          if (!revision?.approved) {beginEdit(); return}
          if (revision.runs.length && !window.confirm('重新执行这个获批版本？既有回执会保留；响应丢失时仍复用待确认请求。')) return
          void action(executeApproved)
        }}>{revision?.approved ? tr(revision.runs.length ? '再次运行获批版本' : '运行获批节点') : tr(revision ? '修订计划' : '创建计划')}</Button>}
        {activeRun?.status === 'running' && <>
          <Button icon={Pause} disabled={busy || !ready || Boolean(activeRun.control)} onClick={() => void action(() => controlRun('pause'))}>{tr('在节点边界暂停')}</Button>
          <Button icon={Square} disabled={busy || !ready || activeRun.control === 'cancel'} onClick={() => void action(() => controlRun('cancel'))}>{tr(activeRun.control === 'cancel' ? '等待停止回执' : '请求取消')}</Button>
        </>}
        {activeRun && recoverable(activeRun) && <Button variant="solid" disabled={busy || !ready} onClick={() => void action(() => controlRun('resume'))}>{tr('恢复同一运行')}</Button>}
        {revision && <><Button disabled={busy} onClick={beginEdit}>{tr('修订计划')}</Button><Button icon={Download} onClick={() => void download('planweave')}>{tr('导出 PlanWeave')}</Button><IconBtn icon={Settings2} label={tr('计划设置')} onClick={() => setSelectedNode('')}/></>}
      </>}
    </PageActions>
    {projectId && (revisions.length > 0 || activeRun) && <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2 text-caption text-ink-2">
      {revisions.length > 0 && <Select aria-label="查看计划版本" value={String(revision?.version || 0)} onValueChange={value => {setSelectedVersion(Number(value));setSelectedRunId(''); setSelectedNode('')}}>{revisions.map(r => <option key={r.version} value={String(r.version)}>v{r.version} · {r.draft.title}</option>)}</Select>}
      {activeRun && <button type="button" className="underline" onClick={() => {setSelectedVersion(activeRevision!.version); setEditing(false); setSelectedNode('')}}>v{activeRevision!.version} · {RUN_LABEL[activeRun.status]}{activeRun.control ? ` · ${activeRun.control === 'pause' ? '暂停待生效' : '取消待确认'}` : ''}</button>}
    </div>}
    {projectId&&<MethodLibrary key={projectId} projectId={projectId} workspaces={workspaces} profiles={profiles} baseVersion={head?.version??0} revision={revision} disabled={busy||!ready||Boolean(activeRun)} onCreated={created=>{if(created.projectId===draftProject.current){setEditing(false);setSelectedVersion(created.version)}}}/>}
    {error && <p role="alert" className="ui-error">{error}</p>}
    <div className="workflow-layout flex min-h-0 flex-1">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <WorkflowCanvas key={`${projectId}:${editing ? 'draft' : revision?.digest || 'empty'}`} nodes={visible?.nodes || []} selected={selectedNode} onSelect={id => {setSelectedNode(id); if (editing && assembling) assignAgent(id)}}
          onLink={editing ? (from, to) => {const node = draft.nodes.find(n => n.id === to)!; if (!node.dependsOn.includes(from)) changeNode(to, {dependsOn: [...node.dependsOn, from]})} : undefined}
          statusOf={id => nodeStatus(id, editing ? undefined : latestRun)} nowId={nowId} liveOf={id => (nowId === id ? live?.text : '') || ''}
          agentOf={id => {const n = visible?.nodes.find(x => x.id === id); return n ? nodeAgent(n, visible) : ''}} assembling={editing ? assembling : ''}
          empty={<><h2 className="font-display text-[24px] tracking-tight">{projectId ? tr('建立研究工作流') : tr('选择研究项目')}</h2><p className="mt-2 max-w-xs text-secondary leading-relaxed text-ink-3">{tr('每个获批节点独立执行，只接收声明的依赖、证据和验收条件。')}</p>
            {projectId && <div className="mt-3"><Button size="sm" variant="ghost" icon={IconCanvas} onClick={() => openCanvas(projectId)}>{locale === 'zh' ? '打开研究画布' : 'Open research canvas'}</Button></div>}</>}/>
        {visible && <div className="flex flex-wrap items-center gap-2 border-t border-line bg-panel p-3" data-xgc-role="workflow-crew">
          {editing ? <>
            {roles.map(role => <Button key={role} onClick={() => assignAgent(role)}>{ROLE_LABEL[role]} · {draft[role] || '未选择'}</Button>)}
            {available.map(p => <button key={p.id} type="button" aria-pressed={assembling === p.id} onClick={() => setAssembling(assembling === p.id ? '' : p.id)} className="rounded-full border border-line px-3 py-1 text-caption">{p.provider} · {p.id}</button>)}
            {assembling && <span className="text-caption">点选节点或默认角色以分配 {assembling}</span>}
          </> : <>{live && <p className="min-w-0 flex-1 truncate text-caption">{visible.nodes.find(n => n.id === live.stage)?.title} · {live.text}</p>}{latestRun?.receipts.map(r => <button key={r.stage} type="button" className="rounded-md border border-line px-2 py-1 text-caption" onClick={() => {setSelectedNode(r.stage); if (r.sessionId) onOpenSession?.(r.sessionId)}}>{visible.nodes.find(n => n.id === r.stage)?.title} · {r.profileId} · {NODE_STATUS_LABEL[nodeStatus(r.stage, latestRun)]}</button>)}</>}
        </div>}
      </div>
      {visible && <aside className="flex w-[320px] shrink-0 flex-col overflow-hidden border-l border-line bg-panel">
        <PanelHeader title={chosen?.title || tr('计划设置')} actions={chosen ? <IconBtn icon={X} label={tr('返回计划设置')} onClick={() => setSelectedNode('')}/> : projectId ? <IconBtn icon={IconCanvas} label={tr('思维白板')} onClick={() => openCanvas(projectId)}/> : undefined}/>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3.5">
          {editing ? chosen ? <>
            <FormField htmlFor="step-title" label={tr('步骤名称')}><Input id="step-title" required value={chosen.title} onChange={e => changeNode(chosen.id, {title: e.target.value})}/></FormField>
            <FormField htmlFor="step-kind" label={tr('步骤类型')}><Select id="step-kind" value={chosen.kind} onValueChange={kind => changeNode(chosen.id, {kind})}>{Object.entries(NODE_KINDS).map(([value, label]) => <option key={value} value={value}>{tr(label)}</option>)}</Select></FormField>
            <FormField htmlFor="step-execution" label="执行方式"><Select id="step-execution" value={chosen.execution?.type||'agent'} onValueChange={type=>changeNode(chosen.id,{execution:{type:type as 'human'|'agent'}})}><option value="agent">Agent</option><option value="human">人工判断</option></Select></FormField>
            <FormField htmlFor="step-agent" label={tr('执行者')}><Select id="step-agent" value={chosen.agent || ''} onValueChange={agent => changeNode(chosen.id, {agent})}><option value="">{ROLE_LABEL[defaultRole(chosen.kind)]}</option>{available.map(p => <option key={p.id} value={p.id}>{p.provider} · {p.id}</option>)}</Select></FormField>
            <FormField htmlFor="step-objective" label={tr('任务')}><Textarea id="step-objective" value={chosen.objective} onChange={e => changeNode(chosen.id, {objective: e.target.value})}/></FormField>
            <FormField htmlFor="step-hypothesis" label="待检验假设"><Textarea id="step-hypothesis" value={chosen.hypothesis || ''} onChange={e => changeNode(chosen.id, {hypothesis: e.target.value})}/></FormField>
            <FormField htmlFor="step-position" label="证据分支"><Select id="step-position" value={chosen.position || ''} onValueChange={position => changeNode(chosen.id, {position: position as PlanNode['position']})}><option value="">不预设方向</option><option value="support">寻找支持证据</option><option value="challenge">寻找反例与反对证据</option></Select></FormField>
            <FormField htmlFor="step-inputs" label={tr('证据输入（每行一个版本引用）')}><Textarea id="step-inputs" value={chosen.inputs.join('\n')} onChange={e => changeNode(chosen.id, {inputs: e.target.value.split('\n').filter(Boolean)})}/></FormField>
            <FormField htmlFor="step-acceptance" label={tr('验收条件（每行一条）')}><Textarea id="step-acceptance" value={chosen.acceptance.join('\n')} onChange={e => changeNode(chosen.id, {acceptance: e.target.value.split('\n').filter(Boolean)})}/></FormField>
            <div><h4 className="text-caption">{tr('前置步骤')}</h4>{draft.nodes.slice(0, draft.nodes.findIndex(n => n.id === chosen.id)).map(dep => <label key={dep.id} className="flex items-center gap-2 text-secondary"><input type="checkbox" checked={chosen.dependsOn.includes(dep.id)} onChange={e => changeNode(chosen.id, {dependsOn: e.target.checked ? [...chosen.dependsOn, dep.id] : chosen.dependsOn.filter(id => id !== dep.id)})}/>{dep.title}</label>)}</div>
            <div><h4 className="text-caption">{tr('知识库')}</h4>{(chosen.knowledge || []).map(path => <div key={path} className="flex gap-2 text-secondary"><button type="button" onClick={() => openNote(path)}>{knowledgeIndex.get(path)?.title || path}</button><button type="button" aria-label={tr('取消链接')} onClick={() => changeNode(chosen.id, {knowledge: chosen.knowledge!.filter(p => p !== path)})}>×</button></div>)}<Select aria-label="链接知识笔记" value="" onValueChange={path => {if (path && !chosen.knowledge?.includes(path)) changeNode(chosen.id, {knowledge: [...(chosen.knowledge || []), path]})}}><option value="">{tr('链接一篇笔记')}</option>{[...knowledgeIndex.values()].slice(0, 80).map(n => <option key={n.path} value={n.path}>{n.title}</option>)}</Select></div>
            <Button icon={Trash2} disabled={draft.nodes.length <= 1} onClick={() => {setDraft(current => ({...current, nodes: current.nodes.filter(n => n.id !== chosen.id).map(n => ({...n, dependsOn: n.dependsOn.filter(id => id !== chosen.id)}))})); setSelectedNode('')}}>{tr('删除步骤')}</Button>
          </> : <>
            <FormField htmlFor="plan-title" label={tr('计划名称')}><Input id="plan-title" value={draft.title} onChange={e => setDraft({...draft, title: e.target.value})}/></FormField>
            <FormField htmlFor="plan-goal" label={tr('研究目标')}><Textarea id="plan-goal" value={draft.goal} onChange={e => setDraft({...draft, goal: e.target.value})}/></FormField>
            <FormField htmlFor="plan-workspace" label={tr('工作区')}><Select id="plan-workspace" value={draft.workspace.id} onValueChange={id => setDraft({...draft, workspace: {id, revision: id ? 'working-tree' : ''}})}><option value="">{tr('选择工作区')}</option>{workspaces.map(w => <option key={w.workspaceId} value={w.workspaceId}>{w.workspaceId}</option>)}</Select></FormField>
            {roles.map(role => <FormField key={role} htmlFor={`plan-${role}`} label={ROLE_LABEL[role]}><Select id={`plan-${role}`} value={draft[role]} onValueChange={id => setDraft({...draft, [role]: id})}><option value="">{tr('选择供应者')}</option>{available.map(p => <option key={p.id} value={p.id}>{p.provider} · {p.id}</option>)}</Select></FormField>)}
            <p className="text-caption text-ink-3">默认角色仅决定未覆盖节点的执行者，不会添加隐藏的研究、审查或写作阶段。审查和综合必须作为节点明确加入。</p>
          </> : chosen ? <>
            <p className="text-caption">{tr(NODE_KINDS[chosen.kind])} · {nodeAgent(chosen, visible)} · {NODE_STATUS_LABEL[nodeStatus(chosen.id, latestRun)]}</p>
            <p className="whitespace-pre-wrap text-secondary">{chosen.objective}</p>
            {chosen.hypothesis && <p className="whitespace-pre-wrap text-secondary">{chosen.position === 'challenge' ? '反例分支' : chosen.position === 'support' ? '支持分支' : '待检验假设'}：{chosen.hypothesis}</p>}
            <h4 className="text-caption">{tr('验收条件')}</h4>{chosen.acceptance.map((value, i) => <p key={i} className="text-secondary">{value}</p>)}
            <h4 className="text-caption">{tr('证据输入')}</h4><pre className="whitespace-pre-wrap break-all text-caption">{chosen.inputs.join('\n')}</pre>
            {(chosen.knowledge || []).map(path => <button key={path} type="button" className="block text-secondary underline" onClick={() => openNote(path)}>{knowledgeIndex.get(path)?.title || path}</button>)}
            {latestRun?.receipts.filter(r => r.stage === chosen.id).map(r => <ReceiptRow key={r.stage} receipt={r} revision={revision} run={latestRun} onQuote={onQuote} onOpenSession={onOpenSession}/>)}
            <Button onClick={() => {beginEdit(); setSelectedNode(chosen.id)}}>{tr('编辑步骤')}</Button>
          </> : revision && <>
            <h3 className="text-title font-semibold">{revision.draft.title}</h3><p className="whitespace-pre-wrap text-secondary">{revision.draft.goal}</p>
            <p className="break-all text-caption">v{revision.version} · {revision.approved ? '已批准' : '待批准'}<br/>{revision.draft.workspace.id}</p>
            {!revision.approved && <><label className="flex items-start gap-2 text-secondary"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>批准此固定版本，并允许各节点指定的供应者 访问工作区副本。正文应用仍需单独确认。</label><Button variant="solid" disabled={!consent || busy || !ready} onClick={() => void action(() => request(`${base}/${revision.version}/approve`, {digest: revision.digest, accessConfirmed: true}))}>{tr('批准版本')} {revision.version}</Button></>}
            {revision.runs.map(run => <details key={run.id} open={run === latestRun} className="border-t border-line pt-2"><summary className="text-secondary">{KIND_LABEL[run.kind || 'research']} · {RUN_LABEL[run.status]} · {run.startedAt}</summary><p className="break-all text-caption">{run.id}{run.subscriptionId ? ` · ${run.subscriptionId}` : ''}</p>{run.failure && <p role="alert" className="ui-error">{run.failure}</p>}{run.hypothesis && <p className="whitespace-pre-wrap text-secondary">命题：{run.hypothesis.claim}</p>}{(run.branches || []).map(branch => <p key={branch.stance} className="text-caption">{branch.stance === 'opposing' ? '反对分支' : '支持分支'} · {branch.status}{branch.error ? ` · ${branch.error}` : ''}</p>)}{run.status === 'awaiting-adjudication' && <AdjudicationPanel run={run} busy={busy} onSubmit={command => void action(() => request(`${base}/${revision.version}/runs/${encodeURIComponent(run.id)}/adjudicate`, command))}/>}<p className="text-caption">研究验收：{run.researchAcceptance === 'awaiting-human-acceptance' ? '执行审查通过；结论仍待人工验收' : run.researchAcceptance === 'needs-review' ? '证据或检查需补充' : '尚未独立审查'}。执行完成不等于科学结论成立。裁定不能把已记录的反例投成支持。</p>{run.receipts.map(r => <ReceiptRow key={r.stage} receipt={r} revision={revision} run={run} onQuote={onQuote} onOpenSession={onOpenSession}/>)}</details>)}
            {revision.approved && !activeRun && <InvocationPanel kind={invokeKind} onKind={setInvokeKind} subscriptionId={subscriptionId} onSubscriptionId={setSubscriptionId} claim={hypothesisClaim} onClaim={setHypothesisClaim} grounds={hypothesisGrounds} onGrounds={setHypothesisGrounds} request={request}/>}
            <Button onClick={() => void download('archify')}>{tr('导出 Archify 图源')}</Button><a className="block text-secondary underline" href={`${base}/${revision.version}/export/html`} download>{tr('导出交互图')}</a>
          </>}
          {relatedThoughts.length > 0 && <div><h4 className="text-caption">{tr('思维链')}</h4>{relatedThoughts.map(t => <button key={t.id} type="button" className="block text-secondary" onClick={() => projectId && openCanvas(projectId)}>{t.title}</button>)}</div>}
        </div>
      </aside>}
    </div>
  </div>
}
function ReceiptRow({receipt, revision, run, onQuote, onOpenSession}: {receipt: Receipt;revision?:Revision;run?:Run; onQuote?: (text: string) => void; onOpenSession?: (id: string) => void}) {
  return <div className="space-y-2 border-t border-line py-2">
    <div className="flex flex-wrap items-center gap-2"><span className="text-secondary font-medium">{receipt.stage} · {receipt.profileId}</span><span className="text-caption">{receipt.status}</span>{receipt.sessionId && onOpenSession && <Button variant={receipt.status === 'awaiting-input' ? 'solid' : 'ghost'} pulse={receipt.status === 'awaiting-input'} onClick={() => onOpenSession(receipt.sessionId)}>{receipt.status === 'awaiting-input' ? tr('处理审批') : tr('打开会话')}</Button>}</div>
    {revision&&run&&<ReceiptActions receipt={receipt} revision={revision} run={run}/>}
    {receipt.stopError && <p role="alert" className="ui-error">停止请求错误：{receipt.stopError}</p>}
    <details><summary className="text-caption">实际执行来源与回执</summary><pre className="whitespace-pre-wrap break-all text-caption">{JSON.stringify({nodeId: receipt.stage, kind: receipt.kind, profileId: receipt.profileId, sessionId: receipt.sessionId, turnId: receipt.turnId, promptDigest: receipt.promptDigest, outputDigest: receipt.outputDigest, executor:receipt.executor,inputDigest:receipt.inputDigest,receiptDigest:receipt.receiptDigest,sourceRefs:receipt.sourceRefs, nativeToolEventSeq: receipt.toolResultEvents, lastSeq: receipt.lastSeq, cleanup: receipt.cleanup}, null, 2)}</pre></details>
    {receipt.output && <details><summary className="text-secondary">{tr('查看输出')}</summary><pre className="whitespace-pre-wrap break-words text-caption">{receipt.output}</pre>{onQuote && <Button onClick={() => onQuote(receipt.output)}>{tr('引用到讨论')}</Button>}</details>}
  </div>
}

function InvocationPanel({kind, onKind, subscriptionId, onSubscriptionId, claim, onClaim, grounds, onGrounds, request}: {
  kind: InvokeKind; onKind: (kind: InvokeKind) => void
  subscriptionId: string; onSubscriptionId: (id: string) => void
  claim: string; onClaim: (value: string) => void
  grounds: string; onGrounds: (value: string) => void
  request: <T>(url: string, body?: unknown, key?: string) => Promise<T>
}) {
  const [policyId, setPolicyId] = useState('')
  const [watchId, setWatchId] = useState('')
  const [revision, setRevision] = useState('1')
  const [digest, setDigest] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function activate(pause = false) {
    setBusy(true); setError('')
    try {
      if (pause) {
        if (!subscriptionId) throw new Error('需要已激活的订阅')
        await request(`/api/v1/radar/subscriptions/${encodeURIComponent(subscriptionId)}/pause`, {actorRef: 'human:operator', reason: 'pause fetch'})
        return
      }
      const created = await request<{subscriptionId: string}>('/api/v1/radar/subscriptions', {
        sourceId: 'crossref', policyId, revision: Number(revision), digest, watchId,
        actorRef: 'human:operator', reason: 'activate governed watch',
      }, crypto.randomUUID())
      onSubscriptionId(created.subscriptionId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {setBusy(false)}
  }
  return <div className="space-y-3 border-t border-line pt-3">
    <FormField htmlFor="invoke-kind" label={tr('本次运行')}><Select id="invoke-kind" value={kind} onValueChange={value => onKind(value as InvokeKind)}>
      <option value="research">{KIND_LABEL.research}</option>
      <option value="continuous">{KIND_LABEL.continuous}</option>
      <option value="verification">{KIND_LABEL.verification}</option>
      <option value="archive">{KIND_LABEL.archive}</option>
      <option value="writing">{KIND_LABEL.writing}</option>
    </Select></FormField>
    {kind === 'continuous' && <>
      <FormField htmlFor="subscription-id" label={tr('已激活订阅')}><Input id="subscription-id" value={subscriptionId} onChange={e => onSubscriptionId(e.target.value)}/></FormField>
      <FormField htmlFor="policy-id" label={tr('政策')}><Input id="policy-id" value={policyId} onChange={e => setPolicyId(e.target.value)}/></FormField>
      <Input value={watchId} onChange={e => setWatchId(e.target.value)} placeholder="watchId"/>
      <Input value={revision} onChange={e => setRevision(e.target.value)} placeholder="revision"/>
      <Input value={digest} onChange={e => setDigest(e.target.value)} placeholder="digest"/>
      {error && <p role="alert" className="ui-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void activate(false)}>{tr('激活订阅')}</Button>
        <Button disabled={busy || !subscriptionId} onClick={() => void activate(true)}>{tr('暂停拉取')}</Button>
      </div>
      <p className="text-caption text-ink-3">保存观察规则不会开始拉取。只有激活后的订阅才会进入连续研究。</p>
    </>}
    {kind === 'verification' && <>
      <FormField htmlFor="hypothesis-claim" label={tr('待验证命题')}><Textarea id="hypothesis-claim" value={claim} onChange={e => onClaim(e.target.value)}/></FormField>
      <FormField htmlFor="hypothesis-grounds" label={tr('依据（每行一条）')}><Textarea id="hypothesis-grounds" value={grounds} onChange={e => onGrounds(e.target.value)}/></FormField>
    </>}
    {kind === 'writing' && <p className="text-caption text-ink-3">写作应用只调用 D 已注册的回执工具，不会在本页改正文。</p>}
    {kind === 'archive' && <p className="text-caption text-ink-3">归档调用 E 已注册的文献工具；未注册时运行失败并保留回执。</p>}
  </div>
}

function AdjudicationPanel({run, busy, onSubmit}: {run: Run; busy: boolean; onSubmit: (command: {outcome: string; rationale: string; actorRef: string; branchDigests: string[]}) => void}) {
  const [outcome, setOutcome] = useState('inconclusive')
  const [rationale, setRationale] = useState('')
  const digests = (run.branches || []).map(branch => branch.outputDigest || '').filter(Boolean)
  return <div className="space-y-2">
    <FormField htmlFor="adjudication-outcome" label={tr('证据裁定')}><Select id="adjudication-outcome" value={outcome} onValueChange={setOutcome}>
      <option value="supported">成立</option>
      <option value="refuted">被反例驳回</option>
      <option value="inconclusive">未决</option>
    </Select></FormField>
    <FormField htmlFor="adjudication-rationale" label={tr('裁定说明')}><Textarea id="adjudication-rationale" value={rationale} onChange={e => setRationale(e.target.value)}/></FormField>
    <Button variant="solid" disabled={busy || !rationale.trim() || digests.length !== (run.branches || []).length} onClick={() => onSubmit({outcome, rationale, actorRef: 'human:operator', branchDigests: digests})}>{tr('提交裁定')}</Button>
  </div>
}
