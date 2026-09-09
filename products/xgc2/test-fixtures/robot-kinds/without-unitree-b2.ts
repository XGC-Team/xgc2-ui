/**
 * B2-false Robot asset kind composition fixture.
 *
 * Built-in Robot assets / Experiment stay available; the Unitree B2 leaf is
 * never imported. Shared hosts that resolve kinds through this composition
 * fail closed for unknown protocol kinds.
 */

import {
  assembleRobotAssetKindComposition,
  builtInRobotAssetKindComposition,
  builtInRobotAssetKindContributions,
} from '../../src/domains/robot/robotAssetPublic';

/** Explicit assemble of built-ins only (mirrors a leaf-disabled product root). */
export const robotAssetKindCompositionWithoutUnitreeB2 = assembleRobotAssetKindComposition(
  ...builtInRobotAssetKindContributions,
);

/** Canonical built-in singleton used by un-wired product hosts this turn. */
export const robotAssetKindCompositionBuiltInDefault = builtInRobotAssetKindComposition();
