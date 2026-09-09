import {
  isPX4RobotAsset,
  px4RobotModelId,
  robotAssetKindLabel,
  robotAssetOverviewAttributes,
  type RobotAssetDocument,
  type RobotAssetKindComposition,
} from '../../domains/robot/robotAssetPublic';

export function normalizeRobotAssetsSearchQuery(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function textMatchesRobotAssetsQuery(query: string, parts: readonly unknown[]): boolean {
  if (!query) return true;
  return parts.some((part) => {
    if (part == null || part === '') return false;
    return String(part).toLocaleLowerCase().includes(query);
  });
}

function robotAssetSearchParts(
  asset: RobotAssetDocument,
  composition: RobotAssetKindComposition,
): string[] {
  const overview = robotAssetOverviewAttributes(asset, composition);
  const modelId = isPX4RobotAsset(asset) ? px4RobotModelId(asset.spec) : '';
  return [
    asset.spec.name,
    asset.head.name,
    asset.head.resourceId,
    asset.spec.kind,
    robotAssetKindLabel(asset, composition),
    asset.spec.profileId,
    asset.spec.description,
    modelId,
    ...asset.spec.tags,
    ...overview.flatMap((row) => [row.id, row.label, row.value]),
  ].filter((part) => part !== '');
}

export function robotAssetMatchesQuery(
  asset: RobotAssetDocument,
  query: string,
  composition: RobotAssetKindComposition,
): boolean {
  return textMatchesRobotAssetsQuery(query, robotAssetSearchParts(asset, composition));
}
