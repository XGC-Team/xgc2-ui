import {t as tr} from '../../i18n'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {BookOpen, Copy, FileText, Link2, Plus, Send, Trash2} from 'lucide-react'
import {request} from '../../lib/api'
import {useWorkbench} from '../../store'
import {useNativeAgentSession} from '../chat/Session'
import {useAcademicNotes} from '../resources/useAcademicNotes'
import {cn} from '../../lib/cn'
import {CANVAS_PATH,canvasToPrompt,emptyCanvas,parseCanvas,serializeCanvas,type CanvasNode,type ThinkingCanvas} from './canvas-model'
/* 思维白板：Origami 式节点画布。节点卡是 DOM（排版精度），连线是 SVG，点阵底随相机走。
   数据落项目仓库 thinking.canvas.json（git 版本化）；拓扑可导出为写作系统提示词。 */
type Cam={x:number;y:number;k:number}
type Sel={kind:'node'|'edge';id:string}|null
const NODE_W=224
export function ThinkingCanvas({project}:{project:string}) {
 const {openDocument,openRightTab,setActiveNav}=useWorkbench();const native=useNativeAgentSession();const {notes}=useAcademicNotes()
 const [canvas,setCanvas]=useState<ThinkingCanvas>(emptyCanvas),[cam,setCam]=useState<Cam>({x:0,y:0,k:1})
 const [sel,setSel]=useState<Sel>(null),[picker,setPicker]=useState<{kind:'ref'|'anchor';node:string}|null>(null)
 const [saveState,setSaveState]=useState<'saved'|'saving'|'error'|'loading'>('loading'),[copied,setCopied]=useState(false)
 const [files,setFiles]=useState<string[]>([])
 const box=useRef<HTMLDivElement>(null),digest=useRef<string|null>(null),hadFile=useRef(false),saveTimer=useRef<ReturnType<typeof setTimeout>>(undefined)
 const drag=useRef<{mode:'pan'|'node'|'edge';id?:string;sx:number;sy:number;cam?:Cam;cur?:{x:number;y:number}}|null>(null)
 const [tempEdge,setTempEdge]=useState<{from:string;to:{x:number;y:number}}|null>(null)
 /* 载入 */
 useEffect(()=>{setSaveState('loading');setCanvas(emptyCanvas());setSel(null);const c=new AbortController()
  request<{content:string;digest:string}>(`/workspaces/${encodeURIComponent(project)}/files/${CANVAS_PATH}`,{signal:c.signal})
   .then(d=>{if(c.signal.aborted)return;digest.current=d.digest;hadFile.current=true;const parsed=parseCanvas(d.content);setCanvas(parsed);setSaveState('saved')
    if(parsed.nodes.length){const r=box.current?.getBoundingClientRect();const xs=parsed.nodes.map(n=>n.x),ys=parsed.nodes.map(n=>n.y)
     const w=Math.max(...xs)+NODE_W-Math.min(...xs),h=Math.max(...ys)+120-Math.min(...ys)
     const k=Math.min(1.2,Math.max(0.4,Math.min(((r?.width??800)-80)/w,((r?.height??600)-80)/h)))
     setCam({k,x:((r?.width??800)-w*k)/2-Math.min(...xs)*k,y:((r?.height??600)-h*k)/2-Math.min(...ys)*k})}})
   .catch(()=>{if(!c.signal.aborted){digest.current=null;hadFile.current=false;setSaveState('saved')}})
  return()=>c.abort()},[project])
 /* 防抖保存 */
 const mutate=useCallback((fn:(c:ThinkingCanvas)=>ThinkingCanvas)=>{setCanvas(current=>{const next=fn(current)
  clearTimeout(saveTimer.current);setSaveState('saving')
  saveTimer.current=setTimeout(()=>{request<{digest:string}>(`/workspaces/${encodeURIComponent(project)}/files/${CANVAS_PATH}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:serializeCanvas(next),...(digest.current?{expectedDigest:digest.current}:{}),...(hadFile.current?{}:{createOnly:true})})}).then(d=>{digest.current=d.digest;hadFile.current=true;setSaveState('saved')}).catch(()=>setSaveState('error'))},600)
  return next})},[project])
 const toWorld=useCallback((cx:number,cy:number)=>{const r=box.current!.getBoundingClientRect();return{x:(cx-r.left-cam.x)/cam.k,y:(cy-r.top-cam.y)/cam.k}},[cam])
 /* 指针：背景平移 / 节点拖动 / 拉边 */
 const onPointerDown=(e:React.PointerEvent)=>{if(e.target===e.currentTarget||(e.target as HTMLElement).dataset.world){drag.current={mode:'pan',sx:e.clientX,sy:e.clientY,cam};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);setSel(null)}}
 const nodeDown=(e:React.PointerEvent,n:CanvasNode)=>{if((e.target as HTMLElement).closest('input,textarea,button,[data-handle]'))return;e.stopPropagation();setSel({kind:'node',id:n.id});drag.current={mode:'node',id:n.id,sx:e.clientX,sy:e.clientY};box.current!.setPointerCapture(e.pointerId)}
 const handleDown=(e:React.PointerEvent,n:CanvasNode)=>{e.stopPropagation();drag.current={mode:'edge',id:n.id,sx:e.clientX,sy:e.clientY};box.current!.setPointerCapture(e.pointerId)}
 const onPointerMove=(e:React.PointerEvent)=>{const d=drag.current;if(!d)return
  if(d.mode==='pan'&&d.cam)setCam({...d.cam,x:d.cam.x+e.clientX-d.sx,y:d.cam.y+e.clientY-d.sy})
  else if(d.mode==='node'&&d.id){const dx=(e.clientX-d.sx)/cam.k,dy=(e.clientY-d.sy)/cam.k;d.sx=e.clientX;d.sy=e.clientY;mutate(c=>({...c,nodes:c.nodes.map(n=>n.id===d.id?{...n,x:n.x+dx,y:n.y+dy}:n)}))}
  else if(d.mode==='edge'&&d.id)setTempEdge({from:d.id,to:toWorld(e.clientX,e.clientY)})}
 const onPointerUp=(e:React.PointerEvent)=>{const d=drag.current;drag.current=null
  if(d?.mode==='edge'&&d.id){setTempEdge(null);const el=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-node]');const to=el?.dataset.node
   if(to&&to!==d.id)mutate(c=>c.edges.some(x=>x.from===d.id&&x.to===to)?c:{...c,edges:[...c.edges,{from:d.id!,to}]})}}
 const onWheel=(e:React.WheelEvent)=>{const r=box.current!.getBoundingClientRect();const k=Math.min(1.8,Math.max(0.35,cam.k*Math.exp(-e.deltaY*0.0012)));const mx=e.clientX-r.left,my=e.clientY-r.top
  setCam({k,x:mx-(mx-cam.x)*(k/cam.k),y:my-(my-cam.y)*(k/cam.k)})}
 const addNode=(kind:CanvasNode['kind'],at?:{x:number;y:number})=>{const r=box.current!.getBoundingClientRect();const p=at??toWorld(r.left+r.width/2+(Math.random()*80-40),r.top+r.height/2+(Math.random()*60-30))
  const node:CanvasNode={id:crypto.randomUUID().slice(0,8),kind,title:kind==='chapter'?tr('新章节'):tr('新想法'),x:p.x-NODE_W/2,y:p.y-24}
  mutate(c=>({...c,nodes:[...c.nodes,node]}));setSel({kind:'node',id:node.id})}
 /* 删除键 */
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.key!=='Delete'&&e.key!=='Backspace')||!sel)return;if((e.target as HTMLElement).closest('input,textarea,[contenteditable]'))return
  if(sel.kind==='node')mutate(c=>({nodes:c.nodes.filter(n=>n.id!==sel.id),edges:c.edges.filter(x=>x.from!==sel.id&&x.to!==sel.id),version:1}))
  else mutate(c=>({...c,edges:c.edges.filter((_,i)=>String(i)!==sel.id)}));setSel(null)}
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[sel,mutate])
 const nodeById=useMemo(()=>new Map(canvas.nodes.map(n=>[n.id,n])),[canvas.nodes])
 const prompt=()=>canvasToPrompt(canvas,project)
 return <div className="relative h-full min-h-0">
  <div ref={box} className={cn('h-full w-full overflow-hidden',drag.current?.mode==='pan'?'cursor-grabbing':'cursor-default')} style={{backgroundImage:'radial-gradient(var(--line-strong) 1px,transparent 1px)',backgroundSize:`${24*cam.k}px ${24*cam.k}px`,backgroundPosition:`${cam.x}px ${cam.y}px`}}
   onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onWheel={onWheel}
   onDoubleClick={e=>{if(e.target===e.currentTarget||(e.target as HTMLElement).dataset.world)addNode('idea',toWorld(e.clientX,e.clientY))}}>
   <div data-world="1" className="absolute left-0 top-0 h-0 w-0" style={{transform:`translate(${cam.x}px,${cam.y}px) scale(${cam.k})`}}>
    <svg className="pointer-events-none absolute overflow-visible" style={{left:0,top:0,width:1,height:1}}>
     {canvas.edges.map((e,i)=>{const a=nodeById.get(e.from),b=nodeById.get(e.to);if(!a||!b)return null
      const x1=a.x+NODE_W,y1=a.y+28,x2=b.x,y2=b.y+28,mx=(x1+x2)/2
      return <path key={i} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke={sel?.kind==='edge'&&sel.id===String(i)?'var(--ink)':'var(--line-strong)'} strokeWidth={sel?.kind==='edge'&&sel.id===String(i)?2:1.5} className="pointer-events-auto cursor-pointer" onClick={ev=>{ev.stopPropagation();setSel({kind:'edge',id:String(i)})}}/>})}
     {tempEdge&&(()=>{const a=nodeById.get(tempEdge.from);if(!a)return null;const x1=a.x+NODE_W,y1=a.y+28,mx=(x1+tempEdge.to.x)/2
      return <path d={`M${x1},${y1} C${mx},${y1} ${mx},${tempEdge.to.y} ${tempEdge.to.x},${tempEdge.to.y}`} fill="none" stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="4 4"/>})()}
    </svg>
    {canvas.nodes.map(n=>{const selected=sel?.kind==='node'&&sel.id===n.id
     return <div key={n.id} data-node={n.id} className={cn('absolute select-none rounded-xl border bg-panel shadow-pop transition-shadow',selected?'border-ink':'border-line',n.kind==='chapter'?'w-60':'w-56')} style={{left:n.x,top:n.y}} onPointerDown={e=>nodeDown(e,n)}>
      <div className="flex items-center gap-1.5 px-3 pt-2.5">
       {n.kind==='chapter'?<BookOpen size={13} strokeWidth={1.75} className="shrink-0 text-ink-3"/>:<span aria-hidden className="grid h-3.5 w-3.5 shrink-0 place-items-center text-ink-3"><span className="h-1.5 w-1.5 rounded-full bg-current"/></span>}
       <input aria-label={tr("节点标题")} className={cn('min-w-0 flex-1 bg-transparent outline-none',n.kind==='chapter'?'font-display text-[15px] tracking-tight':'text-body')} value={n.title} onChange={e=>mutate(c=>({...c,nodes:c.nodes.map(x=>x.id===n.id?{...x,title:e.target.value}:x)}))}/>
       <span data-handle="1" title={tr("拖到另一节点建立关联")} className="grid h-4 w-4 shrink-0 cursor-crosshair place-items-center text-ink-3 hover:text-ink" onPointerDown={e=>handleDown(e,n)}><span className="h-2 w-2 rounded-full border border-current"/></span>
      </div>
      {(selected||n.body)&&<textarea aria-label={tr("节点正文")} placeholder={tr("补一句思路…")} rows={selected?3:1} className="mt-1 w-full resize-none bg-transparent px-3 pb-1 text-secondary text-ink-2 outline-none placeholder:text-ink-3" value={n.body??''} onChange={e=>mutate(c=>({...c,nodes:c.nodes.map(x=>x.id===n.id?{...x,body:e.target.value}:x)}))}/>}
      <div className="flex items-center gap-1 px-2 pb-2 pt-1">
       {n.ref&&<button className="flex min-w-0 items-center gap-1 rounded-md bg-elevated px-1.5 py-0.5 text-caption text-ink-2 hover:text-ink" title={n.ref.path} onClick={()=>openDocument({workspace:'academic',path:n.ref!.path,title:n.ref!.title})}><Link2 size={11} strokeWidth={1.75} className="shrink-0"/><span className="truncate">{n.ref.title}</span></button>}
       {n.anchor&&<button className="flex min-w-0 items-center gap-1 rounded-md bg-elevated px-1.5 py-0.5 text-caption text-ink-2 hover:text-ink" title={n.anchor} onClick={()=>openRightTab({kind:'file'})}><FileText size={11} strokeWidth={1.75} className="shrink-0"/><span className="truncate">{n.anchor.split('/').pop()}</span></button>}
       {selected&&<span className="ml-auto flex shrink-0 gap-0.5">
        <button aria-label={tr("链接知识")} title={tr("链接知识")} className="grid h-6 w-6 place-items-center rounded-md text-ink-3 hover:bg-hover hover:text-ink" onClick={()=>setPicker({kind:'ref',node:n.id})}><Link2 size={12} strokeWidth={1.75}/></button>
        <button aria-label={tr("源稿锚点")} title={tr("源稿锚点")} className="grid h-6 w-6 place-items-center rounded-md text-ink-3 hover:bg-hover hover:text-ink" onClick={()=>{setPicker({kind:'anchor',node:n.id});if(!files.length)void request<{path:string;kind:string}[]>(`/workspaces/${encodeURIComponent(project)}/files?limit=200`).then(list=>setFiles(list.filter(f=>f.kind==='file').map(f=>f.path))).catch(()=>{})}}><FileText size={12} strokeWidth={1.75}/></button>
        <button aria-label={tr("删除节点")} title={tr("删除节点")} className="grid h-6 w-6 place-items-center rounded-md text-ink-3 hover:bg-hover hover:text-err" onClick={()=>{mutate(c=>({nodes:c.nodes.filter(x=>x.id!==n.id),edges:c.edges.filter(x=>x.from!==n.id&&x.to!==n.id),version:1}));setSel(null)}}><Trash2 size={12} strokeWidth={1.75}/></button>
       </span>}
      </div>
     </div>})}
   </div>
  </div>
  {/* 工具行：加节点 + 导出提示词 */}
  <div className="absolute left-3 top-3 flex items-center gap-1 rounded-lg border border-line bg-panel/95 p-1 shadow-pop">
   <button className="flex h-7 items-center gap-1.5 rounded-md px-2 text-secondary text-ink-2 hover:bg-hover hover:text-ink" onClick={()=>addNode('chapter')}><BookOpen size={13} strokeWidth={1.75}/>{tr("章节")}</button>
   <button className="flex h-7 items-center gap-1.5 rounded-md px-2 text-secondary text-ink-2 hover:bg-hover hover:text-ink" onClick={()=>addNode('idea')}><Plus size={13} strokeWidth={1.75}/>{tr("想法")}</button>
   <span aria-hidden className="h-4 w-px bg-line"/>
   <button className="flex h-7 items-center gap-1.5 rounded-md px-2 text-secondary text-ink-2 hover:bg-hover hover:text-ink" onClick={()=>{void navigator.clipboard.writeText(prompt());setCopied(true);setTimeout(()=>setCopied(false),1500)}}><Copy size={13} strokeWidth={1.75}/>{copied?tr("已复制"):tr("复制提示词")}</button>
   <button className="flex h-7 items-center gap-1.5 rounded-md px-2 text-secondary text-ink-2 hover:bg-hover hover:text-ink" onClick={()=>{native.appendDraft(prompt());setActiveNav('chat')}}><Send size={13} strokeWidth={1.75}/>{tr("发送到对话")}</button>
  </div>
  <p role="status" className="absolute right-3 top-3 text-caption text-ink-3">{saveState==='saving'?tr("保存中…"):saveState==='error'?tr("保存失败，仍在重试"):saveState==='saved'&&canvas.nodes.length?tr("已保存"):''}</p>
  {/* 引用/锚点选择器 */}
  {picker&&<div className="absolute inset-0 z-50 grid place-items-center bg-app/60" onClick={()=>setPicker(null)}>
   <div className="max-h-80 w-80 overflow-hidden rounded-xl border border-line bg-panel shadow-pop" onClick={e=>e.stopPropagation()}>
    <p className="border-b border-line px-3 py-2 text-caption font-medium uppercase tracking-[0.06em] text-ink-3">{picker.kind==='ref'?tr("链接知识库笔记"):tr("选择源稿文件")}</p>
    <div className="max-h-64 overflow-y-auto p-1">
     {picker.kind==='ref'?notes.map(note=><button key={note.path} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-secondary text-ink-2 hover:bg-hover hover:text-ink" onClick={()=>{mutate(c=>({...c,nodes:c.nodes.map(x=>x.id===picker.node?{...x,ref:{path:note.path,title:note.title}}:x)}));setPicker(null)}}><Link2 size={12} strokeWidth={1.75} className="shrink-0 text-ink-3"/><span className="truncate">{note.title}</span></button>)
     :files.map(f=><button key={f} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-secondary text-ink-2 hover:bg-hover hover:text-ink" onClick={()=>{mutate(c=>({...c,nodes:c.nodes.map(x=>x.id===picker.node?{...x,anchor:f}:x)}));setPicker(null)}}><FileText size={12} strokeWidth={1.75} className="shrink-0 text-ink-3"/><span className="truncate">{f}</span></button>)}
     {picker.kind==='ref'&&!notes.length&&<p className="px-2 py-3 text-caption text-ink-3">{tr("知识库还没有笔记。")}</p>}
    </div>
   </div>
  </div>}
 </div>
}
