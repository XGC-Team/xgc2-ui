import {useEffect,useState} from 'react'
import {useWorkbench} from '../../store'
import {APIError} from '../../lib/api'
import {loadCompleteKnowledgeGraph,notesFromPage,type AcademicNote,type KnowledgePage} from './academic-graph'
/* Only verified complete snapshots replace the file tree. Authorization loss clears it. */
export function useAcademicNotes(){
 const {setKnowledgeDocuments}=useWorkbench()
 const [notes,setNotes]=useState<AcademicNote[]>([])
 const [page,setPage]=useState<KnowledgePage|null>(null)
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{
  const c=new AbortController();setLoading(true);setError('')
  loadCompleteKnowledgeGraph({scope:'knowledge'},c.signal).then(data=>{
   if(c.signal.aborted)return
   const next=notesFromPage(data)
   setPage(data);setNotes(next);setKnowledgeDocuments(next)
  }).catch(e=>{
   if(c.signal.aborted)return
   if(e instanceof APIError&&[401,403,404].includes(e.status)){
    setPage(null);setNotes([]);setKnowledgeDocuments([])
   }
   setError(e instanceof Error?e.message:'知识库读取失败。')
  }).finally(()=>{if(!c.signal.aborted)setLoading(false)})
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
