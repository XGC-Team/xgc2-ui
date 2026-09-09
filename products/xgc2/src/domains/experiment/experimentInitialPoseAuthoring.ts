import { canonicalJSON } from '../../shared/canonicalJson';
import type { ExperimentRobotBinding } from './experimentModel';

/** Next-start pose edits may not carry any live Robot or roster changes. */
export function experimentRobotBindingsChangeOnlyInitialPose(
  current: readonly ExperimentRobotBinding[],
  next: readonly ExperimentRobotBinding[],
) {
  if (current.length !== next.length) return false;
  let changed = false;
  const valid = current.every((binding,index) => {
    const candidate = next[index];
    if (!candidate) return false;
    const pose = candidate.initialPose;
    if (![pose.x,pose.y,pose.z,pose.yaw].every(Number.isFinite)) return false;
    if (
      binding.initialPose.x !== pose.x
      || binding.initialPose.y !== pose.y
      || binding.initialPose.z !== pose.z
      || binding.initialPose.yaw !== pose.yaw
    ) changed = true;
    return canonicalJSON(binding) === canonicalJSON({
      ...candidate,
      initialPose:{ ...pose,...binding.initialPose },
    });
  });
  return valid && changed;
}
