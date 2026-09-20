import {useCallback,useEffect,useMemo,useState} from 'react'
import {t as tr} from '../../i18n'
import {useWorkbench} from '../../store'
import {GraphView} from '../../components/GraphView'
import type {GraphCamera} from '../../lib/graph-camera'
import {academicGraph,inspectKnowledgeResource,loadCompleteKnowledgeGraph,type KnowledgePage,type KnowledgeQuery} from './academic-graph'
import {invalidateKnowledgeAccess,knowledgeAccessLost,useAcademicNotes} from './useAcademicNotes'
import {clearKnowledgeView,emptyKnowledgeView,readKnowledgeView,saveKnowledgeView,type KnowledgeViewState} from './knowledge-view-state'
import {Reader} from './Reader'
import {trimKnowledgeQuery} from './knowledge-snapshot'

type Inspection = Awaited<ReturnType<typeof inspectKnowledgeResource>>

/* Domain view only. A continues to own shell/navigation; file opens use its existing navigator. */
type KnowledgePageProps = {onQuote?:(text:string)=>void;viewId?:string}
export function KnowledgePage(props:KnowledgePageProps){
 return <KnowledgeView key={props.viewId||'academic'} {...props}/>
}
function KnowledgeView({onQuote,viewId='academic'}:KnowledgePageProps){
 const {readingDocument,previewDocument,closeDocument}=useWorkbench()
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

 if(readingDocument&&!blocked)return <div className="flex h-full min-h-0 flex-col"><div className="flex h-9 shrink-0 items-center border-b border-line px-3"><button className="ui-btn" data-xgc-role="knowledge-back" onClick={closeDocument}>{tr('返回图谱')}</button></div><div className="min-h-0 flex-1"><Reader onQuote={onQuote}/></div></div>
 if(!graph||blocked)return <div className="ui-empty" role="status"><p>{tr(error||'正在读取学术仓库的完整知识与链接…')}</p><button className="ui-btn mt-3" onClick={refresh}>{tr('重新读取')}</button></div>
 return <div className="relative h-full min-h-0" data-xgc-role="knowledge-workspace">
  <GraphView data={graph} initialCamera={view.camera} onCameraChange={saveCamera} onSelect={id=>{const node=graph.nodes[id];if(node?.resourceId)setInspectId(node.resourceId)}}/>
  <div className="absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)] rounded-lg border border-line bg-panel/95 p-2">
   <input className="ui-input h-8 w-full" value={view.query} onChange={e=>setFilter('query',e.target.value)} placeholder={tr('检索标题、路径、标签与正文…')} aria-label={tr('检索知识库')}/>
   <div className="mt-2 flex flex-wrap items-center gap-2 text-caption">
    <label>{tr('未解析')} <select className="ui-input" aria-label={tr('未解析目标过滤')} value={view.unresolved} onChange={e=>setFilter('unresolved',e.target.value as KnowledgeViewState['unresolved'])}><option value="include">{tr('包含')}</option><option value="only">{tr('仅未解析')}</option><option value="exclude">{tr('隐藏')}</option></select></label>
    <label>{tr('孤立节点')} <select className="ui-input" aria-label={tr('孤立节点过滤')} value={view.orphans} onChange={e=>setFilter('orphans',e.target.value as KnowledgeViewState['orphans'])}><option value="include">{tr('包含')}</option><option value="only">{tr('仅孤立')}</option><option value="exclude">{tr('隐藏')}</option></select></label>
    <button onClick={()=>{setView(previous=>({...emptyKnowledgeView(),camera:previous.camera}));setProjected(null)}}>{tr('清除筛选')}</button>
    <button onClick={()=>{refresh();setRetry(n=>n+1)}}>{tr('刷新')}</button>
   </div>
   {view.focus&&<div className="mt-2 flex flex-wrap items-center gap-2 text-caption">
    <span>{tr('局部图')}</span><label>{tr('深度')} <input type="number" min="1" className="ui-input w-14" value={view.depth} onChange={e=>{const n=Number(e.target.value);if(Number.isSafeInteger(n)&&n>=1)setFilter('depth',n)}}/></label>
    <select className="ui-input" aria-label={tr('局部关系方向')} value={view.direction} onChange={e=>setFilter('direction',e.target.value as KnowledgeViewState['direction'])}><option value="both">{tr('双向')}</option><option value="outbound">{tr('出链')}</option><option value="inbound">{tr('回链')}</option></select>
    <button onClick={()=>setFilter('focus','')}>{tr('返回全局图')}</button>
   </div>}
   <div className="mt-2 text-caption text-ink-3" aria-live="polite">{tr('当前完整视图')} · {active!.counts.matched} {tr('节点')} / {active!.counts.matchedEdges} {tr('关系')}</div>
   <details className="mt-2 text-caption"><summary>{tr('通过列表检查节点')}</summary>
    <select size={6} className="ui-input mt-1 max-w-full" value={inspectId} aria-label={tr('检查知识节点')} onChange={e=>setInspectId(e.target.value)}>
     <option value="">{tr('选择节点')}</option>{active!.nodes.map(node=><option key={node.id} value={node.id}>{node.title} · {node.kind}</option>)}
    </select>
   </details>
  </div>
  {inspectId&&<aside className="absolute bottom-14 right-3 z-10 max-h-[55%] w-[min(360px,calc(100%-1.5rem))] overflow-auto rounded-lg border border-line bg-panel/95 p-3 text-caption" aria-label={tr('知识关系检查')}>
   <button className="float-right" onClick={()=>setInspectId('')}>{tr('关闭')}</button>
   {inspectError?<p role="alert">{inspectError}</p>:!inspect?<p role="status">{tr('正在读取权威关系…')}</p>:<>
    <h3 className="pr-10 font-semibold">{inspect.node.title}</h3><p className="mt-1 text-ink-3">{inspect.node.kind}</p>
    <div className="mt-2 flex gap-3"><button onClick={()=>setFilter('focus',inspect.node.id)}>{tr('查看局部图')}</button>{inspect.node.exists&&inspect.node.path&&<button onClick={()=>previewDocument({workspace:'academic',path:inspect.node.path!,title:inspect.node.title})}>{tr('阅读原文')}</button>}</div>
    {([['出链',inspect.outgoing,'target'],['回链',inspect.incoming,'source']] as const).map(([label,edges,endpoint])=><section key={label} className="mt-3"><h4 className="font-medium">{tr(label)} · {edges.length}</h4>{edges.length===0?<p>{tr('没有关系')}</p>:edges.map(edge=><div key={edge.id} className="mt-2 border-t border-line pt-2"><button className="break-all text-left underline" onClick={()=>setInspectId(edge[endpoint])}>{titles.get(edge[endpoint])||(endpoint==='target'?edge.targetHint:'')||edge[endpoint]}</button><p>{edge.kind} · {edge.resolved?tr('已解析'):tr('未解析')}</p>{edge.anchor&&<p className="break-all">{edge.anchor}</p>}<details><summary>{tr('来源版本')}</summary><code className="break-all">{edge.sourceRevision||tr('无可核验版本')}</code></details></div>)}</section>)}
   </>}
  </aside>}
  {status&&<div role="status" className="absolute bottom-3 left-3 right-3 z-10 rounded-lg border border-line bg-panel/95 px-3 py-2 text-caption"><span>{status}</span>{searchError&&<button className="ml-3 underline" onClick={()=>setRetry(n=>n+1)}>{tr('重试检索')}</button>}</div>}
 </div>
}
