import {RightActionHost,RightMore} from './RightPanelActions'
import {t as tr} from '../i18n'
import { lazy,Suspense,useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Expand, Globe, RotateCw, BookOpen, Folder, FileText } from 'lucide-react'
import { Button, IconBtn, Tabs } from './ui'
import { FilesPage } from '../features/resources/FilesPage'
import { DocumentPanel } from './DocumentPanel'
import { useWorkbench } from '../store'
const PDFReader=lazy(()=>import('./PDFReader'))
const TABS=[{id:'browser',label:'Browser',icon:<Globe size={14}/>},{id:'reading',label:'阅读',icon:<BookOpen size={14}/>},{id:'files',label:'项目文件',icon:<Folder size={14}/>},{id:'pdf',label:'PDF',icon:<FileText size={14}/>}]
export function BrowserPanel({onQuote,onExpand}:{onQuote:(text:string,targetProject?:string)=>void;onExpand:()=>void}) {
 const {projectId,rightTab:tab,setRightTab:setTab}=useWorkbench()
 const [address,setAddress]=useState(''),[history,setHistory]=useState<string[]>([]),[index,setIndex]=useState(-1),[reload,setReload]=useState(0),[error,setError]=useState('')
 const [actionHost,setActionHost]=useState<HTMLDivElement|null>(null)
 const frame=useRef<HTMLIFrameElement>(null);const current=history[index]||''
 function openGroundStation(){const url=`http://${location.hostname}:5174/`;setHistory(previous=>[...previous.slice(0,index+1),url]);setIndex(index+1);setAddress(url);setError('')}
 function navigate(){try{const value=address.trim();if(!value)return;const url=new URL(/^https?:\/\//i.test(value)?value:`${/^(localhost|127\.0\.0\.1)(:|\/|$)/.test(value)?'http':'https'}://${value}`);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('请输入 HTTP 或 HTTPS 网页地址。');if(url.origin===window.location.origin)throw Error('工作台自身的页面请在新窗口打开。');setHistory(previous=>[...previous.slice(0,index+1),url.href]);setIndex(index+1);setAddress(url.href);setError('')}catch(e){setError(e instanceof Error?e.message:'地址无效。')}}
 function move(offset:number){const next=index+offset;if(next<0||next>=history.length)return;setIndex(next);setAddress(history[next]);setError('')}
 return <section aria-label="浏览器右栏" className="flex h-full min-h-0 flex-col bg-panel">
   <div data-right-toolbar className="relative flex h-panel-header shrink-0 items-center gap-1 border-b border-line px-1.5"><Tabs id="浏览器右栏视图" tabs={TABS} active={tab} onChange={setTab} className="right-view-tabs"/>
    {tab==='browser'?<form className="flex min-w-0 flex-1 items-center gap-0.5" onSubmit={event=>{event.preventDefault();navigate()}}><div className="mx-1 flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-line bg-inset px-2.5 text-secondary text-ink-2"><Globe size={11} className="shrink-0 text-ink-3"/><input aria-label={tr("网页地址")} placeholder={tr("输入网址，按 Enter 打开")} className="min-w-0 flex-1 bg-transparent outline-none" value={address} onChange={event=>setAddress(event.target.value)}/></div><RightMore label={tr("浏览器操作")}><IconBtn icon={ArrowLeft} label={tr("上一个已输入地址")} onClick={()=>move(-1)} disabled={index<=0}/><IconBtn icon={ArrowRight} label={tr("下一个已输入地址")} onClick={()=>move(1)} disabled={index>=history.length-1}/><IconBtn icon={RotateCw} label={tr("重新加载网页")} onClick={()=>setReload(n=>n+1)} disabled={!current}/>{current&&<a href={current} target="_blank" rel="noopener noreferrer" className="text-caption">{tr("在新窗口打开网页")}</a>}</RightMore></form>:<div ref={setActionHost} className="flex min-w-0 flex-1 items-center gap-1"/>}<IconBtn icon={Expand} label={tr("展开或还原浏览器宽度")} onClick={onExpand}/></div>
   <RightActionHost.Provider value={actionHost}>
   <div hidden={tab!=='browser'} className="browser-content min-h-0 flex-1 flex-col">
     {error&&<p role="alert" className="ui-error">{error}</p>}
     {current?<><iframe ref={frame} key={`${current}:${reload}`} src={current} title={tr("网页浏览")} className="min-h-0 w-full flex-1 border-0 bg-white" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"/><div className="border-t border-line px-3 py-2 text-caption text-ink-3">{tr("若网站不允许嵌入，可用右上角按钮在新窗口打开。")}</div></>:<div className="grid flex-1 place-content-center p-6 text-center"><Globe size={24} strokeWidth={1.2} className="mx-auto mb-3 text-ink-3"/><h2 className="text-body font-medium">{tr("Browser")}</h2><Button onClick={openGroundStation}>{tr("打开地面站 · 5174")}</Button><p className="mt-2 text-secondary text-ink-3">{tr("输入网址，浏览研究资料。")}</p></div>}
   </div>
   {tab==='pdf'&&<Suspense fallback={<p className="p-4 text-ink-3">{tr("正在打开 PDF…")}</p>}><PDFReader onQuote={onQuote}/></Suspense>}
   {tab==='reading'&&<DocumentPanel onQuote={onQuote}/>}
   {tab==='files'&&<div className="material-panel min-h-0 flex-1"><FilesPage key={projectId} onQuote={onQuote}/></div>}
 </RightActionHost.Provider></section>
}
