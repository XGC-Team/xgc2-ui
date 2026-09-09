import {
  configurationDetailHash,
  configurationListHash,
} from '../../shared/configurationLocation';

export function robotAssetDocumentHash(resourceId: string) {
  return configurationDetailHash('robotAsset',resourceId);
}

export function robotAssetListHash() {
  return configurationListHash('robotAsset');
}
