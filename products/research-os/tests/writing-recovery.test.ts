import {describe,expect,it} from 'vitest'
import {resumeWritingIdentity} from '../src/features/review/native-writing'
import type {WritingRecord} from '../src/features/review/writing-contract'
const writing={version:1,status:'running',execution:{sessionId:'session-a',requestKey:'saved-key',turnId:'t_'+'a'.repeat(32)}} as WritingRecord
describe('reopening an acknowledged writing turn',()=>{
  it('observes the original session and turn without replacing their identity',()=>{
    expect(resumeWritingIdentity(JSON.parse(JSON.stringify(writing)),'session-a')).toEqual({sessionId:'session-a',turnId:'t_'+'a'.repeat(32)})
  })
  it('rejects another conversation and unknown dispatch or stopped work',()=>{
    expect(()=>resumeWritingIdentity(writing,'session-b')).toThrow()
    for(const status of ['cancelled','uncertain','settled','failed'] as const)expect(()=>resumeWritingIdentity({...writing,status},'session-a')).toThrow()
    expect(()=>resumeWritingIdentity({...writing,execution:{sessionId:'session-a',requestKey:'saved-key'}},'session-a')).toThrow()
  })
})
