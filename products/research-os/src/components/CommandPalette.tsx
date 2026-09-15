import {t as tr} from '../i18n'
import { useEffect, useRef, useState } from 'react'
import { FileText, Globe, Search } from 'lucide-react'
import { NAV_ITEMS, useWorkbench } from '../store'
import { looksLikeUrl, normalizeWebUrl } from '../lib/web'
import { useAcademicNotes } from '../features/resources/useAcademicNotes'
type PaletteAction={label:string;run:()=>void;icon?:'globe'|'note';hint?:string}
export function CommandPalette() {
 const {paletteOpen,setPaletteOpen,setActiveNav,openChat,toggleTheme,openRightTab,previewDocument}=useWorkbench();const [query,setQuery]=useState(''),[index,setIndex]=useState(0);const ref=useRef<HTMLInputElement>(null)
 const {notes}=useAcademicNotes()
 // 网址即动作：查询形如 URL/域名时，首条给出「打开网页」（局部地址栏已退场，这里是一入口）
 let webUrl='';if(looksLikeUrl(query)){try{webUrl=normalizeWebUrl(query)}catch{/* 非法地址不出动作 */}}
 const webAction:PaletteAction[]=webUrl?[{icon:'globe',label:`${tr('打开网页')}：${new URL(webUrl).host}`,run:()=>openRightTab({kind:'web',url:webUrl})}]:[]
 // 知识库笔记直达：全局搜索是唯一搜索入口，本地搜索框已退场
 const q=query.trim().toLowerCase()
 const noteActions:PaletteAction[]=q?notes.filter(n=>(n.title+' '+n.path).toLowerCase().includes(q)).slice(0,8).map(n=>({icon:'note',label:n.title,hint:n.path,run:()=>{setActiveNav('knowledge');previewDocument({workspace:'academic',path:n.path,title:n.title})}})):[]
 const pageActions:PaletteAction[]=[...NAV_ITEMS.map(n=>({label:tr(n.label),run:()=>{if(n.id==='chat')openChat();else setActiveNav(n.id)}})),{label:tr("切换深浅主题"),run:toggleTheme}].filter(a=>a.label.toLowerCase().includes(q))
 const actions:PaletteAction[]=[...webAction,...noteActions,...pageActions]
 useEffect(()=>{if(paletteOpen){setQuery('');setIndex(0);requestAnimationFrame(()=>ref.current?.focus())}},[paletteOpen])
 if(!paletteOpen)return null
 function run(i:number){actions[i]?.run();setPaletteOpen(false)}
 return <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[16vh] backdrop-blur-sm" onClick={()=>setPaletteOpen(false)}><div role="dialog" aria-modal="true" aria-label={tr("导航与命令")} className="w-[min(520px,92vw)] rounded-lg border border-line bg-panel p-2 shadow-pop" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')setPaletteOpen(false);if(e.key==='Tab'){e.preventDefault();ref.current?.focus()}}}>
 <div className="flex items-center gap-2 border-b border-line px-3"><Search size={16}/><input ref={ref} className="h-12 min-w-0 flex-1 bg-transparent outline-none" aria-label={tr("查找页面或命令")} placeholder={tr("查找页面或命令…")} value={query} onChange={e=>{setQuery(e.target.value);setIndex(0)}} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setIndex(i=>Math.min(i+1,actions.length-1))}if(e.key==='ArrowUp'){e.preventDefault();setIndex(i=>Math.max(i-1,0))}if(e.key==='Enter')run(index)}}/></div>
 {actions.map((a,i)=><button key={`${a.label}-${i}`} className={`ui-list-row ${i===index?'bg-active':''}`} onClick={()=>run(i)} onMouseEnter={()=>setIndex(i)}>{a.icon==='globe'&&<Globe size={13} strokeWidth={1.75} className="shrink-0 text-ink-3"/>}{a.icon==='note'&&<FileText size={13} strokeWidth={1.75} className="shrink-0 text-ink-3"/>}<span className="min-w-0 flex-1 truncate">{a.label}</span>{a.hint&&<span className="ml-2 shrink-0 truncate text-caption text-ink-3">{a.hint}</span>}</button>)}{!actions.length&&<p className="p-4 text-ink-3">{tr("没有匹配的页面或命令。")}</p>}
 </div></div>
}
