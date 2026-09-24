import {t as tr} from '../../i18n'
import { useEffect, useRef, useState } from 'react'
import { AgentProviderSettings, type AgentSettings } from '@xgc2/agent-runtime/react'
import { nativeClient } from './client'
import { useNativeAgentSession } from './Session'
import { useWorkbench } from '../../store'
/* 设置页：编辑排版——衬线页题 + 小节规线 + 行内标签左/控件右（28px 同轨），分隔用发丝线不用卡 */
function Section({id,title,children}:{id:string;title:string;children:React.ReactNode}){
 return <section id={`settings-${id}`} aria-label={title} className="mb-10 scroll-mt-6">
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
 const {locale,setLocale,theme,toggleTheme,settingsFocus}=useWorkbench();const root=useRef<HTMLDivElement>(null)
 // Deep links (sidebar, agent roster, palette) scroll to their section; the nonce makes repeated requests work.
 useEffect(()=>{if(settingsFocus)root.current?.querySelector(`#settings-${settingsFocus.section}`)?.scrollIntoView({block:'start',behavior:'smooth'})},[settingsFocus])
 const native=useNativeAgentSession();const [settings,setSettings]=useState<AgentSettings|null>(null),[error,setError]=useState('')
 useEffect(()=>{const c=new AbortController();nativeClient.getNativeSettings(c.signal).then(setSettings).catch(e=>{if(!c.signal.aborted)setError(e.message)});return()=>c.abort()},[])
 return <div ref={root} className="h-full min-h-0 overflow-auto"><div className="mx-auto w-full max-w-[880px] px-8 pb-16 pt-10">
  <header className="mb-10">
   <h1 className="font-display text-display-md leading-display-loose tracking-tight">{tr("设置")}</h1>
   <p className="mt-2 text-secondary text-ink-3">{locale==='zh'?'外观、语言，以及原生 Agent 的连接与模型。':'Appearance, language, and native agent connections and models.'}</p>
  </header>
  {error&&<p role="alert" className="ui-error mb-6">{error}</p>}
  <Section id="appearance" title={tr("外观")}>
   <Row label={tr("主题")}><select aria-label={tr("主题")} className="ui-select-compact w-56" value={theme} onChange={e=>{const next=e.target.value;if((next==='light'||next==='dark')&&next!==theme)toggleTheme()}}><option value="light">{tr("浅色")}</option><option value="dark">{tr("深色")}</option></select></Row>
   <Row label={tr("界面语言")}><select aria-label={tr("界面语言")} className="ui-select-compact w-56" value={locale} onChange={e=>setLocale(e.target.value as 'zh'|'en')}><option value="zh">简体中文</option><option value="en">English</option></select></Row>
  </Section>
  <Section id="connections" title={locale==='zh'?'连接与模型':'Connections & models'}>
   <p className="mb-4 mt-2 max-w-[64ch] text-secondary text-ink-3">{locale==='zh'?'每个原生客户端（Codex、Grok、Claude、OpenCode、Cursor）用自己的 CLI 与登录运行；这里只设置启用、CLI 路径与默认值，不收凭证。「刷新状态」由宿主核验版本与登录，未核验不等于可用。':'Each native client (Codex, Grok, Claude, OpenCode, Cursor) runs with its own CLI and sign-in. Here you only set enablement, CLI path and defaults; no credentials are collected. Refresh asks the host to verify version and login; unchecked is not the same as available.'}</p>
   {settings?<AgentProviderSettings locale={locale} settings={settings} onSave={async update=>{setSettings(await nativeClient.updateNativeSettings(update));native.setRefresh(n=>n+1)}} onRefresh={async id=>{setSettings(await nativeClient.refreshNativeSettings(id));native.setRefresh(n=>n+1)}}/>:<p className="py-2 text-secondary text-ink-3">{tr("正在读取供应者设置…")}</p>}
  </Section>
 </div></div>
}
