import { describe,expect,it } from 'vitest';
import { isCameraCalibrationTeardownError } from './cameraCalibrationTeardownError';

describe('camera calibration teardown errors',() => {
  it('recognizes trusted WebUI 409, 404, and SSE conflict races',() => {
    expect(isCameraCalibrationTeardownError(
      new Error('409 Conflict: trusted WebUI is not running and ready'),
    )).toBe(true);
    expect(isCameraCalibrationTeardownError(
      new Error('event stream failed: 409'),
    )).toBe(true);
    expect(isCameraCalibrationTeardownError({ status:404,message:'missing' })).toBe(true);
    expect(isCameraCalibrationTeardownError(
      new Error('automatic sweep could not detect the calibration board'),
    )).toBe(false);
  });
});
