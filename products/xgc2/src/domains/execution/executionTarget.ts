import type { CoreNode } from '../core/corePublic';
import { isLocalCore } from '../../shared/utils/controlPlane';

export function selectedExecutionTargetId({
  managedHostId,
  selectedTargetCore,
}: {
  managedHostId?: string;
  selectedTargetCore?: CoreNode;
}) {
  if (managedHostId?.trim() && managedHostId.trim() !== 'local') return managedHostId.trim();
  if (selectedTargetCore && !isLocalCore(selectedTargetCore)) return executionTargetKeyForCore(selectedTargetCore.id);
  return 'local';
}

export function executionTargetKeyForCore(coreId?: string) {
  const id = coreId?.trim();
  return id ? `core:${id}` : 'local';
}
