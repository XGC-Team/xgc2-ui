import {t as tr} from './i18n'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { IconMark, IconPanelBottom, IconPanelLeft, IconPanelRight } from './components/icons'
import { Search } from 'lucide-react'
import { MarkPromptDock } from './devtools/mark-prompt/MarkPromptDock'
import { BottomPanel } from './components/BottomPanel'
import { ResourceWorkbench } from './features/workbench/ResourceWorkbench'
import { IconBtn } from './components/ui'
import { Rail } from './components/Rail'
import { Sidebar } from './components/Sidebar'
import { ResizeHandle } from './components/ResizeHandle'
import { readPreference, writePreference } from './lib/storage'
import { CommandPalette } from './components/CommandPalette'
import { NAV_ITEMS, useWorkbench } from './store'
import { researchProjects } from './features/workbench/writing-session'
import { collection, listWorkspaces, type Project } from './lib/api'
import { AgentSessionProvider, useNativeAgentSession } from './features/chat/Session'
export default function App(){
 const {projectId}=useWorkbench()
 return <AgentSessionProvider researchProjectId={projectId}><Workbench/></AgentSessionProvider>
}
/* 面板尺寸系统：默认值与拖拽夹取范围集中在这里，与 index.css 令牌同轨 */
const PANEL={left:{default:264,min:208,max:360},right:{default:396,min:300,max:560},bottom:{default:252,min:180,max:440}} as const
const layoutEase=[0.32,0.72,0,1] as const
/* 拖拽期间 memo 住各页面/面板：只有外壳尺寸在变，内容树不参与重渲染 */
const SidebarM=memo(Sidebar),BottomPanelM=memo(BottomPanel),ResourceWorkbenchM=memo(ResourceWorkbench)
function Workbench(){
 const {theme,locale,activeNav,setActiveNav,setPaletteOpen,projectId,enterWritingProject,showConversation}=useWorkbench();const native=useNativeAgentSession()
 const {secondaryOpen:materials,setSecondaryOpen:setMaterials}=useWorkbench()
 const [bottom,setBottom]=useState(readPreference('research-ui-bottom')==='open'),[sizes,setSizes]=useState<{left:number;right:number;bottom:number}>({left:PANEL.left.default,right:PANEL.right.default,bottom:PANEL.bottom.default})
 const [dragging,setDragging]=useState(false)
 const [sidebar,setSidebar]=useState(true),[projects,setProjects]=useState<Project[]>([]),[error,setError]=useState(''),[reload,setReload]=useState(0),[loading,setLoading]=useState(false)
 useEffect(()=>{document.documentElement.classList.toggle('dark',theme==='dark');document.documentElement.lang=locale},[theme,locale])
 useEffect(()=>{const c=new AbortController();setLoading(true);setError('')
   void (async()=>{
     const [spaces,records]=await Promise.all([listWorkspaces(c.signal),collection<Project&{projectId?:string}>('/research/projects',c.signal)])
     setProjects(researchProjects(spaces,records))
   })().catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setLoading(false)});return()=>c.abort()
 },[reload])
 useEffect(()=>{const refresh=()=>setReload(n=>n+1);window.addEventListener('focus',refresh);const timer=setInterval(refresh,30000);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}},[])
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setPaletteOpen(true)}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='j'){e.preventDefault();setBottom(s=>!s)}if((e.metaKey||e.ctrlKey)&&e.key==='.'){e.preventDefault();setMaterials(!useWorkbench.getState().secondaryOpen)}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='b'){e.preventDefault();setSidebar(s=>!s)}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[setPaletteOpen])
 useEffect(()=>{writePreference('research-ui-bottom',bottom?'open':'collapsed')},[bottom])
 const projectView=activeNav==='chat'||activeNav==='workflow'
 const quote=useCallback((text:string,targetProject?:string)=>{native.appendDraft(text,targetProject);if(targetProject!==undefined&&targetProject!==projectId)enterWritingProject(targetProject);showConversation()},[native,projectId,enterWritingProject,showConversation])
 const openSession=useCallback((id:string)=>void native.operation(async()=>{await native.openSession(id);showConversation()}),[native,showConversation])
 const refreshProjects=useCallback(()=>setReload(n=>n+1),[])
 const openBottom=useCallback(()=>setBottom(true),[]),closeBottom=useCallback(()=>setBottom(false),[])
 /* 拖拽尺寸按帧合流：pointermove 增量累积，每帧最多一次 setSizes */
 const acc=useRef({left:0,right:0,bottom:0}),frame=useRef(0)
 const clampPanel=(k:'left'|'right'|'bottom',v:number)=>Math.max(PANEL[k].min,Math.min(k==='right'?Math.max(PANEL.right.max,window.innerWidth-528):PANEL[k].max,v))
 const queueResize=useCallback((key:'left'|'right'|'bottom',delta:number)=>{acc.current[key]+=delta;if(frame.current)return;frame.current=requestAnimationFrame(()=>{frame.current=0;const d=acc.current;acc.current={left:0,right:0,bottom:0};setSizes(s=>({left:clampPanel('left',s.left+d.left),right:clampPanel('right',s.right+d.right),bottom:clampPanel('bottom',s.bottom+d.bottom)}))})},[])
 useEffect(()=>()=>{if(frame.current)cancelAnimationFrame(frame.current)},[])
 const panelMotion={duration:dragging?0:0.24,ease:layoutEase}
 /* 顶栏通栏：rail 与右栏 tabs 都让出顶栏，左中右不再割裂。
    左 = 产品标 + 语境；中 = 全局搜索（点击弹 CommandPalette）；右 = 页操作 + 面板开关 */
 return <div className="flex h-screen min-w-0 flex-col overflow-hidden bg-app">
  <header className="ui-toolbar relative border-b border-line">
   <div className="flex min-w-0 items-center gap-2.5">
    {/* 品牌标与 rail 图标同轴：rail 内容宽 47（48 减 1px 右边线）→ 轴线 23.5px；header 左补 12 + 半盒 11.5 */}
    <span className="grid w-[23px] shrink-0 place-items-center text-ink"><IconMark size={20}/></span>
    <span className="shrink-0 font-display text-[13px] font-semibold tracking-tight">Research OS</span>
    <span aria-hidden className="shrink-0 text-ink-3">·</span>
    {projectId&&projectView&&<><span className="truncate text-[13px] text-ink-2">{projects.find(p=>p.id===projectId)?.title||'研究项目'}</span><span className="shrink-0 text-ink-3">/</span></>}
    <span className="shrink-0 text-[13px] font-medium">{tr(NAV_ITEMS.find(n=>n.id===activeNav)?.label||'')}</span>
   </div>
   <button type="button" onClick={()=>setPaletteOpen(true)} aria-label={tr('全局搜索')}
    className="absolute left-1/2 top-1/2 hidden h-7 w-[min(400px,36vw)] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-md bg-inset px-2.5 text-secondary text-ink-3 transition-colors hover:bg-active hover:text-ink-2 sm:flex">
    <Search size={12} strokeWidth={1.75} className="shrink-0"/>
    <span className="min-w-0 flex-1 truncate text-left">{tr('搜索…')}</span>
    <kbd className="shrink-0 rounded border border-line px-1 text-[10px] leading-4 text-ink-3">⌘K</kbd>
   </button>
   <div id="workbench-page-actions" className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto"/>
   <div className="ml-1 flex shrink-0 items-center gap-1"><IconBtn icon={IconPanelLeft} label={tr("侧栏")} active={sidebar} onClick={()=>setSidebar(!sidebar)}/><IconBtn icon={IconPanelBottom} label={tr("下栏")} active={bottom} onClick={()=>setBottom(!bottom)}/><IconBtn icon={IconPanelRight} label={locale==='zh'?'并排工作区':'Side by side workspace'} active={materials} onClick={()=>setMaterials(!materials)}/></div>
  </header>
  <div className="flex min-h-0 min-w-0 flex-1">
   <Rail/>
   <motion.aside initial={false} animate={{width:sidebar?sizes.left:0}} transition={panelMotion} className="shrink-0 overflow-hidden">
    <div className="h-full bg-panel" style={{width:sizes.left}}><SidebarM projects={projects} onRefresh={refreshProjects} loading={loading} error={error}/></div>
   </motion.aside>
   {sidebar&&<ResizeHandle orientation="v" onDraggingChange={setDragging} onDelta={delta=>queueResize('left',delta)}/>}
   <main className="relative flex min-w-0 flex-1 flex-col">
    <ResourceWorkbenchM projects={projects} onQuote={quote} onOpenSession={openSession} secondaryWidth={sizes.right} onResize={delta=>queueResize('right',-delta)} onDraggingChange={setDragging}/>
    {bottom&&<ResizeHandle orientation="h" onDraggingChange={setDragging} onDelta={delta=>queueResize('bottom',-delta)} onDoubleClick={()=>setBottom(false)}/>}<motion.div initial={false} animate={{height:bottom?sizes.bottom:0}} transition={panelMotion} className="shrink-0 overflow-hidden" style={{maxHeight:'50%'}}><BottomPanelM expanded={bottom} onExpand={openBottom} onCollapse={closeBottom}/></motion.div>
   </main>
  </div>
  <CommandPalette/><MarkPromptDock page={`${activeNav}${projectId&&projectView?' / '+projectId:''}`}/>
 </div>
}
