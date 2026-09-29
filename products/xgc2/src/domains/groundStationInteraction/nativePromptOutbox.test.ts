// @vitest-environment jsdom
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {waitFor} from '@testing-library/react';
const api=vi.hoisted(()=>({updateNativePromptQueue:vi.fn()}));
vi.mock('./groundStationAgentService',()=>({createGroundStationNativeClient:()=>api}));
import {AgentPromptOutbox} from './nativePromptOutbox';
beforeEach(()=>{localStorage.clear();api.updateNativePromptQueue.mockReset()});
describe('native prompt outbox',()=>{
 it('accepts rapid messages immediately, freezes options and sends once in order',async()=>{
  const pending:Array<()=>void>=[];api.updateNativePromptQueue.mockImplementation(()=>new Promise(resolve=>pending.push(()=>resolve({revision:1,paused:false,items:[]}))));
  const store=new AgentPromptOutbox('exp');const options={model:'chosen',permission:'full-access'};
  store.enqueue('one','s_a',options,async()=>'s_a');store.enqueue('two','s_a',options,async()=>'s_a');options.model='changed';
  expect(store.getSnapshot().items.map(p=>p.text)).toEqual(['one','two']);await waitFor(()=>expect(api.updateNativePromptQueue).toHaveBeenCalledTimes(1));
  pending.shift()!();await waitFor(()=>expect(api.updateNativePromptQueue).toHaveBeenCalledTimes(2));
  expect(api.updateNativePromptQueue.mock.calls[1]?.[1]).toMatchObject({text:'two',options:{model:'chosen'}});
  // HTTP acknowledgement alone marks rows accepted; the canonical journal or a
  // queued receipt drains them, so an acknowledged row never flashes away.
  pending.shift()!();await waitFor(()=>expect(store.getSnapshot().items.every(p=>p.accepted)).toBe(true));
  expect(store.getSnapshot().items).toHaveLength(2);
  const turns=store.getSnapshot().items.map(p=>({role:'user' as const,turnId:p.turnId}));
  store.reconcile('s_a',turns as never);
  expect(store.getSnapshot().items).toEqual([]);
 });
 it('pauses uncertain submissions and retries the same identity after reload',async()=>{
  api.updateNativePromptQueue.mockRejectedValue(new Error('connection lost'));
  const store=new AgentPromptOutbox('persist');store.enqueue('one','s_a',{},async()=>'s_a');store.enqueue('two','s_a',{},async()=>'s_a');
  await waitFor(()=>expect(store.getSnapshot().items[0]?.error).toBe('connection lost'));expect(api.updateNativePromptQueue).toHaveBeenCalledTimes(1);
  const first=api.updateNativePromptQueue.mock.calls[0]?.[2];const restored=new AgentPromptOutbox('persist');expect(restored.getSnapshot().items).toHaveLength(2);
  api.updateNativePromptQueue.mockResolvedValue({revision:2,paused:false,items:[]});restored.retry(restored.getSnapshot().items[0]!.id,async()=>'s_a');
  await waitFor(()=>expect(api.updateNativePromptQueue).toHaveBeenCalledTimes(2));expect(api.updateNativePromptQueue.mock.calls[1]?.[2]).toBe(first);
 });
});
