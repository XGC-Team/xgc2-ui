import type { ReviewIntent } from '../../store'
import type { DraftIntent } from '../projects/draft-model'
export type CanvasReferenceIntent = {id:string;project:string;draftId:string;title:string}
export type PendingIntents = {reviewIntents:ReviewIntent[];draftIntents:DraftIntent[];canvasReferences:CanvasReferenceIntent[]}
const PREFIX='research-pending-v1:'
const fields=['reviewIntents','draftIntents','canvasReferences'] as const
type Queue=typeof fields[number]
type StoragePort=Pick<Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const scope=(v:unknown)=>object(v)&&typeof v.projectId==='string'&&typeof v.workspace==='string'
function valid(queue:Queue,value:unknown):boolean {
  if(!object(value)||typeof value.id!=='string'||!value.id)return false
  if(queue==='canvasReferences')return typeof value.project==='string'&&typeof value.draftId==='string'&&typeof value.title==='string'
  if(!scope(value.scope))return false
  if(queue==='draftIntents')return ['note','material'].includes(String(value.kind))&&object(value.source)&&typeof value.source.id==='string'&&typeof value.source.path==='string'
  return typeof value.body==='string'&&typeof value.at==='string'&&object(value.anchor)&&typeof value.anchor.workspace==='string'&&typeof value.anchor.path==='string'
}
/** Each pending action owns one key. Another tab cannot overwrite an unrelated pending action. */
export function restorePendingIntents(storage:StoragePort):{intents:PendingIntents;error:string} {
  const intents:PendingIntents={reviewIntents:[],draftIntents:[],canvasReferences:[]}
  let invalid=0
  try{
    for(let i=0;i<storage.length;i++){
      const key=storage.key(i)
      if(!key?.startsWith(PREFIX))continue
      try{
        const queue=fields.find(field=>key.startsWith(PREFIX+field+':'))
        const value:unknown=JSON.parse(storage.getItem(key)||'null')
        if(!queue||!valid(queue,value)){invalid++;continue}
        ;(intents[queue] as unknown[]).push(value)
      }catch{invalid++}
    }
  }catch{return {intents,error:'Pending work could not be read from browser storage.'}}
  return {intents,error:invalid?`${invalid} pending records could not be read. Their original records remain in browser storage.`:''}
}
export function persistPendingChanges(storage:StoragePort,previous:PendingIntents,next:PendingIntents):string {
  try{
    for(const queue of fields){
      if(previous[queue]===next[queue])continue
      const before=new Map<string,{id:string}>(previous[queue].map(item=>[item.id,item]))
      for(const item of next[queue]){
        if(item!==before.get(item.id))storage.setItem(PREFIX+queue+':'+encodeURIComponent(item.id),JSON.stringify(item))
        before.delete(item.id)
      }
      for(const id of before.keys())storage.removeItem(PREFIX+queue+':'+encodeURIComponent(id))
    }
    return ''
  }catch{return 'Pending work is available in this tab but could not be saved. Keep this tab open until it is handled.'}
}
