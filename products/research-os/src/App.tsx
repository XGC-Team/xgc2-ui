import {t as tr} from './i18n'
import { useEffect, useState } from 'react'
import { MarkPromptDock } from './devtools/mark-prompt/MarkPromptDock'
import { BottomPanel } from './components/BottomPanel'
import { BrowserPanel } from './components/BrowserPanel'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { ResizeHandle } from './components/ResizeHandle'
import { CommandPalette } from './components/CommandPalette'
import { NAV_ITEMS, useWorkbench, type NavId } from './store'
import { collection, post, listWorkspaces, type Project } from './lib/api'
import { NativeAgentSessionProvider, useNativeAgentSession } from './features/chat/Session'
import { ChatPage } from './features/chat/ChatPage'
import { WorkflowPage } from './features/workflow/WorkflowPage'
import { KnowledgePage } from './features/resources/KnowledgePage'
import { SettingsPage } from './features/chat/SettingsPage'
import { GraphPage } from './features/resources/GraphPage'
export default function App(){
 const {projectId}=useWorkbench()
 return <NativeAgentSessionProvider researchProjectId={projectId}><Workbench/></NativeAgentSessionProvider>
}
function Workbench(){
 const {theme,toggleTheme,locale,activeNav,setActiveNav,setPaletteOpen,projectId,setProjectId}=useWorkbench();const native=useNativeAgentSession()
 const {rightOpen:materials,setRightOpen:setMaterials}=useWorkbench()
 const [bottom,setBottom]=useState(localStorage.getItem('research-ui-bottom')==='open'),[sizes,setSizes]=useState({left:264,right:396,bottom:252})
 const [sidebar,setSidebar]=useState(true),[projects,setProjects]=useState<Project[]>([]),[error,setError]=useState(''),[reload,setReload]=useState(0),[loading,setLoading]=useState(false)
 const [visited,setVisited]=useState<NavId[]>(['chat'])
 useEffect(()=>{setVisited(current=>current.includes(activeNav)?current:[...current,activeNav])},[activeNav])
 useEffect(()=>{document.documentElement.classList.toggle('dark',theme==='dark');document.documentElement.lang=locale},[theme,locale])
 useEffect(()=>{const c=new AbortController();setLoading(true);setError('')
   void (async()=>{
     const [spaces,records]=await Promise.all([listWorkspaces(c.signal),collection<Project&{projectId?:string}>('/research/projects',c.signal)])
     const papers=spaces.filter(w=>w.workspaceId.startsWith('paper-'))
     const mapped=papers.map(w=>({id:w.workspaceId,title:records.find(r=>(r.projectId||r.id)===w.workspaceId)?.title||w.workspaceId}))
     setProjects(mapped)
     // Project records refer to existing repositories; they do not create or copy repositories.
     for(const p of mapped){if(c.signal.aborted)return;if(!records.some(r=>(r.projectId||r.id)===p.id))await post('/research/projects',{schemaVersion:'xgc.research.protocol/v1',projectId:p.id,slug:p.id,title:p.title,summary:'',createdBy:'researcher',createdAt:new Date().toISOString()})}
   })().catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setLoading(false)});return()=>c.abort()
 },[reload])
 useEffect(()=>{const refresh=()=>setReload(n=>n+1);window.addEventListener('focus',refresh);const timer=setInterval(refresh,30000);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}},[])
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setPaletteOpen(true)}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='j'){e.preventDefault();setBottom(s=>!s)}if((e.metaKey||e.ctrlKey)&&e.key==='.'){e.preventDefault();setMaterials(!useWorkbench.getState().rightOpen)}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='b'){e.preventDefault();setSidebar(s=>!s)}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[setPaletteOpen])
 useEffect(()=>{localStorage.setItem('research-ui-bottom',bottom?'open':'collapsed')},[bottom])
 const projectView=activeNav==='chat'||activeNav==='workflow'
 const quote=(text:string,targetProject?:string)=>{native.appendDraft(text,targetProject);if(targetProject!==undefined&&targetProject!==projectId)setProjectId(targetProject);setActiveNav('chat')}
 return <div className="flex h-screen min-w-0 flex-col overflow-hidden bg-app">
   <TopBar onToggleLeft={()=>setSidebar(!sidebar)} onToggleRight={()=>setMaterials(!materials)} onToggleBottom={()=>setBottom(!bottom)}/>
   <div className="flex min-h-0 flex-1">
    {sidebar&&<><aside className="shrink-0 overflow-hidden border-r border-line" style={{width:sizes.left}}><Sidebar onCollapse={()=>setSidebar(false)} projects={projects} onRefresh={()=>setReload(n=>n+1)} loading={loading} error={error}/></aside><ResizeHandle orientation="v" onDelta={delta=>setSizes(s=>({...s,left:Math.max(208,Math.min(360,s.left+delta))}))}/></>}
    <main className="flex min-w-0 flex-1 flex-col"><div className="ui-toolbar border-b border-line bg-panel">{projectId&&projectView&&<><span className="truncate font-semibold">{projects.find(p=>p.id===projectId)?.title||'研究项目'}</span><span className="text-ink-3">/</span></>}<span className="text-ink-2">{tr(NAV_ITEMS.find(n=>n.id===activeNav)?.label||'')}</span><div id="workbench-page-actions" className="ml-auto flex min-w-0 items-center gap-2 overflow-x-auto"/></div>
      {visited.map(id=><section key={id} hidden={activeNav!==id} className={`workbench-surface min-h-0 flex-1 overflow-auto `} aria-label={tr(NAV_ITEMS.find(n=>n.id===id)?.label||'')}>
        {id==='settings'?<SettingsPage/>:id==='chat'?<ChatPage/>:id==='workflow'?<WorkflowPage projectId={projectId||null} onQuote={quote} onOpenSession={id=>void native.operation(async()=>{await native.openSession(id);setActiveNav('chat')})}/>:id==='knowledge'?<KnowledgePage/>:<GraphPage/>}
      </section>)}
      {bottom&&<ResizeHandle orientation="h" onDelta={delta=>setSizes(s=>({...s,bottom:Math.max(120,Math.min(440,s.bottom-delta))}))} onDoubleClick={()=>setBottom(false)}/>}<div className="shrink-0 overflow-hidden" style={{height:bottom?sizes.bottom:40,maxHeight:'50%'}}><BottomPanel expanded={bottom} onExpand={()=>setBottom(true)} onCollapse={()=>setBottom(false)}/></div>
    </main>
    {materials&&<><ResizeHandle orientation="v" onDelta={delta=>setSizes(s=>({...s,right:Math.max(300,Math.min(Math.max(520,window.innerWidth-528),s.right-delta))}))}/><aside className="flex shrink-0 flex-col overflow-hidden border-l border-line bg-panel" style={{width:sizes.right,maxWidth:`max(280px, calc(100vw - ${sidebar?sizes.left:0}px - 496px))`}}><BrowserPanel onQuote={quote} onExpand={()=>setSizes(s=>({...s,right:s.right>520?396:Math.min(960,window.innerWidth-528)}))}/></aside></>}
   </div><footer className="flex h-7 shrink-0 items-center justify-between border-t border-line bg-panel px-3 text-caption text-ink-3"><span>{native.session?`Chat · ${native.state.worker}`:tr("Research workspace")}</span><span>{tr(NAV_ITEMS.find(n=>n.id===activeNav)?.label||'')}{projectId&&projectView?` · ${projects.find(p=>p.id===projectId)?.title||''}`:''}</span></footer><CommandPalette/><MarkPromptDock page={`${activeNav}${projectId&&projectView?' / '+projectId:''}`}/>
 </div>
}
