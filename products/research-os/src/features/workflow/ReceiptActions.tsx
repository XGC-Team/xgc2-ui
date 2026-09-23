import { useState } from 'react'
import { Button } from '../../components/ui'
import { Textarea } from '../../components/forms'
import { useWorkbench } from '../../store'
import { sharedContentSession } from '../content/useContentDocument'
import type { ResourceReference } from '../content/content-model'
import { respondToStep, stepArtifactUrl } from './workflow-client'
import type { Receipt, Revision, Run } from './workflow-model'

export function ReceiptActions({receipt,revision,run}: {receipt:Receipt;revision:Revision;run:Run}) {
  const zh=useWorkbench(state=>state.locale==='zh')
  const [response,setResponse]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false)
  async function respond(){
    if(!receipt.receiptDigest)return
    setBusy(true);setError('')
    try {
      await respondToStep(revision.projectId,revision.version,run.id,receipt.stage,{digest:revision.digest,expectedReceiptDigest:receipt.receiptDigest,actorRef:'human:operator',result:{conclusion:response}})
      setResponse('')
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason))}finally{setBusy(false)}
  }
  async function capture(){
    setBusy(true);setError('')
    try {
      const workspace=revision.draft.workspace.id
      const writer=sharedContentSession({projectId:revision.projectId,workspace})
      if(writer.snapshot().status==='loading')await writer.load()
      const state=writer.snapshot()
      if(!state.digest||state.dirty||state.status!=='saved')throw new Error(zh?'请先打开研究内容，完成迁移或保存当前编辑。':'Open research content and finish migration or pending edits first.')
      const source:ResourceReference={kind:'run',workspace,id:run.id,digest:receipt.receiptDigest||receipt.outputDigest,selector:{objectId:receipt.stage},projectId:revision.projectId,version:revision.version}
      const id=receipt.receiptDigest?`result-${receipt.receiptDigest}`:crypto.randomUUID()
      if(!writer.edit(doc=>doc.objects.some(o=>o.id===id)?doc:{...doc,objects:[...doc.objects,{id,kind:'evidence',title:revision.draft.nodes.find(n=>n.id===receipt.stage)?.title||receipt.stage,body:receipt.output,status:'unreviewed',sources:[source,...(receipt.artifacts??[]).map(ref=>({...ref,projectId:revision.projectId,version:revision.version})),...(receipt.sourceRefs??[])]}]}))throw new Error('Content editor is not ready.')
      await writer.save()
      if(writer.snapshot().status!=='saved'||writer.snapshot().dirty)throw new Error(writer.snapshot().error||'Evidence remains unsaved.')
      setSaved(true)
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason))}finally{setBusy(false)}
  }
  return <div className="space-y-2">
    {receipt.executor==='human'&&receipt.status==='awaiting-input'&&<>
      <Textarea aria-label={zh?'人工步骤结果':'Human step result'} value={response} onChange={e=>setResponse(e.target.value)} placeholder={zh?'记录判断、依据和仍未解决的问题':'Record your judgment, grounds and remaining questions'}/>
      <Button variant="solid" disabled={busy||!response.trim()||!receipt.receiptDigest} onClick={()=>void respond()}>{zh?'提交本步结果':'Submit step result'}</Button>
    </>}
    {(receipt.artifacts??[]).map((artifact,index)=>artifact.digest&&<a key={index} className="block break-all text-caption underline" href={stepArtifactUrl(revision.projectId,revision.version,run.id,receipt.stage,artifact.digest)} download>{artifact.path||artifact.id||`${zh?'产物':'Artifact'} ${index+1}`}</a>)}
    {receipt.status==='completed'&&<Button disabled={busy||saved} onClick={()=>void capture()}>{saved?(zh?'已保存为研究证据':'Saved as research evidence'):(zh?'保存为研究证据':'Save as research evidence')}</Button>}
    {error&&<p role="alert" className="ui-error">{error}</p>}
  </div>
}
