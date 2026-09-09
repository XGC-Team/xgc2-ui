import type { ExperimentSessionView } from './experimentWorkflowModel';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type * as HTTPModule from '../../api/http';
import { request } from '../../api/http';
import type { AutomationRun } from '../automation/automationPublic';
import { newExperimentSpec,type ExperimentDocument } from './experimentModel';
import {
  activeExperimentRun,
  activeExperimentRuns,
  activeExperimentSessionCommandRootIds,
  experimentSessionCommandRootIds,
  experimentSessionIsRunning,
  invokeExperimentPanelAction,
  listActiveExperimentSessions,
  runningExperimentIds,
  runningExperimentIdsFromSessions,
  startExperimentRun,
  startExperimentPanelRun,
  stopExperimentRun,
  SYSTEM_EXPERIMENT_RUNNER,
} from './experimentWorkflowService';

vi.mock('../../api/http',async (importOriginal) => ({
  ...await importOriginal<typeof HTTPModule>(),
  request:vi.fn(),
}));

describe('experimentWorkflowService',() => {
  beforeEach(() => { vi.mocked(request).mockReset(); });

  it('starts the protected System Runner through the ordinary orchestration endpoint',async () => {
    const run = automationRun('run-1','experiment-a',{ runMode:'field-custom' });
    vi.mocked(request).mockResolvedValueOnce({ run,receipt:{} });

    const started = await startExperimentRun('local',experiment(),'field-custom');

    expect(started).toMatchObject({
      id:'run-1',experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
      automationResourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,
      actionId:'run',runMode:'field-custom',status:'waiting',
    });
    const [path,init] = vi.mocked(request).mock.calls[0]!;
    expect(path).toBe('/execution-targets/local/orchestration-runs');
    expect(JSON.parse(String(init?.body))).toEqual(expect.objectContaining({
      actionId:'run',
      automationRef:{
        domain:'automation',resourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,branch:'main',
      },
      experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
      parameters:{ runMode:'field-custom' },
    }));
  });

  it('starts one unmanaged-capable Panel only through the protected panel selector Action',async () => {
    const run = automationRun('panel-root','experiment-a',{ panelId:'panel-a',runMode:'field-custom' });
    run.actionId = SYSTEM_EXPERIMENT_RUNNER.actions.runPanel;
    run.actionVersion = 2;
    vi.mocked(request).mockResolvedValueOnce({ run,receipt:{} });
    const started = await startExperimentPanelRun(
      'local',experiment(),'field-custom','panel-a',{ selected:['robot-a'] },
    );
    expect(started.actionId).toBe('run-panel');
    const body=JSON.parse(String(vi.mocked(request).mock.calls[0]?.[1]?.body));
    expect(body).toEqual(expect.objectContaining({
      actionId:'run-panel',parameters:{
        panelId:'panel-a',runMode:'field-custom',inputOverridesJson:'{"selected":["robot-a"]}',
      },
    }));
    expect(body).not.toHaveProperty('targetId');
  });

  it('invokes a frozen Panel preset with value-only overrides and no executable identity',async () => {
    const run = automationRun('command-root','experiment-a',{
      panelId:'panel-a',presetId:'drive',runMode:'field-custom',inputOverridesJson:'{"speed":2}',
    });
    run.actionId = SYSTEM_EXPERIMENT_RUNNER.actions.invokePanelAction;
    vi.mocked(request).mockResolvedValueOnce({ run,receipt:{} });
    await invokeExperimentPanelAction(
      'local',experiment(),'field-custom','panel-a','drive',{ speed:2 },'Drive',
    );
    const body=JSON.parse(String(vi.mocked(request).mock.calls[0]?.[1]?.body));
    expect(body).toEqual(expect.objectContaining({
      actionId:'invoke-panel-action',parameters:{
        panelId:'panel-a',presetId:'drive',runMode:'field-custom',inputOverridesJson:'{"speed":2}',
      },
    }));
    for (const forbidden of ['automationId','targetId','commitId','definitionDigest']) {
      expect(JSON.stringify(body.parameters)).not.toContain(forbidden);
    }
  });

  it('Total Stop starts the protected stop-all Action instead of anchoring one of several roots',async () => {
    const stop = automationRun('stop-1','experiment-a',{});
    stop.actionId = SYSTEM_EXPERIMENT_RUNNER.actions.stopAll;
    vi.mocked(request).mockResolvedValueOnce({ run:stop,receipt:{} });
    await stopExperimentRun('local',experiment());

    const [path,init] = vi.mocked(request).mock.calls[0]!;
    expect(path).toBe('/execution-targets/local/orchestration-runs');
    expect(JSON.parse(String(init?.body))).toEqual(expect.objectContaining({
      actionId:'stop-all',parameters:{},
      experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
    }));
  });

  it('reads authoritative live Experiment Sessions without enumerating Experiments',async () => {
    const sessions = [sessionView('session-a','experiment-a','active','user-automation-root')];
    vi.mocked(request).mockResolvedValueOnce(sessions);

    await expect(listActiveExperimentSessions('local')).resolves.toEqual(sessions);
    expect(request).toHaveBeenCalledWith(
      '/execution-targets/local/experiment-sessions',
      { signal:undefined,cache:'no-store' },
    );
    expect([...runningExperimentIdsFromSessions(sessions)]).toEqual(['experiment-a']);
    expect(experimentSessionIsRunning(sessions,'experiment-a')).toBe(true);
    expect(experimentSessionIsRunning(sessions,'experiment-b')).toBe(false);
  });

  it('separates Session command candidates from members that may extend terminal Run truth',() => {
    const view=sessionView('session-a','experiment-a','active','active-command');
    view.members.push({
      ...view.members[0]!,id:'member-terminal',ownerId:'terminal-member-command',status:'failed',revision:4,
    });
    expect(experimentSessionCommandRootIds([view],'experiment-a','local')).toEqual(new Set([
      'active-command','terminal-member-command',
    ]));
    expect(activeExperimentSessionCommandRootIds([view],'experiment-a','local')).toEqual(new Set([
      'active-command',
    ]));
  });

  it('derives occupancy only from active Experiment-sourced System Runner roots',() => {
    const active = automationRun('run-active','experiment-a',{ runMode:'simulation' });
    const terminal = {
      ...automationRun('run-terminal','experiment-b',{ runMode:'simulation' }),
      status:'stopped' as const,terminationKind:'stopped' as const,
      finishedAt:'2026-01-01T00:00:02Z',revision:4,
    };
    const child = {
      ...automationRun('run-child','experiment-c',{ runMode:'simulation' }),
      parentRunId:'parent',rootRunId:'parent',callNodeId:'call',depth:1,correlationId:'parent',
    };
    const ordinary = {
      ...automationRun('run-ordinary','experiment-d',{ runMode:'simulation' }),
      automationResourceId:'panel-workflow',automationRef:{
        ...active.automationRef!,resourceId:'panel-workflow',
      },
    };
    expect([...runningExperimentIds([active,terminal,child,ordinary])]).toEqual(['experiment-a']);
  });

  it('projects multiple Panel/full roots while excluding the transient stop-all command root',() => {
    const selected=experiment();
    const full=automationRun('full','experiment-a',{ runMode:'simulation' });
    const panel=automationRun('panel','experiment-a',{ panelId:'panel-a',runMode:'simulation' });
    panel.actionId=SYSTEM_EXPERIMENT_RUNNER.actions.runPanel;
    panel.actionVersion=2;
    const stop=automationRun('stop','experiment-a',{});
    stop.actionId=SYSTEM_EXPERIMENT_RUNNER.actions.stopAll;
    expect(activeExperimentRuns([panel,stop,full],selected,'local').map((run) => run.id).sort())
      .toEqual(['full','panel']);
  });

  it('projects authored workflow targets without process/media fabrication',() => {
    const selected = experiment();
    selected.spec.workflowInstances = [{
      id:'panel-workflow',
      ref:{ domain:'automation',resourceId:'automation-panel',branch:'main' },
      executionTargetId:'agent/scout-01',
      actionPresets:[{ id:'run',actionId:'run',inputs:{},parameterBindings:[] }],
    }];
    const view = activeExperimentRun([
      automationRun('run-1','experiment-a',{ runMode:'physical' }),
    ],selected,'local');
    expect(view?.workflowTargets).toEqual([{
      workflowInstanceId:'panel-workflow',
      automationRef:{ domain:'automation',resourceId:'automation-panel',branch:'main' },
      executionTargetId:'agent/scout-01',actionPresetIds:['run'],
    }]);
    expect(view).not.toHaveProperty('processPlacement');
    expect(view).not.toHaveProperty('runtime');
  });
});

function sessionView(
  id:string,
  experimentResourceId:string,
  state:'opening'|'active'|'stopping'|'succeeded'|'failed'|'canceled',
  ownerId:string,
):ExperimentSessionView {
  return {
    session:{ id,targetId:'local',experimentResourceId,state,mode:'partial' as const,runMode:'night-field',revision:2 },
    members:[{ id:`member-${id}`,targetId:'local',sessionId:id,bindingId:'system-runner',
      kind:'workflow_command',ownerId,status:'running',revision:1 }],
  };
}

function automationRun(
  id:string,
  experimentResourceId:string,
  parameters:Record<string,unknown>,
):AutomationRun {
  const sourceRef = {
    domain:'experiment' as const,resourceId:experimentResourceId,branch:'main',commitId:'experiment-commit',
    version:1,digest:'e'.repeat(64),
  };
  return {
    id,targetId:'local',automationResourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,
    definitionId:'system-experiment-runner',definitionVersion:1,actionId:'run',actionVersion:1,
    configDigest:'a'.repeat(64),executionPlanDigest:'b'.repeat(64),registryDigest:'c'.repeat(64),
    definitionDigest:'d'.repeat(64),executionModel:'orchestration-occurrence-v1',
    sourceKind:'experiment',sourceRef,automationRef:{
      domain:'automation',resourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,branch:'main',
      commitId:'runner-commit',version:1,digest:'f'.repeat(64),
    },
    status:'waiting',revision:3,parameters,
    admissionMode:'parallel',admissionScope:'all',rootRunId:id,depth:0,correlationId:id,
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
    spec:newExperimentSpec({ name:'Experiment',runModes:['simulation','field-custom'] }),
  };
}
