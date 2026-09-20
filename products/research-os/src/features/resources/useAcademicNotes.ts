import {useEffect,useState} from 'react'
import {useWorkbench} from '../../store'
import {loadCompleteKnowledgeGraph,notesFromPage,type AcademicNote,type KnowledgePage} from './academic-graph'
/* 学术笔记数据源：默认知识库范围，窗口聚焦或知识落库后刷新。不完整快照不得填文件树。 */
export function useAcademicNotes(){
 const {setKnowledgeDocuments}=useWorkbench()
 const [notes,setNotes]=useState<AcademicNote[]>([])
 const [page,setPage]=useState<KnowledgePage|null>(null)
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{
  const c=new AbortController();setLoading(true);setError('')
  loadCompleteKnowledgeGraph({scope:'knowledge'},c.signal).then(data=>{
   if(c.signal.aborted)return
   setPage(data)
   if(!data.complete){
    setNotes([]);setKnowledgeDocuments([])
    setError('知识图谱不完整，未用局部结果代替全库。')
    return
   }
   const next=notesFromPage(data)
   setNotes(next);setKnowledgeDocuments(next)
  }).catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setLoading(false)})
  return()=>c.abort()
 },[revision,setKnowledgeDocuments])
 useEffect(()=>{
  const refresh=()=>setRevision(n=>n+1)
  window.addEventListener('focus',refresh)
  window.addEventListener('research:knowledge-changed',refresh)
  return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('research:knowledge-changed',refresh)}
 },[])
 return {notes,page,loading,error,refresh:()=>setRevision(n=>n+1)}
}
