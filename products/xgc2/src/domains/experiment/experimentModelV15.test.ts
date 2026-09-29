import { describe,expect,it } from 'vitest';

import {
  EXPERIMENT_SCHEMA_VERSION,
  newExperimentSpec,
  normalizeExperimentSpec,
  validateExperimentSpec,
} from './experimentModel';

describe('Experiment v15 authoring contract',() => {
  it('keeps ordinary canonical run-mode strings and creates one workflow per default Panel',() => {
    const spec = newExperimentSpec({ name:'Night field',runModes:['night-field','simulation'] });

    expect(spec.schemaVersion).toBe(EXPERIMENT_SCHEMA_VERSION);
    expect(spec.runModes).toEqual(['night-field','simulation']);
    expect(spec.localizationOffset).toEqual({ x:0,y:0,z:0 });
    expect(spec).not.toHaveProperty('compositionProfile');
    expect(spec).not.toHaveProperty('processPlacements');
    expect(spec.workflowInstances[0]?.actionPresets[0]?.parameterBindings).toEqual([{
      target:'/runMode',expression:'{{ $run.parameters.runMode }}',language:'xgc-expression-v2',
    }]);
    expect(validateExperimentSpec(spec)).toBe('');
  });

  it.each([' night-field','bad mode','1field','field/one',`${'a'.repeat(65)}`])(
    'rejects non-canonical run mode %s',
    (runMode) => expect(validateExperimentSpec(newExperimentSpec({ name:'Invalid',runModes:[runMode] })))
      .toContain('Run mode'),
  );

  it('keeps one finite Experiment localization offset',() => {
    const spec = newExperimentSpec({
      name:'Offset',localizationOffset:{ x:1.25,y:-2.5,z:0.75 },
    });
    expect(normalizeExperimentSpec(spec).localizationOffset).toEqual({ x:1.25,y:-2.5,z:0.75 });
    spec.localizationOffset.x = Number.NaN;
    expect(validateExperimentSpec(spec)).toContain('Localization offset');
  });

  it('preserves an optional authored scene and deep-copies its parameters',() => {
    const scene = {
      asset:'warehouse',
      simulator:'gazebo',
      parameters:{ physics:{ gravity:[0,0,-9.81] } },
    };
    const created = newExperimentSpec({ name:'Scene',scene });
    scene.parameters.physics.gravity[0] = 99;
    expect(created.scene?.parameters).toEqual({ physics:{ gravity:[0,0,-9.81] } });

    const normalized = normalizeExperimentSpec(created);
    (created.scene!.parameters!.physics as { gravity:number[] }).gravity[1] = 88;
    expect(normalized.scene?.parameters).toEqual({ physics:{ gravity:[0,0,-9.81] } });

    const withoutScene = normalizeExperimentSpec(newExperimentSpec({ name:'No scene' }));
    expect(withoutScene.scene).toBeUndefined();
  });

  it('normalizes and sorts Action preset expression bindings',() => {
    const spec = newExperimentSpec({ name:'Bindings' });
    const preset = spec.workflowInstances[0]!.actionPresets[0]!;
    preset.parameterBindings = [
      { target:' /z ',expression:' {{ $run.parameters.z }} ',language:'xgc-expression-v2' },
      { target:' /a ',expression:' {{ $run.parameters.a }} ',language:'xgc-expression-v2' },
    ];

    expect(normalizeExperimentSpec(spec).workflowInstances[0]?.actionPresets[0]?.parameterBindings)
      .toEqual([
        { target:'/a',expression:'{{ $run.parameters.a }}',language:'xgc-expression-v2' },
        { target:'/z',expression:'{{ $run.parameters.z }}',language:'xgc-expression-v2' },
      ]);
  });

  it('requires every Panel Action to resolve through that Panel own workflow',() => {
    const spec = newExperimentSpec({ name:'Ownership' });
    spec.dashboards[0]!.panels[0]!.portBindings.push({
      portId:'extra-action',kind:'action',presetId:'missing-other-workflow-preset',
    });

    expect(validateExperimentSpec(spec)).toContain('exported by its Panel Workflow');
  });

  it('preserves explicit modes and old omission through normalization',() => {
    const spec = newExperimentSpec({ name:'Independent actions' });
    const owner = spec.workflowInstances.find((instance) => instance.id === 'panel-robot-assets')!;
    owner.actionPresets.push({ id:'archive',actionId:'archive',inputs:{},parameterBindings:[] });
    const panel = spec.dashboards[0]!.panels[0]!;
    panel.portBindings.push({ portId:'archive',kind:'action',presetId:'archive',executionMode:'standalone' });
    expect(validateExperimentSpec(normalizeExperimentSpec(spec))).toBe('');
    expect(normalizeExperimentSpec(spec).dashboards[0]!.panels[0]!.portBindings.at(-1)).toEqual(panel.portBindings.at(-1));
    const old = newExperimentSpec({ name:'Old' });
    expect(normalizeExperimentSpec(old).dashboards).toEqual(old.dashboards);
    const binding = panel.portBindings.at(-1)!;if (binding.kind !== 'action') throw new Error('test fixture');
    binding.executionMode = 'session';
    expect(normalizeExperimentSpec(spec).dashboards[0]!.panels[0]!.portBindings.at(-1)).toHaveProperty('executionMode','session');
  });
  it('rejects primary standalone, mixed routing and unknown modes',() => {
    const spec = newExperimentSpec({ name:'Independent actions' });
    spec.workflowInstances.find((instance) => instance.id === 'panel-robot-assets')!.actionPresets.push({ id:'archive',actionId:'archive',inputs:{},parameterBindings:[] });
    const panel = spec.dashboards[0]!.panels[0]!;
    panel.portBindings.push({ portId:'archive-a',kind:'action',presetId:'run',executionMode:'standalone' });
    expect(validateExperimentSpec(spec)).toContain('primary workflow');
    const binding = panel.portBindings.at(-1)!;if (binding.kind !== 'action') throw new Error('test fixture');
    binding.presetId = 'archive';panel.portBindings.push({ portId:'archive-b',kind:'action',presetId:'archive' });
    expect(validateExperimentSpec(spec)).toContain('same execution mode');
    panel.portBindings.pop();Object.assign(binding,{ executionMode:null });
    expect(validateExperimentSpec(normalizeExperimentSpec(spec))).toContain('valid Action execution mode');
  });
  it('keeps one top-level Panel Workflow while allowing multiple Action bindings',() => {
    const spec = newExperimentSpec({ name:'Dynamic Actions' });
    const panel = spec.dashboards[0]!.panels[0]!;
    const workflow = spec.workflowInstances.find((instance) => instance.id === 'panel-robot-assets')!;
    workflow.actionPresets.push({ id:'formation',actionId:'run',inputs:{},parameterBindings:[] });
    panel.portBindings.push({ portId:'action-formation',kind:'action',presetId:'formation' });

    expect(panel.portBindings.filter((binding) => binding.kind === 'workflow')).toHaveLength(1);
    expect(validateExperimentSpec(spec)).toBe('');
  });
});
