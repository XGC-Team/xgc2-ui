import {RightPanelActions,RightMore} from '../../components/RightPanelActions'
import {decodeAnnotation,encodeAnnotation,relativeRect,anchorPrompt,type PDFAnchor,type PDFRect} from './pdf-annotations'
import {listPDFVersions,type ManuscriptPDF} from './manuscript'
import {t as tr} from '../../i18n'
import {useEffect,useRef,useState} from 'react'
import {getDocument,GlobalWorkerOptions,TextLayer,type PDFDocumentProxy} from 'pdfjs-dist'
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {useWorkbench} from '../../store'
import {collection,post,request} from '../../lib/api'
import {Button,IconBtn} from '../../components/ui'
import {ChevronLeft,ChevronRight,Minus,Plus,Scan,MousePointer2,X,MessageSquare} from 'lucide-react'
GlobalWorkerOptions.workerSrc=worker
export default function PDFReader({onQuote}:{onQuote:(text:string,targetProject?:string)=>void}){
 const {pdf,openPDF,projectId,locale}=useWorkbench();const [document,setDocument]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[scale,setScale]=useState(1),[error,setError]=useState(''),[quote,setQuote]=useState(''),[comment,setComment]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0),[notes,setNotes]=useState<{id:string;page:number;body:string}[]>([])
 const [mode,setMode]=useState<'text'|'region'>('text'),[anchor,setAnchor]=useState<PDFAnchor|null>(null),[selectedNote,setSelectedNote]=useState<string|null>(null),[draftRect,setDraftRect]=useState<PDFRect|null>(null)
 const regionStart=useRef<{x:number;y:number}|null>(null)
 const [versions,setVersions]=useState<(ManuscriptPDF&{completedAt:string})[]>([]),[availableWidth,setAvailableWidth]=useState(0)
 useEffect(()=>{if(!pdf)return;const c=new AbortController();listPDFVersions(pdf.workspace,pdf.path,c.signal).then(data=>{if(!c.signal.aborted)setVersions(data)}).catch(e=>{if(!c.signal.aborted)setError(e.message)});return()=>c.abort()},[pdf])
 useEffect(()=>{if(pdf||!projectId)return;const c=new AbortController();listPDFVersions(projectId,undefined,c.signal).then(data=>{if(!c.signal.aborted&&data[0])openPDF(data[0])}).catch(e=>{if(!c.signal.aborted)setError(e.message)});return()=>c.abort()},[pdf,projectId,openPDF])
 const canvas=useRef<HTMLCanvasElement>(null),layer=useRef<HTMLDivElement>(null),paper=useRef<HTMLDivElement>(null),attempt=useRef<{body:string;key:string}|null>(null)
 useEffect(()=>{const el=paper.current?.parentElement;if(!el)return;const observer=new ResizeObserver(()=>setAvailableWidth(el.clientWidth));observer.observe(el);return()=>observer.disconnect()},[pdf])
 useEffect(()=>{setDocument(null);setPage(1);setError('');setQuote('');setComment('');setAnchor(null);setSelectedNote(null);setDraftRect(null);attempt.current=null;setNotes([]);if(!pdf)return;const task=getDocument(pdf.url);let alive=true;task.promise.then(doc=>{if(alive)setDocument(doc)}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false;void task.destroy()}},[pdf])
 useEffect(()=>{if(!document||!canvas.current||!layer.current)return;let alive=true;let cancel=()=>{};void document.getPage(page).then(async p=>{if(!alive)return;const width=paper.current?.parentElement?.clientWidth||380;const viewport=p.getViewport({scale:Math.max(.35,(width-24)/p.getViewport({scale:1}).width)*scale});const ratio=Math.min(2,devicePixelRatio||1);const el=canvas.current!,text=layer.current!;el.width=viewport.width*ratio;el.height=viewport.height*ratio;el.style.width=`${viewport.width}px`;el.style.height=`${viewport.height}px`;paper.current!.style.width=`${viewport.width}px`;text.innerHTML='';text.style.setProperty('--scale-factor',String(viewport.scale));const render=p.render({canvasContext:el.getContext('2d')!,viewport,transform:[ratio,0,0,ratio,0,0]});const textLayer=new TextLayer({container:text,viewport,textContentSource:p.streamTextContent()});cancel=()=>{render.cancel();textLayer.cancel()};await Promise.all([render.promise,textLayer.render()])}).catch(e=>{if(alive&&e.name!=='RenderingCancelledException')setError(e.message)});return()=>{alive=false;cancel()}},[document,page,scale,availableWidth])
 useEffect(()=>{setNotes([]);if(!pdf)return;const c=new AbortController();void collection<{id:string;title:string}>('/knowledge/items',c.signal).then(async items=>{const found=[];for(const item of items.filter(i=>i.title.startsWith('PDF 批注 · '))){const record=await request<{revisions:{body:string;authorRef:string}[]}>(`/knowledge/items/${item.id}`,{signal:c.signal});for(const revision of record.revisions){const prefix=`pdf:${pdf.workspace}:${pdf.digest}:`;if(revision.authorRef?.startsWith(prefix))found.push({id:item.id,page:Number(revision.authorRef.slice(prefix.length)),body:revision.body})}}if(!c.signal.aborted)setNotes(found)}).catch(e=>{if(!c.signal.aborted)setError(e.message)});return()=>c.abort()},[pdf,reload])
 async function annotate(){if(!pdf||!anchor||!comment.trim())return;setBusy(true);setError('');const body=encodeAnnotation(anchor,comment.trim());if(attempt.current?.body!==body)attempt.current={body,key:crypto.randomUUID()};try{await post(`/research/threads/${pdf.workspace}/knowledge-items`,{kind:'reading-note',title:`PDF 批注 · ${pdf.path} · ${page}`,body,authorKind:'human',authorRef:`pdf:${pdf.workspace}:${pdf.digest}:${page}`},attempt.current.key);setComment('');setAnchor(null);setQuote('');setReload(n=>n+1);attempt.current=null}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 function quoteInChat(text:string){if(!pdf)return;onQuote(`请根据以下 PDF 批注修改稿件 ${pdf.path}。\n项目：${pdf.workspace}\n构建：${pdf.buildId}\nPDF：${new URL(pdf.url,window.location.origin).href}\nPDF 版本：${pdf.digest}\n\n${text}`,pdf.workspace)}
 function resetSelection(){setAnchor(null);setSelectedNote(null);setComment('');setQuote('');window.getSelection()?.removeAllRanges()}
 useEffect(()=>{const close=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy){setAnchor(null);setSelectedNote(null);setComment('');setQuote('')}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[busy])
 function changePage(next:number){resetSelection();setPage(next)}
 function selectText(){
  if(mode!=='text'||busy||!paper.current)return
  const selection=window.getSelection();if(!selection?.rangeCount||!selection.toString().trim())return
  const range=selection.getRangeAt(0);if(!layer.current?.contains(range.startContainer)||!layer.current?.contains(range.endContainer))return
  const bounds=paper.current.getBoundingClientRect(),rects=Array.from(range.getClientRects()).map(r=>relativeRect(r,bounds)).filter(r=>r.width>.001&&r.height>.001)
  if(!rects.length)return
  const text=selection.toString().trim();setSelectedNote(null);setComment('');setQuote(text);setAnchor({schema:'research.pdf-anchor/v1',kind:'text',page,rects,quote:text,context:layer.current?.textContent?.slice(0,6000)||''})
 }
 function finishRegion(e:React.PointerEvent<HTMLDivElement>){
  const start=regionStart.current;regionStart.current=null;if(!start||!paper.current)return
  const bounds=paper.current.getBoundingClientRect();const rect=relativeRect({left:Math.min(start.x,e.clientX),top:Math.min(start.y,e.clientY),right:Math.max(start.x,e.clientX),bottom:Math.max(start.y,e.clientY)},bounds);setDraftRect(null)
  if(rect.width<.005||rect.height<.005)return
  const text=Array.from(layer.current?.querySelectorAll('span')||[]).filter(el=>{const r=relativeRect(el.getBoundingClientRect(),bounds);return r.x<rect.x+rect.width&&r.x+r.width>rect.x&&r.y<rect.y+rect.height&&r.y+r.height>rect.y}).map(el=>el.textContent).join(' ')
  setSelectedNote(null);setComment('');setQuote(text);setAnchor({schema:'research.pdf-anchor/v1',kind:'region',page,rects:[rect],quote:text,context:layer.current?.textContent?.slice(0,6000)||''})
 }
 const parsedNotes=notes.filter(n=>n.page===page).map(n=>({...n,...decodeAnnotation(n.body)}))
 const activeNote=parsedNotes.find(n=>n.id===selectedNote),activeAnchor=activeNote?.anchor||anchor
 const lastRect=activeAnchor?.rects.at(-1)
 const rectangleStyle=(r:PDFRect)=>({left:`${r.x*100}%`,top:`${r.y*100}%`,width:`${r.width*100}%`,height:`${r.height*100}%`})
 if(!pdf)return <div className="grid flex-1 place-content-center p-6 text-secondary text-ink-3">{tr("打开稿件并编译，即可阅读 PDF 和添加批注。")}</div>
 return <section aria-label={tr("PDF 阅读与批注")} data-xgc-role="pdf-reader" data-xgc-id={`${pdf.workspace}:${pdf.digest}`} className="flex min-h-0 flex-1 flex-col">
  <RightPanelActions><span className="min-w-0 flex-1 truncate text-caption" title={pdf.path}>{pdf.path.split('/').pop()}</span><IconBtn icon={ChevronLeft} label={tr('上一页')} disabled={page<=1} onClick={()=>changePage(page-1)}/><span className="shrink-0 text-caption">{page}/{document?.numPages||'…'}</span><IconBtn icon={ChevronRight} label={tr('下一页')} disabled={!document||page>=document.numPages} onClick={()=>changePage(page+1)}/><IconBtn icon={mode==='region'?MousePointer2:Scan} label={tr(mode==='region'?'文字批注':'框选批注')} onClick={()=>{resetSelection();setMode(mode==='text'?'region':'text')}}/><RightMore label={tr('PDF 操作')}>
   <label className="text-caption">{tr('PDF 版本')}<select aria-label={tr('PDF 版本')} className="ui-input mt-1" value={pdf.buildId} onChange={e=>{const version=versions.find(v=>v.buildId===e.target.value);if(version)openPDF(version)}}>{versions.length?versions.map(v=><option key={v.buildId} value={v.buildId}>{new Date(v.completedAt).toLocaleString(locale==='zh'?'zh-CN':'en-US')}</option>):<option value={pdf.buildId}>{tr('当前版本')}</option>}</select></label>
   <div className="flex items-center gap-2"><IconBtn icon={Minus} label={tr('缩小 PDF')} onClick={()=>setScale(s=>Math.max(.5,s-.2))}/><span className="text-caption">{Math.round(scale*100)}%</span><IconBtn icon={Plus} label={tr('放大 PDF')} onClick={()=>setScale(s=>Math.min(3,s+.2))}/></div><a href={pdf.url} target="_blank" rel="noreferrer" className="text-caption">{tr('打开原件')}</a>
   {parsedNotes.filter(n=>!n.anchor).map(n=><button key={n.id} className="ui-list-row" onClick={()=>{setSelectedNote(n.id);setAnchor({schema:'research.pdf-anchor/v1',kind:'page',page,rects:[],quote:'',context:''})}}>{tr('页面批注')} · {n.comment.slice(0,40)}</button>)}
  </RightMore></RightPanelActions>
  {error&&<p role="alert" className="ui-error">{error}</p>}
  <div className="min-h-0 flex-1 overflow-auto bg-inset p-3" data-xgc-role="pdf-viewport"><div ref={paper} data-xgc-role="pdf-page" data-xgc-id={`${pdf.digest}:page:${page}`} className="relative mx-auto bg-white" onMouseUp={selectText}>
   <canvas ref={canvas}/><div ref={layer} className="research-pdf-text absolute inset-0"/>
   {mode==='region'&&<div data-xgc-role="pdf-region-selector" className="absolute inset-0 z-10 cursor-crosshair" style={{touchAction:'none'}} onPointerDown={e=>{if(e.button!==0||busy)return;regionStart.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{const start=regionStart.current;if(start&&paper.current)setDraftRect(relativeRect({left:Math.min(start.x,e.clientX),top:Math.min(start.y,e.clientY),right:Math.max(start.x,e.clientX),bottom:Math.max(start.y,e.clientY)},paper.current.getBoundingClientRect()))}} onPointerUp={finishRegion} onPointerCancel={()=>{regionStart.current=null;setDraftRect(null)}}/>}
   {parsedNotes.filter(n=>n.anchor).map((note,index)=><div key={note.id}>{note.anchor!.rects.map((r,i)=><button key={i} aria-label={`${tr('查看批注')} ${index+1}`} data-xgc-role="pdf-annotation-mark" data-xgc-id={`${note.id}:${i}`} title={note.comment} className="absolute z-20 border border-amber-500/70 bg-amber-300/25 hover:bg-amber-300/40" style={rectangleStyle(r)} onClick={()=>{setAnchor(null);setSelectedNote(note.id)}}/>)}</div>)}
   {(draftRect?[draftRect]:anchor?.rects||[]).map((r,i)=><div key={i} className="pointer-events-none absolute z-20 border border-sky-500 bg-sky-300/20" style={rectangleStyle(r)}/>)}
   {(anchor||activeNote)&&<div data-xgc-role="pdf-annotation-editor" data-xgc-id="pdf-annotation-editor" className="absolute z-30 w-72 max-w-full rounded-md border border-line bg-panel p-3 text-ink shadow-lg" style={{left:`${Math.min(lastRect?.x||0,Math.max(0,1-288/(paper.current?.clientWidth||380)))*100}%`,...(lastRect&&lastRect.y>.55?{bottom:`${(1-lastRect.y)*100}%`}:{top:`${Math.min(.75,(lastRect?.y||0)+(lastRect?.height||0))*100}%`})}} onMouseUp={e=>e.stopPropagation()}>
    <div className="mb-2 flex items-center gap-2 text-caption"><MessageSquare size={12}/><span className="flex-1">{tr(activeAnchor?.kind==='region'?'区域批注':'原文批注')}</span><IconBtn icon={X} label={tr('关闭批注')} disabled={busy} onClick={resetSelection}/></div>
    {(activeAnchor?.quote||quote)&&<blockquote className="mb-2 max-h-20 overflow-auto border-l-2 border-line pl-2 text-caption text-ink-2">{activeAnchor?.quote||quote}</blockquote>}
    {activeNote?<><p className="whitespace-pre-wrap text-secondary">{activeNote.comment}</p><Button className="mt-2" onClick={()=>quoteInChat(activeNote.anchor?anchorPrompt(activeNote.anchor,activeNote.comment):activeNote.body)}>{tr('按此批注修改')}</Button></>:<><textarea autoFocus data-xgc-role="pdf-annotation-comment" data-xgc-id="pdf-annotation-comment" aria-label={tr('PDF 批注')} placeholder={tr('描述这里需要如何修改…')} className="ui-input" rows={3} disabled={busy} value={comment} onChange={e=>setComment(e.target.value)}/><div className="mt-2 flex gap-2"><Button variant="solid" loading={busy} disabled={!comment.trim()} onClick={()=>void annotate()}>{tr('保存批注')}</Button><Button disabled={!comment.trim()||!anchor||busy} onClick={()=>anchor&&quoteInChat(anchorPrompt(anchor,comment.trim()))}>{tr('引用到 Chat')}</Button></div></>}
   </div>}
  </div></div>
 </section>
}
