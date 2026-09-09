import { describe,expect,it } from 'vitest';
import { cameraIntrinsicCalibrationPanelPlugin,gazeboWorldCameraPanelPlugin } from './manifest';

describe('camera extrinsic panel manifest',() => {
  it('exposes intrinsic YAMLs, the explicit simulation pose source, and one extrinsic YAML path',() => {
    expect(gazeboWorldCameraPanelPlugin.configExposure).toEqual({
      connections:'summary',actionDefaults:'custom',
    });
    expect(gazeboWorldCameraPanelPlugin.actionDefaultsEditor).toBeDefined();
    expect(gazeboWorldCameraPanelPlugin.sharedActionDefaults).toEqual({
      title:'Camera calibration inputs',
      fieldNames:['simulationIntrinsicFile','physicalIntrinsicFile'],
    });
    expect(gazeboWorldCameraPanelPlugin.authoringPorts).toEqual([{
      id:'workflow-parameters',label:'Camera calibration defaults',
      localizedLabel:{ 'en-US':'Camera calibration defaults','zh-CN':'相机标定默认值' },
      target:'action-preset',
    }]);
    expect(gazeboWorldCameraPanelPlugin.optionsEditor).toBeUndefined();
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
