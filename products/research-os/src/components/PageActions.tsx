import {useEffect,useState,type ReactNode} from 'react'
import {createPortal} from 'react-dom'
import {useWorkbench,type NavId} from '../store'

/** Page actions share the workbench's single location bar. */
export function PageActions({page,children}:{page:NavId;children:ReactNode}){
 const active=useWorkbench(s=>s.activeNav===page)
 const [host,setHost]=useState<HTMLElement|null>(null)
 useEffect(()=>setHost(document.getElementById('workbench-page-actions')),[])
 return active&&host?createPortal(children,host):null
}
