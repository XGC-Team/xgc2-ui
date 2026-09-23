import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { useWorkbench } from '../../store'
import type { ResourceInput } from './resource-model'
import type { Scope } from '../review/review-model'
import type { OriginalPDF } from '../resources/manuscript'
import { originalAssetURL, originalResponseDigest } from '../resources/original-source'
export { originalAssetURL } from '../resources/original-source'
const PDFReader = lazy(() => import('../resources/PDFReader'))

export type OriginalReference = Extract<ResourceInput,{kind:'original'}>
/** Original attachments have source provenance, not a manufactured manuscript build. */
export function OriginalSource({source,scope,onDigest,onQuote}: {source:OriginalReference;scope:Scope;onDigest:(digest:string)=>void;onQuote:(text:string)=>void}) {
  const zh=useWorkbench(state=>state.locale==='zh')
  const [state,setState]=useState<{pdf?:OriginalPDF;text?:string;binary?:string;encoding?:string;error?:string}>({})
  const digestCallback=useRef(onDigest);digestCallback.current=onDigest
  const quoteRef=useRef<HTMLSpanElement>(null)
  useEffect(()=>{
    const c=new AbortController();let blobURL='';setState({})
    void (async()=>{
      const response=await fetch(originalAssetURL(source),{signal:c.signal})
      if(!response.ok){const body=await response.json().catch(()=>null);throw new Error(body?.error?.message||`Source read failed (${response.status}).`)}
      const bytes=await response.arrayBuffer()
      if(c.signal.aborted)return
      const digest=originalResponseDigest(response,source.digest)
      if(!source.digest)digestCallback.current(digest)
      const type=response.headers.get('Content-Type')||''
      if(type.startsWith('application/pdf')){
        blobURL=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));setState({pdf:{origin:'original',workspace:source.workspace,path:source.path,digest,url:blobURL,page:source.page}})
      }else if(type.startsWith('text/plain')){
        let text:string,encoding='UTF-8'
        try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{text=new TextDecoder('windows-1252').decode(bytes);encoding='Windows-1252'}
        setState({text,encoding})
      }else{blobURL=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));setState({binary:blobURL})}
    })().catch(reason=>{if(!c.signal.aborted)setState({error:reason instanceof Error?reason.message:String(reason)})})
    return()=>{c.abort();if(blobURL)URL.revokeObjectURL(blobURL)}
  },[source.workspace,source.path,source.digest,source.page])
  const start=source.quote&&state.text?state.text.indexOf(source.quote):-1
  useEffect(()=>{quoteRef.current?.scrollIntoView({block:'center'})},[state.text,source.quote])
  return <div className="flex h-full min-h-0 flex-col">
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line p-2 text-caption">
      <span className="min-w-0 flex-1 truncate" title={`${source.workspace}/${source.path}`}>{source.path.split('/').pop()}</span>
      {state.encoding&&<span className="text-ink-3">{state.encoding}</span>}
      <span className="text-ink-3">{zh?'来源原件':'Original source'}</span>
      {source.quote&&<Button size="xs" onClick={()=>onQuote(`[${source.workspace}/${source.path}${source.page?` · p.${source.page}`:''}]\n${source.quote}\n${source.digest??''}`)}>{zh?'引用到讨论':'Quote in discussion'}</Button>}
    </header>
    {state.error?<p role="alert" className="ui-error">{state.error}</p>:state.pdf?<Suspense fallback={<p role="status" className="p-4 text-secondary text-ink-3">{zh?'正在打开 PDF…':'Opening PDF…'}</p>}><PDFReader pdf={state.pdf} scope={scope} onQuote={onQuote}/></Suspense>:state.text!==undefined?
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-secondary leading-relaxed">{start>=0?<>{state.text.slice(0,start)}<span ref={quoteRef} className="bg-accent-soft">{source.quote}</span>{state.text.slice(start+(source.quote?.length??0))}</>:state.text}</pre>:
      state.binary?<a href={state.binary} download={source.path.split('/').pop()} className="p-4 text-secondary underline">{zh?'下载原文件':'Download original file'}</a>:<p role="status" className="p-4 text-secondary text-ink-3">{zh?'正在读取原件…':'Reading original source…'}</p>}
  </div>
}
