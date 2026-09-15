import {t as tr} from '../i18n'
import {useEffect,useRef,useState} from 'react'
import {ArrowLeft,Search} from 'lucide-react'
import {useWorkbench} from '../store'
import {request} from '../lib/api'
import {Button,IconBtn} from './ui'
import {MarkdownView} from '../features/resources/Reader'
type DocRef={workspace:string;path:string;title:string}
/* 右栏「笔记」标签：速查学术笔记。列表态 = 搜索行 + 笔记列表；阅读态 = 返回/标题/引用 + MarkdownView。标签内自导航 */
export function DocumentPanel({doc,onQuote,onTitle}:{doc?:DocRef;onQuote:(text:string)=>void;onTitle?:(title:string)=>void}){
 const {knowledgeDocuments:notes}=useWorkbench()
 const [current,setCurrent]=useState<DocRef|null>(doc??null)
 const [query,setQuery]=useState(''),[document,setDocument]=useState<{content:string;digest:string}|null>(null),[error,setError]=useState('')
 useEffect(()=>{setDocument(null);setError('');if(!current)return;const c=new AbortController();request<{content:string;digest:string}>(`/workspaces/${encodeURIComponent(current.workspace)}/files/${current.path.split('/').map(encodeURIComponent).join('/')}`,{signal:c.signal}).then(d=>{if(!c.signal.aborted)setDocument(d)}).catch(e=>{if(!c.signal.aborted)setError(e.message)});return()=>c.abort()},[current])
 const titleRef=useRef(onTitle);titleRef.current=onTitle
 useEffect(()=>{titleRef.current?.(current?.title??tr('阅读'))},[current])
 if(!current)return <div className="flex min-h-0 flex-1 flex-col">
  <div className="flex h-9 shrink-0 items-center px-2"><div className="relative min-w-0 flex-1"><Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3"/><input aria-label={tr("搜索学术笔记")} placeholder={tr("查找论文与知识…")} className="ui-input h-7 w-full rounded-full pl-7" value={query} onChange={e=>setQuery(e.target.value)}/></div></div>
  <div className="min-h-0 flex-1 overflow-auto p-2">{notes.filter(n=>(n.title+' '+n.path).toLowerCase().includes(query.toLowerCase())).map(n=><button key={n.path} className="ui-list-row" onClick={()=>setCurrent({workspace:'academic',path:n.path,title:n.title})}>{n.title}</button>)}</div>
 </div>
 return <div className="flex min-h-0 flex-1 flex-col">
  <div className="flex h-9 shrink-0 items-center gap-1 px-2"><IconBtn icon={ArrowLeft} label={tr("返回文档列表")} onClick={()=>setCurrent(null)}/><span className="min-w-0 flex-1 truncate pl-1 text-caption text-ink-2" title={current.title}>{current.title}</span><Button disabled={!document} onClick={()=>onQuote(`文件：${current.workspace}/${current.path}\n版本：${document?.digest}\n\n${document?.content}`)}>{tr("引用到 Chat")}</Button></div>
  {error&&<p role="alert" className="ui-error">{error}</p>}
  <article className="min-h-0 flex-1 overflow-auto px-5 py-4"><div className="research-document break-words text-secondary leading-relaxed">{document?<MarkdownView content={document.content}/>:!error&&<p className="text-ink-3">{tr("正在读取…")}</p>}</div></article>
 </div>
}
