/**
 * B2-true Robot asset kind composition fixture.
 *
 * Proves the leaf can be composed with built-in PX4/Scout/Mecanum without
 * product/profile root edits. Future product root should call the same
 * assemble pattern (see without-unitree-b2.ts for the false graph).
 *
 * Mirrors the B2-enabled product-root assembly:
 *   assembleRobotAssetKindComposition(
 *     ...builtInRobotAssetKindContributions,
 *     unitreeB2RobotAssetKindContribution,
 *   )
 */

import {
  assembleRobotAssetKindComposition,
  builtInRobotAssetKindContributions,
} from '../../src/domains/robot/robotAssetPublic';
import { unitreeB2RobotAssetKindContribution } from '../../src/domains/robot/kinds/unitree-b2';

export const robotAssetKindCompositionWithUnitreeB2 = assembleRobotAssetKindComposition(
  ...builtInRobotAssetKindContributions,
  unitreeB2RobotAssetKindContribution,
);

export { unitreeB2RobotAssetKindContribution };
