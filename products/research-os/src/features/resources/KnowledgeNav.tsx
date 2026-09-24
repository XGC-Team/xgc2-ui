import {useMemo,useState} from 'react'
import {ChevronRight,FileText,Folder} from 'lucide-react'
import {t as tr} from '../../i18n'
import {useWorkbench} from '../../store'
import type {AcademicNote} from './academic-graph'
type Branch={name:string;path:string;children:Map<string,Branch>;note?:AcademicNote;count:number}
/* 知识库二级面板：常驻文件树。未选中文档时主区是图谱首页；再点一次当前文档回到图谱。
   搜索唯一起在顶栏全局搜索（CommandPalette 含笔记），这里不维护本地搜索。 */
export function KnowledgeNav(){
 const {knowledgeDocuments:notes,readingDocument,previewDocument,closeDocument}=useWorkbench()
 const [collapsed,setCollapsed]=useState<Record<string,boolean>>({})
 const tree=useMemo(()=>{
  const root:Branch={name:'',path:'',children:new Map(),count:0}
  for(const note of notes){
   const parts=note.path.replace(/^memory\//,'').split('/');let branch=root
   root.count++;parts.forEach((name,index)=>{const path=parts.slice(0,index+1).join('/');if(!branch.children.has(name))branch.children.set(name,{name,path,children:new Map(),count:0});branch=branch.children.get(name)!;if(index===parts.length-1)branch.note=note;else branch.count++})
  }
  return root
 },[notes])
 const open=(note:AcademicNote)=>{if(readingDocument?.path===note.path)closeDocument();else previewDocument({workspace:'academic',path:note.path,title:note.title})}
 function children(branch:Branch,depth=0){return [...branch.children.values()].sort((a,b)=>Number(!!a.note)-Number(!!b.note)||a.name.localeCompare(b.name)).map(b=>{
  const expanded=!!collapsed[b.path]
  return <div key={b.path} role="treeitem" aria-label={b.name} aria-expanded={b.note?undefined:expanded} aria-selected={b.note?readingDocument?.path===b.note.path:undefined}>
   <button className={`ui-list-row ${b.note&&readingDocument?.path===b.note.path?'bg-active':''}`} style={{paddingLeft:8+depth*16}} onClick={()=>b.note?open(b.note):setCollapsed(s=>({...s,[b.path]:!s[b.path]}))}>
    {b.note?<FileText size={14} strokeWidth={1.75} className="shrink-0 text-ink-3"/>:<><ChevronRight size={12} strokeWidth={1.75} className={`shrink-0 text-ink-3 transition-transform duration-200 ${expanded?'rotate-90':''}`}/><Folder size={14} strokeWidth={1.75} className="shrink-0 text-ink-3"/></>}
    <span className="truncate">{b.name}</span>{b.note&&b.note.title!==b.name.replace(/\.md$/i,'')&&<span className="ml-auto truncate text-caption text-ink-3">{b.note.title}</span>}{!b.note&&<span className="ml-auto shrink-0 text-caption tabular-nums text-ink-3">{b.count}</span>}
   </button>{!b.note&&expanded&&<div role="group">{children(b,depth+1)}</div>}
  </div>
 })}
 return <div className="pt-1" role="tree" aria-label={tr('知识库文件')}>{tree.children.size?children(tree):<p className="px-2 py-2 text-caption text-ink-3">{tr('知识库还没有文档。')}</p>}</div>
}
