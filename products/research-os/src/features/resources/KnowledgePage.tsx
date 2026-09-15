import {useMemo} from 'react'
import {t as tr} from '../../i18n'
import {useWorkbench} from '../../store'
import {GraphView} from '../../components/GraphView'
import {academicGraph} from './academic-graph'
import {useAcademicNotes} from './useAcademicNotes'
import {Reader} from './Reader'
/* 知识库主区：图谱是未选中文件时的首页；文件树选中文档后进入阅读面。 */
export function KnowledgePage({onQuote}:{onQuote?:(text:string)=>void}){
 const {readingDocument,previewDocument}=useWorkbench()
 const {notes,loading,error}=useAcademicNotes()
 const graph=useMemo(()=>academicGraph(notes),[notes])
 if(readingDocument)return <Reader onQuote={onQuote}/>
 if(loading&&!notes.length)return <div className="ui-empty">{tr("正在读取学术仓库的知识与链接…")}</div>
 if(error&&!notes.length)return <div className="ui-empty">{tr("知识库未能加载，请刷新重试。")}</div>
 return <div className="relative h-full min-h-0"><GraphView data={graph} onSelect={id=>{const note=notes[id];if(note)previewDocument({workspace:'academic',path:note.path,title:note.title})}}/></div>
}
