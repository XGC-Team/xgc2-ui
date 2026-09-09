import { describe, expect, it } from 'vitest';
import {
  withWorldCameraIntrinsicSelection,
  worldCameraIntrinsicPartitionPath,
  worldCameraIntrinsicSelection,
} from './gazeboWorldCameraCalibrationInputs';

describe('worldCameraIntrinsicSelection', () => {
  it('reads flat Action-schema keys', () => {
    expect(worldCameraIntrinsicSelection({
      simulationIntrinsicFile: '/sim/a.yaml',
      physicalIntrinsicFile: '/phy/b.yaml',
      calibrationRoot: '/cal',
      cameraName: 'front',
    })).toEqual({
      simulationIntrinsicFile: '/sim/a.yaml',
      physicalIntrinsicFile: '/phy/b.yaml',
      calibrationRoot: '/cal',
      cameraName: 'front',
    });
  });

  it('does not dual-read retired nested camera bags', () => {
    expect(worldCameraIntrinsicSelection({
      simulation: {
        simulationIntrinsicFile: '/sim/nested.yaml',
        calibrationRoot: '/home/lxk/Documents/XGC/Calibration/camera',
        cameraName: 'usb_cam',
      },
      physical: {
        intrinsicFile: '/phy/nested.yaml',
        calibrationRoot: '/home/lxk/Documents/XGC/Calibration/camera',
        cameraName: 'usb_cam',
      },
    })).toEqual({
      simulationIntrinsicFile: '',
      physicalIntrinsicFile: '',
      calibrationRoot: '',
      cameraName: 'usb_cam',
    });
  });

  it('writes only flat keys and preserves unrelated Action inputs', () => {
    expect(withWorldCameraIntrinsicSelection({
      sourceId: 'camera_extrinsic',
    }, {
      simulationIntrinsicFile: '/sim/new.yaml',
      physicalIntrinsicFile: '/phy/new.yaml',
    })).toEqual({
      simulationIntrinsicFile: '/sim/new.yaml',
      physicalIntrinsicFile: '/phy/new.yaml',
      sourceId: 'camera_extrinsic',
    });
  });

  it('allows empty paths so profile defaults remain legal', () => {
    expect(withWorldCameraIntrinsicSelection({
      simulationIntrinsicFile: '/sim/old.yaml',
      physicalIntrinsicFile: '/phy/old.yaml',
    }, { simulationIntrinsicFile: '', physicalIntrinsicFile: '' })).toEqual({
      simulationIntrinsicFile: '',
      physicalIntrinsicFile: '',
    });
  });

  it('builds the timestamp YAML partition under calibrationRoot', () => {
    expect(worldCameraIntrinsicPartitionPath('/cal/camera/', 'sim', 'usb_cam'))
      .toBe('/cal/camera/sim/usb_cam');
    expect(worldCameraIntrinsicPartitionPath('', 'phy', 'usb_cam')).toBe('');
  });
});
