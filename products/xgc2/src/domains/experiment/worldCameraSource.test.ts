import { describe,expect,it } from 'vitest';
import { newExperimentSpec,type ExperimentDocument } from './experimentModel';
import {
  applyWorldCameraSourceSelection,
  effectiveWorldCameraPixelSource,
  REPLAY_SCENE_LOCKED_REASON,
  worldCameraSourceSelection,
} from './worldCameraSource';

describe('worldCameraSourceSelection',() => {
  it('returns only cameraSource and defaults a missing or unknown source to auto',() => {
    expect(worldCameraSourceSelection({})).toEqual({ cameraSource:'auto' });
    expect(worldCameraSourceSelection({ cameraSource:'lidar',scene:{ mediaFile:'/scene/still.jpg' } }))
      .toEqual({ cameraSource:'auto' });
  });
  it('preserves an explicit replay source without inferring it from scene media',() => {
    expect(worldCameraSourceSelection({ cameraSource:'replay',scene:{ mediaFile:'/scene/still.jpg' } }))
      .toEqual({ cameraSource:'replay' });
  });
});

describe('effectiveWorldCameraPixelSource truth table',() => {
  it.each([
    // auto follows the current runMode mapping.
    ['auto','simulation','simulation'],
    ['auto','physical','physical'],
    ['auto','hybrid','physical'],
    // Explicit choices win over runMode.
    ['simulation','simulation','simulation'],
    ['simulation','physical','simulation'],
    ['simulation','hybrid','simulation'],
    ['physical','simulation','physical'],
    ['physical','physical','physical'],
    ['physical','hybrid','physical'],
    // Replay pixels follow the physical topic group and AR projection rules.
    ['replay','simulation','physical'],
    ['replay','physical','physical'],
    ['replay','hybrid','physical'],
  ] as const)('cameraSource=%s runMode=%s → %s',(cameraSource,runMode,expected) => {
    expect(effectiveWorldCameraPixelSource(experiment({ cameraSource }),runMode)).toBe(expected);
  });

  it('maps a missing world camera preset through the runMode default',() => {
    const bare = experiment();
    bare.spec.workflowInstances = [];
    expect(effectiveWorldCameraPixelSource(bare,'simulation')).toBe('simulation');
    expect(effectiveWorldCameraPixelSource(bare,'physical')).toBe('physical');
    expect(effectiveWorldCameraPixelSource(bare,'hybrid')).toBe('physical');
    expect(effectiveWorldCameraPixelSource(undefined,'simulation')).toBe('simulation');
    expect(effectiveWorldCameraPixelSource(undefined,'hybrid')).toBe('physical');
  });

  it('fails closed on an unknown runMode regardless of the preset',() => {
    expect(effectiveWorldCameraPixelSource(experiment({ cameraSource:'auto' }),'unknown')).toBeUndefined();
    expect(effectiveWorldCameraPixelSource(undefined,'unknown')).toBeUndefined();
    expect(effectiveWorldCameraPixelSource(undefined,'')).toBeUndefined();
  });
});

describe('REPLAY_SCENE_LOCKED_REASON',() => {
  it('remains available to the Lichtblick frozen scene bridge',() => {
    expect(REPLAY_SCENE_LOCKED_REASON).toBe('Scene geometry is read-only for this Run: it comes from a native Gazebo world or has no Experiment copy to edit.');
  });
});

describe('applyWorldCameraSourceSelection',() => {
  it.each(['auto','simulation','physical','replay'] as const)(
    'updates only the camera and existing Lichtblick source for %s', (cameraSource) => {
      const instances = experiment({ cameraSource:'auto',calibrationRoot:'/cal' }).spec.workflowInstances;
      instances.push({
        id:'panel-lichtblick',
        ref:{ domain:'automation',resourceId:'lichtblick',branch:'main' },
        actionPresets:[{
          id:'start',actionId:'start-for-experiment',parameterBindings:[],
          inputs:{ runMode:'simulation',sceneNamespace:'/xgc/scene',cameraSource:'auto' },
        }],
      });
      instances.push({
        id:'panel-scene',
        ref:{ domain:'automation',resourceId:'scene',branch:'main' },
        actionPresets:[{
          id:'scene',actionId:'scene',parameterBindings:[],
          inputs:{
            sceneSource:'asset',sceneFile:'/scenes/yard/scene-document.yaml',
            mediaFile:'/scenes/yard/camera.jpg',calibrationFile:'/scenes/yard/calibration.yaml',
          },
        }],
      });
      instances.push({
        id:'panel-ros-control',
        ref:{ domain:'automation',resourceId:'ros-control',branch:'main' },
        actionPresets:[{
          id:'gzserver',actionId:'gzserver',parameterBindings:[],
          inputs:{ gazeboWorld:'/opt/xgc2/worlds/scene_editable.world',worldBoundary:'keep' },
        }],
      });
      const sceneInputs = { ...instances[2]!.actionPresets[0]!.inputs };
      const worldInputs = { ...instances[3]!.actionPresets[0]!.inputs };
      const nextInputs = {
        ...instances[0]!.actionPresets[0]!.inputs,
        cameraSource,
        simulationIntrinsicFile:'/cal/sim/usb_cam/intrinsics.yaml',
      };

      const next = applyWorldCameraSourceSelection(instances,'panel-world-camera','start',nextInputs);

      expect(next[0]!.actionPresets[0]!.inputs).toEqual(nextInputs);
      expect(next[1]!.actionPresets[0]!.inputs).toEqual({
        runMode:'simulation',sceneNamespace:'/xgc/scene',cameraSource,
      });
      expect(next[2]!.actionPresets[0]!.inputs).toEqual(sceneInputs);
      expect(next[3]!.actionPresets[0]!.inputs).toEqual(worldInputs);
      expect(next[2]).toBe(instances[2]);
      expect(next[3]).toBe(instances[3]);
    },
  );

  it('defaults an unknown source without inferring replay from a scene photo',() => {
    const instances = experiment({ cameraSource:'auto' }).spec.workflowInstances;
    instances.push({
      id:'panel-scene',
      ref:{ domain:'automation',resourceId:'scene',branch:'main' },
      actionPresets:[{
        id:'scene',actionId:'scene',parameterBindings:[],
        inputs:{ mediaFile:'/scenes/yard/camera.jpg',calibrationFile:'/scenes/yard/calibration.yaml' },
      }],
    });
    const scenePreset = instances[1]!.actionPresets[0];
    const nextInputs = { ...instances[0]!.actionPresets[0]!.inputs,cameraSource:'unknown' };
    const next = applyWorldCameraSourceSelection(instances,'panel-world-camera','start',{
      ...nextInputs,
    });
    expect(next[0]!.actionPresets[0]!.inputs).toEqual({
      ...nextInputs,cameraSource:'auto',
    });
    expect(next[1]!.actionPresets[0]).toBe(scenePreset);
  });
});

function experiment(inputs: Record<string,unknown> = {}): ExperimentDocument {
  const spec = newExperimentSpec({ name:'World camera' });
  spec.workflowInstances = [{
    id:'panel-world-camera',
    ref:{ domain:'automation',resourceId:'world-camera',branch:'main' },
    actionPresets:[{
      id:'start',actionId:'start-for-experiment',
      inputs:{ cameraProfile:'world_wide_4k30_110',...inputs },
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
