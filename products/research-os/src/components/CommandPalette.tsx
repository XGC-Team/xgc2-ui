import {t as tr} from '../i18n'
import { readMarkPromptDockVisible, writeMarkPromptDockVisible } from '../devtools/mark-prompt/markPromptDockPreference'
import { useStartRevisionThread } from '../features/revision/useRevisionThread'
import { readDesignFocus, requestDesignFocus } from '../features/projects/design-focus'
import { findContentSession } from '../features/content/useContentDocument'
import { CONTENT_PATH } from '../features/content/content-model'
import { newContextItem } from '../features/projects/context-model'
import { useEffect, useRef, useState } from 'react'
import { FileText, Globe, Search } from 'lucide-react'
import { NAV_ITEMS, useWorkbench } from '../store'
import { looksLikeUrl, normalizeWebUrl } from '../lib/web'
import { useAcademicNotes } from '../features/resources/useAcademicNotes'
import { useNativeAgentSession } from '../features/chat/Session'
type PaletteAction={label:string;run:()=>void;icon?:'globe'|'note';hint?:string}
export function CommandPalette() {
 const {paletteOpen,setPaletteOpen,setActiveNav,toggleTheme,openResource,previewDocument,projectId,openCanvas,chatDock,setChatDock,chatFloat,setChatFloat,sideFloat,setSideFloat,openSettings,showConversation,locale,addContextItem}=useWorkbench();const native=useNativeAgentSession();const zh=locale==='zh';const [query,setQuery]=useState(''),[index,setIndex]=useState(0);const ref=useRef<HTMLInputElement>(null)
 const {notes}=useAcademicNotes()
 // 网址即动作：查询形如 URL/域名时，首条给出「打开网页」（局部地址栏已退场，这里是一入口）
 let webUrl='';if(looksLikeUrl(query)){try{webUrl=normalizeWebUrl(query)}catch{/* 非法地址不出动作 */}}
 const webAction:PaletteAction[]=webUrl?[{icon:'globe',label:`${tr('打开网页')}：${new URL(webUrl).host}`,run:()=>openResource({kind:'web',url:webUrl})}]:[]
 // 知识库笔记直达：全局搜索是唯一搜索入口，本地搜索框已退场
 const q=query.trim().toLowerCase()
 const noteActions:PaletteAction[]=q?notes.filter(n=>(n.title+' '+n.path).toLowerCase().includes(q)).slice(0,8).map(n=>({icon:'note',label:n.title,hint:n.path,run:()=>{setActiveNav('knowledge');previewDocument({workspace:'academic',path:n.path,title:n.title})}})):[]
 // Agent 原生命令：新线程、项目研究画布、三栏停靠、连接与模型——与页面导航同列，仍只有这一个入口
 const startRevision=useStartRevisionThread()
 const focus=readDesignFocus(),focusCard=focus&&focus.project===projectId?focus.cardIds[0]:undefined
 const focusObject=focusCard?findContentSession(projectId)?.snapshot().value?.objects.find(o=>o.id===focusCard):undefined
 const workbenchActions:PaletteAction[]=[
  {label:zh?'新线程':'New thread',hint:projectId||(zh?'通用对话':'General chat'),run:()=>{showConversation();native.newThread()}},
  ...(projectId?[{label:zh?'打开研究画布':'Open research canvas',hint:projectId,run:()=>openCanvas(projectId)},{label:zh?'新建修订线程':'New revision thread',hint:projectId,run:()=>void startRevision(projectId)},{label:zh?'打开修改审阅（稿件与画布差异）':'Open change review (manuscript & canvas diffs)',hint:projectId,run:()=>openResource({kind:'reviews',scope:{projectId,workspace:projectId}},'secondary')},{label:zh?'打开制品（PDF · 幻灯片 · 视频）':'Open artifacts (PDF · slides · video)',hint:projectId,run:()=>openResource({kind:'artifacts'},'secondary')}]:[]),
  // 作用于画布当前选中的卡片：加入对话上下文（版本化引用）/ 沉淀发现（定位到卡片，在检查器中保存到知识库）
  ...(projectId&&focusObject?[
   {label:zh?'将所选卡片加入对话':'Attach selected card to chat',hint:focusObject.title,run:()=>{const digest=findContentSession(projectId)?.snapshot().digest||undefined;addContextItem(newContextItem({project:projectId,kind:'canvas-node',label:focusObject.title,ref:`${CONTENT_PATH}#object/${focusObject.id}`,digest,excerpt:focusObject.body?.slice(0,200),source:{id:focusObject.id,path:CONTENT_PATH,workspace:projectId,digest,excerpt:focusObject.body?.slice(0,200)}}));showConversation()}},
   {label:zh?'沉淀发现到知识库':'Promote finding to knowledge',hint:focusObject.title,run:()=>{openResource({kind:'research',workspace:projectId,view:'canvas'},'primary');requestDesignFocus(projectId,[focusObject.id])}},
  ]:[]),
  {label:chatDock?(zh?'取消停靠讨论':'Undock discussion'):(zh?'停靠讨论（讨论 | 画布 | 制品）':'Dock discussion (discussion | canvas | artifact)'),run:()=>setChatDock(!chatDock)},
  {label:chatFloat?(zh?'停回讨论窗口':'Dock the discussion window'):(zh?'浮动讨论窗口':'Float the discussion'),run:()=>setChatFloat(!chatFloat)},
  {label:sideFloat?(zh?'停回并排区':'Dock the side pane'):(zh?'浮动并排区（PDF / 制品）':'Float the side pane (PDF / artifacts)'),run:()=>setSideFloat(!sideFloat)},
  ...(projectId?[{label:zh?'设计审阅（浮层）':'Design review (overlay)',hint:projectId,run:()=>{showConversation();useWorkbench.getState().setReviewDockOpen(!useWorkbench.getState().reviewDockOpen)}}]:[]),
  {label:zh?'连接与模型':'Connections & models',hint:tr('Settings'),run:()=>openSettings('connections')},
  {label:zh?'开发：显示/隐藏标注工具':'Developer: toggle mark tool',hint:'Mark · Herdr',run:()=>writeMarkPromptDockVisible(!readMarkPromptDockVisible())},
 ]
 const pageActions:PaletteAction[]=[...NAV_ITEMS.map((n):PaletteAction=>({label:tr(n.label),run:()=>setActiveNav(n.id)})),...workbenchActions,{label:tr("切换深浅主题"),run:toggleTheme}].filter(a=>(a.label+' '+(a.hint??'')).toLowerCase().includes(q))
 const actions:PaletteAction[]=[...webAction,...noteActions,...pageActions]
 useEffect(()=>{if(paletteOpen){setQuery('');setIndex(0);requestAnimationFrame(()=>ref.current?.focus())}},[paletteOpen])
 if(!paletteOpen)return null
 function run(i:number){actions[i]?.run();setPaletteOpen(false)}
 return <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[16vh] backdrop-blur-sm" onClick={()=>setPaletteOpen(false)}><div role="dialog" aria-modal="true" aria-label={tr("导航与命令")} className="w-[min(520px,92vw)] rounded-lg border border-line bg-panel p-2 shadow-pop" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')setPaletteOpen(false);if(e.key==='Tab'){e.preventDefault();ref.current?.focus()}}}>
 <div className="flex items-center gap-2 border-b border-line px-3"><Search size={16}/><input ref={ref} className="h-12 min-w-0 flex-1 bg-transparent outline-none" aria-label={tr("查找页面或命令")} placeholder={tr("查找页面或命令…")} value={query} onChange={e=>{setQuery(e.target.value);setIndex(0)}} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setIndex(i=>Math.min(i+1,actions.length-1))}if(e.key==='ArrowUp'){e.preventDefault();setIndex(i=>Math.max(i-1,0))}if(e.key==='Enter')run(index)}}/></div>
 {actions.map((a,i)=><button key={`${a.label}-${i}`} className={`ui-list-row ${i===index?'bg-active':''}`} onClick={()=>run(i)} onMouseEnter={()=>setIndex(i)}>{a.icon==='globe'&&<Globe size={13} strokeWidth={1.75} className="shrink-0 text-ink-3"/>}{a.icon==='note'&&<FileText size={13} strokeWidth={1.75} className="shrink-0 text-ink-3"/>}<span className="min-w-0 flex-1 truncate">{a.label}</span>{a.hint&&<span className="ml-2 shrink-0 truncate text-caption text-ink-3">{a.hint}</span>}</button>)}{!actions.length&&<p className="p-4 text-ink-3">{tr("没有匹配的页面或命令。")}</p>}
 </div></div>
}
