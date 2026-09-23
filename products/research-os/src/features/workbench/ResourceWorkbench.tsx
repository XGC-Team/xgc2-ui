import { memo, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowLeftToLine, ArrowRightToLine, BookOpen, FileCode2, FileText, Folder, Globe, MessageSquare, Network, X } from 'lucide-react'
import { Button, IconBtn, RightMore } from '../../components/ui'
import { ResizeHandle } from '../../components/ResizeHandle'
import { DocumentPanel } from '../../components/DocumentPanel'
import { NAV_ITEMS, useWorkbench, type NavId } from '../../store'
import { cn } from '../../lib/cn'
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
  const { resourceLayout, projectId, locale, openResource, activateResource, closeResource, moveResource, backResource } = useWorkbench()
  const zh = locale === 'zh', active = resourceLayout.active[projectId]?.[area]
  const tabs = resourceLayout.tabs.filter(tab => tab.projectId === projectId && tab.area === area)
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
    {active && <IconBtn icon={area === 'primary' ? ArrowRightToLine : ArrowLeftToLine} label={zh ? (area === 'primary' ? '移到并排工作区' : '移到主工作区') : 'Move to other area'} onClick={() => moveResource(active, area === 'primary' ? 'secondary' : 'primary')}/>}
    <RightMore label={zh ? '打开资源' : 'Open resource'}>
      <Button onClick={() => openResource({kind:'chat'},area)}>{zh?'讨论':'Discussion'}</Button>
      {projectId && <Button onClick={() => openResource({kind:'research',workspace:projectId,view:'table'},area)}>{zh?'研究内容':'Research content'}</Button>}
      <Button onClick={() => openResource({kind:'file',target:fileTarget(projectId,projectId||'academic')},area)}>{zh?'文件':'Files'}</Button>
      <Button onClick={() => openResource({kind:'note'},area)}>{zh?'笔记':'Notes'}</Button>
      <Button onClick={() => openResource({kind:'web'},area)}>{zh?'网页':'Web'}</Button>
    </RightMore>
  </header>
}

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
  const { resourceLayout, projectId, activeNav, secondaryOpen, openResource, locale, showConversation } = useWorkbench()
  const [visited,setVisited] = useState<NavId[]>([])
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
  const isVisible = (tab:ResourceTab) => tab.projectId===projectId&&active[tab.area]===tab.id&&(tab.area==='secondary'?secondaryOpen:activeNav==='chat')
  const secondaryEmpty = !resourceLayout.tabs.some(tab=>tab.projectId===projectId&&tab.area==='secondary')
  return <div className="resource-workbench" style={{gridTemplateColumns:secondaryOpen?`minmax(0, 1fr) auto ${secondaryWidth}px`:'minmax(0, 1fr) 0px 0px'}}>
    {[...new Set(resourceLayout.tabs.map(tab=>tab.projectId).filter(Boolean))].map(workspace=><ProjectBuildObserver key={workspace} workspace={workspace}/>)}
    {activeNav==='chat'?<ResourceTabs area="primary"/>:<div className="h-panel-header border-b border-line px-3 py-2 text-caption" style={{gridArea:'primaryTabs'}}>{NAV_ITEMS.find(n=>n.id===activeNav)?.label}</div>}
    <div hidden={!secondaryOpen} style={{gridArea:'secondaryTabs'}}><ResourceTabs area="secondary"/></div>
    <div hidden={!secondaryOpen} style={{gridArea:'divider'}}><ResizeHandle orientation="v" onDelta={onResize} onDraggingChange={onDraggingChange}/></div>
    <section key="conversation" hidden={!chat||!isVisible(chat)} className="resource-body" style={{gridArea:(chat?.area||'primary')+'Body'}}>
      <Chat projects={projects} active={Boolean(chat&&isVisible(chat))}/>
    </section>
    {resourceLayout.tabs.filter(tab=>tab.kind!=='chat').map(tab=><section key={tab.id} id={`resource-${tab.id}`} hidden={!isVisible(tab)} className="resource-body" data-resource-id={tab.id} data-resource-kind={tab.kind} style={{gridArea:tab.area+'Body'}}>
      <ResourceBody tab={tab} active={isVisible(tab)} onQuote={onQuote}/>
    </section>)}
    {visited.filter(id=>id!=='chat').map(id=><section key={id} hidden={id!==activeNav} className="resource-body" style={{gridArea:'primaryBody'}}>
      {id==='workflow'?<Workflow projectId={projectId||null} onQuote={onQuote} onOpenSession={onOpenSession}/>:id==='settings'?<Settings/>:<Knowledge onQuote={onQuote}/>}
    </section>)}
    {activeNav==='chat'&&!active.primary&&<div className="grid place-content-center p-6" style={{gridArea:'primaryBody'}}><Button onClick={showConversation}>{locale==='zh'?'打开讨论':'Open discussion'}</Button></div>}
    {secondaryOpen&&secondaryEmpty&&<div className="min-h-0 overflow-auto" style={{gridArea:'secondaryBody'}}>
      {projectId&&preview.status!=='idle'&&preview.status!=='ready'?<WritingPreview preview={preview} onRetry={preview.reload}/>:<p className="p-6 text-secondary text-ink-3">{locale==='zh'?'打开文件、笔记或研究内容，在此并排工作。':'Open a file, note or research content here.'}</p>}
    </div>}
  </div>
}
