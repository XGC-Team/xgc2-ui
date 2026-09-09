import { request, type ApiTargetOptions } from '../../api/http';
import { configurationCollection } from '../../shared/configurationTransport';
import type { UsernodeAssetDocument } from './usernodeContractsPublic';
import { decodeUsernodeAssetDocument } from './usernodeDocumentDecoder';

export function listUsernodeAssets(
  signal?: AbortSignal,
  options?: ApiTargetOptions,
): Promise<UsernodeAssetDocument[]> {
  return configurationCollection<unknown>(
    request<unknown>('/usernode-assets', { signal }, options),
    '/usernode-assets',
  ).then((documents) => documents.map(decodeUsernodeAssetDocument));
}
