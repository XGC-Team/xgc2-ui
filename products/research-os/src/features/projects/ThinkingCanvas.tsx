import {t as tr} from '../../i18n'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {BookOpen, Copy, Crosshair, Expand, FileText, Link2, ListTree, Plus, Redo2, Send, Trash2, Undo2} from 'lucide-react'
import {request,saveDownload} from '../../lib/api'
import {useCanvasDocument} from './useCanvasDocument'
import {fileTarget} from './project-object-model'
import {projectObjectCopy} from './project-object-copy'
import {useWorkbench} from '../../store'
import {useNativeAgentSession} from '../chat/Session'
import {useAcademicNotes} from '../resources/useAcademicNotes'
import {cn} from '../../lib/cn'
import {Button,IconBtn,RightMore} from '../../components/ui'
import {workspaceCopy} from './workspace-copy'
import {OutlinePanel} from './OutlinePanel'
import {openResearchSource} from './research-navigation'
import {newContextItem} from './context-model'
import {
  CANVAS_PATH,PRIMARY_OUTLINE,SEMANTIC_RELATIONS,addCanvasEdge,addNodeEvidence,canvasToPrompt,emptyCanvasV2,
  newCanvasEvidence,removeCanvasNode,removeNodeEvidence,setEdgeRelation,setNodeWriting,
  type CanvasNodeV2,type SemanticRelation,type ThinkingCanvasV2,
} from './canvas-model'
/* 思维白板：Origami 式节点画布。节点卡是 DOM（排版精度），连线是 SVG，点阵底随相机走。
   数据落项目仓库 thinking.canvas.json（git 版本化）；拓扑可导出为写作系统提示词。
   v2：x/y 只表达视觉位置；层级与写作顺序在大纲视图；连线语义需要显式标注。 */
type Cam={x:number;y:number;k:number}
type Sel={kind:'node'|'edge';id:string}|null
const NODE_W=224
const EMPTY_CANVAS=emptyCanvasV2()
const RELATION_COPY:Record<SemanticRelation,'relationSupports'|'relationContradicts'|'relationDepends'|'relationExemplifies'|'relationContinues'|'relationCites'>={
  supports:'relationSupports',contradicts:'relationContradicts',depends:'relationDepends',exemplifies:'relationExemplifies',continues:'relationContinues',cites:'relationCites',
}
export function ThinkingCanvas({project,active=true,onRequestConversation}:{project:string;active?:boolean;onRequestConversation?:()=>void}) {
 const {openDocument,openRightTab,setActiveNav,locale,addContextItem}=useWorkbench();const copy=workspaceCopy[locale];const native=useNativeAgentSession();const {notes}=useAcademicNotes()
 const documentState=useCanvasDocument(project);const {mutate}=documentState;const canvas=documentState.value??EMPTY_CANVAS;const messages=projectObjectCopy[locale]
 const [view,setView]=useState<'canvas'|'outline'>('canvas')
 const [artifact,setArtifact]=useState(PRIMARY_OUTLINE)
 const [cam,setCam]=useState<Cam>({x:0,y:0,k:1})
 const [sel,setSel]=useState<Sel>(null),[picker,setPicker]=useState<{kind:'ref'|'anchor';node:string}|null>(null)
 const [copied,setCopied]=useState(false)
 const [files,setFiles]=useState<string[]>([]),[copyError,setCopyError]=useState('')
 const [evidenceForm,setEvidenceForm]=useState({path:'',digest:'',excerpt:'',note:''}),[evidenceError,setEvidenceError]=useState('')
 const copyTimer=useRef<ReturnType<typeof setTimeout>>(undefined)
 useEffect(()=>()=>clearTimeout(copyTimer.current),[])
 const box=useRef<HTMLDivElement>(null),fitted=useRef(false)
 const drag=useRef<{mode:'pan'|'node'|'edge';id?:string;sx:number;sy:number;cam?:Cam;cur?:{x:number;y:number}}|null>(null)
 const [tempEdge,setTempEdge]=useState<{from:string;to:{x:number;y:number}}|null>(null)
 /* 局部撤销/重做：内容快照在会话内移动，不触碰保存状态；输入类编辑按字段合并。 */
 const past=useRef<ThinkingCanvasV2[]>([]),future=useRef<ThinkingCanvasV2[]>([])
 const lastEdit=useRef<{key:string;at:number}>({key:'',at:0})
 const [historyVersion,setHistoryVersion]=useState(0)
 const hadValue=useRef(false)
 useEffect(()=>{const has=Boolean(documentState.value);if(has&&!hadValue.current){past.current=[];future.current=[];lastEdit.current={key:'',at:0};setHistoryVersion(v=>v+1)}hadValue.current=has},[documentState.value])
 const apply=useCallback((update:(canvas:ThinkingCanvasV2)=>ThinkingCanvasV2,coalesceKey='')=>{
  const current=documentState.value;if(!current)return
  const now=Date.now()
  if(!coalesceKey||lastEdit.current.key!==coalesceKey||now-lastEdit.current.at>800)past.current.push(current)
  lastEdit.current={key:coalesceKey,at:now}
  future.current=[];setHistoryVersion(v=>v+1)
  mutate(update)
 },[documentState.value,mutate])
 const undo=useCallback(()=>{const prev=past.current.pop();const current=documentState.value;if(!prev||!current)return;future.current.push(current);setHistoryVersion(v=>v+1);mutate(()=>prev)},[documentState.value,mutate])
 const redo=useCallback(()=>{const next=future.current.pop();const current=documentState.value;if(!next||!current)return;past.current.push(current);setHistoryVersion(v=>v+1);mutate(()=>next)},[documentState.value,mutate])
 /* Fit only after a successful load. Saves and local edits must not reset the camera. */
 useEffect(()=>{
  const parsed=documentState.value
  if(!parsed){fitted.current=false;setSel(null);setPicker(null);drag.current=null;setTempEdge(null);return}
  if(fitted.current)return;fitted.current=true
  if(parsed.nodes.length){const r=box.current?.getBoundingClientRect();const xs=parsed.nodes.map(n=>n.x),ys=parsed.nodes.map(n=>n.y)
   const w=Math.max(...xs)+NODE_W-Math.min(...xs),h=Math.max(...ys)+120-Math.min(...ys)
   const k=Math.min(1.2,Math.max(0.4,Math.min(((r?.width??800)-80)/w,((r?.height??600)-80)/h)))
   setCam({k,x:((r?.width??800)-w*k)/2-Math.min(...xs)*k,y:((r?.height??600)-h*k)/2-Math.min(...ys)*k})}
 },[documentState.value])
 const toWorld=useCallback((cx:number,cy:number)=>{const r=box.current!.getBoundingClientRect();return{x:(cx-r.left-cam.x)/cam.k,y:(cy-r.top-cam.y)/cam.k}},[cam])
 /* 指针：背景平移 / 节点拖动（只改视觉位置）/ 拉边 */
 const onPointerDown=(e:React.PointerEvent)=>{if(e.target===e.currentTarget||(e.target as HTMLElement).dataset.world){box.current?.focus({preventScroll:true});drag.current={mode:'pan',sx:e.clientX,sy:e.clientY,cam};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);setSel(null)}}
 const nodeDown=(e:React.PointerEvent,n:CanvasNodeV2)=>{if((e.target as HTMLElement).closest('input,textarea,button,[data-handle]'))return;e.stopPropagation();box.current?.focus({preventScroll:true});setSel({kind:'node',id:n.id});drag.current={mode:'node',id:n.id,sx:e.clientX,sy:e.clientY};box.current!.setPointerCapture(e.pointerId)}
 const handleDown=(e:React.PointerEvent,n:CanvasNodeV2)=>{e.stopPropagation();drag.current={mode:'edge',id:n.id,sx:e.clientX,sy:e.clientY};box.current!.setPointerCapture(e.pointerId)}
 const onPointerMove=(e:React.PointerEvent)=>{const d=drag.current;if(!d)return
  if(d.mode==='pan'&&d.cam)setCam({...d.cam,x:d.cam.x+e.clientX-d.sx,y:d.cam.y+e.clientY-d.sy})
  else if(d.mode==='node'&&d.id){const dx=(e.clientX-d.sx)/cam.k,dy=(e.clientY-d.sy)/cam.k;d.sx=e.clientX;d.sy=e.clientY;apply(c=>({...c,nodes:c.nodes.map(n=>n.id===d.id?{...n,x:n.x+dx,y:n.y+dy}:n)}),`move:${d.id}`)}
  else if(d.mode==='edge'&&d.id)setTempEdge({from:d.id,to:toWorld(e.clientX,e.clientY)})}
 const onPointerUp=(e:React.PointerEvent)=>{const d=drag.current;drag.current=null
  if(d?.mode==='edge'&&d.id){setTempEdge(null);const el=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-node]');const to=el?.dataset.node
   if(to&&to!==d.id)apply(c=>addCanvasEdge(c,d.id!,to))}}
 const onWheel=(e:React.WheelEvent)=>{const r=box.current!.getBoundingClientRect();const k=Math.min(1.8,Math.max(0.35,cam.k*Math.exp(-e.deltaY*0.0012)));const mx=e.clientX-r.left,my=e.clientY-r.top
  setCam({k,x:mx-(mx-cam.x)*(k/cam.k),y:my-(my-cam.y)*(k/cam.k)})}
 const addNode=(kind:CanvasNodeV2['kind'],at?:{x:number;y:number})=>{const r=box.current!.getBoundingClientRect();const p=at??toWorld(r.left+r.width/2+(Math.random()*80-40),r.top+r.height/2+(Math.random()*60-30))
  const node:CanvasNodeV2={id:crypto.randomUUID().slice(0,8),kind,title:kind==='chapter'?tr('新章节'):tr('新想法'),x:p.x-NODE_W/2,y:p.y-24}
  apply(c=>({...c,nodes:[...c.nodes,node]}));setSel({kind:'node',id:node.id})}
 /* 删除键与撤销只处理当前画布内的事件；隐藏画布不注册全局快捷键。 */
 const onKey=(e:React.KeyboardEvent)=>{if(!active)return
  if((e.key==='z'||e.key==='Z'||e.key==='y')&&(e.ctrlKey||e.metaKey)){if((e.target as HTMLElement).closest('input,textarea,[contenteditable]'))return;e.preventDefault();e.stopPropagation();if(e.shiftKey||e.key==='y')redo();else undo();return}
  if((e.key!=='Delete'&&e.key!=='Backspace')||!sel)return;if((e.target as HTMLElement).closest('input,textarea,button,a,[contenteditable]'))return
  e.preventDefault();e.stopPropagation()
  if(sel.kind==='node')apply(c=>removeCanvasNode(c,sel.id))
  else apply(c=>({...c,edges:c.edges.filter((_,i)=>String(i)!==sel.id)}));setSel(null)}
 const nodeById=useMemo(()=>new Map(canvas.nodes.map(n=>[n.id,n])),[canvas.nodes])
 const prompt=()=>canvasToPrompt(canvas,project)
 const copyPrompt=async()=>{setCopyError('');setCopied(false);try{await navigator.clipboard.writeText(prompt());setCopied(true);clearTimeout(copyTimer.current);copyTimer.current=setTimeout(()=>setCopied(false),1500)}catch{setCopyError(copy.copyFailed)}}
 const fitCanvas=()=>{const r=box.current?.getBoundingClientRect();if(!r?.width||!r.height)return
  if(!canvas.nodes.length){setCam({x:0,y:0,k:1});return}
  const xs=canvas.nodes.map(n=>n.x),ys=canvas.nodes.map(n=>n.y),left=Math.min(...xs),top=Math.min(...ys)
  const w=Math.max(...xs)+240-left,h=Math.max(...ys)+180-top
  const k=Math.min(1.2,Math.max(0.35,Math.min(Math.max(1,r.width-64)/w,Math.max(1,r.height-64)/h)))
  setCam({k,x:(r.width-w*k)/2-left*k,y:(r.height-h*k)/2-top*k})}
 const locateOnCanvas=(id:string)=>{const n=nodeById.get(id);if(!n)return;setView('canvas');setSel({kind:'node',id})
  const r=box.current?.getBoundingClientRect();if(!r)return
  setCam(c=>({k:c.k,x:r.width/2-(n.x+NODE_W/2)*c.k,y:r.height/2-(n.y+60)*c.k}))}
 const saveState=documentState.status
 const statusLabel=saveState==='saving'?messages.canvasSaving:saveState==='unsaved'?messages.canvasUnsaved:saveState==='new'?messages.canvasNew:''
 const blocked=saveState==='save-error'||saveState==='conflict'
 const selectedNode=sel?.kind==='node'?nodeById.get(sel.id):undefined
 const selectedEdge=sel?.kind==='edge'?canvas.edges[Number(sel.id)]:undefined
 const addEvidence=()=>{if(!selectedNode)return;setEvidenceError('')
  try{
   const evidence=newCanvasEvidence({path:evidenceForm.path.trim()||undefined,digest:evidenceForm.digest.trim()||undefined,excerpt:evidenceForm.excerpt.trim()||undefined,note:evidenceForm.note.trim()||undefined,workspace:evidenceForm.path.trim()?project:undefined})
   apply(c=>addNodeEvidence(c,selectedNode.id,evidence));setEvidenceForm({path:'',digest:'',excerpt:'',note:''})
  }catch{setEvidenceError(copy.invalidEvidence)}}
 const addNodeToContext=(n:CanvasNodeV2)=>{const digest=documentState.observedDigest()
  addContextItem(newContextItem({project,kind:'canvas-node',label:n.title||n.id,ref:`${CANVAS_PATH}#${n.id}`,
   source:{id:`ctx-${n.id}`,workspace:project,path:CANVAS_PATH,...(digest?{digest}:{})},...(digest?{digest}:{}) ,...(n.body?.trim()?{excerpt:n.body.trim().slice(0,200)}:{})}))}
 if(!documentState.value)return <div className="flex h-full min-h-0 flex-col p-4">
  <p role={saveState==='loading'?'status':'alert'} className="text-secondary text-ink-2">{saveState==='loading'?messages.canvasLoading:saveState==='invalid'?messages.canvasInvalid:messages.canvasLoadError}</p>
  <p className="mt-2 break-all text-caption text-ink-3">{project}/{CANVAS_PATH}</p>
  {documentState.error&&<p className="mt-2 break-words text-caption text-ink-3">{documentState.error}</p>}
  {saveState!=='loading'&&<div className="mt-3"><Button onClick={()=>documentState.reload()}>{messages.reloadCanvas}</Button></div>}
 </div>
 return <div className="relative flex h-full min-h-0 flex-col" data-canvas-save-state={saveState}>

  {/* 与右栏相同的 36px 工具行；窄列不把操作与保存状态叠在一起。 */}
  <div className="flex h-9 shrink-0 items-center gap-1 px-2" onKeyDown={onKey}>
   <Button size="xs" icon={BookOpen} onClick={()=>addNode('chapter')}>{tr("章节")}</Button>
   <Button size="xs" icon={Plus} onClick={()=>addNode('idea')}>{tr("想法")}</Button>
   <Button size="xs" aria-pressed={view==='canvas'} variant={view==='canvas'?'outline':'ghost'} onClick={()=>setView('canvas')}>{copy.canvas}</Button>
   <Button size="xs" icon={ListTree} aria-pressed={view==='outline'} variant={view==='outline'?'outline':'ghost'} onClick={()=>setView('outline')}>{copy.outline}</Button>
   <IconBtn icon={Undo2} label={copy.undo} disabled={!past.current.length&&!historyVersion} onClick={undo}/>
   <IconBtn icon={Redo2} label={copy.redo} disabled={!future.current.length} onClick={redo}/>
   {view==='canvas'&&<IconBtn icon={Expand} label={copy.fit} onClick={fitCanvas}/>}
   <span role="status" className="min-w-0 flex-1 truncate text-caption text-ink-3" title={`${project}/${CANVAS_PATH}`}>{statusLabel}</span>
   <IconBtn icon={Send} label={copy.addToDraft} onClick={()=>{native.appendDraft(prompt(),project);setActiveNav('chat');onRequestConversation?.()}}/>
   <RightMore label={copy.more}><Button size="xs" icon={Copy} onClick={()=>void copyPrompt()}>{copied?tr("已复制"):tr("复制提示词")}</Button></RightMore>
  </div>
  {blocked&&<div className="px-3 py-2">
   <p role="alert" className="text-secondary text-ink-2">{saveState==='conflict'?messages.canvasConflict:messages.canvasSaveError}</p>
   <p className="mt-1 break-words text-caption text-ink-3">{documentState.error}</p>
   <div className="mt-2 flex flex-wrap gap-1">
    {saveState==='save-error'&&<Button size="xs" onClick={documentState.retry}>{messages.retrySave}</Button>}
    <Button size="xs" onClick={()=>saveDownload(`${project}-thinking.canvas.local.json`,canvas)}>{messages.exportDraft}</Button>
    <Button size="xs" onClick={()=>{if(window.confirm(messages.discardConfirm))documentState.reload(true)}}>{messages.discardReload}</Button>
   </div>
  </div>}
  {copyError&&<p role="alert" className="px-2 pb-1 text-caption text-ink-3">{copyError}</p>}
  {view==='outline'?<OutlinePanel canvas={canvas} artifact={artifact} selected={sel?.kind==='node'?sel.id:null} locale={locale}
    onArtifact={setArtifact} onSelect={id=>setSel({kind:'node',id})} onLocate={locateOnCanvas} apply={apply}/>
  :<div ref={box} role="region" aria-label={copy.canvas} tabIndex={0} onKeyDown={onKey} className={cn('relative min-h-0 w-full flex-1 overflow-hidden focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-1px]',drag.current?.mode==='pan'?'cursor-grabbing':'cursor-default')} style={{backgroundImage:'radial-gradient(var(--line-strong) 1px,transparent 1px)',backgroundSize:`${24*cam.k}px ${24*cam.k}px`,backgroundPosition:`${cam.x}px ${cam.y}px`}}
   onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={()=>{drag.current=null;setTempEdge(null)}} onWheel={onWheel}
   onDoubleClick={e=>{if(e.target===e.currentTarget||(e.target as HTMLElement).dataset.world)addNode('idea',toWorld(e.clientX,e.clientY))}}>
   <div data-world="1" className="absolute left-0 top-0 h-0 w-0" style={{transform:`translate(${cam.x}px,${cam.y}px) scale(${cam.k})`}}>
    <svg className="pointer-events-none absolute overflow-visible" style={{left:0,top:0,width:1,height:1}}>
     {canvas.edges.map((e,i)=>{const a=nodeById.get(e.from),b=nodeById.get(e.to);if(!a||!b)return null
      const x1=a.x+NODE_W,y1=a.y+28,x2=b.x,y2=b.y+28,mx=(x1+x2)/2
      return <path key={i} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke={sel?.kind==='edge'&&sel.id===String(i)?'var(--ink)':e.relation?'var(--ink-2)':'var(--line-strong)'} strokeWidth={sel?.kind==='edge'&&sel.id===String(i)?2:1.5} strokeDasharray={e.relation?undefined:'4 4'} className="pointer-events-auto cursor-pointer" onClick={ev=>{ev.stopPropagation();box.current?.focus({preventScroll:true});setSel({kind:'edge',id:String(i)})}}/>})}
     {tempEdge&&(()=>{const a=nodeById.get(tempEdge.from);if(!a)return null;const x1=a.x+NODE_W,y1=a.y+28,mx=(x1+tempEdge.to.x)/2
      return <path d={`M${x1},${y1} C${mx},${y1} ${mx},${tempEdge.to.y} ${tempEdge.to.x},${tempEdge.to.y}`} fill="none" stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="4 4"/>})()}
    </svg>
    {canvas.edges.map((e,i)=>{if(!e.relation)return null;const a=nodeById.get(e.from),b=nodeById.get(e.to);if(!a||!b)return null
     return <span key={`label-${i}`} className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-md border border-line bg-panel px-1 py-0.5 text-caption text-ink-2" style={{left:(a.x+NODE_W+b.x)/2,top:(a.y+b.y)/2+28}}>{copy[RELATION_COPY[e.relation]]}</span>})}
    {canvas.nodes.map(n=>{const selected=sel?.kind==='node'&&sel.id===n.id
     return <div key={n.id} data-node={n.id} className={cn('absolute select-none rounded-xl border bg-panel shadow-pop transition-shadow',selected?'border-ink':'border-line',n.kind==='chapter'?'w-60':'w-56')} style={{left:n.x,top:n.y}} onPointerDown={e=>nodeDown(e,n)}>
      <div className="flex items-center gap-1.5 px-3 pt-2.5">
       {n.kind==='chapter'?<BookOpen size={13} strokeWidth={1.75} className="shrink-0 text-ink-3"/>:<span aria-hidden className="grid h-3.5 w-3.5 shrink-0 place-items-center text-ink-3"><span className="h-1.5 w-1.5 rounded-full bg-current"/></span>}
       <input aria-label={tr("节点标题")} className={cn('min-w-0 flex-1 bg-transparent outline-none',n.kind==='chapter'?'font-display text-[15px] tracking-tight':'text-body')} value={n.title} onChange={e=>apply(c=>({...c,nodes:c.nodes.map(x=>x.id===n.id?{...x,title:e.target.value}:x)}),`title:${n.id}`)}/>
       <span data-handle="1" title={tr("拖到另一节点建立关联")} className="grid h-4 w-4 shrink-0 cursor-crosshair place-items-center text-ink-3 hover:text-ink" onPointerDown={e=>handleDown(e,n)}><span className="h-2 w-2 rounded-full border border-current"/></span>
      </div>
      {(selected||n.body)&&<textarea aria-label={tr("节点正文")} placeholder={tr("补一句思路…")} rows={selected?3:1} className="mt-1 w-full resize-none bg-transparent px-3 pb-1 text-secondary text-ink-2 outline-none placeholder:text-ink-3" value={n.body??''} onChange={e=>apply(c=>({...c,nodes:c.nodes.map(x=>x.id===n.id?{...x,body:e.target.value}:x)}),`body:${n.id}`)}/>}
      <div className="flex items-center gap-1 px-2 pb-2 pt-1">
       {n.ref&&<button className="flex min-w-0 items-center gap-1 rounded-md bg-elevated px-1.5 py-0.5 text-caption text-ink-2 hover:text-ink" title={n.ref.path} onClick={()=>openDocument({workspace:'academic',path:n.ref!.path,title:n.ref!.title})}><Link2 size={11} strokeWidth={1.75} className="shrink-0"/><span className="truncate">{n.ref.title}</span></button>}
       {n.anchor&&<button className="flex min-w-0 items-center gap-1 rounded-md bg-elevated px-1.5 py-0.5 text-caption text-ink-2 hover:text-ink" title={n.anchor} onClick={()=>{try{openRightTab({kind:'file',target:fileTarget(project,project,'files',n.anchor!)})}catch(error){setCopyError(error instanceof Error?error.message:String(error))}}}><FileText size={11} strokeWidth={1.75} className="shrink-0"/><span className="truncate">{n.anchor.split('/').pop()}</span></button>}
       {Boolean(n.evidence?.length)&&<span className="rounded-md bg-elevated px-1.5 py-0.5 text-caption text-ink-3">{copy.evidence} {n.evidence!.length}</span>}
       {selected&&<span className="ml-auto flex shrink-0 gap-0.5">
        <button aria-label={tr("链接知识")} title={tr("链接知识")} className="grid h-6 w-6 place-items-center rounded-md text-ink-3 hover:bg-hover hover:text-ink" onClick={()=>setPicker({kind:'ref',node:n.id})}><Link2 size={12} strokeWidth={1.75}/></button>
        <button aria-label={tr("源稿锚点")} title={tr("源稿锚点")} className="grid h-6 w-6 place-items-center rounded-md text-ink-3 hover:bg-hover hover:text-ink" onClick={()=>{setPicker({kind:'anchor',node:n.id});if(!files.length)void request<{path:string;kind:string}[]>(`/workspaces/${encodeURIComponent(project)}/files?limit=200`).then(list=>setFiles(list.filter(f=>f.kind==='file').map(f=>f.path))).catch(()=>{})}}><FileText size={12} strokeWidth={1.75}/></button>
        <button aria-label={tr("删除节点")} title={tr("删除节点")} className="grid h-6 w-6 place-items-center rounded-md text-ink-3 hover:bg-hover hover:text-err" onClick={()=>{apply(c=>removeCanvasNode(c,n.id));setSel(null)}}><Trash2 size={12} strokeWidth={1.75}/></button>
       </span>}
      </div>
     </div>})}
   </div>
   {/* 选中检查器：语义关系 / 证据 / 写作约束；不复制节点正文。 */}
   {(selectedNode||selectedEdge)&&<aside className="absolute bottom-2 right-2 top-2 z-40 flex w-72 flex-col gap-3 overflow-y-auto rounded-xl border border-line bg-panel p-3 shadow-pop" data-canvas-inspector="">
    {selectedEdge&&sel&&<>
     <p className="text-caption font-medium uppercase tracking-[0.06em] text-ink-3">{copy.relation}</p>
     <p className="text-caption text-ink-3">{copy.relationHint}</p>
     <label className="block text-secondary text-ink-2">{copy.relation}
      <select className="ui-input mt-1 w-full" value={selectedEdge.relation??''} onChange={e=>apply(c=>setEdgeRelation(c,Number(sel.id),(e.target.value||undefined) as SemanticRelation|undefined))}>
       <option value="">{copy.plainRelation}</option>
       {SEMANTIC_RELATIONS.map(relation=><option key={relation} value={relation}>{copy[RELATION_COPY[relation]]}</option>)}
      </select>
     </label>
     <Button size="xs" onClick={()=>{apply(c=>({...c,edges:c.edges.filter((_,i)=>String(i)!==sel.id)}));setSel(null)}}>{copy.deleteEdge}</Button>
    </>}
    {selectedNode&&<>
     <div className="flex flex-wrap gap-1">
      <Button size="xs" icon={Crosshair} onClick={()=>setView('outline')}>{copy.locateOutline}</Button>
      <Button size="xs" onClick={()=>addNodeToContext(selectedNode)}>{copy.addToContext}</Button>
     </div>
     <section className="space-y-2">
      <p className="text-caption font-medium uppercase tracking-[0.06em] text-ink-3">{copy.evidence}</p>
      {(selectedNode.evidence??[]).map(item=><div key={item.id} className="space-y-1 rounded-md bg-elevated p-2 text-caption">
       <button type="button" className="block w-full truncate text-left text-ink-2 hover:underline" title={item.path??item.url} onClick={()=>item.path&&openResearchSource({id:item.id,path:item.path,workspace:item.workspace,digest:item.digest,excerpt:item.excerpt},{projectId:project,workspace:project})}>{item.path??item.url}</button>
       <p className="break-all text-ink-3">{item.digest??copy.unverifiable}{item.note?` · ${item.note}`:''}</p>
       {item.excerpt&&<blockquote className="whitespace-pre-wrap text-ink-2">{item.excerpt}</blockquote>}
       <IconBtn icon={Trash2} label={copy.removeFromOutline} onClick={()=>apply(c=>removeNodeEvidence(c,selectedNode.id,item.id))}/>
      </div>)}
      <div className="space-y-1">
       <input aria-label={copy.evidencePath} placeholder={copy.evidencePath} className="ui-input w-full" value={evidenceForm.path} onChange={e=>setEvidenceForm(f=>({...f,path:e.target.value}))}/>
       <input aria-label={copy.evidenceDigest} placeholder={copy.evidenceDigest} className="ui-input w-full" value={evidenceForm.digest} onChange={e=>setEvidenceForm(f=>({...f,digest:e.target.value}))}/>
       <input aria-label={copy.evidenceExcerpt} placeholder={copy.evidenceExcerpt} className="ui-input w-full" value={evidenceForm.excerpt} onChange={e=>setEvidenceForm(f=>({...f,excerpt:e.target.value}))}/>
       <input aria-label={copy.evidenceNote} placeholder={copy.evidenceNote} className="ui-input w-full" value={evidenceForm.note} onChange={e=>setEvidenceForm(f=>({...f,note:e.target.value}))}/>
       <Button size="xs" disabled={!evidenceForm.path.trim()} onClick={addEvidence}>{copy.addEvidence}</Button>
       {evidenceError&&<p role="alert" className="text-caption text-ink-3">{evidenceError}</p>}
      </div>
     </section>
     <section className="space-y-2">
      <p className="text-caption font-medium uppercase tracking-[0.06em] text-ink-3">{copy.writingConstraints}</p>
      {(['purpose','conditions','template'] as const).map(key=><label key={key} className="block text-secondary text-ink-2">{copy[key]}
       <textarea rows={2} className="ui-input mt-1 w-full resize-y" value={selectedNode.writing?.[key]??''} onChange={e=>apply(c=>setNodeWriting(c,selectedNode.id,key,e.target.value),`writing:${selectedNode.id}:${key}`)}/>
      </label>)}
     </section>
    </>}
   </aside>}
  </div>}
  {/* 引用/锚点选择器 */}
  {picker&&<div className="absolute inset-0 z-50 grid place-items-center bg-app/60" onClick={()=>setPicker(null)}>
   <div className="max-h-80 w-80 overflow-hidden rounded-xl border border-line bg-panel shadow-pop" onClick={e=>e.stopPropagation()}>
    <p className="border-b border-line px-3 py-2 text-caption font-medium uppercase tracking-[0.06em] text-ink-3">{picker.kind==='ref'?tr("链接知识库笔记"):tr("选择源稿文件")}</p>
    <div className="max-h-64 overflow-y-auto p-1">
     {picker.kind==='ref'?notes.map(note=><button key={note.path} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-secondary text-ink-2 hover:bg-hover hover:text-ink" onClick={()=>{apply(c=>({...c,nodes:c.nodes.map(x=>x.id===picker.node?{...x,ref:{path:note.path,title:note.title}}:x)}));setPicker(null)}}><Link2 size={12} strokeWidth={1.75} className="shrink-0 text-ink-3"/><span className="truncate">{note.title}</span></button>)
     :files.map(f=><button key={f} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-secondary text-ink-2 hover:bg-hover hover:text-ink" onClick={()=>{apply(c=>({...c,nodes:c.nodes.map(x=>x.id===picker.node?{...x,anchor:f}:x)}));setPicker(null)}}><FileText size={12} strokeWidth={1.75} className="shrink-0 text-ink-3"/><span className="truncate">{f}</span></button>)}
     {picker.kind==='ref'&&!notes.length&&<p className="px-2 py-3 text-caption text-ink-3">{tr("知识库还没有笔记。")}</p>}
    </div>
   </div>
  </div>}
 </div>
}
