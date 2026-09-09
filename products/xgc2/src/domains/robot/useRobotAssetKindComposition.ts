/**
 * React hook resolving the active Robot asset kind composition.
 * Falls back to the built-in-only composition when no provider is mounted
 * for products that intentionally expose only built-in kinds.
 */

import { builtInRobotAssetKindComposition } from './builtInRobotAssetKindContributions';
import {
  useOptionalRobotAssetKindComposition,
  type RobotAssetKindComposition,
} from './robotAssetKindComposition';

export function useRobotAssetKindComposition(): RobotAssetKindComposition {
  return useOptionalRobotAssetKindComposition() ?? builtInRobotAssetKindComposition();
}
