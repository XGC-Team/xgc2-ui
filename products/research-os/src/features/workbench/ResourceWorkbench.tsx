import { memo, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowLeftToLine, ArrowRightToLine, BookOpen, Columns3, FileCode2, FileText, Folder, Globe, MessageSquare, Network, X } from 'lucide-react'
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
const icons = { chat: MessageSquare, research: Network, source: FileCode2, original: FileText, reviews: FileText, drafts: FileText, web: Globe, file: Folder, pdf: FileText, note: BookOpen }

function ResourceTabs({area}: {area: WorkArea}) {
  const { resourceLayout, projectId, locale, openResource, activateResource, closeResource, moveResource, backResource, chatDock, setChatDock } = useWorkbench()
  const zh = locale === 'zh', active = resourceLayout.active[projectId]?.[area]
  // A docked discussion lives in its own column, so it is not also offered as a tab here.
  const tabs = resourceLayout.tabs.filter(tab => tab.projectId === projectId && tab.area === area && !(chatDock && tab.kind === 'chat'))
  return <header className="flex h-panel-header min-w-0 items-center gap-1 border-b border-line px-2" style={{gridArea: area + 'Tabs'}}>
    <IconBtn icon={ArrowLeft} label={zh?'返回上个资源':'Back to previous resource'} disabled={!(resourceLayout.previous?.[projectId]?.[area]?.length)} onClick={()=>backResource(area)}/>
    <div role="tablist" aria-label={zh ? (area === 'primary' ? '主工作区' : '并排工作区') : area} className="ui-rtabs flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
      {tabs.map(tab => { const Icon = icons[tab.kind]; return <div key={tab.id} className={cn('ui-rtab group', active === tab.id && 'is-active')}>
        <button type="button" role="tab" aria-selected={active === tab.id} aria-controls={`resource-${tab.id}`} className="flex min-w-0 items-center gap-1.5" onClick={() => activateResource(tab.id)}>
          <Icon size={12} strokeWidth={1.75}/><span className="truncate">{tab.title}</span>
        </button>
        <button type="button" aria-label={`${zh ? '关闭' : 'Close'} ${tab.title}`} className="ui-rtab-close" onClick={() => closeResource(tab.id)}><X size={10}/></button>
      </div> })}
    </div>
    {area === 'primary' && !chatDock && <IconBtn icon={Columns3} label={zh ? '停靠讨论：讨论 | 画布 | 制品 并排' : 'Dock discussion: discussion | canvas | artifact side by side'} onClick={() => setChatDock(true)}/>}
    {active && <IconBtn icon={area === 'primary' ? ArrowRightToLine : ArrowLeftToLine} label={zh ? (area === 'primary' ? '移到并排工作区' : '移到主工作区') : 'Move to other area'} onClick={() => moveResource(active, area === 'primary' ? 'secondary' : 'primary')}/>}
    <RightMore label={zh ? '打开资源' : 'Open resource'}>
      {!chatDock && <Button onClick={() => openResource({kind:'chat'},area)}>{zh?'讨论':'Discussion'}</Button>}
      {projectId && <Button onClick={() => openResource({kind:'research',workspace:projectId,view:'table'},area)}>{zh?'研究内容':'Research content'}</Button>}
      <Button onClick={() => openResource({kind:'file',target:fileTarget(projectId,projectId||'academic')},area)}>{zh?'文件':'Files'}</Button>
      <Button onClick={() => openResource({kind:'note'},area)}>{zh?'笔记':'Notes'}</Button>
      <Button onClick={() => openResource({kind:'web'},area)}>{zh?'网页':'Web'}</Button>
    </RightMore>
  </header>
}

/** Header of the docked discussion column: the conversation stays one keyed instance, only its grid area moves. */
function DockHeader() {
  const { locale, setChatDock } = useWorkbench()
  const zh = locale === 'zh'
  return <header className="flex h-panel-header min-w-0 items-center gap-1 border-b border-line px-2" style={{gridArea: 'dockTabs'}}>
    <span className="flex min-w-0 flex-1 items-center gap-1.5 px-1 text-secondary font-medium"><MessageSquare size={12} strokeWidth={1.75}/><span className="truncate">{zh ? '讨论' : 'Discussion'}</span></span>
    <IconBtn icon={Columns3} active label={zh ? '取消停靠，讨论回到标签' : 'Undock discussion back into tabs'} onClick={() => setChatDock(false)}/>
  </header>
}

const DOCK = { default: 380, min: 300, max: 560 } as const

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
    default: return null
  }
}

/** One keyed body tree: moving an editor changes its grid area, never its identity or draft. */
export function ResourceWorkbench({projects,onQuote,onOpenSession,secondaryWidth,onResize,onDraggingChange}: {
  projects:Project[];onQuote:(text:string,project?:string)=>void;onOpenSession:(id:string)=>void
  secondaryWidth:number;onResize:(delta:number)=>void;onDraggingChange:(dragging:boolean)=>void
}) {
  const { resourceLayout, projectId, activeNav, secondaryOpen, openResource, locale, showConversation, chatDock } = useWorkbench()
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
  const docked = chatDock && activeNav==='chat'
  const isVisible = (tab:ResourceTab) => tab.projectId===projectId&&(docked&&tab.kind==='chat'?true:active[tab.area]===tab.id&&(tab.area==='secondary'?secondaryOpen:activeNav==='chat'))
  const secondaryEmpty = !resourceLayout.tabs.some(tab=>tab.projectId===projectId&&tab.area==='secondary')
  const primaryTab = resourceLayout.tabs.find(tab=>tab.id===active.primary)
  const primaryEmpty = !primaryTab || (docked && primaryTab.kind==='chat')
  const secondaryColumns = secondaryOpen?`auto ${secondaryWidth}px`:'0px 0px'
  const grid = docked
    ? {gridTemplateColumns:`${dockWidth}px auto minmax(0, 1fr) ${secondaryColumns}`,gridTemplateAreas:'"dockTabs dockDivider primaryTabs divider secondaryTabs" "dockBody dockDivider primaryBody divider secondaryBody"'}
    : {gridTemplateColumns:`minmax(0, 1fr) ${secondaryColumns}`}
  const zh = locale==='zh'
  return <div className="resource-workbench" style={grid}>
    {[...new Set(resourceLayout.tabs.map(tab=>tab.projectId).filter(Boolean))].map(workspace=><ProjectBuildObserver key={workspace} workspace={workspace}/>)}
    {docked&&<DockHeader/>}
    {docked&&<div style={{gridArea:'dockDivider'}}><ResizeHandle orientation="v" onDraggingChange={onDraggingChange} onDelta={delta=>setDockWidth(w=>Math.max(DOCK.min,Math.min(DOCK.max,w+delta)))}/></div>}
    {activeNav==='chat'?<ResourceTabs area="primary"/>:<div className="flex h-panel-header items-center border-b border-line px-3" style={{gridArea:'primaryTabs'}}><h1 className="font-display text-[14px] font-semibold tracking-tight">{tr(NAV_ITEMS.find(n=>n.id===activeNav)?.label||'')}</h1></div>}
    <div hidden={!secondaryOpen} style={{gridArea:'secondaryTabs'}}><ResourceTabs area="secondary"/></div>
    <div hidden={!secondaryOpen} style={{gridArea:'divider'}}><ResizeHandle orientation="v" onDelta={onResize} onDraggingChange={onDraggingChange}/></div>
    <section key="conversation" hidden={!chat||!isVisible(chat)} className="resource-body" style={{gridArea:docked?'dockBody':(chat?.area||'primary')+'Body'}}>
      <Chat projects={projects} active={Boolean(chat&&isVisible(chat))}/>
    </section>
    {resourceLayout.tabs.filter(tab=>tab.kind!=='chat').map(tab=><section key={tab.id} id={`resource-${tab.id}`} hidden={!isVisible(tab)} className="resource-body" data-resource-id={tab.id} data-resource-kind={tab.kind} style={{gridArea:tab.area+'Body'}}>
      <ResourceBody tab={tab} active={isVisible(tab)} onQuote={onQuote}/>
    </section>)}
    {visited.filter(id=>id!=='chat').map(id=><section key={id} hidden={id!==activeNav} className="resource-body" style={{gridArea:'primaryBody'}}>
      {id==='workflow'?<Workflow projectId={projectId||null} onQuote={onQuote} onOpenSession={onOpenSession}/>:id==='settings'?<Settings/>:<Knowledge onQuote={onQuote}/>}
    </section>)}
    {activeNav==='chat'&&primaryEmpty&&(docked?<div className="grid place-content-center p-6" style={{gridArea:'primaryBody'}} data-xgc-role="dock-primary-empty">
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
    {secondaryOpen&&secondaryEmpty&&<div className="min-h-0 overflow-auto" style={{gridArea:'secondaryBody'}}>
      {projectId&&preview.status!=='idle'&&preview.status!=='ready'?<WritingPreview preview={preview} onRetry={preview.reload}/>:<p className="p-6 text-secondary text-ink-3">{zh?'打开文件、笔记或研究内容，在此并排工作。':'Open a file, note or research content here.'}</p>}
    </div>}
  </div>
}
