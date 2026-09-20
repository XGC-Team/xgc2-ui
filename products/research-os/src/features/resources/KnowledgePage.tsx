import {useEffect,useMemo,useState} from 'react'
import {t as tr} from '../../i18n'
import {useWorkbench} from '../../store'
import {GraphView} from '../../components/GraphView'
import {academicGraph,loadCompleteKnowledgeGraph,type KnowledgePage} from './academic-graph'
import {useAcademicNotes} from './useAcademicNotes'
import {Reader} from './Reader'
/* 知识库主区：图谱是未选中文件时的首页；文件树选中文档后进入阅读面。 */
export function KnowledgePage({onQuote}:{onQuote?:(text:string)=>void}){
 const {readingDocument,previewDocument}=useWorkbench()
 const {notes,page,loading,error}=useAcademicNotes()
 const [query,setQuery]=useState('')
 const [projected,setProjected]=useState<KnowledgePage|null>(null)
 const [searchError,setSearchError]=useState('')
 useEffect(()=>{
  const q=query.trim()
  if(!q||!page?.snapshot){setProjected(null);setSearchError('');return}
  const c=new AbortController()
  loadCompleteKnowledgeGraph({query:q,snapshot:page.snapshot},c.signal).then(data=>{if(!c.signal.aborted){setProjected(data);setSearchError(data.complete?'':'当前查询结果不完整。')}}).catch(e=>{if(!c.signal.aborted)setSearchError(e.message)})
  return()=>c.abort()
 },[query,page?.snapshot])
 const active=projected??page
 const graph=useMemo(()=>active?academicGraph(active):academicGraph({schemaVersion:'research.knowledge-graph/v1',snapshot:'',scope:'knowledge',complete:false,counts:{nodes:0,edges:0,unresolved:0,orphans:0,matched:0},nodes:[],edges:[]}),[active])
 if(readingDocument)return <Reader onQuote={onQuote}/>
 if(loading&&!notes.length)return <div className="ui-empty">{tr("正在读取学术仓库的知识与链接…")}</div>
 if(error&&!notes.length)return <div className="ui-empty">{tr(error || "知识库未能加载，请刷新重试。")}</div>
 return <div className="relative h-full min-h-0">
  <input className="ui-input pointer-events-auto absolute left-3 top-3 z-10 h-8 w-[min(320px,calc(100%-1.5rem))]" value={query} onChange={e=>setQuery(e.target.value)} placeholder={tr('检索标题、路径、标签与正文…')} aria-label={tr('检索知识库')}/>
  {(!active?.complete||searchError)&&<p role="status" className="pointer-events-none absolute bottom-3 left-3 right-3 z-10 rounded-lg border border-line bg-panel/95 px-3 py-2 text-caption text-ink-2">{searchError||tr('图谱尚未完整加载，当前显示不是全库。')}</p>}
  <GraphView data={graph} onSelect={id=>{const node=graph.nodes[id];if(node?.path)previewDocument({workspace:'academic',path:node.path,title:node.label})}}/>
 </div>
}
