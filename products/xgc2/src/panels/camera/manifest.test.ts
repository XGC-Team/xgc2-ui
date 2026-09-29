import { describe,expect,it } from 'vitest';
import { validatePanelInstance } from '../../domains/experiment/experimentPublic';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import { DEFAULT_LOCAL_MEDIA_EDGE_URL } from '../../config/urls';
import { cameraIntrinsicCalibrationPanelPlugin,gazeboWorldCameraPanelPlugin } from './manifest';

describe('camera extrinsic panel manifest',() => {
  it('owns both extrinsic choices and keeps current calibration inputs in the custom editor',() => {
    expect(gazeboWorldCameraPanelPlugin.configExposure).toEqual({
      connections:'summary',actionDefaults:'custom',
    });
    expect(gazeboWorldCameraPanelPlugin.actionDefaultsEditor).toBeDefined();
    expect(gazeboWorldCameraPanelPlugin.sharedActionDefaults).toEqual({
      title:'Camera calibration inputs',
      fieldNames:[
        'simulationIntrinsicFile','physicalIntrinsicFile','simulationPoseSource','simulationExtrinsicFile',
        'simulationExtrinsicSelectionJson','physicalExtrinsicSelectionJson',
        'cameraSource',
        'x','y','z','roll','pitch','yaw',
      ],
    });
    expect(gazeboWorldCameraPanelPlugin.authoringPorts).toEqual([{
      id:'workflow-parameters',label:'Camera calibration defaults',
      localizedLabel:{ 'en-US':'Camera calibration defaults','zh-CN':'相机标定默认值' },
      target:'action-preset',
    }]);
    expect(gazeboWorldCameraPanelPlugin.optionsEditor).toBeUndefined();
    expect(gazeboWorldCameraPanelPlugin.optionSchema?.iceServerUrls?.required).toBeUndefined();
    expect(gazeboWorldCameraPanelPlugin.optionSchema?.publicIPs?.required).toBeUndefined();
  });

  it('saves authored pose on a live fixture that never stored ICE in panel options', () => {
    const panel: PanelInstance = {
      id: 'gazebo-world-camera',
      pluginId: 'gazebo-world-camera',
      title: 'Gazebo world camera',
      gridPos: { x: 0, y: 0, w: 23, h: 16 },
      query: {},
      options: {
        dashboard: 'calibration',
        edgeUrl: DEFAULT_LOCAL_MEDIA_EDGE_URL,
        gridColumns: 30,
        sourceId: 'gazebo_world_camera',
        x: 7,
        y: -9,
        z: 4,
        rollDegrees: 0,
        pitchDegrees: 21.6,
        yawDegrees: 111.8,
      },
      fieldConfig: {},
      portBindings: [
        {
          portId: 'panel-workflow',
          kind: 'workflow',
          workflowInstanceId: 'panel-world-camera',
          presetId: 'start',
          managed: true,
          relation: 'supervised',
          failurePolicy: 'keep-experiment',
        },
        { portId: 'video', kind: 'data', projection: 'experiment.runtime.v1' },
        { portId: 'calibration', kind: 'data', projection: 'camera.calibration.extrinsic.v1' },
        { portId: 'camera-service', kind: 'action', presetId: 'start' },
        { portId: 'workflow-parameters', kind: 'authoring', presetId: 'start', target: 'action-preset' },
      ],
    };
    expect(validatePanelInstance(panel, gazeboWorldCameraPanelPlugin)).toEqual({ valid: true });
  });
});

describe('camera intrinsic panel manifest',() => {
  it('declares the action-preset authoring port persisted by Experiment fixtures',() => {
    expect(cameraIntrinsicCalibrationPanelPlugin.authoringPorts).toEqual([{
      id:'workflow-parameters',label:'Calibration defaults',
      localizedLabel:{ 'en-US':'Calibration defaults','zh-CN':'标定默认参数' },
      target:'action-preset',
    }]);
  });
});
