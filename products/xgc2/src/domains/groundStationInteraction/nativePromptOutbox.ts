import type {NativeTurnOptions,PromptQueue} from '@xgc2/native-agent/state';
import {createGroundStationNativeClient} from './groundStationNativeAgentService';
export type LocalPrompt={id:string;sessionId:string;draftId:string;text:string;options:NativeTurnOptions;error?:string};
type Snapshot={items:LocalPrompt[];sending:string;receipts:Record<string,PromptQueue>};
/** One sender per experiment across panel remounts; the host owns admitted queue items. */
export class NativePromptOutbox {
  private snapshot:Snapshot;private listeners=new Set<()=>void>();private preparations=new Map<string,()=>Promise<string>>();
  private storageKey:string;
  constructor(private experimentId:string){
    this.storageKey=`xgc.native-prompt-outbox.v1:${experimentId}`;let items:LocalPrompt[]=[];
    try{const value:unknown=JSON.parse(localStorage.getItem(this.storageKey)||'[]');if(Array.isArray(value)&&value.length<=20)items=value.filter((p):p is LocalPrompt=>p&&typeof p.id==='string'&&typeof p.text==='string'&&typeof p.sessionId==='string'&&typeof p.draftId==='string'&&p.options&&typeof p.options==='object').map(p=>({...p,error:'Submission was not confirmed. Retry to check the saved request.'}))}catch{/* A missing outbox does not fabricate submitted messages. */}
    this.snapshot={items,sending:'',receipts:{}};
  }
  getSnapshot=()=>this.snapshot;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}};
  private write(items:LocalPrompt[],sending=this.snapshot.sending){localStorage.setItem(this.storageKey,JSON.stringify(items));this.snapshot={...this.snapshot,items,sending};for(const listener of this.listeners)listener()}
  enqueue(text:string,draftId:string,options:NativeTurnOptions,prepare:()=>Promise<string>){
    if(!text.trim())return;if(this.snapshot.items.length>=20)throw new Error('Message queue is full.');
    const task={id:crypto.randomUUID(),sessionId:draftId.startsWith('new:')?'':draftId,draftId,text,options:{...options}};
    this.preparations.set(task.id,prepare);this.write([...this.snapshot.items,task]);this.pump();
  }
  edit(id:string,text:string){if(this.snapshot.sending===id)throw new Error('This message is being submitted.');this.write(this.snapshot.items.map(p=>p.id===id?{...p,text}:p))}
  remove(id:string){if(this.snapshot.sending===id)throw new Error('This message is being submitted.');this.write(this.snapshot.items.filter(p=>p.id!==id));this.preparations.delete(id);this.pump()}
  retry(id:string,prepare:()=>Promise<string>){this.preparations.set(id,prepare);this.write(this.snapshot.items.map(p=>p.id===id?{...p,error:undefined}:p));this.pump()}
  private pump(){
    if(this.snapshot.sending)return;
    const task=this.snapshot.items.find((p,index)=>!p.error&&!this.snapshot.items.slice(0,index).some(earlier=>earlier.draftId===p.draftId));if(!task)return;
    this.write(this.snapshot.items,task.id);
    void (async()=>{
      try{
        let sessionId=task.sessionId;
        if(sessionId){const prepare=this.preparations.get(task.id);if(prepare&&await prepare()!==sessionId)throw new Error('Conversation changed before submission.')}
        if(!sessionId){const prepare=this.preparations.get(task.id);if(!prepare)throw new Error('Open this conversation before retrying.');sessionId=await prepare();this.write(this.snapshot.items.map(p=>p.draftId===task.draftId&&!p.sessionId?{...p,sessionId,draftId:sessionId}:p))}
        const result=await createGroundStationNativeClient(this.experimentId).updateNativePromptQueue(sessionId,{operation:'enqueue',text:task.text,options:task.options},task.id);
        this.snapshot={...this.snapshot,receipts:{...this.snapshot.receipts,[sessionId]:result}};
        this.write(this.snapshot.items.filter(p=>p.id!==task.id));this.preparations.delete(task.id);
      }catch(e){this.write(this.snapshot.items.map(p=>p.id===task.id?{...p,error:e instanceof Error?e.message:String(e)}:p))}
      finally{this.write(this.snapshot.items,'');this.pump()}
    })();
  }
}
const stores=new Map<string,NativePromptOutbox>();
export function nativePromptOutbox(experimentId:string){let store=stores.get(experimentId);if(!store){store=new NativePromptOutbox(experimentId);stores.set(experimentId,store)}return store}
