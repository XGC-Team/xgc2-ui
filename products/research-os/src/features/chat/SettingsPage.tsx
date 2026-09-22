import {t as tr} from '../../i18n'
import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { AgentProviderSettings, type AgentSettings } from '@xgc2/agent-runtime/react'
import { nativeClient } from './client'
import { useNativeAgentSession } from './Session'
import { useWorkbench } from '../../store'
import { Tabs } from '../../components/ui'
/* 设置页：编辑排版——衬线页题 + 小节规线 + 行内标签左/控件右（28px 同轨），分隔用发丝线不用卡 */
function Section({title,children}:{title:string;children:React.ReactNode}){
 return <section aria-label={title} className="mb-10">
  <div className="mb-1 flex items-center gap-3"><h2 className="shrink-0 text-caption font-medium uppercase tracking-[0.08em] text-ink-3">{title}</h2><span aria-hidden className="h-px flex-1 bg-line"/></div>
  {children}
 </section>
}
function Row({label,children}:{label:string;children:React.ReactNode}){
 return <div className="flex h-12 items-center justify-between gap-4 border-b border-line last:border-b-0">
  <p className="text-body">{label}</p>
  <div className="shrink-0">{children}</div>
 </div>
}
export function SettingsPage(){
 const {locale,setLocale,theme,toggleTheme}=useWorkbench()
 const native=useNativeAgentSession();const [settings,setSettings]=useState<AgentSettings|null>(null),[error,setError]=useState('')
 useEffect(()=>{const c=new AbortController();nativeClient.getNativeSettings(c.signal).then(setSettings).catch(e=>{if(!c.signal.aborted)setError(e.message)});return()=>c.abort()},[])
 return <div className="h-full min-h-0 overflow-auto"><div className="mx-auto w-full max-w-[880px] px-8 pb-16 pt-10">
  <header className="mb-10">
   <h1 className="font-display text-[30px] leading-[1.2] tracking-tight">{tr("设置")}</h1>
   <p className="mt-2 text-secondary text-ink-3">{tr("外观、语言与供应者。")}</p>
  </header>
  {error&&<p role="alert" className="ui-error mb-6">{error}</p>}
  <Section title={tr("外观")}>
   <Row label={tr("主题")}><Tabs id="界面主题" variant="pill" className="ui-tabs-fill w-56" tabs={[{id:'light',label:tr("浅色"),icon:<Sun size={13} strokeWidth={1.75}/>},{id:'dark',label:tr("深色"),icon:<Moon size={13} strokeWidth={1.75}/>}]} active={theme} onChange={id=>{if(id!==theme)toggleTheme()}}/></Row>
   <Row label={tr("界面语言")}><select aria-label={tr("界面语言")} className="ui-select-compact w-56" value={locale} onChange={e=>setLocale(e.target.value as 'zh'|'en')}><option value="zh">简体中文</option><option value="en">English</option></select></Row>
  </Section>
  <Section title={tr("供应者")}>
   {settings?<AgentProviderSettings locale={locale} settings={settings} onSave={async update=>{setSettings(await nativeClient.updateNativeSettings(update));native.setRefresh(n=>n+1)}} onRefresh={async id=>{setSettings(await nativeClient.refreshNativeSettings(id));native.setRefresh(n=>n+1)}}/>:<p className="py-2 text-secondary text-ink-3">{tr("正在读取供应者设置…")}</p>}
  </Section>
 </div></div>
}
