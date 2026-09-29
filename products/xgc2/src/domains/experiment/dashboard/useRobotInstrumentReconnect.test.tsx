// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act,renderHook,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { AutomationChildRunRelation,AutomationRun,AutomationRunDetail,AutomationStopRunSetResponse } from '../../automation/automationPublic';
import { useRobotInstrumentReconnect,type InstrumentReconnectStop } from './useRobotInstrumentReconnect';

vi.mock('../../groundStationInteraction/groundStationInteractionPublic',() => ({ useGroundStationErrorNotification:vi.fn() }));

type Options=Parameters<typeof useRobotInstrumentReconnect>[0];
function detail(id:string,status:AutomationRun['status']='waiting',revision=3,children:AutomationChildRunRelation[]=[]):AutomationRunDetail {
  return {
    run:{ id,targetId:'local',status,revision,terminationKind:status==='stopped' ? 'stopped' : undefined } as AutomationRun,
    loading:false,error:'',invocations:[],nodeSummaries:[],
    relations:{ runId:id,childRuns:children,childRunGroups:[],childRunGroupMembers:[],waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[] },
  };
}
function child(id:string,overrides:Partial<AutomationChildRunRelation>={}):AutomationChildRunRelation {
  return { childRunId:id,targetId:'local',boundAt:'t',runRevision:3,relation:'supervised',cancelPolicy:'cascade',...overrides } as AutomationChildRunRelation;
}
function receipt(anchor:string,ids=[anchor]):AutomationStopRunSetResponse {
  return { anchorRunId:anchor,receipt:{} as AutomationStopRunSetResponse['receipt'],outcomes:ids.map((runId) => ({ runId,priorStatus:'waiting',accepted:true,alreadyTerminal:false,error:'' })) };
}
function deferred<T>() {
  let resolve!:(value:T) => void;
  let reject!:(cause:Error) => void;
  const promise=new Promise<T>((yes,no) => { resolve=yes;reject=no; });
  return { promise,resolve,reject };
}
function fixture(ids=['a','b']) {
  const releases=new Map<string,ReturnType<typeof vi.fn>>();
  const retainRunObservation=vi.fn((id:string) => {
    const release=vi.fn();releases.set(id,release);return release;
  });
  const start=vi.fn(async (_ids:readonly string[]) => ({ id:'new-run' }));
  const onStarted=vi.fn();
  const data:Record<string,AutomationRunDetail>=Object.fromEntries(ids.map((id) => [id,detail(id)]));
  // The dashboard Run store: observations are read on demand and changes are
  // announced to subscribers, without re-rendering the header.
  let observations:ReturnType<Options['observations']>=new Map([['local',{ runDetailsById:data,retainRunObservation }]]);
  const listeners=new Set<() => void>();
  const options:Options={ scopeKey:'experiment:head:panel:simulation',targetId:'local',canceled:false,
    observations:() => observations,
    subscribe:(listener) => { listeners.add(listener);return () => { listeners.delete(listener); }; },
    start,onStarted };
  const stops:InstrumentReconnectStop[]=ids.map((id) => ({ targetId:'local',run:{ id,status:'waiting',revision:3 },stop:vi.fn(async () => receipt(id)) }));
  const mounted=renderHook((props:Options) => useRobotInstrumentReconnect(props),{ initialProps:options,wrapper:StrictMode });
  return { ...mounted,options,data,stops,start,onStarted,releases,retainRunObservation,listeners,
    observe:(next:ReturnType<Options['observations']>) => { observations=next; },
    /** Publishes the mutated observations, then re-renders with the current options. */
    refresh:() => {
      observations=new Map(observations);
      act(() => { listeners.forEach((listener) => listener()); });
      mounted.rerender({ ...options });
    } };
}
async function begin(f:ReturnType<typeof fixture>,ids=['robot-b','robot-a']) {
  await act(async () => { f.result.current.reconnect(ids,f.stops); });
}

describe('selected instrument reconnect completion barrier',() => {
  it('freezes the whole selection, sends all Stops first, and waits for every receipt and cleanup',async () => {
    const f=fixture();
    const a=deferred<AutomationStopRunSetResponse>(),b=deferred<AutomationStopRunSetResponse>();
    f.stops[0]!.stop=vi.fn(() => a.promise);f.stops[1]!.stop=vi.fn(() => b.promise);
    const selected=['robot-b','robot-a'];
    act(() => { f.result.current.reconnect(selected,f.stops);f.result.current.reconnect(['other'],f.stops); });
    selected.splice(0,2,'other');
    expect(f.stops.map((stop) => vi.mocked(stop.stop).mock.calls.length)).toEqual([1,1]);
    expect(f.retainRunObservation).toHaveBeenCalledWith('a');
    f.data.a=detail('a','stopped',4);f.data.b=detail('b','stopped',4);f.refresh();
    await act(async () => { a.resolve(receipt('a')); });
    expect(f.start).not.toHaveBeenCalled();
    f.data.b=detail('b','stopping',4);f.refresh();
    await act(async () => { b.resolve(receipt('b')); });
    expect(f.result.current.phase).toBe('waiting');expect(f.start).not.toHaveBeenCalled();
    f.data.b=detail('b','stopped',5);f.refresh();
    await waitFor(() => expect(f.start).toHaveBeenCalledExactlyOnceWith(['robot-a','robot-b']));
    expect(f.onStarted).toHaveBeenCalledWith({ id:'new-run' },['robot-a','robot-b']);
    f.refresh();expect(f.start).toHaveBeenCalledTimes(1);
    expect([...f.releases.values()].every((release) => release.mock.calls.length===1)).toBe(true);
  });
  it('follows Run store notifications during the cleanup wait without a header re-render',async () => {
    const f=fixture(['a']);await begin(f);
    expect(f.result.current.phase).toBe('waiting');
    expect(f.listeners.size).toBeGreaterThan(0);
    f.data.a=detail('a','stopped',4);
    f.observe(new Map(f.options.observations()));
    act(() => { f.listeners.forEach((listener) => listener()); });
    await waitFor(() => expect(f.start).toHaveBeenCalledExactlyOnceWith(['robot-a','robot-b']));
    await waitFor(() => expect(f.result.current.phase).toBe('idle'));
    // Only the cleanup wait follows the store.
    expect(f.listeners.size).toBe(0);
  });
  it('connects the original all-disconnected selection once with no Stop, and rejects empty selection',async () => {
    const f=fixture([]);
    await begin(f,[]);expect(f.start).not.toHaveBeenCalled();
    await begin(f);expect(f.start).toHaveBeenCalledExactlyOnceWith(['robot-a','robot-b']);
  });
  it('includes originally disconnected robots in the second phase of a mixed batch',async () => {
    const f=fixture(['a']);await begin(f,['connected','disconnected']);
    f.data.a=detail('a','stopped',4);f.refresh();
    await waitFor(() => expect(f.start).toHaveBeenCalledExactlyOnceWith(['connected','disconnected']));
  });
  it.each(['http','outcome','not-accepted','wrong-anchor'] as const)('refuses a %s Stop failure after all requests settle',async (failure) => {
    const f=fixture();const pending=deferred<AutomationStopRunSetResponse>();f.stops[1]!.stop=() => pending.promise;
    f.stops[0]!.stop=async () => {
      if (failure==='http') throw new Error('raw internal /private error');
      const value=receipt(failure==='wrong-anchor' ? 'wrong' : 'a');
      if (failure==='outcome') value.outcomes[0]={ ...value.outcomes[0]!,accepted:false,error:'raw secret' };
      if (failure==='not-accepted') value.outcomes[0]={ ...value.outcomes[0]!,accepted:false };
      return value;
    };
    await begin(f);expect(f.result.current.busy).toBe(true);expect(f.start).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(receipt('b')); });
    expect(f.result.current.busy).toBe(false);expect(f.result.current.error).toContain('could not all be disconnected');
    expect(f.result.current.error).not.toMatch(/raw|private|secret/);expect(f.start).not.toHaveBeenCalled();
  });
  it.each(['missing','loading','old-revision','missing-relations'] as const)('does not use %s as a completion proof',async (kind) => {
    const f=fixture(['a']);await begin(f);
    f.data.a=detail('a','stopped',4);
    if (kind==='missing') delete f.data.a;
    if (kind==='loading') f.data.a!.loading=true;
    if (kind==='old-revision') f.data.a=detail('a','stopped',3);
    if (kind==='missing-relations') delete f.data.a!.relations;
    f.refresh();expect(f.start).not.toHaveBeenCalled();expect(f.result.current.busy).toBe(true);
  });
  it('keeps the revision fence even when the newest observation has not supplied its relations yet',async () => {
    const f=fixture(['a']);await begin(f);
    f.data.a=detail('a','stopping',7);delete f.data.a.relations;f.refresh();
    f.data.a=detail('a','stopped',6);f.refresh();expect(f.start).not.toHaveBeenCalled();
    f.data.a=detail('a','stopped',8);f.refresh();await waitFor(() => expect(f.start).toHaveBeenCalledTimes(1));
  });
  it('checks detached Stop-set outcomes even when the anchor is clean and terminal',async () => {
    const f=fixture(['a']);f.stops[0]!.stop=async () => receipt('a',['a','detached']);
    f.data.detached=detail('detached');await begin(f);
    f.data.a=detail('a','stopped',4);f.refresh();
    expect(f.retainRunObservation).toHaveBeenCalledWith('detached');expect(f.start).not.toHaveBeenCalled();
    f.data.detached=detail('detached','failed',5);f.data.detached.run!.cleanupErrors=['upstream failed'];f.refresh();
    expect(f.start).not.toHaveBeenCalled();expect(f.result.current.error).toContain('cleanup');
  });
  it('does not forget failed cleanup when a later retry sees an empty active-run list',async () => {
    const f=fixture(['a']);await begin(f);
    f.data.a=detail('a','failed',4);f.data.a.run!.cleanupErrors=['cleanup incomplete'];f.refresh();
    expect(f.result.current.busy).toBe(false);expect(f.start).not.toHaveBeenCalled();
    await act(async () => { f.result.current.reconnect(['robot-a'],[]); });
    expect(f.start).not.toHaveBeenCalled();expect(f.result.current.error).toContain('cleanup');
  });
  it('waits for exact child cleanup instead of trusting parent terminal or relation terminal',async () => {
    const f=fixture(['a']);await begin(f);
    f.data.a=detail('a','stopped',4,[child('late-child',{ runStatus:'stopped',runRevision:5 })]);
    f.data['late-child']=detail('late-child','stopped',4);f.refresh();expect(f.start).not.toHaveBeenCalled();
    f.data['late-child']=detail('late-child','stopped',5);f.refresh();
    await waitFor(() => expect(f.start).toHaveBeenCalledTimes(1));
  });
  it('requires explicit abandoned-intent proof for a queued outcome with no Run',async () => {
    const f=fixture(['a']);const accepted=receipt('a',['a','prepared']);accepted.outcomes[1]!.priorStatus='queued';
    f.stops[0]!.stop=async () => accepted;await begin(f);
    f.data.a=detail('a','stopped',4,[child('prepared',{ boundAt:undefined,runRevision:undefined })]);f.refresh();
    expect(f.start).not.toHaveBeenCalled();expect(f.retainRunObservation).not.toHaveBeenCalledWith('prepared');
    f.data.a=detail('a','stopped',4,[child('prepared',{ boundAt:undefined,launchAbandonedAt:'t',runRevision:undefined })]);f.refresh();
    await waitFor(() => expect(f.start).toHaveBeenCalledTimes(1));
  });
  it.each(['observation-error','wrong-target','external-status'] as const)('fails closed for %s without local fallback',async (kind) => {
    const f=fixture(['a']);await begin(f);f.data.a=detail('a','stopped',4);
    if (kind==='observation-error') f.data.a.error='raw upstream error';
    if (kind==='wrong-target') f.data.a.run!.targetId='other';
    if (kind==='external-status') f.data.a.relations!.childRuns=[child('external',{ targetRoot:true,observedStatus:'stopped' })];
    f.refresh();expect(f.start).not.toHaveBeenCalled();expect(f.result.current.error).toContain('could not be verified');
    expect(f.retainRunObservation).not.toHaveBeenCalledWith('external');
  });
  it.each(['unmount','scope','total-stop'] as const)('does not restart after %s and late Stop responses',async (kind) => {
    const f=fixture(['a']);const pending=deferred<AutomationStopRunSetResponse>();f.stops[0]!.stop=() => pending.promise;
    await begin(f);
    if (kind==='unmount') f.unmount();
    if (kind==='scope') { f.options.scopeKey='other';f.refresh(); }
    if (kind==='total-stop') { f.options.canceled=true;f.refresh();f.options.canceled=false;f.refresh(); }
    f.data.a=detail('a','stopped',4);
    await act(async () => { pending.resolve(receipt('a')); });
    expect(f.start).not.toHaveBeenCalled();expect(f.releases.get('a')).toHaveBeenCalledOnce();
  });
  it('cancels during the cleanup wait when Total Stop begins, even if it later clears',async () => {
    const f=fixture(['a']);await begin(f);f.options.canceled=true;f.refresh();
    f.options.canceled=false;f.data.a=detail('a','stopped',4);f.refresh();
    expect(f.start).not.toHaveBeenCalled();expect(f.result.current.busy).toBe(false);
  });
  it('ignores a late Connect response after unmount without publishing a new selection coverage',async () => {
    const f=fixture([]);const pending=deferred<{ id:string }>();f.start.mockReturnValueOnce(pending.promise);
    await begin(f);expect(f.start).toHaveBeenCalledTimes(1);f.unmount();
    await act(async () => { pending.resolve({ id:'late' }); });
    expect(f.onStarted).not.toHaveBeenCalled();
  });
  it('freezes Stop identities even if the supplied target objects change during the requests',async () => {
    const f=fixture(['a']);const pending=deferred<AutomationStopRunSetResponse>();f.stops[0]!.stop=() => pending.promise;
    await begin(f);f.stops[0]!.run.id='other';f.stops[0]!.run.revision=100;
    await act(async () => { pending.resolve(receipt('a')); });
    f.data.a=detail('a','stopped',4);f.refresh();await waitFor(() => expect(f.start).toHaveBeenCalledTimes(1));
  });
  it('uses the routed Core observation owner rather than a same-ID local Run',async () => {
    const f=fixture(['a']);
    const remote:Record<string,AutomationRunDetail>={ a:detail('a') };
    const retain=vi.fn(() => vi.fn());
    f.options.targetId='core:remote';f.observe(new Map([...f.options.observations(),['core:remote',{ runDetailsById:remote,retainRunObservation:retain }]]));
    f.stops[0]!.targetId='core:remote';f.refresh();await begin(f);
    f.data.a=detail('a','stopped',4);f.refresh();expect(f.start).not.toHaveBeenCalled();
    expect(retain).toHaveBeenCalledWith('a');expect(f.retainRunObservation).not.toHaveBeenCalled();
    remote.a=detail('a','stopped',4);f.refresh();await waitFor(() => expect(f.start).toHaveBeenCalledTimes(1));
  });
});
