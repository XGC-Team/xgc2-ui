// @vitest-environment jsdom
import { act,renderHook,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { AutomationRunDetail,AutomationRunSnapshot } from '../domains/automation/automationPublic';
import { getAutomationRunDetail,getAutomationRunSnapshot } from '../domains/automation/automationRunService';
import { useAutomationRunDetails } from '../domains/automation/useAutomationRunDetails';
import type { PanelActionInvocation,PanelActionPortRuntime } from '../panels/types';
import { usePanelInvocationObservation } from '../panels/usePanelInvocationObservation';
import { createPanelExecutionObserver } from '../panels/panelExecutionObserver';
import { testPanelExecution,testRunDetails } from './panelExecutionTestSupport';

vi.mock('../domains/automation/automationRunService',() => ({
  getAutomationRun:vi.fn(),getAutomationRunDetail:vi.fn(),getAutomationRunSnapshot:vi.fn(),
}));
const retainObservation = vi.hoisted(() => vi.fn(() => vi.fn()));
vi.mock('../domains/automation/useAutomationRunObservations',() => ({
  useAutomationRunObservations:() => retainObservation,
}));

function detail(id:string,status:PanelActionInvocation['status'],revision:number) {
  return { run:{ id,status,revision },nodeSummaries:[],invocations:[],loading:false,error:'' } as unknown as AutomationRunDetail;
}
function port(load: (id:string) => Promise<AutomationRunDetail>): PanelActionPortRuntime {
  return {
    id:'render',label:'Render',connected:true,disabledReason:'',defaults:{},trace:{},
    invoke:vi.fn(),control:vi.fn(),
    execution:testPanelExecution({},{ loadRunDetail:vi.fn(load),retainRunDetail:vi.fn(),retainRunObservation:vi.fn(() => vi.fn()) }),
  };
}
const receipt: PanelActionInvocation = { id:'own',status:'running',revision:1 };

describe('shared exact Panel invocation observer',() => {
  it('retains once, loads once and consumes only the store without a latest projection',async () => {
    const action = port(async () => detail('own','running',1));
    const release = vi.fn();
    action.execution!.retainRunObservation = vi.fn(() => release);
    const { result,rerender,unmount } = renderHook(() => usePanelInvocationObservation(action,receipt));
    await waitFor(() => expect(action.execution!.loadRunDetail).toHaveBeenCalledTimes(1));
    expect(result.current.detail).toBeUndefined();
    testRunDetails(action.execution).own = detail('own','running',1);
    rerender();
    expect(result.current.detail?.run?.status).toBe('running');
    expect(action.execution!.loadRunDetail).toHaveBeenCalledTimes(1);
    testRunDetails(action.execution).own = detail('own','succeeded',3);
    rerender();
    expect(result.current.invocation?.status).toBe('succeeded');
    expect(release).toHaveBeenCalledTimes(1);
    testRunDetails(action.execution).own = detail('own','running',2);
    rerender();
    expect(result.current.invocation?.status).toBe('succeeded');
    expect(action.execution!.loadRunDetail).toHaveBeenCalledTimes(1);
    unmount();
    expect(action.control).not.toHaveBeenCalled();
  });

  it('does not occupy a finite command whose admission is already terminal',async () => {
    const action = port(async () => detail('own','succeeded',2));
    const { result } = renderHook(() => usePanelInvocationObservation(action,{ ...receipt,status:'succeeded',revision:2 }));
    await waitFor(() => expect(result.current.invocation?.status).toBe('succeeded'));
    expect(action.execution!.retainRunObservation).not.toHaveBeenCalled();
  });

  it('fences a late load error by exact id when a different command is accepted',async () => {
    let finish!: (value:AutomationRunDetail) => void;
    const seed = new Promise<AutomationRunDetail>((resolve) => { finish=resolve; });
    const action = port((id) => id === 'own' ? seed : Promise.resolve(detail(id,'running',1)));
    const { result,rerender } = renderHook(({ accepted }) => usePanelInvocationObservation(action,accepted),{
      initialProps:{ accepted:receipt },
    });
    await waitFor(() => expect(action.execution!.loadRunDetail).toHaveBeenCalledWith('own'));
    rerender({ accepted:{ ...receipt,id:'next' } });
    testRunDetails(action.execution).next = detail('next','running',1);
    rerender({ accepted:{ ...receipt,id:'next' } });
    await waitFor(() => expect(result.current.detail?.run?.id).toBe('next'));
    await act(async () => finish({ ...detail('own','succeeded',9),error:'old request failed' }));
    expect(result.current.invocation?.id).toBe('next');
    expect(result.current.detail?.run?.id).toBe('next');
    expect(result.current.error).toBe('');
  });

  it('reports a resolved load error before store projection without inventing a terminal Run',async () => {
    const action = port(async () => ({ invocations:[],nodeSummaries:[],loading:false,error:'snapshot unavailable' }));
    const { result,rerender } = renderHook(() => usePanelInvocationObservation(action,receipt));
    await waitFor(() => expect(result.current.error).toBe('snapshot unavailable'));
    expect(result.current.invocation).toEqual(receipt);
    rerender();
    expect(action.execution!.loadRunDetail).toHaveBeenCalledTimes(1);
  });

  it('does not retain load detail across a domain stream reset or rank child facts by the parent revision',async () => {
    const initial = childDetail(5,1,1,'waiting');
    const action = port(async () => initial);
    testRunDetails(action.execution).own = initial;
    const { result,rerender } = renderHook(() => usePanelInvocationObservation(action,receipt,true));
    await waitFor(() => expect(action.execution!.loadRunDetail).toHaveBeenCalledTimes(1));
    expect(result.current.detail).toBe(initial);
    const details = testRunDetails(action.execution);
    Object.keys(details).forEach((id) => { delete details[id]; });
    rerender();
    expect(result.current.detail).toBeUndefined();
    const current = childDetail(3,2,4,'stopped');
    testRunDetails(action.execution).own = current;
    rerender();
    expect(result.current.detail).toBe(current);
    expect(result.current.detail?.relations?.childRuns[0]).toMatchObject({ revision:2,runRevision:4,runStatus:'stopped' });
  });
});

describe('Panel observation with the real domain detail store',() => {
  function renderDomainObserver() {
    const action = port(vi.fn());
    const markExecutionHistoryObserved = vi.fn();
    vi.mocked(getAutomationRunSnapshot).mockResolvedValue({ runId:'own' } as AutomationRunSnapshot);
    return renderHook(() => {
      const domain = useAutomationRunDetails({ targetId:'local',markExecutionHistoryObserved });
      const execution = createPanelExecutionObserver(() => domain.runDetailsById,() => () => undefined,domain);
      const observation = usePanelInvocationObservation({ ...action,execution },receipt,true);
      return { domain,observation };
    });
  }

  it('reports resolved first-load and refresh failures, then clears errors on domain recovery',async () => {
    vi.mocked(getAutomationRunDetail).mockReset().mockRejectedValueOnce(new Error('snapshot unavailable'));
    const { result } = renderDomainObserver();
    await waitFor(() => expect(result.current.observation.error).toBe('snapshot unavailable'));
    expect(result.current.observation.detail).toBeUndefined();
    expect(result.current.observation.invocation).toEqual(receipt);
    vi.mocked(getAutomationRunDetail).mockResolvedValue(childDetail(5,1,1,'waiting'));
    await act(async () => { await result.current.domain.refreshRun('own'); });
    expect(result.current.observation.error).toBe('');
    expect(result.current.observation.invocation).toEqual({ id:'own',status:'succeeded',revision:5 });
    const retainedRun = result.current.observation.detail?.run;
    vi.mocked(getAutomationRunDetail).mockRejectedValueOnce(new Error('refresh unavailable'));
    await act(async () => {
      const value = await result.current.domain.refreshRun('own');
      expect(value.error).toBe('refresh unavailable');
    });
    expect(result.current.observation.error).toBe('refresh unavailable');
    expect(result.current.observation.detail?.run).toBe(retainedRun);
    expect(result.current.observation.invocation).toEqual({ id:'own',status:'succeeded',revision:5 });
    await act(async () => { await result.current.domain.refreshRun('own'); });
    expect(result.current.observation.error).toBe('');
  });

  it('consumes independently merged child facts and immediately loses detail on domain reset',async () => {
    vi.mocked(getAutomationRunDetail).mockReset().mockResolvedValue(childDetail(5,1,1,'waiting'));
    const { result } = renderDomainObserver();
    await waitFor(() => expect(result.current.observation.detail?.run?.revision).toBe(5));
    vi.mocked(getAutomationRunDetail).mockResolvedValue(childDetail(3,2,4,'stopped'));
    await act(async () => { await result.current.domain.refreshRun('own'); });
    expect(result.current.observation.detail).toBe(result.current.domain.runDetailsById.own);
    expect(result.current.observation.detail?.run?.revision).toBe(5);
    expect(result.current.observation.detail?.relations?.childRuns[0]).toMatchObject({ revision:2,runRevision:4,runStatus:'stopped' });
    act(() => result.current.domain.resetRunDetails());
    expect(result.current.observation.detail).toBeUndefined();
  });
});

function childDetail(parentRevision:number,linkRevision:number,childRevision:number,childStatus:PanelActionInvocation['status']) {
  return {
    ...detail('own','succeeded',parentRevision),
    run:{ id:'own',status:'succeeded',revision:parentRevision },
    invocations:[{ id:'call',revision:1,attempts:[] }],
    relations:{
      runId:'own',childRuns:[{
        id:'link',targetId:'local',parentRunId:'own',rootRunId:'own',parentInvocationId:'call',childRunId:'child',
        revision:linkRevision,runRevision:childRevision,runStatus:childStatus,
      }],
      childRunGroups:[],childRunGroupMembers:[],waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
    },
  } as unknown as AutomationRunDetail & { run:NonNullable<AutomationRunDetail['run']>;relations:NonNullable<AutomationRunDetail['relations']> };
}
