// @vitest-environment jsdom

import { useState } from 'react';
import { act,renderHook } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { AutomationStopRunSetResponse } from '../../automation/automationPublic';
import { newExperimentSpec,type ExperimentDocument } from '../experimentModel';
import type { ExperimentRunView } from '../experimentWorkflowService';
import { useExperimentDashboardActions,type ExperimentRuntimeProjection } from './useExperimentDashboardActions';

describe('useExperimentDashboardActions orchestration lifecycle',() => {
  it('starts the selected Experiment with runMode as an ordinary parameter input',async () => {
    const startWorkflow = vi.fn(async () => experimentRun('run-1'));
    const { result } = renderHook(() => useActions({ startWorkflow }));
    await act(async () => { await result.current.startExperiment(); });
    expect(startWorkflow).toHaveBeenCalledWith('local',expect.objectContaining({
      head:expect.objectContaining({ resourceId:'experiment-a' }),
    }),'simulation');
    expect(result.current.activeRun?.id).toBe('run-1');
  });

  it('Total Stop controls the exact System Runner root through stop-set',async () => {
    const active = experimentRun('run-1',9);
    const stopWorkflow = vi.fn(async () => stopSetResult(active.id));
    const { result } = renderHook(() => useActions({
      stopWorkflow,runtimeProjection:projection(active),
    }));
    await act(async () => { await result.current.stopExperiment(); });
    expect(stopWorkflow).toHaveBeenCalledWith('local',expect.objectContaining({ head:expect.objectContaining({ resourceId:'experiment-a' }) }));
  });

  it('Total Stop closes a Session owned only by an ordinary user workflow root',async () => {
    const stopWorkflow = vi.fn(async () => stopSetResult('stop-all'));
    const { result } = renderHook(() => useActions({
      stopWorkflow,runtimeProjection:{ ...projection(),sessionActive:true },
    }));
    expect(result.current.experimentIsRunning).toBe(true);
    expect(result.current.activeRun).toBeUndefined();
    expect(result.current.canStopExperiment).toBe(true);
    await act(async () => { await result.current.stopExperiment(); });
    expect(stopWorkflow).toHaveBeenCalledWith(
      'local',expect.objectContaining({ head:expect.objectContaining({ resourceId:'experiment-a' }) }),
    );
  });

  it('supports Run -> Stop -> Run without retaining a stale controller',async () => {
    const startWorkflow = vi.fn(async () => experimentRun(`run-${startWorkflow.mock.calls.length}`));
    const stopWorkflow = vi.fn(async (_targetId:string,_experiment:ExperimentDocument) => stopSetResult('run-1'));
    const state:{ active?:ExperimentRunView;observed:ReadonlySet<string> } = { observed:new Set() };
    const { result,rerender } = renderHook(() => useActions({
      startWorkflow,stopWorkflow,
      runtimeProjection:projection(state.active,state.observed),
    }));
    await act(async () => { await result.current.startExperiment(); });
    state.active = experimentRun('run-1');state.observed = new Set(['run-1']);rerender();
    await act(async () => { await result.current.stopExperiment(); });
    state.active = undefined;rerender();
    await act(async () => { await result.current.startExperiment(); });
    expect(startWorkflow).toHaveBeenCalledTimes(2);
  });

  it('recovers Run state only after dedicated Stop Session convergence becomes empty',async () => {
    const stopWorkflow=vi.fn(async () => stopSetResult('run-1'));
    let resolveConvergence:(() => void)|undefined;
    const convergenceWork=new Promise<void>((resolve) => { resolveConvergence=resolve; });
    const convergeStoppedSession=vi.fn(() => convergenceWork);
    const { result }=renderHook(() => {
      const [running,setRunning]=useState(true);
      const active=running ? { ...experimentRun('run-1'),status:'stopping' as const } : undefined;
      return useActions({
        stopWorkflow,
        runtimeProjection:{
          ...projection(active),
          activeRuns:active ? [active] : [],
          sessionActive:running,
          convergeStoppedSession:async () => {
            await convergeStoppedSession();
            setRunning(false);
          },
        },
      });
    });

    expect(result.current.experimentIsRunning).toBe(true);
    expect(result.current.canStartExperiment).toBe(false);
    let stopping:Promise<unknown>|undefined;
    act(() => { stopping=result.current.stopExperiment(); });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(convergeStoppedSession).toHaveBeenCalledOnce();
    expect(result.current.stopAllInFlight).toBe(true);
    expect(result.current.experimentIsRunning).toBe(true);
    expect(result.current.activeRuns).toEqual([expect.objectContaining({ status:'stopping' })]);
    await act(async () => { resolveConvergence?.();await stopping; });

    expect(result.current.stopAllInFlight).toBe(false);
    expect(result.current.experimentIsRunning).toBe(false);
    expect(result.current.activeRun).toBeUndefined();
    expect(result.current.canStartExperiment).toBe(true);
    expect(result.current.startDisabledReason).toBe('');
  });

  it('fails closed when bounded Stop Session convergence times out',async () => {
    const active={ ...experimentRun('run-1'),status:'stopping' as const };
    const timeout=new Error('Experiment Session experiment-a remained active after Stop for 180000 ms.');
    const convergeStoppedSession=vi.fn(async () => { throw timeout; });
    const { result }=renderHook(() => useActions({
      stopWorkflow:vi.fn(async () => stopSetResult('run-1')),
      runtimeProjection:{
        ...projection(active),activeRuns:[active],sessionActive:true,convergeStoppedSession,
      },
    }));

    await act(async () => {
      await expect(result.current.stopExperiment()).rejects.toThrow(timeout.message);
    });

    expect(result.current.stopAllInFlight).toBe(false);
    expect(result.current.experimentIsRunning).toBe(true);
    expect(result.current.canStartExperiment).toBe(false);
    expect(result.current.startDisabledReason).toBe('The Experiment is stopping.');
    expect(result.current.actionError).toBe(timeout.message);
  });

  it('fails closed while the bounded System Runner snapshot is unresolved',() => {
    const { result } = renderHook(() => useActions({
      runtimeProjection:{
        loading:true,error:'',stateLoading:true,stateResolved:false,
        observedRunIds:new Set(),refresh:vi.fn(async () => undefined),
        convergeStoppedSession:vi.fn(async () => undefined),
      },
    }));
    expect(result.current.lifecycleStateLoading).toBe(true);
    expect(result.current.canStartExperiment).toBe(false);
    expect(result.current.startDisabledReason).toBe('The Experiment state is being restored.');
  });

  it('arms System Runner reconciliation while Start is in flight without polling',async () => {
    let resolveStart:((run:ExperimentRunView) => void)|undefined;
    const startWorkflow = vi.fn(() => new Promise<ExperimentRunView>((resolve) => { resolveStart = resolve; }));
    const refresh = vi.fn(async () => undefined);
    const { result } = renderHook(() => useActions({
      startWorkflow,runtimeProjection:{ ...projection(),refresh },
    }));
    let started:Promise<unknown>|undefined;
    act(() => { started = result.current.startExperiment(); });
    expect(result.current.startInFlight).toBe(true);
    expect(result.current.canStopExperiment).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => { resolveStart?.(experimentRun('run-1'));await started; });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('makes the first Panel Run immediately own the Experiment lifecycle',async () => {
    let resolveStart:((run:ExperimentRunView) => void)|undefined;
    const startPanelWorkflow = vi.fn(() => new Promise<ExperimentRunView>((resolve) => { resolveStart = resolve; }));
    const { result } = renderHook(() => useActions({ startPanelWorkflow }));
    let started:Promise<unknown>|undefined;
    act(() => { started = result.current.startPanel('panel-a',{ speed:2 }); });
    expect(result.current.startInFlight).toBe(true);
    expect(result.current.experimentIsRunning).toBe(true);
    expect(result.current.canStopExperiment).toBe(true);
    expect(startPanelWorkflow).toHaveBeenCalledWith(
      'local',expect.objectContaining({ head:expect.objectContaining({ resourceId:'experiment-a' }) }),
      'simulation','panel-a',{ speed:2 },
    );
    await act(async () => { resolveStart?.(experimentRun('panel-root'));await started; });
    expect(result.current.activeRun?.id).toBe('panel-root');
  });

  it('makes the first Panel Action immediately own the Experiment lifecycle',async () => {
    let resolveStart:((run:ExperimentRunView) => void)|undefined;
    const invokePanelActionWorkflow = vi.fn(() => new Promise<ExperimentRunView>((resolve) => { resolveStart = resolve; }));
    const { result } = renderHook(() => useActions({ invokePanelActionWorkflow }));
    let started:Promise<unknown>|undefined;
    act(() => {
      started = result.current.invokePanelAction('panel-a','capture',{ quality:'full' },'operator action');
    });
    expect(result.current.startInFlight).toBe(true);
    expect(result.current.experimentIsRunning).toBe(true);
    expect(result.current.canStopExperiment).toBe(true);
    expect(invokePanelActionWorkflow).toHaveBeenCalledWith(
      'local',expect.objectContaining({ head:expect.objectContaining({ resourceId:'experiment-a' }) }),
      'simulation','panel-a','capture',{ quality:'full' },'operator action',
    );
    await act(async () => { resolveStart?.(experimentRun('action-root'));await started; });
    expect(result.current.activeRun?.id).toBe('action-root');
  });

  it('does not take the Total Run lifecycle or refresh history for Panel Actions in a live Session',async () => {
    const refresh = vi.fn(async () => undefined);
    const invokePanelActionWorkflow = vi.fn(async () => experimentRun('action-root'));
    const { result } = renderHook(() => useActions({
      invokePanelActionWorkflow,
      runtimeProjection:{ ...projection(),sessionActive:true,refresh },
    }));
    await act(async () => {
      await result.current.invokePanelAction('robot-control','run',{ longitudinal:1 },'Set robot remote-control intent');
    });
    expect(invokePanelActionWorkflow).toHaveBeenCalledTimes(1);
    expect(result.current.startInFlight).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('projects stopping until the stop-set request completes',async () => {
    const active = experimentRun('run-1',4);
    const selected = { ...experimentRun('run-selected',2),actionId:'run-panel' };
    let resolveStop:((value:AutomationStopRunSetResponse) => void)|undefined;
    let resolveConvergence:(() => void)|undefined;
    let stoppingVisibleBeforeStopRequest=false;
    const stopWorkflow = vi.fn(() => {
      stoppingVisibleBeforeStopRequest=result.current.activeRuns.every((run) => run.status==='stopping');
      return new Promise<AutomationStopRunSetResponse>((resolve) => { resolveStop = resolve; });
    });
    const convergeStoppedSession = vi.fn(() => new Promise<void>((resolve) => {
      resolveConvergence = resolve;
    }));
    const { result } = renderHook(() => useActions({
      stopWorkflow,runtimeProjection:{
        ...projection(active,new Set(['run-1','run-selected'])),
        activeRuns:[active,selected],
        convergeStoppedSession,
      },
    }));
    let stopping:Promise<unknown>|undefined;
    act(() => { stopping = result.current.stopExperiment(); });
    expect(stoppingVisibleBeforeStopRequest).toBe(true);
    expect(result.current.stopAllInFlight).toBe(true);
    expect(result.current.activeRun?.status).toBe('stopping');
    expect(result.current.activeRuns).toEqual([
      expect.objectContaining({ id:'run-1',status:'stopping' }),
      expect.objectContaining({ id:'run-selected',status:'stopping' }),
    ]);
    await act(async () => {
      resolveStop?.(stopSetResult('run-1'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(convergeStoppedSession).toHaveBeenCalledTimes(1);
    expect(result.current.stopAllInFlight).toBe(true);
    expect(result.current.activeRuns.every((run) => run.status==='stopping')).toBe(true);
    await act(async () => { resolveConvergence?.();await stopping; });
  });

  it('does not resurrect an optimistic Run after its terminal summary is observed',async () => {
    const startWorkflow = vi.fn(async () => experimentRun('run-1'));
    let observed:ReadonlySet<string> = new Set();
    const { result,rerender } = renderHook(() => useActions({
      startWorkflow,runtimeProjection:projection(undefined,observed),
    }));
    await act(async () => { await result.current.startExperiment(); });
    expect(result.current.experimentIsRunning).toBe(true);
    observed = new Set(['run-1']);rerender();
    expect(result.current.experimentIsRunning).toBe(false);
  });

  it('refuses Start when another Experiment occupies the station but retains this Run Stop',async () => {
    const startWorkflow = vi.fn(async () => experimentRun('run-1'));
    const active = experimentRun('run-current');
    const stopWorkflow = vi.fn(async () => stopSetResult(active.id));
    const idle = renderHook(() => useActions({
      startWorkflow,externalAdmissionDisabledReason:'Another Experiment is already running.',
    }));
    expect(idle.result.current.canStartExperiment).toBe(false);
    await act(async () => { await idle.result.current.startExperiment(); });
    expect(startWorkflow).not.toHaveBeenCalled();

    const running = renderHook(() => useActions({
      stopWorkflow,runtimeProjection:projection(active),
      externalAdmissionDisabledReason:'Another Experiment is already running.',
    }));
    expect(running.result.current.canStopExperiment).toBe(true);
    await act(async () => { await running.result.current.stopExperiment(); });
    expect(stopWorkflow).toHaveBeenCalledWith('local',expect.objectContaining({ head:expect.objectContaining({ resourceId:'experiment-a' }) }));
  });
});

function useActions({
  startWorkflow=vi.fn(async () => experimentRun('run')),
  stopWorkflow=vi.fn(async (_targetId:string,_experiment:ExperimentDocument) => stopSetResult('run')),
  startPanelWorkflow,
  invokePanelActionWorkflow,
  runtimeProjection=projection(),dashboardEditing=false,externalAdmissionDisabledReason='',
}: {
  startWorkflow?:(targetId:string,experiment:ExperimentDocument,runMode:string)=>Promise<ExperimentRunView>;
  stopWorkflow?:(targetId:string,experiment:ExperimentDocument)=>Promise<AutomationStopRunSetResponse>;
  startPanelWorkflow?:(
    targetId:string,experiment:ExperimentDocument,runMode:string,panelId:string,
    inputOverrides:Record<string,unknown>,
  )=>Promise<ExperimentRunView>;
  invokePanelActionWorkflow?:(
    targetId:string,experiment:ExperimentDocument,runMode:string,panelId:string,presetId:string,
    inputOverrides:Record<string,unknown>,reason?:string,
  )=>Promise<ExperimentRunView>;
  runtimeProjection?:ExperimentRuntimeProjection;
  dashboardEditing?:boolean;
  externalAdmissionDisabledReason?:string;
} = {}) {
  return useExperimentDashboardActions({
    visibleExperiment:experiment(),runtimeProjection,executionTargetId:'local',
    startWorkflow,stopWorkflow,startPanelWorkflow,invokePanelActionWorkflow,dashboardEditing,
    saveExperimentDraft:async (value) => value,runMode:'simulation',externalAdmissionDisabledReason,
  });
}

function projection(
  activeRun?:ExperimentRunView,
  observedRunIds:ReadonlySet<string> = activeRun ? new Set([activeRun.id]) : new Set(),
):ExperimentRuntimeProjection {
  return {
    loading:false,error:'',stateLoading:false,stateResolved:true,
    activeRun,observedRunIds,refresh:vi.fn(async () => undefined),
    convergeStoppedSession:vi.fn(async () => undefined),
  };
}

function experimentRun(id:string,revision=1):ExperimentRunView {
  return {
    id,targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
    automationResourceId:'069f036b-9638-4827-9524-73ff03fe99c9',actionId:'run',runMode:'simulation',
    status:'waiting',revision,rootRunId:id,createdAt:'2026-01-01T00:00:00Z',
    startedAt:'2026-01-01T00:00:01Z',updatedAt:'2026-01-01T00:00:01Z',workflowTargets:[],
  };
}

function stopSetResult(anchorRunId:string):AutomationStopRunSetResponse {
  return { receipt:{} as never,anchorRunId,outcomes:[] };
}

function experiment():ExperimentDocument {
  return {
    head:head('experiment','experiment-a'),branch:branch('experiment','experiment-a'),
    spec:newExperimentSpec({ name:'Experiment',runModes:['simulation'] }),
  };
}
function head(domain:string,resourceId:string) {
  return { domain,resourceId,name:resourceId,tags:[],mainCommitId:'commit-1',currentVersion:1,digest:'d'.repeat(64),revision:1,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z' };
}
function branch(domain:string,resourceId:string) {
  return { domain,resourceId,name:'main',headCommitId:'commit-1',headVersion:1,revision:1,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z' };
}
