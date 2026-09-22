import {useEffect,useMemo,useRef,useState} from 'react'
import {FileCode2,LocateFixed,X} from 'lucide-react'
import {t as tr} from '../../i18n'
import {useWorkbench} from '../../store'
import {post,request} from '../../lib/api'
import {Button,IconBtn} from '../../components/ui'
import {FeedbackButton} from '../review/FeedbackButton'
import {readBuildRecords,requireBuildSource} from '../review/review-api'
import {buildSourceMatch} from '../review/build-provenance'
import {editLiveCanvas,inspectLiveCanvas} from '../projects/useCanvasDocument'
import {bindSourceSelection,confirmCandidate,locateRelatedCards,type BindingCandidate} from '../projects/design-context'
import {readDesignFocus,requestDesignFocus} from '../projects/design-focus'
import {workspaceCopy} from '../projects/workspace-copy'

/** Current source is not the build snapshot. Positional mapping is enabled only with matching input evidence. */
export function SourceStage(){
 const {sourceView:view,closeSourceView,flashPDF,locale,openCanvas}=useWorkbench();const zh=locale==='zh'
 const copy=workspaceCopy[locale]
 const [content,setContent]=useState(''),[digest,setDigest]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false)
 const [mapping,setMapping]=useState<'match'|'changed'|'unknown'>('unknown'),[cursor,setCursor]=useState(0)
 const [candidates,setCandidates]=useState<BindingCandidate[]>([])
 const [related,setRelated]=useState<{id:string;title:string}[]>([])
 const [note,setNote]=useState('')
 const bodyRef=useRef<HTMLDivElement>(null)
 useEffect(()=>{
  setContent('');setDigest('');setError('');setCursor(0);setMapping('unknown');setCandidates([]);setRelated([]);setNote('')
  if(!view)return
  const c=new AbortController();setLoading(true)
  void (async()=>{
   const d=await request<{content:string;digest:string}>(`/workspaces/${encodeURIComponent(view.workspace)}/files/${view.path.split('/').map(encodeURIComponent).join('/')}`,{signal:c.signal})
   if(c.signal.aborted)return
   if(typeof d.content!=='string'||!d.digest)throw Error('Missing source content/revision.')
   setContent(d.content);setDigest(d.digest)
   const records=await readBuildRecords(view.workspace,c.signal)
   if(c.signal.aborted)return
   const match=buildSourceMatch(records.find(r=>r.manifest.buildId===view.buildId),view.workspace,view.path,d.digest)
   setMapping(match);if(match==='match'&&view.line<=d.content.split('\n').length)setCursor(view.line)
  })().catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setLoading(false)})
  return()=>c.abort()
 },[view])
 const lines=useMemo(()=>content.split('\n'),[content])
 useEffect(()=>{
  if(!view||mapping!=='match')return
  bodyRef.current?.querySelector<HTMLElement>(`[data-line="${view.line}"]`)?.scrollIntoView({block:'center',behavior:'auto'})
 },[view,mapping])
 useEffect(()=>{
  if(!view||!digest||!content){setRelated([]);setCandidates([]);return}
  const gate=inspectLiveCanvas(view.workspace)
  if(!gate?.value){setRelated([]);setCandidates([]);return}
  const found=locateRelatedCards(gate.value,{workspace:view.workspace,path:view.path,digest,content})
  const cards=new Map<string,string>()
  for(const item of found.exact){
   const title=gate.value.nodes.find(node=>node.id===item.cardId)?.title||item.cardId
   cards.set(item.cardId,title)
  }
  setRelated([...cards].map(([id,title])=>({id,title})))
  setCandidates(found.candidates)
 },[view,digest,content])
 useEffect(()=>{const close=(e:KeyboardEvent)=>{if(e.key==='Escape')closeSourceView()};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[closeSourceView])
 if(!view)return null
 async function locateInPDF(){
  if(!view||busy||mapping!=='match'||!cursor)return
  setBusy(true);setError('')
  try{
   // The remote file may have changed since it was displayed.
   const fresh=await request<{digest:string}>(`/workspaces/${encodeURIComponent(view.workspace)}/files/${view.path.split('/').map(encodeURIComponent).join('/')}`)
   if(fresh.digest!==digest)throw Error(zh?'当前源码版本已变化，未使用旧行号定位。':'Source changed; old line coordinates were not used.')
   await requireBuildSource(view.workspace,view.path,view.buildId,digest)
   const box=await post<{page:number;x:number;y:number;width:number;height:number}>(`/manuscripts/build-records/${encodeURIComponent(view.buildId)}/synctex`,{mode:'view',file:view.path,line:cursor})
   flashPDF({buildId:view.buildId,page:box.page,box:{x:box.x,y:box.y,width:box.width,height:box.height}},view.pdf)
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 const start=cursor>0?lines.slice(0,cursor-1).join('\n').length+(cursor>1?1:0):0
 const bindFocused=()=>{
  if(!view||!digest||cursor<=0)return
  const focus=readDesignFocus()
  const cardId=focus?.project===view.workspace?focus.cardIds[0]:''
  if(!cardId){setNote(copy.noDesignFocus);return}
  const end=start+lines[cursor-1].length
  if(end<=start)return
  const ok=editLiveCanvas(view.workspace,canvas=>bindSourceSelection(canvas,cardId,{workspace:view.workspace,path:view.path,digest,content},start,end))
  setNote(ok?'':copy.captureBlocked)
 }
 const confirmObservedBinding=(candidate:BindingCandidate)=>{
  if(!view||!digest||!candidate.observedRange)return
  const ok=editLiveCanvas(view.workspace,canvas=>confirmCandidate(canvas,candidate,{workspace:view.workspace,path:view.path,digest,content}))
  setNote(ok?'':copy.captureBlocked)
 }
 return <section aria-label={tr('稿件源码')} data-xgc-role="source-stage" className="flex h-full min-h-0 flex-col bg-base">
  <header className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-line px-4">
   <FileCode2 size={15} strokeWidth={1.75} className="shrink-0 text-ink-2"/>
   <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={view.path}>{view.path}</span>
   <span className="shrink-0 text-caption tabular-nums text-ink-3">{tr('行')} {cursor||'—'} / {lines.length}</span>
   {cursor>0&&lines[cursor-1]&&digest&&<FeedbackButton scope={{projectId:view.workspace,workspace:view.workspace}} displayed={lines[cursor-1]} target={{kind:'text',workspace:view.workspace,path:view.path,start,end:start+lines[cursor-1].length}}/>}
   <Button variant="solid" icon={LocateFixed} loading={busy} disabled={mapping!=='match'||!cursor} onClick={()=>void locateInPDF()} data-xgc-role="source-locate-pdf">{tr('在 PDF 中定位')}</Button>
   <IconBtn icon={X} label={tr('关闭源码')} onClick={closeSourceView}/>
  </header>
  <p className="break-all px-4 pt-2 text-caption">{zh?'当前源码版本':'Current source revision'} · {digest||'—'}</p>
  {mapping!=='match'&&<p role="status" className="px-4 py-2 text-caption">{zh?'待确认：当前源码与被批注构建尚未证明一致；未自动高亮旧行号。可手动选择当前源码行提出反馈。':'Needs confirmation: current source is not verified against the annotated build. Old line numbers were not highlighted. Select a current source line for feedback.'}</p>}
  {(related.length>0||candidates.length>0||cursor>0)&&<div className="flex flex-wrap items-center gap-1 px-4 py-2" data-design-mapping="">
   <span className="text-caption text-ink-3">{copy.relatedDesign}</span>
   {related.map(card=><Button key={card.id} size="xs" onClick={()=>{openCanvas(view.workspace);requestDesignFocus(view.workspace,[card.id])}}>{card.title}</Button>)}
   {candidates.length>0&&<span className="text-caption text-ink-3">{copy.designCandidates} {copy.bindingUncertain}</span>}
   {candidates.map(candidate=><Button key={`${candidate.cardId}:${candidate.bindingId}:${candidate.observedRange?.start??''}`} size="xs" onClick={()=>confirmObservedBinding(candidate)}>{copy.confirmBinding} · {candidate.cardId}</Button>)}
   <Button size="xs" disabled={!cursor||!digest} onClick={bindFocused}>{copy.bindToFocus}</Button>
   {note&&<p role="status" className="w-full text-caption text-ink-3">{note}</p>}
  </div>}
  {error&&<p role="alert" className="ui-error">{error}</p>}
  <div ref={bodyRef} className="min-h-0 flex-1 overflow-auto py-4">
   {loading&&!digest&&<p className="px-6 text-secondary text-ink-3">{tr('正在读取…')}</p>}
   {digest&&<div className="min-w-max font-mono text-secondary leading-[1.7]">
    {lines.map((text,i)=>{const n=i+1,target=mapping==='match'&&n===view.line,active=n===cursor
     return <button type="button" key={n} data-line={n} onClick={()=>setCursor(n)} className={`flex w-full cursor-pointer pr-6 text-left transition-colors duration-150 ${target?'bg-ink/[0.07]':active?'bg-ink/[0.04]':'hover:bg-ink/[0.03]'}`}>
      <span className={`w-14 shrink-0 select-none pr-4 text-right tabular-nums ${target||active?'text-ink':'text-ink-3'}`}>{n}</span>
      <span className={`whitespace-pre ${target?'text-ink':'text-ink-2'}`}>{text||' '}</span>
     </button>})}
   </div>}
  </div>
 </section>
}
