import {RightPanelActions} from './RightPanelActions'
import {t as tr} from '../i18n'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {useEffect,useState} from 'react'
import {ArrowLeft} from 'lucide-react'
import {useWorkbench} from '../store'
import {request} from '../lib/api'
import {Button,IconBtn} from './ui'
export function DocumentPanel({onQuote}:{onQuote:(text:string)=>void}){
 const {readingDocument:current,knowledgeDocuments:notes,openDocument}=useWorkbench()
 const [listing,setListing]=useState(!current),[query,setQuery]=useState(''),[document,setDocument]=useState<{content:string;digest:string}|null>(null),[error,setError]=useState('')
 useEffect(()=>{setListing(!current);setDocument(null);setError('');if(!current)return;const c=new AbortController();request<{content:string;digest:string}>(`/workspaces/${encodeURIComponent(current.workspace)}/files/${current.path.split('/').map(encodeURIComponent).join('/')}`,{signal:c.signal}).then(d=>{if(!c.signal.aborted)setDocument(d)}).catch(e=>{if(!c.signal.aborted)setError(e.message)});return()=>c.abort()},[current])
 if(listing||!current)return <div className="flex min-h-0 flex-1 flex-col"><RightPanelActions><input aria-label={tr("搜索学术笔记")} placeholder={tr("查找论文与知识…")} className="ui-input min-w-0" value={query} onChange={e=>setQuery(e.target.value)}/></RightPanelActions><div className="min-h-0 flex-1 overflow-auto p-2">{notes.filter(n=>(n.title+' '+n.path).toLowerCase().includes(query.toLowerCase())).map(n=><button key={n.path} className="ui-list-row" onClick={()=>{openDocument({workspace:'academic',path:n.path,title:n.title});setListing(false)}}>{n.title}</button>)}</div></div>
 return <div className="flex min-h-0 flex-1 flex-col"><RightPanelActions><IconBtn icon={ArrowLeft} label={tr("返回文档列表")} onClick={()=>setListing(true)}/><span className="min-w-0 flex-1 truncate text-caption" title={current.title}>{current.title}</span></RightPanelActions>{error&&<p role="alert" className="ui-error">{error}</p>}<article className="min-h-0 flex-1 overflow-auto p-4"><Button disabled={!document} onClick={()=>onQuote(`文件：${current.workspace}/${current.path}\n版本：${document?.digest}\n\n${document?.content}`)}>{tr("引用到 Chat")}</Button><div className="research-document mt-4 break-words text-secondary leading-relaxed"><ReactMarkdown remarkPlugins={[remarkGfm]}>{document?.content||(!error?tr("正在读取…"):'')}</ReactMarkdown></div></article></div>
}
