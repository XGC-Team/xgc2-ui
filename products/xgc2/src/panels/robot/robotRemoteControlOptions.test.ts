import { describe,expect,it } from 'vitest';
import {
  robotRemoteSpringReturn,
  withRobotRemoteSpringReturn,
} from './robotRemoteControlOptions';

describe('robot remote control options',() => {
  it('defaults spring return off when the panel option is absent',() => {
    expect(robotRemoteSpringReturn(undefined)).toBe(false);
    expect(robotRemoteSpringReturn({ dashboard:'gcs' })).toBe(false);
    expect(robotRemoteSpringReturn({ dashboard:'gcs',springReturn:false })).toBe(false);
    expect(robotRemoteSpringReturn({ dashboard:'gcs',springReturn:true })).toBe(true);
  });

  it('omits the option when spring return is turned off',() => {
    expect(withRobotRemoteSpringReturn({ dashboard:'gcs',springReturn:true },false))
      .toEqual({ dashboard:'gcs' });
    expect(withRobotRemoteSpringReturn({ dashboard:'gcs' },true))
      .toEqual({ dashboard:'gcs',springReturn:true });
  });
});
