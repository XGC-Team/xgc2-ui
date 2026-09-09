export type ControlRobotBinding = {
  id: string;
  px4?: unknown;
  scout?: unknown;
  mecanum?: unknown;
};

/**
 * Remote control is explicit: it follows the Experiment-wide instrument
 * selection and never turns an empty selection into a fleet broadcast. Kind
 * markers are the Experiment binding contract, so contributed/unknown robots
 * cannot accidentally receive a generic motion intent.
 */
export function robotIdsForRemoteControl(
  selected: readonly string[],
  robots: readonly ControlRobotBinding[],
): string[] {
  const compatibleById = new Map(robots
    .filter(isRemoteControlCompatible)
    .map((robot) => [robot.id,robot]));
  return selected.filter((id) => compatibleById.has(id));
}

export function remoteControlSelectionRefusal(
  selected: readonly string[],
  robots: readonly ControlRobotBinding[],
): string {
  if (selected.length === 0) {
    return 'Select at least one Scout, Mecanum, or PX4 robot in Robot instruments.';
  }
  const knownById = new Map(robots.map((robot) => [robot.id,robot]));
  const knownSelected = selected.flatMap((id) => {
    const robot = knownById.get(id);
    return robot ? [robot] : [];
  });
  if (knownSelected.length === 0) {
    return 'The selected robots are no longer available in this Experiment.';
  }
  if (!knownSelected.some(isRemoteControlCompatible)) {
    return 'Remote control supports Scout, Mecanum, and PX4 robots.';
  }
  return '';
}

function isRemoteControlCompatible(robot: ControlRobotBinding) {
  return robot.scout !== undefined || robot.mecanum !== undefined || robot.px4 !== undefined;
}
