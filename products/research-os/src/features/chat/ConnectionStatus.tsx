import {useState,useRef,useEffect} from 'react'
import {createPortal} from 'react-dom'
import {useNativeAgentSession} from './Session'
import {reconnectNativeSession} from './client'
import {PageActions} from '../../components/PageActions'
import {Button} from '../../components/ui'
import {t as tr} from '../../i18n'
export function ConnectionStatus(){
 const s=useNativeAgentSession(),[open,setOpen]=useState(false),[position,setPosition]=useState({top:0,right:0});const button=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null)
 const error=s.error||s.streamError||s.settingsError,disconnected=Boolean(s.session&&s.state.worker==='disconnected')
 const transportLost=Boolean(s.session&&s.connection.includes('连接中断'))
 const label=error?tr('需要处理'):disconnected?tr('会话待恢复'):transportLost?tr('正在恢复连接'):tr('已连接')
 useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(!panel.current?.contains(e.target as Node)&&!button.current?.contains(e.target as Node))setOpen(false)};const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};window.addEventListener('pointerdown',close);window.addEventListener('keydown',key);return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',key)}},[open])
 useEffect(()=>setOpen(false),[s.selectedId])
 if(!s.session&&!error)return null
 const reason=/Host restarted|Local host stopped/.test(s.disconnectReason)?tr('服务曾停止或重启，会话需要恢复；历史消息已保留。'):s.disconnectReason||tr('原生会话已断开，可恢复后继续。')
 return <><PageActions page="chat"><button ref={button} data-xgc-role="chat-connection-status" data-xgc-id="chat-connection-status" className="flex h-7 items-center gap-1.5 rounded-md px-2 text-caption hover:bg-hover" aria-expanded={open} onClick={()=>{const r=button.current!.getBoundingClientRect();setPosition({top:r.bottom+4,right:Math.max(8,window.innerWidth-r.right)});setOpen(!open)}}><span className={`h-1.5 w-1.5 rounded-full ${error||disconnected||transportLost?'bg-amber-500':'bg-emerald-500'}`}/>{label}</button></PageActions>{open&&createPortal(<div ref={panel} data-xgc-role="chat-connection-details" role="dialog" aria-label={tr('连接状态')} className="fixed z-50 w-80 max-w-[calc(100vw-16px)] rounded-md border border-line bg-panel p-3 text-secondary text-ink shadow-lg" style={position}>
 {error&&<p role="alert" className="mb-2 break-words">{error}</p>}{disconnected&&<p className="mb-2">{reason}</p>}{transportLost&&<p className="mb-2">{tr('正在恢复消息流，任务不会重发。')}</p>}{!error&&!disconnected&&!transportLost&&<p>{tr('消息流已连接。')}</p>}
 {s.streamError?<Button onClick={()=>s.setReload(n=>n+1)}>{tr('重新读取会话')}</Button>:disconnected&&<Button loading={s.busy} onClick={()=>void s.operation(()=>reconnectNativeSession(s.session!.id))}>{tr('恢复会话')}</Button>}
 </div>,document.body)}</>
}
