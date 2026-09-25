import { memo, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowLeftToLine, ArrowRightToLine, BookOpen, Columns3, FileCode2, FileText, Folder, Globe, Layers, MessageSquare, Waypoints, Network, Shapes, PictureInPicture2, X } from 'lucide-react'
import { FloatFrame, FloatGrip, floatPart, tornRect, useFloatRect, useTearOff, useViewportWidth, type FloatRect } from '../../components/FloatingPanel'
import { Button, IconBtn, RightMore } from '../../components/ui'
import { ResizeHandle } from '../../components/ResizeHandle'
import { DocumentPanel } from '../../components/DocumentPanel'
import { NAV_ITEMS, useWorkbench, type NavId } from '../../store'
import { cn } from '../../lib/cn'
import { t as tr } from '../../i18n'
import type { Project } from '../../lib/api'
import { ChatPage } from '../chat/ChatPage'
import { SettingsPage } from '../chat/SettingsPage'
import { WorkflowPage } from '../workflow/WorkflowPage'
import { KnowledgePage } from '../resources/KnowledgePage'
import { SourceStage } from '../resources/SourceStage'
import { FilesPage } from '../resources/FilesPage'
import { ArtifactsPage } from '../artifacts/ArtifactsPage'
import { ArgumentCanvas } from '../argument/ArgumentCanvas'
import { FigureStylePage } from '../figures/FigureStylePage'
import { ReviewPanel } from '../review/ReviewPanel'
import { WriteBoundary } from '../review/WriteBoundary'
import { ReadingBridge } from '../projects/ReadingBridge'
import { DraftsPage } from '../projects/DraftsPage'
import { fileTarget } from '../projects/project-object-model'
import { ContentWorkbench } from '../content/ContentWorkbench'
import { WebResource } from './WebResource'
import { OriginalSource } from './OriginalSource'
import { ProjectBuildObserver } from './ProjectBuildObserver'
import { ManuscriptPreview } from './ManuscriptPreview'
import { useProjectPreview } from './useProjectPreview'
import { WritingPreview } from './WritingPreview'
import type { ResourceTab, WorkArea } from './resource-model'
import './resource-workbench.css'

const Chat = memo(ChatPage), Workflow = memo(WorkflowPage), Knowledge = memo(KnowledgePage), Settings = memo(SettingsPage)
const icons = { chat: MessageSquare, research: Network, source: FileCode2, original: FileText, reviews: FileText, drafts: FileText, web: Globe, file: Folder, pdf: FileText, note: BookOpen, artifacts: Layers, argument: Waypoints, 'figure-style': Shapes }

function ResourceTabs({area, floating, onTear}: {area: WorkArea; floating?: {rect: FloatRect; onRect: (rect: FloatRect) => void}; onTear?: (tab: ResourceTab, point: {x: number; y: number}) => void}) {
  const { resourceLayout, projectId, locale, openResource, activateResource, closeResource, moveResource, backResource, chatDock, setChatDock, chatFloat, setChatFloat, sideFloat, setSideFloat } = useWorkbench()
  const zh = locale === 'zh', active = resourceLayout.active[projectId]?.[area]
  // A docked discussion lives in its own column, so it is not also offered as a tab here.
  // On a narrow window the dock falls back to tabs, so the discussion tab must be reachable again.
  const viewport = useViewportWidth(), dockActive = chatDock && viewport >= DOCK.minViewport
  const tabs = resourceLayout.tabs.filter(tab => tab.projectId === projectId && tab.area === area && !((dockActive || chatFloat) && tab.kind === 'chat'))
  return <header className="flex h-panel-header min-w-0 items-center gap-1 border-b border-line px-2" style={floating ? undefined : {gridArea: area + 'Tabs'}}>
    {floating && <FloatGrip rect={floating.rect} onRect={floating.onRect} label={zh ? '拖动并排区（双击停回）' : 'Move side pane (double-click to dock)'} onDock={() => setSideFloat(false)}/>}
    <IconBtn icon={ArrowLeft} label={zh?'返回上个资源':'Back to previous resource'} disabled={!(resourceLayout.previous?.[projectId]?.[area]?.length)} onClick={()=>backResource(area)}/>
    <div role="tablist" aria-label={zh ? (area === 'primary' ? '主工作区' : '并排工作区') : area} className="ui-rtabs flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
      {tabs.map(tab => <ResourceTabItem key={tab.id} tab={tab} active={active === tab.id} zh={zh} tearable={Boolean(onTear) && !(floating && tab.area === 'secondary')} onTear={point => onTear?.(tab, point)} onActivate={() => activateResource(tab.id)} onClose={() => closeResource(tab.id)}/>)}
    </div>
    {area === 'primary' && !dockActive && !chatFloat && <IconBtn icon={PictureInPicture2} label={zh ? '浮动讨论窗口' : 'Float the discussion'} onClick={() => setChatFloat(true)}/>}
    {area === 'secondary' && <IconBtn icon={PictureInPicture2} active={sideFloat} label={sideFloat ? (zh ? '停回右侧' : 'Dock the side pane') : (zh ? '浮动并排区' : 'Float the side pane')} onClick={() => setSideFloat(!sideFloat)}/>}
    {area === 'primary' && !chatDock && !chatFloat && viewport >= DOCK.minViewport && <IconBtn icon={Columns3} label={zh ? '停靠讨论：讨论 | 画布 | 制品 并排' : 'Dock discussion: discussion | canvas | artifact side by side'} onClick={() => setChatDock(true)}/>}
    {active && <IconBtn icon={area === 'primary' ? ArrowRightToLine : ArrowLeftToLine} label={zh ? (area === 'primary' ? '移到并排工作区' : '移到主工作区') : 'Move to other area'} onClick={() => moveResource(active, area === 'primary' ? 'secondary' : 'primary')}/>}
    <RightMore menu label={zh ? '打开资源' : 'Open resource'}>
      {!chatDock && !chatFloat && <Button onClick={() => openResource({kind:'chat'},area)}>{zh?'讨论':'Discussion'}</Button>}
      {projectId && <Button onClick={() => openResource({kind:'research',workspace:projectId,view:'table'},area)}>{zh?'研究内容':'Research content'}</Button>}
      <Button onClick={() => openResource({kind:'file',target:fileTarget(projectId,projectId||'academic')},area)}>{zh?'文件':'Files'}</Button>
      <Button onClick={() => openResource({kind:'note'},area)}>{zh?'笔记':'Notes'}</Button>
      {projectId && <Button onClick={() => openResource({kind:'argument'},area)}>{zh?'论证画布':'Design canvas'}</Button>}
      <Button onClick={() => openResource({kind:'figure-style'},area)}>{zh?'图件风格':'Figure style'}</Button>
      {projectId && <Button onClick={() => openResource({kind:'artifacts'},area)}>{zh?'制品':'Artifacts'}</Button>}
      <Button onClick={() => openResource({kind:'web'},area)}>{zh?'网页':'Web'}</Button>
    </RightMore>
  </header>
}

/** One tab. Dragging it out of the strip tears it off into a floating window at the drop point. */
function ResourceTabItem({tab, active, zh, tearable, onTear, onActivate, onClose}: {tab: ResourceTab; active: boolean; zh: boolean; tearable: boolean; onTear: (point: {x: number; y: number}) => void; onActivate: () => void; onClose: () => void}) {
  const Icon = icons[tab.kind]
  const tear = useTearOff(onTear, tab.kind === 'chat' ? { w: 420, h: 640 } : { w: 580, h: 720 })
  return <div className={cn('ui-rtab group', active && 'is-active')} data-resource-tab={tab.kind} {...(tearable ? tear.handlers : {})}>
    <button type="button" role="tab" aria-selected={active} aria-controls={`resource-${tab.id}`} className="flex min-w-0 touch-none items-center gap-1.5" onClick={onActivate} title={tearable ? (zh ? '拖出标签条可浮动为窗口' : 'Drag out of the strip to float it') : undefined}>
      <Icon size={12} strokeWidth={1.75}/><span className="truncate">{tab.title}</span>
    </button>
    <button type="button" aria-label={`${zh ? '关闭' : 'Close'} ${tab.title}`} className="ui-rtab-close" onClick={onClose}><X size={10}/></button>
    {tearable && tear.preview}
  </div>
}

/** Header of the docked discussion column: the conversation stays one keyed instance, only its grid area moves. */
function DockHeader() {
  const { locale, setChatDock, setChatFloat } = useWorkbench()
  const zh = locale === 'zh'
  return <header className="flex h-panel-header min-w-0 items-center gap-1 border-b border-line px-2" style={{gridArea: 'dockTabs'}}>
    <span className="flex min-w-0 flex-1 items-center gap-1.5 px-1 text-secondary font-medium"><MessageSquare size={12} strokeWidth={1.75}/><span className="truncate">{zh ? '讨论' : 'Discussion'}</span></span>
    <IconBtn icon={PictureInPicture2} label={zh ? '浮动讨论窗口' : 'Float the discussion'} onClick={() => setChatFloat(true)}/>
    <IconBtn icon={Columns3} active label={zh ? '取消停靠，讨论回到标签' : 'Undock discussion back into tabs'} onClick={() => setChatDock(false)}/>
  </header>
}

/** Header of the floating discussion window: move it, dock it as a column, or put it back into the tabs. */
function FloatChatHeader({rect, onRect, z, onRaise}: {rect: FloatRect; onRect: (rect: FloatRect) => void; z: number; onRaise: () => void}) {
  const { locale, setChatDock, setChatFloat } = useWorkbench()
  const zh = locale === 'zh'
  const { chatDock } = useWorkbench()
  // Re-docking returns the window to where it came from: the discussion column if it was docked, else the tab strip.
  return <header className="flex min-w-0 items-center gap-1 border-b border-line px-2" style={floatPart(rect, 'header', FLOAT_HEADER, z)} onPointerDownCapture={onRaise} data-xgc-role="float-chat-header">
    <FloatGrip rect={rect} onRect={onRect} label={zh ? '拖动讨论窗口（双击停回）' : 'Move the discussion window (double-click to dock)'} onDock={() => setChatFloat(false)}/>
    <span className="flex min-w-0 flex-1 items-center gap-1.5 text-secondary font-medium"><MessageSquare size={12} strokeWidth={1.75}/><span className="truncate">{zh ? '讨论' : 'Discussion'}</span></span>
    {chatDock
      ? <IconBtn icon={Columns3} label={zh ? '停回讨论列' : 'Back into the discussion column'} onClick={() => setChatFloat(false)}/>
      : <IconBtn icon={Columns3} label={zh ? '停靠为左侧一列' : 'Dock as a column'} onClick={() => setChatDock(true)}/>}
    <IconBtn icon={ArrowRightToLine} label={zh ? '放回标签' : 'Back into tabs'} onClick={() => chatDock ? setChatDock(false) : setChatFloat(false)}/>
  </header>
}
const FLOAT_HEADER = 40

const DOCK = { default: 380, min: 300, max: 560, minViewport: 1100 } as const

function ResourceBody({tab,active,onQuote}: {tab: ResourceTab;active:boolean;onQuote:(text:string,project?:string)=>void}) {
  const { updateResource, closeResource, showConversation } = useWorkbench()
  const title = (title:string) => updateResource(tab.id,{title})
  const quote = (text:string) => onQuote(text,tab.projectId)
  switch(tab.kind) {
    case 'research': return <ContentWorkbench tabId={tab.id} project={tab.ownerProjectId??tab.projectId} workspace={tab.workspace} view={tab.view} objectId={tab.objectId} digest={tab.digest} artifactId={tab.artifactId} onViewChange={view=>updateResource(tab.id,{view})} active={active} onRequestConversation={showConversation}/>
    case 'source': return <SourceStage view={tab.source} active={active} onClose={()=>closeResource(tab.id)}/>
    case 'original': return <OriginalSource source={tab} scope={{projectId:tab.projectId,workspace:tab.projectId}} onDigest={digest=>updateResource(tab.id,{digest})} onQuote={quote}/>
    case 'web': return <WebResource url={tab.url} report={title}/>
    case 'file': return <FilesPage target={tab.target??fileTarget(tab.projectId,tab.projectId)} active={active} onQuote={quote} onTitle={title}/>
    case 'pdf': return <>
      <div id={`resource-actions-${tab.id}`} className="flex shrink-0 justify-end gap-1 px-2"/>
      <ReadingBridge fill active={active} projectId={tab.projectId} projectWorkspace={tab.projectId} source={{id:'pdf-reader',workspace:tab.pdf.workspace,path:tab.pdf.path,digest:tab.pdf.digest,buildId:tab.pdf.buildId}}>
        <ManuscriptPreview scope={{projectId:tab.projectId,workspace:tab.projectId}} pdf={tab.pdf} active={active} followCurrent={tab.followCurrent} actionsHostId={`resource-actions-${tab.id}`} onFollowChange={followCurrent=>updateResource(tab.id,{followCurrent})} onPDF={pdf=>updateResource(tab.id,{pdf})} onQuote={quote} onTitle={title}/>
      </ReadingBridge>
    </>
    case 'reviews': return <ReviewPanel scope={tab.scope} tabId={tab.id} onTitle={title}/>
    case 'drafts': return <WriteBoundary workspace={tab.scope.workspace} path="research-content.json"><DraftsPage scope={tab.scope} tabId={tab.id} onQuote={quote} onTitle={title}/></WriteBoundary>
    case 'note': return <DocumentPanel active={active} doc={tab.doc} onQuote={quote} onTitle={title}/>
    case 'artifacts': return <ArtifactsPage project={tab.projectId}/>
    case 'argument': return <ArgumentCanvas project={tab.projectId}/>
    case 'figure-style': return <FigureStylePage project={tab.projectId}/>
    default: return null
  }
}

/** One keyed body tree: moving an editor changes its grid area, never its identity or draft. */
export function ResourceWorkbench({projects,onQuote,onOpenSession,secondaryWidth,onResize,onDraggingChange}: {
  projects:Project[];onQuote:(text:string,project?:string)=>void;onOpenSession:(id:string)=>void
  secondaryWidth:number;onResize:(delta:number)=>void;onDraggingChange:(dragging:boolean)=>void
}) {
  const { resourceLayout, projectId, activeNav, secondaryOpen, openResource, locale, showConversation, chatDock, chatFloat, sideFloat } = useWorkbench()
  // Chat floats on the left and the side pane on the right by default, so they never open on top of each other.
  const [chatRect, setChatRect] = useFloatRect('research-ui-float-chat', () => ({ x: 340, y: 96, w: 420, h: Math.min(640, window.innerHeight - 136) }))
  // Clicking a floating window raises it (window-manager grammar); both stay below the command palette (z 50).
  const [front, setFront] = useState<'chat' | 'side'>('chat')
  const zOf = (panel: 'chat' | 'side') => panel === front ? 44 : 40
  const raise = (panel: 'chat' | 'side') => ({ onPointerDownCapture: () => setFront(panel) })
  const [sideRect, setSideRect] = useFloatRect('research-ui-float-side', () => ({ x: window.innerWidth - 640, y: 104, w: 580, h: Math.min(720, window.innerHeight - 144) }))
  const [visited,setVisited] = useState<NavId[]>([])
  const [dockWidth,setDockWidth] = useState<number>(DOCK.default)
  useEffect(()=>setVisited(value=>value.includes(activeNav)?value:[...value,activeNav]),[activeNav])
  useEffect(()=>{
    const state=useWorkbench.getState()
    if(!state.resourceLayout.tabs.some(tab=>tab.projectId===projectId)){const nav=state.activeNav;openResource({kind:'chat'},'primary');state.setActiveNav(nav)}
  },[projectId,openResource])
  const preview = useProjectPreview(projectId), openedFor = useRef(new Set<string>())
  useEffect(()=>{
    if(preview.status!=='ready'||preview.projectId!==projectId||openedFor.current.has(projectId))return
    openedFor.current.add(projectId)
    // Restored PDF tabs retain their chosen build. Only a new project receives an automatic preview.
    if(useWorkbench.getState().resourceLayout.tabs.some(tab=>tab.projectId===projectId&&tab.kind==='pdf'))return
    const before = useWorkbench.getState(), selection = before.resourceLayout.active[projectId]?.secondary
    openResource({kind:'pdf',pdf:preview.pdf,followCurrent:preview.followCurrent},'secondary')
    if(selection)useWorkbench.getState().activateResource(selection)
    useWorkbench.getState().setActiveNav(before.activeNav)
    useWorkbench.getState().setSecondaryOpen(before.secondaryOpen)
  },[preview,projectId,openResource])
  const active = resourceLayout.active[projectId] || {}
  const chat = resourceLayout.tabs.find(tab=>tab.projectId===projectId&&tab.kind==='chat')
  // Three columns need room: below DOCK.minViewport the docked discussion falls back to a tab, without changing the preference.
  const viewport = useViewportWidth()
  const docked = chatDock && !chatFloat && activeNav==='chat' && viewport >= DOCK.minViewport
  const secondaryEmpty = !resourceLayout.tabs.some(tab=>tab.projectId===projectId&&tab.area==='secondary')
  // An empty side pane on Workflow / Knowledge / Settings is chrome, not content: it takes no column there.
  const sideShown = secondaryOpen && (activeNav==='chat' || !secondaryEmpty)
  const sideFloating = sideFloat && sideShown
  // A floating discussion stays visible on every page (talk to the agent while reading the graph); a docked one on Chat.
  const isVisible = (tab:ResourceTab) => tab.projectId===projectId&&(tab.kind==='chat'&&(chatFloat||docked)?true:active[tab.area]===tab.id&&(tab.area==='secondary'?secondaryOpen:activeNav==='chat'))
  const primaryTab = resourceLayout.tabs.find(tab=>tab.id===active.primary)
  const primaryEmpty = !primaryTab || ((docked || chatFloat) && primaryTab.kind==='chat')
  const secondaryColumns = sideShown&&!sideFloating?`auto ${secondaryWidth}px`:'0px 0px'
  const secondaryStyle = (part:'header'|'body') => sideFloating ? floatPart(sideRect, part, FLOAT_HEADER, zOf('side')) : {gridArea: part==='header' ? 'secondaryTabs' : 'secondaryBody'}
  const grid = docked
    ? {gridTemplateColumns:`${dockWidth}px auto minmax(0, 1fr) ${secondaryColumns}`,gridTemplateAreas:'"dockTabs dockDivider primaryTabs divider secondaryTabs" "dockBody dockDivider primaryBody divider secondaryBody"'}
    : {gridTemplateColumns:`minmax(0, 1fr) ${secondaryColumns}`}
  const zh = locale==='zh'
  // Tear-off: the discussion becomes the floating discussion window; any other tab becomes the floating side pane's active tab.
  const tearOff = (tab:ResourceTab, point:{x:number;y:number}) => {
    const s = useWorkbench.getState()
    if (tab.kind==='chat') { setChatRect(tornRect(point,{w:chatRect.w,h:chatRect.h})); s.setChatFloat(true); setFront('chat'); return }
    if (tab.area==='primary') s.moveResource(tab.id,'secondary')
    useWorkbench.getState().activateResource(tab.id)
    setSideRect(tornRect(point,{w:sideRect.w,h:sideRect.h})); useWorkbench.getState().setSideFloat(true); setFront('side')
  }
  return <div className="resource-workbench" style={grid}>
    {[...new Set(resourceLayout.tabs.map(tab=>tab.projectId).filter(Boolean))].map(workspace=><ProjectBuildObserver key={workspace} workspace={workspace}/>)}
    {docked&&<DockHeader/>}
    {docked&&<div style={{gridArea:'dockDivider'}}><ResizeHandle orientation="v" onDraggingChange={onDraggingChange} onDelta={delta=>setDockWidth(w=>Math.max(DOCK.min,Math.min(DOCK.max,w+delta)))}/></div>}
    {activeNav==='chat'?<ResourceTabs area="primary" onTear={tearOff}/>:<div className="flex h-panel-header items-center border-b border-line px-3" style={{gridArea:'primaryTabs'}}><h1 className="font-display text-[14px] font-semibold tracking-tight">{tr(NAV_ITEMS.find(n=>n.id===activeNav)?.label||'')}</h1></div>}
    {chatFloat&&chat&&<FloatFrame rect={chatRect} onRect={setChatRect} z={zOf('chat')} label={zh?'讨论窗口':'Discussion window'}/>}
    {chatFloat&&chat&&<FloatChatHeader rect={chatRect} onRect={setChatRect} z={zOf('chat')} onRaise={()=>setFront('chat')}/>}
    {sideFloating&&<FloatFrame rect={sideRect} onRect={setSideRect} z={zOf('side')} label={zh?'并排区窗口':'Side pane window'}/>}
    <div hidden={!sideShown} style={secondaryStyle('header')} {...(sideFloating?raise('side'):{})}><ResourceTabs area="secondary" onTear={tearOff} floating={sideFloating?{rect:sideRect,onRect:setSideRect}:undefined}/></div>
    <div hidden={!sideShown||sideFloating} style={{gridArea:'divider'}}><ResizeHandle orientation="v" onDelta={onResize} onDraggingChange={onDraggingChange}/></div>
    <section key="conversation" hidden={!chat||!isVisible(chat)} className="resource-body" {...(chatFloat?raise('chat'):{})} style={chatFloat?floatPart(chatRect,'body',FLOAT_HEADER,zOf('chat')):{gridArea:docked?'dockBody':(chat?.area||'primary')+'Body'}}>
      <Chat projects={projects} active={Boolean(chat&&isVisible(chat))}/>
    </section>
    {resourceLayout.tabs.filter(tab=>tab.kind!=='chat').map(tab=><section key={tab.id} id={`resource-${tab.id}`} hidden={!isVisible(tab)} className="resource-body" data-resource-id={tab.id} data-resource-kind={tab.kind} {...(tab.area==='secondary'&&sideFloating?raise('side'):{})} style={tab.area==='secondary'?secondaryStyle('body'):{gridArea:tab.area+'Body'}}>
      <ResourceBody tab={tab} active={isVisible(tab)} onQuote={onQuote}/>
    </section>)}
    {visited.filter(id=>id!=='chat').map(id=><section key={id} hidden={id!==activeNav} className="resource-body" style={{gridArea:'primaryBody'}}>
      {id==='workflow'?<Workflow projectId={projectId||null} onQuote={onQuote} onOpenSession={onOpenSession}/>:id==='settings'?<Settings/>:<Knowledge onQuote={onQuote}/>}
    </section>)}
    {activeNav==='chat'&&primaryEmpty&&(docked||chatFloat?<div className="grid place-content-center p-6" style={{gridArea:'primaryBody'}} data-xgc-role="dock-primary-empty">
      <div className="max-w-sm">
        <p className="font-display text-[18px] tracking-tight">{zh?'在讨论旁打开研究对象':'Open research objects beside the discussion'}</p>
        <p className="mt-2 text-secondary text-ink-3">{zh?'讨论停靠在左侧；这里放研究画布、大纲或文件，并排区放 PDF 与制品。':'The discussion stays docked on the left. Put the canvas, outline or files here, and PDFs or artifacts in the side area.'}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {projectId&&<Button variant="solid" onClick={()=>openResource({kind:'research',workspace:projectId,view:'canvas'},'primary')}>{zh?'研究画布':'Research canvas'}</Button>}
          <Button onClick={()=>openResource({kind:'file',target:fileTarget(projectId,projectId||'academic')},'primary')}>{zh?'文件':'Files'}</Button>
          <Button onClick={()=>openResource({kind:'note'},'primary')}>{zh?'笔记':'Notes'}</Button>
        </div>
        {!projectId&&<p className="mt-3 text-caption text-ink-3">{zh?'选择一个项目后可打开它的研究画布。':'Select a project to open its research canvas.'}</p>}
      </div>
    </div>:<div className="grid place-content-center p-6" style={{gridArea:'primaryBody'}}><Button onClick={showConversation}>{zh?'打开讨论':'Open discussion'}</Button></div>)}
    {sideShown&&secondaryEmpty&&<div className="min-h-0 overflow-auto" style={secondaryStyle('body')}>
      {projectId&&preview.status!=='idle'&&preview.status!=='ready'?<WritingPreview preview={preview} onRetry={preview.reload}/>:<p className="p-6 text-secondary text-ink-3">{zh?'打开文件、笔记或研究内容，在此并排工作。':'Open a file, note or research content here.'}</p>}
    </div>}
  </div>
}
