import {PageActions} from '../../components/PageActions'
import {t as tr} from '../../i18n'
// Uses the existing Research OS plan API: immutable versions, digest approval and native execution receipts.
import { WorkflowCanvas, NODE_KINDS } from './WorkflowCanvas'
import { PanelHeader, IconBtn } from '../../components/ui'
import { Play, Plus, Settings2, Square, X, Trash2, Download } from 'lucide-react'
import { Button, Input, Textarea, Select, FormField } from '../../components/forms'
import { getNativeProfiles } from '../chat/client'
import { listWorkspaces, type WorkspaceSummary } from '../../lib/api'
import type { NativeProfile } from '@xgc2/native-agent/state'
import { useEffect, useRef, useState } from 'react'

export type PlanNode = { id: string; kind: string; title: string; objective: string; acceptance: string[]; inputs: string[]; dependsOn: string[] }
type Draft = { title: string; goal: string; nodes: PlanNode[]; workspace: { id: string; revision: string }; researcher: string; reviewer: string; writer: string }
type Receipt = { stage: string; sessionId: string; turnId: string; status: string; output: string }
type Run = { id: string; status: string; failure?: string; researchAcceptance: string; receipts: Receipt[] }
type Revision = { version: number; digest: string; draft: Draft; approved: boolean; runs: Run[] }
async function request<T>(url: string, body?: unknown, key?: string): Promise<T> {
  const response = await fetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body) })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error?.message || `Request failed (${response.status})`)
  return value.data as T
}
const blank = (): Draft => ({ title: '', goal: '', workspace: { id: '', revision: '' }, researcher: '', reviewer: '', writer: '', nodes: [{ id: 'evidence', kind: 'EvidenceRead', title: tr("证据研究"), objective: '', acceptance: [tr("每个结论关联可核对来源；明确未验证假设")], inputs: [], dependsOn: [] }] })
export function WorkflowPage({ projectId, onQuote, onOpenSession }: { projectId: string | null; onQuote?: (text: string) => void; onOpenSession?: (id: string) => void }) {
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
  const generation = useRef(0)
  const executionKeys = useRef<Record<string, string>>({})
  const savedDrafts = useRef<Record<string, { draft: Draft; baseVersion: number }>>({})
  const draftProject = useRef(projectId)
  useEffect(() => { if (projectId && editing && draftProject.current === projectId) savedDrafts.current[projectId] = { draft, baseVersion: editingBaseVersion } }, [draft, projectId, editing, editingBaseVersion])
  const base = `/api/v1/research/projects/${encodeURIComponent(projectId || '')}/plans`
  const head = revisions[0]
  useEffect(() => { setConsent(false) }, [head?.digest])
  useEffect(() => {
    const current = ++generation.current
    draftProject.current = projectId
    setBusy(false)
    setRevisions([]); setDraft(savedDrafts.current[projectId || '']?.draft || blank()); setEditing(false); setConsent(false); setError('')
    if (!projectId) return
    const refresh = () => request<Revision[]>(base).then(data => { if (current === generation.current) setRevisions(data) }).catch(reason => { if (current === generation.current) setError(String(reason.message)) })
    void refresh(); const controller = new AbortController()
    void Promise.allSettled([getNativeProfiles(controller.signal), listWorkspaces(controller.signal)]).then(([p, w]) => {
      if (controller.signal.aborted) return
      if (p.status === 'fulfilled') setProfiles(p.value)
      if (w.status === 'fulfilled') setWorkspaces(w.value)
      if (p.status === 'rejected' || w.status === 'rejected') setError('无法加载工作者或工作区，请刷新后再配置计划。')
    })
    return () => { ++generation.current; controller.abort() }
  }, [base, projectId])
  const running = revisions.some(revision => revision.runs.some(run => run.status === 'running'))
  useEffect(() => {
    if (!running) return
    const current = generation.current
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void request<Revision[]>(base).then(data => { if (current === generation.current) setRevisions(data) }).catch(() => {}) }, 2500)
    return () => window.clearInterval(timer)
  }, [running, base])
  async function action(work: () => Promise<unknown>, savedDraft = false) {
    const current = generation.current; setBusy(true); setError('')
    try { await work(); const data = await request<Revision[]>(base); if (current === generation.current) { setRevisions(data); if (savedDraft && projectId) { delete savedDrafts.current[projectId]; setEditing(false); setSelectedNode('') }; setConsent(false) } }
    catch (reason) { if (current === generation.current) setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { if (current === generation.current) setBusy(false) }
  }
  function executeApproved() {
    if (!head) return Promise.resolve()
    // Preserve the same key after a lost response; a retry must not launch another run.
    const identity = `${projectId}/${head.version}/${head.digest}/${head.runs[0]?.id || 'initial'}`
    const key = executionKeys.current[identity] ||= crypto.randomUUID()
    return request(`${base}/${head.version}/execute`, { digest: head.digest }, key)
  }
  const download = async (format: string) => {
    if (!head) return
    try { const data = await request<unknown>(`${base}/${head.version}/export/${format}`); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `research-plan-v${head.version}.${format}.json`; link.click(); URL.revokeObjectURL(url) }
    catch (reason) { setError(String(reason)) }
  }
  function renderRun(run: Run, version: number) {
    const labels: Record<string,string>={research:tr("研究"),review:tr("独立审查"),write:tr("写作")}
    return <article key={run.id}>
      <div className="flex flex-wrap items-center gap-3"><h3>{tr("Runs")} · {tr(run.status)}</h3>{run.status==='running'&&<Button onClick={()=>void action(()=>request(`${base}/${version}/runs/${run.id}/cancel`,{}))}>{tr("停止运行")}</Button>}</div>
      {run.failure&&<p role="alert" className="ui-error">{run.failure}</p>}
      {run.researchAcceptance==='awaiting-human-acceptance'&&<p className="text-secondary text-ink-2">{tr("执行完成，研究成果等待人工验收。")}</p>}
      {run.receipts.map(receipt=><div key={receipt.stage} className="mt-2 border-t border-line py-3">
        <div className="flex items-center gap-2"><span className="text-secondary font-medium">{labels[receipt.stage]||receipt.stage}</span><span className="text-caption text-ink-3">{tr(receipt.status)}</span>{receipt.sessionId&&onOpenSession&&<Button variant={receipt.status==='awaiting-input'?'solid':'ghost'} pulse={receipt.status==='awaiting-input'} className="ml-auto" onClick={()=>onOpenSession(receipt.sessionId)}>{receipt.status==='awaiting-input'?tr("处理审批"):tr("打开会话与审批")}</Button>}</div>
        {receipt.output&&<details><summary className="text-secondary">{tr("查看输出")}</summary><pre>{receipt.output}</pre><Button onClick={()=>{const url=URL.createObjectURL(new Blob([receipt.output],{type:'text/markdown'}));const link=document.createElement('a');link.href=url;link.download=`${receipt.stage}-${run.id}.md`;link.click();URL.revokeObjectURL(url)}}>{tr("导出报告")}</Button>{onQuote&&<Button onClick={()=>onQuote(receipt.output)}>{tr("引用到讨论")}</Button>}</details>}
      </div>)}
    </article>
  }
  function beginEdit() {
    if (!projectId) return
    const saved = savedDrafts.current[projectId]
    setDraft(saved?.draft || (head ? structuredClone(head.draft) : blank()))
    setEditingBaseVersion(saved?.baseVersion ?? head?.version ?? 0)
    setSelectedNode(''); setEditing(true)
  }
  const visible = editing ? draft : head?.draft
  const chosen = visible?.nodes.find(node => node.id === selectedNode)
  const changeNode = (id: string, patch: Partial<PlanNode>) => setDraft(current => ({...current, nodes: current.nodes.map(node => node.id === id ? {...node,...patch} : node)}))
  const addNode = () => {
    const node: PlanNode = {id:`step${crypto.randomUUID().replace(/-/g,'')}`,kind:'DerivationCheck',title:`${tr("验证")} ${draft.nodes.length}`,objective:'',acceptance:[tr("保留可重现检查与失败记录")],inputs:[],dependsOn:draft.nodes.length?[draft.nodes[draft.nodes.length-1].id]:[]}
    setDraft(current=>({...current,nodes:[...current.nodes,node]}));setSelectedNode(node.id)
  }
  return <div className="workflow-page flex h-full min-h-0 flex-col bg-panel">
    <PageActions page="workflow">
          {editing?<><Button variant="solid" loading={busy} onClick={()=>void action(()=>request(base,{baseVersion:editingBaseVersion,draft}),true)}>{tr("保存新版本")}</Button><Button icon={Plus} disabled={busy||draft.nodes.length>=32} onClick={addNode}>{tr("添加步骤")}</Button><IconBtn icon={Settings2} label={tr("计划设置")} onClick={()=>setSelectedNode('')}/><Button disabled={busy} onClick={()=>setEditing(false)}>{tr("取消")}</Button></>:
          <><Button variant="solid" icon={running?Square:head?.approved?Play:Plus} disabled={!projectId||busy} onClick={()=>{if(running){const revision=revisions.find(r=>r.runs.some(run=>run.status==='running'))!;const run=revision.runs.find(run=>run.status==='running')!;void action(()=>request(`${base}/${revision.version}/runs/${run.id}/cancel`,{}))}else if(head?.approved)void action(executeApproved);else beginEdit()}}>{running?tr("停止运行"):head?.approved?tr("开始研究、验证与写作"):head?tr("修订计划"):tr("创建计划")}</Button>
          {head&&<><IconBtn icon={Settings2} label={tr("计划设置")} onClick={()=>setSelectedNode('')}/>{head.approved&&<Button disabled={busy} onClick={beginEdit}>{tr("修订计划")}</Button>}<Button icon={Download} onClick={()=>void download('planweave')}>{tr("导出 PlanWeave")}</Button></>}</>}
        </PageActions>
    {error && <p role="alert" className="ui-error">{error}</p>}
    <div className="workflow-layout flex min-h-0 flex-1">
      <WorkflowCanvas key={`${projectId}:${editing?'draft':head?.digest||'empty'}`} nodes={visible?.nodes||[]} selected={selectedNode} onSelect={setSelectedNode}
        onLink={editing?(from,to)=>{const node=draft.nodes.find(n=>n.id===to)!;if(!node.dependsOn.includes(from))changeNode(to,{dependsOn:[...node.dependsOn,from]})}:undefined}
        empty={<><h2 className="text-title font-semibold">{projectId?tr("建立研究工作流"):tr("选择研究项目")}</h2><p className="mt-2 max-w-xs text-secondary leading-relaxed text-ink-3">{projectId?tr("添加步骤、连接依赖，再为每一步设置证据与验收条件。"):tr("工作流属于具体研究项目。选择或创建项目后开始编排。")}</p></>}/>
      {visible&&<aside className="flex w-[320px] shrink-0 flex-col overflow-hidden border-l border-line bg-panel">
        <PanelHeader title={chosen?chosen.title:tr("计划设置")} actions={chosen?<IconBtn icon={X} label={tr("返回计划设置")} onClick={()=>setSelectedNode('')}/>:undefined}/>
        <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
          {editing?<form className="space-y-4" onSubmit={e=>{e.preventDefault();void action(()=>request(base,{baseVersion:editingBaseVersion,draft}),true)}}>
            {chosen?<>
              <FormField htmlFor="step-title" label={tr("步骤名称")}><Input id="step-title" required value={chosen.title} onChange={e=>changeNode(chosen.id,{title:e.target.value})}/></FormField>
              <FormField htmlFor="step-kind" label={tr("步骤类型")}><Select id="step-kind" value={chosen.kind} onValueChange={kind=>changeNode(chosen.id,{kind})}>{Object.entries(NODE_KINDS).map(([value,label])=><option key={value} value={value}>{tr(label)}</option>)}</Select></FormField>
              <FormField htmlFor="step-objective" label={tr("任务")}><Textarea id="step-objective" required value={chosen.objective} onChange={e=>changeNode(chosen.id,{objective:e.target.value})}/></FormField>
              <FormField htmlFor="step-inputs" label={tr("证据输入（每行一个版本引用）")}><Textarea id="step-inputs" value={chosen.inputs.join('\n')} onChange={e=>changeNode(chosen.id,{inputs:e.target.value.split('\n').filter(Boolean)})}/></FormField>
              <FormField htmlFor="step-acceptance" label={tr("验收条件（每行一条）")}><Textarea id="step-acceptance" required value={chosen.acceptance.join('\n')} onChange={e=>changeNode(chosen.id,{acceptance:e.target.value.split('\n').filter(Boolean)})}/></FormField>
              <div className="ui-field"><span>{tr("前置步骤")}</span>{draft.nodes.slice(0,draft.nodes.findIndex(n=>n.id===chosen.id)).map(dep=><label key={dep.id} className="flex items-center gap-2"><input type="checkbox" checked={chosen.dependsOn.includes(dep.id)} onChange={e=>changeNode(chosen.id,{dependsOn:e.target.checked?[...chosen.dependsOn,dep.id]:chosen.dependsOn.filter(id=>id!==dep.id)})}/>{dep.title}</label>)}</div>
              <Button icon={Trash2} disabled={draft.nodes.length<=1} onClick={()=>{setDraft(current=>({...current,nodes:current.nodes.filter(n=>n.id!==chosen.id).map(n=>({...n,dependsOn:n.dependsOn.filter(id=>id!==chosen.id)}))}));setSelectedNode('')}}>{tr("删除步骤")}</Button>
            </>:<>
              <FormField htmlFor="plan-title" label={tr("计划名称")}><Input id="plan-title" required value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></FormField>
              <FormField htmlFor="plan-goal" label={tr("研究目标")}><Textarea id="plan-goal" required value={draft.goal} onChange={e=>setDraft({...draft,goal:e.target.value})}/></FormField>
              <FormField htmlFor="plan-workspace" label={tr("工作区")}><Select id="plan-workspace" required value={draft.workspace.id} onValueChange={id=>setDraft({...draft,workspace:{id,revision:workspaces.find(w=>w.workspaceId===id)?.head||''}})}><option value="">{tr("选择工作区")}</option>{workspaces.map(w=><option key={w.workspaceId} value={w.workspaceId}>{w.workspaceId}</option>)}</Select></FormField>
              <FormField htmlFor="plan-revision" label={tr("已审阅 Git commit")}><Input id="plan-revision" required value={draft.workspace.revision} onChange={e=>setDraft({...draft,workspace:{...draft.workspace,revision:e.target.value}})}/></FormField>
              {(['researcher','reviewer','writer'] as const).map((role,index)=><FormField key={role} htmlFor={`plan-${role}`} label={[tr("研究员"),tr("独立审查"),tr("写作")][index]}><Select id={`plan-${role}`} required value={draft[role]} onValueChange={id=>setDraft({...draft,[role]:id})}><option value="">{tr("选择原生工作者")}</option>{profiles.filter(p=>p.available).map(p=><option key={p.id} value={p.id}>{p.provider} · {p.id}</option>)}</Select></FormField>)}
              <p className="text-caption leading-relaxed text-ink-3">{tr("选择画布中的步骤，编辑任务与依赖。")}</p>
            </>}
          </form>:<div className="space-y-4">
            {chosen?<><p className="text-caption text-ink-3">{tr(NODE_KINDS[chosen.kind])}</p><p className="whitespace-pre-wrap text-secondary leading-relaxed text-ink-2">{chosen.objective}</p><div><h4 className="mb-2 text-caption font-semibold text-ink-3">{tr("验收条件")}</h4><ul className="space-y-2 text-secondary">{chosen.acceptance.map((text,i)=><li key={i}>{text}</li>)}</ul></div>{chosen.inputs.length>0&&<div><h4 className="mb-2 text-caption font-semibold text-ink-3">{tr("证据输入")}</h4><p className="break-all text-secondary">{chosen.inputs.join('\n')}</p></div>}<Button variant="outline" onClick={()=>{beginEdit();setSelectedNode(chosen.id)}}>{tr("编辑步骤")}</Button></>:<>
              <h3 className="text-title font-semibold">{head!.draft.title}</h3><p className="text-secondary leading-relaxed text-ink-2">{head!.draft.goal}</p>
              <div className="rounded-md bg-inset p-3 text-caption text-ink-2">{tr("版本")} {head!.version} · {head!.approved?tr("已批准"):tr("待批准")}<p className="mt-1 break-all text-ink-3">{head!.draft.workspace.id} · {head!.draft.workspace.revision.slice(0,12)}</p></div>
              {!head!.approved&&<><label className="flex items-start gap-2 text-secondary leading-relaxed"><input type="checkbox" className="mt-1" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{tr("批准此版本，并允许三个原生 Agent 访问该工作区副本")}</label><Button variant="solid" disabled={!consent||busy} onClick={()=>void action(()=>request(`${base}/${head!.version}/approve`,{digest:head!.digest,nativeAccessConfirmed:true}))}>{tr("批准版本")} {head!.version}</Button></>}
              <div className="flex flex-wrap gap-2"><Button onClick={()=>void download('archify')}>{tr("导出 Archify 图源")}</Button><a className="inline-flex h-7 items-center text-secondary text-ink-2 underline" href={`${base}/${head!.version}/export/html`} download>{tr("导出交互图")}</a></div>
              <details><summary className="cursor-pointer text-secondary text-ink-2">{tr("版本历史")} · {revisions.length}</summary>{revisions.map(r=><div key={r.version} className="mt-2 border-t border-line pt-2 text-secondary">{tr("版本")} {r.version} · {r.draft.title}{r.version!==head!.version&&r.runs.map(run=>renderRun(run,r.version))}</div>)}</details>
            </>}
          </div>}
        </div>
      </aside>}
    </div>
    {head&&head.runs.length>0&&<div className="workflow-receipts max-h-[35%] shrink-0 overflow-y-auto border-t border-line bg-panel"><PanelHeader title={tr("运行记录")}/><div className="space-y-3 p-3.5">{head.runs.map(run=>renderRun(run,head.version))}</div></div>}
  </div>
}
