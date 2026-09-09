import {t as tr} from '../i18n'
import { Moon, PanelBottom, PanelLeft, PanelRight, Sun } from 'lucide-react'
import { useWorkbench } from '../store'
import { IconBtn } from './ui'
// Compact application bar with workspace search and panel controls.
export function TopBar({onToggleLeft,onToggleRight,onToggleBottom}:{onToggleLeft:()=>void;onToggleRight:()=>void;onToggleBottom:()=>void}) {
 const {theme,toggleTheme}=useWorkbench()
 return <header className="relative z-30 flex h-app-header shrink-0 items-center gap-3 border-b border-line bg-panel px-3 transition-colors duration-300">
   <div className="hidden shrink-0 whitespace-nowrap text-body font-semibold tracking-tight md:block">{tr("AI Research Workbench")}</div>
   <div className="ml-auto flex items-center gap-1.5"><IconBtn icon={theme==='light'?Moon:Sun} label={tr("切换主题")} onClick={toggleTheme}/><div className="mx-1 h-5 w-px bg-line"/><IconBtn icon={PanelLeft} label={tr("切换侧栏")} onClick={onToggleLeft}/><IconBtn icon={PanelBottom} label={tr("切换下栏（⌘J）")} onClick={onToggleBottom}/><IconBtn icon={PanelRight} label={tr("切换浏览器右栏")} onClick={onToggleRight}/></div>
 </header>
}
