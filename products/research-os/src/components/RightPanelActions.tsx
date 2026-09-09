import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react'
import {createPortal} from 'react-dom'
import {MoreHorizontal} from 'lucide-react'
export const RightActionHost=createContext<HTMLElement|null>(null)
export function RightPanelActions({children}:{children:ReactNode}){const host=useContext(RightActionHost);return host?createPortal(children,host):null}
export function RightMore({label,children}:{label:string;children:ReactNode}){
 const [open,setOpen]=useState(false);const ref=useRef<HTMLDivElement>(null)
 useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false)};const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key)}},[open])
 return <div ref={ref} className="shrink-0"><button className="grid h-7 w-7 place-items-center rounded-md text-ink-2 hover:bg-hover" aria-label={label} title={label} aria-expanded={open} onClick={()=>setOpen(!open)}><MoreHorizontal size={14}/></button>{open&&<div role="dialog" aria-label={label} className="absolute right-2 top-full z-50 mt-1 flex w-60 flex-col gap-2 rounded-md border border-line bg-panel p-3 shadow-lg">{children}</div>}</div>
}
