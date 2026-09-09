// @vitest-environment jsdom

import { describe,expect,it } from 'vitest';
import {
  CAMERA_INTRINSIC_PANEL_DEFAULTS,
  validateCameraIntrinsicPanelOptions,
  validateCameraIntrinsicPanelOptionsIssue,
} from './cameraIntrinsicPanelModel';

describe('cameraIntrinsicPanelModel', () => {
  it('keeps only the Panel-owned media endpoint identity', () => {
    expect(validateCameraIntrinsicPanelOptions(CAMERA_INTRINSIC_PANEL_DEFAULTS)).toBe('');
    expect(validateCameraIntrinsicPanelOptions({
      ...CAMERA_INTRINSIC_PANEL_DEFAULTS,edgeUrl:'http://192.0.2.10',
    })).toContain('explicit control port');
    expect(validateCameraIntrinsicPanelOptions({
      ...CAMERA_INTRINSIC_PANEL_DEFAULTS,sourceId:'not a source id',
    })).toContain('stable Media Edge source ID');
    expect(validateCameraIntrinsicPanelOptionsIssue({
      ...CAMERA_INTRINSIC_PANEL_DEFAULTS,edgeUrl:'http://192.0.2.10',
    })).toEqual({ code:'media-edge-explicit-port-required' });
    expect(validateCameraIntrinsicPanelOptionsIssue({
      ...CAMERA_INTRINSIC_PANEL_DEFAULTS,sourceId:'not a source id',
    })).toEqual({ code:'calibration-camera-source-id-invalid' });
  });
});
