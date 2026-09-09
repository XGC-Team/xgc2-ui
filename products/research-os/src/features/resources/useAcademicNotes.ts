import {useEffect,useState} from 'react'
import {useWorkbench} from '../../store'
import {loadAcademicNotes,type AcademicNote} from './academic-graph'
export function useAcademicNotes(){
 const {knowledgeScope:scope,setKnowledgeScope:setScope,setKnowledgeDocuments}=useWorkbench()
 const [notes,setNotes]=useState<AcademicNote[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{
  const c=new AbortController();setLoading(true);setError('')
  loadAcademicNotes(c.signal,scope).then(data=>{if(!c.signal.aborted){setNotes(data);setKnowledgeDocuments(data)}}).catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setLoading(false)})
  return()=>c.abort()
 },[scope,revision,setKnowledgeDocuments])
 useEffect(()=>{const refresh=()=>setRevision(n=>n+1);window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh)},[])
 return {notes,loading,error,scope,setScope,refresh:()=>setRevision(n=>n+1)}
}
