/**
 * Generic robot-asset admission surface for Experiment and projection callers.
 *
 * Production Experiment code must use these helpers only — never kind-name
 * branches for optional leaf robots. Kind-specific flags live on composed
 * contributions; unknown/inactive kinds fail closed.
 */

import {
  builtInRobotAssetKindComposition,
} from './builtInRobotAssetKindContributions';
import {
  robotAssetProtocolKind,
  type RobotAssetDocument,
  type RobotAssetSpec,
} from './robotAssetContracts';
import {
  robotAssetKindAdmissionForProtocolKind,
  type RobotAssetKindComposition,
  type RobotKindAdmission,
} from './robotAssetKindComposition';

export type { RobotKindAdmission };
export {
  EXPERIMENT_CAPABLE_ROBOT_ADMISSION,
  UNKNOWN_ROBOT_KIND_ADMISSION,
} from './robotAssetKindComposition';

type RobotAssetCarrier = RobotAssetSpec | RobotAssetDocument;

/** Resolve typed admission metadata for one robot asset or spec. */
export function robotAssetAdmission(
  value: RobotAssetCarrier,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): RobotKindAdmission {
  return robotAssetKindAdmissionForProtocolKind(composition, robotAssetProtocolKind(value));
}

/**
 * Empty string when the robot may be bound into Experiment authoring;
 * otherwise an operator-facing refusal reason from the owning contribution
 * (or generic fail-closed copy when the kind is inactive / unknown).
 */
export function robotAssetExperimentDisabledReason(
  value: RobotAssetCarrier,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): string {
  const admission = robotAssetAdmission(value, composition);
  return admission.experimentBinding ? '' : admission.experimentDisabledReason;
}

/** Whether this asset may be projected into Experiment runtime state. */
export function robotAssetAllowsExperimentProjection(
  value: RobotAssetCarrier,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): boolean {
  return robotAssetAdmission(value, composition).experimentProjection;
}

/**
 * Fail closed when a caller attempts to project an asset-only or unknown robot
 * into Experiment runtime. Throws the contribution-owned refusal string.
 */
export function assertRobotAssetExperimentProjection(
  value: RobotAssetCarrier,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): void {
  const admission = robotAssetAdmission(value, composition);
  if (!admission.experimentProjection) {
    throw new Error(admission.experimentProjectionRefusal);
  }
}

/** Whether this asset has a simulation product (model selector / sim launch). */
export function robotAssetAllowsSimulation(
  value: RobotAssetCarrier,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): boolean {
  return robotAssetAdmission(value, composition).simulation;
}
