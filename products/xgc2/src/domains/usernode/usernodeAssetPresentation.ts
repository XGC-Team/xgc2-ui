import type { UsernodeAssetDocument } from './usernodeContractsPublic';

export function usernodeAssetMessage(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  return /\b409\b|revision conflict|branch head|commit conflict/i.test(message)
    ? 'This user script changed elsewhere. Review the latest version and try again.'
    : message.replace(/\bNamespaces\b/g, 'Folders').replace(/\bnamespaces\b/g, 'folders');
}

/** Catalog/rail one-liner: interpreter (and ROS target). Never schema leftovers. */
export function usernodeAssetSummary(asset: UsernodeAssetDocument) {
  const { interpreter,package: rosPackage,executable,launchFile } = asset.spec;
  if (interpreter === 'rosrun' && rosPackage && executable) {
    return `${interpreter} · ${rosPackage}/${executable}`;
  }
  if (interpreter === 'roslaunch' && rosPackage && launchFile) {
    return `${interpreter} · ${rosPackage}/${launchFile}`;
  }
  return interpreter;
}
