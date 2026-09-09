// @vitest-environment jsdom

import { describe,expect,it } from 'vitest';
import {
  gazeboWorldCameraPoseParameters,
  validateGazeboWorldCameraPose,
  validateGazeboWorldCameraPoseIssue,
} from './gazeboWorldCameraPoseModel';

describe('gazeboWorldCameraPoseModel', () => {
  it('converts degree-based panel pose into one fixed-model Gazebo request', () => {
    const parameters = gazeboWorldCameraPoseParameters({
      x:8,y:2,z:3,rollDegrees:0,pitchDegrees:0,yawDegrees:90,
    });
    expect(parameters.request.model_state).toMatchObject({
      model_name:'gazebo_world_camera',
      pose:{ position:{ x:8,y:2,z:3 } },
      twist:{
        linear:{ x:0,y:0,z:0 },
        angular:{ x:0,y:0,z:0 },
      },
      reference_frame:'world',
    });
    expect(parameters.request.model_state.pose.orientation).toMatchObject({
      x:0,y:0,z:expect.closeTo(Math.SQRT1_2),w:expect.closeTo(Math.SQRT1_2),
    });
    expect(validateGazeboWorldCameraPose({
      x:Number.NaN,y:0,z:0,rollDegrees:0,pitchDegrees:0,yawDegrees:0,
    })).toContain('World X');
    expect(validateGazeboWorldCameraPoseIssue({
      x:0,y:0,z:0,rollDegrees:0,pitchDegrees:361,yawDegrees:0,
    })).toEqual({ code:'world-angle-out-of-range',args:{ angle:'Pitch' } });
  });
});
