import { projectObjectCopy } from '../features/projects/project-object-copy'
import { fileTarget } from '../features/projects/project-object-model'
import {t as tr} from '../i18n'
import {useState} from 'react'
import {Archive, Check, ChevronRight, Folder, FolderOpen, Loader2, Pencil, Plus} from 'lucide-react'
import {APIError,post,type Project} from '../lib/api'
import {researchProjectCreate} from '../features/workbench/writing-session'
import {useWorkbench} from '../store'
import {belongsToResearchScope,useNativeAgentSession} from '../features/chat/Session'
import {cn} from '../lib/cn'
import {Button,IconBtn,SectionLabel} from './ui'
import {IconCanvas} from './icons'
import {KnowledgeNav} from '../features/resources/KnowledgeNav'
import {AgentRoster} from '../features/chat/AgentRoster'
/* 二级面板：顶层菜单在左侧常驻 rail，这里按页上下文化。
   对话/工作流 = 线程 + 项目树（项目入口集中于此）；知识库 = 文件树；设置 = 分节目录 + 原生 Agent 名册。搜索唯一起在顶栏。 */
function SettingsNav(){
 const {locale,openSettings}=useWorkbench();const zh=locale==='zh'
 return <>
  <SectionLabel>{tr("设置")}</SectionLabel>
  <button className={cn(threadItem,'text-ink-2 hover:text-ink')} onClick={()=>openSettings('appearance')}>{tr("外观")}</button>
  <button className={cn(threadItem,'text-ink-2 hover:text-ink')} onClick={()=>openSettings('connections')}>{zh?'连接与模型':'Connections & models'}</button>
  <SectionLabel>{zh?'原生 Agent':'Native agents'}</SectionLabel>
  <AgentRoster dense/>
 </>
}
const threadItem='flex w-full items-center gap-2 rounded-md px-2 h-7 text-secondary transition-colors duration-150 hover:bg-hover'
export function Sidebar({projects,onRefresh,loading,error}:{projects:Project[];onRefresh:()=>void;loading:boolean;error:string}) {
 const {activeNav,setActiveNav,projectId,setProjectId,enterWritingProject,openResource,openCanvas,showConversation,locale}=useWorkbench();const native=useNativeAgentSession()
 const [renaming,setRenaming]=useState(''),[title,setTitle]=useState(''),[expanded,setExpanded]=useState<Record<string,boolean>>({}),[archived,setArchived]=useState(false)
 const [adding,setAdding]=useState(false),[name,setName]=useState(''),[busy,setBusy]=useState(false),[addError,setAddError]=useState('')
 const projectView=activeNav==='chat'||activeNav==='workflow'
 const newThread=(project:string)=>{showConversation();if(project)enterWritingProject(project);else setProjectId(project);native.newThread();setActiveNav('chat');setExpanded(s=>({...s,[project]:true}))}
 async function addProject(){setBusy(true);setAddError('');let registration;try{registration=researchProjectCreate(name,new Date().toISOString())}catch(e){setAddError(e instanceof Error?e.message:String(e));setBusy(false);return}try{await post('/workspaces',registration.workspace,`open-workspace-${registration.project.projectId}`).catch(error=>{if(!(error instanceof APIError)||error.status!==409)throw error});await post('/research/projects',registration.project,registration.idempotencyKey).catch(error=>{if(!(error instanceof APIError)||error.status!==409)throw error});setAdding(false);setName('');onRefresh();newThread(registration.project.projectId)}catch(e){setAddError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 function threads(project:string,nested=true){const sessions=native.allSessions.filter(s=>belongsToResearchScope(s.scope,project,project,true)&&s.archived===archived);return <div className={nested?'ml-sidebar-indent border-l border-line pl-1.5':''}>{sessions.map(s=>{const worker=native.selectedId===s.id?native.state.worker:s.state;const running=['starting','running','awaiting-input','cancelling'].includes(worker);return <div key={s.id} className={cn('group flex items-center rounded-md',native.selectedId===s.id&&'bg-accent-soft')}>
 {renaming===s.id?<form className="flex min-w-0 flex-1 p-1" onSubmit={e=>{e.preventDefault();void native.operation(async()=>{await native.updateThread(s.id,{title:title.trim()});setRenaming('')})}}><input aria-label={tr("线程名称")} required autoFocus className="ui-input min-w-0" value={title} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setRenaming('')}}/><IconBtn icon={Check} label={tr("保存线程名称")} onClick={()=>void native.operation(async()=>{await native.updateThread(s.id,{title:title.trim()});setRenaming('')})}/></form>:<><button className={cn(threadItem,'min-w-0 flex-1',native.selectedId===s.id?'font-medium text-ink':'text-ink-2')} onClick={()=>native.selectProjectThread(project,s.id)}>{running&&<Loader2 aria-hidden size={13} strokeWidth={1.75} className="spin-slow shrink-0"/>}<span className="truncate">{s.title||s.provider}</span></button><div className="flex opacity-0 focus-within:opacity-100 group-hover:opacity-100"><IconBtn icon={Pencil} size={13} label={`${tr("重命名")} ${s.title||s.provider}`} onClick={()=>{setRenaming(s.id);setTitle(s.title||'')}}/><IconBtn icon={Archive} size={13} label={archived?tr("恢复线程"):tr("归档线程")} onClick={()=>void native.operation(()=>native.updateThread(s.id,{archived:!s.archived}))}/></div></>}
 </div>})}<button className={cn(threadItem,'text-ink-3 hover:text-ink-2')} onClick={()=>newThread(project)}><Plus size={13} strokeWidth={1.75} className="shrink-0"/>{tr("新线程")}</button></div>}
 return <div className="flex h-full w-full flex-col">
 <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-2">
 {activeNav==='knowledge'?<KnowledgeNav/>:activeNav==='settings'?<SettingsNav/>:<>
 <SectionLabel onAdd={()=>newThread('')}>{tr("对话")}</SectionLabel>
 {threads('',false)}
 <SectionLabel onAdd={()=>setAdding(s=>!s)}>{tr("PROJECTS")}</SectionLabel>
 {adding&&<form className="mx-1 space-y-2 rounded-lg border border-line bg-elevated p-2.5" onSubmit={e=>{e.preventDefault();void addProject()}}><input required autoFocus aria-label={tr("项目名称")} placeholder={tr("项目名称")} className="ui-input" value={name} onChange={e=>setName(e.target.value)}/><div className="flex gap-2"><Button type="submit" variant="solid" loading={busy} className="flex-1">{tr("创建项目")}</Button><Button disabled={busy} onClick={()=>setAdding(false)}>{tr("取消")}</Button></div>{addError&&<p role="alert" className="text-caption text-err">{addError}</p>}</form>}
 {error&&<p className="ui-error" role="alert">{error}</p>}
 {projects.map(p=>{const open=expanded[p.id]??projectId===p.id;const active=projectView&&projectId===p.id;return <section key={p.id} data-project-id={p.id} aria-label={`${tr("项目")} ${p.title}`}><div className={cn('group flex items-center rounded-md',active&&'bg-accent-soft')}><button aria-label={`${open?tr('收起'):tr('展开')} ${p.title}`} aria-expanded={open} className="grid h-8 w-5 shrink-0 place-items-center text-ink-3 transition-colors hover:text-ink" onClick={()=>setExpanded(s=>({...s,[p.id]:!open}))}><ChevronRight size={13} strokeWidth={1.75} className={cn('transition-transform duration-200',open&&'rotate-90')}/></button><button data-xgc-role="research-project" data-xgc-id={p.id} className={cn('flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md pr-2 text-body transition-colors duration-150 hover:bg-hover',active?'font-medium text-ink':'text-ink-2 hover:text-ink')} title={p.title} onClick={()=>{enterWritingProject(p.id);setExpanded(s=>({...s,[p.id]:true}))}}><Folder size={15} strokeWidth={1.75} className={cn('shrink-0',active?'text-ink':'text-ink-3')}/><span className="truncate">{p.title}</span></button><div className="flex opacity-0 focus-within:opacity-100 group-hover:opacity-100"><IconBtn icon={IconCanvas} label={`${projectObjectCopy[locale].canvas} · ${p.title}`} onClick={()=>{setExpanded(s=>({...s,[p.id]:true}));openCanvas(p.id)}}/><IconBtn icon={FolderOpen} label={`${tr("项目文件")} · ${p.title}`} onClick={()=>{setProjectId(p.id);setExpanded(s=>({...s,[p.id]:true}));openResource({kind:'file',target:fileTarget(p.id,p.id)})}}/></div></div>{open&&threads(p.id)}</section>})}
 {loading&&!projects.length&&<p className="px-2.5 py-2 text-caption text-ink-3">{tr("正在读取项目…")}</p>}
 <button className="mt-3 px-2.5 text-caption text-ink-3 transition-colors hover:text-ink-2" onClick={()=>setArchived(!archived)}>{archived?tr("隐藏已归档线程"):tr("显示已归档线程")}</button>
 </>}
 </div>
 </div>
}
