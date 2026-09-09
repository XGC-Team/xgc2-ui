import {t as tr} from '../i18n'
import {useEffect,useRef,useState} from 'react'
import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import {Plus,X,RotateCw} from 'lucide-react'
import {IconBtn} from './ui'
import {post,request} from '../lib/api'
import {useWorkbench} from '../store'
type Shell={id:string;workspaceId:string;exited:boolean}
export function TerminalPanel(){
 const {projectId,theme}=useWorkbench();const workspace=projectId||'academic'
 const [shells,setShells]=useState<Shell[]>([]),[selected,setSelected]=useState(''),[error,setError]=useState(''),[reload,setReload]=useState(0),[busy,setBusy]=useState(false)
 const currentWorkspace=useRef(workspace);currentWorkspace.current=workspace
 const selectedShell=shells.find(s=>s.id===selected)
 useEffect(()=>{const c=new AbortController();setShells([]);setSelected('');setError('');request<Shell[]>(`/terminals?workspaceId=${encodeURIComponent(workspace)}`,{signal:c.signal}).then(data=>{if(!c.signal.aborted){setShells(data);setSelected(data[0]?.id||'')}}).catch(e=>{if(!c.signal.aborted)setError(e.message)});return()=>c.abort()},[workspace])
 async function create(){setBusy(true);setError('');try{const next=await post<Shell>('/terminals',{workspaceId:workspace});if(currentWorkspace.current===workspace){setShells(current=>[...current,next]);setSelected(next.id)}}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 async function close(id:string){try{await post(`/terminals/${id}/close`,{});setShells(current=>current.filter(s=>s.id!==id));if(selected===id)setSelected(shells.find(s=>s.id!==id)?.id||'')}catch(e){setError(e instanceof Error?e.message:String(e))}}
 return <section className="flex h-full min-h-0 flex-col bg-panel text-ink" aria-label="交互终端">
   <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-2 text-caption"><span className="mr-2 truncate text-ink-3">{workspace}</span>{shells.map((s,i)=><div key={s.id} className={`flex items-center rounded ${selected===s.id?'bg-active':''}`}><button className="px-2 py-1" onClick={()=>setSelected(s.id)}>{tr('终端')} {i+1}</button><IconBtn icon={X} label={`关闭终端 ${i+1}`} onClick={()=>void close(s.id)}/></div>)}<IconBtn icon={Plus} label={tr("新建终端")} disabled={busy} onClick={()=>void create()}/><IconBtn icon={RotateCw} label={tr("重新连接终端")} disabled={!selected} onClick={()=>setReload(n=>n+1)}/></div>
   {error&&<p role="alert" className="ui-error">{error}</p>}
   {selectedShell?<ShellView key={`${selected}:${reload}`} id={selected} theme={theme}/>:<div className="flex flex-1 items-center justify-center"><button className="rounded-md border border-line px-3 py-1.5 text-secondary hover:bg-hover" disabled={busy} onClick={()=>void create()}>{busy?tr("正在启动…"):tr("打开终端")}</button></div>}
 </section>
}
function ShellView({id,theme}:{id:string;theme:'light'|'dark'}){
 const host=useRef<HTMLDivElement>(null),terminal=useRef<Terminal|null>(null)
 const [status,setStatus]=useState(tr("正在连接…"))
 const palette=()=>theme==='dark'?{background:'#131316',foreground:'#e4e4e7',cursor:'#fafafa',selectionBackground:'#52525b'}:{background:'#ffffff',foreground:'#27272a',cursor:'#18181b',selectionBackground:'#d4d4d8'}
 useEffect(()=>{
   let disposed=false
   const term=new Terminal({fontFamily:'"JetBrains Mono", monospace',fontSize:12,lineHeight:1.2,cursorBlink:true,scrollback:5000,theme:palette()});const fit=new FitAddon();term.loadAddon(fit);term.open(host.current!);terminal.current=term
   const socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/api/v1/terminals/${id}/ws`);socket.binaryType='arraybuffer'
   const send=(value:unknown)=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(value))}
   const resize=()=>{if(!disposed&&host.current?.clientWidth&&host.current?.clientHeight){fit.fit();send({type:'resize',cols:term.cols,rows:term.rows})}}
   socket.onopen=()=>{setStatus('');resize();term.focus()}
   socket.onmessage=e=>{if(!disposed&&e.data instanceof ArrayBuffer)term.write(new Uint8Array(e.data))}
   socket.onerror=()=>setStatus(tr("终端连接失败"))
   socket.onclose=()=>setStatus(tr("终端已断开，可重新连接或新建终端"))
   const input=term.onData(data=>send({type:'input',data}));const observer=new ResizeObserver(resize);observer.observe(host.current!);resize()
   return()=>{disposed=true;socket.onmessage=null;socket.onopen=null;socket.onclose=null;socket.onerror=null;socket.close();observer.disconnect();input.dispose();term.dispose();terminal.current=null}
 },[id])
 useEffect(()=>{if(terminal.current)terminal.current.options.theme=palette()},[theme])
 return <div className="relative min-h-0 flex-1 p-2">{status&&<div role="status" className="absolute right-3 top-2 z-10 rounded bg-panel px-2 text-caption text-ink-3">{status}</div>}<div ref={host} className="h-full w-full"/></div>
}
