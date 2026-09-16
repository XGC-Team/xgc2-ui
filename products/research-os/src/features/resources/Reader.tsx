import {useEffect,useMemo,useState} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {BookOpen,Quote,FileText} from 'lucide-react'
import {t as tr} from '../../i18n'
import {useWorkbench} from '../../store'
import {request} from '../../lib/api'
import {PageActions} from '../../components/PageActions'
import {Button} from '../../components/ui'
import {CodeBlock} from '../../components/CodeBlock'
import {IconGraph} from '../../components/icons'
import {decodeAnnotation} from './pdf-annotations'
import {listPDFVersions} from './manuscript'
import {ReadingBridge} from '../projects/ReadingBridge'
const splitFrontmatter=(raw:string)=>{const m=raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);if(!m)return{meta:[],body:raw};const meta=m[1].split('\n').map(l=>l.match(/^(\w[\w-]*)\s*:\s*(.+)$/)).filter(Boolean) as RegExpMatchArray[];return{meta:meta.map(x=>({key:x[1],value:x[2].trim()})),body:raw.slice(m[0].length)}}
const wikilink=(raw:string)=>raw.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,(_m,target:string,alias:string)=>`[${alias||target}](#wiki/${encodeURIComponent(target.trim())})`)
export function MarkdownView({content}:{content:string}){
 const {knowledgeDocuments:notes,openDocument,openPDF,flashPDF,locale}=useWorkbench()
 const body=useMemo(()=>wikilink(splitFrontmatter(content).body),[content])
 const pdfAnchor=useMemo(()=>{const {anchor}=decodeAnnotation(content);return anchor?.pdf?anchor:null},[content])
 const [anchorError,setAnchorError]=useState('')
 useEffect(()=>setAnchorError(''),[content])
 async function openAnchor(){
  if(!pdfAnchor?.pdf)return
  setAnchorError('')
  try{
   const versions=await listPDFVersions(pdfAnchor.pdf.workspace,pdfAnchor.pdf.path)
   const match=versions.find(v=>v.digest===pdfAnchor.pdf!.digest)
   if(!match)throw Error(locale==='zh'?'批注记录的 PDF 版本不可用；没有跳转到其他版本。':'The annotated PDF revision is unavailable; no other revision was substituted.')
   openPDF(match);flashPDF({buildId:match.buildId,page:pdfAnchor.page,rects:pdfAnchor.rects},match)
  }catch(e){setAnchorError(e instanceof Error?e.message:String(e))}
 }
 return <>
 {pdfAnchor&&<div className="mb-4"><button type="button" onClick={()=>void openAnchor()} className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-panel px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-hover">
  <FileText size={14} strokeWidth={1.75} className="shrink-0 text-ink-2"/>
  <span className="min-w-0 flex-1 truncate text-caption text-ink-2">{pdfAnchor.pdf?.path.split('/').pop()} · {tr('第')} {pdfAnchor.page} {tr('页')}</span>
  <span className="shrink-0 text-caption text-ink-3">{tr('打开 PDF 位置')}</span>
 </button></div>}
 {anchorError&&<p role="alert" className="mb-2 text-caption text-ink-3">{anchorError}</p>}
 <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
  pre:({children})=><>{children}</>,
  code:({className,children})=>{const text=String(children).replace(/\n$/,'');const lang=/language-(\w+)/.exec(className||'')?.[1];if(!lang&&!text.includes('\n'))return <code className="ui-inline-code">{text}</code>;return <CodeBlock lang={lang||'text'} code={text}/>},
  a:({href,children})=>href?.startsWith('#wiki/')?<button type="button" className="ui-wikilink" onClick={()=>{
    const target=decodeURIComponent(href.slice(6));const matches=notes.filter(n=>n.title===target||n.path.replace(/\.md$/i,'').endsWith(target))
    if(matches.length===1)openDocument({workspace:'academic',path:matches[0].path,title:matches[0].title})
    else setAnchorError(locale==='zh'?'内部链接无法唯一定位，请在知识库核对。':'Internal link is missing or ambiguous; check it in Knowledge.')
  }}>{children}</button>:<a href={href} target="_blank" rel="noreferrer">{children}</a>,
 }}>{body}</ReactMarkdown>
 </>
}
export function Reader({onQuote}:{onQuote?:(text:string)=>void}){
 const {readingDocument:doc,closeDocument,activeNav}=useWorkbench()
 const [content,setContent]=useState(''),[digest,setDigest]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false)
 useEffect(()=>{setContent('');setDigest('');setError('');if(!doc)return;const c=new AbortController();setLoading(true)
  request<{content:string;digest:string}>(`/workspaces/${encodeURIComponent(doc.workspace)}/files/${doc.path.split('/').map(encodeURIComponent).join('/')}`,{signal:c.signal}).then(d=>{if(typeof d?.content!=='string'||typeof d.digest!=='string'||!d.digest)throw Error('Invalid file response.');if(!c.signal.aborted){setContent(d.content);setDigest(d.digest)}}).catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setLoading(false)})
  return()=>c.abort()},[doc])
 const meta=useMemo(()=>splitFrontmatter(content).meta,[content])
 if(!doc)return <div className="grid h-full place-content-center px-6"><div className="max-w-xs text-center">
  <BookOpen size={22} strokeWidth={1.2} className="mx-auto mb-4 text-ink-3"/>
  <h2 className="font-display text-[22px] tracking-tight">{tr("选择一篇文档开始阅读")}</h2>
  <p className="mt-2 text-secondary leading-relaxed text-ink-3">{tr("从左侧文件树选一篇笔记开始阅读。")}</p>
 </div></div>
 return <div className="flex h-full min-h-0 flex-col">
  {onQuote&&<PageActions page="knowledge"><Button icon={Quote} disabled={!digest} onClick={()=>onQuote(`文件：${doc.workspace}/${doc.path}\n版本：${digest}\n\n${content}`)}>{tr("引用到 Chat")}</Button></PageActions>}
  {error&&<p role="alert" className="ui-error">{error}</p>}
  <article className="min-h-0 flex-1 overflow-auto"><div className="mx-auto w-full max-w-[720px] px-8 pb-20 pt-10">
   <header className="mb-8"><div className="flex items-center justify-between gap-3">
    <p className="min-w-0 truncate text-caption text-ink-3">{doc.path}</p>
    <button type="button" onClick={closeDocument} className="flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-caption text-ink-3 hover:bg-hover" title={tr('返回图谱')}><IconGraph size={12} strokeWidth={1.75}/>{tr('图谱')}</button>
   </div><h1 className="mt-2 font-display text-[30px] leading-[1.2] tracking-tight">{doc.title}</h1>
    {meta.length>0&&<dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5">{meta.map(m=><div key={m.key} className="flex gap-2 text-caption"><dt className="text-ink-3">{m.key}</dt><dd className="text-ink-2">{m.value}</dd></div>)}</dl>}
   </header>
   {loading?<p role="status" className="text-ink-3">{tr("正在读取…")}</p>:!error&&digest&&<ReadingBridge active={activeNav==='knowledge'} source={{id:'knowledge',workspace:doc.workspace,path:doc.path,digest}}><div className="research-document break-words text-body leading-[1.75] text-ink-2"><MarkdownView content={content}/></div></ReadingBridge>}
  </div></article>
 </div>
}
