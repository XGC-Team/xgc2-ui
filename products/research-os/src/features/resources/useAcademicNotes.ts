import {useEffect,useRef,useState} from 'react'
import {useWorkbench} from '../../store'
import {APIError} from '../../lib/api'
import {loadCompleteKnowledgeGraph,notesFromPage,type AcademicNote,type KnowledgePage} from './academic-graph'

const accessLostEvent = 'research:knowledge-access-lost'
export function invalidateKnowledgeAccess() { window.dispatchEvent(new Event(accessLostEvent)) }
export function knowledgeAccessLost(error: unknown): error is APIError { return error instanceof APIError && [401,403,404].includes(error.status) }

export function useAcademicNotes(){
 const {setKnowledgeDocuments}=useWorkbench()
 const [notes,setNotes]=useState<AcademicNote[]>([])
 const [page,setPage]=useState<KnowledgePage|null>(null)
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [revision,setRevision]=useState(0)
 const current=useRef<AbortController|null>(null)
 const pageRef=useRef<KnowledgePage|null>(null)
 useEffect(()=>{
  const c=new AbortController();current.current=c
  setLoading(true);setError('')
  loadCompleteKnowledgeGraph({scope:'knowledge'},c.signal).then(data=>{
   if(c.signal.aborted)return
   // Same snapshot = same library: keep object identity so the graph neither rebuilds nor re-lays out on window focus.
   if(pageRef.current&&pageRef.current.snapshot===data.snapshot)return
   pageRef.current=data
   const documents=notesFromPage(data)
   setPage(data);setNotes(documents);setKnowledgeDocuments(documents)
  }).catch(e=>{
   if(c.signal.aborted)return
   if(knowledgeAccessLost(e)){invalidateKnowledgeAccess();return}
   setError(e instanceof Error?e.message:'知识库未能加载。')
  }).finally(()=>{if(!c.signal.aborted)setLoading(false)})
  return()=>c.abort()
 },[revision,setKnowledgeDocuments])
 useEffect(()=>{
  const refresh=()=>setRevision(n=>n+1)
  // Returning to the window re-checks the library at most once a minute: a full snapshot is megabytes to parse and
  // validate. Writes made inside the app announce themselves (research:knowledge-changed) and refresh immediately.
  let lastFocus=Date.now()
  const onFocus=()=>{if(Date.now()-lastFocus<60_000)return;lastFocus=Date.now();refresh()}
  const clear=()=>{
   current.current?.abort();pageRef.current=null;setPage(null);setNotes([]);setKnowledgeDocuments([])
   setLoading(false);setError('知识库当前不可访问，已清除先前视图。')
  }
  window.addEventListener('focus',onFocus)
  window.addEventListener('research:knowledge-changed',refresh)
  window.addEventListener(accessLostEvent,clear)
  return()=>{window.removeEventListener('focus',onFocus);window.removeEventListener('research:knowledge-changed',refresh);window.removeEventListener(accessLostEvent,clear)}
 },[setKnowledgeDocuments])
 return {notes,page,loading,error,refresh:()=>setRevision(n=>n+1)}
}
