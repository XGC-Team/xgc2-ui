// @vitest-environment jsdom

import { act,renderHook,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type {
  AutomationRun,
  AutomationRunDetail,
  AutomationRunSummaryView,
} from '../../automation/automationPublic';
import { newExperimentSpec,type ExperimentDocument } from '../experimentModel';
import { SYSTEM_EXPERIMENT_RUNNER } from '../experimentWorkflowService';
import type { ExperimentSessionView } from '../experimentWorkflowModel';
import {
  type ExperimentWorkflowRuntimeSource,
  useExperimentWorkflowRuntime,
} from './useExperimentWorkflowRuntime';
import { fullRunPanelInvocationFallback } from './ExperimentDashboardCanvas';

describe('useExperimentWorkflowRuntime',() => {
  it('projects the active Experiment-sourced System Runner summary without doing initial I/O',() => {
    const refreshExecutionHistory = vi.fn(async () => []);
    const exact = run('run-1','experiment-a','simulation');
    const source = runtimeSource({
      runSummaries:[summary(exact)],
      runDetailsById:{ 'run-1':detail(exact) },
      refreshExecutionHistory,
    });
    const { result } = renderHook(() => useExperimentWorkflowRuntime(experiment(),'local',source));

    expect(result.current.activeRun).toMatchObject({
      id:'run-1',runMode:'simulation',status:'waiting',
      experimentRef:{ resourceId:'experiment-a' },
    });
    expect(result.current.observedRunIds).toEqual(new Set(['run-1']));
    expect(refreshExecutionHistory).not.toHaveBeenCalled();
  });

  it('uses SSE-fed summary revisions as lifecycle truth',() => {
    let runSummaries:AutomationRunSummaryView[] = [summary(run('run-1','experiment-a','simulation'))];
    const source = runtimeSource({ runSummaries });
    const { result,rerender } = renderHook(() => useExperimentWorkflowRuntime(
      experiment(),'local',{ ...source,runSummaries },
    ));
    expect(result.current.activeRun?.status).toBe('waiting');

    runSummaries = [{ ...runSummaries[0]!,status:'stopped',revision:4,finishedAt:'2026-01-01T00:00:03Z' }];
    rerender();
    expect(result.current.activeRun).toBeUndefined();
    expect(result.current.observedRunIds).toEqual(new Set(['run-1']));
  });

  it('refreshes System Runner history only at an explicit action boundary',async () => {
    const refreshExecutionHistory = vi.fn(async () => []);
    const refreshSessions = vi.fn(async () => []);
    const { result } = renderHook(() => useExperimentWorkflowRuntime(
      experiment(),'local',runtimeSource({ refreshExecutionHistory,refreshSessions }),
    ));
    await act(async () => { await result.current.refresh(); });
    expect(refreshExecutionHistory).toHaveBeenCalledWith(SYSTEM_EXPERIMENT_RUNNER.resourceId);
    expect(refreshSessions).toHaveBeenCalledOnce();
  });

  it('converges the selected stopped Session before its exact terminal history read',async () => {
    const calls:string[]=[];
    const refreshExecutionHistory = vi.fn(async () => { calls.push('history');return []; });
    const refreshSessions = vi.fn(async () => { calls.push('sessions');return []; });
    const convergeStoppedExperiment = vi.fn(async (experimentResourceId:string) => {
      calls.push(`converge:${experimentResourceId}`);
    });
    const { result } = renderHook(() => useExperimentWorkflowRuntime(
      experiment(),'local',runtimeSource({
        refreshExecutionHistory,refreshSessions,convergeStoppedExperiment,
      }),
    ));

    await act(async () => { await result.current.convergeStoppedSession(); });

    expect(calls).toEqual(['converge:experiment-a','history']);
    expect(refreshExecutionHistory).toHaveBeenCalledOnce();
    expect(refreshExecutionHistory).toHaveBeenCalledWith(SYSTEM_EXPERIMENT_RUNNER.resourceId);
    expect(convergeStoppedExperiment).toHaveBeenCalledWith('experiment-a');
    expect(refreshSessions).not.toHaveBeenCalled();
  });

  it('projects an ordinary Experiment-owned root from authoritative Session truth',() => {
    const { result } = renderHook(() => useExperimentWorkflowRuntime(
      experiment(),'local',runtimeSource({ sessionViews:[sessionView()] }),
    ));
    expect(result.current.sessionActive).toBe(true);
    expect(result.current.activeRun).toBeUndefined();
    expect(result.current.activeRuns).toEqual([]);
  });

  it('loads one exact Session command root and restores its full-Run Panel fallback',async () => {
    const command=run('ordinary-user-root','experiment-a','simulation');
    command.status='succeeded';
    command.revision=7;
    command.finishedAt='2026-01-01T00:00:03Z';
    const commandDetail=detail(command);
    commandDetail.relations={
      runId:command.id,
      childRunGroups:[{ id:'panel-group',producerNodeId:'run-panels' }],
      childRunGroupMembers:[{
        groupId:'panel-group',itemKey:'camera-workflow',childRunId:'camera-child',state:'terminal',
      }],
      childRuns:[{
        childRunId:'camera-child',targetId:'local',runStatus:'waiting',runRevision:4,
      }],
      waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
    } as never;
    const loadRunDetail=vi.fn(async () => commandDetail);
    const release=vi.fn();
    const retainRunDetail=vi.fn(() => release);
    const source=runtimeSource({
      sessionViews:[sessionView()],loadRunDetail,retainRunDetail,
    });
    const { result,rerender,unmount }=renderHook(({ runDetailsById }) => (
      useExperimentWorkflowRuntime(experiment(),'local',{ ...source,runDetailsById })
    ),{ initialProps:{ runDetailsById:{} as Record<string,AutomationRunDetail> } });

    expect(result.current.sessionActive).toBe(true);
    expect(result.current.activeRuns).toEqual([]);
    await waitFor(() => expect(loadRunDetail).toHaveBeenCalledWith(command.id,undefined));
    expect(loadRunDetail).toHaveBeenCalledTimes(1);

    rerender({ runDetailsById:{ [command.id]:commandDetail } });
    await waitFor(() => expect(result.current.activeRun).toMatchObject({
      id:command.id,targetId:'local',runMode:'simulation',status:'succeeded',
      experimentRef:{ resourceId:'experiment-a',branch:'main' },
    }));
    expect(fullRunPanelInvocationFallback({
      id:'camera-panel',pluginId:'camera',title:'Camera',layout:{ x:0,y:0,w:1,h:1 },
      portBindings:[{
        portId:'panel-workflow',kind:'workflow',workflowInstanceId:'camera-workflow',
        presetId:'run',managed:true,relation:'supervised',failurePolicy:'keep-experiment',
      }],
    } as never,{ activeRuns:result.current.activeRuns },{
      rootId:command.id,rootRevision:command.revision,loading:false,error:'',
      relations:commandDetail.relations,
    })).toEqual({
      rootRunId:command.id,targetId:'local',id:'camera-child',status:'waiting',revision:4,
    });
    rerender({ runDetailsById:{ [command.id]:commandDetail } });
    expect(loadRunDetail).toHaveBeenCalledTimes(1);
    expect(retainRunDetail).toHaveBeenCalledTimes(1);
    unmount();
    expect(release).toHaveBeenCalledOnce();
  });

  it('inspects a terminal Session command member and restores its still-active exact Run',async () => {
    const command=run('full-root-with-collected-error','experiment-a','simulation');
    command.status='waiting';
    command.revision=9;
    const commandDetail=detail(command);
    commandDetail.relations={
      runId:command.id,
      childRunGroups:[],childRunGroupMembers:[],childRuns:[],
      waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
    } as never;
    const terminalMemberSession=sessionView();
    terminalMemberSession.members[0]={
      ...terminalMemberSession.members[0]!,ownerId:command.id,status:'failed',revision:4,
    };
    const loadRunDetail=vi.fn(async () => commandDetail);
    const source=runtimeSource({ sessionViews:[terminalMemberSession],loadRunDetail });
    const { result,rerender }=renderHook(({ runDetailsById }) => (
      useExperimentWorkflowRuntime(experiment(),'local',{ ...source,runDetailsById })
    ),{ initialProps:{ runDetailsById:{} as Record<string,AutomationRunDetail> } });

    await waitFor(() => expect(loadRunDetail).toHaveBeenCalledWith(command.id,undefined));
    expect(result.current.activeRun).toBeUndefined();

    rerender({ runDetailsById:{ [command.id]:commandDetail } });
    await waitFor(() => expect(result.current.activeRun).toMatchObject({
      id:command.id,status:'waiting',actionId:SYSTEM_EXPERIMENT_RUNNER.actions.run,
    }));
  });

  it('keeps a terminal System command root only while its Session member owns live descendants',() => {
    const command = run('command-root','experiment-a','simulation');
    command.actionId = SYSTEM_EXPERIMENT_RUNNER.actions.invokePanelAction;
    command.parameters = { runMode:'simulation',panelId:'ros-control',presetId:'rviz' };
    command.status = 'succeeded';
    command.revision = 8;
    command.finishedAt = '2026-01-01T00:00:03Z';
    const activeSession = sessionView();
    activeSession.members[0] = {
      ...activeSession.members[0]!,ownerId:command.id,status:'running',
    };
    const { result,rerender } = renderHook(({ sessions }) => useExperimentWorkflowRuntime(
      experiment(),'local',runtimeSource({
        runSummaries:[summary(command)],sessionViews:sessions,
      }),
    ),{ initialProps:{ sessions:[activeSession] } });

    expect(result.current.activeRuns).toHaveLength(1);
    expect(result.current.activeRuns[0]).toMatchObject({
      id:'command-root',status:'succeeded',actionId:SYSTEM_EXPERIMENT_RUNNER.actions.invokePanelAction,
    });

    rerender({ sessions:[{
      ...activeSession,
      members:[{ ...activeSession.members[0]!,status:'succeeded' }],
    }] });
    expect(result.current.activeRuns).toEqual([]);
  });

  it('does not resurrect an unrelated terminal System root from an active Session',() => {
    const command = run('old-command','experiment-a','simulation');
    command.actionId = SYSTEM_EXPERIMENT_RUNNER.actions.invokePanelAction;
    command.status = 'succeeded';
    const { result } = renderHook(() => useExperimentWorkflowRuntime(
      experiment(),'local',runtimeSource({
        runSummaries:[summary(command)],sessionViews:[sessionView()],
      }),
    ));
    expect(result.current.activeRuns).toEqual([]);
  });

  it('restores multiple Panel roots entirely from history selectors',() => {
    const first=run('panel-1','experiment-a','simulation');
    first.actionId=SYSTEM_EXPERIMENT_RUNNER.actions.runPanel;
    first.parameters={ runMode:'simulation',panelId:'panel-a' };
    const second={ ...first,id:'panel-2',rootRunId:'panel-2',correlationId:'panel-2',parameters:{ runMode:'simulation',panelId:'panel-b' } };
    const { result }=renderHook(() => useExperimentWorkflowRuntime(experiment(),'local',runtimeSource({
      runSummaries:[summary(first),summary(second)],
    })));
    expect(result.current.activeRuns.map((root) => root.panelId).sort()).toEqual(['panel-a','panel-b']);
  });

  it('fails closed while the station snapshot is unresolved',() => {
    const { result } = renderHook(() => useExperimentWorkflowRuntime(
      experiment(),'local',runtimeSource({ resolved:false,error:'history unavailable' }),
    ));
    expect(result.current.loading).toBe(true);
    expect(result.current.resolved).toBe(false);
    expect(result.current.error).toBe('history unavailable');
  });
});

function runtimeSource(overrides:Partial<ExperimentWorkflowRuntimeSource> = {}):ExperimentWorkflowRuntimeSource {
  return {
    runSummaries:[],runDetailsById:{},resolved:true,error:'',
    refreshExecutionHistory:vi.fn(async () => []),
    loadRunDetail:vi.fn(async () => ({ invocations:[],nodeSummaries:[],loading:false,error:'not found' })),
    retainRunDetail:vi.fn(() => () => undefined),
    convergeStoppedExperiment:vi.fn(async () => undefined),
    ...overrides,
  };
}

function sessionView():ExperimentSessionView {
  return {
    session:{ id:'session-a',targetId:'local',experimentResourceId:'experiment-a',state:'active',mode:'partial',runMode:'simulation',revision:2 },
    members:[{ id:'member-a',targetId:'local',sessionId:'session-a',bindingId:'system-runner',
      kind:'workflow_command',ownerId:'ordinary-user-root',status:'running',revision:1 }],
  };
}

function detail(exact:AutomationRun):AutomationRunDetail {
  return { run:exact,invocations:[],nodeSummaries:[],loading:false,error:'' };
}

function summary(exact:AutomationRun):AutomationRunSummaryView {
  return {
    id:exact.id,targetId:exact.targetId,automationResourceId:exact.automationResourceId,
    actionId:exact.actionId,actionVersion:exact.actionVersion,sourceKind:exact.sourceKind,
    sourceRef:exact.sourceRef,status:exact.status,revision:exact.revision,
    experimentSelector:{
      runMode:String(exact.parameters.runMode ?? ''),
      ...(typeof exact.parameters.panelId==='string' ? { panelId:exact.parameters.panelId } : {}),
    },
    rootRunId:exact.rootRunId,createdAt:exact.createdAt,startedAt:exact.startedAt,
    updatedAt:exact.updatedAt,finishedAt:exact.finishedAt,
  };
}

function run(id:string,experimentResourceId:string,runMode:string):AutomationRun {
  return {
    id,targetId:'local',automationResourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,
    definitionId:'system-experiment-runner',definitionVersion:1,actionId:'run',actionVersion:1,
    configDigest:'a'.repeat(64),executionPlanDigest:'b'.repeat(64),registryDigest:'c'.repeat(64),
    definitionDigest:'d'.repeat(64),executionModel:'orchestration-occurrence-v1',
    sourceKind:'experiment',sourceRef:{
      domain:'experiment',resourceId:experimentResourceId,branch:'main',commitId:'experiment-commit',
      version:1,digest:'e'.repeat(64),
    },
    automationRef:{
      domain:'automation',resourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,branch:'main',
      commitId:'runner-commit',version:1,digest:'f'.repeat(64),
    },
    status:'waiting',revision:3,parameters:{ runMode },admissionMode:'parallel',admissionScope:'all',
    rootRunId:id,depth:0,correlationId:id,acceptedAt:'2026-01-01T00:00:00Z',
    createdAt:'2026-01-01T00:00:00Z',startedAt:'2026-01-01T00:00:01Z',updatedAt:'2026-01-01T00:00:01Z',
  };
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
