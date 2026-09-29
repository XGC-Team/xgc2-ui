import { describe, expect, it } from 'vitest';
import {
  withWorldCameraIntrinsicSelection,
  worldCameraAuthoredPose,
  worldCameraAuthoredPoseActionInputs,
  worldCameraExtrinsicPathMatches,
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
      simulationPoseSource: 'authored',
      simulationExtrinsicFile: '',
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
      simulationPoseSource: 'authored',
      simulationExtrinsicFile: '',
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
      simulationPoseSource: 'authored',
      simulationExtrinsicFile: '',
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
      simulationPoseSource: 'authored',
      simulationExtrinsicFile: '',
    });
  });

  it('builds the timestamp YAML partition under calibrationRoot', () => {
    expect(worldCameraIntrinsicPartitionPath('/cal/camera/', 'sim', 'usb_cam'))
      .toBe('/cal/camera/sim/usb_cam');
    expect(worldCameraIntrinsicPartitionPath('', 'phy', 'usb_cam')).toBe('');
  });

  it('accepts timestamped extrinsics YAML from either camera partition',() => {
    expect(worldCameraExtrinsicPathMatches(
      '/cal/phy/usb_cam/extrinsics-20260904T021713.263963Z.yaml','/cal','usb_cam',
    )).toBe(true);
    expect(worldCameraExtrinsicPathMatches(
      '/cal/sim/usb_cam/extrinsics-20260904T021713.263963Z.yaml','/cal','usb_cam',
    )).toBe(true);
    expect(worldCameraExtrinsicPathMatches(
      '/cal/phy/usb_cam/intrinsics-20260904T021713.263963Z.yaml','/cal','usb_cam',
    )).toBe(false);
    expect(worldCameraExtrinsicPathMatches('','/cal','usb_cam')).toBe(true);
  });

  it('reads Action radians as operator degrees and writes them back',() => {
    const pose = worldCameraAuthoredPose({ x:-4,y:0,z:1.5,roll:0,pitch:Math.PI / 2,yaw:0 });
    expect(pose).toEqual({
      x:-4,y:0,z:1.5,rollDegrees:0,pitchDegrees:90,yawDegrees:0,
    });
    expect(worldCameraAuthoredPoseActionInputs(pose).pitch).toBeCloseTo(Math.PI / 2);
  });

  it('writes pose source and extrinsic file without dropping intrinsic keys',() => {
    expect(withWorldCameraIntrinsicSelection({
      simulationIntrinsicFile:'/sim/a.yaml',
      physicalIntrinsicFile:'/phy/b.yaml',
      sourceId:'world',
    }, {
      simulationIntrinsicFile:'/sim/a.yaml',
      physicalIntrinsicFile:'/phy/b.yaml',
      simulationPoseSource:'file',
      simulationExtrinsicFile:'/cal/phy/usb_cam/extrinsics-20260904T021713.263963Z.yaml',
    })).toEqual({
      simulationIntrinsicFile:'/sim/a.yaml',
      physicalIntrinsicFile:'/phy/b.yaml',
      simulationPoseSource:'file',
      simulationExtrinsicFile:'/cal/phy/usb_cam/extrinsics-20260904T021713.263963Z.yaml',
      sourceId:'world',
    });
  });
});
