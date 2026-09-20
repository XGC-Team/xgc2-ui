import {t as tr} from '../i18n'
import {useLayoutEffect,useRef,useState} from 'react'
import {IconChat,IconKnowledge,IconSettings,IconWorkflow} from './icons'
import {NAV_ITEMS,useWorkbench,type NavId} from '../store'
import {cn} from '../lib/cn'
/* 常驻顶层菜单栏：48px 图标 rail。当前左栏是它的二级面板。
   选中标记为实测位置的滑动墨条；tooltip 为延迟浮现的墨丸。 */
const icons:Record<NavId,typeof IconChat>={chat:IconChat,workflow:IconWorkflow,knowledge:IconKnowledge,settings:IconSettings}
function RailButton({id,active,onClick}:{id:NavId;active:boolean;onClick:()=>void}){
 const Icon=icons[id];const label=tr(NAV_ITEMS.find(n=>n.id===id)!.label)
 return <button type="button" data-tip={label} aria-current={active?'page':undefined} aria-label={label} onClick={onClick}
  className={cn('ui-rail-btn grid h-9 w-9 place-items-center rounded-lg transition-all duration-150 active:scale-90',active?'bg-active text-ink':'text-ink-3 hover:bg-hover hover:text-ink')}>
  <Icon size={17} strokeWidth={1.75}/>
 </button>
}
export function Rail(){
 const {activeNav,setActiveNav}=useWorkbench()
 const box=useRef<HTMLElement>(null)
 const [marker,setMarker]=useState<{y:number;on:boolean}>({y:0,on:false})
 useLayoutEffect(()=>{const el=box.current?.querySelector<HTMLElement>('[aria-current="page"]');setMarker(el?{y:el.offsetTop+10,on:true}:{y:0,on:false})},[activeNav])
 const top=NAV_ITEMS.filter(n=>n.id!=='settings')
 return <nav ref={box} aria-label={tr("顶层菜单")} className="relative flex w-12 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-2">
  <span aria-hidden className={cn('ui-nav-marker',marker.on?'opacity-100':'opacity-0')} style={{transform:`translateY(${marker.y}px)`}}/>
  {top.map(n=><RailButton key={n.id} id={n.id} active={activeNav===n.id} onClick={()=>setActiveNav(n.id)}/>)}
  <div className="mt-auto"><RailButton id="settings" active={activeNav==='settings'} onClick={()=>setActiveNav('settings')}/></div>
 </nav>
}
