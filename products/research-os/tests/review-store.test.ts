import {beforeEach,describe,expect,it,vi} from 'vitest'
vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{},removeItem:()=>{}})
vi.stubGlobal('document',{documentElement:{lang:'en'}})
const {useWorkbench}=await import('../src/store')
const scope={projectId:'project-a',workspace:'paper-a'}
const anchor={kind:'text' as const,workspace:'paper-a',path:'main.tex',digest:'v1',quote:'original'}
describe('F3 review routing in the real Zustand store',()=>{
 beforeEach(()=>{useWorkbench.setState({rightTabs:[],activeRightTab:'',reviewIntents:[],reviewFocus:null,reviewDockOpen:false,projectId:'other-project',activeNav:'workflow'})})
 it('deduplicates review tabs per project/workspace without changing the selected project',()=>{
  const a=useWorkbench.getState().openRightTab({kind:'reviews',scope}),b=useWorkbench.getState().openRightTab({kind:'reviews',scope:{...scope}})
  expect(a).toBe(b);expect(useWorkbench.getState().rightTabs).toHaveLength(1);expect(useWorkbench.getState().projectId).toBe('other-project')
 })
 it('keeps distinct project scopes separate',()=>{
  useWorkbench.getState().openRightTab({kind:'reviews',scope});useWorkbench.getState().openRightTab({kind:'reviews',scope:{...scope,projectId:'project-b'}})
  expect(useWorkbench.getState().rightTabs).toHaveLength(2)
 })
 it('captures an immutable versioned feedback object without sending a chat prompt or opening a competing reviews tab',()=>{
  const intent={id:'feedback',scope:{...scope},anchor:{...anchor},body:'review this',at:'2026-09-16T04:00:00Z'}
  useWorkbench.getState().requestReviewFeedback(intent);intent.anchor.quote='mutated';intent.scope.projectId='changed'
  expect(useWorkbench.getState().reviewIntents[0].anchor.quote).toBe('original');expect(useWorkbench.getState().reviewIntents[0].scope.projectId).toBe('project-a')
  expect(useWorkbench.getState().projectId).toBe('other-project')
  expect(useWorkbench.getState().reviewDockOpen).toBe(true)
  expect(useWorkbench.getState().activeNav).toBe('chat')
  expect(useWorkbench.getState().rightTabs).toHaveLength(0)
 })
 it('does not duplicate a retried feedback intent',()=>{
  const intent={id:'feedback',scope,anchor,body:'review',at:'2026-09-16T04:00:00Z'}
  useWorkbench.getState().requestReviewFeedback(intent);useWorkbench.getState().requestReviewFeedback(intent)
  expect(useWorkbench.getState().reviewIntents).toHaveLength(1)
  useWorkbench.getState().consumeReviewFeedback('feedback');expect(useWorkbench.getState().reviewIntents).toHaveLength(0)
 })
 it('focus requests retain source identity and are not content writes',()=>{
  useWorkbench.getState().setReviewFocus(scope,anchor)
  expect(useWorkbench.getState().reviewFocus?.anchor.digest).toBe('v1');expect(useWorkbench.getState().rightTabs).toHaveLength(0)
 })
})
