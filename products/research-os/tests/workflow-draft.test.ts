import {describe,it,expect} from 'vitest'
import {readWorkflowDraft,saveWorkflowDraft,clearWorkflowDraft} from '../src/features/workflow/workflow-draft'
import type {Draft} from '../src/features/workflow/workflow-model'
describe('unfinished workflow drafts',()=>{
  it('restores incomplete definitions with their original approval base, independently by project',()=>{
    const records=new Map<string,string>(),storage={getItem:(key:string)=>records.get(key)??null,setItem:(key:string,value:string)=>{records.set(key,value)},removeItem:(key:string)=>{records.delete(key)}}
    const draft:Draft={title:'Work in progress',goal:'',researcher:'',reviewer:'',writer:'',workspace:{id:'owner',revision:'working-tree'},nodes:[{id:'check',kind:'DerivationCheck',title:'',objective:'',acceptance:[],inputs:[],dependsOn:[]}]}
    saveWorkflowDraft(storage,'a',{draft,baseVersion:4});saveWorkflowDraft(storage,'b',{draft:{...draft,title:'Second project'},baseVersion:1})
    expect(readWorkflowDraft(storage,'a')).toEqual({draft,baseVersion:4})
    clearWorkflowDraft(storage,'a');expect(readWorkflowDraft(storage,'a')).toBeUndefined();expect(readWorkflowDraft(storage,'b')?.draft.title).toBe('Second project')
    const old=[...records.values()][0];records.set('research-workflow-draft-v1:b','{incomplete')
    expect(()=>readWorkflowDraft(storage,'b')).toThrow();expect(records.get('research-workflow-draft-v1:b')).toBe('{incomplete');expect(old).toContain('Second project')
  })
})
