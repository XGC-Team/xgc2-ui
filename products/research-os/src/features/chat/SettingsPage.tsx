import {t as tr} from '../../i18n'
import { useEffect, useState } from 'react'
import { NativeProviderSettings, type NativeSettings } from '@xgc2/native-agent/react'
import { nativeClient } from './client'
import { useNativeAgentSession } from './Session'
import { useWorkbench } from '../../store'
export function SettingsPage(){
 const {locale,setLocale}=useWorkbench()
 const native=useNativeAgentSession();const [settings,setSettings]=useState<NativeSettings|null>(null),[error,setError]=useState('')
 useEffect(()=>{const c=new AbortController();nativeClient.getNativeSettings(c.signal).then(setSettings).catch(e=>{if(!c.signal.aborted)setError(e.message)});return()=>c.abort()},[])
 return <div className="flex h-full min-h-0 flex-col bg-panel">{error&&<p role="alert" className="ui-error">{error}</p>}<div className="min-h-0 flex-1 overflow-auto p-5"><label className="mb-6 flex items-center justify-between gap-3 border-b border-line pb-4"><span>{tr("界面语言")}</span><select aria-label={tr("界面语言")} className="ui-input max-w-40" value={locale} onChange={e=>setLocale(e.target.value as 'zh'|'en')}><option value="zh">简体中文</option><option value="en">English</option></select></label>{settings?<NativeProviderSettings locale={locale} settings={settings} onSave={async update=>{setSettings(await nativeClient.updateNativeSettings(update));native.setRefresh(n=>n+1)}} onRefresh={async id=>{setSettings(await nativeClient.refreshNativeSettings(id));native.setRefresh(n=>n+1)}}/>:<p>{tr("正在读取供应者设置…")}</p>}</div></div>
}
