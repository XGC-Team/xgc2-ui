import {useState,useSyncExternalStore} from 'react';
import type {PromptQueue,NativeTurnOptions} from '@xgc2/native-agent/state';
import {createGroundStationNativeClient} from './groundStationNativeAgentService';
import {nativePromptOutbox} from './nativePromptOutbox';
const emptyQueue:PromptQueue={revision:0,paused:false,items:[]};
export function useGroundStationPromptQueue(experimentId:string,draftId:string,queue:PromptQueue|undefined,options:NativeTurnOptions,prepare:()=>Promise<string>) {
  const store=nativePromptOutbox(experimentId),local=useSyncExternalStore(store.subscribe,store.getSnapshot);
  const [receipt,setReceipt]=useState<{sessionId:string;queue:PromptQueue}>();
  const sessionId=draftId.startsWith('new:')?'':draftId;
  const candidates=[queue,local.receipts[sessionId],receipt?.sessionId===sessionId?receipt.queue:undefined].filter((q):q is PromptQueue=>Boolean(q));
  const serverQueue=candidates.sort((a,b)=>b.revision-a.revision)[0]??emptyQueue;
  const update=async(command:Parameters<ReturnType<typeof createGroundStationNativeClient>['updateNativePromptQueue']>[1])=>{
    if(!sessionId)throw new Error('No conversation is connected.');
    const result=await createGroundStationNativeClient(experimentId).updateNativePromptQueue(sessionId,{...command,expectedRevision:serverQueue.revision},crypto.randomUUID());setReceipt({sessionId,queue:result});
  };
  const visibleLocal=local.items.filter(p=>p.draftId===draftId||p.sessionId===sessionId&&Boolean(sessionId));
  return {enqueue:(text:string)=>store.enqueue(text,draftId,options,prepare),paused:serverQueue.paused,
    items:[...serverQueue.items,...visibleLocal.map(p=>({...p,local:true,sending:p.id===local.sending}))],
    edit:async(id:string,text:string)=>{if(local.items.some(p=>p.id===id)){store.edit(id,text);return}await update({operation:'edit',id,text})},
    remove:async(id:string)=>{if(local.items.some(p=>p.id===id)){store.remove(id);return}await update({operation:'remove',id})},
    reorder:async(order:string[])=>update({operation:'reorder',order}),
    pause:async(paused:boolean)=>update({operation:paused?'pause':'resume'}),
    retry:async(id:string)=>store.retry(id,prepare),
  };
}
