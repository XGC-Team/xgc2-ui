import { useEffect, useRef, useState } from 'react'
import { useWorkbench } from '../../store'
import { Button } from '../../components/ui'
import { readReviewFile } from './review-api'
import { assertEditorClean } from './write-coordinator'
import { targetChoices } from './review-targets'
import { FeedbackButton } from './FeedbackButton'
export function CanvasReviewTools({project}: {project: string}) {
  const latestProject=useRef(project);latestProject.current=project
  const zh = useWorkbench(s => s.locale === 'zh')
  const [items, setItems] = useState<ReturnType<typeof targetChoices>>([]), [selected, setSelected] = useState(0), [open, setOpen] = useState(false), [error, setError] = useState('')
  useEffect(()=>{setItems([]);setOpen(false);setError('')},[project])
  const focus=useWorkbench(s=>s.reviewFocus)
  useEffect(()=>{
    const target=focus?.anchor.target
    if(focus?.scope.projectId!==project||target?.kind!=='canvas')return
    let cancelled=false
    void readReviewFile(project,'thinking.canvas.json').then(r=>{
      if(cancelled||r.digest!==focus.anchor.digest)return
      const choices=targetChoices(r.content,'canvas',{projectId:project,workspace:project}),i=choices.findIndex(c=>c.target.kind==='canvas'&&c.target.objectId===target.objectId&&c.target.field===target.field)
      if(i>=0){setItems(choices);setSelected(i);setOpen(true)}
    }).catch(e=>{if(!cancelled)setError(String(e.message))})
    return()=>{cancelled=true}
  },[focus,project])
  const scope = {projectId:project,workspace:project}
  return <div className="relative shrink-0">
    <Button size="xs" onClick={()=>{
      if(open){setOpen(false);return}setError('');setOpen(true)
      void (async()=>{assertEditorClean(project,'thinking.canvas.json');const r=await readReviewFile(project,'thinking.canvas.json');if(latestProject.current!==project)return;setItems(targetChoices(r.content,'canvas',scope));setSelected(0)})().catch(e=>{if(latestProject.current===project)setError(String(e.message))})
    }}>{zh?'卡片反馈':'Card feedback'}</Button>
    {open&&<div className="absolute right-0 top-full z-50 mt-1 w-72 max-w-[90vw] space-y-2 rounded-lg border border-line bg-panel p-3 shadow-pop">
      <label className="block text-caption">{zh?'明确选择卡片与字段':'Choose card and field explicitly'}<select className="ui-input mt-1 w-full" value={selected} onChange={e=>setSelected(Number(e.target.value))}>{items.map((i,n)=><option key={n} value={n}>{i.title}</option>)}</select></label>
      {items[selected]&&<FeedbackButton scope={scope} target={items[selected].target}/>}
      {error&&<p role="alert" className="text-caption">{error}</p>}
      <Button size="xs" onClick={()=>setOpen(false)}>{zh?'关闭':'Close'}</Button>
    </div>}
  </div>
}
