// @vitest-environment jsdom
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {waitFor} from '@testing-library/react';
const api=vi.hoisted(()=>({updateNativePromptQueue:vi.fn()}));
vi.mock('./groundStationNativeAgentService',()=>({createGroundStationNativeClient:()=>api}));
import {NativePromptOutbox} from './nativePromptOutbox';
beforeEach(()=>{localStorage.clear();api.updateNativePromptQueue.mockReset()});
describe('native prompt outbox',()=>{
 it('accepts rapid messages immediately, freezes options and sends once in order',async()=>{
  const pending:Array<()=>void>=[];api.updateNativePromptQueue.mockImplementation(()=>new Promise(resolve=>pending.push(()=>resolve({revision:1,paused:false,items:[]}))));
  const store=new NativePromptOutbox('exp');const options={model:'chosen',permission:'full-access'};
  store.enqueue('one','s_a',options,async()=>'s_a');store.enqueue('two','s_a',options,async()=>'s_a');options.model='changed';
  expect(store.getSnapshot().items.map(p=>p.text)).toEqual(['one','two']);await waitFor(()=>expect(api.updateNativePromptQueue).toHaveBeenCalledTimes(1));
  pending.shift()!();await waitFor(()=>expect(api.updateNativePromptQueue).toHaveBeenCalledTimes(2));
  expect(api.updateNativePromptQueue.mock.calls[1]?.[1]).toMatchObject({text:'two',options:{model:'chosen'}});
  pending.shift()!();await waitFor(()=>expect(store.getSnapshot().items).toEqual([]));
 });
 it('pauses uncertain submissions and retries the same identity after reload',async()=>{
  api.updateNativePromptQueue.mockRejectedValue(new Error('connection lost'));
  const store=new NativePromptOutbox('persist');store.enqueue('one','s_a',{},async()=>'s_a');store.enqueue('two','s_a',{},async()=>'s_a');
  await waitFor(()=>expect(store.getSnapshot().items[0]?.error).toBe('connection lost'));expect(api.updateNativePromptQueue).toHaveBeenCalledTimes(1);
  const first=api.updateNativePromptQueue.mock.calls[0]?.[2];const restored=new NativePromptOutbox('persist');expect(restored.getSnapshot().items).toHaveLength(2);
  api.updateNativePromptQueue.mockResolvedValue({revision:2,paused:false,items:[]});restored.retry(restored.getSnapshot().items[0]!.id,async()=>'s_a');
  await waitFor(()=>expect(api.updateNativePromptQueue).toHaveBeenCalledTimes(2));expect(api.updateNativePromptQueue.mock.calls[1]?.[2]).toBe(first);
 });
});
