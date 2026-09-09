import {
  builtInRobotAssetKindComposition,
} from './builtInRobotAssetKindContributions';
import { type RobotAssetSpec } from './robotAssetContracts';
import {
  robotAssetKindContributionByProtocolKind,
  type RobotAssetKindComposition,
  type RobotAssetWireResult,
} from './robotAssetKindComposition';

const profilePattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*\.v[1-9][0-9]*$/;

export function normalizeRobotAssetSpec(
  spec: RobotAssetSpec,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): RobotAssetSpec {
  const common = {
    name: spec.name.trim(),
    description: spec.description.trim(),
    tags: normalizedStrings(spec.tags),
    profileId: spec.profileId.trim(),
  };
  const contribution = robotAssetKindContributionByProtocolKind(composition, spec.kind);
  if (!contribution) {
    // Unknown kind: only normalize base fields; leave payload as authored.
    return { ...spec, ...common, tags: common.tags };
  }
  return contribution.wire.normalize(spec as RobotAssetWireResult, common) as RobotAssetSpec;
}

export function validateRobotAssetSpec(
  spec: RobotAssetSpec,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
) {
  if (!spec.name.trim()) return 'Robot asset name is required.';
  if (!profilePattern.test(spec.profileId) || spec.profileId.length > 128) {
    return 'Robot asset requires a canonical Robot Profile ID.';
  }
  const contribution = robotAssetKindContributionByProtocolKind(composition, spec.kind);
  if (!contribution) {
    return 'Robot asset kind is not enabled in this product.';
  }
  return contribution.wire.validate(spec as RobotAssetWireResult);
}

export function validRobotProfileId(value: string) {
  return value.length <= 128 && profilePattern.test(value);
}

export function normalizeRobotNamespace(value: string) {
  const normalized = value.trim().replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}` : '';
}

function normalizedStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}
