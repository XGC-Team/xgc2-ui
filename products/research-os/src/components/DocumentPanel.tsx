import {t as tr} from '../i18n'
import {useEffect,useRef,useState} from 'react'
import {ArrowLeft,Search} from 'lucide-react'
import {useWorkbench} from '../store'
import {request} from '../lib/api'
import {Button,IconBtn} from './ui'
import {MarkdownView} from '../features/resources/Reader'
import {ReadingBridge} from '../features/projects/ReadingBridge'
type DocRef={workspace:string;path:string;title:string}
export function DocumentPanel({doc,onQuote,onTitle,active=true}:{doc?:DocRef;active?:boolean;onQuote:(text:string)=>void;onTitle?:(title:string)=>void}){
 const {knowledgeDocuments:notes,openRightTab}=useWorkbench()
 const [current]=useState<DocRef|null>(doc??null)
 const [query,setQuery]=useState(''),[document,setDocument]=useState<{content:string;digest:string}|null>(null),[error,setError]=useState('')
 useEffect(()=>{setDocument(null);setError('');if(!current)return;const c=new AbortController();request<{content:string;digest:string}>(`/workspaces/${encodeURIComponent(current.workspace)}/files/${current.path.split('/').map(encodeURIComponent).join('/')}`,{signal:c.signal}).then(d=>{if(typeof d?.content!=='string'||typeof d.digest!=='string'||!d.digest)throw Error('Invalid file response.');if(!c.signal.aborted)setDocument(d)}).catch(e=>{if(!c.signal.aborted)setError(e.message)});return()=>c.abort()},[current])
 const titleRef=useRef(onTitle);titleRef.current=onTitle
 useEffect(()=>{titleRef.current?.(current?.title??tr('阅读'))},[current])
 if(!current)return <div className="flex min-h-0 flex-1 flex-col">
  <div className="flex h-9 shrink-0 items-center px-2"><div className="relative min-w-0 flex-1"><Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3"/><input aria-label={tr("搜索学术笔记")} placeholder={tr("查找论文与知识…")} className="ui-input h-7 w-full rounded-full pl-7" value={query} onChange={e=>setQuery(e.target.value)}/></div></div>
  <div className="min-h-0 flex-1 overflow-auto p-2">{notes.filter(n=>(n.title+' '+n.path).toLowerCase().includes(query.toLowerCase())).map(n=><button key={n.path} className="ui-list-row" onClick={()=>openRightTab({kind:'note',doc:{workspace:'academic',path:n.path,title:n.title}})}>{n.title}</button>)}</div>
 </div>
 return <div className="flex min-h-0 flex-1 flex-col">
  <div className="flex h-9 shrink-0 items-center gap-1 px-2"><IconBtn icon={ArrowLeft} label={tr("返回文档列表")} onClick={()=>openRightTab({kind:'note'})}/><span className="min-w-0 flex-1 truncate pl-1 text-caption text-ink-2" title={current.title}>{current.title}</span><Button disabled={!document} onClick={()=>onQuote(`文件：${current.workspace}/${current.path}\n版本：${document?.digest}\n\n${document?.content}`)}>{tr("引用到 Chat")}</Button></div>
  {error&&<p role="alert" className="ui-error">{error}</p>}
  <article className="min-h-0 flex-1 overflow-auto px-5 py-4">{document?<ReadingBridge active={active} source={{id:'knowledge-reader',workspace:current.workspace,path:current.path,digest:document.digest}}><div className="research-document break-words text-secondary leading-relaxed"><MarkdownView content={document.content}/></div></ReadingBridge>:!error&&<p className="text-ink-3">{tr("正在读取…")}</p>}</article>
 </div>
}
