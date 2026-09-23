import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Globe, RotateCw } from 'lucide-react'
import { Button, IconBtn, RightMore } from '../../components/ui'
import { t as tr } from '../../i18n'

export function WebResource({url,report}:{url?:string;report:(title:string)=>void}) {
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

