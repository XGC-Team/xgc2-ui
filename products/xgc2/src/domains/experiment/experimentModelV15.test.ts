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
