import { useEffect, useState } from 'react'
import { Button } from '../../components/ui'
import { FormField, Input, Select, Textarea } from '../../components/forms'
import { useWorkbench } from '../../store'
import type { WorkspaceSummary } from '../../lib/api'
import { contentPort } from '../content/content-client'
import { CONTENT_PATH, type ContentSnapshot } from '../content/content-model'
import { sharedContentSession } from '../content/useContentDocument'
import { createPlanFromAsset } from './workflow-client'
import type { Revision } from './workflow-model'
import type {AgentProfile} from '@xgc2/agent-runtime/state'

/** Definitions belong to personal content. Instantiation freezes them before the existing executor sees a plan. */
export function MethodLibrary({projectId,workspaces,profiles,baseVersion,revision,onCreated,disabled}: {
  projectId:string;workspaces:WorkspaceSummary[];baseVersion:number;revision?:Revision
  profiles:AgentProfile[]
  onCreated:(revision:Revision)=>void;disabled:boolean
}) {
  const { locale, openResource } = useWorkbench(), zh=locale==='zh'
  const [sourceWorkspace,setSourceWorkspace]=useState(projectId),[sourceProject,setSourceProject]=useState(projectId)
  const [snapshot,setSnapshot]=useState<ContentSnapshot|null>(null),[selected,setSelected]=useState('')
  const [inputs,setInputs]=useState('{}'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0)
  const [profile,setProfile]=useState('')
  useEffect(()=>{setSourceWorkspace(projectId);setSourceProject(projectId);setInputs('{}')},[projectId])
  useEffect(()=>{
    const c=new AbortController();setSnapshot(null);setSelected('');setError('')
    if(!sourceWorkspace||!sourceProject)return
    void contentPort({projectId:sourceProject,workspace:sourceWorkspace}).read(c.signal).then(value=>{
      if(c.signal.aborted)return
      setSnapshot(value);setSelected(value.document.objects.find(o=>o.kind==='workflow')?.id??'')
    }).catch(reason=>{if(!c.signal.aborted)setError(reason instanceof Error?reason.message:String(reason))})
    return()=>c.abort()
  },[sourceWorkspace,sourceProject,refresh])
  const workflows=snapshot?.document.objects.filter(o=>o.kind==='workflow')??[]
  const selectedAsset=workflows.find(o=>o.id===selected)
  const open=()=>openResource({kind:'research',ownerProjectId:sourceProject,workspace:sourceWorkspace,view:'table',objectId:selected||undefined},'primary')
  async function instantiate(){
    if(!snapshot?.digest||!selectedAsset)return
    const target=projectId;setBusy(true);setError('')
    try {
      const bindings:unknown=JSON.parse(inputs)
      const created=await createPlanFromAsset(target,{baseVersion,workflow:{kind:'content',workspace:sourceWorkspace,path:CONTENT_PATH,id:selected,digest:snapshot.digest},workspace:{id:target,revision:'working-tree'},bindings,
        researcher:profile||revision?.draft.researcher,reviewer:profile||revision?.draft.reviewer,writer:profile||revision?.draft.writer})
      onCreated(created)
    } catch(reason){setError(reason instanceof Error?reason.message:String(reason))}finally{setBusy(false)}
  }
  async function saveDefinition(){
    if(!revision)return
    setBusy(true);setError('')
    try {
      const writer=sharedContentSession({projectId:sourceProject,workspace:sourceWorkspace})
      if(writer.snapshot().status==='loading')await writer.load()
      const state=writer.snapshot()
      if(!state.digest||state.dirty||state.status!=='saved')throw new Error(zh?'请先打开研究内容，完成迁移或保存待处理的编辑。':'Open research content and finish migration or pending edits first.')
      const id=crypto.randomUUID()
      const nodes=revision.draft.nodes.map(node=>{
        const next=structuredClone(node)
        if(next.execution)delete next.execution.buildTask
        return next
      })
      const methodRefs=revision.draft.frozenAssets?.filter(a=>a.ref.kind==='content'&&a.ref.id!==revision.draft.source?.id).map(a=>a.ref)
      if(!writer.edit(doc=>({...doc,objects:[...doc.objects,{id,kind:'workflow',title:revision.draft.title,body:revision.draft.goal,sources:revision.draft.source?[revision.draft.source]:[],definition:{goal:revision.draft.goal,nodes,...(methodRefs?.length?{methodRefs}:{})}}]})))throw new Error('Content editor is not ready.')
      await writer.save()
      if(writer.snapshot().status!=='saved'||writer.snapshot().dirty)throw new Error(writer.snapshot().error||'Workflow definition remains unsaved.')
      setRefresh(n=>n+1)
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason))}finally{setBusy(false)}
  }
  return <details className="border-b border-line bg-panel px-4 py-2" data-xgc-role="method-library">
    <summary className="cursor-pointer text-secondary">{zh?'个人方法与可复用流程':'Personal methods and reusable workflows'}</summary>
    <div className="grid gap-3 py-3 sm:grid-cols-2">
      <FormField label={zh?'资产工作区':'Asset workspace'} htmlFor="asset-workspace"><Select id="asset-workspace" value={sourceWorkspace} onValueChange={id=>{setSourceWorkspace(id);setSourceProject(id)}}>{workspaces.map(w=><option key={w.workspaceId} value={w.workspaceId}>{w.workspaceId}</option>)}</Select></FormField>
      <FormField label={zh?'归属项目':'Owning project'} htmlFor="asset-project"><Input id="asset-project" value={sourceProject} onChange={e=>setSourceProject(e.target.value)}/></FormField>
      <FormField label={zh?'流程':'Workflow'} htmlFor="asset-workflow"><Select id="asset-workflow" value={selected} onValueChange={setSelected}><option value="">{zh?'选择流程':'Select workflow'}</option>{workflows.map(o=><option key={o.id} value={o.id}>{o.title}</option>)}</Select></FormField>
      <FormField label={zh?'本次输入（JSON）':'Inputs (JSON)'} htmlFor="asset-inputs"><Textarea id="asset-inputs" value={inputs} onChange={e=>setInputs(e.target.value)}/></FormField>
      <FormField label={zh?'默认 Agent（有 Agent 步骤时选择）':'Default agent (for agent steps)'} htmlFor="asset-agent"><Select id="asset-agent" value={profile} onValueChange={setProfile}><option value="">{zh?'沿用指定执行者':'Use assigned agents'}</option>{profiles.filter(p=>p.available).map(p=><option key={p.id} value={p.id}>{p.provider} · {p.id}</option>)}</Select></FormField>
    </div>
    {selectedAsset?.body&&<p className="mb-2 whitespace-pre-wrap text-secondary text-ink-2">{selectedAsset.body}</p>}
    {snapshot&&<p className="mb-2 text-caption text-ink-3">{snapshot.document.objects.filter(o=>o.kind==='method').length} {zh?'个方法':'methods'} · {snapshot.document.objects.filter(o=>o.kind==='tool').length} {zh?'个工具':'tools'}</p>}
    {error&&<p role="alert" className="ui-error">{error}</p>}
    <div className="flex flex-wrap gap-2 pb-2">
      <Button variant="solid" disabled={disabled||busy||!selectedAsset||!snapshot?.digest} onClick={()=>void instantiate()}>{zh?'在本项目建立固定版本计划':'Create pinned plan in this project'}</Button>
      <Button onClick={open}>{zh?'编辑资产':'Edit assets'}</Button>
      <Button disabled={!revision||busy||!sourceProject||!sourceWorkspace} onClick={()=>void saveDefinition()}>{zh?'将当前计划保存为流程资产':'Save current plan as workflow asset'}</Button>
      <Button disabled={busy} onClick={()=>setRefresh(n=>n+1)}>{zh?'刷新':'Refresh'}</Button>
    </div>
  </details>
}
