import { degreesToRadians,radiansToDegrees,type GazeboWorldCameraPose } from './gazeboWorldCameraPoseModel';
import { worldCameraIntrinsicPartitionPath,worldCameraExtrinsicPathMatches } from './gazeboWorldCameraCalibrationInputs';

export type CameraWorldOffset = { x:number;y:number;z:number };
export type ExtrinsicResultRef = { sourceMode:'sim'|'phy';fileName:string;sha256:string };
export type WorldCameraExtrinsicChoice =
  | { mode:'auto' }
  | { mode:'version';result:ExtrinsicResultRef }
  | { mode:'pose';pose:{ convention:'world_T_camera_optical';translation:[number,number,number];quaternionXyzw:[number,number,number,number];coordinates:{ schemaVersion:1;kind:'experiment-world';frame:'world';savedWorldOffset:[number,number,number] } } };

export function extrinsicSelectionField(mode:'simulation'|'physical') {
  return mode === 'simulation' ? 'simulationExtrinsicSelectionJson' : 'physicalExtrinsicSelectionJson';
}

/** Absence keeps the existing authored contract; malformed new choices never become Auto. */
export function parseWorldCameraExtrinsicChoice(value:unknown):WorldCameraExtrinsicChoice|null {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > 3072) throw new Error('The camera position setting is invalid. Choose a mode again.');
  try {
    const choice = JSON.parse(value) as WorldCameraExtrinsicChoice;
    if (choice?.mode === 'auto' && keys(choice,['mode'])) return choice;
    if (choice?.mode === 'version' && keys(choice,['mode','result'])
      && keys(choice.result,['sourceMode','fileName','sha256'])
      && ['sim','phy'].includes(choice.result.sourceMode)
      && /^extrinsics-\d{8}T\d{6}(?:\.\d+)?Z(?:-\d{2})?\.yaml$/.test(choice.result.fileName)
      && /^[a-f0-9]{64}$/.test(choice.result.sha256)) return choice;
    if (choice?.mode === 'pose' && keys(choice,['mode','pose'])
      && keys(choice.pose,['convention','translation','quaternionXyzw','coordinates'])
      && choice.pose.convention === 'world_T_camera_optical'
      && vector(choice.pose.translation,3) && vector(choice.pose.quaternionXyzw,4)
      && Math.abs(Math.hypot(...choice.pose.quaternionXyzw)-1) <= 1e-6
      && keys(choice.pose.coordinates,['schemaVersion','kind','frame','savedWorldOffset'])
      && choice.pose.coordinates.schemaVersion === 1 && choice.pose.coordinates.kind === 'experiment-world'
      && choice.pose.coordinates.frame === 'world' && vector(choice.pose.coordinates.savedWorldOffset,3)) return choice;
  } catch { /* Return one operator-facing error, without the serialized configuration. */ }
  throw new Error('The camera position setting is invalid. Choose a mode again.');
}

export function hasCameraWorldOffset(value:CameraWorldOffset|undefined):value is CameraWorldOffset {
  return !!value && [value.x,value.y,value.z].every(Number.isFinite);
}

export function manualExtrinsicChoice(pose:GazeboWorldCameraPose,offset:CameraWorldOffset):WorldCameraExtrinsicChoice {
  if (!hasCameraWorldOffset(offset) || !Object.values(pose).every(Number.isFinite)) {
    throw new Error('The experiment coordinate frame is unavailable.');
  }
  const [r,p,y] = [pose.rollDegrees,pose.pitchDegrees,pose.yawDegrees].map((angle) => degreesToRadians(angle)/2);
  const [cr,sr,cp,sp,cy,sy] = [Math.cos(r),Math.sin(r),Math.cos(p),Math.sin(p),Math.cos(y),Math.sin(y)];
  return { mode:'pose',pose:{ convention:'world_T_camera_optical',translation:[pose.x,pose.y,pose.z],
    quaternionXyzw:[sr*cp*cy-cr*sp*sy,cr*sp*cy+sr*cp*sy,cr*cp*sy-sr*sp*cy,cr*cp*cy+sr*sp*sy],
    coordinates:{ schemaVersion:1,kind:'experiment-world',frame:'world',savedWorldOffset:[offset.x,offset.y,offset.z] } } };
}

/** Present an existing manual pose in the currently edited experiment frame. */
export function manualExtrinsicPose(choice:WorldCameraExtrinsicChoice|null,offset:CameraWorldOffset):GazeboWorldCameraPose {
  if (choice?.mode !== 'pose') return { x:0,y:0,z:0,rollDegrees:0,pitchDegrees:0,yawDegrees:0 };
  const [x,y,z,w] = choice.pose.quaternionXyzw;
  const saved = choice.pose.coordinates.savedWorldOffset;
  return {
    x:choice.pose.translation[0]+offset.x-saved[0],
    y:choice.pose.translation[1]+offset.y-saved[1],
    z:choice.pose.translation[2]+offset.z-saved[2],
    rollDegrees:radiansToDegrees(Math.atan2(2*(w*x+y*z),1-2*(x*x+y*y))),
    pitchDegrees:radiansToDegrees(Math.asin(Math.max(-1,Math.min(1,2*(w*y-z*x))))),
    yawDegrees:radiansToDegrees(Math.atan2(2*(w*z+x*y),1-2*(y*y+z*z))),
  };
}

export function extrinsicResultRef(path:string,root:string,camera:string,sha256:string):ExtrinsicResultRef {
  if (!path || !worldCameraExtrinsicPathMatches(path,root,camera) || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error('This saved calibration could not be verified.');
  }
  const sourceMode = path.startsWith(`${worldCameraIntrinsicPartitionPath(root,'sim',camera)}/`) ? 'sim' : 'phy';
  return { sourceMode,fileName:path.slice(path.lastIndexOf('/')+1),sha256 };
}

function keys(value:unknown,expected:readonly string[]):boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value,key));
}
function vector(value:unknown,length:number):boolean {
  return Array.isArray(value) && value.length === length && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}
