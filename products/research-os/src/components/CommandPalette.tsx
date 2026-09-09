import {t as tr} from '../i18n'
import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { NAV_ITEMS, useWorkbench } from '../store'
export function CommandPalette() {
 const {paletteOpen,setPaletteOpen,setActiveNav,openChat,toggleTheme}=useWorkbench();const [query,setQuery]=useState(''),[index,setIndex]=useState(0);const ref=useRef<HTMLInputElement>(null)
 const actions=[...NAV_ITEMS.map(n=>({label:tr(n.label),run:()=>n.id==='chat'?openChat():setActiveNav(n.id)})),{label:tr("切换深浅主题"),run:toggleTheme}].filter(a=>a.label.toLowerCase().includes(query.toLowerCase()))
 useEffect(()=>{if(paletteOpen){setQuery('');setIndex(0);requestAnimationFrame(()=>ref.current?.focus())}},[paletteOpen])
 if(!paletteOpen)return null
 function run(i:number){actions[i]?.run();setPaletteOpen(false)}
 return <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[16vh] backdrop-blur-sm" onClick={()=>setPaletteOpen(false)}><div role="dialog" aria-modal="true" aria-label={tr("导航与命令")} className="w-[min(520px,92vw)] rounded-lg border border-line bg-panel p-2 shadow-pop" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')setPaletteOpen(false);if(e.key==='Tab'){e.preventDefault();ref.current?.focus()}}}>
 <div className="flex items-center gap-2 border-b border-line px-3"><Search size={16}/><input ref={ref} className="h-12 min-w-0 flex-1 bg-transparent outline-none" aria-label={tr("查找页面或命令")} placeholder={tr("查找页面或命令…")} value={query} onChange={e=>{setQuery(e.target.value);setIndex(0)}} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setIndex(i=>Math.min(i+1,actions.length-1))}if(e.key==='ArrowUp'){e.preventDefault();setIndex(i=>Math.max(i-1,0))}if(e.key==='Enter')run(index)}}/></div>
 {actions.map((a,i)=><button key={a.label} className={`ui-list-row ${i===index?'bg-active':''}`} onClick={()=>run(i)} onMouseEnter={()=>setIndex(i)}>{a.label}</button>)}{!actions.length&&<p className="p-4 text-ink-3">{tr("没有匹配的页面或命令。")}</p>}
 </div></div>
}
