// @vitest-environment jsdom

import { describe,expect,it } from 'vitest';
import { localMediaEdgeURLForPort } from '../../config/urls';
import {
  GAZEBO_WORLD_CAMERA_DEFAULTS,
  gazeboWorldCameraRunParameters,
  validateGazeboWorldCameraOptions,
  validateGazeboWorldCameraOptionsIssue,
  worldCameraIntrinsicFileField,
} from './gazeboWorldCameraPanelModel';

describe('gazeboWorldCameraPanelModel', () => {
  it('selects the runMode-owned intrinsic YAML field', () => {
    expect(worldCameraIntrinsicFileField('simulation')).toBe('simulationIntrinsicFile');
    expect(worldCameraIntrinsicFileField('physical')).toBe('physicalIntrinsicFile');
    expect(worldCameraIntrinsicFileField('hybrid')).toBe('physicalIntrinsicFile');
    expect(worldCameraIntrinsicFileField('')).toBe('');
  });

  it('validates view defaults and maps them into Action-port inputs', () => {
    expect(validateGazeboWorldCameraOptions(GAZEBO_WORLD_CAMERA_DEFAULTS)).toBe('');
    const defaultParameters = gazeboWorldCameraRunParameters(
      GAZEBO_WORLD_CAMERA_DEFAULTS,
      window.location.origin,
    );
    expect(defaultParameters.yaw).toBeCloseTo(Math.atan2(
      -GAZEBO_WORLD_CAMERA_DEFAULTS.y,
      -GAZEBO_WORLD_CAMERA_DEFAULTS.x,
    ));
    expect(defaultParameters.pitch).toBeCloseTo(Math.atan2(
      GAZEBO_WORLD_CAMERA_DEFAULTS.z,
      Math.hypot(GAZEBO_WORLD_CAMERA_DEFAULTS.x, GAZEBO_WORLD_CAMERA_DEFAULTS.y),
    ));
    expect(validateGazeboWorldCameraOptions({
      ...GAZEBO_WORLD_CAMERA_DEFAULTS,edgeUrl: 'http://edge.example',
    })).toContain('explicit control port');
    expect(validateGazeboWorldCameraOptions({
      ...GAZEBO_WORLD_CAMERA_DEFAULTS,edgeUrl: 'https://edge.example:18443',
    })).toContain('must use HTTP');
    expect(validateGazeboWorldCameraOptionsIssue({
      ...GAZEBO_WORLD_CAMERA_DEFAULTS,x:Number.NaN,
    })).toEqual({ code:'world-coordinate-out-of-range',args:{ axis:'X' } });
    expect(validateGazeboWorldCameraOptionsIssue({
      ...GAZEBO_WORLD_CAMERA_DEFAULTS,edgeUrl:'https://edge.example:18443',
    })).toEqual({ code:'managed-direct-media-edge-http-required' });
    expect(validateGazeboWorldCameraOptionsIssue({
      ...GAZEBO_WORLD_CAMERA_DEFAULTS,sourceId:'not a source',
    })).toEqual({ code:'world-camera-source-id-invalid' });

    const parameters = gazeboWorldCameraRunParameters({
      ...GAZEBO_WORLD_CAMERA_DEFAULTS,
      rollDegrees: 90,pitchDegrees: -45,yawDegrees: 180,
      edgeUrl: 'http://192.0.2.20:18095',
    }, 'https://station.example:8443');
    expect(parameters).toMatchObject({
      controlPort: 18095,
      mediaEdgeAddress: localMediaEdgeURLForPort(18095),
      allowedOrigins: 'https://station.example:8443',
    });
    expect(parameters.roll).toBeCloseTo(Math.PI / 2);
    expect(parameters.pitch).toBeCloseTo(-Math.PI / 4);
    expect(parameters.yaw).toBeCloseTo(Math.PI);
  });
});
