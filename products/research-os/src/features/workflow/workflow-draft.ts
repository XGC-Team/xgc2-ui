import type {Draft} from './workflow-model'
export type PendingWorkflowDraft={draft:Draft;baseVersion:number}
type Port=Pick<Storage,'getItem'|'setItem'|'removeItem'>
const key=(project:string)=>`research-workflow-draft-v1:${encodeURIComponent(project)}`
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const strings=(v:unknown)=>Array.isArray(v)&&v.every(s=>typeof s==='string')
export function readWorkflowDraft(storage:Port,project:string):PendingWorkflowDraft|undefined {
  const raw=storage.getItem(key(project));if(raw===null)return
  const value:unknown=JSON.parse(raw)
  if(!object(value)||!Number.isSafeInteger(value.baseVersion)||(value.baseVersion as number)<0||!object(value.draft))throw new Error('Saved workflow draft is unreadable; its original record was retained.')
  const d=value.draft
  if(!['title','goal','researcher','reviewer','writer'].every(k=>typeof d[k]==='string')||!object(d.workspace)||typeof d.workspace.id!=='string'||typeof d.workspace.revision!=='string'||!Array.isArray(d.nodes)||!d.nodes.every(n=>object(n)&&['id','kind','title','objective'].every(k=>typeof n[k]==='string')&&['acceptance','inputs','dependsOn'].every(k=>strings(n[k]))))throw new Error('Saved workflow draft is unreadable; its original record was retained.')
  return value as PendingWorkflowDraft
}
export function saveWorkflowDraft(storage:Port,project:string,value:PendingWorkflowDraft){storage.setItem(key(project),JSON.stringify(value))}
export function clearWorkflowDraft(storage:Port,project:string){storage.removeItem(key(project))}
