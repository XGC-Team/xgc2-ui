import {t as tr} from '../i18n'
import { lazy,Suspense,useEffect,useRef,useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Expand, FileText, Folder, Globe, Plus, RotateCw, X } from 'lucide-react'
import { Button, IconBtn, RightMore } from './ui'
import { FilesPage } from '../features/resources/FilesPage'
import { DocumentPanel } from './DocumentPanel'
import { useWorkbench, type RightTab } from '../store'
import { cn } from '../lib/cn'
const PDFReader=lazy(()=>import('../features/resources/PDFReader'))

/* ---------- 网页标签：iframe + 历史导航。输入网址只走顶栏全局搜索，这里不放局部地址栏 ---------- */
function WebTab({url,report}:{url?:string;report:(title:string)=>void}) {
 const [history,setHistory]=useState<string[]>(url?[url]:[]),[index,setIndex]=useState(url?0:-1),[reload,setReload]=useState(0),[error,setError]=useState('')
 const frame=useRef<HTMLIFrameElement>(null);const current=history[index]||''
 const reportRef=useRef(report);reportRef.current=report
 useEffect(()=>{reportRef.current(current?new URL(current).host:tr('新网页'))},[current])
 function openGroundStation(){const url=`http://${location.hostname}:5174/`;setHistory(previous=>[...previous.slice(0,index+1),url]);setIndex(index+1);setError('')}
 function move(offset:number){const next=index+offset;if(next<0||next>=history.length)return;setIndex(next);setError('')}
 return <>
  <div className="flex h-9 shrink-0 items-center gap-1 px-2">
   <IconBtn icon={ArrowLeft} label={tr("上一个已输入地址")} onClick={()=>move(-1)} disabled={index<=0}/>
   <IconBtn icon={ArrowRight} label={tr("下一个已输入地址")} onClick={()=>move(1)} disabled={index>=history.length-1}/>
   <IconBtn icon={RotateCw} label={tr("重新加载网页")} onClick={()=>setReload(n=>n+1)} disabled={!current}/>
   <div className="ml-auto"><RightMore label={tr("浏览器操作")}><Button onClick={openGroundStation}>{tr("打开地面站 · 5174")}</Button>{current&&<a href={current} target="_blank" rel="noopener noreferrer" className="text-caption">{tr("在新窗口打开网页")}</a>}</RightMore></div>
  </div>
  <div className="browser-content min-h-0 flex-1 flex-col">
   {error&&<p role="alert" className="ui-error">{error}</p>}
   {current?<iframe ref={frame} key={`${current}:${reload}`} src={current} title={tr("网页浏览")} className="min-h-0 w-full flex-1 border-0" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"/>:<div className="grid flex-1 place-content-center p-6 text-center"><Globe size={22} strokeWidth={1.2} className="mx-auto mb-3 text-ink-3"/><h2 className="font-display text-[18px] tracking-tight">{tr("浏览网页")}</h2><p className="mt-1.5 text-secondary text-ink-3">{tr("在顶栏搜索中输入网址打开网页。")}</p><div className="mt-4"><Button onClick={openGroundStation}>{tr("打开地面站 · 5174")}</Button></div></div>}
  </div>
 </>
}

/* ---------- 新建标签菜单 ---------- */
function NewTabMenu({onNew}:{onNew:(kind:'web'|'file'|'note')=>void}) {
 const [open,setOpen]=useState(false);const ref=useRef<HTMLDivElement>(null)
 useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false)};const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key)}},[open])
 const items=[{kind:'web' as const,icon:Globe,label:tr('网页')},{kind:'file' as const,icon:Folder,label:tr('文件')},{kind:'note' as const,icon:BookOpen,label:tr('笔记')}]
 return <div ref={ref} className="relative shrink-0">
  <IconBtn icon={Plus} label={tr("新建标签页")} onClick={()=>setOpen(!open)}/>
  {open&&<div role="menu" aria-label={tr("新建标签页")} className="ui-pop-in absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-line bg-panel p-1 shadow-pop">
   {items.map(item=><button key={item.kind} role="menuitem" className="ui-list-row" onClick={()=>{onNew(item.kind);setOpen(false)}}><item.icon size={13} strokeWidth={1.75} className="shrink-0 text-ink-3"/>{item.label}</button>)}
  </div>}
 </div>
}

/* ---------- 右栏：标签页宿主。标签 = 打开的网页/文件/PDF/笔记，统一显示语义 ---------- */
const KIND_ICON:Record<RightTab['kind'],typeof Globe>={web:Globe,file:Folder,pdf:FileText,note:BookOpen}
export function BrowserPanel({onQuote,onExpand}:{onQuote:(text:string,targetProject?:string)=>void;onExpand:()=>void}) {
 const {rightTabs:tabs,activeRightTab:active,activateRightTab:activate,closeRightTab:close,openRightTab:open,updateRightTab:update,projectId}=useWorkbench()
 return <section aria-label={tr("右侧面板")} className="flex h-full min-h-0 flex-col">
  <div className="flex h-panel-header shrink-0 items-center gap-1 pl-2 pr-1.5">
   <div role="tablist" aria-label={tr("打开的标签页")} className="ui-rtabs flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
    {tabs.map(tab=>{
     const Icon=KIND_ICON[tab.kind];const selected=tab.id===active
     return <div key={tab.id} role="tab" tabIndex={0} aria-selected={selected} title={tab.title}
      className={cn('ui-rtab group',selected&&'is-active')}
      onClick={()=>activate(tab.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate(tab.id)}}}>
      <Icon size={12} strokeWidth={1.75} className="shrink-0"/>
      <span className="min-w-0 truncate">{tab.title}</span>
      <button type="button" aria-label={tr("关闭标签页")} className="ui-rtab-close" onClick={e=>{e.stopPropagation();close(tab.id)}}><X size={10} strokeWidth={2}/></button>
     </div>
    })}
   </div>
   <NewTabMenu onNew={kind=>open({kind})}/>
   <IconBtn icon={Expand} label={tr("展开或还原浏览器宽度")} onClick={onExpand}/>
  </div>
  <div className="relative min-h-0 flex-1">
   {tabs.map(tab=><div key={tab.id} className="rtab-panel" hidden={tab.id!==active}>
    {tab.kind==='web'&&<WebTab url={tab.url} report={title=>update(tab.id,{title})}/>}
    {tab.kind==='file'&&<FilesPage key={projectId} onQuote={onQuote} onTitle={title=>update(tab.id,{title})}/>}
    {tab.kind==='pdf'&&<Suspense fallback={<p className="p-4 text-ink-3">{tr("正在打开 PDF…")}</p>}><PDFReader pdf={tab.pdf} onPDF={pdf=>update(tab.id,{pdf,title:pdf.path.split('/').pop()||'PDF'})} onQuote={onQuote} onTitle={title=>update(tab.id,{title})}/></Suspense>}
    {tab.kind==='note'&&<DocumentPanel doc={tab.doc} onQuote={onQuote} onTitle={title=>update(tab.id,{title})}/>}
   </div>)}
   {!tabs.length&&<div className="grid h-full place-content-center p-6 text-center">
    <p className="text-secondary text-ink-3">{tr("没有打开的标签页")}</p>
    <div className="mt-4 flex justify-center gap-2"><Button onClick={()=>open({kind:'web'})}>{tr('网页')}</Button><Button onClick={()=>open({kind:'file'})}>{tr('文件')}</Button><Button onClick={()=>open({kind:'note'})}>{tr('笔记')}</Button></div>
   </div>}
  </div>
 </section>
}
