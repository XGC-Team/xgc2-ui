import { describe,expect,it,vi } from 'vitest';
import { newExperimentSpec,type ExperimentDocument } from '../experimentModel';
import { createExperimentWorkflowPresetActions } from './experimentWorkflowPresetActions';

describe('createExperimentWorkflowPresetActions',() => {
  it.each([false,true])('blocks System preset authoring with dashboardEditing=%s',async (dashboardEditing) => {
    const current = experiment();
    current.head.system = true;
    const save = vi.fn(async (value: ExperimentDocument) => value);
    const applyDraft = vi.fn();
    const actions = createExperimentWorkflowPresetActions({
      getRendered:() => current,runtimeActive:false,dashboardEditing,save,applyDraft,
    });
    expect(actions.disabledReason()).toBe('This Experiment is read only.');
    await expect(actions.updatePresetInputs('panel-world-camera','start',{},'commit-1'))
      .rejects.toThrow('This Experiment is read only.');
    expect(save).not.toHaveBeenCalled();
    expect(applyDraft).not.toHaveBeenCalled();
  });

  it('saves camera intrinsic YAML onto the Panel workflow preset',async () => {
    let current = experiment();
    const save = vi.fn(async (value: ExperimentDocument) => {
      current = value;
      return value;
    });
    const actions = createExperimentWorkflowPresetActions({
      getRendered: () => current,
      rememberSaved: (saved) => { current = saved; },
      runtimeActive: false,
      dashboardEditing: false,
      save,
    });
    await actions.updatePresetInputs(
      'panel-world-camera','start',
      { simulationIntrinsicFile:'/calibration/sim/usb_cam/intrinsics-new.yaml' },
      'commit-1',
    );
    expect(save).toHaveBeenCalledOnce();
    expect(current.spec.workflowInstances[0]?.actionPresets[0]?.inputs).toEqual({
      simulationIntrinsicFile:'/calibration/sim/usb_cam/intrinsics-new.yaml',
      physicalIntrinsicFile:'/calibration/phy/usb_cam/intrinsics-old.yaml',
      controlPort:28090,
    });
  });

  it('applies intrinsic YAML to the Edit draft instead of saving immediately',async () => {
    const current = experiment();
    const save = vi.fn(async (value: ExperimentDocument) => value);
    const applyDraft = vi.fn();
    const actions = createExperimentWorkflowPresetActions({
      getRendered: () => current,
      runtimeActive: false,
      dashboardEditing: true,
      save,
      applyDraft,
    });
    await actions.updatePresetInputs(
      'panel-world-camera','start',
      { physicalIntrinsicFile:'/calibration/phy/usb_cam/intrinsics-new.yaml' },
      'commit-1',
    );
    expect(save).not.toHaveBeenCalled();
    expect(applyDraft.mock.calls[0]?.[0].spec.workflowInstances[0]?.actionPresets[0]?.inputs.physicalIntrinsicFile)
      .toBe('/calibration/phy/usb_cam/intrinsics-new.yaml');
  });

  it('refuses camera intrinsic changes while the Experiment is running',async () => {
    const actions = createExperimentWorkflowPresetActions({
      getRendered: () => experiment(),
      runtimeActive: true,
      dashboardEditing: false,
      save: vi.fn(async (value: ExperimentDocument) => value),
    });
    await expect(actions.updatePresetInputs(
      'panel-world-camera','start',
      { simulationIntrinsicFile:'/calibration/sim/usb_cam/intrinsics-new.yaml' },
      'commit-1',
    )).rejects.toThrow('Stop the Experiment before changing camera intrinsics.');
  });
});

function experiment(): ExperimentDocument {
  const spec = newExperimentSpec({ name:'World camera' });
  spec.workflowInstances = [{
    id:'panel-world-camera',
    ref:{ domain:'automation',resourceId:'world-camera',branch:'main' },
    actionPresets:[{
      id:'start',actionId:'start-for-experiment',
      inputs:{
        simulationIntrinsicFile:'/calibration/sim/usb_cam/intrinsics-old.yaml',
        physicalIntrinsicFile:'/calibration/phy/usb_cam/intrinsics-old.yaml',
        controlPort:28090,
      },
      parameterBindings:[],
    }],
  }];
  const now = '2026-01-01T00:00:00Z';
  return {
    head:{
      domain:'experiment',resourceId:'experiment-a',name:'World camera',tags:[],
      mainCommitId:'commit-1',currentVersion:1,digest:'d'.repeat(64),revision:1,createdAt:now,updatedAt:now,
    },
    branch:{
      domain:'experiment',resourceId:'experiment-a',name:'main',headCommitId:'commit-1',
      headVersion:1,revision:1,createdAt:now,updatedAt:now,
    },
    spec,
  };
}
