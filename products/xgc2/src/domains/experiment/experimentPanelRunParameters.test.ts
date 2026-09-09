// @vitest-environment jsdom

import { beforeEach,describe,expect,it,vi } from 'vitest';
import type * as HTTPModule from '../../api/http';
import { request } from '../../api/http';
import { newExperimentSpec,type ExperimentDocument } from './experimentModel';
import { startExperimentPanelRun,SYSTEM_EXPERIMENT_RUNNER } from './experimentWorkflowService';
import { robotSelectionKey } from '../robot/robotPublic';
import type { AutomationRun } from '../automation/automationPublic';

vi.mock('../../api/http',async (importOriginal) => ({
  ...await importOriginal<typeof HTTPModule>(),
  request:vi.fn(),
}));

describe('startExperimentPanelRun selection parameters',() => {
  beforeEach(() => {
    vi.mocked(request).mockReset();
    window.localStorage.removeItem(robotSelectionKey({ experimentId:'experiment-a',shared:'experiment' }));
  });

  it('passes plugin-owned selection inputs through one generic value overlay',async () => {
    window.localStorage.setItem(
      robotSelectionKey({ experimentId:'experiment-a',shared:'experiment' }),
      JSON.stringify(['scout-01']),
    );
    const run = automationRun();
    vi.mocked(request).mockResolvedValueOnce({ run,receipt:{} });
    await startExperimentPanelRun('local',experiment(),'simulation','panel-instruments',{
      robotId:'scout-01',robotIds:['scout-01'],selectionKey:'selected:["scout-01"]',
    });
    const body=JSON.parse(String(vi.mocked(request).mock.calls[0]?.[1]?.body));
    expect(body).toEqual(expect.objectContaining({
      actionId:'run-panel',
      parameters:{
        panelId:'panel-instruments',runMode:'simulation',
        inputOverridesJson:JSON.stringify({
          robotId:'scout-01',robotIds:['scout-01'],selectionKey:'selected:["scout-01"]',
        }),
      },
    }));
  });
});

function automationRun():AutomationRun {
  const sourceRef = {
    domain:'experiment' as const,resourceId:'experiment-a',branch:'main',commitId:'experiment-commit',
    version:1,digest:'e'.repeat(64),
  };
  return {
    id:'panel-root',targetId:'local',automationResourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,
    definitionId:'system-experiment-runner',definitionVersion:1,actionId:'run-panel',actionVersion:2,
    configDigest:'a'.repeat(64),executionPlanDigest:'b'.repeat(64),registryDigest:'c'.repeat(64),
    definitionDigest:'d'.repeat(64),executionModel:'orchestration-occurrence-v1',
    sourceKind:'experiment',sourceRef,automationRef:{
      domain:'automation',resourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,branch:'main',
      commitId:'runner-commit',version:1,digest:'f'.repeat(64),
    },
    status:'waiting',revision:3,parameters:{ panelId:'panel-instruments',runMode:'simulation' },
    admissionMode:'parallel',admissionScope:'all',rootRunId:'panel-root',depth:0,correlationId:'panel-root',
    acceptedAt:'2026-01-01T00:00:00Z',createdAt:'2026-01-01T00:00:00Z',
    startedAt:'2026-01-01T00:00:01Z',updatedAt:'2026-01-01T00:00:01Z',
  };
}

function experiment():ExperimentDocument {
  return {
    head:{
      domain:'experiment',resourceId:'experiment-a',name:'Experiment',tags:[],mainCommitId:'commit-1',currentVersion:1,
      digest:'d'.repeat(64),revision:1,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',
    },
    branch:{
      domain:'experiment',resourceId:'experiment-a',name:'main',headCommitId:'commit-1',headVersion:1,
      revision:1,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',
    },
    spec:newExperimentSpec({ name:'Experiment',runModes:['simulation'] }),
  };
}
