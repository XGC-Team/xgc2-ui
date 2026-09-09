import {useMemo,useState} from 'react'
import {ChevronRight,FileText,Folder} from 'lucide-react'
import {t as tr} from '../../i18n'
import {PageActions} from '../../components/PageActions'
import {useWorkbench} from '../../store'
import {useAcademicNotes} from './useAcademicNotes'
import type {AcademicNote} from './academic-graph'
type Branch={name:string;path:string;children:Map<string,Branch>;note?:AcademicNote}
export function KnowledgePage(){
 const {notes,loading,error,scope,setScope}=useAcademicNotes()
 const {openDocument,readingDocument}=useWorkbench()
 const [query,setQuery]=useState(''),[collapsed,setCollapsed]=useState<Record<string,boolean>>({})
 const tree=useMemo(()=>{
  const root:Branch={name:'',path:'',children:new Map()}
  for(const note of notes.filter(n=>(n.path+' '+n.title).toLowerCase().includes(query.trim().toLowerCase()))){
   const parts=note.path.replace(/^memory\//,'').split('/');let branch=root
   parts.forEach((name,index)=>{const path=parts.slice(0,index+1).join('/');if(!branch.children.has(name))branch.children.set(name,{name,path,children:new Map()});branch=branch.children.get(name)!;if(index===parts.length-1)branch.note=note})
  }
  return root
 },[notes,query])
 function children(branch:Branch,depth=0){return [...branch.children.values()].sort((a,b)=>Number(!!a.note)-Number(!!b.note)||a.name.localeCompare(b.name)).map(b=>{
  const expanded=!!query||!collapsed[b.path]
  return <div key={b.path} role="treeitem" aria-label={b.name} aria-expanded={b.note?undefined:expanded} aria-selected={b.note?readingDocument?.path===b.note.path:undefined}>
   <button className={`ui-list-row ${b.note&&readingDocument?.path===b.note.path?'bg-active':''}`} style={{paddingLeft:12+depth*18}} onClick={()=>b.note?openDocument({workspace:'academic',path:b.note.path,title:b.note.title}):setCollapsed(s=>({...s,[b.path]:!s[b.path]}))}>
    {b.note?<FileText size={14} className="shrink-0 text-ink-3"/>:<><ChevronRight size={12} className={`shrink-0 text-ink-3 ${expanded?'rotate-90':''}`}/><Folder size={14} className="shrink-0 text-ink-3"/></>}
    <span className="truncate">{b.name}</span>{b.note&&b.note.title!==b.name.replace(/\.md$/i,'')&&<span className="ml-auto truncate text-caption text-ink-3">{b.note.title}</span>}
   </button>{!b.note&&expanded&&<div role="group">{children(b,depth+1)}</div>}
  </div>
 })}
 return <div className="flex h-full min-h-0 flex-col bg-panel"><PageActions page="knowledge"><input aria-label={tr('查找文档…')} placeholder={tr('查找文档…')} className="ui-input !w-44" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label={tr('文档范围')} className="rounded border border-line bg-panel px-2 py-1 text-caption" value={scope} onChange={e=>setScope(e.target.value)}><option value="knowledge">{tr('知识库')}</option><option value="all">{tr('全部文档')}</option></select><span className="text-caption text-ink-3">{notes.length} {tr('篇文档')}</span></PageActions>
  {error&&<p role="alert" className="ui-error">{error}</p>}
  <div className="min-h-0 flex-1 overflow-auto p-2" role="tree" aria-label={tr('知识库文件')}>{loading?<p className="p-3 text-ink-3">{tr('正在读取…')}</p>:tree.children.size?children(tree):<p className="p-3 text-ink-3">{tr('没有匹配的文档。')}</p>}</div>
 </div>
}
