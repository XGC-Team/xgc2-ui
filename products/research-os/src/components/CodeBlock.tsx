import {useEffect,useState} from 'react'
import {createHighlighter} from 'shiki/bundle/web'
import {Check,Copy} from 'lucide-react'
import {t as tr} from '../i18n'
import {useWorkbench} from '../store'

/* Shiki 单例：web 精简包 + 按需补注册（go/rust/toml/latex 等）；双主题随产品主题切换 */
import langGo from 'shiki/langs/go.mjs'
import langRust from 'shiki/langs/rust.mjs'
import langToml from 'shiki/langs/toml.mjs'
import langDiff from 'shiki/langs/diff.mjs'
import langLatex from 'shiki/langs/latex.mjs'
import langDocker from 'shiki/langs/dockerfile.mjs'
import langMake from 'shiki/langs/makefile.mjs'
import langIni from 'shiki/langs/ini.mjs'
const LANGS=['js','jsx','ts','tsx','python','bash','sh','json','yaml','markdown','c','cpp','java','sql','css','html','xml',langGo,langRust,langToml,langDiff,langLatex,langDocker,langMake,langIni]
const highlighter=createHighlighter({themes:['github-light-default','github-dark-default'],langs:LANGS})
highlighter.catch(()=>{}) /* 模块级兜底，避免未处理拒绝 */
const escapeHtml=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

export function CodeBlock({lang,code}:{lang:string;code:string}){
 const {theme}=useWorkbench()
 const [html,setHtml]=useState(''),[copied,setCopied]=useState(false)
 useEffect(()=>{let alive=true;setHtml('')
  highlighter.then(h=>{if(!alive)return;const l=h.getLoadedLanguages().includes(lang)?lang:'text';setHtml(h.codeToHtml(code,{lang:l,theme:theme==='dark'?'github-dark-default':'github-light-default'}))}).catch(()=>{if(alive)setHtml(`<pre><code>${escapeHtml(code)}</code></pre>`)})
  return()=>{alive=false}
 },[code,lang,theme])
 return <div className="ui-codeblock">
  <div className="ui-codeblock-bar"><span>{lang}</span>
   <button type="button" aria-label={tr('复制代码')} onClick={()=>{void navigator.clipboard.writeText(code);setCopied(true);setTimeout(()=>setCopied(false),1400)}}>
    {copied?<Check size={12} strokeWidth={2}/>:<Copy size={12} strokeWidth={1.75}/>}<span>{copied?tr('已复制'):tr('复制')}</span>
   </button>
  </div>
  {html?<div className="ui-codeblock-body" dangerouslySetInnerHTML={{__html:html}}/>
   :<pre className="ui-codeblock-body"><code>{code}</code></pre>}
 </div>
}
