import {describe,it,expect} from 'vitest';
import type {NativeItem} from '@xgc2/native-agent/state';
import {pendingMessageVisible,type PendingChatMessage} from './groundStationPendingMessages';
const message:PendingChatMessage={id:'local',sessionId:'a',text:'same',createdAt:'now',state:'sending',knownKeys:['old']};
const item=(key:string,turnId:string):NativeItem=>({key,turnId,id:'user',role:'user',text:'same',title:'',status:'submitted',truncated:false});
describe('immediate user message reconciliation',()=>{
 it('shows before receipt, isolates sessions and preserves repeated text',()=>{
  expect(pendingMessageVisible(message,'a',[item('old','old-turn')])).toBe(true);
  expect(pendingMessageVisible(message,'b',[])).toBe(false);
  expect(pendingMessageVisible(message,'a',[item('new','new-turn')])).toBe(false);
 });
 it('uses the acknowledged turn identity and keeps failed messages visible',()=>{
  expect(pendingMessageVisible({...message,turnId:'expected'},'a',[item('new','other')])).toBe(true);
  expect(pendingMessageVisible({...message,turnId:'expected'},'a',[item('new','expected')])).toBe(false);
  expect(pendingMessageVisible({...message,state:'failed'},'a',[])).toBe(true);
 });
});
