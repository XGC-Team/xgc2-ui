import {useEffect,useMemo,useState} from 'react'
import {t as tr} from '../../i18n'
import {useWorkbench} from '../../store'
import {GraphView} from '../../components/GraphView'
import {academicGraph,loadCompleteKnowledgeGraph,type KnowledgePage as Snapshot} from './academic-graph'
import {useAcademicNotes} from './useAcademicNotes'
import {Reader} from './Reader'

export function KnowledgePage({onQuote}:{onQuote?:(text:string)=>void}){
 const {readingDocument,previewDocument,closeDocument}=useWorkbench()
 const {page,loading,error,refresh}=useAcademicNotes()
 const [query,setQuery]=useState(''),[focus,setFocus]=useState(''),[depth,setDepth]=useState('1')
 const [projected,setProjected]=useState<Snapshot|null>(null)
 const [searchError,setSearchError]=useState(''),[searching,setSearching]=useState(false)
 useEffect(()=>{
  const q=query.trim()
  if(!page?.snapshot||(!q&&!focus)){setProjected(null);setSearchError('');setSearching(false);return}
  const hops=Number(depth)
  if(focus&&(!Number.isSafeInteger(hops)||hops<1)){setSearchError('关系深度须为正整数。');setSearching(false);return}
  const c=new AbortController();setSearching(true);setSearchError('')
  const timer=setTimeout(()=>{
   loadCompleteKnowledgeGraph({query:q,focus:focus||undefined,depth:focus?hops:undefined,snapshot:page.snapshot},c.signal)
    .then(data=>{if(!c.signal.aborted)setProjected(data)})
    .catch(e=>{if(!c.signal.aborted)setSearchError(e instanceof Error?e.message:'查询失败。')})
    .finally(()=>{if(!c.signal.aborted)setSearching(false)})
  },200)
  return()=>{clearTimeout(timer);c.abort()}
 },[query,focus,depth,page?.snapshot])
 const active=page?(projected??page):null
 const graph=useMemo(()=>active?academicGraph(active):null,[active])
 if(readingDocument)return <div className="flex h-full min-h-0 flex-col">
  <div className="flex shrink-0 gap-2 border-b border-line p-2">
   <button className="ui-btn" data-xgc-role="knowledge-back" onClick={closeDocument}>{tr('返回图谱')}</button>
   {readingDocument.workspace==='academic'&&<button className="ui-btn" data-xgc-role="knowledge-local" onClick={()=>{setFocus(readingDocument.path);closeDocument()}}>{tr('查看局部关系')}</button>}
  </div><div className="min-h-0 flex-1"><Reader onQuote={onQuote}/></div>
 </div>
 if(!graph)return <div className="ui-empty" role="status">
  {tr(loading?'正在读取并校验知识库…':error||'知识库未能加载。')}
  {!loading&&<button className="ui-btn" onClick={refresh}>{tr('重试')}</button>}
 </div>
 const status=error?`${error}（保留上次完整快照）`:searchError?`${searchError}（保留上次有效视图）`:
  searching?tr('正在更新查询，仍显示上次有效视图…'):loading?tr('正在刷新知识库…'):
  active?.focus?tr('局部关系视图'):active?.query?tr('查询结果视图'):tr('知识库全图')
 return <div className="flex h-full min-h-0 flex-col" data-xgc-role="knowledge-workspace">
  <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line p-2">
   <input className="ui-input min-w-0 flex-1" value={query} onChange={e=>setQuery(e.target.value)} placeholder={tr('检索标题、路径、标签与正文…')} aria-label={tr('检索知识库')}/>
   {focus&&<label className="flex items-center gap-1 text-caption">{tr('关系深度')}<input className="ui-input w-16" type="number" min="1" step="1" value={depth} onChange={e=>setDepth(e.target.value)}/></label>}
   {(focus||query)&&<button className="ui-btn" data-xgc-role="knowledge-global" onClick={()=>{setQuery('');setFocus('')}}>{tr('全图')}</button>}
   <button className="ui-btn" data-xgc-role="knowledge-refresh" onClick={refresh} disabled={loading}>{tr('刷新')}</button>
  </div>
  <div className="relative min-h-0 flex-1"><GraphView data={graph} onSelect={id=>{const node=graph.nodes[id];if(node?.path)previewDocument({workspace:'academic',path:node.path,title:node.label})}}/></div>
  <p role="status" className="m-0 min-h-8 shrink-0 border-t border-line px-3 py-2 text-caption text-ink-2">{status}</p>
 </div>
}
