import {useEffect,useMemo,useRef,useState} from 'react'
import {FileCode2,LocateFixed,X} from 'lucide-react'
import {t as tr} from '../../i18n'
import {useWorkbench} from '../../store'
import {request} from '../../lib/api'
import {Button,IconBtn} from '../../components/ui'
import {FeedbackButton} from '../review/FeedbackButton'
import {readBuildRecords,requireBuildSource} from '../review/review-api'
import {buildSourceMatch,previewProvenance,type BuildRecord} from '../review/build-provenance'
import {assertEditorClean} from '../review/write-coordinator'
import {CANVAS_PATH,parseEditableCanvas,type ThinkingCanvasV2} from '../projects/canvas-model'
import {requestDesignFocus} from '../projects/design-focus'
import {locateDesignFromBuild} from '../projects/design-build'
import {sourceDesignMatches,validateSourceSnapshot,type CanvasSourceBinding,type DesignSourceSnapshot} from '../projects/design-source'

type DisplayedSource={key:string;source:DesignSourceSnapshot;build?:BuildRecord;canvas?:ThinkingCanvasV2;canvasDigest?:string}
/** A read-only projection, not a second canvas session. Build coordinates never establish semantic
 * ownership: the existing source/output provenance and saved design bindings must both match. */
export function SourceStage(){
 const {sourceView:view,closeSourceView,flashPDF,openCanvas,locale}=useWorkbench();const zh=locale==='zh'
 const key=JSON.stringify(view),currentKey=useRef(key);currentKey.current=key
 const [record,setRecord]=useState<DisplayedSource|null>(null),[reload,setReload]=useState(0)
 const [error,setError]=useState(''),[designError,setDesignError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false)
 const [cursor,setCursor]=useState(0),[manual,setManual]=useState(false)
 const operation=useRef<AbortController|null>(null),bodyRef=useRef<HTMLDivElement>(null)
 const displayed=record?.key===key?record:null
 const source=displayed?.source,digest=source?.digest??'',content=source?.content??''
 const lines=useMemo(()=>content.split('\n'),[content])
 const build=displayed?.build,canvas=displayed?.canvas
 const provenance=view&&source&&build?previewProvenance([build],view.pdf):null
 const mapping=view&&source&&provenance?.valid?buildSourceMatch(build,view.workspace,view.path,digest):'unknown'
 const fileURL=(workspace:string,path:string)=>`/workspaces/${encodeURIComponent(workspace)}/files/${path.split('/').map(encodeURIComponent).join('/')}`
 useEffect(()=>{
  operation.current?.abort();setBusy(false);setRecord(null);setError('');setDesignError('');setCursor(0);setManual(false)
  if(!view){setLoading(false);return}
  const controller=new AbortController();setLoading(true)
  const valid=()=>!controller.signal.aborted&&currentKey.current===key
  void (async()=>{
   const saved=await request<{content:string;digest:string}>(fileURL(view.workspace,view.path),{signal:controller.signal})
   const snapshot={workspace:view.workspace,path:view.path,content:saved.content,digest:saved.digest};validateSourceSnapshot(snapshot)
   if(!valid())return
   setRecord({key,source:snapshot})
   await Promise.all([
    readBuildRecords(view.workspace,controller.signal).then(records=>{
     if(!valid())return
     const observed=records.find(item=>item.manifest.buildId===view.buildId)
     setRecord(previous=>previous?.key===key?{...previous,build:observed}:previous)
     if(observed&&previewProvenance([observed],view.pdf).valid&&buildSourceMatch(observed,view.workspace,view.path,snapshot.digest)==='match'&&Number.isSafeInteger(view.line)&&view.line>0&&view.line<=snapshot.content.split('\n').length)setCursor(view.line)
    }).catch(cause=>{if(valid())setError(cause instanceof Error?cause.message:String(cause))}),
    request<{content:string;digest:string}>(fileURL(view.workspace,CANVAS_PATH),{signal:controller.signal}).then(savedCanvas=>{
     if(!valid())return
     if(!savedCanvas.digest)throw new Error('Missing saved design revision.')
     const design=parseEditableCanvas(savedCanvas.content,view.workspace)
     setRecord(previous=>previous?.key===key?{...previous,canvas:design,canvasDigest:savedCanvas.digest}:previous)
    }).catch(cause=>{if(valid())setDesignError(cause instanceof Error?cause.message:String(cause))}),
   ])
  })().catch(cause=>{if(valid())setError(cause instanceof Error?cause.message:String(cause))}).finally(()=>{if(valid())setLoading(false)})
  return()=>{controller.abort();operation.current?.abort()}
 },[key,reload])
 useEffect(()=>{
  if(!view||mapping!=='match')return
  bodyRef.current?.querySelector<HTMLElement>(`[data-line="${view.line}"]`)?.scrollIntoView({block:'center',behavior:'auto'})
 },[key,mapping])
 useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape')closeSourceView()};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[closeSourceView])
 if(!view)return null
 const start=cursor>0?lines.slice(0,cursor-1).join('\n').length+(cursor>1?1:0):0
 const selection=cursor>0&&lines[cursor-1]?{start,end:start+lines[cursor-1].length}:undefined
 const built=source&&canvas?locateDesignFromBuild(canvas,source,build,{workspace:view.workspace,path:view.path,line:view.line,pdf:view.pdf}):null
 const selectedMatches=source&&canvas&&manual?(selection?sourceDesignMatches(canvas,source,selection):[]):null
 const exact=selectedMatches?selectedMatches.filter(item=>item.resolution.state==='exact').map(item=>item.binding):built?.exact??[]
 const candidates=selectedMatches?selectedMatches.filter(item=>item.resolution.state!=='exact').map(item=>item.binding):built?.candidates??[]
 const validAction=(controller:AbortController)=>!controller.signal.aborted&&currentKey.current===key
 async function locateInPDF(){
  if(!view||busy||mapping!=='match'||!cursor||!source)return
  const controller=new AbortController();operation.current?.abort();operation.current=controller
  setBusy(true);setError('')
  try{
   assertEditorClean(view.workspace,view.path)
   const fresh=await request<{digest:string;content:string}>(fileURL(view.workspace,view.path),{signal:controller.signal})
   if(!validAction(controller))return
   if(fresh.digest!==digest||fresh.content!==source.content)throw Error(zh?'当前源码版本已变化，未使用旧行号定位。':'Source changed; old line coordinates were not used.')
   await requireBuildSource(view.workspace,view.path,view.buildId,digest)
   if(!validAction(controller))return
   const box=await request<{page:number;x:number;y:number;width:number;height:number}>(`/manuscripts/build-records/${encodeURIComponent(view.buildId)}/synctex`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'view',file:view.path,line:cursor}),signal:controller.signal})
   if(!validAction(controller))return
   assertEditorClean(view.workspace,view.path)
   flashPDF({buildId:view.buildId,page:box.page,box:{x:box.x,y:box.y,width:box.width,height:box.height}},view.pdf)
  }catch(cause){if(validAction(controller))setError(cause instanceof Error?cause.message:String(cause))}finally{if(validAction(controller))setBusy(false)}
 }
 async function locateDesign(binding:CanvasSourceBinding,nodeId:string){
  if(!view||busy||!source||!displayed?.canvasDigest)return
  const controller=new AbortController();operation.current?.abort();operation.current=controller
  setBusy(true);setDesignError('')
  try{
   assertEditorClean(view.workspace,CANVAS_PATH);assertEditorClean(view.workspace,view.path)
   const [freshDesign,freshSource]=await Promise.all([
    request<{digest:string}>(fileURL(view.workspace,CANVAS_PATH),{signal:controller.signal}),
    request<{digest:string;content:string}>(fileURL(view.workspace,view.path),{signal:controller.signal}),
   ])
   if(!validAction(controller))return
   if(freshDesign.digest!==displayed.canvasDigest||freshSource.digest!==digest||freshSource.content!==source.content)throw new Error(zh?'设计或源码已变化，请重新核对版本。':'Design or source changed. Recheck the revisions.')
   assertEditorClean(view.workspace,CANVAS_PATH);assertEditorClean(view.workspace,view.path)
   requestDesignFocus({project:view.workspace,nodeId,bindingId:binding.id});closeSourceView();openCanvas(view.workspace)
  }catch(cause){if(validAction(controller))setDesignError(cause instanceof Error?cause.message:String(cause))}finally{if(validAction(controller))setBusy(false)}
 }
 return <section aria-label={tr('稿件源码')} data-xgc-role="source-stage" className="flex h-full min-h-0 flex-col bg-base">
  <header className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-line px-4">
   <FileCode2 size={15} strokeWidth={1.75} className="shrink-0 text-ink-2"/>
   <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={view.path}>{view.path}</span>
   <span className="shrink-0 text-caption tabular-nums text-ink-3">{tr('行')} {cursor||'—'} / {lines.length}</span>
   {selection&&digest&&<FeedbackButton scope={{projectId:view.workspace,workspace:view.workspace}} displayed={lines[cursor-1]} target={{kind:'text',workspace:view.workspace,path:view.path,...selection}}/>}
   <Button size="xs" disabled={busy||loading} onClick={()=>setReload(value=>value+1)}>{zh?'核对版本':'Recheck versions'}</Button>
   <Button variant="solid" icon={LocateFixed} loading={busy} disabled={mapping!=='match'||!cursor||loading} onClick={()=>void locateInPDF()} data-xgc-role="source-locate-pdf">{tr('在 PDF 中定位')}</Button>
   <IconBtn icon={X} label={tr('关闭源码')} onClick={closeSourceView}/>
  </header>
  <p className="break-all px-4 pt-2 text-caption">{zh?'当前源码版本':'Current source revision'} · {digest||'—'}</p>
  {mapping!=='match'&&<p role="status" className="px-4 py-2 text-caption">{zh?'待确认：当前源码、被批注构建与 PDF 输出尚未证明一致；未自动高亮旧行号。可手动选择当前源码行提出反馈或查看关联设计。':'Needs confirmation: source, annotated build and PDF output are not verified together. Old line numbers were not highlighted. Select current source lines for feedback or design lookup.'}</p>}
  {error&&<p role="alert" className="ui-error">{error}</p>}
  <div className="max-h-48 shrink-0 space-y-1 overflow-auto border-b border-line px-4 py-2" data-source-design-links="">
   <p className="break-all text-caption text-ink-3">{zh?'已保存设计版本':'Saved design revision'} · {displayed?.canvasDigest??'—'}</p>
   {manual&&mapping!=='match'&&<p className="text-caption text-warn">{zh?'以下精确关系仅针对人工选择的当前源码，不代表旧 PDF 精确映射。':'Exact links below refer to the manually selected current source, not the old PDF.'}</p>}
   {[...exact.map(binding=>({binding,precise:true})),...candidates.map(binding=>({binding,precise:false}))].map(({binding,precise})=><div key={binding.id} className="flex flex-wrap items-center gap-1 text-caption">
    <span className={precise?'text-ink-2':'text-warn'}>{precise?(zh?'对应设计':'Linked design'):(zh?'候选设计 · 待校正':'Candidate design · needs correction')}</span>
    {binding.nodeIds.map(id=><Button key={id} size="xs" disabled={busy||loading} onClick={()=>void locateDesign(binding,id)}>{canvas?.nodes.find(node=>node.id===id)?.title||id}</Button>)}
   </div>)}
   {canvas&&!exact.length&&!candidates.length&&<p className="text-caption text-ink-3">{zh?'该范围还没有设计关联；在设计卡片中选择当前源码范围建立关联。':'No design links for this range. Select current source in a design card to link it.'}</p>}
   {designError&&<p role="alert" className="text-caption text-warn">{designError}</p>}
  </div>
  <div ref={bodyRef} className="min-h-0 flex-1 overflow-auto py-4">
   {loading&&!digest&&<p className="px-6 text-secondary text-ink-3">{tr('正在读取…')}</p>}
   {digest&&<div className="min-w-max font-mono text-[12.5px] leading-[1.7]">
    {lines.map((text,index)=>{const number=index+1,target=mapping==='match'&&number===view.line,active=number===cursor
     return <button type="button" key={number} data-line={number} onClick={()=>{setCursor(number);setManual(true)}} className={`flex w-full cursor-pointer pr-6 text-left transition-colors duration-150 ${target?'bg-ink/[0.07]':active?'bg-ink/[0.04]':'hover:bg-ink/[0.03]'}`}>
      <span className={`w-14 shrink-0 select-none pr-4 text-right tabular-nums ${target||active?'text-ink':'text-ink-3'}`}>{number}</span>
      <span className={`whitespace-pre ${target?'text-ink':'text-ink-2'}`}>{text||' '}</span>
     </button>})}
   </div>}
  </div>
 </section>
}
