// @vitest-environment jsdom

import { act,renderHook,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { AutomationRunDetail } from '../../automation/automationPublic';
import { newExperimentSpec,type ExperimentDocument } from '../experimentModel';
import type { ExperimentRunView } from '../experimentWorkflowService';
import { useExperimentDashboardActions,type ExperimentRuntimeProjection } from './useExperimentDashboardActions';

const notificationMocks = vi.hoisted(() => ({ useError:vi.fn() }));

vi.mock('../../groundStationInteraction/groundStationInteractionPublic',() => ({
  useGroundStationErrorNotification:notificationMocks.useError,
}));

describe('useExperimentDashboardActions notifications',() => {
  it('reports a submitted Action that fails after HTTP admission without replaying old failures',async () => {
    const current = projection();
    current.sessionActive = true;
    const { result,rerender } = renderHook(() => useExperimentDashboardActions({
      visibleExperiment:experiment(),runtimeProjection:current,executionTargetId:'local',
      startWorkflow:vi.fn(async () => experimentRun()),stopWorkflow:vi.fn(async () => undefined),
      invokePanelActionWorkflow:vi.fn(async () => experimentRun()),runMode:'simulation',
    }));
    await act(async () => { await result.current.invokePanelAction('robot-control','arm',{ robotIds:['px4-01'] }); });
    const failure = 'robot px4-01: command rejected';
    current.runDetailsById = { 'run-1':{ run:{ ...experimentRun(),status:'failed',primaryError:failure } } as unknown as AutomationRunDetail };
    rerender();
    await waitFor(() => expect(notificationMocks.useError).toHaveBeenCalledWith('local',failure,{
      title:'Experiment',source:'experiment-a',dedupeKey:'experiment-workflow:action',
    }));
  });

  it('publishes Panel Action failures through the shared notification hook',async () => {
    const error = '400 Bad Request: invalid run parameters';
    const invokePanelActionWorkflow = vi.fn(async ():Promise<ExperimentRunView> => { throw new Error(error); });
    const { result } = renderHook(() => useExperimentDashboardActions({
      visibleExperiment:experiment(),
      runtimeProjection:projection(),
      executionTargetId:'local',
      startWorkflow:vi.fn(async () => experimentRun()),
      stopWorkflow:vi.fn(async () => undefined),
      invokePanelActionWorkflow,
      runMode:'simulation',
    }));

    await act(async () => {
      await expect(result.current.invokePanelAction('panel','preset',{})).rejects.toThrow(error);
    });
    await waitFor(() => expect(notificationMocks.useError).toHaveBeenCalledWith('local',error,{
      title:'Experiment',source:'experiment-a',dedupeKey:'experiment-workflow:action',
    }));
  });
});

function projection():ExperimentRuntimeProjection {
  return {
    loading:false,error:'',stateLoading:false,stateResolved:true,
    observedRunIds:new Set(),refresh:vi.fn(async () => undefined),
    convergeStoppedSession:vi.fn(async () => undefined),
  };
}

function experimentRun():ExperimentRunView {
  return {
    id:'run-1',targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
    automationResourceId:'runner',actionId:'run-panel-action',runMode:'simulation',status:'waiting',revision:1,
    rootRunId:'run-1',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',workflowTargets:[],
  };
}

function experiment():ExperimentDocument {
  return {
    head:{ domain:'experiment',resourceId:'experiment-a',name:'Experiment',tags:[],mainCommitId:'commit-1',currentVersion:1,digest:'d'.repeat(64),revision:1,createdAt:'t',updatedAt:'t' },
    branch:{ domain:'experiment',resourceId:'experiment-a',name:'main',headCommitId:'commit-1',headVersion:1,revision:1,createdAt:'t',updatedAt:'t' },
    spec:newExperimentSpec({ name:'Experiment',runModes:['simulation'] }),
  };
}
