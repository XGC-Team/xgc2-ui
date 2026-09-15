import {useEffect,useState} from 'react'
import {useWorkbench} from '../../store'
import {loadAcademicNotes,type AcademicNote} from './academic-graph'
/* 学术笔记数据源：默认知识库范围（范围切换已按用户决策移除），窗口聚焦时刷新。 */
export function useAcademicNotes(){
 const {setKnowledgeDocuments}=useWorkbench()
 const [notes,setNotes]=useState<AcademicNote[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{
  const c=new AbortController();setLoading(true);setError('')
  loadAcademicNotes(c.signal).then(data=>{if(!c.signal.aborted){setNotes(data);setKnowledgeDocuments(data)}}).catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setLoading(false)})
  return()=>c.abort()
 },[revision,setKnowledgeDocuments])
 useEffect(()=>{const refresh=()=>setRevision(n=>n+1);window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh)},[])
 return {notes,loading,error,refresh:()=>setRevision(n=>n+1)}
}
