import {useEffect,useMemo,useRef,useState} from 'react'
import {FileCode2,LocateFixed,X} from 'lucide-react'
import {t as tr} from '../../i18n'
import {useWorkbench} from '../../store'
import {post,request} from '../../lib/api'
import {Button,IconBtn} from '../../components/ui'

/* 源码舞台：PDF 批注 ⇄ LaTeX 源码双向跳转的中央区。
   排版即设计：等宽正文、行号栏、目标行柔和高亮，不做多余装饰。 */
export function SourceStage(){
 const {sourceView:view,closeSourceView,flashPDF}=useWorkbench()
 const [content,setContent]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [cursor,setCursor]=useState(1)
 const bodyRef=useRef<HTMLDivElement>(null)
 useEffect(()=>{
  setContent('');setError('')
  if(!view)return
  setCursor(view.line)
  const c=new AbortController()
  request<{content:string}>(`/workspaces/${encodeURIComponent(view.workspace)}/files/${view.path.split('/').map(encodeURIComponent).join('/')}`,{signal:c.signal})
   .then(d=>{if(!c.signal.aborted)setContent(d.content)})
   .catch(e=>{if(!c.signal.aborted)setError(e.message)})
  return()=>c.abort()
 },[view])
 const lines=useMemo(()=>content.split('\n'),[content])
 /* 目标行滚动到视野中部，高亮呼吸一次后常驻 */
 useEffect(()=>{
  if(!view||!lines.length)return
  const el=bodyRef.current?.querySelector<HTMLElement>(`[data-line="${view.line}"]`)
  el?.scrollIntoView({block:'center',behavior:'auto'})
 },[view,lines])
 useEffect(()=>{
  const close=(e:KeyboardEvent)=>{if(e.key==='Escape')closeSourceView()}
  window.addEventListener('keydown',close)
  return()=>window.removeEventListener('keydown',close)
 },[closeSourceView])
 if(!view)return null
 async function locateInPDF(){
  if(!view||busy)return
  setBusy(true);setError('')
  try{
   const box=await post<{page:number;x:number;y:number;width:number;height:number}>(`/manuscripts/build-records/${encodeURIComponent(view.buildId)}/synctex`,{mode:'view',file:view.path,line:cursor})
   flashPDF({buildId:view.buildId,page:box.page,box:{x:box.x,y:box.y,width:box.width,height:box.height}},view.pdf)
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 }
 return <section aria-label={tr('稿件源码')} data-xgc-role="source-stage" className="flex h-full min-h-0 flex-col bg-base">
  <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-4">
   <FileCode2 size={15} strokeWidth={1.75} className="shrink-0 text-ink-2"/>
   <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={view.path}>{view.path}</span>
   <span className="shrink-0 text-caption tabular-nums text-ink-3">{tr('行')} {cursor}{lines.length?` / ${lines.length}`:''}</span>
   <Button variant="solid" icon={LocateFixed} loading={busy} disabled={!content} onClick={()=>void locateInPDF()} data-xgc-role="source-locate-pdf">{tr('在 PDF 中定位')}</Button>
   <IconBtn icon={X} label={tr('关闭源码')} onClick={closeSourceView}/>
  </header>
  {error&&<p role="alert" className="ui-error">{error}</p>}
  <div ref={bodyRef} className="min-h-0 flex-1 overflow-auto py-4">
   {!content&&!error&&<p className="px-6 text-secondary text-ink-3">{tr('正在读取…')}</p>}
   {content&&<div className="min-w-max font-mono text-[12.5px] leading-[1.7]">
    {lines.map((text,i)=>{
     const n=i+1,target=n===view.line,active=n===cursor
     return <div key={n} data-line={n} onClick={()=>setCursor(n)}
      className={`flex cursor-pointer pr-6 transition-colors duration-150 ${target?'bg-ink/[0.07]':active?'bg-ink/[0.04]':'hover:bg-ink/[0.03]'}`}>
      <span className={`w-14 shrink-0 select-none pr-4 text-right tabular-nums ${target||active?'text-ink':'text-ink-3'}`}>{n}</span>
      <span className={`whitespace-pre ${target?'text-ink':'text-ink-2'}`}>{text||' '}</span>
     </div>
    })}
   </div>}
  </div>
 </section>
}
