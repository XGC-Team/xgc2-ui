import {t as tr} from '../i18n'
import { TerminalPanel } from './TerminalPanel'
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { useNativeAgentSession } from '../features/chat/Session'
import { useWorkbench } from '../store'
import { request } from '../lib/api'
import { IconBtn, Tabs } from './ui'
type Revision={version:number;draft:{title:string};runs:{id:string;status:string;failure?:string;receipts:{stage:string;status:string;output:string}[]}[]}
const TABS=[{id:'terminal',label:'Terminal'},{id:'output',label:'Output'},{id:'runs',label:'Runs'},{id:'requests',label:'Requests'}]
export function BottomPanel({onCollapse,onExpand,expanded}:{onCollapse:()=>void;onExpand:()=>void;expanded:boolean}) {
 const native=useNativeAgentSession();const {projectId,setActiveNav}=useWorkbench()
 const [tab,setTab]=useState('terminal'),[revisions,setRevisions]=useState<Revision[]>([]),[error,setError]=useState(''),[reload,setReload]=useState(0)
 const matching=Boolean(native.session&&native.streamMatchesSelection)
 const items=matching?native.state.items.filter(item=>item.role==='tool'):[]
 const pending=matching?Object.values(native.state.pending).filter(item=>!item.submitted):[]
 const runs=revisions.flatMap(revision=>revision.runs.map(run=>({...run,version:revision.version,title:revision.draft.title})))
 useEffect(()=>{
   setRevisions([]);setError('');if(!projectId)return
   const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined
   async function load(){try{const values=await request<Revision[]>(`/research/projects/${encodeURIComponent(projectId)}/plans`,{signal:controller.signal});if(!controller.signal.aborted){setRevisions(values);setError('')}}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:String(e))}finally{if(!controller.signal.aborted)timer=setTimeout(load,2500)}}
   void load();return()=>{controller.abort();clearTimeout(timer)}
 },[projectId,reload])
 return <section data-bottom-collapsed={!expanded} aria-label="下栏" className="flex h-full min-h-0 flex-col border-t border-line bg-panel text-ink">
   <div className="ui-toolbar gap-1 border-b border-line"><Tabs id="下栏视图" variant="pill" tabs={TABS} active={tab} onChange={id=>{setTab(id);if(!expanded)onExpand()}} badges={{runs:runs.length,requests:pending.length}}/><div className="ml-auto flex items-center gap-1"><IconBtn icon={RefreshCw} label={tr("刷新下栏")} onClick={()=>{setReload(n=>n+1);native.setReload(n=>n+1)}}/><IconBtn icon={expanded?ChevronDown:ChevronUp} label={tr(expanded?"收起下栏":"展开下栏")} onClick={expanded?onCollapse:onExpand}/></div></div>
   <div hidden={tab!=='terminal'} className="min-h-0 flex-1"><TerminalPanel/></div>
   <div hidden={tab==='terminal'} className="bottom-output min-h-0 flex-1"><div className="min-w-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-[1.7]">
    {tab==='output'&&(items.length?items.map(item=><details key={item.key} open className="mb-2"><summary className="cursor-pointer text-ink">{item.title||item.sourceMethod||'Tool'} <span className="text-ink-3">{item.status}</span></summary><pre className="whitespace-pre-wrap break-words text-ink-2">{item.text||tr("等待工具输出")}</pre></details>):<p className="text-ink-3">{matching?tr("当前会话还没有工具输出。"):tr("连接会话后，在这里查看真实工具输出。")}</p>)}
    {tab==='runs'&&<>{error&&<p role="alert">{error}</p>}{runs.length?runs.map(run=><details key={run.id} className="mb-2"><summary className="cursor-pointer">{run.title} · v{run.version} <span className="text-ink-3">{run.status}</span></summary>{run.failure&&<p>{run.failure}</p>}{run.receipts.map(receipt=><div key={receipt.stage} className="my-2"><span>{receipt.stage} · {receipt.status}</span><pre className="whitespace-pre-wrap break-words text-ink-2">{receipt.output}</pre></div>)}<button type="button" className="rounded px-2 py-1 text-ink hover:bg-hover" onClick={()=>setActiveNav('workflow')}>{tr("打开工作流")}</button></details>):!error&&<p className="text-ink-3">{projectId?tr("当前项目还没有运行记录。"):tr("选择项目查看工作流运行记录。")}</p>}</>}
    {tab==='requests'&&(pending.length?pending.map(item=><div key={item.id} className="mb-3"><p>{item.title}</p><p className="whitespace-pre-wrap break-words text-ink-2">{item.text}</p><button type="button" className="mt-1 rounded bg-accent px-2 py-1 text-accent-fg" onClick={()=>setActiveNav('chat')}>{tr("前往 Chat 处理")}</button></div>):<p className="text-ink-3">{tr("当前没有待处理的会话请求。")}</p>)}
   </div><aside className="w-56 shrink-0 overflow-y-auto border-l border-line p-3 text-secondary max-lg:hidden"><div className="mb-3 text-caption font-medium text-ink-3">{tr("Session")}</div>{matching?<dl className="space-y-2"><div className="flex justify-between gap-2"><dt className="text-ink-3">{tr("助手")}</dt><dd>{native.session!.provider}</dd></div><div className="flex justify-between gap-2"><dt className="text-ink-3">{tr("状态")}</dt><dd>{native.state.worker}</dd></div><div className="flex justify-between gap-2"><dt className="text-ink-3">{tr("工具输出")}</dt><dd>{items.length}</dd></div><div className="flex justify-between gap-2"><dt className="text-ink-3">{tr("待处理请求")}</dt><dd>{pending.length}</dd></div></dl>:<p className="text-ink-3">{tr("尚未连接会话。")}</p>}</aside></div>
 </section>
}
