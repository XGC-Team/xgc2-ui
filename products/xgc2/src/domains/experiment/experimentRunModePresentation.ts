import type { ExperimentRobotBinding } from './experimentModel';

export const EXPERIMENT_ROBOT_COMPOSITION_MIXED = 'mixed';

/**
 * Per-robot `(sim)` is a hybrid-session partition label.
 * Simulation / physical Sessions unify every provider and must not paint
 * authored hybridSource onto the instrument.
 */
export function experimentRobotSimulationSourceMark(
  runMode: string | undefined,
  hybridSource: string | undefined,
) {
  return runMode === 'hybrid' && hybridSource === 'simulation';
}

/**
 * Mixed is a presentation summary of the explicit Hybrid Experiment Run. Pure modes
 * override the authored partition and therefore never render as mixed.
 */
export function experimentRobotComposition(
  runMode: string,
  robots: readonly Pick<ExperimentRobotBinding,'hybridSource'>[],
): typeof EXPERIMENT_ROBOT_COMPOSITION_MIXED | undefined {
  if (runMode !== 'hybrid') return undefined;

  let hasPhysical = false;
  let hasSimulation = false;
  for (const robot of robots) {
    if (robot.hybridSource === 'physical') hasPhysical = true;
    if (robot.hybridSource === 'simulation') hasSimulation = true;
    if (hasPhysical && hasSimulation) return EXPERIMENT_ROBOT_COMPOSITION_MIXED;
  }
  return undefined;
}
