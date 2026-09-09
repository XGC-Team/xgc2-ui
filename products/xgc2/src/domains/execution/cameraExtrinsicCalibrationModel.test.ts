import { describe,expect,it } from 'vitest';
import type { CameraExtrinsicPoint,CameraExtrinsicState } from './cameraExtrinsicCalibrationService';
import { cameraExtrinsicSolvePreflight } from './cameraExtrinsicCalibrationModel';

describe('cameraExtrinsicSolvePreflight', () => {
  it('rejects a collinear selection before calling the ROS solver', () => {
    const state = frozenState();
    const reason = cameraExtrinsicSolvePreflight(state, points('uav1','uav2','uav3','uav4'));

    expect(reason).toMatch(/selected robot poses are collinear/);
  });

  it('accepts non-collinear correspondences without classifying marker names', () => {
    const state = frozenState();
    expect(cameraExtrinsicSolvePreflight(state, points('uav1','uav4','uav5','uav6'))).toBe('');
  });

  it('accepts a geometrically valid selection with only one marker from another named group', () => {
    const state = frozenState();
    expect(cameraExtrinsicSolvePreflight(state, points('uav1','uav2','uav3','ugv1'))).toBe('');
  });
});

function points(...markers: string[]): CameraExtrinsicPoint[] {
  return markers.map((marker,index) => ({ marker,pixel: [index * 10,index * 10] }));
}

function frozenState(): CameraExtrinsicState {
  const positions: Record<string,readonly [number,number,number]> = {
    uav1: [0,2,0.05],uav2: [2,2,0.05],uav3: [4,2,0.05],uav4: [6,2,0.05],
    uav5: [0,-2,0.18],uav6: [6,-2,0.18],
    ugv1: [0,-2,0.18],ugv4: [6,-2,0.18],
  };
  return {
    resultRestored:false,
    mode: 'frozen',generation: 1,outputFile: '/tmp/extrinsics.yaml',parentFrame: 'world',childFrame: 'camera',
    source: {
      imageTopic: '/camera/image',intrinsicFile: '/camera/sim/usb_cam/intrinsics-20260830T010203.000000Z.yaml',posePrefix: '/vrpn',
      imageReady: true,intrinsicReady: true,markerCount: 5,markerNames: Object.keys(positions),
    },
    frame: { stampSec: 1,frameId: 'camera',width: 1280,height: 720 },
    markers: Object.entries(positions).map(([name,position]) => ({ name,position })),
  };
}
