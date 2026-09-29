import { describe,expect,it } from 'vitest';
import { decodeExperimentDocument } from './experimentDocumentDecoder';
import { EXPERIMENT_SCHEMA_VERSION,normalizeExperimentSpec,PANEL_SCHEMA_VERSION } from './experimentModel';
import { robotAssetKindCompositionWithUnitreeB2 } from '../../../test-fixtures/robot-kinds/with-unitree-b2';
import { robotAssetKindCompositionWithoutUnitreeB2 } from '../../../test-fixtures/robot-kinds/without-unitree-b2';

describe('decodeExperimentDocument v15',() => {
  it('decodes ordinary run modes, expression presets, and Panel v4 workflow ownership',() => {
    const decoded = decodeExperimentDocument(documentValue());
    expect(decoded.spec.schemaVersion).toBe(EXPERIMENT_SCHEMA_VERSION);
    expect(decoded.spec.runModes).toEqual(['night-field','simulation']);
    expect(decoded.spec.localizationOffset).toEqual({ x:1.25,y:-2.5,z:0.75 });
    expect(decoded.spec.workflowInstances[0]?.actionPresets[0]).toEqual({
      id:'default',actionId:'start',inputs:{ world:'empty.world' },
      parameterBindings:[{
        target:'/world',expression:'{{ $run.parameters.world }}',language:'xgc-expression-v2',
      }],
    });
    expect(decoded.spec.dashboards[0]?.panels[0]?.portBindings).toEqual([
      { portId:'panel-workflow',kind:'workflow',workflowInstanceId:'simulation',presetId:'default',managed:true,relation:'supervised',failurePolicy:'keep-experiment' },
      { portId:'start',kind:'action',presetId:'default' },
      { portId:'robots',kind:'data',projection:'experiment.robots.v1' },
    ]);
  });

  it.each([
    {
      hostKind: 'station',
      placement: 'centralized',
      worldHost: { kind: 'station' },
      robotHost: { kind: 'agent',agentId: 'robot-agent' },
    },
    {
      hostKind: 'environment',
      placement: 'per-robot',
      worldHost: { kind: 'environment',slotId: 'px4-01' },
      robotHost: { kind: 'station' },
    },
    {
      hostKind: 'agent',
      placement: 'per-robot',
      worldHost: { kind: 'agent',agentId: 'world-agent' },
      robotHost: { kind: 'environment',slotId: 'px4-01' },
    },
  ])('round-trips current $hostKind host references, Scene and arbitrary parameters',({ placement,worldHost,robotHost }) => {
    const value = documentValue() as unknown as Record<string,unknown>;
    const spec = value.spec as Record<string,unknown>;
    const robot = robotBindingWire({ simpleLidar:true });
    robot.executionHost = robotHost;
    spec.robots = [robot];
    const scene = {
      asset:'campus-yard',
      simulator:'gazebo',
      parameters:{
        overrideWorldPhysicsTiming:false,
        maxStepSize:0.004,
        extension:{ values:[null,1,'kept'] },
      },
    };
    spec.deployment = { placement,worldHost };
    spec.scene = scene;

    const decoded = decodeExperimentDocument(value);
    expect(decoded.spec.deployment).toEqual({ placement,worldHost });
    expect(decoded.spec.robots[0]?.executionHost).toEqual(robotHost);
    expect(decoded.spec.scene).toEqual(scene);

    const normalized = normalizeExperimentSpec(decoded.spec);
    const reread = decodeExperimentDocument({ ...decoded,spec:normalized });
    expect(reread.spec).toEqual(decoded.spec);
  });

  it('keeps omitted deployment and scene omitted through normalize and reread',() => {
    const decoded = decodeExperimentDocument(documentValue());
    expect(decoded.spec).not.toHaveProperty('deployment');
    expect(decoded.spec).not.toHaveProperty('scene');

    const reread = decodeExperimentDocument({
      ...decoded,
      spec:normalizeExperimentSpec(decoded.spec),
    });
    expect(reread.spec).not.toHaveProperty('deployment');
    expect(reread.spec).not.toHaveProperty('scene');
  });

  it('keeps deployment, Scene and execution-host validation strict',() => {
    const unresolved = documentValue() as unknown as Record<string,unknown>;
    (unresolved.spec as Record<string,unknown>).deployment = {
      placement:'per-robot',worldHost:{ kind:'environment',slotId:'missing-slot' },
    };
    expect(() => decodeExperimentDocument(unresolved)).toThrow(/not declared in this Experiment/);

    const invalidHost = documentValue() as unknown as Record<string,unknown>;
    const invalidSpec = invalidHost.spec as Record<string,unknown>;
    invalidSpec.deployment = { placement:'centralized',worldHost:{ kind:'station' } };
    const robot = robotBindingWire();
    robot.executionHost = { kind:'station',address:'192.0.2.10' };
    invalidSpec.robots = [robot];
    expect(() => decodeExperimentDocument(invalidHost)).toThrow(/Station host contains only kind/);

    const unknownSceneField = documentValue() as unknown as Record<string,unknown>;
    (unknownSceneField.spec as Record<string,unknown>).scene = {
      asset:'campus-yard',simulator:'gazebo',unexpected:'rejected',
    };
    expect(() => decodeExperimentDocument(unknownSceneField)).toThrow(/unknown field "unexpected"/);
  });

  it.each([
    ['bindings'],['runBindings'],['workflowSlots'],['parameterSchema'],['planRef'],
  ])('rejects retired root field %s',(field) => {
    const value = documentValue() as unknown as Record<string,unknown>;
    (value.spec as Record<string,unknown>)[field] = {};
    expect(() => decodeExperimentDocument(value)).toThrow(/unknown field/);
  });

  it('preserves canonical System Experiment identity for catalog protection and visibility',() => {
    const value = documentValue() as unknown as Record<string,unknown>;
    (value.head as Record<string,unknown>).system = true;
    expect(decodeExperimentDocument(value).head.system).toBe(true);
  });

  it('decodes an omitted false managed flag as the canonical false value',() => {
    const value = documentValue() as unknown as Record<string,unknown>;
    const spec = value.spec as Record<string,unknown>;
    const dashboard = (spec.dashboards as Array<Record<string,unknown>>)[0]!;
    const panel = (dashboard.panels as Array<Record<string,unknown>>)[0]!;
    const workflow = (panel.portBindings as Array<Record<string,unknown>>)[0]!;
    delete workflow.managed;

    const binding = decodeExperimentDocument(value).spec.dashboards[0]?.panels[0]?.portBindings[0];
    expect(binding).toMatchObject({ kind:'workflow',managed:false });
  });

  it('defaults omitted simple lidar to false and round-trips an explicit true value',() => {
    const legacy = documentValue();
    (legacy.spec as { robots: unknown[] }).robots = [robotBindingWire()];
    expect(decodeExperimentDocument(legacy).spec.robots[0]?.simulationSensors)
      .toEqual({ simpleLidar:false });

    const enabled = documentValue();
    (enabled.spec as { robots: unknown[] }).robots = [robotBindingWire({ simpleLidar:true })];
    const decoded = decodeExperimentDocument(enabled);
    expect(decoded.spec.robots[0]?.simulationSensors).toEqual({ simpleLidar:true });

    const saved = { ...decoded,spec:normalizeExperimentSpec(decoded.spec) };
    expect(decodeExperimentDocument(saved).spec.robots[0]?.simulationSensors)
      .toEqual({ simpleLidar:true });
  });

  it.each(['compositionProfile','processPlacements','lifecycle','startupPresetId','runModeOverlays','dependsOn'])('rejects retired v13 field %s',(field) => {
    const value = documentValue() as unknown as Record<string,unknown>;
    const spec = value.spec as Record<string,unknown>;
    if (field === 'compositionProfile' || field === 'processPlacements') spec[field] = [];
    else (spec.workflowInstances as Array<Record<string,unknown>>)[0]![field] = [];
    expect(() => decodeExperimentDocument(value)).toThrow(/unknown field/);
  });

  it.each(['session','standalone'])('decodes explicit %s routing and preserves old omission',(executionMode) => {
    const value = documentValue();const spec = value.spec;
    spec.workflowInstances[0]!.actionPresets.push({ ...spec.workflowInstances[0]!.actionPresets[0]!,id:'archive' });
    spec.workflowInstances[0]!.actionPresets.sort((left,right) => left.id.localeCompare(right.id));
    Object.assign(spec.dashboards[0]!.panels[0]!.portBindings[1]!,{ presetId:'archive',executionMode });
    expect(decodeExperimentDocument(value).spec.dashboards[0]!.panels[0]!.portBindings[1]).toEqual({ portId:'start',kind:'action',presetId:'archive',executionMode });
    expect(decodeExperimentDocument(documentValue()).spec.dashboards[0]!.panels[0]!.portBindings[1]).not.toHaveProperty('executionMode');
  });
  it.each(['detached','Standalone','',null,42])('rejects invalid Action executionMode %s',(executionMode) => {
    const value = documentValue();Object.assign(value.spec.dashboards[0]!.panels[0]!.portBindings[1]!,{ executionMode });
    expect(() => decodeExperimentDocument(value)).toThrow(/executionMode/);
  });
  it('rejects standalone primary and mixed routes at the strict read boundary',() => {
    const value = documentValue();const bindings = value.spec.dashboards[0]!.panels[0]!.portBindings;
    Object.assign(bindings[1]!,{ executionMode:'standalone' });
    expect(() => decodeExperimentDocument(value)).toThrow(/primary workflow/);
    value.spec.workflowInstances[0]!.actionPresets.push({ ...value.spec.workflowInstances[0]!.actionPresets[0]!,id:'archive' });
    Object.assign(bindings[1]!,{ presetId:'archive' });bindings.push({ portId:'alias',kind:'action',presetId:'archive' });
    expect(() => decodeExperimentDocument(value)).toThrow(/same execution mode/);
  });
  it('rejects Panel v1 payload and untyped bindings',() => {
    const value = documentValue() as unknown as Record<string,unknown>;
    const spec = value.spec as Record<string,unknown>;
    const dashboards = spec.dashboards as Array<Record<string,unknown>>;
    const panels = dashboards[0]!.panels as Array<Record<string,unknown>>;
    const panel = panels[0]!;
    delete panel.view;delete panel.portBindings;
    panel.payload = { query:{},options:{},fieldConfig:{},bindings:[] };
    expect(() => decodeExperimentDocument(value)).toThrow(/unknown field|missing required field/);
  });

  it('decodes a contributed Robot binding marker only when its leaf is composed',() => {
    const value = documentValue() as unknown as Record<string,unknown>;
    const spec = value.spec as Record<string,unknown>;
    spec.robots = [{
      id:'b2-01',
      ref:{ domain:'robot',resourceId:'robot-b2',branch:'main' },
      namespace:'/b21',
      hybridSource:'physical',
      runtimeParameters:{},
      initialPose:{ x:0,y:0,z:0.55,yaw:0 },
      unitreeB2:{},
    }];

    expect(
      decodeExperimentDocument(value, robotAssetKindCompositionWithUnitreeB2)
        .spec.robots[0]?.unitreeB2,
    ).toEqual({});
    expect(() => decodeExperimentDocument(
      value,
      robotAssetKindCompositionWithoutUnitreeB2,
    )).toThrow(/unknown field/);
  });
});

function documentValue() {
  const now = '2026-01-01T00:00:00Z';
  return {
    head:{ domain:'experiment',resourceId:'experiment-a',name:'Experiment A',tags:[],mainCommitId:'commit-1',currentVersion:1,digest:'d'.repeat(64),revision:1,createdAt:now,updatedAt:now },
    branch:{ domain:'experiment',resourceId:'experiment-a',name:'main',headCommitId:'commit-1',headVersion:1,revision:1,createdAt:now,updatedAt:now },
    spec:{
      schemaVersion:EXPERIMENT_SCHEMA_VERSION,
      name:'Experiment A',description:'',tags:[],runModes:['night-field','simulation'],
      worldBoundary:null,localizationOffset:{ x:1.25,y:-2.5,z:0.75 },robots:[],
      workflowInstances:[{
        id:'simulation',ref:{ domain:'automation',resourceId:'simulation',branch:'main' },
        executionTargetId:'agent-simulation',
        actionPresets:[{ id:'default',actionId:'start',inputs:{ world:'empty.world' },parameterBindings:[{
          target:'/world',expression:'{{ $run.parameters.world }}',language:'xgc-expression-v2',
        }] }],
      }],
      dashboards:[{ id:'gcs',name:'GCS',description:'',panels:[{
        schemaVersion:PANEL_SCHEMA_VERSION,id:'control',pluginId:'automation-workflow-control',title:'Control',
        grid:{ x:0,y:0,w:6,h:4 },view:{ query:{},options:{},fieldConfig:{} },
        portBindings:[
          { portId:'panel-workflow',kind:'workflow',workflowInstanceId:'simulation',presetId:'default',managed:true,relation:'supervised',failurePolicy:'keep-experiment' },
          { portId:'start',kind:'action',presetId:'default' },
          { portId:'robots',kind:'data',projection:'experiment.robots.v1' },
        ],
      }] }],
    },
  };
}

function robotBindingWire(simulationSensors?: Record<string,unknown>): Record<string,unknown> {
  return {
    id:'px4-01',
    ref:{ domain:'robot',resourceId:'robot-1',branch:'main' },
    namespace:'/uav1',
    hybridSource:'physical',
    runtimeParameters:{},
    initialPose:{ x:0,y:0,z:0,yaw:0 },
    ...(simulationSensors === undefined ? {} : { simulationSensors }),
    px4:{},
  };
}
