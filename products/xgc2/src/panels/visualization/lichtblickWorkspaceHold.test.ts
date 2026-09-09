import { describe,expect,it } from 'vitest';
import {
  EMPTY_LICHTBLICK_RUN_IDS,
  lichtblickProcessStillLive,
  lichtblickWorkspaceEmptyKind,
  lichtblickWorkspaceIsPreparing,
  nextHeldLichtblickActionRunIds,
  nextHeldLichtblickEmbed,
} from './lichtblickWorkspaceHold';

describe('lichtblickWorkspaceHold',() => {
  it('keeps the last Action run closure while owned processes are still live',() => {
    const previous = new Set(['run-1']);
    expect(nextHeldLichtblickActionRunIds({
      stopping:false,connected:true,liveRunIds:EMPTY_LICHTBLICK_RUN_IDS,
      previousRunIds:previous,previousOwnedStillLive:true,
    })).toBe(previous);
  });

  it('drops the held Action run when the workflow is stopping or disconnected',() => {
    const previous = new Set(['run-1']);
    expect(nextHeldLichtblickActionRunIds({
      stopping:true,connected:true,liveRunIds:previous,
      previousRunIds:previous,previousOwnedStillLive:true,
    })).toBe(EMPTY_LICHTBLICK_RUN_IDS);
    expect(nextHeldLichtblickActionRunIds({
      stopping:false,connected:false,liveRunIds:EMPTY_LICHTBLICK_RUN_IDS,
      previousRunIds:previous,previousOwnedStillLive:true,
    })).toBe(EMPTY_LICHTBLICK_RUN_IDS);
  });

  it('holds the last ready embed across a same-target hydration gap',() => {
    const previous = { url:'/embed-a',targetId:'local',processId:'process-a' };
    expect(nextHeldLichtblickEmbed({
      stopping:false,keepHold:true,targetId:'local',liveProcessId:'',
      live:null,previous,
    })).toEqual(previous);
  });

  it('does not reuse an embed from another target or process',() => {
    const previous = { url:'/embed-a',targetId:'local',processId:'process-a' };
    expect(nextHeldLichtblickEmbed({
      stopping:false,keepHold:true,targetId:'other',liveProcessId:'',
      live:null,previous,
    })).toBeNull();
    expect(nextHeldLichtblickEmbed({
      stopping:false,keepHold:true,targetId:'local',liveProcessId:'process-b',
      live:null,previous,
    })).toBeNull();
  });

  it('treats a connected runtime without an active Action as idle, not preparing',() => {
    expect(lichtblickWorkspaceIsPreparing({
      connected:true,active:false,runtimeLoading:false,
      hasOwnedLiveProcess:false,runtimeReady:false,
    })).toBe(false);
    expect(lichtblickWorkspaceEmptyKind({
      runtimeError:'',stopping:false,preparing:false,
    })).toBe('stopped');
  });

  it('marks a live desired process as still owned through starting and stopping',() => {
    expect(lichtblickProcessStillLive({ desiredState:'running',observedState:'starting' })).toBe(true);
    expect(lichtblickProcessStillLive({ desiredState:'stopped',observedState:'stopped' })).toBe(false);
  });
});
