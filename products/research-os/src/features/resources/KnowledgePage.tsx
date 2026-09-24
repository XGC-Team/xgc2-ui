import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {t as tr} from '../../i18n'
import {useWorkbench} from '../../store'
import {GraphView,type GraphMark} from '../../components/GraphView'
import {rankMatches} from '../../lib/graph-render'
import {sharedContentSession} from '../content/useContentDocument'
import type {GraphCamera} from '../../lib/graph-camera'
import {academicGraph,inspectKnowledgeResource,loadCompleteKnowledgeGraph,type KnowledgeEdge,type KnowledgePage,type KnowledgeQuery} from './academic-graph'
import {invalidateKnowledgeAccess,knowledgeAccessLost,useAcademicNotes} from './useAcademicNotes'
import {clearKnowledgeView,emptyKnowledgeView,readKnowledgeView,saveKnowledgeView,type KnowledgeViewState} from './knowledge-view-state'
import {CanvasBacklinks,Reader} from './Reader'
import {useNoteLinks} from './note-links'
import {BookOpen,FileText,Link2,MessageSquarePlus,Network,PanelRight,Search,SlidersHorizontal,X} from 'lucide-react'
import {Button,Popover,RightMore} from '../../components/ui'
import {cn} from '../../lib/cn'
import {trimKnowledgeQuery} from './knowledge-snapshot'

type Inspection = Awaited<ReturnType<typeof inspectKnowledgeResource>>

/* Domain view only. A continues to own shell/navigation; file opens use its existing navigator. */
type KnowledgePageProps = {onQuote?:(text:string)=>void;viewId?:string}
export function KnowledgePage(props:KnowledgePageProps){
 return <KnowledgeView key={props.viewId||'academic'} {...props}/>
}
function KnowledgeView({viewId='academic'}:KnowledgePageProps){
 const {readingDocument,locale}=useWorkbench(),zh=locale==='zh'
 const [layoutState,setLayoutState]=useState<'laying'|'ready'>('ready')
 const searchRef=useRef<HTMLInputElement>(null)
 const {page,loading,error,refresh}=useAcademicNotes()
 const [view,setView]=useState(()=>readKnowledgeView(viewId))
 const [projected,setProjected]=useState<KnowledgePage|null>(null)
 const [searchError,setSearchError]=useState('')
 const [appliedQuery,setAppliedQuery]=useState('')
 const [searching,setSearching]=useState(false)
 const [retry,setRetry]=useState(0)
 const [blocked,setBlocked]=useState(false)
 const [inspectId,setInspectId]=useState('')
 const [inspection,setInspection]=useState<Inspection|null>(null)
 const [inspectError,setInspectError]=useState('')
 const queryKey=JSON.stringify([trimKnowledgeQuery(view.query),view.unresolved,view.orphans,view.focus,view.depth,view.direction])
 const filtered=!!(trimKnowledgeQuery(view.query)||view.focus||view.unresolved!=='include'||view.orphans!=='include')

 useEffect(()=>{saveKnowledgeView(view,viewId)},[view,viewId])
 // Keyboard grammar (Obsidian / VS Code): "/" jumps to search; Esc closes the inspector.
 useEffect(()=>{
  const onKey=(e:KeyboardEvent)=>{
   const typing=e.target instanceof HTMLElement&&(e.target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))
   if(e.key==='/'&&!typing&&!e.metaKey&&!e.ctrlKey){e.preventDefault();searchRef.current?.focus()}
   else if(e.key==='Escape'&&!typing)setInspectId('')
  }
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)
 },[])
 useEffect(()=>{
  const lost=()=>{
   setBlocked(true);setProjected(null);setInspectId('');setInspection(null)
   clearKnowledgeView(viewId);setView(emptyKnowledgeView())
  }
  window.addEventListener('research:knowledge-access-lost',lost)
  return()=>window.removeEventListener('research:knowledge-access-lost',lost)
 },[viewId])
 useEffect(()=>{if(page)setBlocked(false)},[page])
 useEffect(()=>{
  setSearchError('')
  if(!filtered||!page?.snapshot){setProjected(null);setSearching(false);return}
  const [query,unresolved,orphans,focus,depth,direction]=JSON.parse(queryKey) as [string,KnowledgeViewState['unresolved'],KnowledgeViewState['orphans'],string,number,KnowledgeViewState['direction']]
  const request:KnowledgeQuery={query,unresolved,orphans,focus,depth,direction,snapshot:page.snapshot}
  const c=new AbortController();setSearching(true)
  const timer=window.setTimeout(()=>{
   loadCompleteKnowledgeGraph(request,c.signal).then(data=>{
    if(!c.signal.aborted){setProjected(data);setAppliedQuery(queryKey)}
   }).catch(e=>{
    if(c.signal.aborted)return
    if(knowledgeAccessLost(e)){invalidateKnowledgeAccess();return}
    setSearchError(e instanceof Error?e.message:'检索未能完成。')
   }).finally(()=>{if(!c.signal.aborted)setSearching(false)})
  },200)
  return()=>{window.clearTimeout(timer);c.abort()}
 },[queryKey,filtered,page?.snapshot,retry])

 // Invalid/new requests never substitute partial data. A new base snapshot also
 // makes the previous filtered revision ineligible immediately, before effects.
 const active=page?(filtered&&projected?.snapshot===page.snapshot?projected:page):null
 const graph=useMemo(()=>active?academicGraph(active):null,[active])
 const titles=useMemo(()=>new Map(page?.nodes.map(node=>[node.id,node.title])||[]),[page])
 useEffect(()=>{
  setInspection(null);setInspectError('')
  if(!inspectId||!active?.snapshot||blocked)return
  const c=new AbortController()
  inspectKnowledgeResource(inspectId,active.snapshot,c.signal,active.scope).then(value=>{
   if(!c.signal.aborted)setInspection(value)
  }).catch(e=>{
   if(c.signal.aborted)return
   if(knowledgeAccessLost(e)&&e.status!==404){invalidateKnowledgeAccess();return}
   setInspectError(e instanceof Error?e.message:'关系检查未能完成。')
  })
  return()=>c.abort()
 },[inspectId,active?.snapshot,active?.scope,blocked])
 const saveCamera=useCallback((camera:GraphCamera)=>{
  setView(previous=>{const prior=previous.camera;return prior&&prior.x===camera.x&&prior.y===camera.y&&prior.k===camera.k?previous:{...previous,camera}})
 },[])
 const setFilter=<K extends keyof KnowledgeViewState>(key:K,value:KnowledgeViewState[K])=>setView(previous=>({...previous,[key]:value}))
 const inspect=inspection?.node.id===inspectId&&inspection.snapshot===active?.snapshot?inspection:null
 const pending=filtered&&(appliedQuery!==queryKey||projected?.snapshot!==page?.snapshot)
 const status=searchError?`${tr('检索未应用，保留上次完整视图。')} ${searchError}`:searching||pending?tr('正在检索，保留上次完整视图…'):error?`${tr('刷新失败，保留上次完整视图。')} ${error}`:loading?tr('正在核对知识库的新版本…'):''

 const degree=useMemo(()=>{const d=new Map<string,number>();for(const e of active?.edges??[]){d.set(e.source,(d.get(e.source)??0)+1);d.set(e.target,(d.get(e.target)??0)+1)}return d},[active])
 const results=trimKnowledgeQuery(view.query)&&active?rankMatches(active.nodes,view.query,n=>degree.get(n.id)??0).slice(0,8):[]
 const marks=useProjectKnowledgeMarks(active)
 const markLegend=marks.size?(zh?`本项目 · ${marks.size}`:`This project · ${marks.size}`):''
 const counts=`${active?.counts.matched??0} ${tr('节点')} · ${active?.counts.matchedEdges??0} ${tr('关系')}`

 // The reader carries its own "back to graph" control; no second header bar.
 if(readingDocument&&!blocked)return <div className="h-full min-h-0"><Reader/></div>
 if(!graph||blocked)return <div className="ui-empty" role="status"><p>{tr(error||'正在读取学术仓库的完整知识与链接…')}</p><button className="ui-btn mt-3" onClick={refresh}>{tr('重新读取')}</button></div>
 return <div className="relative h-full min-h-0" data-xgc-role="knowledge-workspace">
  <GraphView data={graph} focus={inspectId||undefined} marks={marks} frame={filtered?'fit':'keep'} onLayoutState={setLayoutState} initialCamera={view.camera} onCameraChange={saveCamera} onSelect={id=>{const node=graph.nodes[id];if(node?.resourceId)setInspectId(node.resourceId)}}/>
  {/* 检索即浏览（Obsidian 快速切换语法）：输入即列出命中笔记，点选=在图中定位并打开检查器；筛选收进一个弹层 */}
  <div className="absolute left-3 top-3 z-10 w-[min(320px,calc(100%-1.5rem))] rounded-lg border border-line bg-panel shadow-soft" data-xgc-role="knowledge-search">
   <div className="flex items-center gap-1 p-1.5">
    <Search size={13} strokeWidth={1.75} className="ml-1 shrink-0 text-ink-3"/>
    <input ref={searchRef} className="h-7 min-w-0 flex-1 bg-transparent px-1 text-secondary outline-none placeholder:text-ink-3" value={view.query} onChange={e=>setFilter('query',e.target.value)} placeholder={tr('检索标题、路径、标签与正文…')} aria-label={tr('检索知识库')}
     onKeyDown={e=>{if(e.key==='Enter'&&results[0]){e.preventDefault();setInspectId(results[0].id)}if(e.key==='Escape'){e.preventDefault();if(view.query)setFilter('query','');else e.currentTarget.blur()}}}/>
    {!view.query&&<kbd className="mr-1 shrink-0 rounded border border-line px-1 text-[10px] leading-4 text-ink-3" title={tr('按 / 检索')}>/</kbd>}
    <Popover label={tr('筛选')} width="w-64" trigger={({open,toggle})=><button type="button" aria-expanded={open} onClick={toggle} aria-label={tr('筛选')} title={tr('筛选')} className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-hover hover:text-ink',(view.unresolved!=='include'||view.orphans!=='include')&&'text-ink')}><SlidersHorizontal size={13} strokeWidth={1.75}/></button>}>
     <div className="flex flex-col gap-2 p-1 text-caption">
      <label className="flex items-center justify-between gap-2">{tr('未解析')} <select className="ui-select-compact" aria-label={tr('未解析目标过滤')} value={view.unresolved} onChange={e=>setFilter('unresolved',e.target.value as KnowledgeViewState['unresolved'])}><option value="include">{tr('包含')}</option><option value="only">{tr('仅未解析')}</option><option value="exclude">{tr('隐藏')}</option></select></label>
      <label className="flex items-center justify-between gap-2">{tr('孤立节点')} <select className="ui-select-compact" aria-label={tr('孤立节点过滤')} value={view.orphans} onChange={e=>setFilter('orphans',e.target.value as KnowledgeViewState['orphans'])}><option value="include">{tr('包含')}</option><option value="only">{tr('仅孤立')}</option><option value="exclude">{tr('隐藏')}</option></select></label>
      {view.focus&&<>
       <label className="flex items-center justify-between gap-2">{tr('深度')} <input type="number" min="1" className="ui-select-compact w-16" value={view.depth} onChange={e=>{const n=Number(e.target.value);if(Number.isSafeInteger(n)&&n>=1)setFilter('depth',n)}}/></label>
       <label className="flex items-center justify-between gap-2">{tr('局部关系方向')} <select className="ui-select-compact" aria-label={tr('局部关系方向')} value={view.direction} onChange={e=>setFilter('direction',e.target.value as KnowledgeViewState['direction'])}><option value="both">{tr('双向')}</option><option value="outbound">{tr('出链')}</option><option value="inbound">{tr('回链')}</option></select></label>
      </>}
      <div className="flex gap-1 border-t border-line pt-2">
       <Button size="xs" onClick={()=>{setView(previous=>({...emptyKnowledgeView(),camera:previous.camera}));setProjected(null)}}>{tr('清除筛选')}</Button>
       <Button size="xs" onClick={()=>{refresh();setRetry(n=>n+1)}}>{tr('刷新')}</Button>
      </div>
     </div>
    </Popover>
   </div>
   {results.length>0&&<div className="max-h-72 overflow-y-auto border-t border-line p-1" role="listbox" aria-label={tr('检索结果')}>
    {results.map(node=><button key={node.id} type="button" role="option" aria-selected={inspectId===node.id} onClick={()=>setInspectId(node.id)} data-xgc-role="knowledge-result"
     className={cn('flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-secondary text-ink-2 hover:bg-hover hover:text-ink',inspectId===node.id&&'bg-active text-ink')}>
     <FileText size={12} strokeWidth={1.75} className="shrink-0 text-ink-3"/><span className="min-w-0 flex-1 truncate">{node.title}</span><span className="max-w-24 shrink-0 truncate text-caption text-ink-3">{node.path?.replace(/^memory\//,'')}</span>
    </button>)}
   </div>}
   <p className="flex items-center gap-1 border-t border-line px-2.5 py-1 text-caption text-ink-3" aria-live="polite">
    <span className="min-w-0 flex-1 truncate">{view.focus?`${tr('局部图')} · `:''}{layoutState==='laying'?(zh?`正在排布 ${active?.counts.matched??0} 个节点…`:`Laying out ${active?.counts.matched??0} nodes…`):counts}</span>
    {markLegend&&<span className="shrink-0" title={zh?'圈 = 已附加到本项目对话；实心点中空 = 被本项目画布卡片引用':'Ring = attached to this project’s chat; hollow centre = cited by its canvas cards'}>{markLegend}</span>}
    {view.focus&&<button type="button" className="shrink-0 hover:text-ink-2" onClick={()=>setFilter('focus','')}>{tr('返回全局图')}</button>}
   </p>
  </div>
  {inspectId&&<NodeInspector id={inspectId} inspect={inspect} error={inspectError} titles={titles} onInspect={setInspectId} onClose={()=>setInspectId('')} onLocal={id=>setFilter('focus',id)}/>}
  {status&&<div role="status" className="absolute bottom-3 left-3 z-10 max-w-[min(420px,calc(100%-1.5rem))] rounded-md border border-line bg-panel px-2.5 py-1.5 text-caption text-ink-3 shadow-soft"><span>{status}</span>{searchError&&<button className="ml-3 underline" onClick={()=>setRetry(n=>n+1)}>{tr('重试检索')}</button>}</div>}
 </div>
}

/* 节点检查器：一个对象、四个出口——阅读、在对话旁打开、加入对话（版本化引用）、链接到所选画布卡片；
   出链/回链是可点的对象列表，画布引用列出本项目中引用此笔记的卡片。 */
function NodeInspector({id,inspect,error,titles,onInspect,onClose,onLocal}:{id:string;inspect:Inspection|null;error:string;titles:Map<string,string>;onInspect:(id:string)=>void;onClose:()=>void;onLocal:(id:string)=>void}){
 const {previewDocument,openDocument,locale}=useWorkbench();const zh=locale==='zh'
 const links=useNoteLinks(),{setNote}=links
 useEffect(()=>setNote(''),[id,setNote])
 const node=inspect?.node
 const doc=node?.exists&&node.path&&node.digest?{workspace:'academic',path:node.path,title:node.title,digest:node.digest}:null
 const row=(edge:KnowledgeEdge,end:'source'|'target')=>{const other=edge[end];const label=titles.get(other)||(end==='target'?edge.targetHint:'')||other
  return <button key={`${end}:${edge.id}`} type="button" onClick={()=>onInspect(other)} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-secondary text-ink-2 hover:bg-hover hover:text-ink" title={edge.sourceRevision?`${tr('来源版本')} ${edge.sourceRevision}`:tr('无可核验版本')}>
   <span className="min-w-0 flex-1 truncate">{label}</span><span className="shrink-0 text-caption text-ink-3">{edge.resolved?edge.kind:tr('未解析')}</span></button>}
 return <aside className="absolute right-3 top-3 z-10 flex max-h-[calc(100%-1.5rem)] w-[min(340px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-soft" aria-label={tr('知识关系检查')} data-xgc-role="knowledge-inspector" data-xgc-id={id}>
  <div className="flex items-center gap-2 px-3 pt-2.5">
   <span className="min-w-0 flex-1 truncate text-caption uppercase tracking-[0.08em] text-ink-3">{node?(node.unresolved?tr('未解析目标'):node.kind):''}</span>
   <button type="button" aria-label={tr('关闭')} onClick={onClose} className="grid h-6 w-6 place-items-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"><X size={12}/></button>
  </div>
  {error?<p role="alert" className="px-3 pb-3 text-caption">{error}</p>:!inspect||!node?<p role="status" className="px-3 pb-3 text-caption text-ink-3">{tr('正在读取权威关系…')}</p>:<>
   <div className="px-3 pb-2">
    <h3 className="font-display text-[18px] leading-snug tracking-tight">{node.title}</h3>
    {node.path&&<p className="mt-0.5 truncate text-caption text-ink-3" title={node.path}>{node.path}</p>}
    <div className="mt-2.5 flex flex-wrap items-center gap-1">
     {doc&&<Button size="xs" variant="outline" icon={BookOpen} data-xgc-role="knowledge-read" onClick={()=>previewDocument(doc)}>{zh?'阅读':'Read'}</Button>}
     {doc&&<Button size="xs" icon={MessageSquarePlus} data-xgc-role="knowledge-to-context" onClick={()=>links.addToChat(doc)}>{zh?'加入对话':'Add to chat'}</Button>}
     <span className="flex-1"/>
     <RightMore menu label={zh?'更多操作':'More actions'}>
      {doc&&<Button size="xs" icon={PanelRight} onClick={()=>openDocument(doc)}>{zh?'在对话旁打开':'Open beside chat'}</Button>}
      {doc&&<Button size="xs" icon={Link2} data-xgc-role="knowledge-to-card" onClick={()=>void links.linkToCard(doc)}>{zh?'链接到所选画布卡片':'Link to selected canvas card'}</Button>}
      <Button size="xs" icon={Network} onClick={()=>onLocal(node.id)}>{tr('查看局部图')}</Button>
     </RightMore>
    </div>
    {links.note&&<p role="status" className="mt-1.5 text-caption text-ink-3">{links.note}</p>}
    {node.unresolved&&<p className="mt-2 text-caption text-ink-3">{zh?'有笔记链接到这里，但这篇笔记还不存在。':'Notes link here, but this note does not exist yet.'}</p>}
   </div>
   <div className="min-h-0 flex-1 overflow-y-auto border-t border-line px-1 py-1.5">
    {([['出链',inspect.outgoing,'target'],['回链',inspect.incoming,'source']] as const).map(([label,edges,end])=><section key={label} className="pb-1.5">
     <p className="px-2 pb-0.5 pt-1 text-caption text-ink-3">{tr(label)} · {edges.length}</p>
     {edges.map(edge=>row(edge,end))}
    </section>)}
    {links.projectId&&node.path&&<div className="px-2"><CanvasBacklinks project={links.projectId} path={node.path}/></div>}
   </div>
  </>}
 </aside>
}

/** Notes this project already uses: attached to its chat context, or cited by its canvas cards (by knowledge path). */
function useProjectKnowledgeMarks(page:KnowledgePage|null):Map<string,GraphMark>{
 const {projectId,contextItems}=useWorkbench()
 const [cited,setCited]=useState<Set<string>>(new Set())
 useEffect(()=>{
  if(!projectId){setCited(new Set());return}
  let live=true,off=()=>{}
  try{
   const session=sharedContentSession({projectId,workspace:projectId})
   const read=()=>{if(live)setCited(new Set((session.snapshot().value?.objects??[]).flatMap(o=>o.sources.filter(s=>s.kind==='knowledge'&&s.path).map(s=>s.path!))))}
   off=session.subscribe(read)
   if(session.snapshot().status==='loading')void session.load().then(read).catch(()=>{});else read()
  }catch{/* The workspace is bound to another project; no canvas marks. */}
  return()=>{live=false;off()}
 },[projectId])
 return useMemo(()=>{
  const out=new Map<string,GraphMark>()
  if(!page||!projectId)return out
  const attached=new Set(contextItems.filter(i=>i.project===projectId&&i.ref.startsWith('academic/')).map(i=>i.ref.slice('academic/'.length)))
  for(const node of page.nodes){
   if(!node.path)continue
   const a=attached.has(node.path),c=cited.has(node.path)
   if(a||c)out.set(node.id,a&&c?'both':a?'context':'canvas')
  }
  return out
 },[page,projectId,contextItems,cited])
}
