/**
 * Core product-root ownership of Robot asset kind composition.
 *
 * Real Core roots statically import the Unitree B2 leaf and inject the composed
 * graph via RobotAssetKindCompositionProvider. Shared Robot / Experiment / panel
 * hosts never import this module or the B2 leaf.
 */

import { ProductWebEntry as GenericProductWebEntry } from '../src/app/ProductWebEntry';
import type { ProductWebComposition } from '../src/shared/productWebComposition';
import {
  assembleRobotAssetKindComposition,
  builtInRobotAssetKindContributions,
  RobotAssetKindCompositionProvider,
} from '../src/domains/robot/robotAssetPublic';
import {
  UNITREE_B2_ADMISSION,
  type RobotKindAdmission,
} from '../src/domains/robot/kinds/unitree-b2/capabilities';
import { unitreeB2RobotAssetKindContribution } from '../src/domains/robot/kinds/unitree-b2';

/** Build metadata owner for Robot.UnitreeB2.Asset (B2-true Core roots only). */
export const coreRobotUnitreeB2Owner = 'Robot.UnitreeB2.Asset';

export const coreRobotUnitreeB2ModulePrefixes = {
  [coreRobotUnitreeB2Owner]: ['src/domains/robot/kinds/unitree-b2/'],
} as const;

/**
 * Explicit Core-root admission contract for Unitree B2, sourced from the leaf
 * capabilities entrypoint (not the contribution barrel alone).
 */
export const coreRobotUnitreeB2Admission: RobotKindAdmission = UNITREE_B2_ADMISSION;

/** Static B2-true robot-kind composition selected by real Core products. */
export const coreRobotAssetKindComposition = assembleRobotAssetKindComposition(
  ...builtInRobotAssetKindContributions,
  unitreeB2RobotAssetKindContribution,
);

if (unitreeB2RobotAssetKindContribution.admission !== coreRobotUnitreeB2Admission) {
  throw new Error(
    'Core Robot.UnitreeB2.Asset admission from capabilities must match the composed contribution admission.',
  );
}

/**
 * Profile ABI ProductWebEntry accepted by src/main.tsx.
 * Wraps the generic entry so the entire application tree receives the Core
 * robot-kind composition (built-ins + Unitree B2).
 */
export function ProductWebEntry({ composition }: { composition: ProductWebComposition }) {
  return (
    <RobotAssetKindCompositionProvider composition={coreRobotAssetKindComposition}>
      <GenericProductWebEntry composition={composition} />
    </RobotAssetKindCompositionProvider>
  );
}
