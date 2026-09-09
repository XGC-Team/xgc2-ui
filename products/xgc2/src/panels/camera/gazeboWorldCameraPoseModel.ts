import {
  cameraValidationIssueMessage,
  type CameraValidationIssue,
} from './cameraValidationIssue';

export type GazeboWorldCameraPose = {
  x: number;
  y: number;
  z: number;
  rollDegrees: number;
  pitchDegrees: number;
  yawDegrees: number;
};

export function validateGazeboWorldCameraPose(pose: GazeboWorldCameraPose) {
  const issue = validateGazeboWorldCameraPoseIssue(pose);
  return issue ? cameraValidationIssueMessage(issue) : '';
}

export function validateGazeboWorldCameraPoseIssue(
  pose: GazeboWorldCameraPose,
): CameraValidationIssue | undefined {
  for (const [name,value] of Object.entries({ x:pose.x,y:pose.y,z:pose.z })) {
    if (!inRange(value, -100000, 100000)) {
      return {
        code:'world-coordinate-out-of-range',
        args:{ axis:name.toUpperCase() as 'X' | 'Y' | 'Z' },
      };
    }
  }
  for (const [name,value] of Object.entries({
    roll:pose.rollDegrees,pitch:pose.pitchDegrees,yaw:pose.yawDegrees,
  })) {
    if (!inRange(value, -360, 360)) {
      return {
        code:'world-angle-out-of-range',
        args:{ angle:title(name) as 'Roll' | 'Pitch' | 'Yaw' },
      };
    }
  }
  return undefined;
}

export function gazeboWorldCameraPoseParameters(pose: GazeboWorldCameraPose) {
  const issue=validateGazeboWorldCameraPoseIssue(pose);
  if (issue) throw new Error(cameraValidationIssueMessage(issue));
  const orientation = quaternionFromRPY(
    degreesToRadians(pose.rollDegrees),
    degreesToRadians(pose.pitchDegrees),
    degreesToRadians(pose.yawDegrees),
  );
  return {
    request:{
      model_state:{
        model_name:'gazebo_world_camera',
        pose:{ position:{ x:pose.x,y:pose.y,z:pose.z },orientation },
        twist:{
          linear:{ x:0,y:0,z:0 },
          angular:{ x:0,y:0,z:0 },
        },
        reference_frame:'world',
      },
    },
  };
}

function quaternionFromRPY(roll: number,pitch: number,yaw: number) {
  const cr = Math.cos(roll / 2);
  const sr = Math.sin(roll / 2);
  const cp = Math.cos(pitch / 2);
  const sp = Math.sin(pitch / 2);
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  return {
    x:sr * cp * cy - cr * sp * sy,
    y:cr * sp * cy + sr * cp * sy,
    z:cr * cp * sy - sr * sp * cy,
    w:cr * cp * cy + sr * sp * sy,
  };
}

function inRange(value: number,minimum: number,maximum: number) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function degreesToRadians(value: number) {
  return value * Math.PI / 180;
}

function title(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
