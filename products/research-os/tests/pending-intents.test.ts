import {describe,expect,it} from 'vitest'
import {persistPendingChanges,restorePendingIntents,type PendingIntents} from '../src/features/workbench/pending-intents'

class MemoryStorage {
  data=new Map<string,string>()
  get length(){return this.data.size}
  key(index:number){return [...this.data.keys()][index]??null}
  getItem(key:string){return this.data.get(key)??null}
  setItem(key:string,value:string){this.data.set(key,value)}
  removeItem(key:string){this.data.delete(key)}
}
const empty=():PendingIntents=>({reviewIntents:[],draftIntents:[],canvasReferences:[]})
const pending=(id:string):PendingIntents=>({...empty(),draftIntents:[{id,scope:{projectId:'project',workspace:'owner'},kind:'note',source:{id:'source',path:'notes/a.md',excerpt:'Unsaved research question'}}]})

describe('pending research actions',()=>{
  it('restores exact work after reload and consuming one action preserves another tab’s action',()=>{
    const storage=new MemoryStorage()
    const first=pending('first'),other=pending('second')
    expect(persistPendingChanges(storage,empty(),first)).toBe('')
    expect(persistPendingChanges(storage,empty(),other)).toBe('')
    expect(restorePendingIntents(storage).intents.draftIntents).toEqual([...first.draftIntents,...other.draftIntents])
    expect(persistPendingChanges(storage,first,empty())).toBe('')
    expect(restorePendingIntents(storage).intents).toEqual(other)
  })
  it('retains unreadable original records and recovers the remaining work',()=>{
    const storage=new MemoryStorage()
    storage.setItem('research-pending-v1:draftIntents:damaged','{broken')
    persistPendingChanges(storage,empty(),pending('good'))
    const restored=restorePendingIntents(storage)
    expect(restored.intents).toEqual(pending('good'))
    expect(restored.error).toContain('1 pending records')
    expect(storage.getItem('research-pending-v1:draftIntents:damaged')).toBe('{broken')
  })
  it('reports denied storage without discarding the action in memory',()=>{
    const storage=new MemoryStorage(),work=pending('unsaved')
    storage.setItem=()=>{throw new Error('quota exceeded')}
    expect(persistPendingChanges(storage,empty(),work)).toContain('could not be saved')
    expect(work.draftIntents[0].source.excerpt).toBe('Unsaved research question')
    expect(storage.length).toBe(0)
  })
})
