export const gazeboObstacleModels = [
  { id: 'xgc2_geom_cube',label: 'Cube' },
  { id: 'xgc2_geom_cuboid',label: 'Cuboid' },
  { id: 'xgc2_geom_sphere',label: 'Sphere' },
  { id: 'xgc2_geom_cylinder',label: 'Cylinder' },
  { id: 'xgc2_geom_capped_pillar',label: 'Capped pillar' },
  { id: 'xgc2_geom_l_block',label: 'L block' },
  { id: 'xgc2_geom_t_block',label: 'T block' },
  { id: 'xgc2_geom_arch',label: 'Arch' },
  { id: 'xgc2_geom_dumbbell',label: 'Dumbbell' },
  { id: 'xgc2_geom_stairs',label: 'Stairs' },
] as const;

export const gazeboSceneActions = [
  { id: 'spawn',label: 'Place',systemKey: 'gazebo-obstacles.spawn' },
  { id: 'move',label: 'Move',systemKey: 'gazebo-obstacles.move' },
  { id: 'clear',label: 'Clear',systemKey: 'gazebo-obstacles.clear' },
] as const;

export type GazeboSceneAction = (typeof gazeboSceneActions)[number]['id'];
export type GazeboObstacleModel = (typeof gazeboObstacleModels)[number]['id'];
export type GazeboObstaclePose = { x: number;y: number;z: number;roll: number;pitch: number;yaw: number };
export type GazeboObstacleDraft = GazeboObstaclePose & { name: string;model: GazeboObstacleModel };

export const defaultGazeboObstacleDraft: GazeboObstacleDraft = {
  name: 'obstacle_01',
  model: 'xgc2_geom_cube',
  x: 0,
  y: 0,
  z: 0,
  roll: 0,
  pitch: 0,
  yaw: 0,
};

export function gazeboObstacleDraftError(draft: GazeboObstacleDraft) {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(draft.name)) {
    return 'Name must begin with a letter and contain only letters, numbers, and underscores.';
  }
  if (!gazeboObstacleModels.some((model) => model.id === draft.model)) return 'Select a trusted obstacle model.';
  for (const key of ['x','y','z','roll','pitch','yaw'] as const) {
    if (!Number.isFinite(draft[key])) return `${key.toUpperCase()} must be a number.`;
  }
  if (Math.abs(draft.x) > 10_000 || Math.abs(draft.y) > 10_000 || draft.z < -1_000 || draft.z > 10_000) {
    return 'Position is outside the supported Gazebo world range.';
  }
  if (Math.abs(draft.roll) > Math.PI * 2 || Math.abs(draft.pitch) > Math.PI * 2 || Math.abs(draft.yaw) > Math.PI * 2) {
    return 'Rotation must stay between -2π and 2π radians.';
  }
  return '';
}

export function gazeboSceneRunParameters(draft: GazeboObstacleDraft, actionId: Exclude<GazeboSceneAction,'clear'>) {
  return {
    name: draft.name,
    ...(actionId === 'spawn' ? { model: draft.model } : {}),
    x: draft.x,
    y: draft.y,
    z: draft.z,
    roll: draft.roll,
    pitch: draft.pitch,
    yaw: draft.yaw,
  };
}
