// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import {
  newAutomationNode,
  newAutomationSpec,
  type AutomationAction,
  type AutomationDocument,
  type AutomationRun,
  type AutomationRunSummaryView,
} from '../../automation/automationPublic';
import {
  EXPERIMENT_PROCESS_RUNTIME_DATASOURCE,
  experimentProcessRuntimeProjection,
  type ExperimentProcessRuntimeProjection,
} from '../experimentPublic';
import { newExperimentSpec,type ExperimentDocument,type PanelInstance } from '../experimentModel';
import { definePanelPlugin } from '../../../panels/types';
import { workflowRuntimeDatasources } from '../../../shared/workflowRuntimeProtocol';
import { createPanelContext,type PanelContextActions } from './panelContextFactory';
import { createExperimentRobotBindingActions } from './experimentRobotBindingActions';
import {
  ROS_BASIC_SERVICE_CALL_NODE_ID,
  projectRosBasicServices,
} from '../../../panels/ros/rosBasicServicesPanelProjection';

const plugin = definePanelPlugin({
  id:'test-panel',name:'Test',category:'Custom',description:'',capabilities:['experiment'] as const,
  actionPorts:[{ id:'start',label:'Start',required:true }],
  dataPorts:[{ id:'robots',label:'Robots',contract:'experiment.robots.v1',required:true }],
  authoringPorts:[{ id:'robots-editor',label:'Robots editor',target:'experiment.robots',required:true }],
  component:() => null,
});

const dynamicPlugin = definePanelPlugin({
  id:'dynamic-panel',name:'Dynamic',category:'Custom',description:'',capabilities:['experiment'] as const,
  dynamicActionPorts:{ source:'panel-action-bindings' },
  component:() => null,
});

const offsetPlugin = definePanelPlugin({
  id:'robot-assets-panel',name:'Robots',category:'Custom',description:'',capabilities:['experiment'] as const,
  authoringPorts:[
    { id:'robots-editor',label:'Robots editor',target:'experiment.robots',required:true },
    { id:'world-origin-offset-editor',label:'World origin',target:'experiment.localizationOffset',required:true },
  ],
  component:() => null,
});

describe('createPanelContext',() => {
  it('projects every explicit dynamic Action binding without admitting undeclared ports',async () => {
    const invokeAction = vi.fn(async () => ({ id:'dynamic-run',status:'running',revision:1 }) as const);
    const value = panel();
    value.pluginId = dynamicPlugin.id;
    value.portBindings = [
      value.portBindings[0]!,
      { portId:'formation',kind:'action',presetId:'default' },
      { portId:'fallback',kind:'action',presetId:'default' },
    ];
    const context = createPanelContext(dynamicPlugin,value,{},host({}, {
      experimentLifecycle:{ ...host().experimentLifecycle,invokeAction },
    }));

    expect(Object.keys(context.ports.actions)).toEqual(['formation','fallback']);
    expect(context.ports.actions.formation?.connected).toBe(true);
    await context.ports.actions.fallback!.invoke({},'fallback');
    expect(invokeAction).toHaveBeenCalledWith('panel','default',{},'fallback');
  });

  it('starts a tile bound to the resident workflow through the same Panel lifecycle owner as the header',async () => {
    const document=automation();
    document.spec.actions[0]!.kind='service';
    const start=vi.fn(async () => ({ id:'panel-owner',status:'running' as const,revision:1 }));
    const invokeAction=vi.fn();
    const context=createPanelContext(plugin,panel(),{},host({ documents:[document] },{
      experimentLifecycle:{ ...host().experimentLifecycle,start,invokeAction },
    }));
    expect(await context.ports.actions.start!.invoke()).toEqual({ id:'panel-owner',status:'running',revision:1 });
    expect(start).toHaveBeenCalledTimes(1);
    expect(invokeAction).not.toHaveBeenCalled();
  });

  it('keeps non-root child Actions in the Automation authoring domain',async () => {
    const invokeAction = vi.fn(async () => ({ id:'run-1',status:'running',revision:1 }) as const);
    const context = createPanelContext(plugin,panel(),{},host({}, {
      experimentLifecycle:{ ...host().experimentLifecycle,invokeAction },
    }));
    await context.ports.actions.start!.invoke({ speed:2 },'operator start');
    expect(invokeAction).toHaveBeenCalledWith('panel','default',{ speed:2 },'operator start');
  });

  it('keeps a connected Panel Action invocable before a full Experiment Run starts',async () => {
    const invokeAction = vi.fn(async () => ({ id:'run-panel-action',status:'running',revision:1 }) as const);
    const context = createPanelContext(plugin,panel(),{},host({}, {
      experimentLifecycle:{ activeRun:undefined,runMode:'simulation',start:vi.fn(),stop:vi.fn(),invokeAction },
    }));
    const action = context.ports.actions.start!;
    expect(action.connected).toBe(true);
    expect(action.disabledReason).toBe('');
    expect(action.disabledReason).not.toContain('Start the Experiment before invoking Panel Actions.');
    await action.invoke({ speed:2 },'operator start');
    expect(invokeAction).toHaveBeenCalledWith('panel','default',{ speed:2 },'operator start');
  });

  it('projects host-owned Experiment data and commits through an Authoring port',async () => {
    const updateExperimentRobotBindings = vi.fn(async () => experiment());
    const context = createPanelContext(plugin,panel(),{},host({}, { updateExperimentRobotBindings }));
    expect((context.ports.data.robots!.value as ExperimentDocument).head.resourceId).toBe('experiment-a');
    await context.ports.authoring['robots-editor']!.commit([],'commit-1','clear robots');
    expect(updateExperimentRobotBindings).toHaveBeenCalledWith([],'commit-1','clear robots');
  });

  it('commits world-camera intrinsic YAML through the action-preset authoring port',async () => {
    const updateWorkflowPresetInputs = vi.fn(async () => experiment());
    const cameraPlugin = definePanelPlugin({
      id:'gazebo-world-camera',name:'World camera',category:'Custom',description:'',capabilities:['experiment'] as const,
      authoringPorts:[{ id:'workflow-parameters',label:'Camera calibration defaults',target:'action-preset' }],
      component:() => null,
    });
    const value = panel();
    value.portBindings = [
      { portId:'panel-workflow',kind:'workflow',workflowInstanceId:'worker',presetId:'default',managed:true,relation:'supervised',failurePolicy:'keep-experiment' },
      { portId:'workflow-parameters',kind:'authoring',target:'action-preset',presetId:'default' },
    ];
    const context = createPanelContext(cameraPlugin,value,{},host({}, {
      experimentLifecycle:{ activeRun:undefined,runMode:'simulation',start:vi.fn(),stop:vi.fn() },
      updateWorkflowPresetInputs,
    }));
    expect(context.ports.authoring['workflow-parameters']?.connected).toBe(true);
    expect(context.ports.authoring['workflow-parameters']?.value).toEqual({
      headCommitId:'commit-1',runMode:'simulation',inputs:{ speed:1 },
    });
    await context.ports.authoring['workflow-parameters']!.commit(
      { simulationIntrinsicFile:'/calibration/sim/usb_cam/intrinsics-new.yaml' },
      'commit-1',
      'Update Experiment camera intrinsics',
    );
    expect(updateWorkflowPresetInputs).toHaveBeenCalledWith(
      'worker','default',{ simulationIntrinsicFile:'/calibration/sim/usb_cam/intrinsics-new.yaml' },
      'commit-1','Update Experiment camera intrinsics',
    );
  });

  it('connects world-camera intrinsic authoring even when the saved panel omitted the binding',async () => {
    const updateWorkflowPresetInputs = vi.fn(async () => experiment());
    const cameraPlugin = definePanelPlugin({
      id:'gazebo-world-camera',name:'World camera',category:'Custom',description:'',capabilities:['experiment'] as const,
      authoringPorts:[{ id:'workflow-parameters',label:'Camera calibration defaults',target:'action-preset' }],
      component:() => null,
    });
    const value = panel();
    value.portBindings = [
      { portId:'panel-workflow',kind:'workflow',workflowInstanceId:'worker',presetId:'default',managed:true,relation:'supervised',failurePolicy:'keep-experiment' },
    ];
    const context = createPanelContext(cameraPlugin,value,{},host({}, {
      experimentLifecycle:{ activeRun:undefined,runMode:'physical',start:vi.fn(),stop:vi.fn() },
      updateWorkflowPresetInputs,
    }));
    expect(context.ports.authoring['workflow-parameters']?.connected).toBe(true);
    expect(context.ports.authoring['workflow-parameters']?.value).toEqual({
      headCommitId:'commit-1',runMode:'physical',inputs:{ speed:1 },
    });
    await context.ports.authoring['workflow-parameters']!.commit(
      { physicalIntrinsicFile:'/calibration/phy/usb_cam/intrinsics-new.yaml' },
      'commit-1',
      'Update Experiment camera intrinsics',
    );
    expect(updateWorkflowPresetInputs).toHaveBeenCalledWith(
      'worker','default',{ physicalIntrinsicFile:'/calibration/phy/usb_cam/intrinsics-new.yaml' },
      'commit-1','Update Experiment camera intrinsics',
    );
  });

  it('connects world origin offset authoring even when the saved panel omitted the binding',async () => {
    const updateExperimentLocalizationOffset = vi.fn(async () => experiment());
    const value = panel();
    value.portBindings = value.portBindings.filter((binding) => binding.portId !== 'world-origin-offset-editor');
    const context = createPanelContext(offsetPlugin,value,{},host({}, { updateExperimentLocalizationOffset }));
    expect(context.ports.authoring['world-origin-offset-editor']?.connected).toBe(true);
    expect(context.ports.authoring['world-origin-offset-editor']?.value).toEqual({ x:0,y:0,z:0 });
    await context.ports.authoring['world-origin-offset-editor']!.commit({ x:1.25,y:-2,z:0.1 },'commit-1','offset');
    expect(updateExperimentLocalizationOffset).toHaveBeenCalledWith({ x:1.25,y:-2,z:0.1 },'commit-1','offset');
  });

  it.each([false,true])('routes only world origin through next-restart authoring when readOnly=%s',async (readOnly) => {
    const current = experiment();
    current.head.system = readOnly;
    const save = vi.fn(async (value: ExperimentDocument) => value);
    const actions = createExperimentRobotBindingActions({
      getRendered:() => current,runtimeActive:true,dashboardEditing:false,save,
    });
    const context = createPanelContext(offsetPlugin,panel(),{},host({}, {
      experiment:current,
      updateExperimentRobotBindings:actions.update,
      updateExperimentRobotBindingsDisabledReason:actions.disabledReason,
      updateExperimentLocalizationOffset:actions.updateLocalizationOffset,
      updateExperimentLocalizationOffsetDisabledReason:actions.localizationOffsetDisabledReason,
    }));
    const origin = context.ports.authoring['world-origin-offset-editor']!;
    const robots = context.ports.authoring['robots-editor']!;
    expect(origin.connected).toBe(true);
    expect(origin.disabledReason).toBe(readOnly ? 'This Experiment is read only.' : '');
    expect(robots.disabledReason).toMatch(readOnly ? /read only/ : /Stop it before editing assets/);
    if (readOnly) {
      await expect(origin.commit({ x:2,y:-1,z:0.5 },'commit-1')).rejects.toThrow(/read only/);
      expect(save).not.toHaveBeenCalled();
    } else {
      await origin.commit({ x:2,y:-1,z:0.5 },'commit-1');
      expect(save).toHaveBeenCalledOnce();
      expect(save.mock.calls[0]?.[0].spec.localizationOffset).toEqual({ x:2,y:-1,z:0.5 });
    }
    await expect(robots.commit([],'commit-1')).rejects.toThrow(robots.disabledReason);
  });

  it('does not expose Automation Run history through intrinsic calibration data',() => {
    const calibrationPlugin = definePanelPlugin({
      id:'calibration-panel',name:'Calibration',category:'Custom',description:'',capabilities:['experiment'] as const,
      dataPorts:[{ id:'calibration',label:'Calibration',contract:'camera.calibration.intrinsic.v1' }],
      component:() => null,
    });
    const value = panel();
    value.portBindings = [{ portId:'calibration',kind:'data',projection:'camera.calibration.intrinsic.v1' }];
    const projected = createPanelContext(calibrationPlugin,value,{},host()).ports.data.calibration!.value as Record<string,unknown>;
    expect(projected).toEqual(expect.objectContaining({
      targetId:'local',experimentResourceId:'experiment-a',documents:expect.any(Array),catalog:expect.any(Array),
    }));
    expect(projected).not.toHaveProperty('runSummaries');
    expect(projected).not.toHaveProperty('runDetailsById');
    expect(projected).not.toHaveProperty('refreshExecutionHistory');
  });

  it('fails closed when a Data port projection does not match the plugin contract',() => {
    const value = panel();
    value.portBindings[2] = { portId:'robots',kind:'data',projection:workflowRuntimeDatasources.run };
    const port = createPanelContext(plugin,value,{},host()).ports.data.robots!;
    expect(port.connected).toBe(false);
    expect(port.value).toBeUndefined();
  });

  it('projects the retained Workflow run truth through the explicit logs contract',() => {
    const logsPlugin = definePanelPlugin({
      id:'workflow-logs-runtime',name:'Workflow logs',category:'Log',description:'',capabilities:['experiment'] as const,
      dataPorts:[{ id:'trace',label:'Trace',contract:workflowRuntimeDatasources.runLogs,required:true }],
      component:() => null,
    });
    const value = panel();
    value.pluginId = logsPlugin.id;
    value.portBindings = [
      value.portBindings[0]!,
      { portId:'trace',kind:'data',projection:workflowRuntimeDatasources.runLogs },
    ];
    const hostState=host();
    const automationState=hostState.automation;
    const projected = createPanelContext(logsPlugin,value,{},hostState).ports.data.trace!.value;
    expect(projected).toEqual(expect.objectContaining({
      targetId:automationState.targetId,
      documents:automationState.documents,
      runSummaries:automationState.runSummaries,
      runDetailsById:automationState.runDetailsById,
      refreshExecutionHistory:automationState.refreshExecutionHistory,
    }));
  });

  it('does not project workflowruntime.run as experiment.runtime.v1',() => {
    const runtimePlugin = definePanelPlugin({
      id:'ros-runtime',name:'ROS',category:'Control',description:'',capabilities:['experiment'] as const,
      dataPorts:[{ id:'service-health',label:'Health',contract:EXPERIMENT_PROCESS_RUNTIME_DATASOURCE }],
      component:() => null,
    });
    const value = panel();
    value.portBindings = [
      { portId:'service-health',kind:'data',projection:workflowRuntimeDatasources.run },
    ];
    const port = createPanelContext(runtimePlugin,value,{},host({}, {
      executionRuntime:{ targetId:'local',processInstances:[],loading:false,error:'' },
    })).ports.data['service-health']!;
    expect(port.connected).toBe(false);
    expect(port.value).toBeUndefined();
    expect(experimentProcessRuntimeProjection(port.value)).toBeUndefined();
  });

  it('routes motion intent through an Experiment-owned public Automation Action',async () => {
    const target = experiment();
    target.spec.workflowInstances[0]!.actionPresets[0] = {
      id:'default',actionId:'set-motion-intent',inputs:{ gear:1,longitudinal:0,lateral:0,yaw:0 },
      parameterBindings:[],
    };
    const document = automation();
    document.spec.actions[0]!.id = 'set-motion-intent';
    const invokeAction = vi.fn(async () => ({ id:'command-1',status:'running',revision:1 }) as const);
    const context = createPanelContext(plugin,panel(),{},host(
      { documents:[document] },
      { experiment:target,experimentLifecycle:{ activeRun:experimentRun(),runMode:'simulation',start:vi.fn(),stop:vi.fn(),invokeAction } },
    ));
    await context.ports.actions.start!.invoke({
      controllerId:'controller-1',robotIds:['scout-01'],longitudinal:1,
    },'Drive Scout forward');
    expect(invokeAction).toHaveBeenCalledWith('panel','default',{
      controllerId:'controller-1',robotIds:['scout-01'],longitudinal:1,
    },'Drive Scout forward');
  });

  it('refuses stale Action connections instead of discovering a fallback workflow',async () => {
    const broken = panel();
    broken.portBindings[0] = { ...broken.portBindings[0]!,kind:'workflow',workflowInstanceId:'missing' } as typeof broken.portBindings[0];
    const port = createPanelContext(plugin,broken,{},host()).ports.actions.start!;
    expect(port.connected).toBe(false);
    await expect(port.invoke()).rejects.toThrow(/missing/);
  });

  it('keeps direct Agent target roots on their exact Panel/preset selector',() => {
    const exactPlugin = definePanelPlugin({
      id:'preset-panel',name:'Preset panel',category:'Custom',description:'',capabilities:['experiment'] as const,
      actionPorts:[{ id:'run',label:'Run' },{ id:'restart',label:'Restart' }],component:() => null,
    });
    const value = panel();
    value.pluginId = 'preset-panel';
    value.portBindings = [
      { portId:'panel-workflow',kind:'workflow',workflowInstanceId:'worker',presetId:'run',managed:true,relation:'supervised',failurePolicy:'keep-experiment' },
      { portId:'run',kind:'action',presetId:'run' },
      { portId:'restart',kind:'action',presetId:'restart' },
    ];
    const target = experiment();
    target.spec.workflowInstances[0]!.actionPresets = [
      { id:'run',actionId:'run',inputs:{ robotId:'' },parameterBindings:[] },
      { id:'restart',actionId:'run',inputs:{ robotId:'robot-1' },parameterBindings:[] },
    ];
    const stale=directTargetRootSummary('stale-run','run','2026-01-01T00:00:03Z','agent/scout');
    stale.sourceRef={ ...stale.sourceRef!,commitId:'stale-commit',version:0,digest:'e'.repeat(64) };
    const context = createPanelContext(exactPlugin,value,{},host({
      targetId:'agent/scout',
      runSummaries:[
        directTargetRootSummary('main-run','run','2026-01-01T00:00:01Z','agent/scout'),
        directTargetRootSummary('restart-run','restart','2026-01-01T00:00:02Z','agent/scout'),
        stale,
      ],
    },{ experiment:target }));
    expect(context.ports.actions.run?.activeInvocation?.id).toBe('main-run');
    expect(context.ports.actions.restart?.activeInvocation?.id).toBe('restart-run');
  });

  it('retains the exact command receipt after it leaves activeRuns',() => {
    const exact=systemRootSummary('receipt','invoke-panel-action','panel','default');
    exact.status='succeeded';
    const other=systemRootSummary('other','invoke-panel-action','panel','other');
    other.createdAt='2026-01-02T00:00:00Z';
    const stale=systemRootSummary('stale','invoke-panel-action','panel','default');
    stale.sourceRef={ ...stale.sourceRef!,commitId:'old' };
    stale.createdAt=other.createdAt;
    const value=createPanelContext(plugin,panel(),{},host({ runSummaries:[exact,other,stale] }));
    expect(value.ports.actions.start?.activeInvocation).toBeUndefined();
    expect(value.ports.actions.start?.latestInvocation).toEqual({ id:'receipt',status:'succeeded',revision:2 });
  });

  it('restores action progress from a retained Session root detail on a fresh browser',() => {
    const detail=rosPanelRunDetail();
    const root=systemRootSummary('receipt','invoke-panel-action','panel','default');
    const run={ ...rosPanelChildRun('receipt','receipt','run'),...root,parentRunId:undefined,depth:0,
      parameters:{ runMode:'simulation',panelId:'panel',presetId:'default' },status:'succeeded' as const };
    const value=createPanelContext(plugin,panel(),{},host({
      runSummaries:[],runDetailsById:{ receipt:{ ...detail,run } },
    }));
    expect(value.ports.actions.start?.latestInvocation).toEqual({ id:'receipt',status:'succeeded',revision:2 });
  });

  it('resolves a local Panel Action to the child Run under its exact System root selector',() => {
    const root=experimentRun('invoke-root','invoke-panel-action','panel');
    const context=createPanelContext(plugin,panel(),{},host({
      runSummaries:[
        systemRootSummary('invoke-root','invoke-panel-action','panel','default'),
        panelChildSummary('panel-child','invoke-root'),
        systemRootSummary('decoy-root','invoke-panel-action','other-panel','default'),
        panelChildSummary('decoy-child','decoy-root'),
      ],
    },{
      experimentLifecycle:{
        activeRun:root,activeRuns:[root],runMode:'simulation',start:vi.fn(),stop:vi.fn(),
      },
    }));
    expect(context.ports.actions.start?.activeInvocation).toEqual({
      id:'panel-child',status:'waiting',revision:1,
    });
  });

  it('projects an active service child from retained details even when history summaries are empty',() => {
    const root=experimentRun('owner','run-panel','panel');
    const rootRun={ ...rosPanelChildRun('owner','owner','run'),
      ...systemRootSummary('owner','run-panel','panel'),parentRunId:undefined,depth:0,
      parameters:{ panelId:'panel',runMode:'simulation' } };
    const child={ ...rosPanelChildRun('child','owner','run'),...panelChildSummary('child','owner'),parameters:{} };
    const document=automation();
    document.spec.actions[0]!.kind='service';
    const actionHost=host({ documents:[document],runSummaries:[],runDetailsById:{
      owner:{ ...rosPanelRunDetail(),run:rootRun },child:{ ...rosPanelRunDetail(),run:child },
    } },{ executionRuntime:{ targetId:'local',loading:false,error:'',processInstances:[{
      id:'owned',targetId:'local',definitionId:'algorithm',definitionVersion:'1',definitionDigest:'a'.repeat(64),
      ownerType:'orchestration-run',ownerId:'child',scope:'run',parameters:{},driver:'host',desiredState:'running',
      observedState:'running',readiness:{ status:'passing' },liveness:{ status:'passing' },revision:1,restartCount:0,createdAt:'t',updatedAt:'t',
    }] },experimentLifecycle:{ ...host().experimentLifecycle,activeRun:root,activeRuns:[root] } });
    const context=createPanelContext(plugin,panel(),{},actionHost);
    expect(context.ports.actions.start?.serviceStatus).toEqual({ state:'running',ready:1,total:1 });
    expect(context.ports.actions.start?.activeInvocation).toEqual({ id:'child',status:'waiting',revision:1 });
    const process=actionHost.executionRuntime!.processInstances[0]!;
    process.readiness.status='failing';
    expect(createPanelContext(plugin,panel(),{},actionHost).ports.actions.start?.serviceStatus)
      .toEqual({ state:'degraded',ready:0,total:1 });
    process.readiness.status='passing';
    process.ownerId='another-experiment';
    expect(createPanelContext(plugin,panel(),{},actionHost).ports.actions.start?.serviceStatus)
      .toEqual({ state:'starting',ready:0,total:0 });
  });

  it('projects Process census for every Experiment Action, not only resident workflows',() => {
    const root=experimentRun('owner','invoke-panel-action','panel');
    const document=automation();
    document.spec.actions[0]!.kind='command';
    const child={ ...rosPanelChildRun('child','owner','run'),...panelChildSummary('child','owner','running'),
      status:'running' as const,parameters:{} };
    const actionHost=host({ documents:[document],runSummaries:[
      systemRootSummary('owner','invoke-panel-action','panel','default'),
      panelChildSummary('child','owner','running'),
    ],runDetailsById:{ child:{ ...rosPanelRunDetail(),run:child } } },{ executionRuntime:{
      targetId:'local',loading:false,error:'',processInstances:[{
        id:'owned',targetId:'local',definitionId:'algorithm',definitionVersion:'1',definitionDigest:'a'.repeat(64),
        ownerType:'orchestration-run',ownerId:'child',scope:'run',parameters:{},driver:'host',desiredState:'running',
        observedState:'running',readiness:{ status:'passing' },liveness:{ status:'passing' },revision:1,restartCount:0,
        createdAt:'t',updatedAt:'t',
      }],
    },experimentLifecycle:{
      activeRun:root,activeRuns:[root],runMode:'simulation',start:vi.fn(),stop:vi.fn(),
    } });
    expect(createPanelContext(plugin,panel(),{},actionHost).ports.actions.start?.serviceStatus)
      .toEqual({ state:'running',ready:1,total:1 });
  });

  it('fills a finite workflow tile from work-node occupancy when no Process census exists',() => {
    const root=experimentRun('owner','invoke-panel-action','panel');
    const document=automation();
    document.spec.actions[0]!.kind='command';
    const compile=newAutomationNode('process.run-bash',{},'Catkin Make',1);
    compile.id='compile';
    document.spec.nodes=[document.spec.nodes[0]!,compile];
    const child={ ...rosPanelChildRun('child','owner','run'),...panelChildSummary('child','owner','running'),
      status:'running' as const,parameters:{} };
    const actionHost=host({ documents:[document],runSummaries:[
      systemRootSummary('owner','invoke-panel-action','panel','default'),
      panelChildSummary('child','owner','running'),
    ],runDetailsById:{
      child:{ invocations:[],loading:false,error:'',run:child,nodeSummaries:[
        nodeSummary('child','manual','trigger.manual','succeeded'),
        nodeSummary('child','compile','process.run-bash','running'),
      ] },
    } },{
      experimentLifecycle:{
        activeRun:root,activeRuns:[root],runMode:'simulation',start:vi.fn(),stop:vi.fn(),
      },
    });
    expect(createPanelContext(plugin,panel(),{},actionHost).ports.actions.start?.serviceStatus)
      .toEqual({ state:'running',ready:1,total:1 });
    expect(createPanelContext(plugin,panel(),{},actionHost).ports.actions.start?.activeInvocation)
      .toEqual({ id:'child',status:'running',revision:1 });
  });

  it('keeps work-node occupancy after a failed workflow run leaves active',() => {
    const document=automation();
    document.spec.actions[0]!.kind='command';
    const compile=newAutomationNode('process.run-bash',{},'Catkin Make',1);
    compile.id='compile';
    document.spec.nodes=[document.spec.nodes[0]!,compile];
    const child={ ...rosPanelChildRun('child','owner','run'),...panelChildSummary('child','owner','failed'),
      status:'failed' as const,parameters:{} };
    const actionHost=host({ documents:[document],runSummaries:[
      { ...systemRootSummary('owner','invoke-panel-action','panel','default'),status:'failed' },
      panelChildSummary('child','owner','failed'),
    ],runDetailsById:{
      child:{ invocations:[],loading:false,error:'',run:child,nodeSummaries:[
        nodeSummary('child','manual','trigger.manual','succeeded'),
        nodeSummary('child','compile','process.run-bash','failed'),
      ] },
    } },{
      experimentLifecycle:{
        activeRun:undefined,activeRuns:[],runMode:'simulation',start:vi.fn(),stop:vi.fn(),
      },
    });
    const port=createPanelContext(plugin,panel(),{},actionHost).ports.actions.start;
    expect(port?.activeInvocation).toBeUndefined();
    expect(port?.latestInvocation?.status).toBe('failed');
    expect(port?.serviceStatus).toEqual({ state:'degraded',ready:1,total:1 });
  });

  it('does not let a sibling Action occupy another tile on the same document',() => {
    const root=experimentRun('owner','invoke-panel-action','panel');
    const document=automation();
    const publishEntry=newAutomationNode('trigger.manual',{},'Publish',2);
    publishEntry.id='publish-entry';
    const publish=newAutomationNode('ros.publish',{},'Publish pose',1);
    publish.id='publish';
    const wait=newAutomationNode('wait.process',{},'Wait algorithm',1);
    wait.id='wait';
    document.spec.nodes=[document.spec.nodes[0]!,wait,publishEntry,publish];
    document.spec.edges=[
      { id:'run-wait',from:document.spec.nodes[0]!.id,to:'wait',condition:'success' },
      { id:'publish-entry-publish',from:'publish-entry',to:'publish',condition:'success' },
    ];
    document.spec.actions=[
      { ...document.spec.actions[0]!,id:'run',entryNodeId:document.spec.nodes[0]!.id,kind:'service' },
      { ...document.spec.actions[0]!,id:'publish',label:'Publish',entryNodeId:'publish-entry',kind:'command' },
    ];
    const child={ ...rosPanelChildRun('child','owner','run'),...panelChildSummary('child','owner','running'),
      status:'running' as const,parameters:{} };
    const actionHost=host({ documents:[document],runSummaries:[
      systemRootSummary('owner','invoke-panel-action','panel','default'),
      panelChildSummary('child','owner','running'),
    ],runDetailsById:{
      child:{ invocations:[],loading:false,error:'',run:child,nodeSummaries:[
        nodeSummary('child','manual','trigger.manual','succeeded'),
        nodeSummary('child','wait','wait.process','waiting'),
        nodeSummary('child','publish','ros.publish','running'),
      ] },
    } },{
      experimentLifecycle:{
        activeRun:root,activeRuns:[root],runMode:'simulation',start:vi.fn(),stop:vi.fn(),
      },
    });
    expect(createPanelContext(plugin,panel(),{},actionHost).ports.actions.start?.serviceStatus)
      .toEqual({ state:'running',ready:1,total:1 });
  });

  it('uses the exact full-Run relation child only as the Panel workflow fallback',() => {
    const root=experimentRun('full-root','run');
    const context=createPanelContext(plugin,panel(),{},host({}, {
      experimentLifecycle:{
        activeRun:root,activeRuns:[root],runMode:'simulation',start:vi.fn(),stop:vi.fn(),
        panelWorkflowInvocationFallback:{
          rootRunId:'full-root',targetId:'local',id:'full-panel-child',status:'waiting',revision:9,
        },
      },
    }));
    expect(context.ports.actions.start?.activeInvocation).toEqual({
      id:'full-panel-child',status:'waiting',revision:9,
    });
  });

  it('fails closed when two exact System roots own active children for one port',() => {
    const first=experimentRun('invoke-a','invoke-panel-action','panel');
    const second=experimentRun('invoke-b','invoke-panel-action','panel');
    const context=createPanelContext(plugin,panel(),{},host({
      runSummaries:[
        systemRootSummary('invoke-a','invoke-panel-action','panel','default'),
        panelChildSummary('child-a','invoke-a'),
        systemRootSummary('invoke-b','invoke-panel-action','panel','default'),
        panelChildSummary('child-b','invoke-b'),
      ],
    },{
      experimentLifecycle:{
        activeRun:first,activeRuns:[first,second],runMode:'simulation',start:vi.fn(),stop:vi.fn(),
      },
    }));
    expect(context.ports.actions.start?.activeInvocation).toBeUndefined();
  });

  it('keeps exact relation identity while same-Automation workflow instances share one full root',() => {
    const root=experimentRun('full-root','run');
    const context=createPanelContext(plugin,panel(),{},host({
      runSummaries:[
        systemRootSummary('full-root','run'),
        panelChildSummary('selected-child','full-root'),
        panelChildSummary('other-instance-child','full-root'),
      ],
    },{
      experimentLifecycle:{
        activeRun:root,activeRuns:[root],runMode:'simulation',start:vi.fn(),stop:vi.fn(),
        panelWorkflowInvocationFallback:{
          rootRunId:'full-root',targetId:'local',id:'selected-child',status:'waiting',revision:1,
        },
      },
    }));
    expect(context.ports.actions.start?.activeInvocation).toEqual({
      id:'selected-child',status:'waiting',revision:1,
    });
  });

  it('reprojects a mounted Panel from current child truth through stop and explicit restart',() => {
    const fullRoot=experimentRun('full-root','run');
    const fallback={
      rootRunId:'full-root',targetId:'local',id:'full-child',status:'waiting' as const,revision:1,
    };
    const lifecycleBase={
      activeRun:fullRoot,activeRuns:[fullRoot],runMode:'simulation',start:vi.fn(),stop:vi.fn(),
      panelWorkflowInvocationFallback:fallback,
    };
    const { result,rerender }=renderHook(({ automationRuns,lifecycle }) => (
      createPanelContext(plugin,panel(),{},host(
        { runSummaries:automationRuns },{ experimentLifecycle:lifecycle },
      )).ports.actions.start?.activeInvocation
    ),{
      initialProps:{ automationRuns:[] as AutomationRunSummaryView[],lifecycle:lifecycleBase },
    });
    expect(result.current).toEqual({ id:'full-child',status:'waiting',revision:1 });

    rerender({
      automationRuns:[panelChildSummary('full-child','full-root','stopping',2)],
      lifecycle:lifecycleBase,
    });
    expect(result.current).toEqual({ id:'full-child',status:'stopping',revision:2 });

    rerender({
      automationRuns:[panelChildSummary('full-child','full-root','stopped',3)],
      lifecycle:lifecycleBase,
    });
    expect(result.current).toBeUndefined();

    const panelRoot=experimentRun('panel-root','run-panel','panel');
    const restartingLifecycle={ ...lifecycleBase,activeRuns:[fullRoot,panelRoot] };
    rerender({
      automationRuns:[
        panelChildSummary('full-child','full-root','stopped',3),
        systemRootSummary('panel-root','run-panel','panel'),
      ],
      lifecycle:restartingLifecycle,
    });
    expect(result.current).toBeUndefined();

    rerender({
      automationRuns:[
        panelChildSummary('full-child','full-root','stopped',3),
        systemRootSummary('panel-root','run-panel','panel'),
        panelChildSummary('replacement-child','panel-root','waiting',1),
      ],
      lifecycle:restartingLifecycle,
    });
    expect(result.current).toEqual({ id:'replacement-child',status:'waiting',revision:1 });
  });

  it('keeps robot instruments on the full parent while a selected restart root is active',() => {
    const fullRoot=experimentRun('full-root','run');
    const panelRoot=experimentRun('panel-root','run-panel','panel');
    const robotPanel=panel();
    robotPanel.pluginId='robot-instruments-grid';
    const context=createPanelContext(plugin,robotPanel,{},host({
      runSummaries:[
        panelChildSummary('full-child','full-root','waiting',2),
        systemRootSummary('panel-root','run-panel','panel'),
        panelChildSummary('selected-child','panel-root','waiting',1),
      ],
    },{
      experimentLifecycle:{
        activeRun:fullRoot,activeRuns:[fullRoot,panelRoot],runMode:'simulation',start:vi.fn(),stop:vi.fn(),
        panelWorkflowInvocationFallback:{
          rootRunId:'full-root',targetId:'local',id:'full-child',status:'waiting',revision:2,
        },
      },
    }));
    expect(context.ports.actions.start?.activeInvocation).toEqual({
      id:'full-child',status:'waiting',revision:2,
    });
  });

  it('projects Total Run ROS service tiles onto exact call-node grandchildren',async () => {
    const stopAction = vi.fn(async () => undefined);
    const context = createPanelContext(rosPlugin(),rosPanel(),{},host({
      documents:[rosControlDocument()],
      runSummaries:[
        systemRootSummary('full-root','run'),
        rosPanelChildSummary('panel-run','full-root','start-for-experiment'),
        ...totalRunServices.map((service) => rosServiceChildSummary(service.childRunId,'panel-run',service.automationId)),
      ],
      runDetailsById:{ 'panel-run':rosPanelRunDetail() },
    },{
      experiment:rosExperiment(),
      experimentLifecycle:{
        activeRun:experimentRun('full-root','run'),activeRuns:[experimentRun('full-root','run')],
        runMode:'simulation',start:vi.fn(),stop:vi.fn(),stopAction,
        panelWorkflowInvocationFallback:{
          rootRunId:'full-root',targetId:'local',id:'panel-run',status:'waiting',revision:1,
        },
      },
    }));
    for (const service of totalRunServices) {
      expect(context.ports.actions[service.id]?.activeInvocation).toEqual({
        id:service.childRunId,status:'waiting',revision:1,
      });
    }
    const invocation = context.ports.actions.roscore!.activeInvocation!;
    await context.ports.actions.roscore!.control(invocation,'stop','Stop ROS');
    expect(stopAction).toHaveBeenCalledWith(invocation,'Stop ROS');
    const runtime:ExperimentProcessRuntimeProjection = {
      targetId:'local',loading:false,error:'',processInstances:[],documents:[rosControlDocument()],catalog:[],
      runSummaries:[
        systemRootSummary('full-root','run'),
        rosPanelChildSummary('panel-run','full-root','start-for-experiment'),
        ...totalRunServices.map((service) => rosServiceChildSummary(service.childRunId,'panel-run',service.automationId)),
      ],
      runDetailsById:{ 'panel-run':rosPanelRunDetail() },
      activeRun:experimentRun('full-root','run'),
    };
    const projected = projectRosBasicServices(
      runtime,
      totalRunServices.map((service) => service.id),
      Object.fromEntries(totalRunServices.map((service) => [service.id,{
        automationResourceId:'ros-panel',actionId:service.id,
      }])),
    );
    for (const service of totalRunServices) {
      expect(projected.find((item) => item.service.id === service.id)?.runId).toBe(
        context.ports.actions[service.id]?.activeInvocation?.id,
      );
    }
  });

  it('projects independently started ROS Panel services from a run-panel root',() => {
    const panelRoot = experimentRun('panel-root','run-panel','ros-control');
    const panelDetail = {
      ...rosPanelRunDetail(totalRunServices.slice(0,3),'panel-root'),
      run:rosPanelChildRun('panel-run','panel-root','start-for-experiment'),
    };
    const context = createPanelContext(rosPlugin(),rosPanel(),{},host({
      documents:[rosControlDocument()],
      runSummaries:[
        systemRootSummary('panel-root','run-panel','ros-control'),
      ],
      runDetailsById:{ 'panel-run':panelDetail },
    },{
      experiment:rosExperiment(),
      experimentLifecycle:{
        activeRun:panelRoot,activeRuns:[panelRoot],runMode:'simulation',
        start:vi.fn(),stop:vi.fn(),stopAction:vi.fn(),
      },
    }));
    for (const service of totalRunServices.slice(0,3)) {
      expect(context.ports.actions[service.id]?.activeInvocation).toEqual({
        id:service.childRunId,status:'waiting',revision:1,
      });
    }
    for (const service of totalRunServices.slice(3)) {
      expect(context.ports.actions[service.id]?.activeInvocation).toBeUndefined();
    }
  });

  it('keeps invoke-panel-action on the parent Action Run instead of the Total Run grandchild',() => {
    const root = experimentRun('invoke-root','invoke-panel-action','ros-control');
    const context = createPanelContext(rosPlugin(),rosPanel(),{},host({
      documents:[rosControlDocument()],
      runSummaries:[
        systemRootSummary('invoke-root','invoke-panel-action','ros-control','roscore'),
        rosPanelChildSummary('invoke-roscore','invoke-root','roscore'),
        rosServiceChildSummary('ros-child','invoke-roscore','roscore-automation'),
      ],
    },{
      experiment:rosExperiment(),
      experimentLifecycle:{
        activeRun:root,activeRuns:[root],runMode:'simulation',start:vi.fn(),stop:vi.fn(),
      },
    }));
    expect(context.ports.actions.roscore?.activeInvocation).toEqual({
      id:'invoke-roscore',status:'waiting',revision:1,
    });
  });

  it('stops the exact nested service after its Session-owned manual Action parent succeeds',async () => {
    const root = {
      ...experimentRun('invoke-root','invoke-panel-action','ros-control'),
      status:'succeeded' as const,revision:9,
    };
    const service=totalRunServices[0]!;
    const detail=rosPanelRunDetail([service],'invoke-root');
    detail.relations.runId='invoke-roscore';
    detail.relations.childRuns[0]!.parentRunId='invoke-roscore';
    detail.relations.childRuns[0]!.ownerRunId='invoke-roscore';
    const exactParent=rosPanelChildRun('invoke-roscore','invoke-root','roscore');
    exactParent.status='succeeded';
    exactParent.revision=4;
    const stopAction=vi.fn(async () => undefined);
    const context=createPanelContext(rosPlugin(),rosPanel(),{},host({
      documents:[rosControlDocument()],
      runSummaries:[
        { ...systemRootSummary('invoke-root','invoke-panel-action','ros-control','roscore'),status:'succeeded',revision:9 },
      ],
      runDetailsById:{ 'invoke-roscore':{ ...detail,run:exactParent } },
    },{
      experiment:rosExperiment(),
      experimentLifecycle:{
        activeRun:root,activeRuns:[root],runMode:'simulation',
        start:vi.fn(),stop:vi.fn(),stopAction,
      },
    }));

    expect(context.ports.actions.roscore?.activeInvocation).toEqual({
      id:'ros-child',status:'waiting',revision:1,
    });
    const invocation=context.ports.actions.roscore!.activeInvocation!;
    await context.ports.actions.roscore!.control(invocation,'stop','Stop ROS');
    expect(stopAction).toHaveBeenCalledWith(invocation,'Stop ROS');
  });
});

function directTargetRootSummary(
  id:string,presetId:string,updatedAt:string,targetId:string,
):AutomationRunSummaryView {
  return {
    id,targetId,automationResourceId:'worker',actionId:'run',actionVersion:1,
    sourceKind:'experiment',sourceRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main',commitId:'commit-1',version:1,digest:'d'.repeat(64) },
    experimentSelector:{ runMode:'simulation',panelId:'panel',presetId },status:'waiting',revision:1,
    rootRunId:id,createdAt:updatedAt,updatedAt,
  };
}

function systemRootSummary(
  id:string,actionId:string,panelId?:string,presetId?:string,
):AutomationRunSummaryView {
  return {
    id,targetId:'local',automationResourceId:'069f036b-9638-4827-9524-73ff03fe99c9',actionId,actionVersion:1,
    sourceKind:'experiment',sourceRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main',commitId:'commit-1',version:1,digest:'d'.repeat(64) },
    experimentSelector:{ runMode:'simulation',...(panelId ? { panelId } : {}),...(presetId ? { presetId } : {}) },
    status:'waiting',revision:2,rootRunId:id,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',
  };
}

function nodeSummary(
  runId:string,nodeId:string,kind:string,status:'pending'|'running'|'waiting'|'succeeded'|'failed',
) {
  return {
    runId,nodeId,kind,status,occurrenceCount:1,
    activeOccurrenceCount:status==='running' || status==='waiting' ? 1 : 0,
    completedOccurrenceCount:status==='succeeded' ? 1 : 0,
    failedOccurrenceCount:status==='failed' ? 1 : 0,
    attemptCount:1,updatedAt:'t',revision:1,
  };
}

function panelChildSummary(
  id:string,
  rootRunId:string,
  status:AutomationRunSummaryView['status']='waiting',
  revision=1,
):AutomationRunSummaryView {
  return {
    id,targetId:'local',automationResourceId:'worker',actionId:'run',actionVersion:1,
    sourceKind:'automation',sourceRef:{ domain:'automation',resourceId:'worker',branch:'main',commitId:'commit-worker',version:1,digest:'e'.repeat(64) },
    status,revision,parentRunId:rootRunId,rootRunId,
    createdAt:'2026-01-01T00:00:01Z',updatedAt:'2026-01-01T00:00:01Z',
  };
}

function panel():PanelInstance {
  return { id:'panel',pluginId:'test-panel',title:'Test',gridPos:{ x:0,y:0,w:4,h:4 },query:{},options:{},fieldConfig:{},portBindings:[
    { portId:'panel-workflow',kind:'workflow',workflowInstanceId:'worker',presetId:'default',managed:true,relation:'supervised',failurePolicy:'keep-experiment' },
    { portId:'start',kind:'action',presetId:'default' },
    { portId:'robots',kind:'data',projection:'experiment.robots.v1' },
    { portId:'robots-editor',kind:'authoring',target:'experiment.robots' },
  ] };
}

function experiment():ExperimentDocument {
  const spec = newExperimentSpec({ name:'Experiment',runModes:['simulation'] });
  spec.workflowInstances = [{ id:'worker',ref:{ domain:'automation',resourceId:'worker',branch:'main' },
    actionPresets:[{ id:'default',actionId:'run',inputs:{ speed:1 },parameterBindings:[] }] }];
  return { head:head('experiment','experiment-a'),branch:branch('experiment','experiment-a'),spec };
}

function automation(resourceId='worker'):AutomationDocument {
  return { head:head('automation',resourceId),branch:branch('automation',resourceId),spec:newAutomationSpec(resourceId) };
}

function host(
  automationOverrides:Partial<PanelContextActions['automation']> = {},
  overrides:Partial<PanelContextActions> = {},
):PanelContextActions {
  const automationHost = {
    targetId:'local',documents:[automation()],catalog:[],runSummaries:[],runDetailsById:{},loading:false,error:'',
    runDocument:vi.fn(),runBoundAutomation:vi.fn(),stop:vi.fn(),stopRunSet:vi.fn(),loadRunDetail:vi.fn(),refreshExecutionHistory:vi.fn(),
    ...automationOverrides,
  } as unknown as PanelContextActions['automation'];
  return {
    experiment:experiment(),automation:automationHost,
    experimentLifecycle:{ activeRun:experimentRun(),runMode:'simulation',start:vi.fn(),stop:vi.fn() },
    ...overrides,
  };
}

function experimentRun(
  id='experiment-run',actionId='run',panelId?:string,
):NonNullable<PanelContextActions['experimentLifecycle']['activeRun']> {
  return {
    id,targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
    automationResourceId:'069f036b-9638-4827-9524-73ff03fe99c9',actionId,runMode:'simulation',
    ...(panelId ? { panelId } : {}),
    status:'waiting',revision:7,rootRunId:id,createdAt:'t',updatedAt:'t',workflowTargets:[],
  };
}

function head(domain:string,resourceId:string) {
  return { domain,resourceId,name:resourceId,tags:[],mainCommitId:'commit-1',currentVersion:1,digest:'d'.repeat(64),revision:1,createdAt:'t',updatedAt:'t' };
}
function branch(domain:string,resourceId:string) {
  return { domain,resourceId,name:'main',headCommitId:'commit-1',headVersion:1,revision:1,createdAt:'t',updatedAt:'t' };
}

const totalRunServices = [
  { id:'roscore',callNodeId:ROS_BASIC_SERVICE_CALL_NODE_ID.roscore,childRunId:'ros-child',automationId:'roscore-automation' },
  { id:'gzserver',callNodeId:ROS_BASIC_SERVICE_CALL_NODE_ID.gzserver,childRunId:'gzs-child',automationId:'gzserver-automation' },
  { id:'gzclient',callNodeId:ROS_BASIC_SERVICE_CALL_NODE_ID.gzclient,childRunId:'gzc-child',automationId:'gzclient-automation' },
  { id:'rviz',callNodeId:ROS_BASIC_SERVICE_CALL_NODE_ID.rviz,childRunId:'rviz-child',automationId:'rviz-automation' },
  { id:'vrpn',callNodeId:ROS_BASIC_SERVICE_CALL_NODE_ID.vrpn,childRunId:'vrpn-child',automationId:'vrpn-automation' },
] as const;

function rosPlugin() {
  return definePanelPlugin({
    id:'ros-basic-services-control',name:'ROS Control',category:'Control',description:'',
    capabilities:['experiment'] as const,
    actionPorts:totalRunServices.map((service) => ({ id:service.id,label:service.id,actionKinds:['service'] as const })),
    dataPorts:[{ id:'service-health',label:'Health',contract:EXPERIMENT_PROCESS_RUNTIME_DATASOURCE }],
    component:() => null,
  });
}

function rosPanel():PanelInstance {
  return {
    id:'ros-control',pluginId:'ros-basic-services-control',title:'ROS Control',
    gridPos:{ x:0,y:0,w:10,h:5 },query:{},options:{},fieldConfig:{},
    portBindings:[
      { portId:'panel-workflow',kind:'workflow',workflowInstanceId:'worker',presetId:'start',managed:true,relation:'supervised',failurePolicy:'stop-experiment' },
      ...totalRunServices.map((service) => ({ portId:service.id,kind:'action' as const,presetId:service.id })),
      { portId:'service-health',kind:'data',projection:EXPERIMENT_PROCESS_RUNTIME_DATASOURCE },
    ],
  };
}

function rosExperiment():ExperimentDocument {
  const spec = newExperimentSpec({ name:'Experiment',runModes:['simulation'] });
  spec.workflowInstances = [{
    id:'worker',ref:{ domain:'automation',resourceId:'ros-panel',branch:'main' },
    actionPresets:[
      { id:'start',actionId:'start-for-experiment',inputs:{},parameterBindings:[] },
      ...totalRunServices.map((service) => ({
        id:service.id,actionId:service.id,inputs:{},parameterBindings:[],
      })),
    ],
  }];
  return { head:head('experiment','experiment-a'),branch:branch('experiment','experiment-a'),spec };
}

function rosControlDocument():AutomationDocument {
  const spec = newAutomationSpec('ROS Control');
  spec.actions = [
    serviceAction('start-for-experiment','called'),
    ...totalRunServices.map((service) => serviceAction(service.id,`panel-${service.id}`)),
  ];
  spec.nodes = [
    { ...newAutomationNode('trigger.automation-call',{},'Called'),id:'called' },
    ...totalRunServices.flatMap((service) => [
      { ...newAutomationNode('trigger.manual',{},service.id),id:`panel-${service.id}` },
      { ...newAutomationNode('automation.call',{},service.callNodeId),id:service.callNodeId },
    ]),
  ];
  spec.edges = totalRunServices.flatMap((service) => [
    { id:`${service.id}-panel`,from:`panel-${service.id}`,to:service.callNodeId,condition:'success' as const },
    { id:`${service.id}-called`,from:'called',to:service.callNodeId,condition:'success' as const },
  ]);
  return { head:head('automation','ros-panel'),branch:branch('automation','ros-panel'),spec };
}

function serviceAction(id:string,entryNodeId:string):AutomationAction {
  return {
    id,version:1,label:id,entryNodeId,kind:'service',
    inputSchema:{ fields:[] },resultSchema:{ fields:[] },
    controls:['stop'],admission:{},requiredCapabilities:[],projectionContracts:[],
  };
}

function rosPanelChildSummary(
  id:string,rootRunId:string,actionId:string,status:AutomationRunSummaryView['status']='waiting',
):AutomationRunSummaryView {
  return {
    id,targetId:'local',automationResourceId:'ros-panel',actionId,actionVersion:1,
    sourceKind:'automation',sourceRef:{ domain:'automation',resourceId:'ros-panel',branch:'main',commitId:'commit-ros',version:1,digest:'e'.repeat(64) },
    status,revision:1,parentRunId:rootRunId,rootRunId,
    createdAt:'2026-01-01T00:00:01Z',updatedAt:'2026-01-01T00:00:01Z',
  };
}

function rosPanelChildRun(id:string,rootRunId:string,actionId:string):AutomationRun {
  return {
    id,targetId:'local',automationResourceId:'ros-panel',definitionId:'ros-panel',definitionVersion:1,
    actionId,actionVersion:1,
    configDigest:'a'.repeat(64),executionPlanDigest:'b'.repeat(64),
    registryDigest:'c'.repeat(64),definitionDigest:'d'.repeat(64),
    executionModel:'orchestration-occurrence-v1',
    sourceKind:'automation',
    sourceRef:{ domain:'automation',resourceId:'ros-panel',branch:'main',commitId:'commit-ros',version:1,digest:'e'.repeat(64) },
    status:'waiting',revision:1,parameters:{},parentRunId:rootRunId,
    admissionMode:'parallel',admissionScope:'root',
    rootRunId,depth:1,correlationId:`correlation-${id}`,
    acceptedAt:'2026-01-01T00:00:01Z',createdAt:'2026-01-01T00:00:01Z',updatedAt:'2026-01-01T00:00:01Z',
  };
}

function rosServiceChildSummary(id:string,parentRunId:string,automationResourceId:string):AutomationRunSummaryView {
  return {
    id,targetId:'local',automationResourceId,actionId:'start-from-ros-control',actionVersion:1,
    sourceKind:'automation',sourceRef:{ domain:'automation',resourceId:automationResourceId,branch:'main',commitId:'commit-child',version:1,digest:'f'.repeat(64) },
    status:'waiting',revision:1,parentRunId,rootRunId:'full-root',
    createdAt:'2026-01-01T00:00:02Z',updatedAt:'2026-01-01T00:00:02Z',
  };
}

function rosPanelRunDetail(
  services:readonly (typeof totalRunServices)[number][] = totalRunServices,
  rootRunId='full-root',
) {
  return {
    invocations:[],nodeSummaries:[],loading:false,error:'',
    relations:{
      runId:'panel-run',
      childRuns:services.map((service,ordinal) => ({
        id:`rel-${service.callNodeId}`,targetId:'local',rootRunId,parentRunId:'panel-run',
        parentInvocationId:`invoke-${service.callNodeId}`,callNodeId:service.callNodeId,ordinal,
        childRunId:service.childRunId,ownerRunId:'panel-run',childDefinitionId:service.automationId,
        childDefinitionVersion:1,childConfigDigest:'a'.repeat(64),childExecutionPlanDigest:'b'.repeat(64),
        childRegistryDigest:'c'.repeat(64),childDefinitionDigest:'d'.repeat(64),triggerNodeId:'trigger',
        relation:'supervised' as const,waitPolicy:'wait' as const,cancelPolicy:'cascade' as const,
        resultPolicy:'propagate' as const,createdAt:'t',updatedAt:'t',boundAt:'t',
        runStatus:'waiting' as const,runRevision:1,revision:1,
      })),
      childRunGroups:[],childRunGroupMembers:[],waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
    },
  };
}
