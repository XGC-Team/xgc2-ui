import {RightPanelActions,RightMore} from '../../components/RightPanelActions'
import {t as tr} from '../../i18n'
import {useWorkbench} from '../../store'
import {compilePDF,latestPDF} from './manuscript'
import {useEffect,useState} from 'react'
import {ArrowLeft,FileText,Folder} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {request} from '../../lib/api'
import {Button,IconBtn} from '../../components/ui'
import {isProjectMaterial,isTextMaterial,type ProjectEntry} from './project-files'
export function FilesPage({onQuote}:{onQuote:(text:string)=>void}){
 const {openPDF,projectId:workspace}=useWorkbench()
 const [directory,setDirectory]=useState(''),[entries,setEntries]=useState<ProjectEntry[]>([])
 const [path,setPath]=useState(''),[document,setDocument]=useState<{content:string;digest:string}|null>(null)
 const [error,setError]=useState(''),[loading,setLoading]=useState(false),[compiling,setCompiling]=useState(false),[revision,setRevision]=useState(0)
 useEffect(()=>{const refresh=()=>setRevision(n=>n+1);window.addEventListener('focus',refresh);const timer=setInterval(refresh,30000);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}},[])
 useEffect(()=>{
  const c=new AbortController();setError('');if(!workspace){setEntries([]);return}
  setLoading(true)
  void (async()=>{
   const all:ProjectEntry[]=[];let cursor='';const seen=new Set<string>()
   do{
    const query=new URLSearchParams({directory,limit:'200',...(cursor?{cursor}:{})})
    const r=await fetch(`/api/v1/workspaces/${encodeURIComponent(workspace)}/files?${query}`,{signal:c.signal}),b=await r.json()
    if(!r.ok)throw Error(b.error?.message||r.statusText)
    if(!Array.isArray(b.data)||b.meta?.directory!==directory)throw Error(tr('目录未能读取'))
    all.push(...b.data.filter(isProjectMaterial));cursor=b.meta?.nextCursor||''
    if(cursor&&seen.has(cursor))throw Error(tr('目录未能读取'));seen.add(cursor)
   }while(cursor&&!c.signal.aborted)
   if(!c.signal.aborted)setEntries(all.sort((a,b)=>Number(a.kind==='file')-Number(b.kind==='file')||a.path.localeCompare(b.path)))
  })().catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setLoading(false)})
  return()=>c.abort()
 },[workspace,directory,revision])
 useEffect(()=>{
  setDocument(null);setError('');if(!workspace||!path||!isTextMaterial(path))return
  const c=new AbortController()
  request<{content:string;digest:string}>(`/workspaces/${encodeURIComponent(workspace)}/files/${path.split('/').map(encodeURIComponent).join('/')}`,{signal:c.signal}).then(d=>{if(!c.signal.aborted)setDocument(d)}).catch(e=>{if(!c.signal.aborted)setError(e.message)})
  return()=>c.abort()
 },[workspace,path,revision])
 return <div className="flex h-full min-h-0 flex-col bg-panel"><RightPanelActions>{(directory||path)&&<IconBtn icon={ArrowLeft} label={tr(path?'返回文件列表':'上级目录')} onClick={()=>{if(path)setPath('');else{setEntries([]);setDirectory(directory.split('/').slice(0,-1).join('/'))}}}/>}<span className="min-w-0 flex-1 truncate text-caption text-ink-2" title={`${workspace}/${path||directory}`}>{path.split('/').pop()||directory.split('/').pop()||workspace}</span>{document&&path.endsWith('.tex')&&<Button loading={compiling} disabled={compiling} onClick={()=>{setCompiling(true);setError('');void compilePDF(workspace,path,document.digest).then(openPDF).catch(e=>setError(e.message)).finally(()=>setCompiling(false))}}>{tr('编译 PDF')}</Button>}{document&&path&&<RightMore label={tr('文件操作')}>{path.endsWith('.tex')&&<><Button onClick={()=>void latestPDF(workspace,path).then(pdf=>{if(pdf)openPDF(pdf);else setError(tr('此稿件还没有已编译的 PDF。'))}).catch(e=>setError(e.message))}>{tr('查看 PDF')}</Button></>}<Button onClick={()=>onQuote(`文件：${workspace}/${path}\n版本：${document.digest}\n\n${document.content}`)}>{tr('引用到 Chat')}</Button></RightMore>}</RightPanelActions>
  {!workspace?<p className="p-4 text-secondary text-ink-3">{tr('选择项目查看文件。')}</p>:<>

   {error&&<p role="alert" className="ui-error">{error}</p>}
   <div className="min-h-0 flex-1 overflow-auto p-3">{!path?<>{entries.map(entry=><button key={entry.path} className="ui-list-row" onClick={()=>{if(entry.kind==='directory'){setEntries([]);setDirectory(entry.path)}else setPath(entry.path)}}>{entry.kind==='directory'?<Folder size={14} className="shrink-0 text-ink-3"/>:<FileText size={14} className="shrink-0 text-ink-3"/>}<span className="truncate">{entry.path.split('/').pop()}</span></button>)}{loading&&!entries.length?<p className="p-3 text-ink-3">{tr('正在读取…')}</p>:!entries.length&&<p className="p-3 text-ink-3">{tr('此目录没有研究资料。')}</p>}</>:!isTextMaterial(path)?<div className="space-y-2 text-secondary"><h2 className="break-words font-semibold">{path.split('/').pop()}</h2><p className="text-ink-3">{tr('此附件暂不支持预览。')}</p><p className="text-caption text-ink-3">{Math.ceil((entries.find(e=>e.path===path)?.sizeBytes||0)/1024)} KB</p></div>:document?<>

    {/\.mdx?$/i.test(path)?<article className="research-document break-words text-secondary leading-relaxed"><ReactMarkdown remarkPlugins={[remarkGfm]}>{document.content}</ReactMarkdown></article>:<pre className="whitespace-pre-wrap break-words font-mono text-secondary leading-relaxed">{document.content}</pre>}
   </>:!error&&<p className="text-ink-3">{tr('正在读取…')}</p>}</div>
  </>}
 </div>
}
