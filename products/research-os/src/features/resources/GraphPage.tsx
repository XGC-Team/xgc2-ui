import {PageActions} from '../../components/PageActions'
import {t as tr} from '../../i18n'
import { useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button, IconBtn } from '../../components/ui'
import { useWorkbench } from '../../store'
import { GraphView } from '../../components/GraphView'
import { academicGraph } from './academic-graph'
import {useAcademicNotes} from './useAcademicNotes'
export function GraphPage() {
  const {openDocument,setRightTab,setRightOpen}=useWorkbench()
  const {notes,loading,error,scope,setScope,refresh}=useAcademicNotes()
  const graph=useMemo(()=>academicGraph(notes),[notes])
  return <div className="flex h-full min-h-0 flex-col bg-panel"><PageActions page="graph"><select aria-label={tr("图谱文档范围")} className="rounded border border-line bg-panel px-2 py-1 text-caption" value={scope} onChange={e=>setScope(e.target.value)}><option value="knowledge">{tr("知识库")}</option><option value="all">{tr("全部文档")}</option></select><Button onClick={()=>{setRightTab('reading');setRightOpen(true)}}>{tr("文档")}</Button><span className="text-caption text-ink-3">{notes.length} {tr('篇文档')} · {graph.edges.length} {tr('链接')}</span><IconBtn icon={RefreshCw} label={tr("刷新图谱")} onClick={refresh}/></PageActions>
    {error&&<p role="alert" className="ui-error">{error}</p>}
    {loading?<div className="ui-empty">{tr("正在读取学术仓库的知识与链接…")}</div>:!notes.length?<div className="ui-empty">{error?'知识库未能加载，请刷新重试。':'学术仓库的知识目录中没有 Markdown 笔记。'}</div>:<div className="flex min-h-0 flex-1">
      <div className="relative min-w-0 flex-1"><GraphView key={scope} data={graph} onSelect={id=>{const note=notes[id];openDocument({workspace:'academic',path:note.path,title:note.title})}}/></div>

    </div>}
  </div>
}
